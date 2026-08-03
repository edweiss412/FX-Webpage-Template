<!-- spec-lint: not-ui — no UI surface: this change touches a build-time scanner, a generated enum, and two structural meta-tests. impeccable-gate: N/A. -->

# Scanner precision cluster — widen the scan, delete the residue, guard the class

**Date:** 2026-08-03
**Branch:** `chore/scanner-precision-cluster`
**Backlog entries:** `BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`, `BL-LEDGER-GUARD-BODY-DEFINED-IDS`
**Status:** R1 repaired — 4 findings, all accepted, all closed structurally (§7)
**impeccable-gate: N/A — no UI surface**

---

## 0. Why these two ship together

Both entries are one bug shape: **a static scanner opens too small a set of files, so a
hand-maintained list exists to cover what it missed, and that list rots invisibly.** The fix in
both cases is widen the scan, delete the residue, and add a guard that fails when a new
definition lands outside what the scanner reaches.

One branch, two commits (TDD per task, invariant 1), one review.

---

## 1. Resolved scope — do not relitigate

| Decision | Status | Ratification |
| --- | --- | --- |
| The eight body-defined ids **stay body-defined**; promoting them to headings is off the table | Ratified 2026-08-02 | `BACKLOG.md:79`, `BACKLOG.md:79` — the parent owns the shrink-only ratchet that gives the sub-items meaning |
| No `WARNING_CARD_COPY_CODES` rows for the recovered codes | Out of scope | `tests/messages/warningCardCopyRegistry.ts:1-4` — hand-listed and byte-frozen against a different spec's §4.2 table, not derived from the generated enum; no test couples them (probed §2.7) |
| `BL-RESOLVED` stays in `KNOWN_DANGLING` | Out of scope | `tests/docs/_metaLedgerReferentialIntegrity.test.ts:106` — prose in an audit doc, not a body-defined id |
| `stripLogEmissionCalls` behavior is unchanged | Correct as-is | `lib/messages/__internal__/stripLogEmissionCalls.ts:1-13` — `app_events.code` is forensic and deliberately not §12.4-gated |
| Mechanism is a **type-aware** ts-morph scan, not a regex/syntactic one | Ratified R1 (§7) | Direct repo precedent: `docs/superpowers/specs/2026-08-01-redirect-guard-type-aware-design.md:59` made the identical syntax→type transition for the redirect guard |
| Single compiler world — ts-morph's vendored `ts` only, never the standalone `typescript` package | Ratified | `docs/superpowers/specs/2026-08-01-redirect-guard-type-aware-design.md:218` — nominal type mixing breaks under strict tsc |

---

## 2. Probe log — what is actually true

Every claim is settled by probe, per the AGENTS.md finding-admissibility contract for detector
surfaces. Probes run 2026-08-03 in this worktree at `369bfcce0`, ts-morph ^28, over
`tsconfig.json`.

### 2.1 The surface as it stands

`extractInternalCodeEnums` (`scripts/extract-internal-code-enums.ts:70-74`) collects
`parse_warnings.code` literals from `readFiles(["lib/parser"])` filtered by
`/\bParseWarning\b|\bwarnings\b|hardErrors/`, using `CODE_PROPERTY_RE`
(`scripts/extract-internal-code-enums.ts:17`). The gallery unions that enum with a hand-maintained
residue, `EXTRA_WARNING_CODES` (`lib/dev/attentionScenarios/tier1.ts:131`, consumed at
`lib/dev/attentionScenarios/tier1.ts:142`).

**Today's rendered universe is 47 codes:** the 43 whose generated provenance *equals*
`parse_warnings.code` (what the exact-equality consumer at `lib/dev/attentionScenarios/tier1.ts:140`
selects) plus the 4 residue codes, none of which is among those 43.

### 2.2 Refuted premises from the backlog entry

| Claim | Probe verdict |
| --- | --- |
| The comment at `lib/dev/attentionScenarios/tier1.ts:114-130` blames the content regex | **Refuted for 3 of 4.** `lib/sync/enrichAgenda.ts` (ParseWarning×2, warnings×8) and `lib/sync/pullSheetOverride.ts` (ParseWarning×3, warnings×4) both PASS that regex; they are missed because `readFiles(["lib/parser"])` never opens them. |
| All four residue codes are emitted outside `lib/parser` | **Refuted.** `PULL_SHEET_ON_ARCHIVED_TAB` is emitted at `lib/parser/dataGaps.ts:60`, inside the scanned root, and is already in the generated enum. Its residue row is dead — the rot the entry predicts, already happened. |
| `AGENDA_SCHEDULE_LOW_CONFIDENCE` is emitted by `lib/agenda/extractAgendaSchedule.ts` | **Refuted.** That occurrence (`lib/agenda/extractAgendaSchedule.ts:634`) is inside a `log.warn(…)` span, stripped deliberately and correctly. The real emitter is `lib/sync/enrichAgenda.ts:425`. |

### 2.3 Why every syntactic mechanism fails

Three syntactic candidates were built and measured. Each is recorded because each was refuted by
probe, not by argument.

**(a) Widen the roots, keep the file-level content predicate.** False-positive count depends on how
far the roots widen, so both measurements are stated rather than one. Over
`["lib/parser", "lib/sync"]` it mis-attributes **ten** non-warning codes; over the full
`["lib", "app"]` it mis-attributes **thirteen** — the same ten plus `IDEMPOTENCY_IN_FLIGHT`,
`REPORT_HORIZON_EXPIRED`, and `REPORT_LOOKUP_INCONCLUSIVE` from `lib/reports/submit.ts`, whose
warnings prose passes the content predicate. At the full roots the broad scan only *appears* to
total 58, because 13 false positives replace 13 genuinely missed warnings. The ten:

