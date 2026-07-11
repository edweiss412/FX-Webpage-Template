"use client";

import { useState, useTransition } from "react";
import type { ParseWarning, UseRawResolution } from "@/lib/parser/types";
import type { UseRawDecision } from "@/lib/sync/useRawOverlay";

/**
 * `<UseRawControl>` — the shared presentational control for the three recoverable
 * structural-transform warnings (spec 2026-07-10-structural-transform-use-raw §8).
 *
 * It shows the transform's parsed reading next to what the sheet's RAW text would
 * render, and a single toggle between them. It is a PURE function of its props:
 * `(warning.resolution, decision.preference, decision.applied, inFlight)` fully
 * determine the render — there is no free-standing state machine. `current` (the
 * parsed value) is ALWAYS read from `warning.resolution.parsed`, NEVER the entity
 * rows (which the overlay may already have rewritten to the raw value).
 *
 * Guard precedence (§8): out-of-scope code → nothing; `resolution` absent → the
 * transient `legacy-unavailable` note; `resolvable:false` → `disabled` with reason;
 * else derive `transform-active`/`apply-pending`/`raw-active`/`clear-pending` from
 * `preference`+`applied`. `apply-pending`/`clear-pending` exist ONLY where an
 * immediate re-sync applies (the per-show surface); the wizard never reaches them.
 *
 * Copy is plain static microcopy (no §12.4 code renders here — invariant 5 governs
 * error CODES, not button labels). No red/green as a sole state carrier (every
 * state pairs colour with words). Both toggle directions use the neutral outline
 * button treatment: this is an escape-hatch override, not a primary CTA, so the FXAV
 * orange accent is reserved (DESIGN §1.1 ≤10%-viewport cap + accent-bg-text bold-≥14pt
 * restriction — a 12px accent fill would breach both).
 */

export type UseRawControlState =
  | "transform-active"
  | "apply-pending"
  | "raw-active"
  | "clear-pending"
  | "disabled"
  | "legacy-unavailable"
  | "pending";

/** The three in-scope codes (the caller also filters; the control guards too). */
const IN_SCOPE = new Set([
  "ROOM_HEADER_SPLIT_AMBIGUOUS",
  "HOTEL_GUEST_SPLIT_AMBIGUOUS",
  "DATE_ORDER_SUGGESTS_DMY",
]);

/**
 * Pure state derivation (spec §8 guard precedence + persisted-state machine). Kept
 * exported + free-standing so the transition-audit test can drive every cell
 * without rendering. `inFlight` overlays the optimistic `pending` state.
 */
export function deriveUseRawControlState(
  warning: Pick<ParseWarning, "code" | "resolution">,
  decision: UseRawDecision | undefined,
  inFlight: boolean,
): UseRawControlState | null {
  if (!IN_SCOPE.has(warning.code)) return null; // (1) out of scope → render nothing
  if (inFlight) return "pending"; // optimistic in-flight overlays every steady state
  if (warning.resolution === undefined) return "legacy-unavailable"; // (2) pre-feature warning
  if (warning.resolution.resolvable === false) return "disabled"; // (3) §4 guard
  // (4) resolvable → derive from the persisted decision
  if (!decision) return "transform-active";
  if (decision.preference === "raw") return decision.applied ? "raw-active" : "apply-pending";
  return "clear-pending"; // preference "transform" (applied:false is the only persisted form)
}

/** Human, plain-language rendering of a parsed reading (spec §8 — parsed side). */
function formatParsed(resolution: Extract<UseRawResolution, { resolvable: true }>): string {
  const p = resolution.parsed;
  if (p.kind === "rooms") {
    const bits = [p.name, p.dimensions, p.floor ? `floor ${p.floor}` : null].filter(Boolean);
    return bits.join(" · ");
  }
  if (p.kind === "hotels") {
    return p.names.length > 0 ? p.names.join(", ") : "(no guests read)";
  }
  return formatDates(p.dates);
}

/** Human rendering of the raw replacement (spec §8 — raw side). */
function formatRaw(resolution: Extract<UseRawResolution, { resolvable: true }>): string {
  const r = resolution.replacement;
  if (r.kind === "rooms") return r.name;
  if (r.kind === "hotels") return r.names[0];
  return formatDates(r.dmyDates);
}

function formatDates(d: {
  travelIn: string | null;
  set: string | null;
  showDays: string[];
  travelOut: string | null;
}): string {
  const parts: string[] = [];
  if (d.travelIn) parts.push(`in ${d.travelIn}`);
  if (d.set) parts.push(`set ${d.set}`);
  if (d.showDays.length > 0) parts.push(`show ${d.showDays.join(", ")}`);
  if (d.travelOut) parts.push(`out ${d.travelOut}`);
  return parts.length > 0 ? parts.join(" · ") : "(no dates read)";
}

const DISABLED_REASON: Record<"empty-raw" | "invalid-dmy", string> = {
  "empty-raw": "The sheet cell is blank, so there's no raw text to use here.",
  "invalid-dmy": "The raw dates don't read cleanly the other way, so we can't swap them in.",
};

