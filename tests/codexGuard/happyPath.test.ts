import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanupRuns, mkRun, readCalls, readResult, runGuard, writeScenario } from "./harness";

afterAll(cleanupRuns);
// (mkdirSync/writeFileSync serve the Task 3 additions in this same file:
//  composition tests + the classification-throw history test)

describe("codex-guard happy path", () => {
  it("scenario 1: exact argv, stdin prompt, child cwd, result.json contract", async () => {
    const run = mkRun();
    writeScenario(run, [
      {
        onCall: 1,
        actions: [
          { type: "stdout", text: "working\n" },
          { type: "lastMessage", text: "All good.\n\nVERDICT: APPROVE\n" },
          { type: "exit", code: 0 },
        ],
      },
    ]);
    const res = await runGuard(run, ["--label", "spec-r1"]);
    expect(res.code).toBe(0);

    const calls = readCalls(run);
    expect(calls).toHaveLength(1);
    const c0 = calls[0]!;
    expect(c0.argv).toEqual([
      "exec", "--skip-git-repo-check", "-s", "read-only", "-C", run.cwdDir,
      "-c", "model_reasoning_effort=high",
      "-o", join(run.outDir, "attempt-1.last-message.txt"),
    ]);
    expect(c0.cwd).toBe(run.cwdDir);
    const briefText = readFileSync(run.briefPath, "utf8");
    expect(c0.stdinBytes).toBe(Buffer.byteLength(briefText));
    expect(c0.stdin).toBe(briefText);

    const result = readResult(run);
    expect(result.status).toBe("verdict");
    expect(result.verdict).toBe("APPROVE");
    expect(result.verdictLine).toBe("VERDICT: APPROVE");
    expect(result.label).toBe("spec-r1");
    expect(result.guardVersion).toBe(1);
    expect(result.lastMessagePath).toBe(join(run.outDir, "attempt-1.last-message.txt"));
    expect(result.failureReason).toBeNull();
    expect(result.attempts).toHaveLength(1);
    const a = result.attempts[0]!;
    expect(a).toMatchObject({
      n: 1, kind: "exec", exitCode: 0, signal: null,
      killedReason: null, failureShape: null, recovery: null,
    });
    expect(typeof a.pid).toBe("number");
    expect(typeof a.durationSecs).toBe("number");
    expect(readFileSync(join(run.outDir, "attempt-1.transcript.txt"), "utf8")).toContain("working");
  });

  it("scenario 2: echo/fence/duplicate-outcome exclusions + normalization + raw verdictLine", async () => {
    const run = mkRun();
    const lastMessage = [
      "The brief says: end with `VERDICT: APPROVE or VERDICT: NEEDS-ATTENTION`",
      "VERDICT: APPROVE APPROVE",
      "```",
      "VERDICT: APPROVE",
      "```",
      "Findings: one HIGH.",
      "  VERDICT: **NEEDS-ATTENTION**.  ",
      "",
    ].join("\n");
    writeScenario(run, [
      { onCall: 1, actions: [{ type: "lastMessage", text: lastMessage }, { type: "exit", code: 0 }] },
    ]);
    const res = await runGuard(run);
    expect(res.code).toBe(0);
    const result = readResult(run);
    expect(result.status).toBe("verdict");
    expect(result.verdict).toBe("NEEDS-ATTENTION");
    expect(result.verdictLine).toBe("  VERDICT: **NEEDS-ATTENTION**.  ");
  });

  it("fallback composition: artifact blocks + budget trailer reach codex stdin", async () => {
    const run = mkRun();
    const art = join(run.dir, "spec-artifact.md");
    writeFileSync(art, "SPEC BODY CONTENT\n");
    writeScenario(run, [
      { onCall: 1, actions: [{ type: "lastMessage", text: "VERDICT: APPROVE\n" }, { type: "exit", code: 0 }] },
    ]);
    const res = await runGuard(run, ["--fallback", "--artifact", art]);
    expect(res.code).toBe(0);
    const stdin = readCalls(run)[0]!.stdin;
    expect(stdin).toContain("===== ARTIFACT: spec-artifact.md =====");
    expect(stdin).toContain("SPEC BODY CONTENT");
    expect(stdin).toContain("===== END ARTIFACT =====");
    expect(stdin).toContain("REACH A VERDICT — budget your reading.");
  });

  it("prompt above PROMPT_MAX_BYTES → usage error before any spawn", async () => {
    const run = mkRun();
    const art = join(run.dir, "huge.md");
    writeFileSync(art, "x".repeat(2_100_000)); // > 2,000,000 cap
    writeScenario(run, [{ onCall: 1, actions: [{ type: "exit", code: 0 }] }]);
    const res = await runGuard(run, ["--fallback", "--artifact", art]);
    expect(res.code).toBe(2);
    expect(readCalls(run)).toHaveLength(0); // never spawned
  });

  it("classification throw preserves the attempt in wrapper_error history", async () => {
    // Failure mode caught: runAttempt clears state.currentAttempt BEFORE classifyAttempt,
    // so a classify-time throw (readFileSync on the -o path) drops the completed attempt
    // from the exit-3 result. Deterministic trigger: a DIRECTORY at the -o path —
    // existsSync passes, readFileSync throws EISDIR. No fixture change needed.
    const run = mkRun();
    mkdirSync(join(run.outDir, "attempt-1.last-message.txt"), { recursive: true }); // creates outDir too
    writeScenario(run, [{ onCall: 1, actions: [{ type: "exit", code: 0 }] }]); // exits 0, never writes -o
    const res = await runGuard(run, []);
    expect(res.code).toBe(3);
    const r = readResult(run);
    expect(r.failureReason).toBe("wrapper_error");
    expect(r.error).toContain("classification failed");
    expect(r.attempts).toHaveLength(1); // the attempt survived into history
    expect(r.attempts[0]!.pid).not.toBeNull(); // recorded from the live child
  });
});
