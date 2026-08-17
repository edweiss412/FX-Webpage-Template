import { describe, expect, it } from "vitest";

import {
  CRITICAL_AT,
  ELIGIBLE_AT,
  type CorpusRow,
  type ObservedPane,
  type PaneReport,
  RECENT_COMMIT_WINDOW_MS,
  classify,
  classifyGh,
  mintNonce,
  newestVerdictRow,
  newestVerdictTie,
  positionFor,
  renderRow,
} from "@/scripts/lib/pane-compaction-core";

/**
 * BOUNDARY and IDENTITY kills for the source-mutation gate.
 *
 * The suite reached 0.8282 against a 0.95 floor with 28 survivors, and the
 * survivors were not scattered: every one sat on a boundary the other suites
 * approach from both sides but never land ON, an absolute column offset nothing
 * asserted, or a loop bound nothing counted. A test that exercises `tenths = 4`
 * and `tenths = 6` proves the band is somewhere between them; only `tenths = 5`
 * proves WHERE.
 *
 * Six survivors are deliberately left alive and ledgered `equivalent` in
 * tests/mutation/source/registry.ts: they mutate TYPE annotations
 * (`: 0 | 1 | 2`, `exitCode: 1`, `{ exitCode: 0 | 1 }`), which TypeScript erases
 * and vitest never typechecks, so they cannot change runtime behaviour and no
 * test could kill them. They are equivalent mutants, not coverage debt.
 */

/** A pane that every validation rule (1-8) stays quiet on, so banding decides. */
function quietPane(over: Partial<ObservedPane> = {}): ObservedPane {
  return {
    paneId: "wA:p1",
    branch: "feat/x",
    duplicateName: false,
    status: "idle",
    claimed: true,
    contested: false,
    rejectedField: null,
    sessionMismatch: false,
    ghFault: false,
    blockedOn: "",
    tenths: 6,
    position: "Low",
    ...over,
  };
}

describe("band boundaries are landed ON, not straddled", () => {
  // Kills relational-boundary 129:14 and 171:19 (`<` -> `<=`). At exactly
  // ELIGIBLE_AT the pane is eligible, NOT held: `<=` would hold it, and a
  // wrongly-held pane is one that never gets compacted at all.
  it(`tenths === ELIGIBLE_AT (${ELIGIBLE_AT}) is eligible, not HOLD`, () => {
    const c = classify(quietPane({ tenths: ELIGIBLE_AT, position: "Low" }));
    expect(c.verdict).toBe("COMPACT");
    expect(c.rule).toBe(12);
    expect(c.wouldBandTo).toBe("COMPACT");
  });

  // Kills relational-boundary 130:14 and 172:19 (`>=` -> `>`). At exactly
  // CRITICAL_AT the pane is critical: `>` would demote it to the mid band, so a
  // pane at the critical threshold would be COMPACTed rather than FORCEd.
  it(`tenths === CRITICAL_AT (${CRITICAL_AT}) is critical, not mid-band`, () => {
    const c = classify(quietPane({ tenths: CRITICAL_AT, position: "Low" }));
    expect(c.verdict).toBe("FORCE");
    expect(c.rule).toBe(10);
    expect(c.wouldBandTo).toBe("FORCE");
  });

  // Kills equality-flip 130:46 (`===` -> `!==`) on `position === "High"`.
  // Asserted from BOTH sides, because a single side is satisfied by the flip:
  // High must WAIT (rule 11) and non-High must FORCE (rule 10).
  it("at critical pressure, High waits and non-High forces", () => {
    const high = classify(quietPane({ tenths: 9, position: "High" }));
    expect(high.verdict).toBe("WAIT");
    expect(high.rule).toBe(11);
    expect(high.wouldBandTo).toBe("WAIT");

    const low = classify(quietPane({ tenths: 9, position: "Low" }));
    expect(low.verdict).toBe("FORCE");
    expect(low.rule).toBe(10);
    expect(low.wouldBandTo).toBe("FORCE");
  });
});

describe("gh fault detail", () => {
  // Kills logical-connector 230:53 (`||` -> `&&`). With `&&` a NON-EMPTY stderr
  // yields the generic `gh exited N` instead of the message, which is the exact
  // case the fallback exists to avoid: the operator loses the only text saying
  // what actually broke.
  it("reports stderr verbatim when gh wrote one", () => {
    const out = classifyGh({ exitCode: 4, stdout: "x", stderr: "  gh: auth token expired  " });
    expect(out).toEqual({ kind: "fault", detail: "gh: auth token expired" });
  });

  // The other side of the same `||`, so the fallback itself stays pinned.
  it("falls back to the exit code when stderr is empty", () => {
    const out = classifyGh({ exitCode: 7, stdout: "x", stderr: "   " });
    expect(out).toEqual({ kind: "fault", detail: "gh exited 7" });
  });
});

