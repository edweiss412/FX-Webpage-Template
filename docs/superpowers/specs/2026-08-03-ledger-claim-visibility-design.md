<!-- spec-lint: not-ui — no UI surface: this change touches a CLI script, a shared parser module, the preflight harness, two meta-tests, and AGENTS.md prose. impeccable-gate: N/A. -->

# Ledger claim visibility — read in-flight work off origin's branches, not off main

**Date:** 2026-08-03
**Branch:** `chore/ledger-claim-visibility`
**Backlog entries:** none opened for this work (see §9.1); three filed as by-products (§9.2, §9.3, §5 item 0a)
**Status:** R11 repaired — 67 adversarial findings across eleven rounds plus 5 self-findings, all accepted. R10 triggered the three-round cap: §3.1 is written from a spike, independently reproduced cross-model at R11
**Review note:** R1-R4 were Codex (cross-model). R5 and R6 were fresh-eyes Opus sessions, because Codex hit a usage limit resetting 2026-08-10; see §10
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
| The reader is **additive**. Invariant 12 keeps its writer contract verbatim except for the amendments enumerated in §6 | Ratified | §6 lists the complete AGENTS.md delta; anything not listed there is unchanged |
| The `inferred` signal ships alongside `declared`, and is **advisory only** | Ratified by the user at the design gate, 2026-08-03 | §2.3 measures that 3 of the 4 open PRs carry no marker, so a declared-only reader would be blind to most live work; §4.4 fences it to warn-not-fail so a reconciliation-log edit can never block a branch |
| Stage 4.4's marker removal moves **into the PR's last commit**, before the merge | Ratified by the user at the design gate, 2026-08-03 | §2.4 shows the observed failure this closes |
| No new guard asserting "main carries no marker" | Out of scope, deliberately | The existing staleness rule already fails on exactly that state and did so in production (§2.4). A second guard would restate it, and could not run on a branch anyway, since a branch's own checkout legitimately holds the marker |
| The reader does **not** open a backlog row for its own work | Ratified | `AGENTS.md:38` — "A run that finds no matching ledger entry does nothing". See §9.1 |
| `bodyDefinedIds` over-minting is **filed, not fixed** | Out of scope | Brief instruction, 2026-08-03; filed as §9.2. It is latent, not live, and belongs to `tests/docs/_ledgerMdast.ts:346`, a surface this spec does not touch |
| **Stage 0 pushes the branch the moment it writes the marker.** Without this the reader is correct and useless | Ratified R1 (finding 1) | §2.8a — the only push in the pipeline today is `AGENTS.md:53`, after implementation and whole-diff review |
| The candidate set is **every non-main head**; the merged-exclusion is an optional narrowing applied only where ancestry is computable | Ratified R2 (findings 1-4), superseding R1's open-PR set | §2.7b — ancestry is not computable under depth 1; §3.2 step 2 — R2 measured that `feat/load-inter-app-wide` and `spec/harness-font-fidelity` both declare markers with no open PR, so a PR-scoped set returns a false all-clear |
| The reader's correctness never depends on `gh` | Ratified R2 (findings 1, 5) | §3.2 step 7 — the workflow supplies no `GH_TOKEN`, and a `--limit`-truncated query cannot report what it omitted, so PR numbers are display only |
| The current branch comes from `GITHUB_HEAD_REF` before git | Ratified R2 (finding 2) | §3.2 step 3 — `actions/checkout@v4` leaves a PR build on a detached merge ref, so a git-only reader attributes the PR's own marker to a stranger |
| In-progress detection becomes **position-independent**, and flight-field extraction gains the same-line union. The 12-line window is retained for ordinary meta fields | Ratified R1 (self-finding), scoped by R2 (finding 7) | §2.7a — measured: window sees 2, position-independent sees 3, zero false positives, and the one miss is live. §3.1 — two predicates, because requiring a flight field for in-progress detection would make the guard's "IN PROGRESS with nothing to point at" rule unfireable |
| `tests/docs/_metaLedgerInProgress.test.ts` adopts that recognizer too, as its own task | Ratified R1 (self-finding) | §7.4b — otherwise the guard keeps a blind spot the reader does not have |
| The script is TypeScript run through `tsx`, not `.mjs` | Ratified | `tests/docs/_metaLedgerReferentialIntegrity.test.ts:106` scans tracked `*.md`/`*.ts`/`*.tsx` only. A `.mjs` reader would sit outside the citation guard's reach entirely; `package.json:132` already carries `tsx` as a devDependency and ~20 sibling scripts run that way |

---

## 2. Probe log — what is actually true

All probes run 2026-08-03 in `/Users/ericweiss/FX-worktrees/ledger-claim-visibility` at
`96a79f596`, which was `origin/main` at 19:11 CDT.

**Corpus counts in this section are a dated snapshot, and they decay fast.** Between 19:11 and 20:38
the same probes went from 15 live refs to 19 and from 4837 parsed entries to 6715, because other
sessions ship into this repo continuously. Where a count is load-bearing, the section says which
invariant it establishes and §7 pins that invariant against a committed fixture rather than against
origin. A drifted count here is not a review finding; a drifted *invariant* is.

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

Nothing sits between 4 hours and 7 days. §4.4 sets the threshold at **14 days**, which is
deliberately *outside* that gap rather than inside it — R6 finding 6 correctly observed that 14 days
lands among the abandoned cluster rather than cleanly above it, with two branches at 14.0 and 14.6
days straddling the line.

That is the intended bias. The threshold controls a **display label only**: a stale-tipped branch is
listed under a heading, never dropped, and its claims still participate in `--check`. So the
asymmetry runs one way — labelling a dead branch "live" costs a reader one glance, while labelling a
live branch "stale" risks it being skimmed past. A threshold inside the gap would be tighter and
strictly worse on the axis that matters. Filed as a documented limit in §5 rather than tuned.

Of the 4 branches with open PRs, **exactly 1 carries a marker**. A declared-only reader would
report one claim and stay silent about three live PRs, so the `inferred` signal is what gives the
report coverage of branches whose session skipped Stage 0.

The probe also surfaced two declarations nobody could have seen from main: `feat/load-inter-app-wide`
declares `BL-HEADER-FONT-FALLBACK-WRAP`, and `spec/harness-font-fidelity` declares
`BL-HARNESS-FONT-FIDELITY`. Neither branch has an open PR. The reconciliation log on a third branch
records `BL-HEADER-FONT-FALLBACK-WRAP` as already graduated, so that declaration may itself be
stale-on-branch — which the reader surfaces rather than hides, since a claim pointing at finished
work is exactly what a human needs to see to clear it.

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
definition and reference integrity rather than meta-line fields. The field logic moves; entry
recognition does **not** move, it is replaced by that file's `extractEntries` (§3.1, R7 finding 1).

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

### 2.7a The 12-line field window cannot see a live marker (R1 self-finding)

`ledgerItems` reads meta fields from only the first 12 lines of an entry body
(`tests/docs/_metaLedgerInProgress.test.ts:106`). `chore/ledger-body-ids-enum-scan-widen` appends
its marker at the END of a long entry body, about seventeen lines below the heading, at
`BACKLOG.md:94` on that branch. Measured across `origin/main` plus all 15 live unmerged refs and all
four ledger files:

```
                            19:11 CDT    20:38 CDT
12-line-window sees:            2            5
status on any line:             3            6
status + flight, same line:     3            6
MISSED by the window:           1            1
  origin/chore/ledger-body-ids-enum-scan-widen:BACKLOG.md BL-INTERNAL-CODE-ENUM-SCAN-WIDEN
over-fire of status-alone:      0            0
```

**Read the invariants, not the counts.** The two columns are 90 minutes apart on a repo where other
sessions are actively marking entries, and the absolute numbers moved by more than double in that
window. Three things did not move, and those are what this design rests on: status-alone detection
adds **zero** entries over the stricter same-line rule; the window's miss set is **non-empty**; and
the missed entry is a real marker on a live branch. §7.4b therefore pins a committed fixture rather
than a live count, because a bound read off origin would have been green at 19:11 and wrong by
20:38.

Two live consequences. The reader as originally drafted would downgrade a genuine `declared` claim
to `inferred`. And `tests/docs/_metaLedgerInProgress.test.ts` cannot see that marker either, so its
branch-existence rule never fires for it and main will inherit an unvalidated marker at merge —
the exact rot invariant 12 exists to stop, happening now.

The window is not arbitrary: it stops a `**Branch:**` quoted deep in a discussion from registering
as the entry's own field, which `tests/docs/_metaLedgerInProgress.test.ts:277` plants and asserts.
Two measurements settle what replaces it, across `origin/main`, all 15 live refs, and all four
ledgers:

| Rule | Entries matched |
| --- | --- |
| 12-line window (today) | 2 |
| in-progress `Status` on any line, at any depth | 3 |
| in-progress `Status` **and** a flight field on the same line | 3 |

The looser rule adds nothing over the stricter one, so **status-alone is the detection predicate**
(§3.2 step 5) — it is simpler, and it keeps a malformed status-only marker visible, which R3
finding 2 showed the stricter rule would have hidden from the very guard written to catch it. The
deep-quoted `**Branch:**` stays ignored because field *extraction* keeps the window, unioned with
same-line-with-status (§3.1); detection and extraction are separate concerns and the plant exercises
extraction. §3.2 step 5 and §7.4b adopt this.

