// Follow-up probe to .claude/tmp/near-miss-calibration-probe.ts (that script's numbers are
// reproduced here rather than imported — it's a standalone `main()`-executing script, so this
// file duplicates its verified vocab/candidate/match/guard logic instead of risking a refactor
// of already-checked code. Every duplicated piece is re-verified against the original's saved
// JSON output before being trusted).
//
// Part A — CONSUMPTION CHECK: for each of the final rule's 66 firing rows, delete that one
// physical line from the fixture, reparse, and compare the full payload (payloadChanged from
// tests/parser/mutation/oracle) against the unmodified parse. payload changed => the parser
// actually consumes that row elsewhere (flagging it would warn on a working row - production
// false positive). payload unchanged => genuinely unconsumed (legitimate candidate).
//
// Part B — NORMALIZATION v3: full non-alphanumeric-run -> single-space normalization (recovers
// "Client:/Contact:" as a type-a match) + an intra-word-hyphen-fused variant tried alongside the
// plain form (recovers "E-mail:" as a type-b match via "email" as a fused single token). Match
// type (a) = normalized-string-equal (either the plain or fused form); type (b) = subset-OR-EQUAL
// token set (either form) — both loosened per the coordinator's ask, re-measured for regressions.
//
// Part C — combines A (drop CONSUMED rows) with B (recovered candidates) into the definitive
// expected-emission set per fixture.

import { readFileSync, writeFileSync } from "node:fs";
import { resolveAlias, FIELD_ALIASES } from "@/lib/parser/aliases";
import { isKnownSectionHeader, KNOWN_SECTION_HEADERS } from "@/lib/parser/knownSections";
import { canonicalSectionKind } from "@/lib/parser/sectionKind";
import { decodeEntities, parseTableRows } from "@/lib/parser/blocks/_helpers";
import { SECTION_HEADER_TOKENS as CLIENT_TOKENS } from "@/lib/parser/blocks/client";
import { SECTION_HEADER_TOKENS as DATES_TOKENS } from "@/lib/parser/blocks/dates";
import { SECTION_HEADER_TOKENS as DRESS_TOKENS } from "@/lib/parser/blocks/dress";
import { SECTION_HEADER_TOKENS as CREW_TOKENS } from "@/lib/parser/blocks/crew";
import { SECTION_HEADER_TOKENS as EVENT_TOKENS, CANONICAL_KEY_MAP as EVENT_CANONICAL_KEY_MAP, EVENT_LABEL_VOCAB } from "@/lib/parser/blocks/event";
import { gatedVocabCorrect } from "@/lib/parser/typoGate";
import { SECTION_HEADER_TOKENS as VENUE_TOKENS } from "@/lib/parser/blocks/venue";
import { SECTION_HEADER_TOKENS as TRANSPORT_TOKENS } from "@/lib/parser/blocks/transport";
import { SECTION_HEADER_TOKENS as ROOMS_TOKENS } from "@/lib/parser/blocks/rooms";
import { SECTION_HEADER_TOKENS as HOTELS_TOKENS } from "@/lib/parser/blocks/hotels";
import { FIXTURES, readFixture, type FixtureRef } from "@/tests/parser/mutation/fixtures";
import { parseSheet } from "@/lib/parser";
import { payloadOf, payloadChanged } from "@/tests/parser/mutation/oracle";

// ── LABEL_TO_KIND keys (same transcription as the original probe; re-verified below). ──
const LABEL_TO_KIND_KEYS = [
  "CREW", "TECH", "HOTEL", "HOTELS", "HOTEL RESERVATIONS", "HOTEL RESERVATION", "HOTEL STAYS",
  "HOTEL STAY", "TRANSPORTATION", "DRIVER", "EVENT DETAILS", "DETAILS", "DETAILS/ROOM DIAGRAM",
  "DATES", "VENUE", "VENUES", "AGENDA", "AGENDA LINK", "CLIENT", "DRESS", "PULL SHEET",
];
for (const key of LABEL_TO_KIND_KEYS) {
  if (canonicalSectionKind(key) === null) throw new Error(`stale LABEL_TO_KIND_KEYS: "${key}"`);
}

const BLOCK_SECTION_HEADER_TOKENS: string[] = [
  ...CLIENT_TOKENS, ...DATES_TOKENS, ...DRESS_TOKENS, ...CREW_TOKENS, ...EVENT_TOKENS,
  ...VENUE_TOKENS, ...TRANSPORT_TOKENS, ...ROOMS_TOKENS, ...HOTELS_TOKENS,
];
for (const tok of BLOCK_SECTION_HEADER_TOKENS) {
  if (!KNOWN_SECTION_HEADERS.has(tok.toUpperCase())) {
    throw new Error(`"${tok}" not in KNOWN_SECTION_HEADERS — exclusion check unsafe`);
  }
}

