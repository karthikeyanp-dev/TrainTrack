"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RefundRecipientType } from "@/types/booking";
import type { Handler } from "@/types/handler";

export interface RefundRecipientValue {
  recipientType: RefundRecipientType;
  recipientName: string;
}

interface RefundRecipientPickerProps {
  idPrefix: string;
  value: RefundRecipientValue;
  onChange: (value: RefundRecipientValue) => void;
  handlers: Handler[];
  /**
   * IRCTC account the ticket was paid from. The "IRCTC Wallet" option is only
   * offered when this is set — IRCTC refunds go back to the source of payment.
   */
  walletUsername?: string;
  disabled?: boolean;
}

/** Who ends up holding the IRCTC refund: the IRCTC wallet, a handler, or someone else. */
export function RefundRecipientPicker({
  idPrefix,
  value,
  onChange,
  handlers,
  walletUsername,
  disabled = false,
}: RefundRecipientPickerProps) {
  const showWallet = !!walletUsername || value.recipientType === "Wallet";

  // Keep a handler that has since been renamed/removed selectable.
  const handlerNames = handlers.map(h => h.name);
  if (value.recipientType === "Handler" && value.recipientName && !handlerNames.includes(value.recipientName)) {
    handlerNames.push(value.recipientName);
  }

  const handleTypeChange = (next: string) => {
    const recipientType = next as RefundRecipientType;
    if (recipientType === "Wallet") {
      onChange({ recipientType, recipientName: walletUsername || value.recipientName });
    } else {
      onChange({ recipientType, recipientName: "" });
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-recipient-type`}>Refund goes to</Label>
        <Select value={value.recipientType} onValueChange={handleTypeChange} disabled={disabled}>
          <SelectTrigger id={`${idPrefix}-recipient-type`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {showWallet && <SelectItem value="Wallet">IRCTC Wallet</SelectItem>}
            <SelectItem value="Handler">Handler</SelectItem>
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        {value.recipientType === "Wallet" && (
          <>
            <Label htmlFor={`${idPrefix}-recipient-wallet`}>IRCTC account</Label>
            <Input
              id={`${idPrefix}-recipient-wallet`}
              value={value.recipientName || walletUsername || ""}
              readOnly
              disabled
              className="font-mono"
            />
          </>
        )}

        {value.recipientType === "Handler" && (
          <>
            <Label htmlFor={`${idPrefix}-recipient-handler`}>Handler</Label>
            <Select
              value={value.recipientName || undefined}
              onValueChange={(name) => onChange({ recipientType: "Handler", recipientName: name })}
              disabled={disabled || handlerNames.length === 0}
            >
              <SelectTrigger id={`${idPrefix}-recipient-handler`}>
                <SelectValue placeholder={handlerNames.length === 0 ? "No handlers added" : "Select handler"} />
              </SelectTrigger>
              <SelectContent>
                {handlerNames.map(name => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        {value.recipientType === "Other" && (
          <>
            <Label htmlFor={`${idPrefix}-recipient-other`}>Name (optional)</Label>
            <Input
              id={`${idPrefix}-recipient-other`}
              value={value.recipientName}
              onChange={(e) => onChange({ recipientType: "Other", recipientName: e.target.value })}
              placeholder="e.g. customer's bank account"
              disabled={disabled}
            />
          </>
        )}
      </div>
    </div>
  );
}
