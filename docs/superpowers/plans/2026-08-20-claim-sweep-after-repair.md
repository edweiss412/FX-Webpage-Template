# Plan — `spec:lint` claim sweep after a repair

Spec: `docs/superpowers/specs/ci/2026-08-20-claim-sweep-after-repair.md` (canonical; every § reference
below is to it). Ledger row: `BL-SPEC-CLAIM-SWEEP-AFTER-REASONING-FINDING`. Probe record:
`docs/superpowers/specs/ci/probes/2026-08-20-claim-sweep-after-repair-probes.md`.

The arm reports, as an ADVISORY, the claims elsewhere in one arc's declared documents that a repair
superseded and left standing. Two halves — a numeric one keyed on a declared superseded/replacement
pair, and a named-claim one keyed on a declared identifier — four finding codes, three refusals, and
TEN documented limits. Nothing here infers a semantic fact from a diff.

impeccable-gate: N/A — no UI surface. Every file this plan touches is under `lib/specLint/`,
`scripts/`, `tests/`, or `docs/`; nothing under `app/` (except none), `components/`, `app/globals.css`,
`tailwind.config.*`, or `DESIGN.md`.

---

## 0. Pre-draft code-verification pass — authored AND RUN

Every claim this plan makes about live code was verified in the authoring session, with the command
printed beside its output. A prompt-shaped string next to a number is not evidence.

```
$ ls lib/specLint/
citationIntent.ts  citations.ts  copyRules.ts  emDash.ts  fixtureContract.ts  numerics.ts
parse.ts  redContract.ts  run.ts  sections.ts  taskContract.ts  types.ts  universals.ts
waiverCoverage.ts

$ grep -n -A4 'export type Check' lib/specLint/types.ts
2:export type Check =
3-  | "document"
4-  | "citations"
5-  | "numerics"
6-  | "copy"

$ grep -n 'readFileLines\|listTrackedFiles' lib/specLint/types.ts
43:  readFileLines(path: string): string[] | null;
44:  listTrackedFiles(): string[];

$ sed -n '/export interface Finding/,/^}/p' lib/specLint/types.ts
  check / code / severity / docLine / column ("1-based UTF-16 code-unit offset") / message / detail?

$ grep -n '"spec:lint"' package.json
28:    "spec:lint": "tsx scripts/spec-lint.ts",

$ grep -n '"--' scripts/spec-lint.ts | head
347: --json     350: --exec-red     353: --kind     362: unknown `--` token rejected
$ grep -n 'const resolver: FileResolver' scripts/spec-lint.ts
440:    const resolver: FileResolver = {

$ ls tests/mutation/source/ | grep -i 'expectedLedgerKinds\|registry'
expectedLedgerKinds.ts
$ grep -rn 'EXPECTED_LEDGER_KINDS' tests/mutation/guardSurfaces.gates.test.ts
11:import { EXPECTED_LEDGER_KINDS } from "./source/expectedLedgerKinds";
21:    expect(Object.keys(EXPECTED_LEDGER_KINDS).sort()).toEqual(

$ grep -n -A8 'id: "premiseScan"' tests/mutation/source/registry.ts
168-175: id / sourcePath / suitePaths[] / operators[] / scoreFloor: 0.95 / control / accepted

$ ls tests/docs/ | grep -i readme
specsReadmeIndexParity.test.ts

$ sed -n '160,175p' lib/specLint/redContract.ts        # targetProblem, the red-target contract
  path-only form is legal ONLY while the path is UNTRACKED:
    "…is tracked; cite the defective line instead of the bare path"
  line form requires the path tracked AND the line in range; content is NEVER checked
```

**Two facts from that pass drive design decisions below**, and both are named here so no task re-derives
them: `Finding.column` already exists and is documented as a 1-based UTF-16 offset (so §3.4's identity
needs no new field), and `targetProblem` verifies only that a tracked path has an in-range line and
never what is AT it (so a citation that drifts stays green by design — §3 below).

---

## 1. Meta-test inventory

This plan CREATES no new structural meta-test. It EXTENDS three, and each extension is automatic or a
one-row declaration rather than new machinery:

| Meta-test | How this plan touches it |
| --- | --- |
| `tests/specLint/_metaPureCore.test.ts` | AUTOMATIC. It walks `lib/specLint/` recursively and fails by default on a new file, so the new `claimSweep` module is covered the moment it exists. Its floor assertion is `files.length >= 8`; this plan raises the count and no edit is needed. The purity pin is what forces the git read into the adapter (§4 of the spec). |
| `tests/mutation/guardSurfaces.gates.test.ts` | ONE declaration: a `claimSweep` key in `tests/mutation/source/expectedLedgerKinds.ts`, which that suite reads as its expected key set. A registry row without it leaves the corpus gate red. |
| `tests/docs/specsReadmeIndexParity.test.ts` | ONE row in `docs/superpowers/specs/ci/README.md` for the spec. The PER-DIRECTORY index is the one this suite enforces. |

No advisory-lock surface, no Supabase call boundary, no admin mutation, no `admin_alerts` catalog row —
this arm reads documents and emits lint findings. Declared explicitly rather than left silent.

