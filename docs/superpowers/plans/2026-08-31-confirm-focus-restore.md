# Plan — confirm-path focus restore

Spec: `docs/superpowers/specs/2026-08-31-confirm-focus-restore.md`.
Row: `BL-CONFIRM-FOCUS-RESTORE-DESTRUCTIVE-CONTROLS`.

Three controls, ratified: rotate, picker reset, revoke admin. `ArchiveShowButton`
is REFUTED by measurement and must not be touched (spec §1.1, §2.3).

## Acceptance criteria

- AC-1 rotate restores focus to its trigger when the confirm resolves, on the OK and the refused branches.
- AC-2 picker reset restores focus to its trigger when the confirm resolves, on the OK and the non-OK branches.
- AC-3 revoke SUCCESS moves focus to `#admin-settings-admins-heading`, which takes `tabIndex={-1}`, scrolled nearest-only.
- AC-4 revoke non-success focuses the control that branch renders: the revoke trigger for a refused result and for the `effectiveUi`-renders-idle case, the Refresh control for `couldnt_confirm`.
- AC-5 the Cancel path is unchanged on all three, asserted against the EXACT trigger.
- AC-6 `RevokeRowButton`'s native submit still fires; no synchronous disable of the submitter in its own `onClick`.
- AC-7 a `ConfirmControl` whose `root` and `rootSelector` name different elements is caught by a test rather than by a reviewer.
- AC-8 the revoke outcome announcement is not merged into the focus move.
- AC-9 `ArchiveShowButton` and `ShareHub` are absent from the diff.

## Meta-test inventory

CREATES `tests/e2e/helpers/confirmFocusProbe.decide.test.ts` (already live: the
browser-free deciding suite for the focus assertion). EXTENDS it in Task 1.
No other structural meta-test applies: this change touches no Supabase call
boundary, no advisory lock, no `admin_alerts` catalog row, and no tile sentinel.

## Layout-dimensions task

**N/A, deliberately.** The spec's §5.1 says the same and for the same reason:
this change moves focus, not layout. It adds no element, changes no
fixed-dimension parent, and alters no flex or grid relationship. The one new
rendered attribute is `tabIndex={-1}` on an existing heading.

## e2e harness-readiness checklist

- **Server boot.** `pnpm exec playwright test --project=mobile-safari`, dev
  server on :3000, `BASELINE_SERVER_ONLY=1` so the :3001-:3003 build servers do
  not start. Without it the run dies on `Timed out waiting 300000ms from
  config.webServer` and leaves `app/admin/dev/*.disabled-by-build-gate` renamed
  aside in the working tree.
- **Readiness gate.** `openShowReviewModal(page, slug, { timeoutMs: 30_000 })`,
  plus the `ensureWatchedFolder()` beforeEach — `app_settings.watched_folder_id`
  being NULL makes `/admin` render the onboarding wizard and the modal never
  mounts. Never `networkidle` alone.
- **Detach-safety.** Already fixed and must stay fixed: readings run page-side
  and re-query `rootSelector` each time, so a root destroyed by the action under
  measurement reports `rootPresent: false` instead of hanging to the test
  timeout. Archiving unmounts the popover by design; that is what hung a run for
  180s before the fix.
- **CI wiring.** `.github/workflows/lifecycle-layout-e2e.yml` names the spec
  explicitly. Matching the `mobile-safari` project is NOT enough when the step
  passes an explicit path list (`LIM-PLAYWRIGHT-RED-TESTMATCH`).

## Restructured after plan review round 1

Round 1 was right that the first draft could not satisfy its own contract: it
split test-authoring tasks from implementation tasks, so six `red=` commands
stayed red past their own task. **Every task below now pairs its RED test with
the implementation that turns that SAME command green**, which is what invariant
1 requires and what the first draft only approximated.

Two facts from the round-1 probe changed the shape as well:

- **`RevokeRowButton` has no injectable action.** It binds `useActionState` to
  `revokeAdminAction` (`app/admin/settings/admins/RevokeRowButton.tsx:81`) and submits through a real `<form action={formAction}>`
  (`app/admin/settings/admins/RevokeRowButton.tsx:305`), unlike rotate which carries a `useDevActionOverride` seam
  (`app/admin/show/[slug]/RotateShareTokenButton.tsx:98`). Its refusal, watchdog, sticky-late-result and retry branches are
  therefore decided in **jsdom**, where the action is mockable, using the
  existing `tests/components/RevokeRowButton.test.tsx`. Only the SUCCESS path is
  drivable end to end. No production seam is added to make a test convenient.
- **The live heading is `components/admin/settings/AdministratorsSection.tsx:86`, not `components/admin/settings/AdministratorsSection.tsx:64`.** The latter is inside the
  list-failed early return. The first draft pointed two tasks at the error-path
  heading.

<!-- tasks: depth=2 red-contract -->

## Task 1 — reject a ConfirmControl whose two root forms disagree

<!-- task: red=`pnpm exec vitest run tests/e2e/helpers/confirmFocusProbe.decide.test.ts` red-state=authored red-target=`tests/e2e/helpers/confirmFocusProbe.ts:186` why=`measureConfirmPath reads through rootSelector and looks controls up through root, and nothing compares them, which is how the revoke case shipped with a Locator on the list and a selector on the heading` ac=AC-7 -->

RED: a deciding case constructing a control whose `root` and `rootSelector`
resolve to different elements, expecting a throw. GREEN: `assertRootParity`
compares the two resolved elements and throws naming both; called at the top of
`measureConfirmPath` and `measureCancelPath`.

## Task 2 — Cancel is asserted against the exact trigger

<!-- task: red=`pnpm exec vitest run tests/e2e/helpers/confirmFocusProbe.decide.test.ts` red-state=authored red-target=`tests/e2e/helpers/confirmFocusProbe.ts:232` why=`the cancel arm asserts insideRoot and non-BODY only, so a cancel restoring to the WRONG in-surface control passes` ac=AC-5 -->

RED: a deciding case where cancel restores to a different in-surface control.
GREEN: the cancel arm compares against the captured trigger identity.

## Task 3 — rotate restores focus on both settled branches

<!-- task: red=`pnpm exec vitest run tests/components/RotateShareTokenButton.test.tsx` red-state=authored red-target=`app/admin/show/[slug]/RotateShareTokenButton.tsx:179` why=`onConfirmClick never writes restoreFocusRef, so the C5 effect at :145 sees false and the trigger is never refocused on the OK or refused branch` ac=AC-1 -->

RED: jsdom cases for the OK and refused branches asserting the trigger holds
focus once the row returns to idle, with a per-case premise that the result
actually arrived (the banner for that branch is rendered). GREEN: the confirm
path sets the restore flag before returning to idle.

## Task 4 — picker reset restores focus on both settled branches

<!-- task: red=`pnpm exec vitest run tests/admin/pickerResetControl.test.tsx` red-state=authored red-target=`app/admin/show/[slug]/PickerResetControl.tsx:160` why=`onConfirm never writes restoreFocusRef, so the restore effect at :104 sees false on both the ok and non-ok outcomes` ac=AC-2 -->

Same shape as Task 3, against `outcome.kind`.

## Task 5 — revoke non-success branches, in jsdom

<!-- task: red=`pnpm exec vitest run tests/components/RevokeRowButton.test.tsx` red-state=authored red-target=`app/admin/settings/admins/RevokeRowButton.tsx:181` why=`onConfirmClick never writes restoreFocusRef, so refused, couldnt_confirm and the effectiveUi-idle branch all leave focus where the disabled submitter was` ac=AC-4 -->

