
'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';
import { useInView } from 'react-intersection-observer';
import type { Booking, TrainClass } from '@/types/booking';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Search, Loader2 } from "lucide-react";
import { DateGroupHeading } from "@/components/bookings/DateGroupHeading";
import { BookingList } from "@/components/bookings/BookingList";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

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


    const { pendingBookingsByDate, pendingDates, completedBookingsByDate, completedDates } = useMemo(() => {
        const sourceBookings = allBookings;

        // --- Pending Bookings Logic (now uses pre-fetched pendingBookings prop) ---
        const pendingSource = searchQuery ? pendingBookings.filter(b => b.status === 'Requested') : pendingBookings;
        const pendingBookingsByDate = groupBookingsByDate(pendingSource, 'bookingDate');
        const pendingDates = Object.keys(pendingBookingsByDate).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());


        // --- Completed Bookings Logic ---
        const completedBookingsToDisplay = searchQuery 
            ? sourceBookings.filter(b => b.status !== 'Requested')
            : sourceBookings.filter(b => {
                const visibleDateSet = new Set(visibleDates);
                // Completed bookings exclude Requested
                // Exclude Booking Failed (Paid) and CNF & Cancelled IF they don't have refundDetails (those go to Refunds tab)
                if (b.status === 'Booking Failed (Paid)' && !b.refundDetails) return false;
                if (b.status === 'CNF & Cancelled' && !b.refundDetails) return false;
                
                return b.status !== 'Requested' && visibleDateSet.has(b.bookingDate);
            });
            
        const completedBookingsByDate = groupBookingsByDate(
             completedBookingsToDisplay.sort((a, b) => new Date(b.journeyDate).getTime() - new Date(a.journeyDate).getTime()),
             'bookingDate'
        );
        const completedDates = Object.keys(completedBookingsByDate).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

        return { pendingBookingsByDate, pendingDates, completedBookingsByDate, completedDates };
    }, [allBookings, pendingBookings, visibleDates, searchQuery]);


  const renderBookingsForDate = (bookingsForDate: Booking[]) => {
    // Separate General (includes legacy 'Regular') and Tatkal bookings
        const generalBookings = bookingsForDate.filter(b => ['General', 'Regular'].includes(String(b.bookingType)));
        const tatkalBookings = bookingsForDate.filter(b => b.bookingType === 'Tatkal');
        
        // For General, separate by AC/SL classes
        const generalAcBookings = generalBookings.filter(b => !SL_CLASSES.includes(b.classType));
        const generalSlBookings = generalBookings.filter(b => SL_CLASSES.includes(b.classType));
        
        // For Tatkal, separate by AC/SL classes
        const tatkalAcBookings = tatkalBookings.filter(b => !SL_CLASSES.includes(b.classType));
        const tatkalSlBookings = tatkalBookings.filter(b => SL_CLASSES.includes(b.classType));

        return (
          <>
            {generalAcBookings.length > 0 && (
              <div className="mt-4">
                <h4 className="text-lg font-medium mb-2 text-amber-700 dark:text-amber-600">General - AC Bookings</h4>
                <BookingList bookings={generalAcBookings} />
              </div>
            )}
            {generalSlBookings.length > 0 && (
              <div className="mt-4">
                <h4 className="text-lg font-medium mb-2 text-amber-700 dark:text-amber-600">General - SL Bookings</h4>
                <BookingList bookings={generalSlBookings} />
              </div>
            )}
            {tatkalAcBookings.length > 0 && (
              <div className="mt-4">
                <h4 className="text-lg font-medium mb-2 text-primary">Tatkal - AC Bookings</h4>
                <BookingList bookings={tatkalAcBookings} />
              </div>
            )}
            {tatkalSlBookings.length > 0 && (
              <div className="mt-4">
                <h4 className="text-lg font-medium mb-2 text-accent">Tatkal - SL Bookings</h4>
                <BookingList bookings={tatkalSlBookings} />
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
        <>
            <Tabs defaultValue="pending" className="w-full">
              <TabsList className="grid w-full grid-cols-3 md:w-[400px]">
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="refunds">Refunds</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
              </TabsList>

              <TabsContent value="pending" className="mt-6">
                <h2 className="text-2xl font-semibold mb-4">Pending Bookings</h2>
                {pendingDates.length === 0 ? (
                  <Alert className="mt-4">
                    {searchQuery ? <Search className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                    <AlertTitle>{searchQuery ? "Search Results" : "No Pending Bookings"}</AlertTitle>
                    <AlertDescription>{noPendingMessage}</AlertDescription>
                  </Alert>
                ) : (
                  <Accordion type="multiple" className="w-full space-y-4" defaultValue={pendingDates.length > 0 ? [pendingDates[0]] : []}>
                    {pendingDates.map(date => (
                      <AccordionItem value={date} key={`pending-${date}`} className="border-b-0">
                        <AccordionTrigger className="p-0 hover:no-underline">
                          <DateGroupHeading dateString={date} />
                        </AccordionTrigger>
                        <AccordionContent>
                          {renderBookingsForDate(pendingBookingsByDate[date])}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
              </TabsContent>

              <TabsContent value="refunds" className="mt-6">
                <RefundsManager />
              </TabsContent>

              <TabsContent value="completed" className="mt-6">
                <h2 className="text-2xl font-semibold mb-4">Completed Bookings</h2>
                {completedDates.length === 0 ? (
                  <Alert className="mt-4">
                    {searchQuery ? <Search className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                    <AlertTitle>{searchQuery ? "Search Results" : "No Completed Bookings"}</AlertTitle>
                    <AlertDescription>{noCompletedMessage}</AlertDescription>
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
            </Tabs>

            {!searchQuery && hasMore && (
              <div ref={ref} className="flex justify-center items-center p-4 h-10">
                {isLoading && <Loader2 className="h-8 w-8 animate-spin text-primary" />}
              </div>
            )}
            {!searchQuery && !hasMore && allBookingDates.length > 0 && (
              <div className="text-center text-muted-foreground p-4">
                You've reached the end of the list.
              </div>
            )}
        </>
    );
}
