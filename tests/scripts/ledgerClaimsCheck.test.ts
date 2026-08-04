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

import { type GitSurface, resolveClaims } from "@/scripts/lib/ledger-claims-core";
import { runCheck, verifyUniverse } from "@/scripts/lib/ledger-check";

const MARKER = (branch: string, id: string) =>
  `## ${id} — planted\n\n**Status:** IN PROGRESS · **Branch:** ${branch}\n`;

import { spawnSync } from "node:child_process";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const NOW = 1_760_000_000;

function fake(over: Partial<GitSurface> = {}): GitSurface {
  // fileOids/readBlob are DERIVED from whatever showFile the case supplies, so
  // every existing fixture keeps meaning what it meant when the reader batched
  // its blob reads. A fixture that overrides showFile still drives both.
  const base: GitSurface = {
    fetch: () => {},
    lsRemote: () =>
      new Map([
        ["main", "aaa"],
        ["feat/a", "bbb"],
      ]),
    localRefs: () =>
      new Map([
        ["main", "aaa"],
        ["feat/a", "bbb"],
      ]),
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
    fileOids: (refOrOid, files) => {
      // The reader pins content reads to the VERIFIED TIP OID, so this receives
      // an OID in normal operation. Fixtures are written against branch names,
      // so resolve an OID back to its ref before delegating to showFile — the
      // fixture keeps meaning what it says.
      const refs = (over.localRefs ?? base.localRefs)();
      let ref = refOrOid;
      for (const [name, oid] of refs) if (oid === refOrOid) ref = `origin/${name}`;
      const m = new Map<string, string>();
      for (const f of files) {
        const t = (over.showFile ?? base.showFile)(ref, f);
        if (t !== null) m.set(f, `oid:${ref}:${f}`);
      }
      return m;
    },
    readBlob: (oid) => {
      const [, ref, file] = oid.split(":");
      return (over.showFile ?? base.showFile)(ref ?? "", file ?? "") ?? "";
    },
    ...over,
  };
  return base;
}

const check = (git: GitSurface, ids: string[], extra: Record<string, unknown> = {}) =>
  runCheck(git, ids, { now: NOW, fetch: false, ...extra });

/**
 * Verification implies a fetch: `--no-fetch` is a NO-NETWORK contract, and
 * `ls-remote` is a network call, so verify is only meaningful on the fetching
 * path. This is what a real `--check` invocation looks like.
 */
const checkVerified = (git: GitSurface, ids: string[], extra: Record<string, unknown> = {}) =>
  runCheck(git, ids, { now: NOW, fetch: true, verify: true, ...extra });

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
    const r = check(
      fake({ inCI: () => true, headRepo: () => null, currentBranch: () => "feat/a" }),
      ["BL-X"],
    );
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
    const { local, remote } = maps(
      [
        ["main", "a"],
        ["feat/a", "b"],
      ],
      [
        ["main", "a"],
        ["feat/a", "b"],
      ],
    );
    expect(verifyUniverse(local, remote).ok).toBe(true);
  });

  it("rejects a changed OID under an unchanged name", () => {
    // The real 52247dcd1 shape: every name matches, the resolved tip carries 0
    // declarations and the remote tip carries 2. A name-only check reports a
    // verified universe with zero claims.
    const { local, remote } = maps(
      [
        ["main", "a"],
        ["feat/a", "OLD"],
      ],
      [
        ["main", "a"],
        ["feat/a", "NEW"],
      ],
    );
    const v = verifyUniverse(local, remote);
    expect(v.ok).toBe(false);
    expect(v.reasons.join(" ")).toContain("feat/a");
  });

  it("rejects an extra local name the remote does not advertise", () => {
    const { local, remote } = maps(
      [
        ["main", "a"],
        ["gone", "b"],
      ],
      [["main", "a"]],
    );
    expect(verifyUniverse(local, remote).ok).toBe(false);
  });

  it("rejects a remote name missing locally, with every shared OID matching", () => {
    // The narrowed-refspec case: a fetch that resolves only main still exits 0.
    const { local, remote } = maps(
      [["main", "a"]],
      [
        ["main", "a"],
        ["claimed", "b"],
      ],
    );
    expect(verifyUniverse(local, remote).ok).toBe(false);
  });

  it("rejects equal-cardinality substitution", () => {
    const { local, remote } = maps(
      [
        ["main", "a"],
        ["stale", "x"],
      ],
      [
        ["main", "a"],
        ["claimed", "y"],
      ],
    );
    expect(verifyUniverse(local, remote).ok).toBe(false);
  });

  it("rejects a strictly LARGER local map whose extras conceal a missing name", () => {
    // A count-based check trusts this one: local is bigger, so nothing "shrank".
    const { local, remote } = maps(
      [
        ["main", "a"],
        ["stale-a", "x"],
        ["stale-b", "y"],
      ],
      [
        ["main", "a"],
        ["claimed", "z"],
      ],
    );
    expect(verifyUniverse(local, remote).ok).toBe(false);
  });

  it("ignores origin/HEAD, which ls-remote never advertises", () => {
    // Without this, EVERY healthy repository exits 2 forever.
    const { local, remote } = maps(
      [
        ["main", "a"],
        ["HEAD", "a"],
      ],
      [["main", "a"]],
    );
    expect(verifyUniverse(local, remote).ok).toBe(true);
  });
});

