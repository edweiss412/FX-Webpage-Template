<!-- spec-lint: not-ui — no UI surface: this change touches a CLI script, a shared parser module, the preflight harness, two meta-tests, and AGENTS.md prose. impeccable-gate: N/A. -->

# Ledger claim visibility — read in-flight work off origin's branches, not off main

**Date:** 2026-08-03
**Branch:** `chore/ledger-claim-visibility`
**Backlog entries:** none opened for this work (see §9.1); one filed as a by-product (§9.2)
**Status:** draft, pre-review
**impeccable-gate: N/A — no UI surface**

---

## 0. The defect, stated precisely

AGENTS.md invariant 12 (`AGENTS.md:27`) requires that work in flight be declared in the ledger.
The declaration is a bold-run field on the entry's meta line (`AGENTS.md:30`), written at Stage 0
and removed at Stage 4.4 (`AGENTS.md:38`).

The marker is written **on the working branch**. It reaches `origin/main` only when the PR merges,
which is the same moment Stage 4.4 removes it. A session that reads `origin/main` to pick its next
task therefore never sees a marker for work that is genuinely in flight. The invariant announces
work exclusively to the sessions that no longer need the announcement.

Nothing in the existing guard could have caught this. `tests/docs/_metaLedgerInProgress.test.ts`
checks the marker's shape, that a `Branch`/`PR` is present, that the value is well-formed
(`tests/docs/_metaLedgerInProgress.test.ts:123`), and that the branch still exists on origin
(`tests/docs/_metaLedgerInProgress.test.ts:201`). Every rule is sound, and every rule is evaluated
against the checkout it runs in. A guard on the branch cannot warn a session that never fetches the
branch.

**The fix does not move the marker.** It adds a reader that resolves claims across every live
branch on origin, and wires that reader into a step every session already runs. The writer
contract in invariant 12 is unchanged, so no new state is introduced that can outlive the branch
it describes.

---

## 1. Resolved scope — do not relitigate

| Decision | Status | Ratification |
| --- | --- | --- |
| The marker stays **on the branch**. It is not moved to main, not duplicated into a separate claims file, and not replaced by a PR-body convention | Ratified by the user at the design gate, 2026-08-03 | Any claim stored outside the branch survives the branch's death, which is precisely the stale-marker rot invariant 12 exists to stop (`AGENTS.md:36`) |
| The reader is **additive**. `AGENTS.md:27-38` keeps its writer contract verbatim except for the two amendments in §6 | Ratified | §6 lists the complete AGENTS.md delta; anything not listed there is unchanged |
| The `inferred` signal ships alongside `declared`, and is **advisory only** | Ratified by the user at the design gate, 2026-08-03 | §2.3 measures that 3 of the 4 open PRs carry no marker, so a declared-only reader would be blind to most live work; §4.4 fences it to warn-not-fail so a reconciliation-log edit can never block a branch |
| Stage 4.4's marker removal moves **into the PR's last commit**, before the merge | Ratified by the user at the design gate, 2026-08-03 | §2.4 shows the observed failure this closes |
| No new guard asserting "main carries no marker" | Out of scope, deliberately | The existing staleness rule already fails on exactly that state and did so in production (§2.4). A second guard would restate it, and could not run on a branch anyway, since a branch's own checkout legitimately holds the marker |
| The reader does **not** open a backlog row for its own work | Ratified | `AGENTS.md:38` — "A run that finds no matching ledger entry does nothing". See §9.1 |
| `bodyDefinedIds` over-minting is **filed, not fixed** | Out of scope | Brief instruction, 2026-08-03; filed as §9.2. It is latent, not live, and belongs to `tests/docs/_ledgerMdast.ts:346`, a surface this spec does not touch |
| The script is TypeScript run through `tsx`, not `.mjs` | Ratified | `tests/docs/_metaLedgerReferentialIntegrity.test.ts:106` scans tracked `*.md`/`*.ts`/`*.tsx` only. A `.mjs` reader would sit outside the citation guard's reach entirely; `package.json:132` already carries `tsx` as a devDependency and ~20 sibling scripts run that way |

