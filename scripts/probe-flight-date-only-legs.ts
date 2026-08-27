/**
 * Corpus probe for BL-FLIGHT-UNSTRUCTURED-LEG-RAW-FALLBACK.
 *
 * Counts, over the LIVE show sheets, how often a flight segment parses
 * successfully (`structured: true`, date resolved) yet carries no displayable
 * field beyond that date — the case `components/crew/sections/TravelSection.tsx`
 * hands to the raw-fallback branch, where a crew member sees an unlabeled line.
 *
 * The row was filed with its frequency UNMEASURED and its promotion gated on
 * this number, so this script is the gate, not an illustration.
 *
 * Path is the production one end to end: `listFolder` → `fetchSheetAsMarkdown` →
 * `parseSheet` → `crewMembers[].flight_info` → `parseFlightItinerary`. Nothing
 * is re-implemented, so the segments counted here are byte-for-byte the segments
 * the crew page renders. Drive is the source of truth by construction:
 * `crew_members.flight_info` in any deployment is this same parser's output over
 * these same sheets.
 *
 * Run: `node --import tsx scripts/probe-flight-date-only-legs.ts`
 *   --folder <id>   Drive folder to walk (default: the fxav-test-shows folder)
 *   --json <path>   also write the raw per-sheet counts as JSON
 *
 * Requires the Drive service-account credentials the sync path uses; run it
 * from a worktree that has run `pnpm worktree:link-env`.
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

/**
 * The corpus is DERIVED, not a name list: a sheet counts when `parseSheet` finds
 * crew on it. A name pattern (AGENTS.md calls the real shows the `II -`-prefixed
 * ones) drifts the moment the folder gains a sheet — it already has, with
 * "AII/III - Consultants Roundtable 2025", a real show AGENTS.md names and that
 * prefix misses. The prefix is still reported alongside, as a cross-check.
 */
const NAMED_SHOW_RE = /^(II|AII\/III)\s+-/;

/**
 * The renderer's own structured-vs-raw predicate, at `hideDates: false`.
 *
 * Mirrors `flightRowFields` (`components/crew/sections/TravelSection.tsx:203`):
 * `showStructured = seg.structured && (carrier || route || depTime || arrTime)`,
 * where `carrier = flightNo ?? airline` and `route` is built from origin/dest.
 * A copy is deliberate ONLY for the duration of this probe — the promotion gate
 * has to run before the renderer change that will move the predicate into
 * `lib/crew/flightDisplay.ts`, after which this script imports it and the copy
 * dies. Until then the two are pinned together by
 * `tests/scripts/probeFlightDateOnlyLegs.test.ts`.
 */
function hasDisplayableContentBeyondDate(seg: FlightSegment): boolean {
  const carrier = seg.flightNo ?? seg.airline;
  const route =
    seg.origin && seg.dest ? `${seg.origin} → ${seg.dest}` : (seg.origin ?? seg.dest ?? "");
  return Boolean(carrier || route || seg.depTime || seg.arrTime);
}

export type SegmentClass = "populated" | "date-only" | "unparsed";

export function classifySegment(seg: FlightSegment): SegmentClass {
  if (!seg.structured) return "unparsed";
  return hasDisplayableContentBeyondDate(seg) ? "populated" : "date-only";
}

export type SheetCounts = {
  fileId: string;
  name: string;
  /** Name matches the AGENTS.md show-title pattern (cross-check only; the corpus is `crewTotal > 0`). */
  realShow: boolean;
  crewTotal: number;
  crewWithFlightInfo: number;
  segmentsTotal: number;
  populated: number;
  dateOnly: number;
  unparsed: number;
  /** Every date-only segment's raw text, so the report shows what the crew member actually sees. */
  dateOnlyExamples: string[];
  /** Itineraries where EVERY segment is date-only — the whole card is unlabeled lines. */
  allDateOnlyItineraries: string[];
  error?: string;
};

/** Same year derivation the crew page uses (TravelSection.tsx:410-418), minus the show-timezone fallback. */
function showYearOf(dates: {
  travelIn?: string | null;
  showDays?: string[];
  travelOut?: string | null;
}): number {
  const src = dates.travelIn ?? dates.showDays?.[0] ?? dates.travelOut ?? "";
  return Number(String(src).slice(0, 4)) || new Date().getUTCFullYear();
}

