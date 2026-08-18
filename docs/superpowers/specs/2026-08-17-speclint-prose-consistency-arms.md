# spec:lint prose-consistency arms — enumerated-universal parity + post-repair forward-ref sweep

**Date:** 2026-08-17 · **Branch:** `fix/speclint-prose-consistency-arms` · **Closes:** `BL-SPECLINT-ENUMERATED-UNIVERSAL-PARITY` + `BL-SPECLINT-POSTREPAIR-FORWARD-REF-SWEEP` (BACKLOG.md)
**Class:** review-round reduction (tooling; no product surface) · **Effort:** M · **Severity:** medium

## 1.1 Resolved scope — do not relitigate

- **Truth is out of scope; presence is in scope.** Neither arm evaluates whether a universal claim is TRUE — that is claim semantics, and the speclint-prose-count-parity arc measured what chasing an open grammar costs (thirteen of twenty-one diff rounds were one class: a hand-rolled lexical approximation being wrong about a second language, `docs/review-rounds/feat/speclint-prose-count-parity/a7393880ae6d.md`). The arms detect the STRUCTURE the originating findings shared — a universal-quantifier claim standing away from its enumeration with no probe beside it — and hand the judgment to the mandated human sweep. NARROWING is the ratified repair direction under same-axis recurrence (AGENTS.md, "Repair direction under same-axis recurrence").
- **Advisory + inventory only; nothing HARD.** One advisory code and two inventory groups. Promotion to hard is a later arc's decision with its own evidence (same posture the prose-count-parity spec ratified).
- **The advisory's accept-set is digit-cardinal only.** The universal+class-token form without a cardinal ("every swapped control carries `…`") was MEASURED as an advisory candidate and REJECTED: 8,652 raw / 4,677 gated hits over the corpus (≈10 per doc) — a flood, not a tripwire (probe record §"Pass 1"). That escape class is covered by the `universal-claims` inventory group instead. Do not re-propose a U-b advisory without a gate stack that beats the measured flood.
- **The calibration numbers in §3 are the draft-time corpus measurement** (probe-before-argue). Claims about corpus behavior are settled by re-running the committed probe, not argument.
- **`BL-SPECLINT-BL-DISPOSITION-CLOSEOUT-ARM` is NOT implemented here.** Its ledger row says the implementing arc decides whether it shares a surface with the forward-ref sweep; this spec records the decision: it stays a separate row. The `scope-fences` inventory group gives it a natural future home (the new universals module, §4), but no id-accounting logic ships in this arc.
- **Spec-kind docs only.** Both arms run only when `doc.kind === "spec"` (the `checkSections` precedent, `lib/specLint/sections.ts:27`). Plans are out of the calibrated domain; extending is a later decision.
- No UI surface; **impeccable-gate: N/A — no UI surface**.

## 1.2 Threat fence and probe domain (for every review brief on this arc)

- **THREAT FENCE:** ordinary authoring mistakes by an ordinary contributor drafting or repairing a spec. Adversarial obfuscation files to documented limits.
- **PROBE DOMAIN:** the live tracked `docs/**` corpus (446 spec-kind docs at draft time). A probe input must come from the corpus or be one ordinary edit away from an input in it; a constructed fixture outside that files to documented limits, not to a finding.
- **CONSEQUENCE BOUND:** every output is an advisory (one glance) or an inventory line (zero-cost until read). Nothing rewrites, nothing blocks, nothing is silently wrong; a claim the recognizers cannot classify draws silence, and silence means "no qualifying structure", never "verified consistent".
- **CONVERGENCE CRITERION:** the new module's mutation score plus an EMPTY unaccepted-survivor set (enrolment precedes review, §6), and the committed §3.3 survivor classification. The survivor set MIXES genuine drift candidates with benign restatements — that is the advisory tripwire contract (the shape-(b) precedent), and a benign-but-accept-set-qualifying survivor is NOT a defect. What IS a defect, probe-settled: an emission on a line OUTSIDE the stated accept-set (wrong structure class — R1's four classes, now gated, §3.2). Enumerating further hypothetical grammar corners does not terminate and is not the criterion.

## 2. What the originating escapes were — and which mechanism catches each

Five escapes across two arcs, each costing a review round. Defective texts recovered from the defective revisions (retro-probed; quoted verbatim):

