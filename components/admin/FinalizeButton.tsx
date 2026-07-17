"use client";

/**
 * components/admin/FinalizeButton.tsx (M10 §B Task 10.5 / Phase 2; streamed
 * progress, 2026-06-30)
 *
 * Wizard-step-3 publish trigger. Drives the multi-batch finalize loop
 * per spec §4.5 / §9.0 and the Pin-2 FinalizeResponse contract:
 *
 *   1. POST /api/admin/onboarding/finalize (Accept: application/x-ndjson)
 *      The route STREAMS NDJSON progress (listed → row×N → terminal result);
 *      the button reads the stream, morphs its region into an inline progress
 *      panel (determinate bar + "X of Y" + current sheet name), and applies the
 *      terminal result:
 *      → status='batch_complete'       → loop and POST /finalize again
 *      → status='all_batches_complete' → if per_row has failures, render
 *          re-apply links and STOP (race-row gate). Otherwise POST /finalize-cas.
 *      → ok:false → render Doug-facing copy via messageFor.
 *   2. POST /api/admin/onboarding/finalize-cas (Accept: application/x-ndjson)
 *      Streams phase events (applying → publishing → subscribing); the panel
 *      shows a distinct "Finishing setup…" step, then applies the terminal:
 *      → status='finalize_complete' → router.refresh (the next page-load
 *          observes pending_wizard_session_id NULL and watched_folder_id
 *          non-null, falling through to the Dashboard).
 *      → ok:false → render Doug-facing copy.
 *
 * Streamed listed/row/phase events are OPTIMISTIC; the terminal `result.body`
 * is authoritative. A non-NDJSON response (proxy stripped Accept, a pre-stream
 * non-200 error, or a legacy/test caller) falls through the `!isStream` JSON
 * safety net and runs the SAME terminal handling.
 *
 * No raw §12.4 codes leak into the rendered UI (AGENTS.md §1.5). Race-row
 * failure links are rendered VERBATIM from the response's pre-built
 * `re_apply_url` — the client never composes the URL itself.
 *
 * Idempotency under double-click: a state guard prevents a second click
 * from re-firing the loop while a /finalize or /finalize-cas request is
 * in flight (the server is already idempotency-gated by the
 * pg_try_advisory_xact_lock('finalize:<sessionId>'), but the UI guard
 * keeps the button from spinning the request count unnecessarily).
 */
