/**
 * tests/ci/_metaModalWaitHelper.test.ts — the modal-wait structural guard.
 *
 * Spec: docs/superpowers/specs/ci/2026-08-16-modal-wait-boundary-helper-adoption-design.md
 * §4.4 (the guard), AC-2b / AC-2b-pattern (the total disposition and the shared
 * route constant), AC-3 (the executable premise proof).
 * Plan: docs/superpowers/plans/ci/2026-08-16-modal-wait-boundary-helper-adoption.md Task 2.
 *
 * What this file is FOR: after the adoption sweep, no e2e spec navigates
 * `/admin?…show=` with its own `page.goto` — every open routes through
 * tests/e2e/helpers/openShowReviewModal.ts, so a transient gateway 502 recovers
 * once and says so instead of starving a full timeout. This guard is what stops
 * the next spec from re-authoring the unguarded navigation.
 *
 * What it is NOT for (the §4.4 fence): it recognizes the single-line navigation
 * shape only. A URL assembled on one line and passed as a variable on the next,
 * a click-open, and any adversarial spelling are OUT OF SCOPE and file to
 * documented limits 5 and 7, never to guard growth. The threat model is an
 * ordinary contributor copy-pasting an existing pattern, not an adversary.
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";

import { premise, premiseHolds } from "../_shared/premise";
import {
  MODAL_ROUTE_PATTERN,
  classifyCandidates,
  enumerateCandidates,
  productOpenSurfaces,
  scanForViolations,
  type Candidate,
} from "./modalWaitHelper/scan";
import { DISPOSITION_RULES } from "./modalWaitHelper/disposition";

const REPO_ROOT = process.cwd();

/**
 * The exemption inventory, pinned. A third entry fails this suite until an
 * author edits the list deliberately — an accepted limit is a claim someone has
 * to re-make, never a hole that widens silently (spec §4.4).
 */
const PINNED_EXEMPTIONS = [
  "tests/e2e/published-review-modal.deeplink.spec.ts:298",
  "tests/e2e/published-review-modal.deeplink.spec.ts:344",
] as const;

const tempRoots: string[] = [];

/** A throwaway repo root holding one `tests/e2e/<name>.spec.ts` with `body`. */
function fixtureRoot(name: string, body: string): string {
  const root = mkdtempSync(join(tmpdir(), "modal-wait-guard-"));
  tempRoots.push(root);
  mkdirSync(join(root, "tests", "e2e"), { recursive: true });
  writeFileSync(join(root, "tests", "e2e", `${name}.spec.ts`), body, "utf8");
  return root;
}

afterAll(() => {
  // Left in the OS temp dir deliberately: the fixtures are tiny, and a failed
  // run is easier to diagnose with them still on disk.
  tempRoots.length = 0;
});

