"use client";

/**
 * components/admin/ArchiveShowButton.tsx (M12.2 Phase B2 Task 7.2 — spec §2.2)
 *
 * Two-tap Archive control on the per-show admin page. Rendered ONLY on a Live
 * or Held show (the page gates it off Publishing… / Archived). Archive is
 * destructive (it rotates the crew link dead immediately), so it is two-tap,
 * following the admin two-tap idiom. (That idiom is a review convention; what
 * tests/styles/_metaDestructiveConfirm.test.ts pins is the inverted-amber
 * confirm-go recipe each armed branch renders.)
 *
 *   resting → [ Archive ] (type=button). Tap → armed.
 *   armed   → [ Confirm archive: crew links stop working now and won't come
 *             back until you re-publish and issue a new link. ] (type=submit).
 *             Tap → submits the parent <form action> → the bound server action.
 *   4s idle → auto-reverts armed → resting (a misfired tap doesn't strand the
 *             confirm affordance).
 *
 * React-19 dispatch safety (the B1 revoke-hang lesson): the confirm button is a
 * plain type="submit" that disables ONLY on useFormStatus().pending — NEVER
 * synchronously in its own onClick. A submit button that setState-disables
 * itself inside its click handler CANCELS the React 19 form-action dispatch
 * (0 POSTs, stranded on the pending label). The onClick here only clears the
 * auto-revert timer; the disabled+busy state comes from useFormStatus.
 *
 * No toast (none exists in the app). On a successful result the action's
 * onResult callback fires router.refresh() and the page re-renders into its
 * Archived presentation. A refusal (e.g. a stale-tab FINALIZE_OWNED_SHOW) is
 * surfaced inline via the §12.4 catalog (invariant 5 — no raw codes).
 *
 * Layout: the resting + armed buttons share a fixed min-h/min-w sized to the
 * (longer) confirm label so the morph causes NO layout shift (asserted in the
 * Phase 9 real-browser layout sweep).
 */
import { useEffect, useId, useRef, useState } from "react";
import { Archive } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { ErrorExplainer } from "@/components/messages/ErrorExplainer";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { ARM_EXPIRED_ANNOUNCEMENT, ARM_REVERT_MS } from "@/lib/admin/destructiveConfirm";
import {
  ARCHIVE_GENERIC_ERROR_COPY,
  ARCHIVE_NOT_FOUND_COPY,
  archiveConsequenceProse,
  classifyArchiveFailure,
} from "@/lib/admin/archiveCopy";

type LifecycleResult = { ok: true } | { ok: false; code: string };

// Armed-state auto-revert window — harmonized to 4s across every destructive
// surface (spec §4; DESTRUCT-2). Shared naming idiom: ARM_REVERT_MS.

// The refusal classification and the copy each branch speaks live in
// lib/admin/archiveCopy.ts, so the dashboard row menu says exactly the same
// things (multi-surface copy rule). ADMIN_LINK_SHOW_NOT_FOUND stays RETIRED
// there: a show_not_found result renders the refresh prompt, NOT a messageFor.

export type ArchiveShowButtonProps = {
  /**
   * The show's title, so the armed confirm can say WHICH show it is about
   * (spec §5.1/§5.2). Consumed ONLY by the `asRow` armed branch — the morph
   * variants ignore it entirely. Absent, empty or whitespace-only renders
   * today's copy byte-identically, because every non-hub call site passes
   * nothing and partial data is normal during editing.
   */
  showName?: string | undefined;
  /** Pre-bound (to this show's slug) Archive server action. */
  archiveAction: () => Promise<LifecycleResult>;
  /**
   * M12.5 — compact rendering for the per-show FOOTER (Live case), where the
   * control is grouped with Re-sync and a tighter footprint reads better than
   * the wide zero-shift box. Compact drops the min-w-[18rem]/min-h-confirm-box
   * coupling: the resting button is natural-width and the armed confirm wraps
   * within max-w-[22rem]. The non-compact default keeps the zero-shift box used
   * in the Held lifecycle section (pinned by admin-lifecycle-layout.spec).
   */
  compact?: boolean;
  /**
   * share-hub: reports the SUBMIT-pending level (not the armed state) to a host
   * that gates its own dismissal on in-flight children — the ShareHub popover,
   * where an unmount mid-archive would land the mutation and lose its outcome
   * banner. A LEVEL, not an edge: a repeated value is harmless (spec §6).
   */
  onBusyChange?: (busy: boolean) => void;
  /**
   * ROW IDIOM (owner-ratified 2026-07-20, amending destructive-confirm-pass
   * §R7 and m12.2-phase-b2 §2.2). Supplying `rowLabel` with `compact` renders
   * this control the way `RotateShareTokenButton` renders in the same popover:
   * a titled row with a SHORT trigger, and the consequence sentence carried as
   * description/warning prose rather than crammed into the button label.
   *
   * Why the amendment: the label-carries-the-consequence form was written for
   * the wide Overview host. In the 308px hub popover the ~120-character
   * sentence wraps to roughly four lines of inverted amber, and the 4s
   * auto-revert was shorter than the time needed to READ it — punishing the
   * attentive operator and no one else. The row variant therefore replaces the
   * timer with an explicit Cancel, exactly as the rotate row does; the timer
   * stays on the legacy variants, which keep the ratified long label.
   */
  rowLabel?: string;
  rowDescription?: string;
};

