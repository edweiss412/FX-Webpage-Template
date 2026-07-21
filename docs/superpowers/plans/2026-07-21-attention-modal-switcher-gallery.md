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
- `lib/dev/galleryModalTypes.ts` (NEW, client-safe, no server imports): `ActionKeys` union, `GalleryModalData = Omit<PublishedReviewModalProps, ActionKeys>`, `GallerySwitcherScenario = { id; tier: 1|2; label; codes: string[]; data: GalleryModalData }`, `ExcludedScenario = { id: string; label: string }`, and the relocated constants `GALLERY_SLUG = "gallery"`, `GALLERY_NOW = new Date("2026-07-01T18:00:00.000Z")`. All other modules import these (type-only where values not needed). This module has NO runtime dependency on `buildBlockProps` or any server-only code, so Task 8's deletion of `buildBlockProps.ts` cannot break it.
- `isModalExpressible` + `partitionScenarios` + `resolveInitialScenario`: owned SOLELY by `app/admin/dev/attention-gallery/buildSwitcherScenarios.ts`. `params.ts` is deleted (its only export was width params); no dual ownership.

---

### Task 1: Shared types + constants module

**Files:** Create `lib/dev/galleryModalTypes.ts`; Test `tests/dev/galleryModalTypes.test.ts`.

- [ ] **Step 1: Failing test** — assert `GALLERY_SLUG === "gallery"`, `GALLERY_NOW` is a `Date`. Type-level assertions live in the module itself (typecheck is the gate); the runtime test also imports `GalleryModalData`/`GallerySwitcherScenario` to prove they resolve.
- [ ] **Step 2: Verify fail** — `pnpm vitest run tests/dev/galleryModalTypes.test.ts` (module missing).
- [ ] **Step 3: Implement** — define types + constants. **Genuine type-level assertions against `PublishedReviewModalProps` `[plan-R2 §4, plan-R3 §1,§2, plan-R4 §1]`**: `type Assert<T extends true> = T;`; **`IsFn` must not have the `never`-vacuity** (`never extends Fn` is vacuously true, misclassifying an `undefined`-only prop) — `type IsFn<V> = [NonNullable<V>] extends [never] ? false : [NonNullable<V>] extends [(...a: never[]) => unknown] ? true : false;`; `type FnKeys<T> = { [K in keyof T]-?: IsFn<T[K]> extends true ? K : never }[keyof T];`. Then: (a) keys exist — `type _KeysExist = Assert<ActionKeys extends keyof PublishedReviewModalProps ? true : false>;`; (b) all `ActionKeys` are functions (union of NON-function action keys is `never`; a bare union guard collapses `true|never→true`) — `type _NonFn = { [K in ActionKeys]: IsFn<PublishedReviewModalProps[K]> extends true ? never : K }[ActionKeys]; type _AllFns = Assert<[_NonFn] extends [never] ? true : false>;`; (c) NO function key in `GalleryModalData` — `type _NoFns = Assert<[FnKeys<GalleryModalData>] extends [never] ? true : false>;` (`[X] extends [never]` stops `never` distribution; `undefined as never` proves nothing and is banned). Export `Assert`/`IsFn`/`FnKeys`.
- [ ] **Step 3b: Prove the guard BITES via `@ts-expect-error` (not prose) `[plan-R4 §1]`** — in the test file, typecheck-gated negative proofs: `// @ts-expect-error` on `type _Rej = Assert<[FnKeys<{ a: string; cb: () => void }>] extends [never] ? true : false>;` (a leaked fn makes this `Assert<false>` → errors → `@ts-expect-error` passes; if the guard failed to detect it, the unused `@ts-expect-error` itself errors). Plus `Assert<IsFn<undefined> extends false ? true : false>` and `Assert<IsFn<() => void> extends true ? true : false>` (both compile). This is a PASSING typecheck (no contradiction with the green build).
- [ ] **Step 4: Verify pass** + `pnpm typecheck`.
- [ ] **Step 5: Commit** — `git add lib/dev/galleryModalTypes.ts tests/dev/galleryModalTypes.test.ts && git commit --no-verify -m "feat(dev): shared gallery modal types + constants"`

