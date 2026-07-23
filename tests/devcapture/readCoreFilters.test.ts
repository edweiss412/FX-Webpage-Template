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
  it("showIdOrGlobal builds the show-or-global .or clause", async () => {
    await queryAlerts({ openOnly: true, limit: 101, showIdOrGlobal: "abc-id" });
    expect(calls).toContainEqual(["or", "show_id.eq.abc-id,show_id.is.null"]);
  });
  it("driveFileId builds .eq on drive_file_id", async () => {
    await queryIngestFailures({ limit: 101, driveFileId: "drive-1" });
    expect(calls).toContainEqual(["eq", "drive_file_id", "drive-1"]);
  });
});
