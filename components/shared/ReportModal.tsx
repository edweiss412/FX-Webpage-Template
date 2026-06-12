"use client";
/**
 * components/shared/ReportModal.tsx — M8 Task 8.4 (§B).
 *
 * The idempotency-key lifecycle owner. ONE key per attempt, reused
 * across every retry / cancel / draft edit / tab refresh, rotated ONLY
 * on terminal success (HTTP 2xx + `body.ok === true`) OR explicit
 * "Start a new report anyway" opt-in (per plan
 * `08-bug-report.md:1288-1353`).
 *
 * Server contract pinned at handoff §0 SHA `1d55cb5`:
 *   POST /api/report
 *     Body: { idempotency_key, show_id, message, surface, ...autocapture }
 *     Success: { ok: true, status: 'created' | 'duplicate' | 'recovered',
 *                github_issue_url? }   // admin-only field
 *     Error:   { ok: false, code? }
 *
 * Topology:
 *   - <640px (mobile): bottom sheet, rises via translateY (NO layout
 *     animation, per DESIGN.md §5.4 ban on animating layout properties).
 *   - >=640px (desktop): centered dialog.
 *
 * Persistence: `sessionStorage[fxav-report-attempt-${surfaceId}]` holds
 *   { idempotencyKey, draft, status, surfaceId }. Cleared ONLY by
 *   terminal success (2xx + body.ok===true) OR explicit Start-fresh.
 *
 * Focus management via `lib/a11y/dialogFocus.ts` (M7-shipped).
 *
 * Pin-stop caveat #2: REPORT_LOOKUP_INCONCLUSIVE copy stays neutral —
 *   the catalog string already reads as "outcome unknown — retry
 *   safely," NOT "lookup failed."
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { useDialogFocus } from "@/lib/a11y/dialogFocus";
import { isMessageCode, messageFor, type MessageCode } from "@/lib/messages/lookup";
import { HelpAffordance } from "@/components/admin/HelpAffordance";

export type ReportSurface = "crew" | "admin";

export type ReportAutocapture = {
  crewPreview?: unknown;
  fieldRef?: unknown;
  parseWarnings?: unknown[];
  rawSnippet?: string;
  viewerVisibleSection?: string;
  userAgent?: string;
  lastSyncTimestamp?: string;
  staleTier?: string;
  rightNowState?: unknown;
  reporter_role?: string;
};

export type ReportModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  surface: ReportSurface;
  /** Stable per-button-instance id; the sessionStorage scope. */
  surfaceId: string;
  showId: string;
  autocapture?: ReportAutocapture;
  /**
   * Network timeout in milliseconds for POST /api/report. The default
   * (30s) covers normal GitHub-create latency (~1-15s per Pin-stop
   * caveat) with headroom for venue Wi-Fi jitter; an aborted request
   * surfaces as failed-retryable so a stalled connection cannot leave
   * the modal stuck in `submitting` indefinitely. Test-overridable so
   * test suites can exercise the timeout path without real wall-clock
   * waits.
   */
  submitTimeoutMs?: number;
};

type ModalStatus =
  | "composing"
  | "submitting"
  | "failed-retryable"
  | "succeeded"
  | "expired"
  | "new-report-warning";

type PersistedState = {
  idempotencyKey: string;
  draft: string;
  status: ModalStatus;
  surfaceId: string;
  /**
   * Last cataloged failure code, persisted on every failed-retryable
   * transition so a cross-mount resume can rehydrate the §9.0.1
   * "What does this mean?" affordance (Codex R4 disposition). When the
   * persisted shape predates this field (legacy entries), the resume
   * mount renders the failed-retryable banner without the explainer —
   * acceptable graceful degradation rather than crash.
   */
  errorCode?: string | null;
};

type ErrorState =
  | { kind: "code"; code: MessageCode }
  | { kind: "network" }
  | null;

type SuccessState = { kind: "succeeded"; github_issue_url?: string } | null;

