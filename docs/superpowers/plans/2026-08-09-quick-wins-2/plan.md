# Quick wins 2 — implementation plan (three branches)

> **For agentic workers:** execute task-by-task per `HANDOFF.md` in this directory. Specs: `docs/superpowers/specs/2026-08-09-quick-wins-2-mech.md` (Branch A) and `docs/superpowers/specs/2026-08-09-crew-chrome-wizard-connector.md` (Branches B, C). Spec wins on any conflict (invariant 7). Every plan-wide invariant in `AGENTS.md` binds; TDD per task (invariant 1); commit per task (invariant 6).

## Branch topology and order

| Branch | Spec | Scope |
| --- | --- | --- |
| A `fix/quick-wins-2-mech` | mech spec §2 | Tasks A1-A6 |
| B `feat/crew-chrome-footer-avatar` | UI spec §2 | Tasks B1-B6 |
| C `feat/wizard-step-connector` | UI spec §3 | Tasks C1-C2 |

Branches are independent (no shared files); ship A → B → C to keep review scopes tight. Each branch: fresh worktree off `origin/main`, `pnpm install`, `pnpm worktree:link-env`, `pnpm preflight`, `pnpm ledger:claims --check <its entry ids>` then flip each entry's marker from `docs/quick-wins-2-specs` to the implementation branch, commit, push immediately (invariant 12).

## Meta-test inventory (declared per writing-plans rule)

- CREATES: `tests/specLint/` "themeTokenArrowBan.test.ts" (A2, derived-cover guard over declared `@theme` tokens); the cn-initializer structural case (A3); the shared-resolver unit suite (A5).
- EXTENDS: `tests/e2e/tap-target-floor.layout.spec.ts` (A6); `tests/visibility/scopeTiles.test.ts` (A4); `tests/e2e/crew-page.spec.ts` inv8 (B1/B4); `tests/e2e/canonical-class-dimensions.spec.ts` (C1); the four identity-chip component suites (B3/B4 rewrite).
- Registries: none of `_metaInfraContract` / `_metaMutationSurfaceObservability` / advisory-lock apply — no Supabase call sites, no mutation surfaces, no locks touched. Declared: none applies, by reason above.

## Pre-verified code facts (probed 2026-08-09, cited in the specs)

- `StepIndicator` is the ONLY child of its `justify-between gap-3` row (`components/admin/OnboardingWizard.tsx:738-740`).
- `tests/e2e/_tapTargetFloorLiveEntry.tsx` mounts `HelpSheet` (:180) and `HelpTooltip` (:187) directly; `Step3Review`/`StagedReviewCard` containers are NOT mounted; `HelpSheet.tsx:167`'s `gap-3` row IS (inside the opened sheet).
- Mutation harness is vitest-child-only (`tests/mutation/guardSurfaces.gate.test.ts:11`).
- `Footer` sole importer: `_CrewShell.tsx`. AdminNav keeps its own ThemeToggle (`AdminNav.tsx:188`).
- `theme-toggle.spec.ts` signs in as the ADMIN fixture → `identityChip=null` → it can only reach the standalone toggle; crew identity comes from the `picker-flow.spec.ts` recipe (R1 F5).
- ESLint canonicalizes 29 of 35 `-runtime` tokens; silent set = 2 shadow + 4 color tokens (R1 probe) — which is why A2's guard derives from ALL declared `@theme` tokens, not lint behavior.

## Acceptance-criteria map (ids resolved against the specs)

