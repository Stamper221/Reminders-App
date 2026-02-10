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

    const reminderData: Omit<Reminder, "id"> = {
        uid,
        title: input.title,
        notes: input.notes,
        due_at: dueAtTimestamp,
        timezone: input.timezone,
        status: 'pending',
        notifications: input.notifications.map(n => ({ ...n, sent: false })),
        created_at: now,
        updated_at: now,
    };

    return await addDoc(collectionRef, reminderData);
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
        // Typically snooze means "don't show until then" or "remind me then".
        // If we want to resend SMS, we might need new logic.
        // For now, simple status update.
    });
};
