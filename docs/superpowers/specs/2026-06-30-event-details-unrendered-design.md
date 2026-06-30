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
4. **Both surfaces hide sentinels (`shouldHideGenericOptional`) — one consistent visibility contract.** The crew card hides sentinels (inherited from `KeyValueRows`); the operator modal applies the **same** `shouldHideGenericOptional` predicate, so a `TBD`/`N/A`/empty field is omitted on BOTH surfaces. This matches the original `BL-EVENT-DETAILS-UNRENDERED` intent ("render all **non-sentinel** keys for the operator pre-publish") and the project-wide sentinel-hiding convention; a sentinel means "unfilled," not a parse result worth reviewing, so hiding it keeps the review list to real parsed specs. (This supersedes an earlier draft of this decision that showed raw values incl. `TBD` — Codex whole-diff review flagged the inconsistency with the crew card + the BL intent.)
5. **The card gets a `data-card-id="gear-tech-specs"` + SourceLink to the `details` region**, mirroring `gear-keynote`/`gear-opening-reel` (both → `"details"`, `lib/sheet-links/buildSheetDeepLink.ts:152-153`). This requires the cross-cutting card-id touchpoints below.
6. **No DB / parser / migration / advisory-lock / error-code changes.** Render-only.

---

## Surface 1 — Crew "Tech specs" card (GearSection)

**File:** `components/crew/sections/GearSection.tsx` (+ icon if used).

`CREW_TECH_SPEC_KEYS` (ordered, crew-impact first):
`stage_size, podium_type, polling, led, scenic, gooseneck, digital_signage, test_pattern, fonts, equipment_storage, staff_office_room, record, virtual_speaker, virtual_audience, notes`.

Build `KeyValueRow[]` from these: `{ k: EVENT_DETAILS_LABELS[key], v: String(data.show.event_details[key] ?? "").trim() }` — **`String(...)` per the value-coercion contract (LOW-2); never `(... ?? "").trim()`** (a non-string JSONB value would throw). `KeyValueRows` omits any row whose `v` is empty/sentinel (`shouldHideGenericOptional`, per its contract `components/crew/primitives/KeyValueRows.tsx:1-15`), so no per-row guard is needed in the card.

**Card render guard:** compute `hasTechSpecs = rows.some((r) => !shouldHideGenericOptional(r.v))`. Render the `SectionCard` (title "Tech specs", `data-card-id="gear-tech-specs"`, SourceLink → `data.sourceAnchors[CARD_REGION_MAP["gear-tech-specs"]]`) wrapping `<KeyValueRows rows={rows} />` ONLY when `hasTechSpecs`. Add `hasTechSpecs` to GearSection's existing `allHidden` gate (`GearSection.tsx:211`) so the whole section still hides when nothing (incl. tech specs) is present.

**Placement:** a full-width card in GearSection's root vertical stack (`flex flex-col gap-4`, `GearSection.tsx:144`), adjacent to the keynote/opening-reel cards (production specs grouped) — NOT inside the 3-up scope grid (see Dimensional invariants: N/A).

---

## Surface 2 — Step-3 review modal (EventDetailsBreakdown)

**File:** `components/admin/wizard/Step3SheetCard.tsx` (`EventDetailsBreakdown`, ~:372-396).

