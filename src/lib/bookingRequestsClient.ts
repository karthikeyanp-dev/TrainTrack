import { onIdTokenChanged } from "firebase/auth";
import { collection, onSnapshot, orderBy, query, Timestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "@/lib/firebase";
import type { ApprovalPlan, BookingRequestRecord } from "@shared/bookingRequest";

export type RequestSession = "loading" | "staff" | "locked";

function timestampToString(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return typeof value === "string" ? value : "";
}

/** The listener only starts after a server-issued staff claim has been checked. */
export function subscribeToBookingRequests(
  onData: (requests: BookingRequestRecord[]) => void,
  onError: (error: Error) => void,
  onSession: (session: RequestSession) => void,
): () => void {
  if (!auth || !db) {
    onSession("locked");
    onError(new Error("Firebase is not configured. Check the application's Firebase environment settings."));
    return () => {};
  }

  const database = db;
  let stopRequests: (() => void) | undefined;
  let generation = 0;
  const stopAuth = onIdTokenChanged(auth, async (user) => {
    const currentGeneration = ++generation;
    stopRequests?.();
    stopRequests = undefined;
    onData([]);
    onSession("loading");

    try {
      const token = user ? await user.getIdTokenResult() : null;
      if (currentGeneration !== generation) return;
      if (token?.claims.traintrackStaff !== true) {
        onSession("locked");
        return;
      }
      onSession("staff");
      stopRequests = onSnapshot(
        query(collection(database, "bookingRequests"), orderBy("createdAt", "desc")),
        (snapshot) => {
          const requests = snapshot.docs.map((document): BookingRequestRecord => {
            const data = document.data();
            return {
              id: document.id,
              request: data.request,
              status: data.status,
              revision: data.revision,
              receiptReference: data.receiptReference,
              createdAt: timestampToString(data.createdAt),
              updatedAt: timestampToString(data.updatedAt),
              approvedBookingId: data.approvedBookingId,
              reviewNote: data.reviewNote,
              approvedBy: data.approvedBy,
              approvedAt: data.approvedAt ? timestampToString(data.approvedAt) : undefined,
            };
          });
          onData(requests);
        },
        (error) => onError(new Error(requestActionError(error))),
      );
    } catch (error) {
      if (currentGeneration !== generation) return;
      onSession("locked");
      onError(new Error(requestActionError(error)));
    }
  });

  return () => {
    generation++;
    stopAuth();
    stopRequests?.();
  };
}

function requestFunctions() {
  if (!functions) throw new Error("The staff review service is not configured. Check the application's Firebase settings.");
  return functions;
}

export async function approveBookingRequest(
  requestId: string,
  expectedRevision: number,
  booking: ApprovalPlan,
): Promise<{ bookingId: string }> {
  const approve = httpsCallable<
    { requestId: string; expectedRevision: number; booking: ApprovalPlan },
    { bookingId: string }
  >(requestFunctions(), "approveBookingRequest");
  return (await approve({ requestId, expectedRevision, booking })).data;
}

export async function updateBookingRequestStatus(
  requestId: string,
  expectedRevision: number,
  status: "clarification" | "rejected",
  message: string,
): Promise<{ revision: number }> {
  const updateStatus = httpsCallable<
    { requestId: string; expectedRevision: number; status: "clarification" | "rejected"; message: string },
    { revision: number }
  >(requestFunctions(), "updateBookingRequestStatus");
  return (await updateStatus({ requestId, expectedRevision, status, message })).data;
}

export function requestActionError(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
  if (code.endsWith("unauthenticated") || code.endsWith("permission-denied")) {
    return "Your staff session could not be verified. Lock the app and sign in again before retrying.";
  }
  if (code.endsWith("failed-precondition") || code.endsWith("aborted")) {
    return error instanceof Error && error.message
      ? `${error.message} Review the latest request before retrying.`
      : "This request changed during review. Review the latest details and retry.";
  }
  if (code.endsWith("unavailable") || code.endsWith("deadline-exceeded")) {
    return "The service could not be reached. Check your connection and retry. Approval retries safely reuse the same booking.";
  }
  return error instanceof Error ? error.message : "The request could not be saved. Check your connection and retry.";
}