---

## 2. Probe log — what is actually true

All probes run 2026-08-03 in `/Users/ericweiss/FX-worktrees/ledger-claim-visibility` at
`96a79f596`, which is `origin/main`.

### 2.1 The collision that motivated this

- `11:42:49 CDT` — `52247dcd1`, *"docs(backlog): declare both entries in flight per invariant 12"*,
  marks `BL-LEDGER-GUARD-BODY-DEFINED-IDS` and `BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`. On its own
  branch, `chore/scanner-precision-cluster`.
- `17:07:52 CDT` — at `origin/main` tip `deda7d989`, both rows read `**Status:** OPEN.`
- `17:31 CDT` — a second session reads `BACKLOG.md` at that tip, sees OPEN, and starts the same two
  rows on `chore/ledger-body-ids-enum-scan-widen`.
- `~18:40 CDT` — `chore/scanner-precision-cluster` merges as PR #680 and closes both rows.
- PR #689 is the superseded duplicate: hours of spec, TDD, probes, and two Codex reviews, discarded.

The marker was written correctly and on time. Reading it was the impossible part.

### 2.2 Origin already carries every claim

```
$ git fetch origin --prune && git show origin/chore/ledger-body-ids-enum-scan-widen:BACKLOG.md \
    | grep -n 'IN PROGRESS'
94:**Status:** IN PROGRESS · **Branch:** chore/ledger-body-ids-enum-scan-widen
```

One fetch makes every branch's ledger readable by content. No new state has to be stored anywhere
for a claim to be resolvable, which is what makes the claim self-cleaning: delete the branch and
the claim is gone with it.

### 2.3 Branch census — the case for the inferred signal

17 heads on origin, 16 excluding `main`. One (`feat/sync-feed-undo-announce`) is already merged into
`origin/main`. The remaining 15 split cleanly by tip age:

| Tip age | Count | Character |
| --- | --- | --- |
| under 4 hours | 7 | live work, several sessions shipping concurrently |
| 7 days to 2 weeks | 8 | abandoned spikes, CI probes, scratch branches |

Nothing sits between 4 hours and 7 days, so a staleness threshold anywhere in that gap separates the
two populations. §4.3 sets it at 14 days, well clear of the boundary on the conservative side.

Of the 4 branches with open PRs, **exactly 1 carries a marker**. A declared-only reader would
report one claim and stay silent about three live PRs, so the `inferred` signal is what gives the
report coverage of branches whose session skipped Stage 0.

### 2.4 The Stage 4.4 window, observed

The reconciliation log on `fix/parse-warning-code-recognizer` records the failure directly. At
`git show origin/fix/parse-warning-code-recognizer:BACKLOG.md`, line 7:

> Also cleared a stale `IN PROGRESS` marker left on `BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS` by
> merged PR #679, which had turned main red.

The mechanism: Stage 4.4 removes the marker *after* the `0  0` check (`AGENTS.md:38`), so the
marker merges into main naming a branch that the merge just deleted, and the origin-existence rule
at `tests/docs/_metaLedgerInProgress.test.ts:201` fails on main until someone clears it. The guard
worked exactly as designed; the pipeline ordering is what is wrong.

**This text does not exist on `origin/main`** (`git show origin/main:BACKLOG.md | grep -c 'PR #679'`
returns `0`). It is a second instance of this spec's own thesis: evidence of an invariant-12 failure
sitting on a branch, invisible to any session reading main.

### 2.5 What the reader can reuse

`tests/docs/_metaLedgerInProgress.test.ts` already exports the pieces a claim reader needs:
`ledgerFiles` (:46), `ledgerItems` (:94), `isInProgress` (:119), `flightFieldsOn` (:120), and the
`LedgerItem` type (:55), built on the private `fieldsOfLine` (:70). It is a distinct concern from
`tests/docs/_ledgerMdast.ts`, whose `bodyDefinedIds` (:346) and `ledgerIds` (:390) handle id
definition and reference integrity rather than meta-line fields. Only the field parser moves.

