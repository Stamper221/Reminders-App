import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import nodemailer from "nodemailer";
import webpush from "web-push";

// Initialize Firebase Admin
if (getApps().length === 0) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccount) {
        try {
            initializeApp({
                credential: cert(JSON.parse(serviceAccount)),
            });
        } catch (e) {
            console.error("Failed to parse service account key:", e);
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

// Initialize Web Push
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;

if (publicKey && privateKey) {
    webpush.setVapidDetails(vapidSubject, publicKey, privateKey);
}

export async function POST(request: NextRequest) {
    try {
        const { reminderId, notificationId } = await request.json();

        if (!reminderId || !notificationId) {
            return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
        }

        // Authenticate user
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

        // Fetch User (for email address)
        const userDoc = await db.collection("users").doc(uid).get();
        if (!userDoc.exists) return NextResponse.json({ error: "User not found" }, { status: 404 });

        const userData = userDoc.data();
        const userEmail = userData?.email;

        // Fetch Reminder
        const reminderRef = db.collection("users").doc(uid).collection("reminders").doc(reminderId);
        const reminderDoc = await reminderRef.get();

        if (!reminderDoc.exists) return NextResponse.json({ error: "Reminder not found" }, { status: 404 });

        const reminder = reminderDoc.data();
        const notifications = reminder?.notifications || [];

        // Find notification
        const notifIndex = notifications.findIndex((n: any) => n.id === notificationId);
        if (notifIndex === -1) return NextResponse.json({ error: "Notification not found" }, { status: 404 });

        const notification = notifications[notifIndex];

        // If already sent, skip
        if (notification.sent) {
            return NextResponse.json({ success: true, message: "Already sent" });
        }

        const isEmail = notification.type === 'email' || notification.type === 'both';
        const isPush = notification.type === 'push' || notification.type === 'both';

        // 1. Send Email
        if (isEmail && userEmail) {
            const smtpHost = process.env.SMTP_HOST;
            const smtpPort = parseInt(process.env.SMTP_PORT || "587");
            const smtpUser = process.env.SMTP_USER;
            const smtpPass = process.env.SMTP_PASS;
            const smtpFrom = process.env.SMTP_FROM || smtpUser || "noreply@reminders.app";

            if (smtpHost && smtpUser && smtpPass) {
                const transporter = nodemailer.createTransport({
                    host: smtpHost,
                    port: smtpPort,
                    secure: smtpPort === 465,
                    auth: { user: smtpUser, pass: smtpPass },
                });

                const dueAt = reminder?.due_at?.toDate ? reminder.due_at.toDate() : new Date(reminder?.due_at);
                const dateStr = dueAt.toLocaleString("en-US", {
                    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                });

                await transporter.sendMail({
                    from: `"Reminders App" <${smtpFrom}>`,
                    to: userEmail,
                    subject: `Reminder: ${reminder?.title || "Untitled"} 🔔`,
                    text: `Reminder: ${reminder?.title}\nDue: ${dateStr}\n\n${reminder?.notes || ""}`,
                    html: `
                        <div style="font-family: sans-serif; padding: 20px; color: #333;">
                            <h2 style="color: #0070f3;">Reminder 🔔</h2>
                            <h3 style="margin-top: 0;">${reminder?.title}</h3>
                            <p><strong>Due:</strong> ${dateStr}</p>
                            ${reminder?.notes ? `<p><strong>Notes:</strong><br/>${reminder.notes}</p>` : ''}
                        </div>
                    `
                }).catch(e => console.error("Email send failed:", e));
            }
        }

        // 2. Send Web Push
        if (isPush && publicKey && privateKey) {
            const subsRef = db.collection("users").doc(uid).collection("push_subscriptions");
            const snapshot = await subsRef.get();

            if (!snapshot.empty) {
                const payload = JSON.stringify({
                    title: `Reminder: ${reminder?.title}`,
                    body: reminder?.notes || `Due: ${new Date(reminder?.due_at?.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
                    url: `/?reminderId=${reminderId}`, // Deep link to dashboard
                    icon: "/icon-192x192.png"
                });

                const promises = snapshot.docs.map(async (doc) => {
                    const sub = doc.data();
                    const pushSubscription = {
                        endpoint: sub.endpoint,
                        keys: sub.keys
                    };
                    try {
                        await webpush.sendNotification(pushSubscription as any, payload);
                    } catch (error: any) {
                        if (error.statusCode === 410 || error.statusCode === 404) {
                            await doc.ref.delete();
                        }
                    }
                });
                await Promise.all(promises);
            }
        }

        // Update Notification as Sent
        notifications[notifIndex].sent = true;
        await reminderRef.update({ notifications });

        return NextResponse.json({ success: true });

    } catch (err: any) {
        console.error("Trigger error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
