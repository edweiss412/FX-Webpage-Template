# SET cell-derived run-of-show labels (D-SET1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the hardcoded 2-entry SET-day run-of-show synthesis with a label-before-clock tokenizer so SET entries carry the operator's actual labels (e.g. `"Room Access"`) and support N entries.

**Architecture:** Strategy S3 (spec §4). A position-returning clock core (`extractClockTimeTokens`) that both `extractClockTimes` and a new `tokenizeSetSchedule` consume; both apply `decodeEntities(clean(...))` so clock values match `dates.loadIn`/`setupTime`. The SET cell is carried as a parse-transient `dates.setAgendaRaw`, consumed by `deriveScheduleBookends`, and stripped in `index.ts` before the persisted `ShowRow`. Parser-only.

**Tech Stack:** TypeScript, Vitest, the existing `lib/parser` block pipeline.

**Spec:** `docs/superpowers/specs/2026-06-27-set-cell-derived-labels-design.md` (APPROVED, Codex adversarial review 3 rounds).

## Global Constraints

- **TDD per task** (invariant 1): failing test → minimal impl → green → commit. Never impl before its test.
- **Commit per task** (invariant 6): `feat(parser):` / `refactor(parser):` / `test(parser):` / `docs:`. One task per commit; `--no-verify` (shared hooks contend with the main checkout).
- **`noUncheckedIndexedAccess` is ON** — indexed `runOfShow`/array access in tests needs `!` (e.g. `ros!["iso"]!.entries`, `e[0]!.title`).
- **Parser-only.** No file under `app/` (except none), `components/`, CSS, `supabase/`, `lib/messages/catalog.ts`, or generated artifacts. If a step would touch one, STOP — the spec is wrong.
- **Clock values come from `decodeEntities(clean(raw))`** — identical for `extractClockTimes` and `tokenizeSetSchedule` so SET entry `start` === `dates.loadIn`/`setupTime` (no `resolveKeyTimes` drift).
- **Colon-required** clock scanner only (`/\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?/`); never the permissive SHOW-DAY `CLOCK_RE`.
- **kind-absent** SET entries (no `AgendaEntry.kind:"set"`); **no new warning** (D11); **no `decodeRunOfShow` change**.

## Meta-test inventory

**None created or extended.** This change touches no Supabase call boundary (`tests/auth/_metaInfraContract.test.ts`), no `admin_alerts` catalog, no advisory lock (`tests/auth/advisoryLockRpcDeadlock.test.ts`), no tile sentinel (`tests/components/tiles/_metaSentinelHidingContract.test.ts`), and no inline email normalization (`tests/admin/no-inline-email-normalization.test.ts`). Parser-pure. **Advisory-lock topology: N/A** (no `pg_advisory*`). **Layout-dimensions / transition-audit tasks: N/A** (no UI / fixed-dimension parent / animated component states).

## Anti-tautology test rules (applied throughout)

- Integration assertions read the **parse result** (`parseSheet(...).runOfShow` / `.show.dates`), never a rendered container.
- Derive expectations from the **fixture cell text**, not hardcoded magic strings divorced from the fixture.
- Every test names the concrete failure mode it catches (see each task).

---

### Task 1: Position-returning clock core + decode in `extractClockTimes`

**Files:**
- Modify: `lib/parser/blocks/dates.ts:267-278` (`extractClockTimes`)
- Test: `tests/parser/blocks/dates.test.ts`

**Interfaces:**
- Produces: `extractClockTimeTokens(text: string): { clock: string; start: number; end: number }[]` (operates on the string **as given** — caller decodes+cleans). `extractClockTimes(raw: string): string[]` (now `decodeEntities(clean(raw))` then maps the core).

- [ ] **Step 1: Write the failing tests** (append to `dates.test.ts`)

**Import:** `dates.test.ts:3` already has `import { parseDates, extractClockTimes } from "@/lib/parser/blocks/dates";` — **extend that existing line** to add `extractClockTimeTokens` (do NOT add a second import of `extractClockTimes`, which would be a duplicate binding / compile error).

