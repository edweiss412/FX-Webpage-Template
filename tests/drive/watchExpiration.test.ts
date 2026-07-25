// Spec: docs/superpowers/specs/observability/2026-07-25-watch-lease-slack-design.md §3.1, §5.2
//
// The defect this pins: `files.watch` was called with no `expiration`, so Drive
// granted its documented 1-hour default and the hourly renewal cron renewed each
// lease at the instant it expired (~1s of slack, measured on validation).
//
// DB-free by construction (tests/drive/** is the PARALLEL vitest project, run by
// unit-suite-nodb on a runner with no Supabase and no psql): the WatchTx is a
// local fake and the Drive client is mocked.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { setLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";
import type { WatchTx } from "@/lib/drive/watch";

const driveMock = {
  watchArgs: [] as Array<{ fileId?: string; requestBody?: Record<string, unknown> }>,
  expiration: "",
};

vi.mock("@/lib/drive/client", () => ({
  getDriveClient: () => ({
    files: {
      watch: async (args: { fileId?: string; requestBody?: Record<string, unknown> }) => {
        driveMock.watchArgs.push(args);
        return {
          data: {
            id: String(args.requestBody?.id ?? "channel-1"),
            resourceId: "resource-1",
            expiration: driveMock.expiration,
          },
        };
      },
    },
  }),
}));

// Minimal WatchTx: the success path touches only insertPending + activatePending.
// Every other member throws, so a path that unexpectedly reaches one fails loudly
// rather than silently no-opping.
function fakeTx(): WatchTx {
  const unexpected = (name: string) => async (): Promise<never> => {
    throw new Error(`unexpected WatchTx.${name} call`);
  };
  return {
    insertPending: async () => {},
    activatePending: async () => {},
    markOrphaned: unexpected("markOrphaned"),
    upsertAdminAlert: unexpected("upsertAdminAlert"),
    listExpiringActive: unexpected("listExpiringActive"),
    listGcCandidates: unexpected("listGcCandidates"),
    markStopped: unexpected("markStopped"),
    deleteOldStopped: unexpected("deleteOldStopped"),
    sweepStalePending: unexpected("sweepStalePending"),
    hasLiveActiveChannel: unexpected("hasLiveActiveChannel"),
    resolveStaleWebhookTokenInvalid: unexpected("resolveStaleWebhookTokenInvalid"),
  } as unknown as WatchTx;
}

let logRecords: LogRecord[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  // Deliberately NO vi.resetModules(): a reset would hand the dynamically
  // imported watch module a DIFFERENT @/lib/log instance than the one
  // setLogSink below wires, and every log assertion would silently see an
  // empty capture while the real log fired to the console.
  driveMock.watchArgs = [];
  // Drive echoes back what we asked for unless a test overrides it.
  driveMock.expiration = "";
  logRecords = [];
  setLogSink((record) => {
    logRecords.push(record);
  });
  process.env.DRIVE_WEBHOOK_BASE_URL = "https://crew.fxav.test";
});

afterEach(() => {
  setLogSink(() => {});
  delete process.env.DRIVE_WEBHOOK_BASE_URL;
});

const NOW_MS = Date.parse("2026-07-25T12:00:00.000Z");

