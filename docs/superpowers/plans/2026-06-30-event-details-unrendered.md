# Surface event_details tech specs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Render the captured-but-hidden `event_details` technical specs on the crew page (a new GearSection "Tech specs" card) and in the Step-3 review modal, from one shared closed-vocab whitelist.

**Architecture:** Render-only. A shared `lib/crew/eventDetailsSpecs.ts` whitelist (labels + crew subset) feeds (1) a crew `KeyValueRows` card in GearSection (auto sentinel-hides) and (2) the modal's `EventDetailsBreakdown`. No DB/parser/migration changes.

**Tech Stack:** Next.js Server Components, TypeScript, Vitest + Testing Library. Spec: `docs/superpowers/specs/2026-06-30-event-details-unrendered-design.md` (Codex-APPROVED).

## Global Constraints

- Render-only — touch only `lib/crew/`, `components/crew/sections/GearSection.tsx`, `components/admin/wizard/Step3SheetCard.tsx`, `lib/sheet-links/buildSheetDeepLink.ts`, `DESIGN.md`, and `tests/**`. No `app/api`, DB, parser, migrations.
- UI surface → **Opus + impeccable v3 dual-gate** (invariant 8); record critique/audit dispositions in the PR description (+`DEFERRED.md` for deferrals).
- TDD per task; commit per task (`feat(crew-page):` / `feat(admin):` / `test(crew):` / `chore(sheet-links):`). `--no-verify`.
- Value coercion everywhere: `String(event_details[key] ?? "").trim()` (JSONB-decoded; never `(… ?? "").trim()`).
- Closed-vocab: only keys in `EVENT_DETAILS_LABELS` render; `diagrams` excluded (folder link).
- Worktree: `/Users/ericweiss/fxav-event-details-unrendered` (branch `feat/event-details-unrendered`). Run tests from worktree root.

---

## File Structure

- **Create** `lib/crew/eventDetailsSpecs.ts` — `EVENT_DETAILS_LABELS` (as const) + `CREW_TECH_SPEC_KEYS` (as const) + compile-time crew⊆labels assertion.
- **Create** `tests/crew/eventDetailsSpecs.test.ts` — whitelist completeness + crew-subset integrity.
- **Modify** `components/crew/sections/GearSection.tsx` — compute `techSpecRows`/`hasTechSpecs`, add to `allHidden`, render the `gear-tech-specs` card.
- **Modify** `lib/sheet-links/buildSheetDeepLink.ts` — add `"gear-tech-specs": "details"` to `CARD_REGION_MAP`.
- **Modify** `components/admin/wizard/Step3SheetCard.tsx` — extend `EventDetailsBreakdown` to iterate the whitelist (coerce-then-check).
- **Modify** `tests/components/tiles/_metaSentinelHidingContract.test.ts` — extend `GENERIC_OPTIONAL_FIELDS` (bracket patterns, 15 keys).
- **Modify** `tests/components/crew/sourceLinkCoverage.test.tsx` (or its shared fixture) — add a tech-spec value so the card renders + is walked.
- **Create** `tests/components/crew/gearTechSpecs.test.tsx` — crew card behavior.
- **Modify** `DESIGN.md` — Tech specs card entry.

---

## Task 1: Shared whitelist module + integrity test

**Files:** Create `lib/crew/eventDetailsSpecs.ts`, `tests/crew/eventDetailsSpecs.test.ts`.

**Interfaces — Produces:** `EVENT_DETAILS_LABELS` (`Record<string,string>`-shaped const), `CREW_TECH_SPEC_KEYS` (`readonly string[]`).

