
import { Timestamp } from "firebase/firestore";
import { Reminder, RepeatRule } from "./types";
import { addDays, addWeeks, addMonths, addHours, getDay, startOfWeek, differenceInCalendarWeeks } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { Routine } from "./types";

/**
 * Calculates the next due date based on the repeat rule and current due date.
 * @param rule The repeat rule
 * @param currentDue The current due date (Timestamp)
 * @param startDate Optional start date for interval calculations
 * @returns Next due Timestamp or null if ended
 */
export function calculateNextDue(rule: RepeatRule, currentDue: Timestamp, startDate?: Timestamp): Timestamp | null {
    const current = currentDue.toDate();
    const start = rule.startDate?.toDate() || startDate?.toDate() || current;
    let nextDate: Date | null = null;

    // Check end condition (date)
    if (rule.endCondition) {
        if (rule.endCondition.type === 'date' && rule.endCondition.untilDate) {
            if (current.getTime() > rule.endCondition.untilDate.toMillis()) return null;
        }
        // Count logic handled by caller
    }

    if (rule.frequency === 'hourly') {
        nextDate = addHours(current, rule.interval);
    } else if (rule.frequency === 'daily') {
        nextDate = addDays(current, rule.interval);
    } else if (rule.frequency === 'monthly') {
        nextDate = addMonths(current, rule.interval);
    } else if (rule.frequency === 'weekly' || (rule.frequency === 'custom' && rule.weekdays && rule.weekdays.length > 0)) {
        // Weekly or custom-with-weekdays
        const allowedDays = rule.weekdays || [];
        const interval = rule.interval;

        if (allowedDays.length === 0) {
            // Simple: just add N weeks
            nextDate = addWeeks(current, interval);
        } else {
            // Complex: find next allowed day respecting interval
            const startOfSeries = startOfWeek(start, { weekStartsOn: 0 });
            const startOfCurrent = startOfWeek(current, { weekStartsOn: 0 });
            const weeksDiff = differenceInCalendarWeeks(startOfCurrent, startOfSeries, { weekStartsOn: 0 });
            const isValidWeek = weeksDiff % interval === 0;

            const sortedDays = [...allowedDays].sort((a, b) => a - b);
            let foundInCurrentWeek = false;

            if (isValidWeek) {
                for (const dayIdx of sortedDays) {
                    const candidate = addDays(startOfCurrent, dayIdx);
                    if (candidate.getTime() > current.getTime()) {
                        nextDate = candidate;
                        foundInCurrentWeek = true;
                        break;
                    }
                }
            }

            if (!foundInCurrentWeek) {
                const currentIntervalIdx = Math.floor(weeksDiff / interval);
                const nextIntervalIdx = currentIntervalIdx + 1;
                const weeksToAdd = nextIntervalIdx * interval;
                const startOfNextValidWeek = addWeeks(startOfSeries, weeksToAdd);

                if (sortedDays.length > 0) {
                    nextDate = addDays(startOfNextValidWeek, sortedDays[0]);
                }
            }
        }
    } else if (rule.frequency === 'custom') {
        // Custom without weekdays — treat as daily interval
        nextDate = addDays(current, rule.interval);
    } else {
        // Fallback
        nextDate = addDays(current, rule.interval);
    }

    // Handle skip weekends (only if no explicit weekdays)
    if (rule.skipWeekends && nextDate && (!rule.weekdays || rule.weekdays.length === 0)) {
        let d = getDay(nextDate);
        while (d === 0 || d === 6) {
            nextDate = addDays(nextDate, 1);
            d = getDay(nextDate);
        }
    }

    // Final check for end date
    if (nextDate && rule.endCondition?.type === 'date' && rule.endCondition.untilDate) {
        if (nextDate.getTime() > rule.endCondition.untilDate.toMillis()) return null;
    }

    return nextDate ? Timestamp.fromDate(nextDate) : null;
}

/**
 * Generates multiple future occurrences within a window.
 * Used for eager generation when a repeating reminder is created.
 */
export function generateFutureOccurrences(
    rule: RepeatRule,
    firstDue: Timestamp,
    windowDays: number = 30,
    maxCount?: number
): Timestamp[] {
    const results: Timestamp[] = [];
    const windowEnd = new Date();
    windowEnd.setDate(windowEnd.getDate() + windowDays);

    let currentDue = firstDue;
    let count = 0;
    const limit = maxCount || 100; // safety limit

    while (count < limit) {
        const next = calculateNextDue(rule, currentDue);
        if (!next) break; // end condition reached

        const nextDate = next.toDate();
        if (nextDate > windowEnd) break; // past our window

        // Check count-based end condition
        if (rule.endCondition?.type === 'count' && rule.endCondition.count) {
            if (count >= rule.endCondition.count - 1) break; // -1 because original counts as 1
        }

        results.push(next);
        currentDue = next;
        count++;
    }

    return results;
}

/**
 * Creates reminder instances for a Routine for a specific date
 */
export function generateRoutineInstances(routine: Routine, date: Date = new Date(), force: boolean = false): Partial<Reminder>[] {
    const day = getDay(date);
    const schedule = routine.schedule;

    let isDue = force;
    if (!isDue) {
        if (schedule.type === 'daily') {
            isDue = true;
        } else if (schedule.type === 'weekly' || schedule.type === 'custom') {
            if (schedule.days && schedule.days.includes(day)) {
                isDue = true;
            }
        }
    }

    if (!isDue) return [];

    const reminders: Partial<Reminder>[] = routine.steps.map(step => {
        const [hours, minutes] = step.time.split(':').map(Number);
        const localDateTime = new Date(date);
        localDateTime.setHours(hours, minutes, 0, 0);

        let dueAtTimestamp = Timestamp.fromDate(localDateTime);
        if (routine.timezone) {
            try {
                const utcDate = fromZonedTime(localDateTime, routine.timezone);
                dueAtTimestamp = Timestamp.fromDate(utcDate);
            } catch (e) {
                console.warn("Timezone conversion failed", e);
            }
        }

        return {
            uid: routine.uid,
            title: step.title,
            notes: step.notes,
            due_at: dueAtTimestamp,
            timezone: routine.timezone,
            status: 'pending',
            notifications: step.notifications,
            routineId: routine.id,
            routineDate: date.toISOString().split('T')[0],
            created_at: Timestamp.now(),
            updated_at: Timestamp.now(),
        };
    });

    return reminders;
}

/**
 * Generates routine reminder instances for ALL scheduled days within a forward window.
 * For example, a routine with days=[1,3,5] (Mon/Wed/Fri) will generate reminders
 * for every Mon, Wed, Fri in the next `windowDays` days.
 */
export function generateRoutineWindow(
    routine: Routine,
    windowDays: number = 30
): Partial<Reminder>[] {
    const allReminders: Partial<Reminder>[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < windowDays; i++) {
        const checkDate = addDays(today, i);
        const dayOfWeek = getDay(checkDate); // 0=Sun, 1=Mon, ...

        let isDue = false;
        const schedule = routine.schedule;

        if (schedule.type === 'daily') {
            // Daily: check interval
            isDue = (schedule.interval && schedule.interval > 1)
                ? (i % schedule.interval === 0)
                : true;
        } else if (schedule.type === 'weekly' || schedule.type === 'custom') {
            if (schedule.days && schedule.days.includes(dayOfWeek)) {
                isDue = true;
            }
        }

        if (isDue) {
            const dayReminders = generateRoutineInstances(routine, checkDate, true);
            allReminders.push(...dayReminders);
        }
    }

    return allReminders;
}