```
DRIVE_FETCH_FAILED  MI-1_VERSION_DETECTION_FAILED  PARSE_ERROR_LAST_GOOD
RESYNC_QUALITY_REGRESSED  RESYNC_SHRINK_HELD  ROLE_FLAGS_NOTICE  SHEET_UNAVAILABLE
SHOW_FIRST_PUBLISHED  STAGED_PARSE_OUTDATED_AT_PHASE_D  VERSION_AMBIGUOUS
```

`lib/sync/runScheduledCronSync.ts` matches the content predicate while its `code:` literals are
admin-alert codes (`lib/sync/runScheduledCronSync.ts:2655`).

**(b) Strip type declarations.** Rejected: `ROLE_FLAGS_NOTICE` has a genuine *value* position at
`lib/sync/phase2.ts:591` besides its type member at `lib/sync/phase2.ts:155`, and
`STAGED_PARSE_OUTDATED_AT_PHASE_D` one at `lib/sync/pullSheetOverride.ts:98` besides
`lib/sync/pullSheetOverride.ts:79`.

**(c) Match factory helpers by their written return type (`: ParseWarning`).** Rejected — **this is
the original bug one level up**: a rule keyed on how a type is *spelled*. Two live factories spell
it indirectly and escape:

| Factory | Declared at | Return type as written |
| --- | --- | --- |
| `warning(code: string)` | `lib/sync/applyStaged.ts:1017` | `Phase2Args["parseResult"]["warnings"][number]` |
| `reelWarning(code: ReelWarningCode)` | `lib/sync/phase2.ts:337` | `ParseResult["warnings"][number]` |

Both build `{ severity: "warn", code, message: code }` with **shorthand `code`**, so a
`code: "LITERAL"` rule misses them too. Their codes — `EMBEDDED_RECOVERY_REQUIRES_RESTAGE`, and the
`ReelWarningCode` union `REEL_DRIFTED` / `OPENING_REEL_PERMISSION_DENIED` /
`OPENING_REEL_NOT_VIDEO` (`lib/sync/verifyReelOnApply.ts:17-20`) — are dark.

A fourth syntactic escape is closed by the same conclusion: `severity: WARN_SEVERITY` where
`WARN_SEVERITY` is a `ParseWarning["severity"]`-typed const passes any literal-`severity` rule
while being a genuine construction.

**Conclusion, ratified:** the discriminator cannot be any spelling — not the file, the root, the
type-ness, the written return type, or the literalness of `severity`. It must be the **type**.

### 2.4 The corruption the guard prevents

Eleven genuine parse-warning codes are currently dark in the attention-scenario gallery — in
neither the generated enum nor the residue — every one a real `lib/messages/catalog.ts` §12.4 row:

```
DIAGRAMS_TAB_MISSING                     DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE
DIAGRAMS_EMBEDDED_NONE_FOUND             DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE
DIAGRAMS_EMBEDDED_CAP_EXCEEDED           LINKED_FOLDER_OVERFLOW_TRUNCATED
EMBEDDED_ASSET_DRIFTED                   EMBEDDED_RECOVERY_REQUIRES_RESTAGE
REEL_DRIFTED                             OPENING_REEL_PERMISSION_DENIED
OPENING_REEL_NOT_VIDEO
```

Seven come from the two `warning(): ParseWarning` factories at
`lib/sync/enrichWithDrivePins.ts:162` and `lib/sync/snapshotAssets.ts:87`; four from the two
indirect-return-type factories of §2.3(c).

This settles the entry's own argument: `warningCodes()` de-duplicates, so absorbing a code
**shrinks** the residue rather than double-rendering it, and under-coverage shows no symptom at
all. Eleven codes were dark and nothing failed.

### 2.5 The type-aware measurement

A ts-morph project over `tsconfig.json`; for every object-literal expression under `lib/` and
`app/` (minus `lib/dev/**`, `lib/messages/__generated__/**`, `lib/messages/catalog.ts`) whose type
is assignable to `ParseWarning` (`lib/parser/types.ts:67`), read the `code` property's **type**,
following unions; where that type widens to `string`, resolve the enclosing factory's call-site
argument types.

| | Count |
| --- | --- |
| Today's rendered gallery universe | 47 |
| **Type-aware construction sites** | **58** |
| Lost vs today | **0** |
| Gained | **11** — exactly the dark codes of §2.4 |
| Unresolved (a site whose code the checker cannot resolve) | **0** |
| Non-warning codes admitted (the ten of §2.3(a)) | **0** |

Zero false positives is not a tuning result — an `upsertAdminAlert` argument is not assignable to
`ParseWarning`, so the whole class is excluded by construction rather than by exclusion list.

### 2.6 The consumer defect

`lib/dev/attentionScenarios/tier1.ts:140` and `tests/dev/attentionScenariosWarnings.test.ts:21`
filter with **exact string equality** against `source`, a comma-joined provenance list. A code
found by the parse-warnings pass **and** any other pass gets `"admin_alerts.code,parse_warnings.code"`
and is silently dropped. Measured: 46 codes carry `parse_warnings.code` in provenance today, but
only 43 carry it exactly — `MI-1_VERSION_DETECTION_FAILED`
(`lib/messages/__generated__/internal-code-enums.ts:134`), `PULL_SHEET_ON_ARCHIVED_TAB`, and
`VERSION_AMBIGUOUS` are excluded by the equality alone.

