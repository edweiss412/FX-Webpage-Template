# Plan — `spec:lint` claim sweep after a repair

Spec: `docs/superpowers/specs/ci/2026-08-20-claim-sweep-after-repair.md` (canonical; every § reference
below is to it). Ledger row: `BL-SPEC-CLAIM-SWEEP-AFTER-REASONING-FINDING`. Probe record:
`docs/superpowers/specs/ci/probes/2026-08-20-claim-sweep-after-repair-probes.md`.

The arm reports, as an ADVISORY, the claims elsewhere in one arc's declared documents that a repair
superseded and left standing. Two halves — a numeric one keyed on a declared superseded/replacement
pair, and a named-claim one keyed on a declared identifier — four finding codes, three refusals, and
TEN documented limits. Nothing here infers a semantic fact from a diff.

impeccable-gate: N/A — no UI surface

Every file this plan touches is under `lib/specLint/`, `scripts/`, `tests/`, or `docs/`; nothing under
`app/`, `components/`, `app/globals.css`, `tailwind.config.*`, or `DESIGN.md`. The marker sits on its own
line because the gate reads the LINE: the draft ran the reason onto it and
`tests/docs/_metaInvariant8Closeout.test.ts` reported a malformed marker.

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

The repair is to RE-POINT, never to waive (Task 9), and two rules make the re-pointing durable:

- **Every `why=` cites BY SYMBOL or QUOTED CONTENT, never by line.** A symbol survives a shift; a line
  number does not.
- **`RED_TARGET_INVALID` verifies only that a tracked path has an IN-RANGE line, never what is at it.**
  A citation that drifts onto different code stays green BY DESIGN. So Task 9 re-verifies by READING
  each line and matching it to the `why=`'s named symbol — not by confirming the citation resolves.

**Anchor table.** Task 9 fills the HEAD column by reading; the BASE column is what the plan cites now.

```
| Task | red-target at BASE (plan time)                          | What the why= names, by symbol or content        | HEAD (Task 9) |
| ---- | ------------------------------------------------------- | ------------------------------------------------ | -------------- |
| 1    | lib/specLint/claimSweep.ts (untracked)                  | the module itself — created by this task         | n/a            |
| 2    | lib/specLint/claimSweep.ts                              | "no refusal branch"                              |                |
| 3    | lib/specLint/claimSweep.ts                              | "the named half is not implemented"              |                |
| 4    | lib/specLint/claimSweep.ts                              | CLAIM_IDENTIFIER_NOT_FOUND                       |                |
| 5    | lib/specLint/claimSweep.ts                              | "sweeps only the document it lints"              |                |
| 6    | lib/specLint/claimSweep.ts                              | CLAIM_SWEEP_CODES                                |                |
| 7    | scripts/spec-lint.ts:363 (tracked)                      | the flag loop's final else-if, "unknown flag"    |                |
| 8    | tests/mutation/source/expectedLedgerKinds.ts:24 (tracked)| EXPECTED_LEDGER_KINDS                            |                |
| 9    | lib/specLint/claimSweep.ts                              | the module tracked by Task 1                     |                |
```

<!-- spec-lint: ignore — the path is the SUBJECT of this sentence; Task 1 creates it and Task 9 re-points every citation to it -->
**SEVEN of the nine cite `lib/specLint/claimSweep.ts` path-only, and ALL SEVEN are invalidated by Task 1's
commit** — Task 1's own marker included, because the lint reads the whole plan at any later time and does
not care that that task's red already happened. Counted, not estimated:

```
$ grep -c '^<!-- task: .*red-target=`lib/specLint/claimSweep.ts`' <this plan>
7
```

**The command is anchored to the MARKER line on purpose, and the unanchored form is wrong here.** A bare
`grep -c` for the citation returns ELEVEN, because the command's own printed form is a line of this
document and counts itself — the guard measuring its own text, one document earlier than the place that
usually bites. Anchoring to `^<!-- task:` excludes the prose that talks ABOUT the citation from the
count of citations.

That is the count Task 9's RED step must observe. A different count means a citation was edited or a
task was added without its anchor row, and either is a defect in this plan rather than in the
implementation. The two exceptions are Task 7 (`scripts/spec-lint.ts`) and Task 8
(`tests/mutation/source/expectedLedgerKinds.ts`), both tracked today and both cited in line form from the
start.

---

## 4. The cycle every task runs, stated once

**This is the TDD contract for Tasks 1-9. It sits OUTSIDE the task region because it is not a task** — a `##` heading inside the region with no `<!-- task: -->` marker is a hard `TASK_MARKER_MISSING`, which is how the draft learned where it belongs. It is stated once rather
than repeated per task, and every task body below names only its DELTAS: the files it touches, the case it
authors, and what its RED output must say.

Each task, in order, with no step skipped or reordered:

1. **Author the failing case** in the suite its marker names. Nothing else.
2. **Run the marker's `red=` command and READ the output.** Record it in the task's commit message.
   Confirming a non-zero exit is NOT enough: the observed failure must match the reason the marker's
   `why=` asserts. A command that fails because a file cannot be found, an import cannot resolve, or a
   suite cannot collect has expressed no verdict about the implementation, and its green would arrive
   when the TEST file changes rather than when the code lands.
3. **Write the minimal implementation** that makes that case pass and nothing more.
4. **Run the SAME command** and observe it GREEN. Same command, not a narrower one.
5. **Commit**, `<type>(<scope>): <summary>` per invariant 6, one commit per task, with the RED output
   quoted. **The scope is DERIVED from the files the task touches, not mapped by task number** — a number
   map goes stale the moment a task is folded or split, which has happened twice on this plan already.
   A task whose Files list is under `lib/specLint/`, `scripts/`, or `tests/specLint/` commits as
   `speclint`; one under `tests/mutation/` commits as `mutation`; the closeout, which touches `docs/` and
   the ledger, commits as `docs`.

**Every RED below is a VALUE assertion except Task 1's**, which is a collection failure because the
module does not exist yet. That is declared as this plan's ONE legitimate instance, and the reason it is
legitimate is that the only edit which could turn it green without an implementation is deleting the
import — which deletes the test. A task whose red is still an import or collection error AFTER Task 1 is
a defect in that task, not a red.

