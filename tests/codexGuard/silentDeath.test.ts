import { afterAll, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  GUARD,
  cleanupRuns,
  guardEnv,
  mkRun,
  readCalls,
  readResult,
  runGuard,
  writeScenario,
} from "./harness";

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
  // The fixture must be built for the HOST the guard will actually run on. An earlier
  // version hardcoded the darwin package/triple and varied only by arch: it passed on a
  // darwin-arm64 dev machine and failed on the linux-x64 CI runner, where the guard
  // correctly looked for the linux tree the fixture had never created. Read the real
  // table out of the implementation instead, so host coverage and drift are both handled.
  const GUARD_SRC = readFileSync(join(process.cwd(), "scripts", "codex-guard.mjs"), "utf8");
  const NATIVE_TABLE: Record<string, [string, string]> = (() => {
    const block = /const NATIVE_TRIPLE_BY_PLATFORM = \{([\s\S]*?)\n\};/.exec(GUARD_SRC);
    if (!block) throw new Error("NATIVE_TRIPLE_BY_PLATFORM not found in codex-guard.mjs");
    const out: Record<string, [string, string]> = {};
    for (const m of block[1]!.matchAll(/"([\w-]+)":\s*\["([^"]+)",\s*"([^"]+)"\]/g)) {
      out[m[1]!] = [m[2]!, m[3]!];
    }
    return out;
  })();
  const HOST = `${process.platform}-${process.arch}`;

  it("parses a non-empty platform table out of the implementation", () => {
    // Guards the extraction above: a rename or refactor must fail loudly here rather
    // than silently turning the behavioral test below into a vacuous null-check.
    expect(Object.keys(NATIVE_TABLE).length).toBeGreaterThan(0);
    expect(NATIVE_TABLE["darwin-arm64"]).toEqual(["codex-darwin-arm64", "aarch64-apple-darwin"]);
    expect(NATIVE_TABLE["linux-x64"]).toBeDefined();
  });

  // Faithful stand-in for the npm layout:
  //   <root>/bin/codex.js                                              (the Node shim)
  //   <root>/node_modules/@openai/codex-<plat>/vendor/<triple>/bin/codex   (native)
  // Each records that it ran, so the assertion is behavioral: which one executed?
  function fakeInstall(run: ReturnType<typeof mkRun>) {
    const root = join(run.dir, "codexpkg");
    const [pkg, triple] = NATIVE_TABLE[HOST] ?? ["codex-unsupported", "unsupported-triple"];
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

    if (!NATIVE_TABLE[HOST]) {
      // Unsupported host (e.g. win32): resolution must soft-downgrade to the configured
      // bin rather than throw, and the dispatch must still succeed.
      expect(r.nativeBinaryResolved).toBeNull();
      expect(readFileSync(witness, "utf8").trim()).toBe("SHIM");
      return;
    }
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

/** A rollout JSONL whose turn ended with `text` as the final assistant message. */
function writeRollout(run: ReturnType<typeof mkRun>, sid: string, text: string): void {
  const dir = join(run.codexHome, "sessions", "2026", "08", "05");
  mkdirSync(dir, { recursive: true });
  const lines = [
    JSON.stringify({
      timestamp: "2026-08-05T04:00:00.000Z",
      type: "session_meta",
      payload: { id: sid, cli_version: "0.146.0-alpha.6", originator: "codex_exec" },
    }),
    JSON.stringify({
      timestamp: "2026-08-05T04:01:00.000Z",
      type: "response_item",
      payload: { type: "message", role: "assistant", content: [{ type: "output_text", text }] },
    }),
  ].join("\n");
  writeFileSync(join(dir, `rollout-2026-08-05T04-00-00-${sid}.jsonl`), lines + "\n");
}

describe("silent death B2: the exit-3 writers consult the rollout when the -o file never landed", () => {
  // Failure caught (reviewer probe 2026-08-05). Two of the four terminal result
  // writers - `onSignal` (`failureReason:"interrupted"`) and `main().catch`
  // (`failureReason:"wrapper_error"`) - read ONLY the attempt's `-o` file. The
  // `giveUp` writer already scrapes the rollout, and the success writer has a
  // parsed `-o` message by construction, so these two were the whole gap:
  // {"findingCount":null,"failureReason":"interrupted"} with a declaring
  // rollout on disk, and {catchCallsRolloutScrape:false} for the other.
  //
  // A missing `-o` file with a live rollout is EXACTLY the condition rollout
  // recovery exists for, and recording `null` there does not mean "no count" -
  // `null` means NOT DECLARED, which is a false statement about a reviewer who
  // declared one. The COUNT is all these two writers take: spec §3 pins an
  // exit-3 result to `status:"no_verdict"`, so neither may promote itself to a
  // verdict on the strength of a scrape.
  const SID_LIVE = "11112222-3333-4444-8555-666677778888";
  const SID_OLD = "99998888-7777-4666-8555-444433332222";

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** Spawns the guard, waits for `sid` to reach attempt `n`'s stderr file, then SIGTERMs it. */
  async function runAndInterrupt(
    run: ReturnType<typeof mkRun>,
    n: number,
    sid: string,
  ): Promise<number | null> {
    const child = spawn(
      process.execPath,
      [
        GUARD,
        "review",
        "--brief",
        run.briefPath,
        "--cwd",
        run.cwdDir,
        "--out",
        run.outDir,
        "--stage",
        "spec",
        "--round",
        "1",
        // This spawn bypasses runGuard, so it never receives the harness's
        // --no-lint-gate injection. `spec` is a GATED stage and no --lint-doc is
        // named here, so the coverage arm would refuse before this test's
        // subject (signal handling / rollout scraping) is ever reached.
        "--no-lint-gate",
      ],
      {
        env: guardEnv(run, {
          CODEX_GUARD_STALL_SECS: "30",
          CODEX_GUARD_ATTEMPT_MAX_SECS: "60",
          CODEX_GUARD_TOTAL_MAX_SECS: "90",
        }),
      },
    );
    const exit = new Promise<number | null>((res) => child.on("exit", (c) => res(c)));
    try {
      // Wait on the BANNER reaching disk, not on a fixed delay: the live
      // attempt's session id is the only handle the scrape has, and a SIGTERM
      // landing before the stderr write would test a different scenario.
      const deadline = Date.now() + 15000;
      const stderrPath = join(run.outDir, `attempt-${n}.stderr.txt`);
      for (;;) {
        if (existsSync(stderrPath) && readFileSync(stderrPath, "utf8").includes(sid)) break;
        if (Date.now() > deadline) throw new Error(`banner for ${sid} never reached ${stderrPath}`);
        await sleep(50);
      }
      child.kill("SIGTERM");
      return await exit;
    } finally {
      child.kill("SIGKILL");
    }
  }

  it("records the count from the rollout when a SIGTERM lands with no -o file", async () => {
    const run = mkRun();
    writeRollout(run, SID_LIVE, "Two problems.\n\nFINDINGS: 2");
    writeScenario(run, [
      {
        onCall: 1,
        actions: [{ type: "stderr", text: `session id: ${SID_LIVE}\n` }, { type: "hang" }],
      },
    ]);

    expect(await runAndInterrupt(run, 1, SID_LIVE)).toBe(3);
    const r = readResult(run);
    expect(r.failureReason).toBe("interrupted");
    // The whole finding: `null` here would claim the reviewer declared nothing.
    expect(r.findingCount).toBe(2);
    // Spec §3: an exit-3 result stays a no-verdict result. The scrape supplies
    // the COUNT and never promotes the row.
    expect(r.status).toBe("no_verdict");
    expect(r.verdict).toBeNull();
  }, 30000);

  it("records the count from the rollout on a wrapper_error with no readable -o file", async () => {
    const run = mkRun();
    writeRollout(run, SID_LIVE, "Five problems.\n\nFINDINGS: 5");
    // A DIRECTORY where the -o file belongs: `existsSync` passes and the read
    // throws, so classification fails and the throw reaches `main().catch` -
    // the one writer that runs having never read the attempt's message.
    mkdirSync(join(run.outDir, "attempt-1.last-message.txt"), { recursive: true });
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "stderr", text: `session id: ${SID_LIVE}\n` },
          { type: "exit", code: 0 },
        ],
      },
    ]);

    const res = await runGuard(run);
    expect(res.code).toBe(3);
    const r = readResult(run);
    expect(r.failureReason).toBe("wrapper_error");
    expect(r.findingCount).toBe(5);
    expect(r.status).toBe("no_verdict");
  }, 30000);

  it("still records null when the NEWEST rollout declares nothing", async () => {
    const run = mkRun();
    // The older session declared 7 and the newest declares nothing. `null` is
    // the newest message's own answer, not a hole to backfill from a session
    // that ended earlier - the direction rule the newest-first recorder exists
    // for. An implementation that scrapes only "when the count is still null"
    // records 7 here and passes both tests above.
    writeRollout(run, SID_OLD, "Seven problems.\n\nFINDINGS: 7");
    writeRollout(run, SID_LIVE, "Still working.");
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "stderr", text: `session id: ${SID_OLD}\n` },
          { type: "lastMessage", text: "FINDINGS: 7\nStill working.\n" },
          { type: "exit", code: 0 },
        ],
      },
      {
        onCall: 2,
        actions: [{ type: "stderr", text: `session id: ${SID_LIVE}\n` }, { type: "hang" }],
      },
    ]);

    expect(await runAndInterrupt(run, 2, SID_LIVE)).toBe(3);
    const r = readResult(run);
    expect(r.failureReason).toBe("interrupted");
    expect(r.findingCount).toBeNull();
  }, 30000);
});

