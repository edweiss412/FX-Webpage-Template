# Close-out — the delimiter walk delegates to the constructs it crosses

Plan: `docs/superpowers/plans/2026-08-22-shell-brace-cross-construct.md`.
Design: `docs/superpowers/specs/ci/2026-08-22-shell-brace-cross-construct-design.md`.
Ledger row: `BL-SHELL-BRACE-MATCHER-CROSS-CONSTRUCT-BLIND`.

impeccable-gate: N/A — no UI surface

---

## Task 1 — rebase onto the merged tree, re-key, re-establish every number

Run 2026-08-25 by the implementation session. `arc-yamlquote` merged as #879 on 2026-08-24, so the
base moved and every figure in the spec and plan was stamped to a revision that is no longer the
merge-base.

**The headline is that the re-key CONFIRMED the numbers rather than replacing them, and that was
not the expected outcome.** `arc-yamlquote` moved 293 insertions and 20 deletions inside
`scan.ts` — the same file this arc repairs — and not one row of the crossing population shifted.
The one pin that moved is the deciding suite's case count, and it moved by ADDITION.

### 1. Rebase

| | |
|---|---|
| base | `50ca72a566b0` → `300a9f937b8a` |
| `scan.ts` blob | `61adf448c344` → `65a7cdcd2505` (+293 / −20, all from `arc-yamlquote`) |
| commits replayed | 27, of which exactly one conflicted |
| conflict | `docs/superpowers/specs/ci/README.md`, the index-row insertion point |

The conflict was purely additive — main added three index rows, this branch adds one — and was
resolved as a union. **Verified in BOTH directions rather than by reading the result**: zero
deletions against `origin/main`'s copy and zero against this branch's copy, so no row from either
parent was dropped at the seam. That check exists because a sorted-line union has previously passed
on a resolution that silently dropped a row.

### 2. Environment and re-key

- `pnpm install`, `pnpm worktree:link-env`, `pnpm preflight` — `env ✓  local DB ✓`.
- `pnpm ledger:claims` (via preflight) shows `BL-SHELL-BRACE-MATCHER-CROSS-CONSTRUCT-BLIND`
  declared on `fix/shell-brace-cross-construct` and on no other live branch.
- `pnpm mutation:sites` — `all accepted rows resolve`. `psqlStartupScan` carries thirty
  `equivalent` rows, all resolving on the rebased tree.

**No `equivalent` row is re-validated by this task, only re-keyed.** Task 3 owns the re-validation,
because Task 3 is the edit that voids the arguments; a resolving key proves the site still exists,
not that its reason still holds.

### 3. Citation re-key — derived, not offset

The shift is **not uniform**: `scan.ts` +13, the deciding suite +3 and +25, the registry +175. An
offset applied across the pair would have been wrong in three different ways, so every citation was
re-derived by reading its ORIGINAL line content at `50ca72a566b0` and locating that content in the
new blob. Two citations were textually identical to a sibling and were disambiguated by order among
the same-content sites, not by proximity.

- 53 path-form occurrences rewritten across spec and plan.
- 24 bare-filename occurrences (`` `scan.ts:1561` ``) rewritten — a form the path-anchored pass
  did not match, found only because the spec's consumer table uses it.
- Citations into files unchanged between the two revisions were left alone, correctly:
  `_metaSourceShardIntegrity.test.ts`, `_metaLedgerInProgress.test.ts`, `declaredLimitPins.ts`.

**Verified with a control that must fail.** Every citation was re-read at the new base and matched
against the content it resolved to at the old one: 57 resolve correctly, 0 fail. The same verifier
was then run against a copy with ONE citation moved a single line, and reported that one as a
failure — so the check discriminates rather than merely existing. The corrupted line landed on
`if (depth === 0) return { index: i, closed: true };`, which is exactly the off-by-one the handover
warned about: the line adjacent to the depth decrement, indistinguishable from it by any check that
asks only whether a citation resolves.

**All four `red-target=` markers were verified by READING the cited line**, not by confirming it
resolves:

| marker | cited line at `300a9f937b8a` | matches its `why=` |
|---|---|---|
| Task 3 | `depth--;` | yes — the decrement, not the increment above it |
| Task 4 | `function matchBraceSpan(` | yes |
| Task 6 | `stem: "guardSurfaces.shard",` | yes — the entry pinning the shard file set |
| Task 7 | `expect(bad, "archived work cannot be in flight").toEqual([]);` | yes — the archive assertion |

### 4. All seven probes, re-run on the rebased tree

| probe | result |
|---|---|
| `shapes.mts` | `ROWS: 31 total = 22 + 5 + 4`; **11/22** accept-set; **5/5** limits VACUOUS; **2/4** bash-rejected; bash oracle clean on every row |
| `weaker-walks.mts` | ABORTS, naming merge-base `300a9f937b8a` — correct before Task 3, and it resolves the new base itself rather than a pinned one |
| `consumers.mts` | 7/7 unmoved routes IDENTICAL, 1 recorded movement, flagged VACUOUS |
| `consumers.mts --expect-repaired` | FAILS on the vacuous comparison — correct before the repair, and the reason the flag exists |
| `corpus-time.mts --runs 1` | 76 sites, 0 indirections, 0 unreadable; digest `8ebe8b08d43e6308aa471112d9f086d0118e6238`; wall 13436 ms, CPU 16839 ms |
| `syntax-error-class.mts` | **5/5** bash-rejected inputs still yield a site; PASS |
| `depth.mts` | MAX LIVE DEPTH **20**, deepest `.github/workflows/mutation-harness.yml` |
| `cost-curve.mts` | reporter; FLAT / NESTED / WIDE families all printed |

