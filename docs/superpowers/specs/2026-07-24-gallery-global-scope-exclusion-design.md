# Gallery global-scope exclusion — design

**Date:** 2026-07-24
**Status:** ratified (autonomous-ship run, `fix/gallery-global-scope-exclusion`)
**Surface:** attention modal gallery (dev-only), `app/admin/dev/attention-gallery/**`

---

## 1. Problem

The attention gallery renders a show-modal card for four alert codes that no real show modal can ever contain.

`fetchPerShowAlerts` reads `admin_alerts` filtered by `.eq("show_id", showId)` (`lib/adminAlerts/fetchPerShowAlerts.ts:83`). Four doug-audience codes are written by their producers with `show_id: null`, so that predicate can never return them:

| code | producer site | resolution |
| --- | --- | --- |
| `LIVE_ROW_CONFLICT` | `lib/sync/runOnboardingScan.ts:1029` (`showId: null`) | manual |
| `ONBOARDING_SHEET_UNREADABLE` | `app/api/admin/onboarding/scan/route.ts:308` | manual |
| `SYNC_STALLED` | `lib/notify/detect/stall.ts:15` | auto |
| `WATCH_CHANNEL_ORPHANED` | registered `scope: "global"` in `tests/adminAlerts/alertProducerScope.registry.ts` | auto |

The gallery reaches them because `tier1AlertScenarios()` derives one scenario per `ATTENTION_ROUTES` key (`lib/dev/attentionScenarios/tier1.ts:75`), and `ATTENTION_ROUTES` is deliberately set-equal to the FULL production alert registry — both per-show and global codes (`lib/admin/attentionItems.ts:109`, pinned by `tests/admin/_metaAttentionRoutes.test.ts:14`).

Every other unreachable routed code is already handled. `deriveAttentionItems` filters `DOUG_EXCLUDED_CODES` (info-severity ∪ health) at `lib/admin/attentionItems.ts:367-369`, so those scenarios derive zero items, fail `isModalVisible` (`app/admin/dev/attention-gallery/buildSwitcherScenarios.ts:45`), and land in the `"cut"` bucket (`buildSwitcherScenarios.ts:126`). Their exact ids are pinned as `EXPECTED_CUT_IDS` (28 entries, `tests/app/admin/attentionModalGallery.serverProps.test.ts:42-71`).

The four above are doug-audience and non-info-severity, so they pass every existing filter and render.

**Cost.** A reviewer critiquing those four cards is evaluating a placement that cannot occur; any copy or layout conclusion drawn from them is unfalsifiable against production. The gallery's value is that it is a faithful catalog of real modal states.

**Not a production bug.** No production render path is wrong. `deriveAttentionItems` has exactly one caller, the show modal (`lib/admin/attentionItems.ts:169-172`, pinned by `tests/admin/_metaAttentionItemsTopology.test.ts`), and its `DOUG_EXCLUDED_CODES` filter is annotated MODAL ONLY (`lib/admin/attentionItems.ts:364-369`); the bell builds its entries from its own feed endpoint. The four alerts surface correctly on the global/bell surfaces. This change touches the dev gallery only.

---

## 1.1 Resolved scope — do not relitigate

Each item below is settled. Cited so a reviewer can verify the contract instead of re-deriving it.

1. **`ATTENTION_ROUTES` keeps all 45 rows, including the four global codes.** Set-equality with `ADMIN_ALERTS_CODES` is a deliberate fail-by-default invariant (`tests/admin/_metaAttentionRoutes.test.ts:1-16`): a new registry code without a route fails CI. Deleting rows to fix the gallery would trade a real invariant for a dev-surface cosmetic. Rejected.
2. **`tier1AlertScenarios()` keeps deriving one scenario per route key.** Structural totality is the module's stated contract (`lib/dev/attentionScenarios/tier1.ts:3-7`): a new code appears in the gallery the moment its routing row lands, with no completeness meta-test needed. Filtering inside tier1 would silently break that and give the four no on-screen explanation. Rejected.
3. **No filter is added to `deriveAttentionItems` or `fetchPerShowAlerts`.** `fetchPerShowAlerts` already cannot return a `show_id: null` row; a scope filter there would be unreachable code. Production behavior is unchanged by this spec.
4. **The exclusion is evaluated AFTER `cut`, not before.** Five of the nine global-only codes are health-audience and are already in `EXPECTED_CUT_IDS`. Ordering `cut` first keeps their existing label and leaves that 28-entry pin untouched, so the diff moves exactly four scenarios. See §4.2.
5. **`GLOBAL_SCOPE_CODES` encodes all nine global-only codes, not just the four that leak.** It is a projection of the producer registry, not a hand-picked list of today's symptoms. A future doug-audience global code then falls into the right bucket with no further edit. See §3.2.
6. **This is a dev-surface change with no DB, migration, RPC, or advisory-lock component.** Plan-wide invariants 2, 3, 4, 9, and 10 have no applicable surface here. Invariant 1 (TDD) and invariant 8 (impeccable dual-gate, because `components/admin/dev/SwitcherControls.tsx` is under `components/`) do apply.

