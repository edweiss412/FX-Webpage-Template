# Plan — /help/tour card grids and the missing Settings card

**Spec:** [`docs/superpowers/specs/2026-08-29-help-tour-grid-and-settings-card.md`](../specs/2026-08-29-help-tour-grid-and-settings-card.md)
**Branch:** `fix/help-tour-grid-and-settings-card` · **Closes:** `DEFERRED.md`
HELPTOUR-CARD-GRID-MEASURE-1 and HELPTOUR-SETTINGS-CARD-MISSING-1

The spec converged at `f2a195b7f` after five review rounds. Its own history is the reason this plan
is shaped the way it is: four of those five rounds found the same class of defect, an assertion
that held for a reason other than the one it named. §3 is the answer to that, and it is this plan's
closed criterion.

---

## 1. Files

| File | Change |
| --- | --- |
| `app/globals.css` | `@property --help-measure`; cap moves from `.help-prose` to `.help-prose > *`; `.help-bleed` opt-out |
| `app/help/tour/page.mdx` | `data-tour-card` on all eight card anchors; derived column counts + `help-bleed` on three grids; `md:col-span-2` becomes `col-span-full`; the Settings card |
| `app/help/errors/page.tsx` | jump list takes a derived column count at its own minimum; no bleed |
| `tests/help/page-tour.test.tsx` | hardcoded seven-URL list becomes set equality derived from `NAV` |
| a new `tests/help/` transitions suite (named in task 7) | spec §5's transition inventory |
| `tests/e2e/help-typography.spec.ts` | measure assertion retargets from the wrapper to a paragraph |
| `tests/help/help-prose-layer.test.ts` | measure pattern follows the declaration that now carries it |
| a new `tests/e2e/` layout-dimensions spec (named in task 5) | real-browser column sequences and measure floor |
| `playwright.config.ts` | new spec joins `help-docs-desktop`'s `testMatch` |
| `tests/help/playwright-config.test.ts` | pins that `testMatch` regex VERBATIM; the edit above breaks it unless updated in the same task |
| `tests/ci/_metaE2eWorkflowCoverage.test.ts` | needs a `LOCAL_ONLY_ALLOWLIST` row for the new spec: its scanner cannot see project-only workflow invocations, so without one the spec reads as dark |
| `.github/workflows/help-affordances.yml` | `app/globals.css` joins `paths:` |

## 2. Meta-test inventory

**CREATES none. EXTENDS none.** Declared explicitly rather than left silent: this arc adds no
Supabase call boundary, no `admin_alerts` row, no sentinel-hiding surface, no advisory lock and no
RPC-gated table, so none of the registries named in `docs/agents/writing-plans.md` applies. The two
guards it does touch (`tests/help/page-tour.test.tsx`, `tests/e2e/help-typography.spec.ts`) are
ordinary suites, not registry-bearing meta-tests.

**Source-mutation registry: not enrolled, with the reason in spec §3.4.** The registry mutates a
module named by `sourcePath`; the completeness guard is a rendering assertion with no module under
it. Enrolling it symbolically would be worse than declining.

## 3. Violation inventory — every acceptance criterion, and what makes it red

This is the plan's closed criterion, and it exists because spec R5 proved the criteria could all
pass on a page where the change had not happened. **Each row is a staged violation applied to the
finished tree, with the named command observed RED, then reverted.** A criterion whose violation
cannot be staged is not a criterion; it is a sentence.

| AC | What it claims | Staged violation | Expected red |
| --- | --- | --- | --- |
| **AC-1d** | the measured column sequences hold | revert all three tour grids to `grid-cols-1` and drop `help-bleed` — the permanently-single-column page | layout spec fails on the column COUNT at 752, 1016 |
| AC-1 | measure >= 28ch at the thresholds | set the minimum to `16rem` | fails at 640 (25.2ch), 900 (25.0ch), 904 (25.2ch) and 1280 (23.1ch); it does NOT fail at 752, which is 30.8ch |
| AC-1a | the 390px measure is unchanged | drop the minimum to `10rem`, which is the largest value that fits two tracks in the 358px mobile container | layout spec fails at 390: 2 columns at 12.8ch against the 31.4ch single-column baseline |
| AC-1b | zero jump-list wraps | restore `sm:grid-cols-2` on the errors list | 5 of 7 wrap at **768**, the measured baseline, and at no other sampled viewport |
| AC-1c | no horizontal overflow at 320 | drop the `min(...,100%)`, leaving a bare `22rem` | overflows at **320** only: a 352px track in a 288px container, +64px. At 390 the container is 358 and the same track fits with 6px to spare, which is why this row is pinned to 320 |
| AC-2 | other help pages unchanged | remove the `> *` scoping so the cap lifts entirely | typography spec fails at **1280** on an 85.1ch paragraph; NOT at 1024, where the uncapped 728px column is 72.3ch and still inside the spec's 76ch bound |
| AC-3 | cards cover every admin-surface slug | delete the Settings card | set equality fails naming `/help/admin/settings` |
| AC-4 | a ninth entry fails by default | add a ninth `admin-surface` NAV entry, no card | same guard fails naming the new slug, with NO edit to the test |
| AC-5 | prose contracts still hold | remove the `--help-measure` declaration | prose-layer guard fails on the missing measure |
| AC-6 | as many cards as admin surfaces | duplicate one card, giving nine cards for eight surfaces | the CARDINALITY assertion fails; set equality alone still passes, which is why AC-6 is not AC-3 |
| AC-7 | copy invariants hold | put an em dash in the Settings card body | `page-tour.test.tsx` em-dash ban fails |

