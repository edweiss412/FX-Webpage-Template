/**
 * Claim resolution over an injected git surface.
 *
 * Every case plants git state as DATA. The real subprocess adapter is Task 5's;
 * nothing here spawns, which is what lets Task 6 assert non-invocation at a
 * single seam.
 */
import { describe, expect, it } from "vitest";

import { premise, premiseHolds } from "@/tests/_shared/premise";

import { type GitSurface, type Hunk, resolveClaims } from "@/scripts/lib/ledger-claims-core";

const MARKER = (branch: string, id = "BL-X") =>
  `## ${id} — planted\n\n**Status:** IN PROGRESS · **Branch:** ${branch}\n`;

const NOW = 1_760_000_000; // fixed clock; tipEpoch is relative to `now`

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
      file === "BACKLOG.md" && ref === "origin/feat/a" ? MARKER("feat/a") : null,
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

const opts = { fetch: false, now: NOW } as const;

describe("resolveClaims — candidates", () => {
  it("reports a declared claim keyed by its source ref", () => {
    const r = resolveClaims(fake(), opts);
    expect(r.claims).toEqual([
      expect.objectContaining({ id: "BL-X", branch: "feat/a", kind: "declared" }),
    ]);
  });

  it("keys by the ref even when the marker names a DIFFERENT branch that exists", () => {
    // The existence-aware mutant: reading fields.Branch agrees with the ref in
    // every healthy case, and only diverges when the named branch is real.
    const r = resolveClaims(
      fake({
        lsRemote: () =>
          new Map([
            ["main", "a"],
            ["feat/a", "b"],
            ["feat/b", "c"],
          ]),
        localRefs: () =>
          new Map([
            ["main", "a"],
            ["feat/a", "b"],
            ["feat/b", "c"],
          ]),
        showFile: (ref, f) =>
          f === "BACKLOG.md" && ref === "origin/feat/a" ? MARKER("feat/b") : null,
      }),
      opts,
    );
    expect(r.claims[0]?.branch, "an existing named branch must not steal the claim").toBe("feat/a");
  });

  it("keys by the ref when the marker names NO branch at all", () => {
    const r = resolveClaims(
      fake({
        showFile: (ref, f) =>
          f === "BACKLOG.md" && ref === "origin/feat/a"
            ? "## BL-X — planted\n\n**Status:** IN PROGRESS · **Severity:** low\n"
            : null,
      }),
      opts,
    );
    expect(r.claims[0]).toMatchObject({ id: "BL-X", branch: "feat/a", kind: "declared" });
  });

  it("excludes origin/main AS A CANDIDATE, not merely from map verification", () => {
    // main has genuinely carried an in-progress marker (90aae0e60^). Including it
    // reports main's own marker as a stranger's claim.
    const r = resolveClaims(
      fake({
        showFile: (ref, f) => (f === "BACKLOG.md" && ref === "origin/main" ? MARKER("x") : null),
      }),
      opts,
    );
    expect(r.claims).toEqual([]);
  });

  it("excludes origin/HEAD, which aliases main to the same OID", () => {
    const r = resolveClaims(
      fake({
        showFile: (ref, f) => (f === "BACKLOG.md" && ref === "origin/HEAD" ? MARKER("x") : null),
      }),
      opts,
    );
    expect(r.claims).toEqual([]);
  });

  it("excludes branches merged into main on a full clone", () => {
    // The merged OID must MATCH the snapshot's tip for the branch to be
    // excluded -- "bbb" is what localRefs reports for feat/a.
    const r = resolveClaims(
      fake({ mergedIntoMain: () => new Map([["origin/feat/a", "bbb"]]) }),
      opts,
    );
    expect(r.claims).toEqual([]);
  });

  it("asks ancestry against the PINNED main OID, never the movable name", () => {
    // The R14 F1 race. `git branch -r --merged origin/main` answers against
    // whatever main points at during the call, so under M0 -> M1 -> M0 a branch
    // merged only into the transient M1 is reported merged, its own OID still
    // matches the snapshot, and the final universe check sees M0 at both
    // endpoints and trusts the result. The reviewer's probe produced exit 0 with
    // a declared marker inside the excluded object.
    //
    // Argument capture, because the difference between the defect and the fix
    // is WHICH revision the question is asked about, and nothing else observable
    // changes when both mains happen to agree.
    const asked: string[] = [];
    resolveClaims(
      fake({
        mergedIntoMain: (mainOid: string) => {
          asked.push(mainOid);
          return new Map();
        },
      }),
      opts,
    );
    expect(asked, "ancestry was asked against a movable name").toEqual(["aaa"]);
  });

  it("skips the exclusion, loudly, when the snapshot has no main to pin", () => {
    // Falling back to the movable name here would reintroduce the same race
    // through the back door. Skipping keeps candidates a superset, which is the
    // ratified failure direction, and the header says so.
    const r = resolveClaims(
      fake({
        localRefs: () => new Map([["feat/a", "bbb"]]),
        mergedIntoMain: () => new Map([["origin/feat/a", "bbb"]]),
      }),
      opts,
    );
    expect(
      r.claims.map((c) => c.id),
      "excluded without a pinned main",
    ).toEqual(["BL-X"]);
    expect(r.degraded).toContain("merged-exclusion-skipped-no-main");
  });

  it("does NOT exclude a branch whose tip moved since the merged read", () => {
    // The R13 F1 race, made executable: git reported feat/a merged at "old",
    // but the pinned snapshot holds "bbb" -- someone pushed between the two
    // reads. Excluding on the NAME drops a candidate whose snapshot tip was
    // never merged, and a verified collision becomes a trusted all-clear.
    //
    // Conservative in the safe direction: at worst this reports a collision
    // that has just been resolved. Silence about a live one is the failure the
    // tool exists to prevent.
    const r = resolveClaims(
      fake({ mergedIntoMain: () => new Map([["origin/feat/a", "old"]]) }),
      opts,
    );
    expect(
      r.claims.map((c) => c.id),
      "a moved tip was excluded on its name",
    ).toEqual(["BL-X"]);
  });

  it("keeps merged branches as candidates on a shallow clone, and says so", () => {
    // Ancestry is not computable at depth 1. The set stays a SUPERSET: a false
    // collision names a real branch, a false all-clear is the defect this exists
    // to remove.
    const r = resolveClaims(
      fake({ isShallow: () => true, mergedIntoMain: () => new Map([["origin/feat/a", "bbb"]]) }),
      opts,
    );
    expect(r.claims.map((c) => c.id)).toEqual(["BL-X"]);
    expect(r.degraded).toContain("merged-exclusion-skipped");
  });

  it("lists a stale-tipped branch rather than dropping it", () => {
    const r = resolveClaims(fake({ tipEpoch: () => NOW - 20 * 86_400 }), opts);
    expect(r.claims[0]?.stale).toBe(true);
    expect(r.claims[0]?.tipAgeDays).toBe(20);
  });

  it("skips a ledger file absent at a ref without erroring", () => {
    const r = resolveClaims(fake({ showFile: () => null }), opts);
    expect(r.claims).toEqual([]);
  });
});

