"use client";

/**
 * components/admin/BlockedRowResolver.tsx (in-wizard blocker resolution — Task 11)
 *
 * A per-row two-tap resolver mounted on the final-publish blocker lists for the
 * two auto-resolvable blocker codes:
 *
 *   - SHOW_ARCHIVED_IMMUTABLE       → "Unarchive & retry" (action: "unarchive")
 *   - STAGED_REVIEW_ITEMS_CORRUPT / STAGED_PARSE_RESULT_CORRUPT
 *                                   → "Discard & rebuild" (action: "rebuild")
 *
 *   POST /api/admin/onboarding/resolve-blocker
 *     { wizardSessionId, driveFileId, code, action }
 *
 * Any other code (freshness codes like STAGED_PARSE_OUTDATED_AT_PHASE_D stay on
 * RescanSheetButton, not this component) renders nothing.
 *
 * Two-tap arm/confirm mirrors RescanSheetButton.tsx's idiom exactly (4s
 * auto-revert, sr-only "Tap again to confirm." live region, aria-busy while
 * pending, NOT a self-disabling form action).
 *
 * A route-computed `rebuildExhausted` (first paint) OR a route-RETURNED
 * `{ status: "escalated" }` (a stale client that hit the cap mid-session) both
 * render the same escalation copy immediately — never a silent revert to idle
 * (Codex plan-R2 F1).
 *
 * Code-less statuses (superseded/no_active_session/not_found/
 * not_currently_blocked/bad_request/wrong_action) get short plain-English
 * lines (Codex plan-R2 F2), NOT the generic fallback; needs_attention/busy
 * resolve their cataloged dougFacing via messageFor + a HelpAffordance
 * disclosure (invariant 5: no raw §12.4 code in visible text). No em dashes
 * (DESIGN.md).
 */
import { useEffect, useRef, useState } from "react";
import { messageFor, isMessageCode } from "@/lib/messages/lookup";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { renderEmphasis } from "@/components/messages/renderEmphasis";

export type BlockedRowResolverProps = {
  driveFileId: string;
  wizardSessionId: string;
  code: string;
  displayName?: string;
  rebuildExhausted?: boolean;
  disabled?: boolean;
  onResolved: () => void;
};

const ARM_REVERT_MS = 4_000;
const REBUILDABLE_CODES = new Set(["STAGED_REVIEW_ITEMS_CORRUPT", "STAGED_PARSE_RESULT_CORRUPT"]);
// not-subject:M5-D8 — defensive generic fallback for a network throw / catalog miss where there
// is no route status code to look up; every coded branch routes through messageFor(code) first
// (mirrors RescanSheetButton.tsx's CODED_FALLBACK exemption).
const GENERIC_ERROR = "Something went wrong. Refresh and try again.";

type CodelessStatus =
  | "superseded"
  | "no_active_session"
  | "not_found"
  | "not_currently_blocked"
  | "bad_request"
  | "wrong_action";

// Spec §3.6: code-less statuses get short plain-English lines (mirrors RescanSheetButton's
// PLAIN_COPY), NOT the generic fallback (Codex plan-R2 F2). No em dashes (DESIGN.md).
const PLAIN_COPY: Record<CodelessStatus, string> = {
  superseded: "This setup was replaced by a newer run. Refresh and try again.",
  no_active_session: "Setup isn't running right now. Refresh the page and try again.",
  not_found: "This show is no longer part of this setup.",
  not_currently_blocked:
    "This sheet isn't blocking publish anymore. Refresh to see its current state.",
  bad_request: GENERIC_ERROR,
  wrong_action: "Refresh and try again.",
};

type ResolveBlockerResponse =
  | { ok: true; status: "resolved" }
  | { ok: false; status: "escalated"; code: string }
  | { ok: false; status: "needs_attention" | "busy"; code: string }
  | { ok: false; status: CodelessStatus };

function lookupDougFacing(code: string): string | null {
  return isMessageCode(code) ? messageFor(code).dougFacing : null;
}

