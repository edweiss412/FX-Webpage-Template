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


<!-- spec-lint: ignore — this file is created by this plan's implementation and is not tracked yet -->
**RED anchor:** `tests/admin/infraEmitScan.ts` does not exist, so the import fails. That is a module-resolution red and therefore weak on its own; the assertion-level red is that each case asserts the reported **reason**, and no reason-producing code exists until the core does.

**Anti-tautology.** Each report case asserts the reason string, not merely that something was reported — a core that reported everything for the wrong cause fails. The four resolver-dependent cases (`const-alias`, in-cover callee, out-of-cover callee, object-vs-scalar payload) are driven through a stub resolver whose answers the test controls, so the core's own logic is what is under test rather than the checker's.

**Concrete failure mode caught:** a core that classifies the `else` arm of a propagation guard as propagation, or that accepts an emit lexically after the return.

## Task 2 — the resolving layer and the cover meta-test

<!-- task: red=`pnpm exec vitest run tests/admin/_metaInfraEmitCover.test.ts` ac=AC-2 -->


<!-- spec-lint: ignore — this file is created by this plan's implementation and is not tracked yet -->
Create `tests/admin/_metaInfraEmitCover.test.ts`: build a `ts.Program` over `lib/admin/**`, supply construction and callee resolution from the checker, apply the Task 1 core, assert the reported set is **empty**.

**No expected count is pinned.** The walker's output is the derivation; a number in the assertion is a second source that goes stale (spec §7.1). The §"Population" table above is a dated measurement, not a contract this suite enforces.

**RED anchor:** the 87 unrepaired sites in `lib/admin/**` — production lines, not test fixtures. This red is discharged by Tasks 4, 5 and 6, and by nothing this test file can do to itself.

**Premises, executable and unconditional** (spec §5.6), stated with `premise`/`premiseHolds` from `tests/_shared/premise.ts`, each at the top level of the suite body and never inside a `.each` callback:

1. every `lib/admin/**` file whose text holds both `kind: "infra_error"` and `return` contributes ≥1 site to the population — evidence derived from file text, which the resolver does not compute;
2. both construction shapes are witnessed (≥1 `literal`, ≥1 `const-alias`);
3. both classification arms are witnessed (≥1 `exempt-propagation`, ≥1 `satisfied`);
4. the program built and the checker answered a type query.

Premise 1 is the one that closes the zero-population pass. A resolver that silently stops emitting sites fails it on the first file and the message names that file.

## Task 3 — the loader's dark branch and the five-code table

<!-- task: red=`pnpm exec vitest run tests/admin/loadRecentAutoApplied.test.ts` ac=AC-3,AC-4 -->

Replace the four-way table at `tests/admin/loadRecentAutoApplied.test.ts:299-318` with the five-row derived table of spec §4.3, driven through `setLogSink` so assertions read the record after `buildRecord` has run `serializeError` (`lib/log/logger.ts:38`). Add the emit at `lib/admin/loadRecentAutoApplied.ts:174-176`; pass `error` whole at `lib/admin/loadRecentAutoApplied.ts:247`.

**RED anchors, both production:** there is no `log.*` call between `lib/admin/loadRecentAutoApplied.ts:174` and `lib/admin/loadRecentAutoApplied.ts:176`, so the `errorOn: "from"` row finds no record; and `lib/admin/loadRecentAutoApplied.ts:247` passes `error.message`, so `context.error` is a string and the `errorOn: "rpc"` row's object assertion fails.

**Anti-tautology.** The fake's error objects gain `code` and `details` (extending the shapes at `tests/admin/loadRecentAutoApplied.test.ts:78-81` and `tests/admin/loadRecentAutoApplied.test.ts:109`), and the assertion reads the expected `code` **from the fixture constant**. A hardcoded `"42501"` would pass against a fake that stopped supplying it. An `afterAll` set-equality over the five declared codes means a row that silently stops running fails the suite — and per spec §4.3 that equality is a claim about the declared list, not about production source; the walker in Task 2 is what catches a sixth return site.

**Concrete failure mode caught:** someone re-flattens the rpc emit to `.message`, discarding `code`/`details`/`hint` while the code still appears in `app_events`.

## Task 4 — sweep, files that already import `log`

<!-- task: red=`pnpm exec vitest run tests/admin/_metaInfraEmitCover.test.ts` ac=AC-2 -->

Repair the reported sites in `loadNeedsAttention` (19), `bellFeed` (6), `identityHolds` (4), `healthAlerts` (3), `readShowReviewSnapshot` (2), `loadAlertSummary` (3) and `loadTelemetryStats` (3). Reuse each file's established `source` value; add no new import.

