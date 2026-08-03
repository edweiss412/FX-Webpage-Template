# Plan — orphaned components + the LEAD capability prose

**Spec:** `docs/superpowers/specs/2026-08-03-orphan-components-lead-prose-design.md` (canonical;
every decision below is settled there, with citations). **Branch:**
`chore/orphan-components-lead-prose` off `origin/main` @ `369bfcce0`. **Implementer:** Opus /
Claude Code (`components/` is Opus-owned by the AGENTS.md routing hard rule). **Reviewer:** Codex,
adversarially, never as implementer.

Eleven tasks, one commit each (invariant 6). Every task is TDD (invariant 1): the guard or test
that fails without the change lands first, then the change.

---

## 0. Pre-draft verification pass (run 2026-08-03, before this body was written)

| Claim the plan relies on | Command | Result |
| --- | --- | --- |
| 5 orphans on current `main` | `orphanScan()` via `tsx` against `369bfcce0` | 191 components, 5 orphans, identical to `ORPHAN_ALLOWLIST` |
| The guard's failure families | read `tests/components/_metaOrphanedComponents.test.ts:52-80` | (a) unlisted orphan, (b) row for a deleted file, (c) newly orphaned, (d) row for an imported file |
| `admin-alert-confirm-resolve-button` is dead | `rg -n "admin-alert-confirm-resolve-button" app components tests` | 6 hits, all in `ResolveAlertButton.tsx` + its own test |
| `WrappedTile` is the sole prod importer of two files | `rg -n "TileServerFallback\|TileErrorBoundary" app components lib` | `TileServerFallback` ← `WrappedTile` only; `TileErrorBoundary` ← `WrappedTile` only; `TileErrorFallback` ← `TileServerFallback` + `WrappedSection` (live) |
| The hero exposes every DOM hook the retargeted suites use | `rg -n "data-testid=\|data-stale\|data-prefers-reduced-motion" components/crew/RightNowHero.tsx` | all present at `components/crew/RightNowHero.tsx:467-528`; only the root testid differs |
| `admin/ops` census | `rg -n "admin/ops" --glob '!node_modules' .` | 12 files, dispositioned in spec §4.2 |
| The invariant-8 marker grammar | read `tests/docs/_invariant8Closeout.ts:45-49` | exactly `impeccable-gate: N/A — no UI surface` or the RAN form; no free-text reason on the marker line |
| `spec:lint` on the spec | `pnpm spec:lint <spec>` | 0 hard, 33 advisory |
| `spec:lint` on THIS plan | `pnpm spec:lint <plan>` | 0 hard once the citations to files this plan CREATES are discounted — `CITATION_FILE_MISSING` is a git-tracked-path check (`lib/specLint/citations.ts:128`), so a plan naming a file it has not written yet always trips it. Four genuine malformed-citation findings were repaired; the residue is exactly the three new test files named in §0.1. `spec:lint` is not a CI gate (no workflow invokes it) |

## 0.1 Meta-test inventory (mandatory declaration)

- **EXTENDS** `tests/components/_metaOrphanedComponents.test.ts` — via its ledger
  (`tests/components/_orphanedComponents.ts`): five rows to one. No change to the guard's logic.
- **CREATES** `tests/visibility/capabilityHeaderParity.test.ts` — the structural defense for the
  class spec §4.1 names: a comment block labelled "verbatim branch logic" drifting from the
  function it quotes. Ships in the SAME commit as the prose fix, per the writing-plans
  structural-defense calibration rule (the class is nameable at first occurrence, so the defense
  does not wait for a recurrence).
- **CREATES** `tests/docs/capabilityClaimProse.test.ts` — the structural defense for spec §4.2:
  the master spec must not assert that any `role_flags` element grants admin access.
- **NO CHANGE** to `tests/auth/_metaInfraContract.test.ts` (no Supabase call site added or moved),
  `tests/auth/advisoryLockRpcDeadlock.test.ts` (no `pg_advisory*` surface), or
  `tests/log/_metaMutationSurfaceObservability.test.ts` (no mutating route or `"use server"`
  action added or removed). Declared explicitly rather than left silent.

## 0.2 Advisory-lock holder topology

**N/A.** No task touches `pg_advisory_xact_lock`, `pg_try_advisory_xact_lock`, or any RPC. Grep:
`rg -n "pg_advisory" app components lib` — zero hits in any file this plan edits.

## 0.3 e2e harness readiness