import Link from "next/link";
import { forwardRef, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { messageFor } from "@/lib/messages/lookup";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";
import { renderEmphasis } from "@/components/messages/renderEmphasis";
import { AccentButton } from "@/components/shared/AccentButton";
import { RescanSheetButton } from "@/components/admin/RescanSheetButton";
import { BlockedRowResolver } from "@/components/admin/BlockedRowResolver";
import {
  FINALIZE_STREAM_CONTENT_TYPE,
  type PerRowFailure,
  type FinalizeBatchResponse,
  type CasPerRowEntry,
  type FinalizeResponse,
  type FinalizeCasResponse,
  type FinalizeStreamMessage,
  type FinalizeCasStreamMessage,
  type FinalizeCasPhase,
} from "@/lib/onboarding/finalizeProgress";

// The per-row codes a re-scan can heal: an outdated Phase-D shadow, and a role-mapping
// stamp gone stale at publish (spec 2026-07-16-role-vocab-staging-overlay §3.5 heal
// step ii — the re-scan re-derives the stamp under the current vocabulary). Corrupt-payload
// / archived-show rows keep their existing recovery (re-scan is the wrong tool there).
const RESCANNABLE_CAS_CODES = new Set([
  "STAGED_PARSE_OUTDATED_AT_PHASE_D",
  "ROLE_MAPPINGS_OUTDATED_AT_PUBLISH",
]);

type FinalizeButtonProps = {
  wizardSessionId: string;
  disabled?: boolean;
  // §4.1 / D5: the button label reads "Publish N shows & finish setup" where
  // N = publishCount (rows currently checked → status 'applied'). Optional so
  // legacy callers (and the resume button) keep the prior generic label.
  publishCount?: number;
  // §4.1 / D5: count of clean rows left UNCHECKED (status 'staged'). When > 0,
  // clicking Publish opens a soft confirm first ("N sheets won't be published
  // — you'll find them under Unpublished. Continue?"). They become Held shows.
  uncheckedCleanCount?: number;
  // §4.1 / D5: the display names of those unchecked-clean sheets, so the confirm
  // names which sheet(s) won't be published. Forwarded to useFinalizeRun.
  uncheckedCleanNames?: string[];
  // LAYOUT-ONLY (Variant B, Task 6): where the running/terminal panels sit
  // relative to the trigger. "below" (default) = current order (trigger, then
  // panels below). "above" = flex-col-reverse, so the panels float ABOVE the
  // trigger — used inside the sticky publish bar, where the bar hugs the viewport
  // bottom and terminal error/race panels must appear above it. No behavior /
  // state-machine / testid / focus change; purely the flex direction.
  panelPlacement?: "above" | "below";
};

type ButtonState =
  | { kind: "idle" }
  // Per-sheet publishing progress. `done`/`total` are the DISPLAY values already reconciled across
  // batches (done = rows finished so far; total = the grand total). lastName is the current sheet.
  | { kind: "running"; phase: "batch"; done: number; total: number; lastName: string | null }
  // The distinct "Finishing setup…" step; casPhase drives the sub-label.
  | { kind: "running"; phase: "cas"; casPhase: FinalizeCasPhase | null }
  | { kind: "race_row"; failures: PerRowFailure[] }
  | { kind: "cas_per_row"; rows: CasPerRowEntry[] }
  | { kind: "error"; copy: string; code: string | null }
  | { kind: "complete" };

export function casPhaseLabel(phase: FinalizeCasPhase | null): string {
  switch (phase) {
    case "applying":
      return "Applying your edits…";
    case "publishing":
      return "Making shows live…";
    case "subscribing":
      return "Connecting your folder…";
    default:
      // No phase yet (CAS entry, before the first phase event): the "Finishing setup…" heading
      // stands alone — avoid a redundant "Finishing up…" second line.
      return "";
  }
}

function lookupDougFacing(code: string | undefined | null): string | null {
  if (!code) return null;
  if (!(code in MESSAGE_CATALOG)) return null;
  return messageFor(code as MessageCode).dougFacing ?? null;
}

// not-subject:M5-D8 — defensive fallback when catalog lookup returns null; all real error copy routes through messageFor(code).dougFacing first.
const GENERIC_ERROR =
  "The publish step could not complete. Refresh and try again, or contact the developer if this keeps happening.";

export type FinalizeRunProps = {
  wizardSessionId: string;
  disabled?: boolean;
  publishCount?: number;
  uncheckedCleanCount?: number;
  // §4.1 / D5: the display names of the unchecked-clean sheets, so the soft
  // confirm NAMES which sheet(s) won't be published. Length matches
  // uncheckedCleanCount; omitted (legacy callers) → the confirm shows the count
  // only, no name list.
  uncheckedCleanNames?: string[];
  // Step-3 consolidation (spec §4.5): the endpoint sequence this run drives.
  //   "publish" (default) — the /finalize batch loop THEN /finalize-cas.
  //   "resume"            — the /finalize batch loop ONLY; STOP before CAS
  //                         (mid-finalize in_progress checkpoint recovery).
  //   "finish"            — ONLY /finalize-cas (all_batches_complete → flip to Live).
  mode?: "publish" | "resume" | "finish";
};

/**
 * useFinalizeRun — the finalize state machine + streaming loop, extracted so a
 * caller can place the trigger and the status/tracking in SEPARATE layout slots.
 * The wizard footer (Step3ReviewWithFinalize) puts the Publish button in the
 * right slot and the live tracking in the CENTER; the combined <FinalizeButton>
 * below composes the same hook + presentational pieces into one stacked unit for
 * every other caller (behavior + testids unchanged).
 */
export function useFinalizeRun({
  wizardSessionId,
  disabled,
  publishCount,
  uncheckedCleanCount = 0,
  uncheckedCleanNames = [],
  mode = "publish",
}: FinalizeRunProps) {
  const router = useRouter();
  const [state, setState] = useState<ButtonState>({ kind: "idle" });
  // D5 soft confirm: a CONTROLLED open flag (not an in-onClick self-disable —
  // see feedback_react_form_action_synchronous_disable_cancels_submit). Opening
  // the confirm is a pure setState; the loop runs only from the confirm's
  // Proceed action (or directly when nothing is left unchecked).
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Cross-batch progress accumulators. Refs (not state) so the stream reader reads them
  // synchronously between events. completedRef = rows finished in PRIOR batches; grandTotalRef =
  // the grand total (completed + the current batch's `listed` remaining). Reset each runLoop entry.
  const completedRef = useRef(0);
  const grandTotalRef = useRef(0);
  // A11y (WCAG 2.4.3) focus management on entering the running/terminal states
  // lives in the presentational pieces that own the DOM — <ProgressPanel> (via
  // its host in FinalizeButton), <FinalizeStatusRegion> (terminal alerts), and
  // <Step3CompactTracking> — each with its OWN local ref + focus-on-entry effect.
  // The hook deliberately holds no DOM refs: returning a ref through `run` and
  // passing it as a prop trips react-hooks/refs (a ref surfaced during render).

  // Read one /finalize batch response. Streaming (Accept: NDJSON) → parse listed/row progress into
  // state and return the terminal body + rows processed this batch. Non-NDJSON (proxy stripped
  // Accept, a pre-stream error, or a legacy/test caller) → the `!isStream` safety net reads
  // response.json(). A stream that ends before its terminal `result` returns an interruption sentinel.
  async function readFinalizeBatch(
    response: Response,
  ): Promise<{ body: FinalizeResponse; rowsProcessed: number } | { interrupted: true }> {
    const contentType = response.headers?.get?.("content-type") ?? "";
    const isStream =
      response.ok && contentType.includes(FINALIZE_STREAM_CONTENT_TYPE) && response.body != null;
    if (!isStream) {
      return { body: (await response.json()) as FinalizeResponse, rowsProcessed: 0 };
    }
    const baseline = completedRef.current;
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let terminal: FinalizeResponse | null = null;
    let rowsProcessed = 0;
    const handle = (line: string) => {
      let msg: FinalizeStreamMessage;
      try {
        msg = JSON.parse(line) as FinalizeStreamMessage;
      } catch {
        return;
      }
      if (msg.type === "listed") {
        grandTotalRef.current = baseline + msg.total;
        setState((s) =>
          s.kind === "running" && s.phase === "batch"
            ? { ...s, done: baseline, total: grandTotalRef.current }
            : s,
        );
      } else if (msg.type === "row") {
        rowsProcessed = msg.total;
        const target = grandTotalRef.current || baseline + msg.done;
        const done = Math.min(baseline + msg.done, target);
        setState((s) =>
          s.kind === "running" && s.phase === "batch"
            ? { ...s, done, total: grandTotalRef.current, lastName: msg.name || msg.driveFileId }
            : s,
        );
      } else if (msg.type === "result") {
        terminal = msg.body;
      }
    };
    outer: for (;;) {
      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf("\n");
      while (nl >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) {
          handle(line);
          if (terminal) break outer;
        }
        nl = buffer.indexOf("\n");
      }
      if (done) break;
    }
    // Release the body reader promptly once the terminal result is in hand (the server closes
    // right after it; cancel() is a clean no-op if the stream is already closed).
    await reader.cancel().catch(() => {});
    if (!terminal) {
      const tail = buffer.trim();
      if (tail) handle(tail);
    }
    if (!terminal) return { interrupted: true };
    return { body: terminal, rowsProcessed };
  }

  // Read the /finalize-cas response: phase events drive the "Finishing setup…" sub-label; returns
  // the terminal body (or an interruption sentinel). Same NDJSON/JSON dual handling as the batch.
  async function readFinalizeCas(
    response: Response,
  ): Promise<{ body: FinalizeCasResponse } | { interrupted: true }> {
    const contentType = response.headers?.get?.("content-type") ?? "";
    const isStream =
      response.ok && contentType.includes(FINALIZE_STREAM_CONTENT_TYPE) && response.body != null;
    if (!isStream) {
      return { body: (await response.json()) as FinalizeCasResponse };
    }
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let terminal: FinalizeCasResponse | null = null;
    const handle = (line: string) => {
      let msg: FinalizeCasStreamMessage;
      try {
        msg = JSON.parse(line) as FinalizeCasStreamMessage;
      } catch {
        return;
      }
      if (msg.type === "phase") {
        setState((s) =>
          s.kind === "running" && s.phase === "cas" ? { ...s, casPhase: msg.phase } : s,
        );
      } else if (msg.type === "result") {
        terminal = msg.body;
      }
    };
    outer: for (;;) {
      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf("\n");
      while (nl >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line) {
          handle(line);
          if (terminal) break outer;
        }
        nl = buffer.indexOf("\n");
      }
      if (done) break;
    }
    // Release the body reader promptly once the terminal result is in hand (the server closes
    // right after it; cancel() is a clean no-op if the stream is already closed).
    await reader.cancel().catch(() => {});
    if (!terminal) {
      const tail = buffer.trim();
      if (tail) handle(tail);
    }
    if (!terminal) return { interrupted: true };
    return { body: terminal };
  }

  async function runLoop() {
    if (state.kind === "running") return;
    setConfirmOpen(false);
    // Fresh accumulators every attempt: a retry after error/race_row/cas_per_row must not inherit a
    // prior run's completed count (the server's `listed` reflects only the REMAINING finishable rows).
    completedRef.current = 0;
    grandTotalRef.current = 0;

    // mode:"finish" (spec §4.5) — the batch loop already ran in a prior session
    // (checkpoint all_batches_complete); go straight to the /finalize-cas flip.
    if (mode !== "finish") {
      setState({ kind: "running", phase: "batch", done: 0, total: 0, lastName: null });

      while (true) {
        let response: Response;
        try {
          response = await fetch("/api/admin/onboarding/finalize", {
            method: "POST",
            headers: { Accept: FINALIZE_STREAM_CONTENT_TYPE },
          });
        } catch {
          setState({ kind: "error", copy: GENERIC_ERROR, code: null });
          return;
        }
        let read: Awaited<ReturnType<typeof readFinalizeBatch>>;
        try {
          read = await readFinalizeBatch(response);
        } catch {
          // A mid-stream reader.read() rejection (connection drop) or a non-stream
          // response.json() parse failure escapes here; map it to the same generic
          // error the clean-EOF interruption sentinel uses so the panel never
          // freezes on kind:'running' (unguarded, it escaped `void runLoop()`).
          setState({ kind: "error", copy: GENERIC_ERROR, code: null });
          return;
        }
        if ("interrupted" in read) {
          setState({ kind: "error", copy: GENERIC_ERROR, code: null });
          return;
        }
        const body = read.body;
        if ("ok" in body && body.ok === false) {
          setState({
            kind: "error",
            copy: lookupDougFacing(body.code) ?? GENERIC_ERROR,
            code: body.code,
          });
          return;
        }
        const batchBody = body as FinalizeBatchResponse;
        // Per-row failures can land on EITHER batch_complete OR all_batches_complete (a row that races
        // mid-batch surfaces with a non-OK entry alongside the OK entries). Inspect per_row BEFORE
        // branching on status; if any row is non-OK, stop the loop and render the re-apply links from
        // THIS response's pre-built re_apply_url. Looping past a failure would strand the operator.
        const failedRows = (batchBody.per_row ?? []).filter(
          (r): r is PerRowFailure => r.code !== "OK",
        );
        if (failedRows.length > 0) {
          setState({ kind: "race_row", failures: failedRows });
          return;
        }
        // This batch's rows are now finished — fold them into the cross-batch baseline.
        completedRef.current += read.rowsProcessed;
        if (batchBody.status === "batch_complete") continue;
        if (batchBody.status === "all_batches_complete") break;
        setState({ kind: "error", copy: GENERIC_ERROR, code: null });
        return;
      }

      // mode:"resume" (owner decision 2026-07-06, supersedes spec §4.5's split):
      // once the batch loop drains with nothing blocking (a per-row failure would
      // have returned `race_row` inside the loop above), resume AUTO-CONTINUES into
      // the CAS flip below — same as `publish` — so one "Resume publishing" click
      // runs to Live and lands on the dashboard. It no longer stops at a redundant
      // all_batches_complete checkpoint (which also stranded a stale "Setup is
      // complete" banner from this very run across the router.refresh()). Resume
      // still STOPS at `race_row` when a row needs review — that early return is
      // inside the loop, so reaching here means the batches are clean to finish.
    }

    setState({ kind: "running", phase: "cas", casPhase: null });
    let casResponse: Response;
    try {
      casResponse = await fetch("/api/admin/onboarding/finalize-cas", {
        method: "POST",
        headers: { Accept: FINALIZE_STREAM_CONTENT_TYPE },
      });
    } catch {
      setState({ kind: "error", copy: GENERIC_ERROR, code: null });
      return;
    }
    let casRead: Awaited<ReturnType<typeof readFinalizeCas>>;
    try {
      casRead = await readFinalizeCas(casResponse);
    } catch {
      setState({ kind: "error", copy: GENERIC_ERROR, code: null });
      return;
    }
    if ("interrupted" in casRead) {
      setState({ kind: "error", copy: GENERIC_ERROR, code: null });
      return;
    }
    const casBody = casRead.body;
    if ("ok" in casBody && casBody.ok === false) {
      // WM-R3: per-row entries (retained shadow rows) get their own catalog copy INSTEAD OF the
      // generic top-level line — a corrupt-retained shadow blocks finalize on every retry, so the
      // operator needs the per-file recovery copy (cleanup for corrupt rows; outdated rows self-heal
      // on the next finalize click per the master-spec contract).
      const casFailedRows = (casBody.per_row ?? []).filter((row) => row.code !== "OK");
      if (casFailedRows.length > 0) {
        setState({ kind: "cas_per_row", rows: casFailedRows });
        return;
      }
      setState({
        kind: "error",
        copy: lookupDougFacing(casBody.code) ?? GENERIC_ERROR,
        code: casBody.code,
      });
      return;
    }
    setState({ kind: "complete" });
    router.refresh();
  }

  const isRunning = state.kind === "running";
  const buttonDisabled = Boolean(disabled) || isRunning;

  // D5 label: "Publish N shows & finish setup" when a count is threaded;
  // otherwise the prior generic label (legacy callers / resume button).
  // Step-3 consolidation (spec §4.5): the primary label follows the mode. Resume
  // continues an interrupted finalize; Finish flips the applied shows to Live.
  const idleLabel =
    mode === "resume"
      ? "Resume publishing"
      : mode === "finish"
        ? "Finish setup"
        : typeof publishCount === "number"
          ? `Publish ${publishCount} show${publishCount === 1 ? "" : "s"} & finish setup`
          : "Finish setup and publish";

  // Persistent SR live message for the transient running phases (rendered by the announcer below).
  const liveMessage =
    state.kind === "running"
      ? state.phase === "cas"
        ? "Finishing setup"
        : "Publishing your shows"
      : "";

  // The in-flight button label: while running, the Publish trigger stays put but
  // steps into a disabled "Publishing…" (or "Finishing setup…" during the CAS
  // step) intermediary state with a spinner — it no longer vanishes outright
  // (owner decision 2026-07-06). Empty when idle (the button shows `idleLabel`).
  const runningLabel =
    state.kind === "running" ? (state.phase === "cas" ? "Finishing setup…" : "Publishing…") : "";

  // Primary click: if clean rows remain unchecked, open the soft confirm
  // FIRST (pure setState — never self-disables the button mid-submit). With
  // nothing unchecked, run the loop directly. The confirm's Proceed runs it.
  function onPrimaryClick() {
    if (buttonDisabled) return;
    if (uncheckedCleanCount > 0) {
      setConfirmOpen(true);
      return;
    }
    void runLoop();
  }

  return {
    state,
    isRunning,
    buttonDisabled,
    confirmOpen,
    setConfirmOpen,
    onPrimaryClick,
    runLoop,
    // Reset a terminal (race_row / cas_per_row / error) back to idle. Called by
    // the blocker modal's Close/Back controls (spec 2026-07-17 §4.3). Never fires
    // while running (the modal is not mounted then).
    dismiss: () => setState({ kind: "idle" }),
    liveMessage,
    idleLabel,
    runningLabel,
    uncheckedCleanCount,
    uncheckedCleanNames,
    wizardSessionId,
  };
}

