import { NextRequest, NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { rebuildQueueForUser } from "@/lib/notificationQueue";
import { calculateNextDue, generateRoutineInstances } from "@/lib/scheduler";
import { Routine } from "@/lib/types";
import { toZonedTime } from "date-fns-tz";
import { format } from "date-fns";

// Initialize Firebase Admin (Singleton)
if (getApps().length === 0) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccount) {
        try {
            initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
        } catch (e) {
            console.warn("Failed to parse service account, fallback to projectId");
            initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
        }
    } else {
        initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
    }
}

const db = getFirestore();

/**
 * POST /api/cron/rebuild-queue
 *
 * Daily schedule generation endpoint. Called once per day (e.g., at midnight UTC)
 * by cron-job.org. For each user:
 *   1. Generate routine instances for today (if not already generated)
 *   2. Process repeat templates that need next occurrences
 *   3. Rebuild the notification_queue for the next 48 hours
 *
 * Uses a per-user lastRebuildDate lock to prevent duplicate rebuilds.
 */
export async function POST(request: NextRequest) {
    // Auth
    const authHeader = request.headers.get("authorization");
    const validSecret = process.env.CRON_SECRET;
    const { searchParams } = new URL(request.url);
    const queryKey = searchParams.get("key");

    const isBearerValid = authHeader === `Bearer ${validSecret}`;
    const isQueryValid = queryKey === validSecret;

    if (!validSecret || (!isBearerValid && !isQueryValid)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const now = new Date();
        const todayStr = format(now, "yyyy-MM-dd");

        // Get all users
        const usersSnap = await db.collection("users").get();
        if (usersSnap.empty) {
            return NextResponse.json({ success: true, message: "No users" });
        }

        const results: any[] = [];

        for (const userDoc of usersSnap.docs) {
            const uid = userDoc.id;
            const userData = userDoc.data();
            const userTimezone = userData.timezone || "UTC";

            // ── Per-user rebuild lock (transaction-based) ──
            const metaRef = db.collection("users").doc(uid).collection("meta").doc("queueState");
            const shouldRebuild = await db.runTransaction(async (tx) => {
                const metaDoc = await tx.get(metaRef);
                const lastRebuild = metaDoc.exists ? metaDoc.data()?.lastRebuildDate : null;

                if (lastRebuild === todayStr) {
                    return false; // Already rebuilt today
                }

                tx.set(metaRef, { lastRebuildDate: todayStr, rebuiltAt: now }, { merge: true });
                return true;
            });

            if (!shouldRebuild) {
                results.push({ uid, skipped: true, reason: "already rebuilt today" });
                continue;
            }

            // ── Step 1: Process routines (generate today's reminders) ──
            let routinesGenerated = 0;
            try {
                const routinesSnap = await db.collection("users").doc(uid).collection("routines")
                    .where("active", "==", true).get();

                if (!routinesSnap.empty) {
                    const batch = db.batch();
                    for (const rDoc of routinesSnap.docs) {
                        const routine = rDoc.data() as Routine;
                        const localDate = toZonedTime(now, routine.timezone || userTimezone);
                        const dateStr = format(localDate, "yyyy-MM-dd");

                        // Skip if already ran today
                        if (routine.lastRun) {
                            const lastRunLocal = toZonedTime(routine.lastRun.toDate(), routine.timezone || userTimezone);
                            if (format(lastRunLocal, "yyyy-MM-dd") === dateStr) continue;
                        }

                        const newReminders = generateRoutineInstances(routine, localDate);
                        if (newReminders.length > 0) {
                            const remindersRef = db.collection(`users/${uid}/reminders`);
                            for (const r of newReminders) {
                                const ref = remindersRef.doc();
                                const dueAtDate = r.due_at ? r.due_at.toDate() : new Date();
                                batch.set(ref, {
                                    ...r,
                                    due_at: dueAtDate,
                                    created_at: new Date(),
                                    updated_at: new Date(),
                                    rootId: routine.id,
                                    routineId: routine.id,
                                });
                            }
                            batch.update(rDoc.ref, { lastRun: new Date() });
                            routinesGenerated += newReminders.length;
                        }
                    }
                    if (routinesGenerated > 0) await batch.commit();
                }
            } catch (e: any) {
                console.error(`Routine generation failed for ${uid}:`, e.message);
            }

            // ── Step 2: Process repeats (generate next occurrences within horizon) ──
            let repeatsGenerated = 0;
            try {
                const futureWindow = new Date(now.getTime() + 48 * 60 * 60 * 1000);
                const remindersRef = db.collection("users").doc(uid).collection("reminders");
                const pendingRepeats = await remindersRef.where("generationStatus", "==", "pending").get();

                if (!pendingRepeats.empty) {
                    const batch = db.batch();
                    for (const rDoc of pendingRepeats.docs) {
                        const reminder = rDoc.data() as any;
                        if (!reminder.repeatRule) continue;

                        const nextDueParam = calculateNextDue(reminder.repeatRule, reminder.due_at);
                        if (!nextDueParam) {
                            batch.update(rDoc.ref, { generationStatus: "created" });
                            continue;
                        }

                        const nextDueDate = nextDueParam.toDate();
                        if (nextDueDate <= futureWindow) {
                            const { Timestamp } = await import("firebase-admin/firestore");
                            const newRef = remindersRef.doc();
                            const ts = Timestamp.now();

                            const nextReminder = {
                                ...reminder,
                                due_at: nextDueParam,
                                status: "pending",
                                notifications: (reminder.notifications || []).map((n: any) => ({ ...n, sent: false })),
                                originId: rDoc.id,
                                rootId: reminder.rootId || rDoc.id,
                                generationStatus: "pending",
                                created_at: ts,
                                updated_at: ts,
                            };
                            delete nextReminder.id;

                            batch.set(newRef, nextReminder);
                            batch.update(rDoc.ref, { generationStatus: "created" });
                            repeatsGenerated++;
                        }
                    }
                    if (repeatsGenerated > 0) await batch.commit();
                }
            } catch (e: any) {
                console.error(`Repeat generation failed for ${uid}:`, e.message);
            }

            // ── Step 3: Rebuild notification queue for next 48 hours ──
            let queueResult = { queued: 0, remindersScanned: 0 };
            try {
                queueResult = await rebuildQueueForUser(uid, 48);
            } catch (e: any) {
                console.error(`Queue rebuild failed for ${uid}:`, e.message);
            }

            results.push({
                uid,
                routinesGenerated,
                repeatsGenerated,
                queueItemsCreated: queueResult.queued,
                remindersScanned: queueResult.remindersScanned,
            });
        }

        return NextResponse.json({
            success: true,
            timestamp: now.toISOString(),
            date: todayStr,
            results,
        });
    } catch (error: any) {
        console.error("Rebuild Queue Fatal Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Also support GET for easy cron-job.org testing
export async function GET(request: NextRequest) {
    return POST(request);
}
