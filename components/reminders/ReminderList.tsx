"use client";

import { useAuth } from "@/components/providers/AuthProvider";
import { db } from "@/lib/firebase/client";
import { Reminder } from "@/lib/types";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { ReminderCard } from "./ReminderCard";
import { CalendarOff } from "lucide-react";
import { useReminderModal } from "@/components/providers/ReminderModalProvider";
import { Skeleton } from "@/components/ui/skeleton";
import { AnimatePresence, motion } from "framer-motion";

interface ReminderListProps {
    filter: "today" | "upcoming" | "all" | "completed";
}

function ReminderListSkeleton() {
    return (
        <div className="space-y-3 max-w-2xl mx-auto">
            {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-4 rounded-xl border bg-card">
                    <Skeleton className="h-6 w-6 rounded-full shrink-0" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/5" />
                        <Skeleton className="h-3 w-2/5" />
                    </div>
                </div>
            ))}
        </div>
    );
}

export function ReminderList({ filter }: ReminderListProps) {
    const { user } = useAuth();
    const { openEdit } = useReminderModal();
    const [reminders, setReminders] = useState<Reminder[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;

        const remindersRef = collection(db, "users", user.uid, "reminders");

        // Build the query — use simple queries that don't require composite indexes
        // as a fallback. All filtering is done client-side which is fine for personal data.
        const q = query(remindersRef, orderBy("due_at", "asc"));

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                setError(null);
                const items = snapshot.docs.map(doc => {
                    const data = doc.data() as any;
                    if (!data.notifications) {
                        data.notifications = [];
                    }
                    return { id: doc.id, ...data } as Reminder;
                });

                // Client-side filtering — avoids needing composite indexes entirely
                let filtered = items;
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);

                if (filter === "completed") {
                    filtered = items
                        .filter(r => r.status === "done")
                        .sort((a, b) => b.due_at.toDate().getTime() - a.due_at.toDate().getTime());
                } else if (filter === "today") {
                    filtered = items.filter(r => {
                        if (r.status === "done") return false;
                        const d = r.due_at.toDate();
                        return d >= today && d < tomorrow;
                    });
                } else if (filter === "upcoming") {
                    filtered = items.filter(r => {
                        if (r.status === "done") return false;
                        const d = r.due_at.toDate();
                        return d >= tomorrow;
                    });
                }

                setReminders(filtered);
                setLoading(false);
            },
            (err) => {
                // Error handler — if the query fails (e.g. missing index),
                // stop loading and show empty state instead of infinite skeleton
                console.error("Firestore snapshot error:", err);
                setError(err.message);
                setReminders([]);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [user, filter]);

    if (loading) {
        return <ReminderListSkeleton />;
    }

    if (error) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="text-center py-16 text-muted-foreground"
            >
                <div className="flex justify-center mb-4">
                    <div className="h-16 w-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
                        <CalendarOff className="h-8 w-8 text-destructive opacity-50" />
                    </div>
                </div>
                <p className="text-base font-medium text-destructive">Something went wrong</p>
                <p className="text-sm mt-1 opacity-70 max-w-md mx-auto">
                    Could not load reminders. Try refreshing.
                </p>
            </motion.div>
        );
    }

    if (reminders.length === 0) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="text-center py-16 text-muted-foreground"
            >
                <div className="flex justify-center mb-4">
                    <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center">
                        <CalendarOff className="h-8 w-8 opacity-30" />
                    </div>
                </div>
                <p className="text-base font-medium">No reminders here</p>
                <p className="text-sm mt-1 opacity-70">
                    {filter === "completed"
                        ? "Completed reminders will show up here"
                        : "Tap + to create your first reminder"}
                </p>
            </motion.div>
        );
    }

    return (
        <div className="space-y-2.5 max-w-2xl mx-auto">
            <AnimatePresence mode="popLayout">
                {reminders.map((reminder, index) => (
                    <motion.div
                        key={reminder.id}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -40, transition: { duration: 0.2 } }}
                        transition={{ duration: 0.25, delay: index * 0.03 }}
                        layout
                    >
                        <ReminderCard
                            reminder={reminder}
                            onEdit={(r) => openEdit(r)}
                        />
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
