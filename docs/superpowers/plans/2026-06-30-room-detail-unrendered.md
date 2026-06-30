# Surface per-room detail — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Render the parsed-but-hidden per-room detail (`dimensions`, `floor`, `setup`, `set_time`, `show_time`, `strike_time`) on the crew page (a new room-first "Room details" card in GearSection) and in the Step-3 review modal, from one shared field/label list.

**Architecture:** Render-only. `lib/crew/roomDetailFields.ts` (`ROOM_DETAIL_FIELDS`) feeds (1) a crew GearSection card (sentinel-hidden via `KeyValueRows`) and (2) the modal `RoomsBreakdown` (shown as-parsed). No parser/DB/projection change; the only non-component edits are the shared module, one `CARD_REGION_MAP` line, and adding `export` to `compareRooms`.

**Tech Stack:** Next.js Server Components, TypeScript, Vitest + Testing Library. Spec: `docs/superpowers/specs/2026-06-30-room-detail-unrendered-design.md` (Codex-APPROVED, round 1).

## Global Constraints

- Touch only `lib/crew/`, `components/crew/sections/GearSection.tsx`, `components/admin/wizard/Step3SheetCard.tsx`, `lib/sheet-links/buildSheetDeepLink.ts`, `DESIGN.md`, `tests/**`. No `app/api`, DB, parser, migrations.
- UI surface → Opus + impeccable v3 dual-gate (invariant 8); dispositions in the PR description (+`DEFERRED.md` for deferrals).
- TDD per task; commit per task (`feat(crew-page):` / `feat(admin):` / `chore(sheet-links):` / `docs(design):`). `--no-verify`.
- Value coercion everywhere: compute `const value = String(r[key] ?? "").trim()` ONCE and use that same `value` for both the presence filter and the render (never render the raw `r[key]` / `r[key] as string` — that leaves non-string JSONB + whitespace padding un-coerced). Applies to BOTH surfaces.
- Per-surface filter differs ONLY in the predicate: crew HIDES sentinels (`!shouldHideGenericOptional(value)`); modal shows AS-PARSED (`value.length > 0`, the existing tested `Step3Review.test.tsx:582` contract — sentinels like `TBD`/`N/A` render). DO NOT apply `shouldHideGenericOptional` in the modal.
- Scope = exactly the six fields; `power`/`digital_signage`/`notes` are OUT (Decision 4).
- Worktree: `/Users/ericweiss/fxav-room-detail-unrendered` (branch `feat/room-detail-unrendered`). Run tests from worktree root.

---

## File Structure

- **Create** `lib/crew/roomDetailFields.ts` — `RoomDetailKey` + `ROOM_DETAIL_FIELDS` + compile-time `keyof RoomRow` assertion.
- **Create** `tests/crew/roomDetailFields.test.ts` — list integrity + scope-exclusion.
- **Modify** `lib/crew/resolveKeyTimes.ts:29` — add `export` to `compareRooms`.
- **Modify** `lib/sheet-links/buildSheetDeepLink.ts` — `"gear-room-details": "rooms"`.
- **Modify** `components/crew/sections/GearSection.tsx` — compute `roomDetailBlocks`/`hasRoomDetails`, add to `allHidden`, render the `gear-room-details` card.
- **Modify** `components/admin/wizard/Step3SheetCard.tsx` — extend `RoomsBreakdown` per-room `<li>` with the detail sub-list.
- **Modify** `tests/components/tiles/_metaSentinelHidingContract.test.ts` — forward-defense room-detail pattern.
- **Modify** `tests/components/crew/sourceLinkCoverage.test.tsx` — add `dimensions` to `fullFixture()`'s room.
- **Create** `tests/components/crew/gearRoomDetails.test.tsx` — crew card behavior.
- **Modify** `tests/components/step3SheetCard.test.tsx` (or `Step3Review.test.tsx`) — modal detail rows.
- **Modify** `DESIGN.md` — §13 Room details card.

---

## Task 1: Shared field/label list + integrity test

**Files:** Create `lib/crew/roomDetailFields.ts`, `tests/crew/roomDetailFields.test.ts`.