Membership is safe only because the type-aware producer has zero false positives (§2.5); over the
syntactic producer it would have admitted the ten non-warnings of §2.3(a).

### 2.7 Coupling check

`tests/messages/warningCardCopyRegistry.ts:4` is a hand-listed `ReadonlySet`; no assertion derives
it from `INTERNAL_CODE_ENUMS`. The only membership assertion against the generated enum is
`tests/messages/inlineLaterGroupCopy.test.ts:128-131`, which pins specific codes' provenance; none
of the eleven recovered codes appears there. Adding codes to the enum requires no copy work.

### 2.8 Item B — the corpus contains two traps

Walking all four ledgers with a strong-lead rule finds **eleven** matching bullets: the intended
eight, plus three that are **mis-parented**.

| Location | Shape | `extractEntries` owner | Should define? |
| --- | --- | --- | --- |
| `BACKLOG.md:591-595` | `- **` + backticked id + `** — …` | `BACKLOG.md:585` `### BL-MUTATION-HARNESS-OPEN-HOLES` | **yes** |
| `BACKLOG.md:1097-1099` | `- **BL-SYNCFEED-UI-1** — …` (no backticks) | `BACKLOG.md:1093` `### BL-SYNC-FEED-UI-POLISH` | **yes** |
| `BACKLOG.md:79` | backticked ids, comma-separated, **no strong** | `BACKLOG.md:71` `## BL-LEDGER-GUARD-BODY-DEFINED-IDS` | **no** — trap 1 |
| `BACKLOG-archive.md:1094-1096` | `- **BL-PICKER-BOOTSTRAP-HOST-FLIP** — …` | `BL-CREWPAGE-ROTATE-FOCUS-MGMT` | **no** — trap 2 |

**Trap 1** — `BACKLOG.md:79` sits inside the backlog entry for this very work and leads a bullet
with the same five ids as inline code spans. A "bullet lead with a code span" rule would let that
entry define the five ids it merely enumerates. The **strong** requirement rejects it.

**Trap 2** — the three picker bullets sit under `BACKLOG-archive.md:1088`
`## Picker-flow app bugs (3) — RESOLVED …`, a **non-id heading**. `extractEntries`
(`tests/docs/_ledgerMdast.ts:302`) opens entries only at `BL-`-prefixed headings, so that whole
section falls inside the *preceding* entry's body span and the three ids would be defined by an
unrelated entry. Strong formatting alone does not distinguish definition from enumeration.

Measured, both rules together:

```
strong-lead only                     : 11 ids  (8 intended + 3 mis-parented)
strong-lead + stop-at-first-heading  :  8 ids  (exactly the intended eight)
```

---

## 3. Item A — design

### 3.1 The rule: fail-closed, type-aware ParseWarning recognition

**Comprehensive re-analysis (three-round rule).** R1, R2a and R3a each landed a finding on one
vector — *the recognizer misses a construction shape*. Enumerating shapes one round at a time is
the unbounded-attack-space failure the guard rules warn about, and "the reviewer imagines no
further mutant" is not a fixed point. So the rule is inverted: **the default is SIGNAL.**

A site is any expression whose type — or whose awaited type — is assignable to `ParseWarning`
(`lib/parser/types.ts:67`), where "assignable" ignores `any` / `never` / `unknown` (all three
satisfy the test trivially and selected 13 non-warnings). Contextual **or** intrinsic assignability
qualifies, because a warning passed to `sink(x: ParseWarning | Alert)` has a non-assignable
contextual type and an assignable own type. Site kinds are object literals, calls, `new`
expressions, **and `await` expressions**.

The code is resolved, in order, from: the node's OWN type's `code` property following unions
(this covers literals, shorthand, `Object.assign` intersections, spreads of literal-typed objects,
and union-typed parameters such as `ReelWarningCode`); then the object-literal initializer; then
the literal arguments of the call itself.

**If that fails, the site FAILS THE GUARD — unless it matches one of exactly four
classifications, EACH OF WHICH IS CAPTURE-LINKED.** R4a's decisive finding: a classification that
states only a *local* syntax/type condition proves nothing, because it never establishes that the
propagated or delegated code was captured anywhere else. All four of its compiled mutants were
swallowed. So each classification is now validated in a **second pass**, against what pass 1
actually captured:

| # | Classification | Local test | **Capture-link (pass 2)** | Live count |
| --- | --- | --- | --- | --- |
| FRAGMENT | spread INTO a warning | selected only via contextual type, no own `code` | an **enclosing assignable warning site exists** — that site carries the verdict on its own terms | 2 |
| COPY | propagates another warning's code | no own `code`, type's `code` non-literal | the spread source is itself **warning-typed and not `any`/`unknown`**; an untraceable source SIGNALS | 4 |
| FACTORY_BODY | defines by delegation | `code` is a parameter of the enclosing function | **at least one DIRECT call site** resolves, and all of them do. "Every call site resolves" is vacuously true at zero, which a `.map(factory)` reference exploits | 4 |
| USE | calls a factory whose body is a site | callee resolves through aliases to a function-like declaration with a body | that callee's body must have **actually produced a captured code**; a validate-and-return factory with a body that captures nothing SIGNALS | 12 |

