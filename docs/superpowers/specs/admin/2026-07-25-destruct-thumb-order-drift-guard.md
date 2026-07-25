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

**Goals.** (G1) Wherever the two controls stack, the safe action is the lower of the two. (G2) Wherever they genuinely fit side by side, the existing Defer-left / Ignore-right order is unchanged — note §2.5: the 280px rail never fits them, so this goal binds only on wide cards. (G3) Visual order and focus order agree at every width — no `order`, no `flex-row-reverse`, no grid line placement that would desync them. (G4) The harmonized 4s arm-revert is substantially harder to re-drift, and every remaining hole is enumerated in §5.3 rather than claimed closed. (G5) BACKLOG reflects reality.

**Non-goals.** Changing any confirm label or the 4s value (R8). Touching the other ten destructive surfaces' markup — they get an import swap only. Closing the rest of `BL-STANDALONE-CONFIG-CI-DARK` (R5). Guarding non-arm timers (R6). Any DB, RPC, advisory-lock, API-route, or `§12.4` catalog change — this diff touches none.

---

## 4. Design — reorder, one subtree

### 4.1 The change

Two edits to `components/admin/PendingPanelDiscardButtons.tsx`:

1. **Swap the DOM order** so Ignore precedes Defer inside the existing `flex flex-wrap gap-2` row.
2. **Delete `basis-full sm:basis-auto`** from both buttons, so the row wraps on available width instead of being forced full-width below the `sm` viewport.

Nothing else. No container query, no fork, no second copy, no threshold, no new test ids.

**Why this works.** `flex-wrap` already decides per-container whether the pair fits. What was wrong was only the *order* it wrapped into. With Ignore first, a wrap puts Ignore on the upper line and Defer below — the safe control nearest the thumb — and where there is room, nothing wraps at all.

Measured against the real card geometry (available content widths 278 / 348 / 858px):