The three other mandatory task types are N/A with their reasons, declared rather than omitted: **no
layout-dimensions task** (no fixed-dimension parent, no rendered DOM at all); **no transition-audit task**
(no component, no transition inventory); **no e2e harness-readiness checklist** (no Playwright, no
server). **No TypeScript snippet is embedded in any task body**, so the typecheck-pasted-snippets pass has
an empty subject — the code shapes live in the suites the tasks create, under the repo's strict tsconfig,
and the plan names behaviour rather than pasting implementations.

---

## 2. Architecture and the purity boundary

```
scripts/spec-lint.ts          adapter: parses the new flags, runs git for the repair's hunk spans,
                              resolves the --also peers, hands the core plain data
lib/specLint/claimSweep.ts    NEW, pure: sentence scoping, co-occurrence, identifier matching, codes
lib/specLint/run.ts           threads the injected RepairRecord core-ward
lib/specLint/types.ts         RepairRecord, and "claimSweep" in the Check union + CHECK_ORDER
```

The adapter alone reads git; the core is a pure map from (documents, `RepairRecord`) to findings — the
same injection shape `ExecResults`, `ParseResults` and `FixtureResults` already use in `runLint`. A null
record means no repair was declared and the arm runs nothing. `_metaPureCore` enforces this
structurally rather than by convention.

**One document is LINTED per invocation; the SWEPT set is larger.** `spec:lint` takes one document
(AC-9). The `--also` peers are swept for occurrences and are not themselves linted — a distinction the
adapter makes explicit, because conflating them would silently double-lint a plan as a spec.

---

## 3. Citation lifetime — this plan's own execution invalidates its own red-targets

Stated up front because it is a temporal dependency nobody writes into a plan and it has cost other arcs
hard failures with no edit to the plan at all.

`targetProblem` accepts a PATH-ONLY `red-target=` only while the path is UNTRACKED — "…is tracked; cite
the defective line instead of the bare path". the new module does not exist today, so every
task below legally cites it path-only AT PLAN TIME. **Task 1 tracks it, and from that commit every
remaining path-only citation is a hard `RED_TARGET_INVALID`.**

The repair is to RE-POINT, never to waive (Task 12), and two rules make the re-pointing durable:

- **Every `why=` cites BY SYMBOL or QUOTED CONTENT, never by line.** A symbol survives a shift; a line
  number does not.
- **`RED_TARGET_INVALID` verifies only that a tracked path has an IN-RANGE line, never what is at it.**
  A citation that drifts onto different code stays green BY DESIGN. So Task 12 re-verifies by READING
  each line and matching it to the `why=`'s named symbol — not by confirming the citation resolves.

**Anchor table.** Task 12 fills the HEAD column by reading; the BASE column is what the plan cites now.

```
| Task | red-target at BASE (plan time) | Symbol the `why=` names | red-target at HEAD (filled by Task 12) |
| --- | --- | --- | --- |
| 1 | `lib/specLint/claimSweep.ts` (untracked) | `checkClaimSweep` | — file created by this task |
| 2 | `lib/specLint/claimSweep.ts` | `refusalFor` | |
| 3 | `lib/specLint/claimSweep.ts` | `namedHalf` | |
| 4 | `lib/specLint/claimSweep.ts` | `CLAIM_IDENTIFIER_NOT_FOUND` | |
| 5 | `lib/specLint/claimSweep.ts` | `sweptSet` | |
| 6 | `lib/specLint/claimSweep.ts` | `CLAIM_SWEEP_CODES` | |
| 7 | `scripts/spec-lint.ts` (tracked) | the `--superseded` arm of the flag loop | |
| 8 | `lib/specLint/claimSweep.ts` | `checkClaimSweep` | |
| 9 | `lib/specLint/claimSweep.ts` | `sentencesOf` | |
| 10 | `tests/mutation/source/expectedLedgerKinds.ts` (tracked) | `EXPECTED_LEDGER_KINDS` | |
| 11 | `lib/specLint/claimSweep.ts` | `checkClaimSweep` | |
| 12 | `lib/specLint/claimSweep.ts` | `CLAIM_SWEEP_CODES` | |
```

<!-- spec-lint: ignore — the path is the SUBJECT of this sentence; Task 1 creates it and Task 12 re-points every citation to it -->
**TEN of the twelve cite `lib/specLint/claimSweep.ts` path-only, and ALL TEN are invalidated by Task 1's
commit** — Task 1's own marker included, because the lint reads the whole plan at any later time and does
not care that that task's red already happened. Counted, not estimated:

```
$ grep -c '^<!-- task: .*red-target=`lib/specLint/claimSweep.ts`' <this plan>
10
```

**The command is anchored to the MARKER line on purpose, and the unanchored form is wrong here.** A bare
`grep -c` for the citation returns ELEVEN, because the command's own printed form is a line of this
document and counts itself — the guard measuring its own text, one document earlier than the place that
usually bites. Anchoring to `^<!-- task:` excludes the prose that talks ABOUT the citation from the
count of citations.

