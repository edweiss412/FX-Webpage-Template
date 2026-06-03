import { beforeEach, describe, expect, test, vi } from "vitest";
import { getAlertOnSyncProblems } from "@/lib/appSettings/getAlertOnSyncProblems";
import { getDailyReviewDigest } from "@/lib/appSettings/getDailyReviewDigest";

type QueryResult = { data: unknown; error: unknown };

const supabaseMock = vi.hoisted(() => ({
  throwOnConstruct: false,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => {
    if (supabaseMock.throwOnConstruct) {
      throw new Error("simulated construction fault");
    }
    return fakeClient({ data: null, error: null }).client;
  },
}));

function fakeClient(result: QueryResult) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as never, from, select, eq, maybeSingle };
}

function throwingClient() {
  const from = vi.fn(() => {
    throw new Error("query fault");
  });
  return { client: { from } as never, from };
}

describe("fail-closed app-settings notify toggles", () => {
  beforeEach(() => {
    supabaseMock.throwOnConstruct = false;
  });

  test("getAlertOnSyncProblems returns true only for a boolean true singleton value", async () => {
    const { client, from, select, eq } = fakeClient({
      data: { alert_on_sync_problems: true },
      error: null,
    });

    await expect(getAlertOnSyncProblems(client)).resolves.toEqual({
      kind: "value",
      enabled: true,
    });
    expect(from).toHaveBeenCalledWith("app_settings");
    expect(select).toHaveBeenCalledWith("alert_on_sync_problems");
    expect(eq).toHaveBeenCalledWith("id", "default");
  });

  test.each([
    ["missing row", null],
    ["non-boolean value", { alert_on_sync_problems: "true" }],
  ])("getAlertOnSyncProblems fail-closes on %s", async (_label, data) => {
    const { client } = fakeClient({ data, error: null });

    await expect(getAlertOnSyncProblems(client)).resolves.toEqual({
      kind: "value",
      enabled: false,
    });
  });

  test("getAlertOnSyncProblems returns infra_error for returned and thrown DB faults", async () => {
    await expect(
      getAlertOnSyncProblems(fakeClient({ data: null, error: { message: "boom" } }).client),
    ).resolves.toEqual({ kind: "infra_error" });

    await expect(getAlertOnSyncProblems(throwingClient().client)).resolves.toEqual({
      kind: "infra_error",
    });
  });

  test("getAlertOnSyncProblems returns infra_error for construction faults", async () => {
    supabaseMock.throwOnConstruct = true;

    await expect(getAlertOnSyncProblems()).resolves.toEqual({ kind: "infra_error" });
  });

  test("getDailyReviewDigest returns true only for a boolean true singleton value", async () => {
    const { client, from, select, eq } = fakeClient({
      data: { daily_review_digest: true },
      error: null,
    });

    await expect(getDailyReviewDigest(client)).resolves.toEqual({
      kind: "value",
      enabled: true,
    });
    expect(from).toHaveBeenCalledWith("app_settings");
    expect(select).toHaveBeenCalledWith("daily_review_digest");
    expect(eq).toHaveBeenCalledWith("id", "default");
  });

  test.each([
    ["missing row", null],
    ["non-boolean value", { daily_review_digest: "true" }],
  ])("getDailyReviewDigest fail-closes on %s", async (_label, data) => {
    const { client } = fakeClient({ data, error: null });

    await expect(getDailyReviewDigest(client)).resolves.toEqual({
      kind: "value",
      enabled: false,
    });
  });

  test("getDailyReviewDigest returns infra_error for returned and thrown DB faults", async () => {
    await expect(
      getDailyReviewDigest(fakeClient({ data: null, error: { message: "boom" } }).client),
    ).resolves.toEqual({ kind: "infra_error" });

    await expect(getDailyReviewDigest(throwingClient().client)).resolves.toEqual({
      kind: "infra_error",
    });
  });

  test("getDailyReviewDigest returns infra_error for construction faults", async () => {
    supabaseMock.throwOnConstruct = true;

    await expect(getDailyReviewDigest()).resolves.toEqual({ kind: "infra_error" });
  });
});
