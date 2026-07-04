import { resolveAlias } from "@/lib/parser/aliases";

/**
 * A version requirement satisfied by finding a cell label whose resolved
 * canonical key matches `alias`, or by finding a literal block-header string
 * matching `block`.
 */
type VersionRequirement = { alias: string } | { block: string };

type VersionEntry =
  | { id: "v4" | "v2"; requires: VersionRequirement[] }
  | { id: "v1"; fallback: true };

/**
 * Version registry -- evaluated in order (v4 -> v2 -> v1 fallback).
 *
 * v3 was removed per amendment 4 (see 00-overview.md): no fixture in
 * fixtures/shows/raw/*.md contains the spec's declared v3 marker
 * ("block:GEAR INVENTORY"), and every non-v4 fixture has the v2 marker
 * ("Hotel Contact Info" / typo "Hotal Contact Info"). If a genuine v3 sheet
 * surfaces, re-introduce the entry here per §6.4's extensibility note.
 *
 * Marker choices are grounded in actual corpus fixture content:
 *
 *   v4 -- "Contact Office" row (verified 2026-03-rpas-central-four-seasons.md:6).
 *         Per amendment 5 (00-overview.md): v4 detection uses Contact Office row as a
 *         single marker. The spec's secondary "MAIN/SECONDARY block" marker (§6.4
 *         pre-amendment) does not appear as a literal string in any corpus fixture
 *         (only as adjacent table columns in 2/4 v4 fixtures). Contact Office is
 *         100% reliable across the v4 corpus.
 *
 *   v2 -- venue.contact_info ("Hotel Contact Info" or typo "Hotal Contact Info"),
 *         per spec §6.4 "row:Hotel Contact Info" (verified
 *         2025-03-dci-rpas-central.md:236). The 2024-05-east-coast fixture also
 *         contains "Hotal Contact Info" at line 23 and correctly classifies as v2.
 *
 *   v1 -- fallback when markdown table syntax is present but no v2/v4 markers.
 */
const VERSIONS: VersionEntry[] = [
  {
    id: "v4",
    requires: [{ alias: "client.contact_office" /* "Contact Office" row */ }],
  },
  {
    id: "v2",
    requires: [
      {
        alias:
          "venue.contact_info" /* "Hotel Contact Info" OR typo "Hotal Contact Info" -- resolved via FIELD_ALIASES */,
      },
    ],
  },
  { id: "v1", fallback: true },
];

/**
 * Extract every pipe-delimited cell label from all markdown table rows.
 * Returns the trimmed text of each non-separator cell.
 */
function extractCellLabels(markdown: string): string[] {
  const labels: string[] = [];
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    // Skip alignment/separator rows
    if (!trimmed.startsWith("|")) continue;
    if (/^\|[\s:|*-]+\|/.test(trimmed)) continue;
    // Split on pipes, drop first/last empty segments
    const cells = trimmed.split("|");
    for (const cell of cells) {
      const label = cell.trim();
      if (label.length > 0) {
        labels.push(label);
      }
    }
  }
  return labels;
}

/**
 * True when the markdown looks like a sheet (contains at least one table row).
 * Used as the v1 fallback signal.
 */
function looksLikeSheet(markdown: string): boolean {
  return /^\|/m.test(markdown);
}

// ---- Confidence-scoring markers (spec §5) ---------------------------------
// Matched by strict physical column-0 equality (spec §4.1). Each version's
// markers span 3 independent blocks; the block-diversity clause requires >=2.
const V4_BLOCKS: Record<string, readonly string[]> = {
  contact: ["CONTACT OFFICE", "CONTACT CELL", "CONTACT EMAIL"],
  rental: ["RENTAL PICKUP", "RENTAL RETURN"],
  logistics: ["LOAD AT WAREHOUSE", "UNLOAD AT WAREHOUSE", "LOAD IN AT VENUE"],
};
const V2_BLOCKS: Record<string, readonly string[]> = {
  hotel_contact: ["HOTAL CONTACT INFO"],
  gs_timing: ["GS SET TIME", "GS SETUP", "GS STRIKE TIME"],
  bo_timing: ["BO SET TIME", "BO SETUP", "BO STRIKE TIME"],
};

export const MIN_ABS = 2;
export const MIN_MARGIN = 2;
export const MIN_BLOCKS = 2;

