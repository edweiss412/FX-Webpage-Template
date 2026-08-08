# Round-economy followups: filing promotions + boundary-advisory repair

**Date:** 2026-08-07. **Branch:** `feat/round-economy-followups`. **Status:** draft.

Two work items surfaced by the first full `pnpm review:economy` run over the live corpus
(13 arcs, 15/17 trigger rate). Both are followups to shipped arcs; neither closes a
`BL-`/`DEF-` ledger entry (`pnpm ledger:claims` run at Stage 0: the only live claims are
`BL-CODEX-GUARD-COMMONMARK-PARSE` and `BL-PLAN-SNIPPET-FENCE-GATE`, both held by
`feat/review-infra-gates`, neither in scope here).

- **W1 — promote filing-nominated checklist rows into `docs/agents/`.** Six merged-arc
  filings under `docs/review-rounds/` nominate durable rules ("worth a docs/agents
  checklist row") that exist nowhere outside the filing that named them.
- **W2 — repair the adoption-boundary advisory in `scripts/review-economy.ts`.** It
  currently prints `so the boundary is wrong` on every live run, and the boundary is not
  wrong — the corpus rows that trigger it were legitimately written on the adoption arc's
  own branch before its merge.

## §1 Scope

In scope: edits to `docs/agents/writing-plans.md`, `docs/agents/spec-self-review.md`, one
sentence in `AGENTS.md` (class-sweep bullet), the advisory computation in
`scripts/review-economy.ts`, its tests in `tests/reviewRounds/report.test.ts`, and the
matching amendment to `docs/superpowers/specs/ci/2026-08-04-review-round-economy.md`
(§9 advisory paragraph + §11.3 test list). Plus the `docs/superpowers/specs/ci/README.md`
index row for this spec.

Out of scope: any change to silent-arc classification, `preAdoptionMergeCount`, the
filing threshold, `mergedArcs` recognition, or the corpus row schema.

### §1.1 Resolved scope — do not relitigate

1. **The adoption boundary stays DECLARED, not corpus-derived.** Ratified in
   `docs/superpowers/specs/ci/2026-08-04-review-round-economy.md` §9 ("The boundary is a
   DECLARED constant") with both silent-wrongness modes of a derived boundary pinned by
   tests (`tests/reviewRounds/report.test.ts`, the two cases under the comment "pass
   TRIVIALLY under a boundary derived from the corpus"). W2 changes which rows the
   ADVISORY consults, never how the boundary is obtained (`adoptionBoundary` in
   `lib/reviewRounds/constants.ts` is untouched).
2. **The advisory stays informational.** The report "gates nothing, exit 0 always except
   on its own usage error" (`scripts/review-economy.ts`, CLI section comment). W2 does not
   add an exit code, a CI gate, or a threshold.
3. **The `spec:lint` sweep↔disposition set-difference arm is deliberately NOT filed.**
   Its own filing (`docs/review-rounds/docs/l-wave-spec/a8b3a4128a10.md`, plan section)
   declines it pending a second instance per the ledger filing bar. Nominating it here
   would override that recorded decision; this spec records the decline instead.
4. **`BL-CODEX-GUARD-COMMONMARK-PARSE` is untouched** — claimed by the live branch
   `feat/review-infra-gates` (invariant 12 claim check, Stage 0).
5. **Rule-count discipline.** `docs/agents/spec-self-review.md` (accept-set bullet)
   records the measured failure mode of this corpus: rules exist and go unapplied, so
   "adding a 123rd rule … buys nothing." W1 therefore extends EXISTING bullets wherever
   one already owns the shape, and adds a new bullet only where no bullet does. Each
   promotion below names its integration point; reviewers should challenge a promotion
   that could have been a clause on an existing rule, not the decision to keep the count
   low.
6. **Filings are the evidence base, not re-derived.** Each promotion cites its filing
   under `docs/review-rounds/`. The filings' own probe evidence (mutant tables, round
   tables) is not re-verified here; a filing committed with a merged arc is the record.

## §2 W1 — promotions into `docs/agents/`

Every row below is a nomination made explicitly by a committed filing. Wording lands as a
clause or bullet in the named target; exact prose is the implementer's (subject to the
integration-point constraint), but each MUST cite its source filing path inline so the
rule stays traceable to its evidence.

| # | Target | Action | Substance | Source filing |
| --- | --- | --- | --- | --- |
| P1 | `docs/agents/writing-plans.md`, anti-tautology bullet | new sub-bullet | **Four pre-dispatch mutants for string-presence guards.** Before dispatching review of any test asserting "this string appears in this output," run: (a) empty value, (b) expected content plus a suffix, (c) content present but not live (commented out, escaped, in an attribute), (d) each discriminating parameter of the function under test. Record each result in the commit. Four rounds on `feat/l-wave-push` were all test-side escapes these four mutants find in minutes. | `docs/review-rounds/feat/l-wave-push/a0e41551c059.md` |
| P2 | `docs/agents/writing-plans.md`, new bullet (handoff/closeout text shapes) | new bullet | **Three one-line lint shapes over HANDOFF/plan text**, all caught only by review across the arc-A/B/C batch — final-diff ordering in two arcs independently, the other two once each (gate-grep precision is arc B's second distinct HANDOFF-text defect class instance): (i) *review covers what merges* — the diff the final review round examined must be the diff that merges (final-diff ordering); (ii) *handoff gate checks read anchored state from origin*, never from bounded log output (`git log -N` can truncate past the fact being asserted); (iii) *gate-grep precision* — a handoff's "grep proves the gate ran" command must match only the gate's own output shape. | `docs/review-rounds/docs/arc-c-spec/a0e41551c059.md` (plan §), `docs/review-rounds/docs/arc-b-spec/a0e41551c059.md` (plan §) |
| P3 | `docs/agents/writing-plans.md`, anti-tautology bullet | new sub-bullet | **RED validity.** For every planned RED step, name the production line whose absence/defect makes it fail. A RED whose failure derives from a test-local fixture is invalid by construction. | `docs/review-rounds/docs/arc-a-spec/a0e41551c059.md` (plan §) |
| P4 | `docs/agents/writing-plans.md`, "Reconciliation/closeout sweeps" bullet | extend | **Registry count reconciliation.** When a plan adds/removes rows in a registry-bearing meta-suite, the plan body includes the mechanical diff of the registry arrays against the tasks' stated additions/removals — same authored-AND-run posture as the sweep rule this extends. | `docs/review-rounds/docs/arc-a-spec/a0e41551c059.md` (plan §) |
| P5 | `docs/agents/spec-self-review.md`, live-code-citation bullet | extend | **Render-path enumeration.** For every component the spec claims emits (or must not emit) a protected data class, enumerate every render path of that component that can emit it — not only the cited lines. The arc-A citation pass read the named sites and missed a raw fallback path; the filing estimates this one step would have cut R1 from 9 findings to ~3. | `docs/review-rounds/docs/arc-a-spec/a0e41551c059.md` (spec §) |
| P6 | `docs/agents/spec-self-review.md`, probe-before-argue bullet | extend | **Probe scripts get their own mini-review.** A probe script whose output feeds a spec's calibration table is itself a spec input: review it (iteration bounds, truncation, declared-vs-imported counts) before quoting its output as fact. Arc B shipped a declared-vs-imported iteration bug and a truncation in a probe the spec then cited. | `docs/review-rounds/docs/arc-b-spec/a0e41551c059.md` (spec §) |
| P7 | `docs/agents/writing-plans.md`, new bullet (repair economy for recognizer/guard surfaces) | new bullet | **Repair economy.** Condensed from the two arcs that measured it, as the function-grain companion to the existing same-vector-recurrence and structural-defense-calibration bullets (it must cross-reference both, not restate them): (1) a recognizer bounded by a NUMBER (cap, position, backreference) will be found by the next reviewer — derive the bound from the input instead; (2) a key that can ALIAS is not a clock — recency wants a monotonic ordinal, not a session/attempt id; (3) when consecutive rounds keep landing on ONE FUNCTION (the filing measured four), the mechanism is answering the wrong question — the comprehensive re-analysis the same-vector rule already mandates should ask "what question does this function need to answer?" and prefer deleting or deriving the mechanism over widening it (the codex-guard emphasis parser: deleted, −71 lines, all four rounds' shapes unreachable); (4) a scanner's claims are planted as executable self-test shapes (positive AND negative) in the same commit as any widening — widenings without self-tests are the rounds that came back. Site-list derivation is NOT restated here — it lands once, in the class-sweep bullet (P9). | `docs/review-rounds/feat/review-round-economy/48b280b949cc.md`, `docs/review-rounds/feat/m-wave-ui/fc4902004b78.md` |
| P8 | `docs/agents/writing-plans.md`, "Fix-round regression budget" bullet | extend | **The repair's own tidy-up is a defect site.** Two of m-wave's sharpest findings were in repairs, not originals (`empty:hidden` re-hid a region the fix exposed; a channel migration left the old speaker in place, duplicating speech). The next-round re-grep this bullet already mandates must cover the repair commit's incidental edits, not only the patched class. | `docs/review-rounds/feat/m-wave-ui/fc4902004b78.md` |
| P9 | `AGENTS.md`, "Class-sweep before patching" bullet | extend, one sentence | **Sweep to a derivation, not a longer list.** A sweep verified by enumeration re-opens the moment someone adds a site; the sweep's output is a derived cover (registry asserted against the scanner, field list derived from the fixture, filesystem walk), which is what "class-sweep" means in practice. The filing measured the enumerated form failing three consecutive rounds on the arc that cites the rule. This is the ONLY place the derivation lesson lands (P7 cross-references it). | `docs/review-rounds/feat/review-round-economy/48b280b949cc.md` (rule 3) |
| P10 | `docs/agents/writing-plans.md`, guard-premise sub-bullet of the anti-tautology rule | extend | **A premise that validates something ADJACENT to the case is not a premise.** The condition must be proven on the case's OWN inputs: m-wave's freshness probe suite asserted "a venue edit paints" and then ran six cases whose own mutations were never checked — a mis-pathed pair produced identical renders reported as PASS. Each case must prove its own inputs differ in the adapted data. | `docs/review-rounds/feat/m-wave-ui/fc4902004b78.md` (rule 2) |

**Explicitly not promoted** (each with reason, so review does not re-nominate):

- Arc B spec filing (a) — AC/limits-ledger drift: filing itself says "the misses were
  non-compliance, not rule gaps"; the numeric/self-consistency sweeps already mandate the
  check. No text change.
- Arc C spec filing — run the guard-premise check against the DRAFTED test design
  pre-dispatch: the filing itself says the rule "is already codified in writing-plans —
  the miss was not running that check"; promoting it would violate §1.1.5
  (non-compliance, not a rule gap).
- l-wave-spec filing (a)/(b) — stale-count drift (rule exists, compliance failure) and
  the em-dash census (mechanized by the shipped W-EMDASH guard itself).
- l-wave-spec plan filing — sweep↔disposition `spec:lint` arm: declined per §1.1.3.
- `feat/review-round-economy` rules 1-2 already produced code-side fixes on main
  (`scripts/codex-guard.mjs` intraword rule; ordinal clock); P7 carries their durable
  statement.

## §3 W2 — boundary-advisory repair

### Current behavior (cited)

`scripts/review-economy.ts` (near the return of `buildReport`): `earliest` is the minimum
`startedAt` over ALL corpus rows; when `earliest < boundary` the report prints

> `ADVISORY: the earliest recorded row (…) precedes the declared adoption boundary (…), so the boundary is wrong.`

`adoptionBoundary` (`lib/reviewRounds/constants.ts`, function `adoptionBoundary`) resolves
to the committer date of the first-parent merge that added `lib/reviewRounds/constants.ts`
to `main` — measured live: `cae50beb0` (PR #711), `2026-08-05T08:44:18-05:00`.

### Why it misfires

The wrapper started writing rows on the adoption BRANCH hours before that branch merged:
earliest live row `2026-08-05T05:37:09.244Z` belongs to arc
(`feat/review-round-economy`, `20fccb1f3331`). The 2026-08-04 spec's §9 advisory
rationale ("a corpus whose earliest row precedes ADOPTION_BOUNDARY means the constant is
wrong") did not model the adoption arc's own pre-merge rows — the same arc §12 of that
spec declares pre-adoption by construction. The contract cannot oblige rows written
before it went live, and those rows cannot indict the constant. The current message
states a falsehood on every run, which is the "known-wrong number in an operator-facing
message" class the economy system itself exists to close.

### Repaired behavior

1. **Chronological comparison, never lexical — at EVERY comparison site.** The current
   code selects `earliest` by LEXICAL sort of `startedAt` strings and only then parses
   the selected value. Valid ISO-8601 timestamps with non-Z offsets order differently
   lexically than chronologically — so a genuinely pre-boundary row can lose the lexical
   sort to a chronologically-later string and silently suppress the advisory. Repaired:
   all comparisons in this section — earliest selection, row-vs-boundary, the exclusion
   rule's `mergedAt <= boundary` classification, and its `startedAt <= mergedAt` time
   cap — operate on parsed values (each string parsed once). The two merge-side sites
   are each pinned by their own §4 case, since a lexical mutant at either silently
   changes the advisory only under offset-bearing values.
2. **`startedAt` is placeable only inside an explicit accept-set; everything else is
   signaled.** The row schema (`lib/reviewRounds/row.ts`, `startedAt` field) accepts
   `null` or any string, and bare `Date.parse` is NOT a sufficient placement test:
   a timezone-less string parses host-dependently (probe: `2026-08-31T23:00:00` against
   the boundary `2026-09-01T00:00:00.000Z` parses PRE-boundary under `TZ=UTC` and
   POST-boundary under `TZ=America/New_York`, where local 23:00 EDT is 03:00Z the next
   day — the same accepted row silently flips the advisory by environment), and an
   invalid calendar date is silently normalized (`2026-02-30T00:00:00.000Z` parses to
   Mar 2). Repaired with an accept-set keyed on structure: a `startedAt` is PLACEABLE
   iff ALL THREE hold:
   (a) it matches
   `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-](?:0\d|1[0-3]):[0-5]\d|[+-]14:00)$`
   — explicit offset (environment-independence), offset hour/minute bounded to the real
   range (an unbounded `[+-]\d{2}:\d{2}` admits `+24:00`/`+00:60`, which `Date.parse`
   maps to NaN AFTER the structural test has said "placeable" — every comparison then
   returns false with no note, silent invisibility), and fractional seconds capped at
   milliseconds (ECMAScript compares at millisecond precision, so `.0001` past a
   `.000` merge parses EQUAL and a chronologically-later row silently slips inside the
   exclusion cap);
   (b) its date/time fields are calendar-valid (month 01-12, day within that month
   including leap years, hour ≤ 23, minute/second ≤ 59);
   (c) `Date.parse` of it is finite — a safety net making "placeable implies
   comparable" true BY CONSTRUCTION rather than by enumerating parser quirks: any
   residual string the parser cannot place falls to the note, never into a comparison.
   Everything else — `null`, timezone-less, calendar-invalid, out-of-range offsets,
   over-precise fractions, arbitrary strings — is excluded from the advisory
   computation AND counted in a note whenever any exist: `N row(s) without a placeable
   startedAt are invisible to the boundary advisory.` The live corpus is 100% inside
   the accept-set (the wrapper writes `toISOString()`; swept 89/89 canonical at
   `c284aa32b`, reproduced by review round 2). `mergedAt` needs no accept-set: it comes
   from `git log --format=%cI` (`lib/reviewRounds/mergedArcs.ts`), which always carries
   an explicit offset for a reachable commit — recorded as §5 limit 4, not guarded —
   but its comparisons are still chronological per 1.
3. **Exclusion rule.** A row is EXCLUDED from the advisory's `earliest` computation when
   a recognized merge exists with the same `branch` and `mergedAt <= boundary`
   (pre-adoption under the existing `<=` carve-out) and the row's
   `startedAt <= that merge's mergedAt` (parsed values, per 1). Join is on
   **branch + time**, deliberately NOT on `arcKey(branch, baseSha)`: `mergedArcs`
   derives `baseSha` as the merge-base of the merge's two parents
   (`lib/reviewRounds/mergedArcs.ts`, `merge-base` call), so a split arc's earlier
   segments (the live case: `20fccb1f3331` vs recognized `48b280b949cc`) can never match
   an exact key. Time cap included so post-merge rows on a reused branch name still
   count (§5 limit 1 covers the residual looseness). Several pre-adoption merges of one
   branch use the latest `mergedAt`.
4. **Advisory text drops the verdict.** When it still fires, the line reads:
   `ADVISORY: the earliest recorded row (…) from an arc with no pre-adoption merge precedes the declared adoption boundary (…) — the boundary or the row's arc attribution is wrong.`
   The report states the observation and the two possible causes; it no longer asserts
   which.
5. **Shallow clone / merge-scan refusal withholds the advisory.** The exclusion needs the
   merge classification; under `merges.shallow` the advisory is `null` and the existing
   shallow-refusal note covers it (extend that note with "; the boundary advisory is
   withheld for the same reason"). A `boundary === null` (not-yet-adopted) run already
   prints its own note and produces no advisory — unchanged.
6. **Result on the live corpus:** `pnpm review:economy` prints no ADVISORY line, because
   every pre-boundary row belongs to `feat/review-round-economy` whose one recognized
   merge (`cae50beb0`) is pre-adoption by the `<=` carve-out and postdates every such
   row. This is AC-W2.12 and is verified against the real repo, not only fixtures.

### Spec amendment (same PR)

`docs/superpowers/specs/ci/2026-08-04-review-round-economy.md`: amend the §9 advisory
paragraph (the one ending "cannot be checked against anything") to state the exclusion
rule and the two-cause wording, and add the new test shapes to the §11.3 list (item 8).
Mark the amendment inline with a dated note, matching that spec's existing amendment
style. `docs/superpowers/specs/ci/README.md` gains this spec's index row.

## §4 Test plan (RED shapes, `tests/reviewRounds/report.test.ts`)

Existing advisory/boundary tests stay green except the reworded-message assertion, which
updates with the wording. New cases, each naming the production line that fails it before
the fix:

1. **Split-arc segment exclusion (the live defect).** Corpus row with
   `startedAt < BOUNDARY` on branch B; recognized merge for B with a DIFFERENT `baseSha`
   and `mergedAt = BOUNDARY`. Expect `boundaryAdvisory === null`. Fails today because
   `earliest` consults all rows.
2. **Advisory preserved for a truly unexplained row.** Row predating BOUNDARY on a branch
   with NO recognized merge. Expect advisory fires with the two-cause wording.
3. **Post-merge reuse still counts.** Row predating BOUNDARY on branch B,
   `startedAt > mergedAt` of B's pre-adoption merge. Expect advisory fires (the time cap
   is load-bearing; this is its premise stated executably).
4. **Post-adoption merge does not launder.** Row predating BOUNDARY on branch C whose
   only recognized merge has `mergedAt > BOUNDARY`. Expect advisory fires — only
   pre-adoption merges explain pre-boundary rows.
5. **Shallow withholds an advisory that WOULD fire.** The corpus contains a pre-boundary
   row on a branch with no recognized merge — the premise pair: the same corpus run
   non-shallow asserts `boundaryAdvisory !== null` first, so the case cannot pass on an
   empty-corpus trivial null (the existing shallow fixture at
   `tests/reviewRounds/report.test.ts:627` has no rows, and `boundaryAdvisory` is
   already null there without any withholding logic). Then the shallow run over the same
   corpus asserts `boundaryAdvisory === null` AND the refusal note names the advisory
   withholding.
6. **Chronological, not lexical, earliest.** Two rows on a no-merge branch:
   `2026-08-31T23:30:00-02:00` (chronologically 2026-09-01T01:30Z, POST-boundary
   lexically-smallest) and `2026-09-01T01:00:00+02:00` (chronologically
   2026-08-31T23:00Z, PRE-boundary lexically-larger), with `BOUNDARY =
   2026-09-01T00:00:00.000Z`. Expect advisory fires naming the second row, AND the
   non-placeable-rows note is ABSENT (pins the note's only-when-any-exist conditional).
   Fails today: the lexical sort selects the first string, `Date.parse` puts it past the
   boundary, and the advisory is silently suppressed (reviewer probe, round 1).
7. **Non-placeable `startedAt` is signaled.** One row with `startedAt: "not-a-date"` and
   one with `startedAt: null`, plus one placeable post-boundary row. Expect
   `boundaryAdvisory === null` (nothing placeable precedes the boundary) AND the notes
   include the `2 row(s) without a placeable startedAt` count. Fails today: NaN
   comparisons return false and `null` is filtered, both silently.
8. **The accept-set's four rejection families are each signaled.** Four pre-boundary-
   looking rows — timezone-less `"2026-08-31T23:00:00"` (host-dependent: pre-boundary
   under `TZ=UTC`, post-boundary under `TZ=America/New_York`), calendar-invalid
   `"2026-02-30T00:00:00.000Z"` (silently normalizes to Mar 2), out-of-range offset
   `"2026-08-31T12:00:00+24:00"` (structurally plausible, `Date.parse` NaN), and
   over-precise `"2026-08-31T12:00:00.0001Z"` (sub-millisecond digits silently
   discarded) — plus one placeable post-boundary row. Expect `boundaryAdvisory === null`
   and the `4 row(s) without a placeable startedAt` note. Fails under a bare
   `Date.parse` accept-test on the first two (reviewer probes, rounds 2-3) and under
   the round-2 unbounded regex on the last two (reviewer probes, round 3).
9. **Latest pre-adoption merge caps a multi-merge branch.** Branch B with TWO recognized
   pre-adoption merges (`mergedAt` = BOUNDARY minus 3 days and BOUNDARY minus 1 day);
   one row between them (`startedAt` = BOUNDARY minus 2 days). Expect
   `boundaryAdvisory === null` — the LATEST merge caps the exclusion. An oldest-only
   mutant fires the advisory (reviewer probe, round 2; the live history holds four
   reused-branch instances, e.g. `feat/attention-alert-routing` ×3).
10. **Pre-adoption classification is chronological.** Merge with
    `mergedAt: "2026-09-01T01:00:00+02:00"` (chronologically 2026-08-31T23:00Z, PRE-
    boundary; lexically GREATER than the boundary string) and a same-branch row at
    `startedAt: "2026-08-31T22:00:00Z"`. Expect `boundaryAdvisory === null` (merge
    classifies pre-adoption, row excluded). A lexical mutant at `mergedAt <= boundary`
    classifies the merge post-adoption and fires the advisory.
11. **The time cap is chronological.** Merge with
    `mergedAt: "2026-08-31T20:00:00-02:00"` (chronologically 2026-08-31T22:00Z, pre-
    boundary) and a same-branch row at `startedAt: "2026-08-31T21:00:00Z"`
    (chronologically BEFORE the merge; lexically GREATER than its string). Expect
    `boundaryAdvisory === null` (row inside the cap). A lexical mutant at
    `startedAt <= mergedAt` places the row outside the cap and fires the advisory.

Anti-tautology compliance: each case's fixture varies exactly the field under test
(baseSha mismatch in 1, absent merge in 2, times in 3/4/6/9/10/11, placeability in 7/8),
case 1's row uses a `baseSha` distinct from the merge's so the test cannot pass via an
arcKey join the spec forbids, and case 5 carries its premise pair executably. Cases
6/10/11 use offset-bearing values whose lexical and chronological orders DISAGREE, so a
lexical mutant at any of the three comparison sites fails its case. Per P1 (this spec
eats its own cooking), the four string-presence mutants apply to the advisory-wording
and notes assertions and their results land in the implementation commit.

## §5 Documented limits

1. **Branch-name reuse can launder a pre-boundary row.** A row from an OLDER arc reusing
   branch B, written before B's pre-adoption merge, is excluded even though it belongs to
   a different arc. Advisory-grade acceptable: the advisory is informational (§1.1.2),
   the corpus join for counting stays on `(branch, baseSha)`, and the failure direction
   is a suppressed advisory line, never a wrong count. Surfaced here rather than guarded.
2. **Unrecognized merges cannot explain rows.** A pre-boundary row whose arc merged under
   an unrecognized subject fires the advisory; the unrecognized-merge list is printed
   beside it, which is the §8.2-honest shape (observation plus the reason it may be
   incomplete).
3. **The advisory still cannot verify the constant.** It cross-checks the boundary
   against the corpus and the merge scan; agreement is not proof. Unchanged from the
   2026-08-04 spec's posture.
4. **`mergedAt` is trusted.** It is produced by `git log --format=%cI` over reachable
   commits (`lib/reviewRounds/mergedArcs.ts`) and is not re-validated; a repo whose git
   emits unparseable committer dates is outside the threat fence.

## §6 Acceptance criteria

- AC-W1.1: every P-row lands in its named target file with its filing citation inline;
  no other `docs/agents/` rule is reworded beyond the named integration points.
- AC-W1.2: `AGENTS.md` class-sweep bullet gains exactly one sentence (P9).
- AC-W2.1–W2.11: the eleven §4 cases pass, numbered in order (AC-W2.n = §4 case n).
- AC-W2.12: `pnpm review:economy` on the live repo prints no ADVISORY line and its other
  sections are byte-identical to before the change (verified by running both and
  diffing).
- AC-X.1: `pnpm spec:lint` on this spec and the plan is attached to every review
  dispatch; the 2026-08-04 spec amendment carries its dated note.
- AC-X.2: full pre-push gates (`pnpm test`, typecheck both configs, eslint,
  `format:check`) green in the worktree.

## §7 Review-brief bounds (for the dispatches on this spec/plan/diff)

Consequence bound: every corpus/merge input either computes the advisory correctly or
withholds it with a printed reason — a suppressed advisory plus the unrecognized-merge
list is a DOCUMENTED LIMIT (§5), not a finding. Threat model: accidental authoring
mistakes by ordinary contributors and ordinary repo states (shallow clones, split arcs,
reused branch names); adversarial corpus construction is out of scope and files to
limits. Findings about current behavior are settled by probe (run the report / the test),
per the round-economy admissibility contract.
