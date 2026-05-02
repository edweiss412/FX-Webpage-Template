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

/**
 * Detect the template version of a show markdown sheet.
 *
 * Algorithm:
 *   1. Extract all cell labels from markdown table rows.
 *   2. For each versioned entry in VERSIONS (v4 -> v2), check whether
 *      ALL requirements are satisfied:
 *      - { alias: canonical } -- any cell label resolves to `canonical` via
 *        resolveAlias (typo-aware; case-insensitive; whitespace-trimmed).
 *      - { block: text }      -- the literal text appears anywhere in the markdown.
 *   3. If a versioned entry matches, return its id.
 *   4. The v1 fallback fires only when the markdown looks like a sheet
 *      (contains table syntax) but no v2/v4 markers match.
 *      Completely unrecognizable input returns null.
 */
export function detectVersion(markdown: string): "v1" | "v2" | "v4" | null {
  const cellLabels = extractCellLabels(markdown);
  // Resolved canonical set -- built once; used for alias-based requirements.
  const resolvedCanonicals = new Set<string>();
  for (const label of cellLabels) {
    const canonical = resolveAlias(label);
    if (canonical !== null) {
      resolvedCanonicals.add(canonical);
    }
  }

  for (const entry of VERSIONS) {
    if ("fallback" in entry) {
      // v1 fallback: only fire when the input looks like a sheet
      return looksLikeSheet(markdown) ? "v1" : null;
    }

    const allSatisfied = entry.requires.every((req) => {
      if ("alias" in req) {
        return resolvedCanonicals.has(req.alias);
      }
      // block: literal string match anywhere in the markdown
      return markdown.includes(req.block);
    });

    if (allSatisfied) {
      return entry.id;
    }
  }

  // Unreachable: the loop always hits the v1 fallback entry.
  return null;
}
