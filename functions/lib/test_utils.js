"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTestSMS = void 0;
const https_1 = require("firebase-functions/v2/https");
const logger = __importStar(require("firebase-functions/logger"));
const admin = __importStar(require("firebase-admin"));
const sms_1 = require("./sms");
const db = admin.firestore();
exports.sendTestSMS = (0, https_1.onCall)(async (request) => {
    // Ensure user is authenticated
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    const uid = request.auth.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
        throw new https_1.HttpsError("not-found", "User profile not found.");
    }
    const user = userDoc.data();
    if (!user || !user.phoneNumber) {
        throw new https_1.HttpsError("failed-precondition", "No phone number configured.");
    }
    // Rate limiting (simple implementation: check last test sent)
    // For MVP we just send it.
    logger.info(`Sending test SMS to user ${uid} (${user.phoneNumber})`);
    const success = await (0, sms_1.sendSMS)(user.phoneNumber, "This is a test message from your Reminders App. If you can read this, notifications are working!");
    if (!success) {
        throw new https_1.HttpsError("internal", "Failed to send SMS via Twilio.");
    }
    return { success: true, message: "Test message sent!" };
});
//# sourceMappingURL=test_utils.js.map