/**
 * A Firestore collection mirrored on the device and kept current with a
 * "changed since" listener.
 *
 * Why: the Spark plan allows 50,000 document reads a day, and listening to a
 * whole collection bills one read per document on every page load. Here the
 * collection is read in full once per device, stored in IndexedDB, and after
 * that only documents whose `updatedAt` is newer than the last sync are read.
 *
 * What this relies on — keep these true for any collection synced this way:
 *  1. Every write sets `updatedAt: serverTimestamp()`. A write that does not
 *     is invisible to other devices until they resync.
 *  2. Documents are deleted with `deleteSyncedDoc()` (see `tombstones.ts`),
 *     which leaves a tombstone document carrying `updatedAt`. A plain
 *     `deleteDoc()` is only noticed by the count check on the next app start,
 *     and then costs a full re-read.
 *
 * Safety nets: on each start the local document count is compared with a
 * server count (billed as one read per 1,000 documents) and the collection is
 * re-read in full on a mismatch; `resync()` forces the same by hand.
 */

import {
  Timestamp,
  collection,
  getCountFromServer,
  getDocsFromServer,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type QuerySnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  applyCachedDelta,
  loadCachedCollection,
  replaceCachedCollection,
  type Watermark,
} from "@/lib/sync/localCache";
import { isTombstone } from "@/lib/sync/tombstones";

export interface SyncedDoc {
  readonly id: string;
  readonly data: DocumentData;
}

export interface SyncStatus {
  /** Local data is loaded and can be shown. */
  ready: boolean;
  /** The data has been confirmed against the server in this session. */
  synced: boolean;
  /** Why loading or live sync failed; cleared when sync recovers. */
  error: Error | null;
}

const INITIAL_STATUS: SyncStatus = { ready: false, synced: false, error: null };
const EMPTY_DOCS: readonly SyncedDoc[] = [];

// The listener re-reads this much before the watermark. The watermark is exact
// in theory (server commit times only move forward); the overlap is insurance
// that costs a handful of reads.
const WATERMARK_OVERLAP_SECONDS = 120;
// How long to wait for the server before showing the cached copy anyway.
const READY_TIMEOUT_MS = 4000;
const RETRY_MIN_MS = 30_000;
const RETRY_MAX_MS = 10 * 60_000;
// A count mismatch is re-checked after this delay so a write that is still
// arriving does not trigger a full re-read.
const COUNT_RECHECK_MS = 5000;

