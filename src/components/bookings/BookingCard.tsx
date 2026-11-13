
"use client";

import type { Booking, BookingStatus } from "@/types/booking";
import { ALL_BOOKING_STATUSES } from "@/types/booking";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "./StatusBadge";
import { CalendarDays, Users, AlertTriangle, CheckCircle2, XCircle, Info, UserX, Trash2, Edit3, Share2, Train, Clock, Copy, MessageSquare, Check, X, CreditCard, ArrowRight, Sparkles } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateBookingStatus, deleteBooking, getBookingRecordByBookingId, deleteBookingRecord, updateBookingPaymentTracking, clearBookingCancellations } from "@/lib/firestoreClient";
import type { BookingRecord } from "@/types/bookingRecord";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";

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
import { CancellationsPanel } from "./CancellationsPanel";
import { CancelPassengersDialog } from "./CancelPassengersDialog";
import { getActivePassengers, getCancellations, getCancelledPids, isPartiallyCancelled, isPassengerCancelled } from "@/lib/cancellations";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface BookingCardProps {
  booking: Booking;
  isRefundMode?: boolean;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: (id: string) => void;
  hideActions?: boolean;
  hideSharedDetails?: boolean;
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

export function BookingCard({ booking, isRefundMode = false, selectionMode = false, isSelected = false, onToggleSelection, hideActions = false, hideSharedDetails = false }: BookingCardProps) {
  const labelHighlightStyle = { color: '#AB945E', fontWeight: 700 };
  const sourceDestStyle = { color: '#dfa92a', fontWeight: 700 };
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const router = useRouter();
  const isMobile = useIsMobile();
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
  const [bookingRecord, setBookingRecord] = useState<BookingRecord | null>(null);

  // Cancellation dialog: `all` pre-ticks every travelling passenger (full cancel).
  const [cancelDialog, setCancelDialog] = useState<{ open: boolean; all: boolean }>({ open: false, all: false });

  const cancellations = getCancellations(booking);
  const cancelledPids = getCancelledPids(booking);
  const activePassengers = getActivePassengers(booking);
  const partiallyCancelled = isPartiallyCancelled(booking);

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

  const renderFormattedDate = (dateVal: string | null | undefined) => {
    if (!dateVal || dateVal === "..." || dateVal === "N/A" || dateVal === "Invalid Date" || dateVal === "Error Date") {
      return <span className="text-muted-foreground">{dateVal || "..."}</span>;
    }
    const match = dateVal.match(/^(.*?)(\s*\([A-Za-z]{3}\))$/);
    if (match) {
      return (
        <span className="font-semibold text-foreground">
          {match[1]} <span className="text-amber-500 dark:text-amber-400 font-bold">{match[2].trim()}</span>
        </span>
      );
    }
    return <span className="font-semibold text-foreground">{dateVal}</span>;
  };

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
        queryClient.invalidateQueries({ queryKey: ['booking', updatedBooking.id] });
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

  const paymentTrackingMutation = useMutation({
    mutationFn: (paymentTracking: Pick<Booking, "paymentReceived" | "amountSettled">) =>
      updateBookingPaymentTracking(booking.id, paymentTracking),
    onSuccess: (result, variables) => {
      if (!result.success) {
        toast({
          title: "Error",
          description: result.error || "Failed to update payment tracking.",
          variant: "destructive",
        });
        return;
      }

      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["booking", booking.id] });
      toast({
        title: "Payment Tracking Updated",
        description: variables.paymentReceived !== undefined
          ? `Payment receipt marked as ${variables.paymentReceived ? "completed" : "pending"}.`
          : `Settlement marked as ${variables.amountSettled ? "completed" : "pending"}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to update payment tracking: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleStatusSelect = (newStatus: string) => {
    if (newStatus === "Booked") {
      // Show the booked details dialog
      setStatusToConfirm(newStatus as BookingStatus);
      setShowBookedDetailsDialog(true);
    } else if (newStatus === "CNF & Cancelled" && booking.status === "Booked") {
      // Cancelling a confirmed ticket goes through the cancellation dialog (all
      // travelling passengers pre-ticked) so the refund is captured with it.
      setCancelDialog({ open: true, all: true });
    } else if (newStatus === "Missed" || newStatus === "CNF & Cancelled" || newStatus === "User Cancelled") {
      // Show reason dialog for Missed and Cancelled statuses
      setStatusToConfirm(newStatus as BookingStatus);
      setShowReasonDialog(true);
    } else if (newStatus === "Requested" && booking.status !== "Requested") {
      // Reverting to Requested - need to clean up statusReason, statusHandler, and booking record
      setStatusToConfirm(newStatus as BookingStatus);
      setShowStatusConfirmDialog(true);
    } else {
      // For Booking Failed (Paid) and Booking Failed (Unpaid) - directly update without any dialog
      statusUpdateMutation.mutate({ id: booking.id, status: newStatus as BookingStatus, reason: "", handler: "" });
    }
  };

  const handleBookedDetailsSuccess = (savedHandler?: string) => {
    // Update the status to Booked or Failed (Paid) after record is saved
    const status = statusToConfirm || "Booked";
    statusUpdateMutation.mutate({ id: booking.id, status: status, handler: savedHandler });
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
          // Take back any refund already credited to a wallet before the booking
          // record is deleted: that delete returns the full fare to the wallet,
          // so leaving the refund in place would count the money twice.
          if (cancellations.length > 0 || booking.refundDetails) {
            const clearResult = await clearBookingCancellations(booking.id);
            if (!clearResult.success) {
              throw new Error(clearResult.error || "Could not clear the cancellation details");
            }
            queryClient.invalidateQueries({ queryKey: ["accounts"] });
          }

          // Delete booking record if it exists
          if (bookingRecord) {
            const deleteResult = await deleteBookingRecord(bookingRecord.id);
            if (!deleteResult.success) {
              toast({
                title: "Warning",
                description: `Failed to delete booking record: ${deleteResult.error}`,
                variant: "destructive",
              });
            } else {
              // Handler payment totals and account stats are derived from
              // booking records, so their caches go stale on delete too.
              queryClient.invalidateQueries({ queryKey: ["handlers"] });
              queryClient.invalidateQueries({ queryKey: ["accounts"] });
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

  const handleCopy = () => {
    router.push(`/bookings/new?copyFrom=${booking.id}`);
  };

  const handlePaymentTrackingToggle = (
    field: "paymentReceived" | "amountSettled",
    checked: boolean,
  ) => {
    paymentTrackingMutation.mutate({
      paymentReceived: field === "paymentReceived" ? checked : booking.paymentReceived ?? false,
      amountSettled: field === "amountSettled" ? checked : booking.amountSettled ?? false,
    });
  };

  const handleShare = () => {
    const passengerDetailsText = booking.passengers.map((p, index) => {
      const isChild = p.age >= 5 && p.age <= 11;
      const berthInfo = isChild ? (p.berthRequired ? ' [Berth Required]' : ' [No Berth]') : '';
      const cancelledInfo = partiallyCancelled && isPassengerCancelled(booking, p, cancelledPids) ? ' [CANCELLED]' : '';
      return `${index + 1}. ${p.name} ${p.age} ${p.gender.toUpperCase()}${berthInfo}${cancelledInfo}`;
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
---
Journey Date: ${journeyDateFormatted}
Book By: ${bookingDateFormatted}
---
Type: ${booking.bookingType}
Class: ${booking.classType}
---
Passengers:
${passengerDetailsText}
---
${booking.trainPreference ? `Train Preference: ${booking.trainPreference}` : ''}
${booking.upgradePreferred ? `Upgrade Preferred: Yes` : ''}
---
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

  // Color styling for classnames (e.g. 3A in purple, 2A in sky blue, SL in green, 2S in lightgreen)
  const getClassColorClass = (classType: string): string => {
    if (classType.startsWith('3A')) return 'text-purple-600 dark:text-purple-400';
    if (classType.startsWith('2A')) return 'text-sky-600 dark:text-sky-400';
    if (classType === 'SL') return 'text-emerald-600 dark:text-emerald-400';
    if (classType === '2S') return 'text-lime-600 dark:text-lime-400';
    if (classType.startsWith('1A')) return 'text-rose-600 dark:text-rose-400';
    if (classType.startsWith('3E')) return 'text-teal-600 dark:text-teal-400';
    if (classType.startsWith('EC')) return 'text-orange-600 dark:text-orange-400';
    if (classType.startsWith('CC')) return 'text-cyan-600 dark:text-cyan-400';
    if (classType === 'UR') return 'text-slate-600 dark:text-slate-400';
    return 'text-foreground';
  };

  // Color styling for booking type (G in amber, T in blue/purple for AC, T in green for SL)
  const getTypeColorClass = (bookingType: string, classType: string): string => {
    const isGeneral = ['General', 'Regular'].includes(String(bookingType));
    if (isGeneral) {
      return 'text-amber-700 dark:text-amber-400';
    }

    const isSL = ['SL', 'UR', '2S'].includes(classType);
    if (isSL) {
      return 'text-emerald-600 dark:text-emerald-400';
    }

    // Tatkal AC
    return 'text-primary dark:text-indigo-400';
  };

  // Container border and background for the class badge
  const getBadgeContainerClasses = (bookingType: string, classType: string): string => {
    const isGeneral = ['General', 'Regular'].includes(String(bookingType));
    if (isGeneral) {
      return 'border-amber-500/30 bg-amber-500/10 dark:bg-amber-950/20';
    }

    const isSL = ['SL', 'UR', '2S'].includes(classType);
    if (isSL) {
      return 'border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-950/20';
    }

    return 'border-primary/30 bg-primary/10 dark:bg-primary/20';
  };

  // Determine card background tint based on booking category
  const getBookingCardBackgroundClasses = (bookingType: string, classType: string): string => {
    const isGeneral = ['General', 'Regular'].includes(String(bookingType));
    const isSL = ['SL', 'UR', '2S'].includes(classType);

    if (isGeneral) {
      return "border-2 bg-amber-50/80 border-amber-300 dark:bg-amber-950/30 dark:border-amber-700/50";
    }

    if (isSL) {
      return "border-2 bg-green-50/80 border-green-300 dark:bg-green-950/30 dark:border-green-700/50";
    }

    // Tatkal AC
    return "border-2 bg-blue-50/80 border-blue-300 dark:bg-blue-950/30 dark:border-blue-700/50";
  };

  const compactClass = getCompactClassDisplay(booking.classType);
  const typeChar = ['General', 'Regular'].includes(String(booking.bookingType)) ? 'G' : 'T';
  const displayClass = `${typeChar}-${compactClass}`;
  const typeColorClass = getTypeColorClass(booking.bookingType, booking.classType);
  const classColorClass = getClassColorClass(booking.classType);
  const badgeContainerClasses = getBadgeContainerClasses(booking.bookingType, booking.classType);

  // Background tint based on booking type and class for quick visual identification
  const bookingCardBg = getBookingCardBackgroundClasses(booking.bookingType, booking.classType);

  return (
    <motion.div
      className="h-full min-w-0"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
    >
      <Card className={cn(
        "w-full h-full min-w-0 overflow-hidden shadow-md hover:shadow-lg transition-shadow duration-200 flex flex-col relative",
        bookingCardBg,
        isSelected && "ring-2 ring-primary border-primary"
      )}>
        <CardHeader className="p-3.5 sm:p-5 pb-2 sm:pb-2.5 min-w-0">
          <div className="flex gap-3 items-start">
            {selectionMode && (
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleSelection?.(booking.id)}
                className="mt-2.5 shrink-0"
              />
            )}
            <div className="space-y-1.5 flex-1 min-w-0 relative">
              {/* Status Badge - Top Right with interactive status changer */}
              <div className="absolute top-0 right-0 z-10">
                {!hideActions ? (
                  <Select
                    value={booking.status}
                    onValueChange={handleStatusSelect}
                    disabled={statusUpdateMutation.isPending}
                    name={`status-select-${booking.id}`}
                  >
                    <SelectTrigger className="w-auto h-auto p-0 border-0 bg-transparent shadow-none hover:opacity-85 focus:ring-0 focus:ring-offset-0 cursor-pointer gap-1 rounded-full [&>svg]:opacity-70 [&>svg]:h-3.5 [&>svg]:w-3.5">
                      <div className="inline-flex items-center">
                        <StatusBadge status={booking.status} size="sm" />
                      </div>
                    </SelectTrigger>
                    <SelectContent align="end">
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
                        <SelectItem
                          key={statusOption}
                          value={statusOption}
                          hideIndicator
                          className="data-[state=checked]:bg-primary/15 data-[state=checked]:focus:bg-primary/25"
                        >
                          <div className="flex items-center gap-2">
                            {getStatusIcon(statusOption)}
                            <span>{statusOption}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <StatusBadge status={booking.status} size="sm" />
                )}
              </div>

              {/* First row: Source-Destination with Arrow */}
              <div className="flex min-h-7 items-center gap-2 pr-28 flex-wrap sm:flex-nowrap">
                <CardTitle className="text-xl sm:text-2xl font-bold flex-shrink-0 tracking-tight">
                  <span style={sourceDestStyle}>{booking.source.toUpperCase()}</span>
                </CardTitle>
                <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
                <CardTitle className="text-xl sm:text-2xl font-bold flex-shrink-0 tracking-tight">
                  <span style={sourceDestStyle}>{booking.destination.toUpperCase()}</span>
                </CardTitle>
              </div>

              {/* Second row: For userName and Class display */}
              <div className="flex justify-between items-center gap-2 pt-0.5">
                <CardDescription className="flex-1 min-w-0 text-xs sm:text-sm">
                  For <span className="font-bold text-foreground">{booking.userName}</span>
                  {booking.groupId && (
                    <span className="ml-1.5 inline-flex items-center rounded-full border px-1.5 py-0.2 text-[10px] sm:text-xs font-semibold border-transparent bg-secondary text-secondary-foreground">
                      Grouped
                    </span>
                  )}
                  {partiallyCancelled && (
                    <span
                      className="ml-1.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.2 text-[10px] sm:text-xs font-semibold border-orange-500/30 bg-orange-500/15 text-orange-700 dark:text-orange-300 whitespace-nowrap"
                      title={`${booking.passengers.length - activePassengers.length} of ${booking.passengers.length} passengers cancelled`}
                    >
                      <UserX className="h-3 w-3" />
                      Partly cancelled
                    </span>
                  )}
                </CardDescription>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span
                    className={cn(
                      "text-base sm:text-lg font-bold px-2 py-0.5 rounded-md leading-none border inline-flex items-center select-none",
                      badgeContainerClasses
                    )}
                    title={`${booking.bookingType} - ${booking.classType}`}
                  >
                    <span className={typeColorClass}>{typeChar}</span>
                    <span className="text-muted-foreground/60 mx-0.5 font-medium">-</span>
                    <span className={classColorClass}>{compactClass}</span>
                  </span>
                  {booking.classType.includes("(") && (
                    <span className="text-[10px] text-muted-foreground">
                      {booking.classType.match(/\((.*?)\)/)?.[1]}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-3.5 sm:px-5 py-2 space-y-3 text-sm flex-grow min-w-0">
          <div className="my-1 rounded-xl border border-slate-300/80 dark:border-slate-700/90 bg-white/60 dark:bg-slate-900/50 px-2.5 py-3 sm:px-3 sm:py-3.5 space-y-2 shadow-xs">
            {/* Journey, Book By, Train, Upgrade & Remarks Strip - Left aligned */}
            <div className="grid grid-cols-1 divide-y divide-slate-200/60 dark:divide-slate-800/60 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800/60 overflow-hidden text-xs py-2">
              {/* Journey Date */}
              <div className="flex items-center gap-1.5 px-3 py-1 min-w-0">
                <div className="p-1 rounded-md bg-amber-500/10 text-amber-500/80 dark:text-amber-400/80 shrink-0">
                  <CalendarDays className="h-3.5 w-3.5" />
                </div>
                <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase w-[68px] shrink-0">JOURNEY</span>
                <div className="text-xs sm:text-sm font-semibold text-foreground truncate min-w-0">
                  {renderFormattedDate(clientFormattedJourneyDate)}
                </div>
              </div>

              {/* Book By Date */}
              <div className="flex items-center gap-1.5 px-3 py-1 min-w-0">
                <div className="p-1 rounded-md bg-amber-500/10 text-amber-500/80 dark:text-amber-400/80 shrink-0">
                  <Clock className="h-3.5 w-3.5" />
                </div>
                <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase w-[68px] shrink-0">BOOK BY</span>
                <div className="text-xs sm:text-sm font-semibold text-foreground truncate min-w-0">
                  {renderFormattedDate(clientFormattedBookingDate)}
                </div>
              </div>

              {/* Train (Preference removed) */}
              {booking.trainPreference && (
                <div className="flex items-center gap-1.5 px-3 py-1 min-w-0">
                  <div className="p-1 rounded-md bg-amber-500/10 text-amber-500/80 dark:text-amber-400/80 shrink-0">
                    <Train className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase w-[68px] shrink-0">TRAIN</span>
                  <div className="text-xs sm:text-sm font-semibold text-foreground truncate min-w-0">
                    {booking.trainPreference}
                  </div>
                </div>
              )}

              {/* Upgrade (Preference removed) */}
              {booking.upgradePreferred && (
                <div className="flex items-center gap-1.5 px-3 py-1 min-w-0">
                  <div className="p-1 rounded-md bg-amber-500/10 text-amber-500/80 dark:text-amber-400/80 shrink-0">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase w-[68px] shrink-0">UPGRADE</span>
                  <div className="text-xs sm:text-sm font-semibold text-foreground truncate min-w-0 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                    <span>Yes</span>
                  </div>
                </div>
              )}

              {/* Remarks */}
              {booking.remarks && (
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-3 py-1 min-w-0">
                  <div className="p-1 rounded-md bg-amber-500/10 text-amber-500/80 dark:text-amber-400/80 shrink-0">
                    <MessageSquare className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase w-[68px] shrink-0 leading-5">REMARKS</span>
                  <div className="text-xs sm:text-sm font-semibold text-foreground min-w-[9rem] flex-1 break-words whitespace-pre-wrap">
                    {booking.remarks}
                  </div>
                </div>
              )}
            </div>

            {/* Passengers */}
            <div className="rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800/60 px-3 py-2 text-xs">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="p-1 rounded-md bg-amber-500/10 text-amber-500/80 dark:text-amber-400/80 shrink-0">
                  <Users className="h-3.5 w-3.5" />
                </div>
                <div className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                  {partiallyCancelled
                    ? `PASSENGERS (${activePassengers.length} of ${booking.passengers.length} travelling)`
                    : `PASSENGERS (${booking.passengers.length})`}
                </div>
              </div>
              <div className="space-y-0.5 text-xs sm:text-sm font-semibold pl-7 pt-1">
                    {[...booking.passengers].sort((a, b) => a.name.localeCompare(b.name)).map((passenger, index) => {
                      const isChild = passenger.age >= 5 && passenger.age <= 11;
                      // Only mark individual passengers while part of the ticket is still
                      // valid; a fully cancelled booking already says so in its status.
                      const isCancelled = partiallyCancelled && isPassengerCancelled(booking, passenger, cancelledPids);
                      return (
                        <div key={index} className={cn("flex items-center gap-1.5 flex-wrap", isCancelled && "opacity-70")}>
                          <span className="text-muted-foreground font-normal">{index + 1}.</span>
                          <span className={cn("text-foreground select-all", isCancelled && "line-through")}>{passenger.name}</span>
                          <span className="text-muted-foreground/40 select-none">•</span>
                          <span className="text-amber-500 dark:text-amber-400">{passenger.age}</span>
                          <span className="text-muted-foreground/40 select-none">•</span>
                          <span className="text-cyan-600 dark:text-cyan-400">{passenger.gender.toUpperCase()}</span>
                          {isChild && (
                            passenger.berthRequired ? (
                              <span className="inline-flex items-center gap-0.5 text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap">
                                <CheckCircle2 className="h-2.5 w-2.5" />
                                Berth
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-0.5 text-[10px] bg-red-100 dark:red-900/40 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap">
                                <XCircle className="h-2.5 w-2.5" />
                                No Berth
                              </span>
                            )
                          )}
                          {isCancelled && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] bg-orange-500/15 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap">
                              <UserX className="h-2.5 w-2.5" />
                              Cancelled
                            </span>
                          )}
                        </div>
                      );
                    })}
              </div>
            </div>
          </div>

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

          {cancellations.length > 0 && (
            <CancellationsPanel booking={booking} record={bookingRecord} readOnly={selectionMode} />
          )}

          {/* Prepared Accounts Accordion */}
          {!hideSharedDetails && booking.preparedAccounts && booking.preparedAccounts.length > 0 && (
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="accounts" className="rounded-xl border border-slate-300/80 dark:border-slate-700/90 bg-white/60 dark:bg-slate-900/50 px-3.5 shadow-xs overflow-hidden">
                <AccordionTrigger className="py-2.5 text-sm hover:no-underline">
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    <span className="font-semibold text-foreground">ID(s) for Booking</span>
                    <span className="bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20 text-xs px-2 py-0.5 rounded-full font-semibold">
                      {booking.preparedAccounts.length}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-1 pb-2.5">
                  <div className="space-y-2">
                    {booking.preparedAccounts.map((account, index) => (
                      <div
                        key={index}
                        className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-800/80 p-2.5 text-xs space-y-2 shadow-xs"
                      >
                        <div className="flex justify-between items-center gap-2">
                          <span className="font-semibold text-foreground/90 text-xs">
                            Account #{index + 1}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={cn(
                              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium",
                              account.isMasterAdded
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20"
                                : "bg-muted text-muted-foreground border border-border/40"
                            )}>
                              {account.isMasterAdded ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                              Master
                            </span>
                            <span className={cn(
                              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium",
                              account.isWalletLoaded
                                ? "bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20"
                                : "bg-muted text-muted-foreground border border-border/40"
                            )}>
                              {account.isWalletLoaded ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                              Wallet{account.walletAmount !== undefined ? ` (₹${account.walletAmount.toFixed(2)})` : ''}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1.5 pt-1.5 border-t border-border/40 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground text-[11px] w-12 shrink-0">User:</span>
                            <span className="font-mono font-medium text-foreground select-all">{account.username}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground text-[11px] w-12 shrink-0">Pass:</span>
                            <span className="font-mono font-medium text-foreground bg-muted/60 dark:bg-slate-900/60 px-1.5 py-0.5 rounded select-all">{account.password}</span>
                          </div>
                          {account.handlingBy && (
                            <div className="flex items-center gap-2 pt-0.5">
                              <span className="text-muted-foreground text-[11px] w-12 shrink-0">Handler:</span>
                              <span className="font-medium text-foreground">{account.handlingBy}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}

          {/* Booking Details Accordion */}
          {!hideSharedDetails && bookingRecord && (
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="booking-details" className="rounded-xl border border-emerald-500/30 dark:border-emerald-500/20 bg-emerald-500/[0.04] dark:bg-emerald-950/20 px-3.5 shadow-xs overflow-hidden">
                <AccordionTrigger className="py-2.5 text-sm hover:no-underline">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="font-semibold text-foreground">Booked Details</span>
                    <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 ml-auto mr-1">
                      {bookingRecord.bookedAmount != null ? `₹${bookingRecord.bookedAmount}` : `₹${bookingRecord.amountCharged}`}
                      {typeof bookingRecord.commission === "number" && bookingRecord.commission > 0 && (
                        <span className="ml-1 text-[10px] text-muted-foreground">+ ₹{bookingRecord.commission} (comm)</span>
                      )}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pt-1 pb-2.5">
                  <div className="rounded-lg border border-emerald-500/20 bg-white/90 dark:bg-slate-900/80 p-3 pr-8 text-xs relative shadow-xs">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-6 w-6 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-md"
                      onClick={() => setShowRecordForm(true)}
                      title="Update Details"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </Button>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                      <div className="min-w-0">
                        <span className="text-muted-foreground text-[10px] font-semibold block uppercase tracking-wider">Booked By</span>
                        <div className="font-semibold text-sm text-foreground mt-0.5 truncate">{bookingRecord.bookedBy}</div>
                      </div>
                      <div className="min-w-0">
                        <span className="text-muted-foreground text-[10px] font-semibold block uppercase tracking-wider">Amount</span>
                        <div className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400 mt-0.5">
                          {bookingRecord.bookedAmount != null ? `₹${bookingRecord.bookedAmount}` : `₹${bookingRecord.amountCharged}`}
                          {typeof bookingRecord.commission === "number" && bookingRecord.commission > 0 && (
                            <span className="ml-1 text-[10px] text-muted-foreground font-medium">+ ₹{bookingRecord.commission} (comm)</span>
                          )}
                        </div>
                      </div>

                      <div className="min-w-0 pt-2 border-t border-border/40">
                        <span className="text-muted-foreground text-[10px] font-semibold block uppercase tracking-wider">Account Used</span>
                        <div className="font-mono font-medium text-xs text-foreground mt-0.5 truncate select-all">{bookingRecord.bookedAccountUsername}</div>
                      </div>
                      <div className="min-w-0 pt-2 border-t border-border/40">
                        <span className="text-muted-foreground text-[10px] font-semibold block uppercase tracking-wider">Payment Method</span>
                        <div className="mt-0.5">
                          <span className="inline-flex items-center font-medium text-foreground px-1.5 py-0.5 rounded bg-muted/60 dark:bg-slate-800 text-[11px] border border-border/40">
                            {bookingRecord.methodUsed}
                          </span>
                        </div>
                      </div>

                      {bookingRecord.trainName && (
                        <div className="col-span-2 pt-1 border-t border-border/40">
                          <span className="text-muted-foreground text-[10px] font-semibold block uppercase tracking-wider">Train</span>
                          <div className="font-medium text-xs text-foreground mt-0.5">{bookingRecord.trainName}</div>
                        </div>
                      )}
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
              booking={booking}
              onClose={() => {
                setShowRecordForm(false);
                fetchBookingRecord();
              }}
            />
          </div>
        )}

        <CardFooter className="px-3.5 sm:px-5 pt-3 pb-3.5 flex flex-col items-stretch gap-2.5 border-t min-w-0">
          {/* Created (left) and Updated (right): labels on one row, values on the next */}
          <div className="grid grid-cols-2 gap-x-2 text-[11px] text-muted-foreground px-0.5 min-w-0">
            <div className="min-w-0 break-words">
              <span style={labelHighlightStyle}>Created:</span>
            </div>
            <div className="min-w-0 break-words text-right">
              <span style={labelHighlightStyle}>Updated:</span>
            </div>
            <div className="min-w-0 break-words">
              <span>{clientFormattedCreatedAt || "..."}</span>
            </div>
            <div className="min-w-0 break-words text-right">
              <span>{clientFormattedUpdatedAt || "..."}</span>
            </div>
          </div>

          {!hideActions && (
            <>
              {/* Action buttons with icons only for mobile compatibility */}
              {!isRefundMode ? (
                <div className="flex gap-1.5">
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

                  {/* Cancel some or all passengers of a confirmed ticket */}
                  {booking.status === "Booked" && activePassengers.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCancelDialog({ open: true, all: false })}
                      className="flex-1 aspect-square p-2 text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                      title="Cancel passengers"
                    >
                      <UserX className="h-4 w-4" />
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
              ) : (
                // Refunds tab: the refund actions live in the cancellations panel above.
                <div className="flex justify-end gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowDeleteDialog(true)}
                    className="aspect-square p-2 text-destructive hover:text-destructive"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}


              {/* Payment Tracking (commented out for later enabling) */}
              {/*
              {booking.status === "Booked" && bookingRecord && (
                <TooltipProvider delayDuration={150}>
                  <div className="rounded-md border border-border/60 bg-muted/30 p-3">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={labelHighlightStyle}>
                      Payment Tracking
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5">
                          <Label htmlFor={`payment-received-${booking.id}`} className="text-xs font-medium text-foreground">
                            Payment Received
                          </Label>
                          {isMobile ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  aria-label="Payment received help"
                                  className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground/80"
                                >
                                  <Info className="h-3.5 w-3.5" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent side="top" align="start" className="w-56 p-2.5 text-xs">
                                Mark when payment from the customer is collected.
                              </PopoverContent>
                            </Popover>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  aria-label="Payment received help"
                                  className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground/80"
                                >
                                  <Info className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[220px] text-xs">
                                Mark when payment from the customer is collected.
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <Switch
                          id={`payment-received-${booking.id}`}
                          checked={booking.paymentReceived ?? false}
                          onCheckedChange={(checked) => handlePaymentTrackingToggle("paymentReceived", checked)}
                          disabled={paymentTrackingMutation.isPending}
                          className="border border-[#AB945E]/50 data-[state=checked]:bg-[#AB945E]"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5">
                          <Label htmlFor={`amount-settled-${booking.id}`} className="text-xs font-medium text-foreground">
                            Amount Settled
                          </Label>
                          {isMobile ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button
                                  type="button"
                                  aria-label="Amount settled help"
                                  className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground/80"
                                >
                                  <Info className="h-3.5 w-3.5" />
                                </button>
                              </PopoverTrigger>
                              <PopoverContent side="top" align="start" className="w-56 p-2.5 text-xs">
                                Mark when the amount is settled to whoever booked it.
                              </PopoverContent>
                            </Popover>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  aria-label="Amount settled help"
                                  className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground/80"
                                >
                                  <Info className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[220px] text-xs">
                                Mark when the amount is settled to whoever booked it.
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <Switch
                          id={`amount-settled-${booking.id}`}
                          checked={booking.amountSettled ?? false}
                          onCheckedChange={(checked) => handlePaymentTrackingToggle("amountSettled", checked)}
                          disabled={paymentTrackingMutation.isPending}
                          className="border border-[#AB945E]/50 data-[state=checked]:bg-[#AB945E]"
                        />
                      </div>
                    </div>
                  </div>
                </TooltipProvider>
              )}
              */}
            </>
          )}

          <AlertDialog open={showStatusConfirmDialog} onOpenChange={setShowStatusConfirmDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Status Change</AlertDialogTitle>
                <AlertDialogDescription>
                  {statusToConfirm === "Requested" && booking.status !== "Requested" ? (
                    <>
                      Are you sure you want to revert to &quot;Requested&quot; status for the booking
                      from {booking.source.toUpperCase()} to {booking.destination.toUpperCase()} for {booking.userName}?
                      <span className="block mt-2 font-medium text-amber-600 dark:text-amber-500">
                        This will clear the status reason, handler, and booked details (if any), returning the booking to pending state.
                        {cancellations.length > 0 && " Cancellation and refund details are removed too, and any refund added to a wallet balance is taken back."}
                      </span>
                    </>
                  ) : (
                    <>
                      Are you sure you want to change the status to &quot;{statusToConfirm}&quot; for the booking
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
                booking={booking}
                onClose={() => setShowBookedDetailsDialog(false)}
                onSave={handleBookedDetailsSuccess}
                hideWrapper={true}
              />
            </DialogContent>
          </Dialog>

          <CancelPassengersDialog
            open={cancelDialog.open}
            onOpenChange={(open) => setCancelDialog(prev => ({ ...prev, open }))}
            bookings={[booking]}
            record={bookingRecord}
            preselectAll={cancelDialog.all}
          />

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
    </motion.div>
  );
}













