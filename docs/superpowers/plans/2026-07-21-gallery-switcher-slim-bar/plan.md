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

### Task 1 — failing tests first (unit + e2e), then implementation (red → green)

Rewrite `tests/components/admin/dev/switcherControls.test.tsx`:

- KEEP (unchanged behavior): invariant-5 data-codes test; aria-live label test;
  prev/next + tap-target test; group-role test.
- REWRITE "footnotes grouped by reason" → disclosure contract:
  - mixed `excluded`: footnote copy ABSENT initially (`queryByText(/structural probes/i)` null,
    `queryByText(/published attention surface/i)` null); toggle visible with
    accessible name `/2 excluded/`, `aria-expanded="false"`, no `aria-controls`;
    click → both lines visible, `aria-expanded="true"`,
    `aria-controls === "switcher-excluded-panel"` and the panel element has that id
    and `data-testid="attention-switcher-excluded-panel"`; click again → panel gone,
    `aria-expanded="false"`, `aria-controls` absent.
  - structural-only: panel shows structural line, NOT cut line; cut-only: inverse.
  - `excluded: []`: no toggle (`queryByTestId('attention-switcher-excluded-toggle')` null), no panel.
- Static class pins (spec §5): row `flex-nowrap`; Prev, Next, chip, toggle each
  `shrink-0`; toggle `min-h-tap-min` + `min-w-tap-min`; wrapper `min-w-0` + `flex-1`;
  bar container className contains `pb-2` and
  `pt-[calc(--spacing(2)+env(safe-area-inset-top,0px))]` and NOT `py-2`; open panel
  `max-h-[40vh]` + `overflow-y-auto`.
  Concrete failure mode caught: silent class drop that a zero-inset browser and the
  short current catalog cannot surface (spec §5 rationale).
- em-dash test: extend to expanded state (open panel, then assert textContent has no U+2014).
- Guard rows: `index: 0` renders `1 /`; degenerate numbers render verbatim-shifted
  (one case: `index: -1, total: 0` → text matches `0 / 0`).

Then implement `components/admin/dev/SwitcherControls.tsx` per spec §2 (single
component; `useState`; row `flex flex-nowrap items-center gap-x-2`; toggle +
conditional panel; container `pb-2 pt-[calc(--spacing(2)+env(safe-area-inset-top,0px))]`
replacing `py-2`; footnote `<p>` copy moved verbatim into the panel).

Verify: `npx vitest run tests/components/admin/dev/switcherControls.test.tsx`
red first (new assertions fail against old component), then green.
Commit: `fix(admin): slim single-row switcher bar with excluded-scenarios disclosure`.

### Task 2 — e2e geometry + persistence + footnote update (red → green)

`tests/e2e/attention-modal-gallery.spec.ts`:

- NEW test "collapsed bar clears the modal at both viewports" (spec §5): for
  1280×800 then 390×844 (`page.setViewportSize`), after the dialog gate:
  bar `boundingBox()` vs boxes of `DIALOG` (panel), header
  (`published-show-review-header`), close (`published-show-review-close`), footer
  (`published-show-review-footer`): assert no intersection with each (strict
  rect-overlap helper, no tolerance); `bar.height <= 64`;
  `bar.scrollWidth <= bar.clientWidth` via `locator.evaluate`.
  Anti-tautology: expected boxes come from the real shell testids; failure mode
  caught = bar wrapping (height > 64) or covering the panel (intersection) even
  when e2e operability tests still pass.
- Persistence steps ride the same test at 1280×800 ONLY (spec §5): expand panel →
  ArrowRight → re-query, panel still open; close X → Reopen → panel state survived.
- UPDATE footnote test (line 332 block): after `gotoScenario`, footnote copy absent;
  click `attention-switcher-excluded-toggle`; existing STRUCTURAL/CUT assertions
  unchanged (still catalog-derived).

Ordering makes red-first honest: ALL of Task 1/2's test edits (unit rewrite + new
e2e geometry test + footnote-test update) are written and RUN before the component
changes — the unit disclosure/class assertions fail against the old component, and
the e2e geometry test fails against the old ~90px wrapping bar (the deferral's own
defect). Then the component change lands and both layers go green.
e2e command: `pnpm exec playwright test attention-modal-gallery --project=dev-build`.
Task 2's commit: `test(admin): pin collapsed switcher bar geometry against the modal boxes`
(tests land WITH the implementation commit of Task 1 in the same PR; Task 2's commit
carries the e2e file, Task 1's the unit file + component — both commits only after
both layers are green locally, red runs referenced in the commit bodies).

### Task 3 — transition audit (spec §4)

Component has 2 states, 1 pair, declared instant. Audit = grep the component for
`AnimatePresence|motion\.|transition` → expect none; assert in the unit test file
as a source-scan (read the component source in the test, expect no match).
Concrete failure mode: someone adds a half-animated exit later without an inventory
entry. (Cheap, jsdom-free, deterministic.)
Folded into Task 1's commit if trivial; otherwise
`test(admin): pin switcher disclosure as animation-free`.

### Task 4 — docs close-out

- DEFERRED.md: remove the `ATTN-GALLERY-CONTROLBAR-OVERLAP-1` entry (lines 11-15).
- DEFERRED-archive.md: add resolved entry citing this spec + PR.
- Parent spec §3.4 layout-invariant line 118: append one sentence pointing to this
  spec as the ratified amendment (do NOT rewrite the parent bullet).
Commit: `docs(handoff): close ATTN-GALLERY-CONTROLBAR-OVERLAP-1 via slim switcher bar`.

### Task 5 — gates

1. Full local: `pnpm test` + `npx tsc --noEmit` + `pnpm lint` + `pnpm format:check`
   (pre-push gates; `--no-verify` commits bypass hooks so run them explicitly).
2. Playwright dev-build project run (Task 2 command).
3. Impeccable dual-gate (invariant 8): `/impeccable critique` + `/impeccable audit`
   on the diff; P0/P1 fixed or DEFERRED.md.
4. Whole-diff Codex review (fresh eyes, inline-all brief) → APPROVE.
5. Push, PR, real CI green, `gh pr merge --merge`, sync main `0 0`.

## Fix-round regression budget

Any review-round patch to the component re-runs Task 1's full test file plus the
Task 2 e2e before the next round dispatch; note both in the round closure.

## Anti-tautology statements

- Geometry expectations derive from the live shell's testid boxes, never from
  gallery-authored wrappers (spec §5).
- Disclosure tests assert absence-then-presence (`queryBy*` null first), so a
  component that always renders footnotes fails the "absent initially" arm — the
  test cannot pass by accident of rendering both states.
- Class pins assert on the specific element's `className`, not a container dump.
