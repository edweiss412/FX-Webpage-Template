<!-- spec-lint: not-ui — no UI surface: this change touches a build-time scanner, a generated enum, and two structural meta-tests. impeccable-gate: N/A. -->

# Scanner precision cluster — widen the scan, delete the residue, guard the class

**Date:** 2026-08-03
**Branch:** `chore/scanner-precision-cluster`
**Backlog entries:** `BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`, `BL-LEDGER-GUARD-BODY-DEFINED-IDS`
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

Each row is settled. The ratification is cited so a reviewer verifies the contract rather than
re-deriving it.

| Decision | Status | Ratification |
| --- | --- | --- |
| The eight body-defined ids **stay body-defined**; promoting them to headings is off the table | Ratified 2026-08-02 | `BACKLOG.md:91`, `BACKLOG.md:92` — the parent owns the shrink-only ratchet that gives the sub-items meaning; split across five headings that ratchet has no single home |
| No `WARNING_CARD_COPY_CODES` rows for the seven recovered codes | Out of scope | `tests/messages/warningCardCopyRegistry.ts:1-4` — a hand-listed, byte-frozen enforcement arm of spec `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md` §4.2, not derived from the generated enum; no test couples them (probed §2.7) |
| `BL-RESOLVED` stays in `KNOWN_DANGLING` | Out of scope | `tests/docs/_metaLedgerReferentialIntegrity.test.ts:105` — prose in an audit doc, not a body-defined id |
| `lib/agenda` is NOT added to the scan roots | Measured no-op | §2.2 — its only occurrence is a correctly stripped `log.warn` span |
| `stripLogEmissionCalls` behavior is unchanged | Correct as-is | `lib/messages/__internal__/stripLogEmissionCalls.ts:1-13` — `app_events.code` is forensic and deliberately not §12.4-gated |
| Type-declaration stripping is NOT the precision mechanism | Probed and rejected | §2.4 — both leaking codes have genuine *value* positions in non-ParseWarning objects |

---

## 2. Probe log — what is actually true

Every claim below is settled by probe, per the AGENTS.md finding-admissibility contract for
detector surfaces. The brief that opened this work carried three attributions that the probe
**refuted**; they are recorded here so no later round re-derives them.

### 2.1 Item A — the surface as it stands

`extractInternalCodeEnums` (`scripts/extract-internal-code-enums.ts:70-74`) collects
`parse_warnings.code` literals from `readFiles(["lib/parser"])` filtered by
`/\bParseWarning\b|\bwarnings\b|hardErrors/`, using `CODE_PROPERTY_RE`
(`scripts/extract-internal-code-enums.ts:17`). The attention-scenario gallery unions that
generated enum with a hand-maintained residue, `EXTRA_WARNING_CODES`
(`lib/dev/attentionScenarios/tier1.ts:131`, consumed at `lib/dev/attentionScenarios/tier1.ts:142`).

### 2.2 Item A — refuted premises

| Claim (from the backlog entry / the `tier1.ts` comment) | Probe verdict |
| --- | --- |
| The comment at `lib/dev/attentionScenarios/tier1.ts:114-130` blames the content regex | **Refuted for 3 of 4.** `lib/sync/enrichAgenda.ts` (ParseWarning×2, warnings×8) and `lib/sync/pullSheetOverride.ts` (ParseWarning×3, warnings×4) both PASS the content regex. They are missed because `readFiles(["lib/parser"])` never opens them. |
| All four residue codes are emitted outside `lib/parser` | **Refuted.** `PULL_SHEET_ON_ARCHIVED_TAB` is emitted at `lib/parser/dataGaps.ts:60`, inside the scanned root, and is **already** in the generated enum. Its residue row is dead — the rot the entry predicts, already happened. |
| `AGENDA_SCHEDULE_LOW_CONFIDENCE` is emitted by `lib/agenda/extractAgendaSchedule.ts` | **Refuted.** That occurrence (`lib/agenda/extractAgendaSchedule.ts:634`) sits inside a `log.warn(…)` span, which `stripLogEmissionCalls` strips **deliberately and correctly**. The real emitter is `lib/sync/enrichAgenda.ts:425`. Adding `lib/agenda` to the roots changes nothing (measured: 57 codes with or without it). |

### 2.3 Item A — why naive widening is wrong

