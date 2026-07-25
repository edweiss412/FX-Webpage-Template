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
//
// CAVEAT: the `as unknown as WatchTx` cast below means TypeScript does NOT check
// these member names against the real port. A stale name here compiles and runs
// as dead weight — which is exactly how a `listExpiringActive` stub outlived the
// rename to `listRenewalDue`. When the port changes, grep this file explicitly;
// the compiler will not do it for you.
function fakeTx(): WatchTx {
  const unexpected = (name: string) => async (): Promise<never> => {
    throw new Error(`unexpected WatchTx.${name} call`);
  };
  return {
    insertPending: async () => {},
    activatePending: async () => {},
    markOrphaned: unexpected("markOrphaned"),
    upsertAdminAlert: unexpected("upsertAdminAlert"),
    listRenewalDue: unexpected("listRenewalDue"),
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
  // `remainingAtActivationMs` is what the check must use — NOT the nominal grant.
  // `elapsedMs` models time consumed by the pending insert plus the Drive
  // round-trip, so the two are deliberately different numbers.
  async function grantOf(remainingAtActivationMs: number, elapsedMs = 0): Promise<LogRecord[]> {
    driveMock.expiration = String(NOW_MS + elapsedMs + remainingAtActivationMs);
    const clock = [NOW_MS, NOW_MS + elapsedMs];
    let call = 0;
    const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");
    await subscribeToWatchedFolder("folder-1", {
      tx: fakeTx(),
      uuid: () => "channel-1",
      webhookSecret: () => "secret-1",
      now: () => clock[Math.min(call++, clock.length - 1)]!,
    });
    return logRecords.filter((r) => r.code === "DRIVE_WATCH_GRANT_TOO_SHORT");
  }

  test("fires at exactly one sampling period (well inside the unsafe band)", async () => {
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
      remainingMsAtActivation: SAMPLING_PERIOD_MS,
    });
  });

  test("fires at the boundary, P + 2T", async () => {
    const { SAMPLING_PERIOD_MS, T_EXEC_BUDGET_MS } = await import("@/lib/drive/watchErrors");
    expect(await grantOf(SAMPLING_PERIOD_MS + 2 * T_EXEC_BUDGET_MS)).toHaveLength(1);
  });

  test("STILL fires at P + T — being examined is not the same as completing", async () => {
    // The regression this pins: a lease with P+T+1ms at activation is examined
    // with 1ms left, which cannot cover a files.watch round-trip plus
    // activation. The completion budget is why the bound is P + 2T, not P + T.
    const { SAMPLING_PERIOD_MS, T_EXEC_BUDGET_MS } = await import("@/lib/drive/watchErrors");
    expect(await grantOf(SAMPLING_PERIOD_MS + T_EXEC_BUDGET_MS + 1)).toHaveLength(1);
  });

  test("does NOT fire one millisecond past P + 2T", async () => {
    const { SAMPLING_PERIOD_MS, T_EXEC_BUDGET_MS } = await import("@/lib/drive/watchErrors");
    expect(await grantOf(SAMPLING_PERIOD_MS + 2 * T_EXEC_BUDGET_MS + 1)).toHaveLength(0);
  });

  test("does NOT fire for the 24h lease we request", async () => {
    const { WATCH_TTL_MS } = await import("@/lib/drive/watchErrors");
    expect(await grantOf(WATCH_TTL_MS)).toHaveLength(0);
  });
  test("measures remaining life AT ACTIVATION, not the nominal grant (§3.3)", async () => {
    const { SAMPLING_PERIOD_MS, T_EXEC_BUDGET_MS } = await import("@/lib/drive/watchErrors");
    // Nominal grant is comfortably past the boundary, but the pending insert and
    // the Drive round-trip consume two minutes, leaving exactly the boundary.
    // A request-time measurement would call this safe; an activation-time one
    // must not.
    const elapsed = 120_000;
    const hits = await grantOf(SAMPLING_PERIOD_MS + 2 * T_EXEC_BUDGET_MS, elapsed);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.context).toMatchObject({
      remainingMsAtActivation: SAMPLING_PERIOD_MS + 2 * T_EXEC_BUDGET_MS,
    });
  });

  test("T_EXEC_BUDGET_MS matches the scheduler's request budget, not a guess", async () => {
    const { T_EXEC_BUDGET_MS } = await import("@/lib/drive/watchErrors");
    // files.watch carries no timeout and renewals run sequentially, so the only
    // defensible ceiling is pg_net's timeout_milliseconds = 300000
    // (supabase/migrations/20260527000003_schedule_cron_jobs.sql:15-22).
    expect(T_EXEC_BUDGET_MS).toBe(300_000);
  });
});

