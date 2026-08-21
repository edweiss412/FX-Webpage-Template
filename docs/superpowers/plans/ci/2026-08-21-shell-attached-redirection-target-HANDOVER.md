# Handover — `fix/shell-attached-redirection-target`

**This session authored the spec and the plan. It did NOT implement.** A fresh implementation
session takes the branch from here.

**Ledger:** `BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION` (`BACKLOG.md:87`).
**Branch:** `fix/shell-attached-redirection-target`, off `e5d1d723d`.
**Spec:** `docs/superpowers/specs/ci/2026-08-21-shell-attached-redirection-target-design.md`.
**Plan:** `docs/superpowers/plans/ci/2026-08-21-shell-attached-redirection-target.md`.
**Probe record:** `docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-redirection-target-probes.md`.

---

## 1. Stage 0 for the incoming session — do these before the first edit

1. `date`. The shell clock is the only source of truth for the current time.
2. **Overwrite the ship marker (gitignored, at .claude/ship-state.json in this worktree)'s `sessionId` with your own UUID**, and **CLEAR
   `blockedOn`** — it names this handover, and the handover is what you are. A non-empty
   `blockedOn` SILENCES the stop gate, so leaving it set runs your whole pipeline unprotected.
3. Register your OWN 10-minute cron nudge and write the new `cronJobId`. The one in the marker
   belongs to a dead pane.
4. `herdr pane rename "$HERDR_PANE_ID" "fix/shell-attached-redirection-target"` and the same for
   `herdr agent rename`.
5. **Verify the round-economy filing.** Run `pnpm exec vitest run tests/docs/_metaReviewRoundEconomy.test.ts`
   on arrival rather than trusting this report. The filing obligation is owed by the session that
   spends the rounds and the RED is inherited by the session that did not — so neither is looking,
   which is exactly why it gets dropped.
6. `pnpm install && pnpm worktree:link-env && pnpm preflight` if the worktree is fresh to you.

## 2. What is done

- Spec, **closed DISPOSITIONED after four adversarial rounds — NOT ratified, and there is no
  APPROVE row.** The four repairs made after the terminal round are unreviewed. §5 is the record and
  it is not optional reading; §5a is the blind-spot map that explains why a quiet round is not
  evidence of coverage here.
- Plan, **closed DISPOSITIONED after four adversarial rounds — NOT approved, and there is no
  APPROVE row on either stage.** Round 4 was declared terminal in its own brief and returned
  BLOCKING/2; both findings are repaired and those repairs are unreviewed. The four-round filing is
  in the round-economy record.
- Seven committed, re-runnable probes under
  `docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/`.
- The ledger row is marked `IN PROGRESS · Branch: fix/shell-attached-redirection-target` and
  pushed.

## 3. What is NOT done

- **No implementation.** Not one line of `tests/cross-cutting/psqlStartupFiles/scan.ts` has changed.
- No mutation score. The score is owed at diff round 1 and is measured AFTER the source edit —
  a source edit voids any earlier number, so there is deliberately none to inherit.
- The ledger closeout has not run.

## 4. The eleven things most likely to cost you a round

1. **The pins flip the moment you touch the recognizer.** Three retired, two held — plan §2. Retire
   them in the SAME commit as the recognizer change; a separate task leaves a commit whose
   acceptance condition is a red suite.
2. **`relational-boundary:3578:35:<><=` carries a registry row of kind `equivalent`**
   (`tests/mutation/source/registry.ts:2582`), reasoning that the YAML alias walk's `depth < 32`
   guard widened to `<= 32` grants one extra level that is unreachable. It has been observed as
   SURVIVOR, then STALE, then UNACCEPTED SURVIVOR, and hand-applied it survived 3 of 3 — which is
   what `equivalent` predicts, so the instability is in the harness's REPORTING of the row, not in
   the row's correctness. **Do not remove it on a single stale-row report** — that mistake was made
   before and had to be reversed. Re-run first, and report what you see at that site to `bl-orch`.
3. **Line shifts are NOT uniform.** Measured on two other surfaces: `+1 ×7` and `+24`; `+132` and
   `+153` within one change. Offset arithmetic is never valid — re-derive every accepted row
   through `pnpm mutation:sites`, and RE-VALIDATE rather than merely re-key.
