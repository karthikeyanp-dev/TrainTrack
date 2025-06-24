
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

function CardSkeleton() {
  return (
    <Card className="p-6 space-y-4">
      <div className="flex justify-between items-start">
        <div className="space-y-1.5">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-5/6" />
      </div>
      <div className="flex justify-between items-center pt-4 border-t">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-32" />
      </div>
    </Card>
  );
}

export function BookingsLoadingSkeleton() {
  return (
    <div className="w-full space-y-6">
      <div className="flex space-x-2">
        <Skeleton className="h-10 w-1/2 md:w-[200px]" />
        <Skeleton className="h-10 w-1/2 md:w-[200px]" />
      </div>
      <Skeleton className="h-8 w-48 mb-4" />
      
      <div className="space-y-6">
        <Skeleton className="h-7 w-1/3 mb-3" /> 
        <div className="space-y-3">
            <Skeleton className="h-6 w-1/4" />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <CardSkeleton />
            </div>
        </div>
        <div className="space-y-3 mt-4">
            <Skeleton className="h-6 w-1/4" />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <CardSkeleton />
                <CardSkeleton />
            </div>
        </div>
      </div>
    </div>
  );
}
