/**
 * 2026-10-25 near-miss known-header probe — the calibration behind the proposal to gate
 * near-miss candidacy on the row's BLOCK OPENER, plus the census for the proposed
 * `VENUE_ADDRESS_MISSING` notice.
 *
 * Run (from the repo root):
 *   pnpm exec tsx docs/superpowers/specs/parser/probes/2026-10-25-nearmiss-known-header-probe.ts
 *
 * Tables:
 *   CONTROLS  the rename harness can see EFFECTIVE, INERT and "nothing changed but the
 *             warning stayed", and the parse is deterministic
 *   TABLE-A   every baseline row, renamed in place to its candidate: EFFECTIVE / INERT / HARMFUL
 *   TABLE-B   each opener predicate (P1-P4, below) per baseline row, cross-tabbed against the
 *             TABLE-A verdict
 *   TABLE-C   corpus emissions per fixture with and without each predicate as a gate
 *   TABLE-D   venue name / address census per fixture, and whether VENUE_ADDRESS_MISSING fires
 *   TABLE-E   the same census over the LIVE sheets, from the dated snapshot embedded below
 *   TABLE-F   per-block candidacy census under each predicate, with the losses called out.
 *             "Does a parser read this block" is measured, not assumed: per-row markers appended
 *             to the block's cells are traced into the parsed payload (VAL = value cells, C0 =
 *             column 0), and blanking the block is diffed against the base parse (DEL).
 *             F.5 is P4's whole reach, with a row-level DEL inside every block it withdraws.
 *
 * TABLE-A carries two verdict columns. `verdict` is the mechanical rule as specified (see
 * `classify`). `domain-adjusted` additionally demotes an EFFECTIVE rename to HARMFUL when the
 * candidate's field belongs to a different domain than the block the row sits in (see
 * `CANONICAL_PREFIX_NAMESPACES`): the GEAR quote header's `Address:` is the client's mailing
 * address, and renaming it to `VENUE ADDRESS` writes that into `show.venue.address` wherever the
 * venue address is blank. TABLE-B scores the gate against both columns.
 *
 * Runs in roughly 90 seconds on an idle machine: TABLE-F re-parses every corpus block three times.
 *
 * Every number is computed at run time. The only typed-in data are the two dated snapshots
 * below (the frozen baseline and the live-sheet venue snapshot), and each says where it
 * came from. Scope note: the client-contact notice was dropped by the owner on 2026-10-25,
 * so TABLE-D and TABLE-E carry venue columns only.
 */
import { readdirSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";

import { parseSheet } from "@/lib/parser";
import { resolveAlias } from "@/lib/parser/aliases";
import { clean, decodeEntities, splitRow } from "@/lib/parser/blocks/_helpers";
import { scanRowsWithOpener, type ScannedRow } from "@/lib/parser/blocks/_rowScan";
import { matchesSectionHeader } from "@/lib/parser/blocks/_sectionHeaderMatch";
import { isVenueBlockOpener } from "@/lib/parser/blocks/venue";
import { anchorNamespace, isCandidateHome } from "@/lib/parser/fieldNearMiss";
import { isKnownSectionHeader } from "@/lib/parser/knownSections";
import { normalizeLeadingColumn } from "@/lib/parser/leadingColumnNormalize";
import { normalizeSectionHeaders } from "@/lib/parser/sectionHeaderNormalize";
import {
  CLIENT_SECTION_HEADER_TOKENS,
  SECTION_HEADER_TOKEN_SETS,
} from "@/lib/parser/sectionHeaderTokens";
import type { ParsedSheet } from "@/lib/parser/types";
import { stripZeroWidth } from "@/lib/parser/zeroWidth";
import { FIXTURES } from "@/tests/parser/mutation/fixtures";

const T0 = performance.now();

// =====================================================================================
// THE FOUR CANDIDATE OPENER PREDICATES. Each is ANDed with the shipped 2026-08-28
// `isCandidateHome` wherever this probe applies it as a gate; none replaces it.
//
// P1-P3 are ADMISSION arms (a block stays a candidate only if the opener passes). They are
// kept as the recorded refutation: TABLE-F shows each withdraws candidacy from dozens of
// blocks a field parser reads labelled values from (GS Setup, DETAIL CHECKLIST, room
// headers). P4 is an EXCLUSION arm in the 2026-08-28 style (a block is withdrawn only when
// the arm fires), so GATE_PREDICATES carries it as `admits = !P4_LABEL_OPENER`.
// =====================================================================================

/** P1: the opener is a registered section header (`lib/parser/knownSections.ts`). */
export const P1_KNOWN_SECTION_HEADER = (opener: string): boolean => isKnownSectionHeader(opener);

/**
 * P2: the opener is one some block parser opens on, built only from the parsers' own
 * exported opener definitions: the venue predicate (`blocks/venue.ts`, which also admits the
 * v4 `VENUE NAME` opener) and every parser's `SECTION_HEADER_TOKENS`, compared with the
 * parsers' own matcher (`blocks/_sectionHeaderMatch.ts`).
 */
export const P2_PARSER_OPENER = (opener: string): boolean =>
  isVenueBlockOpener(opener) || SECTION_HEADER_TOKEN_SETS.some((t) => matchesSectionHeader(opener, t));

/** P3: either. */
export const P3_EITHER = (opener: string): boolean =>
  P1_KNOWN_SECTION_HEADER(opener) || P2_PARSER_OPENER(opener);

/**
 * P4 (EXCLUSION, the block is withdrawn when this is TRUE): the opener reads as a form
 * LABEL. Take the opener as the detector sees it (`ScannedRow.opener`, already `clean`ed),
 * entity-decode it (`decodeEntities`, the exporter's `&#10;` / `&#9;`), split on the FIRST
 * `/` (the exporter's fused-merged-cell separator: `Client:/Contact:`,
 * `TRANSPORTATION/Load In:`), trim segment 0, and fire when it ends with `:`.
 * So `Client:`, `Client:/Contact:` and `EVENT NAME:/DATE:/...` fire; `TRANSPORTATION/Load In:`
 * (segment 0 `TRANSPORTATION`), `ROOM DIMENSIONS:&#10;4100 SQ FT TOTAL` and a
 * `GENERAL SESSION ... TOTAL: 74' ...` header do not.
 */
export const P4_LABEL_OPENER = (opener: string): boolean => {
  const decoded = decodeEntities(opener);
  const slash = decoded.indexOf("/");
  const segment0 = (slash < 0 ? decoded : decoded.slice(0, slash)).trim();
  return segment0.endsWith(":");
};

export type GateName = "P1" | "P2" | "P3" | "P4";
export const GATE_PREDICATES: readonly { name: GateName; admits: (o: string) => boolean }[] = [
  { name: "P1", admits: P1_KNOWN_SECTION_HEADER },
  { name: "P2", admits: P2_PARSER_OPENER },
  { name: "P3", admits: P3_EITHER },
  { name: "P4", admits: (o) => !P4_LABEL_OPENER(o) },
];
const gateRecord = (f: (name: GateName, admits: (o: string) => boolean) => boolean): Record<GateName, boolean> => {
  const out = {} as Record<GateName, boolean>;
  for (const g of GATE_PREDICATES) out[g.name] = f(g.name, g.admits);
  return out;
};
const gateCols = (r: Record<GateName, boolean>, fmt: (b: boolean) => string): string =>
  GATE_PREDICATES.map((g) => fmt(r[g.name])).join(" | ");

// =====================================================================================
// DATED INPUT 1: the near-miss baseline, frozen.
//
// Copied 2026-10-25 from `tests/parser/__fixtures__/fieldNearMiss.baseline.json` (last
// changed in ea008a3f2) at worktree HEAD 5bfe66634. Frozen for the reason the 2026-08-28
// probe gives at length: implementing the gate REGENERATES that file, and a probe that read
// it would lose its own evidence the moment the spec shipped. The live file is still read,
// once, and compared against this copy (CONTROLS, first line).
// =====================================================================================
type BaselineRow = { fixture: string; key: string; block: string; kind: string; candidate: string };
const FROZEN_BASELINE_2026_10_25: readonly BaselineRow[] = [
  { fixture: "fixtures/shows/exporter-xlsx/consultants.md", key: "Address:", block: "client", kind: "client", candidate: "VENUE ADDRESS" },
  { fixture: "fixtures/shows/exporter-xlsx/consultants.md", key: "Phone:", block: "client", kind: "client", candidate: "Client Phone" },
  { fixture: "fixtures/shows/exporter-xlsx/consultants.md", key: "E-mail:", block: "client", kind: "client", candidate: "Client Email" },
  { fixture: "fixtures/shows/exporter-xlsx/east-coast.md", key: "Stage", block: "details", kind: "details", candidate: "Stage Size" },
  { fixture: "fixtures/shows/exporter-xlsx/east-coast.md", key: "Storage", block: "details", kind: "details", candidate: "Equipment Storage" },
  { fixture: "fixtures/shows/exporter-xlsx/fintech.md", key: "Address:", block: "client", kind: "client", candidate: "VENUE ADDRESS" },
  { fixture: "fixtures/shows/exporter-xlsx/fintech.md", key: "Phone:", block: "client", kind: "client", candidate: "Client Phone" },
  { fixture: "fixtures/shows/exporter-xlsx/fintech.md", key: "E-mail:", block: "client", kind: "client", candidate: "Client Email" },
  { fixture: "fixtures/shows/exporter-xlsx/fixed-income.md", key: "Address:", block: "client", kind: "client", candidate: "VENUE ADDRESS" },
  { fixture: "fixtures/shows/exporter-xlsx/fixed-income.md", key: "Phone:", block: "client", kind: "client", candidate: "Client Phone" },
  { fixture: "fixtures/shows/exporter-xlsx/fixed-income.md", key: "E-mail:", block: "client", kind: "client", candidate: "Client Email" },
  { fixture: "fixtures/shows/exporter-xlsx/rpas.md", key: "Address:", block: "client", kind: "client", candidate: "VENUE ADDRESS" },
  { fixture: "fixtures/shows/exporter-xlsx/rpas.md", key: "Phone:", block: "client", kind: "client", candidate: "Client Phone" },
  { fixture: "fixtures/shows/exporter-xlsx/rpas.md", key: "E-mail:", block: "client", kind: "client", candidate: "Client Email" },
  { fixture: "fixtures/shows/raw/2024-05-east-coast-family-office.md", key: "Stage", block: "details", kind: "details", candidate: "Stage Size" },
  { fixture: "fixtures/shows/raw/2024-05-east-coast-family-office.md", key: "Storage", block: "details", kind: "details", candidate: "Equipment Storage" },
  { fixture: "fixtures/shows/raw/2024-05-east-coast-family-office.md", key: "Diagrams?", block: "joann", kind: "joann", candidate: "DIagrams" },
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", key: "Client:/Contact:", block: "client contact", kind: "client contact", candidate: "Client Contact" },
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", key: "Address:", block: "client contact", kind: "client contact", candidate: "VENUE ADDRESS" },
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", key: "Phone:", block: "client contact", kind: "client contact", candidate: "Client Phone" },
  { fixture: "fixtures/shows/raw/2025-10-consultants-roundtable.md", key: "E-mail:", block: "client contact", kind: "client contact", candidate: "Client Email" },
  { fixture: "fixtures/shows/raw/2025-10-fixed-income-trading-summit.md", key: "Address:", block: "client", kind: "client", candidate: "VENUE ADDRESS" },
  { fixture: "fixtures/shows/raw/2025-10-fixed-income-trading-summit.md", key: "Phone:", block: "client", kind: "client", candidate: "Client Phone" },
  { fixture: "fixtures/shows/raw/2025-10-fixed-income-trading-summit.md", key: "E-mail:", block: "client", kind: "client", candidate: "Client Email" },
  { fixture: "fixtures/shows/raw/2026-03-rpas-central-four-seasons.md", key: "Address:", block: "client", kind: "client", candidate: "VENUE ADDRESS" },
  { fixture: "fixtures/shows/raw/2026-03-rpas-central-four-seasons.md", key: "Phone:", block: "client", kind: "client", candidate: "Client Phone" },
  { fixture: "fixtures/shows/raw/2026-03-rpas-central-four-seasons.md", key: "E-mail:", block: "client", kind: "client", candidate: "Client Email" },
  { fixture: "fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md", key: "Address:", block: "client", kind: "client", candidate: "VENUE ADDRESS" },
  { fixture: "fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md", key: "Phone:", block: "client", kind: "client", candidate: "Client Phone" },
  { fixture: "fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md", key: "E-mail:", block: "client", kind: "client", candidate: "Client Email" },
  { fixture: "fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md", key: "Address:", block: "client", kind: "client", candidate: "VENUE ADDRESS" },
  { fixture: "fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md", key: "Phone:", block: "client", kind: "client", candidate: "Client Phone" },
  { fixture: "fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md", key: "E-mail:", block: "client", kind: "client", candidate: "Client Email" },
];
const LIVE_BASELINE_PATH = "tests/parser/__fixtures__/fieldNearMiss.baseline.json";

// =====================================================================================
// DATED INPUT 2: the live-sheet venue snapshot (TABLE-E). The probe never calls the network.
//
// Read 2026-10-25 through the gsheets MCP (`sheets_get_values` / `sheets_batch_get_values`,
// FORMATTED_VALUE) over each sheet's INFO tab, range A1:F20 (the API returned A1:E20 for the
// two sheets whose INFO tab is five columns wide). Sheets: every spreadsheet in Drive folder
// 1iU80Y2mqYmkCuBQYer0TEF1fta6fDp1C (`search_files`, one page, no continuation token) whose
// title contains "II -", which is all of them except "TRANSPORTATION DETAILS FOR CJ".
// "AII/III - Consultants Roundtable 2025" is included although its title does not START with
// "II -"; `titleStartsWithII` records that.
//
// `sheets_get_values` trims trailing empty cells, so a cell missing from a row is blank.
// Values are reduced to the venue name string and a present/blank boolean for the address
// cell. `addressLabel` is the label the address row carries on that sheet, and `layout` says
// which cell held what, so a reader can re-check a row against the sheet.
// =====================================================================================
export const LIVE_SNAPSHOT_2026_10_25: readonly {
  title: string;
  id: string;
  titleStartsWithII: boolean;
  rangeRead: string;
  layout: string;
  venueName: string | null;
  addressLabel: string;
  venueAddressPresent: boolean;
}[] = [
  {
    title: "II - FinTech Forum CTO Summit 2026",
    id: "1v856gW02Xx-RmefruhqBdjZlYqoFCnvYld1p3v0iVvY",
    titleStartsWithII: true,
    rangeRead: "INFO!A1:F20",
    layout: "row 13 VENUE | VENUE NAME | <name>; row 14 (blank) | VENUE ADDRESS | <address>",
    venueName: "Kimpton Gray",
    addressLabel: "VENUE ADDRESS",
    venueAddressPresent: false,
  },
  {
    title: "II - East Coast Single Family Office Symposium - Fort Lauderdale, FL - 5/13 - 5/15  ",
    id: "1N1PKmhcvLAn5UwHLn4Rplm1yeVeYMvwfL3eOzB4McnY",
    titleStartsWithII: true,
    rangeRead: "INFO!A1:F20",
    layout: "row 7 VENUE | <name>; row 8 Hotel Address | <address>",
    venueName: "Four Seasons Fort Lauderdale",
    addressLabel: "Hotel Address",
    venueAddressPresent: true,
  },
  {
    title: "II - Retirement Plan Advisor Institute - Central 2026",
    id: "1vyZMRTqeFAJgocbSJM2_HDDMsUUJFBiLKk6WKq-dUYo",
    titleStartsWithII: true,
    rangeRead: "INFO!A1:F20",
    layout: "row 13 VENUE | VENUE NAME | <name>; row 14 (blank) | VENUE ADDRESS | <address>",
    venueName: "Four Seasons Hotel Chicago",
    addressLabel: "VENUE ADDRESS",
    venueAddressPresent: false,
  },
  {
    title: "II -  Redefining Fixed Income Forum /  Private Credit Forum 2025",
    id: "1HHw7vqCpnuxeDQDU5Gyxl70kyYV5-q6OFhcH_slXTcg",
    titleStartsWithII: true,
    rangeRead: "INFO!A1:F20",
    layout: "row 9 VENUE | VENUE NAME | <name>; row 10 (blank) | VENUE ADDRESS | <address>",
    venueName: "Four Seasons Hotel Chicago",
    addressLabel: "VENUE ADDRESS",
    venueAddressPresent: true,
  },
  {
    title: "II - RIA Investment Forum - Central 2025",
    id: "1Ll_fx6Q24y6aTSqIV7YiruDKrYtezkkKrVCXVc4Cwkw",
    titleStartsWithII: true,
    rangeRead: "INFO!A1:F20",
    layout: "row 9 VENUE | VENUE NAME | <name>; row 10 (blank) | VENUE ADDRESS | <address>",
    venueName: "Park Hyatt Chicago",
    addressLabel: "VENUE ADDRESS",
    venueAddressPresent: true,
  },
  {
    title: "II - Fixed Income Trading Summit 2025",
    id: "1xBbpHi_InDDC3V7Urg4LzA3NMD0qXOxJF0bKbw7Yt-4",
    titleStartsWithII: true,
    rangeRead: "INFO!A1:E20 (tab is 5 columns wide)",
    layout: "row 13 VENUE | VENUE NAME | <name>; row 14 (blank) | VENUE ADDRESS | <address>",
    venueName: "Park Hyatt Chicago",
    addressLabel: "VENUE ADDRESS",
    venueAddressPresent: false,
  },
  {
    title: "AII/III - Consultants Roundtable 2025",
    id: "1XQ44uxc44pToYxQnYw4OG9V6DjE7bC5EU08o5iFpxz4",
    titleStartsWithII: false,
    rangeRead: "INFO!A1:E20 (tab is 5 columns wide)",
    layout: "row 9 VENUE | VENUE NAME | <name>; row 10 (blank) | VENUE ADDRESS | <address>",
    venueName: "Four Seasons Hotel Chicago",
    addressLabel: "VENUE ADDRESS",
    venueAddressPresent: true,
  },
];

// =====================================================================================
// Fixture discovery: from DISK, cross-checked against the mutation harness's registry.
// =====================================================================================
const FIXTURE_DIRS = ["fixtures/shows/raw", "fixtures/shows/exporter-xlsx"];
const onDisk: string[] = FIXTURE_DIRS.flatMap((d) =>
  readdirSync(d)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .sort()
    .map((f) => d + "/" + f),
);
const mdText = new Map<string, string>();
for (const f of onDisk) mdText.set(f, readFileSync(f, "utf8"));
const registryPaths = new Set(FIXTURES.map((f) => f.path));
const notInRegistry = onDisk.filter((f) => !registryPaths.has(f));
const registryNotOnDisk = [...registryPaths].filter((p) => !onDisk.includes(p));

// =====================================================================================
// Shared helpers
// =====================================================================================
type Payload = Record<string, unknown>;
/** The parse output minus the two warning carriers; everything a crew page could read. */
const payloadOf = (p: ParsedSheet): Payload => {
  const { warnings: _w, raw_unrecognized: _r, ...rest } = p as unknown as Record<string, unknown>;
  return rest;
};

type Change = { path: string; before: unknown; after: unknown };
const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
/**
 * Leaf-level payload diff. An object on one side and null/undefined on the other recurses
 * into the object, so a field filled inside a newly created object is reported at its own
 * path rather than as one opaque object-level change.
 */
function diffPaths(a: unknown, b: unknown, path = "", out: Change[] = []): Change[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  const aO = isObj(a);
  const bO = isObj(b);
  if ((aO || a == null) && (bO || b == null) && (aO || bO)) {
    const ka = aO ? Object.keys(a) : [];
    const kb = bO ? Object.keys(b) : [];
    for (const k of [...new Set([...ka, ...kb])].sort()) {
      diffPaths(aO ? a[k] : undefined, bO ? b[k] : undefined, path ? path + "." + k : k, out);
    }
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) diffPaths(a[i], b[i], path + "[" + i + "]", out);
    return out;
  }
  out.push({ path, before: a, after: b });
  return out;
}
const show = (v: unknown): string => (v === undefined ? "undefined" : JSON.stringify(v));
const isBlank = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "");
/** Casefold + collapse whitespace: emails are canonicalized to lower case on the way in. */
const norm = (s: string): string => s.replace(/\s+/g, " ").trim().toLowerCase();
const sameValue = (v: unknown, rowValue: string): boolean =>
  typeof v === "string" && norm(v) === norm(rowValue);