**Interfaces — Produces:** `RoomDetailKey` (union), `ROOM_DETAIL_FIELDS` (`readonly {key, label}[]`).

- [ ] **Step 1: Write the failing integrity test** — `tests/crew/roomDetailFields.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ROOM_DETAIL_FIELDS } from "@/lib/crew/roomDetailFields";

const EXPECTED = ["dimensions", "floor", "setup", "set_time", "show_time", "strike_time"];
// Fields that EXIST on RoomRow but are deliberately NOT in this list (Decision 4).
const EXCLUDED = [
  "power", "digital_signage", "notes", "audio", "video", "lighting",
  "scenic", "other", "name", "kind",
];

describe("ROOM_DETAIL_FIELDS", () => {
  it("lists exactly the six BL-ROOM-DETAIL keys, in order, distinct", () => {
    const keys = ROOM_DETAIL_FIELDS.map((f) => f.key);
    expect(keys).toEqual(EXPECTED);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every entry has a non-empty label", () => {
    for (const f of ROOM_DETAIL_FIELDS) expect(f.label.trim().length).toBeGreaterThan(0);
  });

  it("excludes the out-of-scope room fields (no scope creep)", () => {
    const keys = new Set(ROOM_DETAIL_FIELDS.map((f) => f.key));
    for (const k of EXCLUDED) expect(keys.has(k as never), `${k} must NOT be surfaced here`).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm vitest run tests/crew/roomDetailFields.test.ts`
Expected: FAIL — `Cannot find module '@/lib/crew/roomDetailFields'`.

- [ ] **Step 3: Implement** — `lib/crew/roomDetailFields.ts`:

```ts
import type { RoomRow } from "@/lib/parser/types";

/** The per-room detail keys surfaced by BL-ROOM-DETAIL-UNRENDERED. */
export type RoomDetailKey =
  | "dimensions"
  | "floor"
  | "setup"
  | "set_time"
  | "show_time"
  | "strike_time";

/**
 * Ordered display list for the crew "Room details" card AND the Step-3 review
 * modal — single source of truth so the two surfaces can't drift. Physical
 * detail first (where / how big / how set), then the per-room schedule.
 * Deliberately EXCLUDES power/digital_signage (AV-adjacent; show-level
 * event_details already surfaces them) and notes (TodaySection renders it).
 * (BL-ROOM-DETAIL-UNRENDERED)
 */
export const ROOM_DETAIL_FIELDS: readonly { key: RoomDetailKey; label: string }[] = [
  { key: "dimensions", label: "Dimensions" },
  { key: "floor", label: "Floor" },
  { key: "setup", label: "Setup" },
  { key: "set_time", label: "Set time" },
  { key: "show_time", label: "Show time" },
  { key: "strike_time", label: "Strike time" },
] as const;

// Compile-time guard: every key is a real RoomRow field.
const _keysAreRoomFields: readonly (keyof RoomRow)[] = ROOM_DETAIL_FIELDS.map((f) => f.key);
void _keysAreRoomFields;
```

- [ ] **Step 4: Run + typecheck**

Run: `pnpm vitest run tests/crew/roomDetailFields.test.ts` → PASS (3 tests).
Run: `pnpm typecheck` → clean (the `keyof RoomRow` assertion compiles only if all six are real fields).

- [ ] **Step 5: Commit**

```bash
git add lib/crew/roomDetailFields.ts tests/crew/roomDetailFields.test.ts
git commit --no-verify -m "feat(crew-page): shared ROOM_DETAIL_FIELDS list (BL-ROOM-DETAIL-UNRENDERED)"
```

---

## Task 2: Crew "Room details" card (GearSection) + wiring + meta-test

**Files:** Modify `lib/crew/resolveKeyTimes.ts`, `lib/sheet-links/buildSheetDeepLink.ts`, `components/crew/sections/GearSection.tsx`, `tests/components/tiles/_metaSentinelHidingContract.test.ts`, `tests/components/crew/sourceLinkCoverage.test.tsx`; Create `tests/components/crew/gearRoomDetails.test.tsx`.

