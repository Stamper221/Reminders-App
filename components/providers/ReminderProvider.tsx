"use client";

import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { db } from "@/lib/firebase/client";
import { Reminder } from "@/lib/types";
import { clearCompletedReminders, deleteReminder } from "@/lib/reminders";
import {
    collection, query, where, orderBy, limit,
    startAfter, DocumentSnapshot, QueryDocumentSnapshot, Timestamp
} from "firebase/firestore";
import { onSnapshot, getDocs } from "@/lib/firebase/inspector";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReminderContextType {
    /** All pending/snoozed reminders within the active window (real-time) */
    reminders: Reminder[];
    /** Completed reminders (loaded on-demand with pagination) */
    completedReminders: Reminder[];
    /** Loading state for the main listener */
    loading: boolean;
    /** Loading state for completed fetches */
    loadingCompleted: boolean;
    /** Whether more completed reminders can be loaded */
    hasMoreCompleted: boolean;
    /** Load more completed reminders (pagination) */
    loadMoreCompleted: () => Promise<void>;
    /** Reset and reload completed reminders */
    refreshCompleted: () => void;
    /** Get reminders filtered for today */
    todayReminders: Reminder[];
    /** Get reminders filtered for upcoming (after today) */
    upcomingReminders: Reminder[];
    /** Get all active reminders (for calendar / notifier) */
    allActiveReminders: Reminder[];
    /** Clear all completed reminders and update state */
    clearCompleted: () => Promise<number>;
    /** Optimistically delete a single completed reminder */
    deleteCompletedItem: (id: string) => Promise<void>;
    expandWindowTo: (date: Date) => void;
}

const ReminderContext = createContext<ReminderContextType>({
    reminders: [],
    completedReminders: [],
    loading: true,
    loadingCompleted: false,
    hasMoreCompleted: true,
    loadMoreCompleted: async () => { },
    refreshCompleted: () => { },
    todayReminders: [],
    upcomingReminders: [],
    allActiveReminders: [],
    clearCompleted: async () => 0,
    deleteCompletedItem: async () => { },
    expandWindowTo: () => { },
});

export const useReminders = () => useContext(ReminderContext);

// ─── Constants ───────────────────────────────────────────────────────────────

const COMPLETED_PAGE_SIZE = 50;

// ─── Helper ──────────────────────────────────────────────────────────────────

