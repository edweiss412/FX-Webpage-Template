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
- **Expanded panel MAY transiently overlap the modal header.** Opening the disclosure
  grows the bar downward over the header. Ratified: it is user-invoked, dismissible,
  and shows constant metadata, exactly the class of content it covers. The
  non-overlap invariant binds the COLLAPSED (default) state only.
- **Dev-instrument carve-outs stand.** The parent spec's a11y carve-out (bar outside
  the `aria-modal` tree, arrow-key navigation) and raw-codes carve-out
  (`data-codes` attribute, no visible codes — invariant 5) are unchanged
  (parent spec §1.1/§3.4).
- **Height cap amendment: ≤56px becomes ≤64px collapsed.** The [R1-12] cap of 56px
  was never achievable with 44px tap targets + `py-2` (8+44+8+2px border = 62px) and
  the shipped bar never met it. The amended invariant: collapsed height ≤64px,
  expanded height unbounded (transient).
- **Visible copy of the two footnote lines is unchanged** (only their placement moves
  behind the disclosure). "Prev"/"Next" button text unchanged.

## 2. Design — `SwitcherControls` only

Single file change: `components/admin/dev/SwitcherControls.tsx`. New component-local
state `const [showExcluded, setShowExcluded] = useState(false)`.

### 2.1 Control row (always rendered)

- Row container: `flex flex-nowrap items-center gap-x-2` (was
  `flex flex-wrap items-center gap-x-3 gap-y-1`, `SwitcherControls.tsx:57`).
  No wrapping at any width; the label is the only flexible child and truncates
  (existing `min-w-0 truncate`, `SwitcherControls.tsx:70`).
- Children, in order: Prev button, Next button, live region (count + label,
  unchanged), tier chip (`shrink-0`, unchanged), and — only when
  `excluded.length > 0` — the disclosure toggle.
- All non-label children `shrink-0` so truncation is absorbed solely by the label.
- Width budget at 390px (px-4 container = 32px): Prev ~54 + Next ~54 + count ~34 +
  chip ~44 + toggle ~80 + 5 gaps × 8 = 40 → ~306px fixed, leaving ≥50px for the
  truncating label. No wrap.

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
- Bar container keeps `flex-col gap-1` (`SwitcherControls.tsx:55`): row on top,
  panel (when open) below; the bar grows downward.
- State is component-local and persists across scenario steps (the bar is not keyed
  per scenario; only `PublishedReviewModal` remounts, parent spec §3.3). `excluded`
  is constant per mount, so no reset logic is needed.

### 2.4 Amended layout invariant (supersedes parent [R1-12] wording)

The bar is `fixed`, `z-60`, top-center, respects `env(safe-area-inset-top)` on
mobile, and in its COLLAPSED state: height ≤64px and MUST NOT intersect the modal's
header (`data-testid="published-show-review-header"`,
`ReviewModalShell.tsx:647` via `TESTID_BASE = "published-show-review"`,
`components/admin/showpage/PublishedReviewModal.tsx:72`), close button
(`published-show-review-close`), or footer (`published-show-review-footer`,
`ReviewModalShell.tsx:696`). Geometry headroom: the panel is `max-h-[85vh]` mobile /
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
| Collapsed bar height ≤64px | Single row: `flex-nowrap` on the row (no second line possible) + `min-h-tap-min` (44px) buttons + container `py-2` (16px) + 2px border. |
| Row children never push the bar wider than the viewport | Every non-label child `shrink-0`; label `min-w-0 truncate` absorbs all deficit. |
| Bar never intersects modal header/close/footer (collapsed) | `fixed top-0` bar ≤64px vs scrim band ≥80px above the panel (§2.4 math); pinned by the real-browser `getBoundingClientRect`/`boundingBox` e2e (§5), not jsdom. |

## 3. Guard conditions

| Input / state | Edge | Behavior |
| --- | --- | --- |
| `excluded` empty | | No toggle, no panel; row otherwise identical. |
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
  - Toggle carries `min-h-tap-min`; row element carries `flex-nowrap` (class
    assertion — jsdom computes no layout; real geometry is e2e's job).
  - Existing tests (invariant 5 data-codes, aria-live label, em-dash) updated to
    expand the panel first where they assert footnote copy.
- **E2E, `tests/e2e/attention-modal-gallery.spec.ts` (dev-build project, 1280×800,
  port 3001 — `playwright.config.ts:84-92`):**
  - New geometry test: for viewports 1280×800 and 390×844 (`page.setViewportSize`),
    read `boundingBox()` of the collapsed bar and of the modal header, close, and
    footer testids; assert no intersection with each. Anti-tautology: boxes come
    from the real modal testids, not from any gallery-authored wrapper; the bar box
    from `attention-switcher-controls` (`tests/e2e/attention-modal-gallery.spec.ts:66`).
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
