#!/usr/bin/env node
/**
 * Corpus-calibration probe for the four parser-mutation-wave heuristics.
 *
 *   node docs/superpowers/specs/parser/probes/2026-08-07-mutation-wave-corpus-probe.mjs
 *
 * Read-only. Plain node, no deps beyond `node:fs` / `node:path`. Prints markdown tables to
 * stdout; results doc is the sibling `.md`.
 *
 * WHY THIS EXISTS: each of the four heuristics below is a proposed DISCRIMINATOR — a rule that
 * fires when it sees a shape a mutation would produce. Its false-positive base rate is the number
 * of times that shape already occurs on the CLEAN corpus, where by construction no mutation has
 * been applied. Every such hit is a shape the discriminator cannot use on its own.
 *
 * SEGMENTATION PARITY: `splitCells` / `classifyRow` / `segment` / `resolveHeader` below are
 * hand-ports of `tests/parser/mutation/rows.ts` + `tests/parser/mutation/classify.ts`, which are
 * what `mergedCell` / `columnShift` / `refSub` / `unicodeInject` in
 * `tests/parser/mutation/operators.ts` enumerate over. The two REGISTRY constants
 * (KNOWN_SECTION_HEADERS, PREFIX_SECTION_FAMILIES) and the FIXTURE list are EXTRACTED FROM THE
 * LIVE SOURCE at run time rather than copied, so the probe cannot silently drift from the corpus
 * or the header registry it is calibrating against. Extraction failure is fatal, never a
 * fall-back to a stale inline copy.
 *
 * LINE NUMBERS: reported 1-based (what an editor shows). `operators.ts` siteIds use the 0-based
 * array index — subtract 1 to cross-reference a siteId's `:L<n>:`.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// docs/superpowers/specs/parser/probes -> repo root is five levels up.
const ROOT = path.resolve(HERE, "../../../../..");
const rd = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

// ---------------------------------------------------------------------------
// Live-source extraction (fail loud; never fall back to an inline copy)
// ---------------------------------------------------------------------------

function extractStringArray(src, decl, where) {
  // Matches `const NAME = [ "a", "b" ];` and `export const NAME: T = new Set([ "a" ]);`
  const re = new RegExp(`${decl}[^=]*=\\s*(?:new Set\\()?\\[([\\s\\S]*?)\\]`, "m");
  const m = src.match(re);
  if (!m) throw new Error(`probe: could not extract ${decl} from ${where} — port is stale`);
  const items = [...m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((x) => x[1]);
  if (items.length === 0) throw new Error(`probe: ${decl} in ${where} extracted empty`);
  return items;
}

const FIXTURES_SRC = rd("tests/parser/mutation/fixtures.ts");
const XLSX = extractStringArray(FIXTURES_SRC, "const XLSX", "tests/parser/mutation/fixtures.ts");
const RAW = extractStringArray(FIXTURES_SRC, "const RAW", "tests/parser/mutation/fixtures.ts");
const FIXTURES = [
  ...XLSX.map((slug) => ({ slug, family: "xlsx", path: `fixtures/shows/exporter-xlsx/${slug}.md` })),
  ...RAW.map((slug) => ({ slug, family: "raw", path: `fixtures/shows/raw/${slug}.md` })),
];

const KS_SRC = rd("lib/parser/knownSections.ts");
const KNOWN_SECTION_HEADERS = new Set(
  extractStringArray(KS_SRC, "export const KNOWN_SECTION_HEADERS", "lib/parser/knownSections.ts"),
);
const PREFIX_SECTION_FAMILIES = new Set(
  extractStringArray(KS_SRC, "export const PREFIX_SECTION_FAMILIES", "lib/parser/knownSections.ts"),
);

// ---------------------------------------------------------------------------
// Ported segmentation (mirrors tests/parser/mutation/rows.ts + classify.ts)
// ---------------------------------------------------------------------------

/** rows.ts:splitCells — parser parity with `splitRow`: split("|").slice(1,-1), trimmed. */
function splitCells(line) {
  const t = line.trim();
  if (!t.startsWith("|")) return [];
  return t
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
}

