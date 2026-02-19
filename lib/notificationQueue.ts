/**
 * Notification Queue — Server-side helpers (firebase-admin)
 *
 * Manages the precomputed notification_queue subcollection for each user.
 * Queue items are denormalized so the minute-runner can send notifications
 * with ZERO reads back to the reminders collection.
 */

import { getFirestore } from "firebase-admin/firestore";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QueueItem {
    reminderId: string;
    reminderTitle: string;
    reminderNotes: string;
    scheduledAt: Date;          // exact trigger time (due_at - offsetMinutes)
    dueAt: Date;                // the reminder's due_at
    timezone: string;
    channel: "push" | "sms" | "email";
    notificationId: string;     // maps to reminder.notifications[].id
    sent: boolean;
    routineId?: string;         // for cascade cleanup on routine delete
    rootId?: string;            // for repeat chain cleanup
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getQueueRef(uid: string) {
    const db = getFirestore();
    return db.collection("users").doc(uid).collection("notification_queue");
}

function toDate(ts: any): Date {
    if (!ts) return new Date();
    if (ts instanceof Date) return ts;
    if (typeof ts.toDate === "function") return ts.toDate();
    if (ts.seconds !== undefined) return new Date(ts.seconds * 1000);
    if (ts._seconds !== undefined) return new Date(ts._seconds * 1000);
    return new Date(ts);
}

/** Expand notification type to individual channels */
function expandChannels(type: string): ("push" | "sms" | "email")[] {
    switch (type) {
        case "push": return ["push"];
        case "sms": return ["sms"];
        case "email": return ["email"];
        case "both": return ["push", "sms", "email"];
        case "all": return ["push", "sms", "email"];
        default: return ["push"];
    }
}

/** Build queue items from a reminder document */
function buildQueueItems(reminderId: string, reminder: any): Omit<QueueItem, "sent">[] {
    const items: Omit<QueueItem, "sent">[] = [];
    const dueAt = toDate(reminder.due_at);
    const notifications = reminder.notifications || [];

    for (const notif of notifications) {
        if (notif.sent) continue; // Already sent — don't re-queue

        const scheduledAt = new Date(dueAt.getTime() - notif.offsetMinutes * 60000);
        const channels = expandChannels(notif.type);

        for (const channel of channels) {
            items.push({
                reminderId,
                reminderTitle: reminder.title || "Untitled",
                reminderNotes: reminder.notes || "",
                scheduledAt,
                dueAt,
                timezone: reminder.timezone || "UTC",
                channel,
                notificationId: notif.id,
                routineId: reminder.routineId || null,
                rootId: reminder.rootId || null,
            });
        }
    }
    return items;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Rebuild the entire notification queue for a user.
 * Only queues notifications for pending/snoozed reminders due within the horizon.
 * Called once per day by the daily rebuild endpoint.
 */
export async function rebuildQueueForUser(uid: string, horizonHours: number = 48) {
    const db = getFirestore();
    const queueRef = getQueueRef(uid);

    // 1. Delete ALL existing unsent queue items (sent ones are historical, can stay or be cleaned)
    const existingUnsent = await queueRef.where("sent", "==", false).get();
    const deleteBatch = db.batch();
    for (const doc of existingUnsent.docs) {
        deleteBatch.delete(doc.ref);
    }
    if (!existingUnsent.empty) await deleteBatch.commit();

    // 2. Query pending/snoozed reminders with due_at within horizon
    const now = new Date();
    const horizonEnd = new Date(now.getTime() + horizonHours * 60 * 60 * 1000);
    // Also include reminders due in the past 2 hours (for notifications with pre-offsets)
    const horizonStart = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const remindersRef = db.collection("users").doc(uid).collection("reminders");
    const snapshot = await remindersRef
        .where("status", "in", ["pending", "snoozed"])
        .where("due_at", ">=", horizonStart)
        .where("due_at", "<=", horizonEnd)
        .get();

    if (snapshot.empty) return { queued: 0, remindersScanned: 0 };

    // 3. Build queue items
    const writeBatch = db.batch();
    let queuedCount = 0;

    for (const doc of snapshot.docs) {
        const reminder = doc.data();
        const items = buildQueueItems(doc.id, reminder);

        for (const item of items) {
            // Only queue items that are in the future (or within 2 min past for catch-up)
            const twoMinAgo = new Date(now.getTime() - 2 * 60 * 1000);
            if (item.scheduledAt >= twoMinAgo) {
                const newDoc = queueRef.doc();
                writeBatch.set(newDoc, { ...item, sent: false });
                queuedCount++;
            }
        }
    }

    if (queuedCount > 0) await writeBatch.commit();

    return { queued: queuedCount, remindersScanned: snapshot.size };
}

/**
 * Sync queue items for a single reminder (delta update).
 * Called after create/edit operations.
 * Removes old queue items for this reminder, then creates new ones.
 */
export async function syncQueueForReminder(uid: string, reminderId: string, reminder?: any) {
    const db = getFirestore();
    const queueRef = getQueueRef(uid);

    // 1. Remove existing unsent queue items for this reminder
    await removeQueueForReminder(uid, reminderId);

    // 2. If no reminder data provided (deleted/completed), we're done
    if (!reminder) return { queued: 0 };

    // 3. Only queue if reminder is pending/snoozed
    if (reminder.status !== "pending" && reminder.status !== "snoozed") {
        return { queued: 0 };
    }

    // 4. Build and write new queue items
    const items = buildQueueItems(reminderId, reminder);
    const now = new Date();
    const twoMinAgo = new Date(now.getTime() - 2 * 60 * 1000);

    const batch = db.batch();
    let count = 0;

    for (const item of items) {
        if (item.scheduledAt >= twoMinAgo) {
            const newDoc = queueRef.doc();
            batch.set(newDoc, { ...item, sent: false });
            count++;
        }
    }

    if (count > 0) await batch.commit();
    return { queued: count };
}

/**
 * Remove all unsent queue items for a specific reminder.
 * Called on delete/complete.
 */
export async function removeQueueForReminder(uid: string, reminderId: string) {
    const db = getFirestore();
    const queueRef = getQueueRef(uid);

    const existing = await queueRef
        .where("reminderId", "==", reminderId)
        .where("sent", "==", false)
        .get();

    if (existing.empty) return 0;

    const batch = db.batch();
    for (const doc of existing.docs) {
        batch.delete(doc.ref);
    }
    await batch.commit();
    return existing.size;
}

/**
 * Remove all unsent queue items for all reminders from a routine.
 * Called on routine delete/pause.
 */
export async function removeQueueForRoutine(uid: string, routineId: string) {
    const db = getFirestore();
    const queueRef = getQueueRef(uid);

    const existing = await queueRef
        .where("routineId", "==", routineId)
        .where("sent", "==", false)
        .get();

    if (existing.empty) return 0;

    const batch = db.batch();
    for (const doc of existing.docs) {
        batch.delete(doc.ref);
    }
    await batch.commit();
    return existing.size;
}

/**
 * Get due queue items within a window. Used by the minute-runner.
 * Window: [now - windowMinutes, now] — NEVER returns future items.
 * This ensures notifications fire at or after their scheduledAt time,
 * never early. The late window (default 2 min) handles cron drift.
 */
export async function getDueQueueItems(uid: string, now: Date, windowMinutes: number = 2, maxItems: number = 50) {
    const queueRef = getQueueRef(uid);
    const windowStart = new Date(now.getTime() - windowMinutes * 60 * 1000);

    const snapshot = await queueRef
        .where("sent", "==", false)
        .where("scheduledAt", ">=", windowStart)
        .where("scheduledAt", "<=", now)
        .limit(maxItems)
        .get();

    return snapshot;
}
