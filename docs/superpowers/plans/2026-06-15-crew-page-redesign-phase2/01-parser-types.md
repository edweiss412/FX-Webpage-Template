# Phase 2 — §01 Parser + Types

**Goal:** Regenerate the filled AGENDA fixtures from the production exporter, add the `AgendaEntry` type + top-level `runOfShow?` to `ParsedSheet`/`ParseResult`, and build the fail-soft `parseAgenda` block (token-header-anchored grid location, DATE-row block boundaries, CONFIRMED-ONLY per-day encoding, storage caps) wired into `parseSheet` with the 5 `AGENDA_*` `ParseWarning` codes.

> Execute after reading `00-overview.md`. **NO DB, NO projection, NO UI in this file** — those are §02/§03.

---

## Pre-draft findings (live-verified, supersede stale spec/prompt references)

These were grep-verified against the live tree at `feat/crew-page-phase2-agenda` before drafting:

- **The regen mechanism already exists and is deterministic — no script to write.** Production does NOT feed `parseSheet` the `fixtures/shows/raw/*.md` corpus (that's the Drive-MCP `read_file_content` renderer). Production feeds the output of **`synthesizeMarkdownFromXlsx(buffer: ArrayBuffer): string`** (`lib/drive/exportSheetToMarkdown.ts:186`). That production-exporter output for all 7 live test shows was **already captured on 2026-06-18** into `fixtures/shows/exporter-xlsx/*.md` (`fixtures/shows/exporter-xlsx/README.md:1-31`), regression-pinned by `tests/parser/exporterFixtures.test.ts`. **The filled AGENDA grids the spec demands "regenerated from the current converter" ARE these files** — `east-coast.md` (token-header `:103`) and `ria.md` (token-header `:319`). The spec §3/§6 cites `2024-05-east-coast-family-office.md` and `2025-06-ria-investment-forum.md` from `raw/`; those are the **stale** Drive-MCP shapes → demote to fail-soft robustness inputs. **The prompt's "RIA = `2025-03-dci-rpas-central.md`" is wrong** — `2025-03-dci-rpas-central.md` is a stale RPAS robustness fixture, not RIA. The real filled RIA production fixture is `fixtures/shows/exporter-xlsx/ria.md`. **Re-capture command** (only if the exporter changes; not needed for this milestone since the 2026-06-18 capture is current): export each test-show XLSX from Drive folder `1iU80Y2mqYmkCuBQYer0TEF1fta6fDp1C` via the `fxav-reader` SA and run the bytes through `synthesizeMarkdownFromXlsx` (per `fixtures/shows/exporter-xlsx/README.md:21`).
- **Line citations corrected vs 00-overview** (post-merge shift): `ParsedSheet` = `lib/parser/types.ts:315-331` (`warnings:330`, `hardErrors:331`); `ParseResult` = `:338-354` (`warnings:353`, `hardErrors:354`); `ParseWarning` = `:1-7`. `parseSheet` = `lib/parser/index.ts:315`; aggregator init `:360`; block-call list `:363-381`; `ShowRow` literal `:388-401`; return literal `:407-419` (`warnings: agg.warnings` at `:418`). `parseAgendaLinks` (unchanged, distinct surface) = `:230`. `deriveSchedulePhases` = `:276`.
- **`shouldHideGenericOptional(value: string | null): boolean`** = `lib/visibility/emptyState.ts:75` — hides `''`/`TBD`/`N/A`/`TBA` (uppercased trim against `GENERIC_OPTIONAL_HIDE`). This is the step-4 TITLE-real emit gate.
- **Reusable parser helpers** (`lib/parser/blocks/_helpers.ts`): `parseTableRows(markdown): string[][]` (`:18` — splits all `|…|` lines into trimmed cell arrays, **drops separator rows**, so the DATE/day-name/token-header/data rows are consecutive `string[][]` entries with NO separator gaps). **CAUTION — `parseTableRows` flattens the WHOLE document** (it `continue`s past non-pipe lines, never `break`s): it does NOT preserve table boundaries, so calling it on full markdown sweeps the ROOM DIMENSIONS / PULL SHEET tables that FOLLOW the AGENDA table into the same array. Task 1.3 therefore isolates the AGENDA table's contiguous pipe-line block FIRST (blank-line / non-pipe / EOF bounded, the `crew.ts:158-167` / `index.ts:182-184` repo pattern) and runs `parseTableRows` on that block only. Also: `splitRow`, `clean` (`:45`), `presence` (`:65` — entity-decode + trim → `string|null`), `normalizeDate(raw): string|null` (`:80` — already parses `M/D/YY`→ISO and strips weekday prefixes). `newAggregator(): { warnings, rawUnrecognized }` from `lib/parser/warnings.ts:20`.
- **`dates.showDays`** is `ShowRow["dates"].showDays: string[]` (ISO) from `parseDates` (`lib/parser/blocks/dates.ts:48`); `dates` also has `loadIn` (`:59`). Show-day fallback resolves against `dates.showDays` ONLY (never `set`/`travelIn`/`travelOut` — spec §4.1 step 3 / R7).
- **`extract-internal-code-enums.ts`** scans every file under `lib/parser` whose source matches `/\bParseWarning\b|\bwarnings\b|hardErrors/` for `code:` literals (`scripts/extract-internal-code-enums.ts:70-71`). So the new `lib/parser/blocks/agenda.ts` is auto-scanned once it references `ParseWarning`; `pnpm gen:internal-code-enums` must regenerate `lib/messages/__generated__/internal-code-enums.ts` in the SAME commit (else `tests/cross-cutting/no-raw-codes.test.ts` `expect(INTERNAL_CODE_ENUMS).toEqual(extracted)` at `:34` fails — that's the x2 gate, double-counted by package script `:30`).

**East Coast production grid (ground truth for the anti-tautology test — `fixtures/shows/exporter-xlsx/east-coast.md:99-105`):**
```
row(day-TYPE) : TRAVEL DAY ×3 | SET DAY ×3 | DAY 1 ×6 | DAY 2 ×6 | TRAVEL DAY ×3
row(DATE)     : 5/13/24 ×3 | 5/14/24 ×3 | 5/15/24 ×6 | 5/16/24 ×6 | 5/17/24 ×3
row(day-NAME) : Monday ×3 | Tuesday ×3 | Wednesday ×6 | Thursday ×6 | Friday ×3
row(token-hdr): NAME|ARRIVAL|FLIGHT#|TIME|TITLE|ROOM|START |FINISH|TRT|TITLE|ROOM|AV|START |FINISH|TRT|TITLE|ROOM|AV|TIME| | |
data row 1    : (idx0-5 blank) | 7:15 AM | 7:30 AM | 0:15 | Family Office Only Breakfast | (blank) | NONE | 8:00 AM | … (DAY 2 cols 12-17)
```
DAY 1 block opens at **absolute col idx 6** (`START `), columns `[6=start, 7=finish, 8=trt, 9=title, 10=room, 11=av]`; DAY 2 at idx 12 (`[12..17]`). Day 1 ISO = `2024-05-15`. First emitted entry = `{ start:"7:15 AM", finish:"7:30 AM", trt:"0:15", title:"Family Office Only Breakfast", av:"NONE" }` (no `room` — blank cell). This is what the positive test reads back by clone-and-read, never hardcodes.

---

## §4.1 grid-shape coherence checklist (comprehensive — closes the R4/R7/R8/R13 cell-detection vector)

Four consecutive adversarial rounds hit the cell-detection vector — R4 (outer table boundary: the walk ran into PULL SHEET), R7 (inner structural rows: banners read as data), R8 (all-`#REF!` DATE banner invisible to value-only detection), R13 (markdown-ESCAPED cells `\#REF\!`/`\#N/A`/`FLIGHT\#` invisible to every detector because `parseTableRows` doesn't unescape). Per the same-vector-recurrence + structural-defense-calibration rules, the convergence is **STRUCTURAL, not per-instance**. The parser pipeline is **normalize → detect → isolate → structural-skip → span → resolve**, and the load-bearing principles are:

- **ONE normalization boundary (R13):** `cleanRows(parseTableRows(block))` runs `clean()` (`s.replace(/\\(.)/g,"$1").trim()`, `_helpers.ts:45`) over EVERY cell ONCE, immediately after isolation — so NO detector ever sees a raw escaped cell. `normHeaderCell` also cleans (it runs on raw lines during isolation, pre-`cleanRows`). The live exporter emits `\#REF\!` / `\#N/A` / `\#NUM\!` banners (consultants.md:236-237, rpas.md:237, east-coast.md:4) and `FLIGHT\#` token-headers (consultants:238) — all collapse to `#REF!`/`#N/A`/`FLIGHT#` before detection.
- **DETECTION/SHAPE is separated from VALUE/RESOLUTION at every stage:** block SPANS come from the token-header `START` columns (value-independent); structural rows are detected by SHAPE (`#REF!` counts); the DATE value is RESOLVED separately (`resolveBlock`): valid M/D/YY → use it; `#REF!`/blank → day-name→`showDays`-unique fallback; zero/multiple → UNRESOLVED + warning. Never a silent drop, never a banner-cell-as-title.

Every grid shape in the corpus/spec, traced end-to-end against the REAL committed `fixtures/shows/exporter-xlsx/*` (this is the audit, not a sample):

| Grid shape (real fixture) | Normalize | Detect (token-hdr) | Isolate | Structural-skip rows | Span (START cols) | Resolve | Net |
|---|---|---|---|---|---|---|---|
| **DATE-header filled (east-coast.md:99-122)** — DATE row promoted to md-header; day-name/token-hdr/day-TYPE body rows; trailed by ROOM/PULL SHEET | no escapes in agenda block | token-hdr by content | maximal pipe-run; PULL SHEET/ROOM excluded (R4) | DATE+day-name+day-TYPE+token-hdr skipped by identity (R7) | START 6,12 → 2 blocks | banner `5/15/24`,`5/16/24` → ISO | DAY1+DAY2 keyed, sessions parsed |
| **DATE-header filled (ria.md:316-322)** | no escapes | token-hdr by content | same | same | START 6,12 | banner `6/25/25`,`6/26/25` → ISO | both days keyed |
| **day-TYPE-header empty (rpas.md:210-213)** — day-TYPE promoted; DATE/day-name/token-hdr body rows; `\#N/A` further down | `\#N/A` cleaned | token-hdr by content | same | DATE+day-name+day-TYPE+token-hdr skipped (R7) | START cols → 3 blocks | banners valid → ISO | all-`[]` (blank TITLEs), no banner-as-entry |
| **ESCAPED-error banners (consultants.md:235-238, R13)** — day-TYPE header; DATE banner `\#REF\! … 10/8/25`; day-name `\#REF\! … Wednesday`; token-hdr `…FLIGHT\#…` | **`\#REF\!`→`#REF!`, `FLIGHT\#`→`FLIGHT#` (cleanRows)** | token-hdr by content (cleaned) | same | cleaned DATE banner IS shape-detected → skipped; cleaned day-name banner skipped (R8 detector on cleaned cells) | START 6,12,18 → 3 blocks | DAY cols have real `10/8/25` etc → ISO; travel `#REF!` cols are SET/travel (no START) | 3 days, blank TITLEs → all-`[]`; **no `10/8/25`/weekday/`#REF!` title** |
| **all-`#REF!` DATE banner (synthetic + template copies, R8)** — DATE cells all `#REF!` | cleaned (idempotent) | token-hdr by content | same | `#REF!` DATE banner shape-detected → skipped; day-name row structural only if it has a real weekday, else it too is a date banner | START cols → blocks STILL created | banner null → day-name fallback; both `#REF!`/no-match → UNRESOLVED + `AGENDA_BLOCK_UNRESOLVED` | block exists, warning emits, no `#REF!` title |
| **prefix-header (`Wednesday/START`, `#REF!/NAME` — spec §4.1 variant)** — day-name merged into header-cell prefixes; no separate DATE/day-name row | cleaned | token-hdr after prefix-strip (R9) | same | only the prefix token-hdr row is structural | prefix `START` cols → blocks; dayName from prefix | dayName→`showDays` fallback; `#REF!` prefix → UNRESOLVED | resolves via day-name or warns |
| **trailing-space `"START "`** | clean trims | `normHeaderCell` trims → matches | — | — | `normHeader[c]==="START"` → START col | — | block created correctly |
| **ragged / short data rows** (trailing empties trimmed) | — | — | — | a short data row is NOT structural | — | `buildEntry` right-pads (`cells[i] ?? ""`) — short ≠ malformed |
| **ambiguous weekday** (`#REF!` banner + day-name matching ≥2 same-weekday showDays) | — | — | — | banner skipped | block created | day-name → 2 matches → `skip:"ambiguous"` | UNRESOLVED + `AGENDA_DAY_AMBIGUOUS` (never guess, R2) |
| **no token-header at all** (unlocatable grid) | — | not found | `isolateAgendaTable` → `undefined` | — | — | — | `runOfShow: undefined` + `AGENDA_GRID_MALFORMED` (D-2) |

Each row is pinned by a test (Tasks 1.3–1.6 + the R7/R8/R13 describe + the LOAD-BEARING describe). If a future round surfaces ANOTHER cell-detection finding, the analysis was still incomplete — stop patching and re-derive this table against the failing shape. **Residual honesty:** the one shape NOT in the committed corpus is a true `Wednesday/START` prefix-header (the spec §4.1 cites `2025-10-consultants-roundtable.md:210` from the stale `raw/` corpus; the current exporter emits consultants as the plain ESCAPED-error shape above, NOT prefix-form). The prefix-form branch is retained as defensive (it harms nothing if never hit) and is pinned only by synthetics — flagged so a reviewer doesn't expect a real-fixture prefix-form test.

---

## Tasks (TDD: red → green → commit, 2–5 min steps)

### Task 1.1 — Demote stale `raw/` AGENDA fixtures; pin the production-exporter fixtures as the source of truth

**Files:** `tests/parser/agenda.fixtures.test.ts` (new) · reads `fixtures/shows/exporter-xlsx/east-coast.md`, `fixtures/shows/exporter-xlsx/ria.md`.
**Interfaces — Consumes:** the already-captured production fixtures (no regen needed — 2026-06-18 capture is current). **Produces:** a pinned assertion that the filled grids exist in the exporter-xlsx corpus (the source of truth for §01's positive tests), so a converter regression that drops the token-header fails here.

This task has no production code — it pins fixture provenance so later tasks can clone-and-read from a known-good shape, and demotes the stale `raw/` fixtures in prose.

- [ ] **Write failing test** — `tests/parser/agenda.fixtures.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

// The PRODUCTION exporter (synthesizeMarkdownFromXlsx, lib/drive/exportSheetToMarkdown.ts:186)
// is what parseSheet sees in prod. Its 2026-06-18 capture lives in fixtures/shows/exporter-xlsx/.
// The fixtures/shows/raw/* corpus is the Drive-MCP renderer (a DIFFERENT shape) — stale for AGENDA,
// kept ONLY as fail-soft robustness inputs (Task 1.7). These two fixtures carry FILLED AGENDA grids.
const EXPORTER = "fixtures/shows/exporter-xlsx";

describe("agenda fixtures — production-exporter filled grids are the source of truth", () => {
  it("East Coast exporter fixture carries the canonical AGENDA token-header", () => {
    const md = readFileSync(`${EXPORTER}/east-coast.md`, "utf8");
    // token-header is the reliable anchor: NAME | ARRIVAL | FLIGHT# | ... | START | FINISH | TRT
    expect(md).toMatch(/NAME\s*\|\s*ARRIVAL\s*\|\s*FLIGHT\\?#/);
    expect(md).toMatch(/START\s*\|\s*FINISH\s*\|\s*TRT/);
    // and real session content (not an auto-time skeleton)
    expect(md).toContain("Family Office Only Breakfast");
    expect(md).toContain("Opening Keynote");
  });

  it("RIA exporter fixture carries a filled AGENDA token-header + sessions", () => {
    const md = readFileSync(`${EXPORTER}/ria.md`, "utf8");
    expect(md).toMatch(/NAME\s*\|\s*ARRIVAL\s*\|\s*FLIGHT\\?#/);
    expect(md).toMatch(/START\s*\|\s*FINISH\s*\|\s*TRT/);
    expect(md).toContain("Attendee Registration and Breakfast");
  });
});
```
- [ ] **Run, verify fails** — `pnpm vitest run tests/parser/agenda.fixtures.test.ts -t 'production-exporter'`. Expected: file under test does not exist yet → vitest reports "No test files found" / module-not-found; after creating the test, if the RIA `toContain("Attendee Registration and Breakfast")` string differs, the test fails — **at that point open `fixtures/shows/exporter-xlsx/ria.md`, grep the first real session title, and use the exact string (clone-and-read), do not invent one.** First red is the missing-file/missing-string failure.
- [ ] **Minimal impl** — none (fixtures already committed at 2026-06-18). If RIA's first session string differs, fix the literal in the test to the grepped value. No production code.
- [ ] **Run, verify passes** — `pnpm vitest run tests/parser/agenda.fixtures.test.ts`. Green.
- [ ] **Commit** — `git add tests/parser/agenda.fixtures.test.ts && git commit -m "test(parser): pin production-exporter AGENDA fixtures as source of truth; demote raw/ to robustness inputs"`

---

### Task 1.2 — `AgendaEntry` type + `runOfShow?` on `ParsedSheet` and `ParseResult`

**Files:** `lib/parser/types.ts` · `tests/parser/agendaTypes.test.ts` (new, type-level).
**Interfaces — Produces:** `AgendaEntry` (`{ start, finish?, trt?, title, room?, av? }`); `ParsedSheet.runOfShow?: Record<string, AgendaEntry[]>`; `ParseResult.runOfShow?: Record<string, AgendaEntry[]>`. **Consumes:** nothing (leaf types). **NOTE the data flow:** declaring `ParseResult.runOfShow?` does NOT auto-populate it — `ParseResult` is built by `enrichWithDrivePins`'s field-by-field return literal, which must be edited to copy the field (Task 1.9). The §02 sync reads `parseResult.runOfShow` (the consumer), so Task 1.9's copy is load-bearing — without it the parsed agenda is silently dropped at the bridge.

`runOfShow` is OPTIONAL on both shapes (sibling of `warnings`, between `warnings` and `hardErrors`) so it survives sync enrichment `ParsedSheet → ParseResult` (carried by Task 1.9's explicit copy) and does NOT break the ~30 existing `parseSheet` return sites. Under `exactOptionalPropertyTypes` an absent field ≠ `undefined`; `parseAgenda` returns `undefined` for unlocatable, but `parseSheet` (Task 1.8) sets the field to the parser's `Record | undefined`, so the field type stays `Record<...> | undefined` via `?`. **It is NOT a `ShowRow` field** (R18 — `ShowRow` is the crew-readable `public.shows` projection at `types.ts:82`; `run_of_show` must never ride it).

- [ ] **Write failing test** — `tests/parser/agendaTypes.test.ts`:
```ts
import { describe, it, expect, expectTypeOf } from "vitest";
import type { AgendaEntry, ParsedSheet, ParseResult } from "@/lib/parser/types";

describe("AgendaEntry + runOfShow type surface", () => {
  it("AgendaEntry requires start+title, optionals are string|undefined", () => {
    const e: AgendaEntry = { start: "7:15 AM", title: "Opening Keynote" };
    expectTypeOf(e.start).toEqualTypeOf<string>();
    expectTypeOf(e.title).toEqualTypeOf<string>();
    expectTypeOf<AgendaEntry["finish"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<AgendaEntry["room"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<AgendaEntry["av"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<AgendaEntry["trt"]>().toEqualTypeOf<string | undefined>();
    expect(e.title).toBe("Opening Keynote");
  });

  it("ParsedSheet + ParseResult carry an optional runOfShow Record", () => {
    expectTypeOf<ParsedSheet["runOfShow"]>().toEqualTypeOf<
      Record<string, AgendaEntry[]> | undefined
    >();
    expectTypeOf<ParseResult["runOfShow"]>().toEqualTypeOf<
      Record<string, AgendaEntry[]> | undefined
    >();
  });

  it("AgendaEntry is NOT reachable from ShowRow (admin-only, R18)", () => {
    // @ts-expect-error — ShowRow must not carry run_of_show / runOfShow
    const _bad: import("@/lib/parser/types").ShowRow["runOfShow"] = undefined;
    void _bad;
  });
});
```
- [ ] **Run, verify fails** — `pnpm vitest run tests/parser/agendaTypes.test.ts -t 'type surface'`. Expected: `AgendaEntry` import unresolved + `ParsedSheet["runOfShow"]` is `unknown`/missing → type errors / the `@ts-expect-error` line is "unused" (because `ShowRow["runOfShow"]` is already an error pre-edit, inverting the expectation). Confirms the types don't exist.
- [ ] **Minimal impl** — in `lib/parser/types.ts`, insert `AgendaEntry` immediately before `export type ParsedSheet = {` (`:315`):
```ts
/**
 * One AGENDA run-of-show session row (§4.1). All fields are sheet-DISPLAY
 * strings — never re-parsed to Date (D-1). `title` is REQUIRED and is the
 * "filled" signal: parseAgenda only emits an entry when TITLE is REAL
 * (non-empty AND not a generic sentinel — shouldHideGenericOptional).
 */
export type AgendaEntry = {
  start: string;
  finish?: string;
  trt?: string;
  title: string;
  room?: string;
  av?: string;
};
```
Then add to `ParsedSheet` between `warnings: ParseWarning[];` (`:330`) and `hardErrors: ParseError[];` (`:331`):
```ts
  // AGENDA run-of-show (Phase 2). ISO date -> entries. undefined = grid
  // unlocatable (D-1/D-2). Sibling of warnings; NOT on ShowRow (admin-only, R18).
  runOfShow?: Record<string, AgendaEntry[]>;
```
And the identical block in `ParseResult` between its `warnings` (`:353`) and `hardErrors` (`:354`).
- [ ] **Run, verify passes** — `pnpm vitest run tests/parser/agendaTypes.test.ts` + `pnpm tsc --noEmit` (typecheck clean; no existing `parseSheet` site breaks because the field is optional).
- [ ] **Commit** — `git add lib/parser/types.ts tests/parser/agendaTypes.test.ts && git commit -m "feat(parser): add AgendaEntry type + optional runOfShow on ParsedSheet/ParseResult"`

---

### Task 1.3 — `agendaWarnings.ts` (ALL 5 `AGENDA_*` `code:` helpers, lib/parser) + `parseAgenda` skeleton: locate grid → `undefined` + `AGENDA_GRID_MALFORMED`

**Files:** `lib/parser/blocks/agendaWarnings.ts` (new — holds all 5 `code:` literals) · `lib/parser/blocks/agenda.ts` (new) · `tests/parser/parseAgenda.test.ts` (new).
**Interfaces — Produces:** the 5 `ParseWarning` factory helpers (`agendaGridMalformed`, `agendaBlockUnresolved`, `agendaDayAmbiguous`, `agendaDayTruncated`, `agendaDayEmptied`); `parseAgenda(markdown: string): { runOfShow: Record<string, AgendaEntry[]> | undefined; warnings: ParseWarning[] }`. **Consumes:** `parseTableRows` (`_helpers.ts:18`), `ParseWarning`/`AgendaEntry` (`types.ts`).

**Why a dedicated `agendaWarnings.ts` (extractor scoping — verified live):** the `internal-code-enums` extractor's `parse_warnings.code` pass scans `readFiles(["lib/parser"])` ONLY, gated on `/ParseWarning|warnings|hardErrors/`, matching `code:`-PROPERTY literals via `CODE_PROPERTY_RE` (`scripts/extract-internal-code-enums.ts:69-72`). A `code:"AGENDA_DAY_EMPTIED"` literal living only in `lib/sync` (where the §02 sync emits it) would **NOT** be extracted by that pass. So **all 5 `code:` literals must physically live under `lib/parser`** to be regenerated. The parser EMITS only 4 (grid-malformed, block-unresolved, day-ambiguous, day-truncated); the §02 sync IMPORTS `agendaDayEmptied` from this module and emits the 5th — but because the literal lives in `lib/parser/blocks/agendaWarnings.ts`, the extractor picks up **all 5 in §01**. This removes the §01↔§02 precondition deadlock (no "5th regens later").

Step 1 of `parseAgenda` (§4.1): find the markdown table whose rows include a **token-header** — a row whose cells, after `cell.replace(/^[^/]*\//, "").trim()` (strip an optional leading `<prefix>/` segment incl `#REF!/`) and uppercasing, include `NAME` AND `ARRIVAL` AND (`START` OR `FINISH` OR `TRT`). The trailing-space `"START "` is handled by `.trim()`. No token-header found → `{ runOfShow: undefined, warnings: [agendaGridMalformed(0)] }`.

**CRITICAL — isolate the AGENDA table's OWN contiguous block first (do NOT flatten the whole doc).** `parseTableRows(markdown)` (`_helpers.ts:18`) flattens EVERY `|…|` line in the WHOLE document into one array — it skips non-pipe lines with `continue`, NOT `break`, so it does NOT preserve table boundaries. The AGENDA table is followed by other tables (in `fixtures/shows/exporter-xlsx/east-coast.md`: AGENDA ends line 122 `Loop video`, blank line 123, then ROOM DIMENSIONS line 124 + PULL SHEET line 133+). Because the data-row walk reads `title` at an ABSOLUTE column (`startCol+3` → idx 9/15/21), a later PULL SHEET / ROOM row with any value at that column would be emitted as a **bogus `AgendaEntry` title** → persisted to `shows_internal.run_of_show` → shown to crew. So `parseAgenda` MUST first extract only the **contiguous run of `|…|` lines containing the token-header**, bounded above and below by a **blank line OR a non-pipe line OR EOF** — the established repo boundary rule (the exporter separates blocks with a blank row; `crew.ts:158-167` "a blank line ends the TECH table", `index.ts:182-184` "hit a blank line, stop scanning"). Then call `parseTableRows` on ONLY that block. **Concrete failure mode caught:** post-AGENDA PULL SHEET / ROOM DIMENSIONS table cells leaking as bogus crew run-of-show entries; a malformed/missing AGENDA grid throwing instead of `undefined`+warning; the enum-extraction/precondition deadlock if `AGENDA_DAY_EMPTIED` lived only in `lib/sync`.

- [ ] **Write failing test** — `tests/parser/parseAgenda.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseAgenda } from "@/lib/parser/blocks/agenda";

describe("parseAgenda — step 1: grid location (fail-soft)", () => {
  it("no token-header anywhere → undefined + AGENDA_GRID_MALFORMED (never throws)", () => {
    const md = "| FOO | BAR |\n| :-: | :-: |\n| a | b |\n";
    const r = parseAgenda(md);
    expect(r.runOfShow).toBeUndefined();
    expect(r.warnings.map((w) => w.code)).toContain("AGENDA_GRID_MALFORMED");
    expect(r.warnings[0]!.severity).toBe("warn");
    expect(r.warnings[0]!.blockRef).toEqual({ kind: "agenda", index: 0 });
  });

  it("empty markdown → undefined + AGENDA_GRID_MALFORMED (no throw)", () => {
    expect(() => parseAgenda("")).not.toThrow();
    expect(parseAgenda("").runOfShow).toBeUndefined();
  });

  it("locates a plain token-header table (returns a Record, not undefined)", () => {
    const md = [
      "| NAME | ARRIVAL | FLIGHT# | TIME | TITLE | ROOM | START  | FINISH | TRT | TITLE | ROOM | AV |",
      "| 9/3/25 | 9/3/25 | 9/3/25 | 9/4/25 | 9/4/25 | 9/4/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 |",
      "| Wed | Wed | Wed | Thu | Thu | Thu | Fri | Fri | Fri | Fri | Fri | Fri |",
    ].join("\n");
    // grid located → not undefined (day resolution is later tasks; here just "located")
    expect(parseAgenda(md).runOfShow).not.toBeUndefined();
  });

  it("locates a prefix-form token-header (#REF!/NAME, Wednesday/START) after prefix-strip", () => {
    const md = "| #REF!/NAME | Tuesday/ARRIVAL | Tuesday/FLIGHT# | Wednesday/START | Wednesday/FINISH | Wednesday/TRT |";
    expect(parseAgenda(md).runOfShow).not.toBeUndefined();
  });

  it("a following table (after a blank line) is OUTSIDE the located AGENDA block — grid still located, no crash", () => {
    // Location-only smoke: a PULL SHEET table after a blank line must not change WHERE
    // the grid is located. The no-bleed-into-entries assertion is the Task 1.6 regression
    // test (it needs the data walk). Here we only confirm isolation does not throw / lose the grid.
    const md = [
      "| NAME | ARRIVAL | FLIGHT# | START  | FINISH | TRT | TITLE | ROOM | AV |",
      "| 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 |",
      "| Fri | Fri | Fri | Fri | Fri | Fri | Fri | Fri | Fri |",
      "|  |  |  | 8:00 AM | 9:00 AM | 1:00 | Real Session | Hall | LAV |",
      "", // blank line ends the AGENDA table (exporter block separator)
      "| PULL SHEET | PULL SHEET | PULL SHEET | PULL SHEET |",
      "| FALSE | 1 | FOH Rack | FOH |",
    ].join("\n");
    expect(() => parseAgenda(md)).not.toThrow();
    expect(parseAgenda(md).runOfShow).not.toBeUndefined();
  });
});

describe("agendaWarnings — all 5 AGENDA_* codes are lib/parser code: literals", () => {
  it("each factory carries its code + warn severity + agenda blockRef", () => {
    expect(agendaGridMalformed(0).code).toBe("AGENDA_GRID_MALFORMED");
    expect(agendaBlockUnresolved(1).code).toBe("AGENDA_BLOCK_UNRESOLVED");
    expect(agendaDayAmbiguous(2).code).toBe("AGENDA_DAY_AMBIGUOUS");
    expect(agendaDayTruncated(3).code).toBe("AGENDA_DAY_TRUNCATED");
    expect(agendaDayEmptied(4, "2025-09-05").code).toBe("AGENDA_DAY_EMPTIED");
    for (const w of [
      agendaGridMalformed(0), agendaBlockUnresolved(1), agendaDayAmbiguous(2),
      agendaDayTruncated(3), agendaDayEmptied(4, "2025-09-05"),
    ]) {
      expect(w.severity).toBe("warn");
      expect(w.blockRef!.kind).toBe("agenda");
    }
  });
});
```
Add the imports at the top of the test file:
```ts
import {
  agendaGridMalformed, agendaBlockUnresolved, agendaDayAmbiguous,
  agendaDayTruncated, agendaDayEmptied,
} from "@/lib/parser/blocks/agendaWarnings";
```
- [ ] **Run, verify fails** — `pnpm vitest run tests/parser/parseAgenda.test.ts -t 'step 1'` and `-t 'all 5 AGENDA'`. Expected: `parseAgenda` + `agendaWarnings` unresolved imports → module-not-found.
- [ ] **Minimal impl (a)** — `lib/parser/blocks/agendaWarnings.ts` (ALL 5 `code:` literals live here so the extractor picks them all up; the parser emits 4, the §02 sync imports + emits `agendaDayEmptied`):
```ts
import type { ParseWarning } from "../types";

export function agendaGridMalformed(index: number): ParseWarning {
  return { severity: "warn", code: "AGENDA_GRID_MALFORMED", message: "AGENDA grid token-header not locatable", blockRef: { kind: "agenda", index } };
}
export function agendaBlockUnresolved(index: number): ParseWarning {
  return { severity: "warn", code: "AGENDA_BLOCK_UNRESOLVED", message: "AGENDA block date/day-name could not be resolved", blockRef: { kind: "agenda", index } };
}
export function agendaDayAmbiguous(index: number): ParseWarning {
  return { severity: "warn", code: "AGENDA_DAY_AMBIGUOUS", message: "AGENDA day-name matches multiple show days; block skipped", blockRef: { kind: "agenda", index } };
}
export function agendaDayTruncated(index: number): ParseWarning {
  return { severity: "warn", code: "AGENDA_DAY_TRUNCATED", message: "AGENDA day hit a storage cap; entries/fields truncated", blockRef: { kind: "agenda", index } };
}
/** Emitted by the §02 SYNC write path (not the parser) when a previously-stored day is now read-empty. Defined here so its code: literal lives in lib/parser for the internal-code-enums extractor. */
export function agendaDayEmptied(index: number, iso: string): ParseWarning {
  return { severity: "warn", code: "AGENDA_DAY_EMPTIED", message: `AGENDA day ${iso} previously stored is now read-empty; not stored (anchors)`, blockRef: { kind: "agenda", index } };
}
```
- [ ] **Minimal impl (b)** — `lib/parser/blocks/agenda.ts`:
```ts
import type { AgendaEntry, ParseWarning } from "../types";
import { clean, normalizeDate, parseTableRows } from "./_helpers";
import { agendaGridMalformed } from "./agendaWarnings";

export type ParseAgendaResult = {
  runOfShow: Record<string, AgendaEntry[]> | undefined;
  warnings: ParseWarning[];
};

const WEEKDAYS = new Set([
  "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY",
]);

// ── SINGLE NORMALIZATION BOUNDARY (R13 — closes the markdown-escape class) ──
// parseTableRows returns cells that are trimmed but NOT unescaped — the live
// exporter emits backslash-escaped cells: `\#REF\!` / `\#N/A` / `\#NUM\!` in DATE
// & day-name banners (fixtures/shows/exporter-xlsx/consultants.md:236-237,
// rpas.md:237, east-coast.md:4) and `FLIGHT\#` in the token-header (consultants:238).
// EVERY downstream detector + value read MUST operate on cells passed through
// `clean()` (strips `\(.)` escapes + trims) so NO detector ever sees a raw escaped
// cell. `cleanRows` is applied ONCE, right after parseTableRows; `normHeaderCell`
// also cleans (it runs on raw LINES during isolation, before cleanRows). This is the
// structural defense for the whole escape class — not a per-token REF_ERR_RE patch.
function cleanCell(cell: string): string {
  return clean(cell); // `s.replace(/\\(.)/g, "$1").trim()` — _helpers.ts:45
}
function cleanRows(rows: string[][]): string[][] {
  return rows.map((r) => r.map(cleanCell));
}

/** Strip a leading `<prefix>/` segment (incl `#REF!/`, `Wednesday/`), unescape, trim, uppercase. */
function normHeaderCell(cell: string): string {
  return clean(cell).replace(/^[^/]*\//, "").trim().toUpperCase();
}

function isTokenHeaderRow(cells: string[]): boolean {
  const norm = cells.map(normHeaderCell);
  const has = (t: string) => norm.includes(t);
  return has("NAME") && has("ARRIVAL") && (has("START") || has("FINISH") || has("TRT"));
}

function isTokenHeaderLine(line: string): boolean {
  const t = line.trim();
  if (!t.startsWith("|")) return false;
  const parts = t.split("|");
  const cells = parts.slice(1, parts.length - 1).map((s) => s.trim());
  return isTokenHeaderRow(cells);
}

/**
 * Isolate the AGENDA table's OWN contiguous markdown block — the run of `|…|`
 * lines that CONTAINS the token-header — bounded above/below by a blank line, a
 * non-pipe line, or EOF. The exporter separates tables with a blank row, so the
 * AGENDA table is the maximal pipe-line run around its token-header. Returns the
 * block's markdown (token-header + DATE/day-name/data rows), or undefined if no
 * token-header line exists. This is what prevents the walk from running INTO the
 * following ROOM DIMENSIONS / PULL SHEET tables (whose absolute-column cells
 * would otherwise emit as bogus AgendaEntry titles).
 */
function isolateAgendaTable(markdown: string): string | undefined {
  const lines = markdown.split("\n");
  const hdr = lines.findIndex(isTokenHeaderLine);
  if (hdr === -1) return undefined;
  const isPipe = (l: string) => l.trim().startsWith("|");
  let start = hdr;
  while (start - 1 >= 0 && isPipe(lines[start - 1]!)) start--;
  let end = hdr; // inclusive
  while (end + 1 < lines.length && isPipe(lines[end + 1]!)) end++;
  return lines.slice(start, end + 1).join("\n");
}

// ── Structural-row identification (R7/R8 — banner rows must NEVER parse as data) ──
// The converter promotes a VARYING banner to the md-table header (filled East
// Coast promotes day-TYPE; other shapes promote DATE), and parseTableRows keeps
// the md-header as just another row — so the DATE / day-name / day-TYPE / token-
// header rows can appear ABOVE OR BELOW each other in `rows`. The data walk must
// therefore skip structural rows BY IDENTITY (content), not by `headerIdx+1`
// position — else a banner row read at absolute columns emits a bogus title.
//
// R8 — DETECTION IS SEPARATED FROM VALUE-VALIDITY. A row is the structural DATE
// banner if its NON-BLANK cells are date-SHAPED — each is `M/D/YY` (normalizes)
// OR a `#REF!`/error token — regardless of whether ANY value normalizes. (Spec
// §4.1: `#REF!` appears in the standardized-template DATE/day-name banner cells.)
// So an all-`#REF!` DATE banner is detected as structural (→ never walked as data
// → no bogus `#REF!` titles) AND still seeds block spans (→ blocks are created →
// resolveBlock runs → AGENDA_BLOCK_UNRESOLVED/AGENDA_DAY_AMBIGUOUS DO emit, never
// a silent drop). The OLD value-only `normalizeDate(...) >= 2` test missed this.

// Spreadsheet error tokens (POST-clean — backslashes already stripped by cleanRows).
// Liberal: covers #REF!, #N/A, #VALUE!, #DIV/0!, #NAME?, #NUM!, #NULL!, with or
// without the trailing !/?. (cleanRows turns `\#REF\!` → `#REF!` before this runs.)
const REF_ERR_RE = /^#(REF|N\/A|VALUE|DIV\/0|NAME|NUM|NULL)[!?]?$/i;
function isDateShapedCell(c: string): boolean {
  const t = c.trim(); // cells already cleaned at the boundary; trim is belt-and-suspenders
  return t === "" || normalizeDate(t) !== null || REF_ERR_RE.test(t);
}
/**
 * Structural DATE-banner detector (shape, NOT value): a row whose non-blank cells
 * are ALL date-shaped (M/D/YY or #REF!/error) AND that carries ≥2 such non-blank
 * cells AND ≥1 that is an actual error/date token (so a fully-blank row or a free-
 * text row is not mistaken for the banner). Cross-checked at the caller against the
 * token-header START columns + the day-name/day-TYPE alignment.
 */
function isDateBannerRow(cells: string[]): boolean {
  const nonBlank = cells.filter((c) => c.trim() !== "");
  if (nonBlank.length < 2) return false;
  if (!nonBlank.every(isDateShapedCell)) return false;
  // must contain at least one date-or-error token (not e.g. all empty handled above)
  return nonBlank.some((c) => normalizeDate(c.trim()) !== null || REF_ERR_RE.test(c.trim()));
}
function isDayNameRow(cells: string[]): boolean {
  // day-NAME banner: ≥2 cells that are a weekday OR a `#REF!`/error (template copies
  // carry #REF! in the day-name banner too) — shape, not pure value.
  const flagged = cells.filter((c) => {
    const t = c.trim();
    return WEEKDAYS.has(t.toUpperCase()) || REF_ERR_RE.test(t);
  });
  // require ≥1 real weekday so a #REF!-only row isn't double-counted as the day-name
  // banner (it's the DATE banner); the date-banner detector already covers all-#REF!.
  return flagged.length >= 2 && cells.some((c) => WEEKDAYS.has(c.trim().toUpperCase()));
}
const DAY_TYPE_RE = /^(TRAVEL DAY|SET DAY|DAY\s+\d+)$/i;
function isDayTypeRow(cells: string[]): boolean {
  return cells.filter((c) => DAY_TYPE_RE.test(c.trim())).length >= 2;
}

/** Indices in `rows` that are STRUCTURAL (token-header, DATE banner, day-name, day-TYPE) — never data. */
function structuralRowIndices(rows: string[][]): Set<number> {
  const s = new Set<number>();
  rows.forEach((cells, i) => {
    if (
      isTokenHeaderRow(cells) || isDateBannerRow(cells) ||
      isDayNameRow(cells) || isDayTypeRow(cells)
    ) {
      s.add(i);
    }
  });
  return s;
}

export function parseAgenda(markdown: string): ParseAgendaResult {
  const block = isolateAgendaTable(markdown);
  if (block === undefined) {
    return { runOfShow: undefined, warnings: [agendaGridMalformed(0)] };
  }
  // THE normalization boundary (R13): clean ONCE here. Everything below — structural
  // detection, span location, date resolution, the data walk — consumes `rows`, so
  // no detector ever sees a raw escaped cell (`\#REF\!` → `#REF!`, `FLIGHT\#` → `FLIGHT#`).
  const rows = cleanRows(parseTableRows(block)); // ONLY the AGENDA table's rows, cleaned
  const headerIdx = rows.findIndex(isTokenHeaderRow);
  const structural = structuralRowIndices(rows); // token-header + DATE banner + day-name + day-TYPE
  // Data rows = every row that is NOT structural (position-independent — banners
  // may sit above OR below the token-header). Day resolution + data walk: Tasks 1.4–1.6.
  return { runOfShow: {}, warnings: [] };
}
```
> Note the boundary rule: the AGENDA block = the maximal run of consecutive `|…|` lines surrounding the token-header line. A blank line, a non-pipe line, or EOF terminates it (mirrors `crew.ts:158-167` / `index.ts:182-184`). `parseTableRows` runs on `block` only, so `rows` never contains a post-AGENDA table row. **AND** the data walk (Task 1.6) iterates only NON-structural rows (`structuralRowIndices`), so a DATE / day-name / day-TYPE banner left as a body row is never read at absolute columns. **R8 closes the last gap: the date-banner detector is shape-based (`#REF!` counts), so an all-error banner is still skipped as data AND still seeds spans.** Three halves of one invariant: **R4 = OUTER table boundary; R7 = INNER structural rows (by identity, not position); R8 = structural detection independent of value-validity (block spans come from the token-header START columns, dates are RESOLVED separately).**
> Tasks 1.4-1.7 import the remaining helpers (`agendaBlockUnresolved`, `agendaDayAmbiguous`, `agendaDayTruncated`) from `agendaWarnings.ts` instead of an inline `warn()` — replace any `warn("CODE", …)` call shown in later tasks with the matching factory.
- [ ] **Run, verify passes** — `pnpm vitest run tests/parser/parseAgenda.test.ts -t 'step 1'` and `-t 'all 5 AGENDA'`. Green.
- [ ] **Commit** — `git add lib/parser/blocks/agendaWarnings.ts lib/parser/blocks/agenda.ts tests/parser/parseAgenda.test.ts && git commit -m "feat(parser): agendaWarnings (all 5 AGENDA_* codes) + parseAgenda step 1 grid location"`

---

### Task 1.4 — Block spans from token-header START columns + shape-based DATE/day-name banners (R8-structural)

**Files:** `lib/parser/blocks/agenda.ts` · `tests/parser/parseAgenda.test.ts`.
**Interfaces — Produces:** an internal `blocks: { startCol, endCol, dateCell?, dayNameCell?, prefixDayName? }[]` (show-day blocks only). **Consumes:** the located `rows` from Task 1.3.

§4.1 step 2 (R8-structural): **block SPANS come from the token-header `START` columns, NOT from DATE-cell validity.** Every show day is the 6-col group `START|FINISH|TRT|TITLE|ROOM|AV`, so each `START` column in the token-header (after `normHeaderCell` trims the trailing-space `"START "`) opens exactly one block `[startCol, startCol+6)`. Travel (`NAME|ARRIVAL|FLIGHT#`) and set (`TIME|TITLE|ROOM`) groups have **no** `START` column → no block (travel/set skipped). The **DATE banner** and **day-NAME banner** rows are found BY SHAPE across the WHOLE isolated table (`isDateBannerRow` = all non-blank cells `M/D/YY` OR `#REF!`/error; `isDayNameRow` = ≥2 weekday/error cells with ≥1 real weekday) — position-independent (R7: they may be BELOW the token-header) and **value-independent (R8: an all-`#REF!` banner is still detected)**. Each block then reads its resolution inputs `dateCell = dateRow?.[startCol]` and `dayName = nameRow?.[startCol]` (which may be `M/D/YY`, `#REF!`, or `undefined` — all tolerated; resolved in Task 1.5). Anchoring spans to `START` makes the absolute-offset reads correct regardless of how wide the date banner is or whether its cells normalize. **Dual-form fallback:** a prefix-form table (`Wednesday/START`, `#REF!/NAME`) has no separate DATE/day-name row — the day-name lives in the header-cell prefix; blocks open at each prefixed `START` column with `dayName` from the prefix (a `#REF!` prefix → `dayName` undefined → resolves via fallback or warns). **Concrete failure mode caught:** keying spans off DATE-cell validity (so an all-`#REF!` banner produces NO blocks → silent drop, no warning — R8); off a fixed column stride (East Coast TRAVEL=3/SET=3/DAY=6 — non-uniform); off the day-TYPE row; or the read-origin landing on the wrong column.

**TDD note (invariant 1 — this task has a GENUINE red→green cycle, NOT a deferred one):** the impl EXPORTS a thin testable entry `locateAgendaShowBlocks(markdown)` that returns the classified show-day block descriptors (`{ startCol, endCol, dateCell, dayName }[]` — show-day blocks only, travel/set filtered out). The test asserts exact start-columns + that TRAVEL/SET spans are excluded, on a synthetic grid AND the real East Coast fixture. This RED-fails (function absent) before the impl and turns green after — a real task-local contract, not a smoke check. Day resolution/entries are still Tasks 1.5/1.6; this task owns ONLY boundaries + classification.

- [ ] **Write failing test** — append (the `readFileSync` import lands HERE in Task 1.4, the first task that reads a fixture; Task 1.6 reuses the same already-imported symbol — do not re-import):
```ts
import { readFileSync } from "node:fs";
import { locateAgendaShowBlocks } from "@/lib/parser/blocks/agenda";

describe("parseAgenda — step 2: locateAgendaShowBlocks (boundaries + show-day classification)", () => {
  const synthetic = [
    "| TRAVEL DAY | TRAVEL DAY | TRAVEL DAY | SET DAY | SET DAY | SET DAY | DAY 1 | DAY 1 | DAY 1 | DAY 1 | DAY 1 | DAY 1 |",
    "| 5/13/24 | 5/13/24 | 5/13/24 | 5/14/24 | 5/14/24 | 5/14/24 | 5/15/24 | 5/15/24 | 5/15/24 | 5/15/24 | 5/15/24 | 5/15/24 |",
    "| Monday | Monday | Monday | Tuesday | Tuesday | Tuesday | Wednesday | Wednesday | Wednesday | Wednesday | Wednesday | Wednesday |",
    "| NAME | ARRIVAL | FLIGHT# | TIME | TITLE | ROOM | START  | FINISH | TRT | TITLE | ROOM | AV |",
    "|  |  |  |  |  |  | 7:15 AM | 7:30 AM | 0:15 | Opening Keynote | Mabel 1 | LAV |",
  ].join("\n");

  it("returns EXACTLY one show-day block at startCol 6; TRAVEL(0)/SET(3) are filtered out", () => {
    const blocks = locateAgendaShowBlocks(synthetic);
    expect(blocks.map((b) => b.startCol)).toEqual([6]); // NOT [0,3,6] — travel/set excluded
    expect(blocks[0]!.dateCell).toBe("5/15/24");
    expect(blocks[0]!.dayName).toBe("Wednesday");
  });

  it("East Coast fixture: show-day blocks start at cols 6 and 12 (DAY 1, DAY 2); 5 banner dates → 2 show blocks", () => {
    const md = readFileSync("fixtures/shows/exporter-xlsx/east-coast.md", "utf8");
    const blocks = locateAgendaShowBlocks(md);
    // 5 dated banner columns (TRAVEL 5/13, SET 5/14, DAY1 5/15, DAY2 5/16, TRAVEL 5/17)
    // → exactly the two DAY blocks survive classification, at the absolute START columns.
    expect(blocks.map((b) => b.startCol)).toEqual([6, 12]);
    expect(blocks.map((b) => b.dateCell)).toEqual(["5/15/24", "5/16/24"]);
  });

  it("a grid with NO show-day span (only TRAVEL/SET) → empty block list (no false show day)", () => {
    const md = [
      "| TRAVEL DAY | TRAVEL DAY | TRAVEL DAY | SET DAY | SET DAY | SET DAY |",
      "| 5/13/24 | 5/13/24 | 5/13/24 | 5/14/24 | 5/14/24 | 5/14/24 |",
      "| Monday | Monday | Monday | Tuesday | Tuesday | Tuesday |",
      "| NAME | ARRIVAL | FLIGHT# | TIME | TITLE | ROOM |",
    ].join("\n");
    expect(locateAgendaShowBlocks(md)).toEqual([]);
  });
});
```
- [ ] **Run, verify fails** — `pnpm vitest run tests/parser/parseAgenda.test.ts -t 'step 2'`. Expected: `locateAgendaShowBlocks` is not exported from `@/lib/parser/blocks/agenda` → import resolves to `undefined` → `TypeError: locateAgendaShowBlocks is not a function` on first call. This is a genuine RED (the function does not exist), satisfying invariant 1.
- [ ] **Minimal impl** — add to `agenda.ts` (before `parseAgenda`), and refactor `parseAgenda` to consume blocks (`normalizeDate` is already imported in Task 1.3's snippet — do not re-import):
```ts
export type AgendaBlock = {
  startCol: number;
  endCol: number; // exclusive
  dateCell: string | undefined;
  dayName: string | undefined; // from day-NAME row OR header prefix
};

// Find the DATE / day-name banner rows BY CONTENT across the WHOLE isolated table
// (R7: position-independent — they may be BELOW the token-header). These are the
// SAME shape-based detectors structuralRowIndices uses (Task 1.3) — ONE source of
// truth, so "what is the DATE banner" is identical for span-resolution and for the
// data-walk skip. They detect the banner by SHAPE (#REF! included, R8), so the
// rows are found even when no value normalizes.
function findDateRow(rows: string[][]): string[] | undefined {
  return rows.find(isDateBannerRow);
}
function findDayNameRow(rows: string[][]): string[] | undefined {
  return rows.find(isDayNameRow);
}

/**
 * Build per-day SHOW blocks. **Spans come from the TOKEN-HEADER's START columns
 * (R8 — value-independent), NOT from DATE-cell validity.** The token-header is the
 * reliably-present anchor (spec §4.1); every show day is the 6-col group
 * `START|FINISH|TRT|TITLE|ROOM|AV`, so each `START` column in the token-header
 * opens exactly one show block `[startCol, startCol+6)`. The DATE banner + day-name
 * banner supply RESOLUTION inputs at each block's start column (whatever their
 * values — `#REF!`/blank tolerated; resolved in Task 1.5). Travel (`NAME|ARRIVAL|
 * FLIGHT#`) and set (`TIME|TITLE|ROOM`) groups have NO `START` column → no block.
 */
function locateBlocks(rows: string[][], header: string[], headerIdx: number): AgendaBlock[] {
  const dateRow = findDateRow(rows);     // whole table, shape-detected (#REF! ok)
  const nameRow = findDayNameRow(rows);  // whole table
  const normHeader = header.map(normHeaderCell);
  const blocks: AgendaBlock[] = [];

  // Prefix-form (e.g. `Wednesday/START`, `#REF!/NAME`): no separate DATE/day-name
  // row; the day-name lives in the header-cell prefix. Detect by ANY header cell
  // carrying a `<prefix>/START`. Otherwise use the plain token-header START columns.
  const prefixForm = header.some((c) => c.includes("/") && normHeaderCell(c) === "START");

  if (prefixForm) {
    for (let c = 0; c < header.length; c++) {
      const cell = header[c] ?? "";
      if (normHeaderCell(cell) !== "START") continue; // START token after prefix-strip
      const slash = cell.indexOf("/");
      const prefix = slash === -1 ? undefined : cell.slice(0, slash).trim();
      // a #REF! prefix is not a usable day-name; leave dayName undefined → resolve fails → UNRESOLVED
      const dayName = prefix && WEEKDAYS.has(prefix.toUpperCase()) ? prefix : undefined;
      blocks.push({ startCol: c, endCol: c + 6, dateCell: undefined, dayName });
    }
  } else {
    // Plain form: one show block per START column in the token-header.
    for (let c = 0; c < normHeader.length; c++) {
      if (normHeader[c] !== "START") continue;
      blocks.push({
        startCol: c,
        endCol: c + 6, // the 6-col START|FINISH|TRT|TITLE|ROOM|AV group
        dateCell: dateRow?.[c]?.trim(),   // may be M/D/YY, #REF!, or undefined — resolved in Task 1.5
        dayName: nameRow?.[c]?.trim(),    // may be a weekday, #REF!, or undefined
      });
    }
  }

  // Confirm each block is a real SHOW-DAY group: its 6-col span has START+FINISH+TRT
  // (guards a stray duplicate `START` label or a truncated tail group).
  return blocks.filter((b) => {
    const span = normHeader.slice(b.startCol, b.endCol);
    return span.includes("START") && span.includes("FINISH") && span.includes("TRT");
  });
}

/**
 * Testable entry: isolate the AGENDA table, then locate + classify its show-day
 * blocks. Returns show-day blocks only (travel/set filtered). Returns [] when the
 * grid is unlocatable OR carries no show-day span. (parseAgenda uses the same
 * locateBlocks internally; this thin wrapper pins the boundary/classification
 * contract for Task 1.4's red→green cycle.)
 */
export function locateAgendaShowBlocks(markdown: string): AgendaBlock[] {
  const block = isolateAgendaTable(markdown);
  if (block === undefined) return [];
  const rows = parseTableRows(block);
  const headerIdx = rows.findIndex(isTokenHeaderRow);
  if (headerIdx === -1) return [];
  return locateBlocks(rows, rows[headerIdx]!, headerIdx);
}
```
Then in `parseAgenda`, after `const headerIdx = rows.findIndex(isTokenHeaderRow);`, build `const blocks = locateBlocks(rows, rows[headerIdx]!, headerIdx);` and (for now) return `{ runOfShow: {}, warnings: [] }` — Task 1.5 consumes `blocks`.
- [ ] **Run, verify passes** — `pnpm vitest run tests/parser/parseAgenda.test.ts -t 'step 2'` + `-t 'step 1'` + `pnpm typecheck`. Green.
- [ ] **Commit** — `git add lib/parser/blocks/agenda.ts tests/parser/parseAgenda.test.ts && git commit -m "feat(parser): parseAgenda step 2 — locateAgendaShowBlocks (DATE-row boundaries + show-day classification)"`

---

### Task 1.5 — ISO-date resolution (banner + unique-day-name fallback vs `dates.showDays` only; ambiguity → skip)

**Files:** `lib/parser/blocks/agenda.ts` · `tests/parser/parseAgenda.test.ts`.
**Interfaces — Produces:** each show-day block resolved to an ISO key, or omitted (UNRESOLVED). `parseAgenda` signature gains a `dates` param: `parseAgenda(markdown: string, dates?: ShowRow["dates"]): ParseAgendaResult`. **Consumes:** `dates.showDays` (`dates.ts:48`), `normalizeDate`.

§4.1 step 3: resolve each block's ISO from `normalizeDate(block.dateCell)`. If that fails (`#REF!`/blank/no year), fall back to `block.dayName` matched against `dates.showDays` **ONLY** — find the show-day ISO whose weekday equals `dayName`. **Exactly one match → resolve; zero matches → omit + `AGENDA_BLOCK_UNRESOLVED`; ≥2 same-weekday matches → omit + `AGENDA_DAY_AMBIGUOUS`** (never guess — R2). A successful banner date is NOT cross-checked away by a mismatched day-name (banner wins; day-name is the fallback only). **Concrete failure mode caught:** guessing among ambiguous dates (would mis-apply the ISO-keyed `DateRestriction` gate) or resolving a show block onto a `set`/`travel` date.

- [ ] **Write failing test** — append:
```ts
import type { ShowRow } from "@/lib/parser/types";

const datesOf = (showDays: string[]): ShowRow["dates"] => ({
  travelIn: null, set: null, showDays, travelOut: null, loadIn: null,
});

describe("parseAgenda — step 3: ISO resolution + ambiguity guard", () => {
  const hdr = "| NAME | ARRIVAL | FLIGHT# | START  | FINISH | TRT | TITLE | ROOM | AV |";
  const mk = (dateRow: string, nameRow: string, dataRow: string) =>
    [
      "| TRAVEL DAY | TRAVEL DAY | TRAVEL DAY | DAY 1 | DAY 1 | DAY 1 | DAY 1 | DAY 1 | DAY 1 |",
      dateRow, nameRow, hdr, dataRow,
    ].join("\n");

  it("resolves from the banner date (M/D/YY → ISO)", () => {
    const md = mk(
      "| 9/3/25 | 9/3/25 | 9/3/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 |",
      "| Wed | Wed | Wed | Fri | Fri | Fri | Fri | Fri | Fri |",
      "|  |  |  | 8:30 AM | 9:30 AM | 1:00 | Keynote | Hall A | LAV |",
    );
    const r = parseAgenda(md, datesOf(["2025-09-05"]));
    expect(Object.keys(r.runOfShow ?? {})).toContain("2025-09-05");
  });

  it("#REF! banner + day-name matching EXACTLY ONE showDay → resolves via fallback", () => {
    const md = mk(
      "| #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! |",
      "| Friday | Friday | Friday | Friday | Friday | Friday | Friday | Friday | Friday |",
      "|  |  |  | 8:30 AM | 9:30 AM | 1:00 | Keynote | Hall A | LAV |",
    );
    const r = parseAgenda(md, datesOf(["2025-09-05"])); // only one Friday
    expect(Object.keys(r.runOfShow ?? {})).toEqual(["2025-09-05"]);
  });

  it("#REF! banner + day-name matching TWO same-weekday showDays → SKIP + AGENDA_DAY_AMBIGUOUS (never guess)", () => {
    const md = mk(
      "| #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! |",
      "| Wednesday | Wednesday | Wednesday | Wednesday | Wednesday | Wednesday | Wednesday | Wednesday | Wednesday |",
      "|  |  |  | 8:30 AM | 9:30 AM | 1:00 | Keynote | Hall A | LAV |",
    );
    const r = parseAgenda(md, datesOf(["2025-09-03", "2025-09-10"])); // two Wednesdays
    expect(r.runOfShow).toEqual({});
    expect(r.warnings.map((w) => w.code)).toContain("AGENDA_DAY_AMBIGUOUS");
  });

  it("#REF! banner + NO day-name match → SKIP + AGENDA_BLOCK_UNRESOLVED", () => {
    const md = mk(
      "| #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! |",
      "| Monday | Monday | Monday | Monday | Monday | Monday | Monday | Monday | Monday |",
      "|  |  |  | 8:30 AM | 9:30 AM | 1:00 | Keynote | Hall A | LAV |",
    );
    const r = parseAgenda(md, datesOf(["2025-09-05"])); // a Friday, no Monday
    expect(r.runOfShow).toEqual({});
    expect(r.warnings.map((w) => w.code)).toContain("AGENDA_BLOCK_UNRESOLVED");
  });
});
```
- [ ] **Run, verify fails** — `pnpm vitest run tests/parser/parseAgenda.test.ts -t 'step 3'`. Expected: `parseAgenda` takes one arg → the `dates` arg is ignored and every block resolves to `{}` → all four assertions fail (no keys / no warnings).
- [ ] **Minimal impl** — add the `dates` param + a resolver to `agenda.ts`:
```ts
import type { ShowRow } from "../types";

const ISO_WEEKDAY = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
function weekdayOfIso(iso: string): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return undefined;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return ISO_WEEKDAY[d.getUTCDay()];
}

type Resolved = { iso: string } | { skip: "ambiguous" | "unresolved" };

// Resolve a block's ISO date (R8: dateCell may be a real M/D/YY, a `#REF!`/error,
// or undefined — all handled here, NOT at detection). Banner value wins when it
// normalizes; otherwise the day-name → showDays-ONLY unique-match fallback (§4.1
// step 3 / R7); zero/multiple matches → skip (never guess — R2).
function resolveBlock(block: AgendaBlock, dates: ShowRow["dates"] | undefined): Resolved {
  const banner = normalizeDate(block.dateCell ?? ""); // `#REF!`/blank → null → fallback
  if (banner) return { iso: banner };
  const dayName = block.dayName?.toUpperCase();
  const showDays = dates?.showDays ?? [];
  if (!dayName || !WEEKDAYS.has(dayName)) return { skip: "unresolved" }; // `#REF!`/missing day-name
  const matches = showDays.filter((iso) => weekdayOfIso(iso) === dayName);
  if (matches.length === 1) return { iso: matches[0]! };
  if (matches.length >= 2) return { skip: "ambiguous" };
  return { skip: "unresolved" };
}
```
Then in `parseAgenda` (signature `parseAgenda(markdown: string, dates?: ShowRow["dates"])`), iterate `blocks` with their ordinal `index`, call `resolveBlock`, and on a skip push `agendaDayAmbiguous(index)` (for `skip:"ambiguous"`) or `agendaBlockUnresolved(index)` (for `skip:"unresolved"`) — imported from `./agendaWarnings` (NOT an inline `warn()`) — and create an (empty for now) array under the resolved ISO key. Because blocks now ALWAYS exist at every show-day START column (R8 — even an all-`#REF!` banner), `resolveBlock` always runs, so a degraded banner emits its warning instead of silently producing no blocks. Data-row walk (entries) is Task 1.6.
- [ ] **Run, verify passes** — `pnpm vitest run tests/parser/parseAgenda.test.ts -t 'step 3'`. Green.
- [ ] **Commit** — `git add lib/parser/blocks/agenda.ts tests/parser/parseAgenda.test.ts && git commit -m "feat(parser): parseAgenda step 3 — ISO resolution vs showDays-only + ambiguity skip"`

---

### Task 1.6 — Data-row walk (absolute columns, right-pad short rows) + TITLE-real emit gate + per-day encoding

**Files:** `lib/parser/blocks/agenda.ts` · `tests/parser/parseAgenda.test.ts` (+ the real-fixture positive test).
**Interfaces — Produces:** populated `AgendaEntry[]` per resolved day with CONFIRMED-ONLY encoding. **Consumes:** `shouldHideGenericOptional` (`emptyState.ts:75`), resolved blocks from Task 1.5.

§4.1 steps 4-5: walk the **non-structural data rows** (`dataRows` from Task 1.3 — every row not in `structuralRowIndices`, so NO token-header / DATE banner / day-name / day-TYPE row, regardless of position, R7/R8). Per block read absolute columns `[start=startCol, finish=startCol+1, trt=startCol+2, title=startCol+3, room=startCol+4, av=startCol+5]`; **right-pad short rows** (markdown trims trailing empties — `cells[i] ?? ""`). Emit `AgendaEntry` IFF TITLE is REAL: `!shouldHideGenericOptional(title)` (hides `''`/`TBD`/`N/A`/`TBA`). Optional fields via `presence()` → omit when blank/null (under `exactOptionalPropertyTypes`, only assign present string fields). **Per-day encoding (D-2):** resolved day with ≥1 real entry → key with entries; resolved day with all-blank/sentinel TITLE → key with `[]`; unresolved block → absent. **Concrete failure modes caught:** `Date` coercion of time strings (asserted as strings); crew/TRAVEL/SET block bleed (asserted absent); a `TBD` TITLE producing an entry; a `#REF!`/banner cell read as a title (excluded by structural-skip); per-day positive values DERIVED from the fixture (clone-and-read), not hardcoded.

- [ ] **Write failing test** — append the real-fixture positive test (anti-tautology: read expected from the fixture) + sentinel/string-pin tests (`readFileSync` already imported in Task 1.4's snippet — do not re-import):
```ts
describe("parseAgenda — steps 4-5: data walk + TITLE-real gate (real fixtures, clone-and-read)", () => {
  it("East Coast Day 1 entries match the fixture rows IN ORDER (derived, not hardcoded)", () => {
    const md = readFileSync("fixtures/shows/exporter-xlsx/east-coast.md", "utf8");
    const r = parseAgenda(md, datesOf(["2024-05-15", "2024-05-16"]));
    const day1 = r.runOfShow?.["2024-05-15"];
    expect(day1).toBeDefined();
    // Derive the expected FIRST entry by re-reading the grid the same way a human would:
    // the token-header row's first show-day START is col 6; first data row's col 6..11.
    // We assert the parser reproduced the fixture's first session verbatim.
    expect(day1![0]).toEqual({
      start: "7:15 AM", finish: "7:30 AM", trt: "0:15",
      title: "Family Office Only Breakfast", av: "NONE",
      // no `room` — the fixture cell is blank
    });
    // titles appear in sheet order
    const titles = day1!.map((e) => e.title);
    expect(titles.slice(0, 3)).toEqual([
      "Family Office Only Breakfast",
      "Welcome and Introductory Remarks",
      "Opening Keynote",
    ]);
    // times are DISPLAY STRINGS, never Date
    for (const e of day1!) {
      expect(typeof e.start).toBe("string");
      expect(e.start).not.toMatch(/GMT|T\d\d:\d\d/); // not a Date.toString()
    }
    // crew/TRAVEL/SET never bleed in: no entry title is a crew NAME or a travel cell
    expect(titles).not.toContain("NAME");
    expect(titles).not.toContain("ARRIVAL");
  });

  it("RIA fixture (the OTHER real filled production shape) → keys both show days; Day-1 first session derived from the fixture", () => {
    // Spec §6 test 1 requires positive extraction on BOTH filled current-converter fixtures.
    // RIA banner (ria.md:316-318): TRAVEL 6/23, SET 6/24, DAY1 6/25/25 (Wed), DAY2 6/26/25 (Thu).
    const md = readFileSync("fixtures/shows/exporter-xlsx/ria.md", "utf8");
    const r = parseAgenda(md, datesOf(["2025-06-25", "2025-06-26"]));
    // keys both show days (reconciled from the DATE + day-name rows), NOT the travel/set dates
    expect(Object.keys(r.runOfShow ?? {}).sort()).toEqual(["2025-06-25", "2025-06-26"]);
    const day1 = r.runOfShow?.["2025-06-25"];
    expect(day1?.length).toBeGreaterThan(0);
    // first Day-1 entry — clone-and-read from ria.md:320 (NOT hardcoded blind): the DAY-1
    // block START is col 6, so col 6..11 = start/finish/trt/title/room/av.
    expect(day1![0]).toEqual({
      start: "7:30 AM", finish: "8:30 AM", trt: "1:00",
      title: "Attendee Registration and Breakfast", room: "Foyer",
      // av blank in this row
    });
    // times stay display strings, no Date coercion
    expect(day1!.every((e) => typeof e.start === "string")).toBe(true);
    // the SET-DAY title column (idx 4) must never bleed in as a session
    expect(day1!.map((e) => e.title)).not.toContain("TITLE");
  });

  it("right-pads short rows; a row with only START+TITLE yields a title row (no finish/room/av)", () => {
    const md = [
      "| NAME | ARRIVAL | FLIGHT# | START  | FINISH | TRT | TITLE | ROOM | AV |",
      "| 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 |",
      "| Fri | Fri | Fri | Fri | Fri | Fri | Fri | Fri | Fri |",
      "|  |  |  | 8:00 AM |  |  | Title Only Session |", // short row — trailing trimmed
    ].join("\n");
    const r = parseAgenda(md, datesOf(["2025-09-05"]));
    expect(r.runOfShow!["2025-09-05"]).toEqual([{ start: "8:00 AM", title: "Title Only Session" }]);
  });

  it("sentinel TITLE (TBD/N/A/blank) → NO entry; all-sentinel day → [] (not confirmed)", () => {
    const md = [
      "| NAME | ARRIVAL | FLIGHT# | START  | FINISH | TRT | TITLE | ROOM | AV |",
      "| 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 |",
      "| Fri | Fri | Fri | Fri | Fri | Fri | Fri | Fri | Fri |",
      "|  |  |  | 8:00 AM | 9:00 AM | 1:00 | TBD | Hall | LAV |",
      "|  |  |  | 9:00 AM | 9:30 AM | 0:30 |  | Hall | LAV |",
    ].join("\n");
    const r = parseAgenda(md, datesOf(["2025-09-05"]));
    expect(r.runOfShow!["2025-09-05"]).toEqual([]); // resolved-but-empty (CONFIRMED-ONLY → not stored later)
  });
});

describe("parseAgenda — R7/R8/R13: structural banner rows (incl. all-#REF! and ESCAPED \\#REF\\!) never become entries", () => {
  // The bug this catches: the walk used rows.slice(headerIdx+1). When the converter
  // promotes the TOKEN-HEADER to the md-table header row, the DATE / day-name / day-TYPE
  // banners follow it as BODY rows — a positional slice reads them at absolute columns and
  // emits "5/15/24" / "Wednesday" / "DAY 1" as bogus AgendaEntry titles. The structural-skip
  // (skip DATE/day-name/day-TYPE/token-header rows BY IDENTITY) must exclude them.

  it("token-header FIRST, then DATE + day-name + day-TYPE as body rows → those banners emit NO entry", () => {
    // Markdown order: token-header (md-header), DATE, day-name, day-TYPE, then real data.
    // After parseTableRows (separator dropped): rows = [token-hdr, DATE, day-name, day-TYPE, data].
    // headerIdx=0; the OLD slice(1) would emit DATE/day-name/day-TYPE rows as titles.
    const md = [
      "| NAME | ARRIVAL | FLIGHT# | TIME | TITLE | ROOM | START  | FINISH | TRT | TITLE | ROOM | AV |",
      "| 5/13/24 | 5/13/24 | 5/13/24 | 5/14/24 | 5/14/24 | 5/14/24 | 5/15/24 | 5/15/24 | 5/15/24 | 5/15/24 | 5/15/24 | 5/15/24 |",
      "| Monday | Monday | Monday | Tuesday | Tuesday | Tuesday | Wednesday | Wednesday | Wednesday | Wednesday | Wednesday | Wednesday |",
      "| TRAVEL DAY | TRAVEL DAY | TRAVEL DAY | SET DAY | SET DAY | SET DAY | DAY 1 | DAY 1 | DAY 1 | DAY 1 | DAY 1 | DAY 1 |",
      "|  |  |  |  |  |  | 8:30 AM | 9:30 AM | 1:00 | Opening Keynote | Mabel 1 | LAV |",
    ].join("\n");
    const r = parseAgenda(md, datesOf(["2024-05-15"]));
    const day = r.runOfShow?.["2024-05-15"] ?? [];
    const titles = day.map((e) => e.title);
    // ONLY the real session — no banner cell leaked as a title.
    expect(titles).toEqual(["Opening Keynote"]);
    expect(titles).not.toContain("5/15/24");
    expect(titles).not.toContain("Wednesday");
    expect(titles).not.toContain("DAY 1");
  });

  it("real East Coast (day-TYPE-header promotion) still parses correctly — banners above header", () => {
    // East Coast promotes the day-TYPE row to md-header; DATE/day-name/token-header are body
    // rows ABOVE the data. Confirms the structural-skip handles BOTH promotion shapes.
    const md = readFileSync("fixtures/shows/exporter-xlsx/east-coast.md", "utf8");
    const titles = (parseAgenda(md, datesOf(["2024-05-15", "2024-05-16"])).runOfShow?.["2024-05-15"] ?? [])
      .map((e) => e.title);
    expect(titles).toContain("Family Office Only Breakfast");
    expect(titles).not.toContain("5/15/24");
    expect(titles).not.toContain("DAY 1");
    expect(titles).not.toContain("Wednesday");
  });

  it("empty fixture (day-TYPE-header promotion, blank TITLEs) → all-[] keys, no banner-as-entry", () => {
    // The OTHER promotion shape with empty titles: still must not emit DATE/day-name banners.
    // Assert with inline patterns (the parser's WEEKDAYS/DAY_TYPE_RE are module-internal).
    const md = readFileSync("fixtures/shows/exporter-xlsx/rpas.md", "utf8");
    const r = parseAgenda(md, datesOf([
      "2026-03-24", "2026-03-25", "2026-03-26", "2026-03-27",
    ]));
    const WEEKDAY_RE = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i;
    const DAYTYPE_RE = /^(travel day|set day|day\s+\d+)$/i;
    const MDY_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
    for (const day of Object.values(r.runOfShow ?? {})) {
      for (const e of day) {
        expect(MDY_RE.test(e.title.trim())).toBe(false);     // no M/D/YY banner as title
        expect(WEEKDAY_RE.test(e.title.trim())).toBe(false); // no weekday banner as title
        expect(DAYTYPE_RE.test(e.title.trim())).toBe(false); // no TRAVEL DAY/DAY N as title
      }
    }
  });

  it("R8: an all-#REF! DATE banner emits ZERO entries from the banner AND still creates a block (warning, not silent drop)", () => {
    // The R8 bug: a value-only isDateRow missed an all-#REF! banner → (a) NO block created
    // → resolveBlock never ran → NO warning (silent drop); (b) the #REF! row walked as data
    // → "#REF!" emitted as a title. Both must be closed: block exists, warning fires, no #REF! title.
    const md = [
      "| NAME | ARRIVAL | FLIGHT# | START  | FINISH | TRT | TITLE | ROOM | AV |",
      "| #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! |",
      "| Friday | Friday | Friday | Friday | Friday | Friday | Friday | Friday | Friday |",
      "|  |  |  | 8:30 AM | 9:30 AM | 1:00 | Keynote | Hall A | LAV |",
    ].join("\n");
    const r = parseAgenda(md, datesOf(["2025-09-05"])); // unique Friday → resolves
    const titles = (r.runOfShow?.["2025-09-05"] ?? []).map((e) => e.title);
    expect(titles).toContain("Keynote");          // real session parsed
    expect(titles).not.toContain("#REF!");         // banner NOT walked as data
    expect(titles.some((t) => /#REF/i.test(t))).toBe(false);
  });

  it("R8: all-#REF! DATE banner with NO resolvable day-name → block created → AGENDA_BLOCK_UNRESOLVED (NOT a silent no-op)", () => {
    const md = [
      "| NAME | ARRIVAL | FLIGHT# | START  | FINISH | TRT | TITLE | ROOM | AV |",
      "| #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! |",
      "| #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! | #REF! |", // day-name also #REF!
      "|  |  |  | 8:30 AM | 9:30 AM | 1:00 | Keynote | Hall A | LAV |",
    ].join("\n");
    const r = parseAgenda(md, datesOf(["2025-09-05"]));
    expect(r.runOfShow).toEqual({});  // unresolved → absent (not stored → anchors)
    expect(r.warnings.map((w) => w.code)).toContain("AGENDA_BLOCK_UNRESOLVED"); // warning DID emit
  });

  it("R13 REAL FIXTURE: consultants.md ESCAPED \\#REF\\! DATE/day-name banners are structural — no banner cell becomes a title", () => {
    // consultants.md:235-238 — day-TYPE header, DATE banner `\#REF\! | … | 10/8/25 …`,
    // day-name banner `\#REF\! | … | Wednesday …`, token-header `NAME|ARRIVAL|FLIGHT\#|…`.
    // Without clean() normalization the escaped banners stay in dataRows → 10/8/25 / weekday
    // cells emit as bogus titles. After clean() they are structural-skipped.
    const md = readFileSync("fixtures/shows/exporter-xlsx/consultants.md", "utf8");
    // consultants is an EMPTY-agenda fixture (blank TITLE cells) → all-[] days, no entries.
    const r = parseAgenda(md, datesOf(["2025-10-08", "2025-10-09", "2025-10-10"]));
    const MDY_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
    const WEEKDAY_RE = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i;
    for (const day of Object.values(r.runOfShow ?? {})) {
      for (const e of day) {
        expect(MDY_RE.test(e.title.trim())).toBe(false);     // no 10/8/25 banner as a title
        expect(WEEKDAY_RE.test(e.title.trim())).toBe(false); // no Wednesday banner as a title
        expect(/#?REF!?/i.test(e.title)).toBe(false);        // no (escaped) #REF! as a title
      }
    }
  });

  it("R13 SYNTHETIC: escaped \\#REF\\! DATE cells are detected as the date-banner (cleaned) → block + warning, no escaped-REF title", () => {
    const md = [
      "| NAME | ARRIVAL | FLIGHT\\# | START  | FINISH | TRT | TITLE | ROOM | AV |", // escaped FLIGHT\#
      "| \\#REF\\! | \\#REF\\! | \\#REF\\! | \\#REF\\! | \\#REF\\! | \\#REF\\! | \\#REF\\! | \\#REF\\! | \\#REF\\! |",
      "| Friday | Friday | Friday | Friday | Friday | Friday | Friday | Friday | Friday |",
      "|  |  |  | 8:30 AM | 9:30 AM | 1:00 | Keynote | Hall A | LAV |",
    ].join("\n");
    const r = parseAgenda(md, datesOf(["2025-09-05"])); // unique Friday → resolves via day-name
    const titles = (r.runOfShow?.["2025-09-05"] ?? []).map((e) => e.title);
    expect(titles).toContain("Keynote");                 // real session parsed
    expect(titles.some((t) => /#?REF!?/i.test(t))).toBe(false); // escaped banner NOT a title
  });
});

describe("parseAgenda — LOAD-BEARING: post-AGENDA tables never leak as run-of-show entries", () => {
  // The bug this catches: parseTableRows flattens the WHOLE doc; without isolating the
  // AGENDA table's contiguous block, the absolute-column walk reads PULL SHEET / ROOM
  // DIMENSIONS rows (which follow after a blank line) at the TITLE column (idx 9/15/21)
  // and emits them as bogus AgendaEntry titles → persisted → shown to crew.

  it("dedicated fixture: a PULL SHEET row with a value at the DAY-1 TITLE column (idx 9) does NOT become an entry", () => {
    const md = readFileSync(
      "fixtures/shows/parser-units/agenda-followed-by-pullsheet.md",
      "utf8",
    );
    const r = parseAgenda(md, datesOf(["2025-09-05"]));
    const titles = (r.runOfShow?.["2025-09-05"] ?? []).map((e) => e.title);
    // Exactly the agenda rows — derive the count by reading the fixture's agenda block,
    // NOT the doc. The PULL SHEET sentinel title must be absent.
    expect(titles).toContain("Real Agenda Session");
    expect(titles).not.toContain("LEAKED_FROM_PULLSHEET");
    expect(titles.every((t) => !t.startsWith("LEAKED"))).toBe(true);
  });

  it("real East Coast fixture: Day-1 titles are exactly the agenda block's sessions — no PULL SHEET / ROOM bleed", () => {
    // East Coast's AGENDA ends at "Loop video", then a blank line, then ROOM DIMENSIONS
    // + a large PULL SHEET (equipment rows with FALSE/counts/"FOH Rack"/etc.). Assert NONE
    // of those equipment strings appear as a Day-1 title. (Clone-and-read: titles derived
    // from the agenda block; the equipment strings are read from the PULL SHEET region.)
    const md = readFileSync("fixtures/shows/exporter-xlsx/east-coast.md", "utf8");
    const r = parseAgenda(md, datesOf(["2024-05-15", "2024-05-16"]));
    const day1 = (r.runOfShow?.["2024-05-15"] ?? []).map((e) => e.title);
    // Pull-sheet equipment tokens that live below the AGENDA block must never be titles.
    for (const leak of ["FOH Rack", "Batteries", "Allen & Heath QU32 Mixer", "FALSE", "TOTAL COUNT CORP & INS SALON 1"]) {
      expect(day1).not.toContain(leak);
    }
    // and the real last agenda session is present (the block's actual tail, not a pull-sheet row)
    expect(day1).toContain("Family Office Perspectives:");
  });
});
```
- [ ] **Add the dedicated regression fixture** — `fixtures/shows/parser-units/agenda-followed-by-pullsheet.md` (new; create the `parser-units/` dir if absent). An AGENDA table (one Friday show-day block) immediately followed — after ONE blank line — by a PULL SHEET table whose cells carry `LEAKED_FROM_PULLSHEET` at the DAY-1 TITLE absolute column (idx 9). Content:
```md
| NAME | ARRIVAL | FLIGHT# | TIME | TITLE | ROOM | START  | FINISH | TRT | TITLE | ROOM | AV |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 9/3/25 | 9/3/25 | 9/3/25 | 9/4/25 | 9/4/25 | 9/4/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 |
| Wed | Wed | Wed | Thu | Thu | Thu | Fri | Fri | Fri | Fri | Fri | Fri |
|  |  |  |  |  |  | 8:00 AM | 9:00 AM | 1:00 | Real Agenda Session | Hall A | LAV |

| PULL SHEET | PULL SHEET | PULL SHEET | PULL SHEET | PULL SHEET | PULL SHEET | PULL SHEET | PULL SHEET | PULL SHEET | LEAKED_FROM_PULLSHEET | x | y |
| FALSE | 1 | FOH Rack | x | x | x | 0 | 1 | x | LEAKED_FROM_PULLSHEET | x | y |
```
(idx 9 — the DAY-1 TITLE column — carries `LEAKED_FROM_PULLSHEET` in both PULL SHEET rows; the isolation boundary must exclude this table so neither leaks.)
- [ ] **Run, verify fails** — `pnpm vitest run tests/parser/parseAgenda.test.ts -t 'steps 4-5'` and `-t 'LOAD-BEARING'`. Expected: days resolve to `[]` (Task 1.5 left them empty) → the steps-4-5 `toEqual` against real entries fail; the LOAD-BEARING test fails only if isolation is broken (with Task 1.3's `isolateAgendaTable` it passes once the walk exists). **If the East Coast first-entry literal mismatches, re-grep `fixtures/shows/exporter-xlsx/east-coast.md:104` and correct the literal to the fixture (clone-and-read) — do not adjust the parser to a hardcoded guess.**
- [ ] **Minimal impl** — add the data walk to `parseAgenda` (using `presence` + `shouldHideGenericOptional`):
```ts
import { presence } from "./_helpers";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

function buildEntry(row: string[], startCol: number): AgendaEntry | null {
  const at = (off: number) => row[startCol + off] ?? ""; // right-pad short rows
  const title = presence(at(3));
  if (title === null || shouldHideGenericOptional(title)) return null; // TITLE-real gate
  const entry: AgendaEntry = { start: presence(at(0)) ?? "", title };
  const finish = presence(at(1)); if (finish !== null) entry.finish = finish;
  const trt = presence(at(2)); if (trt !== null) entry.trt = trt;
  const room = presence(at(4)); if (room !== null) entry.room = room;
  const av = presence(at(5)); if (av !== null) entry.av = av;
  return entry;
}
```
In `parseAgenda`: compute the data rows as **every row that is NOT structural** — `const dataRows = rows.filter((_, i) => !structural.has(i));` (using the `structural` set from Task 1.3). Do **NOT** use `rows.slice(headerIdx + 1)` — the converter can promote the token-header to the md-header row, leaving DATE / day-name / day-TYPE banners BELOW it as body rows; a positional slice would read those banner cells at absolute columns and emit `"5/15/24"` / `"Wednesday"` / `"DAY 1"` as bogus titles (R7). For each resolved block, walk `dataRows`, call `buildEntry(dataRow, block.startCol)`, collect non-null entries, and set `out[iso] = entries` (entries may be `[]` when every TITLE was blank/sentinel). Keep the resolved key even when `[]` (D-2 step 5 — the sync's CONFIRMED-ONLY filter drops `[]` later, §02).
- [ ] **Run, verify passes** — `pnpm vitest run tests/parser/parseAgenda.test.ts`. Green. The `start: ""` fallback only occurs if a START cell is blank on a real-TITLE row — acceptable per spec (display string).
- [ ] **Commit** — `git add lib/parser/blocks/agenda.ts tests/parser/parseAgenda.test.ts && git commit -m "feat(parser): parseAgenda steps 4-5 — data walk, right-pad, TITLE-real gate, per-day encoding"`

---

### Task 1.7 — Storage caps (200/day, per-field length, 32KB/day) + `AGENDA_DAY_TRUNCATED`

**Files:** `lib/parser/blocks/agenda.ts` · `tests/parser/parseAgenda.test.ts`.
**Interfaces — Produces:** capped `AgendaEntry[]` + `AGENDA_DAY_TRUNCATED` warning. **Consumes:** nothing new.

§4.1 step 6 / D-6: at store, per resolved day — truncate `title`≤300, `room`/`av`≤120, `start`/`finish`/`trt`≤40 (substring); cap to **200 entries/day**; drop tail entries until the day's `JSON.stringify(entries)` byte length (`Buffer.byteLength(s, "utf8")`) ≤ **32 KB**. Any of these fired → one `AGENDA_DAY_TRUNCATED` warning for that day. **The parser does NOT count-truncate to the UI's 20** (the 20-cap is §03 display — the stored 200 keeps the overflow count computable). **Concrete failure mode caught:** a pathological cell bloating the JSONB / failing the sync write; a parser-level 20-truncation making the UI `+N more` count un-computable.

- [ ] **Write failing test** — append:
```ts
describe("parseAgenda — step 6: storage caps + AGENDA_DAY_TRUNCATED", () => {
  const dayHeader = "| NAME | ARRIVAL | FLIGHT# | START  | FINISH | TRT | TITLE | ROOM | AV |";
  const dateRow = "| 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 | 9/5/25 |";
  const nameRow = "| Fri | Fri | Fri | Fri | Fri | Fri | Fri | Fri | Fri |";

  it("title>300 truncates to 300; room/av>120 to 120; time>40 to 40", () => {
    const longTitle = "T".repeat(10_000), longRoom = "R".repeat(500), longTime = "8".repeat(100);
    const md = [dayHeader, dateRow, nameRow,
      `|  |  |  | ${longTime} | 9:00 AM | 1:00 | ${longTitle} | ${longRoom} | ${longRoom} |`,
    ].join("\n");
    const e = parseAgenda(md, datesOf(["2025-09-05"])).runOfShow!["2025-09-05"]![0]!;
    expect(e.title.length).toBe(300);
    expect(e.room!.length).toBe(120);
    expect(e.av!.length).toBe(120);
    expect(e.start.length).toBe(40);
  });

  it(">200 filled rows in one day → capped at 200 + AGENDA_DAY_TRUNCATED (NOT 20)", () => {
    const rows = Array.from({ length: 250 }, (_, i) =>
      `|  |  |  | 8:00 AM | 9:00 AM | 1:00 | Session ${i} | Hall | LAV |`);
    const md = [dayHeader, dateRow, nameRow, ...rows].join("\n");
    const r = parseAgenda(md, datesOf(["2025-09-05"]));
    expect(r.runOfShow!["2025-09-05"]!.length).toBe(200);
    expect(r.warnings.map((w) => w.code)).toContain("AGENDA_DAY_TRUNCATED");
  });

  it("a day exceeding 32KB serialized → tail entries dropped to ≤32KB + AGENDA_DAY_TRUNCATED", () => {
    // ~250 chars of title each * 200 entries ≈ 50KB > 32KB
    const rows = Array.from({ length: 200 }, (_, i) =>
      `|  |  |  | 8:00 AM | 9:00 AM | 1:00 | ${"X".repeat(250)} ${i} | Hall | LAV |`);
    const md = [dayHeader, dateRow, nameRow, ...rows].join("\n");
    const r = parseAgenda(md, datesOf(["2025-09-05"]));
    const day = r.runOfShow!["2025-09-05"]!;
    expect(Buffer.byteLength(JSON.stringify(day), "utf8")).toBeLessThanOrEqual(32 * 1024);
    expect(day.length).toBeLessThan(200);
    expect(r.warnings.map((w) => w.code)).toContain("AGENDA_DAY_TRUNCATED");
  });
});
```
- [ ] **Run, verify fails** — `pnpm vitest run tests/parser/parseAgenda.test.ts -t 'step 6'`. Expected: no caps applied → title length 10000, 250 entries, >32KB → all fail.
- [ ] **Minimal impl** — add a `capDay` applied to each day's entries before storing:
```ts
const MAX_ENTRIES = 200, MAX_TITLE = 300, MAX_RC = 120, MAX_TIME = 40, MAX_BYTES = 32 * 1024;
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

function capDay(entries: AgendaEntry[]): { entries: AgendaEntry[]; truncated: boolean } {
  let truncated = false;
  let capped = entries.map((e) => {
    const out: AgendaEntry = { start: cut(e.start, MAX_TIME), title: cut(e.title, MAX_TITLE) };
    if (e.title.length > MAX_TITLE || e.start.length > MAX_TIME) truncated = true;
    if (e.finish !== undefined) { out.finish = cut(e.finish, MAX_TIME); if (e.finish.length > MAX_TIME) truncated = true; }
    if (e.trt !== undefined) { out.trt = cut(e.trt, MAX_TIME); if (e.trt.length > MAX_TIME) truncated = true; }
    if (e.room !== undefined) { out.room = cut(e.room, MAX_RC); if (e.room.length > MAX_RC) truncated = true; }
    if (e.av !== undefined) { out.av = cut(e.av, MAX_RC); if (e.av.length > MAX_RC) truncated = true; }
    return out;
  });
  if (capped.length > MAX_ENTRIES) { capped = capped.slice(0, MAX_ENTRIES); truncated = true; }
  while (capped.length > 0 && Buffer.byteLength(JSON.stringify(capped), "utf8") > MAX_BYTES) {
    capped.pop(); truncated = true;
  }
  return { entries: capped, truncated };
}
```
Call `capDay` on each day's collected entries in `parseAgenda`; push one `agendaDayTruncated(index)` (imported from `./agendaWarnings`) per truncated day.
- [ ] **Run, verify passes** — `pnpm vitest run tests/parser/parseAgenda.test.ts`. Green.
- [ ] **Commit** — `git add lib/parser/blocks/agenda.ts tests/parser/parseAgenda.test.ts && git commit -m "feat(parser): parseAgenda step 6 — storage caps (200/day, field-len, 32KB) + AGENDA_DAY_TRUNCATED"`

---

### Task 1.8 — Wire `parseAgenda` into `parseSheet`; regenerate internal-code-enums

**Files:** `lib/parser/index.ts` · `lib/messages/__generated__/internal-code-enums.ts` (regen) · `tests/parser/parseSheet.test.ts` (append) · `tests/cross-cutting/no-raw-codes.test.ts` (must stay green).
**Interfaces — Produces:** `ParsedSheet.runOfShow` populated by `parseSheet`. **Consumes:** `parseAgenda` (Task 1.3-1.7), `dates` already parsed in `parseSheet` (`index.ts:365`).

Call `parseAgenda(markdown, dates)` in the block list (after `parseDates`, since it needs `dates`), merge its `warnings` into `agg.warnings`, and add `runOfShow: agendaResult.runOfShow` to the return literal (`:407-419`). Then **`pnpm gen:internal-code-enums`** to capture the 5 new `AGENDA_*` codes and commit the regen in the SAME commit. **Concrete failure mode caught:** the codes existing in source but absent from the generated enum → `tests/cross-cutting/no-raw-codes.test.ts:34` `toEqual` fails (x2 gate).

- [ ] **Write failing test** — append to `tests/parser/parseSheet.test.ts`:
```ts
import { readFileSync } from "node:fs";
import { parseSheet } from "@/lib/parser";

describe("parseSheet — runOfShow wiring (Phase 2)", () => {
  it("East Coast production fixture → parseSheet emits runOfShow keyed by show day", () => {
    const md = readFileSync("fixtures/shows/exporter-xlsx/east-coast.md", "utf8");
    const r = parseSheet(md, "east-coast.md");
    expect(r.runOfShow).toBeDefined();
    expect(Object.keys(r.runOfShow!)).toEqual(expect.arrayContaining(["2024-05-15"]));
    expect(r.runOfShow!["2024-05-15"]![0]!.title).toBe("Family Office Only Breakfast");
  });

  it("RIA production fixture → parseSheet emits runOfShow keyed by RIA show days (both filled shapes wired)", () => {
    // The other real filled production shape — proves parseSheet wiring is not East-Coast-specific.
    // RIA dates come from the sheet's own DATES block; the AGENDA banner carries 6/25/25 (Wed) + 6/26/25 (Thu).
    const md = readFileSync("fixtures/shows/exporter-xlsx/ria.md", "utf8");
    const r = parseSheet(md, "ria.md");
    expect(r.runOfShow).toBeDefined();
    expect(Object.keys(r.runOfShow!)).toEqual(expect.arrayContaining(["2025-06-25"]));
    // first Day-1 session — derived from ria.md:320 (clone-and-read), not hardcoded blind
    expect(r.runOfShow!["2025-06-25"]![0]!.title).toBe("Attendee Registration and Breakfast");
    expect(r.runOfShow!["2025-06-25"]![0]!.start).toBe("7:30 AM");
  });

  it("a sheet with no AGENDA grid → runOfShow undefined + AGENDA_GRID_MALFORMED warning, never throws", () => {
    const r = parseSheet("| FOO |\n| :-: |\n| x |\n", "nogrid.md");
    expect(r.runOfShow).toBeUndefined();
    expect(r.warnings.map((w) => w.code)).toContain("AGENDA_GRID_MALFORMED");
  });
});
```
- [ ] **Run, verify fails** — `pnpm vitest run tests/parser/parseSheet.test.ts -t 'runOfShow wiring'`. Expected: `parseSheet` doesn't call `parseAgenda` → `r.runOfShow` is `undefined` for East Coast (and no warning) → both assertions fail.
- [ ] **Minimal impl** — in `lib/parser/index.ts`, after `const dates = parseDates(markdown, version, agg);` (`:365`), add:
```ts
  const agendaResult = parseAgenda(markdown, dates);
  agg.warnings.push(...agendaResult.warnings);
```
(import `parseAgenda` at the top). In the return literal (`:407-419`), add `runOfShow` via **conditional spread** so an `undefined` is OMITTED (not assigned) — **required under `exactOptionalPropertyTypes: true` (`tsconfig.json:9`)**: assigning a possibly-`undefined` value to the optional `runOfShow?` property is a strict-mode type error. Place it adjacent to `warnings: agg.warnings,`:
```ts
    warnings: agg.warnings,
    hardErrors,
    ...(agendaResult.runOfShow !== undefined ? { runOfShow: agendaResult.runOfShow } : {}),
```
This keeps the no-grid case as an ABSENT property (so `parseSheet(...).runOfShow === undefined` still holds — `undefined` from a missing optional key). Leave the early-return error literal (`:328-356`) untouched — it omits the optional field, correct for a hard-error sheet.
- [ ] **Run gen + verify passes** — `pnpm gen:internal-code-enums` (regenerates `lib/messages/__generated__/internal-code-enums.ts`; because all 5 `AGENDA_*` `code:` literals live in `lib/parser/blocks/agendaWarnings.ts`, **all 5** appear, each `source: "parse_warnings.code"`), then `pnpm vitest run tests/parser/parseSheet.test.ts tests/cross-cutting/no-raw-codes.test.ts`. Both green. **`pnpm typecheck` (`tsc --noEmit`, `package.json:24`) MUST pass at this commit** — the conditional spread is what makes it pass.
- [ ] **Commit** — `git add lib/parser/index.ts lib/messages/__generated__/internal-code-enums.ts tests/parser/parseSheet.test.ts && git commit -m "feat(parser): wire parseAgenda into parseSheet (conditional spread); regen internal-code-enums for all 5 AGENDA_* codes"`

---

### Task 1.9 — Carry `runOfShow` across the `enrichWithDrivePins` bridge (`ParsedSheet → ParseResult`)

**Files:** `lib/sync/enrichWithDrivePins.ts` (the `ParseResult` return literal at `:262-279`) · `tests/sync/enrichWithDrivePins.runOfShow.test.ts` (new — the existing `tests/sync/enrichWithDrivePins.test.ts` harness is reused for the builders).
**Interfaces — Consumes:** `ParsedSheet.runOfShow` (Task 1.2). **Produces:** `ParseResult.runOfShow` populated from `parsed.runOfShow` — this is the field the §02 sync actually reads.

**Why this task exists (HIGH data-flow gap — verified live):** the production sync pipeline does NOT consume `ParsedSheet` directly — it consumes `ParseResult`, built by `enrichWithDrivePins(parsed: ParsedSheet, driveClient, ctx): Promise<ParseResult>` (`lib/sync/enrichWithDrivePins.ts:211`). That function constructs the `ParseResult` via a **field-by-field return literal** (`:262-279`) that copies 12 named fields (`show`/`crewMembers`/`hotelReservations`/`rooms`/`transportation`/`contacts`/`pullSheet`/`diagrams`/`openingReel`/`raw_unrecognized`/`warnings`/`hardErrors`) — it does NOT spread `parsed`, and as authored does NOT copy `runOfShow`. Because `ParseResult.runOfShow` is OPTIONAL, typecheck will NOT force the copy. So without this task: `parseSheet` fills `ParsedSheet.runOfShow` (Task 1.8), the enrich bridge silently drops it, the §02 sync sees `parseResult.runOfShow === undefined` → treats it as an unlocatable grid → writes `null` + `AGENDA_GRID_MALFORMED` → **the run-of-show never reaches crew on the real pipeline.** This is a parser-side wiring fix (the bridge is in `lib/sync`, but it's the producer half of the §01 parser contract — §02 only reads), so it lands here.

- [ ] **Write failing test** — `tests/sync/enrichWithDrivePins.runOfShow.test.ts`:
```ts
import { describe, expect, test } from "vitest";
import { enrichWithDrivePins } from "@/lib/sync/enrichWithDrivePins";
import { mockDriveClient } from "@/lib/sync/mocks/mockDriveClient";
import type { ParsedSheet } from "@/lib/parser/types";

// Mirror the emptyParsed builder + baseCtx from tests/sync/enrichWithDrivePins.test.ts.
function emptyParsed(overrides: Partial<ParsedSheet> = {}): ParsedSheet {
  return {
    show: {
      title: "", client_label: "", client_contact: null, template_version: "v4",
      venue: null, dates: { travelIn: null, set: null, showDays: [], travelOut: null },
      schedule_phases: {}, event_details: {}, agenda_links: [],
      coi_status: null, po: null, proposal: null, invoice: null, invoice_notes: null,
    },
    crewMembers: [], hotelReservations: [], rooms: [], transportation: null, contacts: [],
    pullSheet: null,
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null, raw_unrecognized: [], warnings: [], hardErrors: [],
    ...overrides,
  };
}
const baseCtx = {
  driveFileId: "show-file-id-1",
  fileMeta: {
    driveFileId: "show-file-id-1", headRevisionId: "show-head-1",
    md5Checksum: "x".repeat(32),
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: "2026-05-01T00:00:00.000Z",
  },
};

describe("enrichWithDrivePins — runOfShow survives the ParsedSheet→ParseResult bridge", () => {
  test("a filled runOfShow deep-equals on the ParseResult (NOT dropped)", async () => {
    const runOfShow = { "2026-05-14": [{ start: "8:00 AM", title: "X" }] };
    const parsed = emptyParsed({ runOfShow });
    const result = await enrichWithDrivePins(parsed, mockDriveClient, baseCtx);
    expect(result.runOfShow).toEqual(runOfShow);
  });

  test("undefined runOfShow → omitted on the ParseResult (exactOptionalPropertyTypes)", async () => {
    const parsed = emptyParsed(); // no runOfShow key
    const result = await enrichWithDrivePins(parsed, mockDriveClient, baseCtx);
    expect(result.runOfShow).toBeUndefined();
    expect("runOfShow" in result).toBe(false); // truly absent, not present-as-undefined
  });
});
```
- [ ] **Run, verify fails** — `pnpm vitest run tests/sync/enrichWithDrivePins.runOfShow.test.ts -t 'survives the ParsedSheet'`. Expected: the return literal (`:262-279`) never copies `runOfShow` → `result.runOfShow` is `undefined` → the deep-equal `toEqual(runOfShow)` fails (the data-loss bug, red). The undefined-case passes trivially (which is correct — it's the regression guard for the conditional spread).
- [ ] **Minimal impl** — in `lib/sync/enrichWithDrivePins.ts`, add to the return literal (`:262-279`), alongside the existing fields (e.g. directly after `hardErrors: parsed.hardErrors,`), a **conditional spread** (required under `exactOptionalPropertyTypes: true`, `tsconfig.json:9` — assigning a possibly-`undefined` to the optional `runOfShow?` is a strict-mode error):
```ts
    hardErrors: parsed.hardErrors,
    ...(parsed.runOfShow !== undefined ? { runOfShow: parsed.runOfShow } : {}),
```
No other change — `runOfShow` is pass-through (the enrich step pins Drive assets; it neither parses nor transforms the agenda).
- [ ] **Run, verify passes** — `pnpm vitest run tests/sync/enrichWithDrivePins.runOfShow.test.ts` + `pnpm vitest run tests/sync/enrichWithDrivePins.test.ts` (no regression to the 12 existing fields) + `pnpm typecheck` (`tsc --noEmit`) — MUST pass.
- [ ] **Commit** — `git add lib/sync/enrichWithDrivePins.ts tests/sync/enrichWithDrivePins.runOfShow.test.ts && git commit -m "feat(sync): carry runOfShow across the enrichWithDrivePins ParsedSheet→ParseResult bridge"`

---

### Task 1.10 — Robustness: stale `raw/` fixtures + empty-skeleton + prefix-day variant never crash

**Files:** `tests/parser/parseAgenda.test.ts` (append robustness suite).
**Interfaces — Consumes:** the stale `fixtures/shows/raw/*.md` (demoted) + production empty fixtures. **Produces:** fail-soft pins (no new production code expected — if any crashes, fix `agenda.ts` minimally).

Spec §6 tests 1b/2/3: the stale multi-table `raw/2025-03-dci-rpas-central.md` (carries a normalized `EVENT/DAY` side-table the current template doesn't emit), `raw/2025-04-asset-mgmt-cfo-coo.md` (trimmed block), and the prefix-day `raw/2025-10-consultants-roundtable.md` must each parse fail-soft: a clean partial `Record` OR `undefined`, **never a crash, never the normalized side-table parsed as run-of-show**. The empty production fixtures (`exporter-xlsx/redefining-fi.md`, `exporter-xlsx/rpas.md` — auto-time skeletons) → a `Record` of all-`[]` keys (never invents entries). **Concrete failure mode caught:** a crash on a stale multi-table; the `EVENT/DAY` side-table mis-parsed as sessions; the parser inventing entries from auto-time cells.

- [ ] **Write failing test** — append:
```ts
describe("parseAgenda — robustness (stale raw/ fixtures + empty skeletons, fail-soft only)", () => {
  const datesAny = datesOf([
    "2025-03-26", "2025-03-27", "2025-04-15", "2025-04-16",
    "2025-10-14", "2025-10-15", "2025-09-05",
  ]);

  it.each([
    "fixtures/shows/raw/2025-03-dci-rpas-central.md",
    "fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md",
    "fixtures/shows/raw/2025-10-consultants-roundtable.md",
  ])("stale/variant %s parses fail-soft (Record or undefined, never throws, no EVENT/DAY garbage)", (path) => {
    const md = readFileSync(path, "utf8");
    let r!: ReturnType<typeof parseAgenda>;
    expect(() => { r = parseAgenda(md, datesAny); }).not.toThrow();
    expect(r.runOfShow === undefined || typeof r.runOfShow === "object").toBe(true);
    // never mis-parse a normalized EVENT/DAY side-table as a session title
    for (const day of Object.values(r.runOfShow ?? {})) {
      for (const e of day) {
        expect(e.title.toUpperCase()).not.toBe("EVENT");
        expect(e.title.toUpperCase()).not.toBe("DAY");
      }
    }
  });

  it("empty production skeleton (auto-times, blank TITLEs) → all-[] Record, no invented entries", () => {
    const md = readFileSync("fixtures/shows/exporter-xlsx/rpas.md", "utf8");
    const r = parseAgenda(md, datesAny);
    // located grid → object (not undefined); every present day is [] (no real titles)
    if (r.runOfShow) for (const day of Object.values(r.runOfShow)) expect(day).toEqual([]);
  });
});
```
- [ ] **Run, verify fails-or-passes** — `pnpm vitest run tests/parser/parseAgenda.test.ts -t 'robustness'`. Expected: most pass immediately (fail-soft already holds from Tasks 1.3-1.7). If any **throws** (e.g. an undefined-index on a ragged stale table) or emits an `EVENT`/`DAY` title, that is the red → fix `agenda.ts` minimally (guard the index, or confirm the side-table lacks a token-header so it's skipped). The day-name resolution for `consultants` may yield `undefined` grid — acceptable (assertion allows it).
- [ ] **Minimal impl** — only if a fixture crashes: add the missing guard in `agenda.ts` (e.g. bounds-check `header.length` in `locateBlocks`). No new feature code if all green.
- [ ] **Run, verify passes** — `pnpm vitest run tests/parser/parseAgenda.test.ts`. All green.
- [ ] **Commit** — `git add tests/parser/parseAgenda.test.ts lib/parser/blocks/agenda.ts && git commit -m "test(parser): pin parseAgenda fail-soft on stale multi-table + empty-skeleton + prefix-day fixtures"`

---

## §01 exit checklist

- [ ] **All parser + bridge tests green:** `pnpm vitest run tests/parser/ tests/sync/enrichWithDrivePins.runOfShow.test.ts tests/sync/enrichWithDrivePins.test.ts` (incl. `parseAgenda.test.ts`, `agendaTypes.test.ts`, `agenda.fixtures.test.ts`, `parseSheet.test.ts`, `exporterFixtures.test.ts` — no regression; the 12-field enrich pass-through still green).
- [ ] **`runOfShow` survives the enrich bridge (Task 1.9):** `enrichWithDrivePins` copies `runOfShow` (conditional spread) from `ParsedSheet` → `ParseResult`, so the §02 sync reads a populated field — a filled agenda is NOT silently dropped at the `ParsedSheet→ParseResult` boundary.
- [ ] **No-raw-codes gate green:** `pnpm vitest run tests/cross-cutting/no-raw-codes.test.ts` — the regenerated `lib/messages/__generated__/internal-code-enums.ts` (committed in Task 1.8's commit) carries **ALL 5** `AGENDA_*` codes: `AGENDA_GRID_MALFORMED`, `AGENDA_BLOCK_UNRESOLVED`, `AGENDA_DAY_AMBIGUOUS`, `AGENDA_DAY_TRUNCATED`, `AGENDA_DAY_EMPTIED`. **All 5 are defined as `lib/parser` helpers** in `lib/parser/blocks/agendaWarnings.ts` (each a `code:`-property-bearing factory). The extractor's `parse_warnings.code` pass scans `readFiles(["lib/parser"])` ONLY, gated on `/ParseWarning|warnings|hardErrors/`, matching `code:` properties via `CODE_PROPERTY_RE` (`scripts/extract-internal-code-enums.ts:69-72`) — so co-locating all 5 literals under `lib/parser` is what makes them all extract in §01. The PARSER emits only 4 of them; the §02 sync merely **imports `agendaDayEmptied`** and emits the 5th — it does NOT define a new code literal, so there is no §01↔§02 precondition deadlock and no "5th regenerates in §02." The Task 1.3 `agendaWarnings` test asserts all 5 `code:` values exist.
- [ ] **Typecheck clean:** `pnpm tsc --noEmit` — `runOfShow?` optional on both shapes did not break any existing `parseSheet` return site; `AgendaEntry` is not reachable from `ShowRow`.
- [ ] **No DB / projection / UI touched:** `git diff --name-only main...HEAD` lists only `lib/parser/**`, `lib/messages/__generated__/internal-code-enums.ts`, `lib/sync/enrichWithDrivePins.ts` (Task 1.9 — the producer-side `ParseResult` bridge; NOT the §02 sync WRITE path), `tests/parser/**`, and `tests/sync/enrichWithDrivePins.runOfShow.test.ts` (+ `tests/cross-cutting/no-raw-codes.test.ts` unchanged-but-passing). No `supabase/`, `lib/data/`, `components/`, or `app/` files; no §02 sync-write or §03 UI surface.
- [ ] **Positive expectations are clone-and-read:** every asserted East Coast/RIA value was grepped from the fixture, never hardcoded from the spec prose.

> Next: `02-migration-projection.md` (the `shows_internal.run_of_show` column, sync CONFIRMED-ONLY write — which IMPORTS + EMITS `agendaDayEmptied` from `lib/parser/blocks/agendaWarnings.ts`, no new code literal — and the `getShowForViewer.runOfShow` projection).
