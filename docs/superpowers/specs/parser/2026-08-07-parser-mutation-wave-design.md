# Parser mutation-hardening wave — five BL-MUTATION-\* classes

**Date:** 2026-08-07 · **Branch (spec+plan):** `docs/parser-mutation-wave` · **Status:** DRAFT
**Backlog rows:** `BL-MUTATION-UNICODE` · `BL-MUTATION-REF-SUB` · `BL-MUTATION-MERGED-CELL` · `BL-MUTATION-COLUMN-SHIFT` · `BL-MUTATION-SECTION-ORDER` (all `BACKLOG.md`, marked IN PROGRESS on this branch)
**Decomposition parent:** `BACKLOG-archive.md` § `BL-MUTATION-HARNESS-OPEN-HOLES` (ratified 2026-08-05, L-wave spec §1.1 item 10 / §2.1.4)

The parser mutation harness (`tests/parser/mutation/`, spec `docs/superpowers/specs/ci/2026-07-06-mutation-testing-harness.md`) pins 7,842 ledgered silent holes in `tests/parser/mutation/knownHoles.ts` (`RAW_HOLES`). Five operator classes own 6,838 of them. This wave hardens each class to the corpus-safe reach and shrinks the ledger accordingly.

---

## 1. Scope

Five hardening projects, one per operator class, each fenced to its class:

| Class            | Operator (`tests/parser/mutation/operators.ts`) | Holes (wrong / signal_loss) | Strategy                                        |
| ---------------- | ----------------------------------------------- | --------------------------- | ----------------------------------------------- |
| unicode-inject   | `unicodeInject` (`operators.ts:85`)                         | 827 (827 / 0)               | document-seam strip at `parseSheet` entry; no new code |
| ref-sub          | `refSub` (`operators.ts:70`)                                | 3314 (3094 / 220)           | literal detector → warn `REF_ERROR_LITERAL`     |
| merged-cell      | `mergedCell` (`operators.ts:100`)                           | 2404 (2271 / 133)           | width discriminator → warn `ROW_CELLS_FUSED`    |
| column-shift     | `columnShift` (`operators.ts:144`)                          | 211 (193 / 18)              | autocorrect + `LEADING_COLUMN_AUTOCORRECTED`    |
| section-reorder  | `sectionReorder` (`operators.ts:228`)                       | 82 (58 / 24)                | harden venue scope (10); ratify + document 72   |

