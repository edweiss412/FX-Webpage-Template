# Surface per-room detail (dimensions / floor / setup / per-room times) — Design Spec

**BL:** `BL-ROOM-DETAIL-UNRENDERED` (INFO-tab audit finding M1). **Routing:** UI → Opus + impeccable v3 dual-gate (AGENTS.md invariant 8). **Class:** PARSED-NOT-RENDERED. **Render-only** — no parser / DB / projection change.

## Goal

Surface the per-room physical + schedule detail the parser already captures but no component renders — `room.dimensions`, `room.floor`, `room.setup`, and per-room `set_time` / `show_time` / `strike_time` — on (1) the crew page (a new room-first "Room details" card in GearSection) and (2) the Step-3 review modal (extend the per-room breakdown). One shared field/label list feeds both surfaces.

## Background / live grounding

`RoomRow` (`lib/parser/types.ts:155-172`) carries 16 fields; `ProjectedRoomRow = RoomRow & { id: string }` (`lib/crew/resolveKeyTimes.ts:6`) is what `ShowForViewer.rooms` exposes (`lib/data/getShowForViewer.ts:142`), and all 16 survive the projection (`getShowForViewer.ts:468-486`). The crew page renders only 7 of them: `name` (via `roomLabel`), `audio`, `video`, `lighting`, `scenic`, `other` (GearSection discipline cards, `GearSection.tsx:81-120,155-160`), plus `notes` folded into TodaySection's aggregated notes feed (`TodaySection.tsx:119-124`). **Unrendered anywhere:** `dimensions`, `floor`, `setup`, `set_time`, `show_time`, `strike_time`, `power`, `digital_signage`.

Live verification (gsheets MCP, 2026-06-30) confirms real yield:

- **East Coast** (`1N1PKmhcvLAn5UwHLn4Rplm1yeVeYMvwfL3eOzB4McnY`, INFO-layout): room headers carry inline dimensions (`MABEL 1\nAPPROXIMATELY 60' x 45'`), `GS Setup: 18 Tables of 7ppl`, `GS Set Time: 5/13 - AFTER 8PM`, `GS Strike Time: 5/15 - 1PM`, breakouts `BO Setup/Set/Strike: TBD`. All present and populated.
- **Consultants** (`1XQ44uxc44pToYxQnYw4OG9V6DjE7bC5EU08o5iFpxz4`, GEAR-layout): rooms via single-line GEAR headers, no per-room setup/dimensions strings; per-room times absent → all these fields sentinel-empty for this show → the card hides.

Both layouts must be handled by the render: surface whatever is present, hide (crew) / show-as-parsed (modal) what is absent. The parser produces these fields on both layouts where they exist (pinned: `tests/parser/exporterFixtures.test.ts:1142-1166` east-coast GS `dimensions "60' x 45'"`; `:1178-1208` inline `GENERAL SESSION` header → `{name,dimensions,floor}`). **No parser change** (the GS-dimensions standalone-row backfill was investigated and DROPPED — `docs/superpowers/specs/2026-06-29-parser-info-tab-fidelity-design.md:125-127`; GS dims are inline and already parsed).

## Resolved Decisions

1. **Render-only.** No change to `lib/parser/**`, `supabase/**`, or `getShowForViewer.ts` (no parser/DB/projection change). The new render consumes existing `data.rooms` fields. The only non-component edits are: the new `lib/crew/roomDetailFields.ts` module, one `CARD_REGION_MAP` line, and adding `export` to the existing private `compareRooms` comparator (`lib/crew/resolveKeyTimes.ts:29` — non-breaking, reuses canonical room ordering, no logic change).

2. **Host: GearSection (crew) + Step3SheetCard RoomsBreakdown (review).** GearSection is the only crew section with the `data.rooms` path (`GearSection.tsx:52,156`); VenueSection reads zero room fields and would need a fresh data path. The BL says "crew Gear/Venue" — Gear is the lower-friction, precedent-matching home (PR#195 added the `gear-tech-specs` card to GearSection the same way). The review modal extends the existing `RoomsBreakdown` per-room `<li>` (`Step3SheetCard.tsx:328-368`).

3. **Room-first card model (NEW shape), not discipline-first.** GearSection's existing cards are discipline-first (one `gear-scope-*` card per A/V/L/scenic/other, rooms as rows within). `dimensions`/`floor`/`setup`/times are room ATTRIBUTES, so the new card is room-first: one "Room details" card whose body is a per-room block (room name heading + that room's detail rows). This is a new visual group, deliberately distinct from the discipline cards.

