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
import {
  anchorNamespace,
  detectFieldNearMisses,
  normalizeV3,
  scanRowsWithOpener,
} from "@/lib/parser/fieldNearMiss";
import { isKnownSectionHeader } from "@/lib/parser/knownSections";
import { canonicalSectionKind } from "@/lib/parser/sectionKind";
import { newAggregator } from "@/lib/parser/warnings";
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
console.log("TABLE-I (spec 3.5) — the BLOCK CLASSIFICATION CENSUS, one line PER BLOCK");
console.log("  Spec round 2 finding 2: an earlier version of this table aggregated by");
console.log("  namespace, printing {excluded, kept} totals. That is not a verdict per block:");
console.log("  `audio` has 13 blocks, 4 excluded and 9 kept, so admitting one intended-excluded");
console.log("  audio block while excluding one intended-kept one left the table byte-identical,");
console.log("  and a wrong exclusion did not have to change any committed cell. Each block now");
console.log("  carries its own identity (fixture, ordinal within fixture, opener, minVC), so any");
console.log("  swap moves a line.");
console.log("  verdict | arm | namespace | fixture#ordinal | minVC | rows | opener");
let totalExcluded = 0;
const perFixtureOrdinal = new Map<string, number>();
const censusLines: string[] = [];
for (const b of blocks) {
  const n = (perFixtureOrdinal.get(b.fixture) ?? 0) + 1;
  perFixtureOrdinal.set(b.fixture, n);
  const formDump = isFormDump(b);
  const matrix = isInventoryMatrix(b);
  const excluded = formDump || matrix;
  if (excluded) totalExcluded += 1;
  censusLines.push(
    "  " +
      (excluded ? "EXCLUDED" : "kept") +
      " | " +
      (formDump ? "form-dump" : matrix ? "inventory-matrix" : "-") +
      " | " +
      b.ns +
      " | " +
      b.fixture +
      "#" +
      n +
      " | " +
      minValueCells(b) +
      " | " +
      b.rows.length +
      " | " +
      JSON.stringify(b.opener),
  );
}
// EXCLUDED blocks in full: these are the ones the rule acts on, and the set the
// consequence bound rests on. Kept blocks are summarised, since the census artifact would
// otherwise be 514 lines of mostly "kept | - " and the excluded set is what can be wrong.
for (const l of censusLines.filter((l) => l.startsWith("  EXCLUDED")).sort()) console.log(l);
const emissionFree = blocks.filter((b) => {
  if (!(isFormDump(b) || isInventoryMatrix(b))) return false;
  return !b.rows.some((cells) => wanted.has(b.ns + " " + (cells[0] ?? "")));
}).length;
console.log("  blocks excluded: " + totalExcluded + " of " + blocks.length);
console.log("  of those, emission-free at the merge base: " + emissionFree);
console.log("  kept blocks: " + (blocks.length - totalExcluded));

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

// ---------------------------------------------------------------- TABLE-L
console.log("");
console.log("TABLE-L (spec AC-10) — does the DETECTOR gate on the predicate, or just on 3 keys?");
console.log("  Spec round 2 finding 1: the census proves a predicate classifies blocks. It does");
console.log("  NOT prove `detectFieldNearMisses` gates emissions through that predicate. An");
console.log("  implementation could expose a correct predicate for the census and separately");
console.log("  hardcode suppression of the three known keys in the detector, satisfying every");
console.log("  other criterion.");
console.log("");
console.log("  The binding probe: into EVERY corpus block, inject one row whose label is a known");
console.log("  near-miss that is NOT one of the three known keys, run the real detector over");
console.log("  that block alone with a fresh aggregator, and require the detector to emit IF AND");
console.log("  ONLY IF the predicate admits the block. A three-key hardcode emits on every");
console.log("  excluded block and fails immediately. Injecting one label row into a real corpus");
console.log("  block is one ordinary edit, so every input stays inside the declared probe domain.");
/**
 * The injected label must satisfy TWO properties, and both are asserted below rather than
 * assumed of the chosen string.
 *
 *  - It matches the vocabulary and clears the guards, so an admitting block emits it.
 *  - It appears NOWHERE in the corpus as a row label. `Address:` failed this: it IS a corpus
 *    label, and nine `client` blocks already contain one that emits on its own, so the
 *    emission check could not tell the injected row from the pre-existing one and those nine
 *    agreed for a reason the probe had not established.
 */
