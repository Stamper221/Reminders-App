"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkReminders = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const logger = __importStar(require("firebase-functions/logger"));
const admin = __importStar(require("firebase-admin"));
const sms_1 = require("./sms");
const email_1 = require("./email");
const db = admin.firestore();
exports.checkReminders = (0, scheduler_1.onSchedule)("every 5 minutes", async (event) => {
    var _a;
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
    const userCache = {};
    for (const doc of snapshot.docs) {
        const reminder = doc.data();
        const uid = reminder.uid;
        const dueAt = ((_a = reminder.due_at) === null || _a === void 0 ? void 0 : _a.toDate) ? reminder.due_at.toDate() : new Date(reminder.due_at);
        const notifications = reminder.notifications;
        if (!uid || !notifications || !Array.isArray(notifications))
            continue;
        let reminderUpdated = false;
        const updatedNotifications = [...notifications];
        // Fetch user if not in cache
        if (!userCache[uid]) {
            const userDoc = await db.collection("users").doc(uid).get();
            if (userDoc.exists) {
                userCache[uid] = userDoc.data();
            }
            else {
                userCache[uid] = null;
            }
        }
        const user = userCache[uid];
        if (!user)
            continue;
        for (let i = 0; i < updatedNotifications.length; i++) {
            const notification = updatedNotifications[i];
            if (notification.sent)
                continue;
            // Calculate trigger time: due_at - offset
            const triggerTime = new Date(dueAt.getTime() - notification.offsetMinutes * 60000);
            if (triggerTime <= now) {
                let sent = false;
                const timeString = dueAt.toLocaleString('en-US', {
                    timeZone: reminder.timezone || user.timezone || 'UTC'
                });
                let prefix = "Reminder:";
                if (notification.offsetMinutes === 1440)
                    prefix = "Tomorrow:";
                else if (notification.offsetMinutes === 2880)
                    prefix = "In 2 days:";
                else if (notification.offsetMinutes === 180)
                    prefix = "In 3 hours:";
                else if (notification.offsetMinutes === 60)
                    prefix = "In 1 hour:";
                else if (notification.offsetMinutes === 30)
                    prefix = "In 30 min:";
                else if (notification.offsetMinutes === 15)
                    prefix = "In 15 min:";
                else if (notification.offsetMinutes === 5)
                    prefix = "In 5 min:";
                else if (notification.offsetMinutes === 0)
                    prefix = "Now:";
                const message = `${prefix} "${reminder.title}" is due at ${timeString}.`;
                // Handle SMS
                if (notification.type === 'sms' || notification.type === 'both') {
                    if (user.smsOptIn && user.phoneNumber) {
                        try {
                            const success = await (0, sms_1.sendSMS)(user.phoneNumber, message);
                            if (success)
                                sent = true;
                        }
                        catch (e) {
                            logger.error(`Failed to send SMS for ${doc.id}`, e);
                        }
                    }
                }
                // Handle Email
                if (notification.type === 'email' || notification.type === 'both') {
                    if (user.email) {
                        try {
                            const subject = `${prefix} ${reminder.title}`;
                            const success = await (0, email_1.sendEmail)(user.email, subject, message);
                            if (success)
                                sent = true;
                        }
                        catch (e) {
                            logger.error(`Failed to send email for ${doc.id}`, e);
                        }
                    }
                }
                // Handle Push (placeholder - marks as sent to prevent loops)
                if (notification.type === 'push' || notification.type === 'both') {
                    // TODO: Implement FCM push notifications
                    // For now, mark as sent to prevent infinite retry
                    if (notification.type === 'push')
                        sent = true;
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
//# sourceMappingURL=scheduler.js.map