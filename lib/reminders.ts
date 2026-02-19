import { db } from "@/lib/firebase/client";
import {
    collection, addDoc, updateDoc, deleteDoc, doc,
    Timestamp, serverTimestamp, query, where, orderBy, onSnapshot,
    getDocs, writeBatch, deleteField
} from "firebase/firestore";
import { Reminder, CreateReminderInput, ReminderStatus } from "@/lib/types";
import { syncReminderQueue, removeReminderQueue } from "@/lib/queueSync";

const REMINDERS_COLLECTION = (uid: string) => `users/${uid}/reminders`;

export const addReminder = async (uid: string, input: CreateReminderInput) => {
    const collectionRef = collection(db, `users/${uid}/reminders`);

    // Convert JS Date to Firestore Timestamp
    const dueAtTimestamp = Timestamp.fromDate(input.due_at);
    const now = Timestamp.now();

    // Set startDate for repeatRule if missing
    if (input.repeatRule && !input.repeatRule.startDate) {
        input.repeatRule.startDate = dueAtTimestamp;
    }

    const reminderData: Record<string, any> = {
        uid,
        title: input.title,
        notes: input.notes || '',
        due_at: dueAtTimestamp,
        timezone: input.timezone,
        status: 'pending',
        notifications: input.notifications.map(n => ({ ...n, sent: false })),
        created_at: now,
        updated_at: now,
    };

    if (input.repeatRule) {
        reminderData.repeatRule = input.repeatRule;
        reminderData.generationStatus = 'pending';
    }

    const docRef = await addDoc(collectionRef, reminderData);

    // If repeated, set rootId to itself
    if (input.repeatRule) {
        await updateDoc(docRef, { rootId: docRef.id });
    }

    // Sync notification queue (fire-and-forget)
    syncReminderQueue(docRef.id);

    return docRef;
};

export const updateReminder = async (uid: string, reminderId: string, updates: Partial<Reminder> & { repeatRule?: any }) => {
    const docRef = doc(db, `users/${uid}/reminders`, reminderId);

    // Strip undefined values — Firestore rejects them
    const cleanUpdates: Record<string, any> = {};
    for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined) {
            cleanUpdates[key] = value;
        }
    }
    cleanUpdates.updated_at = serverTimestamp();

    // If repeatRule is explicitly set to null, use deleteField()
    // and also remove generationStatus
    if ('repeatRule' in updates && updates.repeatRule === null) {
        cleanUpdates.repeatRule = deleteField();
        cleanUpdates.generationStatus = deleteField();
    }

    await updateDoc(docRef, cleanUpdates);

    // Sync notification queue (fire-and-forget)
    syncReminderQueue(reminderId);

    return;
};

export const deleteReminder = async (uid: string, reminderId: string) => {
    const docRef = doc(db, `users/${uid}/reminders`, reminderId);
    await deleteDoc(docRef);
    // Remove from notification queue (fire-and-forget)
    removeReminderQueue(reminderId);
};

export const toggleReminderStatus = async (uid: string, reminderId: string, currentStatus: ReminderStatus) => {
    const newStatus: ReminderStatus = currentStatus === 'done' ? 'pending' : 'done';
    await updateReminder(uid, reminderId, { status: newStatus });

    // On complete: remove queue items. On uncomplete: sync will re-create them.
    if (newStatus === 'done') {
        removeReminderQueue(reminderId);
    } else {
        syncReminderQueue(reminderId);
    }
};

export const snoozeReminder = async (uid: string, reminderId: string, until: Date) => {
    const snoozeTimestamp = Timestamp.fromDate(until);
    return await updateReminder(uid, reminderId, {
        status: 'snoozed',
        snoozed_until: snoozeTimestamp,
    });
};

/**
 * Clears all upcoming (pending/snoozed) reminders including repeat chains.
 */
export const clearUpcomingReminders = async (uid: string) => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const collRef = collection(db, `users/${uid}/reminders`);
    const q = query(collRef, where("status", "in", ["pending", "snoozed"]));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return 0;

    const batch = writeBatch(db);
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    return snapshot.size;
};

/**
 * Clears all completed (done) reminders.
 */
export const clearCompletedReminders = async (uid: string) => {
    const collRef = collection(db, `users/${uid}/reminders`);
    // Fetch ALL reminders to verify if 'status' index is the issue
    // This uses the default __name__ index which is always present
    const snapshot = await getDocs(collRef);
    if (snapshot.empty) return 0;

    const completedDocs = snapshot.docs.filter(d => d.data().status === "done");
    if (completedDocs.length === 0) return 0;

    // Use deleteDoc in parallel chunks to avoid batch issues
    const chunkSize = 50;
    for (let i = 0; i < completedDocs.length; i += chunkSize) {
        const chunk = completedDocs.slice(i, i + chunkSize);
        await Promise.all(chunk.map(d => deleteDoc(d.ref)));
    }
    return completedDocs.length;
};

/**
 * Clears ALL reminders (used from calendar).
 */
export const clearAllReminders = async (uid: string) => {
    const collRef = collection(db, `users/${uid}/reminders`);
    const snapshot = await getDocs(collRef);
    if (snapshot.empty) return 0;

    // Use deleteDoc in parallel chunks
    const chunkSize = 50;
    for (let i = 0; i < snapshot.docs.length; i += chunkSize) {
        const chunk = snapshot.docs.slice(i, i + chunkSize);
        await Promise.all(chunk.map(d => deleteDoc(d.ref)));
    }
    return snapshot.size;
};
