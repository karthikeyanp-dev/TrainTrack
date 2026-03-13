'use client';

import { useState, useEffect, useMemo } from 'react';
import { useInView } from 'react-intersection-observer';
import { motion, AnimatePresence } from 'framer-motion';
import type { Booking, TrainClass } from '@/types/booking';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Search, Loader2, Calendar, CheckCircle2, Clock, Receipt, Layers } from "lucide-react";
import { DateGroupHeading } from "@/components/bookings/DateGroupHeading";
import { BookingList } from "@/components/bookings/BookingList";
import { BookingGroupCard } from "@/components/bookings/BookingGroupCard";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

import { Button } from "@/components/ui/button";
import { createBookingGroup } from "@/lib/firestoreClient";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { staggerContainer, staggerItem, fadeInUp } from "@/lib/animations";

/**
 * Payment tracking feature start date.
 * Bookings created/updated before this date should NOT show as pending for payment tracking.
 * Set to March 6, 2026 (yesterday when feature was implemented).
 */
const PAYMENT_TRACKING_START_DATE = new Date('2026-03-06T00:00:00.000Z');

/**
 * Check if a booking is eligible for payment tracking (created/updated on or after the feature start date)
 */
const isEligibleForPaymentTracking = (booking: Booking): boolean => {
  const createdAt = new Date(booking.createdAt);
  const updatedAt = new Date(booking.updatedAt);
  // Use the later of createdAt or updatedAt
  const relevantDate = updatedAt > createdAt ? updatedAt : createdAt;
  return relevantDate >= PAYMENT_TRACKING_START_DATE;
};

// Payment filter types
export type PaymentFilterType = 'all' | 'payment-pending' | 'settlement-pending';

interface BookingsViewProps {
  allBookings: Booking[];
  pendingBookings: Booking[];
  allBookingDates: string[];
  searchQuery?: string;
}

import { RefundsManager } from "@/components/accounts/RefundsManager";

const DATES_PER_PAGE = 10;

const groupBookingsByDate = (bookings: Booking[], dateKey: 'bookingDate' | 'journeyDate'): Record<string, Booking[]> => {
  return bookings.reduce((acc, booking) => {
    const key = booking[dateKey];
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(booking);
    return acc;
  }, {} as Record<string, Booking[]>);
};

const SL_CLASSES: TrainClass[] = ["SL", "UR", "2S"];

