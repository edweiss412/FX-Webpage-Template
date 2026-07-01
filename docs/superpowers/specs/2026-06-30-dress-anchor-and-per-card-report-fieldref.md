# Spec — Dress-code deep-link fix + per-card report `fieldRef` autocapture

**Date:** 2026-06-30
**Slug:** `dress-anchor-and-per-card-report-fieldref`
**Origin:** GitHub issue #207 (admin bug report: "The dress code deep links to the incorrect cell/range"), plus a follow-up to make future reports self-identify their card.
**Routing:** UI work → Opus / Claude Code. Invariant-8 impeccable dual-gate applies (touches `components/`).

---

## 1. Problem

### 1.A — Dress-code deep link targets the wrong sheet region (the bug)

The crew **Today → "Dress code"** card (`today-dress`) shows a value and a recessive **"In sheet"** deep link (`components/crew/primitives/SourceLink.tsx`). The value and the link come from two different places on the INFO tab, and they have drifted apart:

- **Value source:** the standalone `DRESS` block, parsed by `parseDress` (`lib/parser/blocks/dress.ts:18`) and merged into `event_details.dress_code` (`mergeDressCode`, `dress.ts:51`). The block sits **above** the DETAILS header — `dress.ts:4-8` documents this explicitly.
- **Link source:** `CARD_REGION_MAP["today-dress"] = "details"` (`lib/sheet-links/buildSheetDeepLink.ts:163`). The `details` region anchors on the `EVENT DETAILS` / `DETAILS` header block (`buildSheetDeepLink.ts:117-122`, strategy `header-block`, header `/^(EVENT\s+DETAILS|DETAILS|GS\s+DETAILS)/i`).

So the "In sheet" link scrolls the operator to the DETAILS section, never to the DRESS rows.

**Grounded on the live sheet** (`1XQ44uxc44pToYxQnYw4OG9V6DjE7bC5EU08o5iFpxz4`, INFO tab, verified via gsheets MCP 2026-06-30):
- `DRESS` block = rows **27–28** (`A27="DRESS"`, `B27="Set/Strike: …"`, `B28="Show: …"`).
- `DETAILS` header = row **55**.

The link lands ~27 rows away from the actual dress content. Exactly the reported symptom.

`DRESS` is already a recognized standalone section: it is a member of `BLOCK_TERMINATORS` (`buildSheetDeepLink.ts:51`), so a `header-block` region anchored on it is well-defined and self-terminating.

### 1.B — Bug reports don't self-identify the card (the follow-up)

Issue #207 came through the admin/crew report flow with **`Field/section ref: Not captured`**, **`Crew context: Not captured`**, **`Raw snippet: Not captured`**. The report payload contract already supports `fieldRef` (`components/shared/ReportModal.tsx:41-52` `ReportAutocapture`; rendered by `lib/reports/submit.ts:344` via `formatValue`). Autocapture IS populated on some surfaces today — `StagedReviewCard` files admin staged-parse reports with `fieldRef`/`parseWarnings`/`rawSnippet` (`components/admin/StagedReviewCard.tsx:744-754`), and `PreviewBanner` sets `crewPreview` (`components/admin/PreviewBanner.tsx:104-110`); the crew footer sets `rightNowState` (and `crewPreview` under admin preview-as, `_CrewShell.tsx:358-371`). But **no crew-page card surface populates `fieldRef`** — the crew footer report (the surface an ordinary crew/preview report is filed from) carries no card identity, so a report about a specific card (like #207's dress card) files with `fieldRef` empty.

`fieldRef` is exactly the field that would have pinpointed `today-dress` + its region in the issue body, making the value-source-vs-link-region mismatch visible **without opening a sheet**. The deep-link bug class specifically afflicts cards that carry a source link, so those are the cards worth instrumenting.

---

## 2. Goals / Non-goals

**Goals**
- G1. `today-dress`'s "In sheet" link targets the DRESS block, not DETAILS.
- G2. `details` remains the region for the cards that genuinely live in the DETAILS block (`gear-keynote`, `gear-opening-reel`, `gear-tech-specs`).
- G3. Source-backed crew cards expose a **recessive per-card report affordance** that files a bug report stamped with `fieldRef = { cardId, region }` (region from `CARD_REGION_MAP`), so the GitHub issue body identifies the card and its sheet region.
- G4. No raw error codes in UI (invariant 5); report copy continues to route through `lib/messages/lookup.ts` (unchanged — reuses the existing `ReportModal`).
- G5. The change is low-noise and consistent with the mobile-first, restrained DESIGN.md aesthetic (invariant 8).

