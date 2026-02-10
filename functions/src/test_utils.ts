import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { sendSMS } from "./sms";

const db = admin.firestore();

export const sendTestSMS = onCall(async (request) => {
    // Ensure user is authenticated
    if (!request.auth) {
        throw new HttpsError(
            "unauthenticated",
            "The function must be called while authenticated."
        );
    }

    const uid = request.auth.uid;
    const userDoc = await db.collection("users").doc(uid).get();

    if (!userDoc.exists) {
        throw new HttpsError(
            "not-found",
            "User profile not found."
        );
    }

    const user = userDoc.data();
    if (!user || !user.phoneNumber) {
        throw new HttpsError(
            "failed-precondition",
            "No phone number configured."
        );
    }

    // Rate limiting (simple implementation: check last test sent)
    // For MVP we just send it.

    logger.info(`Sending test SMS to user ${uid} (${user.phoneNumber})`);

    const success = await sendSMS(user.phoneNumber, "This is a test message from your Reminders App. If you can read this, notifications are working!");

    if (!success) {
        throw new HttpsError(
            "internal",
            "Failed to send SMS via Twilio."
        );
    }

    return { success: true, message: "Test message sent!" };
});
