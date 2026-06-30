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
