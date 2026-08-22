# Review-round arc sum — the filing threshold counts per arc, not per merge base

**Date:** 2026-08-22 · **Ledger row:** `BL-REVIEW-ROUND-COUNT-RESETS-ON-REMERGE` (`BACKLOG.md`) · **Branch:** `feat/review-round-arc-sum` · **Amends:** `docs/superpowers/specs/ci/2026-08-04-review-round-economy.md` §4.3, §5.2, §8.3 limit 3

The round-economy gate counts a stage's rounds inside one `<baseSha12>.jsonl` file. Re-merging `origin/main` moves the merge base, so the next dispatch writes into a new file and the counter restarts at 1. An arc that burns four diff rounds across two bases reaches the threshold in neither file and owes nothing, and the gate's only enforcement point stops firing on exactly the long arcs it was built for.

This spec adds a second, residual obligation that sums a stage's rounds across every base under one branch directory. The per-base obligation, the per-base contiguity rule, and the per-base filing location are all untouched.

## §1 Purpose

`BL-REVIEW-ROUND-COUNT-RESETS-ON-REMERGE` measured the defect on a live arc: `feat/pane-compaction-send-auth` re-merged main after diff round 3, and round 4 landed in a fresh file as round 1. Its filing was written voluntarily and says so.

The incentive runs backwards. AGENTS.md's closure-hit rule *requires* a re-merge whenever main touches a file the branch touched, so the arcs most likely to split their corpus are the long ones — the arcs the cap exists to make account for themselves. No bad faith is needed: an arc can reach the cap, re-merge, and continue with a fresh counter without deciding anything.

The corpus also **forbids the honest workaround**, which is how the row confirmed the defect. Declaring the arc-honest number at a new base fails the contiguity check (`round_gap`): a first row at a new base recording "diff round 4" is rejected, and must be renumbered to 1 to pass. So the layout does not merely fail to sum across bases; it actively requires base-local renumbering.

## §1.1 Resolved scope — do not relitigate

1. **The repair shape is the ledger row's, ratified before this spec.** The threshold sums per **arc** (the branch directory); the filing's **location stays per-base** (it names the head the rounds examined). The corpus is already laid out branch-first, so the sum is a directory read rather than a new key. Arguing for a per-base threshold, or for relocating filings, argues against the row.
2. **Distinct `(baseSha, round)` pairs, never distinct `round` values.** A rebase renumbers, so `round` alone collides across bases and undercounts. The row settles this: "sum distinct `(base, round)` pairs, not distinct `round`".
3. **An arc that re-bases onto a much later main is the same arc for accounting.** The row settles this too. The directory is the accounting unit; how far the base moved is not consulted.
4. **The heading's declared count stays per-base, measured not assumed (§2, probe 2).** Of the 37 live filing sections where the per-base count and the arc sum differ, **37 declare the per-base count and 0 declare the arc sum**. Moving `count_mismatch` to the arc sum would red 37 sections of immutable evidence. The arc total belongs in the section's `**Examined:**` line, which the gate does not judge (2026-08-04 spec §7.2).
5. **The change is monotone, and that is the compatibility argument.** The per-base rule is untouched; the arc rule only *adds* problems. No corpus that passes today can fail on a per-base ground it passed on before, and every arc obliged today stays obliged. Pinned executably (§5).
6. **Hard, with a frozen grandfather set — not a permanent advisory tier.** The arc sum newly obliges **11** `(branch, stage)` pairs (§2, probe 1), and **all 11 are merged with no branch on origin** (probe 1b), so an advisory list naming them could never drain: it would be a standing false signal, and the dated hardening step would arrive with all 11 still owing. The frozen never-added set is the shape this gate already ships for the Mechanizable parity rule (`lib/reviewRounds/mechanizableGrandfather.ts`), for the same reason — filings and corpus rows are immutable evidence, so a rule that cannot be complied with retroactively binds forward only. Ratified by the orchestrator 2026-08-22 over the advisory-first alternative.
7. **The gate never consults `_roundAtPreviousBase`.** The cross-reference key some arcs write on their first row at a new base is traceability prose for a human reader, and §5 of this spec recommends it. Making the sum *depend* on it would defeat the gate against its own threat model: the 2026-08-04 spec §8.1 fences this system to "an arc that forgets", and a sum an arc must declare is defeated by forgetting. Measured: only 2 of 61 multi-base branch directories carry the key.
8. **Walker-derived discovery is preserved.** Both obligations read the corpus from disk (`readArcs`, `lib/reviewRounds/corpus.ts:112`). A new branch directory is covered without registration and fails by default. Any proposal that registers arcs is out of scope.

