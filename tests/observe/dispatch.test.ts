import { describe, expect, test } from "vitest";
import { runObserve, tailErrorLine, isNewerEvent } from "@/scripts/observe";

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
  test("tailErrorLine: JSON object when --json, prefixed line otherwise", () => {
    expect(JSON.parse(tailErrorLine("down", true))).toEqual({ error: "down" });
    expect(tailErrorLine("down", false)).toBe("[tail] down");
  });
  test("isNewerEvent: keyset (occurredAt,id) comparison + null high", () => {
    const high = { occurredAt: "2026-07-03T00:00:00.000Z", id: "m" };
    expect(isNewerEvent({ occurredAt: "2026-07-03T00:00:00.000Z", id: "m" }, null)).toBe(true); // no high → newer
    expect(isNewerEvent({ occurredAt: "2026-07-04T00:00:00.000Z", id: "a" }, high)).toBe(true); // later ts
    expect(isNewerEvent({ occurredAt: "2026-07-03T00:00:00.000Z", id: "z" }, high)).toBe(true); // same ts, id>
    expect(isNewerEvent({ occurredAt: "2026-07-03T00:00:00.000Z", id: "m" }, high)).toBe(false); // equal → not newer
    expect(isNewerEvent({ occurredAt: "2026-07-02T00:00:00.000Z", id: "z" }, high)).toBe(false); // earlier ts
  });
  test("--help and no-args → usage on stdout, exit 0", async () => {
    const help = await runObserve(["--help"], deps);
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain("pnpm observe");
    const none = await runObserve([], deps);
    expect(none.exitCode).toBe(0);
    expect(none.stdout).toContain("pnpm observe");
  });

  // Task 9: --reveal-email → includePii + at-a-glance identity rendering.
  describe("alerts identity + --reveal-email", () => {
    const noPiiIdentity = {
      segments: [
        { label: "Show", value: "East Coast" },
        { label: "Crew", value: "Jamie Rivera" },
      ],
      global: false,
    };
    const withPiiIdentity = {
      segments: [
        { label: "Show", value: "East Coast" },
        { label: "Crew", value: "Jamie Rivera" },
        { label: "Email", value: "crew@fxav.test", pii: true },
      ],
      global: false,
    };
    function alertRow(identity: typeof noPiiIdentity) {
      return {
        id: "a1",
        showId: null,
        code: "SOME_CODE",
        raisedAt: "2026-07-03T00:00:00.000Z",
        lastSeenAt: "2026-07-03T00:00:00.000Z",
        occurrenceCount: 1,
        resolvedAt: null,
        resolvedBy: null,
        showTitle: null,
        showSlug: null,
        identity,
      };
    }

    test("default: no --reveal-email → includePii false/absent, identity shown, no raw email", async () => {
      let capturedFilters: unknown;
      const r = await runObserve(["alerts"], {
        ...deps,
        queryAlerts: async (filters) => {
          capturedFilters = filters;
          return { kind: "ok" as const, alerts: [alertRow(noPiiIdentity)] };
        },
      });
      expect(r.exitCode).toBe(0);
      // Identity segments render (at-a-glance).
      expect(r.stdout).toContain("Show: East Coast");
      expect(r.stdout).toContain("Crew: Jamie Rivera");
      // No raw email anywhere in output.
      expect(r.stdout).not.toContain("crew@fxav.test");
      // includePii not requested by default.
      expect((capturedFilters as { includePii?: boolean }).includePii).not.toBe(true);
    });

    test("--reveal-email → includePii true passed to queryAlerts, email rendered, stderr warns", async () => {
      let capturedFilters: unknown;
      const r = await runObserve(["alerts", "--reveal-email"], {
        ...deps,
        queryAlerts: async (filters) => {
          capturedFilters = filters;
          return { kind: "ok" as const, alerts: [alertRow(withPiiIdentity)] };
        },
      });
      expect(r.exitCode).toBe(0);
      expect((capturedFilters as { includePii?: boolean }).includePii).toBe(true);
      expect(r.stdout).toContain("crew@fxav.test");
      expect(r.stderr.toLowerCase()).toContain("pii");
    });

    test("--json default: no email segment, only AlertRow shape", async () => {
      const r = await runObserve(["alerts", "--json"], {
        ...deps,
        queryAlerts: async () => ({ kind: "ok" as const, alerts: [alertRow(noPiiIdentity)] }),
      });
      expect(r.exitCode).toBe(0);
      const parsed = JSON.parse(r.stdout) as Array<Record<string, unknown>>;
      expect(parsed).toHaveLength(1);
      const row = parsed[0];
      expect(row).toBeDefined();
      expect(JSON.stringify(row)).not.toContain("user_email");
      expect(JSON.stringify(row)).not.toContain("crew@fxav.test");
      expect(row).not.toHaveProperty("context");
      expect(row).not.toHaveProperty("resolution");
      expect(row?.identity).toEqual(noPiiIdentity);
    });

    test("unknown-flag-not-rejected: alerts --reveal-email parses cleanly (exit 0)", async () => {
      const r = await runObserve(["alerts", "--reveal-email"], {
        ...deps,
        queryAlerts: async () => ({ kind: "ok" as const, alerts: [] }),
      });
      expect(r.exitCode).toBe(0);
    });
  });
});
