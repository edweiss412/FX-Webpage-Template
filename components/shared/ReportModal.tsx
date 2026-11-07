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
 * Focus management via `lib/a11y/dialogFocus.ts` (M7-shipped). Escape closes
 * through the same `handleClose` as the close button and the backdrop, so a
 * draft and its key survive it exactly as they survive those. Focus goes back
 * to the control that opened the modal: inside a crew section sheet that is
 * the card's report trigger, so focus stays in the sheet (crew page redesign
 * spec §5.2, nested dialogs; the sheet ignores an Esc meant for this modal).
 *
 * Pin-stop caveat #2: REPORT_LOOKUP_INCONCLUSIVE copy stays neutral —
 *   the catalog string already reads as "outcome unknown — retry
 *   safely," NOT "lookup failed."
 */
import { useEffect, useMemo, useRef, useState } from "react";

import { useDialogFocus } from "@/lib/a11y/dialogFocus";
import { isMessageCode, messageFor, type MessageCode } from "@/lib/messages/lookup";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { NewTabHint } from "@/components/shared/NewTabHint";
import {
  deleteReport,
  enqueueReport,
  pageSlug,
  readPageIdentity,
  requeueReport,
  type HoldResult,
  type QueuedReport,
} from "@/lib/reports/offlineQueue";
import { reportSender } from "@/lib/reports/offlineSender";

/**
 * Accept-set rule (2026-08-09 spec §2.2): crew behavior iff
 * `surface === "crew"`; EVERY other surface (admin, help, any future
 * admin-authenticated surface) gets the admin arm. An equality comparison
 * against the admin literal in this file is a defect — it silently gives a new
 * surface the crew arm. The scan is textual and deliberately strict (a
 * commented-out comparison fails it too), so this note states the rule without
 * writing the pattern: tests/components/report/_metaSurfaceComparisons.test.ts.
 */
export type ReportSurface = "crew" | "admin" | "help";

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
  /** Null for non-show-scoped surfaces (help). */
  showId: string | null;
  autocapture?: ReportAutocapture;
  /**
   * When true, the freeform note is OPTIONAL — Submit is enabled with an empty
   * textarea. Use for surfaces whose autocapture IS the report content (e.g. a
   * data-quality warning report, where the warning code + rawSnippet + sourceCell
   * fully identify the issue). Default false: the note is required (crew/staged
   * reports, where the note is the only substantive content).
   */
  messageOptional?: boolean;
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
  /**
   * A report the server refused, opened for a resend or a discard. The modal
   * never POSTs it: Send again swaps it for a queued record under a fresh key
   * and runs the sender, so the key is on the phone before anything goes out and
   * two tabs cannot both send it. The surface's persisted draft is not touched.
   */
  failedReport?: QueuedReport;
};

type ModalStatus =
  | "composing"
  | "submitting"
  | "failed-retryable"
  | "succeeded"
  | "expired"
  | "queued"
  | "stale"
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
  /** The page's viewer key when this was written. Absent reads as null. */
  writer?: string | null;
  /** The attempt that owns this row. A remount rewrites it without one. */
  attemptId?: number | null;
};

type ErrorState = { kind: "code"; code: MessageCode } | { kind: "network" } | null;

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

/**
 * A row on the crew surface belongs to the person it was written for. The
 * surface scope outlives a name switch and the key may already hold a
 * reservation in that person's name, so another person's modal starts clean.
 */
function readOwnPersisted(
  surfaceId: string,
  surface: ReportSurface,
  writer: string | null,
): PersistedState | null {
  const row = readPersisted(surfaceId);
  if (row === null || surface !== "crew") return row;
  return (row.writer ?? null) === writer ? row : null;
}

/** A monotonic ordinal: an attempt id that can alias would be no proof of ownership. */
let lastAttemptId = 0;

type RunningHold = { attemptId: number; write: Promise<HoldResult> };

/**
 * The storage writes in progress, by surface and writer. The row stays in place
 * while one runs, and a modal that mounts for the same person takes that write's
 * result rather than opening a second draft of the same report.
 */
const runningHolds = new Map<string, RunningHold>();

function holdKey(surfaceId: string, writer: string): string {
  return `${surfaceId}\n${writer}`;
}

