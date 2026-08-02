# Plan — Admin show-page popover/overlay-clip cluster

**Date:** 2026-08-02 · **Spec:** `docs/superpowers/specs/2026-08-01-admin-popover-overlay-cluster.md` (RATIFIED 2026-08-02, Codex APPROVE R7) · **Implementer:** Opus / Claude Code (UI surface — hard routing rule) · **Branch:** `fix/admin-popover-overlay-cluster`

TDD per task, commit per task (`fix(...)`/`test(...)`/`refactor(...)` scopes below). Spec section references are normative; this plan sequences them.

## 0. Pre-draft verification + declarations

- **Code-verification pass:** every file/symbol/line named below was verified against this worktree during spec drafting and re-verified at plan time where load-bearing: ShareHub trigger/backdrop/toggle/busy (`components/admin/showpage/ShareHub.tsx:186-209`, `components/admin/showpage/ShareHub.tsx:528-540`, `components/admin/showpage/ShareHub.tsx:651-724`), StatusStrip props + ShareHub render (`components/admin/showpage/StatusStrip.tsx:98`, `components/admin/showpage/StatusStrip.tsx:414-422`), PublishedReviewModal `menuOpen`/`menuEffectivelyOpen`/StatusStrip render (`components/admin/showpage/PublishedReviewModal.tsx:301`, `components/admin/showpage/PublishedReviewModal.tsx:356`, `components/admin/showpage/PublishedReviewModal.tsx:905-912`), AttentionMenu panel/scroller/listeners (`components/admin/showpage/AttentionMenu.tsx:76-105`, `components/admin/showpage/AttentionMenu.tsx:120-147`), fit hook + pure core (`components/admin/ReSyncButton.tsx:79-146`, `lib/layout/fitWithinClip.ts:21-67`), coalescers (`ShareHub.tsx:379-386`, `components/admin/HoverHelp.tsx:309-316`), ArchiveShowButton row variant (`components/admin/ArchiveShowButton.tsx:115-156`, `components/admin/ArchiveShowButton.tsx:244-324`), registry + detector (`tests/components/admin/showpage/popoverOverlayRegistry.ts`, `tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts:26-47`), z pins (`tests/components/admin/showpage/shareHub.test.tsx:217`, `tests/components/admin/showpage/shareHub.test.tsx:280`, `tests/components/admin/showpage/shareHub.test.tsx:873`), T-S8 (`tests/components/admin/showpage/shareHubVisualViewport.test.tsx:164`), T-BACKDROP (`tests/e2e/admin-lifecycle-layout.spec.ts:623-666`), standalone baseline gates (`scripts/check-standalone-baseline.mjs`, `tests/ci/_metaSpecRegistration.test.ts:74`).
- **Meta-test inventory:** this milestone EXTENDS `tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts` (tightened `IMPORT_FOR_DISPOSITION["fit-within-clip"]` regex; two registry-row changes) and CREATES `tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts (new)` (AST-level adoption pins, spec §11 closure set). No other registries apply: no Supabase call boundary, no admin alert catalog, no email normalization, no advisory lock (**no `pg_advisory*` surface is touched — holder topology N/A**), no mutation surface (zero server-action/route edits, so invariant 10 is untouched).
- **e2e harness readiness (mandatory declaration):** boot = standalone config self-hosted harness (esbuild-bundled live entry served over `node:http`, no dev server, no Supabase — the `attention-pill-focus.spec.ts:38-99` preamble is the template); readiness gate = `window.__hydrated` flag (never `networkidle`); detach safety = all state driving via `window.__setItems` React state, and every measurement `evaluate` runs on elements re-queried inside the callback (no held locators across re-renders).
- **Impeccable gate:** section 12 below carries the closeout marker.

## 1. Task list

### T1 — `lib/popover/rafCoalescer.ts (new)` + unit tests (`test(popover)` then `refactor(popover)`)