---

### Task 2: `deriveScenarioAttention` extraction

**Files:** Create `lib/dev/deriveScenarioAttention.ts`; Modify `app/admin/dev/attention-gallery/buildBlockProps.ts` (import extracted helper, keep green until Task 9); Test `tests/dev/deriveScenarioAttention.test.ts`.

**Interfaces:** Produces `deriveScenarioAttention(s: AttentionScenario): AttentionItem[]`.

**Meta-test note `[plan-R2 §1]`:** `tests/admin/_metaAttentionItemsTopology.test.ts:77` pins the `deriveAttentionItems` caller as `{ file: "app/admin/dev/attention-gallery/buildBlockProps.ts", count: 1 }` (the gallery is an ADMITTED 2nd caller, comment lines 68-74). Moving the call in this task changes that caller IMMEDIATELY, so line 77 is updated to `lib/dev/deriveScenarioAttention.ts` **within this task** — otherwise Tasks 3-7 sit on a red structural contract.

- [ ] **Step 1: Failing test** — a SURFACING single-alert scenario (`tier1AlertScenarios().find(s => s.alerts.length===1 && deriveScenarioAttention(s).length>0)`); assert `result.some(i => i.kind==="alert" && i.alert.code === s.alerts[0].code)` (input/output, order-independent — `[plan-R2 §4.2]`). Plus the FAITHFUL cut assertion `[R5-cut]`: `tier1AlertScenarios()` splits into a non-empty surfacing set AND a non-empty cut set (0 items) — NOT "every tier-1 has an item" (28/45 are `DOUG_EXCLUDED_CODES`, cut from the published surface; the render decision lives in Task 4's `isModalVisible`, not here).
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — move `toAlertInputs`/`toHoldRows` + the `deriveAttentionItems` call (`buildBlockProps.ts:45`) into the new module; `buildBlockProps` imports it (no behavior change). **Update `_metaAttentionItemsTopology.test.ts:77`** to `{ file: "lib/dev/deriveScenarioAttention.ts", count: 1 }`.
- [ ] **Step 4: Verify pass** + `tests/admin/_metaAttentionItemsTopology.test.ts` GREEN + existing `tests/app/admin/attentionGalleryRender.test.tsx` still green.
- [ ] **Step 5: Commit** (git add both + the meta-test) — `refactor(dev): extract deriveScenarioAttention + repath topology gate`

---

### Task 3: `buildScenarioModalData` — ONE atomic builder (data + bySection + attentionItems + anchors)

**Files:** Create `lib/dev/publishedModalFixture.ts` (`buildGalleryModalData` base defaults) + `lib/dev/buildScenarioModalData.ts` (the atomic per-scenario builder); Test `tests/dev/buildScenarioModalData.test.ts`.

**Interfaces:**
- `buildGallerySnapshot(warnings: ParseWarning[], opts?: { anchors?: { diagrams?: boolean; openingReel?: boolean } }): ShowReviewSnapshot` `[plan-R2 §5]` — the typed snapshot builder, lifted from `snapshot()` (`publishedReviewModal.test.tsx:79-119`, returns `ShowReviewSnapshot` from `@/lib/admin/readShowReviewSnapshot`). Base has `diagrams: null`, `event_details: null` (no anchors). `opts.anchors.diagrams === true` → sets `show.diagrams` to a signal-present value (so `hasDiagramSignal(resolveCurrentDiagrams(data.diagrams))` is true); `opts.anchors.openingReel === true` → sets `event_details.opening_reel` to a non-empty string.
- `buildGalleryModalData(over?: Partial<GalleryModalData>): GalleryModalData` — base defaults (no functions), lifted from `baseProps` data half (`publishedReviewModal.test.tsx:214`), using `GALLERY_SLUG`/`GALLERY_NOW`; its own base `data` uses `buildGallerySnapshot([])`.
- `buildScenarioModalData(s: AttentionScenario): GalleryModalData` — the ATOMIC builder `[§1.1]`: from ONE scenario it derives `data`, `bySection`, and `attentionItems` **correlated to the same scenario**. Steps: (a) `const warnings = s.warnings ?? []`; (b) compute anchors needed — `const wantAnchors = anchorsWantedFor(s)` = union over `s.alerts` of `ATTENTION_ROUTES[a.code]?.anchor` mapped to `{diagrams|openingReel}`, EXCEPT return `{}` for `s.id === T2_ANCHOR_ABSENT` (its intent is absent anchors); (c) `const snap = buildGallerySnapshot(warnings, { anchors: wantAnchors })`; (d) `const data = buildPublishedSectionData(snap, { slug: GALLERY_SLUG })`; (e) `const bySection = buildSectionWarningModel({ slug: GALLERY_SLUG, warnings: data.warnings, ignoredFingerprints: new Set(), renderedSectionIds: new Set(step3Sections(data).map(x=>x.id)) })`; (f) `const attentionItems = deriveScenarioAttention(s)`; (g) `return buildGalleryModalData({ data, bySection, attentionItems, alertsDegraded: s.degraded ?? false })`.

- [ ] **Step 1: Failing test** — (i) `structuredClone(buildScenarioModalData(s))` throws nothing for a warning scenario AND an anchored-alert scenario; (ii) for a warning scenario, `bySection` reflects the scenario's warnings (assert a section key derived INDEPENDENTLY from the scenario's warning `blockRef` is present in `bySection`) — proving correlation, not default; (iii) **exact-anchor equality with ISOLATED single-alert fixtures `[plan-R2 §6, plan-R3 §3]`:** for a synthetic scenario with ONE alert whose code routes `rooms→diagrams`, assert the WHOLE map equals `new Map([["rooms", new Set(["diagrams"])]])` (exact — proves no extra anchor and `event` absent); for ONE alert routing `event→opening_reel`, assert the map equals `new Map([["event", new Set(["opening_reel"])]])` (reciprocal `rooms` absence); (iv) for `T2_ANCHOR_ABSENT`, `anchorsForData(data).size === 0` (exact absence).
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** the modules (`buildGallerySnapshot`, `buildGalleryModalData`, `buildScenarioModalData`, `anchorsWantedFor`).
- [ ] **Step 4: Verify pass** + typecheck.
- [ ] **Step 5: Commit** (git add) — `feat(dev): atomic buildScenarioModalData + fixture base`

