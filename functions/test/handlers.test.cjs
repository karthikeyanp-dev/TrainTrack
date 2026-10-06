const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createHandlers } = require("../lib/functions/src/handlers.js");
const { newPinRecord, verifyPin } = require("../lib/functions/src/security.js");
const { getIndiaToday, STATIONS } = require("../lib/shared/bookingRequest.js");

// Serial transaction fake rejects reads after writes, like Firestore. Each test gets
// a fresh store, allowing failure and concurrent-approval behavior to be exercised.
function memoryDatabase() {
  const documents = new Map();
  let queue = Promise.resolve();
  const reference = (path) => ({
    path, id: path.split("/").at(-1),
    collection: (name) => ({ doc: (id) => reference(`${path}/${name}/${id}`) }),
    get: async () => snapshot(reference(path)),
  });
  const snapshot = (ref) => ({ exists: documents.has(ref.path), data: () => documents.get(ref.path), ref });
  const db = {
    doc: reference,
    runTransaction(fn) {
      const run = queue.then(async () => {
        const operations = [];
        const read = (ref) => {
          assert.equal(operations.length, 0, "Firestore transaction reads must precede writes");
          return snapshot(ref);
        };
        const result = await fn({
          get: async (ref) => read(ref),
          getAll: async (...refs) => refs.map(read),
          set: (ref, data) => operations.push(["set", ref, data]),
          create: (ref, data) => operations.push(["create", ref, data]),
          update: (ref, data) => operations.push(["update", ref, data]),
        });
        const next = new Map(documents);
        for (const [kind, ref, data] of operations) {
          if (kind === "create") assert.equal(next.has(ref.path), false, "create must not overwrite a document");
          if (kind === "update") assert.equal(next.has(ref.path), true, "update requires an existing document");
          next.set(ref.path, kind === "update" ? { ...next.get(ref.path), ...data } : data);
        }
        documents.clear();
        for (const [key, value] of next) documents.set(key, value);
        return result;
      });
      queue = run.catch(() => {});
      return run;
    },
  };
  return { db, documents };
}

