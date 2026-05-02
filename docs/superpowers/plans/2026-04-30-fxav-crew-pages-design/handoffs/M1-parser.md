# Handoff — M1: Parser standalone

**Handed off:** 2026-05-02 by Eric Weiss
**Implementer:** Opus 4.7 / Claude Code (this session, via subagent-driven-development)
**Adversarial reviewer:** GPT-5.5 / Codex
**Plan file:** `docs/superpowers/plans/2026-04-30-fxav-crew-pages-design/01-foundation.md` (Tasks 1.1–1.14, lines 246–1157)

---

## 1. Spec sections in scope

- §6 (entire section) — Parser contract: per-block extractors, version detection, role-flag decomposition, restrictions, pull-sheet, diagrams, opening-reel, soft warnings, minimum-invariant runner, slug derivation.
- §6.4 — Field-alias maps + version detection.
- §6.6 — Personalization signals (`role_flags`, `date_restriction`, `stage_restriction`).
- §6.7 — Canonical type contracts (`ParseResult`, `ParsedSheet`, all row types).
- §6.8 — Minimum-invariant runner; §6.8.2 triggered-review item classification.
- §6.9 — Slug derivation algorithm.
- §6.10 — Pull-sheet parsing (used by AC-4.7..4.11 in M4 PullSheetTile).
- §6.11 — Diagrams + opening-reel substring extraction (Phase-0; sync-side enrichment in M6/M7).
- §4.1.1 — Email canonicalization at every boundary.
- §17.1 — Milestone 1 demo: `pnpm test:parser` parses all 10 raw fixtures cleanly.

## 2. Acceptance criteria

- **AC-1.1** — `parseSheet(markdown)` returns a populated `ParsedSheet` with zero hard errors for every fixture in `fixtures/shows/raw/*.md` (10 fixtures).
- **AC-1.2** — Per-version field extraction: every version (v1, v2, v4) extracts client, venue, dates, crew, hotels, rooms, transport, contacts, pull-sheet, diagrams, reel.
- **AC-1.3** — Role-flag decomposition: compound suffixes ("BO - V1", "GS - LEAD") decompose into multiple flags `['BO','V1']`, NOT a composite single flag.
- **AC-1.4** — Date-restriction discriminator preserves `kind: 'explicit' | 'unknown_asterisk' | 'none'`.
- **AC-1.5** — Stage-restriction discriminator (`'explicit' | 'none'`).
- **AC-1.6** — Email canonicalization at every email boundary (crew, transport, contacts, client_contact). `lib/email/canonicalize.ts` is the only function that touches raw emails.
- **AC-1.7** — Minimum-invariant runner returns `ok: true` for all 10 fixtures with no hard errors.
- **AC-1.8** — Triggered-review items (§6.8.2) are surfaced for fixtures with intentional review-required signals.
- **AC-1.9** — Slug derivation produces stable slugs across re-parses of the same fixture.
- **AC-1.10** — Slug collision behavior is documented (per §6.9).

## 3. Spec amendments in scope

