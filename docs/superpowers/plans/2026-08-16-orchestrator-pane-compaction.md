# Plan — orchestrator pane compaction

**Spec:** `docs/superpowers/specs/2026-08-16-orchestrator-pane-compaction-design.md` (at `1fe55813e`)
**Branch:** `feat/orchestrator-pane-compaction`

impeccable-gate: N/A — no UI surface

---

## Meta-test inventory (mandatory declaration)

**Creates:** a `_metaPaneCompactionContract` suite under `tests/docs/`, pinning the AGENTS.md pointer
against the `docs/agents/` write-up, modeled on `tests/docs/_metaAgentsMarkerContract.test.ts` —
literal, narrow assertions on the sentences that can drift, one per edit.

**Extends:** `tests/mutation/source/registry.ts` — one `GuardSurface` row enrolling the classifier
core (spec §5.6, AC-10) — **and** `tests/mutation/_metaPremiseContract.test.ts`'s
`EXPECTED_ENV_TOUCHING` map, one entry per enrolled suite. The second is easy to miss and reds the
merge gate; it is a Task 9 step, not a discovery.

**Not applicable:** Supabase call-boundary (`tests/auth/_metaInfraContract.test.ts`), advisory-lock
topology, admin-alert catalog, sentinel hiding — no DB, no auth, no alerts, no rendered component.

## Test wiring (verified at plan time)

`BASE_INCLUDE = ["tests/**/*.test.ts", "tests/**/*.test.tsx"]` (`vitest.projects.ts:34`), so a new
`tests/paneCompaction/` directory is picked up by the serial project with **no `testMatch` entry
and no workflow path-filter change**. Stated because the writing-plans rule requires wiring to be
named and confirmed rather than assumed. All suites are pure unit tests over injected surfaces, so
none is env-bound and none belongs in `ENV_BOUND_EXCLUDES` or `NIGHTLY_ONLY_EXCLUDES`.

## Mutation operators (the closure set)

The declared set is fixed and has six members: `relational-boundary`, `equality-flip`,
`logical-connector`, `integer-literal`, `regex-quantifier-bound`, `statement-removal`
(`tests/mutation/source/operators.ts:17`). **This surface enrolls all six** — `[...OPERATOR_NAMES]`
— matching the precedent surface `ledgerClaimsCore` (`tests/mutation/source/registry.ts:421`).
Enrolling a hand-picked subset would invite a "why is operator X excluded" round for no benefit,
since the table below shows every operator has real sites here anyway.

A reviewer-proposed addition is admissible only with a live escaping mutant against the shipped
guard; a proposed NEW operator is a registry change carrying its own before/after numbers, not a
round on this diff.

**The table below is rationale, not a proven claim, and Task 9 makes it executable.** Plan round 1
probed the live operators and found these claims can be silently false: `regex-quantifier-bound`
reaches only `{m,n}` quantifiers inside literal text, not an exact `{5}` or a plain string match;
`statement-removal` reaches only expression, `continue` and `break` statements. The gate asserts
only that total mutants exceed zero, so a declared operator with **no site on this surface** passes
enrolment while contributing nothing. Task 9 therefore asserts **at least one generated site per
declared operator** — turning each row into a checked statement or a red.

| Declared operator | What it attacks here |
| --- | --- |
| `relational-boundary` | Band comparisons at `t = 5` / `t = 8`; the `RECENT_COMMIT_WINDOW` comparison. |
| `integer-literal` | The band constants and the window — which is why spec §4.2 is integers in tenths. |
| `equality-flip` | Accept-set membership, verdict equality, the marker/session comparison, **the nonce comparison**. |
| `logical-connector` | The hard-`WAIT` conjunction, the `gh` no-PR conjunction (non-zero exit ∧ stderr signature), the checkpoint-verification conjunction. |
| `statement-removal` | Elision of any §4.5 precedence rule, the purview scan, either revalidation, the nonce gate, the `--as` requirement. |
| `regex-quantifier-bound` | Gauge parsing and the `gh` stderr signature match — the two regexes on the surface. |

