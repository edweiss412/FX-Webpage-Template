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
| R2 | The fix for `BL-DESTRUCT-STACK-THUMB-ORDER` is a **breakpoint-forked render (two DOM subtrees) keyed on CONTAINER width**, threshold 576px. The owner first chose a viewport-keyed fork on 2026-07-25 from a rendered comparison; adversarial review plus a browser probe then showed the viewport key does not fix the live 280px rail (§2.5), and the owner re-decided for the container key the same day on that evidence. Ruled out and not to be re-argued: a CSS `order` flip, `flex-row-reverse`, grid line placement (all desync visual from focus order, WCAG 2.4.3 — the original reason this was deferred rather than patched), a recolour-only fix, and a global DOM swap. | Owner decisions, 2026-07-25, this session; evidence in §2.5 and §4.2. |
| R3 | Duplicating a destructive control is a **known, accepted cost** of R2, not an oversight. Containment is four-part and specified in §4.5: one shared render helper, a canonical-token allowlist that catches shared drift, per-copy test ids, and a real-browser proof that exactly one copy is displayed at each of the three probed container widths. | This spec §4.5. |
| R4 | The bare test ids `admin-pending-defer-${id}` / `admin-pending-ignore-${id}` are **retired**, not reassigned to one copy. A bare id that silently resolves to one of two live copies is precisely the ambiguity that makes a duplicated destructive control dangerous. | This spec §4.4. |
| R5 | Wiring `tests/e2e/pendingDiscardReflow.layout.spec.ts` into CI is **in scope**, because it is this change's verification vehicle. It currently runs in no workflow (`tests/e2e/standalone.config.ts:36` lists it, but `package.json:52` names only four other specs). Note the config itself IS invoked by `.github/workflows/modal-header-layout-e2e.yml:106` — it is *this spec* that is dark, not the config, per the `BL-STANDALONE-CONFIG-CI-DARK` row in `BACKLOG.md`. A guard that runs in no CI is not a guard. This spec does **not** attempt the rest of `BL-STANDALONE-CONFIG-CI-DARK`'s ~15 other dark specs. | `AGENTS.md` cross-cutting rule "Local-passes-CI-fails is its own bug class"; that row's "Partially closed" note. |
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

`tests/help/_uiLabelExceptions.ts`, `tests/help/page-dashboard.test.tsx` and `tests/messages/_metaEmphasisRenderContract.test.ts` reference the component but **not** these test ids (verified by grep).

**Label-coupling check.** The fork renders each label twice, so any test that counts rendered label occurrences would break. Verified by grep that none does: every other reference to the strings `"Defer until modified"` / `"Permanently ignore"` is either help-page MDX prose (`app/help/admin/dashboard/page.mdx:39`, `app/help/admin/onboarding-wizard/page.mdx:96`) or a **source-text** scan of that MDX (`tests/help/page-dashboard.test.tsx:76-77`, using `expect(src).toContain(...)`), not a DOM query. `tests/help/_uiLabelExceptions.ts:135-143` declares the two labels as help-page exceptions keyed on `label` + `file`, with no count and no DOM involvement. None of these change.

**Stale line citations to correct in passing.** Three registry/comment anchors already point at wrong lines, and this change shifts the file further:

| Location | Says | Actual |
|---|---|---|
| `tests/help/_uiLabelExceptions.ts:137` | `PendingPanelDiscardButtons.tsx:85` | Defer button is at `components/admin/PendingPanelDiscardButtons.tsx:109-119` |
| `tests/help/_uiLabelExceptions.ts:142` | `PendingPanelDiscardButtons.tsx:96` | Ignore button is at `components/admin/PendingPanelDiscardButtons.tsx:120-136` |
| `tests/e2e/needs-attention-page.spec.ts:53` | `PendingPanelDiscardButtons.tsx:89` | as above |

These are prose notes, not assertions, so nothing fails today — which is exactly why they rotted. They are corrected in the same commit that moves the lines, per the project's line-anchor discipline.

---

### 2.5 The defect is already live on desktop

This was not in the backlog and was found by measuring the real page, after adversarial review challenged the viewport-keyed design.

The Needs-Attention list is a fixed rail on wide viewports: `components/admin/Dashboard.tsx:736` sets `min-[1240px]:w-80` (320px), and each card inside it carries `p-tile-pad` (`components/admin/NeedsAttentionInbox.tsx:65`), which is 20px (`app/globals.css:170`). The buttons therefore get **280px**, while side by side they need 315.95px idle and 491.25px armed.

Measured in Chromium at a 1280px viewport with today's shipped markup in the **real card nesting** — card with `p-tile-pad`, the `flex flex-wrap items-center gap-2` action row (`components/admin/NeedsAttentionInbox.tsx:72`), and the `Retry now` sibling — not a bare container:

| Card | State | Defer | Ignore | Result |
|---|---|---|---|---|
| 320px rail | idle | `y2335` | `y2387` | **Ignore below Defer** |
| 320px rail | armed | `y2553` | `y2605`, full width | **Ignore below Defer** |
| 900px | idle | `y2719 x136.55` | `y2719 x299.29` | side by side, correct order |

**The usable width is 278px, not 280px.** The card is border-box with a 1px border each side plus 20px padding each side: 320 − 2 − 40 = **278px**, which is what the action row measured. Later sections say "the 280px rail" as shorthand for this geometry; 278px is the number, and the probe panels use it.

`sm:basis-auto` restores auto-basis at `sm` **viewport** width, but `flex-wrap` still wraps when the **container** cannot fit the row. So the mis-tap ordering the backlog records as a mobile-stacking problem is already reachable on a desktop monitor, in the surface an admin uses most.

Two consequences: the fix must key on container width, not viewport width (§4.1); and the "side-by-side at `≥ sm`" layout that goal G2 protects is one this rail has never had room to display, so preserving it there is not a real constraint.

## 3. Goals / non-goals

**Goals.** (G1) Wherever the two controls stack, the safe action is the lower of the two. (G2) Wherever they genuinely fit side by side, the existing Defer-left / Ignore-right order is unchanged — note §2.5: the 280px rail never fits them, so this goal binds only on wide cards. (G3) Visual order and focus order agree at every width — no `order`, no `flex-row-reverse`, no grid line placement that would desync them. (G4) The harmonized 4s arm-revert cannot silently re-drift. (G5) BACKLOG reflects reality.