**A TASK WHOSE RED GOES GREEN BY EDITING THE ASSERTION IS NOT A TASK — it is a verification step, and it
belongs inside one.** This is the plan's most expensive class: it cost three review rounds and three
separate folds — the historical replay into the two halves' suites, the no-rewrite proof into the adapter,
and the corpus relation and killer audit into Task 1 and the closeout. Each time the shape was the same
and the repair was structural rather than a better `why=`. **The derived check, run at authoring time and
re-run whenever a task is added, folded or split:** for each task, name the edit that turns its red green
and confirm that edit is part of the DELIVERABLE rather than of the assertion. A task whose only file is
its own suite fails this by construction.

Run over the nine tasks as they stand:

| Task | red command runs | the edit that turns it green | deliverable? |
| --- | --- | --- | --- |
| 1 | its new suite | creates `claimSweep.ts` | yes |
| 2 | its new suite | the refusal branch in `claimSweep.ts` | yes |
| 3 | its new suite | the named half in `claimSweep.ts` | yes |
| 4 | its new suite | the fourth code's branch | yes |
| 5 | its new suite | the declared swept set | yes |
| 6 | its new suite | the exported code list and the reconciliation | yes |
| 7 | its new suite | the adapter's flags, spans and peers | yes |
| 8 | the mutation gates suite | the `EXPECTED_LEDGER_KINDS` key — a DIFFERENT file from the suite the command runs | yes |
| 9 | `spec:lint` on this plan | re-pointed citations in this plan — the plan IS the artifact under lint, not an assertion about it | yes |

**Every RED below is an expect-a-REPORT case, never an expect-CLEAN one.** An expect-CLEAN fixture is
satisfied by any implementation that fails to look — a broken parse, an empty walk, a crashed read — so
the red anchors on output the implementation must PRODUCE. The expect-CLEAN cases in each task are
regression pins asserted in the GREEN phase, each paired one variable apart with a case that reports.

<!-- tasks: depth=2 red-contract -->

## Task 1 — the numeric half: sentence scoping, co-occurrence, and the incident replay

<!-- task: red=`pnpm vitest run tests/specLint/claimSweepNumeric.test.ts` red-state=authored red-target=`lib/specLint/claimSweep.ts` why=`the module does not exist, so the suite cannot collect and the nine-survivor replay assertion never runs` ac=AC-1,AC-4,AC-6 -->

**Files** (fenced: several do not exist yet, and a citation to an absent file is a hard failure):

```
lib/specLint/claimSweep.ts               (new)
lib/specLint/types.ts                    (RepairRecord)
tests/specLint/claimSweepNumeric.test.ts (new)
tests/specLint/fixtures/claimSweep/**    (new)
```

**RED must say:** the module cannot be resolved. Collection-shaped, declared in §4 as the only one.

**The case that anchors it is the incident replay, expect-a-REPORT:** `fede5f084`'s three arc documents
with `--superseded 58 --replacement 57` yield exactly the nine `(document, line, column, token)`
survivors — spec 220 and 282, plan 7, 9, 18, 112, 119, 140, 188 — and exactly three excluded occurrences.
Asserted as a SET, never a count: a count is defeated by substitution, since swapping one survivor for a
different occurrence keeps the total at nine while changing what is asserted.

**Also in this task's GREEN phase**, each a regression pin paired one variable apart:

- a transition sentence carrying BOTH values draws nothing — paired with the SAME sentence with the
  replacement DELETED, which reports;
- LINE scope is killed by a line carrying both a `57`/`58` transition sentence AND a separate stale `58`
  sentence: line scope reports nothing, sentence scope reports the stale one;
- "exclude anything inside the repair's diff" is killed by the incident's survivor, an ADDED line inside
  the repair's own hunk, which must still report;
- a declared pair whose superseded value appears nowhere draws nothing — paired with the SAME declaration
  over documents where it DOES appear, which reports. The corpus is the variable; the declaration is held
  fixed.

**The corpus relation is a GREEN-phase pin HERE rather than a task of its own** (AC-6), because it is
this task's rule at corpus scale and a separate later task's red would already be green. Over the tracked
`docs/superpowers` corpus with a declared pair: EVERY sentence carrying both values is excluded, the count
of those NOT excluded is REPORTED rather than pinned, and **no assertion pins 936, 1009 or any other §2
figure** — a corpus that grows would turn a correct arm red, and this arc paid for that four times as the
figure moved 936 → 943 → 947 → 953 across its own rounds. The population's own relation — that it contains
none of `ARC_DOCUMENTS` and that the same enumeration without the exclusion contains all of them — belongs
to the census producer and is verified in Task 9, where the single authority for that list is established.

**The module header restates spec §5 items 1-10 verbatim**, which §5 requires and which a behavioural
suite cannot notice. Task 9 verifies it, and by COMPARISON rather than by prefix.

## Task 2 — the three refusals, and their channel

<!-- task: red=`pnpm vitest run tests/specLint/claimSweepRefusals.test.ts` red-state=authored red-target=`lib/specLint/claimSweep.ts` why=`no refusal branch exists, so the run's stderr says "unknown flag: --superseded" where the case asserts a reason naming BOTH declared values and the offending equality` ac=AC-3 -->

**Files** (fenced: several do not exist yet, and a citation to an absent file is a hard failure):

```
lib/specLint/claimSweep.ts, scripts/spec-lint.ts, tests/specLint/claimSweepRefusals.test.ts (new).
```
**RED must say:** expected a reason naming both values, received `unknown flag: --superseded`.

**The exit code is NOT the discriminator here, and the draft of this plan got that wrong.** Before Task 7
the adapter rejects the unknown flags and ALREADY exits 2, so an assertion of "0 becomes 2" can never
fail. The reason LINE is what moves: the pre-task message names a flag, the shipped refusal names both
declared values and the equality between them. Each refusal is asserted on its reason text AND on
emitting zero findings; the exit code is pinned as a regression assertion in the GREEN phase, where it is
true for a different cause than the one under test.

Implements §3.0 and the REFUSAL channel of §3.4's signal inventory. Three refusals, each exiting 2 with a
reason naming the offending values and emitting NO finding:

1. `--superseded 58 --replacement 58`. One ordinary typo makes every sentence containing `58` "also carry
   the replacement", so §3.1 suppresses all twelve occurrences and the run reports a silent clean.
2. `--claim-about` without `--repair`. Only `--repair` supplies the spans that exclude the repair's own
   new claim; without them an implementation reports all nine of the incident's occurrences.
3. `--repair` with no declaration. The incident commit carries `58` on BOTH sides and changes several
   literals, so no rule over that diff selects the semantic pair.

Each asserted in BOTH halves — the exit code AND the reason line — and each asserted to emit ZERO
findings, which is what keeps a usage mistake out of the channel that makes claims about documents.

## Task 3 — the named-claim half: exact identity, span exclusion, and the incident replay

<!-- task: red=`pnpm vitest run tests/specLint/claimSweepNamed.test.ts` red-state=authored red-target=`lib/specLint/claimSweep.ts` why=`the named half is not implemented, so a declared identifier produces ZERO findings where the replay case asserts the four sites outside the repair's spans` ac=AC-2,AC-4 -->

**Files** (fenced: several do not exist yet, and a citation to an absent file is a hard failure):

```
lib/specLint/claimSweep.ts, tests/specLint/claimSweepNamed.test.ts (new).
```
**RED must say:** expected four findings, received zero. Expect-a-REPORT by construction — the
substring and span cases are expect-CLEAN and would pass vacuously against an unimplemented half, so
they are GREEN-phase pins rather than the red.

**The case that anchors it:** `PublishedReviewModal.tsx:964` declared against `c272ebed3` yields the four
sites outside the repair's spans, being the nine occurrences minus the five inside them.

**GREEN-phase pins, each paired:**

- SUBSTRING matching is killed by the one-character truncation `…tsx:96`, which occurs ZERO times exactly
  and on nine lines as a substring — paired with the untruncated identifier, which reports its
  occurrences. One variable: the identifier;
- "report every occurrence" is killed by the repair's OWN new claim, inside its hunk, drawing nothing —
  paired with the same identifier in another section, which reports;
- the ATTRIBUTION wording is asserted over EVERY emitted finding rather than sampled: the advisory says
  the DECLARATION identified the changed claim, never that the arm verified it. `components/admin/HoverHelp.tsx:562`
  on `c272ebed3` sits on both sides of the repair's hunk with its classification unchanged, so the
  occurrences are right and the attribution is the only thing that can be wrong. **The occurrence
  assertions structurally cannot kill this one.** It is a string-presence assertion, so all four
  pre-dispatch mutants run against it and their results land in the commit: (a) the wording emptied;
  (b) the wording plus an appended suffix; (c) the wording present but not live — in a comment or on a
  branch the fixture does not reach; (d) each discriminating parameter varied in turn.

## Task 4 — the fourth code: a declared identifier that is not there

<!-- task: red=`pnpm vitest run tests/specLint/claimSweepNotFound.test.ts` red-state=authored red-target=`lib/specLint/claimSweep.ts` why=`no branch emits CLAIM_IDENTIFIER_NOT_FOUND, so a declared identifier with zero exact occurrences produces an empty result where the case asserts exactly one not-found finding` ac=AC-2 -->

**Files** (fenced: several do not exist yet, and a citation to an absent file is a hard failure):

```
lib/specLint/claimSweep.ts, tests/specLint/claimSweepNotFound.test.ts (new).
```
**RED must say:** expected one `CLAIM_IDENTIFIER_NOT_FOUND`, received zero findings.

Exact matching without a not-found report converts the typo's nine WRONG advisories into SILENCE — the
same defect in the conservative direction's clothes. The killing case is the truncated identifier against
`c272ebed3`: exactly one not-found AND zero `CLAIM_SITE_UNSWEPT`, both halves asserted. Paired positive,
ONE variable (the identifier): the untruncated `…tsx:964`, same commit and same swept set, emits zero
not-found and its occurrences instead. **The pair is what makes the clean half attributable** —
"examined and correctly declined" rather than "never got here".

## Task 5 — the swept set is declared, and an unreadable peer is reported

<!-- task: red=`pnpm vitest run tests/specLint/claimSweepDocumentSet.test.ts` red-state=authored red-target=`lib/specLint/claimSweep.ts` why=`the arm sweeps only the document it lints, so a survivor in a declared --also peer produces zero findings where the case asserts the plan peer's seven` ac=AC-5 -->

**Files** (fenced: several do not exist yet, and a citation to an absent file is a hard failure):

```
lib/specLint/claimSweep.ts, scripts/spec-lint.ts, tests/specLint/claimSweepDocumentSet.test.ts (new).
```
**RED must say:** expected the plan peer's survivors in the result set, received a set containing only the
linted document's.

Implements §3.3 and the third code. The swept set is EXACTLY `<doc>` plus each `--also`, with NO inference
from citation, stem or date — all three inference rules were measured wrong on the incident's own arc,
each in a different direction (probes §8.2).

- "sweep the spec only" is killed by a survivor in the PLAN, where 7 of the incident's 9 were. **This is
  the red.**
- INFERENCE is killed by the SAME case asserting the swept set is EXACTLY the declared documents while an
  undeclared sibling sits in the same tree and contributes nothing. **Neither half discriminates alone**:
  the absent-sibling half is satisfied by an implementation that sweeps only the linted document, and the
  plan-peer half by one that sweeps the whole tree. They are asserted as ONE case over ONE corpus.
- "continue silently when `readFileLines()` returns null" is killed by a declared peer whose read returns
  null emitting `SWEEP_DOCUMENT_UNREADABLE`; the silent implementation emits nothing for it while every
  occurrence assertion still passes. Paired positive: the SAME peer readable, contributing its own
  findings — one variable, the readability. The null branch is a live corpus shape: one tracked symlink
  sits under the swept tree and `FileResolver`'s own doc comment names the case.

## Task 6 — identity, severity, the closed code set, and the inventory reconciliation

