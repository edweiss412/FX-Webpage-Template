"use client";

/**
 * app/admin/settings/admins/RevokeRowButton.tsx (M9 C9 / M2-D1)
 *
 * Two-tap inline confirmation for revoking an admin row, echoing the
 * C4 two-tap arm/confirm pattern (shape brief §6.5), the idiom ArchiveShowButton
 * and the picker controls also follow; their armed branches are registered in
 * tests/styles/_metaDestructiveConfirm.test.ts, which pins the confirm-go recipe
 * rather than the two-tap shape:
 *
 *   idle     → [ Revoke ] (accent)
 *              Click → confirm.
 *   confirm  → [ Confirm revoke ] (orange) + [ Cancel ] sibling
 *              Click confirm → submits the form.
 *              Click Cancel → back to idle.
 *              4s of inaction → auto-revert to idle.
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
 * is the actor's OWN row, the Revoke button is rendered disabled with
 * a hint (an admin can never revoke their own access). The Server
 * Action is still authoritative — a forged submit goes through the
 * lockout predicate and surfaces LAST_ADMIN_LOCKOUT_REFUSED inline.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useActionState } from "react";

import { getDougFacing, getRequiredDougFacing } from "@/lib/messages/lookup";

import { revokeAdminAction, type AdminEmailActionResult } from "./actions";
import { ARM_EXPIRED_ANNOUNCEMENT, ARM_REVERT_MS } from "@/lib/admin/destructiveConfirm";

// Armed-state auto-revert window — harmonized to 4s across every destructive
// surface (spec §4; DESTRUCT-2). Shared naming idiom: ARM_REVERT_MS.

// Task 7.1: no-response watchdog. A React server action dispatched via
// useActionState routes a THROWN/hung action to the error boundary, not
// back to local state, so a hung revoke (no result, no throw the island
// can catch) strands the Confirm button on "Revoking…" forever. If the
// island is still "resolving" after this window with no result, we move to
// a conservative "couldnt_confirm" state: it prompts a refresh, never
// returns to idle, and disables the submit (no duplicate revoke). A late
// commit is reconciled by the §6.3 revalidatePath on the user's refresh.
const WATCHDOG_MS = 12_000;

/**
 * The couldn't-confirm sentence, single-sourced. The visible line and the
 * announcement below render the SAME string, so the two cannot drift into
 * telling a sighted operator and a screen-reader user different things. The
 * apostrophe is the curly U+2019 per DESIGN.md typography — the same character
 * the `&rsquo;` entity produced when this was JSX text.
 */
// NOT new error copy and not a §12.4 code. This is the component-local string
// that was already inline in the JSX; it is hoisted to a constant precisely so
// the visible card and its announcement are provably one string. Routing it
// through the message-catalog lookup helper would mean adding a catalog row,
// which arc A's spec
// §5 explicitly excludes ("no new user-visible error code; all copy is existing
// component-local constants"). Extracting it is what made a pre-existing pattern
// visible to this scanner, not a new violation.
// not-subject:M5-D8
const COULDNT_CONFIRM_COPY = "Couldn’t confirm. Refresh to check.";

type UiState = "idle" | "confirm" | "resolving" | "couldnt_confirm";

