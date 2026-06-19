# TRAVEL-tab Flight Parser (DEF-FLIGHT-1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a parser block that reads each crew member's flight from the TRAVEL tab's FLIGHT DETAILS table into `crew_members.flight_info` (joined-by-name), surfacing the RPAS + both FinTech crew flights on the already-shipped Travel card.

**Architecture:** Parser-only. A new `lib/parser/blocks/travelFlights.ts` (`parseTravelFlights(markdown, crewMembers, agg): void`) called from `parseSheet` after `parseCrew`, enriching matched roster rows' `flight_info` in place (TECH-path precedence). Plus 3 quiet `§12.4` warning codes via warning factories. Fail-safe posture: never corrupt `flight_info`, never throw/block a sync, every could-be-real-flight anomaly emits a quiet warning.

**Tech Stack:** TypeScript (strict), Vitest. Pure parser code (no DB/UI).

**Spec:** `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-19-travel-tab-flight-parser.md` (Codex-APPROVED, R9).

## Global Constraints

- **TDD per task**: failing test → minimal impl → passing → commit.
- **PARSER-ONLY**: no exporter/sync/migration/projection/UI change.
- **Fail-safe principle** (spec §1): the ONLY mutation path is an unambiguous single-table, single-name-match, parseable-cell flyer; every other case does NOT mutate and (when a real flight could exist) emits a quiet warning; never overwrite a non-null `flight_info` (TECH precedence).
- **Three §12.4 codes** (`TRAVEL_FLIGHT_NAME_UNMATCHED`, `TRAVEL_FLIGHT_UNPARSEABLE`, `TRAVEL_FLIGHT_AMBIGUOUS_TABLE`), each `crewFacing: null`, each via the 4-part lockstep (below).
- **Commit per task**, conventional commits (`feat(parser):` / `test(parser):`).
- **The agenda helpers are module-private** (`isolateAgendaTable`/`cleanRows`/`isTokenHeaderLine`, `agenda.ts`) — write TRAVEL-specific versions; the exported `clean` + `parseTableRows` (`_helpers.ts:18`/`:45`) may be reused where noted.

## §12.4 4-part lockstep (per code, one commit — the M12.1 lesson)

1. **Master-spec §12.4 table row** (5 columns: code, where-it-surfaces, doug-facing, crew-facing, follow-up) in `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (the §12.4 table starts ~`:2768`).
2. **§12.4 `helpfulContext` appendix entry** (the helpfulContext lives in the YAML appendix AFTER the table, `<!-- §12.4 helpfulContext appendix -->` ~`:2766`, NOT in the table columns).
3. **`pnpm gen:spec-codes`** (`tsx scripts/extract-spec-codes.ts`) → regenerates `lib/messages/__generated__/spec-codes.ts` (feeds `SPEC_CODES` + auto-derives `CODE_SCENARIOS`).
4. **`lib/messages/catalog.ts` `MESSAGE_CATALOG[code]`** row — `{ code, severity, dougFacing, crewFacing: null, followUp, helpfulContext, title, longExplanation, helpHref }`. The `x1-catalog-parity` test (`codes.test.ts:79-103`) asserts `dougFacing`/`crewFacing`/`followUp`/`helpfulContext` match §12.4 EXACTLY, and `Object.keys(MESSAGE_CATALOG) === Object.keys(SPEC_CODES)`.

## Meta-test inventory (mandatory declaration)

- **`tests/cross-cutting/codes.test.ts` (orphan-codes + `x1-catalog-parity`) — EXTENDED.** The 3 `code:` literals in `travelFlightWarnings.ts` are producers the orphan gate scans (`PRODUCER_RE = /\bcode:\s*["'`+"`"+`]([A-Z]…)["'`+"`"+`]/g` over app/lib, `codes.test.ts:17`); each MUST be in §12.4 + the catalog. **This is why Task 1 lands the factories + the full lockstep in ONE commit** — a `code:` literal without its §12.4/catalog rows fails the gate.
- **`postgrest-dml-lockdown`, advisory-lock topology, `_metaSentinelHidingContract` — N/A** (no DB/RPC/lock/UI surface).
- No layout-dimensions / transition-audit tasks (no UI).

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `lib/parser/blocks/travelFlightWarnings.ts` | The 3 warning factory functions (the `code:` producers) | **Create** |
| master spec §12.4 + appendix, `__generated__/spec-codes.ts`, `lib/messages/catalog.ts` | The 3 codes' catalog (4-part lockstep) | Modify |
| `lib/parser/blocks/travelFlights.ts` | `parseTravelFlights` + the cell normalizer + block helpers | **Create** |
| `lib/parser/index.ts` | One import + one call after `parseCrew` (`:369`) | Modify |
| `tests/parser/travelFlightNormalize.test.ts` | Pin the pure cell→`flight_info` normalizer | **Create** |
| `tests/parser/travelFlights.test.ts` | Fixture + synthetic end-to-end parser tests | **Create** |

---

## Task 1: Warning factories + §12.4 lockstep (×3)

**Files:**
- Create: `lib/parser/blocks/travelFlightWarnings.ts`
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 table + appendix), `lib/messages/catalog.ts`; regen `lib/messages/__generated__/spec-codes.ts`
- Test: the existing `tests/cross-cutting/codes.test.ts` (must stay green)

**Interfaces:**
- Consumes: `ParseWarning` (`lib/parser/types.ts:1-6`, `{ severity, code, message, blockRef?, rawSnippet? }`).
- Produces: `travelFlightNameUnmatched(name)`, `travelFlightUnparseable(name, rawCell)`, `travelFlightAmbiguousTable()` → `ParseWarning`. Used by Task 3.

- [ ] **Step 1: Write the warning factories** (`lib/parser/blocks/travelFlightWarnings.ts`) — mirrors `agendaWarnings.ts`:

```ts
import type { ParseWarning } from "../types";

