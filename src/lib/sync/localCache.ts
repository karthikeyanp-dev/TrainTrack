/**
 * IndexedDB store behind the synced collections (see `syncedCollection.ts`).
 *
 * Holds a copy of every document of a synced Firestore collection plus the
 * collection's sync watermark, so a page load only has to ask Firestore for
 * documents changed since the last visit instead of re-reading the collection.
 *
 * Every function degrades to "no cache" (null / no-op) when IndexedDB is not
 * available, e.g. in private windows or during the static build.
 */

import { Timestamp, type DocumentData } from "firebase/firestore";

export interface CachedDoc {
  id: string;
  data: DocumentData;
}

/** Firestore Timestamp as plain numbers. */
export interface Watermark {
  seconds: number;
  nanoseconds: number;
}

export interface CachedCollection {
  docs: CachedDoc[];
  watermark: Watermark;
}

// Bump to throw away every device's cache (forces one full re-read per device).
const DB_VERSION = 1;
const DOCS_STORE = "docs";
const META_STORE = "meta";
const TS_KEY = "__ts";

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "default";
const databaseId = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || "(default)";
const DB_NAME = `traintrack-sync:${projectId}:${databaseId}`;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        for (const name of Array.from(database.objectStoreNames)) {
          database.deleteObjectStore(name);
        }
        database.createObjectStore(DOCS_STORE);
        database.createObjectStore(META_STORE);
      };
      request.onsuccess = () => {
        const database = request.result;
        // Another tab upgrading the schema needs this connection closed.
        database.onversionchange = () => {
          database.close();
          dbPromise = null;
        };
        resolve(database);
      };
      request.onerror = () => {
        console.warn("[sync] IndexedDB unavailable, running without a local cache:", request.error);
        resolve(null);
      };
      request.onblocked = () => resolve(null);
    } catch (error) {
      console.warn("[sync] IndexedDB unavailable, running without a local cache:", error);
      resolve(null);
    }
  });
  return dbPromise;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Timestamps lose their class when IndexedDB clones them, so they are stored
// as a tagged pair and rebuilt on load.
const isTimestampLike = (value: unknown): value is { seconds: number; nanoseconds: number } =>
  value instanceof Timestamp ||
  (!!value &&
    typeof value === "object" &&
    typeof (value as { toDate?: unknown }).toDate === "function" &&
    typeof (value as { seconds?: unknown }).seconds === "number" &&
    typeof (value as { nanoseconds?: unknown }).nanoseconds === "number");

function encode(value: unknown): unknown {
  if (isTimestampLike(value)) {
    return { [TS_KEY]: [value.seconds, value.nanoseconds] };
  }
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = encode(val);
    }
    return out;
  }
  return value;
}

function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === "object") {
    const tagged = (value as Record<string, unknown>)[TS_KEY];
    if (Array.isArray(tagged) && tagged.length === 2) {
      return new Timestamp(Number(tagged[0]), Number(tagged[1]));
    }
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = decode(val);
    }
    return out;
  }
  return value;
}

const docKey = (collectionName: string, id: string) => `${collectionName}/${id}`;
const collectionRange = (collectionName: string) =>
  IDBKeyRange.bound(`${collectionName}/`, `${collectionName}/￿`);

/** The cached copy of a collection, or null when there is none to trust. */
export async function loadCachedCollection(collectionName: string): Promise<CachedCollection | null> {
  const database = await openDb();
  if (!database) return null;
  try {
    const tx = database.transaction([DOCS_STORE, META_STORE], "readonly");
    const metaRequest = tx.objectStore(META_STORE).get(collectionName);
    const docsRequest = tx.objectStore(DOCS_STORE).getAll(collectionRange(collectionName));
    const [meta, rows] = await Promise.all([requestResult(metaRequest), requestResult(docsRequest)]);
    const watermark = meta?.watermark as Watermark | undefined;
    if (!watermark || typeof watermark.seconds !== "number") return null;
    const docs = (rows as Array<{ id: string; data: unknown }>).map(row => ({
      id: row.id,
      data: decode(row.data) as DocumentData,
    }));
    return { docs, watermark };
  } catch (error) {
    console.warn(`[sync] Could not read the local cache for ${collectionName}:`, error);
    return null;
  }
}

/** Replace the whole cached collection (after a full read from Firestore). */
export async function replaceCachedCollection(
  collectionName: string,
  docs: CachedDoc[],
  watermark: Watermark
): Promise<void> {
  const database = await openDb();
  if (!database) return;
  const tx = database.transaction([DOCS_STORE, META_STORE], "readwrite");
  const store = tx.objectStore(DOCS_STORE);
  store.delete(collectionRange(collectionName));
  for (const item of docs) {
    store.put({ id: item.id, data: encode(item.data) }, docKey(collectionName, item.id));
  }
  tx.objectStore(META_STORE).put({ watermark }, collectionName);
  await txDone(tx);
}

/**
 * Apply changed and removed documents and move the watermark forward in one
 * transaction, so the watermark can never get ahead of the documents it covers.
 */
export async function applyCachedDelta(
  collectionName: string,
  puts: CachedDoc[],
  removedIds: string[],
  watermark: Watermark
): Promise<void> {
  const database = await openDb();
  if (!database) return;
  const tx = database.transaction([DOCS_STORE, META_STORE], "readwrite");
  const store = tx.objectStore(DOCS_STORE);
  for (const item of puts) {
    store.put({ id: item.id, data: encode(item.data) }, docKey(collectionName, item.id));
  }
  for (const id of removedIds) {
    store.delete(docKey(collectionName, id));
  }
  tx.objectStore(META_STORE).put({ watermark }, collectionName);
  await txDone(tx);
}