| # | Escape (verbatim, defective revision) | Filing | Mechanism here |
| --- | --- | --- | --- |
| E1 | "Every one of the 21 swapped sites lands on one of those four." (`cc7942d4e:181`; twenty do) | control-outline R1 F3 | **advisory** (§3.2) + inventory |
| E2 | "Every swapped control already carries `transition-colors duration-fast`" (`cc7942d4e:242`; nineteen do) | control-outline R1 F4 | **inventory** `universal-claims` (advisory form rejected, §1.1) |
| E3 | "hover changes the FILL (`hover:bg-surface-sunken`), not the outline" (`cc7942d4e:246`; true on twenty) | control-outline R3 F3 | **documented limit** — no quantifier token; invisible to a lexical recognizer (§7) |
| E4 | "Any closing of the wiring-guard bypasses (§4 … ratified limits; …)" (`a045c53d1:235`, elided; stale after R1 repaired §4) | guard-completeness R2-F3 | **inventory** — line is in an "Out of scope" region (`scope-fences`) AND opens with a universal (`universal-claims`) |
| E5 | "Every entry this wave resolves … in-progress markers come off in the PR's last commit per invariant 12" (`65641604f:235`; contradicted invariant 12's graduating-entry rule for entry C) | guard-completeness R5 | **inventory** — clause-initial universal, in a "Ledger closeout" region (both groups) |

Filings: `docs/review-rounds/chore/guard-completeness-wave/04f601134519.md` (spec §, item (a)), `docs/review-rounds/fix/control-outline-surface-fills/119895a7c756.md` (spec §, Mechanizable). Both ledger rows carry `Reachability: PROBED` against these findings.

Why the inventory is the right mechanism for E2/E4/E5: the manual post-repair self-consistency sweep is already mandated (`docs/agents/spec-self-review.md:18`), and both guard-completeness escapes happened because that sweep's cover was scoped by the REPAIRED text's terms — a forward reference phrased differently never greps. The inventory derives the sweep's cover from CLAIM SHAPE instead (every universal-quantifier line, every scope-fence line), which is independent of any repair's vocabulary. This is the "sweep to a derivation, not a longer list" doctrine (AGENTS.md class-sweep bullet) applied to the sweep itself.

## 3. Corpus calibration

**Layer 1 — the CONTRACT (normative).** The shipped arms implement the accept-sets and gates AS STATED HERE. The spec is the authority; the instrument informs it.

**Layer 2 — the INSTRUMENT (measurement record).** The measured population is the tracked `docs/**` corpus MINUS this arc's own artifacts (spec, plan, probe, report — the `OWN_ARTIFACTS` list in the instrument): the spec quotes the recognizer's own accept-set, so including it made each repair round move the measurement it was calibrated by (R2 F4, drift measured and closed; re-runs are now stable against arc edits). The committed probe (`docs/superpowers/specs/probes/2026-08-17-prose-consistency-probe-v1.ts`, path-parameterized, importing the live `parseDoc` so instrument and arm can never disagree about fencing) and its record (`docs/superpowers/specs/probes/2026-08-17-prose-consistency-probe-v1.report.txt`). The record holds: the pass-1 all-docs rates, the second pass's spec-kind gate ladder with the full 212-row survivor listing, and the inventory sizing. Nothing else is claimed for it.

**Layer 3 — the arc's OWN record.** The implementing arc runs the CONTRACT's recognizer over the corpus, commits its survivor listing, and hand-classifies it (§3.3).

### 3.1 Measured rates (draft-time, this worktree)

| population | raw | gated |
| --- | --- | --- |
| universal+cardinal, all 1,217 `docs/**` files | 3,574 | 1,819 |
| universal+class-token+inline-code, all docs (REJECTED form) | 8,652 | 4,677 |
| universal+digit-cardinal, 446 spec-kind docs, non-table non-dated, value 2–999, no time-unit, not inside an inline span | 336 | — |
| + cardinal enumerated in another section + no probe command in owning section | — | **212** (~0.5/doc) |
| `universal-claims` inventory lines per spec doc | median 9 | max 81 |
| `scope-fences` lines per spec doc (BOTH heading families, depth ≥ 2) | median 4 | max 174 |

Out-of-scope regions appear in 286 docs (1,242 bullets, 333 with a § reference) — which is why a per-bullet advisory was rejected for the forward-ref row: the population is three orders too large for a tripwire. Closeout-family headings appear in 34 spec docs (sparse; inventory-viable).

### 3.2 Arm A — advisory `ENUMERATED_UNIVERSAL_NO_PROBE`

A spec-kind doc line draws the advisory when ALL hold:

1. The line is non-fenced, is not a table row (leading optional whitespace then `|`), and does not contain an ISO date (`\d{4}-\d{2}-\d{2}` — dated historical records are never compared; the prose-count-parity exclusion family, adopted whole).
2. It matches the accept-set: a universal quantifier token (`every`/`each`/`all`, initial letter upper or lower case — exactly the instrument's match) followed by optional `one of the `/`of the ` then a digit cardinal of 1–3 digits with value ≥ 2. Number-words are OUTSIDE the accept-set (digit-only; the motivating escape is digit-form, and word-forms widen the population unmeasured — documented limit). The value bound is an R1 repair, probe-backed: 4-digit reads were year mentions and value 0/1 reads were status text ("all 0", "Ignore all 1"), all four wrong-class emissions.
   - The cardinal is not followed — across a single whitespace OR hyphen separator — by a time-unit noun from the closed set `ms|s|min(s)|minute(s)|hour(s)|second(s)|day(s)|week(s)|month(s)`: "every 5 min" and "every 5-min check" both quantify a FREQUENCY, not a population (R1 repair + R2 F1 hyphen repair, probe-backed: 11 live wrong-class emissions across the two rounds' probes).
   - The match does not sit inside an inline code span — a backticked "`Ignore all 1`" is literal/example text, not a claim (R1 repair, probe-backed: 4 live wrong-class emissions).
3. The cardinal is excluded if a dated qualifier phrase ("at plan time", "at authoring time" — the closed stage-noun set already shipped in `lib/specLint/numerics.ts`, `QUALIFIER_STAGES`) follows it within 40 characters as its nearest predecessor (same nearest-binding rule as the prose-count arms).
4. **Enumeration evidence:** the same cardinal string appears on at least one other non-fenced, non-table line in a DIFFERENT section (section = nearest preceding heading of any depth; the population the universal quantifies is stated elsewhere in the doc).
5. **No probe beside the claim:** the owning section (heading to next heading of ≤ its depth) contains no probe command — no inline code span and no `sh`/`bash`/info-less fenced line whose first token is in the closed command set `{rg, grep, pnpm, git, gh, node, npx, tsx, find, ls, comm, wc, cat, sed, awk, jq, psql, curl}`.

Message carries the claim line, the cardinal, and one other-section line where the cardinal appears, with the repair the originating arc validated: let one section own the measurement and reference it, or put the enumerating command beside the claim. Severity: advisory. Fires on E1 at its defective revision (retro-verified: `cc7942d4e:181` sits in §5.1, which has no command-first span; "21" appears on non-table lines of other sections, e.g. the ruling line `cc7942d4e:39`).

### 3.3 Survivor classification (bounded, gates frozen)

The 212-row survivor population (the shipped recognizer's own re-run, layer 3) gets one bounded hand-classification pass — informing advisory copy and §7's documented limits ONLY; the gates above are frozen at ship time. One pass over a fixed list, not an open enumeration (the shape-(b) precedent, prose-count-parity spec §3.2).

### 3.4 Arm B — inventory groups `universal-claims` and `scope-fences`

Appended to `LintResult.inventory` (`lib/specLint/types.ts`, `InventoryGroup`) when non-empty; rendered by the existing generic `INVENTORY` block (`scripts/spec-lint.ts`, `renderText`) and present in `--json`. Never a finding; never affects the exit code.

- **`universal-claims`:** every non-fenced, non-table line whose clause start matches the closed quantifier set — line start, or after a period, semicolon, or colon followed by a space; then an optional list-marker/bold prefix; then `Every|Each|All|Any|No|Never|Nothing` as a word. Exactly the instrument's measured recognizer; synonyms outside the set (e.g. "entire", "none of", "always") are a documented limit.
- **`scope-fences`:** every non-blank, non-fenced PROSE line of a region owned by a heading of depth ≥ 2 matching `/out of scope|non-goals?/i` or `/clos(e-?out|eout)|graduation/i` (region = heading to next heading of ≤ its depth). The depth bound is an R1 repair, probe-backed: a depth-1 TITLE containing "close-out" owns its whole document (measured: 513 lines of one doc would have entered the group), and a title is a doc identity, not a fence region. Fenced lines and nested heading lines are EXCLUDED — fence content is code/example, not a prose claim, and a nested heading's own content lines are walked beneath it (R2 F2: the contract adopts the instrument's measured semantics; the earlier "every non-blank line" wording described a population 190 lines at max that nothing had measured). Re-measured with both families at depth ≥ 2: median 4, max 174 lines per doc (§3.1).

Consumption contract: `docs/agents/spec-self-review.md`'s self-consistency-sweep bullet gains one sentence naming these groups as the sweep's derived cover — the post-repair sweep walks the inventory lines instead of grepping for the repair's own terms. (One-line docs edit, this arc.)

## 4. Where the arms live

One new pure module, lib/specLint/universals.ts (plain text: created by this arc, not tracked yet) — DocModel in; findings + inventory groups out; no I/O, the `numerics.ts` posture. Wiring: new `Check` member `"universals"` (`lib/specLint/types.ts:2`), `CHECK_ORDER` row (`lib/specLint/run.ts:16`), call beside `checkNumerics` in `runLint` (`lib/specLint/run.ts:80`), and the render `checks` array (`scripts/spec-lint.ts:88`). Inventory groups concatenate after the numeric groups. Waiver semantics are untouched — and note the existing contract: ignore-waivers suppress `fail`-severity findings only (`lib/specLint/run.ts:138`), so the new advisory is NOT waiver-suppressible, exactly like every existing advisory; its cost is one glance and its off-switch is repairing or single-sourcing the claim.

**Coordination fence (arc B):** `run.ts`, `types.ts`, and `scripts/spec-lint.ts` are also named by the red-contract arms arc (`fix/red-contract-shape-execution`, spec `docs/superpowers/specs/2026-08-15-spec-lint-intent-red-arms.md`). The edits here are additive (new union member, new call, new render row) and textually disjoint from the red-contract surfaces, but implementation ordering is the orchestrator's call per the batch brief; the plan flags it before its first task.

## 5. Guard conditions / accept-set discipline

- Everything outside each accept-set is IGNORED, never guessed at: a quantifier not in the closed set, a word-form cardinal, a universal in a table row or fenced block, a plan-kind doc — all out, silently. The arms are drift tripwires, not census tools.
- A doc with no qualifying structure produces zero findings and zero new inventory groups (opt-out by construction; always-on, advisory, structurally self-limiting — the prose-count-parity mechanics).
- The accept-sets are keyed on structure (quantifier token + digit cardinal + section topology), never on any enumeration of known-bad spellings — no denylist.

## 6. Verification

- **Unit (red first), per arm.** Fixtures derived from the measured corpus instances, each stating its expected finding count and code; gate-rejection fixtures each name the single gate they exercise so a gate deletion fails exactly its fixture. Arm A: the E1 line shape (FLAGS); same line with `rg` inline in its section (no flag — gate 5); cardinal appearing only in the claim's own section (no flag — gate 4); table-row form (no flag — gate 1); ISO-dated line (no flag — gate 1); fenced (no flag); word-form cardinal "all twenty-one sites" (no flag — accept-set, documented limit pinned); `all 37 sites (36 at plan time)`-style qualifier line (the 37 claim still qualifies; the 36, the qualifier's nearest predecessor, is excluded and is not a second claim — gate 3); "every 5 min" AND "every 5-min check" (no flag each — time-unit exclusion, both separators); a backticked "`applies to all 21 rows`" literal with 21 enumerated elsewhere (no flag — inline-span exclusion is the ONLY gate rejecting it, so deleting that gate fails exactly this fixture; R2 F3 replaced the earlier `Ignore all 1` fixture, which the value gate also rejected); "all 36 sites at plan time" (no flag — the qualifier's nearest predecessor IS the claim cardinal, so gate 3 alone silences it; deleting gate 3 yields one finding — R2 F3 replaced the mixed-line fixture as the gate-3 discriminator); the mixed line `all 37 sites (36 at plan time)` (one finding on the 37 claim — retained as the compound nearest-binding case, NOT as a single-gate discriminator); "all 0" (no flag — the value ≥ 2 check) and "all 2025" (no flag — the 3-digit width bound; the two halves of the value bound are separate mechanisms and each has its own fixture); plan-kind doc (no flag). Arm B: a doc with universals + an out-of-scope region + a closeout region asserts BOTH groups' exact line sets, including E4/E5-shaped fixtures (quoted from the defective revisions) landing in both groups; a depth-1 "close-out" TITLE fixture asserts NO `scope-fences` region (the R1 F2 depth bound); empty doc and plan-kind doc assert no groups.
- **Retro-probe regression:** a fixture carrying the E1 defective text verbatim (from `cc7942d4e:181`) draws exactly one `ENUMERATED_UNIVERSAL_NO_PROBE`; the corrected current-main form of that section (which cites the census) is a committed no-flag fixture.
- **Corpus regression:** the extended `spec:lint` over the live corpus emits no new HARD findings anywhere; the arc commits its layer-3 survivor listing and the §3.3 classification.
- **Self-application:** `pnpm spec:lint docs/superpowers/specs/2026-08-17-speclint-prose-consistency-arms.md` stays 0 hard.
- **Mutation enrolment precedes review:** the new universals module (§4) is enrolled in `tests/mutation/source/registry.ts` (the `specLintNumerics` row at `tests/mutation/source/registry.ts:964` is the template) with its suite under `tests/specLint/`, `pnpm mutation:guards` run before the first diff-review dispatch, and the score + empty unaccepted-survivor set stated in the round-1 brief (AGENTS.md convergence rule 4). The module is authored importable-with-referring-suite from the start, so it is enrollable by construction.

## 7. Documented limits

- **Truth is never evaluated.** E1's advisory fires because the claim stands away from its enumeration without a probe — it would fire identically on a TRUE universal in the same posture. That is the tripwire contract, and the single-source doctrine (`docs/agents/spec-self-review.md:14`) already calls the duplicate-statement posture itself the defect.
- **Unquantified universals (E3) are invisible** to both arms: no quantifier token, nothing lexical to anchor on. Covered by the human sweep and review; filed here, not repairable by widening (§1.1 narrowing rationale).
- **The closed quantifier set is the accept-set.** "entire", "none of", "always", "no … ever", and any synonym outside `Every|Each|All|Any|No|Never|Nothing` draw silence. A universal phrased to evade the set is outside the threat fence (§1.2).
- **Word-form cardinals are outside arm A.** "all twenty-one sites" is inventoried (clause-initial `All`), not advisory-flagged.
- **Populations of 0, 1, or ≥1000 are outside arm A's value bound** (2–999). A real four-digit enumerated population would be silent; every measured 4-digit read in the corpus was a year, and the corpus's enumerated populations are two- to three-digit.
- **Semantic contradiction between a closeout/scope line and another section (E4/E5's substance) is not decided mechanically.** The inventory surfaces the line; the sweep decides. This is the whole design, not a gap in it.
- **Within-doc only.** A universal contradicting another DOCUMENT (an AGENTS.md invariant, a sibling spec) is out of scope.
- **The bound is the live corpus, not English grammar.** A constructed sentence exercising a quantifier or clause shape no tracked doc uses is a documented limit, not a defect (the prose-count-parity fence, `docs/superpowers/specs/2026-08-10-speclint-prose-count-parity.md:69`).

## 8. Acceptance criteria

- **AC-1:** `ENUMERATED_UNIVERSAL_NO_PROBE` (advisory) lands in the new universals module (§4) with the §3.2 gate stack; `pnpm spec:lint` surfaces it on spec-kind docs.
- **AC-2:** The `universal-claims` and `scope-fences` inventory groups land and render through the existing `INVENTORY` block, text and `--json` both.
- **AC-3:** All §6 fixtures pass red-first, including the E1 retro-fixture and the E4/E5 inventory fixtures; the live-corpus run emits advisories only.
- **AC-4:** The layer-3 survivor listing + bounded classification are committed (gates frozen; copy and limits only).
- **AC-5:** The new universals module (§4) is ENROLLED in the source-mutation registry with `pnpm mutation:guards` run and the convergence criterion stated as the score plus an EMPTY unaccepted-survivor set.
- **AC-6:** `docs/agents/spec-self-review.md`'s sweep bullet names the inventory groups as the post-repair sweep's derived cover.
- **AC-7:** Both ledger rows graduate; markers off in the PR's last commit (invariant 12).

impeccable-gate: N/A — no UI surface
