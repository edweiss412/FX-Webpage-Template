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
import { Check, ChevronLeft } from "lucide-react";
import { parseDriveFolderId } from "@/lib/drive/driveFolderUrl";
import { WizardFooter } from "@/components/admin/wizard/WizardFooter";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { messageFor } from "@/lib/messages/lookup";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { HelpSheet } from "@/components/admin/HelpSheet";
import { HoverHelp } from "@/components/admin/HoverHelp";
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
// pending_folder_id; `folderId` is that id, used to decide whether the typed
// link still refers to the scanned folder by IDENTITY (not URL string), so a
// re-pasted share link with `?usp=…` or a `/u/<n>/` prefix still matches.
export type Step2PriorScan = {
  folderName: string | null;
  folderUrl: string | null;
  folderId: string | null;
};

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

  const isSubmitting = state.kind === "submitting";

  // No elapsed-seconds timer (owner decision 2026-07-06): the live "N of N
  // sheets" + "Just read: …" readout already shows progress, and a genuine
  // silent hang can't persist — the scan route's `maxDuration = 300` platform
  // ceiling kills a hung function (closing the stream → the client's read loop
  // ends with `!sawResult` → error state), and per-asset `createStallGuard`
  // (30s idle) + deadline controllers abort a stalled Drive byte stream well
  // before that. So the timer added no hang-detection the infra doesn't cover.

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
  // while the field STILL refers to the folder that was scanned. Clear or change
  // the link and both fall away (it becomes a fresh "Verify and scan"); enter any
  // link to the same folder and they return. Match by folder IDENTITY (the parsed
  // id), NOT URL string — the prefill is the canonical `/folders/<id>` form, but
  // the operator may re-paste their original share link (`?usp=sharing`, a
  // `/u/<n>/` prefix, …) which is the same folder in a different string.
  // Continue-to-Step-3 is independent — the already-scanned review exists
  // regardless of what is typed.
  const matchesScanned =
    showResume &&
    priorScan?.folderId != null &&
    parseDriveFolderId(folderUrl) === priorScan.folderId;
  // A completed staged-0 scan relabels the persistent button "Re-scan" (§4.1);
  // the button re-submits the same folder URL. Accent/primary logic is unchanged.
  const submitLabel = isSubmitting
    ? "Verifying…"
    : state.kind === "success" && state.result.totals.staged === 0
      ? "Re-scan"
      : matchesScanned
        ? "Re-scan"
        : "Verify and scan";
  // The single accent (DESIGN.md ≤10% cap) follows intent. Default: Continue to
  // Step 3 (forward) is primary and the re-scan button is secondary. But once
  // the operator types a NEW folder to scan, the scan button takes the accent so
  // the loudest control performs the apparent action; Continue steps down (it
  // still navigates to the already-scanned review). A cleared/empty field keeps
  // Continue primary — it is the only enabled action.
  const scanningNewFolder = showResume && !matchesScanned && folderUrl.trim().length > 0;
  const submitIsPrimary = !showResume || scanningNewFolder;
  // Forward nav now lives in the shared full-width footer (WizardFooter), not
  // inline in the card. Continue → Step 3 is available once a review exists:
  // a fresh scan just succeeded, OR a prior scan is on file (resume). It steps
  // down to the secondary treatment while the operator is actively scanning a
  // NEW folder, so the loudest (accent) control stays the in-card Scan button —
  // the single-accent intent that used to govern the inline links (DESIGN.md
  // ≤10% accent). Disabled (no href, greyed) before any scan exists.
  const canContinue = state.kind === "success" || showResume;
  const continueIsPrimary = canContinue && !scanningNewFolder;
  const progress = state.kind === "submitting" ? state.progress : null;
  const heading =
    progress?.phase === "finishing" ? "Finishing up…" : "Looking through your folder…";
  const reading = progress?.phase === "reading" ? progress : null;
  // The scan result rides the footer center as a hover/tap summary once a scan
  // this session succeeds (a resume from a prior scan has no totals to show).
  // Staged-0 scans surface a first-class in-card block (empty-folder / nothing-
  // ready, §1.1) instead of the footer "Found N items" popover — so the popover
  // renders only when there is at least one sheet to review.
  const foundSummary =
    state.kind === "success" && state.result.totals.staged > 0 ? (
      <Step2FoundSummary result={state.result} />
    ) : undefined;

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
          <HelpSheet
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
          </HelpSheet>
        </div>
        <p className="max-w-prose text-base text-text-subtle">
          Paste the link to the folder you just shared. We will read what is inside and bring it in
          for review.
        </p>
      </header>

      {/* One card for every state: the Folder link input + optional "you already
          scanned X" confirmation on top, and a lower region that swaps between the
          action row, the in-flight progress readout, the completed-scan summary,
          and the failure alert. There is no detached second card below the form. */}
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

        {/* Lower region of the card — the single surface for every state. While a
            scan is in flight the live-progress readout renders IN PLACE of the
            button row; a completed scan shows its summary, and a failure shows an
            inset alert, each ABOVE the action row (consolidated: one card, never a
            detached second card below the form). */}
        {isSubmitting && progress ? (
          <div
            data-testid="wizard-step2-progress"
            className="mt-1 flex flex-col gap-2 border-t border-border pt-4 text-sm text-text"
          >
            {/* Heading + the "N of N sheets" count share ONE row ABOVE the bar,
                the count right-aligned (owner decision 2026-07-06). Baseline-
                aligned; the count is shrink-0 so a long heading never squeezes it. */}
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-base font-semibold text-text-strong" aria-hidden="true">
                {heading}
              </p>
              {reading ? (
                <p
                  className="shrink-0 tabular-nums text-sm text-text-subtle"
                  data-testid="wizard-step2-count"
                  aria-hidden="true"
                >
                  {reading.done} of {reading.total} sheet{reading.total === 1 ? "" : "s"}
                </p>
              ) : null}
            </div>
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
            {/* Screen-reader announcer: phase changes only, not every tick. */}
            <span className="sr-only" role="status" aria-live="polite">
              {heading}
            </span>
          </div>
        ) : (
          <>
            {/* The completed-scan result no longer renders here — it moved to the
                WizardFooter center as a hover/tap "Found N items" summary
                (2026-07-05). The card keeps only the folder input + retry button. */}
            {state.kind === "error" ? (
              <div
                role="alert"
                data-testid="wizard-step2-error"
                className="mt-1 flex flex-col gap-2 rounded-sm border border-border bg-warning-bg p-3 text-base text-warning-text"
              >
                <p className="font-semibold">We could not verify that folder.</p>
                <p>{state.copy}</p>
                <HelpAffordance code={state.code} />
              </div>
            ) : null}

            {/* Staged-0 status block (§1.1): a completed scan that staged nothing
                to review renders a first-class in-card block ABOVE the persistent
                action row (the footer "Found N items" popover is suppressed for
                this case). Empty folder vs "nothing ready" are both derivable
                from totals; the Re-scan action is the action-row button below. */}
            {state.kind === "success" && state.result.totals.staged === 0 ? (
              formatTotals(state.result.totals) === 0 ? (
                <div
                  data-testid="wizard-step2-empty"
                  className="mt-1 flex flex-col gap-2 rounded-sm border border-border bg-surface-sunken p-3 text-base text-text"
                >
                  <p className="font-semibold text-text-strong">This folder is empty.</p>
                  <p>Add a show sheet to the folder, then re-scan.</p>
                  {parseDriveFolderId(folderUrl) ? (
                    <a
                      href={folderUrl.trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-tap-min items-center self-start text-accent-on-bg underline underline-offset-2 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                    >
                      Open the folder →
                    </a>
                  ) : null}
                </div>
              ) : (
                <div
                  data-testid="wizard-step2-nothing-ready"
                  className="mt-1 flex flex-col gap-2 rounded-sm border border-border bg-surface-sunken p-3 text-base text-text"
                >
                  <p className="font-semibold text-text-strong">
                    We found {formatTotals(state.result.totals)}{" "}
                    {formatTotals(state.result.totals) === 1 ? "item" : "items"}, but none are ready
                    to review yet.
                  </p>
                  <ul className="flex flex-col gap-1 text-sm">
                    {state.result.totals.hard_failed > 0 ? (
                      <li>
                        Sheets we could not parse:{" "}
                        <span className="font-semibold tabular-nums text-text">
                          {state.result.totals.hard_failed}
                        </span>
                      </li>
                    ) : null}
                    {state.result.totals.skipped_non_sheet > 0 ? (
                      <li>
                        Non-sheet files we skipped:{" "}
                        <span className="font-semibold tabular-nums text-text">
                          {state.result.totals.skipped_non_sheet}
                        </span>
                      </li>
                    ) : null}
                    {state.result.totals.live_row_conflict > 0 ? (
                      <li>
                        Live-row conflicts:{" "}
                        <span className="font-semibold tabular-nums text-text">
                          {state.result.totals.live_row_conflict}
                        </span>
                      </li>
                    ) : null}
                  </ul>
                </div>
              )
            ) : null}

            {/* Action row: the in-card control is ONLY the Scan/Re-scan button.
                Forward nav (Continue → Step 3) moved to the shared full-width
                footer below. On a completed scan the Scan button steps down to
                secondary so the footer's Continue carries the single accent. */}
            <div className="flex flex-col gap-3">
              <button
                type="submit"
                data-testid="wizard-step2-submit"
                disabled={submitDisabled}
                className={
                  state.kind === "success"
                    ? SECONDARY_BUTTON
                    : submitIsPrimary
                      ? PRIMARY_BUTTON
                      : SECONDARY_BUTTON
                }
              >
                {submitLabel}
              </button>
            </div>
          </>
        )}
      </form>

      <WizardFooter
        center={foundSummary}
        back={
          <Link
            href="/admin?step=1"
            data-testid="wizard-step2-back"
            className="inline-flex min-h-tap-min items-center gap-1 rounded-sm px-2 text-sm font-medium text-text-subtle transition-colors duration-fast hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            Back
          </Link>
        }
        primary={
          canContinue ? (
            <Link
              href="/admin?step=3"
              data-testid="wizard-step2-advance"
              className={continueIsPrimary ? PRIMARY_BUTTON : SECONDARY_BUTTON}
            >
              Continue to Step 3
            </Link>
          ) : (
            <span
              data-testid="wizard-step2-advance"
              aria-disabled="true"
              className="pointer-events-none inline-flex min-h-tap-min cursor-not-allowed items-center justify-center self-start rounded-sm border border-border bg-surface-sunken px-6 text-base font-medium text-text-faint"
            >
              Continue to Step 3
            </span>
          )
        }
      />
    </section>
  );
}