A declaration-only `const` factory, a callback parameter, an out-of-tree callee, and every `new`
expression fail the USE test outright. Nothing is skipped by name, and nothing is skipped on local
shape alone.

Roots are `["lib", "app"]` minus `lib/dev/**`, `lib/messages/__generated__/**`, and
`lib/messages/catalog.ts`.

**Mechanism.** ts-morph over `tsconfig.json`, matching `lib/audit/noGlobalCursor.ts` and
`tests/cross-cutting/no-raw-codes-audit.ts:247`. **Single compiler world**
(`docs/superpowers/specs/2026-08-01-redirect-guard-type-aware-design.md:218`).

<!-- spec-lint: ignore — new file introduced by this change; not tracked until implementation -->
The recognizer lands as `lib/messages/__internal__/parseWarningSites.ts`.

**Measured (2026-08-03), two-pass:** **58 codes · 0 signalled · 22 capture-linked skips**
(2 FRAGMENT, 4 COPY, 4 FACTORY_BODY, 12 USE). Every skip passed both its local test and its
capture-link.

### 3.2 Consumer change

`warningCodes()` (`lib/dev/attentionScenarios/tier1.ts:140`) and `generatedWarningCodes()`
(`tests/dev/attentionScenariosWarnings.test.ts:21`) change from exact equality to **membership**:
`v.source.split(",").includes("parse_warnings.code")`. Over the type-aware producer this selects
exactly the 58 of §2.5.

### 3.3 Residue deletion

`EXTRA_WARNING_CODES` (`lib/dev/attentionScenarios/tier1.ts:131`) is deleted with its comment
block (`lib/dev/attentionScenarios/tier1.ts:114-130`), whose rationale is refuted by §2.2. The test
that pins it (`tests/dev/attentionScenariosWarnings.test.ts:33-40`) is deleted with it.

### 3.4 The guard

<!-- spec-lint: ignore — new file introduced by this change; not tracked until implementation -->
`tests/messages/_metaParseWarningSiteCoverage.test.ts`, two arms:

- **G1 — root coverage.** Runs the shared recognizer over the **whole tracked tree**, asserting
  every construction site lives in a file the generator's roots open. Shares the recognizer
  deliberately: this arm tests **roots**, not shape. An emitter in a new top-level directory fails
  here.
- **G2 — completeness.** Asserts every code the recognizer finds is present in the generated
  `parse_warnings.code` set, and that the recognizer reported zero unresolvable sites. Because
  recognition is type-based, G2 has no independent-spelling gap to leave open — the escape class
  §2.3(c)/(d) exercised is closed at the mechanism, not patched at the arm.

**Why G2 is not tautological even though it shares the recognizer.** The R1 review correctly noted
that a name-keyed guard sharing a name-keyed producer proves nothing. Under type-aware recognition
the guard's job changes: it is no longer trying to out-guess the producer's spelling coverage, it
asserts the *generated artifact* is in sync with what the checker sees. The escaping-mutant
obligation is therefore discharged by AC-A5/AC-A6 below, which are **shape** mutants the R1 findings
proved a syntactic design could not catch.

### 3.5 Cost — measured, and the decision it forces

Type-aware recognition is not free, and the cost is inherent rather than tunable. Measured in this
worktree (ts-morph ^28, 2879-file project):

| Step | Cost |
| --- | --- |
| `new Project({ tsConfigFilePath })` | **38.7 s** |
| Full recognizer pass over `lib/` + `app/` | ~26 s |
| **End-to-end extraction** | **64.5 s** |

A narrowed project (`skipAddingFilesFromTsConfig` plus an explicit `lib/**` + `app/**` glob and
`resolveSourceFileDependencies()`) was measured and is **worse** — 62 s to load 820 files, 77.9 s
end-to-end — because dependency resolution re-reads the same graph. That option is refuted, not
merely unchosen.

**Decision — exactly ONE fresh extraction in the default suite.** Module-scope memoization alone is
not enough: `vitest.config.ts:109-110` explicitly rejects `isolate: false`, so each test FILE that
extracts is a separate process and three callers cost 3 x 64.5 s = 193.5 s. Instead:

- The **guard file is the single extractor**, and the artifact-parity assertion currently at
  `tests/cross-cutting/no-raw-codes.test.ts:34` moves into it, so one process does both.
- `tests/cross-cutting/cron-run-summary-scanner-safety.test.ts` asserts against the **committed
  artifact** instead of re-extracting. That is exactly as strong, because the parity assertion pins
  artifact == fresh extraction; without parity it would be weaker, which is why the two must live
  together.
- `gen:internal-code-enums` pays the cost once, as a codegen step should.

Net: one 64.5 s extraction in the suite rather than three.

**This is a real tradeoff, stated rather than hidden.** The parity assertion at
`tests/cross-cutting/no-raw-codes.test.ts:34` — artifact must equal a fresh extraction — is what
makes AC-A8 machine-enforced, and it is precisely the assertion that cannot read the cached
artifact. Implementation measures the actual suite delta (plan Task 4). If it proves unacceptable,
the fallback is to move the fresh-extraction parity check into a dedicated CI job rather than the
default suite, keeping the artifact-reading consumers cheap. That fallback is named here so the
choice is a decision rather than a discovery.

### 3.5a Soundness boundary — where static recognition provably stops

