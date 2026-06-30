// tests/cron/cronRouteSummaries.test.ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { LogRecord } from "@/lib/log/types";

beforeEach(() => {
  process.env.CRON_SECRET = "secret";
});
afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

// Bare-function sink; CRON_RUN_SUMMARY rows have code at top level, outcome in context.
async function setSink(): Promise<LogRecord[]> {
  const sink: LogRecord[] = [];
  const log = await import("@/lib/log");
  log.setLogSink((record) => {
    sink.push(record);
  });
  return sink;
}
const authed = () =>
  ({
    headers: new Headers({ authorization: "Bearer secret", "x-vercel-id": "v1" }),
    url: "https://x/api/cron/sync",
  }) as never;
const unauthed = () => ({ headers: new Headers(), url: "https://x/api/cron/sync" }) as never;

describe("cron routes emit one CRON_RUN_SUMMARY per authorized run", () => {
  test("sync: authorized → one info summary; unauthorized → none", async () => {
    vi.resetModules();
    vi.doMock("@/lib/sync/runScheduledCronSync", () => ({
      runScheduledCronSync: async () => ({
        processed: [{ driveFileId: "d", result: { outcome: "applied" } }],
      }),
    }));
    vi.doMock("@/lib/sync/syncLog", () => ({ writeSyncLog: async () => {} }));
    const sink = await setSink();
    const { GET } = await import("@/app/api/cron/sync/route");
    const r = await GET(authed());
    expect(r.status).toBe(200);
    const summaries = sink.filter((s) => s.code === "CRON_RUN_SUMMARY");
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.source).toBe("cron.sync");
    expect(summaries[0]!.context).toMatchObject({ outcome: "ok" });

    const sink2 = await setSink(); // same cached @/lib/log instance → same activeSink the route uses
    const r2 = await GET(unauthed());
    expect(r2.status).toBe(401);
    expect(sink2.filter((s) => s.code === "CRON_RUN_SUMMARY")).toHaveLength(0);
  });

  // EVERY edited route must keep auth OUTSIDE the wrapper: a 401 emits no summary.
  // (Static import() specifiers so vite can resolve the module graph.)
  const ROUTES: Array<[string, () => Promise<{ GET: (r: never) => Promise<Response> }>]> = [
    ["sync", () => import("@/app/api/cron/sync/route")],
    ["keepalive", () => import("@/app/api/cron/keepalive/route")],
    ["notify", () => import("@/app/api/cron/notify/route")],
    ["refresh-watch", () => import("@/app/api/cron/refresh-watch/route")],
    ["gc-watch", () => import("@/app/api/cron/gc-watch/route")],
    ["asset-recovery", () => import("@/app/api/cron/asset-recovery/route")],
    ["diagram-gc", () => import("@/app/api/cron/diagram-gc/route")],
    ["report-reaper", () => import("@/app/api/cron/report-reaper/route")],
  ];
  test.each(ROUTES)(
    "%s: unauthorized (no Bearer) → 401 and NO CRON_RUN_SUMMARY",
    async (name, importRoute) => {
      vi.resetModules();
      const sink = await setSink();
      const { GET } = await importRoute();
      const r = await GET({ headers: new Headers(), url: `https://x/api/cron/${name}` } as never);
      expect(r.status).toBe(401);
      expect(sink.filter((s) => s.code === "CRON_RUN_SUMMARY")).toHaveLength(0);
    },
  );
  // If a route's module import fails on load-time deps in the test env, add a vi.doMock for
  // that orchestrator above the import — the 401 path never calls it, so a stub suffices.

  test("keepalive: authorized → one info summary (source cron.keepalive)", async () => {
    vi.resetModules();
    const sink = await setSink();
    const { GET } = await import("@/app/api/cron/keepalive/route");
    const r = await GET({
      headers: new Headers({ authorization: "Bearer secret", "x-vercel-id": "v1" }),
      url: "https://x/api/cron/keepalive",
    } as never);
    expect(r.status).toBe(200);
    const summaries = sink.filter((s) => s.code === "CRON_RUN_SUMMARY");
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.source).toBe("cron.keepalive");
    expect(summaries[0]!.context).toMatchObject({ outcome: "ok" });
  });

  test("refresh-watch: authorized → one ok summary with counts.refreshed", async () => {
    vi.resetModules();
    vi.doMock("@/lib/drive/watch", () => ({
      refreshWatchSubscriptions: async () => ({ refreshed: ["a", "b"] }),
      gcWatchChannels: async () => ({ stopped: [] }),
    }));
    const sink = await setSink();
    const { GET } = await import("@/app/api/cron/refresh-watch/route");
    const r = await GET({
      headers: new Headers({ authorization: "Bearer secret", "x-vercel-id": "v1" }),
      url: "https://x/api/cron/refresh-watch",
    } as never);
    expect(r.status).toBe(200);
    const summaries = sink.filter((s) => s.code === "CRON_RUN_SUMMARY");
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.source).toBe("cron.refresh-watch");
    expect(summaries[0]!.context).toMatchObject({ outcome: "ok", counts: { refreshed: 2 } });
  });

  test("gc-watch: authorized → one ok summary with counts.stopped", async () => {
    vi.resetModules();
    vi.doMock("@/lib/drive/watch", () => ({
      gcWatchChannels: async () => ({ stopped: ["x"] }),
      refreshWatchSubscriptions: async () => ({ refreshed: [] }),
    }));
    const sink = await setSink();
    const { GET } = await import("@/app/api/cron/gc-watch/route");
    const r = await GET({
      headers: new Headers({ authorization: "Bearer secret", "x-vercel-id": "v1" }),
      url: "https://x/api/cron/gc-watch",
    } as never);
    expect(r.status).toBe(200);
    const summaries = sink.filter((s) => s.code === "CRON_RUN_SUMMARY");
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.source).toBe("cron.gc-watch");
    expect(summaries[0]!.context).toMatchObject({ outcome: "ok", counts: { stopped: 1 } });
  });

  test("asset-recovery: a partial_failure item → one partial summary (source cron.asset-recovery)", async () => {
    vi.resetModules();
    vi.doMock("@/lib/sync/assetRecovery", () => ({
      runAssetRecoveryCron: async () => ({
        processed: [{ showId: "s", result: { outcome: "partial_failure" } }],
      }),
    }));
    const sink = await setSink();
    const { GET } = await import("@/app/api/cron/asset-recovery/route");
    const r = await GET({
      headers: new Headers({ authorization: "Bearer secret", "x-vercel-id": "v1" }),
      url: "https://x/api/cron/asset-recovery",
    } as never);
    expect(r.status).toBe(200);
    const summaries = sink.filter((s) => s.code === "CRON_RUN_SUMMARY");
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.source).toBe("cron.asset-recovery");
    expect(summaries[0]!.context).toMatchObject({ outcome: "partial" });
  });

  test("diagram-gc: authorized → one ok summary with the three delete counts", async () => {
    vi.resetModules();
    vi.doMock("@/lib/sync/diagramGc", () => ({
      runDiagramGc: async () => ({
        orphanBlobsDeleted: 1,
        pendingPrefixesDeleted: 2,
        promotedRowsDeleted: 3,
      }),
    }));
    const sink = await setSink();
    const { GET } = await import("@/app/api/cron/diagram-gc/route");
    const r = await GET({
      headers: new Headers({ authorization: "Bearer secret", "x-vercel-id": "v1" }),
      url: "https://x/api/cron/diagram-gc",
    } as never);
    expect(r.status).toBe(200);
    const summaries = sink.filter((s) => s.code === "CRON_RUN_SUMMARY");
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.source).toBe("cron.diagram-gc");
    expect(summaries[0]!.context).toMatchObject({
      outcome: "ok",
      counts: { orphanBlobsDeleted: 1, pendingPrefixesDeleted: 2, promotedRowsDeleted: 3 },
    });
  });

  test("report-reaper: clean run → one ok summary (source cron.report-reaper)", async () => {
    vi.resetModules();
    vi.doMock("postgres", () => ({
      default: () => ({
        begin: async (
          fn: (tx: {
            unsafe: (s: string, p?: unknown[]) => Promise<unknown[]>;
          }) => Promise<unknown>,
        ) => fn({ unsafe: async () => [] }),
        end: async () => {},
      }),
    }));
    const sink = await setSink();
    const { GET } = await import("@/app/api/cron/report-reaper/route");
    const r = await GET({
      headers: new Headers({ authorization: "Bearer secret", "x-vercel-id": "v1" }),
      url: "https://x/api/cron/report-reaper",
    } as never);
    expect(r.status).toBe(200);
    const summaries = sink.filter((s) => s.code === "CRON_RUN_SUMMARY");
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.source).toBe("cron.report-reaper");
    expect(summaries[0]!.context).toMatchObject({ outcome: "ok", counts: { deleted: 0 } });
  });

  test("report-reaper: ReportReaperInfraError → 500 and one infra summary", async () => {
    vi.resetModules();
    vi.doMock("postgres", () => ({
      default: () => ({
        begin: async () => {
          throw new Error("db down");
        },
        end: async () => {},
      }),
    }));
    const sink = await setSink();
    const { GET } = await import("@/app/api/cron/report-reaper/route");
    const r = await GET({
      headers: new Headers({ authorization: "Bearer secret", "x-vercel-id": "v1" }),
      url: "https://x/api/cron/report-reaper",
    } as never);
    expect(r.status).toBe(500);
    const summaries = sink.filter((s) => s.code === "CRON_RUN_SUMMARY");
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.source).toBe("cron.report-reaper");
    expect(summaries[0]!.context).toMatchObject({ outcome: "infra" });
  });

  test("notify: an infra_error delivery → 500 and one infra summary", async () => {
    vi.resetModules();
    vi.doMock("@/lib/notify/runNotify", () => ({
      runRealtimeNotify: async () => ({
        kind: "ok",
        maintenance: [],
        delivery: { kind: "infra_error", source: "x" },
      }),
      runDigestNotify: async () => ({
        kind: "ok",
        maintenance: [],
        delivery: { kind: "infra_error", source: "x" },
      }),
    }));
    const sink = await setSink();
    const { GET } = await import("@/app/api/cron/notify/route");
    const r = await GET({
      headers: new Headers({ authorization: "Bearer secret", "x-vercel-id": "v1" }),
      url: "https://x/api/cron/notify?job=realtime",
    } as never);
    expect(r.status).toBe(500);
    const summaries = sink.filter((s) => s.code === "CRON_RUN_SUMMARY");
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.source).toBe("cron.notify.realtime");
    expect(summaries[0]!.context).toMatchObject({ outcome: "infra" });
  });

  test("notify: unknown ?job= → 400 and NO summary (branch outside the wrapper)", async () => {
    vi.resetModules();
    // notify's orchestrator need not run for an unknown job; mock it as a no-op for safety.
    vi.doMock("@/lib/notify/runNotify", () => ({
      runRealtimeNotify: async () => ({
        kind: "ok",
        maintenance: [],
        delivery: { kind: "ok", sent: 0 },
      }),
      runDigestNotify: async () => ({
        kind: "ok",
        maintenance: [],
        delivery: { kind: "ok", sent: 0 },
      }),
    }));
    const sink = await setSink();
    const { GET } = await import("@/app/api/cron/notify/route");
    const r = await GET({
      headers: new Headers({ authorization: "Bearer secret" }),
      url: "https://x/api/cron/notify?job=bogus",
    } as never);
    expect(r.status).toBe(400);
    expect(sink.filter((s) => s.code === "CRON_RUN_SUMMARY")).toHaveLength(0);
  });

  // BOTH logical notify jobs must be distinctly sourced (a bad impl could emit cron.notify.realtime
  // for both, leaving digest health wrong). (Use the route's real orchestrator import name.)
  test.each([
    ["realtime", "cron.notify.realtime"],
    ["digest", "cron.notify.digest"],
  ])("notify ?job=%s → exactly one summary with source %s", async (job, source) => {
    vi.resetModules();
    vi.doMock("@/lib/notify/runNotify", () => ({
      runRealtimeNotify: async () => ({
        kind: "ok",
        maintenance: [],
        delivery: { kind: "ok", sent: 0 },
      }),
      runDigestNotify: async () => ({
        kind: "ok",
        maintenance: [],
        delivery: { kind: "ok", sent: 0 },
      }),
    }));
    const sink = await setSink();
    const { GET } = await import("@/app/api/cron/notify/route");
    const r = await GET({
      headers: new Headers({ authorization: "Bearer secret" }),
      url: `https://x/api/cron/notify?job=${job}`,
    } as never);
    expect(r.status).toBe(200);
    const summaries = sink.filter((s) => s.code === "CRON_RUN_SUMMARY");
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.source).toBe(source);
  });
});
