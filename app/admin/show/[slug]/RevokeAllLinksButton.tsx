"use client";

/**
 * app/admin/show/[slug]/RevokeAllLinksButton.tsx (M9.5)
 *
 * Two-tap inline confirmation for revoking ALL signed links for a
 * (show, crew_name) tuple. Mirrors
 * app/admin/settings/admins/RevokeRowButton.tsx (M9 C9 pattern):
 *
 *   idle     → [ Revoke all links ] (accent)
 *              Click → confirm.
 *   confirm  → role="group" containing
 *              [ Confirm revoke ] (accent, semibold) + [ Cancel ]
 *              Click confirm → submits the form (useActionState pending).
 *              Click Cancel → back to idle.
 *              3s of inaction → auto-revert to idle.
 *   resolving→ confirm button disabled, label "Revoking…", aria-busy=true,
 *              until the action returns. A useEffect snaps ui→idle on
 *              the settled transition so the banner appears anchored
 *              to the original idle button cluster (M9.5 impeccable
 *              audit M-2 + M-3 — no redundant local resolving flag).
 *   settled  → idle button visible AGAIN with the "Last attempt:"
 *              banner sibling (impeccable critique HIGH-1 — explicit
 *              cause→effect for the destructive action that snapped
 *              back to idle).
 *
 * disabled prop: when the parent server-render computed the row is
 * in no-live-link state (current_token_version === revoked_below_
 * version), the idle button renders disabled. The Server Action is
 * still authoritative — a forged submit goes through the data-layer's
 * no_live_link branch and surfaces ADMIN_LINK_NO_LIVE_LINK inline.
 *
 * Two-tap pattern is the project convention for destructive admin
 * actions (M9 C4 ResolveAlertButton + C9 RevokeRowButton precedent).
 */
import { useActionState, useEffect, useRef, useState } from "react";

import { getDougFacing } from "@/lib/messages/lookup";

import {
  revokeAllLinksAction,
  type ShowLinkActionResult,
} from "./actions";

const AUTO_REVERT_MS = 3_000;

type UiState = "idle" | "confirm" | "resolving";

export function RevokeAllLinksButton({
  showId,
  crewName,
  disabled,
}: {
  showId: string;
  crewName: string;
  disabled: boolean;
}) {
  const [ui, setUi] = useState<UiState>("idle");
  const autoRevertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [result, formAction, isPending] = useActionState<
    ShowLinkActionResult | null,
    FormData
  >(revokeAllLinksAction, null);

  const clearAutoRevert = () => {
    if (autoRevertTimerRef.current !== null) {
      clearTimeout(autoRevertTimerRef.current);
      autoRevertTimerRef.current = null;
    }
  };

  // Clear the in-flight timer on unmount. Audit M-1: wrap the cleanup
  // in an arrow so the linter sees the unmount-cleanup idiom
  // explicitly (was `useEffect(() => clearAutoRevert, [])` which
  // captured the first-render closure).
  useEffect(() => {
    return () => clearAutoRevert();
  }, []);

  // Audit M-2 + M-3: sync ui→"idle" when the action settles. This
  // removes the prior `effectiveUi` derived-state hack + makes the
  // state machine explicit. The settled transition also re-anchors
  // the banner sibling next to the idle button cluster so the
  // cause→effect chain is visible (Critique HIGH-1).
  // Explicit state-machine transition (resolving→idle) when the async
  // action settles. Deriving this from isPending/result at render time
  // was the prior `effectiveUi` approach; impeccable audit M-2 + M-3
  // removed it in favor of an explicit state machine. The lint rule
  // below is a false positive for this state-machine pattern.
  useEffect(() => {
    if (!isPending && result !== null && ui === "resolving") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUi("idle");
    }
  }, [isPending, result, ui]);

  const onRevokeClick = () => {
    clearAutoRevert();
    setUi("confirm");
    autoRevertTimerRef.current = setTimeout(() => {
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
  };

  const okMessage = result?.kind === "ok" ? getDougFacing(result.code) : null;
  const refusedMessage =
    result?.kind === "refused" ? getDougFacing(result.code) : null;
  const isResolving = ui === "resolving" || isPending;

  if (ui === "idle") {
    return (
      <div className="flex flex-col items-end gap-2">
        <form action={formAction}>
          <input type="hidden" name="showId" value={showId} />
          <input type="hidden" name="crewName" value={crewName} />
          <button
            type="button"
            onClick={onRevokeClick}
            disabled={disabled}
            data-testid="per-show-crew-revoke-button"
            className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-accent px-4 py-2 font-medium text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            Revoke all links
          </button>
        </form>
        {okMessage && (
          <p
            data-testid="per-show-crew-revoke-ok"
            role="status"
            aria-live="polite"
            className="w-full rounded-sm bg-surface-raised px-2 py-1 text-sm text-text-strong"
          >
            <span aria-hidden="true" className="mr-1 font-semibold">✓</span>
            <span className="font-medium text-text-subtle">Last attempt:</span>{" "}
            {okMessage}
          </p>
        )}
        {refusedMessage && (
          <p
            data-testid="per-show-crew-revoke-refused"
            role="alert"
            className="w-full rounded-sm bg-warning-bg px-2 py-1 text-sm text-warning-text"
          >
            <span className="font-medium">Last attempt:</span>{" "}
            {refusedMessage}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <form action={formAction}>
        <input type="hidden" name="showId" value={showId} />
        <input type="hidden" name="crewName" value={crewName} />
        <div
          data-testid="per-show-crew-revoke-confirm-row"
          role="group"
          aria-label="Confirm revoking all signed links for this crew member"
          className="flex flex-wrap items-center gap-3"
        >
          <button
            type="submit"
            data-testid="per-show-crew-revoke-confirm-button"
            onClick={onConfirmClick}
            disabled={isResolving}
            aria-busy={isResolving}
            className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-accent px-4 py-2 font-semibold text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isResolving ? "Revoking…" : "Confirm revoke"}
          </button>
          <button
            type="button"
            onClick={onCancelClick}
            disabled={isResolving}
            data-testid="per-show-crew-revoke-cancel-button"
            className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center px-3 text-sm text-text-subtle underline-offset-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