**AC-3 and AC-6 exercise DIFFERENT assertions, which an earlier draft of this plan got wrong.**
AC-3 is set membership and AC-6 is cardinality, and the review round that caught it also proved the
gap is real rather than pedantic: the guard compares deduplicated sets, so eight correct hrefs plus
a duplicated ninth card pass AC-3 while "eight cards for eight admin screens" is false. AC-6's
violation duplicates a card precisely so that set equality still passes and only the count fails.

**Every row names the viewport where its red is observed, and every one was COMPUTED from the
§2.3 sweep rather than asserted.** That is this table's structural defense, and it exists because
the table failed the same way twice. Review round 2 found three rows whose stated red was simply
wrong — a 16rem minimum named at the one matrix viewport it passes, a mobile mutation that was a
no-op, and a claim that today's grid is single-column at 1016 when `md` is active there. Re-running
every row against the sweep afterwards found a fourth the review had not flagged: AC-2's violation
is still INSIDE the typography bound at 1024 (72.3ch) and only breaches at 1280. A violation
inventory whose entries are written from a mental model has the exact defect it exists to catch,
one level up.

**Every row above stages a violation no other row stages.** The earlier draft had AC-1a reusing
AC-1's `16rem` mutation and argued the difference away in a paragraph. That was the defect this
inventory exists to prevent, one level up: two criteria, one piece of evidence. AC-1a is now
narrowed in the spec to the only thing it claims that AC-1 does not — that the mobile case is left
alone — and its violation touches mobile and nothing else.

## 4. CI wiring

The new spec joins **`help-docs-desktop`**, not `desktop-chromium`. `help-affordances.yml` invokes
projects by NAME, so a spec matched there runs; a `desktop-chromium` spec would be CI-dark, which
is not hypothetical — `phantom-gap-e2e.yml` exists because `crew-layout-dimensions.spec.ts` and
`admin-layout-dimensions.spec.ts` matched a project that no workflow invoked.

`app/globals.css` joins that workflow's `paths:`. It is absent today, so a future change to
`.help-prose` alone would leave every assertion in the new spec dark.

**What gates the merge, stated because it is not what you would assume.** The 13 required contexts
do not include `help-affordances`. The completeness guard runs under `unit-suite` and IS
merge-gating; the real-browser layout assertions run and report on every PR touching these paths
but do NOT block. That is the honest status of AC-1, AC-1a, AC-1b, AC-1c and AC-1d, and this plan
does not propose changing branch protection to alter it.

---

<!-- tasks: depth=2 red-contract -->

## Task 1 — derive the completeness guard from NAV

<!-- task: red=`pnpm vitest run tests/help/page-tour.test.tsx` red-state=authored red-target=`app/help/tour/page.mdx:95` why=`the task tags the seven existing cards with data-tour-card and replaces the hardcoded seven-URL list with set equality against the NAV entries whose group is admin-surface, so the observed RED is behavioural rather than a missing import: the page renders seven carded hrefs against eight admin-surface slugs and the assertion fails naming /help/admin/settings, which is the defect itself. The premise that at least one card anchor renders is what stops an empty set passing vacuously. The SAME command greens when task 2 adds the Settings card` ac=AC-3,AC-4,AC-6 -->

Tag all seven existing card anchors with `data-tour-card`. Replace `ADMIN_REFERENCE_URLS` with TWO
assertions over `a[data-tour-card]` in the rendered tree:

1. **Set equality** between the anchors' hrefs and the `NAV` entries whose `group` is
   `admin-surface`, both directions, failing by name. (AC-3, AC-4)
2. **Cardinality**: the anchor COUNT equals the admin-surface entry count. (AC-6)

The second is not redundant, and the plan review proved it: set comparison deduplicates, so eight
correct hrefs plus a duplicated ninth card satisfy assertion 1 while the page's "every admin
screen" claim is false. Constructed and confirmed before writing this — nine cards, eight distinct,
eight slugs, set equality passes.

**Commit this alone and observe the red before task 2.** Both tasks touch the tour page; combined,
the red never appears.

**The four presence-guard mutants run here**, results recorded in the commit: (a) drop
`data-tour-card` from every card — the premise must fail, not the equality; (b) append a suffix to
one href; (c) put `/help/admin/settings` in PROSE with no card — must STILL fail, which is the spec
R1 finding; (d) flip one entry's `group` — the expected set must shrink. A fifth runs here too,
from the plan review: (e) duplicate a card — set equality must still pass and the CARDINALITY
assertion must fail, which is what proves the two assertions are not one.

## Task 2 — the Settings card

<!-- task: red=`pnpm vitest run tests/help/page-tour.test.tsx` red-state=authored red-target=`app/help/tour/page.mdx:95` why=`task 1 authors the failing case and leaves this command red on the missing /help/admin/settings card, so the red is authored by this plan rather than pre-existing — spec:lint --exec-red confirmed the command exits 0 on today's tree, which is why this is not red-state=live. This task adds the card under Once per environment and the SAME command greens` ac=AC-6,AC-7 -->

Add the card with spec §3.3's exact copy, `data-tour-card`, and the standard (non-accent) treatment.

## Task 3 — move the measure cap

<!-- task: red=`pnpm vitest run tests/help/help-prose-layer.test.ts` red-state=authored red-target=`app/globals.css:1211` why=`the task FIRST adds a case asserting that a .help-bleed child escapes the measure while its siblings keep it, which fails on today's stylesheet because no such mechanism exists — the cap sits on the wrapper and no child can exceed it. The observed RED is therefore the absent mechanism, not a moved literal, and the SAME command greens when the @property length, the > * scoping and .help-bleed land in this task. The two guard retargets ride along because this task causes their drift; neither is what reds here` ac=AC-2,AC-5 -->

Add the failing case first: a `.help-bleed` child escapes the measure, its siblings do not. Then
`@property --help-measure`, the `> *` scoping, `.help-bleed`.

**The retargets are not the red.** Moving the cap also breaks the prose-layer guard's literal
`max-width: <n>ch` match and the typography spec's wrapper measurement, and both are retargeted in
this task. An earlier draft made THAT the red — implementation breaks a guard, retargeting the
guard greens it — which is implementation-red followed by test-green, the reverse of the contract.
A cycle that greens because the test changed proves nothing about the implementation.

## Task 4 — the layout-dimensions spec

<!-- task: red=`ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=test-secret-fixture HELP_DOCS_WALKER_ONLY=1 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm heavy pnpm exec playwright test help-tour-layout-dimensions --project=help-docs-desktop` red-state=authored red-target=`app/help/tour/page.mdx:53` why=`this task writes the spec AND its help-docs-desktop testMatch entry together, so the command collects and RUNS rather than reporting no tests, and the observed RED is the production defect: today's md:grid-cols-3 gives ONE column at 752 (md has not engaged below 768) and THREE at 1016 (it has), where AC-1d asserts two at both, and that three-column state measures 18.1ch against AC-1's 28ch floor. The SAME command greens when task 5 lands the derived column counts` ac=AC-1,AC-1a,AC-1b,AC-1c,AC-1d -->

New spec: column sequences (AC-1d), measure floor (AC-1), the 390px measure unchanged (AC-1a), zero
wraps (AC-1b), no overflow (AC-1c). Viewports 320, 390, 640, 740, 752, 768, 900, 904, 1004, 1016,
1024, 1280. One `page.evaluate` per viewport. Readiness gate is `await expect(grid).toBeVisible()`,
never `networkidle` alone. Premises: at least one card anchor renders, and the grid is multi-column
where a case asserts a multi-column measure. Add to `help-docs-desktop` `testMatch`; add
`app/globals.css` to `help-affordances.yml` `paths:`.

**Two companion surfaces, both found by sweeping rather than by remembering.**
`tests/help/playwright-config.test.ts:167` pins the `help-docs-desktop` `testMatch` regex
VERBATIM, so the config edit breaks it and it is updated in THIS task — without that, `unit-suite`
goes red on a change the plan called complete. And `tests/ci/_metaE2eWorkflowCoverage.test.ts` needs a
`LOCAL_ONLY_ALLOWLIST` row for the new spec, added in THIS task.