Widening the roots to `["lib/parser", "lib/sync"]` while keeping the file-level content predicate
and `CODE_PROPERTY_RE` **mis-attributes nine non-warning codes** as `parse_warnings.code`:

```
DRIVE_FETCH_FAILED, PARSE_ERROR_LAST_GOOD, RESYNC_QUALITY_REGRESSED, RESYNC_SHRINK_HELD,
SHEET_UNAVAILABLE, SHOW_FIRST_PUBLISHED   <- upsertAdminAlert({ code: ... }) calls
ROLE_FLAGS_NOTICE                          <- type member AND a changes-feed value literal
STAGED_PARSE_OUTDATED_AT_PHASE_D           <- type member AND a gate-result value literal
```

`lib/sync/runScheduledCronSync.ts` matches the content predicate (it handles warnings) while its
`code:` literals are admin-alert codes, e.g. `lib/sync/runScheduledCronSync.ts:2655`.

### 2.4 Item A — type-stripping is not the mechanism

A candidate `stripTypeDeclarations` pass was built and probed, then **rejected**: `ROLE_FLAGS_NOTICE`
has a genuine value position at `lib/sync/phase2.ts:591` (`code: "ROLE_FLAGS_NOTICE" as const`)
besides its type member at `lib/sync/phase2.ts:155`, and `STAGED_PARSE_OUTDATED_AT_PHASE_D` has one
at `lib/sync/pullSheetOverride.ts:98` besides its type member at
`lib/sync/pullSheetOverride.ts:79`. The discriminator cannot be the file, the root, or the
type-ness. It must be the **construction site**.

### 2.5 Item A — the corruption the guard prevents

The class sweep required by AGENTS.md found the residue list is not the only thing rotting.
Searching for ParseWarning factory helpers **by return type** rather than by name found three:

| Factory | Declared at | Reached by a name-keyed rule? |
| --- | --- | --- |
| `warn(code, message): ParseWarning` | `lib/sync/enrichAgenda.ts:45` | yes |
| `warning(code, message): ParseWarning` | `lib/sync/enrichWithDrivePins.ts:162` | **no** |
| `warning(code, message): ParseWarning` | `lib/sync/snapshotAssets.ts:87` | **no** |

The two `warning(...)` factories emit **seven parse-warning codes present in neither the generated
enum nor the residue** — silently dark in the attention-scenario gallery, every one of them a real
`lib/messages/catalog.ts` §12.4 row:

```
DIAGRAMS_TAB_MISSING                       DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE
DIAGRAMS_EMBEDDED_NONE_FOUND               DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE
DIAGRAMS_EMBEDDED_CAP_EXCEEDED             LINKED_FOLDER_OVERFLOW_TRUNCATED
EMBEDDED_ASSET_DRIFTED
```

Emission sites: `lib/sync/enrichWithDrivePins.ts:199`, `lib/sync/enrichWithDrivePins.ts:207`,
`lib/sync/enrichWithDrivePins.ts:219`, `lib/sync/snapshotAssets.ts:151`,
`lib/sync/snapshotAssets.ts:171`.

This is the probe demonstrating the corruption the guard prevents, as the admissibility contract
requires. It also settles the entry's own argument: `warningCodes()` de-duplicates, so absorbing a
code **shrinks** the residue rather than double-rendering it, and under-coverage shows no symptom
at all. Seven codes were dark and nothing failed.

### 2.6 Item A — a second, independent defect in the consumer

`lib/dev/attentionScenarios/tier1.ts:139` and `tests/dev/attentionScenariosWarnings.test.ts:22`
both filter with **exact string equality** against `source`, which is a comma-joined provenance
list. A code found by the parse-warnings pass **and** any other pass gets
`"admin_alerts.code,parse_warnings.code"` and is silently dropped even though it is a genuine parse
warning. Measured today: the generated enum holds 46 codes whose provenance *includes*
`parse_warnings.code`, but only 43 whose provenance *equals* it —
`MI-1_VERSION_DETECTION_FAILED` (`lib/messages/__generated__/internal-code-enums.ts:134`),
`PULL_SHEET_ON_ARCHIVED_TAB`, and `VERSION_AMBIGUOUS` are excluded by the equality alone. This is
why widening the producer is **necessary but not sufficient**: two of the four residue codes stay
missing unless the consumer filter changes too.

### 2.7 Item A — coupling check