1. RED: new `tests/popover/rafCoalescer.test.ts (new)` (node env, mock rAF): (a) burst of N `schedule()` calls before the frame fires → exactly one `run`; (b) `schedule()` during `run` → second frame scheduled (throttle, not debounce — the T-S8 failure mode); (c) `cancel()` → pending frame cancelled, later `schedule()` works. Failure mode caught: a debounce implementation (cancel-and-reschedule) fails (a)+(b) counts.
2. GREEN: create `lib/popover/rafCoalescer.ts (new)` exporting `createRafCoalescer(run: () => void): { schedule(): void; cancel(): void }` with the pending-flag-cleared-BEFORE-run semantics and the "cleared BEFORE running" marker comment (moves here; must end up in exactly one source file).
3. Adopt in `ShareHub.tsx` (placement effect: local `frame`/`schedule` → helper; `cancel()` in the same effect cleanup) and `HoverHelp.tsx` (open-gate stays at the call site: `if (!open) return;` wraps `schedule()`). Delete both local coalescers and both local marker comments.
4. Verify: T-S8 (`pnpm vitest run tests/components/admin/showpage/shareHubVisualViewport.test.tsx`) green unchanged; new unit green; HoverHelp suites green.

### T2 — extract `useFitWithinClip` with contract extension (`refactor(admin)` + `test(admin)`)

1. RED: new `tests/components/admin/useFitWithinClip.test.tsx (new)` (jsdom): (a) no clipping ancestor → no-op (style.maxHeight cleared/untouched); (b) with a fake clip ancestor rect, cap write = `floor(clipBottom − top − 8)` via mocked `getBoundingClientRect`; (c) `reapplyKey` change re-runs `apply` (assert second style write after key flip); (d) jsdom-no-ResizeObserver path does not throw. Failure modes: missing re-apply channel (c) is the spec R1-F1/R3-F4 defect class.
2. GREEN: create `components/admin/useFitWithinClip.ts (new)` (`"use client"`): body moved from `ReSyncButton.tsx:79-146` plus the spec §4.1/§4.2 extensions — ResizeObserver additionally observes the fitted element's `offsetParent`; `transitionend` listener on the `offsetParent` re-applies; optional `reapplyKey?: unknown` dep re-runs apply. Export `useFitWithinClip`; keep `findClippingAncestor` module-private (not re-exported — same-name-local pin below covers it).
3. `ReSyncButton.tsx` imports the hook; local definitions of `useFitWithinClip` + `findClippingAncestor` deleted.
4. Verify: existing ReSync suites green; new unit green.

### T3 — AttentionMenu fit + a11y contract (`fix(admin)`)

1. RED: extend `tests/components/admin/showpage/attentionMenu.test.tsx`: scroller queried via `getByRole("group", { name: "Show issues" })`, has `tabIndex={0}`; with mocked clip geometry the scroller receives a fitted `style.maxHeight`. Transition-audit sub-check (mandatory — spec §8 inventory pasted into the test file header): enumerate the file's conditional renders (`entered` ternary, `hasNeedsYou` heading, monitoring block) and assert entrance props/classes per inventory (instant close = no exit classes).
2. GREEN: scroller div (`AttentionMenu.tsx:147`) gains `role="group"`, `aria-label="Show issues"`, `tabIndex={0}`, the fit ref, `reapplyKey={entered}`.
3. Registry: flip AttentionMenu row `unverified-gap` → `fit-within-clip` (reason cites spec §2.2 probe numbers); meta-test green.
4. Verify: attentionMenu + pillFocusReconcile + attentionMenuGroups suites green.

### T4 — PublishedToggle banner cap + a11y (`fix(admin)`)

1. RED: extend `tests/components/admin/publishedToggle` suite (locate existing file via `rg "PublishedToggle" tests/components -l`): error banner has `overflow-y-auto`, `tabIndex={0}`, `aria-label="Publish error details"`, keeps `role="alert"`; fitted maxHeight written under mocked clip.
2. GREEN: `POPOVER_POSITION` (`PublishedToggle.tsx:59`) gains `overflow-y-auto`; rendered error banner takes the fit ref + `tabIndex` + `aria-label`.
3. Registry: add `components/admin/PublishedToggle.tsx` `fit-within-clip` row (file now matches the detector — fail-by-default proof: run meta-test BEFORE adding the row, observe the failure, then add).
4. Verify: toggle suites + meta-test green.

### T5 — shared-helper adoption pins (`test(admin)`) 

