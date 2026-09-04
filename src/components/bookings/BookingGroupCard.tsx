import { useState, useEffect } from "react";
import { Booking } from "@/types/booking";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Layers, Link2Off, CheckCircle2, CreditCard, Loader2, Share2, Check, X, Edit3 } from "lucide-react";
import { BookingCard } from "./BookingCard";
import { BookingRequirementsSheet } from "./BookingRequirementsSheet";
import { ungroupBookings, updateBookingRequirements, saveBookingRecord, getBookingRecordByBookingId } from "@/lib/firestoreClient";
import { useToast } from "@/hooks/use-toast";
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
import { useRouter } from "next/navigation";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ALL_BOOKING_STATUSES, type BookingStatus } from "@/types/booking";
import { updateGroupBookingStatus } from "@/lib/firestoreClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { StatusReasonDialog } from "./StatusReasonDialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BookingRecordForm } from "./BookingRecordForm";

interface BookingGroupCardProps {
  groupId: string;
  bookings: Booking[];
  selectionMode?: boolean;
  selectedBookingIds?: Set<string>;
  onToggleSelection?: (id: string) => void;
  /** Hide the Ungroup action (view-only surfaces such as the Upcoming Journeys tab). */
  allowUngroup?: boolean;
}

export function BookingGroupCard({ groupId, bookings, selectionMode, selectedBookingIds, onToggleSelection, allowUngroup = true }: BookingGroupCardProps) {
  const [showUngroupDialog, setShowUngroupDialog] = useState(false);
  const [isUngrouping, setIsUngrouping] = useState(false);
  const [showEditRecordForm, setShowEditRecordForm] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const totalPassengers = bookings.reduce((sum, b) => sum + b.passengers.length, 0);
  const uniqueSources = Array.from(new Set(bookings.map(b => b.source)));
  const uniqueDestinations = Array.from(new Set(bookings.map(b => b.destination)));
  const classes = Array.from(new Set(bookings.map(b => b.classType)));
  
  // Check if all bookings have the same prepared accounts (shared)
  // Logic: Check if *any* booking has prepared accounts. 
  // Ideally for a group, they should be consistent, but we show if available.
  const hasSharedPreparedAccounts = bookings.some(b => b.preparedAccounts && b.preparedAccounts.length > 0);
  const firstBookingWithAccounts = bookings.find(b => b.preparedAccounts && b.preparedAccounts.length > 0) || bookings[0];
  
  const [groupBookingDetails, setGroupBookingDetails] = useState<{
    bookedBy: string;
    bookedAccountUsername: string;
    totalAmount: number;
    methodUsed: string;
    splitByBooking: { bookingId: string; bookingFor: string; passengers: number; amountCharged: number }[];
  } | null>(null);
  const [isLoadingGroupBookingDetails, setIsLoadingGroupBookingDetails] = useState(false);

  const fetchGroupDetails = async () => {
    try {
      setIsLoadingGroupBookingDetails(true);
      
      // Try to fetch a single group record first (by checking first booking)
      const firstRecord = await getBookingRecordByBookingId(bookings[0].id);
      
      if (!firstRecord) {
        setGroupBookingDetails(null);
        return;
      }

      // If it's a group record (has bookingIds array), use it directly
      if (firstRecord.bookingIds && firstRecord.bookingIds.length > 0) {
        // Calculate split based on passenger counts
        const splitByBooking = bookings.map(booking => ({
          bookingId: booking.id,
          bookingFor: booking.userName,
          passengers: booking.passengers.length,
          amountCharged: 0, // Will be calculated below
        }));
        
        // Calculate amount per passenger for proportional split display
        const totalPassengers = bookings.reduce((sum, b) => sum + b.passengers.length, 0);
        const amountPerPassenger = firstRecord.amountCharged / totalPassengers;
        
        splitByBooking.forEach(item => {
          item.amountCharged = Number((amountPerPassenger * item.passengers).toFixed(2));
        });

        setGroupBookingDetails({
          bookedBy: firstRecord.bookedBy,
          bookedAccountUsername: firstRecord.bookedAccountUsername,
          totalAmount: Number(firstRecord.amountCharged.toFixed(2)),
          methodUsed: firstRecord.methodUsed,
          splitByBooking,
        });
      } else {
        // Legacy individual records - fetch all and combine
        const records = await Promise.all(
          bookings.map(b => getBookingRecordByBookingId(b.id))
        );

        const valid = records
          .map((record, idx) => ({ record, booking: bookings[idx] }))
          .filter(x => x.record !== null) as { record: any; booking: Booking }[];

        if (valid.length === 0) {
          setGroupBookingDetails(null);
          return;
        }

        const totalAmount = valid.reduce((sum, x) => sum + (x.record.amountCharged || 0), 0);
        const legacyFirstRecord = valid[0].record;
        const splitByBooking = valid.map(x => ({
          bookingId: x.booking.id,
          bookingFor: x.booking.userName,
          passengers: x.booking.passengers.length,
          amountCharged: Number((x.record.amountCharged || 0).toFixed(2)),
        }));

        setGroupBookingDetails({
          bookedBy: legacyFirstRecord.bookedBy,
          bookedAccountUsername: legacyFirstRecord.bookedAccountUsername,
          totalAmount: Number(totalAmount.toFixed(2)),
          methodUsed: legacyFirstRecord.methodUsed,
          splitByBooking,
        });
      }
    } catch (error) {
      console.error("Failed to fetch group booking details", error);
    } finally {
      setIsLoadingGroupBookingDetails(false);
    }
  };

  useEffect(() => {
    fetchGroupDetails();
  }, [bookings]);

  const hasGroupBookedDetails = !!groupBookingDetails;

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString + "T12:00:00"), "MMM dd, yyyy (EEE)");
    } catch {
      return "N/A";
    }
  };

  const copyToClipboard = async (text: string) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        toast({ title: "Copied to Clipboard", description: "Group booking details copied." });
      } catch {
        fallbackCopyToClipboard(text);
      }
    } else {
      fallbackCopyToClipboard(text);
    }
  };

  const fallbackCopyToClipboard = (text: string) => {
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
        toast({ title: "Copied to Clipboard", description: "Group booking details copied." });
      } else {
        toast({ title: "Copy Failed", description: "Could not copy details to clipboard.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Copy Failed", description: "Could not copy details to clipboard.", variant: "destructive" });
    }
  };

  const handleShare = () => {
    const formatBookingDate = (date: string) => {
      const formattedDate = formatDate(date);
      return formattedDate !== "N/A" ? formattedDate : (date || "N/A");
    };

    const combineValues = (values: string[]) =>
      Array.from(new Set(values.filter(Boolean))).join(", ") || "N/A";

    const passengerDetailsText = bookings
      .flatMap(booking => booking.passengers)
      .map((passenger, index) => {
        const isChild = passenger.age >= 5 && passenger.age <= 11;
        const berthInfo = isChild ? (passenger.berthRequired ? " [Berth Required]" : " [No Berth]") : "";
        return `${index + 1}. ${passenger.name} ${passenger.age} ${passenger.gender.toUpperCase()}${berthInfo}`;
      })
      .join("\n");

    const trainPreference = combineValues(bookings.map(b => b.trainPreference || ""));
    const remarks = combineValues(bookings.map(b => b.remarks || ""));
    const preferencesText = [
      trainPreference !== "N/A" ? `Train Preference: ${trainPreference}` : "",
      bookings.some(b => b.upgradePreferred) ? "Upgrade Preferred: Yes" : "",
    ].filter(Boolean).join("\n");

    let preparedAccountsText = "";
    if (firstBookingWithAccounts.preparedAccounts && firstBookingWithAccounts.preparedAccounts.length > 0) {
      const accountsDetails = firstBookingWithAccounts.preparedAccounts.map((acc, index) => {
        const handlingInfo = acc.handlingBy ? ` | Handler: ${acc.handlingBy}` : "";
        const walletInfo = acc.walletAmount !== undefined ? ` (₹${acc.walletAmount.toFixed(2)})` : "";
        return `${index + 1}. ${acc.username} | ${acc.password} | Master: ${acc.isMasterAdded ? "✅" : "❌"} | Wallet: ${acc.isWalletLoaded ? "✅" : "❌"}${walletInfo}${handlingInfo}`;
      }).join("\n");
      preparedAccountsText = `\n---\nAccounts:\n${accountsDetails}`;
    }

    let bookedDetailsText = "";
    if (groupBookingDetails) {
      const splitLines = groupBookingDetails.splitByBooking
        .map(x => `• ${x.bookingFor} (${x.passengers} pax): ₹${x.amountCharged.toFixed(2)}`)
        .join("\n");

      bookedDetailsText = `\n---\nBooked details:\nBooked by: ${groupBookingDetails.bookedBy}\nAccount: ${groupBookingDetails.bookedAccountUsername}\nPayment: ${groupBookingDetails.methodUsed} | Total: ₹${groupBookingDetails.totalAmount.toFixed(2)}\nSplit:\n${splitLines}`;
    }

    const groupDetailsText = `
*GROUP BOOKING*
From: ${combineValues(bookings.map(b => b.source.toUpperCase()))}
To: ${combineValues(bookings.map(b => b.destination.toUpperCase()))}
---
Journey Date: ${combineValues(bookings.map(b => formatBookingDate(b.journeyDate)))}
Book By: ${combineValues(bookings.map(b => formatBookingDate(b.bookingDate)))}
---
Type: ${combineValues(bookings.map(b => b.bookingType))}
Class: ${combineValues(bookings.map(b => b.classType))}
---
Passengers:
${passengerDetailsText}${preferencesText ? `\n---\n${preferencesText}` : ""}${remarks !== "N/A" ? `\n---\nRemarks: ${remarks}` : ""}${preparedAccountsText}${bookedDetailsText}
    `.trim().replace(/^\n+|\n+$/g, "").replace(/\n\n+/g, "\n");

    if (navigator.share) {
      navigator.share({
        title: `Group Booking: ${uniqueSources.join(", ").toUpperCase()} to ${uniqueDestinations.join(", ").toUpperCase()}`,
        text: groupDetailsText,
      })
        .then(() => {
          toast({ title: "Booking Shared", description: "Details sent successfully." });
        })
        .catch((error: any) => {
          if (error?.name !== "AbortError") {
            copyToClipboard(groupDetailsText);
          }
        });
    } else {
      copyToClipboard(groupDetailsText);
    }
  };

  const handleUngroup = async () => {
    setIsUngrouping(true);
    try {
      // Pass bookings data so ungroupBookings can calculate proportional amounts
      const result = await ungroupBookings(groupId, bookings);
      if (result.success) {
        toast({ title: "Group Dissolved", description: "Bookings have been ungrouped." });
        router.refresh();
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to ungroup.", variant: "destructive" });
    } finally {
      setIsUngrouping(false);
      setShowUngroupDialog(false);
    }
  };

  // Handle saving prepared accounts for the entire group
  const handleSaveGroupRequirements = async (preparedAccounts: any[]) => {
    try {
      // Update all bookings in the group with the same prepared accounts
      const promises = bookings.map(booking => 
        updateBookingRequirements(booking.id, preparedAccounts)
      );
      await Promise.all(promises);
      toast({ title: "Requirements Updated", description: "Shared requirements saved for all bookings in group." });
      router.refresh();
      return { success: true };
    } catch (error) {
      toast({ title: "Error", description: "Failed to update requirements.", variant: "destructive" });
      return { success: false, error: "Failed to update" };
    }
  };


  return (
    <div className="sk-card w-full min-w-0 overflow-hidden">
      <div className="p-4 flex flex-col gap-4">
        <div className="flex justify-between items-start">
          <div className="flex gap-3 items-center">
             <span className="sk-coin sk-metal-steel h-10 w-10">
                <Layers className="h-5 w-5" />
             </span>
             <div>
                <div className="sk-gold-text text-lg font-extrabold tracking-wide">Group Booking</div>
                <div className="text-xs opacity-80">
                  {bookings.length} Bookings • {totalPassengers} Passengers
                </div>
             </div>
          </div>
          <div className="flex gap-2">
            {!selectionMode && (
              <Button
                variant="skeuo-steel"
                size="sm"
                onClick={handleShare}
                className="h-8 w-8 px-0 justify-center"
                title="Share"
              >
                <Share2 className="h-5 w-5" />
              </Button>
            )}
            {!selectionMode && allowUngroup && (
                <Button
                  variant="skeuo-copper"
                  size="sm"
                  onClick={() => setShowUngroupDialog(true)}
                  className="h-8 w-8 px-0 justify-center text-[#5a1f14]"
                  title="Ungroup"
              >
                  <Link2Off className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
             <span className="sk-chip text-xs">{uniqueSources.join(", ")} → {uniqueDestinations.join(", ")}</span>
             {classes.map(c => <span key={c} className="sk-coin sk-metal-steel h-6 px-2.5 text-xs font-bold">{c}</span>)}
        </div>
      </div>

      {/* Individual Bookings List */}
      <CardContent className="p-3 sm:p-4 space-y-4 border-t border-black/25">
        <h4 className="sk-label font-medium text-sm uppercase mb-2">Individual Bookings</h4>
        {bookings.map(booking => (
          <BookingCard 
            key={booking.id} 
            booking={booking}
            selectionMode={selectionMode}
            isSelected={selectedBookingIds?.has(booking.id)}
            onToggleSelection={onToggleSelection}
            hideActions={true} // Hide actions on individual cards when in group
            hideSharedDetails={true} // Hide shared details (IDs, Booked Details) - shown at group level
          />
        ))}
      </CardContent>

      {/* Shared Actions Section */}
      <CardContent className="p-3 sm:p-4 border-t border-black/25 grid grid-cols-1 gap-4">
        
        {/* Shared Prepared Accounts Section */}
        <div className="flex flex-col h-full">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="group-ids" className="sk-well px-3.5 overflow-hidden">
              <AccordionTrigger className="py-2.5 text-sm hover:no-underline">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-purple-700" />
                  <span className="font-semibold">ID(s) for Booking</span>
                  {hasSharedPreparedAccounts && (
                    <span className="bg-purple-500/20 text-purple-900 border border-purple-700/30 text-xs px-2 py-0.5 rounded-full font-semibold">
                      {firstBookingWithAccounts.preparedAccounts?.length}
                    </span>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-1 pb-2.5">
                <div
                  className="flex items-center justify-end gap-2 pb-2"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <BookingRequirementsSheet
                    booking={{ ...firstBookingWithAccounts, id: groupId }}
                    iconComponent={CreditCard}
                    isGroupMode={true}
                    groupBookings={bookings}
                    onSaveGroup={handleSaveGroupRequirements}
                    className="flex-none w-auto aspect-auto px-3"
                    buttonVariant="skeuo-steel"
                  />
                </div>
                {hasSharedPreparedAccounts ? (
                  <div className="space-y-2">
                    {firstBookingWithAccounts.preparedAccounts?.map((account, index) => (
                      <div
                        key={index}
                        className="sk-panel p-2.5 text-xs space-y-2"
                      >
                        <div className="flex justify-between items-center gap-2">
                          <span className="font-semibold opacity-90 text-xs">
                            Account #{index + 1}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={cn(
                              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium",
                              account.isMasterAdded
                                ? "bg-emerald-200/70 text-emerald-900 border border-emerald-700/30"
                                : "bg-black/10 text-black/60 border border-black/20"
                            )}>
                              {account.isMasterAdded ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                              Master
                            </span>
                            <span className={cn(
                              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium",
                              account.isWalletLoaded
                                ? "bg-blue-200/70 text-blue-900 border border-blue-700/30"
                                : "bg-black/10 text-black/60 border border-black/20"
                            )}>
                              {account.isWalletLoaded ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                              Wallet{account.walletAmount !== undefined ? ` (₹${account.walletAmount.toFixed(2)})` : ''}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1.5 pt-1.5 border-t border-black/10 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="opacity-60 text-[11px] w-12 shrink-0">User:</span>
                            <span className="font-mono font-medium select-all">{account.username}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="opacity-60 text-[11px] w-12 shrink-0">Pass:</span>
                            <span className="font-mono font-medium bg-black/10 px-1.5 py-0.5 rounded select-all">{account.password}</span>
                          </div>
                          {account.handlingBy && (
                            <div className="flex items-center gap-2 pt-0.5">
                              <span className="opacity-60 text-[11px] w-12 shrink-0">Handler:</span>
                              <span className="font-medium">{account.handlingBy}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center p-4 text-center border-2 border-dashed border-black/20 rounded-md bg-black/5">
                    <CreditCard className="h-8 w-8 opacity-30 mb-2" />
                    <p className="text-sm opacity-70">No accounts added yet</p>
                    <p className="text-xs opacity-50 mt-1">Add accounts to process this group booking</p>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {/* Shared Booked Details Section */}
        <div className="flex flex-col h-full min-w-0">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="group-booked-details" className="sk-well px-3.5 overflow-hidden">
              <AccordionTrigger className="py-2.5 text-sm hover:no-underline">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                  <span className="font-semibold">Booked Details</span>
                  {groupBookingDetails && (
                    <span className="text-xs font-mono font-bold text-emerald-700 ml-auto mr-1">
                      ₹{groupBookingDetails.totalAmount.toFixed(2)}
                    </span>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-1 pb-2.5">
                {isLoadingGroupBookingDetails ? (
                  <div className="h-full flex items-center justify-center p-6 text-sm opacity-70">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Loading…
                  </div>
                ) : hasGroupBookedDetails ? (
                  <div className="space-y-3">
                    <div className="sk-panel flex items-center justify-between p-2">
                      <span className="text-xs font-medium text-emerald-800 flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Status: Booked
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="sk-chip text-xs">
                          {bookings.length} Bookings
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-60 hover:opacity-100"
                          onClick={() => setShowEditRecordForm(true)}
                          title="Edit Booked Details"
                        >
                          <Edit3 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="min-w-0 space-y-1">
                        <span className="opacity-60 block">Booked By</span>
                        <span className="font-medium truncate block" title={groupBookingDetails!.bookedBy}>
                          {groupBookingDetails!.bookedBy}
                        </span>
                      </div>
                      <div className="min-w-0 space-y-1">
                        <span className="opacity-60 block">Total Amount</span>
                        <span className="font-medium">₹{groupBookingDetails!.totalAmount.toFixed(2)}</span>
                      </div>
                      <div className="min-w-0 space-y-1">
                        <span className="opacity-60 block">Account Used</span>
                        <span className="font-medium truncate block" title={groupBookingDetails!.bookedAccountUsername}>
                          {groupBookingDetails!.bookedAccountUsername}
                        </span>
                      </div>
                      <div className="min-w-0 space-y-1">
                        <span className="opacity-60 block">Payment Method</span>
                        <span className="font-medium">{groupBookingDetails!.methodUsed}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-medium opacity-80">Split per booking</div>
                      <div className="space-y-2">
                        {groupBookingDetails!.splitByBooking.map(x => (
                          <div key={x.bookingId} className="sk-panel flex items-center justify-between px-3 py-2 text-xs">
                            <span className="opacity-60">
                              {x.passengers} pax • {x.bookingFor}
                            </span>
                            <span className="font-medium">₹{x.amountCharged.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="text-xs text-center opacity-60 border-t border-black/10 pt-2">
                      Details are applied to all bookings in this group.
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center p-4 text-center border-2 border-dashed border-black/20 rounded-md bg-black/5">
                    <CheckCircle2 className="h-8 w-8 opacity-30 mb-2" />
                    <p className="text-sm opacity-70">Not booked yet</p>
                    <p className="text-xs opacity-50 mt-1">Add details once tickets are confirmed</p>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </CardContent>

      {/* Group Status Update Section */}
      <CardContent className="p-3 sm:p-4 border-t border-black/25">
        <GroupStatusUpdate bookings={bookings} groupId={groupId} />
      </CardContent>

      {/* Ungroup Dialog */}
      <AlertDialog open={showUngroupDialog} onOpenChange={setShowUngroupDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ungroup Bookings?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the grouping and return all {bookings.length} bookings to individual cards. Original booking data is preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUngroup} disabled={isUngrouping}>
              {isUngrouping ? "Ungrouping..." : "Confirm Ungroup"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Booked Details Dialog */}
      <Dialog open={showEditRecordForm} onOpenChange={setShowEditRecordForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Booked Details</DialogTitle>
          </DialogHeader>
          <BookingRecordForm 
            bookingId={bookings[0].id} 
            onClose={() => {
              setShowEditRecordForm(false);
              fetchGroupDetails();
            }}
            onSave={() => {
              setShowEditRecordForm(false);
              fetchGroupDetails();
            }}
            hideWrapper={true}
            isGroupMode={true}
            groupBookings={bookings}
            groupId={groupId}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Sub-component for group status update
interface GroupStatusUpdateProps {
  bookings: Booking[];
  groupId: string;
}

function GroupStatusUpdate({ bookings, groupId }: GroupStatusUpdateProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showStatusConfirmDialog, setShowStatusConfirmDialog] = useState(false);
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  const [showBookedDetailsDialog, setShowBookedDetailsDialog] = useState(false);
  const [statusToConfirm, setStatusToConfirm] = useState<BookingStatus | null>(null);

  // Get the common status (if all bookings have the same status)
  const uniqueStatuses = Array.from(new Set(bookings.map(b => b.status)));
  const currentStatus = uniqueStatuses.length === 1 ? uniqueStatuses[0] : "Mixed";

  const statusUpdateMutation = useMutation({
    mutationFn: async ({
      status,
      reason,
      handler,
    }: {
      status: BookingStatus;
      reason?: string;
      handler?: string;
    }) => {
      const bookingIds = bookings.map(b => b.id);
      return await updateGroupBookingStatus(bookingIds, status, reason, handler);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      
      if (result.success) {
        toast({
          title: "Status Updated",
          description: `Updated status for ${bookings.length} bookings in group.`,
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
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Failed to update status: ${error.message}`,
        variant: "destructive",
      });
      setShowStatusConfirmDialog(false);
      setStatusToConfirm(null);
    },
  });

  const handleStatusSelect = (newStatus: string) => {
    if (newStatus === "Booked") {
      // Show the booked details dialog
      setStatusToConfirm(newStatus as BookingStatus);
      setShowBookedDetailsDialog(true);
    } else if (newStatus === "Missed" || newStatus === "CNF & Cancelled" || newStatus === "User Cancelled") {
      // Show reason dialog for Missed and Cancelled statuses
      setStatusToConfirm(newStatus as BookingStatus);
      setShowReasonDialog(true);
    } else if (newStatus === "Requested" && currentStatus !== "Requested") {
      // Reverting to Requested
      setStatusToConfirm(newStatus as BookingStatus);
      setShowStatusConfirmDialog(true);
    } else {
      // For Booking Failed (Paid) and Booking Failed (Unpaid) - directly update without any dialog
      setStatusToConfirm(newStatus as BookingStatus);
      statusUpdateMutation.mutate({ status: newStatus as BookingStatus, reason: "", handler: "" });
      setStatusToConfirm(null);
    }
  };

  const handleReasonConfirm = (reason: string, handler?: string) => {
    if (statusToConfirm) {
      statusUpdateMutation.mutate({ status: statusToConfirm, reason, handler });
      setShowReasonDialog(false);
      setStatusToConfirm(null);
    }
  };

  const handleBookedDetailsSuccess = () => {
    // Update the status to Booked or Failed (Paid) after record is saved
    if (statusToConfirm) {
      statusUpdateMutation.mutate({ status: statusToConfirm });
    }
    setShowBookedDetailsDialog(false);
    setStatusToConfirm(null);
  };

  const handleConfirmStatusUpdate = () => {
    if (statusToConfirm) {
      statusUpdateMutation.mutate({ status: statusToConfirm, reason: "", handler: "" });
    }
  };

  // Get first booking for reference
  const firstBooking = bookings[0];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs" style={{ color: '#AB945E', fontWeight: 700 }}>
          Update Group Booking Status:
        </Label>
        <Select
          value={currentStatus === "Mixed" ? undefined : currentStatus}
          onValueChange={handleStatusSelect}
          disabled={statusUpdateMutation.isPending}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={currentStatus === "Mixed" ? "Mixed Status" : "Update status"} />
          </SelectTrigger>
          <SelectContent>
            {ALL_BOOKING_STATUSES.filter((statusOption) => {
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

              // If Booking Failed (Paid) - show: current status and Requested
              if (currentStatus === "Booking Failed (Paid)") {
                return [currentStatus, "Requested"].includes(statusOption);
              }

              // For Mixed status, show all options
              return true;
            }).map((statusOption) => (
              <SelectItem
                key={statusOption}
                value={statusOption}
                hideIndicator
                className="data-[state=checked]:bg-primary/15 data-[state=checked]:focus:bg-primary/25"
              >
                {statusOption}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Status Confirmation Dialog */}
      <AlertDialog open={showStatusConfirmDialog} onOpenChange={setShowStatusConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Status Change</AlertDialogTitle>
            <AlertDialogDescription>
              {statusToConfirm === "Requested" && currentStatus !== "Requested" ? (
                <>
                  Are you sure you want to revert to "Requested" status for all {bookings.length} bookings in this group?
                  <span className="block mt-2 font-medium text-amber-600 dark:text-amber-500">
                    This will clear the status reason, handler, and booked details (if any), returning all bookings to pending state.
                  </span>
                </>
              ) : (
                <>
                  Are you sure you want to change the status to "{statusToConfirm}" for all {bookings.length} bookings in this group?
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

      {/* Status Reason Dialog */}
      <StatusReasonDialog
        open={showReasonDialog}
        onOpenChange={setShowReasonDialog}
        status={statusToConfirm || "Missed"}
        bookingDetails={`Group of ${bookings.length} bookings`}
        onConfirm={handleReasonConfirm}
        isLoading={statusUpdateMutation.isPending}
      />

      {/* Booked Details Dialog */}
      <Dialog open={showBookedDetailsDialog} onOpenChange={setShowBookedDetailsDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{statusToConfirm === "Booking Failed (Paid)" ? "Add Payment Details" : "Add Booked Details"}</DialogTitle>
          </DialogHeader>
          <BookingRecordForm 
            bookingId={firstBooking.id} 
            onClose={() => setShowBookedDetailsDialog(false)}
            onSave={handleBookedDetailsSuccess}
            hideWrapper={true}
            isGroupMode={true}
            groupBookings={bookings}
            groupId={groupId}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

