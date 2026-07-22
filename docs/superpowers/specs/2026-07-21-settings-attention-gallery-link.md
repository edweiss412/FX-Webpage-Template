# Settings page: "Attention gallery" link in DevToolsRow

**Date:** 2026-07-21
**Status:** Draft (autonomous /ship-feature run; user design approval given in-session)
**Scope:** one component edit + tests. No DB, no routes, no new props.

## 1. What

Add a second link to the existing "Developer tools" row on the admin settings
page (`components/admin/settings/DevToolsRow.tsx`), pointing to the attention
modal switcher gallery at `/admin/dev/attention-gallery`, beside the existing
"Open" link, with identical styling and identical gating.

### 1.1 Resolved scope — do not relitigate

- **Gate is `DEV_PANEL_PRESENT && isDeveloper`, unchanged.** The gallery route
  exists in the build artifact only when `scripts/with-admin-dev-flag.mjs`
  builds with `ADMIN_DEV_PANEL_ENABLED=true` (`scripts/with-admin-dev-flag.mjs:63`
  lists `app/admin/dev/attention-gallery/page.tsx` in its FILES array). Gating
  the link on runtime env or on the dev role alone would render a 404 link in a
  normal build — the M3 build-vs-runtime class already documented in
  `components/admin/settings/DevToolsRow.tsx:5-11` and pinned by
  `tests/components/admin/settings/DevToolsRow.absent.test.tsx`. The single
  existing early return (`components/admin/settings/DevToolsRow.tsx:30`,
  `if (!DEV_PANEL_PRESENT || !isDeveloper) return null;`) covers both links; no
  per-link gate.
- **Placement: inside the existing row, not a new Preferences row.** User chose
  option 1 (second link beside "Open") over a separate row in-session.
- **Row copy unchanged.** Title "Developer tools" and description "Fixture
  tester and parse diagnostics. Hidden from normal use." stay as-is. The new
  link's label is the only new user-visible copy.
- **No link added on the `/admin/dev` index page.** Out of scope; the request
  was the settings page.
- **User review gates waived** — autonomous-ship consent given in-session
  (AGENTS.md brainstorming gate, answered "yes").

## 2. Current state (live-code citations)

- `components/admin/settings/DevToolsRow.tsx` — renders
  `data-testid="admin-dev-tools-row"` containing a heading block and a single
  `<Link href="/admin/dev" data-testid="admin-dev-tools-open">Open</Link>`
  (lines 31-56). Root div: `flex flex-wrap items-center justify-between gap-3 p-4`.
- Gate: `DEV_PANEL_PRESENT` from
  `lib/admin/__generated__/devPanelPresent.ts` (committed `false`,
  build-tool-overwritten) AND runtime `isDeveloper` prop, absent → false
  (`components/admin/settings/DevToolsRow.tsx:17-30`).
- Caller: `app/admin/settings/page.tsx:221` —
  `<DevToolsRow icon={<ShieldCheck aria-hidden />} isDeveloper={isDeveloper} />`,
  where `isDeveloper` comes from `isCurrentUserDeveloper()`
  (`app/admin/settings/page.tsx:100`).
- Target route: `app/admin/dev/attention-gallery/page.tsx` — exists, first line
  of the handler is `requireDeveloper()`; build-gated as above.
- Existing tests:
  - `tests/components/admin/settings/DevToolsRow.test.tsx` — mocks the
    generated constant to `true`; asserts row + Open link href/text for
    `isDeveloper={true}`, empty DOM for `false`/absent.
  - `tests/components/admin/settings/DevToolsRow.absent.test.tsx` — real
    committed constant (`false`); asserts empty DOM even with
    `isDeveloper={true}`.
  - `tests/e2e/admin-dev.spec.ts` — Playwright, dev-flag build: settings page
    shows `admin-dev-tools-row`/`admin-dev-tools-open`; normal build shows
    neither.

## 3. Change

In `DevToolsRow.tsx`, replace the single trailing `<Link>` with a
`<div className="flex flex-wrap items-center gap-2">` containing two links:

1. Existing: `data-testid="admin-dev-tools-open"`, `href="/admin/dev"`, text
   `Open` — unchanged testid, href, text, and className.
