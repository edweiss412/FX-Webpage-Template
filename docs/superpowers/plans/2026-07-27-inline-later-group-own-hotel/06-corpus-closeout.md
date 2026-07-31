# Task 6: Corpus close-out, BACKLOG add, full gates

**Files:**

- Modify: `tests/parser/hotelAmbiguityCorpusGolden.test.ts` — CONCRETE zero-delta enforcement for the two new codes (plan R1 finding 5): extend the `GOLDEN` type annotation at line 19 (line 18 is its doc comment — plan R3 f3) from `Record<string, { guest: number; address: number }>` to `Record<string, { guest: number; address: number; own: number; suspected: number }>` (plan R2 f5), add a guard `it()` asserting both code literals are members of `WARNING_CARD_COPY_CODES` (a misspelled filter literal then fails membership instead of silently counting zero — plan R3 f1), and extend `countsFor` (lines 44-51) with `own: agg.warnings.filter((w) => w.code === "HOTEL_INLINE_GROUP_OWN_HOTEL").length` and `suspected: agg.warnings.filter((w) => w.code === "HOTEL_INLINE_GROUP_HOTEL_SUSPECTED").length`; every GOLDEN row gains `own: 0, suspected: 0` (BOTH fixture families — raw AND exporter-xlsx, so an erroneous new code on `consultants.md` fails); the totals test asserts the new sums are 0/0 alongside guest 9 / address 0
- Modify: `BACKLOG.md` — ADD `BL-CARD-COPY-HELPFULCONTEXT-PARITY` recording the pre-existing §4.2↔catalog helpfulContext divergence for `HOTEL_GUEST_SPLIT_AMBIGUOUS` (verified 2026-07-30; shipped copy, out of this feature's scope — spec row v/R57). (The DELETE of `BL-PARSER-INLINE-LATER-GROUP-OWN-HOTEL` already landed in Task 4's commit per spec §6.2; the parent-spec §3.1 row-7 pointer already landed in Task 2's behavior commit per the feature spec's line-200 requirement — NEITHER recurs here.)

## Steps

- [ ] **Step 1: Corpus golden extension with a DEMONSTRATED red (plan R3 f1)** — apply the annotation + membership-guard + `countsFor` + GOLDEN-row edits; then temporarily set the consultants row to `suspected: 1`, run `pnpm vitest run tests/parser/hotelAmbiguityCorpusGolden.test.ts`, and observe the exact `0 !== 1` failure (proves the new filter path is live and counting real emissions); revert to `suspected: 0`, re-run, expected: PASS (zero corpus deltas per spec §9 — the only multi-marker fixture cell is consultants' tier-3 `Eric Weiss` tail). If ANY fixture emits a new code on the reverted run, STOP — that contradicts §9 and the spec's corpus re-probe; investigate before proceeding.
- [ ] **Step 2: BACKLOG add** — write the `BL-CARD-COPY-HELPFULCONTEXT-PARITY` entry; `npx prettier --write BACKLOG.md`.
- [ ] **Step 3: FULL gates (feature spec §8.5 verbatim)** — `pnpm typecheck && pnpm lint && pnpm format:check && pnpm vitest run && pnpm spec:lint docs/superpowers/specs/parser/2026-07-27-inline-later-group-own-hotel-design.md` — all green / 0 hard. (Do NOT start mutation-harness runs; `pgrep -f "vitest run --project mutation"` is not ours to trigger — sibling-session constraint.)
- [ ] **Step 4: Commits (staging split explicit)** —
  - `git add tests/parser/hotelAmbiguityCorpusGolden.test.ts && git commit -m "test(parser): pin zero corpus emissions for HOTEL_INLINE_GROUP_* codes"`
  - `git add BACKLOG.md && git commit -m "chore: file BL-CARD-COPY-HELPFULCONTEXT-PARITY"`

## After Task 6 (pipeline close-out, from 00-overview Task 7)

Whole-diff Codex review (fresh out dir, REVIEWER ONLY, split tight-scope briefs if the diff is large — AGENTS.md default for big diffs), repair rounds to APPROVE, push, REAL CI green, `gh pr merge --merge`, fast-forward main and verify `git rev-list --left-right --count main...origin/main` = `0 0`, then Stage 4.4 cleanup (CronDelete nudge job, clear herdr pane, marker stage "done").
