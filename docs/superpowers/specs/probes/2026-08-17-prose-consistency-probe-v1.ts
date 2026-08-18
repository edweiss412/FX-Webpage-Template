// Corpus probe for the prose-consistency arms (BL-SPECLINT-ENUMERATED-UNIVERSAL-PARITY,
// BL-SPECLINT-POSTREPAIR-FORWARD-REF-SWEEP). Draft-time calibration instrument, not the
// contract: it measures candidate-recognizer hit rates over the live tracked docs corpus
// so the spec's gates are corpus-calibrated (probe-before-argue, spec-self-review.md).
//
// Run: pnpm tsx docs/superpowers/specs/probes/2026-08-17-prose-consistency-probe-v1.ts [rootDir]
// Output: full listing, no truncation ("a sweep that truncates its output has not been run").
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDoc } from "../../../../lib/specLint/parse";

const root = process.argv[2] ?? process.cwd();

// R2-repair (spec review round 2 F4): the arc's OWN artifacts are excluded from the
// measured population. They are self-referential — the spec quotes the recognizer's
// accept-set, so each repair round's edits moved the measurement it was calibrated by
// (measured drift: 1,217 -> 1,218 docs, U-a 3,574 -> 3,581 across two reruns). The
// instrument measures the PRE-EXISTING corpus the arms will meet.
const OWN_ARTIFACTS = [
  "docs/superpowers/specs/2026-08-17-speclint-prose-consistency-arms.md",
  "docs/superpowers/plans/2026-08-17-speclint-prose-consistency-arms.md",
  "docs/superpowers/specs/probes/2026-08-17-prose-consistency-probe-v1.ts",
  "docs/superpowers/specs/probes/2026-08-17-prose-consistency-probe-v1.report.txt",
];
const tracked = execFileSync("git", ["ls-files", "-z", "--", "docs/"], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
})
  .split("\0")
  .filter((p) => p.endsWith(".md"))
  .filter((p) => !OWN_ARTIFACTS.includes(p));

// Same word list the prose-count arms parse (numerics.ts NUMBER_WORDS keys, restated
// here as instrument config only; the contract will reference the module's list).
const WORDS =
  "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty";

// ---- Arm U: universal over an enumerated population ----
// U-a: universal quantifier immediately quantifying an explicit cardinal population.
const U_A = new RegExp(String.raw`\b([Ee]very|[Ee]ach|[Aa]ll)\s+(?:one\s+of\s+the\s+|of\s+the\s+)?(\d{1,4}|${WORDS})\b`);
// U-b: universal quantifier + class-noun phrase, with an inline code span on the line.
const U_B = /\b([Ee]very|[Ee]ach)\s+[a-z][a-z-]*(?:\s+[a-z][a-z-]*)?\b/;
const ISO_DATE_LINE = /\d{4}-\d{2}-\d{2}/;

// A "probe command" for gate purposes: an inline code span or fenced block whose first
// token is a command word.
const CMD_WORDS = /^(rg|grep|pnpm|git|gh|node|npx|tsx|find|ls|comm|wc|cat|sed|awk|jq|psql|curl)\b/;

interface Hit {
  doc: string;
  line: number;
  kind: string;
  snippet: string;
}
const uaHits: Hit[] = [];
const uaHitsGated: Hit[] = [];
const ubHits: Hit[] = [];
const ubHitsGated: Hit[] = [];

// ---- Arm F: out-of-scope / closeout regions ----
const OOS_HEADING = /out of scope|non-goals?/i;
const OOS_BULLET = /^\s*[-*]\s+\*?\*?out of scope\b/i;
const SECTION_REF = /§\s?\d+(\.\d+)*/;
let oosRegionDocs = 0;
let oosBulletCount = 0;
let oosBulletsWithSectionRef = 0;
let oosBulletsWithCode = 0;
const oosSectionRefHits: Hit[] = [];