function isCandidate(col0: string): boolean {
  if (col0.trim() === "") return false;
  if (resolveAlias(col0) !== null) return false;
  if (isKnownSectionHeader(col0)) return false;
  if (canonicalSectionKind(col0) !== null) return false;
  return true;
}

// ── v0 normalization/match (reproduced verbatim from the original probe) ──
function normalizeV0(raw: string): string {
  let s = decodeEntities(raw);
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/:\s*$/, "").trim();
  s = s.toLowerCase();
  return s;
}
function tokenizeV0(normalized: string): Set<string> {
  return new Set(normalized.split(/[^a-z0-9]+/).filter(Boolean));
}
type VocabEntry = { raw: string; normalized: string; tokens: Set<string>; source: string };
function buildVocabularyV0(): VocabEntry[] {
  const raw: Array<{ text: string; source: string }> = [];
  for (const [canon, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const a of aliases) raw.push({ text: a, source: `alias:${canon}` });
  }
  for (const t of BLOCK_SECTION_HEADER_TOKENS) raw.push({ text: t, source: "block-section-header" });
  for (const k of LABEL_TO_KIND_KEYS) raw.push({ text: k, source: "label-to-kind" });
  const byNormalized = new Map<string, VocabEntry>();
  for (const { text, source } of raw) {
    const normalized = normalizeV0(text);
    if (normalized.length === 0) continue;
    const existing = byNormalized.get(normalized);
    if (existing) {
      if (!existing.source.includes(source)) existing.source += `,${source}`;
      continue;
    }
    byNormalized.set(normalized, { raw: text, normalized, tokens: tokenizeV0(normalized), source });
  }
  return [...byNormalized.values()];
}
type MatchResult = { type: "a" | "b"; vocab: VocabEntry } | null;
function matchAgainstVocabV0(candidateNormalized: string, vocab: VocabEntry[]): MatchResult {
  for (const v of vocab) if (v.normalized === candidateNormalized) return { type: "a", vocab: v };
  const candTokens = tokenizeV0(candidateNormalized);
  if (candTokens.size === 0) return null;
  for (const v of vocab) {
    if (candTokens.size >= v.tokens.size) continue;
    let subset = true;
    for (const t of candTokens) if (!v.tokens.has(t)) { subset = false; break; }
    if (subset) return { type: "b", vocab: v };
  }
  return null;
}
function tokenDocFrequency(vocab: VocabEntry[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const v of vocab) for (const t of v.tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  return freq;
}
// ADOPTED FINAL guard set from the original calibration (§5 of the report).
const FINAL_MIN_LEN = 5;
const FINAL_DISTINCTIVE_THRESHOLD = 4;
function passesFinalGuardsV0(
  rawCol0: string,
  candidateNormalized: string,
  match: MatchResult,
  freq: Map<string, number>,
): boolean {
  if (!match) return false;
  if (candidateNormalized.length < FINAL_MIN_LEN) return false;
  const candTokens = tokenizeV0(candidateNormalized);
  const isAllCapsSingleWord = /^[A-Z0-9&/#'.\-]+$/.test(rawCol0.trim()) && candTokens.size === 1;
  if (isAllCapsSingleWord) return false;
  const hasDistinctive = [...candTokens].some(
    (t) => (freq.get(t) ?? Infinity) <= FINAL_DISTINCTIVE_THRESHOLD,
  );
  if (!hasDistinctive) return false;
  return true;
}

// ── Row <-> physical-line mapping (needed for Part A's precise single-line deletion) ──
function parseTableRowsWithLineIndex(md: string): { cells: string[]; lineIdx: number }[] {
  const rows: { cells: string[]; lineIdx: number }[] = [];
  const lines = md.split("\n");
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const trimmed = lines[lineIdx]!.trim();
    if (!trimmed.startsWith("|")) continue;
    const parts = trimmed.split("|");
    const segments = parts.slice(1, parts.length - 1);
    const isSeparator = segments.every((seg) => /^[\s:|*-]*$/.test(seg));
    if (isSeparator) continue;
    const cells: string[] = [];
    for (const seg of segments) cells.push(seg.trim());
    if (cells.length > 0) rows.push({ cells, lineIdx });
  }
  return rows;
}
// Sanity-check this mirrors parseTableRows exactly (cells, in order) for every fixture.
for (const f of FIXTURES) {
  const md = readFixture(f);
  const a = parseTableRows(md);
  const b = parseTableRowsWithLineIndex(md).map((r) => r.cells);
  if (a.length !== b.length || !a.every((r, i) => r.join("|") === b[i]!.join("|"))) {
    throw new Error(`parseTableRowsWithLineIndex diverges from parseTableRows on ${f.path}`);
  }
}

function deleteRow(md: string, rowIndex: number): string {
  const withIdx = parseTableRowsWithLineIndex(md);
  const target = withIdx[rowIndex];
  if (!target) throw new Error(`rowIndex ${rowIndex} out of range (${withIdx.length} rows)`);
  const lines = md.split("\n");
  lines.splice(target.lineIdx, 1);
  return lines.join("\n");
}

type Firing = {
  fixture: string;
  col0: string;
  block: string;
  matchType: "a" | "b";
  vocabEntry: string;
  vocabSource: string;
  rowIndex: number;
};

function blockLabelsAndMap(md: string) {
  const blocks = md.split(/\n\s*\n/);
  const blockRowCounts = blocks.map((b) => parseTableRows(b).length);
  const flatRows = parseTableRows(md);
  const rowToBlock: number[] = [];
  let bi = 0;
  let remaining = blockRowCounts[0] ?? 0;
  for (let ri = 0; ri < flatRows.length; ri++) {
    while (remaining === 0 && bi < blockRowCounts.length - 1) {
      bi++;
      remaining = blockRowCounts[bi] ?? 0;
    }
    rowToBlock.push(bi);
    remaining--;
  }
  return { blocks, rowToBlock, flatRows };
}
function blockLabel(blocks: string[], idx: number): string {
  const text = blocks[idx] ?? "";
  const rows = parseTableRows(text);
  const firstLine = text.trim().split("\n")[0] ?? "";
  return (rows[0]?.[0] ?? firstLine).trim() || "(blank col0)";
}

function computeFinalFiringsV0(vocab: VocabEntry[], freq: Map<string, number>): Firing[] {
  const out: Firing[] = [];
  for (const f of FIXTURES) {
    const md = readFixture(f);
    const { blocks, rowToBlock, flatRows } = blockLabelsAndMap(md);
    for (let i = 0; i < flatRows.length; i++) {
      const col0 = flatRows[i]![0] ?? "";
      if (!isCandidate(col0)) continue;
      const normalized = normalizeV0(col0);
      const match = matchAgainstVocabV0(normalized, vocab);
      if (!passesFinalGuardsV0(col0, normalized, match, freq)) continue;
      out.push({
        fixture: f.path,
        col0,
        block: blockLabel(blocks, rowToBlock[i]!),
        matchType: match!.type,
        vocabEntry: match!.vocab.raw,
        vocabSource: match!.vocab.source,
        rowIndex: i,
      });
    }
  }
  return out;
}

// ═══════════════════════════ PART A — CONSUMPTION CHECK ═══════════════════════════
//
// IMPORTANT REFINEMENT, found empirically (not assumed) while diagnosing the first run: a naive
// "payload changed => CONSUMED => drop from candidacy" verdict is WRONG for this parser. event.ts's
// own "genuinely-unknown label" fallback (event.ts:211-224) BOTH writes the row's value under a
// generic self-slug key (`toCanonicalKey(col0)` — e.g. "Stage" -> event_details.stage) AND emits
// UNKNOWN_FIELD. So "Stage"/"Storage" — the two rows the ORIGINAL AUDIT explicitly confirmed as
// genuine near-miss typos — DO change the payload (event_details.stage / .storage populate), which
// would make a binary rule mislabel them "CONSUMED, drop" and silently remove the only two
// human-confirmed true positives from the baseline. Diagnosed with a deep key-path diff
// (.claude/tmp/diag-consumption3.ts): the changed key equals the CANDIDATE's OWN slugified label
// (self-slug), never the canonical field the near-miss match implicated (stage_size/equipment_storage
// never appear). That is still exactly the near-miss failure mode — the value is captured, but
// silently siloed under an off-label key nothing else reads — so it must stay a candidate.
//
// Three-way verdict:
//   UNCONSUMED            — payload literally unchanged; value is lost entirely.
//   CONSUMED_OFFLABEL     — payload changed, but every changed leaf's final key segment equals
//                           the row's OWN self-slug (lowercase, non-alnum -> "_") — i.e. the
//                           parser's generic unknown-label fallback caught it, not a real field.
//                           Same failure mode as UNCONSUMED from a product standpoint — STAYS a
//                           candidate.
//   CONSUMED_OTHER_KEY    — payload changed under a DIFFERENT, non-self-slug key — the row is
//                           genuinely already resolved to its own distinct real field (verified per
//                           row: room_diagram, notes, driver_name — none matched what the near-miss
//                           vocab pointed at). Genuine production false positive — DROPS.

function toCanonicalKeyApprox(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/** Collect every changed LEAF path (dot-joined) between two plain-object/array JSON trees. */
function deepDiffLeafKeys(a: unknown, b: unknown, path: string, out: string[]): void {
  const aj = JSON.stringify(a);
  const bj = JSON.stringify(b);
  if (aj === bj) return;
  const isPlainObj = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);
  if (isPlainObj(a) && isPlainObj(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
        deepDiffLeafKeys(a[k], b[k], path ? `${path}.${k}` : k, out);
      }
    }
    return;
  }
  out.push(path);
}

