"use client";

import { doc, getDoc, setDoc, serverTimestamp, type Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

const PIN_DOC_PATH = "appConfig/pin";
const PIN_SESSION_KEY = "traintrack_auth";

export interface PinRecord {
  hash: string;
  salt: string;
  updatedAt?: Timestamp;
}

export async function fetchPinFromFirestore(): Promise<PinRecord | null> {
  if (!db) {
    throw new Error("Firestore is not initialized.");
  }
  const snap = await getDoc(doc(db, PIN_DOC_PATH));
  if (!snap.exists()) return null;
  const data = snap.data();
  if (typeof data.hash === "string" && typeof data.salt === "string") {
    return { hash: data.hash, salt: data.salt, updatedAt: data.updatedAt };
  }
  return null;
}

export async function savePinToFirestore(pin: string): Promise<void> {
  if (!db) {
    throw new Error("Firestore is not initialized.");
  }
  const existing = await fetchPinFromFirestore();
  if (existing) {
    throw new Error("A PIN has already been set. Use change PIN instead.");
  }
  const salt = generateSalt();
  const hash = await hashPin(pin, salt);
  await setDoc(doc(db, PIN_DOC_PATH), {
    hash,
    salt,
    updatedAt: serverTimestamp(),
  });
}

export async function updatePinInFirestore(
  currentPin: string,
  newPin: string
): Promise<void> {
  if (!db) {
    throw new Error("Firestore is not initialized.");
  }
  const stored = await fetchPinFromFirestore();
  if (!stored) {
    throw new Error("No PIN is configured.");
  }
  const currentOk = await verifyPin(currentPin, stored);
  if (!currentOk) {
    throw new Error("Current PIN is incorrect.");
  }
  const salt = generateSalt();
  const hash = await hashPin(newPin, salt);
  await setDoc(doc(db, PIN_DOC_PATH), {
    hash,
    salt,
    updatedAt: serverTimestamp(),
  });
}

export async function verifyPin(pin: string, stored?: PinRecord | null): Promise<boolean> {
  const record = stored ?? (await fetchPinFromFirestore());
  if (!record) return false;
  const computed = await hashPin(pin, record.salt);
  if (computed.length !== record.hash.length) return false;
  let result = 0;
  for (let i = 0; i < computed.length; i++) {
    result |= computed.charCodeAt(i) ^ record.hash.charCodeAt(i);
  }
  return result === 0;
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateSalt(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function isSessionAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(PIN_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSessionAuthenticated(authenticated: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (authenticated) {
      window.sessionStorage.setItem(PIN_SESSION_KEY, "1");
    } else {
      window.sessionStorage.removeItem(PIN_SESSION_KEY);
    }
  } catch {
    // ignore
  }
}
