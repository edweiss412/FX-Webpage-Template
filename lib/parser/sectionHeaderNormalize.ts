import type { ParseWarning } from "@/lib/parser/types";
import type { RegionId } from "@/lib/sheet-links/buildSheetDeepLink";
import { gatedVocabCorrect } from "@/lib/parser/typoGate";
import { splitRow } from "@/lib/parser/blocks/_helpers";
import { KNOWN_SECTION_HEADERS, KNOWN_SUB_LABELS, countFieldHeaderWords } from "@/lib/parser/knownSections";

/**
 * Long, distinctive section headers that are safe to fuzz at fieldBand 0 (no near-miss
 * real-word/plural neighbor). Short routers (CREW/TECH/HOTEL/VENUE) + weekdays are
 * deferred (spec §4.3). See docs/superpowers/specs/2026-06-27-parser-typo-tolerance-design.md.
 */
const LONG_SECTION_VOCAB = ["TRANSPORTATION", "EVENT DETAILS", "GS DETAILS"] as const;

const CANON_TO_REGION: Record<string, RegionId> = {
  TRANSPORTATION: "transportation",
  "EVENT DETAILS": "details",
  "GS DETAILS": "details",
};

// Cross-vocab exclusion: any other section header + the sub-labels (DATE/DAY/ROOM).
// A near-miss that is exactly one of these is NEVER fuzzed into a long section.
const EXCLUDE: readonly string[] = [
  ...[...KNOWN_SECTION_HEADERS].filter((h) => !(LONG_SECTION_VOCAB as readonly string[]).includes(h)),
  ...KNOWN_SUB_LABELS,
];

const isSeparatorRow = (cells: readonly string[]): boolean =>
  cells.every((c) => /^[\s:|*-]*$/.test(c));

/**
 * Pre-pass: correct a misspelled LONG section header (col0 of a header-shape table row)
 * to its canonical spelling so the section parses instead of being silently dropped.
 * GATED (spec §5/§8): (1) gatedVocabCorrect near-miss, (2) header-shape (label-only OR
 * ≥1 field-header word in the other cells — a data row is left untouched), (3) no exact
 * spelling of the canonical exists elsewhere in the doc. Returns the corrected markdown +
 * SECTION_HEADER_AUTOCORRECTED warnings. A no-op on correctly-spelled sheets (corpus guard).
 */
export function normalizeSectionHeaders(markdown: string): { corrected: string; warnings: ParseWarning[] } {
  const warnings: ParseWarning[] = [];
  const lines = markdown.split("\n");

  // First pass: every table row's col0 (uppercased) — to support noExactSpellingElsewhere.
  const allCol0Upper = new Set<string>();
  for (const line of lines) {
    if (!line.trim().startsWith("|")) continue;
    const cells = splitRow(line);
    if (cells.length === 0 || isSeparatorRow(cells)) continue;
    allCol0Upper.add((cells[0] ?? "").trim().toUpperCase());
  }

  const out = lines.map((line) => {
    if (!line.trim().startsWith("|")) return line;
    const cells = splitRow(line);
    if (cells.length === 0 || isSeparatorRow(cells)) return line;

    const col0 = (cells[0] ?? "").trim();
    const fix = gatedVocabCorrect(col0.toUpperCase(), LONG_SECTION_VOCAB, { exclude: EXCLUDE });
    if (!fix?.corrected) return line;
    const canonical = fix.match;

    // Header-shape gate: a section header row is label-only OR carries ≥1 field-header word.
    const otherCells = cells.slice(1);
    const labelOnly = otherCells.every((c) => c.trim() === "");
    if (!labelOnly && countFieldHeaderWords(otherCells) < 1) return line;

    // noExactSpellingElsewhere: never shadow a real, correctly-spelled header.
    if (allCol0Upper.has(canonical)) return line;

    // Rewrite ONLY the col0 segment, preserving pipe count + surrounding whitespace + other cells.
    const parts = line.split("|");
    const raw = parts[1] ?? "";
    const leadingWs = /^\s*/.exec(raw)?.[0] ?? "";
    const trailingWs = /\s*$/.exec(raw)?.[0] ?? "";
    parts[1] = leadingWs + canonical + trailingWs;

    warnings.push({
      severity: "warn",
      code: "SECTION_HEADER_AUTOCORRECTED",
      message: `Read likely-misspelled section header '${col0}' as '${canonical}'`,
      rawSnippet: col0,
      // canonical is always a LONG_SECTION_VOCAB member → always present in CANON_TO_REGION.
      blockRef: { kind: CANON_TO_REGION[canonical]!, index: 0 },
    });
    return parts.join("|");
  });

  return { corrected: out.join("\n"), warnings };
}
