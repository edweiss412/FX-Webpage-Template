"use client";

/**
 * components/admin/ArchiveShowButton.tsx (M12.2 Phase B2 Task 7.2 — spec §2.2)
 *
 * Two-tap Archive control on the per-show admin page. Rendered ONLY on a Live
 * or Held show (the page gates it off Publishing… / Archived). Archive is
 * destructive (it rotates the crew link dead immediately), so it is two-tap,
 * mirroring components/admin/ResolveAlertButton:
 *
 *   resting → [ Archive ] (type=button). Tap → armed.
 *   armed   → [ Confirm archive — crew links stop working now and won't come
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
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { ErrorExplainer } from "@/components/messages/ErrorExplainer";
import { HelpAffordance } from "@/components/admin/HelpAffordance";

type LifecycleResult = { ok: true } | { ok: false; code: string };

const AUTO_REVERT_MS = 4_000;

// §12.4 codes this button may surface inline. ADMIN_LINK_SHOW_NOT_FOUND is
// RETIRED — a show_not_found result renders the generic refresh prompt, NOT a
// messageFor lookup.
const KNOWN_REFUSAL_CODES = new Set(["FINALIZE_OWNED_SHOW", "SHOW_ARCHIVED_IMMUTABLE"]);

export type ArchiveShowButtonProps = {
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
};

export function ArchiveShowButton({ archiveAction, compact = false }: ArchiveShowButtonProps) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
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
    autoRevertRef.current = setTimeout(() => {
      setArmed((prev) => (prev ? false : prev));
    }, AUTO_REVERT_MS);
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
    if (result.code === "show_not_found") {
      setNotFound(true);
    } else if (KNOWN_REFUSAL_CODES.has(result.code)) {
      setErrorCode(result.code);
    } else {
      // infra_error (the lifecycle caller's unmapped sentinel — NOT a §12.4
      // code, so it must NEVER be passed to messageFor): plain-language retry
      // prose, no raw code in the DOM (invariant 5).
      setGenericError(true);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      {!armed ? (
        <button
          type="button"
          data-testid="archive-show-button"
          onClick={onArmClick}
          className={
            compact
              ? "inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-text-strong transition-colors duration-fast hover:border-status-warn hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              : "inline-flex min-h-confirm-box min-w-[18rem] items-center justify-center rounded-sm border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-text-strong transition-colors duration-fast hover:border-status-warn hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          }
        >
          Archive show
        </button>
      ) : (
        <form
          action={async () => {
            clearAutoRevert();
            const result = await archiveAction();
            onResult(result);
          }}
          className="flex flex-col items-start gap-2"
        >
          <ConfirmButton onConfirmClick={clearAutoRevert} compact={compact} />
        </form>
      )}

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
          We couldn&rsquo;t find this show anymore. Refresh the page and try again.
        </p>
      ) : null}

      {genericError ? (
        <p
          role="alert"
          data-testid="archive-show-generic-error"
          className="rounded-sm border border-border-strong bg-warning-bg p-3 text-sm text-warning-text"
        >
          Archiving didn&rsquo;t go through. Try again in a moment; if it keeps failing, contact the
          developer.
        </p>
      ) : null}
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
}: {
  onConfirmClick: () => void;
  compact?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      data-testid="archive-show-confirm-button"
      onClick={onConfirmClick}
      disabled={pending}
      aria-busy={pending}
      className={
        compact
          ? "inline-flex min-h-tap-min min-w-tap-min max-w-88 items-center justify-center rounded-sm border border-status-warn bg-warning-bg px-3 py-1.5 text-left text-sm font-semibold text-warning-text transition-colors duration-fast hover:bg-warning-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          : "inline-flex min-h-confirm-box min-w-[18rem] max-w-full items-center justify-center rounded-sm border border-status-warn bg-warning-bg px-4 py-2 text-left text-sm font-semibold text-warning-text transition-colors duration-fast hover:bg-warning-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
      }
    >
      {pending
        ? "Archiving…"
        : "Confirm archive — crew links stop working now and won’t come back until you re-publish and issue a new link."}
    </button>
  );
}