## Anti-tautology notes (apply to every task)

- Expected values derive from the fixture roster, never hardcoded. Each band's fixture is
  constructed to cross the boundary it names — a roster of gauges all below eligibility cannot
  reach `FORCE`.
- Every guard states its premise executably with `premise` (`tests/_shared/premise.ts:26`) or
  `premiseHolds` (`tests/_shared/premise.ts:36`), unconditionally relative to what it guards, never
  inside a `.each` callback whose case count can be zero, and proven on the case's OWN inputs.
- Every string-presence assertion (dry-run keystrokes, meta-test prose pins) gets all four
  pre-dispatch mutants: value emptied; expected content plus appended suffix; content present but
  not live; each discriminating parameter varied. Results recorded in the commit.

---

<!-- tasks: depth=2 red-contract -->

## Task 1 — gauge parsing and pressure bands in tenths

<!-- task: red=`pnpm vitest run tests/paneCompaction/bands.test.ts` red-state=authored red-target=`scripts/lib/pane-compaction-core.ts` why=`parseGauge and bandFor do not exist, so every band assertion throws on an undefined export` ac=AC-2 -->

**AC-2**'s band arithmetic is proved here. **AC-11 is NOT** — `FORCE`-versus-High-cost-`WAIT`
needs precedence and position, which are Tasks 2 and 4; plan round 1 caught this task's marker
claiming it. Parse the five-cell gauge to the integer `t = 2 × full + half` in `0..10`; classify into spec
§4.2's three bands. Fixtures cover **both boundaries at the `>=` sense** (`t = 5`, `t = 8`) plus all
four gauges observed in spec §3.7. An unparseable gauge yields `UNDETERMINED`, not a default band.

**Failure mode caught:** a band comparison written `>` instead of `>=` silently demotes every pane
sitting exactly on a boundary, and `t = 8` is `████░`, a gauge the live roster produces.

**This task also lands the core's purity guard, because it creates the core.** The precedent
`scripts/lib/ledger-claims-core.ts:4-8` states that a structural guard bans `node:child_process`
outright — and **probing shows no such guard exists for that directory**: the only purity walker is
`tests/specLint/_metaPureCore.test.ts`, whose `CORE_DIR` is `lib/specLint`. Nothing walks
`scripts/lib/`.

That gap matters here specifically. Task 9's zero-`EXPECTED_ENV_TOUCHING` argument is about the
**suites**; it says nothing about the **core**, and the core is where a direct spawn would defeat
the injected seam every classifier test asserts against. A fixture-injected surface proves nothing
if the code under test can also shell out behind it.

Add a walker over `scripts/lib/` modelled on `_metaPureCore.test.ts`: the same single `FORBIDDEN`
pattern (it covers bare imports, `from` clauses, `require()`, dynamic `import()`, template-literal
specifiers and subpaths, because every form contains the quoted-or-backticked specifier); the same
**walker sanity floor**, which is the guard's own premise and without which a mis-rooted walk
passes vacuously; and exactly **one** allowlist entry, `scripts/lib/ledger-git.ts`, the deliberate
spawn seam and the only file in the directory that really imports it (probed). An allowlist of one,
named with its reason, is a claim; a silent skip is not.

**Failure mode caught:** someone later adds a convenience `execFileSync` to the classifier core.
Every injected-surface test still passes — precisely the blindness the precedent's comment
describes — and nothing fails.

## Task 2 — precedence: total and deterministic

<!-- task: red=`pnpm vitest run tests/paneCompaction/precedence.test.ts` red-state=authored red-target=`scripts/lib/pane-compaction-core.ts` why=`classify does not exist, so the ten-rule ordered list has no implementation and the ordering cases cannot be expressed` ac=AC-4,AC-5,AC-11,AC-16,AC-17,AC-22 -->

