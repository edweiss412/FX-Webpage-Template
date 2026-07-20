import { afterAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cleanupRuns, mkRun, readCalls, readResult, runGuard, writeScenario } from "./harness";

afterAll(cleanupRuns);

const TTL_LINE = "ERROR codex_models_manager::manager: failed to renew cache TTL: missing field 'supports_reasoning_summaries'\n";

describe("codex-guard recovery ladder (§6)", () => {
  it("scenario 7: three transient failures → attempts_exhausted, recovery retry/retry/null", async () => {
    const run = mkRun();
    writeScenario(run, [
      { onCall: 1, actions: [{ type: "stderr", text: "boom1\n" }, { type: "exit", code: 1 }] },
      { onCall: 2, actions: [{ type: "stderr", text: "boom2\n" }, { type: "exit", code: 1 }] },
      { onCall: 3, actions: [{ type: "stderr", text: "boom3\n" }, { type: "exit", code: 1 }] },
    ]);
    const res = await runGuard(run);
    expect(res.code).toBe(0);
    const r = readResult(run);
    expect(r.status).toBe("no_verdict");
    expect(r.failureReason).toBe("attempts_exhausted");
    expect(r.attempts.map((a) => a.recovery)).toEqual(["retry", "retry", null]);
    expect(readCalls(run)).toHaveLength(3);
    for (const a of r.attempts) expect(a.failureShape).toBe("nonzero_exit");
  });

  it("scenario 15: admission gate blocks rung side effects — cache intact, no backup", async () => {
    const run = mkRun();
    // attempt 1 fails FAST with the TTL signature on stderr
    writeScenario(run, [{ onCall: 1, actions: [{ type: "stderr", text: TTL_LINE }, { type: "exit", code: 1 }] }]);
    // admission demands more seconds than can remain after ANY attempt: minAdmission > total
    const res = await runGuard(run, [], { CODEX_GUARD_MIN_ADMISSION_SECS: "30", CODEX_GUARD_TOTAL_MAX_SECS: "20" });
    expect(res.code).toBe(0);
    const r = readResult(run);
    expect(r.failureReason).toBe("total_timeout");
    expect(r.attempts).toHaveLength(1);
    expect(r.attempts[0]!.recovery).toBeNull(); // rung never selected
    expect(existsSync(join(run.codexHome, "models_cache.json"))).toBe(true);
    expect(existsSync(join(run.outDir, "models_cache.bak.json"))).toBe(false);
  });
});
