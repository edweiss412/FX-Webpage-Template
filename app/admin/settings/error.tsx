"use client";

/**
 * app/admin/settings/error.tsx (M12.2 B1 Task 2.1)
 *
 * Client error boundary for /admin/settings (and any settings subsegment
 * without a closer error.tsx). Renders the FIXED ADMIN_ROUTE_LOAD_FAILED
 * Doug copy — NOT err.code (error.tsx is a client component; Next
 * serializes thrown errors as Error & { digest }, so a thrown `.code` is
 * unreliable in production).
 *
 * AGENTS.md invariant 5: the user-visible string flows through the
 * catalog. reset() is Next 16's built-in retry primitive.
 */
import { useEffect, useTransition } from "react";
import Link from "next/link";
import { getRequiredDougFacing } from "@/lib/messages/lookup";

export default function AdminSettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [isRetrying, startRetry] = useTransition();
  useEffect(() => {
    console.error("[admin/settings/error.tsx]", error);
  }, [error]);
  const message = getRequiredDougFacing("ADMIN_ROUTE_LOAD_FAILED");
  return (
    <main className="mx-auto max-w-2xl px-tile-pad pb-section-gap">
      <section
        data-testid="admin-settings-error-boundary"
        role="alert"
        className="flex flex-col gap-3 rounded-md border border-warning-text bg-warning-bg p-tile-pad text-warning-text"
      >
        <p className="text-base font-medium">{message}</p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => startRetry(() => reset())}
            disabled={isRetrying}
            aria-busy={isRetrying}
            data-testid="admin-settings-error-retry"
            className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-accent px-4 py-2 font-semibold text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRetrying ? "Retrying…" : "Retry"}
          </button>
          <Link
            href="/admin"
            data-testid="admin-settings-error-back"
            className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center px-3 text-sm font-medium underline-offset-2 hover:underline"
          >
            Back to admin
          </Link>
        </div>
      </section>
    </main>
  );
}
