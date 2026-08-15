# Branch 5 parity probe — spec §7.2(a) is unreachable under any swap-invariant rule

**Status:** evidence for the plan's own escalation rule (05-section-order.md Task 3 note 3;
spec §7.2 "If (a) proves unreachable, STOP the branch and ratify the delta explicitly before
landing"). Measured 2026-08-15 on `feat/mutation-section-order` at `ed5378950`.

## What the two constraints jointly require

- **§7.2(a)** — the unreordered-corpus emission multiset is IDENTICAL to today's.
- **§7.2(b)** — the multiset is preserved under ANY adjacent-block swap.

Adjacent transpositions generate the full symmetric group, so (b) is not a claim about ten
sampled swaps: it forces the emission multiset to be invariant under EVERY permutation of a
document's blocks. A multiset invariant under every permutation is a function of the block
MULTISET alone — that is, each block's contribution must be determined by its own content and
never by its position. (a) then pins that function's value on the unreordered corpus.

## What today's rule actually is

`parseVenue` receives the WHOLE document (`lib/parser/index.ts:636`) and `parseTableRows`
flattens every pipe row across it into one list (`lib/parser/blocks/_helpers.ts:20`), so block
boundaries are invisible to it. `inVenueFieldScope` (`venue.ts:77`) opens at the first venue
field that resolves with a value and closes at the first `VENUE_BLOCK_TERMINATORS` row
(`venue.ts:81-99`, checked at `venue.ts:122-133`). The `UNKNOWN_FIELD` branch (`venue.ts:314`)
fires only inside that window.

The window is therefore a contiguous ROW range: `[first venue field, first terminator row)`.
Both endpoints land mid-block.

Reconstructed model-free (matching each emitted `UNKNOWN_FIELD` back onto the flat row list by
`blockRef.name`, in order — no reimplementation of the state machine):

| fixture | emitted | fully swept blocks | partial | dark |
| --- | --- | --- | --- | --- |
| `raw/2025-03-dci-rpas-central.md` | 118 | B16,17,18,19 | B20 (38/43) | B1..B14, B21..B25 |
| `raw/2025-06-ria-investment-forum.md` | 107 | B5,6,7 | B8 (26/77) | B0,B3, B9..B30 |
| `raw/2025-10-consultants-roundtable.md` | 119 | B12..B22 | B23 (38/43) | B3,B6,B7,B8, B24..B28 |
| `raw/2025-04-asset-mgmt-cfo-coo.md` | 42 | B15 | B16 (38/43) | B0..B13, B17..B21 |
| `xlsx/east-coast.md` | 4 | — | B9 (4/6) | rest |
| `raw/2024-05-east-coast-family-office.md` | 4 | — | B7 (4/5) | rest |
| the other 11 fixtures | 0 | — | — | all |

Corpus total: **394** `UNKNOWN_FIELD` emissions.

## Why no content-only rule reproduces that

Two independent obstructions, both measured:

1. **The window ends mid-block, on a row.** In `2025-03-dci-rpas-central.md` the `Timestamp`
   block B20 emits 38 of its 43 eligible rows; the cut is the `Hotel Contact Information` row
   INSIDE that block. An intra-block cut is fine for swap-invariance (an adjacent-block swap
   never reorders rows within a block), so this obstruction alone is survivable.

2. **Blocks inside and outside the window are content-indistinguishable — this is the fatal
   one.** In `2025-03-dci-rpas-central.md`, B18 (`DCI`, 30 eligible rows) is fully swept while
   B13 (`Pending`, 31 eligible rows) is dark; B21 (`INTERNAL`, 19) is dark and non-terminator-
   opening, exactly like the swept B16. In `2025-06-ria-investment-forum.md`, B5 (`NAME`, 69)
   is swept while B20 (`NAME`, 26) is dark. Nothing about these blocks separates them except
   which side of the terminator row they sit on. A rule that reproduced the split would be a
   classifier memorizing this corpus, not a statement about block identity.

   (An exact within-document duplicate-block contradiction would have made this a formal
   impossibility proof. There is none — probed all 17 fixtures, 0 found — so the obstruction is
   stated at its true strength: no PRINCIPLED content rule separates them.)

## What the most defensible swap-invariant rule costs

**Rule B** — a block is swept iff the document has a venue block AND the block's own opening
col-0 is not a terminator; within a swept block, rows at/after that block's first terminator row
are excluded. Block-local membership + row-local cut, so it is genuinely invariant under every
adjacent-block swap. It is the straight reading of the plan's Task 3 notes 1 and 2.

| | today | Rule B | delta |
| --- | --- | --- | --- |
| corpus total | 394 | **4,685** | **+4,291** |
| fixtures gaining emissions | — | 17 of 17 | — |
| fixtures losing emissions | — | 0 | — |

Per-fixture, the 11 fixtures that emit ZERO today gain between 104 and 460 warnings each
(`xlsx/ria.md` 0 → 460; `raw/2026-03-rpas-central-four-seasons.md` 0 → 391).

The delta is not a roundable adjustment to be ratified in passing: it is a **12× increase in
operator-visible `UNKNOWN_FIELD` warnings on every show**, including every show that is clean
today.

## The finding underneath the numbers

Today's near-silence on 11 of 17 fixtures is itself an artifact of the positional window. Those
documents have a venue block, but a terminator block happens to sit immediately after it, so the
window is empty and the sweep never runs. Holding §7.2(a) means preserving that artifact
exactly; any rule that removes the position-dependence necessarily starts emitting on the blocks
the artifact was silencing. **(a) and (b) are jointly unsatisfiable, and the gap between them is
the 4,291 warnings.**

## Reproduce

`pnpm exec tsx --tsconfig tsconfig.json <file>`, with `FIXTURES` from
`tests/parser/mutation/fixtures.ts`, `canonOf` mirroring `venue.ts:105-117`
(`resolveAliasFull`, then `resolveAliasScoped(col0, "venue.")` when that returns null), `isTerm`
mirroring `venue.ts:122-133`, and `eligible(r)` = col-0 non-empty, not `VENUE`, `canonOf` null:

```ts
// today, per fixture: parseSheet(md, path).warnings.filter(w => w.code === "UNKNOWN_FIELD").length
// Rule B, per fixture:
let ruleB = 0;
if (parseSheet(md, path).venue !== null) {
  for (const b of md.split(/\n\s*\n/)) {
    const rows = parseTableRows(b);
    if (rows.length === 0 || isTerm(rows[0]![0] ?? "")) continue;
    for (const r of rows) {
      if (isTerm(r[0] ?? "")) break;   // intra-block terminator cut
      if (eligible(r)) ruleB++;
    }
  }
}
```

Swept/dark attribution is recovered model-free: parse once, take the `UNKNOWN_FIELD` warnings in
order, and greedily match each one's `blockRef.name` against the next eligible row in the flat
row list (`blocks.flatMap(parseTableRows)`, which equals `parseTableRows(md)` — verified equal
on all 17 fixtures).

## Consequence for the branch

The two RED test files committed at `ed5378950` are the executable statement of the gap:
`tests/parser/venueSwapInvariance.test.ts` (10 named real-loss swaps, RED 10/10) and
`tests/parser/mutationHarness.venueSwapSweep.test.ts` (all 497 adjacent swaps in the corpus, RED
on 10 of 17 fixtures — a strictly wider set than the 10 rows the ledger probe sampled).
`tests/parser/venueSignalParity.test.ts` is GREEN and pins the 394.

Per spec §7.2 and Task 3 note 3, the branch STOPS here for explicit ratification rather than
shipping a delta.
