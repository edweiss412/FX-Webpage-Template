// Single-file executable behavioral coverage for admin mutation surfaces
// (invariant #10, spec §4.2/§9/§10.5). All state is INLINE — no separate
// recorder module (spec R11 F2 — a cross-file in-memory recorder is
// unreliable under Vitest's per-file isolation/workers/sharding).

import { afterEach, describe, expect, test } from "vitest";
import { setLogSink, resetLogSink } from "@/lib/log";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome"; // NOT re-exported from @/lib/log (verified live)
import type { LogRecord } from "@/lib/log";

// ── inline file-local recorder (single-file contract; no cross-file state) ──
const recorded = new Set<string>(); // "file::fn::code"
function recordAdminOutcomeBehavior(x: { file: string; fn: string; code: string }) {
  recorded.add(`${x.file}::${x.fn}::${x.code}`);
}

/** Drive a success path with a sink spy; return the codes observed. Captures codes even when
 * `run()` throws — required for `Promise<never>` redirect actions (Next's `redirect()` throws
 * a NEXT_REDIRECT error). The spy runs synchronously in the logger before the throw escapes. */
async function observeCodes(run: () => Promise<unknown>): Promise<string[]> {
  const codes: string[] = [];
  setLogSink((r: LogRecord) => {
    if (r.code) codes.push(r.code);
  });
  try {
    await run();
  } catch {
    /* redirect / expected throw — codes already captured */
  } finally {
    resetLogSink();
  }
  return codes;
}
afterEach(() => resetLogSink());

describe("behavioral scaffold smoke", () => {
  test("spy captures a code; recorder records; and codes survive a thrown (redirect-style) run", async () => {
    const codes = await observeCodes(() => logAdminOutcome({ code: "TEST_SMOKE", source: "t" }));
    expect(codes).toContain("TEST_SMOKE");
    recordAdminOutcomeBehavior({ file: "x", fn: "y", code: "TEST_SMOKE" });
    expect(recorded.has("x::y::TEST_SMOKE")).toBe(true);
    // redirect-style: emit then throw — the code must still be observed
    const thrown = await observeCodes(async () => {
      await logAdminOutcome({ code: "TEST_THROW", source: "t" });
      throw new Error("NEXT_REDIRECT");
    });
    expect(thrown).toContain("TEST_THROW");
  });
});
