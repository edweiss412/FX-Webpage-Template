# Destructive-action confirmation pass — spec

Date: 2026-07-16. Autonomous-ship pipeline (user-approved). Closes DEFERRED FLOW4-4, FLOW4-5, FLOW4-6; stale-closes OVR-1..OVR-7 (feature removed); establishes the project-wide destructive-admin-action contract OVR-1's trigger called for.

## 1. Problem

Four hand-rolled confirm idioms coexist with no shared recipe, and several destructive controls have no guard at all:

- **No danger visual language.** The destructive confirm-go button is styled four different ways: neutral `bg-surface` (`components/admin/RecentAutoAppliedStrip.tsx:330` "Undo all N" — near-identical to the safe "Keep changes" `bg-bg` at `:317`; DEFERRED FLOW4-5), brand accent `bg-accent text-accent-text` (`app/admin/show/[slug]/RotateShareTokenButton.tsx:235`, `app/admin/show/[slug]/ResetPickerEpochButton.tsx:211`, `app/admin/show/[slug]/PickerResetControl.tsx:232`, `app/admin/settings/admins/RevokeRowButton.tsx:211`, `components/admin/ResolveAlertButton.tsx:150` via `AccentButton`), soft amber `border-status-warn bg-warning-bg text-warning-text` (`components/admin/ArchiveShowButton.tsx:198-199`), and inverted amber `bg-warning-text text-warning-bg` (`components/admin/MaintenanceResetButtons.tsx:298`, `components/admin/CleanupAbandonedFinalizeButton.tsx:183`, `components/admin/ReapStaleSessionsButton.tsx:137`). Brand accent on a destructive go is actively misleading (accent = primary/affirmative everywhere else).
- **Unguarded irreversible one-taps.** "Permanently ignore" (`components/admin/PendingPanelDiscardButtons.tsx:84-95`), "Stop showing this sheet" (`components/admin/StagedReviewCard.tsx:622-633`, `permanent_ignore` discard), "Re-scan this sheet" (`components/admin/RescanSheetButton.tsx:170-180` — overwrites staged review work), and bulk "Ignore all N" (`components/admin/BulkIgnoreControls.tsx:80-93`) each fire on a single tap.
- **Inverted focus bug.** `CleanupAbandonedFinalizeButton.tsx:130-135` focuses the DESTRUCTIVE "Yes, discard" button when the confirm popover opens — the only surface that does; convention everywhere else (`components/admin/ReSyncButton.tsx:76-79` `keepCurrentRef`, `RecentAutoAppliedStrip.tsx:203-206` `keepChangesRef`, `MaintenanceResetButtons.tsx:82` `resetCancelRef`, `ReapStaleSessionsButton.tsx:63` `cancelRef`) focuses the SAFE control (WCAG 2.4.3).
- **FLOW4-4:** `RecentAutoAppliedStrip.tsx` `confirmUndoAll` (`:209-221`) awaits `actions.undoFromDashboardAction(null, fd)` per id and discards each `UndoChangeResult` (`lib/sync/holds/undoChange.ts:24` — `{ ok: true; showId?: string } | { ok: false; code: string }`); a partial failure closes the panel with no message.
- **FLOW4-6:** `confirmUndoAll` unmounts the confirm panel while focus may sit on the confirm-go button → focus drops to `<body>`.

### 1.1 Stale DEFERRED entries (no code change; bookkeeping only)

