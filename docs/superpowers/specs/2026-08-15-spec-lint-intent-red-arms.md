# spec:lint — citation-intent tiers and the red-executability contract

**Date:** 2026-08-15 · **Backlog:** `BL-SPEC-LINT-CITATION-INTENT` + `BL-SPECLINT-RED-EXECUTABILITY-ARM` (both in `BACKLOG.md`) · **Kind:** tooling (no UI, no DB, no runtime surface)

Two arms extending `pnpm spec:lint` (`scripts/spec-lint.ts`, core under `lib/specLint/`; governing spec `docs/superpowers/specs/2026-07-19-spec-lint.md`, task-region grammar amended by `docs/superpowers/specs/2026-08-09-task-enrollment-multi-region-design.md`):

1. **Citation intent** — today the linter proves a citation RESOLVES, never that it resolves to the RIGHT file. The sync-log arc carried mis-filed anchors through two adversarial rounds at zero hard findings, and the human R1 repair of that defect itself over-corrected eight correct citations (§2.1). This arm upgrades the symbol-proximity advisory from an ignorable noise channel into a tiered, evidence-bearing report.
2. **Red executability** — the task-marker contract is red-then-green on the same command, but nothing observes redness. Three merged filings measured `red=` commands that already exit 0, markers never observably red, and commands that can never go green. This arm adds a declared red-contract marker grammar, static cycle-breaker checks, and an opt-in execution mode.

## 1. Scope

### 1.1 Explicitly resolved scope decisions (do not relitigate)

