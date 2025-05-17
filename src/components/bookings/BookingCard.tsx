
"use client";

import type { Booking, BookingStatus } from "@/types/booking";
import { ALL_BOOKING_STATUSES } from "@/types/booking";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "./StatusBadge";
import { CalendarDays, Users, AlertTriangle, CheckCircle2, XCircle, Info, UserX, Armchair, Trash2, Edit3, Share2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateBookingStatus, deleteBooking } from "@/actions/bookingActions";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
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

  const statusUpdateMutation = useMutation({
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
    },
    onError: (error) => {
      toast({
        title: "Error Deleting Booking",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleStatusChange = (newStatus: string) => {
    statusUpdateMutation.mutate({ id: booking.id, status: newStatus as BookingStatus });
  };

  const handleDelete = () => {
    deleteMutation.mutate(booking.id);
  };

  const handleEdit = () => {
    router.push(`/bookings/edit/${booking.id}`);
  };

  const handleShare = async () => {
    const bookingDetailsText = `
Train Booking Details:
----------------------
For: ${booking.userName}
From: ${booking.source}
To: ${booking.destination}
Journey Date: ${formatDate(booking.journeyDate)}
Book By: ${formatDate(booking.bookingDate)}
Class: ${booking.classType}
Passengers: ${booking.passengerDetails}
Status: ${booking.status}
----------------------
Requested on: ${formatDate(booking.createdAt)}
Last updated: ${formatDate(booking.updatedAt)}
    `.trim();

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Booking: ${booking.source} to ${booking.destination}`,
          text: bookingDetailsText,
        });
        toast({ title: "Booking Shared", description: "Details sent successfully." });
      } catch (error) {
        // Fallback to copy if share fails (e.g., user cancels)
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


  const formatDate = (dateString: string) => {
    try {
      if (dateString && dateString.match(/^\\d{4}-\\d{2}-\\d{2}$/)) {
        return format(new Date(dateString + "T00:00:00"), "PPP");
      }
      // Attempt to parse ISO string which may or may not have T00:00:00
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString; // Return original if invalid
      return format(date, "PPP");
    } catch (e) {
      return dateString; 
    }
  }

  return (
    <Card className="w-full shadow-md hover:shadow-lg transition-shadow duration-200 flex flex-col">
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
      <CardContent className="space-y-3 text-sm flex-grow">
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
      <CardFooter className="flex flex-col items-stretch gap-3 pt-4 border-t">
        <div className="flex justify-between items-center">
            <div className="text-xs text-muted-foreground">
            Last updated: {formatDate(booking.updatedAt)}
            </div>
            <div className="flex gap-1">
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

            <AlertDialog>
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
                    request for {booking.userName} from {booking.source} to {booking.destination}.
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
        <Select onValueChange={handleStatusChange} defaultValue={booking.status} disabled={statusUpdateMutation.isPending}>
          <SelectTrigger className="w-full">
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
