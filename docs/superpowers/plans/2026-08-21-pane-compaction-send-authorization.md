# Pane-compaction send authorization — implementation plan

**Spec:** `docs/superpowers/specs/2026-08-21-pane-compaction-send-authorization.md` (rounds
1–4 complete; round-economy filing at
`docs/review-rounds/feat/pane-compaction-send-auth/e5d1d723d69c.md`). **Branch:**
`feat/pane-compaction-send-auth`. **Implementer:** a fresh Opus pane (this plan is part of
its handover; the spec+plan session does not implement).

Every task obeys the plan-wide invariants: TDD per task, one commit per task, conventional
commits, no work outside this worktree. The heavy phases (full suite, mutation runs) go
under `pnpm heavy`; scoped vitest runs stay unwrapped. Bash-tool foreground calls cap at
600 s — the mutation re-measure runs backgrounded.

## Meta-test inventory (declared before tasks)

- EXTENDS `tests/docs/_metaPaneCompactionContract.test.ts` — new pins per AC-13/AC-15 (Task
  5): the write-up/AGENTS.md no longer claim the fence; the bounded decay classes are
  stated as bounded. Existing pins (no-interrupt, `\x1b`, never-commits, band values) must
  stay green through every task.
- EXTENDS `tests/paneCompaction/adapter.test.ts` (restored suite) and
  `tests/paneCompaction/revalidate.test.ts` (re-targeted) — Task 2.
- No advisory-lock, DB, admin-mutation, or Supabase-boundary registry applies: the diff
  touches no `pg_advisory*`, no `supabase/`, no `app/api/**`. Invariant-10: the CLI is not
  an HTTP route or server action — N/A. UI surface: none (`impeccable-gate: N/A — no UI
  surface`, § closeout).

## Restoration account (spec §8.1's three-class table, derived at plan time)

Baseline: `git show 9eaa6d6eb^:tests/paneCompaction/adapter.test.ts` (the fence commit
`9eaa6d6eb` deleted 581 lines from `adapter.test.ts`; the retained describes — report,
`--check` aggregation, rule 5, refusal naming, `parseAgentGet`, degraded roster — are still
in the live file and are NOT part of the restoration). Classes per spec §8.1:

| Historical case (deleted block) | Class |
| --- | --- |
| `--dry-run` refusal/no-write/no-consume trio | 2 — adapted (bytes gain §3.6 address line) |
| resume-refusal-names-RULE; rule-4 names field; singly-claimed not UNOWNED; claimed-by-other BY NAME | 1 — verbatim |
| AC-13 purview transfer "between observation and send" | 2 — adapted PIN (two-read premise → transferred purview IN the pass; kill target: ownership-check-deleted build) |
| leaves-roster refuses with THAT reason | 2 — adapted (single-pass framing; lying-refusal pin retained) |
| AC-17 sessionId-change-preserves-nonce; AC-17 takeover | 2 — adapted PINs (kill targets: nonce-equality-deleted / rule-stop-deleted builds) |
| herdr-null fault; gh-null row; wrong-TYPE marker; unrecognized gh bucket; unparsable corpus timestamp; second target; refused-send fault; re-mint message; corpus tie; AC-4 pair; absent-marker drives; AC-16 pair; no-ESC live spy | 1 — verbatim |
| checkpoint/resume send-text cases; dry-run byte hex-compare (AC-6) | 2 — adapted (address line; resume deference line) |
| resume-refuses-on-OBSERVATION (blockedOn flip shape) | 2 — adapted PIN (kill target: rule-stop-deleted build) |
| current fence suite (zero-reads spies) | 3 — retired with the fence |
| `revalidate.test.ts` "runs immediately before sending" describes (revalidation-callback premises, incl. stale-verdict/purview at lines 104–174) | 3 — retired (§3.2 deletes the second pass); nonce-from-pass and consume-before-send re-target as pins in Task 2 |

The implementer refines this table case-by-case in Task 2's commit message with the diff in
hand; a case moved between classes is stated there with its reason — never silently.

<!-- tasks: depth=2 red-contract -->

## Task 1 — core: authorization predicate, addressed texts, session substitutions