4. **W1 in plan §2b is the weaker implementation that passes A–F by accident.** The naive re-lex of
   `attached[0]` makes case A green for a reason unrelated to construct-aware delimiting. This handover named G, H and I as the three separating
   cases and the implementation-time killer audit REFUTED two thirds of it: `"[^"]*"` matches G's
   target whole, and H's escaped backtick never reaches that path, so neither discriminates. Case
   I's ATTRIBUTION predicate is what separates the specified implementation from the accidental
   one. Corrected in place rather than left standing, because a wrong killer column reads as
   coverage.
5. **AC-5's digest covers EVERY field, and that is load-bearing.** The first version hashed only
   key, file, line and text — and every one of the 76 live sites carries
   `suppressesStartupFiles: true`, `nested: false`, `nestedInBacktick: false`, so flipping any of
   them left the digest identical. If you ever narrow that serialisation to "the fields that
   matter", you have rebuilt the blindness. `docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/digest-sensitivity.mts` is the gate that catches it.
6. **Case H was replaced once already because it did not execute.** Any fixture you add to the
   acceptance set goes through `docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/oracle.mts` first: a snippet that does not run the command cannot
   demonstrate the scanner is wrong to be silent about it. The oracle ABORTS if any snippet
   measures `executions=0`.
7. **The acceptance set is ELEVEN subjects, not nine, and J and K are not decorative.** J crosses
   the newline (a backslash continuation inside a quoted target) and K crosses the
   file-descriptor prefix (`cat 2>`). Both were added at spec round 4 because a weaker
   implementation passed every other case without them. If either goes green for a reason you
   cannot state, it is passing by accident.
8. **The operator axis has NO killer case, by design.** W11 in plan §2b is the implementation that
   delimits construct-aware after `>` and `<<<` and falls back for the other ten operators.
   Task 1's obligation is to iterate the shipped `REDIRECTION_OPERATORS` array, not a list retyped
   from the plan — an operator added later must be covered by construction. Read §5a before you
   decide a green means coverage.
9. **Step 5's EARLY ledger closeout is RATIFIED and will be challenged.** A reviewer reading only
   AGENTS.md invariant 12 sees "the marker comes off in the PR's last commit" and raises it as a
   finding — correctly, on the text. A batch-wide ratification supersedes that wording (batch-3
   common brief, §3 STANDING RULES, first bullet), the step now cites it, and a sibling arc refuted
   the identical finding against the identical ratification. **This plan accepted that finding once
   and reversed the step, then reversed it back.** Do not repeat it. Point at the citation.
10. **The general form of that mistake, which is worth more than the instance:** an uncited
    inheritance is indistinguishable from an unratified choice. The rule that follows is narrower
    than "cite everything" — cite an inherited standing rule when, and only when, it CONTRADICTS
    something written in the repo. A rule that merely adds discipline needs no citation, because no
    reviewer will find a contradiction to raise. The sweep behind that derivation checked all
    nineteen inherited rules: this plan relies on three, and only the closeout rule conflicts.
11. **Do not commit a scratch file under `tests/mutation/source/`.** The source-mutation surface is
   split across `SOURCE_SHARD_COUNT = 4` shards (`tests/mutation/source/shardPartition.ts:26`) and
   `tests/mutation/_metaSourceShardIntegrity.test.ts` pins the workflow's matrices against that
   partition, so a stray file there changes what each CI leg runs. Stage by path, never
   `git add -A tests/`. **The same hazard bit this arc twice in a different form** — an artifact
   committed by the arc entering the corpus the arc measures (the oracle's snippets, then the
   closeout script). Before pushing, re-run
   `docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/corpus-family3.mts`
   and check the target count against the number the plan states for its own revision.

## 5. Review record — DISPOSITIONED, not CONVERGED

