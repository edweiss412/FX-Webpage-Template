// Calibration probe for the proposed FIELD NEAR-MISS detector rule v0 (+ guard iterations).
//
// Candidate rows: every pipe row in the document whose col-0 (trimmed) is non-empty and
// resolves to NOTHING today:
//   - not a recognized field alias:      resolveAlias(col0) === null          (lib/parser/aliases.ts)
//   - not a section header (any of):     isKnownSectionHeader(col0) === false (lib/parser/knownSections.ts,
//                                         covers KNOWN_SECTION_HEADERS exact + PREFIX_SECTION_FAMILIES prefix,
//                                         which is a verified SUPERSET of every block parser's own
//                                         SECTION_HEADER_TOKENS export — see note below)
//                                         canonicalSectionKind(col0) === null (lib/parser/sectionKind.ts,
//                                         covers LABEL_TO_KIND exact + ROOM_FAMILY_PREFIXES prefix)
// Position never enters (no block/scope awareness in the exclusion or the match step).
//
// Vocabulary: DERIVED, not hand-picked —
//   (1) every FIELD_ALIASES value string (lib/parser/aliases.ts)
//   (2) the union of every block parser's exported SECTION_HEADER_TOKENS
//       (client.ts, dates.ts, dress.ts, crew.ts, event.ts, venue.ts, transport.ts, rooms.ts, hotels.ts —
//        verified by `grep -n "SECTION_HEADER_TOKENS" lib/parser/blocks/*.ts` to be the complete export list)
//   (3) LABEL_TO_KIND's keys (lib/parser/sectionKind.ts:33-55). NOT exported from that module (only
//       canonicalSectionKind/EMITTABLE_KINDS/isRoutingKey are), so the 21 keys are transcribed here
//       verbatim and sanity-checked at runtime: every transcribed key must round-trip through the
//       real canonicalSectionKind() to a non-null kind, or the probe aborts loudly.
//
// Normalization (both candidate col0 and vocabulary strings, so match is symmetric):
//   decode &#10;/&#9; entities -> space (reuses lib/parser/blocks/_helpers.ts decodeEntities, the
//   same function the real parser uses at value-storage time) -> collapse internal whitespace ->
//   strip a single trailing colon -> casefold -> trim.
//
// Match:
//   (a) normalized-equal to a vocabulary entry's normalized form
//   (b) token-subset: candidate's token set (split normalized string on non-alnum) is a NON-EMPTY
//       PROPER subset of some vocabulary entry's token set (proper = strictly fewer tokens; equal
//       token sets are always already caught by (a) whenever the normalized strings agree, and are
//       otherwise reported separately as an ANOMALY so the probe never silently swallows one).
//
// Guard iterations are applied as additional post-filters on top of the same match step (kept
// as named, toggleable predicates so the "what did guard X change" table is exact, not eyeballed).

import { readFileSync, writeFileSync } from "node:fs";
import { resolveAlias } from "@/lib/parser/aliases";
import { FIELD_ALIASES } from "@/lib/parser/aliases";
import { isKnownSectionHeader, KNOWN_SECTION_HEADERS } from "@/lib/parser/knownSections";
import { canonicalSectionKind } from "@/lib/parser/sectionKind";
import { decodeEntities, parseTableRows } from "@/lib/parser/blocks/_helpers";
import { SECTION_HEADER_TOKENS as CLIENT_TOKENS } from "@/lib/parser/blocks/client";
import { SECTION_HEADER_TOKENS as DATES_TOKENS } from "@/lib/parser/blocks/dates";
import { SECTION_HEADER_TOKENS as DRESS_TOKENS } from "@/lib/parser/blocks/dress";
import { SECTION_HEADER_TOKENS as CREW_TOKENS } from "@/lib/parser/blocks/crew";
import { SECTION_HEADER_TOKENS as EVENT_TOKENS } from "@/lib/parser/blocks/event";
import { SECTION_HEADER_TOKENS as VENUE_TOKENS } from "@/lib/parser/blocks/venue";
import { SECTION_HEADER_TOKENS as TRANSPORT_TOKENS } from "@/lib/parser/blocks/transport";
import { SECTION_HEADER_TOKENS as ROOMS_TOKENS } from "@/lib/parser/blocks/rooms";
import { SECTION_HEADER_TOKENS as HOTELS_TOKENS } from "@/lib/parser/blocks/hotels";
import { FIXTURES, readFixture, type FixtureRef } from "@/tests/parser/mutation/fixtures";

