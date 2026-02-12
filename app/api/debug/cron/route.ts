import { NextRequest, NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import twilio from "twilio";
import nodemailer from "nodemailer";
import { formatInTimeZone } from "date-fns-tz";
import webpush from "web-push";
import { getAuth } from "firebase-admin/auth";

// Initialize Firebase Admin (Reuse logic)
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

// Initialize VAPID
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;

if (publicKey && privateKey) {
    webpush.setVapidDetails(vapidSubject, publicKey, privateKey);
}

export async function GET(request: NextRequest) {
    const logs: string[] = [];
    const log = (msg: string) => { console.log(msg); logs.push(msg); };

    try {
        // Authenticate (Admin or User) - Allow verifying in browser
        // For quick debug, we might skip auth or use a simple query param, but let's try strict first.
        // Actually, for easy user testing, let's just check for a valid session cookie or token if possible, 
        // but simplest is to just let it run relative to the request context or just return logs.
        // We'll require a query param ?key=debug to prevent public spam, but tell the user to use it.

        const { searchParams } = new URL(request.url);
        if (searchParams.get("key") !== "debug123") {
            return NextResponse.json({ error: "Unauthorized. Use ?key=debug123" }, { status: 401 });
        }

        log("Starting Debug Check...");
        const now = new Date();
        log(`Server Time: ${now.toISOString()}`);

        const remindersRef = db.collectionGroup("reminders");
        // Check if query throws error (Index missing?)
        let snapshot;
        try {
            snapshot = await remindersRef.where("status", "==", "pending").get();
            log(`Query success. Found ${snapshot.size} pending reminders.`);
        } catch (err: any) {
            log(`QUERY FAILED: ${err.message}`);
            log(`Full Error: ${JSON.stringify(err, Object.getOwnPropertyNames(err))}`);
            if (err.message.includes("indexes") || err.code === 9) {
                log("ACTION REQUIRED: Look for a URL in the error above and click it to create the index.");
            }
            return NextResponse.json({ success: false, logs }, { status: 500 });
        }

        if (snapshot.empty) {
            return NextResponse.json({ success: true, message: "No pending reminders.", logs });
        }

        // ... (Simulate logic without sending or sending?)
        // Let's ACTUALLY send to verify "automation".

        const batch = db.batch();
        let commitCount = 0;

        // ... (Copy loop logic but with logging)

        for (const doc of snapshot.docs) {
            const reminder = doc.data();
            const uid = reminder.uid;
            const dueAt = reminder.due_at?.toDate ? reminder.due_at.toDate() : new Date(reminder.due_at);

            log(`Checking Reminder: ${reminder.title} (UID: ${uid})`);
            log(`Due At: ${dueAt.toISOString()} | Now: ${now.toISOString()}`);

            // Debug: Check subscriptions count even if not due
            const debugSubs = await db.collection("users").doc(uid).collection("push_subscriptions").get();
            log(`  [Debug Info] User has ${debugSubs.size} active push subscriptions.`);

            // ... Logic matching main cron ...
            // Simplified for debug:

            const notifications = reminder.notifications || [];
            for (const n of notifications) {
                if (n.sent) continue;
                const triggerTime = new Date(dueAt.getTime() - n.offsetMinutes * 60000);
                const isDue = triggerTime <= now;
                log(`  Notification offset ${n.offsetMinutes}m -> Trigger: ${triggerTime.toISOString()} | Due? ${isDue}`);

                if (isDue) {
                    log("    -> Attempting Send...");
                    if ((n.type === 'push' || n.type === 'all') && publicKey && privateKey) {
                        const subs = await db.collection("users").doc(uid).collection("push_subscriptions").get();
                        log(`    -> Found ${subs.size} subscriptions.`);
                        if (subs.empty) log("    -> NO SUBSCRIPTIONS FOUND. (User needs to re-enable push)");

                        // Try send
                        for (const subDoc of subs.docs) {
                            const sub = subDoc.data();
                            try {
                                const payload = JSON.stringify({ title: "Debug Test", body: "It works!", icon: "/icon-192x192.png" });
                                await webpush.sendNotification(
                                    { endpoint: sub.endpoint, keys: sub.keys } as any,
                                    payload,
                                    { headers: { 'Urgency': 'high' } }
                                );
                                log(`    -> Sent to ${subDoc.id}`);
                            } catch (e: any) {
                                log(`    -> sendNotification failed: ${e.statusCode} - ${e.message}`);
                            }
                        }
                    }
                }
            }
        }

        return NextResponse.json({ success: true, logs });

    } catch (error: any) {
        log(`Fatal Error: ${error.message}`);
        return NextResponse.json({ success: false, logs }, { status: 500 });
    }
}
