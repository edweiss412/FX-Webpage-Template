<!-- spec-lint: not-ui — waives the Dimensional Invariants and Transition Inventory sections only. The one components/ file, GlobalErrorListener.tsx, is declared `: null` with one render return, so there is no fixed-dimension parent, no flex or grid child, and no visual state pair to inventory. This is NOT an invariant-8 exemption: the impeccable dual gate runs on that file, per Task 8. -->

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

Every RED below names the production line whose absence or defect makes it fail, and **no task's first red is a missing module**. Two earlier drafts had one: a brand-new module's unit suite fails to import, which any edit to a test file can green, and declaring that weakness did not cure it. Both such tasks are now folded into the production-anchored task that needs them — the scanner into the walker sweep, `describeClientValue` into the `reportClientError` rewire — so every red below fails on a `lib/` or `components/` line.

Tasks whose assertions pass on day one are labelled REGRESSION PIN, and each says what it pins and why that is worth a task. One task is labelled GATE: it runs a process gate whose execution no assertion here observes.

<!-- tasks: depth=2 -->

## Task 1 — the loader's dark branch and the five-code table

<!-- task: red=`pnpm exec vitest run tests/admin/loadRecentAutoApplied.test.ts` ac=AC-3,AC-4 -->

**Runs first, and the ordering is load-bearing.** Task 2 repairs every site the walker reports; if it ran first it would repair the loader's two and this task's red would already be green. So the loader is repaired here, and Task 2's red is the remaining 85. 2 + 85 = 87.

Replace the four-way table at `tests/admin/loadRecentAutoApplied.test.ts:299-318` with the five-row derived table of spec §4.3, driven through `setLogSink` so assertions read the record after `buildRecord` has run `serializeError` (`lib/log/logger.ts:38`). Add the emit at `lib/admin/loadRecentAutoApplied.ts:174-176`; pass `error` whole at `lib/admin/loadRecentAutoApplied.ts:247`.

**RED anchors, both production:** there is no `log.*` call between `lib/admin/loadRecentAutoApplied.ts:174` and `lib/admin/loadRecentAutoApplied.ts:176`, so the `errorOn: "from"` row finds no record; and `lib/admin/loadRecentAutoApplied.ts:247` passes `error.message`, so `context.error` is a string and the `errorOn: "rpc"` row's object assertion fails.

**Anti-tautology.** The fake's error objects gain `code` and `details` (extending `tests/admin/loadRecentAutoApplied.test.ts:78-81` and `tests/admin/loadRecentAutoApplied.test.ts:109`), and the assertion reads the expected `code` **from the fixture constant** — a hardcoded `"42501"` would pass against a fake that stopped supplying it. An `afterAll` set-equality over the five declared codes fails when a row stops running; per spec §4.3 that is a claim about the declared list, and the walker in Task 2 is what catches a sixth return site.

**Concrete failure mode caught:** someone re-flattens the rpc emit to `.message`, discarding `code`/`details`/`hint` while the code still appears in `app_events`.

## Task 2 — the walker and the remaining 85 sites, in one commit

<!-- task: red=`pnpm exec vitest run tests/admin/_metaInfraEmitCover.test.ts` ac=AC-1,AC-2,AC-5,AC-6 -->

**One task, not three, and the scanner is inside it.** Splitting the walker from the sweep left the cover test red at every intermediate commit; splitting the scanner out gave that task a module-absence red. Both are cured the same way: the scanner, its unit suite, the cover meta-test and the 85 repairs land together, and the red is production.


<!-- spec-lint: ignore — this file is created by this plan's implementation and is not tracked yet -->
Create `tests/admin/infraEmitScan.ts` (pure functions over a parsed source file plus a resolver parameter) with its twenty-one-case unit suite from spec §5.7, fifteen expecting a report. Create `tests/admin/_metaInfraEmitCover.test.ts` (builds a `ts.Program`, supplies real resolution, applies the core, asserts the reported set is **empty**). Repair all 85.

**RED anchor:** the 85 unrepaired sites in `lib/admin/**`. Write the cover test first, watch it report 85 with file and reason, then repair. No edit to any test file turns that red green. The twenty-one unit cases are written in the same commit and are the scanner's own coverage, not its red; each is mutation-checked against the shipped core rather than trusted for passing.

**No expected count is pinned.** The walker's output is the derivation; a number in the assertion is a second source that goes stale (spec §7.1).

Sites, for sequencing only — the walker's output is authoritative:

| files already importing `log` (reuse the established `source`) | files needing the import and an `admin.<basename>` source |
| --- | --- |
| `loadNeedsAttention` 19, `bellFeed` 6, `identityHolds` 4, `healthAlerts` 3, `loadAlertSummary` 3, `loadTelemetryStats` 3, `readShowReviewSnapshot` 2 | `driveConnectionHealth` 15, `needsAttentionCount` 10, `healthRollup` 6, `loadIgnoredSheets` 3, `loadIgnoredWarnings` 3, `roleTokenMappings` 3, `lookupStagedRow` 2, `watchSurfaceState` 2, `embeddedAdminEmails` 1 |

40 + 45 = 85. `readShowReviewSnapshot`, `loadAlertSummary` and `loadTelemetryStats` each also hold an `error: X.message` site, reported for the same reason the loader's was (spec §9 limit 3).

**Two completeness claims are DERIVED here, not asserted by adding rows.** An earlier draft named the two missing registry rows and left AC-5 and AC-6 resting on that list, which is the case-list repair the orchestrator's condition forbids and which goes stale the moment a file is added. Both are now computed from the same walk that produces the reported set:

- **`infraRegistry` completeness.** Every file the walk found a construction in must appear as some `infraRegistry` entry's `path` (`tests/admin/_metaInfraContract.test.ts`). The cover file set is already in hand; the assertion is a subset check whose failure names the unregistered files. `roleTokenMappings` and `embeddedAdminEmails` are what it reports today — a result, not a list to maintain.
- **`NEW_FORENSIC_CODES` completeness.** Every `code:` string literal the scanner saw inside a `log.*` span in `lib/admin/**` must be a member of `NEW_FORENSIC_CODES` (`tests/log/_auditableMutations.ts`). The scanner already parses those object literals to find `code`; collecting the literal costs nothing, and the subset check turns "omission is invisible to the leak check" into "omission is a named failure".

  **The registry edit lands in THIS commit, and an earlier draft scheduled it into the next one.** That draft put the subset check here and the `NEW_FORENSIC_CODES` rows in a following task, which cannot work: the four #882 codes are already absent from the registry today (`grep -n 'RECENT_AUTO_APPLIED_CLIENT_THREW' tests/log/_auditableMutations.ts` returns nothing), so this task's own named red command would still be failing at its commit boundary. A task that adds an assertion and defers what satisfies it has moved its red into the next commit rather than discharged it. Every code this arc introduces — the five loader codes and every code the 85 repairs add — is registered here, in one edit with one comment block naming the arc.

Both are subset assertions over sets the walk derives, so a file or code added later is covered without an edit here.

**Premises, executable and unconditional** (spec §5.6), with `premise`/`premiseHolds` from `tests/_shared/premise.ts`, at the top level of the suite body and never inside a `.each` callback. Each binds a CATEGORY the resolving layer must handle, because an earlier draft's premises were satisfied by a resolver that handled one member of a category and dropped the rest:

1. **Acquisition, derived twice by independent means, and partitioned rather than filtered.** The file list from a recursive `readdirSync` walk must equal the list from `git ls-files lib/admin`. `lib/admin/__generated__/devPanelPresent.ts` is a live nested file proving a missed subdirectory is not hypothetical, and the failure prints the symmetric difference.

   **Equality of two lists says nothing if both apply the same wrong filter**, which is what an earlier draft's "filtered identically" allowed: a shared `.ts`-only predicate satisfies the premise while every `.tsx` loader disappears, and `lib/admin/**` has no `.tsx` today to witness the gap. So acquisition takes **every tracked file** and partitions it, with the partition asserted exhaustive: `all = scanned ∪ tests ∪ notTypeScript`. Membership in `notTypeScript` is decided by `ts.getScriptKindFromFileName(f) === ts.ScriptKind.Unknown` — TypeScript's own classification of what it can parse, not a list of extensions this plan maintains. A `.tsx` file classifies as `TSX` and is therefore scanned by construction; a `.mts` file likewise; a `.md` file is `Unknown` and is excluded with that reason recorded. Adding `.tsx` as another named case would be the list widening the orchestrator's condition forbids.
