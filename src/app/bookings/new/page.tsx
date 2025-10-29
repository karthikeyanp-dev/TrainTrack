
import { BookingForm } from "@/components/bookings/BookingForm";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getBookingById } from "@/actions/bookingActions";
import type { BookingFormData, Passenger } from "@/types/booking";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

interface NewBookingPageProps {
  searchParams?: { [key: string]: string | string[] | undefined };
}

export default async function NewBookingPage({ searchParams }: NewBookingPageProps) {
  let initialDataForForm: (BookingFormData & { journeyDateObj?: Date; bookingDateObj?: Date; passengers?: Passenger[] }) | undefined = undefined;
  let copyError: string | null = null;

  const awaitedSearchParams = await searchParams;
  const copyFromId = awaitedSearchParams?.copyFrom as string | undefined;

  if (copyFromId) {
    const bookingToCopy = await getBookingById(copyFromId);
    if (bookingToCopy) {
      initialDataForForm = {
        source: bookingToCopy.source,
        destination: bookingToCopy.destination,
        // Keep original dates, user can change them
        journeyDate: bookingToCopy.journeyDate, 
        journeyDateObj: new Date(bookingToCopy.journeyDate + 'T00:00:00'),
        bookingDate: bookingToCopy.bookingDate,
        bookingDateObj: new Date(bookingToCopy.bookingDate + 'T00:00:00'),
        userName: bookingToCopy.userName,
        passengers: bookingToCopy.passengers.map(p => ({ ...p })), // Create a new array of passenger objects
        classType: bookingToCopy.classType,
        bookingType: bookingToCopy.bookingType,
        trainPreference: bookingToCopy.trainPreference || "",
        remarks: bookingToCopy.remarks || "",
      };
    } else {
      copyError = `Could not find booking with ID "${copyFromId}" to copy. Please fill out the form manually.`;
    }
  }

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
          <BookingForm initialData={initialDataForForm} />
        </CardContent>
      </Card>
    </AppShell>
  );
}

    