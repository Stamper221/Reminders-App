import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import crypto from "crypto";

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

export async function POST(request: NextRequest) {
    try {
        const subscription = await request.json();

        if (!subscription || !subscription.endpoint) {
            return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
        }

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

        // Use hash of endpoint as ID
        const id = crypto.createHash("sha256").update(subscription.endpoint).digest("hex");

        await db.collection("users").doc(uid).collection("push_subscriptions").doc(id).set({
            endpoint: subscription.endpoint,
            keys: subscription.keys,
            updatedAt: new Date(),
            userAgent: request.headers.get("user-agent") || "unknown"
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Subscribe error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
