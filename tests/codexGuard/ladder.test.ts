import { afterAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { cleanupRuns, mkRun, readCalls, readResult, runGuard, writeScenario } from "./harness";

afterAll(cleanupRuns);

const TTL_LINE =
  "ERROR codex_models_manager::manager: failed to renew cache TTL: missing field 'supports_reasoning_summaries'\n";

describe("codex-guard recovery ladder (§6)", () => {
  it("scenario 7: three transient failures → attempts_exhausted, recovery retry/retry/null", async () => {
    const run = mkRun();
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "stderr", text: "boom1\n" },
          { type: "exit", code: 1 },
        ],
      },
      {
        onCall: 2,
        actions: [
          { type: "stderr", text: "boom2\n" },
          { type: "exit", code: 1 },
        ],
      },
      {
        onCall: 3,
        actions: [
          { type: "stderr", text: "boom3\n" },
          { type: "exit", code: 1 },
        ],
      },
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

  it("scenario 3: TTL stderr fires rung once; cap holds even with cache recreated", async () => {
    const run = mkRun();
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "stderr", text: TTL_LINE },
          { type: "exit", code: 0 },
        ],
      }, // no -o → failed
      {
        onCall: 2,
        actions: [
          { type: "writeFile", path: "$CODEX_HOME/models_cache.json", text: '{"recreated":true}' }, // deterministic
          { type: "stderr", text: TTL_LINE },
          { type: "exit", code: 0 },
        ],
      },
      {
        onCall: 3,
        actions: [
          { type: "lastMessage", text: "VERDICT: APPROVE\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    const res = await runGuard(run);
    expect(res.code).toBe(0);
    const r = readResult(run);
    expect(r.status).toBe("verdict");
    expect(r.attempts.map((a) => a.recovery)).toEqual(["cache_ttl", "retry", null]); // cap: 2nd TTL → retry
    expect(readFileSync(join(run.outDir, "models_cache.bak.json"), "utf8")).toContain("stub");
    expect(JSON.parse(readFileSync(join(run.codexHome, "models_cache.json"), "utf8"))).toEqual({
      recreated: true,
    }); // recreated file NOT deleted again
  });

  it("scenario 3b: TTL signature on stdout only → rung NOT fired, no backup", async () => {
    const run = mkRun();
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "stdout", text: TTL_LINE },
          { type: "exit", code: 1 },
        ],
      },
      {
        onCall: 2,
        actions: [
          { type: "lastMessage", text: "VERDICT: APPROVE\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    const res = await runGuard(run);
    expect(res.code).toBe(0);
    const r = readResult(run);
    expect(r.status).toBe("verdict");
    expect(r.attempts.map((a) => a.recovery)).toEqual(["retry", null]); // signature-matching reads ONLY stderr
    expect(existsSync(join(run.outDir, "models_cache.bak.json"))).toBe(false);
    expect(existsSync(join(run.codexHome, "models_cache.json"))).toBe(true);
  });

  it("scenario 4: resume argv exact, cwd=--cwd, decoy sid in EARLIER attempt ignored", async () => {
    const run = mkRun();
    const decoySid = "00000000-0000-4000-8000-000000000000";
    const realSid = "12345678-90ab-4cde-8f01-234567890abc";
    mkdirSync(join(run.codexHome, "sessions", "zzz"), { recursive: true }); // decoy sessions dir
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "stdout", text: `session id: ${decoySid}\n` },
          { type: "stderr", text: "transient\n" },
          { type: "exit", code: 1 },
        ],
      },
      {
        onCall: 2,
        actions: [
          { type: "stdout", text: `session id: ${realSid}\n` },
          { type: "exit", code: 0 },
        ],
      },
      {
        onCall: 3,
        actions: [
          { type: "lastMessage", text: "VERDICT: APPROVE\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    const res = await runGuard(run);
    expect(res.code).toBe(0);
    const calls = readCalls(run);
    expect(calls).toHaveLength(3);
    const c2 = calls[2]!;
    expect(c2.argv).toEqual([
      "exec",
      "resume",
      realSid,
      "-c",
      "model_reasoning_effort=high",
      "-o",
      join(run.outDir, "attempt-3.last-message.txt"),
    ]);
    expect(c2.cwd).toBe(run.cwdDir);
    expect(c2.stdin).toContain("mandatory final line");
  });

  it("scenario 10: ordered ladder cache_ttl → resume in one run; kinds exec,exec,resume", async () => {
    const run = mkRun();
    const sid = "deadbeef-dead-4bee-8f00-deadbeef0001";
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "stderr", text: TTL_LINE },
          { type: "exit", code: 0 },
        ],
      },
      {
        onCall: 2,
        actions: [
          { type: "stdout", text: `session id: ${sid}\n` },
          { type: "exit", code: 0 },
        ],
      },
      {
        onCall: 3,
        actions: [
          { type: "lastMessage", text: "VERDICT: APPROVE\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    const res = await runGuard(run);
    expect(res.code).toBe(0);
    const r = readResult(run);
    expect(r.attempts.map((a) => a.recovery)).toEqual(["cache_ttl", "resume", null]);
    expect(r.attempts.map((a) => a.kind)).toEqual(["exec", "exec", "resume"]);
  });

  it("scenario 11: absent cache → cache_ttl_skipped consumes cap; resume still reachable", async () => {
    const run = mkRun();
    rmSync(join(run.codexHome, "models_cache.json"));
    const sid = "aaaabbbb-cccc-4ddd-8eee-ffff00001111";
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "stderr", text: TTL_LINE },
          { type: "exit", code: 0 },
        ],
      }, // TTL, no -o → failed; rung 1 skips (no cache), cap consumed
      {
        onCall: 2,
        actions: [
          { type: "stdout", text: `session id: ${sid}\n` },
          { type: "exit", code: 0 },
        ],
      }, // truncation → rung 2 must fire
      {
        onCall: 3,
        actions: [
          { type: "lastMessage", text: "VERDICT: APPROVE\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    const res = await runGuard(run);
    expect(res.code).toBe(0);
    const r = readResult(run);
    expect(r.attempts.map((a) => a.recovery)).toEqual(["cache_ttl_skipped", "resume", null]);
    expect(r.attempts[2]!.kind).toBe("resume");
    expect(r.status).toBe("verdict");
  });

  it("scenario 15: admission gate blocks rung side effects — cache intact, no backup", async () => {
    const run = mkRun();
    // attempt 1 fails FAST with the TTL signature on stderr
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "stderr", text: TTL_LINE },
          { type: "exit", code: 1 },
        ],
      },
    ]);
    // admission demands more seconds than can remain after ANY attempt: minAdmission > total
    const res = await runGuard(run, [], {
      CODEX_GUARD_MIN_ADMISSION_SECS: "30",
      CODEX_GUARD_TOTAL_MAX_SECS: "20",
    });
    expect(res.code).toBe(0);
    const r = readResult(run);
    expect(r.failureReason).toBe("total_timeout");
    expect(r.attempts).toHaveLength(1);
    expect(r.attempts[0]!.recovery).toBeNull(); // rung never selected
    expect(existsSync(join(run.codexHome, "models_cache.json"))).toBe(true);
    expect(existsSync(join(run.outDir, "models_cache.bak.json"))).toBe(false);
  });
});