---

### Task 4: `partitionScenarios` + `isModalExpressible` + `resolveInitialScenario`

**Files:** Create `app/admin/dev/attention-gallery/buildSwitcherScenarios.ts`; Test `tests/app/admin/attentionModalGallery.serverProps.test.ts`.

**Interfaces:**
- `isModalExpressible(s: AttentionScenario): boolean` and `isModalVisible(s: AttentionScenario): boolean` — both exported, independently tested.
- `partitionScenarios(): { rendered: GallerySwitcherScenario[]; excluded: ExcludedScenario[] }` (`ExcludedScenario = { id; label; reason: "structural" | "cut" }`).
- `resolveInitialScenario(raw: string | string[] | undefined, rendered: GallerySwitcherScenario[]): string | null`.

**Two exclusion axes `[plan-R1 §3.7/§3.8, R5-cut]` — render only if EXPRESSIBLE and VISIBLE:**
- `isModalExpressible = (s) => s.bucket?.sectionAvailable === undefined && s.bucket?.crewKeyRendered === undefined;` (explicit `=== undefined`; a predicate override the modal derives from its own data is not reproducible → `reason:"structural"`). `anchorAvailable` does NOT exclude (data-shaping reproduces it).
- `isModalVisible = (s) => deriveScenarioAttention(s).length > 0 || (s.warnings?.length ?? 0) > 0 || s.degraded === true;` — a scenario with no item, no warning, and not degraded produces an EMPTY modal. 28/45 tier-1 alert codes are `DOUG_EXCLUDED_CODES` cut from the published surface (the real modal cuts them too), so they are excluded with `reason:"cut"` rather than shown blank (founding "no states that don't occur" principle).

