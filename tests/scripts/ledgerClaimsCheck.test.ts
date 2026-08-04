/**
 * `--check` exit-code semantics and universe verification.
 *
 * Exit codes are load-bearing and distinct (spec §3.3):
 *   0 = no collision (or inferred-only, printed as WARN)
 *   1 = a DECLARED collision with POSITIVELY RESOLVED identity
 *   2 = the check could not be trusted
 *
 * Collapsing 1 and 2 is the defect: it tells an operator "another live branch
 * declares that row" when the claim may be their own, or when the reader never
 * verified the branch universe at all.
 */
import { describe, expect, it } from "vitest";

import { type GitSurface } from "@/scripts/lib/ledger-claims-core";
import { runCheck, verifyUniverse } from "@/scripts/lib/ledger-check";

const MARKER = (branch: string, id: string) =>
  `## ${id} — planted\n\n**Status:** IN PROGRESS · **Branch:** ${branch}\n`;

const NOW = 1_760_000_000;

function fake(over: Partial<GitSurface> = {}): GitSurface {
  return {
    fetch: () => {},
    lsRemote: () => new Map([["main", "aaa"], ["feat/a", "bbb"]]),
    localRefs: () => new Map([["main", "aaa"], ["feat/a", "bbb"]]),
    prList: () => [],
    mergedIntoMain: () => [],
    showFile: (ref, file) =>
      file === "BACKLOG.md" && ref === "origin/feat/a" ? MARKER("feat/a", "BL-X") : null,
    mergeBase: () => "base",
    diffHunks: () => [],
    tipEpoch: () => NOW,
    isShallow: () => false,
    currentBranch: () => null,
    headRepo: () => null,
    repo: () => null,
    inCI: () => false,
    ...over,
  };
}

const check = (git: GitSurface, ids: string[], extra: Record<string, unknown> = {}) =>
  runCheck(git, ids, { now: NOW, fetch: false, ...extra });

describe("--check exit codes", () => {
  it("exits 1 on a declared collision with resolved identity", () => {
    const r = check(fake({ inCI: () => false, currentBranch: () => "other" }), ["BL-X"]);
    expect(r.code).toBe(1);
    expect(r.collisions.map((c) => c.branch)).toEqual(["feat/a"]);
  });

  it("exits 0 when the only claim is the caller's own branch", () => {
    const r = check(fake({ inCI: () => false, currentBranch: () => "feat/a" }), ["BL-X"]);
    expect(r.code).toBe(0);
  });

  it("exits 0 with a WARN on an inferred-only collision", () => {
    // Advisory in EVERY identity case: a signal that can fail a run is not advisory.
    const r = check(
      fake({
        showFile: (ref, f) =>
          f === "BACKLOG.md" && ref === "origin/feat/a" ? "## BL-Z — plain\n\nbody\n" : null,
        diffHunks: () => [{ file: "BACKLOG.md", start: 1, count: 3 }],
        currentBranch: () => "other",
      }),
      ["BL-Z"],
    );
    expect(r.code).toBe(0);
    expect(r.warnings.join(" ")).toContain("BL-Z");
  });

  it("exits 2 on zero ids", () => {
    expect(check(fake(), []).code).toBe(2);
  });

  it("exits 2 for a DECLARED claim found while identity is unresolved", () => {
    // Not 1: without knowing who you are, the claim may be your own. Exit 2 says
    // the check is untrusted rather than deciding wrongly.
    const r = check(fake({ inCI: () => true, headRepo: () => null, currentBranch: () => "feat/a" }), ["BL-X"]);
    expect(r.code).toBe(2);
  });

  it("normalizes lowercase and backticked ids, and de-duplicates", () => {
    const r = check(fake({ currentBranch: () => "other" }), ["`bl-x`", "BL-X"]);
    expect(r.code).toBe(1);
    expect(r.collisions).toHaveLength(1);
  });

  it("notes an id defined nowhere without failing", () => {
    const r = check(fake({ currentBranch: () => "other" }), ["BL-NOT-A-ROW"]);
    expect(r.code).toBe(0);
    expect(r.notes.join(" ")).toContain("BL-NOT-A-ROW");
  });
});

