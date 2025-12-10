
"use client";

import type { Booking, BookingStatus } from "@/types/booking";
import { ALL_BOOKING_STATUSES } from "@/types/booking";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "./StatusBadge";
import { CalendarDays, Users, AlertTriangle, CheckCircle2, XCircle, Info, UserX, Trash2, Edit3, Share2, Train, Clock, Copy, MessageSquare, Check, X, CreditCard, Receipt } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateBookingStatus, deleteBooking } from "@/actions/bookingActions";
import { getBookingRecordByBookingId } from "@/actions/bookingRecordActions";
import type { BookingRecord } from "@/types/bookingRecord";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { BookingRequirementsSheet } from "./BookingRequirementsSheet";
import { BookingRecordForm } from "./BookingRecordForm";


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
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [bookingRecord, setBookingRecord] = useState<BookingRecord | null>(null);

  const fetchBookingRecord = useCallback(async () => {
    try {
      const record = await getBookingRecordByBookingId(booking.id);
      setBookingRecord(record);
    } catch (error) {
      console.error("Failed to fetch booking record:", error);
    }
  }, [booking.id]);

  useEffect(() => {
    fetchBookingRecord();
  }, [fetchBookingRecord]);

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
    
    // Build prepared accounts section if exists
    let preparedAccountsText = '';
    if (booking.preparedAccounts && booking.preparedAccounts.length > 0) {
      const accountsDetails = booking.preparedAccounts.map((acc, index) => {
        const handlingInfo = acc.handlingBy ? ` | Handler: ${acc.handlingBy}` : '';
        const walletInfo = acc.walletAmount !== undefined ? ` (₹${acc.walletAmount.toFixed(2)})` : '';
        return `${index + 1}. ${acc.username} | ${acc.password} | Master: ${acc.isMasterAdded ? '✅' : '❌'} | Wallet: ${acc.isWalletLoaded ? '✅' : '❌'}${walletInfo}${handlingInfo}`;
      }).join('\n');
      preparedAccountsText = `\n-\nID(s) for Booking:\n${accountsDetails}`;
    }

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
${booking.remarks ? `Remarks: ${booking.remarks}` : ''}${preparedAccountsText}
----------------------
    `.trim().replace(/^\n+|\n+$/g, '').replace(/\n\n+/g, '\n');

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Booking: ${booking.source.toUpperCase()} to ${booking.destination.toUpperCase()}`,
          text: bookingDetailsText,
        });
        toast({ title: "Booking Shared", description: "Details sent successfully." });
      } catch (error: any) {
        // Only fallback to clipboard if it's not a user cancellation
        if (error?.name === 'AbortError') {
          // User cancelled the share dialog - do nothing
          console.log("Share cancelled by user");
        } else {
          console.warn("Web Share API failed:", error);
          copyToClipboard(bookingDetailsText);
        }
      }
    } else {
      copyToClipboard(bookingDetailsText);
    }
  };

  const copyToClipboard = async (text: string) => {
    // Check if clipboard API is available (requires HTTPS or localhost)
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        toast({ title: "Copied to Clipboard", description: "Booking details copied." });
      } catch (err) {
        console.error("Failed to copy to clipboard:", err);
        fallbackCopyToClipboard(text);
      }
    } else {
      fallbackCopyToClipboard(text);
    }
  };

  const fallbackCopyToClipboard = (text: string) => {
    // Fallback for browsers/contexts where clipboard API is not available
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);
      
      if (successful) {
        toast({ title: "Copied to Clipboard", description: "Booking details copied." });
      } else {
        toast({ title: "Copy Failed", description: "Could not copy details to clipboard.", variant: "destructive" });
      }
    } catch (err) {
      console.error("Fallback copy failed:", err);
      toast({ title: "Copy Failed", description: "Could not copy details to clipboard.", variant: "destructive" });
    }
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

        {/* Prepared Accounts Accordion */}
        {booking.preparedAccounts && booking.preparedAccounts.length > 0 && (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="accounts" className="border-none">
              <AccordionTrigger className="py-2 text-sm hover:no-underline">
                <span className="flex items-center gap-2">
                  <span className="font-semibold">ID(s) for Booking</span>
                  <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full">
                    {booking.preparedAccounts.length}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 pt-1">
                  {booking.preparedAccounts.map((account, index) => (
                    <div
                      key={index}
                      className="bg-muted/50 rounded-md p-2 text-xs space-y-1"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-muted-foreground">
                          Account #{index + 1}
                        </span>
                        <div className="flex gap-2">
                          <span className={cn(
                            "flex items-center gap-1 px-1.5 py-0.5 rounded text-xs",
                            account.isMasterAdded 
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" 
                              : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                          )}>
                            {account.isMasterAdded ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                            Master
                          </span>
                          <span className={cn(
                            "flex items-center gap-1 px-1.5 py-0.5 rounded text-xs",
                            account.isWalletLoaded 
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" 
                              : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                          )}>
                            {account.isWalletLoaded ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                            Wallet{account.walletAmount !== undefined ? ` (₹${account.walletAmount.toFixed(2)})` : ''}
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-muted-foreground">User:</span>{" "}
                          <span className="font-medium">{account.username}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Pass:</span>{" "}
                          <span className="font-medium font-mono">{account.password}</span>
                        </div>
                      </div>
                      {account.handlingBy && (
                        <div className="mt-1">
                          <span className="text-muted-foreground">Handling By:</span>{" "}
                          <span className="font-medium">{account.handlingBy}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}

        {/* Booking Details Accordion */}
        {bookingRecord && (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="booking-details" className="border-none">
              <AccordionTrigger className="py-2 text-sm hover:no-underline">
                <span className="flex items-center gap-2">
                  <span className="font-semibold">Booked Details</span>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="bg-muted/50 rounded-md p-2 text-xs space-y-2 pt-1">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-muted-foreground">Booked By:</span>
                      <div className="font-medium">{bookingRecord.bookedBy}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Amount:</span>
                      <div className="font-medium">₹{bookingRecord.amountCharged}</div>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Account Used:</span>
                    <div className="font-medium">{bookingRecord.bookedAccountUsername}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Payment Method:</span>
                    <div className="font-medium">{bookingRecord.methodUsed}</div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
        {/* Status section removed */}
      </CardContent>
      
      {showRecordForm && (
        <div className="px-6">
          <BookingRecordForm 
            bookingId={booking.id} 
            onClose={() => {
              setShowRecordForm(false);
              fetchBookingRecord();
            }} 
          />
        </div>
      )}
      
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
           <BookingRequirementsSheet booking={booking} iconComponent={CreditCard} />
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
        
        {/* Booking Record Toggle Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowRecordForm(prev => !prev)}
          className="w-full"
        >
          <MessageSquare className="mr-2 h-4 w-4" />
          {showRecordForm 
            ? "Hide Booked Details" 
            : bookingRecord 
              ? "Update Booked Details" 
              : "Add Booked Details"
          }
        </Button>
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


    
    