# /help/tour hydration-mismatch fix + help-pages CI promotion

**Date:** 2026-08-10 · **Branch:** `fix/help-tour-hydration` · **Closes:** `BL-HELP-TOUR-HYDRATION-MISMATCH` (BACKLOG.md)
**Class:** app defect (UI surface, invariant 8 applies) · **Effort:** S

## 1.1 Resolved scope — do not relitigate

- **The fix is a formatting normalization of `app/help/tour/page.mdx`, not a rewrite.** Link targets, aria-labels, and classNames are byte-identical after the change; user-visible copy is preserved up to whitespace normalization — moving a text child onto one line replaces its embedded newlines-plus-indentation with single spaces, which is the same collapse HTML rendering applies, so the RENDERED text is unchanged (R4 F1). The changes are expression-wrapping of EVERY text child in the three expanded cards (§4's uniform recipe, probe-selected across R5-R6) plus whatever attribute layout Prettier chooses. Any finding proposing copy or layout changes is out of scope.
- **The CI promotion rides in the same arc.** BACKLOG.md (`BL-HELP-TOUR-HYDRATION-MISMATCH`, "Closing this unblocks a one-line follow-up") names the allowlist-row deletion + workflow wiring as the un-defer payload; folding it here is the ratified disposition, not scope creep.
- **No new test files.** The red test already exists: `tests/e2e/help-pages.spec.ts` asserts zero page errors per `/help/*` route and currently fails on `/help/tour` (probed 2026-08-09, both server postures, per the backlog entry). Green is the same suite passing. A bespoke MDX-compile unit guard was considered and rejected (YAGNI: the e2e page-error assertion is the durable guard once promoted to CI).
- **The backlog entry's causal guess is superseded by the probe below.** The entry hypothesized column-0 `<a>` elements being wrapped in `<p>`. The confirmed mechanism is different (text children on their own lines inside JSX flow elements are parsed as markdown paragraphs). Do not relitigate the old hypothesis.
- **Impeccable dual gate owed** (`app/help/tour/page.mdx` is a UI surface under AGENTS.md invariant 8). Expected visual delta is nil-to-minimal (§6); the gate verifies that.

## 2. Problem

`/help/tour` throws "Hydration failed because the server rendered HTML didn't match the client" plus twelve further page errors on every visit, under `BASELINE_SERVER_ONLY=1 pnpm dev` and `pnpm build && pnpm start` alike (probe transcript in the BACKLOG.md entry at `BACKLOG.md:718`, 2026-08-09). Every other `/help/*` route passes the identical assertions (route set derived from the `NAV` export, `app/help/_nav.ts:14`, by the guard at `tests/e2e/help-pages.spec.ts:76`). Because of this, `tests/e2e/help-pages.spec.ts` is held out of CI: it carries the `UNSEEN` allowlist row in `tests/ci/_metaE2eWorkflowCoverage.test.ts:148` and is deliberately absent from `.github/workflows/app-e2e.yml`'s run step (`app-e2e.yml:143`; the workflow's header comments at `app-e2e.yml:7` and `app-e2e.yml:34` name this backlog row as the blocker).

## 3. Root cause — CONFIRMED by compile probe, 2026-08-10

`app/help/tour/page.mdx` contains seven link cards across three groups (two grid containers at `app/help/tour/page.mdx:7` and `app/help/tour/page.mdx:54`, plus a single-card plain div at `app/help/tour/page.mdx:100`). Three of the seven were at some point reformatted (prettier-style: multi-line attributes, with the eyebrow, body, and CTA text children on their own lines — the duration span and `<h3>` text remain inline and compile clean, which is why the probe counts nine nested paragraphs, not fifteen; the §4 recipe still converts ALL text children in these cards, because the R7 probe showed converting only the nine problem children lets Prettier re-expand the headings into new markdown paragraphs) — the "Review queues" card (`app/help/tour/page.mdx:18`), the "Preview as crew" card (`app/help/tour/page.mdx:65`), and the "Onboarding wizard" card (`app/help/tour/page.mdx:101`). The other four keep the compact style: single-line attributes, text children inline with their tags.

