import { describe, expect, test, vi } from "vitest";
import {
  runDigestNotify,
  runMaintenance,
  runRealtimeNotify,
  type NotifyDeps,
} from "@/lib/notify/runNotify";

function baseDeps(events: string[] = []): NotifyDeps {
  return {
    runMaintenance: async () => {
      events.push("maintenance");
      return [{ step: "stall", result: { kind: "ok" } }];
    },
    configValid: () => {
      events.push("config");
      return { ok: true, origin: "https://crew.fxav.app" };
    },
    getAlertOnSyncProblems: async () => {
      events.push("alert-toggle");
      return { kind: "value", enabled: true };
    },
    getDailyReviewDigest: async () => {
      events.push("digest-toggle");
      return { kind: "value", enabled: true };
    },
    activeRecipients: async () => {
      events.push("recipients");
      return { kind: "ok", recipients: ["doug@fxav.net"] };
    },
    listRealtimeCandidates: async () => {
      events.push("candidates");
      return { kind: "ok", candidates: [] };
    },
    deliverRealtimeCandidates: async () => {
      events.push("deliver-realtime");
      return { kind: "ok", sent: 0, failed: 0, skipped: 0, retryLater: 0 };
    },
    buildDigestModel: async () => {
      events.push("build-digest");
      return { kind: "no_send", sourceTotals: { ingestions: 0, syncs: 0, shows: 0 } };
    },
    deliverDigest: async () => {
      events.push("deliver-digest");
      return { kind: "ok", sent: 1 };
    },
  };
}

describe("runMaintenance", () => {
  test("runs every maintenance step sequentially and continues after infra errors", async () => {
    const events: string[] = [];
    const result = await runMaintenance({
      detectAndResolveStall: async () => {
        events.push("stall");
        return { kind: "infra_error" };
      },
      resolveRecoveredSyncProblems: async () => {
        events.push("recovery");
        return { kind: "ok" };
      },
      reconcileEmailDeliveryState: async () => {
        events.push("email");
        return { kind: "ok", opened: 0, resolved: 0 };
      },
      readHeartbeat: async () => {
        events.push("heartbeat");
        return { kind: "ok", heartbeat: null };
      },
      getAlertOnSyncProblems: async () => ({ kind: "value", enabled: true }),
      getDailyReviewDigest: async () => ({ kind: "value", enabled: false }),
      configValid: () => ({ ok: false }),
      now: new Date("2026-06-02T12:00:00.000Z"),
    });

    expect(events).toEqual(["heartbeat", "stall", "recovery", "email"]);
    expect(result).toEqual([
      { step: "stall", result: { kind: "infra_error" } },
      { step: "recovery", result: { kind: "ok" } },
      { step: "emailDelivery", result: { kind: "ok", opened: 0, resolved: 0 } },
    ]);
  });

  test("read/toggle thrown faults become maintenance infra_error results without throwing", async () => {
    await expect(
      runMaintenance({
        readHeartbeat: async () => {
          throw new Error("heartbeat query fault");
        },
        resolveRecoveredSyncProblems: async () => ({ kind: "ok" }),
        getAlertOnSyncProblems: async () => {
          throw new Error("toggle query fault");
        },
        getDailyReviewDigest: async () => ({ kind: "value", enabled: true }),
      }),
    ).resolves.toEqual([
      { step: "stall", result: { kind: "infra_error" } },
      { step: "recovery", result: { kind: "ok" } },
      { step: "emailDelivery", result: { kind: "infra_error" } },
    ]);
  });
});

describe("runRealtimeNotify", () => {
  test("runs maintenance before config and toggle gates", async () => {
    const events: string[] = [];

    const result = await runRealtimeNotify({ deps: baseDeps(events) });

    expect(result.kind).toBe("ok");
    expect(events).toEqual(["maintenance", "config", "alert-toggle", "recipients", "candidates"]);
  });

  test("maintenance infra errors do not abort gated delivery", async () => {
    const events: string[] = [];
    const deps = baseDeps(events);
    deps.runMaintenance = async () => {
      events.push("maintenance");
      return [{ step: "stall", result: { kind: "infra_error" } }];
    };
    deps.listRealtimeCandidates = async () => {
      events.push("candidates");
      return {
        kind: "ok",
        candidates: [
          {
            kind: "global",
            dedupKey: "global:SYNC_STALLED:1780000000123000",
            alertId: "alert-1",
            code: "SYNC_STALLED",
            raisedAt: new Date("2026-06-02T12:00:00.123Z"),
          },
        ],
      };
    };

    const result = await runRealtimeNotify({ deps });

    expect(events).toContain("deliver-realtime");
    expect(result).toMatchObject({
      kind: "ok",
      maintenance: [{ step: "stall", result: { kind: "infra_error" } }],
    });
  });

  test("recipient and candidate infra errors are recorded, not collapsed to clean no-work", async () => {
    const recipientResult = await runRealtimeNotify({
      deps: {
        ...baseDeps(),
        activeRecipients: async () => ({ kind: "infra_error" }),
      },
    });
    const candidateResult = await runRealtimeNotify({
      deps: {
        ...baseDeps(),
        listRealtimeCandidates: async () => ({ kind: "infra_error" }),
      },
    });

    expect(recipientResult).toMatchObject({
      kind: "ok",
      delivery: { kind: "infra_error", source: "activeRecipients" },
    });
    expect(candidateResult).toMatchObject({
      kind: "ok",
      delivery: { kind: "infra_error", source: "listRealtimeCandidates" },
    });
  });
});

describe("runDigestNotify", () => {
  test("runs maintenance before the ET-hour gate and all later gates", async () => {
    const events: string[] = [];

    const result = await runDigestNotify({
      now: new Date("2026-06-02T05:00:00.000Z"), // 1am ET, outside [7,10)
      deps: baseDeps(events),
    });

    expect(result).toMatchObject({ kind: "ok", delivery: { kind: "skipped", reason: "outside_digest_window" } });
    expect(events).toEqual(["maintenance"]);
  });

  test("runs digest gates in order inside [7,10) ET", async () => {
    const events: string[] = [];

    const result = await runDigestNotify({
      now: new Date("2026-06-02T12:00:00.000Z"), // 8am ET
      deps: baseDeps(events),
    });

    expect(result.kind).toBe("ok");
    expect(events).toEqual(["maintenance", "config", "digest-toggle", "recipients", "build-digest"]);
  });

  test("recipient and digest builder infra errors are recorded, not treated as zero recipients/items", async () => {
    const recipientResult = await runDigestNotify({
      now: new Date("2026-06-02T12:00:00.000Z"),
      deps: { ...baseDeps(), activeRecipients: async () => ({ kind: "infra_error" }) },
    });
    const digestResult = await runDigestNotify({
      now: new Date("2026-06-02T12:00:00.000Z"),
      deps: {
        ...baseDeps(),
        buildDigestModel: async () => ({ kind: "infra_error" }),
      },
    });

    expect(recipientResult).toMatchObject({
      kind: "ok",
      delivery: { kind: "infra_error", source: "activeRecipients" },
    });
    expect(digestResult).toMatchObject({
      kind: "ok",
      delivery: { kind: "infra_error", source: "buildDigestModel" },
    });
  });
});
