# Gallery switcher slim bar (ATTN-GALLERY-CONTROLBAR-OVERLAP-1 fix)

Date: 2026-07-21. Un-defers `ATTN-GALLERY-CONTROLBAR-OVERLAP-1` (DEFERRED.md:11). Amends the
parent gallery spec's §3.4 layout invariant
(`docs/superpowers/specs/2026-07-21-attention-modal-switcher-gallery-design.md:118`).

## 1. Problem

The switcher control bar (`components/admin/dev/SwitcherControls.tsx:55`,
`fixed inset-x-0 top-0 z-60`) stacks a control row plus up to two footnote lines
(`SwitcherControls.tsx:76-86`), reaching ~90px tall on desktop and taller when the
row wraps at 390px (`flex flex-wrap`, `SwitcherControls.tsx:57`). It covers the
modal's constant fake-show header. The parent spec's [R1-12] invariant protected the
close button and footer but not the header; the impeccable critique tagged the
overlap P2.

**Fix (Option A, user-ratified 2026-07-21 via mockup comparison):** the bar becomes a
single non-wrapping row; the footnotes move behind a collapsed-by-default disclosure.
The collapsed bar then fits inside the empty scrim band above the modal panel on both
target viewports. The modal and shell are untouched.

## 1.1 Resolved scope — do not relitigate

- **Option A over Option B (offset the modal).** User-ratified 2026-07-21 after a
  side-by-side mockup. Option B was rejected because it reaches into the shared
  `ReviewModalShell` positioning (`components/admin/review/ReviewModalShell.tsx:582`)
  for a dev-only instrument and shrinks usable modal height. Do not propose modal or
  shell edits.
- **Expanded panel MAY transiently overlap the modal** (header, and — within its
  `max-h-[40vh]` cap — body content below it; at 390px full-bar width this can
  include the close X). Opening the disclosure grows the bar downward. Ratified: it
  is user-invoked, dismissible with one tap on the same toggle, and z-60 above the
  modal by design (parent spec §3.4); the collapse affordance itself is never
  covered (it lives in the always-visible control row). The non-overlap invariant
  binds the COLLAPSED (default) state only.
- **Dev-instrument carve-outs stand.** The parent spec's a11y carve-out (bar outside
  the `aria-modal` tree, arrow-key navigation) and raw-codes carve-out
  (`data-codes` attribute, no visible codes — invariant 5) are unchanged
  (parent spec §1.1/§3.4).
- **Height cap amendment: ≤56px becomes ≤64px collapsed.** The [R1-12] cap of 56px
  was never achievable with 44px tap targets + `py-2` (8+44+8+1px bottom border =
  61px, `border border-t-0`) and
  the shipped bar never met it. The amended invariant: collapsed height ≤64px
  (exclusive of safe-area inset, §2.1.1); expanded state is transient and bounded
  only by the panel's own `max-h-[40vh]` cap (§2.3).
- **Visible copy of the two footnote lines is unchanged** (only their placement moves
  behind the disclosure). "Prev"/"Next" button text unchanged.

## 2. Design — `SwitcherControls` only

Single production-component change: `components/admin/dev/SwitcherControls.tsx` (tests,
DEFERRED.md, DEFERRED-archive.md, and this spec also change; no other production
file). New component-local
state `const [showExcluded, setShowExcluded] = useState(false)`.

### 2.1 Control row (always rendered)

- Row container: `flex flex-nowrap items-center gap-x-2` (was
  `flex flex-wrap items-center gap-x-3 gap-y-1`, `SwitcherControls.tsx:57`).
  No wrapping at any width; the live-region wrapper is the only shrinkable DIRECT
  row child, and within it the label truncates
  (existing `min-w-0 truncate`, `SwitcherControls.tsx:70`).
- Children, in order: Prev button, Next button, live-region wrapper (count + label,
  unchanged), tier chip (`shrink-0`, unchanged), and — only when
  `excluded.length > 0` — the disclosure toggle.
