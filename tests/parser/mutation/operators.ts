// tests/parser/mutation/operators.ts
import { segment } from "./rows";
import type { LogicalSection, Row, Segmentation } from "./rows";
import { isHeaderCells, classifySection, RISK_CRITICAL } from "./classify";
import type { Domain } from "./classify";

export type Bucket = "corrupting" | "cosmetic";
export type Mutant = {
  md: string;
  siteId: string;
  bucket: Bucket;
  domains: Domain[];
  dataRowCount?: number;
};

const seg = (md: string): Segmentation => segment(md, isHeaderCells);
const lines = (md: string) => md.split("\n");
const dataRows = (s: LogicalSection): Row[] => s.rows.filter((r) => r.cls === "data");
const scalars = (s: string) => [...s].length;

// RAW-SEGMENT rewrite (plan-R14). Parser cell `i` === `line.split("|")[i+1]` (splitRow drops
// framing via slice(1,-1)). Replacing ONLY segment i+1 preserves every OTHER segment
// byte-for-byte — including escaped `\|` fragments in non-target cells — so the mutation is
// genuinely single-site in parser-space. Never rebuild the row from trimmed cells with
// `join(" | ")`: that collapses original padding and reshapes escaped-pipe segments elsewhere,
// silently corrupting non-target hotel/contact values. The target segment's surrounding
// whitespace is preserved; only its trimmed content is swapped.
function replaceRawCell(line: string, cellIdx: number, next: string): string {
  const parts = line.split("|");
  const seg = parts[cellIdx + 1] ?? "";
  const lead = seg.match(/^\s*/)![0];
  const trail = seg.match(/\s*$/)![0];
  parts[cellIdx + 1] = `${lead}${next}${trail}`;
  return parts.join("|");
}
/** Fuse parser cells p and p+1 by DELETING the pipe delimiter between them; concatenates the
 *  two raw segments (padding preserved) and leaves every other segment untouched (plan-R14). */
function mergeRawCells(line: string, p: number): string {
  const parts = line.split("|");
  parts.splice(p + 1, 2, `${parts[p + 1] ?? ""}${parts[p + 2] ?? ""}`);
  return parts.join("|");
}

// Replace one cell in a specific line; returns the whole mutated markdown (raw-segment safe).
function withCell(md: string, line: number, cellIdx: number, next: string): string {
  const ls = lines(md);
  ls[line] = replaceRawCell(ls[line]!, cellIdx, next);
  return ls.join("\n");
}

function eachDataCell(
  md: string,
): Array<{ line: number; cellIdx: number; sec: LogicalSection; val: string }> {
  const out: Array<{ line: number; cellIdx: number; sec: LogicalSection; val: string }> = [];
  for (const s of seg(md).sections)
    for (const r of dataRows(s))
      r.cells.forEach((v, i) => {
        if (v.length > 0) out.push({ line: r.line, cellIdx: i, sec: s, val: v });
      });
  return out;
}
const dom = (s: LogicalSection): Domain[] => [classifySection(s)];
const sid = (op: string, s: LogicalSection, line: number, locus: number | string) =>
  `${op}:B${s.index}:L${line}:X${locus}`;

// ---- corrupting operators (data-row scoped) ----
// Every operator is a LAZY GENERATOR (`function*`), yielding one Mutant at a time. The driver
// streams them so it can enforce MUTANT_BUDGET before parsing each mutant, never materializing a
// full operator array (Codex plan-R20 [high]). The array form used by tests is derived below.
function* refSub(md: string): Generator<Mutant> {
  for (const c of eachDataCell(md)) {
    // Skip cells already `#REF!` — rewriting them to `#REF!` is a byte-identical no-op that
    // would still claim a siteId and count toward coverage without exercising the parser
    // (Codex plan-R18 [medium]). The independent audit applies the identical exclusion.
    if (c.val.trim() === "#REF!") continue;
    yield {
      md: withCell(md, c.line, c.cellIdx, "#REF!"),
      siteId: sid("ref-sub", c.sec, c.line, c.cellIdx),
      bucket: "corrupting",
      domains: dom(c.sec),
    };
  }
}

