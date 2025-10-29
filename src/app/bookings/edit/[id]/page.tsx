
import { getBookingById } from "@/actions/bookingActions";
import { BookingForm } from "@/components/bookings/BookingForm";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import type { BookingFormData, Passenger } from "@/types/booking";

interface EditBookingPageProps {
  params: { id: string };
}

export default async function EditBookingPage({ params }: EditBookingPageProps) {
  const { id } = await params;
  const booking = await getBookingById(id);

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

   const initialData: BookingFormData & { journeyDateObj: Date; bookingDateObj: Date; passengers: Passenger[] } = {
    source: booking.source,
    destination: booking.destination,
    journeyDate: booking.journeyDate,
    bookingDate: booking.bookingDate,
    userName: booking.userName,
    passengers: booking.passengers.map(p => ({ ...p })), // Create a new array of new passenger objects
    classType: booking.classType,
    bookingType: booking.bookingType,
    trainPreference: booking.trainPreference || "",
    remarks: booking.remarks || "",
    journeyDateObj: new Date(booking.journeyDate + 'T00:00:00'),
    bookingDateObj: new Date(booking.bookingDate + 'T00:00:00'),
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

    