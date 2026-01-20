
"use client";

import type { Booking, BookingStatus } from "@/types/booking";
import { ALL_BOOKING_STATUSES } from "@/types/booking";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "./StatusBadge";
import { CalendarDays, Users, AlertTriangle, CheckCircle2, XCircle, Info, UserX, Trash2, Edit3, Share2, Train, Clock, Copy, MessageSquare, Check, X, CreditCard, Receipt, Loader2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateBookingStatus, deleteBooking, getBookingRecordByBookingId, deleteBookingRefundDetails, deleteBookingRecord } from "@/lib/firestoreClient";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { StatusReasonDialog } from "./StatusReasonDialog";
import { getAccountByUsername, updateAccount } from "@/lib/accountsClient";
import { updateBookingRefundDetails } from "@/lib/firestoreClient";
import type { RefundDetails } from "@/types/booking";
import { Input } from "@/components/ui/input";


interface BookingCardProps {
  booking: Booking;
}

function getStatusIcon(status: BookingStatus) {
  switch (status) {
    case "Requested": return <Info className="h-4 w-4 text-blue-500" />;
    case "Booked": return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case "Missed": return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case "Booking Failed (Unpaid)":
    case "Booking Failed (Paid)": return <XCircle className="h-4 w-4 text-red-600" />;
    case "User Cancelled":
    case "CNF & Cancelled": return <UserX className="h-4 w-4 text-orange-500" />;
    default: return <Info className="h-4 w-4" />;
  }
}

