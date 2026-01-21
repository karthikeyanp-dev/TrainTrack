
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
    case "Booking Failed (Unpaid)":
    case "Booking Failed (Paid)":
      variant = "destructive"; // Uses destructive theme color (red)
      break;
    case "User Cancelled":
    case "CNF & Cancelled":
      variant = "secondary"; // Using secondary as a base for custom orange
      className = "bg-orange-500 hover:bg-orange-600 text-white";
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
