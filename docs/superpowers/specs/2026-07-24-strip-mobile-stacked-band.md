# Spec: Stacked mobile control band for the published review modal (1B)

Date: 2026-07-24
Status: DRAFT (autonomous pipeline; user design-approval given 2026-07-24)
Owner: Opus / Claude Code (UI — ROUTING hard rule)
Deferred items resolved: `STRIP-MOBILE-WRAP-1`, `STRIP-SKELETON-MOBILE-BAND-1` (DEFERRED.md:11-25)

## §1 Summary

Below `sm`, the review modal's subheader control strip stops being a wrapping
single row and becomes a deliberate stacked band, translated from the
user-authored "1B" card design (claude.ai/design project
`ffc051c0-d8d3-4509-8ec4-2d0bb140a7ed`, file `Event Card.dc.html`):

1. **Badge row** — a right-aligned status pill: Live / Published / Draft / Archived.
2. **Publish row** — "Publish show" label + state sublabel, ARIA switch right.
3. *divider*
4. **Meta row** — health dot + "Synced {rel}" · "Edited {rel}" left, a bordered
   "Sync" trigger right (32px visual, 44px hit, icon spins while pending).
5. *divider*
6. **Actions row** — share-hub primary trigger stretched `flex-1` + a bordered
   square kebab.

At `≥sm` the existing single-row strip is byte-for-byte unchanged. Every mobile
row's height is data-independent, which makes the skeleton band's height match
the loaded band exactly and lets the parity spec assert the same ≤4px equality
at 390px that it already asserts at 1280px.

**Why (probe, 2026-07-24, real harness markup + compiled token CSS at 390px):**
band content width is 350px; the share-hub group is 164.8px, the toggle 120.4px,
the live badge 71.8px, and the worst-case status line ("Re-sync held (data
loss)" + "Edited 59 min ago") is 271.9px. Today's incidental `flex-wrap`
(StatusStrip.tsx:187) therefore reshuffles rows with data: the parity fixture
wraps to 3 rows / 149px, while worst-case strings re-wrap to a 120px band with
different row membership. The skeleton's single 73px row cannot match either.

## §1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Visual source is the user's 1B card; band ≈210px is ACCEPTED (taller than today's 149px wrap). Height was traded for clarity + determinism explicitly. | User approval 2026-07-24 (conversation; mock artifact `46d1a087`) |
| Phones only: every change in this spec is `max-sm:`-scoped (or `sm:`-scoped hiding of new elements). `≥sm` strip markup/classes unchanged. | User answer "Phones only" 2026-07-24 |
| Badge states: "Live" only when `isLive` (page-computed `published && isShowLiveOnDate`, StatusStrip.tsx:43-45); "Published" when published and not live; "Draft" when unpublished; "Archived" when archived. NOT the 1B binary Live/Draft. | User answer 2026-07-24 |
| Copy: "Publish show" / "Visible to crew" / "Hidden from crew". Not 1B's "Publish event / Visible to everyone / Hidden from guests". | User answer 2026-07-24 |
| Sync trigger: 32px visual height, 44px tap area, label "Sync" below `sm`; desktop keeps "Re-sync" text button with width-reservation grid (ReSyncButton.tsx:312-319) untouched. | User answer 2026-07-24 |
| 1B's tap-anywhere publish row is DROPPED: the switch (`SwitchButton`, a `type="submit"` form submitter — PublishedToggle.tsx:209-244, React-19 dispatch safety PublishedToggle.tsx:19-24) stays the only interactive element in the row. A whole-row button would nest interactives and re-open the B1 dispatch class. Its hit area already meets the 44px floor via `before:*` inset extension (PublishedToggle.tsx:233-235). | This spec; deviation from mock ratified here |
| ShareHub trigger labels unchanged in all lifecycles: "Share link" / "Share link · paused" / "Show actions" (ShareHub.tsx:418). Only geometry/border change below `sm`. The earlier "Share"/"Live" label-trim exploration is superseded by the stacked layout (no width pressure: primary gets ~292px). | User design pivot 2026-07-24 |
| DEFERRED.md:17's prescribed fix ("status line dropped to its own row by explicit `basis-full`") is superseded by this user-approved redesign; the entry's *"NOT tightening spacing to squeeze one row"* constraint is honored (nothing is squeezed). | This spec |
| Live badge color: reuses `--color-accent-tint` bg + `--color-accent-on-bg` text — an existing pinned pair (DESIGN.md §1.2: 4.91:1 light / 8.03:1 dark). No new color token; DESIGN.md's accent-tint scope note gains this pill. Adjacent accent toggle + Live pill is deliberate and occurs only on show days. | This spec; DESIGN.md delta §7 |
| No DB, no RPC, no advisory locks, no new mutation surfaces, no §12.4 codes. Invariants 2/3/9/10 are N/A beyond existing coverage. | This spec |

