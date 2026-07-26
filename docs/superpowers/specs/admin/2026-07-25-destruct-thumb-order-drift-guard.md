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
| R2 | The fix is a **DOM reorder in ONE subtree**: Ignore precedes Defer, and `basis-full sm:basis-auto` is deleted so the row wraps on available width (§4.1). The owner chose this on 2026-07-26 after two earlier designs were tried and abandoned — a viewport-keyed fork (does not fix the 278px rail, where the defect actually lives) and a container-keyed fork (works, but nine review rounds could not converge on verifying it). Still ruled out: a CSS `order` flip, `flex-row-reverse`, and grid line placement, all of which desync visual from focus order (WCAG 2.4.3) — the original reason this was deferred rather than patched. A global DOM swap was *also* on that ruled-out list and is what shipped; §2.5 is the measurement that overturned it. | Owner decisions 2026-07-25/26; evidence in §2.5 and §4.1. |
| R3 | **Withdrawn.** R3 ratified the cost of duplicating a destructive control, which the fork required. The reorder has one subtree and one copy of each control, so there is nothing to contain. | Superseded by R2. |
| R4 | The existing test ids `admin-pending-defer-${id}` / `admin-pending-ignore-${id}` are **kept unchanged**. An earlier fork design retired them, because a bare id resolving to one of two live copies is genuinely ambiguous; with one subtree there is nothing to disambiguate, so no consumer needs retargeting. | This spec §4.1. |
| R5 | Wiring `tests/e2e/pendingDiscardReflow.layout.spec.ts` into CI is **in scope**, because it is this change's verification vehicle. It currently runs in no workflow (`tests/e2e/standalone.config.ts:36` lists it, but `package.json:52` names only four other specs). Note the config itself IS invoked by `.github/workflows/modal-header-layout-e2e.yml:106` — it is *this spec* that is dark, not the config, per the `BL-STANDALONE-CONFIG-CI-DARK` row in `BACKLOG.md`. A guard that runs in no CI is not a guard. This spec does **not** attempt the rest of `BL-STANDALONE-CONFIG-CI-DARK`'s ~15 other dark specs. | `AGENTS.md` cross-cutting rule "Local-passes-CI-fails is its own bug class"; that row's "Partially closed" note. |
| R6 | The drift guard pins the **arm-revert duration only**. It does not pin `SUCCESS_DISMISS_MS` (`app/admin/show/[slug]/PickerResetControl.tsx:121`, `app/admin/show/[slug]/ResetPickerEpochButton.tsx:118`) — a success-toast dismissal is a different affordance with no ratified shared value. Widening the guard to all admin timers is out of scope. | This spec §5.3. |
| R7 | `tests/styles/_metaDestructiveConfirm.test.ts` is **not replaced**. Its declared scope (`tests/styles/_metaDestructiveConfirm.test.ts:10-12`) is recipe-token growth. The new guard is a sibling assertion living in the same file; it does **not** consume the recipe registry — T1/T3 inspect where `ARM_REVERT_MS` is declared and what it equals, nothing more. An earlier revision of this row claimed registry-driven discovery, which §5.2 contradicts and the implementation never did (R12 F3). | This spec §5.2. |
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
| `tests/e2e/needs-attention-page.spec.ts` | unchanged — no command required | **No retarget happened.** The reorder keeps the existing test ids, so this spec's only diff is a corrected source comment. An earlier draft described retargeting it off retired ids and demanded its coverage row be un-darkened as an acceptance gate; that was written for the abandoned fork design, which did retire the ids. Its `UNSEEN` row is pre-existing and out of scope here — `BL-STANDALONE-CONFIG-CI-DARK` owns it. R4 F4 caught the stale requirement. |

`tests/help/_uiLabelExceptions.ts`, `tests/help/page-dashboard.test.tsx` and `tests/messages/_metaEmphasisRenderContract.test.ts` reference the component but **not** these test ids (verified by grep).

