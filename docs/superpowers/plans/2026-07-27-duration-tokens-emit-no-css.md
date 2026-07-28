# Plan — duration-token @theme alias fix

**Spec:** `docs/superpowers/specs/2026-07-27-duration-tokens-emit-no-css.md` (ratified) · **Branch:** `fix/duration-tokens-emit-no-css` · **Implementer:** Opus / Claude Code (UI-owned per routing hard rule)

## Pre-draft verification (run 2026-07-27, this worktree)

- `app/globals.css:43` `@theme` opens; `--duration-instant/fast/normal/slow` at 222-225; reduced-motion override at 417-423; chevron comment block 714-720, rule 721-723. All verified by read.
- `components/crew/CrewSubNav.tsx:86` tab literal classes `transition-colors duration-fast ease-out-quart` — verified by read (T2's assertion target).
- `tests/e2e/crew-section-toggle.spec.ts` harness: `beforeEach` gates `testInfo.project.name !== "mobile-safari"` (line 100), resolves seeded slug/token, `page.clock.install`, `signInAs`; `gotoSection()` helper asserts HTTP 200 + `crew-shell` + `section-<id>` visible (lines 119-131). Wired in `.github/workflows/crew-e2e.yml:142`; the file is matched ONLY by the mobile-safari project (`playwright.config.ts:76-78` desktop-chromium testMatch excludes it) — WebKit-only oracle.
- Vitest discovery: `vitest.projects.ts:34` `BASE_INCLUDE = ["tests/**/*.test.ts", ...]` — a new `tests/design/*.test.ts` file is auto-included (precedent: `tests/design/statusDegradedToken.test.ts`); no workflow path-filter change needed (unit suite runs the glob).
- Probe (spec §1.0): repo `@tailwindcss/cli` 4.2.4 compile — no-alias emits no `.duration-fast`; alias emits the rule + root-scope chain. Compile wall-clock ≈0.4s.
- `grep -rn "duration-\[" app components` → no arbitrary duration brackets, so `better-tailwindcss/enforce-canonical-classes` (`eslint.config.mjs:67`) has no new canonicalization targets; `pnpm lint` re-run in Task 3 confirms.
- Tailwind default fallback pre-fix: v4 `--default-transition-duration` = 150ms → T2 red expectation `"0.15s"`.

## Meta-test inventory (mandatory declaration)

- **Creates:** `tests/design/durationTokenEmission.test.ts` — a structural compile guard over the `duration-*` utility ↔ token chain (T1). Not a registry meta-test; it is fail-by-default against namespace drift because it exercises the real compiler on the real stylesheet.
- **Extends:** `tests/e2e/crew-section-toggle.spec.ts` (one new test, T2); `tests/docs/_metaDeferralLedgerGraduation.test.ts` `BACKLOG_GRADUATED` registry (one row, Task 3 step 1b).
- **Existing registries:** none applies — no Supabase call boundary, no mutation surface, no admin alert, no tile sentinel, no advisory lock (spec §6).

## Reconciliation sweep (authored AND run now)

`grep -rn "transition-duration" app tests docs DESIGN.md | grep -v node_modules` current hits and dispositions:

| Hit | Disposition |
| --- | --- |
| `app/globals.css:716-719` "which this project never defines" | Task 2 rewrites comment (spec §3.1) |
| `tests/e2e/agendaScheduleLayout.spec.ts:358-360` same claim | Task 2 comment edit (spec §3.2) |
| `docs/superpowers/specs/2026-07-26-agenda-perday-viewer-fold.md:672,683,687,702` | Task 2 dated UPDATE note only (spec §3.3) |
| `docs/superpowers/plans/2026-07-26-agenda-perday-viewer-fold.md:71` (alias count pinned to zero) and `2026-07-26-agenda-perday-viewer-fold.md:263` ("emits NOTHING here") | Task 2 dated UPDATE note per claim, no counts (spec §3.4; missed by the spec-only sweep — spec review R1 M3) |
| `tests/docs/agendaFoldDocConsistency.test.ts:114` requires `/transition-duration-fast/` in that spec | No edit; re-run in Task 2 (note keeps it matching) |
| `tests/e2e/help-screenshots-clock-pipeline.spec.ts:101`, `scripts/capture-core.ts:74`, `tests/help/capture-script.test.ts:41` (`transition-duration: 0s !important` capture kill-switch) | No edit — motion kill for screenshots, orthogonal |
| `tests/e2e/section-header-layout.layout.spec.ts:1129` (historical comment) | No edit — describes a past bug shape, still true |
| New spec/plan docs (this branch) | Self-referential, no action |

## Task 1 — TDD core: red tests, alias lines, green

1. **Red A (T1):** create the fixture pair `tests/design/fixtures/duration-probe.css` (`@import "../../../app/globals.css";` + `@source "./duration-probe.html";`) and `tests/design/fixtures/duration-probe.html` (one div carrying `transition duration-instant duration-fast duration-normal duration-slow`), then `tests/design/durationTokenEmission.test.ts` exactly as materialized on this branch (compile the fixture CSS with `node_modules/.bin/tailwindcss` via `execFileSync` into a tmp dir; `test.each` over all four names asserting `.duration-<name>` rule bound to `var(--transition-duration-<name>)` and the alias-chain var; one reduced-motion terminus assertion zeroing fast/normal/slow — instant is 0ms by value and absent from that block). The fixture probe makes all four utilities live candidates regardless of app usage — today `slow`/`instant` have zero class sites, and without the probe, deleting those aliases would stay green (spec review R1 HIGH). Typechecked against the strict tsconfig and red witnessed pre-alias 2026-07-27 (emission + chain assertions fail); compile ≈130ms.

2. **Red B (T2):** append to the describe block of `tests/e2e/crew-section-toggle.spec.ts` (imports to add at top: `readFileSync` from `node:fs`, `join` from `node:path`):

```ts
// ── Test 6 — duration tokens reach Tailwind utilities (BL-DURATION-TOKENS-EMIT-NO-CSS) ──
// The sub-nav tab carries literal `transition-colors duration-fast` classes
// (CrewSubNav.tsx). Pre-fix, `duration-fast` compiled to NOTHING and the
// computed duration was Tailwind's 0.15s default; reduced-motion never
// reached it. Expected value is DERIVED from the token in globals.css, not
// hardcoded — a token edit moves the expectation with it.
test("sub-nav tab duration comes from --duration-fast and zeroes under reduced motion", async ({ page }, testInfo) => {
  if (testInfo.project.name !== "mobile-safari") return;
  const tokenCss = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
  const m = tokenCss.match(/--duration-fast:\s*(\d+)ms/);
  if (!m?.[1]) throw new Error("app/globals.css must declare --duration-fast in ms");
  const expected = `${Number(m[1]) / 1000}s`;

  await gotoSection(page, "today");
  const tab = page.getByTestId("crew-sub-nav").locator('[data-section="venue"]:visible');
  await expect(tab).toBeVisible();
  expect(await tab.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe(expected);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await gotoSection(page, "today");
  await expect(tab).toBeVisible();
  expect(await tab.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe("0s");
});
```

Harness readiness (per writing-plans checklist): (a) server boot = the existing playwright config webServer on `127.0.0.1:${E2E_PORT}` (`playwright.config.ts:69-72`), same as every other test in this file; (b) readiness gate = `gotoSection()`'s 200 + `crew-shell` + `section-today` visibility assertions (never bare networkidle); (c) detach-safety = both `evaluate` calls run after a fresh `toBeVisible()` on a locator re-resolved post-navigation. Run `pnpm exec playwright test tests/e2e/crew-section-toggle.spec.ts --project=mobile-safari` → new test FAILS with `"0.15s"`. Witness the red.

3. **Green:** add to `app/globals.css` `@theme`, immediately after line 225 (`--duration-slow: 360ms;`), the exact block from spec §2 (comment + four `--transition-duration-*: var(--duration-*)` aliases).
4. Re-run both: T1 all green, T2 green (`"0.12s"` then `"0s"`).
5. `pnpm lint` (enforce-canonical-classes unaffected — pre-verified) and `pnpm format:check` on touched files.
6. Commit: `fix: emit real CSS for duration-* utilities via @theme transition-duration aliases`.

## Task 2 — stale-claim sweep (spec §3)

1. Rewrite `app/globals.css:714-720` comment: rule stays hand-written (predates the aliases; keeps the transition co-located with its `details[open]` sibling selector at 724-726); replace the "never defines" rationale with a pointer to the `@theme` aliases above.
2. Same-claim comment edit at `tests/e2e/agendaScheduleLayout.spec.ts:358-360` (assertions untouched).
3. Add dated `> **UPDATE 2026-07-27 (fix/duration-tokens-emit-no-css).**` note in `docs/superpowers/specs/2026-07-26-agenda-perday-viewer-fold.md` after the §11 "never defines" analysis (~line 687): gap closed by the aliases; historical analysis left intact.
3b. Same treatment in the PLAN half, `docs/superpowers/plans/2026-07-26-agenda-perday-viewer-fold.md`: dated UPDATE note at the line-71 table row and the line-263 checklist claim (or one note covering both, placed at the first). No site counts in either note (the doc-consistency test scans both documents).
4. `DESIGN.md` §5: one sentence after the reduced-motion paragraph (line 267) documenting the alias chain (Tailwind `duration-*` utilities → `--transition-duration-*` → `--duration-*`), so utility classes and direct `var()` consumption are equally reduced-motion-safe.
5. Verify: `pnpm vitest run tests/docs/agendaFoldDocConsistency.test.ts` green, and `pnpm exec playwright test tests/e2e/agendaScheduleLayout.spec.ts --project=mobile-safari` green (the chevron assertions are untouched by a comment edit; the run proves it).
6. Commit: `docs: sweep stale never-defines claims after duration-token aliases`.

## Task 3 — ledger graduation (spec §5)

1. **Red first:** add `{ id: "BL-DURATION-TOKENS-EMIT-NO-CSS", provenance: "fix/duration-tokens-emit-no-css" }` to `BACKLOG_GRADUATED` (`tests/docs/_metaDeferralLedgerGraduation.test.ts:123`) with a dated comment; run `pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts` and WITNESS THE FAIL (id registered but not yet archived) — the row is what makes the meta-test enforce archive presence/provenance for this id (spec §5, R2 ordering fix).
1b. **Green:** move `BL-DURATION-TOKENS-EMIT-NO-CSS` (root `BACKLOG.md`, line 831) to `BACKLOG-archive.md` with resolution line (PR #, branch, spec path); add the dated reconciliation note to the header (line 7 area); meta-test green.
1c. File `BL-BARE-TRANSITION-NO-DURATION-CLASS` in root `BACKLOG.md` (spec §5 wording: bare `transition-*` sites with no named duration class keep the 150ms default and sit outside the reduced-motion collapse; exemplars `app/me/page.tsx:246`, `components/shared/CardReportTrigger.tsx:90`, `components/crew/primitives/SourceLink.tsx:72`; no site count — grep-flavour precedent).
2. Append `**UPDATE 2026-07-27: fixed** (fix/duration-tokens-emit-no-css, spec docs/superpowers/specs/2026-07-27-duration-tokens-emit-no-css.md)` to `DESTRUCT-DURATION-TOKENS-1` (root `DEFERRED.md`, line 186 entry), following that file's update-note idiom.
3. `pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts` green (it rejects terminal headings/status lines in active ledgers — the archive move satisfies it; verify the DEFERRED note's wording does not trip the terminal-status matcher, adjust wording if it does).
4. Commit: `docs: graduate BL-DURATION-TOKENS-EMIT-NO-CSS; mark DESTRUCT-DURATION-TOKENS-1 fixed`.

## Task 4 — close-out gates

1. Full local suite: `pnpm test` green.
2. Local e2e re-run of the two touched Playwright files, green.
3. Impeccable dual-gate (`/impeccable critique` + `/impeccable audit`) on the diff (invariant 8 — `@theme` change). P0/P1 fixed or DEFERRED.md-logged.
4. Whole-diff Codex cross-model review (fresh-eyes brief, REVIEWER ONLY, do-not-relitigate list from spec §1.1) to APPROVE.
5. Push, PR, real CI green (quality + crew-e2e must both run — crew-e2e path filters include `tests/e2e/crew-section-toggle.spec.ts` and `components/**`; verify the run actually fired), `gh pr merge --merge`, fast-forward main, `git rev-list --left-right --count main...origin/main` == `0 0`.

## Checklist

- [ ] Task 1 red A/red B witnessed → aliases → green → commit
- [ ] Task 2 sweep → commit
- [ ] Task 3 ledgers → commit
- [ ] Plan self-review
- [ ] Adversarial review (cross-model) — plan
- [ ] Task 4 gates → merge → ff-sync

## §12 Close-out — impeccable dual-gate (invariant 8), 2026-07-27

Both commands ran diff-scoped with the canonical v3 setup gates (context.mjs load, product register).

**`/impeccable critique`** — dual-agent (design review + detector/evidence). Verdict: APPROVE, diff-scoped heuristics 4/4/4 (status-visibility, consistency, accessibility), zero P0-P2. Findings + dispositions:

- P3 chevron duration split (Step1Share 220ms vs agenda 120ms, each container-matched): NOT taken this diff — doc-polish candidate for the next DESIGN.md pass, no user impact.
- P3 residual-gap fix shape (`--default-transition-duration` aliasing): APPLIED as a note on the `BL-BARE-TRANSITION-NO-DURATION-CLASS` entry.

**`/impeccable audit`** — diff-scoped 5-dimension scan:

| Dimension | Score | Finding |
| --- | --- | --- |
| Accessibility | 4 | The diff IS an a11y fix: reduced-motion now zeroes ~230 previously-unreduced Tailwind sites. Residual bare-`transition-*` gap disclosed + backlogged. |
| Performance | 4 | No layout-property animation added; four inert-until-consumed CSS custom properties; compile evidence clean. |
| Theming | 4 | Strengthens the token system (utility↔token chain); test expectations token-derived, no new hardcoded values. |
| Responsive | 4 | No layout/markup change; N/A hazards. |
| Anti-patterns | 4 | Detector 0 findings on behavior-anchor components; added prose cited and specific. |

Total 20/20 diff-scoped. Zero P0/P1 across both gates — nothing to fix or defer. Evidence: detector run, fixture-probe compile assertions, committed WebKit computed-value test (Assessment B); snapshot at `.impeccable/critique/2026-07-28T03-55-53Z__app-globals-css.md` (local, gitignored).
