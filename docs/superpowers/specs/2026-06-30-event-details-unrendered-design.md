# Surface technical DETAILS specs to crew + operator — design spec

**Date:** 2026-06-30
**Slug:** event-details-unrendered
**Backlog:** `BL-EVENT-DETAILS-UNRENDERED` · audit finding **H3** (`docs/info-tab-fidelity-audit-2026-06-29.md`)
**Routing:** UI → Opus + **impeccable v3 dual-gate** (AGENTS.md invariant 8) required before cross-model review.

## Problem

The parser captures all 21 `event_details` canonical keys (`lib/parser/blocks/event.ts` `CANONICAL_KEY_MAP`), but only **5** reach the crew page — `dress_code` (TodaySection), `internet`+`power` (VenueSection Facilities), `keynote_requirements`+`opening_reel` (GearSection) — and the Step-3 review modal renders only **2** (`keynote_requirements`+`opening_reel`, hard-coded in `EventDetailsBreakdown`, `components/admin/wizard/Step3SheetCard.tsx:372-396`). No component iterates the `event_details` map. So show-critical specs the crew need on-site — **Stage size, GS Podium, Polling, LED, Backdrop/Scenic, Equipment Storage, Test Pattern, Fonts** (+ Gooseneck, Digital Signage, Staff Office, Recording, Virtual Speaker/Audience, Notes) — are parsed-and-stored but rendered nowhere, and the operator can't verify them at the publish gate.

## Goal

Surface the captured-but-hidden `event_details` specs on two surfaces, from a single shared whitelist:
1. **Crew page** — a new "Tech specs" card in GearSection rendering the crew-relevant specs (sentinel-hidden).
2. **Step-3 review modal** — extend `EventDetailsBreakdown` to render **all** non-empty known `event_details` keys so the operator sees the full picture pre-publish.

No DB / parser / migration changes — the data already flows through `getShowForViewer` (`event_details: eventDetailsDecoded ?? {}`, `lib/data/getShowForViewer.ts:358`) and into `EventDetailsBreakdown`'s `eventDetails` prop. This is render-only.

---

## Resolved decisions (preempt review relitigation)

1. **Crew card lives in GearSection, not VenueSection.** The unrendered specs are production/AV specs (stage, podium, LED, scenic, test pattern, fonts, gooseneck, digital signage, recording, virtual). GearSection is the production section and already carries the production specs `keynote_requirements`+`opening_reel`; VenueSection's "Facilities" stays location-oriented (address, dock, parking, Wi-Fi, power). Equipment Storage / Staff Office are logistics-adjacent but kept in the one Tech-specs card to avoid scattering a 1–2-row list across sections.
2. **Single shared whitelist module** `lib/crew/eventDetailsSpecs.ts` (closed-vocab) — `EVENT_DETAILS_LABELS` (canonical key → display label for every known key) + `CREW_TECH_SPEC_KEYS` (ordered crew subset). Both surfaces import it, so the crew card and the modal can't drift, and PII/financial/unknown keys (no entry) are structurally never rendered.
3. **Crew card EXCLUDES keys already rendered elsewhere** (`dress_code`, `internet`, `power`, `keynote_requirements`, `opening_reel`) and `diagrams` (a folder link consumed by the Diagrams surface, not a text spec). No double-rendering.
4. **Sentinel handling differs by surface, intentionally.** Crew card hides sentinels (`shouldHideGenericOptional`, inherited from `KeyValueRows`) so the crew see only real values. The operator modal shows every **non-empty** known key (`hasContent`, matching the existing `EventDetailsBreakdown` behavior that already shows `keynote="TBD"`) so the operator can verify the raw parsed state — including `TBD`/`N/A` — at the publish gate.
5. **The card gets a `data-card-id="gear-tech-specs"` + SourceLink to the `details` region**, mirroring `gear-keynote`/`gear-opening-reel` (both → `"details"`, `lib/sheet-links/buildSheetDeepLink.ts:152-153`). This requires the cross-cutting card-id touchpoints below.
6. **No DB / parser / migration / advisory-lock / error-code changes.** Render-only.

---

## Surface 1 — Crew "Tech specs" card (GearSection)

**File:** `components/crew/sections/GearSection.tsx` (+ icon if used).