1. **Citation-intent findings are ADVISORY, both tiers — ratified by measurement, not caution.** The probe corpus (§2.2) shows a hard tier is impossible: on the review-approved, merged sync-log plan, the strictest content condition (every same-line identifier absent from the ENTIRE cited file, word-boundary-matched) still fires on 15 of 135 correct citations, because plans legitimately cite lines where code WILL go and name identifiers the plan itself introduces (`durationMs` in that corpus). A hard code with an 11% false-positive floor on correct documents gets waived reflexively and re-permits the defect (governing spec §1.1 item 1). This extends the ratified "symbol-proximity matching is advisory" decision (governing spec §1.1 item 3) with corpus numbers; do not re-propose a hard tier without a discriminator measured to do better on this corpus.
2. **The recall ceiling is a documented limit, not a defect.** Two of the seventeen measured wrong-file citations (§2.2 rows `221:719`, `221:1001`) are undetectable by ANY content comparison: the wrong file is a vocabulary-sharing sibling that boundary-matches the prose identifiers near the cited lines. The measured R1 human repair made the mirror-image error on eight citations for the same reason. A reviewer proposing a tightening that claims these two must present a probe demonstrating it (round-economy admissibility, `AGENTS.md`).
3. **Red-contract enrollment is DECLARED, never inferred — region attribute plus marker fields.** The task-contract grain rule (`docs/agents/spec-self-review.md:36`) applies unchanged: no recognizer over task prose decides whether a `red=` is "asserted red now" or "authored by the task". The author declares it (`red-state=`, §4.2). A wrong declaration is out of threat model (item 8).
4. **Execution mode is opt-in per invocation (`--exec-red`) and runs only markers declared `red-state=live`.** A `red=` may cost minutes; the default invocation stays static. This is the shape the backlog row itself mandates ("opt-in per invocation, since a `red=` may be expensive").
5. **Execution trusts the plan's commands.** `--exec-red` runs author-written shell commands from the linted doc, exactly as the operator would when following the plan. The operator chooses the doc and the flag; the linter adds no sandbox. Heavy-phase discipline (`AGENTS.md` slot semaphore) stays the CALLER's responsibility: authors write scoped red commands; an operator lint-executing a plan whose reds are full-suite runs wraps the `spec:lint` invocation itself in `pnpm heavy`.
6. **The authored-red branch verifies the DECLARATION, not the defect.** For `red-state=authored`, the arm checks a `red-target=` names the production surface in one of §4.2's two forms (a tracked file with an in-range line, or an untracked path declaring a not-yet-created module). Whether that production line is genuinely "absent or defective" is semantic judgment and stays with the plan-review citation pass (governing spec §1.2 first bullet). Mechanizing existence-of-declaration is this arm; mechanizing truth-of-claim is not.
7. **Marker grammar widens globally; requirements apply only inside red-contract regions.** The v2 fields (§4.2) are legal on any marker anywhere (one grammar, no per-region parse forks), but their PRESENCE is required only in regions opened with the `red-contract` attribute. Legacy enrolled plans (30 tracked plans, 205 markers, measured 2026-08-15 per §2.3) relint with byte-identical TASK-CONTRACT findings; their citation advisories change for every doc by design (§3.5 upgrades the details), so the regression contract is per check group, not whole-report.
8. **Threat model: accidental authoring mistakes by an ordinary contributor.** Adversarial obfuscation — a false `red-state` declaration, a `why=` that lies, prose engineered to defeat boundary matching — is out of scope and files to documented limits (§8). This fence is load-bearing for convergence: a wider recognizer is a bigger target for the next round.
9. **Consequence bound (convergence criterion).** Every input is handled correctly OR signaled, never silently wrong: a marker the grammar cannot parse is a hard finding (fail-closed within the declared domain, mirroring the governing spec's §1.1 item 10 posture); a citation with no same-line identifier spans is OUTSIDE the arm's accept-set and stays silent: there is nothing to compare, and an unconditional advisory on that class would fire on 27 of 165 line-bearing citations of the merged correct plan (measured 2026-08-15) — re-creating the noise channel §2 exists to close. The backlog sketch's "demote to advisory when the sentence names none" is satisfied by the whole arm being advisory; the id-less case is documented limit §8 item 11. A conservative demote plus a surfaced advisory is a DOCUMENTED LIMIT, not a finding. Mechanical convergence for the two new lib modules is the mutation score plus an empty unaccepted-survivor set (§7).
10. **No CI gate, no legacy relint** — unchanged from the governing spec (§1.1 items 2, 10). Both arms are point-in-time pre-dispatch tools.
11. **Gate-command grammar ships minimal.** Arm (c) of the backlog row needs somewhere for a plan to DECLARE a gate command before the linter can list unprobed ones; the corpus has no such convention (2 gate-shaped prose lines across all plans). §4.6 defines a one-line `<!-- gate: … -->` marker and one advisory. Anything richer (gate taxonomies, probe-evidence verification) waits for usage.
12. **No new dependencies; no TypeScript compiler API.** Enclosing-symbol extraction is the upward regex scan measured in §2.2 (declaration keywords, SQL `create`, markdown headings). It resolved a name on every probed row; its known misses are documented limits (§8). This keeps the governing spec's §1.1 item 7 posture.

### 1.2 Out of scope

- Semantic verification that a cited line's content supports the prose claim (unchanged, governing spec §1.2).
- Repo-wide identifier indexing or cross-file search beyond the doc's own resolved citation set (§3.4 relocation hints are bounded to files the doc already cites).
- Running `red-state=authored` commands, ever (their failing case does not exist at plan time by declaration).
- Auto-fixing; wiring either arm into CI; relinting the legacy corpus.
- `BL-SPECLINT-PROSE-COUNT-PARITY` (owned by branch `feat/speclint-prose-count-parity`, live on origin).

## 2. Measured calibration (probes are the design inputs)

All numbers measured 2026-08-15 on this branch's worktree; probe scripts and full transcripts in the arc scratchpad (`probe1-badplan-lint.txt`, `probe4-bad.txt`, `probe4-finalplan.txt`); the corpus is committed git history, so every run is reproducible from the shas below.

### 2.1 The ground-truth corpus

The sync-log arc's plan exists in three relevant states in `origin/main` history:

- **Known-bad**: the parent of the R1 citation repair (commit `225d37fa4^`, plan at `docs/superpowers/plans/observability/2026-08-09-sync-log-show-attribution.md`) — the text plan reviews R1/R2 judged, carrying the bulk-sweep mis-filings.
- **R1-repaired**: commit `225d37fa4` — itself over-corrected: it moved eight lib-file citations to `tests/sync/runScheduledCronSync.test.ts` that the final plan settled BACK to `lib/sync/runScheduledCronSync.ts` (its `SyncLogEntry` type genuinely sits at the cited lines). The repair inherited the same blind spot as the original error, which is the backlog row's own warning about verifiers written by the defect's author.
- **Final** (merged, approved through eleven plan rounds plus whole-diff rounds): the ground truth. A known-bad citation instance is WRONG iff the final plan settles a different path for the same prose.

That rule yields **19 wrong instances** (9 sites-list rows plus a do-not-touch row and a sole-emission row that belong to `lib/sync/runOnboardingScan.ts` and `lib/sync/runManualStageForFirstSeen.ts`, 1 migration row belonging to `supabase/migrations/20260629000002_app_events.sql`, and 8 rows belonging to `tests/db/_metaDestructiveDbTargetGuard.test.ts`), of which **17 carry same-line identifier spans** and are classifiable; the 11 the review findings named are a subset. The 61 remaining line-bearing identifier-carrying citations of the known-bad plan, and all 135 of the final plan (read at its last-touch commit `3f42b004b`), are the negative corpus.

### 2.2 What fires, per candidate condition

Identifier matching for every condition below: word-boundary regex per identifier (`(?<![A-Za-z0-9_$])id(?![A-Za-z0-9_$])`), dotted identifiers additionally matched per segment of length ≥3 (`SyncLogDeps.logSync` also tries `SyncLogDeps` and `logSync`). This discipline is itself calibrated: naive substring matching (the shipped `citations.ts` behavior) both false-clears wrong citations (`deps` matches anything) and false-fires correct ones (`SyncLogDeps.logSync` appears nowhere as a literal).

| condition | wrong detected (of 17) | false fires, known-bad negatives (of 61) | false fires, final plan (of 135) |
| --- | --- | --- | --- |
| not in ±5 window (current shape, boundary-matched) | 15 | 11 | 54 |
| …and not the enclosing declaration name | 15 | 10 | 50 |
| …and nowhere in the cited file ("absent") | 5 | 10 | 15 |

Readings, each load-bearing for the design:

- The current shipped advisory ALREADY fires on most wrong citations — and on 69 spans of the merged correct plan against today's tree (probe 1). Detection is not the gap; **discrimination and actionability are**. The signal was present in the R1 dispatch and scrolled past as noise.
- The enclosing-name rescue clears real false fires (54→50) at zero recall cost: a correct citation deep inside a long function whose declaration sits far above the ±5 window is the commonest benign miss.
- The "absent from the whole file" condition is high-signal but neither necessary nor sufficient — 5/17 recall, 11% false-fire floor on correct plans (future-code citations). It earns a DISTINCT advisory tier, not a hard code (§1.1 item 1).
- The two undetectable wrong rows (§1.1 item 2) window-hit inside the wrong file by genuine vocabulary overlap.

### 2.3 Red-contract corpus

Measured 2026-08-15 over tracked plan files (`git ls-files 'docs/superpowers/plans/'`, `.md` only, counted with the shipped parser's non-fenced marker-shaped semantics): 30 enrolled plans, 205 task-marker lines. 6 markers (2.9%) carry `&&`-conjoined red commands — low enough that an advisory on the shape is signal, not noise. 10 distinct `tests/**` files named in `red=` commands do not exist on the live tree (the ordinary authored-new-file shape the execution exemption exists for). 23 `git mv` / `git rm` lines appear in plan bodies (the retired-target static shape has a real corpus). Reachability of the defect class is already PROBED by the three merged filings cited in the backlog row (quick-wins-2 plan R1: four of fourteen findings were `red=` commands that already exit 0; classname plan R3–R5: markers never observably red or never green; resurrect-mobile-safari: gate commands exiting 0 on the failure they name).

## 3. Arm 1 — citation intent (new `citationIntent` module + changes in `lib/specLint/citations.ts`)

### 3.1 Accept-set

The arm classifies exactly the citations the shipped symbol-proximity pass classifies: line-bearing, resolved, readable, in-range, non-inverted citations on non-fenced lines that share their doc line with at least one prose identifier span (`/^[A-Za-z_$][A-Za-z0-9_$.]*$/`, non-candidate). Everything outside that set is untouched by this arm: citations with no same-line identifiers stay silent (§1.1 item 9, §8 item 11), and every hard-finding path in `checkCitations` is unchanged.

### 3.2 Matching discipline (replaces naive substring)

As calibrated in §2.2: word-boundary regex per identifier; dotted identifiers additionally per-segment with segments shorter than 3 characters skipped. Case-sensitive. Identifiers are regex-escaped before interpolation — `.` and `$` are legal identifier characters and must match literally (an unescaped `foo.bar` would match `fooXbar` and classify a wrong citation clean). Applied uniformly to the window test, the enclosing-name test, the whole-file test, and relocation hints.

### 3.3 Tier classification

For each accepted citation, in order; first match wins:

1. Any identifier matches within lines `[start-5, end+5]` of the cited file (clamped) → **clean**.
2. Any identifier matches the enclosing declaration name → **clean**. The enclosing name is found by scanning upward from `start` for the first line matching, in order tried per line: the TS declaration shape (`^(export )?(async )?(function|const|let|var|class|interface|type|enum) NAME`), the SQL shape (`create [or replace] function|table|trigger|index|policy|view [schema.]NAME`, case-insensitive), or an ATX heading (whose full text is the name). No match by line 1 → no enclosing name, tier check proceeds.
3. Any identifier matches anywhere in the cited file → **ADVISORY `CITATION_SYMBOL_UNMATCHED`** (code retained; message and detail upgraded per §3.5).
4. Otherwise → **ADVISORY `CITATION_SYMBOL_ABSENT`** (new code): no named identifier appears anywhere in the cited file.

### 3.4 Relocation hints (the actionability payload)

For a tier-4 finding, the arm searches each identifier (same discipline) across the OTHER files this doc's citations resolved to (the `resolvedPaths` set `checkCitations` already accumulates, deduplicated, minus the cited file). Files where any identifier matches are listed in the finding detail, capped at 3 paths in doc order. Peers are read on demand through the injected resolver (at most one read per distinct resolved path, cached by the adapter); a peer whose read returns `null` (unreadable or a tracked symlink) is skipped — omitted from hints, no finding. This is the "found in `runOnboardingScan.ts`" line that turns a shrug into a fix; it never leaves the doc's own citation set (§1.2). On the measured corpus the wrong sites-list rows relocate to `lib/sync/runOnboardingScan.ts`, which the known-bad plan already cites elsewhere.

### 3.5 Report shape

Tier-3 message: `no same-line identifier found near <citation>` (unchanged text, so existing operator reflexes keep working); detail gains the enclosing name: `cited line: <first cited line, trimmed to 160> · enclosing: <name or "(none)">`. Tier-4 message: `same-line identifiers absent from <path>`; detail: `enclosing: <name or "(none)"> · identifiers: <list> · found in: <up to 3 relocation paths, or "none of the doc's other cited files">`. Both stay `check: "citations"`, severity `advisory`, anchored at the citation span (docLine, column) like today.

## 4. Arm 2 — red contract (new `redContract` module + `lib/specLint/taskContract.ts` grammar widening)

### 4.1 Region enrollment

The region-opening grammar gains one optional attribute: `<!-- tasks: depth=N red-contract -->` (exact token, same prefix/suffix conventions as the existing forms in `taskContract.ts:25-28`). A region so opened is a red-contract region; §4.3's presence requirements apply to every marker it owns. The bare `depth=N` form is unchanged. A `tasks:`-prefixed line matching neither form stays `TASK_ENROLL_MALFORMED` (existing fail-closed catch-all — the accept-set is the two forms, everything else is rejected by name).

### 4.2 Marker grammar (one grammar, global)

The marker grammar widens to, in fixed field order with single spaces:

```
<!-- task: red=`CMD` [red-state=live|authored] [red-target=`PATH[:LINE[-LINE]]`] [why=`TEXT`] ac=IDS -->
```

- `red=`, `ac=` — exactly the shipped grammar (`taskContract.ts:34-45`), including the empty-command and missing-ac precedence codes.
- `red-state=` — literal `live` (the failing case exists on the tree at plan time; the SAME command must be observable red today) or `authored` (the task itself writes the failing case — a new test file or a new case in an existing suite).
- `red-target=` — a backtick-delimited FULL-PATH citation naming the production surface whose absence or defect makes the authored red fail: either the colon form (governing spec §4 — tracked file, in-range line, the defective-line case) or the path-only form naming a file that must NOT be tracked (the new-module case — the production file itself is absent; a path-only target that IS tracked is `RED_TARGET_INVALID`, detail saying to cite the defective line). Bare-filename shorthand is not legal in either form, since a marker line offers no anchor context. The capture uses the same character rule as `red=` — any non-backtick text, whitespace included — so a blank or malformed value parses as PRESENT and fails semantically as `RED_TARGET_INVALID` (§4.3), never as `TASK_MARKER_MALFORMED`.
- `why=` — non-empty free text: the one-line "what is red and why" statement, machine-checked for presence only (§8 documents that its truth is not verified).

A marker with v2 fields in a NON-contract region parses fine and draws no presence findings (§1.1 item 7). A marker line that is marker-shaped (`<!-- task:` prefix) but matches neither the v1 nor the v2 grammar remains `TASK_MARKER_MALFORMED` — the widened grammar is the accept-set; there is no third form.

### 4.3 Static checks (all hard)

Two scopes, matching §1.1 item 7's validity-global / presence-regional split. PRESENCE checks (`RED_STATE_MISSING`, `RED_WHY_MISSING`, `RED_TARGET_MISSING`) run per owned, well-formed marker inside red-contract regions, after the shipped cardinality/classification pass. VALIDITY checks (`RED_TARGET_INVALID`) run on every well-formed v2 marker in a plan-kind doc that carries the field — enrolled or not, inside a region or not — because §5 excludes the `red-target=` span from the citation pass globally in plans, and the validation IS its replacement (probed in review round 5: without this scope, an outside-region invalid target loses today's `CITATION_FILE_MISSING` with nothing in its place):

- `RED_STATE_MISSING` — marker has no `red-state=`.
- `RED_WHY_MISSING` — marker has no `why=`, or its capture is empty or whitespace-only (the character grammar admits an empty capture, exactly as the shipped `red=` does — `TASK_RED_EMPTY` is a semantic check at `lib/specLint/taskContract.ts:233-235`, not a grammar rejection; every new backtick field takes the same split, enumerated here so none silently admits blank: empty/blank `why=` → this code; empty/blank `red-target=` → `RED_TARGET_INVALID`; empty/blank gate `cmd=` → `GATE_CMD_EMPTY`; empty/blank gate `probed=` → `GATE_UNPROBED`, §4.6).
- `RED_TARGET_MISSING` — `red-state=authored` with no `red-target=`.
- `RED_TARGET_INVALID` — `red-target=` present but invalid for its form (§4.2): a COLON-form target that is malformed (bare-filename shorthand included), untracked, unreadable, out of range, or range-inverted; a PATH-ONLY target that IS tracked (that form declares an absent production file — cite the defective line instead) — verified through the SAME resolver machinery as prose citations (`checkCitations` semantics; the marker citation does not enter `resolvedPaths` or the anchor list, so it cannot anchor prose shorthands). One code with the specific reason in `detail`, because the repair is identical in every case: fix the target.

`red-state=live` with an existing green target is deliberately NOT a static check — greenness is unknowable statically; that is what §4.4 is for.

### 4.4 Execution mode (`--exec-red`)

New CLI flag, usage error unless the resolved kind is `plan`. When set, the adapter executes the `red=` command of each `red-state=live` marker that is OWNED by a task extent inside a red-contract region — the §4.3 PRESENCE-check population, deliberately narrower than the global validity population (a validity-checked outside-region marker is never executed); live-declared markers in bare regions, orphaned markers, and markers in plans with no well-formed region are never executed (in doc order, sequentially) via `sh -c`, cwd the repo root, operator environment inherited, stdout captured and discarded, stderr captured for the 200-char detail tail, with a per-command ceiling of 600 seconds (overridable through the `SPEC_LINT_EXEC_TIMEOUT_SECS` env var — the documented test seam, since a 600-second case is untestable; when set, the value must match `[1-9][0-9]*` — positive integer seconds — and ANY other value, empty and whitespace included, is a usage error naming the variable, exit 2, nothing linted and nothing executed: a malformed ceiling must never silently disable or zero the timeout), and hands the core the outcomes:

- exit 0 → **hard `RED_ALREADY_GREEN`** at the marker line: the plan asserts this command fails today and it does not.
- exit 126 or 127 → **advisory `RED_EXEC_ERROR`** (command unrunnable — proves nothing about redness; detail carries the exit code and the tail of stderr, trimmed to 200 chars).
- timeout → **advisory `RED_EXEC_TIMEOUT`** (redness unverified).
- signal-terminated or spawn failure → **advisory `RED_EXEC_ERROR`**, detail naming the signal or spawn error. A killed command proves nothing about redness; classifying it as observed red would be the silent corruption this arm exists to prevent.

The raw `spawnSync` result is NOT a set of mutually exclusive fields — a `SIGTERM`-ignoring child overruns the ceiling and returns `status: 0` WITH `error: ETIMEDOUT` (probed in review round 4) — so classification precedence is normative and error-first: (1) `error` present → `ETIMEDOUT` classifies as timeout, anything else as spawn-error, REGARDLESS of `status`/`signal` (a command that exceeded the ceiling was not observed under the contract, whatever it eventually exited); (2) else `signal` present → signal; (3) else `status` is the exit code. The ceiling itself is best-effort: `spawnSync`'s timeout sends `SIGTERM`, and a signal-ignoring command runs until it exits (documented limit §8 item 14) — the classification is still timeout.
- any other non-zero exit → clean: red observed, no finding.

Without `--exec-red`, live markers draw no execution findings (§1.1 item 4). `--exec-red` on a plan with zero live markers runs nothing and is silent.

### 4.5 Advisory shapes, red-contract regions only

- `RED_TARGET_RETIRED` — some tracked-path-shaped token in the marker's `red=` command (a token matching the governing spec's citation path rule whose text is a member of the tracked-file set) also appears as the object of a `git mv <path> ...` or `git rm <path>` command in the SAME task extent's fenced code. The shape usually breaks the red-then-green cycle (the same command never passes after the move) — but not always: a negative-existence red (`test ! -e <path>`) goes green PRECISELY because of the move, and a cross-task search would flag earlier tasks that legitimately complete before a later task moves the file (both probed in review round 3). Advisory therefore, same-extent-scoped; the author dispositions it.
- `RED_CONJUNCTION` — the `red=` command contains `&&`. When the expected failure sits in a non-final conjunct, later conjuncts are never observed at red time and the conjunction as a whole is the green criterion; the marker asserts red the author never saw. Advisory because the shape has legitimate uses (measured 6 of 205 markers, §2.3); the finding says what to check, not that it is wrong.

