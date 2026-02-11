# Reliability Fixes & Documentation

## 1. Timezone & Cron
- **Issue**: Push notifications were sent +5h from due time, and Vercel Cron was erroring.
- **Fix**: 
  - Updated `vercel.json` with correct `crons` configuration.
  - Refactored `app/api/cron/check-reminders/route.ts` to use `date-fns-tz`. Timestamps are stored in UTC and formatted strictly to the user's timezone (or reminder's timezone) at send time.
  - **Verification**: `console.log` in cron now shows `Sending... at 10:00 AM (America/New_York)` matching the user's local time.

## 2. Date Picker UI
- **Issue**: Date picker was glitchy/shaking on selection.
- **Fix**: Updated `components/ui/calendar.tsx` to align with `react-day-picker` v9 styling. tailored `day_selected` and `day_today` classes.
- **Verification**: Date selection is now stable with no layout shifts.

## 3. Push Reliability & Devices
- **Issue**: Devices were "forgotten", and there was no way to manage them.
- **Fix**:
  - Added "Connected Devices" section in Settings.
  - Implemented `DELETE /api/push/devices` to clear old subscriptions.
  - Improved "Test Push" to return detailed success/failure logs.
  - Added auto-cleanup for `410 Gone` / `404 Not Found` subscriptions in the test route.

## 4. API Routes
- `GET /api/push/devices`: List connected devices.
- `DELETE /api/push/devices`: Remove one or all devices.
- `POST /api/push/test`: Send test push to all devices, returning explicit results.

## 5. Environment Variables
No new variables needed. Ensure `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` are set.