**Non-goals.** Changing any confirm label or the 4s value (R8). Touching the other ten destructive surfaces' markup — they get an import swap only. Closing the rest of `BL-STANDALONE-CONFIG-CI-DARK` (R5). Guarding non-arm timers (R6). Any DB, RPC, advisory-lock, API-route, or `§12.4` catalog change — this diff touches none.

---

## 4. Design — the container-keyed forked render

### 4.1 Structure

The fork keys on the **width of the card the buttons sit in**, not the width of the viewport. This is the correction forced by §2.5: the viewport is not the constraint, the container is.

`PendingPanelDiscardButtons` renders one `@container` wrapper holding three children:

1. **Stacked copy** — `<div className="flex flex-col items-stretch gap-2 @min-[576px]:hidden">`, DOM order **Ignore, then Defer**.
2. **Inline copy** — `<div className="hidden flex-wrap gap-2 @min-[576px]:flex">`, DOM order **Defer, then Ignore**.
3. **Live region + error block** — rendered once, outside both copies.

`hidden` resolves to `display: none`, which removes the element from the accessibility tree and from hit-testing, so exactly one copy is live at any width. Within each copy DOM order **is** visual order, so focus order and visual order agree without any reordering primitive — no `order`, no `flex-row-reverse`, no grid line placement.

Both copies come from a single local helper, so they cannot drift in label, class, handler, or disabled logic:

```tsx
function pair(variant: "stacked" | "inline") { /* returns [deferNode, ignoreNode] */ }
```

The helper takes only the variant (used for the test-id suffix) and closes over the component's state and handlers. The stacked copy renders `[ignore, defer]`; the inline copy renders `[defer, ignore]`.

**The `@container` element must have an externally-determined width.** `container-type: inline-size` applies `contain: inline-size`, which severs the element's inline size from its contents. The component's root is a flex item in the card's `flex flex-wrap items-center gap-2` action row (`components/admin/NeedsAttentionInbox.tsx:72`), where flex items are shrink-to-fit — sized *by* their contents. Putting the containment context there without a definite width **collapses it to zero**. Measured: the wrapper resolves to `0px` and the buttons shrink to `26px`, while the card grows 18.89px taller from the wrapping. Nothing errors; the layout is just silently wrong.

The shipped form is therefore `w-full @container` on the component root. `w-full` gives the flex item a definite basis so containment has something to measure, and it also preserves today's full-width stacked buttons, which a content-sized root would shrink to 154.74px — a tap-target regression on exactly the surface this change exists to improve.

**Accepted cost, flagged for the impeccable gate:** `w-full` takes the whole action-row line, so on a wide card the `Retry now` sibling no longer shares a line with the discard buttons and the card grows ~52px taller (166.3px vs 114.3px measured at a 900px card). The alternative — putting `@container` on the action row itself and leaving the root content-sized — keeps `Retry` inline but costs the full-width tap targets. Ergonomics of an irreversible control won over card density; the invariant-8 critique/audit pass is the right place to challenge that call, and it is called out here so the reviewer sees a decision rather than an accident.

**The `flex` token is load-bearing and separately pinned.** The stacked container needs a literal `flex` class alongside `flex-col items-stretch`. Without it the element is `display: block`, `items-stretch` is inert, and D1 silently does not hold — while a source-scan guard that only checks for `flex-col`/`items-stretch` still passes. §6.2 test 7 and §6.3's source guard both require `flex` explicitly for this reason.

### 4.2 The 576px threshold

The threshold must clear the **armed** width, not the idle width. Measured in Chromium with the real compiled token CSS:

| Content | Width used |
|---|---|
| idle Defer + gap + idle Ignore | 315.95px |
| idle Defer + gap + **armed** Ignore | **491.25px** |

A threshold sized to the idle total would put the inline copy on screen at widths where arming makes it wrap — reintroducing the defect at the exact moment the destructive confirm appears. Boundary behaviour was measured directly:

| Container | State | Copy shown | Wrapped | Slack |
|---|---|---|---|---|
| 511px | armed | stacked | no | clean switchover, no gap |
| 512px | armed | inline | no | 20.75px |
| 512px | idle | inline | no | 196.05px |

512px works locally but leaves only **20.75px** (4%) of headroom on the armed row. CI renders on x64 Linux while these numbers come from arm64 macOS, and a font-metric difference inside that band would wrap the armed row silently. **576px** is therefore the shipped threshold, leaving 84.75px (17%) of headroom. §6.3 asserts no-wrap at exactly the threshold, so if a platform ever does exceed it the test fails loudly instead of the layout degrading quietly.

Nothing real is lost at 576: the two live geometries are the 280px rail (stacked either way) and the full-width dashboard card below 1240px viewport (far wider than 576, inline either way).

### 4.3 Mode boundaries

Each container is `display: none` in the other's mode. Stated per element to remove the ambiguity a single shared row invites:

| Element | Container < 576px | Container ≥ 576px |
|---|---|---|
| Stacked container | `flex` | `none` |
| Inline container | `none` | `flex` |
| Defer button | in stacked copy, second | in inline copy, first |
| Ignore button | in stacked copy, first | in inline copy, second |
| `role="status"` sr-only region | rendered once, outside both copies — unaffected by mode |
| `role="alert"` error block | rendered once, outside both copies — unaffected by mode |

The live region moves **out** of the row (it is inside it today at `components/admin/PendingPanelDiscardButtons.tsx:140-142`). Rendering it once is required: two mounted `role="status"` nodes with identical content produce a double announcement in some screen readers, and the region is `sr-only`, so its position in the flex row carries no visual meaning.

### 4.4 Test ids

Per R4 the bare ids are retired. Each copy carries an explicit variant suffix:

| Control | Stacked | Inline |
|---|---|---|
| Defer | `admin-pending-defer-stacked-${id}` | `admin-pending-defer-inline-${id}` |
| Ignore | `admin-pending-ignore-stacked-${id}` | `admin-pending-ignore-inline-${id}` |

Unchanged: `admin-pending-discard-error-${id}` (`components/admin/PendingPanelDiscardButtons.tsx:147`), rendered once.

**Which copy each consumer targets is determined by the container width at that consumer's viewport, and was verified, not assumed:**