<!-- task: red=`pnpm vitest run tests/paneCompaction/authorization.test.ts` red-state=authored red-target=`scripts/lib/pane-compaction-core.ts:647` why=`planSends at that line substitutes only <NONCE>; CHECKPOINT_TEXT/RESUME_TEXT carry no address line and no <SESSION>/<BRANCH> substitution, and no exported authorization predicate over a pass exists in the core - the new suite's cases fail against all three absences` ac=AC-1,AC-5,AC-15 -->

**Files:** `scripts/lib/pane-compaction-core.ts`; tests/paneCompaction/authorization.test.ts (new).

RED: author tests/paneCompaction/authorization.test.ts (new) — cases for (a) the pure
authorization predicate over pass data (ownership, rule 1–8 stop, mode verdict gate, nonce
equality for compact; refusals name conditions per the shipped `refuse` catalog); (b)
`CHECKPOINT_TEXT`/`RESUME_TEXT` opening with §3.6's address line, both forms
(with-session / branch-only), byte-exact; (c) `planSends` substituting `<SESSION>`/`<BRANCH>`
and omitting the parenthetical whole when session is absent; (d) the resume deference line
present verbatim. Observed red: value assertions failing because the exports do not exist /
the texts lack the lines (record the failure output — a `ReferenceError` collection crash is
NOT an acceptable red; import the shipped symbols so absence surfaces as assertion
failures on the exported strings, not module-load errors).

GREEN: implement in core. The predicate is pure over injected pass data (no I/O), lives
inside the enrolled `paneCompactionCore` surface. Keep `runCompact`'s consume-before-send
ordering; drop its `revalidate` thunk (spec §3.2) — its nonce inputs become pass data.

## Task 2 — adapter: fence removal, single-pass drive, restored suite

<!-- task: red=`pnpm vitest run tests/paneCompaction/adapter.test.ts tests/paneCompaction/revalidate.test.ts` red-state=authored red-target=`scripts/pane-compaction.ts:587` why=`the SENDING fence block at that line refuses every sending mode with exit 2 before observation, and drive() below it reads the marker at entry (:733) and again inside authorize() - the restored-and-adapted suite fails against the fence (every send case refuses) and the read-member spy fails against the two-pass structure (marker recorded twice, roster twice)` ac=AC-1,AC-2,AC-3,AC-4,AC-5,AC-6,AC-7,AC-8,AC-9,AC-10,AC-11,AC-15 -->

**Files:** `scripts/pane-compaction.ts`, `tests/paneCompaction/adapter.test.ts`,
`tests/paneCompaction/revalidate.test.ts`.

