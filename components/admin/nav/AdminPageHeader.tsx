import Link from "next/link";
import type { ReactNode } from "react";

export function AdminPageHeader({
  title, sub, crumb, backHref, rightSlot,
}: { title: string; sub?: string; crumb?: string; backHref?: string; rightSlot?: ReactNode }) {
  return (
    <header data-testid="admin-page-header" className="mb-section-gap flex flex-col gap-2">
      {!crumb && !backHref && (
        <p data-testid="admin-page-header-eyebrow" className="text-xs font-medium uppercase text-text-subtle" style={{ letterSpacing: "var(--tracking-eyebrow)" }}>Admin</p>
      )}
      {(crumb || backHref) && (
        <div className="flex items-center gap-3 text-sm text-text-subtle">
          {backHref && (
            <Link href={backHref} data-testid="admin-page-header-back" className="inline-flex min-h-tap-min items-center underline underline-offset-2 hover:text-text">
              Back to dashboard
            </Link>
          )}
          {crumb && <span data-testid="admin-page-header-crumb">{crumb}</span>}
        </div>
      )}
      <div className="flex flex-col gap-2 min-[720px]:flex-row min-[720px]:items-center min-[720px]:justify-between">
        <h1 className="text-2xl font-semibold text-text-strong" data-testid="admin-page-header-title">{title}</h1>
        {rightSlot && <div data-testid="admin-page-header-right" className="flex flex-wrap items-center gap-2">{rightSlot}</div>}
      </div>
      {sub && <p className="max-w-prose text-base text-text-subtle">{sub}</p>}
    </header>
  );
}