<!-- task: red=`pnpm vitest run tests/specLint/claimSweepIdentity.test.ts` red-state=authored red-target=`lib/specLint/claimSweep.ts` why=`CLAIM_SWEEP_CODES is not exported, so the namespace import reads undefined and the four-member emitted-set assertion fails on a value comparison` ac=AC-3 -->

**Files** (fenced: several do not exist yet, and a citation to an absent file is a hard failure):

```
lib/specLint/claimSweep.ts, tests/specLint/claimSweepIdentity.test.ts (new).
```
**RED must say:** expected a four-member code set, received `undefined`. The module NAMESPACE is imported
on purpose — a named import of a missing export is a link-time error, the collection shape §4 declares
as Task 1's alone.

- The emitted CODE SET over the whole fixture corpus equals the module's OWN exported `CLAIM_SWEEP_CODES`
  — never a list retyped into the test, so drift cannot relocate into the checker.
- **The §3.4 SIGNAL INVENTORY is reconciled, not trusted.** A table that claims to be derived is
  enumeration in derivation's costume. The cover parses the inventory table out of the spec and runs BOTH
  directions: every FINDING row names a code in `CLAIM_SWEEP_CODES` and every exported code appears in
  exactly ONE row; every DECLARED SILENCE row names a `§5 item N` that exists; every REFUSAL row matches a
  refusal Task 2 asserts exits 2. **POSITIVE CONTROL in the same case:** a constructed row naming a code
  the module does not export makes the cover report both names and exit non-zero — a check that cannot
  fail is not a check, and one that cries wolf is worse than none, so both halves are proved. What it
  CANNOT do is read §3's prose for a requirement with no row; that is §5 item 10, declared.
- Severity is advisory over EVERY emitted finding, asserted structurally rather than sampled.
- **The identity pin is a GREEN-phase regression assertion with its own proof, not part of the red**, and
  the plan says so because `Finding.column` already exists and is mandatory: a line carrying the token
  TWICE in one sentence lacking the replacement reports TWICE, and the assertion is on the two COLUMN
  VALUES against the measured offsets. Its discriminating power is PROVEN by a mutant run in this task:
  force both columns to 1 and watch the assertion red. Paired positive, one variable: the same line with
  the second occurrence moved into a sentence carrying the replacement reports exactly ONCE, so the single
  finding is attributable to the SENTENCE rule rather than to a dedup. The plan states outright that the
  arm makes NO dedup and NO ordering guarantee, so every multi-finding assertion is order-independent —
  a sorted record or a set, never a positional array.

## Task 7 — the adapter: flags, hunk spans, peers, and the injection

<!-- task: red=`pnpm vitest run tests/specLint/claimSweepCli.test.ts` red-state=authored red-target=`scripts/spec-lint.ts:363` why=`the flag loop's final else-if branch pushes "unknown flag" for any unrecognised --token, so the end-to-end invocation exits on a usage error where the case asserts the incident's four named-half findings` ac=AC-2,AC-5,AC-9 -->

**Files** (fenced: several do not exist yet, and a citation to an absent file is a hard failure):

```
scripts/spec-lint.ts        (flags, git hunk spans, the --also peers; also the writeFileSync mutant site)
lib/specLint/run.ts         (threads the RepairRecord)
lib/specLint/types.ts       (RepairRecord; "claimSweep" in Check and CHECK_ORDER)
tests/specLint/claimSweepCli.test.ts   (new)
```

**RED must say:** `unknown flag: --superseded`, exit 2, where the case asserts a four-finding result. An
end-to-end assertion through the real CLI, not a `RepairRecord` shape check — **"some populated record
reached `runLint`" is exactly the assertion an adapter with empty spans, dropped peers, or double-linted
peers would satisfy.**

FIVE adapter-owned semantics, each with its own executable case, because the pure-core suites run on
CORRECTLY INJECTED data and cannot see any of them:

1. **Hunk spans are exact.** `--repair c272ebed3` produces spans that exclude exactly the five in-hunk
   occurrences and no others: the result is the four outside them. An adapter supplying empty spans
   returns nine; one supplying whole-file spans returns zero. Both directions asserted.
2. **EVERY repeated `--also` is honoured.** Three peers declared, each carrying a distinct survivor, and
   the result contains all three. An adapter that keeps only the last `--also` returns one. The count is
   derived from the fixture rather than typed, so adding a peer to the fixture changes the expectation.
3. **An unreadable peer propagates to the core.** The symlink peer declared alongside two readable ones
   yields `SWEEP_DOCUMENT_UNREADABLE` for it and occurrence findings for the others — the adapter must
   pass `null` through rather than dropping the entry.
4. **Peers are SWEPT, not LINTED.** A declared plan peer whose own text would draw citation, numeric and
   copy findings contributes ONLY claim-sweep findings to the result. An adapter that runs the full lint
   over peers returns those other codes, and the assertion is on the code set, so it fails naming them.
5. **THE ARM NEVER REWRITES A DOCUMENT** (AC-3). Spec §3.4 says so and `_metaPureCore` does not prove it:
   that meta-test forbids `node:fs` under `lib/specLint/**` ONLY, and this task edits the ADAPTER, where
   writes remain possible. The proof is behavioural and has both halves — a full invocation over a temp
   corpus with a spy on every write path asserts ZERO writes, and **the premise is asserted FIRST in the
   same case:** the run produced a NON-ZERO finding count. "Nothing was written" and "nothing ran" are
   otherwise indistinguishable. PROVEN, not merely present: a mutant adds one `writeFileSync` to this
   task's own code path and the case is observed RED, then reverted.

   **This lives HERE rather than in a task of its own, and that is the round-2 repair.** As a separate
   later task its red would already be green — this task makes the CLI work, so a no-rewrite assertion
   authored afterwards passes the moment it is written. A test-only task has no red by construction, the
   same reason the historical replay folded into the two halves' suites.

Adds `--superseded`, `--replacement`, `--claim-about`, `--repair`, repeatable `--also`; resolves hunk
spans with git IN THE ADAPTER; threads a `RepairRecord` through `runLint`; adds `"claimSweep"` to the
`Check` union and `CHECK_ORDER`. `_metaPureCore` is the proof the git read stayed out of the core and
needs no edit — its recursive walk covers the new file by default.

## Task 8 — mutation enrolment, before the first diff dispatch

