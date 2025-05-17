import { BookingForm } from "@/components/bookings/BookingForm";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewBookingPage() {
  return (
    <AppShell>
      <Card className="max-w-2xl mx-auto shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Add New Booking Request</CardTitle>
          <CardDescription>
            Fill in the details below to save a new booking request from a client.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BookingForm />
        </CardContent>
      </Card>
    </AppShell>
  );
}
