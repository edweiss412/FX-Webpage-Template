# Plan: gallery switcher slim bar

Spec: `docs/superpowers/specs/2026-07-21-gallery-switcher-slim-bar-design.md` (APPROVE, Codex R6).
Branch: `fix/gallery-switcher-bar-slim`. All tasks TDD (invariant 1); one commit per task (invariant 6).

## Pre-draft code verification (run 2026-07-21, this worktree)

- `components/admin/dev/SwitcherControls.tsx:22` `Props` (all required), `SwitcherControls.tsx:55` bar classes, `SwitcherControls.tsx:57` row classes, `SwitcherControls.tsx:70` label `min-w-0 truncate`, `SwitcherControls.tsx:76-86` footnote lines — verified.
- `tests/components/admin/dev/switcherControls.test.tsx` — 6 existing tests; `@vitest-environment jsdom` pragma present at top — verified.
- `tests/e2e/attention-modal-gallery.spec.ts:65` `DIALOG = '[data-testid="published-show-review-modal"]'`, `attention-modal-gallery.spec.ts:66` `CONTROLS`, `attention-modal-gallery.spec.ts:145` `gotoScenario(page, id)` (readiness gate: reload-retry until `DIALOG` count 1 — this is the hydration gate, per e2e harness-readiness), `attention-modal-gallery.spec.ts:142-143` `STRUCTURAL`/`CUT` derived from catalog exports, `attention-modal-gallery.spec.ts:332` footnote test — verified.
- `playwright.config.ts:84-92` dev-build project: Desktop Chrome 1280×800, baseURL `http://localhost:3001`, testMatch includes `attention-modal-gallery` — verified. Spec's 390×844 case runs via `page.setViewportSize` inside the test (project stays desktop-chromium-based; no new project).
- `ReviewModalShell.tsx:578` `${testIdBase}-modal`, `ReviewModalShell.tsx:582` overlay, `ReviewModalShell.tsx:618` panel `max-h-[85vh] sm:max-h-[80vh] overflow-clip`, `ReviewModalShell.tsx:647` header, `ReviewModalShell.tsx:696` footer; `PublishedReviewModal.tsx:72` `TESTID_BASE = "published-show-review"` — verified.
- `app/globals.css:162` `--spacing-tap-min: 44px` — verified.
- Tailwind literal `pt-[calc(--spacing(2)+env(safe-area-inset-top,0px))]`: repo precedent for `--spacing()` inside arbitrary values exists (`pb-[calc(--spacing(3)+env(safe-area-inset-bottom,0))]`, `ReviewModalShell.tsx:697`) — verified.

## Meta-test inventory

None applies: no Supabase call boundary, no sentinel copy, no admin_alerts code, no
advisory lock (`pg_advisory` untouched), no email path, no mutation surface
(presentational client component; invariant 10 N/A — no new route/action).
CI wiring: both changed test files already have coverage — `tests/components/**`
runs in the unit suite; `attention-modal-gallery.spec.ts` is in the dev-build
Playwright project testMatch (verified above). No new test file is created.

## e2e harness readiness (per writing-plans additions)

(a) Server boot: existing dev-build project webServer on :3001 (built with
`ADMIN_DEV_PANEL_ENABLED=true`) — unchanged. (b) Readiness gate: `gotoScenario`'s
reload-retry until the dialog count is 1 (existing pattern, spec.ts:145) precedes
every assertion. (c) Detach safety: geometry reads use fresh `locator.boundingBox()`
/ one-shot `locator.evaluate` calls after the dialog gate; no handle is retained
across the ArrowRight remount (re-query after stepping).

## Tasks

### Task 1 — the feature, TDD (all tests red, then the component, then green; ONE commit)

This is a single-component change; splitting tests and implementation into separate
commits would leave a non-green intermediate commit (the old e2e footnote test
fails once footnotes hide by default). So Task 1 is one TDD cycle and ONE commit
carrying: the unit-test rewrite, the e2e edits, the source-scan audit test, and the
component change. Red-first is demonstrated by running BOTH layers after the test
edits and BEFORE the component edit, and quoting both failing summaries in the
commit body.