- Shrink topology: the live-region wrapper keeps `flex min-w-0 flex-1` (it is the
  ONLY shrinkable row child); inside it the count span stays `shrink-0` and the
  label keeps `min-w-0 truncate`, so all width deficit lands on the label. Every
  other direct row child (both buttons, chip, toggle) is `shrink-0`.
- Width budget at 390px (px-4 container = 32px): five direct row children (Prev,
  Next, live-region wrapper, chip, toggle) make FOUR `gap-x-2` gaps. Fixed widths:
  Prev ~54 + Next ~54 + chip ~44 + toggle ~80 + 4 gaps × 8 = 32 → ~264px, leaving
  ~94px for the wrapper; inside it the count (~34) + its internal `gap-2` (8)
  leave ≥50px for the truncating label.
- Budget bounds: the supported minimum viewport is 390px (project mobile-primary,
  `playwright.config.ts:40`). Counts are catalog-pinned two-digit values — the e2e
  pins 3 structural + a cut count derived from `DOUG_EXCLUDED_CODES`
  (`tests/e2e/attention-modal-gallery.spec.ts:335`, `lib/dev/attentionScenarios/tier2.ts:73`)
  and the rendered total is ≤ the catalog size (currently 41) — so the fixed-width
  sum cannot grow past the budget. These are facts about the catalog, not a
  component-boundary clamp (§3 guard rows tolerate degenerate numbers): the
  ENFORCEMENT is the e2e geometry test (§5), which renders the real catalog and
  fails on `bar.height > 64` or row overflow if the catalog ever grows the counts
  past the budget. No runtime clamp is added (dev instrument; a wrong number
  visible in the bar is a feature, not a fault to mask). Below 390px the bar clips
  at the viewport edge (dev instrument; no supported sub-390 viewport).

### 2.1.1 Safe-area handling

The bar container's `py-2` is split into `pb-2` plus
`pt-[calc(--spacing(2)+env(safe-area-inset-top,0px))]` — a single top-padding
declaration that is ADDITIVE (8px + inset), never two competing `padding-top`
assignments (Tailwind emits one `padding-top`, so `py-2 pt-[...]` cascade-ordering
is avoided by construction). The ≤64px collapsed cap in §2.4/§2.5 is defined
EXCLUSIVE of that inset: collapsed height ≤ 64px + `env(safe-area-inset-top)`. Both
e2e viewports (Chromium 1280×800 and 390×844) report a 0px inset, so the e2e's
numeric assertion of ≤64px is exact there; a notched device adds only the inset the
OS reserves anyway.

Nonzero-inset bound (not e2e-tested; proven by arithmetic): the collapsed bar is
≤64px + inset. On mobile the sheet is bottom-anchored at `max-h-[85vh]`
(`items-end`, `ReviewModalShell.tsx:582`; `max-h-[85vh]` at `ReviewModalShell.tsx:618`), so its top edge is ≥15vh from
the viewport top — ≥126.6px at 844px height. The largest shipped iOS top inset is
59pt, giving a worst-case bar of 123px < 126.6px: the collapsed bar clears the
sheet on every current device. Desktop viewports have a 0px inset, where the
64px bar sits inside the ≥80px scrim band (§2.4). If a future device ships an
inset > 62px, the collapsed-state invariant degrades to header overlap only —
acceptable for a dev instrument and recorded here rather than engineered around.

### 2.2 Disclosure toggle

- `<button type="button">`, visible text `{excluded.length} excluded` (e.g.
  "31 excluded"), `text-xs`, `shrink-0`, tap-target classes
  `min-h-tap-min min-w-tap-min` (token `--spacing-tap-min: 44px`,
  `app/globals.css:162`).
- `aria-expanded={showExcluded}`; `aria-controls="switcher-excluded-panel"` set only
  while the panel is rendered. The visible text is the accessible name (no
  `aria-label`; the count is static per mount).