// ── LABEL_TO_KIND keys, transcribed from lib/parser/sectionKind.ts:33-55 (not exported). ──
const LABEL_TO_KIND_KEYS = [
  "CREW",
  "TECH",
  "HOTEL",
  "HOTELS",
  "HOTEL RESERVATIONS",
  "HOTEL RESERVATION",
  "HOTEL STAYS",
  "HOTEL STAY",
  "TRANSPORTATION",
  "DRIVER",
  "EVENT DETAILS",
  "DETAILS",
  "DETAILS/ROOM DIAGRAM",
  "DATES",
  "VENUE",
  "VENUES",
  "AGENDA",
  "AGENDA LINK",
  "CLIENT",
  "DRESS",
  "PULL SHEET",
];
for (const key of LABEL_TO_KIND_KEYS) {
  if (canonicalSectionKind(key) === null) {
    throw new Error(`LABEL_TO_KIND_KEYS transcription is stale: "${key}" no longer resolves`);
  }
}

// ── Verify block-level SECTION_HEADER_TOKENS union ⊆ KNOWN_SECTION_HEADERS (so
//    isKnownSectionHeader is a safe stand-in for "any block parser's SECTION_HEADER_TOKENS"
//    in the exclusion check). Abort loudly if not — silent narrowing is worse than a crash. ──
const BLOCK_SECTION_HEADER_TOKENS: string[] = [
  ...CLIENT_TOKENS,
  ...DATES_TOKENS,
  ...DRESS_TOKENS,
  ...CREW_TOKENS,
  ...EVENT_TOKENS,
  ...VENUE_TOKENS,
  ...TRANSPORT_TOKENS,
  ...ROOMS_TOKENS,
  ...HOTELS_TOKENS,
];
for (const tok of BLOCK_SECTION_HEADER_TOKENS) {
  if (!KNOWN_SECTION_HEADERS.has(tok.toUpperCase())) {
    throw new Error(
      `Block SECTION_HEADER_TOKENS "${tok}" is NOT in KNOWN_SECTION_HEADERS — isKnownSectionHeader ` +
        `exclusion check is unsafe; add it to the exclusion predicate explicitly.`,
    );
  }
}

// ── Normalization ──
function normalize(raw: string): string {
  let s = decodeEntities(raw);
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(/:\s*$/, "").trim();
  s = s.toLowerCase();
  return s;
}
function tokenize(normalized: string): Set<string> {
  return new Set(normalized.split(/[^a-z0-9]+/).filter(Boolean));
}

// ── Vocabulary ──
type VocabEntry = { raw: string; normalized: string; tokens: Set<string>; source: string };

function buildVocabulary(): VocabEntry[] {
  const raw: Array<{ text: string; source: string }> = [];
  for (const [canon, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const a of aliases) raw.push({ text: a, source: `alias:${canon}` });
  }
  for (const t of BLOCK_SECTION_HEADER_TOKENS) raw.push({ text: t, source: "block-section-header" });
  for (const k of LABEL_TO_KIND_KEYS) raw.push({ text: k, source: "label-to-kind" });

  const byNormalized = new Map<string, VocabEntry>();
  for (const { text, source } of raw) {
    const normalized = normalize(text);
    if (normalized.length === 0) continue;
    const existing = byNormalized.get(normalized);
    if (existing) {
      if (!existing.source.includes(source)) existing.source += `,${source}`;
      continue;
    }
    byNormalized.set(normalized, { raw: text, normalized, tokens: tokenize(normalized), source });
  }
  return [...byNormalized.values()];
}

// ── Candidate exclusion (== "resolves to nothing today") ──
function isCandidate(col0: string): boolean {
  if (col0.trim() === "") return false;
  if (resolveAlias(col0) !== null) return false;
  if (isKnownSectionHeader(col0)) return false;
  if (canonicalSectionKind(col0) !== null) return false;
  return true;
}

// ── Match ──
type MatchResult = { type: "a" | "b"; vocab: VocabEntry } | null;

