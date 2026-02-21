# Deliverable 4: Backend Guide

## Firestore Structure
### Users (`users/{uid}`)
- **Metadata**: Top-level config (e.g., `timezone`, `email`, `smsOptIn`, `phoneNumber`).
- **`reminders` (Subcollection)**: Core task objects.
  - *Schema*: `{ title, notes, due_at: Timestamp, status: "pending"|"done"|"snoozed", timezone, repeatRule: {} | null, notifications: [{id, type, offsetMinutes, sent}], created_at, updated_at, routineId?, rootId? }`.
- **`routines` (Subcollection)**: Abstract templates mimicking complex daily schedules.
  - *Schema*: `{ title, active: boolean, schedule: { type, days }, steps: [{ id, time: "HH:MM", title, notes, notifications: []}], timezone, lastRun: Timestamp }`.
- **`notification_queue` (Subcollection)**: Denormalized flat list of strictly upcoming isolated notifications.
  - *Schema*: `{ reminderId, reminderTitle, reminderNotes, channel: "push"|"sms"|"email", notificationId, scheduledAt: Timestamp, dueAt: Timestamp, sent: boolean, timezone }`.
- **`push_subscriptions` (Subcollection)**: VAPID browser clients registered to receive push.
  - *Schema*: `{ endpoint, keys: { auth, p256dh }, created_at }`.

## API Routes (Next.js Route Handlers)

### `app/api/cron/run` (Minute-Runner)
- **Role**: Execution core. Queried by `cron-job.org` every minute. Securely checks `Bearer` or `?key=` against `CRON_SECRET`.
- **Flow**: 
  1. Injects `generateRoutinesForUser` if the day rolled over.
  2. Queries `notification_queue` for `sent == false` bounded strictly up to `now` (no future peeking).
  3. Dispatches Web Push, Twilio (SMS), Nodemailer (Email).
  4. Marks queue items `sent: true` and mirrors state back onto original `reminders` array.

### `app/api/routines/[id]/run`
- **Role**: Enables immediate manual catch-up.
- **Inputs**: Route parm `id`, Bearer token from client Firebase Auth.
- **Flow**: Generates all step nodes belonging to the next 24-hour block for that Routine ID if missing.

### `app/api/push/subscribe` & `/unsubscribe`
- **Role**: Maps `sw.js` push subscriptions securely via verified Auth Token.

## Notification Queue Logic
- **Precomputation (`buildQueueItems`)**: A reminder with a notification list explodes into multiple denormalized channels matching `scheduledAt = dueAt - offsetMinutes`.
- **Dedupe & Idempotency**: Queue sweeps completely rebuild unsent items on every reminder edit (`syncQueueForReminder`).
- **Sent Flags**: Cron handles flipping `sent: true` simultaneously on the queue item and the root reminder array. It clusters by `device`/`channel` dedupe key so identical hits don't spam.

## Routine Generation Logic
- **24h Rolling Generation**: Evaluates `localNow` up to `localNow + 1 day`. Iterates routine steps based on HH:MM mapping.
- **Daily 12am Run**: Tracked meticulously via the `users/{uid}/meta/routineGenState` document `lastGenDate` string (`yyyy-MM-dd`). Prevents overlapping execution.
- **Duplicate Prevention Strategy**: Core innovation utilizing `crypto.createHash("sha256").update(routineId:stepId:dateStr).substring(0,20)`. Firestore `set({merge: true})` behaves cleanly identically on repeat attempts, guaranteeing zero duplicates.
- **Disable Behavior**: Disabling cascades into `deleteRoutine` and `removeRoutineQueue()`, cleaning up all "pending" instances tied to that `routineId` beyond `now`.

## Push Notifications Pipeline
- **Storage**: `push_subscriptions` handles arrays of devices per user natively.
- **Payload Building**: Handled in Cron. Truncates user notes gracefully (`"Reminder: TITLE — [notes...]"`). Passes `url: '/'` globally to focus the app via `sw.js`.
- **iPhone PWA Fallbacks**: Fully respects Apple Web Push (iOS 16.4+). Injects visual fallback `badges` if the OS suppresses `Urgency: High`.

## Firestore Indexes & Rules
### Required Composite Indexes (`firestore.indexes.json`)
- **`reminders`: `status` ASC, `due_at` ASC** - Used by `notificationQueue` to exclusively pull pending items across the next N hours efficiently without massive read burdens.
- **`notification_queue`: `sent` ASC, `scheduledAt` ASC** - Used heavily by Cron. Essential to sort unsent items by exact execution minute bounding.
- **`routines`: `created_at` DESC** - Client-side list ordering.

### Security Rules Patterns
- **Rule Design**: Flat `match /users/{uid}/{collection=**}` ensuring `request.auth.uid == uid`. Prevents any cross-tenant data leakage universally.