const STORAGE_PREFIX = "fxav-report-attempt-";

function storageKeyFor(surfaceId: string) {
  return `${STORAGE_PREFIX}${surfaceId}`;
}

function readPersisted(surfaceId: string): PersistedState | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(storageKeyFor(surfaceId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PersistedState;
    if (parsed && parsed.surfaceId === surfaceId && typeof parsed.idempotencyKey === "string") {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function writePersisted(state: PersistedState) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(storageKeyFor(state.surfaceId), JSON.stringify(state));
}

function clearPersisted(surfaceId: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(storageKeyFor(surfaceId));
}

function isKnownCode(code: unknown): code is MessageCode {
  // Catalog MEMBERSHIP, not messageFor() truthiness: messageFor() now
  // returns an all-null fallback entry for unknown codes (lookup.ts), so
  // its result is truthy for ANY string — an unknown /api/report code
  // would pass, get persisted as if cataloged, and render a BLANK retry
  // alert (null copy on both surfaces). isMessageCode is the shared
  // hasOwnProperty guard from lib/messages/lookup.ts.
  return typeof code === "string" && isMessageCode(code);
}

function copyForCode(code: MessageCode, surface: ReportSurface): string | null {
  const entry = messageFor(code);
  return surface === "admin" ? entry.dougFacing : entry.crewFacing;
}

// Network-failure rendering routes through the §12.4 catalog as
// `NETWORK_UNREACHABLE` — the client-side-fetch-failed case where the
// POST never reaches the server (TypeError on fetch, offline, DNS,
// captive portal, CORS-blocked, extension-intercepted). The
// spec-amendment session that added the row closed M5-D8 for this site.
// Lookups happen inline at the call sites below via copyForCode so Doug
// gets the operator-flavored "no admin trail" framing and crew gets the
// bare recovery prompt; no module-level const so the catalog stays the
// single source of truth.

export function ReportModal(props: ReportModalProps) {
  const {
    open,
    onOpenChange,
    surface,
    surfaceId,
    showId,
    autocapture,
    submitTimeoutMs = 30_000,
  } = props;

  // Hydrate from sessionStorage on mount. The initial state of each
  // hook is computed lazily so SSR + first-paint stay stable; subsequent
  // open/close cycles re-hydrate via useEffect (below) so multiple opens
  // within one page render still pick up persisted state.
  const persistedAtMount = useMemo(() => readPersisted(surfaceId), [surfaceId]);

  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => {
    if (persistedAtMount?.idempotencyKey) return persistedAtMount.idempotencyKey;
    return mintUuid();
  });

  const [draft, setDraft] = useState<string>(() => persistedAtMount?.draft ?? "");

  const [status, setStatus] = useState<ModalStatus>(() => {
    // Resume banner is shown when the persisted status was nonterminal
    // AND not bare "composing" (a partial-typed-but-never-submitted draft
    // hydrates the textarea silently — no resume banner).
    const persisted = persistedAtMount?.status;
    if (persisted === "failed-retryable" || persisted === "submitting") {
      return "failed-retryable";
    }
    return "composing";
  });

  const [error, setError] = useState<ErrorState>(() => {
    // Cross-mount resume rehydration: when sessionStorage carried us
    // into a 'failed-retryable' shape AND the last failure was a
    // cataloged code, rehydrate the ErrorState so the §9.0.1
    // HelpAffordance renders on the resumed mount the same way it
    // does on the original failure. Unknown codes (legacy or string
    // that no longer matches MessageCode) fall through to no explainer
    // rather than crashing — graceful degradation.
    if (
      persistedAtMount?.status === "failed-retryable" &&
      typeof persistedAtMount.errorCode === "string" &&
      isMessageCode(persistedAtMount.errorCode)
    ) {
      return { kind: "code", code: persistedAtMount.errorCode };
    }
    return null;
  });
  const [success, setSuccess] = useState<SuccessState>(null);

  // Distinguishes cross-mount resume (modal opens into hydrated nonterminal
  // persisted state) from in-mount retry (user just got a 502 in this mount).
  // The resume mount renders a Submit (with "Resume submission" label +
  // data-resume="true") plus the resume banner; the in-mount retry renders a
  // dedicated Retry button with no banner. Both reuse the same persisted key.
  // Cleared on terminal success OR explicit Start-fresh confirm.
  const [mountedFromResume, setMountedFromResume] = useState<boolean>(
    () => status === "failed-retryable",
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  useDialogFocus(containerRef);

  // Persist on every state change. The `surfaceId !== persisted.surfaceId`
  // mismatch is impossible by construction (we key by surfaceId); the
  // guard is defense-in-depth against future refactor.
  useEffect(() => {
    // Don't persist terminal states — they're cleared on transition.
    if (status === "succeeded" || status === "expired") return;
    const errorCode = error?.kind === "code" ? error.code : null;
    writePersisted({ idempotencyKey, draft, status, surfaceId, errorCode });
  }, [idempotencyKey, draft, status, surfaceId, error]);

  // Cross-mount sessionStorage hydration is handled by the `useState` lazy
  // initializers above (which run on every fresh mount). Parents render
  // this component conditionally (`{open ? <ReportModal /> : null}`) so
  // every reopen IS a fresh mount and the lazy initializers pick up the
  // persisted state. There is no second sync-state-from-effect — the
  // lazy initializer is the single hydration path. This avoids the
  // react-hooks/set-state-in-effect anti-pattern.

  if (!open) return null;

  function handleDraftChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setDraft(event.target.value);
    // Editing after a failed attempt clears the error chrome but keeps
    // the resume offer + key.
    if (status === "failed-retryable") {
      setError(null);
    }
  }

  // Cmd/Ctrl+Enter from inside the textarea submits the form (matches
  // the GitHub / Slack / Linear convention for compose surfaces, and
  // saves Doug a mouse trip when filing admin reports). Plain Enter
  // inserts a newline (default textarea behavior) so multi-line drafts
  // still work.
  function handleTextareaKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (draft.trim().length === 0 || status === "submitting") return;
      void submitOnce();
    }
  }

  async function submitOnce(): Promise<void> {
    setStatus("submitting");
    setError(null);
    setSuccess(null);
    const body = {
      idempotency_key: idempotencyKey,
      show_id: showId,
      message: draft,
      surface,
      ...(autocapture ?? {}),
      // M8 R1 H2: client-only autocapture fields the server-side page
      // can't pre-bake. userAgent is always present in a browser context;
      // autocapture.userAgent (if explicitly set by caller) wins via the
      // spread order — this fallback only fires when the caller omits it.
      ...(typeof navigator !== "undefined" && !autocapture?.userAgent
        ? { userAgent: navigator.userAgent }
        : {}),
    };
    // 30s default timeout (configurable via submitTimeoutMs prop) — a
    // hung connection cannot leave the modal stuck in `submitting`.
    // AbortController + setTimeout is the canonical pattern; the abort
    // surfaces as a TypeError on fetch which we route to the generic
    // network-error copy.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), submitTimeoutMs);
    try {
      const response = await fetch("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      let parsed: { ok?: boolean; code?: string; status?: string; github_issue_url?: string } = {};
      try {
        parsed = (await response.json()) as typeof parsed;
      } catch {
        parsed = {};
      }

      const isTerminalSuccess =
        response.status >= 200 && response.status < 300 && parsed.ok === true;

      if (isTerminalSuccess) {
        setStatus("succeeded");
        setSuccess({
          kind: "succeeded",
          ...(surface === "admin" && parsed.github_issue_url
            ? { github_issue_url: parsed.github_issue_url }
            : {}),
        });
        clearPersisted(surfaceId);
        setMountedFromResume(false);
        return;
      }

      // Horizon-expired is terminal (NOT retryable) — clear sessionStorage
      // and surface the dedicated expired state.
      if (response.status === 410 && parsed.code === "REPORT_HORIZON_EXPIRED") {
        setStatus("expired");
        setError({ kind: "code", code: "REPORT_HORIZON_EXPIRED" });
        clearPersisted(surfaceId);
        setMountedFromResume(false);
        return;
      }

      // Every other non-2xx → failed-retryable. We do NOT set
      // mountedFromResume here — in-mount failures render the Retry button
      // directly without the resume banner. The banner+Submit-resume shape
      // is reserved for the cross-mount hydration case (user closed the
      // modal after a failure and reopened it).
      setStatus("failed-retryable");
      if (parsed.code && isKnownCode(parsed.code)) {
        setError({ kind: "code", code: parsed.code });
      } else {
        setError({ kind: "network" });
      }
    } catch {
      clearTimeout(timeoutId);
      setStatus("failed-retryable");
      setError({ kind: "network" });
    }
  }

  function handleSubmit() {
    if (draft.trim().length === 0) return;
    void submitOnce();
  }

  function handleRetry() {
    void submitOnce();
  }

  function handleClose() {
    onOpenChange(false);
  }

  function handleStartFresh() {
    setStatus("new-report-warning");
  }

  function handleStartFreshConfirm() {
    // Rotate the key, clear the draft, clear sessionStorage. The new
    // attempt is brand-new from the server's perspective.
    clearPersisted(surfaceId);
    const fresh = mintUuid();
    setIdempotencyKey(fresh);
    setDraft("");
    setError(null);
    setSuccess(null);
    setStatus("composing");
    setMountedFromResume(false);
    // Pre-seed the persisted row so a refresh right after Start-fresh
    // confirm doesn't accidentally re-hydrate the old key.
    writePersisted({
      idempotencyKey: fresh,
      draft: "",
      status: "composing",
      surfaceId,
      errorCode: null,
    });
  }

  function handleStartFreshCancel() {
    setStatus("failed-retryable");
  }

  const submitDisabled = draft.trim().length === 0 || status === "submitting";
  const showResumeBanner = mountedFromResume && status === "failed-retryable";
  const showStartFreshWarning = status === "new-report-warning";

  const heading = surface === "crew" ? "Something looks wrong?" : "Report this";
  const placeholder = "What's off? Be as brief as you like.";
  // Surface-specific subhead. Crew copy is verbatim from spec §13.1
  // (line 2982): the modal must explicitly tell the crew member that
  // reports go to the developer (not Doug) and that show-content
  // questions belong in a direct message to Doug. This is the
  // channel-boundary contract — without it the bug-report flow drifts
  // into a PM/content-escalation path the spec is preventing. The
  // earlier "Doug will see your report" wording (impeccable §12 C2
  // disposition) inverted the contract; corrected at R2 M2.
  const subhead =
    surface === "crew"
      ? "This goes to the developer, not Doug. For show-content questions, message Doug directly."
      : "This files a GitHub issue for Eric to triage.";
  const submitLabel = showResumeBanner ? "Resume submission" : "Submit";

  // POLISH-D1/D3: errorCopy is always a string (possibly empty) when error
  // is set. Null in the catalog (e.g., a code with null facing-for-surface)
  // falls back to the opposite surface's facing — preserves catalog routing
  // discipline (no inline literals) and avoids silently substituting
  // NETWORK_UNREACHABLE copy for a server-emitted §A code. Final "" guard is
  // unreachable today (catalog test pins crewFacing non-null on every code
  // with a producer; surface-flipped lookup covers admin-null cases) but
  // keeps the type as string for the render site.
  const errorCopy: string = (() => {
    if (!error) return "";
    if (error.kind === "network") {
      return copyForCode("NETWORK_UNREACHABLE", surface) ?? "";
    }
    const oppositeSurface: ReportSurface = surface === "admin" ? "crew" : "admin";
    return (
      copyForCode(error.code, surface) ??
      copyForCode(error.code, oppositeSurface) ??
      ""
    );
  })();

  return (
    <div
      data-testid="report-modal-root"
      data-state={status}
      // role + aria-modal on the container; backdrop sits behind.
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-heading"
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
    >
      {/* Backdrop. Tap-outside-to-close preserves the key (handleClose). */}
      <button
        type="button"
        data-testid="report-modal-backdrop"
        aria-label="Close"
        tabIndex={-1}
        onClick={handleClose}
        className="absolute inset-0 bg-text-strong/40 motion-safe:transition-opacity motion-safe:duration-fast"
      />

      <div
        ref={containerRef}
        className="relative w-full max-w-[480px] rounded-t-md bg-surface text-text shadow-tile sm:rounded-md motion-safe:animate-[sheet-rise_220ms_cubic-bezier(0.25,1,0.5,1)] motion-reduce:animate-none"
      >
        {/*
          Mobile drag-handle. Visual affordance ONLY — pull-to-dismiss
          is intentionally NOT wired (handoff §0 OQ3 decision). The
          handle communicates "this is a sheet" without promising drag
          functionality. No `cursor-grab` styling for the same reason —
          would imply behavior that doesn't exist. Close happens via the
          X button OR backdrop tap-out.
        */}
        <div
          aria-hidden="true"
          className="mx-auto mt-2 h-1 w-10 rounded-pill bg-border sm:hidden"
        />

        <div className="flex items-start justify-between gap-4 px-4 pb-2 pt-4 sm:px-6 sm:pt-5">
          <div className="min-w-0 flex-1">
            <h2
              id="report-modal-heading"
              className="text-lg font-semibold text-text-strong"
            >
              {heading}
            </h2>
            <p className="mt-1 text-sm text-text-subtle">{subhead}</p>
          </div>
          <button
            type="button"
            data-testid="report-modal-close"
            aria-label="Close"
            onClick={handleClose}
            className="-mr-2 inline-flex size-tap-min  items-center justify-center rounded-sm text-text-subtle transition-colors duration-fast hover:bg-surface-sunken hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <span aria-hidden="true" className="text-xl leading-none">×</span>
          </button>
        </div>

        {showResumeBanner ? (
          <div
            data-testid="report-modal-resume-banner"
            role="status"
            className="mx-4 mt-2 rounded-sm border border-border bg-surface-sunken px-3 py-2 text-sm text-text-subtle sm:mx-6"
          >
            <span>Your previous report attempt didn&apos;t complete. </span>
            <button
              type="button"
              data-testid="report-modal-start-fresh"
              onClick={handleStartFresh}
              className="font-medium text-accent-on-bg underline underline-offset-2 transition-colors duration-fast hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-sunken"
            >
              Start a new report anyway
            </button>
          </div>
        ) : null}

        {showStartFreshWarning ? (
          <div
            data-testid="report-modal-start-fresh-warning"
            role="alertdialog"
            aria-labelledby="report-modal-start-fresh-heading"
            className="mx-4 mt-2 rounded-sm border border-border-strong bg-warning-bg p-3  text-sm text-warning-text sm:mx-6"
          >
            <p id="report-modal-start-fresh-heading" className="font-medium">
              Your previous attempt may have already gone through. Starting fresh could create a duplicate.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="report-modal-start-fresh-cancel"
                onClick={handleStartFreshCancel}
                className="inline-flex min-h-tap-min items-center rounded-sm border border-border-strong bg-surface px-3 py-2 font-medium text-text transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="report-modal-start-fresh-confirm"
                onClick={handleStartFreshConfirm}
                className="inline-flex min-h-tap-min items-center rounded-sm bg-accent px-3 py-2 font-medium text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg"
              >
                Yes, start fresh
              </button>
            </div>
          </div>
        ) : null}

        {status === "succeeded" ? (
          <div
            data-testid="report-modal-success"
            role="status"
            aria-live="polite"
            className="px-4 py-6 text-center sm:px-6"
          >
            {/* Visual affirmation — a small accent-tinted check mark
                strengthens the "yes, we got it" moment without adding
                chrome. SVG inline so no icon-library dependency creeps
                in for one glyph. */}
            <svg
              data-testid="report-modal-success-icon"
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="mx-auto mb-3 size-8 text-accent-on-bg"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12.5l4.5 4.5L19 7" />
            </svg>
            <p className="text-base font-medium text-text-strong">Report submitted.</p>
            {surface === "admin" && success?.kind === "succeeded" && success.github_issue_url ? (
              <a
                data-testid="report-modal-success-link"
                href={success.github_issue_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex min-h-tap-min items-center rounded-sm bg-accent px-4 py-2 font-medium text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                View on GitHub
              </a>
            ) : (
              <p className="mt-2 text-sm text-text-subtle">
                Thanks, we&apos;ll take a look.
              </p>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="mt-4 inline-flex min-h-tap-min items-center rounded-sm border border-border px-3 py-2 text-sm font-medium text-text transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              Close
            </button>
          </div>
        ) : status === "expired" ? (
          <div
            data-testid="report-modal-expired"
            role="status"
            aria-live="polite"
            className="px-4 py-6 sm:px-6"
          >
            <p className="text-base font-medium text-text-strong">
              {errorCopy ?? "This report attempt has expired."}
            </p>
            {surface === "admin" && error && error.kind === "code" ? (
              <HelpAffordance code={error.code} />
            ) : null}
            <button
              type="button"
              onClick={handleStartFreshConfirm}
              className="mt-4 inline-flex min-h-tap-min items-center rounded-sm bg-accent px-4 py-2 font-medium text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              Start fresh
            </button>
          </div>
        ) : (
          <>
            <div className="px-4 pb-2 pt-3 sm:px-6">
              <label
                htmlFor="report-modal-textarea"
                className="sr-only"
              >
                Report details
              </label>
              <textarea
                id="report-modal-textarea"
                data-testid="report-modal-textarea"
                value={draft}
                onChange={handleDraftChange}
                onKeyDown={handleTextareaKeyDown}
                placeholder={placeholder}
                rows={6}
                readOnly={status === "submitting"}
                autoFocus
                className="block w-full resize-y rounded-sm border border-border bg-bg px-3 py-2 text-base text-text placeholder:text-text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-60"
                style={{ maxHeight: "40vh" }}
              />
              {error && status === "failed-retryable" ? (
                <div
                  data-testid="report-modal-error"
                  role="alert"
                  aria-live="polite"
                  className="mt-2 flex flex-col gap-1 text-sm text-warning-text"
                >
                  <p>{errorCopy}</p>
                  {surface === "admin" && error.kind === "code" ? (
                    <HelpAffordance code={error.code} />
                  ) : null}
                </div>
              ) : null}
              {status === "submitting" ? (
                <p
                  data-testid="report-modal-submitting"
                  role="status"
                  aria-live="polite"
                  className="mt-2 text-sm text-text-subtle"
                >
                  Sending…
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3 sm:px-6">
              {status === "failed-retryable" && !mountedFromResume ? (
                <button
                  type="button"
                  data-testid="report-modal-retry"
                  onClick={handleRetry}
                  disabled={submitDisabled}
                  className="inline-flex min-h-tap-min items-center rounded-sm bg-accent px-4 py-2 font-medium text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Retry
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="report-modal-submit"
                  data-resume={showResumeBanner ? "true" : undefined}
                  onClick={status === "failed-retryable" ? handleRetry : handleSubmit}
                  disabled={submitDisabled}
                  aria-busy={status === "submitting"}
                  className="inline-flex min-h-tap-min items-center rounded-sm bg-accent px-4 py-2 font-medium text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitLabel}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function mintUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback (should never run in modern browsers).
  return `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, "0")}`;
}