function parseReminder(doc: QueryDocumentSnapshot): Reminder {
    const data = doc.data() as any;
    if (!data.notifications) {
        data.notifications = [];
    }
    return { id: doc.id, ...data } as Reminder;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function ReminderProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();

    // ── Active reminders (real-time listener) ──
    const [reminders, setReminders] = useState<Reminder[]>([]);
    const [loading, setLoading] = useState(true);

    // ── Dynamic Date Window (Real-time listener limit) ──
    const [windowEnd, setWindowEnd] = useState<Date>(() => {
        const d = new Date();
        d.setDate(d.getDate() + 60); // Default 60 days forward
        return d;
    });

    const expandWindowTo = useCallback((date: Date) => {
        setWindowEnd(prev => {
            if (date > prev) {
                const next = new Date(date);
                next.setDate(next.getDate() + 14); // Buffer an extra 14 days to prevent constant reloading
                return next;
            }
            return prev;
        });
    }, []);

    // ── Completed reminders (on-demand, paginated) ──
    const [completedReminders, setCompletedReminders] = useState<Reminder[]>([]);
    const [loadingCompleted, setLoadingCompleted] = useState(false);
    const [hasMoreCompleted, setHasMoreCompleted] = useState(true);
    const lastCompletedDocRef = useRef<DocumentSnapshot | null>(null);
    const completedLoadedRef = useRef(false);

    // ═══════════════════════════════════════════════════════════════════════
    // SINGLE REAL-TIME LISTENER — Pending + Snoozed reminders only
    // This is the ONLY onSnapshot in the entire app for reminders.
    // ═══════════════════════════════════════════════════════════════════════
    useEffect(() => {
        if (!user) {
            setReminders([]);
            setLoading(false);
            return;
        }

        const remindersRef = collection(db, "users", user.uid, "reminders");

        // Query: only pending/snoozed, bounded by due date <= windowEnd to limit reads
        const q = query(
            remindersRef,
            where("status", "in", ["pending", "snoozed"]),
            where("due_at", "<=", Timestamp.fromDate(windowEnd)),
            orderBy("due_at", "asc")
        );

        if (process.env.NODE_ENV === "development") {
            console.log(`[ReminderProvider] Attaching listener (bounded to ${windowEnd.toISOString().split('T')[0]})`);
        }

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const items = snapshot.docs.map(parseReminder);

                if (process.env.NODE_ENV === "development") {
                    console.log(`[ReminderProvider] Listener fired: ${items.length} docs (${snapshot.docChanges().length} changes)`);
                }

                setReminders(items);
                setLoading(false);
            },
            (err) => {
                console.error("[ReminderProvider] Snapshot error:", err);
                setReminders([]);
                setLoading(false);
            }
        );

        return () => {
            if (process.env.NODE_ENV === "development") {
                console.log("[ReminderProvider] Detaching listener");
            }
            unsubscribe();
        };
    }, [user, windowEnd.getTime()]); // Re-attach when window expands

    // ═══════════════════════════════════════════════════════════════════════
    // COMPLETED REMINDERS — On-demand, paginated getDocs
    // ═══════════════════════════════════════════════════════════════════════

    const loadMoreCompleted = useCallback(async () => {
        if (!user || loadingCompleted || !hasMoreCompleted) return;

        setLoadingCompleted(true);
        try {
            const remindersRef = collection(db, "users", user.uid, "reminders");

            let q;
            if (lastCompletedDocRef.current) {
                q = query(
                    remindersRef,
                    where("status", "==", "done"),
                    orderBy("due_at", "desc"),
                    startAfter(lastCompletedDocRef.current),
                    limit(COMPLETED_PAGE_SIZE)
                );
            } else {
                q = query(
                    remindersRef,
                    where("status", "==", "done"),
                    orderBy("due_at", "desc"),
                    limit(COMPLETED_PAGE_SIZE)
                );
            }

            const snapshot = await getDocs(q);
            const newItems = snapshot.docs.map(parseReminder);

            if (process.env.NODE_ENV === "development") {
                console.log(`[ReminderProvider] Loaded ${newItems.length} completed reminders (page)`);
            }

            if (snapshot.docs.length > 0) {
                lastCompletedDocRef.current = snapshot.docs[snapshot.docs.length - 1];
            }

            setCompletedReminders(prev => [...prev, ...newItems]);
            setHasMoreCompleted(snapshot.docs.length === COMPLETED_PAGE_SIZE);
        } catch (err) {
            console.error("[ReminderProvider] Failed to load completed:", err);
        } finally {
            setLoadingCompleted(false);
        }
    }, [user, loadingCompleted, hasMoreCompleted]);

    const refreshCompleted = useCallback(() => {
        setCompletedReminders([]);
        lastCompletedDocRef.current = null;
        setHasMoreCompleted(true);
        completedLoadedRef.current = false;
        loadMoreCompleted();
    }, [loadMoreCompleted]);

    const clearCompleted = useCallback(async () => {
        if (!user) return 0;
        // Optimistic update
        setCompletedReminders([]);
        const count = await clearCompletedReminders(user.uid);
        // Reset pagination state
        lastCompletedDocRef.current = null;
        setHasMoreCompleted(true);
        completedLoadedRef.current = false; // Allow reloading if new completed come in
        return count;
    }, [user]);

    const deleteCompletedItem = useCallback(async (id: string) => {
        if (!user) return;
        // Optimistic update
        setCompletedReminders(prev => prev.filter(r => r.id !== id));
        try {
            await deleteReminder(user.uid, id);
        } catch (error) {
            // In a more robust app we could rollback the state here,
            // but for now a simple refresh or just letting it be is fine.
            console.error("Optimistic delete failed:", error);
            refreshCompleted(); // Rollback by fetching from source
            throw error;
        }
    }, [user, refreshCompleted]);

    // When a reminder is toggled to "done", it disappears from the active listener.
    // We could detect this but it's simplest to just let the completed tab re-fetch.
    // The active listener handles all transitions automatically.

    // ═══════════════════════════════════════════════════════════════════════
    // DERIVED VIEWS — Client-side filtering from the single cached dataset
    // No additional Firestore reads!
    // ═══════════════════════════════════════════════════════════════════════

    const todayReminders = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        return reminders.filter(r => {
            if (r.status === "done") return false;
            const d = r.due_at?.toDate ? r.due_at.toDate() : new Date(r.due_at as any);
            return d >= today && d < tomorrow;
        });
    }, [reminders]);

    const upcomingReminders = useMemo(() => {
        const tomorrow = new Date();
        tomorrow.setHours(0, 0, 0, 0);
        tomorrow.setDate(tomorrow.getDate() + 1);

        return reminders.filter(r => {
            if (r.status === "done") return false;
            const d = r.due_at?.toDate ? r.due_at.toDate() : new Date(r.due_at as any);
            return d >= tomorrow;
        });
    }, [reminders]);

    const allActiveReminders = useMemo(() => {
        return reminders.filter(r => r.status !== "done");
    }, [reminders]);

    // ═══════════════════════════════════════════════════════════════════════

    const value = useMemo(() => ({
        reminders,
        completedReminders,
        loading,
        loadingCompleted,
        hasMoreCompleted,
        loadMoreCompleted,
        refreshCompleted,
        todayReminders,
        upcomingReminders,
        allActiveReminders,
        clearCompleted,
        deleteCompletedItem,
        expandWindowTo,
    }), [
        reminders, completedReminders, loading, loadingCompleted,
        hasMoreCompleted, loadMoreCompleted, refreshCompleted,
        todayReminders, upcomingReminders, allActiveReminders,
        clearCompleted, expandWindowTo
    ]);

    return (
        <ReminderContext.Provider value={value}>
            {children}
        </ReminderContext.Provider>
    );
}
