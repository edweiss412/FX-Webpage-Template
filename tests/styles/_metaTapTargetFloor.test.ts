import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { premiseHolds } from "../_shared/premise";
import { TAP_TARGET_CENSUS } from "./tapTargetCensus";

/** The declared category set, so a header tally for a name that is not one fails loudly. */
const CATEGORIES = new Set([
  "inline-prose-link",
  "parent-label-target",
  "full-bleed",
  "padding-arithmetic",
  "under-floor-filed",
  "dev-only-unstyled",
  "unresolvable-dynamic",
]);
import { scanTapTargets } from "./tapTargetScan";

/** Every entry id the live ledger defines, open or archived. */
const ledgerIds = (() => {
  let cache: Set<string> | null = null;
  return (): Set<string> => {
    if (cache) return cache;
    const ids = new Set<string>();
    for (const file of ["BACKLOG.md", "BACKLOG-archive.md", "DEFERRED.md", "DEFERRED-archive.md"]) {
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      for (const m of text.matchAll(/^#{2,4}\s+((?:BL|DEF)-[A-Z0-9]+(?:-[A-Z0-9]+)*)/gm)) {
        ids.add(m[1]!);
      }
    }
    return (cache = ids);
  };
})();

const verdicts = scanTapTargets(process.cwd());
const key = (x: { file: string; line: number }) => `${x.file}:${x.line}`;
const census = new Map(TAP_TARGET_CENSUS.map((r) => [key(r), r]));
const unclassified = verdicts.filter((v) => v.state === "unclassified");

describe("repo-wide tap-height floor (spec §5)", () => {
  it("premise: the corpus is non-trivial and something clears", () => {
    premiseHolds("corpus >=300", verdicts.length >= 300);
    premiseHolds(
      "a SECONDARY_ACTION_CLASS consumer clears via rule 6",
      verdicts.some((v) => v.file.endsWith("RescanSheetButton.tsx") && v.state === "clear"),
    );
  });
  it("every UNCLASSIFIED element has a census row (fail names the element)", () => {
    expect(
      unclassified.filter((v) => !census.has(key(v))).map((v) => `${key(v)} <${v.tag}>`),
    ).toEqual([]);
  });
  it("no stale census row (every row still a live unclassified site)", () => {
    const live = new Set(unclassified.map(key));
    expect(TAP_TARGET_CENSUS.filter((r) => !live.has(key(r))).map(key)).toEqual([]);
  });
  /**
   * `dev-only-unstyled` is a DOCUMENTED LIMIT, not a filing, and its bar is what
   * keeps that honest.
   *
   * The dev panel was ratified as an unstyled developer tool on 2026-08-25
   * (design doc 2026-08-25-ui-polish-class-sweep-design.md, D5, closing
   * `BL-ADMIN-DEV-PANEL-TAP-FLOOR`). Two things make that a defensible position
   * rather than a shrug, and both are asserted here because a position nobody
   * can check decays into a shrug on its own.
   *
   * First, the surface is genuinely unreachable in production: its classes are
   * excluded from Tailwind's source scan, so `min-h-tap-min` added there today
   * emits no CSS at all while making a static guard report a floor the browser
   * never applies. That is strictly worse than an honest row, and it is the
   * argument the ledger entry itself made. If the exclusion ever goes away the
   * argument goes with it, so the exclusion is the row's executable premise.
   *
   * Second, a documented limit owes a RE-FILE TRIGGER — the condition under
   * which it stops being one. Without it, "documented limit" is just a category
   * that never has to answer for itself again.
   */
  it("every dev-only-unstyled row is still excluded from the Tailwind source scan", () => {
    const rows = TAP_TARGET_CENSUS.filter((r) => r.category === "dev-only-unstyled");
    premiseHolds("there is a dev-only-unstyled row to check", rows.length > 0);
    const globals = readFileSync("app/globals.css", "utf8");
    for (const r of rows) {
      expect(
        globals,
        `${r.file} is categorised dev-only-unstyled but is no longer @source-excluded, so its classes DO compile and the ratification's premise is gone`,
      ).toContain(`@source not "../${r.file}"`);
    }
  });

  it("every dev-only-unstyled row names the condition that would re-file it", () => {
    for (const r of TAP_TARGET_CENSUS.filter((r) => r.category === "dev-only-unstyled")) {
      expect(
        r.reason.toLowerCase(),
        `${r.file}:${r.line} is a documented limit with no re-file trigger`,
      ).toContain("re-file trigger");
    }
  });

  it("reasons are never blank; filed rows carry a resolvable backlog ref", () => {
    for (const r of TAP_TARGET_CENSUS) {
      expect(r.reason.trim().length).toBeGreaterThan(0);
      if (r.category === "under-floor-filed") {
        // The plan pinned this to BL-TAP-TARGET-INLINE-TEXT-CONTROLS, the entry
        // spec §1.1 R8 hands bucket-A residue to. That entry GRADUATED on
        // 2026-08-11 (3 exempt / 5 repaired), so the residue it owned no longer
        // exists and the scan found none: every under-floor row here belongs to
        // a different family. The pin becomes the ledger-id SHAPE plus an
        // existence check against the live ledger, which is a stronger claim
        // than a hardcoded id — a row cannot name an entry nobody filed.
        expect(r.backlogRef, `${r.file}:${r.line} is filed but names no entry`).toMatch(
          /^(BL|DEF)-[A-Z0-9]+(-[A-Z0-9]+)*$/,
        );
        expect(
          ledgerIds(),
          `${r.file}:${r.line} names ${r.backlogRef}, absent from the ledger`,
        ).toContain(r.backlogRef);
      }
    }
  });
});

describe("census self-accounting (whole-diff R2 F2 / R3 F2)", () => {
  // Two review rounds found the same shape: a count written in prose that the
  // rows no longer support. The counts are DERIVED from the data here, so the
  // header cannot drift from the registry again — and a category whose tally is
  // missing from the header fails too, rather than passing by omission.
  const source = readFileSync("tests/styles/tapTargetCensus.ts", "utf8");

  it("the header's per-category tallies match the rows", () => {
    // Comment markers and line wraps are stripped first: prettier rewraps this
    // header on unrelated edits, and a guard that only reads unwrapped lines
    // would go quiet exactly when the header changed.
    const header = source
      .slice(0, source.indexOf("export type TapCensusCategory"))
      .replace(/^\s*\*/gm, " ")
      .replace(/\s+/g, " ");
    const declared = new Map<string, number>();
    for (const m of header.matchAll(/(\d+) ([a-z-]+)/g)) {
      const category = m[2]!;
      if (CATEGORIES.has(category)) declared.set(category, Number(m[1]));
    }
    const actual = new Map<string, number>();
    for (const row of TAP_TARGET_CENSUS) {
      actual.set(row.category, (actual.get(row.category) ?? 0) + 1);
    }
    premiseHolds("the header states a tally for every category in use", declared.size > 0);
    expect(Object.fromEntries([...declared].sort())).toEqual(
      Object.fromEntries([...actual].sort()),
    );
  });

  it("every SECTION marker's tally matches the rows filed under it", () => {
    // The rows are grouped by `// ---- <category> (<n>) ----` markers. Three
    // review rounds found three different ways for that grouping to lie: a
    // stale number, a row under the wrong marker, and — once the first two were
    // guarded — a tally that only had to hold IN AGGREGATE, so two sections of
    // one category could offset each other's errors (R5 F1). Each section is
    // checked on its own now, and the rows are counted back to the registry so
    // a deleted or misspelled marker cannot quietly drop the rows beneath it
    // (R5 F2).
    const sections: { category: string; declared: number; rows: string[] }[] = [];
    let seenRows = 0;
    for (const line of source.split("\n")) {
      const marker = line.match(/^\s*\/\/ ---- ([a-z-]+)[^(]*\((\d+)\)/);
      if (marker && CATEGORIES.has(marker[1]!)) {
        sections.push({ category: marker[1]!, declared: Number(marker[2]), rows: [] });
        continue;
      }
      const category = line.match(/^\s*category: "([a-z-]+)",/);
      if (!category) continue;
      seenRows += 1;
      if (sections.length > 0) sections.at(-1)!.rows.push(category[1]!);
    }

    // EVERY row is under some marker: a row before the first marker, or after a
    // marker whose spelling stopped matching, would otherwise be invisible here
    // while every other assertion passed.
    expect(seenRows).toBe(TAP_TARGET_CENSUS.length);
    expect(sections.reduce((n, s) => n + s.rows.length, 0)).toBe(TAP_TARGET_CENSUS.length);
    // ...and every category in use has at least one marker, so a whole family
    // cannot lose its heading.
    expect([...new Set(sections.map((s) => s.category))].sort()).toEqual(
      [...new Set(TAP_TARGET_CENSUS.map((r) => r.category))].sort(),
    );

    // PER SECTION, not per category: an aggregate check lets one section's
    // overcount cancel another's undercount.
    expect(
      sections
        .filter((s) => s.declared !== s.rows.length)
        .map((s) => `${s.category}: declares ${s.declared}, holds ${s.rows.length}`),
    ).toEqual([]);
    // Every row that follows a marker belongs to that marker's category.
    expect(
      sections.flatMap((s) =>
        s.rows.filter((r) => r !== s.category).map((r) => `${s.category}<-${r}`),
      ),
    ).toEqual([]);
  });

  it("the header's row total matches the registry length", () => {
    const total = source.match(/(\d+) rows out of \d+ in-scope elements/);
    premiseHolds("the header states a row total", total !== null);
    expect(Number(total![1])).toBe(TAP_TARGET_CENSUS.length);
  });
});
