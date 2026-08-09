# Quick wins 2 — implementation plan (three branches)

> **For agentic workers:** execute task-by-task per `HANDOFF.md` in this directory. Specs: `docs/superpowers/specs/2026-08-09-quick-wins-2-mech.md` (Branch A) and `docs/superpowers/specs/2026-08-09-crew-chrome-wizard-connector.md` (Branches B, C). Spec wins on any conflict (invariant 7). Every plan-wide invariant in `AGENTS.md` binds; TDD per task (invariant 1); commit per task (invariant 6). The invariant-8 dual design gate (both halves, per AGENTS.md rule 8) runs on branches A, B, and C; its closeout marker lands in this directory's closeout file on the implementing branches, in the exact §3.3 grammar.

## Branch topology and order

| Branch | Spec | Scope |
| --- | --- | --- |
| A `fix/quick-wins-2-mech` | mech spec §2 | Tasks A1-A7 |
| B `feat/crew-chrome-footer-avatar` | UI spec §2 | Tasks B1-B6 |
| C `feat/wizard-step-connector` | UI spec §3 | Tasks C1-C2 |

Branches are independent (no shared files); ship A → B → C to keep review scopes tight. Stage 0 per branch is defined in `HANDOFF.md` (labels FIRST, then worktree setup, claims, marker flip, push).

## Meta-test inventory (declared per writing-plans rule)

- CREATES: `tests/specLint/` "themeTokenArrowBan.test.ts" (A2); the cn-initializer structural case (A3); the shared-resolver unit suite (A5).
- EXTENDS: `tests/e2e/tap-target-floor.layout.spec.ts` (A6); `tests/visibility/scopeTiles.test.ts` (A4); `tests/e2e/crew-page.spec.ts` inv8 (B1); `tests/e2e/canonical-class-dimensions.spec.ts` (C1); the four identity-chip component suites (B3); `scripts/check-crew-e2e-executed.mjs` + `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` (B4).
- Registries: none of `_metaInfraContract` / `_metaMutationSurfaceObservability` / advisory-lock apply — no Supabase call sites, no mutation surfaces, no locks touched. Declared: none applies, by reason above.

## Pre-verified code facts (probed 2026-08-09, cited in the specs and plan reviews)

- `StepIndicator` is the ONLY child of its `justify-between gap-3` row (`components/admin/OnboardingWizard.tsx:738-740`).
- `tests/e2e/_tapTargetFloorLiveEntry.tsx` mounts `HelpSheet` (:180) and `HelpTooltip` (:187) directly; `Step3Review`/`StagedReviewCard` containers are NOT mounted; `HelpSheet.tsx:167` gap row IS (inside the opened sheet).
- Mutation harness is vitest-child-only (`tests/mutation/guardSurfaces.gate.test.ts:11`).
- `Footer` sole importer: `_CrewShell.tsx`. AdminNav keeps its own ThemeToggle (`AdminNav.tsx:188`).
- `theme-toggle.spec.ts` signs in as the ADMIN fixture → `identityChip=null` → standalone-toggle path only; crew identity comes from the `picker-flow.spec.ts` recipe, which persists identity under Chromium only (plan R1 F10) — the avatar-menu arm is Chromium-project-gated.
- The eslint comment's stale phrase wraps across lines; the contiguous searchable token is `hand on initial canonicalization` (plan R1 F3).
- Bar clearance constant: `--spacing-tap-min` (44px) + 1rem = **60px** + `env(safe-area-inset-bottom)` — matches the `<main>` recipe's arithmetic and clears the measured 53.3px bar with 6.7px margin. The e2e oracle compares against the LITERAL 60 (safe-area is 0 in the harness), never against the implemented padding (plan R1 F6 anti-tautology).

## Acceptance-criteria map (ids resolved against the specs)

