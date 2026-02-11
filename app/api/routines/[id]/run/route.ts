import { NextRequest, NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { generateRoutineWindow } from "@/lib/scheduler";
import { Routine } from "@/lib/types";
import { getAuth } from "firebase-admin/auth";

if (getApps().length === 0) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccount) {
        initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
    } else {
        initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID });
    }
}

const db = getFirestore();

/**
 * Recursively removes undefined values from an object (Firestore rejects them).
 */
function stripUndefined(obj: Record<string, any>): Record<string, any> {
    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value === undefined) continue;
        if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
            clean[key] = stripUndefined(value);
        } else {
            clean[key] = value;
        }
    }
    return clean;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id: routineId } = await params;

    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.split("Bearer ")[1];
    let uid;
    try {
        const decoded = await getAuth().verifyIdToken(token);
        uid = decoded.uid;
    } catch (e) {
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    try {
        const routineRef = db.doc(`users/${uid}/routines/${routineId}`);
        const docSnap = await routineRef.get();

        if (!docSnap.exists) {
            return NextResponse.json({ error: "Routine not found" }, { status: 404 });
        }

        const routine = { ...docSnap.data(), id: routineId } as Routine;
        const timezone = routine.timezone || 'UTC';

        // Generate reminders for ALL scheduled days in a 30-day window
        const newReminders = generateRoutineWindow(routine, 30);

        if (newReminders.length === 0) {
            return NextResponse.json({ message: "No steps to generate (no matching days in the next 30 days)" });
        }

        const batch = db.batch();
        const userRemindersRef = db.collection(`users/${uid}/reminders`);

        newReminders.forEach(r => {
            const ref = userRemindersRef.doc();
            // Safely extract due_at as a Date
            const dueAtDate = r.due_at && typeof (r.due_at as any).toDate === 'function'
                ? (r.due_at as any).toDate()
                : (r.due_at instanceof Date ? r.due_at : new Date());

            // Build a clean document without any undefined values
            const reminderDoc = stripUndefined({
                uid,
                title: r.title || 'Untitled',
                notes: r.notes || '',
                status: r.status || 'pending',
                due_at: dueAtDate,
                timezone: r.timezone || timezone,
                notifications: r.notifications || [],
                created_at: new Date(),
                updated_at: new Date(),
                rootId: routineId,
                routineId: routineId,
            });

            batch.set(ref, reminderDoc);
        });

        await batch.commit();

        return NextResponse.json({ success: true, count: newReminders.length });
    } catch (error: any) {
        console.error("Run Routine Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