That is the count Task 12's RED step must observe. A different count means a citation was edited or a
task was added without its anchor row, and either is a defect in this plan rather than in the
implementation. The two exceptions are Task 7 (`scripts/spec-lint.ts`) and Task 10
(`tests/mutation/source/expectedLedgerKinds.ts`), both tracked today and both cited in line form from
the start.

---

<!-- tasks: depth=2 red-contract -->

## Task 1 — the numeric half: sentence scoping and co-occurrence

<!-- task: red=`pnpm vitest run tests/specLint/claimSweepNumeric.test.ts` red-state=authored red-target=`lib/specLint/claimSweep.ts` why=`checkClaimSweep does not exist, so every numeric-half case throws on an undefined export and no sentence can be scoped` ac=AC-1,AC-6 -->

**What is red and why:** the suite is new and imports `checkClaimSweep` from a module that does not
exist, so the file cannot COLLECT. **This is the plan's ONE collection-shaped red and it is called out
as such**, because a command that fails for the wrong reason exits non-zero, looks healthy to every check
that asks "did this fail", and goes green when the TEST file is edited rather than when the
implementation lands. Two things make it legitimate here and both are required of the RED step: the
observed output must NAME the missing module (matched against this `why=`, not merely non-zero), and the
only edit that could turn it green without an implementation is deleting the import, which deletes the
test. **Every LATER task's red is a VALUE assertion**, because the module exists from Task 1 onward — a
task whose red is still an import error after Task 1 is a defect in that task, not a red.

Implements §3.1. A declared `--superseded N --replacement M` reports every occurrence of `N` whose
SENTENCE does not also carry `M`. Sentence, not line: the incident's sharpest survivor shares a line
with a transition sentence, and line scope excludes the whole line and misses it.

Fixtures, each naming the strictly weaker implementation it kills (§6):

- the naive form (report every surviving `N`) — killed by a transition sentence carrying BOTH values
  drawing nothing;
- LINE scope — killed by a line carrying both a `57`/`58` transition sentence AND a separate stale `58`
  sentence: line scope reports nothing, sentence scope reports the stale one;
- "exclude anything inside the repair's diff" — killed by the incident's survivor, an ADDED line inside
  the repair's own hunk, which must still report.

Paired positives, one variable apart, because an expect-CLEAN fixture is satisfied by any implementation
that fails to look: the transition sentence with the replacement DELETED reports; the declared pair whose
superseded value appears nowhere is paired against the SAME declaration over documents where it DOES
appear (the corpus is the variable, the declaration is held fixed).

## Task 2 — the three refusals, and their channel

<!-- task: red=`pnpm vitest run tests/specLint/claimSweepRefusals.test.ts` red-state=authored red-target=`lib/specLint/claimSweep.ts` why=`refusalFor does not exist, so a declaration with N equal to M is accepted and the run reports zero on a corpus where the value occurs` ac=AC-3 -->

**What is red and why:** `refusalFor` is unexported, so the N-equals-M case runs the sweep and returns
`[]`; the assertion that it REFUSES and names both values fails on a value comparison, not on a
collection error.

Implements §3.0 and the REFUSAL channel of §3.4's signal inventory. Three refusals, each exiting 2 with
its reason and emitting NO finding:

1. `--superseded 58 --replacement 58`. One ordinary typo makes every sentence containing `58` "also
   carry the replacement", so §3.1 suppresses all twelve occurrences and the run reports a silent clean.
2. `--claim-about` without `--repair`. Only `--repair` supplies the spans that exclude the repair's own
   new claim; without them an implementation reports all nine of the incident's occurrences, including
   the five inside the repair.
3. `--repair` with no declaration. The incident commit carries `58` on BOTH sides and changes several
   literals, so no rule over that diff selects the semantic pair; the arm must report NOTHING and say
   why. Both halves asserted — the silence AND the reason line.

**The refusals are not findings**, and the suite asserts that directly: exit code 2, zero findings, the
reason naming the offending values. Collapsing a refusal into the finding channel would make a
swept-and-clean run indistinguishable from a run that never started.

## Task 3 — the named-claim half: exact identity and span exclusion

<!-- task: red=`pnpm vitest run tests/specLint/claimSweepNamed.test.ts` red-state=authored red-target=`lib/specLint/claimSweep.ts` why=`namedHalf does not exist, so a declared identifier matches as a substring and the repair's own new claim is reported alongside the survivors` ac=AC-2 -->

**What is red and why:** `namedHalf` is absent; the substring case asserts ZERO findings and gets nine,
and the span case asserts the repair's own new claim draws nothing and gets it reported. Two value
assertions failing, not a collection error.

Implements §3.2. The identifier is matched EXACTLY. Killing fixtures:

- SUBSTRING matching — killed by the one-character truncation `…tsx:96` for `…tsx:964`, which occurs
  ZERO times exactly and on nine lines as a substring at `c272ebed3`;