### 2.7b A shallow clone can read branch content but cannot compute ancestry

Probed against a real depth-1 clone of this repo with its remote pointed at GitHub:

| Command | Result |
| --- | --- |
| `git fetch --no-tags --depth=1 origin '+refs/heads/*:refs/remotes/origin/*'` | succeeds, **1.8 s** |
| `git show origin/<branch>:BACKLOG.md` | succeeds, 1429 lines |
| `git merge-base origin/main origin/<branch>` | **fails** |

Two consequences for §7.3, both structural rather than stylistic.

**The `inferred` signal is impossible in CI.** It needs a merge-base, which a shallow clone cannot
compute. This is a second and harder reason for the backstop's declared-only scope, independent of
the false-positive argument.

**`git branch -r --merged origin/main` cannot be used in CI either.** With every tip fetched as a
shallow boundary, ancestry is unknowable, so a merged-and-retained branch is misclassified as a live
candidate and its old declaration can raise a false collision. This is live, not hypothetical:

```
$ git merge-base --is-ancestor origin/feat/sync-feed-undo-announce origin/main   # exit 0
$ git rev-list --count origin/feat/sync-feed-undo-announce..origin/main
80
```

That branch is merged and retained, and sits 80 commits behind main — far beyond what depth 1
reaches. §3.2 step 2 therefore treats the merged-exclusion as an optional narrowing: applied locally, skipped
in a shallow clone, with the candidate set always a superset rather than a subset.

### 2.8 Precedent for a script module shared with tests

`scripts/lib/` holds three TypeScript modules today. Two are imported by both a script and a test:
`scripts/lib/validation-smoke-target.ts` is used at
`scripts/validation-smoke.ts:39` and imported by a test as
`@/scripts/lib/validation-smoke-target` (`tests/scripts/validation-smoke-base-url.test.ts:12`),
resolving through the `"@/*": ["./*"]` alias at `tsconfig.json:26`. §3.1 follows this shape exactly.

`scripts/lib/validation-env.ts:46` (`loadValidationEnv`) is **not** a second instance of it, despite
looking like one: `tests/scripts/validation-env.test.ts:24` holds the module's *path* as a constant
it feeds to a spawned child, not an import. One real precedent, stated as one.

### 2.8a Stage 0 writes the marker but does not push it (R1 BLOCKING)

The reader resolves claims from origin, so a claim is only visible once the marker is **on** origin.
Nothing in the pipeline puts it there at Stage 0. `AGENTS.md:38` and `AGENTS.md:134` write the marker;
the only push in the autonomous pipeline is at `AGENTS.md:53`, after implementation and after
whole-diff review:

> TDD-per-task implementation … whole-diff Codex cross-model review to APPROVE; push → **real CI
> green** … `gh pr merge --merge`

So session A marks its rows locally and works for hours while origin shows nothing; session B fetches,
gets a clean all-clear, and duplicates the work. That is the original defect surviving the fix
untouched — the reader would have been correct and useless.

The marker must therefore be pushed the moment it is written. `AGENTS.md:36` already requires the
branch to exist on origin for the staleness rule to resolve, so an early push conflicts with
nothing; it moves an existing requirement earlier. §6.2 makes it explicit.

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

<!-- spec-lint: ignore — this file is created by this spec; it is created by this spec's implementation and is not tracked yet -->

### 3.1 `scripts/lib/ledger-fields.ts` — the shared field parser

Moved from `tests/docs/_metaLedgerInProgress.test.ts`. **No network and no `git`**; the one piece of
I/O is `ledgerFiles`'s single `readdirSync` of the repo root, which moves with the rest rather than
being left behind.

**Entry boundaries come from the authoritative parser, not from a second grammar.** This is the one
part that does not move verbatim. `tests/docs/_metaLedgerInProgress.test.ts:63` carries a local
`HEADING` regex requiring an em dash after the id; `tests/docs/_ledgerMdast.ts:302`
(`extractEntries`) is the repo's authoritative ledger walker and does not. R7 measured the
divergence as live and silent:

```
$ grep -n 'BL-NULLCODE-STAMP-BATCH-2' BACKLOG.md
537:## BL-NULLCODE-STAMP-BATCH-2 residuals (2026-07-03)

field-parser HEADING match: False        # no em dash
authoritative extractEntries:  True
```

A marker on that entry is attributed to the **preceding** entry, `BL-DEV-GATE-GALLERY-SPEC-ROT`,
and nothing catches it: the file still parses 91 entries, so neither the per-file "parsed 0 entries"
warning nor the §4.2 global vacuity gate fires. Silent misattribution is the worst failure this tool
can produce — it does not merely miss a claim, it asserts a false one about a real entry. R7 found
5 such mismatches across 20 refs, in `BACKLOG.md` and `DEFERRED-archive.md` both, in both directions
(ids only the authoritative parser sees, and one only the legacy regex sees).

**`extractEntries` is opts-driven, and the opts differ per ledger.** Its signature is
`extractEntries(text, opts: ExtractOpts)` with `ExtractOpts = { requirePrefix, levels }`
(`tests/docs/_ledgerMdast.ts:289`), and the repo's own values are not interchangeable
(`tests/docs/_metaDeferralLedgerGraduation.test.ts:58`):

| Ledger | Opts |
| --- | --- |
| `BACKLOG.md`, `BACKLOG-archive.md` | `{ requirePrefix: "BL-", levels: [2, 3] }` |
| `DEFERRED.md`, `DEFERRED-archive.md` | `{ requirePrefix: null, levels: [3] }` |

R8 finding 1 measured the cost of getting this wrong: applying the backlog opts to the deferred
ledgers yields **0** entries for each, against 15 and 139 correct, so a planted deferred claim
vanishes entirely — and the global vacuity gate stays quiet because the 321 surviving backlog
entries clear the 100 floor on their own.

§4.2's vacuity rule is therefore **per file, and self-contained**: a ledger file that is non-empty on
disk but yields zero entries is an exit-2 condition. R9 finding 1 refuted the first repair of this,
which compared each file against its counterpart on `origin/main` — a wrong opts mapping applies to
main too, so both baselines read zero, the comparison is false, and the gate never fires. Any rule
that measures the parser against itself is defeated by the parser being wrong, which is the only
case it exists for. Comparing against the file's own non-emptiness has no such dependency.

So the shared parser module **consumes the authoritative grammar and owns only field extraction**.
The local `HEADING` regex is deleted rather than moved; two grammars for one file format is the
defect, and keeping the stricter one merely relabels it.

**Spans come from pairing two calls, because `extractEntries` alone cannot supply them.** R10
finding 1 established that `LedgerEntry` is `{ id, headingLine, body }`
(`tests/docs/_ledgerMdast.ts:95`) and that `headingLine` carries no position, so the earlier text
here — "consumes `extractEntries` for ids and spans" — was not implementable. It was also not as
fatal as it looked: `parseLedger` returns the raw mdast root, whose heading nodes carry full
positions, and entry `body` nodes carry them too on real input. The remedy is a pairing rather than
a descope:

| Call | Supplies |
| --- | --- |
| `extractEntries(text, opts)` | **which** headings are id-headings, and their ids — the grammar, unduplicated |
| `parseLedger(text)` | **where** those headings are — `position.start.line` on each heading node |

Walking the two together in document order, forward-only, yields one span per entry. Spiked against
the live corpus before this design was committed to:

```
BACKLOG.md:          entries=94  unresolved=0  monotonic=true
BACKLOG-archive.md:  entries=229 unresolved=0  monotonic=true
DEFERRED.md:         entries=15  unresolved=0  monotonic=true
DEFERRED-archive.md: entries=139 unresolved=0  monotonic=true
TOTAL checked=477 unresolved=0

no-em-dash entry span: {"id":"BL-NULLCODE-STAMP-BATCH-2","start":573,"end":580}
```

Every entry in every ledger resolves to a span, the spans are strictly increasing, and the
no-em-dash entry that started this whole thread resolves correctly — which is the acceptance
condition §7.1 pins. The per-ledger counts also independently confirm the `ExtractOpts` mapping
above: 15 and 139 for the deferred pair, not the 0 and 0 that the wrong opts produce.

Importing `tests/docs/_ledgerMdast.ts` from a script is safe and pinned: it is a plain module, not a
test file, and `tests/docs/_metaLedgerReferentialIntegrity.test.ts` already bans `node:fs`,
`node:path`, and `require(` inside it, so it cannot acquire I/O or side effects. Verified: the file
has zero hits for any of the three. The import direction is still backwards architecturally, and
relocating `_ledgerMdast.ts` beside its new consumer would be cleaner — deferred under exception (c)
of `AGENTS.md:227`, since it spans four importers plus three hardcoded path exemptions in the
referential-integrity guard, none of which this branch otherwise touches. Filed as
`BL-LEDGER-MDAST-SHARED-HOME`. R6 finding 2 caught an earlier "a pure module, no I/O" here: taken
literally it strands `ledgerFiles` in the test file, forcing the §3.2 reader to import a vitest
module whose top-level `describe`/`it` run on import — precisely the coupling §2.8's
precedent exists to avoid. It exports
`LedgerItem`, `fieldsOfLine`, `ledgerItems`, `isInProgress`, `flightFieldsOn`, `FLIGHT_FIELDS`,
`BRANCH_SHAPE`, and `PR_SHAPE`. It exports no heading pattern of its own — R8 finding 2 caught the export list still promising one after §3.1 deleted it, which a literal implementer would have satisfied by recreating the very grammar R7 finding 1 removed. `ledgerFiles` moves too, taking its root
directory as an argument as it already does today (`tests/docs/_metaLedgerInProgress.test.ts:46`).

