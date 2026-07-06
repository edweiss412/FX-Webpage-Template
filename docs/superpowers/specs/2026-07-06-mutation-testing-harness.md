# Spec — Parser Mutation-Testing Harness (Rec 5)

**Date:** 2026-07-06
**Slug:** mutation-testing-harness
**Source:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/edge-case-preparedness-audit-2026-07-04.md` §5 recommendation 5.
**Status:** approved design → spec.

---

## 1. Problem

The audit's structural diagnosis (§4.3): "the regexes, vocabs, and the test suite are all tuned to the same 7-show sample. The tests can't catch what the code misses because they share its priors." The primary safety net is golden-file replay of ~15 historical fixtures (`tests/parser/exporterFixtures.test.ts`); a novel-but-valid sheet shape has **no test analog by construction**.

The pipeline's dangerous failure class is the **silent wrong parse**: a mutation to the input produces a different, plausible-looking parse output with **no signal** — no `hardError`, no `warning`, no `raw_unrecognized` entry. A human only notices if they open that show.

Rec 5 manufactures the missing corpus: programmatically mutate the existing golden fixtures and assert every mutant is **either parsed identically (absorbed) or signaled** — never silently wrong.

## 2. Goal & non-goals

**Goal:** a CI-gating vitest harness that, for each committed fixture × mutation operator × mutation site, classifies the mutant's parse as `ABSORBED` / `SIGNALED` / `SILENT_WRONG`, and fails when the set of `SILENT_WRONG` mutants diverges from a committed **bidirectional known-holes ledger**.

**Non-goals:**
- **Zero product-source change.** This is purely additive test infrastructure under `tests/parser/mutation/`. It fixes no audit finding; it *pins current reality* and *catches regressions*. Findings #1–#13 remain open holes, recorded in the ledger.
- No new §12.4 error codes, no DB, no UI, no migrations, no advisory-lock surface, no Supabase call boundary.
- Not a `fast-check`/property-testing framework adoption. Deterministic, enumerated mutation sites only (no RNG — matches the workflow-script determinism norm and keeps ledger keys stable).
- Not a fix for the parser. Downstream recs 1–4 (PR #302 version-confidence, PR #315 re-sync gate, delit-anchors, wire-silent-channels) shrink the ledger as they land; this harness does not depend on them.

## 3. Core mechanism — metamorphic oracle

Because the corpus is *manufactured*, there is no hand-authored expected output per mutant. A **metamorphic** oracle is used: compare the mutant's parse against the pristine fixture's baseline parse.

### 3.1 Baseline capture

For each fixture, parse the pristine markdown once: `parseSheet(markdown, filename)` (`lib/parser/index.ts:516` — `parseSheet(markdown: string, filename?: string): ParsedSheet`). Split the result into:

- **Data payload** — every `ParsedSheet` field EXCEPT the three signal channels. Fields (`lib/parser/types.ts:371-391`): `show`, `crewMembers`, `hotelReservations`, `rooms`, `transportation`, `contacts`, `pullSheet`, `diagrams`, `openingReel`, `runOfShow`.
- **Signal channels** — `hardErrors: ParseError[]` (`.code`, types.ts:22,390), `warnings: ParseWarning[]` (`.code`, types.ts:4-21,386), `raw_unrecognized: {block,key,value}[]` (types.ts:385).

`summarizeDataGaps` (`lib/parser/dataGaps.ts:85`) is a **projection of `warnings`**, not an independent channel — it is therefore subsumed by the `warnings` signal and is NOT separately consulted.

### 3.2 Signal multiset

Signal strength is a **multiset of signal keys**:

```
signalKeys(parsed) : Map<string, number>   // key -> count
  H:<code>              for each hardErrors[].code
  W:<code>              for each warnings[].code
  R:<block>|<key>       for each raw_unrecognized entry
