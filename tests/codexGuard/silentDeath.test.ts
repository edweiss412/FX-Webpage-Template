import { afterAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanupRuns, mkRun, readCalls, readResult, runGuard, writeScenario } from "./harness";

// Silent-death investigation (2026-07-24, PR #580 evidence set).
// Full write-up: docs/agents/codex-silent-death-2026-07-24.md.
//
// ROOT CAUSE (verified, and NOT covered here because it lives outside this repo):
// ~/.claude/hooks/reap-idle-codex.sh, wired to Stop/SubagentStop, SIGTERMs every Codex
// process tree older than 120s whenever its liveness gate sees no activity — and that
// gate does not watch ~/.codex/sessions, the only path a running `codex exec` writes to.
// 379 of 651 codex_exec sessions (58%) died this way over five days.
//
// Four wrapper-side defects, each with its own describe block:
//
//  A. The resume rung reads the session id from the TRANSCRIPT (stdout). The real
//     codex CLI prints its `session id:` banner on STDERR and leaves stdout empty
//     (all 8 preserved attempt transcripts are 0 bytes). The rung was therefore
//     unreachable in production while passing its own tests, because the fixture
//     scenarios in ladder.test.ts emit the banner on stdout. Classic
//     mocked-only tautological pass.
//
//  B. When a session dies after emitting its final agent message but before the
//     `-o` file lands, the verdict is recoverable from the rollout JSONL. The
//     guard never looks.
//
//  C. `codex` is a Node shim that spawns the native Rust binary. On a
//     SIGINT/SIGTERM/SIGHUP death of the native binary the shim re-raises the
//     signal at itself (bin/codex.js:246) while its own handlers
//     (bin/codex.js:224) are still installed, so the handler runs instead of the
//     default terminate, Node falls off the event loop, and the shim exits 0.
//     Every signal death is laundered into "exit 0, no -o file" — which is why the
//     reaper's SIGTERM was invisible. The guard must invoke the native binary so
//     the signal stays visible.
//
//  D. Nothing told the reaper the dispatch was alive. The guard now emits a liveness
//     heartbeat into a path the reaper's gate already watches, refreshed only on real
//     output growth so a genuinely wedged child stays reapable.

afterAll(cleanupRuns);

const SID = "aabbccdd-1122-4333-8444-555566667777";