export function ArchiveShowButton({
  archiveAction,
  compact = false,
  onBusyChange,
  rowLabel,
  rowDescription,
  showName,
}: ArchiveShowButtonProps) {
  const router = useRouter();
  const descId = useId();
  const warnId = useId();
  /** The row variant cancels explicitly (rotate's idiom); only the legacy
   *  variants arm against the 4s timer. Blank/whitespace labels fall back to
   *  the legacy compact render, which is self-named by its visible "Archive
   *  show" text — a §4.1 row with an empty label would be an unnamed
   *  destructive button (spec §2.1, R1 finding 2). */
  const asRow = compact && rowLabel != null && rowLabel.trim() !== "";
  /** Blank-safe (§5.1): absent / "" / whitespace all fall back to today's copy. */
  const namedShow = showName != null && showName.trim() !== "" ? showName.trim() : null;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  /** Set only when the operator cancels, so a restore never fires on the
   *  success path (where the trigger is replaced, not re-mounted). */
  const restoreFocusRef = useRef(false);
  /** Mirrors the confirm's useFormStatus level so Cancel can disable during the
   *  dispatch — clicking it mid-flight would unmount the form, land the
   *  mutation anyway, lose the outcome banner AND release the popover's
   *  dismissal gate (impeccable audit P1). */
  const [submitting, setSubmitting] = useState(false);
  const [armed, setArmed] = useState(false);
  // Spec 2026-08-01-announce-a11y-pass §3.3: set ONLY in the arm timer's
  // callback (morph variants only — the row variant has no timer); cleared at
  // arm and at the confirm dispatch.
  const [expired, setExpired] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [genericError, setGenericError] = useState(false);
  const autoRevertRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoRevert = () => {
    if (autoRevertRef.current !== null) {
      clearTimeout(autoRevertRef.current);
      autoRevertRef.current = null;
    }
  };
  useEffect(() => clearAutoRevert, []);

  const onArmClick = () => {
    clearAutoRevert();
    setErrorCode(null);
    setNotFound(false);
    setGenericError(false);
    setArmed(true);
    setExpired(false);
    if (asRow) return;
    autoRevertRef.current = setTimeout(() => {
      setArmed((prev) => (prev ? false : prev));
      setExpired(true);
    }, ARM_REVERT_MS);
  };

  // Result handler passed to the form action. NOT a synchronous disable — it
  // runs AFTER the dispatch resolves, so it cannot cancel the React 19 form
  // action. On success → refresh into the Archived presentation; on a known
  // refusal → inline catalog copy; on the retired not-found → refresh prompt.
  const onResult = (result: LifecycleResult) => {
    if (result.ok) {
      setArmed(false);
      router.refresh();
      return;
    }
    setArmed(false);
    const failure = classifyArchiveFailure(result.code);
    if (failure.kind === "not_found") {
      setNotFound(true);
    } else if (failure.kind === "catalog") {
      setErrorCode(failure.code);
    } else {
      // infra_error (the lifecycle caller's unmapped sentinel — NOT a §12.4
      // code, so it must NEVER be passed to messageFor): plain-language retry
      // prose, no raw code in the DOM (invariant 5).
      setGenericError(true);
    }
  };

  // C3 (spec §15 / DESIGN.md:419): the armed row mounts with the SAFE control
  // focused. Without it, arming unmounts the focused trigger, focus falls to
  // <body>, and the next Tab/Enter lands on Confirm — which is first in DOM
  // order. That is the stray-second-Enter vector on a destructive control.
  useEffect(() => {
    if (asRow && armed) cancelRef.current?.focus();
  }, [asRow, armed]);

  // C5 (close focus), single-shot: only a CANCEL restores. The success path
  // re-renders the whole surface, so there is no trigger to return to.
  useEffect(() => {
    if (asRow && !armed && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      triggerRef.current?.focus();
    }
  }, [asRow, armed]);

  // The confirm reports its pending LEVEL to both the local Cancel-disable and
  // the host's dismissal gate.
  const onConfirmBusy = (b: boolean) => {
    setSubmitting(b);
    onBusyChange?.(b);
  };

  /** Confirm-branch header ONLY. The idle row renders its own label/description
   *  inside the button (see the row variant below); these stay SEPARATE so
   *  restyling the idle row cannot shift the ratified confirm render. */
  const labelHeader = asRow ? (
    <div className="min-w-0">
      <p className="text-sm font-medium text-text-strong">{rowLabel}</p>
      {rowDescription ? (
        <p id={descId} className="text-xs text-text-subtle">
          {rowDescription}
        </p>
      ) : null}
    </div>
  ) : null;

  const banners = (
    <>
      {errorCode ? (
        <div
          role="alert"
          data-testid="archive-show-error"
          className="rounded-sm border border-border-strong bg-warning-bg p-3 text-warning-text"
        >
          <ErrorExplainer code={errorCode} surface="admin" />
          <HelpAffordance code={errorCode} />
        </div>
      ) : null}

      {notFound ? (
        <p
          role="alert"
          data-testid="archive-show-not-found"
          className="rounded-sm border border-border-strong bg-warning-bg p-3 text-sm text-warning-text"
        >
          {ARCHIVE_NOT_FOUND_COPY}
        </p>
      ) : null}

      {genericError ? (
        <p
          role="alert"
          data-testid="archive-show-generic-error"
          className="rounded-sm border border-border-strong bg-warning-bg p-3 text-sm text-warning-text"
        >
          {ARCHIVE_GENERIC_ERROR_COPY}
        </p>
      ) : null}
    </>
  );

  // ── ROW VARIANT (the hub popover) — the §4.1 menu-row idiom, byte-for-byte
  // the rotate recipe (spec 2026-07-24-archive-row-menu-idiom §2.1; fidelity-
  // fixes §4.1). Idle: one borderless full-width row, icon + stacked
  // label/description INSIDE the button. Armed: the owner-ratified
  // Confirm/Cancel render (no timer) — unchanged. The wrapper below is a plain,
  // non-interactive div written with a LITERAL class string — a source-form
  // contract `_metaRowWrapperInert.test.ts` parses to prove no handler is
  // attached to it.
  if (asRow) {
    return (
      <div className="flex w-full flex-col gap-2">
        {!armed ? (
          <button
            type="button"
            ref={triggerRef}
            data-testid="archive-show-button"
            onClick={onArmClick}
            aria-label={rowLabel}
            aria-describedby={rowDescription?.trim() ? descId : undefined}
            className="flex min-h-tap-min w-full items-center gap-2 rounded-sm p-2 text-left transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <Archive aria-hidden="true" size={16} className="shrink-0 text-text-subtle" />
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium text-text-strong">{rowLabel}</span>
              {rowDescription?.trim() ? (
                <span id={descId} className="text-xs text-text-subtle">
                  {rowDescription}
                </span>
              ) : null}
            </span>
          </button>
        ) : (
          <div
            role="group"
            aria-label={
              namedShow
                ? `Confirm archiving \u201C${namedShow}\u201D`
                : "Confirm archiving this show"
            }
            data-testid="archive-show-confirm-row"
            className="flex flex-col gap-2 py-3"
          >
            {labelHeader}
            {/* Wraps, never truncates (§10): a pathological title must not elide
                the very context a destructive confirm depends on. `wrap-break-word`
                because wrapping needs a break OPPORTUNITY — an unbroken title (a
                URL, a slug, a run-on) offers none. Measured in ShareHub's 308px
                panel, one drove scrollWidth 306 -> 412 with overflow-x auto,
                scrolling a destructive confirm sideways. */}
            <p id={warnId} className="text-sm wrap-break-word text-text-subtle">
              {archiveConsequenceProse(namedShow)}
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <form
                action={async () => {
                  clearAutoRevert();
                  const result = await archiveAction();
                  onResult(result);
                }}
              >
                <ConfirmButton
                  onConfirmClick={clearAutoRevert}
                  compact
                  row
                  describedBy={warnId}
                  label="Confirm archive"
                  onBusyChange={onConfirmBusy}
                />
              </form>
              <button
                type="button"
                ref={cancelRef}
                data-testid="archive-show-cancel-button"
                disabled={submitting}
                aria-busy={submitting}
                onClick={() => {
                  clearAutoRevert();
                  restoreFocusRef.current = true;
                  setArmed(false);
                }}
                className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm border border-border bg-surface px-4 py-2 text-sm text-text transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {banners}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      {/* Persistent sr-only live region (spec 2026-08-01-announce-a11y-pass §3.2
          row 6): the morph swaps button-for-form with no focus move, so BOTH the
          arm and the auto-revert close are announced here. Always mounted. */}
      <span role="status" className="sr-only">
        {armed ? "Tap again to confirm." : expired ? ARM_EXPIRED_ANNOUNCEMENT : ""}
      </span>
      {!armed ? (
        <button
          type="button"
          data-testid="archive-show-button"
          onClick={onArmClick}
          className={
            compact
              ? "inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm border border-text-faint bg-surface px-3 py-1.5 text-sm font-medium text-text-strong transition-colors duration-fast hover:border-status-warn hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              : "inline-flex min-h-confirm-box min-w-[18rem] items-center justify-center rounded-sm border border-text-faint bg-surface px-4 py-2 text-sm font-medium text-text-strong transition-colors duration-fast hover:border-status-warn hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          }
        >
          Archive show
        </button>
      ) : (
        <form
          action={async () => {
            clearAutoRevert();
            setExpired(false);
            const result = await archiveAction();
            onResult(result);
          }}
          className="flex flex-col items-start gap-2"
        >
          <ConfirmButton
            onConfirmClick={clearAutoRevert}
            compact={compact}
            {...(onBusyChange ? { onBusyChange } : {})}
          />
        </form>
      )}

      {banners}
    </div>
  );
}

/**
 * Extracted so useFormStatus() runs inside a definite child of the <form>
 * (React 19 requirement). The label is the spec §2.2 links-dead confirm copy.
 * Fixed min-h/min-w matches the resting button so the morph is zero-shift.
 */
function ConfirmButton({
  onConfirmClick,
  compact = false,
  onBusyChange,
  describedBy,
  label,
  row = false,
}: {
  onConfirmClick: () => void;
  compact?: boolean;
  onBusyChange?: (busy: boolean) => void;
  /** Row idiom: rotate-row padding, and none of the long-label leftovers
   *  (`text-left`, `max-w-88`) that only made sense when the consequence WAS
   *  the label. */
  row?: boolean;
  /** Row variant: the consequence prose the button acts on (aria-describedby). */
  describedBy?: string;
  /** Row variant: short label, because the consequence lives in the prose above. */
  label?: string;
}) {
  const { pending } = useFormStatus();
  // Reported from inside the form (useFormStatus only reads here). The cleanup
  // clears the flag on unmount too — a host that gates dismissal on it would
  // otherwise stay inert forever if this subtree went away mid-flight.
  useEffect(() => {
    onBusyChange?.(pending);
    return () => {
      if (pending) onBusyChange?.(false);
    };
  }, [pending, onBusyChange]);
  return (
    <button
      type="submit"
      data-testid="archive-show-confirm-button"
      onClick={onConfirmClick}
      disabled={pending}
      aria-busy={pending}
      aria-describedby={describedBy}
      // Destructive-confirm recipe (spec R7): soft amber → inverted-amber C1
      // fill on the armed morph. Each branch keeps its own sizing tokens.
      className={
        row
          ? "inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-warning-text px-4 py-2 text-sm font-semibold text-warning-bg transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60"
          : compact
            ? "inline-flex min-h-tap-min min-w-tap-min max-w-88 items-center justify-center rounded-sm bg-warning-text px-3 py-1.5 text-left text-sm font-semibold text-warning-bg transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60"
            : "inline-flex min-h-confirm-box min-w-[18rem] max-w-full items-center justify-center rounded-sm bg-warning-text px-4 py-2 text-left text-sm font-semibold text-warning-bg transition-opacity duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60"
      }
    >
      {pending
        ? "Archiving…"
        : (label ??
          "Confirm archive: crew links stop working now and won’t come back until you re-publish and issue a new link.")}
    </button>
  );
}
