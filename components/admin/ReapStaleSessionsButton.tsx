"use client";

/**
 * components/admin/ReapStaleSessionsButton.tsx (onboarding-fixups F4 Task 4.6)
 *
 * Admin maintenance affordance for the strictly session-scoped stale-debris
 * reap. Destructive-class action — confirmation step before POSTing to
 * /api/admin/onboarding/reap-stale-sessions (mirrors
 * CleanupAbandonedFinalizeButton's confirm → running → error state machine and
 * its catalog-driven error copy, invariant 5: never raw codes).
 *
 * Success renders a count summary derived from the response's sessions array;
 * skipped_unstable sessions are surfaced DISTINCTLY from successful reaps
 * (R29-2 — silently dropping them would let an operator believe the sweep
 * completed while debris remains).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { messageFor } from "@/lib/messages/lookup";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";
import { HelpAffordance } from "@/components/admin/HelpAffordance";

type ReapOutcome = "reaped_full" | "reaped_orphan_rows" | "skipped_unstable";

type ReapResponse =
  | { status: "reaped"; sessions: Array<{ wizardSessionId: string; outcome: ReapOutcome }> }
  | { ok: false; code: string };

type State =
  | { kind: "idle" }
  | { kind: "confirming" }
  | { kind: "running" }
  | { kind: "done"; cleaned: number; unstable: number }
  | { kind: "error"; copy: string; code: string | null };

function lookupDougFacing(code: string | undefined | null): string | null {
  if (!code) return null;
  if (!(code in MESSAGE_CATALOG)) return null;
  return messageFor(code as MessageCode).dougFacing ?? null;
}

// not-subject:M5-D8 — defensive fallback when catalog lookup returns null; all
// real error copy routes through messageFor(code).dougFacing first.
const GENERIC_ERROR =
  "We couldn't clean up the old setup leftovers. Refresh and try again, or contact the developer if this keeps happening.";

export function ReapStaleSessionsButton() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });

  async function confirmAndRun() {
    setState({ kind: "running" });
    try {
      const response = await fetch("/api/admin/onboarding/reap-stale-sessions", {
        method: "POST",
      });
      const body = (await response.json()) as ReapResponse;
      if ("ok" in body && body.ok === false) {
        setState({
          kind: "error",
          copy: lookupDougFacing(body.code) ?? GENERIC_ERROR,
          code: body.code,
        });
        router.refresh();
        return;
      }
      const sessions = "sessions" in body ? body.sessions : [];
      setState({
        kind: "done",
        cleaned: sessions.filter((s) => s.outcome.startsWith("reaped")).length,
        unstable: sessions.filter((s) => s.outcome === "skipped_unstable").length,
      });
      router.refresh();
    } catch {
      setState({ kind: "error", copy: GENERIC_ERROR, code: null });
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="reap-stale-sessions">
      {state.kind === "confirming" ? null : (
        <button
          type="button"
          data-testid="reap-stale-sessions-button"
          onClick={() => setState({ kind: "confirming" })}
          disabled={state.kind === "running"}
          className="inline-flex min-h-tap-min items-center justify-center self-start rounded-sm border border-border-strong bg-bg px-4 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          {state.kind === "running" ? "Cleaning up…" : "Clean up old setup leftovers"}
        </button>
      )}

      {state.kind === "confirming" ? (
        <div
          role="dialog"
          aria-labelledby="reap-stale-sessions-confirm-heading"
          data-testid="reap-stale-sessions-confirm"
          className="flex flex-col gap-3 rounded-md border border-border bg-warning-bg p-tile-pad text-warning-text"
        >
          <p id="reap-stale-sessions-confirm-heading" className="text-sm font-semibold">
            Clean up old setup leftovers?
          </p>
          <p className="text-sm">
            This removes leftover staging data from setup sessions that were abandoned more than a
            day ago. Your current setup, live shows, and live folder are not touched.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="reap-stale-sessions-confirm-yes"
              onClick={confirmAndRun}
              className="inline-flex min-h-tap-min items-center justify-center rounded-sm bg-warning-text px-4 text-sm font-semibold text-warning-bg transition-colors duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              Yes, clean up
            </button>
            <button
              type="button"
              data-testid="reap-stale-sessions-confirm-cancel"
              onClick={() => setState({ kind: "idle" })}
              className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-4 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {state.kind === "done" ? (
        <div
          role="status"
          data-testid="reap-stale-sessions-result"
          className="flex flex-col gap-1 rounded-md border border-border bg-surface-sunken p-tile-pad text-sm text-text-strong"
        >
          <p>
            {state.cleaned === 0 && state.unstable === 0
              ? "Nothing to clean up — no old setup leftovers found."
              : `Cleaned up leftovers from ${state.cleaned} old setup ${
                  state.cleaned === 1 ? "session" : "sessions"
                }.`}
          </p>
          {state.unstable > 0 ? (
            <p data-testid="reap-stale-sessions-result-unstable">
              {state.unstable === 1
                ? "1 session couldn't be cleaned this run — try again."
                : `${state.unstable} sessions couldn't be cleaned this run — try again.`}
            </p>
          ) : null}
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div
          role="alert"
          data-testid="reap-stale-sessions-error"
          className="flex flex-col gap-1 rounded-md border border-border bg-warning-bg p-tile-pad text-sm text-warning-text"
        >
          <p>{state.copy}</p>
          <HelpAffordance code={state.code} />
        </div>
      ) : null}
    </div>
  );
}
