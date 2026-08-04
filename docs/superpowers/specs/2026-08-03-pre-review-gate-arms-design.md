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

3. **Legacy plans are never retrofitted, and this is measured rather than asserted.** `docs/superpowers/specs/2026-07-19-spec-lint.md:23` scopes the tool to newly authored docs at dispatch time. The §3 task contract applies to plans authored after this ships. A plan with no enrollment line is not a failing plan; it is an unenrolled one (§3.2).

   A reference implementation of §3 run over the whole tracked plan corpus (2026-08-03) reports:

   ```
   plans scanned: 534
   attempted enrollment: 1 | enrolled: 1 | with findings: 0
   ```

   534, not the 533 quoted elsewhere in this document: 533 is the legacy corpus measured at this branch's merge base, and the 534th is the plan implementing this spec. Both figures are correct and they describe different sets — the legacy corpus, and the legacy corpus plus this branch's own plan.

   The single enrolled plan is the one implementing this spec. No existing plan is accidentally enrolled by any incidental `<!-- tasks:`-shaped content, and none acquires a finding. The blast radius on the existing corpus is exactly zero documents.

4. **The §3 contract is declared, never inferred.** No check in this spec recognizes a task's RED step, GREEN step, or acceptance criteria from prose. Rationale in §3.1; this is the single most important constraint in the document and the one most likely to be "helpfully" relaxed by a later round.

5. **S1 gets a prose rule, not a lint rule.** §4 explains why a detector-spec detector is self-defeating. Proposals to make §4 mechanical are answered by §4.2, not by a new round.

6. **Opt-in enforcement is accepted, with the gap recorded.** §2.4 and §3.2 state exactly what a caller who omits the flag or the enrollment line gets. This mirrors AGENTS.md invariant 12, which accepts the same trade for the same reason. "But an author could just not use it" is a documented limit (§6), not a finding.

### 1.2 Out of scope

- Linting the legacy corpus, per §1.1 item 3.
- Any change to `spec:lint`'s citation, numeric, copy, or section checks. This spec adds one new check family and changes no existing check's behavior.
- Cluster B (canonical tracked-file walker across 87 `_meta*` guards) and cluster C (round-repair transcript rule, pre-merge ledger IN PROGRESS check). Separate specs.
- Auto-fixing or auto-authoring task markers.

**What this spec does change, stated positively.** An earlier draft claimed it "touches no existing rule", which was false in two directions and hid a contract contradiction behind a scope sentence. The accurate list is three items, each with its own acceptance criterion:

| Existing artifact | Change | Pinned by |
| --- | --- | --- |
| `docs/agents/spec-self-review.md:25` | the "attach its **full** output" clause is amended to define completeness mechanically (§2.2.4) | AC-41 |
| `docs/agents/spec-self-review.md` | gains the §4.1 accept-set rule as a new item | AC-14 |
| `scripts/spec-lint.ts:236` | `process.exit()` becomes `process.exitCode` (§2.2.3) | AC-35 |

`lib/specLint/sections.ts` appears in none of those rows, deliberately — see §3.4.

### 1.3 Cluster decomposition

The audit produced six fixes across three surfaces. They ship as three PRs in order A, C, B. This spec is cluster A: the `lib/specLint/` and `scripts/codex-guard.mjs` surface plus its two doc rules. Ordering rationale: A is self-contained and highest-yield; B has the largest blast radius (87 guards) and benefits from A's gates existing first.

## 2. A1 — dispatch-time lint arm in codex-guard

### 2.1 Why codex-guard

`AGENTS.md:182` establishes `codex-guard` as the dispatch path for direct Codex review dispatches. It already composes the prompt once at startup (`scripts/codex-guard.mjs:254`) and already writes a machine-readable result contract (`scripts/codex-guard.mjs:580`), and it runs pre-dispatch, which is where `spec:lint`'s own spec puts enforcement.

**It is the chokepoint for wrapper-routed dispatches, not for all of them, and the difference is load-bearing.** An earlier draft called it "the only chokepoint every review dispatch passes through". `AGENTS.md:182` says dispatches **SHOULD** go through the wrapper, and `AGENTS.md:203` names the residue outright — "Dispatches not routed through codex-guard are still exposed". A dispatch that never enters the wrapper has no lint report and no `lintArm` field at all, so it is not merely unarmed, it is invisible to the result contract that §2.4 relies on to make omission machine-visible. That is a strictly wider gap than "entered the wrapper and omitted the flag", and §2.4 and §6 item 1 record both halves rather than the narrower one.

This is not an argument for making the wrapper mandatory here. AGENTS.md's `SHOULD` is a ratified posture, and A1's value does not depend on universality: it arms the path the project already prefers, and the same heartbeat and native-binary reasons that already recommend the wrapper (`AGENTS.md:203`) apply unchanged.

### 2.2 New flag

```
--lint-doc <path>   repeatable; a document in the --cwd repository to lint and embed
```

For each `--lint-doc`, the wrapper **spawns the `spec:lint` CLI** as a child process and appends its captured stdout to the composed prompt, in a delimited block matching the existing artifact-embedding shape at `scripts/codex-guard.mjs:254`. It spawns rather than imports because `scripts/codex-guard.mjs` is plain ESM JavaScript and the lint core under `lib/specLint/` is TypeScript; spawning also means the report is the CLI's real output rather than a reimplementation of it — the filtering and budgeting in §2.2.2 are applied to that output, never a substitute for producing it.

```
===== SPEC-LINT: <basename> =====
<rendered spec:lint text output>
===== END SPEC-LINT =====
```

Unlike `--artifact`, which requires `--fallback` (`scripts/codex-guard.mjs:147`), `--lint-doc` is valid in every mode. The two flags are independent: `--artifact` inlines a doc's full text for a wedge rescue; `--lint-doc` inlines a lint report.

### 2.2.1 Repository identity of the lint child (pinned, not inherited)

`spec:lint` discovers its repo root from its own process cwd and refuses any document outside it. `codex-guard` has **two** directories — the cwd it was launched from, and `--cwd`, the directory the review runs against. A session launched from the main checkout while reviewing a worktree makes these differ, which is the normal case under invariant 11.

Left undefined, that difference turns a perfectly valid document into an apparent containment fault:

```
$ cd /Users/ericweiss/FX-Webpage-Template
$ node --import tsx scripts/spec-lint.ts /Users/ericweiss/FX-worktrees/pre-review-gate-arms/docs/superpowers/specs/2026-08-03-pre-review-gate-arms-design.md
document is outside the repository: ...
exit=2

$ cd /Users/ericweiss/FX-worktrees/pre-review-gate-arms
$ node --import tsx scripts/spec-lint.ts docs/superpowers/specs/2026-08-03-pre-review-gate-arms-design.md
exit=0
```

(The exit codes are the whole point here; this probe deliberately records **no finding counts**. A self-referential count — this document reporting its own lint summary — is stale the moment the document is edited, and it was: an earlier draft embedded `0 hard, 6 advisory` and drifted to nine advisories within the same review round. Corpus measurements elsewhere in this spec are dated snapshots with reproduction commands, which is a different and safe thing; a document quoting its own current output is never safe.)

Same document, same wrapper contract, opposite outcomes — and under §2.3 the first would refuse the dispatch. So both are pinned:

- The lint child is spawned with **cwd = `--cwd`**, never the wrapper's launch cwd.
- A relative `--lint-doc` resolves against **`--cwd`**. An absolute path is used as given.
- A `--lint-doc` that resolves outside `--cwd`'s repository is a usage error (exit 2) attributable to the caller, and its message names both the path and the repo root, so the two failure causes are never confused.

**Both halves verified, from a process whose cwd is the main checkout while `--cwd` is a worktree:**

```
inherit launch cwd : status=2  "document is outside the repository: /Users/ericweiss/FX-worktrees/..."
cwd = --cwd        : status=0  hasSummary=false
```