- [ ] Amendment 1 — listForRepo recovery contract — **N/A — only M8.**
- [ ] Amendment 2 — created_at horizon + lease-expired reaper predicate — **N/A — only M8.**
- [ ] Amendment 3 — `lease_holder` ownership protocol — **N/A — only M8.**
- [x] Amendment 4 — §6.4 drop v3 — **applies.** v3 removed from type union, version registry, and all detection logic. Surfaced during M1 Task 1.3; corpus evidence in `00-overview.md` §amendment 4. Result: `template_version: 'v1' | 'v2' | 'v4'`; `detectVersion(...): 'v1' | 'v2' | 'v4' | null`.
- [x] Amendment 5 — §6.4 v4 single-marker simplification — **applies.** v4 detection uses `row:Contact Office` alone (the spec's `block:MAIN/SECONDARY` requirement was discarded as a 50% false-negative against the v4 corpus). Surfaced during M1 Task 1.3 code review.

## 4. Pre-handoff state

- [x] Previous milestone(s) committed: **M0 closed at 2026-05-02 with adversarial-review convergence (round 4 approved).** Final M0 head visible via `git log dcfd2cd..HEAD`.
- [x] Tests passing: `pnpm test` exits 0 (1 sample test); `pnpm test:e2e --project=mobile-safari` exits 0 (1 home-page smoke test); `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm build` all exit 0.
- [x] Specific files present:
  - [x] `vitest.config.ts` — vitest configured (Task 0.2). M1 parser tests will use the existing `tests/**/*.test.ts` glob; parser-specific tests live at `tests/parser/*.test.ts`.
  - [x] `tsconfig.json` — strict mode + the four extra strict flags active (Task 0.1).
  - [x] `eslint.config.mjs` + `.prettierrc` — lint/format active (Task 0.6).
  - [x] `fixtures/shows/raw/*.md` — 10 raw fixtures present (verified 2026-05-02). One per show; spans v1–v4 templates. AC-1.1 references this set.
  - [x] `fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md:718-743` — the v4 role-master enumeration. Canonical `RoleFlag` union in `lib/parser/types.ts` is derived from this. Tokens documented here MUST be accepted as canonical (no `UNKNOWN_ROLE_TOKEN` warning) per Task 1.1's type-comment.
  - [x] `lib/parser/`, `lib/email/` — directories do NOT exist yet. M1 creates them.
- [x] Specific env vars set in `.env.local`: **N/A — M1 is pure-function parser; no env vars are read.**
- [x] Database migrations applied: **N/A — M2 is the first DB-touching milestone.**
- [x] `pnpm` available on PATH: **verified via M0 setup; `corepack enable pnpm` if not.**

If any of the above is not met, do NOT start the milestone. Open a question.

## 5. Plan-wide invariants that apply (from AGENTS.md §1)

- [x] **TDD per task** — applies. M1 is the canonical TDD milestone: every task starts with a failing fixture-driven test, then minimal implementation, then green, then commit. Most tasks have ~2–4 unit-test files plus the per-version fixture tests. Watch especially: tests must NOT be tautological (asserting that the parser returns the literal string it was given). Compute expected values from independent sources (the fixture filename, the role-master enumeration's count, etc.) per CLAUDE.md "Anti-tautology rule for tests."
- [x] **Commit per task** — applies as a non-negotiable invariant per AGENTS.md §1.6. M1 task primary commit format: **`feat(parser): <one-line summary>`** (or `test(parser): ...` for test-only tasks). M1 has 14 task primary commits planned. Review-loop fix commits are additive per the M0 convergence ruling.
- [x] **Email canonicalization at boundary** — applies. `lib/email/canonicalize.ts` is created in Task 1.2 and is the ONLY function that touches raw emails before they enter the system. Every block extractor that reads an email field (crew, transport, contacts, client_contact in show) calls this function before assigning to the row's `email` field. Schema-level CHECK (M2) is the safety net, not the primary mechanism. **Verification:** at M1 close, `grep -rn "@" lib/parser/blocks/ | grep -v "canonicalize"` should show zero direct email-pattern handling outside the canonicalize call.
- [ ] Per-show advisory lock — **N/A — M1 doesn't touch any DB tables.** First applies in M2.
- [ ] No global cursor — **N/A — M1 has no sync code.** First applies in M6. Verification reserved for M6 handoff.
- [ ] No raw error codes in UI — **N/A — M1 has no UI.** First applies in M4. Verification reserved for M4 handoff. (M1 does emit `ParseError.code` strings, but they're consumed only by the runtime — not rendered to users.)

## 6. Watchpoints from prior adversarial review

M0 was the first executed milestone in this project; M1 is the second. Watchpoints are derived from the M0 convergence log (commit `4f257fd`'s convergence-log addition), the global CLAUDE.md feedback, and the spec self-review additions.

- **Anti-tautology rule for tests (MANDATORY).** Per CLAUDE.md: "Any test that asserts 'output X equals/contains value Y' must scope its extraction so the thing-under-test cannot satisfy the assertion by accident." For M1 specifically:
  - Don't assert that `parseSheet(markdown).show.title === markdown.split('\n')[0]` — that's tautological if the parser literally copies the first line. Compute the expected title from a known mapping (e.g., the fixture filename's middle segment).
  - Don't assert that `crew[0].email === 'eric@example.com'` if the fixture literally contains that string AFTER your parser's canonicalization should have lowercased it. Assert against the canonicalized form derived independently (lowercase the fixture string in the test setup, then compare).
  - Compute expected counts from fixture dimensions (e.g., `fixture.crewCount` derived by `grep -c "^| .* |$" fixture` in test setup), not hardcoded.
- **Self-consistency sweep.** Per CLAUDE.md spec-self-review additions: grep for every numeric literal in M1 code (cardinality caps from §10, max counts in §6, role-flag union length, etc.). The same value contradicted between code and spec is the most common round-2 finding.
- **Existing-code citations.** Every `file:line` reference in M1 commit messages or task descriptions MUST exist when committed. The current most-cited reference is `fixtures/shows/raw/2026-04-asset-mgmt-cfo-coo-waldorf.md:718-743` (the role-master enumeration); confirm this exists and matches the canonical `RoleFlag` union in `lib/parser/types.ts`.
- **TypeScript strict-mode interaction with `RoleFlag` union.** The `RoleFlag` type is a union of 19 string literals. Ensure that:
  - `noUncheckedIndexedAccess` doesn't break `role_flags` array iteration (use `for...of` rather than indexed access in tight loops).
  - `exactOptionalPropertyTypes` doesn't surprise on the `client_contact?.officePhone` chain.
  - Discriminator unions (`DateRestriction`, `StageRestriction`) are exhaustive — TypeScript's never-check at switch ends.
- **Don't pre-build M2/M6/M7 enrichment fields.** The parser MUST NOT populate `embeddedImages`, `linkedFolderItems`, `openingReel.headRevisionId`, `embeddedFingerprint`, `snapshotPath`, etc. Those are sync-layer responsibilities. The pure parser emits `ParsedSheet` (with `LinkedFolderRef`/`OpeningReelRef` — URL-only / fileId-only stubs); the sync layer (M6 Task 7.1, M7 Tasks 7.1–7.4) calls Drive APIs and emits the enriched `ParseResult`. Failing to maintain this split was a documented spec-self-review concern in earlier rounds.
- **Pull-sheet parser regex pitfalls.** §6.10 specifies a particular table format; the fixtures may have inline whitespace, escaped pipes, or merged cells. Test against ALL fixtures, not just the cleanest one — round-1 adversarial review caught a similar "tested only the happy path" finding in plans before this one.
- **Slug stability across re-parses.** Per AC-1.9: re-parsing the same fixture must produce the same slug. Avoid any `Date.now()`, `Math.random()`, or unstable hashing in the slug algorithm. The slug is deterministic from `ShowRow` only.
- **Soft warnings vs hard errors.** Per spec §6.8: `ParseWarning` is soft (info/warn severity); `ParseError` is hard (blocks Phase-1 sync). Be careful which classification applies — over-promoting a warning to an error breaks AC-1.7.

## 7. Test commands

- Vitest unit tests for parser: `pnpm test tests/parser/` (filter pattern; runs all parser-prefixed tests).
- Full vitest suite: `pnpm test`.
- Parser-corpus alias (Task 1.14 adds): `pnpm test:parser` → runs the corpus test that loads every fixture.
- Lint / typecheck / format: `pnpm lint && pnpm typecheck && pnpm format:check`.
- Build smoke: `pnpm build`.
- Layout-dimensions test: **N/A — M1 has no UI.**
- Transition-audit test: **N/A — M1 has no animated components.**

## 8. Exit criteria

- [ ] All 14 M1 task steps in `01-foundation.md` Tasks 1.1–1.14 checked off.
- [ ] All 10 ACs from §2 above have at least one test asserting them.
- [ ] All 10 raw fixtures in `fixtures/shows/raw/*.md` parse cleanly (zero hard errors): the AC-1.1 corpus test (Task 1.14) passes.
- [ ] `pnpm lint && pnpm typecheck && pnpm format:check && pnpm test && pnpm build` all exit 0.
- [ ] `pnpm test:e2e --project=mobile-safari` exits 0 (regression-only — M1 doesn't add e2e tests).
- [ ] No new `// TODO` or `// FIXME` lines unless explicitly in the plan.
- [ ] Email canonicalization invariant holds: `grep -rn "@" lib/parser/blocks/ | grep -v "canonicalize"` shows zero direct email handling outside the canonicalize call.
- [ ] All `M1` commits follow `feat(parser): <summary>` or `test(parser): <summary>` format per AGENTS.md §1.6 — NOT bare `parser:` (the bare short form is reserved for `infra:`/scaffolding contexts only).
- [ ] Working tree clean before declaring done. After running local verification commands, `next-env.d.ts` may show a working-tree modification (dev-mode flap from M0 handoff §"Known local-dev warts"). Run `git checkout -- next-env.d.ts` before declaring milestone done.
- [ ] Adversarial review (per `superpowers:adversarial-review`) ran to convergence with GPT-5.5 / Codex.

## 9. Sandbox / git protocol

- [x] **Claude Code:** commits run in-session, no sandbox issue. Use `git add <specific files>` (NOT `git add -A`), then `git commit -m "feat(parser): <summary>"` per AGENTS.md §1.6.
- [ ] **Codex CLI default sandbox:** N/A for M1 — implementer is Claude Code per ROUTING.md.

## 10. Adversarial review handoff

After all 14 M1 tasks are committed:

1. Implementer (this session) summarizes what was built and confirms each per-task checklist is `- [x]`.
2. The adversarial reviewer (GPT-5.5 / Codex per ROUTING.md) is invoked via `superpowers:adversarial-review`. Inputs: §6 + §17.1 of the spec, the M1 plan section (`01-foundation.md` lines 246–1157), and the diff `git diff <M1-base-SHA>..HEAD -- 'lib/parser/**' 'lib/email/**' 'tests/parser/**'`.
3. Reviewer iterates with implementer until convergence. Round cap: 3 (per skill); user-authorized overtime if findings are concrete-fixable rather than substantive disagreements (precedent from M0).
4. Convergence is logged at the bottom of this file.

## Convergence log

### Partial-milestone review — Tasks 1.1–1.5 (2026-05-02)

Run mid-milestone at user request to surface foundation defects before high-stakes Task 1.6 lands. M1 base `4daec4b`; partial HEAD at convergence `c3462dc`.

- **Round 1 (2026-05-02):** Codex/GPT-5.5 returned `needs-attention` with 3 findings — (1.high) `lib/parser/types.ts` drift from spec §6.7 (`ParsedSheet.diagrams.linkedFolderItems` missing, `embeddedImages` typed as `[]` instead of `never[]`, `OpeningReelPinned` missing `mimeType: string | null`); (2.high) 2025-10 venue extractor still corrupted name+address despite the Task 1.4 round-1 fix (combined cell stuffed into `name`, address left empty); (3.medium) v1 SHOW dates path bypassed `normalizeDate` calendar validity. All 3 addressed in commits `4b671c5` (types alignment + test strengthening), `4bd9514` (venue split-on-slash for combined NAME/ADDRESS cell), `36b2c2a` (extractAllDates routed through normalizeDate + regression tests for Feb 30 / Apr 31).
- **Round 2 (2026-05-02):** Codex returned `needs-attention` with 1 finding — (medium) `venue.ts` blank-col0 v2 continuation branch only handled `venue.address` + `venue.loading_dock` but not `venue.google_link` or `venue.notes`, silently dropping data from the 2025-10 fixture line 36. Addressed in commit `c3462dc` (extended branch to 4 sub-handlers + regression tests asserting both `googleLink` and `loadingDock` for 2025-10).
- **Round 3 (2026-05-02):** Codex returned `verdict: approve`. **Convergence reached.**

158 parser tests passing across 7 test files at convergence. Lint, typecheck, format:check, build all green. No phantom `'v3'` references. Email canonicalization invariant holds (zero direct email-pattern handling outside `canonicalize` call). Foundation tasks 1.1–1.5 cleared for Task 1.6 (crew block + role-flag decomposition) to proceed.

### Final-milestone review — Tasks 1.1–1.14

_(populated after Task 1.14 completion + final adversarial review)_