`readShowReviewSnapshot`, `loadAlertSummary` and `loadTelemetryStats` each also hold one `error: X.message` site — repaired here, since the Task 2 walker reports them for the same reason it reports the loader's.

**RED anchor:** Task 2's assertion against these production files. Green condition is that the reported set shrinks to exactly Task 5's files — not that it is empty.

## Task 5 — sweep, files needing the import and a source

<!-- task: red=`pnpm exec vitest run tests/admin/_metaInfraEmitCover.test.ts` ac=AC-2,AC-5 -->

Repair `driveConnectionHealth` (15), `needsAttentionCount` (10), `healthRollup` (6), `loadIgnoredSheets` (3), `loadIgnoredWarnings` (3), `roleTokenMappings` (3), `lookupStagedRow` (2), `watchSurfaceState` (2), `embeddedAdminEmails` (1). Add `import { log } from "@/lib/log"` and a `source: "admin.<basename>"` value, matching the convention every other `lib/admin` emitter follows.

Add `infraRegistry` rows to `tests/admin/_metaInfraContract.test.ts` for any file here lacking one (`roleTokenMappings` and `embeddedAdminEmails` are known missing; re-grep the rest rather than trusting this list).

**RED anchor:** Task 2 against these production files. **Green condition: the reported set is empty.** 87 = Task 3's 2 + Task 4's 40 + Task 5's 45.

## Task 6 — register every new forensic code

<!-- task: red=`pnpm exec vitest run tests/log/_metaAdminOutcomeContract.test.ts` ac=AC-6 -->

Add every code this arc introduces to `NEW_FORENSIC_CODES` (`tests/log/_auditableMutations.ts`), in one edit with one comment block naming the arc.

**This task is a REGRESSION PIN, not a RED.** Assertion 4 at `tests/log/_metaAdminOutcomeContract.test.ts:87-91` is a leak check: it asserts registered codes never appear in the §12.4 producer set. Omitting a code is invisible to it. Registration is the assertion "this code must never become a catalog row"; the task exists because that assertion is worth making, not because a test currently fails.

## Task 7 — describeClientValue

<!-- task: red=`pnpm exec vitest run tests/observe/describeClientValue.test.ts` ac=AC-7 -->


<!-- spec-lint: ignore — this file is created by this plan's implementation and is not tracked yet -->
Create `lib/observe/describeClientValue.ts` per spec §6.2 — `tag()` derived from the runtime, `render()` writing leaves with `String()` rather than JSON's number grammar — importing only `@/lib/log/serializeError` by its own path.

Port the committed probe `docs/superpowers/specs/observability/probes/2026-08-26-client-value-projection.ts` into the suite as a table test over its 25 pairs. **Four pairs assert the collision** (`-0` twice, `Date` within one second, `RegExp` `lastIndex`) because they are documented limits 6 and 7; asserting that they discriminate would assert a falsehood. The other 21 assert discrimination. Plus the §6.3 guard table, every row.


<!-- spec-lint: ignore — this file is created by this plan's implementation and is not tracked yet -->
**RED anchor:** `lib/observe/describeClientValue.ts` does not exist. The assertion-level red is the §6.3 table: today no code produces a type-tagged `detail` for any value.

**Anti-tautology.** Expected values are derived from the fixture — the test builds `{ code, message }` from local constants and asserts `message === \`${code}: ${message}\`` — so a projection dropping one field fails. No rendered string is written as a literal.

**Concrete failure mode caught:** a later edit swaps `render` back to `JSON.stringify`, and `{a: NaN}` starts colliding with `{a: null}` again.

## Task 8 — the dedup signature gains `detail`

<!-- task: red=`pnpm exec vitest run tests/observe/clientErrorTransport.test.ts` ac=AC-9 -->

Add the `detail` term to the signature at `lib/observe/clientErrorTransport.ts:32`, sliced at 200 to match the `stack` term beside it.

**RED anchor:** `lib/observe/clientErrorTransport.ts:32` — the shipped signature has four terms and ignores `detail`. The test drives `clientErrorTransport` **directly** with two inputs sharing `source`, `level` and `message` and differing only in `detail`, and asserts two POSTs. Asserting only through `reportClientError` would let a lucky `message` difference pass a broken signature.

**Four pre-dispatch mutants**, run and recorded in the commit, since this is a string-presence guard over the signature: (a) `detail` emptied on both inputs — expect one POST; (b) one `detail` given an appended suffix — expect two; (c) `detail` present but past the 200-character slice on both — expect one, which pins the cap rather than the field; (d) each of `source`, `level`, `message`, `stack` varied in turn — expect two each, proving the other terms still discriminate.

**Concrete failure mode caught:** the `Error` path regressing. `detail` is absent there, so the new term must be the empty string and the key byte-identical to today's.