The first line is the defect. The second is the repair working — **and simultaneously the reason §2.2.3 is a separate precondition**: with cwd pinned the child exits 0, yet the captured report still has no `summary:` line, because the truncation is an independent defect in the CLI. An implementer who fixes only the cwd sees a green exit code and reasonably concludes the integration works. It does not; it silently ships a headless report. The two repairs are orthogonal and both are required.

### 2.2.2 Embedded report content and the aggregate budget

Only the **findings** portion of the report is embedded. The CLI's numeric `INVENTORY` block is excluded: it is the bulk of the bytes and is drafting-aid output, not review signal.

Stated as an exact transformation, because "exclude the inventory" alone leaves an implementer guessing what else goes. `renderText` (`scripts/spec-lint.ts:40`) emits, in order: two header lines, a blank, zero or more check sections, an optional `INVENTORY` block, and a final `summary:` line. The embed **drops the lines from the one reading exactly `INVENTORY` up to but not including the line beginning `summary:`**, and keeps everything else — headers, every check section, and the summary line. The summary is deliberately retained: it is the single most informative line in the report, and dropping it alongside the inventory would leave a reviewer unable to see totals at a glance.

The boundary is unambiguous by construction: findings and inventory entries are both indented, so a line equal to `INVENTORY` at column zero cannot be anything else.

This matters because the wrapper refuses composed prompts over 2,000,000 bytes (`scripts/codex-guard.mjs:41`), and full reports are large. The largest single report in the tracked corpus reproduces with:

```
npx tsx scripts/spec-lint.ts docs/superpowers/specs/parser/2026-07-27-inline-later-group-own-hotel-design.md > /tmp/r.txt
wc -c < /tmp/r.txt      # 290909    — 3,206 lines, summary "0 hard, 89 advisory"
```

The redirect is not incidental. An earlier draft published this same reproduction as a pipe into `wc -c`, one paragraph above its own warning that captured output truncates — and the pipe duly reported a short count, so the command contradicted the number it was offered as evidence for.

Worse, the truncated value is **not stable**: the same pipe has been observed at `65536`, `81920`, and `8171`. That is not buffer scheduling — §2.2.3 identifies the actual cause, which A1 must fix before it can work at all.

A quarter-megabyte report for a document with **zero** hard findings is the shape of the problem: the bytes are inventory, not signal. The 13 largest reports together reach 2,008,482 bytes, crossing the wrapper's cap before any brief text, so a repeatable flag whose every individual run exits 0 or 1 could still fail composition.

Measure this with output redirected to a file, never through a captured pipe — for the reason given in §2.2.3, which is a defect in the CLI rather than a property of measurement.

**Filtering does most of the work; the budget is a safety net, not a routine constraint.** Applying the transformation above to the corpus's largest report:

```
raw=290909 bytes | filtered=20051 bytes | reduction=93.1%
INVENTORY at line 179 | summary lines found: 1 | bare-INVENTORY collisions: 1
```

The worst report in the corpus lands at 20 KB filtered, so the 200,000-byte budget accommodates roughly ten of the largest documents in one dispatch and the wrapper's 2,000,000-byte composition cap is never approached in realistic use. Truncation is the guard against a pathological invocation, not a thing reviewers should expect to see.

- Reports are embedded in `--lint-doc` argument order, and that order is preserved.
- The embedded reports carry a combined budget of 200,000 bytes. When a report would cross it, it is truncated at a line boundary and the block ends with an explicit `[truncated: N of M bytes shown]` line, so the reviewer is never shown a silently shortened report.
- Truncation is never a refusal. Exceeding the budget is an expected consequence of a valid input, not a fault.

### 2.2.3 Precondition — the CLI truncates its own output on a pipe

`scripts/spec-lint.ts:234` writes the report with `process.stdout.write`, then `scripts/spec-lint.ts:236` calls `process.exit(r.exitCode)` on the next statement. **On a pipe `process.stdout.write` is asynchronous**, so the process exits before the buffer drains; to a file or TTY it is synchronous and the write completes. Same command, two capture modes, two different reports:

```
npx tsx scripts/spec-lint.ts <this spec> > /tmp/f.txt   # 23300 bytes, summary present
spawnSync("npx", ["tsx", "scripts/spec-lint.ts", <this spec>])
                                                        #  8171 bytes, summary ABSENT
```

Not `maxBuffer` — identical at 64 MB, `status=0`, no error reported. The consumer is handed a short report and a success code.

**A1 cannot work until this is fixed.** codex-guard spawns the CLI and captures stdout through a pipe by construction, so every dispatch would embed a truncated report, and §2.2.2's "keep the `summary:` line" would silently fail on all of them — the reviewer receiving a report whose most informative line is exactly the one always missing.

The repair is `process.exitCode = r.exitCode` and a natural exit, which drains stdout. **Verified rather than asserted** — a variant with that one line changed, run against this document:

```
current  (process.exit)     : 8166 chars,  summary ABSENT
variant  (process.exitCode) : 26095 bytes, summary present, byte-identical to the redirect
```

One trap the verification itself hit, worth carrying into the test: `spawnSync(...).stdout.length` counts **UTF-16 code units**, not bytes, and this document is full of em-dashes. A first comparison read 25958 against a 26095-byte redirect and looked like a 137-byte shortfall; the outputs were in fact identical. AC-35 compares **`Buffer.byteLength`**, never string length, because a byte-vs-char mismatch masquerades convincingly as truncation. This is a pre-existing defect in a file A1 already modifies (§3.4 wires the renderer at `scripts/spec-lint.ts:46`), and it blocks the feature outright rather than sitting beside it, so it is repaired in this PR rather than deferred — the class-sweep disposition rule's default.

It also explains, retroactively, all three truncated measurements recorded during this spec's drafting. Those were attributed to buffer scheduling; the attribution was wrong, and the corrected explanation is here.

### 2.2.4 The existing "full output" rule is amended, not silently violated

`docs/agents/spec-self-review.md:25` already mandates the human form of this arm:

> Run `pnpm spec:lint <doc>` and attach its full output to the review dispatch; … A dispatch without the lint output is incomplete.

Taken literally, **A1 cannot satisfy the rule it is built to mechanize.** §2.2.2 removes the `INVENTORY` block, and AC-21 permits truncation past the budget — yet §2.4 would record `lintArm: "present"` either way. A dispatch could be machine-reported as armed while being, by the letter of the cited authority, incomplete. Leaving that unreconciled would put the arm and its own stated authority in direct conflict, which is worse than either posture alone: a future reviewer resolving the conflict the other way would delete §2.2.2's filtering and reintroduce the composition-cap failure it exists to prevent.

The word doing the damage is "full", and it was written when a human pasted terminal output — a context where "full" meant "do not cherry-pick the findings that flatter you", not "include the numeric inventory verbatim". So the rule is amended to say what completeness actually requires, in mechanically checkable terms:

> Run `pnpm spec:lint <doc>` and attach its report to the review dispatch — every finding it emitted, plus the `summary:` line. The numeric `INVENTORY` block may be omitted; findings may not. If the report is abridged for size, the dispatch says so explicitly and says how much was dropped. A dispatch without the lint report, or one whose findings were filtered, is incomplete. `codex-guard --lint-doc` (§2.2) satisfies this automatically and records `lintArm` in result.json.

Three properties make the amended rule and the arm agree exactly:

- **Findings are never dropped selectively.** §2.2.2's transformation is positional — it removes one contiguous block delimited by a bare `INVENTORY` line and the `summary:` line — so it cannot remove a finding regardless of the finding's content.
- **Abridgement is always disclosed.** The only path that drops findings is the budget, and §2.2.2 requires the explicit `[truncated: N of M bytes shown]` notice, which is what the amended rule's "says how much was dropped" names.
- **The `summary:` line survives both transformations**, so the totals a reviewer would use to detect a suspiciously short report are always present. §2.3 refuses the dispatch outright if it is not.

AC-41 pins the amendment; it is a docs change in this PR, not a note for later. The class this belongs to is worth naming, since it is the same one A3 legislates in §4: a mechanization that quietly redefines its own authority's terms is the S1 shape pointed at a rule instead of at an input.

### 2.3 Failure posture

