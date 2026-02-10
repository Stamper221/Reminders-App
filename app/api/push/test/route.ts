import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import webpush from "web-push";

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

// Initialize VAPID
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;

if (publicKey && privateKey) {
    webpush.setVapidDetails(vapidSubject, publicKey, privateKey);
}

export async function POST(request: NextRequest) {
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

        if (!publicKey || !privateKey) {
            return NextResponse.json({ error: "VAPID keys not configured" }, { status: 500 });
        }

        // Fetch subscriptions
        const subsRef = db.collection("users").doc(uid).collection("push_subscriptions");
        const snapshot = await subsRef.get();

        if (snapshot.empty) {
            return NextResponse.json({ success: false, error: "No subscriptions found. Please re-enable push." });
        }

        const payload = JSON.stringify({
            title: "Test Push Notification 🔔",
            body: "If you see this, push notifications are working correctly on update!",
            url: "/",
            icon: "/icon-192x192.png"
        });

        const promises = snapshot.docs.map(async (doc) => {
            const sub = doc.data();
            // Reconstruct subscription object expected by web-push
            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: sub.keys
            };

            try {
                await webpush.sendNotification(pushSubscription as any, payload);
                return { success: true, id: doc.id };
            } catch (error: any) {
                console.error(`Error sending to ${doc.id}:`, error.statusCode);
                if (error.statusCode === 410 || error.statusCode === 404) {
                    await doc.ref.delete();
                    return { success: false, id: doc.id, error: "Removed invalid subscription" };
                }
                return { success: false, id: doc.id, error: error.message };
            }
        });

        const results = await Promise.all(promises);
        const successCount = results.filter(r => r.success).length;

        return NextResponse.json({
            success: true,
            sent: successCount,
            total: results.length,
            details: results
        });

    } catch (error: any) {
        console.error("Test Push Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