```

A multiset (not a set) so that an *increased count* of an already-present code — e.g. three rooms losing dims where one did before — counts as a stronger signal.

**`newSignalFired(baseline, mutant)`** ≙ `∃ key : mutant.count(key) > baseline.count(key)`.

### 3.3 Payload comparison

**`payloadChanged(baseline, mutant)`** ≙ the data payloads are not deep-equal (structural equality via `expect(...).toEqual` semantics — a stable deep clone comparison; the payload contains only JSON-serializable values at parse time — `diagrams.embeddedImages`/`linkedFolderItems` are `never[]` and `openingReel` is a driveFileId ref at parse time, types.ts:379-384).

### 3.4 Verdict

| payloadChanged | newSignalFired | Verdict |
|---|---|---|
| false | — | `ABSORBED` (pass — mutation invisible) |
| true | true | `SIGNALED` (pass — degradation announced) |
| true | false | **`SILENT_WRONG`** (the alarm) |

## 4. Operator buckets

### 4.1 Corrupting bucket — oracle: `ABSORBED ∨ SIGNALED`

A change of meaning is acceptable *if announced*. The six audit-named operators:

1. **`header-typo`** — apply a single Damerau edit (adjacent-char transposition) to a recognized section-header token in a `| HEADER | … |` row (CREW / TECH / HOTEL / VENUE / DATES / TRANSPORTATION / AGENDA / GEAR / etc.). The transposed token MUST NOT itself be a valid header (guard against accidentally producing a real header). Catches finding #5 (short headers have no typo tolerance). Site = each header-row line.
2. **`ref-sub`** — replace one non-empty table body-cell value with the literal `#REF!` (present in 3/7 live shows per the grounding audit). Site = each non-empty body cell (capped).
3. **`unicode-inject`** — insert a zero-width non-joiner (U+200C) into the interior of one non-empty cell value (fintech's live ZWNJ shape). Site = each non-empty body cell (capped).
4. **`column-shift`** — prepend an empty leading column to every row of one contiguous table block (`| x |` → `|  | x |`) — the East Coast column-shifted outlier. Site = each table block.
5. **`blank-row`** — two sub-variants: **`blank-row:inject`** inserts a blank line between two body rows of a table block (spacer fuse/split, finding #10); **`blank-row:remove`** deletes an existing blank separator between two blocks. Site = each interior body-row gap / each inter-block blank.
6. **`merged-cell`** — delete one interior pipe of a body row with ≥3 cells, fusing two adjacent cells (how a merged cell exports). Site = each ≥3-cell body row.

### 4.2 Cosmetic-invariant bucket — oracle: FULL parse equivalence (payload **and** signals unchanged)

These pin the audit's §2 "credit where due" invariants. A cosmetic edit must be **fully invisible** — not merely data-preserving. The cosmetic oracle requires **complete parse equivalence**: (a) data payload deep-equal to baseline, **and** (b) the **full signal channels** deep-equal to baseline — the entire `warnings[]`, `hardErrors[]`, and `raw_unrecognized[]` arrays including every field (`raw_unrecognized`'s `value`, not just `block`/`key`). The reduced `signalKeys` **multiset is NOT used for the cosmetic bucket** — it discards `raw_unrecognized.value` and warning messages, so a cosmetic mutant that changed an admin-visible raw-unrecognized value while keeping the same block/key count would wrongly pass (Codex R3 MEDIUM). Cosmetic comparison is a straight `toEqual` over `{ payload, warnings, hardErrors, raw_unrecognized }`. A reordered block that trips `UNKNOWN_SECTION_HEADER`, or trailing whitespace that alters any signal field, therefore **FAILS**. (`signalKeys` remains the reduced multiset used ONLY by the corrupting bucket's `newSignalFired`, §3.2.)

7. **`section-reorder`** — swap the order of two top-level blocks separated by blank lines (block parsers scan the whole doc — audit §2 bullet 1; reorder MUST be output-identical).
8. **`trailing-whitespace`** — append trailing spaces to non-empty lines and/or trailing blank lines at EOF (authoring noise MUST be invisible).

### 4.3 Per-operator guard conditions

- Every operator is a **pure** `(markdown, fixtureMeta) → Mutant[]` function; a `Mutant` is `{ md: string; siteId: string; bucket: 'corrupting' | 'cosmetic' }`.
- **No applicable site → zero mutants** (empty array), never a throw. A fixture with no ≥3-cell row yields no `merged-cell` mutants — that is correct, not an error.
- **Block-stratified selection (NOT global first-N).** A naïve "first-N sites in document order" cap is rejected: in the committed fixtures the early rows are CLIENT / event-metadata rows *before* CREW/HOTEL/ROOMS/AGENDA, so a first-N cap would concentrate every mutant in low-risk leading cells, drop the high-risk sections, log the drop, and still satisfy ledger equality — a green harness that never mutates the domains the audit is about (Codex R1 HIGH). Instead:
  - Sites are grouped by **markdown block** — a contiguous run of pipe-table rows delimited by blank lines (the same block boundary `exportSheetToMarkdown` segmentation produces).
  - Selection is **round-robin across blocks**: every block contributes its 1st site before any block contributes its 2nd, up to a global bound `MAX_SITES_PER_OP` (default **12**). This guarantees breadth — no single leading block can monopolize the budget.
  - `droppedSites` (sites beyond the bound) is surfaced per `(fixture, operator)` — never silently truncated (audit "no silent caps").
- **Per-domain coverage floor (GATING, not logged) with classifier parity.** Each block is classified by its leading header token via an **explicit** `SECTION_DOMAIN_MAP: Record<string, Domain>` keyed on `normalizeHeader(...)` (`lib/parser/knownSections.ts` — the parser's own header normalizer). `Domain = crew | hotel | rooms | transportation | agenda | dates | event_details | venue | dress | contacts | client | pull_sheet | documents | other`. The concrete mapping covers **every current member** of `KNOWN_SECTION_HEADERS` (`lib/parser/knownSections.ts:34-65`, 30 entries — verified exhaustively so the parity gate is satisfiable):
  - `crew` ← `CREW`, `TECH`
  - `hotel` ← `HOTEL`, `HOTELS`, `HOTEL RESERVATIONS`, `HOTEL RESERVATION`, `HOTEL STAYS`, `HOTEL STAY`
  - `rooms` ← `GENERAL SESSION`, `BREAKOUT`, `BREAKOUTS`, `ADDITIONAL ROOM`, `LUNCH ROOM`, `LUNCH SESSION`, `FOYER`
  - `event_details` ← `EVENT DETAILS`, `DETAILS`, `GS DETAILS`
  - `transportation` ← `TRANSPORTATION`; `dates` ← `DATES`; `agenda` ← `AGENDA`, `AGENDA LINK`
  - `venue` ← `VENUE`, `VENUES`; `dress` ← `DRESS`; `contacts` ← `IN HOUSE AV`
  - `client` ← `CLIENT`; `pull_sheet` ← `PULL SHEET`; `documents` ← `COI`, `DOCUMENT FOLDER LINK`
  - `other` ← a block whose leading header is **not** a parser-known section header (genuine metadata rows only).
  - **Classifier-parity gate (structural test):** iterate `KNOWN_SECTION_HEADERS` and assert **every** parser-known header is explicitly present in `SECTION_DOMAIN_MAP` and does **not** resolve to `other`. A parser-known header missing from the map (e.g. a future block-parser alias) → **FAIL**. This prevents the drift class: a new parser header cannot silently demote a risk-critical domain to `other` and disable its floor (Codex R2 MEDIUM). Because the gate reads the live `KNOWN_SECTION_HEADERS`, adding a header to the registry without mapping it here fails CI — the map is forced to stay complete.
  - **The floor:** for each **corrupting** operator, assert **every risk-critical domain present in the fixture receives ≥1 mutant** — risk-critical = `{crew, hotel, rooms, transportation, agenda, dates, event_details}`. A risk-critical domain that is present (≥1 block classified to it with ≥1 applicable site) but receives **zero** mutants → **FAIL**. Raising `MAX_SITES_PER_OP` or reordering fixtures can never quietly starve a high-risk section. Domains absent from a fixture are skipped (not every show has transportation). The non-risk-critical domains (`venue`, `dress`, `contacts`, `client`, `pull_sheet`, `documents`, `other`) are mapped but **un-floored** (lower audit-tier risk); they still participate in round-robin so they are not zero-covered.
- **Determinism:** site enumeration is a deterministic scan (top-to-bottom within each block, blocks in document order); round-robin order is block-index order; the Damerau transposition uses a fixed rule (first transposable adjacent pair of distinct chars). No `Math.random`.
- **`siteId` uniqueness + stability.** A body row holds several independently-mutable cells, so a line-only key would let two distinct silent-wrong mutants collapse to one `siteId` and undercount the ledger (Codex R2 HIGH). Every emitted mutant therefore carries a **globally unique** key that pins the exact mutation locus:
  `siteId = <operator>:<fixtureSlug>:B<blockIdx>:L<lineNo>:X<locusIdx>` — where `locusIdx` is the **cell/column index** (`ref-sub`, `unicode-inject`), the **interior-pipe index** (`merged-cell`), the **header-token position** (`header-typo`), the **inter-row gap or inter-block index** (`blank-row`), the **leading-column marker** `0` (`column-shift`), or the **block-pair / EOF marker** (`section-reorder`, `trailing-whitespace`). The driver asserts **all generated `siteId`s across the whole run are unique before ledger comparison** — a duplicate is a harness bug and FAILS immediately (never a silent collapse). Keys are stable for static committed fixtures; editing a fixture churns its keys and the ledger is re-baselined (fixtures rarely change; acceptable and explicit).

## 5. Known-holes ledger (bidirectional ratchet)

`tests/parser/mutation/knownHoles.ts` exports:

```ts
export type KnownHole = {
  siteId: string;      // exact SILENT_WRONG mutant key
  finding: string;     // audit finding ref, e.g. "#5", "#3", "#10"
  note: string;        // one-line human description
};
export const KNOWN_SILENT_HOLES: readonly KnownHole[];
```

The driver computes `actual = { all mutants whose verdict is SILENT_WRONG }` (keyed by `siteId`) and asserts **set equality** with `KNOWN_SILENT_HOLES`'s `siteId`s:

- **`actual ∖ ledger` (new silent hole not recorded) → FAIL.** A regression, or a newly-covered mutation the author must triage: fix it, or record it with a finding ref.
- **`ledger ∖ actual` (recorded hole no longer silent) → FAIL.** Stale entry — the hole was fixed (e.g. by recs 1–3). The author MUST delete the stale ledger row. This is the ratchet tightening; it makes ledger shrinkage mandatory as fixes land, mirroring this repo's registry-style meta-tests (`_metaInfraContract`, `_auditableMutations`).

The initial ledger is populated by running the harness once against `origin/main` HEAD and recording every day-1 `SILENT_WRONG` with its mapped finding. Each entry cites the audit finding it evidences; a mutant that surfaces a *new* silent hole not in the audit gets a `finding: "unaudited"` row + a `BACKLOG.md` note.

## 6. File layout (all test-only)

```
tests/parser/mutation/operators.ts    # 8 pure operators + MAX_SITES_PER_OP + site enumeration
tests/parser/mutation/oracle.ts       # baseline capture, signalKeys, payloadChanged, verdict()
tests/parser/mutation/knownHoles.ts   # KnownHole type + KNOWN_SILENT_HOLES ledger
tests/parser/mutation/fixtures.ts     # fixture registry: 17 { slug, path } (7 exporter-xlsx + 10 raw)
tests/parser/mutationHarness.test.ts  # driver: fixtures × operators × sites → verdict → ledger diff
```

No file under `lib/`, `app/`, `components/`, `supabase/` is created or modified. Confirmed by the diff being confined to `tests/parser/mutation/**` + the driver + this spec + the plan.

## 7. Fixture corpus (17)

- **exporter-xlsx (7)** — production path (`synthesizeMarkdownFromXlsx` output): `consultants`, `east-coast`, `fintech`, `fixed-income`, `redefining-fi`, `ria`, `rpas` (`fixtures/shows/exporter-xlsx/*.md`).
- **raw (10)** — Drive-MCP markdown (`fixtures/shows/raw/*.md`): `2024-05-east-coast-family-office`, `2025-03-dci-rpas-central`, `2025-04-asset-mgmt-cfo-coo`, `2025-05-redefining-fixed-income-private-credit`, `2025-06-ria-investment-forum`, `2025-10-consultants-roundtable`, `2025-10-fixed-income-trading-summit`, `2026-03-rpas-central-four-seasons`, `2026-04-asset-mgmt-cfo-coo-waldorf`, `2026-05-fintech-forum-cto-summit`.

Both are parsed by the same `parseSheet` entry point; the harness treats them uniformly (fixture family is metadata only, used in the `siteId` slug).

## 8. Guard conditions & edge cases

- **Fixture that already parses to `hardErrors` at baseline** (e.g. a garbage tab): baseline signal multiset already carries `H:<code>`; a mutant that keeps the same hardError and changes nothing else is `ABSORBED`; a mutant that *adds* a hardError code or count is `SIGNALED`. No special-casing needed — the multiset delta handles it.
- **Mutation produces byte-identical markdown** (operator no-op on this site — should not happen given the guards, but defensively): treated as a zero-mutant (skipped), never emitted, so it cannot register a spurious `ABSORBED`.
- **Baseline warning that the mutation happens to *remove*** while corrupting payload: `newSignalFired` is false (no key increased), payload changed → `SILENT_WRONG`. Correct: the parser dropped a real warning while altering output — that is exactly a silent-wrong regression worth catching.
- **Cosmetic operator that legitimately cannot find two reorderable blocks / any line**: zero mutants, no failure.
- **`toEqual` on `undefined` optional fields** (`runOfShow?`): baseline and mutant are compared with identical field-set semantics; an operator that causes `runOfShow` to appear/disappear is a payload change and is handled by the corrupting-bucket oracle (must signal) or fails the cosmetic-bucket oracle (must be invisible).

## 9. Success criteria

1. `pnpm vitest run tests/parser/mutationHarness.test.ts` is **green** with the committed ledger (day-1 ledger == day-1 `SILENT_WRONG` set).
2. Introducing a **synthetic regression** (e.g. temporarily break `section-reorder` invariance, remove a ledger row, starve one domain's coverage, or collide two `siteId`s) makes the harness **red** — proven by negative-control assertions in the plan's verification task covering: cosmetic signal-invariance, ledger bidirectionality, per-domain floor, and `siteId` uniqueness.
3. The harness runs in the standard `pnpm test` suite and in CI (no new workflow; it is a plain vitest file discovered by the existing config).
4. Total mutant count and per-operator `droppedSites` are surfaced (a summary `console`/`log` line or an asserted count), so coverage is legible and silent truncation is impossible. The **per-domain coverage floor** (§4.3) is asserted: for every corrupting operator, each risk-critical domain present in a fixture has ≥1 mutant — a gating check, proven by a negative-control task that removes coverage for one domain and shows the harness goes red.
5. Full `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` green before push.

## 10. Meta-test inventory

This milestone **creates** one structural harness (`tests/parser/mutationHarness.test.ts`) with three internal structural gates: (a) the bidirectional **known-holes ledger** (`knownHoles.ts`) — its own source of truth; (b) a **`siteId`-uniqueness** assertion over all generated mutants (guards ledger-undercount, Codex R2); (c) a **classifier-parity** gate asserting every member of `lib/parser/knownSections.ts`'s `KNOWN_SECTION_HEADERS` is explicitly mapped in `SECTION_DOMAIN_MAP` (guards coverage-floor drift, Codex R2). It **reads** `KNOWN_SECTION_HEADERS`/`normalizeHeader` from the parser registry but does not modify `_metaKnownSectionsRegistry.test.ts`. No advisory-lock (`pg_advisory*`) surface is touched → holder-topology declaration is **N/A**. No Supabase call boundary is added → `_metaInfraContract` registry is **N/A**. No new §12.4 code → catalog-parity gates **N/A**.