### 4.6 Gate markers (minimal, §1.1 item 11)

A non-fenced line whose entire trimmed content is `<!-- gate: cmd=`CMD` [probed=`TEXT`] -->` (same character rules as `red=`) declares a gate command — a merge gate, closeout check, or CI probe the plan tells a human to run. Legal anywhere in a plan (not owned by task extents). An empty or whitespace-only `cmd=` capture → **hard `GATE_CMD_EMPTY`** (a blank gate declaration is the fail-open shape itself). `probed=` absent, empty, or whitespace-only → **advisory `GATE_UNPROBED`**: the command carries no "probed against a constructed failing input" annotation, the exact fail-open class the resurrect-mobile-safari filings measured (a bare `gh run list`, a `test -z` over an emptied diff, a fail-open shell chain — each exits 0 on the failure it names). A `gate:`-prefixed line matching neither shape → **hard `GATE_MALFORMED`** (fail-closed in the declared domain). Gate commands are never executed by `--exec-red` (their failing input is constructed, not ambient; execution semantics would be a lie).

## 5. Architecture & purity

```
scripts/spec-lint.ts             # + --exec-red flag; subprocess execution (sh -c, timeout, outcome map)
lib/specLint/citationIntent.ts   # NEW: matching discipline, enclosing-name scan, tier classify, relocation
lib/specLint/citations.ts        # checkCitations calls citationIntent for the advisory pass (hard paths untouched)
lib/specLint/redContract.ts      # NEW: v2 field parse, static checks, gate markers, exec planning + synthesis
lib/specLint/taskContract.ts     # grammar widening ONLY (region attribute + optional marker fields); ownership/cardinality untouched
lib/specLint/run.ts              # wires redContract findings into the taskContract check group; carries exec results through
lib/specLint/types.ts            # exec-outcome types (no runner type crosses the core boundary)
```