- `tests/components/admin/pendingIngestionActions.test.tsx` — jsdom applies no CSS, so both copies mount and either id resolves. It targets the **inline** ids for the existing behavioural assertions, preserving the DOM order those assertions were written against. New tests cover the stacked copy.
- `tests/e2e/needs-attention-page.spec.ts` — sets `setViewportSize(MOBILE)` at `tests/e2e/needs-attention-page.spec.ts:232`, where `MOBILE = { width: 390, height: 844 }` (`tests/e2e/needs-attention-page.spec.ts:40`). The card there is far below 576px, so the **stacked** copy is the live one. Its clicks at `tests/e2e/needs-attention-page.spec.ts:243` and `tests/e2e/needs-attention-page.spec.ts:250` retarget to the **stacked** ids. Targeting inline would click a `display:none` node and fail on Playwright actionability — a timeout that reads as a flake rather than a wiring error, which is why this is called out explicitly.

### 4.5 Containment for the duplicated destructive control (R3)

| Risk | Containment | Proof |
|---|---|---|
| The two copies drift together | Canonical-token assertion: each rendered button must carry the required token set (`min-h-tap-min`, `inline-flex`, `items-center`, `justify-center`, `rounded-sm`, `px-3`, `text-sm`) checked against a literal allowlist, **not** against the other copy | §6.2 test 2b. Parity alone cannot catch this and is not asked to |
| The two copies drift apart | Both emitted by the single `pair()` helper | §6.2 tests 2a/3 compare the copies to each other |
| A query resolves ambiguously | Variant-suffixed ids; the bare ids no longer exist, so a stale query fails loudly instead of matching two nodes | Mechanical, compile- and test-visible |
| Both copies live at once, or neither | `@min-[576px]:hidden` / `hidden @min-[576px]:flex` are exact complements | §6.3 real-browser assertion at 280 / 576 / 720px, plus the production-nesting panel |
| A future edit reverts to one subtree, or drops `flex` | Source drift-guard asserting the fork's classes are present **and** `basis-full` is absent | §6.3 drift-guard |

### 4.6 Guard conditions for the one prop

`pendingIngestionId: string` (`components/admin/PendingPanelDiscardButtons.tsx:20`) is the component's only input.

| Value | Behaviour |
|---|---|
| Non-empty string | Normal. Interpolated into four test ids and, `encodeURIComponent`-escaped, into the POST URL (`components/admin/PendingPanelDiscardButtons.tsx:81`). |
| Empty string `""` | Renders normally; ids degrade to `admin-pending-ignore-stacked-`. The POST targets `/api/admin/pending-ingestions//discard` and fails server-side, surfacing through the existing error branch (`components/admin/PendingPanelDiscardButtons.tsx:100`). **Unchanged from today** — no new failure mode, no new guard. The host always passes a row id. |
| `null` / `undefined` | Not reachable — the prop is a required non-nullable `string`, rejected at the call site by TypeScript. No runtime guard added, matching current behaviour. |

### 4.7 Dimensional invariants

Tailwind v4 on this project does **not** default `.flex` to `align-items: stretch` (`docs/agents/spec-self-review.md:11`). Every parent→child relationship is therefore explicit and verified in a real browser at **container** widths, never in jsdom and never at viewport widths.

| # | Parent | Child | Required relationship | Guaranteeing class | Verified by |
|---|---|---|---|---|---|
| D1 | stacked container | both buttons | child width == container width | `flex` **and** `items-stretch` (both explicit; `flex-col` alone leaves the element `display:block`) | §6.3 at 280px |
| D2 | stacked container | both buttons | child height ≥ 44px | `min-h-tap-min` (`--spacing-tap-min: 44px`, `app/globals.css:162`) | §6.3 at 280px |
| D3 | inline container | both buttons | both share one line, widths intrinsic | container ≥ 576px guarantees the armed total of 491.25px fits | §6.3 at 576px and 720px, idle **and** armed |
| D4 | stacked Ignore | itself, idle vs armed | box top / left / width identical across arming | full-width stack pins all three edges | §6.3 equality assertion with the pre-DESTRUCT-1 negative control retained |
| D5 | stacked container | Ignore vs Defer | `ignore.bottom ≤ defer.top` | DOM order Ignore-first in a `flex-col` | §6.3 at 280px, against a negative control using today's markup |
| D6 | inline Ignore | itself, idle vs armed | box left and top identical; width may grow rightward only | intrinsic widths with the left edge set by Defer + `gap-2` | §6.3 at 576px and 720px |

**Empirical grounding.** Measured in Chromium with the compiled token CSS (arm64 macOS, 2026-07-25):

| Container | Copy shown | Result |
|---|---|---|
| 280px (the live rail) idle **and** armed | stacked | Ignore `x16 w280 h44` above Defer; hidden copy `0×0`. D1, D2, D4, D5 hold |
| 512px armed | inline | no wrap, 491.25px used, 20.75px slack — the basis for choosing 576 instead |
| 576px / 720px, idle and armed | inline | Defer left, same row; armed Ignore grows `153.2 → 328.51` with its left edge pinned at `x178.74`. D3, D6 hold |
| every case | — | exactly one copy displayed; the hidden copy measures `0×0` with `offsetParent === null` |

**Why D4 does not assert height equality.** The probe measured armed and idle heights equal (both 44px — the armed label fits one line at 280px here), but that is a font-metric outcome and CI is x64 Linux. A height-equality assertion would be a platform-hardcoded fixture: green locally, red in CI, for a wrap that does not violate the invariant. D4 protects what matters — the confirm target does not move out from under the finger — via top, left and width. Height may grow downward from a pinned top.

### 4.8 Transition inventory

The component's visual state is **two independent dimensions**, not one flat enum. Modelling it as five mutually-exclusive states was wrong: `armed` and `state` compose, and the compound cells are where the real behaviour lives.

- **`state`** ∈ { `idle`, `running-defer`, `running-ignore`, `error` } — the `State` union at `components/admin/PendingPanelDiscardButtons.tsx:22-25`
- **`armed`** ∈ { `false`, `true` } — the separate boolean at `components/admin/PendingPanelDiscardButtons.tsx:47`

Eight cells. **Two** are unreachable, leaving **six** reachable — so the pairwise inventory is 6·5/2 = **15 unordered pairs**, not the 10 an earlier five-state draft claimed. Each unreachability is a claim checked against the live component:

| | `armed: false` | `armed: true` |
|---|---|---|
| **idle** | A — resting | B — armed confirm showing |
| **running-defer** | C — Deferring… | **unreachable** — `handleClick` disarms before setting running (`components/admin/PendingPanelDiscardButtons.tsx:76-77`) |
| **running-ignore** | D — Ignoring… | **unreachable** — same disarm (`components/admin/PendingPanelDiscardButtons.tsx:66-68`) |
| **error** | E — error shown | F — error **and** armed; `onGuardedIgnoreClick` arms without touching `state` (`components/admin/PendingPanelDiscardButtons.tsx:56-64`) |

Pairs are the wrong unit — the earlier table conflated "these two cells are related" with "this direction is reachable", and got seven directions wrong. What follows is a **directed** edge table over the six reachable cells. All 30 ordered pairs are accounted for; only the reachable ones get a treatment.

| From → To | Reachable? | Treatment |
|---|---|---|
| A → B | yes | Recipe morph on Ignore, `transition-opacity duration-fast` (`components/admin/PendingPanelDiscardButtons.tsx:127`); box top/left/width fixed (D4/D6) |
| B → A | yes | The 4s auto-revert clears `armed` with `state` still `idle` (`components/admin/PendingPanelDiscardButtons.tsx:60-63`). **Only** the timer produces this edge — a sibling Defer tap goes B → C, and the confirm tap goes B → D |
| A → C | yes | Instant. `Defer until modified` → `Deferring…` (`components/admin/PendingPanelDiscardButtons.tsx:116-118`), both `disabled` (`components/admin/PendingPanelDiscardButtons.tsx:104`) |
| C → A | yes | Instant. Success resets to idle and calls `router.refresh()` (`components/admin/PendingPanelDiscardButtons.tsx:97-98`) |
| A → D | **no** | The first Ignore tap arms and returns (`components/admin/PendingPanelDiscardButtons.tsx:56-64`), so the path is A → B → D |
| D → A | yes | Instant. Same success reset as C → A |
| A → E | **no** | An error requires an attempt, so the path is A → C/D → E |
| E → A | **no** | Leaving error requires a new attempt; the path is E → C or E → F → D, then → A |
| A → F, F → A | **no** | F requires an error; A requires a success reset. No direct edge either way |
| B → C | yes | Instant. Defer while armed disarms and starts the defer. Pinned at `tests/components/admin/pendingIngestionActions.test.tsx:232` |
| C → B | **no** | Both buttons are `disabled` while running (`components/admin/PendingPanelDiscardButtons.tsx:113`, `components/admin/PendingPanelDiscardButtons.tsx:124`) |
| B → D | yes | Instant. The second Ignore tap fires the discard; disarm and run set in one handler, so no resting frame renders |
| D → B | **no** | Same disabled-while-running reason |
| B → E | **no** | `handleClick` disarms before it can set an error, so the path is B → D → E |
| E → B | **no** | Arming from a plain error lands in F, not B — `state` is untouched |
| B → F, F → B | **no** | `state` cannot move between `idle` and `error` without a running cell in between |
| C → D, D → C | **no** | `handleClick` returns early while a run is in flight (`components/admin/PendingPanelDiscardButtons.tsx:72`); one mutation at a time by construction |
| C → E | yes | Instant. The error block mounts below the row (`components/admin/PendingPanelDiscardButtons.tsx:144-153`). No enter animation today |
| E → C | yes | Instant. Tapping Defer from a plain error starts a defer directly — Defer is one-tap and needs no arming |
| D → E | yes | Instant, same as C → E |
| E → D | **no** | From a plain error the first Ignore tap arms into F; only F → D fires the discard |
| C → F, D → F | **no** | A run resolves into E, never into F, because resolving does not arm |
| F → C | yes | Instant. Defer from the compound state disarms and starts a defer. §6.2 test 11 |
| F → D | yes | Instant. The second Ignore tap from the compound state fires the discard. §6.2 test 11 |
| E → F | yes | Tapping Ignore while an error shows arms the button **and the error block stays mounted** — it describes the previous failed attempt, which is still true. §6.2 test 9 |
| F → E | yes | The 4s timer clears `armed` only, leaving `state.kind === "error"` (`components/admin/PendingPanelDiscardButtons.tsx:60-63`). The compound decays to plain error, never to idle. §6.2 test 10 |

Reachable edges: A→B, B→A, A→C, C→A, D→A, B→C, B→D, C→E, E→C, D→E, F→C, F→D, E→F, F→E — **fourteen**. Every one has a treatment above; `E → C` in particular is a real edge the previous draft omitted entirely, and §6.2 test 12 covers it.

**Compound transitions across the fork:**

| Case | Treatment |
|---|---|
| Container crosses 576px while **armed** | `armed` lives above both copies, so the newly-shown copy renders already-armed. The single `armTimerRef` (`components/admin/PendingPanelDiscardButtons.tsx:48`) is shared, so no re-arm and no timer reset. Note both copies stay **mounted** throughout — this is a display swap, not a mount, and the morph transition does not replay. §6.2 test 4. |
| Container crosses 576px while **focused** | The focused button becomes `display:none` and focus falls to `<body>`. **Not fixed by this spec** — accepted limitation, filed as `BL-DESTRUCT-FORK-FOCUS-TRANSFER` (§4.9). No test asserts a transfer, because no transfer ships. |
| Container crosses 576px while **running** | `state` is shared, so the newly-shown copy renders `Deferring…`/`Ignoring…` and `disabled` immediately. |
| 4s auto-revert fires mid-resize | No interaction; the timer is width-independent and clears one shared flag. |
| Unmount while armed | `useEffect(() => clearArmTimer, [])` (`components/admin/PendingPanelDiscardButtons.tsx:55`) clears it. **Unchanged**; pinned at `tests/components/admin/pendingIngestionActions.test.tsx:269`. |

### 4.9 Focus across the fork boundary — accepted limitation, not fixed here

Because both copies stay mounted and the fork swaps which one is `display:none`, a container resize that crosses the threshold while one of these buttons holds keyboard focus drops focus to `<body>`. Triggers: window resize, device rotation, browser zoom, and the dashboard's own `min-[1240px]` grid switch.