for (const rel of tracked) {
  let text: string;
  try {
    text = readFileSync(join(root, rel), "utf8");
  } catch {
    continue;
  }
  const model = parseDoc(text);
  const spansByLine = new Map<number, string[]>();
  for (const s of model.spans) {
    const list = spansByLine.get(s.line) ?? [];
    list.push(s.content);
    spansByLine.set(s.line, list);
  }
  // Section membership: heading line -> next heading of depth <= its depth.
  const sectionOf = (line: number) => {
    let h = null as null | { line: number; depth: number };
    for (const hd of model.headings) if (hd.line <= line) h = hd;
    return h;
  };
  const sectionEnd = (h: { line: number; depth: number }) => {
    for (const hd of model.headings) if (hd.line > h.line && hd.depth <= h.depth) return hd.line - 1;
    return model.lines.length;
  };
  const sectionHasCommand = (line: number): boolean => {
    const h = sectionOf(line);
    const start = h ? h.line : 1;
    const end = h ? sectionEnd(h) : model.lines.length;
    for (let l = start; l <= end; l++) {
      const fenceInfo = model.fencedInfo[l - 1];
      if (typeof fenceInfo === "string" && (fenceInfo === "sh" || fenceInfo === "bash" || fenceInfo === "")) {
        if (CMD_WORDS.test(model.lines[l - 1]!.trim())) return true;
      }
      for (const c of spansByLine.get(l) ?? []) if (CMD_WORDS.test(c.trim())) return true;
    }
    return false;
  };

  let inOosRegion = false;
  let oosDepth = 0;
  let sawOosInDoc = false;

  for (let i = 0; i < model.lines.length; i++) {
    const lineNo = i + 1;
    if (model.fencedInfo[i] !== undefined) continue; // fenced or delimiter
    const line = model.lines[i]!;

    // region tracking for out-of-scope headings
    const hd = model.headings.find((h) => h.line === lineNo);
    if (hd) {
      if (inOosRegion && hd.depth <= oosDepth) inOosRegion = false;
      if (OOS_HEADING.test(hd.text)) {
        inOosRegion = true;
        oosDepth = hd.depth;
        sawOosInDoc = true;
      }
      continue;
    }
    if (inOosRegion && /^\s*[-*]\s+\S/.test(line)) {
      oosBulletCount++;
      if (SECTION_REF.test(line)) {
        oosBulletsWithSectionRef++;
        oosSectionRefHits.push({ doc: rel, line: lineNo, kind: "oos-ref", snippet: line.trim().slice(0, 160) });
      }
      if ((spansByLine.get(lineNo) ?? []).length > 0) oosBulletsWithCode++;
    }
    if (OOS_BULLET.test(line)) {
      oosBulletCount++;
      sawOosInDoc = true;
      if (SECTION_REF.test(line)) {
        oosBulletsWithSectionRef++;
        oosSectionRefHits.push({ doc: rel, line: lineNo, kind: "oos-bullet-ref", snippet: line.trim().slice(0, 160) });
      }
    }

    // universal recognizers
    const dated = ISO_DATE_LINE.test(line);
    const mA = U_A.exec(line);
    if (mA) {
      const h: Hit = { doc: rel, line: lineNo, kind: "U-a", snippet: line.trim().slice(0, 160) };
      uaHits.push(h);
      if (!dated && !sectionHasCommand(lineNo)) uaHitsGated.push(h);
    } else {
      const mB = U_B.exec(line);
      if (mB && (spansByLine.get(lineNo) ?? []).length > 0) {
        const h: Hit = { doc: rel, line: lineNo, kind: "U-b", snippet: line.trim().slice(0, 160) };
        ubHits.push(h);
        if (!dated && !sectionHasCommand(lineNo)) ubHitsGated.push(h);
      }
    }
  }
  if (sawOosInDoc) oosRegionDocs++;
}

// ---- Pass 2: spec-kind subject population, tighter gates, inventory sizing ----
const specDocs = tracked.filter((p) => p.includes("/specs/"));
interface Hit2 {
  doc: string;
  line: number;
  snippet: string;
}
const uaNarrow: Hit2[] = [];
const uaNarrowNoDup: Hit2[] = [];
const invSizes: { doc: string; universals: number; oosLines: number }[] = [];
const UNIVERSAL_LINE = new RegExp(
  String.raw`(?:^|[.;:] )\s*(?:[-*] )?\*{0,2}(Every|Each|All|Any|No|Never|Nothing)\b`,
);

