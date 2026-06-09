import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export function AdminPageHeader({
  title,
  sub,
  subSlot,
  crumb,
  backHref,
  rightSlot,
}: {
  title: string;
  sub?: string;
  subSlot?: ReactNode;
  crumb?: string;
  backHref?: string;
  rightSlot?: ReactNode;
}) {
  return (
    <header
      data-testid="admin-page-header"
      className="mb-6 flex flex-col gap-1.5 border-b border-border pb-4"
    >
      {/* M12.8: the "ADMIN" eyebrow was removed — it duplicated the "Admin" label
          already shown in the top nav (components/admin/nav/AdminNav). */}
      {(crumb || backHref) && (
        // M12.6: crumb stays LEFT; "Back to dashboard" moves to the RIGHT of the
        // same row (with a ← arrow), matching the design.
        <div className="flex items-center justify-between gap-3 text-sm text-text-subtle">
          {crumb ? <span data-testid="admin-page-header-crumb">{crumb}</span> : <span />}
          {backHref && (
            <Link
              href={backHref}
              data-testid="admin-page-header-back"
              className="inline-flex min-h-tap-min items-center gap-1.5 underline-offset-2 hover:text-text hover:underline"
            >
              <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
              Back to dashboard
            </Link>
          )}
        </div>
      )}
      <div className="flex flex-col gap-2 min-[720px]:flex-row min-[720px]:items-center min-[720px]:justify-between">
        {/* M12.8: tracking-page-title (= -0.02em) matches the design bundle's
            `.page-title` letter-spacing exactly (Tailwind's `tracking-tight` is
            -0.025em). Named token per the no-arbitrary-tracking contract. */}
        <h1
          className="text-2xl font-semibold leading-[1.1] tracking-page-title text-text-strong"
          data-testid="admin-page-header-title"
        >
          {title}
        </h1>
        {rightSlot && (
          <div data-testid="admin-page-header-right" className="flex flex-wrap items-center gap-2">
            {rightSlot}
          </div>
        )}
      </div>
      {sub && <p className="max-w-prose text-base text-text-subtle">{sub}</p>}
      {/* subSlot renders inside the header — i.e. directly under the title, ABOVE
          the bottom divider — for callers that need a custom subtitle element
          (e.g. the per-show client·dates line keeps its own testid + sizing). */}
      {subSlot}
    </header>
  );
}
