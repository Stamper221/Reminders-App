"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { useReminders } from "@/components/providers/ReminderProvider";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Bell } from "lucide-react";

/**
 * InAppNotifier — checks pending reminders from the shared ReminderProvider
 * and fires toast notifications when a reminder's trigger time is reached.
 * Only fires once per notification (tracked in a Set).
 * 
 * IMPORTANT: This component no longer creates its own Firestore listener.
 * It consumes data from the centralized ReminderProvider.
 */
import { useSound } from "@/components/providers/SoundProvider";

export function InAppNotifier() {
    const { user } = useAuth();
    const { playNotification } = useSound();
    const firedRef = useRef<Set<string>>(new Set());
    // Use shared data from provider — NO separate listener
    const { allActiveReminders: reminders } = useReminders();

    // Check every 30s for due notifications
    useEffect(() => {
        const check = () => {
            const now = new Date();

            for (const reminder of reminders) {
                const dueAt = reminder.due_at?.toDate ? reminder.due_at.toDate() : new Date(reminder.due_at as any);

                for (const notif of reminder.notifications) {
                    if (notif.sent) continue;

                    const triggerTime = new Date(dueAt.getTime() - notif.offsetMinutes * 60000);
                    const key = `${reminder.id}-${notif.id}`;

                    if (triggerTime <= now && !firedRef.current.has(key)) {
                        firedRef.current.add(key);

                        const isPush = notif.type === 'push' || notif.type === 'both' || notif.type === 'all';
                        const isEmail = notif.type === 'email' || notif.type === 'both' || notif.type === 'all';

                        if (isPush) {
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

                            // Also try browser Notification API
                            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
                                new Notification(`${prefix}: ${reminder.title}`, {
                                    body: `Due at ${dueAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`,
                                    icon: "/icon-192x192.png",
                                });
                            }
                        }

                        if ((isEmail || isPush) && user) {
                            user.getIdToken().then(token => {
                                fetch("/api/reminders/trigger", {
                                    method: "POST",
                                    headers: {
                                        "Content-Type": "application/json",
                                        "Authorization": `Bearer ${token}`
                                    },
                                    body: JSON.stringify({
                                        reminderId: reminder.id,
                                        notificationId: notif.id
                                    })
                                }).then(res => {
                                    if (res.ok && isEmail && !isPush) {
                                        toast.success(`Email sent: ${reminder.title}`);
                                    }
                                }).catch(console.error);
                            });
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

    return null; // Invisible component
}
