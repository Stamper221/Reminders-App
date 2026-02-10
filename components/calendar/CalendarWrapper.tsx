"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { useAuth } from "@/components/providers/AuthProvider";
import { db } from "@/lib/firebase/client";
import { Reminder } from "@/lib/types";
import { collection, onSnapshot, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useReminderModal } from "@/components/providers/ReminderModalProvider";
import { updateReminder } from "@/lib/reminders";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

export function CalendarWrapper() {
    const { user } = useAuth();
    const { openEdit, openNew } = useReminderModal();
    const [reminders, setReminders] = useState<Reminder[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;

        const remindersRef = collection(db, "users", user.uid, "reminders");
        const q = query(remindersRef);

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Reminder));
            setReminders(items);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    const handleEventDrop = async (info: any) => {
        if (!user) return;
        const reminderId = info.event.id;
        const newDate = info.event.start;

        try {
            await updateReminder(user.uid, reminderId, {
                due_at: newDate as any,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            });
            toast.success("Reminder rescheduled");
        } catch (error) {
            toast.error("Failed to reschedule");
            info.revert();
        }
    };

    const handleEventClick = (info: any) => {
        const reminder = reminders.find(r => r.id === info.event.id);
        if (reminder) {
            openEdit(reminder);
        }
    };

    const events = reminders.map(r => ({
        id: r.id,
        title: r.title,
        start: r.due_at.toDate(),
        backgroundColor: r.status === 'done' ? '#10b981' : 'var(--primary)',
        borderColor: r.status === 'done' ? '#10b981' : 'var(--primary)',
        classNames: r.status === 'done' ? ['opacity-50'] : [],
    }));

    if (loading) {
        return (
            <div className="h-[calc(100vh-8rem)] rounded-xl border bg-card p-4 space-y-4">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-8 w-32" />
                    <Skeleton className="h-8 w-48" />
                </div>
                <div className="grid grid-cols-7 gap-px">
                    {[...Array(7)].map((_, i) => (
                        <Skeleton key={i} className="h-6 w-full" />
                    ))}
                </div>
                <div className="grid grid-cols-7 gap-px flex-1">
                    {[...Array(35)].map((_, i) => (
                        <Skeleton key={i} className="h-20 w-full" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-8rem)] bg-card rounded-xl border card-shadow p-4">
            <FullCalendar
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                headerToolbar={{
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek,timeGridDay'
                }}
                editable={true}
                selectable={true}
                selectMirror={true}
                dayMaxEvents={true}
                events={events}
                eventDrop={handleEventDrop}
                eventClick={handleEventClick}
                height="100%"
                dateClick={(info) => {
                    openNew();
                }}
            />
        </div>
    );
}
