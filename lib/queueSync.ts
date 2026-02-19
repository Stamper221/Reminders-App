/**
 * Client-side queue sync helper.
 * Calls /api/queue/sync to update the notification queue
 * after reminder or routine CRUD operations.
 *
 * These calls are fire-and-forget (non-blocking) so they
 * don't slow down the UI.
 */

import { auth } from "@/lib/firebase/client";

async function getToken(): Promise<string | null> {
    try {
        const user = auth?.currentUser;
        if (!user) return null;
        return await user.getIdToken();
    } catch {
        return null;
    }
}

async function callSync(body: Record<string, any>) {
    const token = await getToken();
    if (!token) return;

    try {
        await fetch("/api/queue/sync", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify(body),
        });
    } catch (e) {
        // Non-critical: queue will be rebuilt daily
        console.warn("[QueueSync] Failed:", e);
    }
}

/** Sync queue items for a specific reminder (after create/edit) */
export function syncReminderQueue(reminderId: string) {
    // Fire-and-forget
    callSync({ action: "sync", reminderId });
}

/** Remove queue items for a specific reminder (after delete/complete) */
export function removeReminderQueue(reminderId: string) {
    callSync({ action: "remove", reminderId });
}

/** Remove queue items for a routine (and optionally delete future reminders) */
export function removeRoutineQueue(routineId: string, deleteFutureReminders: boolean = true) {
    callSync({ action: "removeRoutine", routineId, deleteFutureReminders });
}