/** Starts holding `report`, or answers null when this attempt no longer owns its row. */
function startHold(report: QueuedReport, attemptId: number): Promise<HoldResult> | null {
  const { surfaceId, writer } = report;
  if (writer === null || readPersisted(surfaceId)?.attemptId !== attemptId) return null;
  const key = holdKey(surfaceId, writer);
  const running: RunningHold = {
    attemptId,
    write: enqueueReport(report).then((result) => {
      if (runningHolds.get(key) === running) runningHolds.delete(key);
      if (result === "held" && readPersisted(surfaceId)?.attemptId === attemptId) {
        clearPersisted(surfaceId);
      }
      return result;
    }),
  };
  runningHolds.set(key, running);
  return running.write;
}

/** A failed JSON parse is an answer from something. Anything else broke off or stalled. */
function isBodyLost(cause: unknown): boolean {
  return (cause as { name?: unknown } | null)?.name !== "SyntaxError";
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
  return surface === "crew" ? entry.crewFacing : entry.dougFacing;
}

const QUEUED_LEAD = "Saved on your phone.";
const QUEUED_REST = "It will send by itself when you have signal.";
const FAILED_LINE = "This report couldn't be sent. Send it again or discard it.";
const STALE_LINE = "This report was already sent or discarded in another tab.";

const HEADING: Record<ReportSurface, string> = {
  crew: "Something looks wrong?",
  admin: "Report this",
  // Matches the trigger label on /help/errors, so the dialog's accessible name
  // names the same act the button did (impeccable critique P1).
  help: "Report a recurring error",
};