type ConsumptionVerdict = "UNCONSUMED" | "CONSUMED_OFFLABEL" | "CONSUMED_OTHER_KEY";
// `via` is optional: only firings produced by computeFinalFiringsV3 (matched via v3
// normalization, "plain" or "fused") carry it. consumptionCheck is also called with
// plain v0 Firing[] (line 484 below), which never sets `via`.
type ConsumptionResult = Firing & { verdict: ConsumptionVerdict; changedKeys: string[]; via?: "plain" | "fused" };

function consumptionCheck(firings: Firing[]): ConsumptionResult[] {
  const byFixture = new Map<string, ReturnType<typeof readFixture>>();
  const baselineByFixture = new Map<string, ReturnType<typeof parseSheet>>();
  for (const f of FIXTURES) {
    const md = readFixture(f);
    byFixture.set(f.path, md);
    baselineByFixture.set(f.path, parseSheet(md, f.path));
  }
  return firings.map((firing) => {
    const md = byFixture.get(firing.fixture)!;
    const baseline = baselineByFixture.get(firing.fixture)!;
    const mutantMd = deleteRow(md, firing.rowIndex);
    const mutant = parseSheet(mutantMd, firing.fixture);
    const changed = payloadChanged(baseline, mutant);
    if (!changed) {
      return { ...firing, verdict: "UNCONSUMED", changedKeys: [] };
    }
    const diffs: string[] = [];
    deepDiffLeafKeys(payloadOf(baseline), payloadOf(mutant), "", diffs);
    const selfSlug = toCanonicalKeyApprox(firing.col0.replace(/:\s*$/, ""));
    const allSelfSlug =
      diffs.length > 0 &&
      diffs.every((d) => {
        const last = d.split(".").pop() ?? "";
        return last === selfSlug;
      });
    // Cross-check against event.ts's REAL CANONICAL_KEY_MAP: a self-slug MATCH is only genuine
    // "generic unknown-label fallback" evidence when the label is NOT itself an intentional,
    // curated map entry that happens to slugify to the same string (event.ts:68-116). "Room
    // Diagram" -> "room diagram": "room_diagram" and "Notes" -> "notes": "notes" are both
    // EXPLICIT curated entries (confirmed by direct import, not inferred) — the string coincides
    // with what the generic fallback would ALSO have produced, but the row took the CURATED
    // exact-match branch (event.ts:183-189), never the "genuinely-unknown label" branch
    // (event.ts:211-224) at all. Reclassify those to CONSUMED_OTHER_KEY.
    const labelLower = firing.col0.replace(/:\s*$/, "").trim().toLowerCase();
    const isCuratedEventKey = EVENT_CANONICAL_KEY_MAP[labelLower] === selfSlug;
    const genuineOfflabel = allSelfSlug && !isCuratedEventKey;
    return {
      ...firing,
      verdict: genuineOfflabel ? "CONSUMED_OFFLABEL" : "CONSUMED_OTHER_KEY",
      changedKeys: diffs,
    };
  });
}

