# Corpus probe: how often does a flight leg parse and still have nothing to show?

Date: 2026-08-27. Branch `feat/flight-date-only-leg-render`. Answers the promotion prerequisite on `BL-FLIGHT-UNSTRUCTURED-LEG-RAW-FALLBACK`.

**Answer: zero. Not one segment in the live corpus is date-only.** The row's repair was gated on this number, and the number says the case does not occur in anything Doug has written.

## What was counted

A flight segment is **date-only** when `parseFlightItinerary` resolves it (`structured: true`) and the renderer still finds nothing to lay out: no flight number, no airline, no route, no times. That segment falls to the raw branch at `components/crew/sections/TravelSection.tsx:801-804`, where a crew member reads an unlabeled line. The row's own example is `3/22 Charter pending | 3/24 Return pending`: two legs, both parsed, both unlabeled on the page.

The class follows the renderer, not the parser, which settles one edge worth naming. `3/32 Charter pending` — one character off a real date — is `structured: true` with `date: null` and `dateRaw: "3/32"`, and the renderer hands it to the same raw branch and prints the same unlabeled line, with `dateRaw` standing in for the formatted date. So it counts as date-only, and the separate `dateOnlyDateUnresolved` column carries the distinction rather than the class silently swallowing it. Both are zero here.

The probe is `scripts/probe-flight-date-only-legs.ts`. It runs the production path end to end, so the segments it counts are the segments the crew page renders: `listFolder` → `fetchSheetAsMarkdown` → `parseSheet` → `crewMembers[].flight_info` → `parseFlightItinerary`. Nothing about the parse or the classification is re-implemented for the probe except the renderer's own `hasContent` disjunction, which is copied under a test that pins the copy (below).

```
node --import tsx scripts/probe-flight-date-only-legs.ts --validation --report-json
```

## Result, live Drive folder `fxav-test-shows` (`1iU80Y2mqYmkCuBQYer0TEF1fta6fDp1C`), 2026-08-27

| sheet | crew | with flight_info | segments | populated | **date-only** | unparsed |
| --- | --- | --- | --- | --- | --- | --- |
| AII/III - Consultants Roundtable 2025 | 7 | 0 | 0 | 0 | **0** | 0 |
| II -  Redefining Fixed Income Forum /  Private Credit Forum 2025 | 5 | 0 | 0 | 0 | **0** | 0 |
| II - East Coast Single Family Office Symposium - Fort Lauderdale, FL - 5/13 - 5/15   | 3 | 3 | 6 | 6 | **0** | 0 |
| II - FinTech Forum CTO Summit 2026 | 3 | 1 | 2 | 2 | **0** | 0 |
| II - Fixed Income Trading Summit 2025 | 5 | 0 | 0 | 0 | **0** | 0 |
| II - Retirement Plan Advisor Institute - Central 2026 | 4 | 1 | 2 | 2 | **0** | 0 |
| II - RIA Investment Forum - Central 2025 | 3 | 0 | 0 | 0 | **0** | 0 |
| **corpus total** | **30** | **5** | **10** | **10** | **0** | **0** |

Eight sheets were listed and seven are in the corpus. The eighth, **`TRANSPORTATION DETAILS FOR CJ`, is not a measured zero — it is a parse failure**, `VERSION_AMBIGUOUS`, and the probe reports it as an unmeasured row rather than folding it in. That distinction is the whole reason the probe tracks `hardErrors`: a sheet that fails to parse has no crew, so a corpus rule keyed on crew alone would drop it silently, shrinking the denominator while the run still printed zero errors. That is the one way to manufacture a clean zero without anybody stating a falsehood, and an earlier draft of this report did exactly that — it described the eighth sheet as a transportation fragment with no crew block, which was a guess, and the guess was wrong.

Corpus membership is derived (parsed cleanly, carries crew), not matched on the `II -` name prefix AGENTS.md describes, because the folder already holds a real show the prefix misses (`AII/III - Consultants Roundtable 2025`).

Every one of the ten segments carries a route and both times; six of the ten also carry a per-segment confirmation code, and a seventh confirmation is itinerary-level (`GEUZAB`), so four of the five itineraries carry a confirmation somewhere. Here is the whole flight corpus, verbatim:

```
EWR-FLL UNITED 5/13 - 11:29am - 2:34pm HQQ79F | FLL-EWR JET BLUE 5/15 - 8:59pm - 11:58pm OSUULZ
JFK-FLL JETBLUE 5/13 - 11:15am - 2:18pm CGTTLO | FLL-JFK JETBLUE 5/15 - 8:59pm - 11:55pm CGTTLO
ORD-FLL SPIRIT 5/13 - 10:58am - 3:05pm OWJ1PK | FLL-ORD SPIRIT 5/15 - 9:16pm - 11:29pm OWJ1PK
5/2 AA1080 LGA - ORD 12:00pm - 1:00pm | 5/7 AA3237 ORD - LGA 10:02am - 1:17pm
GEUZAB 3/22 AA3002 LGA - ORD 7:23am - 9:15am | 3/26 AA2723 ORD - LGA 7:23am - 10:30am
```