- "report every occurrence" — killed by the repair's OWN new claim, inside its hunk, drawing nothing;
- the ATTRIBUTION wording — killed over EVERY emitted finding rather than sampled: the advisory says the
  DECLARATION identified the changed claim, never that the arm verified it. **This is a string-presence
  assertion, so all four pre-dispatch mutants are run against it and their results recorded in the
  commit:** (a) the wording emptied; (b) the expected wording plus an appended suffix; (c) the wording
  present but not live — in a comment, or on a branch the fixture does not reach — so it exists somewhere
  but not where the assertion claims; (d) each discriminating parameter varied in turn. The same four are
  run against the `detail:` lines of all four codes in Task 6. `components/admin/HoverHelp.tsx:562`
  on `c272ebed3` sits on both sides of the repair's hunk with its classification unchanged, so the
  occurrences are right and the attribution is the only thing that can be wrong. **The occurrence
  assertions cannot kill this one** — that is why it is asserted separately.

## Task 4 — the fourth code: a declared identifier that is not there

<!-- task: red=`pnpm vitest run tests/specLint/claimSweepNotFound.test.ts` red-state=authored red-target=`lib/specLint/claimSweep.ts` why=`CLAIM_IDENTIFIER_NOT_FOUND is not emitted, so a truncated identifier produces silence and the case asserting exactly one not-found finding gets zero` ac=AC-2 -->

**What is red and why:** the not-found path returns `[]`; the case asserting exactly one
`CLAIM_IDENTIFIER_NOT_FOUND` and zero `CLAIM_SITE_UNSWEPT` fails on the first count.

Implements §3.4's fourth code. Exact matching without a not-found report converts the typo's nine WRONG
advisories into SILENCE — the same defect in the conservative direction's clothes. The killing fixture
is the truncated identifier against `c272ebed3`: exactly one not-found, ZERO occurrence findings, both
halves asserted. Paired positive, ONE variable (the identifier): the untruncated `…tsx:964`, same commit
and same swept set, emits zero not-found and its occurrences instead. **The pair is what makes the clean
verdict attributable** — "examined and correctly declined" rather than "never got here".

## Task 5 — the swept set is declared, and an unreadable peer is reported

<!-- task: red=`pnpm vitest run tests/specLint/claimSweepDocumentSet.test.ts` red-state=authored red-target=`lib/specLint/claimSweep.ts` why=`sweptSet does not exist, so the arm sweeps only the linted document and a declared plan peer contributes none of its survivors` ac=AC-5 -->

**What is red and why:** `sweptSet` is absent, so the plan peer's seven survivors are missing from the
result; the assertion is a set comparison that fails on membership.

Implements §3.3 and the third code. The swept set is EXACTLY `<doc>` plus each `--also`, with NO
inference from citation, stem or date — all three inference rules were measured wrong on the incident's
own arc, each in a different direction (probes §8.2). Killing fixtures:

- "sweep the spec only" — killed by a survivor in the PLAN, where 7 of the incident's 9 were;
- INFERENCE — killed by declaring the peers, asserting the swept set is exactly the declared documents,
  and keeping an undeclared sibling present in the tree and absent from the result. **Neither half
  discriminates alone and the plan says so**: the absent-sibling case is also satisfied by an
  implementation that sweeps ONLY the linted document, and the plan-peer case is also satisfied by one
  that sweeps the whole tree. Only the two TOGETHER pin the set to exactly the declared documents, so
  they are asserted as one case over one corpus rather than as two independent ones;
- "continue silently when `readFileLines()` returns null" — killed by a declared peer whose read returns
  null emitting `SWEEP_DOCUMENT_UNREADABLE`. The silent implementation emits nothing for it while every
  occurrence assertion still passes. Paired positive: the SAME peer readable, contributing its own
  findings — one variable, the readability.

The null branch is a live corpus shape, not a hypothetical: one tracked symlink sits under the swept
tree, and `FileResolver`'s own doc comment names the case.

## Task 6 — identity, severity, and the closed code set

<!-- task: red=`pnpm vitest run tests/specLint/claimSweepIdentity.test.ts` red-state=authored red-target=`lib/specLint/claimSweep.ts` why=`CLAIM_SWEEP_CODES is not exported and findings carry no column, so two survivors in one sentence collapse to one and the emitted-set assertion has nothing to compare against` ac=AC-3 -->

**What is red and why:** the collision case asserts TWO findings at two different columns and gets one.
The code-set case imports the module NAMESPACE and asserts `CLAIM_SWEEP_CODES` is a four-member set; it
reads `undefined` and fails on a value comparison. Namespace import ON PURPOSE — a named import of a
missing export is a link-time error, which is the collection shape Task 1 declares as this plan's only
legitimate instance.

Implements §3.4's identity and accept-set. A finding's identity is `(code, doc, line, column, token)`.
Measured at the merge-base for the accepted `58 → 57` declaration: eight lines carry the token two or
three times in a sentence lacking the replacement, so 18 reportable occurrences collapse to 8 line-keyed
identities and TEN vanish silently into what looks like a legitimate dedup.

