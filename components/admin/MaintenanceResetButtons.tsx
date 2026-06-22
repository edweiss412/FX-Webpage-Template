"use client";

/**
 * components/admin/MaintenanceResetButtons.tsx (Task 7 — validation-reset-button)
 *
 * The validation-only maintenance affordances. Render-gated by the RSC settings
 * page on destructiveResetAllowed() — this component carries NO secret prop and
 * never re-checks the gate itself (the page is the single source of truth; the
 * server actions re-assert it server-side as defense-in-depth).
 *
 * Two actions, two registers:
 *   - "Reset validation data" — DESTRUCTIVE. A typed-confirm modal whose confirm
 *     button is DISABLED until the input EXACTLY equals "RESET" (case-sensitive,
 *     no surrounding whitespace). Destructive styling (status-warn border +
 *     warning-bg panel), mirroring ArchiveShowButton's destructive confirm.
 *   - "Reseed validation fixtures" — ADDITIVE. A simple two-step confirm
 *     (open → confirm), neutral styling.
 *
 * State machine + catalog-driven error copy ported from
 * components/admin/ReapStaleSessionsButton.tsx (idle → confirming → running →
 * done/error; lookupDougFacing(code) ?? GENERIC_ERROR). Invariant 5: errors are
 * resolved through messageFor(code).dougFacing — never a raw code.
 *
 * React-19 form-action lesson: the confirm buttons disable on `isPending`
 * (useTransition), NEVER a synchronous onClick self-disable — a self-disable
 * cancels the in-flight action.
 *
 * a11y: each trigger button carries aria-describedby pointing at its row copy;
 * each modal is a labelled group with focus moved to its least-destructive
 * control on open and returned to the trigger on close.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { messageFor } from "@/lib/messages/lookup";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import {
  resetValidationDataAction,
  reseedValidationFixturesAction,
} from "@/app/admin/settings/_actions/validationReset";

type ResultState =
  | { kind: "idle" }
  | { kind: "done"; count: number }
  | { kind: "error"; copy: string; code: string | null };

function lookupDougFacing(code: string | undefined | null): string | null {
  if (!code) return null;
  if (!(code in MESSAGE_CATALOG)) return null;
  return messageFor(code as MessageCode).dougFacing ?? null;
}

// not-subject:M5-D8 — defensive fallback when catalog lookup returns null; all
// real error copy routes through messageFor(code).dougFacing first.
const GENERIC_ERROR =
  "Something went wrong with that maintenance action. Refresh and try again, or contact the developer if this keeps happening.";

const CONFIRM_WORD = "RESET";

export function MaintenanceResetButtons() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Which modal (if any) is open. Only one at a time.
  const [open, setOpen] = useState<"none" | "reset" | "reseed">("none");
  const [typed, setTyped] = useState("");
  const [resetResult, setResetResult] = useState<ResultState>({ kind: "idle" });
  const [reseedResult, setReseedResult] = useState<ResultState>({ kind: "idle" });

  // Focus management: triggers stay mounted (the modal renders alongside), so on
  // open we move focus into the modal's least-destructive control (Cancel) and
  // on close return it to the trigger that opened the modal.
  const resetTriggerRef = useRef<HTMLButtonElement>(null);
  const reseedTriggerRef = useRef<HTMLButtonElement>(null);
  const resetCancelRef = useRef<HTMLButtonElement>(null);
  const reseedCancelRef = useRef<HTMLButtonElement>(null);
  const lastOpenRef = useRef<"none" | "reset" | "reseed">("none");

  useEffect(() => {
    const prev = lastOpenRef.current;
    if (open === "reset") {
      resetCancelRef.current?.focus();
    } else if (open === "reseed") {
      reseedCancelRef.current?.focus();
    } else if (prev === "reset") {
      resetTriggerRef.current?.focus();
    } else if (prev === "reseed") {
      reseedTriggerRef.current?.focus();
    }
    lastOpenRef.current = open;
  }, [open]);

  function closeModal() {
    setOpen("none");
    setTyped("");
  }

  function runReset() {
    setResetResult({ kind: "idle" });
    startTransition(async () => {
      try {
        const result = await resetValidationDataAction();
        if (result.ok) {
          setResetResult({ kind: "done", count: result.count });
        } else {
          setResetResult({
            kind: "error",
            copy: lookupDougFacing(result.code) ?? GENERIC_ERROR,
            code: result.code,
          });
        }
      } catch {
        setResetResult({ kind: "error", copy: GENERIC_ERROR, code: null });
      } finally {
        closeModal();
        router.refresh();
      }
    });
  }

  function runReseed() {
    setReseedResult({ kind: "idle" });
    startTransition(async () => {
      try {
        const result = await reseedValidationFixturesAction();
        if (result.ok) {
          setReseedResult({ kind: "done", count: result.count });
        } else {
          setReseedResult({
            kind: "error",
            copy: lookupDougFacing(result.code) ?? GENERIC_ERROR,
            code: result.code,
          });
        }
      } catch {
        setReseedResult({ kind: "error", copy: GENERIC_ERROR, code: null });
      } finally {
        closeModal();
        router.refresh();
      }
    });
  }

  const confirmEnabled = typed === CONFIRM_WORD && !isPending;

  return (
    <div className="flex flex-col gap-4" data-testid="maintenance-reset-buttons">
      {/* ---- Reset validation data (destructive) ---- */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-text-strong">Reset validation data</p>
          <p id="validation-reset-desc" className="text-sm text-text-subtle">
            Wipes every show, crew member, and sync record from the validation database, then leaves
            it empty. This cannot be undone. It only ever runs against the validation environment.
          </p>
        </div>
        <button
          type="button"
          ref={resetTriggerRef}
          data-testid="validation-reset-button"
          aria-label="Reset validation data"
          aria-describedby="validation-reset-desc"
          onClick={() => {
            setResetResult({ kind: "idle" });
            setTyped("");
            setOpen("reset");
          }}
          disabled={isPending}
          className="inline-flex min-h-tap-min items-center justify-center self-start rounded-sm border border-status-warn bg-warning-bg px-4 text-sm font-semibold text-warning-text transition-colors duration-fast hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          Reset validation data
        </button>

        {resetResult.kind === "done" ? (
          <div
            role="status"
            data-testid="validation-reset-result"
            className="rounded-md border border-border bg-surface-sunken p-tile-pad text-sm text-text-strong"
          >
            {resetResult.count === 1 ? "1 show cleared." : `${resetResult.count} shows cleared.`}
          </div>
        ) : null}

        {resetResult.kind === "error" ? (
          <div
            role="alert"
            data-testid="validation-reset-error"
            className="flex flex-col gap-1 rounded-md border border-border bg-warning-bg p-tile-pad text-sm text-warning-text"
          >
            <p>{resetResult.copy}</p>
            <HelpAffordance code={resetResult.code} />
          </div>
        ) : null}
      </div>

      {/* ---- Reseed validation fixtures (additive) ---- */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-text-strong">Reseed validation fixtures</p>
          <p id="validation-reseed-desc" className="text-sm text-text-subtle">
            Adds the standard set of validation fixture shows back into the validation database.
            Safe to run more than once.
          </p>
        </div>
        <button
          type="button"
          ref={reseedTriggerRef}
          data-testid="validation-reseed-button"
          aria-label="Reseed validation fixtures"
          aria-describedby="validation-reseed-desc"
          onClick={() => {
            setReseedResult({ kind: "idle" });
            setOpen("reseed");
          }}
          disabled={isPending}
          className="inline-flex min-h-tap-min items-center justify-center self-start rounded-sm border border-border-strong bg-bg px-4 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          Reseed validation fixtures
        </button>

        {reseedResult.kind === "done" ? (
          <div
            role="status"
            data-testid="validation-reseed-result"
            className="rounded-md border border-border bg-surface-sunken p-tile-pad text-sm text-text-strong"
          >
            {reseedResult.count === 1 ? "1 show seeded." : `${reseedResult.count} shows seeded.`}
          </div>
        ) : null}

        {reseedResult.kind === "error" ? (
          <div
            role="alert"
            data-testid="validation-reseed-error"
            className="flex flex-col gap-1 rounded-md border border-border bg-warning-bg p-tile-pad text-sm text-warning-text"
          >
            <p>{reseedResult.copy}</p>
            <HelpAffordance code={reseedResult.code} />
          </div>
        ) : null}
      </div>

      {/* ---- Reset typed-confirm modal ---- */}
      {open === "reset" ? (
        <div
          role="group"
          aria-labelledby="validation-reset-modal-heading"
          data-testid="validation-reset-modal"
          className="flex flex-col gap-3 rounded-md border border-status-warn bg-warning-bg p-tile-pad text-warning-text"
        >
          <p id="validation-reset-modal-heading" className="text-sm font-semibold">
            Reset all validation data?
          </p>
          <p className="text-sm">
            This permanently deletes every show and its data from the validation database. To
            confirm, type <span className="font-semibold">RESET</span> below.
          </p>
          <label className="flex flex-col gap-1 text-sm" htmlFor="validation-reset-input">
            <span className="sr-only">Type RESET to confirm</span>
            <input
              id="validation-reset-input"
              data-testid="validation-reset-input"
              type="text"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-label="Type RESET to confirm"
              className="min-h-tap-min rounded-sm border border-border-strong bg-bg px-3 text-sm text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="validation-reset-confirm"
              onClick={runReset}
              disabled={!confirmEnabled}
              aria-busy={isPending}
              className="inline-flex min-h-tap-min items-center justify-center rounded-sm bg-warning-text px-4 text-sm font-semibold text-warning-bg transition-colors duration-fast hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              {isPending ? "Resetting…" : "Reset everything"}
            </button>
            <button
              type="button"
              ref={resetCancelRef}
              data-testid="validation-reset-cancel"
              onClick={closeModal}
              disabled={isPending}
              className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-4 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {/* ---- Reseed simple confirm modal ---- */}
      {open === "reseed" ? (
        <div
          role="group"
          aria-labelledby="validation-reseed-modal-heading"
          data-testid="validation-reseed-modal"
          className="flex flex-col gap-3 rounded-md border border-border bg-surface-sunken p-tile-pad text-text-strong"
        >
          <p id="validation-reseed-modal-heading" className="text-sm font-semibold">
            Reseed validation fixtures?
          </p>
          <p className="text-sm">
            This adds the standard validation fixture shows back into the validation database. It is
            additive and safe to run more than once.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="validation-reseed-confirm"
              onClick={runReseed}
              disabled={isPending}
              aria-busy={isPending}
              className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-4 text-sm font-semibold text-text-strong transition-colors duration-fast hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              {isPending ? "Reseeding…" : "Reseed fixtures"}
            </button>
            <button
              type="button"
              ref={reseedCancelRef}
              data-testid="validation-reseed-cancel"
              onClick={closeModal}
              disabled={isPending}
              className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-4 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
