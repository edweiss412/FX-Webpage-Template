"use client";

/**
 * components/admin/wizard/Step2Verify.tsx (M10 §B Task 10.3 / Phase 2)
 *
 * Wizard step 2 — "Verify your folder." Operator pastes a Google Drive
 * folder URL; the component POSTs to /api/admin/onboarding/scan (the
 * §A Pin-1 thick route that validates, mints/reuses the wizard session
 * id, purges prior-session rows, and runs runOnboardingScan).
 *
 * AC-10.2 paths render via messageFor() — never a raw §12.4 code
 * (AGENTS.md §1.5):
 *   - INVALID_FOLDER_URL (malformed URL)
 *   - FOLDER_NOT_SHARED (service account lacks read)
 *   - FOLDER_NOT_FOUND (folder missing/trashed)
 *   - OPERATOR_ERROR_NOT_FOLDER (URL points at a file not a folder)
 *   - OPERATOR_ERROR_INCOMPLETE_FOLDER_METADATA (transient)
 *   - WIZARD_ISOLATION_INDEXES_MISSING (schema rollback)
 *
 * Progress signal (M5-D2 carry-forward — no bare spinner):
 *   While the scan is in flight, display "Looking through your folder…"
 *   plus the folder URL and an elapsed-seconds counter. The scan is
 *   typically sub-minute; contextual elapsed time + the surface telling
 *   the operator what is happening beats an indefinite spinner. Streaming
 *   progress events from the route is intentionally out of Phase 2 scope
 *   (it would require a backend contract extension we have not pinned).
 *
 * Server-side scan response is the OnboardingScanResult discriminated
 * union from runOnboardingScan; outcomes:
 *   - "completed" → render scan summary (folder name + total items found)
 *     plus a "Continue to Step 3" advance link.
 *   - "schema_missing" → render WIZARD_ISOLATION_INDEXES_MISSING copy.
 *   - "superseded" → call router.refresh() so the Phase 2 dispatcher in
 *     app/admin/page.tsx re-reads the rotated session and lands the
 *     operator on the active wizard's surface. Per spec §12.4
 *     (line 2693) WIZARD_SESSION_SUPERSEDED_DURING_SCAN is admin-log-
 *     only and is NEVER rendered to Doug — the new session's UI
 *     implicitly reflects the supersession.
 * 4xx errors render the matching catalog dougFacing copy.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { messageFor } from "@/lib/messages/lookup";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { HelpTooltip } from "@/components/admin/HelpTooltip";
import type { MessageCode } from "@/lib/messages/catalog";
import type {
  OnboardingScanCompletedBody,
  OnboardingScanResponseBody,
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

// The success/outcome shapes are the canonical scan-response contract shared
// with the route (lib/onboarding/scanResponse.ts) — importing it here makes a
// server/client drift a compile error. The `{ ok: false }` error shape is the
// route's errorResponse() body, orthogonal to the outcome union.
type ScanCompleted = OnboardingScanCompletedBody;

type ScanResponseBody = OnboardingScanResponseBody | { ok: false; code: string };

// Spec §12.4 (line 2693): WIZARD_SESSION_SUPERSEDED_DURING_SCAN is
// admin-log-only — emitted to structured logs + sync_log but NEVER
// rendered to Doug. The plan (09-10-admin.md:1495) excludes it from
// Step2Verify's handled-codes list. We accept the code on the wire so
// the response-type union stays exhaustive against the §A scan-route
// contract, but we route the "superseded" outcome through
// router.refresh() rather than copyForCode(). Do NOT add this code to
// RECOGNIZED_CODES.

type FormState =
  | { kind: "idle" }
  | { kind: "submitting"; startedAt: number; folderUrl: string }
  | { kind: "success"; result: ScanCompleted }
  | { kind: "error"; copy: string; code: string | null };

function formatTotals(totals: OnboardingScanTotals): number {
  return (
    totals.staged + totals.hard_failed + totals.skipped_non_sheet + (totals.live_row_conflict ?? 0)
  );
}

function copyForCode(code: string): string {
  if (RECOGNIZED_CODES.has(code as MessageCode)) {
    const entry = messageFor(code as MessageCode);
    if (entry.dougFacing) return entry.dougFacing;
  }
  // Defensive fallback (no raw code).
  return "We could not verify that folder. Try the link again, or contact the developer if this keeps happening.";
}

export function Step2Verify() {
  const router = useRouter();
  const [folderUrl, setFolderUrl] = useState("");
  const [state, setState] = useState<FormState>({ kind: "idle" });
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (state.kind !== "submitting") {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // No setState here — the next submit's handleSubmit resets the
      // counter via setElapsedSeconds(0) before flipping state to
      // 'submitting'. Resetting synchronously inside the effect
      // triggers a cascading render that the linter flags.
      return;
    }
    intervalRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - state.startedAt) / 1000));
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [state]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = folderUrl.trim();
    if (!trimmed) return;
    setElapsedSeconds(0);
    setState({ kind: "submitting", startedAt: Date.now(), folderUrl: trimmed });
    try {
      const response = await fetch("/api/admin/onboarding/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderUrl: trimmed }),
      });
      const body = (await response.json()) as ScanResponseBody;
      if ("outcome" in body) {
        if (body.outcome === "completed") {
          setState({ kind: "success", result: body });
          return;
        }
        if (body.outcome === "superseded") {
          // Admin-log-only per spec §12.4:2693 — no Doug-facing copy.
          // Reset to idle and refresh so the Phase 2 dispatcher reads
          // the rotated wizard session and lands the operator on the
          // active wizard's surface.
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
      setState({
        kind: "error",
        copy: "We could not verify that folder. Try the link again, or contact the developer if this keeps happening.",
        code: null,
      });
    } catch {
      setState({
        kind: "error",
        copy: "We could not reach Drive just now. Check your connection and try again.",
        code: null,
      });
    }
  }

  const isSubmitting = state.kind === "submitting";
  const submitDisabled = isSubmitting || folderUrl.trim().length === 0;

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
          className="min-h-tap-min rounded-sm border border-border-strong bg-bg px-3 text-base text-text disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        />
        <button
          type="submit"
          data-testid="wizard-step2-submit"
          disabled={submitDisabled}
          className="inline-flex min-h-tap-min items-center justify-center self-start rounded-sm bg-accent px-6 text-base font-semibold text-accent-text shadow-(--shadow-tile) transition-colors duration-fast hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          {isSubmitting ? "Verifying…" : "Verify and scan"}
        </button>
      </form>

      {state.kind === "submitting" ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="wizard-step2-progress"
          className="flex flex-col gap-2 rounded-md border border-border bg-surface-sunken p-tile-pad text-sm text-text"
        >
          <p className="font-semibold text-text-strong">Looking through your folder…</p>
          <p className="break-all text-text-subtle">{state.folderUrl}</p>
          <p className="tabular-nums text-text-subtle" data-testid="wizard-step2-elapsed">
            {elapsedSeconds} second{elapsedSeconds === 1 ? "" : "s"} so far. We keep going until we
            have read every sheet. Large folders can take a minute.
          </p>
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
