# unread-callout-dedup — impeccable dual-gate dispositions

Invariant-8 record for the standalone `/ship-feature` change (no milestone handoff doc exists; this file is the handoff-record equivalent). Mirrored in the PR body.

## Impeccable `critique` (dual-agent: A design review, B detector)

- **Assessment B (detector `detect.mjs`):** 1 finding — `broken-image` at `components/admin/wizard/step3ReviewSections.tsx:3243`. **Disposition: false positive for this diff.** It is the diagram-thumbnail `<img>` with an `onError` placeholder (a documented `next/image` revert), pre-existing on `origin/main` (3 `<img>` tags there), and outside this change's diff.
- **Assessment A (design review):** AI-slop verdict **clean** (mostly subtractive). Touched Nielsen heuristics scored 3-4 (Aesthetic/minimalist 4 — removes a real duplicate surface + a self-contradicting chip). No P0/P1 on the three behaviors. Advisory P2/P3 items (title-on-touch, pill role) were folded into the audit's P3 below.
- The reviewer's "broader diff reverts #534 / P1 orphan-risk" scope note was a **stale-base artifact** — the branch was cut before PR #534 (warning-card-identity-placement) merged. **Resolved by rebasing onto `origin/main`**; the diff is now scoped to this change only, and the full admin suite (1034 tests) passes with #534's crew-under-row feature present.

## Impeccable `audit` (technical: a11y / responsive / perf / correctness)

- **Result: PASS — no P0/P1/P2.** Fix B branch table verified correct (null / undefined / non-counted / count-0-unflagged-still-shows / count-0-flagged-hidden / count>0-flagged-shows). Fix A: all constructs removed, no dead imports, no orphaned refs. Responsive/perf: pill gained attributes only (zero reflow); removals strictly reduce DOM/bundle; `shouldShowSectionCount` is pure O(1).
- **One P3 (Fix C accessibility), now CLOSED.** The audit (and the cross-model review, independently) flagged that `aria-label` on a bare `<span>` (generic role) is not a reliable naming source. **Fixed:** the pill now carries its fuller meaning in an inline `sr-only` tail (`on their own, no action needed`) read by a screen reader in document order — the canonical status-text pattern — with an explicit `{" "}` connector to avoid the sr-only leading-space trim. `aria-label` removed; `title` kept as a desktop-hover affordance. The test asserts the sr-only DOM mechanism directly (not `toHaveAccessibleName`, which would conflate with `title`). Cross-model review APPROVED the resolution.

## Cross-model whole-diff review (Codex)

3 rounds to APPROVE. Findings + resolutions: (1) Fix C bare-span naming → sr-only inline mechanism + mechanism-asserting test; (2) no-drop coverage only hit mapped kinds → added test 3b for the unmapped-kind → `warnings` fallback route; (3) harness replicated `emitUnknownField` → added two producer-invariant tests exercising the real producer (1:1 co-emission, key-trim, replica parity). **VERDICT: APPROVE.**
