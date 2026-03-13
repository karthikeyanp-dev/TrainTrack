
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { motion } from "framer-motion";

function CardSkeleton({ index = 0 }: { index?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.3 }}
    >
      <Card className="p-5 space-y-4">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-20" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-5/6" />
        </div>
        <div className="flex justify-between items-center pt-3 border-t">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </Card>
    </motion.div>
  );
}

export function BookingsLoadingSkeleton() {
  return (
    <motion.div 
      className="w-full space-y-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Tabs skeleton */}
      <div className="flex space-x-2">
        <Skeleton className="h-10 w-1/2 md:w-[200px] rounded-lg" />
        <Skeleton className="h-10 w-1/2 md:w-[200px] rounded-lg" />
      </div>
      
      {/* Section header */}
      <Skeleton className="h-8 w-48 mb-4" />
      
      {/* Date groups with cards */}
      <div className="space-y-6">
        <motion.div 
          className="space-y-3"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Skeleton className="h-6 w-1/4" />
          <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
            <CardSkeleton index={0} />
          </div>
        </motion.div>
        
        <motion.div 
          className="space-y-3 mt-4"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Skeleton className="h-6 w-1/4" />
          <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
            <CardSkeleton index={1} />
            <CardSkeleton index={2} />
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
