# Attention Modal Switcher Gallery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the bare-card renderer at `/admin/dev/attention-gallery` with a prev/next switcher over the REAL `PublishedReviewModal`, each scenario's synthetic attention state placed in its true in-modal position.

**Architecture:** Server page runs the real derivation per scenario into serializable modal data (one ATOMIC builder producing correlated `data` + `bySection` + `attentionItems`); a client switcher owns the 8 no-op action closures, provides `ReviewModalCloseContext` to intercept close, renders the real modal keyed by scenario id, and portals a control bar to `document.body` (escaping the admin `[data-inert-root]`). Non-modal-expressible tier-2 scenarios are excluded and footnoted.

**Tech Stack:** Next.js 16 App Router (RSC), React 19, TypeScript strict, Vitest, Playwright (`dev-build` project, port 3001, `ADMIN_DEV_PANEL_ENABLED=true`), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-07-21-attention-modal-switcher-gallery-design.md` (APPROVED, Codex R4). Section refs (§) point there.

## Global Constraints
- TDD per task: failing test → minimal impl → passing test → commit. Every commit `git add`s new files explicitly (`git commit -am` does NOT stage untracked). Conventional commits (`feat(dev):`/`test(dev):`/`refactor(dev):`).
- No DB write / schema / advisory lock / admin-alert code / mutation-observability surface (invariant 10 N/A — no-ops write nothing).
- UI surface → impeccable dual-gate before Codex whole-diff review. Pre-code mechanical gate (applied in every UI task): no em-dashes in visible copy, literal apostrophes, `min-h-tap-min` (44px), canonical tokens (`text-xs`, `text-subtle`).
- RSC boundary: the 8 action props are CLIENT-owned; the server page passes ONLY serializable data. Client modules import shared types with `import type`.
- Worktree `/Users/ericweiss/FX-worktrees/attention-modal-gallery`, branch `feat/attention-modal-gallery`. Commit `--no-verify` (autonomous).

## Type & ownership map (single source, no drift)
- `lib/dev/galleryModalTypes.ts` (NEW, client-safe, no server imports): `ActionKeys` union, `GalleryModalData = Omit<PublishedReviewModalProps, ActionKeys>`, `GallerySwitcherScenario = { id; tier: 1|2; label; codes: string[]; data: GalleryModalData }`, `ExcludedScenario = { id: string; label: string }`, and the relocated constants `GALLERY_SLUG = "gallery"`, `GALLERY_NOW = new Date("2026-07-01T18:00:00.000Z")`. All other modules import these (type-only where values not needed). This module has NO runtime dependency on `buildBlockProps` or any server-only code, so Task 9's deletion of `buildBlockProps.ts` cannot break it.
- `isModalExpressible` + `partitionScenarios` + `resolveInitialScenario`: owned SOLELY by `app/admin/dev/attention-gallery/buildSwitcherScenarios.ts`. `params.ts` is deleted (its only export was width params); no dual ownership.

---

### Task 1: Shared types + constants module

**Files:** Create `lib/dev/galleryModalTypes.ts`; Test `tests/dev/galleryModalTypes.test.ts`.

- [ ] **Step 1: Failing test** — assert `GALLERY_SLUG === "gallery"`, `GALLERY_NOW` is a `Date`, and a compile-time check that `ActionKeys` equals the 8 function keys (a `satisfies` assertion referencing `PublishedReviewModalProps`).
- [ ] **Step 2: Verify fail** — `pnpm vitest run tests/dev/galleryModalTypes.test.ts` (module missing).
- [ ] **Step 3: Implement** — define the types + constants. `type ActionKeys = "setPublished"|"archiveAction"|"unarchiveAction"|"undoAction"|"acceptAction"|"acceptAllAction"|"approveAction"|"rejectAction";` with a `satisfies` guard: `const _actionKeyCheck: Record<ActionKeys, true> = {...}` typed so a missing/extra key fails compile.
- [ ] **Step 4: Verify pass** + `pnpm typecheck`.
- [ ] **Step 5: Commit** — `git add lib/dev/galleryModalTypes.ts tests/dev/galleryModalTypes.test.ts && git commit --no-verify -m "feat(dev): shared gallery modal types + constants"`

---

### Task 2: `deriveScenarioAttention` extraction

**Files:** Create `lib/dev/deriveScenarioAttention.ts`; Modify `app/admin/dev/attention-gallery/buildBlockProps.ts` (import extracted helper, keep green until Task 9); Test `tests/dev/deriveScenarioAttention.test.ts`.

**Interfaces:** Produces `deriveScenarioAttention(s: AttentionScenario): AttentionItem[]`.

- [ ] **Step 1: Failing test** — use a **single-alert** fixture scenario whose one alert code is a literal (e.g. build a minimal `AttentionScenario` with `alerts: [{ code: "AMBIGUOUS_EMAIL_BINDING", ... }]`); assert `result.some(i => i.kind === "alert" && i.alert.code === "AMBIGUOUS_EMAIL_BINDING")` (input/output assertion, order-independent — `[plan-R2 §2.4, §4.2]`). Plus catalog assertion: `for (every tier-1 scenario) expect(deriveScenarioAttention(s).length).toBeGreaterThan(0)` `[§3.2 R1-15]`.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — move `toAlertInputs`/`toHoldRows` + the `deriveAttentionItems` call (`buildBlockProps.ts:45-65,163-167`) into the new module; `buildBlockProps` imports it (no behavior change).
- [ ] **Step 4: Verify pass** + existing `tests/app/admin/attentionGalleryRender.test.tsx` still green.
- [ ] **Step 5: Commit** (git add both) — `refactor(dev): extract deriveScenarioAttention`

---

### Task 3: `buildScenarioModalData` — ONE atomic builder (data + bySection + attentionItems + anchors)

**Files:** Create `lib/dev/publishedModalFixture.ts` (`buildGalleryModalData` base defaults) + `lib/dev/buildScenarioModalData.ts` (the atomic per-scenario builder); Test `tests/dev/buildScenarioModalData.test.ts`.

**Interfaces:**
- `buildGalleryModalData(over?: Partial<GalleryModalData>): GalleryModalData` — base defaults (no functions), lifted from `baseProps` data half (`publishedReviewModal.test.tsx:214`), using `GALLERY_SLUG`/`GALLERY_NOW`.
- `buildScenarioModalData(s: AttentionScenario): GalleryModalData` — the ATOMIC builder `[§1.1]`: from ONE scenario it derives `data`, `bySection`, and `attentionItems` **correlated to the same scenario** so `bySection` is never built from the default snapshot while `attentionItems` come from the scenario. Steps: (a) `const warnings = s.warnings ?? []`; (b) shape `snapshot` — populate diagram/opening_reel anchors when the scenario's alert codes carry a rooms/event anchor via `ATTENTION_ROUTES[code].anchor`, EXCEPT `T2_ANCHOR_ABSENT` which leaves them empty `[plan-prep: base snapshot has null anchors, so anchored alerts need anchors ADDED]`; (c) `const data = buildPublishedSectionData(snapshot(warnings), { slug: GALLERY_SLUG })`; (d) `const bySection = buildSectionWarningModel({ slug: GALLERY_SLUG, warnings: data.warnings, ignoredFingerprints: new Set(), renderedSectionIds: new Set(step3Sections(data).map(x=>x.id)) })`; (e) `const attentionItems = deriveScenarioAttention(s)`; (f) `return buildGalleryModalData({ data, bySection, attentionItems, alertsDegraded: s.degraded ?? false })`.

- [ ] **Step 1: Failing test** — (i) `structuredClone(buildScenarioModalData(s))` throws nothing for a sample warning scenario AND a sample anchored-alert scenario; (ii) for a warning scenario, `bySection` reflects the scenario's warnings (assert a section key derived from the scenario's warning is present in `bySection`, computed independently from the warning input) — proving correlation, not default; (iii) for an anchored-alert (non-T2_ANCHOR_ABSENT) scenario, `data.diagrams`/`data.eventDetails.opening_reel` is populated so `anchorsForData(data)` is non-empty; (iv) for `T2_ANCHOR_ABSENT`, `anchorsForData(data)` is empty.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** the two modules.
- [ ] **Step 4: Verify pass** + typecheck.
- [ ] **Step 5: Commit** (git add) — `feat(dev): atomic buildScenarioModalData + fixture base`

---

### Task 4: `partitionScenarios` + `isModalExpressible` + `resolveInitialScenario`

**Files:** Create `app/admin/dev/attention-gallery/buildSwitcherScenarios.ts`; Test `tests/app/admin/attentionModalGallery.serverProps.test.ts`.

**Interfaces:**
- `isModalExpressible(s: AttentionScenario): boolean` — exported, independently tested.
- `partitionScenarios(): { rendered: GallerySwitcherScenario[]; excluded: ExcludedScenario[] }`.
- `resolveInitialScenario(raw: string | string[] | undefined, rendered: GallerySwitcherScenario[]): string | null`.

**`isModalExpressible` truth table `[plan-R1 §3.8, §3.7]`** (the predicate is: a scenario is NOT expressible iff it overrides a modal-internal predicate the modal derives from its own data):
| `s.bucket?.sectionAvailable` | `s.bucket?.crewKeyRendered` | result |
| defined | any | `false` (excluded) |
| undefined | defined | `false` (excluded) |
| undefined | undefined | `true` (rendered; `anchorAvailable` is reproducible via data-shaping, so it does NOT exclude) |
Implementation: `isModalExpressible = (s) => s.bucket?.sectionAvailable === undefined && s.bucket?.crewKeyRendered === undefined;` (explicit `=== undefined`, not truthiness `[§3.8]`).

- [ ] **Step 1: Failing test** — cases: (a) `isModalExpressible` returns false for each of `T2_SECTION_ABSENT`/`T2_OVERVIEW_ABSENT`/`T2_CREW_ROW_ABSENT`, true for `T2_ANCHOR_ABSENT` and a tier-1 scenario (tests the EXPORTED predicate directly `[§4.3]`); (b) `partitionScenarios().excluded.map(e=>e.id).sort()` equals the three ids sorted, AND `isModalExpressible` evaluated across the WHOLE catalog agrees with the partition (no special-casing `[§1.2, §4.3]`); (c) no tier-3 id appears in `rendered` `[§1.2]`; (d) every `rendered` scenario's `data` `structuredClone`s clean; (e) `resolveInitialScenario`: valid scalar → id; unknown scalar → null; excluded id → null; a tier-3 id → null; empty string → null; `undefined` → null; `[id, "x"]` array → id (first wins) `[§3.3, §4.4]`.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — `partitionScenarios`: `ALL_SCENARIOS.filter(s=>s.tier!==3)` split by `isModalExpressible`; rendered mapped to `{id, tier, label, codes, data: buildScenarioModalData(s)}`, `codes = [...new Set([...s.alerts.map(a=>a.code), ...(s.warnings?.map(w=>w.code) ?? [])])]`; excluded → `{id, label}`. `resolveInitialScenario` normalizes then matches `rendered` ids.
- [ ] **Step 4: Verify pass** + typecheck.
- [ ] **Step 5: Commit** (git add) — `feat(dev): partitionScenarios + isModalExpressible + resolveInitialScenario`

---

### Task 5: `SwitcherControls` (before the switcher — no forward dep)

**Files:** Create `components/admin/dev/SwitcherControls.tsx`; Test `tests/components/admin/dev/switcherControls.test.tsx`.

**Interfaces:** `SwitcherControls({ index, total, label, tier, codes, excluded, onPrev, onNext, closed, onReopen })`. Pure presentational; imports `GallerySwitcherScenario`/`ExcludedScenario` with `import type`.

- [ ] **Step 1: Failing test** — renders `n / total`, label, `tier` chip, `codes.join(", ")`; `excluded.length>0` → footnote lists `excluded.map(e=>e.label)`; step buttons carry `min-h-tap-min`; `role="group"`, count `aria-live="polite"`; when `closed` shows a Reopen button wired to `onReopen`; no em-dash in any rendered string (regex assert).
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** per §3.4 (fixed z-[60] top-center; canonical tokens).
- [ ] **Step 4: Verify pass.**
- [ ] **Step 5: Commit** (git add) — `feat(dev): SwitcherControls control bar`

---

### Task 6: `AttentionModalSwitcher` client component

**Files:** Create `components/admin/dev/AttentionModalSwitcher.tsx`; Test `tests/components/admin/dev/attentionModalSwitcher.test.tsx`.

**Interfaces:** `AttentionModalSwitcher({ scenarios, excluded, initialId })`. Renders `SwitcherControls` (Task 5) + the real modal.

**No-op action contract matrix `[§1.7, §3.9]`** — typed via `satisfies Pick<PublishedReviewModalProps, ActionKeys>`, every action async:
| action | signature | returns |
| `setPublished` | `(next: boolean) => Promise<LifecycleResult>` | `{ ok: true } as const` |
| `archiveAction` | `() => Promise<LifecycleResult>` | `{ ok: true } as const` |
| `unarchiveAction` | `(showId: string) => Promise<void>` | `undefined` |
| `undoAction`/`acceptAction`/`acceptAllAction`/`approveAction`/`rejectAction` | per `ChangesSectionProps[...]` | `undefined` |

- [ ] **Step 1: Failing test** (mock `next/navigation`, capture props passed to a mocked `PublishedReviewModal`): (a) empty `scenarios` → EmptyState, no `scenarios[index]` access; (b) prev/next functional wrap; (c) capture the mocked modal's props and INVOKE all 8 callbacks, awaiting each, asserting exact results (`setPublished(true)` → `{ok:true}`, `unarchiveAction("x")` → `undefined`, etc.) `[§4.5, §1.7]`; (d) `indexOfId(scenarios, initialId)` — valid id → its index, unknown/null → 0; (e) simulate `galleryClose()` then Reopen → arrow advances index (proves `closingRef` reset `[R3-1]`).
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** per §3.3: `indexOfId` helper; `useState(()=>indexOfId(scenarios, initialId))`; `closed` + `closingRef`; no-op `actions` object `satisfies Pick<...>`; `galleryClose`; render `{!closed && <ReviewModalCloseContext.Provider value={galleryClose}><ShareTokenProvider initialToken={null} initialEpoch={0}><PublishedReviewModal key={current.id} {...current.data} {...actions}/></...></...>}`; document `keydown {capture:true}` (←/→ guarded on `closingRef.current||closed`, Escape preventDefault+stopPropagation); `useHasMounted` → `createPortal(<SwitcherControls .../>, document.body)`; Reopen `closingRef.current=false; setClosed(false)`.
- [ ] **Step 4: Verify pass** + typecheck.
- [ ] **Step 5: Commit** (git add) — `feat(dev): AttentionModalSwitcher`

---

### Task 7: Rewrite `page.tsx` (server route)

**Files:** Modify `app/admin/dev/attention-gallery/page.tsx`; Test extend `attentionModalGallery.serverProps.test.ts`.

- [ ] **Step 1: Failing test** — mock `requireDeveloper` + `partitionScenarios`; render the page; assert (a) `requireDeveloper` is invoked BEFORE `partitionScenarios` (executable call-order via mock invocation order `[§4.7]`); (b) when `requireDeveloper` rejects, `partitionScenarios` is never called; (c) the props passed to the mocked `AttentionModalSwitcher` are `structuredClone`-able (no function leaks through the spread `[§1.4]`) and contain `scenarios`/`excluded`/`initialId`; (d) `GalleryWriteGuard` present.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — `requireDeveloper()` first; `const sp = await props.searchParams`; `const { rendered, excluded } = partitionScenarios()`; `const initialId = resolveInitialScenario(sp?.scenario, rendered)`; render `<GalleryWriteGuard/>` + `<AttentionModalSwitcher .../>`. Keep `dynamic="force-dynamic"`.
- [ ] **Step 4: Verify pass.**
- [ ] **Step 5: Commit** (git add) — `feat(dev): switcher-driven attention-gallery route`

---

### Task 8: Remove card renderer + registry reconciliation (structural test FIRST)

**Files:** Delete `components/admin/dev/ScenarioBlock.tsx`, `components/admin/dev/GalleryCard.tsx`, `app/admin/dev/attention-gallery/buildBlockProps.ts`, `app/admin/dev/attention-gallery/params.ts`, `tests/components/admin/dev/scenarioBlock.test.tsx`, `tests/app/admin/attentionGalleryRender.test.tsx`, `tests/app/admin/attentionGalleryParams.test.ts`, `tests/e2e/attention-gallery-layout.spec.ts`. Modify: none expected (see meta-test decl).

**Meta-test declaration `[§6.1, §6.2]`:** the derivation call site moved from `buildBlockProps` to `lib/dev/deriveScenarioAttention.ts` (Task 2) and is still called by the switcher path. `tests/messages/_metaAttentionItemsTopology.test.ts` pins that `deriveAttentionItems` has exactly its allowed callers — **verify its caller allowlist**: if it lists `buildBlockProps.ts` by path, it MUST be updated to `lib/dev/deriveScenarioAttention.ts`; the plan step below checks and edits if needed (not "verify, no edit"). `filesMembership.test.ts:152` pins the route PATH (`app/admin/dev/attention-gallery/page.tsx`) which is unchanged → no edit; confirmed by a green run. `build-artifact-gate.test.ts` references `"attention-gallery"` string → unchanged.

- [ ] **Step 1: Failing structural test FIRST `[§2.2]`** — add `tests/admin/dev/noCardRenderer.test.ts` asserting `ScenarioBlock.tsx`/`GalleryCard.tsx`/`buildBlockProps.ts` do NOT exist (fs check) and no source under `app/`/`components/` imports them (grep). Runs RED now (files still present).
- [ ] **Step 2** — grep the topology meta-test for `buildBlockProps`; if present, update its allowlist to `lib/dev/deriveScenarioAttention.ts`.
- [ ] **Step 3: Delete** the files; `pnpm typecheck` → fix any dangling import.
- [ ] **Step 4: Verify** — `noCardRenderer.test.ts` GREEN; `pnpm vitest run tests/admin/dev/filesMembership.test.ts tests/admin/build-artifact-gate.test.ts tests/messages/_metaAttentionItemsTopology.test.ts tests/components/admin/dev/galleryWriteGuard.test.tsx` all GREEN; full `pnpm typecheck` + `pnpm lint` green.
- [ ] **Step 5: Commit** (git add -A for deletions) — `refactor(dev): remove card renderer, reconcile registries`

---

### Task 9: Real-browser e2e (`dev-build`) — acceptance suite

**Files:** Create `tests/e2e/attention-modal-gallery.spec.ts`. Reference: `tests/e2e/_publishedReviewModalHarness.tsx`, `published-review-modal.interactions.spec.ts` (readiness patterns), `developer-tier.spec.ts` (auth storage state).

**Harness readiness (operationalized) `[§5]`:**
- **Build + server:** the `dev-build` project (`playwright.config.ts`) builds with `pnpm build` under `ADMIN_DEV_PANEL_ENABLED=true` then `next start --port 3001`; confirm the config's build step runs a FRESH build (no stale `.next` reuse) — if the config only `next start`s, add the build to its `webServer.command` or a global-setup `[§5.1, §5.6]`. Playwright `webServer` waits on the port; the TEST additionally awaits authenticated gallery content before the dialog `[§5.6]`.
- **Auth:** use the developer session/storage-state fixture that `developer-tier.spec.ts` uses; assert the landed URL is `/admin/dev/attention-gallery` (not a sign-in redirect) before any modal assertion `[§5.2]`.
- **Per-navigation readiness `[§5.3, §5.4]`:** after EACH deep-link/scenario change, re-query and await exactly one visible `[role="dialog"]`; never retain a locator/handle/bounding-box across a keyed remount (fresh query each time).
- **Key repeat `[§5.5]`:** synthesize rapid stepping with N discrete `keyboard.press("ArrowRight")` calls (not one `keyboard.down` OS-repeat), settling on observable count/dialog state, not a fixed timeout.

**Acceptance assertions (authored as the acceptance definition; run RED until Tasks 6-7 land, then GREEN) `[§2.1]`:**
- [ ] iterate EVERY rendered scenario via `?scenario=<id>`; assert a **scenario-specific** marker (its `code` text or expected attention content), not merely "dialog has text" `[§2.7]` — the authoritative Flight proof `[§1.4]`.
- [ ] `←`/`→` advance the `aria-live` count while the modal is open and focus is inside the dialog `[R1-1]`.
- [ ] controls are OUTSIDE `[data-inert-root]`, remain non-inert, and are clickable while the modal is active; the admin root IS inert `[§1.5]`.
- [ ] rapid stepping (N discrete presses) → exactly ONE `[role="dialog"]` AND exactly ONE control bar `[§6.5, §1.5]`; body scroll locked.
- [ ] EVERY warning scenario: EACH warning item's exact copy present in the dialog + its section dot marked `[§1.9]`; representative also in initial viewport.
- [ ] degraded scenario shows the degraded banner.
- [ ] **Write containment across ALL reachable mutation controls `[§1.8, §6.4]`:** for publish toggle, archive (where rendered), Accept/Accept All/Undo/Approve/Reject (where rendered), and the real `PerShowAlertResolveButton`: attach a `page.on("request")` listener BEFORE the click, assert no non-GET request, assert `data-gallery-blocked-write` is set only for the guard-blocked `fetch` control and is ABSENT before any action + reset by a fresh navigation `[§6.4]`; detach the listener after each control block `[§4.8]`. Pair "UI unchanged" with the request-absence assertion (not alone — controlled prop is naturally unchanged `[§2.6]`).
- [ ] close: X → inert + scroll-lock released, Reopen restores dialog + locks + nav works after reopen; Escape while OPEN does nothing `[§1.6]`.
- [ ] excluded footnote: all three excluded labels appear (outside the inert root); no excluded id renders as a modal scenario `[§1.10]`.

- [ ] **Steps:** author the spec (RED, route not yet switcher) → after Tasks 6-7, iterate to GREEN. `pnpm exec playwright test --project=dev-build tests/e2e/attention-modal-gallery.spec.ts`. Commit (git add) — `test(dev): real-browser acceptance e2e`

---

### Task 10: impeccable dual-gate + handoff

**Files:** Create `docs/superpowers/plans/2026-07-21-attention-modal-switcher-gallery-handoff.md` (the named handoff `[§6.3]`).

- [ ] Pre-code mechanical sweep confirmed in Tasks 5-7 (em-dash/apostrophe/tap-target/tokens).
- [ ] `/impeccable critique` on the diff (subagent-isolated); each behavioral P0/P1 repair starts with a **failing regression test** `[§2.3]`; pure CSS/mechanical findings use the static gate.
- [ ] `/impeccable audit` on the diff; same repair discipline.
- [ ] Record findings + dispositions in handoff §7; commit the handoff doc.
- [ ] Commit fixes (git add) — `fix(dev): impeccable dual-gate repairs`

---

### Task 11: Pre-push gates + whole-diff review + merge

- [ ] `pnpm typecheck` + `pnpm lint` + `pnpm format:check` green.
- [ ] Full `pnpm test` green (registry suites incl. `tests/styles`, `tests/help`).
- [ ] `pnpm exec playwright test --project=dev-build` green.
- [ ] Codex whole-diff review (split by surface) → APPROVE.
- [ ] Push; real CI green; `gh pr merge --merge`; fast-forward main → `rev-list --left-right --count main...origin/main` == `0 0`.

---

## Self-Review
- **Spec coverage:** §3.1 fixture → Task 3; §3.2 partition/derive/anchors → Tasks 2-4; §3.3 switcher → Task 6; §3.4 controls → Task 5; §3.5 query → Task 4; §3.6 removals → Task 8; safety (§2.1 RSC, §2.2 portal/inert/close, §2.4 tier-2) → Tasks 3,4,6,9; tests → Task 9; gates → Tasks 10-11.
- **Ordering:** shared types (1) → derive (2) → atomic builder (3) → partition (4) → controls (5) → switcher (6) → route (7) → removal (8) → e2e (9). No forward dependency (controls before switcher; constants in a durable module before buildBlockProps deletion).
- **Anti-tautology:** Task 2 input/output single-alert; Task 3 correlation asserted independently; Task 4 predicate tested directly + catalog-agreement; Task 9 scenario-specific markers + request-absence paired with UI-unchanged.