**Label-coupling check.** Retained from the abandoned fork design, which rendered each label twice and so would have broken any test counting rendered label occurrences. The reorder renders each once, so the risk is gone — but the sweep is worth keeping as a record that none exists: every other reference to the strings `"Defer until modified"` / `"Permanently ignore"` is either help-page MDX prose (`app/help/admin/dashboard/page.mdx:39`, `app/help/admin/onboarding-wizard/page.mdx:96`) or a **source-text** scan of that MDX (`tests/help/page-dashboard.test.tsx:76-77`, using `expect(src).toContain(...)`), not a DOM query. `tests/help/_uiLabelExceptions.ts:135-143` declares the two labels as help-page exceptions keyed on `label` + `file`, with no count and no DOM involvement. None of these change.

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

**Goals.** (G1) Wherever the two controls stack, the safe action is the lower of the two. (G2) Wherever they genuinely fit side by side, they stay side by side rather than stacking unnecessarily — the owner's stated constraint. Note this **inverts** the previous Defer-left convention: Ignore is now left wherever they share a line, which is the accepted cost of ordering the DOM for the wrap case (D3, and the §12 close-out records the impeccable critique's dissent). (G3) Visual order and focus order agree at every width — no `order`, no `flex-row-reverse`, no grid line placement that would desync them. (G4) The harmonized 4s arm-revert is substantially harder to re-drift, and every remaining hole is enumerated in §5.3 rather than claimed closed. (G5) BACKLOG reflects reality.

**Non-goals.** Changing the 4s value (R8).

**Scope changed mid-run, twice, by owner decision — recorded rather than back-dated.** An earlier draft listed "changing any confirm label" as a non-goal and R2's ruled-out list included "a global DOM swap". The shipped change does **both**. That is not drift: on 2026-07-25 the owner redirected first to the container-keyed fork and then, after nine review rounds on its verification cost, to the plain reorder — and separately asked whether shortening the copy would help, which measurement showed it would. The original rule-out of a global DOM swap was made before the 278px rail was measured; the evidence that overturned it is §2.5. The impeccable critique correctly flagged the contradiction (P2) because the spec still carried the superseded wording.

**Also out of scope:** touching the other ten destructive surfaces' markup (they get an import swap only), closing the rest of `BL-STANDALONE-CONFIG-CI-DARK` (R5), guarding non-arm timers (R6), and any DB, RPC, advisory-lock, API-route or `§12.4` catalog change — this diff touches none.

---

## 4. Design — reorder, one subtree

### 4.1 The change

Two edits to `components/admin/PendingPanelDiscardButtons.tsx`:

1. **Swap the DOM order** so Ignore precedes Defer inside the existing `flex flex-wrap gap-2` row.
2. **Delete `basis-full sm:basis-auto`** from both buttons, so the row wraps on available width instead of being forced full-width below the `sm` viewport.

No container query, no fork, no second copy, no threshold, no new test ids.

Shipped alongside it, from the impeccable gate and the reviews that followed: the armed label change (§4.2), the visible consequence line, `aria-busy` while running, `ring-offset-surface` per `DESIGN.md:40`, and an `event.repeat` guard so a held Enter cannot arm and confirm in one press. "Nothing else" referred to the *layout* mechanism and read as broader than intended.

**Why this works.** `flex-wrap` already decides per-container whether the pair fits. What was wrong was only the *order* it wrapped into. With Ignore first, a wrap puts Ignore on the upper line and Defer below — the safe control nearest the thumb — and where there is room, nothing wraps at all.

Measured against the real card geometry (available content widths 278 / 316 / 398 / 858px):

| Geometry | Idle | Armed |
|---|---|---|
| 320px dashboard rail (278px content) | stacked, Ignore above | stacked, Ignore above |
| 358px mobile page (316px content) | knife-edge — 315.95px against 316px, asserted neither way | identical to idle, whichever way it lands |
| 900px card (858px) | **side by side** | **side by side** |

Safe in every case, and it stacks only where the pair genuinely does not fit.

**D4 is structural, but it took two mechanisms — and the first one alone was not enough.** Ignore being the first flex item fixes its origin *within* the row. It does not fix the row's own position: because `"Confirm ignore"` is shorter than `"Permanently ignore"`, arming used to shrink the whole discard island, and at parent widths around 440-460px that let the island un-wrap from below `Retry now` to beside it — carrying the confirm target **dx +107.2px, dy −52px between the two taps**. That is the DESTRUCT-1 defect, and this spec claimed structural immunity to it for several revisions. Whole-diff review R9 F1 caught it.