`tests/messages/warningCardCopyRegistry.ts:4` is a hand-listed `ReadonlySet`; no assertion derives
it from, or requires it to cover, `INTERNAL_CODE_ENUMS`. The only membership assertion against the
generated enum is `tests/messages/inlineLaterGroupCopy.test.ts:128-131`, which pins specific codes
to source `parse_warnings.code`; none of the seven recovered codes appears there (all seven are
absent from the generated enum today, so such a row would already be failing). Adding codes to the
enum therefore requires no copy work.

### 2.8 Item B — the corpus contains the trap

The entry states the body-bullet grammar as strong-wrapping-code. Probed against the corpus, that
covers only **five of the eight** ids. Three distinct bullet shapes exist, and the discriminator
between them is load-bearing:

| Location | Shape | Owning entry | Defines? |
| --- | --- | --- | --- |
| `BACKLOG.md:597-601` | `- **` + backticked id + `** — ...` (strong wrapping code) | `BACKLOG.md:591` `### BL-MUTATION-HARNESS-OPEN-HOLES` | **yes** |
| `BACKLOG.md:1079-1081` | `- **BL-SYNCFEED-UI-1** — ...` (strong, no backticks) | `BACKLOG.md:1075` `### BL-SYNC-FEED-UI-POLISH` | **yes** |
| `BACKLOG.md:91-92` | backticked ids, comma-separated, **no strong** | `BACKLOG.md:83` `## BL-LEDGER-GUARD-BODY-DEFINED-IDS` | **no** |

`BACKLOG.md:91` sits inside the backlog entry **for this very work** and leads a bullet with the
same five ids as inline code spans. A recognizer keyed on "bullet lead with a code span" would let
that entry define the five ids it merely discusses — precisely failure mode 2 from the entry,
already present in the corpus. The strong-span requirement rejects it.

---

## 3. Item A — design

### 3.1 The rule: ParseWarning construction-site scoping

Replace the parse-warnings pass's file-level heuristic with a shape-level one. A code literal is a
`parse_warnings.code` producer if and only if it sits at a **ParseWarning construction site**,
recognized by three rules over `stripLogEmissionCalls`-stripped source:

- **R1 — severity-adjacent literal.** `code: "SHOUTY"` whose *innermost enclosing object literal*
  also carries `severity: "warn"` or `severity: "info"` — the two members of the `ParseWarning`
  severity union (`lib/parser/types.ts:68`). Enclosure is computed by a string-, template- and
  comment-aware brace walk, so a brace inside a string or comment never shifts the scope.
- **R2 — factory call.** `NAME("SHOUTY", ...)` where `NAME` is a function **discovered by return
  type** — every `function NAME(...): ParseWarning` or `const NAME = (...): ParseWarning` in the
  scanned roots. Names are never hardcoded; that is the defect §2.5 found.
- **R3 — const-identifier resolution.** `code: IDENT` at an R1 site, where `IDENT` resolves against
  a map of `const IDENT = "SHOUTY"` bindings collected across the roots. Required by
  `lib/sync/blockDisappearance.ts:81` (`code: BLOCK_DISAPPEARED`, imported from
  `lib/parser/warnings.ts:67`). An **unresolved** identifier at a construction site is a guard
  failure, not a silent drop.

Roots widen to `["lib", "app"]`, excluding `lib/dev/**` — the attention-scenario gallery builds
*synthetic* ParseWarnings (`lib/dev/attentionScenarios/tier1.ts:152`) and would otherwise define
its own universe, the same self-justification tautology the ledger guard's header warns about
(`tests/docs/_metaLedgerReferentialIntegrity.test.ts:17-23`).

<!-- spec-lint: ignore — new file introduced by this change; not tracked until implementation -->
The recognizer lands as a new shared module, `lib/messages/__internal__/parseWarningSites.ts`,
beside the existing `lib/messages/__internal__/stripLogEmissionCalls.ts` and
`lib/messages/__internal__/walkSourceFiles.ts`, so the generator and the guard consume one
implementation.

### 3.2 Measured outcome

| Configuration | Codes | Lost vs today | False positives | Residue covered |
| --- | --- | --- | --- | --- |
| Today (`lib/parser` + `code:` literal) | 43 gallery / 46 enum | — | — | 0 of 4 |
| Roots widened only | 55 | 0 | 9 | 2 of 4 |
| Roots + name-keyed `warn(` | 57 | 0 | 11 | 4 of 4 (raw) |
| **R1+R2+R3 construction-site scoping** | **54** | **0** | **0** | **4 of 4** |