describe("modal-wait guard — premise proof (BL-GUARD-PREMISE-REACHABILITY)", () => {
  test("FLAGS a bare goto of the modal route", () => {
    const root = fixtureRoot(
      "bare",
      ['test("x", async ({ page }) => {', "  await page.goto(`/admin?show=${slug}`);", "});"].join(
        "\n",
      ),
    );
    const { violations } = scanForViolations(root);
    expect(violations.map((v) => v.line)).toEqual([2]);
  });

  test("STAYS QUIET on a helper call carrying the same URL text", () => {
    // The false-positive direction. Identical route text, no `goto(`.
    const helperLine = "  await openShowReviewModalAt(page, `/admin?show=${slug}`);";
    premiseHolds(
      "the quiet fixture carries the very route text the flagged one does",
      MODAL_ROUTE_PATTERN.test(helperLine),
    );
    const root = fixtureRoot(
      "adopted",
      ['test("x", async ({ page }) => {', helperLine, "});"].join("\n"),
    );
    expect(scanForViolations(root).violations).toEqual([]);
  });

  test("STAYS QUIET on a valid exemption, on the line and on the line above", () => {
    const root = fixtureRoot(
      "exempt",
      [
        'test("inline", async ({ page }) => {',
        "  await page.goto(`/admin?show=${slug}`); // modal-wait-exempt: asserts no modal renders",
        "});",
        'test("above", async ({ page }) => {',
        "  // modal-wait-exempt: skeleton-tolerant wait, cannot be hardened",
        "  await page.goto(`/admin?show=${other}`);",
        "});",
      ].join("\n"),
    );
    const { violations, exemptions } = scanForViolations(root);
    expect(violations).toEqual([]);
    expect(exemptions.map((e) => e.reason)).toEqual([
      "asserts no modal renders",
      "skeleton-tolerant wait, cannot be hardened",
    ]);
  });

  test("FLAGS an exemption whose reason is empty", () => {
    // An exemption that explains nothing is not an exemption.
    const root = fixtureRoot(
      "empty-reason",
      [
        'test("x", async ({ page }) => {',
        "  await page.goto(`/admin?show=${slug}`); // modal-wait-exempt:",
        "});",
      ].join("\n"),
    );
    expect(scanForViolations(root).violations.map((v) => v.line)).toEqual([2]);
  });

  test("FLAGS a bare goto in a file that ALSO imports the helper", () => {
    // The R1 finding-2 regression pin. A file-level "does this file import the
    // helper" predicate is a false-negative machine: one adopted site would
    // silence every other site in the same file. The refuted predicate passes
    // this fixture; the shipped per-site one must not.
    const root = fixtureRoot(
      "mixed",
      [
        'import { openShowReviewModalAt } from "./helpers/openShowReviewModal";',
        'test("adopted", async ({ page }) => {',
        "  await openShowReviewModalAt(page, `/admin?show=${a}`);",
        "});",
        'test("naked", async ({ page }) => {',
        "  await page.goto(`/admin?show=${b}`);",
        "});",
      ].join("\n"),
    );
    const { violations } = scanForViolations(root);
    premiseHolds(
      "the fixture really does import the helper, or the refuted predicate is not exercised",
      readFileSync(join(root, "tests", "e2e", "mixed.spec.ts"), "utf8").includes(
        "helpers/openShowReviewModal",
      ),
    );
    expect(violations.map((v) => v.line)).toEqual([6]);
  });

  test("STAYS QUIET on a goto of a different /admin route", () => {
    const root = fixtureRoot(
      "other-route",
      [
        'test("x", async ({ page }) => {',
        '  await page.goto("/admin/needs-attention");',
        '  await page.goto("/admin?bucket=archived");',
        "});",
      ].join("\n"),
    );
    expect(scanForViolations(root).violations).toEqual([]);
  });
});

