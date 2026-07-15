/**
 * Pure decision-state core for the two "use the sheet's raw value" admin toggle
 * actions (spec 2026-07-10-structural-transform-use-raw §3, §5, §9).
 *
 * This module has NO I/O, NO clock, NO advisory lock — it is the pure inner core
 * both server actions call once they hold the per-show advisory lock and have
 * re-read the LIVE warnings + current decisions from the phase-appropriate column
 * (`shows_internal.parse_warnings` per-show, `pending_syncs.parse_result.warnings`
 * staged). Keeping it pure makes the full §3 state matrix, the `(code, contentHash)`
 * equivalence-class governance, and the warningRef three-branch validation directly
 * unit-testable without a DB or a lock.
 *
 * Two responsibilities:
 *   1. `findLiveResolvableWarning` — validates a client `WarningRef` against the
 *      LIVE warnings (in-lock): rejects (no write) when (a) no matching in-scope
 *      warning exists, (b) its `resolution` is absent or `resolvable:false`, or
 *      (c) the client's `observedContentHash` no longer matches the live
 *      `resolution.contentHash` (stale UI — the cell changed under a re-parse).
 *      On success it returns the SERVER-DERIVED `contentHash` + `target` (copied
 *      from the live warning), never a client arg.
 *   2. `computeUseRawToggle` — the single state-aware toggle rule (§3 table). The
 *      new `applied` is "the entity rows already reflect the new preference,"
 *      which §3 states is FULLY DETERMINED BY THE CURRENT PERSISTED ROW (no entity
 *      read). A `{transform, applied:true}` result is written as row-deletion (GC).
 */
import type { ParseWarning } from "@/lib/parser/types";
import type { UseRawCode, UseRawDecision } from "@/lib/sync/useRawOverlay";
import { USE_RAW_CODES } from "@/lib/sync/useRawOverlay";

const IN_SCOPE = new Set<string>(USE_RAW_CODES);

/** The client-supplied locator + optimistic-concurrency token (spec §7/§9). The
 * `observedContentHash` is validated against the live warning and then discarded —
 * the STORED hash is always the server-derived live one, so a client can never pin
 * content that is not live. */
export type UseRawWarningRef = {
  code: string;
  blockRef: { kind: string; index?: number; name?: string; field?: string };
  observedContentHash: string;
};

export type WarningLookup =
  | { ok: true; contentHash: string; target: UseRawDecision["target"] }
  | { ok: false; reason: "not_found" | "not_resolvable" | "stale" };

function blockRefMatches(w: ParseWarning["blockRef"], ref: UseRawWarningRef["blockRef"]): boolean {
  if (!w) return false;
  if (w.kind !== ref.kind) return false;
  if (ref.index !== undefined && w.index !== ref.index) return false;
  if (ref.name !== undefined && w.name !== ref.name) return false;
  if (ref.field !== undefined && w.field !== ref.field) return false;
  return true;
}

/** Build the display-only `target` from the LIVE warning's blockRef (spec §9 — the
 * stored target comes from the live warning, never a client arg). exactOptional-safe
 * (conditional spread; never an explicit `undefined`). */
function targetFromWarning(w: ParseWarning): UseRawDecision["target"] {
  const b = w.blockRef;
  return {
    kind: b?.kind ?? "",
    ...(b?.name !== undefined ? { name: b.name } : {}),
    ...(b?.index !== undefined ? { index: b.index } : {}),
    ...(b?.field !== undefined ? { field: b.field } : {}),
  };
}

/**
 * Validate a `WarningRef` against the LIVE warnings (spec §9 three-branch check).
 * The locked re-read is the source of truth — a warning valid in a stale pre-lock
 * snapshot but gone/changed in-lock is rejected here. Returns the server-derived
 * `contentHash` + `target` on success.
 */
export function findLiveResolvableWarning(
  warnings: ParseWarning[],
  ref: UseRawWarningRef,
): WarningLookup {
  if (!IN_SCOPE.has(ref.code)) return { ok: false, reason: "not_found" };
  const candidates = warnings.filter(
    (w) => w.code === ref.code && blockRefMatches(w.blockRef, ref.blockRef),
  );
  if (candidates.length === 0) return { ok: false, reason: "not_found" };
  // Select by the client's observedContentHash, NOT "first resolvable then check hash".
  // A non-unique blockRef (two rooms with the same name+field but distinct raw content)
  // yields multiple candidates; picking the first would report `stale` for a valid decision
  // on a later duplicate and leave it permanently unreachable (Codex R3 F2). The observed
  // hash names the exact equivalence class — `(code, contentHash)` is the match key
  // everywhere else in this feature, so it is the correct disambiguator here too.
  const exact = candidates.find(
    (c) =>
      c.resolution?.resolvable === true && c.resolution.contentHash === ref.observedContentHash,
  );
  if (exact && exact.resolution?.resolvable === true) {
    return {
      ok: true,
      contentHash: exact.resolution.contentHash,
      target: targetFromWarning(exact),
    };
  }
  // No live resolvable warning matches the observed hash. Distinguish "the cell changed
  // under a re-parse" (a resolvable warning exists, different hash → stale) from "no
  // resolvable warning at all" (not_resolvable).
  const anyResolvable = candidates.some((c) => c.resolution?.resolvable === true);
  return { ok: false, reason: anyResolvable ? "stale" : "not_resolvable" };
}

