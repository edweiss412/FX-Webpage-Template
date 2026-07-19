# Tasks 7–8 — Re-sync relocation (merged) + status line collapse

> **This is the highest-risk part of the change and expands the blast radius well beyond "header polish"** (spec §14.5). It touches a stateful component with a destructive-adjacent confirm flow and WCAG-motivated focus management, and it edits `OverviewSection`. If the pipeline must shed scope, this is the separable piece — deltas 1–6 stand alone without it. **Flag rather than silently drop: the amendment is ratified** (Watchpoint 3).

---

## Task 7 (MERGED): `ReSyncButton` restructure + strip mount + Overview removal (§4.3, §6.7)

> ### Why this is ONE task and not two
>
> The pre-review plan split this into "restructure the component" (7) and "mount it in the strip, remove it from Overview" (8). That split cannot satisfy Rule 1. After the restructure alone:
>
> - `ReSyncButton` returns a **fragment** with `absolute inset-x-0 top-full` panels while still mounted inside Overview's `flex flex-col gap-3`. Its panels anchor to the nearest positioned ancestor — the modal panel — and render below the entire modal. The product is visibly broken at that commit.
> - `accent-button-atom.test.ts` sub-scan 2 **hard-fails** (drift D1) unless its registry row goes in the same commit.
> - `admin-parse-panel.spec.ts:269-274` clicks `admin-resync-button` **scoped inside `overview-sheet-sync`** (drift D4) — the locator survives the restructure but dies the moment the button leaves Overview.
> - `_uiLabelExceptions.ts:180` pins `"Re-sync from Drive"` (drift D2), which the restructure changes.
>
> There is no ordering of the two halves that leaves both commits green **and** the product coherent. **Merged, per the coordinator's rule: "if two changes genuinely cannot be split without a red intermediate, merge them into ONE task and say why."**

**Failure modes caught:** (1) Treating the accent→ghost swap as style-only. `AccentButton` supplies semantics through props; a raw `<button>` silently drops `disabled={pending}` and `aria-busy` unless each is restated — so the trigger looks right, passes T-RESYNC-GHOST and T-NO-ORANGE, **and is still clickable mid-flight, able to double-POST.** (2) Only one or two of the three result surfaces relocated, leaving the third in-flow and reflowing the band. (3) The amendment half-done — the control duplicated (strip *and* Overview), the outcome §4.3 explicitly rejected. (4) An archived show getting a Re-sync trigger and reaching `/api/admin/sync`. (5) The guidance copy deleted along with the button.

**Files:**
- Modify: `components/admin/ReSyncButton.tsx` (root `:136-137`; trigger `:138-150`; error `:152-159`; shrink `:162`; success `:204`)
- Modify: `components/admin/showpage/StatusStrip.tsx` (insertion before `strip-copy-link` at `:259`)
- Modify: `components/admin/showpage/OverviewSection.tsx` (`:126-138`)
- Modify: `tests/components/ReSyncButton.test.tsx`, `tests/components/admin/showpage/overviewSection.test.tsx`, `statusStrip.test.tsx`, `pageTransitions.test.tsx`
- Modify: `tests/styles/accent-button-atom.test.ts` (**D1**), `tests/help/_uiLabelExceptions.ts` + `app/help/admin/per-show-panel/page.mdx` (**D2**), `tests/e2e/admin-parse-panel.spec.ts` (**D4**)
- Verify: `tests/styles/_metaDestructiveConfirm.test.ts:79` (**D3**)
- Modify: `tests/e2e/published-review-modal.layout.spec.ts` (adds the overlay/width/order/orange pins)

**NO `surface` mode prop.** An earlier spec draft added `surface?: "flow" | "overlay"`. Verified: `<ReSyncButton>` has exactly TWO render sites, `OverviewSection.tsx:133` and `:136`, and §4.3 removes BOTH. After this change the component has ONE consumer — the strip — so a `"flow"` arm is dead on arrival: unreachable API, an untestable branch, speculative generality of exactly the kind §6.5 deletes elsewhere in this same spec.

### Real-browser assertions owned by this task — every one genuinely RED pre-change

