// Backstop: no row this branch declares may also be declared by another live
// branch on origin.
//
// WHY THIS EXISTS. Stage 0's `pnpm ledger:claims --check` is the gate; this is
// what catches a run that skipped it. On 2026-08-03 two sessions started the
// same two backlog rows six hours apart, because the first session's marker
// lived on its own branch and `origin/main` still read `**Status:** OPEN.` The
// second session's work — spec, TDD, probes, two dispatched reviews — was
// discarded as a duplicate.
//
// WHY IT OWNS NO GIT CODE. It used to carry its own `git show`, its own ref
// enumeration, and its own identity resolution, parallel to the reader's. Seven
// whole-diff review rounds found the SAME defect in both copies — fail-open
// error handling, the `origin/HEAD` alias rendering as `origin`, identity drift
// on detached HEAD — and each had to be fixed twice. It now consumes
// `realGitSurface()` and `resolveClaims()`, so there is one implementation to
// get right and one place a fix lands.
//
// SCOPE. Declared-versus-declared only, for two independent reasons: an
// `inferred` claim is a heuristic over diff hunks and must never fail a PR, and
// it cannot be computed here anyway, since it needs a merge-base a shallow CI
// clone does not have.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveClaims } from "@/scripts/lib/ledger-claims-core";
import { isInProgress, ledgerFiles, ledgerItems } from "@/scripts/lib/ledger-fields";
import { realGitSurface } from "@/scripts/lib/ledger-git";

const ROOT = join(__dirname, "..", "..");
const IN_CI = process.env.GITHUB_ACTIONS === "true";

/**
 * The comparison itself, pure and therefore testable.
 *
 * The live rule below is conditional on this branch declaring something, and
 * most branches declare nothing — so a mutant replacing the loop with `[]`
 * passed the entire file until this was extracted.
 */
export function findCollisions(
  mine: string[],
  others: { branch: string; declared: string[] }[],
  self: string | null,
): string[] {
  const wanted = new Set(mine);
  const out: string[] = [];
  for (const { branch, declared } of others) {
    if (self !== null && branch === self) continue; // my own pushed head
    for (const id of declared) if (wanted.has(id)) out.push(`${id} is also declared by ${branch}`);
  }
  return out;
}

/** What THIS working tree declares — the thing the PR actually proposes. */
function declaredHere(): string[] {
  const out: string[] = [];
  for (const file of ledgerFiles(ROOT)) {
    const text = readFileSync(join(ROOT, file), "utf8");
    for (const item of ledgerItems(file, text)) if (isInProgress(item)) out.push(item.id);
  }
  return out;
}