**Interfaces — Consumes:** `ROOM_DETAIL_FIELDS` (Task 1); `compareRooms`, `roomLabel`, `KeyValueRows`/`KeyValueRow`, `SectionCard`, `SourceLink`, `shouldHideGenericOptional`, `CARD_REGION_MAP` (existing).

- [ ] **Step 1: Write the failing crew-card test** — `tests/components/crew/gearRoomDetails.test.tsx`. Mirror `tests/components/crew/gearTechSpecs.test.tsx` (same `renderGear` harness: `makeShowForViewer({ rooms, show })` → render `<GearSection data viewer today showId/>`; container-scoped queries). Assert:

```ts
// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { render, within } from "@testing-library/react";
import { GearSection } from "@/components/crew/sections/GearSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import type { ShowForViewer } from "@/lib/data/getShowForViewer";

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-rd";

function renderGear(rooms: ShowForViewer["rooms"]) {
  const data = makeShowForViewer({ rooms });
  const { container } = render(
    <GearSection data={data} viewer={{ kind: "crew", crewMemberId: "c1" }} today={TODAY} showId={SHOW_ID} />,
  );
  return container;
}

describe("GearSection — Room details card (BL-ROOM-DETAIL-UNRENDERED)", () => {
  test("renders per-room detail; hides sentinel rooms; coerces non-string; excludes out-of-scope", () => {
    const container = renderGear([
      // populated room:
      { id: "r1", kind: "gs", name: "Grand Ballroom",
        dimensions: "60' x 45'", floor: "8th Floor", setup: "18 tables of 7",
        set_time: "5/13 after 8pm", show_time: "8:15a", strike_time: "5/15 1pm",
        // out-of-scope + non-string:
        power: "100A", digital_signage: "2 screens", notes: "be careful",
        audio: "QU32" } as ShowForViewer["rooms"][number],
      // all-sentinel room → its block omitted:
      { id: "r2", kind: "breakout", name: "Lasalle", dimensions: "N/A", setup: "TBD", set_time: "" } as ShowForViewer["rooms"][number],
    ]);
    const card = container.querySelector<HTMLElement>('[data-testid="gear-room-details"]');
    expect(card, "room-details card renders").not.toBeNull();
    const r1 = within(container.querySelector<HTMLElement>('[data-testid="gear-room-detail-r1"]')!);
    expect(r1.getByText("Grand Ballroom")).toBeTruthy();
    expect(r1.getByText("Dimensions")).toBeTruthy();
    expect(r1.getByText("60' x 45'")).toBeTruthy();
    expect(r1.getByText("Setup")).toBeTruthy();
    expect(r1.getByText("Set time")).toBeTruthy();
    // out-of-scope fields never appear in the card:
    expect(within(card!).queryByText("100A")).toBeNull(); // power
    expect(within(card!).queryByText("2 screens")).toBeNull(); // digital_signage
    expect(within(card!).queryByText("be careful")).toBeNull(); // notes
    expect(within(card!).queryByText("QU32")).toBeNull(); // audio (gear, not detail)
    // all-sentinel room block omitted:
    expect(container.querySelector('[data-testid="gear-room-detail-r2"]')).toBeNull();
  });

  test("no card when no room has detail (empty + all-sentinel + no rooms)", () => {
    expect(renderGear([]).querySelector('[data-testid="gear-room-details"]')).toBeNull();
    const allSentinel = renderGear([
      { id: "r1", kind: "gs", name: "GS", dimensions: "N/A", floor: "TBD", setup: "" } as ShowForViewer["rooms"][number],
    ]);
    expect(allSentinel.querySelector('[data-testid="gear-room-details"]')).toBeNull();
  });

  test("non-string detail value coerces + shows (no throw)", () => {
    const container = renderGear([
      { id: "r1", kind: "gs", name: "GS", dimensions: 169 as unknown as string } as ShowForViewer["rooms"][number],
    ]);
    expect(within(container.querySelector<HTMLElement>('[data-testid="gear-room-detail-r1"]')!).getByText("169")).toBeTruthy();
  });

  test("cap: 13 rooms with detail → 12 blocks + overflow stub", () => {
    const rooms = Array.from({ length: 13 }, (_, i) =>
      ({ id: `r${i}`, kind: "breakout", name: `Room ${i}`, dimensions: `${i}0' x 20'` }) as ShowForViewer["rooms"][number]);
    const container = renderGear(rooms);
    expect(container.querySelectorAll('[data-testid^="gear-room-detail-"]').length).toBe(12);
    expect(within(container.querySelector<HTMLElement>('[data-testid="gear-room-details"]')!).getByText(/and 1 more room\b/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm vitest run tests/components/crew/gearRoomDetails.test.tsx`
