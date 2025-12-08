
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
import { Loader2, CheckCircle2 } from "lucide-react";
import type { IrctcAccount } from "@/types/account";
import { getAccounts } from "@/actions/accountActions";
import type { PaymentMethod, BookingRecord } from "@/types/bookingRecord";
import { ALL_PAYMENT_METHODS } from "@/types/bookingRecord";
import {
  getBookingRecordByBookingId,
  saveBookingRecord,
} from "@/actions/bookingRecordActions";

interface BookingRecordFormProps {
  bookingId: string;
  onClose?: () => void;
}

interface FormState {
  bookedBy: string;
  bookedAccountUsername: string;
  amountCharged: string;
  methodUsed: PaymentMethod | "";
}

export function BookingRecordForm({ bookingId, onClose }: BookingRecordFormProps) {
  const [accounts, setAccounts] = useState<IrctcAccount[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
      const [fetchedAccounts, existingRec] = await Promise.all([
        getAccounts(),
        getBookingRecordByBookingId(bookingId),
      ]);

      setAccounts(fetchedAccounts);

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
        description: "Failed to load accounts or existing record",
        variant: "destructive",
      });
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  const handleChangeText =
    (field: keyof Omit<FormState, "methodUsed">) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm(prev => ({ ...prev, [field]: e.target.value }));
    };

  const handleMethodChange = (value: PaymentMethod) => {
    setForm(prev => ({ ...prev, methodUsed: value }));
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
        description: "Booking details have been saved successfully.",
      });
      setExistingRecord(result.record);
      if (onClose) {
        onClose();
      }
    } else {
      const errorMessage = result.errors?.formErrors?.[0] || "Failed to save record";
      toast({
        title: "Error Saving Record",
        description: errorMessage,
        variant: "destructive",
      });
    }

    setIsSubmitting(false);
  };

  if (isLoadingAccounts) {
    return (
      <Card className="mt-3">
        <CardContent className="flex justify-center items-center p-6">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-3">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          {existingRecord && <CheckCircle2 className="h-4 w-4 text-green-600" />}
          {existingRecord ? "Update Booking Record" : "Record Booking Details"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div className="space-y-1">
            <Label htmlFor={`bookedBy-${bookingId}`} className="text-xs">
              Booked By
            </Label>
            <Input
              id={`bookedBy-${bookingId}`}
              value={form.bookedBy}
              onChange={handleChangeText("bookedBy")}
              placeholder="Person who did the booking"
              disabled={isSubmitting}
              className="text-sm"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor={`bookedAccount-${bookingId}`} className="text-xs">
              Booked Account
            </Label>
            <Select
              value={form.bookedAccountUsername}
              onValueChange={value =>
                setForm(prev => ({ ...prev, bookedAccountUsername: value }))
              }
              disabled={isSubmitting}
            >
              <SelectTrigger id={`bookedAccount-${bookingId}`} className="text-sm">
                <SelectValue placeholder="Select IRCTC account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.length === 0 && (
                  <SelectItem value="_none" disabled>
                    No accounts available
                  </SelectItem>
                )}
                {accounts.map(acc => (
                  <SelectItem key={acc.id} value={acc.username}>
                    {acc.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              const walletDisplay = typeof selectedAccount?.walletAmount === 'number' ? ` (₹${selectedAccount.walletAmount})` : '';
              return (
              <Select
                value={form.methodUsed || ""}
                onValueChange={value => handleMethodChange(value as PaymentMethod)}
                disabled={isSubmitting}
              >
                <SelectTrigger id={`methodUsed-${bookingId}`} className="text-sm">
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
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
            <Button type="submit" className="flex-1 text-sm" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              {isSubmitting 
                ? "Saving..." 
                : existingRecord 
                  ? "Update Record" 
                  : "Save Record"
              }
            </Button>
            {onClose && (
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
                className="text-sm"
              >
                Close
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
