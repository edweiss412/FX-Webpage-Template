import { afterEach, describe, expect, test, vi } from "vitest";
import { CRON_JOBS } from "@/lib/cron/runSummary";

const state = vi.hoisted(() => ({ error: null as { message: string } | null, throwOnFrom: false }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => {
    if (state.throwOnFrom)
      return {
        from() {
          throw new Error("boom");
        },
      };
    const b: Record<string, unknown> = {};
    const chain = () => b;
    b.from = chain;
    b.select = chain;
    b.eq = chain;
    b.order = chain;
    b.limit = () =>
      Promise.resolve({
        data: [
          {
            occurred_at: "2026-07-03T00:00:00.000Z",
            level: "info",
            context: { outcome: "ok", counts: { processed: 1 } },
          },
        ],
        error: state.error,
      });
    return b as never;
  },
}));
afterEach(() => {
  state.error = null;
  state.throwOnFrom = false;
  vi.resetModules();
});

describe("getCronHealth", () => {
  test("one job row per CRON_JOBS entry", async () => {
    const { getCronHealth } = await import("@/lib/observe/query/cronHealth");
    const r = await getCronHealth();
    if (r.kind !== "ok") throw new Error("infra");
    expect(r.jobs.length).toBe(CRON_JOBS.length);
    expect(r.jobs[0]).toMatchObject({ jobName: CRON_JOBS[0]!.jobName, outcome: "ok" });
  });
  test("returned {error} → infra_error", async () => {
    state.error = { message: "down" };
    const { getCronHealth } = await import("@/lib/observe/query/cronHealth");
    expect(await getCronHealth()).toMatchObject({ kind: "infra_error" });
  });
  test("thrown → infra_error", async () => {
    state.throwOnFrom = true;
    const { getCronHealth } = await import("@/lib/observe/query/cronHealth");
    expect(await getCronHealth()).toMatchObject({ kind: "infra_error" });
  });
});
