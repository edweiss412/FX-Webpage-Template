/**
 * Corpus probe for BL-FLIGHT-UNSTRUCTURED-LEG-RAW-FALLBACK.
 *
 * Counts, over the LIVE show sheets, how often a flight segment parses
 * successfully (`structured: true`) yet carries no displayable field beyond its
 * date — the case `components/crew/sections/TravelSection.tsx` hands to the
 * raw-fallback branch, where a crew member reads an unlabeled line.
 *
 * The row was filed with its frequency UNMEASURED and its promotion gated on
 * this number, so this script is the gate, not an illustration.
 *
 * Path is the production one end to end: `listFolder` → `fetchSheetAsMarkdown` →
 * `parseSheet` → `crewMembers[].flight_info` → `parseFlightItinerary`. Nothing
 * is re-implemented, so the segments counted here are byte-for-byte the segments
 * the crew page renders.
 *
 * A ZERO is the answer a broken or short-sighted probe also produces, so two
 * things are deliberate: a sheet that fails to parse is an ERROR ROW, never a
 * silent clean zero (see `hardErrors` below), and every number the report states
 * comes out of `--report-json` rather than a hand transcription.
 *
 * Run:
 *   node --import tsx scripts/probe-flight-date-only-legs.ts
 *     --folder <id>        Drive folder to walk (default: fxav-test-shows)
 *     --json <path>        write the raw per-sheet counts as JSON
 *     --report-json        rewrite the committed artifact the report is checked against
 *     --validation         ALSO read crew_members.flight_info from the validation
 *                          deployment and classify it the same way (opt-in; see below)
 *
 * Requires the Drive service-account credentials the sync path uses; run it from
 * a worktree that has run `pnpm worktree:link-env`.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvConfig } from "@next/env";

import { parseFlightItinerary, type FlightSegment } from "@/lib/crew/flightDisplay";
import { fetchSheetAsMarkdown } from "@/lib/drive/fetch";
import { listFolder } from "@/lib/drive/list";
import { parseSheet } from "@/lib/parser";

const DEFAULT_FOLDER_ID = "1iU80Y2mqYmkCuBQYer0TEF1fta6fDp1C";

/** The committed artifact the report's table is asserted against. */
export const REPORT_JSON_PATH =
  "docs/superpowers/specs/crew/2026-08-27-flight-date-only-leg-probe.json";

/**
 * The corpus is DERIVED, not a name list: a sheet counts when `parseSheet` finds
 * crew on it AND raises no hard error. A name pattern (AGENTS.md calls the real
 * shows the `II -`-prefixed ones) drifts the moment the folder gains a sheet — it
 * already has, with "AII/III - Consultants Roundtable 2025", a real show AGENTS.md
 * names and that prefix misses. The prefix is still reported alongside, as a
 * cross-check.
 */
const NAMED_SHOW_RE = /^(II|AII\/III)\s+-/;

/**
 * The renderer's own structured-vs-raw predicate, at `hideDates: false`.
 *
 * Mirrors `flightRowFields` (`components/crew/sections/TravelSection.tsx:203`):
 * `showStructured = seg.structured && (carrier || route || depTime || arrTime)`,
 * where `carrier = flightNo ?? airline` and `route` is built from origin/dest.
 * The copy exists because the promotion gate had to run ahead of any change to
 * the renderer module; `tests/scripts/probeFlightDateOnlyLegs.test.ts` pins the
 * two together so a clause dropped from either side goes red.
 */
function hasDisplayableContentBeyondDate(seg: FlightSegment): boolean {
  const carrier = seg.flightNo ?? seg.airline;
  const route =
    seg.origin && seg.dest ? `${seg.origin} → ${seg.dest}` : (seg.origin ?? seg.dest ?? "");
  return Boolean(carrier || route || seg.depTime || seg.arrTime);
}

export type SegmentClass = "populated" | "date-only" | "unparsed";

/**
 * Classifies by what the RENDERER does, which is the only thing the gate is
 * measuring. Note what `date-only` does and does not assert: the segment is
 * structured and has nothing displayable beyond its date TOKEN. Whether that
 * token resolved to a calendar date is a separate axis — `3/32 Charter pending`
 * is `structured: true` with `date: null` and `dateRaw: "3/32"`, and the renderer
 * hands it to the same raw branch and prints the same unlabeled line. Counting it
 * anywhere else would measure the parser rather than the page. `dateResolved`
 * below reports the split, so the number is never ambiguous.
 */
export function classifySegment(seg: FlightSegment): SegmentClass {
  if (!seg.structured) return "unparsed";
  return hasDisplayableContentBeyondDate(seg) ? "populated" : "date-only";
}

/** Did the segment's date token resolve to a calendar date, or only survive as raw text? */
export function dateResolved(seg: FlightSegment): boolean {
  return seg.date !== null;
}