| id | Source | One-line summary |
| --- | --- | --- |
| AC-M1 | mech spec §5 | eslint comment (own commit) + measured globals claim + themeTokenArrowBan RED-then-green with census |
| AC-M2 | mech spec §5 | nine consts cn-wrapped; plant silence/report observations recorded; census dispositions |
| AC-M3 | mech spec §5 | mutation-enrolment entry re-dispositioned to watch with probe (A7) |
| AC-M4 | mech spec §5 | transport pin set green with observed-RED transcript + empty-owner-ids premise |
| AC-M5 | mech spec §5 | shared resolver: call-time, loopback-only, accept-set (positive AND negative), all channels, both helpers, every dsn entry point |
| AC-M6 | mech spec §5 | three neighbour-overlap containers asserted (measured/static per fixed assignment) |
| AC-M7 | mech spec §5 | branch A gates + CI green; six archives + watch flip, markers stripped (A7) |
| AC-U1 | UI spec §5 | footer box clears the bar at 390 scrolled to end; report trigger hit-testable |
| AC-U2 | UI spec §5 | short-page anchored geometry in both width regimes |
| AC-U3 | UI spec §5 | band structure + longest-stale real-browser oracle + unchanged modal |
| AC-U4 | UI spec §5 | avatar menu full contract; identity-less standalone toggle; admin nav untouched |
| AC-U5 | UI spec §5 | connector band assertion + state colors at both steps x both viewports; native numeric baseline; rationale-rot sites updated |
| AC-U6 | UI spec §5 | dual design gates run with §3.3 markers; suites + CI green; three archives with markers stripped |

<!-- tasks: depth=2 -->

## Task A1 — eslint array-join comment (own commit)

<!-- task: red=`rg -q 'hand on initial canonicalization' eslint.config.mjs` ac=AC-M1 -->

Mech spec §2.1. TDD disposition: N/A for behavior (declared); red column = the stale-phrase grep above on the CONTIGUOUS token (the phrase wraps mid-line; `linted by hand` never appears on one line — plan R1 F3): it matches before the edit and must not match after. Second clause → pointer at `tests/specLint/canonicalClassCallee.test.ts`. OWN commit: `chore(infra): eslint array-join comment points at the zero-tolerance guard`.

## Task A2 — themeTokenArrowBan guard (RED) + arrow sweep + truthful globals comment (GREEN)

<!-- task: red=`pnpm vitest run tests/specLint/themeTokenArrowBan.test.ts` ac=AC-M1 -->

