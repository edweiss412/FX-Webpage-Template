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
