# Corpus-calibration probe — parser mutation wave (2026-08-07)

Measures the **clean-corpus false-positive base rate** for four proposed mutation heuristics
(REF-SUB, MERGED-CELL, COLUMN-SHIFT, UNICODE), plus a live-sheet spot check. Read-only; nothing
here changes parser or harness behavior.

**Reproduce (every probe, one command):**

```
node docs/superpowers/specs/parser/probes/2026-08-07-mutation-wave-corpus-probe.mjs
```

Plain node, no dependencies beyond `node:fs` / `node:path`. Probe E is not scriptable — it is a
live Google Sheets read via the `gsheets` MCP server, transcribed in §E with the exact ranges.

## Method

**Corpus:** the 17 fixtures referenced by `tests/parser/mutation/fixtures.ts` — 7 under
`fixtures/shows/exporter-xlsx/` (xlsx family) and 10 under `fixtures/shows/raw/` (raw family).

**Segmentation parity:** the probe hand-ports `splitCells` / `classifyRow` / `segment` from
`tests/parser/mutation/rows.ts` and `resolveHeader` / `isHeaderCells` from
`tests/parser/mutation/classify.ts` — the same functions `refSub`, `mergedCell`, `columnShift`, and
`unicodeInject` enumerate over in `tests/parser/mutation/operators.ts`. The fixture list and the two
header-registry constants (`KNOWN_SECTION_HEADERS`, `PREFIX_SECTION_FAMILIES`) are **extracted from
the live source at run time**, not copied, so the probe cannot silently drift from the corpus or the
registry it is calibrating against. Extraction failure is fatal.

**Line numbers are 1-based** (what an editor shows). `operators.ts` siteIds embed the 0-based array
index — subtract 1 to cross-reference a `:L<n>:`.

**Premise checks and positive controls.** A false-positive count of zero is evidence only if the
rule *could* have fired. Probes B and C therefore each report, alongside the base rate, (a) whether
the corpus even contains the shape the rule keys on, and (b) whether the rule fires on a **real
mutant** built by the shipped operator code. Without both, "0 false positives" and "the probe is
broken" produce identical output.

---

## A. REF-SUB — `#REF!` on the clean corpus

**Reproduce:** `node docs/superpowers/specs/parser/probes/2026-08-07-mutation-wave-corpus-probe.mjs`
(§A of the output)

**Total: 24 occurrences across 5 of 17 fixtures. All 24 are the markdown-escaped form `\#REF\!`;
the bare literal `#REF!` appears zero times.**

| fixture                        | family | escaped | bare | lines                        |
| ------------------------------ | ------ | ------- | ---- | ---------------------------- |
| consultants                    | xlsx   | 6       | 0    | 237, 238                     |
| fintech                        | xlsx   | 5       | 0    | 278, 281, 287, 290, 293      |
| fixed-income                   | xlsx   | 5       | 0    | 247, 250, 256, 259, 262      |
| rpas                           | xlsx   | 5       | 0    | 231, 234, 240, 243, 246      |
| 2025-10-consultants-roundtable | raw    | 3       | 0    | 210                          |

Every occurrence sits in a **data** row of a **headerless** section (no fixture places one under a
recognized section header). Twenty-one are the whole cell; three — all on
`2025-10-consultants-roundtable:210` — are a prefix of a fused `<day>/<header>` cell
(`\#REF\!/NAME`, `\#REF\!/ARRIVAL`, `\#REF\!/FLIGHT\#`).

The requested "nearest preceding non-table line" locator is **`(none)` for all 24**: these fixtures
are 100% pipe-table lines with no prose, so that locator carries no information on this corpus. The
segmentation-derived section is the usable locator, and it is headerless in every case.

### The "3 of 7 live shows" claim

**Not confirmed as stated.** Within the xlsx family it is **4 of 7** (consultants, fintech,
fixed-income, rpas), and across the full 17-fixture corpus it is **5 of 17**, the fifth being one
raw-family fixture. The claim is off by one in the family it most plausibly refers to.