const ALIGNMENT_CELL = /^[\s:|*-]*$/;
const isAlignmentRow = (cells: string[]): boolean => cells.every((c) => ALIGNMENT_CELL.test(c));

/** Rename the first cell of a pipe row. A replacer FUNCTION, so `$` in a label cannot splice. */
const renameFirstCell = (line: string, to: string): string =>
  line.replace(/^(\s*\|)([^|]*)\|/, (_m, lead: string) => lead + " " + to + " |");

/** Rebuild a pipe row with every cell after `keepThrough` emptied. Cell count is preserved. */
const blankCellsAfter = (line: string, keepThrough: number): string => {
  const cells = splitRow(line.trim());
  return "| " + cells.map((c, i) => (i > keepThrough ? "" : c)).join(" | ") + " |";
};

/**
 * The document exactly as the detector sees it: `parseSheet` reassigns `markdown` at three
 * points before `detectFieldNearMisses` (lib/parser/index.ts — stripZeroWidth, then
 * normalizeSectionHeaders, then normalizeLeadingColumn) and at no other point.
 */
const detectorView = (md: string): string =>
  normalizeLeadingColumn(normalizeSectionHeaders(stripZeroWidth(md)).corrected).corrected;

type Block = {
  fixture: string;
  ordinal: number;
  start: number; // first line index, inclusive
  end: number; // last line index, exclusive
  opener: string;
  ns: string;
  first: ScannedRow;
};
/**
 * Every physical pipe-run block, grouped by the 2026-08-28 probe's rule (`corpusBlocks`):
 * a run of `|`-leading lines, scanned with the shipped `scanRowsWithOpener`, skipped when the
 * scan keeps no row. Ordinals count kept blocks only, as that probe's TABLE-I does. Line
 * ranges are kept so a block can be edited in the source document.
 */
function blocksOf(fixture: string, md: string): Block[] {
  const lines = md.split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i]!.trim().startsWith("|")) {
      i += 1;
      continue;
    }
    const start = i;
    while (i < lines.length && lines[i]!.trim().startsWith("|")) i += 1;
    const rows = scanRowsWithOpener(lines.slice(start, i).join("\n"));
    const first = rows[0];
    if (first === undefined) continue;
    out.push({ fixture, ordinal: out.length + 1, start, end: i, opener: first.opener, ns: anchorNamespace(first.opener), first });
  }
  return out;
}

let parseCount = 0;
const parse = (fixture: string, md: string): ParsedSheet => {
  parseCount += 1;
  return parseSheet(md, fixture);
};
/** The unedited parse of each fixture, computed once. */
const baseCache = new Map<string, ParsedSheet>();
const baseParse = (fixture: string): ParsedSheet => {
  if (!baseCache.has(fixture)) baseCache.set(fixture, parse(fixture, mdText.get(fixture)!));
  return baseCache.get(fixture)!;
};

/** Top-level payload area of a diff path: `show.<field>` under show, else the first segment. */
const areaOf = (path: string): string => {
  const segs = path.replace(/\[\d+\]/g, "").split(".");
  return segs[0] === "show" ? segs.slice(0, 2).join(".") : (segs[0] ?? path);
};

const unknownFields = (p: ParsedSheet) => p.warnings.filter((w) => w.code === "UNKNOWN_FIELD");
const hasUnknownField = (p: ParsedSheet, block: string, key: string): boolean =>
  unknownFields(p).some((w) => w.blockRef?.kind === block && w.blockRef?.name === key);

// =====================================================================================
// The rename harness
// =====================================================================================

/**
 * The payload path a candidate label writes, keyed by the canonical `resolveAlias` returns
 * for the candidate. Each row cites the reader: `client.ts` writes `show.client_contact`,
 * `venue.ts` writes `show.venue`, `event.ts` writes `show.event_details`, `diagrams.ts` writes
 * `diagrams.linkedFolder`. A candidate whose canonical has no row here, and whose rename
 * changes the payload, is reported UNMAPPED rather than guessed.
 */
const CANDIDATE_FIELD_PATH: Record<string, string> = {
  "venue.address": "show.venue.address",
  "client.contact_phone": "show.client_contact.phone",
  "client.contact_email": "show.client_contact.email",
  "client.contact": "show.client_contact.name",
  "event.stage_size": "show.event_details.stage_size",
  "event.equipment_storage": "show.event_details.equipment_storage",
  "details.diagrams": "diagrams.linkedFolder",
};

/**
 * Which anchor namespaces a canonical's domain lives in. Used ONLY for the second verdict
 * column (`domain-adjusted`): a value that lands in the candidate's own field, but where that
 * field belongs to a different domain than the block the row sits in, is the client's mailing
 * address written into `show.venue.address`. The mechanical rule cannot see that; this
 * column is how the probe shows it without silently redefining the rule.
 */
const CANONICAL_PREFIX_NAMESPACES: Record<string, readonly string[]> = {
  venue: ["venue"],
  client: ["client", "client contact"],
  event: ["details"],
  details: ["details"],
};