describe("newestVerdictRow keeps the true maximum", () => {
  const row = (endedAt: string | null, verdict = "APPROVE"): CorpusRow => ({
    status: "verdict",
    verdict,
    endedAt,
  });

  // Kills statement-removal 275:7 (`bestAt = at;`). Without the assignment
  // `bestAt` stays -Infinity, every row beats it, and the LAST row wins instead
  // of the newest. Ordered newest-first so the two answers differ.
  it("picks the newest row even when it is not the last one scanned", () => {
    const newest = row("2026-01-02T00:00:00Z");
    const older = row("2026-01-01T00:00:00Z");
    expect(newestVerdictRow([newest, older])).toBe(newest);
  });

  // Kills relational-boundary 274:12 (`>` -> `>=`). On equal timestamps `>`
  // keeps the FIRST and `>=` keeps the last; identity (toBe) is what
  // discriminates, since the two rows compare equal by value.
  //
  // WHAT THIS DOES AND DOES NOT CLAIM. An earlier version of this case asserted
  // first-wins and described it as the tie behaviour. That was wrong: spec §3.5
  // and the §9 table both say a tie yields UNDETERMINED, so a test asserting a
  // WINNER cemented a spec violation while looking like coverage. Diff round 1
  // finding 6 caught it.
  //
  // The tie is now rejected upstream by `newestVerdictTie`, which is what the
  // spec rule lives in. `newestVerdictRow` remains a "which row" helper, and
  // first-wins is a DETERMINISM detail of it -- pinned here so the mutant dies,
  // and explicitly not offered as the answer to "what happens on a tie".
  it("is deterministic on equal timestamps, keeping the first it saw", () => {
    const first = row("2026-01-01T00:00:00Z", "APPROVE");
    const second = row("2026-01-01T00:00:00Z", "APPROVE");
    expect(newestVerdictRow([first, second])).toBe(first);
    // The spec rule, asserted next to the detail so the two cannot drift apart.
    expect(newestVerdictTie([first, second])).toBe(true);
  });

  it("reports a tie only when the tie is for NEWEST, not for any timestamp", () => {
    // Two older rows sharing a timestamp under a single strictly-newest row is
    // NOT a tie: the newest verdict has an unambiguous answer. Without this the
    // detector could be "any duplicate timestamp" and still pass the case above,
    // which would refuse panes whose corpus is merely busy.
    const newest = row("2026-01-03T00:00:00Z");
    const olderA = row("2026-01-01T00:00:00Z");
    const olderB = row("2026-01-01T00:00:00Z");
    expect(newestVerdictTie([newest, olderA, olderB])).toBe(false);
    expect(newestVerdictRow([newest, olderA, olderB])).toBe(newest);
  });

  it("ignores non-verdict and unparsable rows when deciding a tie", () => {
    // A `no_verdict` row carrying a valid `endedAt` is committed in the live
    // corpus (spec §3.5), so it must not manufacture a tie against the real
    // verdict and demote the pane to UNDETERMINED.
    const real = row("2026-01-02T00:00:00Z");
    const wrapperFailure: CorpusRow = {
      status: "no_verdict",
      verdict: null,
      endedAt: "2026-01-02T00:00:00Z",
    };
    const unparsable: CorpusRow = { status: "verdict", verdict: "APPROVE", endedAt: "not-a-date" };
    expect(newestVerdictTie([real, wrapperFailure, unparsable])).toBe(false);
    expect(newestVerdictRow([real, wrapperFailure, unparsable])).toBe(real);
  });
});