`CREW_TECH_SPEC_KEYS` (ordered, crew-impact first):
`stage_size, podium_type, polling, led, scenic, gooseneck, digital_signage, test_pattern, fonts, equipment_storage, staff_office_room, record, virtual_speaker, virtual_audience, notes`.

Build `KeyValueRow[]` from these: `{ k: EVENT_DETAILS_LABELS[key], v: (data.show.event_details[key] ?? "").trim() }`. `KeyValueRows` omits any row whose `v` is empty/sentinel (`shouldHideGenericOptional`, per its contract `components/crew/primitives/KeyValueRows.tsx:1-15`), so no per-row guard is needed in the card.

**Card render guard:** compute `hasTechSpecs = rows.some((r) => !shouldHideGenericOptional(r.v))`. Render the `SectionCard` (title "Tech specs", `data-card-id="gear-tech-specs"`, SourceLink → `data.sourceAnchors[CARD_REGION_MAP["gear-tech-specs"]]`) wrapping `<KeyValueRows rows={rows} />` ONLY when `hasTechSpecs`. Add `hasTechSpecs` to GearSection's existing `allHidden` gate (`GearSection.tsx:211`) so the whole section still hides when nothing (incl. tech specs) is present.

**Placement:** in the same card grid as the keynote/opening-reel cards (production specs grouped). The `SectionCard` is `h-full` and fills its grid cell exactly as the sibling keynote card does.

---

## Surface 2 — Step-3 review modal (EventDetailsBreakdown)

**File:** `components/admin/wizard/Step3SheetCard.tsx` (`EventDetailsBreakdown`, ~:372-396).

Replace the hard-coded keynote+reel push with an iteration over `EVENT_DETAILS_LABELS` (insertion order), pushing `{ label, value }` for every key whose value `hasContent`. `opening_reel` keeps its `stripOpeningReelText` cleanup. Result: the operator sees **all** non-empty known event-details fields (keynote, opening reel, stage size, podium, polling, LED, scenic, internet, power, dress, …), not just 2. The empty-state ("No event details parsed.") and `count` stay; `count` now reflects the full field count.

`EVENT_DETAILS_LABELS` includes the keys already shown elsewhere on the crew page (`internet`, `power`, `dress_code`, `keynote_requirements`, `opening_reel`) because the modal is the operator's single pre-publish view — it should show everything, unlike the crew card which de-dups.

---

## Shared module — `lib/crew/eventDetailsSpecs.ts`

```ts
// Canonical event_details key → human display label (closed-vocab whitelist).
// Single source of truth for the crew Tech-specs card AND the Step-3 modal.
// Keys with NO entry here (PII/financial/unknown, and `diagrams`) never render.
export const EVENT_DETAILS_LABELS: Record<string, string> = {
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
};

// Ordered crew Tech-specs card subset — EXCLUDES keys rendered on other crew
// surfaces (dress→Today, internet/power→Venue, keynote/opening_reel→Gear) and
// `diagrams` (folder link). Crew-impact first.
export const CREW_TECH_SPEC_KEYS: readonly string[] = [
  "stage_size", "podium_type", "polling", "led", "scenic", "gooseneck",
  "digital_signage", "test_pattern", "fonts", "equipment_storage",
  "staff_office_room", "record", "virtual_speaker", "virtual_audience", "notes",
];
```

A meta-style unit test asserts every `CREW_TECH_SPEC_KEYS` entry has an `EVENT_DETAILS_LABELS` label and is NOT one of the already-rendered keys, and that every label-map key is a real `CANONICAL_KEY_MAP` value (so the whitelist can't drift from the parser's vocabulary).

---

## Cross-cutting touchpoints (new `gear-tech-specs` card-id)

A new crew card-id must be wired through the same surfaces every other card-id is, or a CI gate fails. The plan's pre-draft pass MUST verify each:
- **`CARD_REGION_MAP`** (`lib/sheet-links/buildSheetDeepLink.ts`): add `"gear-tech-specs": "details"`.
- **Affordance matrix** (`affordance-matrix-parity` CI gate): if the gate enumerates card-ids, add the `gear-tech-specs` entry alongside `gear-keynote`.
- **Source anchors** (`lib/drive/sourceAnchors.ts` / `CARD_REGION_MAP` RegionId type): confirm `"details"` region already resolves an anchor (it does for keynote) — no new region needed.
- **`sourceLinkCoverage` test** (`tests/components/crew/sourceLinkCoverage.test.tsx`): may enumerate every card-id's SourceLink — add `gear-tech-specs` if so.
- **DESIGN.md**: add a "Tech specs" card entry under the Gear section description (UI surface → invariant 8 includes DESIGN.md).

