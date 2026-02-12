import { NextRequest, NextResponse } from "next/server";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import twilio from "twilio";
import nodemailer from "nodemailer";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { format } from "date-fns";
import webpush from "web-push";
import { calculateNextDue, generateRoutineInstances } from "@/lib/scheduler";
import { Reminder, Routine } from "@/lib/types";

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

// Initialize VAPID
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
if (publicKey && privateKey) webpush.setVapidDetails(vapidSubject, publicKey, privateKey);

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

// Helper: Process Reminders (Notifications)
async function processReminders(now: Date) {
    const remindersRef = db.collectionGroup("reminders");
    // Only pending reminders
    const snapshot = await remindersRef.where("status", "==", "pending").get();

    if (snapshot.empty) return 0;

    // Sort by due_at ASC
    const sortedDocs = snapshot.docs.sort((a, b) => {
        const dateA = a.data().due_at?.toDate ? a.data().due_at.toDate() : new Date(a.data().due_at);
        const dateB = b.data().due_at?.toDate ? b.data().due_at.toDate() : new Date(b.data().due_at);
        return dateA.getTime() - dateB.getTime();
    });

    const batch = db.batch();
    let commitCount = 0;
    const userCache: Record<string, any> = {};

    for (const doc of sortedDocs) {
        const reminder = doc.data();
        const uid = reminder.uid;
        const dueAt = reminder.due_at?.toDate ? reminder.due_at.toDate() : new Date(reminder.due_at);
        const notifications = reminder.notifications;

        if (!uid || !notifications || !Array.isArray(notifications)) continue;

        let reminderUpdated = false;
        const updatedNotifications = [...notifications];

        // Cache user profile for timezone/preferences
        if (!userCache[uid]) {
            const userDoc = await db.collection("users").doc(uid).get();
            userCache[uid] = userDoc.exists ? userDoc.data() : null;
        }
        const user = userCache[uid];
        if (!user) continue;

        // Process each notification trigger
        for (let i = 0; i < updatedNotifications.length; i++) {
            const notification = updatedNotifications[i];
            if (notification.sent) continue;

            const triggerTime = new Date(dueAt.getTime() - notification.offsetMinutes * 60000);

            // Check if trigger time has passed
            if (triggerTime <= now) {
                let sent = false;
                const userTimezone = reminder.timezone || user.timezone || 'UTC';
                const timeString = formatInTimeZone(dueAt, userTimezone, "h:mm a");

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
                        console.error(`SMS failed: ${e}`);
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
                        console.error(`Email failed: ${e}`);
                    }
                }

                // Push
                if ((notification.type === 'push' || notification.type === 'both' || notification.type === 'all') && publicKey && privateKey) {
                    try {
                        const subsRef = db.collection("users").doc(uid).collection("push_subscriptions");
                        const subsSnapshot = await subsRef.get();

                        if (!subsSnapshot.empty) {
                            const payload = JSON.stringify({
                                title: prefix.replace(':', ''),
                                body: `${reminder.title} is due at ${timeString}`,
                                url: `/`, // Deep link logic could go here
                                icon: "/icon-192x192.png"
                            });

                            const promises = subsSnapshot.docs.map(async (subDoc) => {
                                const subData = subDoc.data();
                                try {
                                    await webpush.sendNotification(
                                        { endpoint: subData.endpoint, keys: subData.keys } as any,
                                        payload,
                                        { headers: { 'Urgency': 'high' } }
                                    );
                                    return true;
                                } catch (err: any) {
                                    if (err.statusCode === 410 || err.statusCode === 404) {
                                        await subDoc.ref.delete();
                                    }
                                    console.error(`Push failed for ${subDoc.id}:`, err.message);
                                    return false;
                                }
                            });
                            const results = await Promise.all(promises);
                            if (results.some(r => r)) sent = true;
                        }
                    } catch (e) {
                        console.error(`Push process failed: ${e}`);
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

    if (commitCount > 0) await batch.commit();
    return commitCount;
}

// Helper: Process Repeats (Generation)
async function processRepeats(futureWindow: Date) {
    const remindersRef = db.collectionGroup("reminders");
    const snapshot = await remindersRef.where("generationStatus", "==", "pending").get(); // Requires Index? No, "pending" status usually indexed. But we used "generationStatus" here.
    // Wait, in previous "process-repeats", we iterated users because of missing index for 'generationStatus'.
    // BUT we found 'generationStatus' ASC/DESC in `firestore.indexes.json`!
    // So we CAN use Collection Group query properly now.

    if (snapshot.empty) return 0;

    const batch = db.batch();
    let generatedCount = 0;

    for (const doc of snapshot.docs) {
        const reminder = doc.data() as any; // Cast to bypass strict type check for now
        if (!reminder.repeatRule) continue;

        const currentDue = reminder.due_at; // Timestamp
        const nextDueParam = calculateNextDue(reminder.repeatRule, currentDue);

        if (!nextDueParam) {
            batch.update(doc.ref, { generationStatus: 'created' }); // Series ended
            continue;
        }

        const nextDueDate = nextDueParam.toDate();
        if (nextDueDate <= futureWindow) {
            const newRef = db.collection(`users/${reminder.uid}/reminders`).doc();
            const now = Timestamp.now();

            const nextReminder = {
                ...reminder,
                id: newRef.id,
                due_at: nextDueParam,
                status: 'pending',
                notifications: (reminder.notifications || []).map((n: any) => ({ ...n, sent: false })),
                originId: doc.id,
                rootId: reminder.rootId || doc.id,
                generationStatus: 'pending',
                created_at: now,
                updated_at: now,
            };
            // Remove ID if destructured
            delete nextReminder.id; // actually we set ID in doc ref

            batch.set(newRef, nextReminder);
            batch.update(doc.ref, { generationStatus: 'created' });
            generatedCount++;
        }
    }

    if (generatedCount > 0) await batch.commit();
    return generatedCount;
}

// Helper: Process Routines
async function processRoutines(now: Date) {
    const routinesRef = db.collectionGroup("routines");
    const snapshot = await routinesRef.where("active", "==", true).get(); // Requires Index for 'active'? Checked in firestore.indexes.json?
    // "routines" active ASC/DESC exists in logs.

    if (snapshot.empty) return 0;

    const batch = db.batch();
    let generatedCount = 0;

    for (const doc of snapshot.docs) {
        const routine = doc.data() as Routine;
        const timezone = routine.timezone || 'UTC';
        const localDate = toZonedTime(now, timezone);
        const dateStr = format(localDate, "yyyy-MM-dd");

        // Check Last Run
        if (routine.lastRun) {
            const lastRunDate = routine.lastRun.toDate();
            const lastRunLocal = toZonedTime(lastRunDate, timezone);
            const lastRunDateStr = format(lastRunLocal, "yyyy-MM-dd");
            if (lastRunDateStr === dateStr) continue;
        }

        // Generate
        const newReminders = generateRoutineInstances(routine, localDate);
        if (newReminders.length > 0) {
            const userRemindersRef = db.collection(`users/${routine.uid}/reminders`);
            newReminders.forEach(r => {
                const ref = userRemindersRef.doc();
                const dueAtDate = r.due_at ? r.due_at.toDate() : new Date();

                batch.set(ref, {
                    ...r,
                    due_at: dueAtDate,
                    created_at: new Date(),
                    updated_at: new Date(),
                    rootId: routine.id,
                    routineId: routine.id,
                });
            });

            batch.update(doc.ref, { lastRun: new Date() }); // Mark ran today
            generatedCount += newReminders.length;
        }
    }

    if (generatedCount > 0) await batch.commit();
    return generatedCount;
}

export async function GET(request: NextRequest) {
    // 1. Authorization
    const authHeader = request.headers.get("authorization");
    // Accept Bearer Token OR Query Param (for flexibility with cron services)
    const { searchParams } = new URL(request.url);
    const queryKey = searchParams.get("key");

    const validSecret = process.env.CRON_SECRET;
    const isBearerValid = authHeader === `Bearer ${validSecret}`;
    const isQueryValid = queryKey === validSecret;

    if (!validSecret || (!isBearerValid && !isQueryValid)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const now = new Date();
        const futureWindow = new Date();
        futureWindow.setDate(futureWindow.getDate() + 14); // Generate next 2 weeks of repeats

        // Run sequentially or concurrently, but capture errors individually
        let notifResult = { count: 0, error: null };
        try {
            notifResult.count = await processReminders(now);
        } catch (e: any) {
            console.error("Reminders Check Failed:", e);
            notifResult.error = e.message;
        }

        let repeatResult = { count: 0, error: null };
        try {
            repeatResult.count = await processRepeats(futureWindow);
        } catch (e: any) {
            console.error("Repeats Check Failed:", e);
            repeatResult.error = e.message;
        }

        let routineResult = { count: 0, error: null };
        try {
            routineResult.count = await processRoutines(now);
        } catch (e: any) {
            console.error("Routines Check Failed:", e);
            routineResult.error = e.message;
        }

        return NextResponse.json({
            success: !notifResult.error && !repeatResult.error && !routineResult.error,
            timestamp: now.toISOString(),
            stats: {
                notificationsSent: notifResult.count,
                repeatsGenerated: repeatResult.count,
                routinesGenerated: routineResult.count
            },
            errors: {
                notifications: notifResult.error,
                repeats: repeatResult.error,
                routines: routineResult.error
            }
        });

    } catch (error: any) {
        console.error("Cron Run Fatal Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
