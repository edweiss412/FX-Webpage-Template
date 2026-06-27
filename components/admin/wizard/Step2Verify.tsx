"use client";

/**
 * components/admin/wizard/Step2Verify.tsx (M10 §B Task 10.3 / Phase 2; streamed
 * progress, 2026-06-23)
 *
 * Wizard step 2 — "Verify your folder." Operator pastes a Google Drive folder
 * URL; the component POSTs to /api/admin/onboarding/scan (the §A Pin-1 thick
 * route). The route now STREAMS NDJSON progress (listed → prepared×N → staging
 * → terminal result); this component reads the stream and renders a determinate
 * progress bar plus a "Just read: <name>" status line.
 *
 * Response handling:
 *   - Pre-stream errors (auth / URL / folder / reserve) come back as today's
 *     non-200 JSON (or any non-NDJSON body) → the `!isStream` branch reads
 *     response.json() and runs the same outcome handling (safety net).
 *   - The streamed success path reads body.getReader(), parses NDJSON lines
 *     (buffering across chunk boundaries), updates the bar on each `prepared`,
 *     and applies the terminal `result` (completed → success; superseded →
 *     router.refresh(); schema_missing / {ok:false} → catalog/generic copy).
 *
 * AC-10.2: every documented success/failure path renders via messageFor — never
 * a raw §12.4 code (AGENTS.md invariant 5). Mid-run failures arrive as a
 * terminal { ok:false, code:null } → the generic copy (no raw code).
 *
 * WIZARD_SESSION_SUPERSEDED_DURING_SCAN is admin-log-only (spec §12.4:2693): the
 * client routes the "superseded" outcome through router.refresh(), never copy.
 */
import Link from "next/link";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { messageFor } from "@/lib/messages/lookup";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { HelpTooltip } from "@/components/admin/HelpTooltip";
import type { MessageCode } from "@/lib/messages/catalog";
import {
  SCAN_STREAM_CONTENT_TYPE,
  type ScanResultBody,
  type ScanStreamMessage,
} from "@/lib/onboarding/scanProgress";
import type {
  OnboardingScanCompletedBody,
  OnboardingScanTotals,
} from "@/lib/onboarding/scanResponse";

const RECOGNIZED_CODES = new Set<MessageCode>([
  "INVALID_FOLDER_URL",
  "FOLDER_NOT_SHARED",
  "FOLDER_NOT_FOUND",
  "OPERATOR_ERROR_NOT_FOLDER",
  "OPERATOR_ERROR_INCOMPLETE_FOLDER_METADATA",
  "WIZARD_ISOLATION_INDEXES_MISSING",
]);

// not-subject:M5-D8 — code-less generic fallbacks (network unreachable / unknown
// or null code). There is no §12.4 code to route through messageFor for these;
// the prior component used these same literals inline at the callsites.
const GENERIC_DRIVE_ERROR =
  "We could not reach Drive just now. Check your connection and try again.";
// not-subject:M5-D8 — generic verify fallback for a null/unrecognized code.
const GENERIC_VERIFY_ERROR =
  "We could not verify that folder. Try the link again, or contact the developer if this keeps happening.";

type ScanCompleted = OnboardingScanCompletedBody;

// Server-persisted result of a scan the operator already ran this session
// (app_settings.pending_folder_* + a reserved pending_wizard_session_id). When
// present, Step 2 rehydrates after a "Back" from Step 3: the folder input is
// pre-filled and a "Continue to Step 3" link reopens the forward path without
// forcing a re-scan. `folderUrl` is the canonical Drive folder URL rebuilt from
// pending_folder_id (round-trips through the route's parseDriveFolderId).
export type Step2PriorScan = { folderName: string | null; folderUrl: string | null };

type ScanProgress =
  | { phase: "connecting" }
  | { phase: "reading"; done: number; total: number; lastName: string | null }
  | { phase: "finishing" };

type FormState =
  | { kind: "idle" }
  | { kind: "submitting"; folderUrl: string; progress: ScanProgress }
  | { kind: "success"; result: ScanCompleted }
  | { kind: "error"; copy: string; code: string | null };

function formatTotals(totals: OnboardingScanTotals): number {
  return (
    totals.staged + totals.hard_failed + totals.skipped_non_sheet + (totals.live_row_conflict ?? 0)
  );
}

function copyForCode(code: string | null): string {
  if (code && RECOGNIZED_CODES.has(code as MessageCode)) {
    const entry = messageFor(code as MessageCode);
    if (entry.dougFacing) return entry.dougFacing;
  }
  // Defensive fallback (no raw code).
  return GENERIC_VERIFY_ERROR;
}

