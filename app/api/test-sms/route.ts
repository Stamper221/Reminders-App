import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, getApps, cert } from "firebase-admin/app";

// Initialize Firebase Admin if not already done
if (getApps().length === 0) {
    // For local development, uses default credentials
    initializeApp({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    });
}

const db = getFirestore();

export async function POST(request: NextRequest) {
    try {
        // Get the auth token from the request headers
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

        // Get user's phone number from Firestore
        const userDoc = await db.collection("users").doc(uid).get();
        if (!userDoc.exists) {
            return NextResponse.json({ error: "User profile not found" }, { status: 404 });
        }

        const user = userDoc.data();
        if (!user?.phoneNumber) {
            return NextResponse.json(
                { error: "No phone number configured. Please set your phone number in Settings." },
                { status: 400 }
            );
        }

        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken2 = process.env.TWILIO_AUTH_TOKEN;
        const fromNumber = process.env.TWILIO_PHONE_NUMBER;

        if (!accountSid || !authToken2 || !fromNumber) {
            return NextResponse.json(
                { error: "Twilio credentials not configured on the server" },
                { status: 500 }
            );
        }

        const client = twilio(accountSid, authToken2);

        const message = await client.messages.create({
            body: "This is a test message from your Reminders App. If you can read this, SMS notifications are working! 🎉",
            from: fromNumber,
            to: user.phoneNumber,
        });

        return NextResponse.json({ success: true, sid: message.sid });
    } catch (error: any) {
        console.error("Test SMS error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to send test SMS" },
            { status: 500 }
        );
    }
}