---

## 2. Definitions

**Global-only code.** A code with at least one non-`seed` producer row of `scope: "global"` and no non-`seed` row of `scope: "per-show"`, projected from `PRODUCER_SCOPE` (`tests/adminAlerts/alertProducerScope.registry.ts`). The `seed` exclusion matches the existing `perShowReachableCodes()` projection (`alertProducerScope.registry.ts:270-276`), whose rows are validation-DB fixture harnesses, not production producers.

The nine global-only codes as of this spec:

```
CALLBACK_CLAIM_THREW
GITHUB_BOT_LOGIN_MISSING
LIVE_ROW_CONFLICT
ONBOARDING_SHEET_UNREADABLE
PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED
PICKER_BOOTSTRAP_RPC_FAILED
SYNC_STALLED
WATCH_CHANNEL_ORPHANED
WEBHOOK_TOKEN_INVALID
```

No code carries both scopes today, so the projection has no ambiguous members. If one ever does, it is per-show-reachable and therefore NOT global-only, which is the correct fail-safe direction: a code that can reach the modal keeps its card.

**Per-show-reachable** retains its existing meaning: `perShowReachableCodes()`, per-show ∧ not-health, frozen as the 16-entry `FROZEN_REACHABLE` (`alertProducerScope.registry.ts:281`). This spec does not change it.

---

## 3. Architecture

### 3.1 Registry projection

`tests/adminAlerts/alertProducerScope.registry.ts` gains an exported `globalOnlyCodes(): Set<string>` beside `perShowReachableCodes()`. One definition of the projection; the meta-test consumes it.

```ts
/** A code is global-only iff some non-seed producer row emits it with
 *  scope "global" AND no non-seed row emits it per-show. Health audience is
 *  deliberately NOT subtracted here (unlike perShowReachableCodes): scope and
 *  audience are orthogonal, and the gallery's cut axis handles audience. */
export function globalOnlyCodes(): Set<string> {
  const perShow = new Set<string>();
  const global = new Set<string>();
  for (const r of PRODUCER_SCOPE) {
    if (r.seed) continue;
    (r.scope === "global" ? global : perShow).add(r.code);
  }
  return new Set([...global].filter((c) => !perShow.has(c)));
}
```

### 3.2 Lib-side declaration

`lib/` must not import `tests/`, so the runtime set is declared in `lib/adminAlerts/alertScope.ts (new)`:

```ts
export const GLOBAL_SCOPE_CODES: ReadonlySet<string> = new Set([ /* the nine, sorted */ ]);
```

`tests/adminAlerts/_metaGlobalScopeCodes.test.ts (new)` asserts `GLOBAL_SCOPE_CODES` is set-equal to `globalOnlyCodes()`. This is the same lib-declares / test-pins idiom `ATTENTION_ROUTES` uses (`_metaAttentionRoutes.test.ts:1-16`), so a producer-scope reclassification fails CI rather than drifting.