describe("modal-wait guard — the shared route constant (AC-2b-pattern)", () => {
  test("the guard and candidate origin (a) agree on a param-position-agnostic URL", () => {
    // R5 finding 1 measured the cost of two regexes: the guard was widened to
    // match a `show` param in any position while origin (a) stayed on the
    // literal `admin?show=`, so this URL — one ordinary edit from
    // published-review-modal.interactions.spec.ts:281, which already holds it —
    // was flagged by the guard and never proposed as a candidate.
    const line = "  await page.goto(`/admin?bucket=archived&show=${slug}&alert_id=${id}`);";
    const root = fixtureRoot(
      "any-position",
      ['test("x", async ({ page }) => {', line, "});"].join("\n"),
    );

    expect(scanForViolations(root).violations.map((v) => v.line)).toEqual([2]);
    expect(
      enumerateCandidates(root)
        .filter((c) => c.origin === "a-route-literal")
        .map((c) => c.line),
    ).toEqual([2]);
  });

  test("the predicate module declares exactly ONE route regex", () => {
    // Two regexes that happen to agree today are the drift this pins shut.
    const source = readFileSync(join(REPO_ROOT, "tests/ci/modalWaitHelper/scan.ts"), "utf8");
    const routeRegexLiterals = source.match(/\/[^\n/]*admin\\\?[^\n]*show=[^\n]*\//g) ?? [];
    expect(routeRegexLiterals).toHaveLength(1);
    expect(source).toContain("export const MODAL_ROUTE_PATTERN");
  });
});

describe("modal-wait guard — the live corpus", () => {
  const { violations, exemptions } = scanForViolations(REPO_ROOT);

  test("no e2e spec navigates the modal route with its own page.goto", () => {
    expect(
      violations.map((v) => `${v.file}:${v.line}  ${v.text}`),
      "each line must route through tests/e2e/helpers/openShowReviewModal.ts, or declare " +
        "an inline `// modal-wait-exempt: <reason>` and be added to PINNED_EXEMPTIONS here",
    ).toEqual([]);
  });

  test("the exemption inventory is exactly the two pinned entries", () => {
    expect(exemptions.map((e) => `${e.file}:${e.line}`)).toEqual([...PINNED_EXEMPTIONS]);
    for (const exemption of exemptions) expect(exemption.reason.length).toBeGreaterThan(10);
  });

  test("the product-surface scan actually found surfaces, so origin (d) is not vacuous", () => {
    // The product half of origin (d) tolerates an absent app/ or components/
    // tree, which is right for a throwaway fixture root and catastrophic if it
    // ever silently held in the repo: every click-open candidate would vanish
    // and the disposition would look total while covering nothing.
    const surfaces = productOpenSurfaces(REPO_ROOT);
    premise("app/ + components/ yielded modal-route open surfaces", surfaces.length, 10);
    const prefixes = surfaces.map((s) => s.testIdPrefix).filter((p): p is string => p !== null);
    premise("those surfaces resolved to testid prefixes", prefixes.length, 5);
    // The two the census names explicitly (§2.1 (d)).
    expect(prefixes).toContain("shows-table-row-");
    expect(prefixes.some((p) => p.startsWith("needs-attention-link-"))).toBe(true);
  });

  test("the guard's population is walked from disk, so a new spec is covered by default", () => {
    const populated = new Set(enumerateCandidates(REPO_ROOT).map((c) => c.file));
    premise("the corpus walk found spec files", populated.size, 20);
    expect([...populated].every((file) => file.startsWith("tests/e2e/"))).toBe(true);
    // helpers/** is outside the population by construction, which is why the
    // helper's own page.goto needs no exemption.
    expect([...populated].some((file) => file.startsWith("tests/e2e/helpers/"))).toBe(false);
  });
});

describe("modal-wait census — total disposition (AC-2b)", () => {
  const candidates = enumerateCandidates(REPO_ROOT);
  const classification = classifyCandidates(candidates, DISPOSITION_RULES);

  test("every candidate carries a disposition", () => {
    premise("the five origins produced candidates to disposition", candidates.length, 100);
    expect(
      classification.undisposed.map((c) => `${c.origin} ${c.file}:${c.line}  ${c.text}`),
      "an undispositioned candidate is a site nobody decided about: adopt it (§4.2), " +
        "or add an exclusion rule carrying its reason in tests/ci/modalWaitHelper/disposition.ts",
    ).toEqual([]);
  });

  test("no candidate is claimed by two rules", () => {
    expect(
      classification.ambiguous.map((a) => `${a.candidate.file}:${a.candidate.line} ${a.ruleIds}`),
    ).toEqual([]);
  });

  test("every rule still matches something, and every exclusion matches its stated count", () => {
    const drift: string[] = [];
    for (const rule of DISPOSITION_RULES) {
      const actual = classification.countsByRule.get(rule.id) ?? 0;
      if (actual === 0) drift.push(`${rule.id}: matches nothing — its class is gone`);
      if (rule.expectedCount !== undefined && actual !== rule.expectedCount) {
        drift.push(`${rule.id}: ${actual} candidates, rule declares ${rule.expectedCount}`);
      }
    }
    expect(drift).toEqual([]);
  });

  test("every member rule names a §4.2 shape and every exclusion names a reason", () => {
    for (const rule of DISPOSITION_RULES) {
      expect(rule.disposition.reason.length, rule.id).toBeGreaterThan(20);
      if (rule.disposition.kind === "member") {
        expect(["G", "U", "N"], rule.id).toContain(rule.disposition.shape);
        expect(rule.expectedCount, `${rule.id}: member rules carry no count`).toBeUndefined();
      } else {
        expect(rule.expectedCount, `${rule.id}: exclusion rules must carry a count`).toBeTypeOf(
          "number",
        );
      }
    }
  });

  test("a constructed candidate with no disposition FAILS the check", () => {
    // The AC-2b red-first pin: the assertion above must be capable of failing.
    const orphan: Candidate = {
      origin: "a-route-literal",
      file: "tests/e2e/nobody-decided.spec.ts",
      line: 1,
      text: "await somethingNew(page, `/admin?show=${slug}`);",
    };
    const result = classifyCandidates([orphan], DISPOSITION_RULES);
    expect(result.undisposed).toHaveLength(1);
  });

  test("a subset assertion would be vacuous here, which is why totality is the contract", () => {
    // Origins (b)-(e) deliberately yield non-members, so a bare
    // `members === candidates` equality could never pass and a subset
    // assertion could never notice an omission. Both halves must be non-empty
    // for the disposition to be the load-bearing assertion.
    const memberRules = DISPOSITION_RULES.filter((r) => r.disposition.kind === "member");
    const exclusionRules = DISPOSITION_RULES.filter((r) => r.disposition.kind === "exclusion");
    premise("the disposition has members", memberRules.length, 0);
    premise("the disposition has exclusions", exclusionRules.length, 0);
  });
});