2. **Population, derived twice by independent means.** The checker-resolved population must equal one computed by a syntax-only pass sharing no resolution code: object-literal returns, plus identifier returns whose name binds to a module-level const initialized to an infra literal, resolved by name within the file. Failure prints the symmetric difference by file and line. "At least one site per matching file" was the earlier form, and a resolver keeping one site per file satisfies it.
3. **Both construction shapes witnessed** — ≥1 `literal`, ≥1 `const-alias`.
4. **Both propagation callee categories witnessed** — ≥1 exemption whose callee is an imported identifier (`loadOpenIdentityHolds`), and ≥1 whose callee is a function declared in the same file (`runBellPipeline` in `lib/admin/bellFeed.ts:191`). A resolver that resolves imports but not local declarations satisfies a one-witness premise while reporting the two `bellFeed` sites, and the repair for a reported propagation is a duplicate emit — the exact fault the exemption exists to prevent. The core's own fixture cannot catch this: its resolver answer is test-controlled.
5. **The checker resolved usefully**, not merely answered: a known object-typed payload must satisfy the positive object test and a known scalar payload must fail it. A broken program yields `any`, which the positive predicate reports rather than accepts (spec §5.4), but this premise says so out loud instead of leaving a wall of reports to read as real findings.

## Task 3 — the client projection and the boundary wire

<!-- task: red=`pnpm exec vitest run tests/observe/reportClientError.test.ts` ac=AC-7,AC-8 -->


<!-- spec-lint: ignore — this file is created by this plan's implementation and is not tracked yet -->
Create `lib/observe/describeClientValue.ts` per spec §6.2 — `tag()` derived from the runtime, `render()` writing leaves with `String()` rather than JSON's number grammar — importing only `@/lib/log/serializeError` by its own path. In the same commit, rewrite `toError` at `lib/observe/reportClientError.ts:11-14` as spec §6.5's `toWire`.

**The two are one task** because the projection alone has no production red: a new module's suite fails to import, and that is not a defect in shipped code. Wiring it into `reportClientError` gives the pair a real one.

**RED anchor:** `lib/observe/reportClientError.ts:13` returns `{ message: String(e) }`. Per spec §7.1 the five non-`Error` cases are red for **different** reasons and each asserts its own: a plain object and `{}` are red on `message`; a string, `null` and a `Map` are red on `detail`, which this path does not send at all today, and on the type tag.

The projection's own suite ports `docs/superpowers/specs/observability/probes/2026-08-26-client-value-projection.ts` as a table over its 25 pairs. **Four pairs assert the collision** — the two `-0` pairs under spec §9 limit 6, and the same-second `Date` and `RegExp` `lastIndex` pairs under limit 7 — because asserting they discriminate would assert a falsehood. Plus the §6.3 guard table, every row.

**Anti-tautology.** Expected values are derived from the fixture: the test builds `{ code, message }` from local constants and asserts the projected message equals those two joined, so dropping either field fails. The two-distinct-objects test asserts `fetch` was called twice **and** that the bodies differ in `detail` — a projection returning a constant non-empty string satisfies the weaker form and fails this one.

## Task 4 — the dedup signature gains `detail`

<!-- task: red=`pnpm exec vitest run tests/observe/clientErrorTransport.test.ts` ac=AC-9 -->

Add the `detail` term to the signature at `lib/observe/clientErrorTransport.ts:32`, sliced at 200 to match the `stack` term beside it.

**RED anchor:** `lib/observe/clientErrorTransport.ts:32` — the shipped signature has four terms and ignores `detail`. The test drives `clientErrorTransport` **directly** with two inputs sharing `source`, `level` and `message` and differing only in `detail`, and asserts two POSTs. Asserting only through `reportClientError` would let a lucky `message` difference pass a broken signature.

**Four pre-dispatch mutants**, run and recorded in the commit:

- (a) `detail` emptied on both inputs — expect **one** POST, proving the term is not merely always-distinct.
- (b) one `detail` given an appended suffix — expect **two**.
- (c) **the cap pinned by a boundary pair.** Two inputs whose `detail` values are identical for 200 characters and differ at index 200 — expect **one**; two differing at index 199 — expect **two**. A single over-long pair is satisfied by any cap at or below the shared prefix and pins nothing.
- (d) each of `source`, `level`, `message`, `stack` varied in turn — expect **two** each.

**The `Error` path's key changes shape, and it is the behaviour that is preserved.** The current key ends after the stack term; a fifth term appends a `|` even when `detail` is empty. That empty term is constant across every `Error` call, so no two previously-distinct keys merge and no two previously-equal keys split. The test asserts that — an `Error` deduped once still dedups once, two distinct `Error`s still produce two POSTs — never key bytes.

