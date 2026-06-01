"use client";

/**
 * app/admin/settings/admins/RevokeRowButton.tsx (M9 C9 / M2-D1)
 *
 * Two-tap inline confirmation for revoking an admin row, echoing the
 * C4 ResolveAlertButton pattern (shape brief §6.5):
 *
 *   idle     → [ Revoke ] (accent)
 *              Click → confirm.
 *   confirm  → [ Confirm revoke ] (orange) + [ Cancel ] sibling
 *              Click confirm → submits the form.
 *              Click Cancel → back to idle.
 *              3s of inaction → auto-revert to idle.
 *   resolving→ confirm button disabled, label "Revoking…", until the
 *              Server Action completes (page revalidates and the row
 *              moves to the REVOKED section).
 *
 * Server Action contract: this island wraps a <form
 * action={revokeAdminAction}> with a hidden `email` input pinning
 * which row the action revokes. The Server Action enforces the
 * last-admin-lockout refusal contract and revalidates on success.
 *
 * `disabled` prop: when the parent server-render determined this row
 * is the only active admin AND the actor is the admin, the Revoke
 * button is rendered disabled with a tooltip. The Server Action is
 * still authoritative — a forged submit goes through the lockout
 * predicate and surfaces LAST_ADMIN_LOCKOUT_REFUSED inline.
 */
import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";

import { getDougFacing, getRequiredDougFacing } from "@/lib/messages/lookup";

import { revokeAdminAction, type AdminEmailActionResult } from "./actions";

const AUTO_REVERT_MS = 3_000;

// Task 7.1: no-response watchdog. A React server action dispatched via
// useActionState routes a THROWN/hung action to the error boundary, not
// back to local state, so a hung revoke (no result, no throw the island
// can catch) strands the Confirm button on "Revoking…" forever. If the
// island is still "resolving" after this window with no result, we move to
// a conservative "couldnt_confirm" state: it prompts a refresh, never
// returns to idle, and disables the submit (no duplicate revoke). A late
// commit is reconciled by the §6.3 revalidatePath on the user's refresh.
const WATCHDOG_MS = 12_000;

type UiState = "idle" | "confirm" | "resolving" | "couldnt_confirm";