function matchAgainstVocab(candidateNormalized: string, vocab: VocabEntry[]): MatchResult {
  for (const v of vocab) {
    if (v.normalized === candidateNormalized) return { type: "a", vocab: v };
  }
  const candTokens = tokenize(candidateNormalized);
  if (candTokens.size === 0) return null;
  for (const v of vocab) {
    if (candTokens.size >= v.tokens.size) continue; // not proper-subset-sized
    let subset = true;
    for (const t of candTokens) {
      if (!v.tokens.has(t)) {
        subset = false;
        break;
      }
    }
    if (subset) return { type: "b", vocab: v };
  }
  return null;
}

// ── Guards (named, toggleable) ──
interface Guards {
  minNormalizedLen: number; // 0 = off
  requireMultiTokenForSubset: boolean;
  requireDistinctiveToken: number; // 0 = off; else max # of vocab entries a token may appear in to count as "distinctive"
  excludeAllCapsGenericSingleWord: boolean;
  requireBlockOpenerRecognized: boolean; // block's own opening col0 must itself be a non-candidate (i.e. already resolves via alias/section-header/kind)
}
const NO_GUARDS: Guards = {
  minNormalizedLen: 0,
  requireMultiTokenForSubset: false,
  requireDistinctiveToken: 0,
  excludeAllCapsGenericSingleWord: false,
  requireBlockOpenerRecognized: false,
};

