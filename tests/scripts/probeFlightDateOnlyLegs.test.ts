/**
 * Pins the corpus probe's classifier, its denominator, and the report's numbers.
 *
 * The probe answers a promotion gate — "how often does a flight segment parse but
 * carry nothing displayable beyond its date?" — and it answered ZERO on the live
 * corpus. A zero is also what a broken probe produces, so all three ways of
 * manufacturing one are pinned here rather than assumed:
 *
 *   1. A classifier that stops discriminating. Pinned against the itinerary the
 *      ledger row was filed on, and against each field of the renderer's
 *      disjunction in isolation.
 *   2. A shrinking denominator. A sheet that fails to parse has no crew and would
 *      leave the corpus silently; the probe makes it an error row, and this suite
 *      asserts that rather than the zeros it also produces.
 *   3. A hand-transcribed report. Every number in the report's table is asserted
 *      equal to the committed probe output, so prose cannot drift from the run.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseFlightItinerary, type FlightSegment } from "@/lib/crew/flightDisplay";
import {
  REPORT_JSON_PATH,
  classifySegment,
  countSheet,
  dateResolved,
  inCorpus,
  isUnmeasured,
  itinerariesMatchCorpus,
} from "@/scripts/probe-flight-date-only-legs";

const ROOT = join(__dirname, "..", "..");
const SHOW_YEAR = 2026;

const segmentsOf = (flightInfo: string): FlightSegment[] =>
  parseFlightItinerary(flightInfo, SHOW_YEAR).segments;

describe("probe segment classifier", () => {
  it("calls the ledger row's own itinerary two date-only segments", () => {
    // BL-FLIGHT-UNSTRUCTURED-LEG-RAW-FALLBACK quotes this itinerary verbatim and
    // states both legs parse with `structured: true` and both dates resolved.
    const segments = segmentsOf("3/22 Charter pending | 3/24 Return pending");
    expect(segments.map((s) => ({ structured: s.structured, date: s.date }))).toEqual([
      { structured: true, date: "2026-03-22" },
      { structured: true, date: "2026-03-24" },
    ]);
    expect(segments.map(classifySegment)).toEqual(["date-only", "date-only"]);
    expect(segments.map(dateResolved)).toEqual([true, true]);
  });

  it("calls a leg with a route and times populated, not date-only", () => {
    // Drawn from the live corpus (validation `crew_members.flight_info`,
    // II - Retirement Plan Advisor Institute - Central).
    expect(segmentsOf("GEUZAB 3/22 AA3002 LGA - ORD 7:23am - 9:15am").map(classifySegment)).toEqual(
      ["populated"],
    );
  });

  it("calls a leg with no date at all unparsed, not date-only", () => {
    expect(segmentsOf("Driving himself").map(classifySegment)).toEqual(["unparsed"]);
  });

  it("still calls a leg date-only when its date token did not resolve, and says so", () => {
    // One character off a real date. The parser keeps `structured: true` and
    // `dateRaw: "3/32"` while `date` stays null, and the RENDERER treats it exactly
    // like the resolved case — same raw branch, same unlabeled line, with `dateRaw`
    // standing in for the formatted date. So the class follows the renderer, and
    // `dateResolved` carries the distinction instead of the class silently swallowing
    // it. Counting this as anything else would measure the parser, not the page.
    const [seg] = segmentsOf("3/32 Charter pending");
    expect(seg?.structured).toBe(true);
    expect(seg?.date).toBeNull();
    expect(seg?.dateRaw).toBe("3/32");
    expect(classifySegment(seg!)).toBe("date-only");
    expect(dateResolved(seg!)).toBe(false);
  });

  it("counts each of the three classes exactly once for a mixed itinerary", () => {
    expect(
      segmentsOf(
        "GEUZAB 3/22 AA3002 LGA - ORD 7:23am - 9:15am | 3/24 Charter pending | Driving himself",
      ).map(classifySegment),
    ).toEqual(["populated", "date-only", "unparsed"]);
  });

  it("leaves the date-only class on any ONE displayable field, and only on those", () => {
    // The renderer's `hasContent` is a disjunction over carrier (flightNo ?? airline),
    // route (origin/dest) and the times. Each case below isolates ONE of them: the
    // segment parses, its date resolves, and exactly one field is non-null. Removing
    // that field must put the segment back in the date-only class — which is what makes
    // this a discrimination test rather than a does-it-return-populated test. A clause
    // dropped from the predicate goes red here.
    //
    // Two members of the disjunction have no isolate, by the parser's construction:
    // `airline` is assigned ONLY on the TECH shape, which requires a route before the
    // date (`lib/crew/flightDisplay.ts:133-136`), so a segment can never carry an
    // airline as its sole content; and `depTime`/`arrTime` are assigned as a pair from
    // one TIME - TIME match (`lib/crew/flightDisplay.ts:121-128`), so neither is ever
    // alone. Dropping `|| seg.arrTime` from the predicate is therefore an EQUIVALENT
    // mutation and no test here can kill it. Recorded so a later reader does not read
    // its survival as a coverage gap.
    const isolates = [
      { field: "flightNo", withField: "3/22 AA3002" },
      { field: "route", withField: "3/22 LGA - ORD" },
      { field: "times", withField: "3/22 7:23am - 9:15am" },
    ];
    for (const { field, withField } of isolates) {
      const [present] = segmentsOf(withField);
      expect(present?.structured, field).toBe(true);
      expect(present?.date, field).toBe("2026-03-22");
      expect(segmentsOf(withField).map(classifySegment), field).toEqual(["populated"]);
    }
    expect(segmentsOf("3/22 Charter pending").map(classifySegment)).toEqual(["date-only"]);
  });
});

describe("probe denominator", () => {
  it("makes a sheet the parser cannot read an error row, not a clean zero", () => {
    // The failure this catches: an unreadable real sheet has no crew, so a
    // crew-count-only corpus rule drops it silently — the denominator shrinks and the
    // run still reports zero errors. That is the one way to manufacture a clean zero
    // without anybody stating a falsehood. It is not hypothetical: the eighth sheet in
    // the live folder parses to VERSION_AMBIGUOUS, and the first draft of this probe
    // reported it as a sheet with no crew block.
    const counts = countSheet("file-1", "TRANSPORTATION DETAILS FOR CJ", "# Nothing here\n");
    expect(counts.hardErrors.length).toBeGreaterThan(0);
    expect(isUnmeasured(counts)).toBe(true);
    expect(inCorpus(counts)).toBe(false);
  });

  it("keeps a sheet that parses cleanly and carries crew, even with no flight data", () => {
    // The other side of the same rule: four of the seven live corpus sheets carry crew
    // and no flight_info at all. Those are measured zeros and must stay in the
    // denominator, or the corpus silently narrows to only the sheets that agree with
    // it. Checked against a committed real sheet rather than hand-rolled markdown,
    // which is how the first draft of this case accidentally asserted the clean-parse
    // path using an input that does not parse.
    const md = readFileSync(join(ROOT, "fixtures/shows/raw/2025-03-dci-rpas-central.md"), "utf8");
    const counts = countSheet("file-2", "2025-03-dci-rpas-central.md", md);
    expect(counts.hardErrors).toEqual([]);
    expect(counts.crewTotal).toBeGreaterThan(0);
    expect(counts.segmentsTotal).toBe(0);
    expect(inCorpus(counts)).toBe(true);
  });

  it("counts the segments on a committed sheet that does carry flight data", () => {
    // Guards the guard: without this, every assertion above is compatible with a
    // countSheet that finds no segments anywhere, which is the exact shape of a
    // probe that reports a clean zero because it is not looking.
    const md = readFileSync(
      join(ROOT, "fixtures/shows/raw/2024-05-east-coast-family-office.md"),
      "utf8",
    );
    const counts = countSheet("file-3", "2024-05-east-coast-family-office.md", md);
    expect(counts.hardErrors).toEqual([]);
    expect(counts.segmentsTotal).toBeGreaterThan(0);
    expect(counts.populated).toBe(counts.segmentsTotal);
    expect(counts.dateOnly).toBe(0);
  });
});

describe("report numbers", () => {
  // Every number the report states about the corpus comes out of the probe run
  // committed alongside it. Transcription is the drift this removes: the report's
  // table is parsed here and asserted equal to the JSON, so a hand-edited cell fails.
  type Row = Record<string, number> & { name: string; itineraries: string[] };
  const json = JSON.parse(readFileSync(join(ROOT, REPORT_JSON_PATH), "utf8")) as {
    rows: Row[];
    totals: Record<string, number>;
    validation: (Row & { crewWithFlightInfo: number }) | null;
  };

  /**
   * The report's table columns, keyed by the HEADER TEXT the report itself prints.
   *
   * Derived rather than enumerated at the assertion site: round 2 finding 1 was that
   * three of the six columns were asserted and three were not, so 24 cells could be
   * hand-edited with the suite still green. The loop below reads the header out of the
   * markdown and fails on any column this map does not name, so a column ADDED to the
   * report is asserted or the suite goes red — a new column cannot arrive unpinned.
   */
  const COLUMN_FIELD: Record<string, string> = {
    crew: "crewTotal",
    "with flight_info": "crewWithFlightInfo",
    segments: "segmentsTotal",
    populated: "populated",
    "date-only": "dateOnly",
    unparsed: "unparsed",
  };
  const md = readFileSync(
    join(ROOT, "docs/superpowers/specs/crew/2026-08-27-flight-date-only-leg-probe.md"),
    "utf8",
  );

  it("states a corpus total that is the sum of the per-sheet rows", () => {
    const corpusRows = json.rows.filter((r) => inCorpus(r as never));
    for (const key of [
      "crewTotal",
      "crewWithFlightInfo",
      "segmentsTotal",
      "populated",
      "dateOnly",
      "unparsed",
    ]) {
      const summed = corpusRows.reduce(
        (n, r) => n + (r as never as Record<string, number>)[key]!,
        0,
      );
      expect(summed, key).toBe(json.totals[key]);
    }
  });

  it("answers the gate at zero, with a denominator that is named rather than shrunk", () => {
    expect(json.totals["dateOnly"]).toBe(0);
    expect(json.rows.filter((r) => isUnmeasured(r as never)).map((r) => r.name)).toEqual([
      "TRANSPORTATION DETAILS FOR CJ",
    ]);
  });

  it("prints the same numbers in the report's markdown table as the probe produced", () => {
    const cells = (row: string) => row.split("|").map((c) => c.trim().replace(/\*\*/g, ""));
    const cell = (row: string, i: number) => Number(cells(row)[i + 2]);

    // The columns come out of the report's own header, so the assertion ranges over
    // what the report actually prints rather than over a list kept in step by hand.
    const header = md.match(/^\| sheet \|.*$/m);
    expect(header, "report has no corpus table header").not.toBeNull();
    const columns = cells(header![0]).slice(2, -1);
    expect(columns.length, "report table header has no columns").toBeGreaterThan(0);
    for (const name of columns) {
      expect(
        COLUMN_FIELD[name],
        `report table column ${JSON.stringify(name)} is not pinned`,
      ).toBeDefined();
    }

    for (const r of json.rows) {
      const escaped = r.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (isUnmeasured(r as never)) {
        // An unmeasured sheet has no table row on purpose — it has no numbers. What it
        // must never be is ABSENT: the report has to name it and say why, or the
        // denominator shrinks silently and the zero above stops meaning anything.
        expect(md, `report never names the unmeasured sheet ${r.name}`).toContain(r.name);
        for (const code of (r as never as { hardErrors: string[] }).hardErrors) {
          expect(md, `report never states why ${r.name} is unmeasured`).toContain(code);
        }
        continue;
      }
      const line = md.match(new RegExp(`^\\| ${escaped} \\|.*$`, "m"));
      expect(line, `report has no table row for ${r.name}`).not.toBeNull();
      columns.forEach((name, i) => {
        expect(cell(line![0], i), `${r.name} ${name}`).toBe(r[COLUMN_FIELD[name]!]);
      });
    }
    const total = md.match(/^\| \*\*corpus total\*\* \|.*$/m);
    expect(total).not.toBeNull();
    columns.forEach((name, i) => {
      expect(cell(total![0], i), `corpus total ${name}`).toBe(json.totals[COLUMN_FIELD[name]!]);
    });
  });

  it("quotes the corpus itineraries verbatim rather than approximately", () => {
    // The report prints the whole flight corpus in a fenced block and calls it
    // verbatim. Without this the block is prose: a segment could be tidied, dropped,
    // or invented and every count above would still agree, because the counts were
    // produced before the transcription.
    const corpusItineraries = json.rows
      .filter((r) => inCorpus(r as never))
      .flatMap((r) => r.itineraries);
    expect(corpusItineraries.length, "committed run recorded no itineraries").toBe(
      json.totals["crewWithFlightInfo"],
    );
    const fences = [...md.matchAll(/^```\n([\s\S]*?)^```$/gm)].map((m) => m[1]!.trim().split("\n"));
    const quoted = fences.find((block) => block.length === corpusItineraries.length);
    expect(quoted, "report quotes no block matching the corpus itinerary count").toBeDefined();
    expect([...quoted!].sort()).toEqual([...corpusItineraries].sort());
  });

  it("backs the validation claim with a run rather than a recollection", () => {
    // Finding 5, round 1: the branch asserted "30 rows, 5 non-null, the same five
    // itineraries" while nothing committed could check it, so the claim could drift
    // with every provided verification still green. `--validation` now produces it.
    expect(json.validation, "run the probe with --validation --report-json").not.toBeNull();
    expect(json.validation!.crewTotal).toBeGreaterThan(0);
    for (const key of Object.values(COLUMN_FIELD)) {
      expect(json.validation![key], `validation ${key}`).toBe(json.totals[key]);
    }
  });

  it("establishes the validation claim by itinerary identity, not by agreeing totals", () => {
    // Round 2 finding 2: the aggregate agreement above is compatible with a database
    // that lost one folder itinerary and gained one from outside the folder — the very
    // show the cross-check exists to rule out. Only the texts settle it.
    expect(json.validation).not.toBeNull();
    const corpus = json.rows.filter((r) => inCorpus(r as never));
    expect(itinerariesMatchCorpus(corpus as never, json.validation as never)).toBe(true);

    // And the comparison discriminates: swapping one itinerary keeps every count equal.
    const swapped = {
      ...json.validation!,
      itineraries: [...json.validation!.itineraries.slice(1), "5/1 AA1 JFK - LAX 9:00am - 12:00pm"],
    };
    expect(itinerariesMatchCorpus(corpus as never, swapped as never)).toBe(false);
  });
});
