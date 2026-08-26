# Plan — Supabase upstream fault class

Spec: `docs/superpowers/specs/2026-08-25-supabase-upstream-fault-class.md`. Branch `fix/supabase-upstream-fault-class`. One commit per task, red then green on the SAME command.

Two tasks are already committed, ahead of this plan, because the spec's own first scheduled step required the harness before the prose and because round 1 surfaced a live defect that could not wait:

- `29e30584e` — the plant-four harness and its recursion fence (14 cases).
- `567314667` — one bounded target describer for both transport emits, after round 1 probed a Storage identifier leak.

## 1. Meta-test inventory

- **CREATES** a walked guard at tests/supabase/_metaServerClientObserverCoverage.test.ts (new in Task 2) — a walked guard making a NEW directly-constructed server-side Supabase client fail by default.
- **EXTENDS** `tests/supabase/serverClientWiring.test.ts` — the observer's install site and the REQUIRED composition order.
- **EXTENDS** `tests/ci/_metaE2eWorkflowCoverage.test.ts` — the capture chain's workflow half.
- **EXTENDS** `tests/mutation/source/registry.ts` and its `EXPECTED_ENV_TOUCHING` companion.
- **NOT extended:** the five `_metaInfraContract` siblings. `observeTransport.ts` carries `// not-subject-to-meta:` with its ground — it never sees a `{ data, error }` pair, only the HTTP exchange underneath one — the same disposition `lib/supabase/retryingFetch.ts` already holds. No `lib/admin/**` loader is touched.
- **NOT extended:** `tests/auth/advisoryLockRpcDeadlock.test.ts`. No `pg_advisory*` surface is touched.
- **NOT extended:** `tests/log/_metaMutationSurfaceObservability.test.ts`. No mutation surface is added; verified green against the current diff.

## 2. Advisory-lock holder topology

N/A. This plan edits no file containing `pg_advisory`.

## 3. Plan-time sweeps, run and pasted

### 3.1 Every Supabase client construction in the scanner's roots

```
$ grep -rn 'createClient(\|createServerClient(\|createBrowserClient(' app lib components | grep -v '\.test\.'
app/api/test-auth/set-session/route.ts:193   createClient
app/api/test-auth/set-session/route.ts:229   createServerClient
lib/supabase/server.ts:89                    createServerClient
lib/supabase/server.ts:142                   createClient
lib/observe/query/events.ts:64               (comment mention)
lib/supabase/browser.ts:45                   createBrowserClient
lib/dev/materialize/client.ts:18             createClient
lib/validation/reseedFixtures.ts:19          (comment mention)

$ grep -rn 'import(.*@supabase' app lib components
(no output)
```

| Hit | Disposition |
|---|---|
| `lib/supabase/server.ts:89` | SANCTIONED. Cookie-bound factory; Task 1 installs the observer. |
| `lib/supabase/server.ts:142` | SANCTIONED. Service-role factory; Task 1 installs the observer, late-bound. |
| `lib/supabase/browser.ts:45` | SANCTIONED, NOT observed. Browser-side; the record is a server log line. |
| `app/api/test-auth/set-session/route.ts:193` and `app/api/test-auth/set-session/route.ts:229` | EXEMPT. Test-auth gated, never a production request path. |
| `lib/dev/materialize/client.ts:18` | EXEMPT. A one-line indirection so tests can stub the module. |
| `lib/observe/query/events.ts:64`, `lib/validation/reseedFixtures.ts:19` | NEGATIVE CONTROLS. Comment mentions; the scanner must stay silent. |

No dynamic `await import("@supabase/…")` exists in the roots. The scanner handles the form anyway, covered by a SYNTHETIC fixture, and this plan says plainly that the live tree has no instance so nobody later reads that case as evidence one exists. The live dynamic constructions are all under `scripts/`, excluded on the stated ground in spec §9.3.

### 3.2 The scanner prototyped and controlled before implementation

Run against the live tree it finds exactly the six real constructions above and stays SILENT on both comment mentions. Controls in the same run:

| Fixture | Expected | Result |
|---|---|---|
| new static `createClient` import + call | FIRES (fail-by-default) | found |
| dynamic `const { createClient } = await import(…)` + call | FIRES | found |
| type-only `SupabaseClient` import + a comment naming `createClient()` | SILENT | silent |
| a STRING literal naming `createClient(` above a real call | fires on the CALL ONLY | correct |

The fourth is the discriminating one and the reason the scanner strips comments and string literals before matching: a bare grep flags the two live mentions and the string, so it would be noise from its first run and get suppressed rather than fixed.

### 3.3 Suites that would break on an eager `fetch` capture

```
$ for f in $(grep -rln 'globalThis.fetch\|vi.stubGlobal("fetch"' tests/); do grep -ql 'ServiceRole' "$f" && echo "$f"; done
tests/supabase/serverClientWiring.test.ts
tests/api/diagram-asset-route.test.ts
tests/onboarding/finalizeCasDougEditSelfHeal.db.test.ts
```

Two of the three are outside `tests/supabase/`, so a `tests/supabase`-scoped run would report green while they were broken. Task 1 runs all three by explicit file list.

## 4. Framework contracts this plan depends on

Every claim about framework behaviour carries its source, the way code claims carry `file:line`.

| Claim | Verified at |
|---|---|
| supabase-js resolves `fetch` per request when no `global.fetch` is supplied, and through the supplied one when it is | supabase-js 2.105.1, bundled CommonJS entry, `resolveFetch`, lines 96-99 |
| Playwright forwards a web server's stderr by default but its stdout only on an explicit `stdout: "pipe"` | playwright 1.59.1, bundled web-server plugin, the two `launchedProcess` stream handlers |
| `router.refresh()` merges the RSC payload without remounting, so no navigation loading boundary appears | Next docs shipped in the package, `use-router` reference |
| the loading file wraps the page and nested layouts but NOT the layout in its own segment, and a layout's runtime data access shows no fallback | Next docs shipped in the package, `loading` file-conventions reference |

The last two are recorded because they refuted a mechanism the spec's first draft proposed. Nothing in the shipped plan depends on them; they are here so the refutation is not re-derived.

## 4a. Acceptance criteria, and what proves each

Every task's `ac=` resolves here. The spec states the criteria; this table names the executable proof, so a task cannot claim an AC that nothing checks.

| AC | Proof |
|---|---|
| **AC-1** | Task 1's cases in `tests/supabase/serverClientWiring.test.ts`: a 502 observed AND retried on the cookie-bound client, a 502 observed on the service-role client, that observation not persisting through the real sink, and a `globalThis.fetch` swapped after construction still honoured. |
| **AC-2** | Already green at `29e30584e` and tightened at `e1c75e7bc`: fourteen plants plus four fence cases, with the clone-and-discard and rebuild-the-Request mutants each killing a case. |
| **AC-3** | Task 2's walked guard, proven fail-by-default against a synthetic fourth construction and silent against the two live comment mentions. |
| **AC-4** | Task 3, all three layers: a structural assertion that the baseline `webServer` sets `stdout: "pipe"`; structural assertions pinning the workflow's redirect, the absence of any `shell:` key, and the replay/extract/dump COMMANDS and conditions rather than merely their presence; and a one-time LOCAL run driving an injected fault through Playwright into the redirected log, pasted into the closeout, because no CI assertion can distinguish an injected record from the ambient ones §2 measures. Regression gate: `_metaE2eWorkflowCoverage` still reports all twenty specs covered. |
| **AC-5** | `describeTransportTarget` as the single describer for both emits, already landed at `567314667`, with the Storage path probed rather than argued. |
| **AC-6** | Task 5's registry row, red-then-green on `tests/mutation/enrolmentPresence.test.ts` (the only suite that fails for ABSENCE), plus the re-measured `EXPECTED_ENV_TOUCHING` rows and a measured `pnpm heavy:mutation pnpm mutation:guards` score with zero unaccepted survivors. |
| **AC-7** | Task 6's extension to `_metaDeferralLedgerGraduation`: both ids resolve in the archive and in neither open ledger, each archived body carries its documented limits, and the diff introduces no new `BL-`/`DEF-` id. `_metaLedgerInProgress` alone cannot prove any of the three — it is green when both rows simply stay open. |