describe("universe verification", () => {
  const maps = (local: [string, string][], remote: [string, string][]) => ({
    local: new Map(local),
    remote: new Map(remote),
  });

  it("accepts an identical map", () => {
    const { local, remote } = maps([["main", "a"], ["feat/a", "b"]], [["main", "a"], ["feat/a", "b"]]);
    expect(verifyUniverse(local, remote).ok).toBe(true);
  });

  it("rejects a changed OID under an unchanged name", () => {
    // The real 52247dcd1 shape: every name matches, the resolved tip carries 0
    // declarations and the remote tip carries 2. A name-only check reports a
    // verified universe with zero claims.
    const { local, remote } = maps([["main", "a"], ["feat/a", "OLD"]], [["main", "a"], ["feat/a", "NEW"]]);
    const v = verifyUniverse(local, remote);
    expect(v.ok).toBe(false);
    expect(v.reasons.join(" ")).toContain("feat/a");
  });

  it("rejects an extra local name the remote does not advertise", () => {
    const { local, remote } = maps([["main", "a"], ["gone", "b"]], [["main", "a"]]);
    expect(verifyUniverse(local, remote).ok).toBe(false);
  });

  it("rejects a remote name missing locally, with every shared OID matching", () => {
    // The narrowed-refspec case: a fetch that resolves only main still exits 0.
    const { local, remote } = maps([["main", "a"]], [["main", "a"], ["claimed", "b"]]);
    expect(verifyUniverse(local, remote).ok).toBe(false);
  });

  it("rejects equal-cardinality substitution", () => {
    const { local, remote } = maps([["main", "a"], ["stale", "x"]], [["main", "a"], ["claimed", "y"]]);
    expect(verifyUniverse(local, remote).ok).toBe(false);
  });

  it("rejects a strictly LARGER local map whose extras conceal a missing name", () => {
    // A count-based check trusts this one: local is bigger, so nothing "shrank".
    const { local, remote } = maps(
      [["main", "a"], ["stale-a", "x"], ["stale-b", "y"]],
      [["main", "a"], ["claimed", "z"]],
    );
    expect(verifyUniverse(local, remote).ok).toBe(false);
  });

  it("ignores origin/HEAD, which ls-remote never advertises", () => {
    // Without this, EVERY healthy repository exits 2 forever.
    const { local, remote } = maps([["main", "a"], ["HEAD", "a"]], [["main", "a"]]);
    expect(verifyUniverse(local, remote).ok).toBe(true);
  });
});

describe("--check on a degraded universe", () => {
  it("exits 2 when the head map disagrees, even with no collision", () => {
    const r = check(
      fake({ lsRemote: () => new Map([["main", "aaa"], ["feat/a", "CHANGED"]]), currentBranch: () => "other" }),
      ["BL-UNRELATED"],
      { verify: true },
    );
    expect(r.code).toBe(2);
  });

  it("exits 2 when ls-remote itself throws", () => {
    // An uncaught throw exits 1, which §3.3 defines as another branch's claim —
    // an environment fault reported as somebody else's work.
    const r = check(
      fake({
        lsRemote: () => {
          throw new Error("could not read Username");
        },
        currentBranch: () => "other",
      }),
      ["BL-UNRELATED"],
      { verify: true },
    );
    expect(r.code).toBe(2);
  });

  it("exits 2 when no origin refs resolve at all", () => {
    const r = check(fake({ localRefs: () => new Map(), lsRemote: () => new Map() }), ["BL-X"], {
      verify: true,
    });
    expect(r.code).toBe(2);
  });

  it("exits 2 when a non-empty ledger parses zero entries", () => {
    // A whole ledger disappearing is the same false-all-clear class as an
    // unverified universe, reached through a different door.
    const r = check(
      fake({ showFile: () => "this file is not empty but has no entries\n", currentBranch: () => "other" }),
      ["BL-X"],
      { verify: true },
    );
    expect(r.code).toBe(2);
  });

  it("still exits 1 for a collision beyond the 100-branch display cap", () => {
    // The cap is a DISPLAY limit. A collision hidden behind it is a real
    // collision, and a "everything degraded exits 2" rule would mask it.
    const many: [string, string][] = [["main", "a"]];
    for (let i = 0; i < 101; i++) many.push([`b${i}`, `oid${i}`]);
    const r = check(
      fake({
        localRefs: () => new Map(many),
        lsRemote: () => new Map(many),
        showFile: (ref, f) =>
          f === "BACKLOG.md" && ref === "origin/b100" ? MARKER("b100", "BL-DEEP") : null,
        currentBranch: () => "other",
      }),
      ["BL-DEEP"],
      { verify: true },
    );
    expect(r.code).toBe(1);
  });
});
