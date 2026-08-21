# Killer audit — intra-leg process-boundary probe

**Arc:** `BL-MUTATION-VERDICT-MECHANISM-INTRA-LEG`. **Branch:** `feat/mutation-verdict-intraleg-probe`.
**Spec:** `docs/superpowers/specs/ci/2026-08-21-intraleg-process-boundary-probe-design.md` (§7 AC table, §8).
**Driver:** `scripts/intraleg-killer-audit.mjs`. **Date:** 2026-08-21.

## Why this record exists instead of a mutation score

This arc's convergence criterion is UNAVAILABLE in its usual form. Spec §8 states
the reason and it is not a preference: a mutation score for this probe would be
computed by the very runner machinery the probe audits, so the number would be
circular. The substitute, pre-registered in §8 before any of this ran, is a
three-state classification of every weaker implementation the spec and plan
name — ABSENT, PRESENT-BUT-UNPROVEN, or PROVEN — where PROVEN means the mutant
was applied to the SHIPPED source, the named case was observed RED for the
asserted reason, and the file was restored byte-exact.

A survivor-based finding is therefore not available to a reviewer of this arc,
and the diff-review briefs say so.

## The obligation list is DERIVED, not recalled

`deriveSpecKills()` re-parses the spec's AC table at run time and splits each
row's fourth column on top-level semicolons, paren-aware because those
parentheticals carry semicolons of their own. The run REFUSES to start if any
spec-named kill is unclassified, so a new AC row — or a new kill inside an
existing row — fails this audit until somebody dispositions it. That is the
difference between a sweep and a list that was true once, and it paid out during
the arc: the cover re-verified clean immediately after AC-5's text was amended.

```
DERIVED COVER: 31 spec-named kills, all classified; 14 further obligations from
the plan's task bodies (total 45).
```

The 14 beyond the spec table are the plan's own named kills (`PLAN.k1`-`k12`)
plus two the spec's prose implies inside an existing row and which need their own
mutant to prove: `AC-14.k3` (rotation among trial REPORTS, distinct from rotation
among steps) and `AC-16.k4` (the renderer refusing an arm's number while still
emitting the graduation).

## Preconditions, executable rather than remembered

A restore-by-checkout harness whose baseline was never committed-green destroys
the repair on iteration 1 and then scores every mutant as killed, printing a
flawless result from a destroyed measurement. So the driver refuses to start
unless the working tree is CLEAN over every file it edits and the suite is GREEN
first — and it refuses to run any LIVE mutant unless the live suite is green too.
Both fired for real during this arc: the clean-tree check blocked a run while an
uncommitted repair sat in the tree.

Every mutant's anchor is asserted to match EXACTLY ONCE before it is applied. An
anchor that matches twice edits a site no case reaches, and the run would read as
a survivor.

## What the audit found — four rounds, every finding its own

Round 1: 36 PROVEN, 4 ABSENT, 5 PRESENT-BUT-UNPROVEN.

Three of the five were FILTER TYPOS reported as survivors. A `-t` value beginning
with `--` is eaten as a flag by the CLI, and `-t` is case-sensitive. "No case ran"
and "the mutant survived" are opposite findings that render identically once the
matched count is not read — and telling them apart is the entire job of this
audit. The class repair is a startup FILTER COVERAGE gate: every filter is
validated against the real case list from `vitest list` before any mutant is
applied, a filter matching nothing refuses the whole run by name, and a
zero-matched filter at run time is its own state rather than being folded into
PRESENT-BUT-UNPROVEN.

One was a fixture limit: `AC-4.k2` (a first-suite-only reimplementation) cannot be
seen by a fixture surface that declares ONE suite, because slicing `suitePaths` to
its first element changes nothing there. Moved to the live two-suite control.

One was a REAL product gap, and the audit is the only thing that found it:
`PLAN.k11`, a constant default seed, survived every case. The different-seeds case
INJECTS its own generator, so it proves `main` forwards distinct values and says
nothing about the shipped default; the accept-set case admits a constant, since 1
is a valid seed. A constant default would have shipped a campaign nobody could
tell apart from its predecessor. A new case now draws eight values from
`CLI_DEFAULT_DEPS.generateSeed()` and asserts more than one distinct.