| Assertion | Pre-change failure |
| --- | --- |
| **T-OVERLAY** — both overlays anchor to the BAND (geometry) and the focused confirm control is topmost | **RED:** no absolute panels exist; the shrink confirm renders in-flow inside Overview, so its edges cannot match the band's |
| **T-OVERLAY-BOUNDS** — capped height + internal scroll on ALL THREE branches; band/body do not reflow | **RED:** in-flow panels have no height cap and *do* reflow their column |
| **T-RESYNC-WIDTH** — trigger width identical idle vs pending | **RED:** today's labels are `"Re-sync from Drive"` / `"Syncing…"` (`:150`) with no width reservation — the widths genuinely differ |
| **T-RESYNC-FOCUS-ORDER** — closed and open states | **RED:** Re-sync is not in the strip at all, so the closed-state order (toggle → Re-sync → copy) cannot hold |
| **T-NO-ORANGE** — exact accent-resolving set per §4.2's three states | **RED:** the trigger is an `AccentButton` today, so the `!archived` sets contain a third element and the `archived` set is non-empty |
| **T-CONTRAST (ghost label)** | **RED:** the ghost trigger does not exist |
| **T-TAP** — Re-sync trigger + both dismiss controls ≥44px | **RED:** the dismiss controls do not exist; the ghost trigger does not exist |

- [ ] **Step 1: failing tests (jsdom) — component contract.**
  - **T-RESYNC-NO-WRAPPER:** the root is a **FRAGMENT**, not `<div className="flex flex-col gap-3">`. Assert no intervening wrapper between the trigger and its mount point. If the wrapper survives, the strip gains a stray column as its flex item — `items-center` and the row gap apply to the wrapper, not the button, and the absolute panels anchor to an unintended subtree, **while every focus and order test still passes**.
  - **T-RESYNC-SHRINK:** the confirm renders in the overlay; focus lands on `"Keep current version"` (`:83-85`); focus restores to the trigger on cancel (`:78-82`); it has **NO neutral dismiss** and does **NOT** close on outside click (Watchpoint 9).
  - **T-RESYNC-ERROR:** renders in the OVERLAY, shows catalog copy from `lib/messages/lookup.ts`, **never a raw code**, and is dismissable without re-running the mutation — the dismiss clears the overlay and returns focus to the trigger. **Assert CONTAINMENT, not equality:** the branch legitimately renders `<ErrorExplainer>` PLUS `<HelpAffordance>` (`:158-159`), so an equality assertion is false-red and the likely "fix" is deleting the help affordance. Assert the text CONTAINS the catalog copy AND does NOT contain the raw code string.
  - **T-RESYNC-SUCCESS:** renders in the overlay, HAS a dismiss that clears it and returns focus to the trigger, and renders `summarizeResult` copy rather than a raw `outcome` — assert an unknown outcome falls back to `"Sync complete."` and that no raw token (e.g. `revision_race`, `asset_recovery`) appears. `:204` is a separate branch from both error and shrink; T-RESYNC-SHRINK and T-OVERLAY both pass while this is broken.
  - **Ghost trigger semantics — assert each row individually**, because "it looks right" is the failure mode:

    | Today (via `AccentButton`) | On the ghost trigger |
    | --- | --- |
    | `ref={triggerRef}` (`:139`) | **KEEP** — focus restoration on confirm-cancel depends on it |
    | `disabled={pending}` (`:141`) | **KEEP** — otherwise a pending Re-sync stays keyboard-activatable and can double-POST |
    | `aria-busy={pending}` (`:142`) | **KEEP** — the only in-place signal that work is running |
    | `data-testid="admin-resync-button"` (`:140`) | **KEEP** — existing tests query it |
    | `minWidthTap` (`:147`) | **REPLACE** with explicit `min-h-tap-min`/`min-w-tap-min` |
    | `ringOffset="bg"` (`:148`) | **REPLACE** with a ring resolved against the BAND surface |
    | `fontWeight="medium"` (`:143`) | Superseded by the ghost type scale |
    | `inline` (`:144`) | Superseded by the strip row layout |
    | `selfStart` (`:145`) | **DROP** — correct for Overview's `flex-col`, wrong in a centered row |
  - **T-RESYNC-MOVED:** the strip renders a Re-sync trigger AND `OverviewSection` renders NO Re-sync button. Assert both halves — the negative catches a duplicate.
  - **T-RESYNC-ARCHIVED:** `archived: true` → NO trigger in the strip; Overview keeps the `"Re-sync is paused while this show is archived."` notice.
  - **T-RESYNC-GUIDANCE:** `hasActionableWarnings: true` → `CorrectionLoopCallout` still renders its copy in Overview, with **no child button** (its `children` slot is already optional — `CorrectionLoopCallout.tsx:43`).