<!-- task: red=`VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation tests/mutation/guardSurfaces.gates.test.ts` red-state=authored red-target=`tests/mutation/source/expectedLedgerKinds.ts:24` why=`the EXPECTED_LEDGER_KINDS object literal has no claimSweep key, so the registry row this task adds leaves the expected-key-set comparison unequal and the assertion names claimSweep` ac=AC-8 -->

**Files** (fenced: several do not exist yet, and a citation to an absent file is a hard failure):

```
tests/mutation/source/registry.ts            (the claimSweep row)
tests/mutation/source/expectedLedgerKinds.ts (the claimSweep key)
```

Nothing else. This task DECLARES; it does not touch the surface it enrols, which is what keeps its score
a measurement of Tasks 1-7's work rather than of its own.
**RED must say:** the expected-key-set comparison fails naming `claimSweep`, with a non-zero collected
test count printed alongside.

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

**Three commands this task RUNS, because AC-8 claimed proofs no step performed until round 3 caught it.**
The gate red above is the first; these are the other two, both in the GREEN phase, both with their output
in the commit:

```
# the score, with provenance stamped INSIDE the measuring invocation, before and after
FX_HEAVY_PRIORITY=1 pnpm heavy sh -c '
  git hash-object lib/specLint/claimSweep.ts tests/specLint/*.test.ts   # BEFORE
  VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation     tests/mutation/guardSurfaces.shard*.test.ts tests/mutation/guardSurfaces.gates.test.ts
  git hash-object lib/specLint/claimSweep.ts tests/specLint/*.test.ts   # AFTER
'

# purity, RUN rather than described as automatic
pnpm vitest run tests/specLint/_metaPureCore.test.ts
```

The score is reported with WHERE it was measured and with both stamps; a before/after pair that differs
means an edit landed mid-run and the run is DISCOVERY, not scored. `_metaPureCore` walks `lib/specLint/`
and would pass an empty directory, so its floor assertion is what makes a clean verdict attributable —
describing it as automatic discovery does not run it, which is what round 3 found.

Enrolment is TWO declarations: a registry row (`id: "claimSweep"`,
`sourcePath: "lib/specLint/claimSweep.ts"`, `suitePaths` naming Tasks 1-7's suites,
`operators: [...OPERATOR_NAMES]`, `scoreFloor: 0.95`, a `control` mutant verified unique on the current
source, `accepted: []`) AND the `expectedLedgerKinds` key.

The rules that bind the run, each here because it was measured on another arc rather than imagined. The
list is deliberately unnumbered: a count beside a growing list is a claim that decays through ADDITION,
and this one had already decayed from three to twelve before anyone read it.

- **NEVER reshape the source so an operator cannot generate a mutant.** The survivor order of preference
  is DELETE the site, else make the predicate TOTAL so the differing case is unreachable, else kill it
  with a case, and only then argue equivalence with a written premise re-checked against the diff. There
  is no rung for "restructure until the operator does not apply" — it raises the number without improving
  the suite, invisibly.
- **TOTALISING HAS A HAZARD, and this surface is full of string scans, so the form is mandated here and
  the audit is a PREDICATE run over the whole module rather than a look at the loops anyone noticed.** Rewriting `while (i < s.length && p(s[i]))` as `while (p(s.charAt(i)))` deletes the
  bounds comparison a mutant survived on and MOVES TERMINATION INTO THE PREDICATE: an equality-flip mutant
  then spins forever, because `charAt` keeps returning empty past the end. A bounded counting loop is
  mutation-SAFE by construction — whatever a mutant does to the predicate, the bound still ends it and the
  worst case is a SURVIVOR you can see. Remove the bound and the worst case is a HANG that takes the whole
  measurement down and reads like memory pressure. **Safe totalisations, all three carrying no comparison
  operator to mutate:** a REGEX MATCH for a leading run, a FOR-OF over a finite string, and a search loop
  that ADVANCES IN ITS OWN HEADER. Before the first measure, audit the whole module for the property
  **"no loop's termination depends on a mutable predicate"** — the arc that measured this found a SECOND
  hang site that predated its totalisation entirely.
- **A DECIDING-SUITE EDIT MID-RUN DOES NOT COST THE RUN — IT SILENTLY CORRUPTS IT.** Change a suite the
  registry names while mutants are executing and some read the old bytes and some the new; the run then
  REPORTS A NUMBER that describes no coherent program. That is worse than a killed run, which reports
  nothing and is noticed. Hold the edit until the run lands, or kill the run first, deliberately, and say
  so. The paired before/after stamp DETECTS this; detection after the fact still costs the run.
- **A TRACKED-FILE EDIT MID-RUN VOIDS THE RUN'S OWN INTEGRITY CHECK.** The runner overlays mutants from
  memory, so the score is not corrupted — but the gate asserts the tracked file is unchanged across the
  run, and a docstring edit is enough to fail it. This face ANNOUNCES itself, unlike the other two. Treat
  such a run as DISCOVERY, not scored.
- **A PUSH SUPERSEDES AN IN-FLIGHT CI MEASUREMENT.** A source edit voids a local score; the same hazard one
  layer out is that GitHub's concurrency group cancels the running job for a superseded sha, so a push ends
  an in-flight run and all its legs report nothing. If the running job IS the evidence, decide deliberately
  whether to hold the push until it reports rather than discovering the tradeoff afterwards.
- **A SOURCE EDIT VOIDS THE SCORE.** The score is a pure function of (source, declared operators, deciding
  suites). Any repair touching the `claimSweep` source retires the reported number; re-measure before any
  closeout line quotes it, and verify by BLOB HASH first — an unchanged blob owes no re-run. The killer
  audit is re-run with it.
- **Report WHERE it was measured.** A local foreground run under `pnpm heavy`, or a CI leg with its run
  id. If CI has run this surface, read that leg and reconcile rather than assuming agreement; triage at
  SURFACE grain by reading annotation TITLES (`source-mutation gate — <id> > <case>`), never by leg
  number, which moves as the partition re-packs. **Absence from a failure list is not evidence of
  passing** — locate `claimSweep` by name and read its result.