OVR-1..OVR-7 reference `OverrideableField.tsx` / `ShowOverrideBlocks.tsx` from the admin field-override feature (PR #376), which was **removed** in PR #382 (`docs/superpowers/specs/…remove-admin-field-overrides`; merge `bbb6ac91a`). Those files do not exist on `main` (verified by grep 2026-07-16). All seven entries are marked `✅ STALE — surface removed (PR #382)` in DEFERRED.md. The project-wide destructive-action pass OVR-1's trigger named is THIS spec.

## 2. Ratified decisions (user, 2026-07-16)

1. **Guard tier: irreversible only.** New two-tap guards on exactly 4 controls (§4). Reversible/recoverable controls stay one-tap (§7 exceptions).
2. **Destructive confirm-go recipe: inverted amber** — `bg-warning-text text-warning-bg` (the strongest existing shipped treatment). No new red/danger token; DESIGN.md's red scoping (`--color-status-degraded` = dots/small pills only) is unchanged.
3. **Consolidation: recipe + meta-test, no shared component.** Each surface keeps its local state machine; a structural meta-test pins the recipe and the focus-safe rule via a registry (fails-by-default for unregistered new surfaces).
4. **FLOW4-4 in scope:** aggregate failure line after partial bulk undo.

## 3. The destructive-confirm contract (normative)

Applies to every **destructive confirm-go** control: the button whose activation actually performs a destructive mutation after a confirm step (not the trigger that opens the confirm).

- **C1 — Recipe.** Class set MUST include `bg-warning-text` and `text-warning-bg` and `font-semibold`, and MUST NOT include `bg-accent`, `bg-surface`, or `bg-bg`. Hover (normative): `hover:opacity-90` (matches `MaintenanceResetButtons.tsx:298`); the token set MUST NOT include any other `hover:bg-*` (e.g. `hover:bg-accent-hover`, `hover:bg-surface-sunken`, `hover:bg-warning-bg`). Enforced by both the meta-test and the rendered restyle tests (§8, §10). Existing contrast: light `#5c3f00`/`#fff3d6`, dark `#ffd68a`/`#3a2e14` (`app/globals.css` warning tokens) — both ≥7:1, no new token math.
- **C2 — Safe control.** Where a separate cancel/safe control exists in the confirm step, it KEEPS its current neutral treatment unchanged — this pass restyles no safe controls. Allowed neutral treatments (all shipped): `bg-bg` (strip "Keep changes" `RecentAutoAppliedStrip.tsx:317`, ReSync "Keep current version" `ReSyncButton.tsx:172`, MaintenanceReset/ReapStale/Cleanup cancels), `bg-surface` bordered (Rotate/ResetEpoch/PickerReset cancels, e.g. `RotateShareTokenButton.tsx:244`), or text-only recessive (Revoke cancel `RevokeRowButton.tsx:293`, ResolveAlert cancel `ResolveAlertButton.tsx:174`). The safe control MUST NOT carry any recipe token (`bg-warning-text`/`text-warning-bg`); once the confirm-go carries the recipe, the FLOW4-5 twin-confusion class is closed regardless of which neutral the safe control uses. Restyle tests assert the cancel lacks recipe tokens (§10).
- **C3 — Focus on open.** When a confirm step mounts a separate panel/popover containing a safe control, the SAFE control receives focus on open (the `keepCurrentRef` pattern, `ReSyncButton.tsx:76-79`). Never the destructive control. Two-tap morphs (single button changes label in place) are exempt — focus never moves.
- **C4 — Auto-revert.** Where the confirm state is entered by re-purposing the trigger's spot (a morphing button, or a trigger→confirm-row swap), it auto-reverts to idle after a timeout (existing idiom: 3–4s, `ArchiveShowButton.tsx:42`, `RotateShareTokenButton.tsx:93-95`). New guards in §4 use 4s. Persistent panels with an explicit, focused safe control (strip Undo-all, ReSync, MaintenanceReset modal, Cleanup popover, ReapStale) need no timer.
- **C5 — Focus on close.** When completing/cancelling a confirm unmounts the focused control, focus is moved to a designated still-mounted element before unmount (FLOW4-6's defect class).
- **C6 — Escalation tier.** Environment-wipe operations keep the stricter typed-confirm modal (`MaintenanceResetButtons.tsx:163` `confirmEnabled` gate). This spec does not relax it.

## 4. New guards (two-tap morph, C1+C4)

Each converts the existing one-tap button into the two-tap morph idiom: first tap → label changes to a "Confirm …" phrasing + recipe classes applied + 4s auto-revert timer; second tap → fires the existing handler. No new copy strings beyond the confirm labels below; no layout moves.

| # | Control | File (verified) | Confirm label |
|---|---------|-----------------|---------------|
| G1 | Permanently ignore | `components/admin/PendingPanelDiscardButtons.tsx:84-95` | `Confirm — stop tracking this sheet permanently` |
| G2 | Stop showing this sheet | `components/admin/StagedReviewCard.tsx:622-633` | `Confirm — stop showing this sheet` |
| G3 | Re-scan this sheet | `components/admin/RescanSheetButton.tsx:170-180` | `Confirm re-scan — replaces this staged review` |
| G4 | Ignore all N | `components/admin/BulkIgnoreControls.tsx:80-93` | `Confirm — ignore all N` (N interpolated, existing `group.items.length`) |

Notes:
- G2's idle state is a recessive underline link (`text-text-subtle underline`, `StagedReviewCard.tsx:629`); on first tap it morphs into a solid recipe button (C1). Reverting restores the link. The existing `aria-describedby` note (`:630`) is preserved in both states.
- G3 applies in both `placement` variants (`RescanSheetButton.tsx:166-168`). The morph must not change the button's `self-start` sizing behavior.
- G4 state model (precise): `BulkIgnoreControls` gains `armedCode: string | null` local state, SEPARATE from the existing `state` machine (`idle | running | error`). First tap on group X → `armedCode = X.code` + 4s auto-revert timer (timer cleared on any transition). Tap on a different group Y while X is armed → Y becomes armed (`armedCode = Y.code`, timer restarted) — exactly one group armed at a time; X silently reverts. Second tap on the armed group → clear timer, `armedCode = null`, then the existing `ignoreGroup(group)` runs unchanged. `state.kind === "running"` keeps ALL group buttons disabled (existing behavior, `BulkIgnoreControls.tsx:85`); entering `running` or `error` clears `armedCode`. Auto-revert fires → `armedCode = null`, no other effect.
- G1: the sibling "Defer until modified" (`:73-83`) stays one-tap (reversible; §7).
- Auto-revert timers are cleared on unmount (existing idiom, `ArchiveShowButton.tsx:42` pattern).

## 5. Restyles (C1/C2, no behavior change)

| # | Surface | Kind | Change |
|---|---------|------|--------|
| R1 | `RecentAutoAppliedStrip.tsx:322-333` "Undo all N" confirm-go | panel | `border border-border-strong bg-surface … text-text-strong` → recipe (C1). "Keep changes" (`:312-321`) unchanged (already C2-compliant). Closes FLOW4-5. |
| R2 | `RotateShareTokenButton.tsx:235` "Confirm rotate" | panel | `bg-accent text-accent-text` + `hover:bg-accent-hover` → recipe. |
| R3 | `ResetPickerEpochButton.tsx:211` "Confirm reset" | panel | same as R2. |
| R4 | `PickerResetControl.tsx:232` "Confirm reset" | panel | same as R2. |
| R5 | `RevokeRowButton.tsx:284` "Confirm revoke" | panel | accent → recipe. Idle "Revoke" trigger (`:211`) and the disabled placeholder (`:169`) are NOT restyled (trigger, not confirm-go). |
| R6 | `ResolveAlertButton.tsx:150-160` "Confirm dismiss" (AccentButton) | panel | replace `AccentButton` with a plain button carrying the recipe (keep `minWidthTap` sizing, warning-bg ring offset, `aria-busy`, testid; drop the `disabled:hover:bg-accent` override at `:160` — recipe hover is `hover:opacity-90`). |
| R7 | `ArchiveShowButton.tsx:198-199` "Confirm archive …" | morph | soft amber (`border-status-warn bg-warning-bg text-warning-text`) → recipe. Both `compact` and full variants; long confirm label text is retained. |
| R8 | `ReSyncButton.tsx:176-187` "Apply reduced version" (AccentButton) | panel | accepts a show-shrinking sync over last-good — destructive confirm-go by §3's definition. AccentButton → plain recipe button (keep `ringOffset="warning-bg"` equivalent, testid, `aria-busy`). Enumerated here so the reviewer doesn't rediscover it; it authored the C3 pattern but predates the recipe. |

`MaintenanceResetButtons.tsx:298`, `CleanupAbandonedFinalizeButton.tsx:183`, `ReapStaleSessionsButton.tsx:137` already carry the recipe — registry rows only.

**Kind definitions.** `morph` = a single button that changes label/style in place on first activation (focus never moves; C3 exempt). `panel` = the confirm step renders a separate destructive-go + safe/cancel control pair (C3 applies).

**Cross-impact (same commit as each restyle):** R2–R6 delete `bg-accent`/`text-accent-text` occurrences, so the matching rows in `tests/styles/_metaBgAccentInventory.test.ts` MUST be removed in the same commit (its STALE ROW check fails otherwise). R6/R8 remove `AccentButton` usages (component-internal `bg-accent` is registered once at the component, so only literal per-file occurrences like `ResolveAlertButton.tsx:160` need row deletion — verify against the registry at implementation time).

## 6. Behavioral fixes

- **F1 (Cleanup inverted focus).** `CleanupAbandonedFinalizeButton.tsx:134` `confirmRef.current?.focus()` → focus `cancelRef` instead (C3). `confirmRef` may be removed if then unused. Escape/focus-trap behavior otherwise unchanged.
- **F2 (FLOW4-4 aggregate).** `confirmUndoAll` collects results: `const results = []; … results.push(await actions.undoFromDashboardAction(null, fd))`. After the loop, `const failed = results.filter(r => r && !r.ok).length` and `const total = results.length`; store BOTH in new group-level local state `bulkUndoOutcome: { failed: number; total: number } | null`. Render when `bulkUndoOutcome !== null && bulkUndoOutcome.failed > 0`: a `role="alert"` block INSIDE the group's disclosed panel region. Exact JSX order within the disclosed region: (1) the existing `confirming ? <div role="status" …> : null` conditional block, (2) THIS alert block, (3) the change-row list — i.e. the alert is a new sibling inserted between the confirm conditional and the row list. Because opening the confirm resets the outcome to `null` (below), the alert and an open confirm panel are never rendered simultaneously; no ordering ambiguity remains while both slots exist. When the group is collapsed the alert is hidden with the rows — accepted. Fixed copy: `Couldn't undo {failed} of {total} changes. The ones that failed stay in this list.` (Deliberately does NOT claim the visible rows are exactly the failures — successfully undone rows may remain visible until the post-loop revalidate lands; "stay in this list" is true of the failures both before and after refresh.) — plain-language, no raw code (invariant 5), no new §12.4 entry (static copy, not a catalog code; same class as the strip's existing fixed infra sentence at `RecentAutoAppliedStrip.tsx:363-374`). Lifecycle: persists after the confirm panel closes; reset to `null` when the confirm is next opened (`setConfirming(true)`) AND on any subsequent bulk undo that completes with zero failures. A zero-failure run never sets it (stays/returns `null`, nothing renders). The strip's existing revalidate self-heal is unchanged.
- **F3 (FLOW4-6 focus on close).** BOTH close paths — the "Keep changes" cancel handler AND `confirmUndoAll` completion — move focus to the group disclosure toggle (`auto-applied-toggle-<showId>`) via a ref, immediately BEFORE `setConfirming(false)`, **guarded** by the same rule as F4: only if `document.activeElement` is inside the group card's container at that moment. The guard covers collapse-during-bulk-undo (R3 review): the disclosure toggle stays ENABLED while the undo loop is pending (no new disabling); if the user collapses the group mid-loop, the confirm panel unmounts, focus sits on the toggle (they just clicked it), the loop still completes, the guard sees focus already on the toggle (inside container — focusing it again is a no-op) or elsewhere (no steal), and `bulkUndoOutcome` still updates — its state is group-level and independent of disclosure, so the alert renders on re-expand. If the group itself unmounts on revalidate (all changes undone), focus loss to body is accepted (the surface is gone; P3 residual, explicitly accepted).
- **F4 (C3+C5 on the accent-panel family).** `RotateShareTokenButton`, `ResetPickerEpochButton`, `PickerResetControl`, `RevokeRowButton`, and `ResolveAlertButton` currently mount their confirm/cancel row with NO focus management — the idle trigger unmounts while focused, so keyboard focus is lost and a stray second Enter's target is undefined (verified: no `.focus()` call in any of the five; e.g. `ResolveAlertButton.tsx` has only the auto-revert timer refs). Each gains:
  - **Open (C3):** ref on the CANCEL button + effect focusing it when the confirm state mounts (the `keepCurrentRef` pattern). Closes the stray-Enter vector.
  - **Close (C5):** when the confirm state exits back to idle (cancel click OR auto-revert), focus moves to the re-mounted idle trigger via a ref + effect on the confirm→idle transition, **guarded**: only if `document.activeElement` is inside the confirm row's container at that moment (container ref `.contains()` check) — an auto-revert firing while the user is focused elsewhere on the page MUST NOT steal focus.
  - **Submit-outcome paths (exhaustive; R3 review):** focus management applies ONLY to cancel and auto-revert. All submit outcomes get NO focus move: (a) **pending** — controls stay mounted and disabled, focus stays where it is; (b) **failure/refusal where the confirm row stays mounted** (e.g. write-fail message alongside the row) — focus stays on the still-mounted control; the error is announced via its existing `role="alert"`; (c) **failure/refusal or success where the control is replaced by a non-interactive status/message element** (e.g. Revoke lockout/self-revoke `<p role="alert">` blocks, `RevokeRowButton.tsx:228-255` and `:302-330`; Rotate's result state) — focus loss is an ACCEPTED residual, announced via the existing `role="alert"`/`role="status"` element (same acceptance class as F3's group-unmount residual). No per-surface deviations: every F4 surface follows exactly this matrix.
  - `ReSyncButton` (R8) already conforms on open (`keepCurrentRef`, `:76-79`); its close path keeps current behavior (panel dismissal focuses nothing new — focus sits on the safe button which stays mounted; no change needed).

## 7. Exceptions (deliberately unguarded / untouched)

| Control | Why exempt |
|---------|-----------|
| `UndoChangeButton.tsx:50` single Undo | Is itself a reversal; recoverable (change can re-apply on next sync). Quiet/secondary treatment already differentiates (`:44-48`). |
| `DataQualityWarningControls.tsx:90` Ignore | Un-ignore exists (`:104`, `UnignoreButton.tsx:57`) — fully reversible pair. |
| `PendingPanelDiscardButtons.tsx:73` Defer until modified | Self-heals on next sheet edit. |
| `StagedReviewCard.tsx:596` Retry on next sync / `:607` Wait for next edit | Discards re-stage on next sync/edit. |
| `PerShowAlertResolveButton.tsx:70` | Alert resolution is bookkeeping; alert re-fires if condition persists. |
| `UnignoreButton.tsx:57` | Restorative. |
| `UseRawControl.tsx` radio rows | Ratified neutral escape-hatch design (docstring `UseRawControl.tsx:26-29`); reversible toggle. Do not restyle. |
| `MaintenanceResetButtons.tsx` Reseed fixtures (`:333`) | Additive. |
| Idle triggers of existing two-taps (e.g. Revoke `:211`, rotate idle `:149`) | Recipe governs confirm-go only; triggers keep current styling. |

## 8. Structural meta-test

New `tests/styles/_metaDestructiveConfirm.test.ts`, registry-style (same discipline as `tests/styles/_metaBgAccentInventory.test.ts`). Scope honesty (R3 review): it fails-by-default for unregistered RECIPE occurrences — a future destructive control that never adopts the recipe is outside its reach; catching that is the review-time contract (§3's definition + DESIGN.md §9 prose), the same limitation class as the bg-accent registry.

- **Scan unit + identity (precise):** walk `components/**` and `app/**` (`.tsx`, comments stripped — reuse `tests/styles/_classScanUtils.ts` `walk`/`stripComments`/`tokensOf`). A **hit** is one STATIC string literal in source whose token-set contains BOTH `bg-warning-text` AND `text-warning-bg` (the recipe signature). Identity is per static literal, NOT per runtime element or testid — a ternary with the recipe in both branches is two hits; a template with one recipe literal rendered N times is one hit. (Same identity model as `tests/styles/_metaBgAccentInventory.test.ts`.)
- **Registry:** array of rows `{ file, note, kind: "morph" | "panel" }` — ONE ROW PER STATIC RECIPE LITERAL (not per file); the assertion counts per file: hits in each file must equal that file's registry-row count, and every file with ≥1 hit must be registered. `note` is documentation (nearest testid or state name), never matched against source. Hits in an unregistered file → fail (`UNREGISTERED DESTRUCTIVE CONFIRM`). Registered file with fewer hits than rows → fail (`STALE ROW`). More hits than rows → fail (`UNREGISTERED OCCURRENCE`).
- **Recipe completeness:** each hit's token set must include `font-semibold` and `hover:opacity-90`, and must not include `bg-accent`, `bg-surface`, `bg-bg`, or any other `hover:bg-*` token (C1).
- **Focus proof is behavioral, not static.** The meta-test does NOT attempt a static focus-ref assertion (brittle against refactors and component indirection — R1 review). C3/C5 are proven exclusively by the per-component jsdom tests enumerated in §10 (F1, F3, F4, plus the shipped strip/ReSync focus tests). The `kind` field documents which contract applies; it drives no scan logic.
- **Expected initial registry:** one row per hit. Panels (10 files × 1 hit): MaintenanceReset (`validation-reset-confirm`), Cleanup (`cleanup-abandoned-finalize-confirm-yes`), ReapStale (`reap-stale-sessions-confirm-yes`), strip Undo-all R1, Rotate R2, ResetEpoch R3, PickerReset R4, Revoke R5, ResolveAlert R6, ReSync R8. Morphs: Archive R7 (2 hits — compact/full ternary branches), G1–G4 (1 hit each — armed-state literal). Row counts here are ILLUSTRATIVE (≈16); the authoritative count is the fails-by-default walk's fail-first output at implementation time — a literal split during implementation adds a row, never loosens the matcher.

## 9. DESIGN.md addition

New subsection under the existing button/action guidance: **"Destructive actions"** — states C1–C6 in prose, names the recipe tokens, the guard-tier ladder (typed-confirm for environment wipes → two-tap/panel for irreversible ops → unguarded for reversible ops with a recovery path), and cross-references the meta-test as the enforcement point. No token table changes (no new tokens; warning-family figures already published). No §1.1/§1.2 contrast-figure edits → no `design-figure-parity` impact (its scan is scoped to §1.1/§1.2 figures).

## 10. Testing

- **Per-guard jsdom tests (G1–G4):** first activation does NOT call the handler/fetch and morphs the label + classes; second activation calls it exactly once; auto-revert restores idle after 4s (fake timers); unmount clears the timer.
- **G4-specific state-model tests:** arming X then tapping Y → Y armed, X disarmed, timer restarted (advancing 4s from Y's arm disarms Y; advancing only the REMAINDER of X's original window does NOT disarm Y — stale-timer proof); entering `running` clears `armedCode`; entering `error` clears `armedCode`.
- **Restyle tests (R1–R8):** confirm-go carries `bg-warning-text`+`text-warning-bg`+`font-semibold`+`hover:opacity-90` and NO `bg-accent`/`bg-surface`/other `hover:bg-*` — asserted on the rendered element by testid (existing test files extended; e.g. `RecentAutoAppliedStrip.test.tsx` TRACK-style class assertions). Cancel/safe controls assert absence of recipe tokens.
- **F4:** for each of the five panel surfaces: entering the confirm state moves `document.activeElement` to the cancel button (`waitFor`); cancel click returns focus to the re-mounted idle trigger; auto-revert with focus INSIDE the confirm row returns focus to the re-mounted idle trigger (fake timers); auto-revert with focus OUTSIDE the confirm row does NOT move focus (fake timers + focus planted on an external element).
- **F1:** on popover open, `document.activeElement` is the cancel button (`waitFor` — async focus rule per project memory).
- **F2:** mock `undoFromDashboardAction` to fail for a subset (`{ok:false, code:"UNDO_SUPERSEDED"}`); after confirm, the aggregate line renders with counts derived from the mocked failure set and `role="alert"`; zero failures → no line; re-opening the confirm clears it; a subsequent zero-failure run clears it; outcome persists across collapse → re-expand of the group disclosure.
- **F3:** (a) successful bulk undo completes with focus inside the panel → `document.activeElement` is the group toggle; (b) "Keep changes" cancel click → focus on the group toggle; (c) focus planted OUTSIDE the group container when completion lands → focus NOT moved; (d) collapse-during-pending: collapse the group while the undo loop is in flight → completion does not throw, does not steal focus, and the aggregate alert renders on re-expand.
- **Meta-test:** fails-by-default proof — a fixture-injected unregistered recipe button fails the walk (negative proof performed once during development, like the bg-accent registry's dual proof).
- Anti-tautology: expected classes asserted on the element fetched by its own testid, never a container; counts in F2 derived from the mocked failure set, not hardcoded to the fixture length.

## 11. Out of scope

- FLOW4-1 mobile parity (separate cluster), FLOW4-2/3/7 (badge affordance/glyph/aria niceties), DQIGNORE-6 (spatial placement), any new red/danger token, native `<dialog>`/modal work, shared ConfirmTwoTap component extraction, trigger-button restyling, PSAT-1.

## 12. Close-outs

- DEFERRED.md: FLOW4-4 ✅, FLOW4-5 ✅, FLOW4-6 ✅ (this PR); OVR-1..7 → `✅ STALE — surface removed (PR #382)`.
- BACKLOG.md: `BL-FLOW4-BULK-UNDO-ERROR-SURFACE` ✅, `BL-FLOW4-CONFIRM-DANGER-STYLE` ✅ shipped.
- New DEFERRED entries only if the impeccable dual-gate produces deferrable P2+.

## 13. Watchpoints / do-not-relitigate

- **Inverted amber, not red:** ratified user decision (2026-07-16, Q2). DESIGN.md red scoping is deliberately unchanged; do not propose a `--color-danger` button token.
- **Irreversible-only guard tier:** ratified (Q1). Do not propose guards on §7 exceptions.
- **No shared component:** ratified (Q3). Do not propose ConfirmTwoTap extraction.
- **Two-tap morph double-activation:** a second Enter/tap on a morphed button fires the action — accepted, established idiom (Archive, `ArchiveShowButton.tsx:42`, shipped; G1–G4 adopt it); auto-revert + label change are the mitigations. The trigger→panel surfaces don't share this vector once F4 lands (focus moves to cancel). Not a finding.
- **F2 fixed copy without §12.4 code:** same precedent as the strip's fixed infra sentence (`RecentAutoAppliedStrip.tsx:363-374`); aggregate copy carries no code, so no catalog/lockstep churn. Not an invariant-5 violation (no raw code rendered).
- **UseRawControl neutrality:** ratified design (its own docstring); out of scope.