| id | Source | One-line summary |
| --- | --- | --- |
| AC-M1 | mech spec §5 | eslint comment (own commit) + measured globals claim + themeTokenArrowBan RED-then-green with census |
| AC-M2 | mech spec §5 | nine consts cn-wrapped; plant silence/report observations recorded; census dispositions |
| AC-M3 | mech spec §5 | mutation-enrolment entry re-dispositioned to watch with probe (ledger-only; folded into branch A's closing commits) |
| AC-M4 | mech spec §5 | transport pin set green with observed-RED transcript + empty-owner-ids premise |
| AC-M5 | mech spec §5 | shared resolver: call-time, loopback-only, accept-set, all channels, both helpers, every dsn entry point |
| AC-M6 | mech spec §5 | three neighbour-overlap containers asserted (measured/static per fixed assignment) |
| AC-M7 | mech spec §5 | branch A suite/typecheck/lint/format + real CI green; six archives + watch flip, markers stripped |
| AC-U1 | UI spec §5 | footer box clears the bar at 390 scrolled to end; report trigger hit-testable |
| AC-U2 | UI spec §5 | short-page anchored geometry in both width regimes |
| AC-U3 | UI spec §5 | band structure + longest-stale real-browser oracle + unchanged modal |
| AC-U4 | UI spec §5 | avatar menu full contract; identity-less standalone toggle; admin nav untouched |
| AC-U5 | UI spec §5 | connector band assertion at both steps x both viewports; native numeric baseline; rationale-rot sites updated |
| AC-U6 | UI spec §5 | impeccable dual gates; suites + CI green; three archives with markers stripped |

<!-- tasks: depth=2 -->

## Task A1 — eslint array-join comment (own commit)

<!-- task: red=`rg -q 'linted by hand' eslint.config.mjs` ac=AC-M1 -->

Mech spec §2.1. TDD disposition: N/A for behavior (declared); red column = the stale-text grep above (matches before; no match after). Second clause → pointer at `tests/specLint/canonicalClassCallee.test.ts`. OWN commit (R1 F5): `chore(infra): eslint array-join comment points at the zero-tolerance guard`.

## Task A2 — themeTokenArrowBan guard (RED) + arrow sweep + truthful globals comment (GREEN)

<!-- task: red=`pnpm vitest run tests/specLint/themeTokenArrowBan.test.ts` ac=AC-M1 -->

Mech spec §2.2. Write the guard first: parse `app/globals.css` `@theme` for declared token names EXCLUDING the `--breakpoint-*` namespace (no token-preserving canonical utility exists there — spec §4 limit 6; the three live breakpoint arrows stay untouched) (premise: ≥30 parsed, via `tests/_shared/premise.ts`); scan tracked `.ts`/`.tsx` under `app/ components/ lib/` for string-literal `<utility>-(--<token>)` arrow uses of covered tokens; report file:line; comment-only lines excluded. Observe RED; the RED output IS the sweep census (record it in the commit). Sweep every hit to its canonical utility; rewrite the `app/globals.css` enforcement claim to the MEASURED mechanism (plugin-enforced majority; measured silent residue = 2 shadow + 4 named color tokens; this guard closes the class). Guard green; `pnpm lint` + `pnpm typecheck` green; `tests/specLint/canonicalTokenIdentity.test.ts` untouched and green (zero visual delta). Commit `refactor: ban @theme-token arrow forms via derived guard; canonicalize hits`.

## Task A3 — cn-wrap the nine dark consts

<!-- task: red=`pnpm vitest run tests/specLint/canonicalClassConstWrap.test.ts` ac=AC-M2 -->

Mech spec §2.3. Step 1 (executable RED, R1 F4): structural case asserting each of the nine consts' initializers (or Record values) is a `cn(...)` call — fails today against the named production lines. Step 2 (evidence layer): plant `min-h-[44px]` per file, record lint SILENCE; wrap all nine; plants now REPORTED (premise); remove plants; fix what lint newly reports (known: `THUMB_BASE` → `size-5`). Step 3: census sweep of the const/object-value shape over `components/ app/`; dispose every hit in the PR body. Commit `refactor: cn-wrap lint-dark class consts (nine sites)`.

## Task A4 — transportTileVisible pin set (observed-RED)

<!-- task: red=`pnpm vitest run tests/visibility/scopeTiles.test.ts` ac=AC-M4 -->

Mech spec §2.5. Eight-fixture pin set; every leg has NO resolved owner ids, `premise` on that emptiness above the first pin. Observed-RED: locally neuter the multi-token surname branch in `lib/data/nameMatch.ts`, observe positive fixtures FAIL, restore, all green; transcript in the commit. `rg -n 'Bill Werner|William Werner' tests/visibility` flips to hits. Commit `test(visibility): pin transportTileVisible fuzzy-name fallback (observed-RED)`.

## Task A5 — shared psql-target resolver: call-time + loopback refusal, both helpers

<!-- task: red=`pnpm vitest run tests/e2e/helpers/lockedCrewRestriction.unit.test.ts` ac=AC-M5 -->

Mech spec §2.6 (three parts + entry-point routing, R1 F2/F3 + R2 F2). Extract ONE resolver consumed by `lockedCrewRestriction.ts` AND `devCaptureStaged.ts`, adopting devCaptureStaged's existing allowlist posture (:54 region) as the floor — its port/database/credential protections must NOT regress (assert them in the suite). Unit suite first (confirm/add vitest include for `tests/e2e/helpers/*.unit.test.ts` in the same commit if absent): (a) non-loopback hostname → refusal (RED today); (b) loopback hostname + `?host=`/`?hostaddr=`/`?service=` (and any unknown target-class param, refused by allowlist) → refusal; (c) env change between import and call honored (call-time); (d) child env scrubbed of every `PG*` var AND `PGSERVICEFILE` pointed at an empty path (spawn stubbed, env captured — the default service file channel); (e) loopback and `LOCKED_FIXTURE_ALLOW_REMOTE=1` pass through (opt-in restores ambient env); (f) EVERY dsn entry point routes through the resolver — `seedStagedRow(options.dsn)` (:538) and the `runLockedSql` dsn param, not only the env default. Implement; re-run the SCOPED sweep `rg -n 'TEST_DATABASE_URL \?\?' tests/e2e/helpers --glob '*.ts'` and reconcile in the PR body. Commit `fix(infra): shared psql target resolver — call-time, loopback-only, all channels`.

## Task A6 — neighbour-overlap assertions (fixed per-container forms)

<!-- task: red=`pnpm exec playwright test tests/e2e/tap-target-floor.layout.spec.ts` ac=AC-M6 -->

Mech spec §2.7, assignment FIXED (R1 F6): HelpSheet close (`HelpSheet.tsx:167`) = MEASURED (open sheet, `getComputedStyle` gap ≥ the suite's band constant); `Step3Review.tsx:1312` + `StagedReviewCard.tsx:464` = STATIC PIN (source-scan: cited container still carries `gap-*` ≥ band; premise: class string found). RED protocol: locally set each covered container to `gap-0`, observe fail (mutant #14 shape by name), restore; transcript in the commit. Existing suite boot + hydration gates unchanged. Commit `test(e2e): pin tap-target expansion-band clearance`.

## Task B1 — crew-shell flex chain + shell-level bar clearance (real-browser DI proof)

<!-- task: red=`pnpm exec playwright test tests/e2e/crew-page.spec.ts -g "footer"` ac=AC-U1,AC-U2 -->

UI spec §2.1 (geometry per R1 F1). RED: new inv8 footer clauses written first — 390×844 scrolled to end: `page-footer` BOX bottom ≤ bar top; constructed-short case: footer bottom at `viewport.bottom − clearance` (<720px, 0.5px tolerance) / `viewport.bottom` (≥720px). Implement: `crew-shell` → `flex min-h-0 flex-1 flex-col` PLUS shell bottom padding `pb-[calc(var(--spacing-tap-min)+env(safe-area-inset-bottom)+…)] min-[720px]:pb-0` (pin the calc against the measured 53.3px bar with margin); reduce `<main>`'s now-redundant mobile clearance (`CrewSections.tsx:115`) to the ordinary rhythm value in the same commit. DI table from spec §2.1 verbatim as the assertion list. Commit `fix(crew-page): restore footer flex chain; bar clearance below the footer box`.

## Task B2 — footer band (wrapping text cell + icon-only report)

<!-- task: red=`pnpm vitest run tests/components/layout/footerBand.test.tsx` ac=AC-U3 -->

UI spec §2.2. RED: jsdom suite — three freshness states render inside the [text cell][icon] structure; ReportButton icon variant with accessible name `Something looks wrong?`; `showId` absent → no trigger; both existing ReportButton variants regression-covered. Implement: single-row band (`min-w-0 flex-1` text cell wraps, `shrink-0` icon), `bg-surface-raised`, top hairline; glyph from shipped lucide set (impeccable call). **Interim toggle safety:** in THIS task the Footer's ThemeToggle is replaced by the header STANDALONE toggle (spec §2.3 guard-condition form) so the switch never vanishes between commits; B3 upgrades it to the avatar menu. Then e2e: long-stale oracle at 390px (longest catalog stale string; no overflow, rects disjoint, 44px floor) + `elementFromPoint` hits the trigger. Commit `feat(crew-page): one-row footer band, icon-only report; toggle to header (standalone)`.

## Task B3 — header avatar menu

<!-- task: red=`pnpm vitest run tests/components/auth/avatarMenu.test.tsx` ac=AC-U4 -->

UI spec §2.3 (full contract per R1 F3/F4/F6 + R2 F6). RED: jsdom suite — avatar trigger (initials + `avatarColor` swatch, `aria-haspopup`/`aria-expanded`; accessible name CONSTRUCTED from non-empty [name, role, "account menu"] — all four partial-identity cases asserted, both-blank switches the menu to `aria-label="Account menu"` with the header omitted); popover with identity header OUTSIDE the item list + `aria-labelledby`; theme row `menuitemcheckbox` + `aria-checked` flip without closing (dataset/localStorage handshake asserted); person row = the shipped server-action FORM (hidden `slug`/`shareToken`/`showId` pinned) with `role="menuitem"` submit; full keyboard map (open-focus first/last, arrow wrap, Home/End, Tab exits + closes, Escape returns focus, outside-down closes); blank-role no-separator per the sr-separator contract. Rewrite the four identity-chip suites (`IdentityChip.test.tsx`, `identityChipSrSeparator.test.tsx`, `_metaPickerRoleChipContract.test.ts`, `Header.test.tsx`) against the new chrome, carrying their contracts over. Identity-less Header keeps the standalone toggle (from B2). Transition inventory honored (`motion-reduce` instant). Commit `feat(crew-page): header avatar menu — theme switch + person switch`.

## Task B4 — e2e rewrite + screenshots

<!-- task: red=`pnpm exec playwright test tests/e2e/theme-toggle.spec.ts` ac=AC-U1,AC-U4 -->

UI spec §2.4. `theme-toggle.spec.ts` two arms: (a) admin-fixture recipe → STANDALONE toggle at 390px (760px workaround block deleted with its reason); (b) crew identity via the `picker-flow.spec.ts` recipe → avatar menu → theme item → dataset assertion at 390px; tap-floor cases target avatar + menu items. `picker-flow.spec.ts` closed-menu identity assertions (:151 + three siblings) re-target avatar accessible name / open-menu header. `crew-page.spec.ts` :1099 direct toggle interaction re-targets. Report-trigger locators (:1518-1533) re-target by role+name. Six WebPs `crew-preview-{today,gear,schedule}-mobile` × light/dark (`help-screenshots.manifest.ts:95` region): pixel-diff first, re-capture FROM the pinned image `--platform linux/amd64`, justify each change in the PR body; mobile-safari suite re-runs. Commit `test(e2e): crew chrome e2e; screenshot re-baseline`.

## Task B5 — impeccable dual gate (branch B)

<!-- task: red=`test -f docs/superpowers/plans/2026-08-09-quick-wins-2/closeout.md` ac=AC-U6 -->

`/impeccable critique` + `/impeccable audit` on the branch diff, canonical v3 setup gates. P0/P1 fixed or DEFERRED.md-dispositioned; findings + dispositions into this directory's `closeout.md` §12.

## Task B6 — branch B graduation + PR

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` ac=AC-U6 -->

Archive both crew-footer entries, markers stripped in the same commit; whole-diff cross-model review to APPROVE (split briefs if large); real CI green; merge; ff-sync.

## Task C1 — connector renders (sole-child nav stretch; step-state oracle)

<!-- task: red=`pnpm exec playwright test tests/e2e/canonical-class-dimensions.spec.ts` ac=AC-U5 -->

UI spec §3 (R1 F8/F9). RED: tripwire flips to the BAND assertion (width >0 ∧ ≤60, height 1) at `?step=1` AND `?step=3`, each at 390px and 900px (URL step hint via `pickStep`; verify the indicator renders at `?step=3` under the suite fixture — if gated blank, seed `maxReachedStep` for the constructed case). Fails against shipped 0-width. Implement: `flex-1 min-w-0` on the StepIndicator nav (sole child — probed). Baseline: `canonical-dimensions.json` updates through its NATIVE numeric path (`lifecycle-layout-e2e.yml:11` — rect assertions, not a byte gate; no Docker step). Update the :91-95 tripwire comment + the three rationale-rot sites (`step3-review-page.layout.spec.ts` nav transcription, `tap-target-floor.layout.spec.ts` 0px rationale, `canonicalTokenIdentity.test.ts` browser-proof rationale). Commit `feat(admin): render the wizard step connector hairline`.

## Task C2 — impeccable dual gate (branch C) + graduation + PR

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` ac=AC-U5,AC-U6 -->

Dual gate on the C diff; findings to closeout §12. Archive `BL-WIZARD-CONNECTOR-MAXW-INERT`, marker stripped same commit; cross-model review; CI green; merge; ff-sync.

<!-- tasks: end -->

## e2e harness readiness (mandatory checklist)

- Boot: existing `playwright.config.ts` webServer (prod build; unchanged). No new server modes.
- Hydration gates: crew-page cases reuse the file's settle helpers (never bare `networkidle`); the constructed-short case waits on a rect predicate, not a sleep; the picker-recipe arm reuses picker-flow's own readiness gates.
- Detach safety: `elementFromPoint` + rect samplers run inside single `page.evaluate` calls that re-query by testid (no held handles across navigation).

## Closeout

`closeout.md` in this directory carries: §12 impeccable findings/dispositions per UI branch, the observed-RED transcripts index, the census/sweep dispositions, review-round corpus rows, and the machine-checkable marker line:

impeccable-gate: run — branches B and C are UI surfaces; branch A touches components/** class strings (zero-visual-delta, gate still run)
