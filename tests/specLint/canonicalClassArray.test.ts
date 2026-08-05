// BL-CANONICAL-CLASS-ARRAY-BLINDSPOT — the canonical-class eslint rule cannot
// see inside `[...].join(" ")` classNames.
//
// `better-tailwindcss/enforce-canonical-classes` canonicalizes Tailwind classes
// in plain-string classNames and in `clsx`/`cn`/`cva` callees. It does NOT reach
// array-join classNames: the String matcher in the plugin's `parsers/es.js`
// returns an UNCROSSABLE_BOUNDARY at any CallExpression, so `.join()` blocks
// traversal into the array. No plugin setting overrides it. Canonical
// violations — rem→unit, `@theme` token drift, class renames — inside those
// arrays escape `pnpm lint`, and therefore escape CI.
//
// WHAT THIS GUARD IS, AND IS NOT. It does not canonicalize anything; it bounds
// the blind spot by CENSUS. Every array-join className that exists today is
// enumerated below. A new one fails this test, which is the actual protection:
// the set of classNames the linter cannot see can only shrink.
//
// The 33-site migration to `cn(...)` — after which `eslint --fix` canonicalizes
// them mechanically — is filed as BL-CLASSNAME-ARRAY-JOIN-MIGRATION rather than
// done here. It spans 20 files under `components/` and `app/`, which would make
// this branch an invariant-8 UI surface; the plan scopes the dual gate to the
// UI branch and marks this one `impeccable-gate: N/A — no UI surface`. That is
// class-sweep exception (c): a repair spanning enough sites to blow the review
// scope of the branch it would land on.
//
// ANTI-TAUTOLOGY. A census guard is worthless if it derives its expectation from
// the same scan it checks. The census below is a hand-written literal, so a scan
// that silently stopped finding sites fails on the count rather than passing
// with an empty set — and the count is asserted before the membership diff, so a
// broken recognizer cannot report "no new sites" while seeing nothing.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();

/**
 * Every array-join className in the tree at census time (2026-08-04), in the two
 * shapes the pattern takes. Both are invisible to the rule; they are listed
 * apart only because they need different recognizers.
 */
const CENSUS_DIRECT: readonly string[] = [
  "components/admin/OnboardingWizard.tsx",
  "components/admin/PublishedToggle.tsx",
  "components/admin/settings/AutoPublishToggle.tsx",
  "components/admin/settings/DeveloperToggleButton.tsx",
  "components/admin/settings/NotifyToggle.tsx",
  "components/admin/wizard/Step3SheetCard.tsx",
  "components/atoms/Avatar.tsx",
  "components/atoms/KeyValue.tsx",
  "components/crew/RightNowHero.tsx",
  "components/crew/SectionChipLink.tsx",
  "components/crew/primitives/DayCard.tsx",
  "components/crew/primitives/PersonRow.tsx",
  "components/crew/sections/GearSection.tsx",
  "components/crew/sections/TodaySection.tsx",
  "components/crew/sections/TravelSection.tsx",
];

/** Joined into a local first, then handed to className — same blind spot. */
const CENSUS_VIA_VARIABLE: readonly string[] = [
  "app/show/[slug]/[shareToken]/_PickerInterstitial.tsx",
  "components/atoms/Section.tsx",
  "components/shared/AccentButton.tsx",
];

const CENSUS: readonly string[] = [...CENSUS_DIRECT, ...CENSUS_VIA_VARIABLE].sort();

/** Tracked UI files only — an untracked scratch file is not a shipped className. */
function uiFiles(): string[] {
  return execFileSync("git", ["ls-files", "-z", "components", "app"], {
    cwd: ROOT,
    maxBuffer: 64 * 1024 * 1024,
  })
    .toString("utf8")
    .split("\0")
    .filter((f) => /\.tsx?$/.test(f));
}

/**
 * Files holding a `className={[ ... ].join(" ")}`.
 *
 * Deliberately narrow: `className={[` anchors it to a className, so a data join
 * like `[leg.date, leg.time].join(" ")` is not a false positive. The 1200-char
 * window is generous enough for the longest current site and bounded so a
 * `.join(" ")` far below an unrelated array cannot be attributed to it.
 */
