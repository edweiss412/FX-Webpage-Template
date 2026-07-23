import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<[string, ...unknown[]]> = [];
function makeBuilder(): Record<string, unknown> {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "in", "or", "ilike", "is", "order", "limit"]) {
    b[m] = (...args: unknown[]) => {
      calls.push([m, ...args]);
      return m === "limit" ? Promise.resolve({ data: [], error: null, count: 0 }) : b;
    };
  }
  return b;
}
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({ from: () => makeBuilder() }),
}));

import { queryAlerts } from "@/lib/observe/query/alerts";
import { queryIngestFailures } from "@/lib/observe/query/failures";

describe("read-core capture filters", () => {
  beforeEach(() => calls.splice(0));
  it("non-UUID showIdOrGlobal returns empty ok WITHOUT touching the builder (injection fail-closed)", async () => {
    const res = await queryAlerts({ openOnly: true, showIdOrGlobal: "x,show_id.not.is.null" });
    expect(res).toEqual({ kind: "ok", alerts: [] });
    expect(calls.some(([m]) => m === "or")).toBe(false);
  });
  it("empty driveFileId returns empty ok (no widened query)", async () => {
    const res = await queryIngestFailures({ driveFileId: "" });
    expect(res).toEqual({ kind: "ok", rows: [] });
    expect(calls.some(([m, col]) => m === "eq" && col === "drive_file_id")).toBe(false);
  });
  it("showIdOrGlobal builds the show-or-global .or clause", async () => {
    const uuid = "11111111-2222-4333-8444-555555555555";
    await queryAlerts({ openOnly: true, limit: 101, showIdOrGlobal: uuid });
    expect(calls).toContainEqual(["or", `show_id.eq.${uuid},show_id.is.null`]);
  });
  it("driveFileId builds .eq on drive_file_id", async () => {
    await queryIngestFailures({ limit: 101, driveFileId: "drive-1" });
    expect(calls).toContainEqual(["eq", "drive_file_id", "drive-1"]);
  });
});
