# CASP-2 — Compact StatusStrip toggle variant

**Date:** 2026-07-17
**Branch:** `feat/casp2-inline-toggle-variant`
**Deferral ref:** `DEFERRED.md` CASP-2 (§ "Consolidated admin show page — orphaned help affordances", line 616)
**Type:** UI-only presentational redesign of a shared component. No DB, no advisory-locks, no server-action changes.

---

## 1. Problem

The sticky `StatusStrip` (`components/admin/showpage/StatusStrip.tsx:124-136`) wraps the **full-weight** `PublishedToggle` card (`components/admin/PublishedToggle.tsx:69-122`) — a bordered `p-tile-pad` box with an `<h3>Published`, a wrapping subline, and inline error/refusal slots. On desktop the strip is `sm:flex-nowrap` (single row) and the card is tolerable; on a ≤640px phone the strip is `flex-wrap` (`StatusStrip.tsx:106`) and the card is the dominant child, so the "slim, pinned" strip inflates to a tall multi-row block on Doug's venue-floor phone (Task 16 impeccable critique Assessment A, P1 "sticky strip overloads on mobile" + the toggle-weight watchpoint; also pre-flagged in the Task-10 report §3, quoted in `DEFERRED.md:618` — the report itself is gitignored under `.superpowers/` and not present in a fresh worktree, so `DEFERRED.md:618` is the verifiable source).

## 2. Goal

Give `PublishedToggle` a compact `variant="inline"` that renders **switch + "Published" label only** — no bordered box, no subline, no in-flow error block — so the strip stays slim on mobile. The full card remains the default (`variant="card"`), so every existing non-strip caller is byte-identical. Fold in the coupled critique P2 "duplicated crew-link-off copy": the inline variant drops the subline, leaving the Overview `#share-access` inactive notice as the single source.

## 3. Non-goals

- No change to the publish/unpublish server actions or their gates.
- No cross-island state lift. The error `useState` + the form action stay **inside** `PublishedToggle` (§6). This is the deliberate divergence from the DEFERRED.md tentative "relocate the subline/error into the Overview share cluster" — relocating the React-19 refusal-error rendering is the B1 revoke-hang dispatch-safety surface, and a popover keeps it local.
- No archived-mode change: the strip already renders zero mutating affordances when archived (`StatusStrip.tsx:117-123`); the toggle (and therefore the variant) never mounts on an archived show.
- No motion. `PublishedToggle` is registered in the `SERVER_RENDERED` motion-pin list at `tests/components/admin/transitionAudit.test.tsx:39`; the actual no-motion assertions run at `tests/components/admin/transitionAudit.test.tsx:64-80` (no `framer-motion`/`motion\/react`, no `AnimatePresence`, no `animate-[`/`route-enter`/`stagger`). The popover appears/disappears by conditional mount — instant, no animation (§4.8 Transition Inventory).

## 4. Design

### 4.1 API change

Add one optional prop to `PublishedToggleProps` (`PublishedToggle.tsx:40-49`):

```ts
/** Presentation. "card" (default) = full bordered box w/ h3 + subline + in-flow error.
 *  "inline" = compact switch + "Published" label; refusal/finalize copy → anchored popover. */
variant?: "card" | "inline";
```

Default `"card"`. Every current caller (only `StatusStrip.tsx` in production; plus test harnesses) that omits `variant` renders exactly today's card.

### 4.2 Card mode (unchanged)

`variant="card"` (or omitted) renders the exact current tree: `data-testid="published-toggle-row"` bordered box, `<h3>Published`, `published-toggle-subline`, and the in-flow `published-toggle-error` / `published-toggle-retry` blocks. Byte-identical to today.

### 4.3 Inline mode (new)

