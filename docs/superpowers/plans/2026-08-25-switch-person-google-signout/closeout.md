# Closeout — feat/switch-person-google-signout

Spec: `docs/superpowers/specs/2026-08-25-switch-person-google-signout-design.md` (APPROVED, spec round 4). Plan: `plan.md` beside this file (APPROVED, plan round 3).

## 12. Invariant-8 UI gate — impeccable critique + audit

Both halves ran 2026-08-25 through the impeccable v3 setup gates (`context.mjs` with PRODUCT.md + DESIGN.md, register `product.md`, project files `app/globals.css` and `DESIGN.md`), by a dedicated review session against the branch diff on `components/auth/AvatarMenu.tsx` and the surface it renders (the switch-person row, its pending state, its failure alert). Static review; no dev server. `detect.mjs` on the file returned no hits.

impeccable-gate: critique=RAN audit=RAN p0=0 p1=2 dispositions=recorded

Critique 28/40; audit 19/20 (a11y 3, perf 4, responsive 4, theming 4, anti-patterns 4).

| # | Tier | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | P1 (critique + audit) | The pending state was dimming only: no `aria-busy`, no status announcement (WCAG 2.1 4.1.3), and this diff turns the window into a sign-out network round trip. Reachability caused by this diff; the defect sat in untouched code. | FIXED in-branch, commit `fix(crew-page): announce the pending switch-person state`: `aria-busy` on the item while pending, an always-mounted sr-only `role="status"` region outside the menu reading "Switching person" (the `_ClaimedRowButton` shape). TDD: 1 red, then 60 green across the menu, live-region-mounting, and identity-chip suites. |
| 2 | P1 (critique) | No pending watchdog: a hung transition dims the row permanently and the re-entry guard blocks every retry; the same-route sibling carries `PENDING_TIMEOUT_MS = 8_000`. | DEFERRED, class-sweep exception (c): the repair needs a new timing constant, and DESIGN.md's interaction-timing table is pinned bidirectionally by `tests/docs/_metaInteractionTimingInventory.test.ts`, a design-token surface this arc does not otherwise touch. Filed `BL-AVATAR-MENU-SWITCH-PENDING-WATCHDOG` (product-facing). |
| 3 | P2 (critique) | "Couldn't switch. Please try again." is advice that cannot work for a persistent sign-out fault (a retry re-runs the same failing call). | Not fixed here: the copy is a catalog row (`PICKER_SWITCH_FAILED`, §12.4 three-lockstep) and the ratified failure copy of the prior arc; changing it is a copy decision (exception (a)). Recorded in the spec's §7 posture: every fault renders that copy and the retry is idempotent. |
| 4 | P2 (critique) | A fault landing after the person taps away is never seen (the alert lives inside the popover); the window is longer now. | Pre-existing and ratified by the prior arc (`lib/messages/catalog.ts` `PICKER_SWITCH_FAILED` docblock: a viewer who closed the menu mid-clear never sees the alert). Unchanged. |
| 5 | P3 (audit) | DESIGN.md claims warning-text contrast 9.5 / 9.2; computed 8.79 / 9.64 (matches `tests/admin/_metaDestructiveConfirm.test.ts`). Both clear AAA. | Pre-existing stale prose, outside this arc's files. Not edited. |

Not raised, by ratification: hiding or relabelling the control for Google viewers (spec §1.1).

## Verification run at closeout

- `pnpm typecheck && pnpm exec eslint . && pnpm format:check` — see the readiness report for the head sha these ran on.
- `pnpm heavy pnpm test:fast` — same.
- Scoped: `pnpm vitest run tests/auth/picker/clearIdentity.test.ts tests/admin/readShowReviewSnapshot.test.ts tests/auth/_metaInfraContract.test.ts tests/log/_metaMutationSurfaceObservability.test.ts tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaLedgerMintBar.test.ts`.
- E2E (Task 2): RED on the pre-fix file, GREEN on the branch, transcript in the Task 2 commit body.

## Ledger

`BL-SWITCH-PERSON-GOOGLE-LOOPBACK` shipped; `BL-SNAPSHOT-READ-TRANSIENT-502-POSTURE` closed as subsumed by PR #882's fetch-layer retry (orchestrator ruling, spec §4). Both archived in the PR's last commit, which also removes their IN PROGRESS markers. `BL-AVATAR-MENU-SWITCH-PENDING-WATCHDOG` filed (finding 2).
