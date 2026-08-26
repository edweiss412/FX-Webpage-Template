/**
 * AC declaration grammar — corpus measurement.
 *
 * Question: can "a DECLARED acceptance criterion" be recognized from a plan's
 * body, and what would each candidate grammar flag across the live corpus?
 *
 * v2, after spec review R1 finding 2 refuted v1's numbers. Three defects, all
 * corpus-demonstrated, all repaired here:
 *   (a) the ID regex accepted only dot-separated segments, so the live
 *       hyphenated id `AC-2b-pattern`
 *       (docs/superpowers/plans/ci/2026-08-16-modal-wait-boundary-helper-adoption.md:24)
 *       split into `AC-2b`. The grammar is now taskContract.ts:38's, verbatim.
 *   (b) secondary ids were collected from the first 200 CHARACTERS of a
 *       declaring line, so a cross-reference to another document's id counted
 *       as a declaration here — `AC-11.11` at
 *       docs/superpowers/plans/2026-08-09-help-report-surface.md:61, on a line
 *       that declares AC-6. Collection now stops at the first sentence end.
 *   (c) the same 200-char window truncated CITED ids on long marker lines.
 *       Marker parsing now reads the whole line.
 *
 * v3, after spec review R2 findings 1 and 3, plus the migration classification.
 * Two more defects, both live-corpus:
 *   (d) SECONDARY-ID COLLECTION IS GONE. A bullet declares its LEADING id and
 *       nothing else. v2 cut at the first sentence end, which does not help when
 *       the whole line is one sentence: `- **AC-6** - master spec ... note;
 *       AC-11.11 carries r12.` still collected AC-11.11, an id owned by another
 *       document entirely. Four of the flagged ids were foreign ids picked up
 *       this way (AC-12b, AC-11.11, AC-6.18, AC-10b), each of them secondary.
 *       Dropping the rule removes the whole class and is a NARROWING, not a
 *       widening: 25 plans / 40 ids becomes 19 / 33.
 *   (e) the declaration regex had no token-end boundary, so `AC-1` matched
 *       inside `AC-1..AC-7` at
 *       docs/superpowers/plans/2026-08-17-speclint-prose-consistency-arms.md:175.
 *       Copying taskContract.ts:38's id text did not copy the delimiter its
 *       marker grammar supplies around it.
 *
 * v4, after spec review R3. Three more, and the third is a design change rather
 * than a grammar repair:
 *   (f) v3's boundary STILL admitted the range form: `(?![A-Za-z0-9-]|\.[A-Za-z0-9])`
 *       passes on `AC-1..AC-7` because the char after `AC-1` is a dot followed
 *       by another dot, not by an alphanumeric. Now `(?!\.\.)` as well, which
 *       rejects a range while still allowing an id that ends a sentence.
 *   (g) the walk read raw lines, so a declaration inside a FENCED block counted
 *       — control-outline-forward-guard.md:326 is a shell comment in a fence and
 *       was migrating as a real criterion. Fences are now elided first.
 *   (h) dropping secondary ids in v3 was an OVER-correction. It removed the four
 *       foreign ids AND three real ones: AC-2b (diagram-demote-notice/plan.md:39),
 *       AC-6 (speclint-prose-consistency-arms.md:175) and AC-10b
 *       (theme-persistence-note/plan.md:51) are this-plan criteria, discharged,
 *       and v3 silently stopped reporting them.
 *
 *       Three consecutive rounds each found a NEW grammar class on this one
 *       axis, which is the same-axis recurrence trigger; the prescribed repair
 *       is to decline to classify what the recognizer cannot, not to grow it
 *       again. So a declaring line now yields a CERTAIN id only when it carries
 *       exactly one id. A line carrying more is AMBIGUOUS: the arm does not fire
 *       on it and it is recorded by name. That boundary is structural — a count
 *       of ids on a line — rather than another grammar refinement, so it does
 *       not have a next round.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = execFileSync("grep", ["-rl", "<!-- tasks: depth=", "docs/superpowers/plans/"], {
  encoding: "utf8",
})
  .trim()
  .split("\n");

/** lib/specLint/taskContract.ts:38, verbatim — dots AND hyphens separate segments. */
const ID_SRC = "AC-[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*";

