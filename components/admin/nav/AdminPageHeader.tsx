import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export function AdminPageHeader({
  title, sub, subSlot, crumb, backHref, rightSlot,
}: { title: string; sub?: string; subSlot?: ReactNode; crumb?: string; backHref?: string; rightSlot?: ReactNode }) {
  return (
    <header data-testid="admin-page-header" className="mb-6 flex flex-col gap-1.5 border-b border-border pb-4">
      {!crumb && !backHref && (
        <p data-testid="admin-page-header-eyebrow" className="text-xs font-medium uppercase text-text-faint" style={{ letterSpacing: "var(--tracking-eyebrow)" }}>Admin</p>
      )}
      {(crumb || backHref) && (
        // M12.6: crumb stays LEFT; "Back to dashboard" moves to the RIGHT of the
        // same row (with a ← arrow), matching the design.
        <div className="flex items-center justify-between gap-3 text-sm text-text-subtle">
          {crumb ? <span data-testid="admin-page-header-crumb">{crumb}</span> : <span />}
          {backHref && (
            <Link href={backHref} data-testid="admin-page-header-back" className="inline-flex min-h-tap-min items-center gap-1.5 underline-offset-2 hover:text-text hover:underline">
              <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
              Back to dashboard
            </Link>
          )}
        </div>
      )}
      <div className="flex flex-col gap-2 min-[720px]:flex-row min-[720px]:items-center min-[720px]:justify-between">
        <h1 className="text-2xl font-semibold text-text-strong" data-testid="admin-page-header-title">{title}</h1>
        {rightSlot && <div data-testid="admin-page-header-right" className="flex flex-wrap items-center gap-2">{rightSlot}</div>}
      </div>
      {sub && <p className="max-w-prose text-base text-text-subtle">{sub}</p>}
      {/* subSlot renders inside the header — i.e. directly under the title, ABOVE
          the bottom divider — for callers that need a custom subtitle element
          (e.g. the per-show client·dates line keeps its own testid + sizing). */}
      {subSlot}
    </header>
  );
}
