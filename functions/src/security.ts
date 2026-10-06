import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { Timestamp, type Firestore, type Transaction } from "firebase-admin/firestore";

export const PIN_PATH = "appConfig/pin";
export interface PinRecord { hash: string; salt: string; version?: number }

export function hashPin(pin: string, salt: string): string {
  // Matches existing browser SHA-256 records so deployment keeps the current PIN.
  return createHash("sha256").update(`${salt}:${pin}`, "utf8").digest("hex");
}

export function verifyPin(pin: string, record: unknown): record is PinRecord {
  if (!isPinRecord(record)) return false;
  const actual = Buffer.from(hashPin(pin, record.salt), "hex");
  const expected = Buffer.from(record.hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function isPinRecord(record: unknown): record is PinRecord {
  if (!record || typeof record !== "object") return false;
  const value = record as Partial<PinRecord>;
  return typeof value.hash === "string" && /^[a-f0-9]{64}$/i.test(value.hash)
    && typeof value.salt === "string" && /^[a-f0-9]{32}$/i.test(value.salt)
    && (value.version === undefined || (typeof value.version === "number" && Number.isInteger(value.version) && value.version >= 0));
}

export function newPinRecord(pin: string, version = 0): PinRecord {
  const salt = randomBytes(16).toString("hex");
  return { hash: hashPin(pin, salt), salt, version };
}

export function requireAppCheck(request: CallableRequest): void {
  if (process.env.FUNCTIONS_EMULATOR === "true") return;
  // Tests call handlers directly; production also enforces this at onCall ingress.
  if (!request.app) throw new HttpsError("failed-precondition", "App verification is required. Reload and try again.");
}

export function requireStaff(request: CallableRequest): string {
  if (!request.auth || request.auth.token.traintrackStaff !== true) {
    throw new HttpsError("permission-denied", "Staff sign-in is required.");
  }
  return request.auth.uid;
}

export async function requireCurrentStaff(request: CallableRequest, db: Firestore, transaction?: Transaction): Promise<string> {
  const uid = requireStaff(request);
  const pinRef = db.doc(PIN_PATH);
  const snapshot = transaction ? await transaction.get(pinRef) : await pinRef.get();
  const record = snapshot.data();
  if (!isPinRecord(record) || (request.auth!.token.traintrackPinVersion ?? 0) !== (record.version ?? 0)) {
    throw new HttpsError("unauthenticated", "Your staff session has expired. Sign in again.");
  }
  return uid;
}

export interface RateBucket { key: string; limit: number; windowMs: number }

export function networkKey(request: CallableRequest): string {
  // Do not trust a caller-supplied X-Forwarded-For header for quota identity.
  return request.rawRequest.ip || request.rawRequest.socket?.remoteAddress || "unknown";
}

export async function consumeRateLimits(db: Firestore, buckets: RateBucket[], now = Date.now()): Promise<void> {
  await db.runTransaction(async (transaction) => {
    const refs = buckets.map((bucket) => db.doc(`intakeRateLimits/${createHash("sha256").update(bucket.key).digest("hex")}`));
    const snapshots = await transaction.getAll(...refs);
    const next = snapshots.map((snapshot, index) => {
      const bucket = buckets[index];
      const current = snapshot.data();
      const inWindow = typeof current?.windowStart === "number" && now - current.windowStart < bucket.windowMs;
      const count = inWindow ? Number(current?.count ?? 0) : 0;
      if (count >= bucket.limit) throw new HttpsError("resource-exhausted", "Too many attempts. Please wait and try again.");
      return { windowStart: inWindow ? current!.windowStart : now, count: count + 1, expiresAt: Timestamp.fromMillis(now + bucket.windowMs * 2) };
    });
    next.forEach((data, index) => transaction.set(refs[index], data));
  });
}
