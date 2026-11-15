/**
 * Deletions for collections mirrored by `SyncedCollection`.
 *
 * Devices only ask Firestore for documents changed since their last sync, and
 * a deleted document is not a change they can query for. So a delete also
 * writes a small tombstone document into the same collection; the tombstone
 * carries `updatedAt`, reaches every device through the normal change
 * listener, and tells it which document to drop from its local copy.
 *
 * Tombstones are never removed: each device's local document count has to
 * match the server's, and they are too small and too few to matter.
 */

import {
  doc,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

export interface TombstoneData extends DocumentData {
  deleted: true;
  deletedId: string;
}

export function isTombstone(data: DocumentData | undefined): data is TombstoneData {
  return !!data && data.deleted === true && typeof data.deletedId === "string";
}

/** Delete a document from a synced collection, leaving a tombstone behind. */
export async function deleteSyncedDoc(database: Firestore, collectionName: string, id: string): Promise<void> {
  const batch = writeBatch(database);
  batch.delete(doc(database, collectionName, id));
  batch.set(doc(database, collectionName, `tombstone_${id}`), {
    deleted: true,
    deletedId: id,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}