export function RevokeRowButton({ email, disabled }: { email: string; disabled: boolean }) {
  const [ui, setUi] = useState<UiState>("idle");
  const autoRevertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [result, formAction, isPending] = useActionState<
    AdminEmailActionResult | null,
    FormData
  >(revokeAdminAction, null);

  const clearAutoRevert = () => {
    if (autoRevertTimerRef.current !== null) {
      clearTimeout(autoRevertTimerRef.current);
      autoRevertTimerRef.current = null;
    }
  };
  const clearWatchdog = () => {
    if (watchdogTimerRef.current !== null) {
      clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
  };
  useEffect(
    () => () => {
      clearAutoRevert();
      clearWatchdog();
    },
    [],
  );

  // When a result arrives, the action did NOT hang, clear the watchdog so a
  // late timer can't override the resolved (ok / infra_error / lockout) path.
  useEffect(() => {
    if (result !== null) clearWatchdog();
  }, [result]);

  // R8 MEDIUM FIX (refined at R9): when the Server Action returns a
  // non-ok terminal result (last_admin_lockout, invalid_email), the
  // page does NOT revalidate so the component stays mounted with
  // stale ui="resolving". The snap-to-idle is scoped to the
  // resolving→refused transition ONLY — otherwise (per R9 finding)
  // the stale result keeps overriding future revoke attempts so a
  // retry click that moves ui→confirm would stay rendered as idle.
  // The guard `ui === "resolving"` means: the snap fires once when
  // the action returns; any subsequent click that moves ui away
  // from resolving (e.g., user clicks Revoke again → ui=confirm)
  // bypasses the snap and the confirm row renders normally.
  const refused = result && result.kind !== "ok" && ui === "resolving";
  // couldnt_confirm is sticky and outranks the refused snap (a result can't
  // be present when the watchdog fired, the result-effect clears the
  // watchdog, but guard defensively so a late render never re-derives idle).
  const effectiveUi: UiState =
    ui === "couldnt_confirm" ? "couldnt_confirm" : refused ? "idle" : ui;

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
    clearWatchdog();
    setUi("resolving");
    // Start the no-response watchdog. If we're still resolving with no result
    // when it fires, the action hung, go conservative.
    watchdogTimerRef.current = setTimeout(() => {
      setUi((prev) => (prev === "resolving" ? "couldnt_confirm" : prev));
    }, WATCHDOG_MS);
  };

  const onRefreshClick = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  const lockoutMessage =
    result?.kind === "last_admin_lockout"
      ? getDougFacing("LAST_ADMIN_LOCKOUT_REFUSED")
      : null;

  // Task 6.4: transient DB / permissions fault on the revoke RPC,
  // caught as AdminEmailsInfraError and surfaced inline so Doug can
  // retry. Like lockoutMessage, the non-ok result snaps ui→idle (see
  // `refused` above), so this renders in the idle return block; the
  // confirm block also renders it to cover any mid-resolve render.
  const writeFailMessage =
    result?.kind === "infra_error"
      ? getRequiredDougFacing("ADMIN_EMAIL_WRITE_FAILED")
      : null;

  if (effectiveUi === "couldnt_confirm") {
    // The revoke neither returned a result nor surfaced a catchable error
    // within WATCHDOG_MS. Stay conservative: never imply the revoke failed
    // (it may have committed late), never re-enable a submit (no double
    // revoke), and steer Doug to refresh, the §6.3 revalidatePath on the
    // refreshed render reconciles the row's true state.
    return (
      <div className="flex flex-col items-end gap-2">
        <div
          data-testid="admin-allowlist-revoke-confirm-row"
          className="flex flex-wrap items-center gap-3"
        >
          <button
            type="button"
            data-testid="admin-allowlist-revoke-confirm-button"
            disabled
            aria-busy={false}
            className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-accent px-4 py-2 font-semibold text-accent-text opacity-60 disabled:cursor-not-allowed"
          >
            Revoking…
          </button>
        </div>
        <p
          data-testid="admin-allowlist-couldnt-confirm"
          role="status"
          className="w-full rounded-sm bg-warning-bg px-2 py-1 text-sm text-warning-text"
        >
          Couldn&rsquo;t confirm. Refresh to check.{" "}
          <button
            type="button"
            data-testid="admin-allowlist-couldnt-confirm-refresh"
            onClick={onRefreshClick}
            className="font-medium underline underline-offset-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            Refresh
          </button>
        </p>
      </div>
    );
  }

  if (effectiveUi === "idle") {
    // Audit P3 fix: when the Revoke button is disabled because actor
    // is the only active admin, render the explanation as a visible
    // sibling hint (not a `title` tooltip — mobile devices don't
    // surface title, and screen readers often ignore title on
    // disabled buttons). aria-describedby ties the hint to the
    // button so AT users get the same context.
    const hintId = disabled ? `${email}-revoke-hint` : undefined;
    return (
      <div className="flex flex-col items-end gap-2">
        <form action={formAction}>
          <input type="hidden" name="email" value={email} />
          <button
            type="button"
            onClick={onRevokeClick}
            disabled={disabled}
            data-testid="admin-allowlist-revoke-button"
            aria-describedby={hintId}
            className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-accent px-4 py-2 font-medium text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            Revoke
          </button>
        </form>
        {disabled && (
          <p
            id={hintId}
            data-testid="admin-allowlist-self-last-hint"
            className="max-w-xs text-right text-xs text-text-subtle"
          >
            Can&rsquo;t revoke yourself, add another admin first.
          </p>
        )}
        {lockoutMessage && (
          <p
            data-testid="admin-allowlist-lockout-error"
            role="alert"
            // P1 fix: was max-w-xs text-right text-xs — easy to miss
          // after refusal on Doug's phone. Now full container width,
          // left-aligned, text-sm with a subtle error wash so the
          // refusal anchors visually next to the disabled control.
          className="w-full rounded-sm bg-warning-bg px-2 py-1 text-sm text-warning-text"
          >
            {lockoutMessage}
          </p>
        )}
        {writeFailMessage && (
          <p
            data-testid="admin-allowlist-error-write-failed"
            role="alert"
            className="w-full rounded-sm bg-warning-bg px-2 py-1 text-sm text-warning-text"
          >
            {writeFailMessage}
          </p>
        )}
      </div>
    );
  }

  const isResolving = ui === "resolving" || isPending;
  return (
    <div className="flex flex-col items-end gap-2">
      <form action={formAction}>
        <input type="hidden" name="email" value={email} />
        <div
          data-testid="admin-allowlist-revoke-confirm-row"
          className="flex flex-wrap items-center gap-3"
        >
          <button
            type="submit"
            data-testid="admin-allowlist-revoke-confirm-button"
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
            data-testid="admin-allowlist-revoke-cancel-button"
            className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center px-3 text-sm text-text-subtle underline-offset-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      </form>
      {lockoutMessage && (
        <p
          data-testid="admin-allowlist-lockout-error"
          role="alert"
          // P1 fix: was max-w-xs text-right text-xs — easy to miss
          // after refusal on Doug's phone. Now full container width,
          // left-aligned, text-sm with a subtle error wash so the
          // refusal anchors visually next to the disabled control.
          className="w-full rounded-sm bg-warning-bg px-2 py-1 text-sm text-warning-text"
        >
          {lockoutMessage}
        </p>
      )}
      {writeFailMessage && (
        <p
          data-testid="admin-allowlist-error-write-failed"
          role="alert"
          className="w-full rounded-sm bg-warning-bg px-2 py-1 text-sm text-warning-text"
        >
          {writeFailMessage}
        </p>
      )}
    </div>
  );
}