export type SheetCounts = {
  fileId: string;
  name: string;
  /** Name matches the AGENTS.md show-title pattern (cross-check only; membership is derived below). */
  realShow: boolean;
  crewTotal: number;
  crewWithFlightInfo: number;
  segmentsTotal: number;
  populated: number;
  dateOnly: number;
  /** Of `dateOnly`, how many carried a date token that did NOT resolve. */
  dateOnlyDateUnresolved: number;
  unparsed: number;
  /**
   * Parser hard errors on this sheet. A sheet that fails to parse has no crew and
   * would otherwise leave the corpus silently, shrinking the denominator while the
   * run still reported zero errors — the one way a clean zero can be manufactured
   * without anybody lying. So it is an error row instead.
   */
  hardErrors: string[];
  /** Every date-only segment's raw text, so the report shows what the crew member sees. */
  dateOnlyExamples: string[];
  /** Itineraries where EVERY segment is date-only — the whole card is unlabeled lines. */
  allDateOnlyItineraries: string[];
  /** Set when the sheet could not be FETCHED at all (distinct from a parse failure). */
  error?: string;
};

/** A sheet is in the corpus when it parsed cleanly and carries crew. */
export function inCorpus(r: SheetCounts): boolean {
  return !r.error && r.hardErrors.length === 0 && r.crewTotal > 0;
}

/** A sheet the run could not measure, for either reason. Counted and named, never dropped. */
export function isUnmeasured(r: SheetCounts): boolean {
  return Boolean(r.error) || r.hardErrors.length > 0;
}

/** Same year derivation the crew page uses (TravelSection.tsx:410-418), minus the show-timezone fallback. */
function showYearOf(dates: {
  travelIn?: string | null;
  showDays?: string[];
  travelOut?: string | null;
}): number {
  const src = dates.travelIn ?? dates.showDays?.[0] ?? dates.travelOut ?? "";
  return Number(String(src).slice(0, 4)) || new Date().getUTCFullYear();
}

function emptyCounts(fileId: string, name: string): SheetCounts {
  return {
    fileId,
    name,
    realShow: NAMED_SHOW_RE.test(name),
    crewTotal: 0,
    crewWithFlightInfo: 0,
    segmentsTotal: 0,
    populated: 0,
    dateOnly: 0,
    dateOnlyDateUnresolved: 0,
    unparsed: 0,
    hardErrors: [],
    dateOnlyExamples: [],
    allDateOnlyItineraries: [],
  };
}

/** Classify one itinerary string into an existing counter. Shared by the sheet walk and `--validation`. */
export function countItinerary(counts: SheetCounts, flightInfo: string, year: number): void {
  counts.crewWithFlightInfo += 1;
  const { segments } = parseFlightItinerary(flightInfo, year);
  if (segments.length === 0) return;
  let dateOnlyHere = 0;
  for (const seg of segments) {
    counts.segmentsTotal += 1;
    const klass = classifySegment(seg);
    if (klass === "date-only") {
      counts.dateOnly += 1;
      if (!dateResolved(seg)) counts.dateOnlyDateUnresolved += 1;
      dateOnlyHere += 1;
      counts.dateOnlyExamples.push(seg.raw);
    } else if (klass === "populated") {
      counts.populated += 1;
    } else {
      counts.unparsed += 1;
    }
  }
  if (dateOnlyHere === segments.length) counts.allDateOnlyItineraries.push(flightInfo);
}

