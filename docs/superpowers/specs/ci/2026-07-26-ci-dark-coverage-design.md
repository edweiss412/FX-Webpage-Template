# CI-dark coverage — wiring the suites that run in no CI job

**Date:** 2026-07-26 · **Branch family:** `feat/ci-dark-coverage` (4 PRs) · **Class:** CI wiring / test-coverage integrity
**Backlog items closed:** `BL-STANDALONE-CONFIG-CI-DARK`, `BL-E2E-LIFECYCLE-SPECS-CI-DARK`, `BL-CRON-REGISTRY-MIGRATION-PARITY`
**Partially closed, stays open:** `BL-PG-CRON-COVERAGE-UNRUN` — the suite gets wired and its vacuity hole closed, but the per-job smoke-test residue that entry also owns is out of scope (§9), so the item is not graduated to the archive.
**Partially closed, stays open:** `BL-DEV-GATE-GALLERY-SPEC-ROT` — the two rotted assertions are repaired and the gate gains a scheduled trigger, but the spec still does not run on PRs (§6.2), which is the item's stated end state.

<!-- spec-lint: not-ui — no UI surface is modified; the app/ and components/ citations are incidental (they appear only in scope-exclusion statements and a workflow path filter that this spec then removes). Ratified §1.1. -->

Files this spec CREATES are written unbackticked (tests/e2e/helpers/liveEntryBundle.ts, tests/e2e/\_metaLiveEntryToolchain.test.ts, .github/workflows/standalone-e2e.yml) so they are not read as citations to existing code.

---

## §1 Problem

A test that no workflow invokes is not coverage. It is a file that once passed. The repo has three independent mechanisms by which a suite goes dark, and each has produced a live defect:

1. **A Playwright config nothing invokes.** `tests/e2e/standalone.config.ts` holds an explicit `testMatch` allow-list (`tests/e2e/standalone.config.ts:35`). Specs in it are unreachable via the default config, so `pnpm exec playwright test tests/e2e/<one>.spec.ts` reports `No tests found` — a failure that reads as a bad path, not a missing project.
2. **A workflow run-list nothing added to.** `tests/e2e/admin-lifecycle-transitions.spec.ts` is matched by the `mobile-safari` project (`playwright.config.ts:64`) but named by no workflow.
3. **A vitest exclusion nobody watches.** `tests/cross-cutting/pg-cron-coverage.test.ts` is listed in `ENV_BOUND_EXCLUDES` (`vitest.projects.ts:48`) with a comment claiming it "runs against the validation project." Nothing runs it.

The cost is not theoretical. Measured 2026-07-26 (§2.3): two dark standalone specs are **red on `main` right now**, and the mechanism is exactly the rot this class predicts — a shared harness entry grew a Node-builtin import, the specs that CI runs were given stub aliases, and the dark copies were never updated because nothing observed them break.

### §1.1 Resolved scope — do not relitigate

Ratified with the owner during brainstorming 2026-07-26. A reviewer may verify these against the cited lines; re-deriving them is out of scope.

| Decision | Ratification |
| --- | --- |
| Scope is the standalone-Playwright half **plus** the cron half. The ~60 app-dependent `UNSEEN` specs stay allowlisted with reasons — they need a booted app + seeded Supabase, a different CI-minutes class. | Owner, brainstorming Q1 |
| The live-entry toolchain fix covers **every** call site, including specs already wired into CI — not just the two red ones. Per-instance patching is the class-sweep anti-pattern in `AGENTS.md`. | Owner, brainstorming Q2 |
| One whole-config workflow; the five per-feature standalone workflows are **retired**, not kept alongside. Their hand-maintained component `paths:` lists are a rot surface being deleted, not reproduced. | Owner, brainstorming Q3 |
| The new standalone workflow carries **no** `pull_request.paths` / `paths-ignore` filter. This is forced by the scanner contract (§4.2), not a preference. | This spec §4.2 |
| The new e2e jobs are advisory at the GitHub layer; enforcement is the ship pipeline's all-checks-green gate. **Not** because "only `quality` is required" — that in-repo claim is stale (§2.6) — but because none of the new or retired jobs is in the live required set. | §2.6, measured |
| `cron.job.command` assertions remain text matching. Proving a job *fires* needs a per-job smoke test and stays open (§9). | `BACKLOG.md` `BL-PG-CRON-COVERAGE-UNRUN`, whole-diff R18 |
| No UI surface is touched. No file under `components/`, no file under `app/` except none, no `app/globals.css`, no `DESIGN.md`, no `tailwind.config.*`. The invariant-8 impeccable dual-gate therefore does **not** apply, and there are no Dimensional Invariants or Transition Inventory sections because no component renders. | `AGENTS.md` invariant 8 scope definition |
| No DB migration, no `pg_advisory*` call path, no `SECURITY DEFINER` RPC. Invariant 2's holder-topology rule is N/A. | This spec §5 |

---

## §2 Measured inventory

Every number in this document is defined here once and referenced elsewhere. Measured 2026-07-26 against `origin/main` at `b09cfa6c6`. **Re-derived after a mid-flight rebase**: `origin/main` advanced 70 commits during spec authoring, including PR #598, which added `tests/e2e/share-link-flash.spec.ts` **and its own dedicated path-gated workflow** — a sixth instance of the exact rot surface §4.3 retires, created while this spec was being written. Every number below is post-merge.

### §2.1 e2e spec coverage

| Quantity | Value | Source |
| --- | --- | --- |
| `tests/e2e/*.spec.ts` files | 88 | `ls tests/e2e/*.spec.ts \| wc -l` |
| Rows in `LOCAL_ONLY_ALLOWLIST` | 87 | `tests/ci/_metaE2eWorkflowCoverage.test.ts:36` |
| — of which `UNSEEN` | 64 | same |
| — of which `PATH_GATED` | 20 | same |
| — of which `PATH_GATED_BY_EXCLUSION` | 2 | same |
| Specs covered with no allowlist row | 1 (`admin-lifecycle-layout`) | `tests/ci/_metaE2eWorkflowCoverage.test.ts:156` |

### §2.2 The standalone config

| Quantity | Value |
| --- | --- |
| Alternation branches in `testMatch` (`tests/e2e/standalone.config.ts:36`) | 29 |
| — resolving to an existing spec file | 28 |
| — **stale** (`overrideableField.layout`, no such file) | 1 |
| Branches named by some workflow's run command | 12 |
| Branches named by no workflow (**dark**) | 17 |
| — of which correspond to a real file | 16 |
| Real branches carrying a `LOCAL_ONLY_ALLOWLIST` row today | 28 (all of them) |
| Allowlist rows remaining after PR2 | 59 |

Note the two different counts, which are easy to conflate: **16** specs go from dark to covered, but **28** allowlist rows are deleted. The extra 12 are the branches already covered — every one of them by a *path-filtered* workflow, which the scanner classifies as not-PR-blocking-capable and which therefore still carries a `PATH_GATED` row today. An unfiltered whole-config job covers them properly, so their rows must go too or the shadowing assertion (`tests/ci/_metaE2eWorkflowCoverage.test.ts:153`) fails.

The 11 covered branches: `skeletonBandParity`, `stackedBandLayout`, `statusStripToggleLayout`, `step3-review-modal.layout` (`.github/workflows/modal-header-layout-e2e.yml:106` via `pnpm test:e2e:modal-header`), `attention-anchor-placement` (`.github/workflows/attention-anchor-e2e.yml:56`), `attention-pill-focus` (`.github/workflows/attention-pill-focus-e2e.yml:74`), `bulk-ignore-eyebrow.layout` (`.github/workflows/bulk-ignore-eyebrow-e2e.yml:52`), `hoverhelp-geometry` (`.github/workflows/hoverhelp-geometry-e2e.yml:57`), `phantomGapHelper.layout` (`.github/workflows/phantom-gap-e2e.yml:158`), plus `step3-review-modal.interactions` and `published-review-modal.layout`, which run under the **default** config's `desktop-chromium` project (`.github/workflows/step3-live-bundle.yml:70`, `.github/workflows/published-modal-e2e.yml:149`) rather than the standalone config.

### §2.3 Baseline run of the 16 dark specs

Executed 2026-07-26 in a clean worktree off `origin/main`:

```
pnpm exec playwright test --config tests/e2e/standalone.config.ts <the 16 dark spec paths>
→ 51 passed, 2 failed, 1 did not run (1.6m)
```

Both failures are the same class — a browser bundle reaching a Node-only module — but by **different import chains**, which matters because it means the remedy is a shared list, not a single alias:

| spec | unresolved | importer |
| --- | --- | --- |
| `resolve-label-layout` | `node:crypto` | `lib/parser/warnings.ts` → `lib/parser/useRawContentHash.ts:1` |
| `packlist-rescan-recovery` | `node:crypto` | `lib/email/hashForLog.ts:1` |
| `packlist-rescan-recovery` | `node:async_hooks` | `lib/log/requestContext.ts:2` |
| `packlist-rescan-recovery` | `os`, `fs` | the `postgres` driver, reached transitively |

### §2.3a Bare-environment run

The same config run with all nine server env vars unset: **221 passed, 4 failed, 57 did not run** (the 57 are tests inside the 4 failing files; all 27 spec files reported at least one result). The four are the two esbuild failures above, which are env-independent, plus `step3-review-modal.interactions` and `step3-review-modal.layout`, which die at module load with `HASH_FOR_LOG_PEPPER env var must be set to a 32+ character value`.

So **23 of 27 specs need no server env at all**, and the env dependency is 2 specs, not the 4 that the workflow being retired supplies it to. This is the measurement §4.1's env handling is designed against.

### §2.3b Full-config baseline with the env supplied

The same config with the nine variables set to the values `.github/workflows/modal-header-layout-e2e.yml:74` already uses: **286 passed, 2 failed, 1 did not run, 1.9 min**. The only failures are the two esbuild specs from §2.3.

This is the load-bearing number for the whole cluster: once PR1 lands, the entire standalone config is expected green, which is what makes PR2's unfiltered job safe to run on every PR. Any other red at PR2 time is a regression introduced between now and then, not pre-existing rot.

### §2.4 Live-entry toolchain census

| Quantity | Value |
| --- | --- |
| Spec files shelling `pnpm dlx esbuild@0.28.0` | 8 |
| — carrying **both** stub aliases (`node:crypto`, `next/navigation`) | 2 |
| — carrying neither | 6 |
| — of those 6, red today | 2 |
| — of those 6, green only because their entry graph does not yet reach a Node builtin (**latent**) | 4 |
| Spec files shelling `pnpm dlx @tailwindcss/cli@4.2.4` | 25 |

The 8 esbuild sites: `blocked-row-resolver-transitions`, `bulk-ignore-eyebrow.layout`, `collapse-panel-morph`, `compact-alert-card-layout`, `hoverhelp-geometry`, `packlist-rescan-recovery`, `resolve-label-layout`, `wizard-blocker-modal.layout`. The two with stubs are `compact-alert-card-layout` and `hoverhelp-geometry` — **both currently CI-wired**, which is precisely why they were repaired and the others were not.

Decisive asymmetry: `resolve-label-layout.spec.ts:68` and `compact-alert-card-layout.spec.ts:68` bundle **the same entry file** (`tests/e2e/_compactAlertCardLiveEntry.tsx`) with the same flags; the latter additionally passes `--alias:node:crypto=tests/e2e/_nodeCryptoStub.ts` and `--alias:next/navigation=tests/e2e/_nextNavigationStub.ts`. That is the whole difference between green and red.

### §2.5 Dependency availability

| Package | Declared | Installed | Consequence |
| --- | --- | --- | --- |
| `esbuild@0.28.0` | `package.json:107` (devDependency, exact pin) | yes | The 8 `dlx esbuild@0.28.0` calls fetch a package already on disk at the identical version. Pure waste plus a network dependency. |
| @tailwindcss/cli 4.2.4 | **not declared** | no (`node_modules/@tailwindcss/` holds only `postcss`) | The 25 `dlx @tailwindcss/cli` calls are a genuine network fetch with no local equivalent. Must be added as a pinned devDependency before the job can be trusted offline. |
| `tailwindcss` | `package.json:119` (`^4`) | yes | Different package from `@tailwindcss/cli`; not a substitute. |

### §2.6 Branch protection — measured, because the in-repo claim is stale

`tests/ci/_metaE2eWorkflowCoverage.test.ts:11` states that branch protection "deliberately requires ONLY the `quality` context." That is **false today**. Read live from the GitHub API, `main` requires **twelve** contexts:

```
quality, unit-suite, x1-catalog-parity, x2-no-raw-codes, x3-trust-domain,
x4-no-global-cursor, x5-email-canonicalization, x6-pg-cron-pivot,
validation-schema-parity, affordance-matrix-parity, postgrest-dml-lockdown,
traceability-audit
```

`scripts/generate-traceability.ts`'s `loadRequiredChecksFromSpec()` independently resolves eight of those, so the repo has two disagreeing internal sources and neither matches the live setting exactly. This spec relies on the live setting.

Three consequences, all load-bearing:

1. **None of the five retiring workflows is a required context**, so §4.3's retirements cannot break merges. Independently confirmed: no workflow declares a `needs:` on any of them either.
2. **`unit-suite` IS required.** PR3 edits `ENV_BOUND_EXCLUDES`, which lands in that job, so PR3 modifies a merge-blocking check — the §10 risk row and its `workflow_dispatch` verification requirement are not precautionary, they are mandatory.
3. The new standalone job is advisory because it is not in that list, not because the required set is a single context.

The stale comment is left for a follow-up rather than edited here: correcting it is a one-line docs change in a file PR2 already touches, and PR2 records it.

---

## §3 PR1 — live-entry harness toolchain

### §3.1 The unit

New module tests/e2e/helpers/liveEntryBundle.ts exporting two functions:

- `bundleLiveEntry({ entry, outFile })` — calls esbuild's **JavaScript API** (`import * as esbuild from "esbuild"`) with the canonical options and the server-only resolver plugin (§3.2). Not the CLI, not `execFileSync`, not `dlx`: no subprocess, no network, no version literal, and the alias policy becomes a data structure instead of a list of shell flags.
- `buildEntryCss({ sources, outFile })` — runs the CLI (newly a pinned devDependency, §3.3) as `pnpm exec tailwindcss`, taking the `@source` list each harness needs and **reading `app/globals.css` itself**. Verified: all 25 CSS call sites pass exactly `-i` and `-o` with no other flags, and all 25 read `app/globals.css` and append it to the generated entry CSS — so the helper absorbs that duplication entirely and no call site needs an escape hatch.

The two differ deliberately and the spec must not blur them: `bundleLiveEntry` uses the **in-process esbuild API** and spawns nothing; `buildEntryCss` **does** shell out, because the Tailwind CLI has no equivalent in-process entry point. So the module depends on `esbuild` and, for the CSS half only, `node:child_process` plus the local `tailwindcss` binary. Both are synchronous and callable from a spec's `beforeAll`; they take an entry/source list and an output path; nothing else in the repo imports them.

### §3.2 Canonical alias list

A per-module alias list was the first design and **it was measured and rejected** (§3.2a). What replaces it is one rule: _a server-only module never belongs in a browser harness bundle._ An `onResolve` plugin matches server-only specifiers and an `onLoad` handler returns a stub.

`SERVER_ONLY` — one exported array of patterns, the whole policy:

| Pattern class | Examples |
| --- | --- |
| Server-only packages | `googleapis`, `postgres`, `google-auth-library` |
| Node builtins | `node:crypto`, `node:async_hooks`, `node:fs`, `os`, `net`, `tls`, … |
| Server Action modules | any specifier containing `_actions/` |
| Server-only app layers | `@/lib/drive/…`, `@/lib/auth/…`, `@/lib/supabase/server` |

**`@/lib/sync/…` is deliberately NOT in that list**, and the reason is measured (§3.2b): that directory holds server orchestration *and* client-safe helpers, so a path prefix cannot separate them. It is also unnecessary — the server tree is reached **through** `_actions/`, so stubbing the action boundary already cuts it.

### §3.2c The path rules are a measured compromise, not a claim of precision

The remaining path rules (`_actions/`, `@/lib/drive/`, `@/lib/auth/`, `@/lib/supabase/server`) **can** overmatch: the `index.ts` and `shared.ts` files under an `_actions/` directory are not themselves `"use server"` modules, and `lib/drive` exports client-used pure helpers such as `driveFolderUrl`. That is a real property of this rule set and is recorded rather than denied.

A packages-and-builtins-only rule set — no path rules at all — was built and measured as the alternative, because it would have no overmatch surface. It does not work:

| Rule set | Result |
| --- | --- |
| packages + builtins only | `_packListRescanLiveEntry` fails: `node:fs/promises` unresolved |
| \+ builtin subpaths | fails: `_nextNavigationStub` lacks `forbidden` / `redirect` |
| \+ completed nav stub | builds, then **throws at module load**: `HASH_FOR_LOG_PEPPER env var must be set` |
| \+ the single named module `@/lib/auth/requireAdmin` | builds, then throws `__dirname is not defined` |