type Verdict = "EFFECTIVE" | "INERT" | "HARMFUL" | "UNRESOLVED" | "UNMAPPED";

/**
 * The mechanical rule, as specified:
 *   EFFECTIVE  the payload changed; the candidate's own field changed from blank to a value
 *              equal to the row's value; and every OTHER changed path is the row vacating its
 *              own previous slot (before == the row's value, after blank). The vacate
 *              allowance is what a free-form key rename looks like: `event_details.stage`
 *              empties as `event_details.stage_size` fills, which is the Stage control.
 *   HARMFUL    the payload changed any other way: the value landed somewhere else, the
 *              candidate's field already held data that was displaced, or other paths moved.
 *   INERT      the payload is unchanged and the row's UNKNOWN_FIELD warning cleared.
 *   UNRESOLVED the payload is unchanged and the warning did NOT clear (a harness control
 *              state; no baseline row should land here).
 */
function classify(
  diff: Change[],
  warningCleared: boolean,
  target: string | undefined,
  rowValue: string,
): { verdict: Verdict; reason: string } {
  if (diff.length === 0) {
    return warningCleared
      ? { verdict: "INERT", reason: "payload unchanged, warning cleared" }
      : { verdict: "UNRESOLVED", reason: "payload unchanged, warning still present" };
  }
  if (target === undefined) return { verdict: "UNMAPPED", reason: "no payload path for candidate" };
  const t = diff.find((d) => d.path === target);
  const others = diff.filter((d) => d.path !== target);
  const vacates = others.every((d) => sameValue(d.before, rowValue) && isBlank(d.after));
  if (t === undefined) return { verdict: "HARMFUL", reason: "candidate field unchanged; value landed elsewhere" };
  if (!isBlank(t.before)) return { verdict: "HARMFUL", reason: "displaces existing value " + show(t.before) };
  if (!sameValue(t.after, rowValue)) return { verdict: "HARMFUL", reason: "candidate field got " + show(t.after) + ", not the row value" };
  if (!vacates) return { verdict: "HARMFUL", reason: "other paths changed" };
  return { verdict: "EFFECTIVE", reason: "row value landed in candidate field" };
}

type RenameResult = { verdict: Verdict; reason: string; diff: Change[]; warningBefore: boolean; warningCleared: boolean };
function renameAndClassify(
  fixture: string,
  md: string,
  base: ParsedSheet,
  lineIdx: number,
  row: BaselineRow,
  rowValue: string,
): RenameResult {
  const lines = md.split("\n");
  lines[lineIdx] = renameFirstCell(lines[lineIdx]!, row.candidate);
  const after = parse(fixture, lines.join("\n"));
  const diff = diffPaths(payloadOf(base), payloadOf(after));
  const warningBefore = hasUnknownField(base, row.block, row.key);
  const warningCleared = warningBefore && !hasUnknownField(after, row.block, row.key);
  const canon = resolveAlias(row.candidate);
  const target = canon === null ? undefined : CANDIDATE_FIELD_PATH[canon];
  return { ...classify(diff, warningCleared, target, rowValue), diff, warningBefore, warningCleared };
}

/** Find the single source line of a baseline row: block namespace + cleaned first cell. */
function locate(md: string, row: BaselineRow, blocks: Block[]): { lineIdx: number; value: string; opener: string }[] {
  const lines = md.split("\n");
  const hits: { lineIdx: number; value: string; opener: string }[] = [];
  for (const b of blocks) {
    if (b.ns !== row.block) continue;
    for (let j = b.start; j < b.end; j++) {
      const cells = splitRow(lines[j]!.trim());
      if (isAlignmentRow(cells)) continue;
      if (clean(cells[0] ?? "") === row.key) hits.push({ lineIdx: j, value: clean(cells[1] ?? ""), opener: b.opener });
    }
  }
  return hits;
}

/**
 * The INFO-blanked variant (raw fixtures only): the live v4 sheets have INFO's VENUE ADDRESS,
 * Contact Cell, Contact Office and Contact Email empty, so a rename that is inert or
 * displacing against a filled INFO may write data against an empty one.
 *
 * Blanked: in the FIRST venue-opener block, the value cells after the cell that resolves to
 * `venue.address` (`VENUE ADDRESS`, `Venue Address`, `Hotel Address`), only when that cell is
 * column 0, or column 1 under a blank column 0 (the v2 three-column form); the combined
 * `VENUE NAME/VENUE ADDRESS` cell of 2025-10-fixed-income keeps only the name half of its
 * value (the half before the first `/`, which is where `parseVenue` splits it,
 * lib/parser/blocks/venue.ts, "VENUE NAME/VENUE ADDRESS" special case); in the FIRST
 * CLIENT-opener block, the value cells of `Contact Cell` / `Contact Office` / `Contact Email`.
 * The v2 labels `Client Phone` / `Client Email` are NOT blanked: the caller named the v4 labels,
 * and the live v2 sheets have those cells filled. Line count is preserved, so baseline line
 * indices stay valid.
 */
const V4_CLIENT_BLANK_LABELS = new Set(["contact cell", "contact office", "contact email"]);
/** The parser's own combined-label test (lib/parser/blocks/venue.ts), reproduced verbatim. */
const COMBINED_NAME_ADDRESS = /VENUE NAME\s*\/\s*VENUE ADDRESS/i;
function blankInfo(md: string, blocks: Block[]): { md: string; blanked: string[] } {
  const lines = md.split("\n");
  const blanked: string[] = [];
  const venue = blocks.find((b) => isVenueBlockOpener(b.opener));
  if (venue !== undefined) {
    for (let j = venue.start; j < venue.end; j++) {
      const cells = splitRow(lines[j]!.trim());
      const combined = cells.findIndex((c) => COMBINED_NAME_ADDRESS.test(clean(c)));
      if (combined >= 0 && (cells[combined + 1] ?? "").includes("/")) {
        const v = cells[combined + 1]!;
        cells[combined + 1] = v.slice(0, v.indexOf("/"));
        lines[j] = "| " + cells.join(" | ") + " |";
        blanked.push(clean(cells[combined] ?? "") + " (address half)@" + (j + 1));
        continue;
      }
      const idx = cells.findIndex((c) => resolveAlias(clean(c)) === "venue.address");
      if (idx < 0 || idx > 1 || (idx === 1 && clean(cells[0] ?? "") !== "")) continue;
      if (!cells.slice(idx + 1).some((c) => clean(c) !== "")) continue;
      lines[j] = blankCellsAfter(lines[j]!, idx);
      blanked.push(clean(cells[idx] ?? "") + "@" + (j + 1));
    }
  }
  const client = blocks.find((b) => matchesSectionHeader(b.opener, CLIENT_SECTION_HEADER_TOKENS));
  if (client !== undefined) {
    for (let j = client.start; j < client.end; j++) {
      const cells = splitRow(lines[j]!.trim());
      const label = clean(cells[0] ?? "");
      if (!V4_CLIENT_BLANK_LABELS.has(label.toLowerCase())) continue;
      if (!cells.slice(1).some((c) => clean(c) !== "")) continue;
      lines[j] = blankCellsAfter(lines[j]!, 0);
      blanked.push(label + "@" + (j + 1));
    }
  }
  return { md: lines.join("\n"), blanked };
}

// =====================================================================================
// Precompute: per-fixture blocks (source and detector view), base parses.
// =====================================================================================
const srcBlocks = new Map<string, Block[]>();
const detBlocks = new Map<string, Block[]>();
const viewMismatch: string[] = [];
for (const f of onDisk) {
  const md = mdText.get(f)!;
  const view = detectorView(md);
  const s = blocksOf(f, md);
  const d = blocksOf(f, view);
  srcBlocks.set(f, s);
  detBlocks.set(f, d);
  if (md.split("\n").length !== view.split("\n").length) viewMismatch.push(f + ": line count");
  if (s.length !== d.length) viewMismatch.push(f + ": block count " + s.length + " vs " + d.length);
  else
    s.forEach((b, i) => {
      const o = d[i]!;
      if (b.start !== o.start || b.end !== o.end || b.opener !== o.opener || b.first.blockMinValueCells !== o.first.blockMinValueCells)
        viewMismatch.push(f + "#" + b.ordinal + ": " + JSON.stringify(b.opener) + " vs " + JSON.stringify(o.opener));
    });
}