## Task 5 — GlobalErrorListener, both handlers

<!-- task: red=`pnpm exec vitest run tests/observe/globalErrorListener.test.tsx` ac=AC-10,AC-11 -->

Rejection handler: the non-`Error` arm takes the projection's `detail` (spec §6.7). Window-error handler: append the projection's detail when `event.error` is a non-`Error` value, keeping the `filename:lineno` prefix.

Update the two existing string-reason assertions at `tests/observe/globalErrorListener.test.tsx:42-53` and `tests/observe/globalErrorListener.test.tsx:56-64`, whose expectations change by the seven-character tag. Both stay derived from the fixture, so the cap assertion still fails if `DETAIL_CAP` moves.

**RED anchors, both production:** `components/observe/GlobalErrorListener.tsx:41-44` calls `String()` on a non-`Error` reason, and `components/observe/GlobalErrorListener.tsx:27-37` never reads `event.error` at all.

**Concrete failure mode caught:** a component throws a plain object at the window and its fields vanish entirely — not collapsed to `"[object Object]"` like the other two paths, simply absent.

## Task 6 — headers and documented limits

<!-- task: red=`pnpm exec vitest run tests/docs/_metaLedgerMintBar.test.ts` ac=AC-12 -->

Write each spec §9 limit into the header of the surface that owns it, with its re-run trigger. The mapping is exhaustive over all twelve, because an earlier draft named one that does not exist and omitted three that do:

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
| 10 `context`-only `clientLog` callers | row 2's archive entry, written in Task 8 |

**No executable assertion observes this task, and the earlier draft's claim that one did was false.** `tests/docs/_metaLedgerMintBar.test.ts` does not assert that no row was filed — it constrains rows that exist, admitting product-facing rows and process-facing rows that qualify. This arc files none, so that suite stays green vacuously, and no header edit can move it either way. It is named as this task's command because it is the suite this task must not break, not because it verifies the work.

The limits themselves are verified by review at closeout, against the mapping table above. That is a weaker guarantee than the rest of the plan carries, and it is stated rather than dressed up: building a guard that parses spec §9 and checks each named file for its limit would be new guard surface for a documentation task, which the process mint freeze exists to refuse.

Limit 10 is deliberately not written here — spec §12 assigns it to the archive entry, so AC-12 is met only once Task 8 has run.

## Task 7 — impeccable dual gate

<!-- task: red=`pnpm exec vitest run tests/docs/_metaInvariant8Closeout.test.ts` ac=AC-13 -->

**GATE, not a TDD task.** The named suite checks marker grammar; running the gate is not something any assertion here observes.


<!-- spec-lint: ignore — this file is created by this plan's implementation and is not tracked yet -->
Run both halves of the impeccable v3 dual gate — the critique command, then the audit command — on `components/observe/GlobalErrorListener.tsx`, each with the canonical v3 setup gates. Record findings and dispositions, and write the marker, in a stem-named sibling closeout file created by this task: `docs/superpowers/plans/2026-08-26-observe-error-telemetry-closeout.md`.

**Why the declaration and the marker land there together, and not in this file.** `tests/docs/_metaInvariant8Closeout.test.ts` requires that any unit *declaring* the dual gate carry a valid marker, and it detects the declaration by the literal command phrases. A plan that names them is therefore obliged to carry a marker it cannot yet write — the counts do not exist until the gate runs — so it would red the suite from Task 1 through Task 7 either way: malformed if it carries a placeholder, missing if it carries none. An earlier draft did the first and the version before it did the second. The declaration belongs with the result, which is the closeout file, and this file deliberately does not use the two trigger phrases.

**The marker's grammar, and why this plan carries no example of it.** `tests/docs/_invariant8Closeout.ts:166` pushes to `malformed` **any** line whose trimmed start is the marker prefix and which matches none of its three exact forms — and `walkPlansTree` scans this very file. A placeholder with `p0=<int>` is therefore not a harmless illustration: it reds `tests/docs/_metaInvariant8Closeout.test.ts` for every task before this one. An earlier draft carried exactly that. So the fields are described here in prose and the marker line itself is written only at closeout:

- prefix `impeccable-gate:` then `critique=` and `audit=`, each `RAN` or `RAN-DEGRADED`;
- `p0=` and `p1=`, integers with no leading zeros, from the actual run;
- `dispositions=`, which the parser cross-checks against those counts at `tests/docs/_invariant8Closeout.ts:141-142`: `recorded` when `p0 + p1 > 0`, and **`none` when both are zero**. A gate that finds nothing and writes `recorded` is malformed.

