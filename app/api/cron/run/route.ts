import { NextRequest, NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import twilio from "twilio";
import nodemailer from "nodemailer";
import { formatInTimeZone } from "date-fns-tz";
import webpush from "web-push";
import { getDueQueueItems, rebuildQueueForUser } from "@/lib/notificationQueue";
import { generateRoutinesForUser } from "@/lib/routineGenerator";
import { format } from "date-fns";

/**
 * GET /api/cron/run
 *
 * MINUTE-RUNNER: Runs every 1-2 minutes via cron-job.org.
 * Only reads the notification_queue — NO reminder scans.
 *
 * For each user:
 *   1. Query notification_queue where sent==false AND scheduledAt ∈ [now-2m, now+2m], limit(50)
 *   2. Send push/SMS/email per queue item channel
 *   3. Mark sent=true
 *   4. Also mark the original reminder notification as sent (to keep state consistent)
 *
 * Read budget: ~1 read per user when nothing is due (empty query result).
 */

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

// VAPID
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
if (publicKey && privateKey) webpush.setVapidDetails(vapidSubject, publicKey, privateKey);

// Twilio
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;
const twilioClient = (accountSid && authToken) ? twilio(accountSid, authToken) : null;

// SMTP
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

/** Truncate notes for push body */
function truncateNotes(notes: string, maxLen: number = 100): string {
    if (!notes) return "";
    return notes.length > maxLen ? notes.substring(0, maxLen) + "…" : notes;
}

/** Push subscription cache per cron run */
const pushSubCache: Record<string, { endpoint: string; keys: any; ref: FirebaseFirestore.DocumentReference }[]> = {};
async function getCachedPushSubs(uid: string) {
    if (pushSubCache[uid]) return pushSubCache[uid];
    const subsSnap = await db.collection("users").doc(uid).collection("push_subscriptions").get();
    pushSubCache[uid] = subsSnap.docs.map(d => ({
        endpoint: d.data().endpoint,
        keys: d.data().keys,
        ref: d.ref,
    }));
    return pushSubCache[uid];
}

export async function GET(request: NextRequest) {
    // Auth
    const authHeader = request.headers.get("authorization");
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

        // Get users (2 reads for 2 users)
        const usersSnap = await db.collection("users").get();
        if (usersSnap.empty) {
            return NextResponse.json({ success: true, message: "No users", stats: {} });
        }

        const userCache: Record<string, any> = {};
        for (const doc of usersSnap.docs) {
            userCache[doc.id] = doc.data();
        }

        let totalSent = 0;
        let totalProcessed = 0;
        const details: any[] = [];
        const routineStats: any[] = [];

        for (const uid of Object.keys(userCache)) {
            const user = userCache[uid];
            const userTimezone = user.timezone || "UTC";

            // ── Step 0: Daily routine generation (once per day per user) ──
            try {
                const todayStr = format(now, "yyyy-MM-dd");
                const metaRef = db.collection("users").doc(uid).collection("meta").doc("routineGenState");
                const metaDoc = await metaRef.get();
                const lastGenDate = metaDoc.exists ? metaDoc.data()?.lastGenDate : null;

                if (lastGenDate !== todayStr) {
                    // Generate routine reminders for next 24h
                    const genResult = await generateRoutinesForUser(uid, now, userTimezone);

                    // Rebuild notification queue (covers new routine reminders + existing ones)
                    const queueResult = await rebuildQueueForUser(uid, 24);

                    // Mark as generated for today
                    await metaRef.set({ lastGenDate: todayStr, generatedAt: now }, { merge: true });

                    routineStats.push({
                        uid,
                        ...genResult,
                        queueRebuilt: queueResult.queued,
                    });
                }
            } catch (e: any) {
                console.error(`[Cron] Routine generation failed for ${uid}:`, e.message);
            }

            // Query due queue items (±2 min window, limit 50)
            const dueSnap = await getDueQueueItems(uid, now, 2, 50);

            if (dueSnap.empty) continue;

            const batch = db.batch();

            // Group by notificationId + reminderId to avoid duplicate sends
            const sentKeys = new Set<string>();

            for (const qDoc of dueSnap.docs) {
                const item = qDoc.data();
                const dedupeKey = `${item.reminderId}:${item.notificationId}:${item.channel}`;

                if (sentKeys.has(dedupeKey)) {
                    // Duplicate — just mark sent
                    batch.update(qDoc.ref, { sent: true });
                    continue;
                }
                sentKeys.add(dedupeKey);

                const dueAt = item.dueAt?.toDate ? item.dueAt.toDate() : new Date(item.dueAt);
                const tz = item.timezone || user.timezone || "UTC";
                const timeString = formatInTimeZone(dueAt, tz, "h:mm a");
                const scheduledAt = item.scheduledAt?.toDate ? item.scheduledAt.toDate() : new Date(item.scheduledAt);
                const offsetMs = dueAt.getTime() - scheduledAt.getTime();
                const offsetMin = Math.round(offsetMs / 60000);

                let prefix = "Reminder:";
                if (offsetMin >= 1440) prefix = "Tomorrow:";
                else if (offsetMin >= 60) prefix = "In 1 hour:";
                else if (offsetMin <= 0) prefix = "Now:";
                else if (offsetMin <= 5) prefix = "In 5 min:";
                else if (offsetMin <= 15) prefix = "In 15 min:";
                else if (offsetMin <= 30) prefix = "In 30 min:";

                const title = item.reminderTitle || "Untitled";
                const notes = truncateNotes(item.reminderNotes || "");
                const message = `${prefix} "${title}" is due at ${timeString}.`;

                let sent = false;

                try {
                    if (item.channel === "sms" && user.smsOptIn && user.phoneNumber && twilioClient) {
                        await twilioClient.messages.create({
                            body: notes ? `${message}\n${notes}` : message,
                            from: fromNumber,
                            to: user.phoneNumber,
                        });
                        sent = true;
                    }

                    if (item.channel === "email" && user.email && transporter) {
                        await transporter.sendMail({
                            from: `"Reminders App" <${smtpFrom}>`,
                            to: user.email,
                            subject: `${prefix} ${title}`,
                            text: notes ? `${message}\n\n${notes}` : message,
                            html: `<p>${message}</p>${notes ? `<p style="color:#666;font-size:14px;">${notes}</p>` : ""}`,
                        });
                        sent = true;
                    }

                    if (item.channel === "push" && publicKey && privateKey) {
                        const subs = await getCachedPushSubs(uid);
                        if (subs.length > 0) {
                            // ── Push body includes notes ──
                            const bodyParts = [`Due at ${timeString}`];
                            if (notes) bodyParts.push(notes);

                            const payload = JSON.stringify({
                                title: `${prefix.replace(":", "")} ${title}`,
                                body: bodyParts.join(" — "),
                                url: "/",
                                icon: "/icon-192x192.png",
                            });

                            const promises = subs.map(async (sub) => {
                                try {
                                    await webpush.sendNotification(
                                        { endpoint: sub.endpoint, keys: sub.keys } as any,
                                        payload,
                                        { headers: { Urgency: "high" } }
                                    );
                                    return true;
                                } catch (err: any) {
                                    if (err.statusCode === 410 || err.statusCode === 404) {
                                        await sub.ref.delete();
                                        pushSubCache[uid] = pushSubCache[uid]?.filter(s => s.endpoint !== sub.endpoint);
                                    }
                                    console.error(`Push failed:`, err.message);
                                    return false;
                                }
                            });
                            const results = await Promise.all(promises);
                            if (results.some(r => r)) sent = true;
                        }
                    }
                } catch (e: any) {
                    console.error(`Send failed for ${item.channel}:`, e.message);
                }

                // Mark queue item as sent (even if send failed, to prevent retry spam)
                batch.update(qDoc.ref, { sent: true });

                // Also mark the original reminder notification as sent
                if (sent) {
                    try {
                        const reminderRef = db.collection("users").doc(uid)
                            .collection("reminders").doc(item.reminderId);
                        // Read the reminder to update its notifications array
                        const reminderDoc = await reminderRef.get();
                        if (reminderDoc.exists) {
                            const rData = reminderDoc.data();
                            const notifications = rData?.notifications || [];
                            const idx = notifications.findIndex((n: any) => n.id === item.notificationId);
                            if (idx >= 0 && !notifications[idx].sent) {
                                notifications[idx].sent = true;
                                batch.update(reminderRef, { notifications, updated_at: new Date() });
                            }
                        }
                    } catch (e) {
                        // Non-critical: queue item is already marked sent
                        console.error("Failed to update reminder notification state:", e);
                    }
                }

                totalProcessed++;
                if (sent) totalSent++;
            }

            await batch.commit();
            details.push({ uid, processed: sentKeys.size });
        }

        return NextResponse.json({
            success: true,
            timestamp: now.toISOString(),
            stats: {
                totalProcessed,
                totalSent,
                usersChecked: Object.keys(userCache).length,
            },
            routineGeneration: routineStats,
            details,
        });
    } catch (error: any) {
        console.error("Cron Run Fatal Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
