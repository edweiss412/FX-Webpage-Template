# Plan — Admin show-page popover/overlay-clip cluster

**Date:** 2026-08-02 · **Spec:** `docs/superpowers/specs/2026-08-01-admin-popover-overlay-cluster.md` (RATIFIED 2026-08-02, Codex APPROVE R7) · **Implementer:** Opus / Claude Code (UI surface — hard routing rule) · **Branch:** `fix/admin-popover-overlay-cluster`

> **For the implementing agent.** Work through the tasks in order; every checkbox is one action. Do not skip RED observations.

**Goal:** close the six ratified backlog items — backdrop trigger hit-test, AttentionMenu/PublishedToggle clip capping + keyboard a11y, self-describing Archive confirm, jsdom-timer documentation, shared rAF coalescer — exactly as the ratified spec defines.

**Architecture:** two shared extractions (`lib/popover/rafCoalescer.ts (new)`, `components/admin/useFitWithinClip.ts (new)`) consumed by five components; one prop thread (`PublishedReviewModal → StatusStrip → ShareHub`); guard surface = the popover-overlay registry + a new AST adoption meta-test; verification = jsdom unit suites + one new standalone real-browser spec + restored T-BACKDROP assertions.

**Tech stack:** Next.js 16 / React 19 client components, Tailwind v4, Vitest + jsdom, Playwright (standalone esbuild harness), TypeScript compiler API for structural pins.

Execution contract: one task = failing test observed → minimal implementation → passing test observed → ONE commit (`--no-verify`). RED and GREEN land in the same commit; the RED failure is OBSERVED and its decisive line quoted in the commit body. All commands run from the worktree root.

## 0. Pre-draft verification + declarations

- **Code-verification pass:** every file/symbol/line below verified against this worktree at plan time: ShareHub busy/toggle/backdrop/triggers/coalescer/focus-effect/ArchiveShowButton call site (`components/admin/showpage/ShareHub.tsx:186-209`, `components/admin/showpage/ShareHub.tsx:528-540`, `components/admin/showpage/ShareHub.tsx:651-724`, `components/admin/showpage/ShareHub.tsx:379-386`, `components/admin/showpage/ShareHub.tsx:629-631`, `components/admin/showpage/ShareHub.tsx:962-982`), StatusStrip props + ShareHub render (`components/admin/showpage/StatusStrip.tsx:98`, `components/admin/showpage/StatusStrip.tsx:414-422`), PublishedReviewModal menu state + strip render (`components/admin/showpage/PublishedReviewModal.tsx:301`, `components/admin/showpage/PublishedReviewModal.tsx:356`, `components/admin/showpage/PublishedReviewModal.tsx:905-912`), AttentionMenu (`components/admin/showpage/AttentionMenu.tsx:76-105`, `components/admin/showpage/AttentionMenu.tsx:120-147`), fit hook + pure core (`components/admin/ReSyncButton.tsx:79-146`, `lib/layout/fitWithinClip.ts:21-67`), HoverHelp coalescer (`components/admin/HoverHelp.tsx:309-316`), ArchiveShowButton (`components/admin/ArchiveShowButton.tsx:115-156`, `components/admin/ArchiveShowButton.tsx:244-324`), registry + detector (`tests/components/admin/showpage/popoverOverlayRegistry.ts:42-79`, `tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts:26-47`), pins (`tests/components/admin/showpage/shareHub.test.tsx:217`, `tests/components/admin/showpage/shareHub.test.tsx:280`, `tests/components/admin/showpage/shareHub.test.tsx:846-894`), armed-copy pins (`tests/components/admin/ArchiveShowButton.test.tsx:239-249`), toggle tests (`tests/components/admin/PublishedToggle.test.tsx`), T-S8 (`tests/components/admin/showpage/shareHubVisualViewport.test.tsx:164`), T-BACKDROP (`tests/e2e/admin-lifecycle-layout.spec.ts:623-666`), harness (`tests/e2e/_publishedReviewModalHarness.tsx:223`, `tests/e2e/_publishedReviewModalHarness.tsx:376`, `tests/e2e/_pillFocusLiveEntry.tsx:68-87`), baseline gates (`scripts/check-standalone-baseline.mjs:129-143`, `tests/ci/_metaSpecRegistration.test.ts:74`). Script names: `pnpm test` = `vitest run`, `pnpm typecheck` = `tsc --noEmit`, `pnpm lint` = `eslint`.
- **Meta-test inventory:** EXTENDS `tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts` (tightened import regex; two registry rows). CREATES `tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts (new)` (AST adoption pins). No Supabase call boundary, no admin-alert catalog, no email normalization, **no `pg_advisory*` (holder topology N/A)**, no mutation surface (no server-action/route edits — invariant 10 untouched).
- **e2e harness readiness:** boot = standalone self-hosted harness (esbuild live entry + `node:http`, template `tests/e2e/attention-pill-focus.spec.ts:38-99`); readiness gate = `window.__hydrated` (never `networkidle`); detach safety = drive via `window.__setItems` React state; every measurement re-queries elements inside the `evaluate` callback.
- **Worktree hygiene pre-step (before T1):** revert the two draft-time probe artifacts so no later step can capture them: `rm -f tests/e2e/popover-probe.spec.ts tests/components/admin/showpage/timerLeakProbe.test.tsx && git checkout -- tests/e2e/standalone.config.ts` (removes the temp `popover-probe` testMatch branch). Verify `git status --porcelain` shows only intended files.
- **Impeccable gate marker:** §12 below.

