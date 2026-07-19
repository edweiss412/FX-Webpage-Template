# Tasks 7–9 — Re-sync relocation cluster + status line collapse

> **This cluster is the highest-risk part of the change and expands the blast radius well beyond "header polish"** (spec §14.5). It touches a stateful component with a destructive-adjacent confirm flow and WCAG-motivated focus management, and it edits `OverviewSection`. Per §11's scope note it is its own task cluster with its own tests, never a rider on the header tasks. If the pipeline must shed scope, this is the separable piece — deltas 1–6 stand alone without it. **Flag rather than silently drop: the amendment is ratified** (Watchpoint 3).

---

## Task 7: `ReSyncButton` restructure — ghost trigger + overlay result surfaces (§6.7)

**Failure mode caught:** treating the accent→ghost swap as style-only. `AccentButton` supplies semantics through props; replacing it with a raw `<button>` silently drops `disabled={pending}` and `aria-busy` unless each is restated — so the trigger looks right, passes T-RESYNC-GHOST and T-NO-ORANGE, **and is still clickable mid-flight, able to double-POST.** Second failure mode: only one or two of the three result surfaces are relocated, leaving the third rendering in-flow and reflowing the band.

**Files:**
- Modify: `components/admin/ReSyncButton.tsx` (root `:136-137`; trigger `:138-150`; error `:152-159`; shrink confirm `:162`; success `:204`)
- Modify: `tests/components/ReSyncButton.test.tsx`
- Modify: `tests/styles/accent-button-atom.test.ts` (**drift D1** — delete the `"ReSyncButton.tsx"` row from `MIGRATED_FILES:52`)
- Verify: `tests/styles/_metaDestructiveConfirm.test.ts:79` (**drift D3** — row must still resolve)

**NO `surface` mode prop.** An earlier spec draft added `surface?: "flow" | "overlay"`. Verified: `<ReSyncButton>` has exactly TWO render sites, `OverviewSection.tsx:133` and `:136`, and §4.3 removes BOTH. After this change the component has ONE consumer — the strip — so a `"flow"` arm is dead on arrival: unreachable API, an untestable branch, speculative generality of exactly the kind §6.5 deletes elsewhere in this same spec. The component is rebuilt for its single remaining context; everything below is simply what `ReSyncButton` IS afterward, not one mode of two.

