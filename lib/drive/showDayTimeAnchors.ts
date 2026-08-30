import { WAVE_CODES, type WaveCode, type WavePairedAnchors } from "@/lib/drive/waveCodeAnchors";
import * as XLSX from "xlsx";
import { buildAbsGrid } from "@/lib/drive/sourceAnchors";
import { clean, normalizeDate } from "@/lib/parser/blocks/_helpers";
import type { ParseWarning } from "@/lib/parser/types";
import type { SourceAnchor, RegionId } from "@/lib/sheet-links/buildSheetDeepLink";
import { OPERATOR_ACTIONABLE_ANCHORED } from "@/lib/parser/dataGaps";
import { resolveCrewRoleCell, type CrewRoleAnchor } from "@/lib/drive/crewRoleAnchors";
import { resolveUnknownFieldCell, type UnknownFieldAnchor } from "@/lib/drive/unknownFieldAnchors";
import { valueFromRawSnippet } from "@/lib/parser/rawSnippet";

/** The five HOTEL ambiguity codes link to the HOTEL BLOCK, never a cell (spec
 *  2026-08-27-wizard-warning-row-links-copy §3). Deliberately NOT members of
 *  OPERATOR_ACTIONABLE_ANCHORED: they are spot-check ambiguities, refused as
 *  anchored-actionable by the 2026-07-25 hotel-ambiguity spec (row cc) and again by the
 *  2026-07-27 inline-later-group spec (row w), and only their LINK is widened here. A
 *  reviewer reading this as a membership change is reading a change that is not made. */
export const HOTEL_REGION_ANCHORED: ReadonlySet<string> = new Set([
  "HOTEL_GUEST_SPLIT_AMBIGUOUS",
  "HOTEL_ADDRESS_SPLIT_AMBIGUOUS",
  "HOTEL_CARDINALITY_EXCEEDED",
  "HOTEL_INLINE_GROUP_OWN_HOTEL",
  "HOTEL_INLINE_GROUP_HOTEL_SUSPECTED",
]);

/** The codes that carry a source-cell/region anchor: the render gate
 *  (OPERATOR_ACTIONABLE_ANCHORED) plus HOTEL_REGION_ANCHORED, and nothing else.
 *  tests/parser/parseWarningDeepLinkRender.test.tsx pins the difference EXACTLY, so
 *  population and render cannot drift by accident and a third set cannot be smuggled in.
 *  FIELD_UNREADABLE resolves to a per-row crew cell (region fallback). Both sets are
 *  `ReadonlySet<string>`, so tsc rejects any `.add`/`.delete` at compile time (whole-diff
 *  R1 — there is no runtime mutation site for either export). */
export const CELL_ANCHORED_CODES: ReadonlySet<string> = new Set([
  ...OPERATOR_ACTIONABLE_ANCHORED,
  ...HOTEL_REGION_ANCHORED,
]);

// blockRef.kind → RegionId for warnings whose `kind` is a tab-level concept that is
// not itself a RegionId (AGENDA grid → schedule tab; PULL SHEET → gear_packlist tab).
// Resolves a region/tab-level deep link (the parser knows the tab, not the exact
// run-of-show cell) — the same precedent as the FIELD_UNREADABLE region link.
const KIND_TO_REGION: Record<string, RegionId> = {
  agenda: "schedule",
  pull_sheet: "gear_packlist",
};

/**
 * extractShowDayTimeAnchors — locate the source cell behind each show-day's TIME
 * value so a SCHEDULE_TIME_UNPARSED warning can deep-link to the exact cell.
 *
 * The parser runs on the synthesized markdown (which loses A1 coordinates), so we
 * re-scan the RAW workbook here. We key each anchor by the show-day ISO date (the
 * stable semantic key) rather than by markdown row index — the markdown synthesis
 * pipeline (splitBlocks / normalizeBlock) can shift row order, but a show-day's
 * date is unique, so attaching by date avoids any divergence with the parse.
 *
 * Detection mirrors `readShowDayTimeCells` (lib/parser/blocks/scheduleTimes.ts):
 * a row's SHOW DAY label, then the date at +2 and the TIME cell at +3. We anchor
 * on the SHOW DAY cell's CONTENT (not an absolute column) so the offsets hold
 * wherever the DATES block sits. The TIME cell's tab is the containing sheet; its
 * gid comes from `titleToGid` (sheet metadata). A row is skipped when the +2 cell
 * isn't a date, the sheet has no gid, or the TIME column is past the used range —
 * a missing anchor degrades to no link, never a wrong one.
 */
export type ShowDayTimeAnchor = { iso: string; anchor: SourceAnchor };

const SHOW_DAY_RE = /^SHOW\s+DAY\b/i;

