import { describe, it, expect } from "vitest";

import {
  evaluateFinalizeOverrideGate,
  type OverrideSnapshot,
  type PullSheetOverride,
} from "@/lib/sync/pullSheetOverride";
import { isMessageCode, messageFor } from "@/lib/messages/lookup";

/**
 * Task 11 — §5.8 / I4 finalize consistency gate (Flow A/B + failed-re-scan states).
 *
 * The gate is a DECLARATIVE, pure read+compare: refuse when the staged parse's APPLIED
 * override snapshot has diverged from the DESIRED override. No compensation write — a
 * successful re-scan reconverges applied → desired. Every case below exercises the pure
 * helper `evaluateFinalizeOverrideGate`, the single comparator both finalize flows call
 * under the held `show:` lock before propagating shows.pull_sheet_override / applying the
 * staged parse.
 */

// The accepted archived-tab override "A" (durable/desired), full object incl. audit fields.
const A: PullSheetOverride = {
  tabName: "OLD PULL SHEET",
  fingerprint: "ff",
  acceptedBy: "doug@example.com",
  acceptedAt: "2026-07-06T00:00:00.000Z",
};
// Its operational projection (what `*.pull_sheet_override_applied` stores).
const A_SNAP: OverrideSnapshot = { tabName: "OLD PULL SHEET", fingerprint: "ff" };

// Test-local resolver = the invariant-5 lookup path: a cataloged code resolves to non-null copy.
const lookupMessage = (code: string | null): string | null =>
  code && isMessageCode(code) ? messageFor(code).dougFacing : null;

describe("evaluateFinalizeOverrideGate — §5.8 finalize consistency gate", () => {
  it("Flow A accepted-then-revoke-then-failed-rescan => finalize REFUSED (applied=A, desired=null)", () => {
    // Revoke set desired→null; the failed re-scan never reconverged applied off A.
    const outcome = evaluateFinalizeOverrideGate({ desired: null, applied: A_SNAP });
    expect(outcome.ok).toBe(false);
    expect(outcome.code).toBe("STAGED_PARSE_OUTDATED_AT_PHASE_D");
  });

  it("Flow A accept-then-failed-rescan => finalize REFUSED until reconverge (override=A, applied=null)", () => {
    // Accept set desired=A; the failed re-scan reset applied→null without reconverging.
    const outcome = evaluateFinalizeOverrideGate({ desired: A, applied: null });
    expect(outcome.ok).toBe(false);
    expect(outcome.code).toBe("STAGED_PARSE_OUTDATED_AT_PHASE_D");
  });

  it("Flow B durable=A, staged-under-A, revoke=>null, rescan fails => payload {override:null, applied:A} => gate compares A vs null => REFUSED (NOT buggy durable-A pass)", () => {
    // Codex R8: compare payload-INTERNAL desired vs applied, never the stale durable shows.A.
    const outcome = evaluateFinalizeOverrideGate({ desired: null, applied: A_SNAP });
    expect(outcome.ok).toBe(false);
    expect(outcome.code).toBe("STAGED_PARSE_OUTDATED_AT_PHASE_D");
  });

  it("Flow B legitimate accept durable-null=>A, staged-under-A => payload {override:A, applied:A} => gate PASSES, shows.override=A (NOT permanently blocked)", () => {
    const outcome = evaluateFinalizeOverrideGate({ desired: A, applied: A_SNAP });
    expect(outcome.ok).toBe(true);
    expect(outcome.code).toBeNull();
  });

  it("overrideSnapshot compare ignores acceptedBy/acceptedAt: accepted-then-rescanned row DOES finalize (Flow A & B)", () => {
    // Codex R3-1: desired carries the ORIGINAL audit fields; applied is a re-stamped row whose
    // acceptedBy/acceptedAt differ. A subset-vs-object deep-equal would falsely mismatch; the gate
    // reduces both via overrideSnapshot (drops audit) and deep-equals tabName+fingerprint only.
    const desiredWithAudit: PullSheetOverride = {
      tabName: "OLD PULL SHEET",
      fingerprint: "ff",
      acceptedBy: "doug@example.com",
      acceptedAt: "2026-07-06T00:00:00.000Z",
    };
    // applied carries DIFFERENT audit fields (a rescanned/re-stamped row) — must still match.
    const appliedWithDifferentAudit = {
      tabName: "OLD PULL SHEET",
      fingerprint: "ff",
      acceptedBy: "someone-else@example.com",
      acceptedAt: "2020-01-01T00:00:00.000Z",
    } as unknown as OverrideSnapshot;
    const outcome = evaluateFinalizeOverrideGate({
      desired: desiredWithAudit,
      applied: appliedWithDifferentAudit,
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.code).toBeNull();
  });

  it("mismatch blocking outcome returns cataloged STAGED_PARSE_OUTDATED_AT_PHASE_D and resolves to non-null copy (Codex plan-R8-2, no uncataloged code)", () => {
    const outcome = evaluateFinalizeOverrideGate({
      desired: { tabName: "OLD PULL SHEET", fingerprint: "ff" },
      applied: null,
    }); // A vs null => refuse
    expect(outcome.code).toBe("STAGED_PARSE_OUTDATED_AT_PHASE_D");
    expect(lookupMessage(outcome.code)).toBeTruthy(); // existing catalog entry => non-null copy (invariant 5)
  });
});