describe("--check on a degraded universe", () => {
  it("exits 2 when the head map disagrees, even with no collision", () => {
    const r = checkVerified(
      fake({
        lsRemote: () =>
          new Map([
            ["main", "aaa"],
            ["feat/a", "CHANGED"],
          ]),
        currentBranch: () => "other",
      }),
      ["BL-UNRELATED"],
    );
    expect(r.code).toBe(2);
  });

  it("exits 2 when ls-remote itself throws", () => {
    // An uncaught throw exits 1, which §3.3 defines as another branch's claim —
    // an environment fault reported as somebody else's work.
    const r = checkVerified(
      fake({
        lsRemote: () => {
          throw new Error("could not read Username");
        },
        currentBranch: () => "other",
      }),
      ["BL-UNRELATED"],
    );
    expect(r.code).toBe(2);
  });

  it("exits 2 when no origin refs resolve at all", () => {
    const r = checkVerified(
      fake({ localRefs: () => new Map(), lsRemote: () => new Map() }),
      ["BL-X"],
      {
        verify: true,
      },
    );
    expect(r.code).toBe(2);
  });

  it("exits 2 when a non-empty ledger parses zero entries", () => {
    // A whole ledger disappearing is the same false-all-clear class as an
    // unverified universe, reached through a different door.
    const r = checkVerified(
      fake({
        showFile: () => "this file is not empty but has no entries\n",
        currentBranch: () => "other",
      }),
      ["BL-X"],
    );
    expect(r.code).toBe(2);
  });

  it("still exits 1 for a collision beyond the 100-branch display cap", () => {
    // The cap is a DISPLAY limit. A collision hidden behind it is a real
    // collision, and a "everything degraded exits 2" rule would mask it.
    const many: [string, string][] = [["main", "a"]];
    for (let i = 0; i < 101; i++) many.push([`b${i}`, `oid${i}`]);
    const r = checkVerified(
      fake({
        localRefs: () => new Map(many),
        lsRemote: () => new Map(many),
        showFile: (ref, f) =>
          f === "BACKLOG.md" && ref === "origin/b100" ? MARKER("b100", "BL-DEEP") : null,
        currentBranch: () => "other",
      }),
      ["BL-DEEP"],
    );
    expect(r.code).toBe(1);
  });
});

describe("untrusted dominates a collision (whole-diff review F1)", () => {
  // Exit 1 asserts "another live branch declares this row" — a positive claim
  // about the world. It may only be made from a universe that was verified.
  // Returning 1 from an unverifiable universe is the same error as returning 0.
  it("exits 2, not 1, when ls-remote fails and a collision is also present", () => {
    const r = checkVerified(
      fake({
        lsRemote: () => {
          throw new Error("auth failed");
        },
        currentBranch: () => "other",
      }),
      ["BL-X"],
    );
    expect(r.code).toBe(2);
    expect(r.collisions, "the finding is still reported, just not as decided").toHaveLength(1);
  });

  it("exits 2, not 1, when the head map mismatches and a collision is present", () => {
    const r = checkVerified(
      fake({
        lsRemote: () =>
          new Map([
            ["main", "aaa"],
            ["feat/a", "CHANGED"],
          ]),
        currentBranch: () => "other",
      }),
      ["BL-X"],
    );
    expect(r.code).toBe(2);
  });

  it("exits 2, not 0, when the fetch failed and no collision was found", () => {
    // Cached refs may predate the very push being checked for.
    const r = checkVerified(
      fake({
        fetch: () => {
          throw new Error("network down");
        },
        currentBranch: () => "other",
      }),
      ["BL-UNRELATED"],
      { verify: true, fetch: true },
    );
    expect(r.code).toBe(2);
  });
});

