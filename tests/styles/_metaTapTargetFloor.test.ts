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
    // The file header is only half the accounting: the rows are grouped by
    // `// ---- <category> (<n>) ----` markers, and round 4 found a marker that
    // had gone stale AND a row sitting under the wrong one. Both are derived
    // here — the count AND the membership — so a row moved between sections
    // without its marker reds, and a marker whose number is edited by hand reds.
    const sections: { category: string; declared: number; rows: string[] }[] = [];
    for (const line of source.split("\n")) {
      const marker = line.match(/^\s*\/\/ ---- ([a-z-]+)[^(]*\((\d+)\)/);
      if (marker && CATEGORIES.has(marker[1]!)) {
        sections.push({ category: marker[1]!, declared: Number(marker[2]), rows: [] });
        continue;
      }
      const category = line.match(/^\s*category: "([a-z-]+)",/);
      if (category && sections.length > 0) sections.at(-1)!.rows.push(category[1]!);
    }
    premiseHolds("the file is organised into marked sections", sections.length >= 6);
    // Every row that follows a marker belongs to that marker's category...
    expect(
      sections.flatMap((s) =>
        s.rows.filter((r) => r !== s.category).map((r) => `${s.category}<-${r}`),
      ),
    ).toEqual([]);
    // ...and the counts add up per category, across sections that repeat one.
    const declaredByCategory = new Map<string, number>();
    const actualByCategory = new Map<string, number>();
    for (const section of sections) {
      declaredByCategory.set(
        section.category,
        (declaredByCategory.get(section.category) ?? 0) + section.declared,
      );
      actualByCategory.set(
        section.category,
        (actualByCategory.get(section.category) ?? 0) + section.rows.length,
      );
    }
    expect(Object.fromEntries([...declaredByCategory].sort())).toEqual(
      Object.fromEntries([...actualByCategory].sort()),
    );
  });

  it("the header's row total matches the registry length", () => {
    const total = source.match(/(\d+) rows out of \d+ in-scope elements/);
    premiseHolds("the header states a row total", total !== null);
    expect(Number(total![1])).toBe(TAP_TARGET_CENSUS.length);
  });
});
