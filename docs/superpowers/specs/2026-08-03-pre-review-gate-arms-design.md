# Pre-review gate arms — dispatch-time lint, declared task contracts, accept-set discipline

**Status:** design
**Date:** 2026-08-03
**Cluster:** A of three (see §1.3). Clusters C (process rules, pre-merge ledger check) and B (canonical tracked-file walker) ship separately.

## 0. Problem

A 48-hour audit of merged work (PRs #658 through #692) measured how much of the window's output was rework rather than delivery. Measured 2026-08-03 20:35 CDT, window opening 2026-08-01 20:00 CDT:

```
git log --since="2026-08-01 20:00" --no-merges --oneline | wc -l                              # 676
git log --since="2026-08-01 20:00" --no-merges --pretty=%s | grep -cEi '\bR[0-9]+\b|whole-diff|repair'   # 245
```

**245 of 676 non-merge commits (36.2%) were round-repair commits.** Both numbers grow as the window slides; the commands, not the literals, are the contract. Individual artifacts reached spec R30, whole-diff R28, and joint spec-plus-plan R18.

Three finding shapes account for the largest share. Shape counts below are a **classification of round-repair commit subjects and in-plan round logs across the window**, not a mechanical extraction — they are ordinal evidence for prioritization, and no check in this spec depends on their exact values:

| Shape | Distinct artifacts | Countermeasure today |
| --- | --- | --- |
| S1 recognizer grammar escape | 9 | none |
| S3 plan TDD topology dishonest | 7 | prose only, no mechanical form |
| S10 citation and anchor rot | 5 | `pnpm spec:lint` exists; nothing checks it ran |

`spec:lint` shipped complete. `docs/agents/spec-self-review.md:25` mandates attaching its output to every spec or plan review dispatch and states "A dispatch without the lint output is incomplete." Nothing verifies that. The rule is honor-system prose sitting next to a working tool.

This spec arms the three, without relitigating any ratified decision of the `spec:lint` contract.

## 1. Scope

### 1.1 Resolved scope — do not relitigate

1. **The "No CI gate" decision stands.** `docs/superpowers/specs/2026-07-19-spec-lint.md:15` ratified that `spec:lint` is a point-in-time pre-dispatch tool and that wiring it into CI would false-fail historical docs forever. A corpus measurement taken for this spec (2026-08-03, all 878 tracked docs under `docs/superpowers/`) **confirms that rationale rather than challenging it**: 704 of 877 lintable docs (80.3%) currently exit 1. Enforcement in this spec is pre-dispatch, exactly where item 2 puts it. No CI job lints the corpus.

2. **`NUMERIC_NOUN_MISMATCH` stays advisory.** `docs/superpowers/specs/2026-07-19-spec-lint.md:14` ratifies mixed posture: fuzzy heuristics are advisory-only because hard-failing heuristics get bypassed. The same measurement found 2774 occurrences across 598 docs; promotion would newly fail 135 docs. Not done, and not to be reopened on the grounds that "the rule catches real drift" — that was never the disputed premise.

3. **Legacy plans are never retrofitted.** `docs/superpowers/specs/2026-07-19-spec-lint.md:23` scopes the tool to newly authored docs at dispatch time. The §3 task contract applies to plans authored after this ships. A plan with no enrollment line is not a failing plan; it is an unenrolled one (§3.2).

4. **The §3 contract is declared, never inferred.** No check in this spec recognizes a task's RED step, GREEN step, or acceptance criteria from prose. Rationale in §3.1; this is the single most important constraint in the document and the one most likely to be "helpfully" relaxed by a later round.

5. **S1 gets a prose rule, not a lint rule.** §4 explains why a detector-spec detector is self-defeating. Proposals to make §4 mechanical are answered by §4.2, not by a new round.

6. **Opt-in enforcement is accepted, with the gap recorded.** §2.4 and §3.2 state exactly what a caller who omits the flag or the enrollment line gets. This mirrors AGENTS.md invariant 12, which accepts the same trade for the same reason. "But an author could just not use it" is a documented limit (§6), not a finding.

### 1.2 Out of scope

- Linting the legacy corpus, per §1.1 item 3.
- Any change to `spec:lint`'s citation, numeric, or copy checks. This spec adds one new check family and touches no existing rule.
- Cluster B (canonical tracked-file walker across 87 `_meta*` guards) and cluster C (round-repair transcript rule, pre-merge ledger IN PROGRESS check). Separate specs.
- Auto-fixing or auto-authoring task markers.

### 1.3 Cluster decomposition

The audit produced six fixes across three surfaces. They ship as three PRs in order A, C, B. This spec is cluster A: the `lib/specLint/` and `scripts/codex-guard.mjs` surface plus its two doc rules. Ordering rationale: A is self-contained and highest-yield; B has the largest blast radius (87 guards) and benefits from A's gates existing first.

## 2. A1 — dispatch-time lint arm in codex-guard

### 2.1 Why codex-guard

`AGENTS.md:178` establishes `codex-guard` as the dispatch path for all direct Codex review dispatches. It already composes the prompt once at startup (`scripts/codex-guard.mjs:254`) and already writes a machine-readable result contract (`scripts/codex-guard.mjs:580`). It is the only chokepoint every review dispatch passes through, and it runs pre-dispatch, which is where `spec:lint`'s own spec puts enforcement.

### 2.2 New flag

```
--lint-doc <path>   repeatable; a spec or plan doc under docs/superpowers/ to lint and embed
```

For each `--lint-doc`, the wrapper **spawns the `spec:lint` CLI** as a child process and appends its captured stdout to the composed prompt, in a delimited block matching the existing artifact-embedding shape at `scripts/codex-guard.mjs:254`. It spawns rather than imports because `scripts/codex-guard.mjs` is plain ESM JavaScript and the lint core under `lib/specLint/` is TypeScript; spawning also makes AC-1's "byte-identical to what the CLI prints" true by construction rather than by reimplementation.

```
===== SPEC-LINT: <basename> =====
<rendered spec:lint text output>
===== END SPEC-LINT =====
```

Unlike `--artifact`, which requires `--fallback` (`scripts/codex-guard.mjs:147`), `--lint-doc` is valid in every mode. The two flags are independent: `--artifact` inlines a doc's full text for a wedge rescue; `--lint-doc` inlines a lint report.

### 2.3 Failure posture

| Condition | Behavior |
| --- | --- |
| lint exits 0 or 1 (clean, advisories, or findings) | embed output, dispatch proceeds |
| lint exits 2 (usage or infra fault, including a tracked symlink) | **refuse to dispatch**, exit 2, no result.json Codex outcome |
| `--lint-doc` path unreadable or outside the repo | refuse, exit 2 |
| no `--lint-doc` given | dispatch proceeds; result.json records `lintArm: "absent"` |

Findings never block dispatch. A doc with 40 citation failures is exactly the doc a reviewer most needs the report for. Only a tool that could not run blocks, which matches the exit-2-is-infra semantics `spec:lint` already defines.

### 2.4 The recorded gap

A caller who omits `--lint-doc` still dispatches. result.json gains a `lintArm` field taking `"present"` or `"absent"`, so the omission is machine-visible to the orchestrator reading the result contract, rather than invisible as it is today. Closing this fully would require codex-guard to infer the review target from brief prose, which is the S1 mistake this spec exists to stop. Recorded as a documented limit (§6).

## 3. A2 — declared task contract for plans

### 3.1 Why declared and not recognized

The obvious design is to recognize a task's RED step from its prose. A corpus measurement shows why that fails. Measured 2026-08-03 against this branch's merge base, with `PLANS` bound to the tracked plan corpus:

```
git ls-files 'docs/superpowers/plans/**/*.md' 'docs/superpowers/plans/*.md' > PLANS   # 533 plans
grep -hcE '^#{2,4} (Task ?[0-9]|T[0-9])' $(cat PLANS) | paste -sd+ - | bc             # 2935 task headings
grep -lE '\bRED\b' $(cat PLANS) | wc -l                                              # 153 plans mention RED
grep -hcE '^\*\*RED' $(cat PLANS) | paste -sd+ - | bc                                # 32 lines
```

The last line is the argument. The most obvious canonical spelling covers **32 lines against 2935 task headings** — roughly one percent. The rest are spread across forms including `**RED**`, `- [ ] RED →`, `**Step 1 (RED):**`, `**VERIFY (RED).**`, and `1. **RED first`; no enumeration of them is claimed to be complete, which is precisely the point.

A rule keyed on those spellings **is shape S1** — the denylist recognizer that accepts whatever it has not modelled. Building it here would reproduce, inside the fix, the exact defect the fix targets.

So the contract is declared. This is AGENTS.md invariant 12's design, adopted for the same reason it was adopted there: no signal in the corpus means "this task has an honest RED step", and the tempting proxy points the wrong way.

### 3.2 Enrollment is declared, and so is what counts as a task

The naive design has a hole that only surfaces on close reading: to report "this task has no marker" the checker must know **which headings are tasks**, and the obvious way to know is a regex over heading text (`Task 3`, `T2b`). That is a spelling recognizer over prose — the very thing §1.1 item 4 forbids, reintroduced through the back door. The corpus already shows the forms are irregular (`## Task 0`, `### Task 1`, `### T2b`).

So the plan declares its own task grain, once, in a single enrollment line:

```
<!-- tasks: depth=3 -->
```

- `depth` is an integer 1 through 6: the ATX heading depth at which tasks live in this plan.
- A plan is **enrolled** iff it carries exactly one well-formed enrollment line on a non-fenced line.
- In an enrolled plan, a **task** is every heading of exactly that depth appearing after the enrollment line. Nothing else is a task; no heading text is ever read.
- Two enrollment lines is `TASK_ENROLL_DUPLICATE`. A malformed one (non-integer, out of range) is `TASK_ENROLL_MALFORMED` — a hard finding, not a silent non-enrollment, so a typo cannot quietly opt a plan out.

An unenrolled plan produces zero `taskContract` findings. That is what keeps §1.1 item 3 true: the 533 legacy plans are untouched, and the convention costs nothing until first used.

### 3.3 The task marker

One HTML comment per task, anywhere in that task's extent:

```
<!-- task: red=`pnpm vitest run tests/specLint/taskContract.test.ts` ac=AC-3,AC-4 -->
```

Grammar, deliberately narrow and fail-closed:

- The line matches `^<!-- task: (.*) -->$` exactly, on a non-fenced line. Nothing else is a marker.
- Fields are space-separated `key=value`, with `red` accepting an embedded space only inside its backticks. Exactly two keys are defined: `red` and `ac`. An unknown key is a hard finding, never ignored.
- `red=` takes a backtick-delimited command string. Missing backticks, or an empty command, is a hard finding.
- `ac=` takes a comma-separated list of at least one id matching `AC-[A-Za-z0-9.-]+`.

A task's extent runs from its heading line to the line before the next heading of the enrolled depth or shallower, or to end of document. A marker appearing **before the first task** — including before the enrollment line — is `TASK_MARKER_ORPHANED`; it belongs to no task and is never silently dropped.

### 3.4 New checks

A new `taskContract` member of the `Check` union (`lib/specLint/types.ts:2`) and a corresponding entry in `CHECK_ORDER` (`lib/specLint/run.ts:8`). All are hard, and all run only when `kind === "plan"`, replacing the current unconditional short-circuit at `lib/specLint/sections.ts:27`.

| Code | Fires when |
| --- | --- |
| `TASK_ENROLL_DUPLICATE` | a plan carries two or more enrollment lines |
| `TASK_ENROLL_MALFORMED` | an enrollment line's `depth` is absent, non-integer, or outside 1 through 6 |
| `TASK_MARKER_MISSING` | an enrolled plan has a task with no marker in its extent |
| `TASK_MARKER_DUPLICATE` | one task extent holds two or more markers |
| `TASK_MARKER_ORPHANED` | a marker sits outside every task extent |
| `TASK_MARKER_MALFORMED` | marker line does not parse, or carries an unknown key |
| `TASK_RED_EMPTY` | `red=` absent, unbackticked, or its command is empty |
| `TASK_AC_MISSING` | `ac=` absent, or its list is empty |
| `TASK_AC_UNRESOLVED` | an `ac=` id appears nowhere in the plan's own text outside a marker |

`TASK_AC_UNRESOLVED` resolves against the plan document itself, not the linked spec. Cross-document AC resolution needs a declared spec link that plans do not currently carry; adding one is cluster-C-or-later work, and a check that silently resolves nothing is worse than no check. Recorded in §6. Resolution deliberately excludes marker lines themselves, so an id cannot satisfy itself by being cited.

Note the deliberate asymmetry with §1.1 item 4: these checks verify a **declaration's shape**, never a task's prose. `TASK_RED_EMPTY` asserts the author wrote a command; it does not assert the command is real, runs, or fails first. That remains the reviewer's job, now with a named target instead of a prose hunt.

The cost of enrollment is that a plan which marks some tasks and not others fails on the unmarked ones. That is intended — partial enrollment is the drift state this check exists to catch.

## 4. A3 — accept-set discipline for detector specs

### 4.1 The rule

Added to `docs/agents/spec-self-review.md` as a mandatory self-review item:

> **Detector, recognizer, classifier, and guard specs declare an accept-set by type.** Any spec introducing a surface that decides whether an input is "an instance of X" must state what it ACCEPTS, keyed on type or structure rather than on spelling, and must state that everything outside the accept-set is rejected or reported by name — never silently passed. A spec that enumerates rejected forms has authored a denylist, and a denylist accepts whatever it did not model.

Paired with the existing round-economy admissibility contract already in AGENTS.md: no recognizer tightening is accepted without a probe demonstrating the corruption it prevents.

### 4.2 Why this is prose and not a check

Nine artifacts burned on this shape; none was caught by review-time reasoning alone, and each was ultimately closed by inverting to fail-closed narrow-ACCEPT plus a type table. A lint rule would first have to decide "is this a detector spec?" — itself a recognizer over prose, with exactly the failure mode being legislated against. The honest design is a rule the author applies and the reviewer checks, made visible at dispatch by §2.

## 5. Acceptance criteria

**AC-1.** `codex-guard review --brief B --lint-doc D` embeds a `===== SPEC-LINT: D =====` block into the composed prompt, containing the same text `pnpm spec:lint D` prints.

**AC-2.** `--lint-doc` is accepted without `--fallback`, and composes with `--artifact` when `--fallback` is present.

**AC-3.** A `--lint-doc` whose lint run exits 2 causes codex-guard to exit 2 and dispatch nothing.

**AC-4.** A `--lint-doc` with hard findings dispatches normally, findings embedded.

**AC-5.** result.json carries `lintArm: "present"` when at least one `--lint-doc` was given, `"absent"` otherwise.

**AC-6.** An enrolled plan whose depth-N heading carries no marker yields exactly one `TASK_MARKER_MISSING`, anchored to that heading's line.

**AC-7.** A plan with no enrollment line yields zero `taskContract` findings regardless of heading count or stray markers.

**AC-8.** Each of `TASK_ENROLL_DUPLICATE`, `TASK_ENROLL_MALFORMED`, `TASK_MARKER_DUPLICATE`, `TASK_MARKER_ORPHANED`, `TASK_MARKER_MALFORMED`, `TASK_RED_EMPTY`, `TASK_AC_MISSING`, `TASK_AC_UNRESOLVED` fires on a fixture exhibiting it and on no fixture exhibiting only its siblings.

**AC-9.** An enrollment line or a task marker inside a fenced code block is inert: it neither enrolls a plan nor satisfies a task.

**AC-10.** `taskContract` findings never fire for `kind === "spec"`.

**AC-11.** An unknown key in a marker is `TASK_MARKER_MALFORMED`, not silently ignored — the fail-closed direction, pinned by its own mutant. Likewise a malformed `depth` is `TASK_ENROLL_MALFORMED` and not a silent opt-out.

**AC-12.** Headings at a depth other than the enrolled one are never treated as tasks, and their content never satisfies or violates a task check. Pinned with a fixture whose non-task headings carry markerless bodies.

**AC-13.** An `ac=` id that appears only inside marker lines, and nowhere else in the plan, is `TASK_AC_UNRESOLVED` — an id cannot satisfy itself.

**AC-14.** `docs/agents/spec-self-review.md` carries the §4.1 rule text and the §3.2 plus §3.3 marker convention.

## 6. Documented limits

1. **The lint arm is opt-in.** A dispatch omitting `--lint-doc` proceeds; only `lintArm: "absent"` records it. Inferring the target from brief prose is refused as an S1 reproduction (§2.4).
2. **Task enrollment is opt-in.** An author who writes no enrollment line gets no checks (§3.2). Accepted deliberately: it is what keeps the legacy corpus out of scope.
3. **AC ids resolve within the plan only.** A plan citing an AC that exists in its spec but not in itself reports `TASK_AC_UNRESOLVED`. Cross-document resolution needs a declared spec-link field on plans, which does not exist yet (§3.4).
4. **`red=` is not executed.** The checks verify a declaration, never that the command runs or fails first. Executing arbitrary commands from a doc during a lint run is refused outright.
5. **Nothing here addresses S2 or S8.** Incomplete class sweeps and regressed round-repairs are cluster B and C work respectively.
