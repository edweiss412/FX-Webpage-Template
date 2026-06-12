import { describe, expect, test, vi } from "vitest";
import { applyStagedCore, LIVE_PARTITION_CLASSIFICATION } from "@/lib/sync/applyStagedCore";
// reuse spyTx/coreArgs/parseResult helpers — extracted to tests/sync/_applyStagedCoreTestkit.ts
import { spyTx, coreArgs } from "./_applyStagedCoreTestkit";

describe("applyStagedCore live-partition source scoping", () => {
  test("wizard sourceScope never touches the live partition: no deleteLivePendingIngestion, no live pending_syncs delete", async () => {
    const tx = spyTx();
    const deleteLivePendingSync = vi.fn();
    const result = await applyStagedCore(
      tx,
      coreArgs(tx, { sourceScope: "wizard", auditSource: "onboarding_finalize_cas" }),
      { insertSyncAudit: vi.fn(async () => null), deleteLivePendingSync },
    );
    expect(result.outcome).toBe("applied");
    expect(tx.ops).not.toContain("deleteLivePendingIngestion"); // class op #1
    expect(deleteLivePendingSync).not.toHaveBeenCalled(); // class op #2
  });

  test("live sourceScope keeps current behavior: both live ops fire", async () => {
    const tx = spyTx();
    const deleteLivePendingSync = vi.fn();
    await applyStagedCore(tx, coreArgs(tx, { sourceScope: "live" }), {
      insertSyncAudit: vi.fn(async () => null),
      deleteLivePendingSync,
    });
    expect(tx.ops).toContain("deleteLivePendingIngestion");
    expect(deleteLivePendingSync).toHaveBeenCalledTimes(1);
  });

  test("classification registry covers exactly the enumerated class (no orphan ops)", () => {
    const keys = LIVE_PARTITION_CLASSIFICATION.map((row) => row.op).sort();
    expect(keys).toEqual([
      "adminAlertWriters",
      "deleteApprovedPending",
      "deleteLivePendingIngestion",
      "deleteLivePendingSync",
      "resolveStaleSyncProblemAlerts",
      "restoreDeleteAndIngest",
      "upsertWizardPendingIngestion",
    ]);
    for (const row of LIVE_PARTITION_CLASSIFICATION) {
      expect(["live-only", "wizard-only"]).toContain(row.class);
      expect(row.wizardBehavior.length).toBeGreaterThan(0);
    }
  });
});