// group key: same §5-table groups from the original report, plus TP/EXTRA
const CLIENT_CONTACT_SHAPE = new Set([
  "client:", "address:", "phone:", "cell phone:", "fax:", "e-mail:", "alt. e-mail:", "event name:",
]);
function groupOf(firing: Firing, expectedTPKeys: Set<string>): string {
  const key = `${firing.fixture}::${firing.col0}`;
  if (expectedTPKeys.has(key)) return "TP (Stage/Storage/Address:/Phone: — audited 14)";
  const c0 = firing.col0.trim().toLowerCase();
  if (CLIENT_CONTACT_SHAPE.has(c0)) return "EXTRA (Client-contact shape, other fixtures)";
  if (c0 === "room diagram") return "FP: Room Diagram";
  if (c0 === "backdrop") return "FP: Backdrop";
  if (c0 === "speaker") return "FP: Speaker";
  if (c0 === "notes") return "FP: Notes";
  if (c0 === "load in:") return "FP: Load In:";
  return `FP: other (${firing.col0})`;
}

// ═══════════════════════════ PART B — NORMALIZATION v3 ═══════════════════════════

function normalizeV3(raw: string): string {
  const decoded = decodeEntities(raw).toLowerCase();
  return decoded.replace(/[^a-z0-9]+/g, " ").trim();
}
/** Fuse INTRA-WORD hyphens only (alnum on both sides), e.g. "e-mail" -> "email",
 *  "ALT. E-mail:" -> "alt. email:" (the period is untouched — not intra-word). Free-standing
 *  hyphens with non-alnum neighbors ("9:00PM - LOAD IN") are left alone, so this never widens
 *  match surface for punctuation that already reads as a real word boundary. */