export function BlockedRowResolver({
  driveFileId,
  wizardSessionId,
  code,
  displayName,
  rebuildExhausted = false,
  disabled = false,
  onResolved,
}: BlockedRowResolverProps) {
  const action: "unarchive" | "rebuild" | null =
    code === "SHOW_ARCHIVED_IMMUTABLE"
      ? "unarchive"
      : REBUILDABLE_CODES.has(code)
        ? "rebuild"
        : null;
  const [armed, setArmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [errorCopy, setErrorCopy] = useState<string | null>(null);
  // Local escalated flag: a route-returned { status: "escalated" } (a stale client that
  // still showed the button after the cap was hit) must render the escalation copy
  // IMMEDIATELY, not silently return to idle (Codex plan-R2 F1). Renders the same
  // escalation branch as the server-computed `rebuildExhausted` first-paint.
  const [escalated, setEscalated] = useState(false);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function clearArmTimer() {
    if (armTimerRef.current !== null) {
      clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
  }
  useEffect(() => clearArmTimer, []);
  useEffect(() => {
    if (disabled && armed) {
      clearArmTimer();
      // Compound transition (spec §3.1): an external `disabled` prop flip must
      // disarm an in-flight two-tap confirm; there is no external-system
      // subscribe to synchronize here, only this derived disarm (mirrors
      // VenueMapTile.tsx:31's post-hydration-read precedent for this rule).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setArmed(false);
    }
  }, [disabled, armed]);

  if (!driveFileId || !wizardSessionId || action === null) return null;
  if (action === "rebuild" && (rebuildExhausted || escalated)) {
    const name = displayName || driveFileId;
    // The one unrecoverable state (worst case of the sad path). role="alert" so a
    // screen-reader user who reaches it post-click (a conditionally-mounted branch —
    // role="status" would not reliably announce on mount) hears the failure, and the
    // bg-warning-bg/border warning-card matches every other error state in this file +
    // the finalize panels' terminal-alert idiom (impeccable critique P0/P1).
    return (
      <div
        role="alert"
        data-testid={`blocked-row-escalated-${driveFileId}`}
        className="rounded-sm border border-border-strong bg-warning-bg p-3 text-sm text-warning-text"
      >
        <p>
          {renderEmphasis(
            `We could not automatically rebuild ${name} after one attempt. Contact the developer to clear it.`,
          )}
        </p>
      </div>
    );
  }

  async function handleClick() {
    if (pending) return;
    setPending(true);
    setErrorCopy(null);
    try {
      const response = await fetch("/api/admin/onboarding/resolve-blocker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wizardSessionId, driveFileId, code, action }),
      });
      const body = (await response.json()) as ResolveBlockerResponse;
      if (body.ok) {
        onResolved();
        return;
      }
      if (body.status === "escalated") {
        setEscalated(true); // render escalation copy immediately (F1) — never silently idle
        return;
      }
      if (body.status === "needs_attention" || body.status === "busy") {
        setErrorCopy(lookupDougFacing(body.code) ?? GENERIC_ERROR);
      } else {
        setErrorCopy(PLAIN_COPY[body.status]); // code-less statuses get plain lines (F2)
      }
    } catch {
      setErrorCopy(GENERIC_ERROR);
    } finally {
      setPending(false);
    }
  }

  function onGuardedClick() {
    if (disabled) return;
    if (!armed) {
      setArmed(true);
      clearArmTimer();
      armTimerRef.current = setTimeout(() => {
        armTimerRef.current = null;
        setArmed(false);
      }, ARM_REVERT_MS);
      return;
    }
    clearArmTimer();
    setArmed(false);
    void handleClick();
  }

  const idleLabel = action === "unarchive" ? "Unarchive & retry" : "Discard & rebuild";
  const armedLabel =
    action === "unarchive"
      ? "Confirm unarchive: brings this show back to publish it"
      : "Confirm rebuild: discards the staged copy and re-scans";

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        data-testid={`blocked-row-resolver-${driveFileId}`}
        onClick={onGuardedClick}
        disabled={pending || disabled}
        aria-busy={pending}
        className={
          armed
            ? "inline-flex min-h-tap-min items-center justify-center self-start rounded-sm border border-transparent bg-warning-text px-4 text-sm font-semibold text-warning-bg transition-opacity duration-fast hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            : "inline-flex min-h-tap-min items-center justify-center self-start rounded-sm border border-border-strong bg-bg px-4 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        }
      >
        {armed
          ? armedLabel
          : pending
            ? action === "unarchive"
              ? "Unarchiving…"
              : "Rebuilding…"
            : idleLabel}
      </button>
      <span role="status" className="sr-only">
        {armed ? "Tap again to confirm." : ""}
      </span>
      {errorCopy ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-sm border border-border bg-warning-bg px-3 py-2 text-sm text-warning-text"
        >
          <p>{renderEmphasis(errorCopy)}</p>
          <HelpAffordance code={code} />
        </div>
      ) : null}
    </div>
  );
}