## §2 Probes

Every number below is produced by command over the live corpus at merge base `50ca72a56`. Scripts are committed at `scripts/probes/reviewRoundArcSum/` so each is re-runnable, and §5 pins the two decisive counts as executable assertions rather than prose.

### Probe 1 — how many arcs newly owe

`pnpm exec tsx scripts/probes/reviewRoundArcSum/arcSum.ts .`

```
arcs (branch directories): 126
arc-stage pairs with counted rows: 281
multi-base arcs: 61
malformed json lines: 0

NEWLY OWING (arcSum >= 4, no base at threshold, no filing section): 11
  chore/archive-duplicate-ids            | diff | maxPerBase=2 arcSum=4
  ci/app-e2e-batch1                      | plan | maxPerBase=2 arcSum=4
  docs/harness-false-failures-spec       | plan | maxPerBase=3 arcSum=4
  feat/crew-chrome-footer-avatar         | diff | maxPerBase=2 arcSum=4
  feat/diagram-viewing-polish            | diff | maxPerBase=2 arcSum=5
  feat/m2-e2e-infra                      | diff | maxPerBase=2 arcSum=4
  feat/mutation-ref-sub                  | diff | maxPerBase=3 arcSum=4
  fix/premisescan-registrar-accept-sets  | diff | maxPerBase=3 arcSum=6
  fix/scanner-scope-totality             | diff | maxPerBase=1 arcSum=5
  fix/sendauth-arm-classifier-unification | diff | maxPerBase=3 arcSum=4
  test/execution-methods-driver-derived  | diff | maxPerBase=3 arcSum=4
```

`fix/scanner-scope-totality` is the clearest instance: five diff rounds across five bases, **one round in each file**, obliged nowhere.

**Probe 1b — every one of the 11 is merged.** For each branch: `git ls-remote --heads origin <branch>` returns 0 refs, and `git log --merges --first-parent origin/main` holds exactly 1 merge commit naming it. None can ever gain a filing, which is what rules out the advisory tier (§1.1.6).

### Probe 2 — what existing filings declare

`pnpm exec tsx scripts/probes/reviewRoundArcSum/declared.ts .`

```
filing sections where perBase == arcSum (indistinguishable): 180
filing sections where perBase != arcSum (decisive):           37
  declared == perBase count : 37
  declared == arc sum       :  0
  declared == neither       :  0
```

Unanimous, and it settles §1.1.4 by measurement: `count_mismatch` stays per-base.

### Probe 3 — branch-name reuse against the corpus

`pnpm exec tsx scripts/probes/reviewRoundArcSum/reuse.ts .`

```
corpus branch directories: 126
branch names merged more than once, ANY: 4
of those, ones that HAVE a corpus directory: 0
```

The three reused names the 2026-08-04 spec §5.2 enumerates (`feat/attention-alert-routing`, `feat/watch-reconcile-backoff`, `feat/role-vocab-settings-desktop-grid`) plus one more all predate the corpus. This is the one hazard a per-directory sum introduces, and it is at zero live instances; §4 limit 1 bounds it.

### Probe 4 — the freeze boundary

`pnpm exec tsx scripts/probes/reviewRoundArcSum/freeze.ts .`

```
latest startedAt across the 11 grandfathered pairs: 2026-08-21T18:48:38.105Z
entries with a row missing startedAt:               0
latest startedAt anywhere in the corpus:            2026-08-22T05:41:59.637Z
```

`ARC_SUM_FREEZE` is set between them (§3.3).

## §3 Design

### §3.1 Two obligations, the second residual

The threshold rule gains a second clause. Both live; the per-base clause is unchanged.

**Clause A — per base (unchanged, 2026-08-04 spec §4.3).** A stage whose distinct counted `round` values *within one base file* reach `ROUND_THRESHOLD` owes a filing section **at that base**. Reported as `missing_filing`.

**Clause B — per arc (new).** For a branch directory *D* and a counted stage *S*:

```
arcCounted(D, S) = |{ (row.baseSha, row.round)
                      : row ∈ every .jsonl under D,
                        row.status === "verdict",
                        row.stage === S }|
```

When `arcCounted(D, S) >= ROUND_THRESHOLD` **and no base under D satisfies clause A for S**, the directory owes a filing section for *S* in **any one** `.md` under *D*. Reported as a new `ProblemKind`, `missing_arc_filing`, whose message names the directory, the sum, and the per-base breakdown that produced it.

Clause B is deliberately **residual**: it fires only where clause A cannot see. That gives three properties worth having, and each is a test in §5.

- **One obligation, one message.** An arc with 5 rounds at base A and 2 at base B is reported once, by clause A at A, never twice.
- **Monotonicity (§1.1.5).** Clause A is untouched and clause B only adds, so the problem set can only grow. This is what makes the change safe over 126 historical directories without inspecting them one at a time.
- **No new satisfaction path for a clause-A obligation.** A filing elsewhere in the directory never discharges a base that reached the threshold on its own. This is the property that keeps branch-name reuse from *weakening* the gate: a reused name whose second PR burns 4 rounds at one base still owes at that base, exactly as today.

**Where clause B's filing goes.** Any `.md` under the directory. The gate does not pick, because the filer knows which head the rounds actually examined and the 2026-08-04 spec §7.2 keeps the gate out of prose judgment. The convention the README states is the **latest** base holding rows for that stage.

### §3.2 What stays per base, and why the contiguity rule survives

The ledger row asks this spec to state exactly which invariant replaces per-base contiguity. The answer is that **nothing replaces it — it stays, and the sum is what makes it harmless.**

| Check | Unit | Change |
| --- | --- | --- |
| `round_gap` (contiguous `1..N`) | per base file | none |
| `count_mismatch` (heading vs corpus) | per base file | none — §1.1.4, probe 2 |
| `identity_mismatch` (row vs path) | per base file | none |
| `stage_without_rows` | per base file | none |
| `missing_filing` | per base file | none |
| **`missing_arc_filing`** | **per branch directory** | **new (§3.1 clause B)** |

Per-base contiguity forced the reset only because the *threshold* was also per base. Once the threshold sums distinct `(baseSha, round)` pairs, renumbering from 1 at a new base is arithmetically free: `(A,1) (A,2) (A,3) (B,1)` is four pairs, and so is `(A,1) (A,2) (A,3) (B,4)`. The three-part shape is the one already on disk — **contiguity per base, sum per arc, and a `_roundAtPreviousBase` cross-reference linking the bases for a human reader.**

Keeping contiguity also preserves what it is for: it detects rows lost or hand-edited *within* a file, a diagnosis that has nothing to do with base moves.

### §3.3 The grandfather set

<!-- spec-lint: ignore — new file created by this spec's implementation; not yet tracked -->
A new module `lib/reviewRounds/arcSumGrandfather.ts` exports the 11 pairs from probe 1 as a literal, plus the freeze timestamp:

```ts
export const ARC_SUM_FREEZE = "2026-08-22T00:00:00.000Z";
export const ARC_SUM_GRANDFATHERED: readonly { branch: string; stage: CountedStage }[] = [ … ];
export function isArcSumGrandfathered(branch: string, stage: string): boolean;
```

`(branch, stage)` and not a path, because clause B's obligation is not attached to any one base — that is the whole point of it. The lookup builds a `Set` keyed on `` `${branch} ${stage}` `` at module load, matching the separator `readArcs` already uses for the same reason (`lib/reviewRounds/corpus.ts:124`): the hash, dash and colon characters are all legal in git branch names and would collide.

**Additions are rejected structurally, not by convention.** Three assertions in the meta-test, each over the *live* corpus:

1. **Every grandfathered pair's counted rows all carry a `startedAt` strictly before `ARC_SUM_FREEZE`.** A row with `startedAt: null` cannot be proven older and therefore fails — conservative and loud (measured: 0 such rows among the 11). Every row written from now on postdates the freeze, so **no future arc can be added to the set at all.** This is the structural rejection; the prose contract in the header comment is a description of it, not the mechanism.
2. **Every grandfathered pair still owes under clause B.** An entry whose arc has since gained a filing, or whose rows were deleted, is stale and fails — so the set can only **shrink**, exactly like `MECHANIZABLE_GRANDFATHERED`.
3. **The set holds exactly 11 entries**, the dated count from probe 1, as a second lock against a silent edit.

