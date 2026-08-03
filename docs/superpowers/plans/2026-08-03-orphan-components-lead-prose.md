# Plan — orphaned components + the LEAD capability prose

**Spec:** `docs/superpowers/specs/2026-08-03-orphan-components-lead-prose-design.md` (canonical;
every decision below is settled there, with citations). **Branch:**
`chore/orphan-components-lead-prose` off `origin/main` @ `67074d4dc` (rebased 2026-08-03 from `369bfcce0`). **Implementer:** Opus /
Claude Code (`components/` is Opus-owned by the AGENTS.md routing hard rule). **Reviewer:** Codex,
adversarially, never as implementer.

Thirteen tasks, one commit each (invariant 6). **Every commit leaves the tree GREEN** — plan R1
BLOCKING-2 caught a draft that knowingly committed a red guard and left it red for nine tasks.

**TDD posture, stated precisely (plan R1 BLOCKING-1).** Invariant 1 wants the test that exercises a
change to precede it. Most of this branch REMOVES code rather than adding behavior, so "write a
failing test for a deletion" has two honest forms and one dishonest one:

- **Contract-first (Tasks 2, 9, 10, 11):** the assertion is new and fails against current content.
  Ordinary RED → GREEN. Task 9's assertion fails against the existing observational reason string.
- **Mutation-proof (Tasks 3, 4):** the code under test is already correct, so a RED cannot come from
  the test alone. The proof of non-vacuity is a MUTATION: break the live behavior, watch the
  retargeted suite fail, revert, record both outputs in the commit message. This is stronger than a
  RED-by-missing-selector, which proves only that a selector was stale.
