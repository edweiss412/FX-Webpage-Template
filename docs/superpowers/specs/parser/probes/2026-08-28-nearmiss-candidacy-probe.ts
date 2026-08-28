/**
 * 2026-08-28 near-miss candidacy probe — the executable behind every number in
 * `docs/superpowers/specs/parser/2026-08-28-nearmiss-candidacy-field-lists-design.md`.
 *
 * Run:
 *   pnpm exec tsx docs/superpowers/specs/parser/probes/2026-08-28-nearmiss-candidacy-probe.ts
 *
 * It prints seven tables, each labelled with the spec section that quotes it:
 *   TABLE-A  §2.1  the committed 65-row baseline grouped by anchor namespace
 *   TABLE-B  §2.2  value-cell count of every firing ROW (refutes the per-row matrix rule)
 *   TABLE-C  §2.3  block shape and resolving-row count per firing namespace
 *   TABLE-D  §3.2  candidate rules scored as (false positives removed, true positives lost)
 *   TABLE-E  §3.3  every baseline row under the shipped rule, with the arm that excluded it
 *   TABLE-F  §3.1  matrix-arm threshold sensitivity across 2..8
 *   TABLE-G  §6    block minValueCells distribution across the corpus
 *
 * The baseline JSON is the arbiter, exactly as `tests/parser/fieldNearMissBaseline.test.ts`
 * treats it: this probe never re-derives the expected emission set, it reads the committed
 * one and asks which rows a candidate rule would keep.
 */
import { readFileSync } from "node:fs";

import { clean } from "@/lib/parser/blocks/_helpers";
import { resolveAlias } from "@/lib/parser/aliases";
import { anchorNamespace, normalizeV3, scanRowsWithOpener } from "@/lib/parser/fieldNearMiss";
import { isKnownSectionHeader } from "@/lib/parser/knownSections";
import { canonicalSectionKind } from "@/lib/parser/sectionKind";
import { FIXTURES, readFixture } from "@/tests/parser/mutation/fixtures";

type BaselineRow = { fixture: string; key: string; block: string; kind: string; candidate: string };

/**
 * THE FROZEN PRE-CHANGE BASELINE, not the live one.
 *
 * Spec round 1 finding 1: reading `tests/parser/__fixtures__/fieldNearMiss.baseline.json`
 * made this probe self-invalidating. That file is what AC-2 REGENERATES from 65 rows to 33,
 * and every table below selects its rows through the baseline's key set — so the moment the
 * spec was implemented, TABLE-D would print `FP removed: 0`, TABLE-E would print zero
 * exclusions, and the evidence for the whole design would evaporate. The probe could
 * reproduce the spec only until the spec shipped.
 *
 * The removed-set and the two refutations are claims about the corpus AS IT WAS at the merge
 * base, so their input is frozen here at 65 rows, copied from the live baseline at
 * `origin/main` 31beee5de. `LIVE_BASELINE_PATH` is read separately and only for the
 * after-the-change comparison, which is the one table that SHOULD move.
 */
const FROZEN_BASELINE_PATH =
  "docs/superpowers/specs/parser/probes/2026-08-28-nearmiss-baseline-at-merge-base.json";
const LIVE_BASELINE_PATH = "tests/parser/__fixtures__/fieldNearMiss.baseline.json";
const baseline: BaselineRow[] = JSON.parse(readFileSync(FROZEN_BASELINE_PATH, "utf8")).rows;
const liveBaseline: BaselineRow[] = JSON.parse(readFileSync(LIVE_BASELINE_PATH, "utf8")).rows;

/**
 * The three rows BL-NEARMISS-CANDIDACY-NON-FIELD-BLOCKS names as false positives, keyed
 * the way the baseline keys them (`block` + `key`). Every other baseline row is a true
 * positive by construction: the baseline is the ratified emission set.
 */
const FALSE_POSITIVES = new Set([
  "timestamp Room Diagram",
  "timestamp Backdrop",
  "console Speaker",
]);

const FIRING_NAMESPACES = ["timestamp", "console", "joann", "client", "client contact", "details"];

/** A label the real parse RESOLVES. Exactly the complement of the detector's isCandidateLabel. */
const resolves = (col0: string): boolean =>
  col0.trim() !== "" &&
  (resolveAlias(col0) !== null || isKnownSectionHeader(col0) || canonicalSectionKind(col0) !== null);

type Block = { ns: string; opener: string; rows: string[][]; fixture: string };