## Task 9 — reportClientError routes non-`Error` values through the projection

<!-- task: red=`pnpm exec vitest run tests/observe/reportClientError.test.ts` ac=AC-8 -->

Rewrite `toError` at `lib/observe/reportClientError.ts:11-14` as the `toWire` of spec §6.5. The `Error` arm keeps today's exact wire bytes.

Add the five non-`Error` cases of spec §7.3 plus the two-distinct-objects test.

**RED anchor:** `lib/observe/reportClientError.ts:13` returns `{ message: String(e) }`. Per spec §7.1 the five cases are red for **different** reasons and each asserts its own: a plain object and `{}` are red on `message`; a string, `null` and a `Map` are red on `detail`, which this path does not send at all today, and on the type tag.

**Anti-tautology.** The two-distinct-objects test asserts `fetch` was called twice **and** that the two bodies differ in `detail` — a projection returning a constant non-empty string satisfies the weaker form and fails this one.

## Task 10 — GlobalErrorListener, both handlers

<!-- task: red=`pnpm exec vitest run tests/observe/globalErrorListener.test.tsx` ac=AC-10,AC-11 -->

Rejection handler: the non-`Error` arm takes the projection's `detail` (spec §6.7). Window-error handler: append the projection's detail when `event.error` is a non-`Error` value, keeping the `filename:lineno` prefix.

Update the two existing string-reason assertions at `tests/observe/globalErrorListener.test.tsx:42-53` and `tests/observe/globalErrorListener.test.tsx:56-64`, whose expectations change by the seven-character tag. Both stay derived from the fixture, so the cap assertion still fails if `DETAIL_CAP` moves.

**RED anchors, both production:** `components/observe/GlobalErrorListener.tsx:41-44` calls `String()` on a non-`Error` reason, and `components/observe/GlobalErrorListener.tsx:27-37` never reads `event.error` at all.

**Concrete failure mode caught:** a component throws a plain object at the window and its fields vanish entirely — not collapsed to `"[object Object]"` like the other two paths, simply absent.

## Task 11 — headers and documented limits

<!-- task: red=`pnpm exec vitest run tests/docs/_metaLedgerMintBar.test.ts` ac=AC-12 -->


<!-- spec-lint: ignore — this file is created by this plan's implementation and is not tracked yet -->
Write each spec §9 limit into the header of the surface that owns it, with its re-run trigger: limits 1, 2, 6 and 7 into `lib/observe/describeClientValue.ts`; limit 3 into `tests/log/noDoubleSerializedLogError.test.ts` (including the five out-of-cover `error: X.message` sites and the grep that finds them); limits 4, 10 and 11 into the scanner and cover-test headers; limit 8 beside the `== null` branch in the listener.

**This task is a REGRESSION PIN.** Nothing currently fails; the named suite only proves no ledger row was filed, which is the directive this task honours by writing limits instead of rows.

## Task 12 — impeccable dual gate

<!-- task: red=`pnpm exec vitest run tests/docs/_metaInvariant8Closeout.test.ts` ac=AC-13 -->

Run `/impeccable critique` and `/impeccable audit` on `components/observe/GlobalErrorListener.tsx`, both with the canonical v3 setup gates. Record findings and dispositions in the closeout section. Marker line: `impeccable-gate: critique+audit run on components/observe/GlobalErrorListener.tsx, dispositions recorded`.

The N/A form is **not** taken: invariant 8 defines a UI surface by path (`AGENTS.md:20`) and the grammar test validates syntax rather than authorizing an exemption (spec §12).

## Task 13 — archive both rows

<!-- task: red=`pnpm exec vitest run tests/docs/_metaLedgerInProgress.test.ts` ac=AC-14 -->

Graduate both rows to `BACKLOG-archive.md` with the evidence spec §12 requires. Remove both `IN PROGRESS` markers **in the PR's last commit**, before the merge, so no marker reaches main (invariant 12).

**RED anchor:** `tests/docs/_metaLedgerInProgress.test.ts` rejects an archive holding an in-flight entry, so the archive move and the marker removal must land together.

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

- [ ] Tasks 1-13 (TDD per invariant 1; whole tree green under `pnpm heavy` before every push)
- [ ] Plan self-review
- [ ] **Adversarial review (cross-model)** — Codex, plan stage. Brief carries the closed criterion and `PROBE DOMAIN: lib/admin/**` plus the walker, per bl-orch's condition of 2026-08-27. A same-class finding is repaired by DECLINING or by a type category, never by a wider recognizer.
- [ ] Whole-diff adversarial review to APPROVE
- [ ] Twelve required checks green on a non-stale base
- [ ] READINESS report to bl-orch at `wP:p1A`; merge is bl-orch's word, never this arc's