export function extractShowDayTimeAnchors(
  buffer: ArrayBuffer,
  titleToGid: Map<string, number>,
): ShowDayTimeAnchor[] {
  const workbook = XLSX.read(buffer, { type: "array", cellText: true, cellDates: false });
  const out: ShowDayTimeAnchor[] = [];

  for (const sheetName of workbook.SheetNames) {
    // Mirror synthesizeMarkdownFromXlsx's skip of archived "OLD ..." tabs so we
    // never anchor into a stale prior show's grid.
    if (/\bOLD\b/i.test(sheetName)) continue;
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet["!ref"]) continue;
    const gid = titleToGid.get(sheetName);
    if (typeof gid !== "number") continue; // no gid → no anchor possible

    const grid = buildAbsGrid(sheet);
    for (let r = grid.minRow; r <= grid.maxRow; r++) {
      for (let c = grid.minCol; c <= grid.maxCol; c++) {
        if (!SHOW_DAY_RE.test(clean(grid.cell(r, c)))) continue;
        // SHOW DAY at column c → date at c+2, TIME cell at c+3.
        const rawDate = clean(grid.cell(r, c + 2));
        const iso = rawDate ? normalizeDate(rawDate) : null;
        if (!iso) break; // a SHOW DAY row without a readable date → no anchor
        const timeCol = c + 3;
        if (timeCol > grid.maxCol) break;
        const a1 = XLSX.utils.encode_cell({ r, c: timeCol });
        out.push({ iso, anchor: { title: sheetName, gid, a1 } });
        break; // one SHOW DAY label per row
      }
    }
  }

  return out;
}

/**
 * resolveSourceCell — pick the single anchor matching a warning's show-day date.
 * Returns null when there's no match OR the date is ambiguous (more than one
 * show-day row shares it — a data error), so a wrong-cell link is never produced.
 */
export function resolveSourceCell(
  anchors: ShowDayTimeAnchor[],
  iso: string | undefined | null,
): SourceAnchor | null {
  if (!iso) return null;
  const matches = anchors.filter((a) => a.iso === iso);
  return matches.length === 1 ? matches[0]!.anchor : null;
}

export type WarningAnchorSources = {
  showDay: ShowDayTimeAnchor[];
  crewRole: CrewRoleAnchor[];
  // Optional so the many existing `{ showDay, crewRole, region }` call sites still
  // typecheck; both production callers (attachWarningAnchors, applyParseResult)
  // populate it explicitly, and the dispatch reads `?? []` (safe degradation).
  unknownField?: UnknownFieldAnchor[];
  // One array per wave code, each entry aligned with that code's warnings in array order
  // (spec 2026-08-29 §2.1). Optional: absent means the replay could not run, and every
  // wave warning falls through to the fallbacks below exactly as it does today.
  wave?: WavePairedAnchors;
  region: Record<string, SourceAnchor>;
};

/** An anchor's GRAIN: `cell` when `a1` is a single cell (present, no colon), `range` for a
 *  region range or a tab-level anchor, none for no anchor at all. Spec 2026-08-29 §2.1. */
function grainOf(a: SourceAnchor | null | undefined): 0 | 1 | 2 {
  if (!a) return 0;
  return typeof a.a1 === "string" && a.a1.length > 0 && !a.a1.includes(":") ? 2 : 1;
}

/**
 * Mutate `warnings` in place, setting `sourceCell` on each anchored warning.
 * Dispatch by code:
 *   - SCHEDULE_TIME_UNPARSED → resolve by blockRef.iso (show-day TIME cell).
 *   - UNKNOWN_ROLE_TOKEN / UNKNOWN_DAY_RESTRICTION → resolve by blockRef.name
 *     against the crew-role cell anchors (exactly-one match else null).
 *   - FIELD_UNREADABLE → per-ROW crew cell by blockRef.name (mirror UNKNOWN_ROLE_TOKEN),
 *     with the region anchor for blockRef.kind as the fallback (no name / no unique match).
 *   - the three WAVE codes → the i-th entry of `sources.wave[code]`, the detector replay's
 *     i-th hit (spec 2026-08-29 §2). Runs FIRST; a null entry falls through to the
 *     fallbacks below unchanged.
 * Best-effort: a warning with no/ambiguous match is left link-less.
 *
 * ASSIGNMENT NEVER DEMOTES. The site below assigns only when the new anchor's grain is at
 * least the existing one's, so the cron's second, region-only pass (applyParseResult) can
 * no longer replace a per-row cell with a region range. A same-grain re-pass still
 * overwrites with the same value, so every existing idempotency claim holds.
 */