// Primary CTA — the single accent fill allowed per card (DESIGN.md ≤10% accent).
const PRIMARY_BUTTON =
  "inline-flex min-h-tap-min items-center justify-center self-start rounded-sm bg-accent px-6 text-base font-semibold text-accent-text shadow-(--shadow-tile) transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";
// Secondary CTA (re-scan in resume mode). A recessed `surface-sunken` fill +
// strong text keeps it reading as a BUTTON, distinct from the `bg-bg` folder
// input directly above it (which shares the same border token).
const SECONDARY_BUTTON =
  "inline-flex min-h-tap-min items-center justify-center self-start rounded-sm border border-border-strong bg-surface-sunken px-6 text-base font-medium text-text-strong transition-colors duration-fast hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2";

export function Step2Verify({ priorScan }: { priorScan?: Step2PriorScan } = {}) {
  const router = useRouter();
  const [folderUrl, setFolderUrl] = useState(priorScan?.folderUrl ?? "");
  const [state, setState] = useState<FormState>({ kind: "idle" });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startedAtRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isSubmitting = state.kind === "submitting";

  useEffect(() => {
    if (!isSubmitting) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isSubmitting]);

  // Apply a terminal result body — shared by the stream + non-stream branches.
  function applyResultBody(body: ScanResultBody | { ok: false; code: string }) {
    if ("outcome" in body) {
      if (body.outcome === "completed") {
        setState({ kind: "success", result: body });
        return;
      }
      if (body.outcome === "superseded") {
        // Admin-log-only (spec §12.4:2693): no Doug-facing copy. Reset + refresh
        // so the Phase 2 dispatcher reads the rotated session.
        setState({ kind: "idle" });
        router.refresh();
        return;
      }
      if (body.outcome === "schema_missing") {
        setState({ kind: "error", copy: copyForCode(body.code), code: body.code });
        return;
      }
    }
    if ("ok" in body && body.ok === false) {
      setState({ kind: "error", copy: copyForCode(body.code), code: body.code });
      return;
    }
    setState({ kind: "error", copy: GENERIC_VERIFY_ERROR, code: null });
  }

  // Returns true if `line` was the terminal result (caller stops reading).
  function dispatchLine(line: string): boolean {
    let msg: ScanStreamMessage;
    try {
      msg = JSON.parse(line) as ScanStreamMessage;
    } catch {
      return false;
    }
    if (msg.type === "listed") {
      const total = msg.total;
      setState((s) =>
        s.kind === "submitting"
          ? {
              ...s,
              progress:
                total <= 0
                  ? { phase: "finishing" }
                  : { phase: "reading", done: 0, total, lastName: null },
            }
          : s,
      );
      return false;
    }
    if (msg.type === "prepared") {
      setState((s) =>
        s.kind === "submitting"
          ? {
              ...s,
              progress: {
                phase: "reading",
                done: msg.done,
                total: msg.total,
                lastName: msg.name || null,
              },
            }
          : s,
      );
      return false;
    }
    if (msg.type === "staging") {
      setState((s) => (s.kind === "submitting" ? { ...s, progress: { phase: "finishing" } } : s));
      return false;
    }
    if (msg.type === "result") {
      applyResultBody(msg.body);
      return true;
    }
    return false;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = folderUrl.trim();
    if (!trimmed) return;
    setElapsedSeconds(0);
    startedAtRef.current = Date.now();
    setState({ kind: "submitting", folderUrl: trimmed, progress: { phase: "connecting" } });
    try {
      const response = await fetch("/api/admin/onboarding/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderUrl: trimmed }),
      });
      const contentType = response.headers?.get?.("content-type") ?? "";
      const isStream =
        response.ok && contentType.includes(SCAN_STREAM_CONTENT_TYPE) && response.body != null;

      if (!isStream) {
        // Pre-stream errors (non-200 JSON) + json-path safety net.
        const body = (await response.json()) as ScanResultBody | { ok: false; code: string };
        applyResultBody(body);
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sawResult = false;
      outer: for (;;) {
        const { value, done } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: true });
        let nl = buffer.indexOf("\n");
        while (nl >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (line && dispatchLine(line)) {
            sawResult = true;
            break outer;
          }
          nl = buffer.indexOf("\n");
        }
        if (done) break;
      }
      if (!sawResult) {
        const tail = buffer.trim();
        if (tail && dispatchLine(tail)) sawResult = true;
      }
      if (!sawResult) {
        setState({ kind: "error", copy: GENERIC_DRIVE_ERROR, code: null });
      }
    } catch {
      setState({ kind: "error", copy: GENERIC_DRIVE_ERROR, code: null });
    }
  }

  const submitDisabled = isSubmitting || folderUrl.trim().length === 0;
  // Resume affordance: only while idle (the moment the operator lands back on
  // Step 2 with a reviewable prior scan). "Continue to Step 3" is the primary
  // action, so the co-located re-scan button steps down to SECONDARY_BUTTON
  // (one accent CTA per card, per DESIGN.md's ≤10% accent cap).
  const showResume = state.kind === "idle" && priorScan != null;
  // The "you already scanned X" confirmation + the "Re-scan" label apply only
  // while the field STILL holds the folder that was scanned. Clear or change the
  // link and both fall away (it becomes a fresh "Verify and scan"); retype the
  // exact same link and they return. Continue-to-Step-3 is independent — the
  // already-scanned review exists regardless of what is typed.
  const matchesScanned =
    showResume && priorScan?.folderUrl != null && folderUrl.trim() === priorScan.folderUrl.trim();
  const submitLabel = isSubmitting ? "Verifying…" : matchesScanned ? "Re-scan" : "Verify and scan";
  // The single accent (DESIGN.md ≤10% cap) follows intent. Default: Continue to
  // Step 3 (forward) is primary and the re-scan button is secondary. But once
  // the operator types a NEW folder to scan, the scan button takes the accent so
  // the loudest control performs the apparent action; Continue steps down (it
  // still navigates to the already-scanned review). A cleared/empty field keeps
  // Continue primary — it is the only enabled action.
  const scanningNewFolder = showResume && !matchesScanned && folderUrl.trim().length > 0;
  const submitIsPrimary = !showResume || scanningNewFolder;
  const progress = state.kind === "submitting" ? state.progress : null;
  const heading =
    progress?.phase === "finishing" ? "Finishing up…" : "Looking through your folder…";
  const reading = progress?.phase === "reading" ? progress : null;

  return (
    <section
      data-testid="wizard-step2"
      aria-labelledby="wizard-step2-heading"
      className="flex flex-col gap-section-gap"
    >
      <header className="flex flex-col gap-2">
        <p
          data-testid="wizard-step2-eyebrow"
          className="text-xs font-medium uppercase text-text-subtle"
          style={{ letterSpacing: "var(--tracking-eyebrow)" }}
        >
          Step 2 of 3
        </p>
        <div className="flex items-center gap-2">
          <h2 id="wizard-step2-heading" className="text-2xl font-semibold text-text-strong">
            Verify your folder
          </h2>
          <HelpTooltip
            label="Help: Verify your folder"
            testId="help-affordance--wizard-step2--tooltip"
          >
            <p>
              Paste the URL of the Drive folder you shared in step 1. We read every Google Sheet
              inside that folder, then walk you through any that need a closer look in step 3.
            </p>
            <p className="mt-2">
              <a
                href="/help/admin/onboarding-wizard#step-2"
                aria-label="Learn more about verifying your folder"
                className="inline-flex min-h-tap-min items-center text-accent-on-bg underline underline-offset-2 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
              >
                Learn more →
              </a>
            </p>
          </HelpTooltip>
        </div>
        <p className="max-w-prose text-base text-text-subtle">
          Paste the link to the folder you just shared. We will read what is inside and bring it in
          for review.
        </p>
      </header>

      {/* One card: Folder link input, a "you already scanned X" confirmation
          below it (only while the field still holds the scanned folder), then a
          row with the re-scan button (left) and, in resume mode, Continue to
          Step 3 (right, the accent CTA). */}
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad"
      >
        <label htmlFor="wizard-step2-folder-url" className="text-sm font-semibold text-text-strong">
          Folder link
        </label>
        <input
          id="wizard-step2-folder-url"
          data-testid="wizard-step2-folder-url-input"
          type="url"
          value={folderUrl}
          onChange={(e) => setFolderUrl(e.target.value)}
          placeholder="Paste your Drive folder URL"
          autoComplete="off"
          spellCheck={false}
          disabled={isSubmitting}
          aria-describedby={matchesScanned ? "wizard-step2-scanned-note" : undefined}
          className="min-h-tap-min rounded-sm border border-border-strong bg-bg px-3 text-base text-text disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        />

        {matchesScanned && priorScan ? (
          <p
            id="wizard-step2-scanned-note"
            data-testid="wizard-step2-resume"
            role="status"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-text-subtle"
          >
            <Check aria-hidden="true" className="size-4 shrink-0 text-text-subtle" />
            {priorScan.folderName
              ? `You already scanned ${priorScan.folderName}.`
              : "You already scanned this folder."}
          </p>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="submit"
            data-testid="wizard-step2-submit"
            disabled={submitDisabled}
            className={submitIsPrimary ? PRIMARY_BUTTON : SECONDARY_BUTTON}
          >
            {submitLabel}
          </button>
          {showResume ? (
            <Link
              href="/admin?step=3"
              data-testid="wizard-step2-resume-advance"
              className={submitIsPrimary ? SECONDARY_BUTTON : PRIMARY_BUTTON}
            >
              Continue to Step 3
            </Link>
          ) : null}
        </div>
      </form>

      {state.kind === "submitting" && progress ? (
        <div
          data-testid="wizard-step2-progress"
          className="flex flex-col gap-2 rounded-md border border-border bg-surface-sunken p-tile-pad text-sm text-text"
        >
          <p className="text-base font-semibold text-text-strong" aria-hidden="true">
            {heading}
          </p>
          <p className="break-all text-text-subtle" aria-hidden="true">
            {state.folderUrl}
          </p>
          <progress
            data-testid="wizard-step2-progressbar"
            className="h-2 w-full"
            max={reading ? reading.total : undefined}
            value={reading ? reading.done : undefined}
            aria-label="Folder scan progress"
            aria-valuemin={0}
            aria-valuemax={reading ? reading.total : undefined}
            aria-valuenow={reading ? reading.done : undefined}
          />
          {reading ? (
            <p
              className="tabular-nums text-text-subtle"
              data-testid="wizard-step2-count"
              aria-hidden="true"
            >
              {reading.done} of {reading.total} sheet{reading.total === 1 ? "" : "s"}
            </p>
          ) : null}
          {reading && reading.lastName ? (
            <p
              className="truncate text-text"
              data-testid="wizard-step2-lastname"
              title={reading.lastName}
              aria-hidden="true"
            >
              <span className="text-text-subtle">Just read: </span>
              {reading.lastName}
            </p>
          ) : null}
          <p
            className="tabular-nums text-text-subtle"
            data-testid="wizard-step2-elapsed"
            aria-hidden="true"
          >
            {elapsedSeconds} second{elapsedSeconds === 1 ? "" : "s"} elapsed
          </p>
          {/* Screen-reader announcer: phase changes only, not every tick. */}
          <span className="sr-only" role="status" aria-live="polite">
            {heading}
          </span>
        </div>
      ) : null}

      {state.kind === "success" ? (
        <div
          data-testid="wizard-step2-success"
          className="flex flex-col gap-3 rounded-md border border-border bg-surface p-tile-pad"
        >
          <p className="text-base font-semibold text-text-strong">
            {state.result.folderName
              ? `Found ${formatTotals(state.result.totals)} items in ${state.result.folderName}.`
              : `Found ${formatTotals(state.result.totals)} items in your folder.`}
          </p>
          <ul className="flex flex-col gap-1 text-sm text-text-subtle">
            <li>
              Sheets ready for review:{" "}
              <span className="font-semibold tabular-nums text-text">
                {state.result.totals.staged}
              </span>
            </li>
            <li>
              Sheets we could not parse:{" "}
              <span className="font-semibold tabular-nums text-text">
                {state.result.totals.hard_failed}
              </span>
            </li>
            <li>
              Non-sheet files we skipped:{" "}
              <span className="font-semibold tabular-nums text-text">
                {state.result.totals.skipped_non_sheet}
              </span>
            </li>
            {state.result.totals.live_row_conflict !== undefined &&
            state.result.totals.live_row_conflict > 0 ? (
              <li>
                Live-row conflicts:{" "}
                <span className="font-semibold tabular-nums text-text">
                  {state.result.totals.live_row_conflict}
                </span>
              </li>
            ) : null}
          </ul>
          <Link
            href="/admin?step=3"
            data-testid="wizard-step2-advance"
            className="inline-flex min-h-tap-min items-center justify-center self-start rounded-sm bg-accent px-6 text-base font-semibold text-accent-text shadow-(--shadow-tile) transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            Continue to Step 3
          </Link>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div
          role="alert"
          data-testid="wizard-step2-error"
          className="flex flex-col gap-2 rounded-md border border-border bg-warning-bg p-tile-pad text-base text-warning-text"
        >
          <p className="font-semibold">We could not verify that folder.</p>
          <p>{state.copy}</p>
          <HelpAffordance code={state.code} />
        </div>
      ) : null}
    </section>
  );
}
