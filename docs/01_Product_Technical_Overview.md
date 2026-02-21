# Deliverable 1: Product & Technical Overview

## Table of Contents
1. [App Purpose & Target Users](#app-purpose--target-users)
2. [Core Features](#core-features)
3. [Platform Support](#platform-support)
4. [Operational Behavior](#operational-behavior)
5. [Known Limitations & Assumptions](#known-limitations--assumptions)

---

## App Purpose & Target Users
The **Reminders App** is a modern, responsive Progressive Web App (PWA) structured to help users manage tasks, routines, and habits. It combines a clean calendar interface with robust dynamic scheduling logic. 
The primary use-cases include recurring task management, daily routine building with staggered step times, and flexible alarm-style notifications across multiple channels (Push, SMS, Email). Target users are individuals needing a strict, reliable, yet heavily customizable daily reminder system with robust offline and cross-device syncing capabilities via Firebase.

---

## Core Features

### Reminders, Notes, and Snooze/Completion
- **Reminders**: Individual tasks with specific due dates, times, and timezones.
- **Notes**: Rich text or simple expandable descriptions attached to reminders, gracefully truncated in push notification payloads.
- **Completion & Snooze**: Users can mark tasks as "done", which halts all future queued notifications. Tasks can be "snoozed" to a new future time, automatically updating the notification queue.

### Calendar Integration
- Seamless grid or list view of reminders.
- Uses `date-fns` for robust local and UTC date boundary calculations to accurately display tasks on their due days.

### Repeat Rules
- **Presets**: Daily, Weekly, Monthly recurring tasks.
- **Custom Rules**: Complex rules natively generated and attached via a `repeatRule` structure that clones reminders into the future upon completion.

### Routines
- **Structure**: Groupings of sequential steps (each acting as a sub-reminder) tied to an abstract timezone and schedule (Daily, Weekly, Custom days).
- **Generation Logic**: 
  - Rolling 24h deterministic generation: Steps are translated into standalone `reminder` documents for the next 24 hours.
  - Toggling a routine to "Enable" performs an immediate catch-up generation for the current 24-hour window.
  - "Disable"/"Delete" cascades to remove all upcoming generated reminders (identified via a deterministic `routineId:stepId:dateStr` hash) and clears their queue.

### Notification System 
- **Multi-Channel**: Supports Web Push (via VAPID/ServiceWorker), SMS (via Twilio), and Email (via SMTP/Nodemailer).
- **Offsets & Flexibility**: Users define offset minutes (e.g., "At time of event", "5 mins before", "1 hour before") alongside frequency/channel flexibility.

### Notification Queue Architecture
- **Denormalized Precomputation**: Instead of cron scanning the entire `reminders` collection every minute, the backend pre-computes a denormalized `notification_queue` subcollection per user.
- **Delta Sync**: Changing a reminder or routine triggers an isolated cleanup and regeneration of just its queue items.

### Theme System & UI Behaviors
- **Themes**: Powered by `next-themes` and a global context provider. Offers up to 10 palettes (e.g., zinc, slate, rose, orange, green, blue) toggled dynamically.
- **UI Behavior**: 
  - Micro-animations via `framer-motion` (e.g., expand/collapse for notes).
  - Responsive collapsible sidebar architecture with a global context (`SidebarProvider.tsx`).
  - Toast alerts via `sonner`.

### Device Registration Management (Push)
- Service Worker (`public/sw.js`) captures Google/browser VAPID push subscriptions.
- Managed in a `push_subscriptions` Firestore subcollection allowing multi-device broadcast.

---

## Platform Support

### Desktop Web
- Fully responsive layout utilizing a collapsible sidebar and grid calendar.
- Native browser push notifications using standard Web Push API.

### iPhone PWA (Home Screen Installed)
- Fully supports "Add to Home Screen" (managed via `manifest.json` and Apple-specific meta tags in `app/layout.tsx`).
- Push notifications supported via iOS 16.4+ Web Push APIs. The `sw.js` is crafted to handle background clicks and focus the PWA window seamlessly.

---

## Operational Behavior

### Cron-Job.org Schedule Calls
- **Minute-Runner**: Pinged externally every 1-2 minutes to `app/api/cron/run/route.ts`. Safely protected by a `Bearer` secret token.
- **Execution**: The runner strictly queries `notification_queue` for items falling within a strict `[now - 2m, now]` window limit. This guarantees zero premature firing and accounts for slight cron drift.

### Daily 12am Generation & Rebuild Behavior
- During the first minute-runner ping of a new day (UTC or user-local depending on meta tracking), the system fires a **Step 0**.
- **Step 0**: Triggers `generateRoutinesForUser` to roll the 24h window forward, then executes `rebuildQueueForUser(horizonHours: 24)` to sweep the board and reconstruct the `notification_queue`.

---

## Known Limitations & Assumptions
- **Assumption: Missing Client Clock Sync**: Reminder due times are treated as absolute instances based on the timezone provided at creation or the user's fallback timezone.
- **Limitation: SMS Rate Limits**: If a user schedules >10 text reminders for the exact same minute and turns them all on, Twilio could throttle or block if not configured for high-throughput messaging. 
- **Limitation: Offline Sync**: While Firestore natively supports offline capabilities, the external minute-runner (Cron) relies on the cloud state. If a user marks a reminder "done" offline, the queue in the cloud remains active and may fire a notification before the client reconnects and syncs the "done" state.
