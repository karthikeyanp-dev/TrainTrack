import { useState, useEffect } from "react";
import { Booking } from "@/types/booking";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layers, Link2Off, CheckCircle2, CreditCard, Loader2, Share2, Check } from "lucide-react";
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

interface BookingGroupCardProps {
  groupId: string;
  bookings: Booking[];
  selectionMode?: boolean;
  selectedBookingIds?: Set<string>;
  onToggleSelection?: (id: string) => void;
}

export function BookingGroupCard({ groupId, bookings, selectionMode, selectedBookingIds, onToggleSelection }: BookingGroupCardProps) {
  const [showUngroupDialog, setShowUngroupDialog] = useState(false);
  const [isUngrouping, setIsUngrouping] = useState(false);
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
  
  const [showBookedDetailsDialog, setShowBookedDetailsDialog] = useState(false);
  const [groupBookingDetails, setGroupBookingDetails] = useState<{
    bookedBy: string;
    bookedAccountUsername: string;
    totalAmount: number;
    methodUsed: string;
    splitByBooking: { bookingId: string; bookingFor: string; passengers: number; amountCharged: number }[];
  } | null>(null);
  const [isLoadingGroupBookingDetails, setIsLoadingGroupBookingDetails] = useState(false);

  useEffect(() => {
    const fetchGroupDetails = async () => {
      try {
        setIsLoadingGroupBookingDetails(true);
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
        const firstRecord = valid[0].record;
        const splitByBooking = valid.map(x => ({
          bookingId: x.booking.id,
          bookingFor: x.booking.userName,
          passengers: x.booking.passengers.length,
          amountCharged: Number((x.record.amountCharged || 0).toFixed(2)),
        }));

          setGroupBookingDetails({
            bookedBy: firstRecord.bookedBy,
            bookedAccountUsername: firstRecord.bookedAccountUsername,
            totalAmount: Number(totalAmount.toFixed(2)),
            methodUsed: firstRecord.methodUsed,
            splitByBooking,
          });
      } catch (error) {
        console.error("Failed to fetch group booking details", error);
      } finally {
        setIsLoadingGroupBookingDetails(false);
      }
    };

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
    const bookingsText = bookings.map((b, index) => {
      const passengerDetailsText = b.passengers.map((p, pIndex) => {
        const isChild = p.age >= 5 && p.age <= 11;
        const berthInfo = isChild ? (p.berthRequired ? " [Berth Required]" : " [No Berth]") : "";
        return `${pIndex + 1}. ${p.name} ${p.age} ${p.gender.toUpperCase()}${berthInfo}`;
      }).join("\n");

      const formattedJourney = formatDate(b.journeyDate);
      const journeyDateFormatted = formattedJourney !== "N/A" ? formattedJourney : (b.journeyDate || "N/A");
      const formattedBooking = formatDate(b.bookingDate);
      const bookingDateFormatted = formattedBooking !== "N/A" ? formattedBooking : (b.bookingDate || "N/A");

      return `Booking ${index + 1} (For ${b.userName}):\nFrom: ${b.source.toUpperCase()}\nTo: ${b.destination.toUpperCase()}\nJourney Date: ${journeyDateFormatted}\nBook By: ${bookingDateFormatted}\nType: ${b.bookingType}\nClass: ${b.classType}\nPassengers:\n${passengerDetailsText}${b.trainPreference ? `\nTrain Preference: ${b.trainPreference}` : ""}${b.remarks ? `\nRemarks: ${b.remarks}` : ""}`;
    }).join("\n-\n");

    let preparedAccountsText = "";
    if (firstBookingWithAccounts.preparedAccounts && firstBookingWithAccounts.preparedAccounts.length > 0) {
      const accountsDetails = firstBookingWithAccounts.preparedAccounts.map((acc, index) => {
        const handlingInfo = acc.handlingBy ? ` | Handler: ${acc.handlingBy}` : "";
        const walletInfo = acc.walletAmount !== undefined ? ` (₹${acc.walletAmount.toFixed(2)})` : "";
        return `${index + 1}. ${acc.username} | ${acc.password} | Master: ${acc.isMasterAdded ? "✅" : "❌"} | Wallet: ${acc.isWalletLoaded ? "✅" : "❌"}${walletInfo}${handlingInfo}`;
      }).join("\n");
      preparedAccountsText = `\n-\nID(s) for Booking (Shared):\n${accountsDetails}`;
    }

    let bookedDetailsText = "";
    if (groupBookingDetails) {
      const splitLines = groupBookingDetails.splitByBooking
        .map(x => `- ${x.bookingFor} (${x.passengers} pax): ₹${x.amountCharged.toFixed(2)}`)
        .join("\n");

      bookedDetailsText = `\n-\nBooked Details (Shared):\nBooked By: ${groupBookingDetails.bookedBy}\nAccount Used: ${groupBookingDetails.bookedAccountUsername}\nPayment Method: ${groupBookingDetails.methodUsed}\nTotal Amount: ₹${groupBookingDetails.totalAmount.toFixed(2)}\nSplit:\n${splitLines}`;
    }

    const groupDetailsText = `
Group Booking Details:
----------------------
Bookings: ${bookings.length}
Total Passengers: ${totalPassengers}
Route: ${uniqueSources.join(", ").toUpperCase()} → ${uniqueDestinations.join(", ").toUpperCase()}
Classes: ${classes.join(", ")}
----------------------
${bookingsText}${preparedAccountsText}${bookedDetailsText}
----------------------
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
      const result = await ungroupBookings(groupId);
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

  // Handle saving booking record for the entire group
  const handleSaveGroupRecord = async (data: any) => {
    try {
      const totalPassengers = bookings.reduce((sum, b) => sum + b.passengers.length, 0);
      const amountPerPassenger = data.amountCharged / totalPassengers;

      // Save the same booking record for all bookings in the group, but split amount by passenger count
      const promises = bookings.map(booking => {
        const bookingShare = amountPerPassenger * booking.passengers.length;
        return saveBookingRecord({
          bookingId: booking.id,
          bookedBy: data.bookedBy,
          bookedAccountUsername: data.bookedAccountUsername,
          amountCharged: Number(bookingShare.toFixed(2)), // Round to 2 decimals
          methodUsed: data.methodUsed,
        });
      });
      const results = await Promise.all(promises);
      const allSuccess = results.every(r => r.success);
      
      if (allSuccess) {
        const splitByBooking = bookings.map(b => ({
          bookingId: b.id,
          bookingFor: b.userName,
          passengers: b.passengers.length,
          amountCharged: Number((amountPerPassenger * b.passengers.length).toFixed(2)),
        }));
        const totalAmount = splitByBooking.reduce((sum, x) => sum + x.amountCharged, 0);
        setGroupBookingDetails({
          bookedBy: data.bookedBy,
          bookedAccountUsername: data.bookedAccountUsername,
          totalAmount: Number(totalAmount.toFixed(2)),
          methodUsed: data.methodUsed,
          splitByBooking,
        });
        toast({ title: "Booked Details Saved", description: `Saved for all ${bookings.length} bookings in group. Amount split by passenger count.` });
        setShowBookedDetailsDialog(false);
        router.refresh();
        return { success: true };
      } else {
        throw new Error("Some bookings failed to save");
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to save booked details.", variant: "destructive" });
      return { success: false, error: "Failed to save" };
    }
  };

  return (
    <Card className="w-full border-2 border-primary/20 overflow-hidden">
      {/* Header Section */}
      <div className="bg-muted/30 p-4 flex flex-col gap-4">
        <div className="flex justify-between items-start">
          <div className="flex gap-3 items-center">
             <div className="bg-primary/10 p-2 rounded-full">
                <Layers className="h-6 w-6 text-primary" />
             </div>
             <div>
                <CardTitle className="text-lg">Group Booking</CardTitle>
                <CardDescription>
                  {bookings.length} Bookings • {totalPassengers} Passengers
                </CardDescription>
             </div>
          </div>
          <div className="flex gap-2">
            {!selectionMode && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleShare}
                className="h-8 w-8 sm:w-auto px-0 sm:px-2 justify-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary hover:text-primary"
              >
                <Share2 className="h-5 w-5 sm:mr-1" />
                <span className="hidden sm:inline">Share</span>
              </Button>
            )}
            {!selectionMode && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowUngroupDialog(true)} 
                className="h-8 w-8 sm:w-auto px-0 sm:px-2 justify-center gap-2 bg-destructive/15 hover:bg-destructive/25 text-[hsl(0_50%_53%)] hover:text-[hsl(0_50%_53%)] border border-destructive/30 hover:border-destructive/50"
              >
                  <Link2Off className="h-5 w-5 sm:mr-1 text-[hsl(0_50%_53%)]" />
                  <span className="hidden sm:inline">Ungroup</span>
              </Button>
            )}
          </div>
        </div>
        
        {/* Route & Class Summary */}
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
             <Badge variant="outline">{uniqueSources.join(", ")} → {uniqueDestinations.join(", ")}</Badge>
             {classes.map(c => <Badge key={c} variant="secondary">{c}</Badge>)}
        </div>
      </div>

      {/* Shared Actions Section */}
      <CardContent className="p-4 border-t bg-muted/5 grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Shared Prepared Accounts Section */}
        <div className="flex flex-col h-full bg-background rounded-lg border shadow-sm overflow-hidden">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="group-ids" className="border-none">
              <div className="p-3 bg-muted/10 flex items-center justify-between gap-2">
                <AccordionTrigger className="py-0 hover:no-underline">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <CreditCard className="h-4 w-4 text-primary" />
                    <span>IDs for Booking</span>
                  </div>
                </AccordionTrigger>

                <div
                  className="flex items-center gap-2"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {hasSharedPreparedAccounts && (
                    <Badge variant="secondary" className="hidden sm:inline-flex h-6">
                      {firstBookingWithAccounts.preparedAccounts?.length} Linked
                    </Badge>
                  )}
                  <BookingRequirementsSheet 
                    booking={{ ...firstBookingWithAccounts, id: groupId }} 
                    iconComponent={CreditCard}
                    isGroupMode={true}
                    groupBookings={bookings}
                    onSaveGroup={handleSaveGroupRequirements}
                    className="flex-none w-auto aspect-auto px-3"
                  />
                </div>
              </div>
              <AccordionContent className="px-3 pb-3">
                {hasSharedPreparedAccounts ? (
                  <div className="space-y-2 pt-3">
                    {firstBookingWithAccounts.preparedAccounts?.map((account, index) => (
                      <div
                        key={index}
                        className="bg-muted/10 border rounded-md p-2 text-xs space-y-1.5"
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-foreground/80">Account #{index + 1}</span>
                          <div className="flex gap-1.5">
                            {account.isMasterAdded && (
                              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400">
                                Master
                              </Badge>
                            )}
                            {account.isWalletLoaded && (
                              <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400">
                                Wallet
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-1 text-muted-foreground">
                          <div className="flex justify-between">
                            <span>User:</span> <span className="font-mono text-foreground">{account.username}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Pass:</span> <span className="font-mono text-foreground">{account.password}</span>
                          </div>
                          {account.handlingBy && (
                            <div className="flex justify-between border-t pt-1 mt-0.5">
                              <span>Handler:</span> <span className="text-foreground">{account.handlingBy}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center p-4 text-center border-2 border-dashed rounded-md bg-muted/5 mt-3">
                    <CreditCard className="h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">No accounts added yet</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Add accounts to process this group booking</p>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {/* Shared Booked Details Section */}
        <div className="flex flex-col h-full bg-background rounded-lg border shadow-sm overflow-hidden">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="group-booked-details" className="border-none">
              <div className="p-3 bg-muted/10 flex items-center justify-between gap-2">
                <AccordionTrigger className="py-0 hover:no-underline">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span>Booked Details</span>
                  </div>
                </AccordionTrigger>

                <div className="flex items-center gap-2">
                  {hasGroupBookedDetails && (
                    <span className="h-5 w-5 rounded-full bg-green-600 flex items-center justify-center">
                      <Check className="h-3 w-3 text-white" />
                    </span>
                  )}
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowBookedDetailsDialog(true);
                    }}
                    className="h-8 px-2 text-primary hover:text-primary/80 hover:bg-primary/10"
                  >
                    {hasGroupBookedDetails ? "Update" : "Add"}
                  </Button>
                </div>
              </div>
              <AccordionContent className="px-3 pb-3">
                {isLoadingGroupBookingDetails ? (
                  <div className="h-full flex items-center justify-center p-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Loading…
                  </div>
                ) : hasGroupBookedDetails ? ( 
                  <div className="space-y-3 pt-3">
                    <div className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
                      <span className="text-xs font-medium text-green-700 dark:text-green-400 flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Status: Booked
                      </span>
                      <Badge variant="outline" className="bg-background text-xs">
                        {bookings.length} Bookings
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="space-y-1">
                        <span className="text-muted-foreground block">Booked By</span>
                        <span className="font-medium">{groupBookingDetails!.bookedBy}</span>
                      </div>
                      <div className="space-y-1">
                        <span className="text-muted-foreground block">Total Amount</span>
                        <span className="font-medium">₹{groupBookingDetails!.totalAmount.toFixed(2)}</span>
                      </div>
                      <div className="space-y-1">
                        <span className="text-muted-foreground block">Account Used</span>
                        <span className="font-medium truncate" title={groupBookingDetails!.bookedAccountUsername}>
                          {groupBookingDetails!.bookedAccountUsername}
                        </span>
                      </div>
                      <div className="space-y-1">
                        <span className="text-muted-foreground block">Payment Method</span>
                        <span className="font-medium">{groupBookingDetails!.methodUsed}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-medium text-foreground/80">Split per booking</div>
                      <div className="space-y-2">
                        {groupBookingDetails!.splitByBooking.map(x => (
                          <div key={x.bookingId} className="flex items-center justify-between rounded-md border bg-muted/10 px-3 py-2 text-xs">
                            <span className="text-muted-foreground">
                              {x.passengers} pax • {x.bookingFor}
                            </span>
                            <span className="font-medium">₹{x.amountCharged.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="text-xs text-center text-muted-foreground border-t pt-2">
                      Details are applied to all bookings in this group.
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center p-4 text-center border-2 border-dashed rounded-md bg-muted/5 mt-3">
                    <CheckCircle2 className="h-8 w-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">Not booked yet</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Add details once tickets are confirmed</p>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </CardContent>

      {/* Individual Bookings List */}
      <CardContent className="p-4 bg-muted/10 space-y-4 border-t">
        <h4 className="font-medium text-sm text-muted-foreground mb-2">Individual Bookings</h4>
        {bookings.map(booking => (
          <BookingCard 
            key={booking.id} 
            booking={booking}
            selectionMode={selectionMode}
            isSelected={selectedBookingIds?.has(booking.id)}
            onToggleSelection={onToggleSelection}
            hideActions={true} // Hide actions on individual cards when in group
            hideSharedDetails={true} // Hide shared details (IDs, Booked Details)
          />
        ))}
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

      {/* Group Booking Record Dialog */}
      {showBookedDetailsDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle className="text-lg">
                {hasGroupBookedDetails ? "Update Group Booked Details" : "Add Group Booked Details"}
              </CardTitle>
              <CardDescription>
                This will apply to all {bookings.length} bookings in the group.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GroupBookingRecordForm 
                bookings={bookings}
                onClose={() => setShowBookedDetailsDialog(false)}
                onSave={handleSaveGroupRecord}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </Card>
  );
}

// Sub-component for group booking record form
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getAccounts } from "@/lib/accountsClient";
import { getHandlers } from "@/lib/handlersClient";
import type { IrctcAccount } from "@/types/account";
import type { Handler } from "@/types/handler";
import { ALL_PAYMENT_METHODS } from "@/types/bookingRecord";
import type { PaymentMethod } from "@/types/bookingRecord";

interface GroupBookingRecordFormProps {
  bookings: Booking[];
  onClose: () => void;
  onSave: (data: any) => Promise<{ success: boolean; error?: string }>;
}

function GroupBookingRecordForm({ bookings, onClose, onSave }: GroupBookingRecordFormProps) {
  const [accounts, setAccounts] = useState<IrctcAccount[]>([]);
  const [handlers, setHandlers] = useState<Handler[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  
  const [form, setForm] = useState({
    bookedBy: "",
    bookedAccountUsername: "",
    amountCharged: "",
    methodUsed: "" as PaymentMethod | "",
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [fetchedAccounts, fetchedHandlers] = await Promise.all([
        getAccounts(),
        getHandlers(),
      ]);
      setAccounts(fetchedAccounts);
      setHandlers(fetchedHandlers);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load data", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const amountNum = Number(form.amountCharged || 0);
    if (Number.isNaN(amountNum) || amountNum < 0) {
      toast({ title: "Invalid Amount", description: "Amount must be a valid number", variant: "destructive" });
      setIsSubmitting(false);
      return;
    }

    const result = await onSave({
      bookedBy: form.bookedBy,
      bookedAccountUsername: form.bookedAccountUsername,
      amountCharged: amountNum,
      methodUsed: form.methodUsed,
    });

    if (!result.success) {
      toast({ title: "Error", description: result.error, variant: "destructive" });
    }
    setIsSubmitting(false);
  };

  if (isLoading) {
    return <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const selectedAccount = accounts.find(acc => acc.username === form.bookedAccountUsername);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Booked By</Label>
        <Select value={form.bookedBy} onValueChange={(v) => setForm(f => ({ ...f, bookedBy: v }))}>
          <SelectTrigger>
            <SelectValue placeholder="Select handler" />
          </SelectTrigger>
          <SelectContent>
            {handlers.map(h => <SelectItem key={h.id} value={h.name}>{h.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Booked Account</Label>
        <Select value={form.bookedAccountUsername} onValueChange={(v) => setForm(f => ({ ...f, bookedAccountUsername: v }))}>
          <SelectTrigger>
            <SelectValue placeholder="Select account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map(a => <SelectItem key={a.id} value={a.username}>{a.username}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Total Amount Charged (₹)</Label>
        <Input 
          type="number" 
          value={form.amountCharged} 
          onChange={(e) => setForm(f => ({ ...f, amountCharged: e.target.value }))}
          placeholder="Total amount for the group"
        />
        <p className="text-xs text-muted-foreground">
          Will be split based on number of passengers in each booking.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Payment Method</Label>
        <Select value={form.methodUsed} onValueChange={(v) => setForm(f => ({ ...f, methodUsed: v as PaymentMethod }))}>
          <SelectTrigger>
            <SelectValue placeholder="Select method" />
          </SelectTrigger>
          <SelectContent>
            {ALL_PAYMENT_METHODS.map(m => (
              <SelectItem key={m} value={m}>
                {m === 'Wallet' && selectedAccount ? `Wallet (₹${selectedAccount.walletAmount.toFixed(2)})` : m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
        <Button type="submit" disabled={isSubmitting} className="flex-1">
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save for Group
        </Button>
      </div>
    </form>
  );
}
