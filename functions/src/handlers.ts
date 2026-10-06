import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Auth } from "firebase-admin/auth";
import { FieldValue, type DocumentData, type Firestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { z } from "zod";
import {
  approvalPlanSchema,
  customerBookingRequestSchema,
  customerBookingRequestSnapshotSchema,
  getRequestWarnings,
  toBookingData,
} from "../../shared/bookingRequest";
import {
  consumeRateLimits,
  isPinRecord,
  networkKey,
  newPinRecord,
  PIN_PATH,
  requireAppCheck,
  requireCurrentStaff,
  requireStaff,
  verifyPin,
} from "./security";

const requestIdSchema = z.string().uuid();
// The old staff gate had a four-digit minimum and no maximum. Keep valid
// existing PINs usable while applying the new limit only when choosing a PIN.
const existingPinSchema = z.string().min(4).refine(pin => !/\D/.test(pin), "Use digits only.");
const newPinSchema = z.string().min(6).max(12).refine(pin => !/\D/.test(pin), "Use a PIN with 6 to 12 digits.");
const submitSchema = z.object({ requestId: requestIdSchema, request: customerBookingRequestSnapshotSchema }).strict();
const approveSchema = z.object({ requestId: requestIdSchema, expectedRevision: z.number().int().positive(), booking: approvalPlanSchema }).strict();
const statusSchema = z.object({
  requestId: requestIdSchema,
  expectedRevision: z.number().int().positive(),
  status: z.enum(["clarification", "rejected"]),
  message: z.string().trim().min(1, "Add a note explaining what needs attention.").max(1000),
}).strict();

function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpsError("invalid-argument", "Please check the supplied details.", {
      issues: result.error.issues.map(({ path, message }) => ({ path: path.join("."), message })),
    });
  }
  return result.data;
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function clean<T>(value: T): T {
  // Firestore rejects undefined optional keys, including inside passenger arrays.
  return JSON.parse(JSON.stringify(value));
}

const MINUTE = 60_000;

