import { describe, expect, test, vi } from "vitest";
import { runDigestNotify, type NotifyDeps } from "@/lib/notify/runNotify";
import type { DigestModel } from "@/lib/notify/digest";
import type { MonitorDigestModel } from "@/lib/notify/monitorDigest";

const NOW = new Date("2026-06-02T12:00:00.000Z"); // 8am ET — inside the digest window

const monitorModel: MonitorDigestModel = {
  windowStart: "2026-06-01T12:00:00.000Z",
  autoApplied: [{ showTitle: "East", slug: "east", items: ["Added Jane"] }],
  autofix: { total: 0, shows: [] },
  drift: [],
  newShowGaps: [],
};

function digestModel(recipient: string): DigestModel {
  return {
    recipient,
    dateET: "2026-06-02",
    shows: [{ showTitle: "S", slug: "s", items: ["x"] }],
    sourceTotals: { ingestions: 1, syncs: 0, shows: 1 },
  };
}

// Minimal happy-path deps; each test overrides what it needs.
function deps(over: Partial<NotifyDeps> = {}): NotifyDeps {
  return {
    runMaintenance: async () => [],
    configValid: () => ({ ok: true, origin: "https://crew.fxav.app" }),
    getDailyReviewDigest: async () => ({ kind: "value", enabled: true }),
    activeRecipients: async () => ({ kind: "ok", recipients: ["doug@fxav.net"] }),
    buildDigestModel: async () => ({
      kind: "no_send",
      sourceTotals: { ingestions: 0, syncs: 0, shows: 0 },
    }),
    buildMonitorDigestModel: async () => ({ kind: "ok", model: monitorModel }),
    deliverDigest: async () => ({ kind: "ok", sent: 1, failed: 0, skipped: 0, retryLater: 0 }),
    writeMonitorDigestWatermark: async () => ({ kind: "ok" }),
    ...over,
  };
}

describe("runDigestNotify — monitor wiring (spec §4.4, §5, §13.7)", () => {
  test("(a) needs-attention no_send + monitor ok → one email sent, watermark advanced once", async () => {
    const write = vi.fn(async () => ({ kind: "ok" as const }));
    const deliver = vi.fn(async () => ({
      kind: "ok" as const,
      sent: 1,
      failed: 0,
      skipped: 0,
      retryLater: 0,
    }));
    const r = await runDigestNotify({
      now: NOW,
      deps: deps({ writeMonitorDigestWatermark: write, deliverDigest: deliver }),
    });
    expect(r.delivery).toMatchObject({ kind: "ok", sent: 1 });
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(NOW);
  });

  test("(b) two recipients → buildMonitorDigestModel called ONCE, watermark advanced ONCE", async () => {
    const build = vi.fn(async () => ({ kind: "ok" as const, model: monitorModel }));
    const write = vi.fn(async () => ({ kind: "ok" as const }));
    await runDigestNotify({
      now: NOW,
      deps: deps({
        activeRecipients: async () => ({ kind: "ok", recipients: ["a@x.net", "b@x.net"] }),
        buildMonitorDigestModel: build,
        writeMonitorDigestWatermark: write,
      }),
    });
    expect(build).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
  });

  test("(c) delivery failed>0 → watermark NOT advanced", async () => {
    const write = vi.fn(async () => ({ kind: "ok" as const }));
    await runDigestNotify({
      now: NOW,
      deps: deps({
        deliverDigest: async () => ({ kind: "ok", sent: 0, failed: 1, skipped: 0, retryLater: 0 }),
        writeMonitorDigestWatermark: write,
      }),
    });
    expect(write).not.toHaveBeenCalled();
  });

  test("(c2) retryLater>0 → watermark NOT advanced", async () => {
    const write = vi.fn(async () => ({ kind: "ok" as const }));
    await runDigestNotify({
      now: NOW,
      deps: deps({
        deliverDigest: async () => ({ kind: "ok", sent: 0, failed: 0, skipped: 0, retryLater: 1 }),
        writeMonitorDigestWatermark: write,
      }),
    });
    expect(write).not.toHaveBeenCalled();
  });

  test("(d) monitor empty + needs-attention empty → no send, watermark unchanged", async () => {
    const write = vi.fn(async () => ({ kind: "ok" as const }));
    const deliver = vi.fn(async () => ({
      kind: "ok" as const,
      sent: 1,
      failed: 0,
      skipped: 0,
      retryLater: 0,
    }));
    const r = await runDigestNotify({
      now: NOW,
      deps: deps({
        buildMonitorDigestModel: async () => ({ kind: "empty" }),
        deliverDigest: deliver,
        writeMonitorDigestWatermark: write,
      }),
    });
    expect(deliver).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(r.delivery).toMatchObject({ kind: "ok", sent: 0 });
  });

  test("(e) watermark write infra_error after send → run is delivery infra_error", async () => {
    const r = await runDigestNotify({
      now: NOW,
      deps: deps({ writeMonitorDigestWatermark: async () => ({ kind: "infra_error" }) }),
    });
    expect(r.delivery).toMatchObject({
      kind: "infra_error",
      source: "writeMonitorDigestWatermark",
    });
  });

  test("(f) skipped does NOT block advance: sent>0, skipped>0, failed=0 → watermark advanced", async () => {
    const write = vi.fn(async () => ({ kind: "ok" as const }));
    await runDigestNotify({
      now: NOW,
      deps: deps({
        activeRecipients: async () => ({ kind: "ok", recipients: ["a@x.net", "b@x.net"] }),
        // A returns sent, B returns skipped (already-sent dedup).
        deliverDigest: vi
          .fn()
          .mockResolvedValueOnce({ kind: "ok", sent: 1, failed: 0, skipped: 0, retryLater: 0 })
          .mockResolvedValueOnce({ kind: "ok", sent: 0, failed: 0, skipped: 1, retryLater: 0 }),
        writeMonitorDigestWatermark: write,
      }),
    });
    expect(write).toHaveBeenCalledTimes(1);
  });

  test("(g) all recipients skipped, sent==0 → watermark NOT advanced", async () => {
    const write = vi.fn(async () => ({ kind: "ok" as const }));
    await runDigestNotify({
      now: NOW,
      deps: deps({
        deliverDigest: async () => ({ kind: "ok", sent: 0, failed: 0, skipped: 1, retryLater: 0 }),
        writeMonitorDigestWatermark: write,
      }),
    });
    expect(write).not.toHaveBeenCalled();
  });

  test("(h) monitor infra_error → needs-attention still sent, watermark untouched, run is infra_error", async () => {
    const write = vi.fn(async () => ({ kind: "ok" as const }));
    const deliver = vi.fn(async () => ({
      kind: "ok" as const,
      sent: 1,
      failed: 0,
      skipped: 0,
      retryLater: 0,
    }));
    const r = await runDigestNotify({
      now: NOW,
      deps: deps({
        buildMonitorDigestModel: async () => ({ kind: "infra_error" }),
        buildDigestModel: async (recipient) => ({ kind: "ok", model: digestModel(recipient) }),
        deliverDigest: deliver,
        writeMonitorDigestWatermark: write,
      }),
    });
    expect(deliver).toHaveBeenCalledTimes(1); // needs-attention NOT suppressed
    expect(write).not.toHaveBeenCalled();
    expect(r.delivery).toMatchObject({ kind: "infra_error", source: "buildMonitorDigestModel" });
  });
});