**N/A.** No task attaches a Playwright spec. `tests/e2e/right-now.spec.ts` and
`tests/e2e/right-now-transitions.spec.ts` are edited in their HEADER PROSE only (Task 3); their
assertions, fixtures, boot mechanism, and hydration gates are untouched.

---

## Task 1 — retarget the stale-tint recovery suite onto `RightNowHero`

**Failure mode it catches:** the Codex round-9 HIGH regressing in the LIVE component — stale tint
pinned on `lastGood` after `unknown → show_day_n` recovery, so a crew member whose sync error
cleared keeps reading yesterday's call time under a stale tint indefinitely. Today that regression
is pinned only against a component nothing renders.

1. `git mv tests/components/RightNowCardRecovery.test.tsx tests/components/crew/rightNowHeroRecovery.test.tsx`.
2. Swap the import to `@/components/crew/RightNowHero` and the JSX to
   `<RightNowHero context={…} />`. Both components take the identical prop
   (`{ context: RightNowContext }` from `components/right-now/buildRightNowContext.ts`), so the
   fixture builder ports unchanged.
3. **Retarget the selectors per spec §3.4's table — this is NOT a testid swap** (spec R1). Root
   `right-now-card` → `right-now-hero` (`components/crew/RightNowHero.tsx:467`).
   `right-now-state`, `right-now-body`, `right-now-lead`, `data-stale` keep their names. But
   `right-now-detail` has NO hero counterpart in `show_day_n`: the hero sets `detail: null` and
   routes the call time into a `Show` stat (`components/crew/RightNowHero.tsx:158-178`) rendered as
   `data-stat="Show"` inside `data-testid="right-now-stats"`
   (`components/crew/RightNowHero.tsx:571-585`). The three `Call: <t>` assertions read
   `[data-stat="Show"] dd` instead. **Scope the extraction to that node**, never the whole hero, so
   the lead line cannot satisfy the assertion by accident.
4. Update the header block: keep the spec context, the driving strategy, and **all four
   anti-tautology guarantees**, changing the component name and the detail-vs-stat carrier. The
   guarantee that the recovery assertion uses a callTime absent from `lastGood` (15:30 vs 14:00) is
   the load-bearing one, and it SURVIVES the move: the suite's `makeContext` sets
   `showAnchors: []`, which is exactly the hero's legacy fallback to `ctx.callTime`
   (`components/crew/RightNowHero.tsx:158-161`), so the two values still render as different
   strings and a render-`lastGood` bug still cannot produce `15:30`. Note that fact in the header
   so the next reader does not "simplify" the fixture and silently defeat the pin.
5. Run RED first, in two steps. (a) Point the suite at the hero with ONLY the root testid changed
   and run it: it must fail on the missing `right-now-detail` node — that failure is the proof the
   carrier really moved, and it is recorded in the closeout. (b) Apply the stat-carrier retarget
   and watch it go green. A suite that is green at step (a) means the retarget was not exercised
   and the assertion is tautological; strengthen it before proceeding.

**Divergence rule:** if a hero copy or markup difference makes an assertion inapplicable, do NOT
drop the assertion. Record the divergence in the closeout (§12) as a finding and adapt the
assertion to the hero's own rendered output, still derived from fixture inputs and never imported
from the production render helper.

**Verify:** `pnpm test -- tests/components/crew/rightNowHeroRecovery.test.tsx`
**Commit:** `test(crew): retarget the stale-tint unwind pins onto the live RightNowHero`

## Task 2 — retarget the reduced-motion-at-mount suite onto `RightNowHero`

**Failure mode it catches:** the Codex round-19 MEDIUM regressing in the live component —
`data-prefers-reduced-motion` resolving after mount, so a reduced-motion viewer gets one animated
frame before the preference applies (an SSR flash to a stub state).

Same procedure as Task 1 against `tests/components/RightNowCardReducedMotionInitial.test.tsx` →
`tests/components/crew/rightNowHeroReducedMotionInitial.test.tsx`. The assertion reads
`data-prefers-reduced-motion` on the root, which the hero carries at
`components/crew/RightNowHero.tsx:470`.

**Verify:** `pnpm test -- tests/components/crew/rightNowHeroReducedMotionInitial.test.tsx`
**Commit:** `test(crew): retarget the reduced-motion-at-mount pin onto the live RightNowHero`

## Task 3 — retire `RightNowCard`

**Failure mode it catches:** dead code that reads as live. Its comments are cited by six live files
as though the card were the shipped hero, which is how a future reader ends up editing the wrong
component.