**AC-4**, **AC-5**, **AC-11**, **AC-16**, **AC-17** and **AC-22** all rest on the ordering. Implement spec §4.5 as an ordered list of **twelve** rules, first match wins. One case per rule,
plus the ordering cases prior rounds found:

- **Round 2:** an **unowned** pane with a malformed marker must report `UNOWNED` (rule 2), not
  `UNDETERMINED` (rule 3) — ownership resolves from `paneId` alone and needs no marker.
- **Round 1:** a below-band pane with a missing marker field must be `UNDETERMINED`, not `HOLD` —
  validation precedes banding.

- **Round 4:** two roster entries sharing an agent name are both `UNDETERMINED` via **rule 2**,
  reached **before banding** — a fixture where both would otherwise be `COMPACT` (AC-22). Round 4
  found this asserted in a documented limit, the test matrix and an AC while no rule implemented
  it.

Also rule 1 (`NOT-AN-ARC`, AC-16) and rule 5 (marker/session mismatch, AC-17) with all three
session cases: matching, differing, and pane reporting none. And **rule 11**: `t >= 8` at a
High-cost position yields `WAIT`, not `FORCE` (AC-11) — the behavior change that makes the
demote-only bound unconditional.

A property test over the fixture corpus asserts every pane **selects exactly one** terminal rule.

**Failure mode caught:** two rules both claiming a pane with the outcome decided by an evaluation
order nobody wrote down — the defect round 1 found and round 2 found again in a different place.

## Task 3 — accept-set, `gh` discrimination, corpus

<!-- task: red=`pnpm vitest run tests/paneCompaction/acceptSet.test.ts` red-state=authored red-target=`scripts/lib/pane-compaction-core.ts` why=`the accept-set membership test does not exist, so an unknown agent_status is neither accepted nor named and the gh no-PR signature has no matcher` ac=AC-4,AC-15,AC-20 -->

Per spec §4.3. `agent_session` **optional** — absent is a valid observation, not a parse failure.
An absent round corpus reads as "no review in flight", not a fault. **An absent marker is likewise
legitimate** (AC-20): 3 of 38 live worktrees have none, one of them a real branch, and the pane is
classified from git and corpus signals alone rather than demoted.

The `gh` cases are the sharp ones (AC-15): the recognized no-PR signature (non-zero exit **and**
stderr matching `no pull requests found for branch`) is admitted; a non-zero exit with **any other**
stderr yields `UNDETERMINED`, never "no PR".

**Failure mode caught:** treating non-zero exit as "no PR". A `gh` outage then reads as "every pane
has no PR", which matches position row 8 at Low cost and yields `COMPACT`, silently bypassing the
hard `WAIT` for CI-green-unmerged. Probed on this branch before its PR existed: `gh pr checks`
exits 1 with empty stdout, and exit 1 is also auth failure, network error, and rate limit.

## Task 4 — position gradient: total, demote-only

<!-- task: red=`pnpm vitest run tests/paneCompaction/position.test.ts` red-state=authored red-target=`scripts/lib/pane-compaction-core.ts` why=`positionCost does not exist; the ordered row list has no implementation and rows 2 and 8 cannot be reached` ac=AC-3 -->

**AC-3** (CI-green-unmerged is a hard `WAIT` at every pressure) is the sharp one here. One case per row of spec §4.4 including **row 2** (PR with failing checks) and **row 8** (the
unconditional fallback), both added in round 2. The property test asserts every pane **selects**
exactly one row — totality and determinism. It does **not** assert predicate exclusivity, which
§4.4 explicitly withdraws as untrue and unnecessary.

`RECENT_COMMIT_WINDOW` (15 minutes) asserted on both sides of the boundary. Demote-only asserted:
where two rows match and ordering is uncertain, the more expensive cost wins. **Newest-row
selection** (AC-4 domain): multiple corpus rows across multiple files select by greatest `endedAt`;
rows without a parsable one are excluded rather than arbitrarily sorted; a tie yields
`UNDETERMINED`.