Round 3 surfaced the same shape one level in: three filters matched a case that
could not DISCRIMINATE — the all-in-window case cannot see the window filter being
dropped, the no-samples case refuses whatever the stamps say, and the accept-set
case admits a constant. The coverage gate cannot catch this, because "does this
case discriminate" has no cheap static form; it is exactly what applying the
mutant measures. The audit is the check, and it caught them.

Round 4 closed the fast side at zero PRESENT-BUT-UNPROVEN, and the LIVE half then
opened two more — both faults in the AUDIT rather than in the code, which is the
distinction this record exists to keep:

- `PLAN.k5` reported ANCHOR-NOT-UNIQUE at **0 matches**. Its anchor quoted the
  `deps.stamp(target.sourceAbs.replace(...))` text that the repo-root repair had
  replaced. A stale anchor edits nothing, and "matched 0 times" is a different
  finding from "the mutant survived" — reporting them as one state is exactly
  the conflation the three-state split is for.
- `PLAN.k12` came back 0 failed of 1 matched because the MUTANT was wrong. It
  switched only the receipt SOURCE, so the prefix mutant was still written and
  executed and the behavioural case stayed green. The plan names BOTH seams
  switched together — writer elided AND receipt fed planned bytes — and that
  pairing is precisely what separates it from `AC-4.k3`, the elided-writer-alone
  variant the read-back path already refuses at the receipt.

Both repaired, and the final run classifies every obligation:

```
LIVE BASELINE GREEN: 7 passed, 0 failed
TALLY: {"PROVEN":41,"ABSENT":4}
TOTAL OBLIGATIONS: 45
```

## What the LIVE tier caught that 151 in-process cases could not

Four defects, each a real fault in the harness rather than a flake, and worth
recording because the in-process tier had every opportunity to see them:

1. **The parent observed the wrong process.** `pnpm exec tsx` forks, so the
   parent's spawn handle reported the WRAPPER's pid while the child self-reported
   its own — measured at parent 31881 against child 31909, and 31944/31944 under
   `node --import tsx`. AC-2's "two independent sides" is only two sides if the
   parent's side observes the process that ran the trial.
2. **The child could not reach the control surface**, resolving only against
   `GUARD_SURFACES` while the §5.3 control is deliberately unenrolled apparatus.
3. **A doubled repo root.** `runTrial` passed the source's own DIRECTORY where
   `stampInputs` and `runMutantRecorded` both want the repo root. The in-process
   seams ignored the root argument entirely, so no assertion could decide on it;
   both seams now record it and two cases assert it.
4. **A near-miss on the worktree itself.** `MUTANT_FILE_NAME` was a bare
   filename, so every trial would have written `mutant.ts` into the repository
   root — the tree `psqlStartupScan`'s suite walks and the campaign must freeze.
   No stray file exists only because defect 3 aborted each trial before the
   write.

## Results

