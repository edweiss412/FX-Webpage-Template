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
- AC-9 `ArchiveShowButton` and `ShareHub` are absent from the diff (discharged by the closeout)

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

<!-- task: red=`pnpm exec vitest run tests/e2e/helpers/confirmFocusProbe.decide.test.ts` red-state=authored red-target=`tests/e2e/helpers/confirmFocusProbe.ts:166` why=`measureConfirmPath looks controls up through control.root while every reading goes through control.rootSelector, and no line compares the two, which is how the revoke case shipped with a Locator on the list and a selector on the heading` ac=AC-7 -->

RED: a deciding case constructing a control whose two root forms resolve to
different elements, expecting a throw. GREEN: `assertRootParity` compares the
resolved elements and throws naming both, called from `measureConfirmPath` and
`measureCancelPath` before any lookup.

## Task 2 — Cancel is asserted against the exact trigger

<!-- task: red=`pnpm exec vitest run tests/e2e/helpers/confirmFocusProbe.decide.test.ts` red-state=authored red-target=`tests/e2e/helpers/confirmFocusProbe.ts:224` why=`the cancel arm asserts insideRoot only, so a cancel that restores to the WRONG in-surface control passes` ac=AC-5 -->

RED: a deciding case where cancel restores to a different in-surface control.
GREEN: the cancel arm compares against the captured trigger identity.

## Task 3 — rotate restores focus on both settled branches

<!-- task: red=`pnpm exec vitest run tests/components/RotateShareTokenButton.test.tsx` red-state=authored red-target=`app/admin/show/[slug]/RotateShareTokenButton.tsx:179` why=`onConfirmClick never writes restoreFocusRef, so the C5 effect sees false and the trigger is never refocused on the OK or the refused branch` ac=AC-1 -->

RED: jsdom cases for OK and refused, each with a premise that the result arrived
(that branch's banner is rendered). GREEN: the confirm path sets the restore
flag before returning to idle.

## Task 4 — picker reset restores focus on both settled branches

<!-- task: red=`pnpm exec vitest run tests/admin/pickerResetControl.test.tsx` red-state=authored red-target=`app/admin/show/[slug]/PickerResetControl.tsx:160` why=`onConfirm never writes restoreFocusRef, so the restore effect sees false on both the ok and non-ok outcomes` ac=AC-2 -->

Same shape, against `outcome.kind`.

## Task 5 — revoke non-success branches, and the submission that must survive them

<!-- task: red=`pnpm exec vitest run tests/components/RevokeRowButton.test.tsx` red-state=authored red-target=`app/admin/settings/admins/RevokeRowButton.tsx:134` why=`the restore effect gates on RAW ui === "idle" and depends on [ui], but a refused result leaves ui === "resolving" while only effectiveUi renders idle, so the effect never fires on any non-success branch` ac=AC-4,AC-6 -->

RED cases: refused `result.kind`; the watchdog reaching `couldnt_confirm`; a late
non-OK under sticky `couldnt_confirm`; refused-then-retried. Each carries an
executable premise that the branch was REACHED — that branch's rendered marker,
and for retry a dispatch count of two. The dispatch-count assertion lives HERE,
in the same task, because it is the regression a wrong repair of THIS code
causes: it is not a separate verification pass.

GREEN, and round 2 was right that the first statement of it was insufficient:
the restore must key on the branch actually RENDERED, not on raw `ui`. Either the
effect's condition and dependency move to `effectiveUi`, or the refused path
settles `ui` to idle. The retry case additionally needs the stale refused
`result` cleared, or the second `setUi("resolving")` leaves `effectiveUi`
computing from it.

## Task 6 — the heading becomes a focus target, and revoke success uses it

<!-- task: red=`pnpm exec vitest run tests/components/settings/administratorsSectionFocusTarget.test.tsx` red-state=authored red-target=`components/admin/settings/AdministratorsSection.tsx:86` why=`the live heading renders without tabIndex, so it cannot receive programmatic focus and every assertion in the new suite fails` ac=AC-3,AC-8 -->

RED asserts four things about the live heading (`components/admin/settings/AdministratorsSection.tsx:86`, not the list-failed
heading at `components/admin/settings/AdministratorsSection.tsx:64`): it renders `tabIndex={-1}`; the success path focuses it;
**the focus call passes `block: "nearest"`, asserted on the call itself** (AC-3's
nearest-only scrolling, which round 2 correctly found unstated in the GREEN); and
the announcement region's content is unchanged by the focus move. GREEN delivers
all four.

<!-- tasks: end -->

## Checklist

- [ ] Tasks 1-6, TDD each, scoped runs only
- [ ] Closeout, NOT a TDD task: the transition matrix. Round 4 found the last instance of the class the three earlier rounds closed — Task 5 already adds the watchdog case and its premise, so a matrix authored afterwards maps cleanly and starts green. The matrix AUDITS coverage the tasks produce: it can only be red before them and green after, which spans tasks rather than living inside one. `docs/agents/writing-plans.md` requires the audit to EXIST and RUN, not to be a TDD task, so it runs here — one row per pair from the spec's two inventories (3 for rotate and picker, 6 for revoke) plus the three compound rows, each mapped to the assertion that decides it or an explicit "unreachable, and why". A row with neither is a gap the closeout must close before READINESS.
- [ ] Closeout, NOT a TDD task: the e2e cases. Round 3 was right that an e2e rotate case added AFTER Tasks 3 and 6 starts green — by then production is repaired, so there is no observable red on that command. E2E coverage here VERIFIES repairs the jsdom tasks already decided, which is the same shape round 2 removed. It runs at closeout under a granted playwright turn: add the rotate case, keep picker, archive and revoke success, and require the whole spec file green.
- [ ] Closeout, NOT a TDD task: confirm `components/admin/ArchiveShowButton.tsx` and `components/admin/showpage/ShareHub.tsx` are absent from the branch diff (AC-9). Round 2 was right that this cannot be a red-then-green task — it is true from the first commit and stays true, so it is a closeout check rather than a task with an implementation step.
- [ ] Self-review
- [ ] Adversarial review (cross-model)
- [ ] invariant-8 impeccable pair (`app/` and `components/` are touched)
- [ ] Whole-diff Codex review
- [ ] Thirteen required CI checks, read from the branch-protection API
- [ ] Execution handoff / READINESS
