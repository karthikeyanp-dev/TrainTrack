
"use client";

import { useState, useEffect } from "react";
import { format, isToday, isTomorrow } from "date-fns";

interface DateGroupHeadingProps {
  dateString: string;
  isJourneyDate?: boolean;
}

export function DateGroupHeading({ dateString, isJourneyDate = false }: DateGroupHeadingProps) {
  const [displayDate, setDisplayDate] = useState("..."); // Initial placeholder

  useEffect(() => {
    // Parse the YYYY-MM-DD string.
    // Adding 'T00:00:00' ensures it's parsed as local time at midnight.
    const dateParts = dateString.split('-').map(Number);
    const localDateAtMidnight = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);

    let dateText: string;
    if (isToday(localDateAtMidnight)) {
      dateText = `Today (${format(localDateAtMidnight, "EEEE")})`;
    } else if (isTomorrow(localDateAtMidnight)) {
      dateText = `Tomorrow (${format(localDateAtMidnight, "EEEE")})`;
    } else {
      // Change format to short month name (e.g., "Jan 20, 2024") and weekday in parentheses
      dateText = format(localDateAtMidnight, "MMM d, yyyy (EEEE)");
    }
    
    const prefix = isJourneyDate ? "Journey Date: " : "";
    setDisplayDate(`${prefix}${dateText}`);

  }, [dateString, isJourneyDate]);

  return (
    <h3 className="text-xl font-medium pb-2 border-b">
      {displayDate}
    </h3>
  );
}