**This spec does NOT fix it.** An earlier draft specified a `ResizeObserver`-driven focus transfer. Adversarial review round 2 showed that contract cannot be honestly verified by the vehicle available: `tests/e2e/pendingDiscardReflow.layout.spec.ts` is a **transcribed static-HTML** harness (`tests/e2e/pendingDiscardReflow.layout.spec.ts:51`) that imports no component chain, so any `ResizeObserver` behaviour asserted there would be a transcription of the effect, not the shipped effect. The source guard checks layout classes only — never observer setup, crossing detection, cleanup, refs, or the `focus()` call — so the suite could pass with the production effect absent or broken. Shipping an untestable a11y effect is worse than shipping a documented gap, and the project's three-round cap on design-correctness vectors says to descope rather than patch prose a third time.

**Severity and precedent.** The controls remain reachable by re-tabbing, so this is not a WCAG-A blocker; it is the same class and severity as `BL-CREWPAGE-ROTATE-FOCUS-MGMT`, an accepted P2 on a sibling control in this same family. Focus is lost only on a resize that crosses the threshold *while* one of these two buttons is focused — a narrow window.

**Filed, not forgotten.** A new backlog row `BL-DESTRUCT-FORK-FOCUS-TRANSFER` records the gap, the reason it was descoped (no real-component browser harness for this component), and the trigger to promote it: building a mounting harness of the kind that already exists for the Step 3 modal, or any a11y pass on the admin action rows. The `armed` flag is unaffected either way — it lives above both copies, so a crossing never re-arms or disarms.

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

Three new assertions (T1, T2, T3) added to `tests/styles/_metaDestructiveConfirm.test.ts`, which already walks `components/` and `app/` (`tests/styles/_metaDestructiveConfirm.test.ts:131-141`) and already fails by default on unregistered destructive-confirm surfaces (`tests/styles/_metaDestructiveConfirm.test.ts:150-166`). Reusing it means a **new** destructive surface that adopts the recipe is forced into the registry, and therefore into these assertions, with no second discovery mechanism to maintain.

**T1 — single declaration.** Walking `components/`, `app/` and `lib/`, exactly one file declares the identifier `ARM_REVERT_MS`, and it is the shared module. The assertion is an equality against a one-element list, not "at most one" — the latter passes on zero, which is the vacuous-pass failure mode described in §5.2.1 (C-B).

**T2 — the delay identifier must be a registered name.** For every non-exempt registry file, each `setTimeout` delay argument must be an **identifier drawn from an explicit allowlist**, never a numeric literal and never an unregistered name. The allowlist is a table in the test file: identifier → the surfaces allowed to use it → why it is not `ARM_REVERT_MS`.

| Identifier | Meaning | Allowed because |
|---|---|---|
| `ARM_REVERT_MS` | the 4s armed-state auto-revert | the ratified shared window (R8) |
| `SUCCESS_DISMISS_MS` | success-toast dismissal | a different affordance; per R6 its value is deliberately not unified |
| `WATCHDOG_MS` | stuck-request watchdog | not a confirm window at all |

A site may opt out with an inline `// not-arm-revert: <reason>` comment.

**Why an allowlist and not just a literal ban.** A ban on numeric literals alone is fail-open: `const CONFIRM_TIMEOUT = 3_000; setTimeout(cb, CONFIRM_TIMEOUT)` passes a literal ban (the delay is an identifier), passes T1 (it never declares `ARM_REVERT_MS`), and passes T3 (the shared value is still 4s). A registered surface could drift to a 3-second window with every guard green.

**Four further bypasses, each closed explicitly.** Round-2 review enumerated these; they are holes *inside* registry membership, so §5.3's "surface outside the registry" limitation does not cover them.

| # | Bypass | Closure |
|---|---|---|
| B1 | **Import aliasing.** T1 must ignore import bindings so the eleven migrated files pass, so `import { THREE_SECONDS as ARM_REVERT_MS } from "./elsewhere"` satisfies T2 by local identifier while T1 and T3 stay green — without using the shared module | T1 additionally asserts that every file *referencing* `ARM_REVERT_MS` either declares it (the one shared module) or imports it **from `@/lib/admin/destructiveConfirm` specifically**, matched on the module specifier, with no local rename of a foreign binding to that name |
| B2 | **Non-`setTimeout` schedulers.** `setInterval`, `AbortSignal.timeout`, a `delay()` helper, or an aliased `const t = setTimeout` all introduce a revert window T2 never inspects | T2 scans a **scheduler set** — `setTimeout`, `setInterval`, `AbortSignal.timeout`, `requestIdleCallback` with a `timeout` option — and additionally fails on any *aliasing* of those identifiers inside a registry file |
| B3 | **Exemption scope.** A file-level raw-source check lets one legitimate `// not-arm-revert:` suppress every unrelated timer in the same file | The exemption binds to the **call**, not the file: it must appear on the scheduler call's own line or the line immediately above, and each exemption is consumed by exactly one call. Two timers need two comments |
| B4 | **Silent zero-detection.** A regex that matches nothing passes forever; a synthetic self-check can pass while multiline or nested-callback calls are skipped | T2 asserts the **count** of detected scheduler calls per registry file against a checked-in expected count, so a detector that stops seeing real calls fails. The self-check covers single-line, multiline, and nested-callback shapes, plus a negative case per bypass above |

| B5 | **Wrapper helpers.** `delay(CONFIRM_TIMEOUT)`, `scheduleRevert(cb, CONFIRM_TIMEOUT)`, or a `useTimeout(cb, CONFIRM_TIMEOUT)` hook schedules a revert without naming any scheduler in the set. B4's per-file count does not catch it either: a **newly** registered surface legitimately starts at zero detected calls, so it passes with nothing to compare against | T2 additionally fails a registry file that **references an unallowlisted identifier in any call-argument position** where the identifier's name matches `/(?:MS|_MS|TIMEOUT|DELAY|INTERVAL)$/`. That is a heuristic, and it is declared as one: it catches the named-constant shape these wrappers need, not every possible indirection |

B4's count assertion makes B1-B3 trustworthy: without it, those closures could silently stop matching and the suite would stay green. B5 is deliberately a heuristic rather than a proof — see §5.3, which no longer claims the unregistered surface is the only hole.

**T3 — value pin.** `ARM_REVERT_MS === 4_000`, with the ratification cited in the failure message so a future edit to the shared value is a loud test failure rather than a quiet change.