**Its discovery is family-scoped, and the spec says so rather than repeating the claim it inherits.**
`AGENTS.md:36` states that "Ledger files are discovered from disk, so a new one is covered by
default". That is true only within one naming family: the function does `readdirSync` but filters on
`/^(BACKLOG|DEFERRED)(-archive)?\.md$/`, so a second archive file under a different suffix, or an entirely new ledger family
is invisible to it — and, per R10 finding 5, to
`tests/docs/_metaLedgerReferentialIntegrity.test.ts` as well, which hardcodes the same four names
independently. Both discovery surfaces share the hole.

The reader inherits the limitation rather than fixing it, because widening discovery would change
which files three existing guards walk, and that is a separate decision with its own blast radius.
What changes here is only that it is written down: **§5 carries it as a documented limit**, so the
next person to add a ledger family learns it from the spec instead of from a silent miss. Filed as
`BL-LEDGER-DISCOVERY-FAMILY-SCOPED`, exception (c) per `AGENTS.md:227`.

The move is behavior-preserving: no regex, no bound, and no field name changes. The existing
planted-input suite (`tests/docs/_metaLedgerInProgress.test.ts:224-287`) stays where it is and
imports the module, becoming the parser's regression coverage rather than a test of a local helper.

The non-greedy bold-run split that keeps a meta line from collapsing into one field
(`tests/docs/_metaLedgerInProgress.test.ts:70-86`) is load-bearing and moves unchanged.

The module then gains, in a later task and a later commit, **two predicates rather than one**. R2
finding 7 showed why a single same-line recognizer cannot serve both callers: the guard's existing
rule that an in-progress entry with no branch and no PR is unactionable
(`tests/docs/_metaLedgerInProgress.test.ts:243`) is about entries carrying a status and *no* flight
field, so a predicate requiring a flight field would make that rule unfireable. The guard would stop
catching the exact malformation it was written for.

**The union lands on `fields` itself, not on a derived helper.** R4 finding 1 is the reason this is
stated so precisely: the guard's rules read raw values off `LedgerItem.fields` directly —
pointability at `tests/docs/_metaLedgerInProgress.test.ts:144`, `Branch` shape at
`tests/docs/_metaLedgerInProgress.test.ts:171`, `PR` shape at
`tests/docs/_metaLedgerInProgress.test.ts:175`, and branch liveness at
`tests/docs/_metaLedgerInProgress.test.ts:195`. Widening only a `flightFieldsOn`-style key list would leave all
three reading the windowed values, so an out-of-window `Branch` would be detected as a claim and
then skip shape validation and the origin-existence check — a malformed or dead branch surviving
onto main, which is the precise stale-marker failure this spec exists to close.

| Element | Definition |
| --- | --- |
| `LedgerItem.fields` | fields from the 12-line window **union** fields parsed from any line that itself carries an in-progress `Status`, at any depth. Window value wins on a key collision, so existing entries are untouched |
| `isInProgress(entry)` | **any** line in the entry body carries an in-progress `Status`, at any depth. **It scans lines; it never reads `fields.Status`** |
| `flightFieldsOn(entry)` | unchanged in definition; it reads the widened `fields`, so it follows automatically |

**The two can disagree, and which one wins is specified.** R11 finding 1: `fields` resolves a key
collision in the window's favor, so an entry reading `Status: OPEN` near the top with a valid marker
below line 12 has `fields.Status === "OPEN"` while `isInProgress` is true. A predicate reading
`fields.Status` would downgrade a live claim, and the guard would then report the widened `Branch`
as a flight field with no status explaining it — a false violation on a correctly-marked entry. So
`isInProgress` scans lines, and the flight-field rule defers to it rather than to `fields.Status`.
§7.4b plants exactly this shape.

Because the union lands on `fields`, all four existing consumers — pointability, `Branch` shape,
`PR` shape, and branch liveness — see the out-of-window marker without any of them being edited.
Every existing planted assertion survives unchanged, which is the acceptance criterion in §7.4b:

| Planted input | `isInProgress` | `fields` flight values | Rule outcome |
| --- | --- | --- | --- |
| `**Status:** IN PROGRESS · **Severity:** low` | true | none | fires as unactionable, as today |
| `**Status:** OPEN · **Branch:** feat/x` | false | `Branch=feat/x` | fires as flight-field-without-status, as today |
| `**Status:** OPEN`, then a `**Branch:**` fourteen paragraphs down | false | none | silent — the deep quote's own line carries no in-progress status, so it contributes nothing to the union |
| `**Status:** OPEN` in-window, then `**Status:** IN PROGRESS · **Branch:** feat/live` below line 12 | **true** | `Branch=feat/live` | silent — R11 finding 1's collision. `fields.Status` still reads `OPEN`, and any predicate consulting it would both downgrade the claim and fire a false flight-field violation |
| `**Status:** IN PROGRESS · **Branch:** chore/real-branch` seventeen lines down | true | `Branch=chore/real-branch` | newly seen; passes shape, and is now subject to the liveness check it previously escaped |
| `**Status:** IN PROGRESS · **Branch:** not a branch` seventeen lines down | true | `Branch=not a branch` | **newly fires** the `Branch` shape rule (`tests/docs/_metaLedgerInProgress.test.ts:171`), which it escaped before the union |

`ledgerItems`'s 12-line window survives for ordinary meta fields; nothing else in the guard changes.
Splitting the move from the behavior change is deliberate: a behavior-preserving extraction and a
widening of what a guard sees must not land in one commit, or neither is reviewable.

<!-- spec-lint: ignore — this file is created by this spec; it is created by this spec's implementation and is not tracked yet -->

### 3.2 `scripts/ledger-claims.ts` — the reader

Wired as `"ledger:claims": "tsx scripts/ledger-claims.ts"` in `package.json`.

**Resolution, in order:**

1. `git fetch --no-tags --prune origin '+refs/heads/*:refs/remotes/origin/*'`, 30 s timeout. The
   refspec is explicit rather than inherited: R3 measured that a clone configuring
   `remote.origin.fetch` narrowly fetches only `main` and still exits 0, silently shrinking the
   branch universe while every command reports success. On failure, fall through to whatever
   remote-tracking refs exist locally and set the **degraded** flag (§4.1), which `--check` treats
   as untrusted rather than as an answer.
2. Candidate branches: every `refs/remotes/origin/*` except `origin/main` and `origin/HEAD`.

   **`origin/main` is parsed, but never as a candidate.** It supplies the vacuity baseline in §4.2
   and the entry-span map that §4.3's unknown-id note reads; it contributes no claims. R5 finding 2
   caught an earlier draft gating vacuity on a main count the algorithm never computed, which made
   §3.3's exit-2 vacuity door unimplementable and its §7.2 test unwritable.

   The **merged-exclusion is an optional narrowing**, not part of the definition:
   - **Full clone:** subtract every branch reported by `git branch -r --merged origin/main`. A
     merged claim has landed or died; either way it is not in flight.
   - **Shallow clone:** §2.7b measured that ancestry is not computable there, so the subtraction is
     skipped and the report says so once in its header. The candidate set is a **superset**, never a
     subset — the failure direction is a false collision that names a real branch, which a human can
     resolve in seconds, rather than a false all-clear, which is the defect this whole spec exists
     to remove.
   - Detected by `git rev-parse --is-shallow-repository`, not by sniffing `CI`, so a shallow local
     clone behaves correctly too.
   - **Open-PR membership is never the candidate set.** R2 measured why: `feat/load-inter-app-wide`
     and `spec/harness-font-fidelity` each declare a marker and neither has an open PR, so a
     PR-scoped reader would miss both and report a clean all-clear. PR numbers are display only
     (step 7).
3. Current branch, used to distinguish "somebody else claims this" from "I claim this":
   `GITHUB_HEAD_REF` when set, else `git rev-parse --abbrev-ref HEAD`, else none. The environment
   variable is not a convenience — `actions/checkout@v4` leaves a PR build on a detached merge ref,
   so a reader that only asked git would find no current branch and attribute the PR's own marker to
   a stranger, failing every PR that declares anything.
4. For each candidate, for each name in `ledgerFiles()`: `git show <ref>:<file>`, with the child's
   stderr discarded. A file absent at that ref is skipped, since a branch may predate a ledger's
   creation. Discarding stderr is load-bearing rather than tidy: §2.3's 15 refs produce seven
   `fatal: path 'BACKLOG-archive.md' exists on disk, but not in …` lines that mean nothing, and
   preflight must not print seven fatal-looking lines on every healthy run.
5. `declared` claims: every entry for which `isInProgress` holds — an in-progress `Status` on any
   line of the body, at any depth. Not the first 12 lines, because §2.7a measures a live marker that
   window misses.

   **The ref the entry was read from is the claim's key**, always, so a malformed marker carrying no
   `Branch`/`PR` is still a fully attributed claim. The entry's own flight fields are corroboration
   and display, never the attribution. That is what resolves R3 finding 2: §4.2 requires a
   status-only entry to report as `declared`, and under this rule it does.

   Probed for over-fire across `origin/main`, all 15 live refs, and all four ledgers: status-alone
   detection fires on exactly the same 3 entries as the stricter same-line rule, adding **zero**.
   The theoretical false positive — an in-progress `Status` quoted inside a discussion — does not
   occur in the corpus, and if one ever did it produces a visible extra row naming a real branch,
   not a missed claim.