## Second source: the validation deployment

`--validation` reads `crew_members.flight_info` from the validation project (`TEST_DATABASE_URL`, or `--db <url>`) and classifies it with the same code, one read-only SELECT. It reports **30 crew rows, 5 with a non-null `flight_info`, 10 segments, 10 populated, 0 date-only** — the same numbers, from the same five itineraries.

That is the expected agreement rather than an independent confirmation: the column is this same parser's output over these same sheets. It rules out the one thing worth ruling out, which is a show that reached the database without passing through the folder the probe walks. A missing connection string prints a skip and returns null; it never degrades to a zero, for the same reason a parse failure does not.

## Why a zero is trustworthy

A zero is also what a broken probe produces, so all three ways of manufacturing one are pinned in `tests/scripts/probeFlightDateOnlyLegs.test.ts` rather than assumed:

- **A classifier that stops discriminating.** The suite asserts the row's own itinerary classifies date-only on both legs, a corpus itinerary classifies populated, a dateless leg classifies unparsed, `3/32 Charter pending` classifies date-only with `dateResolved: false`, and each field in the renderer's disjunction — isolated — puts a segment in the populated class while its absence returns it to date-only.
- **A shrinking denominator.** The suite asserts an unparseable sheet is an unmeasured row and not a clean zero, and that a sheet with crew and no flight data at all stays in the corpus. Both are checked against committed fixtures under `fixtures/shows/raw/`.
- **A hand-transcribed report.** Every number in the table above is asserted equal to `2026-08-27-flight-date-only-leg-probe.json`, the probe's own committed output, so a hand-edited cell fails rather than drifts.

The renderer predicate itself was mutated by hand, six mutants, six runs. Reproduce by editing the `return Boolean(...)` line of `hasDisplayableContentBeyondDate` in `scripts/probe-flight-date-only-legs.ts` and running `pnpm vitest run tests/scripts/probeFlightDateOnlyLegs.test.ts`:

| mutant | suite |
| --- | --- |
| drop `carrier` | red |
| drop `route` | red |
| drop `depTime`/`arrTime` | red |
| `return true` | red |
| `return false` | red |
| drop `\|\| seg.arrTime` | **green — equivalent** |

The survivor is equivalent, not a gap: `depTime` and `arrTime` are assigned together from one `TIME - TIME` match (`lib/crew/flightDisplay.ts:121-128`), so `arrTime` is never the only one set and no input can distinguish the two forms. `airline` has no isolate for the same kind of reason — it is assigned only on the TECH shape, which requires a route before the date (`lib/crew/flightDisplay.ts:133-136`), so a segment can never carry an airline as its sole content.

## What this means for the row

The row was filed honestly: it says the frequency is unmeasured and makes the repair conditional on measuring it. Measured, it is zero, and the fallback it describes is doing exactly what it was built to do on every itinerary that exists — printing the operator's text when the card has nothing to lay out, which for this corpus never happens, because every itinerary Doug writes carries a route and times.

Two things worth separating. The defect is real and reproducible: the row's example itinerary does render as two unlabeled lines, and the suite proves the classifier sees it. What the probe settles is reach, and the reach today is nothing. A renderer change built on this evidence would ship a labeled treatment that no crew member is currently in a position to see.

**Disposition, ruled 2026-08-27: record and park.** No renderer change. The row stays open and carries the number, so the queue holds a measured entry rather than an unmeasured one, and the next reader inherits the count instead of re-deriving it. It is re-filed the first time a date-only leg shows up in a live sheet, or if Doug adopts the pending-charter phrasing; rerunning the probe is the whole check.

What that leaves behind is the probe itself, which is the durable half. The question this row was stuck on for seventeen days was a count, and it is now one command.

## Limits of this probe

- It measures the corpus as of 2026-08-27. A sheet written tomorrow in the `Charter pending` style would land in the class, and rerunning the probe is the only way to know.
- It walks one Drive folder. Shows outside `fxav-test-shows` are outside the measurement, and the validation cross-check is the only evidence there are none.
- One sheet in the folder does not parse. `TRANSPORTATION DETAILS FOR CJ` is `VERSION_AMBIGUOUS` and carries no crew block on inspection, but the probe cannot say what is in it, and reports it as unmeasured rather than guessing.
- It classifies at `hideDates: false`. Under date suppression the renderer already withholds date-only rows wholesale (`components/crew/sections/TravelSection.tsx:428-430`), so a suppressed viewer never reaches the raw fallback and the count for that viewer is zero by construction, not by corpus.