**Matcher self-checks.** Following the existing pattern at `tests/styles/_metaDestructiveConfirm.test.ts:143-148`, T1 and T2 each ship a self-check proving the detector fires on a synthetic positive and does not fire on a synthetic negative — including, for T2, a synthetic `CONFIRM_TIMEOUT` case proving the allowlist actually rejects an unregistered identifier. Without that case the allowlist could be empty-by-accident and everything would still pass.
### 5.2.1 Two implementation constraints that would otherwise fail silently

Both were found by reading the helpers the guard will reuse, not by reasoning about them. Each produces a guard that *passes* while doing nothing, which is the worst failure mode for a structural test.

**C-A — the exemption comment must be read from RAW source.** `stripComments` (`tests/styles/_classScanUtils.ts:15-17`) deletes every `//` comment before returning, and the existing registry feeds its scan through it (`tests/styles/_metaDestructiveConfirm.test.ts:134`). If T2's exemption lookup reuses that stripped text, `// not-arm-revert: <reason>` is invisible: the exemption never applies, an author who correctly adds one still sees a red test, and the likely next move is deleting the guard rather than debugging it. T2 therefore reads the file **twice** — stripped text for locating `setTimeout` calls (so a commented-out example cannot trip it) and raw text for the exemption comment. The plan's test for this asserts an exempted fixture actually passes, which is the only way to prove the raw read happened.

**C-B — T1 must walk `lib/`, which the existing registry does not.** `_metaDestructiveConfirm.test.ts:131` iterates `["components", "app"]` only. The shared constant lives in the new **lib/admin/destructiveConfirm.ts**, so a T1 that inherits that root list would scan every directory *except* the one holding the single legitimate declaration — and would then report zero declarations found, passing vacuously while proving nothing. T1 walks `["components", "app", "lib"]` and asserts the count of declaring files is exactly one **and** that the one is the expected path. Asserting only "at most one" would pass on zero.

### 5.3 Honest scope statement

The guard **reduces** re-drift within registry membership; it does not eliminate it, and the earlier claim that it could not silently re-drift was too strong. Two holes remain, one inside registry membership and one outside.

**Inside membership:** a newly registered surface that schedules through a wrapper — `delay(3_000)`, `scheduleRevert(cb, confirmTimeout)` — has zero direct scheduler calls, so B4's count has nothing to compare, and a lowercase name defeats B5's uppercase-suffix heuristic. B5 is a heuristic and is labelled one; this is the case it misses.

**Outside membership:** a wholly new destructive surface that never adopts the recipe token pair is invisible to the registry, by the registry's own declared scope (`_metaDestructiveConfirm.test.ts:10-12`), and so escapes T2 entirely. Such a surface still trips T1 the moment it names its constant `ARM_REVERT_MS` — but not if it invents `CONFIRM_TIMEOUT = 3000`. That residue is review-time territory, exactly as the existing registry says. The limitation is stated in the guard's header comment rather than papered over, and the guard is strictly better than today, where even the copy-paste-the-name case is unguarded.

Per R6, `SUCCESS_DISMISS_MS` keeps its own per-file value and is **not** unified — but note T2 covers it incidentally, since T2 forbids the literal rather than requiring a particular constant. That is intentional and costs nothing: a success-toast timer must also be *named*, without this spec dictating what its value should be.

---

## 6. Verification

### 6.1 What jsdom cannot prove

jsdom applies no CSS (`feedback_jsdom_no_css_tobevisible_vacuous`). `toBeVisible()` on a `hidden @min-[576px]:flex` node is vacuous there, and `getBoundingClientRect()` returns zeros for everything. Therefore **every** claim in §4.7 — one copy per container width, stacked order, width stretch, box equality — is a real-browser assertion. jsdom covers only structure, labels, classes, and handler behaviour.

### 6.2 jsdom (`tests/components/admin/pendingIngestionActions.test.tsx`)

Existing tests retarget to the `-inline-` ids per §4.4 (jsdom mounts both copies, so either resolves).

**One existing test needs more than an id swap.** The persistent-status test at `tests/components/admin/pendingIngestionActions.test.tsx:282` reaches the live region via `btn.nextElementSibling`, and re-checks that adjacency after the timer decays. §4.3 moves the region out of the row, so the inline Ignore's next sibling becomes `null` and the test fails on a null deref — not on a changed assertion. It is rewritten to locate the region by `getByRole("status")` (now unambiguous, since exactly one exists per §6.2 test 6) and keeps every behavioural assertion it already made: initially empty, populated on arm, emptied but **never unmounted** after the 4s decay. The claim "no assertion semantics change" applies to the other tests, not this one.

New tests, each stating the concrete failure mode it catches:

| # | Test | Failure mode caught |
|---|---|---|
| 1 | all four variant ids present | the fork rendered only one copy |
| 2a | **parity:** stacked and inline Ignore have equal `textContent` and equal class token sets, compared to each other; likewise Defer | the two copies drift **apart** |
| 2b | **canonical tokens:** each rendered button carries every token in a literal required set (`inline-flex`, `min-h-tap-min`, `items-center`, `justify-center`, `rounded-sm`, `px-3`, `text-sm`) | the two copies drift **together** — e.g. `min-h-tap-min` removed from the shared helper, which 2a cannot see because both copies lose it equally |
| 3 | parity again after arming | the armed branch drifts in one copy only |
| 4 | arming via stacked morphs inline, and vice versa | per-copy `armed` state instead of one shared flag |
| 5 | arm on stacked, confirm on inline → exactly one POST with `kind: "permanent_ignore"` | per-copy state, which would make the second tap a no-op re-arm |
| 6 | exactly one `role="status"` node, outside both copies | double screen-reader announcement |
| 7 | stacked container carries `flex`, `flex-col`, `items-stretch`, `@min-[576px]:hidden`; inline carries `hidden`, `flex-wrap`, `@min-[576px]:flex` | the missing-`flex` trap of §4.1 — `flex-col items-stretch` without `flex` leaves `display:block` and `items-stretch` inert |
| 8 | `compareDocumentPosition` ordering within each copy | DOM order wrong even when classes are right |
| 9 | arming while an error is displayed keeps the `role="alert"` block, with unchanged text | a fork that resets `state` on arm, swallowing the explanation of the failure the operator is looking at |
| 10 | from error+armed, advancing the 4s timer clears `armed` and **leaves** the error block mounted | a timer that resets `state` as well, or an inventory that assumed the compound decays to idle |
| 11 | from error+armed: clicking Defer starts a defer; separately, a second Ignore click fires exactly one discard | the two compound-state exits (F→C, F→D), neither previously covered |
| 12 | from a **plain** error, clicking Defer starts a defer directly | the E→C edge, omitted from every earlier draft of the inventory. Defer is one-tap and needs no arming, so this is a distinct path from F→C |