CI-green-with-PR-unmerged gets its own case **at critical pressure**, proving pressure cannot
override it.

**Failure mode caught:** the hard-`WAIT` row implemented as an ordinary high cost, so `FORCE`
overrides it and the driver fires on a PR that should have been merged.

## Task 5 — purview: unowned and contested

<!-- task: red=`pnpm vitest run tests/paneCompaction/purview.test.ts` red-state=authored red-target=`scripts/lib/pane-compaction-core.ts` why=`the registry reader does not exist, so an unowned pane cannot be distinguished from an owned one and a two-registry fixture has nothing to contest` ac=AC-5,AC-9,AC-24,AC-25 -->

**AC-5** (unowned and contested) and **AC-9** (registry path outside any worktree) are proved here. Read **every** file in the spec §5.6 purview directory, not just this session's. Unowned reported
`UNOWNED` and never drivable; **a pane in two registries yields `UNOWNED` contested**. The path is
asserted to be outside any worktree.

**Row staleness (AC-24), round 6.** A row whose recorded `branch` does not match the pane's
**current** agent name confers no ownership — the pane reports `UNOWNED` until re-registered.
Fixture: one registry row, then the pane's agent name changed to a different branch.

**Directory separation (AC-25), round 6.** Nonce records live in their own directory, never in the
purview directory, which is read exhaustively — a foreign file shape there has no defined verdict.
Asserted by resolving a nonce path and confirming it falls outside the exhaustively-read directory.

**Failure modes caught:** purview read from only the current session's file, so two orchestrators
each believe they own one pane — the two-writers race invariant 11 exists to prevent. And pane
reuse: without staleness, running a terminal pane on a new branch leaves the previous orchestrator
owning and able to drive an arc it never dispatched, with the session check no-opping because a
fresh worktree has no marker.

## Task 6 — CLI adapter and `--check` aggregation

<!-- task: red=`pnpm vitest run tests/paneCompaction/cli.test.ts` red-state=authored red-target=`scripts/pane-compaction.ts` why=`the CLI adapter does not exist; there is no envelope to assert is uncapped and no exit code to assert` ac=AC-1,AC-8,AC-21 -->

**AC-1** (report covers every roster pane) and **AC-8** (`--check` exit codes) are proved here.

**The `panes:compact` alias is part of this task, not a side effect.** `package.json` has no such
script at the plan's base commit, and direct-import tests would pass while the user-facing command
named in AC-1 stayed absent — plan round 1's finding. The task adds the alias **and** asserts it:
read `package.json`, require a `panes:compact` entry, and require it to resolve to the adapter this
task creates. A test that imports the module but never checks the alias cannot fail when the
command is missing.

Envelope `{status, degraded, panes}`, **never capped**, with the builder exported so that is
provable — the `reportEnvelope` reasoning at `scripts/ledger-claims.ts:44`. The uncapped assertion
uses a fixture roster larger than any plausible cap: the live roster is ~12 panes, so an end-to-end
assertion against the real machine could not fail against the mutant it names.

`--check --as <id>` aggregation per spec §5.3: **purview panes only**; `UNDETERMINED` → 2,
outranking `COMPACT`/`FORCE` → 1; `NOT-AN-ARC` and `UNOWNED` reported but excluded from the exit.

Target resolution (AC-21): an unresolvable target exits 1 naming it and sends nothing, discriminated
by herdr's structured `agent_not_found` code rather than by message text; two roster panes sharing
an agent name are both `UNDETERMINED`.

**Failure mode caught:** aggregating over the whole roster, so an orchestrator owning part of a
shared machine can never see exit 0 or 1 — round 2's F8.

## Task 7 — the three commands: dry-run bytes, literal texts, no interrupt

<!-- task: red=`pnpm vitest run tests/paneCompaction/driver.test.ts` red-state=authored red-target=`scripts/lib/pane-compaction-core.ts` why=`the send planner does not exist, so no command has bytes to compare against spec 5.2` ac=AC-6,AC-7,AC-14,AC-18 -->