describe("the real git adapter and the JSON envelope (whole-diff F3/F9)", () => {
  it("parses is-shallow-repository as a STRING, not for truthiness", async () => {
    // git prints the literal "false". Boolean("false") is true, which would call
    // every full clone shallow and disable the merged-exclusion permanently.
    const { realGitSurface } = await import("@/scripts/lib/ledger-git");
    const { execFileSync } = await import("node:child_process");
    const truth =
      execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
        cwd: ROOT,
        encoding: "utf8",
      }).trim() === "true";
    // Asserted against git's OWN answer, not against this checkout's shape: a
    // local full clone and a CI shallow checkout give opposite values, and
    // hardcoding either makes the test environment-dependent rather than
    // behavioural. Under a Boolean(output) mutant this returns true in BOTH
    // environments, so it fails wherever git says "false".
    expect(realGitSurface().isShallow()).toBe(truth);
  });

  it("resolves real refs, and origin/HEAD is absent from both maps", async () => {
    const { realGitSurface } = await import("@/scripts/lib/ledger-git");
    const local = realGitSurface().localRefs();
    expect(local.size, "no refs resolved from a real worktree").toBeGreaterThan(0);
    expect([...local.keys()], "origin/HEAD must never enter the map").not.toContain("HEAD");
    for (const oid of local.values()) expect(oid).toMatch(/^[0-9a-f]{40}$/);
  });

  it("attaches a base-repo PR number and never a fork's", () => {
    // prList is display-only, but a fork PR sharing a head name must not attach
    // its number to the base branch's claim.
    const r = resolveClaims(
      fake({
        prList: () => [
          {
            number: 999,
            headRefName: "feat/a",
            headRepositoryOwner: "fork",
            isCrossRepository: true,
          },
          {
            number: 689,
            headRefName: "feat/a",
            headRepositoryOwner: "base",
            isCrossRepository: false,
          },
        ],
      }),
      { fetch: false, now: NOW },
    );
    expect(r.claims[0]?.pr, "the base PR, not the fork's").toBe(689);
  });

  it("emits every claim through the CLI's --json serialization, uncapped", async () => {
    // Observes the CLI, not resolveClaims: the M8 mutant lives in
    // scripts/ledger-claims.ts's envelope (`res.claims.slice(0, 100)`), so a
    // core-level assertion cannot see it. Runs the real CLI and parses stdout.
    const r = spawnSync(
      process.execPath,
      ["--import", "tsx", join(ROOT, "scripts/ledger-claims.ts"), "--json", "--no-fetch"],
      { cwd: ROOT, encoding: "utf8", timeout: 90_000 },
    );
    expect(r.status, `CLI failed: ${r.stderr}`).toBe(0);
    const payload = JSON.parse(r.stdout) as {
      status: string;
      degraded: string[];
      claims: unknown[];
    };
    // The envelope shape itself, which a bare array would fail.
    expect(Array.isArray(payload), "must be an object, not a bare array").toBe(false);
    // CARDINALITY, not just shape: without this, `claims: res.claims.slice(0, 100)`
    // or even `claims: []` passes, restoring the machine-consumer false all-clear
    // that the uncapped contract exists to prevent. Asserted against the core's
    // own count so it cannot rot as the corpus changes.
    const { realGitSurface } = await import("@/scripts/lib/ledger-git");
    const core = resolveClaims(realGitSurface(), { fetch: false });
    expect(payload.claims.length, "the CLI truncated what the core resolved").toBe(
      core.claims.length,
    );
    expect(payload).toHaveProperty("status");
    expect(payload).toHaveProperty("degraded");
    expect(Array.isArray(payload.claims)).toBe(true);
    // A healthy-empty run and a degraded run must be distinguishable.
    expect(payload.degraded).toContain("no-fetch-cached-refs");
  });

  it("resolves every claim past the display limit at the core", () => {
    // M8: `claims.slice(0, 100)` is the mutant. The cap is a display concern;
    // a machine consumer receiving a truncated set with no marker computes a
    // false all-clear.
    const many: [string, string][] = [["main", "a"]];
    for (let i = 0; i < 101; i++) many.push([`b${i}`, `oid${i}`]);
    const r = resolveClaims(
      fake({
        localRefs: () => new Map(many),
        lsRemote: () => new Map(many),
        showFile: (ref, f) =>
          f === "BACKLOG.md" ? MARKER(ref.replace("origin/", ""), "BL-MANY") : null,
      }),
      { fetch: false, now: NOW },
    );
    expect(r.claims.length, "every candidate must appear").toBe(101);
  });
});

