import { describe, expect, it } from "vitest";

import { type Surface, main } from "@/scripts/pane-compaction";
import { premiseHolds } from "@/tests/_shared/premise";
import { gaugeFor } from "@/tests/paneCompaction/fixtures";

/**
 * Task 3 — nonce-mint exhaustion is a named FAULT, not an uncaught throw
 * (spec §3.7, AC-16).
 *
 * `mintNonce` re-mints when its candidate collides with the nonce already in
 * the target's marker, and throws once its budget is spent. That is unreachable
 * with a healthy 128-bit source and reachable exactly when `random()` is
 * broken -- a TOOL fault, not a refusal. An uncaught throw leaves the process
 * with a code the exit taxonomy assigns to refusals, which is a fault wearing a
 * refusal's number: exit 1 tells an operator "asked and answered, not now" for
 * a condition that means "this tool is broken".
 */

const MARKER_NONCE = "aaaaaaaaaaaaaaaa";

function fullMarker(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    branch: "feat/alpha",
    stage: "x",
    tasksRemaining: 0,
    next: "n",
    blockedOn: "",
    cronJobId: "c",
    sessionId: "sess-target",
    ...over,
  };
}

type Run = { code: number; lines: string[]; sent: string[]; written: string[] };

/**
 * `main`, with the throw CAUGHT so the assertion is a value comparison.
 *
 * A bare `expect(() => main(...)).not.toThrow()` reds on the right condition and
 * says nothing about the exit code, and asserting on `main`'s return value
 * directly makes the red a thrown error rather than a failed assertion. This
 * reports both outcomes in one shape, so the red reads
 * `{ returned: false, error: "mintNonce: ..." }` against
 * `{ returned: true, code: 2 }`.
 */
function invoke(
  argv: string[],
  random: () => string,
  over: Partial<Surface> = {},
): { outcome: { returned: true; code: number } | { returned: false; error: string }; run: Run } {
  const run: Run = { code: -1, lines: [], sent: [], written: [] };
  const surface: Surface = {
    roster: () => [
      {
        paneId: "wM:p1",
        agentName: "feat/alpha",
        cwd: "/w/alpha",
        status: "working",
        agentSession: "sess-target",
      },
    ],
    branches: () => new Set(["feat/alpha"]),
    screen: () => gaugeFor(6),
    send: (_target, text) => run.sent.push(text),
    purview: () => [
      {
        sessionId: "sess-1",
        rows: [
          {
            paneId: "wM:p1",
            agentName: "feat/alpha",
            branch: "feat/alpha",
            dispatchedAt: "2026-08-16T00:00:00Z",
          },
        ],
      },
    ],
    marker: () => fullMarker({ checkpointNonce: MARKER_NONCE }),
    git: () => ({ clean: true, lastCommitAt: 1_000 }),
    gh: () => ({ exitCode: 1, stdout: "", stderr: "no pull requests found for branch" }),
    corpus: () => [],
    resolveTarget: () => ({ paneId: "wM:p1" }),
    now: () => 100_000_000,
    random,
    out: (line) => run.lines.push(line),
    outRaw: () => undefined,
    nonceRead: () => null,
    nonceWrite: (_s, _p, nonce) => run.written.push(nonce),
    nonceConsume: () => true,
    ...over,
  };
  try {
    const code = main(argv, surface);
    run.code = code;
    return { outcome: { returned: true, code }, run };
  } catch (e) {
    return { outcome: { returned: false, error: e instanceof Error ? e.message : String(e) }, run };
  }
}

describe("AC-16 — a broken random source is a named fault", () => {
  it("--checkpoint exits 2 rather than letting the mint throw escape main()", () => {
    let draws = 0;
    const { outcome } = invoke(["--checkpoint", "wM:p1", "--as", "sess-1"], () => {
      draws += 1;
      return MARKER_NONCE; // ALWAYS the value already in the marker
    });
    premiseHolds("the generator was actually consulted, and kept colliding", draws > 1);
    expect(outcome).toEqual({ returned: true, code: 2 });
  });

  it("the refusal NAMES the random source, so an operator does not go re-checkpoint", () => {
    const { run } = invoke(["--checkpoint", "wM:p1", "--as", "sess-1"], () => MARKER_NONCE);
    const out = run.lines.join("\n");
    expect(out).toContain("random");
    // NOT a nonce reason and NOT a pane reason: nothing is wrong with the pane.
    expect(out).not.toContain("checkpointNonce");
    expect(out).not.toContain("rule ");
  });

  it("nothing is sent and no nonce is recorded when the mint cannot complete", () => {
    const { run } = invoke(["--checkpoint", "wM:p1", "--as", "sess-1"], () => MARKER_NONCE);
    expect(run.sent).toEqual([]);
    expect(run.written).toEqual([]);
  });

  it("a source that collides ONCE still succeeds — the retry budget is not the fault", () => {
    // The positive twin. Without it, an implementation that treated ANY
    // collision as a fault would pass all three cases above while breaking the
    // ordinary re-mint the budget exists for.
    let draws = 0;
    const { outcome, run } = invoke(["--checkpoint", "wM:p1", "--as", "sess-1"], () => {
      draws += 1;
      return draws === 1 ? MARKER_NONCE : "bbbbbbbbbbbbbbbb";
    });
    premiseHolds("the generator really did collide on its first draw", draws > 1);
    expect(outcome).toEqual({ returned: true, code: 0 });
    expect(run.written).toEqual(["bbbbbbbbbbbbbbbb"]);
    expect(run.sent.length).toBeGreaterThan(0);
  });
});
