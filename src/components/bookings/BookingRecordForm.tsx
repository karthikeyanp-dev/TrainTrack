"use client";

import { useEffect, useState } from "react";
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
import { getBookingRecordByBookingId, saveBookingRecord, deleteBookingRecord, saveGroupBookingRecords } from "@/lib/firestoreClient";
import { getHandlers } from "@/lib/handlersClient";
import type { Handler } from "@/types/handler";

interface BookingRecordFormProps {
  bookingId: string;
  onClose?: () => void;
  onSave?: () => void;
  hideWrapper?: boolean;
  isGroupMode?: boolean;
  groupBookings?: Booking[];
  groupId?: string;
}

interface FormState {
  bookedBy: string;
  bookedAccountUsername: string;
  amountCharged: string;
  methodUsed: PaymentMethod | "";
}

export function BookingRecordForm({ bookingId, onClose, onSave, hideWrapper = false, isGroupMode = false, groupBookings = [], groupId }: BookingRecordFormProps) {
  const [accounts, setAccounts] = useState<IrctcAccount[]>([]);
  const [handlers, setHandlers] = useState<Handler[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [existingRecord, setExistingRecord] = useState<BookingRecord | null>(null);
  const { toast } = useToast();

  const [form, setForm] = useState<FormState>({
    bookedBy: "",
    bookedAccountUsername: "",
    amountCharged: "",
    methodUsed: "",
  });

  useEffect(() => {
    loadData();
  }, [bookingId]);

  const loadData = async () => {
    setIsLoadingAccounts(true);
    try {
      const [fetchedAccounts, fetchedHandlers, existingRec] = await Promise.all([
        getAccounts(),
        getHandlers(),
        getBookingRecordByBookingId(bookingId),
      ]);

      setAccounts(fetchedAccounts);
      setHandlers(fetchedHandlers);

      if (existingRec) {
        setExistingRecord(existingRec);
        setForm({
          bookedBy: existingRec.bookedBy,
          bookedAccountUsername: existingRec.bookedAccountUsername,
          amountCharged: existingRec.amountCharged.toString(),
          methodUsed: existingRec.methodUsed,
        });
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
      setForm(prev => ({ ...prev, [field]: e.target.value }));
    };

  const handleMethodChange = (value: PaymentMethod) => {
    setForm(prev => ({ ...prev, methodUsed: value }));
  };

  const handleDelete = async () => {
    if (!existingRecord) return;
    
    if (!confirm("Are you sure you want to delete this booking record? This will also refund the amount to the wallet if applicable.")) {
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
        amountCharged: "",
        methodUsed: "",
      });
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

    const amountNum = Number(form.amountCharged || 0);
    if (Number.isNaN(amountNum) || amountNum < 0) {
      toast({
        title: "Invalid Amount",
        description: "Amount Charged must be a valid non-negative number",
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
        bookingIds: groupBookings.map(b => b.id),
        groupId,
        bookedBy: form.bookedBy.trim(),
        bookedAccountUsername: form.bookedAccountUsername.trim(),
        totalAmount: amountNum,
        methodUsed: form.methodUsed,
      });

      if (groupResult.success) {
        toast({
          title: "Record Saved for Group",
          description: `Booked details have been saved for all ${groupBookings.length} bookings.`,
        });
        if (onSave) {
          onSave();
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
        amountCharged: amountNum,
        methodUsed: form.methodUsed,
      });

      if (result.success && result.record) {
        toast({
          title: existingRecord ? "Record Updated" : "Record Saved",
          description: "Booked details have been saved successfully.",
        });
        setExistingRecord(result.record);
        if (onSave) {
          onSave();
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
          onValueChange={(value) => setForm(prev => ({ ...prev, bookedBy: value }))}
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
          onChange={value =>
            setForm(prev => ({ ...prev, bookedAccountUsername: value }))
          }
          placeholder="Select IRCTC account"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor={`amountCharged-${bookingId}`} className="text-xs">
          Amount Charged (₹)
        </Label>
        <Input
          id={`amountCharged-${bookingId}`}
          type="number"
          value={form.amountCharged}
          onChange={handleChangeText("amountCharged")}
          placeholder="Final transaction cost"
          min={0}
          step="0.01"
          disabled={isSubmitting}
          className="text-sm"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor={`methodUsed-${bookingId}`} className="text-xs">
          Method Used
        </Label>
        {(() => {
          const selectedAccount = accounts.find(acc => acc.username === form.bookedAccountUsername);
          const walletDisplay = typeof selectedAccount?.walletAmount === 'number' ? ` (₹${selectedAccount.walletAmount.toFixed(2)})` : '';
          return (
          <Select
            value={form.methodUsed || ""}
            onValueChange={value => handleMethodChange(value as PaymentMethod)}
            disabled={isSubmitting}
          >
            <SelectTrigger id={`methodUsed-${bookingId}`} className="text-sm">
              <SelectValue placeholder="Select payment method" />
            </SelectTrigger>
            <SelectContent position="popper">
            {ALL_PAYMENT_METHODS.map(method => (
              <SelectItem key={method} value={method}>
                {method === 'Wallet' ? `Wallet${walletDisplay}` : method}
              </SelectItem>
            ))}
            </SelectContent>
          </Select>
          );
        })()}
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="submit" className="flex-1 text-sm" disabled={isSubmitting || isDeleting}>
          {isSubmitting && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
          {isSubmitting 
            ? "Saving..." 
            : existingRecord 
              ? "Update Record" 
              : "Save Record"
          }
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
      <CardContent>
        {formContent}
      </CardContent>
    </Card>
  );
}
