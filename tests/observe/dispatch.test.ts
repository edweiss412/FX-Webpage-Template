import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
  queryStagedParses: async () => ({ kind: "ok" as const, rows: [] }),
  queryIngestFailures: async () => ({ kind: "ok" as const, rows: [] }),
  queryPublishedWarnings: async () => ({ kind: "ok" as const, rows: [] }),
  querySyncLog: async () => ({ kind: "ok" as const, rows: [] }),
  queryDeferred: async () => ({ kind: "ok" as const, rows: [] }),
  queryWatchChannels: async () => ({ kind: "ok" as const, rows: [] }),
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

  // Task 8: staged/failures/warnings/synclog/deferred/watch CLI wiring.
  describe("new commands: routing, infra_error, PII warning, fail-closed", () => {
    test("staged routes parsed filters to queryStagedParses", async () => {
      let captured: unknown;
      const r = await runObserve(
        ["staged", "--session", "22222222-2222-4222-8222-222222222222", "--full"],
        {
          ...deps,
          queryStagedParses: async (filters) => {
            captured = filters;
            return { kind: "ok" as const, rows: [] };
          },
        },
      );
      expect(r.exitCode).toBe(0);
      expect((captured as { sessionId?: string }).sessionId).toBe(
        "22222222-2222-4222-8222-222222222222",
      );
    });
    test("staged infra_error → exit 1", async () => {
      const r = await runObserve(["staged"], {
        ...deps,
        queryStagedParses: async () => ({ kind: "infra_error" as const, message: "down" }),
      });
      expect(r.exitCode).toBe(1);
      expect(r.stderr).toContain("down");
    });
    test("staged --reveal-email → PII stderr warning; absent without the flag", async () => {
      const withFlag = await runObserve(["staged", "--reveal-email"], deps);
      expect(withFlag.stderr.toLowerCase()).toContain("pii");
      const withoutFlag = await runObserve(["staged"], deps);
      expect(withoutFlag.stderr).toBe("");
    });
    test("staged --session not-a-uuid: exit 1, query never called (fail-closed at dispatch)", async () => {
      const spy = { called: false };
      const r = await runObserve(["staged", "--session", "nope"], {
        ...deps,
        queryStagedParses: async () => {
          spy.called = true;
          return { kind: "ok" as const, rows: [] };
        },
      });
      expect(r.exitCode).toBe(1);
      expect(spy.called).toBe(false);
    });

    test("failures routes parsed filters to queryIngestFailures", async () => {
      let captured: unknown;
      const r = await runObserve(["failures", "--code", "SOME_CODE"], {
        ...deps,
        queryIngestFailures: async (filters) => {
          captured = filters;
          return { kind: "ok" as const, rows: [] };
        },
      });
      expect(r.exitCode).toBe(0);
      expect((captured as { code?: string }).code).toBe("SOME_CODE");
    });
    test("failures infra_error → exit 1", async () => {
      const r = await runObserve(["failures"], {
        ...deps,
        queryIngestFailures: async () => ({ kind: "infra_error" as const, message: "down" }),
      });
      expect(r.exitCode).toBe(1);
    });
    test("failures --reveal-email → PII stderr warning; absent without the flag", async () => {
      const withFlag = await runObserve(["failures", "--reveal-email"], deps);
      expect(withFlag.stderr.toLowerCase()).toContain("pii");
      const withoutFlag = await runObserve(["failures"], deps);
      expect(withoutFlag.stderr).toBe("");
    });

    test("warnings routes parsed filters to queryPublishedWarnings", async () => {
      let captured: unknown;
      const r = await runObserve(["warnings", "--show", "22222222-2222-4222-8222-222222222222"], {
        ...deps,
        queryPublishedWarnings: async (filters) => {
          captured = filters;
          return { kind: "ok" as const, rows: [] };
        },
      });
      expect(r.exitCode).toBe(0);
      expect((captured as { showId?: string }).showId).toBe("22222222-2222-4222-8222-222222222222");
    });
    test("warnings infra_error → exit 1", async () => {
      const r = await runObserve(["warnings"], {
        ...deps,
        queryPublishedWarnings: async () => ({ kind: "infra_error" as const, message: "down" }),
      });
      expect(r.exitCode).toBe(1);
    });
    test("warnings --reveal-email → PII stderr warning; absent without the flag", async () => {
      const withFlag = await runObserve(["warnings", "--reveal-email"], deps);
      expect(withFlag.stderr.toLowerCase()).toContain("pii");
      const withoutFlag = await runObserve(["warnings"], deps);
      expect(withoutFlag.stderr).toBe("");
    });

    test("synclog routes parsed filters to querySyncLog", async () => {
      let captured: unknown;
      const r = await runObserve(["synclog", "--status", "ok", "--file", "drive-abc"], {
        ...deps,
        querySyncLog: async (filters) => {
          captured = filters;
          return { kind: "ok" as const, rows: [] };
        },
      });
      expect(r.exitCode).toBe(0);
      expect((captured as { status?: string; driveFileId?: string }).status).toBe("ok");
      expect((captured as { status?: string; driveFileId?: string }).driveFileId).toBe("drive-abc");
    });
    test("synclog infra_error → exit 1", async () => {
      const r = await runObserve(["synclog"], {
        ...deps,
        querySyncLog: async () => ({ kind: "infra_error" as const, message: "down" }),
      });
      expect(r.exitCode).toBe(1);
    });
    test("synclog --reveal-email → PII stderr warning; absent without the flag", async () => {
      const withFlag = await runObserve(["synclog", "--reveal-email"], deps);
      expect(withFlag.stderr.toLowerCase()).toContain("pii");
      const withoutFlag = await runObserve(["synclog"], deps);
      expect(withoutFlag.stderr).toBe("");
    });

    test("deferred routes parsed filters to queryDeferred", async () => {
      let captured: unknown;
      const r = await runObserve(["deferred", "--limit", "5"], {
        ...deps,
        queryDeferred: async (filters) => {
          captured = filters;
          return { kind: "ok" as const, rows: [] };
        },
      });
      expect(r.exitCode).toBe(0);
      expect((captured as { limit?: number }).limit).toBe(5);
    });
    test("deferred infra_error → exit 1", async () => {
      const r = await runObserve(["deferred"], {
        ...deps,
        queryDeferred: async () => ({ kind: "infra_error" as const, message: "down" }),
      });
      expect(r.exitCode).toBe(1);
    });
    test("deferred --reveal-email → PII stderr warning; absent without the flag", async () => {
      const withFlag = await runObserve(["deferred", "--reveal-email"], deps);
      expect(withFlag.stderr.toLowerCase()).toContain("pii");
      const withoutFlag = await runObserve(["deferred"], deps);
      expect(withoutFlag.stderr).toBe("");
    });

    test("watch routes parsed filters to queryWatchChannels", async () => {
      let captured: unknown;
      const r = await runObserve(["watch", "--limit", "3"], {
        ...deps,
        queryWatchChannels: async (filters) => {
          captured = filters;
          return { kind: "ok" as const, rows: [] };
        },
      });
      expect(r.exitCode).toBe(0);
      expect((captured as { limit?: number }).limit).toBe(3);
    });
    test("watch infra_error → exit 1", async () => {
      const r = await runObserve(["watch"], {
        ...deps,
        queryWatchChannels: async () => ({ kind: "infra_error" as const, message: "down" }),
      });
      expect(r.exitCode).toBe(1);
    });
    test("watch never emits a PII warning, even if --reveal-email is passed", async () => {
      const r = await runObserve(["watch", "--reveal-email"], deps);
      expect(r.exitCode).toBe(0);
      expect(r.stderr).toBe("");
    });
  });
});

