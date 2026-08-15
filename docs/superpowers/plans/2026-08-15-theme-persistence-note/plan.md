# Theme persistence-failure note — implementation plan

> **For agentic workers:** execute task-by-task per `HANDOFF.md` in this directory (the Opus pane's entry point). The spec is `docs/superpowers/specs/2026-08-15-theme-persistence-note-design.md`; this plan carries its own adversarial-review gate below.

**Goal:** surface a failed theme persist write as a small inline note on both theme controls, with reliable polite announcement, per the spec's §2 design (hook `persistFailed` state with mount-sync preservation; always-mounted `role="status"` containers; shared copy const).

**Architecture:** one branch `feat/theme-persistence-note` off `origin/main`, TDD per task, impeccable dual gate (UI surface, Opus-owned), cross-model diff review, CI-green merge.

**Date:** 2026-08-15 · **Spec:** `docs/superpowers/specs/2026-08-15-theme-persistence-note-design.md` (spec-APPROVED, codex-guard R4 2026-08-15) · **Status:** DRAFT

## Global constraints

- AGENTS.md invariants exercised: 1 (TDD), 5 (no raw codes — plain copy), 6 (conventional commits), 8 (impeccable dual gate — this IS a UI surface: `components/layout/**`, `components/auth/**`), 11 (worktree-only), 12 (claims).
- Pre-code mechanical UI gate before writing component code: no em dash in the copy const; straight apostrophe (matches the 309 shipped catalog contractions); tap targets untouched; canonical classes `text-xs/relaxed text-text-subtle` only; no new tokens, no new contrast pins.
- The copy const is the single source (spec §2.2); both controls import it.

## Pre-draft verification pass (writing-plans rule; run 2026-08-15 in the authoring worktree)

- Hook state + silent catch: `components/layout/useAppliedTheme.ts` (`setTheme` try/catch; mount effect `setState({ mounted: true, theme: readAppliedTheme() })` at line 67 — the R1 F2 wipe the functional update repairs).
- Standalone control: `components/layout/ThemeToggle.tsx` (pre-mount click window documented at line 68; icon button classes). THREE consumers (spec §1.1 item 3 census): `components/layout/Header.tsx:141` (identity-less branch per line 123 comment), `components/admin/nav/AdminNav.tsx:210` (320px action cluster; its geometry e2e guard is `tests/e2e/appHealthIndicator.layout.spec.ts`), `app/help/_components/Header.tsx:18`.
- z-scale: semantic band `--z-index-dropdown` (`app/globals.css` z block); `z-dropdown` utility already in use (`components/diagrams/GalleryLightbox.tsx` Reset chip wrapper).
- Menu control: `components/auth/AvatarMenu.tsx` (hook at :96, theme row `menuitemcheckbox` at :314, `role="menu"` at :299, activation keeps menu open per :42 comment, `role="none"` precedent on the search form).
- Status-region prior art: `components/admin/FinalizeButton.tsx:549` (`FinalizeAnnouncer`, always-mounted); insertion trap `components/admin/ReSyncButton.tsx:147`.
- Small-note classes: `text-xs/relaxed text-text-subtle` (`components/admin/ShowRowActions.tsx:744`).
- Existing suites, located at plan time: `tests/components/auth/avatarMenu.test.tsx` (N3 extends it); no ThemeToggle or useAppliedTheme unit suite exists under `tests/components/` (N1/N2 files are genuinely new); `tests/e2e/theme-toggle.spec.ts` exists (N2b does NOT reuse it — new spec file keeps the storage-blocking init isolated).
- No screenshot baseline renders a failed-persist state (capture manifest checked — no regen expected; any local verification capture is followed by `git restore public/help/screenshots/`).

## Meta-test inventory (declared)

CREATES nothing; EXTENDS the e2e wiring surfaces for the ONE new Playwright spec (plan R1 F3, completed per plan R2 F1): the `desktop-chromium` `testMatch` alternation (`playwright.config.ts:97` region), the crew-e2e run-command list (`.github/workflows/crew-e2e.yml:185`), the fail-by-default enrollment + skip rows + case matrix + parity in `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` (lines 186/255/277/936 regions), and the exact-key executed threshold in `scripts/check-crew-e2e-executed.mjs` (line 72 region) — all wired in Task N2's RED so the spec is collected before it is observed red. Otherwise: no Supabase call, no mutation surface, no advisory lock, no timing constant (no setTimeout — the note has no auto-hide), no new token. The `tests/docs/` ledger meta-suites cover the archive by default.

## Layout-dimensions posture — declared

Spec §2.4 (Dimensional Invariants): none introduced — content-sized text regions, no fixed-dimension parent/flex-child relationship, so the classic parent/child equality task is N/A. The spec DOES require one real-browser geometry proof of a different shape (AC-10b, spec R3 F1): viewport-containment of the anchored bubble plus wrapper-box equality — task N2b below.

## e2e harness readiness (writing-plans rule, for N2b)

(a) Server boot: the existing e2e config's dev-server boot (`playwright.config.ts` webServer block — reuse, no new server mechanism); (b) readiness gate: await the header's rendered toggle (`data-testid="theme-toggle"` visible) before any assertion — never `networkidle` alone; storage blocking installed via `context.addInitScript` BEFORE navigation so the failed write is deterministic; (c) detach-safety: the bubble is queried after the click that creates it and never sampled across a navigation — no locator outlives its page.

## Acceptance criteria map (spec §3, referenced by the task markers)

- AC-1 signal on failure (both halves; repeated-failure shape).
- AC-2 silent on success.
- AC-3 clear on recovery.
- AC-4 announce reliability (container pre-exists).
- AC-5 copy single-source, no technical vocabulary, no em dash.
- AC-6 menu semantics (status node outside role=menu).
- AC-7 impeccable dual gate.
- AC-8 ledger archive.
- AC-9 pre-effect ordering preserved.
- AC-10 no in-flow growth (class contract) + AC-10b real-browser viewport containment.

## Tasks

<!-- tasks: depth=3 -->

### Task N1 — hook state (persistFailed, preserved across mount sync)

<!-- task: red=`pnpm vitest run tests/components/layout/useAppliedThemePersistFailure.test.ts` ac=AC-1,AC-3,AC-9 -->

RED: new file tests/components/layout/useAppliedThemePersistFailure.test.ts (renderHook). What is red and why: the returned object has no `persistFailed` property today (`components/layout/useAppliedTheme.ts` returns `{mounted, theme, isDark, setTheme}` only), so every case fails on the live tree.

1. `setItem` throwing (`vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); })`): after `setTheme("dark")`, `persistFailed === true` AND `document.documentElement.dataset.theme === "dark"` (absorb intact — both halves of AC-1).
2. Recovery: throwing write then working write → `persistFailed === false` (AC-3).
3. Pre-effect ordering (AC-9): call `setTheme` before the mount effect flushes (act-window sequencing), storage blocked; after effects flush, `persistFailed` is still `true` — the production line under test is the functional-update mount sync (spec §2.1, R1 F2).
4. OS-change path leaves the flag untouched.

GREEN: add `persistFailed` to state + both `AppliedTheme` variants; functional-update mount sync. Commit: `feat(crew-page): track theme persist failure in useAppliedTheme`

### Task N2 — standalone toggle note (anchored bubble)

<!-- task: red=`pnpm vitest run tests/components/layout/themeToggleNote.test.ts` ac=AC-1,AC-2,AC-4,AC-5,AC-10 -->

RED: new file (or extend the existing ThemeToggle suite per the locate-grep; new-file default). What is red and why: `ThemeToggle` renders a bare button today — no status container exists, so the pre-click `role="status"` query (AC-4) and the note-text assertions fail.

Cases: pre-click status container present and empty (AC-4, the ReSyncButton trap as a test); blocked write → note text equals the exported const (import it — single-source, AC-5); second blocked write keeps the note (AC-1 repeated-failure); fail-recover-fail re-empties then re-fills (the announceable transition); working storage → container stays empty through toggles (AC-2); copy const has no em dash and none of "localStorage"/"browser storage"/"cookies" (AC-5); the status node's class list names `absolute` and the wrapper is `relative inline-flex` — the out-of-flow class contract (AC-10); the empty container carries positioning classes only (no border/bg — chrome lives on the inner span rendered with text).

RED, second half (AC-10b, plan R1 F1 — the e2e case is observed failing BEFORE this task's GREEN, in the same task, so the same command goes red then green): author the new Playwright spec tests/e2e/theme-persistence-note.spec.ts AND its FULL enrollment contract IN THE SAME EDIT, mirroring `tests/e2e/theme-toggle.spec.ts`'s wiring row-for-row (plan R2 F1 — the crew-e2e contract has FOUR surfaces, all mandatory, all probed at plan time): (1) `playwright.config.ts` — add `theme-persistence-note` to the `desktop-chromium` testMatch alternation (line 97 region; NOT mobile-safari — the 320px containment cases are viewport-sized in-test); (2) `.github/workflows/crew-e2e.yml` — add the file to the run-command spec list (line 185) and the header census comments; (3) `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` — fail-by-default enrollment: add the spec to the wired-spec list (line 277 region), its per-spec skip-row entry (line 186 region, `[]` if no skips), and its expected-case matrix row (line 255 region), keeping the parity assertion (line 936 region) green; (4) `scripts/check-crew-e2e-executed.mjs` — the exact-key executed-count threshold row (line 72 region) with the spec's collected-case count. Run `pnpm vitest run tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` after wiring to prove enrollment. Then run `pnpm heavy pnpm exec playwright test tests/e2e/theme-persistence-note.spec.ts` and OBSERVE the visible-note locator fail (no markup yet). Cases (spec AC-10b): help header at a 320px viewport with `localStorage.setItem` throwing (`context.addInitScript` patching `Storage.prototype` BEFORE load) — click the toggle, assert the note is visible and `getBoundingClientRect()` sits fully inside the viewport (`left >= 0`, `right <= 320`); same on the admin nav consumer; wrapper box equals button box within 0.5px in both. Harness readiness (plan R1 F4): boot per the live config — local `pnpm dev`, CI `pnpm build && pnpm start` on the baseline port (`playwright.config.ts:263` webServer block); readiness gate is the HYDRATION MARKER pattern the existing theme-toggle suite uses for exactly this control (`tests/e2e/theme-toggle.spec.ts:227` — a visible SSR button is clickable before React attaches onClick, so visibility alone is insufficient); detach-safety: no locator outlives its page, no navigation between create and assert.

GREEN: `relative inline-flex` wrapper + always-mounted anchored status node (`absolute right-0 top-full mt-1 w-max max-w-36 break-words z-dropdown`) + chrome-bearing inner span conditional on `persistFailed`, per spec §2.2 — BOTH the unit file and the e2e spec now pass on their same commands. Fix-round regression check: `tests/e2e/appHealthIndicator.layout.spec.ts` passes UNMODIFIED in the pre-push gates.

Commit: `feat(crew-page): persist-failure note bubble on the standalone theme toggle`

### Task N3 — avatar-menu note

<!-- task: red=`pnpm vitest run tests/components/auth/avatarMenu.test.tsx` ac=AC-1,AC-4,AC-6 -->

RED: new cases in the EXISTING suite `tests/components/auth/avatarMenu.test.tsx` (verified present at plan time). What is red and why: the popover panel has no status sibling today. Cases: container present-and-empty when the menu is open, pre-failure (AC-4); blocked write via the theme row → note renders, menu still open; the status node is NOT a descendant of the `role="menu"` element and the menu's owned children are unchanged (AC-6, assert via DOM containment); close and re-open the popover with the flag set → note rendered on re-open (hook state survives, spec §2.1); repeated-failure and recovery rows as in N2.

GREEN: sibling status region after the menu element per spec §2.2. Commit: `feat(crew-page): persist-failure note in the avatar-menu popover`

### Task N4 — dual gate + ledger + close

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` ac=AC-7,AC-8 -->

ORDER IS BINDING — two rules hold simultaneously (plan R1 F5): the marker-stripping archive commit is the PR's LAST pre-merge commit, AND the final review round examines the diff that merges (archive included):

1. `/impeccable critique` + `/impeccable audit` on the unit diff (canonical v3 setup gates: context.mjs PRODUCT.md + DESIGN.md load → register read). P0/P1 fixed or DEFERRED-entried; findings + dispositions recorded in `closeout.md` in this plan directory with the marker line `impeccable-gate: critique+audit <date> — <disposition summary>` (AC-7).
2. Merge `origin/main`; full gates: `pnpm heavy pnpm test`, `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`.
3. Archive `BL-THEME-PERSISTENCE-FAILURE-IS-SILENT` as the intended-last commit (archive RED pattern: move WITH marker → `pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` fails by name → strip → green), recording §4 limits (AC-8).
4. Whole-diff codex-guard `--stage diff` review to APPROVE — the reviewed diff INCLUDES the archive commit, so the review covers exactly what merges. If a round returns findings: repair, RE-DO the archive commit on top (so it is last again), and dispatch the next round against the full diff. Merge only from a round that examined the final tree.
5. PR; real CI green → `gh pr merge --merge` same turn (no commits after the APPROVE-reviewed tree) → ff main → `0 0`.

Commit (step 3): `docs(backlog): archive BL-THEME-PERSISTENCE-FAILURE-IS-SILENT — note shipped on both controls`

<!-- tasks: end -->

## Adversarial review (cross-model)

- This plan: self-review → codex-guard `--stage plan --round <n>` to APPROVE before execution handoff (round cap 4).
- Implementation branch: whole-diff `--stage diff` review to APPROVE before merge (N4.4).

## Execution handoff

Handoff-by-overlap, the L-wave §3 order-binding protocol (plan R1 F6 — the transient dual-declaration is the DESIGNED handoff state, and the check's exit codes are read accordingly): FIRST the implementation branch `feat/theme-persistence-note` is created off `origin/main`; from the MAIN checkout, `pnpm ledger:claims --check BL-THEME-PERSISTENCE-FAILURE-IS-SILENT` is run EXPECTING exit 1 naming `docs/theme-persistence-note-spec` and ONLY it (the planned-handoff signature; any OTHER branch named = real collision, stop and reconcile); the implementation branch then marks the entry `**Status:** IN PROGRESS · **Branch:** feat/theme-persistence-note`, commits, pushes, and gets its ship-state marker file (stage "awaiting-implementer", `blockedOn: "awaiting Opus implementer pane"`, `next: "execute HANDOFF.md"`, NO sessionId). THEN the authoring branch strips its own marker in its last pre-merge commit and its PR merges — at no instant is the entry undeclared on origin. A fresh Opus pane executes from `HANDOFF.md` — UI work is Opus-owned per the AGENTS.md hard rule; its Step-0 claims check expects to see ONLY `feat/theme-persistence-note` (the authoring branch is merged and gone by then).

## Impeccable gate (closeout marker)

The unit's filled marker lands in this directory's `closeout.md` at close (N4.1).

impeccable-gate: pending — filled at N4.1 (critique + audit on the implementation diff)

## Self-review checklist (run before dispatching the plan review)

- [ ] Every named file/symbol re-grepped against the live tree.
- [ ] Anti-tautology: note-text expectations import the shared const (and the const's own content is asserted separately against the banned-vocabulary list); repeated-failure rows derive from one fixture; AC-4 queries the container BEFORE the failing click.
- [ ] `red=` validity: all three RED files are new; each task names the production line whose absence makes it fail.
- [ ] Snippets typechecked against strict tsconfig before dispatch.
- [ ] `pnpm spec:lint docs/superpowers/plans/2026-08-15-theme-persistence-note/plan.md` 0 hard.
- [ ] Numeric sweep after every repair round.