export type FinalizeRun = ReturnType<typeof useFinalizeRun>;

/**
 * Persistent SR announcer for the transient running phases. Hoisted so screen
 * readers reliably announce phase changes — a live region inserted
 * already-populated is often missed; a stable region whose text mutates is
 * announced.
 */
export function FinalizeAnnouncer({ run }: { run: FinalizeRun }) {
  return (
    <span className="sr-only" role="status" aria-live="polite">
      {run.liveMessage}
    </span>
  );
}

/**
 * The Publish trigger (the AccentButton). Placement is the caller's. While a
 * run is in flight it stays mounted as a DISABLED "Publishing…" intermediary
 * (spinner + `aria-busy`) rather than unmounting — the button click has a
 * visible destination instead of the control vanishing (owner decision
 * 2026-07-06). The double-fire guard is `run.buttonDisabled` (true while
 * running) + the `onPrimaryClick` early-return, not the old unmount.
 */
export function FinalizeTrigger({ run }: { run: FinalizeRun }) {
  const running = run.isRunning;
  return (
    <AccentButton
      data-testid="wizard-finalize-button"
      onClick={run.onPrimaryClick}
      disabled={run.buttonDisabled}
      aria-busy={running || undefined}
      // The soft-confirm popup semantics apply only to the idle trigger; while
      // running there is no dialog to open, so drop haspopup/expanded.
      aria-haspopup={!running && run.uncheckedCleanCount > 0 ? "dialog" : undefined}
      aria-expanded={!running && run.uncheckedCleanCount > 0 ? run.confirmOpen : undefined}
      size="lg"
      inline
      selfStart
      shadow
      className="gap-2"
    >
      {running ? (
        <>
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          {run.runningLabel}
        </>
      ) : (
        run.idleLabel
      )}
    </AccentButton>
  );
}

