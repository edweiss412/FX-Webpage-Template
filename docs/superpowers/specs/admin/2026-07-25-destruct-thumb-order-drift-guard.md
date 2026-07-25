# Destructive-confirm family close-out: stacked thumb order + arm-timing drift guard

**Date:** 2026-07-25
**Branch:** `fix/destruct-thumb-order-drift-guard`
**Class:** UI (mobile ergonomics) + structural guard + backlog hygiene
**Supersedes nothing.** Extends `docs/superpowers/specs/admin/2026-07-16-destructive-confirm-pass.md` (the recipe) and `docs/superpowers/specs/admin/2026-07-17-destruct1-armed-reflow.md` (DESTRUCT-1).

---

## 1. Problem

The repo-root `BACKLOG.md` opens a three-row "Destructive-confirm family" section. Two of the three rows are stale — they were resolved on 2026-07-17 by branch `fix/destruct-harmonize` and the resolution notes at `DEFERRED-archive.md:1228` and `DEFERRED-archive.md:1234` each say in so many words "Backlog `BL-…` closed", but the BACKLOG rows were never edited. The third row is genuinely open. A fourth problem — unguarded re-drift of the harmonized timing — is not in the backlog at all and was found while verifying the first two.

### 1.1 Resolved scope — do not relitigate

Each item below is a decision already taken, with its ratification cited. A reviewer should verify the citation, not re-derive the decision.

| # | Resolved decision | Ratification |
|---|---|---|
| R1 | `BL-DESTRUCT-CONFIRM-COPY-HARMONIZE` and `BL-DESTRUCT-BULK-UNDO-SUCCESS-STATUS` are **already implemented**. This spec deletes their BACKLOG rows; it does **not** re-implement them. | `DEFERRED-archive.md:1224-1234`; live proof `components/admin/RecentAutoAppliedStrip.tsx:551` (`data-testid` on the persistent `role="status"` region, `auto-applied-bulk-undo-status-${group.showId}`) and eleven `ARM_REVERT_MS = 4_000` declarations with zero surviving `AUTO_REVERT_MS`. |
| R2 | The fix for `BL-DESTRUCT-STACK-THUMB-ORDER` is **Option B — a breakpoint-forked render (two DOM subtrees)**. The owner chose it on 2026-07-25 from a rendered side-by-side comparison of all three candidates, with the duplication cost stated on the card he picked. Options A (recolour + gap) and C (global DOM swap) were shown and declined. | Owner decision, 2026-07-25, this session. The trap that rules out a CSS-only fix is stated in the `BL-DESTRUCT-STACK-THUMB-ORDER` row of `BACKLOG.md`. |
| R3 | Duplicating a destructive control is a **known, accepted cost** of R2, not an oversight. Containment is three-part and specified in §4.4: one shared render helper (no copy-paste drift), per-copy test ids (no ambiguous query), and a real-browser proof that exactly one copy is displayed per breakpoint. | This spec §4.4. |
| R4 | The bare test ids `admin-pending-defer-${id}` / `admin-pending-ignore-${id}` are **retired**, not reassigned to one copy. A bare id that silently resolves to one of two live copies is precisely the ambiguity that makes a duplicated destructive control dangerous. | This spec §4.3. |
| R5 | Wiring `tests/e2e/pendingDiscardReflow.layout.spec.ts` into CI is **in scope**, because it is this change's verification vehicle. It currently runs in no workflow (`tests/e2e/standalone.config.ts:36` lists it; no workflow invokes that config — the `BL-STANDALONE-CONFIG-CI-DARK` row in `BACKLOG.md`). A guard that runs in no CI is not a guard. This spec does **not** attempt the rest of `BL-STANDALONE-CONFIG-CI-DARK`'s ~15 other dark specs. | `AGENTS.md` cross-cutting rule "Local-passes-CI-fails is its own bug class"; that row's "Partially closed" note. |
| R6 | The drift guard pins the **arm-revert duration only**. It does not pin `SUCCESS_DISMISS_MS` (`app/admin/show/[slug]/PickerResetControl.tsx:121`, `app/admin/show/[slug]/ResetPickerEpochButton.tsx:118`) — a success-toast dismissal is a different affordance with no ratified shared value. Widening the guard to all admin timers is out of scope. | This spec §5.3. |
| R7 | `tests/styles/_metaDestructiveConfirm.test.ts` is **not replaced**. Its declared scope (`tests/styles/_metaDestructiveConfirm.test.ts:10-12`) is recipe-token growth. The new guard is a sibling assertion that reuses its registry as the discovery mechanism. | This spec §5.2. |
| R8 | The four-second value itself is not revisited. `ARM_REVERT_MS = 4_000` was ratified on 2026-07-17 ("more react time for a venue-floor operator, one idiom"). | `DEFERRED-archive.md:1228`. |

