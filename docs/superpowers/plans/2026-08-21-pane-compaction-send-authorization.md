# Pane-compaction send authorization — implementation plan

**Spec:** `docs/superpowers/specs/2026-08-21-pane-compaction-send-authorization.md` (rounds
1–4 complete; round-economy filing at
`docs/review-rounds/feat/pane-compaction-send-auth/e5d1d723d69c.md`). **Branch:**
`feat/pane-compaction-send-auth`. **Implementer:** a fresh Opus pane (this plan is part of
its handover; the spec+plan session does not implement).

Plan-wide invariants bind every task: one commit per task, conventional commits, no work
outside this worktree. The TDD invariant binds per task KIND, stated here so the plan and
its tasks cannot disagree (plan review r2 F2): Tasks 1, 2, 3, and 5 are code/prose-pin TDD
cycles and carry red-contract markers; Tasks 4 and 6 are measurement tasks — their
deliverable is recorded evidence (a weakened build failing a named pin; a score derived via
the shipped `score()`), the red-then-green shape appearing as each check proven able to
fail before it is trusted, and a red-contract marker would be tautological because their
commands flip red/green per applied build, not once per task; Task 7 is a ledger/docs
commit whose gates are the shipped ledger meta-tests plus its own authored PASS/FAIL
sweeps (run at plan time, transcripts in the task body). Tasks 4, 6, and 7 sit outside
red-contract regions deliberately. The heavy phases (full suite, mutation runs) go under
`pnpm heavy <cmd>`; scoped vitest runs stay unwrapped. Bash-tool foreground calls cap at
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
in the live file and are NOT part of the restoration — with ONE exception: the fence commit
MODIFIED one retained case in place, and a title-diff sweep cannot see that, only a
body-diff can; r4 F1, row below). Classes per spec §8.1:

| Historical case (deleted block) | Class |
| --- | --- |
| `--dry-run` refusal/no-write/no-consume trio, plus "shows the refusal it would hit, and spends nothing" | 2 — adapted (bytes gain §3.6 address line) |
| resume-refusal-names-RULE; rule-4 names field; singly-claimed not UNOWNED; claimed-by-other BY NAME | 1 — verbatim |
| AC-13 purview transfer "between observation and send" | 2 — adapted PIN (two-read premise → transferred purview IN the pass; kill target: ownership-check-deleted build) |
| leaves-roster refuses with THAT reason | 2 — adapted (single-pass framing; lying-refusal pin retained) |
| AC-17 sessionId-change-preserves-nonce; AC-17 takeover | 2 — adapted PINs (kill target for BOTH: rule-stop-deleted build — rule 5 is the refuser; the nonce-equality-deleted build is killed by the AC-19 mismatch/absent pins, per spec §4) |
| herdr-null fault; gh-null row; unrecognized gh bucket; unparsable corpus timestamp; second target; refused-send fault; re-mint message; corpus tie; AC-4 pair; absent-marker drives; AC-16 pair; no-ESC live spy | 1 — verbatim |
| the seven refusal-naming cases (missing --as after flag; unresolvable target; herdr FAULT not a missing target; resolved-but-not-on-roster; terminal-id-only target; no-target names itself; driving without --as) | 1 — verbatim |
| `--compact --dry-run` hex-compare (AC-6) | 1 — verbatim (spec §3.6: `/compact` carries no address; bytes stay `/compact\r`) |
| checkpoint/resume send-text and dry-run byte cases | 2 — adapted (address line; resume deference line; BOTH address forms, live and dry-run, incl. a resume dry-run byte case) |
| resume-refuses-on-OBSERVATION — the STATIC rule-vs-banding case at baseline :920 ("not merely when banding says WAIT") | 2 — adapted PIN (kill target: rule-stop-deleted build) |
| `it.each` checkpoint/resume "revalidates before sending, like --compact does" pair (TWO dynamic instances, baseline :607; r3 F3 — previously unaccounted) | 3 — retired (the case's premise IS the second read §3.2 deletes; its intent — fresh state per sending invocation — is carried by the structural cover's set-equality and two-invocation freshness cases) |
| "a marker whose known key holds the wrong TYPE is not driven" — **corrected at diff round 4 (suites F2):** this sat in the verbatim list, and its callback hash moved `0aca61c51924` -> `ac7aa2282704`. The current body replaces the partial marker with `fullMarker({ sessionId: 123 })`, which is a material change to what the case feeds the code | 2 — adapted: the wrong-TYPE value is now carried on a COMPLETE marker, so the case reaches the type check instead of stopping at §4.3 completeness first |
| "--all is rejected by name rather than silently ignored" — the sole MODIFIED-in-place baseline case (r4 F1): the fence commit swapped its body from `drive(["--compact", "--all", …])` to the non-sending `--all --check` form (live at tests/paneCompaction/adapter.test.ts:390, with a fence-ordering comment) | 1 — verbatim. **Corrected at diff round 4 (suites F2):** this row said "adapted", and the shipped body hashes IDENTICALLY to the baseline (`ce1488a2b11c` both sides). The restoration put the original sending-mode body back unchanged, so nothing was adapted; the row described the intended WORK, and was never revised once the work turned out to be a straight restore. |
| current fence suite (zero-reads spies) | 3 — retired with the fence |
| `revalidate.test.ts` "runs immediately before sending" describes (revalidation-callback premises, incl. stale-verdict/purview at lines 104–174) | 3 — retired (§3.2 deletes the second pass); nonce-from-pass and consume-before-send re-target as pins in Task 2 |

