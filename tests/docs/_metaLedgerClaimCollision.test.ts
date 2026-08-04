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
// SCOPE. Declared-versus-declared only, for two independent reasons: an
// `inferred` claim is a heuristic over diff hunks and must never fail a PR, and
// it cannot even be computed here, since it needs a merge-base that a shallow CI
// clone does not have.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isInProgress, ledgerFiles, ledgerItems } from "@/scripts/lib/ledger-fields";

const ROOT = join(__dirname, "..", "..");
// GITHUB_ACTIONS only, matching the reader: a bare CI=true is set by local
// harnesses including this repo's own serial vitest project, and treating it as
// CI sends a local run down the event-payload path where identity reads
// unresolved.
const IN_CI = process.env.GITHUB_ACTIONS === "true";
const FETCH_MS = 30_000;

const git = (args: string[]): string =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8", timeout: FETCH_MS });

const gitQuiet = (args: string[]): string | null => {
  try {
    return execFileSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      timeout: FETCH_MS,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
};

/**
 * Identity, by the same three-case rule the reader uses. Collapsing any two
 * breaks one: outside CI the event payload is always absent, so treating that as
 * unknown would make every local run report its own claims as collisions.
 */
function selfBranch(): { branch: string | null; identity: string } {
  if (!IN_CI) {
    const name = (gitQuiet(["rev-parse", "--abbrev-ref", "HEAD"]) ?? "").trim();
    return { branch: name && name !== "HEAD" ? name : null, identity: "local" };
  }
  const p = process.env.GITHUB_EVENT_PATH;
  let head: string | null = null;
  if (p) {
    try {
      const ev = JSON.parse(readFileSync(p, "utf8")) as {
        pull_request?: { head?: { repo?: { full_name?: string } } };
      };
      head = ev.pull_request?.head?.repo?.full_name ?? null;
    } catch {
      head = null;
    }
  }
  if (head === null) return { branch: null, identity: "ci-unknown" };
  const base = process.env.GITHUB_REPOSITORY || null;
  // A bare branch name is not an identity across repositories: on a fork PR no
  // base ref is "me", so nothing may be excluded as self.
  if (base === null) return { branch: null, identity: "ci-unknown" };
  if (head !== base) return { branch: null, identity: "ci-resolved-fork" };
  return { branch: process.env.GITHUB_HEAD_REF ?? null, identity: "ci-resolved" };
}

/**
 * The comparison itself, pure and therefore testable.
 *
 * Extracted because the live rule above is conditional on this branch declaring
 * something, and this branch declares nothing — so a mutant replacing the loop
 * with `[]` passed the entire file. The planted suite below exercises THIS.
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

/** Declared claims at a ref, keyed by the ref rather than by the marker's own field. */
function declaredAt(ref: string): string[] {
  const out: string[] = [];
  for (const file of ledgerFiles(ROOT)) {
    const text = ref === "" ? readFileSync(join(ROOT, file), "utf8") : gitQuiet(["show", `${ref}:${file}`]);
    if (text === null) continue;
    for (const item of ledgerItems(file, text)) if (isInProgress(item)) out.push(item.id);
  }
  return out;
}

describe("ledger claim collision (cross-branch backstop)", () => {
  it("declares no row that another live branch already declares", () => {
    // Fetch what we need. Depth 1 is sufficient: only tip file content is read,
    // and it respects the wall-clock constraint at
    // .github/workflows/unit-suite.yml:149 that rejected fetch-depth: 0.
    try {
      // ONLY under CI, and only into an already-shallow checkout. A --depth=1
      // fetch CONVERTS a full clone into a shallow one: it writes .git/shallow,
      // which then breaks merge-base, ancestry, and this repo's own
      // merged-exclusion for every later command in that worktree. This test did
      // exactly that to its author's worktree, which is how the rule was learned.
      //
      // Locally the refs are already present and current from ordinary work, so
      // there is nothing to fetch and nothing to damage.
      // Gated on the checkout ACTUALLY being shallow, not on CI: `CI=true pnpm
      // test` in a full clone, or a future workflow using fetch-depth: 0, would
      // otherwise still write .git/shallow and damage ancestry for every later
      // command. The condition that matters is the repo shape, not the label.
      const alreadyShallow =
        (gitQuiet(["rev-parse", "--is-shallow-repository"]) ?? "").trim() === "true";
      if (IN_CI && alreadyShallow) {
        git(["fetch", "--no-tags", "--depth=1", "origin", "+refs/heads/*:refs/remotes/origin/*"]);
      }
    } catch (e) {
      // Under CI a fetch failure FAILS: a guard that cannot see the universe
      // must not report it clean. Locally it skips, so an offline `pnpm test`
      // does not go red for an environmental reason.
      if (IN_CI) throw e;
      return;
    }

    // Vacuous-pass guard: assert origin/main RESOLVED, never that a non-main
    // head exists. A fork PR against a base repo holding only `main` has zero
    // candidates and is a correct pass; requiring one would reject it.
    expect(gitQuiet(["rev-parse", "--verify", "origin/main"]), "origin/main did not resolve").not.toBeNull();

    const mine = declaredAt(""); // the working tree, which is what this PR proposes
    if (mine.length === 0) return;

    const { branch: self } = selfBranch();

    const refs = (gitQuiet(["for-each-ref", "--format=%(refname:short)", "refs/remotes/origin"]) ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter((r) => r.length > 0 && r !== "origin/main" && r !== "origin/HEAD");

    const collisions = findCollisions(
      mine,
      refs.map((ref) => ({ branch: ref.replace(/^origin\//, ""), declared: declaredAt(ref) })),
      self,
    );

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
    const body = ["**Status:** OPEN", ...Array<string>(15).fill("filler"), "**Status:** IN PROGRESS · **Branch:** feat/x"].join("\n\n");
    const items = ledgerItems("BACKLOG.md", `## BL-PLANTED-DEEP — planted\n\n${body}\n`);
    expect(items.filter(isInProgress).map((i) => i.id)).toEqual(["BL-PLANTED-DEEP"]);
  });
});

describe("findCollisions — the comparison the live rule cannot exercise here", () => {
  // Whole-diff review F5: this branch declares nothing, so the live test returns
  // early and `const collisions = []` passed the whole file. These plant the
  // comparison directly.
  it("reports a row another branch declares", () => {
    expect(findCollisions(["BL-X"], [{ branch: "feat/other", declared: ["BL-X"] }], "feat/mine")).toEqual([
      "BL-X is also declared by feat/other",
    ]);
  });

  it("does not report my own pushed head", () => {
    expect(findCollisions(["BL-X"], [{ branch: "feat/mine", declared: ["BL-X"] }], "feat/mine")).toEqual([]);
  });

  it("reports my own head when identity is unresolved, because nothing is self", () => {
    // The fork and ci-unknown cases both pass self=null, which is deliberate:
    // over-report rather than go quiet.
    expect(findCollisions(["BL-X"], [{ branch: "feat/mine", declared: ["BL-X"] }], null)).toEqual([
      "BL-X is also declared by feat/mine",
    ]);
  });

  it("ignores rows this branch does not declare", () => {
    expect(findCollisions(["BL-X"], [{ branch: "feat/other", declared: ["BL-OTHER"] }], null)).toEqual([]);
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
