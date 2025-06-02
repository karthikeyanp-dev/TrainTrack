
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
// import { getAuth } from "firebase/auth"; // If you need auth later
// import { getStorage } from "firebase/storage"; // If you need storage later

// These environment variables determine which Firebase project your app connects to.
// The NEXT_PUBLIC_FIREBASE_PROJECT_ID is crucial for selecting the correct Firebase project.
// The NEXT_PUBLIC_FIREBASE_DATABASE_ID (optional) allows specifying a named Firestore database
// instance within that project (e.g., for testing). If not provided, it connects to the '(default)' database.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // Optional
};

const targetDatabaseId = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || "(default)";

let app: FirebaseApp | undefined = undefined;
let db: Firestore | null = null;

// Check if all required firebase config values are present
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
      console.log(`Attempting to connect to Firestore database ID: '${targetDatabaseId}' within project '${firebaseConfig.projectId}'.`);
      db = getFirestore(app, targetDatabaseId);
      console.log(`Firebase initialized successfully. Firestore instance obtained for database ID: '${targetDatabaseId}'.`);
    } catch (error) {
      console.error(`Firebase initialization or Firestore connection to database ID '${targetDatabaseId}' failed:`, error);
      app = undefined;
      db = null;
    }
  } else {
    app = getApps()[0];
    console.log(`Using existing Firebase app instance. Configured Project ID for this instance: ${app.options.projectId}. Target Project ID from env: ${firebaseConfig.projectId}`);
    if (app.options.projectId !== firebaseConfig.projectId) {
        console.warn(`Mismatch between existing Firebase app's project ID (${app.options.projectId}) and target project ID in environment variables (${firebaseConfig.projectId}). A server restart might be needed for changes to environment variables to fully apply.`);
    }
    
    if (app) {
      try {
        console.log(`Attempting to connect to Firestore database ID: '${targetDatabaseId}' using existing app.`);
        db = getFirestore(app, targetDatabaseId);
        console.log(`Firestore instance obtained for database ID: '${targetDatabaseId}' from existing Firebase app.`);
      } catch (error) {
        console.error(`Failed to get Firestore for database ID '${targetDatabaseId}' from existing Firebase app:`, error);
        db = null;
      }
    } else {
      console.error("Firebase getApps() returned an array, but the first element was not a valid app instance.");
      db = null;
    }
  }
}

export { app, db }; // db can be null here if initialization failed or config was missing