function fixture() {
  const store = memoryDatabase();
  const tokens = [];
  store.documents.set("appConfig/pin", newPinRecord("123456", 0));
  const handlers = createHandlers(store.db, { createCustomToken: async (uid, claims) => { tokens.push({ uid, claims }); return `custom:${uid}`; } });
  return { ...store, handlers, tokens };
}
function call(data, identity = "customer", uid = "customer-one", ip = "203.0.113.1") {
  return {
    data, app: { appId: "test-app" }, rawRequest: { ip },
    auth: identity === "none" ? undefined : {
      uid: identity === "staff" ? "staff-one" : uid,
      token: identity === "staff" ? { traintrackStaff: true, traintrackPinVersion: 0 } : { firebase: { sign_in_provider: "anonymous" } },
    },
  };
}
function futureDate() {
  const date = new Date(`${getIndiaToday()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 10);
  return date.toISOString().slice(0, 10);
}
function customerRequest(overrides = {}) {
  return {
    schemaVersion: 1, customerConfirmed: true,
    source: { code: "MAS" }, destination: { code: "NDLS" }, journeyDate: futureDate(),
    classPreference: "3A", bookingTypePreference: "General",
    contact: { name: "Asha Kumar", phone: "9876543210" },
    passengers: [{ name: "Asha Kumar", age: 34, gender: "F" }],
    trainPreference: "", upgradePreferred: false, remarks: "",
    ...overrides,
  };
}
function approval(requestId, expectedRevision = 1, overrides = {}) {
  return { requestId, expectedRevision, booking: { bookingDate: getIndiaToday(), classType: "3A", bookingType: "General", customerVerified: true, childDetailsVerified: false, ...overrides } };
}
const rejects = (action, code) => assert.rejects(action, (error) => error.code === code);

test("public requests require App Check and anonymous authentication", async () => {
  const { handlers, documents } = fixture();
  const input = { requestId: randomUUID(), request: customerRequest() };
  await rejects(() => handlers.submitBookingRequest(call(input, "none")), "unauthenticated");
  await rejects(() => handlers.submitBookingRequest(call(input, "staff")), "unauthenticated");
  await rejects(() => handlers.submitBookingRequest({ ...call(input), app: undefined }), "failed-precondition");
  assert.equal([...documents.keys()].filter((path) => path.startsWith("bookingRequests/")).length, 0);
});

test("canonical station names are server-derived and unknown codes are rejected", async () => {
  const { handlers, documents } = fixture();
  const requestId = randomUUID();
  await handlers.submitBookingRequest(call({ requestId, request: customerRequest({ source: { code: "MAS", name: "Wrong station", city: "Wrong city" } }) }));
  const stored = documents.get(`bookingRequests/${requestId}`).request;
  assert.notEqual(stored.source.name, "Wrong station");
  assert.equal(stored.source.code, "MAS");
  await rejects(() => handlers.submitBookingRequest(call({ requestId: randomUUID(), request: customerRequest({ source: { code: "FAKESTATION" } }) })), "invalid-argument");
});

test("same UID and payload retries return the original receipt without duplicate writes", async () => {
  const { handlers, documents } = fixture();
  const requestId = randomUUID();
  const input = { requestId, request: customerRequest() };
  const receipts = await Promise.all([handlers.submitBookingRequest(call(input)), handlers.submitBookingRequest(call(input))]);
  assert.deepEqual(receipts[0], receipts[1]);
  for (let index = 0; index < 15; index++) assert.deepEqual(await handlers.submitBookingRequest(call(input)), receipts[0]);
  assert.deepEqual(Object.keys(receipts[0]), ["receiptReference"]);
  assert.equal([...documents.keys()].filter((path) => path.startsWith("bookingRequests/")).length, 1);
  await rejects(() => handlers.submitBookingRequest(call(input, "customer", "another-owner")), "already-exists");
  await rejects(() => handlers.submitBookingRequest(call({ ...input, request: customerRequest({ remarks: "Changed details" }) })), "already-exists");
});

test("lost-response retries work after midnight while new past-date requests remain invalid", async () => {
  const RealDate = Date;
  let now = new RealDate("2029-12-31T12:00:00Z").getTime();
  global.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  };
  try {
    const { handlers, documents } = fixture();
    const requestId = randomUUID();
    const input = { requestId, request: customerRequest({ journeyDate: getIndiaToday() }) };
    const receipt = await handlers.submitBookingRequest(call(input));
    now += 24 * 60 * 60 * 1000;
    assert.deepEqual(await handlers.submitBookingRequest(call(input)), receipt);
    const newRequestId = randomUUID();
    await rejects(() => handlers.submitBookingRequest(call({ ...input, requestId: newRequestId })), "invalid-argument");
    assert.equal(documents.has(`bookingRequests/${newRequestId}`), false);
  } finally {
    global.Date = RealDate;
  }
});

test("catalog label changes do not break retries or replace the original customer snapshot", async () => {
  const { handlers, documents } = fixture();
  const requestId = randomUUID();
  const input = { requestId, request: customerRequest() };
  const receipt = await handlers.submitBookingRequest(call(input));
  const originalSnapshot = structuredClone(documents.get(`bookingRequests/${requestId}`).request);
  const station = STATIONS.find((value) => value.code === "MAS");
  const originalName = station.name;
  const originalCity = station.city;
  try {
    station.name = "Updated authoritative display name";
    station.city = "Updated city label";
    assert.deepEqual(await handlers.submitBookingRequest(call(input)), receipt);
    await handlers.approveBookingRequest(call(approval(requestId), "staff"));
    assert.deepEqual(documents.get(`bookings/intake-${requestId}`).intakeSourceSnapshot, originalSnapshot);
  } finally {
    station.name = originalName;
    station.city = originalCity;
  }
});

test("customer privileges and stale staff revisions cannot create bookings", async () => {
  const { handlers, documents } = fixture();
  const requestId = randomUUID();
  await handlers.submitBookingRequest(call({ requestId, request: customerRequest() }));
  await rejects(() => handlers.approveBookingRequest(call(approval(requestId))), "permission-denied");
  await handlers.updateBookingRequestStatus(call({ requestId, expectedRevision: 1, status: "clarification", message: "Please confirm the train." }, "staff"));
  await rejects(() => handlers.approveBookingRequest(call(approval(requestId), "staff")), "aborted");
  assert.equal(documents.has(`bookings/intake-${requestId}`), false);
});

test("concurrent approval creates one Requested booking and retains customer snapshot", async () => {
  const { handlers, documents } = fixture();
  const requestId = randomUUID();
  await handlers.submitBookingRequest(call({ requestId, request: customerRequest() }));
  const results = await Promise.all([handlers.approveBookingRequest(call(approval(requestId), "staff")), handlers.approveBookingRequest(call(approval(requestId), "staff"))]);
  assert.deepEqual(results[0], results[1]);
  const booking = documents.get(`bookings/intake-${requestId}`);
  assert.equal(booking.status, "Requested");
  assert.equal(booking.source, "MAS");
  assert.equal(booking.destination, "NDLS");
  assert.equal(booking.intakeSourceSnapshot.contact.phone, "+919876543210");
  assert.equal(booking.intakeApprovedBy, "staff-one");
  assert.equal(documents.get(`bookingRequests/${requestId}`).revision, 2);
  assert.equal([...documents.keys()].filter((path) => path.startsWith("bookings/")).length, 1);
});

test("closed requests cannot be approved or reopened by status updates", async () => {
  const { handlers } = fixture();
  const requestId = randomUUID();
  await handlers.submitBookingRequest(call({ requestId, request: customerRequest() }));
  await handlers.updateBookingRequestStatus(call({ requestId, expectedRevision: 1, status: "rejected", message: "Customer cancelled." }, "staff"));
  await rejects(() => handlers.approveBookingRequest(call(approval(requestId, 2), "staff")), "failed-precondition");
  await rejects(() => handlers.updateBookingRequestStatus(call({ requestId, expectedRevision: 2, status: "clarification", message: "Reopen" }, "staff")), "failed-precondition");
});

test("child details require staff verification and under-five requests stay in review", async () => {
  const { handlers, documents } = fixture();
  const childRequestId = randomUUID();
  await handlers.submitBookingRequest(call({ requestId: childRequestId, request: customerRequest({ passengers: [{ name: "Young Kumar", age: 7, gender: "M", berthRequired: false }] }) }));
  await rejects(() => handlers.approveBookingRequest(call(approval(childRequestId), "staff")), "failed-precondition");
  await handlers.approveBookingRequest(call(approval(childRequestId, 1, { childDetailsVerified: true }), "staff"));
  const infantRequestId = randomUUID();
  await handlers.submitBookingRequest(call({ requestId: infantRequestId, request: customerRequest({ passengers: [{ name: "Baby Kumar", age: 2, gender: "F" }] }) }));
  await rejects(() => handlers.approveBookingRequest(call(approval(infantRequestId, 1, { childDetailsVerified: true }), "staff")), "failed-precondition");
  assert.equal(documents.has(`bookings/intake-${infantRequestId}`), false);
});

test("staff PIN status exposes no hash; login checks PIN and sets limited staff claims", async () => {
  const { handlers, tokens } = fixture();
  assert.deepEqual(await handlers.staffPinStatus(call({}, "none")), { configured: true, pinVersion: 0 });
  await rejects(() => handlers.signInWithStaffPin(call({ pin: "111111" }, "none")), "permission-denied");
  await handlers.signInWithStaffPin(call({ pin: "123456" }, "none"));
  assert.match(tokens[0].uid, /^staff-/);
  assert.deepEqual(tokens[0].claims, { traintrackStaff: true, traintrackPinVersion: 0 });
});

test("existing long PINs remain usable during the server-auth migration", async () => {
  const { handlers, documents } = fixture();
  const legacyPin = "12345678901234567890";
  documents.set("appConfig/pin", newPinRecord(legacyPin, 0));
  assert.ok((await handlers.signInWithStaffPin(call({ pin: legacyPin }, "none"))).customToken);
  assert.deepEqual(await handlers.changeStaffPin(call({ currentPin: legacyPin, newPin: "654321" }, "staff")), { success: true });
  assert.equal(verifyPin("654321", documents.get("appConfig/pin")), true);
});

test("PIN changes require current PIN and invalidate old staff-session claims", async () => {
  const { handlers, documents } = fixture();
  await rejects(() => handlers.changeStaffPin(call({ currentPin: "111111", newPin: "654321" }, "staff")), "permission-denied");
  await rejects(() => handlers.changeStaffPin(call({ currentPin: "123456", newPin: "1234" }, "staff")), "invalid-argument");
  await rejects(() => handlers.changeStaffPin(call({ currentPin: "123456", newPin: "654321\n" }, "staff")), "invalid-argument");
  await handlers.changeStaffPin(call({ currentPin: "123456", newPin: "654321" }, "staff"));
  const pin = documents.get("appConfig/pin");
  assert.equal(pin.version, 1);
  assert.equal(verifyPin("654321", pin), true);
  const requestId = randomUUID();
  await handlers.submitBookingRequest(call({ requestId, request: customerRequest() }));
  await rejects(() => handlers.approveBookingRequest(call(approval(requestId), "staff")), "unauthenticated");
});

test("PIN guessing and repeated public submissions are rate limited", async () => {
  const { handlers } = fixture();
  for (let index = 0; index < 10; index++) await rejects(() => handlers.signInWithStaffPin(call({ pin: "111111" }, "none")), "permission-denied");
  await rejects(() => handlers.signInWithStaffPin(call({ pin: "123456" }, "none")), "resource-exhausted");
  for (let index = 0; index < 10; index++) await handlers.submitBookingRequest(call({ requestId: randomUUID(), request: customerRequest() }));
  await rejects(() => handlers.submitBookingRequest(call({ requestId: randomUUID(), request: customerRequest() })), "resource-exhausted");
});