- [ ] **Step 1: Write the failing integrity test** — `tests/crew/eventDetailsSpecs.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { EVENT_DETAILS_LABELS, CREW_TECH_SPEC_KEYS } from "@/lib/crew/eventDetailsSpecs";
import { CANONICAL_KEY_MAP } from "@/lib/parser/blocks/event";

// Canonical text keys = all parser canonical values EXCEPT the documented non-text exclusion.
const LABEL_EXCLUDED = new Set(["diagrams"]);
const ALREADY_RENDERED = new Set([
  "dress_code", "internet", "power", "keynote_requirements", "opening_reel",
]);

describe("eventDetailsSpecs whitelist", () => {
  it("labels exactly the canonical text keys (completeness, two-way)", () => {
    const canonicalText = new Set(
      [...new Set(Object.values(CANONICAL_KEY_MAP))].filter((k) => !LABEL_EXCLUDED.has(k)),
    );
    const labeled = new Set(Object.keys(EVENT_DETAILS_LABELS));
    expect([...labeled].sort()).toEqual([...canonicalText].sort());
  });

  it("every crew key is labeled and not already-rendered or diagrams", () => {
    for (const k of CREW_TECH_SPEC_KEYS) {
      expect(EVENT_DETAILS_LABELS[k], `crew key ${k} has no label`).toBeTruthy();
      expect(ALREADY_RENDERED.has(k), `crew key ${k} is already rendered elsewhere`).toBe(false);
      expect(k).not.toBe("diagrams");
    }
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm vitest run tests/crew/eventDetailsSpecs.test.ts`
Expected: FAIL — `Cannot find module '@/lib/crew/eventDetailsSpecs'`.

- [ ] **Step 3: Implement** — `lib/crew/eventDetailsSpecs.ts`:

```ts
/**
 * Closed-vocab whitelist for surfacing event_details text specs — single source
 * of truth for the crew GearSection "Tech specs" card AND the Step-3 review
 * modal. Keys with NO entry (PII/financial/unknown, and `diagrams` — a folder
 * link surfaced by the Diagrams tile) never render. (BL-EVENT-DETAILS-UNRENDERED)
 */
export const EVENT_DETAILS_LABELS = {
  stage_size: "Stage size",
  podium_type: "Podium",
  polling: "Polling",
  led: "LED wall",
  scenic: "Backdrop / scenic",
  gooseneck: "Gooseneck mics",
  digital_signage: "Digital signage",
  test_pattern: "Test pattern",
  fonts: "Fonts",
  equipment_storage: "Equipment storage",
  staff_office_room: "Staff office",
  record: "Recording",
  virtual_speaker: "Virtual speaker",
  virtual_audience: "Virtual audience",
  notes: "Notes",
  // Shown in the operator modal; already rendered elsewhere on the crew page:
  keynote_requirements: "Keynote",
  opening_reel: "Opening reel",
  internet: "Internet / Wi-Fi",
  power: "Power",
  dress_code: "Dress code",
} as const;

/**
 * Ordered crew Tech-specs card subset — EXCLUDES keys rendered on other crew
 * surfaces (dress→Today, internet/power→Venue, keynote/opening_reel→Gear) and
 * `diagrams`. Crew-impact first.
 */
export const CREW_TECH_SPEC_KEYS = [
  "stage_size", "podium_type", "polling", "led", "scenic", "gooseneck",
  "digital_signage", "test_pattern", "fonts", "equipment_storage",
  "staff_office_room", "record", "virtual_speaker", "virtual_audience", "notes",
] as const;

// Compile-time guard: every crew key MUST be a declared label key.
const _crewKeysAreLabeled: readonly (keyof typeof EVENT_DETAILS_LABELS)[] = CREW_TECH_SPEC_KEYS;
void _crewKeysAreLabeled;
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm vitest run tests/crew/eventDetailsSpecs.test.ts`
Expected: PASS (2 tests). If the completeness test fails, the label map is missing/extra a canonical key — reconcile against `CANONICAL_KEY_MAP` values (excluding `diagrams`).

- [ ] **Step 5: Typecheck (the compile-time assertion)**

Run: `pnpm typecheck`
Expected: clean. (A crew key not in the label map would error here.)

- [ ] **Step 6: Commit**

```bash
git add lib/crew/eventDetailsSpecs.ts tests/crew/eventDetailsSpecs.test.ts
git commit --no-verify -m "feat(crew-page): shared event_details specs whitelist (BL-EVENT-DETAILS-UNRENDERED)"
```

---

## Task 2: Crew "Tech specs" card (GearSection) + card-id wiring + sentinel meta-test