function fieldRefHelpCode(fieldRef: unknown): string | null {
  if (!fieldRef || typeof fieldRef !== "object") return null;
  const value = (fieldRef as { helpCode?: unknown }).helpCode;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * What the help surface says it captured. Doug arrives here after hitting the
 * same error twice, and the capture is best-effort (2026-08-09 spec §4 limit
 * 3): a find-in-page arrival sets no fragment at all. Saying so is the
 * difference between a conservative outcome and a silent one, and the note is
 * the documented backstop. The captured code is rendered through the catalog
 * as its title, never as the raw code (invariant 5).
 */
function helpCaptureLine(fieldRef: unknown): string {
  const code = fieldRefHelpCode(fieldRef);
  if (!code) {
    return "No error code was captured from this page. Name it in your note so Eric can match it.";
  }
  if (isMessageCode(code)) {
    const title = messageFor(code).title;
    if (title) return `About ${title}. Eric gets that code with your note.`;
  }
  return "Eric gets the section you were reading, plus your note.";
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
    messageOptional = false,
    submitTimeoutMs = 30_000,
    failedReport,
  } = props;

  // Whose report this is, read once. A refresh can turn the page under an open
  // modal into another person's, and text typed for one person must not acquire
  // the other's key: this one goes out and the server refuses it.
  const [pageIdentity] = useState(readPageIdentity);
  const [slug] = useState(pageSlug);
  const writer = surface === "crew" ? pageIdentity.writer : null;

  // A storage write already running for this person, on this surface.
  const [joinedHold] = useState<RunningHold | null>(() =>
    writer === null ? null : (runningHolds.get(holdKey(surfaceId, writer)) ?? null),
  );

  // Hydrate from sessionStorage on mount. The initial state of each
  // hook is computed lazily so SSR + first-paint stay stable; subsequent
  // open/close cycles re-hydrate via useEffect (below) so multiple opens
  // within one page render still pick up persisted state.
  const persistedAtMount = useMemo(
    () => (failedReport ? null : readOwnPersisted(surfaceId, surface, writer)),
    [failedReport, surfaceId, surface, writer],
  );

  // The failed record in hand. A refusal of the resend replaces it.
  const [record, setRecord] = useState<QueuedReport | null>(failedReport ?? null);

  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => {
    if (persistedAtMount?.idempotencyKey) return persistedAtMount.idempotencyKey;
    return mintUuid();
  });

  const [draft, setDraft] = useState<string>(
    () => failedReport?.message ?? persistedAtMount?.draft ?? "",
  );

  const [status, setStatus] = useState<ModalStatus>(() => {
    if (joinedHold) return "submitting";
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

  // Focus back to the control that opened the modal. The focus hook restores
  // to what it saw focused on mount, which is the autofocused textarea (React
  // focuses it in the commit, before any effect runs); on close the textarea is
  // gone and focus falls to <body>. So the opener is read in the first render,
  // before that commit, and focused when the close left focus nowhere. Only
  // then: a development double-mount's cleanup runs with the textarea still
  // focused and leaves it be. Callers mount the modal on open.
  const [opener] = useState<HTMLElement | null>(() => {
    if (typeof document === "undefined") return null;
    const active = document.activeElement;
    return active instanceof HTMLElement && active !== document.body ? active : null;
  });
  useEffect(
    () => () => {
      const active = document.activeElement;
      if (opener?.isConnected && (active === null || active === document.body)) opener.focus();
    },
    [opener],
  );

  // The one close path: the close button, the backdrop and Escape. A close
  // keeps the draft and its key (the persisted attempt is untouched).
  function handleClose() {
    onOpenChange(false);
  }

  // Escape closes, wherever focus sits, through `handleClose`. Mirrored into a
  // ref so the listener, bound once per open, always runs the current one.
  const closeRef = useRef(handleClose);
  useEffect(() => {
    closeRef.current = handleClose;
  });
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeRef.current();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Persist on every state change. The `surfaceId !== persisted.surfaceId`
  // mismatch is impossible by construction (we key by surfaceId); the
  // guard is defense-in-depth against future refactor.
  // A submission outlives the component that started it: the parent may unmount
  // this modal (a keyed remount on /help/errors, an ordinary close) while the
  // POST is still in flight. The detached attempt must go INERT rather than
  // reach back into shared state — clearing sessionStorage from a component
  // nobody can see wipes the idempotency key out from under whatever mounted in
  // its place, and the next open mints a fresh key that files a second issue
  // for the same report. Leaving the persisted row alone keeps the ORIGINAL
  // key, so a resumed attempt lands on the server's idempotency path and
  // returns duplicate/recovered instead of creating a duplicate. Conservative
  // and visible (the resume banner), never silent.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // The attempt this modal runs. A remount starts with none, or with the one it
  // joined, so its first persist takes the row from any attempt it did not join.
  const attemptRef = useRef<number | null>(joinedHold?.attemptId ?? null);

  useEffect(() => {
    if (failedReport) return;
    // Don't persist terminal states — they're cleared on transition.
    if (status === "succeeded" || status === "expired" || status === "queued") return;
    const errorCode = error?.kind === "code" ? error.code : null;
    writePersisted({
      idempotencyKey,
      draft,
      status,
      surfaceId,
      errorCode,
      writer,
      attemptId: attemptRef.current,
    });
  }, [failedReport, idempotencyKey, draft, status, surfaceId, error, writer]);

  // Done replaces the control that had focus, so focus moves to it by hand.
  const doneRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (status === "queued" || status === "stale") doneRef.current?.focus();
  }, [status]);

  useEffect(() => {
    if (joinedHold) void showHoldResult(joinedHold.write);
  }, [joinedHold]);

  // Cross-mount sessionStorage hydration is handled by the `useState` lazy
  // initializers above (which run on every fresh mount). Parents render
  // this component conditionally (`{open ? <ReportModal /> : null}`) so
  // every reopen IS a fresh mount and the lazy initializers pick up the
  // persisted state. There is no second sync-state-from-effect — the
  // lazy initializer is the single hydration path. This avoids the
  // react-hooks/set-state-in-effect anti-pattern.

  /** What a storage write means for whichever modal is on screen when it settles. */
  async function showHoldResult(write: Promise<HoldResult>): Promise<void> {
    const result = await write;
    if (!mountedRef.current) return;
    if (result === "held") {
      setStatus("queued");
      setMountedFromResume(false);
      return;
    }
    setStatus("failed-retryable");
    setError({ kind: "network" });
  }

  if (!open) return null;

  const canSubmit = status !== "submitting" && status !== "queued" && status !== "stale";

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
      if ((!messageOptional && draft.trim().length === 0) || !canSubmit) return;
      void submitOnce();
    }
  }

  /** The report to hold if this attempt loses its signal, or null when it cannot be held. */
  function heldReportFor(writtenAt: string, context: Record<string, unknown>): QueuedReport | null {
    // A report no page can name an author for is never held: at send time it
    // would take the name of whoever happened to be signed in.
    if (surface !== "crew" || showId === null || writer === null) return null;
    return {
      id: idempotencyKey,
      showId,
      slug,
      surface,
      surfaceId,
      context,
      message: draft,
      writtenAt,
      pageRenderedAt: pageIdentity.pageRenderedAt,
      writer,
      status: "queued",
      errorCode: null,
    };
  }

  /** The end of an attempt that got no answer: held when it can be, the failure otherwise. */
  async function loseSignal(held: QueuedReport | null, attemptId: number): Promise<void> {
    const write = held === null ? null : startHold(held, attemptId);
    if (write !== null) {
      await showHoldResult(write);
      return;
    }
    if (!mountedRef.current) return;
    setStatus("failed-retryable");
    setError({ kind: "network" });
  }

  /** Send again: the new key goes on the phone first, and the sender does the rest. */
  async function resendFailed(current: QueuedReport): Promise<void> {
    setStatus("submitting");
    setError(null);
    const next: QueuedReport = {
      ...current,
      id: mintUuid(),
      message: draft,
      writer: writer ?? current.writer,
      status: "queued",
      errorCode: null,
    };
    const swapped = await requeueReport(current.id, next);
    if (swapped === "stale") {
      setStatus("stale");
      return;
    }
    if (swapped === "unavailable") {
      setStatus("failed-retryable");
      setError({ kind: "network" });
      return;
    }
    const outcome = await reportSender.settle(next.id);
    if (outcome.kind === "delivered") {
      setStatus("succeeded");
      setSuccess({ kind: "succeeded" });
    } else if (outcome.kind === "failed") {
      setRecord({ ...next, status: "failed", errorCode: outcome.code });
      setStatus("composing");
    } else {
      setStatus("queued");
    }
  }

  async function handleDiscard(): Promise<void> {
    if (record) await deleteReport(record.id);
    handleClose();
  }

  async function submitOnce(): Promise<void> {
    if (record) {
      await resendFailed(record);
      return;
    }
    // The tap, not the failure: a hung POST can take its whole timeout to give up.
    const writtenAt = new Date().toISOString();
    lastAttemptId += 1;
    const attemptId = lastAttemptId;
    attemptRef.current = attemptId;
    writePersisted({
      idempotencyKey,
      draft,
      status: "submitting",
      surfaceId,
      errorCode: null,
      writer,
      attemptId,
    });
    setStatus("submitting");
    setError(null);
    setSuccess(null);
    const context = {
      ...(autocapture ?? {}),
      // M8 R1 H2: client-only autocapture fields the server-side page
      // can't pre-bake. userAgent is always present in a browser context;
      // autocapture.userAgent (if explicitly set by caller) wins via the
      // spread order — this fallback only fires when the caller omits it.
      ...(typeof navigator !== "undefined" && !autocapture?.userAgent
        ? { userAgent: navigator.userAgent }
        : {}),
    };
    const held = heldReportFor(writtenAt, context);
    if (held !== null && navigator.onLine === false) {
      await loseSignal(held, attemptId);
      return;
    }
    const body = {
      idempotency_key: idempotencyKey,
      show_id: showId,
      message: draft,
      surface,
      ...context,
      // Checked on the request that reserves the key, not only on the sender's
      // later one, so a key can only be reserved under the name on the page.
      ...(writer === null ? {} : { writer }),
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
      // Detached mid-flight: leave every shared surface untouched. Checked
      // after EVERY await, not just the first: the response can arrive with its
      // body still streaming, so `response.json()` is a second suspension point
      // and an unmount inside it would otherwise reach the terminal branches
      // below (diff review R4 F1). An attempt that can be held reads the body
      // anyway, to learn whether it broke off.
      if (!mountedRef.current && held === null) {
        clearTimeout(timeoutId);
        return;
      }
      let parsed: { ok?: boolean; code?: string; status?: string; github_issue_url?: string } = {};
      let bodyLost = false;
      try {
        parsed = (await response.json()) as typeof parsed;
      } catch (cause) {
        parsed = {};
        bodyLost = isBodyLost(cause);
      }
      // Armed through the body: headers can arrive and the rest never does.
      clearTimeout(timeoutId);
      if (bodyLost) {
        await loseSignal(held, attemptId);
        return;
      }
      if (!mountedRef.current) return;

      const isTerminalSuccess =
        response.status >= 200 && response.status < 300 && parsed.ok === true;

      if (isTerminalSuccess) {
        setStatus("succeeded");
        setSuccess({
          kind: "succeeded",
          ...(surface !== "crew" && parsed.github_issue_url
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
      await loseSignal(held, attemptId);
    }
  }

  function handleSubmit() {
    if (!messageOptional && draft.trim().length === 0) return;
    void submitOnce();
  }

  function handleRetry() {
    void submitOnce();
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

  const submitDisabled = (!messageOptional && draft.trim().length === 0) || !canSubmit;
  const showResumeBanner = mountedFromResume && status === "failed-retryable";
  const showStartFreshWarning = status === "new-report-warning";

  const heading = HEADING[surface];
  // When the note is optional (messageOptional — data-quality reports, where the
  // autocapture IS the content), say so, so an empty-but-enabled Submit doesn't read
  // as a required-but-unfilled field (impeccable critique P3).
  const placeholder = messageOptional
    ? "Add a note if you like. We’ve already captured the details."
    : "What’s off? Be as brief as you like.";
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
      : surface === "help"
        ? helpCaptureLine(autocapture?.fieldRef)
        : "This files a GitHub issue for Eric to triage.";
  const submitLabel = record ? "Send again" : showResumeBanner ? "Resume submission" : "Submit";
  const failedCopy =
    record !== null && isKnownCode(record.errorCode)
      ? copyForCode(record.errorCode, surface)
      : null;

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
    const oppositeSurface: ReportSurface = surface === "crew" ? "admin" : "crew";
    return copyForCode(error.code, surface) ?? copyForCode(error.code, oppositeSurface) ?? "";
  })();

  return (
    <div
      data-testid="report-modal-root"
      data-state={status}
      // role + aria-modal on the container; backdrop sits behind.
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-heading"
      className="fixed inset-0 z-overlay flex items-end justify-center sm:items-center"
    >
      {/* THE MODAL'S ONE LIVE REGION (BL-ANNOUNCE-REGION-UNMOUNT-CLASS).
          Mounted for the modal's whole life so a status change is a MUTATION a
          screen reader announces. The status bodies below are whole-surface
          arms of a state machine — they are swapped in already populated, so a
          live region on any of them announces nothing — and two of them hold
          buttons and links, which must never sit inside a live region because a
          reader would voice the controls as part of the announcement. */}
      <p role="status" aria-live="polite" className="sr-only">
        {status === "submitting"
          ? "Sending your report."
          : status === "succeeded"
            ? "Report sent."
            : status === "expired"
              ? (errorCopy ?? "This report attempt has expired.")
              : status === "queued"
                ? `${QUEUED_LEAD} ${QUEUED_REST}`
                : status === "stale"
                  ? STALE_LINE
                  : ""}
      </p>

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
        className="relative w-full max-w-panel-max rounded-t-md bg-surface text-text shadow-tile sm:rounded-md motion-safe:animate-[sheet-rise_220ms_cubic-bezier(0.25,1,0.5,1)] motion-reduce:animate-none"
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
            <h2 id="report-modal-heading" className="text-lg font-semibold text-text-strong">
              {heading}
            </h2>
            <p className="mt-1 text-sm text-text-subtle">{subhead}</p>
          </div>
          <button
            type="button"
            data-testid="report-modal-close"
            aria-label="Close"
            onClick={handleClose}
            className="-mr-2 inline-flex size-tap-min  items-center justify-center rounded-sm text-text transition-colors duration-fast hover:bg-surface-sunken hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              ×
            </span>
          </button>
        </div>

        {showResumeBanner ? (
          <div
            data-testid="report-modal-resume-banner"
            className="mx-4 mt-2 rounded-sm border border-border bg-surface-sunken px-3 py-2 text-sm text-text-subtle sm:mx-6"
          >
            <span>Your previous report attempt didn&apos;t complete. </span>
            {/* tap-floor: inline-prose exemption, PRODUCT.md:59 — ratified 2026-08-10 */}
            <button
              type="button"
              data-testid="report-modal-start-fresh"
              onClick={handleStartFresh}
              className="font-medium text-accent-on-bg underline underline-offset-2 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-sunken"
            >
              Start a new report anyway
            </button>
          </div>
        ) : null}

        {record !== null && canSubmit ? (
          <div
            data-testid="report-modal-failed-notice"
            className="mx-4 mt-2 rounded-sm bg-warning-bg px-3 py-2 text-sm text-warning-text sm:mx-6"
          >
            <p className="font-medium">{FAILED_LINE}</p>
            {failedCopy ? <p className="mt-1">{failedCopy}</p> : null}
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
              Your previous attempt may have already gone through. Starting fresh could create a
              duplicate.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="report-modal-start-fresh-cancel"
                onClick={handleStartFreshCancel}
                className="inline-flex min-h-tap-min items-center rounded-sm border border-control-outline-tinted bg-surface px-3 py-2 font-medium text-text transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg"
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
          <div data-testid="report-modal-success" className="px-4 py-6 text-center sm:px-6">
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
            {surface !== "crew" && success?.kind === "succeeded" && success.github_issue_url ? (
              <a
                data-testid="report-modal-success-link"
                href={success.github_issue_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex min-h-tap-min items-center rounded-sm bg-accent px-4 py-2 font-medium text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                View on GitHub <NewTabHint />
              </a>
            ) : (
              <p className="mt-2 text-sm text-text-subtle">Thanks, we&apos;ll take a look.</p>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="mt-4 inline-flex min-h-tap-min items-center rounded-sm border border-text-faint px-3 py-2 text-sm font-medium text-text transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              Close
            </button>
          </div>
        ) : status === "expired" ? (
          <div data-testid="report-modal-expired" className="px-4 py-6 sm:px-6">
            <p className="text-base font-medium text-text-strong">
              {errorCopy ?? "This report attempt has expired."}
            </p>
            {surface !== "crew" && error && error.kind === "code" ? (
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
              <label htmlFor="report-modal-textarea" className="sr-only">
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
                readOnly={!canSubmit}
                autoFocus
                className="block w-full resize-y rounded-sm border border-text-faint bg-bg px-3 py-2 text-base text-text placeholder:text-text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:opacity-60"
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
                  {surface !== "crew" && error.kind === "code" ? (
                    <HelpAffordance code={error.code} />
                  ) : null}
                </div>
              ) : null}
              {status === "submitting" ? (
                <p data-testid="report-modal-submitting" className="mt-2 text-sm text-text-subtle">
                  Sending…
                </p>
              ) : null}
              {status === "queued" ? (
                <div
                  data-testid="report-modal-queued"
                  className="mt-2 flex items-start gap-2 rounded-sm bg-info-bg px-3 py-2 text-sm text-text-strong"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="mt-0.5 size-4 shrink-0"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                  <p>
                    <span className="font-semibold">{QUEUED_LEAD}</span> {QUEUED_REST}
                  </p>
                </div>
              ) : null}
              {status === "stale" ? (
                <p
                  data-testid="report-modal-stale"
                  className="mt-2 rounded-sm bg-info-bg px-3 py-2 text-sm text-text-strong"
                >
                  {STALE_LINE}
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3 sm:px-6">
              {record !== null && canSubmit ? (
                <button
                  type="button"
                  data-testid="report-modal-discard"
                  onClick={() => void handleDiscard()}
                  className="inline-flex min-h-tap-min items-center rounded-sm border border-text-faint px-3 py-2 text-sm font-medium text-text transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  Discard
                </button>
              ) : null}
              {status === "queued" || status === "stale" ? (
                <button
                  type="button"
                  ref={doneRef}
                  data-testid="report-modal-done"
                  onClick={handleClose}
                  className="inline-flex min-h-tap-min items-center rounded-sm bg-accent px-4 py-2 font-medium text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  {status === "stale" ? "Close" : "Done"}
                </button>
              ) : status === "failed-retryable" && !mountedFromResume ? (
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
