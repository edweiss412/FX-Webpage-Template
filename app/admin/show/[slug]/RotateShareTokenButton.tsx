"use client";

/**
 * app/admin/show/[slug]/RotateShareTokenButton.tsx (M11.5 §B Task F3)
 *
 * Section-level admin action that rotates the show's share-token via
 * Pin-2's `rotateShareToken({ showId })` Server Action. The RPC also
 * bumps shows.picker_epoch atomically (R40), so existing devices'
 * picker cookies and the old URL go stale together — Doug re-shares
 * the new URL.
 *
 * UX:
 *   - Two-tap state machine (idle → confirm → resolving → idle).
 *   - Confirm copy WARNS that the existing URL will stop working.
 *   - On success: render the new full URL with a Copy button.
 *   - On failure: generic refused banner (the typed code surfaces
 *     to admin_alerts via the action body, not to the UI).
 */

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { rotateShareToken } from "@/lib/auth/picker/rotateShareToken";
import { resolveOrigin } from "./resolveOrigin";

const AUTO_REVERT_MS = 3_000;

type UiState = "idle" | "confirm" | "resolving";
type Result =
  | { ok: true; new_share_token: string; new_epoch: number }
  | { ok: false; code: string }
  | null;

export function RotateShareTokenButton({
  showId,
  slug,
  isCrewLinkActive = true,
  compact = false,
  describedById,
}: {
  showId: string;
  slug: string;
  /**
   * M12.6 — compact rendering for the share-link card's labeled action ROW
   * (label/description on the left, this button on the right). The idle button
   * becomes a small neutral "Rotate" (the destructive warning lives in the
   * confirm step). Non-compact keeps the standalone warning-styled button.
   */
  compact?: boolean;
  /**
   * M12.6 — id of the share-card row's description element. When compact, the
   * button carries a descriptive aria-label ("Rotate share link", containing the
   * visible "Rotate" for WCAG 2.5.3) + aria-describedby={describedById} so the
   * destructive consequence is announced even out of visual row context.
   */
  describedById?: string;
  /**
   * M12.2 Phase A (§6 / R27) — published && !archived && token. When false,
   * the rotate-success state shows a NON-LINK "crew link inactive" message
   * (no URL, no copy) so rotating an inactive show never surfaces a dead URL.
   * The active success URL uses the canonical NEXT_PUBLIC_SITE_ORIGIN (R28),
   * not window.location.origin.
   */
  isCrewLinkActive?: boolean;
}) {
  const router = useRouter();
  const [ui, setUi] = useState<UiState>("idle");
  const [result, setResult] = useState<Result>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const autoRevertRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoRevert = () => {
    if (autoRevertRef.current !== null) {
      clearTimeout(autoRevertRef.current);
      autoRevertRef.current = null;
    }
  };
  const clearCopyReset = () => {
    if (copyResetRef.current !== null) {
      clearTimeout(copyResetRef.current);
      copyResetRef.current = null;
    }
  };

  useEffect(
    () => () => {
      clearAutoRevert();
      clearCopyReset();
    },
    [],
  );

  useEffect(() => {
    if (!isPending && result !== null && ui === "resolving") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUi("idle");
    }
  }, [isPending, result, ui]);

  const onRotateClick = () => {
    clearAutoRevert();
    // Clear any prior result so a stale OK/refused banner doesn't reappear
    // when the user re-enters confirm from an idle-with-banner state and
    // then cancels — the banner would otherwise outlive its context.
    setResult(null);
    setCopied(false);
    setUi("confirm");
    autoRevertRef.current = setTimeout(() => {
      setUi((prev) => (prev === "confirm" ? "idle" : prev));
    }, AUTO_REVERT_MS);
  };

  const onCancelClick = () => {
    clearAutoRevert();
    setUi("idle");
  };

  const onConfirmClick = () => {
    clearAutoRevert();
    setUi("resolving");
    setCopied(false);
    startTransition(async () => {
      const r = await rotateShareToken({ showId });
      setResult(r);
      if (r.ok) {
        // Re-render the admin show page server-side so
        // <CurrentShareLinkPanel> re-reads the new share token. Rotate's
        // own success banner shows the new URL directly; this keeps the
        // persistent panel in sync without a hard navigation.
        router.refresh();
      }
    });
  };

  const onCopyClick = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      clearCopyReset();
      copyResetRef.current = setTimeout(() => setCopied(false), 2_000);
    } catch {
      // Clipboard unavailable — the URL is still visible for manual
      // selection; no destructive consequence.
    }
  };

  // Active success URL uses the canonical NEXT_PUBLIC_SITE_ORIGIN (R28), NOT
  // window.location.origin — rotating from an admin/internal host must still
  // copy the crew-facing origin. When the crew link is inactive, no URL is
  // built (the success state shows a non-link message instead, R27).
  const newUrl =
    result?.ok && isCrewLinkActive
      ? `${resolveOrigin()}/show/${slug}/${result.new_share_token}`
      : null;
  const rotatedInactive = result?.ok === true && !isCrewLinkActive;
  const refusedMessage =
    result && result.ok === false
      ? "Couldn't rotate the share-token. Please try again."
      : null;
  const isResolving = ui === "resolving" || isPending;

  if (ui === "idle") {
    return (
      <div className="flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={onRotateClick}
          data-testid="admin-rotate-share-token-button"
          aria-label={compact ? "Rotate share link" : undefined}
          aria-describedby={compact ? describedById : undefined}
          className={
            compact
              ? "inline-flex min-h-tap-min min-w-tap-min items-center justify-center gap-1.5 rounded-sm border border-border-strong bg-surface px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              : "inline-flex min-h-tap-min min-w-tap-min items-center justify-center gap-2 rounded-sm border border-warning-text/60 bg-surface px-4 py-2 font-medium text-warning-text transition-colors duration-fast hover:bg-warning-bg/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          }
        >
          {compact ? (
            <RotateCcw aria-hidden="true" size={14} />
          ) : (
            <AlertTriangle aria-hidden="true" size={16} />
          )}
          {compact ? "Rotate" : "Rotate share-token"}
        </button>
        {newUrl && (
          <div
            data-testid="admin-rotate-share-token-ok"
            role="status"
            aria-live="polite"
            className="flex w-full max-w-md flex-col gap-1 rounded-sm bg-surface-raised px-2 py-1"
          >
            <p className="text-sm text-text-strong">
              <span
                aria-hidden="true"
                className="mr-1 font-semibold text-accent"
              >
                ✓
              </span>
              New share-link ready. Send the URL below to crew; the old
              link no longer works.
            </p>
            <div className="flex items-start gap-2">
              <code
                data-testid="admin-rotate-share-token-url"
                className="min-w-0 flex-1 break-all rounded-sm bg-surface px-2 py-1 text-xs text-text-strong"
              >
                {newUrl}
              </code>
              <button
                type="button"
                onClick={() => void onCopyClick(newUrl)}
                data-testid="admin-rotate-share-token-copy-button"
                aria-label={copied ? "URL copied to clipboard" : "Copy URL"}
                className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-accent px-3 py-1.5 text-sm font-semibold text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <span
              role="status"
              aria-live="polite"
              className="sr-only"
              data-testid="admin-rotate-share-token-copy-announce"
            >
              {copied ? "URL copied to clipboard" : ""}
            </span>
          </div>
        )}
        {rotatedInactive && (
          <p
            data-testid="admin-rotate-share-token-ok-inactive"
            role="status"
            aria-live="polite"
            className="w-full max-w-md rounded-sm bg-surface-raised px-2 py-1 text-sm text-text-strong"
          >
            <span aria-hidden="true" className="mr-1 font-semibold text-accent">
              ✓
            </span>
            Share-token rotated. The crew link stays inactive while this show is
            unpublished or archived.
          </p>
        )}
        {refusedMessage && (
          <p
            data-testid="admin-rotate-share-token-refused"
            role="alert"
            className="rounded-sm bg-warning-bg px-2 py-1 text-sm text-warning-text"
          >
            {refusedMessage}
          </p>
        )}
      </div>
    );
  }

  // M11.5-IMP-5 item 4 (Block-2.2 2026-05-27): aria-describedby links the
  // destructive Confirm button to the warning paragraph's id. group-label
  // already suffices for WCAG 2.1; the describedby provides the tighter
  // SR experience DEFERRED.md item 4 requested. Layout pattern (outer
  // flex-col + nested flex-wrap button row) is the canonical shape that
  // ResetPickerEpochButton was unified onto in this same commit (item 5).
  return (
    <div
      data-testid="admin-rotate-share-token-confirm-row"
      role="group"
      aria-label="Confirm rotating the share-token for this show"
      className="flex flex-col items-end gap-2"
    >
      <p
        id="admin-rotate-share-token-warning"
        className="text-sm text-text-subtle"
      >
        The existing show URL will stop working. Crew need the new URL to
        reach the page.
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={onConfirmClick}
          disabled={isResolving}
          aria-busy={isResolving}
          aria-describedby="admin-rotate-share-token-warning"
          data-testid="admin-rotate-share-token-confirm-button"
          className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-accent px-4 py-2 font-semibold text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isResolving ? "Rotating…" : "Confirm rotate"}
        </button>
        <button
          type="button"
          onClick={onCancelClick}
          disabled={isResolving}
          data-testid="admin-rotate-share-token-cancel-button"
          className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm border border-border bg-surface px-4 py-2 text-text transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