- [ ] **Step 1: Failing test** — (a) **synthetic `isModalExpressible` truth table `[plan-R2 §8]`** — 4 minimal `AttentionScenario`s: `{sectionAvailable}`→false; `{crewKeyRendered}`→false; both→false; `undefined`/only-`anchorAvailable`→true (independent of catalog); (b) **`isModalVisible` directly** — a scenario with a surfacing alert → true; a synthetic scenario with only a `DOUG_EXCLUDED_CODES` code → false; a warnings-only scenario → true; a `degraded:true` scenario → true; (c) catalog: `partitionScenarios().excluded.filter(e=>e.reason==="structural").map(e=>e.id).sort()` equals `[T2_SECTION_ABSENT, T2_OVERVIEW_ABSENT, T2_CREW_ROW_ABSENT].sort()`; every `reason==="cut"` excluded id has 0 items + no warnings + not degraded (label never wrong); (d) no tier-3 id in `rendered`; every `rendered` scenario is visible (≥1 item OR warning OR degraded) — NO blank modal; (e) every `rendered` scenario's `data` `structuredClone`s clean; (f) `resolveInitialScenario` `[§3.3, §4.4, plan-R2 §9]`: valid scalar → id; unknown → null; excluded (either reason) id → null; tier-3 id → null; empty string → null; `undefined` → null; `[id,"x"]` → id (first wins); `["unknown", id]` → null; `[]` → null.
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** — `partitionScenarios`: over `ALL_SCENARIOS.filter(s=>s.tier!==3)`, `rendered` = those with `isModalExpressible(s) && isModalVisible(s)`, mapped to `{id, tier, label, codes, data: buildScenarioModalData(s)}`, `codes = [...new Set([...s.alerts.map(a=>a.code), ...(s.warnings?.map(w=>w.code) ?? [])])]`; `excluded` = the rest → `{id, label, reason: isModalExpressible(s) ? "cut" : "structural"}`. `resolveInitialScenario` normalizes then matches `rendered` ids only.
- [ ] **Step 4: Verify pass** + typecheck.
- [ ] **Step 5: Commit** (git add) — `feat(dev): partitionScenarios + isModalExpressible + resolveInitialScenario`

---

### Task 5: `SwitcherControls` (before the switcher — no forward dep)

**Files:** Create `components/admin/dev/SwitcherControls.tsx`; Test `tests/components/admin/dev/switcherControls.test.tsx`.

**Interfaces:** `SwitcherControls({ index, total, label, tier, codes, excluded, onPrev, onNext, closed, onReopen })`. Pure presentational; imports `GallerySwitcherScenario`/`ExcludedScenario` with `import type`.

- [ ] **Step 1: Failing test** — renders `n / total`, label, `tier` chip, `codes.join(", ")`; `excluded.length>0` → two grouped footnotes (`reason==="structural"` labels; `reason==="cut"` labels, list may collapse behind a count); step buttons carry `min-h-tap-min`; `role="group"`, count `aria-live="polite"`; when `closed` shows a Reopen button wired to `onReopen`; no em-dash in any rendered string (regex assert).
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** per §3.4 (fixed z-[60] top-center; canonical tokens). Root carries `data-testid="attention-switcher-controls"` (stable unique selector for the e2e one-bar assertion `[plan-R2 §17]`).
- [ ] **Step 4: Verify pass.**
- [ ] **Step 5: Commit** (git add) — `feat(dev): SwitcherControls control bar`

---

### Task 5b (acceptance definition, authored BEFORE the switcher): e2e spec skeleton

**Placement `[plan-R2 §2]`:** authored immediately after Task 5, BEFORE the switcher (Task 6) and route (Task 7) exist — the acceptance suite is the integration test-first artifact. It runs RED against the current card route until Tasks 6-7 land; Task 9 iterates it to GREEN. (Per-component TDD lives in Tasks 1-8.)

