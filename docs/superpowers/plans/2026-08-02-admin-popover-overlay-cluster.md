# Plan — Admin show-page popover/overlay-clip cluster

**Date:** 2026-08-02 · **Spec:** `docs/superpowers/specs/2026-08-01-admin-popover-overlay-cluster.md` (RATIFIED 2026-08-02, Codex APPROVE R7) · **Implementer:** Opus / Claude Code (UI surface — hard routing rule) · **Branch:** `fix/admin-popover-overlay-cluster`

> **For the implementing agent.** Work through the tasks in order; every checkbox is one action. Do not skip RED observations.
>
> **REQUIRED SUB-SKILL (every task): `superpowers:test-driven-development`.** Each T-block is one TDD cycle. Where a full test body is not printed, the quoted assertions are the complete required assertion set — write them verbatim into the named file.
>
> **REQUIRED EXECUTION SUB-SKILL: `superpowers:executing-plans`** (or `superpowers:subagent-driven-development` when tasks are dispatched to subagents) — task-by-task execution with review checkpoints.

**Goal:** close the six ratified backlog items — backdrop trigger hit-test, AttentionMenu/PublishedToggle clip capping + keyboard a11y, self-describing Archive confirm, jsdom-timer documentation, shared rAF coalescer — exactly as the ratified spec defines.

**Architecture:** two shared extractions (`lib/popover/rafCoalescer.ts (new)`, `components/admin/useFitWithinClip.ts (new)`) consumed by five components; one prop thread (`PublishedReviewModal → StatusStrip → ShareHub`); guard surface = the popover-overlay registry + a new AST adoption meta-test; verification = jsdom unit suites + one new standalone real-browser spec + restored T-BACKDROP assertions.

**Tech stack:** Next.js 16 / React 19 client components, Tailwind v4, Vitest + jsdom, Playwright (standalone esbuild harness), TypeScript compiler API for structural pins.

Execution contract: one task = failing test observed → minimal implementation → passing test observed → ONE commit (`--no-verify`). RED and GREEN land in the same commit; the RED failure is OBSERVED and its decisive line quoted in the commit body. All commands run from the worktree root. Two ratified exceptions (review R8 F1/F3), both mutation-free: T9 is a verification-only gate (delivers no tests and no code — every browser case lands RED-observed→GREEN→committed inside its owning implementation task, T3/T4/T6/T7) and T10 is a comment-only edit (spec §11: "no assertion change"). Neither has a RED step because neither changes behavior.

## 0. Pre-draft verification + declarations

