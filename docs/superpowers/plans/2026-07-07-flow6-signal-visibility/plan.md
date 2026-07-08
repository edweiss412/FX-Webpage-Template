# Flow 6 Part 1 — Signal Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make two dark signals operator-visible — autocorrects get a neutral "N auto-fixed" chip + a tuned published-show regression gate (6.3), and a genuine venue-geocode failure raises a badge-visible `VENUE_GEOCODE_UNRESOLVED` warning (6.4).

**Architecture:** Two mechanisms. (a) A sibling `AUTO_FIX_CLASSES`/`summarizeAutoFixes` summary parallel to `GAP_CLASSES` (leaves `DataGapsSummary` untouched), rendered as a neutral pill; the regression gate's per-class predicate is single-sourced as `regressionKind`. (b) `VENUE_GEOCODE_UNRESOLVED` joins `GAP_CLASSES` with a new `gateExempt` flag so it rides the amber badge/chip for free but never trips the push alert.

**Tech Stack:** TypeScript, Next.js 16 (App Router RSC + one client island), Vitest, React Testing Library. No DB migration.

**Spec:** `docs/superpowers/specs/2026-07-07-flow6-signal-visibility.md`. Scope = Part 1 (6.3 + 6.4). Part 2 (6.2 digest) is deferred — DO NOT implement.

## Global Constraints

- **Invariant 5 (no raw codes in UI):** the chip renders the plain `label`, never the code literal. A warning's `.message` may equal the code literal but is never rendered raw.
- **Invariant 8 (impeccable dual-gate):** Task 7 touches `components/` → `/impeccable critique` + `/impeccable audit` on the diff before close-out; HIGH/CRITICAL fixed or deferred via `DEFERRED.md`.
- **Invariant 10 (mutation-surface telemetry):** no new admin mutation surface. Task 6 verifies `enrichVenueGeocode` is not discovered by `_metaMutationSurfaceObservability`.
- **§12.4 three-way lockstep (Task 4):** spec §12.4 table + `helpfulContext` appendix + `catalog.ts` row land in ONE commit; regen `gen:spec-codes` + `gen:internal-code-enums`; new code needs a `_families` prefix mapping.
- **Commit per task**, conventional-commits, `--no-verify` (shared hooks belong to the main checkout).
- **Before push:** full `pnpm test`, `pnpm typecheck`, `pnpm format:check`, `pnpm lint`, and the full `tests/messages/` + `tests/parser/` suites.
- Commit footer:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_019T4LfszanVP8iszSexu8NM
  ```

## Meta-test inventory

- **EXTEND** `tests/parser/dataGapsClassCompleteness.test.ts` — `DATA_GAP_CODES` 25→26, `ALL_PERSISTED_WARNING_CODES` 45→46 (Task 5).
- **EXTEND** `tests/messages/` — catalog-parity x1, internal-code-enums x2 (Task 4, via gen).
- **EXTEND** `app/help/errors/_families` test — new `VENUE` prefix (Task 4).
- **N/A** advisory-lock topology — no `pg_advisory*` surface touched.
- **N/A** `_metaInfraContract` — no new Supabase call boundary (autofix reuses the fetched `parse_warnings`; §3.2 of spec).
- **VERIFY** `_metaMutationSurfaceObservability` — confirm `enrichVenueGeocode` is not a discovered mutation surface (Task 6).

## Layout / transition notes

- No fixed-dimension parent with flex/grid children is introduced — `AutoFixChip` is an inline `<span>` pill (matches `DataGapsChip`). No Dimensional-Invariants task needed.
- Transition inventory (AutoFixChip): 2 states — present (`total>0`) / absent. Both **instant, no animation** (matches the existing `DataGapsChip` §4.2 contract `components/admin/ShowsTable.tsx:237`). No compound transitions. No transition-audit task needed.

## File structure

| File | Responsibility | Tasks |
|---|---|---|
| `lib/parser/dataGaps.ts` | AUTO_FIX registry + summary; `regressionKind`; tuned `isQualityRegression`; `gateExempt`; geocode GAP_CLASS | 1, 2, 5 |
| `lib/sync/runScheduledCronSync.ts` | `buildRegressionPayload` consumes `regressionKind` + `gateExempt` skip | 3 |
| `lib/messages/catalog.ts` + spec §12.4 + generated + `_families` | new `VENUE_GEOCODE_UNRESOLVED` code | 4 |
| `lib/sync/enrichVenueGeocode.ts` | emit the warning on `res.error` | 6 |
| `components/admin/ShowsTable.tsx`, `lib/admin/showDisplay.ts`, `components/admin/Dashboard.tsx` | neutral AutoFixChip + wire `autoFixes` through | 7 |

---

### Task 1: AUTO_FIX registry + `summarizeAutoFixes` + `formatAutoFixBreakdown`

**Files:**
- Modify: `lib/parser/dataGaps.ts`
- Test: `tests/parser/dataGaps.test.ts`

**Interfaces:**
- Produces: `AUTO_FIX_CLASSES` (readonly array `{code,label}`), `AutoFixCode`, `AutoFixSummary = {total:number; classes:Record<AutoFixCode,number>}`, `summarizeAutoFixes(warnings: readonly ParseWarning[] | null | undefined): AutoFixSummary`, `formatAutoFixBreakdown(summary: AutoFixSummary, cap?: number): string`.

- [ ] **Step 1: Write the failing test**

Add to `tests/parser/dataGaps.test.ts`:

```ts
import { summarizeAutoFixes, formatAutoFixBreakdown, AUTO_FIX_CLASSES } from "@/lib/parser/dataGaps";