// =====================================================================================
// CONTROLS
// =====================================================================================
console.log("CONTROLS");
const liveBaseline: BaselineRow[] = JSON.parse(readFileSync(LIVE_BASELINE_PATH, "utf8")).rows;
const rowId = (r: BaselineRow) => [r.fixture, r.block, r.key, r.candidate].join(" | ");
const frozenIds = new Set(FROZEN_BASELINE_2026_10_25.map(rowId));
const liveIds = new Set(liveBaseline.map(rowId));
console.log(
  "  frozen baseline rows: " + FROZEN_BASELINE_2026_10_25.length +
    "; live baseline rows: " + liveBaseline.length +
    "; live-not-frozen: " + [...liveIds].filter((i) => !frozenIds.has(i)).length +
    "; frozen-not-live: " + [...frozenIds].filter((i) => !liveIds.has(i)).length,
);
console.log(
  "  fixtures on disk (.md, README.md skipped): " + onDisk.length + "; read: " + mdText.size +
    "; registry (tests/parser/mutation/fixtures.ts): " + registryPaths.size +
    "; on disk not in registry: " + (notInRegistry.join(", ") || "none") +
    "; in registry not on disk: " + (registryNotOnDisk.join(", ") || "none"),
);
console.log(
  "  detector view vs source: blocks whose (line range, opener, minValueCells) differ: " +
    viewMismatch.length + (viewMismatch.length ? " -> " + viewMismatch.join("; ") : ""),
);
let nondeterministic = 0;
for (const f of onDisk) {
  if (diffPaths(payloadOf(baseParse(f)), payloadOf(parse(f, mdText.get(f)!))).length !== 0) nondeterministic += 1;
}
console.log("  K1 determinism: fixtures whose payload differs across two parses of the same text: " + nondeterministic + " of " + onDisk.length + " (must be 0)");

// K2: identity rename of every baseline row. Payload must not move and the warning must stay,
// so the verdict must be UNRESOLVED: proves INERT is not what "nothing changed" defaults to.
let k2Unresolved = 0;
const k2Other: string[] = [];
for (const r of FROZEN_BASELINE_2026_10_25) {
  const md = mdText.get(r.fixture)!;
  const hit = locate(md, r, srcBlocks.get(r.fixture)!)[0];
  if (hit === undefined) continue;
  const res = renameAndClassify(r.fixture, md, baseParse(r.fixture), hit.lineIdx, { ...r, candidate: r.key }, hit.value);
  if (res.verdict === "UNRESOLVED") k2Unresolved += 1;
  else k2Other.push(r.fixture + " " + r.key + " -> " + res.verdict);
}
console.log(
  "  K2 identity rename (row renamed to its own label): UNRESOLVED " + k2Unresolved + " of " +
    FROZEN_BASELINE_2026_10_25.length + (k2Other.length ? "; other: " + k2Other.join("; ") : "") + " (must be all)",
);

// K3: planted EFFECTIVE outside the baseline. Corrupt INFO's VENUE ADDRESS label in a raw v4
// fixture to an unrecognized spelling (so `show.venue.address` is blank in the base), then
// rename it back. Ground truth by construction: EFFECTIVE, target show.venue.address.
{
  const f = "fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md";
  const md = mdText.get(f)!;
  const lines = md.split("\n");
  const venue = srcBlocks.get(f)!.find((b) => isVenueBlockOpener(b.opener))!;
  let idx = -1;
  for (let j = venue.start; j < venue.end; j++) if (clean(splitRow(lines[j]!.trim())[0] ?? "") === "VENUE ADDRESS") idx = j;
  const value = clean(splitRow(lines[idx]!.trim())[1] ?? "");
  lines[idx] = renameFirstCell(lines[idx]!, "VENUE ADDRSS ZQ");
  const corrupted = lines.join("\n");
  const base = parse(f, corrupted);
  const res = renameAndClassify(
    f,
    corrupted,
    base,
    idx,
    { fixture: f, key: "VENUE ADDRSS ZQ", block: "venue", kind: "venue", candidate: "VENUE ADDRESS" },
    value,
  );
  console.log(
    "  K3 planted corrupt-then-repair of INFO VENUE ADDRESS (" + f + ":" + (idx + 1) + "): verdict " + res.verdict +
      " | diff " + res.diff.map((d) => d.path + ": " + show(d.before) + " -> " + show(d.after)).join("; ") + " (must be EFFECTIVE)",
  );
}
console.log("  K4 Stage/Storage rows as EFFECTIVE controls: see TABLE-A totals line `controls`.");
console.log("");

// =====================================================================================
// TABLE-A
// =====================================================================================
console.log("TABLE-A — every baseline row renamed in place to its candidate");
console.log("  variant | fixture | key -> candidate | namespace | opener | admitted by P1 P2 P3 P4 | verdict | domain | domain-adjusted | warning cleared | reason | diff");
type ARow = {
  row: BaselineRow;
  variant: "as-committed" | "INFO-blanked";
  opener: string;
  verdict: Verdict;
  adjusted: Verdict;
  gates: Record<GateName, boolean>;
};
const aRows: ARow[] = [];
const locateProblems: string[] = [];
const blankedByFixture = new Map<string, string[]>();
const sortedBaseline = [...FROZEN_BASELINE_2026_10_25].sort((a, b) => rowId(a).localeCompare(rowId(b)));
for (const r of sortedBaseline) {
  const md = mdText.get(r.fixture);
  if (md === undefined) {
    locateProblems.push(rowId(r) + ": fixture not read");
    continue;
  }
  const blocks = srcBlocks.get(r.fixture)!;
  const hits = locate(md, r, blocks);
  if (hits.length !== 1) {
    locateProblems.push(rowId(r) + ": " + hits.length + " source lines");
    if (hits.length === 0) continue;
  }
  const hit = hits[0]!;
  const variants: { name: ARow["variant"]; md: string; base: ParsedSheet }[] = [
    { name: "as-committed", md, base: baseParse(r.fixture) },
  ];
  if (r.fixture.startsWith("fixtures/shows/raw/")) {
    const b = blankInfo(md, blocks);
    blankedByFixture.set(r.fixture, b.blanked);
    if (b.blanked.length > 0) variants.push({ name: "INFO-blanked", md: b.md, base: parse(r.fixture, b.md) });
  }
  const gates = gateRecord((_n, admits) => admits(hit.opener));
  for (const v of variants) {
    const res = renameAndClassify(r.fixture, v.md, v.base, hit.lineIdx, r, hit.value);
    const canon = resolveAlias(r.candidate) ?? "";
    const domainOk = (CANONICAL_PREFIX_NAMESPACES[canon.split(".")[0] ?? ""] ?? []).includes(r.block);
    const adjusted: Verdict = res.verdict === "EFFECTIVE" && !domainOk ? "HARMFUL" : res.verdict;
    aRows.push({ row: r, variant: v.name, opener: hit.opener, verdict: res.verdict, adjusted, gates });
    console.log(
      "  " + v.name + " | " + r.fixture + " | " + r.key + " -> " + r.candidate + " | " + r.block + " | " +
        JSON.stringify(hit.opener) + " | " + GATE_PREDICATES.map((g) => (gates[g.name] ? "T" : "F")).join(" ") +
        " | " + res.verdict + " | " + (domainOk ? "same" : "CROSS(" + canon + " from " + r.block + ")") + " | " + adjusted +
        " | " + res.warningCleared + " | " + res.reason + " | " +
        (res.diff.length === 0 ? "-" : res.diff.map((d) => d.path + ": " + show(d.before) + " -> " + show(d.after)).join("; ")),
    );
  }
}
for (const [f, b] of [...blankedByFixture.entries()].sort()) {
  console.log("  INFO-blanked cells, " + f + ": " + (b.join(", ") || "none (variant not run)"));
}
const countBy = (rows: ARow[], k: (r: ARow) => string) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(k(r), (m.get(k(r)) ?? 0) + 1);
  return [...m.entries()].sort().map(([a, n]) => a + "=" + n).join(" ");
};
const controlRows = aRows.filter((a) => a.variant === "as-committed" && (a.row.key === "Stage" || a.row.key === "Storage"));
console.log(
  "  TOTALS: baseline rows " + sortedBaseline.length + "; verdict lines " + aRows.length +
    "; as-committed {" + countBy(aRows.filter((a) => a.variant === "as-committed"), (a) => a.verdict) + "}" +
    "; INFO-blanked {" + countBy(aRows.filter((a) => a.variant === "INFO-blanked"), (a) => a.verdict) + "}" +
    "; domain-adjusted as-committed {" + countBy(aRows.filter((a) => a.variant === "as-committed"), (a) => a.adjusted) + "}" +
    "; domain-adjusted INFO-blanked {" + countBy(aRows.filter((a) => a.variant === "INFO-blanked"), (a) => a.adjusted) + "}" +
    "; controls Stage/Storage EFFECTIVE " + controlRows.filter((a) => a.verdict === "EFFECTIVE").length + " of " + controlRows.length +
    "; locate problems " + locateProblems.length + (locateProblems.length ? " -> " + locateProblems.join("; ") : ""),
);
console.log("");