**That guard proves the opposite of what an earlier draft of this paragraph claimed.** I wrote that
it PROVES the `help-docs-desktop` choice because it "fails by default for NEW dark specs". It does
fail by default — but its scanner **cannot see project-only workflow invocations at all**, by its
own stated contract, and `help-affordances.yml` invokes exactly that form
(`--project=help-docs-setup --project=help-docs --project=help-docs-desktop`). Every existing help
spec therefore carries an allowlist row saying so: `deep-link-walker`, `help-auth`, `help-mobile`
and `help-typography` each have one. Without a matching row the new spec reads as DARK to that
guard and the assertion fails even though the workflow genuinely runs it.

So the guard does not validate the wiring — it has to be TOLD about it, in the same terms its
siblings use. The wiring choice itself is unaffected and still right: those allowlist rows are the
evidence that specs in this project family do run in CI. What was wrong was my account of what
checks it.

**The command pins its auth, its server and its database, and none is optional.**
`ENABLE_TEST_AUTH=true` and `TEST_AUTH_SECRET=test-secret-fixture` are asserted by
`help-docs-setup.ts` in the TEST-RUNNER process, not the server — `webServer.env` reaches the Next
process only, and `playwright.config.ts` imports no dotenv, so `.env.local` never reaches the
workers. Both are ABSENT from `.env.local` besides. Without them the command fails in the setup
project's assertion before any layout is evaluated, so the red would not be the tour-grid defect and
task 5 could not green it. `help-affordances.yml` sets the same pair on its Playwright step with a
comment saying exactly this.

Swept the rest of that class rather than adding only what was named: every `process.env` the
runner-side setup and helpers read is `ENABLE_TEST_AUTH`, `TEST_AUTH_SECRET`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY` and `TEST_AUTH_BASE_URL`. The two Supabase values have local-stack
defaults in `tests/e2e/helpers/supabaseAdmin.ts`, and `HASH_FOR_LOG_PEPPER` is needed only by the
non-3004 builds that `HELP_DOCS_WALKER_ONLY` excludes. So exactly two were missing, and the command
adds exactly two.
`HELP_DOCS_WALKER_ONLY=1` boots only the :3004 server instead of all five. The loopback
`TEST_DATABASE_URL` is load-bearing because `help-docs-setup` runs `pnpm db:seed` — against the
ambient value that seeds the VALIDATION project, whose notify cron sends real mail. **Before
running it, verify :3004 has no listener** (`lsof -nP -iTCP:3004 -sTCP:LISTEN`): the project's base
URL is hardcoded to that port with `reuseExistingServer: !CI`, so a sibling worktree's server would
be reused and the recorded red would belong to another branch's build. The converged spec records
that hazard for the same port in §2.2, and a red measured against the wrong build is worse than no
red at all.

**The spec lands BEFORE the implementation, deliberately.** An earlier draft had these two the other
way round, and the review caught what that costs: the implementation would have landed while the
command could only fail because the spec was absent, and the spec would then have greened
immediately against already-fixed production. Neither task would have observed the defect causing
red and the fix causing green, which is the entire content of invariant 1.

## Task 5 — derived column counts

<!-- task: red=`ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=test-secret-fixture HELP_DOCS_WALKER_ONLY=1 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm heavy pnpm exec playwright test help-tour-layout-dimensions --project=help-docs-desktop` red-state=authored red-target=`app/help/tour/page.mdx:53` why=`task 4 authors the failing cases and leaves this command red on the production defect; this task lands auto-fit with the min(22rem,100%) floor, help-bleed and col-span-full, and the SAME command greens. The red is the grid's column count and measure, not a missing file` ac=AC-1,AC-1a,AC-1c,AC-1d -->

All three tour grids to `grid-cols-[repeat(auto-fit,minmax(min(22rem,100%),1fr))]` plus
`help-bleed`; `md:col-span-2` becomes `col-span-full`. Errors jump list to its own `18rem` minimum,
no bleed.

## Task 6 — the violation inventory