function filesWithArrayJoinClassName(): string[] {
  const found = new Set<string>();
  for (const file of uiFiles()) {
    const src = readFileSync(file, "utf8");
    // Shape 1 — inline: `className={[ ... ].join(" ")}`. Anchored on `className={[`
    // so a data join like `[leg.date, leg.time].join(" ")` is not a false positive.
    // The 1200-char window clears the longest current site and is bounded so a
    // `.join(" ")` far below an unrelated array cannot be attributed to it.
    for (const m of src.matchAll(/className=\{\s*\[/g)) {
      if (src.slice(m.index, m.index + 1200).includes('.join(" ")')) found.add(file);
    }
    // Shape 2 — joined into a local, then used as a className. Same blind spot,
    // and the recognizer cannot lean on `className={` to disambiguate, so it
    // requires a Tailwind-SHAPED string literal inside the array instead. Without
    // this the guard leaves three real files uncovered while reporting a clean set.
    for (const m of src.matchAll(/(?:const|let)\s+\w+\s*(?::[^=]+)?=\s*\[/g)) {
      const window = src.slice(m.index, m.index + 1200);
      const j = window.indexOf('.join(" ")');
      if (j !== -1 && /"[a-z-]+:?[a-z0-9-]*\s/.test(window.slice(0, j))) found.add(file);
    }
  }
  return [...found].sort();
}

describe("array-join classNames are a closed set", () => {
  const actual = filesWithArrayJoinClassName();

  it("still finds the census (a recognizer that stopped working fails HERE)", () => {
    // Asserted before the diff below, so "no new sites" can never be the report
    // of a scan that found nothing at all.
    expect(actual.length).toBeGreaterThanOrEqual(CENSUS.length);
  });

  it("has no file the census does not name", () => {
    const added = actual.filter((f) => !CENSUS.includes(f));
    expect(
      added,
      "new array-join className(s). The canonical-class eslint rule CANNOT see inside these, so " +
        "Tailwind drift in them escapes `pnpm lint` and CI. Put the classes in a plain string " +
        "literal — the rule reads those. NOT `cn(...)`: no such helper exists in this repo yet " +
        "(see BL-CLASSNAME-ARRAY-JOIN-MIGRATION), and neither clsx nor cva is a dependency.",
    ).toEqual([]);
  });

  it("names no file that no longer has one (the census shrinks, never rots)", () => {
    const gone = CENSUS.filter((f) => !actual.includes(f));
    expect(
      gone,
      "census rows whose file no longer array-joins a className — migrated or deleted. Remove " +
        "the row: a census that over-claims quietly re-admits a site under a name nobody checks.",
    ).toEqual([]);
  });

  it("pins that the rule is ON, so this census guards a live gap", () => {
    // If the canonical-class rule were ever downgraded to `off`, the blind spot
    // would stop mattering and this census would be busywork pinning nothing.
    // The guard should die with the rule, not outlive it.
    const config = readFileSync("eslint.config.mjs", "utf8");
    expect(config).toMatch(/"better-tailwindcss\/enforce-canonical-classes":\s*"error"/);
  });

  it("records that NO recognized callee exists to migrate to yet", () => {
    // The entry's promotion mechanics say "migrate to `cn(...)` (already a
    // default-detected callee)". That premise is FALSE in this repo, verified
    // 2026-08-04: there is no `cn` helper anywhere under lib/components/app,
    // and neither `clsx` nor `class-variance-authority` is a dependency. The
    // eslint config names them only in a comment describing plugin defaults.
    //
    // So the migration is not the mechanical `eslint --fix` the entry promises —
    // it must first INTRODUCE the helper. Asserted rather than written down, so
    // the day someone adds `cn` this test fails and points them at the migration
    // entry, which is exactly when it becomes cheap.
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
    };
    const deps = Object.keys(pkg.dependencies ?? {});
    expect(deps).not.toContain("clsx");
    expect(deps).not.toContain("class-variance-authority");
    const helpers = execFileSync("git", ["ls-files", "-z", "lib", "components", "app"], {
      cwd: ROOT,
      maxBuffer: 64 * 1024 * 1024,
    })
      .toString("utf8")
      .split("\0")
      .filter((f) => /\.tsx?$/.test(f))
      .filter((f) => /export (?:function|const) cn\b/.test(readFileSync(f, "utf8")));
    expect(
      helpers,
      "a `cn` helper now exists — BL-CLASSNAME-ARRAY-JOIN-MIGRATION just became the cheap " +
        "mechanical fix the entry describes. Do it and delete this census.",
    ).toEqual([]);
  });
});
