import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export function AdminPageHeader({
  title,
  sub,
  subSlot,
  titleAppendSlot,
  crumb,
  backHref,
  rightSlot,
}: {
  title: string;
  sub?: string;
  subSlot?: ReactNode;
  /* Inline content appended directly AFTER the title, vertically centered with
     it (e.g. the per-show status pill — "Validation — Before opening (R5)
     [Published]"). Wraps under the title on narrow widths. */
  titleAppendSlot?: ReactNode;
  crumb?: string;
  backHref?: string;
  rightSlot?: ReactNode;
}) {
  return (
    <header
      data-testid="admin-page-header"
      className="mb-6 flex flex-col gap-1 border-b border-border pb-4"
    >
      {/* M12.8: the "ADMIN" eyebrow was removed — it duplicated the "Admin" label
          already shown in the top nav (components/admin/nav/AdminNav). */}
      {(crumb || backHref) && (
        // M12.6: crumb stays LEFT; "Back to dashboard" moves to the RIGHT of the
        // same row (with a ← arrow), matching the design.
        // M12.9: the back link keeps its 44px tap target via a `before:` overlay
        // (same pattern as HoverHelp) INSTEAD of `min-h-tap-min`, so the crumb
        // row collapses to text height and the title sits right beneath it
        // (was a 44px-tall row that padded a big gap above the title).
        <div className="flex items-center justify-between gap-3 text-sm text-text-subtle">
          {crumb ? <span data-testid="admin-page-header-crumb">{crumb}</span> : <span />}
          {backHref && (
            <Link
              href={backHref}
              data-testid="admin-page-header-back"
              className="relative inline-flex items-center gap-1.5 underline-offset-2 before:absolute before:-inset-x-2 before:-top-6 before:bottom-0 before:content-[''] hover:text-text hover:underline"
            >
              <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
              Back to dashboard
            </Link>
          )}
        </div>
      )}
      <div className="flex flex-col gap-2 min-[720px]:flex-row min-[720px]:items-center min-[720px]:justify-between">
        {/* M12.9: title + subSlot are grouped into a tight left COLUMN so the
            rightSlot (per-show share-link chip) vertically centers against the
            whole title+subtitle block, not just the title. */}
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {/* M12.8: tracking-page-title (= -0.02em) matches the design bundle's
                `.page-title` letter-spacing exactly (Tailwind's `tracking-tight`
                is -0.025em). Named token per the no-arbitrary-tracking contract. */}
            <h1
              className="text-2xl font-semibold leading-[1.1] tracking-page-title text-text-strong"
              data-testid="admin-page-header-title"
            >
              {title}
            </h1>
            {titleAppendSlot && (
              <div
                data-testid="admin-page-header-title-append"
                className="flex flex-wrap items-center gap-2"
              >
                {titleAppendSlot}
              </div>
            )}
          </div>
          {/* subSlot renders directly under the title (e.g. the per-show
              client·dates line keeps its own testid + sizing). */}
          {subSlot}
        </div>
        {rightSlot && (
          <div
            data-testid="admin-page-header-right"
            className="flex flex-wrap items-center gap-2 min-[720px]:shrink-0"
          >
            {rightSlot}
          </div>
        )}
      </div>
      {/* M12.9: the header flex gap tightened to gap-1 (4px) for the per-show
          crumb→title rhythm. The string `sub` variant (dashboard/settings) adds
          back mt-0.5 so ITS title→sub spacing stays at the prior 6px — the tighter
          rhythm is scoped to the per-show crumb/title/subSlot path only. */}
      {sub && <p className="mt-0.5 max-w-prose text-base text-text-subtle">{sub}</p>}
    </header>
  );
}