### 2.6 Where the guard will run

`PARALLEL_TEST_GLOBS` (`vitest.projects.ts:86`) carries `"tests/docs/**/*.test.{ts,tsx}"` as an
explicit entry at `vitest.projects.ts:126`, consumed as the `parallel` project's include
(`vitest.config.ts:115`).
That project runs in `unit-suite.yml`, job `unit-suite-nodb`, via
`pnpm exec vitest run --project=parallel --shard=${{ matrix.shard }}/3`
(`.github/workflows/unit-suite.yml:165`). A new test under `tests/docs/` is picked up with no
config change.

**The checkout there is shallow.** `actions/checkout@v4` at `.github/workflows/unit-suite.yml:144`
sets no `fetch-depth`, so depth 1, followed by a deliberate single-ref fetch at
`.github/workflows/unit-suite.yml:151`:

```
git fetch --no-tags --depth=1 origin main:refs/remotes/origin/main
```

whose comment states that `fetch-depth: 0` was rejected because full history regresses the
unit-suite wall clock. A collision guard must therefore fetch the heads it needs itself, at depth 1,
and must not assume any remote-tracking ref beyond `origin/main` exists. §7.3 does exactly that.

### 2.7 Network precedent in tests

`tests/docs/_metaLedgerInProgress.test.ts:201` is the only test in the repo that touches the
network, via `execFileSync("git", ["ls-remote", "--heads", "origin"])` with a 30 s timeout. Every
other `git` call under `tests/` is local: `git ls-files` in
`tests/docs/_metaLedgerReferentialIntegrity.test.ts:107` and
`tests/docs/retiredIdentifierReferences.test.ts:44`, and `git rev-parse --verify origin/main` at
`tests/adminAlerts/_metaResolveIntentLifecycle.test.ts:74` with `git show origin/main:<path>` eleven
lines below it — which is what the depth-1 `origin/main` fetch in §2.6 exists to serve.

### 2.8 Precedent for a script module shared with tests

`scripts/lib/` holds three TypeScript modules today. Two are imported by both a script and a test:
`scripts/lib/validation-env.ts:46` (`loadValidationEnv`) is used at `scripts/observe.ts:7` and by
`tests/scripts/validation-env.test.ts:24`; `scripts/lib/validation-smoke-target.ts` is used at
`scripts/validation-smoke.ts:39` and imported by a test as
`@/scripts/lib/validation-smoke-target` (`tests/scripts/validation-smoke-base-url.test.ts:12`),
resolving through the `"@/*": ["./*"]` alias at `tsconfig.json:26`. §3.1 follows this shape exactly.

### 2.9 The preflight harness

`scripts/preflight-env.mjs` is pure ESM with zero third-party imports (`node:fs`, `node:child_process`,
`node:path`, `node:url` only). Its documented exit codes are `0 ok · 1 missing/invalid env · 2 DB
unreachable` (`scripts/preflight-env.mjs:20`), it takes `--no-db` (`scripts/preflight-env.mjs:28`),
and it already spawns a subprocess: `spawnSync("psql", …)` with a 10 s timeout
(`scripts/preflight-env.mjs:135`). Spawning one more bounded subprocess is consistent with what it
already does. `grep -rn "preflight" .github/workflows/` returns nothing, so **preflight runs in no CI
workflow** and the added work costs CI nothing.

---

## 3. What ships

<!-- spec-lint: ignore — this file is created by this spec; it is not tracked until Task 1 lands -->

### 3.1 `scripts/lib/ledger-fields.ts` — the shared field parser

A pure module, no I/O, moved verbatim from `tests/docs/_metaLedgerInProgress.test.ts`. It exports
`LedgerItem`, `fieldsOfLine`, `ledgerItems`, `isInProgress`, `flightFieldsOn`, `FLIGHT_FIELDS`,
`BRANCH_SHAPE`, `PR_SHAPE`, and the `HEADING` pattern. `ledgerFiles` moves too, taking its root
directory as an argument as it already does today (`tests/docs/_metaLedgerInProgress.test.ts:46`).

