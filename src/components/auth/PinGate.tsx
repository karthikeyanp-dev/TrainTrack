"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { auth } from "@/lib/firebase";
import { changeStaffPin, getStaffPinStatus, lockStaffSession, restoreStaffSession, signInWithStaffPin, StaffPinChangedError } from "@/lib/pinAuth";

interface PinGateContextValue { lock: () => void; startChangePin: () => void }
const PinGateContext = createContext<PinGateContextValue | null>(null);
export function usePinLock() { const context = useContext(PinGateContext); if (!context) throw new Error("usePinLock must be used inside PinGate."); return context; }

/** The layout gate ensures page hooks only mount after staff authentication. */
export function PinGate({ children }: { children: ReactNode }) {
  const parentGate = useContext(PinGateContext);
  return parentGate ? <>{children}</> : <StaffPinGate>{children}</StaffPinGate>;
}

function StaffPinGate({ children }: { children: ReactNode }) {
  const [view, setView] = useState<"loading" | "verify" | "change" | "authenticated" | "unavailable">("loading");
  const [pin, setPin] = useState(""); const [currentPin, setCurrentPin] = useState(""); const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getStaffPinStatus().then(async status => {
      if (!status.configured) { if (!cancelled) { setError("Staff access has not been set up. Please contact the app administrator."); setView("unavailable"); } return; }
      const restored = await restoreStaffSession(status);
      if (!cancelled) { setError(null); setView(restored ? "authenticated" : "verify"); }
    }).catch(() => { if (!cancelled) { setError("Staff sign-in is unavailable. Please check your connection or contact the app administrator."); setView("unavailable"); } });
    const unsubscribe = auth ? onAuthStateChanged(auth, user => { if (!user && !cancelled) setView(previous => previous === "authenticated" ? "verify" : previous); }) : () => {};
    return () => { cancelled = true; unsubscribe(); };
  }, [attempt]);

  const context = useMemo(() => ({
    lock: () => { setPin(""); setConfirmPin(""); setCurrentPin(""); setError(null); setView("verify"); void lockStaffSession().catch(() => setError("Could not end the session. Please close this tab.")); },
    startChangePin: () => { setPin(""); setConfirmPin(""); setCurrentPin(""); setError(null); setView("change"); },
  }), []);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null);
    if (view === "change" && (!/^\d{6,12}$/.test(pin) || pin !== confirmPin)) { setError("Use a 6–12 digit PIN and enter it identically in both fields."); return; }
    if (!/^\d{4,}$/.test(view === "change" ? currentPin : pin)) { setError("Enter your current PIN."); return; }
    setBusy(true);
    try { if (view === "change") await changeStaffPin(currentPin, pin); else await signInWithStaffPin(pin); setPin(""); setConfirmPin(""); setCurrentPin(""); setView("authenticated"); }
    catch (cause) { if (cause instanceof StaffPinChangedError) { setPin(""); setCurrentPin(""); setConfirmPin(""); setView("verify"); setError(cause.message); return; } const code = typeof cause === "object" && cause !== null && "code" in cause ? String(cause.code) : ""; setError(code === "functions/resource-exhausted" ? "Too many attempts. Please wait a few minutes and try again." : code === "functions/permission-denied" || code === "functions/unauthenticated" ? "Incorrect PIN or expired session. Please try again." : "Could not sign in. Please check your connection or contact the administrator."); }
    finally { setBusy(false); }
  }

  if (view === "loading") return <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Checking staff access"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (view === "authenticated") return <PinGateContext.Provider value={context}>{children}</PinGateContext.Provider>;
  return <div className="flex min-h-screen items-center justify-center bg-background p-4"><Card className="w-full max-w-sm">
    <CardHeader className="text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10"><Lock className="h-6 w-6 text-primary" /></div><CardTitle>{view === "change" ? "Change staff PIN" : "Staff sign-in"}</CardTitle><CardDescription>{view === "change" ? "Other sessions will need the new PIN." : "Enter your PIN to access TrainTrack."}</CardDescription></CardHeader>
    <CardContent>{view === "unavailable" ? <><p role="alert" className="mb-4 text-sm text-destructive">{error}</p><Button className="w-full" onClick={() => { setView("loading"); setAttempt(value => value + 1); }}>Try again</Button></> : <form onSubmit={submit} className="space-y-4">
      {view === "change" && <div><label htmlFor="current-pin" className="mb-2 block text-sm font-medium">Current PIN</label><Input id="current-pin" type="password" inputMode="numeric" value={currentPin} onChange={event => setCurrentPin(event.target.value.replace(/\D/g, ""))} autoComplete="off" disabled={busy} /></div>}
      <div><label htmlFor="staff-pin" className="mb-2 block text-sm font-medium">{view === "change" ? "New PIN" : "PIN"}</label><Input id="staff-pin" type="password" inputMode="numeric" maxLength={view === "change" ? 12 : undefined} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ""))} autoComplete="off" disabled={busy} required /></div>
      {view === "change" && <div><label htmlFor="confirm-pin" className="mb-2 block text-sm font-medium">Confirm new PIN</label><Input id="confirm-pin" type="password" inputMode="numeric" maxLength={12} value={confirmPin} onChange={event => setConfirmPin(event.target.value.replace(/\D/g, ""))} autoComplete="off" disabled={busy} required /></div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{view === "change" ? "Save new PIN" : "Unlock TrainTrack"}</Button>
      {view === "change" && <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => { setView("authenticated"); setError(null); }}>Cancel</Button>}
    </form>}</CardContent>
  </Card></div>;
}