The second mechanism closes it: the Ignore button reserves the width of its **widest label variant**, so its width — and therefore the island's — is identical in every state and no wrap transition can occur on arm at any parent width.

The reservation is **structural, not numeric** (`IgnoreLabelStack`, `components/admin/PendingPanelDiscardButtons.tsx`). All three label variants stay mounted in one grid cell; the inactive ones carry `invisible` (`visibility: hidden`), which suppresses painting and drops them from the accessibility tree while their boxes still lay out. The track is the widest variant *as actually rendered*, each span carrying its own weight, so armed is measured at `font-semibold` even while idle shows.

An earlier revision used a numeric floor (`min-w-ignore`, `--spacing-ignore: 10rem`) and whole-diff R10 F1 refuted it: a floor holds the invariant only while every label stays under it. Firefox text-only zoom and a minimum-font-size setting enlarge text without touching rem lengths, so the longer idle label escapes the floor while the shorter armed one does not — arming shrinks the island again and the R9 transition returns. The same floor also reserved a fixed 10rem that a scaled root font turns into 320px inside a 246px card. A floor that can stop being binding is not an invariant; the stack cannot stop being binding, because it *is* the rendered labels.

Verified by sweeping **125 rail widths from 280 to 900px**: zero widths where Ignore moves on arm, zero where its width drifts on arm, and zero where Defer is the upper control. The 440px case is kept as a permanent regression rail, and `bigtext440` pins the enlarged-text condition that defeated the floor.

### 4.2 Armed label

`"Confirm stop tracking this sheet permanently"` (328.51px) becomes **`"Confirm ignore"`** (125.64px), and the live region takes the consequence: `"Tap again to stop tracking this sheet permanently."`

Note the direction: `"Confirm ignore"` (125.64px) is **shorter than the idle label** `"Permanently ignore"` (153.2px). Every earlier revision of this spec described a longer armed label pushing Defer rightward; that was true of the old 328.51px string and is false of this one (R8 F2). It is also why a shrinking armed label — not a growing one — is what carried the confirm target across a wrap boundary in R9 F1.

Because the stack reserves the widest variant, the shorter armed label no longer narrows anything: measured, Ignore is **153.2px in both states** and the pair is **315.95px in both states**, at every rail. At the real mobile page that pair sits 0.05px inside the 316px available — a genuine coin flip on font metrics, which is why no rail asserts one-line-vs-stacked there. It is harmless for D4 precisely because idle and armed are dimensionally identical: whichever way a knife-edge width lands, *both* states land the same way, so no tap can move the target.

**A first attempt at this got it wrong, and the impeccable critique caught it.** The label was briefly `"Tap again to confirm"` — which is *verbatim* what the live region already announced. The pair then conveyed strictly **less** than before: the instruction was stated twice and the consequence nowhere. It also broke the family idiom (`ArchiveShowButton` "Confirm archive", `ResolveAlertButton` "Confirm dismiss").

The shipped split is label = **verb**, live region = **consequence**:

- `"Confirm ignore"` matches the family idiom exactly. With the reserved width both states measure 153.2px, so the armed row is the same size as idle rather than narrower.
- The live region now says what dies, so a screen-reader user hears the consequence at the moment it matters.
- For a sighted user the permanence signal is carried by the idle label they just tapped ("Permanently ignore"), the amber fill, and the second deliberate tap.

`"Confirm ignore forever"` was measured (176.8px) and **rejected**: it is wider than the idle label, so it would become the reserved width and make *every* state 176.8px, pushing the pair to 339.5px against the 316px mobile page. Note this is a sizing argument, not a drift argument — the structural stack would reserve the longer variant in every state, so width would stay invariant (R11 F3 corrected an earlier claim that it would reintroduce drift).

The **idle** labels are unchanged. "Permanently ignore" and "Defer until modified" carry the safety words, and `tests/help/_uiLabelExceptions.ts:135-143` pins both against the help MDX — shortening them would trade real clarity for the one geometry (the 278px rail) that still cannot fit a row.

### 4.3 What this design does not need

Recorded because earlier drafts specified all of it, and six review rounds were spent verifying it:

| Not needed | Why |
|---|---|
| `@container` + `w-full` | no container query; nothing establishes a containment context, so the 0px-collapse failure cannot occur |
| 576px threshold, 617/618px probe rails | no breakpoint of any kind |
| Two branch subtrees, per-branch test ids, one-copy-per-width assertions | one subtree |
| Focus transfer across a fork | no fork to cross; `BL-DESTRUCT-FORK-FOCUS-TRANSFER` is withdrawn rather than filed |
| Variant-suffixed test ids | ids unchanged, so `tests/e2e/needs-attention-page.spec.ts` needs no retargeting |
| Most of the armed binding table | only the armed label and the two button classNames feed the armed row's width now |

### 4.4 Guard conditions for the one prop

`pendingIngestionId: string` (`components/admin/PendingPanelDiscardButtons.tsx:20`) is unchanged by this work: non-empty renders normally; empty degrades the test ids and fails server-side through the existing error branch (`components/admin/PendingPanelDiscardButtons.tsx:100`); `null`/`undefined` are rejected by TypeScript at the call site. No new failure mode, no new guard.

### 4.5 Dimensional invariants

| # | Claim | Guaranteed by | Verified by |
|---|---|---|---|
| D1 | when the row wraps, `ignore.bottom ≤ defer.top` | Ignore is the first flex item | §6.3 at 278px, idle and armed |
| D2 | both buttons ≥44px tall | `min-h-tap-min` (`app/globals.css:162`) | §6.3 at every width |
| D3 | where the pair fits, both sit on one line with Ignore left | `flex-wrap` with no basis | §6.3 at 398px and 858px — the widths with real slack, not the 316px knife edge |
| D4 | Ignore's box origin **and width** are identical idle vs armed | Two mechanisms: Ignore is the **first** flex item, fixing its origin within the row; and `IgnoreLabelStack` reserves the widest label variant, fixing the island's width so the row itself cannot re-wrap on arm | §6.3 comparing idle and armed panels at 4 rails, plus `bigtext440` under enlarged text |
| D7 | shipped markup contains no `basis-full` and no `sm:basis-auto` | deleted in §4.1 | §6.3, read off rendered markup |

### 4.6 Transition inventory

The two-dimensional state model (`state` × `armed`) and its directed edge table are **unchanged** — that analysis was about the component's behaviour, not its layout, and it survived review in round 4. It stands as written in the appendix below.

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

Two assertions — **T1 and T3** — added to `tests/styles/_metaDestructiveConfirm.test.ts`, which already walks `components/` and `app/` (`tests/styles/_metaDestructiveConfirm.test.ts:131-141`) and already fails by default on unregistered destructive-confirm surfaces (`tests/styles/_metaDestructiveConfirm.test.ts:150-166`). Note what this does **not** buy: registry membership does not feed T1 or T3. Those two inspect only where `ARM_REVERT_MS` is declared and what it equals — they never read registry rows or look at a surface's timer. A newly registered surface can schedule its revert from some other value with both green, exactly as §5.3 says. They live in this file for cohesion, not because the registry extends their reach. R8 F3 caught the earlier wording implying otherwise.

**T1 — single declaration.** Walking `components/`, `app/` and `lib/`, exactly one file declares the identifier `ARM_REVERT_MS`, and it is the shared module. The assertion is an equality against a one-element list, not "at most one" — the latter passes on zero, which is the vacuous-pass failure mode described in §5.2.1 (C-B).

**T2 is withdrawn, and this is the third and final reconciliation of this section.**

Earlier revisions specified a per-file scheduler census, an import-provenance check, a scheduler-alias ban, and three meta-tests policing all of it. Six adversarial rounds found a new bypass in that machinery every round, and the sixth found it producing **false positives** — `const copy = "ARM_REVERT_MS"` or a type-only import would fail it. A guard that blocks harmless changes gets deleted by the next person who trips it, which is worse than no guard.

What ships is **T1** (exactly one declaration, in the shared module — asserted as equality against a one-element list, since "at most one" would pass on zero, and carrying a matcher self-check) and **T3** (the value is the ratified 4s, a direct assertion on the export that needs no self-check). Together they close the problem this work started from: eleven independently copy-pasted `4_000` literals, any one of which could drift.

### 5.3 Honest scope statement

T1 and T3 pin **where the constant lives and what it equals**. They do not, and cannot, detect a surface that points its arm timer at some other value: `const t = setTimeout; t(cb, 3_000)`, a wrapper like `delay(3_000)`, lexical shadowing, a third-argument trick, or a surface that never adopts the recipe pair at all.

