import { afterEach, describe, expect, test, vi } from "vitest";
import { resolveBotLoginAlertRow, BotLoginResolveInfraError } from "@/lib/reports/botLoginAlert";
import { runMaintenance } from "@/lib/notify/runNotify";
import { log } from "@/lib/log";

// The default resolver reads process.env.GITHUB_BOT_LOGIN directly, so every case stubs the
// env explicitly and restores after — never rely on the ambient CI/dev shell.
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// A minimal chainable fake of the service-role query builder used by the resolver.
function fakeClient(result: { error: { message: string } | null }) {
  const select = vi.fn(async () => result);
  const builder = {
    update: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    select,
  } as Record<string, unknown>;
  const from = vi.fn(() => builder);
  return { client: { from } as never, from, builder, select };
}

describe("resolveBotLoginAlertRow (default cron resolver)", () => {
  test("env unset → no client constructed, no Supabase call", async () => {
    vi.stubEnv("GITHUB_BOT_LOGIN", ""); // explicitly unset (empty → botLoginConfigured false)
    const makeClient = vi.fn();
    await resolveBotLoginAlertRow(makeClient as never);
    expect(makeClient).not.toHaveBeenCalled();
  });

  test("env set + clean → issues the targeted resolving UPDATE", async () => {
    vi.stubEnv("GITHUB_BOT_LOGIN", "fxav-bot");
    const f = fakeClient({ error: null });
    await resolveBotLoginAlertRow(() => f.client);
    expect(f.from).toHaveBeenCalledWith("admin_alerts");
    expect(f.builder.eq).toHaveBeenCalledWith("code", "GITHUB_BOT_LOGIN_MISSING");
    expect(f.builder.is).toHaveBeenCalledWith("show_id", null);
    expect(f.builder.is).toHaveBeenCalledWith("resolved_at", null);
  });

  test("env set + returned error → throws the typed BotLoginResolveInfraError (invariant 9)", async () => {
    vi.stubEnv("GITHUB_BOT_LOGIN", "fxav-bot");
    const f = fakeClient({ error: { message: "boom" } });
    await expect(resolveBotLoginAlertRow(() => f.client)).rejects.toBeInstanceOf(
      BotLoginResolveInfraError,
    );
  });
});

// Shared happy-path deps for the runMaintenance-level tests.
const okDeps = {
  readHeartbeat: async () => ({ kind: "ok" as const, heartbeat: new Date(0) }),
  detectAndResolveStall: (async () => ({ kind: "ok", opened: 0, resolved: 0 })) as never,
  resolveRecoveredSyncProblems: async () => ({ kind: "ok" as const }),
  reconcileEmailDeliveryState: (async () => ({ kind: "ok", opened: 0, resolved: 0 })) as never,
  getAlertOnSyncProblems: async () => ({ kind: "value" as const, enabled: false }),
  getAlertOnAutoPublish: async () => ({ kind: "value" as const, enabled: false }),
  getDailyReviewDigest: async () => ({ kind: "value" as const, enabled: false }),
  configValid: () => ({ ok: true, origin: "test" }) as const,
  now: new Date(0),
};

describe("runMaintenance invokes the bot-login resolver and fails open", () => {
  test("the injected resolver IS called once (proves the dep is wired, not ignored)", async () => {
    const resolveBotLoginAlert = vi.fn(async () => {});
    await runMaintenance({ ...okDeps, resolveBotLoginAlert });
    expect(resolveBotLoginAlert).toHaveBeenCalledTimes(1);
  });

  test("a throwing resolver is invoked, catch-logged, and does NOT collapse the run", async () => {
    const warn = vi.spyOn(log, "warn").mockImplementation(async () => {});
    const resolveBotLoginAlert = vi.fn(async () => {
      throw new BotLoginResolveInfraError(new Error("resolve blew up"));
    });
    const steps = await runMaintenance({ ...okDeps, resolveBotLoginAlert });
    expect(resolveBotLoginAlert).toHaveBeenCalledTimes(1); // invoked (not a forgotten wire)
    expect(warn).toHaveBeenCalled(); // catch-logged, not silent (invariant 9)
    // The 3 pre-existing steps are preserved (NOT collapsed to a single generic stall
    // infra_error, which is what an uncaught throw + safeMaintenance would produce).
    expect(steps.map((s) => s.step)).toEqual(["stall", "recovery", "emailDelivery"]);
    expect(steps.find((s) => s.step === "emailDelivery")?.result).toEqual({
      kind: "ok",
      opened: 0,
      resolved: 0,
    });
  });
});