Replace the hard-coded keynote+reel push with an iteration over `EVENT_DETAILS_LABELS` (insertion order). **Coerce FIRST, then sentinel-check (same order + same predicate as the crew card, so admin can't diverge):** for each `key`, `const text = String(ed[key] ?? "").trim();` then `const value = key === "opening_reel" ? stripOpeningReelText(text).trim() : text;` then `if (!shouldHideGenericOptional(value)) fields.push({ label, value });`. Use `shouldHideGenericOptional` (NOT `value.length > 0` / `hasContent`) so `TBD`/`N/A` sentinels are hidden here exactly as on the crew card (decision 4). `String(...)` coerces non-strings (a numeric value still shows); `shouldHideGenericOptional("")` is true so whitespace/empty never inflates `count`.

**Scope of "all known keys" (resolves the `diagrams` ambiguity):** the modal renders all non-empty keys **present in `EVENT_DETAILS_LABELS`** — i.e. all known **text** specs. `diagrams` is deliberately NOT in the label map (it is a folder-link, surfaced by the Diagrams tile, not a text spec), so it never appears here on either surface. So the precise contract is "all non-empty known text event-details keys," not literally every `event_details` entry. Result: the operator sees keynote, opening reel, stage size, podium, polling, LED, scenic, internet, power, dress, … — not just 2. The empty-state ("No event details parsed.") and `count` stay; `count` now reflects the full text-field count.

`EVENT_DETAILS_LABELS` includes the keys already shown elsewhere on the crew page (`internet`, `power`, `dress_code`, `keynote_requirements`, `opening_reel`) because the modal is the operator's single pre-publish view — it should show everything, unlike the crew card which de-dups.

---

## Shared module — `lib/crew/eventDetailsSpecs.ts`

```ts
// Canonical event_details key → human display label (closed-vocab whitelist).
// Single source of truth for the crew Tech-specs card AND the Step-3 modal.
// Keys with NO entry here (PII/financial/unknown, and `diagrams`) never render.
// NOTE: `as const` (NOT `: Record<string, string>`) so `keyof typeof
// EVENT_DETAILS_LABELS` is the finite declared-key union — required for the
// compile-time crew-keys⊆label-keys assertion below (Codex spec-R5).
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

// Ordered crew Tech-specs card subset — EXCLUDES keys rendered on other crew
// surfaces (dress→Today, internet/power→Venue, keynote/opening_reel→Gear) and
// `diagrams` (folder link). Crew-impact first. `as const` so the literal key
// union is compiler-visible (LOW-1).
export const CREW_TECH_SPEC_KEYS = [
  "stage_size", "podium_type", "polling", "led", "scenic", "gooseneck",
  "digital_signage", "test_pattern", "fonts", "equipment_storage",
  "staff_office_room", "record", "virtual_speaker", "virtual_audience", "notes",
] as const;
```

**Typing (LOW-1):** `export const EVENT_DETAILS_LABELS = { … } as const` (literal type — its `keyof` is the finite set of declared keys). Add a compile-time assertion that every crew key IS a declared label key: `const _crewKeysAreLabeled: readonly (keyof typeof EVENT_DETAILS_LABELS)[] = CREW_TECH_SPEC_KEYS;` — this makes "a crew key with no label" a **compile error**. (Codex spec-R4 correction: `satisfies Record<string,string>` does NOT constrain the label keys to a finite/canonical set — `Record<string,string>` accepts any string key — so the guard against an UNKNOWN/typo label key (one not in `CANONICAL_KEY_MAP`) is the **runtime** whitelist-integrity test below, not the type system. Don't claim compile-time prevention of unknown label keys.)

**Value coercion (LOW-2):** `event_details` is typed `Record<string, string>`, but it is decoded from JSONB (`decodeJsonbColumn`, `getShowForViewer.ts:327`), so both consumers coerce defensively: `String(event_details[key] ?? "").trim()` before the content check / render. Never `(value ?? "").trim()` (a non-string JSONB value would throw).

A meta-style unit test asserts, with an explicit documented exclusion set `LABEL_EXCLUDED = new Set(["diagrams"])` (folder link, surfaced elsewhere):
- **Completeness (Codex spec-R5 HIGH-2):** `new Set(Object.keys(EVENT_DETAILS_LABELS))` EQUALS `new Set(Object.values(CANONICAL_KEY_MAP)) \ LABEL_EXCLUDED`. This is a two-way equality — it fails if a label is missing for any canonical text key (e.g. someone drops `fonts`/`test_pattern`) AND if a label exists for an unknown/typo key. A NEW parser canonical key forces an explicit decision (add a label or add to `LABEL_EXCLUDED`), so the whitelist can never silently fall behind the parser's vocabulary or the "all known text keys" goal.
- **Crew subset:** every `CREW_TECH_SPEC_KEYS` entry has an `EVENT_DETAILS_LABELS` label and is NOT one of the already-rendered keys (`dress_code`/`internet`/`power`/`keynote_requirements`/`opening_reel`) or `diagrams`. (The compile-time `_crewKeysAreLabeled` assertion covers "has a label"; this runtime check adds the not-already-rendered constraint.)

---

## Cross-cutting touchpoints (new `gear-tech-specs` card-id)

A new crew card-id MUST be wired through the same surfaces every other card-id is, or a CI gate fails. These are **mandatory**, not conditional — the plan's pre-draft pass reads each enumerator and the implementation adds the `gear-tech-specs` entry wherever sibling card-ids (`gear-keynote`/`gear-opening-reel`) appear:
- **`CARD_REGION_MAP`** (`lib/sheet-links/buildSheetDeepLink.ts:152-153`): add `"gear-tech-specs": "details"` (REQUIRED — the SourceLink's `CARD_REGION_MAP["gear-tech-specs"]` lookup is a compile error otherwise).
- **Affordance matrix** (`affordance-matrix-parity` CI gate): grep the gate's source for how `gear-keynote` is enumerated; add `gear-tech-specs` the same way. REQUIRED if the gate keys on card-ids (the plan confirms by reading the gate, not guessing).
- **`sourceLinkCoverage` test** (`tests/components/crew/sourceLinkCoverage.test.tsx`): read it — if it enumerates every card-id's SourceLink, add `gear-tech-specs`; the new card carries a SourceLink exactly like `gear-keynote`, so it MUST be in whatever set that test walks. REQUIRED.
- **Source anchors** (`lib/drive/sourceAnchors.ts` / `CARD_REGION_MAP` RegionId type): the `"details"` region already resolves an anchor (used by `gear-keynote`) — no NEW region needed; confirm only.
- **DESIGN.md**: add a "Tech specs" card entry under the Gear section description (UI surface → invariant 8 includes DESIGN.md).

> The plan turns each of these into a concrete task step with the exact file + the exact sibling entry to mirror; "if so / may" is not acceptable for a new card-id (Codex spec-R1).

---

## Guard conditions

- `event_details` `undefined`/`{}` → no rows → `hasTechSpecs` false → card not rendered; modal shows "No event details parsed." (existing).
- All crew spec keys sentinel/empty → card not rendered (no empty card).
- A single sentinel value (e.g. `record: "N/A"`) → omitted on BOTH surfaces (crew: `KeyValueRows`; modal: `shouldHideGenericOptional` gate, decision 4).
- Unknown/PII/non-string key present in `event_details` → no label → never rendered (closed-vocab); non-string values are `String()`-coerced before any check (LOW-2).
- `opening_reel` value that is purely a URL → `stripOpeningReelText` may yield empty → omitted (existing behavior preserved).

## Dimensional invariants

- **N/A — no fixed-dimension/stretch relationship.** The "Tech specs" card is placed in the SAME container as the sibling `gear-keynote`/`gear-opening-reel` cards: GearSection's root **vertical** stack `flex flex-col gap-4` (`GearSection.tsx:144`), as a full-width `<div data-card-id="gear-tech-specs">` wrapping a `SectionCard`. A full-width card in a vertical column has **no same-row sibling and no fixed-height parent**, so the Tailwind-v4 flex-stretch trap (`feedback_tailwind_v4_flex_items_stretch`) does not apply and there is nothing to equalize. (The 3-up `min-[720px]:grid-cols-3` scope grid at `GearSection.tsx:235` is a *different* container the new card does NOT join — and CSS grid there already defaults to `align-items:stretch`, so even that is fine.) **No real-browser layout-dimensions task is warranted; declared N/A here per the writing-plans layout rule.**

## Transition inventory

The card is a Server Component with no client state. States: (a) present (≥1 real spec) → card shown; (b) absent (none) → card not in the tree. The transition between (a)/(b) only occurs across a fresh server render (data change → `router.refresh` via the existing ShowRealtimeBridge), not a client animation. **Instant — no client-side transition; no `AnimatePresence`/ternary-with-exit needed.** No compound transitions (single independent visibility gate).

## Meta-test inventory

- **`_metaSentinelHidingContract` EXTENDED (Codex spec-R3).** Correction: this contract does NOT only walk `components/tiles/` — it also walks `CREW_DIRS = [components/crew/sections, components/crew/primitives]` (`tests/components/tiles/_metaSentinelHidingContract.test.ts:100-103`), so **GearSection.tsx IS walked**. GearSection stays compliant trivially: it already contains `shouldHideGenericOptional` (existing keynote/internet handling), and the new tech-spec rows render via `KeyValueRows` (a walked, compliant primitive that routes every row through `shouldHideGenericOptional`); the new keys are read in a loop over the `lib/crew/eventDetailsSpecs.ts` whitelist, so no new *unrouted literal* `event_details["…"]` appears in GearSection.tsx. **Action (forward-defense):** EXTEND `GENERIC_OPTIONAL_FIELDS` with **bracket-access** patterns for ALL newly-surfaced crew tech-spec keys, INCLUDING `notes` — i.e. `event_details["stage_size"]`, …, `event_details["notes"]` (Codex spec-R4: the existing `\.notes\b` pattern only catches dot-access `.notes`, NOT the bracket form `event_details["notes"]` these reads use, so `notes` must be in the new bracket patterns, not assumed-covered). Pattern shape mirrors the existing `event_details\["power"\]` entries. So any FUTURE direct literal read of any of the 15 keys in a walked component must route through `shouldHideGenericOptional`. The plan adds these patterns in the same commit as the card.
- **N/A** for `_metaInfraContract` (no Supabase calls), admin-alert catalog (none), advisory-lock topology (none).
- **Creates:** the `eventDetailsSpecs` whitelist-integrity unit test (above).

## Test plan (failure-mode-first)

1. **Shared whitelist integrity** (`lib/crew/eventDetailsSpecs.ts`): **completeness two-way equality** — `keys(EVENT_DETAILS_LABELS)` === `values(CANONICAL_KEY_MAP) \ {diagrams}` (fails if any known text key lacks a label OR an unknown key has one); every `CREW_TECH_SPEC_KEYS` entry is labeled and is NOT an already-rendered key (`dress_code`/`internet`/`power`/`keynote_requirements`/`opening_reel`) or `diagrams`. Catches: missing label for a known key (the "all known text keys" goal); whitelist drift from the parser vocab; accidental double-render key; a new parser canonical key going unlabeled.
2. **Crew card renders real specs** (GearSection component test): fixture `event_details` with `stage_size`, `podium_type`, `polling` real → card shows those labels+values; `record: "N/A"` → that row absent (sentinel-hidden); a key already shown elsewhere (`power`) → NOT in the tech-specs card; **a non-string value (e.g. the number `123`, simulating bad JSONB) → `String()`-coerced to `"123"` and RENDERED (not a sentinel, so KeyValueRows shows it); the assertion is "no throw + coerced text", NOT "hidden"** (LOW-2 guard — String() prevents the `.trim()`-on-non-string crash; a degenerate numeric value is shown as its text). Catches: missing render; sentinel leak; double-render; non-string crash.
3. **Crew card hidden when all-sentinel/empty**: `event_details` all-`N/A` (for the spec keys) → no `gear-tech-specs` card in the tree, and (if it's the only Gear content) GearSection still respects `allHidden`. Catches: empty card; broken section gate.
4. **Modal renders all non-sentinel known TEXT keys** (Step3SheetCard test): `event_details` with stage_size/podium/polling/real-keynote → `EventDetailsBreakdown` lists all of them (count matches), not just keynote+reel; **a sentinel (`led: "N/A"`) → NOT listed (shouldHideGenericOptional — same as the crew card)**; `diagrams` present → NOT listed (text-key scope); opening_reel URL stripped; a whitespace-only value → omitted; **a non-string value (number) → coerced+shown (no throw)**. Catches: the 2-of-19 gap; reel-strip regression; diagrams leak; sentinel leak; admin/crew divergence. Anti-tautology: assert against the breakdown's own list, scoped so a sibling section can't satisfy it.
5. **Deep-link region**: `CARD_REGION_MAP["gear-tech-specs"]` resolves to `details` and the card's SourceLink renders an anchor (mirror the keynote SourceLink coverage test).
6. **Sentinel-hiding contract still green** (`_metaSentinelHidingContract`): after extending `GENERIC_OPTIONAL_FIELDS` with the new crew tech-spec keys, the contract passes — GearSection (walked) routes its generic-optional reads through `shouldHideGenericOptional`/`KeyValueRows`. Catches: a future direct literal read of a new spec key that forgets sentinel-hiding.

(No real-browser layout-dimensions task — see "Dimensional invariants: N/A" above.)

Run the full crew + admin-wizard + sheet-links suites before review (cross-surface).

**Impeccable dual-gate + disposition recording (invariant 8, HIGH-2).** Run `/impeccable critique` AND `/impeccable audit` on the affected UI diff before the Codex whole-diff review. HIGH/CRITICAL findings are fixed, or deferred via a `DEFERRED.md` entry. Because this ships as a standalone autonomous PR (no milestone handoff doc), the invariant-8 requirement that "findings + dispositions go in §12 of the milestone's handoff doc" is satisfied by **recording the critique/audit findings + their dispositions in the PR description** (and `DEFERRED.md` for anything deferred). Do not mark the UI done until both gates pass and the dispositions are recorded.
