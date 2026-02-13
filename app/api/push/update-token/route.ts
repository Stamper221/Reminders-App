import { NextRequest, NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, getApps, cert } from "firebase-admin/app";

// Initialize Firebase Admin
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

export async function POST(request: NextRequest) {
    try {
        const { oldEndpoint, newSubscription } = await request.json();

        if (!oldEndpoint || !newSubscription) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // Find the subscription document by old endpoint
        const subscriptionsRef = db.collectionGroup("push_subscriptions");
        const snapshot = await subscriptionsRef.where("endpoint", "==", oldEndpoint).get();

        if (snapshot.empty) {
            console.warn("Attempted to update unknown subscription:", oldEndpoint);
            return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
        }

        // Update all matches (theoretical duplicates, usually 1)
        const batch = db.batch();
        let count = 0;

        snapshot.docs.forEach(doc => {
            batch.update(doc.ref, {
                endpoint: newSubscription.endpoint,
                keys: newSubscription.keys,
                updatedAt: new Date()
            });
            count++;
        });

        await batch.commit();
        console.log(`Updated ${count} subscription(s) via rotation.`);

        return NextResponse.json({ success: true, updated: count });

    } catch (error: any) {
        console.error("Token Update Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