1. **RED first:** delete the `components/right-now/RightNowCard.tsx` row from
   `ORPHAN_ALLOWLIST` (`tests/components/_orphanedComponents.ts:69-73`) and run the guard. It must
   FAIL family (a) — proving the row is what was suppressing it — then delete the component and
   watch the same run go green via family (b)'s absence.
2. Delete `components/right-now/RightNowCard.tsx`.
3. **Repair the two EXECUTABLE citations first** (spec §5), because they turn the tree red rather
   than merely stale: `tests/help/_metaServerTimeGuard.test.ts:123-138` `readFileSync`s the card to
   prove its client-vs-server classifier separates a `'use client'` island from a server component
   — repoint the island exemplar to `components/crew/RightNowHero.tsx`, which carries the same
   directive, so the assertion keeps its meaning; and delete the card's row from
   `tests/styles/_metaBgAccentInventory.test.ts:112`, which otherwise reports
   `STALE REGISTRY ROW` (the hero's own row at `tests/styles/_metaBgAccentInventory.test.ts:110`
   already covers the live surface).
4. Repair every prose citation (spec §5): `components/crew/RightNowHero.tsx` header + seven in-body
   comments (rewrite as retirement-aware provenance naming commit `b327d5eb0`; drop the
   line range it carries into the deleted file, which can no longer be checked);
   `lib/time/rightNow.ts:113`; `lib/a11y/usePrefersReducedMotion.ts:23-24`;
   `app/globals.css:143` (comment only — no `@theme` token added, renamed, or removed);
   `DESIGN.md:216`; `tests/setup.ts:61-64`; `tests/components/Header.test.tsx:8` and
   `tests/components/Header.test.tsx:12`; `tests/components/crew/rightNowHero.test.tsx:5` and
   `tests/components/crew/rightNowHero.test.tsx:7`;
   `components/right-now/buildRightNowContext.ts:4` and `components/right-now/buildRightNowContext.ts:8`;
   `app/help/_components/Callout.tsx:26-27` (repoint the `stale-tint` semantic to the hero's
   equivalent site); `components/layout/Header.tsx:4` and `components/layout/Header.tsx:8`;
   `components/layout/PageTransition.tsx:8`; the header prose of `tests/e2e/right-now.spec.ts` and
   `tests/e2e/right-now-transitions.spec.ts` (prose only — the specs drive the real page and their
   assertions are untouched).
