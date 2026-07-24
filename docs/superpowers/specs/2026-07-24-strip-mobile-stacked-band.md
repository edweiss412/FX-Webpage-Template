# Spec: Stacked mobile control band for the published review modal (1B)

Date: 2026-07-24 (R1 repair)
Status: DRAFT (autonomous pipeline; user design-approval given 2026-07-24)
Owner: Opus / Claude Code (UI — ROUTING hard rule)
Deferred items resolved: `STRIP-MOBILE-WRAP-1`, `STRIP-SKELETON-MOBILE-BAND-1` (DEFERRED.md:11-25)

## §1 Summary

Below `sm`, the review modal's subheader control strip stops being an
incidentally wrapping row and becomes a deliberate stacked band, translated
from the user-authored "1B" card design (claude.ai/design project
`ffc051c0-d8d3-4509-8ec4-2d0bb140a7ed`, file `Event Card.dc.html`):

1. **R0 Badge row** — right-aligned status pill: Live / Published / Draft / Archived.
2. **R1 Publish row** — "Published" heading + state sublabel, ARIA switch right.
3. **D1** divider
4. **R2 Meta row** — health dot + "Synced {rel}" · "Edited {rel}" left, a
   bordered "Sync" trigger right (32px visual inside a 44px hit box, icon
   spins while pending).
5. **D2** divider
6. **R3 Actions row** — share-hub primary trigger stretched to fill + a
   bordered square kebab at the right edge.

At `≥sm` the strip renders and behaves exactly as today (markup gains hidden
mobile elements and `max-sm:*` classes, but no `≥sm` layout, label, or
behavior changes). Every mobile row's height is capped and data-independent,
which makes the skeleton band's height match the loaded band exactly for the
parity fixture's lifecycle and lets the parity spec assert the same ≤4px
equality at 390px that it already asserts at 1280px.

**Why (probe, 2026-07-24, real harness markup + compiled token CSS at 390px):**
band content width is 350px; the share-hub group is 164.8px ("Share link"
112.8 + kebab 44), the toggle group 120.4px, the live badge 71.8px, and the
worst-case status group ("Re-sync held (data loss)" + "Edited 59 min ago",
including its dot and gaps) is 271.9px. Today's incidental `flex-wrap`
(StatusStrip.tsx:187) therefore reshuffles rows with data: the parity fixture
wraps to 3 rows / 149px, while worst-case strings re-wrap to a 120px band with
different row membership. The skeleton's single 73px row cannot match either.

## §1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Visual source is the user's 1B card; a taller band (215px vs today's 149px wrap) is ACCEPTED — height was traded for clarity + determinism explicitly. | User approval 2026-07-24 (conversation; mock artifact `46d1a087`) |
| Phones only: every change is `max-sm:`-scoped or `sm:hidden`. `≥sm` layout/labels/behavior unchanged. | User answer "Phones only" 2026-07-24 |
| Badge states: "Live" only when `isLive` (page-computed `published && isShowLiveOnDate` passed as a prop, StatusStrip.tsx:43-45,80-81); "Published" when published and not live; "Draft" when unpublished; "Archived" when archived. NOT the 1B binary Live/Draft. | User answer 2026-07-24 |
| Sublabel copy: "Visible to crew" / "Hidden from crew". | User answer 2026-07-24 |
| R1 heading is "Published", DEVIATING from the approved "Publish show": the switch's accessible name is `aria-label="Published"` (PublishedToggle.tsx:228, pinned by existing tests) and WCAG 2.5.3 label-in-name requires the visible label to be contained in the accessible name — "Publish show" is not. One heading string serves both breakpoints' name computation. | This spec (a11y-forced deviation; user may veto) |
| Sync trigger: 32px visual height inside a 44px real hit box, label "Sync" below `sm`; desktop keeps the "Re-sync" text grid untouched (ReSyncButton.tsx:312-319). | User answer 2026-07-24 |
| 1B's tap-anywhere publish row is DROPPED: the switch (`SwitchButton`, a `type="submit"` form submitter — PublishedToggle.tsx:209-244, React-19 dispatch safety PublishedToggle.tsx:19-24) stays the only interactive element in the row. Its hit area meets the 44px floor via the existing `before:*` inset extension (PublishedToggle.tsx:233-235). | This spec; deviation from mock ratified here |
| ONE PublishedToggle instance and ONE ReSyncButton instance serve both breakpoints (responsive internals, never duplicate mounts): duplicate mounts would fork `useFormStatus` pending state, duplicate `data-testid="published-toggle"` / popover ids, and allow a second dispatch across a breakpoint cross. | This spec (R1 finding 2/3) |
| Rows are formed by full-width DIRECT children of the strip (no wrapper rows, no zero-height break elements) — preserving the executable direct-parent + DOM-order contracts (statusStrip.test.tsx:329-345), the §9 scanner-counted Re-sync mount form (StatusStrip.tsx:291-304), and avoiding phantom `gap-y` lines. | This spec (R1 finding 1; R2 finding 1) |
| ShareHub trigger labels unchanged in all lifecycles: "Share link" / "Share link · paused" / "Show actions" (ShareHub.tsx:418). Only geometry/border changes below `sm`. | User design pivot 2026-07-24 |
| DEFERRED.md:17's `basis-full` prescription is honored in mechanism (rows are explicit full-width flex lines) and superseded in layout by the user-approved 1B translation; its "NOT tightening spacing" constraint holds. | This spec |
| Live pill: `bg-accent-tint` + `text-accent-on-bg` + `bg-accent-on-bg` dot — all three legs of the DESIGN.md §1.2 pinned pair "accent-on-bg on accent-tint" (4.91:1 light / 8.03:1 dark; DESIGN.md:78). The raw-accent dot was rejected (≈2:1 on tint). Accent-tint's §1.1 usage note gains this pill. | This spec (R1 finding 8d) |
| No DB, no RPC, no advisory locks, no new mutation surfaces, no §12.4 codes. Invariants 2/3/9/10 N/A beyond existing coverage. | This spec |

