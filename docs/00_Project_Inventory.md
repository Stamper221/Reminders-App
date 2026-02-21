# Project Inventory

## Folder Map
- `app/` - Next.js App Router root (Pages, API routes)
  - `(auth)` - Authentication pages
  - `(main)` - Main authenticated app views (reminders, calendar, routines, settings)
  - `api/` - Next.js Route handlers for cron jobs, push mapping, and routines
- `components/` - React components
  - `auth`, `calendar`, `global`, `layout`, `notifications`, `providers`, `reminders`, `routines`, `settings`, `ui`
- `functions/src/` - Firebase Cloud Functions (Email/SMS fallbacks, test triggers)
- `lib/` - Core business logic, Firebase client/admin setup, utilities
- `public/` - Static assets, Service Worker (`sw.js`), PWA manifest (`manifest.json`)

## Top Files Inspected
1. **Cron & Queue**:
   - `app/api/cron/run/route.ts` (Minute-runner & daily routine generator trigger)
   - `lib/notificationQueue.ts` (Queue sync and precomputation logic)
   - `lib/queueSync.ts` (Client/Server bridge for queue items)
2. **Routine Generation**:
   - `lib/routineGenerator.ts` (Deterministic 24h rolling generation logic)
   - `app/api/routines/[id]/run/route.ts` (Manual enable catch-up endpoint)
3. **Core Data Managers**:
   - `lib/reminders.ts` (Reminder CRUD and queue synching logic)
   - `lib/routines.ts` (Routine CRUD logic)
4. **Service Worker & PWA**:
   - `public/sw.js` (Push notification display and click handling)
   - `app/layout.tsx` (PWA metadata and Service Worker registration provider)
5. **Configuration**:
   - `firebase.json`
   - `firestore.indexes.json`
   - `firestore.rules`
