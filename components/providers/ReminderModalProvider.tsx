"use client";

import { Reminder } from "@/lib/types";
import { createContext, useContext, useState, useCallback, useMemo } from "react";

interface ReminderModalContextType {
    open: boolean;
    setOpen: (open: boolean) => void;
    editingReminder: Reminder | null;
    openNew: () => void;
    openEdit: (reminder: Reminder) => void;
    close: () => void;
}

const ReminderModalContext = createContext<ReminderModalContextType>({
    open: false,
    setOpen: () => { },
    editingReminder: null,
    openNew: () => { },
    openEdit: () => { },
    close: () => { },
});

export const useReminderModal = () => useContext(ReminderModalContext);

export function ReminderModalProvider({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);

    const openNew = useCallback(() => {
        setEditingReminder(null);
        setOpen(true);
    }, []);

    const openEdit = useCallback((reminder: Reminder) => {
        setEditingReminder(reminder);
        setOpen(true);
    }, []);

    const close = useCallback(() => {
        setOpen(false);
        setTimeout(() => setEditingReminder(null), 300); // clear after animation
    }, []);

    const contextValue = useMemo(() => ({
        open,
        setOpen,
        editingReminder,
        openNew,
        openEdit,
        close
    }), [open, editingReminder, openNew, openEdit, close]);

    return (
        <ReminderModalContext.Provider value={contextValue}>
            {children}
        </ReminderModalContext.Provider>
    );
}