**Failure direction.** If the sets diverge, the meta-test fails loudly. There is no runtime fallback and none is wanted: a stale set would either hide a reachable card (a coverage hole) or show an impossible one (today's bug), and both should fail the build.

### 3.3 Module boundary

`lib/adminAlerts/alertScope.ts (new)` exports one constant and nothing else. It has no imports, so it is safe from both server and client modules and adds no cycle to `lib/adminAlerts`. It is deliberately NOT placed in `lib/dev/` — the fact is about production producers, not about the gallery, and a future non-gallery consumer should not have to import from a dev module.

---

## 4. Gallery behavior

### 4.1 Predicate

`buildSwitcherScenarios.ts` gains a third exclusion predicate beside `isModalExpressible` (`app/admin/dev/attention-gallery/buildSwitcherScenarios.ts:34`) and `isModalVisible` (`app/admin/dev/attention-gallery/buildSwitcherScenarios.ts:45`):

```ts
/**
 * A scenario is show-scope reachable iff NONE of its alerts is global-scope.
 *
 * ANY global-scope alert makes the rendered card fiction, because
 * `deriveScenarioAttention` derives an item for it and the modal renders that
 * item. A carrier, a hold, or a per-show sibling alert changes what ELSE the
 * card shows; it does not make the global alert reachable. `fetchPerShowAlerts`
 * still filters `.eq("show_id", showId)` regardless of what else is on the show
 * (lib/adminAlerts/fetchPerShowAlerts.ts:83).
 */
export function isShowScopeReachable(s: AttentionScenario): boolean {
  return !s.alerts.some((a) => GLOBAL_SCOPE_CODES.has(a.code));
}
```

**Guard conditions.**

| input | result | why |
| --- | --- | --- |
| `alerts: []` | reachable (kept) | nothing alert-shaped to judge; baseline, warning, hold, and fixture scenarios are untouched |
| every alert code global-scope | NOT reachable (excluded) | the four tier-1 scenarios; the card would be pure fiction |
| some alert code global-scope, some not | NOT reachable (excluded) | the global item still renders. §4.5 is the worked instance: `T3_FULL_SPLIT` mixed one global code with three reachable ones and a hold, and its rendered Monitoring count was a state production cannot produce |
| every alert code per-show or unknown | reachable (kept) | nothing renders that production could not |
| unknown / uncataloged code | reachable (kept) | absent from `GLOBAL_SCOPE_CODES`, so `some` is false; fail toward VISIBLE, matching the exclusion-not-allowlist posture at `DOUG_EXCLUDED_CODES` (`lib/adminAlerts/audience.ts:34`) |

**Why `some`, not `every`** (round-1 review, BLOCKING). An earlier draft kept a mixed scenario on the theory that "the carrier is the real state under review; the alert is incidental." That is wrong: the modal has no way to render a scenario partially. Every declared alert that survives `deriveAttentionItems` becomes a visible item, so one global code contaminates the whole card. The earlier draft also contradicted §4.5, which removes a global code from a mixed scenario for exactly this reason — two sections applying opposite standards to the same situation.

**The partition applies the predicate to TIER 1 ONLY.** A tier-1 scenario IS its code: the one-card-per-route-key fan-out exists to show that code's card, so a card for an unreachable code is fiction with nothing else in it. A tier-2 or tier-3 composite uses codes as INGREDIENTS to demonstrate a structural state (the actionable class, occurrence counts, identity absence); its subject is the state, not the code. Excluding a composite would delete real coverage to fix an ingredient, so the partition does not. See §4.5 for what the composites actually do today and the decision that remains open.

### 4.2 The carrier list stays where it is

`isModalVisible` inlines its carrier list (`buildSwitcherScenarios.ts:45-56`). With §4.1's predicate reduced to a single `some` call there is no second consumer, so **the extraction is dropped**: it would be a one-caller indirection whose only justification (keeping two predicates in step) no longer exists. `isModalVisible` is left exactly as it is today.

The list is reproduced here only so a reviewer can confirm §4.1 needs nothing from it:

```ts
// (reproduced from isModalVisible for reference; NOT extracted, NOT edited)
function carrierTerms(s: AttentionScenario): boolean {
  return (
    (s.warnings?.length ?? 0) > 0 ||
    s.degraded === true ||
    s.feedNull === true ||
    (s.changeLog?.length ?? 0) > 0 ||
    s.fixture !== undefined ||
    s.actionOutcomes !== undefined
  );
}
```

`isModalVisible` is UNCHANGED by this spec. §6 test 4 still pins the rendered set against a pre-change baseline, so an accidental edit to it fails loudly.

### 4.3 Partition order

`partitionScenarios` (`buildSwitcherScenarios.ts:114-142`) evaluates, in order:

1. `!isModalExpressible` → `reason: "structural"`
2. `!isModalVisible` → `reason: "cut"`
3. `!isShowScopeReachable` → `reason: "global"` *(new)*

Global is evaluated last on purpose. The five health-audience global-only codes fail `isModalVisible` first and keep their existing `"cut"` label, so `EXPECTED_CUT_IDS` (28 entries) is unchanged and the diff moves exactly four scenarios:

```
alert-live-row-conflict
alert-onboarding-sheet-unreadable
alert-sync-stalled
alert-watch-channel-orphaned
```

### 4.4 Type

`lib/dev/galleryModalTypes.ts:55` widens:

```ts
export type ExcludedScenario = { id: string; label: string; reason: "structural" | "cut" | "global" };
```

### 4.5 The composite instance (class sweep)

The tier-1 cards are not the only place a global code reaches a show modal. A class sweep over every scenario tier found exactly one more:

```
$ node -e '<grep each of the nine global-only codes across lib/dev/attentionScenarios/tier{1,2,3}.ts>'
tier3.ts:114  SYNC_STALLED   | { code: "SYNC_STALLED", context: {}, raised_at: AT, occurrence_count: 3 },
```

`T3_FULL_SPLIT` combines `SHEET_UNAVAILABLE`, `RESYNC_QUALITY_REGRESSED`, `SYNC_STALLED`, and `DRIVE_FETCH_FAILED` with one hold (`lib/dev/attentionScenarios/tier3.ts:97-133`). Per §4.1 the partition leaves composites alone, so it keeps its card. But the state it exercises is the wrong one.

`SELF_HEALING_CODE_LIST` has exactly three members (`lib/adminAlerts/audience.ts:75-79`):

```
DRIVE_FETCH_FAILED      per-show-reachable
SYNC_STALLED            global-only
WATCH_CHANNEL_ORPHANED  global-only
```

Two of the three are global-only, so a real show modal's Monitoring group can hold **at most one distinct code**: `DRIVE_FETCH_FAILED`. `T3_FULL_SPLIT`'s comment claims "two genuinely self-healing codes -> the Monitoring summary reads 2" (`lib/dev/attentionScenarios/tier3.ts:113`), and the rendered pill's `visibleText` is pinned to a plural monitoring segment (`tests/dev/fullSplitCompositeRender.test.tsx:56`). Production cannot produce a plural Monitoring group.

**Resolution.** The `SYNC_STALLED` row is removed from `T3_FULL_SPLIT`. There is no per-show-reachable substitute — the plural state is unreachable by construction, not merely unfixtured — so the composite pill becomes `1 to confirm · 2 to review · 1 monitoring`. Fidelity beats coverage of an impossible state; a composite that teaches an operator a count production cannot produce is the same defect as a tier-1 card for an unreachable code, one layer up.

**The literal sweep was incomplete; the real number is nine.** An early draft of this section claimed the sweep "found exactly one more". That was a literal-text sweep, and tier 2 picks its codes DYNAMICALLY from `ATTENTION_ROUTES` (`lib/dev/attentionScenarios/tier2.ts:145-210`), filtering by audience (`isCutFromSurface`) and context (`CONTEXT_REQUIRED`) but never by scope. Running the predicate over the live catalogue finds nine composites carrying a global-scope code:

```
t2-act-resolve-error   t2-actionable       t2-class-mix
t2-identity-absent     t2-many             t2-monitoring-only
t2-occurrence-many     t2-single           t3-full-attention-split
```

They are pinned as a checked-in list in `tests/app/admin/attentionModalGallery.serverProps.test.ts` so the set is visible and a NEW composite picking a global code fails rather than passing unnoticed.

**Teaching the pickers to skip global codes was attempted and reverted.** Adding `!GLOBAL_SCOPE_CODES.has(c)` to every tier-2 picker breaks `pickCode("actionable")` and `pickByDerivedClass("actionable")` outright. Measured against the live catalogue, among context-free non-cut codes:

```
ASSET_RECOVERY_BYTES_EXCEEDED   auto=1  global=0     LIVE_ROW_CONFLICT             auto=0  global=1
DRIVE_FETCH_FAILED              auto=1  global=0     ONBOARDING_SHEET_UNREADABLE   auto=0  global=1
EMBEDDED_ASSET_DRIFTED          auto=1  global=0     SYNC_STALLED                  auto=1  global=1
... every other reachable code   auto=1  global=0     WATCH_CHANNEL_ORPHANED        auto=1  global=1
```

**Every context-free, per-show-reachable code is auto-resolving.** The only context-free actionable codes are the two global ones. So the gallery's "actionable" axis has no reachable context-free code to pick at all: on a real show modal, an actionable alert is reached only through the crew-domain code, which carries context. Making the composites scope-faithful therefore means changing what that axis demonstrates — a product decision about gallery coverage, not a mechanical fix, and out of scope for this change. **OPEN DECISION**, recorded in §8.

After the removal the composite still derives: 1 actionable (the hold), 2 needs-look (`SHEET_UNAVAILABLE`, `RESYNC_QUALITY_REGRESSED`), 1 self-heal (`DRIVE_FETCH_FAILED`) — so every group in the split remains non-empty and the scenario keeps its purpose.

---

## 5. UI

`components/admin/dev/SwitcherControls.tsx` renders one paragraph per non-empty reason inside the excluded panel (`components/admin/dev/SwitcherControls.tsx:134-144`). A third is added, after the cut line:

```tsx
{global.length > 0 && (
  <p className="text-xs text-text-subtle">
    {global.length} dashboard-level {global.length === 1 ? "alert" : "alerts"}. Never attached to
    a show, so this modal cannot show {global.length === 1 ? "it" : "them"}.
  </p>
)}
```

The count can legitimately be 1 (a single global-scope code, or a future registry where only one leaks), and `1 dashboard-level alerts` is wrong, so the line pluralizes rather than assuming the plural. The sibling cut line needs no equivalent because its phrasing is already number-neutral (`{cut.length} cut from the published attention surface`, `components/admin/dev/SwitcherControls.tsx:139-143`).

with `const global = excluded.filter((e) => e.reason === "global");` beside the existing two (`components/admin/dev/SwitcherControls.tsx:67-68`).

**Mode boundaries.** The panel has one mode. Each of the three paragraphs renders independently, gated only on its own filtered list being non-empty. The structural line names its ids; the cut and global lines report a count only, matching the existing cut line's treatment (`components/admin/dev/SwitcherControls.tsx:139-143`). No paragraph is shared between reasons.

**Copy.** No em-dash, no apostrophe, sentence case, matching the sibling lines. The wording states the production fact (never attached to a show), not the implementation (`show_id: null`), because the panel is read while judging modal states, not while reading the producer registry.

**Toggle count.** The `{excluded.length} excluded` button (`components/admin/dev/SwitcherControls.tsx:124`) is already `excluded.length`, so it absorbs the four with no change. The rendered scenario count drops by four correspondingly.

**Cap / truncation.** N/A. The global line reports a count, not a list, so it cannot grow unbounded. The structural line remains the only id-listing paragraph, and its set is pinned at three (`EXPECTED_STRUCTURAL`, `tests/app/admin/attentionModalGallery.serverProps.test.ts:38`).

### 5.1 Dimensional Invariants

None. This change adds no fixed-dimension parent and no flex or grid child relationship, so the Tailwind v4 `align-items: stretch` hazard has no surface here.

| parent → child | relationship | guarantee |
| --- | --- | --- |
| excluded panel → new `<p>` | none (block flow) | the panel is `max-h-[40vh] overflow-y-auto` with block-level children (`components/admin/dev/SwitcherControls.tsx:128-133`). The new paragraph is a sibling of the existing two, sized by its own content, and scrolls with them. No height or width is inherited, asserted, or required. |

The panel's own `max-h-[40vh]` is unchanged, and the new line adds at most two rendered text lines, so the existing overflow behavior absorbs it.

### 5.2 Transition Inventory

The new paragraph has ONE visual state (present when `global.length > 0`, absent otherwise), and its presence is fixed for the lifetime of a page load: `partitionScenarios()` runs server-side once (`app/admin/dev/attention-gallery/page.tsx:47`), so no client interaction can change the list. It therefore contributes no state pair.

| from → to | treatment |
| --- | --- |
| panel closed → panel open (paragraph mounts with the panel) | instant. No animation needed: the existing panel mounts on a `panelOpen` boolean with no transition today (`components/admin/dev/SwitcherControls.tsx:128`), and the new line inherits that unchanged. |
| panel open → panel closed (paragraph unmounts with the panel) | instant. Same mechanism, inverse direction. No exit animation exists to coordinate with. |
| global list empty → non-empty (within one page load) | unreachable. The list is server-derived and constant per load; there is no client mutation path. |

Compound transitions: none. The three paragraphs mount and unmount together as children of the same conditional block, so no paragraph can be mid-transition while another changes.

---

## 6. Test plan

TDD per invariant 1: failing test, minimal implementation, passing test, commit, one task per row.

| # | test | catches |
| --- | --- | --- |
| 1 | `tests/adminAlerts/_metaGlobalScopeCodes.test.ts (new)`: `GLOBAL_SCOPE_CODES` set-equal to `globalOnlyCodes()` | a producer-scope reclassification, or a new global code, drifting from the lib-side set |
| 2 | `globalOnlyCodes()` unit: a code with both scopes is NOT global-only; a `seed: true` global row does not make its code global-only | the two projection edge cases; derived from synthetic rows, not from `PRODUCER_SCOPE`, so it cannot pass by coincidence of today's data |
| 3 | `isShowScopeReachable` truth table: every §4.1 guard row, using synthetic scenarios | the `every`-instead-of-`some` inversion (which would keep every mixed scenario), and a predicate that returns a constant |
| 4 | `partitionScenarios`: `excluded.filter(reason === "global")` ids are EXACTLY the four, pinned as a checked-in list | drift in either direction, matching the `EXPECTED_CUT_IDS` pin idiom |
| 5 | catalogue pin: the tier-2/3 scenarios carrying a global-scope code are EXACTLY the checked-in nine | §4.5's measured reality. Walks every scenario rather than naming `T3_FULL_SPLIT`, so a NEW composite picking a global code fails here instead of passing unnoticed |
| 5a | no rendered tier-1 scenario carries a global-scope code | the tier-1 scoping in §4.1; a partition arm that checked the wrong tier fails here |
| 5b | `partitionScenarios`: `EXPECTED_CUT_IDS` still matches exactly, and no id appears under two reasons | the ordering contract in §4.3; a reordering that relabels the five health globals fails here |
| 5c | `partitionScenarios`: the rendered id set equals the pre-change baseline minus exactly the four | any unrelated scenario moving; also pins that `isModalVisible` was not disturbed |
| 6 | e2e: the excluded panel renders the global line's count, mirroring the existing `CUT` assertion | the paragraph never reaching the real DOM (the component test renders it in isolation; only the e2e proves the server-derived list reaches the page) |
| 7 | `switcherControls.test.tsx`: global-only panel shows only the global line; mixed shows all three; the count text reflects the global list length | a paragraph gated on the wrong list, or on `excluded.length` instead of its own |
| 8 | `fullSplitComposite.test.ts` / `fullSplitCompositeRender.test.tsx`: `T3_FULL_SPLIT` derives 1 actionable / 2 needs-look / 1 self-heal, and the pill reads `1 to confirm · 2 to review · 1 monitoring` | the §4.5 removal; a revert that re-adds a global code to the composite fails the derived-count assertion, not just the rendered string |

**Anti-tautology notes.** Test 4 derives its expectation from a checked-in id list, never from `GLOBAL_SCOPE_CODES` (deriving it from the same constant the implementation reads would pass no matter what the predicate does). Test 5c captures the baseline rendered set from the committed pre-change output, not by re-running the new code. Test 5 walks `ALL_SCENARIOS` rather than naming `T3_FULL_SPLIT`, so it fails by default for a scenario that does not exist yet. Test 3 asserts against synthetic scenarios with explicitly constructed carriers, so a predicate that returns a constant fails at least one row.

---

## 7. Fan-out

| file | action |
| --- | --- |
| `lib/adminAlerts/alertScope.ts (new)` | NEW — `GLOBAL_SCOPE_CODES` (nine codes) |
| `tests/adminAlerts/alertProducerScope.registry.ts` | add exported `globalOnlyCodes()` |
| `tests/adminAlerts/_metaGlobalScopeCodes.test.ts (new)` | NEW — set-equality pin + projection unit tests |
| `lib/dev/galleryModalTypes.ts:55` | widen `ExcludedScenario["reason"]` with `"global"` |
| `app/admin/dev/attention-gallery/buildSwitcherScenarios.ts` | add `isShowScopeReachable`; third partition arm (`isModalVisible` unchanged) |
| `components/admin/dev/SwitcherControls.tsx` | third paragraph + its filter |
| `lib/admin/attentionItems.ts` | inline comment on the four route rows (registry-totality row; not per-show reachable) |
| `tests/app/admin/attentionModalGallery.serverProps.test.ts` | add `EXPECTED_GLOBAL_IDS` pin; keep `EXPECTED_CUT_IDS` unchanged; add the no-double-reason and rendered-set-delta tests |
| `tests/components/admin/dev/switcherControls.test.tsx` | global-line cases |
| `tests/admin/attentionExclusionSet.test.ts:110-122` | swap the `LIVE_ROW_CONFLICT` control for a `FROZEN_REACHABLE` code |
| `lib/dev/attentionScenarios/tier3.ts:113-114` | remove the `SYNC_STALLED` row from `T3_FULL_SPLIT` and its stale comment (§4.5) |
| `tests/dev/fullSplitComposite.test.ts:28` | drop `SYNC_STALLED` from the code list; self-heal count 2 → 1 |
| `tests/dev/fullSplitCompositeRender.test.tsx:53-56` | pill text and monitoring-row count 2 → 1 |
| `tests/e2e/attention-modal-gallery.spec.ts:148-151` | derive `GLOBAL` beside `STRUCTURAL`/`CUT`; assert the global line's count renders, mirroring the existing `CUT` assertion at `tests/e2e/attention-modal-gallery.spec.ts:392` |

`tests/app/admin/attentionGalleryPage.test.tsx:26` builds its `EXCLUDED` fixture with `reason: "cut" as const`; widening the union does not break it and it needs no edit. `tests/admin/dev/filesMembership.test.ts` walks `app/admin/dev/` for ROUTE_FILES (`page.tsx`, `actions.ts`, `route.ts`, `layout.tsx`); `buildSwitcherScenarios.ts` is a helper module, not a route file, and no new route file is added, so no registration is needed.

### 7.1 The exclusion-set test control

`tests/admin/attentionExclusionSet.test.ts:110-122` asserts `deriveAttentionItems` keeps `LIVE_ROW_CONFLICT` under the heading "keeps the two that describe a real state." The assertion is correct about what it tests (that a non-info, non-health code survives the `DOUG_EXCLUDED_CODES` filter), but the code choice reads as a claim that `LIVE_ROW_CONFLICT` is a per-show state. It is replaced with `SHEET_UNAVAILABLE`, which is in `FROZEN_REACHABLE`, preserving the assertion's meaning while removing the false implication. `SHOW_UNPUBLISHED` (the other keeper) is already reachable and stays.

---

## 8. Out of scope

- Any change to production alert routing, producer scopes, or `fetchPerShowAlerts`.
- The `PRODUCER_SCOPE` §3.0 residual risk (raw `INSERT INTO admin_alerts` sites are not discovered). Those sites all emit health-audience codes, which the gallery cuts on the audience axis regardless, so the residual does not affect this change.
- The 13 routed codes with no producer row at all. They are health-audience and already cut; classifying them by scope would require closing the residual above.
- **The near-vestigial Monitoring group.** §4.5 establishes that only `DRIVE_FETCH_FAILED` of the three `SELF_HEALING_CODE_LIST` members is per-show-reachable, so a real show modal's Monitoring group holds at most one distinct code. Whether that group earns its dedicated pill segment, heading, and row list is a product question, not a correctness one. Recorded here so a future reviewer does not re-derive it; not addressed by this spec.
- **OPEN DECISION — scope-faithfulness of the nine composites (§4.5).** The tier-2 pickers select by audience and context, not scope, so nine composites demonstrate their structural state using a code no show modal can carry. Fixing it requires deciding what the gallery's "actionable" axis should demonstrate, because no context-free per-show-reachable actionable code exists. Deliberately not decided here.
- Bell, dashboard, and health surfaces. Global alerts render correctly there and this spec does not touch them.