6. `inferred` claims: run `git diff --unified=0 $(git merge-base origin/main <ref>) <ref> -- <ledgers>`,
   map each hunk's new-side line range back to the entry whose span contains it, and record any entry
   not already `declared` for that branch. Three mapping cases are specified rather than left to the
   implementation:
   - **A hunk outside every entry span** — the reconciliation-log preamble above the first heading is
     the common one — maps to no entry and is dropped. Measured: all three of
     `chore/ledger-body-ids-enum-scan-widen`, `docs/settle-lead-capability-prose`, and
     `feat/modal-freshness-cue` carry exactly one such hunk at `BACKLOG.md:7`, above the first entry
     heading at line 11. Dropping it is correct; a reconciliation-log line names dozens of ids and
     claims none of them.
   - **A pure deletion** (`+N,0`) has no new-side line, so it maps to nothing. A branch that deletes
     an entry outright produces no inferred claim from that hunk. Swept against the live refs: every
     currently deleted entry heading is re-added under the same id in an archive ledger, so the
     graduation path is covered by the archive-side hunk.
   - **A hunk spanning a heading boundary** attributes to every entry its range overlaps, not just
     the first.
7. PR numbers, **display only**, and **bounded at 10 s**: `gh` honors no timeout of its own (R7
   probed `gh help environment` for one and found none), so an unresponsive call would otherwise
   hang inside preflight's 15 s child and cost the whole table rather than one column. On timeout the
   column is blank, exactly as when `gh` is absent.
   `gh pr list --state open --json number,headRefName --limit 100`,
   joined on branch name. Absent, unauthenticated, or failing `gh` leaves the column blank and is
   never an error in any mode, because no claim resolution depends on it. Past 100 open PRs the
   column is simply incomplete for the overflow, which is why it may not be load-bearing: a query
   that cannot report what it truncated must not be something a correctness rule reads.

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

Exit codes carry **distinct meanings**, and §6.2's AGENTS text quotes them separately. Collapsing
them into "non-zero means collision" would report a parser regression as somebody else's claim:

| Exit | Meaning | What the caller does |
| --- | --- | --- |
| **0** | No collision, or `inferred`-only collisions (printed as `WARN:`) | Proceed |
| **1** | A named id is `declared` by a branch other than the current one. Message names the id, the branch, and the PR if known | Stop and reconcile |
| **2** | **The check could not be trusted**: usage error, parser vacuity (§4.2), or an environment failure that §4.1 escalates | Stop and fix the check. This is never evidence about another branch, in either direction |

Also `--json` for machine consumption. It emits an **object**, not a bare array:
`{ status, degraded, claims: [{id, branch, kind, pr, tipAgeDays, stale}] }`.

The envelope is the point. R10 finding 7: a bare array makes a healthy empty result and a
stale-cache false all-clear both serialize as `[]`, and every report-level state the human table
prints in its header — fetch failed, `--no-fetch` cached, merge-base unavailable, merged-exclusion
skipped — is absent from the payload a machine reads. `degraded` carries those flags by name and
`status` mirrors the exit code, so a consumer can never mistake "verified, nothing in flight" for
"could not verify". **`--json` is never capped** — the 100-branch limit is a
display concern for human output only. A machine consumer receiving a truncated set with no
truncation marker would compute a false all-clear, which is the same defect as the capped `--check`
R3 finding 1 closed.

### 3.4 Preflight surfacing

`scripts/preflight-env.mjs` spawns `tsx scripts/ledger-claims.ts --no-fetch` with a **15 s** timeout
and prints its table.

**`--no-fetch` is not an optimization, it is what makes the budget coherent.** R5 finding 3 caught
the inner bound exceeding the outer: a 30 s fetch inside a 15 s budget means that on exactly the
degraded network §4.1's first row exists for, preflight kills the child mid-fetch and prints nothing
useful. Splitting the two roles removes the conflict rather than tuning it. Preflight is a
**display** over already-fetched refs — instant, never authoritative, and honest about it, printing
`(cached refs; run pnpm ledger:claims for a fresh read)` in its header. `--check` is the
**authoritative** path and always fetches, on the full 30 s. No caller needs both at once.

**Placement is specified, not left to "add a final step".** R4 finding 4 measured two successful
early exits that any appended step would sit below: `--no-db` returns at
`scripts/preflight-env.mjs:132`, and a missing `psql` returns at `scripts/preflight-env.mjs:142`.
Both print `preflight: env ✓` and exit 0, so claim visibility would be silently absent in exactly
the two modes a docs-only or DB-less worktree uses. The claims step therefore runs **after the env
checks and before the DB probe**, so it is reached on all three success paths, and §7.5 asserts each
one rather than only the default.

Governed by:

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
| `git fetch` fails (offline, auth, timeout) | Use existing remote-tracking refs and print `WARN: claims computed from stale refs (fetch failed: <reason>)`. The report still prints, because a stale report beats none. **`--check` exits 2**, never 0: R3's case is a checkout that cannot reach origin while a cached ref already carries another branch's live declaration, and answering "no collision" from a universe you could not verify is the false all-clear this spec exists to remove |
| No `refs/remotes/origin/*` at all | Print `no origin branches resolvable`; `--check` exits 2 |
| `git ls-remote` itself fails after a successful fetch | Exit **2**, explicitly caught. R8 finding 6: `execFileSync` throws on a failed `ls-remote` (status 128), and an uncaught throw exits the process with 1 — which §3.3 and §6.2 both define as "another branch declares this row". An environment failure reported as somebody else's claim is worse than either a crash or a warning |
| Fetch succeeded but the resolved head **set** is missing any name `git ls-remote --heads origin` reports | Compared as sets, never as counts. R10 finding 3: churn that deletes two branches and creates one leaves the count equal or larger while a newly created claimed branch is absent, so a cardinality check passes over exactly the branch that matters. Print the missing names; `--check` exits 2. The `ls-remote` carries its own **30 s** bound, matching `tests/docs/_metaLedgerInProgress.test.ts:201`, and is **skipped entirely under `--no-fetch`** — it verifies a fetch, so with no fetch there is nothing to verify. R6 finding 5 caught it otherwise reopening the budget conflict R5 finding 3 closed: an unbounded network call still sat inside preflight's 15 s |
| `gh` absent, unauthenticated, or returning malformed JSON, **any mode** | PR column blank. Never an error, never a warning, never a change to which claims resolve. R2 measured that `unit-suite.yml` supplies no `GH_TOKEN`, so the unauthenticated path is the CI default, not an edge case |
| More than 100 open PRs | The PR column is incomplete for the overflow and says so. No claim resolution reads it, which is the reason it is allowed to be incomplete: a query that cannot report its own truncation must not carry a correctness rule |
| `git merge-base` unresolvable for a ref (shallow clone, unrelated histories) | `inferred` is disabled for that ref; `declared` is unaffected. Said once in the header, not once per branch |
| Ancestry unavailable, so the merged-exclusion cannot run | Candidates stay a superset: merged-and-retained branches are included and may raise a false collision. Printed in the header. The failure direction is deliberate — a false collision names a real branch and a human clears it in seconds, while a false all-clear is the defect this spec exists to remove |
| Detached HEAD with `GITHUB_HEAD_REF` set | The env var is the current branch (§3.2 step 3). This is the normal CI shape, not an edge case: `actions/checkout@v4` leaves every PR build detached |
| Detached HEAD with no `GITHUB_HEAD_REF` | Treated as "no current branch", so every declared claim counts as another branch's. In `--check` this exits 2, not 1: without knowing who you are, a collision report is unattributable rather than true. Exiting 1 here would fail every PR that legitimately declares its own row |
| More than 100 candidate branches | **The cap is a display limit only.** The report prints the 100 most recent plus `N branches not shown`; `--check` evaluates every candidate regardless, because a collision hidden behind a display cap is a false all-clear. R3 measured exactly that: with 101 candidates and the collision in the 101st, a cap applied to resolution reports `collisionInReportedSet: false` while the collision is real |

### 4.2 Data

| Condition | Behavior |
| --- | --- |
| A ledger file missing at a branch's tip | Skipped for that branch, with `git show`'s stderr discarded (§3.2 step 4). A branch may predate the file |
| A diff hunk landing outside every entry span | Dropped, contributing no `inferred` claim (§3.2 step 6). The reconciliation-log preamble is this case and occurs on every live ref |
| A ledger file that is non-empty on disk but yields **zero** entries | Exit **2** in `--check`, not a warning. This is the per-file vacuity rule (§3.1): a whole ledger silently disappearing — which a wrong `ExtractOpts` mapping does to both deferred files — is the same false-all-clear class as R3 finding 1 reached through a different door. The condition is self-contained and never compares the parser against another run of itself |
| A ledger file that is genuinely empty, or absent at a ref | Contributes no claims, no warning. A branch may predate the file |
| **Vacuity**: every branch yields 0 entries while `origin/main` yields more than 100, **and at least one candidate branch exists whose ledger files are non-empty** | R10 finding 2: without that last clause the predicate is true in three legitimate universes — origin holding only `main`, every candidate predating the ledgers, and genuinely empty candidate ledgers — so a repo with no side branches would exit 2 forever. The clause is what distinguishes "the parser broke" from "there is nothing to parse" Print `WARN: claim parser matched nothing across N branches — treat this report as unreliable` and exit 2 in `--check`. A parser that silently matches nothing would make the whole report a false all-clear, which is the one failure this tool must never produce quietly. The threshold sits far below the real floor: the probe parsed 4837 entries across 15 refs and 4 ledgers at 19:11 CDT, and 6715 across 19 refs 90 minutes later. Both are an order of magnitude clear of 100, and the margin grows as the corpus does |
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