Each removal of a path rule exposed a new module-load failure in a chain the rule had been cutting. Three iterations in, this is the same-vector recurrence the repo's own discipline says to stop patching, so the rule set stays as measured at §3.2b and the limitation is stated here instead of being iterated away.

**The render check is necessary but NOT sufficient, and an earlier draft of this section overclaimed it.** It said a stubbed module "only matters if a render path calls it". That is false. A proxy can be *consumed without being invoked*: `flags.code === "show_not_found"` compares a proxy and quietly yields `false`; a truthiness test on it is always `true`; a destructured constant becomes a proxy. None of those throws, none produces a page error, and the harness renders — while asserting against behaviour the stub altered. Neither the render check nor a call-counter can see it.

A strict stub that throws on **any** property read was built and measured as the answer. It works for 4 of 5 probed entries with byte-identical DOM and zero errors, and it fails on the fifth: esbuild reads module properties at bundle time to resolve named exports, so `_packListRescanLiveEntry` no longer builds. That is the third stub mechanism measured, after §3.2a's alias table and §3.2c's packages-only rule set.

**The residual has two named instances, and they differ in severity — measured, not assumed:**

| instance | reachable from a harness today | failure mode |
| --- | --- | --- |
| `lib/drive/driveFolderUrl.ts` — a pure string function (`folderId` in, a Drive URL out, no server dependency) sitting under the stubbed `@/lib/drive/` | **yes**, via `lib/adminAlerts/alertActions.ts` on the alert-card render path | **loud** — a call throws |
| `SHOW_NOT_FOUND` (`{ok:false, code:"show_not_found"}`) at `app/admin/show/[slug]/_actions/shared.ts:35` | **no** — nothing under `components/` or `lib/` imports `_actions/shared` or `_actions/index` | **silent** if it ever becomes reachable |

So the silent class is **latent, not live**: the constant exists and would compare wrong, but no harness can reach it today. The live overmatch fails loudly. That is the honest severity statement, and it tells the guard exactly what to watch — `_actions/` because a future import turns the latent case live, `@/lib/drive/` because it is live now.

So the residual is **stated, not closed**: a module overmatched by a path rule and consumed for a *value* rather than a call is a silent wrong-behaviour risk. Three things bound it, and none of them is "we checked that it renders":

1. Only four path rules exist (§3.2), each covering a directory whose modules are overwhelmingly server-only.
2. §3.4 case 5 is strengthened to exercise **the overmatched directories themselves**, with named fixtures rather than an abstract requirement: a bundle must contain the real `drive.google.com/drive/folders/` literal from `lib/drive/driveFolderUrl.ts` (not the stub), and must resolve a client-safe export under `_actions/` to the real module. An earlier draft tested only an unrelated adjacent module, which proved nothing about the rules actually in force.
3. A harness needing a value from a stubbed path adds one narrow exception rather than widening a rule, and case 5 fails loudly if a rule swallows something client-safe. **That escape hatch has its first real user**: `@/lib/drive/driveFolderUrl` is excluded from the rule, landed together with the guard so case 5 passes on day one instead of documenting a known-red state.

What this does not give is a proof that no future harness consumes a stubbed value silently. That is recorded in §9 as a live limitation of the design, not as a solved problem.

`next/navigation` stays a real alias to `tests/e2e/_nextNavigationStub.ts`, because the harness needs working values (`usePathname()` → `"/admin"`), not a throw.

**The stub is a CJS proxy, and that choice is load-bearing.** It is emitted as CommonJS so esbuild can satisfy **any** named import without the stub enumerating exports; every property access returns the same proxy, so `a.b.c` resolves, and it throws only when actually **called** or constructed. This structurally eliminates the stub-drift defect class — measured twice in this codebase:

- `tests/e2e/_nodeCryptoStub.ts:7` exports only `createHash`, but `lib/email/hashForLog.ts:1` imports `{ createHash, createHmac }`.
- `tests/e2e/_nextNavigationStub.ts` exports no `forbidden` and no `redirect`, but `lib/auth/requireAdmin.ts:23` imports both.

Both are the same bug as §2.3: a hand-maintained list that the import graph outgrew. A per-module alias table would require fixing each by hand and would rot again; the proxy cannot.

### §3.2a Why the alias table was rejected — measured

Probed directly, both entries, local esbuild:

| Approach | `_compactAlertCardLiveEntry` | `_packListRescanLiveEntry` |
| --- | --- | --- |
| 4-entry alias list (`node:crypto`, `node:async_hooks`, `next/navigation`, pg driver) | builds, 903 kb | **78 errors** |
| Rule-based plugin + CJS proxy stub | builds, 926 kb | **builds, 1093 kb** |

The alias list fails on packlist because that entry's graph reaches the entire server tree. Traced via esbuild metafile:

```
tests/e2e/_packListRescanLiveEntry.tsx
  -> components/admin/wizard/step3ReviewSections.tsx
  -> components/admin/UseRawControlBoundary.tsx        (imports at :33 and :34)
  -> app/admin/show/[slug]/_actions/useRaw.ts          ("use server")
  -> lib/sync/runManualSyncForShow.ts -> lib/sync/runScheduledCronSync.ts
  -> googleapis   (913 graph inputs)
```

`lib/sync/lockedShowTx.ts` reaches the `postgres` driver by a parallel edge, which is where `os` and `fs` came from. Next erases the `"use server"` boundary at build time; raw esbuild follows it.

Stubbing that one boundary is not enough either — after aliasing both `UseRawControlBoundary` imports, **ten** distinct `lib/sync/*` modules still pulled in `postgres`. The boundary count is what makes enumeration the wrong shape and a rule the right one.

### §3.2b Rendered, not just built — and what that caught

Building proves nothing about runtime. Each plugin-built bundle was therefore loaded in real headless chromium and inspected for page errors, console errors, rendered DOM, and whether any stub was **called**:

| entry | rendered DOM (chars) | errors | server-only stub called |
| --- | --- | --- | --- |
| `_blockedRowResolverLiveEntry` | 580 | 0 | no |
| `_bulkIgnoreEyebrowLiveEntry` | 1652 | 0 | no |
| `_collapsePanelMorphLiveEntry` | 672 | 0 | no |
| `_compactAlertCardLiveEntry` | 15460 | 0 | no |
| `_hoverHelpGeometryLiveEntry` | 733 | 0 | no |
| `_packListRescanLiveEntry` | 1176 | 0 | no |
| `_wizardBlockerModalLiveEntry` | 194 | 0 | no |

**This pass caught a real defect that every build had hidden.** With `@/lib/sync/…` in `SERVER_ONLY`, `_packListRescanLiveEntry` built successfully and then died at runtime — `(0 , import_pullSheetOverride.overrideSnapshotsEqual) is not a function`, rendering an empty root — because the rule had stubbed a pure helper the harness genuinely renders with. Removing that one over-broad rule took it from 0 to 1176 rendered characters and left every other entry unchanged.

So the design claim is now measured end-to-end: all 7 entries build, all 7 render, and **no render path calls a server-only module**, which is the precondition the throw-on-call proxy depends on.

**Remaining honest limit:** rendering an entry is still not the same as its spec's assertions passing. §3.5 step 4 runs the suite, and that is what closes the last gap.

