import { describe, expect, it } from "vitest";

import { classifyGh } from "@/scripts/lib/pane-compaction-core";
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