**AC-6** is the byte-for-byte dry-run assertion. `--dry-run` on each of `--checkpoint`, `--compact` and `--resume` sends nothing and prints that
command's spec §5.2 bytes **byte-for-byte**, including `CHECKPOINT_TEXT` and `RESUME_TEXT` verbatim
with `<NONCE>` substituted. Every sending mode rejects `--all`, requires a single named target, and
requires `--as`; a missing `--as` exits 1 rather than inferring an orchestrator (AC-7). The
checkpoint text is asserted to instruct **against** committing (AC-14).

**The no-interrupt pin (AC-18)** is asserted on **two** paths, not one. Round 3 correctly observed
that a dry-run-only assertion cannot see an Esc emitted conditionally by the live adapter, so:

- the dry-run output contains no `\x1b` byte for any fixture input, **and**
- the live send path is exercised through a **spy on the send surface**, asserting no emitted
  string contains `\x1b`, across `working`, `idle` and `done` targets.

**Failure mode caught:** an Esc reappearing in any code path, including one reachable only when the
adapter actually sends. Prose cannot hold that line — the repo's record is that a same-vector
decision survives only when a structural defense lands with it.

## Task 8 — nonce verification and per-command revalidation

<!-- task: red=`pnpm vitest run tests/paneCompaction/revalidate.test.ts` red-state=authored red-target=`scripts/lib/pane-compaction-core.ts` why=`neither the nonce gate nor per-command revalidation exists, so a fixture whose marker carries a stale nonce is compacted anyway` ac=AC-13,AC-19,AC-23 -->

**Nonce: three properties, three replays (AC-19, AC-24).**

**Single-use, and the ordering is asserted rather than implied.** `--compact` consumes the record
**before** sending. Running it twice in a row is necessary but **not sufficient** — plan round 1
was right that the sequential test passes whether consumption happens before the send or after a
successful one, so it cannot prove the ordering the design claims. The discriminating case makes
the **send throw**, then asserts the record is *already* consumed: under consume-after, the record
would survive a failed send and stay replayable. That is the failure path the ordering exists to
protect, and only that case distinguishes the two implementations.

**No cross-orchestrator property is asserted, and no test pretends to establish one.** Round 6
dropped the "exactly one `/compact` across competing orchestrators" claim after rounds 4, 5 and 6
each drew a new race on a nonce accreting toward it. Freshness-versus-marker and atomic
compare-and-consume came out with the claim. A test asserting cross-orchestrator exclusion would
now be asserting something the spec deliberately does not promise.

**`--resume`'s own predicate (AC-13, AC-23).** Refuses whenever **any** of §4.5 rules **1-8**
fires — one case per rule, including duplicate agent names (round 5) and CI-green-with-PR-unmerged
(round 6, which is pressure-INDEPENDENT and so was wrongly excluded as "banding"). Round 5 found the earlier hand-picked list
omitting exactly that one, which would have let `--resume` drive a pane rule 2 had classified
`UNDETERMINED` *because* a later command cannot resolve its target. Asserted to apply **none** of
the banding rules 8-12: a successful compaction drops pressure below eligibility, so
`COMPACT`/`FORCE` is false exactly when `--resume` is correct.

**Nonce verification (AC-19), four cases**, the fourth being the defect round 3 found:

1. nonce matches the recorded value → `--compact` sends.
2. nonce absent → exit 1, nothing sent.
3. nonce differs → exit 1, nothing sent.
4. **marker mtime newer and `next` non-empty but the nonce is stale** → exit 1, nothing sent. This
   is the concurrent-writer false positive: a stage progression, a `blockedOn` change, or a
   takeover rewriting `sessionId` all satisfy the old mtime-plus-`next` predicate while proving
   nothing about this checkpoint.