describe("ledger claim collision (cross-branch backstop)", () => {
  it("declares no row that another live branch already declares", () => {
    // Refresh in CI at whatever depth the checkout has. Skipping on a full clone
    // would leave a branch pushed after checkout invisible — the exact collision
    // this exists to catch. Only the --depth=1 argument is conditional, because
    // that is what converts a full clone to shallow and breaks ancestry for every
    // later command in the worktree.
    if (IN_CI) {
      const shallow =
        execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
          cwd: ROOT,
          encoding: "utf8",
          timeout: 30_000,
        }).trim() === "true";
      // Under CI a fetch failure FAILS, deliberately unwrapped: a guard that
      // cannot see the universe must not report it clean.
      execFileSync(
        "git",
        [
          "fetch",
          "--no-tags",
          ...(shallow ? ["--depth=1"] : []),
          "origin",
          "+refs/heads/*:refs/remotes/origin/*",
        ],
        { cwd: ROOT, timeout: 30_000 },
      );
    }

    const mine = declaredHere();

    // One shared reader. Every git fault in it THROWS rather than yielding an
    // empty answer, so a failure surfaces as a red test instead of a clean pass
    // over a universe that was never inspected.
    // declaredOnly: this guard is declared-versus-declared by spec, and without
    // it the shared resolver would call `gh` (forbidden here), plus tip dates,
    // merge-bases and diffs that only feed the advisory inferred signal — work
    // this never reads and can fail on.
    const res = resolveClaims(realGitSurface(), { fetch: false, declaredOnly: true });

    const byBranch = new Map<string, string[]>();
    for (const c of res.claims) {
      if (c.kind !== "declared") continue;
      byBranch.set(c.branch, [...(byBranch.get(c.branch) ?? []), c.id]);
    }
    const others = [...byBranch.entries()].map(([branch, declared]) => ({ branch, declared }));

    // ONE call site, used twice. When this branch declares nothing — the normal
    // case — no assertion on `collisions` can distinguish a working call from a
    // literal `[]`, because both are empty. Routing a canary through the SAME
    // function makes the machinery provable on every run.
    const collide = (ids: string[]) => findCollisions(ids, others, res.selfBranch);
    const collisions = collide(mine);

    const other = others.find((o) => o.branch !== res.selfBranch && o.declared.length > 0);
    const canary = other?.declared[0];
    if (other !== undefined && canary !== undefined) {
      expect(
        collide([canary]),
        "the comparison this backstop rests on did not detect a live declaration",
      ).toContain(`${canary} is also declared by ${other.branch}`);
    }

    expect(
      collisions,
      "another live branch already declares a row this branch declares — reconcile before merging, " +
        "or clear the stale marker if that branch is finished",
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The rule above is conditional on this branch declaring something, so it would
// pass against a guard that did nothing. These prove it catches its violation on
// planted input rather than on live branch state, which changes hourly.
describe("the backstop catches what it claims to", () => {
  const MARK = (id: string, branch: string) =>
    `## ${id} — planted\n\n**Status:** IN PROGRESS · **Branch:** ${branch}\n`;

  it("reads a declared claim out of planted ledger text", () => {
    const items = ledgerItems("BACKLOG.md", MARK("BL-PLANTED-COLLISION", "feat/other"));
    expect(items.filter(isInProgress).map((i) => i.id)).toEqual(["BL-PLANTED-COLLISION"]);
  });

  it("does not read an OPEN entry as a claim", () => {
    const items = ledgerItems("BACKLOG.md", "## BL-PLANTED-OPEN — planted\n\n**Status:** OPEN.\n");
    expect(items.filter(isInProgress)).toEqual([]);
  });

  it("sees a marker below the 12-line window, which is the shape that started this", () => {
    const body = [
      "**Status:** OPEN",
      ...Array<string>(15).fill("filler"),
      "**Status:** IN PROGRESS · **Branch:** feat/x",
    ].join("\n\n");
    const items = ledgerItems("BACKLOG.md", `## BL-PLANTED-DEEP — planted\n\n${body}\n`);
    expect(items.filter(isInProgress).map((i) => i.id)).toEqual(["BL-PLANTED-DEEP"]);
  });
});

describe("findCollisions — the comparison the live rule cannot exercise here", () => {
  it("reports a row another branch declares", () => {
    expect(
      findCollisions(["BL-X"], [{ branch: "feat/other", declared: ["BL-X"] }], "feat/mine"),
    ).toEqual(["BL-X is also declared by feat/other"]);
  });

  it("does not report my own pushed head", () => {
    expect(
      findCollisions(["BL-X"], [{ branch: "feat/mine", declared: ["BL-X"] }], "feat/mine"),
    ).toEqual([]);
  });

  it("reports my own head when identity is unresolved, because nothing is self", () => {
    expect(findCollisions(["BL-X"], [{ branch: "feat/mine", declared: ["BL-X"] }], null)).toEqual([
      "BL-X is also declared by feat/mine",
    ]);
  });

  it("ignores rows this branch does not declare", () => {
    expect(
      findCollisions(["BL-X"], [{ branch: "feat/other", declared: ["BL-OTHER"] }], null),
    ).toEqual([]);
  });

  it("reports every colliding branch, not just the first", () => {
    const out = findCollisions(
      ["BL-X"],
      [
        { branch: "feat/a", declared: ["BL-X"] },
        { branch: "feat/b", declared: ["BL-X"] },
      ],
      null,
    );
    expect(out).toHaveLength(2);
  });
});