**Guard conditions.** `bundleLiveEntry` throws a named error when `entry` does not exist on disk (rather than surfacing esbuild's resolution error), when `outFile`'s directory does not exist, and when the local binary is absent. An empty `sources` array passed to `buildEntryCss` is an error, not a silent empty stylesheet — an empty stylesheet renders an unstyled harness whose layout assertions would fail confusingly rather than loudly.

### §3.3 Dependency pinning

Add `"@tailwindcss/cli": "4.2.4"` to `devDependencies` as an exact pin (matching the version the 25 call sites already request), so `buildEntryCss` resolves locally. This closes `BL-STANDALONE-CONFIG-CI-DARK`'s stated blocker ("`pnpm dlx esbuild@0.28.0` … pin or vendor that dependency before putting it in a required job") for both binaries, and generalises it: the blocker was recorded against one spec and actually applied to 33 call sites across 26 files.

### §3.4 Structural defense

New meta-test tests/e2e/\_metaLiveEntryToolchain.test.ts, filesystem-walked over `tests/e2e/**` so a new spec fails by default. The scan covers the **helper itself**, not only the specs — otherwise the helper could regress to `dlx` while the guard stayed green:

1. **The toolchain is invoked from exactly one place.** An earlier draft banned `child_process` imports outright under `tests/e2e/**`. That rule is **unsatisfiable and is withdrawn**: `buildEntryCss` itself shells out, and twelve existing files legitimately spawn subprocesses for DB seeds, locked `psql` fixtures, and tsx render harnesses — `screenshots-help-setup.ts`, `help-docs-setup.ts`, `tests/e2e/helpers/devCaptureStaged.ts`, `tests/e2e/helpers/lockedCrewRestriction.ts`, `skeletonBandParity.spec.ts`, `dataQualityBadge.layout.spec.ts`, `autoAppliedCardGrid.layout.spec.ts`, `step3-review-modal.layout.spec.ts`, `statusStripToggleLayout.spec.ts`, `step3-review-modal.interactions.spec.ts`, `stackedBandLayout.spec.ts`, `published-review-modal.layout.spec.ts`. None of them touches the toolchain, and banning their idiom would leave the meta-test red after a correct migration.

   The check is therefore scoped to the thing actually being centralized: **no file under `tests/e2e/**` other than the helper may name a toolchain binary** (rule 2), and the helper is the only file permitted to invoke one. Subprocess use for any other purpose is untouched.

   Naming a binary is not the only bypass, so two more are closed: **no file under `tests/e2e/**` except the helper may import `esbuild`** (a spec could otherwise call the JS API directly and skip the resolver policy entirely), and **no `package.json` script referenced from `tests/e2e/**` may name a toolchain binary** (moving the invocation just outside the scanned tree would otherwise satisfy a filesystem-only scan).
2. **No file names a toolchain binary as a command string** — `esbuild`, `@tailwindcss/cli`, **or `tailwindcss`**. The third spelling is the one that matters and is easy to omit: `pnpm view @tailwindcss/cli@4.2.4 bin` returns `{ tailwindcss: 'dist/index.mjs' }`, so the package's executable is named `tailwindcss`, and the helper invokes `pnpm exec tailwindcss`. A guard forbidding only the two package names would miss the exact invocation it exists to prevent. (No collision: the `tailwindcss` package itself declares no `bin` in v4 — the CLI was split out, which is why the `dlx` calls exist at all — so the name resolves unambiguously once `@tailwindcss/cli` is a devDependency.)
3. **The helper's options are asserted against the resolved policy, not its source text.** The test imports `SERVER_ONLY` and the built options object from the helper and asserts the plugin is present and the policy array is the one the helper actually passes to esbuild — per `feedback_structural_guards_assert_resolved_config`, a source scan of the helper would pass while the value handed to esbuild differed.
4. **A behavioral case proves the policy is applied**: bundle a fixture entry importing a server-only module, and assert the output contains the stub's throw string and does not contain a marker string from the real module. A build that merely succeeds does not prove the plugin ran.
5. **An over-match case pins the rule set in the other direction**: a fixture importing a **client-safe** helper from a directory adjacent to a stubbed boundary must resolve to the REAL module, asserted by a marker string from it appearing in the output. Without this, a future broadening of `SERVER_ONLY` silently re-creates the §3.2b defect — and every bundle would still build, so nothing else in CI would notice.

Case 4 answers the hole in the §3.5 positive test: a bundle can also succeed via a network-backed `dlx`, so "it built" is not evidence the helper's policy was used.

### §3.5 Test plan (TDD order)

1. Red: the new toolchain meta-test fails against `main` (33 violating call sites).
2. Red: a unit test of `bundleLiveEntry` asserting it bundles **both** `_compactAlertCardLiveEntry.tsx` and `_packListRescanLiveEntry.tsx` with no resolution errors — fails before the helper exists. Both are already proven buildable under the §3.2 design (§3.2a), so a failure here is a helper defect, not a discovery.
3. Green: implement the helper, add the `@tailwindcss/cli` devDependency and the version-parity test, migrate all 8 esbuild sites and all 25 CSS sites.
4. Verify **by running the specs, not by rebuilding them**: the full standalone config green locally, with `resolve-label-layout` and `packlist-rescan-recovery` going red → green **without either spec being edited except to call the helper**. §2.3b is the baseline to beat: 286 passed / 2 failed becomes 288 / 0. This step is what converts §3.2a's build-success evidence into pass evidence — a proxy that throws on call is only correct if no render path calls a server-only module, and only the suite can show that.

The concrete failure mode this PR catches: a harness entry's import graph reaching server-only code breaks every bundling spec at once, loudly, instead of silently breaking only the ones no workflow watches.

---

## §4 PR2 — standalone workflow and coverage guards

### §4.1 The workflow

New workflow .github/workflows/standalone-e2e.yml, one job:

```
actions/checkout@v4 → ./.github/actions/setup → Playwright chromium cache
→ pnpm exec playwright install-deps chromium && pnpm exec playwright install chromium
→ pnpm exec playwright test --reporter=list --config tests/e2e/standalone.config.ts
```

No `webServer`, no Supabase bootstrap, no `pnpm build` — the standalone specs boot their own `node:http` server in `beforeAll` (`tests/e2e/standalone.config.ts:4`). Measured 2.2 min for the full config locally (§2.3b), so budget `timeout-minutes: 20` with an expected ~5 min including setup and browser install.

New package script `test:e2e:standalone` wrapping that command, matching the existing `test:e2e:*` convention (`package.json`, e.g. `test:e2e:modal-header`).

**The workflow shape was validated against the real scanner before being specified.** A draft of exactly this YAML — bare `on: pull_request:`, no path filter, unpiped Playwright command, `if: failure()` upload sibling step — was fed through `scanWorkflowCoverage` (`tests/ci/_workflowCoverageScan.ts:80`) with an explicitly named spec: the spec came back in `covered` with `rejected` empty. So the trigger form, the diagnostic sibling step, and the command form all qualify; the only thing PR2 adds on top is config-level resolution (§4.4 G1).

**The run command must not be piped.** `tests/ci/_workflowCoverageScan.ts:30` classifies a command ending in `| tee`, `| cat`, or `| grep` as exit-code suppression and refuses to count it. Several `x-audits.yml` jobs deliberately pipe through `tee` with `set -o pipefail`, but the scanner cannot see `pipefail`, so copying that idiom here would mark the job non-blocking and silently re-darken all 27 specs while the guard stayed green. Playwright runs as a bare command; diagnostics come from the `if: failure()` upload-artifact sibling step, which the scanner correctly ignores (`tests/ci/_workflowCoverageScan.ts:16`).

**Env comes from the config, not the workflow.** Two specs need server env at module load (§2.3a).

There are already **two partial mechanisms**, and neither covers both environments:

- `tests/e2e/helpers/loadTestEnv.ts` is a side-effect import that loads `.env.local` into the Playwright runner process. Its docstring names this exact failure — "`lib/email/hashForLog.ts` needs `HASH_FOR_LOG_PEPPER`, reached transitively through `buildScenarioModalData → step3ReviewSections → requireAdmin`". It fixes a **developer machine** and does nothing in CI, where no `.env.local` exists. Only two specs import it (`tests/e2e/dev-capture.spec.ts`, `tests/e2e/attention-modal-gallery.spec.ts`) — neither of them the two that fail.
- `.github/workflows/modal-header-layout-e2e.yml:74` supplies the nine variables as job env. That fixes **CI** for the four specs that workflow runs, and does nothing locally.

So the same defect has been patched twice, in different places, each covering half the problem — and the two specs that actually need it are covered by the CI half only, which is why retiring that workflow breaks them.

`tests/e2e/standalone.config.ts` therefore sets the deterministic demo fallbacks itself with `process.env.X ??= …`. `??=` is load-bearing: a real `.env.local` value already loaded still wins, so this composes with `loadTestEnv` rather than overriding it. The config becomes self-sufficient for every consumer — this workflow, a local run, any future job — which is the same one-place-not-per-call-site principle as §3.1 applied to env. The `process.env.X ?? <demo>` shape is already the established idiom for the port-3004 webServer in `playwright.config.ts`.

### §4.2 Why no path filter

`_workflowCoverageScan.ts:105` classifies a workflow as not-PR-blocking-capable if its `pull_request` block carries **either** `paths:` or `paths-ignore:`. A coarse-filtered workflow would therefore leave **all 27 real standalone branches** non-qualifying and still allowlisted as `PATH_GATED` — not merely the 16 dark ones — so the guard would stay green while every one of them stayed effectively dark. That is the failure mode this whole spec exists to remove.

So the workflow triggers on `pull_request` with no path filter, plus `workflow_dispatch` (per the "enable `workflow_dispatch` on any CI workflow during the milestone" discipline in `AGENTS.md`). The cost is one ~5 min DB-free job on every PR, including docs-only ones. This is accepted deliberately: weakening the scanner's contract to buy a filter would convert a real guarantee into a nominal one.

**This is not a new decision — it is an existing project contract.** `docs/superpowers/specs/2026-07-24-archive-row-menu-idiom.md:128` already ratified an unfiltered e2e workflow for the same reason, after the filter surface grew across four review rounds: "the spec's true dependency graph is effectively the whole app plus the harness, so any enumerated filter re-opens the dark-path hole it was meant to close. Unfiltered is the structural end of the vector." The cost there is bounded by the same concurrency-cancel shape, which this workflow also adopts.

### §4.3 Retirements

Deleted: `.github/workflows/attention-anchor-e2e.yml`, `attention-pill-focus-e2e.yml`, `bulk-ignore-eyebrow-e2e.yml`, `hoverhelp-geometry-e2e.yml`, `modal-header-layout-e2e.yml`, and `share-link-flash-e2e.yml` — **six**, not the five an earlier draft named. The sixth landed on `main` mid-authoring (§2), which is itself the argument for the whole-config job: the per-feature pattern reproduces faster than it can be retired one at a time. Every spec each one ran is in `standalone.config.ts:36` and therefore runs in the new job, unfiltered — strictly more often than before, since each retired workflow was path-gated.

`.github/workflows/phantom-gap-e2e.yml` is **not** deleted: its other two legs (`.github/workflows/phantom-gap-e2e.yml:160` and `.github/workflows/phantom-gap-e2e.yml:162`) run default-config specs under `desktop-chromium` / `mobile-safari` and have no equivalent here. Its standalone leg (`.github/workflows/phantom-gap-e2e.yml:158`) is removed as redundant.

**The `pnpm test:e2e:*` package scripts are kept**, not deleted with their workflows. The grep was run rather than described: `test:e2e:hoverhelp-geometry` is cited as a verification command by `docs/superpowers/plans/2026-07-24-hoverhelp-visual-viewport.md:209` and `docs/superpowers/plans/2026-07-24-hoverhelp-visual-viewport.md:223`, and `test:e2e:modal-header` by `docs/superpowers/plans/2026-07-18-modal-header-reconciliation/CLOSE-OUT.md:57`. Deleting them would break those historical records for no gain, and single-spec shortcuts are exactly the local ergonomics whose absence let these specs rot in the first place. `test:e2e:standalone` joins them rather than replacing them.

### §4.4 Guard extensions

Three, each fails-by-default. G1 and G2 land in the same PR as the retirements so a coverage regression cannot land silently; G3 ships in PR3 (§4.4 G3) because every one of its baseline entries fails it today:

**G1 — config-aware coverage.** `_workflowCoverageScan.ts` currently detects a spec as covered only by matching its filename in a `run:` command (`tests/ci/_workflowCoverageScan.ts:88`). A whole-config invocation names no filenames, so without this extension every standalone spec would still read as dark.

**The mechanism is proven executable, not assumed.** Importing the configs and reading `projects[].testMatch` as resolved `RegExp` values yields 10 projects for the default config, with `dev-build` resolving to exactly `admin-dev.spec.ts` and `attention-modal-gallery.spec.ts` — the case AC-8 needs — and the standalone config resolving to 28 specs, matching §2.2 independently. Two constraints this surfaced: **regex-parsing the config source does not work** (the per-project literals span lines and a naive matcher silently returns zero projects — the `_rowWrapperScan` failure class the scanner's own header cites), and the importer must resolve relative specifiers from inside the tests tree, which `tests/ci/` satisfies.

`scanWorkflowCoverage` (`tests/ci/_workflowCoverageScan.ts:80`) is a **pure** function — its only inputs are `workflows` and `packageScripts`, with all filesystem reading done by the caller. The extension preserves that: a third `Opts` field `configSpecs`, mapping a Playwright config path to the spec paths its `testMatch` matches, supplied by the meta-test exactly as `workflows` and `packageScripts` already are. Parsing the config stays outside the scanner, which remains table-testable.

**Whole-config coverage is claimed only for an unnarrowed invocation.** "Names a config and no `*.spec.ts` argument" is not sufficient: Playwright narrows a run through a bare positional regex (`playwright test resolve-label`), `-g` / `--grep`, `--grep-invert`, `--project`, `--shard`, `--test-list`, `--last-failed`, and `--only-changed`, and `--list` executes nothing while exiting 0. So the rule is an **allowlist of tokens**, not a blocklist:

- **arguments are normalized before evaluation**, because the real commands use the `=` form: `--reporter=list`, `--project=dev-build`. The tokenizer splits `--flag=value` into `(flag, value)`, treats `--flag value` identically for flags known to take a value, and permits repetition (`--project=a --project=b`). Leaving this unpinned would under-claim the entire standalone job — its command is `--reporter=list` — and fail AC-2, while a `--project=…` form unrecognized would leave the gallery invisible and fail AC-7;
- a command claims whole-config coverage only when every argument after `playwright test` is either `--config <path>` or a member of a small known-inert set (`--reporter`, `--retries`, `--workers`, `--output`, `--timeout`, `--forbid-only`, `--quiet`) — each verified to affect reporting or scheduling only, never test selection;
- **any** unrecognized argument — positional or flagged — drops the claim to zero specs and records a rejection reason, so a future edit that adds `--shard` silently loses coverage rather than silently keeping it;
- explicit `*.spec.ts` arguments alongside `--config` are covered by those arguments only, which is `test:e2e:modal-header`'s shape today;
- **arguments forwarded at the call site compose with the script body.** `resolveSpecs` recurses into a `pnpm <script>` alias but discards the caller's tail, so `pnpm test:e2e:standalone -- --shard=1/2` would resolve the body as an unnarrowed whole-config run while Playwright executed half of it — a silent over-claim in the one direction the design promises never to go. The resolver therefore concatenates the caller's remaining arguments onto the resolved body before evaluating the allowlist, so a forwarded `--shard`, `--project`, `--grep`, `--test-list`, `--only-changed`, `--last-failed`, or positional regex drops the claim exactly as an inline one does.

Config-side narrowing is handled the same way: the `configSpecs` builder resolves the config's `testMatch` **and** its `testIgnore` and any project-level `testMatch` / `grep`, so a spec excluded inside the config is never reported as covered. A config path appearing in a command with no `configSpecs` entry is a hard error, never a silent zero-match (`tests/ci/_workflowCoverageScan.ts:25` records exactly that lesson).

**Implicit-config invocations must resolve too.** `.github/workflows/dev-gate-e2e.yml:108` runs `playwright test --project=dev-build --project=prod-build --project=prod-runtime-flip` — no filename, no `--config`. A `--config`-only extension leaves every spec matched solely by a project regex invisible, which is why `attention-modal-gallery` would stay `UNSEEN` after PR4 even once its workflow runs on PRs (§6.2). So `configSpecs` is also supplied for the **default** `playwright.config.ts`, keyed per project, and a command naming `--project <name>` with no spec arguments covers exactly that project's matched specs. Without this, PR4 could delete the spec from `dev-build`'s `testMatch` (`playwright.config.ts:92`) and the meta-test would stay green with the suite dark — the exact recurrence this cluster exists to prevent.

**G2 — no stale or missing `testMatch` branches.** Two halves, with very different strengths, and the spec is explicit about which is which.

(a) **Stale branches — strong.** Every alternation branch in `tests/e2e/standalone.config.ts:36` must resolve to an existing spec file whose basename is that branch plus the spec-file suffix. `overrideableField.layout` fails this today; its branch is deleted in this PR. This half is total: the branch list is finite and each entry either resolves or does not.

(b) **Unregistered self-contained specs — bounded, and narrower than it first looks.** The §3 helper bundles JS and CSS; it does **not** create the HTTP server, so "calls the helper" is neither necessary nor sufficient. (b) instead keys on a spec that **imports `node:http` / `node:https`** and is matched by **no** project in `playwright.config.ts`: such a spec must appear in `standalone.config.ts`.

**Not every self-contained spec boots a server, and (b) misses those.** `tests/e2e/phantomGapHelper.layout.spec.ts` drives `page.setContent` and imports neither module; it is registered today, but a *new* spec written that way falls through both halves — it creates no branch for (a) to validate, and (b) never sees it. `data:` navigation and route-fulfillment harnesses evade it identically.

So (b)'s honest claim is narrow: **the server-booting harness idiom cannot go unregistered.** It is not "no self-contained spec can go unregistered." §9 states the residue in those terms rather than the weaker "some other way of booting a server," which would have overclaimed by implying a server is always involved.

**G3 — `ENV_BOUND_EXCLUDES` coverage.** Every entry in `vitest.projects.ts:48` must be **executed by a PR-blocking-capable workflow**, or carry an inline `// not-run-anywhere: <reason>` comment on its own line.

"Named in a `run:` command" is not the test and would be a fail-open guard: a filename can appear inside an `echo`, a comment, a dead branch, a step with `if:` or `continue-on-error`, an exit-suppressed command, or a manual-only workflow — and can even be named and then excluded. G3 therefore reuses the **same capability pipeline** `scanWorkflowCoverage` already implements (`tests/ci/_workflowCoverageScan.ts:97-125`): `pull_request` trigger, no path filter, no job/step `if:`, no `continue-on-error`, no exit-code suppression, with `pnpm` script aliases resolved transitively. Only a command that survives all of those counts.

Baseline dispositions, verified rather than assumed — the array has three entries and each needed checking:

**G3 ships in PR3, not PR2.** All three entries fail it today, so landing it earlier would knowingly merge a red guard:

| Entry | Status today | Disposition |
| --- | --- | --- |
| `tests/cross-cutting/pg-cron-coverage.test.ts` | runs nowhere | PR3 removes the exclusion; runs in `unit-suite-db` (§5.2) |
| `tests/admin/test-auth-gate.test.ts` | **runs nowhere** | PR3 decides: wire it, or record an inline reason |
| `tests/cross-cutting/email-canonicalization.test.ts` | **runs, but the pipeline rejects it** | PR3 records an inline reason naming the cause |

The third row corrects a false claim in an earlier draft ("passes G3 through alias resolution; no change"). It does not pass. Its job at `.github/workflows/x-audits.yml:204` carries a job-level `if: github.event_name != 'schedule'`, and its run at `.github/workflows/x-audits.yml:231` ends in `| tee` — both explicit rejection conditions (`tests/ci/_workflowCoverageScan.ts:108-123`). The suite genuinely executes on PRs; the capability pipeline is simply stricter than reality here.

That is the **under-claim** posture applied consistently (§9): the guard refuses to certify what it cannot verify, and the gap is recorded as an exemption with its cause rather than papered over by loosening the pipeline. Loosening it to accept `| tee` would weaken every other check that depends on exit-code integrity.

All three entries also appear in `.github/workflows/unit-suite.yml` only as `#` comment lines (`.github/workflows/unit-suite.yml:74` and `.github/workflows/unit-suite.yml:76`). A guard matching raw file text would count those as coverage and certify suites that do not run — which is why G3 matches `run:` commands through the pipeline and never raw YAML.

**G3 does not parse shell text to prove execution, because that cannot be made sound.** Round 3 showed the round-2 repair still fails open on `echo <file>`, `false && vitest run <file>`, `true || vitest run <file>`, `if false; then …; fi`, shell comments, and `--exclude` given a glob rather than a literal. No regex over a `run:` block distinguishes a runner invocation from arbitrary shell, and each patch so far has produced the next spelling — the same-vector signal.

So G3 asserts a property that **is** decidable, in two independent halves:

1. **Inclusion, from resolved config.** Import `vitest.projects.ts` and ask whether the excluded file is matched by some project's resolved `include`/`exclude` — actual values, not source text, per `feedback_structural_guards_assert_resolved_config`. This is exactly what `ENV_BOUND_EXCLUDES` manipulates, so it is the property in question.
2. **That project is run by a PR-blocking-capable workflow**, via the existing capability pipeline on the `--project` argument.

Neither half needs to decide whether a shell fragment executes. A file passes G3 only if a project that CI actually runs includes it; otherwise it carries an inline reason. The honest ceiling stays recorded: a job whose step is `if:`-disabled is caught by the pipeline, but a runner invocation buried in a conditional shell branch is not something this guard reasons about at all — it no longer claims to.

**Capability checks still apply to the alias body, not only the outer command.** `resolveSpecs` (`tests/ci/_workflowCoverageScan.ts:87`) recurses into `package.json` script text to extract filenames, but the round-1 design applied `if:` / `continue-on-error` / suppression checks only to the workflow step. That leaves alias-only suites fail-open: a script body containing `echo <file>`, `false && vitest run <file>`, `vitest run <file> || true`, a suppressing pipe, or `--exclude <file>` would still be counted. G3 therefore evaluates the resolved script body under the same suppression and exclusion rules as the outer command, and treats a `--exclude`d filename as not covered.

**Guard code gets its own adversarial attention.** Per `feedback_guard_code_needs_its_own_adversarial_rounds`, the plan includes a task that mutates each of G1–G3 (a narrowed regex, a truncated branch list, a removed array entry) and asserts the guard goes red. A guard that cannot be shown to fail is decoration.

### §4.5 Allowlist shrink

`LOCAL_ONLY_ALLOWLIST` (`tests/ci/_metaE2eWorkflowCoverage.test.ts:36`) loses **28** rows — every real branch of the standalone config, not just the 16 that were dark (§2.2). The test's existing shadowing assertion (`tests/ci/_metaE2eWorkflowCoverage.test.ts:153`) already fails on an allowlist row whose spec became covered, so leaving a row behind is caught rather than tolerated. Post-PR2 count: 59 rows for 88 specs.

---

## §5 PR3 — pg-cron coverage and migration parity

### §5.1 The premise correction

`BL-CRON-REGISTRY-MIGRATION-PARITY` records the fix direction as "apply migrations to a throwaway Postgres in CI and read `cron.job` from it … this needs a variant that enables them," on the belief that CI's local stack holds the pg_cron migrations aside permanently.

It does not. `scripts/ci/supabase-local-bootstrap.sh` holds both cron migrations aside only for the initial boot (`scripts/ci/supabase-local-bootstrap.sh:50`), sets `app.fxav_vercel_url` as a per-database default via `supabase_admin` (`scripts/ci/supabase-local-bootstrap.sh:99`), restores them, and then applies them with `supabase migration up --include-all` (`scripts/ci/supabase-local-bootstrap.sh:104`). `.github/workflows/unit-suite.yml:117` runs that script and `.github/workflows/unit-suite.yml:111` installs `psql`.

So the `unit-suite-db` legs already have a Postgres whose `cron.job` rows were produced **by PostgreSQL parsing this branch's migration SQL**. That is the migration↔registry parity check the backlog wanted, and it needs no new infrastructure and no SQL scanner — satisfying the explicit prohibition in `BL-CRON-REGISTRY-MIGRATION-PARITY` ("Do not reinstate regex-based SQL parsing").

This is the same shape as the `#603` finding recorded in `feedback_guard_machinery_can_rest_on_a_false_premise`: three rounds of guard layers were built to work around "CI has no Postgres," which was false. Verifying the premise first is what makes this PR small.

### §5.2 Changes

1. Remove `"**/tests/cross-cutting/pg-cron-coverage.test.ts"` from `ENV_BOUND_EXCLUDES` (`vitest.projects.ts:48`) so it runs in the `serial` project, i.e. in `unit-suite-db`, against the bootstrapped local DB.
2. Correct **three** stale documentation sites, not one — the claim is repeated in each and all three become false the moment PR3 lands:
   - the `ENV_BOUND_EXCLUDES` comment claiming the suite "runs against the validation project";
   - the surrounding explanation in `.github/workflows/unit-suite.yml`;
   - **the suite's own header** (`tests/cross-cutting/pg-cron-coverage.test.ts:2-9`), which declares it `LOCAL-ONLY`, "NOT wired into CI", and gives a manual run command. After PR3 it runs in `unit-suite-db` **and** in an `x-audits.yml` validation job, so that header would be the most misleading of the three — it is the first thing a reader of the file sees.
3. Add an `x-audits.yml` job `pg-cron-coverage-validation`, modelled on `validation-schema-parity` (`.github/workflows/x-audits.yml:313`): install `postgresql-client`, run with `PG_CRON_COVERAGE_TARGET=validation`, `TEST_DATABASE_URL: ${{ secrets.SUPABASE_TEST_DATABASE_URL }}`, and `VALIDATION_SUPABASE_PROJECT_REF`. The suite's own `beforeAll` already refuses to run if the URL looks local, or the ref is absent, or the URL does not contain the ref (`tests/cross-cutting/pg-cron-coverage.test.ts:110`).
4. Anti-vacuity (§5.3).

The two checks are complementary and both are kept: the local run proves **this branch's migrations** produce the expected job set; the validation run proves the **deployed** project matches. Neither substitutes for the other, which is the same split `validation-schema-parity` already draws.

### §5.3 The vacuity risk, and the tripwire

`tests/cross-cutting/pg-cron-coverage.test.ts:107` degrades `liveDbTest` to `test.skip` whenever `psql` is unreachable, and `tests/cross-cutting/pg-cron-coverage.test.ts:130` only `console.warn`s. Wiring the suite without addressing that buys a job that can report green having asserted nothing — the precise failure `BL-PG-CRON-COVERAGE-UNRUN` warns about, reintroduced by the fix for it.

**Measured, not inferred.** Run in the worktree against `--project serial` with local Supabase up:

| `TEST_DATABASE_URL` | Result |
| --- | --- |
| loopback port 54322 (reachable) | 8 passed, 0 skipped — all 6 live-DB tests executed, confirmed by name under the verbose reporter |
| loopback port 59999 (closed) | **exit 0**, "2 passed \| 6 skipped" |

The first row proves §5.2 works: removing the exclusion makes the suite run and pass against the bootstrapped DB. The second proves the vacuity risk is real — the file reports success having asserted nothing about any live database.

So: when `process.env.CI` is set, an unreachable `psql` is a thrown error in `beforeAll`, not a warning, and not a skip. Locally the skip behavior is unchanged, so a developer without a running stack is not blocked. Additionally the suite asserts that the number of executed live-DB tests is non-zero, so a future refactor that skips them individually is caught rather than absorbed.

### §5.4 Target-aware assertions

The cron command bodies embed whatever host the `app.fxav_vercel_url` GUC held at migration time, so the host is **environment-supplied and varies by target**. Measured, three distinct shapes exist:

| Target | Host in `cron.job.command` |
| --- | --- |
| a developer's local stack | `http://host.docker.internal:3000` (measured on this machine) |
| CI's bootstrapped local stack | `https://fxav-screenshots-ci.invalid` (`scripts/ci/supabase-local-bootstrap.sh:38`) |
| validation / prod | the real Vercel host |

So the rule is **not** "accept the placeholder under `local`" — that would pass in CI and fail on every developer machine. The rule is: assertions on command text key on the **route path**, which is host-agnostic and is what the suite already does today (`${jobname} command should reference the canonical route`, checked against `canonical.route`). Any assertion on the **host** is `validation`-only.

The plan enumerates every assertion in the suite that reads command text and records which posture it takes; an assertion that cannot be made host-agnostic is scoped to `validation`, with the reason inline.

**One posture, stated once (an earlier draft contradicted itself across three sentences).** Command-text assertions compare against the connected database's own configuration, identically under every target; the target flag selects only the refuse-to-run guardrails, never a weaker assertion.

**A target label is not a fact about the database.** `PG_CRON_COVERAGE_TARGET=local` only says which flag was passed; it does not establish that the connected database is the freshly bootstrapped one, and `validation` does not establish a `vercel.app` host (a custom domain is legitimate). Keying assertions off the label therefore proves less than it appears to, and would fail a legitimate configuration while passing an unrelated one — the same class as `BL-VALIDATION-TARGET-BINDING`, which is open for exactly this reason on the sibling job.

So the suite asserts what the database itself reports: the route path must match the canonical registry, and the **host must equal the host the connected database's own `app.fxav_vercel_url` GUC holds** (`current_setting('app.fxav_vercel_url', true)`), read in the same session. That compares the command against its actual source of truth rather than against an assumption about the environment, and it holds identically on a developer stack, in CI, and against validation. **An unset GUC is a hard failure, not a fallback.** Both scheduling migrations refuse to apply unless `app.fxav_vercel_url` is set (`scripts/ci/supabase-local-bootstrap.sh:17-25` exists precisely to satisfy that guard), so cron rows cannot exist without it. If rows exist and the GUC is unset, the migration-time source of truth is unrecoverable and a route-only fallback would let any embedded host pass — including a stale one from a previous deployment, which is the exact drift this check exists to catch. The suite fails and says so; recording a skip while reporting green is the vacuity pattern §5.3 removes.

### §5.5 Flag lifecycle

| Flag | Storage | Write path | Read path | Effect on output |
| --- | --- | --- | --- | --- |
| `PG_CRON_COVERAGE_TARGET` | Process env | `x-audits.yml` job env (`validation`); unset elsewhere | `tests/cross-cutting/pg-cron-coverage.test.ts:86` | Selects the refuse-to-run guardrails (`tests/cross-cutting/pg-cron-coverage.test.ts:110`) and, after this PR, the URL-assertion posture (§5.4). Default `local`. |
| `VALIDATION_SUPABASE_PROJECT_REF` | Repo secret / job env | new `x-audits.yml` job | `tests/cross-cutting/pg-cron-coverage.test.ts:110` | Absent under `validation` → hard refusal. Unread under `local`. |
| `CI` | Runner-provided | GitHub Actions | new check in `beforeAll` | Converts an unreachable `psql` from skip to failure (§5.3). |

No column is empty; no flag is a zombie.

---

## §6 PR4 — default-config dark specs

### §6.1 `admin-lifecycle-transitions`

Add `tests/e2e/admin-lifecycle-transitions.spec.ts` to `.github/workflows/lifecycle-layout-e2e.yml`, whose existing step (`.github/workflows/lifecycle-layout-e2e.yml:81`) already runs the sibling layout spec under `mobile-safari` on the same server posture.

It cannot simply be added: the 2026-07-24 flake audit recorded in `BL-E2E-LIFECYCLE-SPECS-CI-DARK` measured three pre-hydration click-swallow failures (hub kebab open ×2, published toggle ×1) whose failing cases move between runs. The repair is the `toPass` hydration-retry pattern the layout spec already uses — a readiness gate awaited before the first interaction, never `networkidle` alone. The plan's task states the boot mechanism, the hydration gate, and detach-safety for any `locator.evaluate` sampler, per the e2e harness-readiness checklist in `docs/agents/writing-plans.md`.

Acceptance for this task is **five consecutive green runs** of the spec, not one. A flake admitted to a workflow is worse than a dark spec, because it trains the pipeline to treat red as noise.

**Its allowlist row must be deleted in the same PR.** `lifecycle-layout-e2e.yml` carries no path filter, so adding this spec to it makes the spec genuinely covered and the shadowing assertion (`tests/ci/_metaE2eWorkflowCoverage.test.ts:153`) fails while its `UNSEEN` row survives. This is the second of PR4's two allowlist transitions; the gallery's is handled in §6.2, and an earlier draft specified only that one.

### §6.2 `attention-modal-gallery`

Two rotted assertions, both traceable to commits that landed after the gate's last green run on 2026-07-02:

- `tests/e2e/attention-modal-gallery.spec.ts:398` — `controls.getByText(String(GLOBAL.length), { exact: false })` raises a strict-mode violation resolving to 2 elements. The substring match means any element in the controls bar containing that digit qualifies. Repair: scope the locator to the counter element and match exactly. Per `feedback_containment_is_not_verbatim_use_set_equality`, the assertion is rewritten to compare against the counter's own text, not a containment test over the bar.
- `tests/e2e/attention-modal-gallery.spec.ts:265` — `await expect(attentionMenu).toHaveCount(0)` after `Escape` times out. **Cause unknown; do not assume the product changed.** An earlier draft of this spec attributed it to `f4c4bf493` merging the panel's three groups into two. That attribution is retracted: `components/admin/showpage/AttentionMenu.tsx:81-105` still registers a capture-phase `keydown` handler that calls `onClose()` and restores focus on Escape, and the pre-commit handler had the same semantics. The assertion is therefore probably **valid**, and the failure is a harness, timing, or scenario-state problem. The task diagnoses it before touching the assertion; weakening a correct assertion to make a rotted spec green would convert real coverage into decoration.

**Build-vs-runtime gate.** The spec needs the built `ADMIN_DEV_PANEL_ENABLED=true` artifact, which is a **build-time** decision — `scripts/with-admin-dev-flag.mjs` physically holds `app/admin/dev` aside during flag-unset builds, so a runtime env flip cannot substitute (`playwright.config.ts` `prod-runtime-flip` project exists to prove exactly that). It therefore stays in the `dev-build` project, whose `testMatch` names it at `playwright.config.ts:92`, and cannot move to the port-3000 baseline. Its home stays `dev-gate-e2e.yml`. **Adding a `pull_request` trigger there would reverse a ratified decision, so this spec does not propose it.** That workflow is `workflow_dispatch:`-only on purpose, with the reason recorded inline at `.github/workflows/dev-gate-e2e.yml:2-6`: the three serialized cold builds make the gate heavy and slow, so it is fired as an orchestrator close-out rather than on every PR (DEFERRED.md B1-D4). Overriding that to satisfy a coverage guard would be the guard dictating product-of-CI policy, backwards.

What PR4 does instead: add a **scheduled** trigger (plus the existing `workflow_dispatch`), so the spec is exercised on a fixed cadence and cannot rot for three weeks unnoticed the way it just did. Cost is unchanged for PR authors.

**This has a consequence AC-7 must own honestly.** A scheduled trigger does **not** satisfy the scanner, which requires a `pull_request` trigger (`tests/ci/_workflowCoverageScan.ts:10-11` — "workflow_dispatch-only and push-only are post-merge/manual discovery, not a PR gate"). So the gallery's allowlist row cannot be deleted. It is **rewritten** instead: from `UNSEEN` ("no workflow runs it") to a reason naming the schedule and citing B1-D4. That is a weaker claim than PR-blocking coverage and the spec says so rather than dressing a nightly job up as a gate. Raising it further is an owner decision about dev-gate cost, not something this cluster settles.

---

## §7 Meta-test inventory

Per `docs/agents/writing-plans.md`, declared up front.

| Meta-test | Status | PR |
| --- | --- | --- |
| tests/e2e/\_metaLiveEntryToolchain.test.ts | **created** — no file but the helper names a toolchain binary (the blanket child-process ban is WITHDRAWN, §3.4); helper policy asserted as resolved config; behavioral proof the plugin ran; over-match case pins a client-safe module to the real implementation | PR1 |
| Tailwind version-parity test | **created** — resolved `@tailwindcss/cli` and `tailwindcss` agree on major and minor | PR1 |
| `tests/ci/_workflowCoverageScan.ts` | **extended** — config-aware coverage detection (G1) | PR2 |
| `tests/ci/_metaE2eWorkflowCoverage.test.ts` | **extended** — stale/missing `testMatch` branches (G2); allowlist shrinks by 28 rows to 59 | PR2 |
| New assertion over `ENV_BOUND_EXCLUDES` | **created** — every exclusion is run somewhere or reasoned (G3); ships in PR3 because all three entries fail it today | PR3 |
| `tests/cross-cutting/pg-cron-coverage.test.ts` | **extended** — CI-hard psql requirement, non-zero live-test count, target-aware URL assertions | PR3 |

Registries deliberately not touched: `tests/log/_auditableMutations.ts` (no mutation surface added), `tests/auth/_metaInfraContract.test.ts` (no Supabase client call added), `tests/auth/advisoryLockRpcDeadlock.test.ts` (no lock path touched).

---

## §8 Acceptance criteria

- **AC-1** The full standalone config runs green in CI, unfiltered, on every PR, and the two specs red at §2.3 are green — repaired by the helper, not by per-spec patches.
- **AC-2** The five retired workflows are gone and every spec they ran is covered by the new job; `_metaE2eWorkflowCoverage` passes with 28 fewer allowlist rows (59 remaining) and no shadowing row.
- **AC-3** Each of G1, G2, G3 has a recorded mutation that turns it red.
- **AC-4** `pg-cron-coverage.test.ts` executes in `unit-suite-db` with a non-zero live-DB test count, and a job in `x-audits.yml` runs it against validation.
- **AC-5** An unreachable `psql` under `CI` fails the job rather than skipping the assertions.
- **AC-6** `admin-lifecycle-transitions` is in a workflow and green five consecutive times.
- **AC-7** `attention-modal-gallery` passes and its workflow fires on a schedule without a human dispatch. Its allowlist row at `tests/ci/_metaE2eWorkflowCoverage.test.ts:50` is **rewritten, not deleted** — from `UNSEEN` to a reason naming the schedule and citing B1-D4 — because a scheduled trigger is not PR-blocking-capable by the scanner's own contract (§6.2). Deleting it would claim coverage the workflow does not provide.
- **AC-8** G1's implicit-config resolution is exercised by a unit case even though the gallery does not qualify: a `--project`-only command over the default config resolves that project's specs. Otherwise the mechanism ships untested and the next `--project`-only workflow silently proves nothing.
- **AC-9** Every entry in `ENV_BOUND_EXCLUDES` is either executed by a PR-blocking-capable workflow or carries an inline reason — including `tests/admin/test-auth-gate.test.ts`, which today is neither.
- **AC-10** No file under `components/`, `app/`, `DESIGN.md`, or `tailwind.config.*` is modified in any of the four PRs.

## §9 Out of scope, and honest ceilings

- **Command-body text matching stays text matching.** A `cron.job` whose `net.http_get(...)` is commented out followed by an executable `select 1;` satisfies every assertion in the suite while issuing no request, and `active=true` does not help because the job runs, it just does nothing. Proving a job fires needs a per-job smoke test; only the sync path has one. `BL-PG-CRON-COVERAGE-UNRUN` stays open for that residue rather than being closed by this work.
- **The ~60 app-dependent `UNSEEN` specs** keep their allowlist rows. Wiring them needs a booted app and a seeded database per spec, which is a separate cluster with a different cost profile.
- **G2(b) detects the server-booting harness idiom only.** A self-contained spec that boots **no** server — `page.setContent`, a `data:` URL, route fulfillment — is invisible to it, and `tests/e2e/phantomGapHelper.layout.spec.ts` is an existing example of that shape. So a green run means "no spec using the server-booting idiom is unregistered," not "no self-contained spec is unregistered," and certainly not "the class is impossible." G2(a), by contrast, is total: every branch in the config either resolves to a file or fails. Keeping the two claims distinct is deliberate, per the three-round prose cap in `docs/agents/spec-self-review.md`.
- **A stubbed module consumed for a VALUE, not a call, is a silent risk (§3.2c).** The render check sees calls; it cannot see `proxy === "x"` yielding `false`. A strict throw-on-read stub was measured and breaks one entry's build, so the residual stands. Bounded by four narrow path rules and by §3.4 case 5 exercising those directories directly — not eliminated. This is the design's most significant open limitation and is stated as such rather than buried.
- **G3 no longer claims to prove execution from shell text.** It asserts resolved-config inclusion plus a PR-blocking-capable `--project` run. A runner invocation inside a conditional shell branch is outside what it reasons about, by construction.
- **G1 claims coverage only for invocations it fully understands.** Any unrecognized argument drops the coverage claim rather than assuming whole-config execution, so the guard under-claims on an exotic command instead of over-claiming. Under-claiming surfaces as a required allowlist row; over-claiming would be a silent hole.
- **Branch protection is unchanged.** Promoting any of these jobs into the required set is an owner GitHub-settings action, not repo code.

## §10 Risks

| Risk | Mitigation |
| --- | --- |
| Retiring a workflow drops coverage the new job does not actually provide | G1 + G2 land in the same PR as the retirements; the shadowing assertion fails if a retired spec is neither covered nor allowlisted. Additionally the plan runs the full standalone config locally before the retirement commit and records the spec list. |
| `ENV_BOUND_EXCLUDES` edit reddens `unit-suite`, which §2.6 confirms is a LIVE required context | The change is one array entry, and the suite it admits is proven green against a bootstrapped local DB before the commit. `unit-suite.yml` has `workflow_dispatch`, so it is verified by a real Actions run before merge, per the local-passes-CI-fails discipline in `AGENTS.md`. |
| The unfiltered standalone job slows every PR | Measured DB-free and build-free; ~5 min including setup, replacing five jobs that each pay the same setup today. Net job count on a PR touching `components/` goes down. |
| `@tailwindcss/cli` pin drifts from `tailwindcss` | Real, and not mitigated by pinning alone: the new CLI entry is exact (`4.2.4`) but `tailwindcss` stays a range (`package.json:119`, `"^4"`), so an install can pair the fixed CLI with a different Tailwind minor. PR1 adds a meta-test asserting the resolved versions of the two packages agree on major **and** minor, failing loudly on the drift rather than rendering a harness against a mismatched engine. |
| `admin-lifecycle-transitions` remains flaky after repair | AC-6 requires five consecutive greens. If it does not reach that, the spec is left dark with a recorded reason and the item stays open — an admitted flake is worse than a known gap. |
