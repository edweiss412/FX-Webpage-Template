# Attention Modal Switcher Gallery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the bare-card renderer at `/admin/dev/attention-gallery` with a prev/next switcher over the REAL `PublishedReviewModal`, each scenario's synthetic attention state placed in its true in-modal position.

**Architecture:** Server page runs the real derivation per scenario into serializable modal data; a client switcher owns the 8 no-op action closures, provides `ReviewModalCloseContext` to intercept close, renders the real modal keyed by scenario id, and portals a control bar to `document.body` (escaping the admin `[data-inert-root]`). Non-modal-expressible tier-2 structural scenarios are excluded and footnoted.

**Tech Stack:** Next.js 16 App Router (RSC), React 19, TypeScript strict, Vitest, Playwright (dev-build project, port 3001, `ADMIN_DEV_PANEL_ENABLED=true`), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-07-21-attention-modal-switcher-gallery-design.md` (APPROVED). Section refs below point there.

## Global Constraints
- TDD per task: failing test → minimal impl → passing test → commit. Conventional commits (`feat(dev):` / `test(dev):` / `refactor(dev):`).
- No DB write, no schema, no advisory lock, no admin-alert code, no mutation-observability surface (invariant 10 N/A — no-ops write nothing).
- UI surface → impeccable dual-gate before Codex whole-diff review. Mechanical UI gate pre-code: no em-dashes in visible copy, literal apostrophes, `min-h-tap-min` (44px), canonical tokens (`text-xs`, `text-subtle`).
- The 8 action props are CLIENT-owned; the server page passes only serializable data (RSC boundary).
- Worktree `/Users/ericweiss/FX-worktrees/attention-modal-gallery`, branch `feat/attention-modal-gallery`. Commit `--no-verify` (autonomous).

---

### Task 1: `lib/dev/publishedModalFixture.ts` — modal data factory

**Files:**
- Create: `lib/dev/publishedModalFixture.ts`
- Test: `tests/dev/publishedModalFixture.test.ts`

**Interfaces:**
- Produces: `GalleryModalData = Omit<PublishedReviewModalProps, ActionKeys>`; `buildGalleryModalData(over?: Partial<GalleryModalData>): GalleryModalData`.
- Consumes: real `buildPublishedSectionData`, `buildSectionWarningModel`, `step3Sections` (the loader's builders); `GALLERY_SLUG`/`GALLERY_NOW` from `buildBlockProps.ts:37`.

- [ ] **Step 1: Write the failing test** (`tests/dev/publishedModalFixture.test.ts`)
```ts
import { describe, expect, test } from "vitest";
import { buildGalleryModalData } from "@/lib/dev/publishedModalFixture";

describe("buildGalleryModalData", () => {
  test("returns valid modal data with no function-valued props", () => {
    const d = buildGalleryModalData();
    // structuredClone throws DataCloneError on any function/symbol leak (spec §2.1(3))
    expect(() => structuredClone(d)).not.toThrow();
    expect(d.slug).toBe("gallery");
    expect(d.attentionItems).toEqual([]);
    expect(d.alertsDegraded).toBe(false);
    expect(d.published).toBe(true);
    expect(d.now).toBeInstanceOf(Date);
  });
  test("top-level override wins", () => {
    const d = buildGalleryModalData({ alertsDegraded: true });
    expect(d.alertsDegraded).toBe(true);
  });
});
```

- [ ] **Step 2: Run test, verify it fails** — `pnpm vitest run tests/dev/publishedModalFixture.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write minimal implementation** — lift the data half of `baseProps` (`tests/components/admin/showpage/publishedReviewModal.test.tsx:214`), drop the 8 `vi.fn()` fields. Use `GALLERY_SLUG`/`GALLERY_NOW`. Type `GalleryModalData` via `Omit<PublishedReviewModalProps, "setPublished"|"archiveAction"|"unarchiveAction"|"undoAction"|"acceptAction"|"acceptAllAction"|"approveAction"|"rejectAction">`. Build `data` via `buildPublishedSectionData`, `bySection` via `buildSectionWarningModel`. Shallow-merge `over` last. (Full field list: spec §3.1.)

- [ ] **Step 4: Run test, verify pass.**

- [ ] **Step 5: Commit** — `git commit --no-verify -am "feat(dev): buildGalleryModalData modal fixture factory"`

---

### Task 2: Extract `deriveScenarioAttention` from `buildBlockProps`

**Files:**
- Create: `lib/dev/deriveScenarioAttention.ts` (moves `toAlertInputs`/`toHoldRows` + the `deriveAttentionItems` call out of `buildBlockProps.ts`)
- Modify: `app/admin/dev/attention-gallery/buildBlockProps.ts` (import the extracted helper; will be deleted in Task 7 but keep green meanwhile)
- Test: `tests/dev/deriveScenarioAttention.test.ts`