R5a demonstrated that the capture-links are **existential, not provenance-linked**: a link can be
satisfied by an unrelated captured code while the site's own code came from nowhere captured. The
four mutants all launder a code through `any` or reach a factory only by higher-order application
(`["X"].map(make)`).

**This is not a fixable defect of the rule; it is the boundary of static recognition.** Tracing a
code's provenance through `any`, higher-order application, and dynamic dispatch is undecidable in
general — any type-based recognizer can be defeated by `const w: ParseWarning = someAny`. Iterating
further does not converge, which is exactly the unbounded-attack-space failure the AGENTS.md
mutation-family rule warns about; "the reviewer imagines no further mutant" is not a fixed point.

**Disposition, under the project's own finding-admissibility rule.** A hypothetical input is a
finding only if a probe shows silent corruption *in the corpus*; where the worst case is a
documented gap rather than a wrong auto-correct, it files here without a round. Probed: **zero
`any`-laundered and zero higher-order-only warning constructions exist in `lib/` or `app/` today**
— all 58 codes resolve statically, and all 22 skips pass both their local test and their capture
link. The mutants are constructions, not corpus.

So the contract is stated precisely rather than overclaimed:

- **Sound** for every warning whose code is statically determinable — literal, union-typed,
  shorthand, spread-preserved, `Object.assign`, awaited, or resolved at a direct call site.
- **Loud** for anything else it reaches: the default is SIGNAL.
- **Blind**, by construction, to a code whose provenance passes through `any`/`unknown` or reaches
  its factory only by higher-order application. Such a code is neither captured nor signalled.

**The real closure is not a better scanner.** `MESSAGE_CATALOG` (`lib/messages/catalog.ts:62`)
already lists every §12.4 code but carries no field to partition parse-warnings from the rest —
the exact gap `lib/dev/attentionScenarios/tier1.ts:117-121` records. A `class` field there would
make the warning universe *enumerated* rather than *inferred*, and the scanner a cross-check
instead of the source of truth. That is a §12.4 catalog change with the three-way lockstep it
implies, out of scope here, and filed as `BL-CATALOG-PARTITION-WARNING-CLASS`.

### 3.6 Documented limits

- A code assembled at runtime (a template literal, or a value read from config) has no literal
  type. Such a site is **reported and fails the guard** rather than passing silently. Zero exist
  today.
- A factory whose `code` parameter is typed `string` and is called with a non-literal argument is
  likewise reported, not dropped. Zero exist today.
- `lib/dev/**` is excluded by design (§3.1).
- The acceptance posture is "captured or **signaled**, never silently dropped"
  (`docs/audits/edge-case-preparedness-audit-2026-07-04.md:92`) — not "no imaginable defeating
  input."

Note the R1-era limit about duplicate const identifiers is **gone**: type-aware resolution has no
name-keyed const map. (For the record, the R1 claim that none existed was wrong — six exist:
`STAGED_PARSE_SOURCE_OUT_OF_SCOPE`, `WIZARD_SESSION_SUPERSEDED`, `STAGED_PARSE_FAILED`,
`STAGED_PARSE_SOURCE_GONE`, `EMBEDDED_RECOVERY_REQUIRES_RESTAGE`, `SYNC_INFRA_ERROR`. The mechanism
that made them relevant no longer exists.)

---

## 4. Item B — design

### 4.1 The rule

`definedIds()` (`tests/docs/_metaLedgerReferentialIntegrity.test.ts:127`) becomes headings **∪**
body-defined ids. A new exported `bodyDefinedIds(text, opts)` in `tests/docs/_ledgerMdast.ts`, built
on `extractEntries` (`tests/docs/_ledgerMdast.ts:302`, which returns `body: RootContent[]` per
`tests/docs/_ledgerMdast.ts:95-99`):

For each entry in a **ledger** file, walk `entry.body` **until the first `heading` node**. For each
top-level `list` before that point, for each `listItem`, take its first `paragraph` child; if that
paragraph's **first child** is a `strong` node whose concatenated text (`text` plus `inlineCode`
children) is exactly an id matching `opts.requirePrefix`, that id is DEFINED by that entry.

Three conditions, each closing a measured failure mode:

1. **Ledger files only** — a bullet in a plan or a spec is never reached, so a typo there cannot
   define itself. **This condition lives in `definedIds()`, not in `bodyDefinedIds()`**, because it
   is a fact about which FILES are walked, not about markdown. To make it testable rather than
   asserted, `definedIds` is **exported and given injectable parameters**
   `(ledgers, read)` — exactly the shape `citedIds` already uses for the same reason
   (`tests/docs/_metaLedgerReferentialIntegrity.test.ts:240-244`, whose `read` defaults to the real
   filesystem). Without that seam P5 below is untestable through the declared API; with it, P5 is a
   genuine red→green.
2. **First child of the first paragraph** — an id mid-sentence is not a definition (trap 1, §2.8).
3. **Stop at the first heading** — a non-id heading opens a section that `extractEntries` cannot
   close, so bullets after it are not the entry's own (trap 2, §2.8).

Measured: conditions 1–2 alone yield 11 ids (3 wrong); all three yield exactly the intended 8.

### 4.2 Plants

