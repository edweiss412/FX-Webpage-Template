"use client";

/**
 * components/admin/RoleRecognizeControl.tsx
 *
 * The inline "Recognize this role" control (spec 2026-07-15-extend-role-scope-vocab
 * §8.1). PRESENTATIONAL: it owns only its own collapse/checkbox/phase state and
 * calls the injected `onSave(grants, mode)` — the boundary binds that to the right
 * surface action and normalizes the typed result into a `RoleRecognizeSaveOutcome`.
 *
 * Visual source of truth: `…-mock/Recognize Role Control.dc.html`. Neutral-outline
 * trigger with a ⌄ chevron (the FXAV accent stays reserved for the primary save
 * CTA, DESIGN §1.1); expanded white panel inside the amber warning card; 20px
 * accent checkboxes; the financial caution as amber sub-text (associated via
 * `aria-describedby`, not folded into the accessible name); accent-fill save with
 * a spinner + "Recognizing…" label swap; error as an inline amber `role="alert"`
 * box with selections kept + a "Try again" relabel; the saved card with a teal ✓
 * and a "Change what they see" reopen (REVISE mode). No modal; no colour as a sole
 * state carrier; ≥44px tap targets. Every string flows through `roleRecognizeCopy`.
 *
 * States (spec §8.1): collapsed · idle · saving · saved · plus the two benign
 * result branches `stale` / `conflict` (their own §9 notices, NOT error styling).
 * Error is idle + an inline notice (the panel stays, selections kept). The saved
 * card is CLIENT-LOCAL until the surface refresh unmounts the control (§8.1 timing
 * contract) — no persistence promise beyond that.
 */