- Killing fixture: a line carrying the token TWICE in one sentence lacking the replacement reports
  TWICE, **and the assertion is on the two COLUMN VALUES, not on the count**. Counting two would be
  satisfied by an implementation that keys identity on `(code, doc, line, token)` and simply never dedups
  — a weaker implementation this fixture would otherwise wave through, since identity only bites once
  something dedups. Asserting the columns equal the measured offsets kills it: it has no column to
  report. Paired positive, one variable: the same line with the second occurrence moved into a sentence
  carrying the replacement reports exactly ONCE — so the single finding is attributable to the SENTENCE
  rule rather than to a dedup.
- **Every multi-finding assertion is ORDER-INDEPENDENT** — a sorted record or a set, never a positional
  array. Findings on one line have no natural order, and the plan states outright that the arm makes no
  ordering or dedup guarantee, so no implementer invents one.
- The emitted CODE SET over the whole fixture corpus equals the module's OWN exported `CLAIM_SWEEP_CODES`
  — never a list retyped into the test, so the drift cannot relocate into the checker. A fifth code or a
  missing one fails here.
- **The §3.4 SIGNAL INVENTORY is reconciled, not trusted.** A table that claims to be derived is
  enumeration in derivation's costume. The cover parses the inventory table out of the spec and runs
  BOTH directions: every FINDING row names a code in `CLAIM_SWEEP_CODES` and every exported code appears
  in exactly ONE row; every DECLARED SILENCE row names a `§5 item N` that exists; every REFUSAL row
  matches a refusal Task 2 asserts exits 2 with no finding. **POSITIVE CONTROL, run in the same case:** a
  constructed row naming a code the module does not export makes the cover report both names and exit
  non-zero — a check that cannot fail is not a check, and a check that cries wolf is worse than none, so
  both halves are proved. What it CANNOT do is read §3's prose for a requirement with no row; that is
  §5 item 10, declared rather than asserted away, because a recognizer over English is exactly what
  §1.1 item 3 forbids this arm — and building one inside the guard's own test is the same mistake at one
  remove.
- Severity is advisory over EVERY emitted finding, asserted structurally rather than sampled.

## Task 7 — the adapter: flags, hunk spans, and the injection

<!-- task: red=`pnpm vitest run tests/specLint/claimSweepCli.test.ts` red-state=authored red-target=`scripts/spec-lint.ts:363` why=`the flag loop's final else-if branch pushes "unknown flag" for any unrecognised --token, so --superseded cannot express a declaration and no RepairRecord reaches runLint` ac=AC-9 -->

**What is red and why:** `scripts/spec-lint.ts` rejects any unrecognised `--` token, so the invocation
exits on a usage error; the case asserting a populated `RepairRecord` fails on the exit code before any
finding exists. This is the ONE task whose red-target is a tracked file at plan time, so its citation is
a line-form from the start.

Adds `--superseded`, `--replacement`, `--claim-about`, `--repair`, and repeatable `--also` to the flag
loop; resolves the repair's hunk spans with git IN THE ADAPTER; threads a `RepairRecord` through
`runLint` alongside the existing injected results; adds `"claimSweep"` to the `Check` union and
`CHECK_ORDER`. `_metaPureCore` is the proof the git read stayed out of the core, and it needs no edit —
its recursive walk covers the new file by default.

## Task 8 — the historical replay, from committed blobs

<!-- task: red=`pnpm vitest run tests/specLint/claimSweepReplay.test.ts` red-state=authored red-target=`lib/specLint/claimSweep.ts` why=`checkClaimSweep does not exist, so neither blob replay can run and the nine-survivor set assertion has nothing to compare` ac=AC-4 -->

**What is red and why:** import failure again at first authoring; once Task 1 lands, this task's red is
the SET comparison failing, and the RED step records which.

Implements AC-4. `fede5f084` yields exactly the nine `(document, line, column, token)` numeric survivors
and the three excluded occurrences; the nine sit on nine distinct lines (spec 220, 282; plan 7, 9, 18,
112, 119, 140, 188), measured in the spec session and re-measured here. `c272ebed3` yields the named-half
set: four sites outside the repair's spans, being the nine occurrences minus the five inside them.

**Asserted as a SET, never a count.** A count is defeated by substitution — swapping one survivor for a
different occurrence keeps the total at nine while changing what is asserted. The fixtures read committed
blobs, so their inputs are frozen and an exact set is legitimate here in a way it is not for the live
corpus.

## Task 9 — the corpus regression, as a relation

<!-- task: red=`pnpm vitest run tests/specLint/claimSweepCorpus.test.ts` red-state=authored red-target=`lib/specLint/claimSweep.ts` why=`sentencesOf does not exist, so the corpus enumeration cannot be scoped to sentences and every transition sentence in the tracked corpus reports` ac=AC-6 -->

**What is red and why:** the corpus case asserts that every sentence carrying a declared transition pair
is excluded and gets the naive result instead — a value assertion over an enumerated set.

Implements AC-6. The population is ENUMERATED at run time and asserted as a RELATION:

- it contains NONE of `ARC_DOCUMENTS`, and the SAME enumeration without the exclusion contains ALL of
  the ones that exist. An implementation that forgets the exclusion fails the first half; one that
  enumerates nothing fails the second, **so the pair cannot be satisfied by an empty read**;
- every sentence carrying a declared transition pair is excluded, and the count of those NOT excluded is
  REPORTED rather than pinned.

