
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
// import { getAuth } from "firebase/auth"; // If you need auth later
// import { getStorage } from "firebase/storage"; // If you need storage later

// These environment variables determine which Firebase project your app connects to.
// To use a different Firebase project (e.g., for testing/development vs. production),
// set these variables accordingly in your environment (e.g., in a .env.local file).
// The NEXT_PUBLIC_FIREBASE_PROJECT_ID is particularly crucial for selecting the correct Firestore database.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, // Determines the Firestore database
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
    `Firebase configuration is missing or incomplete. Please check your .env file or .env.local for overrides. Missing keys: ${missingKeys.join(", ")}. Ensure all NEXT_PUBLIC_FIREBASE_ variables are set.`
  );
  // Firebase will not be initialized, db will remain null.
} else {
  if (!getApps().length) {
    try {
      console.log(`Initializing Firebase app for project: ${firebaseConfig.projectId}...`);
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
    app = getApps()[0];
    // Ensure the existing app is for the intended project ID, especially if .env variables changed.
    // However, Next.js typically requires a server restart for .env changes to take full effect,
    // which would lead to a new initialization if the projectId changed.
    // For simplicity, we'll log the project ID it's currently using.
    console.log(`Using existing Firebase app instance. Configured Project ID for this instance: ${app.options.projectId}. Target Project ID from env: ${firebaseConfig.projectId}`);
    if (app.options.projectId !== firebaseConfig.projectId) {
        console.warn(`Mismatch between existing Firebase app's project ID (${app.options.projectId}) and target project ID in environment variables (${firebaseConfig.projectId}). A server restart might be needed for changes to environment variables to fully apply.`);
    }
    
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