describe("silent death B3: the giveUp writer recovers a verdict without overwriting a newer count", () => {
  // Failure caught (reviewer probe 2026-08-05). `giveUp` predates the exit-3
  // writers' rule and scraped the rollout UNCONDITIONALLY, so its scrape
  // recorded a count even on dispatches whose own `-o` message had already
  // spoken. The scan walks sessions newest-first, and the newest session need
  // not have a rollout on disk at all - the `-o` write landing and the rollout
  // never being reached is exactly the ordinary case - so the first rollout the
  // scan FINDS can belong to an OLDER session. Probed against the shipped
  // wrapper: {"newestOutput":2,"recordedAfterGiveUpScrape":7} and
  // {"newestOutput":null,"recordedAfterGiveUpScrape":7}. Both are false facts
  // about a real review - a declared 2 restated as 7, and a genuine "not
  // declared" restated as a number the reviewer never gave.
  //
  // The scrape's OTHER errand is untouched: it exists to recover a verdict the
  // `-o` write never carried, and when the attempt produced no message at all
  // the rollout is the only copy of both answers, so the count arrives with the
  // verdict it came from. Count and verdict are separate questions here, and
  // only the count has a newer source to lose to.
  const SID_OLD = "33334444-5555-4666-8777-888899990000";
  const SID_NEW = "44445555-6666-4777-8888-99990000aaaa";
  const ATTEMPT_COUNT = 2; // what the dispatch's OWN terminal message declares
  const ROLLOUT_COUNT = 7; // deliberately different, so a displacement is visible
  const ROLLOUT_TEXT = `Seven problems.\n\nFINDINGS: ${ROLLOUT_COUNT}`;
  const NO_DECLARATION = "Reviewed the diff. Still working, no count yet.";

  /**
   * Attempt 1 announces SID_OLD and leaves no `-o` file; attempt 2 announces
   * SID_NEW and does whatever `attempt2` says. Only SID_OLD has a rollout, so
   * the newest-first scan finds nothing for SID_NEW and falls through to the
   * older session - the shape the finding lives in. Two attempts with
   * `--max-attempts 2` exhausts the budget, which is the `giveUp` writer.
   */
  const dispatch = (run: ReturnType<typeof mkRun>, attempt2: unknown[]) => {
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "stderr", text: `session id: ${SID_OLD}\n` },
          { type: "exit", code: 0 },
        ],
      },
      {
        onCall: 2,
        actions: [{ type: "stderr", text: `session id: ${SID_NEW}\n` }, ...attempt2],
      },
    ]);
    return runGuard(run, ["--max-attempts", "2"]);
  };

  it("keeps the -o file's declared count when an older rollout declares a different one", async () => {
    const run = mkRun();
    writeRollout(run, SID_OLD, ROLLOUT_TEXT);
    await dispatch(run, [
      { type: "lastMessage", text: `FINDINGS: ${ATTEMPT_COUNT}\nStill working, no verdict yet.\n` },
      { type: "exit", code: 0 },
    ]);
    const r = readResult(run);
    // Both sids were latched, so the scan really did have the older rollout in
    // reach - without this the assertion also passes on a scrape that found no
    // rollout at all. The third test is the positive control on the same
    // fixture: with attempt 2's `-o` absent, that rollout IS what gets recorded.
    expect(r.attempts.map((a) => a.sessionId)).toEqual([SID_OLD, SID_NEW]);
    // Proves the `giveUp` writer wrote this row and not one of the other three.
    expect(r.failureReason).toBe("attempts_exhausted");
    // Derived from the scenario's own declared line, never a literal repeated
    // on the assertion side.
    expect(r.findingCount).toBe(ATTEMPT_COUNT);
  }, 30000);

  it("keeps a genuine `not declared` when an older rollout declares a count", async () => {
    const run = mkRun();
    writeRollout(run, SID_OLD, ROLLOUT_TEXT);
    await dispatch(run, [
      { type: "lastMessage", text: `${NO_DECLARATION}\n` },
      { type: "exit", code: 0 },
    ]);
    const r = readResult(run);
    expect(r.attempts.map((a) => a.sessionId)).toEqual([SID_OLD, SID_NEW]);
    expect(r.failureReason).toBe("attempts_exhausted");
    // The attempt SPOKE and declared nothing. `null` is that message's own
    // answer, not a hole to backfill from a session that ended earlier - an
    // implementation that scrapes "only when the count is still null" records
    // ROLLOUT_COUNT here and passes the test above.
    expect(r.findingCount).toBeNull();
  }, 30000);

  it("still recovers a verdict, with its own count, when the attempt produced no message", async () => {
    const run = mkRun();
    // The SAME rollout as above plus the verdict line the `-o` write never
    // carried. Nothing else on this dispatch ever read a terminal message, so
    // the scrape is the only source of either answer.
    writeRollout(run, SID_OLD, `${ROLLOUT_TEXT}\n\nVERDICT: NEEDS-ATTENTION`);
    await dispatch(run, [{ type: "exit", code: 0 }]);
    const r = readResult(run);
    expect(r.failureReason).toBe("attempts_exhausted");
    // Recovery preserved exactly: gating the scrape itself on "the attempt did
    // not speak" would be the obvious fix and would still pass the two tests
    // above, but a narrower gate that skipped the scrape whenever a count was
    // already carried would silently drop this verdict.
    expect(r.status).toBe("verdict");
    expect(r.verdict).toBe("NEEDS-ATTENTION");
    expect(r.recoveredFrom).toBe("rollout_scrape");
    // Derived from the rollout fixture's own declared line.
    expect(r.findingCount).toBe(ROLLOUT_COUNT);
  }, 30000);
});