Step 1a — test edits (all of them):

Unit (`tests/components/admin/dev/switcherControls.test.tsx`):

- KEEP (unchanged behavior): invariant-5 data-codes test; aria-live label test;
  prev/next + tap-target test; group-role test.
- REWRITE "footnotes grouped by reason" as the disclosure contract:
  - mixed `excluded`: footnote copy ABSENT initially (`queryByText(/structural probes/i)` null,
    `queryByText(/published attention surface/i)` null); toggle visible with
    accessible name `/2 excluded/`, `aria-expanded="false"`, no `aria-controls`;
    click: both lines visible, `aria-expanded="true"`,
    `aria-controls === "switcher-excluded-panel"`, panel has that id and
    `data-testid="attention-switcher-excluded-panel"`; click again: panel gone,
    `aria-expanded="false"`, `aria-controls` absent.
  - structural-only: panel shows structural line, NOT cut line; cut-only: inverse.
  - `excluded: []`: no toggle, no panel.
- Static class pins (spec §5): row `flex-nowrap`; Prev, Next, chip, toggle each
  `shrink-0`; toggle `min-h-tap-min` + `min-w-tap-min`; wrapper `min-w-0` + `flex-1`;
  bar container className contains `pb-2` and
  `pt-[calc(--spacing(2)+env(safe-area-inset-top,0px))]` and NOT `py-2`; open panel
  `max-h-[40vh]` + `overflow-y-auto`.
  Failure mode caught: silent class drop invisible to a zero-inset browser and the
  short current catalog.
- em-dash test: extend to expanded state (open panel, assert textContent has no U+2014).
- Guard rows (complete §3 runtime set): `index: 0` renders `1 /`; `index: NaN`
  renders `NaN /`; `index: -1, total: 0` renders `0 / 0`; `total: -3` renders
  `/ -3`; `total: NaN` renders `/ NaN`; `label: ""` leaves the row intact (empty
  truncating span still present with `min-w-0 truncate`); long `label`
  (200 chars) keeps the `truncate` class on the span (jsdom cannot measure
  clipping; the class IS the contract); `codes: []` yields `data-codes=""`.
  (Nullish props and out-of-range `tier` are compile-time exclusions; the
  typecheck gate is their proof.)
- Source-scan transition audit (spec §4): the unit file reads the component source
  (`readFileSync`) and asserts NO match for
  `/AnimatePresence|motion\.|animate-|transition/`. Conditional-render inventory,
  each dispositioned instant mount/unmount (no exit animation):
  (1) toggle when `excluded.length > 0` — instant; (2) panel when `showExcluded` —
  instant; (3) structural line when `structural.length > 0` — instant;
  (4) cut line when `cut.length > 0` — instant. The compound case (toggle panel
  while scenario steps) is the e2e persistence step.

E2E (`tests/e2e/attention-modal-gallery.spec.ts`):

- NEW test "collapsed bar clears the modal at both viewports" (spec §5), ORDER
  FIXED to avoid state leakage: FIRST 390×844 (`page.setViewportSize` before
  `gotoScenario`) with the disclosure never touched — collapsed-state geometry:
  bar `boundingBox()` vs boxes of `[data-review-modal-panel]` (the panel; DIALOG
  is the full-viewport overlay wrapper), header
  (`published-show-review-header`), close (`published-show-review-close`), footer
  (`published-show-review-footer`): no intersection with each (strict rect-overlap
  helper, no tolerance); `bar.height <= 64`; `bar.scrollWidth <= bar.clientWidth`
  via one-shot `locator.evaluate`. THEN resize to 1280×800, fresh `gotoScenario`
  (re-navigation resets any state), repeat the same collapsed assertions; ONLY
  AFTER desktop collapsed geometry passes, run the persistence step (desktop
  only, spec §5): expand panel; ArrowRight; FIRST await the remount proof — the
  aria-live count text changes (`expect(live).toHaveText(/^\s*2\s*\//)`, the same
  signal the existing stepping test uses) — THEN assert the panel is still open
  (`aria-expanded="true"`). No close/reopen case exists: the shipped X navigates
  to `/admin` and unmounts the gallery (attention-modal-gallery.spec.ts:324-329);
  spec §5 records this as structurally N/A. Nothing runs after persistence, so
  expanded state leaks nowhere.
  Anti-tautology: expected boxes come from the real shell testids; failure mode
  caught = bar wrapping (height > 64) or covering the panel while operability
  tests still pass.
