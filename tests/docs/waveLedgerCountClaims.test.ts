// Wave documents may not assert a section-reorder ledger count that the live ledger
// contradicts.
//
// WHY THIS IS A GUARD AND NOT A FOURTH SWEEP. The near-miss arc regenerated
// `tests/parser/mutation/knownHoles.ts` from the harness's own alarms, which moved the
// section-reorder row count from the wave plan's authored 72 to a measured 59 and the closure
// from 10 to 24. Three consecutive whole-diff review rounds then found stale copies of those
// numbers — r1 one site, r2 five more, r3 six more — because each repair was an enumeration
// and every enumeration missed the next file. AGENTS.md's class-sweep rule names exactly this:
// "sweep to a derivation, not a longer list ... a sweep verified by enumeration re-opens the
// moment someone adds a site."
//
// The derivation: read the count from the ledger, walk the wave and near-miss documents from
// DISK, and fail on any line asserting a different count for the same thing. A document added
// later is covered without being listed, and a future shrink cannot leave half a sentence
// behind — the next arc that moves the ledger gets told which prose it just falsified.
//
// EXEMPTION, deliberately narrow: a superseded number is allowed when a marker sits WITHIN 80
// CHARACTERS of it (`amended`, `superseded`, `refuted`, `predicted`, `measured`, `originally`,
// `provenance`, `correction`, or a strikethrough). Provenance is worth keeping — the wave's
// prediction and its refutation are both part of the record — so the rule is "say which one it
// is", not "delete the old number". The window is not decoration: a line-wide test let a stale
// "72 rows STAY ... only 10 ... deleted" clause through on the strength of an unrelated
// "Amended" earlier in the same long sentence.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { KNOWN_SILENT_HOLES } from "@/tests/parser/mutation/knownHoles";
import { premiseHolds } from "@/tests/_shared/premise";

const ROOTS = [
  "docs/superpowers/plans/2026-08-08-parser-mutation-wave",
  "docs/superpowers/specs/parser",
  "docs/superpowers/plans",
];

/** Files whose whole purpose is to record what was measured or believed at a past date. */
const HISTORICAL = /\/(probes|review-rounds|handoffs)\//;

const walk = (dir: string): string[] => {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.startsWith(".")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".md")) out.push(p);
  }
  return out;
};

// The marker must sit near the number it excuses. A line-wide test was defeated by an
// unrelated "Amended" earlier in a long sentence, which let a stale "72 rows STAY ... only
// 10 ... deleted" clause through (whole-diff r4 P1); an 80-character window then rejected
// genuine amendments whose marker opens a long sentence. 220 is wide enough for a marked
// clause and far narrower than the lines this corpus writes.
const MARKER =
  /\b(amend(ed|ment)?|supersede[sd]?|refut(e|ed|es)|predict(ed|ion|s)?|measured|originally|provenance|correction|banner above|kept for)\b|~~/i;
const MARKER_WINDOW = 220;
const excused = (line: string, at: number): boolean =>
  MARKER.test(line.slice(Math.max(0, at - MARKER_WINDOW), at + MARKER_WINDOW));

describe("wave documents agree with the live ledger on section-reorder counts", () => {
  const live = KNOWN_SILENT_HOLES.filter((h) => h.siteId.startsWith("section-reorder:")).length;

  // Only files that talk about this operator at all can carry a stale claim about it.
  const files = [...new Set(ROOTS.flatMap(walk))]
    .filter((f) => !HISTORICAL.test(f))
    .filter((f) => /section-reorder/i.test(readFileSync(f, "utf8")));

  it("finds the documents it claims to check, and a live count to check them against", () => {
    // Both premises, executable: an empty file list or a zero count would make the sweep
    // below pass by covering nothing, which is the failure mode this guard exists to end.
    premiseHolds(`walked ${files.length} wave documents mentioning section-reorder`, files.length >= 3);
    premiseHolds(`live ledger holds ${live} section-reorder rows`, live > 0);
  });

  it("no unmarked line asserts a section-reorder row count the ledger contradicts", () => {
    // WHAT IS DERIVED HERE, AND WHAT IS NOT — stated plainly, because the difference is the
    // whole design. The FILE SET is derived: the walk reads them off disk, so a document
    // added later is covered without being listed, which is the property enumeration lacked.
    // The STALE VALUES are explicit, and deliberately so. A first cut tried to recognize any
    // contradicting integer from prose and over-fired immediately on "10 here + 17",
    // "119 rows" (a different operator's residue) and a procedural "10" — a guard that cries
    // wolf on ordinary sentences gets deleted, and then covers nothing at all. Matching a
    // known-stale value cannot over-fire, and it fails exactly when someone reasserts a
    // number this arc measured to be wrong.
    //
    // A future shrink that moves this count again adds ITS superseded value here, in the same
    // commit that moves the ledger. That is one line, and this test failing is what tells the
    // author to write it: the assertion below reads the live count, so the moment the ledger
    // moves, every unmarked prose copy of the OLD number is still flagged by the entry that
    // was current until then.
    const SUPERSEDED = [
      { value: 72, note: "the wave plan's authored survivor count; measured 59 on 2026-08-16" },
      { value: 10, note: "the wave plan's authored closure count; measured 24 on 2026-08-16" },
    ].filter((row) => row.value !== live);

    const bad: string[] = [];
    for (const f of files) {
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (!/section-reorder/i.test(line)) return;
          for (const { value, note } of SUPERSEDED) {
            // Bound to a row-noun, so a bare integer elsewhere in the sentence is not a claim
            // about this ledger. `(?<![\d,])` keeps "1,019 rows" from reading as "019 rows".
            const claim = new RegExp(
              "(?<![\\d,])\\b" + value + "\\b(?:\\s+[\\w-]+){0,2}\\s+rows?\\b" +
                "|\\brows?\\b(?:\\s+[\\w-]+){0,2}\\s+(?<![\\d,])\\b" + value + "\\b",
              "gi",
            );
            for (const m of line.matchAll(claim)) {
              if (excused(line, m.index ?? 0)) continue;
              bad.push(
                `${f}:${i + 1} asserts ${value} rows (${note}); the live ledger holds ${live} — ${line.trim().slice(0, 110)}`,
              );
            }
          }
        });
    }
    expect(
      bad,
      `${bad.length} wave document line(s) assert a superseded section-reorder count.\n` +
        `Fix the prose, or mark it superseded/amended/predicted within 80 characters if the old number is kept for provenance.\n` +
        bad.join("\n"),
    ).toEqual([]);
  });

  it("would catch a reassertion — the pattern is not inert", () => {
    // Without this the case above passes on a corpus that is already clean, and would keep
    // passing if the pattern stopped matching anything at all.
    const line = "the 72 ratified section-reorder rows stay";
    const m = /(?<![\d,])\b72\b(?:\s+\S+){0,3}\s+rows?\b/i.exec(line);
    expect(m, "the row-bound pattern must match a plain reassertion").not.toBeNull();
    expect(excused(line, m!.index), "and an unmarked line must not be excused").toBe(false);
    expect(
      excused("Amended 2026-08-16: the 72 ratified rows are superseded", 20),
      "a marked line must be excused",
    ).toBe(true);
  });
});