Expected: FAIL — no `gear-room-details` testid. (TDD: test precedes ALL impl, incl. the export + CARD_REGION_MAP edits in Step 3.)

- [ ] **Step 3: Implement** (test-first done):

(a) `lib/crew/resolveKeyTimes.ts:29` — add `export`:
```ts
export function compareRooms(a: ProjectedRoomRow, b: ProjectedRoomRow): number {
```
(b) `lib/sheet-links/buildSheetDeepLink.ts` — in `CARD_REGION_MAP`, after `"gear-tech-specs": "details",`:
```ts
  "gear-room-details": "rooms",
```
(c) `components/crew/sections/GearSection.tsx` — imports:
- **MERGE `LayoutGrid` into the EXISTING `lucide-react` import** (it already imports `Boxes, Frame, Lightbulb, SlidersHorizontal, Video, Volume2`) — do NOT add a second `from "lucide-react"` line (`no-duplicate-imports` would fail). Result:
```ts
import { Boxes, Frame, LayoutGrid, Lightbulb, SlidersHorizontal, Video, Volume2 } from "lucide-react";
```
- Add the two new module imports:
```ts
import { ROOM_DETAIL_FIELDS } from "@/lib/crew/roomDetailFields";
import { compareRooms } from "@/lib/crew/resolveKeyTimes";
```
(`roomLabel`, `KeyValueRows`/`KeyValueRow`, `SectionCard`, `SourceLink`, `CARD_REGION_MAP`, `shouldHideGenericOptional` are already imported — verify; add only the missing ones.)

Compute after `hasTechSpecs` (~:213):
```ts
          // Per-room detail (BL-ROOM-DETAIL-UNRENDERED): physical + schedule
          // fields the parser captures but no card rendered. Room-first (a block
          // per room), distinct from the discipline-first scope cards. Sentinel-
          // hidden via KeyValueRows; String() coerces non-string JSONB.
          const ROOM_DETAIL_CAP = 12;
          const roomDetailBlocks = [...data.rooms]
            .sort(compareRooms)
            .map((r) => ({
              id: r.id,
              label: roomLabel(r),
              rows: ROOM_DETAIL_FIELDS.map((f) => ({ k: f.label, v: String(r[f.key] ?? "").trim() })),
            }))
            .filter((b) => b.rows.some((row) => !shouldHideGenericOptional(row.v)));
          const hasRoomDetails = roomDetailBlocks.length > 0;
          const shownRoomBlocks = roomDetailBlocks.slice(0, ROOM_DETAIL_CAP);
          const hiddenRoomCount = roomDetailBlocks.length - shownRoomBlocks.length;
```

Add to `allHidden` (:223-228) as a final condition:
```ts
          const allHidden =
            scopeCards.length === 0 &&
            !packVisible &&
            keynote === null &&
            !hasReel &&
            !hasTechSpecs &&
            !hasRoomDetails;
```

Render the card immediately AFTER the `gear-tech-specs` card block (after its `) : null}`, before the `gear-keynote` block):
```tsx
              {hasRoomDetails ? (
                <div data-testid="gear-room-details" data-card-id="gear-room-details">
                  <SectionCard
                    icon={<LayoutGrid size={14} strokeWidth={2} />}
                    title="Room details"
                    action={
                      <SourceLink
                        driveFileId={data.driveFileId}
                        anchor={data.sourceAnchors[CARD_REGION_MAP["gear-room-details"]]}
                      />
                    }
                  >
                    <div className="flex flex-col gap-4">
                      {shownRoomBlocks.map((b) => (
                        <div
                          key={b.id}
                          data-testid={`gear-room-detail-${b.id}`}
                          className="flex flex-col gap-1.5"
                        >
                          <p className="text-xs font-medium uppercase tracking-eyebrow text-text-subtle">
                            {b.label}
                          </p>
                          <KeyValueRows rows={b.rows} columns={2} />
                        </div>
                      ))}
                      {hiddenRoomCount > 0 ? (
                        <p className="text-sm text-text-subtle">
                          …and {hiddenRoomCount} more room{hiddenRoomCount === 1 ? "" : "s"}
                        </p>
                      ) : null}
                    </div>
                  </SectionCard>
                </div>
              ) : null}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm vitest run tests/components/crew/gearRoomDetails.test.tsx` → PASS (4 tests).