// =====================================================================================
// TABLE-B
// =====================================================================================
console.log("TABLE-B — gate predicate per baseline row x TABLE-A verdict");
console.log("  Claim under test: every EFFECTIVE row passes the gate and every non-EFFECTIVE row fails it.");
console.log("  Scope `any-variant`: a row counts EFFECTIVE if any variant it was tested in is EFFECTIVE;");
console.log("  a row whose variants gave two different non-EFFECTIVE verdicts is shown as `A+B`.");
console.log("  predicate | verdict scheme | scope | gate=T {verdicts} | gate=F {verdicts} | exceptions");
type Scope = "as-committed" | "INFO-blanked" | "any-variant";
let totalExceptions = 0;
let crossTabs = 0;
const exceptionSummary: string[] = [];
const anyVariantExceptions = new Map<string, number>();
for (const p of GATE_PREDICATES) {
  for (const scheme of ["mechanical", "domain-adjusted"] as const) {
    for (const scope of ["as-committed", "INFO-blanked", "any-variant"] as Scope[]) {
      const per = new Map<string, { gate: boolean; effective: boolean; verdicts: Set<Verdict> }>();
      for (const a of aRows) {
        if (scope !== "any-variant" && a.variant !== scope) continue;
        const v = scheme === "mechanical" ? a.verdict : a.adjusted;
        const id = rowId(a.row);
        const cur = per.get(id) ?? { gate: a.gates[p.name], effective: false, verdicts: new Set<Verdict>() };
        cur.verdicts.add(v);
        if (v === "EFFECTIVE") cur.effective = true;
        per.set(id, cur);
      }
      const cell = (gate: boolean) => {
        const m = new Map<string, number>();
        for (const x of per.values()) {
          if (x.gate !== gate) continue;
          const v = x.effective ? "EFFECTIVE" : [...x.verdicts].sort().join("+");
          m.set(v, (m.get(v) ?? 0) + 1);
        }
        return "{" + ([...m.entries()].sort().map(([v, n]) => v + "=" + n).join(" ") || "none") + "}";
      };
      const exceptions = [...per.entries()]
        .filter(([, x]) => x.gate !== x.effective)
        .map(([id, x]) => (x.effective ? "EFFECTIVE but gate=F: " : "non-EFFECTIVE but gate=T: ") + id)
        .sort();
      totalExceptions += exceptions.length;
      crossTabs += 1;
      if (exceptions.length) exceptionSummary.push(p.name + "/" + scheme + "/" + scope + ": " + exceptions.length);
      if (scope === "any-variant") anyVariantExceptions.set(p.name + "/" + scheme, exceptions.length);
      console.log(
        "  " + p.name + " | " + scheme + " | " + scope + " | " + cell(true) + " | " + cell(false) + " | " +
          (exceptions.length === 0 ? "0" : exceptions.length + " -> " + exceptions.join("; ")),
      );
    }
  }
}
console.log("  per cross-tab exception counts: " + (exceptionSummary.join(", ") || "none"));
console.log(
  "  TOTALS: cross-tabs " + crossTabs + "; exceptions summed " + totalExceptions +
    "; any-variant exceptions mechanical/domain-adjusted: " +
    GATE_PREDICATES.map((g) => g.name + " " + anyVariantExceptions.get(g.name + "/mechanical") + "/" + anyVariantExceptions.get(g.name + "/domain-adjusted")).join(", "),
);
console.log("");

// =====================================================================================
// TABLE-C
// =====================================================================================
console.log("TABLE-C — corpus emissions per fixture, without and with each opener gate");
console.log("  The detector does NOT expose the opener: an UNKNOWN_FIELD warning carries blockRef.kind");
console.log("  (the anchor NAMESPACE, which `Client:` and `CLIENT` share) and `key | value`. So the gate");
console.log("  is implemented here by attribution: emissions come out in `scanRowsWithOpener` order over");
console.log("  the detector's view of the document, so each is matched to the next candidate row with the");
console.log("  same namespace, label and value. `ambiguous` counts emissions whose matching rows disagree");
console.log("  on any predicate (must be 0, or the gated counts are not attributable).");
console.log("  fixture | before | after P1 | P2 | P3 | P4 | unattributed | ambiguous");
// "With gate" is implemented HERE, by filtering the real parse's UNKNOWN_FIELD output on the
// opener predicate. The detector does not expose the opener (emitUnknownField,
// lib/parser/warnings.ts, records the namespace in blockRef.kind and `key | value` in
// rawSnippet), so each emission is attributed back to its scanned row first.
type Emission = { fixture: string; key: string; block: string; candidate: string; opener: string };
const allEmissions: Emission[] = [];
let sumBefore = 0;
const sumAfter: Record<GateName, number> = { P1: 0, P2: 0, P3: 0, P4: 0 };
let sumUnattributed = 0;
let sumAmbiguous = 0;
for (const f of onDisk) {
  const p = baseParse(f);
  const ems = unknownFields(p);
  const rows = scanRowsWithOpener(detectorView(mdText.get(f)!));
  let ptr = 0;
  let unattributed = 0;
  let ambiguous = 0;
  const after: Record<GateName, number> = { P1: 0, P2: 0, P3: 0, P4: 0 };
  for (const w of ems) {
    const key = w.blockRef?.name ?? "";
    const kind = w.blockRef?.kind ?? "";
    const value = (w.rawSnippet ?? "").slice(key.length + 3);
    const matches = (r: ScannedRow) =>
      isCandidateHome(r) && anchorNamespace(r.opener) === kind && clean(r.cells[0] ?? "") === key && clean(r.cells[1] ?? "") === value;
    let hit = -1;
    for (let i = ptr; i < rows.length; i++) {
      if (matches(rows[i]!)) {
        hit = i;
        break;
      }
    }
    if (hit < 0) {
      unattributed += 1;
      continue;
    }
    ptr = hit + 1;
    const opener = rows[hit]!.opener;
    const peers = rows.filter(matches);
    if (GATE_PREDICATES.some((g) => new Set(peers.map((r) => g.admits(r.opener))).size > 1)) ambiguous += 1;
    for (const g of GATE_PREDICATES) if (g.admits(opener)) after[g.name] += 1;
    allEmissions.push({ fixture: f, key, block: kind, candidate: w.candidate ?? "", opener });
  }
  sumBefore += ems.length;
  for (const g of GATE_PREDICATES) sumAfter[g.name] += after[g.name];
  sumUnattributed += unattributed;
  sumAmbiguous += ambiguous;
  console.log("  " + f + " | " + ems.length + " | " + GATE_PREDICATES.map((g) => after[g.name]).join(" | ") + " | " + unattributed + " | " + ambiguous);
}
const emissionIds = new Set(allEmissions.map((e) => rowId({ ...e, kind: e.block })));
console.log(
  "  TOTALS: fixtures " + onDisk.length + "; before " + sumBefore + "; " + GATE_PREDICATES.map((g) => g.name + " " + sumAfter[g.name]).join("; ") +
    "; unattributed " + sumUnattributed + "; ambiguous " + sumAmbiguous +
    "; emission set == frozen baseline: " + (emissionIds.size === frozenIds.size && [...frozenIds].every((i) => emissionIds.has(i))),
);
const effectiveIds = (scheme: "mechanical" | "domain-adjusted", scope: Scope) =>
  new Set(
    aRows
      .filter((a) => (scope === "any-variant" || a.variant === scope) && (scheme === "mechanical" ? a.verdict : a.adjusted) === "EFFECTIVE")
      .map((a) => rowId(a.row)),
  );
const setEq = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
const stageStorage = new Set(
  FROZEN_BASELINE_2026_10_25.filter((r) => r.key === "Stage" || r.key === "Storage").map(rowId),
);
for (const g of GATE_PREDICATES) {
  const kept = new Set(allEmissions.filter((e) => g.admits(e.opener)).map((e) => rowId({ ...e, kind: e.block })));
  console.log(
    "  " + g.name + " kept " + kept.size + ": " + ([...kept].sort().join("; ") || "none") +
      " | == the 4 Stage/Storage rows: " + setEq(kept, stageStorage) +
      " | == mechanical EFFECTIVE (as-committed): " + setEq(kept, effectiveIds("mechanical", "as-committed")) +
      " | == domain-adjusted EFFECTIVE (any-variant): " + setEq(kept, effectiveIds("domain-adjusted", "any-variant")) +
      " | kept beyond the 4 Stage/Storage rows: " + ([...kept].filter((i) => !stageStorage.has(i)).sort().join("; ") || "none"),
  );
}
console.log("");

