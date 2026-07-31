# Task 6: Corpus close-out, parent-spec pointer, BACKLOG

**Files:**
- Modify (test re-assert only): corpus golden tests — re-run and confirm ZERO deltas (guest cards 9, consultants 1, address cards 0, new-code cards 0 — spec §9; the only multi-marker fixture cell is consultants' tier-3 `Eric Weiss` tail)
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §3.1 row 7 — the ratified 7a/7b amendment pointer to the feature spec (spec §5 wording verbatim)
- Modify: `lib/parser/blocks/hotels.ts:756-767` region comment — rewrite the "later groups inherit" comment to describe the detector routing (spec row m text)
- Modify: `BACKLOG.md` — DELETE the `BL-PARSER-INLINE-LATER-GROUP-OWN-HOTEL` entry (`:994-998` region; re-grep the heading line first); ADD `BL-CARD-COPY-HELPFULCONTEXT-PARITY` recording the pre-existing §4.2↔catalog helpfulContext divergence for `HOTEL_GUEST_SPLIT_AMBIGUOUS` (verified 2026-07-30; shipped copy, out of this feature's scope — spec row v/R57)

## Steps

- [ ] **Step 1: Corpus goldens** — `pnpm vitest run tests/parser` (goldens included); assert zero warning-card deltas. If any fixture emits a new code, STOP — that contradicts §9 and the spec's corpus re-probe; investigate before proceeding.
- [ ] **Step 2: Parent-spec §3.1 row 7 pointer** — apply spec §5's amendment text; `pnpm spec:lint docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` → 0 hard.
- [ ] **Step 3: hotels.ts comment rewrite** — `:756-767` region; `pnpm typecheck` (comment-only, but keep the gate).
- [ ] **Step 4: BACKLOG edits** — delete + add per above; `npx prettier --write BACKLOG.md`.
- [ ] **Step 5: FULL gates** — `pnpm typecheck && pnpm lint && pnpm format:check && pnpm vitest run` (whole unit suite) — all green. (Do NOT start mutation-harness runs; check `pgrep -f "vitest run --project mutation"` is not ours to trigger — sibling-session constraint.)
- [ ] **Step 6: Commits** —
  - `docs(parser): amend parent spec 3.1 row 7 pointer + rewrite hotels.ts inherit comment`
  - `chore: close BL-PARSER-INLINE-LATER-GROUP-OWN-HOTEL; file BL-CARD-COPY-HELPFULCONTEXT-PARITY`

## After Task 6 (pipeline close-out, from 00-overview Task 7)

Whole-diff Codex review (fresh out dir, REVIEWER ONLY, split tight-scope briefs if the diff is large — AGENTS.md default for big diffs), repair rounds to APPROVE, push, REAL CI green, `gh pr merge --merge`, fast-forward main and verify `git rev-list --left-right --count main...origin/main` = `0 0`, then Stage 4.4 cleanup (CronDelete nudge job, clear herdr pane, marker stage "done").
