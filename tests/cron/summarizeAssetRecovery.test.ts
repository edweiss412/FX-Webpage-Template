import { describe, expect, test } from "vitest";
import { summarizeAssetRecovery } from "@/lib/cron/summarizeAssetRecovery";

const one = (outcome: string) =>
  ({ processed: [{ showId: "s", result: { outcome } as never }] }) as never;

describe("summarizeAssetRecovery — exhaustive 9-literal map", () => {
  test.each([
    ["recovered", "ok"],
    ["restage_required", "ok"],
    ["no_op", "ok"],
    ["skipped", "ok"],
    ["revision_drift", "ok"],
    ["drift_cooldown", "ok"],
    ["partial_failure", "partial"],
    ["bytes_exceeded", "partial"],
    ["infra_error", "infra"],
  ])("%s → run outcome %s", (literal, expected) => {
    expect(summarizeAssetRecovery(one(literal)).outcome).toBe(expected);
  });
  test("severity precedence: infra_error wins over partial_failure wins over benign", () => {
    const mixed = {
      processed: [
        { showId: "a", result: { outcome: "recovered" } },
        { showId: "b", result: { outcome: "partial_failure" } },
        { showId: "c", result: { outcome: "infra_error" } },
      ],
    } as never;
    const s = summarizeAssetRecovery(mixed);
    expect(s.outcome).toBe("infra");
    expect(s.counts).toMatchObject({ processed: 3, recovered: 1, failed: 2 });
  });
  test("unknown literal → conservative failure (partial), never silently benign", () => {
    expect(summarizeAssetRecovery(one("brand_new_outcome")).outcome).toBe("partial");
  });
});

const proc = (showId: string, result: unknown) => ({ showId, result });

describe("summarizeAssetRecovery — failure breadcrumb", () => {
  test("keys on showId; omits code for partial_failure", () => {
    const s = summarizeAssetRecovery({
      processed: [
        proc("s-ok", { outcome: "recovered" }),
        proc("s-pf", { outcome: "partial_failure", snapshotRevisionId: "r1" }),
      ],
    } as never);
    expect(s.outcome).toBe("partial");
    expect(s.detail?.failures).toEqual([{ showId: "s-pf", outcome: "partial_failure" }]);
  });

  test("infra_error carries its code", () => {
    const s = summarizeAssetRecovery({
      processed: [proc("s-x", { outcome: "infra_error", code: "SYNC_INFRA_ERROR" })],
    } as never);
    expect(s.outcome).toBe("infra");
    expect(s.detail?.failures).toEqual([
      { showId: "s-x", outcome: "infra_error", code: "SYNC_INFRA_ERROR" },
    ]);
  });

  test("all-ok run omits detail", () => {
    const s = summarizeAssetRecovery({ processed: [proc("s", { outcome: "no_op" })] } as never);
    expect(s.detail).toBeUndefined();
  });
});