Mech spec §2.2. Write the guard first: parse `app/globals.css` `@theme` for declared token names EXCLUDING the `--breakpoint-*` namespace (spec §4 limit 6) (premise: ≥30 parsed, via `tests/_shared/premise.ts`); scan tracked `.ts`/`.tsx` under `app/ components/ lib/` for string-literal arrow uses of covered tokens; report file:line; comment-only lines excluded. **Executable self-test fixtures land IN the guard file, in the same commit (plan R1 F4 — the scanner's claims are planted as positive AND negative shapes, since zero live breakpoint arrows exist to exercise the exclusion):** a covered-token arrow string → flagged; a `--breakpoint-sm` arrow → NOT flagged; a non-theme variable arrow → NOT flagged; a comment-only occurrence → NOT flagged; a canonical utility → NOT flagged. Mutation families for this guard, enumerated for its review: token-parse widening/narrowing, namespace-exclusion removal, comment-stripping removal, extension-set narrowing — each killed by one of the fixtures above or the premise. Observe RED on the live tree (the shadow-arrow census; record it in the commit). Sweep every census hit to its canonical utility; rewrite the `app/globals.css` enforcement claim to the MEASURED mechanism (spec §2.2 part 2). Guard green; `pnpm lint` + `pnpm typecheck` green; `tests/specLint/canonicalTokenIdentity.test.ts` untouched and green. Commit `refactor: ban @theme-token arrow forms via derived guard; canonicalize hits`.

## Task A3 — cn-wrap the nine dark consts

<!-- task: red=`pnpm vitest run tests/specLint/canonicalClassConstWrap.test.ts` ac=AC-M2 -->

Mech spec §2.3. Step 1 (executable RED): structural case asserting each of the nine consts' initializers (or Record values) is a `cn(...)` call — fails today against the named production lines. Step 2 (evidence layer): plant `min-h-[44px]` per file, record lint SILENCE; wrap all nine; plants now REPORTED (premise); remove plants; fix what lint newly reports (known: `THUMB_BASE` → `size-5`). Step 3: census sweep of the const/object-value shape over `components/ app/`; dispose every hit in the PR body. Ordering note vs A2: the A2 guard scans string literals for ARROW forms only — cn-wrapping does not move any string out of A2's scan space, so A2 and A3 commute; execute in numbered order regardless. Commit `refactor: cn-wrap lint-dark class consts (nine sites)`.

## Task A4 — transportTileVisible pin set (observed-RED)

<!-- task: red=`pnpm vitest run tests/visibility/scopeTiles.test.ts` ac=AC-M4 -->

Mech spec §2.5. Eight-fixture pin set; every leg has NO resolved owner ids, `premise` on that emptiness above the first pin. Observed-RED: locally neuter the multi-token surname branch in `lib/data/nameMatch.ts`, observe positive fixtures FAIL, restore, all green; transcript in the commit. `rg -n 'Bill Werner|William Werner' tests/visibility` flips to hits. Commit `test(visibility): pin transportTileVisible fuzzy-name fallback (observed-RED)`.

## Task A5 — shared psql-target resolver: call-time + accept-set refusal, both helpers

<!-- task: red=`pnpm vitest run tests/e2e/helpers/lockedCrewRestriction.unit.test.ts` ac=AC-M5 -->

Mech spec §2.6. Extract ONE resolver consumed by `lockedCrewRestriction.ts` AND `devCaptureStaged.ts`; `devCaptureStaged`'s existing protections carry over verbatim (the allowlist only tightens). Unit suite first (confirm/add vitest include for `tests/e2e/helpers/*.unit.test.ts` in the same commit if absent): (a) non-loopback hostname → refusal (RED today); (b) loopback + `?host=`/`?hostaddr=`/`?service=` and an arbitrary unlisted param → each refused BY NAME; (c) **positive accept-set membership (plan R1 F5): loopback URLs carrying `connect_timeout`, `application_name`, and `sslmode` — each individually and combined — RESOLVE successfully**, so a refuse-everything resolver fails; (d) env change between import and call honored; (e) child env scrubbed of every `PG*` var AND `PGSERVICEFILE` pointed at an empty path (spawn stubbed, env captured); (f) loopback + `LOCKED_FIXTURE_ALLOW_REMOTE=1` passes through (opt-in restores ambient env); (g) EVERY dsn entry point routes through the resolver — `seedStagedRow(options.dsn)` (:538) and the `runLockedSql` dsn param. Implement; re-run the SCOPED sweep `rg -n 'TEST_DATABASE_URL \?\?' tests/e2e/helpers --glob '*.ts'` and reconcile in the PR body. Commit `fix(infra): shared psql target resolver — call-time, loopback-only, accept-set`.

## Task A6 — neighbour-overlap assertions (fixed per-container forms)

<!-- task: red=`pnpm exec playwright test tests/e2e/tap-target-floor.layout.spec.ts` ac=AC-M6 -->

Mech spec §2.7, assignment FIXED: HelpSheet close (`HelpSheet.tsx:167`) = MEASURED (open sheet, `getComputedStyle` gap ≥ the suite's band constant); `Step3Review.tsx:1312` + `StagedReviewCard.tsx:464` = STATIC PIN (source-scan: cited container still carries `gap-*` ≥ band; premise: class string found). RED protocol: locally set each covered container to `gap-0`, observe fail (mutant #14 shape by name), restore; transcript in the commit. Existing suite boot + hydration gates unchanged. Commit `test(e2e): pin tap-target expansion-band clearance`.

## Task A7 — branch A gates, graduations, PR, merge (plan R1 F2)

<!-- task: red=`rg -q 'BL-SHADOW-TILE-ARROW-SYNTAX' BACKLOG-archive.md` ac=AC-M3,AC-M7 -->

The red command exits 1 today (entry not archived) and exits 0 only after graduation lands — a discriminating flip. Steps, in order: (1) run the invariant-8 dual design gate (both halves, canonical v3 setup) on the branch diff — zero expected visual delta is the expected outcome, and any finding is dispositioned; append the branch-A block + the exact §3.3 grammar marker line to this directory's closeout file; (2) full local verification: `pnpm test`, `pnpm typecheck` (vitest AND playwright configs), `pnpm exec eslint .`, `pnpm format:check`; (3) ledger commit: archive the six graduating entries into `BACKLOG-archive.md` with resolution headers, flip `BL-TAP-TARGET-SPEC-MUTATION-ENROLMENT` to watch with the harness probe + trigger, STRIP every branch marker in the same commit (`tests/docs/_metaLedgerInProgress.test.ts` green); (4) push, PR, whole-diff cross-model review to APPROVE (split briefs if large), real CI green, `gh pr merge --merge` in the same turn, ff-sync the main checkout to `0  0`. Commits: `docs(plan): branch A closeout + gate marker`, `docs(plan): graduate quick-wins-2 mech entries`.

## Task B1 — crew-shell flex chain + shell-level bar clearance (real-browser DI proof)

<!-- task: red=`pnpm exec playwright test tests/e2e/crew-page.spec.ts -g "footer"` ac=AC-U1,AC-U2 -->

UI spec §2.1. RED: new inv8 footer clauses written first — 390×844 scrolled to end: `page-footer` BOX bottom ≤ bar top; constructed-short case: footer bottom at `viewport.bottom − 60` within 0.5px (<720px; the LITERAL clearance constant from the header table, never read back from the implemented padding — plan R1 F6) / `viewport.bottom` (≥720px). Implement: `crew-shell` → `flex min-h-0 flex-1 flex-col` + `pb-[calc(var(--spacing-tap-min)+env(safe-area-inset-bottom)+1rem)] min-[720px]:pb-0`; reduce `<main>`'s now-redundant mobile clearance (`CrewSections.tsx:115`) to the ordinary rhythm value in the same commit. DI table from spec §2.1 verbatim as the assertion list. Commit `fix(crew-page): restore footer flex chain; bar clearance below the footer box`.

## Task B2 — footer band (browser oracle IN the RED set; suites + shots updated in-commit)

<!-- task: red=`pnpm exec playwright test tests/e2e/crew-page.spec.ts -g "footer band"` ac=AC-U1,AC-U3 -->

UI spec §2.2. RED set written FIRST and observed failing (plan R1 F7 — the discriminating layout proofs are e2e, so they lead): (i) the longest-catalog-stale-string case at 390px (no horizontal overflow, text cell and icon rects disjoint, 44px icon floor); (ii) `elementFromPoint` at the trigger centre hits the trigger; (iii) the jsdom band suite (three freshness states in the [wrapping text cell][icon] structure; icon accessible name; `showId`-absent guard; both existing ReportButton variants regression-covered). Implement the band; **in the SAME commit** (plan R1 F8 — no intermediate red commits): re-target the existing footer report-trigger locators (`crew-page.spec.ts` :1518-1533 region) and re-capture the six WebPs `crew-preview-{today,gear,schedule}-mobile` × light/dark FROM the pinned image `--platform linux/amd64` (pixel-diff first; justify in the PR body). **Interim toggle safety:** this commit replaces the Footer ThemeToggle with the header STANDALONE toggle (spec §2.3 guard-condition form) so the switch never vanishes; B3 upgrades it to the avatar menu. Commit `feat(crew-page): one-row footer band, icon-only report; toggle to header (standalone)`.

## Task B3 — header avatar menu (identity suites, picker-flow, transition audit, shots — all in-commit)

<!-- task: red=`pnpm vitest run tests/components/auth/avatarMenu.test.tsx` ac=AC-U4 -->

UI spec §2.3. RED: jsdom suite — avatar trigger (initials + `avatarColor` swatch, `aria-haspopup`/`aria-expanded`; accessible name CONSTRUCTED from non-empty [name, role, "account menu"], all four partial-identity cases, both-blank switches the menu to `aria-label="Account menu"` with the header omitted); popover with identity header outside the item list + `aria-labelledby`; theme row `menuitemcheckbox` + `aria-checked` flip without closing (dataset/localStorage handshake asserted); person row = the shipped server-action FORM (hidden `slug`/`shareToken`/`showId` pinned) with `role="menuitem"` submit; full keyboard map. **Executable transition audit in the same suite (plan R1 F12), inventory table from spec §2.3 included in the task body at execution:** open applies the `duration-fast` enter treatment (transition/animation properties asserted), close applies the reverse, `motion-reduce` emulation renders both instant, and the compound case (theme flip while open, then Escape) closes cleanly with focus returned. **In the SAME commit** (plan R1 F8): rewrite the four identity-chip suites (`IdentityChip.test.tsx`, `identityChipSrSeparator.test.tsx`, `_metaPickerRoleChipContract.test.ts`, `Header.test.tsx` — contracts carried over), re-target `picker-flow.spec.ts`'s closed-menu identity assertions (:151 + siblings) and `crew-page.spec.ts` :1099, and re-capture the six WebPs again (the header changed). Identity-less Header keeps the standalone toggle. Commit `feat(crew-page): header avatar menu — theme switch + person switch`.

## Task B4 — theme-toggle e2e rewrite + CI wiring guards

<!-- task: red=`pnpm exec playwright test tests/e2e/theme-toggle.spec.ts` ac=AC-U4 -->

UI spec §2.4 + plan R1 F10. Two arms: (a) admin-fixture recipe → STANDALONE toggle at 390px (the 760px workaround block deleted with its reason), both browser projects as today; (b) crew identity via the `picker-flow.spec.ts` recipe → avatar menu → theme item → dataset assertion at 390px, **Chromium-project-gated** (the picker identity flow does not persist under WebKit), with an explicit hydration gate on the avatar island (actionability + a menu-open retry loop bounded by the file's timeout constants — never `networkidle` alone) before the first click. Update `scripts/check-crew-e2e-executed.mjs`'s execution-count expectations and `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` for the new case/project matrix in the same commit. Commit `test(e2e): theme toggle via avatar menu; wiring guards updated`.

## Task B5 — branch B design gate

<!-- task: red=`rg -q 'branch B' docs/superpowers/plans/2026-08-09-quick-wins-2/closeout.md` ac=AC-U6 -->

Run the invariant-8 dual design gate (both halves, canonical v3 setup) on the branch diff; P0/P1 fixed or DEFERRED.md-dispositioned. The red command exits 1 until this task appends the branch-B findings block + the exact §3.3 grammar marker to the closeout file (created here if branch A has not already; either way the branch-B block is new — the grep is on the block heading, so it discriminates). Commit `docs(plan): branch B closeout + gate marker`.

## Task B6 — branch B graduation + PR

<!-- task: red=`rg -q 'BL-CREW-FOOTER-OBSCURED-BY-FIXED-BOTTOM-BAR' BACKLOG-archive.md` ac=AC-U6 -->

Red exits 1 today; 0 after graduation (plan R1 F9's discriminating flip). Archive both crew-footer entries with markers stripped in the same commit; whole-diff cross-model review to APPROVE; real CI green; `gh pr merge --merge` same turn; ff-sync to `0  0`.

## Task C1 — connector renders (sole-child nav stretch; step-state + color oracle)

<!-- task: red=`pnpm exec playwright test tests/e2e/canonical-class-dimensions.spec.ts` ac=AC-U5 -->

UI spec §3. RED: tripwire flips to the BAND assertion (width >0 ∧ ≤60, height 1) at `?step=1` AND `?step=3`, each at 390px and 900px (URL step hint via `pickStep`; verify the indicator renders at `?step=3` under the suite fixture — if gated blank, seed `maxReachedStep` for the constructed case), **plus the state-color oracle (plan R1 F11): at `?step=3` the connector behind the completed steps computes `background-color` equal to the resolved `--color-border-strong` and the ahead connector equals resolved `--color-border` (both read via `getComputedStyle` against the token values resolved from the live stylesheet, so the two connectors must differ)**. Fails against shipped 0-width. Implement: `flex-1 min-w-0` on the StepIndicator nav (sole child — probed). Baseline: `canonical-dimensions.json` updates through its NATIVE numeric path (`lifecycle-layout-e2e.yml:11`; no Docker step). Update the :91-95 tripwire comment + the three rationale-rot sites (`step3-review-page.layout.spec.ts` nav transcription, `tap-target-floor.layout.spec.ts` 0px rationale, `canonicalTokenIdentity.test.ts` browser-proof rationale). Commit `feat(admin): render the wizard step connector hairline`.

## Task C2 — branch C gate + graduation + PR + final closeout

<!-- task: red=`rg -q 'BL-WIZARD-CONNECTOR-MAXW-INERT' BACKLOG-archive.md` ac=AC-U5,AC-U6 -->

Red exits 1 today; 0 after graduation. Run the dual design gate on the C diff; append the branch-C block + §3.3 marker to the closeout file **on this branch, before the merge** (plan R1 F13 — closeout edits never land after the final review; the C PR's reviewed diff includes them); archive `BL-WIZARD-CONNECTOR-MAXW-INERT` with marker stripped in the same commit; cross-model review to APPROVE; CI green; merge same turn; ff-sync to `0  0`.

<!-- tasks: end -->

## e2e harness readiness (corrected per plan R1 F10)

- Boot: `playwright.config.ts` webServer — `pnpm dev` locally, `pnpm build && pnpm start` in CI, on `E2E_PORT`/3000; no new server modes.
- Hydration gates: crew-page cases reuse the file's settle helpers; the avatar-menu arm adds an explicit island-hydration gate (actionability + bounded menu-open retry) because the picker recipe's own gates prove crew-shell visibility, not the new client island; the constructed-short case waits on a rect predicate, not a sleep.
- Detach safety: `elementFromPoint` + rect samplers run inside single `page.evaluate` calls that re-query by testid.
- Project matrix: `theme-toggle.spec.ts` runs two arms — arm (a) on both projects, arm (b) Chromium-gated; the execution-count guard and the CI-wiring meta-test are updated with the matrix (B4).

## Closeout

The closeout file in this directory accretes per implementing branch (A7, B5, C2) and every block lands on its own branch BEFORE that branch's final review and merge: §12-style findings/dispositions per branch, the §3.3 gate marker lines, the observed-RED transcripts index, and the census/sweep dispositions.