// The toggle is an escape-hatch override inside an attention callout, not the page's
// primary correction path (Re-sync / Report / fix-in-sheet own that). Per DESIGN §1.1
// the FXAV orange accent is reserved for primary CTAs and keeps a ≤10%-viewport cap, and
// accent-bg text is restricted to bold ≥14pt — a 12px accent-fill button would both
// out-shout the real CTAs and fall below the AA-large contrast floor (white-on-orange is
// 4.07:1). So both directions use the established neutral outline treatment (matches
// RecentAutoAppliedStrip's data-quality micro-actions). No ring-offset colour: the control
// mounts on warning-bg (per-show) AND info-bg (wizard), so a fixed offset would mispaint.
const toggleBtn =
  "inline-flex min-h-tap-min items-center gap-1 self-start rounded-sm border border-border-strong bg-surface px-3 text-sm font-medium text-text-strong " +
  "transition-colors duration-fast hover:bg-surface-sunken " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring " +
  "disabled:cursor-not-allowed disabled:opacity-60";

export function UseRawControl({
  warning,
  decision,
  onToggle,
}: {
  warning: Pick<ParseWarning, "code" | "resolution">;
  /** The persisted decision for this warning's `(code, contentHash)`, or undefined. */
  decision: UseRawDecision | undefined;
  /** Binds to the surface's server action; resolves after the re-read. */
  onToggle: (useRaw: boolean) => Promise<void> | void;
}) {
  const [isPending, startTransition] = useTransition();
  // Local error surface: a typed action failure re-reads state and shows plain copy.
  // NEVER renders a raw code (invariant 5) — the surface's action returns a typed
  // discriminant, never a code string, and this copy is static.
  const [failed, setFailed] = useState(false);

  const state = deriveUseRawControlState(warning, decision, isPending);
  if (state === null) return null;

  const fire = (useRaw: boolean) => {
    setFailed(false);
    startTransition(async () => {
      try {
        await onToggle(useRaw);
      } catch {
        setFailed(true);
      }
    });
  };

  // Guard states carry no toggle.
  if (state === "legacy-unavailable") {
    return (
      <p data-testid="use-raw-control" data-state={state} className="mt-1 text-xs text-text-subtle">
        Re-sync this show to enable the &ldquo;use the sheet&rsquo;s raw value&rdquo; option.
      </p>
    );
  }
  if (state === "disabled") {
    const reason =
      warning.resolution !== undefined && warning.resolution.resolvable === false
        ? DISABLED_REASON[warning.resolution.reason]
        : "";
    return (
      <p data-testid="use-raw-control" data-state={state} className="mt-1 text-xs text-text-subtle">
        {reason}
      </p>
    );
  }

  // From here on the warning is resolvable — narrow it for the value formatters.
  const resolution = warning.resolution as Extract<UseRawResolution, { resolvable: true }>;
  const parsed = formatParsed(resolution);
  const raw = formatRaw(resolution);
  const busy = state === "pending";

  return (
    <div
      data-testid="use-raw-control"
      data-state={state}
      className="mt-1 flex flex-col gap-1 border-t border-border pt-1"
    >
      <dl className="flex flex-col gap-0.5 text-xs">
        <div className="flex gap-1.5">
          <dt className="shrink-0 font-medium text-text-subtle">Parsed</dt>
          <dd data-testid="use-raw-parsed" className="min-w-0 wrap-break-word text-text">
            {parsed}
          </dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="shrink-0 font-medium text-text-subtle">Raw</dt>
          <dd data-testid="use-raw-raw" className="min-w-0 wrap-break-word text-text">
            {raw}
          </dd>
        </div>
      </dl>

      {(state === "transform-active" || state === "pending") && (
        <button
          type="button"
          data-testid="use-raw-toggle-on"
          disabled={busy}
          onClick={() => fire(true)}
          className={toggleBtn}
        >
          Use the sheet&rsquo;s raw value instead
        </button>
      )}

      {state === "raw-active" && (
        <>
          <p className="text-xs font-medium text-text-strong">Using the sheet&rsquo;s raw value.</p>
          <button
            type="button"
            data-testid="use-raw-toggle-off"
            onClick={() => fire(false)}
            className={toggleBtn}
          >
            Switch back to the parsed version
          </button>
        </>
      )}

      {state === "apply-pending" && (
        <>
          <p data-testid="use-raw-pending-note" className="text-xs text-text-subtle">
            Saved. The crew-visible values will update on the next successful sync.
          </p>
          <button
            type="button"
            data-testid="use-raw-toggle-off"
            onClick={() => fire(false)}
            className={toggleBtn}
          >
            Switch back to the parsed version
          </button>
        </>
      )}

      {state === "clear-pending" && (
        <>
          <p data-testid="use-raw-pending-note" className="text-xs text-text-subtle">
            Reverting. The crew-visible values still show the raw text until the next successful
            sync.
          </p>
          <button
            type="button"
            data-testid="use-raw-toggle-on"
            onClick={() => fire(true)}
            className={toggleBtn}
          >
            Use the sheet&rsquo;s raw value instead
          </button>
        </>
      )}

      {failed && (
        <p data-testid="use-raw-error" role="alert" className="text-xs text-warning-text">
          That didn&rsquo;t save. The cell may have changed. Refresh and try again.
        </p>
      )}
    </div>
  );
}