function fusedForm(raw: string): string {
  const decoded = decodeEntities(raw).toLowerCase();
  const hyphenFused = decoded.replace(/([a-z0-9])-([a-z0-9])/g, "$1$2");
  return hyphenFused.replace(/[^a-z0-9]+/g, " ").trim();
}
function tokensOfV3(normalized: string): Set<string> {
  return new Set(normalized.split(" ").filter(Boolean));
}
type VocabV3Entry = { raw: string; normalized: string; tokens: Set<string>; source: string };
function buildVocabularyV3(): VocabV3Entry[] {
  const raw: Array<{ text: string; source: string }> = [];
  for (const [canon, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const a of aliases) raw.push({ text: a, source: `alias:${canon}` });
  }
  for (const t of BLOCK_SECTION_HEADER_TOKENS) raw.push({ text: t, source: "block-section-header" });
  for (const k of LABEL_TO_KIND_KEYS) raw.push({ text: k, source: "label-to-kind" });
  const byNormalized = new Map<string, VocabV3Entry>();
  for (const { text, source } of raw) {
    const normalized = normalizeV3(text);
    if (normalized.length === 0) continue;
    const existing = byNormalized.get(normalized);
    if (existing) {
      if (!existing.source.includes(source)) existing.source += `,${source}`;
      continue;
    }
    byNormalized.set(normalized, { raw: text, normalized, tokens: tokensOfV3(normalized), source });
  }
  return [...byNormalized.values()];
}
type MatchV3 = { type: "a" | "b"; vocab: VocabV3Entry; via: "plain" | "fused"; norm: string } | null;
function matchAgainstVocabV3(rawCol0: string, vocab: VocabV3Entry[]): MatchV3 {
  const plain = normalizeV3(rawCol0);
  const fused = fusedForm(rawCol0);
  const forms: Array<{ norm: string; via: "plain" | "fused" }> = [{ norm: plain, via: "plain" }];
  if (fused !== plain) forms.push({ norm: fused, via: "fused" });

  for (const { norm, via } of forms) {
    for (const v of vocab) if (v.normalized === norm) return { type: "a", vocab: v, via, norm };
  }
  for (const { norm, via } of forms) {
    const tokens = tokensOfV3(norm);
    if (tokens.size === 0) continue;
    for (const v of vocab) {
      if (tokens.size > v.tokens.size) continue; // subset-OR-EQUAL now (v3 widening)
      let subset = true;
      for (const t of tokens) if (!v.tokens.has(t)) { subset = false; break; }
      if (subset) return { type: "b", vocab: v, via, norm };
    }
  }
  return null;
}
function tokenDocFrequencyV3(vocab: VocabV3Entry[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const v of vocab) for (const t of v.tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  return freq;
}
function passesFinalGuardsV3(rawCol0: string, match: MatchV3, freq: Map<string, number>): boolean {
  if (!match) return false;
  if (match.norm.length < FINAL_MIN_LEN) return false;
  const tokens = tokensOfV3(match.norm);
  const isAllCapsSingleWord = /^[A-Z0-9&/#'.\-]+$/.test(rawCol0.trim()) && tokens.size === 1;
  if (isAllCapsSingleWord) return false;
  const hasDistinctive = [...tokens].some((t) => (freq.get(t) ?? Infinity) <= FINAL_DISTINCTIVE_THRESHOLD);
  if (!hasDistinctive) return false;
  return true;
}

type FiringV3 = Firing & { via: "plain" | "fused" };
function computeFinalFiringsV3(vocab: VocabV3Entry[], freq: Map<string, number>): FiringV3[] {
  const out: FiringV3[] = [];
  for (const f of FIXTURES) {
    const md = readFixture(f);
    const { blocks, rowToBlock, flatRows } = blockLabelsAndMap(md);
    for (let i = 0; i < flatRows.length; i++) {
      const col0 = flatRows[i]![0] ?? "";
      if (!isCandidate(col0)) continue;
      const match = matchAgainstVocabV3(col0, vocab);
      if (!passesFinalGuardsV3(col0, match, freq)) continue;
      out.push({
        fixture: f.path,
        col0,
        block: blockLabel(blocks, rowToBlock[i]!),
        matchType: match!.type,
        vocabEntry: match!.vocab.raw,
        vocabSource: match!.vocab.source,
        rowIndex: i,
        via: match!.via,
      });
    }
  }
  return out;
}

function fmtFiring(f: Firing): string {
  return `${f.fixture} | col0="${f.col0}" | block="${f.block}"`;
}

function main() {
  // ── shared expected-TP keys (from the original report, corrected fused-header row) ──
  const EXPECTED_TP_KEYS = new Set([
    // NOTE: "Client:/Contact:" itself (item #1 of the original 14) was MISSING from this set in
    // the first follow-up run — it only fires under v3 (v0 misses it entirely, §Part B), so its
    // absence here silently miscounted its v3 recovery as FP instead of TP. Fixed before the
    // reported numbers below; caught by manually cross-checking the v3 TP printout against the
    // original 14-row list rather than trusting the tally blindly.
    "fixtures/shows/raw/2025-10-consultants-roundtable.md::Client:/Contact:",
    "fixtures/shows/raw/2025-10-consultants-roundtable.md::Address:",
    "fixtures/shows/raw/2025-10-consultants-roundtable.md::Phone:",
    "fixtures/shows/exporter-xlsx/east-coast.md::Stage",
    "fixtures/shows/exporter-xlsx/east-coast.md::Storage",
    "fixtures/shows/raw/2024-05-east-coast-family-office.md::Stage",
    "fixtures/shows/raw/2024-05-east-coast-family-office.md::Storage",
  ]);

  console.log("=== PART A: CONSUMPTION CHECK (final v0 rule's 66 firings) ===");
  const vocabV0 = buildVocabularyV0();
  const freqV0 = tokenDocFrequency(vocabV0);
  const firingsV0 = computeFinalFiringsV0(vocabV0, freqV0);
  console.log(`v0-final firing count (must equal 66, cross-checking original report): ${firingsV0.length}`);

  const consumption = consumptionCheck(firingsV0);
  const groupTally = new Map<
    string,
    { offlabel: number; otherKey: number; unconsumed: number; rows: ConsumptionResult[] }
  >();
  for (const c of consumption) {
    const g = groupOf(c, EXPECTED_TP_KEYS);
    const entry = groupTally.get(g) ?? { offlabel: 0, otherKey: 0, unconsumed: 0, rows: [] };
    if (c.verdict === "CONSUMED_OFFLABEL") entry.offlabel++;
    else if (c.verdict === "CONSUMED_OTHER_KEY") entry.otherKey++;
    else entry.unconsumed++;
    entry.rows.push(c);
    groupTally.set(g, entry);
  }
  console.log("\n--- consumption verdicts by group ---");
  for (const [g, { offlabel, otherKey, unconsumed, rows }] of [...groupTally.entries()].sort()) {
    console.log(
      `${g}: UNCONSUMED=${unconsumed} CONSUMED_OFFLABEL=${offlabel} CONSUMED_OTHER_KEY=${otherKey} (total ${rows.length})`,
    );
    for (const r of rows) {
      console.log(
        `    ${r.verdict.padEnd(20)} ${fmtFiring(r)}${r.changedKeys.length ? "  changed=[" + r.changedKeys.join(",") + "]" : ""}`,
      );
    }
  }
  const totalOfflabel = consumption.filter((c) => c.verdict === "CONSUMED_OFFLABEL").length;
  const totalOtherKey = consumption.filter((c) => c.verdict === "CONSUMED_OTHER_KEY").length;
  const totalUnconsumed = consumption.filter((c) => c.verdict === "UNCONSUMED").length;
  console.log(
    `\nTOTAL: UNCONSUMED=${totalUnconsumed} CONSUMED_OFFLABEL=${totalOfflabel} CONSUMED_OTHER_KEY=${totalOtherKey} (of ${consumption.length})`,
  );
  console.log(
    `STAYS a candidate (UNCONSUMED + CONSUMED_OFFLABEL): ${totalUnconsumed + totalOfflabel}   DROPS (CONSUMED_OTHER_KEY, genuine production FP): ${totalOtherKey}`,
  );

  // ═══════════════════════════ PART B ═══════════════════════════
  console.log("\n\n=== PART B: NORMALIZATION v3 ===");
  const vocabV3 = buildVocabularyV3();
  console.log(`v3 distinct normalized vocabulary entries: ${vocabV3.length} (v0 was 138)`);
  const freqV3 = tokenDocFrequencyV3(vocabV3);
  const firingsV3 = computeFinalFiringsV3(vocabV3, freqV3);
  console.log(`v3-final firing count: ${firingsV3.length} (v0-final was 66)`);

  const tpV3 = firingsV3.filter((f) => EXPECTED_TP_KEYS.has(`${f.fixture}::${f.col0}`));
  const extraV3 = firingsV3.filter(
    (f) =>
      !EXPECTED_TP_KEYS.has(`${f.fixture}::${f.col0}`) &&
      CLIENT_CONTACT_SHAPE.has(f.col0.trim().toLowerCase()),
  );
  const fpV3 = firingsV3.filter(
    (f) =>
      !EXPECTED_TP_KEYS.has(`${f.fixture}::${f.col0}`) &&
      !CLIENT_CONTACT_SHAPE.has(f.col0.trim().toLowerCase()),
  );
  console.log(`TP=${tpV3.length} EXTRA=${extraV3.length} FP=${fpV3.length}`);

  console.log("\n--- v3 TP ---");
  for (const f of tpV3) console.log(`  TP    ${fmtFiring(f)} via=${f.via}`);
  console.log("\n--- v3 EXTRA (sample of shape, full count above) ---");
  const extraKeys = new Set<string>();
  for (const f of extraV3) extraKeys.add(f.col0.trim().toLowerCase());
  console.log(`  distinct EXTRA col0 shapes: [${[...extraKeys].join(", ")}]`);

  console.log("\n--- newly recovered vs v0-final (in v3 firings, not in v0-final firings) ---");
  const v0Keys = new Set(firingsV0.map((f) => `${f.fixture}::${f.col0}::${f.rowIndex}`));
  const newlyRecovered = firingsV3.filter((f) => !v0Keys.has(`${f.fixture}::${f.col0}::${f.rowIndex}`));
  for (const f of newlyRecovered) {
    console.log(`  NEW   ${fmtFiring(f)} -> ${f.matchType}(${f.via}) "${f.vocabEntry}" [${f.vocabSource}]`);
  }
  console.log("\n--- lost vs v0-final (in v0-final firings, not in v3 firings) ---");
  const v3Keys = new Set(firingsV3.map((f) => `${f.fixture}::${f.col0}::${f.rowIndex}`));
  const lost = firingsV0.filter((f) => !v3Keys.has(`${f.fixture}::${f.col0}::${f.rowIndex}`));
  for (const f of lost) console.log(`  LOST  ${fmtFiring(f)}`);

  // Verify the specific misses named by the coordinator
  console.log("\n--- named-miss verification (Client:/Contact:, E-mail:, ALT. E-mail:, Cell Phone:, Fax:, Event Name:) ---");
  const roundtable = "fixtures/shows/raw/2025-10-consultants-roundtable.md";
  for (const col0 of ["Client:/Contact:", "E-mail:", "ALT. E-mail:", "Cell Phone:", "Fax:", "Event Name:"]) {
    const hit = firingsV3.find((f) => f.fixture === roundtable && f.col0 === col0);
    if (hit) {
      console.log(`  RECOVERED  "${col0}" -> ${hit.matchType}(${hit.via}) "${hit.vocabEntry}" [${hit.vocabSource}]`);
    } else {
      console.log(`  STILL MISS "${col0}"`);
    }
  }

  // ═══════════════════════════ PART C ═══════════════════════════
  console.log("\n\n=== PART C: CONSUMPTION-AWARE + v3 COMBINED (definitive expected-emission set) ===");
  const consumptionV3 = consumptionCheck(firingsV3.map((f) => ({ ...f })));
  // Only CONSUMED_OTHER_KEY drops — both UNCONSUMED and CONSUMED_OFFLABEL stay (§ Part A note).
  const finalSet = consumptionV3.filter((c) => c.verdict !== "CONSUMED_OTHER_KEY");
  const droppedV3 = consumptionV3.filter((c) => c.verdict === "CONSUMED_OTHER_KEY");
  console.log(
    `v3 firings: ${firingsV3.length}; DROPPED (CONSUMED_OTHER_KEY): ${droppedV3.length}; KEPT (UNCONSUMED + CONSUMED_OFFLABEL): ${finalSet.length}`,
  );
  for (const d of droppedV3) {
    console.log(`    DROPPED ${fmtFiring(d)}  changed=[${d.changedKeys.join(",")}]`);
  }

  const byFixtureFinal = new Map<string, ConsumptionResult[]>();
  for (const c of finalSet) {
    const arr = byFixtureFinal.get(c.fixture) ?? [];
    arr.push(c);
    byFixtureFinal.set(c.fixture, arr);
  }
  console.log("\n--- definitive expected-emission set per fixture ---");
  for (const f of FIXTURES) {
    const rows = byFixtureFinal.get(f.path) ?? [];
    console.log(`${f.path.padEnd(60)} count=${rows.length}`);
    for (const r of rows) {
      console.log(`    col0="${r.col0}" block="${r.block}" ${r.matchType}(${r.via}) -> "${r.vocabEntry}"`);
    }
  }

  writeFileSync(
    ".claude/tmp/near-miss-followup.json",
    JSON.stringify(
      {
        partA: {
          firingsV0Count: firingsV0.length,
          totalUnconsumed,
          totalOfflabel,
          totalOtherKey,
          staysCandidate: totalUnconsumed + totalOfflabel,
          dropsGenuineFP: totalOtherKey,
          byGroup: [...groupTally.entries()].map(([g, v]) => ({
            group: g,
            unconsumed: v.unconsumed,
            consumedOfflabel: v.offlabel,
            consumedOtherKey: v.otherKey,
            rows: v.rows.map((r) => ({
              fixture: r.fixture,
              col0: r.col0,
              verdict: r.verdict,
              changedKeys: r.changedKeys,
            })),
          })),
        },
        partB: {
          vocabV3Size: vocabV3.length,
          firingsV3Count: firingsV3.length,
          tp: tpV3.length,
          extra: extraV3.length,
          fp: fpV3.length,
          newlyRecovered: newlyRecovered.map(fmtFiring),
          lost: lost.map(fmtFiring),
        },
        partC: {
          v3Firings: firingsV3.length,
          droppedOtherKey: droppedV3.length,
          keptFinal: finalSet.length,
          droppedRows: droppedV3.map((r) => ({
            fixture: r.fixture,
            col0: r.col0,
            block: r.block,
            changedKeys: r.changedKeys,
          })),
          perFixture: FIXTURES.map((f) => ({
            fixture: f.path,
            rows: (byFixtureFinal.get(f.path) ?? []).map((r) => ({
              col0: r.col0,
              block: r.block,
              matchType: r.matchType,
              via: r.via,
              vocabEntry: r.vocabEntry,
              verdict: r.verdict,
            })),
          })),
        },
      },
      null,
      2,
    ),
  );

  // ═══════════════════════════ PART D ═══════════════════════════
  // RESOLUTION-SITE consumption semantics (cross-model r4 finding 3 repair measurement).
  // Part C's deletion-diff cannot see "resolved to a curated key but value empty/filtered":
  // deleting such a row changes no payload, so it reads UNCONSUMED and stays a candidate —
  // and the detector then reports a correctly named curated field as a near-miss of itself.
  // New semantics: a row is consumed iff a block parser RESOLVES its label to a curated
  // canonical key, regardless of whether a payload value was written. Fallback self-slug
  // storage still never consumes (Stage/Storage stay candidates).
  // Simulation for this corpus: event.ts is the only curated resolver whose blocks hold
  // retained rows (contacts/transport rows were already CONSUMED_OTHER_KEY-dropped in Part C).
  // Event scope = block opener is an event SECTION_HEADER_TOKENS member (uppercased exact);
  // resolution = CANONICAL_KEY_MAP exact hit OR gatedVocabCorrect into EVENT_LABEL_VOCAB.
  console.log("\n\n=== PART D: RESOLUTION-SITE CONSUMPTION (r4-finding-3 semantics) ===");
  const EVENT_SCOPE = new Set<string>(EVENT_TOKENS.map((t) => t.toUpperCase()));
  const resolvesCurated = (col0: string): string | null => {
    const exact = EVENT_CANONICAL_KEY_MAP[col0.toLowerCase().trim()];
    if (exact !== undefined) return `exact:${exact}`;
    // EVENT_GATE_OPTS replicated (event.ts:130-131 keeps it module-private): the exclude list
    // must match or the fuzzy path over-consumes labels event.ts refuses to correct.
    const fix = gatedVocabCorrect(col0.toUpperCase(), EVENT_LABEL_VOCAB, {
      minLen: 5,
      tieAbort: true,
      exclude: ["LED", "LEAD", "DATE", "DAY", "ROOM", "TBD", "TBA", "N/A"],
    });
    if (fix?.corrected) {
      const canon = EVENT_CANONICAL_KEY_MAP[fix.match.toLowerCase()];
      if (canon) return `fuzzy:${canon}`;
    }
    return null;
  };
  const partD = finalSet.map((r) => {
    const inEventScope = EVENT_SCOPE.has(r.block.toUpperCase().trim());
    const res = inEventScope ? resolvesCurated(r.col0) : null;
    return { ...r, resolutionDrop: res !== null, resolution: res };
  });
  const droppedD = partD.filter((r) => r.resolutionDrop);
  const keptD = partD.filter((r) => !r.resolutionDrop);
  console.log(`Part C kept: ${finalSet.length}; resolution-site drops: ${droppedD.length}; NEW BASELINE: ${keptD.length}`);
  for (const d of droppedD) console.log(`    DROP ${fmtFiring(d)}  resolution=${d.resolution}`);
  console.log("\n--- resolution-site definitive set per fixture ---");
  for (const f of FIXTURES) {
    const rows = keptD.filter((r) => r.fixture === f.path);
    console.log(`${f.path.padEnd(60)} count=${rows.length}`);
    for (const r of rows) console.log(`    col0="${r.col0}" block="${r.block}" ${r.matchType}(${r.via}) -> "${r.vocabEntry}"`);
  }
  const tally = new Map<string, number>();
  for (const r of keptD) tally.set(r.col0, (tally.get(r.col0) ?? 0) + 1);
  console.log("\n--- resolution-site composition by col0 ---");
  for (const [k, v] of [...tally.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
  const rdTimestamp = keptD.filter((r) => r.col0 === "Room Diagram" && r.block === "Timestamp").length;
  const rdDetails = keptD.filter((r) => r.col0 === "Room Diagram" && r.block !== "Timestamp").length;
  console.log(`\nSUMMARY-D room_diagram_timestamp=${rdTimestamp} room_diagram_details=${rdDetails} new_total=${keptD.length}`);
  writeFileSync(
    ".claude/tmp/near-miss-partD.json",
    JSON.stringify(
      {
        newTotal: keptD.length,
        resolutionDrops: droppedD.map((r) => ({ fixture: r.fixture, col0: r.col0, block: r.block, resolution: r.resolution })),
        kept: keptD.map((r) => ({ fixture: r.fixture, col0: r.col0, block: r.block, matchType: r.matchType, via: r.via, vocabEntry: r.vocabEntry })),
      },
      null,
      2,
    ),
  );
}

main();
