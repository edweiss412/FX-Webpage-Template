<!-- spec-lint: not-ui — test-infrastructure, CI config, and docs only; no layout, component, token, or dimensional change (the AttentionMenu citation is evidence about placement timing, not a UI deliverable). impeccable-gate: N/A. -->

# E2E discovery: declared versus resolved

**Status:** draft, 2026-08-30
**Branch:** `test/e2e-spec-discovery-wiring`
**Supersedes the premise of:** this arc's kickoff brief (untracked, under `FX-worktrees/_briefs/`), whose stated deliverable was refuted at Stage 0 by the recount it mandated.

---

## 1. What this arc found before it did anything

The brief sent this arc to wire 44 dark Playwright specs, on the authority of `LIM-E2E-SPEC-DISCOVERY-GAP` (`docs/review-rounds/LIMITS.md:407`): 118 spec files on disk, 70 discovered. It also ordered the census re-derived rather than trusted. The recount refuted the premise twice.

**First: there are no dark specs.** 118 spec files exist under `tests/e2e`; all 118 are discovered. The original 70 came from `npx playwright test --list` against `playwright.config.ts` alone, and four configs resolve spec files here. Coverage partitions cleanly:

| discovered by | files |
|---|---|
| `playwright.config.ts` only | 61 |
| `tests/e2e/standalone.config.ts` only | 42 |
| both of the above | 8 |
| `playwright.config.ts` + `playwright.screenshots.config.ts` | 4 |
| `playwright.screenshots.config.ts` only | 2 |
| `tests/e2e/visual.config.ts` only | 1 |
| **nothing** | **0** |

The 42 standalone-only files are not dark in any sense: `.github/workflows/standalone-e2e.yml:71` runs the whole standalone config on an unfiltered `pull_request` trigger, and has since `c7c5625c2` (2026-07-26). **All four** of the specs the limit names as its evidence had been executing on every PR before it was written: `step3-review-modal.layout` since 2026-07-03 (`e870595a4`), `attention-pill-focus` since 2026-07-21 (`a794c4124`), `popover-clip-fit` since 2026-08-02 (`434deaf7f`), and `attention-autoopen-suppress` since `19716fcd9` (2026-08-29), which CREATED the spec, added it to `standalone.config.ts` and regenerated the baseline in one commit. It was never dark either, not even for the day this document first claimed — a claim that was itself the same one-sided reading, corrected in diff review round 1.

**Second: the guard the arc was re-scoped to build already exists, twice.** `tests/ci/_metaSpecRegistration.test.ts:952` asserts that every test-shaped file under `tests/e2e` resolves in some config, over the same four configs, with `DARK_SPEC_ALLOWLIST` empty (`tests/ci/_metaSpecRegistration.test.ts:184`). `tests/ci/_metaE2eWorkflowCoverage.test.ts:262` asserts the stronger property that every spec is PR-covered, with reasoned rows for each exception (`tests/ci/_metaE2eWorkflowCoverage.test.ts:116`).

So the arc twice measured its own brief out of work. What remained is the half of the same question nobody had asked.

## 2. The real class: declared is not resolved

Every defect here is one shape. A **declaration** names a test file; a **resolution** is the set of files Playwright actually runs. The two are compared in one direction only. Two of the three uncompared pairings below produced a live defect; the third produced a proved mechanism with no instance ever observed, and is a documented limit rather than a finding.

| # | declaration | resolution | compared? | status |
|---|---|---|---|---|
| 1 | files on disk | union over all configs | yes, `_metaSpecRegistration.test.ts:952` | guarded, allowlist empty |
| 2 | a `testMatch` branch | the file it names | **no** | **9 dead names, repaired here** |
| 3 | a workflow's positional path | the project it is run under | **no** | mechanism proved, **never observed live**, fenced as a documented limit |
| 4 | one config | the population of configs | **no** | the census bug above; this spec's guard ranges over all four |

The census bug is not a separate mistake from the others. It is instance 4 of the same habit: enumerate one side, call it the population, and report the difference as a finding.

### 2.1 Instance 2 — a `testMatch` branch naming no file