- [ ] **Step 2: failing tests (Playwright)** — write all seven real-browser assertions from the table above now, before implementing.
  - **T-OVERLAY:** with the publish popover already open, trigger a `shrink_held` Re-sync. Assert `document.activeElement` is "Keep current version" **AND** that `elementFromPoint` at that control's center resolves to the control itself (or a descendant) — genuinely topmost, not merely focusable. **A test asserting only `toHaveFocus()` passes while the control is fully covered.** Also assert both overlays anchor to the BAND by **GEOMETRY, not `offsetParent`** — left/right edges match the band's within 1px, top matches the band's bottom within 1px. `offsetParent` is deliberately NOT the assertion: it is sensitive to transforms, hidden states and browser detail, so it false-reds on correct placement and couples the test to layout internals.
  - **T-OVERLAY-BOUNDS:** capped height + internal scroll for **ALL THREE** branches. **The ERROR branch is likeliest to overflow** — it renders `ErrorExplainer` PLUS `HelpAffordance` (`:158-159`). Assert band and body do not reflow when any opens.
  - **T-RESYNC-WIDTH:** `getBoundingClientRect().width` identical idle vs pending.
  - **T-RESYNC-FOCUS-ORDER — two states:** *closed:* sheet link → alert pill → close → toggle → Re-sync → copy. *open, all three branches:* shrink → Re-sync → "Keep current version" → "Apply reduced version" → copy; error → Re-sync → "Dismiss sync error" → copy; success → Re-sync → "Dismiss sync result" → copy. **Overlay controls always sit BETWEEN Re-sync and Copy.**
  - **T-NO-ORANGE — enumerate, do not assert absence.** A `bg-accent` absence check is doubly wrong: it MISSES the live dot (`bg-status-live`, a different class resolving to the same hue via `globals.css:89`) and cannot catch a future third orange. Discovery is **by COMPUTED COLOR** (§4.2): resolve `--color-accent` once and normalize to `rgb()`; walk every element in the header region (header band + subheader band); an element is accent-resolving if computed `backgroundColor` **or** `borderColor` equals the reference; **exclude transient state styles** (run with nothing focused, no pointer over the region — `focus-visible` rings and `:hover` are legitimately accent and out of scope; `color` is out of scope, this is about FILLS and BORDERS); assert the set matches EXACTLY for all three §4.2 states:

    | State | Expected set |
    | --- | --- |
    | `!archived`, `isLive: true` | {publish toggle, live dot} |
    | `!archived`, `isLive: false` | {publish toggle} |
    | `archived: true` | **{} — empty** |

    **The archived row is the strongest** — the only state that proves the assertion is measuring rather than matching a hardcoded expectation. **T-RESYNC-GHOST folds in here.**
  - **T-CONTRAST (ghost label)** ≥4.5:1 both themes, sampled per §7.2 (walk up for the painting backdrop; idle/unfocused/unhovered `color`; no border ratio).
  - **T-TAP:** ghost trigger and both dismiss controls ≥44px via `getBoundingClientRect()` (real boxes — unlike the pill, these do not use a pseudo-element).
