
import { NextRequest, NextResponse } from "next/server";
import { getFirestore, Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { Timestamp as ClientTimestamp } from "firebase/firestore";
import { generateFutureOccurrences } from "@/lib/scheduler";
import { RepeatRule } from "@/lib/types";

// Initialize Firebase Admin if not already done
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
 * Converts an admin Timestamp (or Firestore doc field) to a client-SDK Timestamp.
 * Firestore admin Timestamp has { _seconds, _nanoseconds } or { seconds, nanoseconds }.
 */
function toClientTimestamp(adminTs: any): ClientTimestamp {
    if (adminTs instanceof ClientTimestamp) return adminTs;
    if (adminTs && typeof adminTs.toDate === 'function') {
        return ClientTimestamp.fromDate(adminTs.toDate());
    }
    if (adminTs && (adminTs._seconds !== undefined || adminTs.seconds !== undefined)) {
        const seconds = adminTs._seconds ?? adminTs.seconds;
        const nanoseconds = adminTs._nanoseconds ?? adminTs.nanoseconds ?? 0;
        return new ClientTimestamp(seconds, nanoseconds);
    }
    // Fallback: treat as Date
    return ClientTimestamp.fromDate(new Date(adminTs));
}

/**
 * Converts a RepeatRule from admin-SDK format to client-SDK format (Timestamps).
 */
function convertRule(rule: any): RepeatRule {
    const converted = { ...rule };
    if (converted.startDate) {
        converted.startDate = toClientTimestamp(converted.startDate);
    }
    if (converted.endCondition?.untilDate) {
        converted.endCondition = {
            ...converted.endCondition,
            untilDate: toClientTimestamp(converted.endCondition.untilDate),
        };
    }
    return converted as RepeatRule;
}

/**
 * POST /api/reminders/generate-repeats
 * Eagerly generates all future occurrences of a repeating reminder within a 30-day window.
 * Called immediately after creating a repeating reminder.
 * Body: { reminderId: string }
 */
export async function POST(request: NextRequest) {
    // Auth
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.split("Bearer ")[1];

    let uid: string;
    try {
        const decoded = await getAuth().verifyIdToken(token);
        uid = decoded.uid;
    } catch (e) {
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { reminderId } = body;

        if (!reminderId) {
            return NextResponse.json({ error: "reminderId required" }, { status: 400 });
        }

        // Read the source reminder
        const reminderRef = db.doc(`users/${uid}/reminders/${reminderId}`);
        const snap = await reminderRef.get();

        if (!snap.exists) {
            return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
        }

        const reminder = snap.data()!;

        if (!reminder.repeatRule) {
            return NextResponse.json({ error: "No repeat rule on this reminder" }, { status: 400 });
        }

        // Convert admin Timestamps to client Timestamps for the scheduler
        const rule = convertRule(reminder.repeatRule);
        const dueAt = toClientTimestamp(reminder.due_at);

        // Generate all future occurrences within 30-day window
        const futureDates = generateFutureOccurrences(rule, dueAt, 30);

        if (futureDates.length === 0) {
            await reminderRef.update({ generationStatus: 'created' });
            return NextResponse.json({ success: true, generated: 0 });
        }

        const batch = db.batch();
        let prevId = reminderId;

        for (const nextDue of futureDates) {
            const newRef = db.collection(`users/${uid}/reminders`).doc();
            const now = AdminTimestamp.now();

            // Convert client Timestamp back to admin Timestamp for Firestore write
            const adminDueAt = AdminTimestamp.fromDate(nextDue.toDate());

            // Convert rule timestamps back to admin format for storage
            const storedRule: any = { ...rule };
            if (storedRule.startDate && typeof storedRule.startDate.toDate === 'function') {
                storedRule.startDate = AdminTimestamp.fromDate(storedRule.startDate.toDate());
            }
            if (storedRule.endCondition?.untilDate && typeof storedRule.endCondition.untilDate.toDate === 'function') {
                storedRule.endCondition = {
                    ...storedRule.endCondition,
                    untilDate: AdminTimestamp.fromDate(storedRule.endCondition.untilDate.toDate()),
                };
            }

            const nextReminder: Record<string, any> = {
                uid: reminder.uid,
                title: reminder.title,
                notes: reminder.notes || null,
                due_at: adminDueAt,
                timezone: reminder.timezone,
                status: 'pending',
                notifications: (reminder.notifications || []).map((n: any) => ({ ...n, sent: false })),
                repeatRule: storedRule,
                originId: prevId,
                rootId: reminderId,
                generationStatus: 'created',
                created_at: now,
                updated_at: now,
            };

            batch.set(newRef, nextReminder);
            prevId = newRef.id;
        }

        // Mark original as 'created' (processed)
        batch.update(reminderRef, { generationStatus: 'created' });

        await batch.commit();

        return NextResponse.json({ success: true, generated: futureDates.length });
    } catch (error: any) {
        console.error("Generate Repeats Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
