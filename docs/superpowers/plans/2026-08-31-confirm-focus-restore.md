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

<!-- tasks: depth=2 red-contract -->

## Task 1 — root/rootSelector parity, red first

<!-- task: red=`pnpm exec vitest run tests/e2e/helpers/confirmFocusProbe.decide.test.ts` red-state=authored red-target=`tests/e2e/helpers/confirmFocusProbe.ts:52` why=`no code rejects a ConfirmControl whose root Locator and rootSelector name different elements, which is the round-4 code bug` ac=AC-7 -->

Round 4 found the revoke control with `root: activeList` and `rootSelector:` the
heading — two different elements, under a comment claiming a third thing. The
case could never reach its own settled assertion, because `insideRoot` is false
for every control when the root is a heading that contains none.

RED: add a case to the deciding suite that constructs a `ConfirmControl` whose
two root forms disagree and expects a rejection. It fails because nothing
rejects it today. GREEN: `assertRootParity(control)` compares the Locator's
resolved element to `rootSelector`'s and throws naming both. Called from
`measureConfirmPath` and `measureCancelPath` before any reading.

## Task 2 — the rotate case the probe never had

<!-- task: red=`pnpm exec playwright test --project=mobile-safari tests/e2e/confirm-focus-probe.spec.ts` red-state=authored red-target=`app/admin/show/[slug]/RotateShareTokenButton.tsx:145` why=`the C5 restore effect is gated on restoreFocusRef, which no confirm path writes, so a rotate case asserting the settled trigger fails` ac=AC-1 -->

Rotate is measured only in the merged arc's uncommitted probe. Add its case to
`confirm-focus-probe.spec.ts`, driving the ShareHub rotate control with the same
capture-before-act shape, and assert the settled focused element against the
captured trigger.

## Task 3 — the non-success branches

<!-- task: red=`pnpm exec playwright test --project=mobile-safari tests/e2e/confirm-focus-probe.spec.ts` red-state=authored red-target=`app/admin/settings/admins/RevokeRowButton.tsx:135` why=`the restore effect fires only for ui === "idle" with restoreFocusRef set, so refused, watchdog and retry branches strand focus and the new cases fail` ac=AC-4 -->

Cases for revoke refusal, the 12s watchdog reaching `couldnt_confirm`, a sticky
late result, and refused-then-retried. Each asserts the focused element the spec
§4 row names for that branch.

## Task 4 — exact-trigger Cancel

<!-- task: red=`pnpm exec vitest run tests/e2e/helpers/confirmFocusProbe.decide.test.ts` red-state=authored red-target=`tests/e2e/helpers/confirmFocusProbe.ts:236` why=`the cancel arm asserts insideRoot and non-BODY only, so a cancel that restores to the WRONG in-surface control passes today` ac=AC-5 -->

RED: a deciding case where cancel restores to a different in-surface control and
the assertion must fail. GREEN: the cancel arm compares against the captured
trigger identity, not merely `insideRoot`.

## Task 5 — repair rotate and picker reset

<!-- task: red=`pnpm exec playwright test --project=mobile-safari tests/e2e/confirm-focus-probe.spec.ts` red-state=authored red-target=`app/admin/show/[slug]/PickerResetControl.tsx:104` why=`the restore is gated on restoreFocusRef which only closeConfirm writes, and no confirm path calls closeConfirm` ac=AC-1,AC-2 -->

Set the restore flag on the confirm path's settle, so the existing C5 effect
fires. Do NOT disable the submitter synchronously anywhere (AC-6).

## Task 6 — repair revoke, including the heading target

<!-- task: red=`pnpm exec playwright test --project=mobile-safari tests/e2e/confirm-focus-probe.spec.ts` red-state=authored red-target=`components/admin/settings/AdministratorsSection.tsx:64` why=`the heading has no tabIndex, so it cannot receive programmatic focus and the revoke-success case fails` ac=AC-3,AC-6 -->

`tabIndex={-1}` on `#admin-settings-admins-heading`; focus it on the success
path with `scrollIntoView({ block: "nearest" })`. The submitter keeps its
`isPending` disable (AC-6). The announcement channel is untouched (AC-8).

## Task 7 — the non-focus evidence

<!-- task: red=`pnpm exec vitest run tests/components/settings/administratorsSectionFocusTarget.test.tsx` red-state=authored red-target=`components/admin/settings/AdministratorsSection.tsx:64` why=`the heading renders without tabIndex today, so a rendered-attribute assertion fails before Task 6` ac=AC-8,AC-9 -->

A jsdom assertion that the heading renders `tabIndex={-1}`; a structural
assertion that `ArchiveShowButton.tsx` and `ShareHub.tsx` are absent from the
diff; an assertion that the announcement region's content is unchanged by the
focus move.

## Task 8 — transition audit

<!-- task: red=`pnpm exec vitest run tests/components/settings/administratorsSectionFocusTarget.test.tsx` red-state=authored red-target=`app/admin/settings/admins/RevokeRowButton.tsx:162` why=`no test enumerates the conditional branches effectiveUi selects, so a compound transition that strands focus passes today` ac=AC-4 -->

Enumerate every conditional render in the three controls and assert each has the
focus treatment the spec's inventories name, including the three compound rows:
arm-expiry during resolving, late non-OK versus late OK under sticky
`couldnt_confirm`, and `effectiveUi` rendering idle while `ui` is `resolving`.
The spec's two inventory tables are the checklist; 3 unordered pairs for rotate
and picker, 6 for revoke.

<!-- tasks: end -->

## Checklist

- [ ] Tasks 1-8, TDD each, scoped runs only
- [ ] Self-review
- [ ] Adversarial review (cross-model)
- [ ] invariant-8 impeccable pair (`app/` and `components/` are touched)
- [ ] Whole-diff Codex review
- [ ] Thirteen required CI checks, read from the branch-protection API
- [ ] Execution handoff / READINESS