- **Code-verification pass:** every file/symbol/line below verified against this worktree at plan time: ShareHub busy/toggle/backdrop/triggers/coalescer/focus-effect/ArchiveShowButton call site (`components/admin/showpage/ShareHub.tsx:186-209`, `components/admin/showpage/ShareHub.tsx:528-540`, `components/admin/showpage/ShareHub.tsx:651-724`, `components/admin/showpage/ShareHub.tsx:379-386`, `components/admin/showpage/ShareHub.tsx:629-631`, `components/admin/showpage/ShareHub.tsx:962-982`), StatusStrip props + ShareHub render (`components/admin/showpage/StatusStrip.tsx:98`, `components/admin/showpage/StatusStrip.tsx:414-422`), PublishedReviewModal menu state + strip render (`components/admin/showpage/PublishedReviewModal.tsx:301`, `components/admin/showpage/PublishedReviewModal.tsx:356`, `components/admin/showpage/PublishedReviewModal.tsx:905-912`), AttentionMenu (`components/admin/showpage/AttentionMenu.tsx:76-105`, `components/admin/showpage/AttentionMenu.tsx:120-147`), fit hook + pure core (`components/admin/ReSyncButton.tsx:79-146`, `lib/layout/fitWithinClip.ts:21-67`), HoverHelp coalescer (`components/admin/HoverHelp.tsx:309-316`), ArchiveShowButton (`components/admin/ArchiveShowButton.tsx:115-156`, `components/admin/ArchiveShowButton.tsx:244-324`), registry + detector (`tests/components/admin/showpage/popoverOverlayRegistry.ts:42-79`, `tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts:26-47`), pins (`tests/components/admin/showpage/shareHub.test.tsx:217`, `tests/components/admin/showpage/shareHub.test.tsx:280`, `tests/components/admin/showpage/shareHub.test.tsx:846-894`), armed-copy pins (`tests/components/admin/ArchiveShowButton.test.tsx:239-249`), toggle tests (`tests/components/admin/PublishedToggle.test.tsx`), T-S8 (`tests/components/admin/showpage/shareHubVisualViewport.test.tsx:164`), T-BACKDROP (`tests/e2e/admin-lifecycle-layout.spec.ts:623-666`), harness (`tests/e2e/_publishedReviewModalHarness.tsx:223`, `tests/e2e/_publishedReviewModalHarness.tsx:376`, `tests/e2e/_pillFocusLiveEntry.tsx:68-87`), baseline gates (`scripts/check-standalone-baseline.mjs:129-143`, `tests/ci/_metaSpecRegistration.test.ts:74`). Script names: `pnpm test` = `vitest run`, `pnpm typecheck` = `tsc --noEmit`, `pnpm lint` = `eslint`.
- **Meta-test inventory:** EXTENDS `tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts` (tightened import regex; two registry rows). CREATES `tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts (new)` (AST adoption pins). EXTENDS `tests/docs/_metaDeferralLedgerGraduation.test.ts` (six `BACKLOG_GRADUATED` rows, provenance `fix/admin-popover-overlay-cluster` — T12, review R9 F2). No Supabase call boundary, no admin-alert catalog, no email normalization, **no `pg_advisory*` (holder topology N/A)**, no mutation surface (no server-action/route edits — invariant 10 untouched).
- **e2e harness readiness:** boot = standalone self-hosted harness (esbuild live entry + `node:http`, template `tests/e2e/attention-pill-focus.spec.ts:38-99`); readiness gate = `window.__hydrated` (never `networkidle`); detach safety = drive via `window.__setItems` React state; every measurement re-queries elements inside the `evaluate` callback.
- **Sync pre-step (FIRST action of T1's session — review R9 F5):** the branch is ~156 commits behind `origin/main`, and main has since changed the very surfaces this plan edits (`tests/e2e/standalone.config.ts`, `tests/e2e/standalone-baseline.json`, a ~700-line extension of `tests/ci/_metaSpecRegistration.test.ts`, and both backlog ledgers). Before any task: `git fetch origin && git rebase origin/main`. Expected conflict surface: the `test(infra)` allowlist commit `7c684de20` vs main's `standalone.config.ts` edit — resolve by UNION of testMatch/allowlist entries. After the rebase: (1) re-run the §0 code-verification pass for every citation into the four moved surfaces (line numbers WILL have shifted; fix citations in place before executing tasks); (2) `pnpm install && pnpm preflight`; (3) full gate sanity: `pnpm test && pnpm typecheck && pnpm lint` green before T1's first RED. A final pre-push checkpoint (after T12, below) repeats the fetch/reconcile.
- **Worktree hygiene pre-step (before T1):** the clean standalone allowlist is COMMITTED (the accidental `popover-probe` token was dropped in `test(infra)` commit `7c684de20`; `rg popover-probe tests/e2e/standalone.config.ts` → no match at plan-final time). Remaining artifacts: `rm -f tests/e2e/popover-probe.spec.ts tests/components/admin/showpage/timerLeakProbe.test.tsx` (both untracked). Verify `git status --porcelain` shows only intended files. Registration lifecycle for the NEW spec (review R8 F1): T2b registers `popover-clip-fit` TEMPORARILY (working tree) for the RED observation and reverts it (`git checkout -- tests/e2e/standalone.config.ts`); T3 registers it PERMANENTLY (first committed case block) and regenerates the baseline in the same commit; T4 and T7 each regenerate the baseline when their case blocks land. Transient census note: between T2b and T3 the authored spec file is untracked and unregistered, so a LOCAL run of `tests/ci/_metaSpecRegistration.test.ts` (which walks the disk) reds during that working-tree window — no committed state is ever census-red.
- **Impeccable gate marker:** §12 below carries the TEMPLATE form until T11. **Transient-red window, documented (review R6 F2):** `tests/docs/_metaInvariant8Closeout.test.ts` §4.1.1 requires a CONFERRING marker on any unit naming both gate halves, and the TEMPLATE form confers nothing — registering this plan in `MARKER_TEMPLATE_FILES` was probed and REFUTED (with the row added, §4.1.1 still fails: "declares the invariant-8 dual gate but carries no valid impeccable-gate marker line"; template registration additionally FORBIDS the later RAN marker, `tests/docs/invariant8/preGuardDebt.ts:226-231`). There is no valid pending form in the §3.3 grammar, so the meta-test is expectedly red on intermediate commits between this plan landing and T11 — by design the marker lands WITH the gate result. CI evaluates only the PR head, where T11's RAN form has replaced the TEMPLATE and the test is green; T12's whole-suite gate re-proves it. Task-level VERIFY commands in T1–T10 do not run this meta-test.

## 1. Tasks

Each task block: **RED** (write test, run command, quote expected failing line) → **GREEN** (implementation) → **VERIFY** (run command, expected pass) → **COMMIT** (exact message).

### T1 — shared rAF coalescer, adopted by both consumers, with adoption pins

Spec §7, §11 (adoption closure i–iv for the coalescer pairs).

- [ ] RED 1: write `tests/popover/rafCoalescer.test.ts (new)`:
  - burst: stub `requestAnimationFrame` to capture callbacks; `schedule()` ×5 → exactly 1 rAF registered; fire it → `run` called once.
  - throttle-not-debounce: inside `run`, call `schedule()` → a SECOND rAF is registered (pending flag cleared BEFORE run). Catches: a debounce implementation (cancel-and-reschedule) registers ≠ counts.
  - cancel: `cancel()` after `schedule()` → `cancelAnimationFrame` called with the pending id; subsequent `schedule()` registers anew.
  - Run: `pnpm vitest run tests/popover/rafCoalescer.test.ts` → expected: `Cannot find module '@/lib/popover/rafCoalescer'` (or equivalent resolve error).
- [ ] RED 2: write `tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts (new)` (TypeScript compiler API — `import ts from "typescript"`), table-driven registry of (consumerFile, helperName, sharedModule) rows; T1 seeds the two coalescer rows ({ShareHub, HoverHelp} × `createRafCoalescer` from `@/lib/popover/rafCoalescer`). Per row assert, resolving through the TYPE CHECKER (not identifier text — review R2 F2's parameter-shadowing mutant defeats text matching): (i) an `ImportSpecifier` from the shared module exists; (ii) ≥1 `ts.isCallExpression` whose callee's RAW symbol (`checker.getSymbolAtLocation`, WITHOUT `getAliasedSymbol` — alias resolution jumps to the exported `FunctionDeclaration` in the shared module and would reject every legitimate consumer, review R3 F2) has its declaration AS the consumer-file `ImportSpecifier` — a call to a same-named parameter (declaration `ts.isParameter`), local const (`ts.isVariableDeclaration`), or decoy does not declare at that `ImportSpecifier` and fails; (iii) no declaration of the names `createRafCoalescer` / `useFitWithinClip` / `findClippingAncestor` in any consumer file in ANY form: `ts.isFunctionDeclaration`, `ts.isVariableDeclaration`, `ts.isClassDeclaration`, AND `ts.isParameter` (shadowing rejection); (iv) the string `cleared BEFORE running` appears in exactly one source file repo-wide (the new shared coalescer module). Core resolver snippet (compiles under the repo tsconfig):

```ts
function callResolvesToImport(
  program: import("typescript").Program,
  source: import("typescript").SourceFile,
  importedName: string,
  moduleText: string,
): boolean {
  // Uses the file-level `import ts from "typescript"` binding directly —
  // no inner require (repo ESLint bans @typescript-eslint/no-require-imports).
  const checker = program.getTypeChecker();
  let found = false;
  const visit = (node: import("typescript").Node): void => {
    if (ts.isCallExpression(node)) {
      // RAW symbol only. getAliasedSymbol would resolve through the import to
      // the shared module's FunctionDeclaration and never be an ImportSpecifier.
      const sym = checker.getSymbolAtLocation(node.expression);
      const decl = sym?.declarations?.[0];
      if (
        decl &&
        ts.isImportSpecifier(decl) &&
        (decl.propertyName ?? decl.name).text === importedName &&
        decl.getSourceFile() === source &&
        ts.isStringLiteral(decl.parent.parent.parent.moduleSpecifier) &&
        decl.parent.parent.parent.moduleSpecifier.text === moduleText
      ) {
        found = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}
```

  (Mutation proofs m0–m2 run AFTER the GREEN step below — they need the finished pin and adopted consumers; see the post-GREEN checkbox.)
  - Run: `pnpm vitest run tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts` → expected: both rows fail (module missing; imports absent).
- [ ] GREEN: create `lib/popover/rafCoalescer.ts (new)` with the spec §7 API verbatim — `export type RafCoalescer = { schedule: () => void; cancel: () => void };` and `export function createRafCoalescer(run: () => void): RafCoalescer` — pending-flag-cleared-BEFORE-run semantics and the marker comment (moves here). Full body:

```ts
export type RafCoalescer = { schedule: () => void; cancel: () => void };

/** Leading-edge THROTTLE. Pending flag cleared BEFORE running so events
 *  landing during `run` can schedule the next frame. */
export function createRafCoalescer(run: () => void): RafCoalescer {
  let frame: number | null = null;
  return {
    schedule() {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null; // cleared BEFORE running so later events can schedule anew
        run();
      });
    },
    cancel() {
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
    },
  };
}
```

  The unit test imports BOTH exports (`import { createRafCoalescer, type RafCoalescer } from "@/lib/popover/rafCoalescer"` and types a local `const c: RafCoalescer` — the compile-time consumer pin). Adopt in adopt in `components/admin/showpage/ShareHub.tsx:379-386` (helper instance in the placement effect; `cancel()` in the cleanup that currently calls `cancelAnimationFrame`) and `components/admin/HoverHelp.tsx:309-316` (open-gate `if (!open ...) return` stays at the call site wrapping `schedule()`); delete both local coalescers + local marker comments.
- [ ] Mutation proofs (post-GREEN, pre-VERIFY; each observed then reverted, lines quoted in the commit body): (m0) clean-consumer sanity — the finished pin PASSES on the real adopted files; (m1) unused aliased import + same-named local `const` decoy called in its place → pin FAILS; (m2) aliased import shadowed by a function PARAMETER of the same local name, parameter called → pin FAILS; (m3) wrong-module decoy — unused correct import plus a CALLED import of the same name from a suffix module (`@/lib/popover/rafCoalescerDecoy` shape) → pin FAILS (exact `StringLiteral.text` compare, review R6 F1).
- [ ] VERIFY: `pnpm vitest run tests/popover/rafCoalescer.test.ts tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts tests/components/admin/showpage/shareHubVisualViewport.test.tsx` → green (T-S8 unchanged); plus `pnpm vitest run tests/components/admin/hoverHelpVisualViewport.test.tsx` (the open/closed scheduling coverage — verified path at plan time).
- [ ] COMMIT: `refactor(popover): extract shared leading-edge rAF coalescer; adopt in ShareHub + HoverHelp with AST adoption pins`

### T2 — extract `useFitWithinClip` with the spec §4.1/§4.2 contract extensions

- [ ] RED: write `tests/components/admin/useFitWithinClip.test.tsx (new)` (jsdom pragma `// @vitest-environment jsdom`). Harness: TWO distinct ancestor nodes (review R5 F3 — collapsing them makes case (d) tautological, since the hook already observes the clip ancestor): an OUTER clipping ancestor div (mocked `getComputedStyle` `overflow: clip`; rect bottom 560) containing an INNER positioned div (the stubbed `offsetParent`), containing the fitted element (rect top 230; declared CSS cap 384). **jsdom returns `offsetParent === null`, so cases (d)/(e) stub it with the repo precedent** (`tests/components/admin/wizard/Step3ReviewModal.test.tsx:453-461`): `Object.defineProperty(HTMLElement.prototype, "offsetParent", { get() { return (this as HTMLElement).parentElement; }, configurable: true })`, restored from the saved descriptor in `finally` — under this stub the fitted element's `offsetParent` is the INNER div and the clip ancestor stays a distinct outer node. Cases:
  - (a) fitted write: `style.maxHeight === computeFittedMaxHeight({elementTop, clipBottom, cap}) + "px"` — derived in-test from the mocked rects via the exported pure core (`lib/layout/fitWithinClip.ts:56`), never hardcoded.
  - (b) no clipping ancestor → no write.
  - (c) `reapplyKey` flip after changing mocked rects → fresh write with the new value.
  - (d) `offsetParent` observation: stub global `ResizeObserver` capturing `observe()` targets → the INNER positioned div (offsetParent, ≠ the clip ancestor) is among them. Catches: extension omitted (only the outer clip ancestor observed — assertion fails because the inner node is absent from the captured targets).
  - (e) `transitionend` re-apply: dispatch `new Event("transitionend")` on the STUBBED `offsetParent` element (the parent div) after changing mocked rects → fresh write. Catches: listener omitted.
  - (f) no `ResizeObserver` global → renders without throwing.
  - Run: `pnpm vitest run tests/components/admin/useFitWithinClip.test.tsx` → expected: module-not-found for `@/components/admin/useFitWithinClip`.
- [ ] RED (adoption row): append the ReSyncButton row (`useFitWithinClip` from `@/components/admin/useFitWithinClip`) to the T1 registry. Run the meta-test → expected: ReSyncButton row fails (still local definition). (AttentionMenu / PublishedToggle rows are added by T3 / T4 in the same commit as their adoption, so every commit stays green.)
- [ ] GREEN: create `components/admin/useFitWithinClip.ts (new)` (`"use client"`): body from `components/admin/ReSyncButton.tsx:79-146` + extensions — ResizeObserver additionally observes `nodeRef.current.offsetParent` (Element-typed guard); `transitionend` listener on the `offsetParent` re-runs `apply`; optional `reapplyKey?: unknown` in the effect deps. `findClippingAncestor` moves as module-private. `ReSyncButton.tsx` imports the hook; both local definitions deleted.
- [ ] VERIFY: `pnpm vitest run tests/components/admin/useFitWithinClip.test.tsx tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts` green; plus the direct suite `tests/components/ReSyncButton.test.tsx` (verified path at plan time).
- [ ] COMMIT: `refactor(admin): extract useFitWithinClip with offsetParent + transitionend + reapplyKey re-measure contract`

### T2b — author the real-browser spec and OBSERVE its REDs against pre-change production (no commit yet)

Review R3 F3: the browser assertions must fail against production BEFORE the behavior lands. This step authors both browser surfaces in the WORKING TREE, registers them temporarily, and records the failing lines. Per review R8 F1, every case's RED, GREEN, and commit belong to ONE owning implementation task: T6 commits the T-BACKDROP restoration; T3 / T4 / T7 each commit their own `popover-clip-fit` case block (per the "BROWSER GREEN" step inside each task) together with the implementation that turns it green. T2b itself commits nothing; it exists so every RED observation is genuinely pre-implementation while every commit stays green.

- [ ] Author `tests/e2e/popover-clip-fit.spec.ts (new)` in full (case list: the BROWSER GREEN blocks of T3 / T4 / T7 below) and its `tests/e2e/_publishedToggleClipLiveEntry.tsx (new)` companion; add the `popover-clip-fit` testMatch name (working tree).
- [ ] Run `node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/popover-clip-fit.spec.ts` → OBSERVE and record the pre-change failures: containment at 560 (menu.bottom 615 > 560), `getByRole("group", { name: "Show issues" })` not found, PublishedToggle banner role/name + overflow-scroll cases fail, keyboard-scroll cases fail, idle mutual-exclusion walks fail (hub stays open when the menu opens), settled-fit equality fails. Save the run log to the scratch dir; each owning task quotes its case's line.
- [ ] Author the T-BACKDROP trigger assertions in `tests/e2e/admin-lifecycle-layout.spec.ts:623-666` (working tree) — the complete assertion set: (a) hub open idle → `elementFromPoint` at each trigger's center resolves into that trigger; (b) a REAL `click()` on the primary trigger closes the popover AND `document.activeElement` remains the primary trigger (the toggle path, distinguishable from the backdrop path which does not retain focus — spec §3.3). Run `node_modules/.bin/playwright test tests/e2e/admin-lifecycle-layout.spec.ts --project=mobile-safari` → OBSERVE both (a) and (b) fail against production (backdrop wins the hit test, so the click never reaches the trigger). Record the lines.
- [ ] Split the authored spec into owning-task case blocks: save the full authored file to the scratch dir, then reduce the working-tree `tests/e2e/popover-clip-fit.spec.ts` to the shared boot scaffolding plus NOTHING (each owning task pastes its block back in its own commit — T3 the menu block, T4 the toggle block + live entry, T7 the mutual-exclusion block). Revert the temporary testMatch registration (`git checkout -- tests/e2e/standalone.config.ts`); LEAVE the lifecycle-layout edits in the working tree for T6.

### T3 — AttentionMenu: fitted scroller + scrollable-region a11y + registry flip

Spec §4.2, §8, §11. **Transition-audit body (spec §8, verbatim obligations):** states absent / pre-frame (`scale-95 opacity-0`) / entered (`scale-100 opacity-100`); O1↔O2 group axis. Pairs: absent→pre-frame instant mount; pre-frame→entered existing `transition-[opacity,transform] duration-fast`, reduced-motion instant; entered/pre-frame→absent instant unmount (no exit animation); O1↔O2 instant heading mount/unmount (re-fires fit observer). Compounds: O1↔O2 mid-entrance (fit re-measure independent of entrance progress); busy-window compounds are T6's.

- [ ] RED: extend `tests/components/admin/showpage/attentionMenu.test.tsx`:
  - scroller located via `screen.getByRole("group", { name: "Show issues" })`; the same node has `tabIndex === 0` and the `max-h-96 overflow-y-auto` classes (role sits ON the scroller, not the panel).
  - fitted write under the T2 mock-rect pattern, expectation derived via `computeFittedMaxHeight`.
  - transition audit: panel carries the entrance classes per the inventory above; after `open=false` rerender, `queryByTestId("published-show-review-attention-menu")` is null (instant unmount, no exit classes).
  - mid-entrance compound (unit half — observer-driven reapplication ONLY, review R8 F2): a React rerender cannot itself fire `ResizeObserver` in jsdom, so this case uses the T2-pattern stub that CAPTURES observer callbacks: with mocked rAF held (entrance classes still pre-frame), change the mocked rects and manually invoke the captured observer callback → fresh `style.maxHeight` write while entrance has not settled. Claim is limited to "observer callback re-applies independent of entrance progress"; that the O2→O1 STRUCTURAL flip actually fires observation is proven by T2 case (d) (offsetParent is among the observed targets) plus the frame-hold real-browser compound in this task's BROWSER GREEN block.
  - Run: `pnpm vitest run tests/components/admin/showpage/attentionMenu.test.tsx` → expected: `getByRole("group", { name: "Show issues" })` finds nothing.
- [ ] RED (registry): flip the AttentionMenu row `unverified-gap` → `fit-within-clip` (`tests/components/admin/showpage/popoverOverlayRegistry.ts:74-78`; reason cites spec §2.2 probe: 55px overhang at 390×560, 54px stranded tail) and add the AttentionMenu adoption row. Run both meta-tests → expected: import assertions fail (component not importing yet).
- [ ] Pre-code mechanical gate (invariant-8 checklist, BEFORE writing the UI change): confirm the change introduces no em-dash in user-visible copy, curly apostrophes/quotes only (U+2019/U+201C/U+201D), ≥44px tap targets preserved (`min-h-tap-min` companions untouched), canonical type/token classes only.
- [ ] GREEN: `components/admin/showpage/AttentionMenu.tsx:147` scroller gains `role="group"`, `aria-label="Show issues"`, `tabIndex={0}`, the fit ref, `reapplyKey={entered}`.
- [ ] BROWSER GREEN (owned cases; REDs OBSERVED at T2b, quoted in the commit body — review R8 F1). **Dimensional-invariants body (spec §9, menu obligations, verbatim):** (1) overflow content + `floor(panel.bottom − scroller.top − 8) < 384` → scroller rendered height `= floor(panel.bottom − scroller.top − 8)` ±0.5px SETTLED; ≥384 afforded → height ≤ 384; floor regime (<48px available) exempt, unreachable at asserted viewports. (2) `menu.bottom ≤ panel.bottom` at 390×560, including after the held-open O2→O1 flip. Paste the T2b menu case block into `tests/e2e/popover-clip-fit.spec.ts` (boot per §0; menu cases reuse `tests/e2e/_pillFocusLiveEntry.tsx`):
  - settled fit at 390×{844,667,560}, reduced-motion emulation, expectations derived in-page from measured rects; PLUS one NON-reduced-motion case at 390×560 that awaits `transitionend` on the panel before asserting the same ±0.5px equality (animated settle path — spec R6/R1-F4 class).
  - containment at 560; interactive-row reachability: with the 10/10/10 fixture the ten monitoring rows render LAST (`tests/e2e/_pillFocusLiveEntry.tsx:68-87`, `components/admin/showpage/AttentionMenu.tsx:148` order), so at MAX scroll the last interactive row sits above the visible window (review R5 F1) — therefore `scrollIntoView` the LAST INTERACTIVE needs-you row first, then assert its visible height ≥ 44px AND `elementFromPoint` at its center resolves into the row button; SEPARATELY scroll to max and assert the monitoring tail is read-reachable (`elementFromPoint` into the last monitoring row's text).
  - held-open O2→O1 flip at 560: `__setItems(0,0,10)` → open → `__setItems(10,10,10)` → containment + reachability re-assert.
  - mid-entrance compound (spec §8 row, review R6 F4): using the frame-hold init-script precedent from `tests/e2e/attention-pill-focus.spec.ts` (`window.__releaseFrames` / `window.__heldFrameCount`, installed by the spec's init script per `tests/e2e/_pillFocusLiveEntry.tsx:95-99` declarations): hold frames, open the menu (entrance held pre-flip), perform the O2→O1 `__setItems` flip WHILE held, release frames, then assert settled fit equality + containment — deterministically forces the structural flip before entrance settles.
  - keyboard: Tab until `document.activeElement` is the `group "Show issues"` node; `ArrowDown` → `scrollTop` strictly increases.
  - Register `popover-clip-fit` PERMANENTLY in the standalone testMatch; `pnpm vitest run tests/ci/_metaSpecRegistration.test.ts` → observe the `--list-check` FAIL (membership changed); `node scripts/check-standalone-baseline.mjs --write`; re-run → green.
  - Run `node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/popover-clip-fit.spec.ts` → menu cases green.
- [ ] VERIFY: `pnpm vitest run tests/components/admin/showpage/attentionMenu.test.tsx tests/components/admin/showpage/attentionMenuGroups.test.tsx tests/components/admin/showpage/pillFocusReconcile.test.tsx tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts` → green.
- [ ] COMMIT (unit + browser block + registration + baseline, one commit): `fix(admin): cap AttentionMenu scroller against the panel clip; scrollable-region a11y contract (browser REDs observed pre-implementation at T2b)`

### T4 — PublishedToggle error banner: cap + scroll + a11y + registry row

Spec §4.3, §8 (inventory rows: none↔error instant; none↔finalize-chip instant; error-wins swap instant — existing treatments unchanged, pinned).

- [ ] RED: extend `tests/components/admin/PublishedToggle.test.tsx`: drive an error via the suite's existing pattern (`setPublished` resolving a known refusal, click); banner assertions: keeps `role="alert"`; gains `tabIndex === 0`, `aria-label === "Publish error details"`, className contains `overflow-y-auto`; fitted `style.maxHeight` written under the mocked clip ancestor; finalize chip + none-state rows pinned unchanged (instant, classes as today).
  - Run: `pnpm vitest run tests/components/admin/PublishedToggle.test.tsx` → expected: `overflow-y-auto` / `tabIndex` assertions fail.
- [ ] Pre-code mechanical gate (invariant-8 checklist, BEFORE writing the UI change): confirm the change introduces no em-dash in user-visible copy, curly apostrophes/quotes only (U+2019/U+201C/U+201D), ≥44px tap targets preserved (`min-h-tap-min` companions untouched), canonical type/token classes only.
- [ ] GREEN step 1: `components/admin/PublishedToggle.tsx:59` `POPOVER_POSITION` gains `overflow-y-auto`.
- [ ] Registry fail-by-default proof: run `pnpm vitest run tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts` NOW → observe "has a row for every detected anchored scroller" fail naming PublishedToggle; quote the line in the commit body; then add the `fit-within-clip` registry row + the adoption row.
- [ ] GREEN step 2: banner takes the fit ref + `tabIndex={0}` + `aria-label="Publish error details"`.
- [ ] BROWSER GREEN (owned cases; REDs OBSERVED at T2b, quoted in the commit body — review R8 F1). **Dimensional-invariants body (spec §9, toggle obligation, verbatim):** (3) PublishedToggle `banner.bottom ≤ clip.bottom` (≥48px available); overflow scrolls. Paste the T2b PublishedToggle case block into `tests/e2e/popover-clip-fit.spec.ts` and commit `tests/e2e/_publishedToggleClipLiveEntry.tsx (new)`: the entry mounts `PublishedToggle` (inline variant) inside a replica clip panel (fixed-height `overflow-clip` div under the real compiled CSS) with `setPublished: async () => ({ ok: false, code: "FINALIZE_OWNED_SHOW" })`. Boot contract (review R7 F1): `PublishedToggle` calls `useRouter()` (and `HelpAffordance` calls `usePathname()`), so the entry wraps the mount in the existing `AppRouterContext.Provider` stub precedent (`tests/e2e/_statusStripToggleHarness.tsx:27` documents the requirement; `tests/e2e/_publishedReviewModalHarness.tsx` carries the stub-router pattern to copy) and flips `window.__hydrated` only after mount commit; T2b's RED recording first waits for hydration + a rendered toggle, THEN drives the click (a boot throw is an entry defect, not a RED). Assert: `role="alert"` with accessible name `Publish error details`; containment `banner.bottom ≤ clip.bottom`; overflow scrolls (`scrollHeight > clientHeight` with a long catalog string); Tab-focus + `ArrowDown` `scrollTop` delta. (Decided here: the shared modal harness hardcodes `setPublished: NOOP_OK` — `tests/e2e/_publishedReviewModalHarness.tsx:376` — so the dedicated entry is the vehicle.) Baseline: membership changed → `node scripts/check-standalone-baseline.mjs --write`; census re-run green. Run the spec → toggle cases green.
- [ ] VERIFY: `pnpm vitest run tests/components/admin/PublishedToggle.test.tsx tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts` → green.
- [ ] COMMIT (unit + browser block + live entry + baseline, one commit): `fix(admin): clip-cap + keyboard-scroll contract for PublishedToggle error banner (browser REDs observed pre-implementation at T2b)`

### T5 — tighten the registry mechanism regex

- [ ] RED (mutant first — invariant-1 ordering): install the escaping mutant in the working tree: replace `ReSyncButton`'s shared import with a local `useFitWithinClip` copy (the pre-T2 body). Run `pnpm vitest run tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts` → observe the CURRENT regex stays GREEN (the defect: `/useFitWithinClip/` matches the local copy). Quote that green-on-mutant observation.
- [ ] GREEN: change `IMPORT_FOR_DISPOSITION["fit-within-clip"]` (`tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts:44-47`) to `/from\s+"@\/components\/admin\/useFitWithinClip"/`. Re-run WITH the mutant still installed → observe the decisive failure ("registered as \"fit-within-clip\" but does not import it"); quote it. Remove the mutant (restore the import).
- [ ] VERIFY: `pnpm vitest run tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts` → green. (The adoption meta-test also fails on the mutant — both quoted lines go in the commit body.)
- [ ] COMMIT: `test(admin): registry fit-within-clip disposition requires the shared-module import`

### T6 — ShareHub trigger elevation: three-term gate + prop threading + composed proof

Spec §3.1/§3.2. **Transition-audit body (spec §8 ShareHub rows, verbatim, each with its pinning assertion):**

| Row | Treatment | Pinned by |
|---|---|---|
| closed ↔ open | Instant class swap; `relative z-30` under the three-term gate | T6 unit open+idle / closed cases |
| live ↔ paused ↔ archived (presentation axis) | Server-prop re-render, instant label/weight swap — UNCHANGED by this cluster | Existing label assertions in `tests/components/admin/showpage/shareHub.test.tsx` (presentation branches); no new assertion needed, verified green in T6 VERIFY |
| Compound: lifecycle change while open | Existing immediate-or-busy-deferred close machinery untouched; elevation unmounts with the close | Existing lifecycle-transition coverage (`tests/components/admin/showpage/shareHub.test.tsx:959-1023` region); T6 VERIFY green |
| Compound: busy flips while open | Elevation drops instantly; returns only when the FULL gate holds | T6 unit open+busy case |
| Compound: busy settles while menu open (×3 reporters + busyStuck) | Stays suppressed | T6 unit settle cases |
| Compound: menu closes while idle-open | Returns instantly | T6 unit prop-flip case + composed test |

- [ ] RED (unit, `tests/components/admin/showpage/shareHub.test.tsx`; reuse the `maxZLevel` helper at `tests/components/admin/showpage/shareHub.test.tsx:280` — lift it to file scope):
  - open+idle: both triggers `maxZLevel ≥ 21`.
  - open+busy (resolver pattern, `tests/components/admin/showpage/shareHub.test.tsx:846`): `< 20`.
  - `attentionMenuOpen={true}` + open: `< 20` through settle of EACH of rotate / reset / lifecycle busy AND through the `busyStuck` timeout (fake timers, `BUSY_GATE_MAX_MS`); rerender `attentionMenuOpen={false}` → `≥ 21`.
  - prop-absent: existing closed-state pin (`tests/components/admin/showpage/shareHub.test.tsx:280`) stays untouched-green.
  - Run → expected failing line: open+idle z assertion (`expected 0 to be at least 21`).
- [ ] RED (composed, `tests/components/admin/showpage/publishedReviewModal.test.tsx`; public surfaces only): render the modal with attention items present and a DEFERRED archive action (promise held open by the test — the T6 resolver pattern); open hub via `share-hub-primary` → arm+confirm Archive so `lifecycleBusy` is in flight → open menu via the pill (`published-show-review-alert-pill`) → resolve the deferred action (settle) → triggers `< 20`; close the menu via its PUBLIC pill toggle (click the pill again — NOT Escape: both surfaces hold capture-phase document Escape listeners and ShareHub's would close the hub too, review R2 F4) → triggers `≥ 21`. Injecting the prop directly here is FORBIDDEN (tautology — bypasses both hops). Run → fails.
- [ ] Pre-code mechanical gate (invariant-8 checklist, BEFORE writing the UI change): confirm the change introduces no em-dash in user-visible copy, curly apostrophes/quotes only (U+2019/U+201C/U+201D), ≥44px tap targets preserved (`min-h-tap-min` companions untouched), canonical type/token classes only.
- [ ] GREEN: `ShareHub` gains `attentionMenuOpen?: boolean` (absent → false); trigger classNames add `relative z-30` under `open && !busy && !attentionMenuOpen`; `StatusStrip` passthrough (`components/admin/showpage/StatusStrip.tsx:98` type, `components/admin/showpage/StatusStrip.tsx:414-422` forward); `PublishedReviewModal` passes `menuEffectivelyOpen` (`components/admin/showpage/PublishedReviewModal.tsx:356`) at `components/admin/showpage/PublishedReviewModal.tsx:905-912`.
- [ ] VERIFY: `pnpm vitest run tests/components/admin/showpage/` → green (broadest-blast-radius task: whole directory); re-run the T2b lifecycle-layout spec → T-BACKDROP assertions (a) hit-test AND (b) click-close-with-focus-retained now GREEN (quote the T2b RED lines + this green in the commit body).
- [ ] COMMIT (includes the T-BACKDROP restoration authored at T2b): `fix(admin): open-gated trigger elevation above the hub backdrop (three-term gate, menu-state threaded); T-BACKDROP trigger assertions restored`

### T7 — focus-leave light dismiss on both surfaces

Spec §3.4. Predicate closure, ALL pinned: AttentionMenu inside-set {panel descendant, pill}; ShareHub inside-set {popover panel descendant, backdrop, primary trigger, kebab trigger}; outside → dismiss; ShareHub busy → no dismiss; no focus restore on focus-leave dismissal.

- [ ] RED (unit): AttentionMenu cases in `tests/components/admin/showpage/attentionMenu.test.tsx` — `focusin` on outside element → `onClose` called; on panel descendant → not called; on the pill → not called. ShareHub cases in `tests/components/admin/showpage/shareHub.test.tsx` — open idle: `focusin` outside all four → closes AND `document.activeElement` NOT restored to a trigger; on each inside-set member (four separate cases) → stays open; busy: outside `focusin` → stays open. Window-blur negatives (spec §3.4/§10 ratified exception, review R6 F3), BOTH surfaces: dispatch `window.blur()` / a `focusout` with `relatedTarget: null` and NO subsequent in-document `focusin` → surface stays open (an implementation dismissing on blur fails these).
  - Run: `pnpm vitest run tests/components/admin/showpage/attentionMenu.test.tsx tests/components/admin/showpage/shareHub.test.tsx` → expected failing assertions: `expected onClose to have been called` (menu outside case) and `expected share-hub-popover not to be in the document` (hub outside case) — the dismiss cases fail because no `focusin` listener exists.
- [ ] GREEN: AttentionMenu adds `focusin` to the existing document-listener effect (`components/admin/showpage/AttentionMenu.tsx:81-105`, same outside predicate as `pointerdown`); ShareHub adds a while-open document `focusin` effect (busy-exempt, no restore).
- [ ] BROWSER GREEN (owned cases; REDs OBSERVED at T2b, quoted in the commit body — review R8 F1). Paste the T2b mutual-exclusion case block into `tests/e2e/popover-clip-fit.spec.ts`:
  - idle mutual exclusion, both directions (spec §3.4): hub open → Tab to pill → Enter → menu open AND hub closed; menu open → Tab to a hub trigger → Enter → hub open AND menu closed.
  - Baseline: membership changed → `node scripts/check-standalone-baseline.mjs --write`; census re-run green. Run the spec → mutual-exclusion cases green.
- [ ] VERIFY: `pnpm vitest run tests/components/admin/showpage/` → green (focus-restore suites must not regress).
- [ ] COMMIT (unit + browser block + baseline, one commit): `fix(admin): focus-leave light dismiss on ShareHub + AttentionMenu (keyboard-inclusive idle mutual exclusion; browser REDs observed pre-implementation at T2b)`

### T8 — ArchiveShowButton `showName` + ratified copy + threading proof

Spec §5.1/§5.2 (owner-ratified byte-exact strings). **Transition-audit body (spec §8 ArchiveShowButton rows, verbatim, each with its pinning assertion):**

| Row | Treatment | Pinned by |
|---|---|---|
| resting ↔ armed | Instant morph; copy-only change in armed branch | T8 direct cases + existing `tests/components/admin/ArchiveShowButton.test.tsx:239-249` |
| resting → armed-submitting | Unreachable directly (submit exists only in armed render) | Structural: no test can produce it; noted here |
| armed → armed-submitting | Instant disable/`aria-busy` — untouched | Existing submitting coverage in `tests/components/admin/ArchiveShowButton.test.tsx` |
| armed-submitting → success | `router.refresh()` re-render, row unmounts — untouched | Existing success-path coverage |
| armed-submitting → post-failure | Instant banner mount — untouched | Existing refusal-banner coverage |
| post-failure → armed | Re-arm clears banners, goes to ARMED | T8 new case (below — review R9 F4: the live suite proves refusal→resting-with-banner and Cancel-from-ordinary-armed, but NOT re-arm-after-refusal with banner cleared) |
| post-failure → resting | Only via Cancel — untouched | Existing cancel coverage |

(All other "existing coverage" rows were verified against the live `tests/components/admin/ArchiveShowButton.test.tsx` suite at plan time; T8 VERIFY re-runs the whole suite. No execution-time discovery remains — review R9 F4.)

- [ ] RED (direct, `tests/components/admin/ArchiveShowButton.test.tsx`, beside the armed-copy pin at `tests/components/admin/ArchiveShowButton.test.tsx:239-249`): row variant with `showName="Spring Gala"` → prose is exactly `Crew links for “Spring Gala” stop working now and won’t come back until you re-publish and issue a new link.`; armed group `aria-label` is `Confirm archiving “Spring Gala”`; with `showName` absent, `""`, and `"   "` → prose + label byte-identical to today's strings (copied from source at test-write time); confirm button label `Confirm archive` in all cases. Mode boundary (spec §5.1): the MORPH (non-row, `compact` and full) variants with a NONBLANK `showName` render their confirm label byte-identical to today (`Confirm archive: crew links stop working now and won’t come back until you re-publish and issue a new link.`) — the prop is consumed ONLY in the `asRow` armed branch.
  - Run → expected: with-`showName` copy cases fail.
- [ ] RED (post-failure → armed row, review R9 F4 — exact sequence, same file): drive a refusal via the suite's existing refusal pattern (arm → confirm → `archiveShow` resolves a refusal → banner shown, trigger back to resting); click the Archive trigger AGAIN → armed group rendered AND the refusal banner is NO LONGER in the document (query the banner's text/role, assert null); then Cancel → resting with no banner. This pins EXISTING behavior, so first-try-green is expected — answer it with a deliberate reverted mutation (disable the re-arm banner-clear in the component, observe the banner-cleared assertion fail, restore; quote both lines in the commit body).
- [ ] RED (threading, `tests/components/admin/showpage/shareHub.test.tsx`): hub with `showTitle="Spring Gala"`, open, arm Archive → armed prose contains `“Spring Gala”`. Run → fails.
- [ ] Pre-code mechanical gate (invariant-8 checklist, BEFORE writing the UI change): confirm the change introduces no em-dash in user-visible copy, curly apostrophes/quotes only (U+2019/U+201C/U+201D), ≥44px tap targets preserved (`min-h-tap-min` companions untouched), canonical type/token classes only.
- [ ] GREEN: `ArchiveShowButton` gains `showName?: string` consumed ONLY in the `asRow` armed branch (`components/admin/ArchiveShowButton.tsx:279` aria-label, `components/admin/ArchiveShowButton.tsx:284-287` prose; trim-guard per spec §5.1); `ShareHub` threads `showTitle` (`components/admin/showpage/ShareHub.tsx:153`) at `components/admin/showpage/ShareHub.tsx:962-982`.
- [ ] VERIFY: `pnpm vitest run tests/components/admin/ArchiveShowButton.test.tsx tests/components/admin/showpage/shareHub.test.tsx` → green.
- [ ] COMMIT: `fix(admin): armed Archive confirm names the show (owner-ratified copy)`

### T9 — real-browser verification gate (no test delivery — review R8 F1)

Every `popover-clip-fit` case landed RED-observed→GREEN→committed inside its owning task (T3 menu block + permanent registration, T4 toggle block + live entry, T7 mutual-exclusion block; T6 the T-BACKDROP restoration), each with its baseline regen. The dimensional-invariants bodies live in T3 (obligations 1–2) and T4 (obligation 3). This task delivers NO tests and NO code — TDD N/A (nothing mutates; ratified exception in the execution contract).

- [ ] Pre-check: `rg popover-probe tests/e2e/standalone.config.ts` → no match (the §0 hygiene pre-step ran); `rg "popover-clip-fit" tests/e2e/standalone.config.ts` → registered (landed at T3).
- [ ] VERIFY: full standalone config: `node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts` → green; `node scripts/check-standalone-baseline.mjs --list-check` → green; lifecycle-layout: `node_modules/.bin/playwright test tests/e2e/admin-lifecycle-layout.spec.ts --project=mobile-safari` → green (T-BACKDROP landed with T6).
- [ ] NO COMMIT. A defect surfaced here lands as its own `fix(admin)` task with a full RED→GREEN cycle.

### T10 — timer-leak documentation close (comment-only — review R8 F3)

Spec §11 requires "shareHubFlashState comment update (no assertion change)" and spec §6 keeps the delta-based assertion style; the live delta baseline already exists at `tests/components/admin/showpage/shareHubFlashState.test.tsx:367-381` and is byte-untouched by this task. No new assertions of any kind (R8 F3 reversed the earlier exact-one-timer and source-contract additions — both contradicted the ratified contract). TDD N/A (comment-only; ratified exception in the execution contract).

- [ ] EDIT: replace the delta-baseline rationale comment (anchor: the `Baseline AFTER opening` comment at `tests/components/admin/showpage/shareHubFlashState.test.tsx:367`) with the spec §2.3 root cause: jsdom `Selection._associateRange` `setTimeout(0)` armed by the `components/admin/showpage/ShareHub.tsx:629-631` open-focus effect. Every assertion in the file stays byte-identical.
- [ ] VERIFY: `pnpm vitest run tests/components/admin/showpage/shareHubFlashState.test.tsx` → green; `git diff tests/components/admin/showpage/shareHubFlashState.test.tsx` shows comment lines only.
- [ ] COMMIT: `test(admin): record jsdom Selection timer root cause at the flash-state delta baseline`

(Backlog graduation for this item — the (b) half of spec §6 — lands with T12's BACKLOG sweep.)

### T11 — impeccable dual gate (invariant 8)

- [ ] Marker RED (review R9 F3): `pnpm vitest run tests/docs/_metaInvariant8Closeout.test.ts` → observe the expected failure on this plan's TEMPLATE marker ("declares the invariant-8 dual gate but carries no valid impeccable-gate marker line") — the §0 transient-window claim, now witnessed.
- [ ] `/impeccable critique` then `/impeccable audit` on the affected diff, canonical v3 setup gates (context load of PRODUCT.md + DESIGN.md → register reference read). Runs BEFORE the whole-diff review.
- [ ] Findings routing (review R9 F3 — no untracked fixes): every P0/P1 that requires a code change becomes its OWN inserted task (T11a, T11b, …), each a full RED→GREEN→VERIFY→one-commit cycle per the execution contract; P0/P1 not fixed are explicitly deferred via a `DEFERRED.md` entry. After all inserted tasks land, RE-RUN both gates on the updated diff.
- [ ] Marker GREEN: replace the §12 TEMPLATE with the RAN form + findings/dispositions; `pnpm vitest run tests/docs/_metaInvariant8Closeout.test.ts` → green; quote both marker observations in the commit body.
- [ ] COMMIT (this task's single commit, documentation only): `docs(plan): impeccable dual-gate results — marker RAN, findings + dispositions` (code fixes live in their own T11x commits).

### T12 — close-out

- [ ] BACKLOG graduation, TDD (review R9 F2 — the graduation is guarded by `tests/docs/_metaDeferralLedgerGraduation.test.ts`, whose `BACKLOG_GRADUATED` registry at `tests/docs/_metaDeferralLedgerGraduation.test.ts:90` pins archive-only placement + branch provenance per row):
  - RED: append all six registry rows FIRST (`{ id: "BL-…", provenance: "fix/admin-popover-overlay-cluster" }` each, with a one-line rationale comment matching the file's row style). Run `pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts` → observe the archive-missing failures (six ids registered but still present in `BACKLOG.md` / absent from `BACKLOG-archive.md`); quote a decisive line.
  - GREEN: move all six item bodies from `BACKLOG.md` to `BACKLOG-archive.md` with resolution notes (timer-leak row: jsdom root cause; attention-clip row: probe verdict + fit fix). Re-run → green.
  - The registry rows + both ledger edits land in THIS task's single commit. (Merge-time ledger conflicts are handled by the pre-push reconciliation checkpoint below, not by "keep both" alone.)
- [ ] Registry sanity: `rg "unverified-gap" tests/components/admin/showpage/popoverOverlayRegistry.ts` → no matches (plan-time output: 1 match, the AttentionMenu row; T3 removes it).
- [ ] Whole-suite gate: `pnpm test && pnpm typecheck && pnpm lint`; full standalone config; lifecycle-layout local run.
- [ ] COMMIT: `docs(plan): popover cluster close-out — backlog graduation, closeout marker`

### Pipeline stages after T12 (sequenced, not waived)

**Pre-push reconciliation checkpoint (review R9 F5):** `git fetch origin`; if `origin/main` moved since the pre-T1 sync, `git rebase origin/main` again — preserve the testMatch/allowlist UNION in `tests/e2e/standalone.config.ts`, reconcile BOTH backlog ledgers (keep both sides' rows; graduated entries stay archive-only), then REGENERATE the standalone baseline from the reconciled tree (`node scripts/check-standalone-baseline.mjs --write` — never hand-merge baseline JSON), and re-run the affected gates (`pnpm vitest run tests/ci/_metaSpecRegistration.test.ts tests/docs/_metaDeferralLedgerGraduation.test.ts` + full `pnpm test && pnpm typecheck && pnpm lint` + full standalone config). Only a clean, reconciled, green tree proceeds.

Whole-diff Codex cross-model review (fresh-eyes, REVIEWER ONLY) iterated to APPROVE → push → PR (a conflicted PR blocks the merge command — the checkpoint above exists so the PR is never conflicted) → real GitHub Actions green → `gh pr merge --merge` → fast-forward local `main`, verify `git rev-list --left-right --count main...origin/main` = `0  0`.

## 2. Anti-tautology notes

- T1 throttle case counts rAF registrations — a debounce cannot pass; never "function was called".
- T2/T3 (unit and browser-block) fitted expectations derived from mocked/measured rects via `computeFittedMaxHeight` or in-page math — the literal 322 appears nowhere in tests.
- T6 composed test drives ONLY public surfaces; direct prop injection there is forbidden (bypasses both hops).
- T8 absent/blank-prop cases pin today's strings byte-exact so default drift fails.
- The browser spec (T3/T4/T7 blocks) asserts `scrollTop` deltas and FIRST-surface-closed; first-try-green is answered with a deliberate reverted mutation, quoted in the owning task's commit body.
- T5's tightened regex bite is observed via a temporary local revert, quoted in the commit body.

## 12. Closeout

impeccable-gate: critique=<RAN|RAN-DEGRADED> audit=<RAN|RAN-DEGRADED> p0=<int> p1=<int> dispositions=<recorded|none>

(TEMPLATE form until T11 runs; replaced with the RAN form + findings/dispositions before the whole-diff review.)