- **Rejected as dishonest:** calling a stale-selector failure a RED (the draft's Task 1, now
  Task 3), or a
  guard-fails-because-the-repo-is-dirty state a RED (the draft's Task 0, now Task 2). Neither
  exercises the contract.

A deletion task's own protection is the guard from Task 2 plus the existing suites; where a task
adds no new assertion, it says so plainly instead of inventing one.

---

## 0. Pre-draft verification pass (run 2026-08-03, before this body was written)

| Claim the plan relies on | Command | Result |
| --- | --- | --- |
| 5 orphans on current `main` | `orphanScan()` via `tsx`, re-confirmed after the rebase onto `67074d4dc` | 191 components, 5 orphans, identical to `ORPHAN_ALLOWLIST` |
| The guard's failure families | read `tests/components/_metaOrphanedComponents.test.ts:52-80` | (a) unlisted orphan, (b) row for a deleted file, (c) newly orphaned, (d) row for an imported file |
| `admin-alert-confirm-resolve-button` is dead | `rg -n "admin-alert-confirm-resolve-button" app components tests` | 6 hits, all in `ResolveAlertButton.tsx` + its own test |
| `WrappedTile` is the sole prod importer of two files | `rg -n "TileServerFallback\|TileErrorBoundary" app components lib` | `TileServerFallback` ← `WrappedTile` only; `TileErrorBoundary` ← `WrappedTile` only; `TileErrorFallback` ← `TileServerFallback` + `WrappedSection` (live) |
| The hero exposes every DOM hook the retargeted suites use | `rg -n "data-testid=\|data-stale\|data-prefers-reduced-motion" components/crew/RightNowHero.tsx` | all present at `components/crew/RightNowHero.tsx:467-528`; only the root testid differs |
| `admin/ops` census | `rg -n "admin/ops" --glob '!node_modules' .` | 12 files, dispositioned in spec §4.2 |
| The invariant-8 marker grammar | read `tests/docs/_invariant8Closeout.ts:45-49` | exactly `impeccable-gate: N/A — no UI surface` or the RAN form; no free-text reason on the marker line |
| `spec:lint` on the spec | `pnpm spec:lint <spec>` | 0 hard, 33 advisory |
| Ledger referential integrity | `pnpm vitest run tests/docs/_metaLedgerReferentialIntegrity.test.ts` | RED before Task 1 (two cited `BL-` ids defined nowhere), GREEN after. Plan R1 BLOCKING-3 |
| Invariant-8 marker placement | `pnpm vitest run tests/docs/_metaInvariant8Closeout.test.ts` | A template placeholder fails `§4.1.2`; a declaring unit with no marker fails `§4.1.1`. Therefore the marker lands in the sibling closeout file in the SAME commit as the gate run (§12) |
| Recovery-suite assertion count | `rg -n "expect\(" tests/components/RightNowCardRecovery.test.tsx \| rg "detail\(\)"` | **9** assertions, two of them negative — not 3 as the draft said. Plan R1 MEDIUM |
| `spec:lint` on THIS plan | `pnpm spec:lint <plan>` | 0 hard once the citations to files this plan CREATES are discounted — `CITATION_FILE_MISSING` is a git-tracked-path check (`lib/specLint/citations.ts:128`), so a plan naming a file it has not written yet always trips it. Four genuine malformed-citation findings were repaired; the residue is exactly the three new test files named in §0.1. `spec:lint` is not a CI gate (no workflow invokes it) |

## 0.1 Meta-test inventory (mandatory declaration)

- **EXTENDS** `tests/components/_metaOrphanedComponents.test.ts` — via its ledger
  (`tests/components/_orphanedComponents.ts`): five rows to one. No change to the guard's logic.
- **CREATES** `tests/docs/retiredIdentifierReferences.test.ts` (+ ledger `tests/docs/_retiredIdentifiers.ts`)
  — the R3 structural landing for the census/sweep-completeness vector (spec §5.0). Discovery is a
  `git ls-files` walk, so a reference nobody thought of fails by default.
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
`tests/e2e/right-now-transitions.spec.ts` are edited in their HEADER PROSE only (Task 5); their
assertions, fixtures, boot mechanism, and hydration gates are untouched.

---

## Task 1 — file the two backlog entries the spec and plan already cite (DONE — `28f974539`)

**Failure mode it catches:** a doc promising a ledger entry that does not exist.
`tests/docs/_metaLedgerReferentialIntegrity.test.ts` fails on any cited `BL-` id defined in no
ledger, and the spec/plan commits cited `BL-CAPABILITY-MATRIX-FINANCIALS-PREDICATE` and
`BL-BELLPANEL-DISMISS-COMMENT-DRIFT` before either existed — a red baseline, caught by plan R1
BLOCKING-3.

Both entries are filed in `BACKLOG.md` with the probes that established them. `tests/docs`: 9 files,
207 tests, green. Task 12 still owns GRADUATION (moving `BL-LEAD-CAPABILITY-PROSE-STALE` to the
archive and amending the other two entries); this task only makes the citations resolve.

**Verify:** `pnpm test -- tests/docs`
**Commit:** `docs(backlog): file the two entries the spec and plan already cite`

## Task 2 — the retired-identifier guard (ships GREEN, before any deletion)

**Failure mode it catches:** the one this branch kept re-learning. Three adversarial rounds each
found references a hand-curated census missed, every time because a different `--glob` scoping
decision silently reclassified a live reference as history: R1 missed two files that name a path as
a STRING inside a test helper; R2 missed a `test.describe` TITLE and a still-open backlog entry; R3
missed three ACTIVE `DEFERRED.md` tracking rows. Per the AGENTS.md same-vector rule and the
structural-defense calibration, the guard ships instead of a fourth curated list.

1. Create `tests/docs/retiredIdentifierReferences.test.ts` plus its ledger
   `tests/docs/_retiredIdentifiers.ts`:
   - `RETIRED_IDENTIFIERS`: `RightNowCard`, `PerShowCrewSection`, `PerShowCrewRow`,
     `ResolveAlertButton`, `RunFinalCASButton`.
   - `RETIRED_IDENTIFIER_EXEMPTIONS`: rows in the three shapes spec §5.0 defines — `archive`
     (whole file, only for end-to-end dated records), `line` (exact trimmed line text in a LIVE
     file), and `pending` (a live reference owned by `repairedBy`). **Never key an exemption by file
     when the file is live** (spec R4 BLOCKING): the v1 plan's `DEFERRED.md` holds both a live
     `RightNowCard` commitment and resolved history, so a file key is false in one direction
     whichever way it is written.
   - Discovery is a walk of `git ls-files` (never a curated file list), excluding the guard's own
     ledger. Any hit in a file with no matching row FAILS, naming file, line, and identifier.
2. **Derive the census mechanically, then commit GREEN.** Run the walker once with an empty
   allowlist and capture its output: that list IS the census, and it goes in the commit message as
   the mechanically-derived replacement for the spec §5 table. Then seed the allowlist so the guard
   is GREEN at commit time (plan R1 BLOCKING-2 — a knowingly-red commit is mid-sequence breakage,
   not TDD). Every row is one of two kinds, and the KIND is a field, not a comment:
   - `archive` — a path GLOB whose every match is a dated record end to end:
     `docs/superpowers/specs/**`, `docs/superpowers/plans/**`, `docs/audits/**`,
     `docs/superpowers/artifacts/**`, `BACKLOG-archive.md`, `DEFERRED-archive.md`. Globs, not files,
     because the census over `git ls-files` finds roughly forty matching documents under
     `docs/superpowers/**` alone and forty hand rows would be a curated list by another name.
     **Carve the CURRENT-STATE documents out of those globs** (spec §5.0's table): `BACKLOG.md`,
     every `DEFERRED.md` under `docs/superpowers/plans/**`, the master plan's `00-overview.md`
     (canonical amendments per `AGENTS.md` invariant 7, plus a file map that declares itself the
     source of truth), and the master plan's `ROUTING.md` and `HANDOFF-TEMPLATE.md`. They describe
     how things ARE, so a stale reference in one is a defect, not a record. The guard asserts every
     carved-out path EXISTS, so a rename cannot silently return a file to the archive glob.
   - `line` — one historical line inside a LIVE file, keyed by that line's exact trimmed text.
   - `pending` — a live reference, keyed the same way, owned by `repairedBy: "Task N"`.
     Tasks 5-8 delete their `pending` rows as they repair the references.
3. **Assert that `pending` is a transient state:** the guard fails if any `pending` row names a task
   number that no longer exists in this plan, and Task 13 asserts **zero** `pending` rows remain.
   Without that, "pending" would be an unbounded mute button — the exact failure the allowlist is
   supposed to prevent.
   **And assert every `line`/`pending` row still MATCHES something:** a row whose text matches no
   line in its file FAILS. Editing an exempted line invalidates its exemption instead of silently
   widening it (spec §5.0's fail-safe direction).
4. **RED first, against synthetic input (the honest form here).** Before the real ledger exists,
   write the two family proofs against a temp fixture directory, mirroring how
   `tests/components/_metaOrphanedComponents.test.ts` proves families (a)-(d) synthetically:
   (a) a file containing a retired identifier with NO row FAILS; (b) the same file with a matching
   `line` row PASSES; (c) a file with TWO occurrences where only one carries a `line` row still
   FAILS — the case a file-keyed allowlist cannot express, and the reason this design exists;
   (d) a `line` row whose text matches nothing FAILS (the fail-safe direction); (d2) a carved-out
   current-state path is NOT covered by an `archive` glob even when the glob would otherwise match
   it, and a carve-out path that does not exist FAILS; (e) **the terminal
   zero-`pending` assertion FAILS against a fixture ledger holding one `pending` row.** (e) is
   written HERE, where it can still fail, not at Task 13 where the real ledger is already empty —
   plan R2 BLOCKING-3. Both must fail before the walker is written. This proves the contract regardless of
   what the real tree happens to contain.
5. **Anti-vacuity:** assert the walk covers >100 tracked files and that every configured identifier
   was actually searched for (a typo'd identifier that matches nothing must fail, not pass).

**Verify:** `pnpm test -- tests/docs/retiredIdentifierReferences.test.ts` (GREEN), then
`pnpm typecheck`
**Commit:** `test(docs): walk the tree for retired-identifier references instead of curating a census`

## Task 3 — retarget the stale-tint recovery suite onto `RightNowHero`

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
   (`components/crew/RightNowHero.tsx:571-585`).

   **Exact inventory — NINE assertions, not three** (plan R1 MEDIUM; counted with
   `rg -n "expect\(" tests/components/RightNowCardRecovery.test.tsx | rg "detail\(\)"`):
   lines `150`, `172`, `203`, `204`, `231`, `252`, `253`, `272`, `283`. Two of them are NEGATIVE
   (`204`, `253`) and both are load-bearing — they are what makes reusing `lastGood` unable to pass.
   Each `detail()` helper becomes `showStat()` = `container.querySelector('[data-stat="Show"] dd')`.

   **The `Call: ` prefix does not survive the move.** The card rendered `Call: 14:00` as detail
   text; the hero's stat splits label from value, so the `dd` contains `14:00` alone. Every
   expectation drops the prefix, and the label is asserted SEPARATELY once per test
   (`[data-stat="Show"] dt` has text `Show`) so dropping the prefix does not weaken what is
   checked — the label assertion replaces the information the prefix carried.
   **Scope every extraction to the stat node**, never the whole hero, so the lead line
   ("Today: Show day 1 of 2") cannot satisfy a time assertion by accident.
4. Update the header block: keep the spec context, the driving strategy, and **all four
   anti-tautology guarantees**, changing the component name and the detail-vs-stat carrier. The
   guarantee that the recovery assertion uses a callTime absent from `lastGood` (15:30 vs 14:00) is
   the load-bearing one, and it SURVIVES the move: the suite's `makeContext` sets
   `showAnchors: []`, which is exactly the hero's legacy fallback to `ctx.callTime`
   (`components/crew/RightNowHero.tsx:158-161`), so the two values still render as different
   strings and a render-`lastGood` bug still cannot produce `15:30`. Note that fact in the header
   so the next reader does not "simplify" the fixture and silently defeat the pin.
5. **Prove non-vacuity by MUTATION, not by a stale selector** (plan R1 BLOCKING-1). The hero's
   unwind behavior is already correct, so no honest RED comes from the test alone. After the suite
   is green:
   (a) mutate `components/crew/RightNowHero.tsx` so the `morph-to-last-good` treatment is applied
       symmetrically — i.e. reintroduce the round-9 bug — and run the suite. It MUST fail, and the
       failing assertion must be one of the recovery ones (`203`/`204`'s successors), not a
       structural one.
   (b) `git checkout` the mutation and confirm green again.
   Both outputs go in the commit message. If the mutation does not turn the suite red, the retarget
   lost the regression and the task is not done — that is the ONLY acceptance criterion here.

**Divergence rule:** if a hero copy or markup difference makes an assertion inapplicable, do NOT
drop the assertion. Record the divergence in the closeout (§12) as a finding and adapt the
assertion to the hero's own rendered output, still derived from fixture inputs and never imported
from the production render helper.

**Verify:** `pnpm test -- tests/components/crew/rightNowHeroRecovery.test.tsx`
**Commit:** `test(crew): retarget the stale-tint unwind pins onto the live RightNowHero`

## Task 4 — retarget the reduced-motion-at-mount suite onto `RightNowHero`

**Failure mode it catches:** the Codex round-19 MEDIUM regressing in the live component — a
regression to an event-only read of the motion preference, where `data-prefers-reduced-motion`
never reflects the viewer's INITIAL `matchMedia` value and a reduced-motion viewer keeps animating
until a preference CHANGE that may never arrive.

**Scope, pinned at spec R2 so the closeout does not overclaim:** the suite uses Testing Library's
client-only `render()`. It proves nothing about SSR or hydration, and it cannot:
`usePrefersReducedMotion` returns `null` on the server and on the first hydrating render by design
(`lib/a11y/usePrefersReducedMotion.ts:16-21`), and the hero treats `null` as "animate at full
duration" (`components/crew/RightNowHero.tsx:337`). Write the header to say what it proves.

Same procedure as Task 3 against `tests/components/RightNowCardReducedMotionInitial.test.tsx` →
`tests/components/crew/rightNowHeroReducedMotionInitial.test.tsx`. The assertion reads
`data-prefers-reduced-motion` on the root, which the hero carries at
`components/crew/RightNowHero.tsx:470`, so the retarget here IS mechanically a root-testid swap
(unlike Task 3).

**That is exactly why it needs the mutation proof** (plan R1 BLOCKING-1 correctly observed this
task had no reachable RED): mutate `components/crew/RightNowHero.tsx` to read the preference from
an event-only source instead of the mount-time hook, run the suite, require RED; revert, require
green. Record both. Without that step this task proves only that two hooks have the same name.

**Verify:** `pnpm test -- tests/components/crew/rightNowHeroReducedMotionInitial.test.tsx`
**Commit:** `test(crew): retarget the reduced-motion-at-mount pin onto the live RightNowHero`

## Task 5 — retire `RightNowCard`

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
5. **Current-state documents (spec §5.0's carve-out table) — a stale reference in one is a defect:**
   `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/00-overview.md:363` lists
   `right-now/RightNowCard.tsx` in the file map that `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/00-overview.md:329`
   declares "the source of truth for where does X live". Repoint it to
   `components/crew/RightNowHero.tsx` (found at R7; the blanket plans glob would have swallowed it).
6. **Live tracking rows (spec §5.1) — these are commitments, not history:**
   `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md:83` names the card and the
   suite Task 3 renames (repoint both; the coverage GAP is unchanged, only its coordinates).
7. **Sweep is now the guard, not a grep:** re-run
   `pnpm test -- tests/docs/retiredIdentifierReferences.test.ts`. Every remaining `RightNowCard`
   hit must be either repaired or an allowlist row with a stated reason. Do not add an allowlist row
   for a file you simply did not want to edit — that is the exact move that cost three rounds. Every code/test hit is repaired in THIS
   commit, not one per review round.

**Verify:** `pnpm test -- tests/components/_metaOrphanedComponents.test.ts tests/components/crew`
then `pnpm typecheck`
**Commit:** `chore(crew-page): retire RightNowCard, superseded by RightNowHero`

## Task 6 — retire `PerShowCrewSection`

**Failure mode it catches:** a guard (`no-load-show-crew-with-auth`) that keeps two of its three
rows pointed at files nobody ships, so its green says less each release.

1. **RED first:** drop the allowlist row, confirm family (a) fails.
2. Delete `components/admin/PerShowCrewSection.tsx` and `tests/components/PerShowCrewSection.test.tsx`.
3. `tests/cross-cutting/no-load-show-crew-with-auth.test.ts:5-8` — remove the two rows for the
   deleted files. The surviving row (`app/admin/show/[slug]/page.tsx`) keeps the guard
   non-vacuous; state that in a comment so a later reader does not read the shrink as erosion.
4. `tests/help/forbidden-prose-registry.test.ts:80` — reword the reason to name the live surface.
   The registry's assertion is unchanged.
5. `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md:90` cites the deleted test as
   the non-equivalent admin-side coverage — reword (its absence STRENGTHENS the deferral).
6. Re-run the Task 2 guard; every `PerShowCrewSection` / `PerShowCrewRow` hit repaired or
   allowlisted with a reason.

**Verify:** `pnpm test -- tests/cross-cutting tests/help tests/components/_metaOrphanedComponents.test.ts`
**Commit:** `chore(admin): retire PerShowCrewSection, superseded by the modal's CrewBreakdown`

## Task 7 — retire `ResolveAlertButton`

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
5. Re-run the Task 2 guard; every `ResolveAlertButton` hit repaired or allowlisted with a reason.

**Verify:** `pnpm test -- tests/styles tests/components/RetryWatchButton.test.tsx tests/components/_metaOrphanedComponents.test.ts`
**Commit:** `chore(admin): retire ResolveAlertButton, superseded by the bell panel's resolve control`

## Task 8 — retire `RunFinalCASButton`

**Failure mode it catches:** three test files exercising a finalize path no operator can trigger,
which reads as finalize coverage and is not.

1. **RED first:** drop the allowlist row, confirm family (a) fails.
2. Delete `components/admin/RunFinalCASButton.tsx` and
   `tests/components/admin/RunFinalCASButton.test.tsx`; remove the `RunFinalCASButton` describe
   from `tests/components/admin/FinalizeReentry.test.tsx` (the `CleanupAbandonedFinalizeButton`
   contracts in that file stay) and the now-unused import in
   `tests/components/admin/RescanSheetButton.test.tsx`.
3. Registries: delete `"RunFinalCASButton.tsx"` from `MIGRATED_FILES`
   (`tests/styles/accent-button-atom.test.ts:62`), covered by the same de-migration note Task 7
   extends.
4. Comments: `components/shared/AccentButton.tsx:8`, `tests/onboarding/finalize-cas.test.ts:513`,
   `tests/components/atoms/AccentButton.test.tsx:7` — each repoints to `FinalizeButton`, the live
   renderer of the per-row block (`components/admin/FinalizeButton.tsx:827`).
5. `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md:636` names the component as a
   reopen TRIGGER — repoint the trigger to `components/admin/FinalizeButton.tsx`, the surviving
   finalize-cas UI.
6. Re-run the Task 2 guard; every `RunFinalCASButton` hit repaired or allowlisted. The two
   `BACKLOG.md` entries Task 12 handles and `DEFERRED-archive.md` — the archive records what was true when its deferrals closed and is left
   alone.

**Verify:** `pnpm test -- tests/components/admin tests/styles tests/onboarding/finalize-cas.test.ts`
**Commit:** `chore(admin): retire RunFinalCASButton, superseded by FinalizeButton's finish mode`

## Task 9 — amend the `WrappedTile` allowlist row to its decided terminal state

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
2. **Assert the REASON, not just the row count** (plan R1 BLOCKING-1: a bare one-row assertion is
   already true after Tasks 5-8 and exercises nothing). In
   `tests/components/_metaOrphanedComponents.test.ts`, assert that the sole surviving row is
   `components/shared/WrappedTile.tsx` AND that its `reason` names all three things a future sweep
   needs in order not to delete it: the ratified KEEP document, and both cascade dependents
   (`TileErrorBoundary`, `TileServerFallback`). Run it RED against the current observational reason
   ("Referenced only in sibling comments; also the sole hit of an all-importers probe"), which
   names none of them, then rewrite the reason to satisfy it.

   **Failure mode it catches:** the reason decaying back into an observation, so the next sweep
   reads a one-row ledger as unfinished work and deletes a file three ratified contracts retain.
3. Confirm the retention guards are still green:
   `tests/crew/_metaTileProducerTopology.test.ts`, `tests/migration/crew-redesign-cleanup.test.ts`.

**Verify:** `pnpm test -- tests/components/_metaOrphanedComponents.test.ts tests/crew/_metaTileProducerTopology.test.ts tests/migration/crew-redesign-cleanup.test.ts`
**Commit:** `chore(components): record WrappedTile's retention as a decided terminal state`

## Task 10 — correct the `capabilityTransitions` predicate quote + ship the anti-drift guard

**Failure mode it catches:** a comment block labelled "verbatim branch logic"
(`lib/visibility/capabilityTransitions.ts:118`) quoting a predicate that gained a branch at
`e348c81ca` — a reader trusting the label reasons about entitlement from a two-branch predicate
that has been three-branch since 2026-07-16.

1. **RED first:** write `tests/visibility/capabilityHeaderParity.test.ts`. It reads the quoted
   predicate lines out of the `capabilityTransitions.ts` header block, reads the corresponding
   function bodies out of `lib/visibility/scopeTiles.ts`, and asserts the FLAG SET named in each
   quote equals the flag set the function references (plus `isAdmin` where the function takes it).
   It must FAIL on `financialsVisible` before the fix.

   **Anti-vacuity, mandatory** (plan R1 HIGH-1): assert that **exactly four** quote/function pairs
   were discovered (`audioScopeVisible`, `videoScopeVisible`, `lightingScopeVisible`,
   `financialsVisible`) and that BOTH extractions returned non-empty text for each. Set equality
   alone passes vacuously if a quote line is later deleted or the header block is renamed — zero
   comparisons is a pass under `toEqual`. Add a synthetic proof that a header with a REMOVED quote
   line fails, so the guard cannot be silenced by deletion. **Anti-tautology:** the expected set is
   extracted from `scopeTiles.ts` source, never hardcoded in the test, so the test cannot pass by
   agreeing with a stale constant; and it asserts set EQUALITY, so a quote that omits a branch
   fails as loudly as one that invents a branch.
2. Correct the quote to `isAdmin || LEAD || FINANCIALS` and add the modeling-boundary sentence: the
   recorded deltas are definitive with respect to the five MODELED predicates
   (`lib/visibility/capabilityTransitions.ts:53`) only, and `FINANCIALS` is unmodeled.
3. Do NOT expand `CAPABILITY_TRANSITION_MATRIX` (spec §1 item 1). The gap is already filed as
   `BL-CAPABILITY-MATRIX-FINANCIALS-PREDICATE` (Task 1); Task 12 only amends it if this task changes
   what it says.

**Verify:** `pnpm test -- tests/visibility` and `pnpm typecheck`
**Commit:** `fix(visibility): the header's verbatim predicate quote drifted; pin it against the source`

## Task 11 — correct master spec MI-9 + ship the capability-claim guard

**Failure mode it catches:** a contract table asserting a capability the code does not grant. A
reader planning auth work from MI-9 would believe a sheet edit can confer admin access; it cannot
(`supabase/migrations/20260514000000_admin_emails_runtime_mutable.sql:135-149`).

1. **RED first:** write `tests/docs/capabilityClaimProse.test.ts`. It asserts that **no capability
   over-grant claim exists in either place this branch found one** — plan R4 HIGH caught the draft
   scoping it to the master-spec row alone, which left `lib/sync/phase2.ts` free to regress with the
   guard still green, an escaping mutant against the exact sibling occurrence repaired in the same
   commit. Two scan targets, one recognizer:
   - **The master spec's §6.8 MI-9 row.** Scoped to the row rather than the whole file, so the §12.4
     retired-row strikethrough at
     `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:2865` (history, deliberately preserved)
     does not make it fail.
   - **Production source** — every `.ts`/`.tsx` under `app/`, `components/`, and `lib/`, comments
     included, since `lib/sync/phase2.ts:291` was a comment. `lib/parser/typoVocabRegistry.ts:55`
     must NOT match: it says "ops/financials field-alias fuzzy fallback", which names a field-alias
     family and asserts nothing about entitlement. It is the recognizer's hardest negative fixture,
     so it is one of the required fixtures below. **Anti-tautology:** the test must fail on the CURRENT text before the
   edit — run it RED and record the output.

   **Anti-vacuity, mandatory** (plan R1 HIGH-2): assert that **exactly one** MI-9 row was located
   and that its extracted text is non-empty and longer than 200 characters. If the row is ever
   deleted or its heading drifts, extraction returns empty and a naive ban passes on nothing.

   **Recognizer shape, specified rather than left to implementation** (plan R1 HIGH-2 again). The
   corrected row deliberately CONTAINS the words "admin" and "grants" — it says neither capability
   flag grants admin access and names `is_admin()`. So a raw admin/grant ban cannot go green. The
   recognizer is a POSITIVE-claim matcher: it fails on a sentence where a capability subject
   (`LEAD`, `FINANCIALS`, `role_flags`, "capability role") is the grammatical subject of a granting
   verb (`grants`, `unlocks`, `confers`, `gives access to`) whose object names an admin/ops surface
   (`admin`, `admin/ops`, `ops surface`, `admin surface`) — with a NEGATION guard so "neither … grants
   … admin access" and "never grants" do not match. Fixture-test the recognizer against SIX
   strings in the test file itself — four from the spec side: the pre-edit MI-9 text (must match),
   the post-edit MI-9 text (must not), "LEAD additionally grants the admin/ops surface" (must
   match), "LEAD does not grant admin access" (must not); and two from the production side, which
   plan R4 HIGH showed the draft had no coverage for at all: `lib/sync/phase2.ts:291`'s pre-edit
   text (must match) and `lib/parser/typoVocabRegistry.ts:55` (must NOT — it names a field-alias
   family, not an entitlement, and is the recognizer's hardest negative). Those six fixtures are
   what make the recognizer reviewable instead of a regex nobody can audit.

   **Anti-vacuity for the source scan:** assert it walked >100 files, so a broken glob cannot pass
   by scanning nothing.
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
   `rg -n "ops access|ops/financial|grants? [^.]{0,40}admin" app components lib` must afterwards
   return exactly ONE hit — `lib/parser/typoVocabRegistry.ts:55`, unrelated parser-vocabulary prose
   that asserts nothing about entitlement and is deliberately untouched (spec §4.2, corrected at
   R3). "Zero hits" is the wrong post-condition and no correct edit can reach it.
4. **§12.4 lockstep check (must be performed, expected to be a no-op):** confirm the edit touches
   §6.8 only. If any §12.4 prose changed, `pnpm gen:spec-codes` + the matching `lib/messages/catalog.ts`
   row land in THIS commit (`tests/cross-cutting/codes.test.ts` blocks merge otherwise). Expected:
   no §12.4 change, no regen.

**Verify:** `pnpm test -- tests/docs tests/cross-cutting/codes.test.ts` and
`pnpm spec:lint docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`
**Commit:** `docs(spec): MI-9 no longer claims LEAD grants an admin surface`

## Task 12 — backlog graduation

**Failure mode it catches:** a queue that silently becomes a changelog (`BACKLOG.md:5`), and a
settled decision that reads as open work.

0. **Clear both entries' `Status: IN PROGRESS · Branch:` flight fields** (invariant 12). The
   graduating entry takes its marker to the archive by construction; the amended entry must have
   the field REMOVED, or `tests/docs/_metaLedgerInProgress.test.ts` will claim work is in flight on
   a merged branch.
1. `BL-LEAD-CAPABILITY-PROSE-STALE` — move the whole entry to `BACKLOG-archive.md` at its terminal
   state, with both settlements recorded (which of the two possibilities each claim turned out to
   be, and the probe that established it).
2. `BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS` — AMEND in place: table reduced to the single
   retained row, the four dispositions recorded with their superseding commits, and an explicit
   "the remaining row is DECIDED, not undecided" note so a future sweep does not re-litigate it.
3. **`BL-CAPABILITY-MATRIX-FINANCIALS-PREDICATE` is ALREADY FILED (Task 1) — do not re-file it**
   (plan R2 HIGH-1 caught the duplicate). Verify only that its text still matches what Tasks 10 and
   11 shipped; amend it if the header-parity guard changed what the entry can assume.
4. **Amend `BL-ACCENT-BUTTON-ATOM-SWEEP` (`BACKLOG.md:1192`, description at `BACKLOG.md:1198`) — it does NOT graduate here.** Its
   description names `ResolveAlertButton ×2` and `RunFinalCASButton` among the 8 migrated call
   sites; two of those are retired by Tasks 7 and 8. Record that in the entry so its census stays
   true, and leave the entry open (spec R2). This is the one `BACKLOG.md` hit the sweep must NOT
   treat as graduating with this branch.
5. **`BL-BELLPANEL-DISMISS-COMMENT-DRIFT` is ALSO ALREADY FILED (Task 1) — do not re-file it.**
   Same R2 HIGH-1 duplicate. Verify its text only.
6. **Maintain the guard ledger in THIS commit** (plan R3 BLOCKING-1). Task 12 rewrites
   `BACKLOG.md` lines that Task 2's ledger exempts by exact text: the four orphan-table rows and the
   accent-sweep description. Every `line`/`pending` row whose text this task changes must be updated
   or deleted in the same commit — an unmatched row FAILS by design — and
   `pnpm test -- tests/docs/retiredIdentifierReferences.test.ts` must be GREEN before committing.
   This is the general rule, not a one-off: any task that edits an exempted line owns its row.
7. `BACKLOG.md:7` — new LEADING segment on `Last reconciled:` naming this branch and all three
   dispositions.
8. **Rebase conflict is EXPECTED** on `BACKLOG.md`: two sibling panes are graduating other rows
   from the same file concurrently. Resolve by keeping BOTH sides — the entries are disjoint and
   the reconciliation line concatenates. Do not drop a sibling's segment.

**Verify:** `pnpm test -- tests/docs` (the whole directory — it covers the graduation, referential-integrity, in-flight, and retired-identifier guards, all of which this task can move)
**Commit:** `docs(backlog): graduate the LEAD-prose entry, amend the orphan and accent-sweep entries`

## Task 13 — closeout, UI gate, and whole-diff adversarial review

1. **The zero-`pending` assertion is written in Task 2 and PROVEN there, not here** (plan R2
   BLOCKING-3: an assertion first written at closeout, after Tasks 5-8 already emptied the ledger,
   starts green and exercises nothing). Task 2 ships it with a synthetic proof — a fixture ledger
   containing one `pending` row must FAIL the terminal assertion — so its contract is established
   while it can still fail. Here it is only RUN, against the real ledger, and its green is the
   mechanical statement that the census reached zero live references.
2. **Run both halves of the invariant-8 UI gate** on the finished diff, with the canonical v3 setup
   gates (`context.mjs` context load of `PRODUCT.md` + `DESIGN.md`, then the register reference
   read). This branch DOES touch UI surfaces by the letter of `AGENTS.md` invariant 8 — see §12.
   P0/P1 findings are fixed, or deferred with a `DEFERRED.md` entry.
3. Write the closeout file's findings ledger: one row per adversarial finding across EVERY round
   this branch ran (spec R1-R4 and the joint spec R5 / plan R2 round, the plan rounds, and the
   whole-diff round — the count is whatever it ends at, not a frozen list), each with its disposition. Refuted diff-only claims are
   recorded too, per the AGENTS.md rule.
4. Full local gate: `pnpm typecheck && pnpm lint && pnpm test`.
5. Whole-diff Codex review (fresh-eyes posture, REVIEWER ONLY, do-not-relitigate list from spec §1)
   to APPROVE.
6. **Re-arm the mechanical requirement, and verify it** (plan R2 BLOCKING-1). Writing "both halves"
   instead of the literal command names made this plan a NON-declaring unit, so nothing forced the
   marker to exist — the reviewer probed `declaresGate()` and got `false`. The closeout file created
   in step 3 therefore carries BOTH literal command names AND the filled marker, and
   `partitionUnits` folds a stem-matching `-closeout.md` into its plan's unit
   (`tests/docs/_invariant8Closeout.ts:67-85`), so the unit then declares AND conforms. Verify both
   mechanically before committing: `declaresGate(unit)` is `true` and the unit's verdict is
   `conforms`. A green that comes from not declaring is the vacuous pass this branch has now been
   charged with twice.
7. Push, real CI green, `gh pr merge --merge`, fast-forward local `main` to `0  0`.

**Commit:** `docs(plan): close out the orphan-components + LEAD-prose cluster`

---

## 12. Close-out

**Where the marker lives.** The machine-checkable marker line is written into a stem-named sibling
closeout file, `docs/superpowers/plans/2026-08-03-orphan-components-lead-prose-closeout.md`, created
by Task 13 **in the same commit as the gate run** — the style `AGENTS.md` invariant 8 allows for flat
plans. It is deliberately NOT in this file today: `tests/docs/_metaInvariant8Closeout.test.ts` accepts
only a filled `RAN` form or the `N/A` form, and both would be false right now. A marker is a claim,
and the claim becomes true the moment the gate runs, not before. (Verified empirically: a template
placeholder here fails `§4.1.2 no malformed marker line`, and a declaring unit with no marker fails
`§4.1.1` — so the marker and the gate run must land together, which is the point of the rule.)

**The disposition is RAN, not `N/A`.** The draft claimed
`N/A — no UI surface` and, three lines later, that `DESIGN.md` is not touched. Plan R1 BLOCKING-4
caught both halves: Task 5 edits `DESIGN.md:216` and several files under `components/**`, and
`AGENTS.md` invariant 8 defines EITHER as a UI surface. The contradiction was mine, introduced when
spec R1 added `DESIGN.md` to the collateral inventory, and the honest resolution is to run the gate
rather than to argue the definition.

**What the gate will find, stated in advance so the run is a check and not a discovery:** no
rendered output changes on this branch. Every edit inside a UI-surface file is a comment or prose
line, except whole-file deletions of components with no call site. Task 13 records that claim
MECHANICALLY, with the exception enumerated rather than hand-waved (plan R3 HIGH): run
`git diff origin/main -- 'app/**' 'components/**' DESIGN.md app/globals.css` and classify every
changed line into exactly one of three buckets — (a) a comment line in a code file, (b) a line
inside a wholly deleted file, (c) **the `DESIGN.md` prose line Task 5 repoints**
(`DESIGN.md:216`), which is Markdown, not a comment, and is the ONE rendered-document line this
branch edits. Any line that falls in none of the three buckets is a rendered-output change and the
"no rendered change" claim is withdrawn. The draft's "must be empty" condition was unsatisfiable by
a correct implementation, which is worse than no condition: it would have been quietly ignored.
The gate's own findings go in the ledger either way. If the gate surfaces a P0/P1 anyway, it is fixed or deferred with a `DEFERRED.md`
entry; "we expected nothing" is not a disposition.

**Findings ledger:** filled in at close-out — one row per adversarial-review finding across the
spec, plan, and whole-diff rounds, each with its disposition (fixed / deferred with a `DEFERRED.md`
entry / refuted with evidence). Refuted diff-only claims are recorded here too, per the AGENTS.md
rule, so a later reviewer does not re-derive them.