describe("silent death A: session id is discovered on stderr, where the real CLI prints it", () => {
  it("takes the resume rung when the banner is on STDERR and stdout is empty", async () => {
    const run = mkRun();
    writeScenario(run, [
      {
        onCall: 1,
        // Faithful to the real CLI: banner on stderr, stdout silent, exit 0, no -o file.
        actions: [
          {
            type: "stderr",
            text: `OpenAI Codex v0.146.0-alpha.6\n--------\nsession id: ${SID}\n-------\n`,
          },
          { type: "exit", code: 0 },
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

    expect(r.attempts[0]!.failureShape).toBe("no_o_file");
    // The whole point: recover the completed session instead of discarding it.
    expect(r.attempts[0]!.recovery).toBe("resume");
    expect(r.attempts[1]!.kind).toBe("resume");

    const calls = readCalls(run);
    expect(calls[1]!.argv).toEqual([
      "exec",
      "resume",
      SID,
      "-c",
      "model_reasoning_effort=high",
      "-o",
      join(run.outDir, "attempt-2.last-message.txt"),
    ]);
    expect(r.status).toBe("verdict");
    expect(r.verdict).toBe("APPROVE");
  });

  it("still ignores a decoy sid from an EARLIER attempt's stderr (per-attempt sourcing holds)", async () => {
    const run = mkRun();
    const decoy = "00000000-0000-4000-8000-000000000000";
    writeScenario(run, [
      // Attempt 1 dies nonzero: not a resume-eligible shape, so its sid must not be latched.
      {
        onCall: 1,
        actions: [
          { type: "stderr", text: `session id: ${decoy}\n` },
          { type: "exit", code: 1 },
        ],
      },
      {
        onCall: 2,
        actions: [
          { type: "stderr", text: `session id: ${SID}\n` },
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
    // Resumes the sid of the attempt that actually earned the rung, not the decoy.
    expect(calls[2]!.argv[2]).toBe(SID);
  });
});

describe("silent death B: rollout scrape recovers a verdict the -o write never reached", () => {
  it("reads the last agent message from the session rollout when the -o file is absent", async () => {
    const run = mkRun();
    const rolloutDir = join(run.codexHome, "sessions", "2026", "07", "24");
    mkdirSync(rolloutDir, { recursive: true });
    // A rollout whose turn produced a final assistant message, then died before -o.
    const lines = [
      JSON.stringify({
        timestamp: "2026-07-24T20:30:43.000Z",
        type: "session_meta",
        payload: { id: SID, cli_version: "0.146.0-alpha.6", originator: "codex_exec" },
      }),
      JSON.stringify({
        timestamp: "2026-07-24T20:31:00.000Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Findings: none.\n\nVERDICT: APPROVE" }],
        },
      }),
    ].join("\n");
    writeFileSync(join(rolloutDir, `rollout-2026-07-24T20-30-43-${SID}.jsonl`), lines + "\n");

    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "stderr", text: `session id: ${SID}\n` },
          { type: "exit", code: 0 },
        ],
      },
      // Every later attempt also dies without an -o file: only the scrape can save this run.
      {
        onCall: 2,
        actions: [
          { type: "stderr", text: "dead\n" },
          { type: "exit", code: 0 },
        ],
      },
      {
        onCall: 3,
        actions: [
          { type: "stderr", text: "dead\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);

    const res = await runGuard(run);
    expect(res.code).toBe(0);
    const r = readResult(run);
    expect(r.status).toBe("verdict");
    expect(r.verdict).toBe("APPROVE");
    expect(r.recoveredFrom).toBe("rollout_scrape");
    expect(r.lastMessagePath).not.toBeNull();
    expect(existsSync(r.lastMessagePath!)).toBe(true);
  });
});

describe("silent death D: liveness heartbeat keeps external idle-reapers off a live dispatch", () => {
  it("writes a .log heartbeat under CODEX_HOME/log while an attempt is running", async () => {
    const run = mkRun();
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          // Emit over time so the poll loop observes growth and beats at least once.
          { type: "emitEvery", stream: "stderr", text: "working\n", times: 6, ms: 120 },
          { type: "lastMessage", text: "VERDICT: APPROVE\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    const before = Date.now();
    const res = await runGuard(run);
    expect(res.code).toBe(0);
    expect(readResult(run).status).toBe("verdict");

    const beat = join(run.codexHome, "log", "codex-guard-heartbeat.log");
    expect(existsSync(beat)).toBe(true);
    // Freshness is the whole contract: a stale file would not hold a reaper off.
    expect(statSync(beat).mtimeMs).toBeGreaterThanOrEqual(before);
  });

  it("can be disabled with CODEX_GUARD_NO_HEARTBEAT=1", async () => {
    const run = mkRun();
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "emitEvery", stream: "stderr", text: "working\n", times: 6, ms: 120 },
          { type: "lastMessage", text: "VERDICT: APPROVE\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    const res = await runGuard(run, [], { CODEX_GUARD_NO_HEARTBEAT: "1" });
    expect(res.code).toBe(0);
    expect(existsSync(join(run.codexHome, "log", "codex-guard-heartbeat.log"))).toBe(false);
  });
});

describe("silent death C: the guard invokes the native binary, not the signal-laundering shim", () => {
  // Faithful stand-in for the npm layout:
  //   <root>/bin/codex.js                                              (the Node shim)
  //   <root>/node_modules/@openai/codex-<plat>/vendor/<triple>/bin/codex   (native)
  // Each records that it ran, so the assertion is behavioral: which one executed?
  function fakeInstall(run: ReturnType<typeof mkRun>) {
    const root = join(run.dir, "codexpkg");
    const triple = `${process.arch === "arm64" ? "aarch64" : "x86_64"}-apple-darwin`;
    const pkg = `codex-darwin-${process.arch === "arm64" ? "arm64" : "x64"}`;
    const vendorBin = join(root, "node_modules", "@openai", pkg, "vendor", triple, "bin");
    mkdirSync(vendorBin, { recursive: true });
    mkdirSync(join(root, "bin"), { recursive: true });
    const witness = join(run.dir, "who-ran.txt");
    const shim = join(root, "bin", "codex.js");
    const native = join(vendorBin, "codex");
    // Both write the -o file so the run can succeed either way — only the witness differs.
    const body = (who: string) =>
      `#!/bin/sh\ncat >/dev/null\necho ${who} >> ${witness}\nwhile [ $# -gt 0 ]; do if [ "$1" = "-o" ]; then printf 'VERDICT: APPROVE\\n' > "$2"; fi; shift; done\nexit 0\n`;
    writeFileSync(shim, body("SHIM"), { mode: 0o755 });
    writeFileSync(native, body("NATIVE"), { mode: 0o755 });
    return { shim, native, witness };
  }

  it("executes the vendored native binary, not the shim, when the shim is the configured bin", async () => {
    const run = mkRun();
    const { shim, native, witness } = fakeInstall(run);

    const res = await runGuard(run, [], {
      CODEX_GUARD_BIN: shim,
      CODEX_GUARD_BIN_ARGS: JSON.stringify([]),
    });
    expect(res.code).toBe(0);

    const r = readResult(run);
    expect(r.status).toBe("verdict");
    expect(r.nativeBinaryResolved).toBe(native);
    // The load-bearing assertion: the signal-laundering Node shim never ran.
    expect(readFileSync(witness, "utf8").trim()).toBe("NATIVE");
  });

  it("falls back to the configured bin when no vendored native binary exists", async () => {
    const run = mkRun();
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "lastMessage", text: "VERDICT: APPROVE\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    // Default harness env: CODEX_GUARD_BIN=node + BIN_ARGS=[fixture]. Nothing to resolve.
    const res = await runGuard(run);
    expect(res.code).toBe(0);
    const r = readResult(run);
    expect(r.status).toBe("verdict");
    expect(r.nativeBinaryResolved).toBeNull();
  });
});
