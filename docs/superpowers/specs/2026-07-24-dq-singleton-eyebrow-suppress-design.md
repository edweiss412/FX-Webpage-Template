# DQ singleton eyebrow suppression — design

**Date:** 2026-07-24
**Status:** Draft (autonomous ship-feature pipeline; user ratified the design direction in-session)
**Surface:** Published show page / show review modal — per-section actionable warning groups (`BulkIgnoreControls`)

## 1. Problem

Every active warning code renders an eyebrow group header (DQIGNORE-6, `docs/superpowers/specs/data-quality/2026-07-17-dq-group-active-by-code.md` — "Every active code gets an eyebrow", incl. singletons). For cataloged codes the eyebrow label and the card title resolve from the same catalog `title` (eyebrow: `bulkGroupLabel` at `lib/admin/sectionWarningModel.ts:71-78`; card title: `PerShowActionableWarnings`'s own catalog-title-first expression at `components/admin/PerShowActionableWarnings.tsx:134-139` — NOT `reviewWarningTitle`, which is the wizard/notes path with a different generic fallback; both are catalog-title-first, which is what produces the duplicate). A group holding exactly one card therefore renders a verbatim duplicate: eyebrow "PULL SHEET FOUND ON AN ARCHIVED TAB" directly above a card titled "Pull sheet found on an archived tab" (user-supplied screenshot, 2026-07-24). The eyebrow's grouping affordance signals "multiple instances" and delivers none.

## 1.1 Resolved scope — do not relitigate

- **Design direction is user-ratified ("option 1"):** suppress the eyebrow ROW at N=1; do NOT restyle card titles or move type context into the eyebrow (option 2 was considered and rejected in-session, 2026-07-24).
- **Supersession of DQIGNORE-6 §46:** the ratified row "A single active warning under a code | Still gets its own eyebrow group (one card)" (`2026-07-17-dq-group-active-by-code.md:46`) is superseded **at the render layer only**. The grouping MODEL (`ActiveWarningCodeGroup`, `lib/admin/sectionWarningModel.ts:39-44`, and `groupActiveByCode`) is unchanged — every active code still gets a group; the render suppresses the header row when nothing rides it and nothing is grouped.
- **Wizard mode is out of scope.** The wizard warnings list renders no eyebrows (`components/admin/wizard/step3ReviewSections.tsx:2884-2993`, flat `<ul>`); untouched.
- **The "Notes" eyebrow is out of scope.** Fixed-label info-row group (`step3ReviewSections.tsx:2873-2882`); it is a heterogeneous-content group header, not a per-code type label; untouched.
- **The ignored-disclosure summary is out of scope.** "Ignored (N)" (`sectionWarningExtras.tsx:265-299`) is a disclosure control, not a group eyebrow; untouched.
- **The crew under-row cards are out of scope.** They render outside `BulkIgnoreControls` with no eyebrow (`sectionWarningExtras.tsx:26-74`); untouched.
- **No §12.4 / catalog / DB / advisory-lock / telemetry changes.** Pure client-render conditional + type threading. Invariant-10 not triggered (no mutation surface added or edited).

## 2. Design

### 2.1 Behavior

The eyebrow ROW — the `flex items-center gap-2` header holding the label span, the hairline rule, and the (conditional) bulk chip (`components/admin/BulkIgnoreControls.tsx:157-187`) — renders **iff the group has more than one card OR carries a bulk chip**:

```
showEyebrowRow = group.bulk !== null || group.itemCount !== 1
```

- **N=1, no bulk** (the screenshot case): entire row suppressed — no label, no hairline, no empty flex row. The card renders alone; its title already carries the type.
- **N≥2** (with or without bulk): unchanged — eyebrow + hairline (+ chip when bulk-eligible).
- **N=0, bulk present** (all cards moved under crew rows, chip survives because bulk counts ALL active N ≥2 — `sectionWarningExtras.tsx:189-213`): unchanged — the chip rides the eyebrow row over the "These appear under their crew members above." placeholder.
- **N=0, no bulk**: cannot reach the component — dropped at the build site (`sectionWarningExtras.tsx:189-191`).
- **N=1, bulk present** (possible: one card moved under a crew row, one remains; bulk counts ALL active N): eyebrow row KEPT — the chip must render and it rides this row. The label stays with it (chip aria-label references it, `BulkIgnoreControls.tsx:175`).

The suppression key is card count, NOT label identity. A singleton whose label happens to differ from its card title (data-gap labels, e.g. `BLOCK_DISAPPEARED` → "removed section") is still suppressed: with one card there is nothing grouped and nothing riding the row, and the card body carries its own copy. This keeps the rule mechanical (no string comparison against render output).

### 2.2 Type threading

`ActiveWarningGroup` (`components/admin/BulkIgnoreControls.tsx:19-24`) gains a **required** field:

```ts
export type ActiveWarningGroup = {
  code: string;
  label: string | null;
  bulk: BulkIgnoreGroupWithLabel | null;
  /** Number of warning cards in the `cards` slot (post crew-filter). Drives N=1 eyebrow suppression. */
  itemCount: number;
  cards: ReactNode;
};
```

Required (not optional): `exactOptionalPropertyTypes` is on, and a required field makes every constructor fail loud at typecheck instead of silently defaulting. `cards` is an opaque `ReactNode`, so the count cannot be derived inside the component — the build site threads it.

Build site: `buildSectionWarningExtras` final map (`sectionWarningExtras.tsx:200-234`) adds `itemCount: g.items.length` (the POST-crew-filter `groupItems` length — the number of cards actually in the slot, which is the honest N for "is anything visually grouped here").

### 2.3 Guard conditions (every input)

| Input | Value | Render |
| --- | --- | --- |
| `itemCount` | 1, `bulk` null | Row suppressed |
| `itemCount` | 1, `bulk` present | Row kept (chip rides it) |
| `itemCount` | 0 (`bulk` present by construction) | Row kept |
| `itemCount` | ≥2 | Row kept |
| `itemCount` | negative / NaN (impossible from `.length`) | `!== 1` → row kept; fail-visible, never fail-hidden |
| `label` | null, row kept | Label span omitted; hairline renders; chip renders iff `bulk` present (a kept `itemCount ≥ 2`, `bulk: null` row is hairline-only — unchanged today, `BulkIgnoreControls.tsx:158-186`) |
| `label` | `""` (empty string), row kept | Falsy → identical to null (`group.label ?` gate, `BulkIgnoreControls.tsx:158`); chip aria-label likewise omits the suffix (`BulkIgnoreControls.tsx:175`) |
| `label` | null/`""`, row suppressed | Nothing renders (subsumes today's hairline-only row for label-less singletons) |
| `groups` | `[]` | Component returns null (unchanged, `BulkIgnoreControls.tsx:131`) |
| `slug`, `code`, `cards`, `bulk` shape, null/undefined `itemCount` or `groups` | — | Type-guaranteed by the required, non-nullable fields of `Props`/`ActiveWarningGroup` (`BulkIgnoreControls.tsx:19-26`) under the repo's strict tsconfig; no runtime guard added — a malformed value cannot pass `pnpm typecheck`. This feature changes none of those contracts. |

### 2.4 Mode boundaries

Published mode only, by construction: `BulkIgnoreControls` mounts only via `buildSectionWarningExtras`, which returns null for non-published data (`sectionWarningExtras.tsx:154`) — plus exactly one harness that mounts it directly, the e2e live entry `tests/e2e/_bulkIgnoreEyebrowLiveEntry.tsx` (no gallery/dev code mounts it; `lib/dev/galleryActionScripts.ts:223` is a comment reference only). Wizard mode has no eyebrows and no `BulkIgnoreControls` mount; nothing shared changes shape there.

### 2.5 Transition inventory

Two visual states of the group header: row-present, row-absent. One pair:

| From → To | Treatment |
| --- | --- |
| row-present ↔ row-absent | **Instant — no animation.** The flip only happens across a server refresh (an ignore/re-sync changes N and the whole list re-renders from fresh server props); it is not a client-side state toggle. Matches the existing behavior of groups appearing/disappearing entirely. |

Compound: the armed/running/error chip machinery (`BulkIgnoreControls.tsx:55-129`) lives on rows that are KEPT whenever a chip exists, so no chip state can be mid-transition on a row being suppressed. The transition-audit test (`tests/components/admin/bulkIgnoreControlsTransitionAudit.test.tsx:53-55`) pins the eyebrow className stable across the armed morph — that fixture is bulk-eligible (row kept), unaffected.

### 2.6 Dimensional invariants

None. No fixed-dimension parent is introduced or modified; the suppressed row is removed from flow entirely (`gap-2` column collapses naturally). The 390px eyebrow-wrap layout gate (`tests/e2e/bulk-ignore-eyebrow.layout.spec.ts:42`) measures the `FIELD_UNREADABLE` bulk-eligible eyebrow, which is unaffected.

## 3. Affected surfaces (complete)

| File | Change |
| --- | --- |
| `components/admin/BulkIgnoreControls.tsx` | `itemCount` on `ActiveWarningGroup`; row-render conditional |
| `components/admin/showpage/sectionWarningExtras.tsx` | thread `itemCount: g.items.length` |
| `tests/components/admin/bulkIgnoreControls.test.tsx` | fixtures gain `itemCount`; singleton eyebrow pin flips to suppression assertion; new N=1-with-bulk and N≥2-no-bulk retention assertions |
| `tests/components/admin/showpage/sectionWarningControls.test.tsx` | DQIGNORE-6 test (`tests/components/admin/showpage/sectionWarningControls.test.tsx:316-334`): lone `UNKNOWN_ROLE_TOKEN` eyebrow pin flips to suppression; `FIELD_UNREADABLE` (bulk, N=2) eyebrow pin stays AND gains label-text + invariant-5 assertions (see §4.5) |
| `tests/components/admin/showpage/crewWarningAttachment.test.tsx` | **No edits expected** — but it exercises the §2.1 edge branches through the PRODUCTION build site: no-bulk singleton fallback group (`tests/components/admin/showpage/crewWarningAttachment.test.tsx:173-184` — asserts card count only, passes under suppression), N=1-with-bulk (`tests/components/admin/showpage/crewWarningAttachment.test.tsx:186-199`, asserts "Ignore all 2" chip), N=0-with-bulk chip + placeholder survival (`tests/components/admin/showpage/crewWarningAttachment.test.tsx:201-218`). It is the executable coverage for §2.3's N=0 and N=1-with-bulk rows and MUST run green unmodified as part of task verification. §4 test 3 deliberately duplicates its N=1-with-bulk coverage at the component layer (unit-level predicate pin vs integration-level build-site pin — both kept). |
| `tests/components/admin/bulkIgnoreControlsTransitionAudit.test.tsx` | fixture gains `itemCount` (bulk-eligible — behavior unchanged) |
| `tests/e2e/_bulkIgnoreEyebrowLiveEntry.tsx` | fixtures gain `itemCount`. `FIELD_UNREADABLE`: 2 (its slot markers stand in for 2 cards; measured group, `tests/e2e/bulk-ignore-eyebrow.layout.spec.ts:42`). `UNKNOWN_SECTION_HEADER`: its slot is an empty `<div>` today (`tests/e2e/_bulkIgnoreEyebrowLiveEntry.tsx:58-63`), so an honest count under the `itemCount` contract requires giving the slot two placeholder card divs AND `itemCount: 2` — keeping today's render (second eyebrow visible) without violating the "number of cards in the slot" contract. The layout spec asserts nothing on this group; it exists for visual plurality in the harness. |
| `docs/superpowers/specs/data-quality/2026-07-17-dq-group-active-by-code.md` | supersession note on the §46 singleton row pointing here (one line, no restructure) |

Not affected (verified): `lib/admin/sectionWarningModel.ts` (model unchanged), `lib/dev/galleryActionScripts.ts` (branches on `r.ok` only, `lib/dev/galleryActionScripts.ts:223`), `tests/styles/_metaDestructiveConfirm.test.ts` (chip skin classes, not row structure), announcer counts / `sheetWarningsPanelCount` (count cards, not eyebrows), wizard branch, Notes group, ignored disclosure.

## 4. Tests (TDD)

All in existing files; anti-tautology per project rules — assertions scoped to the eyebrow testids (`dq-group-label-*`), counts derived from fixture item counts, never hardcoded independent of the fixture. **Scope of the anti-tautology mandate: assertions this spec ADDS or EDITS.** Pre-existing pins referenced as unmodified verification coverage (the `crewWarningAttachment.test.tsx` chip assertions, which hardcode "Ignore all 2" against 2-warning fixtures at `tests/components/admin/showpage/crewWarningAttachment.test.tsx:186-218`) keep their existing shape — rewriting shipped regression pins to derive their counts is out of this feature's scope, and "must pass unmodified" is the verification contract for them, not an anti-tautology claim about them.

1. **N=1 suppression** (`bulkIgnoreControls.test.tsx`): singleton fixture (`itemCount: 1`, `bulk: null`) renders NO `dq-group-label-<code>` AND no hairline row — assert the group wrapper's first child is the cards slot (structural: no `flex items-center` header div). Cards still render. Failure mode caught: suppression not implemented, or suppressing the cards along with the row.
2. **N≥2 no-bulk retention**: fixture `itemCount: 2`, `bulk: null`, using the DATA-GAP label path (`BLOCK_DISAPPEARED`, label "removed section") → eyebrow label present with exact text "removed section" AND invariant-5 no-raw-code assertion (`not.toContain("BLOCK_DISAPPEARED")`), no chip. This fixture deliberately inherits the label + invariant-5 coverage the flipped singleton pin previously carried (`tests/components/admin/bulkIgnoreControls.test.tsx:60-69` — the ONLY data-gap-label and no-bulk-eyebrow invariant-5 assertions today); inverting the singleton pin without this transfer would delete both. Failure modes: over-suppression keyed on `bulk` alone; data-gap label path regression; raw code leaking into a kept no-bulk eyebrow.
3. **N=1 with-bulk retention**: fixture `itemCount: 1`, `bulk` present (2 bulk items) → eyebrow row present with chip. Failure mode: suppression keyed on `itemCount` alone hiding a live chip.
4. **Existing pins updated, not deleted**: the grouped-render test keeps asserting the bulk group's eyebrow text + invariant-5 no-raw-code on KEPT rows; the singleton half of the assertion inverts to `queryByTestId(...).toBeNull()`.
5. **Section-level pin** (`sectionWarningControls.test.tsx` DQIGNORE-6 test): lone `UNKNOWN_ROLE_TOKEN` group renders its card with NO eyebrow; `FIELD_UNREADABLE` keeps eyebrow + "Ignore all 2" chip, AND gains label-text + invariant-5 assertions on the kept eyebrow (`dq-group-label-FIELD_UNREADABLE` text equals `messageFor("FIELD_UNREADABLE").title`, `not.toContain("FIELD_UNREADABLE")`) — transferring the section-level invariant-5 coverage from the flipped `UNKNOWN_ROLE_TOKEN` pin (`tests/components/admin/showpage/sectionWarningControls.test.tsx:331-333`). Counts derived from the fixture's warning list.
6. **Typecheck is the constructor sweep**: `itemCount` required → `pnpm typecheck` fails on any un-updated constructor (e2e entry, transition audit). No separate meta-test needed.
7. **N=0 / N=1-with-bulk integration coverage** is NOT re-authored: it already executes through the production build site in `tests/components/admin/showpage/crewWarningAttachment.test.tsx:186-218` (§3 table row) and must pass unmodified — the executable coverage for §2.3's "itemCount 0 → row kept" and "itemCount 1 with bulk → row kept" rows.

Meta-test inventory: none created or extended — no registry-class surface touched ("none applies": no Supabase call, no admin alert, no advisory lock, no sentinel-hiding text, no new mutation surface).

## 5. Numeric sweep

- "N=1" / `itemCount !== 1`: the single suppression threshold, used consistently in §2.1, §2.3, §4.
- "≥2": bulk-eligibility threshold, quoted from `lib/dataQuality/bulkIgnoreGroups.ts:8-10` (distinct-content sets, DQIGNORE-2) — not redefined here.
- 8 rows in the §3 affected-surfaces table (7 edited + 1 no-edits-expected verification row); 7 test items in §4; 1 transition pair in §2.5.

## 6. Impeccable gate

UI diff (two `components/admin/` files) → invariant-8 dual gate (`/impeccable critique` + `/impeccable audit`) runs on the diff before cross-model review. Expected findings surface: none new (removal-only render change; no new copy, no new tokens, no tap targets).