**Interfaces:**
- Produces: `deriveScenarioAttention(s: AttentionScenario): { attentionItems: AttentionItem[] }`.

- [ ] **Step 1: Failing test** — for a known tier-1 alert scenario, assert `attentionItems.length >= 1` and the first item's `alert.code` equals the scenario's declared code (expected derived INDEPENDENTLY from `scenario.alerts[0].code`, not from the helper — anti-tautology). Add a catalog-wide assertion: every tier-1 scenario yields ≥1 item (spec §3.2, `[R1-15]`).

- [ ] **Step 2: Verify fail.**

- [ ] **Step 3: Implement** — move the derivation core (`buildBlockProps.ts:45-65,163-167`) into the new module; `buildBlockProps` imports it. No behavior change.

- [ ] **Step 4: Verify pass** + `pnpm vitest run tests/app/admin/attentionGalleryRender.test.tsx` still green (buildBlockProps unchanged behavior).

- [ ] **Step 5: Commit** — `refactor(dev): extract deriveScenarioAttention shared helper`

---

### Task 3: `partitionScenarios` + `isModalExpressible` + `buildData`

**Files:**
- Create: `app/admin/dev/attention-gallery/buildSwitcherScenarios.ts`
- Test: `tests/app/admin/attentionModalGallery.serverProps.test.ts`

**Interfaces:**
- Produces: `partitionScenarios(): { rendered: GallerySwitcherScenario[]; excluded: { id: string; label: string }[] }`; `GallerySwitcherScenario = { id; tier: 1|2; label; codes: string[]; data: GalleryModalData }`; `isModalExpressible(s): boolean`; `resolveInitialScenario(raw: string|string[]|undefined, rendered): string|null`.

- [ ] **Step 1: Failing test**
```ts
import { describe, expect, test } from "vitest";
import { partitionScenarios, isModalExpressible, resolveInitialScenario } from "@/app/admin/dev/attention-gallery/buildSwitcherScenarios";
import { T2_SECTION_ABSENT, T2_OVERVIEW_ABSENT, T2_CREW_ROW_ABSENT, T2_ANCHOR_ABSENT } from "@/lib/dev/attentionScenarios/tier2";

test("excluded set is exactly the three non-expressible ids", () => {
  const { excluded } = partitionScenarios();
  expect(excluded.map((e) => e.id).sort()).toEqual(
    [T2_SECTION_ABSENT, T2_OVERVIEW_ABSENT, T2_CREW_ROW_ABSENT].sort(),
  );
});
test("anchor-absent stays rendered (expressible via data-shaping)", () => {
  const { rendered } = partitionScenarios();
  expect(rendered.some((s) => s.id === T2_ANCHOR_ABSENT)).toBe(true);
});
test("no rendered scenario carries a function prop", () => {
  for (const s of partitionScenarios().rendered) expect(() => structuredClone(s.data)).not.toThrow();
});
test("resolveInitialScenario normalizes array + rejects excluded/tier3/absent", () => {
  const { rendered } = partitionScenarios();
  const id = rendered[0]!.id;
  expect(resolveInitialScenario([id, "x"], rendered)).toBe(id); // first wins
  expect(resolveInitialScenario(undefined, rendered)).toBeNull();
  expect(resolveInitialScenario(T2_SECTION_ABSENT, rendered)).toBeNull();
});
```

- [ ] **Step 2: Verify fail.**

- [ ] **Step 3: Implement** — `isModalExpressible(s) = !(s.bucket?.sectionAvailable || s.bucket?.crewKeyRendered)`. `partitionScenarios`: filter `tier !== 3`, split by `isModalExpressible`; map rendered via `deriveScenarioAttention` + `buildData(s)` + `buildGalleryModalData`; `codes` from `s.alerts.map(a=>a.code)` ∪ `s.warnings?.map(w=>w.code)`. `buildData(s)`: base `buildPublishedSectionData(snapshot(s.warnings ?? []))`; for `T2_ANCHOR_ABSENT` clear `data.diagrams` signal + `data.eventDetails.opening_reel` (spec §3.2/§2.4). `resolveInitialScenario`: normalize `string[]→[0]`, `undefined→null`, match against `rendered` ids only. Throw if a tier-1 scenario yields 0 items.

- [ ] **Step 4: Verify pass.**

- [ ] **Step 5: Commit** — `feat(dev): partitionScenarios + isModalExpressible + resolveInitialScenario`

---

### Task 4: `AttentionModalSwitcher` client component

**Files:**
- Create: `components/admin/dev/AttentionModalSwitcher.tsx`
- Test: `tests/components/admin/dev/attentionModalSwitcher.test.tsx`