That is not an oversight to be closed later. Answering it requires knowing **which call is the arm timer**, which is semantic; six rounds of adversarial review demonstrated a regex over source text cannot decide it, and the attempt actively harmed by rejecting valid code. It is review-time territory, and this section says so instead of implying a coverage the guard does not have.


---

## 6. Verification

### 6.1 What jsdom cannot prove

jsdom applies no CSS (`feedback_jsdom_no_css_tobevisible_vacuous`). `toBeVisible()` is vacuous there and `getBoundingClientRect()` returns zeros for everything. Therefore **every** dimensional claim in §4.5 — wrap order, one-line placement, tap height, armed box origin, `basis-full` absence — is a real-browser assertion. jsdom covers only structure, labels, classes, and handler behaviour.

### 6.2 jsdom (`tests/components/admin/pendingIngestionActions.test.tsx`)

jsdom computes no layout, so it pins **structure, labels, classes and handler behaviour**; every geometric consequence is proven in §6.3.

Existing tests keep their assertions; only the armed-label string changes. Two adjustments were required by the reorder, both real rather than cosmetic:

- The persistent-status test reached the live region via `btn.nextElementSibling`. The reorder puts Defer between Ignore and the region, so that lookup returns the wrong node. It now addresses the region by `role="status"`, which is unambiguous because exactly one exists — and it keeps every behavioural assertion it already made: initially empty, populated on arm, emptied but **never unmounted** after the 4s decay.
- The DESTRUCT-1 class test asserted `basis-full sm:basis-auto` were **present**. That is now inverted: D7 requires their absence.

New tests:

| # | Test | Failure mode caught |
|---|---|---|
| 2 | Ignore precedes Defer in the DOM | the entire fix — if the order regresses, a wrap puts the irreversible action nearest the thumb again. jsdom pins the order; §6.3 proves the geometry that follows from it |
| 6 | exactly one `role="status"` region, and it still announces on arm after the reorder | a duplicated or relocated live region, which would double-announce or go silent |
| 7 | neither button carries `basis-full` or `sm:basis-auto`, idle **or** armed | the class returning and forcing full-width stacking at every width, silently undoing the "don't stack when there's room" property |

The armed label is asserted from the component's exported `IGNORE_ARMED_LABEL`, not a literal, so this suite cannot drift from the harness or the component.

### 6.3 Real browser (`tests/e2e/pendingDiscardReal.layout.spec.ts`)

The real-component mounting harness built in round 3 is **kept** — it was the right call and is the only thing that measures the shipped tree rather than a transcription. `tests/e2e/_pendingDiscardHarness.tsx` renders the real `NeedsAttentionInbox` (hence the real `PendingPanelDiscardButtons`, real card padding, real action row, real `Retry now` sibling) at rails of 320 / 358 / 440 / 900px, plus a 440px rail with enlarged label text.

What changes is how little it now has to prove. Panels:

| Panel | Rail | Role |
|---|---|---|
| `rail320` | 320px (278px content) | the pair does not fit — must stack with Ignore above |
| `page358` | 358px rail / 316px content — the REAL mobile page | knife-edge (315.95px vs 316px), asserted neither way — and identical idle vs armed, so it lands the same way in both |
| `band440` | 440px (398px content) | the R9 F1 regression rail: where a shrinking armed island used to un-wrap beside `Retry now` |
| `bigtext440` | 440px with labels at 28px | the R10 F1 regression rail: enlarged text, where a numeric floor stops being binding |
| `wide900` | 900px (858px content) | fits with slack |

Assertions:

- **D1** — at `rail320`, `ignore.bottom ≤ defer.top + 0.5`, idle **and** armed.
- **D2** — both buttons ≥44px at every rail.
- **D3** — at `band440` and `wide900`, `ignore.y === defer.y` and `ignore.x < defer.x`. Not at `page358`: 315.95px against 316px is a font-metric coin flip, so that rail asserts the safety property whichever way it lands.
- **D4** — `ignore.x`, `ignore.y` **and `ignore.w`** (plus `defer.w`) are identical between the idle and armed panels at every rail. Width is asserted alongside the origin because width is the mechanism that keeps the origin fixed — R11 F2 caught the loop asserting only the origin. This is the DESTRUCT-1 guarantee, now structural (§4.1).
- **D7** — the rendered markup contains no `basis-full` and no `sm:basis-auto`.

