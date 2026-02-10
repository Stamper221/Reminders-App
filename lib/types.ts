import { Timestamp } from "firebase/firestore";

export interface UserProfile {
    uid: string;
    email: string | null;
    phoneNumber?: string;
    smsOptIn: boolean;
    timezone: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

export type ReminderStatus = 'pending' | 'done' | 'snoozed';

export type NotificationType = 'sms' | 'push' | 'email' | 'both';

export interface NotificationSetting {
    id: string; // unique ID for optimization/tracking
    offsetMinutes: number; // e.g. 0 (at time), 60 (1h before), 1440 (24h before)
    type: NotificationType;
    sent: boolean;
}

export interface Reminder {
    id?: string; // Firestore document ID
    uid: string; // User ID (owner)
    title: string;
    notes?: string;
    due_at: Timestamp; // stored as UTC Timestamp
    timezone: string; // IANA timezone string (e.g., 'America/New_York')
    status: ReminderStatus;
    snoozed_until?: Timestamp | null;
    notifications: NotificationSetting[]; // New flexible notification model
    created_at: Timestamp;
    updated_at: Timestamp;
}

export interface CreateReminderInput {
    title: string;
    notes?: string;
    due_at: Date; // Input as Date
    timezone: string;
    notifications: Omit<NotificationSetting, 'sent'>[]; // Input notifications
}