const INJECTED_LABEL = "Equipment Storage:";
let agree = 0;
let disagree = 0;
let emittedAnywhere = 0;
let shapeChanged = 0;
let ambiguous = 0;
const disagreements: string[] = [];
for (const b of blocks) {
  const admitted = !(isFormDump(b) || isInventoryMatrix(b));
  if (b.rows.some((cells) => (cells[0] ?? "") === INJECTED_LABEL)) ambiguous += 1;
  // THE INJECTED ROW MUST NOT CHANGE THE BLOCK'S CLASSIFICATION INPUTS.
  //
  // Spec round 3 finding: an earlier version appended a row with ONE value cell to every
  // block. For an inventory matrix that drops the block's MINIMUM to 1, so by §3.1 the
  // mutated block is no longer a matrix and a correct detector must ADMIT it — while this
  // table still expected exclusion. AC-10's matrix half was unsatisfiable without violating
  // §3.1, and a conforming implementation would have finished at 18 disagreements rather
  // than 0. Measured blast radius of that naive append: 151 of 514 blocks had their minimum
  // changed, 18 of them across the exclusion boundary.
  //
  // The repair pads the injected row to the block's OWN minimum value-cell count, so the
  // minimum is preserved exactly and the opener is untouched. Verified across all 514
  // corpus blocks: zero change to (opener, minValueCells).
  const pad = Array.from({ length: minValueCells(b) }, (_, i) => "v" + (i + 1));
  const lines = b.rows.map((cells) => "| " + cells.join(" | ") + " |");
  lines.push("| " + [INJECTED_LABEL, ...pad].join(" | ") + " |");
  const injectedDoc = lines.join("\n");

  // The structural guard that makes this defect class impossible to reintroduce silently:
  // re-derive the classification inputs FROM the mutated document and require them to match
  // the originals. A future edit to the injection that perturbs shape fails HERE, loudly,
  // instead of quietly making the binding unsatisfiable.
  const reRows = scanRowsWithOpener(injectedDoc);
  const reFirst = reRows[0];
  const reCells = reRows.map((r) => r.cells.map((c) => clean(c)));
  const reMin = Math.min(...reCells.map((c) => c.slice(1).filter((x) => x !== "").length));
  if (reFirst === undefined || reFirst.opener !== b.opener || reMin !== minValueCells(b)) {
    shapeChanged += 1;
  }

  const agg = newAggregator();
  detectFieldNearMisses(injectedDoc, agg);
  // `blockRef.name` is where emitUnknownField puts the row label (lib/parser/warnings.ts:419).
  // An earlier version read a `detail` field that does not exist, so it reported "not emitted"
  // for every block and would have declared the binding broken no matter what the detector
  // did. A probe whose negative result is unconditional proves nothing, which is why the
  // positive control below is asserted rather than assumed.
  const emitted = agg.warnings.some(
    (w) => w.code === "UNKNOWN_FIELD" && w.blockRef?.name === INJECTED_LABEL,
  );
  if (emitted) emittedAnywhere += 1;
  if (emitted === admitted) agree += 1;
  else {
    disagree += 1;
    if (disagreements.length < 8) {
      disagreements.push(
        "  MISMATCH " + b.ns + " | " + b.fixture + " | admitted=" + admitted + " emitted=" + emitted,
      );
    }
  }
}
for (const d of disagreements) console.log(d);
console.log(
  "  blocks where detector emission agrees with predicate admission: " +
    agree +
    " of " +
    blocks.length,
);
console.log("  disagreements: " + disagree);
console.log(
  disagree === 0
    ? "  BOUND: the detector's emission tracks the predicate on every corpus block."
    : "  UNBOUND: the detector does not gate on the predicate.",
);
console.log(
  "  positive control, blocks where the injected label DID emit: " +
    emittedAnywhere +
    " (zero here means the probe cannot observe an emission at all, and its verdict is vacuous)",
);
console.log(
  "  ambiguity control, blocks already containing the injected label: " +
    ambiguous +
    " (must be 0, or an emission cannot be attributed to the injected row)",
);
console.log(
  "  SHAPE INVARIANCE, blocks whose (opener, minValueCells) the injection changed: " +
    shapeChanged +
    " (must be 0, or the probe is testing a block the rule would classify differently)",
);