`inferred` never fails anything, for two reasons that are worth stating separately because only one
of them was true as originally drafted.

**It is a heuristic over diff hunks.** Mapping a changed line range to an entry span is an
approximation: a branch editing a long entry's body to mention a sibling id produces a claim on the
enclosing entry, which may or may not be what its session is working on.

**It is not the reconciliation-log preamble.** The original draft justified the asymmetry by
claiming a `BACKLOG.md:7` edit would over-report against dozens of ids. Measured, it does the
opposite: line 7 sits above the first entry heading at line 11, so the hunk maps to no entry and is
dropped (§3.2 step 6). All three live refs carrying that hunk produce zero claims from it. The
correct statement is that preamble edits are silent, not noisy.

The soft signal earns its place by covering the three-in-four branches that carry no marker (§2.3);
it does not earn the right to block work, and §2.7b shows it cannot even be computed in CI. §7.2
pins the asymmetry with a planted case.

Every numeric bound in this design, defined once here and referenced everywhere else:

| Bound | Value | Referenced by |
| --- | --- | --- |
| Stale-tip threshold | 14 days | §2.3, §3.2, §7.1 |
| Fetch timeout | 30 s | §3.2, §7.3 |
| Preflight budget for the claims subprocess | 15 s | §3.4 |
| Branch report cap | 100, with the omitted count always printed | §4.1 |
| Open-PR query limit | 100, display only, and allowed to be incomplete because no rule reads it | §3.2 step 7, §4.1 |
| Meta-line body window | 12 lines, inherited unchanged by `ledgerItems`; the claim recognizer is position-independent and uses no window | §3.1, §3.2 step 5 |
| Global vacuity floor | 100 entries on main, against a measured corpus of 4837 and then 6715 within 90 minutes | §4.2 |
| Per-file vacuity | no numeric bound — a non-empty ledger yielding zero entries fails, whatever the count | §3.1, §4.2 |

No other numeric bound exists in this design.

---

## 5. Failure modes this design deliberately accepts

Each is **either** signaled at the moment it occurs **or** silent-by-construction with a named
compensating gate. R2 finding 8 was that an earlier draft claimed all of them were signaled while
three plainly were not; the distinction is now carried per item, because a silent window a reader
believes is signaled is worse than one they can see.

**Signaled.**

0. **The 14-day stale threshold sits among the branches it labels, not cleanly above them.** §2.3
   measures two branches at 14.0 and 14.6 days straddling the line. Accepted rather than tuned: the
   threshold moves a row under a heading and nothing else — stale branches are still listed and
   their claims still participate in `--check` — so the only cost is a display label, and the bias
   is deliberately toward calling a dead branch live rather than the reverse.
0a. **Ledger discovery is family-scoped.** `ledgerFiles` filters `readdirSync` to
   `BACKLOG`/`DEFERRED` with an optional `-archive` suffix, so a new ledger family is invisible to
   the reader — and equally to the two existing guards, which hardcode the same four names. Signaled
   only in the sense that this section names it; there is no runtime warning, because the reader
   cannot know about a file it never looks for. Widening discovery changes which files three guards
   walk and is filed separately as `BL-LEDGER-DISCOVERY-FAMILY-SCOPED`. Until then, `AGENTS.md:36`'s
   "a new one is covered by default" holds only within that family.
1. **Ancestry unavailable in a shallow clone.** Merged-and-retained branches stay in the candidate
   set and can raise a false collision. Printed in the report header, and the remedy the failure
   asks for — delete the branch, or clear a marker that survived its merge — is correct regardless.
   Under §6.3's amended Stage 4.4 a merged branch should carry no marker at all, so this state is
   itself a pipeline violation.
2. **`inferred` is a heuristic over diff hunks.** A branch editing a long entry's body to mention a
   sibling id claims the enclosing entry. Printed as `inferred`, never `declared`, and never able to
   fail anything (§4.4). Note the corrected direction: the reconciliation-log preamble at
   `BACKLOG.md:7` sits above the first entry heading and is *dropped*, so preamble edits are silent
   rather than noisy.
3. **`gh` unavailable.** PR numbers are blank and the report says so. No claim resolution changes.

**Silent, with the gate that covers each.**

4. **A branch that has done no ledger work yet is invisible.** A session that cut a branch, skipped
   Stage 0, and touched no ledger produces neither signal, and no report can show it. Covered only
   by Stage 0 compliance, which §6.2 makes a named step with a named command. This is the one
   residual hole with no mechanical backstop, and it is stated here rather than papered over.
5. **Two sessions racing inside one fetch interval.** Both can pass `--check` if neither has pushed.
   Bounded by §6.2's requirement that Stage 0 push the marker the moment it writes it, which reduces
   the window from the hours §2.1 measured to the seconds between two Stage 0 runs. The bound is
   entirely that push, which is why §2.8a treats its absence as blocking.
6. **A window at the end of a run.** Under §6.3 the marker is removed in the PR's last commit, so
   between that commit and the merge the branch declares nothing. The `inferred` signal still covers
   it, and AGENTS.md requires the merge to follow CI-green in the same turn.
7. **A collision whose other half was never pushed.** R2 finding 4 described two PRs that never
   overlap; R3 finding 6 showed the repair had already closed it, because the candidate set is every
   pushed head rather than open PRs, so B's CI sees A's declaration whether or not A has a PR. What
   genuinely remains is narrower: a collision is invisible to CI only while the other branch exists
   nowhere but a local worktree — exactly the window §6.2's Stage 0 push closes, and the reason that
   push is a requirement rather than a nicety.


## 6. AGENTS.md delta

Six edits, in three places: invariant 12's own paragraph (`AGENTS.md:27-38`), the autonomous-pipeline
sentence that orders the run (`AGENTS.md:53`), and the Stage 0 / Stage 4.4 lifecycle list that
restates the marker instructions (`AGENTS.md:133-136`). None of the three is optional. R2 finding 6
established the method the hard way: an earlier draft edited one location, declared the delta
complete, and left two authoritative sentences contradicting it. **Any edit to invariant 12 must
sweep all three locations**, because AGENTS.md states the marker contract three times.

**6.1 — the reading rule.** A new paragraph after the "declared and never inferred" paragraph:

> **A claim is read from origin's branches, never from main.** The marker is written on the working
> branch and reaches `origin/main` only at merge, which is the moment it stops being true, so main
> is structurally the one place the signal can never appear. `pnpm ledger:claims` resolves claims
> across every live, unmerged branch on origin. `pnpm preflight` prints that table, so any worktree
> that runs preflight sees live claims before its first edit; a docs-only branch that skips
> preflight per invariant 11 relies on the Stage 0 check below, which is not optional for anyone.

**6.2 — Stage 0 gains the check, and must push what it writes.** The pipeline-wiring sentence at
`AGENTS.md:38`, and its restatement at `AGENTS.md:134`, gain both halves:

> Stage 0, immediately after the worktree exists and before the first edit, runs
> `pnpm ledger:claims --check <ids>` for every entry the branch will close. **Exit 1 means another
> live branch already declares that row — stop and reconcile.** Exit 2 means the check itself could
> not be trusted (usage, parser vacuity, environment) and says nothing about any other branch — fix
> the check, do not read it as either a collision or an all-clear. Then write the marker, commit it,
> and **push the branch immediately**: a marker that exists only in a local worktree is invisible to
> every other session, which is the defect this whole mechanism exists to close.

The push is the load-bearing half. Without it the reader is correct and useless: the only push in
the autonomous pipeline today is at `AGENTS.md:53`, after implementation and whole-diff review, so
a marker written at Stage 0 stays local for the entire run (§2.8a).

**6.3 — Stage 4.4's removal moves earlier, in both places.** `AGENTS.md:38` currently reads
"**Stage 4.4**, after the `0  0` check, removes it", and `AGENTS.md:136` independently instructs
clearing the marker in the same post-`0  0` turn as the pane and agent labels. The two locations get
**different** treatments, which R10 finding 4 caught an earlier draft conflating by saying "both
become" and then asking §6.4 to delete one of them outright:

- `AGENTS.md:38`, the invariant paragraph, is **rewritten** to the text below. It is where the rule
  now lives.
- `AGENTS.md:136`, the Stage 4.4 lifecycle line, is **deleted** (§6.4). A bullet that restates a
  rule it no longer owns is the drift this whole delta exists to remove.

The invariant paragraph becomes:

> The marker is removed in the PR's last commit, before the merge, not in the post-`0  0` turn. A
> marker that merges into main names a branch the merge just deleted, and the origin-existence rule
> in `tests/docs/_metaLedgerInProgress.test.ts` then fails on main until somebody clears it — which
> is exactly what merged PR #679 did.