### Calibration verdict — REF-SUB

**False-positive rate is not the problem; the escaping is.** `refSub` writes the *bare* literal
`#REF!` into a cell, and guards against a byte-identical no-op with
`if (c.val.trim() === "#REF!") continue;` (`operators.ts:74`). The corpus stores the *escaped* form,
so `c.val` is `\#REF\!` and **the guard fires on 0 of 24 occurrences** — 21 of them whole-cell data
sites that the guard was written to exclude. The parser's `clean()`
(`lib/parser/blocks/_helpers.ts`) strips `\\(.)`, so `\#REF\!` and `#REF!` are *identical in parser
space*: those 21 mutants are byte-distinct but semantically no-ops, each claiming a siteId and
counting toward coverage without exercising the parser. That is precisely the defect plan-R18 closed
in principle and left open in practice.

The spec needs the guard to compare **post-`clean()`** values, not raw cell text — `clean(c.val)
=== "#REF!"`, or equivalently strip `\\(.)` before the comparison. No threshold is involved; this is
a correctness fix worth 21 currently-tautological sites. Note also that `#NUM!` and `#N/A` appear in the
same escaped shape (`\#NUM\!` ×6, `\#N/A` ×3), so any sibling error-literal operator inherits the
identical bug.

---

## B. MERGED-CELL — short-by-one base rate

**Rule under test:** *within a section, a row whose cell count is (modal − 1) has a fused cell.*
`mergedCell` deletes one interior pipe from a data row, so its mutant is exactly one cell short.

**Reproduce:** `node docs/superpowers/specs/parser/probes/2026-08-07-mutation-wave-corpus-probe.mjs`
(§B of the output)

**False positives: 0, in both variants, across all 17 fixtures and 472 sections with ≥3 rows.**
(Variants: *all-rows* takes the modal over every row the section owns, header and alignment
included; *data-only* over data rows alone. `mergedCell` only mutates data rows, so data-only is the
tighter reading and all-rows is what a naive implementation gets. Both are zero on every fixture.)

### Premise check — could the rule have fired?

| measurement                                                 | value             |
| ----------------------------------------------------------- | ----------------- |
| sections (≥3 rows) with more than one distinct cell count    | **7 of 472** (1.5%) |
| rows at the section modal                                    | 8770              |
| rows at modal **+1**                                         | 5                 |
| rows at modal **+2**                                         | 2                 |
| rows at modal **−1**                                         | **0**             |

The corpus is very nearly column-uniform — the xlsx→md conversion pads every row in a block to the
same column count. Raggedness exists but is 1.5% of sections, and it runs entirely in the *positive*
direction. The zero is therefore real but **thin**: it is measured against a corpus that has almost
no opportunity to produce a short row at all.

### Positive control — does the rule fire on a real mutant?

Applying the shipped `mergeRawCells(line, 0)` (`operators.ts:38`) to every eligible data row
(`cells.length >= 3`) and re-segmenting: **the rule fires on 5015 of 5022 mutants (99.9%).**

Reconciliation: a mutant escapes only when its own row was already off the section modal, so the
miss count and the off-modal-row count must be the same number — **7 and 7, MATCH**. The seven
misses are exactly the seven ragged rows in the premise table.

### Calibration verdict — MERGED-CELL

**Discriminates cleanly on this corpus — 99.9% true positives against 0 false positives — but the
corpus is not the threat model.** Two caveats the spec must record rather than inherit silently:

1. **The 0% is partly a conversion artifact.** Column uniformity is manufactured by the xlsx→md
   exporter. A ragged live sheet has short rows for ordinary reasons, and this rule cannot tell one
   from a fused cell. The measured rate bounds the *harness's* false-positive risk, not the live
   parser's.
2. **A real merged cell does not present as short-by-one at all.** §E confirms it: on the live
   Consultants sheet `AGENDA!A2` is `TRAVEL DAY` with B2 and C2 empty (a genuine merge), while the
   committed fixture renders that same row as `| TRAVEL DAY | TRAVEL DAY | TRAVEL DAY | …` — the
   value repeated across the merged span, cell count unchanged. The synthetic pipe-deletion mutant
   and the real-world merge are **different shapes**, and this rule detects only the synthetic one.