The move is behavior-preserving: no regex, no bound, and no field name changes. The existing
planted-input suite (`tests/docs/_metaLedgerInProgress.test.ts:224-287`) stays where it is and
imports the module, becoming the parser's regression coverage rather than a test of a local helper.

Two properties this module must keep, because a claim reader depends on them: the 12-line body
window that stops a `**Branch:**` quoted deep in a discussion from registering as a field
(`tests/docs/_metaLedgerInProgress.test.ts:106`), and the non-greedy bold-run split that keeps a
meta line from collapsing into one field (`tests/docs/_metaLedgerInProgress.test.ts:70-86`).

<!-- spec-lint: ignore — this file is created by this spec; it is not tracked until Task 2 lands -->

### 3.2 `scripts/ledger-claims.ts` — the reader

Wired as `"ledger:claims": "tsx scripts/ledger-claims.ts"` in `package.json`.

**Resolution, in order:**

1. `git fetch origin --prune --quiet`, 30 s timeout. On failure, fall through to whatever
   remote-tracking refs already exist locally and set the stale-data flag (§4.1).
2. Candidate branches: every `refs/remotes/origin/*` except `origin/main` and `origin/HEAD`, minus
   every branch reported by `git branch -r --merged origin/main`. A merged claim has either landed
   or died; either way it is not in flight.
3. For each candidate, for each name in `ledgerFiles()`: `git show <ref>:<file>`. A file absent at
   that ref is skipped silently, since a branch may predate a ledger's creation.
4. `declared` claims: entries where `isInProgress` holds. The claim carries the entry's own
   `Branch`/`PR` fields when present, and the ref name regardless.
5. `inferred` claims: run `git diff --unified=0 $(git merge-base origin/main <ref>) <ref> -- <ledgers>`,
   map each changed line number back to the entry whose span contains it, and record any entry not
   already `declared` for that branch.
6. PR numbers: `gh pr list --state open --json number,headRefName --limit 100`, joined on branch
   name. Absent or failing `gh` leaves the column blank and is never an error.

**Output**, one row per (row id, branch), grouped by row id, branches sorted newest tip first:

```
BL-LEDGER-GUARD-BODY-DEFINED-IDS
  declared  chore/ledger-body-ids-enum-scan-widen   PR #689   23m ago
BL-SOME-OTHER-ROW
  inferred  fix/nojs-loading-shell-notice           PR #690    3m ago

stale (tip older than 14 days) — listed, not dropped:
  inferred  spike/serial-audit                                14d ago
```

### 3.3 `--check` mode

`pnpm ledger:claims --check BL-A BL-B` is the Stage 0 pre-flight call.

- Exit **1** if any named id is `declared` by a branch other than the current one. Message names the
  id, the branch, and the PR if known.
- Exit **0** with a `WARN:` line if the only collisions are `inferred`.
- Exit **0** silently if there are none.
- Exit **2** on usage error (no ids given, unknown flag).

Also `--json` for machine consumption, emitting the same claim set as an array of
`{id, branch, kind, pr, tipAgeDays, stale}`.

### 3.4 Preflight surfacing

`scripts/preflight-env.mjs` gains a final step that spawns `tsx scripts/ledger-claims.ts` with a
**15 s** timeout and prints its table. Governed by:

- It **never** changes preflight's exit code. Its own failure, timeout, or non-zero exit prints one
  line and is otherwise ignored.
- Skipped by `--no-claims`, and by `PREFLIGHT_NO_CLAIMS=1` for non-interactive callers.
- Skipped when `process.env.CI` is set, so the behavior is unconditional locally and absent in CI
  even if a workflow starts calling preflight later.

This is the whole reason the reader gets run without anyone choosing to run it. Invariant 11
(`AGENTS.md:25`) already requires `pnpm preflight` in the setup of any worktree that runs tests, so
every branch touching code sees the live-claims table before its first edit, with no new step to
remember.

