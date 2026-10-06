"use client";

import { browserSessionPersistence, setPersistence, signInWithCustomToken, signOut } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions, isAppCheckConfigured } from "@/lib/firebase";

export interface StaffPinStatus { configured: boolean; pinVersion: number }
export class StaffPinChangedError extends Error {
  constructor() { super("Your PIN was changed. Please sign in with the new PIN."); this.name = "StaffPinChangedError"; }
}
function requireStaffServices() {
  if (!auth || !functions || !isAppCheckConfigured) throw new Error("Staff sign-in is unavailable. Please contact the app administrator.");
  return { auth, functions };
}

/** No PIN hash or salt is downloaded to the browser. */
export async function getStaffPinStatus(): Promise<StaffPinStatus> {
  const services = requireStaffServices();
  return (await httpsCallable<Record<string, never>, StaffPinStatus>(services.functions, "staffPinStatus")({})).data;
}

export async function restoreStaffSession(status: StaffPinStatus): Promise<boolean> {
  const services = requireStaffServices();
  await setPersistence(services.auth, browserSessionPersistence);
  await services.auth.authStateReady();
  const user = services.auth.currentUser;
  if (!user || !status.configured) return false;
  const token = await user.getIdTokenResult();
  if (token.claims.traintrackStaff === true && token.claims.traintrackPinVersion === status.pinVersion) return true;
  await signOut(services.auth); return false;
}

export async function signInWithStaffPin(pin: string): Promise<void> {
  const services = requireStaffServices();
  await setPersistence(services.auth, browserSessionPersistence);
  const result = await httpsCallable<{ pin: string }, { customToken: string }>(services.functions, "signInWithStaffPin")({ pin });
  await signInWithCustomToken(services.auth, result.data.customToken);
  const token = await services.auth.currentUser?.getIdTokenResult(true);
  if (token?.claims.traintrackStaff !== true) { await signOut(services.auth); throw new Error("This session is not authorized for staff access."); }
}

export async function changeStaffPin(currentPin: string, newPin: string): Promise<void> {
  const services = requireStaffServices();
  await httpsCallable<{ currentPin: string; newPin: string }, { success: boolean }>(services.functions, "changeStaffPin")({ currentPin, newPin });
  try { await signInWithStaffPin(newPin); }
  catch { await lockStaffSession().catch(() => {}); throw new StaffPinChangedError(); }
}

export async function lockStaffSession(): Promise<void> {
  if (auth) await signOut(auth);
  try { window.sessionStorage.removeItem("traintrack_auth"); } catch { /* Browser storage can be disabled. */ }
}