Container: a `relative inline-flex items-center gap-2` **`<div>`** (NOT a `<span>` — the container holds the `<form>`, which is flow content and is invalid inside a phrasing `<span>`, Codex R3 finding 1; NOT the bordered `p-tile-pad` box; NOT `data-testid="published-toggle-row"` — that testid stays card-only so existing card assertions can't accidentally match inline). Carries `data-testid="published-toggle-inline"`.

Children, in order:
1. A visible `<span>Published</span>` label — `text-sm font-medium text-text-strong` (no `id`; §4.5). Replaces the `<h3>` (an inline strip child must not introduce an `<h3>` under the strip's `<h1>` — heading-order violation; the label is a plain span, and the switch keeps its `aria-label="Published"`).
2. The **same** `<form>` + `<SwitchButton>` as card mode (§6) — the switch keeps `data-testid="published-toggle"`, `role="switch"`, `aria-checked`, the `before:-inset-y-2` 44px tap-min hit area (`PublishedToggle.tsx:143-145`), and the finalize/pending disable logic. Unchanged.
3. The **popover** (§4.4) — conditionally rendered, `position:absolute`, so it is out of normal flow and adds **zero** height to the strip row.

No subline in inline mode. No in-flow error block.

### 4.4 Popover (inline mode only)

A single anchored popover surfaces EITHER the refusal/generic error OR the finalize-disabled reason. Render order (an `if / else-if`, top-down): `errorCode != null || genericError` → error popover; **else if** `finalizeOwned` → finalize popover; else → nothing. **When both are set, the error popover wins** (error-first ordering) — an active refusal is the more urgent, action-relevant message.

**Error + finalize IS reachable (corrected — Codex R3 finding 2).** An earlier draft claimed this combination was unreachable; that was wrong. The path: (1) the switch is enabled (not finalize-owned); the user clicks and gets a refusal — `errorCode` is set locally and, per §6, deliberately WITHOUT `router.refresh()`. (2) A **sibling** component on the same page then triggers a soft refresh — e.g. `ReSyncButton` (`components/admin/ReSyncButton.tsx:119-121`) or a bulk control — and `router.refresh()` is a *soft* refresh that PRESERVES mounted client state (so `errorCode` survives). (3) The server re-reads `finalizeOwned` and passes the new `true` back into the SAME mounted toggle (prop flow: `app/admin/show/[slug]/page.tsx:347-356` → `components/admin/showpage/PublishedReviewPage.tsx:175-184` → `components/admin/showpage/StatusStrip.tsx:127-133` → `PublishedToggle`). Now `errorCode` (stale-but-preserved) AND `finalizeOwned=true` are both live → the error popover wins, and the switch is disabled. This exactly mirrors **card mode**, which also preserves `errorCode` across a soft refresh and keeps rendering the error block (card additionally stacks the finalize subline; inline cannot stack in a slim strip, so it shows the error only — the more urgent message). The stale error clears the same way in both variants: on the next enabled submit (`PublishedToggle.tsx:105-106` resets it). No reset effect is added — that would diverge inline from card. This IS a tested state (S5, §4.8 / §8.6 / §8.11).

- Positioning: `absolute` under the switch (`top-full`, right-aligned to the switch via `right-0`), `z-40` (above the strip's `z-30`), `mt-1`, `w-max`. Because it is `position:absolute`, it never contributes to the strip's flow **height**. **Horizontal containment (Codex R4 finding 1):** the popover must never project off-screen or cause horizontal page overflow at 390px — the toggle can flex-wrap to various x-positions on a phone. Width is capped `max-w-[min(15rem,calc(100vw-2rem))]` (never wider than the viewport minus the strip's `px-4` padding). The load-bearing guarantee is the **invariant**, pinned by a real-browser assertion (§8.10c): in every popover state at 390px, the popover's bounding rect stays within `[0, viewportWidth]` AND the document shows no horizontal scroll (`scrollWidth <= clientWidth`). If `right-0` anchoring ever pushes the popover's left edge negative for a far-left toggle position, the implementer adjusts the anchor (e.g. clamp, or `left`-anchor) under the §8.10c gate — the class is an implementation detail; the in-viewport invariant is the contract.
- Chrome: `rounded-sm border border-border-strong bg-warning-bg p-2 text-sm text-warning-text shadow-tile` for error/refusal; the finalize-only hint uses the calmer `border-border bg-surface text-text-subtle` (it is not a warning). One popover element; the skin switches on which message is active.
- Content:
  - Error/refusal (known code): `<ErrorExplainer code={errorCode} surface="admin" />` + `<HelpAffordance code={errorCode} />` — the SAME components card mode uses (`PublishedToggle.tsx:88-89`). No raw error codes (invariant 5).
  - Generic error: the SAME JSX literal as card's `published-toggle-retry` — `That didn&rsquo;t go through. Refresh and try again.` (curly apostrophe via `&rsquo;`, matching `PublishedToggle.tsx:98`; Codex R4 finding 3). To guarantee byte-identity, extract this string to a shared const (or render the same JSX node) rather than re-typing it with a straight apostrophe.
  - Finalize hint (no error active): the current subline finalize copy — published → "Changes are being finalized — the switch unlocks when they commit."; unpublished → "A publish is finishing — the switch unlocks when it's done." (`PublishedToggle.tsx:62-65`).
- `data-testid="published-toggle-popover"`.

### 4.5 Accessibility (popover)

- **Error/refusal** popover: `role="alert"` — SR-announced on appear (mirrors card's `role="alert"` at `PublishedToggle.tsx:84`). Auto-persists until the next toggle attempt clears it (the form action already resets `errorCode`/`genericError` at `PublishedToggle.tsx:105-106`); no manual dismiss affordance.
- **Finalize hint** popover: NOT `role="alert"` (it is a passive state description, not an interruption). **Reachability caveat (Codex R1 finding 3):** the switch during finalize is a real `disabled` native `<button>` (B1 requirement, §6) — a disabled button is removed from the Tab order, so "Tab to the switch to hear the reason" is NOT a sound path. The finalize reason is instead made reachable two ways that do NOT depend on focusing a disabled control: (a) it is **visible text in normal reading order** immediately adjacent to the switch (a virtual-cursor / reading-mode SR user encounters it inline), and (b) it is associated to the switch via `aria-describedby="published-toggle-popover-<slug>"` — Chromium keeps disabled buttons and their accessible descriptions in the a11y tree, so a reading-cursor user landing on the switch still gets the association even though Tab skips it. The test (§8.5) asserts (i) the visible reason text is in the DOM and (ii) the switch carries the matching `aria-describedby` — it does NOT assert focus-announcement (unprovable in jsdom, and not the reachability guarantee we rely on). The `<span>Published</span>` label and the switch's own `aria-label="Published"` name the control.
- **Decision:** the switch keeps ONLY its existing `aria-label="Published"` (`PublishedToggle.tsx:139`) — no `aria-labelledby`. Adding both would double-announce ("Published Published"). The visible `<span>Published</span>` is a sighted-only label (no `id` needed — nothing references it). The finalize-hint `aria-describedby` points at the popover's own `id="published-toggle-popover-<slug>"`.

### 4.6 StatusStrip change

`StatusStrip.tsx:124-136`: the `<div data-testid="strip-publish-toggle" className="min-w-0 shrink-0"><PublishedToggle .../></div>` passes `variant="inline"`. The wrapper `div` keeps `data-testid="strip-publish-toggle"` (existing assertion `statusStrip.test.tsx:106-109` scopes into it). The `min-w-0` is no longer needed (no wrapping prose child) but is harmless; drop it to `shrink-0` for clarity. No other strip change.

### 4.7 Overview copy reconciliation (critique P2)

The Overview `#share-access` inactive notice already exists (`OverviewSection.tsx:113-120`, `data-testid="admin-share-link-inactive"`: "The crew link is inactive while this show is {archived ? 'archived' : 'unpublished'}. It will be available once the show is published."). With the inline subline gone, this becomes the **single** source for the crew-link-off copy. No code change required in `OverviewSection.tsx` — the reconciliation is achieved by the inline variant NOT re-rendering the "Crew link is off — nobody can open this show." subline. Card mode still renders its subline (unchanged), so non-strip callers are unaffected. Recorded here so the reviewer does not flag the remaining card subline as a duplicate: card mode is a different surface (not co-located with the Overview notice).

### 4.8 Transition Inventory (inline mode)

Inline mode has these reachable visual states (N=5):

- **S1 — idle:** label + switch, no popover.
- **S2 — refusal popover:** known-code error popover (`role="alert"`, warning skin).
- **S3 — generic-error popover:** unknown-code retry popover (`role="alert"`, warning skin).
- **S4 — finalize-hint popover:** disabled switch + calm-skin popover (no `role="alert"`).
- **S5 — error + finalize:** error popover (error wins, §4.4) + disabled switch. Reachable when a local refusal is preserved across a sibling-triggered soft `router.refresh()` that flips `finalizeOwned` true (§4.4 path). Visually identical to S2/S3 (error popover, `role="alert"`); differs only in that the switch is disabled.

N=5 → 10 pairs. The popover is a conditional mount (no `AnimatePresence`, no CSS enter/exit animation), so every appear/disappear/swap is **instant**:

| Pair | Treatment |
|---|---|
| S1↔S2 | Instant — popover mounts/unmounts. No animation. |
| S1↔S3 | Instant — popover mounts/unmounts. |
| S1↔S4 | Instant — popover mounts/unmounts; switch `disabled` toggles (no animation on disable). |
| S1↔S5 | Instant — reached as S1→S2/S3 (submit refusal) then S2/S3→S5 (sibling refresh flips finalize); each step instant. |
| S2↔S3 | Instant — same popover element, text/`ErrorExplainer` content swaps in place. |
| S2↔S4 | Instant — not a direct user transition (a refusal clears on the next submit; finalize arrives via refresh); endpoints pinned individually. |
| S2↔S5 | Instant — a sibling soft-refresh flips `finalizeOwned` while the refusal is preserved; the popover is unchanged (error stays), only the switch's `disabled` flips. No content/skin change. |
| S3↔S4 | Instant — like S2↔S4, endpoints pinned individually. |
| S3↔S5 | Instant — like S2↔S5; error popover unchanged, switch disables. |
| S4↔S5 | **Not reachable** — you cannot go from a finalize-only state (S4, switch disabled, no error) to error+finalize (S5) because producing an error requires an enabled-switch submit, and S4's switch is disabled. S5 is only ever entered from S2/S3 (error already present) when finalize flips in. |

**The one animation in the component (unchanged, both variants):** the switch thumb slide `transition-transform duration-fast` on the on/off flip (`PublishedToggle.tsx:150-154`) and the track `transition-colors duration-fast` (`PublishedToggle.tsx:145`). Pre-existing, shared by card mode, not touched.

**Compound transitions:** the only "two things change" case is S2/S3→S5 — a sibling soft-refresh flips `finalizeOwned` while the error popover is showing. This is a single instant re-render: the error popover stays put (error wins), the switch gains `disabled` (no disable animation). Nothing animates during it — the thumb slide fires only on an actual publish-state flip (enabled switch + successful non-refusal submit), which never coincides with a popover being present. No `AnimatePresence` means no exit-animation race.

This inventory is pinned by the transition-audit test task (§8.11), which asserts each reachable state's popover presence + `role`, including the S2/S3→S5 compound via submit-then-rerender — distinct from the motion-import pin (§8.8).

## 5. Guard conditions (every prop / state)

| Condition | Inline render |
|---|---|
| `published` true/false | switch `aria-checked` reflects it; label always "Published" (the state is the switch, not the label text). |
| `finalizeOwned` true | switch disabled (`SwitchButton` unchanged); finalize-hint popover shown (unless an error is also active → error wins). |
| `errorCode` set (known refusal) | error popover with `ErrorExplainer` + `HelpAffordance`; `role="alert"`. |
| `genericError` true | error popover with the retry copy; `role="alert"`. |
| no error, not finalize-owned | **no popover** (only label + switch). |
| both error and finalizeOwned (S5) | **error popover wins** (§4.4, error-first render order), switch disabled. Reachable when a preserved local refusal meets a sibling-triggered soft refresh that flips `finalizeOwned`. Tested (§8.6, §8.11) via submit-then-rerender. |
| `variant` omitted / `"card"` | today's card, byte-identical. |
| `variant="inline"` while archived | not reachable — the strip never mounts the toggle when archived (`StatusStrip.tsx:117`). No archived-specific inline branch. |
| `slug` value | `slug` is typed non-nullable `string` (`PublishedToggle.tsx:41-42`; the "never null at this callsite" comment on `:43` documents `published`, not slug — slug's non-nullness is the type itself). It is used verbatim in the popover `id` (`published-toggle-popover-<slug>`). Empty string is still a valid id suffix (`published-toggle-popover-`) and never renders — the slug is not displayed to the user. No guard needed beyond the type. |
| `setPublished` throws / rejects | Out of scope — **inline matches card exactly**. The shared `<form action>` closure (`PublishedToggle.tsx:104-116`) has no `try/catch` today; a rejected `setPublished` propagates as a React form-action rejection in BOTH variants. This spec does not change that behavior (any catch would be a card-mode behavioral change and a separate concern). Callers pass a bound server action that resolves a `LifecycleResult` rather than throwing (the established contract). |

## 6. B1 dispatch-safety invariant (unchanged, both variants)

The switch stays the form **submitter** and disables ONLY on `useFormStatus().pending` or `finalizeOwned` — never synchronously in its own `onClick` (`PublishedToggle.tsx:130-157`, the revoke-hang B1 lesson). The `<form action={…}>` closure (`PublishedToggle.tsx:104-116`) is shared verbatim by both variants: reset error state → `await setPublished(!published)` → on ok `router.refresh()` → on known refusal set `errorCode` WITHOUT refresh (remount would wipe the popover, plan R10) → else `genericError`. Only the **rendering** of `errorCode`/`genericError` differs by variant (in-flow block vs popover); the state, the action, and the disable logic are variant-agnostic. This is what makes the change presentational and keeps it off the B1 risk surface.

## 7. Dimensional invariant (mobile strip height)

The whole point: the inline variant must NOT inflate the strip on a phone. Invariant: at 390px viewport width, with the toggle in every state (idle / error-popover-open / finalize-disabled), the `show-status-strip` height stays within the single-to-two-row slim band it has WITHOUT the toggle card — i.e. the popover (being `position:absolute`) contributes zero to the strip's `getBoundingClientRect().height`. Verified by a real-browser (Playwright) assertion (§8), not jsdom — jsdom computes no layout (project Tailwind-v4 layout rule). Concretely: strip height with an active error popover === strip height with no popover (± 0.5px), because the popover is out of flow.

## 8. Test plan

TDD per task. Failure mode stated per test (anti-tautology).

1. **PublishedToggle card unchanged** (`tests/components/admin/PublishedToggle.test.tsx`, jsdom): existing tests pass unmodified; add an explicit `variant="card"` === default render assertion (both render `published-toggle-row`). *Catches:* a default-value regression that silently changes existing callers.
2. **Inline variant render** (same file): `variant="inline"` renders `published-toggle-inline` + the switch (`published-toggle`) + the "Published" label span, and does NOT render `published-toggle-row` / `published-toggle-subline`. *Catches:* inline accidentally rendering the card chrome (would re-inflate the strip).
3. **Inline error → popover, not in-flow** (same file): mock `setPublished` to resolve `{ok:false, code:"PUBLISH_BLOCKED_PENDING_REVIEW"}`; submit; assert a `published-toggle-popover` with `role="alert"` appears containing the resolved copy (via `ErrorExplainer`, NOT the raw code), and NO `published-toggle-error` in-flow block. *Catches:* raw-code leak (invariant 5) + error re-inflating the strip. Assert the popover text is the looked-up message, scoping into the popover subtree so the switch's "Published" can't satisfy it (anti-tautology).
4. **Inline generic error → popover** (same file): mock `setPublished` to resolve `{ok:false, code:"SOMETHING_UNKNOWN"}`; assert the retry copy renders in the popover — matching card's rendered text with the curly apostrophe ("That didn’t go through. Refresh and try again."), scoped into the popover subtree. *Catches:* unknown-code path bypassing the popover, and a straight-apostrophe copy drift from card (§4.4).
5. **Inline finalize hint** (same file): `finalizeOwned` + no error → switch disabled AND `published-toggle-popover` shows the finalize copy, `role` is NOT `alert`, and the switch has `aria-describedby` pointing at the popover id. *Catches:* a bare disabled switch with no explanation (the venue-floor confusion the design fixes).
6. **Inline S5 — error wins over finalize (reachable via soft-refresh)** (same file): render inline with `finalizeOwned=false` and a mocked known refusal; submit to set the error (S2). Then `rerender` the SAME element with `finalizeOwned=true` (simulating a sibling soft `router.refresh()` that preserves the local `errorCode` and flips the server prop — §4.4 path). Assert: the popover still shows the ERROR copy (via `ErrorExplainer`) with `role="alert"` — NOT the finalize copy — AND the switch is now `disabled`. *Catches:* the finalize hint masking a live actionable refusal (error must win), and a regression that drops the preserved error on prop change.
7. **B1 dispatch-safety preserved** (`tests/components/admin/per-show-lifecycle.test.tsx` or the existing dispatch test): the inline switch is a `type="submit"` inside the `<form>`, `disabled` only on pending/finalizeOwned. Assert the switch is not disabled synchronously on click when enabled. *Catches:* a variant refactor that moves the submitter or adds an onClick disable (the revoke-hang class).
8. **transitionAudit stays green** (`tests/components/admin/transitionAudit.test.tsx`): unchanged — the popover uses no motion library / `AnimatePresence` / `animate-[`. Re-run to confirm the inline additions don't trip the motion pin. *Catches:* a framer/animate import sneaking into the popover.
9. **StatusStrip passes `variant="inline"`** (`tests/components/admin/showpage/statusStrip.test.tsx`, jsdom): the strip's `strip-publish-toggle` wrapper contains `published-toggle-inline` (not `published-toggle-row`) and the switch reflects `aria-checked`. Existing "wraps the existing PublishedToggle" test still passes (switch testid unchanged). *Catches:* the strip regressing to the card wrap.
10. **Real-browser 390px strip geometry** (`tests/e2e/*` Playwright, real browser — jsdom computes no layout). Uses a **static** harness in the existing `_showPageLayoutHarness.tsx` pattern (`renderToStaticMarkup` → Tailwind-compiled CSS → served over `node:http` → measured), NOT an interactive-hydration harness (avoids the client-bundle/mock-hydration complexity, which is disproportionate here). The **finalize popover (S4) is prop-driven** — passing `finalizeOwned={true}` renders the real popover in initial markup with NO test-only forced-error path (Codex R5 advisory satisfied: it's the real conditional output). The error popover (S2/S3) shares the S4 popover's **identical positioning + width classes** (only skin/`role`/content differ — pinned in jsdom by §8.11d), so the S4 geometry generalizes to the error popover; no interactive submit is needed for the geometry proof. Render these harness states at 390px:
    - **(a) Height-invariance (primary):** measure `show-status-strip` `getBoundingClientRect().height` in **idle** (enabled switch, no popover) and **finalize** (`finalizeOwned=true` → disabled switch + popover). Assert equal within 0.5px. Because the popover is `position:absolute`, it must add zero flow height; the disabled attribute changes no box. This is the load-bearing assertion — it fails if the popover (or any inline chrome) is in-flow.
    - **(b) Compaction (secondary):** render the strip once with the toggle in `variant="card"` (the pre-CASP-2 layout) at 390px; assert the inline idle strip height is strictly less than the card strip height by more than one text-line (≥ ~20px), proving real compaction, not a no-op rename. Baseline derived from the card render in the same harness — never a hardcoded pixel count (anti-tautology / project fixture rule).
    - **(c) Horizontal containment (Codex R4 finding 1):** in the finalize-popover state at 390px, assert the popover's `getBoundingClientRect()` has `left >= 0` and `right <= 390` (fully in viewport), AND the document has no horizontal overflow (`document.documentElement.scrollWidth <= document.documentElement.clientWidth`). Because the error popover shares the S4 positioning classes (§8.11d), this generalizes to it. Run with the strip title at BOTH the short fixture and `SHOWPAGE_LONG_TITLE` (which changes where the toggle wraps, exercising a different toggle x-position). *Catches:* a `max-w`/`right-0` popover projecting off-screen or forcing a horizontal scrollbar on Doug's phone.
    *Catches:* the exact CASP-2 defect — any popover or label that inflates the phone strip.

    *(S2/S3/S5 error popovers are not separately measured in the real browser — they are the same `position:absolute` box as S4 by the §8.11d class-equality pin, so they contribute the same zero flow height and the same in-viewport geometry.)*

11. **Transition-audit state enumeration** (`tests/components/admin/*`, jsdom — new, distinct from §8.8's motion-import pin; Codex R1 finding 2, corrected R2/R3): enumerate the §4.8 reachable states S1–S5. Assert: (a) each state produces the expected popover presence + `role` — **S1** idle → no `published-toggle-popover`; **S2** (mocked known refusal, submitted from the enabled switch) → popover with `role="alert"`; **S3** (mocked unknown-code, submitted) → popover with `role="alert"` + retry copy; **S4** (`finalizeOwned` true, switch disabled, no error) → popover WITHOUT `role="alert"` + the switch's `aria-describedby` matches the popover `id`. (b) The inline branch contains no `AnimatePresence` / motion import / `animate-[` (belt-and-suspenders with §8.8). (c) **S5 compound (error preserved across finalize flip):** render enabled, submit a mocked refusal (S2), `rerender` with `finalizeOwned=true`; assert the ERROR popover (`role="alert"`) still shows — not the finalize hint — and the switch is now `disabled`. This is the same assertion as §8.6, exercised here as the compound-transition pin the writing-plans transition-audit rule mandates. (d) **Popover positioning-class equality (load-bearing for §8.10's geometry generalization):** assert the error popover (S2) and the finalize popover (S4) render with the SAME positioning + width classes (`absolute`, `top-full`, `right-0`, the `max-w-[min(15rem,calc(100vw-2rem))]` cap, `z-40`, `mt-1`) — extract the shared positioning class string to one constant used by both branches and assert both DOM nodes carry it; the ONLY permitted difference is the skin (`bg-warning-bg`/`border-border-strong` vs `bg-surface`/`border-border`), `role`, and content. *Catches:* an unenumerated state (a finalize popover wrongly keeping `role="alert"`, a missing `aria-describedby`, or a preserved error dropped when finalize flips in) AND a positioning drift between the two popover skins that would break the §8.10 real-browser geometry generalization.

12. **Update the existing OFF-state e2e** (`tests/e2e/admin-lifecycle-transitions.spec.ts:247-258`; Codex R3 finding 3): this test flips the toggle OFF in the strip and currently asserts `published-toggle-subline` = "Crew link is off — nobody can open this show." The inline variant removes the subline from the strip, so this assertion MUST be updated in the same change or it fails. Replace it with: after the OFF flip, assert the switch reads `aria-checked="false"` (already asserted) AND the Overview inactive notice `admin-share-link-inactive` is visible with its "The crew link is inactive while this show is unpublished." copy (the single source, §4.7) — NOT the removed subline. *Catches:* the spec's subline removal silently breaking a shipped e2e; also positively verifies the copy relocated to Overview rather than vanishing.

## 9. Impeccable dual-gate (invariant 8)

UI surface (`components/admin/PublishedToggle.tsx`, `components/admin/showpage/StatusStrip.tsx`). `/impeccable critique` AND `/impeccable audit` run on the diff before the close-out cross-model review. P0/P1 fixed or deferred via `DEFERRED.md`. Setup gates: `context.mjs` (PRODUCT.md + DESIGN.md) → register reference read. Findings + dispositions → milestone/handoff notes.

## 10. Meta-test inventory

- **No new registry.** This is presentational; it adds no mutation surface, no admin route, no Supabase call boundary, no `admin_alerts` code, no advisory-lock holder, no drive-keyed table. The mutation (`setShowPublishedAction`) is pre-existing and untouched. Declared explicitly per the writing-plans meta-test-inventory rule: **none applies** because no structural-registry surface changes.
- **Existing pins re-run** (not extended): `transitionAudit.test.tsx` (motion pin, §8.8), `statusStrip.test.tsx` (strip contract, §8.9), and the bg-accent inventory (`tests/styles/_metaBgAccentInventory.test.ts` references PublishedToggle — the switch's `bg-accent` on-state is unchanged, so no registry edit; re-run to confirm).

## 11. Files touched

- `components/admin/PublishedToggle.tsx` — add `variant` prop + inline branch + popover.
- `components/admin/showpage/StatusStrip.tsx` — pass `variant="inline"`.
- `tests/e2e/admin-lifecycle-transitions.spec.ts` — update the OFF-state assertion (§8.12).
- Other tests per §8 (new: `PublishedToggle.test.tsx` inline cases, `statusStrip.test.tsx` inline wrap, real-browser 390px height, transition-audit state enum).
- `DEFERRED.md` — mark CASP-2 RESOLVED.
- No `OverviewSection.tsx` change (§4.7).

## 12. Out of scope

- Relocating error state to Overview (explicitly rejected, §3 — B1 surface).
- Any archived-mode inline branch (§3, unreachable).
- Harmonizing the card subline copy with the Overview notice for the card (non-strip) callers — card mode keeps its subline; it is not co-located with the Overview notice, so no duplication there.
