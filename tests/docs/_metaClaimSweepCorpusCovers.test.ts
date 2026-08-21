/**
 * The two spec §2.0 covers whose subject is the CORPUS rather than the module.
 *
 * They live here, outside `tests/specLint/`, because neither imports the module
 * and neither can fail differently under a mutant of it: they compare fixture
 * DATA and a declared document list against the tracked corpus. Enrolling them
 * as deciding suites would buy wall clock at no mutation score.
 *
 * COVER 1 -- no collision. This arm scans documents, and its own spec, plan and
 * probe record ARE documents in the corpus §2 measures, so a synthetic
 * transition sentence written into a fixture is a sentence a census over the
 * corpus could count. The cover is keyed on the exported ARRAY in
 * `claimSweepLiterals`, never on a nonce token grepped across fixture titles: a
 * nonce is a CONVENTION, so a nonce-keyed check is blind to any literal written
 * without it, and a literal that forgets the convention is exactly the one
 * nobody remembered to mark.
 *
 * COVER 2 -- the population relation of AC-6, asserted as a SET RELATION and
 * never a cardinality. No case here pins 1135, 1131 or any other §2 figure;
 * pinning one is how a corpus that grows turns a correct arm red.
 *
 * BOTH CARRY A POSITIVE CONTROL, for the same reason: a zero from an empty or
 * unreadable population is indistinguishable from a real one, and every
 * assertion below is a zero or an emptiness.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SYNTHETIC_LITERALS } from "../specLint/claimSweepLiterals";

const ROOT = join(__dirname, "..", "..");
const DECLARATION = join(
  ROOT,
  "docs/superpowers/specs/ci/probes/scripts/arc-documents.json",
);
const ARC_DOCUMENTS: string[] = Object.values(
  JSON.parse(readFileSync(DECLARATION, "utf8")).documents as Record<string, string>,
);

function git(args: string[]): { status: number; out: string } {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error !== undefined) throw r.error;
  return { status: r.status ?? -1, out: r.stdout };
}

/** Tracked markdown under docs/superpowers -- the enumeration, before exclusion. */
const enumeration = git(["ls-files", "--", "docs/superpowers"]).out
  .split("\n")
  .filter((p) => p.endsWith(".md"));

/** Files carrying `needle` LITERALLY, with this arc's own documents excluded. */
function corpusHits(needle: string): string[] {
  const { status, out } = git([
    "grep", "-F", "-l", "-e", needle,
    // THE SAME POPULATION THE CENSUS MEASURES, and the `*.md` filter is the
    // load-bearing half rather than a tidy-up. The census enumerates markdown
    // only, so "collides with the corpus" means "a census over the corpus would
    // count it". Searching every tracked file instead reported a collision that
    // is not one: the killer-audit SCRIPT quotes a literal inside a mutant
    // recipe, which no census reads. A cover whose search population is wider
    // than the population it makes a claim about reports findings the claim
    // does not cover.
    "--", "docs/superpowers/*.md",
    ...ARC_DOCUMENTS.map((p) => `:!${p}`),
  ]);
  if (status === 1) return []; // git grep: 1 means no match, not an error
  if (status !== 0) throw new Error(`git grep failed (status ${status}) for: ${needle.slice(0, 60)}`);
  return out.split("\n").filter(Boolean);
}

/**
 * A REAL transition sentence from OUTSIDE this arc's documents, discovered at
 * run time rather than typed. Typing one would pin a corpus line that an
 * unrelated edit can delete, turning a correct arm red; deriving it means the
 * control tracks the corpus it is a control for.
 */
function realCorpusSentence(): string | null {
  for (const path of enumeration) {
    if (ARC_DOCUMENTS.includes(path)) continue;
    for (const line of readFileSync(join(ROOT, path), "utf8").split("\n")) {
      const t = line.trim();
      // Long enough to be a sentence rather than a fragment that matches
      // everywhere, and carrying a transition shape so the control exercises
      // the same lookup the cover uses to report ZERO.
      if (t.length > 60 && t.length < 200 && /\b\d+\s*(?:->|→|to)\s*\d+\b/.test(t)) return t;
    }
  }
  return null;
}