4. **Scope = exactly the BL's six fields.** `dimensions`, `floor`, `setup`, `set_time`, `show_time`, `strike_time`. **Explicitly OUT of scope:** `room.power` and `room.digital_signage` (not in the BL list; AV-adjacent gear; `digital_signage` + `power` already surface at the SHOW level via `event_details` rendered in VenueSection/Tech-specs, so per-room duplication would confuse), and `room.notes` (already rendered in TodaySection's aggregated feed — rendering it again here would duplicate).

5. **Sentinel handling differs by surface (mirrors the BL-EVENT-DETAILS contract).** Crew card HIDES sentinels (every value routed through `KeyValueRows`, which filters via `shouldHideGenericOptional` — `KeyValueRows.tsx:59`; `GENERIC_OPTIONAL_HIDE` covers `""`/`TBD`/`N/A`/`TBA`/`-`/`—`). The Step-3 review modal shows values AS-PARSED including sentinels (the existing, tested review-surface contract — `Step3SheetCard.tsx:84-87`, `tests/components/admin/wizard/Step3Review.test.tsx:582`). For crew, per-room times use the SAME `shouldHideGenericOptional` predicate (it already strips `TBD`/`N/A`/`TBA`, the same sentinels `isAbsentTime` strips — `resolveKeyTimes.ts:21-26`), so one predicate covers both physical and time fields on the crew surface; no need to import `isAbsentTime`.

6. **Per-room times are additive to the show-level KeyTimesStrip, not a duplicate.** The strip (`today-key-times` / `schedule-call-times`) shows ONE selected room's times as a show-level summary (`resolveKeyTimes.ts:100-124`). The Room-details card shows EACH room's raw `set_time`/`show_time`/`strike_time` labeled per room — the per-room breakdown (breakouts often differ). Different framing; not relitigated as duplication.

7. **Shared field/label list.** `lib/crew/roomDetailFields.ts` exports `ROOM_DETAIL_FIELDS: readonly { key: RoomDetailKey; label: string }[]` (one ordered source of truth for both surfaces) where `RoomDetailKey` is a union of the six `keyof RoomRow` keys. Both surfaces iterate this list; only the per-surface filter differs.

## Shared module — `lib/crew/roomDetailFields.ts`

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
 * detail first (where/how big/how set), then the per-room schedule.
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

## Surface 1 — crew "Room details" card (GearSection)

A new full-width `SectionCard` in GearSection's vertical stack (`flex flex-col gap-4` root), a peer of the `gear-tech-specs` / keynote / opening-reel cards (NOT in the 3-up discipline grid). `data-testid` + `data-card-id="gear-room-details"`; icon `LayoutGrid` (lucide, `size={14} strokeWidth={2}` — matches the sibling icon idiom); title "Room details"; header `SourceLink` → the `rooms` region.

**Per-room build (room-first):**

```tsx
import { LayoutGrid } from "lucide-react";
import { ROOM_DETAIL_FIELDS } from "@/lib/crew/roomDetailFields";
import { compareRooms } from "@/lib/crew/resolveKeyTimes"; // requires adding `export` to the existing comparator (resolveKeyTimes.ts:29)
import { roomLabel } from "@/lib/visibility/roomLabel";

// ...inside the section body, alongside the other card computations:
const ROOM_DETAIL_CAP = 12;
const roomDetailBlocks = [...data.rooms]
  .sort(compareRooms)
  .map((r) => ({
    id: r.id,
    label: roomLabel(r),
    rows: ROOM_DETAIL_FIELDS.map((f) => ({
      k: f.label,
      v: String(r[f.key] ?? "").trim(),
    })),
  }))
  .filter((b) => b.rows.some((row) => !shouldHideGenericOptional(row.v)));
const hasRoomDetails = roomDetailBlocks.length > 0;
const shownRoomBlocks = roomDetailBlocks.slice(0, ROOM_DETAIL_CAP);
const hiddenRoomCount = roomDetailBlocks.length - shownRoomBlocks.length;
```

