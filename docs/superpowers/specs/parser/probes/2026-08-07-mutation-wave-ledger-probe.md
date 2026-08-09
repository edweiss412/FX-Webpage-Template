# Parser-mutation known-holes ledger — dissection probe (2026-08-07)

Input for the parser-mutation-wave spec. Dissects `tests/parser/mutation/knownHoles.ts` (7842 rows) for the five classes the wave will attack: `ref-sub`, `merged-cell`, `unicode-inject`, `column-shift`, `section-reorder`.

**Nothing here is committed as test code.** The probe is read-only and runs outside vitest.

## Reproduce

```bash
# main probe — plain node, no transpile, ~1s
node docs/superpowers/specs/parser/probes/2026-08-07-mutation-wave-ledger-probe.mjs

# machine-readable count summary
node docs/superpowers/specs/parser/probes/2026-08-07-mutation-wave-ledger-probe.mjs --json
```

The probe re-derives the harness's segmentation (`tests/parser/mutation/rows.ts:segment`) and section classification (`tests/parser/mutation/classify.ts`) in plain JS, extracting `KNOWN_SECTION_HEADERS`, `PREFIX_SECTION_FAMILIES`, `SECTION_DOMAIN_MAP`, `OPERATOR_FINDING_MAP` and the fixture list **from the live source files at runtime**, so a registry edit cannot silently invalidate it.

It **self-checks before reporting**: every ledger `siteId` must resolve to a section that exists in the modeled fixture, at a line that is a row of that section, and — for the data-cell operators — at a `data`-class row with an in-range cell index. Any failure prints `SELF-CHECK FAILURE` and exits non-zero, because a wrong reimplementation would otherwise produce a confident, wrong domain table. Current status: **PASS, exit 0, 7842/7842 rows resolved.**

The one claim the plain-node probe cannot settle by itself — what a `signal_loss` row actually represents — is settled by the TypeScript sub-probes in §2.3 and §5, which run the real parser over **every one of the 395 non-`header-typo` `signal_loss` rows** and reproduce all 395 exactly.

> **Read §5 before §4.** An earlier draft of this document inferred the `signal_loss` mechanism from the ledger's section shapes and got it **wrong**. The sub-probe in §5 refuted it. The corrected result changes the spec's hardening target by an order of magnitude (398 rows → 39).

---

## 0. siteId grammar (needed to read every table below)

`sid()` (`tests/parser/mutation/operators.ts:62`) builds `<op>:B<sec>:L<line>:X<locus>`; `withSlug()` (`tests/parser/mutation/runShard.ts:41`) injects the fixture slug, giving the ledger form:

```
<operator>:<fixture-slug>:B<n>:L<line>:X<locus>
```

**`B<n>` does not mean the same thing for every operator** — a trap for anything that reads the ledger mechanically:

| operator | `B<n>` is | `L<line>` is | `X<locus>` is |
| --- | --- | --- | --- |
| `ref-sub`, `unicode-inject`, `merged-cell` | LogicalSection index | absolute line of the target data row | parser cell index (`merged-cell`: the interior pipe fused) |
| `column-shift` | LogicalSection index | the section's header line (or first row) | always `0` |
| `blank-row:inject` | LogicalSection index | line after which the blank went | `gap<i>` |
| `blank-row:remove` | **RUN** index | the blank line removed | `gap` |
| `section-reorder` | **BLOCK** index into `md.split(/\n\s*\n/)` | always `0` | `pair<i>` |

The `note` field is template-generated at regen time (`<operator> <kind> @ <slug>`): **122 distinct strings across all 7842 rows**, carrying zero per-hole diagnostic content. Every "note pattern" table below is therefore a per-fixture census in disguise, not a finding taxonomy. The spec should not expect to mine it.

---

## 1. Row counts per finding class × kind — **RECONCILES, no mismatch**

| finding | operator(s) | total | wrong | signal_loss | expected | reconcile |
| --- | --- | ---: | ---: | ---: | --- | --- |
| BL-MUTATION-REF-SUB | `ref-sub` | 3314 | 3094 | 220 | 3314 (3094/220) | OK |
| BL-MUTATION-MERGED-CELL | `merged-cell` | 2404 | 2271 | 133 | 2404 (2271/133) | OK |
| #10 | `blank-row:inject`, `blank-row:remove` | 870 | 870 | 0 | (not asserted) | — |
| BL-MUTATION-UNICODE | `unicode-inject` | 827 | 827 | 0 | 827 (827/0) | OK |
| BL-MUTATION-COLUMN-SHIFT | `column-shift` | 211 | 193 | 18 | 211 (193/18) | OK |
| #5 | `header-typo` | 134 | 131 | 3 | (not asserted) | — |
| BL-MUTATION-SECTION-ORDER | `section-reorder` | 82 | 58 | 24 | 82 (58/24) | OK |
| **ALL** | | **7842** | **7444** | **398** | 7842 (7444/398) | OK |

All five asserted classes reconcile exactly, and the totals close against the ledger header comment (`knownHoles.ts:115`). The two unasserted classes (`#10` blank-row 870, `#5` header-typo 134) account for the remaining 1004 rows, so `3314 + 2404 + 827 + 211 + 82 + 870 + 134 = 7842` with nothing unattributed.

---

## 2. SECTION-REORDER (82 rows) — the `signal_loss` subset is **two different things**

### 2.1 Headline

The 24 `signal_loss` rows are **not** one phenomenon. Running the actual parser over all 24 swaps (§2.3) splits them, using the three-way classification defined in §5:

| sub-class | rows | what actually happened |
| --- | ---: | --- |
| **B — signal-array key order PERMUTED** | **14** | Signal-key multiset byte-identical AND the same keys appear, in a different order. `warnings`/`raw_unrecognized` lengths unchanged (e.g. `120 -> 120`). Nothing was lost. These alarm solely because `oracle.ts:signalRows` is index-keyed and therefore order-sensitive. This IS the "pure array-reorder" the spec intends to ratify — just on the signal channel rather than the payload channel. |
| **A — REAL signal loss** | **10** | Signal-key multiset shrank, `GAINED: (none)` in every case. Losses range from 1 warning to **catastrophic**: `2025-06-ria-investment-forum:B3` drops `warnings 109 -> 2` and `raw_unrecognized 107 -> 0`; `2025-03-dci-rpas-central:B14` drops `120 -> 2` / `118 -> 0`. |

Notably, class C (the dominant class for every other operator — see §5) has **zero** members here: a block swap does not change any cell's content, so no warning's `value`/`message` field can move. Section-reorder is the only operator whose `signal_loss` population is genuinely about ordering.

Also worth pinning: **all 24 `signal_loss` rows are in RAW fixtures** (4 of the 10), and **53 of the 58 `wrong` rows are in xlsx fixtures**. The two kinds barely overlap on the corpus.

### 2.2 Root cause of the 10 real losses — one positional state machine

Every lost signal is `W:UNKNOWN_FIELD` plus its paired `R:venue|<key>` `raw_unrecognized` entry. Both come from a single emitter: `lib/parser/blocks/venue.ts:314`, gated by `inVenueFieldScope`.

`parseVenue` (`lib/parser/blocks/venue.ts:62`) walks **every table row in the document** as a positional state machine:

- `inVenueFieldScope` flips **on** at the first resolved venue field (`venue.ts:77` declares it; the assignments are scattered through the field dispatchers, e.g. `venue.ts:305`);
- it flips **off** only at a col-0 matching `VENUE_BLOCK_TERMINATORS` (`venue.ts:81-99`);
- while on, every unrecognized col-0 row anywhere downstream emits `UNKNOWN_FIELD` attributed to `block: "venue"` (`venue.ts:314`).

So the venue parser is the de-facto unknown-field detector for the **entire tail of the sheet**, and its reach is a function of where the VENUE block sits relative to the next terminator. Swapping the VENUE block later — or swapping a terminator-bearing block earlier — truncates the scope and silently extinguishes up to 98% of the sheet's data-quality warnings. Swapping two blocks that are both inside an open scope, neither carrying a terminator, only permutes the emission order: that is the 14.

