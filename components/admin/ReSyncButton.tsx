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
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorExplainer } from "@/components/messages/ErrorExplainer";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { AccentButton } from "@/components/shared/AccentButton";

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
      return "Synced. A change is waiting for your review on this page.";
    case "skipped":
      return "Synced. Nothing new from Drive.";
    case "asset_recovery":
      return "Synced. Fetching linked files in the background.";
    case "hard_fail":
      return "Synced, but the latest edit couldn't be applied automatically. Review it on this page.";
    case "stale":
      return "Synced. A newer sync already finished; nothing changed.";
    case "revision_race":
      return "Synced, but the sheet changed mid-sync. We'll retry on the next sync.";
    case "source_gone":
      return "Sheet is no longer available in Drive.";
    case "parse_error":
      return "Synced, but part of the sheet couldn't be applied. Review the details on this page.";
    default:
      return "Sync complete.";
  }
}

export function ReSyncButton({ slug }: ReSyncButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Re-sync quality gate (audit #3): when a re-sync would materially shrink the show, the server
  // HOLDS last-good and returns { outcome: "shrink_held", detail, heldModifiedTime } instead of
  // applying. We surface a confirm — the admin must explicitly accept the reduced version, which
  // re-POSTs a VERSION-BOUND acceptShrink so a stale confirm (Doug edited since) re-holds.
  const [heldShrink, setHeldShrink] = useState<{
    detail: string;
    heldModifiedTime: string;
  } | null>(null);

  // A11y (WCAG 2.4.3) + accidental-accept safety: when the hold confirm appears, move focus to the
  // SAFE "Keep current version" control — never the destructive accept — so a keyboard user reaches
  // the region and an inadvertent Enter keeps last-good rather than clobbering it.
  const keepCurrentRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (heldShrink && !errorCode) keepCurrentRef.current?.focus();
  }, [heldShrink, errorCode]);

  // Shared POST helper. `accept` is set only by the "Apply reduced version" confirm — its presence
  // adds the version-bound acceptShrink body. NB: heldShrink is deliberately NOT cleared at the
  // start so the confirm (which hosts the accept button) stays mounted through the accept re-POST.
  const post = async (accept?: { expectedModifiedTime: string }) => {
    if (pending) return;
    setErrorCode(null);
    setSuccessMessage(null);
    setPending(true);
    try {
      const res = await fetch(`/api/admin/sync/${encodeURIComponent(slug)}`, {
        method: "POST",
        ...(accept
          ? {
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                acceptShrink: true,
                expectedModifiedTime: accept.expectedModifiedTime,
              }),
            }
          : {}),
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        result?: unknown;
      };
      if (json.ok) {
        const result = json.result as
          | { outcome?: string; detail?: string; heldModifiedTime?: string }
          | undefined;
        if (result?.outcome === "shrink_held" && result.detail && result.heldModifiedTime) {
          setHeldShrink({ detail: result.detail, heldModifiedTime: result.heldModifiedTime });
        } else {
          setHeldShrink(null);
          setSuccessMessage(summarizeResult(json.result));
          router.refresh();
        }
      } else {
        setHeldShrink(null);
        setErrorCode(typeof json.error === "string" ? json.error : "SYNC_INFRA_ERROR");
      }
    } catch {
      setHeldShrink(null);
      setErrorCode("SYNC_INFRA_ERROR");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <AccentButton
        onClick={() => post()}
        disabled={pending}
        data-testid="admin-resync-button"
        aria-busy={pending}
        fontWeight="medium"
        inline
        selfStart
        minWidthTap
        ringOffset="bg"
      >
        {pending ? "Syncing…" : "Re-sync from Drive"}
      </AccentButton>
      {errorCode ? (
        <div
          role="alert"
          data-testid="admin-resync-error"
          className="rounded-sm border border-border-strong bg-warning-bg p-3 text-warning-text"
        >
          <ErrorExplainer code={errorCode} surface="admin" />
          <HelpAffordance code={errorCode} />
        </div>
      ) : null}
      {heldShrink && !errorCode ? (
        <div
          role="status"
          data-testid="admin-resync-shrink-confirm"
          className="flex flex-col gap-2 rounded-sm border border-border-strong bg-warning-bg p-3 text-warning-text"
        >
          <p className="text-sm">
            This re-sync would reduce the show: {heldShrink.detail}. The last confirmed version is
            still live. Apply the reduced version anyway?
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              ref={keepCurrentRef}
              type="button"
              onClick={() => setHeldShrink(null)}
              disabled={pending}
              data-testid="admin-resync-keep-current"
              className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-4 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg disabled:cursor-not-allowed disabled:opacity-60"
            >
              Keep current version
            </button>
            <AccentButton
              onClick={() => post({ expectedModifiedTime: heldShrink.heldModifiedTime })}
              disabled={pending}
              data-testid="admin-resync-accept"
              aria-busy={pending}
              fontWeight="medium"
              inline
              minWidthTap
              ringOffset="warning-bg"
            >
              {pending ? "Applying…" : "Apply reduced version"}
            </AccentButton>
          </div>
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