describe("claim sweep — the corpus covers of spec §2.0", () => {
  describe("no synthetic fixture literal collides with the corpus", () => {
    it("PREMISE: the population and the literal set are both non-empty", () => {
      // Every assertion below is a ZERO. Over an empty corpus, or an empty
      // literal array, they are all satisfied by a checker that looked at
      // nothing.
      expect(enumeration.length).toBeGreaterThan(100);
      expect(SYNTHETIC_LITERALS.length).toBeGreaterThanOrEqual(9);
    });

    it("POSITIVE CONTROL: the same lookup DOES find a real corpus sentence", () => {
      // Without this, a `git grep` that silently matched nothing -- a wrong
      // pathspec, a broken invocation -- would report every literal clean.
      const real = realCorpusSentence();
      expect(real).not.toBeNull();
      expect(corpusHits(real!).length).toBeGreaterThan(0);
    });

    it("finds NO synthetic literal anywhere in the corpus", () => {
      // ONE case over the whole array rather than one per literal, so a failing
      // run names EVERY collision at once. A per-literal parameterisation
      // reports the first and hides the rest until the next run, which is the
      // drip this project charges as a review defect on reviewers and is no
      // better in a checker.
      const colliding = SYNTHETIC_LITERALS.map((literal) => ({
        literal: literal.slice(0, 70),
        files: corpusHits(literal),
      })).filter((r) => r.files.length > 0);
      expect(colliding).toEqual([]);
    });
  });

  describe("the population relation (AC-6), as a set relation and never a count", () => {
    // ASSERTED AGAINST THE SHIPPED SCRIPT'S OUTPUT, not against a recomputation
    // here. A cover that re-derives the population from `ARC_DOCUMENTS` and
    // then checks it excludes `ARC_DOCUMENTS` is internally consistent by
    // construction and would pass against a census that excludes nothing --
    // which is the weaker implementation this row names. So the census RUNS and
    // its report is the subject.
    const census = spawnSync(
      "python3",
      ["docs/superpowers/specs/ci/probes/scripts/2026-08-20-population-census.py"],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    const out = census.stdout ?? "";
    const declaredPresent = ARC_DOCUMENTS.filter((p) => enumeration.includes(p));
    const reported = (label: string): number => {
      const m = new RegExp(`${label}:\\s+(\\d+)`).exec(out);
      if (m === null) throw new Error(`census did not report "${label}":\n${out.slice(0, 600)}`);
      return Number(m[1]);
    };

    it("PREMISE: the census RAN, and the declaration removed something", () => {
      // Every assertion below reads the census's report. A census that failed to
      // start produces an empty string, in which the exclusions are absent and
      // so is everything else.
      expect(out).toContain("POPULATION");
      expect(enumeration.length).toBeGreaterThan(100);
      expect(declaredPresent.length).toBeGreaterThan(0);
    });

    it("EXITS ZERO: its own parity gate agrees the exclusion is the declaration", () => {
      expect(census.status).toBe(0);
      expect(out).toContain("OK    the exclusion is exactly the declaration");
    });

    it("names EVERY declared document that exists as excluded, and no other", () => {
      const named = declaredPresent.filter((p) => out.includes(p));
      expect(named.sort()).toEqual([...declaredPresent].sort());
      expect(reported("this arc's own documents, excluded by path")).toBe(declaredPresent.length);
    });

    it("measures the enumeration MINUS those documents, as a relation not a count", () => {
      // The figure is derived from the live enumeration on both sides, so a
      // corpus that grows moves both and the assertion holds. No §2 number is
      // pinned here.
      expect(reported("population actually measured below")).toBe(
        enumeration.length - declaredPresent.length,
      );
    });
  });
});