describe("--env validation applies mapped credentials at the query boundary (Task 9)", () => {
  const V = {
    VALIDATION_SUPABASE_URL: "https://vzakgrxqwcalbmagufjh.supabase.co",
    VALIDATION_SUPABASE_SECRET_KEY: "k",
    VALIDATION_SUPABASE_PROJECT_REF: "vzakgrxqwcalbmagufjh",
  };

  test("runObserve staged --env validation → process.env.SUPABASE_URL is the VALIDATION_* URL at call time", async () => {
    const savedUrl = process.env.SUPABASE_URL;
    const savedKey = process.env.SUPABASE_SECRET_KEY;
    try {
      let capturedUrl: string | undefined;
      const r = await runObserve(["staged", "--env", "validation"], {
        ...deps,
        env: V,
        queryStagedParses: async () => {
          capturedUrl = process.env.SUPABASE_URL;
          return { kind: "ok" as const, rows: [] };
        },
      });
      expect(r.exitCode).toBe(0);
      expect(capturedUrl).toBe(V.VALIDATION_SUPABASE_URL);
    } finally {
      if (savedUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = savedUrl;
      if (savedKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
      else process.env.SUPABASE_SECRET_KEY = savedKey;
    }
  });

  test("scripts/observe.ts: runTailFollow calls applyResolvedTarget before its first collectEvents (structural tail pin)", () => {
    const path = fileURLToPath(new URL("../../scripts/observe.ts", import.meta.url));
    const src = readFileSync(path, "utf8");
    const tailFnStart = src.indexOf("async function runTailFollow");
    expect(tailFnStart).toBeGreaterThan(-1);
    const applyIdx = src.indexOf("applyResolvedTarget", tailFnStart);
    const collectIdx = src.indexOf("collectEvents", tailFnStart);
    expect(applyIdx).toBeGreaterThan(-1);
    expect(collectIdx).toBeGreaterThan(-1);
    expect(applyIdx).toBeLessThan(collectIdx);
  });
});