**Non-goals**
- No change to the DETAILS/EVENT-DETAILS parser or to `parseEventDetails`.
- No new §12.4 error code (reuses the existing report flow end-to-end).
- No report affordance on OUT-OF-SCOPE cards (`OUT_OF_SCOPE_CARDS`) or non-source cards — they have no region and are outside the deep-link bug class.
- No `rawSnippet` / `crewPreview` autocapture on crew cards in this change (deferred; `fieldRef` is the high-value field). Documented in §9.
- No DB schema migration (see §7).

---

## 3. Design — Part A (dress region)

Purely additive to the anchor spec; the `header-block` strategy already exists in `extractSourceAnchors` (`lib/drive/sourceAnchors.ts:224`).

1. Add `"dress"` to `REGION_IDS` (`buildSheetDeepLink.ts:28-42`).
2. Add to `REGION_ANCHOR_SPEC`:
   ```ts
   dress: {
     tabs: ["INFO"],
     strategy: "header-block",
     header: /^DRESS$/i,
     terminators: BLOCK_TERMINATORS,
   },
   ```
3. Repoint `CARD_REGION_MAP["today-dress"]` from `"details"` → `"dress"` (`buildSheetDeepLink.ts:163`).

`extractSourceAnchors` iterates `REGION_IDS` and dispatches on `spec.strategy`; `header-block` finds the `DRESS` header row, includes it, and scans downward until a `BLOCK_TERMINATORS` full-cell match or a blank run (`sourceAnchors.ts:149-184`). On the live sheet that yields rows 27–28 (row 29 is blank → block ends), columns A–B. No change to `sourceAnchors.ts` is required.

**Guard conditions (Part A):**
- Sheet has no `DRESS` header → `headerBlock` returns `null` → no `dress` anchor emitted → `SourceLink` renders the base `#gid=0` link (unchanged fallback behavior for `today-dress`, `buildSheetDeepLink.ts:22`). Not a regression: today it would point at DETAILS, which was wrong anyway.
- Sheet has a `DRESS` header but no continuation rows → block is the single header row (rows == 27 only). Still a valid, correct anchor.
- Stored `source_anchors` predates this change (existing already-synced shows) → the JSON lacks a `dress` key → `data.sourceAnchors["dress"]` is `undefined` → `SourceLink` renders the base `#gid=0` link. Graceful; corrected on next re-sync / backfill. See §7.

## 4. Design — Part B (per-card report `fieldRef`)

### 4.1 Affordance

A new **client** primitive `components/crew/primitives/CardReportTrigger.tsx`:
- Renders an **icon-only**, recessive button (a small flag glyph, thin-stroke family matching `SheetIcon`) with `aria-label="Report a problem with this card"` and `data-slot="card-report-trigger"`.
- Styling mirrors `SourceLink`'s recessive treatment: `text-text-faint`, hover → `text-text-subtle`, `[&_svg]:size-3.5`, `h-fit shrink-0` (no added row height — see Dimensional Invariants).
- On click, opens the existing `ReportModal` with the surface + context resolved from the `cardReport` bundle (§4.2a):
  - `surface = cardReport.surface` (`"crew"` for a plain crew viewer; `"admin"` under admin preview-as — matches the footer override at `_CrewShell.tsx:372`).
  - `surfaceId = ${cardReport.surfaceIdScope}-${cardId}-${showId}` (`crew-card-…` for crew; `admin-preview-card-…` under preview — distinct sessionStorage scope per card per show per surface).
  - `autocapture = { ...cardReport.extraContext, fieldRef: { cardId, region } }` where `region = CARD_REGION_MAP[cardId]`. `extraContext` carries `crewPreview` under admin preview-as (mirrors `_CrewShell.tsx:358-371`); empty for crew. `cardId` already encodes the section (`today-dress` → Today), so no separate `viewerVisibleSection` is threaded.
  - Reuses `ReportModal` verbatim (idempotency-key lifecycle, retry, a11y). No new modal, no new error code.

