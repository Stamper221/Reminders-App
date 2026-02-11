import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getApps, initializeApp, cert } from "firebase-admin/app";

// Initialize Firebase Admin (reuse logic)
if (getApps().length === 0) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccount) {
        try {
            initializeApp({
                credential: cert(JSON.parse(serviceAccount)),
            });
        } catch (e) {
            console.error("Failed to parse service account key:", e);
            initializeApp({
                projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            });
        }
    } else {
        initializeApp({
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        });
    }
}

const db = getFirestore();

export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const token = authHeader.split("Bearer ")[1];
        let uid: string;
        try {
            const decoded = await getAuth().verifyIdToken(token);
            uid = decoded.uid;
        } catch {
            return NextResponse.json({ error: "Invalid token" }, { status: 401 });
        }

        const subsRef = db.collection("users").doc(uid).collection("push_subscriptions");
        const snapshot = await subsRef.orderBy("updatedAt", "desc").get();

        const devices = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                userAgent: data.userAgent || "Unknown Device",
                updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt),
            };
        });

        return NextResponse.json({ devices });

    } catch (error: any) {
        console.error("Get devices error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const authHeader = request.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const token = authHeader.split("Bearer ")[1];
        let uid: string;
        try {
            const decoded = await getAuth().verifyIdToken(token);
            uid = decoded.uid;
        } catch {
            return NextResponse.json({ error: "Invalid token" }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const deviceId = searchParams.get("id");

        if (deviceId) {
            // Delete single device
            await db.collection("users").doc(uid).collection("push_subscriptions").doc(deviceId).delete();
            return NextResponse.json({ success: true, message: "Device removed" });
        } else {
            // Delete ALL devices
            const subsRef = db.collection("users").doc(uid).collection("push_subscriptions");
            const snapshot = await subsRef.get();

            const batch = db.batch();
            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();

            return NextResponse.json({ success: true, message: "All devices removed" });
        }

    } catch (error: any) {
        console.error("Delete devices error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
