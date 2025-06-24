
"use client";

import { useState, useEffect } from "react";
import { format, isToday, isTomorrow } from "date-fns";

interface DateGroupHeadingProps {
  dateString: string;
}

export function DateGroupHeading({ dateString }: DateGroupHeadingProps) {
  const [displayDate, setDisplayDate] = useState("..."); // Initial placeholder

  useEffect(() => {
    // Parse the YYYY-MM-DD string.
    // Adding 'T00:00:00' ensures it's parsed as local time at midnight.
    const dateParts = dateString.split('-').map(Number);
    const localDateAtMidnight = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);

    if (isToday(localDateAtMidnight)) {
      setDisplayDate(`Today (${format(localDateAtMidnight, "EEEE")})`);
    } else if (isTomorrow(localDateAtMidnight)) {
      setDisplayDate(`Tomorrow (${format(localDateAtMidnight, "EEEE")})`);
    } else {
      setDisplayDate(format(localDateAtMidnight, "PPP (EEEE)")); // e.g., "Jul 20, 2024 (Saturday)"
    }
  }, [dateString]);

  return (
    <h3 className="text-xl font-medium mb-3 pb-2 border-b">
      {displayDate}
    </h3>
  );
}
