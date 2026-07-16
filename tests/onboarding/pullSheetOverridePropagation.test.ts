import { describe, expect, test, vi } from "vitest";
import { applyStagedCore, type ApplyStagedCoreDeps } from "@/lib/sync/applyStagedCore";
import { parseShadowPayloadForApply } from "@/lib/onboarding/shadowPayload";
import { overrideSnapshot, type PullSheetOverride } from "@/lib/sync/pullSheetOverride";
import { coreArgs, parseResult, spyTx, type SpyTx } from "../sync/_applyStagedCoreTestkit";

/**
 * Task 9 — publish propagation of the accepted archived-tab pull-sheet override to
 * shows.pull_sheet_override on BOTH finalize flows (§5.5, I6). PROPAGATION ONLY: the §5.8
 * consistency gate (refuse-on-mismatch) is Task 11 and is NOT exercised here — every fixture
 * uses a CONSISTENT payload (applied === overrideSnapshot(desired)).
 */

const OVERRIDE_A: PullSheetOverride = {
  tabName: "OLD PULL SHEET",
  fingerprint: "ff",
  acceptedBy: "doug@fxav.com",
  acceptedAt: "2026-07-06T00:00:00.000Z",
};

// A spy tx that ALSO records the single shows.pull_sheet_override UPDATE the propagation writer
// issues (the base testkit spyTx throws on any non-pg_locks queryOne).
function spyTxWithOverrideWrite(): SpyTx & { overrideWrites: Array<{ params: unknown[] }> } {
  const tx = spyTx() as SpyTx & { overrideWrites: Array<{ params: unknown[] }> };
  tx.overrideWrites = [];
  tx.queryOne = (async (sql: string, params: unknown[] = []) => {
    const norm = sql.replace(/\s+/g, " ").trim();
    tx.sql.push(norm);
    if (/pg_locks/i.test(sql)) return { held: true };
    // Publish freshness gate SQL (staging-overlay spec §3.5): fresh by default in these fakes.
    if (sql.startsWith("select public.role_mappings_stamp_satisfied")) return { ok: true };
    if (/update public\.shows set pull_sheet_override/i.test(norm)) {
      tx.overrideWrites.push({ params });
      return undefined;
    }
    throw new Error(`unexpected queryOne SQL: ${norm}`);
  }) as SpyTx["queryOne"];
  return tx;
}

const applyDeps: ApplyStagedCoreDeps = {
  insertSyncAudit: vi.fn(async () => "audit-1"),
  deleteLivePendingSync: vi.fn(async () => {}),
};

describe("Task 9 — pull_sheet_override publish propagation", () => {
  test("Flow A: pending_syncs.pull_sheet_override copied to shows on first-seen publish", async () => {
    const tx = spyTxWithOverrideWrite();
    const result = await applyStagedCore(
      tx,
      coreArgs(tx, {
        sourceScope: "wizard",
        show: null, // first-seen
        baseModifiedTime: null, // no live row → equality preflight trivially holds
        firstSeenPublished: false,
        pullSheetOverride: OVERRIDE_A,
      }),
      applyDeps,
    );
    expect(result.outcome).toBe("applied");
    // The accepted override reached shows.pull_sheet_override under the held show: lock.
    expect(tx.overrideWrites).toHaveLength(1);
    expect(tx.overrideWrites[0]!.params[0]).toEqual(OVERRIDE_A);
    expect(tx.overrideWrites[0]!.params[1]).toBe("drive-core-1");
  });

  test("Flow A: no shows.pull_sheet_override write when the arg is omitted (live/cron path untouched)", async () => {
    const tx = spyTxWithOverrideWrite();
    // coreArgs default omits pullSheetOverride (live staged-apply) → no durable-override write.
    const result = await applyStagedCore(tx, coreArgs(tx), applyDeps);
    expect(result.outcome).toBe("applied");
    expect(tx.overrideWrites).toHaveLength(0);
  });

  test("Flow A: revoke propagates as null (clears the durable override)", async () => {
    const tx = spyTxWithOverrideWrite();
    await applyStagedCore(
      tx,
      coreArgs(tx, {
        sourceScope: "wizard",
        show: null,
        baseModifiedTime: null,
        firstSeenPublished: false,
        pullSheetOverride: null,
      }),
      applyDeps,
    );
    expect(tx.overrideWrites).toHaveLength(1);
    expect(tx.overrideWrites[0]!.params[0]).toBeNull();
  });

  test("Flow B: existing-show shadow payload carries BOTH override + applied snapshot; Phase-D writes override to shows (consistent payload)", async () => {
    // The shadow payload as stageExistingShowShadow's jsonb_build_object produces it — CONSISTENT:
    // applied === overrideSnapshot(desired) (Task 9 precondition; Task 11 adds the refusal gate).
    const applied = overrideSnapshot(OVERRIDE_A);
    const payload = {
      parse_result: parseResult(),
      staged_modified_time: "2026-06-10T12:00:00.000Z",
      staged_id: "33333333-3333-4333-8333-333333333333",
      reviewer_choices: [],
      triggered_review_items: [],
      base_modified_time: "2026-06-09T00:00:00.000Z",
      pull_sheet_override: OVERRIDE_A,
      pull_sheet_override_applied: applied,
    };

    // (a) the shadow payload SURFACES both values fail-closed at the Phase-D read boundary.
    const parsed = parseShadowPayloadForApply(payload);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("expected ok payload");
    expect(parsed.pullSheetOverride).toEqual(OVERRIDE_A);
    expect(parsed.pullSheetOverrideApplied).toEqual(applied);
    expect(parsed.pullSheetOverrideApplied).toEqual(overrideSnapshot(parsed.pullSheetOverride));

    // (b) Phase-D apply (finalize-cas applyShadow) forwards parsed.pullSheetOverride to the core,
    // which propagates it to shows.pull_sheet_override under the held show: lock.
    const tx = spyTxWithOverrideWrite();
    const result = await applyStagedCore(
      tx,
      coreArgs(tx, { sourceScope: "wizard", pullSheetOverride: parsed.pullSheetOverride }),
      applyDeps,
    );
    expect(result.outcome).toBe("applied");
    expect(tx.overrideWrites).toHaveLength(1);
    expect(tx.overrideWrites[0]!.params[0]).toEqual(OVERRIDE_A);
  });

  test("shadow payload parse is fail-closed on a malformed override object", () => {
    const parsed = parseShadowPayloadForApply({
      parse_result: parseResult(),
      staged_modified_time: "2026-06-10T12:00:00.000Z",
      staged_id: "33333333-3333-4333-8333-333333333333",
      reviewer_choices: [],
      triggered_review_items: [],
      base_modified_time: "2026-06-09T00:00:00.000Z",
      pull_sheet_override: { tabName: "OLD", fingerprint: 42 }, // fingerprint not a string
      pull_sheet_override_applied: null,
    });
    expect(parsed.ok).toBe(false);
  });

  test("shadow payload treats absent override keys as null (no override)", () => {
    const parsed = parseShadowPayloadForApply({
      parse_result: parseResult(),
      staged_modified_time: "2026-06-10T12:00:00.000Z",
      staged_id: "33333333-3333-4333-8333-333333333333",
      reviewer_choices: [],
      triggered_review_items: [],
      base_modified_time: "2026-06-09T00:00:00.000Z",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("expected ok payload");
    expect(parsed.pullSheetOverride).toBeNull();
    expect(parsed.pullSheetOverrideApplied).toBeNull();
  });
});