---

## 2. Current state (all claims cited)

### 2.1 The component

`components/admin/PendingPanelDiscardButtons.tsx` renders one outer column and one flex row:

- outer: `<div className="flex flex-col gap-2">` — `components/admin/PendingPanelDiscardButtons.tsx:107`
- row: `<div className="flex flex-wrap gap-2">` — `components/admin/PendingPanelDiscardButtons.tsx:108`
- Defer button, testid `admin-pending-defer-${pendingIngestionId}` — `components/admin/PendingPanelDiscardButtons.tsx:109-119`
- Ignore button, testid `admin-pending-ignore-${pendingIngestionId}` — `components/admin/PendingPanelDiscardButtons.tsx:120-136`
- persistent `role="status"` `sr-only` span, **inside the row** — `components/admin/PendingPanelDiscardButtons.tsx:140-142`
- error block, `role="alert"`, testid `admin-pending-discard-error-${pendingIngestionId}` — `components/admin/PendingPanelDiscardButtons.tsx:144-153`

Both buttons carry `basis-full sm:basis-auto` (`components/admin/PendingPanelDiscardButtons.tsx:114`, `components/admin/PendingPanelDiscardButtons.tsx:127`, `components/admin/PendingPanelDiscardButtons.tsx:128`) — the DESTRUCT-1 fix. State: `{ kind: "idle" } | { kind: "running"; pendingKind } | { kind: "error"; copy; code }` (`components/admin/PendingPanelDiscardButtons.tsx:22-25`) plus a separate `armed` boolean (`components/admin/PendingPanelDiscardButtons.tsx:47`). `ARM_REVERT_MS = 4_000` declared locally at `components/admin/PendingPanelDiscardButtons.tsx:38`. The one prop is `pendingIngestionId: string` (`components/admin/PendingPanelDiscardButtons.tsx:20`).

DOM order is Defer then Ignore. Under `flex-wrap` with `basis-full` below the `sm` breakpoint the two stack, putting the irreversible action underneath — the defect recorded in the `BL-DESTRUCT-STACK-THUMB-ORDER` row of `BACKLOG.md`.

### 2.2 The timing constant

Eleven files declare `const ARM_REVERT_MS = 4_000;` independently. No shared module, no import, no guard:

| File | Line |
|---|---|
| `components/admin/BulkIgnoreControls.tsx` | 51 |
| `components/admin/PendingPanelDiscardButtons.tsx` | 38 |
| `components/admin/StagedReviewCard.tsx` | 87 |
| `components/admin/ResolveAlertButton.tsx` | 60 |
| `components/admin/ArchiveShowButton.tsx` | 45 |
| `components/admin/BlockedRowResolver.tsx` | 50 |
| `components/admin/wizard/CrewRowActions.tsx` | 31 |
| `app/admin/show/[slug]/PickerResetControl.tsx` | 25 |
| `app/admin/show/[slug]/ResetPickerEpochButton.tsx` | 27 |
| `app/admin/show/[slug]/RotateShareTokenButton.tsx` | 31 |
| `app/admin/settings/admins/RevokeRowButton.tsx` | 39 |

Count: **11**. This number is the single source of truth for the migration; §5.1 and the plan reference it rather than restating it.

`tests/styles/_metaDestructiveConfirm.test.ts` holds a 20-row registry of destructive-confirm surfaces keyed on the recipe token pair (`bg-warning-text` + `text-warning-bg`, `tests/styles/_metaDestructiveConfirm.test.ts:126-127`), fails-by-default on unregistered occurrences (`tests/styles/_metaDestructiveConfirm.test.ts:150-166`), and asserts recipe class hygiene C1 (`tests/styles/_metaDestructiveConfirm.test.ts:168-195`). It says nothing about timing.

### 2.3 The layout spec and its CI status

`tests/e2e/pendingDiscardReflow.layout.spec.ts` (173 lines) is a self-contained real-browser harness: it transcribes the shipped classes into local constants (`tests/e2e/pendingDiscardReflow.layout.spec.ts:30-49`), compiles real token CSS from `app/globals.css` via the Tailwind CLI (`tests/e2e/pendingDiscardReflow.layout.spec.ts:88-92`), serves it from its own `node:http` server (`tests/e2e/pendingDiscardReflow.layout.spec.ts:93-107`), and measures `getBoundingClientRect()` at 360px and 720px. It carries a negative control (`tests/e2e/pendingDiscardReflow.layout.spec.ts:146-155`) and a source drift-guard (`tests/e2e/pendingDiscardReflow.layout.spec.ts:165-173`).

It is listed in `tests/e2e/standalone.config.ts:36` and invoked by **no workflow**. `package.json:52` (`test:e2e:modal-header`) runs four other standalone specs; this is not one of them.

### 2.4 Test-id consumers

