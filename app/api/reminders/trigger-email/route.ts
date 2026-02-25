import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import nodemailer from "nodemailer";

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

        if (!userEmail) return NextResponse.json({ error: "No email address configured" }, { status: 400 });

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

        // Check if type allows email (email or both)
        if (notification.type !== 'email' && notification.type !== 'both') {
            return NextResponse.json({ error: "Notification type is not email" }, { status: 400 });
        }

        // Send Email
        const smtpHost = process.env.SMTP_HOST;
        const smtpPort = parseInt(process.env.SMTP_PORT || "587");
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;
        const smtpFrom = process.env.SMTP_FROM || smtpUser || "noreply@reminders.app";

        if (!smtpHost || !smtpUser || !smtpPass) {
            return NextResponse.json({ error: "SMTP not configured" }, { status: 500 });
        }

        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465, // true for 465, false for other ports
            auth: { user: smtpUser, pass: smtpPass },
        });

        // Format Date
        const dueAt = reminder?.due_at?.toDate ? reminder.due_at.toDate() : new Date(reminder?.due_at);
        const dateStr = dueAt.toLocaleString("en-US", {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        await transporter.sendMail({
            from: `"Reminders App" <${smtpFrom}>`,
            to: userEmail,
            subject: `Reminder: ${reminder?.title || "Untitled"} 🔔`,
            text: `Reminder: ${reminder?.title}\n\nNotes: ${reminder?.notes || "No notes"}\nDue: ${dateStr}`,
            html: `
                <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px;">
                    <h2 style="color: #0070f3;">Reminder Due 🔔</h2>
                    <h3 style="margin-top: 0;">${reminder?.title}</h3>
                    <p style="font-size: 16px;"><strong>Due:</strong> ${dateStr}</p>
                    ${reminder?.notes ? `<div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;"><strong>Notes:</strong><br/>${reminder.notes.replace(/\n/g, '<br/>')}</div>` : ''}
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #999;">Sent safely from your Reminders App.</p>
                </div>
            `
        });

        // Update Notification as Sent
        notifications[notifIndex].sent = true;
        await reminderRef.update({ notifications });

        return NextResponse.json({ success: true });

    } catch (err: any) {
        console.error("Trigger email error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