- **Purity holds.** `lib/specLint/**` still imports no `node:fs` / `node:child_process` / `node:process` (`tests/specLint/_metaPureCore.test.ts` walks the directory and covers the new files by default). Execution is OUTCOME-injected: a pure core function derives the execution plan (doc-ordered live markers and their commands); the adapter alone runs subprocesses and hands the core a marker-line-to-outcome map; a second pure function synthesizes findings from that map. No function value performs I/O inside the core, so determinism (same doc + same resolver state + same outcome map, same result) holds by construction.
- **Marker-line spans never enter the citation pass.** Today `parseDoc` extracts inline spans from every non-fenced line, so a `red-target=` field would be resolved, anchor-seeded, and relocation-fed as if it were prose — probed live during review round 1. The exclusion is SPAN-level and covers exactly the `red-target=` captures of well-formed v2 markers in PLAN-kind docs — the one capture that IS a citation and gets its own verification. The orchestrator (`lib/specLint/run.ts`) obtains those capture coordinates from the recognizer the `redContract` module exports and passes them to `checkCitations`, whose span loop skips exactly those spans: never candidates, never resolving, never anchoring a shorthand, never feeding relocation. Every OTHER capture — `red=`, `why=`, gate `cmd=`, gate `probed=` — keeps today's citation behavior unchanged (probed in review round 4: a citation-shaped span in any of those captures draws `CITATION_FILE_MISSING` today, and no replacement validation exists for them, so excluding them would be a silent false negative; review round 3 probed the same for spec-kind and no-region-plan lines, which this span-scoping leaves untouched by construction). The replacement path for the excluded span is guaranteed by making FIELD VALIDITY global where the module runs: `redContract` validates a PRESENT `red-target=` on every well-formed v2 marker in a plan-kind doc, enrolled or not — §1.1 item 7's split is 'validity is global, presence requirements are regional.' In spec-kind docs the module does not run and marker-shaped lines keep today's citation behavior entirely (§8 items 12-13). Legacy impact: none — v1 markers have no `red-target=` capture, so no v1 span changes candidacy.
- **One grammar, one owner.** `taskContract.ts` keeps sole ownership of region and marker RECOGNITION (its regexes widen); the `redContract` module consumes the recognized marker lines plus the region kind and owns v2 FIELD semantics. The marker field regex fragments are exported constants shared between the two modules, so the grammars cannot drift apart.
- **Finding plumbing.** Red-contract findings report `check: "taskContract"` (they are task-contract findings; the report section and CHECK_ORDER in `lib/specLint/run.ts:10-17` are unchanged). Citation-intent findings stay `check: "citations"`. No new check groups, no report-format changes beyond the detail upgrades of §3.5.
- **`taskContract.ts` is an enrolled mutation surface** (`tests/mutation/source/registry.ts`, id `taskContract`, floor 0.95): the grammar widening re-runs `pnpm mutation:guards`, re-anchors moved accepted-survivor rows 1:1 (operator + `from>to` preserved — the 2026-08-09 precedent documented in the registry), and lands with the score and an empty unaccepted-survivor set.