**Files:** Create `tests/e2e/attention-modal-gallery.spec.ts`; possibly Modify `playwright.config.ts` (declared here `[plan-R2 §12]` if the `dev-build` webServer needs a fresh-build/`reuseExistingServer:false` guard).

**Harness readiness (operationalized) `[§5]`:**
- **Build + server `[§5.1, §5.6, plan-R2 §12]`:** the gallery e2e MUST run against a FRESH `dev-build` artifact built with `ADMIN_DEV_PANEL_ENABLED=true`. Verify `playwright.config.ts`'s `dev-build` `webServer` runs `pnpm build` (not just `next start`) and set `reuseExistingServer: false` for that project so a stale port-3001 server cannot be reused; if the config lacks the build, add it (config edit committed with this task). Playwright waits on the port; the TEST then awaits authenticated gallery content BEFORE the dialog `[§5.6]`.
- **Auth `[§5.2]`:** mint a developer session via the test-only session minter `app/api/test-auth/set-session` in `test.beforeAll` (the `developer-tier.spec.ts:15,122` pattern — confirmed grounding). Assert the landed URL is `/admin/dev/attention-gallery` (not a sign-in redirect) before any modal assertion.
- **Per-navigation readiness + detach-safety `[§5.3, §5.4]`:** after EACH deep-link/scenario change, RE-QUERY and await exactly one visible `[role="dialog"]`; never retain a locator/handle/bounding-box across a keyed remount.
- **Key repeat `[§5.5]`:** rapid stepping = N discrete `keyboard.press("ArrowRight")` calls (not one `keyboard.down` OS-repeat); settle on observable count/dialog state, not a fixed timeout.
- **Scenario→control coverage ledger `[plan-R2 §14, plan-R3 §5]`:** maintain an explicit map of which scenario exposes which mutation control; at the end assert every named control (publish, archive, Accept, Accept All, Undo, Approve, Reject, resolve) was exercised at least once. The ledger accumulates and asserts **within a single `test()` body** (one worker) so retries/parallel workers cannot fragment the aggregate; a control hidden in all chosen scenarios fails the ledger, not silently skips.

**Acceptance assertions (RED until Tasks 6-7, GREEN in Task 9) `[§2.1]`:**
- [ ] iterate EVERY rendered scenario via `?scenario=<id>`; assert a **scenario-specific marker INSIDE the freshly-queried dialog** (its `code`/attention content scoped to `[role="dialog"]`, NOT `SwitcherControls` which also shows codes `[plan-R2 §13]`) — the authoritative Flight proof `[§1.4]`.
- [ ] `←`/`→` advance the `aria-live` count while the modal is open and focus is inside the dialog `[R1-1]`.
- [ ] controls (`[data-testid="attention-switcher-controls"]`) are OUTSIDE `[data-inert-root]`, remain non-inert, and are clickable while the modal is active; the admin root IS inert `[§1.5]`.
- [ ] rapid stepping (N discrete presses) → exactly ONE `[role="dialog"]` AND exactly ONE `[data-testid="attention-switcher-controls"]` `[plan-R2 §17, §6.5]`; body scroll locked.
- [ ] EVERY warning scenario: EACH warning item's exact copy present INSIDE the dialog + its section dot marked `[§1.9]`; representative also in initial viewport.
- [ ] degraded scenario shows the degraded banner.
- [ ] **Write containment across ALL mutation controls (via the ledger) `[§1.8, §6.4, plan-R2 §14-16, plan-R3 §5]`:** for each control, in `try/finally`: record ALL requests into an array via a named `page.on("request")` handler attached BEFORE the click; click; **await a control-specific completion observable, NOT a poll of an already-unchanged value** — for the fetch-blocked resolve control await `data-gallery-blocked-write` to appear; for form-action controls (publish/archive/accept/etc.) await the button's own transient pending→settled cycle (`useFormStatus`-driven `disabled` toggling back), which is the definitive post-submit boundary; as a backstop keep the listener attached across a subsequent `page.goBack()`/re-navigation so a delayed request is still captured before assertion. Then assert the recorded array contains NO non-GET request, and remove the EXACT handler in `finally`. **Guard-attribute sequencing `[plan-R2 §16]`:** run the fetch-blocked resolve control LAST (or fresh-navigate after it); assert `data-gallery-blocked-write` ABSENT before any action, SET only for the resolve control, ABSENT again after a fresh navigation. Pair "UI unchanged" with request-absence (a controlled prop is naturally unchanged `[§2.6]`).
- [ ] close: X → inert + scroll-lock released, Reopen restores dialog + locks + nav works after reopen; Escape while OPEN does nothing; **Escape while CLOSED is NOT intercepted `[plan-R2 §11]`** `[§1.6]`.
- [ ] excluded IDs `[plan-R2 §18, R5-cut]`: deep-link EACH `reason==="structural"` excluded id (`?scenario=<excluded>`) → resolves to the fallback (index 0, `resolveInitialScenario`→null), not rendered; the `"structural"` footnote lists all 3 labels; the `"cut"` footnote is present with its count (outside the inert root). (A `"cut"` deep-link also falls back — same `resolveInitialScenario`→null path.)