**The residual gap is honest and named:** that same line lets docs-only branches skip preflight, and
a docs-only branch is exactly what `chore/scanner-precision-cluster` looked like when it marked its
two rows (§2.1). Those branches are covered by Stage 0's explicit `--check` call (§6.2) and by the
CI backstop (§7.3), neither of which depends on preflight running.

---

## 4. Guard conditions

Every input, and what the reader does with it.

### 4.1 Environment

| Condition | Behavior |
| --- | --- |
| `git fetch` fails (offline, auth, timeout) | Use existing remote-tracking refs; print `WARN: claims computed from stale refs (fetch failed: <reason>)`; `--check` degrades to exit 0 with a WARN locally, and **fails** under `CI` (§7.3) |
| No `refs/remotes/origin/*` at all | Print `no origin branches resolvable`; `--check` exits 0 locally, fails under `CI` |
| `gh` absent or not authenticated | PR column blank. Never an error, never a warning |
| `gh` returns malformed JSON | Same as absent |
| Detached HEAD, or current branch unresolvable | Treated as "no current branch", so every declared claim counts as belonging to another branch. Fails loud rather than quiet |
| More than 100 candidate branches | Report the first 100 by tip recency and print `N branches not shown`. A silent cap is the failure mode `AGENTS.md` names explicitly, so the count is always printed |

### 4.2 Data

| Condition | Behavior |
| --- | --- |
| A ledger file missing at a branch's tip | Skipped for that branch. A branch may predate the file |
| A ledger file present but unparseable at a ref | That file contributes no claims; print `WARN: <ref>:<file> parsed 0 entries` |
| **Vacuity**: every branch yields 0 entries while `origin/main` yields more than 100 | Print `WARN: claim parser matched nothing across N branches — treat this report as unreliable` and exit 2 in `--check`. A parser that silently matches nothing would make the whole report a false all-clear, which is the one failure this tool must never produce quietly |
| An entry declared in-progress with no `Branch`/`PR` field | Still reported as `declared`, keyed on the ref it was found at. Field validity is `tests/docs/_metaLedgerInProgress.test.ts`'s job, not the reader's |
| The same id declared by two branches | Both rows printed. This IS the collision; `--check` exits 1 |
| An id declared on a branch and also present on `origin/main` as in-progress | Reported once per branch. Main is never a candidate, so main's own copy contributes nothing |

### 4.3 `--check` arguments

| Condition | Behavior |
| --- | --- |
| Zero ids given | Exit 2, usage message |
| An id matching no entry on any ref, including main | Print `note: <id> is not yet defined anywhere` and continue. A branch may be minting the row |
| An id claimed only by the current branch | Not a collision. Exit 0 |
| Id given in lower case or with surrounding backticks | Normalized: backticks stripped, compared case-insensitively |
| Duplicate ids in the argument list | De-duplicated before checking |

### 4.4 The declared/inferred boundary

`inferred` never fails anything. A branch that edits the reconciliation-log line at `BACKLOG.md:7`
touches text mentioning dozens of ids, and mapping a diff hunk to an entry span is a heuristic. The
soft signal earns its place by covering the three-in-four branches that carry no marker (§2.3); it
does not earn the right to block work. §7.2 pins this asymmetry with a planted case.

Every numeric bound in this design, defined once here and referenced everywhere else:

| Bound | Value | Referenced by |
| --- | --- | --- |
| Stale-tip threshold | 14 days | §2.3, §3.2, §7.1 |
| Fetch timeout | 30 s | §3.2, §7.3 |
| Preflight budget for the claims subprocess | 15 s | §3.4 |
| Branch report cap | 100, with the omitted count always printed | §4.1 |
| Open-PR query limit | 100 | §3.2 |
| Meta-line body window | 12 lines, inherited unchanged from the parser being moved | §3.1 |

No other numeric bound exists in this design.

---

## 5. Failure modes this design deliberately accepts

Per the preparedness posture, each is signaled rather than silent.