/** The D5 soft confirm, rendered only while open. */
export function FinalizeConfirm({ run }: { run: FinalizeRun }) {
  if (!run.confirmOpen) return null;
  return (
    <FinalizeSoftConfirm
      uncheckedCleanCount={run.uncheckedCleanCount}
      uncheckedCleanNames={run.uncheckedCleanNames}
      onProceed={() => void run.runLoop()}
      onCancel={() => run.setConfirmOpen(false)}
    />
  );
}

/**
 * The TERMINAL status panels (race-row / cas-per-row / error / complete) as a
 * fragment — no wrapper, so a host's flow is unchanged. The RUNNING progress is
 * NOT here: the combined <FinalizeButton> morphs its trigger into <ProgressPanel>
 * in place, while the wizard footer renders a compact inline tracking; each host
 * owns the running display and shares these terminal panels.
 */
export function FinalizeStatusRegion({ run }: { run: FinalizeRun }) {
  const { state, wizardSessionId } = run;
  // A11y (WCAG 2.4.3): on entering a terminal alert state the trigger/panel is
  // gone, so move focus onto the alert region (a local ref + focus-on-entry
  // effect — the hook holds no DOM refs). Only one terminal panel renders at a
  // time, so the single ref lands on whichever is mounted.
  const alertRef = useRef<HTMLDivElement>(null);
  const isAlert =
    state.kind === "race_row" || state.kind === "cas_per_row" || state.kind === "error";
  useEffect(() => {
    if (isAlert) alertRef.current?.focus();
  }, [isAlert]);
  return (
    <>
      {state.kind === "race_row" ? (
        <div
          ref={alertRef}
          tabIndex={-1}
          role="alert"
          data-testid="wizard-finalize-race-row"
          className="flex flex-col gap-3 rounded-md border border-border bg-warning-bg p-tile-pad text-warning-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          <p className="text-sm font-semibold">
            Some sheets need another look before we can publish.
          </p>
          <ul className="flex flex-col gap-2">
            {state.failures.map((failure) => (
              <li key={failure.drive_file_id} className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{failure.display_name ?? failure.drive_file_id}</span>
                <span className="text-text-subtle">
                  {lookupDougFacing(failure.code) ??
                    "This sheet could not be published in the current batch."}
                </span>
                <HelpAffordance code={failure.code} />
                <Link
                  data-testid={`wizard-finalize-reapply-${failure.drive_file_id}`}
                  href={failure.re_apply_url}
                  className="inline-flex min-h-tap-min items-center self-start text-text-strong underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                >
                  Review and re-apply
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.kind === "cas_per_row" ? (
        <div
          ref={alertRef}
          tabIndex={-1}
          role="alert"
          data-testid="wizard-finalize-cas-per-row"
          className="flex flex-col gap-3 rounded-md border border-border bg-warning-bg p-tile-pad text-warning-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          <p className="text-sm font-semibold">Some sheets are blocking the final publish step.</p>
          <ul className="flex flex-col gap-2">
            {state.rows.map((row) => (
              <li key={row.drive_file_id} className="flex flex-col gap-1 text-sm">
                <span className="font-medium">{row.display_name ?? row.drive_file_id}</span>
                <span className="text-text-subtle">
                  {lookupDougFacing(row.code) ?? GENERIC_ERROR}
                </span>
                <HelpAffordance code={row.code} />
                {/* A re-scannable refusal self-heals via a re-scan; offer it inline. */}
                {RESCANNABLE_CAS_CODES.has(row.code) ? (
                  <RescanSheetButton
                    driveFileId={row.drive_file_id}
                    wizardSessionId={wizardSessionId}
                  />
                ) : (
                  <BlockedRowResolver
                    driveFileId={row.drive_file_id}
                    wizardSessionId={wizardSessionId}
                    code={row.code}
                    {...(row.display_name !== undefined ? { displayName: row.display_name } : {})}
                    {...(row.rebuild_exhausted !== undefined
                      ? { rebuildExhausted: row.rebuild_exhausted }
                      : {})}
                    onResolved={() => void run.runLoop()}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div
          ref={alertRef}
          tabIndex={-1}
          role="alert"
          data-testid="wizard-finalize-error"
          className="flex flex-col gap-1 rounded-md border border-border bg-warning-bg p-tile-pad text-sm text-warning-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          <p>{renderEmphasis(state.copy)}</p>
          <HelpAffordance code={state.code} />
        </div>
      ) : null}

      {state.kind === "complete" ? (
        <p
          role="status"
          aria-live="polite"
          data-testid="wizard-finalize-publish-complete"
          className="text-sm text-text-subtle"
        >
          Setup is complete. Your shows are live for crew now.
        </p>
      ) : null}
    </>
  );
}

/**
 * Combined trigger + inline morph + status, stacked. This is the drop-in unit
 * every caller EXCEPT the wizard footer uses (Step3ReviewWithFinalize composes
 * the hook + pieces into the footer's separate center/right slots). DOM +
 * testids are unchanged from before the hook extraction.
 */
export function FinalizeButton({ panelPlacement = "below", ...props }: FinalizeButtonProps) {
  const run = useFinalizeRun(props);
  // A11y (WCAG 2.4.3): when the trigger morphs into the progress panel, move
  // focus onto the panel (a local ref + focus-on-entry effect; the hook holds no
  // DOM refs). Mirrors <FinalizeStatusRegion>'s alert focus + Step3's tracking.
  const panelRef = useRef<HTMLDivElement>(null);
  const running = run.state.kind === "running";
  useEffect(() => {
    if (running) panelRef.current?.focus();
  }, [running]);
  return (
    <div
      className={`flex ${panelPlacement === "above" ? "flex-col-reverse" : "flex-col"} gap-3`}
      data-testid="wizard-finalize"
    >
      <FinalizeAnnouncer run={run} />
      {/* D2 inline morph: while running, the button region becomes the progress panel. */}
      {run.state.kind === "running" ? (
        <ProgressPanel ref={panelRef} state={run.state} />
      ) : (
        <FinalizeTrigger run={run} />
      )}
      <FinalizeConfirm run={run} />
      <FinalizeStatusRegion run={run} />
    </div>
  );
}

/**
 * D2/D3 inline progress panel — replaces the button while the publish runs. Batch phase: a
 * determinate native `<progress>` bar + "X of Y shows" + the current sheet name. CAS phase: the
 * distinct "Finishing setup…" step with a phase sub-label. Mirrors <Step2Verify>'s scan panel
 * (same tokens, same native bar) so the two wizard progress surfaces read as siblings. All motion
 * is the native bar's value change; state swaps are instant (no animation).
 */
const ProgressPanel = forwardRef<
  HTMLDivElement,
  { state: Extract<ButtonState, { kind: "running" }> }
>(function ProgressPanel({ state }, ref) {
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="group"
      aria-label="Publish progress"
      data-testid="wizard-finalize-progress"
      className="flex flex-col gap-2 rounded-md border border-border bg-surface-sunken p-tile-pad text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
    >
      {state.phase === "batch" ? (
        <>
          <p className="text-base font-semibold text-text-strong" aria-hidden="true">
            Publishing your shows…
          </p>
          {/* Native <progress> drives the progressbar role's value/max/valuetext — no explicit
                aria-value* needed (they duplicate it and misbehave in the indeterminate case). */}
          <progress
            data-testid="wizard-finalize-progressbar"
            className="h-2 w-full"
            max={state.total > 0 ? state.total : undefined}
            value={state.total > 0 ? Math.min(state.done, state.total) : undefined}
            aria-label="Publish progress"
          />
          {state.total > 0 ? (
            <p
              className="tabular-nums text-text-subtle"
              data-testid="wizard-finalize-count"
              aria-hidden="true"
            >
              {Math.min(state.done, state.total)} of {state.total} show
              {state.total === 1 ? "" : "s"}
            </p>
          ) : null}
          {state.lastName ? (
            <p
              className="truncate text-text"
              data-testid="wizard-finalize-current"
              title={state.lastName}
              aria-hidden="true"
            >
              <span className="text-text-subtle">Publishing: </span>
              {state.lastName}
            </p>
          ) : null}
        </>
      ) : (
        <>
          <p className="text-base font-semibold text-text-strong" aria-hidden="true">
            Finishing setup…
          </p>
          <p
            className="text-text-subtle"
            data-testid="wizard-finalize-cas-phase"
            aria-hidden="true"
          >
            {casPhaseLabel(state.casPhase)}
          </p>
        </>
      )}
    </div>
  );
});

// Cap the named sheets so a large held set can't grow the popover unbounded;
// past the cap, a "+N more" tail carries the remainder (spec-style truncation).
const CONFIRM_NAME_CAP = 3;

/**
 * D5 soft confirm (spec §4.1 / D4 decision): a dialog-semantic confirm surface —
 * `role="dialog"` + `aria-modal`, a labelled title, autofocus onto Continue,
 * Escape-to-cancel, and a focus trap between Continue ↔ Cancel so the decision is
 * keyboard-complete. It never self-disables the trigger mid-submit (React-19
 * form-action hazard); Proceed simply calls the loop. The CALLER anchors it as a
 * popover ABOVE the primary button (absolute, `bottom-full`) so opening it floats
 * over page content instead of growing the sticky footer (owner decision
 * 2026-07-06: the in-footer render caused the layout shift Doug flagged).
 */
function FinalizeSoftConfirm({
  uncheckedCleanCount,
  uncheckedCleanNames = [],
  onProceed,
  onCancel,
}: {
  uncheckedCleanCount: number;
  uncheckedCleanNames?: string[];
  onProceed: () => void;
  onCancel: () => void;
}) {
  const proceedRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Autofocus the primary action when the confirm opens (keyboard users land
  // inside the dialog, not back on the trigger).
  useEffect(() => {
    proceedRef.current?.focus();
  }, []);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key === "Tab") {
      // Two-stop focus trap: Continue ↔ Cancel, both directions.
      const proceed = proceedRef.current;
      const cancel = cancelRef.current;
      if (!proceed || !cancel) return;
      const active = document.activeElement;
      if (event.shiftKey && active === proceed) {
        event.preventDefault();
        cancel.focus();
      } else if (!event.shiftKey && active === cancel) {
        event.preventDefault();
        proceed.focus();
      }
    }
  }

  const noun = uncheckedCleanCount === 1 ? "sheet" : "sheets";
  const shownNames = uncheckedCleanNames.slice(0, CONFIRM_NAME_CAP);
  const extraNames = Math.max(0, uncheckedCleanNames.length - shownNames.length);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wizard-finalize-confirm-title"
      data-testid="wizard-finalize-confirm"
      onKeyDown={onKeyDown}
      className="flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-3 rounded-lg border border-border-strong bg-surface-raised p-tile-pad shadow-popover"
    >
      <div className="flex flex-col gap-1">
        <p id="wizard-finalize-confirm-title" className="text-base font-semibold text-text-strong">
          {uncheckedCleanCount} {noun} won&rsquo;t be published
        </p>
        {/* Name the held sheet(s) so "which one?" is answered in place. Capped —
            past CONFIRM_NAME_CAP a "+N more" tail keeps the popover bounded. */}
        {shownNames.length > 0 ? (
          <ul
            data-testid="wizard-finalize-confirm-names"
            className="flex flex-col gap-0.5 text-sm text-text-strong"
          >
            {shownNames.map((name, i) => (
              <li key={`${name}-${i}`} className="flex items-start gap-1.5">
                <span
                  aria-hidden="true"
                  className="mt-2 size-[3px] shrink-0 rounded-full bg-border-strong"
                />
                <span className="truncate">{name}</span>
              </li>
            ))}
            {extraNames > 0 ? (
              <li className="flex items-start gap-1.5 text-text-subtle">
                <span
                  aria-hidden="true"
                  className="mt-2 size-[3px] shrink-0 rounded-full bg-border-strong"
                />
                <span>and {extraNames} more</span>
              </li>
            ) : null}
          </ul>
        ) : null}
        <p className="text-sm text-text-subtle">
          You&rsquo;ll find {uncheckedCleanCount === 1 ? "it" : "them"} under{" "}
          <span className="font-medium text-text-strong">Unpublished</span>, ready to publish
          anytime. Continue?
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <AccentButton
          ref={proceedRef}
          data-testid="wizard-finalize-confirm-proceed"
          onClick={onProceed}
          size="sm"
          inline
          ringOffset="surface-raised"
        >
          Continue
        </AccentButton>
        <button
          ref={cancelRef}
          type="button"
          data-testid="wizard-finalize-confirm-cancel"
          onClick={onCancel}
          className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-4 text-sm font-semibold text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          Go back
        </button>
      </div>
    </div>
  );
}
