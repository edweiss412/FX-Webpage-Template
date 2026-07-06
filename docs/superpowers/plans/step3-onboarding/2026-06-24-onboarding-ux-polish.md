# Onboarding Wizard UX Polish — Implementation Plan

> **For agentic workers:** TDD per task (failing test → minimal impl → green → commit). UI work — honor AGENTS.md invariant 8 (impeccable v3 critique+audit dual-gate per UI surface before adversarial review) + the Tailwind-v4 "no default `align-items:stretch`" rule (state every grid/flex dimensional invariant explicitly).

**Goal:** Six UX improvements to the first-run onboarding wizard, from user feedback (2026-06-24). Decisions are locked (see each task).

**Surfaces:** `app/admin/layout.tsx` (nav), `components/admin/wizard/Step3SheetCard.tsx` (schedule/dates/warnings), `components/admin/OnboardingWizard.tsx` (+ Step1/Step2 components, step nav + Step-3 width).

**Spec basis:** user feedback + decisions captured in-session; recon `wf_5ba23e81-ce3`. PRODUCT.md (voice) + DESIGN.md (tokens) govern.

## Global constraints

- **UI gate (invariant 8):** every changed UI surface ships only after `/impeccable critique` AND `/impeccable audit` pass on the diff (HIGH/CRITICAL fixed or DEFERRED). External attestation.
- **Tailwind v4:** this repo does NOT default `.flex` to `align-items:stretch`. Every new grid/flex dimensional relationship (time-column width, card-grid track sizing) stated explicitly + verified in a real browser where a fixed-dimension parent is involved.
- **No raw error codes (invariant 5):** warning detail routes through `messageFor()` / the §12.4 catalog; unknown server codes fall back gracefully (never render a raw code).
- **Fail-open nav:** the onboarding nav suppression must fail OPEN (show full nav) on any `app_settings` read fault — never strand a settled admin without navigation.

---

## Task 1 — Hide the admin nav during first-run onboarding; keep a slim bar

**Decision:** Hide the nav tabs during onboarding; keep a minimal top bar (FXAV wordmark + admin email + sign-out).

**Files:** `app/admin/layout.tsx` (read app_settings + gate); new `components/admin/nav/OnboardingTopBar.tsx` (the slim bar); `lib/appSettings/readAppSettingsRow.ts` (reuse). Test: `tests/admin/onboardingNavSuppression.test.tsx`.

**Change:**
- In `app/admin/layout.tsx`, after the existing identity read, call `readAppSettingsRow()` and derive `inOnboarding = settings.pending_wizard_session_id !== null || settings.watched_folder_id === null` (mirror the dispatcher precedence at `app/admin/page.tsx:147/:193`). On `{kind:'infra_error'}` → `inOnboarding = false` (FAIL OPEN).
- When `inOnboarding`: render `<OnboardingTopBar email={...} />` instead of `<AdminNav>` (layout.tsx:107) and DROP the `pb-20` mobile-bottom-bar padding (layout.tsx:105). Else render the full nav unchanged.
- `OnboardingTopBar`: a slim header — FXAV wordmark (left), admin email + a sign-out control (right). DESIGN tokens only; matches the admin header rhythm. testid `onboarding-top-bar`.

**TDD:** failing test — render the admin layout with `pending_wizard_session_id` set → asserts `onboarding-top-bar` present + the full nav (`admin-nav`/tab testids) absent; with settings settled → full nav present, slim bar absent; with infra_error → full nav present (fail-open). Commit `feat(onboarding): slim top bar during first-run setup, hide empty nav tabs`.

## Task 2 — Schedule breakdown: align times into a column + expand instead of truncate

**Decision:** column-align times; replace `…+N` with an in-place "show all" expander.

**Files:** `components/admin/wizard/Step3SheetCard.tsx`. Test: extend `tests/components/step3SheetCard.test.tsx`.