The final row equals today's 47-code gallery universe — the 43 codes whose provenance *equals*
`parse_warnings.code` (what the exact-equality consumer of §2.6 actually renders) ∪ the 4 residue
codes, none of which is among those 43 — plus the seven dark codes from §2.5. Nothing lost,
nothing spurious gained.

### 3.3 Consumer change

`warningCodes()` (`lib/dev/attentionScenarios/tier1.ts:139`) and `generatedWarningCodes()`
(`tests/dev/attentionScenariosWarnings.test.ts:22`) change from exact equality to **membership**:
`v.source.split(",").includes("parse_warnings.code")`.

Membership is only safe *because* the producer is now precise (§3.2: zero false positives).
Membership over today's imprecise producer would admit the eleven non-warnings of §2.3 — measured,
and the reason these two changes must land together rather than as separable improvements.

### 3.4 Residue deletion

`EXTRA_WARNING_CODES` (`lib/dev/attentionScenarios/tier1.ts:131`) is deleted along with its comment
block (`lib/dev/attentionScenarios/tier1.ts:114-130`), whose stated rationale is refuted by §2.2.
The test that pins it (`tests/dev/attentionScenariosWarnings.test.ts:35`) is deleted with it; the
replacement assertion is AC-A4.

### 3.5 The guard

<!-- spec-lint: ignore — new file introduced by this change; not tracked until implementation -->
A new structural meta-test, `tests/messages/_metaParseWarningSiteCoverage.test.ts`, fails when a
ParseWarning code literal exists anywhere the generator does not reach. Two complementary arms,
because a guard sharing the producer's recognizer verbatim can only be tautological:

- **G1 — root coverage.** Runs the *shared* recognizer over the **whole tracked tree**
  (`git ls-files` for `*.ts` / `*.tsx`, minus `tests/**`, `lib/dev/**`, and
  `lib/messages/__generated__/**`) and asserts every construction site found lives in a file the
  generator's roots actually open. Shares the recognizer deliberately: this arm tests **roots**,
  not shape. An emitter landing in a new top-level directory fails here.
- **G2 — shape coverage.** Uses an **independent, deliberately over-broad** recognizer: every
  quoted SHOUTY literal that is either inside an object literal carrying `severity: "warn"` or
  `severity: "info"`, or the first argument of *any* function whose declared return type mentions
  `ParseWarning`. Asserts that set is a subset of the generated `parse_warnings.code` set ∪ an
  explicit `KNOWN_NON_WARNING_SITES` registry, each row carrying a reason. G2's factory discovery
  is by return type and its literal match is name-agnostic, so a future factory named `mkWarn` or
  `pw` is caught even though R2's discovered-name list would also have to grow. **This is the arm
  that would have caught the seven dark codes**, and the arm that keeps the class closed.

An unresolved R3 identifier at a construction site fails G2 with the identifier named.

### 3.6 Documented limits

Not defects; recorded so a reviewer does not raise them as findings.

- A code assembled at runtime (a template literal rather than a quoted literal) is not recognized
  by any rule. No such emitter exists today (probed). If one lands, G2 reports the site as a
  literal-free construction rather than silently passing.
- R3 resolves const bindings by name across roots, not by import graph. Two different consts
  sharing a SHOUTY name with different values would collide. None exist today (probed: zero
  unresolved identifiers, zero duplicate bindings).
- `lib/dev/**` is excluded by design (§3.1). The gallery's own synthetic warnings are not the
  warning universe.
- The acceptance posture is the preparedness-audit one — every emitter is captured or **signaled**,
  never silently dropped — not "no imaginable defeating input"
  (`docs/audits/edge-case-preparedness-audit-2026-07-04.md:92`).

---

## 4. Item B — design

### 4.1 The rule

`definedIds()` (`tests/docs/_metaLedgerReferentialIntegrity.test.ts:124`) becomes headings **∪**
body-defined ids. A new exported `bodyDefinedIds(text, opts)` in `tests/docs/_ledgerMdast.ts`,
built on the existing `extractEntries` (`tests/docs/_ledgerMdast.ts:302`, which already returns
`body: RootContent[]` per `tests/docs/_ledgerMdast.ts:95-99`):

