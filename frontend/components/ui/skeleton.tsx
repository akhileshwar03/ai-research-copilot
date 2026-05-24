export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={[
        "animate-pulse rounded-lg bg-white/[0.04]",
        className,
      ].join(" ")}
    />
  );
}

export function DocumentSkeleton() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/[0.04] bg-[#111] px-3 py-2.5">
      <Skeleton className="h-4 w-4 shrink-0 rounded" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-2.5 w-3/4" />
        <Skeleton className="h-2 w-1/4" />
      </div>
    </div>
  );
}

export function SessionSkeleton() {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/[0.04] bg-[#111] px-3 py-2.5">
      <Skeleton className="h-3.5 w-3.5 shrink-0 rounded-full" />
      <Skeleton className="h-2.5 flex-1" />
    </div>
  );
}