**6.4 — the lifecycle list stops implying the marker is a Stage 4.4 chore.** `AGENTS.md:135-136`
pairs marker clearing with pane and agent clearing under one Stage 4.4 bullet. The pane and agent
clearing stay exactly where they are, as do both `CronDelete` sites (`AGENTS.md:83`); the ledger
marker instruction is **deleted from that bullet outright**, leaving no pointer.

No pointer, deliberately. R6 finding 1 caught an earlier draft asking for "a pointer to its new
home" while §7.5a asserted the bullet does not mention the marker — mutually unsatisfiable, since a
pointer to the marker instruction mentions the marker, so the implementer would go red on the very
commit that satisfied §6. The pointer was never load-bearing: §6.2 and §6.3 both state where removal
now happens, and the Stage 0 bullet two entries above already carries the marker's other half.

**6.5 — invariant 12's opening sentence stops promising merge-time removal, and its parenthetical
goes.** `AGENTS.md:27` reads "the moment the PR merges, the marker goes away with it", which §6.3
makes false: removal is now the PR's last commit, before the merge. It becomes "the marker comes off
in the PR's last commit, so it never reaches main".

The trailing parenthetical — "an entry that graduates to an archive takes its marker with it by
construction" — is **deleted, not preserved**. R3 finding 3 showed it was already false and
actively harmful: `tests/docs/_metaLedgerInProgress.test.ts:149` asserts that archived work cannot
be in flight, so an entry following that parenthetical into `BACKLOG-archive.md` carrying
`Status: IN PROGRESS` fails the guard before the PR can merge. It is replaced by the accurate
statement — a graduating entry's marker comes off in the same commit that archives it, which is the
same rule as §6.3 rather than an exception to it.

**6.6 — the pipeline sentence stops ordering the marker after spec and plan.** `AGENTS.md:53` lists
"spec → self-review → … → plan → … → mark the ledger entries in progress (invariant 12)", which puts
the marker after two full review cycles — hours during which §2.1's collision is exactly what
happens. The clause moves to the front of that sentence, alongside the worktree creation it belongs
to, and names the push:

> relocate into a fresh worktree off `origin/main` (…); check and mark the ledger entries in
> progress and push the branch (invariant 12); spec → self-review → …

Nothing else in `AGENTS.md` changes. §7.5a asserts that claim mechanically rather than by promise.

---

## 7. Tests

TDD per task, invariant 1. Each names the failure it catches.

<!-- spec-lint: ignore — this file is created by this spec; it is created by this spec's implementation and is not tracked yet -->

### 7.1 `tests/scripts/ledgerClaims.test.ts` — the reader, against planted git state

Catches: a reader that reports a claim from a merged branch, drops a stale-tipped branch instead of
listing it, or mis-keys a claim to the wrong branch. Fixtures are temp git repos built in-test,
following the `spawnSync("git", ["init", …])` precedent at `tests/specLint/cli.test.ts:35`, so no
network is involved.

Cases: a declared claim on an unmerged branch is reported; the same branch merged into main is not;
a branch whose tip is 20 days old is reported under `stale` and not dropped; two branches declaring
one id both appear; an id declared only by the current branch is not a collision; a ledger file
missing at a ref is skipped without error.

<!-- spec-lint: ignore — this file is created by this spec; it is created by this spec's implementation and is not tracked yet -->

### 7.2 `tests/scripts/ledgerClaimsCheck.test.ts` — exit codes

Catches: the asymmetry in §4.4 collapsing, in either direction. A declared collision must exit 1; an
inferred-only collision must exit 0 and print `WARN`; zero ids must exit 2; the vacuity case in §4.2
must exit 2 rather than reporting a false all-clear.

**Every universe-verification path in §4.1 gets its own case.** R4 finding 3 observed that R3's
repair made these load-bearing without pinning any of them, so an implementation could still return
a false all-clear through five distinct doors while passing everything above:

| Condition | Required exit | The false result it prevents |
| --- | --- | --- |
| Fetch fails, cached refs carry another branch's live declaration | 2 | exit 0 from an unverified universe |
| Zero `refs/remotes/origin/*` resolved | 2 | exit 0 from an empty universe |
| Fetch succeeds but the resolved head **set** is missing a name `git ls-remote` reports | 2 | exit 0 from a silently narrowed universe (the configured-refspec case) |
| Detached HEAD with no `GITHUB_HEAD_REF` | 2 | exit 1 attributing the caller's own marker to a stranger |
| `git ls-remote` fails after a successful fetch | 2 | R9 finding 3: `execFileSync` throws (status 128) and an uncaught throw exits **1**, which §3.3 and §6.2 both define as another branch's collision. An implementation that simply omits the catch passes every other row here |
| **Equal or larger head count, wrong members** | 2 | R11 finding 3: the case must plant `resolved = {main, stale-deleted}` against `remote = {main, claimed-live}`, and a second with `resolved` strictly larger. Both have no count shortfall while the claimed branch is absent, so a cardinality assertion passes over exactly the branch that matters |
| **Only `main` on origin** | **0** | R11 finding 2: a legitimate empty universe, not a parser failure. Also planted: a candidate that predates the ledgers, and a candidate whose ledgers are genuinely empty. All three satisfy "every branch yields 0" and must NOT exit 2, which is the assertion that fails if the non-empty-candidate clause is dropped |
| **`--json` envelope shape** | n/a | R11 finding 4: assert the payload is an object with `status` and `degraded`, that a healthy empty run and a fetch-failed run are **distinguishable**, and that `degraded` names the state. A bare-array implementation passes the 101-entry cap test while making those two runs byte-identical |
| **The no-em-dash boundary entry** | n/a — a positive case | R10 finding 6: no test planted the shape R7 finding 1 was about. A fixture entry whose heading carries no em dash must resolve, with its span, and be attributable. This is the one case the deleted `HEADING` regex fails and the authoritative grammar passes, so it is the only assertion that catches a silent reversion to the old recognizer |
| **`levels: [2]` instead of `[2, 3]` on the backlog pair** | n/a — a positive case, **not** an exit code | R10 finding 6's second mutant, and the reason the zero-result vacuity gate is not sufficient on its own: dropping H3 keeps 46 of 92 backlog entries and 144 of 229 archive entries, so **no file is empty and the global floor is cleared** while 74 unique ids vanish. R11 finding 5 caught an earlier draft demanding exit 2 here, which its own numbers refute — no vacuity condition fires, so there is nothing to exit 2 about. The contract is the positive assertion alone: a known H3 entry resolves. That is the only thing the mutant fails |
| A deferred ledger parsed with the backlog `ExtractOpts` | 2 | R8 finding 1 / R9 finding 1: both deferred files yield zero entries, a planted deferred claim vanishes, and the global floor stays satisfied by the backlog entries alone. **The case plants a claim in `DEFERRED.md` and asserts it is found**, which is the only assertion that fails when the opts mapping is wrong |
| 101 candidates, the collision in the 101st | **1** | exit 0 from a collision hidden behind the display cap |

The last row is the one that must NOT be exit 2: the cap is display-only (§4.1), so a collision past
it is a real collision and has to fail like any other. A test that only asserted "everything
degraded exits 2" would pass an implementation that gave up whenever the branch list was long.

**Three more cases, one per prose-only repair.** R6 finding 3 swept the R5 repairs and found every
one of them unpinned — a repair stated only in prose regresses silently, which is how R2's fix
became R3's finding:

| Case | Catches |
| --- | --- |
| `--json` with 101 candidates and the collision in the 101st emits **all** 101 entries | §3.3's "never capped" regressing to the human-output cap, handing a machine consumer a truncated set with no truncation marker |
| The shallow discriminator is parsed as a **string**, not for truthiness | `git rev-parse --is-shallow-repository` prints the literal `false`, and `Boolean("false")` is `true`, so a truthiness read permanently inverts the merged-exclusion while passing every full-clone fixture in §7.1 |
| A fixture repo made genuinely shallow, asserting the merged-exclusion is skipped and `declared` still resolves | §3.2 step 2's whole shallow branch being dead code that no test ever enters |

The shallow case needs a real shallow fixture (`git clone --depth=1 file://…`), not a stubbed flag,
because the discriminator's return value is the thing under test.

Anti-tautology: expected ids are derived from the fixture repo's own planted ledger text, never
hardcoded, so a reader that returns a fixed list cannot pass.

<!-- spec-lint: ignore — this file is created by this spec; it is created by this spec's implementation and is not tracked yet -->

### 7.3 `tests/docs/_metaLedgerClaimCollision.test.ts` — the CI backstop

Catches the §2.1 collision at PR time when Stage 0's `--check` was skipped: for every row **this**
branch declares in-progress, no other unmerged origin branch may declare the same row.

- Declared-versus-declared only, for two independent reasons: reconciliation prose must not fail a
  PR, and §2.7b measured that `inferred` cannot be computed at all without a merge-base.
- Fetches what it needs itself: `git fetch --no-tags --depth=1 origin '+refs/heads/*:refs/remotes/origin/*'`,
  30 s timeout, measured at 1.8 s against a real depth-1 clone (§2.7b). Depth 1 is sufficient because
  only tip file content is read, and it respects the wall-clock constraint recorded at
  `.github/workflows/unit-suite.yml:149`.
- Candidate set is every non-main head, with the merged-exclusion skipped because ancestry is
  unavailable (§3.2 step 2). Deliberately NOT scoped to open PRs: R2 measured two branches declaring
  markers with no open PR, so a PR-scoped guard would pass while missing a real claim.