5. **Class sweep before finishing, UNSCOPED:**
   `rg -n "RightNowCard" --glob '!node_modules' --glob '!.next' .` must return only this plan, the
   spec, and historical records under `docs/`. Scoping the sweep to `app components lib tests` is
   what hid the two executable hits from the draft (spec §5's sweep lesson). Every code/test hit is repaired in THIS
   commit, not one per review round.

**Verify:** `pnpm test -- tests/components/_metaOrphanedComponents.test.ts tests/components/crew`
then `pnpm typecheck`
**Commit:** `chore(crew-page): retire RightNowCard, superseded by RightNowHero`

## Task 4 — retire `PerShowCrewSection`

**Failure mode it catches:** a guard (`no-load-show-crew-with-auth`) that keeps two of its three
rows pointed at files nobody ships, so its green says less each release.

1. **RED first:** drop the allowlist row, confirm family (a) fails.
2. Delete `components/admin/PerShowCrewSection.tsx` and `tests/components/PerShowCrewSection.test.tsx`.
3. `tests/cross-cutting/no-load-show-crew-with-auth.test.ts:5-8` — remove the two rows for the
   deleted files. The surviving row (`app/admin/show/[slug]/page.tsx`) keeps the guard
   non-vacuous; state that in a comment so a later reader does not read the shrink as erosion.
4. `tests/help/forbidden-prose-registry.test.ts:80` — reword the reason to name the live surface.
   The registry's assertion is unchanged.
5. Class sweep: `rg -n "PerShowCrewSection\|PerShowCrewRow" app components lib tests` must be empty.

**Verify:** `pnpm test -- tests/cross-cutting tests/help tests/components/_metaOrphanedComponents.test.ts`
**Commit:** `chore(admin): retire PerShowCrewSection, superseded by the modal's CrewBreakdown`

## Task 5 — retire `ResolveAlertButton`

**Failure mode it catches:** the destructive-confirm registry
(`tests/styles/_metaDestructiveConfirm.test.ts`) pinning the confirm styling of a button no user
can reach, while five live files cite it as the pattern to copy.

1. **RED first:** drop the allowlist row, confirm family (a) fails.
2. Delete `components/admin/ResolveAlertButton.tsx` and `tests/components/ResolveAlertButton.test.tsx`.
3. Registries: delete the row at `tests/styles/_metaDestructiveConfirm.test.ts:85`; delete
   `"ResolveAlertButton.tsx"` from `MIGRATED_FILES`
   (`tests/styles/accent-button-atom.test.ts:59-66`) and extend the existing
   `ResumeFinalizeButton` de-migration note to cover the removal — that note is the precedent for
   exactly this edit.
4. Exemplar comments (spec §5): `components/shared/AccentButton.tsx:7-8` and `components/shared/AccentButton.tsx:34`,
   `app/admin/settings/admins/RevokeRowButton.tsx:7`, `components/admin/RetryWatchButton.tsx:7`,
   `components/admin/PendingPanelDiscardButtons.tsx:59`, `tests/components/RetryWatchButton.test.tsx:11`.
   plus `components/admin/ArchiveShowButton.tsx:9` and `tests/components/atoms/AccentButton.test.tsx:7`.
   Each repoints to a LIVE exemplar — the bell panel's trailing ghost RESOLVE control
   (`components/admin/BellPanel.tsx:377-388`, labelled `Confirm` / `Mark resolved` per
   `lib/adminAlerts/resolveActionLabel.ts:73-76`), or another destructive-confirm registry member.
   **Do NOT write "BellPanel's Dismiss"** (spec R1 LOW): that label does not exist, and writing it
   would ship fresh stale prose while repairing stale prose. A comment citing a deleted file is the
   same defect class the orphan guard exists to catch.
5. Class sweep: `rg -n "ResolveAlertButton" app components lib tests` must be empty.

**Verify:** `pnpm test -- tests/styles tests/components/RetryWatchButton.test.tsx tests/components/_metaOrphanedComponents.test.ts`
**Commit:** `chore(admin): retire ResolveAlertButton, superseded by the bell panel's Dismiss`

## Task 6 — retire `RunFinalCASButton`

**Failure mode it catches:** three test files exercising a finalize path no operator can trigger,
which reads as finalize coverage and is not.

1. **RED first:** drop the allowlist row, confirm family (a) fails.
2. Delete `components/admin/RunFinalCASButton.tsx` and
   `tests/components/admin/RunFinalCASButton.test.tsx`; remove the `RunFinalCASButton` describe
   from `tests/components/admin/FinalizeReentry.test.tsx` (the `CleanupAbandonedFinalizeButton`
   contracts in that file stay) and the now-unused import in
   `tests/components/admin/RescanSheetButton.test.tsx`.
3. Registries: delete `"RunFinalCASButton.tsx"` from `MIGRATED_FILES`
   (`tests/styles/accent-button-atom.test.ts:62`), covered by the same de-migration note Task 5
   extends.
4. Comments: `components/shared/AccentButton.tsx:8`, `tests/onboarding/finalize-cas.test.ts:513`,
   `tests/components/atoms/AccentButton.test.tsx:7` — each repoints to `FinalizeButton`, the live
   renderer of the per-row block (`components/admin/FinalizeButton.tsx:827`).
5. Class sweep, unscoped: `rg -n "RunFinalCASButton" --glob '!node_modules' --glob '!.next' .`
   must return only this plan, the spec, `BACKLOG.md` (graduating in Task 10), and
   `DEFERRED-archive.md` — the archive records what was true when its deferrals closed and is left
   alone.

**Verify:** `pnpm test -- tests/components/admin tests/styles tests/onboarding/finalize-cas.test.ts`
**Commit:** `chore(admin): retire RunFinalCASButton, superseded by FinalizeButton's finish mode`

## Task 7 — amend the `WrappedTile` allowlist row to its decided terminal state

**Failure mode it catches:** the next sweep reading a one-row ledger as unfinished work and
deleting a file three ratified contracts retain — which would orphan `TileErrorBoundary` and
`TileServerFallback` and take a registered `TILE_SERVER_RENDER_FAILED` producer with them.

1. Rewrite the row's `reason` (`tests/components/_orphanedComponents.ts:74-78`) from the sweep's
   observational note to the terminal state: retained by the ratified KEEP at
   `docs/superpowers/plans/crew/2026-06-15-crew-page-redesign-phase1/04-layout-migration-closeout.md:10`;
   dormancy relied on by
   `docs/superpowers/specs/alerts/2026-07-24-alert-autoresolve-tile-and-report-family.md:657` and
   pinned by `tests/crew/_metaTileProducerTopology.test.ts:169`; deletion cascades to two more
   files. Keep the `BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS` backlog id — the entry stays open.
2. Assert the ledger is now exactly one row, and that the row is `WrappedTile`, in
   `tests/components/_metaOrphanedComponents.test.ts`. **Failure mode:** a future deletion silently
   re-growing the ledger instead of emptying it, or this row being dropped without the cascade
   being handled.
3. Confirm the retention guards are still green:
   `tests/crew/_metaTileProducerTopology.test.ts`, `tests/migration/crew-redesign-cleanup.test.ts`.

**Verify:** `pnpm test -- tests/components/_metaOrphanedComponents.test.ts tests/crew/_metaTileProducerTopology.test.ts tests/migration/crew-redesign-cleanup.test.ts`
**Commit:** `chore(components): record WrappedTile's retention as a decided terminal state`

## Task 8 — correct the `capabilityTransitions` predicate quote + ship the anti-drift guard

**Failure mode it catches:** a comment block labelled "verbatim branch logic"
(`lib/visibility/capabilityTransitions.ts:118`) quoting a predicate that gained a branch at
`e348c81ca` — a reader trusting the label reasons about entitlement from a two-branch predicate
that has been three-branch since 2026-07-16.

1. **RED first:** write `tests/visibility/capabilityHeaderParity.test.ts`. It reads the quoted
   predicate lines out of the `capabilityTransitions.ts` header block, reads the corresponding
   function bodies out of `lib/visibility/scopeTiles.ts`, and asserts the FLAG SET named in each
   quote equals the flag set the function references (plus `isAdmin` where the function takes it).
   It must FAIL on `financialsVisible` before the fix. **Anti-tautology:** the expected set is
   extracted from `scopeTiles.ts` source, never hardcoded in the test, so the test cannot pass by
   agreeing with a stale constant; and it asserts set EQUALITY, so a quote that omits a branch
   fails as loudly as one that invents a branch.
2. Correct the quote to `isAdmin || LEAD || FINANCIALS` and add the modeling-boundary sentence: the
   recorded deltas are definitive with respect to the five MODELED predicates
   (`lib/visibility/capabilityTransitions.ts:53`) only, and `FINANCIALS` is unmodeled.
3. Do NOT expand `CAPABILITY_TRANSITION_MATRIX` (spec §1 item 1). The gap is filed in Task 10.

**Verify:** `pnpm test -- tests/visibility` and `pnpm typecheck`
**Commit:** `fix(visibility): the header's verbatim predicate quote drifted; pin it against the source`

## Task 9 — correct master spec MI-9 + ship the capability-claim guard

**Failure mode it catches:** a contract table asserting a capability the code does not grant. A
reader planning auth work from MI-9 would believe a sheet edit can confer admin access; it cannot
(`supabase/migrations/20260514000000_admin_emails_runtime_mutable.sql:135-149`).

1. **RED first:** write `tests/docs/capabilityClaimProse.test.ts`, asserting the master spec's §6.8
   MI-9 row contains no claim that a `role_flags` element grants admin/ops access. Scope it to the
   MI-9 row rather than the whole file, so the §12.4 retired-row strikethrough at
   `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2865` (history, deliberately preserved)
   does not make it fail. **Anti-tautology:** the test must fail on the CURRENT text before the
   edit — run it RED and record the output.
2. Correct the clause: state that LEAD additionally unlocks the audio/video/lighting scope tiles
   (`lib/visibility/scopeTiles.ts:86`, `lib/visibility/scopeTiles.ts:97`,
   `lib/visibility/scopeTiles.ts:114`) and renders the crew-page "Lead" chip
   (`components/crew/sections/CrewSection.tsx:203`), and that neither capability flag grants admin
   access, naming `is_admin()`'s two arms. Record the provenance inline so the next reader does not
   re-derive it.
3. **Correct the second in-force instance in the SAME commit** (spec R1 MEDIUM):
   `lib/sync/phase2.ts:291` says a new crew member holding a capability flag "would grant
   ops/financial access silently". Drop the "ops" half — the financials half is true and the
   sentence's real justification (the `crew_added` change-log image carries no `role_flags`, so the
   grant would otherwise land unlogged) is unaffected. Widened sweep, re-run before the commit:
   `rg -n "ops access|ops/financial|grants? [^.]{0,40}admin" app components lib` must return zero
   hits afterwards.
