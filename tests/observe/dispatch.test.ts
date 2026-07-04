import { describe, expect, test } from "vitest";
import { runObserve } from "@/scripts/observe";

const okEvents = async () => ({
  kind: "ok" as const,
  events: [],
  hasMore: false,
  nextCursor: null,
});
function ev(id: string) {
  return {
    id,
    occurredAt: "2026-07-03T00:00:00.000Z",
    level: "info" as const,
    source: "s",
    message: "m",
    code: null,
    requestId: null,
    showId: null,
    driveFileId: null,
    actorHash: null,
    context: {},
    showTitle: null,
    showSlug: null,
  };
}
const deps = {
  queryEvents: okEvents,
  getCronHealth: async () => ({ kind: "ok" as const, jobs: [] }),
  queryAlerts: async () => ({ kind: "ok" as const, alerts: [] }),
  queryChangeLog: async () => ({ kind: "ok" as const, changes: [] }),
  env: { SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SECRET_KEY: "k" },
  nowMs: 0,
};

describe("runObserve", () => {
  test("events ok → exit 0, table", async () => {
    const r = await runObserve(["events"], deps);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("(no rows)");
  });
  test("infra_error → exit 1", async () => {
    const r = await runObserve(["events"], {
      ...deps,
      queryEvents: async () => ({ kind: "infra_error" as const, message: "down" }),
    });
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("down");
  });
  test("codes never touches DB and ignores --env", async () => {
    let called = false;
    const r = await runObserve(["codes", "--env", "prod"], {
      ...deps,
      queryEvents: async () => {
        called = true;
        return okEvents();
      },
    });
    expect(called).toBe(false);
    expect(r.exitCode).toBe(0);
  });
  test("ambient prod URL without --env → refuse (exit 1)", async () => {
    const r = await runObserve(["events"], {
      ...deps,
      env: { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SECRET_KEY: "k" },
    });
    expect(r.exitCode).toBe(1);
    expect(r.stderr.toLowerCase()).toContain("refusing non-local");
  });

  // Codex whole-diff findings ↓
  test("--json infra_error → JSON {error} on stderr", async () => {
    const r = await runObserve(["events", "--json"], {
      ...deps,
      queryEvents: async () => ({ kind: "infra_error" as const, message: "down" }),
    });
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stderr)).toEqual({ error: "down" });
  });
  test("--json guardrail refusal is also JSON", async () => {
    const r = await runObserve(["events", "--json"], {
      ...deps,
      env: { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SECRET_KEY: "k" },
    });
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stderr)).toHaveProperty("error");
  });
  test("events --limit clamps to 500 (raw 1000 does not over-return)", async () => {
    const rows = Array.from({ length: 600 }, (_, i) => ev(`e${i}`));
    const r = await runObserve(["events", "--limit", "1000", "--json"], {
      ...deps,
      queryEvents: async () => ({
        kind: "ok" as const,
        events: rows,
        hasMore: false,
        nextCursor: null,
      }),
    });
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).length).toBe(500); // clamped, not 600
  });
  test("tail (non-follow) baseline defaults to 20 rows", async () => {
    const rows = Array.from({ length: 50 }, (_, i) => ev(`t${i}`));
    const r = await runObserve(["tail", "--json"], {
      ...deps,
      queryEvents: async () => ({
        kind: "ok" as const,
        events: rows,
        hasMore: false,
        nextCursor: null,
      }),
    });
    expect(r.exitCode).toBe(0);
    // tail --json emits NDJSON; count lines
    expect(r.stdout.trim().split("\n").length).toBe(20);
  });
  test("--help and no-args → usage on stdout, exit 0", async () => {
    const help = await runObserve(["--help"], deps);
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain("pnpm observe");
    const none = await runObserve([], deps);
    expect(none.exitCode).toBe(0);
    expect(none.stdout).toContain("pnpm observe");
  });
});