### 4.2 Integration — `CardHeaderActions`

To keep the 23 source-backed call sites uniform, introduce one composition primitive `components/crew/primitives/CardHeaderActions.tsx` (a Server Component that renders the server `SourceLink` plus the client `CardReportTrigger` leaf) as a single right-aligned cluster in the `SectionCard` header `action` slot. **The anchor is passed in explicitly — NOT derived from `CARD_REGION_MAP[cardId]`** — because some call sites compute a bespoke anchor: the `gear-scope-*` cards pick the dynamic `gear_scope` anchor when present, else fall back to `rooms` (`GearSection.tsx:319-328`). Deriving the anchor internally would collapse those links back to `rooms`. Each call site keeps its existing `anchor={…}` expression verbatim; only `region` (for `fieldRef`) is derived from the static `CARD_REGION_MAP[cardId]`.

```tsx
// props: { cardId: CardId; driveFileId: string | null;
//          anchor?: SourceAnchor | null; showId: string; cardReport: CardReportContext }
// internally: const region = CARD_REGION_MAP[cardId];
//   <SourceLink driveFileId={driveFileId} anchor={anchor} />   // unchanged
//   <CardReportTrigger cardId={cardId} region={region} showId={showId} cardReport={cardReport} />
<CardHeaderActions
  cardId="today-dress"
  driveFileId={data.driveFileId}
  anchor={data.sourceAnchors[CARD_REGION_MAP["today-dress"]]}
  showId={showId}
  cardReport={cardReport}
/>
```