```ts
// dates.test.ts:3 becomes:
import { parseDates, extractClockTimes, extractClockTimeTokens } from "@/lib/parser/blocks/dates";

describe("extractClockTimeTokens — position core (D-SET1)", () => {
  it("returns clock + offsets indexing the given (decoded+cleaned) string", () => {
    const c = "Load In: 7:00 PM Room Access: 8:30 PM";
    const toks = extractClockTimeTokens(c);
    expect(toks.map((t) => t.clock)).toEqual(["7:00 PM", "8:30 PM"]);
    expect(c.slice(toks[0]!.start, toks[0]!.end)).toBe("7:00 PM");
    expect(c.slice(toks[1]!.start, toks[1]!.end)).toBe("8:30 PM");
  });
  it("extractClockTimes === extractClockTimeTokens(decoded+cleaned).map(clock)", () => {
    expect(extractClockTimes("Load In: 7:00 PM Room Access: 8:30 PM")).toEqual(["7:00 PM", "8:30 PM"]);
  });
  it("decodes an entity INSIDE a clock (R2 P1d): '7:00&#9;PM' → ['7:00 PM']", () => {
    expect(extractClockTimes("7:00&#9;PM")).toEqual(["7:00 PM"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/parser/blocks/dates.test.ts -t "position core"`
Expected: FAIL — `extractClockTimeTokens` is not exported; `"7:00&#9;PM"` currently → `["7:00"]`.

- [ ] **Step 3: Minimal implementation** (`dates.ts`)

Add `decodeEntities` to the existing `_helpers` import at `dates.ts:18`. Replace `extractClockTimes` (`:267-278`) with:

```ts
/** Clock tokens with offsets, over `text` as given (caller decodes+cleans). */
export function extractClockTimeTokens(text: string): { clock: string; start: number; end: number }[] {
  const re = /\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?/g;
  const out: { clock: string; start: number; end: number }[] = [];
  for (const m of text.matchAll(re)) {
    const raw = m[0]!; // `!`: a regex match always has [0] (noUncheckedIndexedAccess widens it to string|undefined)
    const idx = m.index!; // `!`: matchAll always sets .index (typed number|undefined)
    const clock = raw
      .replace(/\s+/g, " ")
      .replace(/([AaPp][Mm])$/, (s) => s.toUpperCase())
      .trim();
    out.push({ clock, start: idx, end: idx + raw.length });
  }
  return out;
}

/**
 * Extract ALL clock times (HH:MM with optional AM/PM) from a free-text TIME cell,
 * in document order. COLON-REQUIRED. Decodes &#10;/&#9; first so an entity inside
 * a clock ("7:00&#9;PM") tokenizes as "7:00 PM" (D-SET1 / R2 P1d) — behavior-
 * preserving for the corpus (entities only ever separate fields). §4.2.
 */
export function extractClockTimes(raw: string): string[] {
  const c = decodeEntities(clean(raw));
  if (!c) return [];
  return extractClockTimeTokens(c).map((t) => t.clock);
}
```

- [ ] **Step 4: Run to verify pass (incl. regression)**

