"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Loader2, Lock, TrainFront } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  fetchPinFromFirestore,
  isSessionAuthenticated,
  savePinToFirestore,
  setSessionAuthenticated,
  updatePinInFirestore,
  verifyPin,
} from "@/lib/pinAuth";

type PinView = "loading" | "setup" | "verify" | "change" | "authenticated";

interface PinGateContextValue {
  lock: () => void;
  startChangePin: () => void;
}

const PinGateContext = createContext<PinGateContextValue | null>(null);

export function usePinLock() {
  const ctx = useContext(PinGateContext);
  if (!ctx) {
    throw new Error("usePinLock must be used inside <PinGate>");
  }
  return ctx;
}

interface PinGateProps {
  children: ReactNode;
}

export function PinGate({ children }: PinGateProps) {
  const [view, setView] = useState<PinView>("loading");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const stored = await fetchPinFromFirestore();
        const sessionActive = isSessionAuthenticated();
        if (cancelled) return;

        if (!stored) {
          setView("setup");
        } else if (sessionActive) {
          setView("authenticated");
        } else {
          setView("verify");
        }
      } catch (err) {
        console.error("Failed to load PIN config:", err);
        if (!cancelled) {
          setError("Could not connect to the server. Please check your internet and try again.");
          setView("verify");
        }
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const contextValue = useMemo(
    () => ({
      lock: () => {
        setSessionAuthenticated(false);
        setPin("");
        setConfirmPin("");
        setCurrentPin("");
        setError(null);
        setView("verify");
      },
      startChangePin: () => {
        setPin("");
        setConfirmPin("");
        setCurrentPin("");
        setError(null);
        setView("change");
      },
    }),
    []
  );

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (pin.length < 4) {
      setError("PIN must be at least 4 digits.");
      return;
    }
    if (pin !== confirmPin) {
      setError("PINs do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await savePinToFirestore(pin);
      setSessionAuthenticated(true);
      setView("authenticated");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save PIN.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!pin) {
      setError("Please enter your PIN.");
      return;
    }

    setIsSubmitting(true);
    try {
      const ok = await verifyPin(pin);
      if (ok) {
        setSessionAuthenticated(true);
        setView("authenticated");
      } else {
        setError("Incorrect PIN.");
        setPin("");
      }
    } catch (err) {
      console.error("PIN verification failed:", err);
      setError("Could not verify PIN. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!currentPin) {
      setError("Please enter your current PIN.");
      return;
    }
    if (pin.length < 4) {
      setError("New PIN must be at least 4 digits.");
      return;
    }
    if (pin !== confirmPin) {
      setError("New PINs do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await updatePinInFirestore(currentPin, pin);
      setSessionAuthenticated(true);
      setView("authenticated");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not change PIN.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const clearAll = () => {
    setPin("");
    setConfirmPin("");
    setCurrentPin("");
    setError(null);
  };

  if (view === "loading") {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (view === "authenticated") {
    return (
      <PinGateContext.Provider value={contextValue}>
        {children}
      </PinGateContext.Provider>
    );
  }

  const isSetup = view === "setup";
  const isChange = view === "change";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm p-4">
      <Card className="w-full max-w-sm shadow-elevation-4">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-glow-primary">
            {isSetup ? (
              <TrainFront className="h-6 w-6 text-primary-foreground" />
            ) : (
              <Lock className="h-6 w-6 text-primary-foreground" />
            )}
          </div>
          <CardTitle>
            {isSetup ? "Create a PIN" : isChange ? "Change PIN" : "Enter PIN"}
          </CardTitle>
          <CardDescription>
            {isSetup
              ? "Protect TrainTrack with a PIN. This PIN will be required on every device."
              : isChange
              ? "Update your PIN."
              : "Enter your PIN to unlock TrainTrack."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={isSetup ? handleSetup : isChange ? handleChange : handleVerify}
            className="space-y-4"
          >
            {isChange && (
              <div className="space-y-2">
                <label htmlFor="current-pin" className="text-sm font-medium">
                  Current PIN
                </label>
                <Input
                  id="current-pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  placeholder="Current PIN"
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
                  disabled={isSubmitting}
                />
              </div>
            )}

            <div className="space-y-2">
              {!isSetup && !isChange && (
                <label htmlFor="pin" className="text-sm font-medium">
                  PIN
                </label>
              )}
              {(isSetup || isChange) && (
                <label htmlFor="pin" className="text-sm font-medium">
                  {isChange ? "New PIN" : "PIN"}
                </label>
              )}
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                placeholder={isChange ? "New PIN" : "PIN"}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                disabled={isSubmitting}
                autoFocus
              />
            </div>

            {(isSetup || isChange) && (
              <div className="space-y-2">
                <label htmlFor="confirm-pin" className="text-sm font-medium">
                  Confirm PIN
                </label>
                <Input
                  id="confirm-pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  placeholder="Confirm PIN"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                  disabled={isSubmitting}
                />
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isSetup ? (
                "Create PIN"
              ) : isChange ? (
                "Update PIN"
              ) : (
                "Unlock"
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center gap-4">
          {view === "verify" && (
            <Button
              variant="link"
              size="sm"
              type="button"
              onClick={() => {
                clearAll();
                setView("change");
              }}
            >
              Change PIN
            </Button>
          )}
          {view === "change" && (
            <Button
              variant="link"
              size="sm"
              type="button"
              onClick={() => {
                clearAll();
                setView("verify");
              }}
            >
              Cancel
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