- **STAMP THE PROVENANCE INSIDE THE MEASURED COMMAND, never beside it, and stamp a PAIR.** Print the blob
  hashes of BOTH the source AND every deciding suite, from WITHIN the same invocation that measures, BEFORE
  and AFTER the run, and quote those in the closeout. A single stamp catches a stale read; the
  before/after pair also catches an edit landing DURING the run. A hash computed in a separate
  call is a second read of mutable state and can observe different bytes than the run does — the same
  two-reads defect this batch found in markers, ledgers, citations and verifiers, landing on provenance
  itself. An arc reported a score against an intermediate blob for exactly this reason and caught it only
  because its stamp was inside the run. If the stamp and the run are two commands, that is not provenance,
  it is a coincidence that usually holds.
- **Confirm a fix by a PREDICTED SIDE EFFECT, not by absence of the symptom.** "It did not fail this time"
  is consistent with luck. Ask what else the hypothesis predicts and check that too — a hang diagnosis
  predicts the run gets FASTER, not merely that it stops dying, because mutants no longer burn a full
  per-mutant timeout.
- **A survivor resolved by DELETION owes a proof, not an assertion**, and the proof is usually that the
  differing case is unreachable: a comparator that cannot reorder because the walk is ascending and the
  container preserves insertion order; a branch that can never fire because its input is always
  path-shaped; a ternary fallback unreachable because the regex matches every string. Write the reason
  next to the deletion.
- **A DELETION THAT CHANGES BEHAVIOUR ON ANY INPUT IS RULE 26 IN A QUIETER COSTUME.** Removing a mutation
  site by narrowing what the code does reads as cleanup in the diff, which makes it more tempting than the
  obvious form of gaming, not less. The test: if a change removes a site AND changes behaviour on any
  input however exotic, it buys a metric point with correctness. Keep the correct code and argue the
  equivalence.
- **The two restructuring rules pull opposite ways, and the discriminator is this:** making a mutant
  UNREPRESENTABLE is gaming the score; making a mutant TERMINATE is not. Check the DIRECTION as evidence
  rather than asserting intent — a termination repair that ADDS a comparison cannot be site-shrinking
  dressed as safety, and one that REDUCES the site count owes a stated reason that is termination and not
  tidiness.
- **An EQUIVALENCE ROW carries four properties or it is not one**, and rung 4 is reached only when the
  first three rungs are individually refused with a reason: (a) the other rungs genuinely failed, each
  reason stated; (b) it is a PROOF that no separating case CAN exist, not a report that none came to mind;
  (c) the PREMISE is written down and re-checked against the SHIPPED source, naming what would VOID the
  row if it changed; and (d) **it was composed BEFORE the measurement landed**. An equivalence argument
  written after the score is a rationalisation with a citation; written before, it is a prediction.
- **EQUIVALENCE ROWS SHARING ONE INVARIANT ARE A DERIVED COVER; INDEPENDENT STORIES ARE A SMELL.** Four
  independent arguments are four chances to be wrong, each resting on its own reading. Four derived from
  ONE stated invariant are one chance to be wrong, and the invariant is usually load-bearing elsewhere in
  the module, so something other than the argument has already exercised it. If the rows each have their
  own unrelated justification, go looking for the shared invariant before writing them; if one exists the
  rows collapse into a cover and you can state what VOIDS ALL OF THEM AT ONCE, which is the premise
  property (c) asks for. If none exists, say so — but check first.
- **When property (d) cannot be met, write the argument as a PREDICTION with a stated falsifier.** An
  argument composed after a discovery run has already named the survivors cannot claim it was written
  first; say so in the row and let the confirming run adjudicate — if the site is killed, the argument is
  wrong and the row comes out.
- **Apply the predicted-side-effect rule FORWARD as well as backward.** Before a re-measure, state what the
  run must show if the repairs landed as believed — fewer mutants after deletions, a shorter wall clock —
  and name the falsifier. **And refuse to claim the evidence where the situation does not provide it:** a
  structural hazard removed BEFORE it ever fired predicts no speedup, and saying it does is exactly the
  story-fitted-to-outcome the rule exists to prevent. If no hang was observed, a slower next run is fine
  and a faster one is evidence of something nobody had reason to believe in.

## Task 9 — closeout: the killer audit, one ARC_DOCUMENTS authority, citations, wiring, and the ledger

<!-- task: red=`pnpm spec:lint docs/superpowers/plans/2026-08-20-claim-sweep-after-repair.md` red-state=authored red-target=`lib/specLint/claimSweep.ts` why=`Task 1 tracks the module named by the path-only red-target citations above, so each becomes RED_TARGET_INVALID and this command exits 1 naming them` ac=AC-9 -->

**Files** (fenced: several do not exist yet, and a citation to an absent file is a hard failure):

```
this plan                                                    (the anchor table's HEAD column)
lib/specLint/claimSweep.ts                                   (the §5 header; and the audit's mutant sites)
scripts/spec-lint.ts                                         (the audit's adapter-side mutant sites)
tests/specLint/*.test.ts                                     (the deletion control removes and restores one check)
docs/superpowers/specs/ci/probes/scripts/arc-documents.json   (new — the ONE declaration)
docs/superpowers/specs/ci/probes/scripts/2026-08-20-population-census.py  (reads it instead of a literal)
docs/agents/writing-plans.md, docs/superpowers/specs/ci/README.md
BACKLOG.md, BACKLOG-archive.md
```

**Every file the audit MUTATES is listed above.** A mutant recipe edits shipped source and a deletion
control removes a shipped check; both are edits, both revert, and a Files list that hides them is a scope
claim the task's own steps contradict.

**RED must say:** one `RED_TARGET_INVALID` per path-only citation, at the count §3's anchor table pins.

**What is red and why, and getting its `red-state` right took a correction worth recording.** It was
drafted `red-state=live`, which asserts the command fails on the CURRENT tree — and it does not: the path
is untracked today, path-only is legal, and the command exits 0. `pnpm spec:lint --exec-red` reported
`RED_ALREADY_GREEN` during plan self-review. The honest classification is `authored`: **the failing case
is brought into being by Task 1**, exactly like a task that writes a new test case.