- `SourceLink` is rendered **unchanged** (same `<a data-slot="source-link">`), preserving the `sourceLinkCoverage` contract (the `<a>` still lives in the header). `CardReportTrigger` is a sibling to its right, separated by a hairline gap.
- Rendered ONLY for cards in `CARD_REGION_MAP` (source-backed). `OUT_OF_SCOPE_CARDS` keep their current behavior (no source link, no report trigger).
- The 23 crew-section call sites that currently pass `action={<SourceLink driveFileId={…} anchor={…} />}` are migrated to `action={<CardHeaderActions cardId="…" driveFileId={…} anchor={…} showId={showId} cardReport={cardReport} />}` — the `driveFileId`/`anchor` expressions are copied verbatim (incl. gear-scope's ternary); `cardId` is the literal already used at each site inside `CARD_REGION_MAP[…]`.

### 4.2a `CardReportContext` — preview-aware, computed once

Type: `type CardReportContext = { surface: ReportSurface; surfaceIdScope: string; extraContext: ReportAutocapture }` (exported from `CardHeaderActions.tsx` or a small sibling module).

Computed **once** in `_CrewShell.tsx` `renderOne` (`app/show/[slug]/[shareToken]/_CrewShell.tsx:284-300`), right beside the footer's existing preview override (`:358-377`), and threaded into every section as a new prop, which forwards it to each `CardHeaderActions`. This centralizes the viewer/preview branch in the SAME place the footer already branches — no per-section duplication.

- Plain crew viewer: `{ surface: "crew", surfaceIdScope: "crew-card", extraContext: {} }`.
- Admin preview-as (`viewer.kind === "admin_preview"`): `{ surface: "admin", surfaceIdScope: "admin-preview-card", extraContext: { crewPreview: { crewMemberId, name, role } } }` — `name`/`role` resolved exactly as the footer does (`ctx.viewerName`, `ctx.viewerCrew?.role ?? null`, `_CrewShell.tsx:362-366`).

The section prop `cardReport` is **optional** and defaults to the crew variant `{ surface: "crew", surfaceIdScope: "crew-card", extraContext: {} }`, so existing section unit tests and the coverage walker need not thread it unless they exercise the preview path. `_CrewShell` always passes it explicitly.

### 4.3 Data availability

Sections already receive `data: ShowForViewer` (`lib/data/getShowForViewer.ts:115`) — `data.driveFileId` (`:250`), `data.sourceAnchors` (`:258`) — **and** `showId: string` + `viewer` as direct props (every `*SectionProps`, e.g. `TodaySectionProps` at `components/crew/sections/TodaySection.tsx:153`; instantiated in `_CrewShell.tsx:288-300`). `showId` is the same show UUID the footer `ReportButton` uses. `data.show` is the parser `ShowRow` (`lib/parser/types.ts:96`) and carries NO `id`/`slug`, so the report's `showId` comes from the section prop, not `data.show`. The `cardReport` bundle (§4.2a) supplies the preview-aware surface/context so sections do not each re-derive `viewer.kind`.

### 4.4 Report body

`buildAdminIssueBody` / `buildCrewIssueBody` already render `fieldRef` via `formatValue` (pretty-printed JSON, `submit.ts:241-247`). `{ cardId: "today-dress", region: "dress" }` renders as a JSON block under **"Field/section ref:"**. No `submit.ts` change required — but the issueBody test suite gains a case asserting a `{ cardId, region }` fieldRef renders both values (§8).

### 4.5 Guard conditions (Part B)

| Input | Behavior |
| --- | --- |
| `driveFileId` null/empty | `SourceLink` renders null (existing). `CardReportTrigger` still renders (a card can be reported even with no sheet link) — but `fieldRef` still carries `{cardId, region}`; the report is about the rendered card, not the link. |
| `cardId` not in `CARD_REGION_MAP` | `CardHeaderActions` is not used for that card (out-of-scope cards keep their current header). Compile-time safe: `cardId` typed `CardId`, so `CARD_REGION_MAP[cardId]` is always a valid `RegionId`. |
| `showId` empty | Guard: `CardReportTrigger` renders nothing if `showId` is falsy (mirrors Footer's `{showId ? … }` guard, `Footer.tsx:147`). A crew card always has a show, so this is defense-in-depth. |
| Report modal already open on another card | Each card's `surfaceId` is distinct → independent sessionStorage scope → no draft collision. |
| `anchor` is a bespoke expression (gear-scope dynamic `gear_scope`/`rooms`) | Passed through to `SourceLink` verbatim — the link behavior is byte-identical to today. `fieldRef.region` uses the static `CARD_REGION_MAP[cardId]` (`"rooms"` for gear-scope), which documents the card's canonical region regardless of the dynamic link target. |
| Admin preview-as viewer | `cardReport.surface="admin"`, `surfaceIdScope="admin-preview-card"`, `extraContext.crewPreview` present → the card report files as admin with previewed-viewer context, matching the footer override (`_CrewShell.tsx:358-377`). |

## 5. Dimensional Invariants

The header `action` slot is `[data-slot="section-card-action"]` = `flex shrink-0 items-center` (`SectionCard.tsx:66`). Both children must stay at intrinsic height and not stretch the header row (§Tailwind-v4 no default `items-stretch`):

| Parent → child | Guarantee | Class |
| --- | --- | --- |
| `section-card-action` (flex row) → `SourceLink` `<a>` | intrinsic height, no stretch | `inline-flex h-fit shrink-0 items-center` (unchanged, `SourceLink.tsx:52`) |
| `section-card-action` → `CardReportTrigger` `<button>` | intrinsic height, no stretch | `inline-flex h-fit shrink-0 items-center` |
| `CardHeaderActions` wrapper → its two children | single-line cluster, no wrap-induced height growth | `inline-flex items-center gap-2 h-fit shrink-0` |

Verified by a real-browser (Playwright) assertion (§8): both affordances' `getBoundingClientRect().height` ≤ the header row height within 0.5px, and adding the trigger does not change the card header's height vs. a SourceLink-only baseline.

## 6. Transition Inventory

`CardReportTrigger` is a static button with two states driving the shared modal. It owns no new animated states — the open/close/submit/retry transitions all belong to `ReportModal`, whose inventory is already ratified (`ReportModal.tsx`).

| Transition | Treatment |
| --- | --- |
| trigger idle → hover/focus | color token shift `text-text-faint` → `text-text-subtle`, `transition-colors duration-fast` (matches `SourceLink`) |
| trigger click → modal open | instant mount of `ReportModal` (existing `{open ? <ReportModal/> : null}` pattern, `ReportButton.tsx`); modal's own `sheet-rise` animation plays |
| modal close → trigger idle | instant unmount (existing) |
| Compound: open card A's report while card B's modal is open | Not reachable — each trigger owns its own `open` state and modal instance; only one card's trigger is interacted with at a time. Distinct `surfaceId` guarantees no sessionStorage cross-talk. |

No new `AnimatePresence` / ternary-render animated states are introduced.

## 7. DB / migration / backfill

- **No schema migration.** `source_anchors` is an existing `jsonb` column; adding a region id is code-only. `validation-schema-parity` is N/A (no `supabase/migrations/**` change). Stated explicitly to preempt relitigation.
- **Stored-anchor staleness:** anchors are computed at ingest (`lib/sync/applyStagedCore.ts`) and stored in `shows.source_anchors`. Existing already-synced shows will lack the `dress` key until re-synced. Until then, `today-dress` falls back to the base `#gid=0` link (§3 guard) — strictly better than today's wrong-DETAILS link. Operational note (not code): `scripts/backfill-validation-source-anchors.ts` re-derives and UPDATEs `source_anchors` from each show's live sheet and can be run to refresh the validation project; production shows refresh on their next sync.

## 8. Meta-test inventory & test plan

**Meta-tests this change EXTENDS:**
- `tests/components/crew/sourceLinkCoverage.test.tsx` — the field-aware coverage walker. Contract (c) "every `REGION_ID` referenced by ≥1 `CARD_REGION_MAP` entry" now includes `dress` (satisfied by `today-dress` → `dress`) and still covers `details` (via gear cards). **Extend** the walker with a fourth assertion (d): every in-scope card (CARD_REGION_MAP key) also exposes a `CardReportTrigger` (`[data-slot="card-report-trigger"]`) inside its header, and OUT_OF_SCOPE cards do not. Anti-tautology: scope the query to the card's own `[data-testid]` subtree, never the whole document.

No new advisory-lock surface, no Supabase call boundary, no admin-alert catalog row → those meta-test registries are **N/A** for this change (declared explicitly).

**Test tasks (TDD, each failing-first):**
1. **Anchor unit (Part A):** `extractSourceAnchors` over a fixture workbook whose INFO tab has a `DRESS` block above a `DETAILS` block emits `dress` anchor = the DRESS rows and `details` anchor = the DETAILS rows (distinct). Derive expected A1 from the fixture's row positions, never hardcode a literal detached from the fixture. Failure mode caught: dress sharing the details rect.
2. **Card-map unit (Part A):** `CARD_REGION_MAP["today-dress"] === "dress"` and gear-keynote/opening-reel/tech-specs still `=== "details"`. Failure mode: repoint clobbers the gear cards.
3. **Live-sheet grounding (Part A):** a documented assertion (test comment + the §1.A live-sheet row numbers) that the DRESS/DETAILS split exists as designed. (Real-sheet read done at spec time; unit fixture mirrors it.)
4. **CardReportTrigger unit (Part B):** renders a button with the report `aria-label` + `data-slot="card-report-trigger"`; clicking mounts `ReportModal`; the submit body carries `fieldRef:{cardId,region}` (assert against the fetch body, not the DOM). Failure mode: fieldRef dropped or wrong region.
5. **Coverage walker extension (Part B):** assertion (d) above.
6. **Layout dimensions (Part B):** real-browser Playwright — for a card header containing `CardHeaderActions`, assert both `[data-slot="source-link"]` and `[data-slot="card-report-trigger"]` heights equal the header row height within 0.5px, and the header height is unchanged vs. a SourceLink-only render. jsdom is NOT sufficient.
7. **issueBody (Part B):** `buildAdminIssueBody` with `fieldRef:{cardId:"today-dress",region:"dress"}` renders both `today-dress` and `dress` under "Field/section ref:". Failure mode: formatValue regression.
8. **Gear-scope anchor non-regression (Part B):** render `GearSection` with a fixture that has BOTH a `gear_scope` anchor and a `rooms` anchor; assert each `gear-scope-*` card's `<a data-slot="source-link">` href still equals `buildSheetDeepLink(driveFileId, sourceAnchors["gear_scope"])` (the dynamic choice), NOT the `rooms` anchor. Failure mode: `CardHeaderActions` deriving the anchor from `CARD_REGION_MAP` and collapsing the gear-scope link to `rooms` (Codex spec-R1 finding). Also assert the same card's `fieldRef.region === "rooms"` (static map) to pin the intended split.
9. **Admin-preview parity (Part B):** with `cardReport = { surface:"admin", surfaceIdScope:"admin-preview-card", extraContext:{ crewPreview } }`, a card trigger's submit body carries `surface:"admin"`, the `admin-preview-card-<cardId>-<showId>` surfaceId scope, AND `crewPreview` alongside `fieldRef`. Failure mode: card report hard-coding crew surface / dropping preview context (Codex spec-R1 finding).

## 9. Resolved decisions (preempt relitigation)

- **RD1 — per-card, not section-level or footer-only.** The stated goal is `fieldRef = { cardId, region }`; section-level or a single footer button cannot produce card precision, so a per-card trigger is required, not a preference.
- **RD2 — additive sibling, NOT a combined overflow menu.** `SourceLink`'s `<a data-slot="source-link">` is left byte-identical so the existing `sourceLinkCoverage` `<a>`-in-header contract keeps holding and one-click "In sheet" is preserved. A popover/overflow that hides the `<a>` until opened would break the walker and add a11y/focus surface. The report trigger is a recessive icon-only sibling.
- **RD3 — scope to source-backed cards only.** Deep-link bugs occur on cards with a region; instrumenting only `CARD_REGION_MAP` cards keeps noise down and makes `region` always defined. OUT_OF_SCOPE cards are unchanged.
- **RD4 — reuse `ReportModal` / no new §12.4 code.** The report flow, copy catalog, and idempotency lifecycle are unchanged; this is a new *caller*, not a new *channel*.
- **RD5 — no `rawSnippet`/`crewPreview` from crew cards (YAGNI).** `fieldRef` is the high-value field for the deep-link class; adding raw cell capture is deferred (would require threading each card's raw source through render). If a future report class needs it, revisit.
- **RD6 — impeccable is the noise arbiter.** If `/impeccable critique`/`audit` judges a report glyph on every source-backed card too noisy, the documented fallback is to reduce to a hover/focus-revealed trigger or a per-section (not per-card) grouping — decided at the invariant-8 gate, not pre-emptively.
- **RD7 — anchor is an explicit prop; only `region` is derived.** `CardHeaderActions` must NOT recompute the anchor from `CARD_REGION_MAP[cardId]` — the `gear-scope-*` cards choose `gear_scope` vs `rooms` dynamically (`GearSection.tsx:319-328`). The call site passes its existing `anchor` expression verbatim; `region` (for `fieldRef` only) comes from the static map. This makes the link behavior byte-identical to today and the change purely additive.
- **RD8 — card reports honor the admin-preview override.** The crew sections are re-rendered under admin preview-as, where the footer files reports as `surface:"admin"` with `crewPreview` context and an `admin-preview-…` surfaceId (`_CrewShell.tsx:358-377`). Card triggers mirror this via the `cardReport` bundle (§4.2a) so preview reports keep admin-facing modal copy and previewed-viewer context. The bundle is computed once (not per section) at the same choke point.

## 10. Blast radius

- `lib/sheet-links/buildSheetDeepLink.ts` (region id + spec + card map) — Part A.
- New: `components/crew/primitives/CardReportTrigger.tsx`, `components/crew/primitives/CardHeaderActions.tsx` (+ the `CardReportContext` type) — Part B.
- 23 `action={<SourceLink…/>}` sites across `components/crew/sections/*` (BudgetSection 1, CrewSection 2, GearSection 6, ScheduleSection 2, TodaySection 6, TravelSection 3, VenueSection 3) migrated to `CardHeaderActions` — Part B (mechanical).
- 7 section components gain an optional `cardReport?: CardReportContext` prop (defaulting to the crew variant) and forward it; `app/show/[slug]/[shareToken]/_CrewShell.tsx` `renderOne` computes the bundle once (crew vs admin-preview) and threads it — Part B.
- Tests: `sourceLinkCoverage.test.tsx` (extend), new unit tests (CardReportTrigger, gear-scope non-regression, admin-preview parity), new Playwright layout test, `issueBody.test.ts` (add case).
- No `app/api/**`, no DB, no advisory locks, no email boundary, no Supabase call sites.