No threshold refinement is needed for the harness. What the spec owes is an explicit statement that
`mergedCell` pins pipe-deletion robustness, not merged-range handling, and — if merged-range
handling is in scope — a second operator that *repeats a value across N columns*, which is what the
corpus shows real merges look like.

---

## C. COLUMN-SHIFT — leading-empty-cell base rate

**Rule under test:** *every row in a section has an empty first cell* — the shape `columnShift`
manufactures by prefixing `|  |` to every row it owns (`operators.ts:151`).

**Reproduce:** `node docs/superpowers/specs/parser/probes/2026-08-07-mutation-wave-corpus-probe.mjs`
(§C of the output)

Three variants, because *which rows the rule inspects* decides whether it can fire at all.
Alignment rows (`| :---: |`) have a non-empty first cell, so any section carrying one fails the
all-rows test pre-mutation — but `columnShift` shifts alignment rows too, so post-mutation they lead
empty as well.

| variant                          | every row leads empty | some but not all |
| -------------------------------- | --------------------- | ---------------- |
| **all** (every row the section owns) | **0**             | 171              |
| **non-align** (header + data)        | **1**             | 121              |
| **data** (data rows only)            | **61**            | 61               |

The single non-align false positive is `fintech.md:4`, a headerless one-row section.

### Data-variant false positives by section arity

| data rows in section | sections flagged |
| -------------------- | ---------------- |
| 1                    | 12               |
| 2                    | 9                |
| 3                    | 9                |
| 4+                   | 31               |

Twelve of the 61 are arity-1 sections that satisfy "every row" trivially, but the majority (31) have
four or more data rows — so an arity threshold does **not** rescue the data-only variant.

### Positive control

Applying `line.replace(/^\|/, "|  |")` to every row of every eligible section (`dataRows >= 1`) and
re-segmenting: **the all-rows rule fires on 535 of 535 mutated sections (100.0%)**, against 0 false
positives on the clean corpus.

### East Coast, specifically

Neither East Coast fixture has a section where every row leads empty. Both carry substantial
*partial* leading-empty runs:

| fixture                          | section      | first line | non-align rows | lead-empty | verdict |
| -------------------------------- | ------------ | ---------- | -------------- | ---------- | ------- |
| east-coast (xlsx)                | (headerless) | 67         | 9              | 1          | some    |
| east-coast (xlsx)                | (headerless) | 99         | 23             | 19         | some    |
| east-coast (xlsx)                | (headerless) | 139        | 126            | 35         | some    |
| east-coast (xlsx)                | (headerless) | 267        | 5              | 4          | some    |
| 2024-05-east-coast-family-office | (headerless) | 50         | 9              | 1          | some    |
| 2024-05-east-coast-family-office | (headerless) | 84         | 22             | 19         | some    |
| 2024-05-east-coast-family-office | (headerless) | 301        | 35             | 1          | some    |

The 19-of-23 and 35-of-126 sections are the near-misses. A rule relaxed to "most rows lead empty"
would flag them; the strict all-rows form does not.

### Calibration verdict — COLUMN-SHIFT

**Use the all-rows variant. It is the only one that separates cleanly: 100% true positives, 0 false
positives, and the separation is structural rather than lucky** — alignment rows guarantee a
non-empty first cell pre-mutation and an empty one post-mutation, so they act as a built-in
discriminator. The data-only variant is unusable at 61 false positives, and no arity threshold fixes
it. The non-align variant is nearly as good as all-rows but gives up that structural guarantee for
one real false positive.

The spec should state the rule as *all rows the section owns, alignment rows included*, and must
**not** relax it to a "most rows" or ratio form — the East Coast fixtures sit at 19/23 and would
false-positive immediately.