const travel = (index = 0) => ({ kind: "travel" as const, index });

export function travelFlightNameUnmatched(name: string): ParseWarning {
  return {
    severity: "warn",
    code: "TRAVEL_FLIGHT_NAME_UNMATCHED",
    message: `TRAVEL flight for "${name}" matched zero or multiple roster crew; not attached`,
    blockRef: travel(),
    rawSnippet: name,
  };
}

export function travelFlightUnparseable(name: string, rawCell: string): ParseWarning {
  return {
    severity: "warn",
    code: "TRAVEL_FLIGHT_UNPARSEABLE",
    message: `TRAVEL flight for "${name}" had no recognizable flight date; not attached`,
    blockRef: travel(),
    rawSnippet: rawCell,
  };
}

export function travelFlightAmbiguousTable(): ParseWarning {
  return {
    severity: "warn",
    code: "TRAVEL_FLIGHT_AMBIGUOUS_TABLE",
    message: "More than one TRAVEL flight table found; flights not attached (remove the duplicate/old one)",
    blockRef: travel(),
  };
}
```

- [ ] **Step 2: Add the 3 rows to the master-spec §12.4 table** (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`, in the §12.4 code table). Each row, 5 columns, e.g.:

```markdown
| TRAVEL_FLIGHT_NAME_UNMATCHED | A TRAVEL-tab flight whose crew name doesn't match the roster (parser warning, quiet → /admin/dev + sync_log). | "A flight on the TRAVEL tab couldn't be matched to a crew name — check the name spelling matches the roster." | — | Doug → check sheet |
| TRAVEL_FLIGHT_UNPARSEABLE | A TRAVEL-tab FLIGHT DETAILS cell with no recognizable flight date (parser warning, quiet). | "A crew member's TRAVEL-tab flight couldn't be read (no recognizable flight date) — check the format." | — | Doug → check sheet |
| TRAVEL_FLIGHT_AMBIGUOUS_TABLE | More than one TRAVEL flight table found in the sheet export (parser warning, quiet). | "Found more than one TRAVEL flight table — remove or rename the duplicate/old one so flights can be read." | — | Doug → check sheet |
```

- [ ] **Step 3: Add the 3 `helpfulContext` entries to the §12.4 appendix** (the `<!-- §12.4 helpfulContext appendix -->` block). Each names the cause + the fix, e.g. for `TRAVEL_FLIGHT_NAME_UNMATCHED`: "A flight in the TRAVEL tab's FLIGHT DETAILS table couldn't be attached because its crew name didn't exactly match a roster name (zero or multiple matches). The flight is skipped (never mis-assigned); fix the name spelling so it matches the roster." (Similar concrete copy for UNPARSEABLE — no readable date; AMBIGUOUS_TABLE — duplicate table, remove the old one.)

- [ ] **Step 4: Regenerate + add catalog rows**