export type ComputeToggleInput = {
  currentDecisions: UseRawDecision[];
  code: UseRawCode;
  contentHash: string;
  target: UseRawDecision["target"];
  useRaw: boolean;
  decidedBy: string;
  now: string; // ISO timestamp (server clock, passed in — the core has no clock)
  /**
   * Whether a toggle may write `applied:true` directly (the "already settled"
   * shortcut). The per-show action passes `true`: from `clear-pending` the entity
   * rows are already raw, so toggling back on is `raw-active` immediately (§3). The
   * wizard-staged action passes `false`: pre-create there are no applied entity
   * rows, so a decision is never `applied:true` and `clear-pending` is unreachable.
   */
  allowApplied: boolean;
};

export type ComputeToggleResult =
  | { kind: "noop"; nextDecisions: UseRawDecision[]; alreadySettled: true; mutated: false }
  | {
      kind: "write";
      nextDecisions: UseRawDecision[];
      written: UseRawDecision;
      alreadySettled: boolean;
      mutated: true;
    }
  | { kind: "delete"; nextDecisions: UseRawDecision[]; alreadySettled: true; mutated: true };

type DerivedState = "absent" | "apply-pending" | "raw-active" | "clear-pending";

function deriveState(current: UseRawDecision | undefined): DerivedState {
  if (!current) return "absent";
  if (current.preference === "raw") return current.applied ? "raw-active" : "apply-pending";
  // preference === "transform" → only {transform, applied:false} ever persists (§3).
  return "clear-pending";
}

/**
 * The single state-aware toggle rule (spec §3 table). `applied` is derived from the
 * CURRENT persisted row only (spec §3: "fully determined by the current persisted
 * row … no need to read the entity rows"). Because a decision is content-scoped —
 * keyed by `(code, contentHash)` and applied by the overlay to EVERY warning sharing
 * that canonical raw — this one row governs the whole equivalence class atomically.
 */
export function computeUseRawToggle(input: ComputeToggleInput): ComputeToggleResult {
  const others = input.currentDecisions.filter(
    (d) => !(d.code === input.code && d.contentHash === input.contentHash),
  );
  const current = input.currentDecisions.find(
    (d) => d.code === input.code && d.contentHash === input.contentHash,
  );
  const state = deriveState(current);

  const make = (preference: "raw" | "transform", applied: boolean): UseRawDecision => ({
    code: input.code,
    contentHash: input.contentHash,
    target: input.target,
    preference,
    applied,
    decidedAt: input.now,
    decidedBy: input.decidedBy,
  });
  const noop = (): ComputeToggleResult => ({
    kind: "noop",
    nextDecisions: input.currentDecisions,
    alreadySettled: true,
    mutated: false,
  });
  const write = (d: UseRawDecision, alreadySettled: boolean): ComputeToggleResult => ({
    kind: "write",
    nextDecisions: [...others, d],
    written: d,
    alreadySettled,
    mutated: true,
  });

  if (input.useRaw) {
    // Toggle → raw.
    switch (state) {
      case "absent":
        // transform-active → apply-pending (entity rows still transform).
        return write(make("raw", false), false);
      case "apply-pending":
      case "raw-active":
        // already raw (pending or active) → nothing to do.
        return noop();
      case "clear-pending":
        // entity rows are ALREADY raw → straight back to raw-active when the surface
        // allows applied (per-show); staged never reaches this state.
        return write(make("raw", input.allowApplied), input.allowApplied);
    }
  }
  // Toggle → transform (off).
  switch (state) {
    case "absent":
      // already transform → nothing to do.
      return noop();
    case "apply-pending":
      // {raw,false}: entity rows already transform → GC the row (settled).
      return { kind: "delete", nextDecisions: others, alreadySettled: true, mutated: true };
    case "raw-active":
      // {raw,true}: entity rows are raw → clear-pending (revert not yet applied).
      return write(make("transform", false), false);
    case "clear-pending":
      // already reverting → nothing to do.
      return noop();
  }
}