for (const rel of specDocs) {
  let text: string;
  try {
    text = readFileSync(join(root, rel), "utf8");
  } catch {
    continue;
  }
  const model = parseDoc(text);
  const spansByLine = new Map<number, string[]>();
  for (const s of model.spans) {
    const list = spansByLine.get(s.line) ?? [];
    list.push(s.content);
    spansByLine.set(s.line, list);
  }
  const sectionOf = (line: number) => {
    let h = null as null | { line: number; depth: number };
    for (const hd of model.headings) if (hd.line <= line) h = hd;
    return h;
  };
  const sectionEnd = (h: { line: number; depth: number }) => {
    for (const hd of model.headings) if (hd.line > h.line && hd.depth <= h.depth) return hd.line - 1;
    return model.lines.length;
  };
  const sectionHasCommand = (line: number): boolean => {
    const h = sectionOf(line);
    const start = h ? h.line : 1;
    const end = h ? sectionEnd(h) : model.lines.length;
    for (let l = start; l <= end; l++) {
      const fenceInfo = model.fencedInfo[l - 1];
      if (typeof fenceInfo === "string" && (fenceInfo === "sh" || fenceInfo === "bash" || fenceInfo === "")) {
        if (CMD_WORDS.test(model.lines[l - 1]!.trim())) return true;
      }
      for (const c of spansByLine.get(l) ?? []) if (CMD_WORDS.test(c.trim())) return true;
    }
    return false;
  };
  // cardinal -> set of owning section heading-lines (non-fenced, non-table occurrences)
  const cardinalSections = new Map<string, Set<number>>();
  for (let i = 0; i < model.lines.length; i++) {
    if (model.fencedInfo[i] !== undefined) continue;
    const line = model.lines[i]!;
    if (/^\s*\|/.test(line)) continue;
    const re = /\b\d{1,4}\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      const key = m[0];
      const h = sectionOf(i + 1);
      const set = cardinalSections.get(key) ?? new Set<number>();
      set.add(h ? h.line : 0);
      cardinalSections.set(key, set);
    }
  }
  let universalsInDoc = 0;
  let oosLinesInDoc = 0;
  let inOos = false;
  let oosDepth2 = 0;
  for (let i = 0; i < model.lines.length; i++) {
    const lineNo = i + 1;
    if (model.fencedInfo[i] !== undefined) continue;
    const line = model.lines[i]!;
    const hd = model.headings.find((h) => h.line === lineNo);
    if (hd) {
      if (inOos && hd.depth <= oosDepth2) inOos = false;
      // R1-repair (spec review round 1 F2, probe-backed): depth >= 2 only. A
      // depth-1 TITLE naming "close-out" owns the whole document (measured max
      // 513 lines), which is a doc identity, not a fence region.
      // R3-repair (spec review round 3 F2): open only when NOT already inside a
      // region — a MATCHING heading nested in an open region must not re-anchor
      // the region's depth, or the next sibling nested heading closes the parent
      // early (probed: 142 lines silently omitted on a one-rename edit).
      if (!inOos && hd.depth >= 2 && (OOS_HEADING.test(hd.text) || /clos(e-?out|eout)|graduation/i.test(hd.text))) {
        inOos = true;
        oosDepth2 = hd.depth;
      }
      continue;
    }
    if (inOos && line.trim() !== "") oosLinesInDoc++;
    if (/^\s*\|/.test(line)) continue;
    if (UNIVERSAL_LINE.test(line)) universalsInDoc++;
    // U-a-narrow: universal + cardinal, non-table, non-dated line.
    // R1-repair gates (spec review round 1, both probe-backed): value bound 2-999
    // (kills zero-status and 4-digit-year reads), a time-unit exclusion (a cardinal
    // quantifying a TIME UNIT is a frequency, not a population), and an inline-span
    // exclusion (a match inside an inline code span is literal/example text).
    const mA = new RegExp(
      String.raw`\b([Ee]very|[Ee]ach|[Aa]ll)\s+(?:one\s+of\s+the\s+|of\s+the\s+)?(\d{1,3})\b`,
    ).exec(line);
    // R2-repair (spec review round 2 F1): the unit may attach with a hyphen
    // ("every 5-min check", "every 5-minute run") — same closed unit set, the
    // separator is whitespace OR a hyphen.
    const TIME_UNIT_AFTER = /^[-\s]\s*(ms|s|min|mins|minute|minutes|hour|hours|second|seconds|day|days|week|weeks|month|months)\b/;
    if (mA && !ISO_DATE_LINE.test(line)) {
      const value = Number(mA[2]!);
      const afterCardinal = line.slice(mA.index + mA[0].length);
      const matchStart = mA.index;
      const matchEnd = mA.index + mA[0].length;
      const inInlineSpan = (spansByLine.get(lineNo) ?? []).some((c) => {
        const at = line.indexOf("`" + c + "`");
        return at !== -1 && matchStart > at && matchEnd < at + c.length + 2;
      });
      if (value >= 2 && !TIME_UNIT_AFTER.test(afterCardinal) && !inInlineSpan) {
        const h: Hit2 = { doc: rel, line: lineNo, snippet: line.trim().slice(0, 140) };
        uaNarrow.push(h);
        // gate: the cardinal also appears in a DIFFERENT section (enumerated elsewhere)
        const owners = cardinalSections.get(mA[2]!) ?? new Set<number>();
        const mySection = sectionOf(lineNo)?.line ?? 0;
        const dupElsewhere = [...owners].some((s) => s !== mySection);
        if (dupElsewhere && !sectionHasCommand(lineNo)) uaNarrowNoDup.push(h);
      }
    }
  }
  invSizes.push({ doc: rel, universals: universalsInDoc, oosLines: oosLinesInDoc });
}

