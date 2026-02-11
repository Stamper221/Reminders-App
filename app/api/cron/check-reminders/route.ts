import { NextRequest, NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import twilio from "twilio";
import nodemailer from "nodemailer";
import { formatInTimeZone } from "date-fns-tz";

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
            // Fallback for build/dev environment where key might be missing or invalid
            initializeApp({
                projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            });
        }
    } else {
        // Fallback for build/dev environment where key might be missing
        initializeApp({
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        });
    }
}

const db = getFirestore();

export async function GET(request: NextRequest) {
    // secure the endpoint with a secret shared with Vercel Cron
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        console.log("Checking reminders via Cron...");

        const now = new Date();
        const remindersRef = db.collectionGroup("reminders");
        const snapshot = await remindersRef.where("status", "==", "pending").get();

        if (snapshot.empty) {
            return NextResponse.json({ message: "No pending reminders." });
        }

        const batch = db.batch();
        let commitCount = 0;
        const userCache: Record<string, any> = {};

        // Twilio Setup
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const fromNumber = process.env.TWILIO_PHONE_NUMBER;
        const twilioClient = (accountSid && authToken) ? twilio(accountSid, authToken) : null;

        // SMTP Setup
        const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
        const smtpPort = parseInt(process.env.SMTP_PORT || "587");
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;
        const smtpFrom = process.env.SMTP_FROM || smtpUser;

        let transporter: nodemailer.Transporter | null = null;
        if (smtpUser && smtpPass) {
            transporter = nodemailer.createTransport({
                host: smtpHost,
                port: smtpPort,
                secure: smtpPort === 465,
                auth: { user: smtpUser, pass: smtpPass },
            });
        }

        for (const doc of snapshot.docs) {
            const reminder = doc.data();
            const uid = reminder.uid;
            const dueAt = reminder.due_at?.toDate ? reminder.due_at.toDate() : new Date(reminder.due_at);
            const notifications = reminder.notifications;

            if (!uid || !notifications || !Array.isArray(notifications)) continue;

            let reminderUpdated = false;
            const updatedNotifications = [...notifications];

            if (!userCache[uid]) {
                const userDoc = await db.collection("users").doc(uid).get();
                userCache[uid] = userDoc.exists ? userDoc.data() : null;
            }
            const user = userCache[uid];
            if (!user) continue;

            for (let i = 0; i < updatedNotifications.length; i++) {
                const notification = updatedNotifications[i];
                if (notification.sent) continue;

                const triggerTime = new Date(dueAt.getTime() - notification.offsetMinutes * 60000);
                if (triggerTime <= now) {
                    let sent = false;
                    const userTimezone = reminder.timezone || user.timezone || 'UTC';

                    const timeString = formatInTimeZone(dueAt, userTimezone, "h:mm a");
                    console.log(`Sending notification for ${reminder.title} at ${timeString} (${userTimezone})`);

                    let prefix = "Reminder:";
                    if (notification.offsetMinutes === 1440) prefix = "Tomorrow:";
                    else if (notification.offsetMinutes === 60) prefix = "In 1 hour:";
                    else if (notification.offsetMinutes === 0) prefix = "Now:";

                    const message = `${prefix} "${reminder.title}" is due at ${timeString}.`;

                    // SMS
                    if ((notification.type === 'sms' || notification.type === 'both' || notification.type === 'all') && user.smsOptIn && user.phoneNumber && twilioClient) {
                        try {
                            await twilioClient.messages.create({
                                body: message,
                                from: fromNumber,
                                to: user.phoneNumber,
                            });
                            sent = true;
                        } catch (e) {
                            console.error(`Failed to send SMS: ${e}`);
                        }
                    }

                    // Email
                    if ((notification.type === 'email' || notification.type === 'both' || notification.type === 'all') && user.email && transporter) {
                        try {
                            await transporter.sendMail({
                                from: `"Reminders App" <${smtpFrom}>`,
                                to: user.email,
                                subject: `${prefix} ${reminder.title}`,
                                text: message,
                                html: `<p>${message}</p>`
                            });
                            sent = true;
                        } catch (e) {
                            console.error(`Failed to send Email: ${e}`);
                        }
                    }

                    if (sent) {
                        updatedNotifications[i].sent = true;
                        reminderUpdated = true;
                    }
                }
            }

            if (reminderUpdated) {
                batch.update(doc.ref, {
                    notifications: updatedNotifications,
                    updated_at: new Date()
                });
                commitCount++;
            }
        }

        if (commitCount > 0) {
            await batch.commit();
        }

        return NextResponse.json({ success: true, processed: commitCount });
    } catch (error: any) {
        console.error("Cron error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