export function countSheet(fileId: string, name: string, markdown: string): SheetCounts {
  const parsed = parseSheet(markdown, name);
  const counts = emptyCounts(fileId, name);
  counts.hardErrors = parsed.hardErrors.map((e) => e.code);
  counts.crewTotal = parsed.crewMembers.length;
  const year = showYearOf(parsed.show.dates as never);
  for (const crew of parsed.crewMembers) {
    if (!crew.flight_info) continue;
    countItinerary(counts, crew.flight_info, year);
  }
  return counts;
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

const has = (flag: string) => process.argv.includes(flag);

/**
 * The second source: `crew_members.flight_info` as it actually sits in the
 * validation deployment, classified by the same code.
 *
 * Opt-in behind `--validation` and READ-ONLY by construction — one SELECT, no
 * DDL, no write. The connection string is `--db <url>` or `TEST_DATABASE_URL`,
 * which on this repo points at the validation project (see `pnpm preflight`).
 * A missing URL is announced and returns null; it never degrades to a zero,
 * which would be the same manufactured clean zero `hardErrors` exists to stop.
 */
async function readValidation(): Promise<SheetCounts | null> {
  const url = argValue("--db") ?? process.env["TEST_DATABASE_URL"];
  if (!url) {
    console.log("\n--validation: no --db and no TEST_DATABASE_URL; skipped (NOT a zero).");
    return null;
  }
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, { max: 1, idle_timeout: 5, prepare: false });
  try {
    const rows = await sql<
      { title: string | null; flight_info: string | null; show_year: string | null }[]
    >`
      select s.title,
             c.flight_info,
             coalesce(s.dates->>'travelIn', s.dates->'showDays'->>0, s.dates->>'travelOut') as show_year
        from crew_members c
        join shows s on s.id = c.show_id
    `;
    const counts = emptyCounts("validation", "validation crew_members.flight_info");
    counts.crewTotal = rows.length;
    for (const row of rows) {
      if (!row.flight_info) continue;
      const year = Number(String(row.show_year ?? "").slice(0, 4)) || new Date().getUTCFullYear();
      countItinerary(counts, row.flight_info, year);
    }
    return counts;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function line(r: SheetCounts): string {
  const pad = (s: string, n: number) => s.padEnd(n);
  if (r.error) return `${pad(r.name.slice(0, 45), 46)} FETCH-ERROR ${r.error.slice(0, 50)}`;
  if (r.hardErrors.length > 0)
    return `${pad(r.name.slice(0, 45), 46)} PARSE-ERROR ${r.hardErrors.join(",").slice(0, 50)}`;
  return (
    `${pad(r.name.slice(0, 45), 46)} ${pad(String(r.crewTotal), 5)} ${pad(String(r.crewWithFlightInfo), 6)} ` +
    `${pad(String(r.segmentsTotal), 5)} ${pad(String(r.populated), 5)} ${pad(String(r.dateOnly), 9)} ${r.unparsed}`
  );
}

async function main(): Promise<void> {
  // Same order Next.js itself uses, so the probe reads the SAME credentials the
  // sync path reads at runtime rather than a shell-local copy of them.
  loadEnvConfig(process.cwd(), false);
  const folderId = argValue("--folder") ?? DEFAULT_FOLDER_ID;
  const files = await listFolder(folderId);
  files.sort((a, b) => a.name.localeCompare(b.name));

  const rows: SheetCounts[] = [];
  for (const file of files) {
    try {
      const markdown = await fetchSheetAsMarkdown(file.driveFileId);
      rows.push(countSheet(file.driveFileId, file.name, markdown));
    } catch (cause) {
      const counts = emptyCounts(file.driveFileId, file.name);
      counts.error = cause instanceof Error ? cause.message : String(cause);
      rows.push(counts);
    }
  }

  const corpus = rows.filter(inCorpus);
  const unmeasured = rows.filter(isUnmeasured);
  const sum = (pick: (r: SheetCounts) => number) => corpus.reduce((n, r) => n + pick(r), 0);
  const totals = {
    crewTotal: sum((r) => r.crewTotal),
    crewWithFlightInfo: sum((r) => r.crewWithFlightInfo),
    segmentsTotal: sum((r) => r.segmentsTotal),
    populated: sum((r) => r.populated),
    dateOnly: sum((r) => r.dateOnly),
    dateOnlyDateUnresolved: sum((r) => r.dateOnlyDateUnresolved),
    unparsed: sum((r) => r.unparsed),
  };

  const pad = (s: string, n: number) => s.padEnd(n);
  console.log(
    `\nsheets listed: ${rows.length}   in corpus: ${corpus.length}   UNMEASURED (fetch or parse error): ${unmeasured.length}   name-matched shows: ${rows.filter((r) => r.realShow).length}\n`,
  );
  console.log(
    `${pad("sheet", 46)} ${pad("crew", 5)} ${pad("w/flt", 6)} ${pad("segs", 5)} ${pad("popd", 5)} ${pad("dateonly", 9)} unparsed`,
  );
  for (const r of rows) console.log(line(r));
  console.log(
    `\nCORPUS — crew ${totals.crewTotal}, with flight_info ${totals.crewWithFlightInfo}, segments ${totals.segmentsTotal}, populated ${totals.populated}, DATE-ONLY ${totals.dateOnly} (of which date unresolved ${totals.dateOnlyDateUnresolved}), unparsed ${totals.unparsed}`,
  );
  if (unmeasured.length > 0) {
    console.log(`\nUNMEASURED sheets — these are NOT zeros, they are gaps in the denominator:`);
    for (const r of unmeasured) console.log(`  ${r.name}: ${r.error ?? r.hardErrors.join(", ")}`);
  }

  const examples = corpus.flatMap((r) => r.dateOnlyExamples);
  if (examples.length > 0) {
    console.log(`\ndate-only segment texts (${examples.length}):`);
    for (const e of examples) console.log(`  ${JSON.stringify(e)}`);
  }

  let validation: SheetCounts | null = null;
  if (has("--validation")) {
    validation = await readValidation();
    if (validation) {
      console.log(
        `\nVALIDATION crew_members.flight_info — crew ${validation.crewTotal}, with flight_info ${validation.crewWithFlightInfo}, segments ${validation.segmentsTotal}, populated ${validation.populated}, DATE-ONLY ${validation.dateOnly}, unparsed ${validation.unparsed}`,
      );
    }
  }

  const payload = { folderId, rows, corpus: corpus.map((r) => r.name), totals, validation };
  const jsonPath = argValue("--json");
  if (jsonPath) {
    writeFileSync(jsonPath, JSON.stringify(payload, null, 2) + "\n");
    console.log(`\nwrote ${jsonPath}`);
  }
  if (has("--report-json")) {
    writeFileSync(REPORT_JSON_PATH, JSON.stringify(payload, null, 2) + "\n");
    console.log(`\nwrote ${REPORT_JSON_PATH}`);
  }
}

// Run only as a CLI; the unit test imports the counting helpers directly.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main();
}