Out of scope: `BL-SERVER-ACTION-ORIGIN-GATE` (parked for a dedicated auth pass, per its own trigger clause in `BACKLOG.md`); the two documented-finding operator classes (`header-typo` → audit #5, `blank-row:*` → audit #10 / `BL-EXPORT-BLANK-ROW-SEGMENTATION`); the source-mutation guard gate (`tests/mutation/source/registry.ts` — a DIFFERENT harness, program-text mutants, not touched here).

### 1.1 Resolved scope — do not relitigate

1. **Wave shape: one spec, five implementation branches** — user-ratified 2026-08-07 in the brainstorming session for this spec. Merge order: unicode → ref-sub → merged-cell → column-shift → section-reorder. Do not propose a mega-branch or per-class specs.
2. **Done bar: safe reach + documented residue** — user-ratified 2026-08-07. Each class closes what a corpus-calibrated heuristic reaches without false-warning on legitimate authoring; the residue stays ledgered with a documented-limit note (§11). "Not all 6,838 closed" is the ratified outcome, not a finding.
3. **Section-order contract: source order IS the parser contract** — user-ratified 2026-08-07 (option "Ratify source order + probe"). `ParsedSheet.crewMembers` / `hotelReservations` / `rooms` (`lib/parser/types.ts:477-479`) preserve source order and their consumers (`app/show/[slug]/[shareToken]/page.tsx`, `components/admin/review/sectionData.ts`, wizard step-3 review) render that order. Pure array-reorder under block swap is faithful parsing of an edited source, ratified as a documented limit (§7, §11). Do not re-propose output normalization (changes live rendered card order on crew AND admin surfaces and rewrites ledger fingerprints wave-wide) or template-order deviation detection (needs a canonical-order reference no ratified artifact provides).
4. **Warn, never hard-fail, for every detector in this wave.** A live show carries `#REF!` at the time of writing (Consultants, live-verified 2026-08-07, probe §13.E; corpus base rate in §13.A). A hard-fail would block live syncs on shows that currently serve crew pages. Severity `"warn"` per `ParseWarning.severity` (`lib/parser/types.ts:68`), parse output preserved.
5. **Zero-width strip is ratified policy, not an open question** — `BL-MUTATION-UNICODE` entry, corrected 2026-08-06 after cross-model probe: `clean()` already strips `[​-‍﻿]` at the shared cell boundary (`lib/parser/blocks/_helpers.ts` `clean`, `_helpers.ts:45-53`) and `tests/parser/blocks/transport.test.ts:409-417` pins the live fintech ZWNJ shape. This wave extends WHERE the strip applies, not WHETHER stripping is right.
6. **Effort M per class, decided once at decomposition** — `BACKLOG-archive.md` § `BL-MUTATION-HARNESS-OPEN-HOLES` ("Why every child is M"). Do not re-size.
7. **The ledger is SHRINK-ONLY** — ratchet contract restated on every backlog row. Hardening converts holes to `staleRows` and the harness fails until rows are removed; a new hole fails as `newAlarms` (`reconcileLedger`, `tests/parser/mutation/knownHoles.ts:43`).
8. **No UI surface in this wave.** New warning codes flow through existing card components (`components/admin/PerShowActionableWarnings.tsx` via `lib/admin/step3SectionStatus.ts` → `lib/admin/sectionWarningModel.ts` → `lib/admin/routedWarnings.ts`); copy rows are catalog data, not components. Plans carry `impeccable-gate: N/A — no UI surface`.

---

## 2. Wave architecture

### 2.1 Branches and pipeline

Each class ships on its own branch off `origin/main`, in order (unicode first — smallest mechanism, validates the ledger-shrink workflow; section-reorder last — smallest count, largest contract weight):

1. `feat/mutation-unicode` — document-seam strip
2. `feat/mutation-ref-sub` — `REF_ERROR_LITERAL`
3. `feat/mutation-merged-cell` — `ROW_CELLS_FUSED`
4. `feat/mutation-column-shift` — `LEADING_COLUMN_AUTOCORRECTED`
5. `feat/mutation-section-order` — signal-loss hardening + contract ratification residue

Ledger-claim flow (invariant 12): this spec branch holds all five `IN PROGRESS` markers; its PR's last commit removes them; each implementation branch re-marks its one row at its own Stage 0 and removes it in its own PR's last commit.

### 2.2 Harness verification per branch

The harness is nightly + `workflow_dispatch` + path-filtered `pull_request` (`.github/workflows/mutation-harness.yml:15-24`); the `pull_request` trigger runs the workflow as it exists on the PR head, so every implementation branch (all touch `lib/parser/**`) gets a real harness run on its own PR without waiting for the nightly. Run command: `VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation` (8 shards, ~60-75 min in CI). Locally, a class-scoped iteration loop uses the shard runner (`tests/parser/mutation/runShard.ts`) — the plan pins the exact invocation.

Merge gate per branch: harness green (no `newAlarms`, no `staleRows`) with that class's CLOSED rows deleted from `RAW_HOLES` (section-reorder: 10 of 82 — §7.4), plus the standard merge-blocking suite.

### 2.3 What "hardened" means (oracle terms)

A hole closes when its mutant's verdict (`tests/parser/mutation/oracle.ts` `verdict`, `oracle.ts:67`) moves from `SILENT_WRONG` / `SILENT_SIGNAL_LOSS` to either:

- **`SIGNALED`** — a new warning fires (`newSignalFired`), payload may differ (detection), or
- **`ABSORBED`** — payload and signals equal baseline (correction; the unicode strip and the column-shift autocorrect produce this for payload-identical repairs — autocorrect additionally fires its warning, landing on `SIGNALED`).

`payloadOf` (`oracle.ts:11`) excludes `warnings`/`hardErrors`/`raw_unrecognized`, so a new warning never perturbs payload equality.

---

## 3. Class 1 — unicode-inject (827): document-seam strip

### 3.1 Mechanism — where the holes actually are (ledger probe §13.3)

`unicodeInject` (`operators.ts:85`) inserts a ZWNJ (U+200C) mid-scalar into DATA-ROW cells only (`eachDataCell`, `operators.ts:50` — header rows are skipped; the ledger contains **zero section-label holes**). `clean()` (`_helpers.ts:45`) already strips the class `[​-‍﻿]`, so no hole survives from a missing strip: every one of the 827 survives because the corrupted decision happens UPSTREAM of `clean()` — at a tokenizer, matcher, or key comparison that never routes through it. There is no single tokenizer boundary: cells are produced four ways (`splitRow` ×32 sites, `parseTableRows` ×10, hand-rolled `.split("|")` ×18 — including `pull-sheet.ts:110`, which owns 71% of this class — and raw-line label regexes ×10 that never tokenize into cells at all, including the `AGENDA LINK` match at `lib/parser/index.ts:359`). Per-tokenizer patching cannot close the class; the census is in the committed ledger probe §3.3.

**Fix: strip `[​-‍﻿]` from the whole document once, at `parseSheet` entry (`lib/parser/index.ts:553`), BEFORE `classifyVersion` (`lib/parser/index.ts:557`) and before the `normalizeSectionHeaders` seam (`lib/parser/index.ts:596`).** Every tokenizer family, label regex, and version-marker read consumes the stripped string. Placing it ahead of `classifyVersion` (rather than at the `lib/parser/index.ts:596` seam the probe first identified) also covers the version-marker label reads (`schema.ts:68`, `schema.ts:127`), which run before the seam and would otherwise be a documented limit with a live population (195 of the 827 target cell index 0). `clean()` keeps its strip — idempotent, belt-and-suspenders.

No new warning code: the class closes by correction (verdict `ABSORBED` — stripped mutant parses identically to baseline), and the backlog row sanctions zero catalog fan-out for exactly this outcome.

### 3.2 Stated behavior deltas (deliberate, not silent)

1. **`rawSnippet` / `sourceCell` / `resolution.contentHash` values render post-strip text.** The use-raw contentHash contract pins the PRE-strip cell (`lib/parser/warnings.ts:493-501`); on sheets that carry zero-width characters today (the fintech paste-damage shape, corpus probe §13.D — 18 chars in 1 of 17 fixtures), pinned use-raw decisions re-key ONCE on next parse. Bounded to ZW-carrying sheets, one-time, and the invalidation-on-text-change contract is preserved in spirit: our reading of the text changed.
2. **Line offsets** derived from `markdown.slice(0, offset)` (`rooms.ts:542`, `crew.ts:140`, `crew.ts:220`) shift consistently — the strip is applied before every consumer, so there is no mixed-offset state.

### 3.3 First task = closure probe

The branch's first task applies the strip and runs the unicode shard slice, expecting all 827 rows to convert to `staleRows` (delete from `RAW_HOLES`). Any residue contradicts the ledger probe's census and blocks the branch until explained — either a fifth cell-production path (extend the strip's reach) or a genuine documented limit filed in §11 with its count.

### 3.4 Structural guard

An end-to-end guard pins the invariant at the payload level: for every corpus fixture, every string field in `payloadOf(parseSheet(md))` contains no codepoint in `[​-‍﻿]`. Premise-stated per `tests/_shared/premise.ts`: the corpus premise is `fintech.md`'s 18 pre-existing ZWNJ occurrences (corpus probe §13.D) plus one seeded operator injection — both demonstrably reach the assertion, so the guard cannot pass vacuously.

---

## 4. Class 2 — ref-sub (3314): literal detector

### 4.1 Mechanism

`refSub` (`operators.ts:70`) rewrites a data cell to the literal `#REF!` — the string a broken cross-tab reference renders as (live-verified: Consultants `AGENDA!A3` is the decayed formula `=#REF!`, probe §13.E). The parse absorbs it as an ordinary value; a crew page renders `#REF!` where a name or time belongs.

**Detection operates on the post-`clean()` value.** The corpus stores the markdown-ESCAPED form `\#REF\!` exclusively (24/24 occurrences, probe §13.A); `clean()` strips markdown escape backslashes, so escaped and bare forms are identical in parser space. A raw-text detector would miss every real occurrence.

**Fix: a cell-level detector on cleaned cell values.** Any cell whose post-`clean()` value contains the literal `#REF!` emits one `ParseWarning`:

- `severity: "warn"`, `code: "REF_ERROR_LITERAL"`
- `blockRef`: the owning block's `{kind, index/iso/name, field}` where the consuming block parser can attribute the cell (the anchored-warning pattern of `2026-07-07-ambiguity-warnings-v1-design.md`); a cell consumed by no block parser still warns, with `blockRef` at section granularity. **Anchor coverage is planned against the EFFECTIVE-domain table (ledger probe §13.4), not the harness's strict `classifySection`** — the strict classifier files the majority of every class under `other` and misses the two largest real domains outright (agenda 1,591 holes, pull_sheet 1,574 across the wave), because it matches col-0 exactly against the registry. The anchor set: agenda, pull_sheet, rooms, transportation, dates, event_details, hotel, client, crew, venue, documents (+ dress/contacts long-tail).
- `rawSnippet`: the offending cell text
- parse output otherwise unchanged — the value flows through (resolved scope #4: warn, never hard-fail)

Detection is `contains`, not equality: the corpus itself carries composite cells (`\#REF\!/NAME`, `\#REF\!/ARRIVAL` — a `#REF!` prefix fused into a `<day>/<header>` cell, probe §13.A). Case-sensitive exact token — `#REF!` is a Sheets render literal, not free text; no fuzzy matching (threat model §12). All 24 corpus occurrences sit in headerless sections, so `blockRef` attribution must work at segmentation granularity, not only under recognized headers.

### 4.2 Calibration

The discriminator is unambiguous (probe §13.A: all 24 corpus occurrences are broken-reference artifacts; zero legitimate uses). Calibration therefore decides only warn VOLUME and anchoring: per-domain hole breakdown (probe §13.4) tells which block parsers must attribute `blockRef`. One warning per offending cell, deduplicated per (section, row, cell) — a `#REF!` that fans into multiple derived fields warns once at the cell, not once per field.

**Live-show consequence, stated for the record:** shows carrying `#REF!` at sync time (live-verified on Consultants, 2026-08-07 — a dated snapshot, not an invariant; the artifact appears when a referenced range is deleted and vanishes on repair, probe §13.E) will fire this warning on their next sync — intended behavior, not a regression. The warning is warn-severity and does not block sync or publish.

**Harness-side companion (`feat/mutation-ref-sub`):** extend `RISK_CRITICAL` (`tests/parser/mutation/classify.ts:26`) with `agenda` and `pull_sheet` — the two largest effective domains in the wave, currently absent from the coverage floor entirely (ledger probe §13.4) — updating the per-domain floor numbers and `applicabilityAudit.ts` expectations in the same commit. Small registry change, probe-justified; without it the harness's own floors never require its two biggest surfaces to have applicable sites.

### 4.3 Signal-loss subset

The 220 `signal_loss` rows are NOT mostly suppressed warnings — the ledger probe's live-parser taxonomy (probe §13.5) shows the data-cell classes' `signal_loss` population is 92% **class C**: the original warning still fires, in the same position, with a field that now faithfully echoes the corrupted cell (`#REF!` appears in `raw_unrecognized.value` because the cell now says `#REF!`) — correct behavior that the oracle's residual branch files as a signal diff. A small class-A subset is a real detection loss (probe §13.5: 29 class-A rows across ref-sub + merged-cell + column-shift). The distinction does not change the closure path: the detector fires a NEW warning on every such mutant, `newSignalFired` flips the verdict to `SIGNALED`, and all 220 close identically.

### 4.4 Operator-guard fix (harness bug adopted from probe §13.A)

`refSub`'s no-op skip guard (`if (c.val.trim() === "#REF!") continue;`, `operators.ts:74`) compares RAW cell text while the corpus stores only the escaped `\#REF\!` — it fires on 0 of 24 real occurrences, so 21 whole-cell sites emit mutants that are byte-distinct but semantic no-ops post-`clean()`, claiming siteIds and coverage without exercising the parser. Fix in the `feat/mutation-ref-sub` branch: compare post-`clean()` (`clean(c.val) === "#REF!"` or equivalent unescape-before-compare). These vacuous mutants parse identically to baseline, so they are ABSORBED, not ledgered — removing them shrinks the mutant set without ledger churn; the plan verifies `applicabilityAudit.ts` and coverage floors still hold after the guard fix. Class-sweep note: no sibling error-literal operator exists today; if one is ever added (`#NUM!` ×6 and `#N/A` ×3 sit in the same escaped shape), it must use the post-`clean()` comparison from birth.

---

## 5. Class 3 — merged-cell (2404): width discriminator

### 5.1 Mechanism

`mergedCell` (`operators.ts:100`) deletes one interior pipe from a row with ≥3 cells — exactly how a merged cell exports to markdown — fusing two adjacent cells and shifting every later cell left by one.

**Fix: a per-section row-width discriminator.** For each table section, establish the section's expected width as the MODAL cell count over the section's data rows (the width basis the probe calibrated — both the data-only and all-rows modal measured zero false positives, probe §13.B; header-based width is unnecessary and untested). A data row whose cell count is exactly `modal - 1` emits:

- `severity: "warn"`, `code: "ROW_CELLS_FUSED"`
- `blockRef` at the owning block with row attribution (`index`/`iso`/`name` where the block parser knows it)
- `rawSnippet`: the short row's line
- parse output unchanged: the block parsers already tolerate ragged rows; the warning adds signal without altering the (possibly wrong) absorption — detection, not correction. Correcting would require knowing WHICH pipe vanished, which is not recoverable from the row alone; documented limit (§11).

### 5.2 Calibration — the load-bearing half

Probe §13.B settles the base rate: **zero false positives on the clean corpus, with zero rows at `modal - 1` anywhere in it** — the xlsx→md conversion pads rows to column uniformity, so corpus raggedness (7/472 sections) runs entirely in the positive direction. The plain `modal - 1` rule needs no refinement to pass the calibration gate. Two things the spec records rather than inherits silently (probe §13.B verdict):

1. **The zero is partly a conversion artifact.** The measured rate bounds the HARNESS's false-positive risk, not a raw ragged live sheet's. The rule stays fenced to the markdown-fixture parse path the harness exercises — which is also the only path the parser has.
2. **The corpus is the acceptance test:** zero `ROW_CELLS_FUSED` warnings on the unmutated 17-fixture corpus, asserted by a NEW clean-corpus calibration test the wave adds (`negativeControls.test.ts` is the oracle/operator REACHABILITY suite, not a corpus gate — the new test is its corpus-side sibling), re-run whenever a fixture is added. If a future fixture introduces genuine `modal - 1` raggedness, the discriminator narrows (e.g. tail-tolerant: flag only when the short row's LAST cell is non-empty) and the narrowing is recorded in §11.

### 5.3 Residue

Holes the calibrated discriminator cannot reach (fusions in rows already off the section modal — the probe's 7 reconciled misses are the template — or sections too small to establish a modal) stay ledgered with a documented-limit note naming the exclusion.

### 5.4 What this class does NOT claim

**The `mergedCell` operator pins pipe-deletion robustness, not merged-range handling.** A real Google-Sheets merge exports value-REPEATED across the span with cell count unchanged (live-verified: Consultants `AGENDA!A2:C2` merged range → fixture row `| TRAVEL DAY | TRAVEL DAY | TRAVEL DAY | …`, probe §13.E) — a different shape this discriminator cannot and does not detect. The width discriminator addresses the harness's closed mutant class (§12 fence). Real merged-range detection (a repeated-value operator + heuristic) is out of this wave's scope; if it is ever wanted, it files as a NEW backlog row with its own probe, per the filing bar.

---

## 6. Class 4 — column-shift (211): autocorrect

### 6.1 Mechanism

`columnShift` (`operators.ts:144`) prepends a real empty cell to EVERY row of a section including the header — modeled on the East Coast outlier. Every field reads its neighbour's value; each looks well-formed.

**Live-pipeline status, corrected by probe §13.E:** the live East Coast sheet DOES carry a leading empty column (`INFO!A18`), but the xlsx→md conversion DROPS it before the parser ever sees it — both committed fixture families place `TECH` in cell 0. So live East Coast parses correctly today via upstream normalization, and this class defends the parser against the shape ARRIVING (a future exporter path, a conversion change, a paste) rather than fixing a live break. The harness injects it at markdown level, which is exactly the parser's exposure.

**Fix: detect-and-correct.** When EVERY row a section owns — header AND alignment rows included — has an empty first cell, the parser shifts the section's grid one column left before block parsing and emits:

- `severity: "warn"`, `code: "LEADING_COLUMN_AUTOCORRECTED"`
- `autocorrect: { subject: null, corrections: [{ detected: "<empty leading column>", corrected: "<shifted left>" }] }` — the structured field is ALWAYS set by `*_AUTOCORRECTED` producers (`lib/parser/types.ts:106` contract)
- `blockRef` at section granularity

Correction (not detection-only) is right here because the repair is unambiguous — unlike merged-cell, the inverse transform is total: delete the uniformly-empty leading column. This mirrors the existing autocorrect family (`SECTION_HEADER_AUTOCORRECTED`, `COLUMN_HEADER_AUTOCORRECTED`, …). Post-correction the payload equals the unshifted baseline and the warning fires: verdict `SIGNALED`.

### 6.2 Sixth autocorrect code — closed-set fan-out

`AUTOCORRECT_CODES` is a closed five-member registry (`lib/parser/autocorrectCodes.ts:19-25`) with structural pins. Adding the sixth member touches, in one commit:

| Surface                                                             | Change                                                    |
| ------------------------------------------------------------------- | --------------------------------------------------------- |
| `lib/parser/autocorrectCodes.ts` `AUTOCORRECT_CODES`                 | add row (comment says "All five" → "All six")              |
| `lib/parser/types.ts:106` autocorrect field doc                      | "the five `*_AUTOCORRECTED` codes" → six                  |
| `tests/parser/_metaAutocorrectProducers.test.ts`                     | register the new producer                                 |
| `tests/parser/dataGaps.test.ts:402` ("counts only the five…")        | update count + fixture                                    |
| `lib/messages/autocorrectGuidance.ts`                                | guidance row (not crew-scoped: `subject: null`)           |
| §12.4 + catalog + card copy                                          | per the §8 matrix                                         |

The plan's class-sweep step greps `_AUTOCORRECTED` across `lib/ tests/ docs/` for any additional five-member assumption before the branch opens.

### 6.3 Calibration

A legitimately indented section must not fire. The trigger requires ALL rows the section owns — header AND alignment rows included — to lead empty; a section with any populated first cell anywhere is untouched. Probe §13.C settles the variant choice: all-rows measures 0 false positives / 100% true positives and the separation is structural (alignment rows lead non-empty pre-mutation, empty post-mutation); data-only measures 61 false positives and NO arity threshold rescues it; ratio/"most rows" forms are FORBIDDEN (East Coast sits at 19-of-23 and would fire immediately). No arity floor is needed — the all-rows form measured zero false positives including one-row sections (the one near-miss, `fintech.md:4`, fails all-rows because its section owns an alignment row). Same clean-corpus calibration test as §5.2.

### 6.4 Signal-loss subset

18 `signal_loss` holes: the shift suppressed a signal some cell used to produce. The correction restores the unshifted grid, so the original signal re-fires — closure via restored baseline behavior plus the autocorrect warning.

---

## 7. Class 5 — section-reorder (82): harden the venue scope, ratify the rest

### 7.1 What the 82 rows actually are (ledger probe §13.2 — the live parser was run over all 24 signal-loss swaps)

| subset | rows | mechanism | disposition |
| ------ | ---: | --------- | ----------- |
| Payload array-reorder (`wrong`) | 58 | arrays preserve source order; swap faithfully reorders them. Zero of these touch a VENUE block. | ratify (resolved scope #3) |
| Pure signal-array reorder (`signal_loss`) | 14 | signal-key MULTISET byte-identical (e.g. `120 → 120`); only entry order moved. Alarms solely because the oracle's signal comparison is index-keyed. | ratify — signal-channel twin of the payload contract |
| REAL signal loss (`signal_loss`) | 10 | one root cause, below. Losses up to catastrophic: `warnings 109 → 2`, `raw_unrecognized 107 → 0`. | HARDEN |

### 7.2 The one bug — `parseVenue`'s positional unknown-field scope

Every lost signal in the 10 real-loss rows is `UNKNOWN_FIELD` + its paired `raw_unrecognized` entry, all from one emitter (`lib/parser/blocks/venue.ts:314`) gated by `inVenueFieldScope` (`venue.ts:77`): the flag flips on at the first resolved venue field and off only at a col-0 `VENUE_BLOCK_TERMINATORS` match (`venue.ts:81-99`), so the venue parser is the de-facto unknown-field detector for the ENTIRE document tail, with a coverage window defined by document POSITION rather than block identity. Swapping the VENUE block later — or a terminator-bearing block earlier — truncates the window and silently extinguishes up to 98% of a sheet's data-quality warnings.

**The venue scope owns 27 of the ledger's 39 REAL signal losses** (probe §13.5: 10 here + 17 in the data-cell classes; the remaining 12 are agenda-block resolution ×7, unknown-section-header ×4, section-header-no-fields ×1). The data-cell instances all close via their own class detectors (§4.3, §5, §6.4: the new warning fires regardless), so the bounded ledger target here is the 10 section-reorder rows — but the mechanism hardened is the one behind 27 of 39. An earlier location-based inference ("313 of 371 signal-loss rows share this mechanism") was REFUTED by the live-parser run (probe §13.5); do not re-derive it from the ledger's surface tables.

**Fix requirement (mechanism pinned, plumbing to the plan):** unknown-field / `raw_unrecognized` emission coverage must be a function of block identity, not of document position relative to the VENUE block — e.g. hoist the unrecognized-row sweep out of `parseVenue`'s positional scope into a document-level pass. Hard acceptance constraints: (a) on the UNREORDERED corpus, the emitted signal multiset is IDENTICAL to today's — a dedicated baseline signal-parity test over all 17 fixtures, plus full-ledger reconciliation showing only targeted classes shrink; (b) under any adjacent-block swap, the emission multiset is preserved; (c) no new warn code — the emissions keep their existing `UNKNOWN_FIELD` code and keys. If (a) proves unreachable without behavior change, the branch STOPS and the delta is ratified explicitly before landing (empirical-spike rule; no prose-only race patches).

### 7.3 The 14 pure signal-reorders — documented, oracle UNTOUCHED

The 14 alarm only because the oracle's signal comparison is index-keyed — but that order sensitivity is itself a pinned harness contract (`negativeControls.test.ts` "fingerprint: signal reorder (R16)" asserts reordered signals fingerprint differently). Making `signalEq`/`fingerprint` order-insensitive would reverse R16 and risk fingerprint drift across the whole 7,842-row ledger for a 14-row payoff. NOT worth it: the 14 are ratified as the signal-channel twin of the payload contract and stay ledgered under the documented-finding re-map (§7.4), exactly like the 58. Oracle untouched.

### 7.4 The 72 ratified rows (58 payload-reorder + 14 signal-reorder) — reclassification mechanics

They move to the documented-limit register (§11), and `OPERATOR_FINDING_MAP["section-reorder"]` (`knownHoles.ts:88`) re-maps from `BL-MUTATION-SECTION-ORDER` to the documented-finding form (audit #5/#10 pattern; `knownHoles.test.ts` accepts audit refs or resolvable `BL-` ids — the plan pins the exact ref string, landing in the same commit as the backlog row's closure). The 72 rows STAY in `RAW_HOLES` as documented-class rows (the audit-#5/#10 precedent — documented classes keep their rows); only the 10 venue-hardening rows delete as `staleRows`. Probe precondition SATISFIED: §13.2 confirms zero of the 58 `wrong` rows touch a VENUE block and zero lose signals, and the 14 have byte-identical signal multisets.

### 7.5 What does NOT happen

No output normalization; no template-order deviation detector; no live render change on any surface; no new warn code (the §7.2 fix preserves existing codes, and §8's "plus a §7.2 code only if minted" clause resolves to NOT minted unless the plan's baseline-parity probe forces a ratified delta).

---

## 8. Warning-code fan-out matrix

Every NEW warn-severity `ParseWarning` code in this wave (`REF_ERROR_LITERAL`, `ROW_CELLS_FUSED`, `LEADING_COLUMN_AUTOCORRECTED`, plus a §7.2 code only if minted) lands with ALL of the following in the SAME commit (the §12.4 lockstep rule, AGENTS.md cross-cutting discipline):

| Surface                                                                          | Gate that catches drift                                        |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Master spec §12.4 row (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`) | `x1-catalog-parity` (`tests/cross-cutting/codes.test.ts:69`)   |
| `pnpm gen:spec-codes` regen (`lib/messages/__generated__/spec-codes.ts`)          | same                                                           |
| `lib/messages/catalog.ts` row (all prose fields, `helpHref`)                      | same (4-field deep-equal)                                      |
| `tests/messages/warningCardCopyRegistry.ts` `WARNING_CARD_COPY_CODES` + copy      | `tests/messages/_metaWarningCardCopy.test.ts:46`               |
| `lib/parser/dataGaps.ts` `OPERATOR_ACTIONABLE_ANCHORED` membership (`dataGaps.ts:403`)       | `tests/parser/operatorActionableWarnings.test.ts`              |
| Help page anchor (`/help/errors#<CODE>`)                                          | help-content gates                                             |

Membership decisions, fixed here so the plan doesn't re-derive: all three named codes join `OPERATOR_ACTIONABLE_ANCHORED` (each is operator-actionable — fix the sheet — and carries a `blockRef` anchor). `LEADING_COLUMN_AUTOCORRECTED` additionally joins the §6.2 autocorrect registry. Copy authoring follows the `2026-07-20-warning-card-copy-restore` spec §4.2 (a new warn-severity `ParseWarning` code gets a `WARNING_CARD_COPY_CODES` row + copy).

Doug-facing copy tone follows the `STAGE_WORD_AUTOCORRECTED` template (`lib/messages/catalog.ts:1382-1397`): what we read, what we did, what to do if intentional. No raw error codes in UI copy (plan-wide invariant 5); no em-dashes in user-visible copy (pre-code mechanical gate).

## 9. Ledger mechanics per branch

1. Implement the class's detector/correction (TDD: the failing test is a targeted mutant through the real parse, asserting the new verdict).
2. Delete the class's CLOSED rows from `RAW_HOLES` (`knownHoles.ts`) — identified by `finding` id via `OPERATOR_FINDING_MAP`.
3. Run the harness (PR-triggered + `workflow_dispatch` for close-out): green = no `staleRows` (all deleted rows actually closed) and no `newAlarms` (nothing regressed).
4. Residue rows (holes deliberately not closed) STAY in `RAW_HOLES` untouched; their count and reason land in §11 and on the backlog row at close (the row closes when its class's reachable set is closed and its residue is documented — the safe-reach bar, resolved scope #2).
5. For section-reorder only: rows split by disposition — the 10 venue-hardening rows delete as `staleRows`; the 72 ratified rows STAY as documented-class rows under the `OPERATOR_FINDING_MAP` re-map (§7.4), landing in the same commit; `knownHoles.test.ts` keeps every remaining row resolvable.

## 10. Testing

- **TDD per task** (invariant 1). Every detector's RED test is a mutated fixture through `parseSheet` (`lib/parser/index.ts:553`) asserting the warning (code, severity, `blockRef` shape, `rawSnippet`) or, for autocorrect, the corrected payload + warning. No mocked parse layers (mocked-only reviews are tautological — AGENTS.md).
- **Anti-tautology:** expected values derive from fixture content, not hardcoded copies of parser output; each new test states the concrete failure mode it catches. Guards state their premise executably (`tests/_shared/premise.ts`): every discriminator test set includes at least one input past the boundary (a real mutant) and one clean control.
- **Clean-corpus calibration test (NEW, added by the first detector branch, extended by each subsequent one):** parses all 17 unmutated fixtures and asserts each new code's expected clean-corpus behavior — `ROW_CELLS_FUSED`: zero warnings; `LEADING_COLUMN_AUTOCORRECTED`: zero warnings; `REF_ERROR_LITERAL`: EXACTLY the 24 known artifact occurrences (probe §13.A), pinned per fixture — real hits asserted as expected, not suppressed. `negativeControls.test.ts` (the oracle/operator reachability suite) stays green and untouched, including its R16 signal-order fingerprint pin (§7.3).
- **Coverage floors:** `classify.ts` per-domain floors + `applicabilityAudit.ts` per-operator cross-check remain green.
- **Structural guards:** §3.4 payload-level ZW-freedom; §6.2 closed-set sweep; §7.2 baseline signal-parity assertion (venue hardening); §8 lockstep gates.
- **No new e2e surface:** warnings ride the existing card pipeline; the existing card tests cover rendering. No UI diff (resolved scope #8).

## 11. Documented limits (round 0)

1. **Pure section reorder is not a defect** (resolved scope #3, §7.1–§7.4): output order follows source order — payload arrays (58 ledger rows) AND signal-array order (14 rows). An accidental block swap reorders crew/hotel/room cards. Surfaced only if a future product decision demands canonical ordering.
2. **Merged-cell correction is out of scope** — the deleted pipe's position is not recoverable; we signal, we do not repair (§5.1). Worst case: the absorbed fusion persists, now with a warning.
3. **Real merged-range exports (value-repeated, count unchanged) are NOT detected** (§5.4, probe §13.E). The width discriminator claims the pipe-deletion mutant class only. A repeated-value operator + heuristic is a future backlog row, not this wave.
4. **Merged-cell holes in rows already off the section modal** stay ledgered (§5.3 — the probe's 7 reconciled misses are the shape), count recorded at branch close.
5. **Unicode residue beyond the parseSheet-entry strip** (§3.3: expected zero per the ledger probe census; any survivor blocks the branch until explained) stays ledgered with its count if a genuine limit emerges.
6. **Use-raw contentHash re-key on ZW-carrying sheets** (§3.2): pinned use-raw decisions on cells that carry zero-width characters today re-pin once after the strip lands. One-time, bounded to the fintech paste-damage shape.
7. **A `#REF!` that Sheets exports as a non-literal artifact** (empty cell, `#ERROR!`, `#NUM!`, `#N/A`, locale variants) is not this detector's class; only the literal `#REF!` token is claimed. Sibling error literals file as future rows if ever pinned — with the §4.4 post-`clean()` guard shape from birth.
8. **Column-shift claims the all-rows shape only** (§6, probe §13.C): partial leading-empty runs (East Coast's 19-of-23) are legitimate authoring and never fire; the exporter currently drops uniformly-empty leading columns before the parser sees them (probe §13.E), so the autocorrect defends the parser boundary, not today's live pipeline.
9. **Conservative-demote-plus-surfaced-warning outcomes are documented limits, not findings** (round-economy contract) — e.g. a fused row that warns but still absorbs is the DESIGNED outcome.

## 11.1 Dimensional Invariants

None — no UI surface in this wave (resolved scope #8); no component, layout, or dimension changes anywhere in the diff.

## 11.2 Transition Inventory

None — no component states or visual transitions in this wave (resolved scope #8).

## 12. Review convergence criterion + threat-model fence

**Consequence bound:** every mutated input in the five classes is parsed correctly or signaled, never silently wrong; a conservative demote plus a surfaced warning is a DOCUMENTED LIMIT, not a finding. The acceptance evidence is machine-computed: the harness verdict distribution over each class's mutant set, plus the shrink-only ledger reconciliation (`newAlarms = ∅`, `staleRows = ∅` after row deletion). A "the discriminator does not pin what it claims" finding is admissible only with a surviving mutant demonstrating it — an operator and a site from the declared operator set (`operators.ts` OPERATORS map, `operators.ts:267-273`).

**Threat-model fence:** the adversary is accidental — sheet-author slips and exporter artifacts (merge, broken reference, drag-shift, invisible characters, block reorder). Adversarial obfuscation (crafted inputs designed to evade a discriminator) is OUT of scope and files to §11. Enumeration over the open input space does not terminate and is not the convergence criterion; the closed mutant set is.

**Do not relitigate:** §1.1 items 1-8, each carrying its ratification.

## 13. Probe appendix (corpus + ledger, run 2026-08-07)

Reproduce: `node docs/superpowers/specs/parser/probes/2026-08-07-mutation-wave-corpus-probe.mjs` and `node docs/superpowers/specs/parser/probes/2026-08-07-mutation-wave-ledger-probe.mjs` (committed alongside this spec with their results docs).

### 13.A Ref-sub corpus occurrences (corpus probe §A)

**24 occurrences across 5 of 17 fixtures — ALL in the markdown-escaped form `\#REF\!`; the bare literal appears zero times.** Fixtures: consultants ×6, fintech ×5, fixed-income ×5, rpas ×5 (xlsx family — **4 of 7**, correcting the backlog row's "3 of 7", which is off by one); 2025-10-consultants-roundtable ×3 (raw family). Every occurrence sits in a data row of a headerless section; 21 are whole-cell, 3 are a prefix of a fused `<day>/<header>` cell (`\#REF\!/NAME` …), which is why detection is `contains` on the post-`clean()` value, not equality.

**Harness bug found, adopted into §4.4:** `refSub`'s no-op skip guard compares RAW cell text (`c.val.trim() === "#REF!"`, `operators.ts:74`) while the corpus stores the escaped form — the guard fires on 0 of 24 occurrences, so 21 whole-cell sites generate mutants that `clean()` renders semantically identical (byte-distinct, parser-space no-ops) while claiming coverage. `\#NUM\!` ×6 and `\#N/A` ×3 sit in the same escaped shape, so any future sibling error-literal operator inherits the identical bug.

### 13.B Merged-cell false-positive base rate (corpus probe §B)

**0 false positives in both width variants (all-rows modal / data-only modal) across 472 sections with ≥3 rows.** Premise is thin and recorded as such: only 7/472 sections are ragged at all, raggedness runs entirely in the positive direction (5 rows at modal+1, 2 at modal+2, **0 at modal−1**) — the xlsx→md conversion pads rows to column uniformity. Positive control: the shipped `mergeRawCells` applied to all 5,022 eligible data rows fires the rule on **5,015 (99.9%)**; the 7 misses reconcile exactly with the 7 off-modal rows (7 = 7, MATCH).

Live-merge caveat (probe §E): a REAL merged range arrives in the fixture **value-repeated across the span with cell count unchanged** (Consultants `AGENDA!A2:C2`), not short-by-one. §5.4 records the scope consequence.

### 13.C Column-shift corpus shapes (corpus probe §C)

| variant                        | clean-corpus false positives | positive control  |
| ------------------------------ | ---------------------------- | ----------------- |
| all rows the section owns      | **0**                        | **535/535 (100%)** |
| non-align (header + data)      | 1 (`fintech.md:4`)           | —                 |
| data rows only                 | **61** (31 at ≥4 data rows)  | —                 |

The all-rows form separates structurally, not luckily: alignment rows guarantee a non-empty first cell pre-mutation and an empty one post-mutation (the operator shifts them too). The data-only variant is unusable and NO arity threshold rescues it. East Coast sits at partial runs (19-of-23, 35-of-126 rows lead-empty) — a ratio/"most rows" relaxation false-positives immediately and is forbidden (§6.3).

### 13.D Zero-width corpus occurrences (corpus probe §D)

**18 occurrences, all U+200C, all in `fintech.md`** (12 on the HOTEL line, 6 on TRANSPORTATION) — the known live paste-damage shape the `unicodeInject` comment cites (`operators.ts:89`), already pinned by `tests/parser/blocks/transport.test.ts:409-417`. Consequence: a warn-on-zero-width detection heuristic would flag fintech forever; strip-without-warning (§3, ratified policy) is the only calibration-clean shape.

### 13.E Live-sheet spot check (corpus probe §E, gsheets MCP, 2026-08-07)

- **Consultants `AGENDA!A3` = `=#REF!` live** (formula text itself decayed; `A4` propagates via `TEXT()`) — matches the fixture. East Coast and RPAS carry NO live `#REF!`; RPAS's five fixture hits have diverged since capture. Any "N live shows contain `#REF!`" claim is a dated snapshot, never an invariant.
- **East Coast `INFO!A18` = `["", "TECH", …]`** — a genuine leading empty column that BOTH committed fixture families drop at conversion. The §13.C zero is measured post-normalization; §6.4 records the consequence.
- **Merged ranges arrive value-repeated, count unchanged** (see 13.B).

### 13.1 Count reconciliation (ledger probe §1)

All five classes reconcile EXACTLY against the backlog rows (ref-sub 3314 = 3094/220, merged-cell 2404 = 2271/133, unicode 827 = 827/0, column-shift 211 = 193/18, section-order 82 = 58/24), and the full ledger closes with nothing unattributed: the five classes (6,838) + audit #10 blank-row (870) + audit #5 header-typo (134) = 7,842. The probe self-checks by resolving all 7,842 siteIds against modeled fixtures before reporting (exit non-zero on any failure; current status PASS).

### 13.2 Section-reorder dissection (ledger probe §2)

The 24 `signal_loss` rows split **14 pure signal-array reorders / 10 real losses** — established by running the LIVE parser over all 24 swaps (reproduce block in the probe doc; expected summary line `multiset IDENTICAL = 14; multiset CHANGED = 10`). Every real loss is `UNKNOWN_FIELD` + paired `raw_unrecognized` from the single emitter `venue.ts:314` gated by `inVenueFieldScope` (`venue.ts:77`, terminators `venue.ts:81-99`); worst cases `warnings 120 → 2` / `raw_unrecognized 118 → 0`. The 58 `wrong` rows touch zero VENUE blocks and lose zero signals — pure payload array-reorder. Per-row verdict table (siteId, fingerprint, sub-class, lost keys) is in the probe doc §2.3.

### 13.3 Unicode dissection (ledger probe §3)

Zero section-label holes exist (the operator provably never targets header rows), refuting the tokenizer-hypothesis' `sectionHeaderNormalize` half. Four cell-production families (`splitRow` ×32, `parseTableRows` ×10, hand-rolled splits ×18, raw-line regexes ×10); `pull-sheet.ts:110` alone owns 71% of the class (589/827 pull_sheet surface holes), and `index.ts:359` never tokenizes into cells. The single closing edit is the whole-document strip (§3.1), placed BEFORE `classifyVersion` to cover the `schema.ts:68` / `schema.ts:127` label reads (195 holes target cell index 0). Zero target cells contain a backslash escape — the escaped-pipe edge has no population.

### 13.4 Effective-domain anchor matrix (ledger probe §4)

Strict `classifySection` files the majority of every class under `other` (exact-match registry artifact); after suffix-cut + col-0 census resolution the wave's anchor table is:

| effective domain | ref-sub | merged-cell | column-shift | unicode | total |
| ---------------- | ------: | ----------: | -----------: | ------: | ----: |
| agenda           | 714     | 861         | 8            | 8       | 1591  |
| pull_sheet       | 607     | 371         | 7            | 589     | 1574  |
| other (residual) | 447     | 405         | 48           | 32      | 932   |
| rooms            | 482     | 96          | 45           | 166     | 789   |
| transportation   | 290     | 192         | 3            | 0       | 485   |
| dates            | 141     | 178         | 0            | 0       | 319   |
| event_details    | 194     | 66          | 15           | 0       | 275   |
| hotel            | 98      | 87          | 8            | 0       | 193   |
| client           | 102     | 39          | 22           | 14      | 177   |
| crew             | 79      | 45          | 14           | 0       | 138   |
| venue            | 66      | 27          | 15           | 18      | 126   |
| documents        | 80      | 23          | 17           | 0       | 120   |
| dress + contacts | 14      | 14          | 9            | 0       | 37    |

`agenda` and `pull_sheet` — the top two — appear nowhere in the strict table and are absent from `RISK_CRITICAL` (`classify.ts:26`); §4.2 adopts the registry extension. The ledger `note` field is templated (122 distinct strings across 7,842 rows) and carries no taxonomy — `blockRef` coverage cannot be derived from it.

### 13.5 What `signal_loss` actually means (ledger probe §5 — live parser over 395 of 398 rows, zero ledger drift)

| class | definition | rows | parser defect? |
| ----- | ---------- | ---: | -------------- |
| A | signal-key multiset SHRANK — a warning genuinely stopped firing | 39 | YES |
| B | multiset identical, key order permuted (oracle `signalRows` is index-keyed) | 14 | no — §7.3 ratifies |
| C | identical key sequence; only a non-key FIELD echoes the corrupted cell (`value`, `message`, …) | 342 | no — faithful reporting |

(3 header-typo rows not examined — out of wave scope.) The 39 class-A losses: venue positional scope ×27 (§7.2), `AGENDA_BLOCK_UNRESOLVED` ×7, `UNKNOWN_SECTION_HEADER` ×4, `SECTION_HEADER_NO_FIELDS` ×1 — the 29 data-cell instances close via their class detectors, the 10 section-reorder instances via §7.2. **Do not read the ledger's `signal_loss` label as "a warning went missing" — for 86% of its rows, none did.** The probe's suggestion of an oracle verdict-kind split (separating echo from loss) is deliberately NOT taken up in this wave (§7.3 keeps the oracle untouched); if wanted, it files as its own backlog row with this probe as evidence.
