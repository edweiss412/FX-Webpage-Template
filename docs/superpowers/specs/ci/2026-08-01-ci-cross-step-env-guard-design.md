# Job-scoped cross-step GITHUB_ENV/GITHUB_PATH grouping for both CI guard layers

**Date:** 2026-08-01 · **Branch:** `test/ci-cross-step-env-guard` · **Class:** CI guard soundness (detector/guard surface — probe-before-argue and mutation-family closure apply, `docs/agents/adversarial-round-economy-2026-07-31.md`)

**Backlog item closed:** `BL-CI-GITHUB-ENV-CROSS-STEP-STATE` (repo-root `BACKLOG.md`, heading token BL-CI-GITHUB-ENV-CROSS-STEP-STATE)

<!-- spec-lint: not-ui — no UI surface; the only files touched are tests/ci/** guard modules and their callers. -->

Files this spec MODIFIES: `tests/ci/_metaSpecRegistration.test.ts` (census), `tests/ci/_workflowCoverageScan.ts` (scanner), `tests/ci/_metaE2eWorkflowCoverage.test.ts` (scanner caller + self-suite). It CREATES no production files and no new dependencies.

---

## §1 Problem

A step that runs `echo "PATH=/fake:$PATH" >> "$GITHUB_PATH"` (or writes `PATH` via `$GITHUB_ENV`) mutates the environment of every LATER step in the same job. A textually clean `pnpm exec playwright test …` step downstream then runs a fake pnpm that exits 0 — green step, no tests. R12 (arc `feat/ci-dark-descoped-guards`) closed the WITHIN-run-block shell-state class in both layers; the CROSS-STEP variant stayed open because neither layer models job-scoped state:

- The **invocation census** (`tests/ci/_metaSpecRegistration.test.ts`, `runBlocksOf` ~line 265) flattens every job's steps into one `RunBlock[]` with no job identity. The poisoning step mentions no playwright token, so it contributes nothing and raises nothing; the later clean block auto-classifies.
- The **workflow-coverage scanner** (`tests/ci/_workflowCoverageScan.ts`, `scanWorkflowCoverage` ~line 213) qualifies each step independently: the whole rejection chain (`if:`, `continue-on-error`, `suppressesExit`, `UNMODELLED_SHELL_RE`) sees only the claiming step's own text.

### §1.0 Probe record (bug demonstrated before drafting)

Probe file tests/ci/probe-cross-step-poison.test.ts (temporary and deliberately untracked; its fixtures graduate into the two self-suites and the probe file is deleted before merge), run 2026-08-01 in this worktree at `origin/main` (0fb6f9efb):

- **Scanner:** a two-step job — step 1 `echo "PATH=/fake:$PATH" >> "$GITHUB_PATH"`, step 2 a plain playwright invocation naming a synthetic spec path (tests/e2e/foo.spec.ts, fixture-only) under a bare `pull_request` trigger — yields `covered` CONTAINING that spec. The probe assertion that covered has the poisoned-job spec passed.
- **Census:** the same workflow through `runBlocksOf` + `censusInvocations` yields `problems: []` and `invoked: ["playwright.config.ts"]`. Assertions passed.

Both layers pass the poisoned workflow today. Zero LIVE workflows write `GITHUB_ENV`/`GITHUB_PATH` (re-measured 2026-08-01: `grep -rn "GITHUB_ENV\|GITHUB_PATH" .github/` → no hits; matches the 2026-07-31 BACKLOG measurement), so this is a forward-looking fail-by-default guard proven on synthetic fixtures, with a hard requirement that live guard suites stay green.

### §1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| The WITHIN-run-block shell-state class is CLOSED (R12/R13: `controlFlowRe`, `cmdPos`, `UNMODELLED_SHELL_RE`). This spec adds the cross-step variant only; no re-design of the within-block machinery. | Repo-root `BACKLOG.md` entry body (the R12-closed-the-within-block-class clause is explicit there); dispatch charter |
| Existing mitigations are NOT re-added: `standalone-e2e.yml` liveness is owned by the §4 run-report comparator; the `PLAYWRIGHT_` raw-text sweep already covers that env-var family. | Repo-root `BACKLOG.md` entry body; `tests/ci/_metaSpecRegistration.test.ts` ("no env: at any level" it-block ~line 125) |
| Marketplace (non-`./`) actions stay TRUSTED. `actions/setup-node` legitimately writes `GITHUB_PATH` at runtime; treating remote actions as poisoners darkens every workflow. Same posture as the census universe (local run blocks only) and the `PLAYWRIGHT_` sweep (`.github/actions` local files only). | Existing census universe contract (`runBlocksOf` doc comment, R7 F4); §5 L1 |
| Detection is the literal substring family `GITHUB_ENV` / `GITHUB_PATH` over comment-stripped text. Perfect obfuscation detection is impossible by the file's own ratified axiom (the `playwr` fuzzy-gate comment, `censusInvocations` ~line 466: "perfect obfuscation detection is impossible … the enumerated families are the ones review produced"). Constructed-name evasions file to §5 L2 without a round. | Ratified axiom in `tests/ci/_metaSpecRegistration.test.ts`; round-economy contract (a hypothetical evasion is a finding only with a live escaping mutant probe) |
| Fail-closed direction everywhere: false "poisoned" costs a registry/allowlist row with a reason; false "clean" silently deletes real coverage. Reads of `$GITHUB_ENV` poison like writes (§5 L4). | Header contract of `_workflowCoverageScan.ts` ("errs toward REJECTING"); same direction as every prior round |
| No UI surface, no DB, no `pg_advisory*` path: invariant 8 impeccable gate, invariant 2 lock topology, Dimensional Invariants, Transition Inventory all N/A. | `AGENTS.md` invariants 2, 8 |
| Mutation-family closure set is §3 (F1–F6). A reviewer-proposed NEW family is admissible only with a live escaping mutant demonstrated against the shipped guard. | `docs/agents/writing-plans.md` (mutation-family closure) |

---

## §2 Design

One shared predicate, two layer-specific groupings. Both layers keep their existing architecture (typed-YAML walk for the census, regex-on-YAML for the scanner) — the change is state threading, not a parser rewrite.

### §2.0 The poison predicate

A text "writes env" when, after dropping full-line `#` comment lines, it contains the substring `GITHUB_ENV` or `GITHUB_PATH` (case-sensitive — the runner exports exactly these names; bash variables are case-sensitive).

- Census form: a small helper inside `tests/ci/_metaSpecRegistration.test.ts` applied to `run:` strings.
- Scanner form: the same regex applied to the step CHUNK (everything the step-splitter produced, minus full-line-comment lines). The chunk includes `name:`/`with:`/`env:` lines — chunk-level matching is deliberately broader than the census's run-block matching (§5 L6); broader is the safe direction.
- Comment stripping mirrors the layers' existing posture (census skips full-line `#` lines because they never execute; the scanner already strips them from `cmd` — and its step-splitter glues BETWEEN-step comment prose onto the preceding chunk, so prose mentioning GITHUB_ENV must not poison; F6 pins this).
- No write-shape grammar (`>>` vs `>` vs `tee -a` vs heredoc): mention = poison. Distinguishing writes from reads or from mentions requires shell modeling, which is the losing game every prior round retired. This makes F2 (write-pattern narrowing) structurally impossible to reintroduce without failing the F2 fixtures.

### §2.1 Census: `runBlocksOf` gains job grouping + composite splice

`tests/ci/_metaSpecRegistration.test.ts`:

- `RunBlock` (~line 259) gains `poisoned: boolean`.
- `runBlocksOf(doc, localActions?)` — new optional second parameter `Record<string, unknown>` mapping a local `uses:` ref exactly as written (e.g. `./.github/actions/setup`) to that action's parsed YAML doc.
- Per workflow job, walk `steps` IN ORDER with an `envPoisoned` flag (fresh per job):
  - `run:` step → emit `{ run, guarded, poisoned: envPoisoned }`, then if the run text matches the poison predicate → `envPoisoned = true`.
  - `uses:` step with a `./`-prefixed ref:
    - ref present in `localActions` → SPLICE: walk the action's `runs.steps` in order; each emits `{ run, guarded: jobGuarded || usesStep.if !== undefined || actionStep.if !== undefined || customShell(actionStep), poisoned: envPoisoned }`; an action step matching the predicate sets `envPoisoned = true` for the REST of the action AND the rest of the workflow job (composite steps run in the caller's job env — both directions hold: an earlier workflow write poisons spliced action blocks, an action write poisons later workflow steps).
    - ref ABSENT from `localActions` → `envPoisoned = true` (fail-closed: an unresolvable local action is an opaque same-env executor).
  - `uses:` step with a non-`./` ref → no state change (trusted, §1.1 / §5 L1).
- Standalone composite-doc walk (`runs.steps` when `runBlocksOf` receives an action doc directly): same in-order `envPoisoned` threading within the action's own steps.
- `censusInvocations` item type gains `poisoned?: boolean`. The `contextWhy` chain (~line 562) gets a new branch — after `guarded`, before control-flow — with why-string: `environment poisoned by an earlier same-job GITHUB_ENV/GITHUB_PATH write`. Registry-or-loud, identical routing to every other context: a poisoned block's classifying lines must appear in `COMPLEX_INVOCATION_REGISTRY` with human-declared contributions, else the census reds. Non-classifying lines in a poisoned block stay silent (same rule as `guarded`).
- Config-set tripwire (~line 1199): build the `localActions` doc map from `.github/actions/**` up front (keyed `./<dir>` — the shape `usedActionDirs` already computes); pass it to every workflow's `runBlocksOf` call; DELETE the separate "append used-action blocks" push (spliced blocks now arrive per use site, correctly guarded and poisoned per job). The unreferenced-action loudness check stays byte-identical.

Duplication note: `./.github/actions/setup` is used by ~20 jobs, so its `pnpm install --frozen-lockfile` block is now censused once per use site instead of once total. Harmless by construction: `invoked` is a Set, `problems` only fire on classifying/problematic text, and that block contains no playwright token.

### §2.2 Scanner: per-job poison flag + `localActions` opt

`tests/ci/_workflowCoverageScan.ts`:

- `Opts` gains `localActions?: Record<string, string>` (local `uses:` ref → raw action YAML text).
- Inside the per-job loop of `scanWorkflowCoverage` (~line 262), thread `envPoisoned` across the step iteration. For EVERY step chunk (before the `run:`-presence early-continue, which today skips non-run steps entirely):
  1. Qualification first: a claiming step evaluated while `envPoisoned` is true rejects every claim with the new reason `earlier same-job step writes GITHUB_ENV/GITHUB_PATH`, inserted in the chain directly after `unmodelled execution override` (both are "the execution environment cannot be trusted" classes; before the path-filter/if/coe reasons).
  2. Then bookkeeping: if the comment-stripped chunk matches the poison predicate → `envPoisoned = true`. If the chunk carries `uses: ./…` → absent from `localActions`, or present with predicate-matching text → `envPoisoned = true`. Non-local `uses:` → no change.
  - Order (qualify, then poison) means a step that both invokes and writes poisons only LATER steps — its own within-block write is the R12 class (`$GITHUB_ENV` trips `UNMODELLED_SHELL_RE` if the block classifies).
- Caller `tests/ci/_metaE2eWorkflowCoverage.test.ts`: build `localActions` by walking `.github/actions/**` for action manifest files (action.yml / action.yaml basenames), keyed `./<dir>`, and pass it. (Today that map has two entries: `./.github/actions/setup`, `./.github/actions/assert-pnpm-sources` — neither text matches the predicate, verified by the live-green acceptance gate §4.3.)

### §2.3 What deliberately does NOT change

- `UNMODELLED_RE` / `UNMODELLED_SHELL_RE` / `controlFlowRe` / `cmdPos` — untouched (R12 closure, §1.1).
- Workflow/job-level `env:` blocks — a different (static, not cross-step-state) vector; §5 L3.
- `suppressesExit`, whole-config literal rule, alias resolution — untouched.
- No live workflow or action file changes; zero-writer state means no allowlist/registry rows are added.

---

## §3 Mutation-family closure set

The review converges against exactly these families. Each is pinned by named fixtures in both self-suites (census fixtures inside the census `it`-blocks of `_metaSpecRegistration.test.ts`; scanner fixtures in the self-suite describes of `_metaE2eWorkflowCoverage.test.ts`). A NEW family requires a live escaping mutant against the shipped guard (`docs/agents/writing-plans.md`).

| Family | Mutant | Pinning fixture(s) |
| --- | --- | --- |
| **F1 grouping deletion** | drop job identity (re-flatten); or poison globally across jobs | positive: write-then-invoke in ONE job reds both layers. Precision twin: write in job A, clean invocation in job B → B stays covered/clean (per-job flag, not per-file) |
| **F2 write-pattern narrowing** | detection narrowed to one redirect shape | three write forms all red: `echo … >> "$GITHUB_PATH"`, `tee -a "$GITHUB_ENV"`, `echo … > "$GITHUB_PATH"` (substring predicate cannot pass one and fail another; fixtures make narrowing loud) |
| **F3 ordering inversion** | poison applied to earlier instead of later steps (or order ignored) | write AFTER the invocation step → invocation stays covered/clean; write BEFORE → reds. Both directions pinned |
| **F4 composite blind spot** | `uses: ./…` splice dropped or unidirectional | local action whose step writes `GITHUB_ENV`, later workflow step invokes → reds both layers; census twin: earlier workflow write + action step carrying a classifying line → action block poisoned; action-internal ordering (action step 1 writes, action step 2 classifies) → poisoned |
| **F5 unknown-local-action fail-open** | unresolvable `./` ref treated as clean | `uses: ./ghost` (absent from `localActions`) before an invocation → reds both layers |
| **F6 comment/prose false-positive** | predicate matches comment prose (precision loss) | full-line `#` comment mentioning `GITHUB_ENV` between steps (scanner comment-glue) and inside a run block (census) → does NOT poison; clean multi-step job stays green |

F1's precision twin and F3's negative direction are as load-bearing as the positives: an over-poisoning guard that reds everything forces reason-free allowlist rows and trains humans to rubber-stamp them (the false-positives-are-not-safe lesson).

---

## §4 Test plan and acceptance criteria

TDD per task (invariant 1): each fixture lands red against the pre-fix layer, then the grouping change turns it green, with the F1/F3/F6 negative fixtures green throughout.

### §4.1 Census self-suite additions (`_metaSpecRegistration.test.ts`)

- `runBlocksOf` fixture block: poisoned two-step job yields `[{…poisoned:false}, {…poisoned:true}]`; cross-job isolation; write-after ordering; local-action splice (present map: both directions + internal ordering; absent map: fail-closed); non-local `uses:` neutral; comment-only mention neutral. Existing `toEqual` expectations gain `poisoned: false`.
- `censusInvocations` fixture: `{ text: "playwright test --config ghost.ts", poisoned: true }` → problems non-empty (registry-routed why), invoked empty; a poisoned NON-classifying text stays silent; a registered poisoned line contributes exactly its declared configs.

### §4.2 Scanner self-suite additions (`_metaE2eWorkflowCoverage.test.ts`)

- Rejection: poisoned workflow → `covered` empty for the spec, `rejected[0].reason === "earlier same-job step writes GITHUB_ENV/GITHUB_PATH"` (REPORTED, not dropped — the `_rowWrapperScan` lesson).
- All §3 scanner-side fixtures (F1–F6), including the `localActions` opt shapes and the whole-config literal under poisoning (a poisoned `pnpm exec playwright test --config …` step claims nothing).

### §4.3 Live-green gate

`pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts tests/ci/_metaSpecRegistration.test.ts` green against the live tree — zero live writers means zero new allowlist/registry rows; any live red is a defect in this design, not a candidate row.

### §4.4 Cleanup

Probe file tests/ci/probe-cross-step-poison.test.ts deleted before merge (its content graduates into §4.1/§4.2).

---

## §5 Documented limits

Consequence bound for every limit: the guard may under-poison only where the write itself is adversarial repo content (not accident), and the §4 run-report comparator + `PLAYWRIGHT_` sweep + real-CI observation layer remain independent; the guard never silently deletes coverage (fail-closed direction throughout).

- **L1 Marketplace/remote actions are trusted.** `actions/setup-node` writes `GITHUB_PATH` by design; `actions/github-script` can call `core.exportVariable` with no literal `GITHUB_ENV` anywhere. Modeling remote action internals is out of universe (same boundary as the census collector and the `PLAYWRIGHT_` sweep). A repo-controlled attack via a NEW remote action is a PR-reviewable diff line (`uses:` addition).
- **L2 Constructed-name evasions escape the substring family.** `E=$GITHUB""_ENV`, `tr`-case games, globbing the runner temp path (`…/_runner_file_commands/set_env_*`). Ratified axiom: perfect obfuscation detection is impossible; enumerated families are what review produced. Admissible as a finding only with a live escaping mutant probe — and any such line in a CLASSIFYING block already trips the `$`/backtick refusals.
- **L3 Static `env:` blocks at workflow/job/step level** are a different vector (no cross-step ordering) and are out of scope; `standalone-e2e.yml` pins no-`env:` at every level for the surface where it matters, and `PLAYWRIGHT_*` text is swept repo-wide in `.github/actions`.
- **L4 Reads poison like writes.** `cat "$GITHUB_ENV"` (rare, legit) poisons later steps. Deliberate: distinguishing read from write is shell modeling. Cost: one reasoned registry/allowlist row if it ever occurs.
- **L5 Scanner chunk-level matching is broader than census run-block matching.** A `name: dump GITHUB_ENV` line poisons in the scanner, not the census. Asymmetry accepted: each layer errs conservative within its own parse universe; the layers already differ this way (regex chunks vs typed YAML).
- **L6 A poisoning FINAL step (nothing after it) poisons nothing.** Correct by construction — env mutation affects only later steps.

---

## §6 Invariant fan-out check

- Invariants 2/3/5/8/10: N/A (no locks, no email, no UI, no mutation surfaces — test-only diff).
- Invariant 6: commits `test(ci): …` per task.
- Invariant 9: no Supabase calls.
- Invariant 11: work in `../FX-worktrees/ci-cross-step-env-guard` (this worktree), never main checkout.
- §12.4 catalog / DB parity / screenshots: untouched.
- Comment-stripping single-source registry (`tests/cross-cutting/_metaStripCommentsSingleSource.test.ts:139`): the census file's existing `marker-skip-regex` row covers the poison predicate's full-line-`#` strip (same class, same file, same mechanism); the scanner's strip reuses its existing filter. Verified at plan time whether the registry's per-file row needs a wording touch — no new mechanism is introduced.