describe("resolveClaims — identity", () => {
  it("resolves LOCAL by branch name when not in CI", () => {
    const r = resolveClaims(fake({ inCI: () => false, currentBranch: () => "feat/a" }), opts);
    expect(r.identity).toBe("local");
    expect(r.selfBranch).toBe("feat/a");
  });

  it("resolves CI-RESOLVED for a same-repository PR", () => {
    const r = resolveClaims(
      fake({
        inCI: () => true,
        headRepo: () => "base/x",
        repo: () => "base/x",
        currentBranch: () => "feat/a",
      }),
      opts,
    );
    expect(r.identity).toBe("ci-resolved");
    expect(r.selfBranch).toBe("feat/a");
  });

  it("disables self-exclusion on a fork PR, even when the head names a real base branch", () => {
    // A bare branch name is not an identity across repositories.
    const r = resolveClaims(
      fake({
        inCI: () => true,
        headRepo: () => "fork/x",
        repo: () => "base/x",
        currentBranch: () => "feat/a",
      }),
      opts,
    );
    expect(r.identity).toBe("ci-resolved");
    expect(r.selfBranch, "no base ref is 'me' on a fork PR").toBeNull();
  });

  it("resolves CI-UNKNOWN when the event payload is unreadable", () => {
    const r = resolveClaims(
      fake({ inCI: () => true, headRepo: () => null, currentBranch: () => "feat/a" }),
      opts,
    );
    expect(r.identity).toBe("ci-unknown");
    expect(r.selfBranch, "identity unresolved means nothing is self").toBeNull();
    expect(r.degraded).toContain("identity-unresolved");
  });
});

