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
 *   confirm  → [ Confirm revoke ] (accent, semibold) + [ Cancel ] sibling
 *              Click confirm → submits the form (useActionState pending).
 *              Click Cancel → back to idle.
 *              3s of inaction → auto-revert to idle.
 *   resolving→ confirm button disabled, label "Revoking…", aria-busy=true,
 *              until the action returns. On ok, the page revalidates
 *              and re-renders; the row's no-live-link state will be
 *              visible. On refused or infra fault, snap back to idle
 *              so the admin can retry from a clean state — the
 *              refused message stays rendered as a sibling sibling
 *              of the idle button until the row re-renders or
 *              another action lands.
 *
 * disabled prop: when the parent server-render computed the row is in
 * no-live-link state (current_token_version === revoked_below_version),
 * the idle button renders disabled. The Server Action is still
 * authoritative — a forged submit goes through the data-layer's
 * no_live_link branch and surfaces ADMIN_LINK_NO_LIVE_LINK inline.
 *
 * Two-tap pattern is the project convention for destructive admin
 * actions (M9 C4 ResolveAlertButton + C9 RevokeRowButton precedent).
 * Spec doesn't require it but invariant 8 UX gate applies.
 */
import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";

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
  useEffect(() => clearAutoRevert, []);

  // Snap-to-idle when the action returns (per R8/R9 RevokeRowButton
  // lesson + M9-D-C4-1 isPending discipline): if ui===resolving and
  // the action settled (ok OR refused), return to idle so the
  // ok/refused banner renders + a retry click starts from a clean
  // state. On ok, the page revalidates shortly after and re-mounts
  // the row in its new (no-live-link) state; the ok banner stays
  // visible until that re-mount completes — useful on slow networks.
  const actionSettled = !isPending && result !== null;
  const effectiveUi: UiState =
    actionSettled && ui === "resolving" ? "idle" : ui;

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

  const okMessage =
    result?.kind === "ok" ? getDougFacing(result.code) : null;
  const refusedMessage =
    result?.kind === "refused" ? getDougFacing(result.code) : null;
  const isResolving = ui === "resolving" || isPending;

  if (effectiveUi === "idle") {
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
            className="w-full rounded-sm bg-surface-raised px-2 py-1 text-sm text-text-strong"
          >
            {okMessage}
          </p>
        )}
        {refusedMessage && (
          <p
            data-testid="per-show-crew-revoke-refused"
            role="alert"
            className="w-full rounded-sm bg-warning-bg px-2 py-1 text-sm text-warning-text"
          >
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
