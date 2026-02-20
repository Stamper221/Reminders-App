/**
 * Server-side routine generator (firebase-admin).
 *
 * Generates reminders for ALL enabled routines for a user
 * within a 24-hour forward window from a given reference time.
 *
 * Features:
 *   - Deterministic doc IDs (SHA-256 of routineId:stepId:dateStr) → fully idempotent
 *   - Timezone-aware step time conversion
 *   - Skips past-due steps
 *   - Syncs notification queue for each created reminder
 *   - Returns detailed stats for logging
 */

import { getFirestore } from "firebase-admin/firestore";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { format, getDay, addDays } from "date-fns";
import { syncQueueForReminder } from "@/lib/notificationQueue";
import crypto from "crypto";

// ─── Types ───────────────────────────────────────────────────────────────────

interface RoutineGenerationResult {
    routinesProcessed: number;
    remindersCreated: number;
    details: {
        routineId: string;
        routineTitle: string;
        remindersGenerated: number;
        skippedPast: number;
    }[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Deterministic doc ID for a routine-generated reminder.
 * SHA-256 hash of "routineId:stepId:YYYY-MM-DD" truncated to 20 chars.
 * This prevents duplicates when the cron re-runs or routine is toggled.
 */
function deterministicId(routineId: string, stepId: string, dateStr: string): string {
    const raw = `${routineId}:${stepId}:${dateStr}`;
    return crypto.createHash("sha256").update(raw).digest("hex").substring(0, 20);
}

// ─── Main Generator ──────────────────────────────────────────────────────────

/**
 * Generate reminders for all enabled routines for a user.
 *
 * @param uid        Firestore user ID
 * @param refTime    Reference time ("now") — pass a custom time for simulate mode
 * @param userTz     User's default timezone (fallback if routine has none)
 * @returns          Stats about what was generated
 */
export async function generateRoutinesForUser(
    uid: string,
    refTime: Date = new Date(),
    userTz: string = "UTC"
): Promise<RoutineGenerationResult> {
    const db = getFirestore();
    const result: RoutineGenerationResult = {
        routinesProcessed: 0,
        remindersCreated: 0,
        details: [],
    };

    // 1. Fetch only ENABLED routines
    const routinesSnap = await db
        .collection("users").doc(uid).collection("routines")
        .where("active", "==", true)
        .get();

    if (routinesSnap.empty) return result;

    const remindersRef = db.collection(`users/${uid}/reminders`);
    const batch = db.batch();
    const createdReminderIds: string[] = [];

    for (const rDoc of routinesSnap.docs) {
        const routine = rDoc.data();
        const routineId = rDoc.id;
        const timezone = routine.timezone || userTz;

        // Convert refTime to routine's local timezone
        const localNow = toZonedTime(refTime, timezone);

        // Determine which calendar days to check
        // We check today + tomorrow in local time to cover the full 24h window
        const todayLocal = new Date(localNow);
        todayLocal.setHours(0, 0, 0, 0);
        const tomorrowLocal = addDays(todayLocal, 1);
        const daysToCheck = [todayLocal, tomorrowLocal];

        let routineCreated = 0;
        let routineSkipped = 0;

        for (const day of daysToCheck) {
            const dayOfWeek = getDay(day);
            const dateStr = format(day, "yyyy-MM-dd");

            // Check if routine runs on this day
            let isDue = false;
            const scheduleType = routine.schedule?.type;
            if (scheduleType === "daily") {
                isDue = true;
            } else if (scheduleType === "weekly" || scheduleType === "custom") {
                const scheduleDays = routine.schedule?.days || [];
                if (scheduleDays.includes(dayOfWeek)) {
                    isDue = true;
                }
            }
            if (!isDue) continue;

            // Generate a reminder for each step
            const steps = routine.steps || [];
            for (const step of steps) {
                const [hours, minutes] = (step.time || "00:00").split(":").map(Number);
                const localStepTime = new Date(day);
                localStepTime.setHours(hours, minutes, 0, 0);

                // Convert local step time → UTC
                let dueAtUtc: Date;
                try {
                    dueAtUtc = fromZonedTime(localStepTime, timezone);
                } catch {
                    dueAtUtc = localStepTime;
                }

                // Skip if already in the past
                if (dueAtUtc <= refTime) {
                    routineSkipped++;
                    continue;
                }

                // Skip if beyond 24h window
                const windowEnd = new Date(refTime.getTime() + 24 * 60 * 60 * 1000);
                if (dueAtUtc > windowEnd) continue;

                // Deterministic ID → idempotent
                const docId = deterministicId(routineId, step.id, dateStr);
                const docRef = remindersRef.doc(docId);

                const reminderData: Record<string, any> = {
                    uid,
                    title: step.title || "Untitled",
                    notes: step.notes || "",
                    status: "pending",
                    due_at: dueAtUtc,
                    timezone,
                    notifications: (step.notifications || []).map((n: any) => ({
                        ...n,
                        sent: false,
                    })),
                    created_at: new Date(),
                    updated_at: new Date(),
                    routineId,
                    routineDate: dateStr,
                    rootId: routineId,
                };

                // set with merge = idempotent (won't overwrite if already exists)
                batch.set(docRef, reminderData, { merge: true });
                createdReminderIds.push(docId);
                routineCreated++;
            }
        }

        // Update lastRun on the routine
        if (routineCreated > 0) {
            batch.update(rDoc.ref, { lastRun: refTime });
        }

        result.routinesProcessed++;
        result.remindersCreated += routineCreated;
        result.details.push({
            routineId,
            routineTitle: routine.title || "Untitled",
            remindersGenerated: routineCreated,
            skippedPast: routineSkipped,
        });
    }

    // Commit all writes in one batch
    if (result.remindersCreated > 0) {
        await batch.commit();

        // Sync notification queue for each created reminder
        for (const remId of createdReminderIds) {
            try {
                const reminderDoc = await remindersRef.doc(remId).get();
                if (reminderDoc.exists) {
                    await syncQueueForReminder(uid, remId, reminderDoc.data());
                }
            } catch (e) {
                console.error(`[RoutineGen] Queue sync failed for ${remId}:`, e);
            }
        }
    }

    return result;
}
