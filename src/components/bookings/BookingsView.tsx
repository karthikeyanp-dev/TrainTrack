
'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';
import { useInView } from 'react-intersection-observer';
import type { Booking, TrainClass } from '@/types/booking';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Search, Loader2 } from "lucide-react";
import { DateGroupHeading } from "@/components/bookings/DateGroupHeading";
import { BookingList } from "@/components/bookings/BookingList";

interface BookingsViewProps {
  allBookings: Booking[];
  allBookingDates: string[];
  searchQuery?: string;
}

const DATES_PER_PAGE = 10;

const groupBookingsByDate = (bookings: Booking[]): Record<string, Booking[]> => {
  return bookings.reduce((acc, booking) => {
    const dateKey = booking.bookingDate; 
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(booking);
    return acc;
  }, {} as Record<string, Booking[]>);
};

const SL_CLASSES: TrainClass[] = ["SL", "UR", "2S"];

export function BookingsView({ allBookings, allBookingDates, searchQuery }: BookingsViewProps) {
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


    const bookingsToDisplay = useMemo(() => {
        if (searchQuery) {
            return allBookings; // In search mode, all filtered bookings are passed in
        }
        const visibleDateSet = new Set(visibleDates);
        return allBookings.filter(booking => visibleDateSet.has(booking.bookingDate));
    }, [allBookings, visibleDates, searchQuery]);


    const { pendingDates, pendingBookingsByDate, completedDates, completedBookingsByDate } = useMemo(() => {
        const pendingBookingsRaw = bookingsToDisplay
            .filter(booking => booking.status === "Requested")
            .sort((a, b) => new Date(a.journeyDate).getTime() - new Date(b.journeyDate).getTime());

        const completedBookingsRaw = bookingsToDisplay
            .filter(booking => booking.status !== "Requested")
            .sort((a, b) => new Date(b.journeyDate).getTime() - new Date(a).journeyDate).getTime());

        const pendingBookingsByDate = groupBookingsByDate(pendingBookingsRaw);
        const pendingDates = Object.keys(pendingBookingsByDate).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

        const completedBookingsByDate = groupBookingsByDate(completedBookingsRaw);
        const completedDates = Object.keys(completedBookingsByDate).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        
        return { pendingDates, pendingBookingsByDate, completedDates, completedBookingsByDate };
    }, [bookingsToDisplay]);

    const renderBookingsForDate = (bookingsForDate: Booking[]) => {
        const acBookings = bookingsForDate.filter(b => !SL_CLASSES.includes(b.classType));
        const slBookings = bookingsForDate.filter(b => SL_CLASSES.includes(b.classType));

        return (
          <>
            {acBookings.length > 0 && (
              <div className="mt-4">
                <h4 className="text-lg font-medium mb-2 text-primary">AC Bookings</h4>
                <BookingList bookings={acBookings} />
              </div>
            )}
            {slBookings.length > 0 && (
              <div className="mt-4">
                <h4 className="text-lg font-medium mb-2 text-accent">SL Bookings</h4>
                <BookingList bookings={slBookings} />
              </div>
            )}
            {acBookings.length === 0 && slBookings.length === 0 && bookingsForDate.length > 0 && (
              <BookingList bookings={bookingsForDate} />
            )}
          </>
        );
    };
  
    const noPendingMessage = searchQuery 
        ? "No pending bookings found matching your search."
        : "No bookings are currently in 'Requested' status. Add a new one!";
    const noCompletedMessage = searchQuery
        ? "No completed bookings found matching your search."
        : "No bookings have been marked as 'Booked', 'Missed', 'Booking Failed', or 'User Cancelled' yet.";

    return (
        <>
            <Tabs defaultValue="pending" className="w-full">
            <TabsList className="grid w-full grid-cols-2 md:w-[400px]">
                <TabsTrigger value="pending">Pending</TabsTrigger>
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
                pendingDates.map(date => (
                    <div key={`pending-${date}`} className="mb-8">
                    <DateGroupHeading dateString={date} />
                    {renderBookingsForDate(pendingBookingsByDate[date])}
                    </div>
                ))
                )}
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
                completedDates.map(date => (
                    <div key={`completed-${date}`} className="mb-8">
                    <DateGroupHeading dateString={date} />
                    {renderBookingsForDate(completedBookingsByDate[date])}
                    </div>
                ))
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