describe("resolveClaims — inferred hunks", () => {
  const TWO = "## BL-X — first\n\nbody\n\n## BL-Y — second\n\nbody\n";
  const PREAMBLE = [
    "reconciliation prose",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "## BL-X — first",
    "",
    "body",
    "",
  ].join("\n");

  it("drops a hunk landing outside every entry span", () => {
    // BACKLOG.md:7 is the reconciliation preamble; the first entry heading is at
    // 11. A line-7 edit names dozens of ids and claims none of them.
    const r = resolveClaims(
      fake({
        showFile: (ref, f) => (f === "BACKLOG.md" && ref === "origin/feat/a" ? PREAMBLE : null),
        diffHunks: () => [{ file: "BACKLOG.md", start: 1, count: 1 }],
      }),
      opts,
    );
    expect(r.claims).toEqual([]);
  });

  it("drops a pure deletion, which has no new-side line", () => {
    const r = resolveClaims(
      fake({
        showFile: (ref, f) => (f === "BACKLOG.md" && ref === "origin/feat/a" ? TWO : null),
        diffHunks: () => [{ file: "BACKLOG.md", start: 1, count: 0 }],
      }),
      opts,
    );
    expect(r.claims).toEqual([]);
  });

  it("attributes a boundary-spanning hunk to EVERY entry it overlaps", () => {
    // First-match-wins would report only BL-X.
    const r = resolveClaims(
      fake({
        showFile: (ref, f) => (f === "BACKLOG.md" && ref === "origin/feat/a" ? TWO : null),
        diffHunks: () => [{ file: "BACKLOG.md", start: 2, count: 6 }],
      }),
      opts,
    );
    expect(r.claims.map((c) => c.id).sort()).toEqual(["BL-X", "BL-Y"]);
    expect(r.claims.every((c) => c.kind === "inferred")).toBe(true);
  });

  it("does not downgrade a declared claim to inferred", () => {
    const r = resolveClaims(
      fake({ diffHunks: () => [{ file: "BACKLOG.md", start: 1, count: 5 }] }),
      opts,
    );
    expect(r.claims.map((c) => c.kind)).toEqual(["declared"]);
  });

  it("disables inferred when merge-base is unresolvable, keeping declared", () => {
    const r = resolveClaims(fake({ mergeBase: () => null }), opts);
    expect(r.claims.map((c) => c.kind)).toEqual(["declared"]);
    expect(r.degraded).toContain("merge-base-unavailable");
  });
});

describe("declaredOnly — the backstop's mode (whole-diff R8 F2)", () => {
  it("touches none of the four surfaces it never reads", () => {
    // The CI backstop is declared-versus-declared by spec. Calling the
    // unrestricted resolver made it invoke `gh` — which it is forbidden to do —
    // plus tip dates, merge-bases and diffs that only feed the advisory
    // inferred signal.
    const touched: string[] = [];
    const r = resolveClaims(
      fake({
        prList: () => {
          touched.push("prList");
          return [];
        },
        tipEpoch: () => {
          touched.push("tipEpoch");
          return NOW;
        },
        mergeBase: () => {
          touched.push("mergeBase");
          return "base";
        },
        diffHunks: () => {
          touched.push("diffHunks");
          return [];
        },
      }),
      { fetch: false, now: NOW, declaredOnly: true },
    );
    expect(touched, "declaredOnly must read none of these").toEqual([]);
    expect(
      r.claims.map((c) => c.id),
      "declared claims still resolve",
    ).toEqual(["BL-X"]);
  });

  it("does not fail when the inference surfaces would throw", () => {
    // An advisory-signal fault must not turn a healthy declaration check red.
    const r = resolveClaims(
      fake({
        mergeBase: () => {
          throw new Error("diff unavailable");
        },
        diffHunks: () => {
          throw new Error("diff unavailable");
        },
      }),
      { fetch: false, now: NOW, declaredOnly: true },
    );
    expect(r.claims.map((c) => c.kind)).toEqual(["declared"]);
  });
});

/**
 * The reachable survivors of the source-mutation sweep over
 * `scripts/lib/ledger-claims-core.ts` (guard-premise-reachability, Task 6).
 *
 * Every behaviour below already worked; none of it was asserted, so a mutant
 * that deleted or shifted it kept the whole suite green. Each `it` names the
 * mutant it kills, and each was verified the only way that proves anything:
 * apply the mutant to the source on disk, watch THIS test go red, restore.
 */

const DAY = 86_400;