| obligation | state | evidence |
| --- | --- | --- |
| `AC-1.k1` — one that coerces a fraction into a trial count | PROVEN | `trials refuses` — 2 failed of 15 matched; a fractional --trials is accepted instead of refused |
| `AC-1.k2` — one whose refusal is a bare "not found" | PROVEN | `refuses an unknown surface id` — 1 failed of 1 matched; the refusal no longer names the id it refused |
| `AC-1.k3` — one that prints a partial distribution before refusing | PROVEN | `emits NO distribution text` — 1 failed of 1 matched; a distribution line is emitted on a refusal path |
| `AC-10.k1` — a pair adjudicated on asserted-not-measured load (samples not filtered to the window) | PROVEN | `samples all fall OUTSIDE its window` — 1 failed of 1 matched; out-of-window samples enter the arithmetic |
| `AC-10.k2` — a parameterized margin | PROVEN | `pre-registered literals` — 1 failed of 1 matched; a margin fixed before the samples existed has moved |
| `AC-10.k3` — one averaging samples regardless of timestamp | PROVEN | `samples all fall OUTSIDE its window` — 1 failed of 1 matched; samples from outside the trial window enter the mean |
| `AC-10.k4` — one adjudicating margins across halves that measured different programs | PROVEN | `cross-stamp load pair` — 1 failed of 1 matched; a cross-stamp pair is adjudicated instead of refused |
| `AC-11.k1` — an unseeded `Math.random` planner | PROVEN | `byte-identical plans for the same seed` — 1 failed of 1 matched; the same seed no longer reproduces the same plan |
| `AC-12.k1` — one averaging an unattributable trial into the bound | PROVEN | `INTERNALLY mismatched stamp pair` — 1 failed of 1 matched; a trial whose inputs moved mid-run counts toward the bound |
| `AC-12.k2` — one pooling internally-stable trials across a mid-campaign suite edit | PROVEN | `stamp differs from the anchor` — 1 failed of 1 matched; trials that measured different programs are pooled |
| `AC-14.k1` — an aggregator reading whatever files exist | PROVEN | `MISSING a receipt step` — 1 failed of 1 matched; a short report is accepted, shrinking the evidence but not the claim |
| `AC-14.k2` — a serializer that rotates child arrays among steps | PROVEN | `ROTATION of child arrays` — 1 failed of 1 matched; right evidence attached to the wrong mutant is accepted |
| `AC-14.k3` — a serializer that rotates windows or half identities among trial REPORTS | PROVEN | `TRIAL-LEVEL rotation` — 1 failed of 1 matched; right evidence attached to the wrong trial is accepted |
| `AC-16.k1` — the literal closeout — planned numbers over a permitted partial state | PROVEN | `POPULATION SIZE beside every aggregate` — 1 failed of 1 matched; the planned bound is quoted over an eligible population that is smaller |
| `AC-16.k2` — the every-N formula evaluator | PROVEN | `REFUSES a bound over ZERO eligible` — 1 failed of 1 matched; the formula is evaluated at N=0 and renders the impossible p > 1.0 |
| `AC-16.k3` — one advancing the load column on a cross-stamp pair | PROVEN | `cross-stamp load pair` — 1 failed of 1 matched; the load column advances on halves that measured different programs |
| `AC-16.k4` — a renderer that refuses the arm's NUMBER while still emitting the graduation | PROVEN | `NO graduation text while ANY arm is at zero eligible` — 1 failed of 1 matched; a graduation reading is emitted over an arm that did not run |
| `AC-2.k1` — an implementation looping in one process and minting distinct nonces | PROVEN | `LYING child pid` — 1 failed of 1 matched; the parent no longer compares its own observation against the child's |
| `AC-3.k1` — a planner that prints shuffled plans while running a fixed order | PROVEN | `EXECUTOR that runs a different order` — 1 failed of 1 matched; a relabelled execution is accepted |
| `AC-3.k2` — a reporter that computes receipts from the PLAN and never writes | PROVEN | `WRITER elided` — 1 failed of 1 matched; the receipt attests the plan rather than the disk, so an elided write verifies |
| `AC-4.k1` — a harness that cannot see a known correlated mechanism | PROVEN | `control` — 2 failed of 8 matched; the manufactured mechanism never fires, so the control is vacuous |
| `AC-4.k2` — a first-suite-only reimplementation | PROVEN | `SHARED state scope reports the flip` — 1 failed of 1 matched; only the first declared suite runs, so a later-suite verdict is missed |
| `AC-4.k3` — the skip-prefix-writes implementation, which no sha check can catch | PROVEN | `PREFIX-BEARING` — 1 failed of 1 matched; the prefix mutant is never written, so its step reports SURVIVED |
| `AC-5.k2` — the `suitePaths[0]`-only implementation on a MULTI-suite surface | PROVEN | `SHARED state scope reports the flip` — 1 failed of 1 matched; a verdict a LATER suite decides is mis-scored on a multi-suite surface |
| `AC-6.k1` — a sink hard-coded to `.mutation-records` | PROVEN | `records land ONLY in the redirected` — 1 failed of 1 matched; campaign records are written into the gate's own channel |
| `AC-7.k1` — a renderer that upgrades a bound to an exclusion | PROVEN | `REFUSES exclusion vocabulary` — 1 failed of 1 matched; exclusion vocabulary reaches a claim line |
| `AC-8.k1` — one folding a fault into `KILLED` | PROVEN | `EXCLUDES an infra-faulted step` — 1 failed of 1 matched; the fault is no longer reported by name |
| `AC-8.k2` — one printing `0 of 0` as a clean result | PROVEN | `ALL-faulting population` — 1 failed of 1 matched; a distribution is produced over zero completed trials |
| `AC-9.k2` — an injectable seam certifying a production path wired to a stub | PROVEN | `DEFAULT_DEPS are bound to the REAL core` — 1 failed of 1 matched; the default seam points at a stub the operator's command would run |
| `PLAN.k1` — a planner returning a CONSTANT position | PROVEN | `derives POSITION as prefix length` — 1 failed of 1 matched; position no longer follows the prefix |
| `PLAN.k10` — a serializer dropping a field of the whole condition | PROVEN | `condition serialization missing ANY field` — 1 failed of 1 matched; a decision is taken against a condition the record cannot express |
| `PLAN.k11` — a CONSTANT default seed | PROVEN | `generateSeed DEFAULT actually varies` — 1 failed of 1 matched; two omitted-seed invocations would plan the same campaign |
| `PLAN.k12` — skip-prefix-writes AND planned-text receipts together (both seams switched) | PROVEN | `PREFIX-BEARING` — 1 failed of 1 matched; every sha check passes while the prefix executes stale bytes; DISTINCT from the elided-writer-alone variant, which the read-back path already refuses at the receipt |
| `PLAN.k2` — a planner spelled shuffle(allMutants).slice(0, n) | PROVEN | `never places the TARGET in its own prefix` — 1 failed of 1 matched; the target can be drawn into its own prefix and run twice |
| `PLAN.k3` — a COPYING consumer that trusts the serialized position | PROVEN | `POSITION was tampered` — 1 failed of 1 matched; a tampered position is adjudicated instead of refused |
| `PLAN.k4` — a consumer accepting a plan whose prefix contains the target | PROVEN | `prefix contains the target` — 2 failed of 2 matched; the target is executed twice under one trial's verdict |
| `PLAN.k5` — an implementation taking BOTH stamps consecutively before execution | PROVEN | `MID-TRIAL edit` — 1 failed of 1 matched; a declared input moving mid-trial is invisible |
| `PLAN.k6` — an implementation that copies the child-reported pid into the parent-observed field | PROVEN | `pid` — 1 failed of 4 matched; the two pid observations can never disagree |
| `PLAN.k7` — a PARENT that mints the nonce and passes it in for the child to echo | PROVEN | `nonce the parent could have passed through` — 4 failed of 4 matched; a pass-through nonce satisfies every remaining check |
| `PLAN.k8` — a SPAWNER omitting MUTATION_RECORD_DIR from the child env | PROVEN | `records land in the redirect` — 1 failed of 1 matched; the child writes production records into the default channel |
| `PLAN.k9` — a TRIAL-level rotation among reports (parallel position-keyed structure) | PROVEN | `TRIAL-LEVEL rotation` — 1 failed of 1 matched; one trial's evidence is accepted on another trial |
| `AC-13.k1` — the widening §1.1 forbids, arriving as an "innocent" helper edit | ABSENT | Checked mechanically rather than argued: the AC-13 freeze diff is empty at closeout. See the closeout section of this record for the command and its output. |
| `AC-13.k2` — a closeout check that reports without gating | ABSENT | The closeout script exits non-zero on every failure branch and is dry-run against a constructed failing input before it is depended on. See the closeout section. |
| `AC-5.k1` — a reimplemented runner whose verdicts agree by luck | ABSENT | No runner is reimplemented. Every verdict comes from the shipped `runMutantRecorded` through the `runMutant` seam, and `DEFAULT_TRIAL_DEPS` is asserted bound to it. There is no second implementation for luck to operate on. |
| `AC-9.k1` — a CLI-shaped surface the runner cannot overlay | ABSENT | The core is an importable module with a referring in-process suite (151 cases), and both adapters are thin `main(argv, deps)` entries holding no decision. A CLI-shaped surface would score as if untested; this one is imported directly by its suite. |

**Tally.** 41 PROVEN, 4 ABSENT — 45 obligations.
