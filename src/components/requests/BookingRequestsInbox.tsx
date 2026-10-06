"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, ExternalLink, Inbox, Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBookingRequests } from "@/hooks/useBookingRequests";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { BookingRequestRecord } from "@shared/bookingRequest";
import { BookingRequestReview } from "./BookingRequestReview";
import { formatRequestDate } from "./requestFormatting";

export const requestStatusLabels: Record<BookingRequestRecord["status"], string> = {
  submitted: "New request",
  clarification: "Needs clarification",
  rejected: "Declined",
  approved: "Added to bookings",
};

type RequestFilter = "pending" | "all" | BookingRequestRecord["status"];

export function BookingRequestsInbox() {
  const { data: requests, isLoading, error, session, refresh } = useBookingRequests();
  const { toast } = useToast();
  const [filter, setFilter] = useState<RequestFilter>("pending");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const customerFormUrl = process.env.NEXT_PUBLIC_CUSTOMER_FORM_URL;

  const filtered = useMemo(() => {
    const searchTerm = search.trim().toLocaleLowerCase();
    return requests.filter((record) => {
      const matchesStatus = filter === "all"
        || (filter === "pending" && ["submitted", "clarification"].includes(record.status))
        || record.status === filter;
      const { request } = record;
      const matchesSearch = !searchTerm || [
        record.receiptReference, request.contact.name, request.contact.phone,
        request.source.name, request.source.code, request.destination.name,
        request.destination.code, request.trainPreference,
        ...request.passengers.map((passenger) => passenger.name),
      ].some((value) => value?.toLocaleLowerCase().includes(searchTerm));
      return matchesStatus && matchesSearch;
    });
  }, [requests, search, filter]);

  const selected = filtered.find((request) => request.id === selectedId) ?? filtered[0];
  const possibleDuplicates = selected ? requests.filter((other) => (
    other.id !== selected.id
    && other.status !== "rejected"
    && other.request.contact.phone === selected.request.contact.phone
    && other.request.source.code === selected.request.source.code
    && other.request.destination.code === selected.request.destination.code
    && other.request.journeyDate === selected.request.journeyDate
  )) : [];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Customer requests</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Review customer-confirmed details, resolve questions, then add the request to bookings.
            A submitted request is not a booked ticket.
          </p>
        </div>
        {customerFormUrl && (
          <Button asChild variant="outline">
            <a href={customerFormUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />Customer form
            </a>
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Requests could not be loaded</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{error.message}</p>
            <Button variant="outline" size="sm" onClick={refresh}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}

      {session === "locked" && !error && (
        <Alert>
          <AlertTitle>Staff sign-in required</AlertTitle>
          <AlertDescription>Lock the app and sign in with your staff PIN to view customer requests.</AlertDescription>
        </Alert>
      )}

      {session === "staff" && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {(["submitted", "clarification", "approved", "rejected"] as const).map((status) => (
              <button
                type="button"
                key={status}
                aria-pressed={filter === status}
                className={cn("rounded-2xl border bg-card p-4 text-left transition-colors hover:border-primary/40", filter === status && "border-primary bg-primary/5")}
                onClick={() => setFilter(status)}
              >
                <span className="block text-2xl font-semibold">{requests.filter((record) => record.status === status).length}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{requestStatusLabels[status]}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input aria-label="Search customer requests" placeholder="Search customer, phone, passenger or station" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" />
            </div>
            <Select value={filter} onValueChange={(value) => setFilter(value as RequestFilter)}>
              <SelectTrigger className="sm:w-56" aria-label="Filter requests"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Awaiting review</SelectItem>
                <SelectItem value="submitted">New requests</SelectItem>
                <SelectItem value="clarification">Needs clarification</SelectItem>
                <SelectItem value="approved">Added to bookings</SelectItem>
                <SelectItem value="rejected">Declined</SelectItem>
                <SelectItem value="all">All requests</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {isLoading && !error ? (
        <div className="flex items-center justify-center gap-3 py-20 text-muted-foreground" role="status">
          <Loader2 className="h-5 w-5 animate-spin" />Loading requests…
        </div>
      ) : session === "staff" && filtered.length === 0 && !error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Inbox className="h-10 w-10 text-muted-foreground" />
            <h3 className="font-semibold">{requests.length ? "No matching requests" : "Your request inbox is ready"}</h3>
            <p className="max-w-sm text-sm text-muted-foreground">{requests.length ? "Try another search or status filter." : "Customer submissions will appear here for review before they become bookings."}</p>
          </CardContent>
        </Card>
      ) : session === "staff" && selected ? (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.6fr)]">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">{filtered.length} {filtered.length === 1 ? "request" : "requests"}</CardTitle></CardHeader>
            <CardContent className="max-h-[28rem] space-y-2 overflow-y-auto px-3 pb-3 lg:max-h-[70vh]">
              {filtered.map((record) => (
                <button
                  type="button"
                  key={record.id}
                  aria-pressed={record.id === selected.id}
                  onClick={() => setSelectedId(record.id)}
                  className={cn("w-full rounded-xl border p-4 text-left transition-colors hover:bg-muted/60", record.id === selected.id ? "border-primary bg-primary/5" : "border-transparent")}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="break-words font-semibold">{record.request.contact.name}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                  <p className="mt-2 text-sm font-medium">{record.request.source.code} → {record.request.destination.code}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatRequestDate(record.request.journeyDate)}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant={record.status === "approved" ? "default" : "secondary"}>
                      {record.status === "approved" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                      {requestStatusLabels[record.status]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{record.request.passengers.length} travellers</span>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
          <BookingRequestReview
            key={`${selected.id}-${selected.revision}`}
            record={selected}
            possibleDuplicates={possibleDuplicates}
            onCompleted={(status) => {
              setSelectedId(selected.id);
              setFilter(status);
              toast({
                title: requestStatusLabels[status],
                description: status === "approved"
                  ? "The booking was created with status Requested."
                  : "Your internal review note was saved. No customer message was sent.",
              });
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
