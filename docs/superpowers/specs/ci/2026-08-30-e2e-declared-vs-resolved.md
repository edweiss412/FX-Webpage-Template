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

The 42 standalone-only files are not dark in any sense: `.github/workflows/standalone-e2e.yml:71` runs the whole standalone config on an unfiltered `pull_request` trigger, and has since `c7c5625c2` (2026-07-26). Three of the four specs the limit names as its evidence had been executing on every PR for weeks before it was written: `attention-pill-focus` since 2026-07-21 (`a794c4124`), `popover-clip-fit` since 2026-08-02 (`434deaf7f`), `step3-review-modal.layout` since 2026-07-03 (`e870595a4`). Only `attention-autoopen-suppress` was genuinely dark, and only for the day between `19716fcd9` (2026-08-29) and the filing.

**Second: the guard the arc was re-scoped to build already exists, twice.** `tests/ci/_metaSpecRegistration.test.ts:952` asserts that every test-shaped file under `tests/e2e` resolves in some config, over the same four configs, with `DARK_SPEC_ALLOWLIST` empty (`tests/ci/_metaSpecRegistration.test.ts:184`). `tests/ci/_metaE2eWorkflowCoverage.test.ts:262` asserts the stronger property that every spec is PR-covered, with reasoned rows for each exception (`tests/ci/_metaE2eWorkflowCoverage.test.ts:116`).

So the arc twice measured its own brief out of work. What remained is the half of the same question nobody had asked.

## 2. The real class: declared is not resolved

Every defect here is one shape. A **declaration** names a test file; a **resolution** is the set of files Playwright actually runs. The two are compared in one direction only, and each place they are not compared has produced a live defect.

| # | declaration | resolution | compared? | status |
|---|---|---|---|---|
| 1 | files on disk | union over all configs | yes, `_metaSpecRegistration.test.ts:952` | guarded, allowlist empty |
| 2 | a `testMatch` branch | the file it names | **no** | **9 dead names, repaired here** |
| 3 | a workflow's positional path | the project it is run under | **no** | **was live until `57dfd4d5b`, fenced here** |
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

`.github/workflows/step3-live-bundle.yml:94` runs four spec paths positionally under `--project=desktop-chromium`. Before `57dfd4d5b`, that project's `testMatch` did not include `step3-review-modal.layout.spec.ts`, so the job named four specs and ran three.

Playwright drops such a path in silence. Probed on this tree, pairing one matched file with one the project cannot match:

```
$ npx playwright test --project=desktop-chromium --list \
    tests/e2e/step3-review-modal.interactions.spec.ts tests/e2e/agendaScheduleLayout.spec.ts
Total: 33 tests in 1 file
$ echo $?
0
```

Two files named, one silently dropped, clean exit, no warning. The run is non-empty, so Playwright's own "no tests found" error never fires.

**Live instances today: zero.** All 62 (path, project-set) pairs across `.github/workflows/*.yml` resolve. The only instance was closed by accident, by an arc wiring specs for an unrelated reason. This arm is therefore a **fence against recurrence**, and its incident is the measured gap that existed on `main` until 2026-08-30.

## 3. Also in scope

### 3.1 The settle-race class (`LIM-E2E-1280-CONTAINMENT-FLAKE`)

`docs/review-rounds/LIMITS.md:486` records two cases in `tests/e2e/popover-clip-fit.spec.ts` that sample placement once and can land on the frame before the asynchronous re-apply. The limit is explicit that the repair is a sweep, not a patch of the two known cases.

The population is derived, not listed: a case that waits for the entrance scale to settle (`getComputedStyle(el).scale`, three sites: `tests/e2e/popover-clip-fit.spec.ts:417`, `tests/e2e/popover-clip-fit.spec.ts:567`, `tests/e2e/popover-clip-fit.spec.ts:628`) and then takes exactly one geometry sample it asserts on. The scale wait is necessary and not sufficient, which is precisely why `settledGeometry` (`tests/e2e/popover-clip-fit.spec.ts:239`) exists and why its own comment says a single sample "can land on the frame BEFORE the re-apply". That helper is used at two sites (`tests/e2e/popover-clip-fit.spec.ts:737`, `tests/e2e/popover-clip-fit.spec.ts:808`).

Repair: route every placement measurement in the derived population through a two-sample settle poll that compares the numbers, not the verdicts.