export function RevokeRowButton({ email, disabled }: { email: string; disabled: boolean }) {
  const [ui, setUi] = useState<UiState>("idle");
  // Spec 2026-08-01-announce-a11y-pass §3.3: set ONLY in the arm timer's
  // callback; cleared at arm and at the confirm dispatch.
  const [expired, setExpired] = useState(false);
  const autoRevertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [result, formAction, isPending] = useActionState<AdminEmailActionResult | null, FormData>(
    revokeAdminAction,
    null,
  );

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

  // Destructive-confirm pass F4 (spec §6): C3 open-focus + C5 close-focus refs.
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRowRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef(false);

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
  const effectiveUi: UiState = ui === "couldnt_confirm" ? "couldnt_confirm" : refused ? "idle" : ui;

  const onRevokeClick = () => {
    clearAutoRevert();
    setExpired(false);
    setUi("confirm");
    autoRevertTimerRef.current = setTimeout(() => {
      // Announce BESIDE the close, never inside closeConfirm — Cancel shares it
      // (spec 2026-08-01-announce-a11y-pass §3.3).
      setExpired(true);
      closeConfirm();
    }, ARM_REVERT_MS);
  };

  const onCancelClick = () => {
    clearAutoRevert();
    closeConfirm();
  };

  const onConfirmClick = () => {
    clearAutoRevert();
    setExpired(false);
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
    result?.kind === "last_admin_lockout" ? getDougFacing("LAST_ADMIN_LOCKOUT_REFUSED") : null;

  // M12.5-DEF-1: a POST-reachable forged self-revoke (the row's Revoke
  // control is normally hidden on the actor's own row) resolves to
  // self_revoke_forbidden — both the Server-Action guard and the
  // RPC-boundary refusal map to this kind. Render the dedicated copy
  // (distinct from the last-administrator lockout message).
  const selfRevokeMessage =
    result?.kind === "self_revoke_forbidden"
      ? getRequiredDougFacing("SELF_REVOKE_FORBIDDEN")
      : null;

  // Task 6.4: transient DB / permissions fault on the revoke RPC,
  // caught as AdminEmailsInfraError and surfaced inline so Doug can
  // retry. Like lockoutMessage, the non-ok result snaps ui→idle (see
  // `refused` above), so this renders in the idle return block; the
  // confirm block also renders it to cover any mid-resolve render.
  const writeFailMessage =
    result?.kind === "infra_error" ? getRequiredDougFacing("ADMIN_EMAIL_WRITE_FAILED") : null;

  // Single return with a key-stable live-region sibling: the region node must
  // survive branch swaps across couldnt_confirm / idle / confirm (spec
  // 2026-08-01-announce-a11y-pass §3.3 persistent-region rule; plan R1 F1).
  const liveRegion = (
    <span
      key="arm-expiry-region"
      role="status"
      aria-live="polite"
      className="sr-only"
      data-testid="arm-expiry-announce"
    >
      {expired ? ARM_EXPIRED_ANNOUNCEMENT : ""}
    </span>
  );

  // BL-LIVE-REGION-AST-WALK-RESIDUE. A SECOND key-stable region, on the same
  // rule and for the same reason as the arm-expiry one beside it: the
  // couldn't-confirm warning used to carry `role="status"` on the visible line
  // inside its own branch, so the region and its text arrived together and
  // nothing was announced. The region is deliberately kept separate rather than
  // folded into `arm-expiry-region` — that one's contract is "set ONLY in the
  // arm timer's callback", and two messages sharing one node would need a
  // precedence rule nobody has stated.
  const couldntConfirmRegion = (
    <span
      key="couldnt-confirm-region"
      role="status"
      aria-live="polite"
      className="sr-only"
      data-testid="admin-allowlist-couldnt-confirm-announce"
    >
      {effectiveUi === "couldnt_confirm" ? COULDNT_CONFIRM_COPY : ""}
    </span>
  );
  let branch: ReactNode;
  if (effectiveUi === "couldnt_confirm") {
    // The revoke neither returned a result nor surfaced a catchable error
    // within WATCHDOG_MS. Stay conservative: never imply the revoke failed
    // (it may have committed late), never re-enable a submit (no double
    // revoke), and steer Doug to refresh, the §6.3 revalidatePath on the
    // refreshed render reconciles the row's true state.
    branch = (
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
        {/* The VISIBLE line. It carries no `role="status"`: it is inserted with
            its own text, so the role would read like a live region and announce
            nothing. `couldntConfirmRegion` above is what announces. */}
        <p
          data-testid="admin-allowlist-couldnt-confirm"
          className="w-full rounded-sm bg-warning-bg px-2 py-1 text-sm text-warning-text"
        >
          {COULDNT_CONFIRM_COPY}{" "}
          {/* tap-floor: inline-prose exemption, PRODUCT.md:59 — ratified 2026-08-10 */}
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
  } else if (effectiveUi === "idle") {
    // Audit P3 fix: when the Revoke button is disabled because actor
    // is the only active admin, render the explanation as a visible
    // sibling hint (not a `title` tooltip — mobile devices don't
    // surface title, and screen readers often ignore title on
    // disabled buttons). aria-describedby ties the hint to the
    // button so AT users get the same context.
    const hintId = disabled ? `${email}-revoke-hint` : undefined;
    branch = (
      <div className="flex flex-col items-end gap-2">
        <form action={formAction}>
          <input type="hidden" name="email" value={email} />
          <button
            type="button"
            ref={triggerRef}
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
            You can&rsquo;t revoke your own admin access.
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
        {selfRevokeMessage && (
          <p
            data-testid="admin-allowlist-self-revoke-error"
            role="alert"
            className="w-full rounded-sm bg-warning-bg px-2 py-1 text-sm text-warning-text"
          >
            {selfRevokeMessage}
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
  } else {
    const isResolving = ui === "resolving" || isPending;
    branch = (
      <div className="flex flex-col items-end gap-2">
        <form action={formAction}>
          <input type="hidden" name="email" value={email} />
          <div
            ref={confirmRowRef}
            data-testid="admin-allowlist-revoke-confirm-row"
            className="flex flex-wrap items-center gap-3"
          >
            <button
              type="submit"
              data-testid="admin-allowlist-revoke-confirm-button"
              onClick={onConfirmClick}
              // Bug fix (B1 §4 / Task 7.1): this is the form SUBMITTER. It must
              // NOT be disabled by the synchronous setUi("resolving") in its own
              // onClick — a discrete-event re-render would disable it BEFORE the
              // native submit event fires, cancelling the dispatch and stranding
              // the button on "Revoking…" with zero POSTs (the misdiagnosed
              // "server hang"). Disable on isPending, which useActionState sets
              // AFTER React dispatches the action, so the submit always fires and
              // double-submit is still prevented (isPending true within the same
              // tick). Visual feedback stays keyed on isResolving below.
              disabled={isPending}
              aria-busy={isResolving}
              className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-warning-text px-4 py-2 font-semibold text-warning-bg transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isResolving ? "Revoking…" : "Confirm revoke"}
            </button>
            <button
              type="button"
              ref={cancelRef}
              onClick={onCancelClick}
              disabled={isResolving}
              data-testid="admin-allowlist-revoke-cancel-button"
              className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center px-3 text-sm text-text underline-offset-2 hover:text-text-strong disabled:cursor-not-allowed disabled:opacity-60"
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
        {selfRevokeMessage && (
          <p
            data-testid="admin-allowlist-self-revoke-error"
            role="alert"
            className="w-full rounded-sm bg-warning-bg px-2 py-1 text-sm text-warning-text"
          >
            {selfRevokeMessage}
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

  return (
    <>
      {branch}
      {liveRegion}
      {couldntConfirmRegion}
    </>
  );
}