The implementer refines this table case-by-case in Task 2's commit message with the diff in
hand; a case moved between classes is stated there with its reason — never silently.

**CORRECTION, diff round 1 finding 4 (P2), derived rather than patched.** The reviewer
probed four rows this table calls class 2 and showed their complete test nodes were
BYTE-IDENTICAL to the baseline at `23599c8fa` — so at that head they were class 1
verbatim, and the stated reason ("bytes gain §3.6 address line") was false for them: the
address line lands in `planSends`, and a case that neither renders a payload nor asserts
its bytes never sees it.

Re-derived over the SHIPPED tree by body hash, and the counts reconcile:

    baseline 65 = verbatim 54 + adapted 10 + retired 1

with one property of the method stated because it changes how the numbers read: TITLE IS
NOT A STABLE KEY across an adaptation that renames. A title-keyed diff reports six
renamed-and-adapted cases as "retired" — the AC-13 purview case, both AC-17 halves, the
leaves-roster case, and the two send-text cases — when each is class 2 under a new name.
Exactly ONE case is genuinely retired: the `it.each` checkpoint/resume
revalidates-before-sending pair, whose premise IS the second read §3.2 deletes.

The four rows the reviewer named are class 2 as SHIPPED, but for a reason this table did
not state and could not have: diff round 1's finding 1 rebuilt their marker fixtures,
which had been refusing at rule 4 before reaching the nonce, the rule-7 stop, and the live
send those cases name. Their bodies differ from the baseline because of THAT repair, not
because of the address line.

<!-- tasks: depth=2 red-contract -->

## Task 1 — core: authorization predicate, addressed texts, session substitutions

<!-- task: red=`pnpm vitest run tests/paneCompaction/authorization.test.ts` red-state=authored red-target=`scripts/lib/pane-compaction-core.ts:647` why=`planSends at that line substitutes only <NONCE>; CHECKPOINT_TEXT/RESUME_TEXT carry no address line and no <SESSION>/<BRANCH> substitution, and no exported authorization predicate over a pass exists in the core - the new suite's cases fail against all three absences` ac=AC-1,AC-5,AC-15 -->