**No fixture pins 936, 1009, or any other §2 figure.** A corpus that grows would turn a correct arm red,
and this arc has already paid for that four times — the figure moved 936 → 943 → 947 → 953 across its own
rounds because its own documents were in its own corpus.

**Fixture-title hygiene, asked before writing rather than at review:** this arm scans `docs/`, not
`tests/`, so a synthetic title in this suite is not corpus — but the SPEC and PROBE RECORD are, which is
why `ARC_DOCUMENTS` excludes them and why the synthetic literals live in one shared module keyed on that
module's own data rather than on a nonce convention a fixture could forget.

## Task 10 — mutation enrolment, before the first diff dispatch

<!-- task: red=`VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation tests/mutation/guardSurfaces.gates.test.ts` red-state=authored red-target=`tests/mutation/source/expectedLedgerKinds.ts:24` why=`the EXPECTED_LEDGER_KINDS object literal has no claimSweep key, so the registry row this task adds leaves the expected-key-set comparison unequal` ac=AC-8 -->

**What is red and why:** the registry row lands without its `EXPECTED_LEDGER_KINDS` key, so
`Object.keys(EXPECTED_LEDGER_KINDS).sort()` differs from the registry's ids and the equality assertion
fails naming `claimSweep`.

**The env gate and `--project mutation` are BOTH load-bearing, and the draft of this plan got it wrong.**
`tests/mutation/guardSurfaces.gates.test.ts` is in `NIGHTLY_ONLY_EXCLUDES` (`vitest.projects.ts`), so a
bare `pnpm vitest run <that file>` collects ZERO tests and exits 0 — green from birth, unable to fail
however the implementation lands. `pnpm spec:lint --exec-red` caught it as `RED_SUITE_UNCOLLECTED` during
plan self-review; the shipped form matches the `mutation:guards` script and was verified to collect:

```
$ VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest list --project mutation tests/mutation/guardSurfaces.gates.test.ts
[mutation] … > declares expected ledger-kind counts for every enrolled surface
[mutation] … > (a) the union of every shard slice is exactly the registry
[mutation] … > (b) no surface appears in two slices
[mutation] … > (c) the per-surface case count is 7 …
[mutation] … > runs a fixture that outlives vitest's 5000ms default
```

The RED step records the collection count alongside the failure, so a later regression to an
uncollectable form is visible rather than silently green.

Enrolment is TWO declarations: a `tests/mutation/source/registry.ts` row (`id: "claimSweep"`,
`sourcePath: "lib/specLint/claimSweep.ts"`, `suitePaths` naming Tasks 1-6 and 8-9's suites,
`operators: [...OPERATOR_NAMES]`, `scoreFloor: 0.95`, a `control` mutant verified unique on the current
source, `accepted: []`) AND the `expectedLedgerKinds` key.

Three rules bind the run and each is here because it was measured elsewhere:

- **NEVER reshape the source so an operator cannot generate a mutant.** The survivor order of preference
  is DELETE the site, else make the predicate TOTAL so the differing case is unreachable, else kill it
  with a case, and only then argue equivalence with a written premise re-checked against the diff.
  There is no rung for "restructure until the operator does not apply" — that raises the number without
  improving the suite, and it does it invisibly.
- **A SOURCE EDIT VOIDS THE SCORE.** The score is a pure function of (source, declared operators,
  deciding suites). Any repair touching the `claimSweep` source retires the reported number; re-measure before
  any closeout line quotes it, and verify by BLOB HASH first — an unchanged blob owes no re-run.
- **Report WHERE it was measured.** A local foreground run under `pnpm heavy`, or a CI leg with its run
  id. If CI has run this surface, read that leg and reconcile rather than assuming agreement; triage at
  SURFACE grain by reading annotation TITLES (`source-mutation gate — <id> > <case>`), never by leg
  number, which moves as the partition re-packs. **Absence from a failure list is not evidence of
  passing** — locate `claimSweep` by name.

## Task 11 — the killer audit: three states, enumerated from the table

<!-- task: red=`pnpm vitest run tests/specLint/claimSweepKillerAudit.test.ts` red-state=authored red-target=`lib/specLint/claimSweep.ts` why=`the audit fixture list is derived from the spec table and at least one named weaker implementation has no shipped killing check, so the derived-cover assertion reports the gap` ac=AC-7 -->

**What is red and why:** the audit enumerates §6's weaker-implementation table and compares it against
the shipped suites; before Tasks 1-9 land, most rows are ABSENT and the assertion reports them by name.

Implements AC-7. The list is derived FROM THE §6 TABLE, never from recall — the gap between a correct
plan and a shipped suite is exactly where a named case goes unbuilt, and no plan review catches it
because the plan is right while no fixture audit catches it because the fixture does not exist.

Each row is classified into THREE states, and only the third counts:

- **ABSENT** — the table names the case and no test covers it.
- **PRESENT BUT UNPROVEN** — a test exists and has never been run against the mutant it targets. That is
  a CLAIM, not a proof, and it fails in the direction that looks green.