MDX parses the children of a JSX flow element as markdown **flow** content. A text child sitting on its own line becomes a markdown paragraph and compiles to `<_components.p>` — nested inside whatever JSX element holds it. Compile probe (`@mdx-js/mdx` `compile`, `jsx: true`, run against the live file 2026-08-10) shows, for each of the three reformatted cards, output of the shape:

```jsx
<p className="text-text leading-relaxed mb-3"><_components.p>{"Most new sheets…"}</_components.p></p>
<span className="text-xs …"><_components.p>{"When something needs you"}</_components.p></span>
```

`<p>` inside `<p>` and `<p>` inside `<span>` are invalid HTML nesting — one of the named causes in React's own mismatch message. The browser's parser restructures the server HTML (closing the outer `<p>` early), the client render doesn't match, hydration fails, and React re-renders client-side. The three compact cards compile to plain text children and are unaffected.

Note on probe fidelity: the probe used raw `@mdx-js/mdx` while the app compiles through `@next/mdx` with `remark-gfm` (`next.config.ts:2`, `next.config.ts:29`). `remark-gfm` adds table/strikethrough/autolink syntax and does not alter paragraph formation inside JSX flow elements, so the mechanism carries over; the e2e red→green is the end-to-end confirmation on the real pipeline.

## 4. Fix

**The recipe must be Prettier-stable (R5 F1, corrected R6 F1 — both BLOCKING, both probed): staged MDX is auto-formatted (the lint-staged block at line 147 of the root package.json) and CI runs `pnpm format:check` (`.github/workflows/quality.yml:42`), so any fix Prettier undoes either resurrects the bug via the hook or leaves CI red.** R5's per-card split (compact for two, expressions for one) was itself refuted by R6's deeper probe: repository Prettier 3.8.3 with the repo `.prettierrc` re-expands the compact form on ALL THREE cards, restoring 8 markdown paragraphs. The recipe is therefore uniform:

- **All three expanded cards:** every text child becomes a JSX expression child (`{"…"}`). Expressions compile as expressions — never markdown flow — regardless of line placement, so Prettier may lay the attributes and children out however it likes and the invalid nesting cannot return. Attribute formatting is left to Prettier.
- **The four compact cards are untouched** (their committed form passes `format:check` today; no conversion in either direction).
- **Fenced both directions on two rounds of probes (R5, R6): do not propose compact-style conversion anywhere (refuted twice), and do not propose expressions on the already-healthy compact cards (unnecessary).**

No word of user-visible copy, no href, no aria-label, no className changes; each converted text child carries its text with whitespace runs collapsed to single spaces (the §1.1 normalization) inside expression braces.

Acceptance for this section: recompiling the fixed file with the §3 probe yields exactly **one** `_components.p` in the whole module (the legitimate intro paragraph, `app/help/tour/page.mdx:3`), and none nested inside a JSX element — **both before AND after running the repo's Prettier over the file** (idempotence: `pnpm format:check` green on the committed form, and formatting the committed form changes nothing).

## 5. CI promotion (the unblocked follow-up)