Render (only when `hasRoomDetails`):

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
          <div key={b.id} data-testid={`gear-room-detail-${b.id}`} className="flex flex-col gap-1.5">
            <p className="text-xs font-medium tracking-eyebrow text-text-subtle uppercase">{b.label}</p>
            <KeyValueRows rows={b.rows} columns={2} />
          </div>
        ))}
        {hiddenRoomCount > 0 ? (
          <p className="text-sm text-text-subtle">…and {hiddenRoomCount} more room{hiddenRoomCount === 1 ? "" : "s"}</p>
        ) : null}
      </div>
    </SectionCard>
  </div>
) : null}
```

- Add `hasRoomDetails` to GearSection's `allHidden` gate so an all-empty Gear section still renders its EmptyState (the plan's pre-draft pass pins the exact `allHidden` line and the card insertion point).
- `KeyValueRows columns={2}` packs the short detail fields; collapses to 1 column < 720px (`KeyValueRows.tsx`). Each row sentinel-hidden by `KeyValueRows` → a room block with all-empty detail is dropped by the `.filter`; the whole card hidden when no room has detail.
- `roomLabel(r)` (`lib/visibility/roomLabel.ts:26-31`) supplies the per-room heading. `compareRooms` (`resolveKeyTimes.ts:29-36`) sorts gs-first.

## Surface 2 — Step-3 review modal (RoomsBreakdown)

Extend each room `<li>` in `RoomsBreakdown` (`Step3SheetCard.tsx:344-360`) to render the six detail fields AS-PARSED (review surface — sentinels visible), as a new sub-list parallel to the existing scope sub-list. New testid `wizard-step3-card-${dfid}-room-${i}-detail`.

```tsx
// after the existing scope sub-list inside the room <li>:
const detail = ROOM_DETAIL_FIELDS
  .map((f) => ({ label: f.label, value: String(r[f.key] ?? "").trim() }))
  .filter((d) => d.value.length > 0); // as-parsed: keep non-empty incl. sentinels
{detail.length > 0 ? (
  <ul data-testid={`wizard-step3-card-${dfid}-room-${i}-detail`} className="...">
    {detail.map((d) => (
      <li key={d.label}><span className="font-medium ...">{d.label}:</span> {d.value}</li>
    ))}
  </ul>
) : null}
```

- Gate on `value.length > 0` (NOT `shouldHideGenericOptional`) so `TBD`/`N/A` show as-parsed, matching the existing room scope sub-list + the `Step3Review.test.tsx:582` contract. `String(...).trim()` is null/non-string-safe and prevents whitespace inflating the list.
- `ROOMS_CAP` (20, `Step3SheetCard.tsx:73`) and the overflow note are unchanged.

## Guard conditions (every input)

- `data.rooms` empty `[]` → no blocks → `hasRoomDetails` false → crew card omitted; modal RoomsBreakdown already renders "No rooms parsed." (`Step3SheetCard.tsx:338`).
- A room with every detail field null/empty/sentinel → that room block omitted (crew) / no detail sub-list for that room (modal).
- A non-string JSONB value (`r[key]` a number/object) → `String(...)` coerces, no throw; renders the coerced text (crew shows if non-sentinel; modal shows as-parsed). Matches the BL-EVENT-DETAILS coerce-then-check precedent.
- `r[key]` whitespace-only → `.trim()` → `""` → hidden on both surfaces.
- `data.driveFileId` null → `SourceLink` renders null (its existing contract) — card still renders its rows; the sourceLinkCoverage walker treats unmapped/null-drive correctly.
- More than `ROOM_DETAIL_CAP` (12) rooms WITH detail → first 12 shown (compareRooms order), then `…and N more rooms` stub. (Real shows carry ≤ ~9 rooms; cap never realistically hit but bounds the card.)

## Dimensional invariants

The "Room details" card is a **full-width card in the GearSection vertical `flex flex-col` stack** — no fixed-height parent, no same-row sibling to match, no grid. Per-room blocks stack vertically (`flex flex-col gap-4`); `KeyValueRows columns={2}` is the primitive's own responsive grid (collapses to 1 col < 720px) and is unchanged by this card. **No new parent→child fixed-dimension relationship is introduced**, so (per the Tailwind-v4 no-default-`items-stretch` rule) there is nothing to assert with a real-browser layout test beyond what `KeyValueRows` already guarantees. N/A — documented explicitly.

## Transition inventory

The card is pure server-rendered output (RSC); it has exactly two states — **present** (≥1 room has ≥1 non-sentinel detail field) and **absent** (none) — and the transition between them happens only via a fresh render (data change), never client-side. No `AnimatePresence`, ternary-animated, or conditional-motion element is introduced. §5 motion does not apply. Instant — no animation needed.

## Cross-cutting touchpoints (mandatory)

- `lib/crew/resolveKeyTimes.ts`: add `export` to the existing private `compareRooms` comparator (`:29`) — non-breaking, no logic change; the crew card reuses it for canonical (gs-first) room ordering, matching the KeyTimesStrip's room selection.
- `lib/sheet-links/buildSheetDeepLink.ts`: add `"gear-room-details": "rooms"` to `CARD_REGION_MAP` (region `rooms` already exists, `:35` / `:96-105`; `gear-scope-*` already map to it, `:146-150`). `CardId` union widens automatically.
- `tests/components/crew/sourceLinkCoverage.test.tsx`: `fullFixture()`'s room (`:118-130`) already carries `set_time`/`show_time`/`strike_time`; add `dimensions`/`floor`/`setup` so the `gear-room-details` card renders and the walker classifies it + verifies its SourceLink href = `buildSheetDeepLink(driveFileId, sourceAnchors["rooms"])`.
- `tests/components/tiles/_metaSentinelHidingContract.test.ts`: add a forward-defense `GENERIC_OPTIONAL_FIELDS` pattern for direct room-detail reads, e.g. `/\br\??\.(dimensions|floor|setup|set_time|show_time|strike_time)\b/` (the card reads `r[f.key]` dynamically, so the literal pattern matches nothing today — forward-defense against a future direct literal read in a walked component, exactly as the BL-EVENT-DETAILS pattern was framed). The host file imports `shouldHideGenericOptional` (used in the `hasRoomDetails` filter) so it stays compliant.
- Affordance-matrix gate (`tests/help/_metaAffordanceMatrixParity.test.ts` + siblings): help-affordance-testid based, not crew-card-id based → N/A (same as the `gear-tech-specs` card); verify it stays green.
- `DESIGN.md`: add a "Room details" card entry (§13) mirroring §12's style.
- Invariant 8: `/impeccable critique` + `/impeccable audit` on the diff; HIGH/CRITICAL fixed or `DEFERRED.md`; dispositions recorded in the PR description.

## Meta-test inventory

- **Extends** `tests/components/tiles/_metaSentinelHidingContract.test.ts` (`GENERIC_OPTIONAL_FIELDS`) — forward-defense room-detail pattern (above).
- **Extends** `tests/components/crew/sourceLinkCoverage.test.tsx` — fixture gains room detail fields; the walker auto-covers the new `gear-room-details` card via `CARD_REGION_MAP`.
- **Creates** no new structural meta-test (no auth/DB/advisory-lock/admin-alert surface). The shared-list integrity is pinned by the compile-time `keyof RoomRow` assertion in `roomDetailFields.ts` + a small unit test.
- Advisory-lock topology: N/A (no `pg_advisory*` touched). Supabase call-boundary: N/A (no Supabase client calls added).

## Test plan

1. **Shared list integrity** (`tests/crew/roomDetailFields.test.ts`): assert `ROOM_DETAIL_FIELDS` keys are exactly the six expected, are distinct, and (via the compile-time assertion + a runtime check) are all `keyof RoomRow`; assert `power`/`digital_signage`/`notes`/`audio`/`video`/`lighting`/`scenic`/`other`/`name`/`kind` are NOT in the list (scope guard). Failure mode caught: scope drift / a typo'd key that isn't a RoomRow field.
2. **Crew card renders per-room detail** (`tests/components/crew/gearRoomDetails.test.tsx`): two rooms, one with `dimensions`/`floor`/`setup`/`set_time` populated + one all-sentinel; assert the populated room's block renders (labels + values, scoped to `gear-room-detail-<id>`), the sentinel room's block is absent, a non-string `dimensions` (number) coerces+shows, and a value-`"N/A"` field is hidden. Container-scoped queries (RTL `render` binds to body — scope to `container` to avoid sibling leakage, per the BL-EVENT-DETAILS lesson).
3. **Crew card hidden when no room has detail** (same file): all rooms all-sentinel (or `data.rooms: []`) → `queryByTestId("gear-room-details")` null, no throw; and `event_details`-less / rooms-with-only-gear → card absent.
4. **Crew cap + overflow**: 13 rooms each with a real `dimensions` → 12 blocks rendered + `…and 1 more room` stub. Derive the expected count from the fixture length, never hardcode.
5. **Modal renders per-room detail as-parsed** (`tests/components/step3SheetCard.test.tsx` or `Step3Review.test.tsx`): a room with `setup`/`dimensions`/`set_time` + a sentinel `floor: "TBD"` → the `room-<i>-detail` sub-list shows all of them INCLUDING `Floor: TBD` (as-parsed); whitespace-only omitted; scoped to the detail sub-list testid (anti-tautology). Failure mode caught: sentinel-hiding wrongly applied to the review surface (the exact bug that bit BL-EVENT-DETAILS).
6. **sourceLinkCoverage walker** + **_metaSentinelHidingContract** green after the fixture + pattern additions.

## Out of scope / deferred

- `room.power`, `room.digital_signage`, per-room `room.notes` (Decision 4).
- Re-pointing the show-level `KeyTimesStrip` to be per-room (Decision 6 — the strip stays a show-level summary).
- Any parser/projection change (render-only).