| Condition | Behavior |
| --- | --- |
| lint exits 0 or 1 **and** the report is well-formed | embed findings, dispatch proceeds |
| lint exits 0 or 1 but the report is malformed — missing the `spec:lint <path>` first line or the `summary:` last line | **refuse to dispatch**, exit 2: the tool did not run to completion |
| the child fails to spawn (`ENOENT`), or dies on a signal (`code === null`) | **refuse to dispatch**, exit 2 |
| lint exits 2 (usage or infra fault, including a tracked symlink) | **refuse to dispatch**, exit 2, no result.json Codex outcome |
| `--lint-doc` resolves outside `--cwd`'s repo, or is unreadable | refuse, exit 2, message names path and repo root (§2.2.1) |
| embedded reports exceed the 200,000-byte budget | truncate at a line boundary with an explicit notice; dispatch proceeds (§2.2.2) |
| no `--lint-doc` given | dispatch proceeds; result.json records `lintArm: "absent"` |

Findings never block dispatch. A doc with 40 citation failures is exactly the doc a reviewer most needs the report for. Only a tool that could not run blocks, which matches the exit-2-is-infra semantics `spec:lint` already defines.

**Exit code alone cannot carry that distinction, so the report's shape is checked too.** A failure *before* the adapter runs also exits 1, with empty stdout and no error — a missing Node loader does exactly this (`status=1, signal=null, stdoutBytes=0`). A spawn failure surfaces as `error.code === "ENOENT"` with no exit code at all, and a signalled death gives `code === null`. None of the three is exit 2, so a contract keyed only on the exit code treats every one of them as a valid findings report and dispatches with no lint output — precisely what this section says must block.

Verified across every mode, including one the check was not designed for:

```
current CLI (truncating)   status=0     shapeOK=false
fixed variant              status=0     shapeOK=true
pre-adapter failure        status=1     shapeOK=false
spawn ENOENT               status=null  errCode=ENOENT
```

The first row is the useful surprise: the shape check **also** catches the §2.2.3 truncation, at `status=0`, without knowing anything about it. The two repairs are independent, and this one backstops the other — if the `process.exitCode` fix is ever reverted, dispatches refuse loudly instead of quietly embedding a report whose summary line is missing. A guard that only understood exit codes would have shipped that silently.

### 2.4 The recorded gap

The gap has **two** levels, and only the inner one is narrowed here.

**Inner — entered the wrapper, omitted the flag.** A caller who omits `--lint-doc` still dispatches. result.json gains a `lintArm` field taking `"present"` or `"absent"`, so the omission is machine-visible to the orchestrator reading the result contract, rather than invisible as it is today. Closing this fully would require codex-guard to infer the review target from brief prose, which is the S1 mistake this spec exists to stop.

**Outer — never entered the wrapper.** Per §2.1, `AGENTS.md:182` is a `SHOULD`. A dispatch made by calling `codex exec` directly produces no result.json at all, so it has no `lintArm` field to read: it is not recorded as unarmed, it is simply absent from the record. **`lintArm: "absent"` therefore does not enumerate unarmed dispatches** — it enumerates unarmed *wrapper* dispatches, and an orchestrator counting them would undercount by exactly the bypass population. This spec does not close the outer level and does not attempt to; making the wrapper mandatory is a change to a ratified AGENTS.md posture, out of scope here.

Both levels are recorded as documented limits (§6 item 1).

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

So the plan declares its own task grain, in a **delimited region**:

```
<!-- tasks: depth=3 -->
...tasks live here...
<!-- tasks: end -->
```

**The grammar is a narrow ACCEPT, and everything else is a finding.** §4.1 requires exactly this of detector specs, and an earlier draft of this section did not practise it: it listed the *rejected* depth values and left every other deviation unmodelled, which is the denylist shape §4.1 exists to forbid. Stated positively instead:

**Matching convention, stated once and binding on every pattern in this spec.** A pattern is applied to a line with its terminator (`\n` or `\r\n`) already removed, so `$` cannot be satisfied by a newline. Trailing horizontal whitespace is written `[ \t]*` rather than `\s*` for the same reason — `\s` would have made the two spellings differ on a `\r`, which is exactly the kind of ambiguity a total classifier must not carry. **All three forms — opening, closing, and the §3.3 task marker — share the identical ` {0,3}` prefix and `[ \t]*$` suffix.** §3.4.1's table restates these same patterns verbatim; a draft in which the prose allowed indentation and the table anchored at column zero was two grammars wearing one name, and is precisely what AC-29's table-driven test exists to keep from recurring.

- An **opening line** is a non-fenced line matching `^ {0,3}<!-- tasks: depth=([1-6]) -->[ \t]*$` **exactly**. One field, one value, no other content.
- A **closing line** is a non-fenced line matching `^ {0,3}<!-- tasks: end -->[ \t]*$` exactly.
- Any non-fenced line whose first non-space content begins `<!-- tasks:` (after up to three spaces) and matches neither form is `TASK_ENROLL_MALFORMED`. That single clause covers an out-of-range or non-integer depth, a missing depth, an unknown extra field (`depth=3 extra=x`), a repeated field (`depth=3 depth=4`), and every form not yet imagined — none of which may silently opt a plan out while visibly declaring enrollment.
- **Region state and enrollment are two different things, computed in two passes, and conflating them is what made three earlier drafts contradict themselves.** The **line pass** tracks a purely mechanical region state — open or not open — used only to classify each line as it is read. **Enrollment** is a whole-document conclusion drawn *after* the line pass finishes: a plan is enrolled iff the document contains **exactly one** opening line. The line pass cannot decide enrollment, because the second opening line may be a thousand lines below the first; any table row claiming a line "enrolls the plan" is asserting something not yet knowable at that point in the scan. §3.4.1's first row said exactly that, while this section said "iff exactly one opening" — two rules giving opposite answers for `open → close → open → close`, with the task-level checks undefined in between.

- **Every** opening line after the first is `TASK_ENROLL_DUPLICATE` — whether or not a close intervenes. An earlier wording said "without an intervening close", which left `open → close → open → close` matching no finding at all. Multiple regions are not supported, and the unsupported case must be loud.

- **A duplicate opening leaves the plan unenrolled, and that is not the same as silent.** With two openings there is no single region to check against, so the task-level rows (`TASK_ENROLL_EMPTY`, `TASK_MARKER_MISSING`, `TASK_MARKER_DUPLICATE`) are skipped — the same rule as any other failure to establish one valid region. What makes this safe rather than the silent-acceptance shape is that `TASK_ENROLL_DUPLICATE` is *itself* the hard finding: the author is told plainly that the plan declares two regions, fixes it, and re-runs to get full task-level checking. Guessing which of two declared regions the author meant, and reporting task findings against that guess, would be a recognizer inventing intent from ambiguous input — the shape §1.1 item 4 forbids. AC-26 and AC-30 pin both halves: the duplicate fires, and the full finding list contains nothing else.
- A closing line is consumed silently in exactly one circumstance: it matches an opening line that was itself rejected as `TASK_ENROLL_DUPLICATE`. Track a count of rejected openings; each close while the region is not open decrements it. A close with the counter at zero and the region not open is `TASK_ENROLL_MALFORMED`.

  Two wrong spellings were tried before this one. "Malformed whenever the region is not currently open" **cascades**: the close matching a rejected duplicate reports a phantom unmatched-close, so one authoring error manufactures a misleading second finding. "Consumed whenever any opening precedes it anywhere" **over-corrects**: `open → close → close` and any number of surplus closes after a completed region are then swallowed with no finding at all, which is the silent-acceptance shape again. Pairing each silent consumption with a specific rejected opening is what makes both cases come out right. Probed against `open → close → open → close`: the second opening correctly draws `TASK_ENROLL_DUPLICATE`, and because rejecting it leaves the region closed, its matching close then draws a second finding claiming no open precedes it, which is visibly false. One authoring mistake must not manufacture a misleading second finding; the duplicate is the whole defect.