2a and 2b are deliberately complementary: parity catches divergence, the literal allowlist catches shared regression. Neither alone is sufficient, and the plan does not claim otherwise.

Focus behaviour is not asserted here or anywhere: §4.9 descopes the transfer, so there is no shipped effect to assert. jsdom could not host it in any case.

### 6.3 Real browser — two harnesses, and why both

Review rounds 2 and 3 both landed on the same defect: a **transcribed** harness can satisfy every assertion while the shipped component differs. The concrete case is `w-full` on the `@container` root — load-bearing per §4.1, yet a transcribed panel supplies it from the harness, independently of the component. Production could drop `w-full`, collapse to 0px, and jsdom, the source scan and the browser harness would all stay green.

Patching a third round of prose would not close that. The structural fix is a **real-component mounting harness**, following the pattern already used by `tests/e2e/_statusStripToggleHarness.tsx` and `tests/e2e/_publishedReviewModalHarness.tsx`.

#### 6.3.a `tests/e2e/_pendingDiscardHarness.tsx` — the real tree (authoritative)

`tsx` runs it out of process; it renders the **real `NeedsAttentionInbox`** with one `pending_ingestion` item, which renders the **real `PendingPanelDiscardButtons`** inside the real card padding, the real `flex flex-wrap items-center gap-2` action row and the real `Retry now` sibling. `renderToStaticMarkup` emits that tree as JSON; the spec compiles token CSS from `app/globals.css`, serves it, and measures. Every class and every nesting relationship measured comes from the component itself — nothing is transcribed, so nothing can be transcribed *wrongly*.

The only harness-supplied box is a bare `<div data-testid="rail" style="width:Npx">` at 320 / 390 / 900px, standing in for the dashboard rail, the mobile Needs-attention page, and a full-width card.

**Spike result (this harness, built and run before this section was written).** Against today's shipped markup at a 1280px viewport it reproduces the §2.5 defect from the real tree: at `rail320`, `admin-pending-ignore-*` sits **below** `admin-pending-defer-*`; at `wide900` they share a row with `Retry` inline. That is the §2.5 premise proven by the component, not by a transcription of it.

Assertions carried here, because each needs the real tree:

- **`w-full` and `@container` are present on the shipped root**, read off the rendered markup rather than the source — the assertion round 3 showed was missing everywhere.
- **The root is not collapsed:** its measured width equals **the action row's** width, which is what `w-full` actually means. Comparing against the *rail* would be wrong by the card's 42px of borders and padding — it would reject a correct implementation, or push it toward overflow. The row is the exact oracle and needs no magic constant.
- **Exactly one branch copy is displayed** at every rail, the hidden one measuring `0×0`.
- **The 576px threshold is exercised directly.** Rails of **617px and 618px** put the *component* container at 575px and 576px. The 42px card inset is **measured, not computed**: rendering the real tree at 320 / 390 / 617 / 618 / 900px rails gives action-row widths of 278 / 348 / **575** / **576** / 858px — an inset of exactly 42px at every rail, with the two threshold rails landing on 575 and 576 as intended. Below the threshold must stack with Ignore above Defer; at it, one row with Defer on the left. Without these two rails nothing tested the boundary the threshold rationale rests on — the 320/390/900 rails give component widths of 278 / 348 / 858px, none of them near 576.
- **D1** (buttons fill the stacked branch), **D2** (≥44px), **D3/D6** (inline branch order and armed growth from a pinned left edge), **D5** (Ignore above Defer when stacked).
- **Production nesting holds:** the action row, card padding and `Retry` sibling are the real ones, so a future change to `components/admin/NeedsAttentionInbox.tsx` that breaks the container relationship fails *this* spec.

**Declared scope, and the one thing it cannot reach.** `renderToStaticMarkup` emits markup, not behaviour: it cannot click, so it can only ever render the component's **initial idle** state, and `PendingPanelDiscardButtons` exposes no prop for an armed initial state (adding one would be product API existing solely for a test). So D4 (armed box equality) and D6 (armed growth from a pinned edge) **cannot be measured here**, and this harness does not claim them.

**Where armed geometry lives, and why that is still honest.** Armed differs from idle by exactly one thing: the Ignore button's className and label, both produced by the same `pair()` helper. So armed geometry is measured in the transcribed spec (§6.3.b) — but the transcription is **bound to the component** by a jsdom assertion that the real rendered armed className token set equals the harness's `IGNORE_ARMED` constant, token for token. If the component's armed skin changes and the constant does not, that binding test fails and the geometry panels are known to be stale. Transcription without a binding assertion is what rounds 2 and 3 rejected; transcription *with* one is a normal, checkable indirection.

Client effects (`useEffect`, timers) stay in the jsdom suite, and the descoped focus transfer stays unproven by design (§4.9).

#### 6.3.b `tests/e2e/pendingDiscardReflow.layout.spec.ts` — transcribed controls (negative only)

The existing transcribed spec is **kept, and narrowed to negative controls**, which is the one job transcription is legitimately good at: it must render markup the product no longer contains.

| Panel | Width / markup | Role |
|---|---|---|
| `nofork-278-*` | 278px, **today's** markup | ordering control — must show Ignore *below* Defer |
| `nobasis-328-*` | 328px, pre-DESTRUCT-1 markup | reflow control, at the geometry the original defect was measured at (`docs/superpowers/specs/admin/2026-07-17-destruct1-armed-reflow.md:24`); at 278px the idle pair is already wrapped and cannot reproduce a *relocation* |

It also keeps the **armed** geometry panels (D4 and D6), which 6.3.a structurally cannot reach — with the §6.3.a binding assertion standing behind them. Every other positive claim moved to 6.3.a, and the drift-guard moved with them, where it reads rendered markup rather than grepping source.

### 6.4 CI wiring (R5)