**Armed panels are SUBSTITUTED, not re-rendered — stated precisely.** `renderToStaticMarkup` cannot click, and the component exposes no armed-initial prop. The harness therefore takes the idle markup and substitutes the component's **own exported** `IGNORE_ARMED_CLASS` plus the markup of `IgnoreLabelStack` rendered at `variant="armed"`, so neither can drift from the component. It swaps the rendered label STACK, not a label string — the stack is what reserves the width, so it is the whole difference the geometry tests measure.

What that proves is the armed **row's** token geometry — exactly what D1/D3/D4 measure. What it does **not** prove is the complete armed tree: the real armed render also fills the status region and mounts the consequence paragraph. Today that paragraph sits below the row and cannot affect row geometry, but **armed-only structure landing inside the row would invalidate these panels while they stayed green**. That limit is written in the harness file itself, not only here. Whole-diff review R3 F5 caught the earlier wording claiming these were real armed renders.

It is still enough to retire the binding table: with class and label sourced from the component there is no transcription left to bind, hence **no `MEASURED_ELEMENTS` and no M2**.

`tests/e2e/pendingDiscardReflow.layout.spec.ts` is the **historical** transcribed spec, and R5 F5 correctly caught the earlier description of it as inaccurate. What it actually contains, verified against the file:

| Test | Viewport | What it is |
|---|---|---|
| `fixed panel: armed ignore box == idle ignore box` | 360px | pre-existing DESTRUCT-1 assertion on the old `basis-full` markup |
| `NEGATIVE CONTROL: pre-fix classes DO reflow` | **420px** | the control. It renders **Defer-first** transcribed markup — the product's *previous* order, not its current one — and proves that shape wraps idle-on-one-line to armed-on-two. 420px, not 278px: at 278px the idle pair is already wrapped, so nothing contrasts |
| `fixed panel: >= sm the row does NOT wrap` | 720px | pre-existing |
| `negative control is HISTORICAL` | n/a | source guard asserting the component no longer contains `basis-full` |

So this file proves the **harness reproduces the old defect shape**; it does not measure current markup at the rail. The current-markup, same-geometry assertions all live in `pendingDiscardReal.layout.spec.ts` against the real component tree, which is where D1's non-tautology actually comes from.

### 6.6 Meta-tests — withdrawn

M1 (every `D`-invariant has a named assertion), M2 (measured elements are bound) and M3 (every cited jsdom test exists) were built to police the timing/binding machinery that §5.2 has since deleted. With that machinery gone they policed claims that no longer exist, and each had holes of its own that cost review rounds. All three are removed.

What remains is ordinary discipline: §4.5's invariants are asserted in `tests/e2e/pendingDiscardReal.layout.spec.ts`, and if one is deleted the assertion goes with it. That is weaker than a fails-by-default registry, and it is stated here rather than implied.


### 6.4 CI wiring (R5)