const ALIGN = /^:?-{1,}:?$/;

const normalizeHeader = (raw) => raw.replace(/\s+/g, " ").trim().toUpperCase();

/** classify.ts:tokenPrefix */
const tokenPrefix = (n, entry) =>
  n.startsWith(entry) && (n.length === entry.length || /[^A-Z0-9]/.test(n[entry.length] ?? " "));

/** classify.ts:resolveHeader */
function resolveHeader(col0) {
  const n = normalizeHeader(col0);
  if (KNOWN_SECTION_HEADERS.has(n)) return n;
  if (/^TRANSPORTATION\//.test(n)) return "TRANSPORTATION";
  for (const fam of PREFIX_SECTION_FAMILIES) if (tokenPrefix(n, fam)) return fam;
  return null;
}

const isHeaderCells = (cells) => resolveHeader(cells[0] ?? "") !== null;

/** rows.ts:classifyRow */
function classifyRow(cells) {
  const nonEmpty = cells.filter((c) => c.length > 0);
  if (nonEmpty.length === 0) return "spacer";
  if (nonEmpty.every((c) => ALIGN.test(c))) return "alignment";
  if (isHeaderCells(cells)) return "header";
  return "data";
}

/** rows.ts:segment — blank/non-table lines end a RUN; each header row opens a SECTION. */
function segment(md) {
  const lines = md.split("\n");
  const runs = [];
  const sections = [];
  let curRun = null;
  let curSec = null;
  const closeRun = () => {
    if (curSec && curRun && !curRun.sections.includes(curSec)) curRun.sections.push(curSec);
    curSec = null;
    curRun = null;
  };
  lines.forEach((line, i) => {
    if (line.trim() === "" || !line.trim().startsWith("|")) return closeRun();
    if (!curRun) {
      curRun = { index: runs.length, sections: [], startLine: i };
      runs.push(curRun);
      curSec = null;
    }
    const cells = splitCells(line);
    const cls = classifyRow(cells);
    const row = { line: i, cells, cls };
    if (cls === "header") {
      if (curSec) curRun.sections.push(curSec);
      curSec = { index: sections.length, headerRow: row, rows: [row], runIndex: curRun.index };
      sections.push(curSec);
    } else {
      if (!curSec) {
        curSec = { index: sections.length, headerRow: null, rows: [], runIndex: curRun.index };
        sections.push(curSec);
      }
      curSec.rows.push(row);
    }
  });
  closeRun();
  return { runs, sections };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const dataRows = (s) => s.rows.filter((r) => r.cls === "data");
const nonAlignRows = (s) => s.rows.filter((r) => r.cls === "header" || r.cls === "data");
const secLabel = (s) =>
  s.headerRow ? (s.headerRow.cells[0] ?? "").replace(/\s+/g, " ").trim() : "(headerless)";

/** Nearest preceding line that is NOT a table row and not blank (the literal probe-A ask). */
function nearestNonTableLine(lines, i) {
  for (let k = i - 1; k >= 0; k--) {
    const t = lines[k].trim();
    if (t === "" || t.startsWith("|")) continue;
    return { line: k + 1, text: t.slice(0, 60) };
  }
  return null;
}

/** Modal (most frequent) value; ties broken toward the LARGER value, deterministically. */
function modal(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = null;
  let bestN = -1;
  for (const [v, n] of [...counts.entries()].sort((a, b) => b[0] - a[0])) {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return { value: best, freq: bestN, distinct: counts.size };
}

const trunc = (s, n) => (s.length <= n ? s : s.slice(0, n - 1) + "…");
const mdCell = (s) => String(s).replace(/\|/g, "\\|");

function table(headers, rows) {
  const out = [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`];
  for (const r of rows) out.push(`| ${r.map(mdCell).join(" | ")} |`);
  return out.join("\n");
}

const CORPUS = FIXTURES.map((f) => {
  const md = rd(f.path);
  const lines = md.split("\n");
  return { ...f, md, lines, seg: segment(md) };
});

const say = (...a) => console.log(...a);
const H = (s) => say(`\n## ${s}\n`);

say(`# mutation-wave corpus probe — ${new Date().toISOString().slice(0, 10)}`);
say(`\nCorpus: ${CORPUS.length} fixtures (${XLSX.length} xlsx, ${RAW.length} raw) from`);
say(`tests/parser/mutation/fixtures.ts. Line numbers 1-based.`);

// ---------------------------------------------------------------------------
// PROBE A — REF-SUB
// ---------------------------------------------------------------------------
H("A. REF-SUB — `#REF!` occurrences on the clean corpus");

// The exporter emits Excel error literals MARKDOWN-ESCAPED (`\#REF\!`); the bare literal is what
// `operators.ts:refSub` WRITES. Both forms are counted separately because the difference is the
// whole calibration story: the parser's `clean()` (lib/parser/blocks/_helpers.ts) strips `\\(.)`,
// so the two forms are IDENTICAL in parser space but NOT byte-identical in fixture space.
const REF_FORMS = [
  { name: "escaped", re: /\\#REF\\!/g },
  { name: "bare", re: /(?<!\\)#REF(?!\\)!/g },
];

const aHits = [];
for (const f of CORPUS) {
  // section lookup by line
  const secOf = new Map();
  for (const s of f.seg.sections) for (const r of s.rows) secOf.set(r.line, s);
  f.lines.forEach((line, i) => {
    for (const { name, re } of REF_FORMS) {
      re.lastIndex = 0;
      if (!re.test(line)) continue;
      const cells = splitCells(line);
      cells.forEach((cell, cellIdx) => {
        const rex = name === "escaped" ? /\\#REF\\!/ : /(?<!\\)#REF(?!\\)!/;
        if (!rex.test(cell)) return;
        const sec = secOf.get(i);
        aHits.push({
          fixture: f.slug,
          family: f.family,
          line: i + 1,
          form: name,
          cellIdx,
          cell: cell,
          exactCell: cell === (name === "escaped" ? "\\#REF\\!" : "#REF!"),
          rowClass: sec ? (sec.rows.find((r) => r.line === i)?.cls ?? "?") : "(unsegmented)",
          section: sec ? secLabel(sec) : "(none)",
          nonTable: nearestNonTableLine(f.lines, i),
        });
      });
    }
  });
}

const aByFixture = new Map();
for (const h of aHits) {
  const k = `${h.family}/${h.fixture}`;
  if (!aByFixture.has(k)) aByFixture.set(k, { escaped: 0, bare: 0, lines: new Set() });
  const e = aByFixture.get(k);
  e[h.form]++;
  e.lines.add(h.line);
}

say(`Total \`#REF!\` cell occurrences: **${aHits.length}**`);
say(`  escaped \`\\#REF\\!\`: ${aHits.filter((h) => h.form === "escaped").length}`);
say(`  bare \`#REF!\`: ${aHits.filter((h) => h.form === "bare").length}`);
say(
  `Fixtures hit: **${aByFixture.size} of ${CORPUS.length}** ` +
    `(xlsx ${[...aByFixture.keys()].filter((k) => k.startsWith("xlsx/")).length}/${XLSX.length}, ` +
    `raw ${[...aByFixture.keys()].filter((k) => k.startsWith("raw/")).length}/${RAW.length})\n`,
);
say(
  table(
    ["fixture", "family", "escaped", "bare", "lines"],
    [...aByFixture.entries()].map(([k, v]) => {
      const [family, slug] = k.split("/");
      return [slug, family, v.escaped, v.bare, [...v.lines].sort((a, b) => a - b).join(", ")];
    }),
  ),
);

say(`\n### Every occurrence\n`);
say(
  table(
    ["fixture", "line", "form", "cell#", "row class", "section header", "cell (trunc)", "whole cell?", "nearest non-table line"],
    aHits.map((h) => [
      h.fixture,
      h.line,
      h.form,
      h.cellIdx,
      h.rowClass,
      trunc(h.section, 28),
      trunc(h.cell, 24),
      h.exactCell ? "yes" : "no",
      h.nonTable ? `L${h.nonTable.line}: ${trunc(h.nonTable.text, 24)}` : "(none)",
    ]),
  ),
);

// The refSub skip-guard: operators.ts:74 `if (c.val.trim() === "#REF!") continue;`
const guardWouldFire = aHits.filter((h) => h.cell.trim() === "#REF!").length;
const guardMisses = aHits.filter(
  (h) => h.rowClass === "data" && h.cell.trim() !== "#REF!" && h.exactCell,
).length;
say(
  `\n**refSub skip-guard reality check** (operators.ts:74, \`c.val.trim() === "#REF!"\`): ` +
    `fires on **${guardWouldFire}** of ${aHits.length} occurrences; ` +
    `**${guardMisses}** whole-cell data-row occurrences carry the ESCAPED form and slip past it.`,
);

// ---------------------------------------------------------------------------
// PROBE B — MERGED-CELL short-by-one false-positive base rate
// ---------------------------------------------------------------------------
H("B. MERGED-CELL — short-by-one base rate on the clean corpus");
say(
  "Discriminator under test: *within a section, a row whose cell count is (modal - 1) is a fused" +
    " cell*. `mergedCell` deletes one interior pipe in a DATA row, so the mutant's row is exactly" +
    " one cell short. Every clean-corpus hit below is a row the rule flags with no mutation" +
    " present — a false positive.\n",
);
say(
  "Two variants: **all-rows** takes the modal over every row the section owns (header +" +
    " alignment + data), **data-only** over data rows alone. `mergedCell` only ever mutates data" +
    " rows, so data-only is the tighter reading; all-rows is what a naive implementation gets.\n",
);

/** operators.ts:mergeRawCells — fuse parser cells p and p+1 by deleting the pipe between them. */
function mergeRawCells(line, p) {
  const parts = line.split("|");
  parts.splice(p + 1, 2, `${parts[p + 1] ?? ""}${parts[p + 2] ?? ""}`);
  return parts.join("|");
}

const bRows = [];
const bExamples = [];
let bAll = 0;
let bData = 0;
let bSections = 0;
// PREMISE + POSITIVE CONTROL. A false-positive count of zero is only evidence if the rule COULD
// have fired. Two things are therefore measured alongside it: how RAGGED the corpus is (a corpus
// of perfectly uniform sections makes "modal - 1" unreachable for reasons that have nothing to do
// with the rule's quality), and whether the rule actually fires on a REAL mergedCell mutant built
// by the shipped `mergeRawCells`. Without these, "0 false positives" and "the probe is broken"
// produce identical output.
let bRagged = 0;
let bTPfired = 0;
let bTPtotal = 0;
let bOffModal = 0; // eligible data rows whose own cell count differs from the section modal
const bDelta = new Map();
for (const f of CORPUS) {
  let fAll = 0;
  let fData = 0;
  let fSecs = 0;
  for (const s of f.seg.sections) {
    if (s.rows.length < 3) continue;
    fSecs++;
    const mAll = modal(s.rows.map((r) => r.cells.length));
    if (mAll.distinct > 1) bRagged++;
    for (const r of s.rows) {
      const d = r.cells.length - mAll.value;
      bDelta.set(d, (bDelta.get(d) ?? 0) + 1);
    }
    const hitsAll = s.rows.filter((r) => r.cells.length === mAll.value - 1);
    const dr = dataRows(s);
    const mData = dr.length >= 3 ? modal(dr.map((r) => r.cells.length)) : null;
    const hitsData = mData ? dr.filter((r) => r.cells.length === mData.value - 1) : [];
    fAll += hitsAll.length;
    fData += hitsData.length;
    for (const r of hitsData) {
      bExamples.push({
        fixture: f.slug,
        line: r.line + 1,
        section: secLabel(s),
        got: r.cells.length,
        modal: mData.value,
        text: f.lines[r.line],
      });
    }
    // positive control: apply the real mutation (interior pipe p=0) to each eligible data row
    for (const r of dr) {
      if (r.cells.length < 3) continue; // operators.ts:103 eligibility
      bTPtotal++;
      if (r.cells.length !== mAll.value) bOffModal++;
      const mutated = splitCells(mergeRawCells(f.lines[r.line], 0));
      if (mutated.length === mAll.value - 1) bTPfired++;
    }
  }
  bAll += fAll;
  bData += fData;
  bSections += fSecs;
  bRows.push([f.slug, f.family, fSecs, fAll, fData]);
}
say(table(["fixture", "family", "sections ≥3 rows", "FP (all-rows)", "FP (data-only)"], bRows));
say(
  `\n**Grand total:** ${bSections} sections with ≥3 rows · ` +
    `all-rows false positives **${bAll}** · data-only false positives **${bData}**`,
);
say(`\n### Examples (data-only variant, first 5)\n`);
say(
  bExamples.length === 0
    ? "_none_"
    : table(
        ["fixture", "line", "section", "cells", "modal", "line text (trunc)"],
        bExamples
          .slice(0, 5)
          .map((e) => [e.fixture, e.line, trunc(e.section, 24), e.got, e.modal, trunc(e.text.trim(), 70)]),
      ),
);

say(`\n### Premise check — is the corpus ragged enough for the rule to fire?\n`);
say(
  `Sections (≥3 rows) with **more than one distinct cell count**: **${bRagged} of ${bSections}** ` +
    `(${((bRagged / bSections) * 100).toFixed(1)}%)\n`,
);
say(
  table(
    ["cellCount − sectionModal", "rows"],
    [...bDelta.entries()].sort((a, b) => a[0] - b[0]).map(([d, n]) => [d >= 0 ? `+${d}` : d, n]),
  ),
);
say(
  `\n### Positive control — does the rule fire on a REAL \`mergedCell\` mutant?\n\n` +
    `Applied \`mergeRawCells(line, 0)\` (operators.ts:38) to every eligible data row ` +
    `(\`cells.length >= 3\`) and re-segmented: the short-by-one rule fires on ` +
    `**${bTPfired} of ${bTPtotal}** mutants (` +
    `${bTPtotal === 0 ? "n/a" : ((bTPfired / bTPtotal) * 100).toFixed(1) + "%"}).`,
);
// Reconciliation: a mutant can only escape the rule when its own row was already OFF the section
// modal, so the miss count and the off-modal count must be the SAME number. If they diverge, the
// probe is miscounting and neither figure above can be trusted.
const bMiss = bTPtotal - bTPfired;
say(
  `\nReconciliation — misses (${bMiss}) vs eligible rows already off the section modal ` +
    `(${bOffModal}): **${bMiss === bOffModal ? "MATCH" : "MISMATCH — probe is miscounting"}**`,
);

// ---------------------------------------------------------------------------
// PROBE C — COLUMN-SHIFT leading-empty base rate
// ---------------------------------------------------------------------------
H("C. COLUMN-SHIFT — leading-empty-cell base rate on the clean corpus");
say(
  "Discriminator under test: *every row in a section has an empty first cell* — the exact shape" +
    " `columnShift` manufactures by prefixing `|  |` to every row it owns (operators.ts:151)." +
    " Three variants, because which rows the rule looks at decides whether it can ever fire:\n" +
    "\n" +
    "- **all** — every row the section owns. Alignment rows (`| :---: |`) have a non-empty first\n" +
    "  cell, so any section carrying one can never satisfy this.\n" +
    "- **non-align** — header + data rows only.\n" +
    "- **data** — data rows only.\n",
);

const cRows = [];
const cExamples = { all: [], nonAlign: [], data: [] };
const tot = {
  all: { every: 0, some: 0 },
  nonAlign: { every: 0, some: 0 },
  data: { every: 0, some: 0 },
};
for (const f of CORPUS) {
  const per = {
    all: { every: 0, some: 0 },
    nonAlign: { every: 0, some: 0 },
    data: { every: 0, some: 0 },
  };
  for (const s of f.seg.sections) {
    const variants = { all: s.rows, nonAlign: nonAlignRows(s), data: dataRows(s) };
    for (const [k, rows] of Object.entries(variants)) {
      if (rows.length === 0) continue;
      const lead = rows.filter((r) => (r.cells[0] ?? "") === "");
      if (lead.length === rows.length) {
        per[k].every++;
        tot[k].every++;
        if (cExamples[k].length < 5)
          cExamples[k].push({
            fixture: f.slug,
            section: secLabel(s),
            firstLine: rows[0].line + 1,
            rows: rows.length,
          });
      } else if (lead.length > 0) {
        per[k].some++;
        tot[k].some++;
      }
    }
  }
  cRows.push([
    f.slug,
    f.family,
    f.seg.sections.length,
    `${per.all.every} / ${per.all.some}`,
    `${per.nonAlign.every} / ${per.nonAlign.some}`,
    `${per.data.every} / ${per.data.some}`,
  ]);
}
say(
  table(
    ["fixture", "family", "sections", "all (every/some)", "non-align (every/some)", "data (every/some)"],
    cRows,
  ),
);
say(
  `\n**Grand total** — all: ${tot.all.every} every / ${tot.all.some} some · ` +
    `non-align: ${tot.nonAlign.every} every / ${tot.nonAlign.some} some · ` +
    `data: ${tot.data.every} every / ${tot.data.some} some`,
);
for (const [k, ex] of Object.entries(cExamples)) {
  say(`\n### Examples — every-row-leads-empty, ${k} variant (first 5)\n`);
  say(
    ex.length === 0
      ? "_none_"
      : table(
          ["fixture", "section", "first line", "rows"],
          ex.map((e) => [e.fixture, trunc(e.section, 30), e.firstLine, e.rows]),
        ),
  );
}

// Row-count breakdown for the data variant: a section with ONE data row satisfies
// "every row leads empty" trivially, so the raw 'every' count conflates a real shape with an
// arity-1 artifact. This is the threshold question the spec has to answer.
say(`\n### Data-variant false positives by section data-row count\n`);
const cByArity = new Map();
for (const f of CORPUS) {
  for (const s of f.seg.sections) {
    const dr = dataRows(s);
    if (dr.length === 0) continue;
    if (!dr.every((r) => (r.cells[0] ?? "") === "")) continue;
    const k = dr.length >= 4 ? "4+" : String(dr.length);
    cByArity.set(k, (cByArity.get(k) ?? 0) + 1);
  }
}
say(
  table(
    ["data rows in section", "sections flagged"],
    ["1", "2", "3", "4+"].map((k) => [k, cByArity.get(k) ?? 0]),
  ),
);

// POSITIVE CONTROL: apply the real columnShift transform (operators.ts:151) and confirm the
// all-rows discriminator fires. A 0% false-positive rate is only meaningful next to a measured
// true-positive rate — otherwise a rule that never fires at all scores identically.
let cTPfired = 0;
let cTPtotal = 0;
for (const f of CORPUS) {
  for (const s of f.seg.sections) {
    if (dataRows(s).length < 1) continue; // operators.ts:147 eligibility
    cTPtotal++;
    const shifted = s.rows.map((r) => splitCells(f.lines[r.line].replace(/^\|/, "|  |")));
    if (shifted.every((cells) => (cells[0] ?? "") === "")) cTPfired++;
  }
}
say(
  `\n### Positive control — does the rule fire on a REAL \`columnShift\` mutant?\n\n` +
    `Applied \`line.replace(/^\\|/, "|  |")\` to every row of every eligible section ` +
    `(\`dataRows >= 1\`) and re-segmented: the all-rows rule fires on **${cTPfired} of ` +
    `${cTPtotal}** mutated sections (` +
    `${cTPtotal === 0 ? "n/a" : ((cTPfired / cTPtotal) * 100).toFixed(1) + "%"}), ` +
    `against **${tot.all.every}** false positives on the clean corpus.`,
);

// East Coast — called out explicitly.
say(`\n### East Coast fixtures (both families)\n`);
const eastRows = [];
for (const f of CORPUS.filter((x) => /east-coast/.test(x.slug))) {
  for (const s of f.seg.sections) {
    const rows = nonAlignRows(s);
    if (rows.length === 0) continue;
    const lead = rows.filter((r) => (r.cells[0] ?? "") === "").length;
    if (lead === 0) continue;
    eastRows.push([
      f.slug,
      trunc(secLabel(s), 26),
      s.rows[0].line + 1,
      rows.length,
      lead,
      lead === rows.length ? "EVERY" : "some",
    ]);
  }
}
say(
  eastRows.length === 0
    ? "_no leading-empty rows in either East Coast fixture_"
    : table(["fixture", "section", "line", "non-align rows", "lead-empty", "verdict"], eastRows),
);

// ---------------------------------------------------------------------------
// PROBE D — zero-width characters
// ---------------------------------------------------------------------------
H("D. UNICODE — zero-width characters on the clean corpus");
say(
  "Scanned: U+200B ZWSP, U+200C ZWNJ, U+200D ZWJ, U+FEFF ZWNBSP/BOM — the set" +
    " `unicodeInject` draws from (it injects U+200C) and the set the parser's `clean()`" +
    " strips (`/[\\u200B-\\u200D\\uFEFF]/`, lib/parser/blocks/_helpers.ts).\n",
);
// NOTE: `ZW_ONE` is deliberately NON-global and `ZW_ALL` is used ONLY as the scan cursor, never
// re-entered inside its own loop. A `/g` regex carries mutable `lastIndex`; calling `.test()` or
// `.replace()` with the SAME object inside its own `exec` loop rewinds that cursor and the loop
// never terminates (hit on the first run of this probe).
const ZW_ONE = /[​‌‍﻿]/;
const dHits = [];
for (const f of CORPUS) {
  const secOf = new Map();
  for (const s of f.seg.sections) for (const r of s.rows) secOf.set(r.line, s);
  f.lines.forEach((line, i) => {
    if (!ZW_ONE.test(line)) return;
    const cells = splitCells(line);
    const cellIdx = cells.findIndex((c) => ZW_ONE.test(c));
    const sec = secOf.get(i);
    const chars = [...line];
    chars.forEach((ch, col) => {
      if (!ZW_ONE.test(ch)) return;
      dHits.push({
        fixture: f.slug,
        family: f.family,
        line: i + 1,
        col,
        cp: "U+" + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0"),
        cellIdx: cellIdx < 0 ? "(non-table)" : cellIdx,
        section: sec ? trunc(secLabel(sec), 24) : "(none)",
        context: trunc(
          chars
            .slice(Math.max(0, col - 22), col + 22)
            .join("")
            .replace(/[​‌‍﻿]/g, "<ZW>"),
          48,
        ),
      });
    });
  });
}
say(`Total zero-width occurrences: **${dHits.length}** across **${new Set(dHits.map((h) => h.fixture)).size}** fixtures\n`);
say(
  dHits.length === 0
    ? "_none_"
    : table(
        ["fixture", "line", "col", "codepoint", "cell#", "section", "context"],
        dHits.map((h) => [
          h.fixture,
          h.line,
          h.col,
          h.cp,
          h.cellIdx,
          h.section,
          h.context,
        ]),
      ),
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
H("Summary");
say(
  table(
    ["probe", "headline"],
    [
      [
        "A ref-sub",
        `${aHits.length} occurrences in ${aByFixture.size}/${CORPUS.length} fixtures; ${guardWouldFire} caught by the skip-guard`,
      ],
      [
        "B merged-cell",
        `${bAll} false positives (all-rows) / ${bData} (data-only); fires on ${bTPfired}/${bTPtotal} real mutants; ${bRagged}/${bSections} sections ragged`,
      ],
      [
        "C column-shift",
        `every-row-leads-empty: ${tot.all.every} (all) / ${tot.nonAlign.every} (non-align) / ${tot.data.every} (data); some-but-not-all: ${tot.all.some} / ${tot.nonAlign.some} / ${tot.data.some}; fires on ${cTPfired}/${cTPtotal} real mutants`,
      ],
      ["D unicode", `${dHits.length} zero-width chars in ${new Set(dHits.map((h) => h.fixture)).size} fixture(s)`],
    ],
  ),
);
