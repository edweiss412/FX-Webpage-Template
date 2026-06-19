import { describe, expect, test, vi } from "vitest";
import {
  runDigestNotify,
  runMaintenance,
  runRealtimeNotify,
  type NotifyDeps,
} from "@/lib/notify/runNotify";
import type { DigestModel } from "@/lib/notify/digest";
import type { RealtimeCandidate } from "@/lib/notify/detect/candidates";

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
    getAlertOnAutoPublish: async () => {
      events.push("undo-toggle");
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
      return { kind: "ok", sent: 1, failed: 0, skipped: 0, retryLater: 0 };
    },
  };
}

function digestModel(recipient: string): DigestModel {
  return {
    recipient,
    dateET: "2026-06-02",
    shows: [{ showTitle: "Show One", slug: "show-one", items: ["Changes staged for review"] }],
    sourceTotals: { ingestions: 0, syncs: 1, shows: 1 },
  };
}

describe("runMaintenance", () => {
  test("runs every maintenance step sequentially, continues after infra errors, and maps clean toggles to known tri-states", async () => {
    const events: string[] = [];
    const reconcileInputs: unknown[] = [];
    const result = await runMaintenance({
      detectAndResolveStall: async () => {
        events.push("stall");
        return { kind: "infra_error" };
      },
      resolveRecoveredSyncProblems: async () => {
        events.push("recovery");
        return { kind: "ok" };
      },
      reconcileEmailDeliveryState: async (input) => {
        events.push("email");
        reconcileInputs.push(input);
        return { kind: "ok", opened: 0, resolved: 0 };
      },
      readHeartbeat: async () => {
        events.push("heartbeat");
        return { kind: "ok", heartbeat: null };
      },
      getAlertOnSyncProblems: async () => ({ kind: "value", enabled: true }),
      getAlertOnAutoPublish: async () => ({ kind: "value", enabled: true }),
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
    expect(reconcileInputs[0]).toMatchObject({
      alertOnSyncProblems: { kind: "enabled" },
      dailyReviewDigest: { kind: "disabled" },
      alertOnAutoPublish: { kind: "enabled" },
      configValid: false,
    });
  });

  test("a THROWN toggle read passes through as UNKNOWN (no coercion); reconciliation still runs and the step stays 5xx-visible", async () => {
    const reconcileInputs: unknown[] = [];
    await expect(
      runMaintenance({
        readHeartbeat: async () => {
          throw new Error("heartbeat query fault");
        },
        resolveRecoveredSyncProblems: async () => ({ kind: "ok" }),
        getAlertOnSyncProblems: async () => {
          throw new Error("toggle query fault");
        },
        getAlertOnAutoPublish: async () => ({ kind: "value", enabled: true }),
        getDailyReviewDigest: async () => ({ kind: "value", enabled: true }),
        reconcileEmailDeliveryState: async (input) => {
          reconcileInputs.push(input);
          return { kind: "ok", opened: 1, resolved: 2 };
        },
        configValid: () => ({ ok: true, origin: "https://crew.fxav.app" }),
      }),
    ).resolves.toEqual([
      { step: "stall", result: { kind: "infra_error" } },
      { step: "recovery", result: { kind: "ok" } },
      {
        step: "emailDelivery",
        result: {
          kind: "infra_error",
          toggleFaults: ["getAlertOnSyncProblems"],
          detail: { opened: 1, resolved: 2 },
        },
      },
    ]);
    // R5/R21 — the faulted channel reaches reconciliation as UNKNOWN (never
    // coerced to a boolean); the clean channels keep their known states.
    expect(reconcileInputs[0]).toMatchObject({
      alertOnSyncProblems: { kind: "unknown" },
      dailyReviewDigest: { kind: "enabled" },
      alertOnAutoPublish: { kind: "enabled" },
    });
  });

  test("an UNDO toggle fault is independent: clean channels reconcile normally, the fault source is typed (R5/R28)", async () => {
    const reconcileInputs: unknown[] = [];
    const result = await runMaintenance({
      readHeartbeat: async () => ({ kind: "ok", heartbeat: null }),
      detectAndResolveStall: async () => ({ kind: "ok" }),
      resolveRecoveredSyncProblems: async () => ({ kind: "ok" }),
      getAlertOnSyncProblems: async () => ({ kind: "value", enabled: true }),
      getAlertOnAutoPublish: async () => ({ kind: "infra_error" }),
      getDailyReviewDigest: async () => ({ kind: "value", enabled: false }),
      reconcileEmailDeliveryState: async (input) => {
        reconcileInputs.push(input);
        return { kind: "ok", opened: 0, resolved: 3 };
      },
      configValid: () => ({ ok: true, origin: "https://crew.fxav.app" }),
    });

    expect(result.at(-1)).toEqual({
      step: "emailDelivery",
      result: {
        kind: "infra_error",
        toggleFaults: ["getAlertOnAutoPublish"],
        detail: { opened: 0, resolved: 3 },
      },
    });
    expect(reconcileInputs[0]).toMatchObject({
      alertOnSyncProblems: { kind: "enabled" },
      dailyReviewDigest: { kind: "disabled" },
      alertOnAutoPublish: { kind: "unknown" },
    });
  });

  test("a reconciliation fault while toggles also faulted keeps the typed sources without inventing detail", async () => {
    const result = await runMaintenance({
      readHeartbeat: async () => ({ kind: "ok", heartbeat: null }),
      detectAndResolveStall: async () => ({ kind: "ok" }),
      resolveRecoveredSyncProblems: async () => ({ kind: "ok" }),
      getAlertOnSyncProblems: async () => ({ kind: "value", enabled: true }),
      getAlertOnAutoPublish: async () => ({ kind: "infra_error" }),
      getDailyReviewDigest: async () => ({ kind: "value", enabled: true }),
      reconcileEmailDeliveryState: async () => ({ kind: "infra_error" }),
      configValid: () => ({ ok: true, origin: "https://crew.fxav.app" }),
    });

    expect(result.at(-1)).toEqual({
      step: "emailDelivery",
      result: { kind: "infra_error", toggleFaults: ["getAlertOnAutoPublish"] },
    });
  });
});

describe("runRealtimeNotify", () => {
  test("runs maintenance before config and toggle gates", async () => {
    const events: string[] = [];

    const result = await runRealtimeNotify({ deps: baseDeps(events) });

    expect(result.kind).toBe("ok");
    expect(events).toEqual([
      "maintenance",
      "config",
      "alert-toggle",
      "undo-toggle",
      "recipients",
      "candidates",
    ]);
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

// ---------------------------------------------------------------------------
// M12.13 spec §4.2 — per-kind tri-state toggle gating. The four-row fault
// table verbatim (ok/ok, fault/ok, ok/fault, fault/fault) plus the
// only-one-kind-present variants and the deliberate-OFF vs infra-fault
// distinction (OFF → skip reason, NO toggleFaults, scheduler sees 200;
// fault → toggleFaults recorded, scheduler sees 5xx via statusFor).
// ---------------------------------------------------------------------------

function syncCandidate(): RealtimeCandidate {
  return {
    kind: "show",
    dedupKey: "00000000-0000-4000-8000-000000000011:SHEET_UNAVAILABLE:1780000000123000",
    alertId: "00000000-0000-4000-8000-000000000012",
    showId: "00000000-0000-4000-8000-000000000011",
    code: "SHEET_UNAVAILABLE",
    raisedAt: new Date("2026-06-02T12:00:00.123Z"),
    slug: "show-sync",
    showTitle: "Sync Show",
    contextSheetName: null,
  };
}

function undoCandidate(): RealtimeCandidate {
  return {
    kind: "auto_publish_undo",
    dedupKey: "00000000-0000-4000-8000-000000000021:abcdef0123456789",
    showId: "00000000-0000-4000-8000-000000000021",
    slug: "show-undo",
    showTitle: "Undo Show",
    token: "tok-undo-fixture",
    mintId: "abcdef0123456789",
    expiresAt: new Date("2026-06-13T12:00:00.000Z"),
  };
}

type GateToggle =
  | { kind: "value"; enabled: boolean }
  | { kind: "infra_error" }
  | { kind: "throws" };

async function runGated(opts: {
  sync: GateToggle;
  undo: GateToggle;
  candidates: RealtimeCandidate[];
}) {
  const events: string[] = [];
  const delivered: RealtimeCandidate[][] = [];
  const deps = baseDeps(events);
  deps.getAlertOnSyncProblems = async () => {
    if (opts.sync.kind === "throws") throw new Error("sync toggle query fault");
    return opts.sync;
  };
  deps.getAlertOnAutoPublish = async () => {
    if (opts.undo.kind === "throws") throw new Error("undo toggle query fault");
    return opts.undo;
  };
  deps.listRealtimeCandidates = async () => {
    events.push("candidates");
    return { kind: "ok", candidates: opts.candidates };
  };
  deps.deliverRealtimeCandidates = async (input) => {
    events.push("deliver-realtime");
    delivered.push(input.candidates);
    return { kind: "ok", sent: input.candidates.length, failed: 0, skipped: 0, retryLater: 0 };
  };
  const result = await runRealtimeNotify({ deps });
  return { result, events, delivered };
}

describe("runRealtimeNotify per-kind toggle gating (M12.13 §4.2)", () => {
  test("row 1 ok/ok both ON: every kind delivers", async () => {
    const { result, delivered } = await runGated({
      sync: { kind: "value", enabled: true },
      undo: { kind: "value", enabled: true },
      candidates: [syncCandidate(), undoCandidate()],
    });

    expect(result.delivery).toEqual({ kind: "ok", sent: 2, detail: expect.anything() });
    expect(delivered[0]?.map((c) => c.kind)).toEqual(["show", "auto_publish_undo"]);
  });

  test("row 1 ok/ok, sync ON + undo OFF: undo candidates dropped deliberately, sync delivers, no faults", async () => {
    const { result, delivered } = await runGated({
      sync: { kind: "value", enabled: true },
      undo: { kind: "value", enabled: false },
      candidates: [syncCandidate(), undoCandidate()],
    });

    expect(delivered[0]?.map((c) => c.kind)).toEqual(["show"]);
    expect(result.delivery.kind).toBe("ok");
    expect(result.delivery).not.toHaveProperty("toggleFaults");
  });

  test("row 1 ok/ok, sync OFF + undo ON: sync candidates dropped deliberately, undo delivers, no faults", async () => {
    const { result, delivered } = await runGated({
      sync: { kind: "value", enabled: false },
      undo: { kind: "value", enabled: true },
      candidates: [syncCandidate(), undoCandidate()],
    });

    expect(delivered[0]?.map((c) => c.kind)).toEqual(["auto_publish_undo"]);
    expect(result.delivery.kind).toBe("ok");
    expect(result.delivery).not.toHaveProperty("toggleFaults");
  });

  test("sync OFF + undo ON with only sync candidates: the EXISTING skip reason fires (dropped + nothing remained)", async () => {
    const { result, events } = await runGated({
      sync: { kind: "value", enabled: false },
      undo: { kind: "value", enabled: true },
      candidates: [syncCandidate()],
    });

    expect(result.delivery).toEqual({ kind: "skipped", reason: "alert_on_sync_problems_off" });
    expect(events).not.toContain("deliver-realtime");
  });

  test("sync ON + undo OFF with only undo candidates: the undo skip reason fires, no faults", async () => {
    const { result, events } = await runGated({
      sync: { kind: "value", enabled: true },
      undo: { kind: "value", enabled: false },
      candidates: [undoCandidate()],
    });

    expect(result.delivery).toEqual({ kind: "skipped", reason: "alert_on_auto_publish_off" });
    expect(events).not.toContain("deliver-realtime");
  });

  test("both toggles OFF: combined skip reason, no candidate/recipient work, 200-class result", async () => {
    const { result, events } = await runGated({
      sync: { kind: "value", enabled: false },
      undo: { kind: "value", enabled: false },
      candidates: [syncCandidate(), undoCandidate()],
    });

    expect(result.delivery).toEqual({
      kind: "skipped",
      reason: "alert_on_sync_problems_off+alert_on_auto_publish_off",
    });
    expect(events).not.toContain("recipients");
    expect(events).not.toContain("candidates");
    expect(events).not.toContain("deliver-realtime");
  });

  test("row 2 sync FAULT / undo ok: sync kinds dropped with typed source, undo still delivers", async () => {
    const { result, delivered } = await runGated({
      sync: { kind: "infra_error" },
      undo: { kind: "value", enabled: true },
      candidates: [syncCandidate(), undoCandidate()],
    });

    expect(delivered[0]?.map((c) => c.kind)).toEqual(["auto_publish_undo"]);
    expect(result.delivery).toMatchObject({
      kind: "ok",
      sent: 1,
      toggleFaults: ["getAlertOnSyncProblems"],
    });
  });

  test("row 2 variant, only sync candidates present: nothing delivers, fault still recorded (not a clean no-work)", async () => {
    const { result, events } = await runGated({
      sync: { kind: "infra_error" },
      undo: { kind: "value", enabled: true },
      candidates: [syncCandidate()],
    });

    expect(events).not.toContain("deliver-realtime");
    expect(result.delivery).toMatchObject({
      kind: "ok",
      sent: 0,
      toggleFaults: ["getAlertOnSyncProblems"],
    });
  });

  test("row 3 sync ok / undo FAULT: undo dropped FAIL-CLOSED with typed source, sync delivers", async () => {
    const { result, delivered } = await runGated({
      sync: { kind: "value", enabled: true },
      undo: { kind: "infra_error" },
      candidates: [syncCandidate(), undoCandidate()],
    });

    expect(delivered[0]?.map((c) => c.kind)).toEqual(["show"]);
    expect(result.delivery).toMatchObject({
      kind: "ok",
      sent: 1,
      toggleFaults: ["getAlertOnAutoPublish"],
    });
  });

  test("row 3 variant, only undo candidates present: bearer emails dropped fail-closed, fault recorded", async () => {
    const { result, events } = await runGated({
      sync: { kind: "value", enabled: true },
      undo: { kind: "infra_error" },
      candidates: [undoCandidate()],
    });

    expect(events).not.toContain("deliver-realtime");
    expect(result.delivery).toMatchObject({
      kind: "ok",
      sent: 0,
      toggleFaults: ["getAlertOnAutoPublish"],
    });
  });

  test("row 4 both FAULT: both kinds dropped, result carries BOTH sources, no delivery work attempted", async () => {
    const { result, events } = await runGated({
      sync: { kind: "infra_error" },
      undo: { kind: "infra_error" },
      candidates: [syncCandidate(), undoCandidate()],
    });

    expect(result.delivery).toEqual({
      kind: "infra_error",
      source: "getAlertOnSyncProblems+getAlertOnAutoPublish",
      toggleFaults: ["getAlertOnSyncProblems", "getAlertOnAutoPublish"],
    });
    expect(events).not.toContain("recipients");
    expect(events).not.toContain("candidates");
    expect(events).not.toContain("deliver-realtime");
  });

  test("THROWN getter faults gate per-kind (never the whole-pass infra_error)", async () => {
    const { result, delivered } = await runGated({
      sync: { kind: "throws" },
      undo: { kind: "value", enabled: true },
      candidates: [syncCandidate(), undoCandidate()],
    });

    expect(delivered[0]?.map((c) => c.kind)).toEqual(["auto_publish_undo"]);
    expect(result.delivery).toMatchObject({
      kind: "ok",
      toggleFaults: ["getAlertOnSyncProblems"],
    });
  });

  test("sync OFF + undo FAULT: nothing can deliver and the bearer-channel fault stays 5xx-visible", async () => {
    const { result, events } = await runGated({
      sync: { kind: "value", enabled: false },
      undo: { kind: "infra_error" },
      candidates: [syncCandidate(), undoCandidate()],
    });

    expect(result.delivery).toEqual({
      kind: "infra_error",
      source: "getAlertOnAutoPublish",
      toggleFaults: ["getAlertOnAutoPublish"],
    });
    expect(events).not.toContain("deliver-realtime");
  });
});

describe("runDigestNotify", () => {
  test("runs maintenance before the ET-hour gate and all later gates", async () => {
    const events: string[] = [];

    const result = await runDigestNotify({
      now: new Date("2026-06-02T05:00:00.000Z"), // 1am ET, outside [7,10)
      deps: baseDeps(events),
    });

    expect(result).toMatchObject({
      kind: "ok",
      delivery: { kind: "skipped", reason: "outside_digest_window" },
    });
    expect(events).toEqual(["maintenance"]);
  });

  test("runs digest gates in order inside [7,10) ET", async () => {
    const events: string[] = [];

    const result = await runDigestNotify({
      now: new Date("2026-06-02T12:00:00.000Z"), // 8am ET
      deps: baseDeps(events),
    });

    expect(result.kind).toBe("ok");
    expect(events).toEqual([
      "maintenance",
      "config",
      "digest-toggle",
      "recipients",
      "build-digest",
    ]);
  });

  test("delivers non-empty digest models through the ledger delivery contract and sums sent counts", async () => {
    const events: string[] = [];
    const delivered: Array<{ recipient: string; origin: string }> = [];

    const result = await runDigestNotify({
      now: new Date("2026-06-02T12:00:00.000Z"),
      deps: {
        ...baseDeps(events),
        activeRecipients: async () => ({
          kind: "ok",
          recipients: ["doug@fxav.net", "ops@fxav.net"],
        }),
        buildDigestModel: async (recipient) => {
          events.push(`build-digest:${recipient}`);
          return { kind: "ok", model: digestModel(recipient) };
        },
        deliverDigest: async (input) => {
          events.push(`deliver-digest:${input.model.recipient}`);
          delivered.push({ recipient: input.model.recipient, origin: input.origin });
          return { kind: "ok", sent: 1, failed: 0, skipped: 0, retryLater: 0 };
        },
      },
    });

    expect(result).toMatchObject({ kind: "ok", delivery: { kind: "ok", sent: 2 } });
    expect(delivered).toEqual([
      { recipient: "doug@fxav.net", origin: "https://crew.fxav.app" },
      { recipient: "ops@fxav.net", origin: "https://crew.fxav.app" },
    ]);
    expect(events).toEqual([
      "maintenance",
      "config",
      "digest-toggle",
      "build-digest:doug@fxav.net",
      "deliver-digest:doug@fxav.net",
      "build-digest:ops@fxav.net",
      "deliver-digest:ops@fxav.net",
    ]);
  });

  test("digest ledger delivery infra errors are reported from deliverDigest", async () => {
    const result = await runDigestNotify({
      now: new Date("2026-06-02T12:00:00.000Z"),
      deps: {
        ...baseDeps(),
        buildDigestModel: async (recipient) => ({ kind: "ok", model: digestModel(recipient) }),
        deliverDigest: async () => ({ kind: "infra_error" }),
      },
    });

    expect(result).toMatchObject({
      kind: "ok",
      delivery: { kind: "infra_error", source: "deliverDigest" },
    });
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