`playwright.config.ts` named nine spec files that do not exist, each duplicated across `mobile-safari` and `desktop-chromium`: `apply-driven-refresh`, `redeem-link`, `leaked-link`, `auth-chain`, `admin-banner`, `admin-banner-layout`, `alert-identity-banner-layout`, `alert-banner-autoresolve-layout`, `bootstrap`. Eighteen occurrences.

```
$ ls tests/e2e/ | grep -E "apply-driven-refresh|redeem-link|leaked-link|auth-chain|admin-banner|alert-identity-banner-layout|alert-banner-autoresolve-layout|bootstrap"
$ echo $?
1
```

A dead branch is invisible to `--list` by construction: the resolved set is identical whether or not it is there, which is exactly why both existing guards are blind to it. `tests/ci/_standaloneConfigProbe.ts:170-172` already records that observation, for one config, and never generalized it.

**It is a hazard, not litter.** These matchers are unanchored alternations of bare stems, so they match by substring. `playwright.config.ts:77-78` records the fear in its own comment: a spec named `canonical-layout-dimensions` "would substring-match the `layout-dimensions` alternative in BOTH projects and silently run where it was never meant to". A stem outliving its file keeps that power and adopts the next file whose name contains it, under a project, viewport and baseURL its author never chose.

**Repair, landed in `db27d5ebf`:** delete all eighteen; add `tests/ci/_metaConfigBranchStaleness.test.ts`, which reads the live evaluated matchers of all four configs and asserts every declared branch names a real file.

**Behavior-neutrality is proved, not asserted.** Resolving `playwright.config.ts` before and after the deletion yields the identical **1216** `file::project::case` triples. No dead name was quietly matching something real.

### 2.2 Instance 3 — a workflow path its project cannot match

**This section previously claimed a historical incident. It did not happen, and the claim is retracted here rather than deleted, because how it was made is the point.**

Playwright drops a positional path whose selected project cannot match it, in silence. Probed on this tree, pairing one matched file with one the project cannot match:

```
$ npx playwright test --project=desktop-chromium --list \
    tests/e2e/step3-review-modal.interactions.spec.ts tests/e2e/agendaScheduleLayout.spec.ts
Total: 33 tests in 1 file
$ echo $?
0
```

Two files named, one silently dropped, clean exit, no warning. The run is non-empty, so Playwright's own "no tests found" error never fires. That mechanism is real.

**The incident was not.** The first draft asserted that `.github/workflows/step3-live-bundle.yml` named four spec paths while `desktop-chromium` matched only three, until `57dfd4d5b`. Checking both sides instead of one: before that merge the run line named **three** paths, and all three resolved. On the feature branch `0d5a8c93a` added `step3-review-modal.layout` to the project first, and `05d291d80` added the fourth workflow path afterwards. There was never a state with four paths and three resolutions.

**The error was this document's own subject, committed by its author.** I enumerated the config side across the merge, saw the name appear, and inferred the workflow side had been waiting for it. Enumerate one side, infer the other. It is the same move that produced the 118-versus-70 census in §1, one section away from where it is diagnosed.

**Live instances today: zero.** All 62 (path, project-set) pairs across `.github/workflows/*.yml` resolve.

**Disposition: a documented limit, not a guard arm.** Under the 2026-08-25 process mint freeze, a proved mechanism with no incident and no live instance is recorded with its probe in `LIM-E2E-SPEC-DISCOVERY-GAP`, and no arm is built for it. The one thing that would change that is a change which makes the hazard reachable — and §3.2's dedupe is exactly such a change, since removing a spec from a project while a workflow still names it positionally would create the defect. The dedupe therefore removes both halves together, and that pairing is stated in the commit rather than guarded.


## 3. Also in scope

### 3.1 The settle-race class (`LIM-E2E-1280-CONTAINMENT-FLAKE`)

`docs/review-rounds/LIMITS.md:486` records two cases in `tests/e2e/popover-clip-fit.spec.ts` that sample placement once and can land on the frame before the asynchronous re-apply, and is explicit that the repair is a sweep rather than a patch of the two known cases.