describe("positionFor's commit-since-verdict inference", () => {
  const base = {
    now: Date.parse("2026-01-03T00:00:00Z"),
    clean: true,
    pr: null,
  };
  const verdictAt = (endedAt: string, verdict: string): CorpusRow[] => [
    { status: "verdict", verdict, endedAt },
  ];

  // Kills equality-flip 291:54 (`===` -> `!==` on the `endedAt === undefined`
  // guard) and both flips on 293 (`newestAt !== null`, `lastCommitAt !== null`).
  // Each mutant forces `commitSince` false, which re-arms row 4 for a commit
  // that HAS already answered the verdict -- the pane reads High-cost forever.
  it("a commit after a non-APPROVE verdict clears row 4", () => {
    const p = positionFor({
      ...base,
      lastCommitAt: Date.parse("2026-01-02T12:00:00Z"),
      corpus: verdictAt("2026-01-02T00:00:00Z", "NEEDS-ATTENTION"),
    });
    expect(p.row).not.toBe(4);
    expect(p.cost).not.toBe("High");
  });

  // Kills relational-boundary 293:76 (`>` -> `>=`). A commit at EXACTLY the
  // verdict's timestamp has not answered it, so row 4 must still hold; `>=`
  // would treat the tie as a later commit and release it.
  it("a commit exactly AT the verdict timestamp does not clear row 4", () => {
    const at = "2026-01-02T00:00:00Z";
    const p = positionFor({
      ...base,
      lastCommitAt: Date.parse(at),
      corpus: verdictAt(at, "NEEDS-ATTENTION"),
    });
    expect(p.row).toBe(4);
    expect(p.cost).toBe("High");
  });

  // Kills relational-boundary 300:69 (`<=` -> `<`). A commit exactly one window
  // old is still recent, so the position is the cheap row 7; `<` demotes the
  // boundary case to row 8 and the pane loses its Lowest-cost moment.
  it("a commit exactly RECENT_COMMIT_WINDOW_MS old is still recent", () => {
    const p = positionFor({
      ...base,
      lastCommitAt: base.now - RECENT_COMMIT_WINDOW_MS,
      corpus: [],
    });
    expect(p.row).toBe(7);
    expect(p.cost).toBe("Lowest");
  });
});

describe("renderRow's gauge and column widths", () => {
  const report = (over: Partial<PaneReport> = {}): PaneReport => ({
    paneId: "wA:p1",
    branch: "feat/x",
    tenths: 7,
    verdict: "COMPACT",
    rule: 12,
    position: { row: 3, cost: "High" },
    inPurview: true,
    ...over,
  });

  // Kills equality-flip 420:26 (`p.tenths === null`). Asserted from both sides:
  // the flip swaps the two, so a known gauge would print `?` and an UNKNOWN one
  // would print the string `null/10` -- a fabricated reading where there is none.
  it("prints the gauge when known and `?` when not", () => {
    expect(renderRow(report({ tenths: 7 }))).toContain("7/10");
    const unknown = renderRow(report({ tenths: null }));
    expect(unknown).toContain("?");
    expect(unknown).not.toContain("null");
  });

  // Kills integer-literal 422:21 (8), 423:40 (34), 424:20 (5) and 425:22 (13).
  // The existing alignment case compares two rows rendered with the SAME widths,
  // so it stays green when a width changes -- both rows shift together. Only an
  // ABSOLUTE expectation pins the offsets, so this asserts the whole rendered
  // string against a literal written out by hand rather than rebuilt from the
  // same constants (which would move with the mutant and prove nothing).
  it("lays the columns out at fixed absolute offsets", () => {
    const line = renderRow(report());
    expect(line).toBe(
      "wA:p1     feat/x                               7/10  COMPACT        row 3 High",
    );
    // 8 + 2 + 34 + 2 + 5 + 2 + 13 + 2 + 10, derived from the four widths and the
    // two-space join. Pinned so a width change fails on the total as well as on
    // the offsets below.
    expect(line).toHaveLength(78);
    // Named offsets, so a failure says WHICH column moved rather than only that
    // the line differs.
    expect(line.indexOf("feat/x")).toBe(10);
    expect(line.indexOf("7/10")).toBe(47);
    expect(line.indexOf("COMPACT")).toBe(53);
    expect(line.indexOf("row 3 High")).toBe(68);
  });
});

describe("mintNonce's retry bound", () => {
  // Kills all four integer/relational mutants on the loop header (559): the
  // start `0`, the bound `<`, the limit `8`, and the increment `+= 1`. Every one
  // of them changes only HOW MANY times the generator is consulted, which no
  // assertion on the thrown error can see -- so the call count is the assertion.
  it("consults the generator exactly 8 times before giving up", () => {
    let calls = 0;
    const collide = (): string => {
      calls += 1;
      return "same";
    };
    expect(() => mintNonce({ markerNonce: "same", random: collide })).toThrow(/colliding/);
    expect(calls).toBe(8);
  });

  // The success side, so the loop cannot be "fixed" by never looping.
  it("returns the first candidate that differs from the marker's nonce", () => {
    const queue = ["same", "same", "fresh"];
    let calls = 0;
    const gen = (): string => {
      calls += 1;
      return queue.shift() ?? "exhausted";
    };
    expect(mintNonce({ markerNonce: "same", random: gen })).toBe("fresh");
    expect(calls).toBe(3);
  });
});
