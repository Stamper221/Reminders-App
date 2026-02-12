
import { NextRequest, NextResponse } from "next/server";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { calculateNextDue } from "@/lib/scheduler";
import { Reminder } from "@/lib/types";

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
        console.log("Processing repeats...");
        const windowDays = 14;
        const futureWindow = new Date();
        futureWindow.setDate(futureWindow.getDate() + windowDays);

        // Iterate all users and query their reminders subcollection
        // This avoids collectionGroup which requires a composite index
        const usersSnapshot = await db.collection("users").get();
        let generatedCount = 0;
        const batch = db.batch();

        for (const userDoc of usersSnapshot.docs) {
            const remindersRef = db.collection(`users/${userDoc.id}/reminders`);
            const snapshot = await remindersRef.where("generationStatus", "==", "pending").get();

            if (snapshot.empty) continue;

            for (const doc of snapshot.docs) {
                const reminder = doc.data() as Reminder;
                // Double check repeatRule
                if (!reminder.repeatRule) continue;

                const currentDue = reminder.due_at; // Timestamp
                // Calculate next
                const nextDueParam = calculateNextDue(reminder.repeatRule, currentDue);

                // If nextDue is null (ended) or strictly after futureWindow, skip
                if (!nextDueParam) {
                    // End of series? Mark as created (or 'ended') to stop checking
                    batch.update(doc.ref, { generationStatus: 'created' }); // effectively 'done'
                    continue;
                }

                const nextDueDate = nextDueParam.toDate();
                if (nextDueDate <= futureWindow) {
                    // Create next instance
                    const newRef = db.collection(`users/${reminder.uid}/reminders`).doc();
                    const now = Timestamp.now();

                    const nextReminder: any = {
                        ...reminder,
                        id: newRef.id,
                        due_at: nextDueParam,
                        status: 'pending',
                        notifications: reminder.notifications.map(n => ({ ...n, sent: false })),
                        originId: doc.id,
                        rootId: reminder.rootId || doc.id,
                        generationStatus: 'pending',
                        created_at: now,
                        updated_at: now,
                    };

                    // Remove ID from data if Reminder interface includes it optionally but firebase doesn't store it
                    delete (nextReminder as any).id;

                    batch.set(newRef, nextReminder);

                    // Mark current as processed
                    batch.update(doc.ref, { generationStatus: 'created' });
                    generatedCount++;
                }
            }
        }

        if (generatedCount > 0) {
            await batch.commit();
        }

        return NextResponse.json({ success: true, generated: generatedCount });
    } catch (error: any) {
        console.error("Repeat Cron error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