Run: `pnpm typecheck` → clean.

- [ ] **Step 5: Forward-defense sentinel meta-test** — `tests/components/tiles/_metaSentinelHidingContract.test.ts`, add before the closing `];` of `GENERIC_OPTIONAL_FIELDS`:

```ts
  // BL-ROOM-DETAIL-UNRENDERED: the crew "Room details" card surfaces these
  // RoomRow fields (GearSection). The card reads them via a dynamic loop over
  // ROOM_DETAIL_FIELDS (no literal access), so this pattern matches nothing
  // today — FORWARD-DEFENSE that fails CI if a future edit adds a direct
  // `r.dimensions`-style read in a walked component without sentinel-hiding.
  {
    description: "room detail (crew Room-details card)",
    pattern: /\br\??\.(dimensions|floor|setup|set_time|show_time|strike_time)\b/,
  },
```

- [ ] **Step 6: Make the source-link walker cover the card** — `tests/components/crew/sourceLinkCoverage.test.tsx`, in `fullFixture()`'s room (`:118-130`, already has set_time/show_time/strike_time so the card already renders) add `dimensions` for explicit coverage:
```ts
        dimensions: "20' x 30'",
```

- [ ] **Step 7: Run wiring/meta/coverage + affordance suites**

Run: `pnpm vitest run tests/components/tiles/_metaSentinelHidingContract.test.ts tests/components/crew/sourceLinkCoverage.test.tsx tests/components/crew/gearRoomDetails.test.tsx tests/help/_metaAffordanceMatrixParity.test.ts tests/help/_affordance-matrix-shape.test.ts tests/help/deep-link-walker-reverse.test.ts`
Expected: PASS. The meta-test passes (the new pattern matches no current file). The walker classifies `gear-room-details` (CARD_REGION_MAP key) + verifies its SourceLink href = `buildSheetDeepLink(driveFileId, sourceAnchors["rooms"])`. Affordance gate green (no help-affordance testid added — same as `gear-tech-specs`).

- [ ] **Step 8: Commit**

```bash
git add lib/crew/resolveKeyTimes.ts lib/sheet-links/buildSheetDeepLink.ts components/crew/sections/GearSection.tsx tests/components/tiles/_metaSentinelHidingContract.test.ts tests/components/crew/sourceLinkCoverage.test.tsx tests/components/crew/gearRoomDetails.test.tsx
git commit --no-verify -m "feat(crew-page): Room details card in GearSection (BL-ROOM-DETAIL-UNRENDERED)"
```

---

## Task 3: Step-3 review modal — per-room detail (as-parsed)

**Files:** Modify `components/admin/wizard/Step3SheetCard.tsx` (`RoomsBreakdown`, :328-368); modify a step3 test file.

**Interfaces — Consumes:** `ROOM_DETAIL_FIELDS` (Task 1), existing `hasContent` (:97).

- [ ] **Step 1: Write the failing modal test** — add to `tests/components/admin/wizard/Step3Review.test.tsx` (where room cases live, :516-571) or `tests/components/step3SheetCard.test.tsx`. A room with `setup`/`dimensions`/`set_time` + a sentinel `floor: "TBD"`:

