/**
 * Claim resolution over an injected git surface.
 *
 * Every case plants git state as DATA. The real subprocess adapter is Task 5's;
 * nothing here spawns, which is what lets Task 6 assert non-invocation at a
 * single seam.
 */
import { describe, expect, it } from "vitest";

import { type GitSurface, resolveClaims } from "@/scripts/lib/ledger-claims-core";

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
