import { describe, expect, it } from "vitest";

import { GH_BUCKETS, classifyGh } from "@/scripts/lib/pane-compaction-core";
import { corpusRowIsWellFormed, rejectedFieldOf, unknownBucketOf } from "@/scripts/pane-compaction";
import { premiseHolds } from "@/tests/_shared/premise";

/**
 * Task 3 — the `gh` three-way (spec §4.3, §4.5 rule 6).
 *
 * WHY THIS IS THE SHARPEST CASE ON THE SURFACE. `gh pr checks` exits 1 when
 * there is no PR — and also when the token expired, the network dropped, or the
 * caller is rate-limited. Probed on this branch before its PR existed:
 *
 *   $ gh pr checks; echo $?
 *   1
 *   stdout: (empty)
 *   stderr: no pull requests found for branch "feat/orchestrator-pane-compaction"
 *
 * Read non-zero as "no PR" and a `gh` outage becomes "every pane has no PR",
 * which matches position row 8 (quiescent, Low) and yields COMPACT — silently
 * bypassing the hard WAIT on exactly the panes most dangerous to compact.
 */

const NO_PR_STDERR = 'no pull requests found for branch "feat/orchestrator-pane-compaction"';

describe("exit zero is not the same as a usable check table", () => {
  // Diff round 1, finding 2 (P0). `classifyGh` returned `checks` for ANY
  // exit-zero and left parsing to the surface, whose parse failure returned null
  // and reached no fault path. So a truncated payload became a benign
  // observation, `ghFault` stayed false, and a `--checkpoint` probe with
  // `stdout:"{"` exited 0 having SENT both bytes. AC-4 requires UNDETERMINED for
  // input outside the accept-set.
  it("faults on exit-zero stdout that does not parse", () => {
    const out = classifyGh({ exitCode: 0, stdout: "{", stderr: "" });
    expect(out.kind).toBe("fault");
  });

  it("faults on exit-zero stdout that parses but is not a check table", () => {
    // `gh` answering with an object where the caller expects rows is still an
    // answer it cannot read. Guessing four flags from it would be invention.
    const out = classifyGh({ exitCode: 0, stdout: '{"checks":[]}', stderr: "" });
    expect(out.kind).toBe("fault");
  });

  it("still accepts a real, empty check table", () => {
    // The other side, so the fix cannot be "call everything a fault": a PR with
    // no checks yet is an ordinary answer, not a broken one.
    const out = classifyGh({ exitCode: 0, stdout: "[]", stderr: "" });
    expect(out.kind).toBe("checks");
  });
});

describe("classifyGh discriminates no-PR from failure", () => {
  it("admits no-pr ONLY on the recognized signature", () => {
    const out = classifyGh({ exitCode: 1, stdout: "", stderr: NO_PR_STDERR });
    expect(out.kind).toBe("no-pr");
  });

  // Each of these is a real `gh` failure mode that shares the exit code.
  const FAULTS: ReadonlyArray<readonly [string, string]> = [
    ["expired token", "error: authentication required"],
    ["network", "error: dial tcp: lookup api.github.com: no such host"],
    ["rate limit", "error: API rate limit exceeded"],
    ["no repo access", "error: could not resolve to a Repository"],
    ["empty stderr", ""],
  ];

  it.each(FAULTS)("treats %s as a fault, never as no-pr", (_label, stderr) => {
    premiseHolds("this fault shares the no-PR exit code", true);
    const out = classifyGh({ exitCode: 1, stdout: "", stderr });
    expect(out.kind).toBe("fault");
    // The discriminating half: it must not merely be "not checks".
    expect(out.kind).not.toBe("no-pr");
  });

  it("a fault carries a detail, because rule 6 refuses BY NAME", () => {
    const out = classifyGh({ exitCode: 1, stdout: "", stderr: "error: API rate limit exceeded" });
    if (out.kind !== "fault") throw new Error("expected a fault");
    expect(out.detail).not.toBe("");
  });

  it("a no-PR-shaped stderr with NON-EMPTY stdout is a fault, because checks ran", () => {
    // The stdout conjunct, isolated. Real check output means a PR exists, so
    // whatever stderr says, this is not the no-PR case.
    const out = classifyGh({
      exitCode: 1,
      stdout: "X  build   1m2s  https://github.com/o/r/actions/runs/1",
      stderr: 'no pull requests found for branch "x"',
    });
    expect(out.kind).toBe("fault");
  });

  it("the signature match is anchored, so a PR titled after it is not a no-pr", () => {
    // A check name or PR title can contain arbitrary text, including this
    // phrase. Matching it anywhere in stderr would turn a real check failure
    // into "no PR" — the same use-versus-mention error that cost the purity
    // guard four rounds.
    const out = classifyGh({
      exitCode: 1,
      stdout: "",
      stderr: `X  build  fails: no pull requests found for branch "x" was logged`,
    });
    expect(out.kind).toBe("fault");
  });
});

