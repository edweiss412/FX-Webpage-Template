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
const IN_CI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
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
  const base = process.env.GITHUB_REPOSITORY ?? null;
  // A bare branch name is not an identity across repositories: on a fork PR no
  // base ref is "me", so nothing may be excluded as self.
  if (base !== null && head !== base) return { branch: null, identity: "ci-resolved-fork" };
  return { branch: process.env.GITHUB_HEAD_REF ?? null, identity: "ci-resolved" };
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
      git(["fetch", "--no-tags", "--depth=1", "origin", "+refs/heads/*:refs/remotes/origin/*"]);
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

    const wanted = new Set(mine);
    const collisions: string[] = [];
    for (const ref of refs) {
      const branch = ref.replace(/^origin\//, "");
      if (self !== null && branch === self) continue; // my own pushed head
      for (const id of declaredAt(ref)) {
        if (wanted.has(id)) collisions.push(`${id} is also declared by ${branch}`);
      }
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
    const body = ["**Status:** OPEN", ...Array<string>(15).fill("filler"), "**Status:** IN PROGRESS · **Branch:** feat/x"].join("\n\n");
    const items = ledgerItems("BACKLOG.md", `## BL-PLANTED-DEEP — planted\n\n${body}\n`);
    expect(items.filter(isInProgress).map((i) => i.id)).toEqual(["BL-PLANTED-DEEP"]);
  });
});