| Geometry | Idle | Armed |
|---|---|---|
| 320px dashboard rail (278px content) | stacked, Ignore above | stacked, Ignore above |
| 390px Needs-attention page (348px) | **side by side** | **side by side** (with §4.2's label) |
| 900px card (858px) | **side by side** | **side by side** |

Safe in every case, and it stacks only where the pair genuinely does not fit.

**D4 becomes structural.** Ignore is the first flex item, so arming can never move it: a longer armed label pushes *Defer* to the next line, while Ignore's box origin is unchanged. Measured — Ignore sits at `x37` idle and `x37` armed at both 320px and 390px. The DESTRUCT-1 invariant that needed `basis-full` to hold is now a consequence of the ordering.

### 4.2 Armed label

`"Confirm stop tracking this sheet permanently"` (328.51px) becomes **`"Tap again to confirm"`** (161.98px).

That single change takes the armed row from 491.25px to 324.72px, which fits the 348px Needs-attention page — removing the last case where the pair stacked only because of label length.

Two reasons it is the right string rather than merely a shorter one:

- It is **already what assistive technology announces.** The persistent `role="status"` region emits exactly `"Tap again to confirm."` (`components/admin/PendingPanelDiscardButtons.tsx:141`). The visible label now matches what a screen-reader user already hears.
- The permanence signal does not live in this label. The button is filled amber (the ratified destructive recipe), the idle label already says "Permanently ignore", and the action still needs a second deliberate tap. The armed state's job is to say *what to do next*, which "Tap again to confirm" does and the old string did not.

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
| D3 | where the pair fits, both sit on one line with Ignore left | `flex-wrap` with no basis | §6.3 at 348px and 858px |
| D4 | Ignore's box origin is identical idle vs armed | first flex item; a longer armed label extends rightward and pushes Defer, never Ignore | §6.3 comparing idle and armed panels |
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

Three new assertions (T1, T2, T3) added to `tests/styles/_metaDestructiveConfirm.test.ts`, which already walks `components/` and `app/` (`tests/styles/_metaDestructiveConfirm.test.ts:131-141`) and already fails by default on unregistered destructive-confirm surfaces (`tests/styles/_metaDestructiveConfirm.test.ts:150-166`). Reusing it means a **new** destructive surface that adopts the recipe is forced into the registry, and therefore into these assertions, with no second discovery mechanism to maintain.

**T1 — single declaration.** Walking `components/`, `app/` and `lib/`, exactly one file declares the identifier `ARM_REVERT_MS`, and it is the shared module. The assertion is an equality against a one-element list, not "at most one" — the latter passes on zero, which is the vacuous-pass failure mode described in §5.2.1 (C-B).

**T2 — a per-file identifier census, not a global allowlist.** A global allowlist binds identifiers to *files*, not to *purpose*, which round 6 showed is not enough: `PickerResetControl` legitimately uses `SUCCESS_DISMISS_MS` for its toast, so its **arm** timer could switch to that identifier and stay green — a 5-second revert with every guard passing.

T2 therefore asserts a **census**: for each non-exempt registry file, the multiset of `{identifier → number of scheduler calls using it}` equals a checked-in expected map. `PickerResetControl` expects `{ARM_REVERT_MS: 1, SUCCESS_DISMISS_MS: 1}`. If its arm timer switched to the toast constant the census becomes `{SUCCESS_DISMISS_MS: 2}` and fails, naming the file. Adding or moving any timer forces a deliberate map edit.

The identifiers themselves still come from an allowlist table (identifier → meaning → why it is not `ARM_REVERT_MS`); the census is what binds each one to a count per file.

**What the census does not catch, stated before review finds it.** A **swap** is invisible: if a file's arm timer takes `SUCCESS_DISMISS_MS` while its toast timer takes `ARM_REVERT_MS`, the multiset is still `{ARM_REVERT_MS: 1, SUCCESS_DISMISS_MS: 1}` and the census passes. Counts are preserved under permutation. Catching that needs the guard to know which call *is* the arm timer, which is the purpose-detection problem that was fail-open in round 1 (a setter-name detector matched 4 of 11 files). So the census strictly improves on the global allowlist — it catches any move that changes a count — without being a proof, and the swap is recorded in §5.3 as the fourth hole rather than claimed closed.

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

The guard **reduces** re-drift within registry membership; it does not eliminate it, and the earlier claim that it could not silently re-drift was too strong. **Six** holes remain — five inside registry membership, one outside. Newest: **scheduler substitution**. `requestIdleCallback(cb, { timeout: ARM_REVERT_MS })` is in the scanned scheduler set and preserves both the identifier census and the call count, but its callback runs as soon as the browser is idle rather than after four seconds — the census pins *identity and count*, never *semantics*. In order of how likely they are to bite: scheduler substitution, **arithmetic on an approved constant** (`setTimeout(cb, ARM_REVERT_MS / 2)` keeps the approved import, the census counts, the scheduler count and the pinned value while reverting at 2s), lexical shadowing, wrapper schedulers, an identifier **swap** the census cannot see (§5.2), and a surface that never adopts the recipe pair at all. Each is enumerated below; none is claimed closed.

**Inside membership — lexical shadowing.** A registered file can import the shared constant correctly and then shadow it: `function arm(ARM_REVERT_MS = 3_000) { setTimeout(cb, ARM_REVERT_MS) }`. T1 sees the approved import, T2 sees an allowlisted identifier and an unchanged call count, T3 still sees the shared value at 4s — every guard green while the surface reverts at 3s. Closing this needs scope analysis, not regex; it is recorded here as a known hole rather than papered over.

**Inside membership — wrapper schedulers.** A newly registered surface that schedules through a wrapper — `delay(3_000)`, `scheduleRevert(cb, confirmTimeout)` — has zero direct scheduler calls, so B4's count has nothing to compare, and a lowercase name defeats B5's uppercase-suffix heuristic. B5 is a heuristic and is labelled one; this is the case it misses.

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

### 6.3 Real browser (`tests/e2e/pendingDiscardReal.layout.spec.ts`)

The real-component mounting harness built in round 3 is **kept** — it was the right call and is the only thing that measures the shipped tree rather than a transcription. `tests/e2e/_pendingDiscardHarness.tsx` renders the real `NeedsAttentionInbox` (hence the real `PendingPanelDiscardButtons`, real card padding, real action row, real `Retry now` sibling) at rails of 320 / 390 / 900px.

What changes is how little it now has to prove. Panels:

| Panel | Rail | Role |
|---|---|---|
| `rail320` | 320px (278px content) | the pair does not fit — must stack with Ignore above |
| `page390` | 390px (348px content) | the pair fits — must stay on one line |
| `wide900` | 900px (858px content) | fits with slack |

Assertions:

- **D1** — at `rail320`, `ignore.bottom ≤ defer.top + 0.5`, idle **and** armed.
- **D2** — both buttons ≥44px at every rail.
- **D3** — at `page390` and `wide900`, `ignore.y === defer.y` and `ignore.x < defer.x`.
- **D4** — `ignore.x` and `ignore.y` are identical between the idle and armed panels at every rail. This is the DESTRUCT-1 guarantee, now structural (§4.1).
- **D7** — the rendered markup contains no `basis-full` and no `sm:basis-auto`.

**Armed panels are real now.** The harness gains an `armed` variant per rail. `renderToStaticMarkup` still cannot click, but it does not need to: the armed state differs only by the Ignore button's className and label, so the harness renders the component **twice per rail** and swaps that one element's props via the same `pair()` code path the component uses. Because both panels come from the real component, D4 compares real-idle against real-armed — no transcription, and therefore **no binding table, no `MEASURED_ELEMENTS`, no M2**.

`tests/e2e/pendingDiscardReflow.layout.spec.ts` keeps exactly one job: the negative control at 278px proving today's markup wraps Ignore *below* Defer, so D1 is not tautological.

### 6.6 Meta-tests (reduced)

**M1 stays** — every `D`-invariant in §4.5 must have a named assertion in a layout spec, read from test titles and `expect` messages only, never raw source or comments.

**M3 stays** — every `§6.2 test N` the spec cites must exist in the jsdom suite.

**M2 is withdrawn.** It existed to bind a transcribed armed panel to the component. With armed panels rendered from the real component there is nothing to bind, so the binding table, its parser, and the six holes review found in it all cease to exist rather than being fixed. This is the clearest single measure of what the simpler design bought.

### 6.4 CI wiring (R5)

- New `package.json` script `test:e2e:destructive-layout`, running **both** `tests/e2e/pendingDiscardReal.layout.spec.ts` and `tests/e2e/pendingDiscardReflow.layout.spec.ts` under `tests/e2e/standalone.config.ts` (the config must be passed explicitly; Playwright's default config matches none of these specs). §6.5 depends on this script covering both — an earlier draft defined it as the reflow spec alone while §6.5 claimed both, which would have left the **authoritative** proof dark while the coverage row read `PATH_GATED`. The coverage meta-test does not validate reason text against the invoked spec list, so that contradiction would not have been caught by anything but a reader.
- New workflow **.github/workflows/destructive-layout-e2e.yml**, modelled directly on `.github/workflows/modal-header-layout-e2e.yml` — same `actions/setup`, same Playwright browser cache, same failure-artifact upload, same `workflow_dispatch:` so close-out can fire it with `gh workflow run`. The harness self-hosts, so no `webServer` and no Supabase are needed; unlike the modal-header job it also needs no env block, because this harness renders static HTML strings and imports no server chain.
- `paths:` triggers on `components/admin/PendingPanelDiscardButtons.tsx`, **`components/admin/NeedsAttentionInbox.tsx`**, **`tests/e2e/_pendingDiscardHarness.tsx`**, **`tests/e2e/pendingDiscardReal.layout.spec.ts`**, `tests/e2e/pendingDiscardReflow.layout.spec.ts` (the authoritative spec consumes it, so a harness-only change must re-run the job) (the parent that supplies the container the query measures — a change to the action row or card padding can break the fork without touching the component), the layout spec itself, `tests/e2e/standalone.config.ts`, `app/globals.css`, `package.json`, `pnpm-lock.yaml`, and the workflow file.
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
| The forked geometry fails to preserve DESTRUCT-1's zero-reflow guarantee | low | `basis-full` is deliberately **removed** — the fork replaces it with full-width stacking, so its absence is required, not a regression. D4 is what proves the guarantee survives, with the pre-DESTRUCT-1 panel as its negative control |
| Test-id rename misses a consumer | low | Consumers enumerated in §2.4 by grep; the bare ids cease to exist, so a missed consumer fails loudly rather than matching two nodes |
| The new workflow is itself dark | low | `workflow_dispatch:` enabled; close-out fires it with `gh workflow run` and confirms a green run before merge (§6.4) |
| T2's literal ban is bypassed by a named-but-wrong constant | medium | Closed by the T2 allowlist (§5.2): the delay identifier must be a registered name, so `CONFIRM_TIMEOUT` fails until someone adds a row and states why. Residual scope limit stated honestly in §5.3 |
