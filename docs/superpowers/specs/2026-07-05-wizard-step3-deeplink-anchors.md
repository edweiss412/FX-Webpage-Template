# Spec: Wizard step-3 per-section deep-link anchors (bug #316 item 3)

**Date:** 2026-07-05
**Status:** Ratified design (autonomous ship)
**Bug:** #316 item 3 — "deep links dont seem to be working on this one, all going to a1"
**Surface:** admin onboarding wizard, step 3 (review & publish)

## Problem

In the step-3 review modal, every per-section "In sheet" heading link opens the
source spreadsheet at **INFO cell A1** instead of the section's actual cell range.
The reporter saw all section links collapse to the top-left of the first tab.

### Root cause (verified against live code + live data)

The crew page builds each card's deep link with its region anchor —
`data.sourceAnchors[CARD_REGION_MAP[cardId]]` (e.g.
`components/crew/sections/CrewSection.tsx:171`). The wizard step-3 heading link does
**not**: it calls `buildSheetDeepLink(chrome.dfid)` with **no anchor**
(`components/admin/wizard/step3ReviewSections.tsx:421`). With `anchor` undefined,
`buildSheetDeepLink` returns `` `${base}#gid=0` `` (`lib/sheet-links/buildSheetDeepLink.ts:22`),
which opens the first tab (INFO in the FXAV templates) at cell A1.

The correct per-region anchors already exist:
- They are computed at scan time and persisted to `pending_syncs.source_anchors`
  (`lib/sync/runOnboardingScan.ts:995` via `extractSourceAnchors`), and copied to
  `shows.source_anchors` at finalize (`app/api/admin/onboarding/finalize/route.ts:834`).
- Verified on the validation project for the reporting show
  (`drive_file_id = 1xBbpHi_InDDC3V7Urg4LzA3NMD0qXOxJF0bKbw7Yt-4`):
  `source_anchors` is a populated object of 14 regions with correct `{title, gid, a1}`
  (e.g. `crew → {INFO, 0, A25:E25}`, `schedule → {AGENDA, 1490737099, A1:X999}`).

The wizard simply never **queries** or **threads** those anchors to the client. A
`2026-07-05` comment at `step3ReviewSections.tsx:414-418` documents the current
behavior as an owner decision premised on *"the staged preview carries no computed
per-region anchors"* — that premise is now false. This spec reverses it by threading
the already-persisted anchors through.

## Scope

**In scope:** the per-section heading "In sheet" links only.

**Out of scope (unchanged):**
- The whole-card title link (`components/admin/wizard/Step3SheetCard.tsx:132`,
  `buildSheetDeepLink(dfid)`) — a whole-sheet affordance; `#gid=0` is correct there.
- The agenda-parse-error fallback link (`step3ReviewSections.tsx:1851`).
- The crew route (`app/show/[slug]/[shareToken]/page.tsx`) — already threads
  `sourceAnchors` correctly; it is the reference pattern, not a surface to patch.

## Design

Two halves: (A) thread the staged anchors to the client, (B) use each section's
anchor when building its heading link.

### A. Thread staged anchors to the client (data flow)

1. **Query.** Add `source_anchors` to the `pending_syncs` SELECT in
   `components/admin/OnboardingWizard.tsx:259` (currently
   `"staged_id, drive_file_id, staged_modified_time, parse_result, last_finalize_failure_code"`).
   This reuses the existing `{ data, error }` boundary (`q.error` / `q.data`) — no new
   Supabase call site (invariant 9 satisfied).

2. **Coerce.** In the `pendingSyncsRows` loop (`OnboardingWizard.tsx:~313`), coerce
   `ps.source_anchors` to `Record<string, SourceAnchor>` with the SAME defensive guard
   used for `parse_result`: `value !== null && typeof value === "object" ? cast : {}`.
   Store on the `stagedByDfid` map entry. A non-object / absent value → `{}`.

3. **Type + thread.** Add `sourceAnchors?: Record<string, SourceAnchor>` to `Step3Row`
   (`components/admin/wizard/Step3Review.tsx:78`). Import `SourceAnchor` from
   `@/lib/sheet-links/buildSheetDeepLink`. Thread the coerced map into the `withParse`
   object (`OnboardingWizard.tsx:365`). `exactOptionalPropertyTypes` is ON: only assign
   the key when threading a real value; the field is present-or-absent, never
   `undefined`.

### B. Use the anchor at the link (render)