Run: `pnpm vitest run tests/parser/blocks/dates.test.ts`
Expected: PASS — new tests green AND every existing assertion (`:305-481`, esp. `extractClockTimes` guards `:469-481` and `loadIn`/`setupTime` `:406-420`) still green (no entities in those fixtures → `decodeEntities` is identity).

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/dates.ts tests/parser/blocks/dates.test.ts
git commit --no-verify -m "refactor(parser): extractClockTimeTokens core + entity-decode in extractClockTimes"
```

---

### Task 2: `setAgendaRaw` lifecycle — capture (dates.ts) + strip (index.ts)

Capture and strip land **together** so `show.dates` is never polluted at a task boundary (no existing test deep-equals `show.dates`, verified; this keeps it that way).

**Files:**
- Modify: `lib/parser/types.ts:114-119` (`dates` shape)
- Modify: `lib/parser/blocks/dates.ts:54-61` (result init), `:208-216` (`travel_set`), `:218-224` (`set`)
- Modify: `lib/parser/index.ts:418` (strip before `ShowRow` literal)
- Test: `tests/parser/blocks/dates.test.ts`, `tests/parser/scheduleBookendsIntegration.test.ts`

**Interfaces:**
- Produces: `ShowRow["dates"].setAgendaRaw?: string | null` (parse-transient; present on the in-parser local, stripped before persistence).

- [ ] **Step 1: Write the failing tests**

In `dates.test.ts` — **add these `it(...)` blocks INSIDE the existing `describe("parseDates — loadIn capture (§9 test 4)", …)` block (`:305`) so they reuse its local `datesTable(rows: Array<[label, day, date, time]>)` helper (`:306-312`, which renders `| | ${label} | ${day} | ${date} | ${time} |` under a 5-col DATES header).** Do NOT define a new helper.
```ts
  it("captures the RAW SET TIME cell on setAgendaRaw (undecoded; field capture unchanged)", () => {
    const md = datesTable([["SET", "Tue", "3/23/26", "Load In: 7:00 PM Room Access: 8:30 PM"]]);
    const d = parseDates(md, "v4");
    expect(d.setAgendaRaw).toBe("Load In: 7:00 PM Room Access: 8:30 PM");
    expect(d.loadIn).toBe("7:00 PM");
    expect(d.setupTime).toBe("8:30 PM");
  });
  it("empty SET TIME cell → setAgendaRaw null", () => {
    const md = datesTable([["SET", "Tue", "3/23/26", ""]]);
    expect(parseDates(md, "v4").setAgendaRaw).toBeNull();
  });
  it("setAgendaRaw precedence: travel_set fills if unset, explicit SET overrides (§9.D)", () => {
    // mirror of the loadIn precedence test :353-360
    const md = datesTable([
      ["TRAVEL / SET", "Mon", "3/22/26", "Load In: 8:00 AM"],
      ["SET", "Tue", "3/23/26", "Load In: 10:30 AM Room Access: 11:00 AM"],
    ]);
    expect(parseDates(md, "v4").setAgendaRaw).toBe("Load In: 10:30 AM Room Access: 11:00 AM");
  });
  it("setAgendaRaw from a lone TRAVEL / SET row when no explicit SET row", () => {
    const md = datesTable([
      ["TRAVEL / SET", "Mon", "3/22/26", "Load In: 8:00 AM"],
      ["SHOW DAY 1", "Tue", "3/23/26", ""],
    ]);
    expect(parseDates(md, "v4").setAgendaRaw).toBe("Load In: 8:00 AM");
  });