- Rendered ONLY when `excluded.length > 0`; zero excluded → no toggle, no panel.
- `data-testid="attention-switcher-excluded-toggle"`.

### 2.3 Excluded panel (conditional)

- Rendered only while `showExcluded`; `id="switcher-excluded-panel"`,
  `data-testid="attention-switcher-excluded-panel"`.
- Content: the two existing grouped lines verbatim (structural line when
  `structural.length > 0`, cut line when `cut.length > 0` —
  `SwitcherControls.tsx:76-86` copy unchanged).
- Cap/truncation: the panel gets `max-h-[40vh] overflow-y-auto` and its `<p>` lines
  keep normal word wrap (labels are catalog-authored short strings; the cut line is
  a count, not a list). Content beyond 40vh scrolls inside the panel; the panel
  never escapes the viewport.
- Bar container keeps `flex-col gap-1` (`SwitcherControls.tsx:55`): row on top,
  panel (when open) below; the bar grows downward.
- State is component-local and persists across scenario steps (the bar is not keyed
  per scenario; only `PublishedReviewModal` remounts, parent spec §3.3). `excluded`
  is constant per mount, so no reset logic is needed.

### 2.4 Amended layout invariant (supersedes parent [R1-12] wording)

The bar is `fixed`, `z-60`, top-center, respects `env(safe-area-inset-top)` (§2.1.1),
and in its COLLAPSED state: height ≤64px (exclusive of safe-area inset, §2.1.1) and
MUST NOT intersect ANY of the surfaces the parent [R1-12] invariant protects — the
nav rail, section controls, banners, modal body — nor the modal's
header (`data-testid="published-show-review-header"`,
`ReviewModalShell.tsx:647` via `TESTID_BASE = "published-show-review"`,
`components/admin/showpage/PublishedReviewModal.tsx:72`), close button
(`published-show-review-close`), or footer (`published-show-review-footer`,
`ReviewModalShell.tsx:696`). The e2e asserts non-intersection with the modal PANEL
box itself (`published-show-review-modal`, `ReviewModalShell.tsx:578`) plus the
header, close, and footer boxes. The nav rail, section controls, and banners are
all DESCENDANTS of the panel (they render inside the modal's DOM subtree, so their
boxes are clipped to the panel by its `overflow-clip`, `ReviewModalShell.tsx:618`);
clearing the panel box therefore clears every one of them — a containment argument,
not a vertical-ordering guess. The ratified
expanded-state exception (§1.1) permits modal overlap within the panel's maximum
extent — 64px + `env(safe-area-inset-top)` + 4px (`gap-1` between row and panel)
+ 40vh; at the e2e viewports (inset 0) that is 388px of 800 (desktop) and 405.6px
of 844 (mobile). No narrower expanded-state geometry is claimed: whatever falls
inside that extent is covered by the §1.1 ratification. Geometry headroom: the panel is `max-h-[85vh]` mobile /
`sm:max-h-[80vh]` desktop (`ReviewModalShell.tsx:618`), so the scrim band above the
panel is ≥120px at 390×844 (bottom sheet) and ≥80px at 1280×800 (centered), vs the
≤64px collapsed bar.

## 2.5 Dimensional Invariants

No fixed-height or fixed-width parent contains flex/grid children in this component:
the bar's height is content-driven (row + optional panel) and its width is
`inset-x-0 mx-auto max-w-3xl`. The dimensional contracts are therefore geometric,
not stretch-based, and each is guaranteed by an explicit class:

| Relationship | Guarantee |
| --- | --- |
| Collapsed bar height ≤64px | Single row (`flex-nowrap` — no second line possible); row content is single-line text in 44px-MINIMUM (`min-h-tap-min`) content-sized buttons that render at 44px (one text line ≈17px + padding never exceeds the minimum), + 8px `pb-2` + 8px base of the split top padding (§2.1.1) + 1px bottom border (`border border-t-0`) = 61px computed (observed within 1px). The ≤64px UPPER bound is enforced by the e2e assertion (§5), not by any max-height class. |
| Row content never overflows the bar at supported viewports (≥390px) with catalog-derived inputs (§2.1 budget bounds) | Fixed children `shrink-0`; wrapper `min-w-0 flex-1`; label `min-w-0 truncate` absorbs all deficit. Sub-390 clipping and degenerate numeric props (§3) are outside this invariant by design. |
| Bar never intersects modal header/close/footer (collapsed) | `fixed top-0` bar ≤64px vs scrim band ≥80px above the panel (§2.4 math); pinned by the real-browser `getBoundingClientRect`/`boundingBox` e2e (§5), not jsdom. |

## 3. Guard conditions

| Input / state | Edge | Behavior |
| --- | --- | --- |
| `excluded` empty | | No toggle, no panel; row otherwise identical. |
| `index` zero | valid (zero-based) | Count renders `index + 1` — `0` renders as `1 / total`. |
| `index` negative or NaN | out-of-catalog | Count renders the shifted value verbatim (`-1` renders `0`; NaN renders `NaN`) — display-only, no gating. Props are catalog-derived and pinned valid by catalog unit tests (parent spec §5). |
| `total` zero, negative, NaN | out-of-catalog | Rendered verbatim after the `/` (display-only, no arithmetic, no gating). |
| any prop nullish | | Compile-time excluded: every prop in `Props` (`SwitcherControls.tsx:22`) is required and non-optional under strict TS (`strictNullChecks`); no runtime nullish path exists. |
| `label` empty | | Empty truncating span; row layout intact (label is the only flexible child). |
| `codes` empty | | `data-codes=""`; no visible change (codes are never visible copy). |
| `tier` outside 1\|2 | type-impossible (`1 \| 2`) | Compile-time excluded; no runtime guard. |
| `excluded` only structural | `cut.length === 0` | Toggle shows total; panel shows only the structural line. |
| `excluded` only cut | `structural.length === 0` | Toggle shows total; panel shows only the cut line. |
| `label` long / viewport 390px | | Label truncates (`min-w-0 truncate`); row never wraps (`flex-nowrap`); all siblings `shrink-0`. |
| `showExcluded` true while stepping scenarios | | Panel stays open (state local, `excluded` constant per mount). |
| Modal closed → Reopen | | Bar (and panel state) persist; unaffected — only the modal unmounts (parent spec §3.3). |
| Panel open | | Bar may overlap the modal header — ratified transient (§1.1). |

## 4. Transition inventory

Two visual states (collapsed, expanded): 1 pair.

| Pair | Treatment |
| --- | --- |
| collapsed ↔ expanded | Instant — no animation needed (dev instrument; no AnimatePresence anywhere in the component). |

Compound: expand/collapse while a scenario switch remounts the modal — independent
subtrees, no interaction; panel visibility is purely `showExcluded`.

## 5. Testing

- **Unit (jsdom), `tests/components/admin/dev/switcherControls.test.tsx`:**
  - Footnote test rewritten: with mixed `excluded`, footnote copy NOT in the DOM
    initially (`queryByText` null), toggle has `aria-expanded="false"`; after click,
    both lines visible, `aria-expanded="true"`, panel id matches `aria-controls`.
  - Toggle absent when `excluded` is empty.
  - Expanded → collapsed: click toggle twice; after the second click the panel is
    gone from the DOM, `aria-expanded="false"`, and the `aria-controls` attribute is
    absent (it is set only while the panel is rendered, §2.2).
  - Structural-only `excluded`: panel shows the structural line and NOT the cut
    line; cut-only: the inverse. (Guard rows in §3.)
  - Compound transition (§4): toggling the panel is independent of scenario
    stepping — pinned by the e2e persistence step (§5 e2e), not jsdom.
  - Static class pins (jsdom `className` assertions — these contracts are invisible
    to a zero-inset e2e and to the short current catalog, so the classes ARE the
    testable surface): row carries `flex-nowrap`; ALL four fixed row children pin
    `shrink-0` (Prev, Next, chip, toggle); the toggle also pins `min-h-tap-min`
    AND `min-w-tap-min`; the live-region wrapper pins `min-w-0` and `flex-1`; the
    bar container carries `pb-2` and the
    `pt-[calc(--spacing(2)+env(safe-area-inset-top,0px))]` literal (and NOT `py-2`);
    the open panel carries `max-h-[40vh]` and `overflow-y-auto`.
  - Existing tests (invariant 5 data-codes, aria-live label, em-dash) updated to
    expand the panel first where they assert footnote copy.