- [ ] **Steps:** author the spec now (RED). Commit (git add + any config edit) — `test(dev): e2e acceptance spec for attention modal switcher (red)`

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

- [ ] **Step 1: Failing test** (mock `next/navigation`, capture props passed to a mocked `PublishedReviewModal`): (a) empty `scenarios` → EmptyState, no `scenarios[index]` access; (b) prev/next functional wrap; (c) capture the mocked modal's props and INVOKE all 8 callbacks, awaiting each, asserting exact results (`setPublished(true)` → `{ok:true}`, `unarchiveAction("x")` → `undefined`, etc.) `[§4.5, §1.7]`; (d) `indexOfId(scenarios, initialId)` — valid id → its index, unknown/null → 0; (e) simulate `galleryClose()` then Reopen → arrow advances index (proves `closingRef` reset `[R3-1]`); (f) Escape while open → `preventDefault` called; Escape while `closed` → `preventDefault` NOT called (closed mode does not intercept `[plan-R2 §11]`).
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Implement** per §3.3: `indexOfId` helper; `useState(()=>indexOfId(scenarios, initialId))`; `closed` + `closingRef`; no-op `actions` object `satisfies Pick<...>`; `galleryClose`; render `{!closed && <ReviewModalCloseContext.Provider value={galleryClose}><ShareTokenProvider initialToken={null} initialEpoch={0}><PublishedReviewModal key={current.id} {...current.data} {...actions}/></...></...>}`; document `keydown {capture:true}` — `←`/`→` guarded on `closingRef.current||closed`; **Escape is swallowed (`preventDefault`+`stopPropagation`) ONLY when the modal is open (`!closed`) `[plan-R2 §11]`** — when `closed`, the modal is unmounted and there is no shell listener to race, so Escape is left alone (the listener does not intercept it in closed mode); `useHasMounted` → `createPortal(<SwitcherControls .../>, document.body)`; Reopen `closingRef.current=false; setClosed(false)`.
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

**Meta-test declaration `[§6.1, §6.2]`:** the topology gate (`tests/admin/_metaAttentionItemsTopology.test.ts:77`) was already repathed to `lib/dev/deriveScenarioAttention.ts` in **Task 2** (where the call moved) — this task only confirms it stays green after the `buildBlockProps.ts` deletion. `filesMembership.test.ts:152` pins the route PATH (`app/admin/dev/attention-gallery/page.tsx`, unchanged) → no edit; green run confirms. `build-artifact-gate.test.ts` references the `"attention-gallery"` string → unchanged. Expected final registry shape: topology callers = `{lib/dev/deriveScenarioAttention.ts}` for `deriveAttentionItems` (gallery still an admitted caller via the switcher path); no route-path registry changes.

