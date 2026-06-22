# 2026-06-21 — Crew desktop wasted-space pass: UI quality gate dispositions (AGENTS.md invariant 8)

Committed disposition record for branch `feat/today-densify-cards` (PR #51), which changes UI under `components/crew/**` and `DESIGN.md`. Per invariant 8, these surfaces ship only after `/impeccable critique` **and** `/impeccable audit` pass, with HIGH/CRITICAL findings fixed or explicitly deferred, dispositions recorded here.

**External-attestation note** (per the project's "dual-gate external attestation" rule): the critique + audit were run as **fresh-subagent reviews** (independent agents, not the implementer self-attesting), each loaded with PRODUCT.md + DESIGN.md context and the impeccable design laws. Each finding below was either fixed in the branch or dispositioned. **No HIGH or CRITICAL findings. No deferrals (DEFERRED.md not required).**

## Commit 1 — `feat(crew-page): densify Today cards on desktop` (key-times row + 2-up Tonight)

Gate verdicts: **critique (UX)** APPROVE_WITH_NITS · **audit (a11y/responsive/semantics)** APPROVE (clean) · **correctness** APPROVE (clean).

| # | Sev | Finding | Disposition |
|---|-----|---------|-------------|
| 1 | MEDIUM | Where card `columns={2}` stranded "Loading dock" half-width with a wrapped eyebrow (re-created the gap); Where has no pairable short fields | **FIXED** — Where reverted to single-column; only Tonight (which genuinely pairs Check in / Check out) keeps `columns={2}` |
| 2 | LOW | Bare Mode A key-times strip would spread a 2-anchor day 50/50 across the full page width | **FIXED** — `layout="row"` kept only on the carded Mode B strip; the bare Mode A strip stays the default stack |
| 3 | NIT | equal-width doc claim / stale `break-words` comment | **FIXED / N/A** — value span uses canonical `wrap-break-word`; comment matches code |

Real-browser (Chromium, compiled Tailwind): at 1000px the 3 key-times anchors share a row and Tonight's dates sit side-by-side; at 390px both collapse to the prior full-width stack (e2e `inv6` label/value alignment, mobile-only, unaffected).

## Commit 2 — `feat(crew-page): natural-height split-wide sections` (items-start)

Gate verdicts: **critique (UX)** APPROVE · **audit (contracts/spec-coherence)** APPROVE_WITH_NITS · **correctness** APPROVE (clean).

| # | Sev | Finding | Disposition |
|---|-----|---------|-------------|
| 1 | LOW | Phase-1 design doc still asserted Crew equal-height; omitted from the new amendment's Supersedes list | **FIXED** — `2026-06-15-…-phase1-design.md` Dimensional Invariant #2 marked SUPERSEDED; added to the 2026-06-21 Supersedes enumeration |
| 2 | NIT | `TOL_TIGHT` JSDoc still said "equal-height" after the assertion was dropped | **FIXED** — comment retitled to stack-edge / overflow / ratio tolerance |
| 3 | NIT | tall-right (Venue/Travel) geometry verified by CSS symmetry + Mode B precedent, not a captured screenshot | **ACCEPTED as-is** — `items-start` is symmetric in the cross-axis; no code change required (reviewer concurred) |

Real-browser (Chromium, compiled Tailwind): a short right card measuring 321px stretched (items-stretch) measures 127px natural (items-start); 1.6 ratio (667/417) + side-by-side preserved; 390px stacks.

## Cross-model adversarial review (Codex)

- Commit 1 diff — **APPROVE**, no material findings.
- Commit 2 diff, round 1 — **needs-attention**: the e2e gate dropped equal-height without a positive check, so a regression back to stretch would pass on ratio + side-by-side alone. **FIXED** — added real-browser `getComputedStyle(grid).alignItems === "start"` assertions to `assertSplitWide` (Schedule/Crew/Venue/Travel) + the Today Mode A and Mode B tests (Chromium tokens verified: items-start→start, items-stretch→stretch, unset→normal).
- Round 2 — **needs-attention**: this committed invariant-8 disposition record was missing. **FIXED** by this document.

## Verification commands

`pnpm typecheck` clean · `pnpm exec eslint` clean on changed files (lone pre-existing `showId` warning at `crew-page.spec.ts:1148`, unrelated) · `pnpm vitest run tests/components/crew tests/components/tiles` green. The split-wide e2e geometry assertions run in CI (the seed + dev server are CI-only; not locally runnable in this worktree).