/** Two entries, neither in progress. BL-X spans lines 1-4; BL-Y spans 5-8. */
const TWO_SPANS = "## BL-X — first\n\nbody\n\n## BL-Y — second\n\nbody\n";

/**
 * One entry whose heading sits on line 11, so `start + count - 1` is the
 * difference between attributing and not.
 */
const HEADING_AT_11 = [
  "reconciliation prose", // 1
  "", // 2
  "", // 3
  "", // 4
  "", // 5
  "", // 6
  "", // 7
  "", // 8
  "", // 9
  "", // 10
  "## BL-X — first", // 11
  "",
  "body",
  "",
].join("\n");

/** Plants `text` as BACKLOG.md on origin/feat/a, and nothing anywhere else. */
const backlogAt = (text: string) => (ref: string, file: string) =>
  file === "BACKLOG.md" && ref === "origin/feat/a" ? text : null;

describe("staleness boundary (integer-literal:80, relational-boundary:224)", () => {
  const at = (ageDays: number) =>
    resolveClaims(fake({ tipEpoch: () => NOW - ageDays * DAY }), opts).claims[0];

  it("a tip exactly STALE_DAYS old is fresh, not stale", () => {
    // Kills `ageDays > STALE_DAYS` -> `>=`. Only the exact boundary separates
    // them, so every other age in the suite is blind to it.
    premiseHolds("the fixture's tip is exactly STALE_DAYS old", at(14)?.tipAgeDays === 14);
    expect(at(14)?.stale, "the boundary day itself read as abandoned").toBe(false);
  });

  it("a tip one day past STALE_DAYS is stale", () => {
    // Kills `STALE_DAYS = 14` -> `15`. At fourteen days the two constants agree;
    // fifteen is the only age at which they do not.
    premiseHolds("the fixture's tip is one day past STALE_DAYS", at(15)?.tipAgeDays === 15);
    expect(at(15)?.stale).toBe(true);
  });

  it("derives `now` from the clock when the caller omits it", () => {
    // Kills `Date.now() / 1000` -> `/ 1001`, which shifts the derived epoch by
    // about twenty days. Every other case in both suites pins `now`, so the
    // default is otherwise never executed.
    const r = resolveClaims(fake({ tipEpoch: () => Math.floor(Date.now() / 1000) - DAY }), {
      fetch: false,
    });
    expect(r.claims[0]?.tipAgeDays, "the clock default is not seconds since the epoch").toBe(1);
  });
});

describe("age arithmetic (integer-literal:194, integer-literal:216)", () => {
  /**
   * A clock sitting exactly one second past a day boundary.
   *
   * `Math.ceil` absorbs a one-second shift at every other instant, so this is
   * the only shape of fixture at which a one-second change to either operand of
   * the age division is observable at all. Both cases below are premised on it
   * rather than trusting the constant to stay what it says.
   */
  const ONE_SECOND_PAST_A_DAY = 20_371 * DAY + 1;

  it("dates a declaredOnly claim from the epoch itself, not one second later", () => {
    // Kills `declaredOnly ? 0 : git.tipEpoch(pin(ref))` -> `? 1`. declaredOnly
    // deliberately never reads a tip, so every claim in that mode is aged from
    // the Unix epoch; the existing declaredOnly cases assert only that tipEpoch
    // is NOT called, which a different sentinel satisfies just as well.
    premiseHolds(
      "the fixture's clock is one second past a day boundary, where a 0/1 sentinel differs",
      ONE_SECOND_PAST_A_DAY % DAY === 1,
    );
    const r = resolveClaims(
      fake({
        tipEpoch: () => {
          throw new Error("declaredOnly must not read tips");
        },
      }),
      { fetch: false, now: ONE_SECOND_PAST_A_DAY, declaredOnly: true },
    );
    expect(r.claims[0]?.tipAgeDays, "the tip sentinel is not the epoch").toBe(
      Math.ceil(ONE_SECOND_PAST_A_DAY / DAY),
    );
  });

  it("rounds a tip one second past a full day up to two days", () => {
    // Kills `/ 86_400` -> `/ 86_401`. At a whole number of days the two
    // divisors agree — ceil absorbs the 0.001% — so every age in this suite is
    // blind to it. One second past the day is the smallest age at which they
    // disagree, and it is also the boundary the `ageDays` comment argues for.
    const r = resolveClaims(fake({ tipEpoch: () => NOW - (DAY + 1) }), opts);
    expect(r.claims[0]?.tipAgeDays, "a day and a second did not round up").toBe(2);
  });
});