Run: `pnpm gen:spec-codes` (regenerates `lib/messages/__generated__/spec-codes.ts`). Then add a `MESSAGE_CATALOG` row for each code in `lib/messages/catalog.ts` (model = `AGENDA_DAY_EMPTIED`, `:1130`): `{ code, severity: "warning", dougFacing: "<exact §12.4 doug-facing>", crewFacing: null, followUp: "Doug → check sheet", helpfulContext: "<exact §12.4 appendix text>", title: "<short>", longExplanation: "<1-2 sentences>", helpHref: "/help/errors#<CODE>" }`. The `dougFacing`/`crewFacing`/`followUp`/`helpfulContext` MUST byte-match §12.4 (the parity test).

- [ ] **Step 5: Run the codes gate**

Run: `pnpm vitest run tests/cross-cutting/codes.test.ts`
Expected: PASS — the 3 producer literals resolve to §12.4 + catalog; `MESSAGE_CATALOG` keys === `SPEC_CODES` keys; field parity holds. (If it fails on a field mismatch, align catalog ↔ §12.4 exactly.)

- [ ] **Step 6: Commit**

```bash
git add lib/parser/blocks/travelFlightWarnings.ts docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md lib/messages/__generated__/spec-codes.ts lib/messages/catalog.ts
git commit -m "feat(parser): TRAVEL flight warning codes (3) + §12.4 catalog lockstep"
```

---

## Task 2: The cell normalizer (pure function)

**Files:**
- Create: `lib/parser/blocks/travelFlights.ts` (the `normalizeTravelCell` export — Task 3 adds the rest)
- Test: `tests/parser/travelFlightNormalize.test.ts`

**Interfaces:**
- Produces: `normalizeTravelCell(raw: string): string | null` — the flattened FLIGHT DETAILS cell → `flight_info` (`"conf? leg | leg | …"`), or `null` when there is no `M/D` date token (caller treats `null` as format-drift). Used by Task 3.