function tokenDocFrequency(vocab: VocabEntry[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const v of vocab) {
    for (const t of v.tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  return freq;
}

function passesGuards(
  rawCol0: string,
  candidateNormalized: string,
  match: MatchResult,
  guards: Guards,
  freq: Map<string, number>,
  blockOpenerCol0: string,
): { pass: boolean; reason?: string } {
  if (!match) return { pass: false, reason: "no-match" };
  if (guards.minNormalizedLen > 0 && candidateNormalized.length < guards.minNormalizedLen) {
    return { pass: false, reason: `min-length<${guards.minNormalizedLen}` };
  }
  const candTokens = tokenize(candidateNormalized);
  if (guards.requireMultiTokenForSubset && match.type === "b" && candTokens.size < 2) {
    return { pass: false, reason: "subset-match-requires-multi-token" };
  }
  if (guards.requireBlockOpenerRecognized && isCandidate(blockOpenerCol0)) {
    return { pass: false, reason: "block-opener-unrecognized" };
  }
  if (guards.requireDistinctiveToken > 0) {
    const hasDistinctive = [...candTokens].some(
      (t) => (freq.get(t) ?? Infinity) <= guards.requireDistinctiveToken,
    );
    if (!hasDistinctive) return { pass: false, reason: "no-distinctive-token" };
  }
  if (guards.excludeAllCapsGenericSingleWord) {
    const isAllCapsSingleWord = /^[A-Z0-9&/#'.\-]+$/.test(rawCol0.trim()) && candTokens.size === 1;
    if (isAllCapsSingleWord) return { pass: false, reason: "all-caps-generic-single-word" };
  }
  return { pass: true };
}

// ── Corpus scan ──
type Firing = {
  fixture: string;
  col0: string;
  block: string;
  matchType: "a" | "b";
  vocabEntry: string;
  vocabSource: string;
  rowIndex: number; // index into parseTableRows(md) — the flat row list — for line-precise deletion
};
type Suppressed = Firing & { reason: string };

function blockLabelsAndMap(md: string): { blocks: string[]; rowToBlock: number[]; flatRows: string[][] } {
  const blocks = md.split(/\n\s*\n/);
  const blockRowCounts = blocks.map((b) => parseTableRows(b).length);
  const flatRows = parseTableRows(md);
  const flatFromBlocks = blocks.flatMap((b) => parseTableRows(b));
  if (
    flatFromBlocks.length !== flatRows.length ||
    !flatFromBlocks.every((r, i) => r.join("|") === flatRows[i]!.join("|"))
  ) {
    throw new Error("block-split / flat-parse mismatch — cannot attribute rows to blocks safely");
  }
  const rowToBlock: number[] = [];
  {
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
  }
  return { blocks, rowToBlock, flatRows };
}

function blockLabel(blocks: string[], idx: number): string {
  const text = blocks[idx] ?? "";
  const rows = parseTableRows(text);
  const firstLine = text.trim().split("\n")[0] ?? "";
  return (rows[0]?.[0] ?? firstLine).trim() || "(blank col0)";
}

/** Raw (un-fallback'd) col0 of the block's first pipe row — "" when the block has no
 *  pipe rows at all. Feeds the requireBlockOpenerRecognized guard, which needs the
 *  actual isCandidate() input, not the display fallback blockLabel() substitutes. */
function blockOpenerCol0(blocks: string[], idx: number): string {
  const text = blocks[idx] ?? "";
  const rows = parseTableRows(text);
  return rows[0]?.[0] ?? "";
}

function scanFixture(
  f: FixtureRef,
  vocab: VocabEntry[],
  guards: Guards,
  freq: Map<string, number>,
): {
  fixture: string;
  candidateCount: number;
  firings: Firing[];
  suppressed: Suppressed[];
} {
  const md = readFixture(f);
  const { blocks, rowToBlock, flatRows } = blockLabelsAndMap(md);

  let candidateCount = 0;
  const firings: Firing[] = [];
  const suppressed: Suppressed[] = [];

  for (let i = 0; i < flatRows.length; i++) {
    const row = flatRows[i]!;
    const col0 = row[0] ?? "";
    if (!isCandidate(col0)) continue;
    candidateCount++;
    const normalized = normalize(col0);
    const match = matchAgainstVocab(normalized, vocab);
    const opener = blockOpenerCol0(blocks, rowToBlock[i]!);
    const gate = passesGuards(col0, normalized, match, guards, freq, opener);
    const block = blockLabel(blocks, rowToBlock[i]!);
    if (gate.pass && match) {
      firings.push({
        fixture: f.path,
        col0,
        block,
        matchType: match.type,
        vocabEntry: match.vocab.raw,
        vocabSource: match.vocab.source,
        rowIndex: i,
      });
    } else if (match) {
      // matched but a guard suppressed it — record for guard-impact accounting
      suppressed.push({
        fixture: f.path,
        col0,
        block,
        matchType: match.type,
        vocabEntry: match.vocab.raw,
        vocabSource: match.vocab.source,
        rowIndex: i,
        reason: gate.reason ?? "unknown",
      });
    }
  }
  return { fixture: f.path, candidateCount, firings, suppressed };
}

function runCorpus(vocab: VocabEntry[], guards: Guards) {
  const freq = tokenDocFrequency(vocab);
  const perFixture = FIXTURES.map((f) => scanFixture(f, vocab, guards, freq));
  const totalCandidates = perFixture.reduce((s, r) => s + r.candidateCount, 0);
  const totalFirings = perFixture.reduce((s, r) => s + r.firings.length, 0);
  const totalSuppressed = perFixture.reduce((s, r) => s + r.suppressed.length, 0);
  return { perFixture, totalCandidates, totalFirings, totalSuppressed };
}

// ── Expected TRUE POSITIVE set (from .claude/tmp/unknown-field-narrowing-audit.md) ──
// The 8-row Client:/Contact: colon-suffixed group + Stage/Storage in DETAILS (2 fixtures each) +
// the 2-row ADDITIONAL ROOM entity-encoded header, ALL located in the ONE originally-audited
// fixture/location each came from (raw/2025-10-consultants-roundtable.md for the Client: group;
// raw/2024-05-east-coast-family-office.md + xlsx/east-coast.md for Stage/Storage;
// raw/2025-03-dci-rpas-central.md + raw/2025-04-asset-mgmt-cfo-coo.md for ADDITIONAL ROOM/Other).
const EXPECTED_TP: Array<{ fixture: string; col0: string }> = [
  // NOT "Client:" alone — this fixture's col0 is the FUSED v1-style header "Client:/Contact:"
  // (confirmed via parseTableRows; the original audit's JSON key was "Client:/Contact:", not "Client:").
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", col0: "Client:/Contact:" },
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", col0: "Address:" },
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", col0: "Phone:" },
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", col0: "Cell Phone:" },
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", col0: "Fax:" },
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", col0: "E-mail:" },
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", col0: "ALT. E-mail:" },
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", col0: "Event Name:" },
  { fixture: "fixtures/shows/raw/2024-05-east-coast-family-office.md", col0: "Stage" },
  { fixture: "fixtures/shows/raw/2024-05-east-coast-family-office.md", col0: "Storage" },
  { fixture: "fixtures/shows/exporter-xlsx/east-coast.md", col0: "Stage" },
  { fixture: "fixtures/shows/exporter-xlsx/east-coast.md", col0: "Storage" },
  { fixture: "fixtures/shows/raw/2025-03-dci-rpas-central.md", col0: "ADDITIONAL ROOM&#10;Dimensions&#10;Floor" },
  { fixture: "fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md", col0: "ADDITIONAL ROOM&#10;Dimensions&#10;Floor" },
];
// NOTE: the audit's JSON showed count=1 for "ADDITIONAL ROOM&#10;..." header text total across the
// corpus, and count=1 for "Other" total — but TWO fixtures contain the literal header text
// (grep above). Re-derive precisely inside main() rather than trust this hand list blindly.

const EXPECTED_TP_OTHER: Array<{ fixture: string; col0: string }> = [
  { fixture: "fixtures/shows/raw/2025-03-dci-rpas-central.md", col0: "Other" },
  { fixture: "fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md", col0: "Other" },
];

function keyOf(fixture: string, col0: string): string {
  return `${fixture}::${col0}`;
}

function classify(
  firings: Firing[],
  expectedSet: Set<string>,
): { tp: Firing[]; extra: Firing[]; fp: Firing[] } {
  const tp: Firing[] = [];
  const extra: Firing[] = [];
  const fp: Firing[] = [];
  for (const f of firings) {
    if (expectedSet.has(keyOf(f.fixture, f.col0))) {
      tp.push(f);
    } else {
      // Same lexical CLASS as a confirmed TP but a different fixture (e.g. "Client:"/"Phone:"
      // pattern repeats in 8 more fixtures untouched by the original UNKNOWN_FIELD audit
      // because those fixtures' live parser already resolves it via a different code path).
      // Still a genuine near-miss of client.* — not noise — so it's tracked separately, not
      // silently folded into either TP or FP.
      const CLIENT_CONTACT_SHAPE = new Set([
        "client:",
        "address:",
        "phone:",
        "cell phone:",
        "fax:",
        "e-mail:",
        "alt. e-mail:",
        "event name:",
      ]);
      if (CLIENT_CONTACT_SHAPE.has(f.col0.trim().toLowerCase())) {
        extra.push(f);
      } else {
        fp.push(f);
      }
    }
  }
  return { tp, extra, fp };
}

function fmtFiring(f: Firing): string {
  return `${f.fixture} | col0="${f.col0}" | block="${f.block}" | ${f.matchType} -> "${f.vocabEntry}" [${f.vocabSource}]`;
}

function main() {
  const vocab = buildVocabulary();
  const freqDiag = tokenDocFrequency(vocab);
  console.log("=== TOKEN DOC-FREQUENCY DIAGNOSTIC (tokens seen in v0 firings) ===");
  for (const t of [
    "name",
    "notes",
    "speaker",
    "contact",
    "stage",
    "storage",
    "backdrop",
    "scenic",
    "room",
    "diagram",
    "load",
    "in",
    "at",
    "venue",
    "address",
    "phone",
    "client",
    "office",
    "cell",
    "fax",
    "mail",
    "event",
  ]) {
    console.log(`  "${t}": ${freqDiag.get(t) ?? 0}`);
  }
  console.log("=== VOCAB ===");
  console.log("distinct normalized vocabulary entries:", vocab.length);
  const rawAliasCount = Object.values(FIELD_ALIASES).flat().length;
  console.log("  raw alias strings (pre-dedup):", rawAliasCount);
  console.log("  raw block SECTION_HEADER_TOKENS (pre-dedup):", BLOCK_SECTION_HEADER_TOKENS.length);
  console.log("  raw LABEL_TO_KIND keys (pre-dedup):", LABEL_TO_KIND_KEYS.length);
  console.log(
    "  raw total pre-dedup:",
    rawAliasCount + BLOCK_SECTION_HEADER_TOKENS.length + LABEL_TO_KIND_KEYS.length,
  );

  const expectedSet = new Set(EXPECTED_TP.map((e) => keyOf(e.fixture, e.col0)));
  const expectedOtherSet = new Set(EXPECTED_TP_OTHER.map((e) => keyOf(e.fixture, e.col0)));

  const variants: Array<{ name: string; guards: Guards }> = [
    { name: "v0 (no guards)", guards: NO_GUARDS },
    {
      name: "v1 (+ minNormalizedLen>=5)",
      guards: { ...NO_GUARDS, minNormalizedLen: 5 },
    },
    {
      name: "v2 (+ excludeAllCapsGenericSingleWord)",
      guards: { ...NO_GUARDS, minNormalizedLen: 5, excludeAllCapsGenericSingleWord: true },
    },
    {
      name: "v3-rejected (+ requireBlockOpenerRecognized)",
      guards: {
        ...NO_GUARDS,
        minNormalizedLen: 5,
        excludeAllCapsGenericSingleWord: true,
        requireBlockOpenerRecognized: true,
      },
    },
    {
      // Rejected before shipping: task-suggested guard "require multi-token candidates for
      // subset matches" — tested here to get real numbers rather than assert by hand.
      name: "v-rejected-multitoken (v2 + requireMultiTokenForSubset)",
      guards: {
        ...NO_GUARDS,
        minNormalizedLen: 5,
        excludeAllCapsGenericSingleWord: true,
        requireMultiTokenForSubset: true,
      },
    },
    {
      // Rejected before shipping: task-suggested guard "distinctiveness" (candidate must contain
      // a token appearing in few vocab entries). threshold=1 (only vocab-unique tokens count).
      name: "v-rejected-distinctive1 (v2 + requireDistinctiveToken<=1)",
      guards: {
        ...NO_GUARDS,
        minNormalizedLen: 5,
        excludeAllCapsGenericSingleWord: true,
        requireDistinctiveToken: 1,
      },
    },
    {
      // Same guard, loosened to threshold=4 (the minimum that keeps "Address:" alive, since
      // "address" has vocab doc-frequency 4) — to show it ALSO keeps "Notes" alive (freq 2),
      // i.e. no threshold cleanly separates this corpus's TP from FP on this axis.
      name: "v-rejected-distinctive4 (v2 + requireDistinctiveToken<=4)",
      guards: {
        ...NO_GUARDS,
        minNormalizedLen: 5,
        excludeAllCapsGenericSingleWord: true,
        requireDistinctiveToken: 4,
      },
    },
  ];

  const dump: Record<string, unknown> = {};

  for (const { name, guards } of variants) {
    console.log(`\n\n########## RULE VARIANT: ${name} ##########`);
    const result = runCorpus(vocab, guards);
    console.log(`total candidate rows (stable across runs, checked below): ${result.totalCandidates}`);
    console.log(`total firings: ${result.totalFirings}`);
    console.log(`total guard-suppressed (matched but blocked): ${result.totalSuppressed}`);
    const allSuppressed = result.perFixture.flatMap((pf) => pf.suppressed);
    const byReason = new Map<string, number>();
    const byReasonKeys = new Map<string, Set<string>>();
    for (const s of allSuppressed) {
      byReason.set(s.reason, (byReason.get(s.reason) ?? 0) + 1);
      const set = byReasonKeys.get(s.reason) ?? new Set<string>();
      set.add(s.col0);
      byReasonKeys.set(s.reason, set);
    }
    for (const [reason, count] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(
        `  suppressed by "${reason}": ${count}  distinct col0 values: [${[...(byReasonKeys.get(reason) ?? [])].join(", ")}]`,
      );
    }

    console.log("\n--- per-fixture ---");
    for (const pf of result.perFixture) {
      console.log(
        `${pf.fixture.padEnd(60)} candidates=${pf.candidateCount.toString().padStart(4)} firings=${pf.firings.length
          .toString()
          .padStart(3)} suppressed=${pf.suppressed.length}`,
      );
    }

    const allFirings = result.perFixture.flatMap((pf) => pf.firings);
    const { tp, extra, fp } = classify(allFirings, expectedSet);

    console.log(`\n--- classification: TP=${tp.length} EXTRA(same-shape,other-fixture)=${extra.length} FP=${fp.length} ---`);
    console.log("\nTRUE POSITIVES:");
    for (const f of tp) console.log("  TP  " + fmtFiring(f));
    console.log("\nEXTRA (client-contact shape, additional fixture beyond the audited one):");
    for (const f of extra) console.log("  EXTRA " + fmtFiring(f));
    console.log("\nFALSE POSITIVES (noise):");
    for (const f of fp) console.log("  FP  " + fmtFiring(f));

    // Misses
    console.log("\n--- MISSES (expected TP not fired) ---");
    const firedKeys = new Set(allFirings.map((f) => keyOf(f.fixture, f.col0)));
    const misses: Array<{ fixture: string; col0: string; why: string }> = [];
    for (const e of EXPECTED_TP) {
      if (!firedKeys.has(keyOf(e.fixture, e.col0))) {
        // diagnose why
        const md = readFixture(FIXTURES.find((f) => f.path === e.fixture)!);
        const rows = parseTableRows(md);
        const row = rows.find((r) => (r[0] ?? "") === e.col0);
        let why = "row not found in parseTableRows output (col0 text mismatch)";
        if (row) {
          const col0 = row[0]!;
          if (!isCandidate(col0)) {
            const viaAlias = resolveAlias(col0) !== null;
            const viaSection = isKnownSectionHeader(col0);
            const viaKind = canonicalSectionKind(col0) !== null;
            why = `excluded pre-candidacy: resolveAlias=${viaAlias} isKnownSectionHeader=${viaSection} canonicalSectionKind=${viaKind}`;
          } else {
            const norm = normalize(col0);
            const match = matchAgainstVocab(norm, vocab);
            why = match
              ? `candidate + matched (${match.type} -> "${match.vocab.raw}") but guard-suppressed`
              : `candidate but NO vocabulary match (normalized="${norm}", tokens=[${[...tokenize(norm)].join(",")}])`;
          }
        }
        misses.push({ fixture: e.fixture, col0: e.col0, why });
        console.log(`  MISS  ${e.fixture} | col0="${e.col0}" -> ${why}`);
      }
    }
    for (const e of EXPECTED_TP_OTHER) {
      if (!firedKeys.has(keyOf(e.fixture, e.col0))) {
        const md = readFixture(FIXTURES.find((f) => f.path === e.fixture)!);
        const rows = parseTableRows(md);
        const row = rows.find((r) => (r[0] ?? "") === e.col0);
        let why = "row not found";
        if (row) {
          const col0 = row[0]!;
          if (!isCandidate(col0)) why = "excluded pre-candidacy (unexpected)";
          else {
            const norm = normalize(col0);
            const match = matchAgainstVocab(norm, vocab);
            why = match ? "matched but guard-suppressed" : `no vocabulary match (normalized="${norm}")`;
          }
        }
        console.log(`  MISS(other) ${e.fixture} | col0="${e.col0}" -> ${why}`);
      } else {
        console.log(`  HIT(other)  ${e.fixture} | col0="${e.col0}"`);
      }
    }

    dump[name] = {
      totalCandidates: result.totalCandidates,
      totalFirings: result.totalFirings,
      totalSuppressed: result.totalSuppressed,
      perFixture: result.perFixture.map((pf) => ({
        fixture: pf.fixture,
        candidates: pf.candidateCount,
        firings: pf.firings.length,
        suppressed: pf.suppressed.length,
      })),
      tp: tp.map(fmtFiring),
      extra: extra.map(fmtFiring),
      fp: fp.map(fmtFiring),
      misses,
    };
  }

  // stability check: run candidate counting twice, independently, compare
  console.log("\n\n=== STABILITY CHECK (rerun candidate counting) ===");
  const rerun = runCorpus(vocab, NO_GUARDS);
  const first = (dump["v0 (no guards)"] as { totalCandidates: number }).totalCandidates;
  console.log(`first run totalCandidates=${first} rerun totalCandidates=${rerun.totalCandidates} stable=${first === rerun.totalCandidates}`);

  writeFileSync(".claude/tmp/near-miss-calibration.json", JSON.stringify(dump, null, 2));
}

main();