The `N/A` form is **not** taken: invariant 8 defines a UI surface by path (`AGENTS.md:20`), and the grammar test validates syntax rather than authorizing an exemption (spec §12).

## Task 8 — archive both rows

<!-- task: red=`pnpm exec vitest run tests/docs/_metaLedgerInProgress.test.ts` ac=AC-14 -->

Graduate both rows to `BACKLOG-archive.md` with the evidence spec §12 requires, including limit 10 in row 2's entry. Remove both `IN PROGRESS` markers **in the PR's last commit**, before the merge, so no marker reaches main (invariant 12).

**REGRESSION PIN, and what it actually observes is narrower than an earlier draft claimed.** `tests/docs/_metaLedgerInProgress.test.ts` asserts two things this task can trip: an archive may not hold an in-flight entry (`tests/docs/_metaLedgerInProgress.test.ts:77`), and an in-progress entry must name a branch that still exists on origin (`tests/docs/_metaLedgerInProgress.test.ts:112`).

Three claims the earlier draft made are **declined**, because the suite does not observe them:

- it does not catch marker-removal-first-then-archive, which stays green throughout — only archive-first reds;
- it cannot tell which commit an edit landed in, so "in the PR's last commit" is procedure this task follows, not something any assertion checks;
- a marker merged to main stays green while its branch still exists on origin, so the guard against a marker reaching main is the ordering discipline of invariant 12, not this suite.

Naming those gaps is the repair. Adding cases to cover them would be building a commit-ordering guard, which is not this arc's work.

<!-- tasks: end -->

## Acceptance criteria

- **AC-1** the scanner core classifies each of the twenty-one spec §5.7 cases with the right reason, and four mutations of the core each kill at least one case
- **AC-2** no `lib/admin` construction of an `infra_error` lacks a code-carrying object-payload emit, derived from disk, with all five premises met
- **AC-3** the `show_change_log` returned-error branch emits `SHOW_CHANGE_LOG_READ_RETURNED_ERROR`
- **AC-4** every loader emit's `context.error` carries the PostgREST fields, not a bare message
- **AC-5** every file the walker finds a construction in appears as an `infraRegistry` entry's `path`, asserted as a subset check over the walk's own file set rather than against a maintained list
- **AC-6** every `code:` literal the scanner sees inside a `log.*` span in `lib/admin/**` is a member of `NEW_FORENSIC_CODES`, asserted as a subset check over the codes the walk collected, and none of them appears in the §12.4 producer set
- **AC-7** `describeClientValue` satisfies the spec §6.3 table and the 25-pair corpus, four of which assert their documented collision
- **AC-8** no non-`Error` crash reaches the wire as `"[object Object]"`
- **AC-9** two inputs differing only in `detail` produce two POSTs, and the `Error` path's dedup **behaviour** is unchanged — one `Error` still dedups once, two distinct `Error`s still produce two POSTs. The key's bytes are not asserted: a fifth term appends a separator even when empty, so byte-identity is impossible and asserting it would be asserting a falsehood.
- **AC-10** a plain-object rejection reason persists its own fields in `detail`
- **AC-11** a non-`Error` window throw persists `event.error`'s fields
- **AC-12** every spec §9 limit is recorded on its owning surface with a re-run trigger, verified by review against Task 7's mapping table — no executable assertion observes this one, which Task 7 states plainly
- **AC-13** the impeccable dual gate ran, its dispositions are recorded, and the marker parses
- **AC-14** both rows are archived with the evidence spec §12 requires, and neither `IN PROGRESS` marker survives into main. The suite observes the archive constraint and the live-branch constraint; commit ordering is procedure, not an assertion (Task 8)

## Checklist

- [ ] Tasks 1-8 (TDD per invariant 1; whole tree green under `pnpm heavy` before every push)
- [ ] Plan self-review
- [ ] **Adversarial review (cross-model)** — Codex, plan stage. Brief carries the closed criterion and `PROBE DOMAIN: lib/admin/**` plus the walker, per bl-orch's condition of 2026-08-27. A same-class finding is repaired by DECLINING or by a type category, never by a wider recognizer.
- [ ] Whole-diff adversarial review to APPROVE
- [ ] Twelve required checks green on a non-stale base
- [ ] READINESS report to bl-orch at `wP:p1A`; merge is bl-orch's word, never this arc's
