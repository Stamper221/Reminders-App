
import { NextRequest, NextResponse } from "next/server";
import { getFirestore, Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { generateRoutineInstances } from "@/lib/scheduler";
import { Routine } from "@/lib/types";
import { toZonedTime } from "date-fns-tz";
import { format } from "date-fns";

// Initialize Firebase Admin if not already done
if (getApps().length === 0) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccount) {
        try {
            initializeApp({
                credential: cert(JSON.parse(serviceAccount)),
            });
        } catch (e) {
            console.warn("Failed to parse service account key, falling back to projectId:", e);
            initializeApp({
                projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            });
        }
    } else {
        initializeApp({
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        });
    }
}

const db = getFirestore();

export async function GET(request: NextRequest) {
    // secure the endpoint
    const authHeader = request.headers.get("authorization");
    let isAuthorized = false;

    if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        if (token === process.env.CRON_SECRET) {
            isAuthorized = true;
        } else {
            // Verify ID Token for admin/manual trigger
            try {
                await getAuth().verifyIdToken(token);
                isAuthorized = true;
            } catch (e) {
                console.warn("Invalid ID token for cron", e);
            }
        }
    }

    if (!isAuthorized) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        console.log("Processing routines...");

        // Iterate all users and query their routines subcollection
        // This avoids collectionGroup which requires a composite index
        const usersSnapshot = await db.collection("users").get();
        const batch = db.batch();
        let generatedCount = 0;
        const now = new Date(); // Server UTC

        for (const userDoc of usersSnapshot.docs) {
            const routinesRef = db.collection(`users/${userDoc.id}/routines`);
            const snapshot = await routinesRef.where("active", "==", true).get();

            if (snapshot.empty) continue;

            for (const doc of snapshot.docs) {
                const routine = doc.data() as Routine;
                const rData = doc.data();
                const timezone = routine.timezone || 'UTC';

                // Get local date string for "Today" in user's timezone
                const localDate = toZonedTime(now, timezone);
                const dateStr = format(localDate, "yyyy-MM-dd");

                // Check if already ran today
                if (rData.lastRun) {
                    const lastRunDate = rData.lastRun.toDate();
                    const lastRunLocal = toZonedTime(lastRunDate, timezone);
                    const lastRunDateStr = format(lastRunLocal, "yyyy-MM-dd");

                    if (lastRunDateStr === dateStr) {
                        continue; // Already ran today
                    }
                }

                // Generate instances
                const newReminders = generateRoutineInstances(routine, localDate);

                if (newReminders.length > 0) {
                    const userRemindersRef = db.collection(`users/${routine.uid}/reminders`);
                    newReminders.forEach(r => {
                        const ref = userRemindersRef.doc();

                        const dueAtDate = r.due_at ? r.due_at.toDate() : new Date();

                        batch.set(ref, {
                            ...r,
                            id: ref.id,
                            due_at: dueAtDate,
                            created_at: new Date(),
                            updated_at: new Date(),
                            rootId: routine.id,
                            routineId: routine.id,
                        });
                    });

                    // Update routine lastRun
                    batch.update(doc.ref, { lastRun: new Date() });
                    generatedCount += newReminders.length;
                }
            }
        }

        if (generatedCount > 0) {
            await batch.commit();
        }

        return NextResponse.json({ success: true, generated: generatedCount });
    } catch (error: any) {
        console.error("Routine Cron error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
