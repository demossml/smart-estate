/**
 * Skeleton placeholder for loading states.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function DashboardSkeleton() {
  return (
    <div className="p-4 space-y-3 animate-pulse">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-24 w-full" />
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-[140px]" />
        <Skeleton className="h-[140px]" />
        <Skeleton className="h-[140px]" />
        <Skeleton className="h-[140px]" />
      </div>
      <Skeleton className="h-36 w-full" />
    </div>
  );
}
