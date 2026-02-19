"use client";

import { useReminders } from "@/components/providers/ReminderProvider";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Bell } from "lucide-react";

/**
 * InAppNotifier — shows in-app toast notifications when a reminder is due.
 * 
 * IMPORTANT: This component is CLIENT-ONLY visual feedback.
 * It does NOT send push/SMS/email. All server-driven notifications
 * are handled exclusively by the cron queue system.
 * 
 * It only:
 * - Shows a toast in the app when a reminder's trigger time passes
 * - Shows a browser Notification API popup (if permitted)
 * - Plays a notification sound
 * 
 * It does NOT:
 * - Call any server endpoints
 * - Trigger push notifications
 * - Modify any Firestore data
 */
import { useSound } from "@/components/providers/SoundProvider";

export function InAppNotifier() {
    const { playNotification } = useSound();
    const firedRef = useRef<Set<string>>(new Set());
    const { allActiveReminders: reminders } = useReminders();

    useEffect(() => {
        const check = () => {
            const now = new Date();

            for (const reminder of reminders) {
                const dueAt = reminder.due_at?.toDate ? reminder.due_at.toDate() : new Date(reminder.due_at as any);

                for (const notif of reminder.notifications) {
                    if (notif.sent) continue;

                    const triggerTime = new Date(dueAt.getTime() - notif.offsetMinutes * 60000);
                    const key = `${reminder.id}-${notif.id}`;

                    // Only show toasts for notifications that are due NOW
                    // but not more than 5 minutes old (avoid spam on app open)
                    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);

                    if (triggerTime <= now && triggerTime >= fiveMinAgo && !firedRef.current.has(key)) {
                        firedRef.current.add(key);

                        const isPush = notif.type === 'push' || notif.type === 'both' || notif.type === 'all';
                        if (!isPush) continue; // Only show toasts for push-type notifications

                        playNotification();

                        let prefix = "Reminder";
                        if (notif.offsetMinutes === 0) prefix = "⏰ Now";
                        else if (notif.offsetMinutes <= 5) prefix = "⏰ In 5 min";
                        else if (notif.offsetMinutes <= 15) prefix = "🔔 In 15 min";
                        else if (notif.offsetMinutes <= 30) prefix = "🔔 In 30 min";
                        else if (notif.offsetMinutes <= 60) prefix = "🔔 In 1 hour";
                        else prefix = "🔔 Upcoming";

                        toast(
                            `${prefix}: ${reminder.title}`,
                            {
                                description: dueAt.toLocaleString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                }),
                                duration: 10000,
                                icon: <Bell className="h-4 w-4 text-primary" />,
                            }
                        );

                        // Browser Notification API (visual only, not push)
                        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
                            try {
                                new Notification(`${prefix}: ${reminder.title}`, {
                                    body: `Due at ${dueAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`,
                                    icon: "/icon-192x192.png",
                                });
                            } catch (e) {
                                // Notification API may fail on some mobile browsers
                            }
                        }
                    }
                }
            }
        };

        // Check immediately and then every 30 seconds
        check();
        const interval = setInterval(check, 30000);
        return () => clearInterval(interval);
    }, [reminders]);

    // Request notification permission on mount
    useEffect(() => {
        if (typeof Notification !== "undefined" && Notification.permission === "default") {
            Notification.requestPermission();
        }
    }, []);

    return null;
}
