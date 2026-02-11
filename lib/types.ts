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
    repeatRule?: RepeatRule;
    routineId?: string;
    routineDate?: string; // YYYY-MM-DD for checking duplicates
    originId?: string; // ID of the reminder that spawned this one
    rootId?: string; // ID of the first reminder in the series (for updates)
    generationStatus?: 'pending' | 'created'; // For chain generation
    created_at: Timestamp;
    updated_at: Timestamp;
}

export interface RepeatRule {
    frequency: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';
    interval: number; // e.g. every X days/weeks
    weekdays?: number[]; // 0=Sun, 1=Mon, etc. (for weekly/custom)
    endCondition?: {
        type: 'never' | 'date' | 'count';
        untilDate?: Timestamp;
        count?: number;
    };
    skipWeekends?: boolean;
    startDate?: Timestamp; // Anchor for interval calculations
}

export interface RoutineStep {
    id: string; // internal ID within routine
    title: string;
    notes?: string;
    time: string; // HH:mm (24h)
    notifications: NotificationSetting[];
}

export interface Routine {
    id?: string;
    uid: string;
    title: string;
    active: boolean;
    timezone: string; // IANA
    steps: RoutineStep[];
    schedule: {
        type: 'daily' | 'weekly' | 'custom';
        days?: number[]; // 0-6
        interval?: number; // every X days
        nextRun?: Timestamp;
        lastRun?: Timestamp;
    };
    created_at: Timestamp;
    updated_at: Timestamp;
}

export interface CreateReminderInput {
    title: string;
    notes?: string;
    due_at: Date; // Input as Date
    timezone: string;
    notifications: Omit<NotificationSetting, 'sent'>[]; // Input notifications
    repeatRule?: RepeatRule;
}