## 5. Tasks

<!-- tasks: depth=3 red-contract -->

### Task 1 — install the observer on both server-side factories
<!-- task: red=`pnpm vitest run tests/supabase/serverClientWiring.test.ts` red-state=authored red-target=`lib/supabase/server.ts:98` why=`this line composes makeRetryingFetch over the raw fetch with no observer between them, so every attempt the cookie-bound client makes is unobserved` ac=AC-1 -->

RED: new cases in the existing wiring suite. The cookie-bound client OBSERVES a 502 and still retries it (proving the observer is under the retry wrapper, so it sees every attempt rather than the replayed outcome); the service-role client OBSERVES a 502; the service-role client's observation does NOT persist, driven through the real sink; and a `globalThis.fetch` swapped AFTER construction is honoured.

GREEN, with the composition REQUIRED rather than merely pinned:

```
cookie-bound:  retry → observer → injector → real fetch
service-role:  observer → (late-bound) real fetch
```

The observer sits OUTSIDE the test injector deliberately. The injector short-circuits its inner fetch while faults remain, so an observer placed inside it would never see a forced 502 and AC-4's local proof would be impossible. "Innermost" therefore means innermost of the PRODUCTION wrappers.

The service-role install uses a late-binding thunk, `(input, init) => globalThis.fetch(input, init)`, reproducing today's per-request resolution exactly. An eager capture would pin the transport at factory-call time and break §3.3's suites.

**Relitigation pre-empt for the diff brief.** `serverClientWiring.test.ts` records that "a design that extended an observer to the service-role client re-opened exactly this recursion". That finding is what the ratified fence CORRECTS: the fence belongs on the log level, not the client scope. The old design emitted at a persisting level; this one emits at `debug`, which the `app_events` level CHECK makes unable to persist.

Regression gate: the three suites in §3.3, plus `tests/supabase/upstreamFaultInjectorContract.test.ts`.

### Task 2 — walked server-client coverage guard
<!-- task: red=`pnpm vitest run tests/supabase/_metaServerClientObserverCoverage.test.ts` red-state=authored red-target=`lib/supabase/server.ts:142` why=`this server-side construction is unguarded: a fourth one can be added beside it and no suite in the tree fails` ac=AC-3 -->

Walks `app`, `lib`, `components` with the shared `walkSourceFiles` and the shared source-extension constant rather than a privately re-declared regex — `tests/supabase/retryableRpcVolatilityScan.ts:101-105` records why the shared constant covers the whole JS/MDX family, including a round-5 probe where an MDX call site returned no literals and no violations while the compiler happily emitted the call. Strips comments and string literals before matching, per §3.2.

Premise, via `tests/_shared/premise.ts`: assert the walk found the three known factories BEFORE asserting anything about exemptions. Without it an empty walk — a wrong root, an extension miss — passes vacuously, which is the exact shape the cited finding records.

The four controls of §3.2 ship in the same commit as the scanner.

### Task 3 — the capture chain, BOTH halves
<!-- task: red=`pnpm vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts` red-state=authored red-target=`.github/workflows/app-e2e.yml:188` why=`this run step redirects nowhere and no following step extracts anything, so a record that reached the job output would still not be surfaced` ac=AC-4 -->

**Half 1, `playwright.config.ts`:** `stdout: "pipe"` on the FIRST `webServer` entry, the port-3000 baseline server, which `app-e2e.yml` boots via `BASELINE_SERVER_ONLY`. Blast radius stated: `crew-e2e` boots the same entry via `CREW_E2E_ONLY`, so its logs also gain the server's stdout. More output, not different behaviour.

**Half 2, `.github/workflows/app-e2e.yml`:** the redirect shape from spec §7.2. Structural assertions, via the `yaml` parser the suite already imports:

- the invocation stays inline with a redirect and NO pipe;
- **no step in the app-e2e job carries a `shell:` key** — the breaker invisible from reading either file alone;
- the replay step exists, carries `if: always()`, and its `run:` names the log file;
- the extract step carries `id:` AND `if: always()`, and its `run:` both greps the fault code and writes the count to `$GITHUB_OUTPUT`;
- the dump step carries `if: always()` AND references `steps.<that id>.outputs`.

**The last three are the anti-tautology repair, and round 1 was right that the first draft needed it.** Asserting only "an extract step exists with an id" passes while that step greps the wrong string, writes no output, or is skipped exactly when the run failed — which is to say it passes while a failed app-e2e produces no visible fault records at all. The assertions pin the COMMANDS and the conditions, not the presence of steps.

**Half 1 gets its own assertion, in the same suite.** Round 1's sharpest instance: every assertion above can pass while `playwright.config.ts` still lacks `stdout: "pipe"`, and then every record stays inside Playwright and the whole chain is decorative. So the suite also asserts that the baseline `webServer` entry sets `stdout: "pipe"`. A structural check on the config file, alongside the ones on the workflow, because the chain is only as real as its weaker half.

Regression gate: `_metaE2eWorkflowCoverage` must still report all twenty app-e2e specs covered. That is the check that would have caught the original design, and it costs one command.

**The end-to-end proof is a LOCAL run, and the plan says so rather than pretending CI can do it.** Spec AC-4 requires a record observed in the captured stream against an injected fault. No CI assertion can supply that: §2 of the spec measures 2 to 6 ambient faults per attempt, so a CI grep finding the code proves only that the gateway faulted, never that the injected request produced the record. So Task 3 ends with a one-time local verification, its command and output pasted into the closeout: boot the baseline server with `ENABLE_TEST_AUTH`, drive one request carrying `x-test-force-upstream-502`, and show the `SUPABASE_UPSTREAM_FAULT` line arriving in the redirected log. It crosses all three boundaries the structural assertions cannot — the Supabase client, Playwright's stream forwarding, and the workflow redirect — and it is the only step in this plan whose evidence is a transcript rather than an assertion.

**Task 4 is DROPPED by the ratified disposition.** The page-segment settle helper is not built. Named here, without a task heading, so the commit numbering below still matches this plan rather than silently renumbering.

### Task 5 — mutation enrollment and measured score (AFTER absorbing `origin/main`)
<!-- task: red=`pnpm vitest run tests/mutation/enrolmentPresence.test.ts` red-state=authored red-target=`lib/supabase/observeTransport.ts:1` why=`this module is guard-shaped with two referring suites and no registry row, so nothing measures whether its suites pin it` ac=AC-6 -->

One row: `id: "observeTransport"`, `sourcePath: "lib/supabase/observeTransport.ts"`, both harness files as `suitePaths`, `operators: [...OPERATOR_NAMES]`, `scoreFloor: 0.9`, `accepted: []`, and a control the suites demonstrably notice. Candidate: `from: "return status >= 500;"` `to: "return status > 500;"`, which the "every 5xx records" plant kills. Verified `from` occurs in the source at plan time.

**Also owed, and measured rather than estimated.** Enrolment puts both harness suites under `tests/mutation/_metaPremiseContract.test.ts`, which walks enrolled suites. `classifyTests` against this tree:

```
tests/supabase/observeTransport.plantFour.test.ts:      total=14, all environment-touching, 1 with an exemption
tests/supabase/observeTransport.recursionFence.test.ts: total=4,  all environment-touching, 1 with an exemption
```

So `EXPECTED_ENV_TOUCHING` takes `14` and `4` — per suite, not a combined 18 — and **sixteen of the eighteen cases need their `no-premise:` exemption written**.

**These numbers are RE-MEASURED, and the first version of this plan had them wrong for an instructive reason.** It said 10 and 4, measured before rounds 3 and 4 added three plants and one transparency case. A count derived from a measurement goes stale the moment the measured thing changes, and here the measured thing was changed by the very review rounds that were hardening it. Re-run `classifyTests` at implementation time rather than trusting this paste; `EXPECTED_ENV_TOUCHING: 10` would have failed `_metaPremiseContract` and blocked the score run AC-6 depends on. The exemption is the honest form: the classifier reports a case as touching for what the wrapper CAN reach, not what the test does, and these drive an injected stub.