2. New: `data-testid="admin-dev-tools-gallery"`,
   `href="/admin/dev/attention-gallery"`, text `Attention gallery`, className
   identical to the existing link (the full
   `inline-flex min-h-tap-min items-center justify-center rounded-sm border
   border-border-strong bg-bg px-4 text-sm font-medium text-text-strong
   hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2
   focus-visible:ring-focus-ring` string — keeps the 44px tap-target
   `min-h-tap-min` and canonical token classes).

Order: **"Open" first, "Attention gallery" second** (primary entry point keeps
first position; gallery is the auxiliary deep link).

### Guard conditions

- `isDeveloper` null/undefined/false → whole row renders `null` (existing
  early return; unchanged).
- `DEV_PANEL_PRESENT` false → `null` (unchanged).
- No other props; no data dependencies; links are static hrefs.

### Dimensional invariants / transition inventory

None. The row has no fixed-dimension parent (content-sized card row with
`flex-wrap`), one visual state, no animations. Wrapping behavior on narrow
viewports is handled by the existing `flex-wrap` on the root and the new
`flex-wrap` on the button group; buttons may stack — acceptable and consistent
with the row's existing wrap behavior.

## 4. Tests

1. **Extend `tests/components/admin/settings/DevToolsRow.test.tsx`** (constant
   mocked `true`, `isDeveloper={true}`): assert
   `admin-dev-tools-gallery` has `href="/admin/dev/attention-gallery"` and text
   `Attention gallery`; assert `admin-dev-tools-open` still has
   `href="/admin/dev"` (regression). Failure mode caught: gallery link missing,
   wrong href (404 class), or accidental replacement of the Open link.
   The existing `false`/absent cases already assert an empty container, which
   structurally covers the new link (empty DOM ⇒ no gallery link) — plus one
   explicit `queryByTestId("admin-dev-tools-gallery") === null` assertion in
   the `isDeveloper={false}` case so the gate claim is pinned by name.

   Additionally (R1 findings), the true-case test pins the styling and order
   contracts:

   - **Styling parity (R1 F1):** assert
     `gallery.getAttribute("class") === open.getAttribute("class")` — parity,
     not a hardcoded string, so a future shared restyle stays green while a
     one-link drift fails. Separately assert the shared class string contains
     `min-h-tap-min` (tap-target claim) and `focus-visible:ring-2`
     (focus-ring claim), so parity cannot be satisfied by both links losing
     the classes together. Assert the links' common parent element has
     `flex-wrap` in its class list (narrow-viewport wrap claim). jsdom is
     sufficient: these are class-attribute assertions, not computed-layout
     assertions, and §3 declares no dimensional invariants.
   - **DOM order (R1 F2):** assert
     `open.compareDocumentPosition(gallery) & Node.DOCUMENT_POSITION_FOLLOWING`
     is truthy — "Open" precedes "Attention gallery" in document order.
     Failure mode caught: reversed order violating the primary/auxiliary
     ordering in §3.
2. **`DevToolsRow.absent.test.tsx` unchanged** — `toBeEmptyDOMElement()`
   already proves the new link cannot render in a normal build.
3. **Extend `tests/e2e/admin-dev.spec.ts`**: in the dev-build settings test,
   assert `admin-dev-tools-gallery` visible; in the normal-build tests, assert
   it not visible (same pattern as the existing `admin-dev-tools-open`
   assertions). E2e is env-bound (excluded from `pnpm test`); run locally where
   the harness allows, per the file's existing skip/gating conventions.

Anti-tautology note: assertions target the link testids and href attributes
directly, not container text; expected hrefs are the route literals the build
tool gates, so a wrong-href regression cannot pass.

## 5. Out of scope

- Any change to `/admin/dev` index page, gallery page, `with-admin-dev-flag.mjs`.
- Help screenshots / crosswalk: row is invisible in normal builds
  (`DEV_PANEL_PRESENT` committed `false`); no `tests/help` registry references
  "Developer tools" (grep verified 2026-07-21).
- No new §12.4 codes, no telemetry (render-only change, no mutation surface).
- No new meta-test registries apply (no Supabase calls, no admin mutations, no
  sentinel text, no advisory locks). Declared: **meta-test inventory = none.**