- **PROVEN** — the check exists AND was observed failing when the behaviour it targets was broken.

The audit's counts are recorded in the round filing and stated SEPARATELY from the mutation score at
closeout. **A perfect score does not subsume this audit**: the score covers what the declared operators
can EXPRESS, and a hand-written weaker implementation — an unanchored substring matcher, a hardcoded id
list, a scanner that skips the `--also` peers — may be outside every operator's reach. Neither cover
dominates; both are required.

## Task 12 — citation re-point, wiring, docs, and the ledger closeout

<!-- task: red=`pnpm spec:lint docs/superpowers/plans/2026-08-20-claim-sweep-after-repair.md` red-state=authored red-target=`lib/specLint/claimSweep.ts` why=`Task 1 tracks the module named by ten path-only red-target citations, so each becomes RED_TARGET_INVALID and this command exits 1 naming them` ac=AC-9 -->

**What is red and why:** this red is CAUSED BY THIS PLAN'S OWN EXECUTION, and getting its `red-state`
right took a correction worth recording. It was drafted `red-state=live`, which asserts the command fails
on the CURRENT tree — and it does not: the path is untracked today, path-only is legal, and the command
exits 0. `pnpm spec:lint --exec-red` reported `RED_ALREADY_GREEN` during plan self-review. The honest
classification is `authored`: **the failing case is brought into being by Task 1**, exactly like a task
that writes a new test case, and the red-target names the production surface whose tracking causes it.

After Task 1 the command FAILS with one `RED_TARGET_INVALID` per path-only citation — ten of them, the
count §3 pins. The RED step records the count and the names; the GREEN step is the SAME command passing
after the re-point.

**Consequence, declared rather than left to be discovered:** no marker in this plan is `red-state=live`,
so `pnpm spec:lint --exec-red` executes NOTHING here. Its clean result is the shape of a check that had
nothing to run, not evidence the reds are sound — two absences reinforcing each other read as a pass.
What DOES verify them is the static half (which caught both defects above) plus each task observing its
own red at execution time and matching the output to its `why=`.

1. **Re-point every `red-target=` in §3's anchor table**, filling the HEAD column. Verify each by READING
   the line and matching it to the symbol its `why=` names — never by confirming the citation resolves,
   because `RED_TARGET_INVALID` checks only that a tracked path has an in-range line and never what is at
   it. A drifted citation stays green by design.
2. **Wiring and docs** (§8): no new `package.json` script — the arm rides `spec:lint`; one sentence in
   `docs/agents/writing-plans.md` under the reconciliation/closeout-sweeps bullet; one row in
   `docs/superpowers/specs/ci/README.md`.
3. **Run the claimed-repair sweep and the population census to a FIXED POINT** — run, repair, run, until
   zero, before the diff dispatch rather than after. Both are committed under
   `docs/superpowers/specs/ci/probes/scripts/`.
4. **The ledger change is ONE commit BEFORE whole-diff review**: archive
   `BL-SPEC-CLAIM-SWEEP-AFTER-REASONING-FINDING`, strip its IN PROGRESS marker, file any class-sweep peers
   with their exception letter. Absence at commit N is absence at every commit after N, and review plus CI
   then cover exactly what merges. Verify absent-at-HEAD immediately before merge, and re-run the
   set-arithmetic verify if any post-review repair touches either ledger file.

<!-- tasks: end -->

---

## 4. Acceptance criteria → the task that PROVES each

An AC row names the executable step that proves it and the channel the proof arrives on. If no task
performs it, the AC is decoration.