**Sequencing.** `#894` (merged `e381de76e`) added an accepted-row symbol-correspondence oracle under tests/mutation/, an oracle that WALKS registry rows. This task lands only after the branch absorbs `origin/main`, which happens on Eric's word because ledger merges are serialized.

`_metaGuardSurfaceRegistry` is NOT the red for this task and cannot be: it validates rows already present and never discovers an unenrolled module, which `tests/mutation/enrolmentPresence.test.ts:4` states in as many words. That suite is the one that fails for ABSENCE, so it is the red.

Then `pnpm heavy:mutation pnpm mutation:guards`, and the MEASURED score for every affected surface goes on the `GUARD SURFACE:` line of the round-1 diff brief. Re-derived, never quoted.

<!-- tasks: end -->

<!-- tasks: depth=3 -->

### Task 6 — graduate both rows (the PR's LAST commit)
<!-- task: red=`pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts` ac=AC-7 -->

The red command is `_metaDeferralLedgerGraduation`, not `_metaLedgerInProgress`, for the reason below: only the former can be made to fail while these two rows sit open. `_metaLedgerInProgress` still runs as part of the suite, but it is not the proof.

Task 6 sits in its OWN task region, without the `red-contract` attribute the region above carries. The reason is mechanical rather than a dodge: a `red-contract` marker requires a `red-target=` naming a production surface, and this task's defective surface is a root-level ledger file, which the marker grammar rejects as bare-filename shorthand. The red is still stated in prose below, and the same command still goes red then green.

Both rows move to `BACKLOG-archive.md` carrying spec §9 and §9a, and the IN PROGRESS markers come off in the SAME commit. Last commit of the PR, before the merge, never after.

**The task extends `tests/docs/_metaDeferralLedgerGraduation.test.ts`, because its own red command cannot prove AC-7.** Round 1 established the gap: `_metaLedgerInProgress` validates opted-in flight markers and forbids in-progress entries inside archives, and it is green when both rows simply stay OPEN with no markers at all. So the task could do nothing and its command would pass. The graduation suite is where archive membership and provenance already live, so this task adds to it:

- both ids resolve in `BACKLOG-archive.md` and in neither open ledger;
- each archived body carries the documented limits it graduated with, keyed on the section anchors rather than on prose;
- the diff introduces no new `BL-`/`DEF-` id anywhere, which is Eric's directive made checkable rather than remembered.

The third is the one worth having beyond this arc: a directive nobody can verify is a directive that decays. Stated as a check it survives the arc that was told it.

`BACKLOG.md` conflict resolution, if any, by set arithmetic with one extractor on both parents: open = main's open minus rows this branch archived; archive == exact union; assert zero rows both open and archived and zero lost. Cut rows heading-to-any-next-heading.

<!-- tasks: end -->

## 6. Checklist

- [ ] Tasks 1-3 implemented TDD, one commit each
- [ ] Absorb `origin/main` on Eric's word
- [ ] Task 5: registry row, `EXPECTED_ENV_TOUCHING`, twelve exemptions, measured score
- [ ] Self-review
- [ ] Adversarial review (cross-model), plan stage, to APPROVE
- [ ] Whole-diff cross-model review to APPROVE
- [ ] Twelve required checks green (GraphQL `statusCheckRollup`, 5-minute floor, one query per poll, RATE_LIMIT means no information)
- [ ] Task 6 lands LAST
- [ ] READINESS to bl-orch; do NOT merge

## 7. Working rules adopted mid-arc

- Stage explicit paths, never `git add -A`: `tests/specLint/cli.test.ts` writes scratch inside the tracked tree during a full run.
- Before every codex-guard dispatch, grep the brief and print counts for REVIEWER ONLY, the consequence bound, `PROBE DOMAIN:`, the threat fence, and the VERDICT/FINDINGS instruction. Every count must be 1.
- Run the guard that READS a surface before designing against it. Two review rounds here were spent on shapes an existing guard already rejected.