**The population is six cases, and the first derivation of it was wrong in an instructive way.** That draft derived the population from cases that wait for the entrance `scale` to settle and then sample once — three sites. But the scale wait is a partial mitigation, not the cause. `components/admin/showpage/AttentionMenu.tsx:479` states that `entered` is the ONLY re-place signal and that "the mount measurement runs before the entrance rAF", so the settled placement needs a second pass. Reduced motion does not remove it, and `openMenu` waits only for visibility. So the three `settled fit at 390x<h> (reduced motion)` cases at `tests/e2e/popover-clip-fit.spec.ts:315` are the same class despite never waiting on `scale` — a population derived from a symptom rather than from the mechanism.

The correct derivation: **every case that opens the menu and asserts on placement-derived geometry from a single sample.** Six cases across four reads. The animated case at `tests/e2e/popover-clip-fit.spec.ts:370` is excluded because it awaits `transitionend` explicitly; the DOM-descendant case at `tests/e2e/popover-clip-fit.spec.ts:540` is excluded because it asserts node containment, not geometry.

Repaired by routing all four reads through `settledSample`, which resamples until two consecutive reads agree on every value and THROWS rather than returning an unsettled sample. It compares the whole sample rather than a verdict derived from it, for the reason `settledGeometry` already documents.

**No reproduction, and none is claimed.** Six full-file runs at the pre-repair head were 6 of 6 green, consistent with the limit's measured ~1 in 7. The repair is justified by the defect shape and by the component's own comment, not by a red this arc observed. Six runs after the repair: green, 42 passing each.


### 3.2 Corrections riding this PR

- **`LIM-E2E-SPEC-DISCOVERY-GAP` rewritten** to record that the gap was the census's, not the specs'. The entry's own "measurement caveat" paragraph warns about a false census from a bad instrument; the headline number is a second one, from a different bad instrument, and checking an instrument is not the same as checking that it ranges over the population.
- **`docs/superpowers/plans/2026-08-30-pill-size-draft-restored-note.md:394`** carries the now-false claim that the spec "had never executed" and "matched no project regex until this arc wired it". `popover-clip-fit.spec.ts` had been in `standalone.config.ts` since 2026-08-02 and running on every PR since 2026-07-26.
- **Duplicate coverage: deduped, all four.** Eight specs sat in both `playwright.config.ts` and `standalone.config.ts`; four predate that arc and are untouched. The four it added are removed from `desktop-chromium`, because all four already run through the whole standalone config on every PR, unfiltered, while the root-config workflows are paths-filtered. Three of them (`popover-clip-fit`, `attention-autoopen-suppress`, `attention-pill-focus`) are named in no workflow at all, so their membership executed nowhere in CI. The fourth, `step3-review-modal.layout`, was added to `step3-live-bundle.yml` by the same arc on the same false belief; keeping it because that workflow now names it is circular, so both halves are removed together and the result is byte-identical to the pre-arc workflow apart from an unrelated trigger that arc added for a valid separate reason. The specs are self-contained — they bundle and serve their own fixtures over their own `node:http` server — so neither run depends on the app server. The two projects are not otherwise identical: `playwright.config.ts` sets a 60s timeout, 2 retries under CI, a `127.0.0.1:3000` baseURL, `trace: on-first-retry` and webServers, none of which `standalone.config.ts` shares. What the removal costs is therefore a second execution under a different harness posture, on specs that consult none of it, at a viewport the cases mostly set themselves. It is not the no-op that "only a viewport default" implied.


### 3.3 Optional probe

The parked dark-fixture plate trap (p1pair R5): a dark re-render switches surrounding surfaces but not the pill's plate, so the dark-mode contrast check measures a state no viewer sees. Probe and record; repair only if bounded.

## 4. Review contract

**Consequence bound.** Every Playwright config and workflow invocation in this repo either resolves every file it declares, or the guard names the declaration that does not. A declaration the reader cannot classify throws rather than passing, so a matcher outside the closed authoring grammar is surfaced, never silently skipped.

**PROBE DOMAIN.** `playwright.config.ts`, `tests/e2e/standalone.config.ts`, `playwright.screenshots.config.ts`, `tests/e2e/visual.config.ts`, `.github/workflows/*.yml`, and the file list of `tests/e2e/`. These are the live corpus, and they are enumerable. A probe drawn from outside it, or more than one ordinary edit from an input in it, files to documented limits rather than to a finding.