RED: restore the deleted suite from `git show 9eaa6d6eb^:tests/paneCompaction/adapter.test.ts`
per the restoration table above; apply the enumerated adaptations (address-line bytes,
single-read pin premises, §3.6 literal texts in the AC-6 hex compare); ADD the structural
cover — a spy `Surface` recording every read-member call, asserting at most one call per
member per sending invocation, `marker` exactly once on an invocation that reaches the
decision (spec §4 chain 4); ADD the AC-9 zero-post-send-reads spy; re-target
`revalidate.test.ts`'s surviving cases (nonce compared from the pass's marker copy;
consume-before-send leaves a refused record reusable) and delete its retired describes,
each named in the commit message with §3.2 as the reason. Run against the CURRENT tree:
observed red — the fence refuses every sending case (that red is the fence's, i.e.
wrong-reason for the pin cases, which is WHY the fence removal and the suite land in ONE
cycle: the suite is this task's red, per spec §8.1 and rule "the guard is the red of the
change's own task").

GREEN: delete the fence block whole (no flag); rebuild `drive()` on one read-once pass —
wrap the live `Surface` in the read-once memo derived from the `SEND_AUTH_SURFACES` row's
complement (spec §3.1), derive every predicate via Task 1's core function, then effects
(checkpoint: nonce write → sends; compact: consume → sends; resume: sends), nothing read
after the sink; `mintNonce`'s collision compare reads the pass's marker copy. Move the
`// send-auth: pass` marker to the new single authorization function. Delete the fence
suite. `pnpm vitest run tests/paneCompaction/` green;
`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` green (the live-tree
scan sees the relocated pass marker — AC-11).

## Task 3 — adapter: mint-exhaustion is a named exit-2 fault

<!-- task: red=`pnpm vitest run tests/paneCompaction/mintFault.test.ts` red-state=authored red-target=`scripts/pane-compaction.ts:672` why=`the try/catch at that line handles SendFailed only; mintNonce's exhaustion throw (core :758-763) escapes main() uncaught, so a Surface whose random() always returns the marker's nonce crashes instead of exiting 2 naming the broken random source` ac=AC-16 -->

**Files:** `scripts/pane-compaction.ts`; tests/paneCompaction/mintFault.test.ts (new).

RED: a `--checkpoint` case with a constructed `Surface` whose `random()` always returns the
marker's `checkpointNonce` — assert exit 2 and a message naming the random source. Observed
red: the assertion fails because the throw escapes (catch it in the test harness; assert on
`main`'s return, which never happens — restructure so the red is a VALUE assertion: wrap the
`main` call, assert it returned rather than threw, expecting `{returned: true, code: 2}`).

GREEN: catch `mintNonce`'s exhaustion in the adapter beside `SendFailed`, exit 2 naming the
condition (spec §3.7).

<!-- tasks: end -->

## Task 4 — weakened-build kill demonstrations (measurement, not a TDD cycle)

Acceptance: for each §4 pin, its NAMED weakened build is applied to a COPY of the source
(never the live tree while anything reads it), the suite run, at least one failure recorded
naming the pin, source restored byte-exact (blob-hash pair printed inside the same
invocation). Builds, derived from spec §4's table: ownership-check-deleted;
rule-1–8-stop-deleted; verdict-gate-deleted; nonce-equality-deleted; rule-1(NOT-AN-ARC)
-deleted. Record ABSENT / PRESENT-BUT-UNPROVEN / PROVEN per pin — all must end PROVEN
(AC-3). Paste each kill's failing assertion line into the commit message. No pin may be
proven by a crash red (spec §8.2).

<!-- tasks: depth=2 red-contract -->

## Task 5 — docs lockstep (TDD: the prose pins are the red)

<!-- task: red=`pnpm vitest run tests/docs/_metaPaneCompactionContract.test.ts` red-state=authored red-target=`docs/agents/orchestrator-pane-compaction.md:3` why=`the write-up's banner at that line states the sending modes are disabled and name the ledger row; the new pin cases assert the banner is gone, the operator-procedure paragraph exists (post-send pane read; /compact into an empty queue), and the bounded decay classes are stated as bounded - all red against the current docs` ac=AC-13,AC-15 -->

**Files:** `tests/docs/_metaPaneCompactionContract.test.ts`,
`docs/agents/orchestrator-pane-compaction.md`, `AGENTS.md`,
`docs/superpowers/specs/2026-08-16-orchestrator-pane-compaction-design.md`.

RED: extend the meta-test — the write-up carries no fence banner; carries the operator
post-send read-back procedure; spec and write-up state the verdict/purview decay classes as
BOUNDED (AC-15's anti-overclaim pin); AGENTS.md's bullet no longer says the modes ship
disabled. Observed red against current docs.

GREEN: edit the write-up (banner → live-protocol note + operator-procedure paragraph per
spec §10), AGENTS.md first-sentence update (keep the four load-bearing rules), annotate the
2026-08-16 design's `[SHIPPED DISABLED]` limit as superseded-with-date (a dated record,
not a deletion). Existing pins stay green.

<!-- tasks: end -->

## Task 6 — mutation re-measure and killer audit (measurement)

Acceptance: `pnpm mutation:sites` run BEFORE pushing any enrolled-source change (re-key
`paneCompactionCore` accepted rows if lines shifted; re-VALIDATE each re-keyed row by
reading, never by resolution). Then the scored run, backgrounded under `pnpm heavy`, after
the LAST source edit of the diff: `paneCompactionCore` at its floor, score derived through
the shipped `score()` (a green gate prints no counts), stamp pair identical across the run.
Killer audit derived from spec §4's fourth column plus Task 4's table — derive the
obligation list from the documents, not recall. The round-1 diff brief carries
`GUARD SURFACE: paneCompactionCore` with `MUTATION SCORE: <killed>/<total>` and "0
unaccepted survivors" on the same line (wrapper exits 2 otherwise). A source edit after the
run RETIRES the number — say so and re-run rather than quoting it.

## Task 7 — ledger closeout, early (one commit, before whole-diff review)

Acceptance (each check anchored to DECLARATIONS, `^## <ID>` — mentions are not
declarations; every check prints PASS/FAIL, exits non-zero on failure, and is proven able
to fail against a constructed violation before use):

1. Graduate `BL-PANE-COMPACTION-SEND-AUTHORIZATION` to `BACKLOG-archive.md` (archive entry
   opens with the disposition: shipped by this arc, spec DISPOSITIONED-or-CONVERGED as the
   record states, six chains closed by the two-cover account).
2. Strip the `**Status:** IN PROGRESS · **Branch:**` marker in the same commit.
3. Set-arithmetic verify: union of `^## (BL|DEF)-` declarations exact against both parents,
   `comm -12` of archived-vs-open EMPTY, in-progress marker count 0 — plus a body-level
   check on any entry both sides touched (a doubled body passes id arithmetic; rule 176).
4. Re-verify after every subsequent `origin/main` merge.

Arming note for the implementer: auto-merge is armed only after this commit is pushed AND
the whole-diff review approves (the arming window, AGENTS.md invariant 12 ruling).

## AC coverage — every criterion names its proving task and command

| AC | Proved by | Producing command |
| --- | --- | --- |
| AC-1 (one read-once pass; read-member spy) | Task 2 structural cover | `pnpm vitest run tests/paneCompaction/adapter.test.ts` |
| AC-2 (nonce from the pass's marker copy) | Task 2 (re-targeted revalidate pins) | `pnpm vitest run tests/paneCompaction/revalidate.test.ts` |
| AC-3 (structural red-then-green; pins PROVEN) | Task 2 red record + Task 4 kill records | task commits carry the outputs |
| AC-4 (refusals name the condition) | Task 2 (restored verbatim class) | `pnpm vitest run tests/paneCompaction/adapter.test.ts` |
| AC-5 (resume predicate; mode verdict gates) | Task 1 + Task 2 | both red commands above |
| AC-6 (dry-run byte-exact, both address forms) | Task 2 (adapted hex-compare) | `pnpm vitest run tests/paneCompaction/adapter.test.ts` |
| AC-7 (no `\x1b`, both paths) | Task 2 (verbatim class; driver pins untouched) | `pnpm vitest run tests/paneCompaction/driver.test.ts` |
| AC-8 (nonce single-use, consume before send) | Task 2 (re-targeted revalidate pins) | `pnpm vitest run tests/paneCompaction/revalidate.test.ts` |
| AC-9 (zero post-send reads) | Task 2 (new spy) | `pnpm vitest run tests/paneCompaction/adapter.test.ts` |
| AC-10 (fence gone, no flag) | Task 2 (send cases execute §3 flows) | `pnpm vitest run tests/paneCompaction/adapter.test.ts` |
| AC-11 (pass marker relocated; scan green) | Task 2 | `pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` |
| AC-12 (score at floor, derived via shipped score()) | Task 6 | `pnpm heavy` mutation run, backgrounded |
| AC-13 (docs no longer claim the fence) | Task 5 | `pnpm vitest run tests/docs/_metaPaneCompactionContract.test.ts` |
| AC-14 (checkpoint never commits) | Task 2 (verbatim class) + existing prose pin | adapter suite + meta-test |
| AC-15 (address line pinned; bounded classes stated) | Task 1 (texts) + Task 5 (prose pins) | both red commands |
| AC-16 (mint exhaustion is a named exit-2 fault) | Task 3 | `pnpm vitest run tests/paneCompaction/mintFault.test.ts` |

## Whole-diff review and closeout ordering

After Task 7: split tight-scope diff reviews if the diff exceeds a handful of files
(CORE+ADAPTER / SUITES+DOCS, each brief naming the sibling's scope), round 1 carrying the
Task 6 score line; brief bounds quoted byte-identical from spec §6; do-not-relitigate
carries the spec's §1.1 plus the nine spec-round dispositions. Real CI green by name (12
required contexts, both vocabularies, sha-keyed with `length == total_count`) precedes
merge; merge precedes local `main` fast-forward (`0  0` AND ancestry).

impeccable-gate: N/A — no UI surface