export function attachSourceCellAnchors(
  warnings: ParseWarning[],
  sources: WarningAnchorSources,
): void {
  const waveCursor: Partial<Record<WaveCode, number>> = {};
  for (const w of warnings) {
    if (!CELL_ANCHORED_CODES.has(w.code)) continue;
    let cell: SourceAnchor | null = null;
    if ((WAVE_CODES as readonly string[]).includes(w.code)) {
      // The pairing is POSITIONAL: the i-th warning of a code takes the i-th replayed hit,
      // over the SAME warnings array `pairWaveCodeSites` filtered. The cursor advances on
      // every visit, whether or not the family resolved, so a short or absent array leaves
      // the tail unanchored rather than mis-aligning it.
      const code = w.code as WaveCode;
      const i = waveCursor[code] ?? 0;
      waveCursor[code] = i + 1;
      cell = sources.wave?.[code]?.[i] ?? null;
      // A null falls through: the code-agnostic KIND_TO_REGION fallback below still applies
      // for agenda / pull_sheet kinds (spec 2026-08-29 §1.1, the ratified exception).
    }
    if (cell === null) {
      if (w.code === "SCHEDULE_TIME_UNPARSED") {
        cell = resolveSourceCell(sources.showDay, w.blockRef?.iso);
      } else if (
        w.code === "UNKNOWN_ROLE_TOKEN" ||
        w.code === "UNKNOWN_DAY_RESTRICTION" ||
        w.code === "UNKNOWN_STAGE_RESTRICTION" ||
        w.code === "STAGE_WORD_AUTOCORRECTED" ||
        w.code === "ROLE_TOKEN_AUTOCORRECTED"
      ) {
        cell = resolveCrewRoleCell(sources.crewRole, w.blockRef?.name);
      } else if (w.code === "UNKNOWN_FIELD") {
        // Per-row cell by (kind,label,value); no region fallback — a no/ambiguous
        // match leaves the warning link-less (spec §5.1.1: correct cell or null).
        cell = resolveUnknownFieldCell(
          sources.unknownField ?? [],
          w.blockRef?.kind,
          w.blockRef?.name,
          valueFromRawSnippet(w.rawSnippet),
        );
      } else if (w.code === "FIELD_UNREADABLE") {
        // Per-ROW crew cell by name (mirror the UNKNOWN_ROLE_TOKEN crew-cell path), so DISTINCT
        // crew rows produce DISTINCT a1 and survive operatorActionableWarnings dedup instead of
        // all collapsing to the single crew region anchor (idx32/#154). Region fallback when
        // there is no name / no unique crew match: a missed anchor degrades to the region link,
        // never a wrong one (spec §5.1.1).
        cell =
          resolveCrewRoleCell(sources.crewRole, w.blockRef?.name) ??
          (w.blockRef?.kind ? (sources.region[w.blockRef.kind] ?? null) : null);
      } else if (w.code === "ORPHANED_CREW_ROWS") {
        // Region fallback ONLY (spec 2026-07-27-export-blank-row-segmentation §3.3):
        // the orphan tail's exact source row cannot be uniquely located
        // post-synthesis, so the crew REGION link is the correct grain — a region
        // link, never a wrong-cell link. Null (link-less card) when no crew region
        // source exists.
        cell = w.blockRef?.kind ? (sources.region[w.blockRef.kind] ?? null) : null;
      } else if (HOTEL_REGION_ANCHORED.has(w.code)) {
        // Region grain only (spec 2026-08-27 §3): the ambiguity describes how ONE cell was
        // read, and blockRef carries a hotel NAME, not a coordinate. A missing region
        // degrades to null (a link-less card), never to another section's range.
        cell = sources.region["hotels"] ?? null;
      } else if (w.blockRef?.kind && KIND_TO_REGION[w.blockRef.kind]) {
        // AGENDA / PULL SHEET warnings: alias kind → tab region. Reached only for
        // in-set codes (the CELL_ANCHORED_CODES gate above), and for a wave code whose
        // replay pairing yielded null (spec 2026-08-29 §1.1: a refusal never removes a link
        // the surface has today). Any future code added to
        // the set with kind agenda/pull_sheet region-anchors by design (pinned by the
        // membership pin-test in tests/parser/operatorActionableWarnings.test.ts).
        cell = sources.region[KIND_TO_REGION[w.blockRef.kind]!] ?? null;
      } else if (
        w.code === "COLUMN_HEADER_AUTOCORRECTED" ||
        w.code === "SECTION_HEADER_AUTOCORRECTED" ||
        w.code === "FIELD_LABEL_AUTOCORRECTED" ||
        w.code === "SCHEDULE_STRIKE_DATE_OFF_SCHEDULE"
      ) {
        // Region-level anchor: blockRef.kind is a RegionId (column header → "crew";
        // section header → the corrected section's RegionId, e.g. "transportation"/"details";
        // off-schedule strike → "rooms", the ROOMS-tab region the strike was read from).
        // (FIELD_UNREADABLE has its OWN per-row crew-cell branch above, with this region as
        // its fallback.)
        const kind = w.blockRef?.kind;
        cell = kind ? (sources.region[kind] ?? null) : null;
      }
    }
    if (cell && grainOf(cell) >= grainOf(w.sourceCell)) w.sourceCell = cell;
  }
}

/** True iff any warning is cell-anchored — gate the (cost-bearing) gid fetch on
 *  this so the common warning-free sheet pays no extra round-trip. */
export function hasCellAnchoredWarning(warnings: ParseWarning[]): boolean {
  return warnings.some((w) => CELL_ANCHORED_CODES.has(w.code));
}