**There is no APPROVE row on this branch, on either stage.** Nine review rounds ran — four spec,
four plan, one trail audit — and every one returned findings. Both stages closed DISPOSITIONED on a
terminal round, and in both cases the repairs made after that round are unreviewed. **The codex API
hit its weekly limit shortly after plan round 4 returned**, so no further dispatch was possible
regardless; round 4 completed with a genuine verdict before the wall (one attempt, no
`failureShape`), which is distinguishable from the wall's signature of three fast attempts ending in
`no_verdict`.

The spec stage ran four adversarial rounds, every one
BLOCKING, and closed on an orchestrator disposition after a round declared TERMINAL in its own
brief. **The four repairs made after round 4 are unreviewed by any reviewer** (#864 precedent). The
full split, and why the stage closed where it did, is in
`docs/review-rounds/fix/shell-attached-redirection-target/e5d1d723d69c.md`.

| round | verdict | findings | deliverable | scaffolding |
|---|---|---|---|---|
| 1 | BLOCKING | 6 | 4 | 2 |
| 2 | BLOCKING | 3 | 0 | 3 |
| 3 | BLOCKING | 3 | 0 | 3 |
| 4 (terminal) | BLOCKING | 4 | **4** | 0 |

**Read that table before you trust a quiet round.** The stage was closed once at three rounds on
the two-consecutive-zeros signal, that ruling was reversed, and the terminal round returned the
highest deliverable count of the whole stage. Zero findings certified that the reviewer found
nothing along the axes the controls varied. It certified nothing else.

The unreviewed delta is exactly these four repairs: the probe domain narrowed to what production
reads (spec §2.3, §5, §7.4); acceptance subjects J and K added; a thirteenth census control; and
the attribution predicate changed from existential to universal. Terminal evidence line: **oracle
12/12 snippets execute psql exactly once, corpus baseline unmoved at 76 rows, digest
`8ebe8b08d43e6308aa471112d9f086d0118e6238`.**

### 5a. Axes inventory — the blind-spot map, so you do not rediscover it

The arc's dominant defect shape is **a control blind along an axis its author never varied** —
**seven of the thirteen findings raised after round 1**, counted rather than asserted: the digest
blind to fields constant across the corpus (spec r2); the census blind to multiline input and the
digest collapsing `undefined` into `null` (spec r3); the same-line-only acceptance set, the
unvaried file-descriptor prefix, and the existential attribution predicate (spec r4); and the
unvaried nested-body population (plan r1). The other six were different shapes — stale numbers, a
domain declared wider than production reads, a gate that ran in reporter mode, an AC nothing
executed. This is the map of which dimensions the control sets now cross and which they do not,
because the arc's own lesson is that a quiet round certifies varied axes only.

**Crossed — a case exists on both sides:**

| axis | crossed by |
|---|---|
| construct kind (backtick, `$()`, `${}`, double quote, `$"…"`, here-string) | subjects A–G |
| nesting depth 1 vs 2 | G (brace inside a quoted target) |
| escape binding tightest | H |
| attribution vs mere presence | I, with a UNIVERSAL predicate |
| attached vs detached | the four positive controls |
| line count — same line vs backslash continuation | J; three census controls |
| file-descriptor prefix on the operator | K; one census control |
| really executes vs merely looks executable | `docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/oracle.mts`, 12/12 |
| field present vs `null` vs `undefined` vs ABSENT | `docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/digest-sensitivity.mts`, 7/7 |
| execution surface (shell file, workflow `run:`, package script) | the three-surface census |
| scanner-independence — census not keyed on the regex under repair | round 2's repair |

**NOT crossed by any FIXTURE — and read that precisely.** Two of these are now closed by a plan
OBLIGATION rather than by a case: Task 1 requires the operator list to be iterated from the shipped
array (item 2), and requires assertions over both populations, bodies-per-target and
targets-per-chunk (items 3 and 6). **An obligation is work you still owe; a fixture is work already
done.** The distinction is the whole point of this section — do not read a plan requirement as
coverage.

Write the case before you trust a green:

1. **End of file.** All 15 acceptance fixtures end with a trailing newline. A target whose
   continuation backslash is the LAST byte of the file, or whose quote never closes before EOF, is
   unreachable by the whole set. This exact shape hid an entire input family on another arc in this
   repo, where 114 cases all ended in `\n`.
2. **Operator variety — the biggest hole, and it is measurable.** `REDIRECTION_OPERATORS`
   (`tests/cross-cutting/psqlStartupFiles/scan.ts:1088`) declares **twelve** operators, and the
   attached-target branch runs for all of them. The acceptance set exercises **two**: `>` (eleven
   fixtures, one of them `2>`-prefixed) and `<<<` (two). `&>>`, `&>`, `<<-`, `<<`, `>>`, `>&`,
   `<&`, `<>`, `>|` and `<` are untouched, so an implementation that delimits construct-aware after
   `>` and `<<<` and falls back to the old character run for the other ten passes the entire gate.
   Derive the case list FROM that array rather than from this paragraph — a list retyped here goes
   stale the moment the array changes.
3. **One redirection per command.** No fixture writes two attached targets on one command
   (`cat >"$(a)" 2>"$(b)"`), so nothing pins that the walk RESUMES correctly after the first.
   Plan round 2 closed the ACROSS-LINE version of this as a Task 1 obligation
   (`cat >"$(true)"` then `cat >"$(psql)"`); the SAME-COMMAND version is still open, and it is the
   harder one, because resuming after a delimited target is where an off-by-one lands.
4. **Position in file.** Every fixture is a whole small file whose construct starts at line 1.
   Nothing sits mid-file, after a heredoc, inside a function body, or inside a `case` arm — and
   line attribution is a field AC-5's digest covers.
5. **Outer quote kind.** The attached target is bare, double-quoted, or `$"…"`. Never
   single-quoted (`>'…'`, where a substitution is INERT and must NOT report) and never ANSI-C
   (`$'…'`). The single-quoted case is the interesting one: it is the false-advisory direction.
6. **Population size.** Every FIXTURE yields zero or one site. Plan rounds 1 and 2 turned this into
   two Task 1 obligations — bodies per target, and attached targets per chunk — after each was found
   separately, the second only because closing the first left it open. The obligations are stated;
   no fixture demonstrates them yet.
7. **Line endings.** All fixtures are LF.

Items 1, 3 and 5 are the ones I would write first, and 3 and 5 are the two with no obligation
behind them either. Item 5 in particular tests the direction the
consequence bound calls forbidden from the other side — over-reporting is a documented limit, but
a substitution inside single quotes is inert in bash and reporting it is still a false advisory.

## 5b. Two process failures worth inheriting

Neither is about the shell grammar, and both cost real rounds.

**Read the wrapper's result.json, never an attempt file.** Plan round 1 ran TWO attempts: attempt 1 declared
`FINDINGS: 3` inside a ```text fence, the wrapper elides fenced blocks before parsing, saw no
marker, and retried. This session polled for the wrapper's result.json, then read `attempt-1.last-message.txt`
whether or not it had appeared, and acted on three findings as though they were the verdict.
the wrapper's result.json said SEVEN throughout. The wrapper contract says to read the wrapper's result.json on the exit
notification, and this is what ignoring it costs.

**Two things follow, and only one of them is done.** The plan-round-3 brief — the one brief written
after the discovery — tells the reviewer to put the `FINDINGS:`/`VERDICT:` lines outside a fence,
which removes the trigger. **Carry that line into every brief you write**; it is not in the earlier
seven, and nothing enforces it. The other half is not a brief change at all: read the wrapper's result.json, and
read it only once it EXISTS. A poll loop that falls through to reading an attempt file on timeout
will hand you a non-terminal message and nothing will tell you it did.

**A quiet round is not convergence, and this arc has the counted evidence.** The spec stage went
4 → 0 → 0 deliverable findings and was dispositioned closed at three rounds on that signal. The
ruling was reversed, a terminal fourth round ran, and it returned four deliverable findings — the
stage's highest. Plan rounds then returned 7 and 5. Across the arc, zero findings were refuted
until the Step 5 reversal. If a round comes back clean, check §5a's uncrossed-axis list before
concluding anything.

## 6. Decision log

the decision log (gitignored, at .claude/decisions.tsv in this worktree) in the worktree carries one row per decision with its evidence pointer.
It is gitignored and is a working artifact, not a deliverable — read it if you want to know why
something is the way it is without reading a transcript.
