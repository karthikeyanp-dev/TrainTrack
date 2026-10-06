"use client";

import { useEffect, useState } from "react";
import { subscribeToBookingRequests, type RequestSession } from "@/lib/bookingRequestsClient";
import type { BookingRequestRecord } from "@shared/bookingRequest";

export function useBookingRequests() {
  const [data, setData] = useState<BookingRequestRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [session, setSession] = useState<RequestSession>("loading");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    return subscribeToBookingRequests(
      (requests) => {
        setData(requests);
        setError(null);
        setIsLoading(false);
      },
      (failure) => {
        setError(failure);
        setIsLoading(false);
      },
      (nextSession) => {
        setSession(nextSession);
        setIsLoading(nextSession === "loading" || nextSession === "staff");
      },
    );
  }, [retry]);

  return {
    data,
    isLoading,
    error,
    session,
    refresh: () => {
      setError(null);
      setIsLoading(true);
      setRetry((value) => value + 1);
    },
  };
}