describe("ordering and identity edges (whole-diff R3)", () => {
  it("fetches BEFORE snapshotting refs", () => {
    // A pre-fetch snapshot resolves a stale view while verifying against the
    // post-fetch remote, so a branch this run just fetched is advertised but
    // unresolved — exit 2 until someone reruns.
    const calls: string[] = [];
    const g = fake({
      fetch: () => calls.push("fetch"),
      localRefs: () => {
        calls.push("localRefs");
        return new Map([
          ["main", "aaa"],
          ["feat/a", "bbb"],
        ]);
      },
    });
    runCheck(g, ["BL-UNRELATED"], { now: NOW, fetch: true, verify: true });
    expect(calls.indexOf("fetch"), "fetch must precede the snapshot").toBeLessThan(
      calls.indexOf("localRefs"),
    );
  });

  it("exits 2, not 1, on a detached HEAD with a collision", () => {
    // Self cannot be established, so accusing another branch is a claim the run
    // is not in a position to make.
    const r = checkVerified(fake({ inCI: () => false, currentBranch: () => null }), ["BL-X"]);
    expect(r.code).toBe(2);
  });

  it("still exits 1 on a fork PR, where nothing is self BY RESOLUTION", () => {
    // Distinct from unresolved: a fork PR genuinely knows no base ref is "me".
    const r = checkVerified(
      fake({
        inCI: () => true,
        headRepo: () => "fork/x",
        repo: () => "base/x",
        currentBranch: () => "feat/a",
      }),
      ["BL-X"],
    );
    expect(r.code).toBe(1);
  });
});

describe("git faults are untrusted, never collisions (whole-diff R5)", () => {
  it("exits 2 when showFile throws mid-resolution", () => {
    // Letting it propagate exits the process 1, which §3.3 defines as "another
    // live branch declares this row" — an infrastructure fault reported as work.
    const r = checkVerified(
      fake({
        showFile: () => {
          throw new Error("object read failed");
        },
      }),
      ["BL-X"],
    );
    expect(r.code).toBe(2);
  });

  it("exits 2 when ref enumeration throws", () => {
    // An unknown universe, not an empty one: returning {} reads as "nothing is
    // in flight", which is the false all-clear this tool exists to remove.
    const r = checkVerified(
      fake({
        localRefs: () => {
          throw new Error("for-each-ref failed");
        },
      }),
      ["BL-X"],
    );
    expect(r.code).toBe(2);
  });
});

describe("post-resolution faults are also untrusted (whole-diff R6)", () => {
  it("exits 2 when a read fails AFTER resolution, during vacuity or lookup", () => {
    // R5 wrapped only the resolution call. A fault in the per-file vacuity scan
    // or the undefined-id lookup still escaped as process exit 1, which means
    // "another branch declares this row".
    let calls = 0;
    const r = checkVerified(
      fake({
        showFile: (ref, f) => {
          calls += 1;
          if (calls > 2) throw new Error("object read failed after resolution");
          return f === "BACKLOG.md" && ref === "origin/feat/a" ? MARKER("feat/a", "BL-X") : null;
        },
      }),
      ["BL-X"],
    );
    expect(r.code).toBe(2);
  });
});

describe("content is read from the verified OID (whole-diff R10 F2)", () => {
  it("does not read content through a movable branch name", () => {
    // Verifying `feat/a == tipA` and then reading `origin/feat/a` decides against
    // whatever that name points at by read time. An A->B->A force-push race
    // verifies tipA while the content came from B — a trusted false all-clear.
    const asked: string[] = [];
    resolveClaims(
      fake({
        localRefs: () =>
          new Map([
            ["main", "aaa"],
            ["feat/a", "TIP-A"],
          ]),
        fileOids: (refOrOid) => {
          asked.push(refOrOid);
          return new Map();
        },
      }),
      { fetch: false, now: NOW },
    );
    expect(asked, "content must be requested by OID, not by branch name").toEqual(["TIP-A"]);
  });
});