/** A list item or ATX heading whose content BEGINS with the id. */
/** The id must END at a token boundary: `AC-1..AC-7` declares nothing. */
const END = "(?!\\.\\.)(?![A-Za-z0-9-])";
const LIST_DECL = new RegExp(`^\\s*(?:[-*+]|\\d+[.)])\\s+(?:\\[[ xX]\\]\\s*)?(?:[*_\`]{0,3})(${ID_SRC})${END}`);
const HEAD_DECL = new RegExp(`^#{1,6}\\s+(?:[*_\`]{0,3})(${ID_SRC})${END}`);
const MARKER = /^\s*<!--\s*task:/;
const AC_FIELD = /\bac=([A-Za-z0-9.,-]+)/;

/** Fenced blocks elided, so a declaration inside one is inert (defect g). */
function elideFences(lines: string[]): string[] {
  const out: string[] = [];
  let fence: string | null = null;
  for (const l of lines) {
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(l);
    if (fence === null && m) { fence = m[1]![0]!; out.push(""); continue; }
    if (fence !== null) { if (m && m[1]![0] === fence) fence = null; out.push(""); continue; }
    out.push(l);
  }
  return out;
}

const ID_ANY = new RegExp(`${ID_SRC}${END}`, "g");

type Row = {
  file: string;
  certain: string[];
  ambiguous: { line: number; ids: string[] }[];
  cited: string[];
  unclaimed: string[];
};
const rows: Row[] = [];

for (const f of files) {
  const lines = elideFences(readFileSync(f, "utf8").split("\n"));
  const certain = new Set<string>();
  const ambiguous: { line: number; ids: string[] }[] = [];
  const cited = new Set<string>();
  lines.forEach((l, n) => {
    if (MARKER.test(l)) {
      const m = AC_FIELD.exec(l);
      if (m) for (const id of m[1]!.split(",")) if (/^AC-/.test(id)) cited.add(id);
      return;
    }
    const d = LIST_DECL.exec(l) ?? HEAD_DECL.exec(l);
    if (!d) return;
    ID_ANY.lastIndex = 0;
    const all = [...l.matchAll(ID_ANY)].map((m) => m[0]);
    const uniq = [...new Set(all)];
    // CERTAIN only when the line carries exactly one id (defect h).
    if (uniq.length === 1) certain.add(d[1]!);
    else ambiguous.push({ line: n + 1, ids: uniq });
  });
  const unclaimed = [...certain].filter((i) => !cited.has(i)).sort();
  rows.push({ file: f, certain: [...certain].sort(), ambiguous, cited: [...cited].sort(), unclaimed });
}

const ambigLines = rows.reduce((a, r) => a + r.ambiguous.length, 0);
const ambigPlans = rows.filter((r) => r.ambiguous.length > 0).length;
console.log(`plans: ${rows.length}`);
console.log(`plans with >=1 CERTAIN declaration: ${rows.filter((r) => r.certain.length > 0).length}`);
console.log(`AMBIGUOUS declaring lines (arm declines, recorded): ${ambigLines} across ${ambigPlans} plans`);
console.log(`plans flagged UNCLAIMED: ${rows.filter((r) => r.unclaimed.length > 0).length}, ids ${rows.reduce((a, r) => a + r.unclaimed.length, 0)}`);
console.log("");
console.log("=== UNCLAIMED detail ===");
for (const r of rows.filter((x) => x.unclaimed.length > 0)) console.log(`${r.file}\n    unclaimed: ${r.unclaimed.join(", ")}`);
console.log("");
console.log("=== AMBIGUOUS declaring lines (documented limit) ===");
for (const r of rows.filter((x) => x.ambiguous.length > 0))
  for (const a of r.ambiguous) console.log(`${r.file}:${a.line}  ${a.ids.join(" ")}`);
