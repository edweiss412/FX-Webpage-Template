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
import { afterAll, describe, expect, it } from "vitest";

import { premise, premiseHolds } from "@/tests/_shared/premise";

import { type GitSurface, resolveClaims } from "@/scripts/lib/ledger-claims-core";
import { reportEnvelope } from "@/scripts/ledger-claims";
import { realGitSurface } from "@/scripts/lib/ledger-git";
import { runCheck, verifyUniverse } from "@/scripts/lib/ledger-check";

const MARKER = (branch: string, id: string) =>
  `## ${id} — planted\n\n**Status:** IN PROGRESS · **Branch:** ${branch}\n`;

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
/** The absolute tsx bin, per tests/cross-cutting/no-npx-tsx-spawn.test.ts. */
const TSX_BIN = join(ROOT, "node_modules/.bin/tsx");
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
    mergedIntoMain: () => new Map(),
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

/** 101 branches each declaring one row -- past any plausible display cap. */
function manyClaims() {
  const many: [string, string][] = [["main", "a"]];
  for (let i = 0; i < 101; i++) many.push([`b${i}`, `oid${i}`]);
  return resolveClaims(
    fake({
      localRefs: () => new Map(many),
      lsRemote: () => new Map(many),
      showFile: (ref, f) =>
        f === "BACKLOG.md" ? MARKER(ref.replace("origin/", ""), "BL-MANY") : null,
    }),
    { fetch: false, now: NOW },
  );
}

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
  it("parses is-shallow-repository as a STRING, against BOTH values", async () => {
    // git prints the literal "false". Boolean("false") is true, which would
    // call every full clone shallow and disable the merged-exclusion forever.
    //
    // Asserted against a CONSTRUCTED pair, not the ambient checkout. The
    // version this replaces compared isShallow() to git's answer in the same
    // repository, and CI's checkout is shallow -- so `truth` was true, the
    // Boolean(out) mutant returned true, and the guard could not discriminate
    // in exactly the environment that merge-gates. Its own comment conceded it
    // "fails wherever git says false", which is a developer's full clone and
    // not CI (spec §3.3.4).
    //
    // Both arms are required: with only the shallow arm, Boolean(out) still
    // passes.
    const { realGitSurface } = await import("@/scripts/lib/ledger-git");
    const full = mkdtempSync(join(tmpdir(), "ledger-full-"));
    const shallow = mkdtempSync(join(tmpdir(), "ledger-shallow-"));
    const prev = process.env.LEDGER_GIT_ROOT;
    try {
      const g = (cwd: string, ...args: string[]) =>
        execFileSync("git", args, { cwd, encoding: "utf8", timeout: 30_000 });
      g(full, "init", "--quiet", "--initial-branch=main");
      g(full, "config", "user.email", "t@example.com");
      g(full, "config", "user.name", "t");
      g(full, "commit", "--quiet", "--allow-empty", "-m", "one");
      g(full, "commit", "--quiet", "--allow-empty", "-m", "two");
      execFileSync("git", ["clone", "--quiet", "--depth", "1", `file://${full}`, shallow], {
        encoding: "utf8",
        timeout: 60_000,
      });

      for (const [expected, repo] of [
        [false, full],
        [true, shallow],
      ] as const) {
        process.env.LEDGER_GIT_ROOT = repo;
        // The fixture's own premise: git must agree the repo has the shape this
        // arm is named for, or the arm proves nothing about the reader.
        const asGit =
          execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
            cwd: repo,
            encoding: "utf8",
          }).trim() === "true";
        premiseHolds(
          `the constructed repo is ${expected ? "shallow" : "full"}`,
          asGit === expected,
        );
        expect(realGitSurface().isShallow(), `shallow=${expected}`).toBe(expected);
      }
    } finally {
      if (prev === undefined) delete process.env.LEDGER_GIT_ROOT;
      else process.env.LEDGER_GIT_ROOT = prev;
      rmSync(full, { recursive: true, force: true });
      rmSync(shallow, { recursive: true, force: true });
    }
  });

  it("resolves real refs, and origin/HEAD is absent from both maps", async () => {
    // Against a CONTROLLED ref namespace, not the live checkout. CI checks out a
    // single branch with no refs/remotes/origin/* at all, so every assertion
    // here -- cardinality, HEAD exclusion, the OID shape loop -- is satisfied by
    // an adapter that returns an empty map, in exactly the environment this was
    // written to survive (whole-diff R13 F3). A throwaway repository gives the
    // adapter something real to disagree with, and touches nothing tracked.
    const repo = mkdtempSync(join(tmpdir(), "ledger-refs-"));
    const g = (...args: string[]) =>
      execFileSync("git", args, { cwd: repo, encoding: "utf8", timeout: 30_000 });
    g("init", "--quiet", "--initial-branch=main");
    g("config", "user.email", "t@example.com");
    g("config", "user.name", "t");
    g("commit", "--quiet", "--allow-empty", "-m", "base");
    const head = g("rev-parse", "HEAD").trim();
    for (const name of ["main", "feat/one", "feat/two"]) {
      g("update-ref", `refs/remotes/origin/${name}`, head);
    }
    // The alias the reader must never surface as a branch named "origin".
    g("update-ref", "refs/remotes/origin/HEAD", head);
    // The construction is this test's whole premise. If it silently produced no
    // refs, every assertion below -- cardinality, HEAD exclusion, the OID shape
    // loop -- would be satisfied by an adapter returning an empty map, which is
    // precisely the vacuity the throwaway repository exists to remove.
    premise(
      "the constructed repo has refs for the reader to disagree with",
      g("for-each-ref", "--format=%(refname)", "refs/remotes/origin/").trim().split("\n").length,
      1,
    );

    const { realGitSurface } = await import("@/scripts/lib/ledger-git");
    const prev = process.env.LEDGER_GIT_ROOT;
    process.env.LEDGER_GIT_ROOT = repo;
    try {
      const local = realGitSurface().localRefs();
      expect([...local.keys()].sort(), "the reader disagrees with the refs that exist").toEqual([
        "feat/one",
        "feat/two",
        "main",
      ]);
      expect([...local.keys()], "origin/HEAD must never enter the map").not.toContain("HEAD");
      for (const oid of local.values()) expect(oid).toMatch(/^[0-9a-f]{40}$/);
    } finally {
      if (prev === undefined) delete process.env.LEDGER_GIT_ROOT;
      else process.env.LEDGER_GIT_ROOT = prev;
      rmSync(repo, { recursive: true, force: true });
    }
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
    const r = spawnSync(TSX_BIN, [join(ROOT, "scripts/ledger-claims.ts"), "--json", "--no-fetch"], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 90_000,
      // THE READER MUST NOT BE THE CAP. Node's default `maxBuffer` truncates
      // stdout at 1 MB, and the pipe delivers in 8 KB chunks — a large enough
      // claim set made `JSON.parse` throw "Unterminated string at position
      // 8192" instead of failing on anything about the CLI. A test whose whole
      // subject is "uncapped" cannot impose a cap of its own: with a modest
      // corpus it passes, and it starts failing the moment there is enough
      // real data for the assertion to be interesting.
      maxBuffer: 64 * 1024 * 1024,
    });
    expect(r.status, `CLI failed: ${r.stderr}`).toBe(0);
    // Everything below parses stdout. If the CLI produced none, JSON.parse
    // throws for an incidental reason rather than this test discriminating
    // anything -- state it instead of relying on the accident.
    premise("the CLI produced output to parse", r.stdout.trim().length, 0);
    // The direct-invocation guard is fail-OPEN if it breaks: a false
    // `process.argv[1] === fileURLToPath(import.meta.url)` makes the CLI exit 0
    // having done nothing, and preflight would print an empty claim list that
    // reads exactly like "nothing is in flight". JSON.parse below happens to
    // throw on empty stdout, but incidentally; this states it.
    expect(
      r.stdout.trim().length,
      "the CLI produced nothing — its direct-invocation guard did not fire",
    ).toBeGreaterThan(0);
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
    if (core.claims.length === 0) {
      // Stated rather than hidden: CI checks this repository out with zero
      // refs/remotes/origin/*, so both sides are 0 there and this comparison
      // cannot tell a correct envelope from `claims: []`. It is the same
      // degenerate-truth-source shape as whole-diff R13 (spec §1.2). The
      // cardinality contract itself is proven against a CONSTRUCTED 101-claim
      // corpus in the reportEnvelope case below, which is reachable in every
      // environment -- so this branch asserts what it can and claims no more.
      expect(payload.claims).toEqual([]);
    } else {
      expect(payload.claims.length, "the CLI truncated what the core resolved").toBe(
        core.claims.length,
      );
    }
    expect(payload).toHaveProperty("status");
    expect(payload).toHaveProperty("degraded");
    expect(Array.isArray(payload.claims)).toBe(true);
    // A healthy-empty run and a degraded run must be distinguishable.
    expect(payload.degraded).toContain("no-fetch-cached-refs");
    // 120 s explicit, against a 30 s default that sat BELOW the 90 s budget this
    // test grants its own child. A cold tsx spawn measured 20.5 s idle and 55 s
    // under load; inside the mutation harness's per-mutant child runs, the
    // 30 s cap flaked, the child exited 1, and the runner scored the mutant
    // KILLED -- which read every ledgerGit accepted row as stale at once (all
    // twelve, including the three timeout constants no test can kill) on the
    // 2026-08-09 PR run of the nightly gate. A test must not time out before
    // the child it is waiting on.
  }, 120_000);

  it("resolves every claim past the display limit at the core", () => {
    // M8, half one: the cap is a display concern, and a machine consumer given a
    // truncated set with no marker computes a false all-clear.
    expect(manyClaims().claims.length, "every candidate must appear").toBe(101);
  });

  it("serializes every claim past the display limit through the CLI's own envelope", () => {
    // M8, half two, and the one that actually pins the mutant. The named mutant
    // -- `claims: res.claims.slice(0, 100)` -- lives in scripts/ledger-claims.ts,
    // not the core, so the assertion above cannot see it. Neither could the
    // end-to-end CLI test: it runs against the live repository, which has ~13
    // claims, so a cap at 100 is unreachable there and the advertised guard could
    // not fail against the mutation it names (whole-diff R11 F3).
    //
    // `reportEnvelope` is exported for exactly this: the CLI's serialization,
    // fed the 101-claim fixture the live repo cannot supply.
    const res = manyClaims();
    expect(res.claims.length, "fixture premise: past any plausible cap").toBe(101);
    const payload = reportEnvelope(res);
    expect(payload.claims.length, "the CLI envelope truncated the resolved set").toBe(101);
    // Shape too, so `claims: []` and a bare array both still fail here.
    expect(Array.isArray(payload)).toBe(false);
    expect(payload.status).toBe(0);
    expect(payload.claims.map((c) => c.branch)).toEqual(res.claims.map((c) => c.branch));
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
    const fetchAt = calls.indexOf("fetch");
    const snapshotAt = calls.indexOf("localRefs");
    // Without these, deleting git.fetch() entirely LEAVES THIS TEST GREEN:
    // indexOf returns -1 for the absent event and -1 is less than every real
    // index. Probed against that mutant -- it passed. An ordering guard that
    // holds when the first event never happens is the defect this whole arc is
    // about (spec §1.4.1, vacuity shape V3).
    premise("fetch occurred at all; an absent event indexes to -1", fetchAt, -1);
    premise("the snapshot occurred at all; an absent event indexes to -1", snapshotAt, -1);
    expect(fetchAt, "fetch must precede the snapshot").toBeLessThan(snapshotAt);
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

/**
 * The real git adapter, against repositories the fixtures BUILD
 * (guard-premise-reachability, Task 8).
 *
 * `scripts/lib/ledger-git.ts` is the only module that spawns, and until now it
 * was exercised almost entirely through the ambient checkout — which CI clones
 * with zero `refs/remotes/origin/*`, so most of the adapter's behavior was
 * asserted by nothing there (spec §1.2, §1.3). Every case below constructs the
 * repository, remote, ref namespace or environment it asserts against, so its
 * verdict is the same in a full clone and in CI. That is not a style
 * preference: a mutant whose verdict depends on where it ran may not be
 * ledgered at all (spec AC-6).
 *
 * `gitRoot()` honours `LEDGER_GIT_ROOT` only under vitest
 * (`scripts/lib/ledger-git.ts:25-30`), which is what makes this possible while
 * production stays unredirectable.
 */
const scratchDirs: string[] = [];

afterAll(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway repository with one empty commit, and a runner bound to it. */
function throwawayRepo(): { dir: string; g: (...args: string[]) => string; head: string } {
  const dir = mkdtempSync(join(tmpdir(), "ledger-git-"));
  scratchDirs.push(dir);
  const g = (...args: string[]) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8", timeout: 30_000 });
  g("init", "--quiet", "--initial-branch=main");
  g("config", "user.email", "t@example.com");
  g("config", "user.name", "t");
  g("commit", "--quiet", "--allow-empty", "-m", "base");
  return { dir, g, head: g("rev-parse", "HEAD").trim() };
}

/**
 * Runs `fn` with the adapter pointed at `dir` and `env` applied, restoring
 * every variable it touched.
 *
 * An explicit `undefined` DELETES the variable rather than skipping it. That is
 * load-bearing: `GITHUB_ACTIONS` is genuinely `"true"` when this suite runs in
 * Actions, so a case about the non-CI path that merely declined to set it would
 * assert the opposite thing there.
 */
function atRepo<T>(
  dir: string,
  fn: (git: GitSurface) => T,
  env: Record<string, string | undefined> = {},
): T {
  const saved = new Map<string, string | undefined>();
  const set = (key: string, value: string | undefined) => {
    if (!saved.has(key)) saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  set("LEDGER_GIT_ROOT", dir);
  for (const [key, value] of Object.entries(env)) set(key, value);
  try {
    return fn(realGitSurface());
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("fileOids runs against a constructed ref namespace, not the ambient one", () => {
  it("reads a constructed origin ref's ledger blobs, so its line loop is exercised in EVERY environment", () => {
    // BL-LEDGERGIT-FILEOIDS-AMBIENT-REF-VERDICT, and this case is the falsifier
    // that entry named for itself: "give any case a constructed repository
    // carrying one refs/remotes/origin/* ref and drive resolveClaims through it.
    // One call is enough."
    //
    // WHY IT MATTERS AND WHAT IT REPLACES. `fileOids` runs once per
    // refs/remotes/origin/* ref. Until this case existed, the only reader of it
    // in either registered suite was the AMBIENT one at :570, which reads
    // whatever refs the checkout happens to carry -- 14 calls against a
    // developer's full clone, 0 against CI's zero-ref checkout. So the
    // `logical-connector:259:20:&&>||` mutant was killed locally and survived in
    // CI, and its verdict was set by how the repository was cloned rather than
    // by anything the suite asserted. That is the one site where this surface's
    // stated environment-independence failed, and the sweep in the archived
    // entry bounds it to exactly this one.
    //
    // The mutant it kills: `if (m?.[1] && m[2])` becomes `if (m?.[1] || m[2])`.
    // The two forms agree whenever the regex matched, because both of its groups
    // are mandatory; they diverge only when `m` is NULL, where `||` evaluates
    // `m[2]` on null and throws. `m` is null on the trailing empty line that
    // splitting always yields, so the mutant throws wherever this function runs
    // at all -- and survives wherever it does not.
    const repo = throwawayRepo();
    // main stays at the base commit; the feature ref gets its own, so it is NOT
    // merged into main and survives the candidate filter
    // (scripts/lib/ledger-claims-core.ts:173-179). A merged ref is dropped, and
    // this case would then drive zero calls while still passing.
    repo.g("update-ref", "refs/remotes/origin/main", repo.head);
    writeFileSync(join(repo.dir, "BACKLOG.md"), "# BACKLOG.md\n\nno rows.\n", "utf8");
    repo.g("add", "BACKLOG.md");
    repo.g("commit", "--quiet", "-m", "ledgered");
    const tip = repo.g("rev-parse", "HEAD").trim();
    repo.g("update-ref", "refs/remotes/origin/feat/constructed-ledger", tip);

    // PREMISE, on this case's OWN inputs: the ref must exist and must not be
    // merged into main, or `candidates` is empty, `fileOids` is never called, and
    // every assertion below is satisfied by a function that never ran.
    premise(
      "the constructed namespace carries a non-main origin ref",
      repo
        .g("for-each-ref", "--format=%(refname)", "refs/remotes/origin/")
        .trim()
        .split("\n")
        .filter((r) => r.endsWith("/feat/constructed-ledger")).length,
      0,
    );

    const oids = atRepo(repo.dir, (git) => git.fileOids(tip, ["BACKLOG.md", "DEFERRED.md"]));
    // Derived from git, never a literal: the expected oid is what the repository
    // says the blob is, so a reader that returned a plausible-looking constant
    // fails.
    const expected = repo.g("rev-parse", `${tip}:BACKLOG.md`).trim();
    expect(oids.get("BACKLOG.md")).toBe(expected);
    // DEFERRED.md is absent at this ref, and absent is not an error: the loop
    // must simply not map it. This is also the line that produces the trailing
    // empty split entry the mutant dies on.
    expect(oids.has("DEFERRED.md")).toBe(false);

    // And through the real path, which is what the falsifier asked for: one
    // resolveClaims call over the constructed namespace reaches fileOids for the
    // candidate ref. Under the mutant this throws rather than returning.
    const res = atRepo(repo.dir, (git) => resolveClaims(git, { fetch: false }));
    expect(res.candidates).toEqual(["origin/feat/constructed-ledger"]);
  });
});

/**
 * A fake `gh` first on PATH.
 *
 * `prList` spawns the binary by name, so PATH is the seam — no refactor of the
 * adapter is needed to reach its status handling, which is otherwise the one
 * reader nothing in this suite drives.
 */
function withFakeGh<T>(body: string, fn: () => T): { result: T; ran: boolean } {
  const bin = mkdtempSync(join(tmpdir(), "fake-gh-"));
  scratchDirs.push(bin);
  // The shim records that it ran, so the cases below can state the premise that
  // actually matters — that the PATH injection took, and the rows under
  // assertion came from THIS script rather than from a real gh or from nothing.
  const marker = join(bin, "ran");
  writeFileSync(join(bin, "gh"), `#!/bin/sh\n: > ${JSON.stringify(marker)}\n${body}`, {
    mode: 0o755,
  });
  const prev = process.env.PATH;
  process.env.PATH = `${bin}:${prev ?? ""}`;
  try {
    return { result: fn(), ran: existsSync(marker) };
  } finally {
    if (prev === undefined) delete process.env.PATH;
    else process.env.PATH = prev;
  }
}

describe("the git adapter, against a constructed checkout (guard-premise Task 8)", () => {
  it("names the failing subcommand and carries git's own stderr", () => {
    // Kills `args.slice(0, 2)` -> `slice(1, 2)` and `-> slice(0, 3)`, and the
    // `stderr.trim() || \`status ${r.status}\`` fallback -> `&&`. The fallback
    // is a LAST resort; an `&&` mutant takes it whenever stderr is non-empty,
    // discarding git's diagnosis, which is the entire content of the message.
    const repo = throwawayRepo();
    let message = "";
    atRepo(repo.dir, (git) => {
      try {
        git.tipEpoch("no-such-ref");
      } catch (e) {
        message = (e as Error).message;
      }
    });
    premiseHolds("the read failed at all, so there is a message to inspect", message !== "");
    expect(message).toMatch(/^git log -1 failed: /);
    expect(message, "git's own stderr was discarded").toContain("no-such-ref");
  });

  it("fetches the remote's heads into refs/remotes/origin", () => {
    // Kills removal of the `git fetch` call itself. Nothing in either suite
    // asserted the network read happened, so the whole freshness argument
    // rested on a statement that could be deleted with the suite green
    // (spec §3.2.2).
    const remote = throwawayRepo();
    remote.g("branch", "feat/pushed");
    const local = throwawayRepo();
    local.g("remote", "add", "origin", `file://${remote.dir}`);
    const before = local.g("for-each-ref", "--format=%(refname)", "refs/remotes/origin").trim();
    premiseHolds("the local checkout starts with no origin refs, as CI's does", before === "");

    atRepo(local.dir, (git) => git.fetch());

    expect(
      local
        .g("for-each-ref", "--format=%(refname)", "refs/remotes/origin")
        .trim()
        .split("\n")
        .sort(),
    ).toEqual(["refs/remotes/origin/feat/pushed", "refs/remotes/origin/main"]);
  });

  it("reads the remote's heads by name, dropping a head literally called HEAD", () => {
    // Kills five mutants on one line: `pair &&` -> `||` (which dereferences the
    // null parse of the trailing blank line), `pair[0] !== "HEAD"` -> `===` and
    // -> `pair[1] !== "HEAD"`, and both index shifts in `map.set(pair[0], pair[1])`.
    //
    // `refs/heads/HEAD` is creatable: git refuses the NAME at `git branch`, but
    // `update-ref` takes it and `ls-remote --heads` advertises it like any
    // other head. Without one the HEAD guard is unreachable and its mutants
    // cannot be killed at all.
    const remote = throwawayRepo();
    remote.g("branch", "feat/one");
    remote.g("update-ref", "refs/heads/HEAD", remote.head);
    const local = throwawayRepo();
    local.g("remote", "add", "origin", `file://${remote.dir}`);

    const map = atRepo(local.dir, (git) => git.lsRemote());

    premiseHolds(
      "the remote really advertises a head named HEAD, or the guard has nothing to exclude",
      remote.g("ls-remote", "--heads", ".").includes("refs/heads/HEAD"),
    );
    expect([...map.keys()].sort(), "HEAD leaked in, or the map is keyed by OID").toEqual([
      "feat/one",
      "main",
    ]);
    for (const oid of map.values()) expect(oid).toMatch(/^[0-9a-f]{40}$/);
  });

  it("reports branches merged into the pinned main, and nothing else", () => {
    // Kills the `||` joining the empty-name test to the origin/main exclusion
    // (an `&&` stops excluding main at all), the removal of the two-field guard
    // above it (which makes the exclusion the BODY of that guard, so it runs
    // only for malformed lines), and `name.length === 0` -> `=== 1`.
    //
    // That last one needs `refs/remotes/x`: a ref directly under refs/remotes
    // has a ONE-CHARACTER `%(refname:short)`, so a length test off by one drops
    // a real merged branch. The guard is there to reject the EMPTY name of the
    // trailing blank line, and nothing shorter than that.
    const repo = throwawayRepo();
    repo.g("commit", "--quiet", "--allow-empty", "-m", "second");
    const mainOid = repo.g("rev-parse", "HEAD").trim();
    repo.g("update-ref", "refs/remotes/origin/main", mainOid);
    repo.g("update-ref", "refs/remotes/origin/merged", repo.head);
    repo.g("update-ref", "refs/remotes/x", repo.head);
    repo.g("checkout", "--quiet", "-b", "side", repo.head);
    repo.g("commit", "--quiet", "--allow-empty", "-m", "side");
    repo.g("update-ref", "refs/remotes/origin/unmerged", repo.g("rev-parse", "HEAD").trim());

    const map = atRepo(repo.dir, (git) => git.mergedIntoMain(mainOid));

    premiseHolds(
      "the fixture holds an unmerged branch too, so 'merged' is a real distinction",
      repo.g("for-each-ref", "--format=%(refname)", "refs/remotes/origin").includes("unmerged"),
    );
    premiseHolds(
      "git really reports a one-character short name for refs/remotes/x",
      repo
        .g("branch", "-r", "--merged", mainOid, "--format=%(refname:short)")
        .split("\n")
        .includes("x"),
    );
    expect([...map.keys()].sort(), "main, an empty name, or a short one went wrong").toEqual([
      "origin/merged",
      "x",
    ]);
    expect(map.get("origin/merged"), "the merged-at OID is the one git reported").toBe(repo.head);
  });

  it("returns content at a ref, null for an absent path, and throws on a bad ref", () => {
    // Kills `r.status === 0` -> `!==` and -> `=== 1` (either turns every
    // successful read into a throw), and the `stderr.trim() ||` fallback in the
    // fault message -> `&&`.
    //
    // "absent" and "failed" are different answers here, and collapsing them
    // drops every declaration on a branch whose ref was pruned mid-run.
    const repo = throwawayRepo();
    writeFileSync(join(repo.dir, "BACKLOG.md"), "## BL-X — planted\n");
    repo.g("add", "BACKLOG.md");
    repo.g("commit", "--quiet", "-m", "add a ledger");
    const tip = repo.g("rev-parse", "HEAD").trim();

    atRepo(repo.dir, (git) => {
      expect(git.showFile(tip, "BACKLOG.md")).toBe("## BL-X — planted\n");
      expect(git.showFile(tip, "DEFERRED.md"), "an absent path is null, never a throw").toBeNull();

      let message = "";
      try {
        git.showFile("no-such-ref", "BACKLOG.md");
      } catch (e) {
        message = (e as Error).message;
      }
      premiseHolds("a bad ref threw rather than reading as absence", message !== "");
      expect(message, "git's own stderr was discarded").toMatch(/fatal/i);
    });
  });

  it("distinguishes no-merge-base from a merge-base fault", () => {
    // Kills `r.status === 1` -> `!==` and -> `=== 2`, plus the `||` fallback in
    // its fault message. Exit 1 is the ONE reader where failure is a legitimate
    // answer; every other status is a fault, and treating them alike either
    // throws on a shallow clone or swallows a real fault.
    const repo = throwawayRepo();
    const mainOid = repo.head;
    repo.g("checkout", "--quiet", "--orphan", "unrelated");
    repo.g("commit", "--quiet", "--allow-empty", "-m", "an unrelated root");
    const orphan = repo.g("rev-parse", "HEAD").trim();
    premiseHolds("the fixture built two genuinely unrelated roots", orphan !== mainOid);

    atRepo(repo.dir, (git) => {
      expect(git.mergeBase(orphan, mainOid), "unrelated roots have no merge base").toBeNull();
      expect(git.mergeBase(mainOid, mainOid)).toBe(mainOid);

      let message = "";
      try {
        git.mergeBase("no-such-ref", mainOid);
      } catch (e) {
        message = (e as Error).message;
      }
      premiseHolds("a bad ref threw rather than reading as no-merge-base", message !== "");
      expect(message, "git's own stderr was discarded").toMatch(/fatal/i);
    });
  });

  it("parses a single-line hunk, which carries no explicit count", () => {
    // Kills `!hm?.[1]` -> `!hm?.[2]` (which drops every one-line hunk) and the
    // `hm[2] === undefined ? 1 : …` default -> `2`. `git diff --unified=0`
    // prints `@@ -2 +2 @@` for a one-line change: the count group is ABSENT,
    // not 1, so only this shape separates the default from a wrong constant.
    const repo = throwawayRepo();
    writeFileSync(join(repo.dir, "BACKLOG.md"), "a\nb\nc\n");
    repo.g("add", "BACKLOG.md");
    repo.g("commit", "--quiet", "-m", "one");
    const base = repo.g("rev-parse", "HEAD").trim();
    writeFileSync(join(repo.dir, "BACKLOG.md"), "a\nB\nc\n");
    repo.g("commit", "--quiet", "-a", "-m", "two");
    const tip = repo.g("rev-parse", "HEAD").trim();

    const hunks = atRepo(repo.dir, (git) => git.diffHunks(base, tip, ["BACKLOG.md"]));

    premiseHolds(
      "the diff really is a countless one-line hunk",
      repo.g("diff", "--unified=0", base, tip, "--", "BACKLOG.md").includes("@@ -2 +2 @@"),
    );
    expect(hunks).toEqual([{ file: "BACKLOG.md", start: 2, count: 1 }]);
  });

  it("parses a multi-line hunk's explicit count, not a collapsed 1", () => {
    // Kills `hm[2] === undefined ? …` -> `hm[3] === undefined ? …` (group 3
    // never exists, so every counted hunk collapses to 1) and `Number(hm[2])`
    // -> `Number(hm[3])` (NaN, so the hunk overlaps no span). Only a hunk whose
    // count group is PRESENT separates group 2 from the always-undefined group
    // 3 — the single-line case above cannot, because there the group is absent
    // on clean and mutant alike. Until this case existed the pair died only
    // when the suite ran somewhere a multi-line hunk happened to arise, which
    // is what let it survive CI's zero-ref checkout while dying on a full
    // clone; a constructed repo makes the kill environment-independent.
    const repo = throwawayRepo();
    writeFileSync(join(repo.dir, "BACKLOG.md"), "a\nb\nc\nd\ne\n");
    repo.g("add", "BACKLOG.md");
    repo.g("commit", "--quiet", "-m", "one");
    const base = repo.g("rev-parse", "HEAD").trim();
    writeFileSync(join(repo.dir, "BACKLOG.md"), "a\nB\nC\nD\ne\n");
    repo.g("commit", "--quiet", "-a", "-m", "two");
    const tip = repo.g("rev-parse", "HEAD").trim();

    const hunks = atRepo(repo.dir, (git) => git.diffHunks(base, tip, ["BACKLOG.md"]));

    premiseHolds(
      "the diff really is one counted three-line hunk",
      repo.g("diff", "--unified=0", base, tip, "--", "BACKLOG.md").includes("@@ -2,3 +2,3 @@"),
    );
    expect(hunks).toEqual([{ file: "BACKLOG.md", start: 2, count: 3 }]);
  });

  it("refuses a tip date it cannot use, at the epoch and one second past it", () => {
    // Kills `!Number.isFinite(n) || n <= 0` -> `&&`, `n <= 0` -> `n < 0`, and
    // `n <= 0` -> `n <= 1`. Returning 0 would date every branch to 1970 and
    // mark the whole report stale, which is the silent failure the throw
    // replaces. Both ages are constructed because the three mutants separate
    // only at exactly 0 and exactly 1.
    const repo = throwawayRepo();
    const commitAt = (seconds: string, branch: string) => {
      execFileSync("git", ["commit", "--quiet", "--allow-empty", "-m", branch], {
        cwd: repo.dir,
        encoding: "utf8",
        timeout: 30_000,
        env: {
          ...process.env,
          GIT_COMMITTER_DATE: `@${seconds} +0000`,
          GIT_AUTHOR_DATE: `@${seconds} +0000`,
        },
      });
      repo.g("branch", branch);
      return repo.g("rev-parse", branch).trim();
    };
    const atZero = commitAt("0", "at-zero");
    const atOne = commitAt("1", "at-one");
    premiseHolds(
      "the fixture's tips carry the two dates the mutants separate at",
      repo.g("log", "-1", "--format=%ct", atZero).trim() === "0" &&
        repo.g("log", "-1", "--format=%ct", atOne).trim() === "1",
    );

    atRepo(repo.dir, (git) => {
      expect(() => git.tipEpoch(atZero), "an epoch-dated tip was accepted").toThrow(/no tip date/);
      expect(git.tipEpoch(atOne), "a one-second tip was rejected").toBe(1);
      expect(git.tipEpoch(repo.head)).toBeGreaterThan(1);
    });
  });

  it("trusts GITHUB_HEAD_REF only inside CI, and reports a detached HEAD as no branch", () => {
    // Kills `GITHUB_ACTIONS === "true"` -> `!==` in currentBranch, `name &&` ->
    // `||`, and `name !== "HEAD"` -> `===`. Locally GITHUB_HEAD_REF is ambient
    // state that may be stale or spoofed, and trusting it self-excludes another
    // branch's real declaration.
    const repo = throwawayRepo();
    expect(
      atRepo(repo.dir, (git) => git.currentBranch(), {
        GITHUB_ACTIONS: undefined,
        GITHUB_HEAD_REF: "spoofed",
      }),
      "a local run trusted an ambient GITHUB_HEAD_REF",
    ).toBe("main");
    expect(
      atRepo(repo.dir, (git) => git.currentBranch(), {
        GITHUB_ACTIONS: "true",
        GITHUB_HEAD_REF: "feat/from-ci",
      }),
    ).toBe("feat/from-ci");

    repo.g("checkout", "--quiet", "--detach", repo.head);
    premiseHolds(
      "the fixture is genuinely detached, or the null case proves nothing",
      repo.g("rev-parse", "--abbrev-ref", "HEAD").trim() === "HEAD",
    );
    expect(
      atRepo(repo.dir, (git) => git.currentBranch(), {
        GITHUB_ACTIONS: undefined,
        GITHUB_HEAD_REF: undefined,
      }),
      "a detached HEAD is not a branch named HEAD",
    ).toBeNull();
  });

  it("treats only GITHUB_ACTIONS=true as CI, in both directions", () => {
    // Kills `GITHUB_ACTIONS === "true"` -> `!==` in inCI. A bare CI=true is set
    // by many local harnesses — including this repo's own serial vitest project
    // — and reading it as CI sends a local run down the event-payload path,
    // where identity reads unresolved and the run blocks on its own declaration.
    // no-premise: both environments are CONSTRUCTED by atRepo rather than read,
    // so neither arm can be degenerate; the test supplies the very variable it
    // asserts on, in both directions.
    const repo = throwawayRepo();
    expect(atRepo(repo.dir, (git) => git.inCI(), { GITHUB_ACTIONS: "true" })).toBe(true);
    expect(
      atRepo(repo.dir, (git) => git.inCI(), { GITHUB_ACTIONS: undefined, CI: "true" }),
      "a bare CI=true was read as GitHub Actions",
    ).toBe(false);
  });

  it("parses gh's rows, keeping the fork flag it reports", () => {
    // Kills `r.status !== 0` -> `===` and -> `!== 1`, and
    // `x.isCrossRepository === true` -> `!==`. Reached through a `gh` first on
    // PATH: the adapter spawns the binary by name, so no refactor is needed to
    // drive its status handling.
    const repo = throwawayRepo();
    const { result: rows, ran } = withFakeGh(
      "cat <<'JSON'\n" +
        '[{"number":689,"headRefName":"feat/a","headRepositoryOwner":{"login":"base"},"isCrossRepository":false},' +
        '{"number":999,"headRefName":"feat/a","headRepositoryOwner":{"login":"fork"},"isCrossRepository":true}]\n' +
        "JSON\n",
      () => atRepo(repo.dir, (git) => git.prList()),
    );
    premiseHolds("the PATH shim is the gh that ran", ran);
    expect(rows).toEqual([
      { number: 689, headRefName: "feat/a", headRepositoryOwner: "base", isCrossRepository: false },
      { number: 999, headRefName: "feat/a", headRepositoryOwner: "fork", isCrossRepository: true },
    ]);
  });

  it("throws on a failed gh even when it printed well-formed JSON", () => {
    // Kills `r.status !== 0` -> `===`, which reads the payload of a FAILED gh.
    // That is how an error-shaped or partial page becomes a PR number attached
    // to somebody's claim. The intent is unchanged from when this asserted `[]`
    // — a failed gh's payload never becomes a PR universe — but the SIGNAL is:
    // `[]` was indistinguishable from "no open PRs", so the caller degraded
    // nothing. It now throws, and resolveClaims turns that into
    // `pr-universe-unavailable`, which runCheck promotes to exit 2.
    const repo = throwawayRepo();
    const { result: threw, ran } = withFakeGh(
      `echo '[{"number":1,"headRefName":"x","isCrossRepository":false}]'\n` + "exit 1\n",
      () =>
        atRepo(repo.dir, (git) => {
          try {
            git.prList();
            return false;
          } catch {
            return true;
          }
        }),
    );
    premiseHolds("the PATH shim is the gh that ran, and it printed a parseable page", ran);
    expect(threw, "a failed gh's output was trusted").toBe(true);
  });
});

describe("a PR-universe fault is untrusted, not empty", () => {
  it("resolveClaims records pr-universe-unavailable rather than an empty PR set", () => {
    const resolution = resolveClaims(
      fake({
        prList: () => {
          throw new Error("gh pr list: empty stdout on exit 0");
        },
      }),
      { fetch: false, now: NOW },
    );
    expect(resolution.degraded.some((d) => d.startsWith("pr-universe-unavailable"))).toBe(true);
  });

  it("runCheck exits 2 when prList throws, even with no collision to report", () => {
    // The marker alone is not the contract — a degraded marker that still
    // returned `{"code":0}` is exactly the false all-clear this repairs, so the
    // assertion is on the EXIT CODE.
    const r = checkVerified(
      fake({
        currentBranch: () => "other",
        prList: () => {
          throw new Error("gh pr list failed: status 1");
        },
      }),
      ["BL-UNRELATED"],
    );
    expect(r.code).toBe(2);
    expect(r.reasons.some((x) => x.startsWith("pr-universe-unavailable"))).toBe(true);
  });
});
