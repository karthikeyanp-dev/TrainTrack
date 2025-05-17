
import { getBookingById } from "@/actions/bookingActions";
import { BookingForm } from "@/components/bookings/BookingForm";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import type { BookingFormData } from "@/types/booking";

interface EditBookingPageProps {
  params: { id: string };
}

export default async function EditBookingPage({ params }: EditBookingPageProps) {
  const booking = await getBookingById(params.id);

  if (!booking) {
    return (
      <AppShell>
        <Alert variant="destructive" className="max-w-2xl mx-auto">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Booking Not Found</AlertTitle>
          <AlertDescription>
            The booking you are trying to edit does not exist or could not be loaded.
          </AlertDescription>
        </Alert>
      </AppShell>
    );
  }

  // Prepare initialData for the form. Dates need to be passed as strings if BookingForm expects them.
  // The BookingForm's zod schema expects Date objects, so we convert them here.
   const initialData: BookingFormData & { journeyDateObj: Date; bookingDateObj: Date } = {
    source: booking.source,
    destination: booking.destination,
    journeyDate: booking.journeyDate, // Keep as string for BookingFormData type
    bookingDate: booking.bookingDate, // Keep as string for BookingFormData type
    userName: booking.userName,
    passengerDetails: booking.passengerDetails,
    classType: booking.classType,
    // These are for initializing the form's Date objects
    journeyDateObj: new Date(booking.journeyDate + 'T00:00:00'), // Ensure correct parsing
    bookingDateObj: new Date(booking.bookingDate + 'T00:00:00'), // Ensure correct parsing
  };


  return (
    <AppShell>
      <Card className="max-w-2xl mx-auto shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Edit Booking Request</CardTitle>
          <CardDescription>
            Modify the details below for the booking request.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BookingForm initialData={initialData} bookingId={booking.id} />
        </CardContent>
      </Card>
    </AppShell>
  );
}