**Change:**
- Each schedule entry (currently one inline `<span>` joining `e.start · e.title`, ~line 162): render a 2-track grid row `grid grid-cols-[auto_1fr] gap-x-2 items-baseline`. Time cell: `tabular-nums whitespace-nowrap text-text-subtle` (fixed/auto track). Title cell: `1fr`, left-aligned, wraps. **Dimensional invariant:** all time cells share the same left edge (the `auto` track sizes to the widest time, e.g. "11:00 AM"); titles all start at the same x (the `1fr` track's left edge). Verify with a render assertion that two entries' title cells share a left offset.
- Replace the per-day `SCHEDULE_ENTRIES_CAP=6` slice + `…+N` tail (lines 49/156/168) with a disclosure: render the first N, then a `<button>` "Show all M times" that reveals the rest for that day in place (local state per day, or a single per-card "expand schedule" toggle). Keep `SCHEDULE_DAYS_CAP=14` for the day list.

**TDD:** failing test — a day with >6 entries shows the expander (not a dead `+N`); clicking reveals all entries; two entries' title cells share a left x-offset (column alignment). Commit `feat(onboarding): schedule times in an aligned column + expand-all (no silent truncation)`.

## Task 3 — Summary: role-labeled dates with a show-day range + differentiated totals

**Decision:** "Travel in Oct 7 · Set Oct 7 · Show Oct 8–10 · Travel out Oct 11"; distinct labels for dates vs totals.

**Files:** `components/admin/wizard/Step3SheetCard.tsx` (`dateSegments` lines 64-72 → labeled formatter; render lines 401-408); new `lib/dates/humanize.ts` (ISO→"Mon D" / "Mon D–D"). Tests: `tests/dates/humanize.test.ts` + extend the card test.

**Change:**
- New `humanizeDate(iso)` → "Oct 7"; `humanizeDayRange(isos[])` → "Oct 8–10" (same month) / "Oct 30 – Nov 2" (cross-month) / "Oct 7" (single). Pure, tested with fixed inputs (no `new Date()` non-determinism — parse the ISO Y-M-D directly).
- Replace `dateSegments` with a role-labeled builder from the structured `parseResult.dates` (`{travelIn,set,showDays[],travelOut}`, lib/parser/types.ts:94): emit segments `[travelIn? "Travel in <d>", set? (set!==travelIn) "Set <d>", showDays.length ? "Show <range>", travelOut? "Travel out <d>"]`, joined by ` · `. Collapse `travelIn===set` (drop the duplicate). Guard empties (null/0-length → omit the segment; if NO dates at all, render a muted "Dates not detected").
- Give the DATES line and the TOTALS line (`6 crew · 7 rooms · …`) distinct visual roles — small uppercase eyebrow labels ("Dates" / "Totals") OR a leading icon + weight/color difference — so they stop reading as one block. DESIGN tokens.

**TDD:** `humanize.test.ts` — same-month range, cross-month range, single day, null guards. Card test — `travelIn===set` collapses; show days render as a range not a fan; the dates + totals rows have distinct labels/testids. Commit `feat(onboarding): role-labeled date summary with show-day range + labeled totals`.

## Task 4 — Warning badge: surface detail + "doesn't block publish"

**Decision:** show each warning's detail; clearly mark warnings as informational (do not block publishing). No publish-gate change.

**Files:** `components/admin/wizard/Step3SheetCard.tsx` (warning chip lines 418-427 → expandable / breakdown section). Test: extend the card test.

**Change:**
- Thread the full `parseResult.warnings` (`{severity,code,message,blockRef?,rawSnippet?}`, lib/parser/types.ts:1-6 — already computed at line 361, only `.length` used today). Add a **Warnings** section to the breakdown region (mirror the BreakdownSection blocks at lines 453-468) OR make the count chip a disclosure that opens it.
- Per warning: render `messageFor(w.code)` title + helpfulContext when the code is cataloged; FALL BACK to `w.message` (the raw parser message) when `messageFor` returns null (unknown server code — invariant 5: never render the bare code, do render the human message). Show severity (info/warn) as a subtle dot/label.
- Add one explicit line: warnings are informational and **do not block publishing** (so the count badge stops reading as an error). PRODUCT.md voice.

**TDD:** failing test — a card with warnings renders each warning's title/message (cataloged → catalog copy; unknown code → the raw `message`, never the code); the "doesn't block publish" copy is present; the publish checkbox is still enabled with warnings present (no gate change). Anti-tautology: assert against the warning data, not the chip count. Commit `feat(onboarding): surface parse-warning detail + mark warnings non-blocking`.

## Task 5 — Wizard step navigation: Back control + clickable stepper

**Decision:** add Back nav; make the stepper pills clickable to already-visited steps.

**Files:** `components/admin/OnboardingWizard.tsx` (+ the StepIndicator). Test: extend / add `tests/components/onboardingWizardNav.test.tsx`.

**Change:**
- Add a non-destructive **Back** control per step (a `<Link href="/admin?step=N-1">` matching the existing forward-`?step=` pattern). On Step 1 there is no Back.
- Make the StepIndicator pills clickable to any **already-visited** step (a `<Link>` to that `?step=`); forward jumps to not-yet-reached steps stay disabled (derive max-reached from the same backend state the dispatcher uses, or from the current step — a visited step is any step ≤ current). Keyboard-accessible.
- **Caveat to verify:** navigating back to Step 2 must NOT re-trigger the scan or orphan the wizard session — Step2Verify reads existing state; confirm `?step=2` re-render is read-only (no re-scan POST). If it would re-scan, gate the Back-to-2 to a read-only verify view.

**TDD:** failing test — Step 3 renders a Back link to `?step=2`; the stepper pills for visited steps are links, the unreached pill is not; Back from Step 3 does not fire a scan request. Commit `feat(onboarding): back navigation + clickable stepper for visited steps`.

## Task 6 — Widen Step 3 into a responsive card grid on desktop

**Decision:** keep Steps 1-2 narrow; widen Step 3 into a responsive grid.

**Files:** `components/admin/OnboardingWizard.tsx` (the Step-3 wrapper / `Step3Review` container width + the card list → grid). Test: a real-browser / jsdom-computed layout assertion + the card test.

**Change:**
- Keep Steps 1-2 at `max-w-2xl mx-auto`. For Step 3, widen the container on desktop (e.g. `max-w-2xl lg:max-w-6xl mx-auto`) and lay the review cards in a responsive grid: `grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4` (1 col mobile → 2-3 on desktop). The "Needs your attention" group + the publish header span the full width above the grid.
- **Dimensional invariants (Tailwind v4):** the grid is `items-start` (cards size to their own content, not stretched to the tallest in a row — state explicitly since v4 won't default-stretch). Cards keep their internal layout. State each parent→child width relationship; verify the grid reflows 1→2→3 cols across the `lg`/`xl` breakpoints in a real browser (Playwright/chrome-devtools `getBoundingClientRect`), not jsdom alone.

**TDD:** a layout-dimensions assertion (real browser) — at a desktop width Step 3 renders ≥2 columns of cards and the container exceeds the `max-w-2xl` width; at mobile width it's 1 column. Commit `feat(onboarding): widen Step 3 into a responsive card grid on desktop`.

---

## Close-out

- Full suite + tsc + lint green. impeccable dual-gate dispositions recorded for every changed UI surface.
- Whole-diff Codex cross-model review to APPROVE.
- CI green (12 required) → merge → ff main.

## Watchpoints

- **Task 1** adds one `app_settings` read to every `/admin/*` layout render (was index-only). Must be the cheap fail-safe `readAppSettingsRow()`; fail OPEN. It also suppresses nav on the FinalizeInProgress / ReadyToPublish onboarding-phase surfaces routed through `/admin` (same `pending_wizard_session_id` state) — confirm that's desired (those ARE still mid-onboarding, so hiding nav is consistent).
- **Task 5** backward `?step=` must be read-only — the #1 risk is re-triggering the Step-2 scan or orphaning the session.
- **Tasks 2,3,6** introduce new grid tracks in a Tailwind-v4 repo — explicit dimensional invariants + a real-browser check for Task 6.
