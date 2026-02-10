import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { sendSMS } from "./sms";
import { sendEmail } from "./email";

const db = admin.firestore();

type NotificationType = 'sms' | 'push' | 'email' | 'both';

interface NotificationSetting {
    id: string;
    offsetMinutes: number;
    type: NotificationType;
    sent: boolean;
}

export const checkReminders = onSchedule("every 5 minutes", async (event) => {
    logger.info("Checking reminders...", { structuredData: true });

    const now = new Date();
    const remindersRef = db.collectionGroup("reminders");

    const snapshot = await remindersRef.where("status", "==", "pending").get();

    if (snapshot.empty) {
        logger.info("No pending reminders found.");
        return;
    }

    const batch = db.batch();
    let commitCount = 0;

    // Cache user profiles to avoid duplicate fetches
    const userCache: Record<string, any> = {};

    for (const doc of snapshot.docs) {
        const reminder = doc.data();
        const uid = reminder.uid;
        const dueAt = reminder.due_at?.toDate ? reminder.due_at.toDate() : new Date(reminder.due_at);
        const notifications = reminder.notifications as NotificationSetting[] | undefined;

        if (!uid || !notifications || !Array.isArray(notifications)) continue;

        let reminderUpdated = false;
        const updatedNotifications = [...notifications];

        // Fetch user if not in cache
        if (!userCache[uid]) {
            const userDoc = await db.collection("users").doc(uid).get();
            if (userDoc.exists) {
                userCache[uid] = userDoc.data();
            } else {
                userCache[uid] = null;
            }
        }
        const user = userCache[uid];
        if (!user) continue;

        for (let i = 0; i < updatedNotifications.length; i++) {
            const notification = updatedNotifications[i];

            if (notification.sent) continue;

            // Calculate trigger time: due_at - offset
            const triggerTime = new Date(dueAt.getTime() - notification.offsetMinutes * 60000);

            if (triggerTime <= now) {
                let sent = false;
                const timeString = dueAt.toLocaleString('en-US', {
                    timeZone: reminder.timezone || user.timezone || 'UTC'
                });

                let prefix = "Reminder:";
                if (notification.offsetMinutes === 1440) prefix = "Tomorrow:";
                else if (notification.offsetMinutes === 2880) prefix = "In 2 days:";
                else if (notification.offsetMinutes === 180) prefix = "In 3 hours:";
                else if (notification.offsetMinutes === 60) prefix = "In 1 hour:";
                else if (notification.offsetMinutes === 30) prefix = "In 30 min:";
                else if (notification.offsetMinutes === 15) prefix = "In 15 min:";
                else if (notification.offsetMinutes === 5) prefix = "In 5 min:";
                else if (notification.offsetMinutes === 0) prefix = "Now:";

                const message = `${prefix} "${reminder.title}" is due at ${timeString}.`;

                // Handle SMS
                if (notification.type === 'sms' || notification.type === 'both') {
                    if (user.smsOptIn && user.phoneNumber) {
                        try {
                            const success = await sendSMS(user.phoneNumber, message);
                            if (success) sent = true;
                        } catch (e) {
                            logger.error(`Failed to send SMS for ${doc.id}`, e);
                        }
                    }
                }

                // Handle Email
                if (notification.type === 'email' || notification.type === 'both') {
                    if (user.email) {
                        try {
                            const subject = `${prefix} ${reminder.title}`;
                            const success = await sendEmail(user.email, subject, message);
                            if (success) sent = true;
                        } catch (e) {
                            logger.error(`Failed to send email for ${doc.id}`, e);
                        }
                    }
                }

                // Handle Push (placeholder - marks as sent to prevent loops)
                if (notification.type === 'push' || notification.type === 'both') {
                    // TODO: Implement FCM push notifications
                    // For now, mark as sent to prevent infinite retry
                    if (notification.type === 'push') sent = true;
                }

                if (sent) {
                    updatedNotifications[i].sent = true;
                    reminderUpdated = true;
                    logger.info(`Sent ${notification.type} notification for ${doc.id} (offset: ${notification.offsetMinutes})`);
                }
            }
        }

        if (reminderUpdated) {
            batch.update(doc.ref, {
                notifications: updatedNotifications,
                updated_at: admin.firestore.FieldValue.serverTimestamp()
            });
            commitCount++;
        }
    }

    if (commitCount > 0) {
        await batch.commit();
        logger.info(`Updated ${commitCount} reminders with sent notifications.`);
    }
});
