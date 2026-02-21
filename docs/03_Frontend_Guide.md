# Deliverable 3: Frontend Guide

## Tech Stack & Major Libraries
- **Framework**: Next.js (App Router, Server Components + Client Components)
- **Language**: TypeScript
- **Styling & UI**: Tailwind CSS, `next-themes` (Dark/Light + 10 palettes)
- **Icons**: Lucide React
- **Animations**: Framer Motion
- **Toasts**: Sonner
- **PWA Integration**: `web-push`, raw Service Worker (`public/sw.js`)

## UI Structure
### Layout & Theming Tokens
- Controlled universally by `app/layout.tsx`. Colors map to strict CSS variables declared in `globals.css` (e.g., `--card`, `--border`, `--radius-lg`) avoiding hardcoded HEX codes.
- `ThemeProvider.tsx` toggles `.light`, `.dark`, and dynamically injects specific color `.theme-zinc`, `.theme-rose`, etc. onto the `<body>`.

### Providers & State Management
Found in `components/providers/`:
- **`AuthProvider.tsx`**: Listens to Firebase Auth `onAuthStateChanged`. Locks `(main)` routes if user is null.
- **`ThemeProvider.tsx`**: Next-themes initialization.
- **`SidebarProvider.tsx`**: Global context capturing desktop/mobile sidebar expanded/collapsed state.
- **`SoundProvider.tsx`**: Audio context for playing subtle UI notification checks (e.g., ticking off a task).
- **`ReminderProvider.tsx`**: Central fetching mechanism. Attaches an `onSnapshot` listener to the `reminders` collection. Hydrates global state so the dashboard and calendar never execute duplicate reads.

## Key Flow Structures

### Reminder Creation & Editing
- Handled primarily inside `components/reminders/ReminderForm.tsx`.
- Wrapped elegantly inside `ReminderSheet.tsx` (mobile slide-up) or modal wrappers.
- The form intercepts direct inputs, parses dates utilizing `date-fns-tz`, maps push/sms arrays, and invokes `addReminder` or `updateReminder` from `lib/reminders.ts`.

### Calendar View Data
- Hydrated safely through the `ReminderProvider.tsx` global state. 
- Transforms the flat array of pending reminders into a heavily memoized multidimensional array (grouped by Month/Week/Day) using `date-fns` mapping logic to render `components/calendar` cells instantly.

### Routines UI Structure
- Handled inside `components/routines/`. 
- Provides an interactive drag-and-drop or ordered-list environment for `RoutineForm.tsx`.
- Generates "Steps" with title, notes, and an isolated abstract local HH:MM time.
- Uses `RoutineCard.tsx` to handle the quick "Enable/Disable" toggle that maps to `app/api/routines/[id]/run/route.ts`.

### Notes Expand/Collapse UI
- Accomplished via local component state mapping to Framer Motion `<motion.div animate={{ height: "auto" }} initial={{ height: 0 }}>`. This avoids reflowing the DOM jarringly when a user taps a task to read the extended notes block.

### PWA & Service Worker Registration
- `ServiceWorkerRegister.tsx` (injected in Layout) detects `navigator.serviceWorker` on mount.
- Silently registers `/sw.js`. Validates PushManager capabilities.
- When notifications are enabled by the user in `Settings`, it generates a VAPID token via `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY` and bridges it to `app/api/push/subscribe/route.ts` to be embedded in Firestore.

### Performance Optimizations
- **Global Firestore Snapshot**: Reminders are strictly fetched once globally via Context, averting prop drilling and identical snapshot costs across overlapping components.
- **Lazy Image/Icon Loading**: Leverages aggressive memoization (`React.memo`, `useMemo` for nested list filtering).