**The leading-space allowance is not cosmetic.** CommonMark permits an HTML block up to three spaces of indentation, and such lines occur in the tracked corpus. Anchoring at column zero classifies an indented marker as ordinary prose, so a plan that visibly declares enrollment is treated as never having attempted it: silently unenrolled, zero findings, no diagnostic at all. Four or more leading spaces is an indented code block in CommonMark and correctly is not a marker. The same allowance applies to task markers (§3.3).

- A **task** is a heading of exactly the declared depth **lying inside the region**. Nothing else is a task, at any depth; no heading text is ever read. End of document closes an unclosed region.
- An enrolled plan whose region contains **zero** tasks is `TASK_ENROLL_EMPTY`. A valid in-range depth can legitimately select nothing — wrong depth, or an opening line placed after the last matching heading — and a checker that reports nothing there has accepted a plan while checking no tasks at all. That is the silent-acceptance shape in its purest form, so it is a hard finding rather than a vacuous pass.

**The region has two ends because one is provably not enough.** An earlier draft of this section made a task "every heading of that depth after the opening line", and the plan implementing this spec refuted it on its first probe:

```
awk 'NR>6 && /^## /{print NR": "$0}' docs/superpowers/plans/2026-08-03-pre-review-gate-arms.md
```

Twelve depth-2 headings, seven of them tasks. Front matter (`## Pre-draft verification`, `## Meta-test inventory`, `## Mutation-family closure`, `## Tasks`) could have been dodged by moving the opening line down. `## Blocking note`, which **follows** the last task at the same depth, could not: no start-only marker excludes a trailing section. The failure was in the model, not the placement.

A plan that **never attempts enrollment** — no `<!-- tasks:` line anywhere — produces zero `taskContract` findings. That is what keeps §1.1 item 3 true: the 533 legacy plans are untouched, and the convention costs nothing until first used.

**"Never attempted" is not the same as "attempted and failed", and conflating them erases findings.** An earlier wording made enrollment hold "iff there is exactly one valid opening" and then gave every unenrolled plan zero findings — which deletes the very errors the line pass just raised. A malformed opening has zero valid openings; an unmatched close has zero; duplicate openings have two. All three would be silenced, including the duplicate case AC-26 explicitly requires to be reported. So: any plan carrying a `<!-- tasks:` line has attempted enrollment, its line-pass findings always stand, and only the task-level rows (`TASK_ENROLL_EMPTY`, `TASK_MARKER_MISSING`, `TASK_MARKER_DUPLICATE`) are skipped when a single valid region could not be established.

### 3.3 The task marker

One HTML comment per task, anywhere in that task's extent:

```
<!-- task: red=`pnpm vitest run tests/specLint/taskContract.test.ts` ac=AC-3,AC-4 -->
```

Grammar, narrow ACCEPT on the same principle as §3.2:

- A **marker** is a non-fenced line matching this pattern **exactly** — the two fields, in that order, one space between them, no other content:

  ```
  ^ {0,3}<!-- task: red=`([^`]*)` ac=(AC-[A-Za-z0-9]+([.-][A-Za-z0-9]+)*(,AC-[A-Za-z0-9]+([.-][A-Za-z0-9]+)*)*) -->[ \t]*$
  ```

  The ` {0,3}` prefix and `[ \t]*$` suffix are the §3.2 matching convention, not a local variation. An earlier draft anchored this one pattern at column zero while §3.2 allowed three spaces on the enrollment lines and stated in the same breath that "the same allowance applies to task markers" — so the prose promised an allowance the grammar next to it withheld, and AC-39 asserted a behavior no pattern in the spec produced. A conforming implementation reading the regex alone would classify every indented marker as ordinary prose, leaving its task reported `TASK_MARKER_MISSING` with the marker sitting visibly right there.

The command group excludes backticks and is deliberately neither `(.+)` nor `(.*)`. With `(.+)` an empty pair of backticks fails the marker form outright and falls to `TASK_MARKER_MALFORMED`, while a whitespace-only command matches and draws `TASK_RED_EMPTY` — two spellings of the same authoring slip getting different codes, contradicting the precedence rule below which names "empty or whitespace only" as one case. Probed against the stated grammar before it shipped: `` red=`` `` classified `TASK_MARKER_MALFORMED`, `` red=`  ` `` classified `TASK_RED_EMPTY`. Matching empty and delegating to precedence rule 1 makes both `TASK_RED_EMPTY`.

But `(.*)` alone is **greedy across backticks**, which silently re-opens every structure the "two fields, no other content" rule forbids: the group runs to the last usable backtick and swallows the junk. Probed:

```
repeated ac          greedy=ACCEPT  strict=reject
unknown key          greedy=ACCEPT  strict=reject
empty red then junk  greedy=ACCEPT  strict=reject
repeated red         greedy=ACCEPT  strict=reject
legit                greedy=ACCEPT  strict=ACCEPT  red="pnpm vitest run tests/x.test.ts"
legit empty          greedy=ACCEPT  strict=ACCEPT  red=""
legit ws             greedy=ACCEPT  strict=ACCEPT  red="  "
```

A command containing a backtick is not expressible in this grammar, which is a deliberate domain boundary and not a bypass: `red=` names a shell command for a human to run, and one needing a nested backtick can be wrapped in a script. Excluding backticks is what makes the ACCEPT actually narrow.
- Any non-fenced line beginning `<!-- task:` that does not match is `TASK_MARKER_MALFORMED`. That covers an unknown key, a repeated key, reordered fields, a missing or unbackticked `red`, an empty `ac` list, an empty element inside the list (`AC-1,,AC-2`), and any form not yet imagined.

**Exactly one code per marker line, by a stated precedence.** The catch-all above overlaps the specific codes — a line missing `ac=` is both "does not match" and "ac absent" — and an overlap with no ordering makes the output undefined: one implementation emits both codes, another suppresses the generic one, a third treats the line as no marker at all and adds `TASK_MARKER_MISSING` on top. AC-8 would have no deterministic expected result. So:

1. The line matches the marker form, but the backticked command is empty or whitespace only → `TASK_RED_EMPTY`.
2. Otherwise the line matches everything except that `ac=` is absent or its list is empty → `TASK_AC_MISSING`.
3. Otherwise → `TASK_MARKER_MALFORMED`.

The first matching rule wins and no further code is emitted for that line.

**Placement outranks form, and both are conditional on enrollment.** In an enrolled plan, a `<!-- task:` line outside every task extent reports `TASK_MARKER_ORPHANED` and nothing else, regardless of whether its form is valid. In a plan that never attempted enrollment there are no extents to be outside of, and the whole-document rule already gives such a plan zero findings — so no marker in it is orphaned, malformed, or anything else. Stating ORPHANED unconditionally contradicted that rule directly: a plan with no enrollment line and one malformed marker satisfied "zero findings" and "exactly `TASK_MARKER_ORPHANED`" at the same time. Without this the "any region state" reading gives a malformed orphan two findings — one for its form, one for its placement — contradicting the one-code rule directly above. Reporting placement alone is also the more useful half: the form of a line that belongs to no task is moot until it is moved, and once moved it is re-checked normally. Separately: **a marker line occupies its task's marker slot regardless of which code it drew.** A task whose only marker is malformed reports that code alone, never also `TASK_MARKER_MISSING`; two such lines in one extent still report `TASK_MARKER_DUPLICATE`. Otherwise every malformed marker would produce two findings describing one defect.

**AC ids resolve on exact-token boundaries, and the boundary rule is not the obvious one.** An id resolves only where it appears delimited — never as a prefix of a longer id. The naive rule is "not preceded or followed by any character the id grammar allows", i.e. `[A-Za-z0-9.-]`. That is **wrong**, because `.` is legal *inside* an id (`AC-1.1`) and is also the commonest sentence terminator, so it rejects the single most typical citation an author writes.

Probed against a reference implementation of this section run over the plan that implements it: the naive rule reported three spurious `TASK_AC_UNRESOLVED` findings, because `AC-14` was cited only as `**Verify.** AC-14.` — a period, at the end of a sentence.

```
id       prose                      naive   refined
AC-14    "**Verify.** AC-14."       false   true
AC-14    "AC-14 and more"           true    true
AC-14    "(AC-14)"                  true    true
AC-1     "only AC-10 here"          false   false
AC-1     "only AC-1a here"          false   false
AC-1     "only AC-1.1 here"         false   false
AC-1     "only AC-1-child here"     false   false
AC-1     "AC-1."                    false   true
AC-1.1   "see AC-1.1."              false   true
```

The rule is therefore: an occurrence resolves when it is **not preceded by** `[A-Za-z0-9.-]`, **not followed by** `[A-Za-z0-9-]`, and **not followed by a `.` that is itself followed by an alphanumeric**. A period continues an id only when something id-shaped follows it; otherwise it is punctuation. All four prefix families (`AC-10`, `AC-1a`, `AC-1.1`, `AC-1-child` against a wanted `AC-1`) still fail to resolve, which is the property the boundary exists for.

**The id grammar is tightened to match, and that is what closes the aliasing.** An id is `AC-[A-Za-z0-9]+([.-][A-Za-z0-9]+)*`: it must end alphanumeric, and punctuation may never repeat or trail. Under the looser `AC-[A-Za-z0-9.-]+`, the ids `AC-1.`, `AC-1..1`, `AC-1.-child` and `AC-1-` were all legal, and each would have been resolved by a wanted `AC-1` — a marker silently satisfied by a *different, legal* id. Tightening removes them from the id space entirely, so there is no wrong id left to alias to:

```
AC-1.        loose=legal  tight=illegal
AC-1..1      loose=legal  tight=illegal
AC-1.-child  loose=legal  tight=illegal
AC-1-        loose=legal  tight=illegal
```

**The left boundary is load-bearing and separately pinned by AC-42.** A mutant dropping only the preceding-character check passes every prefix-family case and the sentence-final case, while wrongly resolving `XAC-1`, `0AC-1`, `.AC-1`, and `MY-AC-1`. Both halves need their own coverage; a suite exercising only the right boundary certifies a broken resolver. An earlier draft asserted the pinning without providing it — AC-24 and AC-34 between them exercise only the right boundary, and no criterion named any of those four strings, so the sentence was an attribution to coverage that did not exist.

A task's extent runs from its heading line to the line before whichever comes first: the next heading of the enrolled depth **or shallower**, the region's **closing line**, or end of document. Content under *deeper* headings therefore belongs to the enclosing task, which is deliberate: a task with `### RED` and `### GREEN` sub-headings is one task, and its marker and AC mentions count wherever they sit inside it.

**The closing line terminating the extent is load-bearing, not incidental.** Without it the last task's extent runs past `<!-- tasks: end -->` to the next equal-or-shallower heading or EOF, while the orphan rule below simultaneously calls every marker after the close orphaned. The same marker would be both owned and orphaned, and two conforming implementations would disagree: one lets an out-of-region marker satisfy the preceding task, the other reports it orphaned and the task missing.

A marker appearing **outside every task extent** — before the region, after the closing line, or between the region's start and its first task heading — is `TASK_MARKER_ORPHANED`; it belongs to no task and is never silently dropped.

### 3.4 New checks

A new `taskContract` member of the `Check` union (`lib/specLint/types.ts:2`) and a corresponding entry in `CHECK_ORDER` (`lib/specLint/run.ts:8`). All are hard, and all run only when `kind === "plan"`.

**`lib/specLint/sections.ts:27` is not touched, and an earlier draft saying otherwise was a scope violation, not a wording slip.** That draft placed the new checks "replacing the current unconditional short-circuit" there. But `if (kind === "plan") return [];` is not an implementation detail to route around — it is the entire mechanism enforcing the prior spec's ratified decision that plans skip section-presence checks (`docs/superpowers/specs/2026-07-19-spec-lint.md`, §1.1). Replacing it would let every plan in the corpus start drawing spec-only section failures: breaking one ratified contract to install an unrelated one, in a spec whose §1.2 simultaneously promised no existing check changes behavior.

`taskContract` needs nothing from that branch. It is a sibling entry in `CHECK_ORDER`, gated on `kind === "plan"` in its own module; `checkSections` keeps returning `[]` for plans exactly as it does today. **AC-40** pins it behaviorally — the fixture plan draws `taskContract` findings and **zero** `sections`-family findings — rather than by asserting the line is unmodified, which a refactor could satisfy while still re-enabling the checks elsewhere.

| Code | Fires when |
| --- | --- |
| `TASK_ENROLL_DUPLICATE` | any opening line after the first, intervening close or not |
| `TASK_ENROLL_MALFORMED` | a `<!-- tasks:` line matches neither the opening nor the closing form exactly (§3.2), or a closing line has no opening line anywhere before it |
| `TASK_ENROLL_EMPTY` | an enrolled plan's region contains zero headings at the declared depth |
| `TASK_MARKER_MISSING` | an enrolled plan has a task with no marker in its extent |
| `TASK_MARKER_DUPLICATE` | one task extent holds two or more markers |
| `TASK_MARKER_ORPHANED` | a marker sits outside every task extent |
| `TASK_MARKER_MALFORMED` | a `<!-- task:` line does not match the marker form exactly and is not claimed by a higher-precedence code (§3.3) |
| `TASK_RED_EMPTY` | the marker matches except that its backticked command is empty or whitespace only (precedence 1) |
| `TASK_AC_MISSING` | the line matches except that `ac=` is absent or its list is empty (precedence 2) |
| `TASK_AC_UNRESOLVED` | an `ac=` id has no exact-token occurrence in the plan's own text outside a marker |

### 3.4.1 Total classification table — the structural defense

Three consecutive review rounds found the same defect class in §3: an input that parsed to **neither a valid construct nor a finding**. R1 found an empty region and enrollment lines with extra or repeated fields; R2 found sequential regions, an overlap with no precedence between the marker codes, and a marker that was simultaneously owned and orphaned. Each was repaired individually, which is exactly the per-instance whack-a-mole `docs/agents/writing-plans.md:19` warns produces another round.

The rule at `docs/agents/writing-plans.md:20` says to ship the structural defense in the repair commit rather than wait for a fourth round to confirm the analysis was incomplete. For a grammar, that defense is a **total function**: every line the checker can see is classified, and the table below is exhaustive by construction. An input reaching no row is itself a spec defect, not an implementation choice.

Every non-fenced line in a plan falls into exactly one class:

**Pass 1 — line classification.** State is two counters and a flag: `open` (is a region currently open), and `rejectedOpens` (how many openings were rejected as duplicates and are still awaiting their matching close, per §3.2). Patterns are quoted verbatim from §3.2 and §3.3 under the matching convention stated there — the ` {0,3}` prefix and `[ \t]*$` suffix are part of every one of them, not an omission tolerated here.

| Line class | Region state | Outcome |
| --- | --- | --- |
| `^ {0,3}<!-- tasks: depth=([1-6]) -->[ \t]*$` | no open seen yet | opens the region (enrollment is decided in pass 2, not here) |
| `^ {0,3}<!-- tasks: depth=([1-6]) -->[ \t]*$` | any open seen before | `TASK_ENROLL_DUPLICATE`; `rejectedOpens += 1` |
| `^ {0,3}<!-- tasks: end -->[ \t]*$` | region open | closes the region |
| `^ {0,3}<!-- tasks: end -->[ \t]*$` | region not open, `rejectedOpens > 0` | consumed silently; `rejectedOpens -= 1` — the close belongs to a rejected duplicate, so reporting it would cascade |
| `^ {0,3}<!-- tasks: end -->[ \t]*$` | region not open, `rejectedOpens == 0` | `TASK_ENROLL_MALFORMED` — covers both an unmatched close and a surplus close after a completed region |
| starts `<!-- tasks:` (after 0–3 spaces), matches neither form | any | `TASK_ENROLL_MALFORMED` |
| any `<!-- task:` line (after 0–3 spaces) | outside every task extent, in an enrolled plan | `TASK_MARKER_ORPHANED` **alone**, whatever its form |
| marker form, `red` empty or whitespace | inside an extent | `TASK_RED_EMPTY` (occupies the slot) |
| marker form except `ac=` absent or empty | inside an extent | `TASK_AC_MISSING` (occupies the slot) |
| marker form, well-formed | inside an extent | satisfies that task; ids checked by `TASK_AC_UNRESOLVED` |
| starts `<!-- task:`, matches nothing above | inside an extent | `TASK_MARKER_MALFORMED` (occupies the slot) |
| ATX heading at the declared depth | inside region | is a task |
| ATX heading at the declared depth | outside region | ordinary prose |
| ATX heading at any other depth | any | ordinary prose; terminates an extent only if shallower |
| anything else | any | ordinary prose |

The three `tasks: end` rows are jointly exhaustive over the region state, which is what makes the surplus close come out right. An earlier table collapsed the last two into one row reading "an opening line appeared earlier, region not currently open → consumed silently", which swallowed every close after a completed region: `open → close → close` produced no finding, contradicting §3.2's counter rule and reinstating the silent-acceptance shape the counter was introduced to remove. The counter is the whole mechanism — a close is forgiven only when a specific rejected opening is there to forgive it.

**End of document closes an unclosed region** (§3.2), which is a pass-1 terminal action rather than a line class: it needs no finding, since a region running to EOF is a legitimate way to enrol the tail of a plan. AC-43 pins it — the last task in an unclosed region is checked normally rather than being dropped or reported.

**Pass 2 — whole-document conclusions**, evaluated after the line pass has finished and every enrollment line has been seen:

| Condition | Outcome |
| --- | --- |
| plan contains **no** `<!-- tasks:` line at all | zero `taskContract` findings, whatever else it contains |
| plan contains a `<!-- tasks:` line but does not contain exactly one opening line | the pass-1 findings stand; every row below is skipped |
| enrolled (exactly one opening line), region holds zero tasks | `TASK_ENROLL_EMPTY` |
| enrolled, a task's extent holds no marker line of any class | `TASK_MARKER_MISSING` |
| enrolled, a task's extent holds two or more marker lines of any class | `TASK_MARKER_DUPLICATE` |

The second row is where duplicate openings land, and it is the one the two passes previously disagreed about. Pass 1 rejects the extra opening and says nothing about enrollment; pass 2 sees two openings, concludes not-enrolled, and skips the task-level rows while every pass-1 finding survives. AC-32 pins the survival across all three not-enrolled shapes, AC-30 pins the exact finding list for the duplicate case.

"Occupies the slot" is what keeps the two tables consistent: a marker line that drew `TASK_RED_EMPTY`, `TASK_AC_MISSING`, or `TASK_MARKER_MALFORMED` still counts for the missing and duplicate rules, so one defective line never produces two findings describing one defect.

`TASK_AC_UNRESOLVED` resolves against the plan document itself, not the linked spec. Cross-document AC resolution needs a declared spec link that plans do not currently carry; adding one is cluster-C-or-later work, and a check that silently resolves nothing is worse than no check. Recorded in §6. Resolution deliberately excludes marker lines themselves, so an id cannot satisfy itself by being cited.

**The renderer is a third wiring point, not a consequence of the first two.** `CHECK_ORDER` governs sort order inside `runLint`; it does **not** drive the CLI's text report, which iterates its own closed literal list at `scripts/spec-lint.ts:46`. Adding the union member and the order entry without touching that list yields a run that exits 1 while the embedded report shows only an aggregate count — no code, no line, no message — which is precisely the report a reviewer receives under §2. All three wiring points land together: `lib/specLint/types.ts:2`, `lib/specLint/run.ts:8`, and `scripts/spec-lint.ts:46`.

Note the deliberate asymmetry with §1.1 item 4: these checks verify a **declaration's shape**, never a task's prose. `TASK_RED_EMPTY` asserts the author wrote a command; it does not assert the command is real, runs, or fails first. That remains the reviewer's job, now with a named target instead of a prose hunt.

The cost of enrollment is that a plan which marks some tasks and not others fails on the unmarked ones. That is intended — partial enrollment is the drift state this check exists to catch.

## 4. A3 — accept-set discipline for detector specs

### 4.1 The rule

Added to `docs/agents/spec-self-review.md` as a mandatory self-review item:

> **Detector, recognizer, classifier, and guard specs declare an accept-set by type.** Any spec introducing a surface that decides whether an input is "an instance of X" must state what it ACCEPTS, keyed on type or structure rather than on spelling, and must state that everything outside the accept-set is rejected or reported by name — never silently passed. A spec that enumerates rejected forms has authored a denylist, and a denylist accepts whatever it did not model.

Paired with the existing round-economy admissibility contract already in AGENTS.md: no recognizer tightening is accepted without a probe demonstrating the corruption it prevents.

### 4.2 Why this is prose and not a check

Nine artifacts burned on this shape; none was caught by review-time reasoning alone, and each was ultimately closed by inverting to fail-closed narrow-ACCEPT plus a type table. A lint rule would first have to decide "is this a detector spec?" — itself a recognizer over prose, with exactly the failure mode being legislated against. The honest design is a rule the author applies and the reviewer checks.

**A3 gets no mechanical assist from A1, and an earlier draft claimed it did.** That draft ended this paragraph with "made visible at dispatch by §2". It is not: the report §2 embeds is `spec:lint` output, the CLI renderer iterates a closed list of lint check families (`scripts/spec-lint.ts:46`), and A3 deliberately has no lint rule to appear in it. Nothing about a spec's accept-set discipline reaches the reviewer through the embedded report. A3's enforcement is the self-review item and the reviewer reading it — which is the honest and complete statement of its strength. Claiming otherwise would have been this spec committing the attribution error A3 exists to catch, inside the section that introduces A3.

## 5. Acceptance criteria

**AC-1.** `codex-guard review --brief B --lint-doc D` embeds a `===== SPEC-LINT: D =====` block into the composed prompt whose body is the CLI's stdout for `D` **with the `INVENTORY` section removed** (§2.2.2), and truncated if the budget requires (AC-21). The body is derived from a live CLI run in the test, never from hardcoded expected text — a hardcoded expectation passes against a broken embed. Byte-equality against *raw* stdout is explicitly **not** the contract: it would contradict AC-20 for any report carrying an inventory, which is nearly all of them.

The property that replaces byte-equality, and the one §2.2.4 actually requires: **every finding line present in raw stdout is present in the embedded body**, asserted by extracting the finding lines from both and comparing them as sets. This is what makes "the inventory may go, findings may not" a tested behavior rather than a description of the intended diff. A test asserting only that `INVENTORY` is absent would pass a transformation that dropped findings alongside it.

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

**AC-12.** A heading at a depth other than the enrolled one is never itself a **task** and never draws `TASK_MARKER_MISSING`. Its *content* is not exempt: a deeper heading's lines belong to the enclosing task's extent per §3.3, so a marker or AC mention beneath it counts for that task. Pinned with one fixture asserting both halves, because stating only the first contradicts the extent rule.

**AC-18.** The lint child runs with cwd = `--cwd`; a relative `--lint-doc` resolves against `--cwd`; and a doc valid in the target repo lints identically regardless of the wrapper's launch cwd (§2.2.1).

**AC-19.** A `--lint-doc` resolving outside `--cwd`'s repository exits 2 with a message naming both the path and the repo root, distinguishable from an unreadable-file exit 2.

**AC-20.** The embedded block excludes the CLI's `INVENTORY` section and contains its findings.

**AC-21.** Reports embed in argument order; when the combined 200,000-byte budget is crossed, the block truncates at a line boundary and ends with an explicit truncation notice, and the dispatch still proceeds.

**AC-22.** An enrolled plan whose region selects zero tasks reports `TASK_ENROLL_EMPTY` — pinned both by a wrong-depth fixture and by one whose opening line follows the last matching heading.

**AC-23.** `<!-- tasks: depth=3 extra=x -->` and `<!-- tasks: depth=3 depth=4 -->` each report `TASK_ENROLL_MALFORMED`. Neither may parse to "not enrolled".

**AC-24.** `TASK_AC_UNRESOLVED` fires for `ac=AC-1` when the plan's prose contains only `AC-10`, `AC-1a`, `AC-1.1`, or `AC-1-child` — one case per prefix family, none of which may resolve it.

**AC-38.** The marker grammar rejects `ac=AC-1.`, `ac=AC-1..1`, `ac=AC-1.-child`, and `ac=AC-1-` as `TASK_MARKER_MALFORMED`. Without this the tightening in §3.3 is a claim about a regex rather than an asserted behavior, and the aliasing it closes could silently return.

**AC-39.** An enrollment line and a task marker indented by one, two, and three spaces are recognized; the same lines indented by four spaces are not, being indented code blocks under CommonMark. Both halves asserted — a suite testing only the accepted side would pass a grammar that accepted arbitrary indentation.

The rejecting half asserts an *absence*, so its fixture must make the wrong behavior produce something: the four-space enrollment line is followed by a depth-N heading carrying **no marker**. A grammar accepting arbitrary indentation then enrolls the plan and reports `TASK_MARKER_MISSING`, against an expected empty list. The four-space *marker* case is the mirror image and needs no such care — placed inside a correctly enrolled region it yields `TASK_MARKER_MISSING` positively.

**AC-35.** `scripts/spec-lint.ts` sets `process.exitCode` and exits naturally rather than calling `process.exit()`. Pinned behaviorally: the CLI spawned through a pipe returns a report whose last line begins `summary:`, and whose bytes are **identical** to those of the same run redirected to a file — `Buffer.compare(pipeBuf, fileBuf) === 0`, comparing the buffers themselves, never their lengths.

Equal length is not equal content, and an earlier wording asked only for equal `Buffer.byteLength`. Two different reports of the same length both ending in `summary:` satisfy it; so does any truncation that happens to be compensated elsewhere. Since the defect under test is precisely "the pipe yields a *different, shorter* report", a length-only comparison tests a proxy for the property that matters while looking like the property itself. Use `Buffer.byteLength` only for the diagnostic message on failure — and never `String.length`, which counts UTF-16 code units and reads a byte-identical em-dash-heavy report as a shortfall (§2.2.3).

**AC-36.** A `--lint-doc` whose child exits 0 or 1 with a malformed report refuses the dispatch with exit 2. §2.3 requires **both** halves of the shape — the `spec:lint <path>` first line and the `summary:` last line — so three cases are pinned, and the third exists because the first two do not discriminate:

| Probe | first line | last line |
| --- | --- | --- |
| missing Node loader (`status=1`, empty stdout) | absent | absent |
| the §2.2.3 truncation, unfixed (`status=0`) | present | absent |
| **header-only corruption** (`status=1`) | **absent** | **present** |

The first two are both "no summary", so a mutant validating only the last line passes both while accepting any report with a corrupt or missing header — including one for a different document than the reviewer was told they were reading. The third probe is a real child emitting `wrong-header` followed by a well-formed `summary:` line, and it must refuse. Use real child processes throughout, not hand-built strings; the first two are the genuine failures §2.3 was written from.

**AC-37.** A `--lint-doc` whose child fails to spawn (`ENOENT`) or dies on a signal (`code === null`) refuses the dispatch with exit 2, asserted by `readCalls` returning an empty array.

**AC-34.** An id cited only as a sentence-final `AC-14.` resolves. Pinned alongside the four prefix families, because the boundary rule has to reject those AND accept this, and a rule satisfying only one half looks correct in isolation.

**AC-33.** A malformed `<!-- task:` line outside every task extent reports `TASK_MARKER_ORPHANED` and nothing else. Pinned by asserting the full finding list — a test checking only that ORPHANED is present would pass an implementation that also emitted the form code.

**AC-31.** A marker whose backticked command would have to span a backtick is rejected. Pinned with the four escapes a greedy group admits: a repeated `ac=`, an unknown key, an empty command followed by junk, and a repeated `red=` — each `TASK_MARKER_MALFORMED`, alongside a legitimate marker, an empty command, and a whitespace-only command that all still parse.

**AC-32.** A plan carrying a `<!-- tasks:` line that never reaches exactly one valid opening still reports its line-pass findings. Pinned across all three shapes: a malformed opening alone, an unmatched close alone, and duplicate openings — none may be silenced by the not-enrolled rule.

**AC-30.** `open → close → open → close` reports **exactly** `[TASK_ENROLL_DUPLICATE]` — asserted as a whole-array equality against the complete `taskContract` finding list, not as "contains DUPLICATE and not MALFORMED". The distinction is not pedantic: the weaker form is satisfied by a list of `[TASK_ENROLL_DUPLICATE, TASK_MARKER_ORPHANED]`, so an implementation that also mis-orphaned every marker in the unenrolled plan would pass a criterion written to prove exactly one finding. Whole-list equality is the only form that closes it, and the same form is required of AC-33 for the same reason.

**AC-29.** The §3.4.1 table is total: a table-driven test enumerates every line class against every region state and asserts each yields the stated outcome, with a final case asserting that an arbitrary line reaching no earlier row is classified as ordinary prose rather than falling through unhandled.

**AC-26.** `open → close → open → close` reports exactly `[TASK_ENROLL_DUPLICATE]`, anchored to the second opening. The first region must contain **a task that would itself draw a task-level finding if it were checked** — the fixture uses a depth-N heading with no marker at all. The full-list assertion then pins both halves at once: the duplicate fires (never silent), and the task-level rows are skipped (never guessed against one of two declared regions).

The fixture's shape is load-bearing and an earlier draft got it wrong in a way that is worth stating, because it is the anti-tautology trap in its purest form. That draft put a **well-formed** task with a valid marker in the first region and asserted no task-level finding. A well-formed task produces no task-level findings under *either* behavior, so the criterion could not fail. Verified by mutation against a reference implementation of §3.4.1 — flipping the pass-2 conclusion from `openCount === 1` to `openCount >= 1`:

```
fixture with a valid marker    correct=[DUPLICATE]  mutant=[DUPLICATE]                   survives
fixture with no marker         correct=[DUPLICATE]  mutant=[DUPLICATE, MARKER_MISSING]   killed
```

A criterion asserting the absence of a finding only discriminates when the wrong implementation would have produced one.

**AC-27.** Each of the three overlapping marker defects — missing `ac=`, empty `ac=`, empty backticked `red` — yields exactly ONE code, the one the §3.3 precedence assigns, and a task whose only marker is malformed does not additionally report `TASK_MARKER_MISSING`.

**AC-28.** A marker on a line after `<!-- tasks: end -->` but before the next equal-or-shallower heading reports `TASK_MARKER_ORPHANED`, and the preceding task reports `TASK_MARKER_MISSING` if it has no marker of its own. Pinned as one fixture asserting both, since the defect was that these two rules disagreed about the same line.

**AC-25.** `taskContract` findings render in the CLI text report under their own `taskContract:` heading with code, line, and message — asserted against the CLI's actual stdout, not against `runLint`'s return value.

**AC-15.** A heading at the enrolled depth **outside** the region yields nothing — whether it precedes the opening line or follows `<!-- tasks: end -->`. Pinned with a fixture carrying both, since only the trailing case refutes a start-only model.

**AC-16.** A `<!-- tasks: end -->` with no preceding opening line is `TASK_ENROLL_MALFORMED`, not a silent no-op.

**AC-17.** A task extent ends at the next heading of the enrolled depth **or shallower**. Pinned with a fixture carrying a mid-document heading shallower than the enrolled depth, because no plan in the current corpus exercises that branch.

**AC-13.** An `ac=` id that appears only inside marker lines, and nowhere else in the plan, is `TASK_AC_UNRESOLVED` — an id cannot satisfy itself.

**AC-14.** `docs/agents/spec-self-review.md` carries the §4.1 rule text and the §3.2 plus §3.3 marker convention.

**AC-40.** An enrolled fixture plan with task-contract defects reports its `taskContract` findings and **zero** findings of the `sections` family, proving `lib/specLint/sections.ts:27` still short-circuits for plans (§3.4). Asserted behaviorally on the finding list, not by grepping the source for the unchanged line — a refactor could preserve that line and still re-enable section checks for plans through another path.

The zero half is an absence assertion, so the fixture must be a document that **would** draw `sections` findings if the short-circuit were removed — that is, one missing the headings `checkSections` requires of a spec. This costs nothing to arrange: a plan is missing them by nature, which is why the short-circuit exists at all. State it in the test anyway, because a fixture that happened to satisfy the section requirements would report zero either way and certify nothing.

**AC-41.** `docs/agents/spec-self-review.md` carries the amended completeness clause (§2.2.4): findings may not be filtered, the `INVENTORY` block may be omitted, and an abridged report must disclose how much was dropped. Pinned as a docs assertion in the same PR as the arm, because the arm's conformance argument cites this text as its authority — leaving the old "full output" wording in place would leave §2.2.2 in standing violation of the rule it mechanizes.

**AC-42.** The left boundary of AC-id resolution is pinned by its own mutant. For a marker citing `ac=AC-1`, a plan whose prose contains only `XAC-1`, `0AC-1`, `.AC-1`, or `MY-AC-1` reports `TASK_AC_UNRESOLVED` in every case. §3.3 calls this boundary "separately pinned"; before this criterion existed, no acceptance criterion named any of those four strings, so a resolver dropping the preceding-character check passed the whole suite — AC-24's prefix families and AC-34's sentence-final case exercise only the right boundary.

**AC-43.** End of document closes an unclosed region: a plan whose opening line has no matching `<!-- tasks: end -->` still has its tasks checked normally through the last line, with no `TASK_ENROLL_MALFORMED`. Pinned because §3.2 states this in one clause and no other criterion exercises it — the fixtures elsewhere all close their regions explicitly, so an implementation that dropped the trailing region, or reported it unterminated, would pass everything else.

## 6. Documented limits

1. **The lint arm is opt-in at two levels, and the outer one is not even counted.** A dispatch that omits `--lint-doc` proceeds, recorded as `lintArm: "absent"`. A dispatch that never enters `codex-guard` at all — permitted, since `AGENTS.md:182` is a `SHOULD` and `AGENTS.md:203` names the residue — writes no result.json and so has no `lintArm` to record. The field measures unarmed *wrapper* dispatches, never unarmed dispatches, and any orchestrator metric built on it inherits that bound (§2.4). Inferring the target from brief prose is refused as an S1 reproduction; making the wrapper mandatory is a ratified-posture change out of scope here.
2. **Task enrollment is opt-in.** An author who writes no enrollment line gets no checks (§3.2). Accepted deliberately: it is what keeps the legacy corpus out of scope.
3. **AC ids resolve within the plan only, so the check is weaker than its name.** A plan citing an AC that exists in its spec but not in itself reports `TASK_AC_UNRESOLVED`. Cross-document resolution needs a declared spec-link field on plans, which does not exist yet (§3.4). The consequence worth naming outright: the check proves an id is *mentioned*, not that the criterion *exists*, so `AC-1` mistyped as `AC-11` passes silently whenever AC-11 is also mentioned. Typo-aliasing within a live id set is out of reach until cross-document resolution lands.
4. **`red=` is not executed.** The checks verify a declaration, never that the command runs or fails first. Executing arbitrary commands from a doc during a lint run is refused outright.
5. **Nothing here addresses S2 or S8.** Incomplete class sweeps and regressed round-repairs are cluster B and C work respectively.

6. **One declared depth cannot express a hierarchical task plan.** Some plans put task units at two depths. Reproduced against the tracked corpus:

   ```
   perl -ne 'if (/^(#{1,6})\s+(?:Task\s*\d|T\d)/) { $seen{$ARGV}{length($1)}++ }
     END { for $f (sort keys %seen) { @d=keys %{$seen{$f}}; print "$f\n" if @d>1 } }' \
     $(git ls-files 'docs/superpowers/plans/**/*.md' 'docs/superpowers/plans/*.md')
   ```

   Seven files, at depth pairs 2/3 and 3/4: `docs/superpowers/plans/alerts/2026-07-04-alert-at-a-glance-identity.md`, `docs/superpowers/plans/observability/2026-07-04-mutation-surface-observability.md`, `docs/superpowers/plans/schedule/2026-06-22-per-day-schedule-keytimes.md`, `docs/superpowers/plans/2026-07-25-section-header-rebuild-and-phantom-spacers.md`, `docs/superpowers/plans/data-quality/2026-07-15-feed-disposition-accept/00-overview.md`, `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/handoffs/M9-polish.md`, and `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-30-m12.2-admin-redesign/M12.2-recon1-banner-quieting.md`.

   A plan shaped like those must either normalize its task units to one depth or stay unenrolled; enrolling one depth would silently exclude the units at the other. Multi-depth enrollment is deliberately **not** specified here, because it forces a nesting model — a depth-3 task inside a depth-2 task extent — whose marker ownership, extent boundaries, and `TASK_MARKER_MISSING` semantics are a larger design than this cluster carries. Seven of 533 plans are affected, and enrollment is opt-in, so the limit costs nothing until someone enrols such a plan and is then told plainly rather than checked wrongly.

   Filed as `BL-TASK-ENROLLMENT-SINGLE-DEPTH` under **deferral exception (c)** of the class-sweep disposition rule in `AGENTS.md` — a redesign of a surface this PR does not otherwise touch. Item 7 below is the second shape of the same class and files under the same entry.

7. **A single region cannot exclude same-depth non-task headings interleaved among the tasks.** Distinct from limit 6, which is about task units at *different* depths. Derived, not hand-listed — a fence-aware scan that selects plans whose task-labelled headings occupy exactly one depth (multi-depth is item 6), then reports same-depth headings that are not task-labelled and fall strictly between the first and last task:

   ```
   depth of task-labelled headings == 1 distinct value
     AND a same-depth non-task heading with firstTask.line < h.line < lastTask.line
   ```

   Six plans match, reproduced independently of the review that raised it — grouping headers like `Tasks 5-22: A3-A20 (PROC each)`, and process sections like `Fix-round regression budget (mandatory per AGENTS.md)`. Region delimiters cannot exclude a heading that sits in the middle of the region:

   `docs/superpowers/plans/2026-07-26-stripcomments-shared.md`, `docs/superpowers/plans/admin/2026-07-07-admin-field-overrides/PLAN.md`, `docs/superpowers/plans/observability/2026-07-01-durable-outcome-telemetry.md`, `docs/superpowers/plans/observability/2026-07-02-observability-coverage-completion.md`, `docs/superpowers/plans/step3-onboarding/2026-06-11-onboarding-fixups/HANDOFF-NOTES-F5A.md`, and `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-30-m12.2-admin-redesign/M12.2-phase-b3-email-delivery.md`.

   Interloper counts run 1 to 5 per plan. Such a heading is classified as a task and draws `TASK_MARKER_MISSING`. That is a **conservative failure with a surfaced finding**, not silent corruption, so per the project's admissibility contract it files here rather than forcing a redesign: the author's remedy is to demote the grouping header a level or leave the plan unenrolled. Enrollment is opt-in, so nothing breaks until someone enrols a plan of this shape.

8. **`--lint-doc` reports are budgeted, so a large enough set is shown truncated.** §2.2.2 caps embedded reports at 200,000 bytes combined with an explicit notice. A reviewer handed a truncated report sees that it was truncated; they do not see the omitted findings. Raising the cap trades against the wrapper's 2,000,000-byte composition limit, which a full corpus-scale set would cross on its own.

   This is the one path on which an armed dispatch can still withhold findings, so it is exactly what §2.2.4's amended rule requires disclosure of: the `[truncated: N of M bytes shown]` notice is the disclosure, and it is why the amendment says "says how much was dropped" rather than merely permitting abridgement. `lintArm: "present"` on a truncated dispatch means the arm ran and reported honestly, never that the reviewer saw everything. Filtering does the real work — the corpus's worst report lands at 20 KB filtered against a 200 KB budget (§2.2.2) — so a truncated dispatch signals a pathological invocation worth looking at, not routine operation.