**Consequence, declared rather than left to be discovered:** no marker in this plan is `red-state=live`,
so `pnpm spec:lint --exec-red` executes NOTHING here. Its clean result is the shape of a check that had
nothing to run, not evidence the reds are sound — two absences reinforcing each other read as a pass.
What DOES verify them is the static half (which caught both defects above) plus each task observing its
own red and matching the output to its `why=`, per §4 step 2.

1. **Verify the module header restates spec §5 items 1-10 VERBATIM, by COMPARISON rather than by prefix.**
   A grep for each item's number and leading phrase passes a header that carries every opening clause and
   truncates or contradicts the rest — which does not establish the "verbatim" claim Task 1 makes. The
   check extracts §5's ten items from the spec and the ten from the header, normalises whitespace, and
   asserts the two sequences are EQUAL, printing the first differing item when they are not. Its own
   positive control: a constructed header with one item truncated makes it report that item and exit
   non-zero.
2. **Re-point every `red-target=` in §3's anchor table**, filling the HEAD column. Verify each by READING
   the line and matching it to the symbol its `why=` names — never by confirming the citation resolves,
   because `RED_TARGET_INVALID` checks only that a tracked path has an in-range line and never what is at
   it. A drifted citation stays green by design.
3. **THE KILLER AUDIT (AC-7), executed rather than tabulated.** It lives here rather than in a task of its
   own because it has no production surface: a task whose only file is its own test has no red by
   construction, which is the same reason the historical replay folded into the two halves and the
   no-rewrite proof folded into the adapter.

   The row list is DERIVED from spec §6's weaker-implementation table, never from recall. Each row names
   three things — the weaker implementation, the killing check, and a MUTANT RECIPE: an exact edit to
   shipped source the check must catch. The audit EXECUTES each recipe: apply, run ONLY that check,
   require a FAILURE, revert, re-run to confirm green. A row is **PROVEN** when its recipe was applied and
   its check observed red IN THIS RUN; **PRESENT BUT UNPROVEN** when a check exists and no recipe is named;
   **ABSENT** when no check exists. The three states are MEASURED, not read — an audit that labels every
   present check PROVEN would pass a deletion control, because deleting a check still yields ABSENT, so
   that control answers only whether the reporting path works and is kept for that.

   Counts are recorded in the round filing and stated SEPARATELY from the mutation score at closeout. **A
   perfect score does not subsume this audit**: the score covers what the declared operators can EXPRESS,
   and a hand-written weaker implementation — an unanchored substring matcher, a hardcoded id list, a
   scanner that skips the `--also` peers — may be outside every operator's reach.

4. **ONE `ARC_DOCUMENTS` AUTHORITY, and the collision cover's positive control.** The census script
   declares the arc's own documents today; a second literal list anywhere is the split-population drift
   spec §2.0 forbids, where an ordinary later addition updates one list while the other's check stays
   green. The declaration moves to the data file this task's Files list names, the census script READS it instead of carrying a
   tuple, and a parity assertion pins the file's contents against the exclusions the census reports. The
   population relation AC-6 states is asserted here, where the authority now lives: the enumeration
   contains none of them, and the SAME enumeration without the exclusion contains all of the ones that
   exist — an implementation that forgets the exclusion fails the first half and one that enumerates
   nothing fails the second, so the pair cannot be satisfied by an empty read.

   The synthetic-literal collision cover ships with the POSITIVE CONTROL spec §2.0 and §6 require: a zero
   from an empty or unreadable population is indistinguishable from a real one, so the same case asserts
   that a REAL transition sentence drawn from OUTSIDE this arc's documents IS found by the same lookup.
   One variable, and the zero becomes attributable.

5. **Wiring and docs** (§8): no new `package.json` script — the arm rides `spec:lint`; one sentence in
   `docs/agents/writing-plans.md` under the reconciliation/closeout-sweeps bullet; one row in
   `docs/superpowers/specs/ci/README.md`.
6. **Run the claimed-repair sweep and the population census to a FIXED POINT** — run, repair, run, until
   zero, BEFORE the diff dispatch rather than after.
7. **The ledger change is ONE commit BEFORE whole-diff review**: archive
   `BL-SPEC-CLAIM-SWEEP-AFTER-REASONING-FINDING`, strip its IN PROGRESS marker, file any class-sweep peers
   with their exception letter. Absence at commit N is absence at every commit after N, so review and CI
   cover exactly what merges. Verify absent-at-HEAD immediately before merge, and re-run the
   set-arithmetic verify if any post-review repair touches either ledger file.

<!-- tasks: end -->

---

## 5. Acceptance criteria → the task that PROVES each

An AC row names the executable step that proves it and the channel the proof arrives on. If no task
performs it, the AC is decoration.