<!-- task: red=`bash -c 'f=docs/superpowers/plans/2026-08-29-help-tour-grid-and-settings-card-violations.md; for ac in AC-1 AC-1a AC-1b AC-1c AC-1d AC-2 AC-3 AC-4 AC-5 AC-6 AC-7; do grep -qE "^\\| $ac \\|.*\\| RED OBSERVED \\|" "$f" || exit 1; done'` red-state=authored red-target=`docs/superpowers/plans/2026-08-29-help-tour-grid-and-settings-card-violations.md` why=`the transcript does not exist, so the loop exits 1 on the first id. It checks each of the eleven AC ids has a row ending RED OBSERVED rather than merely that the file is non-empty — an earlier draft used test -s, which greens on a heading, so the command could pass while the defect its own why names, an inventory nobody ran, stayed true. The SAME command greens only when every row records a staged violation actually observed red` ac=AC-1d -->

Stage each §3 violation on the finished tree, observe the named red, revert, record the transcript.
**AC-1d's row runs first**: the permanently-single-column page that spec R5 proved passes AC-1,
AC-1a, AC-1b and AC-1c must go RED here, or AC-1d does not do its job.

<!-- tasks: end -->

## Task 7 — transition characterization (no red contract, and here is why)

**This task carries no marker, deliberately.** Spec §5's transition inventory is already satisfied
by production: the cards carry `transition-colors`, and the page has no `AnimatePresence`, no
conditional render and no exit animation. So there is no defect to red on. An earlier draft gave
this task a red anyway — the suite does not exist, so the command fails on a missing path and
greens the moment the file is created against already-correct behaviour. That is precisely the
shape `docs/agents/writing-plans.md` rejects: a guard test that passes the moment it is authored.

Dressing characterization coverage as a red-green cycle would have made the plan's red contract
say something false about six of its nine tasks' worth of rigour. The coverage is still worth
adding — it pins the inventory so a later change to the cards has something to break — but it is
recorded as what it is.

Add a transitions suite under `tests/help/`. Assert spec §5's three rows: rest to hover is
`border-color` via the existing `transition-colors`; rest to focus-visible and hover to
focus-visible are instant. Confirm by reading that no `AnimatePresence`, conditional render or exit
animation exists on this page.

<!-- tasks: depth=2 red-contract -->

## Task 8 — impeccable dual gate

<!-- task: red=`npx vitest run tests/docs/_metaInvariant8Closeout.test.ts` red-state=live why=`this plan declares the invariant-8 dual gate and carries no marker line, because the grammar has no legal not-yet-run value, so the closeout guard fails on today's tree — verified by running it, not assumed. The SAME command greens when this task runs critique and audit and writes the real marker with its counts and dispositions` ac=AC-7 -->

`/impeccable critique` and `/impeccable audit` over the UI diff (`app/help/tour/page.mdx`,
`app/help/errors/page.tsx`, `app/globals.css`). P0 and P1 fixed or deferred with a `DEFERRED.md`
entry. Findings and dispositions in §12.

## Task 9 — closeout

<!-- task: red=`bash -c '! grep -qE "^\\*\\*Effort:.*IN PROGRESS" DEFERRED.md && npx vitest run tests/docs/_metaLedgerInProgress.test.ts'` red-state=live why=`DEFERRED.md carries two IN PROGRESS markers today, so the negated grep exits non-zero on the current tree — verified by running it, not assumed. It asserts the markers are GONE rather than that the commit touched the file: an earlier draft grepped the last commit's stat for DEFERRED.md, which greens on ANY touch including one that ADDS a marker, the same over-permissive shape the review found in task 6's test -s. The ledger guard runs alongside so removal cannot break the convention. The SAME command greens on the PR's final commit` ac=AC-6 -->

Remove both `**Status:** IN PROGRESS` markers and archive the graduated entries, in the PR's LAST
commit. A marker that reaches `main` names a branch the merge has just deleted.

**Found by sweeping the review's task-6 finding rather than raised by it.** F5 was that `test -s`
greens on a heading; the same shape was in this task's original command, which grepped the last
commit's stat for `DEFERRED.md` and so greened on any touch at all — including a commit that ADDED
a marker. The command now asserts the markers are absent and runs the ledger guard beside it.

<!-- tasks: end -->

---

## 12. Invariant-8 closeout

UI surface touched: `app/help/tour/page.mdx`, `app/help/errors/page.tsx`, `app/globals.css`.
Findings and dispositions land here when task 8 runs.

No marker line yet, deliberately. The grammar admits only `critique=RAN` or `critique=RAN-DEGRADED`
— there is no legal "not yet run" value — so the line cannot exist until task 8 has actually run
the gate. `tests/docs/_metaInvariant8Closeout.test.ts` is therefore RED on this branch until then,
which is correct rather than unfortunate: this plan declares the dual gate and has not yet run it.
Task 8 uses that guard as its own red.