One caveat, from §E: **the live sheets do carry leading empty columns that the md conversion
removes.** East Coast `INFO!A18` is empty with `TECH` in column B; both fixture families place
`TECH` in cell 0 (`east-coast.md:21`, `2024-05-east-coast-family-office.md:62`). The 0% false-
positive rate is therefore measured on data from which the natural instance of this shape has
already been stripped. The rule is right for the harness; it is not evidence about raw sheet input.

---

## D. UNICODE — zero-width characters

**Reproduce:** `node docs/superpowers/specs/parser/probes/2026-08-07-mutation-wave-corpus-probe.mjs`
(§D of the output)

Scanned: U+200B ZWSP, U+200C ZWNJ, U+200D ZWJ, U+FEFF ZWNBSP/BOM — the set `unicodeInject` draws
from (it injects U+200C) and the set `clean()` strips.

**Total: 18 occurrences, all U+200C (ZWNJ), all in `fintech.md`, all in cell 1.** Not the near-zero
expected.

| fixture | line | section        | count | cols                        |
| ------- | ---- | -------------- | ----- | --------------------------- |
| fintech | 54   | HOTEL          | 12    | 6, 46, 48, 59, 60, 64, 89, 129, 131, 142, 143, 147 |
| fintech | 67   | TRANSPORTATION | 6     | 13, 53, 55, 66, 67, 71      |

Both are the same pasted hotel address, appearing twice per line (the value is duplicated across the
row) and in two sections: `H‌oliday Inn Express … 13330 Cicero Avenue,‌ ‌Crestwood,‌‌ IL‌ 60418
United States`. This is the "fintech live shape" the `unicodeInject` comment already cites
(`operators.ts:89`) — real paste damage from a maps/booking copy, committed as a fixture.

### Calibration verdict — UNICODE

**No false-positive problem, but the operator is largely absorbed by design and the spec should say
so.** `clean()` strips `/[​-‍﻿]/` at the shared cell boundary
(`lib/parser/blocks/_helpers.ts`), so every `unicodeInject` mutant landing in a cell that flows
through `clean()` is ABSORBED — correctly, and unavoidably. The operator's value is therefore
confined to cells that reach a comparison, key, or matcher *before* `clean()` runs; those are the
sites where a zero-width character can still change behavior, and they are what the spec should
enumerate rather than treating whole-corpus absorption as a coverage result.

A detection heuristic keying on "cell contains a zero-width character" has a **non-zero clean-corpus
base rate: 18 hits in 1 of 17 fixtures**, all pre-existing paste damage. Any such rule needs those
two fintech lines as a documented exemption or it flags them forever.

---

## E. LIVE SHEETS — spot check (gsheets MCP)

MCP was available. Three shows read from Drive folder `fxav-test-shows`
(`1iU80Y2mqYmkCuBQYer0TEF1fta6fDp1C`).

| show                    | spreadsheetId                                  |
| ----------------------- | ---------------------------------------------- |
| East Coast              | `1N1PKmhcvLAn5UwHLn4Rplm1yeVeYMvwfL3eOzB4McnY` |
| RPAS Central 2026       | `1vyZMRTqeFAJgocbSJM2_HDDMsUUJFBiLKk6WKq-dUYo` |
| Consultants Roundtable  | `1XQ44uxc44pToYxQnYw4OG9V6DjE7bC5EU08o5iFpxz4` |

**Caveat, per AGENTS.md:** `sheets_get_values` trims trailing empty cells per row, and reports
`rowCount` as the count of rows with any content in the requested range. A "short" row or a
truncated-looking range is a **conversion artifact of the read**, never evidence of structural
truncation in the sheet. Every observation below is stated so it does not depend on trailing shape.

### Live `#REF!`

| show        | range read              | finding                                                      |
| ----------- | ----------------------- | ------------------------------------------------------------ |
| East Coast  | `AGENDA!A1:H14`         | none — A3/A4 hold real dates (`5/13/24`, `Monday`)            |
| East Coast  | `INFO!A1:F18`           | none (`#NUM!` at A3, a different error literal)               |
| RPAS        | `DIAGRAMS!A1:H40`       | none live; A1 is the formula `=INFO!A105`, rows 2-40 empty    |
| Consultants | `AGENDA!A1:H8`          | **`#REF!` at A3 and A4** — matches `consultants.md:237-238`   |