export type VersionScores = { v4: number; v2: number };
export type VersionVerdict =
  | { status: "confident"; version: "v1" | "v2" | "v4"; scores: VersionScores }
  | { status: "ambiguous"; bestGuess: "v1" | "v2" | "v4"; scores: VersionScores; reason: string }
  | { status: "not_a_sheet" };

function normalizeLabel(cell: string): string {
  return cell.trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * Strict physical column-0 label cells: the first cell immediately after the
 * leading pipe of every table row (split("|")[1]), normalized. An empty
 * physical column 0 contributes NO label -- so a marker in a value cell
 * (column 1+) or a blank-col-0 row cannot inflate confidence (spec §4.1).
 */
function extractLabelCells(markdown: string): Set<string> {
  const labels = new Set<string>();
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    if (/^\|[\s:|*-]+\|/.test(trimmed)) continue; // separator row
    const parts = trimmed.split("|"); // ["", col0, col1, ..., ""]
    const rawCol0 = parts[1]; // first physical cell after the leading pipe
    if (rawCol0 === undefined) continue;
    const col0 = normalizeLabel(rawCol0);
    if (col0.length > 0) labels.add(col0);
  }
  return labels;
}

function scoreBlocks(
  labels: Set<string>,
  blocks: Record<string, readonly string[]>,
): { score: number; blocks: number } {
  let score = 0;
  let blockCount = 0;
  for (const markers of Object.values(blocks)) {
    let hit = 0;
    for (const m of markers) if (labels.has(m)) hit++;
    score += hit;
    if (hit > 0) blockCount++;
  }
  return { score, blocks: blockCount };
}

/**
 * Legacy priority-order best-guess (v4 alias -> v2 alias -> v1 fallback),
 * extracted verbatim from the pre-confidence detectVersion so its behavior --
 * and the block-parser tests that call detectVersion -- are unchanged.
 */
function legacyBestGuess(markdown: string): "v1" | "v2" | "v4" {
  const resolvedCanonicals = new Set<string>();
  for (const label of extractCellLabels(markdown)) {
    const canonical = resolveAlias(label);
    if (canonical !== null) resolvedCanonicals.add(canonical);
  }
  for (const entry of VERSIONS) {
    if ("fallback" in entry) return "v1";
    const allSatisfied = entry.requires.every((req) =>
      "alias" in req ? resolvedCanonicals.has(req.alias) : markdown.includes(req.block),
    );
    if (allSatisfied) return entry.id;
  }
  return "v1";
}

/**
 * Confidence-scored version detection (spec §4.1). Scores strict-col-0 labels
 * against block-tagged v4/v2 markers; "confident" requires score >= MIN_ABS,
 * margin >= MIN_MARGIN, AND markers from >= MIN_BLOCKS distinct blocks.
 */
export function classifyVersion(markdown: string): VersionVerdict {
  if (!looksLikeSheet(markdown)) return { status: "not_a_sheet" };
  const labels = extractLabelCells(markdown);
  const v4 = scoreBlocks(labels, V4_BLOCKS);
  const v2 = scoreBlocks(labels, V2_BLOCKS);
  const scores: VersionScores = { v4: v4.score, v2: v2.score };
  const topIsV4 = v4.score >= v2.score;
  const top = topIsV4 ? v4 : v2;
  const runnerScore = topIsV4 ? v2.score : v4.score;
  const confident =
    top.score >= MIN_ABS && top.score - runnerScore >= MIN_MARGIN && top.blocks >= MIN_BLOCKS;
  if (confident) {
    return { status: "confident", version: topIsV4 ? "v4" : "v2", scores };
  }
  return {
    status: "ambiguous",
    bestGuess: legacyBestGuess(markdown),
    scores,
    reason: `v4=${v4.score} v2=${v2.score} (blocks v4=${v4.blocks} v2=${v2.blocks})`,
  };
}

/**
 * Best-guess version (unchanged public signature). Confident verdicts return
 * the detected version; ambiguous returns the legacy best guess; not-a-sheet
 * returns null. parseSheet uses classifyVersion directly for the hard-flag.
 */
export function detectVersion(markdown: string): "v1" | "v2" | "v4" | null {
  const v = classifyVersion(markdown);
  if (v.status === "not_a_sheet") return null;
  return v.status === "confident" ? v.version : v.bestGuess;
}
