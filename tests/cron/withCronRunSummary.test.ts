// tests/cron/withCronRunSummary.test.ts
import { describe, expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LogRecord } from "@/lib/log/types";

// The sink is a BARE FUNCTION (record, persist) => void. The wrapper's extra fields
// (jobName/outcome/durationMs/counts/detail) land in record.context; source/code/
// requestId are top-level record fields (see lib/log/logger.ts buildRecord).
async function withCapture(fn: (sink: LogRecord[]) => Promise<void>) {
  vi.resetModules();
  const sink: LogRecord[] = [];
  const log = await import("@/lib/log"); // dynamic import AFTER resetModules → same instance the wrapper imports
  log.setLogSink((record) => { sink.push(record); });
  try { await fn(sink); } finally { log.resetLogSink(); }
}

function req() {
  return { headers: new Headers({ "x-vercel-id": "vercel-abc" }) } as unknown as import("next/server").NextRequest;
}

describe("runCronRoute", () => {
  test("ok summary → log.info; record carries source/code columns + context.{jobName,outcome,durationMs,counts}", async () => {
    await withCapture(async (sink) => {
      const { runCronRoute } = await import("@/lib/cron/withCronRunSummary");
      const resp = new Response("ok", { status: 200 });
      const out = await runCronRoute("sync", req(), async () => ({
        response: resp, summary: { outcome: "ok", counts: { processed: 2 } },
      }));
      expect(out).toBe(resp); // exact response passthrough
      expect(sink).toHaveLength(1);
      expect(sink[0].level).toBe("info");
      expect(sink[0].source).toBe("cron.sync");
      expect(sink[0].code).toBe("CRON_RUN_SUMMARY");
      expect(sink[0].requestId).toBe("vercel-abc"); // ALS established from header
      expect(sink[0].context).toMatchObject({ jobName: "sync", outcome: "ok", counts: { processed: 2 } });
      expect(typeof sink[0].context.durationMs).toBe("number");
    });
  });

  test("partial → log.warn; infra → log.error", async () => {
    await withCapture(async (sink) => {
      const { runCronRoute } = await import("@/lib/cron/withCronRunSummary");
      await runCronRoute("a", req(), async () => ({ response: new Response(null), summary: { outcome: "partial" } }));
      await runCronRoute("b", req(), async () => ({ response: new Response(null), summary: { outcome: "infra" } }));
      expect(sink.map((s) => s.level)).toEqual(["warn", "error"]);
    });
  });

  test("handler throws → one error summary (context.outcome=threw) then re-throws (HTTP semantics preserved)", async () => {
    await withCapture(async (sink) => {
      const { runCronRoute } = await import("@/lib/cron/withCronRunSummary");
      const boom = new Error("boom");
      await expect(
        runCronRoute("sync", req(), async () => { throw boom; }),
      ).rejects.toBe(boom);
      expect(sink).toHaveLength(1);
      expect(sink[0].level).toBe("error");
      expect(sink[0].source).toBe("cron.sync");
      expect(sink[0].code).toBe("CRON_RUN_SUMMARY");
      expect(sink[0].context).toMatchObject({ outcome: "threw" });
    });
  });

  test("reuses an existing request context (idempotent ALS, single holder)", async () => {
    await withCapture(async (sink) => {
      const { runWithRequestContext } = await import("@/lib/log/requestContext");
      const { runCronRoute } = await import("@/lib/cron/withCronRunSummary");
      await runWithRequestContext({ requestId: "outer-id" }, async () => {
        await runCronRoute("sync", req(), async () => ({ response: new Response(null), summary: { outcome: "ok" } }));
      });
      expect(sink[0].requestId).toBe("outer-id"); // did NOT derive a new id
    });
  });

  test("AWAITS the emit before returning (serverless-freeze guarantee, §4.2.1 / AC6)", async () => {
    // A synchronous sink can't catch a missing `await`; use a PENDING sink and assert
    // runCronRoute does not resolve until the emit promise resolves.
    vi.resetModules();
    let released = false;
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = () => { released = true; r(); }; });
    const log = await import("@/lib/log");
    log.setLogSink(() => gate); // sink returns a pending promise (real Sink may return Promise<void>)
    const { runCronRoute } = await import("@/lib/cron/withCronRunSummary");
    let settled = false;
    const p = runCronRoute("sync", req(), async () => ({ response: new Response(null), summary: { outcome: "ok" } }));
    void p.then(() => { settled = true; });
    await new Promise((r) => setTimeout(r, 0)); // flush microtasks (real timers in this test)
    expect(settled).toBe(false); // has NOT returned — awaiting the emit
    release();
    await p;
    expect(released).toBe(true);
    log.resetLogSink();
  });

  test("source code uses literal log methods, never computed log[level] dispatch", () => {
    const src = readFileSync(join(__dirname, "..", "..", "lib/cron/withCronRunSummary.ts"), "utf8");
    expect(src).not.toMatch(/log\s*\[/); // no log[...] computed access
    expect(src).toMatch(/log\.error\s*\(/);
    expect(src).toMatch(/log\.warn\s*\(/);
    expect(src).toMatch(/log\.info\s*\(/);
  });
});
