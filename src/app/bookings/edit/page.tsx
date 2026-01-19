"use client";

import { BookingForm } from "@/components/bookings/BookingForm";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getBookingById } from "@/lib/firestoreClient";
import type { BookingFormData, Passenger } from "@/types/booking";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";

function EditBookingContent() {
  const searchParams = useSearchParams();
  const bookingId = searchParams.get('id');

  const [initialDataForForm, setInitialDataForForm] = useState<(BookingFormData & { journeyDateObj?: Date; bookingDateObj?: Date; passengers?: Passenger[] }) | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadBooking() {
      if (!bookingId) {
        setError("Booking ID is missing.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const booking = await getBookingById(bookingId);
        if (booking) {
          setInitialDataForForm({
            source: booking.source,
            destination: booking.destination,
            journeyDate: booking.journeyDate,
            journeyDateObj: new Date(booking.journeyDate + 'T00:00:00'),
            bookingDate: booking.bookingDate,
            bookingDateObj: new Date(booking.bookingDate + 'T00:00:00'),
            userName: booking.userName,
            passengers: booking.passengers.map(p => ({ ...p })),
            classType: booking.classType,
            bookingType: booking.bookingType,
            trainPreference: booking.trainPreference || "",
            remarks: booking.remarks || "",
          });
        } else {
          setError(`Could not find booking with ID "${bookingId}".`);
        }
      } catch (error) {
        console.error('Error loading booking:', error);
        setError('Failed to load booking data. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }

    loadBooking();
  }, [bookingId]);

  return (
    <>
      {error && (
        <Alert variant="destructive" className="max-w-2xl mx-auto mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Card className="max-w-2xl mx-auto shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Edit Booking Request</CardTitle>
          <CardDescription>
            Update the booking details below and save your changes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <AlertCircle className="h-12 w-12 text-destructive mb-4" />
              <p className="text-muted-foreground">Unable to load booking for editing.</p>
            </div>
          ) : (
            <BookingForm initialData={initialDataForForm} bookingId={bookingId || undefined} />
          )}
        </CardContent>
      </Card>
    </>
  );
}

export default function EditBookingPage() {
  return (
    <AppShell>
      <Suspense fallback={
        <Card className="max-w-2xl mx-auto shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl">Edit Booking Request</CardTitle>
            <CardDescription>
              Update the booking details below and save your changes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center items-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          </CardContent>
        </Card>
      }>
        <EditBookingContent />
      </Suspense>
    </AppShell>
  );
}
