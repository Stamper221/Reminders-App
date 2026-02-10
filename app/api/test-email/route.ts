import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import nodemailer from "nodemailer";

// Initialize Firebase Admin if not already done
if (getApps().length === 0) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccount) {
        try {
            initializeApp({
                credential: cert(JSON.parse(serviceAccount)),
            });
        } catch (e) {
            console.warn("Failed to parse service account key, falling back to projectId:", e);
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
        // Authenticate
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

        // Get User
        const userDoc = await db.collection("users").doc(uid).get();
        if (!userDoc.exists) {
            return NextResponse.json({ error: "User profile not found" }, { status: 404 });
        }
        const user = userDoc.data();
        const email = user?.email;

        if (!email) {
            return NextResponse.json({ error: "No email address configured in Settings." }, { status: 400 });
        }

        // SMTP Config
        const smtpHost = process.env.SMTP_HOST;
        const smtpPort = parseInt(process.env.SMTP_PORT || "587");
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;
        const smtpFrom = process.env.SMTP_FROM || smtpUser || "noreply@reminders.app";

        if (!smtpHost || !smtpUser || !smtpPass) {
            return NextResponse.json({ error: "SMTP credentials not configured on server" }, { status: 500 });
        }

        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: { user: smtpUser, pass: smtpPass },
        });

        // Send
        await transporter.sendMail({
            from: `"Reminders App" <${smtpFrom}>`,
            to: email,
            subject: "Test Notification: Reminders App 📧",
            text: "This is a test email execution from your Reminders App. If you received this, your email notifications are working correctly! 🎉",
            html: `
                <div style="font-family: sans-serif; padding: 20px; color: #333;">
                    <h2>Test Notification</h2>
                    <p>This is a test email execution from your <strong>Reminders App</strong>.</p>
                    <p>If you received this, your email notifications are configured correctly! 🎉</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #666;">Sent from your Reminders App.</p>
                </div>
            `
        });

        return NextResponse.json({ success: true, email });
    } catch (error: any) {
        console.error("Test Email error:", error);
        return NextResponse.json({ error: error.message || "Failed to send email" }, { status: 500 });
    }
}