Fixture-planted arcs are never in the set, so meta-test fixtures exercise clause B by default; one fixture plants a grandfathered pair to cover the exemption branch, and one plants a pair with a post-freeze row to cover the addition guard.

### §3.4 The report (`pnpm review:economy`)

The report is the reader that made the defect invisible. It prints one line per `(branch, base)` — `chore/archive-duplicate-ids` appears as two `diff 2/2` lines with nothing showing the 4 — so a reader scanning it sees two short arcs and no obligation.

For every branch directory with more than one base, the report gains a **totals line** listing each counted stage's arc sum, marked when the sum reaches `ROUND_THRESHOLD` and no section for that stage exists anywhere in the directory. It gates nothing; the meta-test does.

### §3.5 Author-facing contract (`docs/review-rounds/README.md`)

The filing-duty section gains: the threshold is reached either by one base's rounds or by the arc's rounds summed across its bases, counting distinct `(base, round)` pairs; a re-merge restarts `--round` at 1 by design and the arc sum is unaffected; the first row at a new base should carry `_roundAtPreviousBase` for traceability; a filing owed by the arc sum goes at the latest base holding rows for that stage, its heading declares **that file's** count, and its `**Examined:**` line names the cross-base total.

## §4 Documented limits

1. **A reused branch name sums two unrelated PRs.** Direction: **over-obligation** — a filing demanded where two short PRs shared a name — which the 2026-08-04 spec §8.2 already rules a documented limit costing one `**Mechanizable:** none` line. Zero live instances (probe 3), and the four reused names in history all predate the corpus. The alternative — partitioning a directory's bases by the merge commits of that branch on main — is **not implementable in this gate**: `mergedArcs` declines outright on a shallow clone (`lib/reviewRounds/mergedArcs.ts:46`) and CI checks out at depth 1 by design, so a git-ancestry partition would silently do nothing in the only environment that matters.
2. **One under-obligation residue survives, and it already exists today.** Reused branch name, *and* the second PR re-merges so no base of its own reaches the threshold, *and* the first PR filed for that stage — the old filing then satisfies clause B for the new PR. It requires all three, has zero instances, and is not a regression: the same arc escapes under today's rule too, since neither of its bases reaches the threshold either. Monotonicity (§1.1.5) is what guarantees that reading.
3. **A clause-B filing's heading declares its own base's count, not the arc sum** (§1.1.4). `## diff — 1 rounds` on a five-base arc is legal and reads oddly; the `**Examined:**` line carries the real span, and the gate does not judge prose (2026-08-04 §7.2).
4. **The grandfather set is 11 pairs of merged arcs and will never be complied with.** It is frozen evidence, not a queue. It shrinks only if one of those arcs is retroactively filed or its rows are deleted.
5. **`_roundAtPreviousBase` is unvalidated and unconsulted** (§1.1.7). A wrong value, or its absence, changes no gate outcome.
6. **Rows never committed stay invisible**, inherited unchanged from the 2026-08-04 spec §8.3 limit 2. Clause B reads the committed corpus like clause A.
7. **A branch directory renamed or deleted loses its history**, inherited from §8.3 limit 3's rename half. Only the base-move half of that limit is repaired here.

## §5 Testing (TDD per task)

**`tests/reviewRounds/count.test.ts`** — `arcCountedRounds(rowsByBase)`: distinct `(base, round)` pairs; the same round number at two bases counts **twice** (the renumbering case, the exact defect); the same `(base, round)` at two rows counts **once** (a parallel wave); `no_verdict` rows and `stage: "task"` rows never contribute; an empty directory is 0, not `NaN`.

**`tests/docs/_metaReviewRoundEconomy.test.ts`** — fixtures, each a planted branch directory:

- 2 counted diff rounds at base A + 2 at base B, no filing → `missing_arc_filing`. **The core new assertion.**
- The same arc with a filing section at A → passes. Again with it at B → passes.
- Rounds `1,2` at A and `1,2` at B → fires: four pairs from colliding round values.
- 4 rounds at one base, no filing → `missing_filing` and **not** `missing_arc_filing` (no double report).
- 5 at A unfiled + 2 at B → exactly one problem, from clause A.
- 3 + 0 across two bases → passes (below threshold).
- 2 + 2 of `stage: "task"`, and 2 + 2 of `status: "no_verdict"` → pass.
- A grandfathered `(branch, stage)` at 2 + 2 → passes; the identical shape on a non-grandfathered branch → fires. One fixture, two directories, so the exemption cannot pass by accident.
- **Addition guard:** a grandfathered pair with one row `startedAt` after `ARC_SUM_FREEZE` fails; the same with `startedAt: null` fails.
- **Set hygiene over the real corpus:** all 11 pairs still owe; all their rows predate the freeze; the set is exactly 11.
- **Monotonicity:** every fixture that fires a per-base problem today fires the same problem after the change, asserted by kind.
- **Live corpus is clean** (existing case, line 1020) stays green — the acceptance for the whole change.
- **Walker default:** a brand-new fixture directory at 2 + 2 fires with no test edit, pinning §1.1.8.

**`tests/reviewRounds/report.test.ts`** — the totals line appears for a multi-base directory, is absent for a single-base one, and is marked when the sum is at threshold with no section.

**Mutation enrolment (enrolment precedes review).** `lib/reviewRounds/count.ts` (`reviewRoundCount`, `tests/mutation/source/registry.ts:1343`) and `lib/reviewRounds/corpus.ts` (`reviewRoundCorpus`, `tests/mutation/source/registry.ts:1767`) are already enrolled, and this change edits both. `pnpm mutation:guards` runs **before** the round-1 diff dispatch, and the brief carries a `GUARD SURFACE:` line per surface with its score and "0 unaccepted survivors". The new grandfather module is a data literal with no branching and is not enrolled; the assertions that police it are the three in §3.3.

## §6 Documentation fan-out

- `docs/review-rounds/README.md` — §3.5.
- `AGENTS.md`, round-economy bullet — the counted-rounds sentence gains the arc sum and cites this spec.
- `docs/superpowers/specs/ci/2026-08-04-review-round-economy.md` — dated cross-reference lines at §4.3, §5.2 and §8.3 limit 3 pointing here. No restatement; two copies drift.
- `docs/superpowers/specs/ci/README.md` — index row.
- `BACKLOG.md` — `BL-REVIEW-ROUND-COUNT-RESETS-ON-REMERGE` archived on merge, its interim rule retired.

## §7 Non-goals

- No change to `round` semantics, to `--round`, or to the wrapper's emission path. `codex-guard.mjs` is untouched.
- No retroactive filings, no backfilled rows, no edits to any merged filing.
- No git-ancestry partitioning of a directory's bases (§4 limit 1 — unavailable on a shallow clone).
- No arc-sum requirement on a filing heading's declared count (§1.1.4).
- No anti-tamper posture; the 2026-08-04 spec §8.1 fence is inherited whole.
- No third ledger, no registration of arcs (§1.1.8).

## Convergence criterion (for this spec's own reviews)

**Consequence bound:** every arc is correctly obliged, correctly exempt, or loudly refused — never silently unobliged. Over-obligation costs one `**Mechanizable:** none` line and files to §4 as a documented limit, not a finding.

**PROBE DOMAIN:** the live `docs/review-rounds/**` corpus at merge base `50ca72a56` — 126 branch directories, 61 multi-base — plus the branch directories planted as fixtures by `tests/docs/_metaReviewRoundEconomy.test.ts`. A probe over a constructed corpus more than one ordinary edit away from a live directory files to §4.

**Threat-model fence:** merge-timing accounting artifacts produced by ordinary arcs following the AGENTS.md closure-hit rule. An arc that hides rounds — deleting rows, hand-editing the corpus, timing a re-merge to dodge a filing — is out of scope by declaration and inherits the 2026-08-04 spec §8.1 fence.

**Closed criterion:** the threshold sums per arc over distinct `(baseSha, round)` pairs; `pnpm vitest run tests/docs/_metaReviewRoundEconomy.test.ts` is green over the entire live corpus with the 11 grandfathered pairs named and no twelfth; and the forbidden-workaround case — colliding round numbers across bases — is covered by an executable fixture. All three are settled by command, not by opinion.

**Score:** stated per §5 in the round-1 diff brief.