Plus the AC-5 instrument itself, which the plan requires be run by name rather than inferred from
`corpus-time.mts`'s printed digest:

```
$ pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/baseline-corpus.mts \
    --expect 8ebe8b08d43e6308aa471112d9f086d0118e6238
PASS: finding set matches the pinned digest over 76 rows.
```

**The eleven unmet accept-set rows are the same eleven as at the old base** — the seven `R*`
spellings, `Q2`, `Q3`, `P4`, `P5` — and the accept-set derivation command returns exactly 22 ids
matching the plan's list.

### 5. What moved, and what did not

| pin | at `50ca72a56` | at `300a9f937b8a` |
|---|---|---|
| deciding suite | 1009 passed | **1045 passed** — `arc-yamlquote` added 36 cases |
| AC-5 digest / rows | `8ebe8b08…` / 76 | unchanged |
| `shapes.mts` tallies | 11/22, 5/5, 2/4, ROWS 31 | unchanged |
| registry | 30 `equivalent`, 0 `accepted-gap` rows, floor 1 | unchanged |
| live crossings (§2.3) | 0 | **0** |
| live mixed nestings (§2.3) | 6 across 2 files | **6 across 2 files** |
| §6 prose sweep | 12 hits | **13 hits** |

The two §2.3 census figures were re-run rather than assumed, because 316 commits of `main` landed
between the two bases and both are load-bearing: the zero is what makes this a prospective repair,
and the six are what refuse branch C.

### 6. The sweep gained a hit, from outside this arc

`BACKLOG.md:357` is new at this base and belongs to a DIFFERENT ledger row,
`BL-SHELL-UNTERMINATED-PROCESS-SUBSTITUTION-FABRICATES`. It states that `matchBraceEnd` "returns
`-1` when a span never closed". **The repair does not falsify it** — design §1.2 row 5 and §3.2 both
ratify that `matchBraceEnd` keeps reading the walk's own `closed` flag and that `matchBrace`'s
return contract is unchanged for its six index-only consumers. Disposed as no-action in the plan's
Task 7 table, with the reason, because a hit left undisposed reads the same as one nobody saw.

It is worth stating why this matters beyond bookkeeping: the hit entered the corpus through a
sibling arc's merge, so no reading of §6 — however careful — could have anticipated it. The sweep
is the channel and §6 is a reading of it, and this is the second independent demonstration of that
on one arc.

### 7. Gates green after the re-key

- `pnpm spec:lint` on the design: **0 hard**. On the plan: **0 hard**. Both documents owe only that
  figure; the advisory tier is disposed by class in the plan.
- `tests/docs/_metaInvariant8Closeout`, `_metaLedgerInProgress`, `_metaLedgerMintBar`,
  `_metaReviewRoundEconomy`: **133 passed**.

The spec's §2.2 `1009` was caught by the lint output, not by the plan edit that superseded it — a
figure retired in the plan is not retired until the sweep covers the artifact PAIR, and it had not.

### 8. Review-round corpus: the base moved, so the numbering does

Spec and plan rounds are recorded under `docs/review-rounds/fix/shell-brace-cross-construct/50ca72a566b0.jsonl`
(five counted rounds each, both converged, 27 findings, zero refuted). Rows are keyed by merge-base
sha, so the diff stage opens a NEW file at `300a9f937b8a.jsonl` numbered from 1. That reset is a
merge-timing artifact and not headroom: the arc's true round count is the sum across both files, and
the diff-stage filing will cross-reference the predecessor rather than present itself as a fresh arc.

---

## Task 3 — the walk delegates, and the prose moves with it

Commit `bf476ad0e`. Three production functions changed, plus two new per-context
helpers, exactly as the plan's opening paragraph predicted.

### The red, and why its shape is the point

Eleven of the twenty-two accept-set rows failed against the merge-base walk — the
seven `R*` spellings, `Q2`, `Q3`, `P4`, `P5`, which is the plan's prediction row for row.
**SIX of those eleven failed while still reporting a site**, and that is the whole
argument for the attribution rule:

| row | merge-base | expected | visible to a count-only assertion? |
|---|---|---|---|
| `R1-attached`, `R1-detached` | 0 sites | 1 site, `nested: true` | yes |
| `Q2-backtick-inside-subst` | 0 sites | 1 site, `nested: true` | yes |
| `R2-attached`, `R2-detached`, `R1-bare-word`, `R2-bare-word`, `R1-attached-nodq` | 1 site, `nested: FALSE` | 1 site, `nested: true` | **no** |
| `Q3-subst-inside-backtick-in-brace` | 0 sites, 1 ADVISORY | 0 sites, 0 advisories | **no**, on sites alone |
| `P4`, `P5` | 1 site fabricated | 0 sites | yes |