console.log(`docs scanned (all docs/): ${tracked.length}`);
console.log(`\n=== Pass 1: all docs ===`);
console.log(`U-a raw: ${uaHits.length}  gated: ${uaHitsGated.length}`);
console.log(`U-b raw: ${ubHits.length}  gated: ${ubHitsGated.length}`);
console.log(`out-of-scope: docs ${oosRegionDocs}, bullets ${oosBulletCount}, w/§ref ${oosBulletsWithSectionRef}, w/code ${oosBulletsWithCode}`);
console.log(`\n=== Pass 2: spec-kind docs only (${specDocs.length} docs) ===`);
console.log(`U-a-narrow (universal+cardinal, non-table, non-dated): ${uaNarrow.length}`);
console.log(`U-a-narrow + cardinal-enumerated-in-other-section + no-probe-cmd-in-section: ${uaNarrowNoDup.length}`);
console.log(`\n--- U-a-narrow fully-gated listing (full) ---`);
for (const h of uaNarrowNoDup) console.log(`${h.doc}:${h.line} ${h.snippet}`);
const sorted = [...invSizes].sort((a, b) => b.universals - a.universals);
const med = (ns: number[]) => ns.sort((a, b) => a - b)[Math.floor(ns.length / 2)] ?? 0;
console.log(`\n--- inventory sizing over spec docs ---`);
console.log(`universal-lines per doc: median ${med(invSizes.map((s) => s.universals))}, max ${sorted[0]?.universals} (${sorted[0]?.doc})`);
console.log(`top 10 by universal-line count:`);
for (const s of sorted.slice(0, 10)) console.log(`  ${s.universals}  ${s.doc}`);
const sortedOos = [...invSizes].sort((a, b) => b.oosLines - a.oosLines);
console.log(`scope-fences (oos+closeout, depth>=2) lines per doc: median ${med(invSizes.map((s) => s.oosLines))}, max ${sortedOos[0]?.oosLines} (${sortedOos[0]?.doc})`);
