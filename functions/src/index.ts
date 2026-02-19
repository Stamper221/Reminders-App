import * as admin from "firebase-admin";

admin.initializeApp();

// DISABLED: Scheduler moved to Next.js API route /api/cron/run
// The Firebase Function scheduler was duplicating reads and potentially
// sending duplicate notifications. All scheduling now goes through the
// Vercel cron / cron-job.org endpoint.
// export * from "./scheduler";
export * from "./test_utils";
