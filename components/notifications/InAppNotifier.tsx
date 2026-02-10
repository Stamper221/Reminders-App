"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { db } from "@/lib/firebase/client";
import { Reminder } from "@/lib/types";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Bell } from "lucide-react";

/**
 * InAppNotifier — polls pending reminders and fires toast notifications
 * when a reminder's trigger time (due_at - offset) is reached.
 * Only fires once per notification (tracked in a Set).
 */
import { useSound } from "@/components/providers/SoundProvider";

// ...

export function InAppNotifier() {
    const { user } = useAuth();
    const { playNotification } = useSound();
    const firedRef = useRef<Set<string>>(new Set());
    const [reminders, setReminders] = useState<Reminder[]>([]);

    // Listen to reminders
    useEffect(() => {
        if (!user) return;

        const remindersRef = collection(db, "users", user.uid, "reminders");
        const q = query(remindersRef, orderBy("due_at", "asc"));

        const unsub = onSnapshot(
            q,
            (snapshot) => {
                const items = snapshot.docs.map(doc => {
                    const data = doc.data() as any;
                    if (!data.notifications) data.notifications = [];
                    return { id: doc.id, ...data } as Reminder;
                });
                setReminders(items.filter(r => r.status === "pending"));
            },
            (err) => {
                console.error("InAppNotifier snapshot error:", err);
            }
        );

        return () => unsub();
    }, [user]);

    // Check every 30s for due notifications
    useEffect(() => {
        const check = () => {
            const now = new Date();

            for (const reminder of reminders) {
                const dueAt = reminder.due_at.toDate();

                for (const notif of reminder.notifications) {
                    // Only fire for push-type or both-type notifications (in-app counts as push)
                    if (notif.type !== "push" && notif.type !== "both") continue;
                    if (notif.sent) continue;

                    const triggerTime = new Date(dueAt.getTime() - notif.offsetMinutes * 60000);
                    const key = `${reminder.id}-${notif.id}`;

                    if (triggerTime <= now && !firedRef.current.has(key)) {
                        firedRef.current.add(key);
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

                        // Also try browser Notification API if permission granted
                        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
                            new Notification(`${prefix}: ${reminder.title}`, {
                                body: `Due at ${dueAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`,
                                icon: "/icon-192x192.png",
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