Cases for: a refused `result.kind`, the watchdog reaching `couldnt_confirm`, a
late non-OK under sticky `couldnt_confirm`, and refused-then-retried. **Each
carries an executable premise that the branch was actually reached** — the
rendered branch marker for that state, and for the retry case a submit count of
two — so a case cannot pass by finding the initial idle trigger focused. GREEN:
the confirm path sets the restore flag for the branches that re-render idle, and
`couldnt_confirm` focuses the Refresh control that branch renders.

## Task 6 — the heading becomes a focus target, and revoke success uses it

<!-- task: red=`pnpm exec vitest run tests/components/settings/administratorsSectionFocusTarget.test.tsx` red-state=authored red-target=`components/admin/settings/AdministratorsSection.tsx:86` why=`the live heading renders without tabIndex, so it cannot receive programmatic focus and a rendered-attribute assertion fails` ac=AC-3,AC-8 -->

RED: assert the live heading (`components/admin/settings/AdministratorsSection.tsx:86`, not the list-failed heading at `components/admin/settings/AdministratorsSection.tsx:64`)
renders `tabIndex={-1}`, that the success path focuses it, that the focus call
passes `block: "nearest"`, and that the announcement region's content is
unchanged by the focus move. GREEN: the attribute plus the focus call.

## Task 7 — the submit still fires

<!-- task: red=`pnpm exec vitest run tests/components/RevokeRowButton.test.tsx` red-state=authored red-target=`app/admin/settings/admins/RevokeRowButton.tsx:378` why=`no test asserts the native submission reaches the action, so a repair that disables the submitter synchronously would pass every focus assertion while silently cancelling the dispatch` ac=AC-6 -->

RED: assert the action receives exactly one dispatch per confirm, including on
the retry path. This is the regression the `isPending` disable exists to prevent
(`app/admin/settings/admins/RevokeRowButton.tsx:381-389`).

## Task 8 — transition audit, row by row

<!-- task: red=`pnpm exec vitest run tests/components/settings/administratorsSectionFocusTarget.test.tsx` red-state=authored red-target=`app/admin/settings/admins/RevokeRowButton.tsx:162` why=`no test enumerates the branches effectiveUi selects, so a compound transition that strands focus passes` ac=AC-4 -->

A matrix with one row per pair from the spec's inventories — 3 for rotate and
picker, 6 for revoke — plus the three compound rows, each mapped to the
executable assertion that decides it or to an explicit "unreachable, and the
reason". A row with neither is a gap this task must close.

## Task 9 — e2e: the drivable paths, end to end

<!-- task: red=`pnpm exec playwright test --project=mobile-safari tests/e2e/confirm-focus-probe.spec.ts` red-state=authored red-target=`app/admin/show/[slug]/RotateShareTokenButton.tsx:179` why=`with the jsdom repairs in place the e2e rotate and revoke-success cases still fail until the same confirm-path flag lands, and the settled assertion compares against the captured target` ac=AC-1,AC-3 -->

Add the rotate case; keep picker, archive and revoke success. Needs a granted
playwright turn from bl-orch under strict serial heavy.

## Task 10 — structural: the refuted control stays untouched

<!-- task: red=`pnpm exec vitest run tests/docs/confirmFocusScope.test.ts` red-state=authored red-target=`components/admin/ArchiveShowButton.tsx:201` why=`nothing asserts the arc leaves ArchiveShowButton and ShareHub alone, so a later edit could silently repair a control the probe REFUTED` ac=AC-9 -->

Assert both files are absent from the branch diff against `origin/main`.

<!-- tasks: end -->

## Checklist

- [ ] Tasks 1-8, TDD each, scoped runs only
- [ ] Self-review
- [ ] Adversarial review (cross-model)
- [ ] invariant-8 impeccable pair (`app/` and `components/` are touched)
- [ ] Whole-diff Codex review
- [ ] Thirteen required CI checks, read from the branch-protection API
- [ ] Execution handoff / READINESS