```ts
// build a GEAR_ROW/stagedRow whose parseResult.rooms[0] has:
//   { kind:"gs", name:"Grand", dimensions:"60' x 45'", floor:"TBD", setup:"18 tables", set_time:"5/13 8pm", show_time:"   " }
// open the modal (fireEvent.click the -more button), then scope to the detail sub-list:
const detail = q.getByTestId(`wizard-step3-card-${DFID}-room-0-detail`).textContent ?? "";
expect(detail).toContain("Dimensions:");
expect(detail).toContain("60' x 45'");
expect(detail).toContain("Setup:");
expect(detail).toContain("Set time:");
expect(detail).toContain("Floor:");      // sentinel SHOWN as-parsed (review surface)
expect(detail).toContain("TBD");
expect(detail).not.toContain("Show time:"); // whitespace-only omitted (empty after trim)
```

Scope every assertion to the `-room-0-detail` testid (anti-tautology — a sibling scope/section can't satisfy it). Derive nothing from hardcoded counts.

- [ ] **Step 2: Run, verify it fails**

Run: `pnpm vitest run tests/components/admin/wizard/Step3Review.test.tsx -t "detail"` → FAIL (no detail sub-list).

- [ ] **Step 3: Implement** — `components/admin/wizard/Step3SheetCard.tsx`:

Add import: `import { ROOM_DETAIL_FIELDS } from "@/lib/crew/roomDetailFields";`

Inside the room `<li>` (after the scope `<ul>` block, before the `</li>`), add — **coerce once, render the computed value** (Codex plan-R1; matches the BL-EVENT-DETAILS modal pattern, not the raw `as string` scope render):
```tsx
                {(() => {
                  const detail = ROOM_DETAIL_FIELDS
                    .map((f) => ({ label: f.label, value: String(r[f.key] ?? "").trim() }))
                    .filter((d) => d.value.length > 0); // as-parsed: keep non-empty incl. sentinels
                  return detail.length > 0 ? (
                    <ul
                      data-testid={`wizard-step3-card-${dfid}-room-${i}-detail`}
                      className="mt-0.5 flex flex-col gap-0.5 pl-3 text-xs text-text-subtle"
                    >
                      {detail.map((d) => (
                        <li key={d.label} className="wrap-break-word">
                          <span className="font-medium text-text">{d.label}:</span> {d.value}
                        </li>
                      ))}
                    </ul>
                  ) : null;
                })()}
```
`String(r[f.key] ?? "").trim()` coerces non-string JSONB + strips whitespace padding (global constraint); filtering on `value.length > 0` (NOT `shouldHideGenericOptional`) keeps `TBD`/`N/A` visible as-parsed — the review-surface contract. `hasContent` is no longer used by this block (still used elsewhere in the file, so its import stays).

- [ ] **Step 4: Run, verify pass**

Run: `pnpm vitest run tests/components/admin/wizard/Step3Review.test.tsx tests/components/step3SheetCard.test.tsx` → PASS (incl. the new test + no regressions to the existing room-scope tests).
Run: `pnpm typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add components/admin/wizard/Step3SheetCard.tsx tests/components/admin/wizard/Step3Review.test.tsx
git commit --no-verify -m "feat(admin): per-room detail in Step-3 RoomsBreakdown (BL-ROOM-DETAIL-UNRENDERED)"
```

---

## Task 4: DESIGN.md + cross-surface verification

**Files:** Modify `DESIGN.md`.

- [ ] **Step 1: DESIGN.md §13** — add a "Room details" card entry mirroring §12's style: full-width `SectionCard` in the Gear vertical stack, `data-card-id="gear-room-details"`, `LayoutGrid` icon, room-first (a per-room block = `roomLabel` heading + `KeyValueRows columns={2}` of Dimensions/Floor/Setup/Set·Show·Strike time), sentinel-hidden, cap 12 + overflow stub, SourceLink → `rooms` region; present/absent states (instant, RSC).

- [ ] **Step 2: Full cross-surface suite (blocking)**

```bash
pnpm vitest run tests/crew tests/components/crew tests/components/admin tests/components/step3SheetCard.test.tsx tests/components/tiles tests/help/_metaAffordanceMatrixParity.test.ts
pnpm typecheck
pnpm exec prettier --check lib/crew components/crew/sections/GearSection.tsx components/admin/wizard/Step3SheetCard.tsx lib/sheet-links/buildSheetDeepLink.ts DESIGN.md tests/crew tests/components/crew/gearRoomDetails.test.tsx
pnpm exec eslint lib/crew/roomDetailFields.ts components/crew/sections/GearSection.tsx components/admin/wizard/Step3SheetCard.tsx
git diff --check main...HEAD
```
Expected: all PASS / clean. Record any consciously-skipped suite + reason.

- [ ] **Step 3: Commit**

```bash
git add DESIGN.md
git commit --no-verify -m "docs(design): Room details card in Gear section (§13) (BL-ROOM-DETAIL-UNRENDERED)"
```

---

## Task 5: Impeccable v3 dual-gate (invariant 8)

- [ ] **Step 1:** Deterministic detector — `npx impeccable --json components/crew/sections/GearSection.tsx components/admin/wizard/Step3SheetCard.tsx`.
- [ ] **Step 2:** `/impeccable critique` (Assessment A as an isolated fresh subagent — external attestation) on the diff, with the v3 preflight (PRODUCT.md → DESIGN.md → register → preflight).
- [ ] **Step 3:** `/impeccable audit` (isolated fresh subagent) on the diff.
- [ ] **Step 4:** Fix HIGH/CRITICAL or defer via `DEFERRED.md`; re-run touched tests after any fix. Record critique + audit findings + dispositions in the PR description.

---

## Task 6: Close-out — whole-diff review → CI → merge

- [ ] **Step 1:** Sync `origin/main` (merge in if it moved; re-verify the merged tree with the full cross-surface suite — the BL-EVENT-DETAILS lesson: run EVERY test file touching a shared component). Whole-diff cross-model review via `codex exec --sandbox read-only "<imperative reviewer prompt + git diff origin/main...HEAD>" < /dev/null` (companion wedges → codex exec; distinct verdict marker; do-not-relitigate preempt: modal-shows-sentinels-as-parsed is the existing tested contract). Iterate to APPROVE.
- [ ] **Step 2:** Push; `gh pr create` (body includes impeccable dispositions). If a new card changes a crew screenshot, regen `crew-preview-gear-mobile-{dark,light}.webp` from the CI `drifted-screenshots` artifact (pinned amd64 image), NOT the arm64 host.
- [ ] **Step 3:** Confirm REAL CI green — `gh pr checks <PR#> --watch`; `mergeStateStatus == CLEAN`. Re-run flaky non-deterministic failures with `gh run rerun --failed`.
- [ ] **Step 4:** `gh pr merge <PR#> --merge`.
- [ ] **Step 5:** Fast-forward local main; verify `git rev-list --left-right --count main...origin/main` == `0  0`.
- [ ] **Step 6:** Mark `BL-ROOM-DETAIL-UNRENDERED` ✅ RESOLVED — PR #<n> in `BACKLOG.md` (tiny follow-up chore PR, per precedent).

---

## Self-Review

- **Spec coverage:** shared list → T1; crew card → T2; modal → T3; cross-cutting (compareRooms export → T2.S3a; CARD_REGION_MAP → T2.S3b; GENERIC_OPTIONAL_FIELDS → T2.S5; sourceLinkCoverage → T2.S6; affordance gate → T2.S7; DESIGN.md → T4); guard conditions → T2.S1 (sentinel/non-string/out-of-scope/cap) + T3.S1 (as-parsed/whitespace); impeccable → T5; close-out → T6. ✓
- **Dimensional invariants:** N/A (full-width stacked card) — no real-browser layout task, per spec. ✓
- **Anti-tautology:** integrity test asserts against the expected key list + RoomRow exclusion; crew test scopes to `gear-room-detail-<id>` + asserts out-of-scope fields absent + non-string coerces + cap derived from fixture length; modal test scopes to `-room-0-detail` + asserts sentinel SHOWN (the review-contract failure mode) + whitespace omitted. Each test states its failure mode. ✓
- **Type/name consistency:** `ROOM_DETAIL_FIELDS`/`RoomDetailKey`, `gear-room-details`/`gear-room-detail-<id>`, `String(...).trim()`, `compareRooms` export — consistent across Tasks 1-4. ✓
- **No placeholders:** every code step has real code; test steps reference the real `gearTechSpecs`/`Step3Review` harnesses. ✓