For each entry in a **ledger** file, for each **top-level** `list` in `entry.body`, for each
`listItem`, take its first `paragraph` child. If that paragraph's **first child** is a `strong`
node whose concatenated text content (`text` plus `inlineCode` children) is exactly an id matching
`opts.requirePrefix`, that id is DEFINED by that entry.

Both failure modes are closed **structurally**, not by an added check:

1. *Must be inside a resolving parent entry.* Only the `LEDGERS` files
   (`tests/docs/_metaLedgerReferentialIntegrity.test.ts:55-60`) are walked, and only through
   `extractEntries`, whose spans are keyed by a resolving heading id. A bullet in a plan or a spec
   is never reached, so a typo there cannot define itself.
2. *Must be a bullet LEAD, not any inline mention.* "First child of the first paragraph of a list
   item" admits nothing else. An id in the middle of a sentence is not the first child.

The **strong** requirement is what separates definition from enumeration, and it is load-bearing
rather than cosmetic: it is the only thing rejecting `BACKLOG.md:91` (§2.8).

### 4.2 Plants in the guard's own corpus

The guard's header (`tests/docs/_metaLedgerReferentialIntegrity.test.ts:17-23`) states why
self-justification is the tautology the file is built to avoid, so each failure mode gets a planted
case exercised against a **synthetic** corpus through the already-exported units, matching the
existing `NOT_A_CITATION` / `isFamilyReference`
(`tests/docs/_metaLedgerReferentialIntegrity.test.ts:160`) posture.

| Plant | Asserts |
| --- | --- |
| P1 — strong-wrapping-code bullet under a resolving parent heading | DEFINES |
| P2 — strong-plain bullet under the same parent | DEFINES |
| P3 — code-span lead, no strong, under the same parent | does NOT define (the `BACKLOG.md:91` shape) |
| P4 — strong id mid-sentence, not leading the bullet | does NOT define |
| P5 — the P1 bullet placed in a NON-ledger file | defines nothing |
| P6 — the P1 bullet under a heading whose own id does not resolve | defines nothing |

### 4.3 Residue deletion

Eight rows leave `KNOWN_DANGLING` (`tests/docs/_metaLedgerReferentialIntegrity.test.ts:92`): the
five `BL-MUTATION-*` and the three `BL-SYNCFEED-UI-*`. `BL-RESOLVED` stays (§1). The guard's
existing stale-row ratchet makes this self-enforcing: leaving a row that now resolves fails the
run.

---

## 5. Acceptance criteria

**Item A**

- **AC-A1** `extractInternalCodeEnums()` yields exactly 54 codes with provenance including
  `parse_warnings.code`; the set equals today's 47-code gallery universe ∪ the seven codes of §2.5.
- **AC-A2** None of the eleven false positives of §2.3 carries `parse_warnings.code` provenance.
- **AC-A3** `EXTRA_WARNING_CODES` does not exist in the tree.
- **AC-A4** `warningCodes()` contains all four former residue codes, sourced from the generator
  alone, and remains duplicate-free.
- **AC-A5** G1 fails on a fixture emitter placed outside the generator's roots.
- **AC-A6** G2 fails on a fixture emitter using a factory named neither `warn` nor `warning`,
  proving the guard is not name-keyed — a live escaping mutant against the shipped guard.
- **AC-A7** `pnpm gen:internal-code-enums` is re-run and the regenerated
  `lib/messages/__generated__/internal-code-enums.ts` is committed in the same commit.

**Item B**

- **AC-B1** All eight ids resolve; `KNOWN_DANGLING` retains exactly one row, `BL-RESOLVED`.
- **AC-B2** Plants P1 through P6 pass as specified in §4.2.
- **AC-B3** The whole-repo referential-integrity assertion passes with no new exemption.

**Both**

- **AC-C1** `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` clean.
- **AC-C2** Both backlog entries graduate to `BACKLOG-archive.md`; the `Last reconciled:` line at
  `BACKLOG.md:7` gains a new leading segment.

---

## 6. Backlog graduation

Both entries graduate to `BACKLOG-archive.md` at their terminal state. Two sibling panes are
graduating other rows from `BACKLOG.md` concurrently; a rebase conflict is expected. **Resolve by
keeping BOTH sides** — the entries are disjoint and the `Last reconciled:` line concatenates.

---

## 12. Close-out

**impeccable-gate: N/A — no UI surface.** Neither item touches `app/` (except nothing),
`components/`, an `app/globals.css` `@theme` token block, `DESIGN.md`, or `tailwind.config.*`.