| AC | Proved by | The executable step, and the channel it arrives on |
| --- | --- | --- |
| AC-1 numeric half, sentence scope | Task 1 | the `claimSweepNumeric` suite: the `fede5f084` replay as the RED, plus four GREEN-phase pins each paired one variable apart |
| AC-2 named half, attribution, not-found | Tasks 3, 4 and 7 | the `claimSweepNamed` suite (the `c272ebed3` replay as the RED; attribution asserted over EVERY emitted finding, with its four string-presence mutants); the `claimSweepNotFound` suite (one not-found AND zero occurrences, paired with the untruncated identifier); the `claimSweepCli` suite for the hunk spans the named half depends on |
| AC-3 advisory severity, closed code set, refusals, inventory reconciliation, NO REWRITE | Tasks 2, 6 and 7 | the `claimSweepRefusals` suite (the REASON line naming both values, zero findings, exit 2 pinned in the green phase); the `claimSweepIdentity` suite (emitted set vs the module's exported codes, severity structural, inventory reconciled both directions with its positive control, identity pinned by a proven column mutant); and the no-rewrite case INSIDE the `claimSweepCli` suite (zero writes under a spy, a non-zero finding count asserted FIRST as the premise, a `writeFileSync` mutant observed RED) — it lives there because a separate later task's red would already be green |
| AC-4 historical replay as a SET | Tasks 1 and 3 | folded into the two halves' own suites as their RED cases rather than a separate task — a replay authored after both halves work would pass the moment it is written, which is a guard with no red |
| AC-5 declared swept set, unreadable peer | Tasks 5 and 7 | the `claimSweepDocumentSet` suite (exact declared set and undeclared sibling as ONE case, null read reported, paired readable); the `claimSweepCli` suite for every repeated `--also`, unreadable-peer propagation, and peers being SWEPT not LINTED |
| AC-6 corpus as a RELATION | Task 8 | the `claimSweepCorpus` suite — enumerated at run time, both directions of the population relation, no §2 figure pinned, `ARC_DOCUMENTS` read from the ONE committed data file the census script also reads with a parity assertion, and the collision cover carrying its outside-arc positive control |
| AC-7 killer audit, three states | Task 9 | the `claimSweepKillerAudit` suite, which EXECUTES each row's mutant recipe — apply, run only that check, require a failure, revert, confirm green — so PROVEN is OBSERVED rather than read; plus its own positive control (one killing check deleted, the row observed ABSENT) and the counts recorded in the round filing |
| AC-8 enrolment, score, purity | Task 8 | the gates suite through the mutation project, as this task's RED, for both declarations; the provenance-stamped score command in its GREEN phase, with the before/after blob hashes printed INSIDE the measuring invocation; and `_metaPureCore` RUN, not described as automatic — its floor assertion is what makes a clean verdict attributable. The adapter half of purity is AC-3's no-rewrite proof, inside Task 7 |
| AC-9 both documents lint 0 hard, and every citation re-pointed | Task 9 | `pnpm spec:lint <doc>` on the spec AND this plan, ONE document per invocation; plus the header grep proving §5 items 1-10 are restated, and every red-target re-verified by READING its line |

**A green suite is not proof for AC-8's purity half by itself** — `_metaPureCore` walks `lib/specLint/`
and would pass an empty directory; the floor assertion (`files.length >= 8`) is what makes its clean
verdict attributable, and Task 7's git read living in the adapter is what it actually pins.

---

## 6. Disposition record — the spec stage was CLOSED BY RULING, not by an APPROVE verdict

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

## 7. Weaker-implementation audit of THIS PLAN's own fixtures — one exhaustive pass, not instance-hunting

Run over every rule at once during plan self-review, because three instances of one shape is the
same-vector trigger and the prescribed answer is a derived cover rather than another round of
instance-hunting. For each rule: the strictly weaker implementation that would satisfy the fixtures AS
DRAFTED, and what was added to kill it. **Two rules failed the first pass and both are repaired above.**

**The table's completeness is a DERIVED claim, not an enumerated one**, and it is stated that way because
an enumeration over a growing plan is correct when written and wrong within the hour — this table was
exhaustive at round 1 and stopped being so the moment round 1's repairs added five rules to Task 7 and
one to the killer audit. The rule: **every numbered semantic in a task body, and every row of spec §6, has a row
here.** A task that gains a semantic gains a row in the same commit, and the closeout's audit is what catches
the omission mechanically, since it derives its own list from spec §6 rather than from this table.

| Rule | Weaker implementation that passed the DRAFT | Repair |
| --- | --- | --- |
| Task 6, identity | key on `(code, doc, line, token)` and never dedup — reports twice, so a COUNT assertion passes | assert the two COLUMN VALUES against the measured offsets, PROVEN by a mutant forcing both to 1. `Finding.column` is already mandatory, so this is a GREEN-phase pin rather than part of the red, and the plan says so |
| Task 5, swept set | sweep only the linted document (the undeclared-sibling half passes), or sweep the whole tree (the plan-peer half passes) | assert both halves as ONE case over ONE corpus; neither discriminates alone |
| Task 1, numeric half | line scope | the line carrying a transition sentence AND a separate stale sentence — already in the draft |
| Task 2, refusals | accept `N === M` and run | already asserted as a REFUSAL with both values named, plus exit 2 and zero findings |
| Task 3, named half | substring matching; report every occurrence; assert attribution by sampling | already three separate fixtures; the attribution one is asserted over EVERY emitted finding because the occurrence assertions structurally cannot kill it |
| Task 4, not-found | emit not-found whenever the occurrence list is empty | that IS the rule; the pair one variable apart (truncated vs untruncated identifier) is what makes the clean half attributable |
| Task 7, hunk spans | supply empty spans, or whole-file spans | both directions asserted from the incident: empty spans return nine, whole-file spans return zero, correct spans return four |
| Task 7, repeated `--also` | keep only the LAST peer | three peers each carrying a distinct survivor, with the expected count DERIVED from the fixture rather than typed |
| Task 7, unreadable peer | drop the entry rather than passing `null` | the symlink peer beside two readable ones must yield `SWEEP_DOCUMENT_UNREADABLE` and the others' occurrences |
| Task 7, swept-not-linted | run the full lint over peers | a peer whose own text draws citation, numeric and copy findings; the assertion is on the CODE SET, so a full-lint adapter fails naming the extras |
| Task 7, no rewrite | write to a document while reporting | the write spy, with a NON-ZERO finding count asserted FIRST as the premise, and a `writeFileSync` mutant observed red |
| Task 9, killer audit | label every present check PROVEN | a deletion control cannot see it, because deleting a check still yields ABSENT; the audit EXECUTES each row's mutant recipe and records the observed red |
| Task 8, corpus | hardcode the excluded paths | `ARC_DOCUMENTS` IS a declared tuple, so this is the specification rather than a weaker form; the relation asserted is that the enumeration excludes them AND the unfiltered enumeration contains them |

**Which rule DECIDES the observation, asked of every fixture:** Task 3's span-exclusion cases are decided
by the SPAN rule and not by the sentence rule, so their survivors are placed in sentences that carry the
replacement — otherwise the numeric half would report them anyway and the case could not fail. Task 4's
not-found case carries no superseded/replacement pair at all, so nothing the numeric half does can
produce its observation.

**What the implementer owes on top of this pass (AC-7).** This audit is a PLAN-side cover and it cannot
see what actually ships. Every weaker implementation named here and in spec §6 gets its killing check
verified PRESENT IN THE SHIPPED TESTS and PROVEN — observed failing when the behaviour is broken —
because the gap between a correct plan and a missing fixture is invisible to plan review by construction.