## §2 Current state (verified citations)

- Strip root row: `flex w-full flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap` — StatusStrip.tsx:187.
- Direct children in DOM order: archived badge OR publish toggle wrapper (StatusStrip.tsx:189-206), control divider `hidden sm:block` (208-214), live badge (216-220), sync-age group `flex shrink-0 items-center gap-2` (222-266, class at 223), Re-sync mount `{!archived ? (` multi-line form pinned by the §9 lexical scanner (StatusStrip.tsx:291-304), share-hub group `ml-auto flex shrink-0 items-center` (314-328).
- jsdom contracts: Re-sync trigger's `parentElement` IS the strip (statusStrip.test.tsx:329-330) and DOM order is checked among the strip's direct children (333-345 region); root class list pins `flex-wrap`/`sm:flex-nowrap` presence (594-611); status single-row structure via `expectSingleRowStatus` (475-479).
- Band chrome from the shell: `relative w-full shrink-0 border-b border-border bg-surface px-tile-pad py-2` — ReviewModalShell.tsx:679-684. `relative` is the positioned ancestor for the ReSyncButton/PublishedToggle overlays (ReSyncButton.tsx:44-56; PublishedToggle.tsx:47-55).
- Skeleton band: single placeholder row `flex min-h-tap-min w-full flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap` with four `h-6` bars — ShowReviewModalSkeleton.tsx:112-124. The skeleton takes NO lifecycle input (ShowReviewModalSkeleton.tsx:32).
- Parity spec: `SEAM_TOL = 8` / `BAND_TOL = 4` (skeletonBandParity.spec.ts:81-82), viewports 390×844 / 1280×900 (85-88), popup-mode exact E (314-322), sheet-mode weak clause (323-342). Harness fixture is a published, non-archived, non-finalize show (tests/e2e/_skeletonParityHarness.tsx:154 area).
- Status buckets + labels: lib/admin/syncStatus.ts:21-44; longest label "Re-sync held (data loss)" (line 31). `formatRelative` (lib/admin/showDisplay.ts:97-107) is UNBOUNDED: day counts grow without limit and an unparseable ISO string is returned verbatim — mobile row heights therefore rely on the §3 truncation cap, not on any "longest string" assumption.
- Sync-age omit contract: `lastSyncedAt == null` → element absent (StatusStrip.tsx:35-41,132). `lastCheckedAt` null falls back to `lastSyncedAt` for the ok-bucket time (133-138).
- PublishedToggle: variants "card" | "inline" (PublishedToggle.tsx:83); subline strings incl. both finalize branches (97-103); `POPOVER_POSITION` error/generic banner (58-59); `FINALIZE_CHIP` (69-70); deterministic popover id `published-toggle-popover-${slug}` (121, pinned by PublishedToggle.test.tsx:218); `SwitchButton` (209-244) with `aria-label="Published"` (228) and pseudo-element hit extension (233-235; the button's real rect is 48×28). Archived shows never mount it — StatusStrip's `archived` ternary (StatusStrip.tsx:189-206) is the enforcing site.
- ReSyncButton: `IDLE_LABEL`/`PENDING_LABEL` (42-43); trigger + attrs (296-320, testid 301); overlay panels (67-68) anchor to the band. Existing testid consumers beyond the strip tests: pageTransitions.test.tsx:429, admin-lifecycle-transitions.spec.ts:249 (single-element locators — preserved by the single-instance rule).
- ShareHub: root `relative` container (367 area); primary trigger label ternary (418); kebab (423-437); caret/anchor measurement (172-211); popover closes when `published`/`archived` change while open (287); in-flow dev-capture status can render after the kebab (440).
- statusStripToggleLayout.spec.ts invariants (a)-(d) (file header 16-35): (a)/(c) measure the finalize CHIP at 390px; (b) measures at ≥sm; (d) uses a hand-built ErrorExplainer probe (tests/e2e/_statusStripToggleHarness.tsx:161 area), not a real settings-mode refusal.
- Help-label registry: tests/help/_uiLabelExceptions.ts is the help-doc↔production label declaration registry (purpose comment :33 area; "Re-sync" row :187). Help docs continue to describe the desktop control; no registry change is REQUIRED by this spec — the plan verifies the help scanners stay green with the added mobile label.
- lucide-react (package.json:76; ShareHub.tsx:62). Tap floor token `--spacing-tap-min: 44px` (app/globals.css:162). `text-xs` line box ≈16.8px (globals.css:106 type scale).
- Probe numbers (2026-07-24, this pipeline): content width 350.0; toggle group 120.4; live badge 71.8; worst status group 271.9 (incl. dot+gaps); hub 164.8 (primary 112.8 + kebab 44); fixture band 149 / skeleton 73; worst-data band 120 with different row membership.

## §3 Mobile band structure (`<sm`)

### Architecture: flat children, full-width items form the rows

The strip root KEEPS `flex w-full flex-wrap items-center gap-x-4 gap-y-2
sm:flex-nowrap` (no `flex-col`). There are NO break elements: in a wrapping
flex row, any item that is full-width (`w-full` or `basis-full`) necessarily
occupies its own flex line, and `gap-y-2` supplies exactly one 8px gap
between consecutive LINES (a zero-height break line would add a phantom
8px — R2 finding 1 — which this architecture avoids by having no such
lines). Mobile rows are therefore formed purely by which items are
full-width below `sm`:

- R0: the badge sits inside a NEW wrapper `<div class="hidden max-sm:flex
  w-full justify-end">` — full-width, so it is a line; `justify-end`
  right-flushes the pill.
- R1: the toggle's existing strip wrapper gains `max-sm:w-full` — a line.
- D1/D2 dividers: `<div aria-hidden="true" class="hidden max-sm:block h-px
  w-full bg-border" />` — each a 1px line.
- R2: sync-age + Re-sync trigger are NOT full-width; they share the line
  between the two dividers (all other <sm-visible neighbors are full-width).
- R3: `share-hub-group` gains `max-sm:w-full` — a line.

All strip children remain DIRECT children — the jsdom direct-parent and
DOM-order contracts and the scanner-counted `{!archived ? (` mount survive
unchanged.

Child sequence (DOM order; existing elements keep their order):

badge-wrapper(R0) · toggle-or-archived-badge(R1) · D1 ·
control-divider(existing, `hidden sm:block`) · live-badge(desktop-only) ·
sync-age + resync(R2) · D2 · share-hub-group(R3)

Divider presence: D1 renders iff R1 rendered (not archived); D2 renders iff
R2 rendered anything (sync-age present OR Sync trigger present). A row that
renders nothing also renders no adjacent divider, so no divider is ever
orphaned and no empty line ever forms.

### R0 Badge row — NEW elements (wrapper + pill), mobile-only

Wrapper: `hidden max-sm:flex w-full justify-end` (the row). Pill:
`data-testid="strip-state-badge"`, fixed box `h-6` (24px) `rounded-pill
px-2.5 text-xs font-semibold inline-flex items-center gap-1.5
whitespace-nowrap`, dot `size-2 rounded-pill shrink-0` (8px — spacing-scale
token, no arbitrary value; the §12 token rule DESIGN.md:343 forbids new
magic pixels, and the existing `size-[3px]` bullet at StatusStrip.tsx:259
predates it) + label — label always present (§1 color-blind floor). Height
is EXACTLY 24px by class, not by line box (text-xs line ≈16.8px centers
inside).

| State (evaluation order) | Label | Recipe |
| --- | --- | --- |
| `archived` | "Archived" | `border border-border bg-surface text-text-subtle`, dot `bg-text-faint` |
| `isLive` | "Live" | `bg-accent-tint text-accent-on-bg`, dot `bg-accent-on-bg` |
| `published` | "Published" | `bg-surface-sunken text-text-subtle`, dot `bg-status-positive` |
| else | "Draft" | `bg-surface-sunken text-text-subtle`, dot `bg-text-faint` |

Contrast: Live pill uses the DESIGN.md:78 pinned pair (accent-on-bg on
accent-tint 4.91:1/8.03:1) for BOTH text and dot. Published/Draft pills use
`text-text-subtle` on `bg-surface-sunken` — the FINALIZE_CHIP's existing
production pairing (PublishedToggle.tsx:69-70), inherited, not newly pinned.
`isLive` is trusted as passed (upstream computes `published &&
isShowLiveOnDate`, StatusStrip.tsx:43-45); if a caller ever passed
`isLive && !published`, precedence shows "Live" — garbage-in documented, not
guarded.

The desktop live badge (216-220) and desktop archived badge (191) each gain
`max-sm:hidden`; exactly one state signal exists per breakpoint
(`display:none` removes the hidden one from layout AND the a11y tree).

### R1 Publish row — PublishedToggle, single instance, new variant `"settings"`

StatusStrip's existing toggle wrapper (`strip-publish-toggle`, 197-206) swaps
`variant="inline"` for `variant="settings"` — ONE mount. The wrapper gains
`max-sm:w-full`. The settings variant is the inline variant made responsive
INTERNALLY (one form, one SwitchButton, one error/finalize state):

- Container: `inline-flex items-center gap-2 max-sm:flex max-sm:w-full
  max-sm:items-center max-sm:justify-between max-sm:gap-3 max-sm:min-h-tap-min`.
- Desktop label: the existing `<span>` "Published" (`text-sm font-medium
  text-text-strong`) gains `max-sm:hidden`.
- Mobile label block, `hidden max-sm:flex max-sm:min-w-0 max-sm:flex-col`:
  heading "Published" (`text-sm font-semibold text-text-strong`) + sublabel
  `data-testid="published-toggle-sublabel"` (`truncate text-xs
  text-text-subtle`; NO id — plain adjacent text, see the switch's
  describedby rule below). Sublabel
  text: `finalizeOwned` → the existing finalize sublines verbatim
  (PublishedToggle.tsx:97-101); else `published` → "Visible to crew"; else →
  "Hidden from crew". `truncate` caps R1 at one sublabel line — the long
  finalize sublines clip visually; assistive tech still receives the full
  string (visual clipping does not alter text alternatives).
- Switch: the existing `<form>` + `SwitchButton`, unchanged semantics/testid/
  aria-label. `aria-describedby` logic is UNCHANGED from today's inline rule
  verbatim: `showFinalize ? popoverId : undefined` (PublishedToggle.tsx:131)
  — any other rule would alter the DESKTOP switch's accessible description
  (an IDREF-referenced element contributes its text even while CSS-hidden,
  so an unconditional sublabel reference would leak into ≥sm — R3 finding 1,
  violating phones-only). During mobile finalize the referenced chip is
  `max-sm:hidden` but, being directly referenced, still supplies the
  description text — the same finalize copy the sublabel shows visibly. The
  sublabel carries NO id and no wiring; it is plain adjacent text.
- Error/generic-retry: the existing `POPOVER_POSITION` band-anchored banner,
  unchanged, ONE instance. The FINALIZE_CHIP renders `max-sm:hidden` (desktop
  ≥sm keeps today's chip exactly); below `sm` finalize copy is carried by the
  sublabel instead.
- Archived: toggle not mounted (existing StatusStrip ternary 189-206). The
  archived badge that occupies this slot today is `max-sm:hidden` (R0 carries
  the archived state on mobile), so when archived, R1's slot renders nothing
  below `sm` and D1 is omitted.

`≥sm` renders byte-identically to today's inline variant EXCEPT the inert
additions: `max-sm:*` classes, the hidden mobile label block, and the chip's
`max-sm:hidden` — the describedby wiring is bit-identical to today.

### R2 Meta row

- Sync-age group (222-266): gains `max-sm:shrink max-sm:min-w-0
  max-sm:overflow-hidden` (the existing `shrink-0` stays for `≥sm`; `max-sm:`
  variants override below it). Its status line (246) gains `max-sm:min-w-0
  max-sm:overflow-hidden`. Clip PRIORITY (R2 finding 4; scoping per R4
  finding 1): the health/synced span (`strip-synced-line`, 248) gains
  `max-sm:whitespace-nowrap max-sm:shrink-0` — never sacrificed IN FAVOR OF
  the Edited clause; the Edited span (261) gains `max-sm:whitespace-nowrap
  max-sm:min-w-0 max-sm:overflow-hidden max-sm:text-ellipsis` and clips
  first. Every clip/priority class is `max-sm:`-scoped — desktop computed
  styles are untouched. Boundary honesty (R3 finding 2):
  every CATALOG label (bounded, max "Re-sync held (data loss)") fits
  unclipped; a PATHOLOGICAL synced string (an unparseable ISO rendered
  verbatim, §10) can exceed the row and is then clipped at the row edge by
  the ancestor `overflow-hidden` — height still immutable, garbage text
  partially hidden, accepted. The row NEVER grows vertically. Honest
  worst-case math (incl. the trigger's real box — R2 finding 5): the
  trigger's existing outer `px-2` becomes `max-sm:px-0` so the inner skin
  owns all padding; item width ≈ 81 (15 icon + ~6 gap + "Sync" ~34 + 24
  `px-3` + 2 border). Worst row = 271.9 + 16 + 81 ≈ 369 > 350 → ~19px of the
  Edited tail clips; the health label (~150px worst alone) always fits
  (150 + 16 + 81 = 247 ≤ 350). Typical fixture: 195.8 + 16 + 81 ≈ 293, no
  clip. Clipping is the accepted cost of a hard height cap (unbounded
  `formatRelative` output makes any no-clip guarantee false).
- ReSyncButton (single instance, direct strip child): the trigger keeps
  `min-h-tap-min min-w-tap-min` as its REAL box (ReSyncButton.tsx:303) and
  gains `max-sm:ml-auto` (right-flush on its line). Inside the button, two
  breakpoint-gated content blocks:
  - `≥sm` (`max-sm:hidden`): the existing label grid (312-319), untouched.
  - `<sm` (`hidden max-sm:inline-flex items-center gap-1.5 h-8 px-3 rounded-sm
    border border-border`): `<RefreshCw size={15} aria-hidden>` + "Sync"
    (`size={15}` follows the existing strip-surface lucide literal precedent,
    ShareHub.tsx:414-416 — no new token needed). The bordered 32px (`h-8`)
    skin is an inner span; the BUTTON keeps `min-h-tap-min min-w-tap-min` as
    its real rect and its outer `px-2` becomes `max-sm:px-0` (the skin owns
    the padding). While `pending`: the icon gets `animate-spin
    motion-reduce:animate-none`; label stays "Sync"; `aria-busy` + `disabled`
    (existing, 296-303) carry the state.
  Accessible name: the button's name is its visible text — "Sync" below `sm`,
  "Re-sync"/"Syncing…" at `≥sm` (whichever block is `display:none` is excluded
  from name computation in real browsers; jsdom cannot compute this, so name
  assertions are browser-side, §9.4).
- Guard: `lastSyncedAt == null` → sync-age absent (existing omit contract);
  the Sync trigger still renders right-flushed and R2 keeps ≥44px. Archived →
  no trigger (existing 291-304 gate) and possibly no sync-age either
  (`archived && lastSyncedAt == null`): then R2 renders nothing and D2 is
  omitted per the §3 presence rules.

### R3 Actions row

Full-width chain (every intermediate link named — R1 finding 4):

- `share-hub-group` (StatusStrip.tsx:314): + `max-sm:w-full`.
- ShareHub ROOT container is ALREADY `relative flex items-center gap-2`
  (ShareHub.tsx:368): + `max-sm:w-full` only — it is already the flex context
  for the triggers.
- Primary trigger: + `max-sm:flex-1 max-sm:justify-center
  max-sm:min-h-tap-min max-sm:rounded-sm max-sm:border max-sm:border-border
  max-sm:whitespace-nowrap max-sm:min-w-0 max-sm:overflow-hidden` — the
  no-wrap + shrink contract keeps R3 at exactly one 44px line even when the
  dev-capture status (up to 192px) competes for the row: the label truncates
  horizontally instead of wrapping vertically (R4 finding 2).
- Kebab: + `max-sm:min-h-tap-min max-sm:min-w-tap-min max-sm:rounded-sm
  max-sm:border max-sm:border-border`.

The kebab stays the LAST trigger, so with the root at full band width the
group's right edge — the popover/caret anchor datum (ShareHub.tsx:172-211) —
remains the band's content right edge; the 390px popover-alignment assertion
(published-review-modal.interactions.spec.ts:804) must stay green unmodified.
The in-flow dev-capture status element (ShareHub.tsx:443-450) stays ON the
trigger line (the root has no `flex-wrap`) and self-bounds via its existing
`max-w-48 truncate`; with the primary's no-wrap + shrink contract above, its
appearance shortens the primary's label horizontally and NEVER adds a line —
R3's height is fixed at 44px in all states (R4 finding 2). The parity
harness renders a non-developer viewer (status absent); the jsdom suite pins
the primary's no-wrap classes so the contract is executable without a
dev-capture browser fixture.

## §4 Dimensional invariants (`<sm`, 390×844)

| Parent → child | Guarantee | Class |
| --- | --- | --- |
| band → strip root | full width | `w-full` (existing) |
| rows | own flex line each | full-width items (`w-full`) — no break elements |
| dividers | own 1px line | `hidden max-sm:block h-px w-full bg-border` |
| R0 wrapper | own line, pill right-flushed | `hidden max-sm:flex w-full justify-end` |
| R0 badge | fixed 24px | `h-6` |
| R1 container | full width, ≥44px, centered | `max-sm:w-full max-sm:min-h-tap-min max-sm:items-center` on the toggle container; `max-sm:w-full` on its strip wrapper |
| R1 label block | shrinkable column, one-line sublabel | `max-sm:min-w-0 max-sm:flex-col`, sublabel `truncate` |
| R2 sync-age | shrinks + clips, never wraps rows | `max-sm:shrink max-sm:min-w-0 max-sm:overflow-hidden`; `max-sm:`-scoped nowrap + ellipsis on text spans |
| R2 Sync trigger | ≥44×44 real box, right edge | `min-h-tap-min min-w-tap-min` (existing) + `max-sm:ml-auto` |
| R3 root chain | full width at every link | `max-sm:w-full` on group AND ShareHub root |
| R3 primary | fills remaining width, single line always | `max-sm:flex-1 max-sm:whitespace-nowrap max-sm:min-w-0 max-sm:overflow-hidden` |
| R3 kebab | ≥44×44 | `max-sm:min-h-tap-min max-sm:min-w-tap-min` |

Row heights below `sm` are hard-capped: R0 = 24 (`h-6`), R1 = max(44,
heading 20 + sublabel 16.8) ≈ 44 (truncate caps the sublabel at one line),
R2 = 44 when the trigger renders / 15 when only the status line does
(archived: `text-xs/tight` = 12px × 1.25 — StatusStrip.tsx:246; its 8px dot
is shorter), R3 = 44, dividers = 1px, one `gap-y-2` (8px) between
consecutive lines. Band BOX height adds the band's own `py-2` (16px) AND its
1px `border-b` (ReviewModalShell.tsx:682; `getBoundingClientRect` includes
the border). Full band = 24+8+44+8+1+8+44+8+1+8+44 = 198 content + 16 + 1 =
**215px**, a pure function of element PRESENCE (archived / never-synced),
never of text content. Presence variants: full (R0·R1·D1·R2·D2·R3, 215px),
never-synced (same rows, R2 left empty, 215px), archived
(R0·R2-status-only·D2·R3 = 24+8+15+8+1+8+44 = 108 content + 17 = 125px),
archived+never-synced (R0·R3 = 24+8+44 = 76 content + 17 = 93px).

## §5 Breakpoint × lifecycle mode boundaries

| Element | `<sm` | `≥sm` |
| --- | --- | --- |
| R0 badge | rendered, all lifecycles | `display:none` (`hidden max-sm:inline-flex`) |
| Desktop live badge / archived badge | `display:none` (`max-sm:hidden`) | rendered per existing rules |
| PublishedToggle (ONE instance, settings variant) | mobile label block + sublabel; chip hidden | today's inline presentation; mobile block hidden |
| Toggle error banner | same single banner (band-anchored) both sides | same |
| Finalize signal | sublabel copy | FINALIZE_CHIP (existing) |
| ReSyncButton (ONE instance) | icon+"Sync" block | text grid "Re-sync"/"Syncing…" |
| Breaks/dividers D1/D2 | rendered per §3 presence rules | `display:none` |
| ShareHub triggers | full-width split row | existing compact pair |
| Control divider (212) | hidden (existing class) | existing rules |

## §6 Skeleton (`ShowReviewModalSkeleton.tsx`)

The subHeader placeholder mirrors the loaded band per breakpoint:

- `≥sm`: the existing single row untouched (E = 0.00 at 1280 stays); it gains
  `max-sm:hidden`.
- `<sm` (new sibling block, `hidden max-sm:flex flex-wrap items-center gap-x-4
  gap-y-2 w-full` — same no-break-elements architecture as §3, every row a
  full-width item): badge row (`w-full flex justify-end` wrapper holding an
  `h-6 w-16 rounded-pill` bar), publish row (`min-h-tap-min w-full flex
  items-center justify-between`: label column bars `h-4 w-24` + `h-3 w-20`,
  switch bar `h-7 w-12 rounded-pill`), divider `h-px w-full`, meta row
  (`min-h-tap-min w-full flex items-center justify-between`: `h-4 w-44` bar,
  `h-8 w-16 rounded-sm` bar), divider, actions row (`w-full flex gap-2`:
  `h-11 flex-1 rounded-sm` bar + `h-11 w-11 rounded-sm` bar).

Widths are cosmetic; HEIGHTS and the row/divider/gap skeleton mirror §4's
caps exactly, so E ≤4px is assertable at 390 for the parity fixture.

**Scope honesty (R1 finding 5; numbers corrected per R2 finding 2 / R3
finding 3):** the skeleton has no lifecycle input
(ShowReviewModalSkeleton.tsx:32) and always renders the full-band 215px
placeholder. Exact parity is asserted FOR THE PARITY FIXTURE'S LIFECYCLE
(published, non-archived, non-finalize — the overwhelmingly common load).
Residuals for the other lifecycles, from the §4 variant table: archived
215−125 = **90px** over-reserve; archived + never-synced 215−93 = **122px**.
The band shrinks when such content arrives; this is a bounded, documented
residual, not a parity-spec subject. (Desktop archived has the same class of
residual today and is likewise untested.)

## §7 DESIGN.md delta

- §1.1 `--color-accent-tint` usage note (DESIGN.md:48): add the mobile Live
  pill to its scope (currently the bell active-count pill).
- §1.3 status-pill scope (DESIGN.md:89): add the mobile state badge
  (Live/Published/Draft/Archived); Live reuses the accent family per the
  existing "Live reuses `--color-accent`" rule, in its text-safe
  `accent-on-bg` form for both text and dot.
- §4 radii (DESIGN.md:219-228): no new radii; badge uses `--radius-pill`,
  bordered mobile buttons use `--radius-sm`.
- New copy inventory (no em-dashes; no apostrophes): "Published" (heading),
  "Visible to crew", "Hidden from crew", "Sync", "Live", "Draft", "Archived".

## §8 Transition inventory

Visual states. P (toggle): idle-on, idle-off, pending, refusal-error,
generic-error, finalize-locked. S (sync): idle, pending, success, error,
shrink-confirm. B (badge): live, published, draft, archived. K: skeleton,
loaded. V: <sm, ≥sm.

P pairs (15): on↔off = knob `transition-transform duration-fast`
(PublishedToggle.tsx:242); every pair involving pending = instant disable
(aria-busy), no animation; any↔refusal/generic banner = instant mount/unmount;
any↔finalize = instant (chip or sublabel swap on server refresh);
refusal↔generic = instant content swap; error-while-finalize = error banner
wins visibility (existing `showError` precedence, PublishedToggle.tsx:122-124)
— instant.

S pairs (10): idle↔pending = spin start/stop (`animate-spin`,
`motion-reduce:animate-none`), otherwise instant; pending↔success,
pending↔error, pending↔shrink-confirm = spin stops + overlay mounts instant;
idle↔success, idle↔error, idle↔shrink-confirm = overlay mount/dismiss instant
(dismiss buttons / next post clears — existing); success↔error,
success↔shrink-confirm, error↔shrink-confirm = mutually exclusive overlays,
instant swap (existing precedence: error suppresses shrink/success,
ReSyncButton.tsx:355,403).

B pairs (6): live↔published, live↔draft, live↔archived, published↔draft,
published↔archived, draft↔archived — ALL instant text/class swaps on server
refresh; no animation, deliberately (status is chrome, not motion).

K: skeleton↔loaded = instant in-place swap; heights equal per §6 for the
fixture lifecycle (that equality IS the feature). V: crossing `sm` = instant
CSS visibility swap; because toggle/resync are single instances, pending
state, error banners, and overlays PERSIST across the cross (same nodes).

Compound: ShareHub popover open while `published`/`archived` changes → the
popover closes ONLY when the hub is idle; while a hub action is in flight the
close is DEFERRED and the popover deliberately stays open after settlement so
its outcome stays readable (ShareHub.tsx:276-324; pinned by
shareHub.test.tsx:919-949) — unchanged behavior, restated because the badge
now also updates on the same refresh. Toggle pending
while Sync pending: independent forms, allowed; overlay z-order per existing
rule (ReSync z-50 over toggle z-40, ReSyncButton.tsx:52-56). Viewport cross
while any overlay open: overlays are band-anchored (`inset-x-0 top-full`) and
single-instance — they persist and keep full-band width.

## §9 Tests

1. **Parity spec** (skeletonBandParity.spec.ts): delete the sheet-mode weak
   clause (323-342); both viewports assert `E ≤ BAND_TOL` (4px). A-D
   unchanged. Header comments (28-38, 282-304) rewritten to cite this spec.
2. **Browser layout @390** (new spec or extension per plan; standalone
   harness pattern): with worst-case data (status text set to
   `syncStatusBucket("shrink_held").label` + a long relative form — derived
   from those functions at test runtime, not hardcoded): (a) row grouping by
   `getBoundingClientRect().y`: badge < publish < meta < actions bands, each
   element's y-range disjoint from other rows'; (b) NO horizontal overflow:
   band `scrollWidth === clientWidth` AND every row child's `right` ≤ band
   content right + 0.5; (c) R1/R2/R3 row heights within [44, 48]; (d) Sync
   trigger, kebab, and primary rects ≥44px tall; Sync + kebab ≥44px wide (the
   switch's 44px hit is pseudo-element-extended by existing design — asserted
   by its existing coverage, EXCLUDED here, R1 finding 7); (e) badge right
   edge within 1px of band content right; (f) THEN swap to fixture-typical
   strings and assert IDENTICAL row membership and row heights (the
   determinism assertion that fails on today's code); (g) desktop live badge
   has zero client rects at 390; R0 badge has zero client rects at 1280.
3. **jsdom statusStrip.test.tsx**: badge state matrix as LITERAL expected
   outcomes — `(archived:true, isLive:any, published:any) → "Archived"`,
   `(false, true, true) → "Live"`, `(false, false, true) → "Published"`,
   `(false, false, false) → "Draft"`, plus the contract-violation input
   `(false, true, false) → "Live"` documented as garbage-in — an enumerated
   table in the test body, never a mirrored precedence function (R1 finding
   9c). Sublabel strings for all four branches (published / hidden / both
   finalize sublines). `aria-describedby` UNCHANGED-rule assertion: attribute
   present iff `showFinalize`, exactly today's value (both variants).
   Existing direct-parent,
   DOM-order, and class-presence tests stay green unmodified (the architecture
   guarantees it — that IS the assertion).
4. **Browser a11y/naming**: at 390 the Sync trigger's accessible name is
   "Sync" and at 1280 it is "Re-sync" (`getByRole("button", { name })` in the
   real browser — jsdom cannot compute display-gated names, so these live in
   the layout spec, not jsdom). Toggle accessible name "Published" at both.
5. **statusStripToggleLayout.spec.ts migration**: (a)/(c) chip assertions move
   to a ≥sm viewport (chip unchanged there); 390px gains: finalize renders
   the truncated sublabel in-flow inside R1 (no chip, no overlay, R1 height
   still ≤48). (d) KEEPS its hand-built ErrorExplainer banner probe — the
   harness is static server-rendered HTML with no hydration, so a real
   refusal state is unreachable there (R2 finding 3; error state exists only
   after a form action runs, PublishedToggle.tsx:93-118). The settings-mode
   refusal is instead covered by (i) the existing probe pinning the banner's
   geometry classes at 390 and (ii) a NEW jsdom assertion that the settings
   variant's refusal branch renders the SAME `POPOVER_POSITION` class string
   the probe measures — together closing R1 finding 9a executably.
   (b) unchanged.
6. **ReSyncButton unit**: mobile block markup (RefreshCw + "Sync"), pending
   adds `animate-spin` + `aria-busy`; desktop grid untouched (existing
   T-RESYNC-WIDTH stays green).
7. **Impeccable dual-gate** (invariant 8) on the diff; pre-code mechanical
   checklist (44px, canonical classes, no em-dash) applied at plan time.
8. **Meta-test inventory:** none created or extended — no new Supabase call
   sites, no tile sentinels, no admin_alert codes, no advisory locks, no new
   mutation surfaces. The §9 strip lexical scanner count and help scanners
   are VERIFIED-green at plan time, not extended.

## §10 Guard conditions

| Input | Value | Behavior |
| --- | --- | --- |
| `lastSyncedAt` | null | sync-age absent; R2 keeps ≥44px (trigger present when not archived); with `archived` too → R2 and D2 absent |
| `lastSyncedAt` | invalid ISO | `formatRelative` returns it verbatim; R2 clips the tail (truncation cap) — no height change |
| `lastCheckedAt` | null | ok-bucket time falls back to `lastSyncedAt` via `??` (StatusStrip.tsx:137) |
| `lastCheckedAt` | invalid ISO | NO fallback (`??` passes non-null through); `formatRelative` returns the string verbatim; renders + clips |
| `lastSyncStatus` | null / "" / unknown | mapper yields "Not synced yet" / "Unknown sync state" buckets (syncStatus.ts:38-43); label renders only when `lastSyncedAt` non-null (the 132 null-guard short-circuits first) |
| `now` | invalid Date | NaN arithmetic falls through every `<` comparison to the days branch → renders "NaNd ago" deterministically (showDisplay.ts:101-107); display-only, clipped, no crash |
| `isLive` | true while `published` false | badge shows "Live" (precedence); upstream contract makes it unreachable (StatusStrip.tsx:43-45) — documented garbage-in |
| `archived` | true | R1+D1 absent, Sync absent, hub archived arm, badge "Archived" |
| `finalizeOwned` | true | switch disabled; `<sm` sublabel carries the finalize copy, `≥sm` chip (settings variant is the ONLY strip variant; card is out of strip scope) |
| `slug` | "" | popover id degrades to `published-toggle-popover-` AND the hub's crew URL degrades to `/show//<token>` (ShareHub consumes `slug` for the copy URL) — both today's existing inline/hub behavior, unchanged by this spec |
| `showId` | "" | passed through to the hub's rotate/reset mutation actions unchanged (existing behavior; those actions' own validation is out of scope) |
| `showTitle` | "" / whitespace | mailto builder trims and falls back to the bare "Crew link" subject/body (crewLinkMailto.ts:51-57,85-97) — existing behavior |
| `crewEmails` / `pickerCrew` | [] | ShareHub internals unchanged (out of scope) |
| `devCaptureSnapshot` | undefined | prop omitted via existing conditional spread (StatusStrip.tsx:326); dev-capture status row absent |
| status text overflow | any length | clipped horizontally (`overflow-hidden` + ellipsis); R2 height immutable |

## §11 Out of scope

Dashboard ShowsTable cards, the desktop strip presentation, ShareHub popover
contents, sync/publish semantics, telemetry, DB, the 1B file's "1A" concepts,
archived-lifecycle skeleton parity (documented residual, §6).

## §12 Close-out

Graduate `STRIP-MOBILE-WRAP-1` and `STRIP-SKELETON-MOBILE-BAND-1` to
DEFERRED-archive.md with pointers here.

Numeric inventory (value — §provenance): 350 content width (§2 probe); 271.9
worst status group, 195.8 typical (§2); 164.8/112.8/44 hub split (§2); 120.4
toggle group, 71.8 live badge (§2); 149/73/120 pre-change band heights (§2);
~81 Sync trigger item width (skin 15+~6+~34+24+2, outer `max-sm:px-0`) →
verified by §9.2 no-overflow assertion (§3 R2); ~369 > 350 worst-case row 2 →
~19px Edited-tail clip; ~150+16+81=247 health-label floor (§3 R2); 44 tap
floor `--spacing-tap-min` (§2); 4/8 E/D tolerances (§2); 24 badge height
`h-6`, 8px `size-2` badge dot (§3 R0); 16.8 text-xs line box (§2); 32/`h-8`
Sync visual skin (§3 R2); [44,48] row-height test band (§9.2); 215 full band
box = 198 content + 16 `py-2` + 1 `border-b`, 125 archived, 93
archived+never-synced (§4); 15 archived status-line height = 12 × 1.25
`text-xs/tight` (§4); 90/122 archived skeleton over-reserves = 215−125 /
215−93 (§6); 390×844 /
1280×900 parity viewports (§2); 48×28 switch real rect (§2); 15 lucide icon
literal (precedent ShareHub.tsx:414-416) (§3 R2); 1px dividers (§3); ~48
max-w-48 dev-capture truncation = 192px (§3 R3, existing).
