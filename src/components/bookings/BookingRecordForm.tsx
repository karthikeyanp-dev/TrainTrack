"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, Trash2 } from "lucide-react";
import type { IrctcAccount } from "@/types/account";
import type { Booking } from "@/types/booking";
import { AccountSelect } from "@/components/accounts/AccountSelect";
import { getAccounts } from "@/lib/accountsClient";
import type { PaymentMethod, BookingRecord } from "@/types/bookingRecord";
import { ALL_PAYMENT_METHODS } from "@/types/bookingRecord";
import {
  getBookingRecordByBookingId,
  saveBookingRecord,
  deleteBookingRecord,
  saveGroupBookingRecords,
  getBookingById,
} from "@/lib/firestoreClient";
import { getHandlers } from "@/lib/handlersClient";
import type { Handler } from "@/types/handler";
import {
  calculateBookingCommission,
  calculateGroupCommission,
} from "@/lib/commission";

interface BookingRecordFormProps {
  bookingId: string;
  booking?: Booking;
  onClose?: () => void;
  onSave?: (savedBookedBy?: string) => void;
  hideWrapper?: boolean;
  isGroupMode?: boolean;
  groupBookings?: Booking[];
  groupId?: string;
}

interface FormState {
  bookedBy: string;
  bookedAccountUsername: string;
  bookedAmount: string;
  commission: string;
  methodUsed: PaymentMethod | "";
  trainName: string;
}

