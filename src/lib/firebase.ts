
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
// import { getAuth } from "firebase/auth"; // If you need auth later
// import { getStorage } from "firebase/storage"; // If you need storage later

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // Optional
};

let app: FirebaseApp | undefined = undefined;
let db: Firestore | null = null;

// Check if all firebase config values are present
const requiredConfigKeys: (keyof typeof firebaseConfig)[] = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
];

const missingKeys = requiredConfigKeys.filter(key => !firebaseConfig[key]);

if (missingKeys.length > 0) {
  console.error(
    `Firebase configuration is missing or incomplete. Please check your .env file. Missing keys: ${missingKeys.join(", ")}. Ensure all NEXT_PUBLIC_FIREBASE_ variables are set.`
  );
  // Firebase will not be initialized, db will remain null.
} else {
  if (!getApps().length) {
    try {
      console.log("Initializing Firebase app...");
      app = initializeApp(firebaseConfig);
      db = getFirestore(app);
      console.log("Firebase initialized successfully and Firestore instance obtained.");
    } catch (error) {
      console.error("Firebase initialization failed:", error);
      // app might be partially initialized or undefined, db remains null
      app = undefined; // Ensure app is undefined on error
      db = null;
    }
  } else {
    console.log("Firebase app already exists. Getting instance...");
    app = getApps()[0];
    if (app) {
      try {
        db = getFirestore(app);
        console.log("Firestore instance obtained from existing Firebase app.");
      } catch (error) {
        console.error("Failed to get Firestore from existing Firebase app:", error);
        db = null; // Ensure db is null on error
      }
    } else {
      // This case should ideally not happen if getApps().length > 0
      console.error("Firebase getApps() returned an array, but the first element was not a valid app instance.");
      db = null; // Ensure db is null
    }
  }
}

export { app, db }; // db can be null here if initialization failed or config was missing
