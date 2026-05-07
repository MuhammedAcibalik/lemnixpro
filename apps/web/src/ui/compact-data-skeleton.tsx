import { Skeleton } from "@/components/ui/skeleton";

type CompactDataSkeletonProps = {
  rows?: number;
};

export function CompactDataSkeleton({ rows = 3 }: CompactDataSkeletonProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div className="rounded-md border bg-card p-4" key={index}>
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MetricGridSkeleton() {
  return (
    <section className="metric-grid">
      {Array.from({ length: 4 }).map((_, index) => (
        <div className="rounded-md border bg-card p-4" key={index}>
          <div className="space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-36" />
          </div>
        </div>
      ))}
    </section>
  );
}