## §2 Current state (verified citations)

- Strip root row: `flex w-full flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap` — StatusStrip.tsx:187.
- Children in DOM order: archived badge OR publish toggle (StatusStrip.tsx:189-206), control divider `hidden sm:block` (208-214), live badge (216-220), sync-age group + status line + bullet + edited (222-266), Re-sync mount `{!archived ? (` multi-line form pinned by the §9 lexical scanner (300-304), share-hub group `ml-auto` (314-328).
- Band chrome comes from the shell: `relative w-full shrink-0 border-b border-border bg-surface px-tile-pad py-2` — ReviewModalShell.tsx:679-684. `relative` is the positioned ancestor for ReSyncButton/PublishedToggle overlays (ReSyncButton.tsx:44-56, PublishedToggle.tsx:47-59).
- Skeleton band: single placeholder row `flex min-h-tap-min w-full flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap` with four `h-6` bars — ShowReviewModalSkeleton.tsx:112-124.
- Parity spec: tolerances `SEAM_TOL = 8` / `BAND_TOL = 4` (skeletonBandParity.spec.ts:81-82), viewports 390/1280 (85-88), popup-mode exact E (314-322), sheet-mode weak clause (323-342).
- Status buckets + labels: lib/admin/syncStatus.ts:21-44; longest label "Re-sync held (data loss)" (line 31). Relative strings bounded by formatRelative (lib/admin/showDisplay.ts:97-107; longest form "59 min ago").
- Sync-age omit contract: `lastSyncedAt == null` → element absent (StatusStrip.tsx:35-41,132).
- PublishedToggle variants "card" | "inline" (PublishedToggle.tsx:83); subline strings incl. finalize copy (97-103); error/generic popover `POPOVER_POSITION` (58-59); finalize chip (69-70).
- ReSyncButton: `IDLE_LABEL = "Re-sync"` / `PENDING_LABEL = "Syncing…"` (ReSyncButton.tsx:42-43); trigger classes with `min-h-tap-min min-w-tap-min` (303); overlay panels anchor to the band (67-68); help-label registry row `label: "Re-sync"` (tests/help/_uiLabelExceptions.ts:187).
- lucide-react is the icon system (package.json:76; ShareHub.tsx:62).
- Tap floor token `--spacing-tap-min: 44px` (app/globals.css:162).
- Probe numbers (2026-07-24, this pipeline): content width 350.0; toggle 120.4; live 71.8; worst status 271.9; hub 164.8 ("Share link" 112.8 + kebab 44); fixture band 149 / skeleton 73; worst-data band 120 with different row membership.

## §3 Mobile band structure (`<sm`)

The strip root keeps its testids and DOM order contract (toggle → status →
Re-sync → hub) and becomes a column below `sm`:

- Root: add `max-sm:flex-col max-sm:items-stretch max-sm:gap-y-0` alongside the
  existing classes. (Tailwind v4 does not default `.flex` to `align-items:
  stretch` — the stretch is explicit.) `≥sm` classes are untouched; every new
  element below is `sm:hidden`, and every element that changes shape does so
  only under `max-sm:` variants.

Rows top→bottom (each row is a direct flex-column child spanning the band):

### R0 Badge row — NEW element, `sm:hidden`

`data-testid="strip-state-badge"`, right-aligned (`max-sm:self-end`). One pill,
`rounded-pill` (DESIGN.md §radius: status pills), `text-xs font-semibold`,
dot + label (label always present — §1 color-blind floor):

| State (evaluation order) | Label | Recipe |
| --- | --- | --- |
| `archived` | "Archived" | `border border-border bg-surface text-text-subtle` + `bg-text-faint` dot |
| `isLive` | "Live" | `bg-accent-tint text-accent-on-bg` + `bg-status-live` dot |
| `published` | "Published" | `bg-surface-sunken text-text-subtle` + `bg-status-positive` dot |
| else | "Draft" | `bg-surface-sunken text-text-subtle` + `bg-text-faint` dot |

All pairs are already pinned in DESIGN.md §1.2 (accent-on-bg on accent-tint
4.91:1/8.03:1; text-subtle on sunken/surface pre-existing). No new tokens.

