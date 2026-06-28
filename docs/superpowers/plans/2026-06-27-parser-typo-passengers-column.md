# v4 Transport {PASSENGERS} column typo-tolerance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the v4 transport **passenger column header** typo-tolerant — a misspelled `Passengers` header (e.g. `Pasengers`) recovers the column (so `assigned_names` still populate) and emits a `COLUMN_HEADER_AUTOCORRECTED` warning. This closes the last open gap in the parser typo-tolerance milestone, self-flagged as a P1-followup at `lib/parser/typoVocabRegistry.ts:45-47`.

**Architecture:** Thread the existing `agg` aggregator into `parseV4Transport` (the only un-`agg`'d transport sub-parser) and into its `detectPassengersColIdx` helper. Rewrite `detectPassengersColIdx` as **two separate passes**: Pass 1 = the existing exact `/^passengers?$/i` scan across **all** rows (unchanged, no warn); Pass 2 (only if Pass 1 found nothing) = a gated fuzzy scan restricted to the **header rows** — the main header (row 0) plus the DATE/TIME subheader (the row carrying bare `DATE`/`TIME` cells, where the `Passengers` column header sits) — that recovers a near-miss and emits the warn. **Data rows are excluded from the fuzzy pass** so a data value that happens to be Damerau-1 of `PASSENGERS` is never mistaken for the column header. Register a derived `passengerColumn` vocab so the collision tripwire guards it.

**Tech Stack:** TypeScript, vitest. Pure parser — no Drive/Sheets/fetch, no DB, no UI, no migration, no advisory-lock surface.

## Global Constraints

- **TDD per task.** Failing test → minimal implementation → passing test → commit. (AGENTS.md invariant 1.)
- **Commit per task**, conventional-commits `<type>(parser): <summary>`. (AGENTS.md invariant 6.)
- **No new error code.** Reuse `COLUMN_HEADER_AUTOCORRECTED`, which already exists in `lib/messages/catalog.ts:1091`, `lib/messages/__generated__/spec-codes.ts:221`, `lib/parser/dataGaps.ts:129`, and `lib/drive/showDayTimeAnchors.ts:139`, and is already used for column headers by `lib/parser/blocks/crew.ts:127`. **No §12.4 three-lockstep needed.**
- **Correct code per spec §114** (canonical): `COLUMN_HEADER_AUTOCORRECTED` is designated for "crew/passenger column header"; `FIELD_LABEL_AUTOCORRECTED` is for row-level field labels (v2 schedule labels, ops/venue/client). Use the column-header code here.
- **Exact-always-wins:** Pass 1 (exact) runs to completion across **all** rows before Pass 2 (fuzzy) runs at all — a later-row exact match must beat an earlier-row fuzzy near-miss.
- **Fuzzy pass is header-region-only:** Pass 2 scans only row 0 + the DATE/TIME subheader (rows with a bare `DATE`/`TIME` cell). Data rows are never fuzzy-scanned, so a data value Damerau-1 of `PASSENGERS` cannot false-recover the column.
- **Derived single-source registry:** the registry entry's `members` references the **same** exported `PASSENGERS_VOCAB` const the gate fuzzes (cannot drift).
- **`parseV4Transport` gains an optional `agg?` param only** — its public arity stays backward-compatible (all existing call sites without `agg` keep working; the warn just no-ops).

---

## File Structure

- `lib/parser/blocks/transport.ts` — **Modify.** (a) Add `export const PASSENGERS_VOCAB = ["PASSENGERS"] as const;` + `const PASSENGERS_GATE_OPTS = { minLen: 5, tieAbort: true } as const;` near `TRANSPORT_SCHEDULE_VOCAB` (~line 110). (b) Add `agg?: ParseAggregator` to `parseV4Transport` (line 153) and pass it at the dispatch (line 126) + into `detectPassengersColIdx` (line 202). (c) Rewrite `detectPassengersColIdx` (line 519) as two passes with the fuzzy warn.
- `lib/parser/typoVocabRegistry.ts` — **Modify.** Extend the transport import (line 3) with `PASSENGERS_VOCAB`; replace the deferral NOTE comment (lines 45-47) with the `passengerColumn` registry entry.
- `tests/parser/blocks/transport.test.ts` — **Modify.** Add a `CHA` helper + a `describe("…passenger column fuzzy recovery (PR-passengers)")` block (T1–T7, T9).
- `tests/parser/typoVocabCollision.test.ts` — **Modify.** Add a `passengerColumn` registration assertion (T8) mirroring the PR-D2 block.

---

### Task 1: Register the `passengerColumn` vocab (single-source + collision tripwire)

**Files:**
- Modify: `lib/parser/blocks/transport.ts` (vocab const), `lib/parser/typoVocabRegistry.ts` (entry)
- Test: `tests/parser/typoVocabCollision.test.ts`

**Interfaces:**
- Produces: `export const PASSENGERS_VOCAB: readonly ["PASSENGERS"]` from `transport.ts`. Registry gains `{ id: "passengerColumn", klass: "fuzzable", minLen: 5, members: PASSENGERS_VOCAB }`.

- [ ] **Step 1: Write the failing test (T8 — registration + collision)**

In `tests/parser/typoVocabCollision.test.ts`, import `PASSENGERS_VOCAB` from `@/lib/parser/blocks/transport` and add (mirroring the PR-D2 `transportScheduleLabel` block):

```ts
describe("passenger column vocab registration (PR-passengers)", () => {
  it("registers passengerColumn as a fuzzable, derived from PASSENGERS_VOCAB", () => {
    const entry = TYPO_VOCABS.find((v) => v.id === "passengerColumn");
    expect(entry).toBeDefined();
    expect(entry?.klass).toBe("fuzzable");
    expect(entry?.minLen).toBe(5);
    expect(entry?.members).toEqual([...PASSENGERS_VOCAB]);
  });
});
```

(The file's existing top-level collision test already asserts no fuzzable member sits within Damerau-1 of any other registered member; it will now also cover `PASSENGERS`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/parser/typoVocabCollision.test.ts -t "passenger column"`
Expected: FAIL — `PASSENGERS_VOCAB` is not exported / `passengerColumn` entry not found.

- [ ] **Step 3: Add the vocab const + registry entry**

In `lib/parser/blocks/transport.ts`, near `TRANSPORT_SCHEDULE_VOCAB` (~line 110):

```ts
/**
 * Fuzzable vocab for the v4 transport passenger column header. Single canonical
 * plural member: the exact regex /^passengers?$/i in detectPassengersColIdx already
 * recovers singular AND plural with no warn, so adding "PASSENGER" would only create a
 * within-vocab Damerau-1 tie (tieAbort would then reject mid-point typos) + trip the
 * collision tripwire. minLen:5 subsumes any short neighbor (DATE/DAY/ROOM), so no exclude.
 */
export const PASSENGERS_VOCAB = ["PASSENGERS"] as const;
const PASSENGERS_GATE_OPTS = { minLen: 5, tieAbort: true } as const;
```

In `lib/parser/typoVocabRegistry.ts`, extend the transport import (line 3):

```ts
import { TRANSPORT_SCHEDULE_VOCAB, PASSENGERS_VOCAB } from "@/lib/parser/blocks/transport";
```

…and replace the deferral NOTE comment (lines 45-47) with:

```ts
  // v4 transport passenger column header. detectPassengersColIdx's exact regex
  // /^passengers?$/i covers singular+plural; only the canonical plural is fuzzable.
  { id: "passengerColumn", klass: "fuzzable", minLen: 5, members: [...PASSENGERS_VOCAB] },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/parser/typoVocabCollision.test.ts`
Expected: PASS — the new registration test + the existing collision tripwire (PASSENGERS' nearest registered neighbor is PARKING at Damerau distance 6).

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/transport.ts lib/parser/typoVocabRegistry.ts tests/parser/typoVocabCollision.test.ts
git commit -m "feat(parser): register passengerColumn fuzzable vocab (v4 transport)"
```

---

### Task 2: Recover a misspelled passenger column header + warn

**Files:**
- Modify: `lib/parser/blocks/transport.ts` (agg threading + two-pass `detectPassengersColIdx`)
- Test: `tests/parser/blocks/transport.test.ts`

**Interfaces:**
- Consumes: `PASSENGERS_VOCAB`, `PASSENGERS_GATE_OPTS` (Task 1); `gatedVocabCorrect` (already imported, transport.ts:32); `ParseAggregator` (already imported, transport.ts:29).
- Produces: `parseV4Transport(markdown, crewMembers?, agg?)`; `detectPassengersColIdx(tableLines, agg?)` emits `COLUMN_HEADER_AUTOCORRECTED` on a fuzzy recovery.

- [ ] **Step 1: Write the failing tests (T1–T6, T9)**

In `tests/parser/blocks/transport.test.ts`, add a helper next to the existing `FLA` (line 402):

```ts
const CHA = (agg: ReturnType<typeof newAggregator>) =>
  agg.warnings.filter((w) => w.code === "COLUMN_HEADER_AUTOCORRECTED");
```

Then add this describe block. The fixture mirrors the existing synthetic v4 transport (header with EMAIL required + a DATE/TIME **subheader** row carrying the passengers marker):

```ts
describe("parseTransportation — v4 passenger column fuzzy recovery (PR-passengers)", () => {
  const v4 = (passengersCell: string) =>
    `| TRANSPORTATION/Equipment Transporter | TRANSPORTATION/Test Driver | PHONE/555-000-1234 | EMAIL/driver@example.com | LICENSE |
| :---: | :---: | :---: | :---: | :---: |
| Vehicle | Test Van | | | |
| | DATE | TIME | ${passengersCell} | |
| Pick Up Warehouse | 1/15/26 | 8:00 AM | Alice Smith | |
`;

  it("T1: misspelled 'Pasengers' in the subheader → column recovered + exactly one COLUMN_HEADER_AUTOCORRECTED warn", () => {
    const agg = newAggregator();
    const t = parseTransportation(v4("Pasengers"), "v4", undefined, agg);
    expect(t?.schedule[0]?.assigned_names).toEqual(["Alice Smith"]);
    const w = CHA(agg);
    expect(w.length).toBe(1);
    expect(w[0]?.rawSnippet).toBe("Pasengers");
    expect(w[0]?.blockRef?.kind).toBe("transportation");
  });

  it("T2: exact 'Passengers' → names populate, ZERO autocorrect warns", () => {
    const agg = newAggregator();
    const t = parseTransportation(v4("Passengers"), "v4", undefined, agg);
    expect(t?.schedule[0]?.assigned_names).toEqual(["Alice Smith"]);
    expect(CHA(agg).length).toBe(0);
  });

  it("T3: exact singular 'Passenger' → names populate via Pass 1, ZERO warns", () => {
    const agg = newAggregator();
    const t = parseTransportation(v4("Passenger"), "v4", undefined, agg);
    expect(t?.schedule[0]?.assigned_names).toEqual(["Alice Smith"]);
    expect(CHA(agg).length).toBe(0);
  });

  it("T6: below-minLen 'Pas' → no fuzzy recovery, no warn", () => {
    const agg = newAggregator();
    parseTransportation(v4("Pas"), "v4", undefined, agg);
    // 'Pas' (3 chars) < minLen 5 → not corrected. Pin ONLY the intended signal: no autocorrect
    // warn. (assigned_names is intentionally NOT asserted — when no passengers column is found,
    // extractAssignedNames falls back to a crew-context scan whose result isn't this test's concern.)
    expect(CHA(agg).length).toBe(0);
  });

  it("T10: data-row value 'Pasengers' with NO exact header → NOT recovered, no warn", () => {
    // Pass 2 is header-region-only, so a near-match sitting in a DATA row (not the header /
    // DATE-TIME subheader) must never be read as the passenger column header.
    const agg = newAggregator();
    const md =
      `| TRANSPORTATION/Equipment Transporter | TRANSPORTATION/Test Driver | PHONE/555-000-1234 | EMAIL/driver@example.com | LICENSE |
| :---: | :---: | :---: | :---: | :---: |
| | DATE | TIME | | |
| Pick Up Warehouse | 1/15/26 | 8:00 AM | Pasengers | |
`;
    parseTransportation(md, "v4", undefined, agg);
    expect(CHA(agg).length).toBe(0);
  });

  it("T9: DATE/TIME cells (< minLen) are not fuzzed; only 'Pasengers' fires the single warn", () => {
    const agg = newAggregator();
    parseTransportation(v4("Pasengers"), "v4", undefined, agg);
    const w = CHA(agg);
    expect(w.length).toBe(1);
    expect(w[0]?.rawSnippet).toBe("Pasengers");
  });
});

describe("parseTransportation — v4 passenger exact-always-wins (PR-passengers)", () => {
  it("T4: typo in an earlier row + exact 'Passengers' in a later row → exact column wins, ZERO warns", () => {
    const agg = newAggregator();
    const md =
      `| TRANSPORTATION/Equipment Transporter | TRANSPORTATION/Test Driver | PHONE/555-000-1234 | EMAIL/driver@example.com | Pasengers |
| :---: | :---: | :---: | :---: | :---: |
| | DATE | TIME | Passengers | |
| Pick Up Warehouse | 1/15/26 | 8:00 AM | | Alice Smith |
`;
    const t = parseTransportation(md, "v4", undefined, agg);
    // The exact 'Passengers' (col index 3, later row) wins; the typo in the header row is ignored.
    expect(t?.schedule[0]?.assigned_names).toEqual([]);
    expect(CHA(agg).length).toBe(0);
  });

  it("T5: data cells (names/dates/times), exact header → exactly the header column, ZERO fuzzy warns", () => {
    const agg = newAggregator();
    const md =
      `| TRANSPORTATION/Equipment Transporter | TRANSPORTATION/Test Driver | PHONE/555-000-1234 | EMAIL/driver@example.com | LICENSE |
| :---: | :---: | :---: | :---: | :---: |
| | DATE | TIME | Passengers | |
| Pick Up Warehouse | 1/15/26 | 8:00 AM | Alice Smith | |
`;
    const t = parseTransportation(md, "v4", undefined, agg);
    expect(t?.schedule[0]?.assigned_names).toEqual(["Alice Smith"]);
    expect(CHA(agg).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/parser/blocks/transport.test.ts -t "PR-passengers"`
Expected: FAIL — T1/T9 fail (no warn emitted yet; `parseV4Transport` ignores `agg` and the fuzzy pass doesn't exist). The no-warn assertions (T2/T3/T5/T6/T10) and T4 already pass pre-impl (nothing emits a warn yet); that's fine — they pin behavior that must be preserved. T10's load-bearingness is proven by Mutation B in Step 5, not by initial RED.

- [ ] **Step 3: Thread `agg` + implement the two-pass detector**

In `lib/parser/blocks/transport.ts`:

(a) Dispatch (line 126) — pass `agg`:

```ts
    parseV4Transport(markdown, crewMembers, agg) ??
```

(b) `parseV4Transport` signature (line 153):

```ts
function parseV4Transport(
  markdown: string,
  crewMembers?: CrewMemberRow[],
  agg?: ParseAggregator,
): TransportationRow | null {
```

(c) The `detectPassengersColIdx` call (line 202):

```ts
  const passengersColIdx = detectPassengersColIdx(tableLines, agg);
```

(d) Rewrite `detectPassengersColIdx` (line 519) as two separate full passes:

```ts
/** Detect which column index holds passenger names (if any). Exact-first across all rows;
 *  a misspelled header is recovered by a gated fuzzy pass (and warned) only if no exact
 *  spelling exists anywhere — so a later-row exact match always beats an earlier-row typo. */
function detectPassengersColIdx(tableLines: string[], agg?: ParseAggregator): number {
  // Pass 1 — exact (unchanged): covers singular AND plural, no warn. Must complete across
  // ALL rows before Pass 2 so exact-always-wins.
  for (const line of tableLines) {
    const cells = splitRow(line);
    for (let i = 0; i < cells.length; i++) {
      if (/^passengers?$/i.test(clean(cells[i] ?? ""))) return i;
    }
  }
  // Pass 2 — gated fuzzy, only reached when no exact spelling exists anywhere. Restricted to
  // HEADER rows: row 0 (main header) + the DATE/TIME subheader (located the same way
  // detectDateColIdx finds DATE) — where the Passengers column header sits. Data rows are
  // NOT scanned, so a data value Damerau-1 of PASSENGERS can't be mistaken for the header.
  // minLen:5 subsumes DATE/DAY/ROOM so no exclude is needed. First near-miss → warn once.
  const isHeaderRow = (line: string): boolean =>
    splitRow(line).some((c) => {
      const v = clean(c ?? "");
      return /^DATE$/i.test(v) || /^TIME$/i.test(v);
    });
  for (let r = 0; r < tableLines.length; r++) {
    if (r !== 0 && !isHeaderRow(tableLines[r] ?? "")) continue;
    const cells = splitRow(tableLines[r] ?? "");
    for (let i = 0; i < cells.length; i++) {
      const raw = clean(cells[i] ?? "");
      const fix = gatedVocabCorrect(raw.toUpperCase(), PASSENGERS_VOCAB, PASSENGERS_GATE_OPTS);
      if (fix?.corrected) {
        agg?.warnings.push({
          severity: "warn",
          code: "COLUMN_HEADER_AUTOCORRECTED",
          message: `Read likely-misspelled transport passenger column header '${raw}' as '${fix.match}'`,
          blockRef: { kind: "transportation" },
          rawSnippet: raw,
        });
        return i;
      }
    }
  }
  return -1;
}
```

Note: `gatedVocabCorrect` accepts `readonly string[]`; `PASSENGERS_VOCAB` (`readonly ["PASSENGERS"]`) satisfies it. If a type error arises, pass `[...PASSENGERS_VOCAB]`. `fix.match` is the gate's matched canonical member (`"PASSENGERS"`), mirroring `crew.ts`'s `'${c.corrected}'` rather than hardcoding the literal.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/parser/blocks/transport.test.ts`
Expected: PASS — all PR-passengers tests + every pre-existing transport test (the all-rows fuzzy pass only runs when no exact `passengers?` exists, so the existing exact fixture at `transport.test.ts:217` is unaffected).

- [ ] **Step 5: Negative-regression proof (T7 — the header-region scope is load-bearing in BOTH directions)**

Back up, then run TWO mutations proving the scope is neither too narrow nor too broad:

```bash
cp lib/parser/blocks/transport.ts /tmp/transport.ts.bak
```

**Mutation A — too narrow (row 0 only):** change Pass 2's row guard to skip every non-zero row, e.g. `if (r !== 0) continue;`. Re-run:

Run: `pnpm vitest run tests/parser/blocks/transport.test.ts -t "T1:"`
Expected: **FAIL** — the `Pasengers` marker lives in the DATE/TIME subheader, so row-0-only never recovers it (no warn). Proves the subheader must be included (the design-stress CRITICAL). Restore from backup.

**Mutation B — too broad (all rows):** change Pass 2's row guard to scan every row, e.g. replace the `if (r !== 0 && !isHeaderRow(...)) continue;` line with nothing (scan all). Re-run:

Run: `pnpm vitest run tests/parser/blocks/transport.test.ts -t "T10:"`
Expected: **FAIL** — the data-row `Pasengers` is now fuzzy-matched and emits a spurious warn. Proves data rows must be excluded (Codex plan-review Finding 1). Restore:

```bash
cp /tmp/transport.ts.bak lib/parser/blocks/transport.ts && rm -f /tmp/transport.ts.bak
```

Re-run `pnpm vitest run tests/parser/blocks/transport.test.ts` → back to PASS. (Verify each mutation actually applied by grepping the file before trusting the RED — a no-op edit yields a false GREEN.)

- [ ] **Step 6: Commit**

```bash
git add lib/parser/blocks/transport.ts tests/parser/blocks/transport.test.ts
git commit -m "feat(parser): recover a misspelled v4 transport passenger column header + warn"
```

---

### Task 3: Self-review

- [ ] No new error code: `rg "AUTOCORRECTED" lib/parser/blocks/transport.ts` shows only `COLUMN_HEADER_AUTOCORRECTED` (Pass 2) and the pre-existing `FIELD_LABEL_AUTOCORRECTED` (v2 schedule). No §12.4 / `gen:spec-codes` change.
- [ ] `parseV4Transport` arity backward-compatible (`agg?` optional); the no-`agg` call site in any other caller still type-checks.
- [ ] Exact path unchanged: Pass 1 is byte-identical to the old loop; Pass 2 only runs when Pass 1 returns nothing.
- [ ] Registry `members` derives from `PASSENGERS_VOCAB` (no drift); collision tripwire green.
- [ ] Run the full parser suite + typecheck: `pnpm vitest run tests/parser/ && pnpm tsc --noEmit` (expect green).

### Task 4: Adversarial review (cross-model)

- [ ] After self-review, run Codex `adversarial-review` on the whole diff (REVIEWER ONLY brief; distinct verdict marker; `< /dev/null`; background). Iterate to APPROVE. Preempt relitigation in the brief: (1) **fuzzy scope is header-region** (row 0 + the DATE/TIME subheader where the marker lives, `transport.test.ts:217`), NOT all-rows (would false-recover a data value) and NOT row-0-only (would be inert — the marker is in the subheader). T10 + Mutation B pin the data-row exclusion; T1 + Mutation A pin the subheader inclusion. (2) **`COLUMN_HEADER_AUTOCORRECTED` is the spec-correct code** (§114, `crew.ts:127`), not `FIELD_LABEL_AUTOCORRECTED`; it already exists in catalog/spec-codes/dataGaps/anchor-dispatch → no §12.4 lockstep. (3) **Pass 1 (exact) is all-rows and runs fully before Pass 2** → exact-always-wins.

### Task 5: Execution handoff

- [ ] Push, real CI green, `gh pr merge --merge`, fast-forward local `main`, verify `git rev-list --left-right --count main...origin/main` == `0  0`, clean up the worktree, update memory.

---

## Self-Review (plan author)

**Spec coverage:** Single behavior — recover a misspelled passenger column header + warn — covered by Task 1 (vocab/registry) + Task 2 (agg threading, two-pass detector, warn). ✅

**Placeholder scan:** No TBD/TODO; every code step shows concrete code. ✅

**Type consistency:** `PASSENGERS_VOCAB: readonly ["PASSENGERS"]` defined in Task 1, consumed in Task 2 (`gatedVocabCorrect(... PASSENGERS_VOCAB, PASSENGERS_GATE_OPTS)`) and the registry (`[...PASSENGERS_VOCAB]`); `agg?: ParseAggregator` threaded consistently (dispatch → `parseV4Transport` → `detectPassengersColIdx`). ✅

**Anti-tautology:** Task 2 Step 5 runs two mutations — row-0-only (T1 → RED, proves subheader inclusion) and all-rows (T10 → RED, proves data-row exclusion) — bracketing the header-region scope from both sides while exact controls stay GREEN. Expected values derive from the fixture (`Alice Smith`, `Pasengers`), not magic. ✅

**Concrete failure mode each test catches:** T1 — row-0-only scope misses the real subheader placement (no warn). T2/T3 — fuzzy mis-fires on a valid exact header. T4 — interleaved scan picks an early typo over a later exact (wrong column + spurious warn). T5 — fuzzy mis-detects a data cell when an exact header exists. T6 — short token over-corrected (minLen load-bearing). T8 — registry drift / Damerau-1 collision. T9 — DATE/DAY/ROOM not subsumed by minLen. T10 — all-rows scope false-recovers a data-row near-match (Codex Finding 1). ✅