export function BookingRecordForm({
  bookingId,
  booking,
  onClose,
  onSave,
  hideWrapper = false,
  isGroupMode = false,
  groupBookings = [],
  groupId,
}: BookingRecordFormProps) {
  const [accounts, setAccounts] = useState<IrctcAccount[]>([]);
  const [handlers, setHandlers] = useState<Handler[]>([]);
  const [loadedBooking, setLoadedBooking] = useState<Booking | null>(null);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [existingRecord, setExistingRecord] = useState<BookingRecord | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const activeBooking = booking || loadedBooking;

  const groupCommissionInfo = useMemo(() => {
    if (isGroupMode && groupBookings.length > 0) {
      return calculateGroupCommission(groupBookings);
    }
    return null;
  }, [isGroupMode, groupBookings]);

  const singleCommissionInfo = useMemo(() => {
    if (!isGroupMode && activeBooking) {
      return calculateBookingCommission(activeBooking);
    }
    return null;
  }, [isGroupMode, activeBooking]);

  const suggestedCommission = useMemo(() => {
    if (groupCommissionInfo) return groupCommissionInfo.totalCommission;
    if (singleCommissionInfo) return singleCommissionInfo.commission;
    return 0;
  }, [groupCommissionInfo, singleCommissionInfo]);

  const totalPassengers = useMemo(() => {
    if (groupCommissionInfo) return groupCommissionInfo.totalPassengers;
    if (singleCommissionInfo) return singleCommissionInfo.passengerCount;
    return 1;
  }, [groupCommissionInfo, singleCommissionInfo]);

  // Booked details feed the derived handler payment totals and account stats,
  // so any save/delete has to drop those caches too — not just ["bookings"].
  const invalidateRecordDerivedQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["bookings"] });
    queryClient.invalidateQueries({ queryKey: ["handlers"] });
    queryClient.invalidateQueries({ queryKey: ["accounts"] });
  };

  const [form, setForm] = useState<FormState>({
    bookedBy: "",
    bookedAccountUsername: "",
    bookedAmount: "",
    commission: "",
    methodUsed: "",
    trainName: "",
  });

  useEffect(() => {
    loadData();
  }, [bookingId]);

  const loadData = async () => {
    setIsLoadingAccounts(true);
    try {
      const [fetchedAccounts, fetchedHandlers, existingRec, fetchedBooking] = await Promise.all([
        getAccounts(),
        getHandlers(),
        getBookingRecordByBookingId(bookingId),
        !booking && !isGroupMode ? getBookingById(bookingId) : Promise.resolve(null),
      ]);

      setAccounts(fetchedAccounts);
      setHandlers(fetchedHandlers);
      if (fetchedBooking) {
        setLoadedBooking(fetchedBooking);
      }

      if (existingRec) {
        setExistingRecord(existingRec);
        const bookedAmt =
          existingRec.bookedAmount !== undefined
            ? existingRec.bookedAmount.toString()
            : existingRec.amountCharged.toString();
        const commAmt =
          existingRec.commission !== undefined
            ? existingRec.commission.toString()
            : "0";

        setForm({
          bookedBy: existingRec.bookedBy,
          bookedAccountUsername: existingRec.bookedAccountUsername,
          bookedAmount: bookedAmt,
          commission: commAmt,
          methodUsed: existingRec.methodUsed,
          trainName: existingRec.trainName || "",
        });
      } else {
        // Pre-fill default suggested commission for new record
        const targetBooking = booking || fetchedBooking;
        let initialCommission = 0;
        if (isGroupMode && groupBookings.length > 0) {
          initialCommission = calculateGroupCommission(groupBookings).totalCommission;
        } else if (targetBooking) {
          initialCommission = calculateBookingCommission(targetBooking).commission;
        }
        setForm((prev) => ({
          ...prev,
          commission: initialCommission > 0 ? initialCommission.toString() : prev.commission,
        }));
      }
    } catch (error) {
      toast({
        title: "Error Loading Data",
        description: "Failed to load accounts, handlers, or existing record",
        variant: "destructive",
      });
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  const handleChangeText =
    (field: keyof Omit<FormState, "methodUsed" | "bookedBy">) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const handleMethodChange = (value: PaymentMethod) => {
    setForm((prev) => ({ ...prev, methodUsed: value }));
  };

  const bookedAmountNum = Number(form.bookedAmount || 0);
  const commissionNum = Number(form.commission || 0);
  const totalAmountNum = Number((bookedAmountNum + commissionNum).toFixed(2));

  const handleDelete = async () => {
    if (!existingRecord) return;

    if (
      !confirm(
        "Are you sure you want to delete this booking record? This will also refund the amount to the wallet if applicable."
      )
    ) {
      return;
    }

    setIsDeleting(true);
    const result = await deleteBookingRecord(existingRecord.id);

    if (result.success) {
      toast({
        title: "Record Deleted",
        description: "Booking record has been deleted successfully.",
      });
      setExistingRecord(null);
      setForm({
        bookedBy: "",
        bookedAccountUsername: "",
        bookedAmount: "",
        commission: suggestedCommission > 0 ? suggestedCommission.toString() : "",
        methodUsed: "",
        trainName: "",
      });
      invalidateRecordDerivedQueries();
      loadData(); // Reload to refresh wallet balances
    } else {
      toast({
        title: "Error Deleting Record",
        description: result.error || "Failed to delete record",
        variant: "destructive",
      });
    }
    setIsDeleting(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    if (!form.bookedAmount.trim() || Number.isNaN(bookedAmountNum) || bookedAmountNum < 0) {
      toast({
        title: "Invalid Ticket Amount",
        description: "Booked Amount (Ticket Fare) must be a valid non-negative number",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    if (Number.isNaN(commissionNum) || commissionNum < 0) {
      toast({
        title: "Invalid Commission",
        description: "Commission must be a valid non-negative number",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    if (totalAmountNum > 100000) {
      toast({
        title: "Unusually High Amount",
        description:
          "Total amount cannot exceed ₹1,00,000. If you pasted a UPI Reference (UTR) or PNR number, please enter the actual ticket cost.",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    if (!form.bookedBy.trim()) {
      toast({
        title: "Missing Field",
        description: "Booked By is required",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    if (!form.bookedAccountUsername.trim()) {
      toast({
        title: "Missing Field",
        description: "Booked Account is required",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    if (!form.methodUsed) {
      toast({
        title: "Missing Field",
        description: "Payment Method is required",
        variant: "destructive",
      });
      setIsSubmitting(false);
      return;
    }

    // In group mode, save a single record for the entire group
    if (isGroupMode && groupBookings.length > 0 && groupId) {
      const groupResult = await saveGroupBookingRecords({
        bookingIds: groupBookings.map((b) => b.id),
        groupId,
        bookedBy: form.bookedBy.trim(),
        bookedAccountUsername: form.bookedAccountUsername.trim(),
        totalAmount: totalAmountNum,
        bookedAmount: bookedAmountNum,
        commission: commissionNum,
        passengerCount: totalPassengers,
        methodUsed: form.methodUsed,
        trainName: form.trainName.trim() || undefined,
      });

      if (groupResult.success) {
        invalidateRecordDerivedQueries();
        toast({
          title: "Record Saved for Group",
          description: `Booked details have been saved for all ${groupBookings.length} bookings.`,
        });
        if (onSave) {
          onSave(form.bookedBy.trim());
        } else if (onClose) {
          onClose();
        }
      } else {
        toast({
          title: "Error",
          description: groupResult.error || "Failed to save group booking records",
          variant: "destructive",
        });
      }
    } else {
      // Single booking mode
      const result = await saveBookingRecord({
        bookingId,
        bookedBy: form.bookedBy.trim(),
        bookedAccountUsername: form.bookedAccountUsername.trim(),
        amountCharged: totalAmountNum,
        bookedAmount: bookedAmountNum,
        commission: commissionNum,
        commissionRate: singleCommissionInfo?.rate,
        passengerCount: singleCommissionInfo?.passengerCount,
        methodUsed: form.methodUsed,
        trainName: form.trainName.trim() || undefined,
      });

      if (result.success && result.record) {
        invalidateRecordDerivedQueries();
        toast({
          title: existingRecord ? "Record Updated" : "Record Saved",
          description: "Booked details have been saved successfully.",
        });
        setExistingRecord(result.record);
        if (onSave) {
          onSave(form.bookedBy.trim());
        } else if (onClose) {
          onClose();
        }
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to save booking record",
          variant: "destructive",
        });
      }
    }
    setIsSubmitting(false);
  };

  if (isLoadingAccounts) {
    const loadingContent = (
      <div className="flex justify-center items-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );

    if (hideWrapper) {
      return loadingContent;
    }

    return (
      <Card className="mt-3">
        <CardContent className="flex justify-center items-center p-6">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const formContent = (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <div className="space-y-1">
        <Label htmlFor={`bookedBy-${bookingId}`} className="text-xs">
          Booked By
        </Label>
        <Select
          value={form.bookedBy}
          onValueChange={(value) => setForm((prev) => ({ ...prev, bookedBy: value }))}
          disabled={isSubmitting}
        >
          <SelectTrigger id={`bookedBy-${bookingId}`} className="text-sm">
            <SelectValue placeholder="Select handler" />
          </SelectTrigger>
          <SelectContent>
            {handlers.map((handler) => (
              <SelectItem key={handler.id} value={handler.name}>
                {handler.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`bookedAccount-${bookingId}`} className="text-xs">
          Booked Account
        </Label>
        <AccountSelect
          accounts={accounts}
          value={form.bookedAccountUsername}
          onChange={(value) =>
            setForm((prev) => ({ ...prev, bookedAccountUsername: value }))
          }
          placeholder="Select IRCTC account"
        />
      </div>

      {/* Commission Breakdown Information */}
      <div className="rounded-md border bg-muted/40 p-2.5 text-xs space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground font-medium">Passenger & Class:</span>
          <span className="font-semibold text-foreground">
            {isGroupMode
              ? `${totalPassengers} Pax (${groupBookings.length} bookings)`
              : `${singleCommissionInfo?.passengerCount || 1} Pax • ${
                  singleCommissionInfo?.isAc ? "AC Class" : "Non-AC / General"
                }`}
          </span>
        </div>
        <div className="flex items-center justify-between text-muted-foreground">
          <span>Standard Commission:</span>
          <span className="font-medium text-emerald-600 dark:text-emerald-400">
            {isGroupMode
              ? `₹${suggestedCommission} total`
              : `₹${singleCommissionInfo?.rate || 70}/pax × ${
                  singleCommissionInfo?.passengerCount || 1
                } = ₹${suggestedCommission}`}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`bookedAmount-${bookingId}`} className="text-xs">
            Booked Amount (₹)
          </Label>
          <Input
            id={`bookedAmount-${bookingId}`}
            type="number"
            value={form.bookedAmount}
            onChange={handleChangeText("bookedAmount")}
            placeholder="Ticket fare (e.g. 1200)"
            min={0}
            step="0.01"
            disabled={isSubmitting}
            className="text-sm font-mono"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor={`commission-${bookingId}`} className="text-xs">
            Commission (₹)
          </Label>
          <Input
            id={`commission-${bookingId}`}
            type="number"
            value={form.commission}
            onChange={handleChangeText("commission")}
            placeholder="Commission (e.g. 200)"
            min={0}
            step="0.01"
            disabled={isSubmitting}
            className="text-sm font-mono"
          />
        </div>
      </div>

      {/* Total Amount Display Card */}
      <div className="flex items-center justify-between p-2.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-xs">
        <div>
          <span className="font-semibold text-foreground block">Total Transaction Amount</span>
          <span className="text-[11px] text-muted-foreground">
            Ticket ₹{bookedAmountNum.toFixed(2)} + Commission ₹{commissionNum.toFixed(2)}
          </span>
        </div>
        <div className="font-mono font-bold text-base text-emerald-600 dark:text-emerald-400">
          ₹{totalAmountNum.toFixed(2)}
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`methodUsed-${bookingId}`} className="text-xs">
          Method Used
        </Label>
        {(() => {
          const selectedAccount = accounts.find((acc) => acc.username === form.bookedAccountUsername);
          const walletDisplay =
            typeof selectedAccount?.walletAmount === "number"
              ? ` (₹${selectedAccount.walletAmount.toFixed(2)})`
              : "";
          return (
            <Select
              value={form.methodUsed || ""}
              onValueChange={(value) => handleMethodChange(value as PaymentMethod)}
              disabled={isSubmitting}
            >
              <SelectTrigger id={`methodUsed-${bookingId}`} className="text-sm">
                <SelectValue placeholder="Select payment method" />
              </SelectTrigger>
              <SelectContent position="popper">
                {ALL_PAYMENT_METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {method === "Wallet" ? `Wallet${walletDisplay}` : method}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          );
        })()}
      </div>

      <div className="space-y-1">
        <Label htmlFor={`trainName-${bookingId}`} className="text-xs">
          Train Name / No. (Optional)
        </Label>
        <Input
          id={`trainName-${bookingId}`}
          type="text"
          value={form.trainName}
          onChange={(e) => setForm((prev) => ({ ...prev, trainName: e.target.value }))}
          placeholder="e.g., 12345 Tamil Nadu Express"
          disabled={isSubmitting}
          className="text-sm"
        />
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="submit" className="flex-1 text-sm" disabled={isSubmitting || isDeleting}>
          {isSubmitting && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
          {isSubmitting
            ? "Saving..."
            : existingRecord
            ? "Update Record"
            : "Save Record"}
        </Button>

        {existingRecord && (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            onClick={handleDelete}
            disabled={isSubmitting || isDeleting}
            className="shrink-0"
            title="Delete Record"
          >
            {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        )}

        {onClose && (
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting || isDeleting}
            className="text-sm"
          >
            Close
          </Button>
        )}
      </div>
    </form>
  );

  if (hideWrapper) {
    return formContent;
  }

  return (
    <Card className="mt-3">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          {existingRecord && <CheckCircle2 className="h-4 w-4 text-green-600" />}
          {existingRecord ? "Update Booked Details" : "Add Booked Details"}
        </CardTitle>
      </CardHeader>
      <CardContent>{formContent}</CardContent>
    </Card>
  );
}