### 3.2 Corrections riding this PR

- **`LIM-E2E-SPEC-DISCOVERY-GAP` rewritten** to record that the gap was the census's, not the specs'. The entry's own "measurement caveat" paragraph warns about a false census produced by a bad instrument; the headline number is a second one, from a different bad instrument.
- **`docs/superpowers/plans/2026-08-30-pill-size-draft-restored-note.md:394`** carries the now-false claim that the spec "had never executed" and "matched no project regex until this arc wired it". It matched `standalone.config.ts` and ran on every PR.
- **Duplicate coverage** created by that wiring, evaluated rather than assumed. Eight specs sit in both `playwright.config.ts` and `standalone.config.ts`; four predate the arc. Of the four it added:
  - `step3-review-modal.layout` — **keep.** `step3-live-bundle.yml:94` needs the membership; this is instance 3 above, accidentally repaired.
  - `popover-clip-fit`, `attention-autoopen-suppress`, `attention-pill-focus` — named in **no** workflow (`grep -rln <name> .github/workflows/`), so the `desktop-chromium` membership executes nowhere in CI while `standalone-e2e.yml` already runs all three on every PR. Disposition is this spec's one open question, argued in §5.

### 3.3 Optional probe

The parked dark-fixture plate trap (p1pair R5): a dark re-render switches surrounding surfaces but not the pill's plate, so the dark-mode contrast check measures a state no viewer sees. Probe and record; repair only if bounded.

## 4. Review contract

**Consequence bound.** Every Playwright config and workflow invocation in this repo either resolves every file it declares, or the guard names the declaration that does not. A declaration the reader cannot classify throws rather than passing, so a matcher outside the closed authoring grammar is surfaced, never silently skipped.

**PROBE DOMAIN.** `playwright.config.ts`, `tests/e2e/standalone.config.ts`, `playwright.screenshots.config.ts`, `tests/e2e/visual.config.ts`, `.github/workflows/*.yml`, and the file list of `tests/e2e/`. These are the live corpus, and they are enumerable. A probe drawn from outside it, or more than one ordinary edit from an input in it, files to documented limits rather than to a finding.

**Threat fence.** The guard defends against ordinary authoring mistakes: a spec renamed or deleted without updating the config, a spec added to a workflow but not to a project, a config added without being added to the census. Adversarial obfuscation of a config module is out of scope and files to documented limits. The reader is deliberately narrow and throws on anything it does not recognize; widening its grammar to chase constructed inputs is the ratchet this repo has measured and is refused in advance.

## 5. Open question for review

The three specs in §3.2 whose `desktop-chromium` membership executes nowhere. Two defensible dispositions:

- **Dedupe** — remove them from `desktop-chromium`, leaving `standalone-e2e.yml` as the single PR-blocking home. Cheapest, and removes three names whose only current effect is to run the specs twice for anyone invoking the root config locally.
- **Justify and keep** — the two projects differ in viewport (`standalone-chromium` takes the `Desktop Chrome` default; `desktop-chromium` pins 1280x800, `playwright.config.ts:101`), and these are geometry specs, so a second viewport is arguably real coverage rather than duplication.

The measured facts favour dedupe: no workflow selects them, and the specs set their own viewports per case. Kept open because it is a coverage decision, not a mechanical one.

## 6. Resolved scope — do not relitigate

- **The census refutation is measured, not an opinion.** 118 spec files, 118 discovered, partitioned in §1. Re-deriving it is welcome; asserting the brief's 44 without re-measuring is not.
- **Importing configs in a child process, rather than reading their source.** `tests/ci/_standaloneConfigProbe.ts:6-23` records two adversarial rounds that broke static readers here. That conclusion is adopted, not reopened.
- **The reader's grammar stays narrow.** It accepts this repo's one authoring convention and throws on everything else. Proposals to widen it toward general regex are the ratchet AGENTS.md fences; a matcher outside the grammar is a loud failure by design, and that is the intended behavior rather than a gap.
- **The nine deletions are behavior-neutral**, proved by the identical 1216 `file::project::case` triples in §2.1. A finding that they removed coverage needs to contradict that resolution, not restate the risk.
- **Wiring specs into projects is out of scope.** There are none to wire; that premise was refuted at Stage 0.
- **Process-facing findings file to documented limits or a `LIM-` slug**, per the 2026-08-25 mint freeze, not to ledger rows.
