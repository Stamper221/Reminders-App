import { db } from "@/lib/firebase/client";
import {
    collection, addDoc, updateDoc, deleteDoc, doc,
    Timestamp, serverTimestamp, query, where, orderBy, onSnapshot
} from "firebase/firestore";
import { Reminder, CreateReminderInput, ReminderStatus } from "@/lib/types";

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

    const reminderData: Omit<Reminder, "id"> = {
        uid,
        title: input.title,
        notes: input.notes,
        due_at: dueAtTimestamp,
        timezone: input.timezone,
        status: 'pending',
        notifications: input.notifications.map(n => ({ ...n, sent: false })),
        repeatRule: input.repeatRule,
        generationStatus: input.repeatRule ? 'pending' : undefined,
        created_at: now,
        updated_at: now,
    };

    const docRef = await addDoc(collectionRef, reminderData);

    // If repeated, set rootId to itself
    if (input.repeatRule) {
        await updateDoc(docRef, { rootId: docRef.id });
    }

    return docRef;
};

export const updateReminder = async (uid: string, reminderId: string, updates: Partial<Reminder>) => {
    const docRef = doc(db, `users/${uid}/reminders`, reminderId);

    // If due_at is updated, reset notification flags if passing new time
    const dataToUpdate: any = {
        ...updates,
        updated_at: serverTimestamp()
    };

    if (updates.due_at) {
        // Logic to reset flags could depend on how far in future, 
        // but usually if time changes, we want to re-notify if pending.
        // However, if we move it to tomorrow, 24h might check again.
        // Simplest approach: reset flags if due_at changes.
        // For new array model, we might need to fetch the existing one to reset 'sent' to false.
        // But here we can't easily modify the array inside the update unless we read it first or use a script.
        // For MVP: We will require the client to pass the generic reset if they want it, or we handle it in the UI.
        // OR we just leave it for now and fix it in the Form logic.

        // dataToUpdate.notify_24h_sent = false; // DEPRECATED
    }

    return await updateDoc(docRef, dataToUpdate);
};

export const deleteReminder = async (uid: string, reminderId: string) => {
    const docRef = doc(db, `users/${uid}/reminders`, reminderId);
    return await deleteDoc(docRef);
};

export const toggleReminderStatus = async (uid: string, reminderId: string, currentStatus: ReminderStatus) => {
    const newStatus: ReminderStatus = currentStatus === 'done' ? 'pending' : 'done';
    return await updateReminder(uid, reminderId, { status: newStatus });
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
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const collRef = collection(db, `users/${uid}/reminders`);
    const q = query(collRef, where("status", "==", "done"));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return 0;

    const batch = writeBatch(db);
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    return snapshot.size;
};

/**
 * Clears ALL reminders (used from calendar).
 */
export const clearAllReminders = async (uid: string) => {
    const { getDocs, writeBatch } = await import("firebase/firestore");
    const collRef = collection(db, `users/${uid}/reminders`);
    const snapshot = await getDocs(collRef);
    if (snapshot.empty) return 0;

    // Firestore batch limit is 500; chunk if needed
    const chunks = [];
    for (let i = 0; i < snapshot.docs.length; i += 500) {
        chunks.push(snapshot.docs.slice(i, i + 500));
    }
    for (const chunk of chunks) {
        const batch = writeBatch(db);
        chunk.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    }
    return snapshot.size;
};