/**
 * Every physical pipe-run block in the corpus, grouped by the SAME rule
 * `scanRowsWithOpener` uses, so a block here and a block the detector sees are the same
 * object. The regrouping is needed only because the shipped scanner flattens its output.
 */
function corpusBlocks(): Block[] {
  const blocks: Block[] = [];
  for (const f of FIXTURES) {
    let run: string[] = [];
    const flush = () => {
      if (run.length === 0) return;
      const rows = scanRowsWithOpener(run.join("\n"));
      run = [];
      const first = rows[0];
      if (first === undefined) return;
      blocks.push({
        ns: anchorNamespace(first.opener),
        opener: first.opener,
        rows: rows.map((r) => r.cells.map((c) => clean(c))),
        fixture: f.path,
      });
    };
    for (const line of readFixture(f).split("\n")) {
      if (!line.trim().startsWith("|")) flush();
      else run.push(line);
    }
    flush();
  }
  return blocks;
}

const valueCells = (cells: string[]): number => cells.slice(1).filter((c) => c !== "").length;
const minValueCells = (b: Block): number => Math.min(...b.rows.map(valueCells));
const resolvingRows = (b: Block, skipOpener: boolean): number =>
  b.rows.filter((r, i) => !(skipOpener && i === 0)).filter((r) => resolves(r[0] ?? "")).length;

const blocks = corpusBlocks();
const wanted = new Set(baseline.map((r) => r.block + " " + r.key));

// ---------------------------------------------------------------- TABLE-A
console.log("TABLE-A (spec 2.1) — committed baseline by anchor namespace");
console.log("  namespace | rows | distinct keys");
const byNs = new Map<string, BaselineRow[]>();
for (const r of baseline) {
  if (!byNs.has(r.block)) byNs.set(r.block, []);
  byNs.get(r.block)!.push(r);
}
for (const [ns, rows] of [...byNs.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const keys = [...new Set(rows.map((r) => r.key))].sort().join(", ");
  console.log("  " + ns + " | " + rows.length + " | " + keys);
}
console.log("  TOTAL | " + baseline.length);
console.log("");

// ---------------------------------------------------------------- TABLE-B
console.log("TABLE-B (spec 2.2) — value cells of every FIRING ROW");
console.log("  namespace | key | occurrences | value-cell histogram");
type Obs = { ns: string; key: string; vc: number };
const obs: Obs[] = [];
for (const b of blocks) {
  for (const cells of b.rows) {
    const col0 = cells[0] ?? "";
    if (col0 === "" || !wanted.has(b.ns + " " + col0)) continue;
    obs.push({ ns: b.ns, key: col0, vc: valueCells(cells) });
  }
}
const byKey = new Map<string, number[]>();
for (const o of obs) {
  const k = o.ns + " | " + o.key;
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k)!.push(o.vc);
}
for (const [k, counts] of [...byKey.entries()].sort()) {
  const hist = new Map<number, number>();
  for (const n of counts) hist.set(n, (hist.get(n) ?? 0) + 1);
  const h = [...hist.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([c, n]) => c + "vc x" + n)
    .join(", ");
  console.log("  " + k + " | " + counts.length + " | " + h);
}
const over2 = obs.filter((o) => o.vc > 2);
const over2TP = over2.filter((o) => !FALSE_POSITIVES.has(o.ns + " " + o.key)).length;
console.log("  matched occurrences: " + obs.length + " of " + baseline.length + " baseline rows");
console.log(
  "  occurrences with >2 value cells: " +
    over2.length +
    " (true positives among them: " +
    over2TP +
    ")",
);
console.log("");

// ---------------------------------------------------------------- TABLE-C
console.log("TABLE-C (spec 2.3) — block shape per firing namespace (first instance)");
console.log("  namespace | opener | rows | minValueCells | resolvingRows(incl opener) | fixture");
const seen = new Set<string>();
for (const b of blocks) {
  if (!FIRING_NAMESPACES.includes(b.ns) || seen.has(b.ns)) continue;
  seen.add(b.ns);
  console.log(
    "  " +
      b.ns +
      " | " +
      JSON.stringify(b.opener) +
      " | " +
      b.rows.length +
      " | " +
      minValueCells(b) +
      " | " +
      resolvingRows(b, false) +
      " | " +
      b.fixture,
  );
}
console.log("");

// ---------------------------------------------------------------- TABLE-D
console.log("TABLE-D (spec 3.2) — candidate rules scored against the baseline");
console.log("  rule | kept | FP removed | TP lost | true positives lost");