**Interfaces:**
- Consumes: `GallerySwitcherScenario[]`, `excluded {id,label}[]`, `initialId`; `PublishedReviewModal`, `ReviewModalCloseContext`, `ShareTokenProvider`.
- Produces: `AttentionModalSwitcher(props)`.

- [ ] **Step 1: Failing test** — mock `next/navigation` (router). Assert: empty `scenarios` → EmptyState (no throw); prev/next wrap via functional update; the 8 no-op actions have correct return shapes (`setPublished()` → `{ok:true}`); close→reopen re-enables arrow nav (simulate `galleryClose()` then Reopen click then arrow → index advances). (jsdom cannot assert inert/focus — those are e2e, Task 8.)

- [ ] **Step 2: Verify fail.**

- [ ] **Step 3: Implement** — per spec §3.3: `useState(index)` with functional `step`; `closed` state + `closingRef`; module-const no-op actions ({ok:true} for publish/archive, void for the rest); `galleryClose = () => { closingRef.current = true; setClosed(true); }`; render `{!closed && <ReviewModalCloseContext.Provider value={galleryClose}><ShareTokenProvider initialToken={null} initialEpoch={0}><PublishedReviewModal key={current.id} {...current.data} {...noop}/></ShareTokenProvider></...>}`; document `keydown` `{capture:true}` (←/→ guarded on `closingRef.current||closed`, Escape preventDefault+stopPropagation); `useHasMounted` gate → `createPortal(<SwitcherControls .../>, document.body)` post-mount; Reopen resets `closingRef.current=false` then `setClosed(false)`.

- [ ] **Step 4: Verify pass** + typecheck (`pnpm typecheck`).

- [ ] **Step 5: Commit** — `feat(dev): AttentionModalSwitcher (operable switcher over real modal)`

---

### Task 5: `SwitcherControls` portaled control bar