A count-shaped assertion would have gone green on six of the eleven. The rule is
not thoroughness; it is the only thing that discriminates a boundary defect.

### What shipped

- `matchBraceSpan` delegates over a **default-denied** accept-set. An opener nobody
  listed terminates nothing and keeps today's reading, which is what makes the axis
  closable instead of an open grammar.
- **Two recognizers, never one flag.** `foreignConstructEnd` is the bare alphabet
  where both quote forms open; `doubleQuotedEnd` is the narrower one where `'`,
  `$'` and `$"` are literal, because bash's is.
- The `$$` rule in **all three** recognizers, one guard per lexical context.
- An unclosed foreign construct **fails** its enclosing span.

### The probe abort, which is the most useful thing that happened in this task

`weaker-walks.mts` ABORTED on its first run: `w1`'s hunk matched zero times, because
the probe's hunks encode the PROTOTYPE's shape and this implementation had been
written differently. The handover's instruction is to re-derive the hunk from the
candidate and never to relax the match.

**The implementation was aligned to the probe's shape instead, and that is the
weaker-looking choice for the stronger reason.** Re-deriving eight hunks by hand
against a shape I had just invented risks exactly one thing: a hunk that silently
no-ops yields a CLONE of the candidate, which passes every row and reads as "no
impostor here". The probe exists to catch impostors; hand-authoring its transforms
to fit my own code puts the instrument's soundness in my hands at the moment it is
supposed to be checking me. Aligning the code costs nothing — spec §3.3 leaves the
structure to the plan under one constraint, two recognizers, which this satisfies.

After alignment, all eight walks build from THIS candidate and **every one dies to
exactly its declared killers**, scores matching the plan's table row for row.
Four of the eight score a clean 22/22 on the accept-set and are caught only by the
limit rows or the bash-rejected rows.

### The registry re-key was not mechanical

All 30 `equivalent` rows moved. **22 of them had AMBIGUOUS candidates** from
`pnpm mutation:sites` (one row offered `788` and `4377`), so each new site was
derived by locating its ORIGINAL line content in the new source. Taking the first
candidate would have mis-keyed many of them.

**One argument had genuinely stopped being true.** The `matchBraceSpan` loop-bound
row argued from "the body compares `character` against backslash, the active quote,
double quote, single quote, and the open/close delimiters" — and this rewrite deletes
the `quote` variable entirely. The conclusion survives, the premise did not, so the
row was REWRITTEN rather than carried across, and the new argument is probe-backed:
`foreignConstructEnd` reads the same undefined character at `i === text.length`,
matches none of its five branches and returns null without indexing further.
Verified over ten truncated-input boundaries, no throw.

## Task 4 — the documented-limit surface, red against a NAMED MUTANT

The `#`-comment widening of design §2.1b, applied to `scan.ts` and never committed.

```
RED   L2-comment-hides-paren  ... MOVED
      4/5 documented-limit rows UNCHANGED
      FAIL under --expect-repaired: 0 accept-set row(s) unmet, 1 documented-limit row(s) MOVED
      exit 1
GREEN 22/22 accept-set, 5/5 documented-limit UNCHANGED, 4/4 bash-rejected, exit 0
```

**Under the mutant the accept-set still scores a clean 22/22.** That is the finding
worth keeping: the population carrying AC-1 cannot see this change at all, and only
the merge-base comparison catches it.

The mutant is an IMPROVEMENT in bash fidelity — a `#` inside `$()` really does
comment out the rest of the line — and it is still refused. A fence that only rejects
mistakes is easy; this one rejects an improvement, which is what makes the
no-parser-growth rule executable rather than aspirational.

**Reverted byte-identically, proven not assumed:** `git hash-object` reads
`b1f22571af047bcddac935419784ea10e7ebb577` before and after, and `git status` is
clean on the file, so no re-key is owed for this task.

## Task 5 — the digest and the cost bound, a MEASUREMENT task with no red

| criterion | result |
|---|---|
| AC-5 | `baseline-corpus.mts --expect 8ebe8b08…` → `PASS` over 76 rows, exit 0 |
| AC-6 | merge-base median CPU **14127 ms**, candidate **13687 ms**, same session → **0.97×** against a 1.5× bound, exit 0 |
| `consumers.mts --expect-repaired` | 7/7 unmoved routes IDENTICAL, the one declared movement still moves, exit 0 |

**AC-6 is the ledger row's close condition (b), and it lands comfortably.** The row
recorded a construct-aware prototype taking 400s where the shipped walk took 13s,
and concluded the repair was not viable as written. Measured on this implementation,
the construct-aware walk costs nothing detectable over the live corpus. What the
number establishes is the SIGN, not the digit: the live corpus's spans are too short
for the delegation to be paid for, and a ratio slightly under 1.0 is contention
noise rather than a speed-up.

The digest held identical across all three timing runs, which the probe requires
before it will report a timing number at all.
