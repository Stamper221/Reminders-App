import { NextRequest, NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { Routine } from "@/lib/types";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { format, getDay, addDays } from "date-fns";
import { syncQueueForReminder } from "@/lib/notificationQueue";
import crypto from "crypto";

if (getApps().length === 0) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccount) {
        try {
            initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
        } catch (e) {
            initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
        }
    } else {
        initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
    }
}

const db = getFirestore();

/**
 * Deterministic doc ID for a routine-generated reminder.
 * Format: hash of "routineId:stepId:YYYY-MM-DD"
 * This prevents duplicates when the same routine is re-enabled multiple times.
 */
function deterministicId(routineId: string, stepId: string, dateStr: string): string {
    const raw = `${routineId}:${stepId}:${dateStr}`;
    return crypto.createHash("sha256").update(raw).digest("hex").substring(0, 20);
}

/**
 * POST /api/routines/[id]/run
 *
 * "Enable catch-up" endpoint: generates reminders for the current 24-hour window.
 * Only creates reminders whose due_at is still in the future (no past times).
 * Uses deterministic document IDs to prevent duplicates.
 * Also syncs notification queue items for each created reminder.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id: routineId } = await params;

    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.split("Bearer ")[1];
    let uid: string;
    try {
        const decoded = await getAuth().verifyIdToken(token);
        uid = decoded.uid;
    } catch (e) {
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    try {
        const routineRef = db.doc(`users/${uid}/routines/${routineId}`);
        const docSnap = await routineRef.get();

        if (!docSnap.exists) {
            return NextResponse.json({ error: "Routine not found" }, { status: 404 });
        }

        const routine = { ...docSnap.data(), id: routineId } as Routine;
        const timezone = routine.timezone || "UTC";
        const now = new Date();
        const localNow = toZonedTime(now, timezone);
        const todayStr = format(localNow, "yyyy-MM-dd");

        // Determine which days to check (today + tomorrow = 24h window)
        const daysToCheck: Date[] = [];
        const today = new Date(localNow);
        today.setHours(0, 0, 0, 0);
        daysToCheck.push(today);

        const tomorrow = addDays(today, 1);
        daysToCheck.push(tomorrow);

        const batch = db.batch();
        const remindersRef = db.collection(`users/${uid}/reminders`);
        let createdCount = 0;
        const createdReminderIds: string[] = [];

        for (const day of daysToCheck) {
            const dayOfWeek = getDay(day);
            const dateStr = format(day, "yyyy-MM-dd");

            // Check if routine runs on this day
            let isDue = false;
            if (routine.schedule.type === "daily") {
                isDue = true;
            } else if (routine.schedule.type === "weekly" || routine.schedule.type === "custom") {
                if (routine.schedule.days && routine.schedule.days.includes(dayOfWeek)) {
                    isDue = true;
                }
            }
            if (!isDue) continue;

            // Generate reminders for each step
            for (const step of routine.steps) {
                const [hours, minutes] = step.time.split(":").map(Number);
                const localTime = new Date(day);
                localTime.setHours(hours, minutes, 0, 0);

                // Convert to UTC
                let dueAtUtc: Date;
                try {
                    dueAtUtc = fromZonedTime(localTime, timezone);
                } catch {
                    dueAtUtc = localTime;
                }

                // Skip if this time is already in the past
                if (dueAtUtc <= now) continue;

                // Skip if beyond 24h window
                const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                if (dueAtUtc > twentyFourHoursFromNow) continue;

                // Deterministic ID — prevents duplicates
                const docId = deterministicId(routineId, step.id, dateStr);
                const docRef = remindersRef.doc(docId);

                const reminderData: Record<string, any> = {
                    uid,
                    title: step.title || "Untitled",
                    notes: step.notes || "",
                    status: "pending",
                    due_at: dueAtUtc,
                    timezone,
                    notifications: (step.notifications || []).map((n: any) => ({
                        ...n,
                        sent: false,
                    })),
                    created_at: new Date(),
                    updated_at: new Date(),
                    routineId,
                    routineDate: dateStr,
                    rootId: routineId,
                };

                // Use set with merge to be idempotent
                batch.set(docRef, reminderData, { merge: true });
                createdReminderIds.push(docId);
                createdCount++;
            }
        }

        if (createdCount > 0) {
            // Mark routine as ran for today
            batch.update(routineRef, { lastRun: new Date() });
            await batch.commit();

            // Sync queue items for each created reminder (fire-and-forget)
            for (const remId of createdReminderIds) {
                const reminderDoc = await remindersRef.doc(remId).get();
                if (reminderDoc.exists) {
                    await syncQueueForReminder(uid, remId, reminderDoc.data());
                }
            }
        }

        return NextResponse.json({
            success: true,
            count: createdCount,
            message: createdCount > 0
                ? `Generated ${createdCount} reminders for the next 24 hours`
                : "No upcoming reminders needed in the next 24 hours",
        });
    } catch (error: any) {
        console.error("Run Routine Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