- New `package.json` script `test:e2e:destructive-layout`, running `tests/e2e/pendingDiscardReflow.layout.spec.ts` under `tests/e2e/standalone.config.ts` (the config must be passed explicitly; Playwright's default config matches none of these specs).
- New workflow **.github/workflows/destructive-layout-e2e.yml**, modelled directly on `.github/workflows/modal-header-layout-e2e.yml` — same `actions/setup`, same Playwright browser cache, same failure-artifact upload, same `workflow_dispatch:` so close-out can fire it with `gh workflow run`. The harness self-hosts, so no `webServer` and no Supabase are needed; unlike the modal-header job it also needs no env block, because this harness renders static HTML strings and imports no server chain.
- `paths:` triggers on `components/admin/PendingPanelDiscardButtons.tsx`, **`components/admin/NeedsAttentionInbox.tsx`**, **`tests/e2e/_pendingDiscardHarness.tsx`** (the authoritative spec consumes it, so a harness-only change must re-run the job) (the parent that supplies the container the query measures — a change to the action row or card padding can break the fork without touching the component), the layout spec itself, `tests/e2e/standalone.config.ts`, `app/globals.css`, `package.json`, `pnpm-lock.yaml`, and the workflow file.
- **Coverage-registry row (mandatory companion).** `tests/ci/_metaE2eWorkflowCoverage.test.ts:84` currently records this spec as `UNSEEN`. Because the new workflow carries `pull_request.paths`, `tests/ci/_workflowCoverageScan.ts:105` classifies it as **`PATH_GATED`**, not universally covered. The row is updated to `PATH_GATED` in the same commit as the workflow. Leaving it at `UNSEEN` would keep a false claim that no workflow names the spec, while `BACKLOG.md` simultaneously says it is newly covered — the two would contradict, and the meta-test would fail.
- The `BL-STANDALONE-CONFIG-CI-DARK` row's "Partially closed" note in `BACKLOG.md` is updated to record that one more spec is now covered and the remainder still dark.

### 6.5 Full-suite gates before push

`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and real CI green. Per project rule, local green is necessary but not sufficient for a CI-bound surface.

**Every changed e2e spec runs, and each is named with its command.** `pnpm test` is Vitest-only, so a broken Playwright consumer survives it silently — which is exactly how the third consumer nearly shipped unverified.

| Spec | Command | Why it must run |
|---|---|---|
| `tests/e2e/pendingDiscardReal.layout.spec.ts` | `pnpm test:e2e:destructive-layout` | the authoritative real-tree proof |
| `tests/e2e/pendingDiscardReflow.layout.spec.ts` | same script | negative controls + armed geometry |
| `tests/e2e/needs-attention-page.spec.ts` | `pnpm test:e2e -- needs-attention-page` | **the only spec that exercises the real Next.js tree.** Its clicks retarget from the retired bare ids to the stacked ids; a wrong id or a wrong visibility assumption shows up here and nowhere else |

`tests/e2e/needs-attention-page.spec.ts` is currently `UNSEEN` in `tests/ci/_metaE2eWorkflowCoverage.test.ts`. Close-out either wires it into a workflow or records an explicit reasoned allowlist entry; it may not be left dark while this change retargets its selectors. Both layout specs flip to `PATH_GATED` with the new workflow.

---

## 7. BACKLOG.md changes

1. Delete the `BL-DESTRUCT-CONFIRM-COPY-HARMONIZE` and `BL-DESTRUCT-BULK-UNDO-SUCCESS-STATUS` rows.
2. Delete the `BL-DESTRUCT-STACK-THUMB-ORDER` row, resolved by this branch.
3. Update the `BL-STANDALONE-CONFIG-CI-DARK` row per §6.4.
4. **Add** `BL-DESTRUCT-FORK-FOCUS-TRANSFER` (§4.9): keyboard focus drops to `<body>` when a container resize crosses the fork threshold while one of the two discard buttons is focused. Severity low, class UI A11Y, same tier as the accepted `BL-CREWPAGE-ROTATE-FOCUS-MGMT`. Records why it was descoped — no real-component browser harness exists for this component, so the effect could not be verified without transcribing it — and the trigger to promote: a mounting harness of the kind that exists for the Step 3 modal, or any a11y pass on the admin action rows.

All three original rows are gone. The family section and its preceding `---` rule are removed; the one new row above is filed under the ordinary backlog body, not under a revived family heading.

**Where the history goes.** The section is deleted, so the resolution note cannot live on its heading. Each row's disposition is recorded in this branch's PR body and in `DEFERRED-archive.md`, which already carries the 2026-07-17 resolutions at `DEFERRED-archive.md:1224` and `DEFERRED-archive.md:1230` and gains a new entry for the thumb-order row. That is the project's existing home for closed work; duplicating it into a stub BACKLOG heading would create a second source of truth.

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
| A screen reader announces the arm twice | low | Live region rendered once, outside both copies (§4.3); asserted by §6.2 test 6 |
| The two copies drift apart | low | Single `pair()` helper; parity tests §6.2 tests 2a/3 |
| The two copies drift together | low | Canonical-token allowlist, §6.2 test 2b — parity alone cannot see this |
| Keyboard focus lost when the container crosses 576px | low, **accepted** | Not mitigated. Descoped in §4.9 and filed as `BL-DESTRUCT-FORK-FOCUS-TRANSFER`; controls stay reachable by re-tabbing, same tier as the accepted P2 on a sibling control |
| Both copies displayed at some width | very low | `@min-[576px]:hidden` / `hidden @min-[576px]:flex` are exact complements; asserted in a real browser at 280 / 576 / 720px container widths (§6.3) |
| Removing `basis-full` reintroduces the DESTRUCT-1 reflow | low | D4 assertion retained with its negative control; the rewritten drift-guard asserts `basis-full` is *absent*, so the two cannot both be true |
| Test-id rename misses a consumer | low | Consumers enumerated in §2.4 by grep; the bare ids cease to exist, so a missed consumer fails loudly rather than matching two nodes |
| The new workflow is itself dark | low | `workflow_dispatch:` enabled; close-out fires it with `gh workflow run` and confirms a green run before merge (§6.4) |
| T2's literal ban is bypassed by a named-but-wrong constant | medium | Closed by the T2 allowlist (§5.2): the delay identifier must be a registered name, so `CONFIRM_TIMEOUT` fails until someone adds a row and states why. Residual scope limit stated honestly in §5.3 |
