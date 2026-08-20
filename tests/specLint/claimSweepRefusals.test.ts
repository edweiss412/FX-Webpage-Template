/**
 * Task 2 — the three refusals, and their CHANNEL (spec §3.0, §3.4, AC-3).
 *
 * A refusal is NOT a finding. Each of the three is an adapter-level USAGE
 * ERROR: the run does not happen, no document is swept, and there is nothing to
 * report ABOUT a document. Each prints its reason naming the offending values
 * and exits 2 — the code `spec:lint` already uses for a usage error rather than
 * a document defect. A refusal that emitted a finding would put a usage mistake
 * in the same channel as a claim about the corpus, and a reader could not then
 * tell a swept-and-clean run from a run that never started.
 *
 * THE EXIT CODE IS NOT THE DISCRIMINATOR, and the draft of this plan got that
 * wrong. Before the adapter learns these flags it rejects them as unknown and
 * ALREADY exits 2, so an assertion of "0 becomes 2" can never fail. The REASON
 * LINE is what moves: the pre-task message names a flag, the shipped refusal
 * names both declared values and the equality between them. The exit code is
 * asserted here as a GREEN-phase regression pin, where it holds for a different
 * cause than the one under test.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
// .bin/tsx is a shell wrapper and is not node-executable.
const TSX = join(ROOT, "node_modules/tsx/dist/cli.mjs");
const DOC = "tests/specLint/fixtures/docs/superpowers/specs/clean.md";
const T = 30000;

function cli(args: string[]) {
  const r = spawnSync(process.execPath, [TSX, "scripts/spec-lint.ts", ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Occurrences of a token on its own word boundaries, so `58` does not match `580`. */
function countToken(text: string, token: string): number {
  return [...text.matchAll(new RegExp(`(?<![A-Za-z0-9_])${token}(?![A-Za-z0-9_])`, "g"))].length;
}

describe("claim sweep — the three refusals (spec §3.0)", () => {
  describe("N === M: a declaration whose superseded value equals its replacement", () => {
    it(
      "refuses by name, naming BOTH values, and emits no finding",
      () => {
        // One ordinary typo makes every sentence containing 58 also "carry the
        // replacement", so §3.1 suppresses every occurrence and the run reports
        // a silent clean. The declaration is well-formed by every other test,
        // so nothing else catches it.
        const r = cli([DOC, "--superseded", "58", "--replacement", "58"]);
        expect(r.code).toBe(2);
        // The REASON is the assertion. It names both declared values and says
        // they are equal — not merely that a flag was wrong.
        expect(countToken(r.stderr, "58")).toBeGreaterThanOrEqual(2);
        expect(r.stderr).toMatch(/equal/i);
        expect(r.stderr).toMatch(/superseded/);
        expect(r.stderr).toMatch(/replacement/);
        // A refusal is not a finding: no report is written at all.
        expect(r.stdout).toBe("");
        expect(r.stderr).not.toMatch(/unknown flag/);
      },
      T,
    );

    it(
      "does NOT refuse the same declaration with a DIFFERENT replacement (one variable apart)",
      () => {
        // The variable is the replacement value alone. Without this pin the
        // refusal above is satisfied by an implementation that refuses every
        // declaration, which would be the silent clean wearing another costume.
        const r = cli([DOC, "--superseded", "58", "--replacement", "57"]);
        expect(r.code).not.toBe(2);
        expect(r.stderr).toBe("");
      },
      T,
    );
  });

  describe("--claim-about without --repair", () => {
    it(
      "refuses by name, naming the missing flag, and emits no finding",
      () => {
        // Only --repair supplies the hunk spans that exclude the repair's own
        // NEW claim. Without them the named half has no way to omit it and
        // would report all nine of the incident's occurrences, including the
        // five the repair itself wrote — a wrong advisory.
        const r = cli([DOC, "--claim-about", "PublishedReviewModal.tsx:964"]);
        expect(r.code).toBe(2);
        expect(r.stderr).toMatch(/--repair/);
        expect(r.stderr).toMatch(/--claim-about/);
        expect(r.stdout).toBe("");
        expect(r.stderr).not.toMatch(/unknown flag/);
      },
      T,
    );

    it(
      "does NOT refuse the same invocation WITH --repair (one variable apart)",
      () => {
        const r = cli([
          DOC,
          "--claim-about",
          "PublishedReviewModal.tsx:964",
          "--repair",
          "c272ebed3",
        ]);
        expect(r.code).not.toBe(2);
        expect(r.stderr).toBe("");
      },
      T,
    );
  });

  describe("--repair with no declaration", () => {
    it(
      "refuses by name, saying what was not declared, and emits no finding",
      () => {
        // The incident commit carries 58 on BOTH sides of its diff and changes
        // several literals, so no rule over that diff selects the semantic pair
        // deterministically. An implementation left to infer it picks A pair
        // while satisfying every other word of the spec. Silence from an
        // undeclared invocation is not a certificate, so the arm refuses rather
        // than running nothing and reporting clean.
        const r = cli([DOC, "--repair", "c272ebed3"]);
        expect(r.code).toBe(2);
        expect(r.stderr).toMatch(/--repair/);
        expect(r.stderr).toMatch(/--superseded|--claim-about/);
        expect(r.stdout).toBe("");
        expect(r.stderr).not.toMatch(/unknown flag/);
      },
      T,
    );

    it(
      "does NOT refuse the same invocation plus a declaration (one variable apart)",
      () => {
        const r = cli([DOC, "--repair", "c272ebed3", "--superseded", "58", "--replacement", "57"]);
        expect(r.code).not.toBe(2);
        expect(r.stderr).toBe("");
      },
      T,
    );
  });

  describe("the three reasons are DISTINCT (one refusal cannot stand in for another)", () => {
    it(
      "each refusal names its own offence",
      () => {
        const equal = cli([DOC, "--superseded", "58", "--replacement", "58"]).stderr;
        const noRepair = cli([DOC, "--claim-about", "X.tsx:1"]).stderr;
        const noDecl = cli([DOC, "--repair", "c272ebed3"]).stderr;
        // Premise: all three produced a reason at all.
        for (const s of [equal, noRepair, noDecl]) expect(s.length).toBeGreaterThan(0);
        expect(new Set([equal, noRepair, noDecl]).size).toBe(3);
      },
      T,
    );
  });

  describe("flags still reject genuinely unknown tokens", () => {
    it(
      "an unrecognised --token is a usage error naming it",
      () => {
        const r = cli([DOC, "--supersedes", "58"]);
        expect(r.code).toBe(2);
        expect(r.stderr).toMatch(/unknown flag: --supersedes/);
      },
      T,
    );

    it(
      "a declaration missing its counterpart is refused, both directions",
      () => {
        const onlyOld = cli([DOC, "--superseded", "58"]);
        expect(onlyOld.code).toBe(2);
        expect(onlyOld.stderr).toMatch(/--replacement/);
        const onlyNew = cli([DOC, "--replacement", "57"]);
        expect(onlyNew.code).toBe(2);
        expect(onlyNew.stderr).toMatch(/--superseded/);
      },
      T,
    );
  });
});