import { useEffect, useId, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { GRANTABLE_FLAGS, type GrantableFlag } from "@/lib/sync/roleMappingOverlay";
import * as COPY from "@/components/admin/roleRecognizeCopy";

export type RoleRecognizeSaveMode = "create" | "revise";

/** Normalized outcome the boundary returns from the surface action (spec §8.3). */
export type RoleRecognizeSaveOutcome =
  | { kind: "saved"; state: "applied" | "apply_pending"; grants: readonly GrantableFlag[] }
  | { kind: "stale" }
  | { kind: "conflict" }
  | { kind: "error" };

type Phase = "collapsed" | "idle" | "saving" | "saved" | "stale" | "conflict";
type Checks = Record<GrantableFlag, boolean>;

const EMPTY_CHECKS: Checks = { A1: false, V1: false, L1: false, FINANCIALS: false };

const CHECKBOX_LABEL: Record<GrantableFlag, string> = {
  A1: COPY.CHECKBOX_AUDIO,
  V1: COPY.CHECKBOX_VIDEO,
  L1: COPY.CHECKBOX_LIGHTING,
  FINANCIALS: COPY.CHECKBOX_FINANCIAL,
};

// Neutral-outline trigger + secondary buttons (matches the use-raw escape-hatch
// treatment; the accent is reserved for the primary save CTA below).
const outlineBtn =
  "inline-flex min-h-tap-min items-center gap-1.5 rounded-sm border border-border-strong bg-surface px-3 text-sm font-medium text-text-strong " +
  "transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const accentBtn =
  "inline-flex min-h-tap-min items-center justify-center gap-2 rounded-sm bg-accent px-4 text-sm font-semibold text-accent-text " +
  "transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const ghostBtn =
  "min-h-tap-min rounded-sm px-2 text-sm font-medium text-text-subtle " +
  "transition-colors duration-fast hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const popIn =
  "motion-safe:animate-[role-recognize-pop_var(--duration-fast)_var(--ease-out-quart)] motion-reduce:animate-none";

export function RoleRecognizeControl({
  roleToken,
  onSave,
}: {
  /** The raw unrecognized role word; absent/blank → the control does not render. */
  roleToken: string | undefined;
  /** Binds to the surface action; resolves to the normalized outcome. */
  onSave: (
    grants: GrantableFlag[],
    mode: RoleRecognizeSaveMode,
  ) => Promise<RoleRecognizeSaveOutcome>;
}) {
  const uid = useId();
  const [phase, setPhase] = useState<Phase>("collapsed");
  const [mode, setMode] = useState<RoleRecognizeSaveMode>("create");
  const [checks, setChecks] = useState<Checks>(EMPTY_CHECKS);
  const [errored, setErrored] = useState(false);
  const [saved, setSaved] = useState<{
    state: "applied" | "apply_pending";
    grants: readonly GrantableFlag[];
  } | null>(null);

  // Focus management: expanding the panel (collapsed→idle, or the revise reopen)
  // moves focus to the panel heading; a successful save moves it to the saved
  // heading. Error keeps focus in place (the alert announces itself, selections
  // stay visible). Keyed on phase/errored so it fires once per transition.
  const panelHeadingRef = useRef<HTMLSpanElement>(null);
  const savedHeadingRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (phase === "idle" && !errored) panelHeadingRef.current?.focus();
    else if (phase === "saved") savedHeadingRef.current?.focus();
  }, [phase, errored]);

  const token = (roleToken ?? "").trim();
  if (token.length === 0) return null;

  const selectedGrants = (): GrantableFlag[] => GRANTABLE_FLAGS.filter((f) => checks[f]);
  const noneChecked = GRANTABLE_FLAGS.every((f) => !checks[f]);
  const saving = phase === "saving";

  const expand = () => {
    setMode("create");
    setChecks(EMPTY_CHECKS);
    setErrored(false);
    setPhase("idle");
  };
  const cancel = () => {
    setChecks(EMPTY_CHECKS);
    setErrored(false);
    setPhase("collapsed");
  };
  const toggle = (flag: GrantableFlag) => setChecks((c) => ({ ...c, [flag]: !c[flag] }));

  const reviseFrom = (grants: readonly GrantableFlag[]) => {
    setMode("revise");
    setChecks({ ...EMPTY_CHECKS, ...Object.fromEntries(grants.map((g) => [g, true])) } as Checks);
    setErrored(false);
    setPhase("idle");
  };

  const save = async () => {
    const grants = selectedGrants();
    setErrored(false);
    setPhase("saving");
    let outcome: RoleRecognizeSaveOutcome;
    try {
      outcome = await onSave(grants, mode);
    } catch {
      outcome = { kind: "error" };
    }
    if (outcome.kind === "saved") {
      setSaved({ state: outcome.state, grants: outcome.grants });
      setPhase("saved");
    } else if (outcome.kind === "stale") {
      setPhase("stale");
    } else if (outcome.kind === "conflict") {
      setPhase("conflict");
    } else {
      setErrored(true);
      setPhase("idle"); // panel stays, selections kept
    }
  };

  // ── Collapsed: trigger only ──────────────────────────────────────────────
  if (phase === "collapsed") {
    return (
      <div data-testid="role-recognize-control" data-phase="collapsed" className="mt-1">
        <button
          type="button"
          data-testid="role-recognize-trigger"
          onClick={expand}
          className={outlineBtn}
        >
          {COPY.TRIGGER_LABEL}
          <span aria-hidden="true" className="text-xs text-text-subtle">
            ⌄
          </span>
        </button>
      </div>
    );
  }

  // ── Saved confirmation (client-local until surface refresh unmounts) ──────
  if (phase === "saved" && saved) {
    return (
      <div
        data-testid="role-recognize-control"
        data-phase="saved"
        role="status"
        className={`mt-2 flex items-start gap-2.5 rounded-md border border-border bg-surface px-3.5 py-3 ${popIn}`}
      >
        <span
          aria-hidden="true"
          className="mt-0.5 inline-flex size-5.5 flex-none items-center justify-center rounded-full bg-status-positive text-sm font-bold text-white"
        >
          ✓
        </span>
        <div
          data-testid="role-recognize-saved"
          data-state={saved.state}
          className="flex flex-col gap-0.5"
        >
          <span
            ref={savedHeadingRef}
            tabIndex={-1}
            className="text-sm font-semibold text-text-strong outline-none"
          >
            {COPY.SAVED_HEADING}
          </span>
          <span className="text-xs text-text-subtle">
            {saved.state === "applied"
              ? COPY.savedSummary(token, saved.grants)
              : COPY.APPLY_PENDING_SUMMARY}{" "}
            <button
              type="button"
              data-testid="role-recognize-change"
              onClick={() => reviseFrom(saved.grants)}
              className="font-medium text-text-strong underline underline-offset-2 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              {COPY.CHANGE_LINK}
            </button>
          </span>
        </div>
      </div>
    );
  }

  // ── Benign result notices (stale / conflict) — NOT error styling ─────────
  if (phase === "stale" || phase === "conflict") {
    const isStale = phase === "stale";
    return (
      <div data-testid="role-recognize-control" data-phase={phase} className="mt-2">
        <p
          data-testid={isStale ? "role-recognize-stale" : "role-recognize-conflict"}
          role="status"
          className="rounded-md border border-border bg-info-bg px-3 py-2 text-xs text-text-subtle"
        >
          {isStale ? COPY.STALE_COPY : COPY.CONFLICT_COPY}
        </p>
      </div>
    );
  }

  // ── Expanded panel (idle / saving) ───────────────────────────────────────
  return (
    <div data-testid="role-recognize-control" data-phase={phase} className="mt-1">
      <div
        data-testid="role-recognize-panel"
        className={`flex flex-col gap-3 rounded-md border border-border bg-surface p-3.5 ${popIn}`}
      >
        <div className="flex flex-col gap-0.5">
          <span
            ref={panelHeadingRef}
            tabIndex={-1}
            className="text-sm font-semibold text-text-strong outline-none"
          >
            {COPY.PANEL_HEADING}
          </span>
          <span className="text-xs text-text-subtle">{COPY.scopeLine(token)}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-6">
          {(["A1", "V1", "L1"] as const).map((flag) => (
            <label key={flag} className="flex min-h-tap-min cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                data-testid={`role-recognize-check-${flag}`}
                checked={checks[flag]}
                disabled={saving}
                onChange={() => toggle(flag)}
                className="size-5 accent-accent"
              />
              <span className="text-sm text-text">{CHECKBOX_LABEL[flag]}</span>
            </label>
          ))}

          {/* Financial: caution associated via aria-describedby so it never
              folds into the checkbox's accessible name. Spans both columns on
              desktop (mock). */}
          <div className="flex min-h-tap-min items-start gap-2.5 py-1 sm:col-span-2">
            <input
              type="checkbox"
              id={`${uid}-fin`}
              data-testid="role-recognize-check-FINANCIALS"
              aria-describedby={`${uid}-fin-cap`}
              checked={checks.FINANCIALS}
              disabled={saving}
              onChange={() => toggle("FINANCIALS")}
              className="mt-0.5 size-5 accent-accent"
            />
            <span className="flex flex-col gap-0.5">
              <label htmlFor={`${uid}-fin`} className="cursor-pointer text-sm text-text">
                {COPY.CHECKBOX_FINANCIAL}
              </label>
              <span id={`${uid}-fin-cap`} className="text-xs text-warning-text">
                {COPY.FINANCIAL_CAUTION}
              </span>
            </span>
          </div>
        </div>

        {noneChecked && !errored ? (
          <p
            data-testid="role-recognize-none-helper"
            className="self-start rounded-md bg-surface-sunken px-2.5 py-2 text-xs text-text-subtle"
          >
            {COPY.NONE_CHECKED_HELPER}
          </p>
        ) : null}

        {errored ? (
          <p
            data-testid="role-recognize-error"
            role="alert"
            className="rounded-md border border-border-strong bg-warning-bg px-2.5 py-2 text-xs text-warning-text"
          >
            {COPY.ERROR_COPY}
          </p>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="button"
            data-testid="role-recognize-save"
            disabled={saving}
            onClick={save}
            className={accentBtn}
          >
            {saving ? <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> : null}
            {saving ? COPY.SAVING_LABEL : errored ? COPY.RETRY_LABEL : COPY.SAVE_LABEL}
          </button>
          <button
            type="button"
            data-testid="role-recognize-cancel"
            disabled={saving}
            onClick={cancel}
            className={ghostBtn}
          >
            {COPY.CANCEL_LABEL}
          </button>
        </div>
      </div>
    </div>
  );
}