// =====================================================================================
// TABLE-D
// =====================================================================================
console.log("TABLE-D — venue census per fixture, read from the parsed show");
console.log("  VENUE_ADDRESS_MISSING fires when show.venue.name is non-empty AND show.venue.address is empty.");
console.log("  fixture | template | venue name | name present | address present | VENUE_ADDRESS_MISSING");
let dNamed = 0;
let dAddr = 0;
let dFires = 0;
let dNoVenue = 0;
for (const f of onDisk) {
  const s = baseParse(f).show;
  const name = s.venue?.name ?? "";
  const named = !isBlank(name);
  const addr = !isBlank(s.venue?.address);
  const fires = named && !addr;
  if (s.venue === null) dNoVenue += 1;
  if (named) dNamed += 1;
  if (addr) dAddr += 1;
  if (fires) dFires += 1;
  console.log("  " + f + " | " + s.template_version + " | " + show(s.venue === null ? null : name) + " | " + named + " | " + addr + " | " + (fires ? "FIRES" : "-"));
}
console.log("  TOTALS: fixtures " + onDisk.length + "; venue null " + dNoVenue + "; named " + dNamed + "; address present " + dAddr + "; VENUE_ADDRESS_MISSING fires " + dFires);
console.log("");

// =====================================================================================
// TABLE-E
// =====================================================================================
console.log("TABLE-E — venue census over the LIVE sheets (LIVE_SNAPSHOT_2026_10_25, read 2026-10-25)");
console.log("  title | id | title starts 'II -' | venue name | address label | address present | VENUE_ADDRESS_MISSING");
let eNamed = 0;
let eAddr = 0;
let eFires = 0;
for (const s of [...LIVE_SNAPSHOT_2026_10_25].sort((a, b) => a.title.localeCompare(b.title))) {
  const named = !isBlank(s.venueName);
  const fires = named && !s.venueAddressPresent;
  if (named) eNamed += 1;
  if (s.venueAddressPresent) eAddr += 1;
  if (fires) eFires += 1;
  console.log(
    "  " + JSON.stringify(s.title) + " | " + s.id + " | " + s.titleStartsWithII + " | " + show(s.venueName) + " | " + s.addressLabel +
      " | " + s.venueAddressPresent + " | " + (fires ? "FIRES" : "-"),
  );
}
console.log("  TOTALS: live sheets " + LIVE_SNAPSHOT_2026_10_25.length + "; named " + eNamed + "; address present " + eAddr + "; VENUE_ADDRESS_MISSING fires " + eFires);
console.log("");

// =====================================================================================
// TABLE-F
// =====================================================================================
console.log("TABLE-F — per-block candidacy census under each opener gate");
console.log("  Block walk: the 2026-08-28 probe's `corpusBlocks` rule over the detector's view of every");
console.log("  fixture; ordinals count kept blocks. `before` = the shipped isCandidateHome; P1/P2/P3 =");
console.log("  isCandidateHome AND the predicate.");
console.log("  Whether a parser reads a block is measured three ways, each a real re-parse of the source:");
console.log("    VAL   provenance through a LABEL: every non-empty cell after column 0 gets a per-row marker");
console.log("          appended; the rows whose marker reaches the payload are listed by their column-0 label.");
console.log("          This is the field-list read, the one a rename advisory is about.");
console.log("    C0    provenance through COLUMN 0: the same with column 0 marked (titles, room headers,");
console.log("          pull-sheet items, free-form DETAILS keys).");
console.log("    DEL   blanking the block's lines changes the payload. Broader than VAL/C0: a block can be a");
console.log("          boundary or anchor for a parser that reads nothing from it.");
console.log("  Warnings and raw_unrecognized are excluded from the payload throughout.");
console.log("");
console.log("  F.1 the named openers");
console.log("  opener | P1 isKnownSectionHeader | P2 | P3 | P4_LABEL_OPENER fires (block EXCLUDED)");
for (const o of [
  "CLIENT", "Client:", "Client:/Contact:", "DETAILS", "VENUE", "VENUE NAME", "Timestamp", "Console", "JOANN",
  "TRANSPORTATION/Load In:", "ROOM DIMENSIONS:&#10;4100 SQ FT TOTAL", "EVENT NAME:/DATE:/ROOM:/QTY/PULLED/INITAL/CAT/SUB CAT/ITEM/NOTES",
]) {
  console.log(
    "  " + JSON.stringify(o) + " | " + P1_KNOWN_SECTION_HEADER(o) + " | " + P2_PARSER_OPENER(o) + " | " + P3_EITHER(o) +
      " | " + P4_LABEL_OPENER(o),
  );
}
console.log("");

/** Per-row marker; distinct per line so one parse attributes every hit to its row. */
const MARK = (line: number) => "QZXMR" + line + "Q";
const MARK_RE = /qzxmr(\d+)q/gi;
function markBlock(md: string, b: Block, mode: "values" | "col0"): string {
  const lines = md.split("\n");
  for (let j = b.start; j < b.end; j++) {
    const cells = splitRow(lines[j]!.trim());
    if (isAlignmentRow(cells)) continue;
    const marked = cells.map((c, i) =>
      (mode === "values" ? i >= 1 : i === 0) && clean(c) !== "" ? c + " " + MARK(j) : c,
    );
    lines[j] = "| " + marked.join(" | ") + " |";
  }
  return lines.join("\n");
}
/** Every marker in the payload (keys and string leaves), as line index -> payload areas. */
function markerHits(p: unknown, path = "", out = new Map<number, Set<string>>()): Map<number, Set<string>> {
  const record = (s: string, at: string) => {
    for (const m of s.matchAll(MARK_RE)) {
      const line = Number(m[1]);
      if (!out.has(line)) out.set(line, new Set());
      out.get(line)!.add(areaOf(at));
    }
  };
  if (typeof p === "string") record(p, path);
  else if (Array.isArray(p)) p.forEach((v, i) => markerHits(v, path + "[" + i + "]", out));
  else if (isObj(p)) {
    for (const [k, v] of Object.entries(p)) {
      const at = path ? path + "." + k : k;
      record(k, at);
      markerHits(v, at, out);
    }
  }
  return out;
}

type Read = { rows: string[]; areas: string[] };
type FRow = {
  b: Block;
  before: boolean;
  after: Record<GateName, boolean>;
  val: Read;
  c0: Read;
  del: string[];
};
const fRows: FRow[] = [];
for (const f of onDisk) {
  const md = mdText.get(f)!;
  const srcLines = md.split("\n");
  const base = payloadOf(baseParse(f));
  const baseHasMarker = markerHits(base).size;
  if (baseHasMarker !== 0) console.log("  !! base payload of " + f + " already contains a marker; provenance void");
  for (const b of detBlocks.get(f)!) {
    const before = isCandidateHome(b.first);
    const after = gateRecord((_n, admits) => before && admits(b.opener));
    const prov = (mode: "values" | "col0"): Read => {
      const hits = markerHits(payloadOf(parse(f, markBlock(md, b, mode))));
      const rows = [...hits.keys()]
        .sort((x, y) => x - y)
        .map((j) => JSON.stringify(clean(splitRow(srcLines[j]!.trim())[0] ?? "")) + "@" + (j + 1));
      const areas = [...new Set([...hits.values()].flatMap((s) => [...s]))].sort();
      return { rows, areas };
    };
    const blanked = [...srcLines];
    for (let j = b.start; j < b.end; j++) blanked[j] = "";
    const del = [...new Set(diffPaths(base, payloadOf(parse(f, blanked.join("\n")))).map((c) => areaOf(c.path)))].sort();
    fRows.push({ b, before, after, val: prov("values"), c0: prov("col0"), del });
  }
}
const tf = (x: boolean) => (x ? "T" : "F");
const readsVal = (r: FRow) => r.val.rows.length > 0;
const readsC0 = (r: FRow) => r.c0.rows.length > 0;
const readsDel = (r: FRow) => r.del.length > 0;
const evidence = (r: FRow) =>
  [
    readsVal(r) ? "VAL rows " + r.val.rows.join(", ") + " -> [" + r.val.areas.join(", ") + "]" : "",
    readsC0(r) ? "C0 rows " + r.c0.rows.join(", ") + " -> [" + r.c0.areas.join(", ") + "]" : "",
    readsDel(r) ? "DEL [" + r.del.join(", ") + "]" : "",
  ]
    .filter(Boolean)
    .join(" ; ") || "-";