- [ ] **Step 1: Failing structural test FIRST `[§2.2]`** — add `tests/admin/dev/noCardRenderer.test.ts` asserting `ScenarioBlock.tsx`/`GalleryCard.tsx`/`buildBlockProps.ts`/`params.ts` do NOT exist (fs check) and no source under `app/`/`components/` imports them (grep). Runs RED now (files still present).
- [ ] **Step 2: Verify fail.**
- [ ] **Step 3: Delete** the files; `pnpm typecheck` → fix any dangling import.
- [ ] **Step 4: Verify** — `noCardRenderer.test.ts` GREEN; `pnpm vitest run tests/admin/dev/filesMembership.test.ts tests/admin/build-artifact-gate.test.ts tests/admin/_metaAttentionItemsTopology.test.ts tests/components/admin/dev/galleryWriteGuard.test.tsx` all GREEN; full `pnpm typecheck` + `pnpm lint` green.
- [ ] **Step 5: Commit** (git add -A for deletions) — `refactor(dev): remove card renderer, reconcile registries`

---

### Task 9: Drive the e2e to green

- [ ] After Tasks 6-8, run `pnpm exec playwright test --project=dev-build tests/e2e/attention-modal-gallery.spec.ts`; iterate implementation/spec until GREEN (all assertions above pass against the built dev artifact).
- [ ] Commit any fixes (git add) — `fix(dev): make attention modal switcher e2e green`

---

### Task 10: impeccable dual-gate + handoff

**Files:** Create `docs/superpowers/plans/2026-07-21-attention-modal-switcher-gallery-handoff.md` (the named handoff `[§6.3]`).

- [ ] Pre-code mechanical sweep confirmed in Tasks 5-7 (em-dash/apostrophe/tap-target/tokens).
- [ ] **impeccable v3 setup sequence FIRST `[plan-R2 §19]`:** run `node .claude/skills/impeccable/scripts/context.mjs` (loads PRODUCT.md + DESIGN.md), then read the applicable register reference (`reference/product.md` — this is admin/tool UI, design SERVES the product). Then `/impeccable critique` on the diff (subagent-isolated).
- [ ] `/impeccable audit` on the diff (same setup gates).
- [ ] **Every behavioral repair (P0-P3) begins with a failing regression test `[plan-R2 §20]`** — the repo-wide TDD rule applies to all behavioral fixes, not only P0/P1; pure CSS/mechanical findings may use the applicable static gate.
- [ ] Record findings + dispositions in the milestone handoff **§12** (project-required section `[plan-R2 §19]`), in `docs/superpowers/plans/2026-07-21-attention-modal-switcher-gallery-handoff.md`; commit the handoff doc.
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
- **Spec coverage:** §3.1 fixture → Task 3; §3.2 partition/derive/anchors → Tasks 2-4; §3.3 switcher → Task 6; §3.4 controls → Task 5; §3.5 query → Task 4; §3.6 removals → Task 8; safety (§2.1 RSC, §2.2 portal/inert/close, §2.4 tier-2) → Tasks 3,4,6, 5b/9; acceptance tests → Task 5b (authored) + Task 9 (green); gates → Tasks 10-11.
- **Ordering (acyclic):** shared types (1) → derive+topology-repath (2) → atomic builder (3) → partition (4) → controls (5) → e2e acceptance authored (5b) → switcher (6) → route (7) → removal (8) → e2e green (9) → impeccable+handoff (10) → merge (11). No forward dependency: controls (5) before switcher (6); e2e authored (5b) before the impl it drives; durable constants (1) before `buildBlockProps` deletion (8); topology gate repathed in the SAME task the call moves (2); structural-removal test authored before deletion (8).
- **Anti-tautology:** Task 2 input/output single-alert; Task 3 correlation + exact-anchor asserted independently; Task 4 synthetic truth-table (not catalog-reuse) + negative array; Task 9 dialog-scoped scenario-specific markers + request-absence paired with UI-unchanged + control-coverage ledger.
