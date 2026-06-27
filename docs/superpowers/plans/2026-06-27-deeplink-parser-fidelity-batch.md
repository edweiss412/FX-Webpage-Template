# Deep-link coverage + parser-fidelity batch — implementation plan

> **For agentic workers:** TDD per task — failing test → minimal impl → passing test → commit. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship four small fixes as one PR: deep-link `UNKNOWN_FIELD` (venue) and the AGENDA(5)/PULL_SHEET(3) warnings (reusing the #154/#155 anchor infra); strip zero-width chars at the shared cell boundary; replace the transport hard-coded `/25` year with show-context inference.

**Architecture:** Two changes extend the parse-warning deep-link surface (`OPERATOR_ACTIONABLE_ANCHORED` set + `attachSourceCellAnchors` dispatch in `lib/drive/showDayTimeAnchors.ts`, plus one pure post-apply re-attach in `lib/sync/phase2.ts` for the apply-only `AGENDA_DAY_EMPTIED`). Two are pure parser-fidelity fixes in `lib/parser/blocks/` (`_helpers.ts` `clean()`, `transport.ts`).

**Tech Stack:** TypeScript, Vitest. No DB schema, no advisory lock, no UI component, no new catalog code.

**Spec:** `docs/superpowers/specs/2026-06-27-deeplink-parser-fidelity-batch-design.md` (Codex-APPROVED). Spec wins on conflict.

## Global Constraints

- TDD per task; commit per task; conventional commits; `--no-verify` (CI is the gate).
- No new catalog code / no §12.4 lockstep / no `/help/errors` family edit — all 9 codes already exist with mapped prefixes (`UNKNOWN`/`AGENDA`→crew-schedule, `PULL`→syncing-sheets). Do NOT add a prefix (that re-triggers the #155 `errors-grouping` orphan failure).
- Invariant 2 (advisory lock): the phase2 re-attach is a pure in-memory call — no new lock. Invariant 5: no raw codes (all render via catalog title). Invariant 8: no UI surface (N/A). Invariant 9: no Supabase call.
- **Run the COMPLETE `pnpm vitest run` before push** (#155 lesson: `tests/help` is shard 2, missed by a parser/drive/sync-only run). Env-bound live-DB/HTTP suites (`tests/admin/test-auth-gate` Layer-2, `pg-cron-coverage`, `email-canonicalization` live audit) fail locally without infra, pass in CI.

## Meta-test inventory (mandatory declaration)

- **EXTENDS:** the anchored-set membership pin-tests — `tests/parser/operatorActionableWarnings.test.ts` (`contains exactly the N codes`) and `tests/drive/showDayTimeAnchors.test.ts` (`hasCellAnchoredWarning is TRUE for all N anchored codes`). Both bump 5→6 (Task 1) → 14 (Task 3).
- **CREATES:** none.
- **Advisory-lock topology:** N/A — the phase2 re-attach acquires no lock; `tests/auth/advisoryLockRpcDeadlock.test.ts` untouched.
- **Supabase call-boundary (`_metaInfraContract`):** N/A — no new Supabase call.

## File Structure

- Modify: `lib/parser/dataGaps.ts` — add 9 codes to `OPERATOR_ACTIONABLE_ANCHORED` (Tasks 1, 3).
- Modify: `lib/drive/showDayTimeAnchors.ts` — extend FIELD_UNREADABLE branch (Task 1); add `KIND_TO_REGION` alias branch (Task 3).
- Modify: `lib/sync/phase2.ts` — post-apply pure re-attach for `AGENDA_DAY_EMPTIED` (Task 3).
- Modify: `lib/parser/blocks/_helpers.ts` — zero-width strip in `clean()` (Task 2); export relocated `inferShowYear` (Task 4).
- Modify: `lib/parser/blocks/hotels.ts` — drop redundant zero-width strip (Task 2); import relocated `inferShowYear` (Task 4).
- Modify: `lib/parser/blocks/transport.ts` — context-year date inference (Task 4).
- Tests: `tests/drive/showDayTimeAnchors.test.ts`, `tests/parser/operatorActionableWarnings.test.ts`, `tests/parser/blocks/_helpers.test.ts` (or new), `tests/parser/blocks/transport.test.ts`, `tests/parser/blocks/hotels.test.ts`, a phase2/apply cron-path test.

---

## Task 1: Deep-link `UNKNOWN_FIELD` to its VENUE region

**Files:**
- Modify: `lib/parser/dataGaps.ts` (`OPERATOR_ACTIONABLE_ANCHORED`)
- Modify: `lib/drive/showDayTimeAnchors.ts:119-122` (FIELD_UNREADABLE branch)
- Test: `tests/drive/showDayTimeAnchors.test.ts`, `tests/parser/operatorActionableWarnings.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/drive/showDayTimeAnchors.test.ts`, inside the `attachSourceCellAnchors / hasCellAnchoredWarning` describe (mirror the existing `FIELD_UNREADABLE` region test), add:

```ts
it("resolves UNKNOWN_FIELD by its venue region (like FIELD_UNREADABLE)", () => {
  const ws: ParseWarning[] = [
    { severity: "warn", code: "UNKNOWN_FIELD", message: "x", blockRef: { kind: "venue" } },
  ];
  attachSourceCellAnchors(ws, {
    showDay: [],
    crewRole: [],
    region: { venue: { title: "INFO", gid: 0, a1: "A5" } },
  });
  expect(ws[0]!.sourceCell).toEqual({ title: "INFO", gid: 0, a1: "A5" });
});

it("UNKNOWN_FIELD with no venue region → no link", () => {
  const ws: ParseWarning[] = [
    { severity: "warn", code: "UNKNOWN_FIELD", message: "x", blockRef: { kind: "venue" } },
  ];
  attachSourceCellAnchors(ws, { showDay: [], crewRole: [], region: {} });
  expect(ws[0]!.sourceCell).toBeUndefined();
});
```

In the same file, bump the `hasCellAnchoredWarning is TRUE for all five anchored codes` test to **six**: rename to `...all six anchored codes...` and add `"UNKNOWN_FIELD"` to the iterated array.

In `tests/parser/operatorActionableWarnings.test.ts`, bump `contains exactly the five codes` → `contains exactly the six codes`, adding `"UNKNOWN_FIELD"` to the sorted array (alphabetical position: after `STAGE_WORD_AUTOCORRECTED`, before `UNKNOWN_ROLE_TOKEN` — i.e. `…, "UNKNOWN_DAY_RESTRICTION", "UNKNOWN_FIELD", "UNKNOWN_ROLE_TOKEN"`).

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/drive/showDayTimeAnchors.test.ts tests/parser/operatorActionableWarnings.test.ts`
Expected: the new dispatch test FAILS (`sourceCell` undefined — code not in set / not dispatched); the two pin-tests FAIL (5 ≠ 6).

- [ ] **Step 3: Implement**

In `lib/parser/dataGaps.ts`, add `"UNKNOWN_FIELD"` to `OPERATOR_ACTIONABLE_ANCHORED` (after `"UNKNOWN_DAY_RESTRICTION"`):

```ts
export const OPERATOR_ACTIONABLE_ANCHORED: ReadonlySet<string> = new Set([
  "SCHEDULE_TIME_UNPARSED",
  "UNKNOWN_ROLE_TOKEN",
  "UNKNOWN_DAY_RESTRICTION",
  "UNKNOWN_FIELD",
  "STAGE_WORD_AUTOCORRECTED",
  FIELD_UNREADABLE,
]);
```

In `lib/drive/showDayTimeAnchors.ts`, widen the FIELD_UNREADABLE branch condition (it already resolves `region[kind]`, and `UNKNOWN_FIELD`'s `kind` is `"venue"`):

```ts
    } else if (w.code === "FIELD_UNREADABLE" || w.code === "UNKNOWN_FIELD") {
      const kind = w.blockRef?.kind;
      cell = kind ? (sources.region[kind] ?? null) : null;
    }
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run tests/drive/showDayTimeAnchors.test.ts tests/parser/operatorActionableWarnings.test.ts tests/parser/dataGaps.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/dataGaps.ts lib/drive/showDayTimeAnchors.ts tests/drive/showDayTimeAnchors.test.ts tests/parser/operatorActionableWarnings.test.ts
git commit --no-verify -m "feat(drive): deep-link UNKNOWN_FIELD to its venue region (reuses FIELD_UNREADABLE branch)"
```

---

## Task 2: Strip zero-width chars at the shared `clean()` boundary

**Files:**
- Modify: `lib/parser/blocks/_helpers.ts` (`clean()` :45)
- Modify: `lib/parser/blocks/hotels.ts:227` (drop redundant zero-width portion)
- Test: `tests/parser/blocks/_helpers.test.ts` (create if absent), `tests/parser/blocks/transport.test.ts` (re-parse regression), `tests/parser/blocks/hotels.test.ts`

**Interfaces:** Consumes nothing new. `clean(s)` currently = `s.replace(/\\(.)/g, "$1").trim()`; `presence()` calls `decodeEntities(clean(s))`; `transportation.parking = presence(clean(col1))` (`transport.ts:211,235`) → the strip in `clean()` reaches parking.

- [ ] **Step 1: Write the failing tests**

Create/extend `tests/parser/blocks/_helpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { clean } from "@/lib/parser/blocks/_helpers";

describe("clean() — zero-width strip", () => {
  it("removes ZWSP / ZWNJ / ZWJ / BOM", () => {
    expect(clean("a\u200Bb\u200Cc\u200Dd\uFEFFe")).toBe("abcde");
  });
  it("a value that is entirely zero-width becomes empty", () => {
    expect(clean("\u200B\uFEFF")).toBe("");
  });
  it("still unescapes backslashes and does NOT touch smart-quotes", () => {
    expect(clean("\\-Load")).toBe("-Load");
    expect(clean("the “green” room")).toBe("the “green” room"); // quotes preserved
  });
});
```

Add a transport re-parse regression in `tests/parser/blocks/transport.test.ts` (mirror its existing fixture-parse pattern; use the in-tree fixture with the ZWNJ parking cell):

```ts
it("parking field carries no zero-width characters (shared clean() strip)", () => {
  const md = readFileSync("fixtures/shows/exporter-xlsx/fintech.md", "utf8");
  const t = parseTransportation(md, "v4");
  if (t?.parking != null) {
    expect(/[\u200B-\u200D\uFEFF]/.test(t.parking)).toBe(false);
  }
});
```

(If `parseTransportation`'s import/signature differs in the test file, match the file's existing call shape; `parseTransportation(markdown, version)` per `transport.ts:105`.)

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/parser/blocks/_helpers.test.ts tests/parser/blocks/transport.test.ts -t "zero-width"`
Expected: the `clean()` strip tests FAIL (chars survive); the parking regression FAILS (ZWNJ present).

- [ ] **Step 3: Implement**

In `lib/parser/blocks/_helpers.ts`, add the zero-width strip as the FIRST operation in `clean()`:

```ts
/** Normalize whitespace, strip zero-width chars, and strip markdown escape backslashes. */
export function clean(s: string): string {
  // Strip zero-width junk (ZWSP \u200B – ZWJ \u200D, BOM \uFEFF) at the shared cell
  // boundary so every stored field (not just hotel names) is paste-safe for maps/search.
  return s
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\\(.)/g, "$1")
    .trim();
}
```

In `lib/parser/blocks/hotels.ts:227`, drop ONLY the now-redundant zero-width `.replace(/[​-‍﻿]/g, "")` line (the hotel parser's input already flows through `clean()` upstream). **Leave the existing quote→space and `\s+`→` ` lines exactly as they are** — do not rewrite or reformat them (they already use literal smart-quote chars in the live file; changing that is out of scope and risks a no-op diff churn). Result:

```ts
  const cleaned = combined
    .replace(/["“”]/g, " ") // straight + smart double-quotes → space (UNCHANGED from current)
    .replace(/\s+/g, " ")
    .trim();
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run tests/parser/blocks/_helpers.test.ts tests/parser/blocks/transport.test.ts tests/parser/blocks/hotels.test.ts`
Expected: PASS — including the existing hotel name/address tests (no regression; output unchanged because hotels still strips zero-width via `clean()` upstream + keeps its quote/whitespace handling).

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/_helpers.ts lib/parser/blocks/hotels.ts tests/parser/blocks/_helpers.test.ts tests/parser/blocks/transport.test.ts
git commit --no-verify -m "fix(parser): strip zero-width chars at the shared clean() boundary (not just hotels)"
```

---

## Task 3: Deep-link the AGENDA(5) + PULL_SHEET(3) warnings

**Files:**
- Modify: `lib/parser/dataGaps.ts` (`OPERATOR_ACTIONABLE_ANCHORED` — add 8)
- Modify: `lib/drive/showDayTimeAnchors.ts` (`KIND_TO_REGION` alias + dispatch branch)
- Modify: `lib/sync/phase2.ts` (post-apply pure re-attach for `AGENDA_DAY_EMPTIED`)
- Test: `tests/drive/showDayTimeAnchors.test.ts`, `tests/parser/operatorActionableWarnings.test.ts`, a phase2/apply cron-path test (extend the existing phase2 or applyParseResult test file)

**Interfaces:** AGENDA codes carry `blockRef:{kind:"agenda",index}` (`agendaWarnings.ts:6-41`); PULL codes carry `blockRef:{kind:"pull_sheet"}` (`pull-sheet.ts:182/223/273`). `RegionId`s `schedule` + `gear_packlist` exist. `runPhase2` receives `args.sourceAnchors` (`phase2.ts:55,117,301`); `applyParseResult` (called at `phase2.ts:368`) mutates `parseResult.warnings` in place.

- [ ] **Step 1: Write the failing tests**

In `tests/drive/showDayTimeAnchors.test.ts`, add a parameterized dispatch test:

```ts
it.each([
  ["AGENDA_GRID_MALFORMED", "agenda", "schedule"],
  ["AGENDA_BLOCK_UNRESOLVED", "agenda", "schedule"],
  ["AGENDA_DAY_AMBIGUOUS", "agenda", "schedule"],
  ["AGENDA_DAY_TRUNCATED", "agenda", "schedule"],
  ["AGENDA_DAY_EMPTIED", "agenda", "schedule"],
  ["PULL_SHEET_PARSE_PARTIAL", "pull_sheet", "gear_packlist"],
  ["PULL_SHEET_AMBIGUOUS_FORMAT", "pull_sheet", "gear_packlist"],
  ["PULL_SHEET_UNKNOWN_VARIANT", "pull_sheet", "gear_packlist"],
] as const)("resolves %s by its tab region (kind %s → region %s)", (code, kind, regionId) => {
  const ws: ParseWarning[] = [{ severity: "warn", code, message: "x", blockRef: { kind, index: 0 } }];
  attachSourceCellAnchors(ws, {
    showDay: [],
    crewRole: [],
    region: { [regionId]: { title: "T", gid: 1, a1: "A1" } },
  });
  expect(ws[0]!.sourceCell).toEqual({ title: "T", gid: 1, a1: "A1" });
});
```

Bump the `hasCellAnchoredWarning is TRUE for all six anchored codes` test (from Task 1) to **fourteen**: rename and add the 8 codes to the iterated array.

In `tests/parser/operatorActionableWarnings.test.ts`, bump `contains exactly the six codes` → `contains exactly the fourteen codes` with the full sorted array:

```ts
    expect([...OPERATOR_ACTIONABLE_ANCHORED].sort()).toEqual([
      "AGENDA_BLOCK_UNRESOLVED",
      "AGENDA_DAY_AMBIGUOUS",
      "AGENDA_DAY_EMPTIED",
      "AGENDA_DAY_TRUNCATED",
      "AGENDA_GRID_MALFORMED",
      "FIELD_UNREADABLE",
      "PULL_SHEET_AMBIGUOUS_FORMAT",
      "PULL_SHEET_PARSE_PARTIAL",
      "PULL_SHEET_UNKNOWN_VARIANT",
      "SCHEDULE_TIME_UNPARSED",
      "STAGE_WORD_AUTOCORRECTED",
      "UNKNOWN_DAY_RESTRICTION",
      "UNKNOWN_FIELD",
      "UNKNOWN_ROLE_TOKEN",
    ]);
```

Add a phase2 cron-path test (extend the existing phase2/applyParseResult test that exercises an apply where a previously-published run-of-show day goes empty). After `runPhase2`, assert the appended `AGENDA_DAY_EMPTIED` warning carries a `sourceCell` resolving to the `schedule` region. Concrete failure mode caught: the apply-appended warning shipping link-less because anchoring ran in prepare, before the apply. Match the existing test's tx-mock + `sourceAnchors` shape; pass `sourceAnchors: { schedule: { title: "AGENDA", gid: 2, a1: "A1" } }` in the `Phase2Args`.

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/drive/showDayTimeAnchors.test.ts tests/parser/operatorActionableWarnings.test.ts <phase2-test-file>`
Expected: dispatch + pin tests FAIL (codes not in set / no alias); phase2 test FAILS (`AGENDA_DAY_EMPTIED.sourceCell` undefined).

- [ ] **Step 3: Implement**

In `lib/parser/dataGaps.ts`, add the 8 codes to `OPERATOR_ACTIONABLE_ANCHORED` (the set now has 14):

```ts
export const OPERATOR_ACTIONABLE_ANCHORED: ReadonlySet<string> = new Set([
  "SCHEDULE_TIME_UNPARSED",
  "UNKNOWN_ROLE_TOKEN",
  "UNKNOWN_DAY_RESTRICTION",
  "UNKNOWN_FIELD",
  "STAGE_WORD_AUTOCORRECTED",
  "AGENDA_GRID_MALFORMED",
  "AGENDA_BLOCK_UNRESOLVED",
  "AGENDA_DAY_AMBIGUOUS",
  "AGENDA_DAY_TRUNCATED",
  "AGENDA_DAY_EMPTIED",
  "PULL_SHEET_PARSE_PARTIAL",
  "PULL_SHEET_AMBIGUOUS_FORMAT",
  "PULL_SHEET_UNKNOWN_VARIANT",
  FIELD_UNREADABLE,
]);
```

In `lib/drive/showDayTimeAnchors.ts`, add the alias map near the top of the module and a dispatch branch in `attachSourceCellAnchors` AFTER the crew branch and BEFORE the FIELD_UNREADABLE branch:

```ts
// blockRef.kind → RegionId for warnings whose `kind` is a tab-level concept that
// is not itself a RegionId. Region/tab-level link (parser knows the tab, not the
// exact cell) — matches the FIELD_UNREADABLE region precedent.
const KIND_TO_REGION: Record<string, RegionId> = {
  agenda: "schedule",
  pull_sheet: "gear_packlist",
};
```

```ts
    } else if (w.blockRef?.kind && KIND_TO_REGION[w.blockRef.kind]) {
      cell = sources.region[KIND_TO_REGION[w.blockRef.kind]!] ?? null;
    } else if (w.code === "FIELD_UNREADABLE" || w.code === "UNKNOWN_FIELD") {
```

(Import `RegionId` if not already imported: `import type { RegionId } from "@/lib/sheet-links/buildSheetDeepLink";` — verify the existing import block. The branch is only reached for in-set codes due to the outer `CELL_ANCHORED_CODES.has(w.code)` guard; any FUTURE code added to the set with `kind:"agenda"`/`"pull_sheet"` will region-anchor by design — that is the intended contract, pinned by the membership pin-test.)

In `lib/sync/phase2.ts`, import the pure re-attach and call it after `applyParseResult` mutates the warnings, on the applied path (before building the `applied` result at ~`:431`):

```ts
import { attachSourceCellAnchors } from "@/lib/drive/showDayTimeAnchors";
```

```ts
  // AGENDA_DAY_EMPTIED is appended by applyParseResult AFTER the prepare-stage
  // attachWarningAnchors ran, so it is unanchored. Re-run the PURE region-only
  // anchoring here (no fetch, no lock) using the carried sourceAnchors; idempotent
  // and non-destructive (only sets sourceCell when a cell resolves).
  attachSourceCellAnchors(parseResult.warnings, {
    showDay: [],
    crewRole: [],
    region: args.sourceAnchors ?? {},
  });
```

Place this immediately before the `const applied: … = { outcome: "applied", … parseWarnings: parseResult.warnings }` construction (`phase2.ts:~431-437`), so the carried warnings are already anchored. (Confirm `parseResult` and `args.sourceAnchors` are in scope at that point — they are, per `:434` referencing `parseResult.warnings` and `:301` passing `args.sourceAnchors`.)

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run tests/drive/showDayTimeAnchors.test.ts tests/parser/operatorActionableWarnings.test.ts <phase2-test-file>`
Expected: PASS. Confirm the existing `CELL_ANCHORED_CODES ≡ OPERATOR_ACTIONABLE_ANCHORED` identity test stays green (same object).

- [ ] **Step 5: Commit**

```bash
git add lib/parser/dataGaps.ts lib/drive/showDayTimeAnchors.ts lib/sync/phase2.ts tests/drive/showDayTimeAnchors.test.ts tests/parser/operatorActionableWarnings.test.ts <phase2-test-file>
git commit --no-verify -m "feat(sync): deep-link AGENDA + PULL SHEET warnings to their tabs (incl. apply-only AGENDA_DAY_EMPTIED)"
```

---

## Task 4: Transport yearless dates — infer show year instead of hard-coding `/25`

**Files:**
- Modify: `lib/parser/blocks/_helpers.ts` (export relocated `inferShowYear`)
- Modify: `lib/parser/blocks/hotels.ts` (remove local `inferShowYear`, import from `_helpers`)
- Modify: `lib/parser/blocks/transport.ts` (`parseTransportation` + `parseV2DateTime`)
- Test: `tests/parser/blocks/transport.test.ts`, `tests/parser/blocks/hotels.test.ts` (regression)

**Interfaces:** `inferShowYear(markdown: string): string | null` (currently private `hotels.ts:570-575`, uses `normalizeDate`). `parseTransportation(markdown, …)` has `markdown` (`transport.ts:106`). `parseV2DateTime` currently `(raw) => …` with two `normalizeDate(... + "/25")` at `:570/:576`.

- [ ] **Step 1: Write the failing tests**

In `tests/parser/blocks/transport.test.ts`, add (derive the expected year from the fixture's DATES — do NOT hardcode an era):

```ts
it("yearless transport date infers the show year, not a hard-coded 2025", () => {
  const SHOW_YEAR = "2026"; // single source of truth for this fixture
  // A show whose DATES are in SHOW_YEAR, with a yearless transport date cell.
  const md = [
    `| DATES | 6/24/${SHOW_YEAR.slice(2)} - 6/26/${SHOW_YEAR.slice(2)} |`,
    "",
    "| TRANSPORTATION | | |",
    "| Equipment Transporter | Pickup | 10/6 @ 12:00 PM |",
  ].join("\n");
  const t = parseTransportation(md, "v2");
  // The stored pickup date's year must be the SHOW year, never 2025 (the old /25 bug).
  // Assert on the CONCRETE date field (parseV2DateTime.date flows into it — locate it from
  // the TransportationRow shape, e.g. t.pickupDate / t.transport[i].date), not on JSON.
  expect(<storedPickupDateField>).toMatch(new RegExp(`^${SHOW_YEAR}-`)); // ISO YYYY-MM-DD
  expect(<storedPickupDateField>).not.toContain("2025");
});

it("yearless transport date with no inferable show year → null (never a hard-coded era)", () => {
  const md = ["| TRANSPORTATION | | |", "| Equipment Transporter | Pickup | 10/6 @ 12:00 PM |"].join("\n");
  const t = parseTransportation(md, "v2");
  // No DATES → no contextYear → the date field is EXACTLY null (not a guessed 2025, and not
  // some other wrong value). Assert `=== null` on the concrete date field — a bare
  // `not.toContain("2025")` is too weak (it passes on any non-2025 garbage too).
  expect(<storedPickupDateField>).toBeNull();
});
```

(Match the test file's actual `parseTransportation` import + the column shape its other tests use. `<storedPickupDateField>` is a placeholder: locate the field on `TransportationRow` that `parseV2DateTime(...).date` flows into — read `transport.ts:346/436` and the row construction to find it (e.g. a pickup/dropoff date field), and assert on THAT field directly, not on `JSON.stringify`. Load-bearing assertions: the parsed date's year equals the show-DATES year `2026` AND is never `2025`; the un-inferable case is exactly `null`.)

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm vitest run tests/parser/blocks/transport.test.ts -t "year"`
Expected: FAIL — the date resolves to 2025 (the hard-coded `/25`).

- [ ] **Step 3: Implement**

In `lib/parser/blocks/_helpers.ts`, add the exported `inferShowYear` (move it verbatim from hotels.ts; it uses `normalizeDate`, already in this module):

```ts
/** Infer a 4-digit year from the first M/D/YY(YY) date in the sheet markdown, else null. */
export function inferShowYear(markdown: string): string | null {
  const m = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.exec(markdown);
  if (!m) return null;
  const iso = normalizeDate(m[0]);
  return iso ? iso.slice(0, 4) : null;
}
```

In `lib/parser/blocks/hotels.ts`, delete the local `inferShowYear` definition (`:570-575`) and import it: add `inferShowYear` to the existing `from "./_helpers"` import. (Behavior unchanged — pure relocation.)

In `lib/parser/blocks/transport.ts`:
1. Add `inferShowYear` to the `from "./_helpers"` import (`:30`).
2. In `parseTransportation`, derive once: `const contextYear = inferShowYear(markdown);`.
3. Thread it into both `parseV2DateTime(col1, contextYear)` call sites (`:346`, `:436`).
4. Rewrite `parseV2DateTime` to mirror hotels' `resolveDate` (year-present → as-is; yearless → cell-year else `contextYear`, else `null`):

```ts
function parseV2DateTime(
  raw: string,
  contextYear: string | null,
): { date: string | null; time: string | null } {
  if (!raw || /^TBD$/i.test(raw)) return { date: null, time: null };

  const resolveDate = (datePart: string): string | null => {
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(datePart)) return normalizeDate(datePart); // year present
    const cellYear = /\b(20\d\d)\b/.exec(raw);
    const year = cellYear ? cellYear[1] : contextYear;
    if (!year) return null; // never hard-code an era
    return normalizeDate(`${datePart}/${year}`);
  };

  const atIdx = raw.indexOf("@");
  if (atIdx >= 0) {
    const datePart = raw.slice(0, atIdx).trim();
    const timePart = raw.slice(atIdx + 1).trim();
    const time = /^TBD$/i.test(timePart) ? null : presence(timePart);
    return { date: resolveDate(datePart), time };
  }
  return { date: resolveDate(raw.trim()), time: null };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run tests/parser/blocks/transport.test.ts tests/parser/blocks/hotels.test.ts`
Expected: PASS — transport year tests pass; existing hotel date tests stay green (pure relocation).

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/_helpers.ts lib/parser/blocks/hotels.ts lib/parser/blocks/transport.ts tests/parser/blocks/transport.test.ts
git commit --no-verify -m "fix(parser): infer show year for yearless transport dates (drop hard-coded /25)"
```

---

## Task 5: Full verification

- [ ] **Step 1: Typecheck + lint + format**

```bash
pnpm typecheck && pnpm eslint lib tests && pnpm format:check
```
Expected: PASS. If `format:check` flags new files, `pnpm prettier --write` them and re-check. NEVER prettier the master spec (it's `.prettierignore`'d).

- [ ] **Step 2: The full test suite (the #155 lesson)**

```bash
pnpm vitest run
```
Expected: only the env-bound live-DB/HTTP suites fail locally (`tests/admin/test-auth-gate` Layer-2, `tests/cross-cutting/pg-cron-coverage`, `tests/cross-cutting/email-canonicalization` live audit) — confirm each failing file is one of those (they pass in real CI). Any OTHER failure is a regression to fix. Specifically confirm `tests/help/errors-grouping.test.tsx` is GREEN (no new prefix orphan).

- [ ] **Step 3: Confirm invariant-8 N/A**

```bash
git diff origin/main --stat -- 'components/**' 'app/**'
```
Expected: empty (no UI surface). If empty, impeccable dual-gate is N/A.

- [ ] **Step 4: Commit any verification fixes**, then proceed to whole-diff Codex review → CI → merge.

---

## Self-Review (checklist)

1. **Spec coverage:** Fix 1 → Task 1; Fix 2 → Task 2; Fix 3 → Task 3; Fix 4 → Task 4. All four covered.
2. **Placeholder scan:** every code step has real code; the only "adapt to existing test shape" notes are in test-file integration steps where the exact import/fixture must match the live file — the load-bearing assertions are stated concretely.
3. **Type consistency:** `OPERATOR_ACTIONABLE_ANCHORED` shape consistent (Tasks 1, 3); `KIND_TO_REGION: Record<string, RegionId>` (Task 3); `inferShowYear(markdown): string | null` consistent across `_helpers`/hotels/transport (Task 4); `parseV2DateTime(raw, contextYear)` consistent (Task 4); pin-test counts 5→6→14 consistent (Tasks 1, 3).
4. **Numeric sweep:** anchored set 5 (current) → 6 (Task 1) → 14 (Task 3); 8 codes in Fix 3 (5 AGENDA + 3 PULL); sorted 14-code array enumerated explicitly in Task 3.

## Adversarial review (cross-model)

After self-review, the WHOLE diff goes to Codex `adversarial-review` (reviewer-only). Iterate to APPROVE before merge.