export function countSheet(fileId: string, name: string, markdown: string): SheetCounts {
  const parsed = parseSheet(markdown, name);
  const year = showYearOf(parsed.show.dates as never);
  const counts: SheetCounts = {
    fileId,
    name,
    realShow: NAMED_SHOW_RE.test(name),
    crewTotal: parsed.crewMembers.length,
    crewWithFlightInfo: 0,
    segmentsTotal: 0,
    populated: 0,
    dateOnly: 0,
    unparsed: 0,
    dateOnlyExamples: [],
    allDateOnlyItineraries: [],
  };

  for (const crew of parsed.crewMembers) {
    if (!crew.flight_info) continue;
    counts.crewWithFlightInfo += 1;
    const { segments } = parseFlightItinerary(crew.flight_info, year);
    if (segments.length === 0) continue;
    let dateOnlyHere = 0;
    for (const seg of segments) {
      counts.segmentsTotal += 1;
      const klass = classifySegment(seg);
      if (klass === "date-only") {
        counts.dateOnly += 1;
        dateOnlyHere += 1;
        counts.dateOnlyExamples.push(seg.raw);
      } else if (klass === "populated") {
        counts.populated += 1;
      } else {
        counts.unparsed += 1;
      }
    }
    if (dateOnlyHere === segments.length) counts.allDateOnlyItineraries.push(crew.flight_info);
  }

  return counts;
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
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
    const name = file.name;
    try {
      const markdown = await fetchSheetAsMarkdown(file.driveFileId);
      rows.push(countSheet(file.driveFileId, name, markdown));
    } catch (cause) {
      rows.push({
        fileId: file.driveFileId,
        name,
        realShow: NAMED_SHOW_RE.test(name),
        crewTotal: 0,
        crewWithFlightInfo: 0,
        segmentsTotal: 0,
        populated: 0,
        dateOnly: 0,
        unparsed: 0,
        dateOnlyExamples: [],
        allDateOnlyItineraries: [],
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  const real = rows.filter((r) => !r.error && r.crewTotal > 0);
  const sum = (pick: (r: SheetCounts) => number) => real.reduce((n, r) => n + pick(r), 0);

  const pad = (s: string, n: number) => s.padEnd(n);
  console.log(
    `\nsheets listed: ${rows.length}   with crew (the corpus): ${real.length}   name-matched shows: ${rows.filter((r) => r.realShow).length}   errors: ${rows.filter((r) => r.error).length}\n`,
  );
  console.log(
    `${pad("sheet", 46)} ${pad("crew", 5)} ${pad("w/flt", 6)} ${pad("segs", 5)} ${pad("popd", 5)} ${pad("dateonly", 9)} unparsed`,
  );
  for (const r of rows) {
    if (r.error) {
      console.log(`${pad(r.name.slice(0, 45), 46)} ERROR ${r.error.slice(0, 60)}`);
      continue;
    }
    console.log(
      `${pad(r.name.slice(0, 45), 46)} ${pad(String(r.crewTotal), 5)} ${pad(String(r.crewWithFlightInfo), 6)} ${pad(String(r.segmentsTotal), 5)} ${pad(String(r.populated), 5)} ${pad(String(r.dateOnly), 9)} ${r.unparsed}`,
    );
  }
  console.log(
    `\nCORPUS (sheets with crew) — crew ${sum((r) => r.crewTotal)}, with flight_info ${sum((r) => r.crewWithFlightInfo)}, segments ${sum((r) => r.segmentsTotal)}, populated ${sum((r) => r.populated)}, DATE-ONLY ${sum((r) => r.dateOnly)}, unparsed ${sum((r) => r.unparsed)}`,
  );
  const examples = real.flatMap((r) => r.dateOnlyExamples);
  if (examples.length > 0) {
    console.log(`\ndate-only segment texts (${examples.length}):`);
    for (const e of examples) console.log(`  ${JSON.stringify(e)}`);
  }
  const whole = real.flatMap((r) => r.allDateOnlyItineraries);
  if (whole.length > 0) {
    console.log(`\nitineraries that are ENTIRELY date-only (${whole.length}):`);
    for (const w of whole) console.log(`  ${JSON.stringify(w)}`);
  }

  const jsonPath = argValue("--json");
  if (jsonPath) {
    writeFileSync(jsonPath, JSON.stringify({ folderId, rows }, null, 2) + "\n");
    console.log(`\nwrote ${jsonPath}`);
  }
}

// Run only as a CLI; the unit test imports `countSheet`/`classifySegment` directly.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  void main();
}