| Plant | Asserts |
| --- | --- |
| P1 — strong-wrapping-code bullet under a resolving parent | DEFINES |
| P2 — strong-plain bullet under the same parent | DEFINES |
| P3 — code-span lead, no strong | does NOT define (trap 1) |
| P4 — strong id mid-sentence, not leading | does NOT define |
| P5 — the P1 markdown supplied for a file NOT in `ledgers`, via injected `read` | defines nothing; the SAME text supplied for a ledger file DOES define (the control that makes it non-vacuous) |
| **P5-live — the LIVE `definedIds()` invocation** | Pins the **default list itself**, not a passed one: the exported default is asserted to equal EXACTLY `["BACKLOG.md","BACKLOG-archive.md","DEFERRED.md","DEFERRED-archive.md"]` (set equality, not shape). Plus `definedIds()` equals `definedIds(LEDGERS)`, and adding a plan path CHANGES the result. **Exact equality is the load-bearing clause:** R4b demonstrated that a default widened to `LEDGERS + <a plan path>` survives a results-match assertion, a per-entry shape assertion, AND the four-ledger count, because every BL-looking heading in the plan corpus today is a fenced example contributing zero definitions. Only pinning the list's exact membership fails that mutant. |
| P6 — the P1 bullet under a heading whose own id does not resolve | defines nothing |
| **P7 — the P1 bullet after an intervening non-id heading** | **does NOT define (trap 2)** |
| **P8 — the real `BACKLOG-archive.md:1094-1096` shape, with the picker headings removed in-memory** | **does NOT define** — the R1 mutant, pinned |

### 4.2a Comprehensive re-analysis of the file-scoping vector (three-round rule)

R2b, R3b and R4b each landed a finding on one vector — *proving that a bullet in a non-ledger file
cannot define an id*. Per the AGENTS.md same-vector rule, the response is no longer another
per-instance patch but an end-to-end enumeration of what the property actually requires, audited
against the design:

| # | Requirement | Where it is discharged |
| --- | --- | --- |
| 1 | `bodyDefinedIds` must not know about files at all | §4.1 — its signature is `(text, opts)` |
| 2 | The file list is ONE named constant | `LEDGERS` |
| 3 | That constant's **exact membership** is asserted | P5-live (R4b) |
| 4 | The live call uses the constant, passing no argument | P5-live |
| 5 | An explicitly passed list is respected | P5 paired control (R3b) |
| 6 | A non-ledger file defines nothing | P5 |
| 7 | **`bodyDefinedIds` has no OTHER production caller** that could bypass `LEDGERS` | **P5-sole (new below)** |
| 8 | The default `read` is filesystem-backed and repo-rooted, not injectable in production | P5-sole |

Requirement 7 is what the enumeration surfaced and no earlier round reached: every plant so far
constrains `definedIds`, and none constrains what else may call `bodyDefinedIds`. A future edit
calling it from a second site with its own file list passes P1–P8 and P5-live unchanged.

**P5-sole** closes it structurally rather than by inspection: a source scan asserting
`bodyDefinedIds` is referenced exactly once outside its own definition and the test files — from
`definedIds` — and that `definedIds`'s `read` default resolves under `ROOT`. This is the
structural defense the calibration rule asks to ship in the repair commit, not after a fourth
round.

### 4.3 Residue deletion

Eight rows leave `KNOWN_DANGLING` (`tests/docs/_metaLedgerReferentialIntegrity.test.ts:95`).
`BL-RESOLVED` stays (§1). The guard's existing stale-row ratchet makes this self-enforcing.

---

## 5. Acceptance criteria

**Item A**

- **AC-A1** The recognizer yields exactly **58** codes, with **zero unresolved sites** and zero sites outside the roots in the production tree; the set is a strict superset of today's
  47-code gallery universe (zero lost) and the 11 additions are exactly §2.4.
- **AC-A2** None of the thirteen non-warning codes of §2.3(a) carries `parse_warnings.code` provenance.
- **AC-A3** `EXTRA_WARNING_CODES` does not exist in the tree.
- **AC-A4** `warningCodes()` contains all four former residue codes, sourced from the generator
  alone, and remains duplicate-free.
- **AC-A5** **Escaping-mutant proof, indirect return type.** A fixture factory declared
  `function f(c: C): SomeAlias["warnings"][number]` with a union-typed `c` is captured. A syntactic
  `: ParseWarning` rule provably misses it (§2.3(c)); the shipped recognizer must not.
- **AC-A6** **Escaping-mutant proof, non-literal severity.** A fixture
  `{ severity: WARN_SEVERITY, code: "X", message: "y" }` with a typed const severity is captured.
  (This replaces the R1 `mkWarn` plant, which R1 correctly showed was auto-discovered and therefore
  proved nothing.)
- **AC-A7** A fixture site whose `code` type is neither literal nor call-site-resolvable is
  **reported by name and fails the guard** — proving the "signaled, never dropped" posture.
- **AC-A10** **Capture-link proof — the four R4a swallow mutants.** Each of the four compiled
  mutants that defeated the local-only classifications (`any`-sourced spread, `unknown`-sourced
  validated copy, `.map`-passed factory with zero direct call sites, validate-and-return factory)
  is captured or **signalled**, never swallowed. These are live escaping mutants against the
  previous design, so each is a genuine red-before-green.
- **AC-A8** `pnpm gen:internal-code-enums` re-run and the regenerated artifact committed in the
  same commit. Machine-enforced by `tests/cross-cutting/no-raw-codes.test.ts:34`.
- **AC-A9** `tests/cross-cutting/cron-run-summary-scanner-safety.test.ts` still passes —
  `CRON_RUN_SUMMARY` (`lib/cron/runSummary.ts:4`) is a bare `export const`, not a ParseWarning
  construction, so it is excluded by type rather than by the content predicate this change removes.