## 6. Testing

All under `tests/specLint/`, TDD per task, anti-tautology rules of `docs/agents/writing-plans.md` in force (every fixture plants a specific defect; assertions name exact code + line + column derived from the fixture's construction; premises stated executably via `tests/_shared/premise.ts` where an assertion rests on a fixture property).

- **Citation-intent unit suite** (new `citationIntent` test file under `tests/specLint/`): matching discipline (boundary hit vs substring near-miss both directions; dotted segmentation; short-segment skip); enclosing-name scan (TS shapes incl. `export async function`, SQL create, markdown heading, no-match-by-line-1); each tier boundary crossed both ways (window edge at exactly ±5; enclosing rescue; file-hit vs absent); relocation hints (found in doc-cited file, cap at 3, none found, cited-file itself excluded); demotion (no same-line identifiers → silence).
- **Ground-truth fixture** (`tests/specLint/fixtures/citationIntent/`): a structure-preserving distillation of the §2 corpus — for each of the 17 classifiable wrong instances and a representative negative set, a fixture doc line plus fixture cited-files reproducing the window/enclosing/file-presence structure at small line numbers (fixture trees are stable forever; live-code citations drift — governing spec §8). The suite pins: 15 wrong instances fire (each at its expected tier), the 2 vocabulary-sibling escapes stay silent WITH a premise comment naming §1.1 item 2, and the negative rows stay clean. Deriving the fixture from the measured corpus rather than inventing cases is the point: the arm is validated against the citations that actually burned rounds, per the backlog row's explicit instruction.
- **Red-contract unit suite** (new `redContract` test file + `tests/specLint/taskContract.test.ts` extensions): region attribute recognized / bare form unchanged / malformed attribute rejected; every §4.3 code fired and not-fired (state present, why present, target present-and-valid in BOTH forms (colon form on a tracked in-range line; path-only form on an untracked path — the positive case), target each invalid reason per form, retired-target advisory hit via fenced `git mv` and `git rm` in the SAME extent, with a cross-extent move and a non-fenced mention each NOT firing); v2 fields outside contract regions drawing no PRESENCE findings, while a present `red-target=` there is still validity-checked (an INVALID outside-region target → `RED_TARGET_INVALID` — the round-5 case — and a valid one draws nothing); v1 markers inside contract regions drawing exactly the presence codes; `RED_CONJUNCTION` on `&&` only; gate marker shapes (well-formed with/without probed, malformed prefix line); blank-capture cases for ALL four new fields, each tested PRESENT-but-blank in both the empty and whitespace-only spellings, distinctly from the absent-field cases: `why=` → `RED_WHY_MISSING`, `red-target=` → `RED_TARGET_INVALID`, gate `cmd=` → `GATE_CMD_EMPTY`, gate `probed=` → `GATE_UNPROBED`; field-order and single-space strictness (a reordered marker is malformed); v1 semantics preserved ON the v2 form — an empty v2 `red=` still `TASK_RED_EMPTY`, an absent `ac=` on an otherwise well-formed v2 marker still `TASK_AC_MISSING` (including the shipped double-defect precedence), v2 `ac=` ids still resolve with the self-resolution exclusion, v2 markers still count for duplicate/cardinality; and one mixed plan holding a bare region AND a `red-contract` region, proving presence checks and execution eligibility are region-local, not document-global.
- **Execution suite** (pure core, fake outcome maps): the planning function enumerates live markers in doc order and EXCLUDES authored markers (asserted on the plan itself; no runner or spy exists at this layer); synthesis maps exit 0 to hard `RED_ALREADY_GREEN`, 126/127 to `RED_EXEC_ERROR`, the timeout token to `RED_EXEC_TIMEOUT`, the signal and spawn-error tokens to `RED_EXEC_ERROR` (detail naming which), other non-zero to silence; a null outcome map (static invocation) yields no execution findings.
- **CLI adapter tests** (`tests/specLint/cli.test.ts` extensions, committed fixture docs; real subprocess, trivial commands only — no test may execute a heavy phase): `--exec-red` on a spec → exit 2; duplicate `--exec-red` → exit 2; live marker with `exit 0` → exit 1 with `RED_ALREADY_GREEN`; `exit 1` → exit 0 (red observed); `exit 126` and `exit 127` → advisory `RED_EXEC_ERROR` each; a `sleep`-past-ceiling command under `SPEC_LINT_EXEC_TIMEOUT_SECS=1` → advisory `RED_EXEC_TIMEOUT` (also proves the ceiling is enforced through the seam); a command writing `$PWD` to a scratch file proves repo-root cwd; a command using a shell construct (e.g. `exit $((125+2))`) proves `sh -c`; a command emitting more than 200 chars on stderr before exit 127 gets its detail tail trimmed to 200; a self-killing command (`kill -TERM $$`) → advisory `RED_EXEC_ERROR` naming the signal; `SPEC_LINT_EXEC_TIMEOUT_SECS` set to `0`, `-1`, `abc`, and empty → exit 2 naming the variable, each. The adapter's spawn-result classification (`spawnSync` result → outcome token) is an EXPORTED pure helper, unit-tested with constructed results — `{status: null, signal: null, error: ENOENT}` → spawn-error token, `{status: 0, error: ETIMEDOUT}` → timeout token (the round-4 hybrid: error-first precedence), `{status: null, signal: "SIGTERM"}` → signal token, `{status: 0}` → exit 0 — because a real ENOENT on `sh` itself is not constructible in a test environment while the misclassification it invites (silently reading a spawn failure as observed red) is exactly what §4.4 forbids.
- **Wiring suite** (`tests/specLint/run.test.ts` extensions, mirroring the existing cross-checker plumbing cases at `tests/specLint/run.test.ts:138`): one fixture doc driven through `runLint` (and one through the real CLI) per new surface — a `CITATION_SYMBOL_ABSENT` advisory with relocation detail, a §4.3 hard code, a gate code, and the §5 span exclusion — proving the new modules are actually plumbed into the orchestrator and report under the right check groups, not merely correct in isolation.
- **Dogfood**: this spec exits 0 under `pnpm spec:lint` with zero hard findings, attached to every review dispatch per `docs/agents/spec-self-review.md:25`.

## 7. Mutation enrolment (before first review dispatch, per AGENTS.md)

The `citationIntent` and `redContract` modules are authored as importable modules with referring suites FROM THE START and enrolled in `tests/mutation/source/registry.ts` in the same PR — one row each, full operator set, floor 0.95 (matching `taskContract`), a per-surface control mutation, and an empty unaccepted-survivor set. The plan runs `pnpm mutation:guards` before its first review dispatch and states the scores in the round-1 brief; findings claiming "the guard does not pin what it claims" are admissible only with a surviving mutant from the declared operator set (AGENTS.md convergence contract). The `taskContract` surface's re-run and ledger re-anchoring ride the same task (§5).

## 8. Documented limits (round 0)

1. **Vocabulary-sharing sibling** (§1.1 item 2): a wrong file that boundary-matches the prose identifiers near the cited line is indistinguishable from a right one by content. Measured: 2 of 17.
2. **Future-code citations**: plans citing lines where code will go legitimately name identifiers absent from today's file; `CITATION_SYMBOL_ABSENT` fires as an advisory the author answers with "it’s new" (measured floor: 15 of 135 on a correct plan). This is the surfaced-warning half of the consequence bound, not a defect.
3. **Enclosing-name heuristic**: the upward regex scan misses arrow functions assigned inside object literals, nested scopes (it reports the nearest enclosing DECLARATION LINE, which for a deeply nested method may be an outer symbol), and files whose declarations match none of the three shapes; the result is a `(none)` or an outer name in an advisory's detail, never a hard finding.
4. **Declared red-state is trusted** (§1.1 items 3, 8): an author declaring `authored` for a guard test that is already green defeats the arm; so does a `why=` that lies. The contract makes the claim EXPLICIT and reviewable; it does not prove it.
5. **`red-target` truth**: the existence half IS mechanical (colon form: tracked + in-range; path-only form: untracked), but whether the named surface is genuinely what makes the authored red fail stays judgment (§1.1 item 6).
6. **`RED_CONJUNCTION` is advisory by design**: a conjunction can be a legitimate green criterion; the arm surfaces the shape, the author dispositions it.
7. **Retired-target detection is advisory, exact-token, fenced, same-extent**: a prose instruction ("delete the old suite"), a renamed path spelled differently, or a cross-task move escapes; conversely a negative-existence red (`test ! -e <path>`) legitimately goes green by the move and draws the advisory anyway. Both directions are the price of a decidable shape; widening to prose recognition is the recognizer-over-prose shape this tool's design forbids, and hardening it re-opens the round-3 false positives.
8. **Execution observes exit codes, not reasons**: a `red=` failing for an unrelated reason (missing env, wrong cwd) reads as red. `RED_EXEC_ERROR` catches the unrunnable subset (126/127); beyond that the linter keeps no command output (stdout is discarded, §4.4) — an operator who doubts a red observation re-runs the command directly, outside the linter.
9. **Gate probing is declared, not verified**: `probed=` text is presence-checked only.
10. **Doc-order sequential execution**: `--exec-red` runs commands one at a time; a plan with many live reds is slow by construction. The flag is per-invocation opt-in precisely so this cost is chosen, not ambient.
11. **Id-less citations stay silent** (§1.1 item 9): a line-bearing citation whose doc line names no identifier is outside the intent arm's accept-set — nothing to compare, no signal. Measured cost of the alternative: 27 unconditional advisories on the merged correct plan.
12. **Gate markers are plan-kind only**: the red-contract check group runs for plan-kind docs (like the shipped task contract, `lib/specLint/taskContract.ts:74`); a `gate:`-shaped line in a spec is ordinary prose — its spans keep today's citation behavior (§5 exclusion never applies to spec-kind docs). Specs declare no gates; extending the grammar there waits for a use.
13. **V2 fields in spec-kind docs are prose spans**: the red-contract module runs only for plan-kind docs, so a marker-shaped line in a spec keeps today's citation behavior on every span. In plans, a present `red-target=` is validated wherever the marker is well-formed (§5); the presence REQUIREMENTS still bind only in `red-contract` regions.
14. **The execution ceiling is best-effort**: `spawnSync`'s timeout delivers `SIGTERM`; a signal-ignoring command overruns until it exits, and its outcome still classifies as timeout by the §4.4 error-first precedence. Bounding hostile commands is out of threat model (item 8).

## 9. Wiring & docs (same PR)

- `package.json`: no new script (flag rides the existing `spec:lint`).
- `docs/agents/writing-plans.md`: the red-executability bullet gains one sentence naming the mechanical arm (`red-contract` regions, `--exec-red`) as landed, replacing "Mechanical arm filed as `BL-SPECLINT-RED-EXECUTABILITY-ARM`."
- `docs/agents/spec-self-review.md:36` task-contract block: one sentence noting the optional `red-contract` region attribute and v2 marker fields, with a pointer to this spec.
- `BACKLOG.md`: both rows archived per house convention (marker off in the PR's last commit, invariant 12).
- `docs/superpowers/specs/README.md` (specs index): one row for this spec.
- codex-guard `--lint-doc` needs no change (it invokes `spec:lint` without `--exec-red`; execution stays operator-driven).

## 10. Acceptance criteria

- AC-1: the ground-truth fixture suite pins 15 wrong-instance findings at their exact tiers, 2 premise-guarded silent escapes, and a clean negative set (§6).
- AC-2: `CITATION_SYMBOL_ABSENT` relocation detail names the wrong-site's true home when the doc cites it elsewhere, capped at 3.
- AC-3: matching is word-boundary + dotted-segment + regex-escaped everywhere the arm compares identifiers (window, enclosing, file, relocation) — one shared implementation, pinned by tests that fail on substring semantics in any of the four AND on unescaped-metacharacter semantics (raw `foo.bar` matching `fooXbar`).
- AC-4: every §4.3/§4.4/§4.5/§4.6 code fires and not-fires per §6; presence requirements bind only in `red-contract` regions while `RED_TARGET_INVALID` binds on any plan-kind v2 marker carrying the field (the outside-region invalid case is pinned); v1 plans relint with byte-identical task-contract findings (a corpus regression test over at least 2 committed legacy fixture plans), and the §5 exclusion is proven span-exact: the `red-target=` capture excluded, while citation-shaped spans in `red=`, `why=`, gate `cmd=`, gate `probed=`, and on spec-kind marker lines each keep today's hard citation finding.
- AC-5: `--exec-red` executes only `red-state=live` markers owned by task extents in red-contract regions, only on plans, with the §4.4 outcome mapping (live markers in bare regions, orphaned markers, and no-region plans proven never executed); the pure planning function's output proves authored markers are never enumerated for execution, and the §6 adapter boundary cases (126/127/timeout/ceiling/cwd/`sh -c`/stderr-tail) all pass.
- AC-6: `_metaPureCore` passes over the new modules; both new surfaces enrolled with floor 0.95, empty unaccepted-survivor set, and scores stated in the round-1 review brief.
- AC-7: this spec and the implementation plan lint clean (`0 hard`) through the shipped `spec:lint` at dispatch time.
