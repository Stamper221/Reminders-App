import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

console.log("Firebase Client: Initializing with projectId:", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Validate config
const requiredKeys = Object.entries(firebaseConfig).filter(([key, val]) => !val);
if (requiredKeys.length > 0) {
    console.error("Firebase Client: Missing config keys!", requiredKeys);
} else {
    console.log("Firebase Client: Config loaded successfully");
}

// Initialize Firebase
let app;
let auth: any;
let db: any;

try {
    if (requiredKeys.length > 0) {
        throw new Error(`Missing required firebase config keys: ${requiredKeys.map(k => k[0]).join(", ")}`);
    }

    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    auth = getAuth(app);

    // Use persistent local cache (IndexedDB) to minimize Firestore reads on page reloads.
    // initializeFirestore can only be called once per app; on HMR reloads we fall back to getFirestore.
    try {
        db = initializeFirestore(app, {
            localCache: persistentLocalCache({
                tabManager: persistentMultipleTabManager(),
            }),
        });
    } catch (e) {
        // Already initialized (e.g., during hot module replacement) — reuse existing instance
        db = getFirestore(app);
    }
    console.log("Firebase Client: Initialized successfully");
} catch (error) {
    console.error("Firebase Client: Initialization failed", error);
    // We don't throw here to prevent the entire app from crashing during module import.
    // Instead we leave auth/db as undefined/null so consumers can handle it.
}

export { app, auth, db };