describe("the fetch leg (statement-removal:137, :139, :142)", () => {
  it("fetches when opts.fetch is set", () => {
    // The ordering guard in ledgerClaimsCheck.test.ts pins `ledger-check.ts`'s
    // OWN call, not this one, so deleting this `git.fetch()` left both suites
    // green. Premised, because indexing an empty recorder yields `undefined`
    // and an assertion against it can pass for the wrong reason.
    const calls: string[] = [];
    resolveClaims(
      fake({
        fetch: () => calls.push("fetch"),
        localRefs: () => {
          calls.push("localRefs");
          return new Map([
            ["main", "aaa"],
            ["feat/a", "bbb"],
          ]);
        },
      }),
      { fetch: true, now: NOW },
    );
    premise("the fixture recorded a surface call at all", calls.length, 0);
    expect(calls[0], "the fetch never happened").toBe("fetch");
  });

  it("surfaces a failed fetch as a degraded note rather than throwing", () => {
    const r = resolveClaims(
      fake({
        fetch: () => {
          throw new Error("network down");
        },
      }),
      { fetch: true, now: NOW },
    );
    expect(r.degraded).toContain("fetch-failed: network down");
  });

  it("says out loud that a --no-fetch run decided against cached refs", () => {
    // Asserted IN PROCESS: the only prior assertion on this note went through a
    // spawned CLI, which no source overlay can reach.
    const r = resolveClaims(fake(), opts);
    expect(r.degraded).toContain("no-fetch-cached-refs");
  });
});

describe("identity — an EMPTY base repository (logical-connector:111, integer-literal:111)", () => {
  it("treats an empty repo string as unresolved, not as a same-repository match", () => {
    // Kills `||` -> `&&` and `base.length === 0` -> `=== 1`. Both mutants let an
    // empty base fall through to the head/base comparison, where `"base/x" !==
    // ""` reads as a resolved FORK — the exact false all-clear the fork rule
    // exists to prevent.
    const r = resolveClaims(
      fake({
        inCI: () => true,
        headRepo: () => "base/x",
        repo: () => "",
        currentBranch: () => "feat/a",
      }),
      opts,
    );
    expect(r.identity).toBe("ci-unknown");
    expect(r.selfBranch, "an unresolved identity means nothing is self").toBeNull();
    expect(r.degraded).toContain("identity-unresolved");
  });
});

describe("merged-exclusion notes (logical-connector:170)", () => {
  it("does not report a missing main when the snapshot pins one", () => {
    // Kills `!shallow && mainOid === undefined` -> `||`, which on an ordinary
    // full clone WITH a main reads `true || false` and reports the exclusion as
    // skipped although it ran. Every existing assertion is a `toContain`, so
    // only an absence assertion sees it.
    const r = resolveClaims(fake(), opts);
    premiseHolds("the fixture's snapshot has a main to pin", r.refSnapshot.has("main"));
    expect(r.degraded).not.toContain("merged-exclusion-skipped-no-main");
  });
});

describe("candidate ordering (statement-removal:198)", () => {
  it("returns candidates newest tip first", () => {
    const seen: number[] = [];
    const r = resolveClaims(
      fake({
        localRefs: () =>
          new Map([
            ["main", "aaa"],
            ["feat/a", "bbb"],
            ["feat/b", "ccc"],
          ]),
        // tipEpoch receives the PINNED OID, never the ref name.
        tipEpoch: (oid) => {
          const epoch = oid === "bbb" ? NOW - 10 * DAY : NOW;
          seen.push(epoch);
          return epoch;
        },
        showFile: () => null,
      }),
      opts,
    );
    premise("both branches reached the candidate set", r.candidates.length, 1);
    premiseHolds(
      "the two tips carry DISTINCT epochs, so an order exists",
      new Set(seen).size === 2,
    );
    // Map order yields feat/a first; only the sort puts the newer feat/b there.
    expect(r.candidates).toEqual(["origin/feat/b", "origin/feat/a"]);
  });
});