| AC | Proved by | Channel |
| --- | --- | --- |
| AC-1 numeric half, sentence scope | Task 1 | the `claimSweepNumeric` suite — three killing fixtures plus two one-variable pairs |
| AC-2 named half, attribution, not-found | Tasks 3 and 4 | the `claimSweepNamed` suite asserts the attribution over EVERY emitted finding; the `claimSweepNotFound` suite asserts one not-found and zero occurrences, paired with the untruncated identifier |
| AC-3 advisory severity, closed code set, refusals, inventory reconciliation | Tasks 2 and 6 | the `claimSweepRefusals` suite (exit 2, zero findings); the `claimSweepIdentity` suite (emitted set vs the module's exported codes, severity structural, and the §3.4 inventory reconciled both directions with its positive control) |
| AC-4 historical replay as a SET | Task 8 | the `claimSweepReplay` suite over two committed blobs |
| AC-5 declared swept set, unreadable peer | Task 5 | the `claimSweepDocumentSet` suite — exact declared set, undeclared sibling absent, null read reported, paired readable |
| AC-6 corpus as a RELATION | Task 9 | the `claimSweepCorpus` suite — enumerated at run time, no §2 figure pinned |
| AC-7 killer audit, three states | Task 11 | the `claimSweepKillerAudit` suite plus the counts recorded in the round filing |
| AC-8 enrolment, score, purity | Task 10 | `guardSurfaces.gates.test.ts` for both declarations; `pnpm heavy pnpm mutation:guards` for the score with its provenance; `_metaPureCore` for purity |
| AC-9 both documents lint 0 hard | Task 12 | `pnpm spec:lint <doc>`, ONE document per invocation, run on the spec AND this plan |

**A green suite is not proof for AC-8's purity half by itself** — `_metaPureCore` walks `lib/specLint/`
and would pass an empty directory; the floor assertion (`files.length >= 8`) is what makes its clean
verdict attributable, and Task 7's git read living in the adapter is what it actually pins.

---

## 5. Disposition record — the spec stage was CLOSED BY RULING, not by an APPROVE verdict

Recorded here because a stage with no APPROVE and no explanation reads to a later auditor as a SKIPPED
GATE, and the auditor is right to read it that way: absence of a verdict and absence of a process are the
same shape on disk. **This paragraph belongs in the PR body verbatim.**

The spec ran SEVEN adversarial dispatches (2 under base `03953337388b`, 5 under `4dfd784ed062`), 24
findings, every one confirmed by probe, none refuted. The final dispatch — round 5 under this base — was a
GRANTED bounded confirmation round against a closed six-repair surface with no fresh axis, and it returned
BLOCKING with one finding. **The orchestrator (`bl-orch`) closed the stage by ruling rather than ordering
an eighth round**, on these grounds:

- design content reached zero at the previous round, and round 7's finding was **REPAIR-INTRODUCED** —
  created by the round-6 repair rather than a fresh design gap, which is the specific risk a bounded
  confirmation round exists to catch. Catching it is convergence, not evidence of more to find;
- the repair closes the axis BY CONSTRUCTION rather than by instance: a set closed by ENUMERATION was
  replaced with one DERIVED from §3's normative outcomes, tabled against three channels. An enumerated set
  re-opens the moment a requirement is written in one section with no channel in another — exactly what had
  happened — while a derived one cannot;
- the repair direction was SUBTRACTIVE in every round of the stage. The recognizer never grew and the
  artifact is smaller than it was at round 1.

**The ruling carried ONE condition, and it is met in this plan.** The derived inventory had to be
MECHANICALLY derived rather than a hand-built table asserting that it is — "enumeration in derivation's
costume" — or declared as a documented limit with a positive control. Both halves shipped: Task 6
reconciles the table against the module's own exported codes and against §5's item numbers in BOTH
directions with a positive control that proves the reconciliation fires, and the half a checker cannot
reach — reading §3's PROSE for a requirement with no row — is §5 item 10, declared, because a recognizer
over English is what §1.1 item 3 forbids this arm and building one inside the guard's own test is the same
mistake at one remove.

The round-economy filing for the stage is `docs/review-rounds/feat/speclint-claim-sweep-after-repair/4dfd784ed062.md`.

---

## 6. Weaker-implementation audit of THIS PLAN's own fixtures — one exhaustive pass, not instance-hunting

Run over every rule at once during plan self-review, because three instances of one shape is the
same-vector trigger and the prescribed answer is a derived cover rather than another round of
instance-hunting. For each rule: the strictly weaker implementation that would satisfy the fixtures AS
DRAFTED, and what was added to kill it. **Two rules failed this pass and both are repaired above.**

| Rule | Weaker implementation that passed the DRAFT | Repair |
| --- | --- | --- |
| Task 6, identity | key on `(code, doc, line, token)` and never dedup — reports twice, so a COUNT assertion passes | assert the two COLUMN VALUES against the measured offsets; an implementation with no column has nothing to report |
| Task 5, swept set | sweep only the linted document (the undeclared-sibling half passes), or sweep the whole tree (the plan-peer half passes) | assert both halves as ONE case over ONE corpus; neither discriminates alone |
| Task 1, numeric half | line scope | the line carrying a transition sentence AND a separate stale sentence — already in the draft |
| Task 2, refusals | accept `N === M` and run | already asserted as a REFUSAL with both values named, plus exit 2 and zero findings |
| Task 3, named half | substring matching; report every occurrence; assert attribution by sampling | already three separate fixtures; the attribution one is asserted over EVERY emitted finding because the occurrence assertions structurally cannot kill it |
| Task 4, not-found | emit not-found whenever the occurrence list is empty | that IS the rule; the pair one variable apart (truncated vs untruncated identifier) is what makes the clean half attributable |
| Task 9, corpus | hardcode the excluded paths | `ARC_DOCUMENTS` IS a declared tuple, so this is the specification rather than a weaker form; the relation asserted is that the enumeration excludes them AND the unfiltered enumeration contains them |

**Which rule DECIDES the observation, asked of every fixture:** Task 3's span-exclusion cases are decided
by the SPAN rule and not by the sentence rule, so their survivors are placed in sentences that carry the
replacement — otherwise the numeric half would report them anyway and the case could not fail. Task 4's
not-found case carries no superseded/replacement pair at all, so nothing the numeric half does can
produce its observation.

**What the implementer owes on top of this pass (AC-7).** This audit is a PLAN-side cover and it cannot
see what actually ships. Every weaker implementation named here and in spec §6 gets its killing check
verified PRESENT IN THE SHIPPED TESTS and PROVEN — observed failing when the behaviour is broken —
because the gap between a correct plan and a missing fixture is invisible to plan review by construction.
