# CI-dark coverage — wiring the suites that run in no CI job

**Date:** 2026-07-26 · **Branch family:** `feat/ci-dark-coverage` (4 PRs) · **Class:** CI wiring / test-coverage integrity

**Backlog items closed:** `BL-STANDALONE-CONFIG-CI-DARK`, `BL-CRON-REGISTRY-MIGRATION-PARITY`
**Reduced but still open:** `BL-E2E-LIFECYCLE-SPECS-CI-DARK` — 30 rows closed by PR2, but `admin-lifecycle-transitions` stayed dark on measurement (§6.1's own fallback; see the §6.1 amendment)
**Partially closed, stays open:** `BL-PG-CRON-COVERAGE-UNRUN` (per-job smoke-test residue, §9) · `BL-DEV-GATE-GALLERY-SPEC-ROT` (still not PR-gated, §6.2)
**Backlog items FILED by this spec:** four, in §10 — guard ambitions descoped after four review rounds. **Their measurements live in `BACKLOG.md`, not only here**, so a future session finds them by grepping the backlog rather than this document.

<!-- spec-lint: not-ui — no UI surface is modified; the app/ and components/ citations are incidental (scope-exclusion statements and workflow path filters this spec removes). Ratified §1.1. -->

Files this spec CREATES are written unbackticked (tests/e2e/helpers/liveEntryToolchain.ts, .github/workflows/standalone-e2e.yml) so they are not read as citations to existing code. The same applies to the files it DELETES — the seven retired per-feature workflows and tests/ci/attentionPillFocusWorkflow.test.ts — which stop being tracked the moment §4.3 lands.

---

## §1 Problem

A test that no workflow invokes is not coverage. It is a file that once passed. Three independent mechanisms put a suite in that state here, and each has produced a live defect:

1. **A Playwright config nothing invokes.** `tests/e2e/standalone.config.ts` holds an explicit `testMatch` allow-list (`tests/e2e/standalone.config.ts:35`). Its specs are unreachable via the default config, so `pnpm exec playwright test tests/e2e/<one>.spec.ts` reports `No tests found` — which reads as a bad path, not a missing project.
2. **A workflow run-list nothing added to.** `tests/e2e/admin-lifecycle-transitions.spec.ts` is matched by the `mobile-safari` project (`playwright.config.ts:64`) but named by no workflow.
3. **A CI-conditional vitest exclusion nobody watches.** `tests/cross-cutting/pg-cron-coverage.test.ts` sits in `ENV_BOUND_EXCLUDES` (`vitest.projects.ts:48`), applied only when `VITEST_EXCLUDE_ENV_BOUND=1`. It therefore runs locally and is dark in CI — which is exactly why it rotted unnoticed (§5.2a).

Not theoretical: two dark standalone specs are **red on `main` right now** (§2.3), and the mechanism is the rot this class predicts — a shared harness entry grew a Node-only import, the specs CI runs were given stub aliases, and the dark copies were never updated because nothing observed them break.

### §1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Scope is the standalone-Playwright half plus the cron half. The ~60 app-dependent `UNSEEN` specs stay allowlisted with reasons. | Owner, brainstorming Q1 |
| One whole-config workflow; **every** per-feature standalone workflow is retired. The count has only ever grown (five at ratification, a sixth mid-authoring, a seventh by PR2 branch time, §4.3) — what is ratified is *all of them*, not a number. | Owner, brainstorming Q3 |
| The new standalone workflow carries **no** `pull_request.paths` / `paths-ignore` filter — forced by the scanner contract (§4.2), not a preference. Precedent: `docs/superpowers/specs/2026-07-24-archive-row-menu-idiom.md:128`. | This spec §4.2 |
| **Descoped after four adversarial rounds (37 accepted findings): the rule-based resolver plugin, G1's full narrowing semantics, and G3 in any form.** Each survived three rounds without converging, and successive repairs introduced successive contradictions. Filed as backlog items with their measurements (§10) rather than shipped unsound. | Owner decision, 2026-07-26 |
| The e2e jobs are advisory at the GitHub layer — not because "only `quality` is required" (that in-repo claim is stale) but because none is in the live 12-context required set (§2.5). | §2.5, measured |
| No UI surface, no DB migration, no `pg_advisory*` path. Invariant 8's impeccable gate and invariant 2's holder topology are both N/A, so there is no Dimensional Invariants or Transition Inventory section. | `AGENTS.md` invariants 2 and 8 |

---

## §2 Measured inventory

**These numbers are provenance, not contract.** They have been re-derived three times during authoring because `origin/main` kept moving under the branch, and they will be stale again by the time PR2 lands. **The plan re-derives them at implementation time**; nothing in the guards hardcodes a count — the stale-branch check enumerates the config, and the allowlist delta is whatever the shadowing assertion demands. A spec number that drifts is a documentation defect; a guard number that drifts is a broken gate, so no guard carries one.

Measured 2026-07-26 against `origin/main` at `eb7ef456b`, after **two** mid-flight rebases (+70 commits, then +48 more during a session gap): `origin/main` advanced 70 commits during authoring, including PR #598, which added `tests/e2e/share-link-flash.spec.ts` **and its own dedicated path-gated workflow** — a sixth instance of the rot surface §4.3 retires, created while this spec was being written. That is the strongest single argument for the whole-config job: the per-feature pattern reproduces faster than it can be retired one at a time.

### §2.1 e2e spec coverage

| Quantity | Value |
| --- | --- |
| `tests/e2e/*.spec.ts` files | 90 |
| Rows in `LOCAL_ONLY_ALLOWLIST` (`tests/ci/_metaE2eWorkflowCoverage.test.ts:35`) | 89 |
| Specs covered by a PR-blocking-capable workflow | 1 (`admin-lifecycle-layout`) |
| Specs named by a workflow but rejected (all for a path filter) | 24 |

Validated by executing `scanWorkflowCoverage` over the real workflow set, not a bespoke script; `tests/ci/` passes green today (21 tests), so PR2's delta is against a true baseline.

### §2.2 The standalone config

> **SUPERSEDED as to counts.** Every figure in the table below moved before PR2 branched (31 `testMatch` members, 92 allowlist rows). Retained as provenance for the *shape* of the analysis; the §4.3 amendment carries the live numbers, and the guards derive theirs at runtime.

| Quantity | Value |
| --- | --- |
| Alternation branches in `testMatch` (`tests/e2e/standalone.config.ts:36`) | 31 |
| — resolving to an existing spec file | 30 |
| — **stale** (`overrideableField.layout`, no such file) | 1 |
| Branches named by some workflow | 12 |
| Real branches named by no workflow (**dark**) | 16 |
| Real branches carrying an allowlist row today | 30 (all) |
| Real branches remaining after PR1 removes `packlist-rescan-recovery` | **29** |
| Allowlist rows deleted by PR2 | **29** |
| Allowlist rows remaining after PR2 | **60** |

Three counts that are easy to conflate, so state them separately:

- **15** specs go dark → covered (16 dark branches, less `packlist-rescan-recovery`, which PR1 removes from the config rather than fixing).
- **29** allowlist rows are deleted — the dark ones plus those already covered by *path-filtered* workflows, which the scanner rejects and which therefore still carry rows today. An unfiltered job covers those properly, so their rows must go too or the shadowing assertion (`tests/ci/_metaE2eWorkflowCoverage.test.ts:164`) fails.
- **`packlist-rescan-recovery` keeps its row**, correctly: after PR1 it is in no config and no workflow, so it is genuinely dark and its row states that (`BL-HARNESS-PACKLIST-SERVER-GRAPH`).

### §2.3 Baselines

| Run | Result |
| --- | --- |
| The 16 dark specs, clean worktree | 51 passed, 2 failed, 1 did not run (1.6m) |
| Whole config, server env supplied | **286 passed, 2 failed, 1 did not run (1.9m)** |
| Whole config, all 9 server env vars unset | 221 passed, 4 failed |

The two persistent failures are `resolve-label-layout` and `packlist-rescan-recovery`, both at their `beforeAll` esbuild step, by **different** import chains:

| spec | unresolved | importer |
| --- | --- | --- |
| `resolve-label-layout` | `node:crypto` | `lib/parser/warnings.ts` → `lib/parser/useRawContentHash.ts:1` |
| `packlist-rescan-recovery` | `node:crypto`, `node:async_hooks`, `os`, `fs` | `lib/email/hashForLog.ts:1`, `lib/log/requestContext.ts:2`, and the postgres driver |

The bare-env run adds two more — `step3-review-modal.interactions` and `step3-review-modal.layout` — dying at module load on `HASH_FOR_LOG_PEPPER`. So **23 of 28 specs need no server env at all**, and the env dependency is 2 specs, not the 4 the retiring workflow feeds.

### §2.4 Toolchain census

8 spec files shell `pnpm dlx esbuild@0.28.0`; **28** shell `pnpm dlx @tailwindcss/cli@4.2.4`; **36** call sites across **29** files. (Re-measured at plan time: the +190-commit merge added three more CSS call sites — `section-header-layout.layout`, `pusher-alignment.layout`, `share-link-flash`. An earlier draft said 25/33/26, which is precisely the drift §2's opening paragraph predicts.) Of the 8 esbuild sites, **2 carry stub aliases** (`compact-alert-card-layout`, `hoverhelp-geometry` — both already CI-wired, which is why they were repaired) and 6 do not.

`esbuild@0.28.0` is already a devDependency at the identical pin (root `package.json`, `devDependencies.esbuild`), so those 8 fetch a package sitting in `node_modules`. `@tailwindcss/cli` is **not declared** (only `@tailwindcss/postcss` is installed), so those 25 are a genuine network fetch. Its binary is named `tailwindcss`, and the `tailwindcss` package declares no `bin` in v4, so the name resolves unambiguously once the CLI is a devDependency.

### §2.5 Branch protection — measured, because the in-repo claim is stale

`tests/ci/_metaE2eWorkflowCoverage.test.ts:12` says protection requires "ONLY the `quality` context". False. Live, `main` requires twelve: `quality`, `unit-suite`, `x1`–`x6`, `validation-schema-parity`, `affordance-matrix-parity`, `postgrest-dml-lockdown`, `traceability-audit`. `scripts/generate-traceability.ts` independently resolves a third, different list of eight.

Consequences: **none of the six retiring workflows is required** (and no workflow declares a `needs:` on them), so §4.3 cannot break merges; **`unit-suite` IS required**, so PR3's edit modifies a merge-blocking check and its `workflow_dispatch` verification is mandatory; the new job is advisory because it is absent from that list.

---

## §3 PR1 — fix the red specs, and stop fetching the toolchain over the network

Deliberately minimal. The rule-based resolver an earlier draft specified is descoped (§10.1) after four review rounds failed to make its overmatch guarantees sound.

### §3.1 The two red specs

`resolve-label-layout.spec.ts:66` and `compact-alert-card-layout.spec.ts:66` bundle **the same entry** (`tests/e2e/_compactAlertCardLiveEntry.tsx`) with the same flags; the latter additionally passes `--alias:node:crypto` and `--alias:next/navigation`. That is the whole difference between red and green, and it is pure copy-paste drift: whoever added the stubs fixed the spec CI runs and never learned the dark copy broke.

**`resolve-label-layout` is fixed by adding those two aliases.** Measured: the entry bundles clean (903 kb) and renders 15,460 characters of DOM with zero page or console errors.

**`packlist-rescan-recovery` cannot be fixed that way and is REMOVED from the standalone config**, with `BL-HARNESS-PACKLIST-SERVER-GRAPH` filed (§10.2). Its entry reaches the entire server tree — traced by metafile:

```
_packListRescanLiveEntry.tsx -> step3ReviewSections.tsx -> UseRawControlBoundary.tsx
  -> app/admin/show/[slug]/_actions/useRaw.ts ("use server")
  -> lib/sync/runManualSyncForShow.ts -> runScheduledCronSync.ts -> googleapis (913 inputs)
```

with `lib/sync/lockedShowTx.ts` reaching the postgres driver by a parallel edge. Aliasing that one boundary is not enough: **ten** distinct `lib/sync/*` modules still pull `postgres`. A 4-entry alias list leaves 78 errors.

Removing it changes nothing about what CI runs today — it is already dark — and it is required for PR2, which makes the config merge-visible: a red spec in an unfiltered job is a broken gate, not coverage.

### §3.2 The toolchain helper

New module tests/e2e/helpers/liveEntryToolchain.ts, exporting `bundleLiveEntry` and `compileEntryCss`. Both invoke **local** binaries (`pnpm exec esbuild`, `pnpm exec tailwindcss`) — no `dlx`, no network, no version literal at the call site. Both shell out; neither implements a resolver policy. Aliases are passed explicitly by each call site, exactly as the two working specs do today.

**AMENDMENT (2026-07-26, during implementation).** This section originally specified `buildEntryCss({ sources, outFile })`, which would also CONSTRUCT the entry stylesheet from a `@source` list and read `app/globals.css` itself. That was implemented and **reverted**. The 28 call sites construct their entry CSS in materially different ways — inline template literals, `sources.map`, and one array of pre-formatted `@source` directives — and a mechanical rewrite produced **54 TypeScript errors across 12 files**, plus two regressions caught against the pre-migration commit: a regex that captured the lambda parameter from `sources.map((f) => …)` as `sources: [f]`, and seven files given a call with no import.

What ships is `compileEntryCss({ entryCss, outFile })`, which runs the CLI against an **already-written** entry stylesheet and replaces only the `execFileSync` call. Each spec keeps building its own entry CSS and reading `app/globals.css`.

The rationale is a trade, stated plainly: the PR's goal is removing the per-run **network fetch**, which this achieves in full. Deduplicating the `globals.css` read is cosmetic, and restructuring 28 harnesses to obtain it is not a trade this PR should make. This is recorded here, not only in a code comment, because the spec is canonical (`AGENTS.md` invariant 7) — a deviation living only in the implementation is precisely the drift that rule exists to prevent.

Add `"@tailwindcss/cli": "4.2.4"` as an exact devDependency, plus a version-parity test: resolved `@tailwindcss/cli` and `tailwindcss` must agree on major and minor. Pinning alone is insufficient — `tailwindcss` is a range (root `package.json`, `devDependencies.tailwindcss`), so an install can pair the fixed CLI with a different minor.

### §3.3 Guard

New meta-test tests/e2e/\_metaLiveEntryToolchain.test.ts, filesystem-walked so a new spec fails by default:

1. No file under `tests/e2e/**` **other than the helper itself** names `dlx`, `esbuild`, `@tailwindcss/cli`, or `tailwindcss` as a command string. The helper is the one permitted invocation point and is exempted **by path**, not by an open exemption list — an earlier draft declared an empty exemption list while the helper necessarily names both binaries, so PR1 could never have gone green. The `tailwindcss` spelling matters most: that is the CLI's actual binary name, so a guard naming only packages misses the real invocation.
2. No file under `tests/e2e/**` except the helper imports `esbuild` — otherwise a spec calls the JS API directly and skips the helper.
3. No `package.json` script referenced from `tests/e2e/**` names a toolchain binary, which would move the invocation just outside a filesystem-only scan.

The guard asserts the **absence of a shape** with an explicitly empty exemption list, per `feedback_static_guard_allowlist_shapes_not_leak_hunting`. It deliberately does **not** ban `child_process`: twelve files under `tests/e2e/**` legitimately spawn `tsx` render harnesses, `psql` fixtures, and seeds (verified independently — 30 files import `child_process`, 26 are toolchain users, and 8 of those also spawn `tsx`, so the naive `30 − 26` is wrong).

### §3.4 Test plan (TDD order)

1. Red: the toolchain guard fails against `main` — **36** violating call sites across 29 files.
2. Red: a unit test asserting `bundleLiveEntry` bundles `_compactAlertCardLiveEntry.tsx` with no resolution errors.
3. Green: implement the helper, add the devDependency and the version-parity test, migrate all 36 sites, add the two aliases to `resolve-label-layout`, remove `packlist-rescan-recovery` from the config.
4. Verify **by running the specs**. The §2.3 baseline is 286 passed / 2 failed / 1 did not run, but that total does not carry over: `packlist-rescan-recovery` leaves the config (it contributes 1 test, which currently fails at `beforeAll`, plus the 1 that did not run), and `resolve-label-layout` goes red → green. So the target is stated as an invariant rather than an arithmetic prediction:
   - **zero failures and zero did-not-run**;
   - `resolve-label-layout` present and passing;
   - `packlist-rescan-recovery` absent from the run;
   - total passed **≥ 286**, which holds because the only spec removed contributed a failing test, not a passing one.

   Pinning a single expected count here would be a number to update rather than a property to check, and the whole cluster exists because stale expectations go unnoticed.

---

## §4 PR2 — the standalone workflow and the stale-branch guard

### §4.1 The workflow

New workflow .github/workflows/standalone-e2e.yml: `actions/checkout@v4` → `./.github/actions/setup` → Playwright chromium cache → `pnpm exec playwright test --config tests/e2e/standalone.config.ts`, plus an `if: failure()` artifact upload. Concurrency block copied from the existing e2e workflows. `timeout-minutes: 20` against a measured 1.9 min.

**The command carries NO `--reporter=list`, deliberately.** An earlier draft of this paragraph specified one, contradicting the literal the scanner recognizes two subsections below — the workflow would have claimed nothing and the deleted allowlist rows would have left every member dark. Corrected here rather than left for a reader to reconcile; the config already sets `reporter: "list"` internally, so no output is lost.

No `webServer`, no Supabase, no `pnpm build` — the specs boot their own `node:http` server (`tests/e2e/standalone.config.ts:4`).

**The command must not be piped.** `tests/ci/_workflowCoverageScan.ts:30` reads a trailing `| tee`, `| cat`, or `| grep` as exit-code suppression and refuses to count it. `x-audits.yml` uses exactly that idiom with `set -o pipefail`, which the scanner cannot see — copying it would mark the job non-blocking and silently re-darken all 28 specs while the guard stayed green.

**Env comes from the config.** Two specs need server env at module load. Rather than copy .github/workflows/modal-header-layout-e2e.yml:74's nine variables into the new workflow, `tests/e2e/standalone.config.ts` sets deterministic demo fallbacks with `process.env.X ??= …`. **Precedence, stated correctly** (an earlier draft had it backwards): Playwright evaluates the config **before** loading any test module, so a top-level `process.env.X ??=` there populates the variable first, and `tests/e2e/helpers/loadTestEnv.ts:17` — which uses `@next/env`, and `@next/env` preserves already-defined process values — will **not** override it. So the config defaults win over `.env.local`, not the other way round.

That is acceptable and deliberate: the defaults are the same demo values `playwright.config.ts` already uses for its port-3004 server, and every one of them is a placeholder rather than a credential. But the spec must not claim a local-composition contract it does not have, so it does not. Today the same defect is patched twice — `loadTestEnv` fixes a developer machine, the workflow env fixes CI, and the two failing specs are covered by the CI half only, which is precisely why retiring that workflow breaks them.

**The scanner must learn one thing, or PR2 is incoherent.** `scanWorkflowCoverage` extracts only explicit `tests/e2e/*.spec.ts` paths and `pnpm` aliases (`tests/ci/_workflowCoverageScan.ts:87`). The whole-config command names **no spec**, so as things stand the new job would mark nothing covered and deleting 29 allowlist rows would redden the meta-test.

An earlier "validated against the real scanner" claim in this spec was **vacuous and is retracted**: the draft fed to the scanner carried an explicitly named spec, so it exercised a different command shape than the one shipping.

Re-run with the **actual** command — `pnpm exec playwright test --config tests/e2e/standalone.config.ts`, no named spec:

```
covered: 0 []
rejected: 0
```

Not "rejected for a reason" — **invisible**. The scanner has nothing to reject because it never extracts a spec path, so the job would register as covering nothing at all.

This is not a re-litigation of the descope. What was descoped is the *narrowing semantics* — `--grep`, `--shard`, forwarded call-site arguments, inert-token grammar — which four rounds could not make sound. What PR2 needs is narrower than that and is an existence dependency:

> A `run:` command matching **exactly** `pnpm exec playwright test --config <path>`, with **no other arguments of any kind**, covers every spec that config's `testMatch` matches. Any deviation — an extra flag, a positional argument, a different verb order — yields **no claim at all**.

The rule changes **only spec extraction**. Every capability check still applies unchanged on top of it: a job or step carrying `if:` or `continue-on-error`, a workflow with a `pull_request.paths` filter, or an exit-suppressed command still yields no coverage even when the command matches the literal exactly (`tests/ci/_workflowCoverageScan.ts:108-123`). Recognition and qualification are separate gates, and this touches the first only.

The workflow's command is written to that literal shape (so the default reporter is used rather than `--reporter=list`), and `configSpecs` is supplied by the meta-test, which imports the config and reads resolved `testMatch` values — proven executable: 10 projects resolve for the default config and 30 specs for the standalone one. Recognizing one exact string cannot be attacked on grammar, because there is no grammar; anything that is not that string is not recognized.

**Prototyped, with negatives** — the positive case alone would repeat the vacuity above:

| command | claim |
| --- | --- |
| `pnpm exec playwright test --config tests/e2e/standalone.config.ts` (the shipping shape) | **30 specs** — exactly the real-branch count |
| `… --config … --shard=1/2` | none |
| `… --config … -g foo` | none |
| `… --reporter=list --config …` | none |
| `… --config … resolve-label` (positional) | none |
| `… --config … --list` | none |

Every narrowing form that round 3 and round 4 attacked lands in the "no claim" column here — not because the rule reasons about them, but because it reasons about nothing except one literal string. That is the whole design.

### §4.2 Why no path filter

`tests/ci/_workflowCoverageScan.ts:105` disqualifies any workflow carrying `paths:` **or** `paths-ignore:`. A coarse-filtered job would leave all 29 remaining real branches non-qualifying and still allowlisted — the guard green, the specs effectively dark. Ratified precedent: `docs/superpowers/specs/2026-07-24-archive-row-menu-idiom.md:128`.

Cost: one ~5 min DB-free job on every PR, replacing seven jobs that each pay the same setup.

### §4.3 Retirements

> **AMENDMENT (re-measured at PR2 branch time, after `main` advanced ~190 commits during PR1).** The counts below were taken when this spec was written and have all moved. Re-resolving every workflow's `run:` commands through their `pnpm` aliases against the live tree now yields **seven** retirements, not six: destructive-layout-e2e.yml joins them (alias `test:e2e:destructive-layout` runs `pendingDiscardReal.layout` + `pendingDiscardReflow.layout`, **both** `testMatch` members, and the workflow has a single job, so it is fully subsumed). `testMatch` now holds **31** specs, not 30 — `pendingDiscardReal.layout` was added and `packlist-rescan-recovery` removed by PR1. `LOCAL_ONLY_ALLOWLIST` now holds **92** rows, not 89. The deletion set is re-derived from the scanner's actual output at implementation time rather than from any frozen list here; the numbers in this section are provenance, not contract (§2). Measurement script and full output: the PR2 commit that introduces the whole-config workflow.
>
> This is the same drift the cluster exists to fix, observed on itself: an eighth per-feature workflow (share-link-flash-e2e.yml) and a 31st spec both landed *while the PR removing them was in review*, and PR1's guard caught a fresh `pnpm dlx` invocation on merge. Ship the guard with the sweep; the sweep alone loses to the rate of new work.

Deleted: attention-anchor-e2e.yml, attention-pill-focus-e2e.yml, bulk-ignore-eyebrow-e2e.yml, destructive-layout-e2e.yml, hoverhelp-geometry-e2e.yml, modal-header-layout-e2e.yml, share-link-flash-e2e.yml — **seven**.

**Verified mechanically, not assumed:** resolving each of the seven workflows' run commands (including through `pnpm` script aliases) yields 11 spec invocations — 1, 1, 1, 2, 1, 4, 1 — and **every one is a member of `standalone.config.ts`'s `testMatch`**. So the whole-config job is a strict superset of what the seven provide, and no coverage is lost by deleting them. The check is a script over the live workflow files rather than a reading of them, because "all of these are in the config" is exactly the kind of claim that is true until someone adds a spec. `phantom-gap-e2e.yml` survives (its other two legs run default-config specs) but loses its standalone leg, which PR #605 grew from one spec to three (`phantomGapHelper.layout`, `section-header-layout.layout`, `pusher-alignment.layout`) — all three subsumed by the whole-config job.

**A required-suite test reads one of the deleted workflows.** tests/ci/attentionPillFocusWorkflow.test.ts opens attention-pill-focus-e2e.yml at module initialization, asserts its path-filter contract, and asserts the spec's `PATH_GATED` allowlist row. Deleting that workflow reddens `unit-suite` — a live required context (§2.5) — regardless of whether the new browser job passes. PR2 therefore deletes that test in the same commit. Its four assertions were read individually rather than dismissed in aggregate:

| assertion | disposition |
| --- | --- |
| "invokes the spec under the standalone config" | **subsumed** — the spec is in the config and the config runs |
| "fires on every direct harness, production, and toolchain input" | **strictly weaker** than an unfiltered job, which fires on everything |
| "fires on EVERY production file in the harness's transitive import graph" | same — trivially satisfied when there is no filter |
| "is classified `PATH_GATED`, not `UNSEEN`, in the coverage registry" | **intentionally inverted** — the row is deleted because the spec becomes genuinely covered |

The third is the interesting one: that test existed to police a hand-maintained path filter against a component graph that keeps growing — the precise maintenance burden §4.2 removes. Deleting it is not losing coverage; it is retiring a guard whose subject no longer exists.

The other six retiring workflows were checked for the same shape; only this one has a reader.

The `pnpm test:e2e:*` scripts are **kept**: three shipped plan docs cite them as verification commands, and single-spec shortcuts are the local ergonomics whose absence let these specs rot. `test:e2e:standalone` joins them.

### §4.4 Guard — the stale-branch check only

**Every alternation branch in `tests/e2e/standalone.config.ts:36` must resolve to an existing spec file.** `overrideableField.layout` fails today and its branch is deleted here.

This check is **total**: the branch list is finite and each entry either resolves or does not. That is the entire guard. Detecting *unregistered* self-contained specs is descoped (§10.3) — it could not be given a sound definition, and a guard that detects only what it happens to recognize is worse than an honest absence.

The allowlist rows the new job now covers are deleted in the same commit as the retirements, or the shadowing assertion fires against an intermediate state. The set is whatever the shadowing assertion demands at implementation time (§4.3 amendment); no count is pinned here.

---

## §5 PR3 — pg-cron coverage

### §5.1 The premise correction

`BL-CRON-REGISTRY-MIGRATION-PARITY` records the fix as "apply migrations to a throwaway Postgres in CI … this needs a variant that enables them," believing CI holds the pg_cron migrations aside permanently. It does not. `scripts/ci/supabase-local-bootstrap.sh:50` holds both aside for the initial boot only, sets `app.fxav_vercel_url` via `supabase_admin` (`scripts/ci/supabase-local-bootstrap.sh:99`), restores them, and applies them with `supabase migration up --include-all` (`scripts/ci/supabase-local-bootstrap.sh:104`). `.github/workflows/unit-suite.yml:117` runs it; `.github/workflows/unit-suite.yml:111` installs `psql`.

So `unit-suite-db` already has a Postgres whose `cron.job` rows were produced **by PostgreSQL parsing this branch's SQL** — the parity check the backlog wanted, with no new infrastructure and no SQL scanner (which that entry explicitly forbids). Same shape as the `#603` finding in `feedback_guard_machinery_can_rest_on_a_false_premise`.

### §5.2 Changes

1. Remove the `pg-cron-coverage` entry from `ENV_BOUND_EXCLUDES` (`vitest.projects.ts:48`).
2. Add the CI anti-vacuity requirement (§5.3).
3. Add an `x-audits.yml` job modelled on `validation-schema-parity` (`.github/workflows/x-audits.yml:313`) running with `PG_CRON_COVERAGE_TARGET=validation`. **It needs three env values, not one.** The suite's `beforeAll` refuses to run unless `TEST_DATABASE_URL` is non-local, `VALIDATION_SUPABASE_PROJECT_REF` is set, and the URL *contains* the ref (`tests/cross-cutting/pg-cron-coverage.test.ts:110`). The cited template supplies only `TEST_DATABASE_URL` (`.github/workflows/x-audits.yml:336`), so copying it verbatim produces a job that fails before reaching a single live assertion.
4. Correct **five** stale doc sites: the `ENV_BOUND_EXCLUDES` comment, `.github/workflows/unit-suite.yml`, the suite's own header (`tests/cross-cutting/pg-cron-coverage.test.ts:2-9`), which declares it `LOCAL-ONLY` and "NOT wired into CI"; and two in `tests/cross-cutting/vitest-projects-partition.test.ts` — `tests/cross-cutting/vitest-projects-partition.test.ts:146` and `tests/cross-cutting/vitest-projects-partition.test.ts:178` state there are three env-bound files, and `tests/cross-cutting/vitest-projects-partition.test.ts:231` labels `pg-cron-coverage` env-bound. All become false the moment the array entry is removed.

### §5.2a The exclusion is CI-conditional

`ENV_BOUND_EXCLUDES` is applied only when `VITEST_EXCLUDE_ENV_BOUND=1`, set in exactly two places (`.github/workflows/unit-suite.yml:122` and `.github/workflows/unit-suite.yml:152`). Measured, same command, only the env differing:

| `VITEST_EXCLUDE_ENV_BOUND` | Result |
| --- | --- |
| unset (developer machine) | 1 file collected, **8 tests pass** |
| `1` (what CI sets) | **`No test files found, exiting with code 1`** |

So the suite already runs locally and is dark in CI only — which is why it rotted unnoticed: it passes for anyone who runs it. Removing the array entry is the correct fix, but it works *by* the env-var path, not by deleting an always-on exclude.

### §5.3 The vacuity risk, measured

`tests/cross-cutting/pg-cron-coverage.test.ts:107` degrades `liveDbTest` to `test.skip` when `psql` is unreachable, and `tests/cross-cutting/pg-cron-coverage.test.ts:130` only warns. Measured against a closed port: **exit 0, "2 passed | 6 skipped"** — the suite reports success having asserted nothing about any live database.

So under `process.env.CI`, an unreachable `psql` is a thrown error, and the suite asserts a non-zero live-DB test count. Locally the skip behaviour is unchanged.

### §5.4 Command assertions

The host embedded in `cron.job.command` is environment-supplied and varies by target — measured at `http://host.docker.internal:3000` on a developer stack, `https://fxav-screenshots-ci.invalid` in CI (`scripts/ci/supabase-local-bootstrap.sh:38`), a real host on validation. Assertions therefore key on the **route path**, which is host-agnostic and is what the suite already does.

Host assertions were **out of scope here** and filed as `BL-PG-CRON-HOST-ASSERTION` (RESOLVED 2026-08-14 by `docs/superpowers/specs/ci/2026-08-14-guard-completeness-wave-design.md` §5, which asserts the dispatch ORIGIN read back from `net.http_request_queue` per target mode; the original `§10.4` cross-ref was a mis-pointer — §10.4 is `BL-CI-VITEST-EXCLUSION-COVERAGE`). Two review rounds could not produce a sound comparison: keying off the target flag proves nothing about the connected database, and comparing against the in-session GUC still admits scheme mismatches, a trailing slash, and base paths. Shipping a host check that passes `http://` against an `https://` GUC would be worse than shipping none.

---

## §6 PR4 — default-config dark specs

### §6.1 `admin-lifecycle-transitions`

> **AMENDED at implementation time.** The spec below planned to ADD this to `.github/workflows/lifecycle-layout-e2e.yml`. It was NOT added: acceptance is five consecutive green runs and this reached 4/5 locally plus one real-CI failure on the Published-toggle round-trip, so §6.1's own pre-ratified fallback applies — "it stays dark with a recorded reason. An admitted flake is worse than a known gap." Both DETERMINISTIC breaks below were fixed and shipped, taking the spec from failing every run to one flaky case; a third repair (the pre-hydration swallow) is also in. The allowlist row is retained carrying that measurement, and `BL-E2E-LIFECYCLE-TRANSITIONS-ROUNDTRIP-FLAKE` records the CI-loop procedure a follow-up should use. Everything from here to the end of §6.1 describes the planned wiring, kept as provenance.
>
> **RESOLVED 2026-07-27 (branch `fix/lifecycle-transitions-roundtrip-flake`).** The round-trip flake was root-caused and repaired — it was never CI slowness: (1) a client commit wedge (React 19 replay-loss class, filed `BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE`, still open as product exposure) is recovered test-side by `expectFlipLanded`'s tiered read-only recovery; (2) the crew re-visit failed closed on a missing `PICKER_COOKIE_SIGNING_KEY` in the workflow env; (3) a nudge-tier Escape leaked to the modal shell's document-level listener (fixed by dropping Escape + a 5s fail-fast modal assert); (4) the kebab was covered by ShareHub's full-viewport backdrop (fixed by closing via the backdrop's own click handler). The spec is wired into `lifecycle-layout-e2e.yml` on `pull_request`, and AC-6's acceptance was met: five consecutive green normal-dispatch runs on 2026-07-27 (30296297785, 30296928109, 30297537395, 30298134455, 30298809756), preceded by a 10/10-samples measurement loop. The allowlist row is deleted; the backlog entry graduated to `BACKLOG-archive.md`.

Add to `.github/workflows/lifecycle-layout-e2e.yml:81`, after repairing **two** distinct failure classes — an earlier draft named only the first, which would have made AC-6 unreachable:

1. **Three pre-hydration click-swallow flakes**, whose failing cases move between runs. Repair with the `toPass` hydration-retry pattern the sibling layout spec already uses.
2. **A deterministic assertion against a retired testid.** `tests/e2e/admin-lifecycle-transitions.spec.ts:305` expects `admin-share-link-inactive`, which **no production module emits** — recorded at `BACKLOG.md` in the phantom-gap probe entry. This fails every run, so no amount of flake work reaches five greens.

   **And it is not a testid rename — the surface appears to be gone.** Verified: the asserted copy, "The crew link is inactive while this show is unpublished.", exists nowhere under `components/`, `app/`, or `lib/`. The nearest surviving string is a *rotation confirmation* at `app/admin/show/[slug]/RotateShareTokenButton.tsx:293` ("Share link rotated. The crew link stays inactive while this show is unpublished or …"), which is a different message in a different control. `admin-current-share-link-unavailable` is also not the replacement: it is an **error** state ("The share-link is unavailable right now. Refresh the page…", `components/admin/showpage/ShareHub.tsx:826`) gated on `published`.

   **History answers it: the removal was deliberate.** `git log -S` locates `d7fa48b9a feat(admin): replace the Overview share cluster with the status-band hub (T4)`, merged on `main`, which deleted the file CurrentShareLinkPanel.tsx from the per-show route (-51 lines; the path is unbackticked because the file no longer exists to cite) and the `admin-share-link-inactive` element with it. That is a ratified redesign, not a regression.

   So PR4 **deletes the assertion and its now-false comment** at `tests/e2e/admin-lifecycle-transitions.spec.ts:303-307`. This is the opposite disposition from §6.2's gallery Escape case, where the handler still exists and the assertion is therefore probably valid — which is the point of diagnosing each rather than applying one rule.

   Worth stating plainly, because it is this cluster's thesis in miniature: **a merged redesign silently broke a spec, and nothing noticed for months** because no workflow ran it. A spec that ran would have failed the redesign's own PR. Acceptance is **five consecutive green runs**; the recorded failure mode is cases that move between runs, so one green proves nothing.

Its allowlist row would have been deleted in the same PR, because that workflow is unfiltered and adding the spec would make it genuinely covered. Since the spec was NOT added (see the amendment above), the row is RETAINED — rewritten to carry the measurement rather than the old generic `UNSEEN` reason.

**Isolation is mandatory when running it**: `E2E_PORT=<free port>` (`playwright.config.ts:8-13`), because `reuseExistingServer` will otherwise attach to a sibling worktree's dev server and test the wrong code, and the spec seeds the shared local database.

### §6.2 `attention-modal-gallery`

Two rotted assertions:

- `tests/e2e/attention-modal-gallery.spec.ts:398` — a substring `getByText` matches 2 elements. Repair: scope to the counter and compare its own text.
- `tests/e2e/attention-modal-gallery.spec.ts:265` — `toHaveCount(0)` after Escape times out. **Cause unknown; do not assume the product changed.** An earlier draft blamed `f4c4bf493`; that is retracted — `components/admin/showpage/AttentionMenu.tsx:81-105` still calls `onClose()` on Escape and the pre-commit handler had the same semantics. Diagnose before touching the assertion.

**Build-vs-runtime gate:** the spec needs the built `ADMIN_DEV_PANEL_ENABLED=true` artifact, a build-time decision, so it stays in the `dev-build` project (`playwright.config.ts:92`).

**No `pull_request` trigger.** `dev-gate-e2e.yml` is `workflow_dispatch`-only by ratification (`.github/workflows/dev-gate-e2e.yml:2-6`, DEFERRED.md B1-D4): three serialized cold builds. PR4 adds a **scheduled** trigger at a maximum interval of 24 hours instead. Consequence, owned honestly: a schedule is not PR-blocking-capable, so the gallery's allowlist row is **rewritten with a schedule reason, not deleted**.

---

## §7 Meta-test inventory

| Meta-test | Status | PR |
| --- | --- | --- |
| tests/e2e/\_metaLiveEntryToolchain.test.ts | **created** — no file names a toolchain binary; only the helper imports `esbuild`; no referenced package script names one | PR1 |
| Tailwind version-parity test | **created** — resolved CLI and `tailwindcss` agree on major and minor | PR1 |
| `tests/ci/_metaE2eWorkflowCoverage.test.ts` | **extended** — every `testMatch` branch resolves; minimal `--config` recognition; allowlist shrinks by 29 rows to 60 | PR2 |
| `tests/ci/_metaE2eWorkflowCoverage.test.ts` (again) | **edited** — PR4 deletes the lifecycle row and rewrites the gallery row, so 60 is PR2's figure, not the final four-PR state | PR4 |
| tests/ci/attentionPillFocusWorkflow.test.ts | **deleted** — it reads a workflow PR2 retires and would redden the required `unit-suite` | PR2 |
| `tests/cross-cutting/pg-cron-coverage.test.ts` | **extended** — CI-hard `psql` requirement, non-zero live-test count | PR3 |

Not touched, with reason: `tests/log/_auditableMutations.ts` (no mutation surface), `tests/auth/_metaInfraContract.test.ts` (no Supabase call boundary), `tests/auth/advisoryLockRpcDeadlock.test.ts` (no lock path).

---

## §8 Acceptance criteria

- **AC-1** The whole standalone config runs green in CI, unfiltered, on every PR; `resolve-label-layout` goes red → green; `packlist-rescan-recovery` is out of the config with a backlog entry.
- **AC-2** **Every** workflow whose `run:` commands resolve exclusively to `standalone.config.ts` members is gone, and every spec they ran is covered by the new job; `_metaE2eWorkflowCoverage` passes with no shadowing row. The retirement set and the allowlist delta are both **derived mechanically at implementation time** from the live tree, not read from a count in this document — every count here has drifted at least once (§4.3 amendment).
- **AC-3** The toolchain guard is red against `main` (33 sites) and green after migration; a recorded mutation turns the `testMatch`-branch guard red.
- **AC-4** `pg-cron-coverage` executes in `unit-suite-db` with a non-zero live-DB test count, and an `x-audits.yml` job runs it against validation.
- **AC-5** Under `CI`, an unreachable `psql` fails the job rather than skipping.
- **AC-6** `admin-lifecycle-transitions` is in a workflow, green five consecutive times, and its allowlist row is deleted. **MET 2026-07-27** (initially NOT MET at PR4 time under this AC's own fallback — 4/5 locally plus one real-CI failure — and closed by the follow-up branch `fix/lifecycle-transitions-roundtrip-flake`): wired into `lifecycle-layout-e2e.yml` on `pull_request`, five consecutive green normal-dispatch runs (30296297785 → 30298809756), allowlist row deleted. See the §6.1 RESOLVED amendment; `BL-E2E-LIFECYCLE-TRANSITIONS-ROUNDTRIP-FLAKE` graduated to `BACKLOG-archive.md`.
- **AC-7** `attention-modal-gallery` passes and fires on a schedule of at most 24 hours; its row is rewritten, not deleted.
- **AC-8** No file under `components/`, `app/`, `DESIGN.md`, or `tailwind.config.*` is modified in any of the four PRs.

---

## §9 Out of scope, and honest ceilings

- **Command-body text matching stays text matching.** A `cron.job` whose `net.http_get(...)` is commented out followed by `select 1;` satisfies every assertion while issuing no request. Proving a job fires needs a per-job smoke test; `BL-PG-CRON-COVERAGE-UNRUN` stays open for that residue.
- **The ~60 app-dependent `UNSEEN` specs** keep their rows.
- **Nothing here detects an unregistered self-contained spec.** The stale-branch check validates the branches that exist; it cannot know about a spec nobody listed. §10.3 is that gap, filed rather than half-guarded.
- **Branch protection is unchanged.**

---

## §10 Descoped, and why — four backlog items

**These are filed in `BACKLOG.md` with the same measurements.** Recorded there deliberately, not only here: a future session picking work greps the backlog, and the whole point of this section is that nobody repeats the four rounds of analysis behind it.

### §10.1 `BL-HARNESS-RESOLVER-POLICY`

A rule-based esbuild plugin (`onResolve` matching server-only specifiers → a CJS proxy stub) was designed, built, and measured. It **works**: all 7 live entries build, all 7 render, no stub is called. It was descoped because its safety *guarantee* could not be made sound in three rounds:

- A proxy can be consumed **without being invoked**: `flags.code === "x"` yields `false`, a truthiness test is always `true`. Silent — no render check or call-counter can see it.
- A strict throw-on-any-read stub fixes that for 4 of 5 probed entries and breaks the fifth: esbuild reads module properties at bundle time to resolve named exports.
- Path rules overmatch, with two named instances: `lib/drive/driveFolderUrl.ts` (a pure string function, reachable today via `lib/adminAlerts/alertActions.ts`, fails **loudly**) and `SHOW_NOT_FOUND` at `app/admin/show/[slug]/_actions/shared.ts:35` (the silent shape — real, but unreachable from any harness today, so **latent**).
- A packages-and-builtins-only rule set has no overmatch surface and fails four times in sequence: `node:fs/promises`, a stub under-export, `HASH_FOR_LOG_PEPPER` at module load, `__dirname`.
- A sentinel-based guard detects only preselected sentinels, so it cannot back the claim it was written to back.

**Trigger:** a second harness entry reaching the server tree, or a decision to invest in a graph-derived rule (stub a module iff it transitively imports a server-only package) rather than a path heuristic.

> **Superseded (2026-07-31, ci-dark descoped close-out PR-C).** Resolved by a
> DIRECTIVE rule rather than the path/graph heuristics weighed above:
> `tests/e2e/helpers/useServerDirectivePlugin.mjs` stubs a module iff its own
> prologue cooks to `"use server"` (a real TypeScript parse of the authoritative
> Next signal — no path matching, no proxy). Each unsoundness above dissolves:
> the stub THROWS on any property read or call (the "consumed without invocation"
> silent path is gone; contract-tested with a disabled-plugin mutation control),
> and there is no path rule to overmatch (`driveFolderUrl.ts` / `SHOW_NOT_FOUND`
> carry no directive, so they are never touched). Contract-tested at the build
> boundary over 18 fixtures and consolidated across both harness bundlers.
> Graduated in `feat/ci-dark-directive-resolver`; see the close-out spec §5.

### §10.2 `BL-HARNESS-PACKLIST-SERVER-GRAPH`

Removed from the config in PR1 (§3.1) because its entry reaches `googleapis` (913 graph inputs) and `postgres` through `"use server"` boundaries, and no per-module alias list fixes it. Restoring it needs either §10.1 or a trimmed import graph for `step3ReviewSections.tsx`. Full chain and the ten `lib/sync` importers are in §3.1.

> **Superseded (2026-07-31, ci-dark descoped close-out PR-C).**
> `packlist-rescan-recovery.spec.ts` is back in `tests/e2e/standalone.config.ts`'s
> testMatch under the §10.1 directive resolver: it stubs every `"use server"`
> boundary by class, so the whole `googleapis` / `postgres` / `google-auth-library`
> subtree drops out. The import-graph reality check measured 0 inputs under those
> packages on this exact entry (1909 total). Graduated in
> `feat/ci-dark-directive-resolver`.

### §10.3 `BL-CI-UNREGISTERED-SELF-CONTAINED-SPEC`

Two definitions were tried and both fail. "Calls the toolchain helper" is neither necessary nor sufficient. "Imports `node:http`/`node:https`" misses harnesses that boot no server — `tests/e2e/phantomGapHelper.layout.spec.ts` uses `page.setContent`, and `data:` navigation and route-fulfillment harnesses evade it identically. **Trigger:** a new standalone spec discovered dark, which is the event this would have prevented.

### §10.4 `BL-CI-VITEST-EXCLUSION-COVERAGE`

Three formulations failed. Matching a filename in a `run:` block counts `echo`, comments, and dead branches. Applying capability checks to an alias body cannot distinguish a runner argument from arbitrary shell (`false && vitest run <f>`, `true || …`, `if false; then`). Resolved-config inclusion is decidable but must resolve **under the CI env** (§5.2a), and pairing it with a `--project` run reintroduces the shell problem for the run half.

Today `tests/admin/test-auth-gate.test.ts` runs nowhere and `tests/cross-cutting/email-canonicalization.test.ts` runs only in a job with a job-level `if:` and a `| tee` — both invisible to any check built so far. **Trigger:** a third entry joining that array, or a dark-exclusion incident.

Also filed: the stale "only `quality` is required" comment at `tests/ci/_metaE2eWorkflowCoverage.test.ts:12` (§2.5), a one-line docs fix PR2 records.

---

## §10a Review record, and an honest gap in it

Five completed cross-model rounds: **46 accepted findings, none disputed** (11 / 10 / 7 / 9 / 9). Round 5 returned BLOCKING and its two blockers were self-inflicted by the descope — the whole-config command being invisible to the scanner, and a guard forbidding its own helper. Both are repaired and the first is measured.

**Round 6 never produced a verdict, and this spec ships without one.** Three consecutive dispatches died as infrastructure faults, not reviews:

| attempt | outcome |
| --- | --- |
| r6 | read the whole document, then died. Its last message recorded that the worktree had moved underneath it mid-review (my own commits) and that it was falling back to `git show` |
| r6b | died ~1 minute in, tree frozen |
| r6c | died, third consecutive |

Not the reaper — the hook's last-action file under ~/.claude/hooks/ (per-machine, untracked) logged "gated: 5 live codex tree(s) active; no orphans" with an empty kill log. The box was at **load 11.1 with 10 concurrent Claude sessions** and 4 Codex processes, which is the likelier cause and is also the condition under which `feedback_contended_box_invalidates_perf_measurements` says results stop being trustworthy.

Per the `AGENTS.md` ladder — `no_verdict` is an infrastructure fault and bounded retries do not change escalation policy — round 6 was replaced by an **inlined adversarial pass**, recorded here rather than presented as an approval. It produced two findings, both applied above:

1. The exact-string `--config` rule needed an explicit statement that it changes **spec extraction only**, leaving every capability check (`if:`, `continue-on-error`, path filters, exit suppression) in force. Without that, a reader could conclude the literal match bypasses qualification.
2. "The retiring workflows lose no coverage" was an assertion. It is now a script over the live workflow files, re-run at PR2 branch time: 11 spec invocations resolved across the seven, every one a member of the standalone config.

**What this does not substitute for:** an independent model attacking the descoped design fresh. The plan for PR1 gets its own cross-model round, and if the box is quieter it will exercise much of the same surface.

## §10b Honest ceiling: environment-dependent narrowing

Recorded because four adversarial rounds converged here, and a future reader
should not mistake silence for coverage.

The guards prove that **under the environment they can construct**, the config
resolves to exactly the 30 spec files whose allowlist rows this PR deletes.
Membership is Playwright's own `--list` output, so every narrowing knob —
`projects[].testMatch`, `testIgnore`, `testDir`, an empty `projects: []`,
`grep`/`grepInvert` — is resolved by Playwright rather than modelled, and a
separate assertion requires that resolved set to equal what the top-level
`testMatch` declares.

What remains unprovable locally: a config that narrows on a variable only
GitHub sets. The probe pins `CI` and `GITHUB_ACTIONS` and asserts the matcher
is identical with and without them, but a branch on `GITHUB_EVENT_NAME`, on
any other runner default, or on workflow/job/step `env` would be invisible to
any local probe **by construction** — the CI environment is not reproducible
here. Enumerating variables is the same losing game rounds 1–3 lost.

Filed as BL-CI-ENV-DEPENDENT-CONFIG-NARROWING with that measurement. The
mitigation that actually holds is procedural and already in place: the job is
unfiltered and runs the whole config on every PR, so a config that narrowed
under Actions would show a reduced test count in the run log.

> **Superseded (2026-07-27, ci-dark descoped close-out PR-A).** This ceiling
> no longer holds: the descoped close-out spec
> (`2026-07-26-ci-dark-descoped-closeout-design.md` §4) shipped the
> verify-in-the-environment guard — the standalone config emits a JSON run
> report, and `scripts/check-standalone-baseline.mjs` compares the CI run's
> own executed spec-file list and total executed-test count against the committed
> `tests/e2e/standalone-baseline.json` as a post-run workflow step. A config
> that narrows only under Actions now reds the `standalone-e2e` job on its
> own report. The paragraph above stays as the record of why local probing
> could not get here.

---

## §11 Risks

| Risk | Mitigation |
| --- | --- |
| Retiring the per-feature workflows drops coverage the new job does not provide | The stale-branch check and the row deletion land in the same commit; the shadowing assertion fails if a retired spec is neither covered nor allowlisted. The full config is run locally before the retirement commit (measured: 404 passed, exit 0). |
| `ENV_BOUND_EXCLUDES` edit reddens `unit-suite`, a live required context (§2.5) | One array entry; the suite is proven green against a bootstrapped local DB first; `unit-suite.yml` has `workflow_dispatch`, so it is verified by a real Actions run before merge. |
| The unfiltered job slows every PR | Measured 3.3 min at implementation time (1.9 min when first measured, before the config grew), DB-free and build-free; replaces seven jobs that each pay the same setup. |
| Removing `packlist-rescan-recovery` loses coverage | It is dark today, so nothing that runs is lost; §10.2 records the restoration path with its full diagnosis. |
| `admin-lifecycle-transitions` stays flaky | AC-6 requires five consecutive greens; if it cannot reach that, it stays dark with a recorded reason. An admitted flake is worse than a known gap. |
