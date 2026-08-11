# Plan: spec:lint prose-count parity arms

**Spec:** `docs/superpowers/specs/2026-08-10-speclint-prose-count-parity.md` (APPROVED, round 8, 0 findings) · **Branch:** `feat/speclint-prose-count-parity` · **Implementer:** Opus / Claude Code (tooling; no UI)

**Meta-test inventory (declared):** EXTENDS `tests/specLint/numerics.test.ts` (three new arms' fixtures) and the spec:lint adapter (`scripts/spec-lint.ts` — FileResolver plumbing per spec §2); ENROLLS the extended `lib/specLint/numerics.ts` in `tests/mutation/source/registry.ts` (spec AC-4). Advisory locks / Supabase / admin alerts / UI: none applies.

**Plan-time red transcript (run 2026-08-10, this worktree):** the three advisory codes are absent from the live tree (`grep -rn "SCRIPT_CONSTANT_PARITY\|SIBLING_LIST_CARDINALITY\|TEMPLATE_QUANTITY_DRIFT" lib/ scripts/` → no matches); `checkNumerics` takes no script-text argument (`lib/specLint/numerics.ts:32`); Task 3's negated entry-heading grep → exit 1 (entry present).

<!-- tasks: depth=2 -->

## Task 1 — The three arms (contract semantics) + FileResolver plumbing

<!-- task: red=`pnpm vitest run tests/specLint/numerics.test.ts` ac=AC-1,AC-2 -->

Red is written by this task, SUITE-FIRST (invariant-1 order): extend the fixture suite with every §6 case — shape (a) drifted-count flag / qualifier no-flag / dated-transcript no-flag / fence no-flag / the SYNTHETIC mixed line (37 compares under nearest-binding, 36 excluded) / noun-match rejections (4-re-runs, 18-files shapes); shape (b) motivating flag + per-gate rejection fixtures + ISO-line and per-number-qualifier no-flags; shape (c) block-repeat flag / path-differing no-flag / wedge NO-FLAG (documented limit) / denylist-absent flag / three-member all-pairs / exclusion triple — run it, OBSERVE red (the codes do not exist: the plan-time transcript above), THEN implement:

1. `checkNumerics` gains the optional `{path → text}` script-texts argument; `runLint` resolves same-line-named `scripts/` paths through the injected `FileResolver` (I/O stays in the adapter, `scripts/spec-lint.ts:1`); unresolvable paths skip silently.
2. Shape (a): `/^EXPECTED_[A-Z0-9_]+$/` module-local int consts, identifier-derived-noun match (strip prefix/`_TOTAL`/`_COUNT`, singularize), same-line association, per-number nearest-binding exclusion.
3. Shape (b): the measured gate ladder per the §3 predicate-provenance paragraph (adjacency pre-tier-0, nested-list-indentation gate, last-recognized-cardinality, stop-at-break final counter), the prototype's committed number-word list, the three-part line-based exclusions.
4. Shape (c): trimmed physical-line candidates 40-400 chars, numeral-inclusive ASCII-alphanumeric SET Jaccard ≥0.85, all-pairs within-doc, digit-only quantity extraction, numeric-diff gate, no denylist.
5. Boundary + reachability proofs (R1 F1): an adapter-level test drives `runLint` (not `checkNumerics` directly) through the injected FileResolver with a fixture doc naming a fixture script, proving the resolver plumbing end-to-end; and a BASENAME-mention fixture (script named without the `scripts/` prefix) flags, since every live mention is full-path and path-only recognition would otherwise pass all checks.
6. Green: suite passes; `pnpm spec:lint` on this plan and the spec stays 0 hard (self-application); the corpus regression per the executable enumeration below (R1 F2): `for f in $(git ls-files 'docs/**/*.md' BACKLOG.md DEFERRED.md); do pnpm spec:lint "$f"; done` with a wrapper asserting zero HARD findings and collecting every advisory of the three new codes into the committed survivor records; the classification commit carries a reconciliation count (emitted survivors == classified rows, diffed mechanically and pasted).

## Task 2 — Mutation enrollment + classifications

<!-- task: red=`pnpm mutation:guards` ac=AC-4,AC-3 -->

Red semantics (R1 F3 — a concrete failing case, not registry state): after adding the registry row, run the gate WITH A CONTROL MUTANT first — apply one declared operator by hand to `lib/specLint/numerics.ts` (e.g. invert the nearest-binding comparison), observe `pnpm mutation:guards` (or the referring suite) RED on that mutant, revert, then run the clean gate green with the recorded score and an EMPTY unaccepted-survivor set (survivors triaged: killed, `equivalent`, or `accepted-gap` rows, never silent). The control mutant is the observed red; any registry bookkeeping (e.g. an `EXPECTED_*` map key in `guardSurfaces.gate.test.ts`) is handled in the same step and is not the red.

1. Registry row in `tests/mutation/source/registry.ts` for `lib/specLint/numerics.ts` with `tests/specLint/numerics.test.ts` as the referring suite; run, triage, record.
2. Both survivor classifications (shape b + shape c, over the SHIPPED arms' populations) committed as measurement records; documented-limits/severity-copy updates only (gates frozen — spec §3).
3. Green: `pnpm mutation:guards` green with the recorded score; classifications committed.

## Task 3 — Graduation + merge sequence

<!-- task: red=`sh -c '! grep -q "^## BL-SPECLINT-PROSE-COUNT-PARITY" BACKLOG.md'` ac=AC-5 -->

Red now (plan-time transcript above); after the graduation content lands, RERUN the same negated grep and observe exit 0 (the green endpoint — R1 F4). PREPARE the graduation content UNCOMMITTED (archive move + `BACKLOG_GRADUATED` registry row + marker removal), include it in the whole-diff review's scope, and after APPROVE commit it as the PR's LAST commit. Completion checks: entry present in `BACKLOG-archive.md`, registry row present, `pnpm vitest run tests/docs` green. Then real CI green, `gh pr merge --merge`, fast-forward main, `0  0`.

<!-- tasks: end -->

## Acceptance criteria (crosswalk to the spec's §8)

- AC-1: three advisory codes land with the contract's gate stacks; surfaced through `pnpm spec:lint`.
- AC-2: all §6 fixtures pass red-first (wedge fixture asserts NO flag); live corpus emits advisories only.
- AC-3: both shipped-population classifications committed as measurement records.
- AC-4: `lib/specLint/numerics.ts` enrolled with score + empty unaccepted-survivor set.
- AC-5: entry graduates with the registry row.

impeccable-gate: N/A — no UI surface
