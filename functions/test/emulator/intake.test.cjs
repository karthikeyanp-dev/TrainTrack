const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { newPinRecord } = require("../../lib/functions/src/security.js");
const { getIndiaToday } = require("../../lib/shared/bookingRequest.js");

const projectId = process.env.GCLOUD_PROJECT || "demo-traintrack-intake";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const localHost = /^(?:localhost|127\.0\.0\.1|\[::1\]):\d+$/;
if (!projectId.startsWith("demo-") || !localHost.test(firestoreHost || "") || !localHost.test(authHost || "")) {
  throw new Error("Emulator tests require a demo-* project and loopback Firestore/Auth emulator hosts. They will never connect to production.");
}
const functionsHost = "127.0.0.1:5001";
const app = initializeApp({ projectId }, `intake-tests-${randomUUID()}`);
const db = getFirestore(app);
let customerToken;
let staffToken;

async function authenticate(endpoint, payload) {
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=demo-key`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, returnSecureToken: true }),
  });
  const result = await response.json();
  assert.equal(response.ok, true, JSON.stringify(result));
  return result.idToken;
}
async function callable(name, data, token) {
  const response = await fetch(`http://${functionsHost}/${projectId}/asia-south1/${name}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ data }),
  });
  return response.json();
}
async function firestoreRequest(path, token, method = "GET", data) {
  return fetch(`http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(data && { body: JSON.stringify(data) }),
  });
}
function requestInput() {
  const date = new Date(`${getIndiaToday()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 10);
  return {
    schemaVersion: 1, customerConfirmed: true,
    source: { code: "MAS" }, destination: { code: "NDLS" }, journeyDate: date.toISOString().slice(0, 10),
    classPreference: "3A", bookingTypePreference: "General", contact: { name: "Test Traveller", phone: "9876543210" },
    passengers: [{ name: "Test Traveller", age: 34, gender: "F" }], trainPreference: "", upgradePreferred: false, remarks: "Emulator test only",
  };
}
function approval(requestId, expectedRevision = 1) {
  return { requestId, expectedRevision, booking: { bookingDate: getIndiaToday(), classType: "3A", bookingType: "General", customerVerified: true, childDetailsVerified: false } };
}

before(async () => {
  await fetch(`http://${firestoreHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`http://${authHost}/emulator/v1/projects/${projectId}/accounts`, { method: "DELETE" });
  await db.doc("appConfig/pin").set(newPinRecord("123456", 0));
  customerToken = await authenticate("signUp", {});
  const login = await callable("signInWithStaffPin", { pin: "123456" });
  assert.ok(login.result?.customToken, JSON.stringify(login));
  staffToken = await authenticate("signInWithCustomToken", { token: login.result.customToken });
});
after(async () => { await deleteApp(app); });

test("HTTP PIN login issues a token that the Firebase Auth emulator accepts", async () => {
  assert.deepEqual((await callable("staffPinStatus", {})).result, { configured: true, pinVersion: 0 });
  const claims = JSON.parse(Buffer.from(staffToken.split(".")[1], "base64url").toString("utf8"));
  assert.equal(claims.traintrackStaff, true);
  assert.equal(claims.traintrackPinVersion, 0);
  assert.equal((await callable("signInWithStaffPin", { pin: "111111" })).error?.status, "PERMISSION_DENIED");
});

test("Firestore rules isolate public customers and keep PIN/inbox writes server-only", async () => {
  await db.doc("bookings/rules-test").set({ status: "Requested", userName: "Synthetic rule check" });
  await db.doc("irctcAccounts/rules-test").set({ username: "synthetic-only" });
  assert.equal((await firestoreRequest("bookings/rules-test", customerToken)).status, 403);
  assert.equal((await firestoreRequest("irctcAccounts/rules-test", customerToken)).status, 403);
  assert.equal((await firestoreRequest("bookings/rules-test")).status, 403);
  assert.equal((await firestoreRequest("bookings/rules-test", staffToken)).status, 200);
  assert.equal((await firestoreRequest("appConfig/pin", staffToken)).status, 403);
  assert.equal((await firestoreRequest("bookingRequests", customerToken)).status, 403);
  assert.equal((await firestoreRequest(`bookingRequests/${randomUUID()}`, staffToken, "PATCH", { fields: { status: { stringValue: "approved" } } })).status, 403);
});

test("HTTP intake requires anonymous auth, returns receipt only, and deduplicates retries", async () => {
  const requestId = randomUUID();
  const data = { requestId, request: requestInput() };
  assert.equal((await callable("submitBookingRequest", data)).error?.status, "UNAUTHENTICATED");
  const first = await callable("submitBookingRequest", data, customerToken);
  assert.deepEqual(Object.keys(first.result || {}), ["receiptReference"]);
  assert.deepEqual(await callable("submitBookingRequest", data, customerToken), first);
  const snapshot = await db.doc(`bookingRequests/${requestId}`).get();
  assert.equal(snapshot.data().status, "submitted");
  assert.equal(snapshot.data().request.source.code, "MAS");
});

test("HTTP customer cannot approve; concurrent staff approvals create one Requested booking", async () => {
  const requestId = randomUUID();
  await callable("submitBookingRequest", { requestId, request: requestInput() }, customerToken);
  assert.equal((await callable("approveBookingRequest", approval(requestId), customerToken)).error?.status, "PERMISSION_DENIED");
  const results = await Promise.all([
    callable("approveBookingRequest", approval(requestId), staffToken),
    callable("approveBookingRequest", approval(requestId), staffToken),
  ]);
  assert.ok(results[0].result?.bookingId, JSON.stringify(results[0]));
  assert.deepEqual(results[0], results[1]);
  const snapshot = await db.doc(`bookings/intake-${requestId}`).get();
  assert.equal(snapshot.data().status, "Requested");
  assert.equal(snapshot.data().intakeRequestId, requestId);
  assert.ok(snapshot.data().intakeSourceSnapshot.customerConfirmed);
  assert.equal((await db.doc(`bookingRequests/${requestId}`).get()).data().revision, 2);
});

test("HTTP stale approval fails after clarification and closed requests remain closed", async () => {
  const requestId = randomUUID();
  await callable("submitBookingRequest", { requestId, request: requestInput() }, customerToken);
  const updated = await callable("updateBookingRequestStatus", { requestId, expectedRevision: 1, status: "clarification", message: "Confirm details" }, staffToken);
  assert.equal(updated.result?.revision, 2);
  assert.equal((await callable("approveBookingRequest", approval(requestId), staffToken)).error?.status, "ABORTED");
  await callable("updateBookingRequestStatus", { requestId, expectedRevision: 2, status: "rejected", message: "Cancelled" }, staffToken);
  assert.equal((await callable("approveBookingRequest", approval(requestId, 3), staffToken)).error?.status, "FAILED_PRECONDITION");
  assert.equal((await db.doc(`bookings/intake-${requestId}`).get()).exists, false);
});

test("HTTP PIN change invalidates previous staff tokens", async () => {
  const changed = await callable("changeStaffPin", { currentPin: "123456", newPin: "654321" }, staffToken);
  assert.equal(changed.result?.success, true);
  assert.deepEqual((await callable("staffPinStatus", {})).result, { configured: true, pinVersion: 1 });
  const requestId = randomUUID();
  await callable("submitBookingRequest", { requestId, request: requestInput() }, customerToken);
  assert.equal((await callable("approveBookingRequest", approval(requestId), staffToken)).error?.status, "UNAUTHENTICATED");
  assert.equal((await firestoreRequest("bookings/rules-test", staffToken)).status, 403);
});