describe("silent death B4: an older session's rollout never restates a newer message's count", () => {
  // Failure caught (reviewer probe 2026-08-05). B3 asked "did THIS attempt
  // speak", which is the wrong grain: it is answered by the LAST attempt only,
  // so a dispatch whose final attempt is silent re-opens the whole defect for
  // every attempt before it. Probed against the B3 wrapper:
  // `giveUp: 2 -> 7; null -> 7` and `exit3-countOnly: 2 -> 7; null -> 7`.
  //
  // The question is RECENCY, not identity, and it is per SESSION rather than
  // per dispatch: the scan walks sessions newest-first, so a rollout may record
  // a count only while no session at least as new as it has already spoken. All
  // three terminal scrape callers share the one rule, because it now lives
  // inside `tryRolloutScrape` instead of at a call site - the two-copies-that-
  // drift shape is what let the exit-3 writers keep the defect after B3.
  //
  // "A session that spoke" is marked BEFORE its own rollout is scanned, so a
  // session's `-o` message outranks its own rollout. Those are two copies of
  // one turn; the `-o` file is the copy the wrapper asked for.
  const SID_A = "aaaa1111-2222-4333-8444-555566660000"; // oldest
  const SID_B = "bbbb1111-2222-4333-8444-555566660000"; // middle
  const SID_C = "cccc1111-2222-4333-8444-555566660000"; // newest
  const SPOKEN = 2;
  const ROLLOUT = 7; // deliberately different, so a displacement is visible
  const ROLLOUT_TEXT = `Seven problems.\n\nFINDINGS: ${ROLLOUT}`;
  const NO_DECLARATION = "Reviewed the diff. Still working, no count yet.";

  const banner = (sid: string) => ({ type: "stderr", text: `session id: ${sid}\n` });
  const spoke = (text: string) => ({ type: "lastMessage", text: `${text}\n` });
  const done = { type: "exit", code: 0 };

  it("keeps a middle attempt's declared count when the LAST attempt is silent", async () => {
    const run = mkRun();
    // Only the OLDEST session has a rollout, so the newest-first scan finds
    // nothing for C or B and falls through to A - the shape the finding lives
    // in, and the ordinary one, since a landed `-o` is exactly the case whose
    // rollout is never reached.
    writeRollout(run, SID_A, ROLLOUT_TEXT);
    writeScenario(run, [
      { onCall: 1, actions: [banner(SID_A), done] },
      { onCall: 2, actions: [banner(SID_B), spoke(`FINDINGS: ${SPOKEN}\nNo verdict yet.`), done] },
      { onCall: 3, actions: [banner(SID_C), done] },
    ]);
    await runGuard(run, ["--max-attempts", "3"]);
    const r = readResult(run);
    // All three sids latched, so the scan really did have A's rollout in reach:
    // without this the assertion also passes on a scrape that found nothing.
    expect(r.attempts.map((a) => a.sessionId)).toEqual([SID_A, SID_B, SID_C]);
    expect(r.failureReason).toBe("attempts_exhausted");
    expect(r.findingCount).toBe(SPOKEN);
  }, 40000);

  it("keeps a middle attempt's genuine `not declared` when the LAST attempt is silent", async () => {
    const run = mkRun();
    writeRollout(run, SID_A, ROLLOUT_TEXT);
    writeScenario(run, [
      { onCall: 1, actions: [banner(SID_A), done] },
      { onCall: 2, actions: [banner(SID_B), spoke(NO_DECLARATION), done] },
      { onCall: 3, actions: [banner(SID_C), done] },
    ]);
    await runGuard(run, ["--max-attempts", "3"]);
    const r = readResult(run);
    expect(r.failureReason).toBe("attempts_exhausted");
    // B spoke and declared nothing. `null` is B's own answer, and A ended
    // earlier, so A may not fill it in.
    expect(r.findingCount).toBeNull();
  }, 40000);

  it("still takes a NEWER session's rollout over an older attempt's declared count", async () => {
    const run = mkRun();
    // The direction control, and the reason the rule is recency rather than
    // "any attempt spoke". Here the rollout belongs to the session that ran
    // AFTER the one that spoke, so it is the newer answer and must win. A blunt
    // fix that suppresses the count scrape whenever any attempt spoke records
    // SPOKEN here and passes both tests above.
    writeRollout(run, SID_B, ROLLOUT_TEXT);
    writeScenario(run, [
      { onCall: 1, actions: [banner(SID_A), spoke(`FINDINGS: ${SPOKEN}\nNo verdict yet.`), done] },
      { onCall: 2, actions: [banner(SID_B), done] },
    ]);
    await runGuard(run, ["--max-attempts", "2"]);
    const r = readResult(run);
    expect(r.failureReason).toBe("attempts_exhausted");
    expect(r.findingCount).toBe(ROLLOUT);
  }, 40000);

  it("lets a session's own -o message outrank its own rollout", async () => {
    const run = mkRun();
    // One session, two copies of one turn, and they disagree. The `-o` file is
    // the copy the wrapper asked for, so the rollout may not restate it. The
    // scrape's OTHER errand is unaffected: this rollout carries the verdict the
    // `-o` write never did, and it is still recovered.
    writeRollout(run, SID_A, `${ROLLOUT_TEXT}\n\nVERDICT: BLOCKING`);
    writeScenario(run, [
      { onCall: 1, actions: [banner(SID_A), spoke(`FINDINGS: ${SPOKEN}\nNo verdict yet.`), done] },
    ]);
    await runGuard(run, ["--max-attempts", "1"]);
    const r = readResult(run);
    expect(r.failureReason).toBe("attempts_exhausted");
    expect(r.findingCount).toBe(SPOKEN);
    expect(r.verdict).toBe("BLOCKING");
    expect(r.recoveredFrom).toBe("rollout_scrape");
  }, 40000);

  it("suppresses the count scrape when a spoken attempt never latched a session id", async () => {
    const run = mkRun();
    // The residue of the same class. An attempt that spoke but printed no
    // banner cannot be PLACED in the walk, so nothing can prove an older
    // session's rollout is newer than it. Unordered-but-spoken therefore
    // suppresses the count errand outright rather than guessing - the
    // conservative direction, and the only one that cannot restate a real
    // declaration as a number the reviewer never gave.
    writeRollout(run, SID_A, ROLLOUT_TEXT);
    writeScenario(run, [
      { onCall: 1, actions: [banner(SID_A), done] },
      { onCall: 2, actions: [spoke(`FINDINGS: ${SPOKEN}\nNo verdict yet.`), done] },
    ]);
    await runGuard(run, ["--max-attempts", "2"]);
    const r = readResult(run);
    // Attempt 2 really did latch nothing - otherwise this is the ordinary
    // ordered case and proves nothing about the residue.
    expect(r.attempts.map((a) => a.sessionId)).toEqual([SID_A, null]);
    expect(r.findingCount).toBe(SPOKEN);
  }, 40000);
});