This is the adjacency breakage the spec should harden. It is not "the parser preserves source order into its arrays" (that is the `wrong` subset's story); it is **one detector whose coverage window is defined by document position rather than by block identity.**

### 2.3 Per-row verdicts (all 24), from the live parser

| siteId | fingerprint | sub-class | warnings | raw_unrecognized | lost signal keys |
| --- | --- | --- | --- | --- | --- |
| `section-reorder:2025-03-dci-rpas-central:B14:L0:Xpair14` | `ba5795b02bbe0777` | **A — REAL LOSS** | 120 → 2 | 118 → 0 | `UNKNOWN_FIELD` 118→0, + 79 `R:venue\|*` keys |
| `section-reorder:2025-03-dci-rpas-central:B15:L0:Xpair15` | `5a868fe4d986082c` | **A — REAL LOSS** | 120 → 118 | 118 → 116 | `UNKNOWN_FIELD` 118→116, `R:venue\|ADDITIONAL ROOM…`, `R:venue\|Other` |
| `section-reorder:2025-03-dci-rpas-central:B16:L0:Xpair16` | `9fadafea7dcc9c97` | B — order permuted | 120 → 120 | 118 → 118 | (none) |
| `section-reorder:2025-03-dci-rpas-central:B17:L0:Xpair17` | `24490d428a70ab1b` | B — order permuted | 120 → 120 | 118 → 118 | (none) |
| `section-reorder:2025-03-dci-rpas-central:B18:L0:Xpair18` | `02326758fdcae29f` | B — order permuted | 120 → 120 | 118 → 118 | (none) |
| `section-reorder:2025-03-dci-rpas-central:B19:L0:Xpair19` | `a7a5f159cf8422b1` | **A — REAL LOSS** | 120 → 75 | 118 → 73 | `UNKNOWN_FIELD` 118→73, + 33 `R:venue\|*` keys |
| `section-reorder:2025-04-asset-mgmt-cfo-coo:B14:L0:Xpair14` | `8e00c1785e6bf48f` | **A — REAL LOSS** | 44 → 40 | 42 → 38 | `UNKNOWN_FIELD` 42→38, `TRAVEL DAY`, `4/6/25`, `Sunday`, `NAME` |
| `section-reorder:2025-04-asset-mgmt-cfo-coo:B15:L0:Xpair15` | `8e00c1785e6bf48f` | **A — REAL LOSS** | 44 → 40 | 42 → 38 | identical to B14 (same fingerprint, consistent) |
| `section-reorder:2025-06-ria-investment-forum:B3:L0:Xpair3` | `a1503cb05de69237` | **A — REAL LOSS** | 109 → 2 | 107 → 0 | `UNKNOWN_FIELD` 107→0, entire crew roster + VENUES list |
| `section-reorder:2025-06-ria-investment-forum:B4:L0:Xpair4` | `aae95bab1816edd5` | **A — REAL LOSS** | 109 → 40 | 107 → 38 | `UNKNOWN_FIELD` 107→38, entire crew roster |
| `section-reorder:2025-06-ria-investment-forum:B5:L0:Xpair5` | `6465ff4517ba5a8e` | B — order permuted | 109 → 109 | 107 → 107 | (none) |
| `section-reorder:2025-06-ria-investment-forum:B6:L0:Xpair6` | `eb48eba3910177a5` | B — order permuted | 109 → 109 | 107 → 107 | (none) |
| `section-reorder:2025-06-ria-investment-forum:B7:L0:Xpair7` | `e3655e09a4eff378` | **A — REAL LOSS** | 109 → 108 | 107 → 106 | `UNKNOWN_FIELD` 107→106, `R:venue\|GS Other` |
| `section-reorder:2025-06-ria-investment-forum:B8:L0:Xpair8` | `e9521d13fb255e6a` | **A — REAL LOSS** | 109 → 83 | 107 → 81 | `UNKNOWN_FIELD` 107→81, entire VENUES reference list |
| `section-reorder:2025-10-consultants-roundtable:B13:L0:Xpair13` | `4cfb29c1ec118c16` | B — order permuted | 120 → 120 | 119 → 119 | (none) |
| `section-reorder:2025-10-consultants-roundtable:B14:L0:Xpair14` | `d8e811f27fd629b0` | B — order permuted | 120 → 120 | 119 → 119 | (none) |
| `section-reorder:2025-10-consultants-roundtable:B15:L0:Xpair15` | `01057b877eca2fc1` | B — order permuted | 120 → 120 | 119 → 119 | (none) |
| `section-reorder:2025-10-consultants-roundtable:B16:L0:Xpair16` | `a98ecdb29aa8c7ef` | B — order permuted | 120 → 120 | 119 → 119 | (none) |
| `section-reorder:2025-10-consultants-roundtable:B17:L0:Xpair17` | `5a1101bd816ec67c` | B — order permuted | 120 → 120 | 119 → 119 | (none) |
| `section-reorder:2025-10-consultants-roundtable:B18:L0:Xpair18` | `5f598b5f4e3d0ecc` | B — order permuted | 120 → 120 | 119 → 119 | (none) |
| `section-reorder:2025-10-consultants-roundtable:B19:L0:Xpair19` | `6ee1db349eae5640` | B — order permuted | 120 → 120 | 119 → 119 | (none) |
| `section-reorder:2025-10-consultants-roundtable:B20:L0:Xpair20` | `54e184842251fe8d` | B — order permuted | 120 → 120 | 119 → 119 | (none) |
| `section-reorder:2025-10-consultants-roundtable:B21:L0:Xpair21` | `7ef629ba683b7e27` | B — order permuted | 120 → 120 | 119 → 119 | (none) |
| `section-reorder:2025-10-consultants-roundtable:B22:L0:Xpair22` | `9f46d169136ee9b7` | **A — REAL LOSS** | 120 → 119 | 119 → 118 | `UNKNOWN_FIELD` 119→118, `R:venue\|\#REF\!/NAME` |

Reproduce (needs `tsx` for the `@/` alias; ~15s; writes a temp file at the repo root and removes it):

```bash
cat > ./sr-probe-tmp.mts <<'EOF'
import { readFileSync } from "node:fs";
import { parseSheet } from "@/lib/parser";
import { payloadChanged, signalEq, newSignalFired, signalKeys, verdict } from "@/tests/parser/mutation/oracle";
const CASES: Array<[string, string, number[]]> = [
  ["2025-03-dci-rpas-central", "fixtures/shows/raw/2025-03-dci-rpas-central.md", [14,15,16,17,18,19]],
  ["2025-04-asset-mgmt-cfo-coo", "fixtures/shows/raw/2025-04-asset-mgmt-cfo-coo.md", [14,15]],
  ["2025-06-ria-investment-forum", "fixtures/shows/raw/2025-06-ria-investment-forum.md", [3,4,5,6,7,8]],
  ["2025-10-consultants-roundtable", "fixtures/shows/raw/2025-10-consultants-roundtable.md", [13,14,15,16,17,18,19,20,21,22]],
];
const mkeys = (m: Map<string, number>) => [...m.entries()].sort().map(([k,n])=>`${k}x${n}`).join(",");
let same = 0, diff = 0;
for (const [slug, path, pairs] of CASES) {
  const md = readFileSync(path, "utf8");
  const base = parseSheet(md, `${slug}.md`);
  const blocks = md.split(/\n\s*\n/);
  for (const i of pairs) {
    const swapped = [...blocks.slice(0,i), blocks[i+1], blocks[i], ...blocks.slice(i+2)].join("\n\n");
    const mut = parseSheet(swapped, `${slug}.md`);
    const identical = mkeys(signalKeys(base)) === mkeys(signalKeys(mut));
    identical ? same++ : diff++;
    console.log(`${slug} B${i} verdict=${verdict(base,mut)} payloadChanged=${payloadChanged(base,mut)} signalEq=${signalEq(base,mut)} newSignal=${newSignalFired(base,mut)} multisetIdentical=${identical} warnings=${base.warnings.length}->${mut.warnings.length} raw_unrecognized=${base.raw_unrecognized.length}->${mut.raw_unrecognized.length}`);
    if (!identical) {
      const B = signalKeys(base), M = signalKeys(mut);
      const lost: string[] = [], gained: string[] = [];
      for (const [k,n] of B) if ((M.get(k)??0) < n) lost.push(`${k} ${n}->${M.get(k)??0}`);
      for (const [k,n] of M) if ((B.get(k)??0) < n) gained.push(`${k} ${B.get(k)??0}->${n}`);
      console.log(`    LOST: ${lost.join(" ; ")||"(none)"}\n    GAINED: ${gained.join(" ; ")||"(none)"}`);
    }
  }
}
console.log(`\nSUMMARY: multiset IDENTICAL (pure reorder) = ${same}; multiset CHANGED (real loss) = ${diff}`);
EOF
npx tsx ./sr-probe-tmp.mts; rm -f ./sr-probe-tmp.mts
```

Expected last line: `SUMMARY: multiset IDENTICAL (pure reorder) = 14; multiset CHANGED (real loss) = 10`.

### 2.4 The 58 `wrong` rows — adjacency shape

Per-fixture (notes carry nothing else): consultants 20, rpas 11, fixed-income 8, fintech 5, east-coast 4, ria 3, `2025-03-dci-rpas-central` 2, `2025-04-asset-mgmt-cfo-coo` 2, redefining-fi 2, `2025-06-ria-investment-forum` 1.

Domain-pair shape, `signal_loss` vs `wrong` (the two populations occupy different adjacency shapes):

| domain-pair swapped | signal_loss | wrong |
| --- | ---: | ---: |
| other ↔ rooms | 4 | 19 |
| other ↔ other | 11 | 10 |
| rooms ↔ other | 2 | 13 |
| rooms ↔ rooms | 0 | 8 |
| other ↔ client | 0 | 7 |
| venue ↔ other | 2 | 0 |
| event_details ↔ venue | 1 | 0 |
| venue ↔ rooms | 1 | 0 |
| dates,crew ↔ venue | 1 | 0 |
| other ↔ venue | 1 | 0 |
| venue ↔ event_details | 1 | 0 |
| client ↔ other | 0 | 1 |

Every one of the 24 `signal_loss` swaps has at least one side that is either an unrecognized block or a VENUE block — consistent with §2.2. Zero `wrong` rows touch a VENUE block. The `wrong` rows are the already-ratified order-into-arrays behavior (`operators.ts:229` comment); nothing in this probe contradicts ratifying **payload** array-reorder as contract.

### 2.5 Verdict — SECTION-REORDER

> The `signal_loss` subset is 14 pure signal-array reorders plus 10 real losses, and the two need different dispositions. The 14 alarm only because the oracle's `signalRows` is index-keyed; they are the signal-channel twin of the payload array-reorder the spec already intends to ratify, and should be ratified the same way (or the oracle made order-insensitive on the signal channel). The 10 are a genuine P0-shaped fragility with a single root cause — `parseVenue`'s `inVenueFieldScope` (`lib/parser/blocks/venue.ts:77`, emitter at `:314`) makes the venue parser the unknown-field detector for the whole document tail, with a coverage window defined by document position rather than block identity, so moving one block silently extinguishes up to 98% of a sheet's warnings (`109 -> 2`, `120 -> 2`). Harden that mechanism, not "adjacency" in the abstract: the 82 rows contain exactly one bug.

---

## 3. UNICODE-INJECT (827 rows) — closable at a boundary, but **not** the boundary named in the hypothesis

### 3.1 The one fact that reframes this class

`clean()` (`lib/parser/blocks/_helpers.ts:45`) **already strips** `[​-‍﻿]`, and the injected character is ZWNJ **U+200C — inside that range**. So no unicode hole survives because the strip is missing; every one of the 827 survives because the corrupted decision happens **upstream of `clean()`**, at a tokenizer, matcher, or key-comparison that never routes through it.

By construction the operator only ever mutates a **data-row cell** (`eachDataCell`, `operators.ts:50`; header rows are `cls === "header"` and are skipped). Probe confirms: **0 holes whose source line is not a pipe-table row, and 0 section-label holes exist at all**. The "section-label paths" half of the hypothesis has no population — `sectionHeaderNormalize` cannot close a hole here because there are none to close.

### 3.2 Where the 827 live, by resolved parser surface

| resolved surface | domain | resolved via | holes |
| --- | --- | --- | ---: |
| PULL SHEET (slash-suffixed header) | pull_sheet | suffix cut | 368 |
| pull-sheet gear grid (boolean col-0) | pull_sheet | col-0 census | 185 |
| GS/BO room-detail label grid | rooms | col-0 census | 86 |
| BREAKOUT | rooms | registry | 49 |
| pull-sheet item grid | pull_sheet | col-0 census | 36 |
| UNRESOLVED headerless grid | other | — | 32 |
| GENERAL SESSION | rooms | registry | 23 |
| VENUE | venue | registry | 18 |
| AGENDA LINK (dash-suffixed) | agenda | suffix cut | 8 |
| LUNCH ROOM | rooms | registry | 8 |
| CLIENT (slash-suffixed scalar) | client | suffix cut | 6 |
| form-response grid | client | col-0 census | 4 |
| CLIENT | client | registry | 4 |

**589 of 827 (71%) are pull-sheet**, 166 are rooms. Target-cell shapes: 430 free-text, 385 ALLCAPS tokens, 6 exporter-entity multiline, 5 email-ish, 1 phone-ish. 195 target cell index 0 (the label/header-detection column). **Zero** target cells contain a markdown backslash escape, so the escaped-pipe fragmentation edge case has no population either.

### 3.3 Why a `splitRow` strip is only a partial fix — the tokenizer census

There is no single "tokenizer boundary" in `lib/parser`. Cells are produced four different ways:

| tokenizer | call sites | files | one strip closes it? |
| --- | ---: | ---: | --- |
| `splitRow()` (`_helpers.ts:39`) | 32 | 10 | **yes** — one edit |
| `parseTableRows()` (`_helpers.ts:18`) | 10 | 6 | **yes** — one edit |
| hand-rolled `.split("\|")` / `CELL_SPLIT_RE` | 18 | 8 | **no** — per-site |
| raw-line label regexes (`RAW_HEADER_REGEX_ALLOWLIST`) | 10 | 4 | **no** — never splits into cells at all |

The 18 hand-rolled sites: `blocks/agenda.ts:68`, `blocks/crew.ts:83,130,177,237`, `blocks/hotels.ts:1744`, `blocks/rooms.ts:117,124`, `index.ts:209,242,258,291,714,747`, `pull-sheet.ts:110`, `schema.ts:68,127`, `sectionHeaderNormalize.ts:120`.

The 10 raw-line regex sites: `blocks/hotels.ts:709,722`, `blocks/rooms.ts:1174,1235,1391,1470`, `blocks/transport.ts:186,351,463`, `index.ts:359`.

Two of those matter directly to the surfaces the holes land in:

- **`pull-sheet.ts:110`** hand-rolls its own split, and pull-sheet is 71% of this class.
- **`index.ts:359`** matches `AGENDA LINK` against the **unsplit line** (`/^\s*\|\s*(AGENDA LINK[^|]*?|AGENDA)\s*\|/i`), which is the surface behind the 8 agenda holes. No cell-level strip anywhere can reach it.

### 3.4 The boundary that does close the class

`parseSheet` already has exactly one document-normalization seam: **`index.ts:596-597`**, where `normalizeSectionHeaders(markdown)` rewrites the whole document and every block parser downstream consumes the rewritten string. A zero-width strip applied at that same seam reaches all four tokenizer families at once, because they all read `markdown` after it.

**What it would still miss** (the honest exception list):

- **`classifyVersion(markdown)` at `index.ts:557` runs BEFORE the seam**, and reads label cells through its own hand-rolled splits (`schema.ts:68` in `looksLikeSheet`, `schema.ts:127` in `extractLabelCells`). A ZWNJ in a version-marker label is not covered unless the strip is moved ahead of version detection. 195 of the 827 target cell index 0, so this is not hypothetical — it needs either an earlier strip or an explicit documented limit.
- Anything comparing against the **raw** `markdown` string captured before the seam (`useRawContentHash.ts` is the one to check at spec time — a hash taken on pre-strip text is correct, one taken post-strip changes content-hash identity for every existing sheet).
- Offsets: `rooms.ts:542` and `crew.ts:140,220` derive line numbers from `markdown.slice(0, offset)`. A strip at the seam shifts offsets uniformly for everything downstream of it, which is consistent — but `rawSnippet` / `sourceCell` values will then render stripped text, which is a deliberate behavior change to state, not a silent one.

### 3.5 Verdict — UNICODE

> **Closable at a boundary: YES — but not the one in the hypothesis.** The premise that the fix is "a tokenizer-boundary strip in `splitRow`/`parseTableRows` + `sectionHeaderNormalize`" is wrong in three ways: `clean()` already strips U+200C so the class is not a missing-strip bug at all; there are 28 further cell-producing sites outside those two helpers (18 hand-rolled splits, 10 raw-line regexes) including `pull-sheet.ts:110` which owns 71% of the population and `index.ts:359` which never tokenizes into cells; and the `sectionHeaderNormalize` half of the hypothesis has **zero** holes to close, because `unicode-inject` provably never targets a header row. The single edit that does close the class is a zero-width strip at the existing whole-document normalization seam (`index.ts:596`), where every tokenizer reads the rewritten string — with a stated exception for `classifyVersion` at `index.ts:557`, which runs before that seam and reads label cells through its own splitter.

---

## 4. REF-SUB / MERGED-CELL / COLUMN-SHIFT — what the warn codes must anchor to

### 4.1 The `other` bucket is a harness artifact, and it is the majority

Strict `classifySection` puts **1993 of 3314** ref-sub, **1663 of 2404** merged-cell, **87 of 211** column-shift and **725 of 827** unicode holes in domain `other`. That is not "unparsed junk". `classifySection` resolves col-0 by **exact** registry match (plus six prefix families), so a section headed `PULL SHEET/East Coast Single Family Office Symposium&#10;…` or `AGENDA LINK - RFI` resolves to nothing — even though `pull-sheet.ts` and `index.ts:359` parse both perfectly well.

The probe adds a relaxed resolver (suffix-cut against the registry, then a col-0 label census) and reports the **effective** domain. A spec that anchors `blockRef` to the strict table would attribute the single largest hole population to `other` and ship warn codes with no anchor.

### 4.2 Effective-domain matrix — anchor to this table

| effective domain | ref-sub | merged-cell | column-shift | unicode-inject | total |
| --- | ---: | ---: | ---: | ---: | ---: |
| **agenda** | 714 | 861 | 8 | 8 | **1591** |
| **pull_sheet** | 607 | 371 | 7 | 589 | **1574** |
| other (residual) | 447 | 405 | 48 | 32 | 932 |
| **rooms** | 482 | 96 | 45 | 166 | **789** |
| transportation | 290 | 192 | 3 | 0 | 485 |
| dates | 141 | 178 | 0 | 0 | 319 |
| event_details | 194 | 66 | 15 | 0 | 275 |
| hotel | 98 | 87 | 8 | 0 | 193 |
| client | 102 | 39 | 22 | 14 | 177 |
| crew | 79 | 45 | 14 | 0 | 138 |
| venue | 66 | 27 | 15 | 18 | 126 |
| documents | 80 | 23 | 17 | 0 | 120 |
| dress | 10 | 12 | 6 | 0 | 28 |
| contacts | 4 | 2 | 3 | 0 | 9 |

**`agenda` and `pull_sheet` are the top two domains and neither appears at all in the strict table.** They are also both absent from `RISK_CRITICAL` (`classify.ts:26`), which is worth a spec decision in its own right: the harness's coverage floor does not require either to have applicable sites.

### 4.3 Per-operator strict-domain detail

**`ref-sub` — 3314 (3094 wrong / 220 signal_loss)**

| strict domain | holes | wrong | signal_loss | header tokens |
| --- | ---: | ---: | ---: | --- |
| other | 1993 | 1807 | 186 | (headerless) |
| rooms | 291 | 281 | 10 | ADDITIONAL ROOM, BREAKOUT, GENERAL SESSION, LUNCH ROOM |
| transportation | 290 | 290 | 0 | DRIVER, TRANSPORTATION |
| event_details | 194 | 194 | 0 | DETAILS, DETAILS/ROOM DIAGRAM, EVENT DETAILS |
| dates | 141 | 141 | 0 | DATES |
| hotel | 98 | 98 | 0 | HOTEL |
| documents | 80 | 80 | 0 | COI |
| crew | 79 | 79 | 0 | CREW, TECH |
| client | 68 | 68 | 0 | CLIENT |
| venue | 66 | 42 | 24 | VENUE, VENUES |
| dress | 10 | 10 | 0 | DRESS |
| contacts | 4 | 4 | 0 | IN HOUSE AV |

`other` resolves to: agenda day grid 706, UNRESOLVED 447, PULL SHEET 377, GS/BO room-detail grid 191, pull-sheet gear grid 185, pull-sheet item grid 45, form-response grid 26, CLIENT scalar 8, AGENDA LINK 8.

Top target cell indexes: `X1`=1223, `X0`=654, `X2`=285, `X4`=217, `X3`=195. Top named column labels: (no header cell) 2197, DETAILS 68, RESERVATION #1 64, TRANSPORTATION 62, NAME 61, DATE 58, EVENT DETAILS 47, DRIVER 43, COI 40.

**`merged-cell` — 2404 (2271 wrong / 133 signal_loss)**

| strict domain | holes | wrong | signal_loss | header tokens |
| --- | ---: | ---: | ---: | --- |
| other | 1663 | 1530 | 133 | (headerless) |
| transportation | 192 | 192 | 0 | DRIVER, TRANSPORTATION |
| dates | 178 | 178 | 0 | DATES |
| hotel | 87 | 87 | 0 | HOTEL |
| rooms | 70 | 70 | 0 | BREAKOUT, GENERAL SESSION |
| event_details | 66 | 66 | 0 | EVENT DETAILS |
| crew | 45 | 45 | 0 | CREW, TECH |
| client | 39 | 39 | 0 | CLIENT |
| venue | 27 | 27 | 0 | VENUE |
| documents | 23 | 23 | 0 | COI |
| dress | 12 | 12 | 0 | DRESS |
| contacts | 2 | 2 | 0 | IN HOUSE AV |

`other` resolves to: agenda day grid 861, UNRESOLVED 405, pull-sheet gear grid 358, GS/BO room-detail grid 26, pull-sheet item grid 13.

Top target cell indexes: `X0`=704, `X1`=485, `X2`=247, `X3`=218. Top named column labels: (no header cell) 1737, EVENT DETAILS 66, TRANSPORTATION 60, DAY 58, DRIVER 43, DATE 40, HOTEL 37.

**`column-shift` — 211 (193 wrong / 18 signal_loss)**

| strict domain | holes | wrong | signal_loss | header tokens |
| --- | ---: | ---: | ---: | --- |
| other | 87 | 71 | 16 | (headerless) |
| rooms | 28 | 28 | 0 | ADDITIONAL ROOM, BREAKOUT, GENERAL SESSION, LUNCH ROOM |
| documents | 17 | 17 | 0 | COI |
| event_details | 15 | 14 | 1 | DETAILS, DETAILS/ROOM DIAGRAM, EVENT DETAILS, GS DETAILS (FOR BOTH) |
| venue | 15 | 14 | 1 | VENUE, VENUES |
| client | 15 | 15 | 0 | CLIENT |
| crew | 14 | 14 | 0 | CREW, TECH |
| hotel | 8 | 8 | 0 | HOTEL, HOTEL RESERVATIONS |
| dress | 6 | 6 | 0 | DRESS |
| transportation | 3 | 3 | 0 | DRIVER |
| contacts | 3 | 3 | 0 | IN HOUSE AV |

`column-shift` is one mutant per section (a leading empty cell inserted into every row), so its 211 rows are a near-complete census of the corpus's sections: it is the broadest-coverage / lowest-count class, and its domain spread is the closest thing the ledger has to a uniform sample.

### 4.4 The `signal_loss` sub-population — see §5

Where these 371 rows sit by resolved surface is in §5.3. **What they are** is the subject of §5, and it is not what their location suggests.

### 4.5 Verdict — REF-SUB / MERGED-CELL / COLUMN-SHIFT

> Warn codes must anchor to the **effective** domain table (§4.2), not to `classifySection`. The strict classifier files the majority of every class under `other` purely because it matches col-0 exactly against the registry, so the two largest real domains — **agenda (1591 holes) and pull_sheet (1574)** — do not appear in it at all, and neither is in `RISK_CRITICAL` (`classify.ts:26`). After resolution the anchor set the spec needs is: agenda, pull_sheet, rooms, transportation, dates, event_details, hotel, client, crew, venue, documents, with dress/contacts as long-tail. The `note` field is useless for taxonomy (122 distinct strings, all templated), so `blockRef` coverage cannot be derived from it. The `signal_loss` sub-population of these three classes is 92% not a parser defect at all (§5) and should be re-bucketed rather than hardened.

---

## 5. What `signal_loss` actually means — the refutation

### 5.1 How this section came to exist

An earlier draft of this document reasoned from §4's tables: 313 of 371 data-cell `signal_loss` rows sit in unrecognized grids, those grids are exactly what `parseVenue`'s open `inVenueFieldScope` sweeps, therefore ~323 of the ledger's 398 `signal_loss` rows share the §2.2 root cause and one fix closes them all. It was coherent, it fit every table above, and it was **wrong** — the reasoning ran from *where the holes are* to *what breaks*, which the ledger cannot support, because a `signal_loss` verdict says only that the signal channel changed, never how.

Running the parser settled it. `SILENT_SIGNAL_LOSS` is `oracle.ts:verdict`'s residual branch — `payload equal AND signal not deep-equal AND no NEW signal key fired` — and three quite different things satisfy it:

| class | definition | is it a parser defect? |
| --- | --- | --- |
| **A** | signal-key **multiset** shrank — a warning that used to fire no longer fires | **Yes.** Real detection loss. |
| **B** | multiset identical, same keys in a **different order** | No. Order sensitivity in `oracle.ts:signalRows`, which is index-keyed. |
| **C** | identical key **sequence**; only a non-key **field** of an entry differs (`value`, `message`, `rawSnippet`, `blockRef`) | No — arguably correct. The warning still fires, at the same position, and faithfully reports the now-corrupted cell. `#REF!` shows up in `raw_unrecognized.value` because the cell now says `#REF!`. |

### 5.2 Result — full corpus, 395 of 398 rows, all reproduced

| population | rows | A (real loss) | B (order permuted) | C (field content echoed) |
| --- | ---: | ---: | ---: | ---: |
| `ref-sub` + `merged-cell` + `column-shift` | 371 | **29** (7.8%) | 0 | **342** (92.2%) |
| `section-reorder` | 24 | **10** | **14** | 0 |
| `header-typo` | 3 | not examined (out of scope for this wave) | | |
| **TOTAL** | **398** | **39** | **14** | **342** |

371/371 data-cell rows reproduced exactly — zero ledger drift, and zero rows where the live verdict disagreed with the recorded `signal_loss`. So the ledger is accurate; it is the *name* of the bucket that misleads.

Signal families lost in the 29 data-cell class-A rows (each row lost exactly one family):

| lost signal family | rows |
| --- | ---: |
| `W:UNKNOWN_FIELD` + `R:venue` (the §2.2 venue scope) | 17 |
| `W:AGENDA_BLOCK_UNRESOLVED` | 7 |
| `W:UNKNOWN_SECTION_HEADER` | 4 |
| `W:SECTION_HEADER_NO_FIELDS` | 1 |

Adding the 10 section-reorder class-A rows (all `W:UNKNOWN_FIELD` + `R:venue`): **27 of the 39 real losses are the venue positional scope**, 7 agenda-block resolution, 4 unknown-section-header, 1 section-header-no-fields.

### 5.3 Where the class-A rows sit (this is the hardening target)

The 371 data-cell rows by resolved surface, for reference — but note that surface does **not** predict class, which is the whole point of §5.1:

| operator | effective domain | resolved surface | signal_loss rows |
| --- | --- | --- | ---: |
| ref-sub | other | UNRESOLVED headerless grid | 171 |
| merged-cell | other | UNRESOLVED headerless grid | 132 |
| ref-sub | venue | VENUES | 24 |
| ref-sub | client | form-response grid | 14 |
| column-shift | other | UNRESOLVED headerless grid | 10 |
| ref-sub | rooms | ADDITIONAL ROOM | 10 |
| column-shift | client | form-response grid | 3 |
| column-shift | agenda | agenda day grid | 2 |
| column-shift | event_details | DETAILS | 1 |
| column-shift | venue | VENUES | 1 |
| ref-sub / merged-cell / column-shift | pull_sheet | pull-sheet item grid | 1 each |

### 5.4 Reproduce

Needs `tsx` (repo devDependency) for the `@/` alias. ~90s. Writes a temp file at the repo root and removes it.

```bash
cat > ./sl-probe-tmp.mts <<'EOF'
import { readFileSync } from "node:fs";
import { parseSheet } from "@/lib/parser";
import { signalKeys, signalRows, verdict } from "@/tests/parser/mutation/oracle";
import type { ParsedSheet } from "@/lib/parser/types";
import { boundedMutants } from "@/tests/parser/mutation/operators";
import { KNOWN_SILENT_HOLES } from "@/tests/parser/mutation/knownHoles";
import { FIXTURES, readFixture } from "@/tests/parser/mutation/fixtures";

const OPS = ["ref-sub", "merged-cell", "column-shift"];
const seq = (p: ParsedSheet): string[] => [
  ...p.warnings.map((w) => `W:${w.code}`),
  ...p.hardErrors.map((h) => `H:${h.code}`),
  ...p.raw_unrecognized.map((r) => `R:${r.block}|${r.key}`),
];
const ms = (m: Map<string, number>) => [...m.entries()].sort().map(([k, n]) => `${k}x${n}`).join(",");
const cls = new Map<string, number>(), lostFams = new Map<string, number>();
const bump = (k: string) => cls.set(k, (cls.get(k) ?? 0) + 1);
const all = KNOWN_SILENT_HOLES.filter(
  (h) => h.kind === "signal_loss" && OPS.some((o) => h.siteId.startsWith(o + ":")));
console.log(`ledger data-cell signal_loss rows: ${all.length}`);
let matched = 0;
for (const f of FIXTURES) {
  const want = new Map(all.filter((h) => h.siteId.includes(":" + f.slug + ":")).map((h) => [h.siteId, h]));
  if (!want.size) continue;
  const md = readFixture(f);
  const base = parseSheet(md, `${f.slug}.md`);
  const bSeq = seq(base).join("\n"), bMs = ms(signalKeys(base)), bRows = signalRows(base).join("\n");
  for (const op of OPS) {
    for (const m of boundedMutants(op, md)) {
      const full = `${op}:${f.slug}:${m.siteId.slice(op.length + 1)}`;
      if (!want.has(full)) continue;
      matched++;
      const mut = parseSheet(m.md, `${f.slug}.md`);
      if (verdict(base, mut) !== "SILENT_SIGNAL_LOSS") { bump("NOT-SIGNAL-LOSS (ledger drift)"); continue; }
      if (ms(signalKeys(mut)) !== bMs) {
        bump("A. multiset CHANGED — real signal loss");
        const B = signalKeys(base), M = signalKeys(mut), fams = new Set<string>();
        for (const [k, n] of B) if ((M.get(k) ?? 0) < n)
          fams.add(k.startsWith("R:") ? "R:" + k.slice(2).split("|")[0] : k);
        for (const fam of fams) lostFams.set(fam, (lostFams.get(fam) ?? 0) + 1);
      } else if (seq(mut).join("\n") !== bSeq) bump("B. same multiset, key order PERMUTED");
      else if (signalRows(mut).join("\n") !== bRows) bump("C. identical key sequence — only entry FIELD content differs");
      else bump("D. signalRows identical");
    }
  }
}
console.log(`matched/reproduced: ${matched}/${all.length}`);
let tot = 0; for (const [, n] of cls) tot += n;
for (const [k, n] of [...cls.entries()].sort((a, b) => b[1] - a[1]))
  console.log(`  ${k}: ${n} (${((n / tot) * 100).toFixed(1)}%)`);
console.log(`lost-signal families among class A:`);
for (const [k, n] of [...lostFams.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`);
EOF
npx tsx ./sl-probe-tmp.mts; rm -f ./sl-probe-tmp.mts
```

Expected:

```
ledger data-cell signal_loss rows: 371
matched/reproduced: 371/371
  C. identical key sequence — only entry FIELD content differs: 342 (92.2%)
  A. multiset CHANGED — real signal loss: 29 (7.8%)
