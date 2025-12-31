import { UnifiedHomePage } from "@/components/UnifiedHomePage";
import { Suspense } from "react";
import { BookingsLoadingSkeleton } from "@/components/bookings/BookingsLoadingSkeleton";

export default function HomePage() {
  return (
    <Suspense fallback={<BookingsLoadingSkeleton />}>
      <UnifiedHomePage />
    </Suspense>
  );
}