function* unicodeInject(md: string): Generator<Mutant> {
  for (const c of eachDataCell(md)) {
    if (scalars(c.val) < 2) continue;
    const mid = Math.floor([...c.val].length / 2);
    const ZWNJ = "‌"; // zero-width non-joiner (fintech live shape)
    const injected = [...c.val].slice(0, mid).join("") + ZWNJ + [...c.val].slice(mid).join("");
    yield {
      md: withCell(md, c.line, c.cellIdx, injected),
      siteId: sid("unicode-inject", c.sec, c.line, c.cellIdx),
      bucket: "corrupting",
      domains: dom(c.sec),
    };
  }
}

function* mergedCell(md: string): Generator<Mutant> {
  for (const s of seg(md).sections)
    for (const r of dataRows(s)) {
      if (r.cells.length < 3) continue;
      // one mutant per interior pipe p (fuse cells p and p+1 via raw delimiter deletion) — plan-R5/R14
      for (let p = 0; p < r.cells.length - 1; p++) {
        const ls = lines(md);
        ls[r.line] = mergeRawCells(ls[r.line]!, p);
        yield {
          md: ls.join("\n"),
          siteId: sid("merged-cell", s, r.line, p),
          bucket: "corrupting",
          domains: dom(s),
        };
      }
    }
}

function* headerTypo(md: string): Generator<Mutant> {
  for (const s of seg(md).sections) {
    if (!s.headerRow) continue;
    const tok = s.headerRow.cells[0]!.trim();
    if (tok.length < 2) continue;
    // transpose the first adjacent pair of distinct chars
    const chars = [...tok];
    let pos = -1;
    for (let i = 0; i < chars.length - 1; i++)
      if (chars[i] !== chars[i + 1]) {
        pos = i;
        break;
      }
    if (pos < 0) continue;
    [chars[pos], chars[pos + 1]] = [chars[pos + 1]!, chars[pos]!];
    const typo = chars.join("");
    if (isHeaderCells([typo])) continue; // guard: must not produce a real header
    yield {
      md: withCell(md, s.headerRow.line, 0, typo),
      siteId: sid("header-typo", s, s.headerRow.line, 0),
      bucket: "corrupting",
      domains: dom(s),
    };
  }
}

function* columnShift(md: string): Generator<Mutant> {
  for (const s of seg(md).sections) {
    const dr = dataRows(s);
    if (dr.length < 1) continue; // Codex R13: require ≥1 data row
    const ls = lines(md);
    // insert a REAL empty leading cell (new pipe delimiter), not just whitespace (plan-R2):
    // "| x | y |" -> "|  | x | y |"
    for (const r of s.rows) ls[r.line] = ls[r.line]!.replace(/^\|/, "|  |");
    yield {
      md: ls.join("\n"),
      siteId: sid("column-shift", s, s.headerRow?.line ?? s.rows[0]!.line, 0),
      bucket: "corrupting",
      domains: dom(s),
      dataRowCount: dr.length,
    };
  }
}

function* blankRowInject(md: string): Generator<Mutant> {
  for (const s of seg(md).sections) {
    const dr = dataRows(s);
    // one mutant per interior data-row gap (plan-R3, exhaustive)
    for (let i = 0; i < dr.length - 1; i++) {
      const gapAfter = dr[i]!.line; // absolute line index in the ORIGINAL md
      const ls = lines(md);
      ls.splice(gapAfter + 1, 0, "");
      yield {
        md: ls.join("\n"),
        siteId: sid("blank-row:inject", s, gapAfter, `gap${i}`),
        bucket: "corrupting",
        domains: dom(s),
      };
    }
  }
}