The desktop live badge (`strip-live-badge`, StatusIndicator "Live now",
StatusStrip.tsx:216-220) gains `hidden sm:inline` — well, precisely: its
wrapper becomes `max-sm:hidden` so exactly one live signal exists per
breakpoint. The desktop archived badge (`strip-archived-badge`) likewise
becomes `max-sm:hidden`; R0 carries the archived signal below `sm`.

### R1 Publish row — PublishedToggle variant `"settings"`, `sm:hidden` wrapper

StatusStrip renders the toggle twice, breakpoint-gated: the existing
`variant="inline"` mount inside a `max-sm:hidden` wrapper (desktop unchanged),
and a new `variant="settings"` mount inside a `sm:hidden` wrapper. Only one is
in the a11y tree at a time (`display:none` removes the hidden one).

`variant="settings"` renders: `min-h-tap-min` row, `flex items-center
justify-between gap-3`; left block = `<span>` "Publish show" (`text-sm
font-semibold text-text-strong`) over a sublabel (`text-xs text-text-subtle`,
`data-testid="published-toggle-sublabel"`); right = the existing
`SwitchButton` in the existing `<form>` (submitter semantics, disable rules,
`aria-label="Published"` all unchanged). Sublabel text:

- `finalizeOwned` → the existing finalize sublines verbatim (PublishedToggle.tsx:97-101);
- else `published` → "Visible to crew";
- else → "Hidden from crew".

The switch carries `aria-describedby` → sublabel id (always, in this variant —
the sublabel always states the consequence). Error/generic-retry rendering
reuses the inline variant's `POPOVER_POSITION` band-anchored popover unchanged;
the finalize CHIP is not used (the sublabel already carries finalize copy).
Archived: never mounted (unchanged contract, PublishedToggle.tsx:12).

### D1 Divider — NEW, `sm:hidden`

`<div aria-hidden="true" class="sm:hidden h-px w-full bg-border my-2" />`
between R1 and R2, and again (D2) between R2 and R3. Dividers render whenever
both neighbors render; archived (no R1) renders no D1. `my-2` (8px) keeps the
band nearer ~200px than the mock's 20px margins; the mock's spacing is
illustrative, tokens govern.

### R2 Meta row

The existing `strip-sync-age` group keeps its internals (dot, `syncLabel`,
bullet, `Edited {rel}` — StatusStrip.tsx:222-266) and gains `max-sm:min-w-0`
(pathological text wraps internally rather than widening the row). The row is
`max-sm:flex max-sm:w-full max-sm:items-center max-sm:justify-between
max-sm:min-h-tap-min`; guard: when `lastSyncedAt == null` the sync-age element
is absent (existing omit contract) and the Sync trigger right-aligns alone —
row height is still `min-h-tap-min`, so band height is unchanged by the guard.

ReSyncButton below `sm`: the trigger swaps its label block to
`<RefreshCw size={15} aria-hidden>` + "Sync" (visible text = accessible name;
no aria-label override) inside a bordered skin: `border border-border
rounded-sm h-8 px-3` visual, tap area extended to 44px via the existing
`min-h-tap-min` on an outer padding box (`before:*` inset extension, the
SwitchButton precedent PublishedToggle.tsx:227-229, or explicit
`min-h-tap-min` with transparent overflow — implementation's choice, asserted
by the 44px tap test). While `pending`: icon gets `animate-spin
motion-reduce:animate-none`, label stays "Sync", `aria-busy` + `disabled`
carry the state (existing props, ReSyncButton.tsx:296-303). The `≥sm` label
grid (312-319) renders under `max-sm:hidden`; the mobile block under
`sm:hidden`. Both live inside the ONE existing `<button>` — testid, refs,
overlay anchoring (67-68) and the §9 scanner-counted mount form
(StatusStrip.tsx:300-304) unchanged. Help-label registry
(tests/help/_uiLabelExceptions.ts:187) gains/updates a row for the "Sync"
visible label per that file's conventions.

### R3 Actions row

`share-hub-group` (StatusStrip.tsx:314) gains `max-sm:w-full` (keeps
`ml-auto`; at full width it is inert). Inside ShareHub, below `sm`: primary
trigger gains `max-sm:flex-1 max-sm:justify-center max-sm:min-h-tap-min
max-sm:rounded-sm max-sm:border max-sm:border-border`; kebab gains
`max-sm:min-h-tap-min max-sm:min-w-tap-min max-sm:rounded-sm max-sm:border
max-sm:border-border`. Labels and icons unchanged (§1.1). Popover/caret anchor
math is measured per open against the group's right edge (ShareHub.tsx:172-187)
— unchanged code; the browser test re-verifies at 390px.

