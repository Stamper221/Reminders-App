import { NextRequest, NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import {
    syncQueueForReminder,
    removeQueueForReminder,
    removeQueueForRoutine,
} from "@/lib/notificationQueue";

// Initialize Firebase Admin (Singleton)
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
 * POST /api/queue/sync
 *
 * Called by the client after reminder CRUD operations to sync queue items.
 *
 * Body:
 *   { action: "sync" | "remove" | "removeRoutine", reminderId?: string, routineId?: string }
 *
 * - "sync":   Re-reads the reminder from Firestore and rebuilds its queue items.
 * - "remove": Removes all unsent queue items for a specific reminder.
 * - "removeRoutine": Removes all unsent queue items for all reminders from a routine,
 *              and optionally deletes future routine-generated reminders.
 */
export async function POST(request: NextRequest) {
    try {
        // Auth
        const authHeader = request.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const token = authHeader.split("Bearer ")[1];
        let uid: string;
        try {
            const decoded = await getAuth().verifyIdToken(token);
            uid = decoded.uid;
        } catch {
            return NextResponse.json({ error: "Invalid token" }, { status: 401 });
        }

        const body = await request.json();
        const { action, reminderId, routineId, deleteFutureReminders } = body;

        if (action === "sync" && reminderId) {
            // Read the reminder from Firestore to get current data
            const reminderDoc = await db.collection("users").doc(uid)
                .collection("reminders").doc(reminderId).get();

            if (reminderDoc.exists) {
                const result = await syncQueueForReminder(uid, reminderId, reminderDoc.data());
                return NextResponse.json({ success: true, ...result });
            } else {
                // Reminder deleted — remove queue items
                const removed = await removeQueueForReminder(uid, reminderId);
                return NextResponse.json({ success: true, removed });
            }
        }

        if (action === "remove" && reminderId) {
            const removed = await removeQueueForReminder(uid, reminderId);
            return NextResponse.json({ success: true, removed });
        }

        if (action === "removeRoutine" && routineId) {
            // Remove queue items for this routine's reminders
            const removedQueue = await removeQueueForRoutine(uid, routineId);

            // Optionally delete future routine-generated reminders
            let deletedReminders = 0;
            if (deleteFutureReminders) {
                const remindersRef = db.collection("users").doc(uid).collection("reminders");
                const futureReminders = await remindersRef
                    .where("routineId", "==", routineId)
                    .where("status", "==", "pending")
                    .get();

                if (!futureReminders.empty) {
                    const batch = db.batch();
                    for (const doc of futureReminders.docs) {
                        batch.delete(doc.ref);
                    }
                    await batch.commit();
                    deletedReminders = futureReminders.size;
                }
            }

            return NextResponse.json({
                success: true,
                removedQueueItems: removedQueue,
                deletedReminders,
            });
        }

        return NextResponse.json({ error: "Invalid action or missing params" }, { status: 400 });
    } catch (err: any) {
        console.error("Queue Sync Error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