- **E2E, `tests/e2e/attention-modal-gallery.spec.ts` (dev-build project, 1280×800,
  port 3001 — `playwright.config.ts:84-92`):**
  - New geometry test: for viewports 1280×800 and 390×844 (`page.setViewportSize`),
    read `boundingBox()` of the collapsed bar and of the modal PANEL
    (`published-show-review-modal`), header, close, and
    footer testids; assert (a) no intersection of the bar box with each of those,
    (b) `bar.height <= 64` (both e2e viewports report a 0px safe-area inset, §2.1.1,
    so the numeric bound is exact), and (c) no horizontal content overflow:
    `bar.scrollWidth <= bar.clientWidth` (via `locator.evaluate`) — the `inset-x-0`
    bar box is always inside the viewport, so a bounding-box check would be
    tautological; scrollWidth vs clientWidth is what actually detects non-shrinking
    children escaping the row. (b) is what makes (a)
    non-vacuous — a wrapped 80px bar fails (b) even if the modal happens to sit
    lower — and (b)+(c) together pin non-wrapping and no-overflow, the real-layout
    facts jsdom cannot see. Anti-tautology: boxes come
    from the real modal testids, not from any gallery-authored wrapper; the bar box
    from `attention-switcher-controls` (`tests/e2e/attention-modal-gallery.spec.ts:66`).
  - Persistence rides the same test, at 1280×800 ONLY: open the panel, press
    ArrowRight (scenario remount), assert the panel is still open
    (`aria-expanded="true"`); then close the modal via its X, click "Reopen", and
    assert the panel state survived — the bar is outside the keyed modal subtree
    (parent spec §3.3), and this pins it. Desktop-only because at 1280 the expanded
    panel (max-w-3xl, right edge ≈1024px) cannot cover the modal's close X (modal
    max-w-5xl, X near ≈1100px, `ReviewModalShell.tsx:618`), so the X stays
    clickable while expanded; at 390px the ratified overlap (§1.1) can cover the X,
    which is why the mobile viewport runs only the collapsed-state geometry
    assertions.
  - Footnote test (`tests/e2e/attention-modal-gallery.spec.ts:332`) updated: assert
    footnote copy hidden by default, click the toggle, then keep the existing
    structural-label + cut-count assertions (they derive from catalog exports
    `STRUCTURAL`/`CUT`, not literals).
- **Impeccable dual-gate (invariant 8):** `/impeccable critique` + `/impeccable audit`
  on the diff before cross-model review; P0/P1 fixed or DEFERRED.md-logged.
- **DEFERRED.md close-out:** the `ATTN-GALLERY-CONTROLBAR-OVERLAP-1` entry moves to
  `DEFERRED-archive.md` as resolved, citing this spec.

## 6. Out of scope

- `ReviewModalShell.tsx`, `PublishedReviewModal.tsx`, any `app/` route, tokens,
  catalog, scenario data.
- No new §12.4 codes, no DB, no advisory locks, no telemetry surface (pure
  client-presentational dev component; no mutation surface — invariant 10 N/A).
- Meta-test inventory: none applies — no Supabase call, no sentinel copy, no
  admin_alerts code, no advisory lock, no email path.