**Files:**
- Modify `lib/sheet-links/buildSheetDeepLink.ts` (`CARD_REGION_MAP`)
- Modify `components/crew/sections/GearSection.tsx`
- Modify `tests/components/tiles/_metaSentinelHidingContract.test.ts` (`GENERIC_OPTIONAL_FIELDS`)
- Modify `tests/components/crew/sourceLinkCoverage.test.tsx` (fixture)
- Create `tests/components/crew/gearTechSpecs.test.tsx`

**Interfaces — Consumes:** `EVENT_DETAILS_LABELS`, `CREW_TECH_SPEC_KEYS` (Task 1); `KeyValueRows`/`KeyValueRow`, `SectionCard`, `SourceLink`, `shouldHideGenericOptional`, `CARD_REGION_MAP` (existing).

- [ ] **Step 1: Write the failing crew-card test** — `tests/components/crew/gearTechSpecs.test.tsx`. Mirror the existing GearSection test setup (import `GearSection`, build a `ShowForViewer` fixture; copy the fixture factory from `tests/components/crew/sections/` GearSection tests). Assert:

```ts
// (setup: render GearSection with a fixture whose data.show.event_details has the values below)
// real specs render:
//   event_details: { stage_size: "8' x 24' x 2'", podium_type: "(2) Acrylic", polling: "YES",
//                    record: "N/A", power: "100-amp" /* already-rendered elsewhere */,
//                    /* @ts-expect-error simulate bad JSONB */ test_pattern: 169 }
// 1. screen.getByText("Stage size"); getByText("8' x 24' x 2'")
// 2. queryByText("Recording") === null            // record:"N/A" sentinel-hidden
// 3. within the gear-tech-specs card, queryByText("Power") === null  // already-rendered key excluded
// 4. getByText("169")                              // non-string coerced+shown (no throw)
// 5. card present: getByTestId("gear-tech-specs")
// 6. GUARD (Codex plan-R2): a second render with event_details = {} (and one with
//    it forced undefined via a cast) → no throw AND queryByTestId("gear-tech-specs") === null
//    (hasTechSpecs false → card omitted). Covers the "missing event_details → no rows" guard.
```