- UPDATE footnote test (attention-modal-gallery.spec.ts:332 block): after
  `gotoScenario`, footnote copy absent; click
  `attention-switcher-excluded-toggle`; existing STRUCTURAL/CUT assertions
  unchanged (catalog-derived).

Step 1b — RED: run
`npx vitest run tests/components/admin/dev/switcherControls.test.tsx` (new
assertions fail against the old component) and
`pnpm exec playwright test attention-modal-gallery --project=dev-build`
(geometry test fails against the old ~90px wrapping bar; footnote test fails
because copy is visible without a toggle). Record both failing summaries.

Step 1c — GREEN: implement `components/admin/dev/SwitcherControls.tsx` per spec §2
(single component; `useState`; row `flex flex-nowrap items-center gap-x-2`; toggle
+ conditional panel; container
`pb-2 pt-[calc(--spacing(2)+env(safe-area-inset-top,0px))]` replacing `py-2`;
footnote `<p>` copy moved verbatim into the panel). Re-run both layers to green.

Commit (one): `fix(admin): slim single-row switcher bar with excluded-scenarios disclosure`
— body quotes the red summaries from step 1b.

### Task 2 — docs close-out (docs task; validation = mechanical checks, not TDD)

- DEFERRED.md: remove the `ATTN-GALLERY-CONTROLBAR-OVERLAP-1` entry (lines 11-15).
- DEFERRED-archive.md: add resolved entry citing this spec and the branch (the PR
  number does not exist yet; Task 3 step 5 appends it to the entry in a one-line
  `docs(handoff)` follow-up commit immediately after `gh pr create`, before CI
  watch).
- Parent spec §3.4 layout-invariant line 118: append one sentence pointing to this
  spec as the ratified amendment (do NOT rewrite the parent bullet).
- Validation (stated because docs tasks have no red/green): `rg -c
  "ATTN-GALLERY-CONTROLBAR-OVERLAP-1" DEFERRED.md` returns 0 matches (exit 1);
  the archive gains exactly one entry; `pnpm spec:lint` on the touched parent spec
  stays at its pre-change hard-finding count (0).

Commit: `docs(handoff): close ATTN-GALLERY-CONTROLBAR-OVERLAP-1 via slim switcher bar`.

### Task 3 — gates (no commit unless fixes emerge)

1. Full local: `pnpm test` + `npx tsc --noEmit` + `pnpm lint` + `pnpm format:check`
   (pre-push gates; `--no-verify` commits bypass hooks so run them explicitly).
2. Playwright dev-build project run (Task 1 command).
3. Impeccable dual-gate (invariant 8): `/impeccable critique` + `/impeccable audit`
   on the diff; P0/P1 fixed or DEFERRED.md.
4. Whole-diff Codex review (fresh eyes, inline-all brief), iterate to APPROVE.
5. Push, `gh pr create` (then the one-line archive PR-number follow-up commit and
   push, per Task 2), real CI green, `gh pr merge --merge`, sync main `0  0`.

## Fix-round regression budget

Any review-round patch to the component re-runs Task 1's full unit test file plus
Task 1's e2e command before the next round dispatch; note both in the round
closure.

## Anti-tautology statements

- Geometry expectations derive from the live shell's testid boxes, never from
  gallery-authored wrappers (spec §5).
- Disclosure tests assert absence-then-presence (`queryBy*` null first), so a
  component that always renders footnotes fails the "absent initially" arm — the
  test cannot pass by accident of rendering both states.
- Class pins assert on the specific element's `className`, not a container dump.
