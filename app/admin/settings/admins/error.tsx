"use client";

/**
 * app/admin/settings/admins/error.tsx (M9-final-review fix + R11 polish)
 *
 * Route-segment error boundary for the admin allow-list page. Catches
 * AdminEmailsInfraError thrown from listAdminEmails() so Doug sees a
 * cataloged retryable message instead of Next.js's generic error page
 * when Supabase / RLS / schema-cache skew breaks the SELECT.
 *
 * AGENTS.md invariant 5: every user-visible string flows through the
 * catalog. The reset() callback is Next 16's built-in retry primitive
 * — it re-runs the segment without a full page reload.
 *
 * R11 critique additions (impeccable dual-gate per AGENTS.md §8):
 *   - useTransition wrap on Retry so the button reflects pending state
 *     (P2 — pre-fix, sync-fire-and-forget reset gave no visual feedback).
 *   - "Back to admin" Link as secondary escape if retry keeps failing
 *     (P1 — pre-fix, Doug was trapped in a retry-loop with no exit).
 *   - Escalation sub-line tells Doug operator visibility exists (P2).
 */
import { useEffect, useTransition } from "react";
import Link from "next/link";

import { getDougFacing } from "@/lib/messages/lookup";

export default function AdminsPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [isRetrying, startRetry] = useTransition();

  useEffect(() => {
    // Server logs already carry the stack via Next; this client-side
    // log is for the browser console so an operator can copy/paste
    // when reporting.
    console.error("[admins/error.tsx]", error);
  }, [error]);

  // Single catalog code covers both AdminEmailsInfraError and any
  // unknown throw — the copy ("can't load the administrator list
  // right now") fits both classes. Distinguishing them in user-facing
  // text would leak implementation detail; the operator-facing
  // distinction lives in the console.error above + Next's server
  // logs which carry the original stack + error.name.
  const message = getDougFacing("ADMIN_EMAIL_LIST_FAILED");

  return (
    <main className="mx-auto max-w-2xl px-tile-pad pb-section-gap">
      <header className="mb-section-gap">
        <h1 className="text-xl font-semibold text-text-strong">Administrators</h1>
      </header>
      <section
        data-testid="admin-allowlist-error-boundary"
        role="alert"
        className="flex flex-col gap-3 rounded-md border border-warning-text bg-warning-bg p-tile-pad text-warning-text"
      >
        <p className="text-base font-medium">{message}</p>
        {/* P2 fix: escalation sub-line tells Doug operator visibility
            exists. Invariant 5 satisfied: copy is non-catalog UX text
            (no error code; informational). */}
        <p className="text-sm">
          If this keeps happening, the server-side log has the stack —
          check Supabase health or page the on-call admin.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => startRetry(() => reset())}
            disabled={isRetrying}
            aria-busy={isRetrying}
            data-testid="admin-allowlist-error-retry"
            className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-accent px-4 py-2 font-semibold text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRetrying ? "Retrying…" : "Retry"}
          </button>
          {/* P1 fix: secondary escape so Doug isn't trapped in a
              retry loop on a persistent failure. Goes back to the
              admin landing route. */}
          <Link
            href="/admin"
            data-testid="admin-allowlist-error-back"
            className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center px-3 text-sm font-medium underline-offset-2 hover:underline"
          >
            Back to admin
          </Link>
        </div>
      </section>
    </main>
  );
}