export function BookingCard({ booking }: BookingCardProps) {
  const labelHighlightStyle = { color: '#AB945E', fontWeight: 700 };
  const sourceDestStyle = { color: '#dfa92a', fontWeight: 700 };
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
  const [showBookedDetailsDialog, setShowBookedDetailsDialog] = useState(false);
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [bookingRecord, setBookingRecord] = useState<BookingRecord | null>(null);
  
  // Refund state
  const [refundAmount, setRefundAmount] = useState("");
  const [refundDate, setRefundDate] = useState(new Date().toISOString().split('T')[0]);
  const [isProcessingRefund, setIsProcessingRefund] = useState(false);

  const [showRefundDeleteDialog, setShowRefundDeleteDialog] = useState(false);

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

  const formatDate = useCallback((dateString: string | any): string => {
    if (!dateString) return "N/A";
    try {
      if (typeof dateString === "object" && dateString && typeof dateString.toDate === "function") {
        return format(dateString.toDate(), "MMM dd, yyyy (EEE)");
      }

      if (typeof dateString !== "string") {
        return "Invalid Type";
      }

      if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const date = new Date(dateString + "T12:00:00");
        if (isNaN(date.getTime())) {
          console.warn(`[BookingCard] Invalid date-only string: ${dateString}`);
          return "Invalid Date";
        }
        return format(date, "MMM dd, yyyy (EEE)");
      }
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        console.warn(`[BookingCard] Invalid timestamp string: ${dateString}`);
        return "Invalid Date";
      }
      return format(date, "MMM dd, yyyy (EEE)");
    } catch (error) {
      console.error(`[BookingCard] Error formatting date "${dateString}":`, error);
      return "Error Date";
    }
  }, []);

  useEffect(() => {
    setClientFormattedCreatedAt(formatDate(booking.createdAt));
    setClientFormattedUpdatedAt(formatDate(booking.updatedAt));
    setClientFormattedJourneyDate(formatDate(booking.journeyDate));
    setClientFormattedBookingDate(formatDate(booking.bookingDate));
  }, [booking.createdAt, booking.updatedAt, booking.journeyDate, booking.bookingDate, formatDate]);


  const statusUpdateMutation = useMutation({
    mutationFn: ({
      id,
      status,
      reason,
      handler,
    }: {
      id: string;
      status: BookingStatus;
      reason?: string;
      handler?: string;
    }) => updateBookingStatus(id, status, reason, handler),
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
    if (newStatus === "Booked" || newStatus === "Booking Failed (Paid)") {
      // Show the booked details dialog (or failed payment dialog) instead of confirmation
      // We can reuse the BookingRecordForm for "Booking Failed (Paid)" as well since we need the same details
      setStatusToConfirm(newStatus as BookingStatus);
      setShowBookedDetailsDialog(true);
    } else if (newStatus === "Missed" || newStatus === "Booking Failed (Unpaid)" || newStatus === "CNF & Cancelled" || newStatus === "User Cancelled") {
      // Show reason dialog for Missed, Failed, and Cancelled statuses
      setStatusToConfirm(newStatus as BookingStatus);
      setShowReasonDialog(true);
    } else if (newStatus === "Requested" && booking.status !== "Requested") {
      // Reverting to Requested - need to clean up statusReason, statusHandler, and booking record
      setStatusToConfirm(newStatus as BookingStatus);
      setShowStatusConfirmDialog(true);
    } else {
      // Show regular confirmation dialog for other statuses
      setStatusToConfirm(newStatus as BookingStatus);
      setShowStatusConfirmDialog(true);
    }
  };

  const handleBookedDetailsSuccess = () => {
    // Update the status to Booked or Failed (Paid) after record is saved
    const status = statusToConfirm || "Booked";
    statusUpdateMutation.mutate({ id: booking.id, status: status });
    setShowBookedDetailsDialog(false);
    fetchBookingRecord();
    setStatusToConfirm(null);
  };

  const handleReasonConfirm = (reason: string, handler?: string) => {
    if (statusToConfirm) {
      statusUpdateMutation.mutate({ id: booking.id, status: statusToConfirm, reason, handler });
      setShowReasonDialog(false);
      setStatusToConfirm(null);
    }
  };

  const handleConfirmStatusUpdate = async () => {
    if (statusToConfirm) {
      // If reverting to "Requested", delete booking record and clear reason/handler
      if (statusToConfirm === "Requested" && booking.status !== "Requested") {
        try {
          // Delete booking record if it exists
          if (bookingRecord) {
            const deleteResult = await deleteBookingRecord(bookingRecord.id);
            if (!deleteResult.success) {
              toast({
                title: "Warning",
                description: `Failed to delete booking record: ${deleteResult.error}`,
                variant: "destructive",
              });
            }
          }

          // Update status and clear reason/handler by passing empty strings
          statusUpdateMutation.mutate({
            id: booking.id,
            status: statusToConfirm,
            reason: "",
            handler: ""
          });
        } catch (error: any) {
          toast({
            title: "Error",
            description: `Failed to revert to Requested: ${error.message}`,
            variant: "destructive",
          });
          setShowStatusConfirmDialog(false);
          setStatusToConfirm(null);
        }
      } else {
        // Regular status update
        statusUpdateMutation.mutate({ id: booking.id, status: statusToConfirm });
      }
    }
  };

  const handleDelete = () => {
    deleteMutation.mutate(booking.id);
  };

  const handleEdit = () => {
    router.push(`/bookings/edit?id=${booking.id}`);
  };

  const handleRefundClick = () => {
    if (bookingRecord) {
      // Pre-fill amount if available (though usually partial refunds, so maybe empty is better or full amount)
      // Let's leave amount empty for user to input
      setRefundAmount("");
      setRefundDate(new Date().toISOString().split('T')[0]);
      setShowRefundDialog(true);
    } else {
        toast({
            title: "Missing Details",
            description: "No booking record found. Cannot process refund without payment details.",
            variant: "destructive"
        });
    }
  };

  const handleEditRefund = () => {
    if (booking.refundDetails) {
        setRefundAmount(booking.refundDetails.amount.toString());
        setRefundDate(booking.refundDetails.date);
        setShowRefundDialog(true);
    }
  };

  const handleDeleteRefund = async () => {
    setIsProcessingRefund(true);
    try {
        // 1. If original payment was Wallet, revert the amount (deduct from wallet)
        if (booking.refundDetails?.method === "Wallet" && booking.refundDetails.accountId) {
             const accountId = booking.refundDetails.accountId;
             // We need to fetch the account first to get current balance
             // Since we don't have getAccountById, we can try to find it via username if we have it, 
             // OR we just use updateAccount which merges. But we need current balance to subtract.
             // Wait, the accountId IS the document ID in Firestore.
             // We can fetch the account by ID (if we had a method) or just rely on the fact that we have the account details in preparedAccounts or bookingRecord?
             // Actually, we stored accountId in refundDetails. 
             // We need a way to get account by ID to read balance.
             // Let's assume we can fetch all accounts and find it, or add getAccountById.
             // For now, let's use the accountsClient's updateAccount but we need the current balance.
             // Let's fetch all accounts (cached usually) or add a helper. 
             // Or better, let's just use the bookingRecord which has the username, and fetch by username.
             
             // If we have bookingRecord loaded
             if (bookingRecord) {
                 const account = await getAccountByUsername(bookingRecord.bookedAccountUsername);
                 if (account) {
                     const currentBalance = account.walletAmount;
                     const refundAmount = booking.refundDetails.amount;
                     const newBalance = currentBalance - refundAmount;
                     
                     if (newBalance < 0) {
                         // Warning? But we must revert.
                         console.warn("Reverting refund results in negative balance.");
                     }
                     
                     await updateAccount(account.id, { walletAmount: newBalance });
                 }
             }
        }

        // 2. Delete refund details from booking
        const result = await deleteBookingRefundDetails(booking.id);
        if (!result.success) throw new Error(result.error);

        toast({ title: "Refund Deleted", description: "Refund record removed and wallet balance reverted (if applicable)." });
        setShowRefundDeleteDialog(false);
        queryClient.invalidateQueries({ queryKey: ["bookings"] });
        queryClient.invalidateQueries({queryKey: ['booking', booking.id]});
    } catch (error: any) {
        toast({ title: "Error", description: error.message || "Failed to delete refund", variant: "destructive" });
    } finally {
        setIsProcessingRefund(false);
    }
  };

  const handleRefundConfirm = async () => {
    if (!bookingRecord) return;
    
    const amount = Number(refundAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter a valid refund amount", variant: "destructive" });
      return;
    }

    setIsProcessingRefund(true);
    try {
        const account = await getAccountByUsername(bookingRecord.bookedAccountUsername);
        
        // 1. If Wallet, update account balance
        // Logic for EDIT vs NEW
        if (bookingRecord.methodUsed === "Wallet" && account) {
            let newWalletAmount = account.walletAmount;
            
            if (booking.refundDetails) {
                // EDIT MODE: 
                // First, revert the OLD refund amount
                newWalletAmount -= booking.refundDetails.amount;
                // Then, add the NEW refund amount
                newWalletAmount += amount;
            } else {
                // NEW MODE: Just add the refund amount
                newWalletAmount += amount;
            }
            
            const accountResult = await updateAccount(account.id, { walletAmount: newWalletAmount });
            if (!accountResult.success) throw new Error(accountResult.error);
        }

        // 2. Update Booking with refund details
        const accountId = account ? account.id : "unknown_account";

        const refundDetails: RefundDetails = {
            amount,
            date: refundDate,
            method: bookingRecord.methodUsed,
            accountId: accountId
        };
        
        const bookingResult = await updateBookingRefundDetails(booking.id, refundDetails);
        if (!bookingResult.success) throw new Error(bookingResult.error);

        toast({ 
            title: "Refund Processed", 
            description: bookingRecord.methodUsed === "Wallet" 
                ? "Wallet balance updated and refund saved." 
                : "Refund details saved successfully." 
        });
        setShowRefundDialog(false);
        queryClient.invalidateQueries({ queryKey: ["bookings"] });
        queryClient.invalidateQueries({queryKey: ['booking', booking.id]});
    } catch (error: any) {
        toast({ title: "Error", description: error.message || "Failed to process refund", variant: "destructive" });
    } finally {
        setIsProcessingRefund(false);
    }
  };

  const handleCopy = () => {
    router.push(`/bookings/new?copyFrom=${booking.id}`);
  };

  const handleShare = () => {
    const passengerDetailsText = booking.passengers.map((p, index) => {
      const isChild = p.age >= 5 && p.age <= 11;
      const berthInfo = isChild ? (p.berthRequired ? ' [Berth Required]' : ' [No Berth]') : '';
      return `${index + 1}. ${p.name} ${p.age} ${p.gender.toUpperCase()}${berthInfo}`;
    }).join('\n');
    const formattedJourney = formatDate(booking.journeyDate);
    const journeyDateFormatted = formattedJourney !== "N/A" ? formattedJourney : (booking.journeyDate || "N/A");
    const formattedBooking = formatDate(booking.bookingDate);
    const bookingDateFormatted = formattedBooking !== "N/A" ? formattedBooking : (booking.bookingDate || "N/A");

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
      navigator.share({
        title: `Booking: ${booking.source.toUpperCase()} to ${booking.destination.toUpperCase()}`,
        text: bookingDetailsText,
      })
        .then(() => {
          toast({ title: "Booking Shared", description: "Details sent successfully." });
        })
        .catch((error: any) => {
          // Only fallback to clipboard if it's not a user cancellation
          if (error?.name === 'AbortError') {
            // User cancelled the share dialog - do nothing
            console.log("Share cancelled by user");
          } else {
            console.warn("Web Share API failed:", error);
            copyToClipboard(bookingDetailsText);
          }
        });
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

  // Create compact display format for train class
  const getCompactClassDisplay = (classType: string): string => {
    const classMap: Record<string, string> = {
      "CC (Veg)": "CC-V",
      "CC (Non Veg)": "CC-NV", 
      "CC (No Food)": "CC-NF",
      "CC": "CC",
    };
    return classMap[classType] || classType;
  };

  const compactClass = getCompactClassDisplay(booking.classType);
  const displayClass = `${booking.bookingType === 'Tatkal' ? 'T' : 'G'}-${compactClass}`;

  return (
    <Card className="w-full shadow-md hover:shadow-lg transition-shadow duration-200 flex flex-col">
      <CardHeader>
        <div className="space-y-2">
          {/* First row: Source-Destination and Status Badge */}
          <div className="flex justify-between items-start gap-2">
            <CardTitle className="text-lg md:text-xl flex-shrink min-w-0">
              <span style={sourceDestStyle}>{booking.source.toUpperCase()}</span> <span className="text-sm text-gray-400">to</span> <span style={sourceDestStyle}>{booking.destination.toUpperCase()}</span>
            </CardTitle>
            <div className="flex-shrink-0">
              <StatusBadge status={booking.status} />
            </div>
          </div>
          
          {/* Second row: For userName and Class display */}
          <div className="flex justify-between items-start gap-2">
            <CardDescription className="flex-1 min-w-0">
              For <b>{booking.userName}</b>
            </CardDescription>
            <div className="flex flex-col items-end flex-shrink-0">
              <span 
                className={cn(
                  "text-3xl font-semibold leading-none",
                  booking.bookingType === 'Tatkal' ? "text-primary" : "text-amber-700 dark:text-amber-600"
                )}
                title={`${booking.bookingType} - ${booking.classType}`}
              >
                {displayClass}
              </span>
              {booking.classType.includes("(") && (
                <span className="text-xs text-muted-foreground mt-1">
                  {booking.classType.match(/\((.*?)\)/)?.[1]}
                </span>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm flex-grow">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span><span style={labelHighlightStyle}>Journey:</span> {clientFormattedJourneyDate || "..."}</span>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span><span style={labelHighlightStyle}>Book by:</span> {clientFormattedBookingDate || "..."}</span>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span style={labelHighlightStyle}>Passengers:</span>
          </div>
          {[...booking.passengers].sort((a, b) => a.name.localeCompare(b.name)).map((passenger, index) => {
            const isChild = passenger.age >= 5 && passenger.age <= 11;
            return (
              <div key={index} className="ml-6 text-sm flex items-center gap-2 flex-wrap">
                <span>{passenger.name}, {passenger.age}, {passenger.gender.toUpperCase()}</span>
                {isChild && (
                  passenger.berthRequired ? (
                    <span className="inline-flex items-center gap-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-full whitespace-nowrap">
                      <CheckCircle2 className="h-3 w-3" />
                      Berth
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded-full whitespace-nowrap">
                      <XCircle className="h-3 w-3" />
                      No Berth
                    </span>
                  )
                )}
              </div>
            );
          })}
        </div>

        {booking.trainPreference && (
          <div className="flex items-start gap-2">
            <Train className="h-4 w-4 text-muted-foreground mt-0.5" />
            <span className="flex-1"><span style={labelHighlightStyle}>Train Pref:</span> {booking.trainPreference}</span>
          </div>
        )}
        {booking.remarks && (
          <div className="flex items-start gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground mt-0.5" />
            <span className="flex-1"><span style={labelHighlightStyle}>Remarks:</span> {booking.remarks}</span>
          </div>
        )}
        
        {booking.statusReason && (booking.status === "Missed" || booking.status === "Booking Failed (Unpaid)" || booking.status === "Booking Failed (Paid)" || booking.status === "CNF & Cancelled" || booking.status === "User Cancelled") && (
          <div className="flex items-start gap-2 bg-muted/50 rounded-md p-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 mt-0.5" />
            <span className="flex-1">
              <span className="font-semibold text-yellow-700 dark:text-yellow-500">Status Reason:</span>
              <span className="block mt-0.5 text-muted-foreground">{booking.statusReason}</span>
              {booking.statusHandler && (
                <span className="block mt-0.5 text-muted-foreground">
                  Handler: {booking.statusHandler}
                </span>
              )}
            </span>
          </div>
        )}
        
        {booking.refundDetails && (
          <div className="flex items-start gap-2 bg-green-50 dark:bg-green-900/20 rounded-md p-2 border border-green-200 dark:border-green-900 relative">
            <Receipt className="h-4 w-4 text-green-600 dark:text-green-500 mt-0.5" />
            <span className="flex-1">
              <span className="font-semibold text-green-700 dark:text-green-500">Refund Received:</span>
              <span className="block mt-0.5 text-sm">
                ₹{booking.refundDetails.amount} on {formatDate(booking.refundDetails.date)}
              </span>
              <span className="block text-xs text-muted-foreground">
                via {booking.refundDetails.method}
              </span>
            </span>
            <div className="flex flex-col gap-1">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    onClick={handleEditRefund}
                    title="Edit Refund"
                >
                    <Edit3 className="h-3 w-3" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setShowRefundDeleteDialog(true)}
                    title="Delete Refund"
                >
                    <Trash2 className="h-3 w-3" />
                </Button>
            </div>
          </div>
        )}

        {/* Prepared Accounts Accordion */}
        {booking.preparedAccounts && booking.preparedAccounts.length > 0 && (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="accounts" className="border-none">
              <AccordionTrigger className="py-2 text-sm hover:no-underline">
                <span className="flex items-center gap-2">
                  <span style={labelHighlightStyle}>ID(s) for Booking</span>
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
                  <span style={labelHighlightStyle}>Booked Details</span>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="bg-muted/50 rounded-md p-2 text-xs space-y-2 pt-1 relative">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowRecordForm(true)}
                    title="Update Details"
                  >
                    <Edit3 className="h-3 w-3" />
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span style={labelHighlightStyle}>Booked By:</span>
                      <div className="font-medium">{bookingRecord.bookedBy}</div>
                    </div>
                    <div>
                      <span style={labelHighlightStyle}>Amount:</span>
                      <div className="font-medium">₹{bookingRecord.amountCharged}</div>
                    </div>
                  </div>
                  <div>
                    <span style={labelHighlightStyle}>Account Used:</span>
                    <div className="font-medium">{bookingRecord.bookedAccountUsername}</div>
                  </div>
                  <div>
                    <span style={labelHighlightStyle}>Payment Method:</span>
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
            <div className="mb-1" style={labelHighlightStyle}>Created</div>
            <div>{clientFormattedCreatedAt || "..."}</div>
          </div>
          <div className="flex-1 text-xs text-muted-foreground text-right">
            <div className="mb-1" style={labelHighlightStyle}>Last Updated</div>
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
           
           {/* Show Refund Button if applicable */}
           {((booking.status === "Booking Failed (Paid)" || booking.status === "CNF & Cancelled") && !booking.refundDetails) && (
             <Button
                variant="outline"
                size="sm"
                onClick={handleRefundClick}
                className="flex-1 aspect-square p-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                title="Process Refund"
             >
                <Receipt className="h-4 w-4" />
             </Button>
           )}

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
        

        <div className="flex flex-col gap-1.5">
           <Label htmlFor={`status-select-${booking.id}`} className="text-xs" style={labelHighlightStyle}>Update Booking Status:</Label>
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
                    {ALL_BOOKING_STATUSES.filter((statusOption) => {
                      const currentStatus = booking.status;

                      // If Requested - show: Requested, Booked, Booking Failed (Paid), Booking Failed (Unpaid), Missed, User Cancelled
                      if (currentStatus === "Requested") {
                        return ["Requested", "Booked", "Booking Failed (Paid)", "Booking Failed (Unpaid)", "Missed", "User Cancelled"].includes(statusOption);
                      }

                      // If Booked - show: Booked, Requested, CNF & Cancelled
                      if (currentStatus === "Booked") {
                        return ["Booked", "Requested", "CNF & Cancelled"].includes(statusOption);
                      }

                      // If CNF & Cancelled - show: CNF & Cancelled, Requested
                      if (currentStatus === "CNF & Cancelled") {
                        return ["CNF & Cancelled", "Requested"].includes(statusOption);
                      }

                      // If Booking Failed (Unpaid), Missed, User Cancelled - show: current status and Requested
                      if (["Booking Failed (Unpaid)", "Missed", "User Cancelled"].includes(currentStatus)) {
                        return [currentStatus, "Requested"].includes(statusOption);
                      }

                      // If Booking Failed (Paid) - show: current status and Requested (handled in refund flow)
                      if (currentStatus === "Booking Failed (Paid)") {
                        return [currentStatus, "Requested"].includes(statusOption);
                      }

                      // Default fallback
                      return true;
                    }).map((statusOption) => (
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
                {statusToConfirm === "Requested" && booking.status !== "Requested" ? (
                  <>
                    Are you sure you want to revert to "Requested" status for the booking
                    from {booking.source.toUpperCase()} to {booking.destination.toUpperCase()} for {booking.userName}?
                    <span className="block mt-2 font-medium text-amber-600 dark:text-amber-500">
                      This will clear the status reason, handler, and booked details (if any), returning the booking to pending state.
                    </span>
                  </>
                ) : (
                  <>
                    Are you sure you want to change the status to "{statusToConfirm}" for the booking
                    from {booking.source.toUpperCase()} to {booking.destination.toUpperCase()} for {booking.userName}?
                  </>
                )}
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

        <StatusReasonDialog
          open={showReasonDialog}
          onOpenChange={setShowReasonDialog}
          status={statusToConfirm || "Missed"}
          bookingDetails={`${booking.source.toUpperCase()} to ${booking.destination.toUpperCase()} for ${booking.userName}`}
          onConfirm={handleReasonConfirm}
          isLoading={statusUpdateMutation.isPending}
        />

        <Dialog open={showBookedDetailsDialog} onOpenChange={setShowBookedDetailsDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{statusToConfirm === "Booking Failed (Paid)" ? "Add Payment Details" : "Add Booked Details"}</DialogTitle>
            </DialogHeader>
            <BookingRecordForm 
              bookingId={booking.id} 
              onClose={() => setShowBookedDetailsDialog(false)}
              onSave={handleBookedDetailsSuccess}
              hideWrapper={true}
            />
          </DialogContent>
        </Dialog>

        <Dialog open={showRefundDialog} onOpenChange={setShowRefundDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Process Refund</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
                {bookingRecord && (
                    <div className="bg-muted/50 p-3 rounded-md text-sm space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <span className="text-muted-foreground block text-xs">Payment Method</span>
                                <span className="font-medium">{bookingRecord.methodUsed}</span>
                            </div>
                            <div>
                                <span className="text-muted-foreground block text-xs">Account</span>
                                <span className="font-medium">{bookingRecord.bookedAccountUsername}</span>
                            </div>
                        </div>
                        <div>
                            <span className="text-muted-foreground block text-xs">Original Amount</span>
                            <span className="font-medium">₹{bookingRecord.amountCharged}</span>
                        </div>
                        {bookingRecord.methodUsed === "Wallet" && (
                            <div className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 mt-1">
                                <Info className="h-3 w-3" />
                                Refund will be credited back to wallet
                            </div>
                        )}
                    </div>
                )}
                
                <div className="space-y-2">
                    <Label htmlFor="refund-amount">Refund Amount (₹)</Label>
                    <Input
                        id="refund-amount"
                        type="number"
                        placeholder="e.g. 1200"
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        min="0"
                        step="0.01"
                    />
                </div>
                
                <div className="space-y-2">
                    <Label htmlFor="refund-date">Date Received</Label>
                    <Input
                        id="refund-date"
                        type="date"
                        value={refundDate}
                        onChange={(e) => setRefundDate(e.target.value)}
                    />
                </div>
            </div>
            <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowRefundDialog(false)}>Cancel</Button>
                <Button onClick={handleRefundConfirm} disabled={isProcessingRefund}>
                    {isProcessingRefund ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Receipt className="mr-2 h-4 w-4" />}
                    Confirm Refund
                </Button>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog open={showRefundDeleteDialog} onOpenChange={setShowRefundDeleteDialog}>
            <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Delete Refund Details?</AlertDialogTitle>
                <AlertDialogDescription>
                This will remove the refund record from this booking.
                {booking.refundDetails?.method === "Wallet" && (
                    <span className="block mt-2 font-medium text-destructive">
                        Note: This will also revert (deduct) the refunded amount of ₹{booking.refundDetails.amount} from the wallet.
                    </span>
                )}
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                onClick={handleDeleteRefund}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={isProcessingRefund}
                >
                {isProcessingRefund ? "Deleting..." : "Delete Refund"}
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


    
    