**Files:**
- Create: `components/admin/dev/SwitcherControls.tsx` (or co-located in Task 4's file; separate for testability)
- Test: `tests/components/admin/dev/switcherControls.test.tsx`

- [ ] **Step 1: Failing test** — renders count `n / total`, label, tier chip, `codes.join(", ")`; when `excluded.length>0`, footnote lists `excluded.map(e=>e.label)`; step buttons have `min-h-tap-min`; `role="group"`, count `aria-live="polite"`; no em-dash in rendered text.

- [ ] **Step 2: Verify fail.**

- [ ] **Step 3: Implement** — per spec §3.4: `fixed z-[60]` top-center, `min-h-tap-min` buttons, aria, footnote from `excluded` prop. Canonical tokens.

- [ ] **Step 4: Verify pass.**

- [ ] **Step 5: Commit** — `feat(dev): SwitcherControls portaled control bar`

---

### Task 6: Rewrite `page.tsx` (server route body)

**Files:**
- Modify: `app/admin/dev/attention-gallery/page.tsx`
- Test: extend `tests/app/admin/attentionModalGallery.serverProps.test.ts` (server passes only data)

- [ ] **Step 1: Failing test** — assert the page module's rendered tree passes `rendered`/`excluded`/`initialId` (data) to `AttentionModalSwitcher` and NO function prop crosses to it (source-scan or render-inspect); `requireDeveloper` is the first call; `GalleryWriteGuard` mounted.

- [ ] **Step 2: Verify fail.**

- [ ] **Step 3: Implement** — `requireDeveloper()` first; `const sp = await props.searchParams`; `const { rendered, excluded } = partitionScenarios()`; `const initialId = resolveInitialScenario(sp?.scenario, rendered)`; render `<GalleryWriteGuard/>` + `<AttentionModalSwitcher scenarios={rendered} excluded={excluded} initialId={initialId}/>`. Keep `dynamic="force-dynamic"`. Remove card-render imports.

- [ ] **Step 4: Verify pass.**

- [ ] **Step 5: Commit** — `feat(dev): switcher-driven attention-gallery route`

---

### Task 7: Remove card renderer + reconcile registries

**Files:**
- Delete: `components/admin/dev/ScenarioBlock.tsx`, `components/admin/dev/GalleryCard.tsx`, `tests/components/admin/dev/scenarioBlock.test.tsx`, `tests/app/admin/attentionGalleryRender.test.tsx`, `tests/e2e/attention-gallery-layout.spec.ts`
- Modify: `app/admin/dev/attention-gallery/buildBlockProps.ts` (delete — now unused) or trim card helpers; `app/admin/dev/attention-gallery/params.ts` (trim to `resolveInitialScenario` if not already in Task 3; delete `MIN/MAX_WIDTH_PX`)
- Verify (no edit): `tests/admin/dev/filesMembership.test.ts` (route path unchanged), `tests/admin/build-artifact-gate.test.ts`, `lib/audit/trustDomains.ts:56`

- [ ] **Step 1** — grep for any remaining importer of `ScenarioBlock`/`GalleryCard`/`buildBlockProps` card exports; confirm none but the deleted tests.
- [ ] **Step 2: Delete** the files; run `pnpm typecheck` → expect failures only from now-dangling imports; fix them.
- [ ] **Step 3** — run `pnpm vitest run tests/admin/dev/filesMembership.test.ts tests/admin/build-artifact-gate.test.ts tests/messages/_metaAttentionItemsTopology.test.ts tests/components/admin/dev/galleryWriteGuard.test.tsx` → all green (topology meta still satisfied: switcher path still calls `deriveAttentionItems`).
- [ ] **Step 4** — full `pnpm typecheck` + `pnpm lint` green.
- [ ] **Step 5: Commit** — `refactor(dev): remove card renderer, reconcile registries`

---

### Task 8: Real-browser e2e (`dev-build`)

**Files:**
- Create: `tests/e2e/attention-modal-gallery.spec.ts` (dev-build project, port 3001, flag on)
- Harness ref: `tests/e2e/_publishedReviewModalHarness.tsx`, `tests/e2e/published-review-modal.interactions.spec.ts` (readiness/hydration patterns)

**Harness-readiness (spec §10, AGENTS.md e2e checklist):** server = dev-build `next start --port 3001` with `ADMIN_DEV_PANEL_ENABLED=true` (existing `playwright.config.ts` dev-build project); readiness gate = await the modal dialog `[data-testid="published-show-review-modal"]` visible before first assertion (not `networkidle`); detach-safety = re-query per iteration, never hold a stale locator across a remount.

- [ ] **Step 1: Write the spec** — assertions (spec §10):
  1. iterate EVERY rendered scenario (deep-link `?scenario=<id>`); modal renders non-blank (dialog present, has text) — the authoritative Flight proof.
  2. `←`/`→` advance the `aria-live` count while the modal is open and focus is inside the dialog (assert count text changes).
  3. rapid arrow presses / held key → exactly one `[role="dialog"]`, admin root has `inert`, `document.body` overflow hidden after settle.
  4. every warning scenario: warning copy present in modal DOM + nav-dot section marked; representative warning also in initial viewport.
  5. degraded scenario shows the degraded banner.
  6. click publish toggle → no error banner, `published` state visually unchanged; click Accept/Undo → unchanged.
  7. click the real `PerShowAlertResolveButton` → `document.documentElement[data-gallery-blocked-write]` set AND no non-GET request via `page.on("request")` capture.
  8. click X → terminal closed state + Reopen visible; press Escape → nothing changes.
- [ ] **Step 2: Run** `pnpm exec playwright test --project=dev-build tests/e2e/attention-modal-gallery.spec.ts` → expect failures until impl is complete (it is, after Tasks 1-7) → iterate to green.
- [ ] **Step 3: Commit** — `test(dev): real-browser e2e for attention modal switcher gallery`

---

### Task 9: impeccable dual-gate + mechanical UI gate

- [ ] Pre-code mechanical sweep already applied in Tasks 4-6 (verify: no em-dash in visible copy, apostrophes, `min-h-tap-min`, canonical tokens).
- [ ] `/impeccable critique` on the diff (subagent-isolated); fix P0/P1 or DEFERRED.
- [ ] `/impeccable audit` on the diff; fix P0/P1 or DEFERRED.
- [ ] Record findings + dispositions in the handoff §12.
- [ ] Commit any fixes — `fix(dev): impeccable dual-gate repairs`

---

### Task 10: Pre-push gates + whole-diff Codex review

- [ ] `pnpm typecheck` + `pnpm lint` + `pnpm format:check` green.
- [ ] Full `pnpm test` green (registry suites incl. tests/styles, tests/help).
- [ ] `pnpm exec playwright test --project=dev-build` green.
- [ ] Codex whole-diff review (split by surface if large) → APPROVE.
- [ ] Push; real CI green; `gh pr merge --merge`; fast-forward main to `0 0`.

---

## Self-Review
- **Spec coverage:** every §3 component → a task (1-6); safety/tests → 8; removals → 7; gates → 9-10. Tier-2 boundary → Task 3. RSC boundary → Tasks 1,3,6 + e2e.
- **Type consistency:** `GalleryModalData`, `GallerySwitcherScenario`, `partitionScenarios`, `isModalExpressible`, `resolveInitialScenario`, `buildGalleryModalData` used consistently across tasks.
- **Anti-tautology:** Task 2/3 tests derive expected values independently from catalog inputs; Task 8 is the ground-truth Flight proof.