**Item B**

- **AC-B1** All eight ids resolve; `KNOWN_DANGLING` retains exactly one row, `BL-RESOLVED`.
- **AC-B5a** **The transition is asserted directly, not via the in-flight guard.** After the move,
  `IN PROGRESS` appears nowhere in `BACKLOG-archive.md` for either id, and each archived section
  contains `chore/scanner-precision-cluster`. R5b probed that
  `_metaLedgerInProgress.test.ts` scans only body lines 1-12 while
  `BL-LEDGER-GUARD-BODY-DEFINED-IDS` carries its status at body line 13, so relying on that guard
  would let a missed transition pass silently.
- **AC-B5** **Graduation state transition.** On graduation each entry's meta line goes from
  `**Status:** IN PROGRESS · **Branch:** chore/scanner-precision-cluster` to
  `**Status:** RESOLVED on branch \`chore/scanner-precision-cluster\` (2026-08-03)`. That single
  edit satisfies three guards at once: `_metaLedgerInProgress.test.ts` (archives may not hold
  in-flight work), the `BACKLOG_GRADUATED` provenance assertion
  (`tests/docs/_metaDeferralLedgerGraduation.test.ts:393-396` requires the archived section to
  CONTAIN the branch string), and the terminal-state requirement. Stripping the marker without
  this replacement removes the section's only branch provenance and fails the second.
- **AC-B2** Plants P1–P8, P5-live, and P5-sole pass as specified in §4.2 / §4.2a. P5 is exercised against the exported
  `definedIds(ledgers, read)` seam with a paired control, so "ledger files only" is proven
  behaviorally rather than asserted structurally.
- **AC-B3** `bodyDefinedIds` over the four live ledgers returns exactly 8 ids, not 11.
- **AC-B4** The whole-repo referential-integrity assertion passes with no new exemption.

**Both**

- **AC-C1** `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` clean.
- **AC-C2** Both entries graduate to `BACKLOG-archive.md`; `BACKLOG.md:7` gains a new leading
  segment.

---

## 6. Backlog graduation

Both entries graduate to `BACKLOG-archive.md`. Two sibling panes are graduating other rows from
`BACKLOG.md` concurrently; a rebase conflict is expected. **Resolve by keeping BOTH sides** — the
entries are disjoint and the `Last reconciled:` line concatenates.

---

## 7. Adversarial review log