function* blankRowRemove(md: string): Generator<Mutant> {
  const { runs } = seg(md);
  const ls = lines(md);
  for (let i = 0; i < runs.length - 1; i++) {
    const a = runs[i]!,
      b = runs[i + 1]!;
    // the blank line index between run a's last section and run b's first section
    const lastRow = Math.max(
      ...a.sections
        .flatMap((s) => s.rows.map((r) => r.line))
        .concat(a.sections.map((s) => s.headerRow?.line ?? -1)),
    );
    const blankLine = lastRow + 1;
    if (ls[blankLine]?.trim() !== "") continue;
    // Delete the ENTIRE consecutive blank span between the two runs, not just the first blank
    // line (Codex whole-diff R1 [medium]): with ≥2 blank lines a single-line deletion leaves a
    // separator, so the parser still sees two runs — a byte-distinct mutant that never exercises
    // the intended run-MERGE, while the boundary is still credited (tautological coverage). Since
    // `seg` breaks runs on any blank line, the gap between run a and run b is exactly this
    // consecutive blank span; removing all of it guarantees the runs actually fuse. (All current
    // fixtures have single-blank boundaries, so this is byte-identical for them — ledger unchanged.)
    let blankEnd = blankLine;
    while (ls[blankEnd + 1]?.trim() === "") blankEnd++;
    const md2 = ls.filter((_, idx) => idx < blankLine || idx > blankEnd).join("\n");
    const domA = classifySection(a.sections[a.sections.length - 1]!);
    const domB = classifySection(b.sections[0]!);
    // dedup: adjacent same-domain runs must credit the domain ONCE (matches the audit, plan-R8)
    const domains = [...new Set([domA, domB])];
    yield {
      md: md2,
      siteId: `blank-row:remove:B${a.index}:L${blankLine}:Xgap`,
      bucket: "corrupting",
      domains,
    };
  }
}

// ---- section-reorder: CORRUPTING (measured 2026-07-06) ----
// Originally specified as a cosmetic (must-be-invisible) control on the premise that block
// parsers scan the whole document order-independently. The day-1 exhaustive run DISPROVED that:
// 99/486 adjacent-block swaps produced a SILENT_WRONG verdict — the parser preserves SOURCE
// ORDER into its output arrays (crewMembers/rooms/hotelReservations/…), so reordering sections
// silently reorders the payload with no warning. That is precisely the silent fragility the
// harness exists to pin, so section-reorder is reclassified `corrupting`: its order-sensitive
// swaps become ledger holes (SILENT_WRONG / SILENT_SIGNAL_LOSS), its no-effect swaps stay
// ABSORBED, and any swap that trips a warning is SIGNALED. `domains: []` — the perturbation is
// whole-document, not domain-scoped, so it is exempt from the per-domain coverage floor / audit
// agreement (those cover the 7 domain-scoped corrupting keys). (Spec §4.1, amended.)
function* sectionReorder(md: string): Generator<Mutant> {
  // EXHAUSTIVE (plan-R10): one mutant per ADJACENT block-pair swap, not just the first two —
  // a parser order-dependence between late blocks must also be exercised.
  const blocks = md.split(/\n\s*\n/);
  if (blocks.length < 2) return;
  for (let i = 0; i < blocks.length - 1; i++) {
    const swapped = [...blocks.slice(0, i), blocks[i + 1], blocks[i], ...blocks.slice(i + 2)].join(
      "\n\n",
    );
    if (swapped === md) continue; // identical blocks → no-op, skip
    yield {
      md: swapped,
      siteId: `section-reorder:B${i}:L0:Xpair${i}`,
      bucket: "corrupting",
      domains: [],
    };
  }
}

// ---- cosmetic operators ----

function* trailingWhitespace(md: string): Generator<Mutant> {
  const swapped = md.replace(/\n/g, "  \n") + "\n\n"; // trailing spaces on each line + trailing blank lines
  if (swapped === md) return;
  yield { md: swapped, siteId: "trailing-whitespace:B0:L0:Xeof", bucket: "cosmetic", domains: [] };
}

// MUTANT_BUDGET — SINGLE SOURCE OF TRUTH (imported by the driver + every gate). A per-(operator,
// fixture) ceiling on generated mutants; the healthy corpus is ~1e5 total (hundreds per op×fixture),
// so 150k with headroom catches a fanout regression (e.g. per-char) without ever false-firing.
export const MUTANT_BUDGET = 150_000;

/** Raw LAZY operators — MODULE-PRIVATE (Codex plan-R24 [high]). Deliberately NOT exported: the
 *  ONLY way to enumerate an operator over corpus-scale input is `boundedMutants` below, which wraps
 *  the generator in the budget-guarded `guardStream`. Making the raw generators unreachable means
 *  no consumer can iterate an UNguarded stream and OOM/hang on a fanout regression — the guarded
 *  path is the only path (the structural closure of the R17–R24 memory/streaming vector). */