1. **A branch that has done no ledger work yet is invisible.** A session that cut a branch, skipped
   Stage 0, and has not touched a ledger produces neither signal. The `--check` gate cannot see it.
   Mitigated only by Stage 0 compliance, which §6 makes a named step.
2. **`inferred` over-reports on reconciliation-log edits.** Accepted; that is why it warns rather
   than fails (§4.4).
3. **A ~15-minute window at the end of a run.** Under §6's amended Stage 4.4 the marker is removed
   in the PR's last commit, so between that commit and the merge the branch declares nothing. The
   `inferred` signal still covers it, and AGENTS.md requires the merge to follow CI-green in the
   same turn.
4. **Two sessions racing inside one fetch interval.** Both can pass `--check` if neither has pushed
   its marker yet. Narrowed, not closed: Stage 0 pushes the marker before work begins, so the window
   is the seconds between two Stage 0 runs rather than the hours §2.1 measured.

---

## 6. AGENTS.md delta

Exactly three edits to invariant 12 (`AGENTS.md:27-38`). Nothing else in the file changes.

**6.1 — the reading rule.** A new paragraph after the "declared and never inferred" paragraph:

> **A claim is read from origin's branches, never from main.** The marker is written on the working
> branch and reaches `origin/main` only at merge, which is the moment it stops being true, so main
> is structurally the one place the signal can never appear. `pnpm ledger:claims` resolves claims
> across every live, unmerged branch on origin, and `pnpm preflight` prints that table in every
> worktree before the first edit.

**6.2 — Stage 0 gains the pre-flight check.** The pipeline-wiring sentence at `AGENTS.md:38` gains,
before the marker is written:

> Stage 0 first runs `pnpm ledger:claims --check <ids>` for every entry the branch will close. A
> non-zero exit means another live branch already declares that row: stop and reconcile before
> cutting the branch, rather than discovering it at merge.

**6.3 — Stage 4.4's removal moves earlier.** `AGENTS.md:38` currently reads "**Stage 4.4**, after
the `0  0` check, removes it." It becomes:

> **Stage 4.4** removes it in the PR's last commit, before the merge, not after the `0  0` check. A
> marker that merges into main names a branch the merge just deleted, and the origin-existence rule
> in `tests/docs/_metaLedgerInProgress.test.ts` then fails on main until somebody clears it — which
> is exactly what merged PR #679 did.

The two `CronDelete` sites and the pane/agent clearing at `AGENTS.md:135` stay at Stage 4.4 as
written; only the ledger marker moves.

---

## 7. Tests

TDD per task, invariant 1. Each names the failure it catches.

<!-- spec-lint: ignore — this file is created by this spec; it is not tracked until Task 3 lands -->

### 7.1 `tests/scripts/ledgerClaims.test.ts` — the reader, against planted git state

Catches: a reader that reports a claim from a merged branch, drops a stale-tipped branch instead of
listing it, or mis-keys a claim to the wrong branch. Fixtures are temp git repos built in-test,
following the `spawnSync("git", ["init", …])` precedent at `tests/specLint/cli.test.ts:35`, so no
network is involved.

Cases: a declared claim on an unmerged branch is reported; the same branch merged into main is not;
a branch whose tip is 20 days old is reported under `stale` and not dropped; two branches declaring
one id both appear; an id declared only by the current branch is not a collision; a ledger file
missing at a ref is skipped without error.

<!-- spec-lint: ignore — this file is created by this spec; it is not tracked until Task 4 lands -->

### 7.2 `tests/scripts/ledgerClaimsCheck.test.ts` — exit codes

Catches: the asymmetry in §4.4 collapsing, in either direction. A declared collision must exit 1; an
inferred-only collision must exit 0 and print `WARN`; zero ids must exit 2; the vacuity case in §4.2
must exit 2 rather than reporting a false all-clear.

Anti-tautology: expected ids are derived from the fixture repo's own planted ledger text, never
hardcoded, so a reader that returns a fixed list cannot pass.

<!-- spec-lint: ignore — this file is created by this spec; it is not tracked until Task 5 lands -->