- [ ] **Step 1: Write the failing test** (`tests/parser/travelFlightNormalize.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { normalizeTravelCell } from "@/lib/parser/blocks/travelFlights";

describe("normalizeTravelCell", () => {
  it("round-trip with leading conf → conf-prefixed two legs joined by ' | '", () => {
    const raw = "GEUZAB 3/22 AA3002 LGA - ORD 7:23am - 9:15am 3/26 AA2723 ORD - LGA 7:23am - 10:30am";
    expect(normalizeTravelCell(raw)).toBe(
      "GEUZAB 3/22 AA3002 LGA - ORD 7:23am - 9:15am | 3/26 AA2723 ORD - LGA 7:23am - 10:30am",
    );
  });
  it("no conf (FinTech shape) → two legs, no prefix", () => {
    const raw = "5/2 AA1080 LGA - ORD 12:00pm - 1:00pm 5/7 AA3237 ORD - LGA 10:02am - 1:17pm";
    expect(normalizeTravelCell(raw)).toBe(
      "5/2 AA1080 LGA - ORD 12:00pm - 1:00pm | 5/7 AA3237 ORD - LGA 10:02am - 1:17pm",
    );
  });
  it("one-way (single date) → one leg, no ' | '", () => {
    expect(normalizeTravelCell("3/22 AA3002 LGA - ORD 7:23am - 9:15am")).toBe(
      "3/22 AA3002 LGA - ORD 7:23am - 9:15am",
    );
  });
  it("no date token → null (caller warns)", () => {
    expect(normalizeTravelCell("Mar 22 some note")).toBeNull();
    expect(normalizeTravelCell("")).toBeNull();
  });
  it("literal | in the source is normalized to / (reserved as the leg separator)", () => {
    const out = normalizeTravelCell("3/22 AA3002 LGA | ORD 7:23am");
    // exactly one ' | ' would be the leg separator; the source pipe must NOT add a leg.
    expect(out).not.toBeNull();
    expect((out as string).split(/\s*\|\s*|\n/).length).toBe(1); // single leg (one date)
    expect(out).toContain("LGA / ORD");
  });
});
```

- [ ] **Step 2: Run — verify it fails** (`Cannot find … normalizeTravelCell`).

Run: `pnpm vitest run tests/parser/travelFlightNormalize.test.ts` → FAIL.

- [ ] **Step 3: Implement `normalizeTravelCell`** in a new `lib/parser/blocks/travelFlights.ts`:

```ts
const DATE_RE = /^\d{1,2}\/\d{1,2}$/;

/**
 * A flattened TRAVEL FLIGHT DETAILS cell → flight_info, or null if it has no
 * M/D leg date (the exporter flattens the source cell to one space-separated
 * line, so the only leg boundary is the date token). The render splits the
 * result on " | "; a literal source pipe is normalized to "/" so it cannot
 * create a spurious leg.
 */
export function normalizeTravelCell(raw: string): string | null {
  const safe = raw.replace(/\|/g, "/");
  const tokens = safe.split(/\s+/).filter((t) => t.length > 0);
  const dateIdx = tokens.flatMap((t, i) => (DATE_RE.test(t) ? [i] : []));
  if (dateIdx.length === 0) return null;
  const conf = tokens.slice(0, dateIdx[0]!).join(" ");
  const legs: string[] = [];
  for (let k = 0; k < dateIdx.length; k += 1) {
    const start = dateIdx[k]!;
    const end = k + 1 < dateIdx.length ? dateIdx[k + 1]! : tokens.length;
    legs.push(tokens.slice(start, end).join(" "));
  }
  const joined = legs.join(" | ");
  return conf ? `${conf} ${joined}` : joined;
}
```

- [ ] **Step 4: Run — verify it passes.** `pnpm vitest run tests/parser/travelFlightNormalize.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/travelFlights.ts tests/parser/travelFlightNormalize.test.ts
git commit -m "feat(parser): TRAVEL flight cell normalizer (date-split legs, conf prefix, pipe-safe)"
```

---

## Task 3: `parseTravelFlights` + wiring

**Files:**
- Modify: `lib/parser/blocks/travelFlights.ts` (add the parser + helpers), `lib/parser/index.ts` (`:17` import, `:369` call)
- Test: `tests/parser/travelFlights.test.ts`

**Interfaces:**
- Consumes: `normalizeTravelCell` (Task 2); the warning factories (Task 1); `CrewMemberRow` (`types.ts:63-72`, `name`/`flight_info`); `ParseAggregator` (`warnings.ts:15`, `.warnings.push`); the exported `clean` (`_helpers.ts:45`, `s.replace(/\\(.)/g,"$1").trim()`).
- Produces: `parseTravelFlights(markdown: string, crewMembers: CrewMemberRow[], agg: ParseAggregator): void` — enriches matched rows' `flight_info` in place. Consumed by `parseSheet`.

- [ ] **Step 1: Write the failing tests** (`tests/parser/travelFlights.test.ts`) — the spec's test plan 1-13. Core (others follow the same shape):

```ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { parseSheet } from "@/lib/parser";

function flightOf(md: string, name: string) {
  const r = parseSheet(md, "t.md");
  return { crew: r.crewMembers, warnings: r.warnings, row: r.crewMembers.find((m) => (m.name ?? "").includes(name)) };
}

describe("parseTravelFlights — fixtures", () => {
  it("rpas.md → John Carleo flight_info, derived from the source cell; ZERO TRAVEL_FLIGHT_* warnings", () => {
    const md = readFileSync("fixtures/shows/exporter-xlsx/rpas.md", "utf8");
    const { crew, warnings, row } = flightOf(md, "John Carleo");
    // derive expected legs from the fixture cell (anti-tautology)
    expect(row?.flight_info).toContain("GEUZAB 3/22 AA3002");
    expect(row?.flight_info).toContain(" | 3/26 AA2723");
    // no OTHER crew row gains a flight; no travel warning on a real show
    expect(crew.filter((m) => m.flight_info != null).map((m) => m.name)).toEqual(["John Carleo"]);
    expect(warnings.filter((w) => w.code.startsWith("TRAVEL_FLIGHT_"))).toEqual([]);
  });

  it("fintech.md → John Carleo flight_info (no conf), zero travel warnings", () => {
    const md = readFileSync("fixtures/shows/exporter-xlsx/fintech.md", "utf8");
    const { warnings, row } = flightOf(md, "John Carleo");
    expect(row?.flight_info).toBe("5/2 AA1080 LGA - ORD 12:00pm - 1:00pm | 5/7 AA3237 ORD - LGA 10:02am - 1:17pm");
    expect(warnings.filter((w) => w.code.startsWith("TRAVEL_FLIGHT_"))).toEqual([]);
  });
});
```

Plus synthetic tests (build a minimal markdown with the TRAVEL header signature). Each is its own `it`:
- **unmatched name** (a flyer `Jane Doe` not on the roster) → one `TRAVEL_FLIGHT_NAME_UNMATCHED`, no mutation.
- **ambiguous name** (two roster `John Carleo`) → `TRAVEL_FLIGHT_NAME_UNMATCHED`, no mutation.
- **format-drift** (a matched flyer, non-sentinel cell, no `M/D`) → `TRAVEL_FLIGHT_UNPARSEABLE`, `flight_info` stays null.
- **named cell with date AND `FLIGHT #` text** → PARSES (not legend-dropped).
- **blank-NAME legend row** (`CODE`/`XXX - XXX`) → no flight, no warning.
- **sentinel** (`DRIVING`/`LOCAL`/`Local` in the cell) → silent non-flyer.
- **precedence** (a crew row pre-set with `flight_info` ≠ null) → NOT overwritten.
- **escaped pipe** (literal `\|` in a NOTES cell before flight, AND in the FLIGHT DETAILS cell) → column binding intact (flight attaches to the right row); the FLIGHT DETAILS `|`→`/` so the leg count is correct.
- **non-TRAVEL scoping** (a second `NAME … FLIGHT DETAILS` table lacking `FLIGHT BOOKED`/`OK TO BOOK?`, with a matching name + date cell) → not matched, no mutation, no warning.
- **duplicate signature** (two full-signature TRAVEL blocks) → no mutation, one `TRAVEL_FLIGHT_AMBIGUOUS_TABLE`.
- **following table** (a later pipe table after a blank line with a date cell at the flight col) → not scanned.

(Write each with a small inline markdown builder; derive expected values from the input. Use the real TRAVEL header `| NAME | ROLE | | CONFIRMED | FLIGHT BOOKED | | OK to BOOK? | NOTES | FLIGHT DETAILS | FLIGHT DETAILS |` + a `| :---: | … |` separator to model real shows.)

- [ ] **Step 2: Run — verify they fail** (`parseTravelFlights` not wired → `flight_info` null for John Carleo). `pnpm vitest run tests/parser/travelFlights.test.ts` → FAIL.

- [ ] **Step 3: Add `parseTravelFlights` + helpers** to `lib/parser/blocks/travelFlights.ts`:

```ts
import type { CrewMemberRow } from "../types";
import type { ParseAggregator } from "../warnings";
import { clean } from "./_helpers";
import {
  travelFlightNameUnmatched, travelFlightUnparseable, travelFlightAmbiguousTable,
} from "./travelFlightWarnings";

const SENTINELS = new Set(["DRIVING", "LOCAL", "N/A", "TBD", "TBA"]);
const isSeparator = (cells: string[]) => cells.length > 0 && cells.every((c) => /^[\s:|*-]*$/.test(c));
const normalizeName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Split ONE pipe-row into cells on UNESCAPED pipes (a `|` is a delimiter iff
 * preceded by an even number of `\`). Then `clean()` unescapes each cell. */
function splitEscapedCells(line: string): string[] {
  const t = line.trim();
  const cells: string[] = [];
  let cur = "";
  let i = 0;
  // skip leading pipe
  if (t.startsWith("|")) i = 1;
  for (; i < t.length; i += 1) {
    const ch = t[i]!;
    if (ch === "\\") { cur += ch + (t[i + 1] ?? ""); i += 1; continue; }
    if (ch === "|") { cells.push(cur); cur = ""; continue; }
    cur += ch;
  }
  cells.push(cur); // trailing cell after last pipe (the row ends with `|` so this is empty → dropped below)
  // drop the trailing empty cell produced by the row's closing pipe
  if (cells.length > 0 && cells[cells.length - 1]!.trim() === "") cells.pop();
  return cells.map((c) => clean(c));
}

const isHeaderLine = (line: string): { nameIdx: number; flightIdx: number } | null => {
  const t = line.trim();
  if (!t.startsWith("|")) return null;
  const cells = splitEscapedCells(line).map((c) => c.toUpperCase());
  if ((cells[0] ?? "") !== "NAME") return null;
  const flightIdx = cells.findIndex((c) => c === "FLIGHT DETAILS");
  if (flightIdx === -1) return null;
  const hasSibling = cells.some((c) => c === "FLIGHT BOOKED" || c === "OK TO BOOK?");
  if (!hasSibling) return null;
  return { nameIdx: 0, flightIdx };
};

/** All contiguous pipe-blocks whose header matches the full TRAVEL signature. */
function findTravelBlocks(markdown: string): Array<{ lines: string[]; nameIdx: number; flightIdx: number }> {
  const lines = markdown.split("\n");
  const isPipe = (l: string) => l.trim().startsWith("|");
  const blocks: Array<{ lines: string[]; nameIdx: number; flightIdx: number }> = [];
  for (let h = 0; h < lines.length; h += 1) {
    const hdr = isHeaderLine(lines[h]!);
    if (!hdr) continue;
    let end = h;
    while (end + 1 < lines.length && isPipe(lines[end + 1]!)) end += 1;
    blocks.push({ lines: lines.slice(h, end + 1), nameIdx: hdr.nameIdx, flightIdx: hdr.flightIdx });
    h = end; // don't re-scan inside this block
  }
  return blocks;
}

export function parseTravelFlights(
  markdown: string,
  crewMembers: CrewMemberRow[],
  agg: ParseAggregator,
): void {
  const blocks = findTravelBlocks(markdown);
  if (blocks.length === 0) return;
  if (blocks.length > 1) { agg.warnings.push(travelFlightAmbiguousTable()); return; }
  const { lines, nameIdx, flightIdx } = blocks[0]!;
  for (let r = 1; r < lines.length; r += 1) {
    const cells = splitEscapedCells(lines[r]!);
    if (isSeparator(cells)) continue;
    const nameRaw = (cells[nameIdx] ?? "").trim();
    if (nameRaw === "") break; // blank-NAME legend / end of crew block
    const flightRaw = (cells[flightIdx] ?? "").trim();
    if (flightRaw === "" || SENTINELS.has(flightRaw.toUpperCase())) continue; // silent non-flyer
    const flightInfo = normalizeTravelCell(flightRaw);
    if (flightInfo === null) { agg.warnings.push(travelFlightUnparseable(nameRaw, flightRaw)); continue; }
    const matches = crewMembers.filter((m) => normalizeName(m.name ?? "") === normalizeName(nameRaw));
    if (matches.length !== 1) { agg.warnings.push(travelFlightNameUnmatched(nameRaw)); continue; }
    if (matches[0]!.flight_info == null) matches[0]!.flight_info = flightInfo; // TECH precedence
  }
}
```

- [ ] **Step 4: Wire into `parseSheet`** (`lib/parser/index.ts`). Add the import after the `parseCrew` import (`:17`):

```ts
import { parseTravelFlights } from "./blocks/travelFlights";
```

and the call immediately after `const crewMembers = parseCrew(markdown, version, agg);` (`:369`):

```ts
  const crewMembers = parseCrew(markdown, version, agg);
  parseTravelFlights(markdown, crewMembers, agg);
```

- [ ] **Step 5: Run the parser tests + the broader parser suite**

Run: `pnpm vitest run tests/parser/travelFlights.test.ts tests/parser/travelFlightNormalize.test.ts tests/parser/parseSheet.test.ts tests/parser/crewFlightFixture.test.ts`
Expected: PASS (the new tests; the existing parseSheet + crew-flight fixture tests unregressed — East Coast TECH-path still 3/3, untouched by the TRAVEL path).

- [ ] **Step 6: Typecheck + the codes gate**

Run: `pnpm tsc --noEmit && pnpm vitest run tests/cross-cutting/codes.test.ts`
Expected: no type errors; codes gate green (the 3 codes are now PRODUCED by the wired parser + in §12.4/catalog).

- [ ] **Step 7: Commit**

```bash
git add lib/parser/blocks/travelFlights.ts lib/parser/index.ts tests/parser/travelFlights.test.ts
git commit -m "feat(parser): parse TRAVEL-tab flights into crew flight_info (join-by-name, fail-safe)"
```

---

## Close-out (after Task 3, before merge)

1. **Cross-model adversarial review** (Codex) on the whole branch diff, iterate to APPROVE.
2. **CI green** (codes/x1, structural gates; no screenshot/UI surface, so no drift expected).
3. **Merge** as a merge commit; sync local main.

Resolves `DEF-FLIGHT-1` (the deferred entry from the Phase-3 crew-flight DEFERRED.md). ~Doubles flight coverage (East Coast 3 TECH-path crew → +RPAS/FinTech 3 TRAVEL-tab crew).
