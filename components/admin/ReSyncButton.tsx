"use client";

/**
 * components/admin/ReSyncButton.tsx (M6 §B Task 6.11 — UI portion)
 *
 * Per-show "Re-sync" CTA mounted at the top of `/admin/show/[slug]`.
 * POSTs to §A's manual-sync route (Pin-stop 2 extension @ ddafda3):
 *
 *   POST /api/admin/sync/[slug]
 *
 * Errors render through <ErrorExplainer surface="admin" /> using the
 * §12.4 catalog so no raw codes leak into the DOM (invariant 5).
 *
 * Manual sync acquires the admin/blocking show lock (`tryOnly: false`)
 * and FINALIZE_OWNED_SHOW arms inside that locked transaction. A
 * successful sync ends with router.refresh() so the parse panel reads
 * fresh `pending_syncs` rows on the next render.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorExplainer } from "@/components/messages/ErrorExplainer";

export type ReSyncButtonProps = {
  slug: string;
};

// Friendly summary of `runManualSyncForShow`'s ProcessOneFileResult shapes
// (handoff §0 Pin-stop 2 contract). Plain-language so Doug doesn't read
// the raw enum on success.
function summarizeResult(result: unknown): string {
  if (!result || typeof result !== "object") return "Sync complete.";
  const outcome = (result as { outcome?: unknown }).outcome;
  switch (outcome) {
    case "applied":
      return "Synced. Changes applied.";
    case "stage":
      return "Synced. New change staged for review.";
    case "skipped":
      return "Synced. Nothing new from Drive.";
    case "asset_recovery":
      return "Synced. Recovering linked assets in the background.";
    case "hard_fail":
      return "Synced, but the parse failed an invariant. Review staged details.";
    case "stale":
      return "Synced. A newer parse already won, no changes applied.";
    case "revision_race":
      return "Synced, but Drive changed mid-read. Will retry on next sync.";
    case "source_gone":
      return "Sheet is no longer available in Drive.";
    case "parse_error":
      return "Synced, but the parse encountered an error. Review staged details.";
    default:
      return "Sync complete.";
  }
}

export function ReSyncButton({ slug }: ReSyncButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleClick = async () => {
    if (pending) return;
    setErrorCode(null);
    setSuccessMessage(null);
    setPending(true);
    try {
      const res = await fetch(`/api/admin/sync/${encodeURIComponent(slug)}`, { method: "POST" });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        result?: unknown;
      };
      if (json.ok) {
        setSuccessMessage(summarizeResult(json.result));
        router.refresh();
      } else {
        setErrorCode(typeof json.error === "string" ? json.error : "SYNC_INFRA_ERROR");
      }
    } catch {
      setErrorCode("SYNC_INFRA_ERROR");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        data-testid="admin-resync-button"
        aria-busy={pending}
        className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center self-start rounded-sm bg-accent px-4 py-2 font-medium text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Syncing…" : "Re-sync from Drive"}
      </button>
      {errorCode ? (
        <div
          role="alert"
          data-testid="admin-resync-error"
          className="rounded-sm border border-border-strong bg-warning-bg p-3 text-warning-text"
        >
          <ErrorExplainer code={errorCode} surface="admin" helpfulContext />
        </div>
      ) : null}
      {successMessage && !errorCode ? (
        <p
          role="status"
          data-testid="admin-resync-success"
          className="rounded-sm border border-border bg-info-bg px-3 py-2 text-sm text-text-strong"
        >
          {successMessage}
        </p>
      ) : null}
    </div>
  );
}
