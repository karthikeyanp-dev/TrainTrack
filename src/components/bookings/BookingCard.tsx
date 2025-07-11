
"use client";

import type { Booking, BookingStatus } from "@/types/booking";
import { ALL_BOOKING_STATUSES } from "@/types/booking";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "./StatusBadge";
import { CalendarDays, Users, AlertTriangle, CheckCircle2, XCircle, Info, UserX, Trash2, Edit3, Share2, Train, Clock, Copy } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateBookingStatus, deleteBooking } from "@/actions/bookingActions";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";


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
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showStatusConfirmDialog, setShowStatusConfirmDialog] = useState(false);
  const [statusToConfirm, setStatusToConfirm] = useState<BookingStatus | null>(null);

  const [clientFormattedCreatedAt, setClientFormattedCreatedAt] = useState<string | null>(null);
  const [clientFormattedUpdatedAt, setClientFormattedUpdatedAt] = useState<string | null>(null);
  const [clientFormattedJourneyDate, setClientFormattedJourneyDate] = useState<string | null>(null);
  const [clientFormattedBookingDate, setClientFormattedBookingDate] = useState<string | null>(null);

  const formatDate = useCallback((dateString: string): string => {
    if (!dateString) return 'N/A';
    try {
      if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // For YYYY-MM-DD strings, ensure they are treated as local dates.
        // Appending T00:00:00 or T12:00:00 makes it local to the environment.
        // For display like "PPP", the time component doesn't matter as much as getting the date right.
        const date = new Date(dateString + 'T12:00:00');
        if (isNaN(date.getTime())) {
          console.warn(`[BookingCard] Invalid date-only string: ${dateString}`);
          return 'Invalid Date';
        }
        return format(date, "PPP");
      }
      const date = new Date(dateString); // Handles ISO strings with timezones
      if (isNaN(date.getTime())) {
        console.warn(`[BookingCard] Invalid timestamp string: ${dateString}`);
        return 'Invalid Date';
      }
      return format(date, "PPP");
    } catch (error) {
      console.error(`[BookingCard] Error formatting date "${dateString}":`, error);
      return 'Error Date';
    }
  }, []);

  useEffect(() => {
    setClientFormattedCreatedAt(formatDate(booking.createdAt));
    setClientFormattedUpdatedAt(formatDate(booking.updatedAt));
    setClientFormattedJourneyDate(formatDate(booking.journeyDate));
    setClientFormattedBookingDate(formatDate(booking.bookingDate));
  }, [booking.createdAt, booking.updatedAt, booking.journeyDate, booking.bookingDate, formatDate]);


  const statusUpdateMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: BookingStatus }) => updateBookingStatus(id, status),
    onSuccess: (updatedBooking) => {
      if (updatedBooking) {
        queryClient.invalidateQueries({ queryKey: ["bookings"] });
        queryClient.invalidateQueries({queryKey: ['booking', updatedBooking.id]});
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
      setShowStatusConfirmDialog(false);
      setStatusToConfirm(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to update status: ${error.message}`,
        variant: "destructive",
      });
      setShowStatusConfirmDialog(false);
      setStatusToConfirm(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteBooking(id),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["bookings"] });
        toast({
          title: "Booking Deleted",
          description: `Booking request for ${booking.userName} has been deleted.`,
        });
      } else {
        toast({
          title: "Error Deleting Booking",
          description: result.error || "An unknown error occurred.",
          variant: "destructive",
        });
      }
      setShowDeleteDialog(false);
    },
    onError: (error) => {
      toast({
        title: "Error Deleting Booking",
        description: error.message,
        variant: "destructive",
      });
      setShowDeleteDialog(false);
    },
  });

  const handleStatusSelect = (newStatus: string) => {
    setStatusToConfirm(newStatus as BookingStatus);
    setShowStatusConfirmDialog(true);
  };

  const handleConfirmStatusUpdate = () => {
    if (statusToConfirm) {
      statusUpdateMutation.mutate({ id: booking.id, status: statusToConfirm });
    }
  };

  const handleDelete = () => {
    deleteMutation.mutate(booking.id);
  };

  const handleEdit = () => {
    router.push(`/bookings/edit/${booking.id}`);
  };

  const handleCopy = () => {
    router.push(`/bookings/new?copyFrom=${booking.id}`);
  };

  const handleShare = async () => {
    const passengerDetailsText = booking.passengers.map((p, index) => `${index + 1}. ${p.name} ${p.age} ${p.gender.toUpperCase()}`).join('\n');
    const journeyDateFormatted = clientFormattedJourneyDate || "N/A";
    const bookingDateFormatted = clientFormattedBookingDate || "N/A";
    
    const journeyDateForDay = booking.journeyDate.match(/^\d{4}-\d{2}-\d{2}$/) 
                              ? new Date(booking.journeyDate + 'T12:00:00')
                              : new Date(booking.journeyDate);

    const dayOfWeek = !isNaN(journeyDateForDay.getTime()) ? format(journeyDateForDay, "EEEE") : "N/A";

    const bookingDetailsText = `
Train Booking Details:
----------------------
From: ${booking.source.toUpperCase()}
To: ${booking.destination.toUpperCase()}
Journey Date: ${journeyDateFormatted}
Day of Journey: ${dayOfWeek} 
Book By: ${bookingDateFormatted}
Class: ${booking.classType}
Passengers:
${passengerDetailsText}
${booking.trainPreference ? `Train Preference: ${booking.trainPreference}` : ''}
${booking.timePreference ? `Time Preference: ${booking.timePreference}` : ''}
----------------------
    `.trim().replace(/^\n+|\n+$/g, '').replace(/\n\n+/g, '\n');

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Booking: ${booking.source.toUpperCase()} to ${booking.destination.toUpperCase()}`,
          text: bookingDetailsText,
        });
        toast({ title: "Booking Shared", description: "Details sent successfully." });
      } catch (error) {
        console.warn("Web Share API failed or was cancelled:", error);
        copyToClipboard(bookingDetailsText);
      }
    } else {
      copyToClipboard(bookingDetailsText);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: "Copied to Clipboard", description: "Booking details copied." });
    }).catch(err => {
      toast({ title: "Copy Failed", description: "Could not copy details to clipboard.", variant: "destructive" });
      console.error("Failed to copy to clipboard:", err);
    });
  };

  return (
    <Card className="w-full shadow-md hover:shadow-lg transition-shadow duration-200 flex flex-col">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg md:text-xl">
              {booking.source.toUpperCase()} to {booking.destination.toUpperCase()}
            </CardTitle>
            <hr></hr>
            <CardDescription>For <b>{booking.userName}</b></CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge status={booking.status} />
            <span className="text-3xl font-semibold text-primary">{booking.classType}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm flex-grow">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span><span className="font-semibold">Journey:</span> {clientFormattedJourneyDate || "..."}</span>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span><span className="font-semibold">Book by:</span> {clientFormattedBookingDate || "..."}</span>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">Passengers:</span>
          </div>
          {booking.passengers.map((passenger, index) => (
            <div key={index} className="ml-6 text-sm">
              {passenger.name}, {passenger.age}, {passenger.gender.toUpperCase()}
            </div>
          ))}
        </div>

        {booking.trainPreference && (
          <div className="flex items-start gap-2">
            <Train className="h-4 w-4 text-muted-foreground mt-0.5" />
            <span className="flex-1"><span className="font-semibold">Train Pref:</span> {booking.trainPreference}</span>
          </div>
        )}
        {booking.timePreference && (
          <div className="flex items-start gap-2">
            <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
            <span className="flex-1"><span className="font-semibold">Time Pref:</span> {booking.timePreference}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          {getStatusIcon(booking.status)}
          <span><span className="font-semibold">Created:</span> {clientFormattedCreatedAt || "..."}</span>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-3 pt-4 border-t">
        <div className="flex justify-between items-center">
            <div className="text-xs text-muted-foreground">
            <span className="font-semibold">Last updated:</span> {clientFormattedUpdatedAt || "..."}
            </div>
            <div className="flex gap-1">
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={handleCopy} aria-label="Copy booking">
                            <Copy className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy Booking</TooltipContent>
                </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
                <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={handleEdit} aria-label="Edit booking">
                        <Edit3 className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>Edit Booking</TooltipContent>
                </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
                <Tooltip>
                <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" onClick={handleShare} aria-label="Share booking">
                        <Share2 className="h-4 w-4" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>Share Booking</TooltipContent>
                </Tooltip>
            </TooltipProvider>

            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <TooltipProvider>
                    <Tooltip>
                    <TooltipTrigger asChild>
                        <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" aria-label="Delete booking">
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </AlertDialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Delete Booking</TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete the booking
                    request for {booking.userName} from {booking.source.toUpperCase()} to {booking.destination.toUpperCase()}.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={deleteMutation.isPending}
                    >
                    {deleteMutation.isPending ? "Deleting..." : "Delete"}
                    </AlertDialogAction>
                </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            </div>
        </div>
        <div className="flex flex-col gap-1.5">
           <Label htmlFor={`status-select-${booking.id}`} className="text-xs font-medium text-muted-foreground">Update Booking Status:</Label>
            <Select
                value={booking.status}
                onValueChange={handleStatusSelect}
                disabled={statusUpdateMutation.isPending}
                name={`status-select-${booking.id}`}
                aria-labelledby={`status-select-label-${booking.id}`}
            >
                <SelectTrigger id={`status-select-${booking.id}`} className="w-full">
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
        </div>

        <AlertDialog open={showStatusConfirmDialog} onOpenChange={setShowStatusConfirmDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Status Change</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to change the status to "{statusToConfirm}" for the booking
                from {booking.source.toUpperCase()} to {booking.destination.toUpperCase()} for {booking.userName}?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => { setStatusToConfirm(null); setShowStatusConfirmDialog(false); }}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmStatusUpdate}
                disabled={statusUpdateMutation.isPending}
              >
                {statusUpdateMutation.isPending ? "Updating..." : "Confirm"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}

