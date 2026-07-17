"use client";

/**
 * app/admin/show/[slug]/RotateShareTokenButton.tsx
 *
 * Section-level admin action that rotates the show's share-token via
 * Pin-2's `rotateShareToken({ showId })` Server Action. The RPC also
 * bumps shows.picker_epoch atomically (R40), so existing devices'
 * picker cookies and the old URL go stale together.
 *
 * UX:
 *   - Two-tap state machine (idle → confirm → resolving → idle).
 *   - Confirm copy WARNS that the existing URL will stop working.
 *   - On success the new token+epoch flow to the shared ShareTokenProvider via
 *     `onRotated`, so the always-visible share-link card (and header chip / crew
 *     link) update INSTANTLY. The success banner is therefore CONFIRMATION-ONLY —
 *     it points at the updated card rather than duplicating the URL/Copy/email.
 *   - On failure: generic refused banner (the typed code surfaces to admin_alerts
 *     via the action body, not to the UI).
 */

import { AlertTriangle, Check, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";

import { rotateShareToken } from "@/lib/auth/picker/rotateShareToken";

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
  rowLabel,
  rowDescription,
  onRotated,
}: {
  showId: string;
  slug: string;
  /**
   * M12.2 Phase A (§6 / R27) — published && !archived && token. When false,
   * the rotate-success state shows a NON-LINK "crew link inactive" message and
   * does NOT call `onRotated` (an inactive show never surfaces a copyable URL).
   */
  isCrewLinkActive?: boolean;
  /** Compact share-card labeled-row rendering (label/description left, button right). */
  compact?: boolean;
  rowLabel?: string;
  rowDescription?: string;
  /**
   * Called on a successful rotate of an ACTIVE crew link with the freshly-minted
   * token and its epoch (both from the atomic rotateShareToken result). The
   * ShareTokenProvider's monotonic-epoch gate uses these to update every crew-URL
   * surface instantly. Omitted for standalone use.
   */
  onRotated?: (newToken: string, newEpoch: number) => void;
}) {
  const router = useRouter();
  const [ui, setUi] = useState<UiState>("idle");
  const [result, setResult] = useState<Result>(null);
  const [isPending, startTransition] = useTransition();
  const autoRevertRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descId = useId(); // compact row-description id (aria-describedby target)
  // Destructive-confirm pass F4 (spec §6): C3 open-focus + C5 close-focus refs.
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRowRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef(false);

  const clearAutoRevert = () => {
    if (autoRevertRef.current !== null) {
      clearTimeout(autoRevertRef.current);
      autoRevertRef.current = null;
    }
  };

  useEffect(() => () => clearAutoRevert(), []);

  function closeConfirm() {
    // used ONLY by cancel onClick and the auto-revert timer callback — never submit/result paths
    // Capture ONLY while the confirm row is still mounted; a timer firing after the row is
    // gone must not write anything (and the functional setUi guard below already no-ops then).
    if (confirmRowRef.current) {
      restoreFocusRef.current = confirmRowRef.current.contains(document.activeElement);
    }
    // Preserve the existing functional guard — only confirm → idle, never clobber a later state.
    setUi((prev) => (prev === "confirm" ? "idle" : prev));
  }

  // C3 (open focus): the confirm row mounts with the SAFE control focused,
  // closing the stray-second-Enter vector (spec §3 C3).
  useEffect(() => {
    if (ui === "confirm") cancelRef.current?.focus();
  }, [ui]);

  // C5 (close focus), single-shot consumption: the idle-render effect resets
  // restoreFocusRef to false when it fires, and only one close happens per
  // confirm episode (cancel clears the timer; the timer cannot race a consumed
  // restore because the effect runs on the very next render, before any later
  // macro-task timer callback).
  useEffect(() => {
    if (ui === "idle" && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      triggerRef.current?.focus();
    }
  }, [ui]);

  useEffect(() => {
    if (!isPending && result !== null && ui === "resolving") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUi("idle");
    }
  }, [isPending, result, ui]);

  const onRotateClick = () => {
    clearAutoRevert();
    // Clear any prior result so a stale OK/refused banner doesn't reappear
    // when the user re-enters confirm from an idle-with-banner state.
    setResult(null);
    setUi("confirm");
    autoRevertRef.current = setTimeout(() => {
      closeConfirm();
    }, AUTO_REVERT_MS);
  };

  const onCancelClick = () => {
    clearAutoRevert();
    closeConfirm();
  };

  const onConfirmClick = () => {
    clearAutoRevert();
    setUi("resolving");
    startTransition(async () => {
      const r = await rotateShareToken({ showId });
      setResult(r);
      if (r.ok) {
        // Push the new token+epoch into the shared cache so the card / chip / crew
        // link update instantly (only for an active crew link — an inactive show
        // must not surface a copyable URL). router.refresh() is the backstop that
        // re-reads other server-derived data.
        if (isCrewLinkActive) onRotated?.(r.new_share_token, r.new_epoch);
        router.refresh();
      }
    });
  };

  const rotatedActive = result?.ok === true && isCrewLinkActive;
  const rotatedInactive = result?.ok === true && !isCrewLinkActive;
  const refusedMessage =
    result && result.ok === false ? "Couldn't rotate the share link. Please try again." : null;
  const isResolving = ui === "resolving" || isPending;

  const labelHeader =
    compact && rowLabel ? (
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-strong">{rowLabel}</p>
        {rowDescription ? (
          <p id={descId} className="text-xs text-text-subtle">
            {rowDescription}
          </p>
        ) : null}
      </div>
    ) : null;

  const idleButton = (
    <button
      type="button"
      ref={triggerRef}
      onClick={onRotateClick}
      data-testid="admin-rotate-share-token-button"
      aria-label={compact ? "Rotate share link" : undefined}
      aria-describedby={compact && rowDescription ? descId : undefined}
      className={
        compact
          ? "inline-flex min-h-tap-min min-w-tap-min shrink-0 items-center justify-center gap-1.5 rounded-sm border border-border-strong bg-surface px-3 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
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
  );

  const banners = (
    <>
      {rotatedActive && (
        <p
          data-testid="admin-rotate-share-token-ok"
          role="status"
          aria-live="polite"
          className="flex w-full max-w-md items-start gap-1.5 rounded-sm bg-surface-sunken px-2 py-1 text-sm text-text-strong"
        >
          <Check aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-accent-on-bg" />
          <span>
            New share-link ready. The old link no longer works and everyone will re-pick their name.
            The updated link is shown above.
          </span>
        </p>
      )}
      {rotatedInactive && (
        <p
          data-testid="admin-rotate-share-token-ok-inactive"
          role="status"
          aria-live="polite"
          className="flex w-full max-w-md items-start gap-1.5 rounded-sm bg-surface-sunken px-2 py-1 text-sm text-text-strong"
        >
          <Check aria-hidden="true" size={16} className="mt-0.5 shrink-0 text-accent-on-bg" />
          <span>
            Share link rotated. The crew link stays inactive while this show is unpublished or
            archived.
          </span>
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
    </>
  );

  if (ui === "idle") {
    return compact && rowLabel ? (
      <div className="flex flex-col gap-2 py-3">
        <div className="flex items-start justify-between gap-3">
          {labelHeader}
          {idleButton}
        </div>
        {banners}
      </div>
    ) : (
      <div className="flex flex-col items-end gap-2">
        {idleButton}
        {banners}
      </div>
    );
  }

  const warningP = (
    <p id="admin-rotate-share-token-warning" className="text-sm text-text-subtle">
      The existing show URL will stop working. Every crew member will need the new URL and will have
      to re-pick their name.
    </p>
  );
  const confirmCancelButtons = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        onClick={onConfirmClick}
        disabled={isResolving}
        aria-busy={isResolving}
        aria-describedby="admin-rotate-share-token-warning"
        data-testid="admin-rotate-share-token-confirm-button"
        className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-warning-text px-4 py-2 font-semibold text-warning-bg transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isResolving ? "Rotating…" : "Confirm rotate"}
      </button>
      <button
        type="button"
        ref={cancelRef}
        onClick={onCancelClick}
        disabled={isResolving}
        data-testid="admin-rotate-share-token-cancel-button"
        className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm border border-border bg-surface px-4 py-2 text-text transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
      >
        Cancel
      </button>
    </div>
  );

  return compact && rowLabel ? (
    <div
      ref={confirmRowRef}
      data-testid="admin-rotate-share-token-confirm-row"
      role="group"
      aria-label="Confirm rotating the share-token for this show"
      className="flex flex-col gap-2 py-3"
    >
      {labelHeader}
      {warningP}
      {confirmCancelButtons}
    </div>
  ) : (
    <div
      ref={confirmRowRef}
      data-testid="admin-rotate-share-token-confirm-row"
      role="group"
      aria-label="Confirm rotating the share-token for this show"
      className="flex flex-col items-end gap-2"
    >
      {warningP}
      {confirmCancelButtons}
    </div>
  );
}
