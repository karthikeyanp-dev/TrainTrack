"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, where, onSnapshot, Timestamp } from "firebase/firestore";
import type { Booking, BookingStatus, Passenger, PreparedAccount, TrainClass } from "@/types/booking";
import { LEGACY_CLASS_MAP } from "@/types/booking";

// Helper to convert Firestore timestamps
const toISOStringSafe = (value: any): string => {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
    return new Date().toISOString();
  }
  if (typeof value === 'number') {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
};

// Normalize legacy class names to new format
const normalizeClassType = (classType: string): TrainClass => {
  // Check if it's a legacy class name and map it to the new format
  if (classType in LEGACY_CLASS_MAP) {
    return LEGACY_CLASS_MAP[classType as keyof typeof LEGACY_CLASS_MAP];
  }
  // Return as-is if it's already a valid new class name
  return classType as TrainClass;
};

// Map Firestore document to Booking type
const mapDocToBooking = (doc: any): Booking => {
  const data = doc.data();
  return {
    id: doc.id,
    source: data.source as string,
    destination: data.destination as string,
    journeyDate: data.journeyDate as string,
    userName: data.userName as string,
    passengers: Array.isArray(data.passengers) ? data.passengers as Passenger[] : [],
    bookingDate: data.bookingDate as string,
    classType: normalizeClassType(data.classType),
    bookingType: data.bookingType || "Tatkal",
    trainPreference: data.trainPreference as string | undefined,
    remarks: (data.remarks || data.timePreference) as string | undefined,
    status: data.status as BookingStatus,
    statusReason: data.statusReason as string | undefined,
    statusHandler: data.statusHandler as string | undefined,
    createdAt: toISOStringSafe(data.createdAt),
    updatedAt: toISOStringSafe(data.updatedAt),
    preparedAccounts: Array.isArray(data.preparedAccounts) ? (data.preparedAccounts as PreparedAccount[]) : undefined,
  };
};

/**
 * Hook to get all bookings with real-time updates from Firestore
 * Uses onSnapshot for live synchronization
 */
export function useBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!db) {
      setError(new Error("Firestore database is not configured"));
      setIsLoading(false);
      return;
    }

    const bookingsCollection = collection(db, "bookings");
    const q = query(bookingsCollection, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const bookingsData = snapshot.docs
          .map(doc => {
            try {
              return mapDocToBooking(doc);
            } catch (error) {
              console.error(`Failed to map document ${doc.id}:`, error);
              return null;
            }
          })
          .filter(booking => booking !== null) as Booking[];

        setBookings(bookingsData);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error("[Firestore Error] useBookings:", err);
        setError(err as Error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { data: bookings, isLoading, error };
}

/**
 * Hook to get pending bookings (status = "Requested") with real-time updates
 * Uses onSnapshot for live synchronization
 */
export function usePendingBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!db) {
      setError(new Error("Firestore database is not configured"));
      setIsLoading(false);
      return;
    }

    const bookingsCollection = collection(db, "bookings");
    const q = query(bookingsCollection, where("status", "==", "Requested"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const bookingsData = snapshot.docs
          .map(doc => {
            try {
              return mapDocToBooking(doc);
            } catch (error) {
              console.error(`Failed to map document ${doc.id}:`, error);
              return null;
            }
          })
          .filter(booking => booking !== null) as Booking[];

        // Sort by journey date
        bookingsData.sort((a, b) => new Date(a.journeyDate).getTime() - new Date(b.journeyDate).getTime());

        setBookings(bookingsData);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error("[Firestore Error] usePendingBookings:", err);
        setError(err as Error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return { data: bookings, isLoading, error };
}

/**
 * Hook to get distinct booking dates with real-time updates
 * Derives dates from all bookings
 */
export function useBookingDates() {
  const { data: allBookings, isLoading, error } = useBookings();
  const [dates, setDates] = useState<string[]>([]);

  useEffect(() => {
    const dateSet = new Set<string>();
    allBookings.forEach(booking => {
      dateSet.add(booking.bookingDate);
    });
    const sortedDates = Array.from(dateSet).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    setDates(sortedDates);
  }, [allBookings]);

  return { data: dates, isLoading, error };
}
