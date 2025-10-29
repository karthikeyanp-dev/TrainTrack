
"use client";

import type { Booking, BookingStatus } from "@/types/booking";
import { ALL_BOOKING_STATUSES } from "@/types/booking";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "./StatusBadge";
import { CalendarDays, Users, AlertTriangle, CheckCircle2, XCircle, Info, UserX, Trash2, Edit3, Share2, Train, Clock, Copy, MessageSquare } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";


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
        // For display like "MMM dd, yyyy (EEE)", the time component doesn't matter as much as getting the date right.
        const date = new Date(dateString + 'T12:00:00');
        if (isNaN(date.getTime())) {
          console.warn(`[BookingCard] Invalid date-only string: ${dateString}`);
          return 'Invalid Date';
        }
        return format(date, "MMM dd, yyyy (EEE)");
      }
      const date = new Date(dateString); // Handles ISO strings with timezones
      if (isNaN(date.getTime())) {
        console.warn(`[BookingCard] Invalid timestamp string: ${dateString}`);
        return 'Invalid Date';
      }
      return format(date, "MMM dd, yyyy (EEE)");
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
    const bookingDetailsText = `
Train Booking Details:
----------------------
From: ${booking.source.toUpperCase()}
To: ${booking.destination.toUpperCase()}
-
Journey Date: ${journeyDateFormatted}
Book By: ${bookingDateFormatted}
-
Type: ${booking.bookingType}
Class: ${booking.classType}
-
Passengers:
${passengerDetailsText}
-
${booking.trainPreference ? `Train Preference: ${booking.trainPreference}` : ''}
${booking.remarks ? `Remarks: ${booking.remarks}` : ''}
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
  
  const displayClass = `${booking.bookingType === 'Tatkal' ? 'T' : 'G'}-${booking.classType}`;

  return (
    <Card className="w-full shadow-md hover:shadow-lg transition-shadow duration-200 flex flex-col">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg md:text-xl">
              {booking.source.toUpperCase()} <span className="text-sm text-gray-400">to</span> {booking.destination.toUpperCase()}
            </CardTitle>
            <hr></hr>
            <CardDescription>For <b>{booking.userName}</b></CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge status={booking.status} />
            <span className={cn(
              "text-3xl font-semibold",
              booking.bookingType === 'Tatkal' ? "text-primary" : "text-amber-700 dark:text-amber-600"
            )}>
              {displayClass}
            </span>
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
        {booking.remarks && (
          <div className="flex items-start gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5" />
            <span className="flex-1"><span className="font-semibold">Remarks:</span> {booking.remarks}</span>
          </div>
        )}
        {/* Status section removed */}
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-3 pt-4 border-t">
        {/* Created and Last Updated side by side */}
        <div className="flex gap-2">
          <div className="flex-1 text-xs text-muted-foreground">
            <div className="font-semibold mb-1">Created</div>
            <div>{clientFormattedCreatedAt || "..."}</div>
          </div>
          <div className="flex-1 text-xs text-muted-foreground text-right">
            <div className="font-semibold mb-1">Last Updated</div>
            <div>{clientFormattedUpdatedAt || "..."}</div>
          </div>
        </div>
        
        {/* Action buttons with icons only for mobile compatibility */}
         <div className="flex gap-1">
           <Button 
             variant="outline" 
             size="sm" 
             onClick={handleCopy}
             className="flex-1 aspect-square p-2"
             title="Duplicate"
           >
             <Copy className="h-4 w-4" />
           </Button>
           <Button 
             variant="outline" 
             size="sm" 
             onClick={handleEdit}
             className="flex-1 aspect-square p-2"
             title="Edit"
           >
             <Edit3 className="h-4 w-4" />
           </Button>
           <Button 
             variant="outline" 
             size="sm" 
             onClick={handleShare}
             className="flex-1 aspect-square p-2"
             title="Share"
           >
             <Share2 className="h-4 w-4" />
           </Button>
           <Button 
             variant="outline" 
             size="sm" 
             onClick={() => setShowDeleteDialog(true)}
             className="flex-1 aspect-square p-2 text-destructive hover:text-destructive"
             title="Delete"
           >
             <Trash2 className="h-4 w-4" />
           </Button>
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

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
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

      </CardFooter>
    </Card>
  );
}


    
    