The Consultants hit is the informative one. Read with `valueRenderOption: FORMULA`, `AGENDA!A3` is
literally **`=#REF!`** — a cross-tab reference whose target was deleted, so the formula text itself
has decayed. Its healthy sibling `D3` is `=INFO!D14`, and `A4` is `=TEXT(A3,"dddd")`, which
propagates the error into the day-name row. That is exactly the two-row shape the committed fixture
carries.

**Implication for REF-SUB:** `#REF!` on these sheets is a **formula-error value from a broken
cross-tab reference**, not stored text. It appears when a referenced range is deleted and disappears
when someone repairs the formula — so its corpus base rate is a snapshot, not a stable property. The
RPAS case demonstrates the drift directly: the committed `rpas.md` carries five `\#REF\!` blocks in
its DIAGRAMS region, and the live DIAGRAMS tab now has content only in A1. The fixture and the sheet
have diverged since capture. Any spec language of the form "N of the live shows contain `#REF!`"
should be dated and treated as re-measurable, never pinned as an invariant.

### Leading-empty-column shape

**East Coast `INFO!A1:F18`, row 18: `["", "TECH", "PHONE", "ARRIVAL", "DEPARTURE"]`** — column A is
genuinely empty and the section's first real column is B. Both committed fixtures place `TECH` in
cell 0 (`east-coast.md:21`, `2024-05-east-coast-family-office.md:62`). **The xlsx→md conversion drops
the leading empty column.**

This is not the trailing-trim artifact — a *leading* empty cell is preserved by the API (it is
returned as `""`), and the difference is between the API row and the committed markdown, not
between the API row and its own tail.

**Implication for COLUMN-SHIFT:** the natural instance of the shape the heuristic detects exists on
the live sheets and is normalized away before the fixture is written. The 0% clean-corpus false-
positive rate in §C is measured on post-normalization data and does not transfer to raw sheet input.

### Merged cells

**Consultants `AGENDA!A2:D2` = `["TRAVEL DAY", "", "", "SET DAY"]`** — B2 and C2 are empty because
A2:C2 is a merged range (the API returns a merged range's value only in its top-left cell). The
committed fixture renders the same row as `| TRAVEL DAY | TRAVEL DAY | TRAVEL DAY | SET DAY | SET
DAY | SET DAY | …` — value repeated across the span, **cell count unchanged**.

**Implication for MERGED-CELL:** confirms the §B verdict from the other direction. Whatever a real
merge looks like downstream, it is not a row that is one cell short. The short-by-one rule is
calibrated against the synthetic pipe-deletion mutant only.

---

## Summary

| probe             | headline                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| **A ref-sub**     | 24 occurrences, 5/17 fixtures, **all escaped `\#REF\!`**; the no-op skip guard fires on **0 of 24**                    |
| **B merged-cell** | **0** false positives / 472 sections; fires on 5015/5022 real mutants; only 7/472 sections ragged (thin premise)       |
| **C column-shift**| all-rows **0** FP / 100% TP; non-align 1 FP; data-only **61** FP; East Coast peaks at 19-of-23 rows (no section fires) |
| **D unicode**     | **18** zero-width (U+200C) in fintech.md only; `clean()` absorbs the operator by design                                |
| **E live sheets** | Consultants `AGENDA!A3` = `=#REF!` (broken ref); East Coast `INFO!A18` leading-empty column **dropped by conversion**; merged cells arrive **value-repeated**, not short |

**The one finding that is a bug rather than a calibration number:** REF-SUB's skip guard is dead on
the real corpus because the fixtures store `\#REF\!` and the guard compares against `#REF!`. Twenty-
one sites currently generate mutants that are no-ops in parser space while claiming coverage.
