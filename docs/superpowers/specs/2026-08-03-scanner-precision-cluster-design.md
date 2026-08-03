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

**(a) Widen the roots, keep the file-level content predicate.** Mis-attributes **ten** non-warning
codes as `parse_warnings.code`:

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

### 3.1 The rule: type-aware ParseWarning construction sites

A code is a `parse_warnings.code` producer if and only if it is the `code` property of an
expression **whose type is assignable to `ParseWarning`**, as resolved by the TypeScript checker.
No rule keys on a spelling.

- **Site recognition.** Every object-literal expression under the roots whose contextual (else
  intrinsic) type is assignable to `ParseWarning` (`lib/parser/types.ts:67`). This admits
  `Phase2Args["parseResult"]["warnings"][number]`, `ParseResult["warnings"][number]`, and any
  future alias, because all resolve to the same type — closing §2.3(c). It also admits
  `severity: WARN_SEVERITY`, because the object's *type* is unchanged by how severity is spelled.
- **Code extraction.** The `code` property's **type**, following unions. A string-literal type
  yields one code; a union of literal types (e.g. `ReelWarningCode`) yields all its members. This
  handles shorthand `code` — the shorthand's type is the parameter's type — with no separate rule.
- **Widened `code`.** Where the property type widens to `string` (e.g.
  `warning(code: string)` at `lib/sync/applyStaged.ts:1017`), the codes live at the enclosing
  factory's **call sites**: resolve each call's first-argument type and take its literal members.
- **Unresolvable is SIGNALED, never dropped.** A site whose code type resolves to neither a literal
  nor a resolvable call-site argument is reported by name and fails the guard. Measured today: zero
  such sites (§2.5).

Roots are `["lib", "app"]` minus `lib/dev/**` — the gallery builds *synthetic* ParseWarnings
(`lib/dev/attentionScenarios/tier1.ts:152`) and would otherwise define its own universe, the same
self-justification tautology the ledger guard's header warns about
(`tests/docs/_metaLedgerReferentialIntegrity.test.ts:17-23`).

**Mechanism.** ts-morph over `tsconfig.json`, matching `lib/audit/noGlobalCursor.ts` and
`tests/cross-cutting/no-raw-codes-audit.ts:247`. **Single compiler world**: ts-morph wrappers and
its exported `ts` namespace only; the standalone `typescript` package is never imported
(`docs/superpowers/specs/2026-08-01-redirect-guard-type-aware-design.md:218`).

<!-- spec-lint: ignore — new file introduced by this change; not tracked until implementation -->
The recognizer lands as `lib/messages/__internal__/parseWarningSites.ts`, beside
`lib/messages/__internal__/stripLogEmissionCalls.ts` and
`lib/messages/__internal__/walkSourceFiles.ts`.

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

**Decision.** The recognizer memoizes both the `Project` and the extraction result at module scope,
so a process pays once. Three surfaces call `extractInternalCodeEnums()` today
(`tests/cross-cutting/no-raw-codes.test.ts`,
`tests/cross-cutting/cron-run-summary-scanner-safety.test.ts`, and the `gen:internal-code-enums`
script), plus the new guard; vitest workers are separate processes, so the worst case is roughly one
load per worker that touches them.

**This is a real tradeoff, stated rather than hidden.** The parity assertion at
`tests/cross-cutting/no-raw-codes.test.ts:34` — artifact must equal a fresh extraction — is what
makes AC-A8 machine-enforced, and it is precisely the assertion that cannot read the cached
artifact. Implementation measures the actual suite delta (plan Task 4). If it proves unacceptable,
the fallback is to move the fresh-extraction parity check into a dedicated CI job rather than the
default suite, keeping the artifact-reading consumers cheap. That fallback is named here so the
choice is a decision rather than a discovery.

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
   define itself.
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
| P5 — the P1 bullet in a NON-ledger file | defines nothing |
| P6 — the P1 bullet under a heading whose own id does not resolve | defines nothing |
| **P7 — the P1 bullet after an intervening non-id heading** | **does NOT define (trap 2)** |
| **P8 — the real `BACKLOG-archive.md:1094-1096` shape, with the picker headings removed in-memory** | **does NOT define** — the R1 mutant, pinned |

### 4.3 Residue deletion

Eight rows leave `KNOWN_DANGLING` (`tests/docs/_metaLedgerReferentialIntegrity.test.ts:95`).
`BL-RESOLVED` stays (§1). The guard's existing stale-row ratchet makes this self-enforcing.

---

## 5. Acceptance criteria

**Item A**

- **AC-A1** The recognizer yields exactly **58** codes; the set is a strict superset of today's
  47-code gallery universe (zero lost) and the 11 additions are exactly §2.4.
- **AC-A2** None of the ten non-warning codes of §2.3(a) carries `parse_warnings.code` provenance.
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
- **AC-A8** `pnpm gen:internal-code-enums` re-run and the regenerated artifact committed in the
  same commit. Machine-enforced by `tests/cross-cutting/no-raw-codes.test.ts:34`.
- **AC-A9** `tests/cross-cutting/cron-run-summary-scanner-safety.test.ts` still passes —
  `CRON_RUN_SUMMARY` (`lib/cron/runSummary.ts:4`) is a bare `export const`, not a ParseWarning
  construction, so it is excluded by type rather than by the content predicate this change removes.

**Item B**

- **AC-B1** All eight ids resolve; `KNOWN_DANGLING` retains exactly one row, `BL-RESOLVED`.
- **AC-B2** Plants P1–P8 pass as specified in §4.2.
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
| 4 | MEDIUM — false-positive arithmetic disagrees with the live sets; the "zero duplicate bindings" claim is false | **Accepted.** §2.3(a) now states one baseline and lists all ten. The duplicate-bindings limit is **deleted along with its mechanism** — type-aware resolution has no const map — and the false R1 claim is recorded in §3.6 rather than quietly dropped. |

The R1 reviewer's own probe predicted "the probed universe is at least 58"; the type-aware
measurement is exactly 58, independently reached.

---

## 12. Close-out

**impeccable-gate: N/A — no UI surface.**