| File | References |
|---|---|
| `tests/components/admin/pendingIngestionActions.test.tsx` | ~10 `getByTestId` calls across `tests/components/admin/pendingIngestionActions.test.tsx:128`, `tests/components/admin/pendingIngestionActions.test.tsx:147-149`, `tests/components/admin/pendingIngestionActions.test.tsx:195-205`, `tests/components/admin/pendingIngestionActions.test.tsx:214`, `tests/components/admin/pendingIngestionActions.test.tsx:238-245`, `tests/components/admin/pendingIngestionActions.test.tsx:257`, `tests/components/admin/pendingIngestionActions.test.tsx:272`, `tests/components/admin/pendingIngestionActions.test.tsx:281`, `tests/components/admin/pendingIngestionActions.test.tsx:309-310` |
| `tests/e2e/needs-attention-page.spec.ts` | `tests/e2e/needs-attention-page.spec.ts:243`, `tests/e2e/needs-attention-page.spec.ts:250`; plus a stale source citation in the comment at `tests/e2e/needs-attention-page.spec.ts:53` (says `PendingPanelDiscardButtons.tsx:89`; the ignore button is at `components/admin/PendingPanelDiscardButtons.tsx:120-136`) |
| `tests/e2e/pendingDiscardReflow.layout.spec.ts` | uses its own local `data-testid="defer"` / `"ignore"`, not the component's |

`tests/help/_uiLabelExceptions.ts`, `tests/help/page-dashboard.test.tsx` and `tests/messages/_metaEmphasisRenderContract.test.ts` reference the component but **not** these test ids (verified by grep) — they need no change.

---

## 3. Goals / non-goals

**Goals.** (G1) Below `sm`, the safe action is the lower of the two stacked controls. (G2) At `sm` and above, the existing Defer-left / Ignore-right order is unchanged. (G3) Visual order and focus order agree at every width — no `order`, no `flex-row-reverse`, no grid line placement that would desync them. (G4) The harmonized 4s arm-revert cannot silently re-drift. (G5) BACKLOG reflects reality.

**Non-goals.** Changing any confirm label or the 4s value (R8). Touching the other ten destructive surfaces' markup — they get an import swap only. Closing the rest of `BL-STANDALONE-CONFIG-CI-DARK` (R5). Guarding non-arm timers (R6). Any DB, RPC, advisory-lock, API-route, or `§12.4` catalog change — this diff touches none.

---

## 4. Design — the forked render

### 4.1 Structure

`PendingPanelDiscardButtons` renders **one** outer column containing **three** children:

1. **Stacked copy** — `<div className="flex flex-col items-stretch gap-2 sm:hidden">`, DOM order **Ignore, then Defer**.
2. **Inline copy** — `<div className="hidden flex-wrap gap-2 sm:flex">`, DOM order **Defer, then Ignore**.
3. **Live region + error block** — rendered once, outside both copies.

`hidden` resolves to `display: none`, which removes the element from the accessibility tree, so exactly one copy is exposed to assistive technology and to hit-testing at any width. Focus order within the displayed copy is DOM order, and DOM order is visual order in both copies — G3 holds without any reordering primitive.

Both copies are produced by a single local helper so the two can never drift in label, class, handler, or disabled logic:

```tsx
function pair(variant: "stacked" | "inline") { /* returns [deferNode, ignoreNode] */ }
```

The helper takes only the variant (used for the test-id suffix) and closes over the component's state and handlers. The stacked copy renders `[ignore, defer]`; the inline copy renders `[defer, ignore]`.

### 4.2 Mode boundaries

| Element | Stacked (`< sm`) | Inline (`≥ sm`) | Rendered once (both) |
|---|---|---|---|
| Defer button | yes, second | yes, first | — |
| Ignore button | yes, first | yes, second | — |
| `role="status"` sr-only region | — | — | yes |
| `role="alert"` error block | — | — | yes |
| Container display | `flex` | `none` | — |

The live region moves **out** of the row (it is at `components/admin/PendingPanelDiscardButtons.tsx:140-142` today, inside it). Rendering it once is required: two mounted `role="status"` nodes with identical content produce a double announcement in some screen readers, and the region is `sr-only` so its position in the flex row carries no visual meaning.

### 4.3 Test ids

Per R4 the bare ids are retired. Each copy carries an explicit variant suffix:

| Control | Stacked | Inline |
|---|---|---|
| Defer | `admin-pending-defer-stacked-${id}` | `admin-pending-defer-inline-${id}` |
| Ignore | `admin-pending-ignore-stacked-${id}` | `admin-pending-ignore-inline-${id}` |

Unchanged: `admin-pending-discard-error-${id}` (`components/admin/PendingPanelDiscardButtons.tsx:147`), which is rendered once.