**Files:** `scripts/lib/pane-compaction-core.ts`, `tests/paneCompaction/driver.test.ts`,
`scripts/pane-compaction.ts` (call-site argument updates only, behavior-neutral under the
fence), `tests/mutation/source/registry.ts` (suitePaths), `tests/mutation/_metaPremiseContract.test.ts`
(per-suite declaration); tests/paneCompaction/authorization.test.ts (new).

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
inside the enrolled `paneCompactionCore` surface. `planSends` gains the `<SESSION>`/`<BRANCH>`
substitutions, and EVERY caller updates in this same task (rule: a task whose change
invalidates sibling expectations repairs them in the same task): the five `planSends` calls
in `tests/paneCompaction/driver.test.ts` (their byte expectations gain the address line —
the `\x1b` pins stay pinned), and the two production calls in the adapter
(`scripts/pane-compaction.ts:852` checkpoint, `scripts/pane-compaction.ts:871` resume —
passing branch/session from the reads `drive()` already holds; behavior-neutral, the fence
still refuses before any of it runs). The THIRD
production caller — `planSends({ command: "compact" })` inside `runCompact` at
`scripts/lib/pane-compaction-core.ts:815` — needs no argument change by construction:
`/compact` carries no address line (spec §3.6; AC-6 pins its bytes verbatim `/compact\r`),
so that call compiles unchanged and the driver suite's compact byte pin staying green is
the proof. (Plan review r2 F3: r1's "three calls in the adapter" miscounted — two live in
the adapter, the third in the core, and it is address-exempt.) `runCompact`'s
`revalidate`-thunk removal is TASK 2's change, where `revalidate.test.ts` is in scope —
Task 1 leaves `runCompact`'s signature untouched. ENROLMENT lands here too: the
`paneCompactionCore` registry row's `suitePaths` gains the new suite's path
(tests/paneCompaction/authorization.test.ts, plain text here because the file does not
exist yet) and `_metaPremiseContract` gains that suite's declaration — a deciding suite
outside `suitePaths` buys zero score (BL-ENROLLED-SUITE-PLACEMENT class), and enrolment
precedes the diff review. Registry reconciliation, run at plan time:
`paneCompactionCore.suitePaths` currently holds 10 entries (bands, precedence, acceptSet,
position, purview, cli, driver, ruleIdentity, mutantKills, revalidate —
`tests/mutation/source/registry.ts:234-253`); this task adds exactly one and removes none —
post-task count 11.

## Task 2 — adapter: fence removal, single-pass drive, restored suite

<!-- task: red=`pnpm vitest run tests/paneCompaction/adapter.test.ts tests/paneCompaction/revalidate.test.ts` red-state=authored red-target=`scripts/pane-compaction.ts:587` why=`the SENDING fence block at that line refuses every sending mode with exit 2 before observation, and drive() below it reads the marker at entry (:733) and again inside authorize() - the restored-and-adapted suite fails against the fence (every send case refuses) and the read-member spy fails against the two-pass structure (marker recorded twice, roster twice)` ac=AC-1,AC-2,AC-3,AC-4,AC-5,AC-6,AC-7,AC-8,AC-9,AC-10,AC-11,AC-15 -->

