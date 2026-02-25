import * as admin from 'firebase-admin';

// Initialize Firebase Admin if it hasn't been already
if (!admin.apps.length) {
    let credential;
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        try {
            // Next.js might keep surrounding quotes, let's strip them if present
            const cleanJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.replace(/^'|'$/g, '');
            credential = admin.credential.cert(JSON.parse(cleanJson));
        } catch (e) {
            console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY:", e);
        }
    }

    if (!credential) {
        credential = admin.credential.cert({
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        });
    }

    admin.initializeApp({
        credential
    });
}

export const adminDb = admin.firestore();
export const adminAuth = admin.auth();