## 1. Tasks

Each task block: **RED** (write test, run command, quote expected failing line) → **GREEN** (implementation) → **VERIFY** (run command, expected pass) → **COMMIT** (exact message).

### T1 — shared rAF coalescer, adopted by both consumers, with adoption pins

Spec §7, §11 (adoption closure i–iv for the coalescer pairs).

- [ ] RED 1: write `tests/popover/rafCoalescer.test.ts (new)`:
  - burst: stub `requestAnimationFrame` to capture callbacks; `schedule()` ×5 → exactly 1 rAF registered; fire it → `run` called once.
  - throttle-not-debounce: inside `run`, call `schedule()` → a SECOND rAF is registered (pending flag cleared BEFORE run). Catches: a debounce implementation (cancel-and-reschedule) registers ≠ counts.
  - cancel: `cancel()` after `schedule()` → `cancelAnimationFrame` called with the pending id; subsequent `schedule()` registers anew.
  - Run: `pnpm vitest run tests/popover/rafCoalescer.test.ts` → expected: `Cannot find module '@/lib/popover/rafCoalescer'` (or equivalent resolve error).
- [ ] RED 2: write `tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts (new)` (TypeScript compiler API — `import ts from "typescript"`), table-driven registry of (consumerFile, helperName, sharedModule) rows; T1 seeds the two coalescer rows ({ShareHub, HoverHelp} × `createRafCoalescer` from `@/lib/popover/rafCoalescer`). Per row assert, resolving through the TYPE CHECKER (not identifier text — review R2 F2's parameter-shadowing mutant defeats text matching): (i) an `ImportSpecifier` from the shared module exists; (ii) ≥1 `ts.isCallExpression` whose callee SYMBOL (`checker.getSymbolAtLocation`, alias-resolved via `checker.getAliasedSymbol`) has a declaration that IS that `ImportSpecifier` — a call to a same-named parameter, variable, or aliased decoy does not resolve there and fails; (iii) no declaration of the names `createRafCoalescer` / `useFitWithinClip` / `findClippingAncestor` in any consumer file in ANY form: `ts.isFunctionDeclaration`, `ts.isVariableDeclaration`, `ts.isClassDeclaration`, AND `ts.isParameter` (shadowing rejection); (iv) the string `cleared BEFORE running` appears in exactly one source file repo-wide (the new shared coalescer module). Core resolver snippet (compiles under the repo tsconfig):

```ts
function callResolvesToImport(
  program: import("typescript").Program,
  source: import("typescript").SourceFile,
  importedName: string,
  moduleText: string,
): boolean {
  const ts = require("typescript") as typeof import("typescript");
  const checker = program.getTypeChecker();
  let found = false;
  const visit = (node: import("typescript").Node): void => {
    if (ts.isCallExpression(node)) {
      let sym = checker.getSymbolAtLocation(node.expression);
      if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
      const decl = sym?.declarations?.[0];
      if (
        decl &&
        ts.isImportSpecifier(decl) &&
        (decl.propertyName ?? decl.name).text === importedName &&
        decl.getSourceFile() === source &&
        decl.parent.parent.parent.moduleSpecifier.getText(source).includes(moduleText)
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

  RED mutants (each observed failing against the finished pin, then deleted; quoted in the commit body): (m1) unused aliased import + same-named local `const` decoy called in its place; (m2) aliased import shadowed by a function PARAMETER of the same local name, parameter called.
  - Run: `pnpm vitest run tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts` → expected: both rows fail (module missing; imports absent).
- [ ] GREEN: create `lib/popover/rafCoalescer.ts (new)` exporting `createRafCoalescer(run: () => void): { schedule(): void; cancel(): void }` with pending-flag-cleared-BEFORE-run semantics and the marker comment (moves here); adopt in `components/admin/showpage/ShareHub.tsx:379-386` (helper instance in the placement effect; `cancel()` in the cleanup that currently calls `cancelAnimationFrame`) and `components/admin/HoverHelp.tsx:309-316` (open-gate `if (!open ...) return` stays at the call site wrapping `schedule()`); delete both local coalescers + local marker comments.
- [ ] VERIFY: `pnpm vitest run tests/popover/rafCoalescer.test.ts tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts tests/components/admin/showpage/shareHubVisualViewport.test.tsx` → green (T-S8 unchanged); plus any HoverHelp suites (locate: `rg -l "HoverHelp" tests/components/admin --max-depth 1`).
- [ ] COMMIT: `refactor(popover): extract shared leading-edge rAF coalescer; adopt in ShareHub + HoverHelp with AST adoption pins`

### T2 — extract `useFitWithinClip` with the spec §4.1/§4.2 contract extensions

- [ ] RED: write `tests/components/admin/useFitWithinClip.test.tsx (new)` (jsdom pragma `// @vitest-environment jsdom`). Harness: positioned ancestor div, mocked `getComputedStyle` (`overflow: clip`) and `getBoundingClientRect` (ancestor bottom 560; fitted-element top 230; declared CSS cap 384). **jsdom returns `offsetParent === null`, so cases (d)/(e) stub it with the repo precedent** (`tests/components/admin/wizard/Step3ReviewModal.test.tsx:453-461`): `Object.defineProperty(HTMLElement.prototype, "offsetParent", { get() { return (this as HTMLElement).parentElement; }, configurable: true })`, restored from the saved descriptor in `finally`. Cases:
  - (a) fitted write: `style.maxHeight === computeFittedMaxHeight({elementTop, clipBottom, cap}) + "px"` — derived in-test from the mocked rects via the exported pure core (`lib/layout/fitWithinClip.ts:56`), never hardcoded.
  - (b) no clipping ancestor → no write.
  - (c) `reapplyKey` flip after changing mocked rects → fresh write with the new value.
  - (d) `offsetParent` observation: stub global `ResizeObserver` capturing `observe()` targets → the fitted element's `offsetParent` is among them. Catches: extension omitted (only clip ancestor observed).
  - (e) `transitionend` re-apply: dispatch `new Event("transitionend")` on the STUBBED `offsetParent` element (the parent div) after changing mocked rects → fresh write. Catches: listener omitted.
  - (f) no `ResizeObserver` global → renders without throwing.
  - Run: `pnpm vitest run tests/components/admin/useFitWithinClip.test.tsx` → expected: module-not-found for `@/components/admin/useFitWithinClip`.
- [ ] RED (adoption row): append the ReSyncButton row (`useFitWithinClip` from `@/components/admin/useFitWithinClip`) to the T1 registry. Run the meta-test → expected: ReSyncButton row fails (still local definition). (AttentionMenu / PublishedToggle rows are added by T3 / T4 in the same commit as their adoption, so every commit stays green.)
- [ ] GREEN: create `components/admin/useFitWithinClip.ts (new)` (`"use client"`): body from `components/admin/ReSyncButton.tsx:79-146` + extensions — ResizeObserver additionally observes `nodeRef.current.offsetParent` (Element-typed guard); `transitionend` listener on the `offsetParent` re-runs `apply`; optional `reapplyKey?: unknown` in the effect deps. `findClippingAncestor` moves as module-private. `ReSyncButton.tsx` imports the hook; both local definitions deleted.
- [ ] VERIFY: `pnpm vitest run tests/components/admin/useFitWithinClip.test.tsx tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts` green; plus ReSync suites (locate: `rg -l "ReSyncButton" tests/components/admin --max-depth 1`).
- [ ] COMMIT: `refactor(admin): extract useFitWithinClip with offsetParent + transitionend + reapplyKey re-measure contract`

### T3 — AttentionMenu: fitted scroller + scrollable-region a11y + registry flip

Spec §4.2, §8, §11. **Transition-audit body (spec §8, verbatim obligations):** states absent / pre-frame (`scale-95 opacity-0`) / entered (`scale-100 opacity-100`); O1↔O2 group axis. Pairs: absent→pre-frame instant mount; pre-frame→entered existing `transition-[opacity,transform] duration-fast`, reduced-motion instant; entered/pre-frame→absent instant unmount (no exit animation); O1↔O2 instant heading mount/unmount (re-fires fit observer). Compounds: O1↔O2 mid-entrance (fit re-measure independent of entrance progress); busy-window compounds are T6's.

- [ ] RED: extend `tests/components/admin/showpage/attentionMenu.test.tsx`:
  - scroller located via `screen.getByRole("group", { name: "Show issues" })`; the same node has `tabIndex === 0` and the `max-h-96 overflow-y-auto` classes (role sits ON the scroller, not the panel).
  - fitted write under the T2 mock-rect pattern, expectation derived via `computeFittedMaxHeight`.
  - transition audit: panel carries the entrance classes per the inventory above; after `open=false` rerender, `queryByTestId("published-show-review-attention-menu")` is null (instant unmount, no exit classes).
  - Run: `pnpm vitest run tests/components/admin/showpage/attentionMenu.test.tsx` → expected: `getByRole("group", { name: "Show issues" })` finds nothing.
- [ ] RED (registry): flip the AttentionMenu row `unverified-gap` → `fit-within-clip` (`tests/components/admin/showpage/popoverOverlayRegistry.ts:74-78`; reason cites spec §2.2 probe: 55px overhang at 390×560, 54px stranded tail) and add the AttentionMenu adoption row. Run both meta-tests → expected: import assertions fail (component not importing yet).
- [ ] GREEN: `components/admin/showpage/AttentionMenu.tsx:147` scroller gains `role="group"`, `aria-label="Show issues"`, `tabIndex={0}`, the fit ref, `reapplyKey={entered}`.
- [ ] VERIFY: `pnpm vitest run tests/components/admin/showpage/attentionMenu.test.tsx tests/components/admin/showpage/attentionMenuGroups.test.tsx tests/components/admin/showpage/pillFocusReconcile.test.tsx tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts` → green.
- [ ] COMMIT: `fix(admin): cap AttentionMenu scroller against the panel clip; scrollable-region a11y contract`

### T4 — PublishedToggle error banner: cap + scroll + a11y + registry row

Spec §4.3, §8 (inventory rows: none↔error instant; none↔finalize-chip instant; error-wins swap instant — existing treatments unchanged, pinned).

- [ ] RED: extend `tests/components/admin/PublishedToggle.test.tsx`: drive an error via the suite's existing pattern (`setPublished` resolving a known refusal, click); banner assertions: keeps `role="alert"`; gains `tabIndex === 0`, `aria-label === "Publish error details"`, className contains `overflow-y-auto`; fitted `style.maxHeight` written under the mocked clip ancestor; finalize chip + none-state rows pinned unchanged (instant, classes as today).
  - Run: `pnpm vitest run tests/components/admin/PublishedToggle.test.tsx` → expected: `overflow-y-auto` / `tabIndex` assertions fail.
- [ ] GREEN step 1: `components/admin/PublishedToggle.tsx:59` `POPOVER_POSITION` gains `overflow-y-auto`.
- [ ] Registry fail-by-default proof: run `pnpm vitest run tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts` NOW → observe "has a row for every detected anchored scroller" fail naming PublishedToggle; quote the line in the commit body; then add the `fit-within-clip` registry row + the adoption row.
- [ ] GREEN step 2: banner takes the fit ref + `tabIndex={0}` + `aria-label="Publish error details"`.
- [ ] VERIFY: `pnpm vitest run tests/components/admin/PublishedToggle.test.tsx tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts` → green.
- [ ] COMMIT: `fix(admin): clip-cap + keyboard-scroll contract for PublishedToggle error banner`

### T5 — tighten the registry mechanism regex

- [ ] RED (mutant first — invariant-1 ordering): install the escaping mutant in the working tree: replace `ReSyncButton`'s shared import with a local `useFitWithinClip` copy (the pre-T2 body). Run `pnpm vitest run tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts` → observe the CURRENT regex stays GREEN (the defect: `/useFitWithinClip/` matches the local copy). Quote that green-on-mutant observation.
- [ ] GREEN: change `IMPORT_FOR_DISPOSITION["fit-within-clip"]` (`tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts:44-47`) to `/from\s+"@\/components\/admin\/useFitWithinClip"/`. Re-run WITH the mutant still installed → observe the decisive failure ("registered as \"fit-within-clip\" but does not import it"); quote it. Remove the mutant (restore the import).
- [ ] VERIFY: `pnpm vitest run tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts` → green. (The adoption meta-test also fails on the mutant — both quoted lines go in the commit body.)
- [ ] COMMIT: `test(admin): registry fit-within-clip disposition requires the shared-module import`

### T6 — ShareHub trigger elevation: three-term gate + prop threading + composed proof

Spec §3.1/§3.2, §8 compound rows (busy flip while open → elevation drops instantly, returns only when the FULL gate holds; busy settles while menu open → stays suppressed; menu closes while idle-open → returns instantly).

- [ ] RED (unit, `tests/components/admin/showpage/shareHub.test.tsx`; reuse the `maxZLevel` helper at `tests/components/admin/showpage/shareHub.test.tsx:280` — lift it to file scope):
  - open+idle: both triggers `maxZLevel ≥ 21`.
  - open+busy (resolver pattern, `tests/components/admin/showpage/shareHub.test.tsx:846`): `< 20`.
  - `attentionMenuOpen={true}` + open: `< 20` through settle of EACH of rotate / reset / lifecycle busy AND through the `busyStuck` timeout (fake timers, `BUSY_GATE_MAX_MS`); rerender `attentionMenuOpen={false}` → `≥ 21`.
  - prop-absent: existing closed-state pin (`tests/components/admin/showpage/shareHub.test.tsx:280`) stays untouched-green.
  - Run → expected failing line: open+idle z assertion (`expected 0 to be at least 21`).
- [ ] RED (composed, `tests/components/admin/showpage/publishedReviewModal.test.tsx`; public surfaces only): render the modal with attention items present and a DEFERRED archive action (promise held open by the test — the T6 resolver pattern); open hub via `share-hub-primary` → arm+confirm Archive so `lifecycleBusy` is in flight → open menu via the pill (`published-show-review-alert-pill`) → resolve the deferred action (settle) → triggers `< 20`; close the menu via its PUBLIC pill toggle (click the pill again — NOT Escape: both surfaces hold capture-phase document Escape listeners and ShareHub's would close the hub too, review R2 F4) → triggers `≥ 21`. Injecting the prop directly here is FORBIDDEN (tautology — bypasses both hops). Run → fails.
- [ ] GREEN: `ShareHub` gains `attentionMenuOpen?: boolean` (absent → false); trigger classNames add `relative z-30` under `open && !busy && !attentionMenuOpen`; `StatusStrip` passthrough (`components/admin/showpage/StatusStrip.tsx:98` type, `components/admin/showpage/StatusStrip.tsx:414-422` forward); `PublishedReviewModal` passes `menuEffectivelyOpen` (`components/admin/showpage/PublishedReviewModal.tsx:356`) at `components/admin/showpage/PublishedReviewModal.tsx:905-912`.
- [ ] VERIFY: `pnpm vitest run tests/components/admin/showpage/` → green (broadest-blast-radius task: whole directory).
- [ ] COMMIT: `fix(admin): open-gated trigger elevation above the hub backdrop (three-term gate, menu-state threaded)`

### T7 — focus-leave light dismiss on both surfaces

Spec §3.4. Predicate closure, ALL pinned: AttentionMenu inside-set {panel descendant, pill}; ShareHub inside-set {popover panel descendant, backdrop, primary trigger, kebab trigger}; outside → dismiss; ShareHub busy → no dismiss; no focus restore on focus-leave dismissal.

- [ ] RED (unit): AttentionMenu — `focusin` on outside element → `onClose` called; on panel descendant → not called; on the pill → not called. ShareHub — open idle: `focusin` outside all four → closes AND `document.activeElement` NOT restored to a trigger; on each inside-set member (four separate cases) → stays open; busy: outside `focusin` → stays open.
  - Run → expected: dismiss cases fail (no listener).
- [ ] GREEN: AttentionMenu adds `focusin` to the existing document-listener effect (`components/admin/showpage/AttentionMenu.tsx:81-105`, same outside predicate as `pointerdown`); ShareHub adds a while-open document `focusin` effect (busy-exempt, no restore).
- [ ] VERIFY: `pnpm vitest run tests/components/admin/showpage/` → green (focus-restore suites must not regress).
- [ ] COMMIT: `fix(admin): focus-leave light dismiss on ShareHub + AttentionMenu (keyboard-inclusive idle mutual exclusion)`

### T8 — ArchiveShowButton `showName` + ratified copy + threading proof

Spec §5.1/§5.2 (owner-ratified byte-exact strings).

- [ ] RED (direct, `tests/components/admin/ArchiveShowButton.test.tsx`, beside the armed-copy pin at `tests/components/admin/ArchiveShowButton.test.tsx:239-249`): row variant with `showName="Spring Gala"` → prose is exactly `Crew links for “Spring Gala” stop working now and won’t come back until you re-publish and issue a new link.`; armed group `aria-label` is `Confirm archiving “Spring Gala”`; with `showName` absent, `""`, and `"   "` → prose + label byte-identical to today's strings (copied from source at test-write time); confirm button label `Confirm archive` in all cases. Mode boundary (spec §5.1): the MORPH (non-row, `compact` and full) variants with a NONBLANK `showName` render their confirm label byte-identical to today (`Confirm archive: crew links stop working now and won’t come back until you re-publish and issue a new link.`) — the prop is consumed ONLY in the `asRow` armed branch.
  - Run → expected: with-`showName` copy cases fail.
- [ ] RED (threading, `tests/components/admin/showpage/shareHub.test.tsx`): hub with `showTitle="Spring Gala"`, open, arm Archive → armed prose contains `“Spring Gala”`. Run → fails.
- [ ] GREEN: `ArchiveShowButton` gains `showName?: string` consumed ONLY in the `asRow` armed branch (`components/admin/ArchiveShowButton.tsx:279` aria-label, `components/admin/ArchiveShowButton.tsx:284-287` prose; trim-guard per spec §5.1); `ShareHub` threads `showTitle` (`components/admin/showpage/ShareHub.tsx:153`) at `components/admin/showpage/ShareHub.tsx:962-982`.
- [ ] VERIFY: `pnpm vitest run tests/components/admin/ArchiveShowButton.test.tsx tests/components/admin/showpage/shareHub.test.tsx` → green.
- [ ] COMMIT: `fix(admin): armed Archive confirm names the show (owner-ratified copy)`

### T9 — real-browser layout/a11y spec + baseline + T-BACKDROP restore

**Dimensional-invariants body (spec §9, verbatim obligations):** (1) overflow content + `floor(panel.bottom − scroller.top − 8) < 384` → scroller rendered height `= floor(panel.bottom − scroller.top − 8)` ±0.5px SETTLED; ≥384 afforded → height ≤ 384; floor regime (<48px available) exempt, unreachable at asserted viewports. (2) `menu.bottom ≤ panel.bottom` at 390×560, including after the held-open O2→O1 flip. (3) PublishedToggle `banner.bottom ≤ clip.bottom` (≥48px available); overflow scrolls.

- [ ] Pre-check: `rg popover-probe tests/e2e/standalone.config.ts` → no match (the §0 hygiene pre-step ran).
- [ ] RED: write `tests/e2e/popover-clip-fit.spec.ts (new)` (boot per §0; menu cases reuse `tests/e2e/_pillFocusLiveEntry.tsx`). Cases:
  - settled fit at 390×{844,667,560}, reduced-motion emulation, expectations derived in-page from measured rects; PLUS one NON-reduced-motion case at 390×560 that awaits `transitionend` on the panel before asserting the same ±0.5px equality (animated settle path — spec R6/R1-F4 class).
  - containment at 560; last INTERACTIVE needs-you row: visible height ≥ 44px at max scroll AND `elementFromPoint` at its center resolves into the row button; monitoring tail read-reachable (`elementFromPoint` into row text at max scroll).
  - held-open O2→O1 flip at 560: `__setItems(0,0,10)` → open → `__setItems(10,10,10)` → containment + reachability re-assert.
  - keyboard: Tab until `document.activeElement` is the `group "Show issues"` node; `ArrowDown` → `scrollTop` strictly increases.
  - idle mutual exclusion, both directions (spec §3.4): hub open → Tab to pill → Enter → menu open AND hub closed; menu open → Tab to a hub trigger → Enter → hub open AND menu closed.
  - PublishedToggle via a NEW minimal live entry `tests/e2e/_publishedToggleClipLiveEntry.tsx (new)`: mounts `PublishedToggle` (inline variant) inside a replica clip panel (fixed-height `overflow-clip` div under the real compiled CSS) with `setPublished: async () => ({ ok: false, code: "FINALIZE_OWNED_SHOW" })`; click toggle → banner appears. Assert: `role="alert"` with accessible name `Publish error details`; containment `banner.bottom ≤ clip.bottom`; overflow scrolls (`scrollHeight > clientHeight` with a long catalog string); Tab-focus + `ArrowDown` `scrollTop` delta. (Decided here: the shared modal harness hardcodes `setPublished: NOOP_OK` — `tests/e2e/_publishedReviewModalHarness.tsx:376` — so the dedicated entry is the vehicle.)
  - RED observation: run `node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/popover-clip-fit.spec.ts` BEFORE registration → expected "no tests" (testMatch gate observed). Register the `popover-clip-fit` name in `tests/e2e/standalone.config.ts` `testMatch`; re-run → spec executes. Because T3/T4 already landed, assertions may pass first-try: prove harness sensitivity by one deliberate local mutation of a derived expectation (fail observed, quoted in commit body), then revert. 
- [ ] Baseline: `pnpm vitest run tests/ci/_metaSpecRegistration.test.ts` → observe the `--list-check` FAIL (membership changed); `node scripts/check-standalone-baseline.mjs --write`; re-run → green.
- [ ] T-BACKDROP restore (`tests/e2e/admin-lifecycle-layout.spec.ts:623-666`): add trigger assertions — hub open idle: `elementFromPoint` at each trigger's center resolves into that trigger; click primary → popover closed AND `document.activeElement` is the primary trigger. Local run: `node_modules/.bin/playwright test tests/e2e/admin-lifecycle-layout.spec.ts --project=mobile-safari` (app-backed; `playwright.config.ts` `webServer` boots it; one retry tolerated for the documented placement flake).
- [ ] VERIFY: full standalone config: `node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts` → green.
- [ ] COMMIT: `test(admin): real-browser clip-fit/a11y/mutual-exclusion spec; standalone baseline; T-BACKDROP trigger assertions restored`

### T10 — timer-leak documentation close

- [ ] Edit the delta-baseline comment in `tests/components/admin/showpage/shareHubFlashState.test.tsx` to record the spec §2.3 root cause (jsdom `Selection._associateRange` `setTimeout(0)` armed by the `components/admin/showpage/ShareHub.tsx:629-631` open-focus effect). Comment-only. RED N/A — declared: documentation disposition per spec §6; the behavioral guard is the existing delta assertion staying green.
- [ ] VERIFY: `pnpm vitest run tests/components/admin/showpage/shareHubFlashState.test.tsx` → green.
- [ ] COMMIT: `test(admin): record jsdom Selection timer root cause at the flash-state delta baseline`

### T11 — impeccable dual gate (invariant 8)

- [ ] `/impeccable critique` then `/impeccable audit` on the affected diff, canonical v3 setup gates (context load of PRODUCT.md + DESIGN.md → register reference read). P0/P1 fixed or `DEFERRED.md`-deferred; findings + dispositions recorded in §12; marker updated to the RAN form. Runs BEFORE the whole-diff review.
- [ ] COMMIT: per-fix `fix(admin)` commits as needed; `docs(plan)` for the marker/dispositions.

### T12 — close-out

- [ ] BACKLOG graduation: move all six item bodies from `BACKLOG.md` to `BACKLOG-archive.md` with resolution notes (timer-leak row: jsdom root cause; attention-clip row: probe verdict + fit fix). Expect the routine three-way BACKLOG conflict at merge — keep both sides' rows.
- [ ] Registry sanity: `rg "unverified-gap" tests/components/admin/showpage/popoverOverlayRegistry.ts` → no matches (plan-time output: 1 match, the AttentionMenu row; T3 removes it).
- [ ] Whole-suite gate: `pnpm test && pnpm typecheck && pnpm lint`; full standalone config; lifecycle-layout local run.
- [ ] COMMIT: `docs(plan): popover cluster close-out — backlog graduation, closeout marker`

### Pipeline stages after T12 (sequenced, not waived)

Whole-diff Codex cross-model review (fresh-eyes, REVIEWER ONLY) iterated to APPROVE → push → PR → real GitHub Actions green → `gh pr merge --merge` → fast-forward local `main`, verify `git rev-list --left-right --count main...origin/main` = `0  0`.

## 2. Anti-tautology notes

- T1 throttle case counts rAF registrations — a debounce cannot pass; never "function was called".
- T2/T3/T9 fitted expectations derived from mocked/measured rects via `computeFittedMaxHeight` or in-page math — the literal 322 appears nowhere in tests.
- T6 composed test drives ONLY public surfaces; direct prop injection there is forbidden (bypasses both hops).
- T8 absent/blank-prop cases pin today's strings byte-exact so default drift fails.
- T9 asserts `scrollTop` deltas and FIRST-surface-closed; first-try-green is answered with a deliberate reverted mutation, quoted in the commit body.
- T5's tightened regex bite is observed via a temporary local revert, quoted in the commit body.

## 12. Closeout

impeccable-gate: critique=<RAN|RAN-DEGRADED> audit=<RAN|RAN-DEGRADED> p0=<int> p1=<int> dispositions=<recorded|none>

(TEMPLATE form until T11 runs; replaced with the RAN form + findings/dispositions before the whole-diff review.)
