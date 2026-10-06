import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { setGlobalOptions } from "firebase-functions/v2";
import { onCall } from "firebase-functions/v2/https";
import { defineString } from "firebase-functions/params";
import { createHandlers } from "./handlers";

const adminApp = getApps()[0] ?? initializeApp();
const databaseId = defineString("TRAINTRACK_FIRESTORE_DATABASE_ID", { default: "(default)", description: "Use the same Firestore database ID as the TrainTrack staff and customer apps." });
setGlobalOptions({ region: "asia-south1", maxInstances: 10, memory: "256MiB", timeoutSeconds: 30 });
const options = { enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true" };
// Resolve params during requests; do not read .env configuration during deploy discovery.
const handlers = () => createHandlers(getFirestore(adminApp, databaseId.value()), getAuth(adminApp));

export const submitBookingRequest = onCall(options, (request) => handlers().submitBookingRequest(request));
export const staffPinStatus = onCall(options, (request) => handlers().staffPinStatus(request));
export const signInWithStaffPin = onCall(options, (request) => handlers().signInWithStaffPin(request));
export const changeStaffPin = onCall(options, (request) => handlers().changeStaffPin(request));
export const approveBookingRequest = onCall(options, (request) => handlers().approveBookingRequest(request));
export const updateBookingRequestStatus = onCall(options, (request) => handlers().updateBookingRequestStatus(request));