---

## Guard conditions

- `event_details` `undefined`/`{}` → no rows → `hasTechSpecs` false → card not rendered; modal shows "No event details parsed." (existing).
- All crew spec keys sentinel/empty → card not rendered (no empty card).
- A single sentinel value (e.g. `record: "N/A"`) → that row omitted by `KeyValueRows`; modal: omitted by `hasContent` only if empty, shown if `N/A` (operator-raw, by decision 4).
- Unknown/PII key present in `event_details` → no label → never rendered (closed-vocab).
- `opening_reel` value that is purely a URL → `stripOpeningReelText` may yield empty → omitted (existing behavior preserved).

## Dimensional invariants

- The "Tech specs" `SectionCard` sits in GearSection's card grid; like the sibling keynote `SectionCard` it must be `h-full` and fill its grid cell (this project's Tailwind v4 does not default `.flex`/grid children to stretch — `feedback_tailwind_v4_flex_items_stretch`). Invariant: `gear-tech-specs` card height === its grid-cell/row height. Verified by a real-browser layout assertion in the plan (jsdom insufficient).

## Transition inventory

The card is a Server Component with no client state. States: (a) present (≥1 real spec) → card shown; (b) absent (none) → card not in the tree. The transition between (a)/(b) only occurs across a fresh server render (data change → `router.refresh` via the existing ShowRealtimeBridge), not a client animation. **Instant — no client-side transition; no `AnimatePresence`/ternary-with-exit needed.** No compound transitions (single independent visibility gate).

## Meta-test inventory

- **N/A** for `_metaInfraContract` (no Supabase calls), admin-alert catalog (none), advisory-lock topology (none), and `_metaSentinelHidingContract` (it walks `components/tiles/`; this card is in `components/crew/sections/` and inherits hiding from the already-covered `KeyValueRows` primitive).
- **Creates:** the `eventDetailsSpecs` whitelist-integrity unit test (above).

## Test plan (failure-mode-first)

1. **Shared whitelist integrity** (`lib/crew/eventDetailsSpecs.ts`): every `CREW_TECH_SPEC_KEYS` has a label; none is an already-rendered key (`dress_code`/`internet`/`power`/`keynote_requirements`/`opening_reel`) or `diagrams`; every `EVENT_DETAILS_LABELS` key ∈ `Object.values(CANONICAL_KEY_MAP)`. Catches: whitelist drift from the parser vocab; accidental double-render key.
2. **Crew card renders real specs** (GearSection component test): fixture `event_details` with `stage_size`, `podium_type`, `polling` real → card shows those labels+values; `record: "N/A"` → that row absent (sentinel-hidden); a key already shown elsewhere (`power`) → NOT in the tech-specs card. Catches: missing render; sentinel leak; double-render.
3. **Crew card hidden when all-sentinel/empty**: `event_details` all-`N/A` (for the spec keys) → no `gear-tech-specs` card in the tree, and (if it's the only Gear content) GearSection still respects `allHidden`. Catches: empty card; broken section gate.
4. **Modal renders all non-empty keys** (Step3SheetCard test): `event_details` with stage_size/podium/polling/keynote → `EventDetailsBreakdown` lists all of them (count matches), not just keynote+reel; opening_reel URL stripped. Catches: the 2-of-19 gap; reel-strip regression. Anti-tautology: assert against the breakdown's own list, scoped so a sibling section can't satisfy it.
5. **Layout-dimensions (real browser, Playwright/chrome-devtools)**: render a show with tech specs; assert the `gear-tech-specs` card's `getBoundingClientRect().height` equals its grid cell/sibling within 0.5px (dimensional invariant). jsdom NOT sufficient.
6. **Deep-link region**: `CARD_REGION_MAP["gear-tech-specs"]` resolves to `details` and the card's SourceLink renders an anchor (mirror the keynote SourceLink coverage test).

Run the full crew + admin-wizard + sheet-links suites before review (cross-surface). Impeccable v3 critique + audit on the diff (HIGH/CRITICAL fixed or DEFERRED.md) before the Codex whole-diff review.