4. **§12.4 lockstep check (must be performed, expected to be a no-op):** confirm the edit touches
   §6.8 only. If any §12.4 prose changed, `pnpm gen:spec-codes` + the matching `lib/messages/catalog.ts`
   row land in THIS commit (`tests/cross-cutting/codes.test.ts` blocks merge otherwise). Expected:
   no §12.4 change, no regen.

**Verify:** `pnpm test -- tests/docs tests/cross-cutting/codes.test.ts` and
`pnpm spec:lint docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`
**Commit:** `docs(spec): MI-9 no longer claims LEAD grants an admin surface`

## Task 10 — backlog graduation

**Failure mode it catches:** a queue that silently becomes a changelog (`BACKLOG.md:5`), and a
settled decision that reads as open work.

1. `BL-LEAD-CAPABILITY-PROSE-STALE` — move the whole entry to `BACKLOG-archive.md` at its terminal
   state, with both settlements recorded (which of the two possibilities each claim turned out to
   be, and the probe that established it).
2. `BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS` — AMEND in place: table reduced to the single
   retained row, the four dispositions recorded with their superseding commits, and an explicit
   "the remaining row is DECIDED, not undecided" note so a future sweep does not re-litigate it.
3. File `BL-CAPABILITY-MATRIX-FINANCIALS-PREDICATE` — the unmodeled `hasFinancials` predicate
   (spec §4.1). Documentary only (no production consumer:
   `CAPABILITY_TRANSITION_MATRIX`'s sole reader is `tests/visibility/capabilityTransitions.test.ts`),
   effort M (10 → 15 rows plus tests), trigger = the next milestone touching scope-tile visibility.
4. File `BL-BELLPANEL-DISMISS-COMMENT-DRIFT` — six comment lines in `components/admin/BellPanel.tsx`
   (from `components/admin/BellPanel.tsx:224`) call the trailing ghost control "Dismiss"; it renders
   `Confirm` / `Mark resolved`. Same class as this branch's subject, different shape, so filed
   rather than swept (spec §7). Effort S, no product question.
5. `BACKLOG.md:7` — new LEADING segment on `Last reconciled:` naming this branch and all three
   dispositions.
6. **Rebase conflict is EXPECTED** on `BACKLOG.md`: two sibling panes are graduating other rows
   from the same file concurrently. Resolve by keeping BOTH sides — the entries are disjoint and
   the reconciliation line concatenates. Do not drop a sibling's segment.

**Verify:** `pnpm test -- tests/docs/backlogClusterArchival.test.ts tests/docs/_metaLedgerReferentialIntegrity.test.ts tests/docs/_metaDeferralLedgerGraduation.test.ts`
**Commit:** `docs(backlog): graduate the LEAD-prose entry, amend the orphan entry, file the matrix gap`

## Task 11 — closeout + whole-diff adversarial review

1. Write §12 below with the invariant-8 marker, the impeccable disposition, and the findings
   ledger from every round.
2. Full local gate: `pnpm typecheck && pnpm lint && pnpm test`.
3. Whole-diff Codex review (fresh-eyes posture, REVIEWER ONLY, do-not-relitigate list from spec §1)
   to APPROVE.
4. Push, real CI green, `gh pr merge --merge`, fast-forward local `main` to `0  0`.

**Commit:** `docs(plan): close out the orphan-components + LEAD-prose cluster`

---

## 12. Close-out

impeccable-gate: N/A — no UI surface

**Reason (prose, because the marker grammar admits none):** every task is a deletion, a comment
repair, a test retarget, or markdown. Four components are deleted and nothing replaces them in any
tree; no mount is wired (spec §1 item 4); no rendered surface is added, removed, or restyled; no
`@theme` token block, `DESIGN.md`, or Tailwind config is touched. `/impeccable critique` and
`/impeccable audit` have no surface to evaluate. Had any of the five been remounted, the dual gate
would be mandatory and this disposition would not apply.

**Findings ledger:** filled in at close-out — one row per adversarial-review finding across the
spec, plan, and whole-diff rounds, each with its disposition (fixed / deferred with a `DEFERRED.md`
entry / refuted with evidence). Refuted diff-only claims are recorded here too, per the AGENTS.md
rule, so a later reviewer does not re-derive them.