- New `package.json` script `test:e2e:destructive-layout`, running **both** `tests/e2e/pendingDiscardReal.layout.spec.ts` and `tests/e2e/pendingDiscardReflow.layout.spec.ts` under `tests/e2e/standalone.config.ts` (the config must be passed explicitly; Playwright's default config matches none of these specs). §6.5 depends on this script covering both — an earlier draft defined it as the reflow spec alone while §6.5 claimed both, which would have left the **authoritative** proof dark while the coverage row read `PATH_GATED`. The coverage meta-test does not validate reason text against the invoked spec list, so that contradiction would not have been caught by anything but a reader.
- New workflow **.github/workflows/destructive-layout-e2e.yml**, modelled directly on `.github/workflows/modal-header-layout-e2e.yml` — same `actions/setup`, same Playwright browser cache, same failure-artifact upload, same `workflow_dispatch:` so close-out can fire it with `gh workflow run`. The harness self-hosts, so no `webServer` and no Supabase are needed; unlike the modal-header job it also needs no env block, because this harness renders static HTML strings and imports no server chain.
- `paths:` triggers on `components/admin/PendingPanelDiscardButtons.tsx`, **`components/admin/NeedsAttentionInbox.tsx`**, **`tests/e2e/_pendingDiscardHarness.tsx`**, **`tests/e2e/pendingDiscardReal.layout.spec.ts`**, `tests/e2e/pendingDiscardReflow.layout.spec.ts`, `components/admin/PendingPanelRetryButton.tsx` and `components/shared/AccentButton.tsx` (the harness renders the real Retry sibling, whose width determines what the discard island receives), `tests/e2e/standalone.config.ts`, `app/globals.css`, `package.json`, `pnpm-lock.yaml`, and the workflow file.
- **Coverage-registry row (mandatory companion).** `tests/ci/_metaE2eWorkflowCoverage.test.ts:84` currently records this spec as `UNSEEN`. Because the new workflow carries `pull_request.paths`, `tests/ci/_workflowCoverageScan.ts:105` classifies it as **`PATH_GATED`**, not universally covered. The row is updated to `PATH_GATED` in the same commit as the workflow. Leaving it at `UNSEEN` would keep a false claim that no workflow names the spec, while `BACKLOG.md` simultaneously says it is newly covered — the two would contradict, and the meta-test would fail.
- The `BL-STANDALONE-CONFIG-CI-DARK` row's "Partially closed" note in `BACKLOG.md` is updated to record that one more spec is now covered and the remainder still dark.

### 6.5 Full-suite gates before push

`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and real CI green. Per project rule, local green is necessary but not sufficient for a CI-bound surface.

**Every changed e2e spec runs, and each is named with its command.** `pnpm test` is Vitest-only, so a broken Playwright consumer survives it silently — which is exactly how the third consumer nearly shipped unverified.

| Spec | Command | Why it must run |
|---|---|---|
| `tests/e2e/pendingDiscardReal.layout.spec.ts` | `pnpm test:e2e:destructive-layout` | the authoritative real-tree proof |
| `tests/e2e/pendingDiscardReflow.layout.spec.ts` | same script | negative controls + armed geometry |
| `tests/e2e/needs-attention-page.spec.ts` | unchanged — no command required | **No retarget happened**; the reorder keeps its test ids, so its only diff is a corrected source comment. See §2.4 |

Both layout specs flip to `PATH_GATED` with the new workflow. `needs-attention-page.spec.ts` keeps its pre-existing `UNSEEN` row: this diff does not change its selectors or its behaviour, so un-darkening it is `BL-STANDALONE-CONFIG-CI-DARK`'s job, not a gate on this change.

---

## 7. BACKLOG.md changes

1. Delete the `BL-DESTRUCT-CONFIRM-COPY-HARMONIZE` and `BL-DESTRUCT-BULK-UNDO-SUCCESS-STATUS` rows.
2. Delete the `BL-DESTRUCT-STACK-THUMB-ORDER` row, resolved by this branch.
3. Update the `BL-STANDALONE-CONFIG-CI-DARK` row per §6.4.
4. **No new row.** `BL-DESTRUCT-FORK-FOCUS-TRANSFER` was drafted for the fork design and is **withdrawn**: with one subtree there is no breakpoint crossing, so no focus can be lost to one.

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
| A screen reader announces the arm twice | low | One live region, unchanged by the reorder; asserted by §6.2 test 6 |
| The reorder fails to preserve DESTRUCT-1's zero-reflow guarantee | low | `basis-full` is deliberately **removed**, so its absence is required rather than a regression. The guarantee holds because Ignore is the first flex item AND reserves the width of its widest label variant, so the island's width is invariant and no wrap transition can occur on arm. R9 F1 showed first-flex-item alone was NOT sufficient: with a shrinking armed label the island un-wrapped beside Retry at ~440px, moving the target 107px. R10 F1 showed a numeric floor was not sufficient either: enlarged text outgrows it and the asymmetry returns. D4 plus the `band440` and `bigtext440` regression rails prove it |
| The new workflow is itself dark | low | `workflow_dispatch:` enabled; close-out fires it with `gh workflow run` and confirms a green run before merge (§6.4) |
| A surface points its arm timer at some other value | medium, **not mitigated** | T1/T3 pin where the constant lives and what it equals, nothing more. Detecting this needs to know which call IS the arm timer — semantic, and §5.3 explains why six rounds showed a regex cannot decide it |