Consumers update as follows. jsdom tests (`tests/components/admin/pendingIngestionActions.test.tsx`) target the **inline** ids for the existing behavioural assertions — jsdom applies no CSS, so both copies mount and either would work; inline is chosen because it preserves the existing DOM order under test and therefore the meaning of the existing assertions. New parity tests (§6.2) cover the stacked copy. The Playwright spec `tests/e2e/needs-attention-page.spec.ts` runs at Playwright's default 1280px viewport, above `sm`, so it targets the **inline** ids; its stale source citation at `tests/e2e/needs-attention-page.spec.ts:53` is corrected in the same commit.

### 4.4 Containment for the duplicated destructive control (R3)

| Risk | Containment | Proof |
|---|---|---|
| The two copies drift in label / class / handler | Both emitted by the single `pair()` helper — there is one source expression per control | jsdom parity test asserting the stacked and inline Ignore nodes have identical `textContent` and identical class token sets, in **both** idle and armed states (§6.2) |
| A query resolves ambiguously and a test silently exercises the wrong copy | Variant-suffixed ids; the bare ids no longer exist, so a stale query fails loudly instead of matching two nodes | The id rename is mechanical and compile/test-visible |
| Both copies displayed at once, or neither | `sm:hidden` / `hidden sm:flex` are exact complements | Real-browser assertion at 360px and 720px that exactly one copy has a non-zero box (§6.3) |
| A future edit reintroduces a single-subtree render | Source drift-guard extended | `pendingDiscardReflow.layout.spec.ts` drift-guard test (§6.3) |

### 4.5 Guard conditions for the one prop

`pendingIngestionId: string` (`components/admin/PendingPanelDiscardButtons.tsx:20`) is the component's only input.

| Value | Behaviour |
|---|---|
| Non-empty string | Normal. Interpolated into four test ids and, `encodeURIComponent`-escaped, into the POST URL (`components/admin/PendingPanelDiscardButtons.tsx:81`). |
| Empty string `""` | Renders normally; test ids degrade to `admin-pending-ignore-stacked-`. The POST would target `/api/admin/pending-ingestions//discard` and fail server-side, surfacing through the existing error branch (`components/admin/PendingPanelDiscardButtons.tsx:100`). **Unchanged from today** — this spec adds no new failure mode and no new guard. The host (`components/admin/NeedsAttentionInbox.tsx`) always passes a row id. |
| `null` / `undefined` | Not reachable — the prop is a required non-nullable `string` and TypeScript rejects the omission at the call site. No runtime guard is added, matching current behaviour. |

### 4.6 Dimensional invariants

Tailwind v4 on this project does **not** default `.flex` to `align-items: stretch` (`AGENTS.md` cross-cutting rule; memory `feedback_tailwind_v4_flex_items_stretch`). Every parent→child dimension relationship is therefore stated explicitly and verified in a real browser, never in jsdom.

| # | Parent | Child | Required relationship | Guaranteeing class | Verified by |
|---|---|---|---|---|---|
| D1 | stacked container | both buttons | child width == container width | `items-stretch` on the container (**explicit — not inherited**) | §6.3 real-browser width equality at 360px |
| D2 | stacked container | both buttons | child height ≥ 44px | `min-h-tap-min` on each button (`--spacing-tap-min: 44px`, `app/globals.css:162`) | §6.3 height assertion at 360px |
| D3 | inline container | both buttons | children share one line, widths intrinsic | `flex-wrap` + no `basis-full` in this copy | §6.3 at 720px: `defer.right ≤ ignore.left` |
| D4 | stacked Ignore | itself, idle vs armed | box top / left / width identical across the arm transition (DESTRUCT-1) | full-width stack pins all three edges; only height may change | §6.3 equality assertion, with the existing negative control retained |
| D5 | stacked container | Ignore vs Defer | `ignore.bottom ≤ defer.top` | DOM order Ignore-first in a `flex-col` | §6.3 at 360px, against a new negative control panel using today's single-subtree markup |
| D6 | inline container | Ignore, idle vs armed | box **left** and **top** identical across the arm transition; width may grow rightward | `flex-wrap` with intrinsic widths — the armed label extends the right edge only, because the left edge is set by the preceding Defer plus `gap-2` | §6.3 at 720px |

**Empirical grounding.** These are measured, not derived. A probe rendering the proposed markup with the real compiled token CSS in Chromium (darwin arm64, 2026-07-25; body gutter 16px matching the admin `px-4`) returned:

