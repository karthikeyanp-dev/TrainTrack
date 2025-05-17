
"use client";

import type { Booking, BookingStatus } from "@/types/booking";
import { ALL_BOOKING_STATUSES } from "@/types/booking";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "./StatusBadge";
import { CalendarDays, Users, AlertTriangle, CheckCircle2, XCircle, Info, UserX, Armchair } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateBookingStatus } from "@/actions/bookingActions";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface BookingCardProps {
  booking: Booking;
}

function getStatusIcon(status: BookingStatus) {
  switch (status) {
    case "Requested": return <Info className="h-4 w-4 text-blue-500" />;
    case "Booked": return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case "Missed": return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case "Booking Failed": return <XCircle className="h-4 w-4 text-red-600" />;
    case "User Cancelled": return <UserX className="h-4 w-4 text-orange-500" />;
    default: return <Info className="h-4 w-4" />;
  }
}


export function BookingCard({ booking }: BookingCardProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: BookingStatus }) => updateBookingStatus(id, status),
    onSuccess: (updatedBooking) => {
      if (updatedBooking) {
        queryClient.invalidateQueries({ queryKey: ["bookings"] });
        toast({
          title: "Status Updated",
          description: `Booking for ${updatedBooking.userName} is now ${updatedBooking.status}.`,
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to update booking status.",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update status: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleStatusChange = (newStatus: string) => {
    mutation.mutate({ id: booking.id, status: newStatus as BookingStatus });
  };

  const formatDate = (dateString: string) => {
    try {
      if (dateString && dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return format(new Date(dateString + "T00:00:00"), "PPP");
      }
      return format(new Date(dateString), "PPP");
    } catch (e) {
      return dateString; 
    }
  }

  return (
    <Card className="w-full shadow-md hover:shadow-lg transition-shadow duration-200">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg md:text-xl">
              {booking.source} to {booking.destination}
            </CardTitle>
            <CardDescription>For {booking.userName}</CardDescription>
          </div>
          <StatusBadge status={booking.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span>Journey: {formatDate(booking.journeyDate)}</span>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span>Book by: {formatDate(booking.bookingDate)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Armchair className="h-4 w-4 text-muted-foreground" />
          <span>Class: {booking.classType}</span>
        </div>
        <div className="flex items-start gap-2">
          <Users className="h-4 w-4 text-muted-foreground mt-0.5" />
          <span className="flex-1">Passengers: {booking.passengerDetails}</span>
        </div>
        <div className="flex items-center gap-2">
          {getStatusIcon(booking.status)}
          <span>Created: {formatDate(booking.createdAt)}</span>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row justify-between items-center gap-2 pt-4 border-t">
        <div className="text-xs text-muted-foreground">
          Last updated: {formatDate(booking.updatedAt)}
        </div>
        <Select onValueChange={handleStatusChange} defaultValue={booking.status} disabled={mutation.isPending}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Update status" />
          </SelectTrigger>
          <SelectContent>
            {ALL_BOOKING_STATUSES.map((statusOption) => (
              <SelectItem key={statusOption} value={statusOption}>
                {statusOption}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardFooter>
    </Card>
  );
}