**Threat fence.** The guard defends against ordinary authoring mistakes: a spec renamed or deleted without updating the config, a spec added to a workflow but not to a project, a config added without being added to the census. Adversarial obfuscation of a config module is out of scope and files to documented limits. The reader is deliberately narrow and throws on anything it does not recognize; widening its grammar to chase constructed inputs is the ratchet this repo has measured and is refused in advance.

### 3.4 Documented limit — a mutation shard cannot be narrowed to one surface

`-t <surfaceId>` does not do it. Mutants execute during collection rather than inside the filtered `it` bodies, so the filter suppresses other surfaces' assertions while still running all of their mutants. Measured 2026-08-30 by reading `MUTATION_SUITE` off the live overlay child, which named a different surface's suite entirely while `-t configBranchProbe` was set. The harness exposes no per-surface env filter.

Consequence for the next enroller: a single surface's score costs the whole shard's wall clock (~40 minutes modelled for shard 3, ~60 measured here), and where the class-mutation slot is grant-managed, the ask has to declare that scope rather than one surface's.

## 5. Resolved: the duplicate-coverage question

Round 1 recommended deduping all four, and the recommendation is taken. The reasoning that settled it: `step3-review-modal.layout`'s workflow entry cannot justify its project membership, because the entry was itself added on the belief that the spec had never run. Both were added by one arc for one wrong reason, and both are removed together.

The viewport argument that the first draft offered for keeping them does not survive contact with the files. `attention-pill-focus.spec.ts` never calls `setViewportSize` or `test.use`, so its two runs differed only by each project's incidental default. An incidental default is not a coverage contract.

What remains after the dedupe is not STRONGER — that overstated it, and round 3 said so. The unfiltered guarantee was already there and is unchanged: one PR-blocking home per spec, on every PR. What goes is a paths-filtered duplicate that fired only when its filter matched, under a harness posture these self-hosted specs do not consult. The gain is a smaller surface and one less place for the two to disagree, not more coverage.

## 6. Resolved scope — do not relitigate

- **The census refutation is measured, not an opinion.** 118 spec files, 118 discovered, partitioned in §1. Re-deriving it is welcome; asserting the brief's 44 without re-measuring is not.
- **Importing configs in a child process, rather than reading their source.** `tests/ci/_standaloneConfigProbe.ts:6-23` records two adversarial rounds that broke static readers here. That conclusion is adopted, not reopened.
- **The reader's grammar stays narrow.** It accepts this repo's one authoring convention and throws on everything else. Proposals to widen it toward general regex are the ratchet AGENTS.md fences; a matcher outside the grammar is a loud failure by design, and that is the intended behavior rather than a gap.
- **The nine deletions are behavior-neutral**, proved by the identical 1216 `file::project::case` triples in §2.1. A finding that they removed coverage needs to contradict that resolution, not restate the risk.
- **Wiring specs into projects is out of scope.** There are none to wire; that premise was refuted at Stage 0.
- **Process-facing findings file to documented limits or a `LIM-` slug**, per the 2026-08-25 mint freeze, not to ledger rows.

## 7. Review record

**Round 1 (spec): BLOCKING, 4 findings, all admitted.**

1. A fifth config could escape the census, because the config list was hand-maintained in two places that agreed with each other. Repaired by deriving the population from disk by content (`discoverConfigs`), and proved by planting the reviewer's own hypothetical (a throwaway accessibility config beside the existing e2e configs, named so it misses the old belt's basename pattern) and watching the guard red on it.
2. §2.2's historical incident did not happen. Retracted in place; see §2.2.
3. §3.2's "keep" disposition was circular. Deduped all four; see §5.
4. §3.1's population omitted three same-class cases. Re-derived from the mechanism rather than the symptom; see §3.1.

Two of the four (1 and 2) are the same defect this document is about, committed inside it. That is worth recording plainly: the shape is not hard to understand and is still easy to commit, which is the case for a guard rather than a habit.