const laterOf = (a: Watermark | null, value: unknown): Watermark | null => {
  if (!(value instanceof Timestamp)) return a;
  if (!a) return { seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (value.seconds > a.seconds || (value.seconds === a.seconds && value.nanoseconds > a.nanoseconds)) {
    return { seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  return a;
};

export class SyncedCollection {
  private readonly name: string;

  /** Server-confirmed documents, tombstones included. */
  private confirmed = new Map<string, SyncedDoc>();
  /** Documents with local writes the server has not acknowledged yet. */
  private pending = new Map<string, SyncedDoc>();
  private view: readonly SyncedDoc[] = EMPTY_DOCS;
  private status: SyncStatus = INITIAL_STATUS;

  private watermark: Watermark | null = null;
  /** Confirmed ids changed since the last successful write to IndexedDB. */
  private dirty = new Set<string>();
  /** Ids dropped (tombstoned) since the last successful write to IndexedDB. */
  private dropped = new Set<string>();
  private persistChain: Promise<void> = Promise.resolve();

  private started = false;
  private hasData = false;
  private unsubscribe: Unsubscribe | null = null;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = RETRY_MIN_MS;
  private countVerified = false;
  private initializing: Promise<void> = Promise.resolve();
  private resyncing: Promise<void> | null = null;

  private listeners = new Set<() => void>();
  private readyWaiters: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];

  constructor(name: string) {
    this.name = name;
  }

  // ----- Reading -----

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    this.start();
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Current documents, without tombstones. Same array until something changes. */
  getDocs = (): readonly SyncedDoc[] => this.view;

  getStatus = (): SyncStatus => this.status;

  getServerDocs = (): readonly SyncedDoc[] => EMPTY_DOCS;

  getServerStatus = (): SyncStatus => INITIAL_STATUS;

  /** Resolves once local data can be read; rejects if it could not be loaded. */
  whenReady(): Promise<void> {
    if (this.status.ready) return Promise.resolve();
    this.start();
    // A failed load is retried on demand rather than waiting out the backoff.
    this.retry();
    return new Promise<void>((resolve, reject) => {
      this.readyWaiters.push({ resolve, reject });
    });
  }

  /** Try again now instead of waiting for the next scheduled retry. */
  retry(): void {
    if (!this.started) {
      this.start();
      return;
    }
    if (!this.hasData) {
      // Nothing loaded yet; only restart a load that has already failed.
      if (!this.retryTimer) return;
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
      this.runInit();
    } else if (!this.unsubscribe) {
      if (this.retryTimer) {
        clearTimeout(this.retryTimer);
        this.retryTimer = null;
      }
      this.attachListener();
    }
  }

  /** Throw away the local copy and read the whole collection again. */
  resync(): Promise<void> {
    this.start();
    if (!this.resyncing) {
      this.resyncing = this.initializing
        .then(() => this.fullSync())
        .then(() => {
          this.hasData = true;
          this.setStatus({ error: null });
          this.markReady();
          if (!this.unsubscribe) this.attachListener();
        })
        .finally(() => {
          this.resyncing = null;
        });
    }
    return this.resyncing;
  }

  // ----- Lifecycle -----

  private start() {
    if (this.started || typeof window === "undefined") return;
    this.started = true;
    window.addEventListener("online", () => this.retry());
    this.runInit();
  }

  private runInit() {
    this.initializing = this.init();
  }

  /** Never rejects: a failure is recorded in the status and retried. */
  private async init() {
    try {
      if (!db) throw new Error("Firestore database is not configured");
      const cached = await loadCachedCollection(this.name);
      if (cached) {
        this.confirmed = new Map(cached.docs.map(item => [item.id, item]));
        this.watermark = cached.watermark;
        this.rebuildView();
        this.hasData = true;
        // Wait for the listener to bring the cached copy up to date, but show
        // it anyway if the server does not answer (offline, slow network).
        this.readyTimer = setTimeout(() => this.markReady(), READY_TIMEOUT_MS);
      } else {
        await this.fullSync();
        this.hasData = true;
        this.markReady();
      }
      this.attachListener();
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      console.error(`[sync] Could not load ${this.name}:`, failure);
      this.setStatus({ error: failure });
      this.readyWaiters.splice(0).forEach(waiter => waiter.reject(failure));
      if (db) this.scheduleRetry(() => this.runInit());
    }
  }

  private async fullSync() {
    if (!db) throw new Error("Firestore database is not configured");
    const snapshot = await getDocsFromServer(collection(db, this.name));
    const next = new Map<string, SyncedDoc>();
    let watermark: Watermark | null = null;
    snapshot.forEach(document => {
      // Unacknowledged local writes arrive through the listener instead.
      if (document.metadata.hasPendingWrites) return;
      const data = document.data();
      next.set(document.id, { id: document.id, data });
      watermark = laterOf(watermark, data.updatedAt);
    });
    this.confirmed = next;
    this.watermark = watermark ?? { seconds: 0, nanoseconds: 0 };
    this.dirty.clear();
    this.dropped.clear();
    this.countVerified = true;
    this.rebuildView();
    const docs = Array.from(next.values());
    const mark = this.watermark;
    this.persistChain = this.persistChain
      .then(() => replaceCachedCollection(this.name, docs, mark))
      .catch(error => console.warn(`[sync] Could not cache ${this.name}:`, error));
    console.info(`[sync] ${this.name}: read ${docs.length} documents from the server (full sync).`);
  }

  private attachListener() {
    if (!db || this.unsubscribe) return;
    const mark = this.watermark ?? { seconds: 0, nanoseconds: 0 };
    const since = new Timestamp(Math.max(mark.seconds - WATERMARK_OVERLAP_SECONDS, 0), mark.nanoseconds);
    const changedSince = query(collection(db, this.name), where("updatedAt", ">", since));
    this.unsubscribe = onSnapshot(
      changedSince,
      { includeMetadataChanges: true },
      snapshot => this.onChanges(snapshot),
      error => this.onListenerError(error)
    );
  }

  private onChanges(snapshot: QuerySnapshot<DocumentData>) {
    const pending = new Map<string, SyncedDoc>();
    snapshot.docs.forEach(document => {
      if (document.metadata.hasPendingWrites) {
        pending.set(document.id, {
          id: document.id,
          data: document.data({ serverTimestamps: "estimate" }),
        });
      }
    });
    let changed = pending.size > 0 || this.pending.size > 0;
    this.pending = pending;

    const tombstoned: string[] = [];
    // "removed" is deliberately ignored: a document also leaves this query when
    // a failed local write is rolled back, and it must then stay in `confirmed`.
    // Real deletions arrive as tombstones.
    snapshot.docChanges({ includeMetadataChanges: true }).forEach(change => {
      if (change.type === "removed" || change.doc.metadata.hasPendingWrites) return;
      const data = change.doc.data();
      this.confirmed.set(change.doc.id, { id: change.doc.id, data });
      this.dirty.add(change.doc.id);
      if (isTombstone(data)) tombstoned.push(data.deletedId);
      changed = true;
    });
    tombstoned.forEach(id => {
      if (this.confirmed.delete(id)) {
        this.dirty.delete(id);
        this.dropped.add(id);
      }
    });

    if (!snapshot.metadata.fromCache) {
      // Only a server-consistent snapshot may move the watermark: it is the
      // one case where everything older than its newest document has arrived.
      let watermark = this.watermark;
      snapshot.docs.forEach(document => {
        if (!document.metadata.hasPendingWrites) watermark = laterOf(watermark, document.get("updatedAt"));
      });
      this.watermark = watermark;
      this.persist();
      this.retryDelay = RETRY_MIN_MS;
      this.setStatus({ synced: true, error: null });
      this.markReady();
      if (!this.countVerified) {
        this.countVerified = true;
        void this.verifyCount();
      }
    }

    if (changed) this.rebuildView();
  }

  private onListenerError(error: Error) {
    console.error(`[sync] Live updates for ${this.name} stopped:`, error);
    this.unsubscribe = null;
    this.pending = new Map();
    this.rebuildView();
    this.setStatus({ synced: false, error });
    this.markReady();
    this.scheduleRetry(() => this.attachListener());
  }

  private scheduleRetry(action: () => void) {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      action();
    }, this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, RETRY_MAX_MS);
  }

  /**
   * Catches what the change listener cannot see: documents deleted without a
   * tombstone (Firebase console, an old app version) or a damaged cache.
   */
  private async verifyCount() {
    if (!db) return;
    try {
      const matches = async () => {
        const server = await getCountFromServer(collection(db!, this.name));
        return server.data().count === this.confirmed.size;
      };
      if (await matches()) return;
      await new Promise(resolve => setTimeout(resolve, COUNT_RECHECK_MS));
      if (await matches()) return;
      console.warn(`[sync] ${this.name}: local copy does not match the server, reading it again.`);
      await this.resync();
    } catch (error) {
      console.warn(`[sync] Could not verify ${this.name} against the server:`, error);
    }
  }

  // ----- State -----

  private persist() {
    if (!this.watermark) return;
    const puts = Array.from(this.dirty)
      .map(id => this.confirmed.get(id))
      .filter((item): item is SyncedDoc => !!item);
    const removed = Array.from(this.dropped);
    const mark = this.watermark;
    this.persistChain = this.persistChain
      .then(() => applyCachedDelta(this.name, puts, removed, mark))
      .then(() => {
        // Anything changed again while this was being written stays dirty.
        puts.forEach(item => {
          if (this.confirmed.get(item.id) === item) this.dirty.delete(item.id);
        });
        removed.forEach(id => this.dropped.delete(id));
      })
      .catch(error => console.warn(`[sync] Could not cache changes to ${this.name}:`, error));
  }

  private rebuildView() {
    // A tombstone that is still being written already hides its target.
    const hidden = new Set<string>();
    this.pending.forEach(item => {
      if (isTombstone(item.data)) hidden.add(item.data.deletedId);
    });
    const view: SyncedDoc[] = [];
    this.confirmed.forEach((item, id) => {
      if (this.pending.has(id) || hidden.has(id) || isTombstone(item.data)) return;
      view.push(item);
    });
    this.pending.forEach((item, id) => {
      if (hidden.has(id) || isTombstone(item.data)) return;
      view.push(item);
    });
    this.view = view;
    this.notify();
  }

  private markReady() {
    if (this.readyTimer) {
      clearTimeout(this.readyTimer);
      this.readyTimer = null;
    }
    if (!this.hasData) return;
    this.setStatus({ ready: true });
    this.readyWaiters.splice(0).forEach(waiter => waiter.resolve());
  }

  private setStatus(patch: Partial<SyncStatus>) {
    const next = { ...this.status, ...patch };
    if (next.ready === this.status.ready && next.synced === this.status.synced && next.error === this.status.error) {
      return;
    }
    this.status = next;
    this.notify();
  }

  private notify() {
    this.listeners.forEach(listener => listener());
  }
}
