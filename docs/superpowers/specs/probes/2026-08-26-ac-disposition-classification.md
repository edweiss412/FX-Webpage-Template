# Unclaimed-AC disposition classification — probe record, 2026-08-26

**Question.** For every flagged (plan, id) pair, does the plan's OWN prose settle
the disposition, and which one? Spec §4.2 constraint 1 permits a migration edit to
state only what the plan already says, so this classification is the gate on the
migration rather than a convenience.

**Method.** Every pair from the probe's `=== UNCLAIMED detail ===` section, read
against its plan, with the sentence that settles it quoted. Four outcomes:
RETIRED, DISCHARGED, UNSETTLED (a task does the work but no sentence writes the id
beside it), FOREIGN-ID (not this plan's criterion at all).

**Result, over the v2 grammar's 40 pairs across 25 plans:**


## Resolved scope — do not relitigate

- The table below is a TRANSCRIPT. It quotes other plans verbatim, em dashes
  and all, and is fenced so the copy and citation arms do not read another
  document's prose as this one's. Correcting a quotation would destroy the
  evidence it exists to carry.
- The classification is per (plan, id) against that plan's OWN words. A pair
  with no settling sentence is UNSETTLED, and stays so.

## Classification

```text
| category | count |
| --- | --- |
| DISCHARGED | 28 |
| UNSETTLED | 7 |
| FOREIGN-ID | 4 |
| RETIRED | 1 |

**No pair was "real drift"** — a criterion nobody scheduled. That measurement is
what resolves the constraint contradiction in spec §4.2 (R2 finding 4).

**The FOREIGN-ID group became a grammar repair, not a migration.** All four were
SECONDARY ids on a declaring line, so v3 dropping secondary collection removes the
class outright and the migration set falls to 19 plans / 33 ids. The rows are kept
below because they are the evidence for that repair.

**Two rows where the obvious disposition would be false**, carried into the
migration verbatim: `2026-08-16-server-action-origin-sweep.md` AC-8 (the plan says
AC-8 has no task, being a spec-time derivation re-exercised by Task 5 — quote that
clause, not a bare discharge), and `2026-08-22-mutation-score-jurisdiction-gap.md`
AC-8 (discharged by a task the plan marks RETIRED — the TASK is retired, not the
criterion).

**Feeds** `../../plans/ci/2026-08-26-speclint-dispatch-gates.md` Task 11 and
`../2026-08-26-speclint-dispatch-gates-design.md` §4.4.

---

All paths relative to the worktree root `/Users/ericweiss/FX-worktrees/speclintgates`.

Rule applied strictly: a disposition is recorded only where the plan's own prose names the id and states the task/step/procedure that owns it, or states it was retired. Where the plan does the work but never writes the id beside the task, the row is UNSETTLED and the near-miss is named.

| plan | id | disposition | evidence file:line | quoted sentence (relevant clause) |
| --- | --- | --- | --- | --- |
| docs/superpowers/plans/2026-08-15-diagram-demote-notice/plan.md | AC-2b | DISCHARGED (Task C1) | plan.md:66 (heading `### Task C1 — chip state + render + timer (TDD)` at :51) | "6. Close-begin clear, ALL THREE initiators (AC-2b, spec §2.1 clear 3; plan R1 F2): Escape, backdrop click, and the Close button each…" (also :67 "Exit-window repopulation blocked (AC-2b, spec R3 F1)" and :68 "Second-failure clear (AC-2b, spec §2.1 clear 4)") |
| docs/superpowers/plans/2026-08-07-ops-log-code-emits.md | AC-6 | DISCHARGED (Close-out step) | :317 (heading `## Close-out step — archive the ledger entries and clear the markers` at :311); declared :61 | `"The reviewer of the final diff confirms AC-6 by reading it." — and the declaration itself points there: "Verified by inspection of the final diff, not by a test — see the close-out step for why no executable gate discriminates it."` |
| docs/superpowers/plans/2026-08-17-rowactions-submenu-reveal-scroll-clamp.md | AC-5 | DISCHARGED (Task 6) | :351 (heading `## Task 6 — acceptance, closeout commit, review of the merging diff, merge` at :347) | "1. **CI acceptance instrument (AC-5):** push, then nine fixed-sha dispatches of `admin-layout-e2e` via the distinct-ref method…" |
| docs/superpowers/plans/2026-08-17-rowactions-submenu-reveal-scroll-clamp.md | AC-6 | DISCHARGED (Task 6) | :352 (same Task 6 heading at :347) | "2. **Ledger closeout commit (AC-6) — the PR's last commit:** graduate both entries to `BACKLOG-archive.md` per spec §7…" |
| docs/superpowers/plans/2026-08-17-speclint-prose-consistency-arms.md | AC-6 | DISCHARGED (Task 7) | :165 (task heading), corroborated :175 | `"### Task 7 (docs consumption edit, outside the checked task region — AC-6)" / ":175 … AC-6 (Task 7, outside the region, grep-verified)"` |
| docs/superpowers/plans/2026-08-19-premisescan-nested-hook-sibling-leak.md | AC-12b | FOREIGN-ID | :21 and :147; id belongs to `docs/superpowers/specs/ci/2026-08-16-premisescan-import-edge-fidelity-design.md:676` | `"- **AC-3** — the two existing AC-12b foils stay green, byte-unchanged. Task 2 Step 4." — AC-12b appears only as the NAME of two pre-existing fixtures, inside AC-3's body; this plan declares no AC-12b of its own` |
| docs/superpowers/plans/2026-08-19-premisescan-nested-hook-sibling-leak.md | AC-7 | DISCHARGED (Task 5) | :25 (task heading `## Task 5: the guard still pins what it claims` at :254) | `"- **AC-7** — the source-mutation gate still passes with an empty unaccepted-survivor set. Task 5."` |
| docs/superpowers/plans/ci/2026-08-24-mutation-scratch-fs-event-storm.md | AC-1 | **UNSETTLED** | searched: all whole-id `AC-1` hits are :68 and :84 only — both restatements, neither names a task. Nearest candidate `## Task 3 — verdict neutrality, and the churn re-measure (verification, deliberately outside the task region)` (:144) matches AC-1's wording but never writes the id | `declaration :84 "- **AC-1** — verdict neutrality across all EIGHT surfaces whose deciding suites this plan edits, compared as sets." / :68 "AC-1's before/after verdict equality is what stands in for a score here" — no sentence assigns it to a task, step, or procedure` |
| docs/superpowers/plans/ci/2026-08-24-mutation-scratch-fs-event-storm.md | AC-3 | DISCHARGED (Task 2) | :138 (heading `## Task 2 — the single-slot admission class` at :113) | "- **AC-3** at `FX_HEAVY_SLOTS=2`, one class holder plus two ordinary acquirers: at most two run at once." |
| docs/superpowers/plans/ci/2026-08-24-mutation-scratch-fs-event-storm.md | AC-6 | RETIRED | :93 and :165 | `":93 — '**AC-6** — RETIRED with the deferred tier: cleanup does not reduce roots created and strictly increases calls.' / :165 — '**AC-6 is RETIRED with the deferred tier, and the reason is arithmetic rather than tidying.**'"` |
| docs/superpowers/plans/ci/2026-08-15-changes-feed-modal-batch-flake.md | AC-5 | DISCHARGED (Task 5) | :487 (heading `### Task 5: Pre-push gates, PR, five-green loop (closeout)` at :483) | "- [ ] **AC-5:** five consecutive green `pull_request` runs of `app-e2e.yml` with the spec wired in…" |
| docs/superpowers/plans/ci/2026-08-21-shell-attached-redirection-target.md | AC-7 | DISCHARGED (Step 4) | :701 (AC→task map, heading `## 3. Acceptance criteria → task map` at :689); corroborated :631 under `## Step 4 (OUTSIDE the red-contract region) — re-derive the registry, then score` (:622) | `":701 — '\` | AC-7 \| score at or above floor, empty unaccepted set \| Step 4 \|'" |
| docs/superpowers/plans/2026-08-09-help-report-surface.md | AC-11.11 | FOREIGN-ID | :61, :372; id belongs to `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-12-user-facing-docs-design.md:709` | `":61 — '- **AC-6** — master spec carries §13.1 surface 5 + §13.2.1 note; AC-11.11 carries r12.' / :372 — 'Modify: …2026-05-12-user-facing-docs-design.md (AC-11.11 row :709)'. This plan declares AC-6; AC-11.11 is the foreign row it edits` |
| docs/superpowers/plans/2026-08-20-shell-lexer-quoted-value-recall.md | AC-6 | DISCHARGED (Task 6) | :75 (table `\| id \| criterion \| task \| channel \|` under `## Acceptance criteria this plan discharges` at :63); corroborated :362 | `":75 — '\` | AC-6 \| Mutation score holds with an EMPTY unaccepted-survivor set \| 6 \| scoped `pnpm heavy` gate run, counts pasted into close-out \|'" (task column = 6; `## Task 6: re-derive the mutation ledger, then score` at :328) |
| docs/superpowers/plans/2026-08-22-mutation-score-jurisdiction-gap.md | AC-7 | DISCHARGED (Closeout step 5) | :395 (heading `## 5. Closeout: gates, the freeze diff, …` at :389) | "5. **The freeze diff (AC-7), run after Task 4 and again on the final head:** `test -z \"$(git diff --name-only origin/main...HEAD -- …)\"` exits 0." |
| docs/superpowers/plans/2026-08-22-mutation-score-jurisdiction-gap.md | AC-8 | `DISCHARGED (Task 3, retired — landed on the spec branch)` | :387 (heading `### Task 3 (retired): the index row` at :385); declared :118 | `":387 — 'AC-8 is satisfied before implementation starts; nothing for the implementation pane to do. No marker: there is no red left to observe.' / :118 — '- **AC-8** the ci specs README carries the index row (landed on the spec branch; Task 3 retired).'"` |
| docs/superpowers/plans/2026-08-15-round-economy-enforcement-pair/plan.md | AC-B6 | **UNSETTLED** | searched: whole-id `AC-B6` occurs once in the whole plan unit (plan.md:22; `closeout.md` has zero hits). Nearest candidate `## Task 4 (procedural — no TDD marker): enrol `filing.ts` in the source-mutation registry` (:76) matches the content but never writes the id | ":22 — '- **AC-B6** — `lib/reviewRounds/filing.ts` is enrolled in `tests/mutation/source/registry.ts` and `pnpm mutation:guards` is green with any accepted rows dispositioned.' — no task/step sentence names it" |
| docs/superpowers/plans/2026-08-15-round-economy-enforcement-pair/plan.md | AC-C1 | **UNSETTLED** | searched: one hit in the plan unit (plan.md:23). Nearest candidate `## Task 5 (procedural): backfill dispositions` (:80) matches the content but never writes the id | ":23 — '- **AC-C1** — the six §4 candidates are dispositioned: five `BL-` rows filed at the ledger bar, one decline recorded (candidate 2, covered by the spec-registration detector).'" |
| docs/superpowers/plans/2026-08-15-round-economy-enforcement-pair/plan.md | AC-D1 | **UNSETTLED** | searched: one hit in the plan unit (plan.md:24). Nearest candidate `## Task 6 (procedural): docs fan-out` (:84) matches the content but never writes the id | ":24 — '- **AC-D1** — docs fan-out landed: AGENTS.md bullet, codex-guard spec cross-reference, `docs/review-rounds/README.md` contract.'" |
| docs/superpowers/plans/2026-08-09-watch-promotion-activation-race-fix.md | AC-6.18 | FOREIGN-ID | :32, :51; id belongs to the master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3863` | `":32 — '- **AC-7** (spec §4): docs full close — AC-6.18 absolute, coverage.md row, code comments…' / :51 — '\` | `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3863` (AC-6.18) \| restore absolute + dated closure note citing the fix spec \|'. This plan declares AC-7; AC-6.18 is the master-spec row it rewrites |
| docs/superpowers/plans/2026-08-15-auth-picker-hardening.md | AC-7 | DISCHARGED (Backlog-reconciliation procedure, Closeout step 5) | :570 (heading `## Backlog reconciliation (not a TDD task — split across plan-time and closeout)` at :565); declared :44 | `":570 — '**Archived at CLOSEOUT (implementation arc, the PR's LAST commit — see Closeout step 5):** … This is the sole post-review commit and contains only invariant-12-mandated ledger-status changes (AC-7).' (:567 — 'There is deliberately no \"Task 5\": backlog reconciliation has no production RED')"` |
| docs/superpowers/plans/2026-08-21-premisescan-hook-attachment.md | AC-8 | DISCHARGED (Task 4) | :69 (AC→task table under `## 0.05 Acceptance criteria this plan discharges` at :54) | "\| **AC-8** \| `EXPECTED_ENV_TOUCHING` is unchanged, proved by a field check on the committed diff \| Task 4 \|" |
| docs/superpowers/plans/2026-08-21-premisescan-hook-attachment.md | AC-9 | DISCHARGED (Task 4) | :70 (same table) | "\| **AC-9** \| the probe record's zeros still hold at HEAD \| Task 4 \|" |
| docs/superpowers/plans/2026-08-21-premisescan-hook-attachment.md | AC-10 | DISCHARGED (Tasks 4a and 4b) | :71 (same table); corroborated :614 | "\| **AC-10** \| the mutation score is measured at HEAD with an empty unaccepted-survivor set, at or above `scoreFloor` \| `Tasks 4a and 4b — 4a re-keys and RE-VALIDATES the accepted survivors…; 4b supplies the provenance pair as an executable command \` |" |
| docs/superpowers/plans/2026-08-22-workflow-run-scalar-yaml-decode.md | AC-8 | DISCHARGED (Close-out gates) | :352 (table under `## Close-out gates (deliberately OUTSIDE the declared task region)` at :329); corroborated by the subsection heading :355 | `":352 — '\` | AC-8 `node docs/superpowers/specs/ci/probes/2026-08-22-seam-check.mjs` \| this arc's diff \| **RUN. …the third is proved against a deletion and against the outer walk.** \| `' / :355 — '### AC-8: three denylists, then an allowlist'"` |
| docs/superpowers/plans/2026-08-16-server-action-origin-sweep.md | AC-8 | `DISCHARGED (Task 5) — BORDERLINE: the plan says "no task" in the same clause` | :341 (heading `## Self-review checklist (author, pre-adversarial)` at :338); declared :45 | `"- [ ] **Every AC has a task:** … AC-8 → no task (a spec-time derivation, re-exercised by Task 5 hitting the exemption path against real code); AC-9 → …" — the only task named for AC-8 is Task 5, but the clause opens with "no task". Disposition text should quote the plan verbatim rather than assert a plain discharge` |
| docs/superpowers/plans/2026-08-21-control-outline-forward-guard.md | AC-10 | DISCHARGED (closeout block, line 1) | :378 (table under `## Acceptance criteria, each with its producing step and channel` at :365); corroborated :326 | `":378 — '\` | AC-10 no UI surface \| closeout block line 1 \| exit code \|' / :326 — '# AC-10: no UI surface in the diff (run against origin/main, not HEAD, on every commit)' inside `## Closeout block`" |
| docs/superpowers/plans/2026-08-10-help-tour-hydration-fix.md | AC-4 | **UNSETTLED** | searched: whole-id `AC-4` occurs once in the plan (:75, the declaration). Nearest candidate is Task 2's step 5 (:37, under `## Task 2 — CI promotion wiring` at :27) which rewrites the workflow header, but never writes the id | ":75 — '- AC-4: no stale blocker comment or contradicting cardinality in the workflow header.' / :37 — '5. Header comments: rewrite `app-e2e.yml:7` and `app-e2e.yml:34` (blocker gone), and the `app-e2e.yml:2` seven-spec synopsis → eight.' (no id)" |
| docs/superpowers/plans/2026-08-17-shell-binding-mixed-quoted-value.md | AC-8 | **UNSETTLED** | searched: whole-id `AC-8` occurs once in the plan (:1048, the declaration under `## Acceptance criteria (from spec §4)` at :1030). Nearest candidate `### Task 4: Documented limits, here-string peer ledger row` (:761) matches the content but never writes the id | `":1048 — '- **AC-8:** the documented-limits describe declares the here-string/alias/positional/quoted-expansion-operand misses with premises, and both peer ledger rows … are filed with probe evidence.'"` |
| docs/superpowers/plans/2026-08-21-app-e2e-batch2.md | AC-3 | DISCHARGED (Task 10) | :28; corroborated :207 | ":28 — '- AC-3 (five consecutive green `pull_request` runs at `--retries=0`) — Task 10.' / :207 — '## Task 10: five-green loop and the ceiling (AC-3, AC-4, AC-7; CI evidence)'" |
| docs/superpowers/plans/2026-08-21-app-e2e-batch2.md | AC-4 | DISCHARGED (Task 10's procedure) | :29; corroborated :207 | `":29 — '- AC-4 (fallback: a member that cannot clear AC-3 leaves, row restored with the run ids) — Task 10's procedure.'"` |
| docs/superpowers/plans/2026-08-21-app-e2e-batch2.md | AC-6 | DISCHARGED (Task 12) | :31; corroborated :243 | `":31 — '- AC-6 (real CI green, sha-keyed, both vocabularies) — Task 12.' / :243 — '## Task 12: whole-diff review, CI, merge, teardown (AC-6)'"` |
| docs/superpowers/plans/2026-08-21-app-e2e-batch2.md | AC-7 | DISCHARGED (Task 10) | :32; corroborated :207, :211 | `":32 — '- AC-7 (ceiling measured, formula applied, recorded) — Task 10.' / :211 — '- [ ] **Ceiling (AC-7).** From run 1 of the loop: …'"` |
| docs/superpowers/plans/2026-08-21-app-e2e-batch2.md | AC-8 | DISCHARGED (Task 11) | :33; corroborated :215, :220 | ":33 — '- AC-8 (census restated by command, `UNSEEN = 23 - members - 7` = 2, custom-reason 10, total `51 - members` = 37) — Task 11.' / :215 — '## Task 11: ledger closeout, census, docs (AC-8, AC-9) — BEFORE whole-diff review'" |
| docs/superpowers/plans/2026-08-21-app-e2e-batch2.md | AC-9 | DISCHARGED (Task 11) | :34; corroborated :215 | `":34 — '- AC-9 (ledger closeout lands before whole-diff review; in-progress meta-test green) — Task 11, ordering in Task 12.'"` |
| docs/superpowers/plans/2026-08-15-scanner-scope-totality/plan.md | AC-10b | FOREIGN-ID | :91 (and :26, :34, :45, :47, :48, :77); id belongs to `docs/superpowers/specs/2026-08-04-guard-premise-reachability-design.md:508` | `":91 — '- **AC-2** AC-10b collision + parameter-shadow fixtures stay environment-free; aliased-import fixture fires environment-touching.' — every occurrence is the NAME of a pre-existing fixture/comment ('the AC-10b collision fixture', 'the AC-10b comment'), inside AC-2's body; this plan declares AC-1..AC-6 only` |
| docs/superpowers/plans/2026-08-15-theme-persistence-note/plan.md | AC-10b | `DISCHARGED (Task N2 — its "RED, second half", referred to as N2b)` | :78 (heading `### Task N2 — standalone toggle note (anchored bubble)` at :70); declared :51; pointer :34 | `":78 — 'RED, second half (AC-10b, plan R1 F1 — the e2e case is observed failing BEFORE this task's GREEN, in the same task, so the same command goes red then green): author the new Playwright spec tests/e2e/theme-persistence-note.spec.ts…' / :34 — 'The spec DOES require one real-browser geometry proof of a different shape (AC-10b, spec R3 F1): viewport-containment of the anchored bubble plus wrapper-box equality — task N2b below.'"` |
| docs/superpowers/plans/2026-08-16-control-outline-surface-fills.md | AC-7 | **UNSETTLED** | searched: whole-id `AC-7` occurs once in the plan (:82, the declaration under `### Acceptance criteria (spec traceability)` at :74). Nearest candidate is Task 2 step 2.4a (:160, under `### Task 2: The swap — 22 source edits (GREEN)` at :127), which cites the same spec §4.3 but never writes the id | ":82 — '- **AC-7** (spec §4.3): the `GalleryLightbox` chip comment names the token actually present, updated in the SAME commit as the swap.' / :160 — '- [ ] **2.4a** **Fix the `GalleryLightbox` comment in THIS commit** (spec §4.3 says the comment moves with the swap…)' — the link runs through the spec section number, not the id" |
| docs/superpowers/plans/2026-08-22-shell-brace-cross-construct.md | AC-5 | DISCHARGED (Task 5) | :271 (table `\| id \| task \| channel \|` under `## Acceptance criteria this plan discharges` at :255); corroborated :571 | `":271 — '\` | AC-5 \| 5 \| `… baseline-corpus.mts --expect 8ebe8b08…` — Task 5 runs this command by name.' / :571 (under `## Task 5: the digest and the cost bound`) — '**AC-5 — run the command the mapping names.**'" |
| docs/superpowers/plans/2026-08-22-shell-brace-cross-construct.md | AC-6 | DISCHARGED (Task 5) | :272 (same table); corroborated :584 | `":272 — '\` | AC-6 \| 5 \| `corpus-time.mts --runs 3 --max-cpu-ratio 1.5 --baseline-from-merge-base` \| `' / :584 — '**AC-6 — the ratio, both figures from one session so contention cancels.**'"` |

## Counts

| disposition | count |
| --- | --- |
| RETIRED | 1 |
| DISCHARGED | 28 |
| UNSETTLED | 7 |
| FOREIGN-ID | 4 |
| **total pairs** | **40** |

## UNSETTLED pairs

1. `docs/superpowers/plans/ci/2026-08-24-mutation-scratch-fs-event-storm.md` — AC-1
2. `docs/superpowers/plans/2026-08-15-round-economy-enforcement-pair/plan.md` — AC-B6
3. `docs/superpowers/plans/2026-08-15-round-economy-enforcement-pair/plan.md` — AC-C1
4. `docs/superpowers/plans/2026-08-15-round-economy-enforcement-pair/plan.md` — AC-D1
5. `docs/superpowers/plans/2026-08-10-help-tour-hydration-fix.md` — AC-4
6. `docs/superpowers/plans/2026-08-17-shell-binding-mixed-quoted-value.md` — AC-8
7. `docs/superpowers/plans/2026-08-16-control-outline-surface-fills.md` — AC-7

All seven share one shape: a task exists whose body or heading does the criterion's work, but no sentence in the plan writes the id beside that task. Recording "discharged by Task N" for any of them would be the analyst's inference, not the plan's statement.

## FOREIGN-ID pairs

1. `docs/superpowers/plans/2026-08-19-premisescan-nested-hook-sibling-leak.md` — AC-12b (owner: `docs/superpowers/specs/ci/2026-08-16-premisescan-import-edge-fidelity-design.md:676`)
2. `docs/superpowers/plans/2026-08-09-help-report-surface.md` — AC-11.11 (owner: `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-12-user-facing-docs-design.md:709`)
3. `docs/superpowers/plans/2026-08-09-watch-promotion-activation-race-fix.md` — AC-6.18 (owner: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:3863`)
4. `docs/superpowers/plans/2026-08-15-scanner-scope-totality/plan.md` — AC-10b (owner: `docs/superpowers/specs/2026-08-04-guard-premise-reachability-design.md:508`)

Each is a cross-reference living INSIDE another AC's body text (`AC-3 — the two existing AC-12b foils…`, `AC-6 — … AC-11.11 carries r12`, `AC-7 — … AC-6.18 absolute`, `AC-2 — AC-10b collision + parameter-shadow fixtures…`), so the grammar reads the mention as a declaration. These want a grammar fix, not a disposition line.

## Near-misses worth flagging to the migration author

- `2026-08-16-server-action-origin-sweep.md` AC-8 is classified DISCHARGED but the plan's own words are "AC-8 → no task (a spec-time derivation, re-exercised by Task 5 …)". Whatever disposition line is written should quote that clause rather than assert a bare "discharged by Task 5".
- `2026-08-22-mutation-score-jurisdiction-gap.md` AC-8 is discharged by a task the plan marks RETIRED — the AC is satisfied, the TASK is retired. Do not read the word "retired" here as an AC retirement.
```