- Uses no `gh` and no GitHub API. R2 measured that `unit-suite.yml` supplies no `GH_TOKEN`, and a
  required check must not acquire a network-auth dependency it cannot satisfy.
- Current branch from `GITHUB_HEAD_REF`, asserted explicitly. Without it the PR's own marker,
  fetched back as an origin head, collides with itself and fails every PR that declares anything —
  the guard's most damaging possible failure, since it fails precisely the sessions that complied.
- A test that plants a self-collision (this branch's marker, present on its own origin head) and
  asserts the guard stays silent. This is the anti-tautology case: a guard that compared everything
  against everything would pass every other test here and fail every real PR.
- Under `CI`, a fetch failure **fails** the test, matching the deliberate no-skip posture at
  `tests/docs/_metaLedgerInProgress.test.ts:199`. Locally, a fetch failure skips, so an offline
  `pnpm test` does not go red for an environmental reason.
- Vacuous-pass guard: asserts the fetch resolved at least one non-main head before asserting
  anything about collisions.
- Planted-input suite proving the rule fires, in the shape of
  `tests/docs/_metaLedgerInProgress.test.ts:224`.

Registry note, covering **every** new file this spec adds that carries a synthetic `BL-` id.
`NOT_CITATIONS` (`tests/docs/_metaLedgerReferentialIntegrity.test.ts:76`) is an exclusion set for
ledger-guard tests whose ids are fixtures rather than references, and
`tests/docs/_metaLedgerReferentialIntegrity.test.ts:106` scans every tracked `*.md`/`*.ts`/`*.tsx`,
so anything not excluded is scanned by default:

| New file | Row needed? |
| --- | --- |
| The §7.3 collision backstop | **Yes** — plants synthetic ids |
| §7.4b's committed fixture corpus | **Yes** — R5 finding 5 caught this one missing; a tracked fixture of planted ledger entries fails the citation guard on this branch's own CI |
| §7.1 / §7.2 reader tests | **Yes if** their planted ledgers use `BL-`-shaped ids, which they do |
| The §3.1 shared parser module | No — contains no ids |
| The §3.2 reader script | No — contains no ids |
| **This spec document** | **Yes, and in the other registry** — see below |

The last row belongs in a **different registry than every row above it**, and took three rounds to
get right. `tests/docs/_metaLedgerReferentialIntegrity.test.ts:106` walks every tracked `*.md`, and
a spec is a tracked `*.md`.

The two registries are not interchangeable, which R8 finding 3 caught an earlier draft conflating:

| Registry | Granularity | Effect |
| --- | --- | --- |
| `NOT_CITATIONS` (`tests/docs/_metaLedgerReferentialIntegrity.test.ts:76`) | whole file | the file is **never scanned**, so every citation in it goes unchecked |
| `NOT_A_CITATION` (`tests/docs/_metaLedgerReferentialIntegrity.test.ts:202`) | per file, per id, each with a reason string | those ids are exempt; every other citation in the file is still verified |

Putting this spec in `NOT_CITATIONS` would silence its synthetic ids **and** its real ones —
including the two rows §9.2 and §9.3 file, so a later typo in either would become invisible. It goes
in `NOT_A_CITATION`, one row per synthetic id with its reason, following the precedent already set
for a sibling spec at `tests/docs/_metaLedgerReferentialIntegrity.test.ts:203`. That registry also
fails a row whose id later becomes real, so the exemptions cannot quietly outlive their examples.

**Eight rows, enumerated rather than counted — and `BL-TWO` deliberately absent.** R9 finding 2
caught an earlier count that dropped `BL-TWO`; R10 finding 9 then established that `BL-TWO` needs no
row at all, because the guard suppresses it as a family stem before consulting the registry
(`BL-TWO-WAY-SHEET-SYNC` is real). Confirmed by running the guard: it reported five unresolved ids,
never `BL-TWO`, and passes with eight rows. Counting was wrong twice in a row, in both directions,
which is why this is a table:

| Id | Where | Why synthetic |
| --- | --- | --- |
| `BL-SOME-OTHER-ROW` | §3.2 sample output | placeholder in the report example |
| `BL-A`, `BL-B` | §3.3 usage line | `--check` argument example |
| `BL-DEFINED`, `BL-MENTIONED`, `BL-COLON`, `BL-NESTED`, `BL-ONE` | §9.2 probe table | the over-mint probe's planted inputs |

`BL-TWO` appears in §9.2's probe alongside `BL-ONE` but takes **no row**, which R11 finding 6 caught
the table contradicting its own prose about. The guard suppresses it as a family stem before
consulting the registry, because `BL-TWO-WAY-SHEET-SYNC` is a real entry (`BACKLOG.md:1218`). Adding
a ninth row would be an exemption that exempts nothing, and neither ratchet would reject it — the
registry fails a row whose id becomes real, not one that was never needed.

`BL-LEDGER-BODY-DEFINED-ID-OVERMINT` and `BL-LEDGER-MDAST-SHARED-HOME` are deliberately **not** in
that list: both resolve, because §9.2 and §9.3 open them.

The rows land in the same commit as the file that needs them, never as a follow-up: a missing row
fails CI immediately, so deferring it just means a red branch.

### 7.4 `tests/docs/_metaLedgerInProgress.test.ts` — the move, then the recognizer

Two separate tasks, in this order, so the second is not confounded by the first.

**7.4a — the extraction is behavior-preserving for fields, and deliberately widening for entries.**
Two claims, tested separately, because R7 finding 1 made the second one true.

*Fields.* The existing planted-input suite runs against the imported module with no assertion
changes; a diff to those assertions is the signal that §3.1's move was not clean.

*Entries.* Replacing the local `HEADING` regex with `extractEntries` makes the guard see entries it
previously did not, so this is a widening of an existing guard and needs its own measurement rather
than an assurance. Approximating `extractEntries` with a no-em-dash-required heading match across
all four ledgers on `origin/main`:

```
BACKLOG.md:          91 recognized today,  2 newly visible
BACKLOG-archive.md: 229 recognized today,  0 newly visible
DEFERRED.md:         15 recognized today,  0 newly visible
DEFERRED-archive.md:139 recognized today,  4 newly visible
newly FLAGGED by any existing rule: 0
```

Six entries become visible and **none** trips an existing rule, so the switch widens coverage
without turning main red. The approximation is stated as such: the implementation task re-runs this
against the real `extractEntries` before the switch lands, and a non-zero newly-flagged count is a
stop-and-reconcile, not a fix-forward — the entries it would flag are pre-existing ledger content
this branch did not author.

**7.4b — the guard adopts position-independent detection.** §2.7a measured that the 12-line window misses
a live marker, and that the guard is therefore blind to a marker it is supposed to validate. This is
a behavior widening of an existing guard, so it gets its own task and its own cases:

- The out-of-window marker on `chore/ledger-body-ids-enum-scan-widen` is now seen. Planted as a
  fixture with its measured shape, not read from the live branch, so the test does not decay when
  that branch merges.
- The existing plant at `tests/docs/_metaLedgerInProgress.test.ts:277` — a bare `**Branch:**`
  fourteen paragraphs deep — must still be ignored. This is the case the window existed for, and the
  same-line `Status` requirement is what replaces it. If this assertion is relaxed rather than
  preserved, the recognizer is wrong.
- A line carrying `Status: OPEN` alongside a `Branch` field stays a violation of the existing
  flight-field rule, unchanged.
- Corpus regression bound: asserted against a **committed fixture corpus**, never against origin, so
  it cannot decay when the live branches merge. The fixture reproduces §2.7a's measured shapes — the
  two in-window markers, the out-of-window marker, the deep-quoted bare
  `**Branch:**`, and the status-only malformation — and pins **both** detection and field
  extraction. R8 finding 4 built the escaping mutant against a detection-only bound: scan any-depth
  `Status`, keep the old 12-line `fields`, and an implementation matches the required count while
  the out-of-window `Branch` never reaches shape or liveness validation — R4 finding 1 walking back
  in through the test. So the fixture asserts, per entry, the detection verdict **and** the resolved
  `fields.Branch`, with the out-of-window fixture required to expose its branch and the deep-quote
  fixture required not to. Detection alone is **4 of 5**: everything except the deep-quoted bare
  `**Branch:**`, whose line carries no status. R4 finding 2 caught an earlier `3 of 5` here,
  which was arithmetically incompatible with status-alone detection and could only have been
  satisfied by hiding the status-only malformation that §4.2 explicitly requires to be visible. A
  bound read from live refs would have been green today and meaningless next week, which is the
  decay this fixture exists to avoid.

<!-- spec-lint: ignore — this file is created by this spec; it is created by this spec's implementation and is not tracked yet -->

### 7.5a `tests/docs/_metaAgentsMarkerContract.test.ts` — the delta stays complete

Catches the class R2 finding 6 caught twice by hand: an edit to one of AGENTS.md's statements of the
marker contract, leaving the others contradicting it. The guard is literal and narrow, and that is
the point — it does not model the prose, it pins the specific sentences that drifted.

**One assertion per §6 edit, all six.** R5 finding 1 built four escaping mutants against a
three-assertion draft, so the mapping is now exhaustive and stated as a table rather than a list:

| §6 edit | Assertion | The mutant it stops |
| --- | --- | --- |
| 6.1 reading rule | `AGENTS.md` contains a sentence naming `ledger:claims` **and** stating claims are read from origin's branches | never adding §6.1 at all, which an earlier draft's assertions all tolerated |
| 6.2 Stage 0 check + push | **Both** `AGENTS.md:38`'s paragraph and the Stage 0 lifecycle bullet name the check command and the push. Asserted at both locations, not "the Stage 0 statement" singular | implementing at the invariant-12 paragraph only and leaving the lifecycle bullet unchanged |
| 6.3 pre-merge removal | Neither retired ordering survives — "after the `0  0` check, removes it" and "the moment the PR merges, the marker goes away with it" — **and** `AGENTS.md` positively states that removal happens in the PR's last commit, before the merge | the original R2 drift, plus R6 finding 4's mutant: delete both retired strings, add nothing, and an absence-only row passes while AGENTS.md now says nowhere when the marker comes off, silently deleting the removal half of the writer contract |
| 6.4 Stage 4.4 bullet | The Stage 4.4 bullet mentions the pane and the agent and does **not** mention the marker; pane, agent, and `CronDelete` instructions are all still present | R3 finding 4's mutant, plus a repair that "fixes" the contradiction by deleting the bullet wholesale |
| 6.5 parenthetical deleted | The string "takes its marker with it by construction" appears **nowhere** in `AGENTS.md`. Probed: it is present exactly once today, at `AGENTS.md:27` | keeping a sentence R3 finding 3 showed is false against `tests/docs/_metaLedgerInProgress.test.ts:149` |
| 6.6 pipeline reordering | On `AGENTS.md`'s autonomous-pipeline sentence, the marker clause precedes the `spec →` clause | editing four locations and leaving the pipeline sentence ordering the marker after two full review cycles — which silently reopens the hours-long window §2.1 measured |

The last row is the one worth dwelling on: it is the only assertion that pins an **ordering** rather
than a presence, and §2.1's collision is precisely an ordering failure.

Failure message points at §6 of this spec, so the next editor learns the sweep rule rather than
rediscovering it.

### 7.5 Preflight wiring, then preflight isolation

R3 finding 5 caught this section as originally written being vacuously satisfiable: every listed
assertion was about preflight surviving a claims failure, and **not wiring claims in at all**
satisfies all of them. Unmodified preflight exits 0, never spawns the child, and therefore stays
green through every "the child failed / timed out / was suppressed" case. The positive assertion has
to come first.

**7.5-positive — preflight actually invokes the reader, on every success path.** Asserts that the
claims child is spawned and its table reaches preflight's output, with the child stubbed to emit a
recognizable line, under **all three** exits that print `env ✓`: the default DB-probe path,
`--no-db` (`scripts/preflight-env.mjs:132`), and `psql` absent from `PATH`
(`scripts/preflight-env.mjs:142`).

**`--no-fetch` is asserted behaviorally, not as an argument string.** R6 finding 3a caught the
spawn-only version; R7 finding 3 caught the repair, which asserted the flag was *passed* and stopped
there. An implementation that accepts `--no-fetch`, skips `git fetch`, and still runs the shortfall
check's `ls-remote` satisfies an argument assertion while keeping an unbounded network call inside
the 15 s budget — the same defect wearing the flag. R8 finding 5 then refuted the first repair of that: asserting the reader **completes** against an
unreachable remote proves nothing, because connection refusal is immediate — measured at 0.03 s for
`git ls-remote` and 0.04 s for `gh` against unroutable hosts, so an implementation that still runs
both passes a completion assertion and reveals itself only on a blackholed network months later.

The assertion is therefore **non-invocation**, not timing: the test spies on the process-spawn
boundary and asserts that under `--no-fetch` no `git fetch` and no `git ls-remote` child is created
at all. A separate case covers `gh`'s 10 s bound directly, by stubbing a child that never exits and
asserting the reader still prints its table with the PR column blank.

**The test must clear `CI` from the child's environment.** R5 finding 4: §3.4 suppresses the claims
step under `CI`, and `tests/scripts/**` is not in `PARALLEL_TEST_GLOBS` (`vitest.projects.ts:86`) so
it runs in the `serial` project (`vitest.config.ts:96`) with `CI=true` on every Actions run. Without
an explicit `CI: undefined` in the spawned environment, the single assertion that makes all of §7.5
non-vacuous is green locally and red in CI — the local-passes-CI-fails class the cross-cutting
discipline names by name. A companion case asserts the opposite direction: with `CI` set, the child
is **not** spawned. Testing only the default path was R4 finding 4's escaping mutant:
a step appended at the end of the file passes it while leaving both early exits dark. These are the
assertions that fail if the wiring is skipped or misplaced, and every assertion below is conditional
on them.

**Isolation.** Given the wiring is present: `pnpm preflight` exits 0 when the claims subprocess
fails, times out, or exits non-zero; `--no-claims` and `PREFLIGHT_NO_CLAIMS=1` each suppress it; and
`CI` suppresses it. Each suppression case additionally asserts the child was **not** spawned, so a
"suppression" implemented by discarding output rather than skipping work is caught.

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

**Deferral reason, per the class-sweep disposition rule (`AGENTS.md:227`).** That rule makes
in-branch repair the default and requires any deferred peer to name which exception applies, with
"same defect, different file" explicitly insufficient. This filing claims **exception (b): a
ratified scope decision already fences it** — the originating brief instructed "Open a `BACKLOG.md`
row with this probe output; do not fix it as part of the invariant-12 work", ratified 2026-08-03 and
recorded in §1.

Exception (c) would also hold on its own: the defect lives in `bodyDefinedIds`
(`tests/docs/_ledgerMdast.ts:346`), an id-definition surface this branch does not otherwise touch,
and tightening its recognizer requires a probe demonstrating the corruption prevented — which is a
spec of its own, not a line in this one. The sweep for peers of this shape was run and found none:
`bodyDefinedIds` is the only body-scanning id recognizer in the tree, pinned as sole-caller by
`tests/docs/_metaLedgerReferentialIntegrity.test.ts` P5-sole.

### 9.3 Filed as a by-product: `BL-LEDGER-MDAST-SHARED-HOME`

§3.1 has `scripts/**` importing `tests/docs/_ledgerMdast.ts`. That direction is backwards, and the
right repair is relocating the module beside its new consumer. Deferred under **exception (c)** of
`AGENTS.md:227` — a redesign of a surface this branch does not otherwise touch, spanning four
importers (`_metaDeferralLedgerGraduation.test.ts`, `_ledgerMdast.walker.test.ts`,
`_metaLedgerReferentialIntegrity.test.ts`, and the new reader) plus three hardcoded path exemptions
inside the referential-integrity guard that would all have to move in lockstep.

The import is safe in the meantime, and pinned rather than merely asserted: `_ledgerMdast.ts` is a
plain module rather than a test file, and `tests/docs/_metaLedgerReferentialIntegrity.test.ts`
already forbids `node:fs`, `node:path`, and `require(` inside it, so it cannot acquire I/O or
import-time side effects. Probed: zero hits for all three.


---

## 10. Review provenance

R1 through R4 ran through `codex-guard` against Codex (`gpt-5.6-sol`, reasoning effort high),
returning BLOCKING with 6, 8, 7, and 4 findings respectively. Every finding was accepted; none was
refuted.

R5 and R6 could not run there. Codex returned `You've hit your usage limit … try again at Aug 10th, 2026
6:16 PM` on three consecutive wrapper attempts, each producing a zero-line transcript — a distinct
shape from the silent-death class documented in `docs/agents/codex-silent-death-2026-07-24.md`,
which does real work before dying. R5 therefore ran as a fresh-eyes Opus session against the same
brief and the same admissibility contract, returning BLOCKING with 8 findings. R6 ran the same way
and returned BLOCKING with 6. All 14 were probe-backed and all were accepted; none was refuted.

This is a real reduction in review strength, recorded rather than glossed: the cross-CLI discipline
exists because an opposing model's blind spots differ from the implementer's, and an opposing
session shares them. Two observations bound how much was lost. R5's findings were of comparable
character to R1-R4's — four escaping mutants against a guard, an unimplementable gate condition, an
inner timeout exceeding its outer bound, and a local-passes-CI-fails env leak — and both rounds independently re-ran
every probe in §2 — R5 catching that the absolute counts had already decayed, R6 re-verifying 40-odd
`file:line` anchors clean. R6's findings were also the shape a converging review produces: one
self-contradiction introduced by an R5 repair, three repairs that existed only in prose with no test
pinning them, and two smaller gaps. What could not be claimed then was that a same-model round substitutes for a cross-model one, and
R7 settled it in the negative. Codex's usage window reopened, R7 ran cross-model against the same
document, and its first finding was a class six prior rounds had all walked past: the spec preserved
a heading grammar requiring an em dash while the repository's authoritative ledger walker does not,
so a marker on a live entry would have been **silently attributed to the preceding entry** with
every vacuity gate satisfied. Two Opus rounds had reviewed the parser section and neither questioned
the grammar, because both inherited the same assumption the implementer did — which is exactly the
blind spot the cross-CLI discipline exists to cover, demonstrated rather than argued.

The practical rule this run supports: a same-model round is a real gate and worth running when the
cross-model one is unavailable, and it is not a substitute for one. R5 and R6 found 14 defects that
would otherwise have shipped; R7 found one that neither could see.