- [ ] **Step 1: failing tests** in `tests/components/ReSyncButton.test.tsx`:
  - **T-RESYNC-NO-WRAPPER:** the component's root is a **FRAGMENT**, not `<div className="flex flex-col gap-3">`. Assert the trigger has no intervening wrapper element between it and its mount point. If the wrapper survives, the strip gains a stray column as its flex item — `items-center` and the row gap apply to the wrapper, not the button, and the absolute panels anchor to an unintended subtree, **while every focus and order test still passes**.
  - **T-RESYNC-SHRINK:** shrink-hold confirm renders in the overlay; focus lands on `"Keep current version"` (`:83-85`); focus restores to the trigger on cancel (`:78-82`); it has **NO neutral dismiss** and does **NOT** close on outside click (Watchpoint 9).
  - **T-RESYNC-ERROR:** a failing Re-sync renders in the OVERLAY (not in-flow), shows catalog copy from `lib/messages/lookup.ts`, **never a raw code**, and is dismissable without re-running the mutation — the dismiss control clears the overlay and returns focus to the trigger. **Assert CONTAINMENT, not equality:** the branch legitimately renders `<ErrorExplainer>` PLUS `<HelpAffordance>` (`:158-159`), so an equality assertion is false-red and the likely "fix" is deleting the help affordance. Assert the rendered text CONTAINS the catalog copy AND does NOT contain the raw code string.
  - **T-RESYNC-SUCCESS:** success message renders in the overlay, HAS a dismiss control that clears it and returns focus to the trigger, and renders `summarizeResult` copy rather than a raw `outcome` string — assert an unknown/unmapped outcome falls back to `"Sync complete."` and that no raw token (e.g. `revision_race`, `asset_recovery`) appears. `:204` is a separate branch from both error and shrink; T-RESYNC-SHRINK and T-OVERLAY both pass while this is broken.
  - **Ghost trigger semantics table** — assert each row individually, because "it looks right" is the failure mode:

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
  - **Label + width:** idle label shortens to `"Re-sync"`; pending stays `"Syncing…"`. Assert the reserved-min-width class is present (geometry is measured in Task 11's T-RESYNC-WIDTH).
- [ ] **Step 2: run — FAIL.**
- [ ] **Step 3: implement the fragment root + ghost trigger.** Return a fragment — no box — so the absolutely-positioned panels resolve their containing block to the nearest positioned ancestor: **the band** (`relative`, Task 1), not the strip root. Ghost per the mock: `inline-flex items-center gap-1.5 rounded-sm px-2 text-[13px] font-semibold text-text-subtle`, hover `text-text`/`bg-surface-sunken`, standard focus ring, plus `min-h-tap-min` (**the mock's ~30px box is below the 44px floor** — use `min-h-tap-min`, or the `before:-inset-y-*` hit-area idiom if the visible height must stay 30px).
- [ ] **Step 4: relocate ALL THREE result surfaces** to `absolute inset-x-0 top-full z-50`. Missing one leaves it in-flow, reflowing the band.
  - **`z-50` vs the publish popover's `z-40`** (`PublishedToggle.tsx:59`) is a rule, not a default. "They may overlap, focus must be reachable" is NOT sufficient: an unspecified `z-*` can leave the shrink-hold confirm rendered UNDERNEATH the popover while focus sits on "Keep current version" — technically reachable, visually obscured, defeating the WCAG 2.4.3 intent the focus management exists for. **A focused control must never be occluded.**
  - `max-h-[min(50vh,20rem)]` + `overflow-y-auto`, `shadow-tile`, band `bg-surface`. The panels reserve no layout space by design — an in-flow panel would reflow the band and shove the body down mid-action — so the height cap is what keeps that from becoming an obscured-content bug.
  - **Do not add a mutual-exclusion guard.** Already guaranteed: `post()` clears `errorCode` and `successMessage` unconditionally at its start (`:92-93`); the success branch clears `heldShrink` (`:118`); the shrink branch is the only one that sets it; `heldShrink` is *deliberately* not cleared at post start (`:88-89`) so the confirm survives the accept re-POST. Preserve the existing clearing order. (Adversarial round 14 proposed a guard on the theory that a stale success could coexist with a shrink confirm; verified against `:92-93` — it cannot.)
- [ ] **Step 5: add dismiss controls to the error and success branches ONLY.** Neither self-clears — `successMessage` is set at `:121` and cleared only at `:93`, the start of the *next* POST; there is no timer, and `router.refresh()` (`:122`) refreshes server data without touching local state. Tolerable in-flow inside Overview's column; not tolerable floating over the rail. **Esc is NOT the mechanism** — the shell binds Esc to closing the whole modal.
  - **This is a RESTRUCTURE of existing markup, not a new attribute.** Today `role="alert"` sits on the error branch's CONTAINER (`:154`), which today holds only non-focusable content. Dropping a dismiss button into that container puts a focusable control inside a live region. The role must MOVE to the message node as part of adding the button:
    ```tsx
    <div role="group" aria-labelledby={msgId} className="absolute inset-x-0 top-full z-50 …">
      <p id={msgId} role="alert">{catalogCopy}</p>
      <button aria-label="Dismiss sync error">…</button>
    </div>
    ```
    `role="group"` is **required, not optional** — `aria-labelledby` on a plain `<div>` gives a name with no role to attach it to, so assistive tech is not obliged to announce it as a named region.
  - Names are branch-specific: `"Dismiss sync error"` / `"Dismiss sync result"`, **never a bare "Dismiss"**, which is ambiguous once two overlay types exist. Each dismiss control is a real interactive control: `min-h-tap-min`/`min-w-tap-min`, visible `focus-visible` ring matching its siblings.
- [ ] **Step 6: DRIFT D1 — de-migrate from the AccentButton registry.** `tests/styles/accent-button-atom.test.ts:52` lists `ReSyncButton.tsx` in `MIGRATED_FILES`, and sub-scan 2 (`:83-99`) asserts every listed file imports `AccentButton`. **This meta-test hard-fails after the demotion and the spec does not mention it.** Delete the row in this same commit with a comment recording the de-migration rationale (accent→ghost demotion, spec §6.7, delta 4's orange budget). Do not weaken the sub-scan.
- [ ] **Step 7: DRIFT D3 — re-verify `_metaDestructiveConfirm`.** Run `pnpm vitest run tests/styles/_metaDestructiveConfirm.test.ts`. Row `:79` registers `ReSyncButton.tsx` as a `"panel"`-kind confirm keyed `admin-resync-accept`. The panel is restructured; the row should still resolve. If it does not, adjust the row to match the new structure — **keep the registration**; the confirm is still a confirm.
- [ ] **Step 8: run** `pnpm vitest run tests/components/ReSyncButton.test.tsx tests/styles/` + `pnpm typecheck`.
- [ ] **Step 9: commit** `refactor(admin): rebuild ReSyncButton as a ghost trigger with overlay result surfaces`

**Known-red after this task:** `OverviewSection` still mounts `ReSyncButton`, now in overlay form inside a `flex-col` — visually wrong until Task 8 removes it. Task 8 lands immediately after; note the known-red in the commit body.

---

## Task 8: Re-sync mounts in the strip; Overview affordance removed (§4.3, §6.7)

**Failure mode caught:** the amendment is half-done — the control ends up duplicated (strip *and* Overview), the outcome §4.3 explicitly rejected. Second: an archived show gets a Re-sync trigger and can reach `/api/admin/sync`. Third: the guidance copy is deleted along with the button.

**Files:**
- Modify: `components/admin/showpage/StatusStrip.tsx` (insertion before `strip-copy-link` at `:259`)
- Modify: `components/admin/showpage/OverviewSection.tsx` (`:126-138`)
- Modify: `tests/components/admin/showpage/overviewSection.test.tsx`, `statusStrip.test.tsx`, `pageTransitions.test.tsx`
- Modify: `app/help/admin/per-show-panel/page.mdx` + `tests/help/_uiLabelExceptions.ts:180-184` (**drift D2**)

- [ ] **Step 1: failing tests:**
  - **T-RESYNC-MOVED:** the strip renders a Re-sync trigger AND `OverviewSection` renders NO Re-sync button. Assert both halves — the negative is what catches a duplicate.
  - **T-RESYNC-ARCHIVED:** `archived: true` → NO Re-sync trigger in the strip; Overview keeps the `"Re-sync is paused while this show is archived."` notice so the reason is not lost.
  - **T-RESYNC-GUIDANCE:** `hasActionableWarnings: true` → `CorrectionLoopCallout` still renders its copy in Overview, with **no child button**. Its `children` slot is already optional (`CorrectionLoopCallout.tsx:43`, `children ? … : null`), so it stays as guidance.
  - focus/DOM order: the Re-sync fragment sits **BEFORE** `strip-copy-link` in the DOM. **DOM order is normative, not just visual order** — Copy is right-flushed by `ml-auto`, so a DOM order of Copy-then-Re-sync would still *look* correct while producing the tab order toggle → Copy → Re-sync → confirm controls, breaking the confirm-proximity contract (§10). This is an accessibility requirement on the component contract, not merely something the Task 12 order test happens to check.
- [ ] **Step 2: run — FAIL.**
- [ ] **Step 3: mount in the strip** as a **bare element** in the strip root, immediately before `strip-copy-link`:
  ```tsx
  {!archived ? (
    <ReSyncButton slug={slug} />
  ) : null}
  {copyUrl != null ? (<div data-testid="strip-copy-link" className="ml-auto shrink-0">…</div>) : null}
  ```
  - **NO wrapper div.** A `<div data-testid="strip-resync">` would make the WRAPPER the flex item — breaking row alignment, the row gap, and the full-band width of the absolute panels — **while every focus and order test still passed**. The trigger already carries `data-testid="admin-resync-button"` (`ReSyncButton.tsx:140`); query that.
  - **Counted form is mandatory:** `{!archived ? (` is what the lexical scanner sees. `{archived ? null : …}` renders identically but is **INVISIBLE to the pin**, leaving this mount with no fails-by-default protection (§9). Never reshape JSX to satisfy the counter — write the counted form deliberately.
- [ ] **Step 4: reshape `OverviewSection.tsx:126-137`** to §6.7's exact post-move shape:
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
  Three things this pins, each a way the move can go wrong: (1) the third arm becomes `null`, not an empty element; (2) **the `overview-sheet-sync` wrapper STAYS** — it still hosts the "Open sheet" link at `:138`, and deleting it because its first child can now be `null` would silently drop `openSheetHref`; (3) no Re-sync button remains in any arm.
- [ ] **Step 5: DRIFT D2 — help-label registry.** `tests/help/_uiLabelExceptions.ts:180-184` pins the literal `"Re-sync from Drive"` for `app/help/admin/per-show-panel/page.mdx`. The idle label is now `"Re-sync"`. Update the MDX copy and the exception row **together, in this commit**. (Note: that row's own comment cites `ReSyncButton.tsx:99`; the literal actually lives at `:150` — correct the note while you are there.)
- [ ] **Step 6: run the scanner; update the literals in this commit.** Expected: `StatusStrip.tsx` = **7** (final target — `archived` / `control-divider` / `live` / `sync` / `edited` / `re-sync` / `copy-link`), `OverviewSection.tsx` = **4, UNCHANGED — do NOT edit its literal.** The counter matches the ternary HEAD line and chained arms are explicitly not counted separately (`pageTransitions.test.tsx:102-117`); Overview's head is `{archived ? (` at `:127` and the move deletes the BUTTON from that ternary's arms, not the head. **Verify by running the scan, never by reasoning.** Update `pageTransitions.test.tsx:124`'s literal AND its enumeration comment.
- [ ] **Step 7: run** `pnpm vitest run tests/components/admin/showpage/ tests/components/admin/ tests/help/` + `pnpm typecheck`.
- [ ] **Step 8: commit** `feat(admin): move Re-sync from the Overview rail into the control strip`

---

## Task 9: status line collapses to one row (§4.5, §7)

**Failure mode caught:** the headline delta of §4.5 is silently not implemented — an implementer restyles colors and order but leaves the `flex-col` stack at `StatusStrip.tsx:235`. **Every other status test (null-edited, error-bucket) passes against the stacked layout.** Second failure mode: the collapse leaves an orphan separator when `editedRel` is null.

**Files:**
- Modify: `components/admin/showpage/StatusStrip.tsx` (`:227-242`)
- Modify: `tests/components/admin/showpage/statusStrip.test.tsx`, `pageTransitions.test.tsx`

- [ ] **Step 1: failing tests:**
  - **T-STATUS-INLINE-NO-EDITED:** `editedRel` null → one line, **no trailing bullet** and no "Edited …". This is §4.5's main new failure mode.
  - **T-STATUS-ERROR-BUCKET:** non-`ok` status → the health label + a bucket-colored dot, **NOT** `"Synced …"`. The mock's green "Synced just now" is one bucket of several (`StatusStrip.tsx:128-133`); hardcoding it is the defect.
  - `lastSyncedAt === null` → the entire status element is omitted (`:227`). The "never" sentinel must not render.
  - (The one-row geometry assertion — T-STATUS-INLINE — is real-browser and lands in Task 11. jsdom computes no layout and cannot distinguish a collapsed row from a stack.)
- [ ] **Step 2: run — FAIL** (the error-bucket and no-edited cases may pass against the stack; the structural class assertion is the red).
- [ ] **Step 3: implement.** Collapse the two-line stack to one line: bucket-toned dot · `Synced {rel}` · 3px `aria-hidden` bullet · `Edited {rel}`. `inline-flex items-center` guarantees the baseline-consistent single row (§8). The bullet renders only when `editedRel != null`.
- [ ] **Step 4: run the scanner.** The `sync` and `edited` conditionals both survive as separate heads; expect `StatusStrip.tsx` = **7**, unchanged from Task 8. Verify by running; if it moved, investigate before editing the literal.
- [ ] **Step 5: run** `pnpm vitest run tests/components/admin/showpage/`.
- [ ] **Step 6: commit** `feat(admin): collapse the strip sync/edited stack to one line`