- [ ] **Step 3: run — FAIL** across the board, for the reasons tabulated.
- [ ] **Step 4: implement the fragment root + ghost trigger.** A fragment generates no box, so the absolute panels resolve their containing block to the nearest positioned ancestor: **the band** (`relative`, Task 1), not the strip root. Ghost per the mock: `inline-flex items-center gap-1.5 rounded-sm px-2 text-[13px] font-semibold text-text-subtle`, hover `text-text`/`bg-surface-sunken`, standard focus ring, plus `min-h-tap-min` (**the mock's ~30px box is below the 44px floor** — use `min-h-tap-min`, or the `before:-inset-y-*` idiom if the visible height must stay 30px). Idle label `"Re-sync"`, pending `"Syncing…"`, with the widest label's width reserved so the swap cannot reflow the strip and move Copy under the cursor.
- [ ] **Step 5: relocate ALL THREE result surfaces** to `absolute inset-x-0 top-full z-50`.
  - **`z-50` vs the publish popover's `z-40`** (`PublishedToggle.tsx:59`) is a rule, not a default. An unspecified `z-*` can leave the shrink confirm UNDERNEATH the popover while focus sits on "Keep current version" — reachable, obscured, defeating the WCAG 2.4.3 intent.
  - `max-h-[min(50vh,20rem)]` + `overflow-y-auto`, `shadow-tile`, band `bg-surface`. The panels reserve no layout space by design; the height cap is what keeps that from becoming an obscured-content bug.
  - **Do not add a mutual-exclusion guard.** Already guaranteed: `post()` clears `errorCode` and `successMessage` unconditionally at its start (`:92-93`); the success branch clears `heldShrink` (`:118`); the shrink branch is the only one that sets it; `heldShrink` is *deliberately* not cleared at post start (`:88-89`) so the confirm survives the accept re-POST. Preserve the existing clearing order. (Adversarial round 14 proposed a guard on the theory that a stale success could coexist with a shrink confirm; verified against `:92-93` — it cannot.)
- [ ] **Step 6: add dismiss controls to the error and success branches ONLY** (Watchpoint 9/10). Neither self-clears — `successMessage` is set at `:121` and cleared only at `:93`; there is no timer, and `router.refresh()` (`:122`) refreshes server data without touching local state. **Esc is NOT the mechanism** — the shell binds Esc to closing the whole modal.
  - **This is a RESTRUCTURE of existing markup.** Today `role="alert"` sits on the error branch's CONTAINER (`:154`), which today holds only non-focusable content. Dropping a dismiss button there puts a focusable control inside a live region, so the role must MOVE to the message node as part of adding the button:
    ```tsx
    <div role="group" aria-labelledby={msgId} className="absolute inset-x-0 top-full z-50 …">
      <p id={msgId} role="alert">{catalogCopy}</p>
      <button aria-label="Dismiss sync error">…</button>
    </div>
    ```
    `role="group"` is **required, not optional** — `aria-labelledby` on a plain `<div>` gives a name with no role to attach it to, so assistive tech is not obliged to announce it as a named region.
  - Names are branch-specific: `"Dismiss sync error"` / `"Dismiss sync result"`, **never a bare "Dismiss"**. Each is a real control: `min-h-tap-min`/`min-w-tap-min`, visible `focus-visible` ring.
- [ ] **Step 7: mount in the strip** as a **bare element**, immediately before `strip-copy-link`:
  ```tsx
  {!archived ? (
    <ReSyncButton slug={slug} />
  ) : null}
  {copyUrl != null ? (<div data-testid="strip-copy-link" className="ml-auto shrink-0">…</div>) : null}
  ```
  - **NO wrapper div.** A `<div data-testid="strip-resync">` would make the WRAPPER the flex item — breaking row alignment, the row gap, and the full-band width of the absolute panels — **while every focus and order test still passed**. The trigger already carries `data-testid="admin-resync-button"` (`:140`); query that.
  - **DOM order is normative, not just visual.** Copy is right-flushed by `ml-auto`, so a DOM order of Copy-then-Re-sync would still *look* correct while producing the tab order toggle → Copy → Re-sync → confirm controls, breaking the confirm-proximity contract (§10). This is an accessibility requirement on the component contract.
  - **Counted form is mandatory:** `{!archived ? (` is what the lexical scanner sees. `{archived ? null : …}` renders identically but is **INVISIBLE to the pin** (§9). Never reshape JSX to satisfy the counter — write the counted form deliberately.
- [ ] **Step 8: reshape `OverviewSection.tsx:126-137`** to §6.7's exact post-move shape:
  ```tsx
  <div data-testid="overview-sheet-sync" className="flex flex-col gap-3">
    {archived ? (
      <span data-testid="admin-show-resync-archived" …>Re-sync is paused while this show is archived.</span>
    ) : hasActionableWarnings ? (
      <CorrectionLoopCallout mode="resync" />   {/* no child button */}
    ) : null}                                    {/* ← third arm empties */}
    {openSheetHref ? (/* unchanged "Open sheet" link — :138 */) : null}
  </div>
  ```
  Three things this pins: (1) the third arm becomes `null`, not an empty element; (2) **the `overview-sheet-sync` wrapper STAYS** — it still hosts the "Open sheet" link at `:138`, and deleting it because its first child can now be `null` would silently drop `openSheetHref`; (3) no Re-sync button remains in any arm.
- [ ] **Step 9: land all four registry drifts IN THIS COMMIT.**
  - **D1 —** delete the `"ReSyncButton.tsx"` row from `accent-button-atom.test.ts:52`'s `MIGRATED_FILES`, with a comment recording the de-migration rationale (accent→ghost demotion, §6.7, delta 4's orange budget). **Do not weaken sub-scan 2.**
  - **D2 —** update `app/help/admin/per-show-panel/page.mdx` copy and the `_uiLabelExceptions.ts:180-184` row together. (That row's comment cites `ReSyncButton.tsx:99`; the literal actually lives at `:150` — correct the note.)
  - **D3 —** run `pnpm vitest run tests/styles/_metaDestructiveConfirm.test.ts`. **Keep the row**; adjust only if the scan's structural assumption breaks.
  - **D4 —** rescope `admin-parse-panel.spec.ts:269-274` from `overview-sheet-sync` to the strip band. **REWRITTEN, not retired** — the round-trip-and-render-catalog-copy intent survives, including its deliberate non-assertion of a specific status code.
- [ ] **Step 10: run the scanner; update the literals in this commit.** Expected: `StatusStrip.tsx` = **7** (final target — `archived` / `control-divider` / `live` / `sync` / `edited` / `re-sync` / `copy-link`), `OverviewSection.tsx` = **4, UNCHANGED — do NOT edit its literal.** The counter matches the ternary HEAD line and chained arms are explicitly not counted separately (`pageTransitions.test.tsx:102-117`); Overview's head is `{archived ? (` at `:127` and the move deletes the BUTTON from that ternary's arms, not the head. **Verify by running the scan, never by reasoning.**
- [ ] **Step 11: FULL SUITE GREEN.**
  ```
  pnpm test && pnpm typecheck && pnpm lint && pnpm format:check
  pnpm playwright test tests/e2e/published-review-modal.layout.spec.ts tests/e2e/admin-parse-panel.spec.ts
  ```
- [ ] **Step 12: commit** `feat(admin): move Re-sync into the control strip as a ghost trigger with overlay results`

---

## Task 8: status line collapses to one row (§4.5, §7)

**Failure mode caught:** the headline delta of §4.5 is silently not implemented — an implementer restyles colors and order but leaves the `flex-col` stack at `StatusStrip.tsx:235`. **Every other status test (null-edited, error-bucket) passes against the stacked layout.** Second: the collapse leaves an orphan separator when `editedRel` is null.

**Files:**
- Modify: `components/admin/showpage/StatusStrip.tsx` (`:227-242`)
- Modify: `tests/components/admin/showpage/statusStrip.test.tsx`, `pageTransitions.test.tsx`
- Modify: `tests/e2e/published-review-modal.layout.spec.ts` (T-STATUS-INLINE)

**Real-browser assertion owned by this task — T-STATUS-INLINE, genuinely RED:** on the pre-change tree the sync/edited block is a `flex-col` stack (`:235`), so the two text nodes have **different** `getBoundingClientRect().top` values. The assertion fails by a full line-height, not a rounding margin.

- [ ] **Step 1: failing tests (jsdom):**
  - **T-STATUS-INLINE-NO-EDITED:** `editedRel` null → one line, **no trailing bullet**, no "Edited …". §4.5's main new failure mode. **RED:** today the null-edited case renders a stacked container whose structural class assertion differs.
  - **T-STATUS-ERROR-BUCKET:** non-`ok` status → the health label + a bucket-colored dot, **NOT** `"Synced …"`. The mock's green "Synced just now" is one bucket of several (`:128-133`); hardcoding it is the defect. **Declared partly-red:** the bucket behavior exists today, so this is a keep-green guard against the collapse hardcoding "Synced"; its red comes from the shared single-row structural clause.
  - `lastSyncedAt === null` → the entire status element is omitted (`:227`). The "never" sentinel must not render.
- [ ] **Step 2: failing test (Playwright) — T-STATUS-INLINE:** with `editedRel` PRESENT, "Synced" and "Edited" share a row — equal `getBoundingClientRect().top` within 2px — and a 3px separator renders between them.
- [ ] **Step 3: run — FAIL.**
- [ ] **Step 4: implement.** Collapse to one line: bucket-toned dot · `Synced {rel}` · 3px `aria-hidden` bullet · `Edited {rel}`. `inline-flex items-center` guarantees the baseline-consistent single row (§8). The bullet renders only when `editedRel != null`.
- [ ] **Step 5: run the scanner.** `sync` and `edited` survive as separate heads; expect `StatusStrip.tsx` = **7**, unchanged from Task 7. Verify by running; if it moved, investigate before editing the literal.
- [ ] **Step 6: FULL SUITE GREEN**, including the Playwright suite.
- [ ] **Step 7: commit** `feat(admin): collapse the strip sync/edited stack to one line`
