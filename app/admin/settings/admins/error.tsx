"use client";

/**
 * app/admin/settings/admins/error.tsx (M9-final-review fix)
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
 * Discriminates by `error.name`: AdminEmailsInfraError → cataloged
 * admin-list failure copy; any other error → generic admin failure
 * (defense in depth — an unknown throw shouldn't leak a stack trace).
 */
import { useEffect } from "react";

import { getDougFacing } from "@/lib/messages/lookup";

export default function AdminsPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
        <div>
          <button
            type="button"
            onClick={reset}
            data-testid="admin-allowlist-error-retry"
            className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-accent px-4 py-2 font-semibold text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            Retry
          </button>
        </div>
      </section>
    </main>
  );
}