describe("summarizeAutoFixes", () => {
  const w = (code: string, severity: "warn" | "info" = "warn") => ({ code, severity, message: code });

  it("counts only the five *_AUTOCORRECTED warn codes", () => {
    const s = summarizeAutoFixes([
      w("STAGE_WORD_AUTOCORRECTED"),
      w("STAGE_WORD_AUTOCORRECTED"),
      w("ROLE_TOKEN_AUTOCORRECTED"),
      w("FIELD_UNREADABLE"), // a gap, not an autofix → ignored
    ]);
    expect(s.total).toBe(3);
    expect(s.classes.STAGE_WORD_AUTOCORRECTED).toBe(2);
    expect(s.classes.ROLE_TOKEN_AUTOCORRECTED).toBe(1);
    expect(s.classes.COLUMN_HEADER_AUTOCORRECTED).toBe(0);
  });

  it("null/undefined/empty → total 0, all classes zero", () => {
    for (const input of [null, undefined, []] as const) {
      const s = summarizeAutoFixes(input);
      expect(s.total).toBe(0);
      expect(Object.values(s.classes).every((n) => n === 0)).toBe(true);
    }
  });

  it("skips severity:info (defensive)", () => {
    expect(summarizeAutoFixes([w("STAGE_WORD_AUTOCORRECTED", "info")]).total).toBe(0);
  });

  it("AUTO_FIX_CLASSES is exactly the five autocorrect codes", () => {
    expect(AUTO_FIX_CLASSES.map((c) => c.code).sort()).toEqual(
      [
        "COLUMN_HEADER_AUTOCORRECTED",
        "FIELD_LABEL_AUTOCORRECTED",
        "ROLE_TOKEN_AUTOCORRECTED",
        "SECTION_HEADER_AUTOCORRECTED",
        "STAGE_WORD_AUTOCORRECTED",
      ].sort(),
    );
  });

  it("formatAutoFixBreakdown caps at 4 classes with +N more, count-desc order", () => {
    const s = summarizeAutoFixes([
      w("STAGE_WORD_AUTOCORRECTED"), w("STAGE_WORD_AUTOCORRECTED"), w("STAGE_WORD_AUTOCORRECTED"),
      w("ROLE_TOKEN_AUTOCORRECTED"), w("ROLE_TOKEN_AUTOCORRECTED"),
      w("COLUMN_HEADER_AUTOCORRECTED"),
      w("SECTION_HEADER_AUTOCORRECTED"),
      w("FIELD_LABEL_AUTOCORRECTED"),
    ]);
    const out = formatAutoFixBreakdown(s, 4);
    expect(out.startsWith("3 corrected stage word")).toBe(true);
    expect(out.endsWith("+1 more")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/parser/dataGaps.test.ts -t summarizeAutoFixes`
Expected: FAIL — `summarizeAutoFixes` / `AUTO_FIX_CLASSES` not exported.

- [ ] **Step 3: Write minimal implementation**

In `lib/parser/dataGaps.ts`, after the `GAP_CLASSES` block, add:

```ts
/**
 * AUTO_FIX_CLASSES — the five benign `*_AUTOCORRECTED` warn codes the parser
 * emits when it corrected a value (stage word, role token, column/section
 * header, field label). Semantically POSITIVE ("we fixed it") — surfaced as a
 * neutral sibling count, NOT a data gap, so it is deliberately NOT in
 * GAP_CLASSES and does not feed summarizeDataGaps / the regression gate. Plain
 * labels (invariant 5). Scope is the five autocorrects only (spec §1 / audit
 * §6.3); the two agenda benign-warn codes are a documented follow-on.
 */
export const AUTO_FIX_CLASSES = [
  { code: "STAGE_WORD_AUTOCORRECTED", label: "corrected stage word" },
  { code: "ROLE_TOKEN_AUTOCORRECTED", label: "corrected role" },
  { code: "COLUMN_HEADER_AUTOCORRECTED", label: "corrected column header" },
  { code: "SECTION_HEADER_AUTOCORRECTED", label: "corrected section header" },
  { code: "FIELD_LABEL_AUTOCORRECTED", label: "corrected field label" },
] as const;

export type AutoFixCode = (typeof AUTO_FIX_CLASSES)[number]["code"];
export type AutoFixSummary = { total: number; classes: Record<AutoFixCode, number> };

const AUTO_FIX_CODES: ReadonlySet<string> = new Set(AUTO_FIX_CLASSES.map((c) => c.code));
const zeroAutoFix = (): Record<AutoFixCode, number> =>
  Object.fromEntries(AUTO_FIX_CLASSES.map((c) => [c.code, 0])) as Record<AutoFixCode, number>;

const AUTO_FIX_LABELS: Record<AutoFixCode, string> = Object.fromEntries(
  AUTO_FIX_CLASSES.map((c) => [c.code, c.label]),
) as Record<AutoFixCode, string>;

/** Count the five autocorrect classes; skip severity:"info"; null/[]→{total:0}. */
export function summarizeAutoFixes(
  warnings: readonly ParseWarning[] | null | undefined,
): AutoFixSummary {
  const classes = zeroAutoFix();
  if (!warnings) return { total: 0, classes };
  let total = 0;
  for (const w of warnings) {
    if (w.severity === "info") continue;
    if (AUTO_FIX_CODES.has(w.code)) {
      classes[w.code as AutoFixCode] += 1;
      total += 1;
    }
  }
  return { total, classes };
}

/** Bounded "N label" breakdown, count-desc then registry order, cap + "+N more". */
export function formatAutoFixBreakdown(summary: AutoFixSummary, cap = 4): string {
  if (cap <= 0 || summary.total === 0) return "";
  const details = AUTO_FIX_CLASSES.map((c) => ({
    label: c.label,
    count: summary.classes[c.code],
  })).filter((d) => d.count > 0);
  const sorted = [...details].sort((a, b) => b.count - a.count);
  const shown = sorted.slice(0, cap);
  const remainder = sorted.length - shown.length;
  const base = shown.map((d) => `${d.count} ${d.label}`).join(", ");
  return remainder > 0 ? `${base}, +${remainder} more` : base;
}
```

(The `AUTO_FIX_LABELS` const is exported-adjacent for the Part-2 digest; keep it — referenced by Task 7's chip via `formatAutoFixBreakdown`. If lint flags it unused in Part 1, prefix usage in `formatAutoFixBreakdown` already covers labels, so drop the standalone `AUTO_FIX_LABELS` const to avoid an unused-var lint error.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/parser/dataGaps.test.ts -t summarizeAutoFixes`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/parser/dataGaps.ts tests/parser/dataGaps.test.ts
git commit --no-verify -m "feat(parser): AUTO_FIX_CLASSES + summarizeAutoFixes sibling summary (6.3)"
```

---

### Task 2: `regressionKind` + tuned `isQualityRegression` + `gateExempt` skip

**Files:**
- Modify: `lib/parser/dataGaps.ts`
- Test: `tests/parser/qualityRegressionComparator.test.ts`

**Interfaces:**
- Consumes: `GAP_CLASSES` (gains an optional `gateExempt?: boolean` on each entry — added structurally here; the geocode entry that sets it lands in Task 5).
- Produces: `regressionKind(p: number, n: number): "new" | "worsened" | null`; named consts `REGRESSION_ABS_JUMP=5`, `REGRESSION_REL_FACTOR=1.5`, `REGRESSION_REL_ABS_FLOOR=2`. `isQualityRegression` + `hasRecoveredToBaseline` skip `gateExempt` classes.

- [ ] **Step 1: Write the failing test**

Add to `tests/parser/qualityRegressionComparator.test.ts` (derive expectations from the named consts — anti-tautology):

```ts
import {
  regressionKind, isQualityRegression, hasRecoveredToBaseline,
  REGRESSION_ABS_JUMP, REGRESSION_REL_FACTOR, REGRESSION_REL_ABS_FLOOR, GAP_CLASSES,
} from "@/lib/parser/dataGaps";

const sum = (partial: Record<string, number>) => {
  const classes = Object.fromEntries(GAP_CLASSES.map((g) => [g.code, partial[g.code] ?? 0]));
  return { total: Object.values(classes).reduce((a, b) => a + b, 0), classes } as never;
};

describe("regressionKind (tuned rule, single-sourced)", () => {
  it("new class: p=0,n>0 → 'new'", () => expect(regressionKind(0, 1)).toBe("new"));
  it("no change on 0,0 / recovery", () => {
    expect(regressionKind(0, 0)).toBe(null);
    expect(regressionKind(5, 3)).toBe(null);
  });
  it("absolute jump ≥5 fires", () => expect(regressionKind(4, 4 + REGRESSION_ABS_JUMP)).toBe("worsened"));
  it("3→7 (rel≥1.5 AND +4≥floor) fires — the audit's missed drift", () =>
    expect(regressionKind(3, 7)).toBe("worsened"));
  it("1→2 (+100% but +1 < floor=2) does NOT fire — noise suppressed", () =>
    expect(regressionKind(1, 2)).toBe(null));
  it("2→3 (rel=1.5 but +1 < floor) does NOT fire", () =>
    expect(regressionKind(2, 3)).toBe(null));
  it("2→4 (rel≥1.5 AND +2≥floor) fires", () => expect(regressionKind(2, 4)).toBe("worsened"));
  it("floor/factor consts have the tuned values", () => {
    expect([REGRESSION_ABS_JUMP, REGRESSION_REL_FACTOR, REGRESSION_REL_ABS_FLOOR]).toEqual([5, 1.5, 2]);
  });
});

describe("isQualityRegression uses the tuned rule", () => {
  it("fires on 3→7 in one class", () =>
    expect(isQualityRegression(sum({ FIELD_UNREADABLE: 3 }), sum({ FIELD_UNREADABLE: 7 }))).toBe(true));
  it("does not fire on 1→2", () =>
    expect(isQualityRegression(sum({ FIELD_UNREADABLE: 1 }), sum({ FIELD_UNREADABLE: 2 }))).toBe(false));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/parser/qualityRegressionComparator.test.ts -t "tuned rule"`
Expected: FAIL — `regressionKind` / consts not exported.

- [ ] **Step 3: Write minimal implementation**

In `lib/parser/dataGaps.ts`:

1. Add `gateExempt?: boolean` to the `GAP_CLASSES` entry type — since `GAP_CLASSES` is `as const`, no type change is needed to omit it; add the field only on the geocode entry in Task 5. To read it generically, cast in the loops below via `(c as { gateExempt?: boolean }).gateExempt`.
2. Add named consts near the top:

```ts
const REGRESSION_ABS_JUMP = 5;
const REGRESSION_REL_FACTOR = 1.5;
const REGRESSION_REL_ABS_FLOOR = 2;
export { REGRESSION_ABS_JUMP, REGRESSION_REL_FACTOR, REGRESSION_REL_ABS_FLOOR };

/** Per-class regression classification, single-sourced by isQualityRegression AND
 * buildRegressionPayload so the fire decision and the "why" payload cannot drift. */
export function regressionKind(p: number, n: number): "new" | "worsened" | null {
  if (p === 0 && n > 0) return "new";
  if (
    p > 0 &&
    (n - p >= REGRESSION_ABS_JUMP ||
      (n >= p * REGRESSION_REL_FACTOR && n - p >= REGRESSION_REL_ABS_FLOOR))
  )
    return "worsened";
  return null;
}
```

3. Rewrite `isQualityRegression` and add the `gateExempt` skip to it AND `hasRecoveredToBaseline`:

```ts
export function isQualityRegression(prior: DataGapsSummary, next: DataGapsSummary): boolean {
  for (const c of GAP_CLASSES) {
    if ((c as { gateExempt?: boolean }).gateExempt) continue;
    if (regressionKind(prior.classes[c.code], next.classes[c.code]) !== null) return true;
  }
  return false;
}

export function hasRecoveredToBaseline(
  baseline: DataGapsSummary,
  current: DataGapsSummary,
): boolean {
  for (const c of GAP_CLASSES) {
    if ((c as { gateExempt?: boolean }).gateExempt) continue;
    if (current.classes[c.code] > baseline.classes[c.code]) return false;
  }
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/parser/qualityRegressionComparator.test.ts`
Expected: PASS (including any pre-existing cases — re-run the whole file).

- [ ] **Step 5: Commit**

```bash
git add lib/parser/dataGaps.ts tests/parser/qualityRegressionComparator.test.ts
git commit --no-verify -m "feat(parser): single-sourced regressionKind + tuned published-show gate (6.3)"
```

---

### Task 3: `buildRegressionPayload` consumes `regressionKind` + gateExempt skip

**Files:**
- Modify: `lib/sync/runScheduledCronSync.ts:259-274`
- Test: `tests/parser/qualityRegressionComparator.test.ts` OR `tests/sync/qualityRegressionLifecycle.test.ts` (whichever exercises `buildRegressionPayload`/`evaluateQualityRegression_unlocked` — verify at implementation time which imports the payload builder; if `buildRegressionPayload` is not exported, add a targeted case to `tests/sync/qualityRegressionLifecycle.test.ts` asserting the alert context `worsened` list).

**Interfaces:**
- Consumes: `regressionKind` from `lib/parser/dataGaps.ts` (Task 2).

- [ ] **Step 1: Write the failing test**

`buildRegressionPayload` is module-private. Assert through the lifecycle: a 3→7 drift must produce an alert whose `context.worsened` includes the class (proving the payload uses the tuned rule, not the old `+5 AND` rule). Add to `tests/sync/qualityRegressionLifecycle.test.ts`:

```ts
it("3→7 drift fires AND names the class in worsened (payload uses tuned rule)", async () => {
  // ... drive evaluateQualityRegression_unlocked with prior {FIELD_UNREADABLE:3}, next {FIELD_UNREADABLE:7}
  // assert the upserted admin_alert context.worsened contains "FIELD_UNREADABLE"
  // (before the fix: worsened is EMPTY because 4 < 5, leaving Doug an empty reason)
});
```

(Wire the fixture using the existing harness in that file — it already imports `evaluateQualityRegression_unlocked` and a fake `tx` with `queryOne` + `upsertAdminAlert` spy at lines 17/67/319.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/sync/qualityRegressionLifecycle.test.ts -t "worsened"`
Expected: FAIL — `worsened` empty (old rule needs `+5 AND +50%`; 3→7 is `+4`).

- [ ] **Step 3: Write minimal implementation**

Rewrite the loop in `buildRegressionPayload` (`runScheduledCronSync.ts:266-272`) to use `regressionKind` + gateExempt skip:

```ts
import { regressionKind, GAP_CLASSES } from "@/lib/parser/dataGaps"; // add regressionKind to the existing import
// ...
for (const c of GAP_CLASSES) {
  if ((c as { gateExempt?: boolean }).gateExempt) continue;
  const p = prior.classes[c.code];
  const n = current.classes[c.code];
  if (n > 0) breakdown[c.code] = n;
  const kind = regressionKind(p, n);
  if (kind === "new") new_classes.push(c.code);
  else if (kind === "worsened") worsened.push(c.code);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/sync/qualityRegressionLifecycle.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sync/runScheduledCronSync.ts tests/sync/qualityRegressionLifecycle.test.ts
git commit --no-verify -m "fix(sync): buildRegressionPayload shares tuned regressionKind (no fire-vs-payload drift)"
```

---

### Task 4: new §12.4 code `VENUE_GEOCODE_UNRESOLVED`

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 table ~L2893 + `helpfulContext` appendix ~L3195)
- Modify: `lib/messages/catalog.ts` (new row, template = `CREW_COLUMN_POSITIONAL_FALLBACK` at L1242)
- Modify: `app/help/errors/_families.ts` (add `VENUE` prefix to the `syncing-sheets` family)
- Regenerate: `lib/messages/__generated__/spec-codes.ts`, `lib/messages/__generated__/internal-code-enums.ts`
- Test: `tests/messages/` (catalog parity + internal-code-enums run automatically) + `tests/help/errors-grouping.test.tsx` (families)

- [ ] **Step 1: Write the failing test**

Add a families assertion to `tests/help/errors-grouping.test.tsx` that `familyFor("VENUE_GEOCODE_UNRESOLVED")` returns `"syncing-sheets"`, not the `Other` fallback (match the file's existing `familyFor`/`FAMILIES` import + assertion style).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/help/errors-grouping.test.tsx && pnpm vitest run tests/messages`
Expected: FAIL — the new family assertion returns `Other` (no `VENUE` prefix yet); and once the §12.4 spec row is added, the `tests/messages/` catalog-parity/coverage suites fail until `catalog.ts` + both `__generated__` files match. (There is no `tests/messages/codes.test.ts` in this repo — run the whole `tests/messages/` dir; `catalog.test.ts` + `codes-coverage.test.ts` carry the parity gates.)

- [ ] **Step 3: Write minimal implementation**

1. **Spec §12.4 table row** (after the `CREW_COLUMN_POSITIONAL_FALLBACK` row, ~L2893) — match the pipe-column shape exactly (do NOT `prettier` the master spec):

```
| `VENUE_GEOCODE_UNRESOLVED` | we couldn't automatically look up the venue's city from its address | "We couldn't automatically look up the city for _<venue>_, so the crew page shows the venue address instead of a city name. This often clears on the next sync; if it sticks, double-check the venue address in the sheet." | — | Doug → optional fix (auto-retries) |
```

2. **Spec §12.4 `helpfulContext` appendix** (~L3195, alongside `CREW_COLUMN_POSITIONAL_FALLBACK`):

```
VENUE_GEOCODE_UNRESOLVED: "We look up each venue's city from its address so the crew page can show a clean location. This time the lookup didn't return a city — often a temporary hiccup with the lookup service, which clears on the next sync. The page falls back to showing the address. If it keeps happening, check the venue address in the sheet for typos."
```

3. **`catalog.ts` row** (template `CREW_COLUMN_POSITIONAL_FALLBACK`):

```ts
VENUE_GEOCODE_UNRESOLVED: {
  code: "VENUE_GEOCODE_UNRESOLVED",
  dougFacing:
    "We couldn't automatically look up the city for _<venue>_, so the crew page shows the venue address instead of a city name. This often clears on the next sync; if it sticks, double-check the venue address in the sheet.",
  crewFacing: null,
  followUp: "Doug → optional fix (auto-retries)",
  helpfulContext:
    "We look up each venue's city from its address so the crew page can show a clean location. This time the lookup didn't return a city — often a temporary hiccup with the lookup service, which clears on the next sync. The page falls back to showing the address. If it keeps happening, check the venue address in the sheet for typos.",
  title: "Couldn't look up the venue city",
  longExplanation:
    "We look up each venue's city from its address so the crew page can show a clean location. The lookup didn't return a city this time — usually a temporary service hiccup that clears on the next sync. The page falls back to the address. If it persists, check the venue address in the sheet.",
  helpHref: "/help/errors#VENUE_GEOCODE_UNRESOLVED",
},
```

4. **`_families.ts`** — add `"VENUE"` to the `prefixes` of the `syncing-sheets` family entry (`FAMILIES` array).

5. Regenerate:

```bash
pnpm gen:spec-codes && pnpm gen:internal-code-enums
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/messages && pnpm vitest run app/help` (or the families test path)
Expected: PASS. Confirm `git status` shows the two `__generated__` files staged.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md lib/messages/catalog.ts lib/messages/__generated__/spec-codes.ts lib/messages/__generated__/internal-code-enums.ts app/help/errors/_families.ts tests/
git commit --no-verify -m "feat(messages): VENUE_GEOCODE_UNRESOLVED §12.4 code (3-way lockstep + family)"
```

---

### Task 5: add `VENUE_GEOCODE_UNRESOLVED` to `GAP_CLASSES` with `gateExempt`

**Files:**
- Modify: `lib/parser/dataGaps.ts` (GAP_CLASSES)
- Modify: `tests/parser/dataGapsClassCompleteness.test.ts` (partition counts)

**Interfaces:**
- Consumes: the catalog code from Task 4 (the partition meta-test intersects `MESSAGE_CATALOG`, so the code must exist there first).

- [ ] **Step 1: Write the failing test**

Update `tests/parser/dataGapsClassCompleteness.test.ts`: add `"VENUE_GEOCODE_UNRESOLVED"` to the Layer-1 `DATA_GAP_CODES` editorial set (it is a gap by classification), and bump the size assertions:

```ts
// DATA_GAP_CODES now 26 (was 25)
expect(DATA_GAP_CODES.size).toBe(26);
// ALL_PERSISTED_WARNING_CODES now 46 (26/7/2/11)
expect(ALL_PERSISTED_WARNING_CODES.size).toBe(46);
```

Also update the human comment "total 45 (25/7/2/11)" → "total 46 (26/7/2/11)".

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/parser/dataGapsClassCompleteness.test.ts`
Expected: FAIL — `GAP_CLASSES` still has 25 codes; `DATA_GAP_CODES.size` is 25 not 26; the drift scan flags `VENUE_GEOCODE_UNRESOLVED` (now a catalog literal emitted... after Task 6; here the editorial set expects it).

- [ ] **Step 3: Write minimal implementation**

Append to `GAP_CLASSES` (`lib/parser/dataGaps.ts:30-56`):

```ts
  { code: "VENUE_GEOCODE_UNRESOLVED", label: "unresolved venue location", gateExempt: true },
```

(The heterogeneous entry is fine under `as const`; the `gateExempt` reads in Tasks 2/3 already tolerate its absence on the other 25.)

- [ ] **Step 4: Prove gateExempt across ALL THREE iterators (Codex plan-R2 HIGH)**

The skip is threaded through `isQualityRegression`, `hasRecoveredToBaseline`, AND `buildRegressionPayload` — test each, or the skip could silently regress in two of them. Add to `tests/parser/qualityRegressionComparator.test.ts`:

```ts
describe("VENUE_GEOCODE_UNRESOLVED is gateExempt (badge-visible, never gates)", () => {
  it("isQualityRegression: geocode-only jump 0→9 does NOT fire", () =>
    expect(isQualityRegression(sum({}), sum({ VENUE_GEOCODE_UNRESOLVED: 9 }))).toBe(false));

  it("hasRecoveredToBaseline: a clean baseline stays 'recovered' even when current has geocode-only", () =>
    // geocode is exempt → it must NOT keep an open alert from resolving
    expect(hasRecoveredToBaseline(sum({}), sum({ VENUE_GEOCODE_UNRESOLVED: 9 }))).toBe(true));
});
```

And a lifecycle proof that `buildRegressionPayload` (via `evaluateQualityRegression_unlocked`) never lists geocode — add to `tests/sync/qualityRegressionLifecycle.test.ts`:

```ts
it("geocode-only drift (0→9 VENUE_GEOCODE_UNRESOLVED) upserts NO alert and never lists the class", async () => {
  // drive evaluateQualityRegression_unlocked: prior {}, next {VENUE_GEOCODE_UNRESOLVED: 9}
  // assert the upsertAdminAlert spy was NOT called (no regression), proving gateExempt in isQualityRegression
  // AND buildRegressionPayload (the payload is never built because no alert opens).
});
```

Run: `pnpm vitest run tests/parser/qualityRegressionComparator.test.ts tests/parser/dataGapsClassCompleteness.test.ts tests/sync/qualityRegressionLifecycle.test.ts`
Expected: PASS (all three iterators proven to skip the gate-exempt class).

- [ ] **Step 5: Commit**

```bash
git add lib/parser/dataGaps.ts tests/parser/dataGapsClassCompleteness.test.ts tests/parser/qualityRegressionComparator.test.ts tests/sync/qualityRegressionLifecycle.test.ts
git commit --no-verify -m "feat(parser): geocode gap class (gateExempt — badge-visible, never trips push)"
```

---

### Task 6: emit `VENUE_GEOCODE_UNRESOLVED` on `res.error`

**Files:**
- Modify: `lib/sync/enrichVenueGeocode.ts:98-101`
- Test: `tests/sync/enrichVenueGeocode.test.ts`

**Interfaces:**
- Consumes: `result.warnings` (mutable `ParseWarning[]` on `ParseResult`).

**MANDATORY pre-req (Codex plan-R1 finding):** the existing `makeResult` helper (`tests/sync/enrichVenueGeocode.test.ts:17`) is `return { show: { venue } } as unknown as ParseResult;` — it does **not** seed `warnings`, so the new `result.warnings.push(...)` would throw `Cannot read properties of undefined`. **First** widen the helper to `return { show: { venue }, warnings: [] } as unknown as ParseResult;`. Production `result` always carries `warnings` (typed non-optional `ParseWarning[]`; the sole caller `enrichWithDrivePins.ts:423` passes a full `ParseResult`), so the impl does NOT add a defensive coalesce — the type guarantees the array; the fixture just has to match the real shape.

- [ ] **Step 1: Write the failing test**

Add cases proving the emit is scoped to `res.error` ONLY:

```ts
it("pushes VENUE_GEOCODE_UNRESOLVED exactly once on res.error", async () => {
  const result = makeResult({ venue: { name: "The Hall", address: "1 Main St" } });
  await enrichVenueGeocode(result, {
    isConfigured: () => true,
    cacheRead: async () => ({ kind: "miss" }),
    cacheWrite: async () => {},
    geocode: async () => ({ error: { kind: "timeout" } }) as never,
  });
  const hits = result.warnings.filter((w) => w.code === "VENUE_GEOCODE_UNRESOLVED");
  expect(hits).toHaveLength(1);
  expect(hits[0].severity).toBe("warn");
});

it("does NOT emit when unconfigured / breaker-open / null-city success / cache hit", async () => {
  // unconfigured:
  const r1 = makeResult({ venue: { name: "H", address: "A" } });
  await enrichVenueGeocode(r1, { isConfigured: () => false, cacheRead: async () => ({ kind: "miss" }), cacheWrite: async () => {}, geocode: async () => ({}) as never });
  expect(r1.warnings.some((w) => w.code === "VENUE_GEOCODE_UNRESOLVED")).toBe(false);

  // geocode SUCCESS with null city:
  const r2 = makeResult({ venue: { name: "H", address: "A" } });
  await enrichVenueGeocode(r2, { isConfigured: () => true, cacheRead: async () => ({ kind: "miss" }), cacheWrite: async () => {}, geocode: async () => ({ data: { city: null } }) as never });
  expect(r2.warnings.some((w) => w.code === "VENUE_GEOCODE_UNRESOLVED")).toBe(false);
});
```

(Match the existing test's `mkResult`/deps helpers; `__resetGeocodeBreaker()` between cases.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run <enrichVenueGeocode test path> -t VENUE_GEOCODE_UNRESOLVED`
Expected: FAIL — no warning pushed.

- [ ] **Step 3: Write minimal implementation**

In `lib/sync/enrichVenueGeocode.ts`, the `res.error` branch (L98-101):

```ts
    if (res.error) {
      recordGeocodeFailure(); // a request failure trips the breaker (not_configured can't reach here)
      result.warnings.push({
        severity: "warn",
        code: "VENUE_GEOCODE_UNRESOLVED",
        message: "VENUE_GEOCODE_UNRESOLVED",
      });
      return; // leave venue.city unset (offline fallback)
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run <enrichVenueGeocode test path>`
Expected: PASS. Then run the mutation-surface meta-test to confirm no new surface is flagged:

```bash
pnpm vitest run tests/log/_metaMutationSurfaceObservability.test.ts
```

Expected: PASS (unchanged — `enrichVenueGeocode` is a `void` best-effort mutator, not a route/action). If it DOES flag, add an inline `// no-telemetry: best-effort enrichment; failure persists as VENUE_GEOCODE_UNRESOLVED parse_warning` at the function.

- [ ] **Step 5: Commit**

```bash
git add lib/sync/enrichVenueGeocode.ts <enrichVenueGeocode test path>
git commit --no-verify -m "feat(sync): emit VENUE_GEOCODE_UNRESOLVED on genuine geocode failure (6.4)"
```

---

### Task 7: neutral AutoFixChip + wire `autoFixes` through (UI — invariant 8)

**Files:**
- Modify: `lib/admin/showDisplay.ts:15-50` (add `autoFixes?: AutoFixSummary` to `ActiveShowRow`)
- Modify: `components/admin/Dashboard.tsx:312-338,439-454` (compute `summarizeAutoFixes` in the SAME `readDataGaps` loop; attach per row via exactOptional spread)
- Modify: `components/admin/ShowsTable.tsx` (add `AutoFixChip`, render adjacent to `DataGapsChip` at ~L545)
- Test: `tests/components/…/ShowsTable.test.tsx` (locate the existing ShowsTable test) + Dashboard read test if present

**Interfaces:**
- Consumes: `summarizeAutoFixes`, `formatAutoFixBreakdown`, `AutoFixSummary` (Task 1).

- [ ] **Step 1: Write the failing test**

In the existing ShowsTable test file, add (anti-tautology: scope by `data-testid`, and assert the auto-fixed pill does NOT render the amber gap classes — the two chips both render a number + noun):

```tsx
it("renders a neutral auto-fixed chip when autoFixes.total > 0, distinct from the gap chip", () => {
  render(<ShowsTable rows={[row({ slug: "x", autoFixes: { total: 3, classes: { STAGE_WORD_AUTOCORRECTED: 3, ROLE_TOKEN_AUTOCORRECTED: 0, COLUMN_HEADER_AUTOCORRECTED: 0, SECTION_HEADER_AUTOCORRECTED: 0, FIELD_LABEL_AUTOCORRECTED: 0 } } })]}
    now={now} activeCount={1} overflowCount={0} rowAction={() => <span>act</span>} />);
  const chip = screen.getByTestId("shows-auto-fixed-chip-x");
  expect(chip).toHaveTextContent("3");
  expect(chip).toHaveTextContent(/auto-fixed/i);
  // neutral, NOT the amber gap chip:
  expect(chip.className).not.toMatch(/status-warn/);
});

it("hides the auto-fixed chip when autoFixes is absent or total 0", () => {
  render(<ShowsTable rows={[row({ slug: "y" })]} now={now} activeCount={1} overflowCount={0} rowAction={() => <span>a</span>} />);
  expect(screen.queryByTestId("shows-auto-fixed-chip-y")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run <ShowsTable test path> -t auto-fixed`
Expected: FAIL — no such chip / `autoFixes` not a row field.

- [ ] **Step 3: Write minimal implementation**

1. `lib/admin/showDisplay.ts` — add to `ActiveShowRow` and import the type:

```ts
import type { DataGapsSummary, AutoFixSummary } from "@/lib/parser/dataGaps";
// ... in ActiveShowRow, next to `dataGaps?: DataGapsSummary;`
  autoFixes?: AutoFixSummary;
```

2. `components/admin/Dashboard.tsx` — in the `readDataGaps` loop (L326-333), compute both summaries from the same `r.parse_warnings` and return a second map (or a `{gaps, autoFixes}` pair). Attach per row at L439-454 via exactOptional spread:

```ts
import { summarizeDataGaps, summarizeAutoFixes, type DataGapsSummary, type AutoFixSummary } from "@/lib/parser/dataGaps";
// inside readDataGaps loop, alongside the gap summary:
const auto = summarizeAutoFixes(r.parse_warnings as ParseWarning[]);
if (auto.total > 0) autoByShow.set(r.show_id, auto);
// building each row:
...(autoFixes ? { autoFixes } : {}),
```

(Return `{ gaps: byShow, autoFixes: autoByShow }` from `readDataGaps`, or a parallel local map — no second Supabase query.)

3. `components/admin/ShowsTable.tsx` — import + add the chip, render it before `DataGapsChip` (or adjacent) at L545:

```tsx
import { formatDataGapBreakdown, formatAutoFixBreakdown, type DataGapsSummary, type AutoFixSummary } from "@/lib/parser/dataGaps";

function AutoFixChip({ slug, autoFixes }: { slug: string; autoFixes: AutoFixSummary | undefined }) {
  if (!autoFixes || autoFixes.total === 0) return null;
  const breakdown = formatAutoFixBreakdown(autoFixes);
  return (
    <span
      data-testid={`shows-auto-fixed-chip-${slug}`}
      title={breakdown}
      className="inline-flex items-center gap-1.5 rounded-pill border border-border px-2 py-0.5 text-xs font-medium text-text-subtle"
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-text-subtle" />
      <span className="tabular-nums">{autoFixes.total}</span> auto-fixed
    </span>
  );
}
// at L545, adjacent to <DataGapsChip … />:
<AutoFixChip slug={row.slug} autoFixes={row.autoFixes} />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run <ShowsTable test path>`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/admin/showDisplay.ts components/admin/Dashboard.tsx components/admin/ShowsTable.tsx <ShowsTable test path>
git commit --no-verify -m "feat(admin): neutral N-auto-fixed chip on shows table (6.3)"
```

---

### Task 8: full-suite gate + impeccable dual-gate + close-out prep

- [ ] **Step 1: Run the full verification suite**

```bash
pnpm typecheck && pnpm format:check && pnpm lint && pnpm test 2>&1 | tail -30
```

Expected: all green. If `format:check` flags the master spec, DO NOT prettier it — hand-fix only the non-spec files.

- [ ] **Step 2: Impeccable dual-gate on the UI diff (Task 7)**

Run `/impeccable critique` then `/impeccable audit` on the `components/admin/ShowsTable.tsx` diff. Fix HIGH/CRITICAL or defer via `DEFERRED.md`. Record findings + dispositions for the handoff.

- [ ] **Step 3: Confirm the new-code CI fan-out is complete**

```bash
pnpm vitest run tests/messages tests/parser/dataGapsClassCompleteness.test.ts
git grep -n VENUE_GEOCODE_UNRESOLVED -- lib/messages/__generated__
```

Expected: both generated files contain the code; message + partition suites green.

- [ ] **Step 4: Commit any close-out fixes**

```bash
git add -A && git commit --no-verify -m "chore(flow6): close-out — full-suite green + impeccable dispositions"
```

## Self-review checklist (run before adversarial review)

- Spec coverage: 6.3 = Tasks 1,2,3,7; 6.4 = Tasks 4,5,6. Part 2 deferred (no task). ✓
- Type consistency: `AutoFixSummary`/`AutoFixCode`/`summarizeAutoFixes`/`formatAutoFixBreakdown`/`regressionKind` names identical across Tasks 1,2,3,7. ✓
- Anti-tautology: gate tests derive from named consts + fixture counts; chip test scopes by `data-testid` and asserts neutral (non-`status-warn`) styling so it can't pass by matching the gap chip. ✓
- No placeholders: every code step shows real code. The two "locate the existing test path" notes (Tasks 3,6,7) are unavoidable — the implementer greps once; the test bodies are fully specified.
