// components/admin/NeedsAttentionSummaryCard.tsx
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function NeedsAttentionSummaryCard({
  totalCount,
  ingestionTotal,
  syncTotal,
  className,
}: {
  totalCount: number;
  ingestionTotal: number;
  syncTotal: number;
  className?: string;
}) {
  const zero = totalCount === 0;
  return (
    <Link
      href="/admin/needs-attention"
      data-testid="needs-attention-summary-card"
      className={`flex min-h-tap-min items-center justify-between gap-3 rounded-md border border-border bg-surface-sunken p-tile-pad transition-colors duration-fast hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${className ?? ""}`}
    >
      <span className="flex min-w-0 flex-col gap-1">
        {zero ? (
          <>
            <span className="text-base font-semibold text-text-strong">All caught up</span>
            <span className="text-sm text-text-subtle">Nothing waiting on you.</span>
          </>
        ) : (
          <>
            <span className="text-base font-semibold text-text-strong">
              Needs attention · <span className="tabular-nums">{totalCount}</span>
            </span>
            <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-text-subtle">
              {ingestionTotal > 0 && (
                <span data-testid="summary-chip-ingestions" className="tabular-nums">
                  {ingestionTotal} couldn&apos;t process
                </span>
              )}
              {syncTotal > 0 && (
                <span data-testid="summary-chip-syncs" className="tabular-nums">
                  {syncTotal} to review
                </span>
              )}
            </span>
          </>
        )}
      </span>
      <ChevronRight className="size-5 shrink-0 text-text-subtle" aria-hidden="true" />
    </Link>
  );
}