1. New `tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts (new)` using the TypeScript compiler API (`typescript` is a devDependency): for each (consumer, helper) pair — {ReSyncButton, AttentionMenu, PublishedToggle} × `useFitWithinClip` from `@/components/admin/useFitWithinClip`, {ShareHub, HoverHelp} × `createRafCoalescer` from `@/lib/popover/rafCoalescer` — assert: (i) import binding from the shared module; (ii) ≥1 CallExpression whose callee identifier resolves to that import binding; (iii) no local declaration of `useFitWithinClip` / `findClippingAncestor` / `createRafCoalescer` in ANY form (function/const/let/var/class/import-alias-shadow); (iv) "cleared BEFORE running" marker in exactly one file repo-wide (`lib/popover/rafCoalescer.ts (new)`).
2. Tighten `IMPORT_FOR_DISPOSITION["fit-within-clip"]` to `/from\s+"@\/components\/admin\/useFitWithinClip"/`.
3. Declared closure boundary (spec §11): renamed-reimplementation-with-decoy is outside the set; a new family needs a live escaping mutant.

### T6 — ShareHub trigger elevation, three-term gate + prop threading (`fix(crew-page)` scope `admin`… use `fix(admin)`)

1. RED (unit, `shareHub.test.tsx`): open+idle → both triggers' `maxZLevel` ≥ 21 (reuse the `tests/components/admin/showpage/shareHub.test.tsx:280` helper); closed → < 20 (existing test stays green); open+busy → < 20; `attentionMenuOpen` prop true → < 20 through settle of EACH of `rotateBusy` (resolver pattern at `tests/components/admin/showpage/shareHub.test.tsx:846`), `resetBusy`, `lifecycleBusy`, and the `busyStuck` 15s timeout (fake timers) → stays < 20; prop flips false → ≥ 21; prop absent → identical to today (existing suites are the pin).
2. RED (composed, new case in the PublishedReviewModal test suite): real composition, public surfaces only — open hub, child in flight, open menu via pill, settle → triggers < 20; close menu → ≥ 21. Fails if either hop drops the prop.
3. GREEN: `ShareHub` gains `attentionMenuOpen?: boolean` (default false); trigger className branches gain `relative z-30` under `open && !busy && !attentionMenuOpen`; `StatusStrip` gains the passthrough prop; `PublishedReviewModal` passes `menuEffectivelyOpen` (`components/admin/showpage/PublishedReviewModal.tsx:356`) at the `components/admin/showpage/PublishedReviewModal.tsx:908` render.
4. Update the `tests/components/admin/showpage/shareHub.test.tsx:280` closed-state test only if its class-parse helper needs export; assertions unchanged.

### T7 — focus-leave light dismiss (`fix(admin)`)

1. RED (unit): AttentionMenu — dispatch `focusin` on an element outside panel+pill → `onClose` called; inside → not called. ShareHub — hub open idle, `focusin` outside panel/backdrop/triggers → closes WITHOUT focus restore; while busy → stays open; `focusin` inside popover/triggers → stays open.
2. GREEN: AttentionMenu adds `focusin` handling to the existing document-listener effect (`AttentionMenu.tsx:81-105`, same outside predicate as `pointerdown`); ShareHub adds a document `focusin` listener effect while `open` (busy-exempt, no focus restore).
3. Verify: full showpage unit suites green (focus-restore tests must not regress).

### T8 — ArchiveShowButton `showName` + ratified copy (`fix(admin)`)

1. RED (`shareHub.test.tsx` armed-state cases): with `showName` — armed prose is exactly `Crew links for “{showName}” stop working now and won’t come back until you re-publish and issue a new link.` and group `aria-label` is `Confirm archiving “{showName}”`; without — byte-identical to today's strings. Curly quotes U+201C/U+201D; existing apostrophe U+2019.
2. GREEN: `ArchiveShowButton` gains `showName?: string` consumed ONLY in the `asRow` armed branch (`components/admin/ArchiveShowButton.tsx:279` aria-label, `components/admin/ArchiveShowButton.tsx:284-287` prose); `ShareHub` threads `showTitle` (`components/admin/showpage/ShareHub.tsx:153`) at the `components/admin/showpage/ShareHub.tsx:962-982` call site.
3. Verify: `_metaRowWrapperInert` + destructive-confirm suites green.

### T9 — e2e: popover-clip-fit + T-BACKDROP restore (`test(admin)`)

