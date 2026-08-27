<!-- spec-lint: not-ui — waives the Dimensional Invariants and Transition Inventory sections only. The one components/ file, GlobalErrorListener.tsx, is declared `: null` with one render return, so there is no fixed-dimension parent, no flex or grid child, and no visual state pair to inventory. This is NOT an invariant-8 exemption: the impeccable dual gate runs on that file, per Task 12. -->

# Plan — observe error telemetry

**Spec:** `docs/superpowers/specs/observability/2026-08-26-observe-error-telemetry.md` (APPROVED to proceed by bl-orch 2026-08-27 00:44 after four spec rounds; no round 5) · **Branch:** `fix/observe-error-telemetry` · **Base:** `44b0d74b1`

Three deliverables: an emit on the one dark branch in `lib/admin/loadRecentAutoApplied.ts`, a structural walker over `lib/admin/**` plus the 87-site sweep it derives, and a client-side projection that stops non-`Error` crash values collapsing to `"[object Object]"` and being deduped away.

No new `BL-`/`DEF-` row of any facing (Eric's directive, 2026-08-25). Everything found is repaired here or recorded as a documented limit on the surface that owns it.

## Population, re-derived on this base

Measured on `44b0d74b1` after the rebase, not carried forward from the pre-rebase measurement:

| | count |
| --- | ---: |
| constructions (population) | 100 |
| — object literals | 77 |
| — const aliases | 23 |
| files holding a site / parsed | 19 / 61 |
| already satisfied | 9 |
| exempt as propagation | 4 |
| **reported, repaired here** | **87** |

`origin/main` moved twice during the spec stage (#908, #909) and touched nothing under `lib/admin/`, `lib/observe/`, `lib/log/`, `components/observe/` or `app/api/observe/`. The figures are identical to the pre-rebase run, which is a result rather than an assumption.

## Meta-test inventory


<!-- spec-lint: ignore — this file is created by this plan's implementation and is not tracked yet -->
**CREATES:** `tests/admin/_metaInfraEmitCover.test.ts` — walks `lib/admin/**` from disk and asserts every construction of an `infra_error` result is preceded by a code-carrying, object-payload emit or is an exempt propagation. Fails by default for a new file.

**EXTENDS:** `tests/admin/_metaInfraContract.test.ts` (`infraRegistry`) — rows for any swept file lacking one, per invariant 9. `tests/log/_auditableMutations.ts` (`NEW_FORENSIC_CODES`) — every code this arc adds.

**Declared N/A:** advisory-lock topology (no `pg_advisory*` in the diff; every surface is a read or a client-side wire). `tests/messages/_metaAdminAlertCatalog.test.ts` (no `admin_alerts.upsert`). `tests/admin/no-inline-email-normalization.test.ts` (no email boundary). `tests/log/_metaMutationSurfaceObservability.test.ts` re-walks `app/api/observe/client-error/route.ts` from disk, but that file does not change (spec §6.5), so no row moves.

**Layout-dimensions task: N/A.** No fixed-dimension parent and no flex or grid child anywhere in the diff; the one `components/` file renders `null` on its only render path.

**Transition-audit task: N/A.** No `AnimatePresence`, no ternary render, no visual state, so there are no state pairs to inventory.

## RED validity, stated once for the whole plan

Every RED below names the production line whose absence or defect makes it fail. A RED that would go green when the *test file* changes rather than when the implementation lands is invalid by construction, so each task states its production anchor explicitly. Tasks whose assertions pass on day one are labelled REGRESSION PIN, not RED, and their value is the `afterAll` set-equality that fails when they stop running.

<!-- tasks: depth=2 -->

## Task 1 — the scanner's syntactic core

<!-- task: red=`pnpm exec vitest run tests/admin/infraEmitScan.test.ts` ac=AC-1 -->


<!-- spec-lint: ignore — this file is created by this plan's implementation and is not tracked yet -->
Create `tests/admin/infraEmitScan.ts` — pure functions over a parsed source file, taking a resolver as a parameter so the core stays a function of text (spec §5.1). Create its suite with the eighteen cases of spec §5.7, fourteen expecting a report.

**RED anchor, and it is the weakest in this plan — declared rather than dressed up.** The module does not exist, so the suite fails to import. That is module-absence, not a production defect, and adding the module can green it without any `lib/` change. The plan's own RED-validity rule flags exactly this shape, and the honest answer is that a brand-new module's unit suite has no other first red available. Two things carry the discriminating power instead:

- every report case asserts the reported **reason**, so a core that reports everything for the wrong cause fails while a bare "something was reported" assertion would pass;
- the strong red for this deliverable lives in Task 2, whose failure is 87 production sites and which no edit to a test file can satisfy.

If Task 1 were the only guard on the scanner, that would be a defect. It is not: Task 2 exercises the same core against the live tree.

**Anti-tautology.** The four resolver-dependent cases (`const-alias`, in-cover callee, out-of-cover callee, object-vs-scalar payload) run through a stub resolver whose answers the test controls, so the core's own branching is under test rather than the checker's.

**Concrete failure mode caught:** a core that classifies the `else` arm of a propagation guard as propagation, or accepts an emit lexically after the return.

## Task 2 — the cover meta-test and the whole 87-site sweep, in one commit

<!-- task: red=`pnpm exec vitest run tests/admin/_metaInfraEmitCover.test.ts` ac=AC-2,AC-5 -->

**Why this is one task and not three.** An earlier draft split the walker from the sweep and the sweep into two halves. Each intermediate commit then left the cover test red — the suite asserts an empty reported set, and a half-swept tree does not have one. That breaks per-task TDD and the standing "whole tree green before every push" rule for the whole span. Splitting a class-sweep across commits buys nothing the class-sweep default wants: the repair is 87 mechanical emits, and they belong in one commit with the guard that derives them.


<!-- spec-lint: ignore — this file is created by this plan's implementation and is not tracked yet -->
Create `tests/admin/_metaInfraEmitCover.test.ts`: build a `ts.Program` over `lib/admin/**`, supply construction and callee resolution from the checker, apply the Task 1 core, assert the reported set is **empty**. In the same commit, repair all 87 reported sites.

**No expected count is pinned.** The walker's output is the derivation; a number in the assertion is a second source that goes stale (spec §7.1). The population table above is a dated measurement, not a contract this suite enforces.

**RED anchor:** the 87 unrepaired sites in `lib/admin/**` — production lines. Write the suite first, watch it report 87 with their file and reason, then repair. No edit to a test file can turn that red green.

The sites, for sequencing only — the walker's output is authoritative:

| files already importing `log` (reuse the established `source`) | files needing the import and an `admin.<basename>` source |
| --- | --- |
| `loadNeedsAttention` 19, `bellFeed` 6, `identityHolds` 4, `healthAlerts` 3, `loadAlertSummary` 3, `loadTelemetryStats` 3, `readShowReviewSnapshot` 2 | `driveConnectionHealth` 15, `needsAttentionCount` 10, `healthRollup` 6, `loadIgnoredSheets` 3, `loadIgnoredWarnings` 3, `roleTokenMappings` 3, `lookupStagedRow` 2, `watchSurfaceState` 2, `embeddedAdminEmails` 1 |

That is 40 + 45 = 85, plus the 2 in `loadRecentAutoApplied` that Task 3 repairs = 87. Task 3 runs first, so this task's own red is 85 by the time it is written; the assertion is emptiness either way, which is why no count is pinned.

`readShowReviewSnapshot`, `loadAlertSummary` and `loadTelemetryStats` each also hold an `error: X.message` site, reported for the same reason the loader's is (spec §9 limit 3).

Add `infraRegistry` rows to `tests/admin/_metaInfraContract.test.ts` for any swept file lacking one — `roleTokenMappings` and `embeddedAdminEmails` are known missing; re-grep the rest rather than trusting that list.

**Premises, executable and unconditional** (spec §5.6), stated with `premise`/`premiseHolds` from `tests/_shared/premise.ts`, at the top level of the suite body and never inside a `.each` callback:

1. **The checker-resolved population equals the population an independent syntax-only pass computes.** The second pass takes no checker: object-literal returns, plus identifier returns whose name binds to a module-level const initialized to an infra literal, resolved by name within the file. Two implementations that share no resolution code must agree on the count, and the failure prints the symmetric difference by file and line. This is what closes partial discovery — an earlier draft asserted only "≥1 site per file that textually matches", which a resolver retaining one site per file satisfies while dropping every other.
2. Both construction shapes are witnessed (≥1 `literal`, ≥1 `const-alias`).
3. Both classification arms are witnessed (≥1 `exempt-propagation`, ≥1 `satisfied`).
4. **The checker resolved usefully**, not merely that it answered: on a known object-typed emit payload the resolved type must satisfy the positive object test, and on a known scalar payload it must fail it. A broken program yields `any`, which the positive predicate (spec §5.4) reports rather than accepts — but this premise says so out loud instead of leaving a wall of reports to be read as real findings.


## Task 3 — the loader's dark branch and the five-code table

<!-- task: red=`pnpm exec vitest run tests/admin/loadRecentAutoApplied.test.ts` ac=AC-3,AC-4 -->

Replace the four-way table at `tests/admin/loadRecentAutoApplied.test.ts:299-318` with the five-row derived table of spec §4.3, driven through `setLogSink` so assertions read the record after `buildRecord` has run `serializeError` (`lib/log/logger.ts:38`). Add the emit at `lib/admin/loadRecentAutoApplied.ts:174-176`; pass `error` whole at `lib/admin/loadRecentAutoApplied.ts:247`.

**RED anchors, both production:** there is no `log.*` call between `lib/admin/loadRecentAutoApplied.ts:174` and `lib/admin/loadRecentAutoApplied.ts:176`, so the `errorOn: "from"` row finds no record; and `lib/admin/loadRecentAutoApplied.ts:247` passes `error.message`, so `context.error` is a string and the `errorOn: "rpc"` row's object assertion fails.

**Anti-tautology.** The fake's error objects gain `code` and `details` (extending the shapes at `tests/admin/loadRecentAutoApplied.test.ts:78-81` and `tests/admin/loadRecentAutoApplied.test.ts:109`), and the assertion reads the expected `code` **from the fixture constant**. A hardcoded `"42501"` would pass against a fake that stopped supplying it. An `afterAll` set-equality over the five declared codes means a row that silently stops running fails the suite — and per spec §4.3 that equality is a claim about the declared list, not about production source; the walker in Task 2 is what catches a sixth return site.

**Concrete failure mode caught:** someone re-flattens the rpc emit to `.message`, discarding `code`/`details`/`hint` while the code still appears in `app_events`.

## Task 4 — register every new forensic code

<!-- task: red=`pnpm exec vitest run tests/log/_metaAdminOutcomeContract.test.ts` ac=AC-6 -->

Add every code this arc introduces to `NEW_FORENSIC_CODES` (`tests/log/_auditableMutations.ts`), in one edit with one comment block naming the arc.

**This task is a REGRESSION PIN, not a RED.** Assertion 4 at `tests/log/_metaAdminOutcomeContract.test.ts:87-91` is a leak check: it asserts registered codes never appear in the §12.4 producer set. Omitting a code is invisible to it. Registration is the assertion "this code must never become a catalog row"; the task exists because that assertion is worth making, not because a test currently fails.

## Task 5 — describeClientValue

<!-- task: red=`pnpm exec vitest run tests/observe/describeClientValue.test.ts` ac=AC-7 -->


<!-- spec-lint: ignore — this file is created by this plan's implementation and is not tracked yet -->
Create `lib/observe/describeClientValue.ts` per spec §6.2 — `tag()` derived from the runtime, `render()` writing leaves with `String()` rather than JSON's number grammar — importing only `@/lib/log/serializeError` by its own path.

Port the committed probe `docs/superpowers/specs/observability/probes/2026-08-26-client-value-projection.ts` into the suite as a table test over its 25 pairs. **Four pairs assert the collision** — the two `-0` pairs under spec §9 limit 6, and the same-second `Date` and `RegExp` `lastIndex` pairs under limit 7 — because asserting that they discriminate would assert a falsehood. The other 21 assert discrimination. Plus the §6.3 guard table, every row.


<!-- spec-lint: ignore — this file is created by this plan's implementation and is not tracked yet -->
**RED anchor:** `lib/observe/describeClientValue.ts` does not exist. The assertion-level red is the §6.3 table: today no code produces a type-tagged `detail` for any value.

**Anti-tautology.** Expected values are derived from the fixture — the test builds `{ code, message }` from local constants and asserts `message === \`${code}: ${message}\`` — so a projection dropping one field fails. No rendered string is written as a literal.

**Concrete failure mode caught:** a later edit swaps `render` back to `JSON.stringify`, and `{a: NaN}` starts colliding with `{a: null}` again.

## Task 6 — the dedup signature gains `detail`

<!-- task: red=`pnpm exec vitest run tests/observe/clientErrorTransport.test.ts` ac=AC-9 -->

Add the `detail` term to the signature at `lib/observe/clientErrorTransport.ts:32`, sliced at 200 to match the `stack` term beside it.

**RED anchor:** `lib/observe/clientErrorTransport.ts:32` — the shipped signature has four terms and ignores `detail`. The test drives `clientErrorTransport` **directly** with two inputs sharing `source`, `level` and `message` and differing only in `detail`, and asserts two POSTs. Asserting only through `reportClientError` would let a lucky `message` difference pass a broken signature.

**Four pre-dispatch mutants**, run and recorded in the commit, since this is a string-presence guard over the signature:

- (a) `detail` emptied on both inputs — expect **one** POST, proving the term is not merely always-distinct.
- (b) one `detail` given an appended suffix — expect **two**.
- (c) **the cap pinned by a boundary pair, not by a long-prefix control.** Two inputs whose `detail` values are identical for 200 characters and differ at index 200 — expect **one** POST; two whose values differ at index 199 — expect **two**. An earlier draft used a single over-long pair, which any positive cap at or below the shared prefix satisfies and which therefore pins nothing. The pair brackets the boundary, so only 200 passes both halves.
- (d) each of `source`, `level`, `message`, `stack` varied in turn — expect **two** each, proving the other terms still discriminate.

**The `Error` path's key changes shape, and the earlier claim that it stays byte-identical was wrong.** The current key ends after the stack term (`lib/observe/clientErrorTransport.ts:32`); adding a fifth term appends a `|` even when `detail` is empty. What is preserved is the **behaviour**: the empty term is constant across every `Error` call, so no two previously-distinct keys merge and no two previously-equal keys split. The test asserts that — an `Error` deduped once still dedups once, and two distinct `Error`s still produce two POSTs — rather than comparing key bytes, which are an implementation detail no assertion should reach for.

## Task 7 — reportClientError routes non-`Error` values through the projection

<!-- task: red=`pnpm exec vitest run tests/observe/reportClientError.test.ts` ac=AC-8 -->

Rewrite `toError` at `lib/observe/reportClientError.ts:11-14` as the `toWire` of spec §6.5. The `Error` arm keeps today's exact wire bytes.

Add the five non-`Error` cases of spec §7.3 plus the two-distinct-objects test.

**RED anchor:** `lib/observe/reportClientError.ts:13` returns `{ message: String(e) }`. Per spec §7.1 the five cases are red for **different** reasons and each asserts its own: a plain object and `{}` are red on `message`; a string, `null` and a `Map` are red on `detail`, which this path does not send at all today, and on the type tag.

**Anti-tautology.** The two-distinct-objects test asserts `fetch` was called twice **and** that the two bodies differ in `detail` — a projection returning a constant non-empty string satisfies the weaker form and fails this one.

## Task 8 — GlobalErrorListener, both handlers

<!-- task: red=`pnpm exec vitest run tests/observe/globalErrorListener.test.tsx` ac=AC-10,AC-11 -->

Rejection handler: the non-`Error` arm takes the projection's `detail` (spec §6.7). Window-error handler: append the projection's detail when `event.error` is a non-`Error` value, keeping the `filename:lineno` prefix.

Update the two existing string-reason assertions at `tests/observe/globalErrorListener.test.tsx:42-53` and `tests/observe/globalErrorListener.test.tsx:56-64`, whose expectations change by the seven-character tag. Both stay derived from the fixture, so the cap assertion still fails if `DETAIL_CAP` moves.

**RED anchors, both production:** `components/observe/GlobalErrorListener.tsx:41-44` calls `String()` on a non-`Error` reason, and `components/observe/GlobalErrorListener.tsx:27-37` never reads `event.error` at all.

**Concrete failure mode caught:** a component throws a plain object at the window and its fields vanish entirely — not collapsed to `"[object Object]"` like the other two paths, simply absent.

## Task 9 — headers and documented limits

<!-- task: red=`pnpm exec vitest run tests/docs/_metaLedgerMintBar.test.ts` ac=AC-12 -->


<!-- spec-lint: ignore — this file is created by this plan's implementation and is not tracked yet -->
Write each spec §9 limit into the header of the surface that owns it, with its re-run trigger. The mapping is exhaustive over the twelve limits, because an earlier draft named a limit that does not exist and omitted three that do:

| limit | recorded in |
| --- | --- |

<!-- spec-lint: ignore — this file is created by this plan's implementation and is not tracked yet -->
| 1 `Map`/`Set` degrade, 2 truncated `detail` not JSON, 6 `-0`, 7 `Date`/`RegExp`, 8 both-caps dedup | `lib/observe/describeClientValue.ts` header |
| 3 `.message` invisible to the pre-flatten guard, plus the five out-of-cover sites and the grep that finds them | `tests/log/noDoubleSerializedLogError.test.ts` header |

<!-- spec-lint: ignore — this file is created by this plan's implementation and is not tracked yet -->
| 4 the cover stops at `lib/admin/**` | `tests/admin/_metaInfraEmitCover.test.ts` header |

<!-- spec-lint: ignore — this file is created by this plan's implementation and is not tracked yet -->
| 5 injected `loadHolds` double, 11 reconstructed partial object, 12 no value or control-flow resolution | `tests/admin/infraEmitScan.ts` header |
| 9 `null`/`undefined` reasons collapse | beside the `== null` branch in `components/observe/GlobalErrorListener.tsx` |
| 10 `context`-only `clientLog` callers | row 2's archive entry, written in Task 11 |

Limit 10 is the one this task does **not** write, because spec §12 assigns it to the archive entry; AC-12 is met only when Task 11 has written it, and the two tasks are ordered accordingly.

**This task is a REGRESSION PIN.** Nothing currently fails; the named suite only proves no ledger row was filed, which is the directive this task honours by writing limits instead of rows.

## Task 10 — impeccable dual gate

<!-- task: red=`pnpm exec vitest run tests/docs/_metaInvariant8Closeout.test.ts` ac=AC-13 -->

**This is a GATE, not a TDD task, and the named suite is a marker-grammar check rather than a test of production behaviour.** It is listed with a red command because the closeout marker must parse, and a malformed one fails that suite; running the gate itself is not something any assertion here observes.

Run `/impeccable critique` and `/impeccable audit` on `components/observe/GlobalErrorListener.tsx`, both with the canonical v3 setup gates (the skill's context load, then the register reference read). Record findings and dispositions in the closeout section.

**The marker must match the enforced grammar exactly.** `tests/docs/_invariant8Closeout.ts:44-45` anchors it:

```
impeccable-gate: critique=RAN audit=RAN p0=<int> p1=<int> dispositions=recorded
```

`critique=` and `audit=` take `RAN` or `RAN-DEGRADED`; `p0=`/`p1=` are integers with no leading zeros; `dispositions=` is `recorded` or `none`. An earlier draft prescribed free prose after the colon, which that regex rejects outright — the marker would have been malformed and the task could not have gone green by following its own instructions. Fill `p0`/`p1` from the actual run.

The `N/A` form is **not** taken: invariant 8 defines a UI surface by path (`AGENTS.md:20`), and the grammar test validates syntax rather than authorizing an exemption (spec §12).

## Task 11 — archive both rows

<!-- task: red=`pnpm exec vitest run tests/docs/_metaLedgerInProgress.test.ts` ac=AC-14 -->

Graduate both rows to `BACKLOG-archive.md` with the evidence spec §12 requires. Remove both `IN PROGRESS` markers **in the PR's last commit**, before the merge, so no marker reaches main (invariant 12).

**This is a REGRESSION PIN, and the earlier draft mislabelled it as a red.** The suite is green today and stays green through the correct atomic edit; it only fails if the archive move and the marker removal are split across commits, which is a mistake this task is arranged not to make. What it pins is that ordering constraint — an archive holding an in-flight entry, or a marker reaching main — and that is worth pinning even though the happy path never reds.

<!-- tasks: end -->

## Acceptance criteria

- **AC-1** the core classifies each of the eighteen §5.7 cases with the right reason
- **AC-2** no `lib/admin` construction of an `infra_error` lacks a code-carrying object-payload emit, derived from disk, with all four premises met
- **AC-3** the `show_change_log` returned-error branch emits `SHOW_CHANGE_LOG_READ_RETURNED_ERROR`
- **AC-4** every loader emit's `context.error` carries the PostgREST fields, not a bare message
- **AC-5** every swept file has an `infraRegistry` row
- **AC-6** every new forensic code is in `NEW_FORENSIC_CODES`
- **AC-7** `describeClientValue` satisfies the §6.3 table and the 25-pair corpus, four of which assert their documented collision
- **AC-8** no non-`Error` crash reaches the wire as `"[object Object]"`
- **AC-9** two inputs differing only in `detail` produce two POSTs; the `Error` path's key is unchanged
- **AC-10** a plain-object rejection reason persists its own fields in `detail`
- **AC-11** a non-`Error` window throw persists `event.error`'s fields
- **AC-12** every §9 limit is recorded on its owning surface with a re-run trigger
- **AC-13** the impeccable dual gate ran and its dispositions are recorded
- **AC-14** both rows are archived and no `IN PROGRESS` marker reaches main

## Checklist

- [ ] Tasks 1-11 (TDD per invariant 1; whole tree green under `pnpm heavy` before every push)
- [ ] Plan self-review
- [ ] **Adversarial review (cross-model)** — Codex, plan stage. Brief carries the closed criterion and `PROBE DOMAIN: lib/admin/**` plus the walker, per bl-orch's condition of 2026-08-27. A same-class finding is repaired by DECLINING or by a type category, never by a wider recognizer.
- [ ] Whole-diff adversarial review to APPROVE
- [ ] Twelve required checks green on a non-stale base
- [ ] READINESS report to bl-orch at `wP:p1A`; merge is bl-orch's word, never this arc's