**Files:** `scripts/pane-compaction.ts`, `scripts/lib/pane-compaction-core.ts`
(`runCompact` thunk deletion and signature; `mintNonce`'s collision compare against the
pass's marker copy — plan review r2 F3: r1's file list omitted the core file even though
this task's GREEN already edited it), `tests/paneCompaction/adapter.test.ts`,
`tests/paneCompaction/revalidate.test.ts`.

RED: restore the deleted suite from `git show 9eaa6d6eb^:tests/paneCompaction/adapter.test.ts`
per the restoration table above; apply the enumerated adaptations (address-line bytes,
single-read pin premises, §3.6 literal texts in the AC-6 hex compare); ADD the structural
cover — a spy `Surface` recording every read-member call, asserting at most one call per
member per sending invocation, `marker` exactly once on an invocation that reaches the
decision (spec §4 chain 4) — and, per plan review r1: the spy asserts SET EQUALITY
against each mode's declared expected-read set (not merely at-most-one, which a cached
zero-read value would satisfy), plus a TWO-INVOCATION case asserting every member is read
freshly per invocation (no cross-invocation carry — AC-1's second clause); ADD an
adapter-level AC-2 case (an instrumented `Surface` whose marker read is counted and valued:
the compact decision matches the pass's single read); ADD the AC-9 zero-post-send-reads
spy; ADD an adapter-level LIVE-SEND `\x1b` spy through `main()` (the driver suite's spy
iterates `planSends` arrays and cannot see an adapter-only escape — AC-7); ADD a live-send
address-prefix spy (first line of every sent prompt matches §3.6's address line — AC-15's
adapter half); ADD a source pin that the fence's refusal string ("disabled in this
release") is absent from `scripts/pane-compaction.ts` and no flag gates the sending
dispatch (AC-10's no-flag clause); re-target
`revalidate.test.ts`'s surviving cases (nonce compared from the pass's marker copy;
consume-before-send leaves a refused record reusable) and delete its retired describes,
each named in the commit message with §3.2 as the reason. Observed red, TWO records (r3 F1 — the second is the structural red spec AC-3/§4 require,
and the fenced tree cannot produce it: the fence returns before any read, so the spy fails
with zero reads there, not duplicate ones):
(i) against the CURRENT tree, the full restored suite — the fence refuses every sending
case (the task-gate red; wrong-reason for the pin cases, which is WHY the fence removal and
the suite land in ONE cycle: the suite is this task's red, per spec §8.1 and the
guard-is-the-red rule);
(ii) with ONLY the fence block deleted as an UNCOMMITTED probe edit (drive() and its
two-pass reads untouched), the read-member spy fails on DUPLICATE reads — marker at entry
(scripts/pane-compaction.ts:733) and again inside authorize(), roster twice — the
structural red against the shipped two-pass structure. Record the failing assertion lines,
restore the probe edit byte-exact (git checkout, blob hash compared) before GREEN begins;
the probe edit is never committed.

GREEN: delete the fence block whole (no flag); rebuild `drive()` on one read-once pass —
wrap the live `Surface` in the read-once memo derived from the `SEND_AUTH_SURFACES` row's
complement (spec §3.1), derive every predicate via Task 1's core function, then effects
(checkpoint: nonce write → sends; compact: consume → sends; resume: sends), nothing read
after the sink; delete `runCompact`'s `revalidate` thunk and re-shape its signature to take
the pass's data (`scripts/lib/pane-compaction-core.ts:780`), consume-before-send preserved;
`mintNonce`'s collision compare reads the pass's marker copy. Move the
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

Acceptance: for each §4 pin, its NAMED weakened build is applied to the source in place,
run, and restored byte-exact inside ONE invocation (the deciding suites import the shipped
paths, so the weakened bytes must sit at the real path; the worktree is frozen — no live
review dispatch — for the whole task; r2 F4 made the command concrete, which retired r1's
"copy of the source" phrasing: a copy is never imported by the suites). At least one
failure is recorded naming the pin. Builds, derived from spec §4's table:
ownership-check-deleted; rule-1–8-stop-deleted; verdict-gate-deleted;
nonce-equality-deleted; rule-1(NOT-AN-ARC)-deleted. Record ABSENT /
PRESENT-BUT-UNPROVEN / PROVEN per pin — all must end PROVEN (AC-3). Paste each kill's
failing assertion line into the commit message. No pin may be proven by a crash red (spec
§8.2). Per-build invocation template (r3 F2 replaced the fail-open r2 form, whose exit
status was the restore check's and discarded the vitest verdict — a surviving mutant exited
0 through it). The template FAILS unless the suite failed AND the failure names the pin:

    LOG=$(mktemp); PIN_TITLE="<the pin's exact test title>"
    before=$(git hash-object scripts/lib/pane-compaction-core.ts scripts/pane-compaction.ts | tr '\n' ' ')
    # apply ONE named weakened edit
    pnpm vitest run tests/paneCompaction/adapter.test.ts tests/paneCompaction/authorization.test.ts > "$LOG" 2>&1; vexit=$?
    git checkout -- scripts/lib/pane-compaction-core.ts scripts/pane-compaction.ts
    after=$(git hash-object scripts/lib/pane-compaction-core.ts scripts/pane-compaction.ts | tr '\n' ' ')
    test "$before" = "$after" || { echo RESTORE-FAILED; exit 1; }
    test "$vexit" -ne 0 || { echo "SURVIVED: build not killed"; exit 1; }
    grep -E "(×|✗|FAIL).*" "$LOG" | grep -qF -- "$PIN_TITLE" || { echo "WRONG-KILL: no failure names the pin"; exit 1; }
    echo "KILLED: $PIN_TITLE"

The `--` before `"$PIN_TITLE"` is load-bearing and was added at execution time:
several pin titles begin with `--checkpoint`, which grep parses as an option, and
the template then reports WRONG-KILL on a build it actually killed. A false
WRONG-KILL is the safe direction, but it is still a wrong answer, and without the
`--` the template can never pass on the modes it exists to check.

Then read the log by hand and record the failing ASSERTION line — a collection or
module-load crash is a red the template cannot distinguish from an assertion failure, and
spec §8.2 rejects it; the human read is the crash filter.

Task commit (r3 F4 — a measurement task still owes its one commit): `git commit
--allow-empty` with the per-build PROVEN table, each kill's failing assertion line, and the
blob-hash restore pairs in the message. The tree is unchanged by design; the record is the
deliverable.

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

Acceptance: enrolment of the new suite landed in Task 1 (suitePaths + premise-contract
declaration — verify both present before scoring). `pnpm mutation:sites` run BEFORE pushing any enrolled-source change (re-key
`paneCompactionCore` accepted rows if lines shifted; re-VALIDATE each re-keyed row by
reading, never by resolution). Then the scored run, backgrounded, as
`pnpm heavy pnpm mutation:guards` (the bare alias takes no slot — `with-heavy-slot.py`
exits 2 with no child command; r2 F4), after the LAST source edit of the diff: `paneCompactionCore` at its floor, score derived through
the shipped `score()` (a green gate prints no counts), stamp pair identical across the run.
Killer audit derived from spec §4's fourth column plus Task 4's table — derive the
obligation list from the documents, not recall. The round-1 diff brief carries
`GUARD SURFACE: paneCompactionCore` with `MUTATION SCORE: <killed>/<total>` and "0
unaccepted survivors" on the same line (wrapper exits 2 otherwise). A source edit after the
run RETIRES the number — say so and re-run rather than quoting it. Task commit (r3 F4):
`git commit --allow-empty` with the score, the survivor set (must be empty of unaccepted
rows), the stamp pair, and the `mutation:sites` re-key account in the message — the later
review brief QUOTES this commit's number, it is not the number's home.

## Task 7 — ledger closeout, early (one commit, before whole-diff review)

Ordering is the ratified one, recorded here so it is not relitigated (r2 F1 read invariant
12's "PR's last commit" sentence without its graduating-entry clause): AGENTS.md invariant
12 states that a graduating entry's marker comes off in the same commit that archives it,
because archives categorically reject in-progress entries; the fleet ruling on top of it
(lessons file, the #838 post-incident ruling) is that the whole ledger change — peer rows,
archive move, marker removal — is ONE commit taken BEFORE whole-diff review, so review and
CI cover exactly the bytes that merge and absence is guaranteed rather than maintained.
The window in which the row looks unclaimed to `pnpm ledger:claims` is the priced cost of
that ruling: the branch stays live on origin holding the archive entry (a done state, not
an open one), and the arming window below keeps auto-merge disarmed until review approves —
#838 shipped a marker to main because `--auto` was armed at push time, not because the
ledger commit sat early.

Acceptance (each check anchored to DECLARATIONS, `^## <ID>` — mentions are not
declarations; every check prints PASS/FAIL, exits non-zero on failure, and was proven able
to fail against a constructed violation at plan time — transcripts below, per the
writing-plans authored-AND-RUN rule; r2 F5):

1. Graduate `BL-PANE-COMPACTION-SEND-AUTHORIZATION` to `BACKLOG-archive.md` (archive entry
   opens with the disposition: shipped by this arc, spec DISPOSITIONED-or-CONVERGED as the
   record states, six chains closed by the two-cover account).
2. Strip the `**Status:** IN PROGRESS · **Branch:**` marker in the same commit.
3. Check A — in-progress marker count is 0 after this commit:

       test -z "$(rg -n 'Status:\*\* IN PROGRESS' BACKLOG.md)" && echo PASS || { echo FAIL; exit 1; }

   Plan-time output (pre-closeout tree, expected): FAIL — exactly one hit,
   `BACKLOG.md:1516`, this arc's own marker (`**Status:** IN PROGRESS · **Branch:**
   feat/pane-compaction-send-auth`). Disposition: that hit is the line item 2 strips; the
   check flips to PASS inside this task and is re-run in its commit.
4. Check B — archived-vs-open intersection empty:

       test -z "$(comm -12 <(rg -o '^## (BL|DEF)-[A-Z0-9-]+' BACKLOG.md | sort -u) <(rg -o '^## (BL|DEF)-[A-Z0-9-]+' BACKLOG-archive.md | sort -u))" && echo PASS || { echo FAIL; exit 1; }

   Plan-time output: PASS (intersection empty). Constructed-failure proof, run at plan
   time: the same pipeline over two fixture files, each declaring one and the same
   synthetic id, printed that id under `FAIL:` and exited 1. The id is described rather
   than spelled here because `tests/docs/_metaLedgerReferentialIntegrity.test.ts` resolves
   every `BL-` literal in the corpus against the ledgers, and a synthetic one defined in no
   ledger reds it -- which is exactly what it did from `b1db667e0` until this repair.
5. Check C — the graduating id is declared exactly once across both files (rule 176's
   doubled-body guard, applied to every entry this closeout touches):

       test "$(rg -c '^## BL-PANE-COMPACTION-SEND-AUTHORIZATION' BACKLOG.md BACKLOG-archive.md | awk -F: '{s+=$2} END {print s}')" = 1 && echo PASS || { echo FAIL; exit 1; }

   Plan-time output: PASS (BACKLOG.md: 1, archive: 0). After this task's commit the same
   command must still print PASS with the declaration moved (archive: 1, open: 0).
   Constructed-failure proof, run at plan time: a fixture declaring the id twice printed
   `FAIL: count=2` and exited 1.
6. Check D — post-merge union, run after EVERY subsequent `origin/main` merge (HEAD is
   then a merge commit):

       u() { git show "$1":BACKLOG.md | rg -o '^## (BL|DEF)-[A-Z0-9-]+' | sort -u; }
       comm -3 <(sort -u <(u HEAD^1) <(u HEAD^2)) <(u HEAD)

   Every emitted line gets a per-hit disposition: the graduating row (must then sit in the
   archive at HEAD — re-run Checks B and C), or a row a parent deliberately archived
   (named in that merge's message); anything else is a merge defect — stop and reconcile.
   Not runnable at plan time: HEAD is not a merge commit, and the degenerate self-form is
   empty by construction, proving only plumbing. Its failure modes — a reintroduced row, a
   doubled declaration — are exactly the constructed violations Checks B and C were proven
   to catch.

Arming note for the implementer: auto-merge is armed only after this commit is pushed AND
the whole-diff review approves (the arming window, AGENTS.md invariant 12 ruling).

## AC coverage — every criterion names its proving task and command

<!-- ac-coverage: command-col=3 -->

| AC | Proved by | Producing command |
| --- | --- | --- |
| AC-1 (one read-once pass; read-member spy) | Task 2 structural cover | `pnpm vitest run tests/paneCompaction/adapter.test.ts` |
| AC-2 (nonce from the pass's marker copy) | Task 2 (adapter-level instrumented-marker case; revalidate pins cover the core half) | `pnpm vitest run tests/paneCompaction/adapter.test.ts tests/paneCompaction/revalidate.test.ts` |
| AC-3 (structural red-then-green; pins PROVEN) | Task 2 red records (i)+(ii) + Task 4 kill records | `pnpm vitest run tests/paneCompaction/adapter.test.ts tests/paneCompaction/authorization.test.ts` — once against the fenced tree (record i), once against the fence-deleted uncommitted probe edit (record ii — the structural duplicate-read red), once per weakened build under Task 4's template |
| AC-4 (refusals name the condition) | Task 2 (restored verbatim class) | `pnpm vitest run tests/paneCompaction/adapter.test.ts` |
| AC-5 (resume predicate; mode verdict gates) | Task 1 + Task 2 | `pnpm vitest run tests/paneCompaction/authorization.test.ts tests/paneCompaction/adapter.test.ts` |
| AC-6 (dry-run byte-exact: compact verbatim `/compact\r`; checkpoint and resume in BOTH address forms) | Task 2 | `pnpm vitest run tests/paneCompaction/adapter.test.ts` |
| AC-7 (no `\x1b`, both paths) | Task 2 (adapter-level live-send spy through main(); driver core pins updated in Task 1) | `pnpm vitest run tests/paneCompaction/adapter.test.ts tests/paneCompaction/driver.test.ts` |
| AC-8 (nonce single-use, consume before send) | Task 2 (re-targeted revalidate pins) | `pnpm vitest run tests/paneCompaction/revalidate.test.ts` |
| AC-9 (zero post-send reads) | Task 2 (new spy) | `pnpm vitest run tests/paneCompaction/adapter.test.ts` |
| AC-10 (fence gone, no flag) | Task 2 (send cases execute §3 flows; fence-string-absence and no-flag source pin) | `pnpm vitest run tests/paneCompaction/adapter.test.ts` |
| AC-11 (pass marker relocated; scan green) | Task 2 | `pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts` |
| AC-12 (score at floor, derived via shipped score()) | Task 6 | `pnpm heavy pnpm mutation:guards`, backgrounded (bare `pnpm heavy` exits 2 — no child command; r2 F4) |
| AC-13 (docs no longer claim the fence) | Task 5 | `pnpm vitest run tests/docs/_metaPaneCompactionContract.test.ts` |
| AC-14 (checkpoint never commits) | Task 2 (verbatim class) + the executable payload pin at tests/paneCompaction/driver.test.ts:72 (`CHECKPOINT_TEXT` contains "do not commit" — the adapter case compares sent bytes to the constant, so it cannot see the constant change; r4 F2) + existing prose pin | `pnpm vitest run tests/paneCompaction/adapter.test.ts tests/paneCompaction/driver.test.ts tests/docs/_metaPaneCompactionContract.test.ts` |
| AC-15 (address line pinned; bounded classes stated) | Task 1 (texts) + Task 2 (adapter live/dry-run address coverage incl. resume dry-run) + Task 5 (prose pins) | `pnpm vitest run tests/paneCompaction/authorization.test.ts`; `pnpm vitest run tests/paneCompaction/adapter.test.ts`; `pnpm vitest run tests/docs/_metaPaneCompactionContract.test.ts` |
| AC-16 (mint exhaustion is a named exit-2 fault) | Task 3 | `pnpm vitest run tests/paneCompaction/mintFault.test.ts` |

## Whole-diff review and closeout ordering

After Task 7: split tight-scope diff reviews if the diff exceeds a handful of files
(CORE+ADAPTER / SUITES+DOCS, each brief naming the sibling's scope), round 1 carrying the
Task 6 score line; brief bounds quoted byte-identical from spec §6; do-not-relitigate
carries the spec's §1.1 plus the nine spec-round dispositions. Real CI green by name (12
required contexts, both vocabularies, sha-keyed with `length == total_count`) precedes
merge; merge precedes local `main` fast-forward (`0  0` AND ancestry).

impeccable-gate: N/A — no UI surface