describe("blob deduplication (statement-removal:243)", () => {
  it("reads a blob shared by two refs exactly once", () => {
    const reads: string[] = [];
    const r = resolveClaims(
      fake({
        localRefs: () =>
          new Map([
            ["main", "aaa"],
            ["feat/a", "bbb"],
            ["feat/b", "ccc"],
          ]),
        // Both refs report the SAME blob, which is the ordinary case: most
        // branches never touch a ledger, so they share main's blobs.
        fileOids: () => new Map([["BACKLOG.md", "shared-blob"]]),
        readBlob: (oid) => {
          reads.push(oid);
          return MARKER("feat/a");
        },
      }),
      opts,
    );
    premise("both refs reached the content read", r.candidates.length, 1);
    expect(reads.length, "a shared blob was re-read per ref").toBe(1);
    expect(r.claims.map((c) => c.branch).sort()).toEqual(["feat/a", "feat/b"]);
  });
});

describe("inference is skipped, never guessed, without a base (statement-removal:261, :262, :267)", () => {
  const hunk = () => [{ file: "BACKLOG.md", start: 1, count: 1 }];

  it("skips inference and notes it once when the snapshot has no main", () => {
    const control = resolveClaims(fake({ showFile: backlogAt(TWO_SPANS), diffHunks: hunk }), opts);
    premise("the fixture's hunk DOES attribute when a main is pinned", control.claims.length, 0);

    const r = resolveClaims(
      fake({
        localRefs: () =>
          new Map([
            ["feat/a", "bbb"],
            ["feat/b", "ccc"],
          ]),
        showFile: backlogAt(TWO_SPANS),
        diffHunks: hunk,
      }),
      opts,
    );
    expect(r.claims, "inference ran with no main to ask ancestry against").toEqual([]);
    expect(
      r.degraded.filter((d) => d === "merge-base-unavailable"),
      "the note is pushed once, not once per candidate",
    ).toHaveLength(1);
  });

  it("skips inference and notes it once when the merge base does not resolve", () => {
    const control = resolveClaims(fake({ showFile: backlogAt(TWO_SPANS), diffHunks: hunk }), opts);
    premise(
      "the fixture's hunk DOES attribute when a merge base resolves",
      control.claims.length,
      0,
    );

    const r = resolveClaims(
      fake({
        localRefs: () =>
          new Map([
            ["main", "aaa"],
            ["feat/a", "bbb"],
            ["feat/b", "ccc"],
          ]),
        showFile: backlogAt(TWO_SPANS),
        diffHunks: hunk,
        mergeBase: () => null,
      }),
      opts,
    );
    expect(r.claims, "inference ran against a null base").toEqual([]);
    expect(
      r.degraded.filter((d) => d === "merge-base-unavailable"),
      "the note is pushed once, not once per candidate",
    ).toHaveLength(1);
  });
});

describe("hunk-to-span arithmetic (integer-literal:273, :274; relational-boundary:278)", () => {
  const run = (text: string, h: Hunk) =>
    resolveClaims(fake({ showFile: backlogAt(text), diffHunks: () => [h] }), opts);

  it("attributes a one-line hunk", () => {
    // Kills `h.count === 0` -> `=== 1`, which drops every single-line edit as
    // if it were a pure deletion.
    const r = run(TWO_SPANS, { file: "BACKLOG.md", start: 1, count: 1 });
    expect(r.claims.map((c) => c.id)).toEqual(["BL-X"]);
  });

  it("ends a hunk at start + count - 1, not two short", () => {
    // Kills `- 1` -> `- 2`: a two-line hunk at 10 ends at 11, which is exactly
    // this fixture's only heading line.
    premiseHolds(
      "the fixture's heading is on line 11, so a hunk ending at 11 lands on the span",
      HEADING_AT_11.split("\n")[10] === "## BL-X — first",
    );
    const r = run(HEADING_AT_11, { file: "BACKLOG.md", start: 10, count: 2 });
    expect(r.claims.map((c) => c.id)).toEqual(["BL-X"]);
  });

  it("attributes a hunk touching exactly the FIRST line of a span", () => {
    // Kills `last >= span.line` -> `>`. BL-Y's heading is line 5, and a
    // one-line hunk there ends on it.
    const r = run(TWO_SPANS, { file: "BACKLOG.md", start: 5, count: 1 });
    expect(r.claims.map((c) => c.id)).toEqual(["BL-Y"]);
  });

  it("attributes a hunk starting exactly on the LAST line of a span", () => {
    // Kills `h.start <= span.endLine` -> `<`. BL-X ends at line 4, the line
    // before BL-Y's heading.
    const r = run(TWO_SPANS, { file: "BACKLOG.md", start: 4, count: 1 });
    expect(r.claims.map((c) => c.id)).toEqual(["BL-X"]);
  });
});