### Removed below `sm`

The control divider `strip-control-divider` is already `hidden sm:block`
(StatusStrip.tsx:212) — unchanged.

## §4 Dimensional invariants (`<sm`, 390×844)

| Parent → child | Guarantee | Class |
| --- | --- | --- |
| band → strip root | full width | `w-full` (existing) |
| strip root → every row | full width | `max-sm:items-stretch` on root |
| R0 badge | right edge | `max-sm:self-end` |
| R1 row height | ≥44px | `min-h-tap-min` |
| R1 → switch | vertical center | `items-center` |
| R2 row height | ≥44px | `max-sm:min-h-tap-min` |
| R2 → sync-age | may shrink/wrap, never widen row | `max-sm:min-w-0` |
| R3 → primary | fills remaining width | `max-sm:flex-1` |
| R3 → kebab | ≥44×44 | `max-sm:min-h-tap-min max-sm:min-w-tap-min` |
| D1/D2 | 1px full-width rule | `h-px w-full` |

Band height is a pure function of element PRESENCE (archived / never-synced /
live), never of text content. The three presence variants and their expected
row sets: full (R0,R1,D1,R2,D2,R3), never-synced (same rows; R2 left side
empty), archived (R0,R2\{Sync},D2,R3). The parity fixture exercises "full".

## §5 Breakpoint × lifecycle mode boundaries

| Element | `<sm` | `≥sm` |
| --- | --- | --- |
| R0 badge | rendered (all lifecycles) | hidden (`sm:hidden`) |
| Desktop live badge / archived badge | hidden (`max-sm:hidden`) | rendered (existing rules) |
| PublishedToggle | `settings` variant | `inline` variant |
| Dividers D1/D2 | rendered (presence rules §3) | hidden |
| ReSyncButton label | icon + "Sync" | text grid "Re-sync"/"Syncing…" |
| ShareHub triggers | full-width split row | existing compact pair |
| Control divider | hidden (existing) | existing rules |

## §6 Skeleton (`ShowReviewModalSkeleton.tsx`)

The subHeader placeholder mirrors the loaded band per breakpoint:

- `≥sm`: existing single row untouched (E = 0.00 at 1280 stays).
- `<sm` (`sm:hidden` stacked column, same row classes as §4): badge chip
  (`h-6 w-16 rounded-pill self-end`), publish row (`min-h-tap-min`: two
  stacked bars `h-4 w-24` / `h-3 w-20` left, `h-7 w-12 rounded-full` switch
  bar right), divider `h-px bg-border my-2`, meta row (`min-h-tap-min`: `h-4
  w-44` bar left, `h-8 w-16 rounded-sm` bar right), divider, actions row
  (`h-11 flex-1 rounded-sm` + `h-11 w-11 rounded-sm`). The existing 4-bar row
  becomes `max-sm:hidden`.

Placeholder widths are cosmetic; HEIGHTS are the contract and come from the
same min-h classes as the loaded rows, so E ≤4px is honestly assertable.

## §7 DESIGN.md delta

- §1.2 usage note on `--color-accent-tint`: add the mobile band's Live pill to
  its scope line (currently bell active-count pill only). Contrast rows
  already pinned; no numeric changes.
- §1.3 status-pill scope: add the mobile state badge (Live/Published/Draft/
  Archived) to the allowed pill list; Live reuses accent per the existing
  "Live reuses `--color-accent`" rule.
- New copy inventory (no em-dashes; no straight apostrophes needed): "Publish
  show", "Visible to crew", "Hidden from crew", "Sync", "Live", "Published",
  "Draft", "Archived".

## §8 Transition inventory

States: publish on/off (P), sync idle/pending/success/error/shrink-confirm (S),
badge Live/Published/Draft/Archived (B), skeleton→loaded (K), breakpoint cross (V).