// Footer-center scan-result summary (2026-07-05). "Found N items" reads at a
// glance; the per-bucket breakdown discloses on hover (mouse), tap (touch), or
// focus+Enter (keyboard) via <HoverHelp>, which is WCAG 1.4.13-compliant
// (dismissible with Escape, hoverable, reachable on every input). `placement="top"`
// opens the popover UPWARD so it isn't clipped by the viewport bottom the footer
// hugs. The dotted underline signals the text is interactive.
function Step2FoundSummary({ result }: { result: ScanCompleted }) {
  const total = formatTotals(result.totals);
  const t = result.totals;
  const noun = total === 1 ? "item" : "items";
  return (
    // not-a-help-affordance: this is the scan-result summary popover, not a help
    // "?" tooltip — it carries no help-affordance matrix testid.
    <HoverHelp
      label="Scan result breakdown"
      testId="wizard-step2-found"
      rootTestId="wizard-step2-success"
      placement="top"
      trigger={
        <span className="text-sm text-text-subtle underline decoration-dotted decoration-text-faint underline-offset-4">
          Found <b className="font-semibold tabular-nums text-text-strong">{total}</b> {noun}
          {result.folderName ? (
            <span className="hidden sm:inline"> in {result.folderName}</span>
          ) : null}
        </span>
      }
    >
      <p className="mb-2 font-semibold text-text-strong">
        Found {total} {noun}
        {result.folderName ? ` in ${result.folderName}` : ""}.
      </p>
      <ul className="flex flex-col gap-1">
        <li>
          Sheets ready for review:{" "}
          <span className="font-semibold tabular-nums text-text">{t.staged}</span>
        </li>
        <li>
          Sheets we could not parse:{" "}
          <span className="font-semibold tabular-nums text-text">{t.hard_failed}</span>
        </li>
        <li>
          Non-sheet files we skipped:{" "}
          <span className="font-semibold tabular-nums text-text">{t.skipped_non_sheet}</span>
        </li>
        {t.live_row_conflict !== undefined && t.live_row_conflict > 0 ? (
          <li>
            Live-row conflicts:{" "}
            <span className="font-semibold tabular-nums text-text">{t.live_row_conflict}</span>
          </li>
        ) : null}
      </ul>
    </HoverHelp>
  );
}
