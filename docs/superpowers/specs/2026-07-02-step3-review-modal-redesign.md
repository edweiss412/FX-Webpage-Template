# Step-3 Review Modal Redesign (Variant B port)

**Date:** 2026-07-02
**Status:** Draft for adversarial review
**Source design:** Claude Design project `33ee8c30-4eaa-48b3-9e3e-8fa642f7f3cd`, file `Step 3 Review - Publish (B).html` + `review/modal-b.jsx`, `review/sections.jsx`, `review/step3.css`, `review/style.css` (fetched 2026-07-01; the mock is the visual reference, this spec is the implementation contract — where they conflict, this spec wins and §14 records the deviation).
**Scope:** the per-sheet review MODAL only. The Step-3 *page* redesigns (sheet-card list, wizard chrome, publish bar, toast) are DEFERRED and out of scope.

---

## 1. Summary

Replace the wizard Step-3 details overlay (`components/admin/wizard/Step3DetailsDialog.tsx`, mounted by `Step3SheetCard.tsx:1715-1764`) with a full review modal ported from design Variant B:

- **Header:** eyebrow "Review before publishing", sheet-title deep link, client + dates subline, overall status chip, close button.
- **Two-pane body (desktop):** left rail index of sections grouped into clusters, each with icon, label, count, and a clean/needs-a-look status dot; scroll-spy highlights the section in view; clicking scrolls to it. Right pane: one titled panel per section.
- **Narrow body (< two-pane threshold):** rail collapses to a horizontal, sticky chip strip above a single-column panel stack.
- **Phone (`< sm`):** bottom sheet with a real drag-to-dismiss grab handle.
- **Footer:** parse-status note, "Re-scan this sheet" (existing flow), and a primary publish-intent button (ticks the sheet's existing durable publish checkbox path, then closes).

Per-section status derives from an explicit `ParseWarning.blockRef.kind` → section mapping (§7). Section bodies are restyled to the mock's visual grammar (field lists, avatar crew rows with tel/mailto actions, schedule day grids) while preserving every existing cap, disclosure, and empty-state behavior (§8).

UI-only: no DB, no advisory locks, no API routes, no migrations.

---

## 2. Existing-code citations (pre-draft verification pass)

All line numbers at `origin/main` = `082a7e4b`.

| Fact | Citation |
| --- | --- |
| Details dialog shell (focus trap, scrim, Esc, scroll lock, sheet/popup) | `components/admin/wizard/Step3DetailsDialog.tsx:35-145`; panel classes `:107` (`max-h-[85vh] w-full max-w-2xl … sm:max-h-[80vh]`) |
| Dialog mount + breakdown grid | `components/admin/wizard/Step3SheetCard.tsx:1715-1764` |
| "More" trigger (`aria-haspopup="dialog"`) | `Step3SheetCard.tsx:1685-1694` |
| Focus hook contract (Tab trap, initial focus, restore; Esc is dialog's job) | `lib/a11y/dialogFocus.ts:41-88`, comment `:13-14` |
| `Step3Row` type | `components/admin/wizard/Step3Review.tsx:75-100`; `Step3ManifestStatus` `:65-73` |
| `PublishCheckbox` props + modes | `Step3SheetCard.tsx:912-931`; controlled iff `onToggle` supplied `:933`; uncontrolled POST `:943-963` to `/api/admin/onboarding/staged/{wizardSessionId}/{driveFileId}/(approve|unapprove)` `:945-952` |
| Controlled persistence: `Step3Review` overlay + `postApproval` (incl. HTTP-200 `{ok:false}` refusal semantics) | `Step3Review.tsx:681-744` (overlay/flush), `:768-790` (`postApproval`) |
| Card mounts checkbox controlled from `Step3Review` | `Step3Review.tsx:381-386`; `Step3SheetCard.tsx:1556-1571` |
| `Step3SheetCard` has NO standalone `app/` mount — only `Step3Review` (controlled) + tests | `rg '<Step3SheetCard' app` = 0 hits; `Step3Review.tsx:381-386` |
| Dirty-rescan demotion (`RESCAN_REVIEW_REQUIRED`): banner, checkbox + Re-scan suppressed, server refuses approve | `Step3SheetCard.tsx:1471,1502-1506,1545,1556,1699-1701`; `Step3Review.tsx:650-652,776-784` |
| `RescanSheetButton` (label "Re-scan this sheet", POST `/api/admin/onboarding/rescan-sheet`) | `components/admin/RescanSheetButton.tsx:33-36,87,97-101,121-125` |
| Sheet deep link builder | `lib/sheet-links/buildSheetDeepLink.ts:9-26`; `REGION_IDS` `:29-44` |
| Title link (plain `<p>` fallback when link null) | `Step3SheetCard.tsx:1014-1041` |
| Warnings rendering (catalog title via `isMessageCode`/`messageFor`, else `w.message`; never raw code) | `Step3SheetCard.tsx:826-830,55`; severity dot `:842-844`; "Open in Sheet ↗" `:874-883` |
| `ParseWarning` shape (`severity`, `code`, `message`, `blockRef?.kind`, `sourceCell?`) | `lib/parser/types.ts:4-21` |
| Data gaps: `summarizeDataGaps`, `dataGapClassDetails`, `stripLegacyUnknownFieldAnchors` | `lib/parser/dataGaps.ts:53-55,94-96,183-185` |
| Breakdown sections + caps (see §8 table) | `Step3SheetCard.tsx:82-92,143-144,201-810` |
| `AgendaBreakdown` (5-state live-fill machine, throttle) | `Step3SheetCard.tsx:1073-1097,1213+` |
| Existing modal animations (transform/opacity-only keyframes + reduced-motion collapse) | `app/globals.css:564-611` |
| Tokens: `--color-status-positive(-text)`, `--color-status-review(-text)`, `warning-bg/text`, `overlay-scrim`, `--spacing-tap-min`, `--tracking-eyebrow`, `--duration-fast`, radii | `app/globals.css:38-85,131,147,181-188,223` |
| Breakpoints: `sm` 640 / `lg` 1024 / `xl` 1200 (no `md` token) | `DESIGN.md:254-258` |
| Motion: layout-property ban (transform/opacity/filter only) | `DESIGN.md:242-246` (§5.4) |
| Tailwind v4: `.flex` does NOT default `align-items:stretch` | `DESIGN.md:262-280` (§7) |
| Token surface contract (no hardcoded hex/ms/px) | `DESIGN.md:305-311` (§10) |
| Anti-patterns (no side-stripes >1px `:291`, no competing accent hue `:300`, no em dashes in copy `:296`) | `DESIGN.md:287-303` (§9) |
| Icon library `lucide-react ^1.14.0`; icons already used in wizard | `DESIGN.md:284-287` (§8); `Step3SheetCard.tsx:37` |
| Avatar atom (`deriveInitials`, `Avatar({name})`) | `components/atoms/Avatar.tsx:55,70` |
| Container queries: not used anywhere in the project today | `rg '@container|container-type' app components` = 0 hits |
| `framer-motion ^12.38.0` installed but Step-3 surfaces are CSS-only | `package.json:58`; `app/globals.css:564-611` |
| Real-browser layout test template | `tests/e2e/step3-card-dimensions.spec.ts` (synthetic HTML + `getBoundingClientRect`) |
| Existing jsdom tests to update | `tests/components/step3SheetCard.test.tsx`, `.transitions.test.tsx`, `.bookends.test.tsx`, `tests/components/admin/wizard/Step3DetailsDialog.test.tsx`, `tests/components/step3Checkbox.test.tsx` |

### 2.1 `blockRef.kind` domain (exhaustive emitter sweep)

Canonical region ids: `lib/sheet-links/buildSheetDeepLink.ts:29-44` (`client, crew, contacts, hotels, transportation, flights, rooms, venue, financials, details, dress, gear_packlist, gear_scope, schedule`). Additional literal kinds emitted:

| kind | example emitter |
| --- | --- |
| `pull_sheet` | `lib/parser/pull-sheet.ts:256` |
| `crew` | `lib/parser/blocks/crew.ts:130,307` |
| `financials` | `lib/parser/blocks/ops.ts:151` |
| `client` | `lib/parser/blocks/client.ts:199` |
| `transportation` | `lib/parser/blocks/transport.ts:416` |
| `venue` | `lib/parser/blocks/venue.ts:137` |
| `details` | `lib/parser/blocks/event.ts:234`; `CANON_TO_REGION` (`lib/parser/sectionHeaderNormalize.ts:18-22`) maps `EVENT DETAILS`/`GS DETAILS` → `details`, `TRANSPORTATION` → `transportation` |
| `agenda`, `dates`, `rooms` | `lib/parser/blocks/agendaWarnings.ts:8,57,65` |
| `unknown_section` | `lib/parser/warnings.ts:108` (`emitUnknownSection`) |
| `travel` | `lib/parser/blocks/travelFlightWarnings.ts:3` |
| `strike`, `loadout` | `lib/parser/blocks/scheduleBookends.ts:159,167` |
| dynamic `section` param (`emitEmptySection` `lib/parser/warnings.ts:42-49`; `emitFieldUnreadable` `:75-96`; `emitUnknownField` `:118-131`) | caller domain: `rooms, contacts, event_details, transportation, dates, hotels` (`lib/parser/blocks/{rooms.ts:120, contacts.ts:145, event.ts:253, transport.ts:142, dates.ts:79, hotels.ts:70}`) + `crew` (FIELD_UNREADABLE) |
| dynamic `item.section` (`BLOCK_DISAPPEARED`, `lib/sync/blockDisappearance.ts:83`) | domain `Mi7Section` = `hotel_reservations, rooms, contacts, transportation` (`:31-40`) |

---

## 3. Resolved decisions

1. **Footer publish = existing durable publish-intent path.** No new publish semantics. "Publish this show" sets the sheet's checked state to `true` through the exact same code path the card checkbox uses, then closes the modal. Wizard-level finalize (out of scope) remains the thing that actually publishes.
2. **Section status derives from the §7 mapping.** Mapped warn-severity warnings flag their content section. Unmappable warn-severity warnings (`unknown_section`, missing/unknown `blockRef.kind`, degraded agenda) flag the always-rendered "Parse warnings" section — they join the flagged set and the header count (§7's no-false-"All clean" contract); mapped warns do not double-flag the warnings section.
3. **Only `severity: "warn"` warnings flip a section dot to needs-a-look.** `info` warnings appear in the Parse warnings panel but do not flag sections. Precedent: `warningSummary()` filters to `"warn"` for the operator surface (`lib/parser/warnings.ts:35-40` comment). The Parse warnings rail COUNT includes both severities (it counts list rows).
4. **Drag-to-dismiss is real** on the phone sheet: translateY-only transform, release past `DRAG_DISMISS_THRESHOLD_PX` dismisses, otherwise springs back (§10).
5. **Full-fidelity body restyle** per the mock's grammar, but every existing cap, disclosure, empty state, and edge-case behavior is preserved verbatim (§8).
6. **Close button stays visible in ALL modes** (deviation from the mock, which hides it on phone): drag/Esc/scrim-only dismissal is not acceptable for AT users.
7. **publishPolicy is nonblocking only.** The mock's optional `confirm` policy (publish-anyway interstitial) is NOT ported. Warnings never block publishing (matches the existing panel copy "These are informational and don't block publishing.", `Step3SheetCard.tsx:818-823`).
8. **No page-level toast.** The mock's post-publish toast belongs to the deferred page redesign. Feedback = the card checkbox visibly ticks + an `aria-live` polite announcement inside the page (see §9.3).
9. **`Step3DetailsDialog.tsx` is superseded and deleted** in the same change (its focus/scroll-lock/Esc/animation patterns move into the new shell). Its test file is replaced.
10. **Both severities render in the Parse warnings panel; the panel and rail entry always render**, including the zero-warning case ("No parse warnings for this sheet." + positive dot) so the all-clean state is affirmative, not absent.

---

## 4. Component architecture

New/changed files (all under the worktree; UI = Opus-owned):

| File | Role |
| --- | --- |
| `components/admin/wizard/Step3ReviewModal.tsx` (NEW) | The modal: shell (scrim, panel, focus trap, scroll lock, Esc), header, rail, content pane, footer, scroll-spy, drag-to-dismiss. Presentational + local interaction state only; receives everything via props. |
| `components/admin/wizard/step3ReviewSections.tsx` (NEW) | Restyled section bodies (moved out of `Step3SheetCard.tsx`) + the section registry (§6). Exports `STEP3_SECTIONS` and per-section body components. |
| `lib/admin/step3SectionStatus.ts` (NEW) | Pure functions: `sectionForWarning(w): SectionId \| null` (mapping table §7) and `deriveSectionStatuses(warnings, renderedSections: ReadonlySet<SectionId>): { flagged: ReadonlySet<SectionId>; flaggedCount: number }` — a mapped section not in `renderedSections` degrades to unmapped (§7). Unit-testable, no React. |
| `lib/admin/publishIntent.ts` (NEW) | `postPublishIntent(wizardSessionId, driveFileId, next): Promise<boolean>` — extracted POST with the HTTP-200 `{ok:false}` refusal semantics from `Step3Review.tsx:768-790`. Consumed by `Step3Review.postApproval`, `Step3SheetCard` (uncontrolled path), and nothing else. `// not-subject-to-meta:` internal Next API fetch, not a Supabase client call (invariant 9 registry not applicable — declared here so the plan's meta-test inventory can cite it). |
| `components/admin/wizard/Step3SheetCard.tsx` (MODIFIED) | Card unchanged visually (page deferred). Section-body functions move to `step3ReviewSections.tsx`. Mounts `Step3ReviewModal` instead of `Step3DetailsDialog`+children. Owns `requestSetChecked(next)` (§9.2). |
| `components/admin/wizard/Step3DetailsDialog.tsx` (DELETED) | Superseded by the new shell. |
| `app/globals.css` (MODIFIED) | Renames/extends the `step3-details-*` keyframe consumers for the new panel attribute; no new colors (existing status tokens cover the mock's palette). Any new token additions land in the `@theme` block + `DESIGN.md` §10 in the same commit. |

`AgendaBreakdown`, `SheetTitleLink`, `RescanSheetButton` are reused as-is (import path changes only where files move). `PublishCheckbox` is MODIFIED, not reused as-is: its uncontrolled internal mode (`initialChecked` + internal POST) is removed and it becomes a purely controlled input (`checked` + `onToggle` required) per §9.2 — one publish path, owned by `Step3SheetCard`/`Step3Review`; its tests move to the controlled contract.

**Test-id inventory (new, all prefixed `wizard-step3-card-${dfid}`):** `-review-modal` (dialog root, replaces `-details-dialog`), `-review-backdrop` (scrim, replaces `-details-backdrop`), `-review-close` (replaces `-details-close`), `-review-header`, `-review-chip` (overall status), `-review-main` (body wrapper), `-review-title` (the `<h2>`), `-review-sheetlink` (the adjacent icon link, when present), `-review-rail` (side rail nav), `-review-chiprail` (horizontal chip strip), `-review-rail-item-<sectionId>` (side-rail items ONLY), `-review-chip-item-<sectionId>` (chip-rail items ONLY — distinct ids because both navs are always in the JSX, §9.4; tests scope to the right container and never let a CSS-hidden item satisfy a visible-mode assertion), `-review-section-<sectionId>` (panel wrapper), `-review-footer`, `-review-note`, `-review-publish`, `-review-grab`. Existing per-body testids (`-breakdown-crew` etc., `-warnings-panel` internals) are preserved so body-behavior tests keep working.

**Data flow:** `Step3SheetCard` computes (as today: `Step3SheetCard.tsx:1511-1536`) crew/rooms/hotels/pullSheet/ros/warnings/dataGaps and passes a single `sections` prop (registry-shaped, §6) plus `row`, `wizardSessionId`, `checked`, `onRequestSetChecked`, `onClose` to `Step3ReviewModal`. The modal renders; it owns no fetches except the reused `RescanSheetButton`/`AgendaBreakdown` children.

---

## 5. Layout, modes, and dimensional invariants

Named width modes (single source of truth for every later section):

- **`sheet` mode:** viewport `< 640px` (`sm`, `DESIGN.md:254`). Bottom sheet, full width, drag handle, horizontal chip rail.
- **`popup` mode:** `640px ≤ viewport < 1024px` (`lg`). Centered panel, horizontal chip rail (no side rail).
- **`two-pane` mode:** viewport `≥ 1024px` (`lg`). Centered panel with left rail + content pane.

Rationale for `lg` as the two-pane threshold: DESIGN.md §6 defines only `sm`/`lg`/`xl`; `lg` is "desktop posture begins" (`DESIGN.md:256`). The mock's 720px container-query key has no named-token equivalent, and this project uses no container queries (§2 citation); the modal is viewport-anchored (`fixed inset-0`), so viewport breakpoints are equivalent in practice.

Panel sizing:

- Overlay: `fixed inset-0 z-50 flex items-end justify-center sm:items-center` + scrim `absolute inset-0 bg-overlay-scrim` (both carried over from `Step3DetailsDialog.tsx:84,98`).
- Panel: `flex max-h-[85vh] w-full flex-col items-stretch rounded-t-md bg-bg sm:max-h-[80vh] sm:rounded-md` + `sm:max-w-5xl` (widened from today's `max-w-2xl`; `max-h` values carried over from `Step3DetailsDialog.tsx:107`). Header, footer, and (in sheet mode) grab strip are `shrink-0`; the body region is `min-h-0 flex-1`.

### 5.1 Dimensional invariants (each verified by the plan's real-browser Playwright task; jsdom is not sufficient, `DESIGN.md:266-278`)

Every parent → child relationship stated explicitly (Tailwind v4 `.flex` does not stretch by default):

1. Panel is `flex flex-col items-stretch`; header (`data-testid …-review-header`), footer (`…-review-footer`), grab strip: `shrink-0`. Body wrapper (`…-review-main`): `min-h-0 flex-1`. **Assert:** `header.height + main.height + footer.height (+ grab.height in sheet mode) === panel.height` ± 0.5px, and `panel.height ≤ 0.85 × viewport.height` (0.80 in popup/two-pane).
2. Two-pane mode: body wrapper is `flex flex-row items-stretch min-h-0`. Rail: `w-60 shrink-0 overflow-y-auto` (240px, Tailwind spacing scale — replaces the mock's 238px magic number). Content: `min-w-0 flex-1 overflow-y-auto`. **Assert:** `rail.height === main.height` and `content.height === main.height` ± 0.5px; `rail.width === 240` ± 0.5px; `rail.width + content.width === main.width` ± 0.5px.
3. Popup/sheet mode: body wrapper is `flex flex-col min-h-0`; chip rail `shrink-0` and horizontally scrollable (`overflow-x-auto`, chips `shrink-0 whitespace-nowrap`); content `min-h-0 flex-1 overflow-y-auto`. **Assert:** `chipRail.scrollHeight === chipRail.clientHeight` (no vertical growth) and `chipRail.width === main.width` ± 0.5px.
4. Sheet mode: `panel.width === viewport.width` ± 0.5px (full-bleed sheet, `rounded-t-md`).
5. Each section panel (`…-review-section-<id>`) spans the content pane's inner width. Measurement contract (no token literals in the test): with `cs = getComputedStyle(content)`, assert `section.getBoundingClientRect().width === content.clientWidth − parseFloat(cs.paddingLeft) − parseFloat(cs.paddingRight)` ± 0.5px (`clientWidth` includes padding, excludes border/scrollbar — subtracting both computed paddings yields the content-box width the block-level section must fill; the old `columns-2` layout is REMOVED).

### 5.2 Vertical rhythm

Content pane: `flex flex-col gap-6 p-tile-pad` (existing spacing tokens; replaces the mock's `--pad` 20px). Section = heading row (`mb-3`) + panel card (`rounded-md border border-border bg-surface p-tile-pad shadow-(--shadow-tile)`); flagged sections swap `border-border` → `border-border-strong bg-surface` with a `bg-warning-bg` icon chip (§6.3) — full border, never a side stripe (`DESIGN.md:291`).

---

## 6. Section model

### 6.1 Registry (single source of truth; lives in `step3ReviewSections.tsx`)

Every section HEADING keeps its existing count (`BreakdownSection`'s `count` prop is already passed by every body: `Step3SheetCard.tsx:268,308,360,395,413,546,569,656,707,769,816`). The RAIL shows counts only for the list-shaped subset below (matching the mock's `COUNTED` behavior); every rail item shows a status dot.

| id | Label | Group | lucide icon | Rail count | Body (moved + restyled from) |
| --- | --- | --- | --- | --- | --- |
| `venue` | Venue | The show | `MapPin` | — | `VenueBreakdown` (`Step3SheetCard.tsx:294-317`) |
| `event` | Event details | The show | `Sparkles` | — | `EventDetailsBreakdown` (`:628-671`) |
| `crew` | Crew | People | `Users` | `crewMembers.length` | `CrewBreakdown` (`:406-440`) |
| `contacts` | Contacts | People | `Phone` | contact-block count as rendered today (`count={blocks.length}` `:268`) | `ContactsBreakdown` (`:225-292`) |
| `schedule` | Crew schedule | Schedule | `CalendarDays` | day count (`count={dayKeys.length}` `:546`, incl. synthetic bookends) | `ScheduleBreakdown` (`:528-560`) |
| `agenda` | Agenda | Schedule | `FileText` | — | `AgendaBreakdown` (reused live-fill component `:1213+`) |
| `hotels` | Hotels | Logistics | `BedDouble` | `hotels.length` | `HotelsBreakdown` (`:762-796`) |
| `transport` | Transport | Logistics | `Truck` | — | `TransportBreakdown` (`:319-381`) |
| `rooms` | Rooms & scope | Gear | `LayoutGrid` | `rooms.length` | `RoomsBreakdown` (`:562-623`) |
| `packlist` | Pack list | Gear | `Package` | `pullSheet.length` (cases) | `PackListBreakdown` (`:700-760`) |
| `billing` | Billing & docs | Money | `Receipt` | — | `OpsBreakdown` (`:383-404`, already labeled "Billing & docs") |
| `warnings` | Parse warnings | Checks | `AlertTriangle` | `warnings.length` (both severities) | `WarningsBreakdown` (`:810-892`) + affirmative empty state (§3.10) |

Group order: The show, People, Schedule, Logistics, Gear, Money, Checks. Ops/"Billing & docs" is the mock's "billing" section; there is no separate FXAV billing block.

**Conditional membership:** `agenda` renders (rail entry AND section) only when `arr(row.adminAgendaPreview).length > 0` (same gate as today, `Step3SheetCard.tsx:1740`). Every other section always renders (empty states preserved). `warnings` always renders.

### 6.2 Rail item anatomy (two-pane)

`<button>` per section, full rail width, `min-h-tap-min` (44px hit area, §15): icon (`text-text-subtle`; active `text-accent-on-bg`), label (`text-sm font-medium`), count (`tabular-nums text-text-faint`, only for rows with a Rail count above), status dot. Active item: `bg-surface-sunken` + a `w-1 rounded-r-pill bg-accent` left indicator (4px spacing-scale, replaces the mock's 3px). Group labels: eyebrow style (`text-xs font-semibold uppercase text-text-faint`, `letterSpacing: var(--tracking-eyebrow)`).

Status dot: `size-2 rounded-pill` (8px, replaces mock's 7px); flagged → `bg-status-review`, clean → `bg-status-positive` (tokens `app/globals.css:78-81`). The `warnings` rail entry dot is row-local: `bg-status-review` iff ≥1 warn-severity warning exists (mapped or not — the row summarizes the whole list), else `bg-status-positive` (info-only or empty). Note the dot and the §7 flagged-set membership deliberately measure different things: the dot = "this list contains warn rows"; flagged membership = "a warn has no content-section home" (keeps the header count non-double-counting while the row never shows a green dot over warn rows).

### 6.3 Chip rail (popup + sheet modes)

Same registry, rendered as pill chips in one horizontal row: icon + label + status dot (counts hidden, matching the mock's `@container` collapse). Pinned above the content (`shrink-0` row in the flex column — not `position: sticky`, since the content pane below is the scroll container). Chip: `rounded-pill border border-border bg-surface min-h-tap-min` (44px hit height, §15 — chips are the touch-mode navigation); active chip: `bg-surface-sunken border-transparent`. (The mock's `--accent-wash` active fill has no repo token; a washed-accent chip is not added — no new color tokens, §14.6.)

### 6.3a Scroll-spy algorithm (deterministic contract)

Constants: `SCROLL_SPY_OFFSET_PX = 90` (module constant in `Step3ReviewModal.tsx`, same value as the mock). **Token-contract disposition (applies to this, `DRAG_DISMISS_THRESHOLD_PX`, and `DRAG_SLOP_PX`, §10):** these are behavioral gesture/scroll thresholds, not rendered visual values — they never produce a painted px. DESIGN.md §10's ban targets visual hardcoding (hex/ms/px SPACING). To keep a single source of truth anyway, the implementation adds a short **"Interaction constants"** note to DESIGN.md §5 (same commit that introduces the constants) naming both constants, their values, and where they live, so the impeccable audit and future readers find them documented rather than treating them as spacing magic numbers.

- **Root/scroll container:** the content pane (`…-review-main`'s scrollable child, the element that owns `overflow-y-auto`). No `IntersectionObserver` — a rAF-throttled `scroll` listener (passive), exactly the mock's mechanism, so the rule below is the single source of truth.
- **Coordinate contract:** DOM `offsetTop` is relative to `offsetParent`, NOT necessarily the scroll container — it is NOT used. Each section's top is computed as `sectionTop = section.getBoundingClientRect().top − scroller.getBoundingClientRect().top + scroller.scrollTop` (container-relative by construction, immune to padding/panel nesting/offsetParent changes). Tops are recomputed on each rAF pass (cheap: ≤12 rects) so disclosure/`<details>` expansion never leaves stale positions.
- **Active-section rule:** reading sections in registry order (§6.1), `active` = the LAST section whose `sectionTop ≤ scrollTop + SCROLL_SPY_OFFSET_PX`. If none qualifies (scrolled above the first section), `active` = the first rendered section. Registry order is strictly increasing in `sectionTop`, so "last that qualifies" is unambiguous — no tie-break needed; sections taller than the viewport stay active until the NEXT section's top crosses the offset line.
- **Bottom clamp:** if `scrollTop + clientHeight ≥ scrollHeight − 1`, `active` = the last rendered section (otherwise a final section shorter than the leftover viewport could never activate).
- **Click override:** clicking a rail item / chip sets `active` to the target immediately and calls `scrollTo({ top: sectionTop − 8 })` using the same coordinate contract (JS passes no `behavior`; CSS `motion-safe` `scroll-behavior: smooth` governs, §11 T6). Scroll events during the glide re-run the rule (C4 — intermediate items may flash; converges because the rule is position-deterministic).
- **Initial state:** `active` = first rendered section on mount (rule evaluated once on mount).
- **Tests:** unit-test the pure rule (extract `activeSectionFor(scrollTop, clientHeight, scrollHeight, sectionTops): SectionId` as an exported helper) with boundary cases: exactly at an offset line, between sections, above first, bottom clamp, tall-section span — expectations derived from the fixture's own `sectionTops` array, not hardcoded ids (anti-tautology). Playwright asserts the rendered rail highlight after real `scrollTo` positions, INCLUDING one case that proves the coordinate contract: nonzero content-pane padding + a nested section panel, click a rail item, assert the target section's top lands within `SCROLL_SPY_OFFSET_PX` of the scroller top AND its rail item is active (catches offsetTop-vs-container misalignment).

### 6.4 Section heading row (content pane)

Icon chip (`size-7 rounded-sm bg-surface-sunken text-text-subtle grid place-items-center`; flagged → `bg-warning-bg text-warning-text`), label (`text-base font-semibold text-text-strong`), count (EVERY section heading keeps its existing `BreakdownSection` count, §6.1 preamble), spacer, and a "Needs a look" chip on flagged sections (`bg-warning-bg text-warning-text border border-border-strong rounded-pill`, text-xs). Clean sections show no chip (the mock's behavior).

---

## 7. Warning → section mapping (`lib/admin/step3SectionStatus.ts`)

`sectionForWarning(w: ParseWarning): SectionId | null`, keyed on `w.blockRef?.kind`:

| `blockRef.kind` | Section |
| --- | --- |
| `crew`, `travel`, `flights` | `crew` |
| `contacts`, `client` | `contacts` |
| `schedule`, `dates`, `strike`, `loadout` | `schedule` |
| `agenda` | `agenda` |
| `hotels`, `hotel_reservations` | `hotels` |
| `transportation` | `transport` |
| `rooms`, `gear_scope` | `rooms` |
| `pull_sheet`, `gear_packlist` | `packlist` |
| `venue` | `venue` |
| `details`, `event_details`, `dress` | `event` |
| `financials` | `billing` |
| `unknown_section`, missing `blockRef`, any unrecognized kind | `null` (unmapped) |

Rationale for the non-obvious rows: `travel`/`flights` warnings concern crew flight attachment (`lib/parser/blocks/travelFlightWarnings.ts:9` "matched zero or multiple roster crew"); `strike`/`loadout` are schedule bookends (`lib/parser/blocks/scheduleBookends.ts:159,167`); `dates` powers the run-of-show day list (`lib/parser/blocks/agendaWarnings.ts:57`); `hotel_reservations` is MI-7's vocabulary for the hotels block (`lib/sync/blockDisappearance.ts:31-40`).

`deriveSectionStatuses(warnings, renderedSections)`: `warnings` is the ALREADY-stripped list (`stripLegacyUnknownFieldAnchors` applied by the card, `Step3SheetCard.tsx:1516`); `renderedSections` is the set of section ids the caller is actually rendering (the card computes it from the registry + the agenda gate, §6.1). A content section is flagged iff it is in `renderedSections` AND has ≥1 mapped warning with `severity === "warn"` (§3.3). A mapped-but-unrendered section (only current case: `agenda` warnings while `adminAgendaPreview` is empty) degrades to UNMAPPED so a dot or header count never references a section absent from the rail — pinned by a unit test (agenda warning + `renderedSections` without `agenda`) and a component test (no rail dot for it). Unknown future kinds degrade safely to unmapped (forward-compatible by construction; a unit test pins this with a fabricated kind).

**No false "All clean" (R3 contract):** unmapped warn-severity warnings must surface in the overall status. The always-rendered `warnings` section joins the `flagged` set iff ≥1 warn-severity warning is UNMAPPED after the degradation above (`unknown_section`, missing `blockRef`, unrecognized kind, or degraded agenda). Mapped warns do NOT double-flag `warnings` (their content section already carries the flag; no double counting). Consequence: any warn-severity warning ALWAYS produces `flaggedCount ≥ 1` — "All clean" is unreachable while a warn-level warning exists. Info-severity warnings still never flag (§3.3); they render in the list with the count. Pinned by: a unit test (warn-level `UNKNOWN_SECTION_HEADER` → `flagged = {warnings}`, `flaggedCount = 1`) and a component test (header chip reads "1 needs a look", not "All clean", with the Parse warnings rail dot `bg-status-review`).

**Header chip:** `flaggedCount = flagged.size`. `flaggedCount > 0` → chip `"{flaggedCount} need a look"` ("1 needs a look" singular): `rounded-pill bg-warning-bg text-warning-text` with a `bg-status-review` dot. `flaggedCount === 0` → chip `"All clean"`: `rounded-pill bg-surface-sunken text-status-positive-text` with a `Check` icon (no positive-wash token exists and none is added, §14.6). Footer note mirrors the same derivation (§9.1).

---

## 8. Section bodies (restyle contract)

Global rules: preserve each body's existing data logic verbatim — caps, `overflowNote`, disclosure buttons, empty-state copy, `hasContent` guards, `partialAttendanceLabel`, `labelFromRawSnippet` (all cited in §2). Restyle = presentation only. All copy that exists today keeps its exact strings (tests already pin several).

| Body | Restyle |
| --- | --- |
| Venue, Event details, Transport (fields), Billing & docs | Field-list grammar: each row `grid grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-x-4 py-2 border-b border-border last:border-0`; key = eyebrow style; value = `text-sm text-text`. Missing values keep today's copy, rendered `text-warning-text italic` where the body already flags gaps. |
| Crew | Avatar rows: `Avatar` atom (`components/atoms/Avatar.tsx:70` — existing neutral styling, NOT the mock's 12-hue palette, §14.2) + name (`text-sm font-medium text-text-strong`) + role/partial-attendance subline (`text-xs text-text-subtle`). Trailing icon actions per member: `tel:` link when `hasContent(m.phone)`, `mailto:` when `hasContent(m.email)`. Exact DOM: the interactive element is the `<a>` itself at `size-tap-min` (44×44 border box) `inline-flex items-center justify-center`, containing a nested non-interactive `<span>` `size-8 rounded-sm border border-border grid place-items-center` as the bordered visual (lucide `Phone`/`Mail` inside; `aria-label` "Call {name}" / "Email {name}" on the anchor). NOT padding/negative-margin on a fixed-`size-8` element — under border-box, `size-8` pins the hit box at 32px regardless of padding. Adjacent anchors sit flush (no gap, no negative margins — hit areas must not overlap); the centered 32px visuals yield a natural 12px visual gutter between borders (44 − 32 = 12). Playwright asserts BOTH `width ≥ 44` and `height ≥ 44` on the anchor (§16). Cap/overflow note unchanged (`CREW_CAP` 30). |
| Contacts | Stacked rows: kind eyebrow + tag row ("Primary" chip for the primary client contact if the body distinguishes one today — it does not, so NO Primary tag is added; §14.5), name + org line, meta line with phone/email (icons, `text-xs text-text-subtle`). Gap rows keep today's copy + warning color. |
| Schedule | Day header (`text-xs font-semibold text-text-strong`) + per-day 2-track grid exactly as today (`grid-cols-[auto_1fr] items-baseline`, `Step3SheetCard.tsx:459-526` invariants preserved, incl. synthetic-bookend styling and "Show all M times" disclosure). |
| Agenda | Reused `AgendaBreakdown` unchanged (its own states/caps/throttle); the modal only supplies the new panel chrome around it. |
| Rooms | Room header (name + kind eyebrow) + scope list `grid-cols-[1.25rem_5rem_minmax(0,1fr)]` with lucide scope icons (`Volume2`/`Video`/`Lightbulb`/`Theater` best-equivalents; icon color `text-accent-on-bg`). Existing fields/caps unchanged. |
| Hotels | Icon chip (`BedDouble`) + name/guests/address stack + right-aligned `check-in → check-out` dates (`tabular-nums`). |
| Pack list | Existing `<details>` disclosure per case preserved; restyled summary row (chevron rotate on open — existing pattern, `transform` only) + count pill (`bg-surface-sunken border border-border rounded-pill`). |
| Warnings | Existing row anatomy (severity dot, title, context, "Open in Sheet ↗" deep link) inside the new panel; severity icon chip `bg-warning-bg text-warning-text` (warn) / `bg-info-bg text-text-subtle` (info). Affirmative empty state per §3.10. **Title derivation is hardened (invariant 5):** cataloged code (`isMessageCode(w.code)`) → `messageFor(w.code).title`; else `w.message` is used ONLY when it is non-empty after trim AND does not contain the raw code token: `!w.message.toLowerCase().includes(w.code.toLowerCase())` (catches exact equality, embedded codes, whitespace and case variants) AND the trimmed message is not itself machine-token-shaped (`/^[A-Z0-9_]{2,}$/` on the trimmed string); otherwise the generic human fallback `"A parse issue was recorded for this sheet."`. Test matrix: exact code-as-message, code embedded mid-sentence, lowercase code variant, whitespace-padded code, and a legitimate human message for an uncataloged code (must pass through unchanged). Rationale: persisted warnings exist whose `message` IS the raw code (`reelWarning` at `lib/sync/phase2.ts:231-233`, e.g. `OPENING_REEL_UNREADABLE`), and the per-show page already pins the no-raw-code rule (`tests/app/admin/perShowPage.test.tsx` asserts `OPENING_REEL_UNREADABLE` never renders). The helper is a small exported function (in `step3ReviewSections.tsx`) so the regression test targets it AND the rendered panel. |

---

## 9. Header and footer

### 9.1 Anatomy and copy

**Header** (`bg-surface border-b border-border`, `shrink-0`): a `flex items-start gap-3` row whose long-content contract is explicit — the text block is `min-w-0 flex-1`; the actions cluster (status chip + close button) is `shrink-0`. Contents: eyebrow `Review before publishing`; title rendered by a HEADING-SAFE split (NOT `SheetTitleLink`, whose linked state injects an action `aria-label` — "Open the source sheet for {title}", `Step3SheetCard.tsx:1025` — that would hijack the accessible-name computation, and whose null-link fallback returns a `<p>`, `Step3SheetCard.tsx:1016-1018`, invalid inside a heading): the dialog's `<h2 id>` (§15) contains ONLY the plain title text in a `<span>` (`text-lg font-bold tracking-tight min-w-0 wrap-break-word` — wraps, never clamps; a long Drive file name grows the header vertically, never pushes the chip/close off-screen); when `buildSheetDeepLink(dfid)` is non-null, a SEPARATE adjacent icon-only `<a>` follows the `<h2>` (outside it): `size-tap-min` anchor (§15 pattern) with nested `ExternalLink` icon and `aria-label` "Open the source sheet for {title}", `target="_blank" rel="noopener noreferrer"`; null link → no anchor, heading alone. `SheetTitleLink` itself is untouched and stays on the card. A11y tests cover BOTH states: dialog accessible name === plain title (linked and unlinked), and the heading contains no nested block element; subline `client · dates-summary` (`text-sm text-text-subtle`, `flex flex-wrap min-w-0`, each entry `wrap-break-word`): the client entry is omitted when null; the dates entry ALWAYS renders — `segs.join(" · ")` or the existing `Dates not detected` fallback (`Step3SheetCard.tsx:1594`), so the subline row is always present (single rule; the guard table mirrors it); overall status chip (§7) — visible in ALL modes including sheet (mock hides it on phone, but the footer note is also hidden there, so the chip is the only flagged-count surface; deviation recorded in §14.7); close button (44px target, all modes, §3.6). Real-browser test at 390px with a long unbroken title + long client + long dates: close button and chip fully visible, no horizontal overflow (`scrollWidth === clientWidth` on the panel).

**Footer** (`bg-surface border-t border-border`, `shrink-0`, `flex items-center gap-3`). In sheet mode the footer's bottom padding includes the device safe area: `pb-[calc(--spacing(3)+env(safe-area-inset-bottom,0px))]` (or the equivalent token-based calc — the mechanism is `env(safe-area-inset-bottom)` added to the base padding, matching the mock's sheet footer treatment), so the publish/re-scan controls are never covered by the iOS home indicator. Playwright (sheet mode) asserts `getComputedStyle(footer).paddingBottom` reflects the safe-area calc (in the pinned test browser `env()` resolves to 0 — assert the computed padding ≥ the base token, and assert the stylesheet rule contains `safe-area-inset-bottom` via a static check, since the simulator inset itself is not reproducible in CI).

- Note (hidden in sheet mode): flagged sections → `{flaggedCount} to review · publishing isn't blocked`; clean → `All clear to publish`. (Reworded from the mock's "won't block publishing" to avoid a contraction-fragment; no em dashes, `DESIGN.md:296`.)
- `RescanSheetButton` (reused; secondary/outline styling via a `variant` prop addition or wrapper styling — the plan decides the minimal mechanism; behavior untouched).
- Primary publish-intent button (`bg-accent text-accent-text`, `min-h-tap-min`): unchecked → label `Publish this show`; checked → label `Selected to publish` with `Check` icon; pending → label `Selecting…` + `disabled` + `aria-busy` while the request settles. Click (both states): `await onRequestSetChecked(true)`; **close only on success**; on failure the modal STAYS OPEN and the footer renders an inline error note `Couldn't update the publish selection. Try again.` (`text-warning-text`, static human copy — never a raw code), also announced via the `aria-live` region (§9.3). Idempotent re-approve is harmless; the server treats approve of an applied row as a no-op — same call the checkbox makes.

### 9.2 Publish-intent wiring (`requestSetChecked`)

`Step3SheetCard` becomes the single checked-state controller in BOTH modes, and the request is result-bearing: `requestSetChecked(next): Promise<boolean>` (true = the write settled as intended; false = it was refused/failed and the optimistic state reverted).

- **Controlled (all production mounts):** `onToggleChecked` changes type to `(next: boolean) => Promise<boolean>`. `Step3Review` resolves it from the machinery it already has: the overlay/flush loop (`Step3Review.tsx:681-744`) tracks per-row settlement (`markSending`/`sendingRef`).

  **Settlement contract (comprehensive — this vector produced findings in three consecutive review rounds, so the full lifecycle is pinned here rather than per-case):**
  1. **Waiter storage:** `Map<driveFileId, Array<{ requestedValue: boolean; resolve: (ok: boolean) => void }>>` — a LIST per row, never a single slot. Every call to the handler pushes a waiter; nothing overwrites or orphans an earlier waiter.
  2. **Settlement point:** a row "settles" when the flush loop finishes the row's LAST coalesced write and no newer desired-intent exists for it (the same condition under which today's code drops the row from `sendingRef`), or when its overlay entry is dropped without a POST (already matching server truth).
  3. **Resolution rule:** at settlement, compute `settledValue` (the row's effective checked state: overlay entry if retained, else server-derived) and resolve EVERY queued waiter for that row with `settledValue === waiter.requestedValue`. Then clear the row's waiter list. A refusal/`{ok:false}`/network failure that reverts the row (per `postApproval` semantics, `Step3Review.tsx:768-790`) makes `settledValue` the reverted value — waiters requesting the reverted-away value resolve `false`.
  4. **Ordering cases (each is a pinned test):** (a) single `true` request → success resolves `true`, refusal resolves `false`; (b) two overlapping `true` requests → BOTH resolve with the same outcome; (c) `true` then `false` before settlement (modal pending, checkbox flips — §11 C7) → the `true` waiter resolves `false`, the `false` waiter resolves `true` (final write succeeds as unchecked); (d) `false` then `true` → mirror of (c); (e) modal unmounted (Esc/scrim/drag) while its request is pending → the promise still settles; the modal ignores resolutions after unmount (guard ref) and the card-level live region alone announces.
  5. **UI consequence:** the modal must never close-and-announce "Selected to publish" over a row whose settled state is unselected — closing requires its own waiter resolving `true`.
  6. **Waiter lifecycle / guaranteed termination:** every waiter resolves in bounded time by construction — (a) the normal settlement path (each POST's `fetch` settles or throws; there is deliberately NO artificial timer on top of fetch semantics); (b) `Step3Review` unmount (route transition, wizard session replacement): a cleanup effect resolves ALL outstanding waiters `false` and clears the map; (c) row removal (a `router.refresh` delivers `rows` without the waiter's `driveFileId` — e.g. a re-scan demoted the row): resolved in a COMMITTED `useEffect` keyed on the reconciled rows set — never inside the render-time overlay reconcile, which stays pure (resolving promises/mutating the waiter map during render is unsafe under concurrent rendering: a render may never commit or may run twice). The effect diffs the waiter map against the committed `rows` and resolves waiters for absent `driveFileId`s `false`. A `false` resolution from (b)/(c) hits the modal's normal failure path (§9.1) if it is still mounted, or is ignored via the modal's unmount guard (case 4e). Pinned tests: unmount-with-pending-waiter resolves `false`; refresh-removes-row resolves `false`; no waiter map entry survives either event. The card checkbox's click path calls the same function and deliberately ignores the promise (fire-and-forget, current UX preserved); only the modal awaits it.
- **Uncontrolled (tests/standalone):** the internal optimistic state + POST + revert-on-fail moves OUT of `PublishCheckbox.toggleSelf` (`Step3SheetCard.tsx:943-963`) UP into `Step3SheetCard`, calling `postPublishIntent` (`lib/admin/publishIntent.ts`), which already returns the success boolean. `PublishCheckbox` becomes a purely controlled input (`checked` + `onToggle` required; its `initialChecked`/internal-state mode is removed and its tests updated). One publish path per mode; the modal button and the checkbox converge on `requestSetChecked`.
- **Dirty-rescan rows** (`row.lastFinalizeFailureCode === RESCAN_REVIEW_REQUIRED`): the modal footer suppresses BOTH the publish button and the Re-scan button (mirroring the card's suppression, `Step3SheetCard.tsx:1556,1699`) and instead renders the review-required note + reapply link with the same copy/target as `RescanReviewBanner` (`Step3SheetCard.tsx:1427-1449`).

### 9.3 Post-publish feedback

On a SUCCESSFUL `requestSetChecked(true)` from the modal (promise resolved `true`): modal closes (unmount, §11 T2); the card checkbox reflects checked via the shared state; a visually-hidden `aria-live="polite"` region in `Step3SheetCard` announces `Selected to publish`. On failure (`false`): modal stays open with the footer error note (§9.1) and the live region announces `Couldn't update the publish selection.` — the checkbox's own fire-and-forget failures use the same live region.

### 9.4 Mode-conditional chrome (single table; §5 modes)

| Element | sheet | popup | two-pane |
| --- | --- | --- | --- |
| Grab strip + drag | ✓ | — | — |
| Close button | ✓ | ✓ | ✓ |
| Header status chip | ✓ | ✓ | ✓ |
| Header subline divider dots | stacked/wrap allowed | ✓ | ✓ |
| Side rail | — | — | ✓ |
| Chip rail | ✓ | ✓ | — |

**Duplicate-navigation contract:** both nav structures are always in the JSX (mode switching for RENDERING is CSS-only; the single JS viewport listener in the component is the drag-cleanup `matchMedia` in §10, which affects no render output) and mode exclusivity is `display: none` via Tailwind responsive classes — side rail `hidden lg:flex`, chip rail `flex lg:hidden`. `display: none` removes the inactive structure from BOTH the accessibility tree and the tab order (no `aria-hidden`/`inert` needed — and none is added, to avoid a second mechanism drifting from the first). **DOM-identity rules for the twins:** NO `id` attribute appears anywhere inside either nav (the modal's only `id` is the header `<h2 useId>`; nav relationships use test-ids and container scoping, never id-based aria references), so the duplicated structures can never produce duplicate ids. Both navs render `aria-current="true"` on their own active item from the same shared state — the hidden twin's copy is inert (out of the accessibility tree via `display: none`), and all queries/tests for `aria-current` are SCOPED to the visible nav's container, never the whole document. jsdom asserts the class contract plus a no-duplicate-`id` sweep over the mounted modal; Playwright asserts per mode that exactly one nav is visible, that exactly one VISIBLE element has `aria-current`, and that Tab traversal never reaches a control inside the hidden one (§16).
| Footer note | — | ✓ | ✓ |
| Footer buttons | ✓ (publish `flex-1`) | ✓ | ✓ |

---

## 10. Drag-to-dismiss (sheet mode only)

Constants (JS module constants in `Step3ReviewModal.tsx`): `DRAG_DISMISS_THRESHOLD_PX = 110`.

- Grab strip: full-width `<button>` with a `min-h-tap-min` (44px) hit area; the visual affordance stays the small inner pill `h-1 w-10 rounded-pill bg-border-strong` (today's affordance, `Step3DetailsDialog.tsx:110-113`), centered. `aria-label="Drag down or tap to close"`, `touch-action: none`. (Mock's 26px strip is a deviation, §14.11; the Playwright suite asserts `grab.height ≥ 44` per §16.)
- `onPointerDown`: capture pointer, record `startY`, set panel `transition: none`.
- `onPointerMove`: `translateY(max(0, clientY − startY))` on the panel (transform only, `DESIGN.md:242-246`).
- `onPointerUp/Cancel`: if `dy > DRAG_DISMISS_THRESHOLD_PX` → set `transition: transform var(--duration-normal) var(--ease-out-quart)`, `translateY(100%)`, close on `transitionend` (with a `--duration-normal`-matched timeout fallback); else same transition back to `translateY(0)`.
- **Click-vs-drag discrimination:** `DRAG_SLOP_PX = 6` (module constant, same DESIGN.md interaction-constants note as the others). A pointer sequence whose maximum `dy` exceeds `DRAG_SLOP_PX` is a DRAG: the handler sets a `dragConsumedClick` ref and the grab button's `onClick` returns early while it is set (cleared on the next tick), suppressing the click browsers synthesize after `pointerup`. A below-threshold drag therefore springs back and does NOT close. A plain tap (`dy ≤ DRAG_SLOP_PX`) closes immediately. Playwright case: drag down ~60px (between slop and dismiss threshold), release — the modal stays open and unshifted.
- **Mode-boundary cleanup (concrete mechanism for §11 C6):** the component registers ONE `matchMedia('(min-width: 640px)')` change listener (matching the `sm` token; mounted with the modal, removed on unmount). On entering `≥ sm` it cancels any drag in progress: releases pointer capture, clears the panel's inline `transform`/`transition`/`animation` styles, and resets the drag ref. This is required because a sheet-mode drag writes an INLINE `translateY` that CSS mode classes cannot clear — an orientation change/resize mid-drag would otherwise leave the popup/two-pane panel translated. Playwright test: start a drag at 390px, resize across the `sm` boundary mid-drag, assert the panel has no inline transform and remains fully interactive.
- Reduced motion: the existing `@media (prefers-reduced-motion: reduce)` block collapses entrance animations (`app/globals.css:607-611`); the dismiss transition uses duration tokens so it inherits the project-wide reduction; drag STILL WORKS (it is direct manipulation, not an animation).

---

## 11. Transition inventory

States: `open` (closed/opening/open/drag/closing-by-drag), `mode` (sheet/popup/two-pane — viewport-driven, never animated), `activeSection`, `checked`, `rescanPending`, per-`<details>` open.

| # | Transition | Treatment |
| --- | --- | --- |
| T1 | closed → open | Existing keyframes: sheet-rise (sheet) / pop-in (popup, two-pane) + scrim fade (`app/globals.css:564-606`), reduced-motion collapse `:607-611`. |
| T2 | open → closed (Esc / scrim / close btn / publish / rail unaffected) | Instant unmount — deliberate, matches today's dialog. No exit animation. |
| T3 | open → drag | `transition: none`; transform tracks pointer. No animation by design. |
| T4 | drag → open (release below threshold) | Transform back to 0, `--duration-fast` token, transform-only. |
| T5 | drag → closed (release past threshold) | Transform to 100%, `--duration-normal` + `--ease-out-quart`, unmount on transitionend/timeout. |
| T6 | activeSection change (scroll-spy or click) | Rail/chip background + indicator: `transition-colors duration-fast`. Position of the indicator does NOT slide (it belongs to each item). Content scroll: CSS `scroll-behavior: smooth` gated `motion-safe:`; JS `scrollTo` without `behavior` so CSS governs. |
| T7 | checked false ↔ true (footer label + checkbox) | Instant swap — deliberate. |
| T7b | publish idle → pending → (closed on success / error note on failure) | Instant label/disabled swaps; error note appears instantly (no animation). Deliberate. |
| T8 | rescanPending false ↔ true | Existing `RescanSheetButton` label/aria-busy swap — instant, unchanged. |
| T9 | `<details>` open/close (pack list), "Show all M times" | Chevron `transform` rotate `duration-fast`; row reveal instant (existing behavior). |
| T10 | warnings/props change while open (post-rescan `router.refresh`) | Instant re-render (server truth). Deliberate. |

Compound transitions:

| # | Compound | Behavior |
| --- | --- | --- |
| C1 | Pointer-down during T1 entrance | `transition: none` cancels the entrance mid-flight; drag takes over from the current position (transform overrides animation… the entrance is a CSS *animation*, not transition — pointer-down also sets `animation: none` on the panel to hand control to the inline transform). |
| C2 | Esc / scrim during drag | Unmount wins immediately (T2). Pointer capture released implicitly by unmount. |
| C3 | Publish click while `rescanPending` | Allowed; independent controls. The re-scan continues server-side; intent POST is unaffected. |
| C4 | Rail click during an in-flight smooth scroll | Clicking sets `activeSection` immediately; scroll-spy may flip intermediate items during the glide and converges on the target. Accepted (mock behavior). |
| C5 | Drag while content pane is mid-scroll | Grab strip is outside the scroll container; `touch-action:none` on the strip prevents scroll/drag contention. Content-pane scrolling never triggers drag. |
| C6 | Viewport crosses a mode boundary while open | Rendering switches via CSS; no animation. Drag state resets via the §10 `matchMedia` cleanup (pointer capture released, inline transform/transition/animation cleared, drag ref reset). |
| C7 | `checked` flips via card checkbox while modal open | Footer label updates instantly (shared state), no animation. |

---

## 12. Guard conditions (every prop/input)

| Input | Null/empty/zero behavior |
| --- | --- |
| `row.parseResult` null/corrupt | Modal unreachable — card renders the no-details early-return WITHOUT a More button (`Step3SheetCard.tsx:1484-1509`). Unchanged. |
| `pr.show.title` empty | `titleFallback = row.driveFileName \|\| dfid` (`:1481,1524`). |
| Deep link null (`buildSheetDeepLink` → null) | Title renders as plain text, no link (existing `SheetTitleLink` fallback `:1016-1018`). |
| `client_label` null | Subline omits the client entry; the dates entry still renders (subline row is ALWAYS present, §9.1 single rule). |
| `dates` empty | "Dates not detected" (existing copy `:1594`) as the subline's dates entry — including when `client_label` is also null. |
| Any list section empty | Existing empty-state copy (§8), clean dot, count 0 (count still renders — `0` is honest). |
| `warnings` empty | Affirmative empty state; `flaggedCount = 0`; "All clean" chip; positive dots everywhere. |
| `warnings` contains only unmapped warn-severity rows | `flagged = {warnings}`, chip "1 needs a look" — "All clean" is unreachable with any warn-level warning present (§7 R3 contract). |
| `warnings` contains only info-severity rows | `flaggedCount = 0`, "All clean" chip, warnings dot positive, rows still listed with count. |
| `adminAgendaPreview` empty | No agenda rail entry/section (§6.1). Agenda-kind warnings then count as unmapped (§7). |
| `checked` undefined (uncontrolled) | Card-local state seeded from `row.status === "applied"` (§9.2). |
| `lastFinalizeFailureCode` = `RESCAN_REVIEW_REQUIRED` | Footer swaps to review-required note + reapply link (§9.2); rail/content unaffected. |
| `flaggedCount` 0 / 1 / n | "All clean" / "1 needs a look" / "n need a look" (§7). |
| `wizardSessionId` empty string | Not constructible from production mounts (route param); POSTs would 404 and revert optimistically — no special UI. |
| Publish request refused/failed while modal open | Promise resolves `false` → modal stays open, footer error note + live-region announcement (§9.1/§9.3); no raw code ever rendered. |
| Unknown `blockRef.kind` | Unmapped by construction (§7). |

---

## 13. Caps and truncation (unchanged, restated for the sweep)

`CREW_CAP` 30, `ROOMS_CAP` 20, `HOTELS_CAP` 12, `PACK_LIST_CASES_CAP` 12, `PACK_LIST_ITEMS_CAP` 8, `SCHEDULE_DAYS_CAP` 14, `SCHEDULE_ENTRIES_CAP` 6 (`Step3SheetCard.tsx:82-92,143-144` — constants move with the bodies to `step3ReviewSections.tsx`, values unchanged). Overflow notes and disclosure buttons preserved verbatim. The rail itself: 12 fixed entries max (11 sections + warnings; agenda conditional) — no cap needed; two-pane rail scrolls vertically if the viewport is short (`overflow-y-auto`, invariant §5.1.2).

---

## 14. Mock deviations (deliberate)

1. **Breakpoints:** viewport `sm`/`lg` tokens instead of the mock's 720px container query (§5 rationale).
2. **Avatars:** existing `Avatar` atom, not the mock's 12-hex palette (token contract `DESIGN.md:305-311`; competing-hue ban `:300`).
3. **Icons:** lucide-react equivalents (project library, `DESIGN.md:284-287`) instead of the mock's bespoke SVG set.
4. **No rail-top health cards:** the mock's production `modal-b.jsx` omits them too; the header chip carries the summary.
5. **No "Primary" contact tag:** the parser does not mark a primary contact today; inventing one would be fabricated data.
6. **Status-chip colors** come from the existing status tokens (`status-review`, `status-positive`, `warning-bg/text`) — the mock's `--ok-wash`/`--accent-wash` color-mix tokens are not added.
7. **Header chip stays visible in sheet mode** (mock hides it) because the footer note is hidden there; the flagged-count must remain visible in every mode.
8. **Close button visible in all modes** (§3.6).
9. **No publish-anyway confirm flow, no toast** (§3.7, §3.8).
10. **No dark-mode-specific work:** tokens are already theme-aware (`app/globals.css` runtime blocks).
11. **Grab strip is 44px tall** (mock: 26px) and mock-denser controls (34px chips, 32px contact buttons, ~33px rail rows) all get ≥44px hit areas — the §15 tap-target contract outranks mock fidelity.

---

## 15. Accessibility contract

- `role="dialog" aria-modal="true"`, named via `aria-labelledby` pointing at the header's visible `<h2 id={useId()}>` that wraps the sheet title (same mechanism as today's dialog, `Step3DetailsDialog.tsx:83,115-121` — NOT `aria-label`, so the accessible name is the programmatically-associated visible title); the `<h2>` is the dialog's top heading and section headings are `<h3>` (outline: h2 → h3, no skipped level). A11y test asserts the dialog's accessible name equals the rendered title and the heading levels. Focus trap + initial focus on close button + restore-to-trigger via `useDialogFocus` (`lib/a11y/dialogFocus.ts:41-88`); Esc closes (dialog-owned, hook contract `:13-14`); scrim = tap-out close, `tabIndex={-1}`, NOT aria-hidden (pattern carried from `Step3DetailsDialog.tsx:86-99`); body scroll locked while open (`:56-62`).
- Rail: `<nav aria-label="Review sections">`; items are buttons with `aria-current="true"` on the active item.
- All interactive targets have a ≥44px hit area, achieved by sizing the INTERACTIVE element itself (`min-h-tap-min`/`size-tap-min` on the button/anchor) with any smaller visual nested inside it (§8 crew-action pattern). Padding or negative margin on a fixed-size (`size-8`-style) interactive element does NOT enlarge its border-box hit area and is not an accepted mechanism. (`PublishCheckbox`'s `-m-3 p-3` label works because the label has no fixed size, `Step3SheetCard.tsx:977-978`.) This covers: close button, grab strip (§10), rail items (§6.2), chips (§6.3), footer buttons (§9.1), crew tel/mailto actions (§8), pack-list `<details>` summary rows and "Show all M times" disclosure buttons (both get `min-h-tap-min`). Sole exemption: inline text links inside sentences/rows ("Open in Sheet ↗", `fl`-style value links) per the WCAG 2.5.8 inline exception.
- Drag strip is a labeled button; keyboard users get close button + Esc (drag is pointer-only enhancement).
- `aria-live` publish announcement (§9.3); `aria-busy` on re-scan preserved.
- Warnings rows keep their existing semantics (heading structure is pinned in the first bullet).

## 16. Testing strategy (spec-level; the plan enumerates TDD tasks)

- **Unit (pure):** `lib/admin/step3SectionStatus.ts` — every §7 mapping row, unknown-kind fallback, info-severity non-flagging, agenda-not-rendered redirection, empty input. Derive expectations from fixture warnings' own `blockRef.kind` values, never hardcoded indices (anti-tautology).
- **Component (jsdom/RTL):** rail renders registry order/groups/counts/dots from a fixture whose flagged sections are COMPUTED via the mapping lib (not restated literals); footer publish: controlled success (`onToggleChecked` resolves `true` → close + announce), controlled refusal (resolves `false` — driven by an HTTP-200 `{ok:false}` mock through `Step3Review` — modal stays open, error note + live-region announce), uncontrolled optimistic POST + revert; pending state disables the button; warning-title hardening regression with `{ code: "OPENING_REEL_UNREADABLE", message: "OPENING_REEL_UNREADABLE" }` asserting the raw code never appears in the rendered panel (generic fallback shown instead); dirty-rescan footer swap; Esc/scrim/close; focus trap initial focus; chip-vs-rail: jsdom asserts both structures carry the exact §9.4 mode classes (`hidden lg:flex` / `flex lg:hidden`); Playwright asserts per mode that exactly one nav is visible and Tab never reaches a hidden-nav control; scroll-spy pure rule (`activeSectionFor`) boundary cases per §6.3a; modal-publish concurrency (pending request + state flip to `false` → resolves `false`, modal stays open, no success announcement); transition-audit test per the global rules (every conditional render pair in §11 present-or-declared-instant). DOM label scans clone the tree and strip siblings that also render the label (e.g. section heading vs rail item share a label — scope queries to `…-review-rail` / `…-review-section-<id>` testids).
- **Real-browser (Playwright, pinned image):** every §5.1 invariant, at 390px (sheet), 800px (popup), 1280px (two-pane); drag-to-dismiss (pointer synthesis past/below threshold); scroll-spy activates the correct rail item after `scrollTo`; tap-target audit — assert `getBoundingClientRect()` `height ≥ 44` (± 0.5px) for the grab strip, each chip, each rail item, and footer buttons, and BOTH `width ≥ 44` and `height ≥ 44` on a crew tel/mailto anchor (§15 list). Template: `tests/e2e/step3-card-dimensions.spec.ts` (synthetic-HTML harness) — but the modal spec renders the REAL component tree via the existing e2e route pattern if available; otherwise the plan adds a fixture page. jsdom is not sufficient for any §5.1 assertion.
- **Concrete failure modes:** each test names the bug it catches (e.g. "rail height ≠ main height catches the Tailwind v4 items-stretch collapse", "unknown kind → null catches a future parser kind silently flagging the wrong section").

## 17. Flag lifecycle

No new boolean config/toggles. (`publishPolicy` is NOT ported as a prop — nonblocking is hard-coded behavior, §3.7 — so no zombie flag.)

## 18. Out of scope + N/A matrix declarations

Out of scope: Step-3 page redesign (cards, wizard chrome, publish bar, toast); Step-1/2 anything; parser changes; new warning codes; §12.4 catalog changes (no new user-visible codes — all copy here is either existing strings or new static copy, not code-driven); DB/API changes; dark-mode token changes; the mock's canvas/stage/tweaks scaffolding.

Project-checklist declarations: **Tier × domain completeness matrix — N/A** (no DB-touching change; zero migrations/RPCs/triggers). **CHECK/enum migration matrix — N/A** (no CHECK or enum changes). **Build-vs-runtime gate — N/A** (no env-gated features). **Advisory-lock topology — N/A** (no `pg_advisory*` code paths touched; publish intent and re-scan reuse existing endpoints unmodified).

## 19. Review preempts (do not relitigate)

- **Non-blocking publish posture** is the shipped contract, not a gap: `Step3SheetCard.tsx:818-823` renders "These are informational and don't block publishing." The modal keeps it (§3.7).
- **"No modals as a first thought" (`DESIGN.md:295`)** — this surface IS already a modal (`Step3DetailsDialog`, shipped); the spec redesigns it, it does not introduce one.
- **Deleting `Step3DetailsDialog.tsx`** is intentional supersession (§3.9), not scope creep: keeping both would leave a dead component with a live test.
- **`lg` (not a new 720/768px token) as the two-pane threshold** — §5 rationale; DESIGN.md §6 names only `sm`/`lg`/`xl` and adding a breakpoint token for one component is not justified.
- **`PublishCheckbox` losing its uncontrolled internal mode** (§9.2) is deliberate consolidation; the only uncontrolled consumers are tests (§2 citation: zero `app/` mounts).
- **Info-severity warnings not flipping section dots** (§3.3) follows the `warningSummary` precedent; the full list still renders both severities.