/**
 * A COMPLETE §4.3 marker. Required-PRESENCE is checked before value types, so a
 * partial literal reports a missing field and a type case would pass while
 * asserting nothing about types.
 */
function fullMarker(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    branch: "feat/x",
    stage: "x",
    tasksRemaining: 0,
    next: "n",
    blockedOn: "",
    cronJobId: "c",
    sessionId: "s1",
    ...over,
  };
}

describe("the accept-set validates VALUES, not only shapes", () => {
  // Diff round 2. All four P0s were ONE class: every boundary validator checked
  // shape -- key present, is-array, parses -- and never content. Round 1's
  // finding 2 was the same class and was fixed per-instance, which is exactly
  // the whack-a-mole AGENTS.md's class-sweep rule exists to stop. These are the
  // class, swept.
  it("rejects a known marker key holding the wrong value TYPE", () => {
    // `sessionId: 123` passed a name-only accept-set and then failed rule 5's
    // `!==` against a string -- silently, since a number never matches a live
    // session id. The probe exited 0 and sent both checkpoint bytes.
    const f = rejectedFieldOf({
      status: "idle",
      tenths: 6,
      marker: fullMarker({ sessionId: 123 }),
    });
    expect(f).toContain("marker.sessionId");
    expect(f).toContain("string");
  });

  it("still accepts the correct value types", () => {
    // The other side, so the fix cannot be "reject everything with a marker".
    expect(
      rejectedFieldOf({
        status: "idle",
        tenths: 6,
        marker: fullMarker({ tasksRemaining: 3 }),
      }),
    ).toBeNull();
  });

  it("rejects a numeric field holding a string", () => {
    // Both directions of the type table, not just the string case.
    const f = rejectedFieldOf({
      status: "idle",
      tenths: 6,
      marker: fullMarker({ tasksRemaining: "3" }),
    });
    expect(f).toContain("marker.tasksRemaining");
    expect(f).toContain("number");
  });

  it("names an unrecognized gh bucket instead of absorbing it", () => {
    // `anyFailed`/`anyPending` are `some(...)` tests, so an unknown bucket reads
    // as NEITHER and the pane falls through to the cheap fallback position.
    // `[{"bucket":"mystery"}]` exited 0 and sent checkpoint bytes.
    const b = unknownBucketOf({ exitCode: 0, stdout: '[{"bucket":"mystery"}]', stderr: "" });
    expect(b).toBe("mystery");
    expect(rejectedFieldOf({ status: "idle", tenths: 6, marker: null, ghBucket: b })).toContain(
      "mystery",
    );
  });

  it("names a row carrying no bucket at all", () => {
    expect(unknownBucketOf({ exitCode: 0, stdout: "[{}]", stderr: "" })).toBe("(missing)");
  });

  it("accepts every bucket gh is known to emit", () => {
    // Derived from the shipped set rather than retyped, so the two cannot drift;
    // the case would be vacuous if the set were empty, which the premise pins.
    premiseHolds("the known-bucket set is non-empty", GH_BUCKETS.size > 0);
    const rows = JSON.stringify([...GH_BUCKETS].map((b) => ({ bucket: b })));
    expect(unknownBucketOf({ exitCode: 0, stdout: rows, stderr: "" })).toBeNull();
  });
});

describe("a corpus row is validated as a WHOLE row (spec §4.3 line 213)", () => {
  // Diff round 5, finding 2 (P0). Ingestion checked `status` alone, so a row
  // whose `stage` was a number reached position inference, which then read
  // `verdict` and `endedAt` off a row nothing had validated. Same partial-check
  // shape as the marker key walk two rounds earlier: validating the field you
  // happen to branch on is not validating the input.
  const good = {
    stage: "diff",
    round: 1,
    status: "verdict",
    verdict: "APPROVE",
    findingCount: 0,
    endedAt: "2026-01-01T00:00:00Z",
  };

  it("accepts the committed row shape", () => {
    expect(corpusRowIsWellFormed(good)).toBe(true);
  });

  it.each([
    ["stage", { ...good, stage: 3 }],
    ["round", { ...good, round: "1" }],
    ["status", { ...good, status: 7 }],
    ["verdict", { ...good, verdict: 5 }],
    ["findingCount", { ...good, findingCount: "0" }],
    ["endedAt", { ...good, endedAt: 12345 }],
  ])("rejects a row whose %s has the wrong type", (_f, row) => {
    expect(corpusRowIsWellFormed(row)).toBe(false);
  });

  it("accepts the nullable fields as null", () => {
    // `verdict`, `findingCount` and `endedAt` are legitimately null on real
    // rows -- a no_verdict row carries all three -- so the check must not
    // reject the corpus it is meant to read.
    expect(
      corpusRowIsWellFormed({ ...good, verdict: null, findingCount: null, endedAt: null }),
    ).toBe(true);
  });
});