### 7.3 `tests/docs/_metaLedgerClaimCollision.test.ts` — the CI backstop

Catches the §2.1 collision at PR time when Stage 0's `--check` was skipped: for every row **this**
branch declares in-progress, no other unmerged origin branch may declare the same row.

- Declared-versus-declared only. No `inferred` input, so reconciliation prose cannot fail a PR.
- Fetches what it needs itself: `git fetch --no-tags --depth=1 origin '+refs/heads/*:refs/remotes/origin/*'`,
  30 s timeout. Depth 1 is sufficient because only tip file content is read, and it respects the
  wall-clock constraint recorded at `.github/workflows/unit-suite.yml:148`.
- Under `CI`, a fetch failure **fails** the test, matching the deliberate no-skip posture at
  `tests/docs/_metaLedgerInProgress.test.ts:199`. Locally, a fetch failure skips, so an offline
  `pnpm test` does not go red for an environmental reason.
- Vacuous-pass guard: asserts the fetch resolved at least one non-main head before asserting
  anything about collisions.
- Planted-input suite proving the rule fires, in the shape of
  `tests/docs/_metaLedgerInProgress.test.ts:224`.

Registry note: this file plants synthetic `BL-` ids, so it needs a row in `NOT_CITATIONS`
(`tests/docs/_metaLedgerReferentialIntegrity.test.ts:76`), which excludes ledger-guard tests whose
ids are fixtures rather than references. The shared parser module of §3.1 contains no synthetic ids
and needs no row.

### 7.4 `tests/docs/_metaLedgerInProgress.test.ts` — unchanged behavior after the move

Catches a regression introduced by §3.1's extraction. The existing planted-input suite runs against
the imported module with no assertion changes; a diff to those assertions is itself the signal that
the move was not behavior-preserving.

### 7.5 Preflight isolation

Catches a claims failure taking preflight down with it. Asserts `pnpm preflight` exits 0 when the
claims subprocess fails, times out, or is skipped, and that `--no-claims` and `PREFLIGHT_NO_CLAIMS=1`
both suppress it.

---

## 8. Out of scope

- Moving, duplicating, or reformatting the marker itself (§1).
- A ledger viewer. The phrase appears in `AGENTS.md:36` and at
  `tests/docs/_metaLedgerInProgress.test.ts:158` but no such surface exists in the repo; this spec
  does not build one.
- Any change to `tests/docs/_ledgerMdast.ts` or the id-integrity guards.
- Enforcing that every branch have a ledger row. `AGENTS.md:38` explicitly declines this and it
  stays declined.

---

## 9. Ledger bookkeeping

### 9.1 No row for this work

This branch opens no `BL-`/`DEF-` entry for the invariant-12 repair. The work is being shipped now
rather than queued, and `AGENTS.md:38` states that a run with no matching ledger entry does nothing.
Marking a row in flight and closing it in the same PR would add a marker whose only reader is the
PR that removes it, which is the defect this spec exists to fix.

### 9.2 Filed as a by-product: `BL-LEDGER-BODY-DEFINED-ID-OVERMINT`

`bodyDefinedIds` (`tests/docs/_ledgerMdast.ts:346`) as shipped in PR #680 does not require a
separator after the bold id, so any bold lone id at a bullet lead defines. Probed against
`origin/main`:

```
- **BL-DEFINED** — a real sub-item              -> ["BL-DEFINED"]
- **BL-MENTIONED** is discussed in the parent   -> ["BL-MENTIONED"]   <-- a mention, not a definition
- **BL-COLON**: see the parent entry            -> ["BL-COLON"]       <-- likewise
- outer / - **BL-NESTED** — nested              -> []
- `BL-ONE`, `BL-TWO` — enumerated               -> []
```

Latent, not live: main mints exactly the intended eight ids today. But it over-mints in the
direction the guard exists to prevent, so a bullet naming a sibling id in bold makes that id
resolve and a typo can define itself. Filed OPEN with this probe output. Not fixed here.
