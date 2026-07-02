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
2. **Section status derives from mapped warnings only.** The mapping table is §7. Unmappable warnings (`unknown_section`, missing/unknown `blockRef.kind`) count ONLY toward the "Parse warnings" rail entry.
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
| `lib/admin/step3SectionStatus.ts` (NEW) | Pure functions: `sectionForWarning(w): SectionId \| null` (mapping table §7) and `deriveSectionStatuses(warnings): { flagged: Set<SectionId>; flaggedCount: number }`. Unit-testable, no React. |
| `lib/admin/publishIntent.ts` (NEW) | `postPublishIntent(wizardSessionId, driveFileId, next): Promise<boolean>` — extracted POST with the HTTP-200 `{ok:false}` refusal semantics from `Step3Review.tsx:768-790`. Consumed by `Step3Review.postApproval`, `Step3SheetCard` (uncontrolled path), and nothing else. `// not-subject-to-meta:` internal Next API fetch, not a Supabase client call (invariant 9 registry not applicable — declared here so the plan's meta-test inventory can cite it). |
| `components/admin/wizard/Step3SheetCard.tsx` (MODIFIED) | Card unchanged visually (page deferred). Section-body functions move to `step3ReviewSections.tsx`. Mounts `Step3ReviewModal` instead of `Step3DetailsDialog`+children. Owns `requestSetChecked(next)` (§9.2). |
| `components/admin/wizard/Step3DetailsDialog.tsx` (DELETED) | Superseded by the new shell. |
| `app/globals.css` (MODIFIED) | Renames/extends the `step3-details-*` keyframe consumers for the new panel attribute; no new colors (existing status tokens cover the mock's palette). Any new token additions land in the `@theme` block + `DESIGN.md` §10 in the same commit. |

`AgendaBreakdown`, `PublishCheckbox`, `SheetTitleLink`, `RescanSheetButton` are reused as-is (import path changes only where files move).

**Test-id inventory (new, all prefixed `wizard-step3-card-${dfid}`):** `-review-modal` (dialog root, replaces `-details-dialog`), `-review-backdrop` (scrim, replaces `-details-backdrop`), `-review-close` (replaces `-details-close`), `-review-header`, `-review-chip` (overall status), `-review-main` (body wrapper), `-review-rail` (side rail nav), `-review-chiprail` (horizontal chip strip), `-review-rail-item-<sectionId>`, `-review-section-<sectionId>` (panel wrapper), `-review-footer`, `-review-note`, `-review-publish`, `-review-grab`. Existing per-body testids (`-breakdown-crew` etc., `-warnings-panel` internals) are preserved so body-behavior tests keep working.

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
5. Each section panel (`…-review-section-<id>`) spans the content pane's inner width: `section.width === content.clientWidth − 2 × content padding` ± 0.5px (sections are block-level, no float/column flow — the old `columns-2` layout is REMOVED).

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

Status dot: `size-2 rounded-pill` (8px, replaces mock's 7px); flagged → `bg-status-review`, clean → `bg-status-positive` (tokens `app/globals.css:78-81`). The `warnings` rail entry dot: `bg-status-review` when `warnings.length > 0` else `bg-status-positive`.

### 6.3 Chip rail (popup + sheet modes)

Same registry, rendered as pill chips in one horizontal row: icon + label + status dot (counts hidden, matching the mock's `@container` collapse). Pinned above the content (`shrink-0` row in the flex column — not `position: sticky`, since the content pane below is the scroll container). Chip: `rounded-pill border border-border bg-surface min-h-tap-min` (44px hit height, §15 — chips are the touch-mode navigation); active chip: `bg-surface-sunken border-transparent`. (The mock's `--accent-wash` active fill has no repo token; a washed-accent chip is not added — no new color tokens, §14.6.)

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

`deriveSectionStatuses(warnings)`: input is the ALREADY-stripped list (`stripLegacyUnknownFieldAnchors` applied by the card, `Step3SheetCard.tsx:1516`); a section is flagged iff ≥1 mapped warning with `severity === "warn"` (§3.3). If a mapped section is not currently rendered (only possible case: `agenda` warnings while `adminAgendaPreview` is empty), the warning counts as UNMAPPED for status purposes so a dot never points at a section that isn't in the rail. Unknown future kinds degrade safely to unmapped (forward-compatible by construction; a unit test pins this with a fabricated kind).

**Header chip:** `flaggedCount = flagged.size`. `flaggedCount > 0` → chip `"{flaggedCount} need a look"` ("1 needs a look" singular): `rounded-pill bg-warning-bg text-warning-text` with a `bg-status-review` dot. `flaggedCount === 0` → chip `"All clean"`: `rounded-pill bg-surface-sunken text-status-positive-text` with a `Check` icon (no positive-wash token exists and none is added, §14.6). Footer note mirrors the same derivation (§9.1).

---

## 8. Section bodies (restyle contract)

Global rules: preserve each body's existing data logic verbatim — caps, `overflowNote`, disclosure buttons, empty-state copy, `hasContent` guards, `partialAttendanceLabel`, `labelFromRawSnippet` (all cited in §2). Restyle = presentation only. All copy that exists today keeps its exact strings (tests already pin several).

| Body | Restyle |
| --- | --- |
| Venue, Event details, Transport (fields), Billing & docs | Field-list grammar: each row `grid grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-x-4 py-2 border-b border-border last:border-0`; key = eyebrow style; value = `text-sm text-text`. Missing values keep today's copy, rendered `text-warning-text italic` where the body already flags gaps. |
| Crew | Avatar rows: `Avatar` atom (`components/atoms/Avatar.tsx:70` — existing neutral styling, NOT the mock's 12-hue palette, §14.2) + name (`text-sm font-medium text-text-strong`) + role/partial-attendance subline (`text-xs text-text-subtle`). Trailing icon actions per member: `tel:` link when `hasContent(m.phone)`, `mailto:` when `hasContent(m.email)` — `size-8` VISUAL bordered icon buttons (lucide `Phone`/`Mail`, `aria-label` "Call {name}" / "Email {name}") whose hit area is expanded to 44px via the established negative-margin pattern (`-m-1.5 p-1.5` on a `size-8` visual = 44px, same trick as `PublishCheckbox`, `Step3SheetCard.tsx:977-978`), with `gap-3` (12px) between the two buttons so expanded hit areas abut without overlapping. Cap/overflow note unchanged (`CREW_CAP` 30). |
| Contacts | Stacked rows: kind eyebrow + tag row ("Primary" chip for the primary client contact if the body distinguishes one today — it does not, so NO Primary tag is added; §14.5), name + org line, meta line with phone/email (icons, `text-xs text-text-subtle`). Gap rows keep today's copy + warning color. |
| Schedule | Day header (`text-xs font-semibold text-text-strong`) + per-day 2-track grid exactly as today (`grid-cols-[auto_1fr] items-baseline`, `Step3SheetCard.tsx:459-526` invariants preserved, incl. synthetic-bookend styling and "Show all M times" disclosure). |
| Agenda | Reused `AgendaBreakdown` unchanged (its own states/caps/throttle); the modal only supplies the new panel chrome around it. |
| Rooms | Room header (name + kind eyebrow) + scope list `grid-cols-[1.25rem_5rem_minmax(0,1fr)]` with lucide scope icons (`Volume2`/`Video`/`Lightbulb`/`Theater` best-equivalents; icon color `text-accent-on-bg`). Existing fields/caps unchanged. |
| Hotels | Icon chip (`BedDouble`) + name/guests/address stack + right-aligned `check-in → check-out` dates (`tabular-nums`). |
| Pack list | Existing `<details>` disclosure per case preserved; restyled summary row (chevron rotate on open — existing pattern, `transform` only) + count pill (`bg-surface-sunken border border-border rounded-pill`). |
| Warnings | Existing row anatomy (severity dot, catalog-or-message title, context, "Open in Sheet ↗" deep link) inside the new panel; severity icon chip `bg-warning-bg text-warning-text` (warn) / `bg-info-bg text-text-subtle` (info). Affirmative empty state per §3.10. |

---

## 9. Header and footer

### 9.1 Anatomy and copy

**Header** (`bg-surface border-b border-border`, `shrink-0`): eyebrow `Review before publishing`; title = existing `SheetTitleLink` (deep link + external-icon affordance, plain-text fallback, `Step3SheetCard.tsx:1014-1041`) restyled `text-lg font-bold tracking-tight`; subline `client · dates-summary` (`text-sm text-text-subtle`, entries omitted when null; zero-entry case renders no subline row); overall status chip (§7) — visible in ALL modes including sheet (mock hides it on phone, but the footer note is also hidden there, so the chip is the only flagged-count surface; deviation recorded in §14.7); close button (44px target, all modes, §3.6).

**Footer** (`bg-surface border-t border-border`, `shrink-0`, `flex items-center gap-3`):

- Note (hidden in sheet mode): flagged sections → `{flaggedCount} to review · publishing isn't blocked`; clean → `All clear to publish`. (Reworded from the mock's "won't block publishing" to avoid a contraction-fragment; no em dashes, `DESIGN.md:296`.)
- `RescanSheetButton` (reused; secondary/outline styling via a `variant` prop addition or wrapper styling — the plan decides the minimal mechanism; behavior untouched).
- Primary publish-intent button (`bg-accent text-accent-text`, `min-h-tap-min`): unchecked → label `Publish this show`; checked → label `Selected to publish` with `Check` icon. Click (both states): `onRequestSetChecked(true)` then `onClose()` (idempotent re-approve is harmless; the server treats approve of an applied row as a no-op — same call the checkbox makes).

### 9.2 Publish-intent wiring (`requestSetChecked`)

`Step3SheetCard` becomes the single checked-state controller in BOTH modes:

- **Controlled (all production mounts):** `requestSetChecked(next)` = `onToggleChecked(next)` — `Step3Review`'s overlay/flush persists exactly as it does for checkbox clicks today (`Step3Review.tsx:681-744`).
- **Uncontrolled (tests/standalone):** the internal optimistic state + POST + revert-on-fail moves OUT of `PublishCheckbox.toggleSelf` (`Step3SheetCard.tsx:943-963`) UP into `Step3SheetCard`, calling `postPublishIntent` (`lib/admin/publishIntent.ts`). `PublishCheckbox` becomes a purely controlled input (`checked` + `onToggle` required; its `initialChecked`/internal-state mode is removed and its tests updated). One publish path per mode; the modal button and the checkbox converge on `requestSetChecked`.
- **Dirty-rescan rows** (`row.lastFinalizeFailureCode === RESCAN_REVIEW_REQUIRED`): the modal footer suppresses BOTH the publish button and the Re-scan button (mirroring the card's suppression, `Step3SheetCard.tsx:1556,1699`) and instead renders the review-required note + reapply link with the same copy/target as `RescanReviewBanner` (`Step3SheetCard.tsx:1427-1449`).

### 9.3 Post-publish feedback

On `requestSetChecked(true)` from the modal: modal closes (unmount, §11 T2); the card checkbox reflects checked via the shared state; a visually-hidden `aria-live="polite"` region in `Step3SheetCard` announces `Selected to publish` / reverts announce `Couldn't update publish selection` (revert path already exists for checkbox failures — same optimistic-revert contract).

### 9.4 Mode-conditional chrome (single table; §5 modes)

| Element | sheet | popup | two-pane |
| --- | --- | --- | --- |
| Grab strip + drag | ✓ | — | — |
| Close button | ✓ | ✓ | ✓ |
| Header status chip | ✓ | ✓ | ✓ |
| Header subline divider dots | stacked/wrap allowed | ✓ | ✓ |
| Side rail | — | — | ✓ |
| Chip rail | ✓ | ✓ | — |
| Footer note | — | ✓ | ✓ |
| Footer buttons | ✓ (publish `flex-1`) | ✓ | ✓ |

---

## 10. Drag-to-dismiss (sheet mode only)

Constants (JS module constants in `Step3ReviewModal.tsx`): `DRAG_DISMISS_THRESHOLD_PX = 110`.

- Grab strip: full-width `<button>` with a `min-h-tap-min` (44px) hit area; the visual affordance stays the small inner pill `h-1 w-10 rounded-pill bg-border-strong` (today's affordance, `Step3DetailsDialog.tsx:110-113`), centered. `aria-label="Drag down or tap to close"`, `touch-action: none`. (Mock's 26px strip is a deviation, §14.11; the Playwright suite asserts `grab.height ≥ 44` per §16.)
- `onPointerDown`: capture pointer, record `startY`, set panel `transition: none`.
- `onPointerMove`: `translateY(max(0, clientY − startY))` on the panel (transform only, `DESIGN.md:242-246`).
- `onPointerUp/Cancel`: if `dy > DRAG_DISMISS_THRESHOLD_PX` → set `transition: transform var(--duration-normal) var(--ease-out-quart)`, `translateY(100%)`, close on `transitionend` (with a `--duration-normal`-matched timeout fallback); else same transition back to `translateY(0)`.
- Plain click (no meaningful movement) closes immediately.
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
| C6 | Viewport crosses a mode boundary while open | Pure CSS/conditional re-render; no animation. Drag state resets (sheet-only handlers unmount). |
| C7 | `checked` flips via card checkbox while modal open | Footer label updates instantly (shared state), no animation. |

---

## 12. Guard conditions (every prop/input)

| Input | Null/empty/zero behavior |
| --- | --- |
| `row.parseResult` null/corrupt | Modal unreachable — card renders the no-details early-return WITHOUT a More button (`Step3SheetCard.tsx:1484-1509`). Unchanged. |
| `pr.show.title` empty | `titleFallback = row.driveFileName \|\| dfid` (`:1481,1524`). |
| Deep link null (`buildSheetDeepLink` → null) | Title renders as plain text, no link (existing `SheetTitleLink` fallback `:1016-1018`). |
| `client_label` null | Subline omits it; dates alone. Both null/empty → no subline row. |
| `dates` empty | "Dates not detected" (existing copy `:1594`) in the subline slot. |
| Any list section empty | Existing empty-state copy (§8), clean dot, count 0 (count still renders — `0` is honest). |
| `warnings` empty | Affirmative empty state; `flaggedCount = 0`; "All clean" chip; positive dots everywhere. |
| `adminAgendaPreview` empty | No agenda rail entry/section (§6.1). Agenda-kind warnings then count as unmapped (§7). |
| `checked` undefined (uncontrolled) | Card-local state seeded from `row.status === "applied"` (§9.2). |
| `lastFinalizeFailureCode` = `RESCAN_REVIEW_REQUIRED` | Footer swaps to review-required note + reapply link (§9.2); rail/content unaffected. |
| `flaggedCount` 0 / 1 / n | "All clean" / "1 needs a look" / "n need a look" (§7). |
| `wizardSessionId` empty string | Not constructible from production mounts (route param); POSTs would 404 and revert optimistically — no special UI. |
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

- `role="dialog" aria-modal="true"`, `aria-label` = `Review {title}`; focus trap + initial focus on close button + restore-to-trigger via `useDialogFocus` (`lib/a11y/dialogFocus.ts:41-88`); Esc closes (dialog-owned, hook contract `:13-14`); scrim = tap-out close, `tabIndex={-1}`, NOT aria-hidden (pattern carried from `Step3DetailsDialog.tsx:86-99`); body scroll locked while open (`:56-62`).
- Rail: `<nav aria-label="Review sections">`; items are buttons with `aria-current="true"` on the active item.
- All interactive targets have a ≥44px hit area (`min-h-tap-min`/`size-tap-min` tokens, or the negative-margin expansion pattern where the visual must stay smaller — `PublishCheckbox` precedent `Step3SheetCard.tsx:977-978`). This covers: close button, grab strip (§10), rail items (§6.2), chips (§6.3), footer buttons (§9.1), crew tel/mailto actions (§8), pack-list `<details>` summary rows and "Show all M times" disclosure buttons (both get `min-h-tap-min`). Sole exemption: inline text links inside sentences/rows ("Open in Sheet ↗", `fl`-style value links) per the WCAG 2.5.8 inline exception.
- Drag strip is a labeled button; keyboard users get close button + Esc (drag is pointer-only enhancement).
- `aria-live` publish announcement (§9.3); `aria-busy` on re-scan preserved.
- Section headings are `<h3>` (dialog title is the `<h2>`-equivalent labelled node); warnings rows keep their existing semantics.

## 16. Testing strategy (spec-level; the plan enumerates TDD tasks)

- **Unit (pure):** `lib/admin/step3SectionStatus.ts` — every §7 mapping row, unknown-kind fallback, info-severity non-flagging, agenda-not-rendered redirection, empty input. Derive expectations from fixture warnings' own `blockRef.kind` values, never hardcoded indices (anti-tautology).
- **Component (jsdom/RTL):** rail renders registry order/groups/counts/dots from a fixture whose flagged sections are COMPUTED via the mapping lib (not restated literals); footer publish → `onToggleChecked(true)` + close (controlled) and optimistic POST + revert (uncontrolled, fetch mocked, incl. HTTP-200 `{ok:false}`); dirty-rescan footer swap; Esc/scrim/close; focus trap initial focus; chip-vs-rail conditional render is CSS/viewport-driven so jsdom asserts BOTH structures exist with mode classes (real hiding verified in Playwright); transition-audit test per the global rules (every conditional render pair in §11 present-or-declared-instant). DOM label scans clone the tree and strip siblings that also render the label (e.g. section heading vs rail item share a label — scope queries to `…-review-rail` / `…-review-section-<id>` testids).
- **Real-browser (Playwright, pinned image):** every §5.1 invariant, at 390px (sheet), 800px (popup), 1280px (two-pane); drag-to-dismiss (pointer synthesis past/below threshold); scroll-spy activates the correct rail item after `scrollTo`; tap-target audit — assert `getBoundingClientRect().height ≥ 44` (± 0.5px) for the grab strip, each chip, each rail item, footer buttons, and the effective hit area of one crew tel/mailto action (§15 list). Template: `tests/e2e/step3-card-dimensions.spec.ts` (synthetic-HTML harness) — but the modal spec renders the REAL component tree via the existing e2e route pattern if available; otherwise the plan adds a fixture page. jsdom is not sufficient for any §5.1 assertion.
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