| Viewport | Measurement |
|---|---|
| 360px | stacked Ignore `x16 w328 h44`, stacked Defer `x16 y+52 w328 h44` → D1, D2, D5 hold. Container width 328 == button width 328, confirming `items-stretch` is load-bearing. |
| 360px | every inline-copy node measures `0×0` → exactly one copy displayed. |
| 360px | armed stacked Ignore box equals the idle box on x, y, w **and** h — the armed label fits one line in a 328px box on this host. |
| 360px | negative control (today's shipped markup): Defer `y192`, Ignore `y244` → Ignore **below** Defer. The harness reproduces the reported defect, so D5's assertion is not tautological. |
| 720px | stacked copy `display:none`, `offsetParent === null`, `0×0`; inline copy `display:flex`. Defer `x16 right170.74`, Ignore `x178.74` → D3 holds. |
| 720px | armed inline Ignore grows `w153.2 → w328.51` with its **left edge pinned at x178.74** → D6 holds. Same benign "grows from a pinned edge" shape the DESTRUCT-1 analysis blessed for `components/admin/BulkIgnoreControls.tsx`. |

**Why D4 does not assert height equality even though the probe measured it.** The armed label fitting one line at 328px is a font-metric outcome, and CI runs x64 Linux while this measurement is arm64 macOS. A height-equality assertion would be a platform-hardcoded fixture: green locally, red in CI, for a wrap that does not violate the invariant. What D4 actually protects is that the confirm target does not move out from under the finger — top, left and width. Height is allowed to grow downward from a pinned top.

Note on D4: `basis-full sm:basis-auto` is **removed** from both buttons. The fork makes it redundant — the stacked copy is `flex-col` with `items-stretch` (full width by construction) and the inline copy never needs to wrap-to-full. The DESTRUCT-1 invariant it protected is preserved structurally rather than by basis, and D4 is the assertion that proves it. The layout spec's drift-guard at `tests/e2e/pendingDiscardReflow.layout.spec.ts:165-173`, which currently asserts the source contains `basis-full` and `sm:basis-auto`, is rewritten to assert the fork's classes instead — see §6.3.

### 4.7 Transition inventory

Visual states: **S1** idle, **S2** armed, **S3** running-defer, **S4** running-ignore, **S5** error. All 10 pairs:

| Pair | Treatment |
|---|---|
| S1→S2 | Recipe morph on Ignore: `transition-opacity duration-fast` (`components/admin/PendingPanelDiscardButtons.tsx:127`). Box top/left/width fixed (D4). **Unchanged.** |
| S2→S1 | Same transition, reverse. Fires on 4s auto-revert (`components/admin/PendingPanelDiscardButtons.tsx:60-63`) or on a sibling mutation (`components/admin/PendingPanelDiscardButtons.tsx:76-77`). **Unchanged.** |
| S1→S3 | Instant — label swap `Defer until modified` → `Deferring…` (`components/admin/PendingPanelDiscardButtons.tsx:116-118`), `disabled` set. No animation needed. |
| S1→S4 | Not reachable: Ignore requires arming first (`components/admin/PendingPanelDiscardButtons.tsx:57-64`). Documented as impossible, not as instant. |
| S2→S4 | Instant — Ignore label `Confirm…` → `Ignoring…` (`components/admin/PendingPanelDiscardButtons.tsx:133-134`). The disarm and the run are set in the same handler (`components/admin/PendingPanelDiscardButtons.tsx:66-68`, `components/admin/PendingPanelDiscardButtons.tsx:76-78`), so no intermediate idle frame renders. |
| S2→S3 | Instant — tapping Defer while Ignore is armed disarms it and starts the defer (`components/admin/PendingPanelDiscardButtons.tsx:76-77`). Both labels change in one commit. Pinned by the existing test at `tests/components/admin/pendingIngestionActions.test.tsx:232`. |
| S3→S1, S4→S1 | Instant — success path resets to idle and calls `router.refresh()` (`components/admin/PendingPanelDiscardButtons.tsx:97-98`). |
| S3→S5, S4→S5 | Instant — the error block mounts below the row (`components/admin/PendingPanelDiscardButtons.tsx:144-153`). No enter animation today. **Unchanged.** |
| S5→S3, S5→S4 | Instant — a new attempt replaces the error state (`components/admin/PendingPanelDiscardButtons.tsx:78`). |
| S5→S1 | Not reachable directly: leaving error requires a new attempt, so it passes through S3/S4. |
| S3↔S4 | **Not reachable in either direction.** `handleClick` returns early while a run is in flight (`components/admin/PendingPanelDiscardButtons.tsx:72`), and both buttons are `disabled` when `isRunning` (`components/admin/PendingPanelDiscardButtons.tsx:104`, `components/admin/PendingPanelDiscardButtons.tsx:113`, `components/admin/PendingPanelDiscardButtons.tsx:124`). One mutation at a time by construction. |
| S2↔S5 | **S2→S5 is not reachable directly** — an error can only be set by `handleClick`, which disarms first (`components/admin/PendingPanelDiscardButtons.tsx:76-77`), so the path is S2→S4→S5. **S5→S2 *is* reachable and is a genuine compound state:** `onGuardedIgnoreClick` (`components/admin/PendingPanelDiscardButtons.tsx:56-64`) arms without touching `state`, so tapping Ignore while an error is displayed arms the button with the `role="alert"` block still mounted below. Treatment: instant, and the error block stays — it describes the *previous* failed attempt, which is still true and still useful. **Unchanged from today**; called out here because the fork must not accidentally clear it. Asserted in §6.2 test 9. |
| S1↔S1 | n/a |

**Compound transitions** (a second dimension changing while a state transition is live):

| Compound case | Treatment |
|---|---|
| Viewport crosses `sm` while **armed** | The `armed` state lives in the component, above both copies, so the newly-displayed copy renders already-armed. No re-arm, no timer reset — the single `armTimerRef` (`components/admin/PendingPanelDiscardButtons.tsx:48`) is shared. The morph transition does not replay because the displayed node is a different element that mounts in its armed class; this is a display swap, not a state change. **Accepted and asserted** (§6.2). |
| Viewport crosses `sm` while **running** | Same: `state` is shared, so the newly-displayed copy shows `Deferring…` / `Ignoring…` and `disabled` immediately. |
| 4s auto-revert fires while the viewport is mid-resize | No interaction — the timer is viewport-independent and clears one shared `armed` flag. |
| Component unmounts while armed | `useEffect(() => clearArmTimer, [])` (`components/admin/PendingPanelDiscardButtons.tsx:55`) clears the timer. **Unchanged**; pinned at `tests/components/admin/pendingIngestionActions.test.tsx:269`. |

---

## 5. Design — the arm-timing drift guard

### 5.1 Shared constant

New module **lib/admin/destructiveConfirm.ts** (created by this change, so it is named in bold rather than cited):

```ts
/** Armed-state auto-revert window for every two-tap destructive confirm.
 *  Ratified 4s on 2026-07-17 (DEFERRED-archive.md:1228). Single source of
 *  truth; pinned by tests/styles/_metaDestructiveConfirm.test.ts. */
export const ARM_REVERT_MS = 4_000;
```

All 11 declarations listed in §2.2 are replaced by an import. No behavioural change: every site already used `4_000`, so no existing timer test changes (they advance past 4s today).

### 5.2 Guard assertions

Two new assertions added to `tests/styles/_metaDestructiveConfirm.test.ts`, which already walks `components/` and `app/` (`tests/styles/_metaDestructiveConfirm.test.ts:131-141`) and already fails-by-default on unregistered destructive-confirm surfaces (`tests/styles/_metaDestructiveConfirm.test.ts:150-166`). Reusing it means a **new** destructive surface that adopts the recipe is forced into the registry, and therefore into these assertions, with no new discovery mechanism to maintain.

**T1 — single declaration.** Walking `components/`, `app/` and `lib/`, exactly one file declares the identifier `ARM_REVERT_MS`, and it is the new **lib/admin/destructiveConfirm.ts**. Any other declaration fails, naming the offending file. This catches the copy-paste re-drift that produced the eleven literals.

**T2 — registry files with an arm timer import the constant.** For every non-exempt registry row whose file contains an arm-state setter (matched on `setArmed(` / `setIgnoreArmed(` / a `useState` whose setter name ends `Armed`), the file must import `ARM_REVERT_MS` from the shared module `@/lib/admin/destructiveConfirm` (created by this change). Registry files with no arm state are skipped — several confirm surfaces are popover-based and have no auto-revert at all (e.g. `components/admin/CleanupAbandonedFinalizeButton.tsx:123` `DiscardConfirmPopover`, registered at `_metaDestructiveConfirm.test.ts:77-82`). A file may opt out with an inline `// not-arm-revert: <reason>` comment, matching the project's established exemption idiom (`// not-subject-to-meta:` in invariant 9, `// no-telemetry:` in invariant 10).

**T3 — value pin.** `ARM_REVERT_MS === 4_000`. A one-line assertion so a silent change to the shared value is a test failure with an explicit ratification citation in its message, not a quiet edit.

**Matcher self-check.** Following the existing pattern at `_metaDestructiveConfirm.test.ts:143-148`, T1/T2 ship with a self-check proving the detector fires on a synthetic positive and does not fire on a synthetic negative — so the guard cannot pass vacuously.

### 5.3 Honest scope statement

The guard closes re-drift **by the established name and by registry membership**. It does not stop a wholly new surface that never adopts the recipe token pair and invents `CONFIRM_TIMEOUT = 3000`; that surface is invisible to the registry by the registry's own declared scope (`_metaDestructiveConfirm.test.ts:10-12`). This limitation is stated in the guard's header comment rather than papered over, and it is strictly better than today, where even the named-identifier case is unguarded. Per R6, non-arm timers such as `SUCCESS_DISMISS_MS` are out of scope.

---

## 6. Verification

### 6.1 What jsdom cannot prove

jsdom applies no CSS (`feedback_jsdom_no_css_tobevisible_vacuous`). `toBeVisible()` on a `hidden sm:flex` node is vacuous there, and `getBoundingClientRect()` returns zeros for everything. Therefore **every** claim in §4.6 — one-copy-per-breakpoint, stacked order, width stretch, box equality — is a real-browser assertion. jsdom covers only structure, labels, classes, and handler behaviour.

### 6.2 jsdom (`tests/components/admin/pendingIngestionActions.test.tsx`)

Existing tests: retarget to the inline ids per §4.3. No assertion semantics change.

New tests:

1. **Both copies mount.** Four buttons present with the four variant ids.
2. **Copy parity, idle.** Stacked and inline Ignore have identical `textContent` and identical class token sets after removing the container-level classes; likewise Defer. Derived by comparing the two nodes to each other, never against a hardcoded string — a hardcoded expectation would pass even if both copies drifted together.
3. **Copy parity, armed.** Same, after one tap on the stacked Ignore.
4. **Shared state across copies.** Arming via the **stacked** Ignore also morphs the **inline** Ignore (proves one state, two renders — this is the compound-transition claim in §4.7). Then the reverse: arming via inline morphs stacked.
5. **Second tap on the *other* copy fires the discard.** Tap stacked Ignore to arm, tap inline Ignore to confirm → exactly one POST with `kind: "permanent_ignore"`. Catches a per-copy `armed` state, which would make this a no-op re-arm.
6. **One live region.** Exactly one `role="status"` node in the tree, and it is outside both copies. Catches the double-announcement regression.
7. **Container classes.** The stacked container carries `flex-col`, `items-stretch`, `sm:hidden`; the inline container carries `hidden`, `sm:flex`. Asserted as token-set membership. This is the jsdom half of D1 — the real half is §6.3.
8. **DOM order per copy.** Within the stacked container, the Ignore node precedes the Defer node (`compareDocumentPosition`); within the inline container, the reverse. This is the structural claim; the geometric one is §6.3 D5.
9. **Arming while an error is displayed keeps the error block** (the S5→S2 compound state in §4.7). Drive a 409, assert the `role="alert"` block is present, tap Ignore, then assert *both* that the Ignore label morphed to the armed copy *and* that the error block is still mounted with unchanged text. Catches a fork that resets `state` when arming — which would silently swallow the explanation of the failure the operator is currently looking at.

Failure mode each new test catches is stated in its own comment, per the project's anti-tautology rule.

### 6.3 Real browser (`tests/e2e/pendingDiscardReflow.layout.spec.ts`)

The harness is re-transcribed to the forked markup. Panels:

| Panel | Markup | Role |
|---|---|---|
| `fork-idle`, `fork-armed` | shipped fork classes | subject |
| `nofork-idle`, `nofork-armed` | **today's** single-subtree markup (`flex flex-wrap` + `basis-full sm:basis-auto`, Defer first) | **negative control for D5** — proves at 360px that this markup puts Ignore *below* Defer, so the fork's "Ignore above" is a real change and not tautological |
| `nobasis-idle`, `nobasis-armed` | pre-DESTRUCT-1 markup (no basis) | existing negative control for D4, retained |

Assertions:

- **360px:** stacked copy has non-zero boxes; inline copy's buttons measure `width === 0 && height === 0` (display:none). Exactly one copy displayed.
- **360px, D5:** `ignore.bottom ≤ defer.top + TOL` in `fork-idle` **and** `fork-armed`. Negative control `nofork-idle` asserts the opposite (`ignore.top ≥ defer.bottom - TOL`).
- **360px, D1:** both buttons' widths equal the container's width within 0.5px.
- **360px, D2:** both buttons' heights ≥ 44px.
- **360px, D4:** `fork-armed` stacked Ignore box top / left / width equal `fork-idle`'s within 0.5px. Height compared separately and allowed to grow; the existing `nobasis` control retained to prove the harness still reproduces a reflow.
- **720px:** inline copy displayed, stacked copy measures zero. `defer.right ≤ ignore.left + TOL` (D3, Defer on the left). Exactly one copy displayed.
- **720px, D6:** `fork-armed` inline Ignore box left and top equal `fork-idle`'s within 0.5px; width is allowed to grow. Catches a future change that lets the armed label push the confirm target leftward under a cursor already resting on it.
- **Drift-guard (rewritten from `tests/e2e/pendingDiscardReflow.layout.spec.ts:165-173`):** the shipped source contains `sm:hidden`, `hidden`, `sm:flex`, `items-stretch`; and contains **no** `basis-full`, since §4.6 removes it. The negative half is what makes this guard bite — asserting only the presence of new classes would still pass if the old markup survived alongside.

### 6.4 CI wiring (R5)

- New `package.json` script `test:e2e:destructive-layout`, running `tests/e2e/pendingDiscardReflow.layout.spec.ts` under `tests/e2e/standalone.config.ts` (the config must be passed explicitly; Playwright's default config matches none of these specs).
- New workflow **.github/workflows/destructive-layout-e2e.yml**, modelled directly on `.github/workflows/modal-header-layout-e2e.yml` — same `actions/setup`, same Playwright browser cache, same failure-artifact upload, same `workflow_dispatch:` so close-out can fire it with `gh workflow run`. The harness self-hosts, so no `webServer` and no Supabase are needed; unlike the modal-header job it also needs no env block, because this harness renders static HTML strings and imports no server chain.
- `paths:` triggers on `components/admin/PendingPanelDiscardButtons.tsx`, the layout spec itself, `tests/e2e/standalone.config.ts`, `app/globals.css`, `package.json`, `pnpm-lock.yaml`, and the workflow file.
- The `BL-STANDALONE-CONFIG-CI-DARK` row's "Partially closed" note in `BACKLOG.md` is updated to record that one more spec is now covered and the remainder still dark.

### 6.5 Full-suite gates before push

`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, the two e2e scripts above, and real CI green. Per project rule, local green is necessary but not sufficient for a CI-bound surface.

---

## 7. BACKLOG.md changes

1. Delete the `BL-DESTRUCT-CONFIRM-COPY-HARMONIZE` and `BL-DESTRUCT-BULK-UNDO-SUCCESS-STATUS` rows; the family heading gains a one-line note that both were resolved 2026-07-17 by `fix/destruct-harmonize`, citing `DEFERRED-archive.md:1224` and `DEFERRED-archive.md:1230`, so the history is not lost.
2. Delete the `BL-DESTRUCT-STACK-THUMB-ORDER` row, resolved by this branch.
3. Update the `BL-STANDALONE-CONFIG-CI-DARK` row per §6.4.

The family section is then empty and is removed along with its heading and its preceding `---` rule.

---

## 8. Invariants touched

| Invariant | Applies? | How satisfied |
|---|---|---|
| 1 — TDD per task | yes | Every task: failing test → implementation → passing → commit |
| 2 — advisory lock | no | No path here mutates `shows` / `crew_members` / `crew_member_auth` / `pending_syncs` / `pending_ingestions`. The component POSTs to an existing route (`components/admin/PendingPanelDiscardButtons.tsx:81`); that route is unchanged. |
| 3 — email canonicalization | no | No email surface |
| 4 — no global sync cursor | no | No sync surface |
| 5 — no raw error codes in UI | yes, unchanged | Error copy still routes through `messageFor(code).dougFacing` (`components/admin/PendingPanelDiscardButtons.tsx:30`, `components/admin/PendingPanelDiscardButtons.tsx:92`); the `GENERIC_ERROR` fallback (`components/admin/PendingPanelDiscardButtons.tsx:34`) keeps its `// not-subject:M5-D8` marker |
| 6 — commit per task | yes | Conventional commits, scope `admin` / `test` / `infra` / `docs` |
| 7 — spec is canonical | yes | No spec amendment needed; nothing here contradicts the master spec |
| 8 — impeccable dual-gate | **yes** | `components/admin/PendingPanelDiscardButtons.tsx` is under `components/`. `/impeccable critique` **and** `/impeccable audit` run on the diff before adversarial review, with P0/P1 fixed or deferred via `DEFERRED.md`, dispositions in the close-out |
| 9 — Supabase call-boundary | no | No Supabase client call added or altered |
| 10 — mutation-surface telemetry | no | No new route handler and no new `"use server"` action. The existing route is untouched. |
| 11 — isolated worktree | yes | `FX-worktrees/destruct-thumb-order`, branched off `origin/main` before the first edit |

---

## 9. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| A screen reader announces the arm twice | low | Live region rendered once, outside both copies (§4.2); asserted by §6.2 test 6 |
| The two copies drift | low | Single `pair()` helper; parity tests §6.2 tests 2–3 |
| Both copies displayed at some width | very low | `sm:hidden` / `hidden sm:flex` are exact complements; asserted in a real browser at both viewports (§6.3) |
| Removing `basis-full` reintroduces the DESTRUCT-1 reflow | low | D4 assertion retained with its negative control; the rewritten drift-guard asserts `basis-full` is *absent*, so the two cannot both be true |
| Test-id rename misses a consumer | low | Consumers enumerated in §2.4 by grep; the bare ids cease to exist, so a missed consumer fails loudly rather than matching two nodes |
| The new workflow is itself dark | low | `workflow_dispatch:` enabled; close-out fires it with `gh workflow run` and confirms a green run before merge (§6.4) |
| T2's arm-state detector misses a surface | medium | Self-check proves the detector fires (§5.2); scope limitation stated honestly in §5.3 rather than overclaimed |
