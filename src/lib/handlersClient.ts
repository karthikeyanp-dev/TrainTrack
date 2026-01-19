/**
 * Client-side Firestore operations for handlers
 */

import { db } from "@/lib/firebase";
import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp, 
  query, 
  orderBy,
} from "firebase/firestore";
import type { Handler } from "@/types/handler";

export interface HandlerStats {
  handlerId: string;
  name: string;
  bookingCount: number;
  lastAssignedDate?: string;
}

export async function getHandlers(): Promise<Handler[]> {
  if (!db) {
    console.error("[Firestore Error] Database not initialized");
    return [];
  }

  try {
    const handlersCollection = collection(db, "handlers");
    const q = query(handlersCollection, orderBy("name", "asc"));
    const querySnapshot = await getDocs(q);

    const handlers = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name as string,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      };
    });

    return handlers;
  } catch (error) {
    console.error("[Firestore Error] getHandlers:", error);
    return [];
  }
}

export async function addHandler(handlerData: Omit<Handler, "id" | "createdAt" | "updatedAt">): Promise<{ success: boolean; error?: string; handler?: Handler }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const docRef = await addDoc(collection(db, "handlers"), {
      ...handlerData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const now = new Date().toISOString();
    const newHandler: Handler = {
      ...handlerData,
      id: docRef.id,
      createdAt: now,
      updatedAt: now,
    };

    return { success: true, handler: newHandler };
  } catch (error: any) {
    console.error("[Firestore Error] addHandler:", error);
    return { success: false, error: error.message || "Failed to add handler" };
  }
}

export async function updateHandler(id: string, handlerData: Partial<Handler>): Promise<{ success: boolean; error?: string }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const docRef = doc(db, "handlers", id);
    await updateDoc(docRef, {
      ...handlerData,
      updatedAt: serverTimestamp(),
    });

    return { success: true };
  } catch (error: any) {
    console.error(`[Firestore Error] updateHandler (${id}):`, error);
    return { success: false, error: error.message || "Failed to update handler" };
  }
}

export async function deleteHandler(id: string): Promise<{ success: boolean; error?: string }> {
  if (!db) {
    return { success: false, error: "Firestore database is not configured" };
  }

  try {
    const docRef = doc(db, "handlers", id);
    await deleteDoc(docRef);
    return { success: true };
  } catch (error: any) {
    console.error(`[Firestore Error] deleteHandler (${id}):`, error);
    return { success: false, error: error.message || "Failed to delete handler" };
  }
}

export async function getHandlerStats(): Promise<HandlerStats[]> {
  if (!db) {
    console.error("[Firestore Error] Database not initialized");
    return [];
  }

  try {
    const handlers = await getHandlers();
    
    // Get all booking records to calculate stats
    const bookingRecordsCollection = collection(db, "bookingRecords");
    const bookingRecordsSnapshot = await getDocs(bookingRecordsCollection);
    
    // Count bookings per handler
    const handlerUsage = new Map<string, { count: number; lastDate?: string }>();
    
    bookingRecordsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const bookedBy = data.bookedBy;
      const createdAt = data.createdAt?.toDate?.();
      
      if (bookedBy) {
        const existing = handlerUsage.get(bookedBy) || { count: 0 };
        const existingDate = existing.lastDate ? new Date(existing.lastDate) : null;
        const currentDate = createdAt ? createdAt : null;
        
        handlerUsage.set(bookedBy, {
          count: existing.count + 1,
          lastDate: (currentDate && (!existingDate || currentDate > existingDate))
            ? currentDate.toISOString().split('T')[0]
            : existing.lastDate,
        });
      }
    });

    // Build stats array
    const stats: HandlerStats[] = handlers.map(handler => ({
      handlerId: handler.id,
      name: handler.name,
      bookingCount: handlerUsage.get(handler.name)?.count || 0,
      lastAssignedDate: handlerUsage.get(handler.name)?.lastDate,
    }));

    return stats;
  } catch (error) {
    console.error("[Firestore Error] getHandlerStats:", error);
    return [];
  }
}