1. Delete the `"tests/e2e/help-pages.spec.ts": UNSEEN` row from the allowlist in `tests/ci/_metaE2eWorkflowCoverage.test.ts:148` (the meta-test then requires the spec to be wired, fail-by-default).
2. Add `tests/e2e/help-pages.spec.ts` to the run step of `.github/workflows/app-e2e.yml:143` (the `pnpm exec playwright test …` list). The spec resolves under **mobile-safari only** (§6), so no `--project` flag changes.
3. **Executed-count oracle row (R1 F1):** the workflow gates on `scripts/check-app-e2e-executed.mjs`, whose `REQUIRED` map (`scripts/check-app-e2e-executed.mjs:30`) must gain a `"help-pages.spec.ts"` row, and `tests/cross-cutting/app-e2e-ci-wiring.test.ts:203` enforces exact key parity between that map and the YAML spec list — adding the YAML entry without the oracle row fails the structural test. The row's count is **derived from a real local run** (the parent entry's read-not-run lesson, `BACKLOG.md:677`), not from reading the file; at authoring time the file shape suggests 15 executions (14 NAV routes + the NAV-parity guard, × 1 project), and the run decides. The oracle's present-tense calibration comments (seven-spec/54-execution figures) are updated in the same commit.
4. Update the two header comments in `app-e2e.yml` that name this spec as blocked (top-of-file comment at `app-e2e.yml:7` and the "help-pages.spec.ts is deliberately NOT here" block at `app-e2e.yml:34`), AND the workflow's present-tense spec-count synopsis (`app-e2e.yml:2` currently says seven specs; promotion makes it eight — R7 F4). A numeric sweep of the whole workflow header lands in the same commit.
4b. **Environment-governance registry (R2 F1):** adding the spec to the run step makes every effective job-level env pair plus the run-step report-path pair govern it — 17 pairs (probed in-memory at review R2: `BASELINE_SERVER_ONLY`, `ENABLE_TEST_AUTH`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `HASH_FOR_LOG_PEPPER`, `JWT_SIGNING_SECRET`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `PICKER_COOKIE_SIGNING_KEY`, `PLAYWRIGHT_JSON_OUTPUT_NAME`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_REALTIME_ISS`, `SUPABASE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `TEST_AUTH_SECRET`). Each corresponding `governs` array in the `ENV_KEY_ALLOWLIST` registry (`tests/ci/_workflowCoverageScan.ts:703`) gains `tests/e2e/help-pages.spec.ts`; the governance-equality assertion (`tests/ci/_metaE2eWorkflowCoverage.test.ts:1945`) fails otherwise. The count is verified against the meta-test's own report at implementation time, not trusted from this list.
5. **Parent-entry reconciliation (R1 F4):** `BL-E2E-APP-DEPENDENT-SPECS-CI-DARK` (`BACKLOG.md:634`) is restated in the same PR: its heading's population figure (**24 → 23** — its own census rule is "count the allowlist, not arithmetic", and the figure is READ FROM THE ALLOWLIST AT IMPLEMENTATION TIME, not from this sentence: authored against a base where the pre-promotion count was 25, it was 24 by the time the branch merged `origin/main`, which had promoted `right-now-transitions` in the meantime. Diff review R2/R3 caught the stale arithmetic; the rule that would have prevented it is the entry's own), and the "Ninth member deferred, not wired" paragraph (`BACKLOG.md:679`) rewritten to record the promotion. The dated historical census table and the Batch-1 record are NOT rewritten (historical measurements are never corrected).
6. The `BL-HELP-TOUR-HYDRATION-MISMATCH` entry graduates (archive per ledger convention; the IN PROGRESS marker comes off in the PR's last commit per invariant 12).

**Wiring acceptance bar (R1 F2, corrected R2 F2):** the parent entry's promotion bar applies unchanged — **five consecutive green `pull_request` runs of the `app-e2e` job on the PR, zero retries**, before the spec counts as wired (`BACKLOG.md:671`, adopting batch-1's AC-3 at `docs/superpowers/specs/ci/2026-08-09-app-e2e-batch1-design.md:89`). Only `pull_request`-triggered runs count — `workflow_dispatch` runs are post-merge rerun machinery and are NOT acceptance evidence (batch-1 AC-3's own R2 amendment is explicit on this). Re-triggers between content pushes use empty commits; the five run links are recorded on the PR body before merge.

**Fallback branch (R2 F3) — the pre-ratified batch-1 shape (`2026-08-09-app-e2e-batch1-design.md:90`, AC-4: "an admitted flake is worse than a known gap"):** if `help-pages.spec.ts` itself flakes inside the five-run window, the promotion half of this arc reverts as a unit while the hydration fix still ships: the spec comes OUT of the `app-e2e.yml` run step, its `REQUIRED` oracle row is removed (key parity), the 17 `governs` additions are reverted, the `UNSEEN` allowlist row is restored WITH a recorded flake reason, the parent entry's census stays at its pre-arc value with the ninth-member paragraph updated to record the attempt + flake, and the `app-e2e.yml` header comments name the flake (not the fixed hydration bug) as the blocker. AC-3, AC-4, AC-6, and §5 steps 1-5 are then satisfied in their fallback reading (below); AC-1/AC-2/AC-5 (the hydration fix itself) are unconditional.

## 6. Verification

- **Red (exists today):** `BASELINE_SERVER_ONLY=1 pnpm exec playwright test tests/e2e/help-pages.spec.ts --project=mobile-safari` — fails: `/help/tour: page errors observed` (13 entries). This is the pre-existing failing case; the fix task writes no new test (invariant-1 shape: the failing test predates the fix).
- **Green:** same command passes; run the full spec file (all 14 routes + the NAV-parity guard) to confirm no sibling route regressed. Coverage is **mobile-safari only**: `help-pages` resolves in the mobile-safari `testMatch` (`playwright.config.ts:78`) and is deliberately absent from desktop-chromium's (`playwright.config.ts:91`); the spec's own header declares mobile-safari (`tests/e2e/help-pages.spec.ts:34`). This arc does not widen project coverage.
- **Compile probe:** §4's one-`_components.p` assertion, run ad hoc (not committed — the e2e page-error assertion is the durable guard).
- **Visual delta:** none intended, but the DOM does change — the fix removes the nine nested markdown `<p>` wrappers, so pre- and post-fix trees are structurally different (R3 F3). The removed wrappers are markdown-default paragraphs — six sat directly inside `<span>` elements and three inside `<p>` elements (R7 F3); the browser's pre-fix re-parse was already hoisting them out of their invalid parents, so the expected rendered delta is nil-to-minimal; that expectation is VERIFIED by the impeccable critique + audit dual gate on the diff (invariant 8), not assumed.
- **CI:** real `app-e2e.yml` green on the PR (local-passes-CI-fails is its own bug class — AGENTS.md cross-cutting discipline).

## 7. Documented limits

- The other twelve `.mdx` files under `app/help/` (thirteen total including the tour page itself) were not audited for the same latent shape; only `/help/tour` fails the live page-error assertion today, and `help-pages.spec.ts` asserts zero page errors on **all fourteen** routes, so any sibling instance that ever manifests is caught by the same promoted gate. A repo-wide MDX formatting lint is out of scope (no second live instance; filing bar requires probe evidence).

## Dimensional Invariants

None. The diff wraps text children in JSX expressions and lets Prettier lay out lines; no fixed-height/width parent, no flex/grid child relationship, no class or style is added, removed, or altered. The rendered card grid keeps its existing classes byte-for-byte (AC-2).

## Transition Inventory

None. The page is static content with a single visual state; the fix adds no state, no conditional render, no animation. The only behavioral change is the removal of the failed-hydration client re-render, which is not an authored transition.

## 8. Acceptance criteria

- **AC-1:** `/help/tour` renders with zero page errors under both server postures (e2e assertion green, mobile-safari project — the only project the spec resolves in, `playwright.config.ts:78`).
- **AC-2:** `app/help/tour/page.mdx` hrefs, aria-labels, and classNames are byte-identical to before; text content matches after collapsing each whitespace run to a single space (the HTML rendering collapse — R4 F1: raw string equality would wrongly reject the mandated newline removal). Verifiable by diffing the extracted, whitespace-normalized strings.
- **AC-3:** `help-pages.spec.ts` runs in `app-e2e.yml` on pull_request; its allowlist row is gone; `tests/ci/_metaE2eWorkflowCoverage.test.ts` passes (governance-equality included, per §5.4b). *Fallback reading (§5): the allowlist row is restored with a recorded flake reason, the YAML/oracle/governs additions are reverted, and the meta-test passes in that state.*
- **AC-4:** No stale comment in `app-e2e.yml` names this spec as blocked, and no present-tense cardinality in the workflow header contradicts the promoted run command (R7 F4). *Fallback reading: the comments name the recorded flake, not the fixed hydration bug.*
- **AC-5:** Impeccable critique + audit pass on the diff (P0/P1 fixed or DEFERRED.md-logged).
- **AC-6:** The five-consecutive-green wiring bar (§5) is met, with the five run links recorded on the PR before merge; the `REQUIRED` oracle row and parity test (`tests/cross-cutting/app-e2e-ci-wiring.test.ts:203`) are green; the parent entry `BL-E2E-APP-DEPENDENT-SPECS-CI-DARK` is restated per §5.5. *Fallback reading (§5): the promotion reverts as a unit, the parent entry records the attempt + flake at its pre-arc census, and the graduation in §5.6 still happens (the hydration row's own defect is fixed regardless).*

impeccable-gate: pending — critique + audit due at implementation close-out (UI surface: app/help/tour/page.mdx)