Write it concretely against the real GearSection test harness (copy the neighbor test's `renderGear`/fixture helper). Use `data-testid="gear-tech-specs"`.

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm vitest run tests/components/crew/gearTechSpecs.test.tsx`
Expected: FAIL — no "Stage size" text / no `gear-tech-specs` testid. (TDD: test precedes ALL implementation, including the CARD_REGION_MAP add in Step 3 — Codex plan-R1.)

- [ ] **Step 3: Implement the card** — two files, both part of this one implementation step (the card's `CARD_REGION_MAP["gear-tech-specs"]` lookup won't compile without the mapping):

(a0) `lib/sheet-links/buildSheetDeepLink.ts` — in `CARD_REGION_MAP`, after `"gear-opening-reel": "details",`:
```ts
  "gear-tech-specs": "details",
```
Then in `components/crew/sections/GearSection.tsx`:
(a) Add imports:
```ts
import { SlidersHorizontal } from "lucide-react";
import { EVENT_DETAILS_LABELS, CREW_TECH_SPEC_KEYS } from "@/lib/crew/eventDetailsSpecs";
```
(b) Near the keynote/reel computation (~line 185-210), compute the rows + presence. **Null-safe `?? {}` (Codex plan-R2)** — match Task 3's `eventDetails ?? {}` so a missing `event_details` yields no rows instead of throwing (the projection guarantees `{}` at `getShowForViewer.ts:358`, but guard for parity + the spec's "undefined → no rows" guard condition):
```ts
          const ed = data.show.event_details ?? {};
          const techSpecRows: KeyValueRow[] = CREW_TECH_SPEC_KEYS.map((key) => ({
            k: EVENT_DETAILS_LABELS[key],
            v: String(ed[key] ?? "").trim(),
          }));
          const hasTechSpecs = techSpecRows.some((r) => !shouldHideGenericOptional(r.v));
```
(c) Add to the `allHidden` gate (line ~211):
```ts
          const allHidden =
            scopeCards.length === 0 && !packVisible && keynote === null && !hasReel && !hasTechSpecs;
```
(d) Render the card inside the fragment, immediately before the keynote card block (`{keynote !== null ? (`):
```tsx
              {hasTechSpecs ? (
                <div data-testid="gear-tech-specs" data-card-id="gear-tech-specs">
                  <SectionCard
                    icon={<SlidersHorizontal className="size-4" aria-hidden />}
                    title="Tech specs"
                    action={
                      <SourceLink
                        driveFileId={data.driveFileId}
                        anchor={data.sourceAnchors[CARD_REGION_MAP["gear-tech-specs"]]}
                      />
                    }
                  >
                    <KeyValueRows rows={techSpecRows} />
                  </SectionCard>
                </div>
              ) : null}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm vitest run tests/components/crew/gearTechSpecs.test.tsx`
Expected: PASS (all 5 assertions). If "Power" appears in the card, the `CREW_TECH_SPEC_KEYS` excludes it (Task 1) — verify the loop uses that const, not all labels.

- [ ] **Step 5: Extend the sentinel-hiding meta-test — FORWARD-DEFENSE ONLY** — `tests/components/tiles/_metaSentinelHidingContract.test.ts`, add to `GENERIC_OPTIONAL_FIELDS`:

```ts
  {
    description: "event_details tech specs (crew Tech-specs card, bracket access)",
    pattern:
      /event_details\[\s*"(stage_size|podium_type|polling|led|scenic|gooseneck|digital_signage|test_pattern|fonts|equipment_storage|staff_office_room|record|virtual_speaker|virtual_audience|notes)"\s*\]/,
  },
```

**Important (Codex plan-R1):** this LITERAL bracket pattern does NOT match the card's implementation, which reads `data.show.event_details[key]` in a dynamic loop (no literal `event_details["stage_size"]` text in GearSection.tsx). That is intentional — the pattern is **forward-defense** that fails CI if a FUTURE edit adds a *direct literal* read of one of these keys in a walked component without sentinel-hiding. The CURRENT card's sentinel-hiding is NOT guarded by this pattern; it is guaranteed by `KeyValueRows` (a walked, already-compliant primitive that routes every row through `shouldHideGenericOptional`) and verified by the `record:"N/A"`-hidden assertion in the Step-1 component test. So after adding the pattern, the meta-test must still **PASS** (it matches no current walked file) — it neither newly-enforces nor breaks the current code.

- [ ] **Step 6: Make the source-link walker cover the new card** — in `tests/components/crew/sourceLinkCoverage.test.tsx`, find `fullFixture()` and ensure its `event_details` includes a real tech spec (e.g. `stage_size: "8' x 24' x 2'"`) so the `gear-tech-specs` card renders and is discovered by the walker. (If the fixture lives in a shared helper, edit there.)

- [ ] **Step 7: Run the wiring/meta/coverage suites**

Run: `pnpm vitest run tests/components/tiles/_metaSentinelHidingContract.test.ts tests/components/crew/sourceLinkCoverage.test.tsx tests/components/crew/gearTechSpecs.test.tsx`
Expected: PASS (the meta-test passes because the new pattern matches no current file — see Step 5). The walker now classifies `gear-tech-specs` (CARD_REGION_MAP key) and verifies its SourceLink href = `buildSheetDeepLink(driveFileId, sourceAnchors["details"])`.

- [ ] **Step 8: Affordance-matrix check** — Run `pnpm vitest run tests/help/_metaAffordanceMatrixParity.test.ts tests/help/_affordance-matrix-shape.test.ts tests/help/deep-link-walker-reverse.test.ts` (the three files the `affordance-matrix-parity` CI gate runs). Expected: PASS (the card reuses `SectionCard`+`SourceLink`, same as `gear-keynote`, already classified — no new help-affordance testid). If any flags the new card, mirror exactly how `gear-keynote`/`gear-opening-reel` are handled — do NOT invent a new pattern.

- [ ] **Step 9: Commit**

```bash
git add lib/sheet-links/buildSheetDeepLink.ts components/crew/sections/GearSection.tsx tests/components/tiles/_metaSentinelHidingContract.test.ts tests/components/crew/sourceLinkCoverage.test.tsx tests/components/crew/gearTechSpecs.test.tsx
git commit --no-verify -m "feat(crew-page): Tech specs card in GearSection (BL-EVENT-DETAILS-UNRENDERED)"
```

---

## Task 3: Step-3 review modal — render all known text specs

**Files:** Modify `components/admin/wizard/Step3SheetCard.tsx` (`EventDetailsBreakdown`, ~:372-396); modify/extend its test (`tests/components/step3SheetCard.test.tsx`).

**Interfaces — Consumes:** `EVENT_DETAILS_LABELS` (Task 1), existing `hasContent`, `stripOpeningReelText`, `BreakdownSection`.

- [ ] **Step 1: Write the failing modal test** — add to the Step3 test file:

```ts
// Given eventDetails = { stage_size: "8'x24'", podium_type: "(2) Acrylic", polling: "YES",
//   keynote_requirements: "TBD", opening_reel: "YES https://drive… ",
//   diagrams: "https://drive…folder",  // must NOT appear (text-key scope)
//   notes: "   ",                       // whitespace → omitted
//   /* @ts-expect-error bad JSONB */ test_pattern: 169 } // non-string → coerced+shown
// EventDetailsBreakdown lists: Stage size, Podium, Polling, Keynote, Opening reel (URL-stripped), Test pattern=169
// and does NOT list a "diagrams" row; count === number of shown fields.
```

Assert against the breakdown's own `<ul>` (scope the query to the event-details `BreakdownSection` testId `wizard-step3-card-${dfid}-breakdown-event-details`) so a sibling section can't satisfy it.

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm vitest run tests/components/step3SheetCard.test.tsx -t "event details"`
Expected: FAIL — only Keynote + Opening reel currently render.

- [ ] **Step 3: Implement** — replace the field-building block in `EventDetailsBreakdown`:

```tsx
  const ed = eventDetails ?? {};
  const fields: { label: string; value: string }[] = [];
  for (const [key, label] of Object.entries(EVENT_DETAILS_LABELS)) {
    const text = String(ed[key] ?? "").trim();
    const value = key === "opening_reel" ? stripOpeningReelText(text).trim() : text;
    if (value.length > 0) fields.push({ label, value });
  }
```

Add `import { EVENT_DETAILS_LABELS } from "@/lib/crew/eventDetailsSpecs";` at the top. Keep the `BreakdownSection` wrapper, the `count={fields.length}`, and the "No event details parsed." empty state. Remove the now-dead `keynote`/`reel`/`hasContent` locals if unused elsewhere in the function (keep `stripOpeningReelText`).

- [ ] **Step 4: Run, verify pass**

Run: `pnpm vitest run tests/components/step3SheetCard.test.tsx -t "event details"`
Expected: PASS. `diagrams` absent (not in `EVENT_DETAILS_LABELS`); whitespace `notes` omitted; `169` shown.

- [ ] **Step 5: Commit**

```bash
git add components/admin/wizard/Step3SheetCard.tsx tests/components/step3SheetCard.test.tsx
git commit --no-verify -m "feat(admin): render all known event_details text specs in Step-3 review modal (BL-EVENT-DETAILS-UNRENDERED)"
```

---

## Task 4: DESIGN.md + cross-surface verification

**Files:** Modify `DESIGN.md`.

- [ ] **Step 1: DESIGN.md entry** — under the Gear section description, add a short "Tech specs" card entry: a full-width `SectionCard` in the Gear vertical stack listing show-level production specs (stage size, podium, polling, LED, etc.) via `KeyValueRows` with sentinel-hiding; `data-card-id="gear-tech-specs"`; SourceLink → DETAILS region. Match the surrounding DESIGN.md card-description style/heading level.

- [ ] **Step 2: Full cross-surface suite (blocking — no fallback)**

Run each, blocking:
```bash
pnpm vitest run tests/crew tests/components/crew
pnpm vitest run tests/components/step3SheetCard.test.tsx tests/components/admin
pnpm vitest run tests/components/tiles tests/help/_metaAffordanceMatrixParity.test.ts
pnpm typecheck
pnpm exec prettier --check lib/crew components/crew/sections/GearSection.tsx components/admin/wizard/Step3SheetCard.tsx lib/sheet-links/buildSheetDeepLink.ts DESIGN.md tests/crew tests/components/crew/gearTechSpecs.test.tsx
```
Expected: all PASS / clean. Record any consciously-skipped suite + reason (no silent swallow). `git diff --check main...HEAD` clean.

- [ ] **Step 3: Commit**

```bash
git add DESIGN.md
git commit --no-verify -m "docs(design): Tech specs card in Gear section (BL-EVENT-DETAILS-UNRENDERED)"
```

---

## Task 5: Impeccable v3 dual-gate (invariant 8)

**Files:** none (evaluation); possibly `DEFERRED.md`.

- [ ] **Step 1:** Run `/impeccable critique` on the affected UI diff (GearSection card + modal + DESIGN.md), with the canonical v3 preflight gates (PRODUCT.md → DESIGN.md → register → preflight signal).
- [ ] **Step 2:** Run `/impeccable audit` on the same diff.
- [ ] **Step 3:** Fix HIGH/CRITICAL findings, or defer via a `DEFERRED.md` entry. Re-run the touched tests after any fix.
- [ ] **Step 4:** Record critique + audit findings and their dispositions in the PR description (invariant-8 §12-equivalent for a standalone PR). Commit any fixes per-task.

---

## Task 6: Close-out — whole-diff review → CI → merge

- [ ] **Step 1:** Whole-diff cross-model review via `codex exec --sandbox read-only "<imperative reviewer prompt + inlined git diff main...HEAD>" < /dev/null` (companion app-server wedges — use codex exec, backgrounded, distinct verdict marker). Iterate to APPROVE; triage findings (land-now / DEFERRED.md / BACKLOG.md).
- [ ] **Step 2:** Push; `gh pr create`. PR body includes the impeccable dispositions (Task 5).
- [ ] **Step 3:** Confirm REAL CI green — `gh pr checks <PR#> --watch`; `mergeStateStatus == CLEAN`.
- [ ] **Step 4:** `gh pr merge <PR#> --merge`.
- [ ] **Step 5:** Fast-forward local main; verify `git rev-list --left-right --count main...origin/main` == `0  0`.
- [ ] **Step 6:** Mark `BL-EVENT-DETAILS-UNRENDERED` ✅ RESOLVED — PR #<n> in `BACKLOG.md` (before merge or as a tiny follow-up).

---

## Self-Review

- **Spec coverage:** Surface 1 → Task 2; Surface 2 → Task 3; shared module → Task 1; cross-cutting touchpoints (CARD_REGION_MAP → T2.S1; GENERIC_OPTIONAL_FIELDS → T2.S6; sourceLinkCoverage → T2.S7; affordance-matrix → T2.S9; DESIGN.md → T4.S1); guard conditions → T2.S2 (sentinel/non-string/excluded) + T3.S1 (diagrams/whitespace/non-string); whitelist completeness → T1.S1; impeccable → T5; close-out → T6. ✓
- **Dimensional invariants:** N/A (full-width stacked card) — no real-browser layout task, per spec. ✓
- **Anti-tautology:** integrity test asserts against `CANONICAL_KEY_MAP` (data source); modal test scopes to the event-details `BreakdownSection` testId; crew test scopes to the `gear-tech-specs` card; non-string asserts coerced-render (not hidden). Each test states its failure mode. ✓
- **Type consistency:** `EVENT_DETAILS_LABELS`/`CREW_TECH_SPEC_KEYS` names + `String(...).trim()` coercion + `gear-tech-specs` id consistent across Tasks 1-4. ✓
- **No placeholders:** every code step has real code; test steps reference the real harness (copy the neighbor GearSection/Step3 test fixtures at impl). ✓