| Pair | Treatment |
| --- | --- |
| P on↔off | existing switch knob `transition-transform duration-fast` (PublishedToggle.tsx:242) — unchanged |
| P → refusal popover in/out | instant (existing) |
| S idle→pending | icon `animate-spin` starts; instant otherwise (`motion-reduce:animate-none` → instant everywhere) |
| S pending→idle/success/error | spin stops; overlay panels mount instant (existing) |
| B any→any | instant — server refresh remounts text; no animation |
| K skeleton→loaded | instant in-place swap; heights equal by §6 (that is the feature) |
| V crossing `sm` | instant CSS visibility swap; no animation |
| Compound: toggle while S pending | allowed (independent controls); overlays stack per existing z rules (ReSyncButton z-50 vs toggle popover z-40, ReSyncButton.tsx:52-56) |
| Compound: badge changes while popover open | popover anchored to band bottom (`top-full`); band height unchanged by badge text → no reflow |
| Compound: viewport crosses `sm` while overlay open | overlay is band-anchored (`inset-x-0 top-full`), unaffected by which strip layout renders |

## §9 Tests

1. **Parity spec** (tests/e2e/skeletonBandParity.spec.ts): delete the
   sheet-mode weak clause (323-342); both viewports assert `E ≤ BAND_TOL`
   (4px). A–D unchanged. Comment blocks referencing the reported finding
   (28-38, 282-304) rewritten to cite this spec.
2. **Browser layout @390** (extend tests/e2e/statusStripToggleLayout.spec.ts
   or the parity harness spec — plan decides file): with worst-case data
   (status text set to `syncStatusBucket("shrink_held").label` + longest
   `formatRelative` form — DERIVED from those functions, not hardcoded):
   assert (a) row grouping by `getBoundingClientRect().y` — badge < publish <
   meta < actions bands, each element's y-band disjoint; (b) publish/meta/
   actions row heights ≥44; (c) Sync + kebab + switch tap boxes ≥44×44;
   (d) badge right-flush within 1px of content edge; (e) THEN swap to
   fixture-typical strings and assert the SAME row membership (determinism —
   the assertion that fails on today's code).
3. **jsdom** (tests/components/admin/showpage/statusStrip.test.tsx): badge
   state matrix from props (archived > live > published > draft, exercising
   precedence incl. `archived && published`), settings-variant sublabel
   strings incl. both finalize branches, `aria-describedby` wiring, single
   live-signal rule (both badge testids present with the correct
   `max-sm:hidden`/`sm:hidden` classes — jsdom pins classes, browser pins
   geometry). Anti-tautology: expected badge label computed from the same
   props the fixture feeds, never from the rendered container.
4. **ReSyncButton**: mobile block renders RefreshCw + "Sync"; pending sets
   `animate-spin` + `aria-busy`; accessible name is "Sync" below sm markup
   (visible-text naming, no aria-label); desktop grid untouched (existing
   T-RESYNC-WIDTH stays green).
5. **Impeccable dual-gate** (invariant 8) on the diff; pre-code mechanical
   checklist (44px, canonical classes, no em-dash) applied at plan time.
6. **Meta-test inventory:** none created or extended — no new Supabase call
   sites, no tile sentinels, no admin_alert codes, no advisory locks, no new
   mutation surfaces (declaration per writing-plans rule). The §9 strip
   lexical scanner and help-label registry are UPDATED, not extended in kind.

## §10 Guard conditions

| Input | null/empty/false | Behavior |
| --- | --- | --- |
| `lastSyncedAt` | null | sync-age absent; R2 keeps `min-h-tap-min`; Sync trigger still renders (non-archived) |
| `lastSyncStatus` | null/"" | bucket "Not synced yet" via existing mapper; badge unaffected |
| `isLive` | false | badge falls through to Published/Draft |
| `archived` | true | R1 absent, D1 absent, Sync absent, hub archived arm; badge "Archived" |
| `finalizeOwned` | true | switch disabled + finalize sublabel (both variants) |
| `crewEmails`/`pickerCrew` | [] | ShareHub internals unchanged (out of scope) |
| status text overflow (hypothetical >350px) | — | `max-sm:min-w-0` wraps text inside R2; row grows vertically only in that pathological case; determinism assertion uses real worst-case strings which fit (331.9 ≤ 350) |

## §11 Out of scope

Dashboard ShowsTable cards, the desktop strip, ShareHub popover contents,
sync/publish semantics, telemetry, DB. The 1B design file's "1A" concepts.

## §12 Close-out

Graduate `STRIP-MOBILE-WRAP-1` and `STRIP-SKELETON-MOBILE-BAND-1` to
DEFERRED-archive.md with pointers here. Numeric sweep note: 350 (content
width), 271.9 (worst status), 164.8/112.8/44 (hub/primary/kebab), 120.4
(toggle), 71.8 (live), 149/73/120 (bands), 44 (tap floor), 4/8 (E/D
tolerances) — each appears with its §2 provenance.
