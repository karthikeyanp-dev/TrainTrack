"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, Phone, ShieldCheck, Users } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { ALL_BOOKING_TYPES, ALL_TRAIN_CLASSES } from "@/types/booking";
import { approveBookingRequest, requestActionError, updateBookingRequestStatus } from "@/lib/bookingRequestsClient";
import { approvalPlanSchema, getIndiaToday, getRequestWarnings, type BookingRequestRecord } from "@shared/bookingRequest";
import { formatRequestDate, formatRequestReceivedAt, requestClassLabels } from "./requestFormatting";

interface BookingRequestReviewProps {
  record: BookingRequestRecord;
  possibleDuplicates: BookingRequestRecord[];
  onCompleted: (status: "approved" | "clarification" | "rejected") => void;
}

export function BookingRequestReview({ record, possibleDuplicates, onCompleted }: BookingRequestReviewProps) {
  const { request } = record;
  const [bookingDate, setBookingDate] = useState("");
  const [classType, setClassType] = useState("");
  const [bookingType, setBookingType] = useState("");
  const [customerVerified, setCustomerVerified] = useState(false);
  const [childDetailsVerified, setChildDetailsVerified] = useState(false);
  const [reviewNote, setReviewNote] = useState(record.reviewNote ?? "");
  const [busy, setBusy] = useState<"approve" | "clarification" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approvedBookingId, setApprovedBookingId] = useState(record.approvedBookingId);
  const [savedStatus, setSavedStatus] = useState<"clarification" | "rejected" | null>(null);

  const warnings = getRequestWarnings(request);
  const hasUnsupportedChild = request.passengers.some((passenger) => passenger.age < 5);
  const hasChildBerthChoice = request.passengers.some((passenger) => passenger.age >= 5 && passenger.age <= 11);
  const journeyPassed = request.journeyDate < getIndiaToday();
  const bookingDateInvalid = Boolean(bookingDate && (bookingDate < getIndiaToday() || bookingDate > request.journeyDate));
  const editable = ["submitted", "clarification"].includes(record.status) && !approvedBookingId && savedStatus !== "rejected";
  const canApprove = editable && !busy && !hasUnsupportedChild && !journeyPassed && !bookingDateInvalid
    && Boolean(bookingDate && classType && bookingType && customerVerified)
    && (!hasChildBerthChoice || childDetailsVerified);
  const reference = record.receiptReference || record.id;

  async function handleApprove() {
    if (!canApprove) return;
    setError(null);
    const result = approvalPlanSchema.safeParse({ bookingDate, classType, bookingType, customerVerified, childDetailsVerified });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Check the booking plan before approving.");
      return;
    }
    setBusy("approve");
    try {
      const approved = await approveBookingRequest(record.id, record.revision, result.data);
      setApprovedBookingId(approved.bookingId);
      onCompleted("approved");
    } catch (failure) {
      setError(requestActionError(failure));
    } finally {
      setBusy(null);
    }
  }

  async function saveStatus(status: "clarification" | "rejected") {
    if (busy || !editable || !reviewNote.trim()) return;
    setBusy(status);
    setError(null);
    try {
      await updateBookingRequestStatus(record.id, record.revision, status, reviewNote.trim());
      setSavedStatus(status);
      onCompleted(status);
    } catch (failure) {
      setError(requestActionError(failure));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge variant="outline">{reference}</Badge>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" />Confirmed by customer</span>
        </div>
        <CardTitle className="break-words">{request.contact.name}</CardTitle>
        <CardDescription>
          <a href={`tel:${request.contact.phone}`} className="inline-flex items-center gap-2 text-primary underline-offset-4 hover:underline"><Phone className="h-3.5 w-3.5" />{request.contact.phone}</a>
          {record.createdAt && <p className="mt-2 text-xs">Received {formatRequestReceivedAt(record.createdAt)} IST</p>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-xl bg-muted/50 p-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3">
            <div><p className="text-xs text-muted-foreground">Boarding station</p><p className="mt-1 font-semibold">{request.source.name}</p><p className="text-sm text-muted-foreground">{[request.source.city, request.source.state].filter(Boolean).join(', ')}</p><Badge variant="outline" className="mt-2">{request.source.code}</Badge></div>
            <ArrowRight className="mt-6 h-4 w-4 text-muted-foreground" />
            <div><p className="text-xs text-muted-foreground">Destination</p><p className="mt-1 font-semibold">{request.destination.name}</p><p className="text-sm text-muted-foreground">{[request.destination.city, request.destination.state].filter(Boolean).join(', ')}</p><Badge variant="outline" className="mt-2">{request.destination.code}</Badge></div>
          </div>
          <p className="mt-4 border-t pt-3 text-sm"><span className="text-muted-foreground">Boarding date: </span><strong>{formatRequestDate(request.journeyDate)}</strong></p>
        </div>

        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Customer&apos;s class choice</dt><dd className="mt-1 font-medium">{request.classPreference === "unsure" ? "Help me choose — confirm with customer" : requestClassLabels[request.classPreference] ?? request.classPreference}</dd></div>
          <div><dt className="text-muted-foreground">Booking type preference</dt><dd className="mt-1 font-medium">{request.bookingTypePreference === "unsure" ? "Help me choose — confirm with customer" : request.bookingTypePreference}</dd></div>
          <div><dt className="text-muted-foreground">Train preference</dt><dd className="mt-1 whitespace-pre-wrap break-words font-medium">{request.trainPreference || "Please help choose a train"}</dd></div>
          <div><dt className="text-muted-foreground">Upgrade preference</dt><dd className="mt-1 font-medium">{request.upgradePreferred ? "Customer prefers an upgrade if available" : "No upgrade preference"}</dd></div>
        </dl>
        {request.remarks && <div className="rounded-xl border p-4"><p className="text-sm font-semibold">Customer&apos;s conditions and notes</p><p className="mt-2 whitespace-pre-wrap break-words text-sm">{request.remarks}</p></div>}

        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4" />{request.passengers.length} {request.passengers.length === 1 ? "traveller" : "travellers"}</h3>
          <ul className="divide-y rounded-xl border px-4">
            {request.passengers.map((passenger, index) => (
              <li key={index} className="py-3">
                <p className="break-words text-sm font-semibold">{index + 1}. {passenger.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">Age {passenger.age} · {({ M: "Male", F: "Female", O: "Other" })[passenger.gender]}{passenger.age >= 5 && passenger.age <= 11 ? ` · ${passenger.berthRequired ? "Separate berth requested" : "No separate berth requested"}` : ""}</p>
              </li>
            ))}
          </ul>
        </div>

        {(warnings.length > 0 || possibleDuplicates.length > 0 || journeyPassed) && (
          <Alert className="border-amber-500/40 bg-amber-500/5">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Review before approving</AlertTitle>
            <AlertDescription>
              <ul className="mt-2 list-disc space-y-2 pl-4">
                {warnings.map((warning, index) => <li key={index}>{warning}</li>)}
                {journeyPassed && <li>The boarding date is in the past. Ask the customer to submit a corrected request.</li>}
                {possibleDuplicates.length > 0 && <li>Possible duplicate: {possibleDuplicates.map((duplicate) => duplicate.receiptReference || duplicate.id).join(", ")}. These requests have the same phone number, route and boarding date. Confirm whether they are separate bookings.</li>}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {hasUnsupportedChild && (
          <Alert variant="destructive">
            <AlertTitle>Child ticket review needed</AlertTitle>
            <AlertDescription>This request includes a child under 5. Approval from this inbox is unavailable because the current booking model does not safely handle this case. Clarify the child&apos;s ticket requirements and arrange separate handling.</AlertDescription>
          </Alert>
        )}

        {error && <Alert variant="destructive"><AlertTitle>Could not save this review</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}

        {approvedBookingId ? (
          <Alert className="border-green-600/40 bg-green-600/5">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Added to bookings</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>The booking is now Requested. A ticket has not been booked.</p>
              <Button asChild size="sm"><Link href={`/bookings/edit?id=${encodeURIComponent(approvedBookingId)}`}>Open booking</Link></Button>
            </AlertDescription>
          </Alert>
        ) : record.status === "approved" ? (
          <Alert><AlertTitle>Request already approved</AlertTitle><AlertDescription>The booking reference is unavailable. Refresh the inbox to retrieve the booking link.</AlertDescription></Alert>
        ) : !editable ? (
          <Alert><AlertTitle>Request declined</AlertTitle><AlertDescription className="whitespace-pre-wrap break-words">{record.reviewNote || reviewNote || "This request was declined."}</AlertDescription></Alert>
        ) : (
          <>
            <Separator />
            <div className="space-y-4">
              <div><h3 className="font-semibold">Booking plan</h3><p className="mt-1 text-sm text-muted-foreground">Confirm unresolved choices with the customer. The submitted passenger details, route and journey date are preserved.</p></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="request-class">Confirmed class</Label>
                  <Select value={classType} onValueChange={setClassType} disabled={Boolean(busy)}>
                    <SelectTrigger id="request-class"><SelectValue placeholder="Choose confirmed class" /></SelectTrigger>
                    <SelectContent>{ALL_TRAIN_CLASSES.filter((value) => request.classPreference === "unsure" || value === request.classPreference).map((value) => <SelectItem key={value} value={value}>{requestClassLabels[value] ?? value}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="request-booking-type">Confirmed booking type</Label>
                  <Select value={bookingType} onValueChange={setBookingType} disabled={Boolean(busy)}>
                    <SelectTrigger id="request-booking-type"><SelectValue placeholder="Choose booking type" /></SelectTrigger>
                    <SelectContent>{ALL_BOOKING_TYPES.filter((value) => request.bookingTypePreference === "unsure" || value === request.bookingTypePreference).map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="request-book-by">Book by date</Label>
                  <Input id="request-book-by" type="date" min={getIndiaToday()} max={request.journeyDate} value={bookingDate} onChange={(event) => setBookingDate(event.target.value)} disabled={Boolean(busy)} aria-invalid={bookingDateInvalid} aria-describedby="request-book-by-description" />
                  <p id="request-book-by-description" className={bookingDateInvalid ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{bookingDateInvalid ? "Book by must be today or later, and no later than the boarding date." : `Set the operational booking day after checking the train and quota.${bookingDate ? ` Selected: ${formatRequestDate(bookingDate)}.` : ""}`}</p>
                </div>
              </div>
              <div className="space-y-3 rounded-xl border p-4">
                <div className="flex items-start gap-3"><Checkbox id="request-customer-verified" checked={customerVerified} onCheckedChange={(value) => setCustomerVerified(value === true)} disabled={Boolean(busy)} className="mt-0.5" /><Label htmlFor="request-customer-verified" className="text-sm font-normal leading-relaxed">I verified the boarding station and date, destination, passenger details and conditions with the customer, and confirmed the class and booking type above.</Label></div>
                {hasChildBerthChoice && <div className="flex items-start gap-3"><Checkbox id="request-child-verified" checked={childDetailsVerified} onCheckedChange={(value) => setChildDetailsVerified(value === true)} disabled={Boolean(busy)} className="mt-0.5" /><Label htmlFor="request-child-verified" className="text-sm font-normal leading-relaxed">I checked the separate berth choice and ticket requirements for each child aged 5–11.</Label></div>}
              </div>
              <Button className="w-full" disabled={!canApprove} onClick={handleApprove}>{busy === "approve" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{busy === "approve" ? "Adding booking…" : "Approve & add booking"}</Button>
            </div>

            <Separator />
            <div className="space-y-3">
              <Label htmlFor="request-review-note">Internal note for clarification or decline</Label>
              <Textarea id="request-review-note" placeholder="What needs clarification, or why are you declining?" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} maxLength={1000} disabled={Boolean(busy)} rows={3} />
              <p className="text-xs text-muted-foreground">This note stays in your inbox. Contact the customer separately; no message is sent automatically. If their route, date or passenger details are wrong, ask for a new confirmed submission.</p>
              {record.reviewNote && <p className="text-xs text-muted-foreground">Last saved note: {record.reviewNote}</p>}
              {savedStatus === "clarification" && <p className="text-sm text-primary" role="status">Marked as needing clarification.</p>}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={Boolean(busy) || !reviewNote.trim()} onClick={() => saveStatus("clarification")}>{busy === "clarification" && <Loader2 className="h-4 w-4 animate-spin" />}Needs clarification</Button>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={Boolean(busy) || !reviewNote.trim()} onClick={() => saveStatus("rejected")}>{busy === "rejected" && <Loader2 className="h-4 w-4 animate-spin" />}Decline request</Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