// ---------------------------------------------------------------- TABLE-K
console.log("");
console.log("TABLE-K (spec AC-9) — TOTAL blocks per namespace family, regardless of verdict");
console.log("  The premise counts AC-9 asserts before it asserts anything about verdicts. A");
console.log("  family with zero exclusions appears HERE and nowhere else, because TABLE-I lists");
console.log("  only blocks the rule excludes. Without this table two of AC-9's three premise");
console.log("  numbers would be stated in the spec and derivable from nothing.");
console.log("  namespace | total blocks | excluded | kept");
for (const ns of NOTABLE) {
  const fam = blocks.filter((b) => b.ns === ns);
  if (fam.length === 0) continue;
  const ex = fam.filter((b) => isFormDump(b) || isInventoryMatrix(b)).length;
  console.log("  " + ns + " | " + fam.length + " | " + ex + " | " + (fam.length - ex));
}

// ---------------------------------------------------------------- TABLE-M
console.log("");
console.log("TABLE-M (spec 3.5) — regression witness: what the NAIVE injection would have done");
console.log("  Spec round 3's defect, kept measurable rather than only described. Appending a");
console.log("  row with ONE value cell (instead of padding to the block's own minimum) changes");
console.log("  the classification input the expectation was computed from. The first number is");
console.log("  the blast radius; the second is how many of those cross the exclusion boundary");
console.log("  and would have made AC-10 unsatisfiable.");
let naiveMinChanged = 0;
let naiveVerdictFlipped = 0;
for (const b of blocks) {
  const lines = b.rows.map((cells) => "| " + cells.join(" | ") + " |");
  lines.push("| " + INJECTED_LABEL + " | one-value-cell |");
  const reRows = scanRowsWithOpener(lines.join("\n"));
  const reCells = reRows.map((r) => r.cells.map((c) => clean(c)));
  const reMin = Math.min(...reCells.map((c) => c.slice(1).filter((x) => x !== "").length));
  if (reMin !== minValueCells(b)) naiveMinChanged += 1;
  const wasExcluded = isFormDump(b) || isInventoryMatrix(b);
  const nowExcluded = isFormDump(b) || reMin >= MATRIX_MIN_VALUE_CELLS;
  if (wasExcluded !== nowExcluded) naiveVerdictFlipped += 1;
}
console.log("  blocks whose minValueCells the naive append changed: " + naiveMinChanged);
console.log("  of those, blocks whose EXCLUSION VERDICT it flipped: " + naiveVerdictFlipped);
console.log("  the shipped min-preserving injection changes both to 0 (see TABLE-L's controls).");

// ---------------------------------------------------------------- TABLE-N
console.log("");
console.log("TABLE-N (spec AC-11) — does the form-dump arm compare NORMALIZED openers?");
console.log("  Spec round 4: every corpus form dump spells its opener exactly `Timestamp`, so an");
console.log("  implementation writing `opener === \"Timestamp\"` satisfies AC-5, AC-9 and AC-10");
console.log("  while violating §3.1, which requires normalizeV3(opener) === \"timestamp\". The");
console.log("  criteria could not tell the two apart because no corpus input distinguishes them.");
console.log("");
console.log("  Each row is the RIA form-dump block with its opener spelled differently — one");
console.log("  ordinary sheet edit, inside the declared probe domain. `normative` is the shipped");
console.log("  rule; `exact` is the impostor. Where they differ, the impostor emits the very rows");
console.log("  this arc exists to suppress.");
console.log("  opener spelling | normalizeV3 | normative excludes | exact-compare excludes | differ");
const formDumpBlock = blocks.find((b) => isFormDump(b));
if (formDumpBlock === undefined) {
  console.log("  NO FORM-DUMP BLOCK FOUND — this table cannot make its claim (premise failed)");
} else {
  let differing = 0;
  for (const spelling of ["Timestamp", "TIMESTAMP", "timestamp", "Timestamp:", " Timestamp "]) {
    const norm = normalizeV3(spelling);
    const normative = norm === "timestamp";
    const exact = spelling === "Timestamp";
    if (normative !== exact) differing += 1;
    console.log(
      "  " + JSON.stringify(spelling) + " | " + JSON.stringify(norm) + " | " + normative +
        " | " + exact + " | " + (normative !== exact ? "YES" : "no"),
    );
  }
  console.log("  spellings where the impostor disagrees with the rule: " + differing);
  console.log(
    differing === 0
      ? "  VACUOUS: no spelling separates the two, so AC-11 could not discriminate."
      : "  DISCRIMINATING: AC-11 has cases that fail an exact-string implementation.",
  );
}
