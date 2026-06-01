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

import { getRequiredDougFacing } from "@/lib/messages/lookup";

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

  // M12.2 B1 (Task 2.1) REPOINT: ADMIN_EMAIL_LIST_FAILED → the fixed
  // generic ADMIN_ROUTE_LOAD_FAILED. After B1, the administrator-list
  // read flows through the typed fetchEmbeddedAdminEmails wrapper
  // (Task 6.2), so list-read faults are handled IN-SECTION. The only
  // faults that reach this client boundary are route/session/uncaught
  // faults (e.g. the page's requireAdminIdentity() gate). A client
  // boundary cannot inspect err.code, so a fixed ADMIN_EMAIL_LIST_FAILED
  // here would mislabel a session/auth fault as "couldn't load the
  // administrator list." All three admin error.tsx boundaries render the
  // same fixed code.
  const message = getRequiredDougFacing("ADMIN_ROUTE_LOAD_FAILED");

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
              retry loop on a persistent failure. Routes to /admin
              (the production-safe landing page added in R15;
              R11/R12/R13/R14 history: R11 targeted /admin which
              404'd, R12-14 retargeted to /admin/dev which is build-
              gated out of production, R15 created the always-built
              /admin landing). */}
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