1. New `tests/e2e/popover-clip-fit.spec.ts (new)` (standalone; boot per §0 declaration, reusing `_pillFocusLiveEntry.tsx`): at 390×{844,667,560}, reduced motion — settled fit equality ±0.5px (§9.1, overflow fixture 10/10/10); menu.bottom ≤ panel.bottom at 560; last INTERACTIVE needs-you row ≥ 44px effective tap height + activatable; monitoring tail read-reachable via `elementFromPoint` at max scroll; held-open monitoring-only → needs-you flip at 560 → containment + reachability re-assert; keyboard: Tab focuses `group "Show issues"` scroller, ArrowDown increases `scrollTop`; idle-state mutual-exclusion walks both directions (§3.4); PublishedToggle long-error containment (drive via the harness's error path or a dedicated minimal entry if the modal harness cannot force it — decide in-task, prefer harness).
2. Register: add the `popover-clip-fit` name to `tests/e2e/standalone.config.ts` `testMatch`; regenerate `tests/e2e/standalone-baseline.json` (`node scripts/check-standalone-baseline.mjs --write`), verify `--list-check` green.
3. T-BACKDROP (`tests/e2e/admin-lifecycle-layout.spec.ts:623-666`): restore trigger assertions — hub open (idle), `elementFromPoint` at each trigger center resolves into the trigger; primary-trigger click closes popover with `document.activeElement` on the trigger.
4. Local runs: full standalone config once (`node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts`); lifecycle-layout spec via its documented invocation.

### T10 — timer-leak documentation close (`docs(test)` → use `test(admin)` comment-only commit)

Replace the delta-baseline rationale comment in `tests/components/admin/showpage/shareHubFlashState.test.tsx` with the spec §2.3 root cause (jsdom `Selection._associateRange` `setTimeout(0)` armed by the `ShareHub.tsx:630` focus effect). No assertion changes. (BACKLOG row graduates in T12.)

### T11 — impeccable dual gate (invariant 8)

`/impeccable critique` + `/impeccable audit` on the affected diff with canonical v3 setup gates; P0/P1 fixed or `DEFERRED.md`-deferred; findings + dispositions recorded in §12 below. Runs AFTER T1–T10, BEFORE the whole-diff Codex review. Pre-code mechanical checklist applied during T3/T4/T6/T8 (tap targets, apostrophes, token classes).

### T12 — close-out sweeps (`docs(plan)`)

- BACKLOG graduation: move all six item bodies to `BACKLOG-archive.md` with resolution notes (timer-leak row records the jsdom root cause; attention-clip row records the probe verdict). Expect the routine three-way BACKLOG conflict at merge — keep both sides' rows.
- Registry sanity: zero `unverified-gap` rows remain; `pnpm vitest run tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts`.
- Probe artifact cleanup: delete the two untracked draft-time probe files (popover-probe e2e spec, timerLeakProbe unit probe) and the temp `popover-probe` testMatch entry (superseded by T9's permanent spec).
- Whole-suite: `pnpm vitest run` + full standalone config + lifecycle-layout spec + `pnpm lint` + `pnpm typecheck` (exact scripts per package.json).

## 2. Anti-tautology notes (per test task)

- T1(b) catches debounce-vs-throttle (the shipped P1 class), not "function called".
- T3/T9 fitted-height expectations derive from probe geometry via the formula, never hardcoded 322 (recompute from measured `panel.bottom`/`scroller.top` in-test).
- T6 composed test drives ONLY public surfaces — injecting the prop directly into ShareHub in that test would be tautological; forbidden in-task.
- T8 without-`showName` case pins byte-identity against the CURRENT strings (copied from source at test-write time), so the guard fails if the guarded default drifts.
- T9 keyboard-scroll asserts `scrollTop` delta, not focus alone; mutual-exclusion walks assert the FIRST surface closed, not merely the second open.

## 3. Commit map

T1 `test(popover)` + `refactor(popover)`; T2 `test(admin)` + `refactor(admin)`; T3–T4, T6–T8 `test(admin)` + `fix(admin)` pairs (RED commit optional per repo TDD convention — squash test+impl per task, one commit per task); T5 `test(admin)`; T9 `test(admin)`; T10 `test(admin)`; T12 `docs(plan)`.

## 12. Closeout

impeccable-gate: critique=<RAN|RAN-DEGRADED> audit=<RAN|RAN-DEGRADED> p0=<int> p1=<int> dispositions=<recorded|none>

(TEMPLATE form until T11 runs; replaced with the RAN form + findings/dispositions before the whole-diff review.)