**R1 (Codex, 2026-08-03) — BLOCKING, 4 findings, all accepted, all verified independently.**

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | BLOCKING — R1/R2/R3 miss four live codes via two indirect-return-type factories | **Accepted.** Verified at `lib/sync/applyStaged.ts:1017` and `lib/sync/phase2.ts:337`. Closed structurally: the whole syntactic mechanism is replaced by type-aware recognition (§3.1), not patched with a third spelling. |
| 2 | HIGH — G2 has a silent escaping shape (`severity` via typed const); AC-A6's `mkWarn` plant is auto-discovered and proves nothing | **Accepted, both halves.** The escape is closed by §3.1 site recognition; AC-A6 is **replaced** by a non-literal-severity mutant, and AC-A5 added for the indirect-return-type shape. |
| 3 | HIGH — the body rule mis-parents three archive bullets under a non-id heading | **Accepted.** Verified: `BACKLOG-archive.md:1088` is a non-id heading and `extractEntries` assigns `BACKLOG-archive.md:1094-1096` to `BL-CREWPAGE-ROTATE-FOCUS-MGMT`. Closed by the stop-at-first-heading condition (§4.1); measured 11 → 8. Plants P7 and P8 pin it. |
| A1 | BLOCKING (R2a) — G1 cannot pass over the whole tracked tree: 1415 assignable sites sit outside the roots, 1386 in `tests/**`. | **Accepted.** G1 is scoped to a defined **production tree** with an explicit exclusion list (§3.4). Measured 0 outside-root sites there today, so the arm is meaningful rather than vacuous. |
| A2 | BLOCKING (R2a) — shared recognizer has silent escape families: `Object.assign`, contextual-union precedence, class construction. | **Accepted, all three.** §3.1 clauses 1-2 add call/`new` site kinds and contextual-OR-intrinsic assignability; clause 6 makes `new` signal. Re-measured: still 58 codes, now 0 unresolved. |
| A3 | HIGH (R2a) — the stated rule contradicts the zero-unresolved measurement: warning-copy spreads have no own code, and `any`/`never` selected 13 non-warnings. | **Accepted.** §3.1 clause 5 defines copy-vs-definition (6 such sites) and clause 3 excludes `any`/`never`/`unknown`. The earlier zero was partly an artifact of silently skipping those sites; it is now a measured zero under the stated rule. |
| A4 | MEDIUM (R2a) — false-positive arithmetic wrong under the actual roots. | **Accepted.** §2.3(a) now states both baselines and names the three additional codes. |
| A5 | MEDIUM (R2a) — the perf fallback removes only one of three project loads; `isolate:false` is rejected. | **Accepted.** §3.5 replaces it: the guard becomes the single extractor and absorbs the parity assertion; the third caller reads the committed artifact. One extraction, not three. |
| B2 | HIGH (R3b) — P5's paired control proves the parameter is respected but not that the LIVE `definedIds()` call passes only `LEDGERS`; a widened live argument still passes. | **Accepted.** Plant **P5-live** pins the live invocation, the shape of `LEDGERS`, and that the list is load-bearing (§4.2). |
| B3 | HIGH (R3b) — Task 3 cannot literally move the entries: archives may not hold `IN PROGRESS`, and stripping the marker removes the branch provenance `BACKLOG_GRADUATED` asserts. | **Accepted in full.** AC-B5 specifies the meta-line rewrite that satisfies both guards. **My R3b-round refutation of the third claim was itself WRONG and is retracted:** I read `BACKLOG.md:86` as preceding the second heading, but the headings were at `BACKLOG.md:71` and `BACKLOG.md:90`, so `BACKLOG.md:86` sat INSIDE the first entry and `BACKLOG.md:102` inside the second. R4b caught the error. Root cause fixed rather than papered over — the added marker was a SECOND status line per entry; each entry's own `**Status:** OPEN.` is now the in-flight marker, so there is exactly one status per entry (`_metaLedgerInProgress.test.ts` 14/14). |
| B4 | HIGH (R4b) — P5-live pins results, not the default; a default widened with a currently-harmless plan path survives every declared assertion. | **Accepted.** P5-live now asserts EXACT membership of the default list (§4.2). |
| B5 | HIGH (R4b) — the plan never schedules P5-live; Tasks 2-3 say "P1-P8" throughout, so an implementer could omit the accepted regression test. | **Accepted.** The plan names the family "P1-P8 plus P5-live" at every site. |
| A6 | BLOCKING (R3a) — clauses 1/5/6 still permit three escape classes: a spread whose result preserves a literal code, declaration-only and callback factories treated as scanned uses, and `await asyncFactory()` outside the site kinds. | **Accepted, and answered structurally rather than by adding three more clauses.** This was round 3 on one vector, so §3.1 was INVERTED to fail-closed: the default is now SIGNAL, and a skip requires one of four machine-checkable classifications. `await` is a site kind; the USE test now requires a function-like declaration WITH A BODY (following import aliases), so declaration-only and callback factories signal; spread-preserved literals are captured by reading the OWN type. Re-measured 58 codes, 0 signalled, 22 classified skips. |
| B6 | HIGH (R5b) — AC-B5 silently misses one stale marker: the in-flight guard scans body lines 1-12 and `BL-LEDGER-GUARD-BODY-DEFINED-IDS` has its status at body line 13. | **Accepted.** AC-B5a asserts the transition directly instead of relying on that guard. The window limitation belongs to the sibling guard; it is covered here rather than assumed away. |
| B7 | HIGH (R5b) — P5-sole is canonical in the spec but absent from all five executable plan sites. | **Accepted, and it is the same defect R4b raised about P5-live one round earlier — my repair patched one site instead of sweeping the class.** All plan sites now enumerate TEN plants (P1-P8, P5-live, P5-sole), verified by grep rather than by inspection. |
| A7 | BLOCKING (R4a) — all four classifications can swallow a real definition: an `any`-sourced spread (FRAGMENT), an `unknown`-sourced validated copy (COPY), a `.map`-passed factory with zero direct call sites making "every call site resolves" vacuous (FACTORY_BODY), and a validate-and-return factory whose body contains no recognized site (USE). Four compiled mutants, all captured as nothing with no signal. | **Accepted — the decisive finding of the arc.** Each classification is now **capture-linked** in a second pass: FRAGMENT requires an enclosing warning site, COPY requires a warning-typed non-`any` spread source, FACTORY_BODY requires at least one DIRECT resolving call site, USE requires the callee's body to have actually produced a captured code. A local condition alone is no longer sufficient for any skip. Re-measured 58 / 0 / 22. |
| A8 | BLOCKING (R5a) — capture links are existential, not provenance-linked; four compiled mutants launder a code through `any` or reach a factory only via `.map`, and are neither captured nor signalled. | **Accepted as correct, and dispositioned as a documented LIMIT rather than repaired — the fifth consecutive round on one vector.** Provenance tracing through `any` and higher-order application is undecidable; no type-based recognizer can be sound against `const w: ParseWarning = someAny`. Per the finding-admissibility rule a hypothetical is a finding only if the corpus shows silent corruption: probed, **zero** such constructions exist in `lib/` or `app/`. §3.5a states the sound/loud/blind contract precisely instead of overclaiming, and files `BL-CATALOG-PARTITION-WARNING-CLASS` as the real closure — an enumerated warning universe, not a better scanner. |
| B1 | HIGH (R2b) — P5 is not behaviorally testable through the declared API: `bodyDefinedIds(text, opts)` cannot distinguish a ledger from a plan, and the only discriminator (`LEDGERS` / `definedIds`) is module-local. | **Accepted.** `definedIds` is exported with injectable `(ledgers, read)`, mirroring `citedIds`. P5 gains a paired control. Every other R2b probe supported the design and independently reproduced the arithmetic (43/46/47/58, 11 gained / 0 lost, 10 syntactic false positives, 11→8 body ids). |
| 4 | MEDIUM — false-positive arithmetic disagrees with the live sets; the "zero duplicate bindings" claim is false | **Accepted.** §2.3(a) now states one baseline and lists all ten. The duplicate-bindings limit is **deleted along with its mechanism** — type-aware resolution has no const map — and the false R1 claim is recorded in §3.6 rather than quietly dropped. |

The R1 reviewer's own probe predicted "the probed universe is at least 58"; the type-aware
measurement is exactly 58, independently reached.

---

## 12. Close-out

**impeccable-gate: N/A — no UI surface.**
