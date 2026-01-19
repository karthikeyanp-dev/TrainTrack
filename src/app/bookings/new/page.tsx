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

function NewBookingPageContent() {
  const searchParams = useSearchParams();
  const copyFromId = searchParams.get('copyFrom') || undefined;
  
  const [initialDataForForm, setInitialDataForForm] = useState<(BookingFormData & { journeyDateObj?: Date; bookingDateObj?: Date; passengers?: Passenger[] }) | undefined>(undefined);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!!copyFromId);

  useEffect(() => {
    async function loadBookingToCopy() {
      if (!copyFromId) return;
      
      setIsLoading(true);
      try {
        const bookingToCopy = await getBookingById(copyFromId);
        if (bookingToCopy) {
          setInitialDataForForm({
            source: bookingToCopy.source,
            destination: bookingToCopy.destination,
            journeyDate: bookingToCopy.journeyDate, 
            journeyDateObj: new Date(bookingToCopy.journeyDate + 'T00:00:00'),
            bookingDate: bookingToCopy.bookingDate,
            bookingDateObj: new Date(bookingToCopy.bookingDate + 'T00:00:00'),
            userName: bookingToCopy.userName,
            passengers: bookingToCopy.passengers.map(p => ({ ...p })),
            classType: bookingToCopy.classType,
            bookingType: bookingToCopy.bookingType,
            trainPreference: bookingToCopy.trainPreference || "",
            remarks: bookingToCopy.remarks || "",
          });
        } else {
          setCopyError(`Could not find booking with ID "${copyFromId}" to copy. Please fill out the form manually.`);
        }
      } catch (error) {
        console.error('Error loading booking:', error);
        setCopyError('Failed to load booking data. Please try again.');
      } finally {
        setIsLoading(false);
      }
    }
    
    loadBookingToCopy();
  }, [copyFromId]);

  return (
    <AppShell>
      {copyError && (
        <Alert variant="destructive" className="max-w-2xl mx-auto mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Copy Error</AlertTitle>
          <AlertDescription>{copyError}</AlertDescription>
        </Alert>
      )}
      <Card className="max-w-2xl mx-auto shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Add New Booking Request</CardTitle>
          <CardDescription>
            {copyFromId && initialDataForForm ? "Editing a copy of a previous booking. Adjust details as needed and save." : "Fill in the details below to save a new booking request from a client."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <BookingForm initialData={initialDataForForm} />
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}

export default function NewBookingPage() {
  return (
    <Suspense fallback={<AppShell><div className="flex justify-center items-center p-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></AppShell>}>
      <NewBookingPageContent />
    </Suspense>
  );
}
