import { httpsCallable } from 'firebase/functions';
import type { CustomerBookingRequest } from '@shared/bookingRequest';
import { getSubmissionClient } from './firebase';

export async function sendBookingRequest(requestId: string, request: CustomerBookingRequest) {
  const functions = await getSubmissionClient();
  const submit = httpsCallable<{ requestId: string; request: CustomerBookingRequest }, { receiptReference: string }>(
    functions, 'submitBookingRequest', { timeout: 30_000 },
  );
  const result = await submit({ requestId, request });
  if (!result.data.receiptReference || typeof result.data.receiptReference !== 'string') {
    throw new Error('The request receipt could not be checked. Please retry the same request.');
  }
  return result.data;
}

export function submissionError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (code.includes('resource-exhausted')) return 'Too many requests right now. Please wait a few minutes, then retry.';
  if (code.includes('permission-denied') || code.includes('unauthenticated')) {
    return 'We could not verify this device. Reload this page or contact your booking agent if this continues.';
  }
  if (code.includes('failed-precondition')) return 'Online requests are temporarily unavailable. Please contact your booking agent.';
  if (code.includes('invalid-argument')) return 'These details could not be accepted. Please contact your booking agent.';
  return 'We could not confirm delivery. Your details are still here. Retry safely; sending this same request again will not create a duplicate.';
}