export function createHandlers(db: Firestore, auth: Pick<Auth, "createCustomToken">) {
  return {
    async submitBookingRequest(call: CallableRequest) {
      requireAppCheck(call);
      if (!call.auth || call.auth.token.firebase?.sign_in_provider !== "anonymous") {
        throw new HttpsError("unauthenticated", "Start a customer session and try again.");
      }
      const { requestId, request } = parse(submitSchema, call.data);
      // Directory names and cities can change between deployments. Customer
      // intent is bound to the explicitly selected codes, not catalog labels.
      const payloadHash = digest({ ...request, source: { code: request.source.code }, destination: { code: request.destination.code } });
      const reference = db.doc(`bookingRequests/${requestId}`);
      const ownerUid = call.auth.uid;
      const retryReceipt = (data: DocumentData) => {
        if (data.ownerUid !== ownerUid || data.payloadHash !== payloadHash) {
          throw new HttpsError("already-exists", "This submission reference is already in use. Start a new request.");
        }
        return { receiptReference: data.receiptReference as string };
      };
      // A lost response or repeated tap must not consume the new-request quota.
      const previouslySubmitted = await reference.get();
      if (previouslySubmitted.exists) return retryReceipt(previouslySubmitted.data()!);
      parse(customerBookingRequestSchema, request);
      await consumeRateLimits(db, [
        { key: `submit-uid:${ownerUid}`, limit: 10, windowMs: 60 * MINUTE },
        { key: `submit-ip:${networkKey(call)}`, limit: 40, windowMs: 60 * MINUTE },
      ]);
      return db.runTransaction(async (transaction) => {
        const existing = await transaction.get(reference);
        if (existing.exists) {
          // Response contains no contact or passenger information, even for retries.
          return retryReceipt(existing.data()!);
        }
        const receiptReference = `TT-${randomBytes(8).toString("hex").toUpperCase()}`;
        transaction.create(reference, {
          request: clean(request),
          ownerUid,
          payloadHash,
          receiptReference,
          status: "submitted",
          revision: 1,
          warnings: getRequestWarnings(request),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { receiptReference };
      });
    },

    async staffPinStatus(call: CallableRequest) {
      requireAppCheck(call);
      await consumeRateLimits(db, [{ key: `pin-status:${networkKey(call)}`, limit: 60, windowMs: 15 * MINUTE }]);
      const snapshot = await db.doc(PIN_PATH).get();
      const stored = snapshot.data();
      return { configured: isPinRecord(stored), pinVersion: isPinRecord(stored) ? stored.version ?? 0 : 0 };
    },

    async signInWithStaffPin(call: CallableRequest) {
      requireAppCheck(call);
      await consumeRateLimits(db, [
        { key: `pin-login-ip:${networkKey(call)}`, limit: 10, windowMs: 15 * MINUTE },
        { key: "pin-login-global", limit: 60, windowMs: 15 * MINUTE },
      ]);
      const { pin } = parse(z.object({ pin: existingPinSchema }).strict(), call.data);
      const snapshot = await db.doc(PIN_PATH).get();
      const stored = snapshot.data();
      if (!verifyPin(pin, stored)) throw new HttpsError("permission-denied", "Incorrect PIN or staff sign-in is not configured.");
      const customToken = await auth.createCustomToken(`staff-${randomUUID()}`, {
        traintrackStaff: true,
        traintrackPinVersion: stored.version ?? 0,
      });
      return { customToken };
    },

    async changeStaffPin(call: CallableRequest) {
      requireAppCheck(call);
      const uid = requireStaff(call);
      await consumeRateLimits(db, [
        { key: `pin-change:${uid}`, limit: 5, windowMs: 15 * MINUTE },
        { key: `pin-change-ip:${networkKey(call)}`, limit: 10, windowMs: 15 * MINUTE },
      ]);
      const { currentPin, newPin } = parse(z.object({ currentPin: existingPinSchema, newPin: newPinSchema }).strict(), call.data);
      await db.runTransaction(async (transaction) => {
        await requireCurrentStaff(call, db, transaction);
        const reference = db.doc(PIN_PATH);
        const stored = (await transaction.get(reference)).data();
        if (!verifyPin(currentPin, stored)) throw new HttpsError("permission-denied", "Current PIN is incorrect.");
        transaction.set(reference, {
          ...newPinRecord(newPin, (stored.version ?? 0) + 1),
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: uid,
        });
      });
      // Client signs out and signs in again. Old PIN-version claims no longer pass.
      return { success: true };
    },

    async approveBookingRequest(call: CallableRequest) {
      requireAppCheck(call);
      const uid = requireStaff(call);
      await consumeRateLimits(db, [{ key: `staff-review:${uid}`, limit: 120, windowMs: 15 * MINUTE }]);
      const { requestId, expectedRevision, booking: plan } = parse(approveSchema, call.data);
      const reference = db.doc(`bookingRequests/${requestId}`);
      const bookingReference = db.doc(`bookings/intake-${requestId}`);
      return db.runTransaction(async (transaction) => {
        await requireCurrentStaff(call, db, transaction);
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw new HttpsError("not-found", "Booking request was not found.");
        const stored = snapshot.data()!;
        if (stored.status === "approved" && stored.approvedBookingId) return { bookingId: stored.approvedBookingId as string };
        if (stored.revision !== expectedRevision) throw new HttpsError("aborted", "This request has changed. Reload it before reviewing.");
        if (stored.status !== "submitted" && stored.status !== "clarification") throw new HttpsError("failed-precondition", "This request is closed and cannot be approved.");
        const request = parse(customerBookingRequestSchema, stored.request);
        let bookingData: ReturnType<typeof toBookingData>;
        try {
          bookingData = toBookingData(request, plan);
        } catch (error) {
          throw new HttpsError("failed-precondition", error instanceof Error ? error.message : "Resolve the request details before approval.");
        }
        const timestamp = FieldValue.serverTimestamp();
        transaction.create(bookingReference, {
          ...clean(bookingData),
          status: "Requested",
          createdAt: timestamp,
          updatedAt: timestamp,
          intakeRequestId: requestId,
          intakeReceiptReference: stored.receiptReference,
          intakeSourceSnapshot: clean(stored.request),
          intakeApprovalPlan: clean(plan),
          intakeApprovedBy: uid,
          intakeApprovedAt: timestamp,
        });
        transaction.update(reference, {
          status: "approved",
          revision: expectedRevision + 1,
          approvedBookingId: bookingReference.id,
          approvedBy: uid,
          approvedAt: timestamp,
          approvalPlan: clean(plan),
          updatedAt: timestamp,
        });
        transaction.create(reference.collection("reviewEvents").doc(String(expectedRevision + 1)), {
          action: "approved", staffUid: uid, previousRevision: expectedRevision,
          bookingId: bookingReference.id, createdAt: timestamp,
        });
        return { bookingId: bookingReference.id };
      });
    },

    async updateBookingRequestStatus(call: CallableRequest) {
      requireAppCheck(call);
      const uid = requireStaff(call);
      await consumeRateLimits(db, [{ key: `staff-review:${uid}`, limit: 120, windowMs: 15 * MINUTE }]);
      const { requestId, expectedRevision, status, message } = parse(statusSchema, call.data);
      const reference = db.doc(`bookingRequests/${requestId}`);
      return db.runTransaction(async (transaction) => {
        await requireCurrentStaff(call, db, transaction);
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) throw new HttpsError("not-found", "Booking request was not found.");
        const stored = snapshot.data()!;
        if (stored.revision !== expectedRevision) throw new HttpsError("aborted", "This request has changed. Reload it before reviewing.");
        if (stored.status !== "submitted" && stored.status !== "clarification") throw new HttpsError("failed-precondition", "This request is closed.");
        const revision = expectedRevision + 1;
        const timestamp = FieldValue.serverTimestamp();
        transaction.update(reference, { status, revision, reviewNote: message, reviewedBy: uid, updatedAt: timestamp });
        transaction.create(reference.collection("reviewEvents").doc(String(revision)), {
          action: status, note: message, staffUid: uid, previousRevision: expectedRevision, createdAt: timestamp,
        });
        return { revision };
      });
    },
  };
}