describe("silent death B5: a resumed attempt reuses its session id, so a session is not a clock", () => {
  // Failure caught (reviewer probe 2026-08-05). B4 keyed recency on the SESSION
  // id, and the resume rung breaks that key outright: `resumeArgv` issues
  // `exec resume <sid>` (`scripts/codex-guard.mjs:765`), so the resumed turn
  // runs INSIDE the earlier session and appends to the same rollout. An earlier
  // turn's `-o` therefore marked that session spoken, and the resumed turn's
  // strictly newer rollout message could never update the count. Probed against
  // the B4 build, across all three terminal writers:
  //
  //   giveUp number-to-different-number: recorded=2 expected=7
  //   exit3  number-to-different-number: recorded=2 expected=7
  //   giveUp number-to-undeclared:       recorded=2 expected=null
  //   exit3  number-to-undeclared:       recorded=2 expected=null
  //   giveUp undeclared-to-number:       recorded=null expected=7
  //   exit3  undeclared-to-number:       recorded=null expected=7
  //
  // The ordering the rule actually needs is over ATTEMPTS, which are a clock;
  // sessions are not, because two attempts can share one. A session's rollout
  // may record a count when the LAST attempt to use that session is newer than
  // the newest attempt that spoke. That reduces to B4's behavior whenever every
  // attempt has its own session, which is why B4's five cases still hold.
  const SID_R = "dddd1111-2222-4333-8444-555566660000";
  const FIRST_TURN = 2; // the pre-resume `-o` declaration
  const RESUMED = 7; // what the resumed turn puts in the rollout

  /**
   * Attempt 1 declares a count but no VERDICT, which is `no_marker` - one of
   * the four shapes that arms the resume rung (`selectRung`) - so attempt 2 is
   * a RESUME of attempt 1's session rather than a fresh exec. Attempt 2 leaves
   * no `-o` file, so the rollout is the only copy of its turn.
   */
  const dispatchResumed = (run: ReturnType<typeof mkRun>, secondBanner: boolean) => {
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "stderr", text: `session id: ${SID_R}\n` },
          { type: "lastMessage", text: `FINDINGS: ${FIRST_TURN}\nNo verdict yet.\n` },
          { type: "exit", code: 0 },
        ],
      },
      {
        onCall: 2,
        actions: [
          ...(secondBanner ? [{ type: "stderr", text: `session id: ${SID_R}\n` }] : []),
          { type: "exit", code: 0 },
        ],
      },
    ]);
    return runGuard(run, ["--max-attempts", "2"]);
  };

  it("takes the resumed turn's count over the pre-resume -o declaration", async () => {
    const run = mkRun();
    writeRollout(run, SID_R, `Seven problems.\n\nFINDINGS: ${RESUMED}`);
    await dispatchResumed(run, true);
    const r = readResult(run);
    // Pins that the rung actually fired - without this the test passes on a
    // plain second exec, which is not the shape the finding lives in.
    expect(r.attempts.map((a) => a.kind)).toEqual(["exec", "resume"]);
    expect(r.failureReason).toBe("attempts_exhausted");
    expect(r.findingCount).toBe(RESUMED);
  }, 40000);

  it("takes the resumed turn's genuine `not declared` over an earlier number", async () => {
    const run = mkRun();
    // The direction that a "only fill in a null" implementation gets wrong: the
    // resumed turn spoke and declared nothing, so `null` is the newest answer.
    writeRollout(run, SID_R, "Still working, no count yet.");
    await dispatchResumed(run, true);
    const r = readResult(run);
    expect(r.attempts.map((a) => a.kind)).toEqual(["exec", "resume"]);
    expect(r.findingCount).toBeNull();
  }, 40000);

  it("places the FAILING attempt on the clock in the wrapper_error writer", async () => {
    const run = mkRun();
    // Gap found by mutation probe, not by the reviewer: dropping
    // `currentAttempt` from the clock killed no test, because `onSignal`
    // already pushes the live attempt into `attempts` before it scrapes and
    // `giveUp`'s attempt is pushed by its caller. `main().catch` is the one
    // writer whose attempt is in NEITHER - it is merged into the result body
    // only AFTER the scrape, and `runAttempt` nulls `currentAttempt` on the
    // throw path - so its session was unplaceable and any earlier declaration
    // outranked it. Same defect class as the reviewer's, on writer 4.
    const SID_1 = "eeee1111-2222-4333-8444-555566660000";
    const SID_2 = "ffff1111-2222-4333-8444-555566660000";
    writeRollout(run, SID_2, `Seven problems.\n\nFINDINGS: ${RESUMED}`);
    // A DIRECTORY where attempt 2's -o file belongs: `existsSync` passes, the
    // read throws, and the throw reaches `main().catch` carrying the attempt.
    mkdirSync(join(run.outDir, "attempt-2.last-message.txt"), { recursive: true });
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "stderr", text: `session id: ${SID_1}\n` },
          { type: "lastMessage", text: `FINDINGS: ${FIRST_TURN}\nNo verdict yet.\n` },
          // Nonzero, so this is NOT one of the four shapes that arm the resume
          // rung - attempt 2 must be a fresh exec with its own session.
          { type: "exit", code: 1 },
        ],
      },
      {
        onCall: 2,
        actions: [
          { type: "stderr", text: `session id: ${SID_2}\n` },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    const res = await runGuard(run);
    expect(res.code).toBe(3);
    const r = readResult(run);
    expect(r.failureReason).toBe("wrapper_error");
    expect(r.findingCount).toBe(RESUMED);
  }, 40000);

  it("orders a resumed attempt that printed no banner, from the rung it took", async () => {
    const run = mkRun();
    // The residue. A resume that prints no `session id:` line latches no
    // sessionId, but the wrapper CHOSE the session it resumed, so the attempt
    // is still placeable - `state.resumeSid` is that answer. Falling back to
    // "unordered" here would suppress a count the reviewer really did declare.
    writeRollout(run, SID_R, `Seven problems.\n\nFINDINGS: ${RESUMED}`);
    await dispatchResumed(run, false);
    const r = readResult(run);
    expect(r.attempts.map((a) => a.kind)).toEqual(["exec", "resume"]);
    expect(r.attempts[1]!.sessionId).toBeNull();
    expect(r.findingCount).toBe(RESUMED);
  }, 40000);
});
