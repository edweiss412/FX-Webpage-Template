# Task 5: Registration fan-out — spec §6.3 rows a–w, one commit

**Files (all edits in ONE commit — the three-lockstep + registries must land together):**
- Modify: master spec `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4 (+2 rows, helpfulContext appendix entries byte-identical to spec §7 C-OWN-5 / C-SUS-5) — row a
- Regenerate: `pnpm gen:spec-codes` → `lib/messages/__generated__/spec-codes.ts` — row b
- Modify: `lib/messages/catalog.ts` (+2 entries incl. C-OWN-6/C-SUS-6 longExplanation, C-OWN-10/C-SUS-10 helpHref) — row c (sibling region `:1383`)
- Regenerate: `pnpm gen:internal-code-enums` — row d
- Modify: `docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md` — §3.1 count 42→44 + sorted enumeration; §4.2 rows 43/44 (helpfulContext byte-identical C-OWN-5/C-SUS-5, triggerContext byte-identical C-OWN-4/C-SUS-4); §4.3 emitter inventory; line-60-region parser-emitter enumeration 29→31; grep-sweep every count-bearing literal (`grep -n "\b42\b\|\b29\b" <doc>` and reconcile each hit) — row v
- Modify: `tests/messages/warningCardCopyRegistry.ts` — codes set 42→44 (`:4`), `EXPECTED_TRIGGER_CONTEXT` +2 (`:49`), NEW `EXPECTED_HELPFUL_CONTEXT` map with both new codes' §4.2 strings, `EXPECTED_CORPUS_WARN_CODES` unchanged (`:127` — zero corpus hits, §9)
- Modify: `tests/messages/_metaWarningCardCopy.test.ts` — NEW byte-parity loop over `EXPECTED_HELPFUL_CONTEXT` beside the `triggerContext` loop (`:79` block) — row v (R57)
- Modify: `lib/parser/dataGaps.ts` — GAP_CLASSES +2 rows (C-OWN-9/C-SUS-9 labels, plural per `:72` note), `:29` comment "55-code"→"57-code" — rows e/g
- Modify: `tests/parser/dataGaps.test.ts` — 35→37 at `:43` (test name), `:44`, `:45`, `:157`; `:75` enumeration +2; `:83` total 5→7 — row n
- Modify: `tests/parser/dataGapsClassCompleteness.test.ts` — `:36` 35→37, `:68` "(55)"→"(57)", `:204` name → "total 57 (37/7/2/11)", `:205` 35→37, `:209` 55→57 — row o
- Modify: `tests/parser/_metaTransformSitesWalker.test.ts` — required list +2, five→eight at `:15`/`:42`/`:95` — rows k/l
- Modify: `lib/parser/ambiguityCodes.ts` + `tests/parser/ambiguityCodes.test.ts` — both codes added; `:16` "exactly the five"→"exactly the seven" — rows f/p
- Create/modify: copy tests in `tests/messages/` per the registry pattern asserting every §7 string verbatim (C-OWN-1..10, C-SUS-1..10 incl. the two null rows) — §8.4
- NEW oracle: `INTERNAL_CODE_ENUMS` membership for both codes with source `parse_warnings.code` (row j) — add to the envelope test file or a small `tests/parser/internalCodeEnums.test.ts` per the existing membership-oracle pattern
- Rows q–u and w: remaining registry rows per spec §6.3 verbatim (w = `OPERATOR_ACTIONABLE_ANCHORED`/`CELL_ANCHORED_CODES` N/A — no edit, declared)

**Failing-first discipline:** the count gates and copy meta-tests fail-by-default the moment rows a–d land without n/o/v edits (and vice versa) — run the full suite BEFORE editing (green), then apply ALL rows, then green again. The "failing test" for this task is the suite state mid-application; do not split the commit.

## Steps

- [ ] **Step 1: Re-run the banked sweeps verbatim** (00-overview "Pre-draft verification" section) and confirm hits still match; reconcile any drift first.
- [ ] **Step 2: Apply every row above.** Copy strings come from spec §7 byte-exact (C-OWN-5 = 294 chars; caps 300/160; banned-vocab list includes "structured" — run `pnpm vitest run tests/messages` to let the hygiene walkers verify).
- [ ] **Step 3: Regenerate** — `pnpm gen:spec-codes && pnpm gen:internal-code-enums`; confirm both diffs contain exactly the two new codes.
- [ ] **Step 4: Full gates** — `pnpm typecheck && pnpm vitest run tests/parser tests/messages tests/cross-cutting`. Expected: PASS (x1 catalog parity, count gates, walkers, card-copy fixtures all green).
- [ ] **Step 5: spec:lint both edited spec docs** — `pnpm spec:lint docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` and `pnpm spec:lint docs/superpowers/specs/2026-07-20-warning-card-copy-restore.md` → 0 hard each.
- [ ] **Step 6: Commit (single)** — `git commit -m "feat(parser): register HOTEL_INLINE_GROUP_* codes across catalog, gaps, walkers, card-copy registry"`