describe("files.watch expiration request (§3.1)", () => {
  test("requests WATCH_TTL_MS ahead of now, as a millisecond timestamp string", async () => {
    const { WATCH_TTL_MS } = await import("@/lib/drive/watchErrors");
    driveMock.expiration = String(NOW_MS + WATCH_TTL_MS);
    const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");

    const result = await subscribeToWatchedFolder("folder-1", {
      tx: fakeTx(),
      uuid: () => "channel-1",
      webhookSecret: () => "secret-1",
      now: () => NOW_MS,
    });

    expect(result).toEqual({ outcome: "active", channelId: "channel-1" });
    expect(driveMock.watchArgs).toHaveLength(1);
    const body = driveMock.watchArgs[0]!.requestBody!;

    // Derived from the constant, never a literal: a seconds-vs-milliseconds
    // mistake here would request an expiry ~46 years in the past, and Drive
    // would silently hand back its 1h default again.
    expect(body.expiration).toBe(String(NOW_MS + WATCH_TTL_MS));
    expect(typeof body.expiration).toBe("string");

    // The pre-existing fields must survive the addition.
    expect(body).toMatchObject({
      id: "channel-1",
      type: "web_hook",
      address: "https://crew.fxav.test/api/drive/webhook",
      token: "secret-1",
    });
  });

  test("WATCH_TTL_MS is Google's documented maximum for the files resource", async () => {
    const { WATCH_TTL_MS } = await import("@/lib/drive/watchErrors");
    // https://developers.google.com/workspace/drive/api/guides/push —
    // "the maximum expiration time is 86400 seconds (1 day) … for the files resource"
    expect(WATCH_TTL_MS).toBe(86_400_000);
  });

  test("a shorter-than-requested grant is stored verbatim, not the requested value", async () => {
    // Drive is entitled to grant less than we ask for. The stored expiry must be
    // what Drive said, because the renewal predicate reasons about the real lease.
    const grantedMs = NOW_MS + 3_600_000;
    driveMock.expiration = String(grantedMs);
    const activated: Array<{ expiresAt: string }> = [];
    const tx = fakeTx();
    tx.activatePending = async (row) => {
      activated.push({ expiresAt: row.expiresAt });
    };
    const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");

    await subscribeToWatchedFolder("folder-1", {
      tx,
      uuid: () => "channel-1",
      webhookSecret: () => "secret-1",
      now: () => NOW_MS,
    });

    expect(activated).toEqual([{ expiresAt: new Date(grantedMs).toISOString() }]);
  });

  test("a grant already in the past is stored verbatim (clock skew is the predicate's problem)", async () => {
    const grantedMs = NOW_MS - 60_000;
    driveMock.expiration = String(grantedMs);
    const activated: Array<{ expiresAt: string }> = [];
    const tx = fakeTx();
    tx.activatePending = async (row) => {
      activated.push({ expiresAt: row.expiresAt });
    };
    const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");

    await subscribeToWatchedFolder("folder-1", {
      tx,
      uuid: () => "channel-1",
      webhookSecret: () => "secret-1",
      now: () => NOW_MS,
    });

    expect(activated).toEqual([{ expiresAt: new Date(grantedMs).toISOString() }]);
  });
});

describe("short-grant anomaly (§3.3)", () => {
  // A lease no longer than one sampling period cannot be renewed reliably at any
  // phase — no lead value fixes that, so it is surfaced rather than absorbed.
  // The boundary is `<=`: a lease of exactly one period, activated just after a
  // tick, expires AT the next examination rather than strictly before it.
  async function grantOf(ms: number): Promise<LogRecord[]> {
    driveMock.expiration = String(NOW_MS + ms);
    const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");
    await subscribeToWatchedFolder("folder-1", {
      tx: fakeTx(),
      uuid: () => "channel-1",
      webhookSecret: () => "secret-1",
      now: () => NOW_MS,
    });
    return logRecords.filter((r) => r.code === "DRIVE_WATCH_GRANT_TOO_SHORT");
  }

  test("fires at exactly one sampling period (the unsafe equality case)", async () => {
    const { SAMPLING_PERIOD_MS } = await import("@/lib/drive/watchErrors");
    const hits = await grantOf(SAMPLING_PERIOD_MS);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      level: "error",
      source: "drive.watch",
      code: "DRIVE_WATCH_GRANT_TOO_SHORT",
    });
    // Assert on the durable fields, not the message string.
    expect(hits[0]!.context).toMatchObject({
      watchedFolderId: "folder-1",
      grantedMs: SAMPLING_PERIOD_MS,
    });
  });

  test("fires at the period-plus-execution-budget boundary", async () => {
    const { SAMPLING_PERIOD_MS, T_EXEC_BUDGET_MS } = await import("@/lib/drive/watchErrors");
    expect(await grantOf(SAMPLING_PERIOD_MS + T_EXEC_BUDGET_MS)).toHaveLength(1);
  });

  test("does NOT fire one millisecond past the boundary", async () => {
    const { SAMPLING_PERIOD_MS, T_EXEC_BUDGET_MS } = await import("@/lib/drive/watchErrors");
    expect(await grantOf(SAMPLING_PERIOD_MS + T_EXEC_BUDGET_MS + 1)).toHaveLength(0);
  });

  test("does NOT fire for the 24h lease we request", async () => {
    const { WATCH_TTL_MS } = await import("@/lib/drive/watchErrors");
    expect(await grantOf(WATCH_TTL_MS)).toHaveLength(0);
  });
});
