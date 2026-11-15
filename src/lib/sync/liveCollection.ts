/**
 * One shared real-time listener for a small collection (accounts, handlers).
 *
 * The listener starts the first time the data is needed and then stays open
 * for the rest of the session, so the collection is read once per app load
 * and afterwards only changed documents are billed — instead of the whole
 * collection being fetched again by every dialog and tab that needs it.
 */

import {
  onSnapshot,
  type DocumentData,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface LiveStatus {
  ready: boolean;
  error: Error | null;
}

const INITIAL_STATUS: LiveStatus = { ready: false, error: null };

export class LiveCollection<T> {
  private items: readonly T[] = [];
  private readonly empty: readonly T[] = [];
  private status: LiveStatus = INITIAL_STATUS;
  private unsubscribe: Unsubscribe | null = null;
  private listeners = new Set<() => void>();
  private readyWaiters: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];

  constructor(
    private readonly name: string,
    private readonly buildQuery: (database: Firestore) => Query<DocumentData>,
    private readonly mapDoc: (document: QueryDocumentSnapshot<DocumentData>) => T
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    this.start();
    return () => {
      this.listeners.delete(listener);
    };
  };

  getItems = (): readonly T[] => this.items;

  getStatus = (): LiveStatus => this.status;

  getServerItems = (): readonly T[] => this.empty;

  getServerStatus = (): LiveStatus => INITIAL_STATUS;

  /** The current items, once the first server snapshot has arrived. */
  async whenReady(): Promise<readonly T[]> {
    if (!this.status.ready) {
      this.start();
      await new Promise<void>((resolve, reject) => {
        this.readyWaiters.push({ resolve, reject });
      });
    }
    return this.items;
  }

  private start() {
    if (this.unsubscribe || typeof window === "undefined") return;
    if (!db) {
      this.fail(new Error("Firestore database is not configured"));
      return;
    }
    this.unsubscribe = onSnapshot(
      this.buildQuery(db),
      { includeMetadataChanges: true },
      snapshot => {
        this.items = snapshot.docs.map(this.mapDoc);
        // The first snapshot can come from the in-memory cache and be
        // incomplete; only a server snapshot counts as loaded.
        if (!snapshot.metadata.fromCache && !this.status.ready) {
          this.status = { ready: true, error: null };
          this.readyWaiters.splice(0).forEach(waiter => waiter.resolve());
        }
        this.notify();
      },
      error => {
        console.error(`[sync] Live updates for ${this.name} stopped:`, error);
        // The next subscribe() or whenReady() starts a fresh listener.
        this.unsubscribe = null;
        this.fail(error);
      }
    );
  }

  private fail(error: Error) {
    // Not ready any more: the items on hand may be stale, so the next caller
    // waits for a fresh listener instead of trusting them.
    this.status = { ready: false, error };
    this.readyWaiters.splice(0).forEach(waiter => waiter.reject(error));
    this.notify();
  }

  private notify() {
    this.listeners.forEach(listener => listener());
  }
}