const OPERATOR_GENS: Record<string, (md: string) => Generator<Mutant>> = {
  "header-typo": headerTypo,
  "ref-sub": refSub,
  "unicode-inject": unicodeInject,
  "column-shift": columnShift,
  "blank-row:inject": blankRowInject,
  "blank-row:remove": blankRowRemove,
  "merged-cell": mergedCell,
  "section-reorder": sectionReorder,
  "trailing-whitespace": trailingWhitespace,
};

/** Shared fail-fast streaming guard (Codex plan-R24 [high]): yields items one at a time and THROWS
 *  before yielding the (budget+1)th, so an unbounded/fanned-out source fails deterministically with
 *  O(1) heap instead of being collected into an array. EVERY corpus-scale consumer routes through
 *  this via `boundedMutants`; a negative control (Task 10) exercises it directly. */
export function* guardStream<T>(gen: Iterable<T>, budget: number, label: string): Generator<T> {
  let n = 0;
  for (const x of gen) {
    if (++n > budget)
      throw new Error(`${label} exceeded budget ${budget} before array materialization`);
    yield x;
  }
}

/** THE canonical corpus-scale operator iterator: a budget-guarded stream of `op`'s mutants for
 *  `md`. The ONLY way to enumerate an operator over a real fixture — runAll, skippedInapplicable,
 *  the count-agreement gate, and the coverage summary all use it. */
export function boundedMutants(op: string, md: string): Generator<Mutant> {
  return guardStream(OPERATOR_GENS[op]!(md), MUTANT_BUDGET, `${op} fanout`);
}

/** The 9 operator names — for KEY iteration without importing the eager array form (`OPERATOR_NAMES`
 *  replaces `Object.keys(OPERATORS)` at the corpus call sites, so nothing depends on OPERATORS just
 *  to enumerate op names). */
export const OPERATOR_NAMES: readonly string[] = Object.keys(OPERATOR_GENS);

/** Eager ARRAY form for BOUNDED synthetic-input test call sites ONLY (which use
 *  `.filter/.map/.length/.find/.some/.slice`). It wraps `boundedMutants` — NOT the raw private
 *  generator — so even this path is budget-GUARDED (Codex plan-R25 [high]): a caller who mistakenly
 *  spreads it over a real fixture still hits the MUTANT_BUDGET fail-fast, never an unbounded
 *  materialization. There is therefore NO unguarded enumeration path in the module. Corpus loops
 *  MUST still stream `boundedMutants` (never build the array); the equivalence
 *  `[...boundedMutants(op, md)] === OPERATORS[op](md)` is pinned by a Task-4 unit test. */
export const OPERATORS: Record<string, (md: string) => Mutant[]> = Object.fromEntries(
  OPERATOR_NAMES.map((k) => [k, (md: string) => [...boundedMutants(k, md)]]),
);

export function floorEligible(mutants: Mutant[]): Set<Domain> {
  const s = new Set<Domain>();
  for (const m of mutants) for (const d of m.domains) if (RISK_CRITICAL.includes(d)) s.add(d);
  return s;
}

/**
 * Risk-critical domains PRESENT in the fixture (≥1 section classified to them)
 * but with NO applicable site for operator `op` — surfaced, never silently excused
 * (spec §4.3, Codex R5). A domain is "present" if any section classifies to it.
 */
export function skippedInapplicable(md: string, op: string): Domain[] {
  const present = new Set<Domain>();
  for (const s of seg(md).sections) {
    const d = classifySection(s);
    if (RISK_CRITICAL.includes(d)) present.add(d);
  }
  // Route through the shared budget-guarded stream (Codex plan-R23/R24 [high]): never materialize
  // the operator's full array here — this runs across the whole corpus (Task 11), so `boundedMutants`
  // gives both O(1) heap AND fail-fast on a fanout regression (it wraps guardStream over MUTANT_BUDGET).
  const eligible = new Set<Domain>();
  for (const m of boundedMutants(op, md))
    for (const d of m.domains) if (RISK_CRITICAL.includes(d)) eligible.add(d);
  return [...present].filter((d) => !eligible.has(d)).sort();
}

// NOTE (plan-R2): detection is EXHAUSTIVE. The driver parses EVERY generated mutant —
// there is no cap and no `select`/reservation limiter, because a silent-wrong parse in an
// un-parsed site would ship undetected (spec §2 "every fixture × operator × site"). The
// coverage floor + independent applicability audit remain as guards that each risk-critical
// domain HAS applicable sites (catching an operator that stops enumerating a domain).
