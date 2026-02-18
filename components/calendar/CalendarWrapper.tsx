"use client";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import { useAuth } from "@/components/providers/AuthProvider";
import { useReminders } from "@/components/providers/ReminderProvider";
import { Reminder } from "@/lib/types";
import { useReminderModal } from "@/components/providers/ReminderModalProvider";
import { updateReminder } from "@/lib/reminders";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo } from "react";

export function CalendarWrapper() {
    const { user } = useAuth();
    const { openEdit, openNew } = useReminderModal();
    // Use shared data from the centralized provider — NO separate listener
    const { reminders: activeReminders, completedReminders, loading } = useReminders();

    // Merge active + completed for calendar display
    const allReminders = useMemo(() => {
        return [...activeReminders, ...completedReminders];
    }, [activeReminders, completedReminders]);

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
        const reminder = allReminders.find(r => r.id === info.event.id);
        if (reminder) {
            openEdit(reminder);
        }
    };

    const safeToDate = (ts: any): Date => {
        if (!ts) return new Date();
        if (ts instanceof Date) return ts;
        if (typeof ts.toDate === 'function') return ts.toDate();
        if (ts.seconds !== undefined) return new Date(ts.seconds * 1000);
        if (ts._seconds !== undefined) return new Date(ts._seconds * 1000);
        return new Date(ts);
    };

    const events = useMemo(() => {
        return allReminders.map(r => ({
            id: r.id,
            title: r.title,
            start: safeToDate(r.due_at),
            backgroundColor: r.status === 'done' ? '#10b981' : 'var(--primary)',
            borderColor: r.status === 'done' ? '#10b981' : 'var(--primary)',
            classNames: r.status === 'done' ? ['opacity-50'] : [],
        }));
    }, [allReminders]);

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