describe("post-activation observability cannot change the outcome (§3.3)", () => {
  // Whole-diff R1 finding 1: the anomaly clock read and its log sit AFTER a
  // committed activation. If either throws and it is not isolated, the outer
  // catch raises WATCH_CHANNEL_ORPHANED and returns "orphaned" for a channel
  // that is genuinely live — and markOrphaned only touches `status='pending'`
  // rows, so the DB would disagree with both the alert and the return value.

  test("a throwing clock on the post-activation read still returns active, with no orphan alert", async () => {
    driveMock.expiration = String(NOW_MS + 86_400_000);
    const tx = fakeTx();
    let orphanAlerts = 0;
    tx.upsertAdminAlert = async () => {
      orphanAlerts += 1;
    };
    let call = 0;
    const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");

    const result = await subscribeToWatchedFolder("folder-1", {
      tx,
      uuid: () => "channel-1",
      webhookSecret: () => "secret-1",
      now: () => {
        // First read builds the request body; the second is the activation-edge
        // measurement, which is the one that must not be able to break us.
        if (call++ === 0) return NOW_MS;
        throw new Error("clock exploded after commit");
      },
    });

    expect(result).toEqual({ outcome: "active", channelId: "channel-1" });
    expect(orphanAlerts).toBe(0);
  });

  test("a rejecting log sink still returns active, with no orphan alert", async () => {
    // A lease short enough to TRIGGER the anomaly, so the failing sink is
    // actually reached rather than skipped.
    const { SAMPLING_PERIOD_MS, T_EXEC_BUDGET_MS } = await import("@/lib/drive/watchErrors");
    driveMock.expiration = String(NOW_MS + SAMPLING_PERIOD_MS);
    const tx = fakeTx();
    let orphanAlerts = 0;
    tx.upsertAdminAlert = async () => {
      orphanAlerts += 1;
    };
    setLogSink((record) => {
      logRecords.push(record);
      if (record.code === "DRIVE_WATCH_GRANT_TOO_SHORT") throw new Error("sink rejected");
    });
    const { subscribeToWatchedFolder } = await import("@/lib/drive/watch");

    const result = await subscribeToWatchedFolder("folder-1", {
      tx,
      uuid: () => "channel-1",
      webhookSecret: () => "secret-1",
      now: () => NOW_MS,
    });

    expect(result).toEqual({ outcome: "active", channelId: "channel-1" });
    expect(orphanAlerts).toBe(0);
    // The anomaly was genuinely reached — otherwise this test proves nothing.
    expect(logRecords.filter((r) => r.code === "DRIVE_WATCH_GRANT_TOO_SHORT")).toHaveLength(1);
    expect(SAMPLING_PERIOD_MS + 2 * T_EXEC_BUDGET_MS).toBeGreaterThan(SAMPLING_PERIOD_MS);
  });
});

describe("renewalLeadMs is the single definition of the lead (§2.1)", () => {
  // Whole-diff R1 finding 4: the helper existed with no consumer and no test,
  // while the fake claimed to reuse it and restated the arithmetic instead.
  test("takes the proportional term when it exceeds the floor", async () => {
    const { renewalLeadMs, RENEWAL_LIFE_FRACTION, RENEWAL_MIN_LEAD_MS, WATCH_TTL_MS } =
      await import("@/lib/drive/watchErrors");
    const proportional = WATCH_TTL_MS * (1 - RENEWAL_LIFE_FRACTION);
    expect(proportional).toBeGreaterThan(RENEWAL_MIN_LEAD_MS);
    expect(renewalLeadMs(WATCH_TTL_MS)).toBe(proportional);
  });

  test("takes the floor when the proportional term is smaller", async () => {
    const { renewalLeadMs, RENEWAL_LIFE_FRACTION, RENEWAL_MIN_LEAD_MS } =
      await import("@/lib/drive/watchErrors");
    const sixHours = 6 * 3_600_000;
    expect(sixHours * (1 - RENEWAL_LIFE_FRACTION)).toBeLessThan(RENEWAL_MIN_LEAD_MS);
    expect(renewalLeadMs(sixHours)).toBe(RENEWAL_MIN_LEAD_MS);
  });

  test("is total over nonsense input", async () => {
    const { renewalLeadMs, RENEWAL_MIN_LEAD_MS } = await import("@/lib/drive/watchErrors");
    expect(renewalLeadMs(Number.NaN)).toBe(RENEWAL_MIN_LEAD_MS);
    expect(renewalLeadMs(Number.POSITIVE_INFINITY)).toBe(RENEWAL_MIN_LEAD_MS);
    expect(renewalLeadMs(-1)).toBe(RENEWAL_MIN_LEAD_MS);
    expect(renewalLeadMs(0)).toBe(RENEWAL_MIN_LEAD_MS);
  });

  test("the heuristic threshold is ordered correctly against the renewal lead", async () => {
    // The phase sweep this replaces modelled an idealized tick series and could
    // not fail for any realistic input (whole-diff R3 finding 2): it never
    // constrained the first tick to fall after activation, and its shortest
    // grant was not the boundary it claimed to exercise. Rather than repair a
    // model of a guarantee the constants cannot deliver (R3 finding 1), assert
    // the ordering that actually matters and is enforceable.
    const {
      renewalLeadMs,
      SAMPLING_PERIOD_MS,
      T_EXEC_BUDGET_MS,
      RENEWAL_MIN_LEAD_MS,
      WATCH_TTL_MS,
    } = await import("@/lib/drive/watchErrors");

    // The lease we actually request is renewed with hours to spare — that, not
    // the heuristic, is where the safety comes from.
    expect(renewalLeadMs(WATCH_TTL_MS)).toBeGreaterThan(SAMPLING_PERIOD_MS + 2 * T_EXEC_BUDGET_MS);

    // The floor alone already exceeds the heuristic threshold, so any lease long
    // enough to be governed by the floor is comfortably clear of it.
    expect(RENEWAL_MIN_LEAD_MS).toBeGreaterThan(SAMPLING_PERIOD_MS + 2 * T_EXEC_BUDGET_MS);

    // And the heuristic sits above one bare sampling period, so a lease that
    // could only ever be seen once is still flagged.
    expect(SAMPLING_PERIOD_MS + 2 * T_EXEC_BUDGET_MS).toBeGreaterThan(SAMPLING_PERIOD_MS);
  });
});