lost-signal families among class A:
  W:UNKNOWN_FIELD: 17
  R:venue: 17
  W:AGENDA_BLOCK_UNRESOLVED: 7
  W:UNKNOWN_SECTION_HEADER: 4
  W:SECTION_HEADER_NO_FIELDS: 1
```

### 5.5 Verdict — `signal_loss`

> **The ledger's 398 `signal_loss` rows contain 39 real signal losses.** 342 (86%) are class C — the warning still fires, in the same position, with a field that now echoes the corrupted cell, which is the parser doing the right thing; 14 are class B array permutation, detectable only because the oracle is index-keyed. Hardening should target the 39, and 27 of those are the single `parseVenue` `inVenueFieldScope` mechanism from §2.2. The other 356 need an oracle decision, not a parser fix: either narrow `SILENT_SIGNAL_LOSS` to multiset shrinkage (which would drop them from the ledger entirely), or split the verdict into distinct kinds so a genuine detection loss can never again be filed next to a corrupted-value echo at 9:1 odds. **Whichever way that goes, the ledger's `signal_loss` label should not be read as "a warning went missing" — for 86% of its rows, none did.**

---

## 6. Corpus context

17 fixtures (7 xlsx exporter-family, 10 raw), 263-976 lines each, 14-48 pipe blocks, 17-62 logical sections, 5-32 risk-critical sections. Full table in probe output §7.

---

## 7. Summary of what the spec should take from this

1. **Counts reconcile exactly** — all five asserted classes, and the totals close with nothing unattributed. No ledger-integrity problem to fix first.
2. **`section-reorder` contains one bug, not 24.** Its `signal_loss` rows split 14 order-permutation / 10 real loss; ratify the 14 alongside the payload array-reorder contract; harden `parseVenue`'s `inVenueFieldScope`. Class C has no members here, so section-reorder is the only operator whose `signal_loss` population is genuinely about ordering.
3. **`unicode-inject` is closable in one edit at `index.ts:596`**, not at `splitRow`/`sectionHeaderNormalize`. `clean()` already strips U+200C; the class exists because 28 cell-producing sites outside `splitRow`/`parseTableRows` decide upstream of it. State the `classifyVersion` exception (`index.ts:557`, before the seam) explicitly rather than discovering it in review.
4. **Anchor warn codes to effective domains** (§4.2), not `classifySection`. `agenda` (1591 holes) and `pull_sheet` (1574) are the two biggest and are invisible to the harness taxonomy — both absent from `RISK_CRITICAL`.
5. **The hardening target is 39 rows, not 398.** 86% of `signal_loss` is a warning faithfully echoing a corrupted value (class C), 4% is oracle-visible array permutation (class B). Of the 39 real losses, 27 are the venue positional scope, 7 `AGENDA_BLOCK_UNRESOLVED`, 4 `UNKNOWN_SECTION_HEADER`, 1 `SECTION_HEADER_NO_FIELDS`. The remaining 356 want an oracle decision, not a parser fix.
6. **Do not infer mechanism from ledger location.** §5.1 records a plausible, table-consistent inference that the parser refuted 10:1. Every mechanism claim in a spec built on this ledger should carry its own reproduce command.