```

In `scheduleBookendsIntegration.test.ts` (the strip guard — §9.F):
```ts
it("does NOT persist/project the parse-transient setAgendaRaw on show.dates", () => {
  const md = readFileSync("fixtures/shows/exporter-xlsx/redefining-fi.md", "utf8");
  const r = parseSheet(md, "fixtures/shows/exporter-xlsx/redefining-fi.md");
  expect("setAgendaRaw" in r.show.dates).toBe(false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/parser/blocks/dates.test.ts -t "setAgendaRaw" tests/parser/scheduleBookendsIntegration.test.ts -t "transient"`
Expected: FAIL — `setAgendaRaw` not on the type / not captured. (The strip guard will pass trivially until capture exists; after Step 3a it fails, after Step 3b it passes — see Step 3.)

- [ ] **Step 3: Minimal implementation**

3a. `types.ts` — after `setupTime?` (`:119`):
```ts
  // PARSE-TRANSIENT: raw SET-row TIME cell, populated by parseDates and consumed by
  // deriveScheduleBookends; STRIPPED in lib/parser/index.ts before the ShowRow is
  // composed — never persisted to public.shows.dates nor projected by getShowForViewer. D-SET1.
  setAgendaRaw?: string | null;
```
`dates.ts` result init (`:54-61`): add `setAgendaRaw: null,`.
`dates.ts` capture — in the `set` case (`:218-224`) and `travel_set` case (`:208-216`):
```ts
// set case (override):
const setCell = row[4] ?? "";
result.setAgendaRaw = clean(setCell) ? setCell : null;
// travel_set case (fill-if-unset):
if (result.setAgendaRaw == null) {
  const tsCell = row[4] ?? "";
  result.setAgendaRaw = clean(tsCell) ? tsCell : null;
}
```
(At this point `show.dates` carries `setAgendaRaw` → the strip guard FAILS. Proceed to 3b.)

3b. `index.ts` — immediately before `const show: ShowRow = {` (`:418`):
```ts
// setAgendaRaw is parse-transient (consumed by deriveScheduleBookends below); never persist/project it.
const datesForShow: ShowRow["dates"] = { ...dates };
delete datesForShow.setAgendaRaw;
```
Use `datesForShow` at `:424` (`dates: datesForShow,`) and `:425` (`schedule_phases: deriveSchedulePhases(datesForShow),`). Leave `deriveScheduleBookends(mergedRunOfShow, dates, …)` at `:460-466` using the **full** `dates`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run tests/parser/blocks/dates.test.ts tests/parser/scheduleBookendsIntegration.test.ts`
Expected: PASS — capture + strip-guard green; no existing dates/parseSheet test broken.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/types.ts lib/parser/blocks/dates.ts lib/parser/index.ts tests/parser/blocks/dates.test.ts tests/parser/scheduleBookendsIntegration.test.ts
git commit --no-verify -m "feat(parser): capture+strip parse-transient setAgendaRaw on dates"
```

---

### Task 3: `tokenizeSetSchedule` + `labelBefore` (mode detection, separators)

**Files:**
- Modify: `lib/parser/blocks/scheduleBookends.ts` (add exports + imports)
- Test: `tests/parser/blocks/scheduleBookends.test.ts`

**Interfaces:**
- Consumes: `extractClockTimeTokens` (Task 1), `clean`/`decodeEntities` (`_helpers`), `shouldHideGenericOptional` (`@/lib/visibility/emptyState`).
- Produces: `tokenizeSetSchedule(raw: string | null): { label: string | null; clock: string }[]`.

- [ ] **Step 1: Write the failing tests** (append to `scheduleBookends.test.ts`)

```ts
import { tokenizeSetSchedule } from "@/lib/parser/blocks/scheduleBookends";

describe("tokenizeSetSchedule (D-SET1)", () => {
  it("label-before 2-time → derived labels", () => {
    expect(tokenizeSetSchedule("Load In: 7:00 PM Room Access: 8:30 PM")).toEqual([
      { label: "Load In", clock: "7:00 PM" },
      { label: "Room Access", clock: "8:30 PM" },
    ]);
  });
  it("label-before N=3", () => {
    expect(tokenizeSetSchedule("Load In: 8:00 AM Rehearsal: 1:00 PM Doors: 5:00 PM")).toEqual([
      { label: "Load In", clock: "8:00 AM" },
      { label: "Rehearsal", clock: "1:00 PM" },
      { label: "Doors", clock: "5:00 PM" },
    ]);
  });
  it("mode: trailing labels (time-first) → [] (R9-R14 pin)", () => {
    expect(tokenizeSetSchedule("9:00PM - LOAD IN 10:00PM - SETUP")).toEqual([]);
    expect(tokenizeSetSchedule("8:00 AM LOAD IN As per Alyssa email 4/29")).toEqual([]);
    expect(tokenizeSetSchedule("11:00 AM LOAD IN")).toEqual([]);
  });
  it("mode: leading provenance (non-colon lead) → [] (R1 P1b pin)", () => {
    expect(tokenizeSetSchedule("As per Alyssa email 4/29 8:00 AM LOAD IN")).toEqual([]);
  });
  it("separator strip (R1 P2a): '/' before a label", () => {
    expect(tokenizeSetSchedule("Load In: 7:00 PM / Room Access: 8:30 PM")).toEqual([
      { label: "Load In", clock: "7:00 PM" },
      { label: "Room Access", clock: "8:30 PM" },
    ]);
  });
  it("entity inside a clock (R2 P1d)", () => {
    expect(tokenizeSetSchedule("Load In: 7:00&#9;PM Room Access: 8:30 PM")).toEqual([
      { label: "Load In", clock: "7:00 PM" },
      { label: "Room Access", clock: "8:30 PM" },
    ]);
  });
  it("entity in a label (§9.B): 'Room Access:&#10;8:30 PM' → label 'Room Access'", () => {
    expect(tokenizeSetSchedule("Load In: 7:00 PM Room Access:&#10;8:30 PM")).toEqual([
      { label: "Load In", clock: "7:00 PM" },
      { label: "Room Access", clock: "8:30 PM" },
    ]);
  });
  it("degradation: empty / no-clock / null → []", () => {
    expect(tokenizeSetSchedule("")).toEqual([]);
    expect(tokenizeSetSchedule("AFTER 8PM")).toEqual([]);
    expect(tokenizeSetSchedule(null)).toEqual([]);
  });
  it("unlabeled tail in label-before mode → position default null", () => {
    expect(tokenizeSetSchedule("Setup: 7:00 PM 8:30 PM")).toEqual([
      { label: "Setup", clock: "7:00 PM" },
      { label: null, clock: "8:30 PM" },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/parser/blocks/scheduleBookends.test.ts -t "tokenizeSetSchedule"`
Expected: FAIL — `tokenizeSetSchedule` not exported.

- [ ] **Step 3: Minimal implementation** (`scheduleBookends.ts`)

Extend imports: `import { presence, normalizeDate, clean, decodeEntities } from "./_helpers";`, `import { extractClockTimeTokens } from "./dates";`, `import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";`. Add:

```ts
function labelBefore(cell: string, from: number, to: number): string {
  const slice = cell
    .slice(from, to)
    .replace(/^\s*[-–:/,;]?\s*/, "")
    .replace(/\s*[-–:/,;]?\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return shouldHideGenericOptional(slice) ? "" : slice;
}

/** Label-before-clock tokenizer for the SET TIME cell. [] in time-first / no-colon modes. §4.3 */
export function tokenizeSetSchedule(raw: string | null): { label: string | null; clock: string }[] {
  const c = decodeEntities(clean(raw ?? ""));
  if (!c) return [];
  const toks = extractClockTimeTokens(c);
  if (toks.length === 0) return [];
  const lead = c.slice(0, toks[0]!.start);
  if (!/:\s*$/.test(lead)) return []; // not label-before → caller falls through
  return toks.map((t, i) => {
    const prevEnd = i === 0 ? 0 : toks[i - 1]!.end;
    const label = labelBefore(c, prevEnd, t.start);
    return { label: label || null, clock: t.clock };
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run tests/parser/blocks/scheduleBookends.test.ts`
Expected: PASS — all tokenizer cases + existing strike/load-out/SET tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/scheduleBookends.ts tests/parser/blocks/scheduleBookends.test.ts
git commit --no-verify -m "feat(parser): tokenizeSetSchedule label-before-clock tokenizer"
```

---

### Task 4: Rewrite `deriveScheduleBookends` SET branch + integration

**Files:**
- Modify: `lib/parser/blocks/scheduleBookends.ts:100-106` (SET branch)
- Test: `tests/parser/blocks/scheduleBookends.test.ts`, `tests/parser/scheduleBookendsIntegration.test.ts`

- [ ] **Step 1: Write the failing tests**

In `scheduleBookends.test.ts` (the `dates(o)` helper accepts `Partial<ShowRow["dates"]>`, which now includes `setAgendaRaw`):
```ts
describe("deriveScheduleBookends — SET cell-derived labels (D-SET1)", () => {
  it("label-before cell → derived 'Room Access' entry (not generic 'Setup')", () => {
    const d = dates({ set: "2025-05-12", loadIn: "7:00 PM", setupTime: "8:30 PM",
      setAgendaRaw: "Load In: 7:00 PM Room Access: 8:30 PM" });
    const { runOfShow } = deriveScheduleBookends(undefined, d, null, [], "2025");
    expect(runOfShow!["2025-05-12"]!.entries).toEqual([
      { start: "7:00 PM", title: "Load In" },
      { start: "8:30 PM", title: "Room Access" },
    ]);
  });
  it("time-first cell → fall-through to loadIn/setupTime (generic)", () => {
    const d = dates({ set: "2025-05-12", loadIn: "11:00 AM", setAgendaRaw: "11:00 AM LOAD IN" });
    const { runOfShow } = deriveScheduleBookends(undefined, d, null, [], "2025");
    expect(runOfShow!["2025-05-12"]!.entries).toEqual([{ start: "11:00 AM", title: "Load In" }]);
  });
  it("null setAgendaRaw → today's loadIn/setupTime synthesis verbatim", () => {
    const d = dates({ set: "2025-05-12", loadIn: "7:00 PM", setupTime: "8:30 PM", setAgendaRaw: null });
    const { runOfShow } = deriveScheduleBookends(undefined, d, null, [], "2025");
    expect(runOfShow!["2025-05-12"]!.entries).toEqual([
      { start: "7:00 PM", title: "Load In" },
      { start: "8:30 PM", title: "Setup" },
    ]);
  });
  it("append-not-overwrite: keeps a pre-existing grid day", () => {
    const d = dates({ set: "2025-05-12", setAgendaRaw: "Load In: 7:00 PM Room Access: 8:30 PM" });
    const grid = { "2025-05-12": { entries: [{ start: "9:00 AM", title: "Keynote" }], showStart: "9:00 AM", window: null } };
    const { runOfShow } = deriveScheduleBookends(grid, d, null, [], "2025");
    expect(runOfShow!["2025-05-12"]!.entries.map((e) => e.title)).toEqual(["Keynote", "Load In", "Room Access"]);
  });
  it("no-drift + correct label for entity-in-clock (R2 P1d)", () => {
    const d = dates({ set: "2025-05-12", loadIn: "7:00 PM",
      setAgendaRaw: "Load In: 7:00&#9;PM Room Access: 8:30 PM" });
    const { runOfShow } = deriveScheduleBookends(undefined, d, null, [], "2025");
    const e = runOfShow!["2025-05-12"]!.entries;
    expect(e[0]!.start).toBe(d.loadIn);          // "7:00 PM" both sides — no resolveKeyTimes drift
    expect(e[1]!.title).toBe("Room Access");      // not "PM Room Access"
  });
});
```

In `scheduleBookendsIntegration.test.ts` (§9.E):
```ts
it("RFI/PCF SET cell → run-of-show shows 'Room Access', not 'Setup'", () => {
  const md = readFileSync("fixtures/shows/exporter-xlsx/redefining-fi.md", "utf8");
  const r = parseSheet(md, "fixtures/shows/exporter-xlsx/redefining-fi.md");
  const setEntries = r.runOfShow![r.show.dates.set!]!.entries.map((e) => e.title);
  expect(setEntries).toContain("Room Access");
  expect(setEntries).not.toContain("Setup");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/parser/blocks/scheduleBookends.test.ts -t "cell-derived" tests/parser/scheduleBookendsIntegration.test.ts -t "Room Access"`
Expected: FAIL — current SET branch ignores `setAgendaRaw`, emits generic `"Setup"`.

- [ ] **Step 3: Minimal implementation** — replace the SET block (`scheduleBookends.ts:100-106`):

```ts
  // ── SET load-in / setup (tokenized cell-derived labels; else dates fall-through; kind absent) ──
  if (dates.set) {
    const tokens = tokenizeSetSchedule(dates.setAgendaRaw ?? null);
    if (tokens.length > 0) {
      tokens.forEach((t, i) => {
        const title = t.label ?? (i === 0 ? "Load In" : i === 1 ? "Setup" : null);
        if (title == null) return; // 3rd+ unlabeled clock → skip (matches today's ≤2 cap)
        appendEntry(ros, dates.set!, { start: t.clock, title });
      });
    } else {
      if (presence(dates.loadIn ?? "")) appendEntry(ros, dates.set, { start: dates.loadIn!, title: "Load In" });
      if (presence(dates.setupTime ?? "")) appendEntry(ros, dates.set, { start: dates.setupTime!, title: "Setup" });
    }
  }
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm vitest run tests/parser/blocks/scheduleBookends.test.ts tests/parser/scheduleBookendsIntegration.test.ts`
Expected: PASS — new SET-branch + integration green; existing strike/load-out/SET fall-through tests green.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/blocks/scheduleBookends.ts tests/parser/blocks/scheduleBookends.test.ts tests/parser/scheduleBookendsIntegration.test.ts
git commit --no-verify -m "feat(parser): SET run-of-show uses cell-derived labels via tokenizer"
```

---

### Task 5: Resolve `DEFERRED.md` D-SET1 (docs — NOT a TDD task)

**TDD-exempt:** this is a documentation edit with no behavioral surface, so invariant 1's red→green cycle does not apply (it governs *code* tasks). Verification is the grep in Step 2 + the Task 6 gate.

**Files:**
- Modify: `DEFERRED.md` (D-SET1 entry, ~`:167-171`)

- [ ] **Step 1: Edit** — check how prior resolved entries are handled in `DEFERRED.md` (grep for `✅`/`SHIPPED`/`RESOLVED`); follow that convention. Mark D-SET1 as shipped with a one-line pointer to this plan + spec (and the PR once opened). Do not delete the heading if the repo keeps a resolved-log; otherwise follow the established pattern.

- [ ] **Step 2: Verify + commit**

```bash
grep -n "D-SET1" DEFERRED.md   # confirm it now reads as resolved, not open
git add DEFERRED.md
git commit --no-verify -m "docs: resolve DEFERRED D-SET1 (SET cell-derived run-of-show labels shipped)"
```

---

### Task 6: Full verification gate

- [ ] `pnpm vitest run tests/parser` — all parser tests green.
- [ ] `npx tsc --noEmit` — 0 errors (watch `noUncheckedIndexedAccess`).
- [ ] `npx eslint lib/parser/blocks/dates.ts lib/parser/blocks/scheduleBookends.ts lib/parser/index.ts tests/parser/blocks/dates.test.ts tests/parser/blocks/scheduleBookends.test.ts tests/parser/scheduleBookendsIntegration.test.ts` — 0 errors.
- [ ] `pnpm format:check` — clean (run `prettier --write` on touched files first; the `--no-verify` commits skip the hook, so format pre-emptively before push — this is the exact class that failed CI on the prior PR).
- [ ] Confirm the diff touches only: `lib/parser/types.ts`, `lib/parser/blocks/dates.ts`, `lib/parser/blocks/scheduleBookends.ts`, `lib/parser/index.ts`, the three test files, `DEFERRED.md`, and the spec/plan docs. **No `app/`/`components/`/CSS/`supabase/`/catalog/generated files.**

---

## Self-review

1. **Spec coverage:** §4.1→T2, §4.2→T1, §4.3→T3, §4.5→T4, §5 (no UI)→T6 confirm, §6 guards→T3/T4, §7 lifecycle→T2, §9.A→T1, §9.B→T3, §9.C→T4, §9.D→T2, §9.E→T4, §9.F→T2, §11 surface→T1-T5. DEFERRED→T5. All covered.
2. **Placeholder scan:** none — every step has concrete code/commands.
3. **Type consistency:** `extractClockTimeTokens`/`tokenizeSetSchedule`/`labelBefore` signatures match across T1/T3/T4; `setAgendaRaw?: string | null` consistent T2↔T3↔T4.

## Adversarial review (cross-model)

After self-review, run Codex `adversarial-review` on this plan; iterate to APPROVE (no round budget). Reviewer is REVIEWER ONLY. Apply the response ladder (class-sweep each finding; structural defense after 3+ same-vector rounds).

## Execution handoff

Inline execution (`superpowers:executing-plans`) — small, cohesive, single-author parser change. TDD per task, commit per task, `--no-verify`, then the Task 6 gate before push.
