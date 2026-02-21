# Deliverable 2: App Map / System Map

## High-Level Architecture Diagram
```text
  [ Client (Next.js + PWA) ] ───(HTTP)───> [ Next.js API Routes ]
       │                                         │
    (Auth)                                   (Admin)
       │                                         │
       ▼                                         ▼
  [ Firebase Auth ]                      [ Firestore DB ]
       │                                         │
       └─────────────────────────────────────────┼─> (reminders, routines, queue)
                                                 │
                                                 ▼
[ cron-job.org ] ──(Every 1 min)──> [ app/api/cron/run/route.ts ]
                                                 │
                    ┌────────────────────────────┼───────────────────────────┐
                    ▼                            ▼                           ▼
            [ Web Push API ]             [ Twilio API ]            [ SMTP/Nodemailer ]
            (sw.js payload)               (SMS payload)              (Email payload)
```

## Routing Map (Frontend)
- **`/login`**, **`/signup`** (`app/(auth)/...`): Standard Firebase authentication flow.
- **`/`** (`app/(main)/page.tsx`): The primary dashboard. Displays the core `ReminderList.tsx` and calendar components.
- **`/calendar`** (`app/(main)/calendar/page.tsx`): Expanded grid view to manage tasks visually across the month.
- **`/routines`** (`app/(main)/routines/page.tsx`): Dedicated interface for managing sequentially repeated structured sets (Steps + Start Times).
- **`/settings`** (`app/(main)/settings/page.tsx`): Theme toggling, SMS Opt-In mapping, Account management.

## Data Flow Map

### 1. Reminder CRUD → Queue Sync → Cron Dispatch → Push
1. **Create/Edit (`lib/reminders.ts`)**: User interacts with `ReminderForm.tsx`, saving to the `reminders` Firestore collection.
2. **Delta Sync (`lib/queueSync.ts`)**: `syncReminderQueue` triggers a background sync to cleanly wipe and rebuild pre-calculated elements inside the `notification_queue` subcollection for the modified reminder.
3. **Cron Job (`app/api/cron/run/route.ts`)**: Queries `notification_queue` with `sent: false` bounded between `[now - 2m, now]`.
4. **Push Delivery**: Fetches the `push_subscriptions` subcollection for the target user. Compiles a payload (`title` + truncated `notes`) and fires the Web Push API. Marks the queue document `sent: true`.

### 2. Routine Enable/Disable → Generation/Removal → Queue
1. **Enable (`app/api/routines/[id]/run/route.ts`)**: Enabling a routine executes a precise catch-up algorithm targeting the current 24-hour block, inserting new `reminders` representing routine steps.
2. **Deterministic ID Architecture**: Step remnants use a SHA-256 hash (`routineId:stepId:dateStr`) as the Document ID to guarantee idempotency on toggles or overlapping cron runs.
3. **Disable (`lib/routines.ts`)**: Calling `deleteRoutine` or disabling cascades to `removeRoutineQueue()`, instantly purging its footprint from the `notification_queue` and deleting dynamically spawned future items linked by `routineId`.
