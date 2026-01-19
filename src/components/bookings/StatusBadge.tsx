
import type { BookingStatus } from "@/types/booking";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: BookingStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  let variant: "default" | "secondary" | "destructive" | "outline" = "default";
  let className = "";

  switch (status) {
    case "Requested":
      // Using primary color for requested, Badge default variant uses primary
      className = "bg-blue-500 hover:bg-blue-600 text-white"; // Direct Tailwind for specific blue
      break;
    case "Booked":
      variant = "default";
      className = "bg-green-600 hover:bg-green-700 text-white";
      break;
    case "Missed":
      variant = "secondary";
      className = "bg-yellow-500 hover:bg-yellow-600 text-black";
      break;
    case "Failed (Paid)":
      variant = "destructive";
      className = "bg-red-700 hover:bg-red-800 text-white";
      break;
    case "Failed (Unpaid)":
      variant = "destructive";
      break;
    case "Cancelled (Booked)":
      variant = "secondary";
      className = "bg-orange-600 hover:bg-orange-700 text-white";
      break;
    case "Cancelled (Pre-book)":
      variant = "secondary";
      className = "bg-gray-500 hover:bg-gray-600 text-white";
      break;
    default:
      variant = "outline";
  }

  return (
    <Badge variant={variant} className={cn("capitalize", className)}>
      {status}
    </Badge>
  );
}
