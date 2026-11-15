/**
 * Turns Firestore failures into messages a person can act on.
 */

export function isQuotaExceededError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const message = String((error as { message?: string } | null)?.message || "");
  return code === "resource-exhausted" || /quota exceeded/i.test(message);
}

export const QUOTA_EXCEEDED_MESSAGE =
  "Today's free Firestore quota is used up, so nothing can be loaded or saved until it resets (around 12:30–1:30 PM IST). Nothing was changed.";

/** The error's message, with the daily-quota error explained. */
export function describeFirestoreError(error: unknown, fallback: string): string {
  if (isQuotaExceededError(error)) return QUOTA_EXCEEDED_MESSAGE;
  const message = (error as { message?: string } | null)?.message;
  return message || fallback;
}