/**
 * The shipped rule after this spec: neither a form dump nor an inventory matrix.
 *
 * The threshold is ONE named constant referenced by the predicate AND by the printed label
 * below, so a table can never state a bound the rule it scored did not use. Lifting it out
 * of the four literals it started as is the local defence against the class
 * `BL-SPECLINT-NUMERIC-TABLE-UNREPRODUCIBLE` names: a published table its own command
 * cannot produce.
 */
const MATRIX_MIN_VALUE_CELLS = 6;
const isFormDump = (b: Block): boolean => normalizeV3(b.opener) === "timestamp";
const isInventoryMatrix = (b: Block): boolean => minValueCells(b) >= MATRIX_MIN_VALUE_CELLS;

const RULES: { name: string; admit: (b: Block) => boolean }[] = [
  { name: "R0 current, admit every block", admit: () => true },
  { name: "R1 not a form dump (opener normalizes to timestamp)", admit: (b) => !isFormDump(b) },
  {
    name: "R2 not an inventory matrix (block minValueCells >= " + MATRIX_MIN_VALUE_CELLS + ")",
    admit: (b) => !isInventoryMatrix(b),
  },
  {
    name: "R3 positive: block holds >=1 resolving row",
    admit: (b) => resolvingRows(b, false) >= 1,
  },
  {
    name: "R3b positive: block holds >=1 resolving NON-opener row",
    admit: (b) => resolvingRows(b, true) >= 1,
  },
  {
    name: "R1+R2 SHIPPED: neither form dump nor inventory matrix",
    admit: (b) => !isFormDump(b) && !isInventoryMatrix(b),
  },
];

for (const rule of RULES) {
  let kept = 0;
  let fpRemoved = 0;
  let tpLost = 0;
  const lost = new Map<string, number>();
  for (const b of blocks) {
    const admitted = rule.admit(b);
    for (const cells of b.rows) {
      const col0 = cells[0] ?? "";
      const id = b.ns + " " + col0;
      if (col0 === "" || !wanted.has(id)) continue;
      const isFP = FALSE_POSITIVES.has(id);
      if (admitted) kept += 1;
      else if (isFP) fpRemoved += 1;
      else {
        tpLost += 1;
        lost.set(id, (lost.get(id) ?? 0) + 1);
      }
    }
  }
  const detail = [...lost.entries()].map(([k, n]) => k + " x" + n).join("; ");
  console.log(
    "  " +
      rule.name +
      " | " +
      kept +
      " | " +
      fpRemoved +
      " | " +
      tpLost +
      " | " +
      (detail || "none"),
  );
}
console.log("");
console.log("  corpus blocks scanned: " + blocks.length + " across " + FIXTURES.length + " fixtures");

// ---------------------------------------------------------------- TABLE-E
console.log("");
console.log("TABLE-E (spec 3.3) — EVERY baseline row under the shipped rule, one line each");
console.log("  verdict | namespace | key | arm | opener | blockMinVC | rowVC | fixture");
let excluded = 0;
let keptRows = 0;
const lines: string[] = [];
for (const b of blocks) {
  const formDump = isFormDump(b);
  const matrix = isInventoryMatrix(b);
  for (const cells of b.rows) {
    const col0 = cells[0] ?? "";
    const id = b.ns + " " + col0;
    if (col0 === "" || !wanted.has(id)) continue;
    const arm = formDump ? "form-dump" : matrix ? "inventory-matrix" : "-";
    const verdict = formDump || matrix ? "EXCLUDED" : "kept";
    if (verdict === "EXCLUDED") excluded += 1;
    else keptRows += 1;
    lines.push(
      "  " +
        verdict +
        " | " +
        b.ns +
        " | " +
        col0 +
        " | " +
        arm +
        " | " +
        JSON.stringify(b.opener) +
        " | " +
        minValueCells(b) +
        " | " +
        valueCells(cells) +
        " | " +
        b.fixture,
    );
  }
}
for (const l of lines.sort()) console.log(l);
console.log("  EXCLUDED=" + excluded + "  kept=" + keptRows + "  total=" + (excluded + keptRows));

// ---------------------------------------------------------------- TABLE-F
console.log("");
console.log("TABLE-F (spec 3.1) — matrix-arm threshold sensitivity");
console.log("  threshold | blocks excluded by matrix arm | baseline rows removed | TP lost");
for (const t of [2, 3, 4, 5, 6, 7, 8]) {
  const excludes = (b: Block) => minValueCells(b) >= t;
  let blocksExcluded = 0;
  let removed = 0;
  let tpLost = 0;
  for (const b of blocks) {
    if (!excludes(b)) continue;
    blocksExcluded += 1;
    for (const cells of b.rows) {
      const col0 = cells[0] ?? "";
      const id = b.ns + " " + col0;
      if (col0 === "" || !wanted.has(id)) continue;
      removed += 1;
      if (!FALSE_POSITIVES.has(id)) tpLost += 1;
    }
  }
  console.log("  " + t + " | " + blocksExcluded + " | " + removed + " | " + tpLost);
}