4. **Section→region map.** Add an exported
   `SECTION_REGION_MAP: Record<SectionId, RegionId | null>` to
   `lib/admin/step3SectionStatus.ts` (alongside the existing `KIND_TO_SECTION`):

   | SectionId | RegionId | | SectionId | RegionId |
   |---|---|---|---|---|
   | `venue` | `venue` | | `rooms` | `rooms` |
   | `event` | `details` | | `diagrams` | `null` |
   | `crew` | `crew` | | `packlist` | `gear_packlist` |
   | `contacts` | `contacts` | | `billing` | `financials` |
   | `schedule` | `schedule` | | `warnings` | `null` |
   | `agenda` | `schedule` | | `report` | `null` |
   | `hotels` | `hotels` | | | |
   | `transport` | `transportation` | | | |

   All 14 `SectionId` members are mapped. Every non-null target is a member of
   `REGION_IDS` (`lib/sheet-links/buildSheetDeepLink.ts:28`): `venue, details, crew,
   contacts, schedule, hotels, transportation, rooms, gear_packlist, financials`.
   `null` = "no single region → whole-sheet fallback" (`diagrams` is a sub-block with
   no `dfid`; `warnings` spans the sheet; `report` is not a parsed region and already
   suppresses its link).

   **One-region-per-section (primary-region) model.** A wizard section is coarser than
   a parser region: `KIND_TO_SECTION` (`lib/admin/step3SectionStatus.ts:19`) folds
   several region-kinds into one section — notably `details`, `event_details`, and
   `dress` all map into `event`. Each section has exactly ONE heading link, so
   `SECTION_REGION_MAP` picks the section's **primary** region. For `event` that is
   `details` (the EVENT DETAILS block is the bulk of the section body via
   `OpsBreakdown`); `dress` is a minor adjacent sub-block that shares the section link.
   This mirrors the crew page's one-region-per-card model (`CARD_REGION_MAP`,
   `buildSheetDeepLink.ts:148`), where e.g. `venue-facilities` and `venue-status` both
   resolve to the single `venue` region despite rendering some cross-region fields. A
   heading link landing on the section's dominant block (with the adjacent sub-block a
   short scroll away on the same INFO tab) is the accepted, pre-existing tradeoff — not
   a regression this spec introduces. (If `details` has no anchor for a given show, the
   guard below falls the link back to `#gid=0`, exactly as today.)

5. **Chrome field.** Add `sourceAnchors?: Record<string, SourceAnchor>` to
   `Step3SectionChrome` (`step3ReviewSections.tsx:278`). The modal is the sole provider:
   inject `sourceAnchors: data.row.sourceAnchors ?? {}` into the chrome context value at
   `Step3ReviewModal.tsx:1037-1054` (which already passes `sectionId: s.id`).
   `data.row` is the full `Step3Row` (`SectionData.row`, `step3ReviewSections.tsx:1952`),
   so no new prop plumbing through `SectionData` is required.

6. **Link build.** In `ModalSectionChrome` (`step3ReviewSections.tsx:419-421`), when
   `chrome.dfid` is present and `chrome.sectionId` is a real section (not `report`),
   resolve the anchor:
   ```
   region = chrome.sectionId ? SECTION_REGION_MAP[chrome.sectionId] : null
   anchor = region ? chrome.sourceAnchors?.[region] : undefined
   sheetHref = buildSheetDeepLink(chrome.dfid, anchor)
   ```
   Update the stale `2026-07-05` "carries no computed per-region anchors" comment at
   `:414-418` to describe the new region-anchored behavior + the fallback.

## Guard conditions (every input)

`buildSheetDeepLink(driveFileId, anchor?)` already handles the degenerate inputs; the
lookup layer must feed it cleanly:

- **`chrome.sourceAnchors` absent** (older staged rows scanned before anchors existed,
  or a section-test provider mount): `chrome.sourceAnchors?.[region]` → `undefined` →
  `buildSheetDeepLink` returns `#gid=0` (today's behavior — no regression).
- **`sourceAnchors` present but `{}`** (a scan that produced no anchors): same as above,
  `[region]` → `undefined` → `#gid=0`.
- **Region is `null`** (`diagrams`/`warnings`/`report`): skip the lookup, pass no anchor
  → `#gid=0` (`report` already renders no link at all).
- **Region present but that key missing from `sourceAnchors`** (e.g. `schedule` for a
  show with no AGENDA tab): `[region]` → `undefined` → `#gid=0`.
- **Anchor present but malformed** (`title` not allowlisted, `gid` not a number): guarded
  inside `buildSheetDeepLink:22` → `#gid=0`.
- **Empty-string `a1`**: `buildSheetDeepLink:24` appends `range` only when `anchor.a1` is
  truthy → tab opens at its top (no range), never a crash.

In every degraded case the outcome is the pre-fix behavior. The fix strictly *upgrades*
links that have a real anchor; it never breaks one.

## Testing (anti-tautology)

1. **`SECTION_REGION_MAP` completeness (unit).** Assert the map has an entry for every
   member of the `SectionId` union (iterate a canonical list of all 14 ids) and that
   every non-null value is a member of `REGION_IDS`. Catches a future `SectionId`
   addition silently missing an anchor mapping.

2. **Anchored href derives from the fixture (unit/component).** Build a fixture
   `sourceAnchors` with a distinctive `crew` anchor (e.g. `{title:"INFO", gid:0,
   a1:"A25:E25"}`). Assert the crew section's heading link `href` equals
   `buildSheetDeepLink(dfid, fixtureAnchor)` — i.e. the **expected value is derived from
   the fixture anchor**, not a hardcoded string. Concrete failure mode caught: the wizard
   passing no anchor (href would be `#gid=0`, not `#gid=0&range=A25%3AE25`).

3. **Absent anchor falls back (unit/component).** Same section with
   `sourceAnchors = {}` (or the region key absent) → href is `` `${base}#gid=0` ``.
   Concrete failure mode caught: a lookup that throws or emits a broken `range=` for a
   missing anchor.

4. **Card title link unchanged (regression).** The whole-card title link
   (`Step3SheetCard`) stays `` `${base}#gid=0` `` regardless of `sourceAnchors`.
   Concrete failure mode caught: over-broad wiring that anchors the out-of-scope title
   link.

## Invariants (AGENTS.md)

- **Invariant 8 (UI quality gate).** Touches `components/admin/**` → UI surface → the
  impeccable dual-gate (`/impeccable critique` + `/impeccable audit`) runs at close-out
  before the cross-model review. The change is behaviorally-invisible (link target only,
  no visual/DOM-shape change), so no visual findings are expected, but the gate is run
  and its dispositions recorded.
- **Invariant 9 (Supabase call-boundary).** The SELECT edit adds a column to an existing
  `.from("pending_syncs").select(...)` that already destructures `{ data, error }`
  (`q.error`/`q.data`) — no new boundary, no meta-test registry row needed.
- **Invariant 10 (mutation-surface observability).** No mutation surface added (this is a
  read/render path). N/A.
- **Invariant 2 (advisory lock).** No `pg_advisory*` surface. N/A.
- **Invariant 5 (no raw error codes in UI).** No error codes rendered. N/A.
- **§12.4 catalog.** No new message codes. N/A.
- **Meta-test inventory.** Creates no new structural meta-test; extends none. The
  `SECTION_REGION_MAP` completeness test (Testing #1) is a targeted unit test, not a
  filesystem-walking structural meta-test — declared here per the writing-plans
  meta-test-inventory rule as "no structural meta-test applies."

## Disagreement-loop preempts (for the reviewer)

- **Scope is ratified.** Per-section heading links only. The card title link staying
  `#gid=0` and the agenda-error link being untouched are deliberate, user-approved
  decisions — do not relitigate.
- **`schedule`/`agenda` → `schedule` region (AGENDA tab) is intentional**, mirroring the
  crew page's `CARD_REGION_MAP["schedule-days"] = "schedule"`
  (`buildSheetDeepLink.ts:167`). There is no INFO "dates" region in
  `REGION_ANCHOR_SPEC`; AGENDA is the canonical schedule anchor.
- **`event → details` (not `dress`) is the ratified primary-region choice**, per the
  one-region-per-section model above. The `event` section aggregates `details` +
  `event_details` + `dress` kinds into one heading link; `details` (the dominant EVENT
  DETAILS block) is primary. This is the same coarsening the crew page already ships;
  do not treat the shared `dress` sub-block as a regression.
- **`null` regions falling back to `#gid=0` is intentional**, not an oversight — it is
  the documented graceful-degradation path, identical to pre-fix behavior.
- **The reversed `2026-07-05` owner comment** is deliberate: its premise ("no computed
  per-region anchors in the staged preview") is factually false — anchors are persisted
  at `pending_syncs.source_anchors` and now threaded.
