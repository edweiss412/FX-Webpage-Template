# spec:lint prose-count parity arms — corpus-calibrated design

**Date:** 2026-08-10 · **Branch:** `feat/speclint-prose-count-parity` · **Closes:** `BL-SPECLINT-PROSE-COUNT-PARITY` (BACKLOG.md)
**Class:** review-round reduction (tooling; no product surface) · **Effort:** S · **Severity:** LOW

## 1.1 Resolved scope — do not relitigate

- **The three shapes are fixed by the originating spec** (`docs/superpowers/specs/ci/2026-08-09-round-economy-followups-2.md` §3.2, ratified): (a) script-constant parity, (b) sibling-list cardinality, (c) quoted-template quantity drift. No fourth shape; no narrowing to fewer than three (a shape may ship as advisory with a documented FP bound, but it ships).
- **Advisory-first is the ratified severity** (originating spec: "Advisory-first is acceptable"). Nothing in this arc emits a HARD finding. Promotion to hard is a later arc's decision with its own evidence.
- **Exclusion boundaries are normative, not tunable:** prose carrying the dated "at authoring time" qualifier, dated historical records (probe transcripts, execution records — the filing's own boundary: historical measurements are never corrected), and fenced blocks are EXCLUDED from comparison, not flagged. (Fenced-region exclusion is already how `checkNumerics` walks the DocModel — `lib/specLint/numerics.ts:44`.)
- **The calibration numbers in §3 are the draft-time corpus measurement** (probe-before-argue for detector surfaces). Claims about corpus behavior are settled by re-running the probe, not argument.
- No UI surface; **impeccable-gate: N/A — no UI surface**.

## 2. Where the arms live

All three extend `lib/specLint/numerics.ts` beside `NUMERIC_NOUN_MISMATCH` (`lib/specLint/numerics.ts:88`), reusing the existing `DocModel` plumbing (`lib/specLint/parse.ts`) and the `Finding` shape, surfaced through `scripts/spec-lint.ts` like every other check. **Cross-file reads (R1 F4): shape (a)'s script text arrives through the EXISTING I/O boundary — `runLint`'s injected `FileResolver` (all I/O stays in the adapter, `scripts/spec-lint.ts:1`) resolves any same-line-named `scripts/` path the doc mentions and passes `{path → text}` into `checkNumerics` as a new optional argument; `numerics.ts` itself performs no I/O.** A path the resolver cannot serve (untracked, outside the contained root) contributes nothing and the occurrence is skipped silently (tripwire posture). New advisory codes: `SCRIPT_CONSTANT_PARITY` (shape a), `SIBLING_LIST_CARDINALITY` (shape b), `TEMPLATE_QUANTITY_DRIFT` (shape c).

## 3. Corpus calibration (probe, 2026-08-10 — full docs corpus: `docs/**/*.md` + `BACKLOG.md`; prototype probe-v5.ts in the session scratchpad speclint-probe directory; reports committed as measurement records in the implementing arc)

### 3.1 Shape (a) — script-constant parity

The accept-set is deliberately keyed on structure: a doc names a script under `scripts/` by path or basename; that script contains a module-local `const <IDENT> = <integer>` with `IDENT` matching `/^EXPECTED_[A-Z0-9_]+$/`; the arm reads the declaration TEXTUALLY (never imports — the originating spec's own boundary). **Association is SAME-LINE (R1 F2/F3): a cardinality qualifies when the script's name appears on the same line** — `DocModel` has no paragraph or table-row model, and the measured occurrences are all same-line, so the arm claims exactly what it can see. **Exclusion is per-NUMBER, not per-line (R1 F3):** a number is excluded when a dated qualifier phrase ("at plan time", "at authoring time") follows it within the same clause (within 40 characters), so `all 37 sites (36 at plan time)` compares the 37 and excludes the 36 on one line. **Measured universe today: one qualifying constant** — `EXPECTED_SITE_TOTAL = 37` (`scripts/verify-cn-operand-parity.mjs:80`), named by 7 docs — with **three qualifying same-line occurrences** (the R1 probe's lower bound: `docs/superpowers/plans/2026-08-07-classname-array-join-cn.md:21` and `docs/superpowers/plans/2026-08-07-classname-array-join-cn.md:22`, plus `docs/superpowers/specs/2026-08-07-classname-array-join-cn.md:651` — the draft's "exactly one" undercounted because its prototype used paragraph association the accept-set never ratified), **all three agreeing with the constant: zero live mismatches**. The mixed line (:21, both a qualifying 37 and an excluded 36) is a committed fixture, not a hoped-for case. Every disagreeing number elsewhere (33, 36) sits in dated historical/review-round records the exclusions carve out.

### 3.2 Shape (b) — sibling-list cardinality (the FP-dominated shape; gates are load-bearing)

A naive "N <noun> followed by a list" recognizer over the corpus produces **12,198 hits with 83% count mismatch** — overwhelmingly false positives (the following list is not the claimed enumeration). The probe measured a cumulative gate ladder; each row is hits surviving ALL gates so far, with mismatch under the stop-at-break list counter:

| gate stack | hits | mismatching |
| --- | --- | --- |
| bare recognizer | 12,198 | 10,181 (83%) |
| + value 2-40 | 9,992 | 8,238 |
| + claim in the line's last clause | 5,913 | 4,682 |
| + no sentence-end after the claim | 1,336 | 730 |
| + colon-terminated or ≤60 chars of tail | 1,150 | 572 |
| + list adjacency (list begins within 2 lines) | 925 | 370 |
| + lexical guard (decimal/section/marker fragments rejected) | **707** | **190 (27%)** |

A value cap tighter than 40 barely moves it (≤9 → 685/171). Sampling the surviving 190 shows a mix: genuine drift candidates (e.g. a "7 sheets" claim over an 11-item list) and residual FPs (claims whose enumeration lives elsewhere). **Ship posture: the full gate stack above, advisory, with the implementing arc's plan including a bounded hand-classification of the ~190 survivors to set the final adjacency/noun-echo gate before the arm lands** — the classification is one pass over a fixed list, not an open enumeration. Number-words: 34% of hits are word-form cardinalities ("three"); the recognizer parses the twenty small number-words (two..twenty) — dropping them would blind the arm to the measured motivating instances ("three measured shapes").

### 3.3 Shape (c) — quoted-template quantity drift

Corpus probe: **27 candidate groups** (near-identical repeated indented/fenced blocks within one doc, similarity ≥0.87, differing in numeric literals). **The R1 review probe showed the draft's stricter differs-solely-in-numerics gate would MISS the ratified motivating instance** — the wedge-remeasure counting rule and its list-item disposition template differ in more than digits and are not both indented blocks — so that gate is rejected (R1 F1). Ship posture instead: the arm's candidate structures are repeated within-doc text runs (indented blocks AND list-item/prose templates), paired at a similarity threshold **calibrated at implementation time to the LOWEST value that still captures the wedge-remeasure pair, probed against that doc's pre-repair revision and committed as the arm's red fixture**; a pair fires only when its diffs include a numeric-literal change. The 27-group sample plus the wedge pair are the implementing arc's classification set (same bounded hand-classification treatment as shape (b)); advisory-only regardless of the residual FP rate the classification measures.

## 4. Guard conditions / accept-set discipline

- Inputs are markdown docs already parsed by `DocModel`; a doc with no qualifying structure produces zero findings from all three arms (opt-out by construction, matching the originating spec's "design and opt-in mechanics belong to the implementing arc" — the mechanics here are: always-on, advisory, structurally self-limiting).
- Everything outside each accept-set is IGNORED, never guessed at: an `EXPECTED_` const that is not a module-local integer literal, a list not adjacent to its claim, a repeated block differing in non-numeric text — all out, silently. The arms are drift TRIPWIRES, not census tools; silence means "no qualifying structure," not "verified consistent."
- Consequence bound: every finding is advisory with file:line + both numbers; a wrong flag costs one glance. Nothing rewrites, nothing blocks, nothing is silently wrong.

## 6. Verification

- **Unit (red first), per arm:** fixture docs derived from the measured corpus instances — shape (a): a doc naming the real script with a deliberately drifted present-tense count (flag), the same count under an "at authoring time" qualifier (no flag), in a dated probe transcript (no flag), in a fence (no flag); shape (b): the motivating "three measured shapes" instance with a 2-item list (flag) and each gate's rejection case as its own fixture (sentence-tail, no adjacency, decimal fragment — no flag each); shape (c): the ACTUAL wedge-remeasure pre-repair pair (probed from that doc's history — the arm MUST flag it, it is the calibration anchor) and a command pair differing in a path (no flag). Anti-tautology: fixtures state their expected finding count and code; gate-rejection fixtures each name the single gate they exercise, so a gate deletion fails exactly its fixture.
- **Corpus regression:** running the extended `spec:lint` over the live corpus emits no HARD findings anywhere (advisory-only proof) and completes within the existing lint budget.
- **Self-application:** `pnpm spec:lint` on THIS spec stays 0 hard.

## 7. Documented limits

- Shape (b)'s residual FP rate after the full ladder is measured at ~27% of survivors pre-classification; the hand-classification pass bounds it before landing, and the arm stays advisory regardless — a reader glances and moves on. Adversarially constructed prose is out of scope (threat model: accidental drift by an ordinary author).
- Shape (a)'s universe is one script today; the arm is structural so the second `EXPECTED_` constant enrolls itself, but no claim is made about universes that do not yet exist.
- Cross-doc template drift (shape c is within-doc only) is out of scope per the originating spec.

## 8. Acceptance criteria

- **AC-1:** Three advisory codes land in `lib/specLint/numerics.ts` with the §3 gate stacks; `pnpm spec:lint` surfaces them.
- **AC-2:** All §6 fixtures pass, red-first per arm; the live-corpus run emits advisories only.
- **AC-3:** The §3.2 survivor classification is committed as a measurement record in the arc (input to the final gate, per plan).
- **AC-4:** `BL-SPECLINT-PROSE-COUNT-PARITY` graduates; marker off in the PR's last commit (invariant 12).

impeccable-gate: N/A — no UI surface