const blockId = (r: FRow) => r.b.fixture + "#" + r.b.ordinal;

console.log("  F.2 every block");
console.log("  fixture#ordinal | namespace | opener | minVC | before | P1 | P2 | P3 | P4 | read evidence");
for (const r of fRows) {
  console.log(
    "  " + blockId(r) + " | " + r.b.ns + " | " + JSON.stringify(r.b.opener) + " | " + r.b.first.blockMinValueCells +
      " | " + tf(r.before) + " | " + gateCols(r.after, tf) + " | " + evidence(r),
  );
}
console.log("");
console.log("  F.3 per-namespace rollup");
console.log("  namespace | blocks | VAL-read | C0-read | DEL-only | admitted before | P1 | P2 | P3 | P4");
for (const ns of [...new Set(fRows.map((r) => r.b.ns))].sort()) {
  const fam = fRows.filter((r) => r.b.ns === ns);
  const n = (k: (r: FRow) => boolean) => fam.filter(k).length;
  console.log(
    "  " + ns + " | " + fam.length + " | " + n(readsVal) + " | " + n(readsC0) + " | " +
      n((r) => readsDel(r) && !readsVal(r) && !readsC0(r)) + " | " + n((r) => r.before) + " | " +
      GATE_PREDICATES.map((g) => n((r) => r.after[g.name])).join(" | "),
  );
}
console.log("");
console.log("  F.4 losses: admitted before, excluded after, per predicate");
const lossSummary: string[] = [];
for (const g of GATE_PREDICATES) {
  const lost = fRows.filter((r) => r.before && !r.after[g.name]);
  const lostVal = lost.filter(readsVal);
  const lostC0 = lost.filter((r) => !readsVal(r) && readsC0(r));
  const lostDel = lost.filter((r) => !readsVal(r) && !readsC0(r) && readsDel(r));
  lossSummary.push(g.name + " " + lost.length + " (" + lostVal.length + "/" + lostC0.length + "/" + lostDel.length + ")");
  console.log(
    "  " + g.name + ": blocks lost " + lost.length + "; VAL-read " + lostVal.length + "; C0-read only " + lostC0.length +
      "; DEL only " + lostDel.length + "; no read evidence " + (lost.length - lostVal.length - lostC0.length - lostDel.length),
  );
  console.log("    by namespace (lost | VAL | C0-only | DEL-only | openers):");
  for (const ns of [...new Set(lost.map((r) => r.b.ns))].sort()) {
    const fam = lost.filter((r) => r.b.ns === ns);
    const openers = new Map<string, number>();
    for (const r of fam) openers.set(r.b.opener, (openers.get(r.b.opener) ?? 0) + 1);
    console.log(
      "    " + ns + " | " + fam.length + " | " + fam.filter(readsVal).length + " | " +
        fam.filter((r) => !readsVal(r) && readsC0(r)).length + " | " +
        fam.filter((r) => !readsVal(r) && !readsC0(r) && readsDel(r)).length + " | " +
        [...openers.entries()].sort().map(([o, c]) => JSON.stringify(o) + " x" + c).join(", "),
    );
  }
  for (const [title, set] of [
    ["VAL-READ LOSSES (a parser reads a labelled value from the block)", lostVal],
    ["C0-ONLY LOSSES (a parser reads column-0 text, no labelled value)", lostC0],
    ["DEL-ONLY LOSSES (blanking moves the payload, no cell provenance)", lostDel],
  ] as const) {
    console.log("    " + title + ", every one:");
    if (set.length === 0) console.log("      none");
    for (const r of set) console.log("      " + blockId(r) + " | " + r.b.ns + " | " + JSON.stringify(r.b.opener) + " | " + evidence(r));
  }
}
console.log("");
console.log("  F.5 P4's whole reach: every corpus block whose opener P4_LABEL_OPENER fires on,");
console.log("  admitted before or not (a block isCandidateHome already excludes is listed but loses nothing)");
console.log("  fixture#ordinal | namespace | opener | admitted before | read evidence");
const p4Reach = fRows.filter((r) => P4_LABEL_OPENER(r.b.opener));
for (const r of p4Reach) {
  console.log("  " + blockId(r) + " | " + r.b.ns + " | " + JSON.stringify(r.b.opener) + " | " + tf(r.before) + " | " + evidence(r));
}
const p4Openers = new Map<string, number>();
for (const r of p4Reach) p4Openers.set(r.b.opener, (p4Openers.get(r.b.opener) ?? 0) + 1);
console.log("  distinct openers P4 fires on: " + p4Openers.size + " -> " + [...p4Openers.entries()].sort().map(([o, c]) => JSON.stringify(o) + " x" + c).join(", "));
const p4ValLabels = new Map<string, number>();
for (const r of p4Reach.filter((x) => x.before && readsVal(x))) {
  for (const row of r.val.rows) {
    const label = row.slice(0, row.lastIndexOf("@"));
    p4ValLabels.set(label, (p4ValLabels.get(label) ?? 0) + 1);
  }
}
console.log(
  "  VAL-read row labels across every block P4 withdraws: " +
    ([...p4ValLabels.entries()].sort().map(([l, c]) => l + " x" + c).join(", ") || "none") +
    " | payload areas: " +
    ([...new Set(p4Reach.filter((x) => x.before && readsVal(x)).flatMap((x) => x.val.areas))].sort().join(", ") || "none"),
);
// Row-level DEL for every withdrawn block that DEL says is read. The value-cell marker can
// read NOTHING from a block whose read depends on a structural recognizer the marker itself
// breaks: the GEAR date grid needs a doubled `| Item | Item |` header, and a marked cell no
// longer matches it. So each row is emptied in place (every cell blanked, the pipe row kept,
// so the run is not split and no opener moves) and the payload re-diffed.
console.log("  F.5 row-level DEL inside each withdrawn block DEL marks as read (row emptied in place):");
const p4RowDel: { block: string; moving: string[] }[] = [];
for (const r of p4Reach.filter((x) => x.before && readsDel(x))) {
  const md = mdText.get(r.b.fixture)!;
  const srcLines = md.split("\n");
  const base = payloadOf(baseParse(r.b.fixture));
  const moving: string[] = [];
  let rowsTried = 0;
  for (let j = r.b.start; j < r.b.end; j++) {
    const cells = splitRow(srcLines[j]!.trim());
    if (isAlignmentRow(cells)) continue;
    rowsTried += 1;
    const edited = [...srcLines];
    edited[j] = blankCellsAfter(srcLines[j]!, -1);
    const d = diffPaths(base, payloadOf(parse(r.b.fixture, edited.join("\n"))));
    if (d.length > 0) moving.push(JSON.stringify(clean(cells[0] ?? "")) + "@" + (j + 1) + " [" + [...new Set(d.map((c) => areaOf(c.path)))].sort().join(", ") + "]");
  }
  p4RowDel.push({ block: blockId(r), moving });
  console.log("    " + blockId(r) + " | rows tried " + rowsTried + " | rows whose emptying moves the payload " + moving.length + ": " + (moving.join("; ") || "none"));
}
console.log(
  "  F.5 TOTALS: blocks P4 fires on " + p4Reach.length + "; of those admitted before (so withdrawn) " +
    p4Reach.filter((r) => r.before).length + "; withdrawn and VAL-read " + p4Reach.filter((r) => r.before && readsVal(r)).length +
    "; withdrawn and C0-read " + p4Reach.filter((r) => r.before && readsC0(r)).length +
    "; withdrawn and DEL-changes " + p4Reach.filter((r) => r.before && readsDel(r)).length +
    "; rows whose emptying moves the payload, summed over those blocks " + p4RowDel.reduce((n, x) => n + x.moving.length, 0),
);
console.log("");
const count = (k: (r: FRow) => boolean) => fRows.filter(k).length;
console.log(
  "  TOTALS: blocks " + fRows.length + "; VAL-read " + count(readsVal) + "; C0-read " + count(readsC0) +
    "; DEL-changes " + count(readsDel) + "; admitted before " + count((r) => r.before) +
    "; admitted after " + GATE_PREDICATES.map((g) => g.name + " " + count((r) => r.after[g.name])).join(", ") +
    "; lost (VAL/C0-only/DEL-only): " + lossSummary.join(", "),
);
console.log("");
console.log("RUN: parses " + parseCount + "; elapsed " + ((performance.now() - T0) / 1000).toFixed(1) + "s");