console.log("");
console.log("TABLE-G (spec 6) — block minValueCells distribution across the corpus");
const dist = new Map<number, number>();
for (const b of blocks) {
  const m = minValueCells(b);
  dist.set(m, (dist.get(m) ?? 0) + 1);
}
console.log("  minValueCells | blocks");
for (const [k, v] of [...dist.entries()].sort((a, b) => a[0] - b[0])) {
  console.log("  " + k + " | " + v);
}

// ---------------------------------------------------------------- TABLE-H
console.log("");
console.log("TABLE-H (spec 3.1) — which NAMESPACE FAMILIES the matrix arm withdraws candidacy from");
console.log("  Row counts cannot answer this: a family hosting no baseline emission loses");
console.log("  candidacy without moving a single row. That is how threshold 3 swallowed four");
console.log("  venue blocks while every outcome table read green.");
console.log("  threshold | blocks excluded | notable families hit");
const NOTABLE = ["venue", "details", "client", "client contact", "timestamp", "console", "joann"];
for (const t of [3, 4, 5, 6, 7]) {
  const excluded = blocks.filter((b) => minValueCells(b) >= t);
  const byNs = new Map<string, number>();
  for (const b of excluded) byNs.set(b.ns, (byNs.get(b.ns) ?? 0) + 1);
  const hit = NOTABLE.filter((n) => byNs.has(n))
    .map((n) => n + "=" + byNs.get(n))
    .join(", ");
  console.log("  " + t + " | " + excluded.length + " | " + (hit || "none"));
}

// ---------------------------------------------------------------- TABLE-I
console.log("");
console.log("TABLE-I (spec 3.5) — the BLOCK CLASSIFICATION CENSUS, every corpus block");
console.log("  Spec round 1 finding 2: the rule classifies BLOCKS, but every other table");
console.log("  selects rows through the baseline key set, so an implementation that merely");
console.log("  hardcoded suppression of the three known keys would satisfy them all, and a");
console.log("  wrong exclusion among the emission-free excluded blocks would be invisible.");
console.log("  This census is the pinned artifact: it records a verdict for EVERY block,");
console.log("  whether or not any row in it ever fired.");
const censusByNs = new Map<string, { excluded: number; kept: number; arms: Set<string> }>();
let totalExcluded = 0;
for (const b of blocks) {
  const formDump = isFormDump(b);
  const matrix = isInventoryMatrix(b);
  const rec = censusByNs.get(b.ns) ?? { excluded: 0, kept: 0, arms: new Set<string>() };
  if (formDump || matrix) {
    rec.excluded += 1;
    totalExcluded += 1;
    rec.arms.add(formDump ? "form-dump" : "inventory-matrix");
  } else {
    rec.kept += 1;
  }
  censusByNs.set(b.ns, rec);
}
console.log("  namespace | excluded | kept | arms");
for (const [ns, rec] of [...censusByNs.entries()].filter((e) => e[1].excluded > 0).sort()) {
  console.log("  " + ns + " | " + rec.excluded + " | " + rec.kept + " | " + [...rec.arms].join(","));
}
const emissionFree = blocks.filter((b) => {
  if (!(isFormDump(b) || isInventoryMatrix(b))) return false;
  return !b.rows.some((cells) => wanted.has(b.ns + " " + (cells[0] ?? "")));
}).length;
console.log("  blocks excluded: " + totalExcluded + " of " + blocks.length);
console.log("  of those, emission-free at the merge base: " + emissionFree);
console.log(
  "  families with ANY block excluded: " +
    [...censusByNs.entries()].filter((e) => e[1].excluded > 0).length,
);

// ---------------------------------------------------------------- TABLE-J
console.log("");
console.log("TABLE-J — the LIVE baseline, for comparison against the frozen one");
console.log("  frozen (merge base): " + baseline.length + " rows");
console.log("  live (working tree): " + liveBaseline.length + " rows");
console.log(
  "  delta: " +
    (liveBaseline.length - baseline.length) +
    (liveBaseline.length === baseline.length ? "  (spec not yet implemented)" : ""),
);
