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
// EXEMPTION, deliberately narrow: a line may carry a superseded number when it also marks it
// as superseded on the SAME line (`amended`, `superseded`, `refuted`, `predicted`,
// `originally`, `provenance`, or a strikethrough). Provenance is worth keeping — the wave's
// prediction and its refutation are both part of the record — so the rule is "say which one it
// is", not "delete the old number".
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

const EXEMPT =
  /\b(amend(ed|ment)?|supersede[sd]?|superseded|refut(e|ed|es)|predict(ed|ion)?|originally|provenance|correction|kept for|~~)\b/i;

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
    // Matches a count ASSERTED of these rows — "72 section-reorder rows", "the 72 ratified
    // rows", "59 rows remain" — not every integer that happens to sit near the word.
    const CLAIM =
      /\b(\d{1,4})\s+(?:(?:closed|real-loss|ratified|order-sensitivity|documented|remaining)\s+)*(?:`?section-reorder:?`?\s+)?rows?\b|\bsection-reorder\s+rows?\s+(?:remain(?:ing)?|left)\D{0,12}(\d{1,4})\b/gi;
    const bad: string[] = [];
    for (const f of files) {
      const lines = readFileSync(f, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (EXEMPT.test(line)) return;
        if (!/section-reorder/i.test(line)) return;
        for (const m of line.matchAll(CLAIM)) {
          const n = Number(m[1] ?? m[2]);
          if (!Number.isFinite(n) || n === live) continue;
          bad.push(`${f}:${i + 1} claims ${n} where the live ledger holds ${live} — ${line.trim().slice(0, 120)}`);
        }
      });
    }
    expect(
      bad,
      `${bad.length} wave document line(s) assert a section-reorder count the ledger contradicts.\n` +
        `Fix the prose, or mark the line as superseded/amended/predicted if the old number is being kept for provenance.\n` +
        bad.join("\n"),
    ).toEqual([]);
  });
});