export function BookingsView({ allBookings, pendingBookings, allBookingDates, searchQuery }: BookingsViewProps) {
    const { toast } = useToast();
    const router = useRouter();
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedBookingIds, setSelectedBookingIds] = useState<Set<string>>(new Set());
    const [isGrouping, setIsGrouping] = useState(false);
    const [paymentFilter, setPaymentFilter] = useState<PaymentFilterType>('all');

    const handleToggleSelection = (id: string) => {
        const newSet = new Set(selectedBookingIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedBookingIds(newSet);
    };

    const handleGroupBookings = async () => {
        if (selectedBookingIds.size < 2) {
            toast({ title: "Error", description: "Select at least 2 bookings to group.", variant: "destructive" });
            return;
        }

        setIsGrouping(true);
        try {
            const result = await createBookingGroup(Array.from(selectedBookingIds));
            if (result.success) {
                toast({ title: "Group Created", description: `Successfully grouped ${selectedBookingIds.size} bookings.` });
                setSelectionMode(false);
                setSelectedBookingIds(new Set());
                // Invalidate query to refresh data
                // router.refresh() might not be enough if using client-side fetching hooks
                // Assuming useBookings hook handles real-time updates or we need to trigger a refetch
                // Since this component receives props, the parent page might need to refetch
                router.refresh(); 
            } else {
                toast({ title: "Error", description: result.error, variant: "destructive" });
            }
        } catch (error) {
            toast({ title: "Error", description: "An unexpected error occurred.", variant: "destructive" });
        } finally {
            setIsGrouping(false);
        }
    };

    const [page, setPage] = useState(1);
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const { ref, inView } = useInView({
        threshold: 0,
        triggerOnce: false,
    });
    
    const visibleDates = useMemo(() => {
        return allBookingDates.slice(0, page * DATES_PER_PAGE);
    }, [allBookingDates, page]);

    const hasMore = visibleDates.length < allBookingDates.length;

    const loadMoreDates = () => {
        if (isLoading || !hasMore || searchQuery) return;
        setIsLoading(true);
        // Simulate network latency for a better UX
        setTimeout(() => {
            setPage(prevPage => prevPage + 1);
            setIsLoading(false);
        }, 500); 
    };

    useEffect(() => {
        if (inView && !isLoading) {
            loadMoreDates();
        }
    }, [inView, isLoading]);
    
    // When a search query is cleared, reset pagination
    useEffect(() => {
        if (!searchQuery) {
            setPage(1);
        }
    }, [searchQuery]);

    // Reset payment filter when search query changes
    useEffect(() => {
        if (searchQuery) {
            setPaymentFilter('all');
        }
    }, [searchQuery]);


    const { pendingBookingsByDate, pendingDates, completedBookingsByDate, completedDates, paymentPendingCount, settlementPendingCount } = useMemo(() => {
        const sourceBookings = allBookings;

        // --- Pending Bookings Logic (now uses pre-fetched pendingBookings prop) ---
        const pendingSource = searchQuery ? pendingBookings.filter(b => b.status === 'Requested') : pendingBookings;
        const pendingBookingsByDate = groupBookingsByDate(pendingSource, 'bookingDate');
        const pendingDates = Object.keys(pendingBookingsByDate).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());


        // --- Completed Bookings Logic ---
        let completedBookingsToDisplay = searchQuery 
            ? sourceBookings.filter(b => b.status !== 'Requested')
            : sourceBookings.filter(b => {
                const visibleDateSet = new Set(visibleDates);
                // Completed bookings exclude Requested
                // Exclude Booking Failed (Paid) and CNF & Cancelled IF they don't have refundDetails (those go to Refunds tab)
                if (b.status === 'Booking Failed (Paid)' && !b.refundDetails) return false;
                if (b.status === 'CNF & Cancelled' && !b.refundDetails) return false;
                
                return b.status !== 'Requested' && visibleDateSet.has(b.bookingDate);
            });
        
        // --- Payment Tracking Filter ---
        // Count pending payments for eligible bookings (created/updated after feature start date)
        const eligibleForTracking = completedBookingsToDisplay.filter(b => b.status === 'Booked' && isEligibleForPaymentTracking(b));
        const paymentPendingCount = eligibleForTracking.filter(b => !b.paymentReceived).length;
        const settlementPendingCount = eligibleForTracking.filter(b => !b.amountSettled).length;
        
        // Apply payment filter if active
        if (paymentFilter !== 'all') {
            completedBookingsToDisplay = completedBookingsToDisplay.filter(b => {
                // Only "Booked" status with payment tracking eligibility
                if (b.status !== 'Booked' || !isEligibleForPaymentTracking(b)) {
                    return false; // Hide non-eligible bookings when filter is active
                }
                
                if (paymentFilter === 'payment-pending') {
                    return !b.paymentReceived;
                }
                if (paymentFilter === 'settlement-pending') {
                    return !b.amountSettled;
                }
                return true;
            });
        }
            
        const completedBookingsByDate = groupBookingsByDate(
             completedBookingsToDisplay.sort((a, b) => new Date(b.journeyDate).getTime() - new Date(a.journeyDate).getTime()),
             'bookingDate'
        );
        const completedDates = Object.keys(completedBookingsByDate).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

        return { pendingBookingsByDate, pendingDates, completedBookingsByDate, completedDates, paymentPendingCount, settlementPendingCount };
    }, [allBookings, pendingBookings, visibleDates, searchQuery, paymentFilter]);


  const renderBookingsForDate = (bookingsForDate: Booking[]) => {
    // 1. Extract groups and singles
    const groups: Record<string, Booking[]> = {};
    const singles: Booking[] = [];
    
    bookingsForDate.forEach(b => {
        if (b.groupId) {
            if (!groups[b.groupId]) groups[b.groupId] = [];
            groups[b.groupId].push(b);
        } else {
            singles.push(b);
        }
    });

    // Helper to categorize a group by its bookings' properties
    // Uses the first booking's type to determine category (groups typically share same type)
    const categorizeGroup = (groupBookings: Booking[]) => {
        const firstBooking = groupBookings[0];
        const isGeneral = ['General', 'Regular'].includes(String(firstBooking.bookingType));
        const isSL = SL_CLASSES.includes(firstBooking.classType);
        return { isGeneral, isSL };
    };

    // Categorize groups
    const generalAcGroups: [string, Booking[]][] = [];
    const generalSlGroups: [string, Booking[]][] = [];
    const tatkalAcGroups: [string, Booking[]][] = [];
    const tatkalSlGroups: [string, Booking[]][] = [];

    Object.entries(groups).forEach(([groupId, groupBookings]) => {
        const { isGeneral, isSL } = categorizeGroup(groupBookings);
        if (isGeneral) {
            if (isSL) {
                generalSlGroups.push([groupId, groupBookings]);
            } else {
                generalAcGroups.push([groupId, groupBookings]);
            }
        } else {
            if (isSL) {
                tatkalSlGroups.push([groupId, groupBookings]);
            } else {
                tatkalAcGroups.push([groupId, groupBookings]);
            }
        }
    });

    // Separate General (includes legacy 'Regular') and Tatkal bookings from SINGLES
    const generalBookings = singles.filter(b => ['General', 'Regular'].includes(String(b.bookingType)));
    const tatkalBookings = singles.filter(b => b.bookingType === 'Tatkal');
    
    // For General, separate by AC/SL classes
    const generalAcBookings = generalBookings.filter(b => !SL_CLASSES.includes(b.classType));
    const generalSlBookings = generalBookings.filter(b => SL_CLASSES.includes(b.classType));
    
    // For Tatkal, separate by AC/SL classes
    const tatkalAcBookings = tatkalBookings.filter(b => !SL_CLASSES.includes(b.classType));
    const tatkalSlBookings = tatkalBookings.filter(b => SL_CLASSES.includes(b.classType));

    const listProps = {
        selectionMode,
        selectedBookingIds,
        onToggleSelection: handleToggleSelection
    };

    // Helper to render groups for a category
    const renderGroupCards = (categoryGroups: [string, Booking[]][]) => (
        categoryGroups.length > 0 && (
            <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 mb-4">
                {categoryGroups.map(([groupId, groupBookings]) => (
                    <BookingGroupCard 
                        key={groupId} 
                        groupId={groupId} 
                        bookings={groupBookings} 
                        {...listProps}
                    />
                ))}
            </div>
        )
    );

    return (
      <>
        {(generalAcGroups.length > 0 || generalAcBookings.length > 0) && (
          <div className="mt-4">
            <h4 className="text-lg font-medium mb-2 text-amber-700 dark:text-amber-600">General - AC Bookings</h4>
            {renderGroupCards(generalAcGroups)}
            {generalAcBookings.length > 0 && <BookingList bookings={generalAcBookings} {...listProps} />}
          </div>
        )}
        {(generalSlGroups.length > 0 || generalSlBookings.length > 0) && (
          <div className="mt-4">
            <h4 className="text-lg font-medium mb-2 text-amber-700 dark:text-amber-600">General - SL Bookings</h4>
            {renderGroupCards(generalSlGroups)}
            {generalSlBookings.length > 0 && <BookingList bookings={generalSlBookings} {...listProps} />}
          </div>
        )}
        {(tatkalAcGroups.length > 0 || tatkalAcBookings.length > 0) && (
          <div className="mt-4">
            <h4 className="text-lg font-medium mb-2 text-primary">Tatkal - AC Bookings</h4>
            {renderGroupCards(tatkalAcGroups)}
            {tatkalAcBookings.length > 0 && <BookingList bookings={tatkalAcBookings} {...listProps} />}
          </div>
        )}
        {(tatkalSlGroups.length > 0 || tatkalSlBookings.length > 0) && (
          <div className="mt-4">
            <h4 className="text-lg font-medium mb-2 text-accent">Tatkal - SL Bookings</h4>
            {renderGroupCards(tatkalSlGroups)}
            {tatkalSlBookings.length > 0 && <BookingList bookings={tatkalSlBookings} {...listProps} />}
          </div>
        )}
      </>
    );
    };
  
    const noPendingMessage = searchQuery 
        ? "No pending bookings found matching your search."
        : "No bookings are currently in 'Requested' status. Add a new one!";
    const noCompletedMessage = searchQuery
        ? "No completed bookings found matching your search."
        : "No bookings have been marked as 'Booked', 'Missed', 'Failed', 'Cancelled' etc. yet.";

    return (
        <motion.div
            initial="initial"
            animate="animate"
            variants={staggerContainer}
        >
            <motion.div variants={staggerItem} className="flex justify-end items-center mb-6 gap-2">
                {selectionMode ? (
                    <motion.div 
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-2"
                    >
                         <span className="text-sm font-medium mr-2 px-3 py-1 bg-primary/10 text-primary rounded-full">
                            {selectedBookingIds.size} Selected
                         </span>
                         <Button variant="outline" size="sm" onClick={() => { setSelectionMode(false); setSelectedBookingIds(new Set()); }}>
                            Cancel
                         </Button>
                         <Button size="sm" onClick={handleGroupBookings} disabled={selectedBookingIds.size < 2 || isGrouping}>
                            {isGrouping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Layers className="mr-2 h-4 w-4" />}
                            Group Selected
                         </Button>
                    </motion.div>
                ) : (
                    <Button variant="outline" size="sm" onClick={() => setSelectionMode(true)}>
                        <Layers className="mr-2 h-4 w-4" />
                        Select Multiple
                    </Button>
                )}
            </motion.div>

            <Tabs defaultValue="pending" className="w-full">
              <TabsList className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground w-full md:w-[420px]">
                <TabsTrigger 
                    value="pending" 
                    className="inline-flex items-center justify-center gap-2 rounded-sm px-3 py-1.5 text-sm font-medium data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm flex-1"
                >
                    <Clock className="h-4 w-4" />
                    Pending
                </TabsTrigger>
                <TabsTrigger 
                    value="completed"
                    className="inline-flex items-center justify-center gap-2 rounded-sm px-3 py-1.5 text-sm font-medium data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm flex-1"
                >
                    <CheckCircle2 className="h-4 w-4" />
                    Completed
                </TabsTrigger>
                <TabsTrigger 
                    value="refunds"
                    className="inline-flex items-center justify-center gap-2 rounded-sm px-3 py-1.5 text-sm font-medium data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm flex-1"
                >
                    <Receipt className="h-4 w-4" />
                    Refunds
                </TabsTrigger>
              </TabsList>

              <TabsContent value="pending" className="mt-6">
                <motion.div variants={staggerItem}>
                    <div className="flex items-center gap-3 mb-6">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                            <Clock className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-heading-3 font-semibold">Pending Bookings</h2>
                            <p className="text-sm text-muted-foreground">
                                {pendingDates.length} date{pendingDates.length !== 1 ? 's' : ''} with pending requests
                            </p>
                        </div>
                    </div>
                </motion.div>
                {pendingDates.length === 0 ? (
                  <motion.div variants={staggerItem}>
                    <Alert className="mt-4 border-dashed">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                            {searchQuery ? <Search className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
                        </div>
                        <AlertTitle className="mt-2">{searchQuery ? "Search Results" : "No Pending Bookings"}</AlertTitle>
                        <AlertDescription>{noPendingMessage}</AlertDescription>
                    </Alert>
                  </motion.div>
                ) : (
                  <Accordion type="multiple" className="w-full space-y-4" defaultValue={pendingDates.length > 0 ? [pendingDates[0]] : []}>
                    {pendingDates.map((date, index) => (
                      <motion.div
                        key={`pending-${date}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <AccordionItem value={date} className="border rounded-2xl px-4 bg-card shadow-elevation-1">
                            <AccordionTrigger className="py-4 hover:no-underline">
                                <DateGroupHeading dateString={date} />
                            </AccordionTrigger>
                            <AccordionContent className="pb-4">
                                {renderBookingsForDate(pendingBookingsByDate[date])}
                            </AccordionContent>
                        </AccordionItem>
                      </motion.div>
                    ))}
                  </Accordion>
                )}
              </TabsContent>

              <TabsContent value="completed" className="mt-6">
                <motion.div variants={staggerItem}>
                    <div className="flex flex-col gap-4 mb-6">
                        {/* Header Row */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                </div>
                                <div>
                                    <h2 className="text-heading-3 font-semibold">Completed Bookings</h2>
                                    <p className="text-sm text-muted-foreground">
                                        {completedDates.length} date{completedDates.length !== 1 ? 's' : ''} with completed bookings
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Filter Pills - Desktop: Horizontal, Mobile: Wrap or Single Select */}
                        <div className="flex flex-wrap items-center gap-2">
                            {/* All Filter */}
                            <button
                                onClick={() => setPaymentFilter('all')}
                                className={cn(
                                    "h-9 px-4 py-2 rounded-full text-sm font-medium transition-all",
                                    paymentFilter === 'all'
                                        ? "bg-primary text-primary-foreground shadow-elevation-2 ring-2 ring-primary/20"
                                        : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                                )}
                            >
                                All
                            </button>

                            {/* Payment Pending - Only show if there are any */}
                            {paymentPendingCount > 0 && (
                                <button
                                    onClick={() => setPaymentFilter('payment-pending')}
                                    className={cn(
                                        "h-9 px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2",
                                        paymentFilter === 'payment-pending'
                                            ? "bg-amber-500 text-white shadow-elevation-2 ring-2 ring-amber-500/20"
                                            : "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20"
                                    )}
                                >
                                    <span className="flex h-2 w-2 rounded-full bg-current animate-pulse" />
                                    Payment Pending
                                    <span className={cn(
                                        "px-1.5 py-0.5 text-xs rounded-full",
                                        paymentFilter === 'payment-pending' ? "bg-white/20" : "bg-amber-500/20"
                                    )}>
                                        {paymentPendingCount}
                                    </span>
                                </button>
                            )}

                            {/* Settlement Pending - Only show if there are any */}
                            {settlementPendingCount > 0 && (
                                <button
                                    onClick={() => setPaymentFilter('settlement-pending')}
                                    className={cn(
                                        "h-9 px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2",
                                        paymentFilter === 'settlement-pending'
                                            ? "bg-purple-500 text-white shadow-elevation-2 ring-2 ring-purple-500/20"
                                            : "bg-purple-500/10 text-purple-600 hover:bg-purple-500/20"
                                    )}
                                >
                                    <span className="flex h-2 w-2 rounded-full bg-current" />
                                    Settlement Pending
                                    <span className={cn(
                                        "px-1.5 py-0.5 text-xs rounded-full",
                                        paymentFilter === 'settlement-pending' ? "bg-white/20" : "bg-purple-500/20"
                                    )}>
                                        {settlementPendingCount}
                                    </span>
                                </button>
                            )}

                            {/* Summary text when filters are active */}
                            {paymentFilter !== 'all' && (
                                <button
                                    onClick={() => setPaymentFilter('all')}
                                    className="text-xs text-muted-foreground hover:text-foreground underline ml-2"
                                >
                                    Clear filter
                                </button>
                            )}
                        </div>
                    </div>
                </motion.div>
                {completedDates.length === 0 ? (
                  <Alert className="mt-4">
                    {searchQuery ? <Search className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                    <AlertTitle>{searchQuery ? "Search Results" : paymentFilter !== 'all' ? "No Pending Payments" : "No Completed Bookings"}</AlertTitle>
                    <AlertDescription>
                      {searchQuery ? noCompletedMessage : paymentFilter !== 'all' 
                        ? `No bookings with ${paymentFilter === 'payment-pending' ? 'pending customer payments' : 'pending settlements'} found.`
                        : noCompletedMessage}
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Accordion type="multiple" className="w-full space-y-4" defaultValue={completedDates.length > 0 ? [completedDates[0]] : []}>
                    {completedDates.map(date => (
                      <AccordionItem value={date} key={`completed-${date}`} className="border-b-0">
                        <AccordionTrigger className="p-0 hover:no-underline">
                          <DateGroupHeading dateString={date} />
                        </AccordionTrigger>
                        <AccordionContent>
                          {renderBookingsForDate(completedBookingsByDate[date])}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
              </TabsContent>

              <TabsContent value="refunds" className="mt-6">
                <RefundsManager />
              </TabsContent>
            </Tabs>

            {!searchQuery && hasMore && (
              <div ref={ref} className="flex justify-center items-center p-4 h-10">
                {isLoading && <Loader2 className="h-8 w-8 animate-spin text-primary" />}
              </div>
            )}
            {!searchQuery && !hasMore && allBookingDates.length > 0 && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center text-muted-foreground p-4"
              >
                You've reached the end of the list.
              </motion.div>
            )}
        </motion.div>
    );
}
