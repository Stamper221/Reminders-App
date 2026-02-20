import { NextRequest, NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { generateRoutinesForUser } from "@/lib/routineGenerator";
import { rebuildQueueForUser } from "@/lib/notificationQueue";

// Initialize Firebase Admin (Singleton)
if (getApps().length === 0) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccount) {
        try {
            initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
        } catch (e) {
            initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
        }
    } else {
        initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
    }
}

const db = getFirestore();

/**
 * POST /api/routines/simulate
 *
 * Developer testing endpoint: runs the routine generator as if "now" = the
 * provided simulateTime. Generates all reminders for enabled routines that
 * fall within the next 24 hours from that time.
 *
 * Auth: Bearer token (Firebase ID token)
 *
 * Body: { simulateTime: "2026-02-20T00:05:00-05:00" }
 *
 * Idempotent: deterministic doc IDs prevent duplicates.
 */
export async function POST(request: NextRequest) {
    // Auth — accept either user token or cron secret
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];
    let uid: string;

    // Try user auth first, then cron secret
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && token === cronSecret) {
        // If using cron secret, require uid in body
        const body = await request.json().catch(() => ({}));
        if (!body.uid) {
            return NextResponse.json({ error: "uid required when using cron secret" }, { status: 400 });
        }
        uid = body.uid;

        const refTime = body.simulateTime ? new Date(body.simulateTime) : new Date();
        if (isNaN(refTime.getTime())) {
            return NextResponse.json({ error: "Invalid simulateTime" }, { status: 400 });
        }

        try {
            const userDoc = await db.collection("users").doc(uid).get();
            const userTz = userDoc.exists ? (userDoc.data()?.timezone || "UTC") : "UTC";

            const result = await generateRoutinesForUser(uid, refTime, userTz);

            // Also rebuild notification queue for the generated reminders
            const queueResult = await rebuildQueueForUser(uid, 24);

            return NextResponse.json({
                success: true,
                simulatedTime: refTime.toISOString(),
                generation: result,
                queueRebuilt: queueResult.queued,
            });
        } catch (error: any) {
            console.error("Simulate Error:", error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
    }

    // User auth
    try {
        const decoded = await getAuth().verifyIdToken(token);
        uid = decoded.uid;
    } catch (e) {
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    try {
        const body = await request.json().catch(() => ({}));
        const refTime = body.simulateTime ? new Date(body.simulateTime) : new Date();

        if (isNaN(refTime.getTime())) {
            return NextResponse.json({ error: "Invalid simulateTime" }, { status: 400 });
        }

        // Get user timezone
        const userDoc = await db.collection("users").doc(uid).get();
        const userTz = userDoc.exists ? (userDoc.data()?.timezone || "UTC") : "UTC";

        const result = await generateRoutinesForUser(uid, refTime, userTz);

        // Also rebuild notification queue for the generated reminders
        const queueResult = await rebuildQueueForUser(uid, 24);

        return NextResponse.json({
            success: true,
            simulatedTime: refTime.toISOString(),
            generation: result,
            queueRebuilt: queueResult.queued,
        });
    } catch (error: any) {
        console.error("Simulate Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