**Per-command revalidation (AC-13):** `--checkpoint` and `--compact` each recompute the verdict
immediately before sending and refuse, exiting 1 without sending, when the fresh verdict is not
`COMPACT`/`FORCE` or purview does not resolve to `--as` uncontested. One case per condition, each
safe at report time and unsafe at command time.

**Failure mode caught:** compacting a target whose checkpoint never landed — the exact context loss
this feature exists to prevent — and compacting one that became `WAIT` between two commands.

## Task 9 — mutation enrolment

<!-- task: red=`pnpm vitest run tests/paneCompaction/enrolment.test.ts` red-state=authored red-target=`tests/mutation/source/registry.ts:151` why=`the registry holds no row whose sourcePath is the classifier core, so the enrolment assertion finds no surface to read operators and scoreFloor from` ac=AC-10 -->

**`pnpm mutation:guards` takes no target flag** — it is
`VITEST_INCLUDE_MUTATION_HARNESS=1 vitest run --project mutation tests/mutation/guardSurfaces.gate.test.ts`
(`package.json`), gated on the env var and running every enrolled surface. A `red=` naming a
`--target` flag would be a plan defect; the RED here is an authored enrolment assertion.

Add one `GuardSurface` row (`tests/mutation/source/registry.ts:12-38`): `id`, `sourcePath`,
`suitePaths` (Tasks 1-8's suites), `operators: [...OPERATOR_NAMES]`, **`scoreFloor: 0.95`**, an
`accepted` array,
and a **`control`** — a deliberately behavior-changing edit the surface's own suite MUST notice,
which exists because a harness whose overlay silently failed to apply reports a PERFECT score with
every mutant run against clean source. The `control` is RUN, not merely asserted non-equal.

`0.95` is the house value, not a guess: it is what `ledgerClaimsCore` carries
(`tests/mutation/source/registry.ts:426`) — the surface this one is modelled on — along with
`citationIntent`, `redContract`, `taskContract`, `destructiveFileAnalysis` and `pgCronSmokes`.
`ledgerGit` sits at `0.9` and `reviewRoundCount` at `1`; neither shape applies here. Its comment
also states the rule this task inherits: **the floor is a FLOOR, not a snapshot** — pinning it at
the measured score turns every future line of the module into a gate failure before it has a test,
which is how a ratchet becomes a wall.

**The `control`** must be an edit this surface's own suite provably notices. Candidate:
inverting the eligibility comparison (`t < 5` → `t >= 5`), which flips `HOLD` to a banded verdict
for the below-eligibility gauges in Task 1's fixtures and is asserted in-process. It is RUN, not
merely asserted non-equal to the source — the precedent row records that an earlier version
computed a `broken` string, asserted it differed, and never passed it to the runner, so the
assertion only proved a string existed in a file.

**Enrolment fans out to TWO other registries, and missing either reds the gate before any mutant
is scored.**

`tests/mutation/guardSurfaces.gate.test.ts:180-182` asserts
`Object.keys(EXPECTED_LEDGER_KINDS).sort()` equals `GUARD_SURFACES.map(s => s.id).sort()` — exact
key parity. A new surface therefore needs its own `EXPECTED_LEDGER_KINDS` entry, enrolled with an
**empty ledger** (`{}`) the way the 2026-08-15 arms surfaces were, since this surface starts with
no accepted survivors. Plan round 1 caught this omission.

**And to the premise contract.** `tests/mutation/_metaPremiseContract.test.ts` walks
the enrolled suites — so a newly enrolled surface is covered by default rather than silently exempt
— and requires a per-suite entry in its `EXPECTED_ENV_TOUCHING` map, declared **independently of
the classification** so that a recognizer which silently stops matching reds instead of reporting a
clean corpus it no longer understands. All eight of this surface's suites declare **`0`**, and the
reason is structural rather than incidental: `ENVIRONMENT_SOURCES.modules` is exactly
`["node:child_process", "scripts/lib/ledger-git"]` (`tests/mutation/source/premiseScan.ts:29-31`),
and the suites import neither. **That is only true because the core takes its git/gh/fs/clock
surface by injection** — the core itself may reach `child_process`, since the scanner classifies
suites, not targets. If a later task ever has a suite import a real surface it must declare a
non-zero count, the way `tests/scripts/ledgerGitSpawnSeam.test.ts` declares 16 for importing
`realGitSurface`. The honest zero here matches `tests/scripts/ledgerClaims.test.ts` and
`tests/db/destructiveFileAnalysis.test.ts`; it is not an exemption.

**Assert at least one generated site per declared operator** before running the gate. `pnpm
mutation:sites` prints the generated sites; the enrolment test requires every name in the surface's
`operators` array to appear at least once. Without it a declared operator with no site on this
surface is dark, and the gate — which checks only that total mutants exceed zero — stays green.

Then `pnpm heavy pnpm mutation:guards` (full-suite vitest — heavy phases take a slot), recording
the score and unaccepted-survivor set for the round-1 diff brief's `GUARD SURFACE:` line. Run
`pnpm vitest run tests/mutation/_metaPremiseContract.test.ts` in the same task — enrolment that
reds the premise contract is not enrolment.

**Also closes spec §7 limit 1:** a throwaway-pane probe confirming a queued `/compact` executes on
**natural** turn completion, not only when the queue is drained by an interrupt. P5 was measured
under the interrupt path; the spec records the residual and this step retires it.

## Task 10 — documentation contract

<!-- task: red=`pnpm vitest run tests/docs/_metaPaneCompactionContract.test.ts` red-state=authored red-target=`docs/agents/orchestrator-pane-compaction.md` why=`the write-up does not exist and AGENTS.md carries no pointer to it, so the meta-test's pin has nothing to match` ac=AC-12 -->

**AC-12** is proved by the meta-test below. Write the write-up named in spec §5.6 under `docs/agents/` (protocol, bands, probe findings), add the
AGENTS.md pointer under cross-cutting discipline, and pin them against each other per spec §10. The
meta-test asserts the pointer names the write-up path, that the write-up states the
**no-interrupt** decision, that the no-commit contract is stated, and that neither document carries
a band value contradicting spec §4.2. Neither document restates the other.

<!-- tasks: end -->

---

## Dispatch pre-conditions (both gates blocked a dispatch on this arc already)

The spec round-1 dispatch was blocked by the convergence gate hook for a bound phrased "never
silently driven on a wrong verdict" instead of the canonical form. Both gates match on **literal
phrasing**, so the strings below are copied, not paraphrased.

1. **Convergence gate** — every brief carries all three or the dispatch is blocked before Codex is
   reached: the phrase `correct or signaled, never silently wrong`; a line beginning
   `PROBE DOMAIN:`; and a threat-model fence. The gate strips quoted and backticked spans before
   scanning for the forbidden enumeration-as-criterion form, so quoting that form in order to
   reject it is safe.

2. **Guard-surface gate** — the round-1 `--stage diff` brief must carry, on one line:

   ```
   GUARD SURFACE: <surface> MUTATION SCORE: <killed>/<total>, 0 unaccepted survivors
   ```

   or `CANNOT-EXPRESS: <probe citation>`. The wrapper exits 2 before dispatching otherwise, and
   never judges the declared value against the registry floor. This is why Task 9 precedes the
   whole-diff review.

## Checklist

1. Tasks 1-10, TDD each, one commit per task
2. Self-review — re-run the numeric sweep and self-consistency sweep across the whole document
3. **Adversarial review (cross-model)** — codex-guard `--stage plan`, then `--stage diff`
4. Execution handoff / closeout — the spec stage passed `ROUND_THRESHOLD` (`4`,
   `lib/reviewRounds/constants.ts:11`), so the arc owes the round-economy filing that already
   exists beside the branch's corpus file: an `**Examined:**` line plus at least one of
   `**Mechanizable:**` / `**Judgment:**` / `**Infra:**`
