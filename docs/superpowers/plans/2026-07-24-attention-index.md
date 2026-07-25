# Plan — the show-modal attention panel becomes an index

**Spec:** `docs/superpowers/specs/2026-07-24-attention-index-consolidation.md` (canonical; §-references below point at it)
**Branch:** `feat/attention-index`
**Implementer:** Opus / Claude Code — every changed file is UI, which is Opus-owned per `AGENTS.md`

---

## 0. Pre-draft verification (run, not described)

Every file, symbol, and count below was verified against the live tree at `9e20048db`. Commands and their output:

```
$ grep -rl '"Needs your confirmation"\|"Needs a look"\|Needs your confirmation\|attention-needslook-row\|attention-monitoring-group\|attention-menu-row\|attention-pill-monitoring-segment\|alert-pill' tests/ lib/dev/ app/ | wc -l
20

$ grep -rln 'confirm, review\|MONITORING_ONLY\|clearingKind' lib/dev/ | wc -l
2

$ grep -c "attention-pill-focus" playwright.config.ts
0

$ npx playwright test --config tests/e2e/standalone.config.ts tests/e2e/attention-pill-focus.spec.ts --list
Total: 20 tests in 1 file
```

Implementation surface, current sizes:

| File | Lines | Role in this change |
| --- | --- | --- |
| `components/admin/showpage/AttentionMenu.tsx` | 267 | Group merge, row conversion, headings, `aria-label` |
| `components/admin/showpage/PublishedReviewModal.tsx` | 970 | Pill segments, the two derived lists |
| `components/admin/review/AttentionBanner.tsx` | 249 | Destination chip, footer changes |
| `lib/dev/attentionScenarios/tier2.ts` | — | Scenario ids and labels naming three classes |
| `lib/dev/attentionScenarios/tier3.ts` | — | One scenario label |

No change to `lib/admin/attentionItems.ts`, `lib/admin/sectionAttention.ts`, `lib/adminAlerts/*`. The derivation, the exclusion sets, and the routing table are all untouched — this is a rendering change over an unchanged item list.

## 0.1 Meta-test inventory (mandatory declaration)

**Creates:** none.

**Extends:** none of the registry-style meta-tests. Checked each candidate:

- `tests/auth/_metaInfraContract.test.ts` — N/A, no Supabase call boundary is added or moved.
- `tests/messages/_metaAdminAlertCatalog.test.ts` — N/A, no catalog row changes (§10).
- `tests/auth/advisoryLockRpcDeadlock.test.ts` — N/A, see §0.2.
- `tests/admin/_metaAttentionRoutes.test.ts` — N/A, `ATTENTION_ROUTES` is not edited.
- `tests/adminAlerts/_metaResolveIntentLifecycle.test.ts` — N/A now that the verb fix is descoped (spec §2.6). **Must still pass unchanged**; Task 8 verifies.

The structural guard this change *does* need is behavioural, not registry-shaped: spec test 5b (heading placement) and test 11 (hint precedence) are the two that close classes rather than cases, and both are ordinary component tests.

## 0.2 Advisory-lock topology

**N/A.** No `pg_advisory*` call is added, moved, or wrapped. The diff contains no DB access at all: `git diff --stat` on the finished branch must show zero files under `supabase/` and zero new Supabase client calls. Task 8 asserts this.

## 0.3 e2e harness readiness (mandatory checklist)

- **Boot mechanism — three distinct kinds, and the difference is load-bearing (plan R2 F2).**
  - `playwright.config.ts` `desktop-chromium`: dev webServer on `E2E_PORT` (default `3000`, `playwright.config.ts:8`), `baseURL` `http://localhost:${E2E_PORT}` (`playwright.config.ts:44`), `fullyParallel: false` + single worker because the suites mutate shared `dev.*` state (`playwright.config.ts:34-36`). This is what `published-show-attention.spec.ts` and `published-review-modal.interactions.spec.ts` use.
  - **Static standalone** (`published-review-modal.layout.spec.ts`): renders the tree to HTML out-of-process and serves it from its own `node:http` server (`tests/e2e/published-review-modal.layout.spec.ts:102-181`). **No hydration.** Client state cannot change, so no menu, popover, or any other click-mounted subtree can be measured here. Geometry only, on what server-render emits.
  - **Live standalone** (`attention-pill-focus.spec.ts`): esbuild-bundles `_pillFocusLiveEntry.tsx` and serves it, so React actually mounts and `window.__setItems` drives state. The ONLY harness in which the attention menu can be open.
- **Readiness gate.** Never `networkidle` alone. Static standalone: wait on the modal testid after `goto`. Live standalone: `page.waitForFunction(() => window.__hydrated === true)`, then `__setItems`, then the menu testid (`attention-pill-focus.spec.ts:106-126` is the working pattern — note it also handles the §5.2 auto-open, where the pill click is needed only if the menu did not already open).
- **Detach safety.** Any `locator.evaluate` sampling a row must be taken while the menu is open and re-queried after each state change — rows unmount when the group empties, and Playwright auto-wait hangs on an unmounted node.
- **testMatch wiring.** `desktop-chromium`'s `testMatch` is an explicit allow-list; the config states that a spec absent from it "runs NOWHERE and silently proves nothing" (`playwright.config.ts:87-88`). Every spec this plan touches is already wired **except** `attention-pill-focus.spec.ts`, which is dark — Task 7 disposes of it. No new spec file is created, so no new `testMatch` entry is needed.

---

## 1. Task list

Each task: failing test → minimal implementation → passing test → commit. Conventional commits, `feat(admin):` / `test(admin):`.

### Task 1 — two groups, two headings

**Test first.** Extend `tests/components/admin/showpage/attentionMenuGroups.test.tsx`: with one actionable, one needs-look, one self-heal item, assert exactly two group headings reading "Needs you" and "Monitoring", and that "Needs your confirmation" and "Needs a look" are absent from the panel. Add the empty-group cases (spec test 5) and the `aria-label` two-branch fallthrough.

**Catches:** a merge that renames one heading but leaves the third group rendering.

**Implement.** `AttentionMenu.tsx`: replace the three filters with `needsYou` / `monitoring` (spec §2.1), the three heading blocks with two, and the three-branch `aria-label` with two.

### Task 2 — heading placement pin

**Test first.** Spec test 5b: with both groups populated, assert the "Needs you" heading is NOT a descendant of the `max-h-96 overflow-y-auto` container and the "Monitoring" heading IS, using `element.contains`, not class names.

**Catches:** a refactor that normalises both headings into the scroller, changing the pinned-label behaviour invisibly.

**Implement.** Nothing — Task 1 must already satisfy it. If it fails, Task 1's structure moved and must be corrected.

### Task 3 — one row shape

**Test first.** Spec tests 3, 3b, 11:

- needs-look row is a `<button>`, pressing it calls `onClose` then `onNavigate(item)`, and it contains **no** `<a>` descendant (scope the query to the row's own testid);
- fail-visible boundary row renders title **and** subtitle, updating `tests/components/admin/showpage/attentionMenu.test.tsx:117-124` in the same commit with a comment saying the change is intended (spec §2.2);
- hint-over-subtitle precedence with both non-empty.

**Catches:** in order — a row left as a `<div>` with a link; a silent regression of the boundary row to a bare title; reversed precedence hiding the fix hint.

**Implement.** Delete the needs-look row block (`AttentionMenu.tsx:185-222`); render every `needsYou` item through the actionable row shape with `hint ?? menuSubtitle` as the second line and the filled `TONE_DOT[item.tone]` dot.

**Fan-out — every consumer of the retired row shape, all in this commit.** Deleting the block retires BOTH the `attention-needslook-row-*` testid and the in-row `<a>`. Enumerated by `grep -rn 'attention-needslook-row' tests/` plus a read of each hit's surrounding assertion; there are four jsdom files and one e2e file (the e2e one is Task 7's, which is why Task 7 now depends on this task):

| File | Sites | Disposition |
| --- | --- | --- |
| `tests/components/admin/showpage/attentionMenuGroups.test.tsx` | testid refs at `tests/components/admin/showpage/attentionMenuGroups.test.tsx:115`, `tests/components/admin/showpage/attentionMenuGroups.test.tsx:125`, `tests/components/admin/showpage/attentionMenuGroups.test.tsx:135`, `tests/components/admin/showpage/attentionMenuGroups.test.tsx:364`; plus the whole `describe("needs-a-look group")` block opening at `tests/components/admin/showpage/attentionMenuGroups.test.tsx:74` and closing at `tests/components/admin/showpage/attentionMenuGroups.test.tsx:140` (6 tests) | Four of those tests assert the link contract this spec deletes (`tests/components/admin/showpage/attentionMenuGroups.test.tsx:75` target/rel, `tests/components/admin/showpage/attentionMenuGroups.test.tsx:85` internal-anchor, `tests/components/admin/showpage/attentionMenuGroups.test.tsx:98` click-closes, `tests/components/admin/showpage/attentionMenuGroups.test.tsx:121` single-anchor). Rewrite the block against the merged row: hint still renders, row is a `<button>`, row contains no `<a>`. Do NOT delete the coverage — the `rel`/`target` assertions move to Task 4's card chip, which is where that contract now lives. The scroll-boundary assertion re-anchors on `attention-menu-row-*`. |
| `tests/components/admin/showpage/pillFocusReconcile.test.tsx` | testid refs at `tests/components/admin/showpage/pillFocusReconcile.test.tsx:202`, `tests/components/admin/showpage/pillFocusReconcile.test.tsx:260`, `tests/components/admin/showpage/pillFocusReconcile.test.tsx:277`, `tests/components/admin/showpage/pillFocusReconcile.test.tsx:332`; plus two link-focus probes selecting `menu.querySelector("a")` at `tests/components/admin/showpage/pillFocusReconcile.test.tsx:186` and `tests/components/admin/showpage/pillFocusReconcile.test.tsx:270` | The testid refs re-anchor on `attention-menu-row-*`. **The two `querySelector("a")` probes lose their subject** — after this task the menu has no `<a>` at all, so `expect(target).not.toBeNull()` fails. Re-point both at the needs-look row button; that keeps the probe non-vacuous (the focused node still leaves the DOM) and is now the shape the §4 compound row actually exercises. |
| `tests/components/admin/showpage/attentionMenu.test.tsx` | `tests/components/admin/showpage/attentionMenu.test.tsx:123`, `tests/components/admin/showpage/attentionMenu.test.tsx:140` | The first is the fail-visible boundary pin already scoped above. The second asserts the needs-look row is absent in a monitoring-only render — re-anchor on `attention-menu-row-*`. |
| `tests/dev/fullSplitCompositeRender.test.tsx` | `tests/dev/fullSplitCompositeRender.test.tsx:77`, `tests/dev/fullSplitCompositeRender.test.tsx:87`, `tests/dev/fullSplitCompositeRender.test.tsx:93` | Task 6 owns this file; it re-anchors there in the same sweep. Listed here so the enumeration is complete, not to split the edit. |

### Task 4 — destination chip on the card

**Test first.** Spec tests 7, 8, 9:

- `SHEET_UNAVAILABLE` — footer-right holds `Google Sheets ↗` with `target="_blank"` and `rel="noopener noreferrer"`, `autoClearNote` absent, `footerLeft` no longer carries a duplicate action link;
- `SHOW_UNPUBLISHED` — **no** chip (self-link suppression), footer holds only "Raised …";
- `action: null` — no chip, no crash, **and the auto-clear note absent**.

**Catches:** test 8 catches an implementation that always renders the chip; test 9 catches one that swaps note-for-chip only when an action exists, which would leave the note on `ASSET_RECOVERY_BYTES_EXCEEDED`.

Plus spec test 9b, the four-cell warnings matrix, which is the load-bearing proof of §2.3's external-only claim. For EACH of `PARSE_ERROR_LAST_GOOD` and `RESYNC_QUALITY_REGRESSED`:

| | warnings section available | warnings section unavailable |
| --- | --- | --- |
| Expected | item lands in `notes`, **no card** produced | falls through to an Overview card, and that card carries **no chip** |

**Catches:** without the unavailable column, an implementation that suppresses the chip for `SHOW_UNPUBLISHED` while rendering an internal chip on either warnings-unavailable fallback passes tests 7, 8, and 9 and still violates §2.3.

**Implement.** `AttentionBanner.tsx`: for non-actionable needs-you items, replace `footerRight`'s note with the chip, drop `footerLeft`'s action link, and apply the self-link guard (spec §2.3).

**Prop threading — do not guess this.** The self-link guard compares the action's target section against **the card's effective section**, and `AttentionBanner` cannot currently see that value: `AttentionBannerProps` is `{ item, slug, now, highlighted, onResolved }` (`components/admin/review/AttentionBanner.tsx`), with no section field. The effective section is computed in `PublishedReviewModal` via `resolveEffectiveSection` and used by `bannerFor` (`components/admin/showpage/PublishedReviewModal.tsx:521-530`, `components/admin/showpage/PublishedReviewModal.tsx:551-556`). Add an `effectiveSectionId: RoutedSectionId` prop and pass `effectiveSectionId(item)` from `bannerFor`, so the card and the bucketing share one source. **Do not** compare against `item.sectionId` — that is the declared route and is wrong for exactly the fallback cases test 9b covers.

### Task 5 — the badge

**Test first.** Spec test 6: `1 issue` at count 1, `11 issues` at 11, `99+ issues` plus an `sr-only` exact count at 120, and the full visible string `11 issues · 1 monitoring` with real `" · "` text nodes. Derive counts from the fixture. Plus spec test 4b — degraded read with a live hold: pill interactive, reads `1 issue`, menu lists the hold, degraded Overview notice still present.

**Catches:** test 4b catches an implementation that short-circuits to an empty list on `alertsDegraded`, hiding a live approve/reject control.

**Implement.** `PublishedReviewModal.tsx`: collapse the three pill segments to two, retaining the 99+ cap and its sr-only exact count, the real-text separator, and the `monitoringOnly` palette.

### Task 6 — dev gallery

**Test first.** Update `tests/dev/fullSplitCompositeRender.test.tsx`'s exact pill string and group assertions.

**Implement.** `lib/dev/attentionScenarios/tier2.ts` and `tier3.ts` (spec §7.1b): rename the class-mix labels and the `T2_MONITORING_ONLY` description to the two-group vocabulary. Keep every scenario id that `tests/dev/attentionScenariosTier1.test.ts:13-17` requires for `ATTENTION_ROUTES` totality — rename labels, not ids, unless the id itself names a retired class.

### Task 7 — update the focus spec to the new row contract, then wire it into CI

**Depends on Task 3, and on Task 8's geometry block.** This task must run AFTER the row conversion. Wiring a suite into CI before its assertions match the shipped markup turns on a job that this branch then breaks.

`tests/e2e/attention-pill-focus.spec.ts` is absent from every `playwright.config.ts` project, but it is NOT dead: `tests/e2e/standalone.config.ts:36` allow-lists it and it collects 20 tests there (§0). The real debt is that no workflow runs it — `tests/ci/_metaE2eWorkflowCoverage.test.ts:49` records it as `UNSEEN`.

**First, the three assertions that depend on the retired inner `<a>`.** Task 3 deletes every needs-look link, so each of these currently-passing assertions goes red:

| Site | What it does today | Disposition |
| --- | --- | --- |
| `tests/e2e/attention-pill-focus.spec.ts:177-198` | `§11.9 nav`: locates `${MENU} a`, asserts the exact sheet href + `target` + `rel`, clicks it, asserts the menu closed | The href/target/rel half moves to the card chip (Task 4 covers it in jsdom). What survives here is the **navigation contract**: press the needs-look ROW, assert `onNavigate` fired and the menu closed. Rewrite against `${MENU} [data-testid^="attention-menu-row-"]`. |
| `tests/e2e/attention-pill-focus.spec.ts:258-264` | rescue probe (b): `stampFocused(page, "${MENU} a")` | Re-point at the needs-look row button. The probe stays non-vacuous — the focused node still leaves the DOM on `setItems(0,0,1)`. |
| `tests/e2e/attention-pill-focus.spec.ts:283-306` | generality cell `{boot:[1,1,0], to:[1,0,0], focus:"link"}`, resolved to `${MENU} a` at `tests/e2e/attention-pill-focus.spec.ts:305` | Same re-point. The cell's value is that removal ends at a NON-monitoring state; that is independent of which element was focused, so the cell survives with the row selector. |

`boot()`'s `${MENU} button, ${MENU} a` selector at `tests/e2e/attention-pill-focus.spec.ts:124` needs no change — the `button` arm still matches, and after Task 3 it matches strictly more rows.

Then run it under its own harness:

```
npx playwright test --config tests/e2e/standalone.config.ts tests/e2e/attention-pill-focus.spec.ts
```

- **Green:** wire the standalone spec into a workflow (`.github/workflows/attention-anchor-e2e.yml` is the closest template — a standalone-config job with a path filter) and update `tests/ci/_metaE2eWorkflowCoverage.test.ts:49` from `UNSEEN` in the same commit. The workflow's path filter must include `components/admin/showpage/AttentionMenu.tsx` and `tests/e2e/_pillFocusLiveEntry.tsx`, or the job never fires on the changes it exists to guard.
- **Red:** do not wire it. File `BL-ATTENTION-PILL-FOCUS-UNWIRED` in `BACKLOG.md` with the failure output, and record in the handoff that the change was validated against the spec's other suites instead. Task 8's geometry block then also stays unwired — say so in the handoff rather than leaving it implied.

**Do NOT add it to `playwright.config.ts`'s `desktop-chromium` project.** That boots the ordinary app server rather than the standalone harness this spec was written against.

### Task 8 — layout and invariants (real browser)

**Two harnesses, because one of them cannot open the menu.** The four §5 invariants do NOT all belong in one spec, and putting them all in `published-review-modal.layout.spec.ts` would strand three of them with no subject.

`published-review-modal.layout.spec.ts` is a **static-render** harness: `tests/e2e/published-review-modal.layout.spec.ts:102-181` runs `_publishedReviewModalHarness.tsx` through `tsx`, writes the output as static HTML, and serves it from its own `node:http` server; `openHarness` (`tests/e2e/published-review-modal.layout.spec.ts:188-196`) navigates and waits for the modal. There is no client bundle and no hydration, so clicking the rendered pill cannot set React state and `AttentionMenu` can never mount. Anything requiring an OPEN menu is unmeasurable there.

`attention-pill-focus.spec.ts` is the **live hydrated** harness for exactly this component: it esbuild-bundles `_pillFocusLiveEntry.tsx`, mounts the real `PublishedReviewModal`, flips `window.__hydrated`, and exposes `window.__setItems(a, n, s, degraded)` to drive item counts with the menu open. That is where an open-menu measurement can happen.

**Split accordingly.**

**8a — static harness, pill only.** `tests/e2e/published-review-modal.layout.spec.ts`. The pill's resolved tap band ≥ 44px is already asserted as `T-TAP` (`tests/e2e/published-review-modal.layout.spec.ts:584`); the pill's text length changes under this spec, so **re-verify that existing assertion passes rather than adding a duplicate**. If it needs a new count fixture to exercise the `N issues · N monitoring` string, add the fixture, not a second assertion.

**Do not rect-measure the pill.** Its 44px comes from a CSS pseudo-element (`before:-inset-y-3`), which `getBoundingClientRect()` on the anchor cannot see — the rect returns the ~24px visible pill, so `rect.height >= 44` would FAIL a correct implementation. The existing probe is a hit-behaviour test for exactly that reason (`tests/e2e/published-review-modal.layout.spec.ts:569-583` states it). The 0.5px-tolerance rect method applies to the three row/panel invariants in 8b, not here.

**8b — live harness, the three open-menu invariants.** Add a `describe` block to `tests/e2e/attention-pill-focus.spec.ts` (`getBoundingClientRect`, 0.5px tolerance), using `boot()` + `__setItems`:

- every needs-you row height ≥ 44px — `__setItems(1, 1, 0, false)`, measure both the actionable and the former-needs-look row (the latter is the one that was an unfloored `<div>`);
- the scroll region clips at `max-h-96` with 12 needs-you rows — `__setItems(0, 12, 0, false)`, assert the scroller's own height is at its cap and its `scrollHeight` exceeds it;
- a long title does not widen the panel past `w-[min(400px,calc(100vw-32px))]`.

The long-title case needs a harness knob that does not exist: `buildItems` hardcodes `menuTitle: \`Probe ${id}\`` (`tests/e2e/_pillFocusLiveEntry.tsx:41`). Add an **optional 5th parameter** `longTitles?: boolean` to `__setItems` and thread it into `buildItems`. Optional, appended last, defaulting false — so the four existing 4-argument call sites in the spec are untouched. Update the `declare global` signature (`tests/e2e/_pillFocusLiveEntry.tsx:80-85`) in the same commit or TypeScript rejects the call.

This block ships CI-dark until Task 7 wires the file. That is stated, not implied: if Task 7 lands red, say in the handoff that the geometry coverage exists but is unwired.

jsdom cannot compute layout, so all of the above must be Playwright.

**Also in this task, the diff-shape assertions:** `git diff --stat origin/main...HEAD` shows zero files under `supabase/`, and `git diff origin/main...HEAD` adds no new Supabase client call (§0.2).

### Task 9 — transition audit

**Test first.** Walk every conditional render in `AttentionMenu.tsx` and assert against the spec §4 inventory: the panel entrance (`scale-95 opacity-0` → `scale-100 opacity-100`), the O1↔O2 group collapse as **instant** (assert no transition property on the group wrappers via computed style in the e2e run), and the compound cases — last needs-you item clearing mid-entrance, interactivity lost while open, a focused row unmounting while the panel stays open.

**Catches:** the focused-row case is the one this change makes riskier — every needs-you row is now focusable where needs-look rows previously exposed only their inner link.

### Task 10 — impeccable dual-gate

`/impeccable critique` and `/impeccable audit` on the diff. P0/P1 fixed or deferred with a `DEFERRED.md` entry. Findings and dispositions recorded in the handoff. Pre-code mechanical checklist already applied: no em dashes in user-visible copy, `min-h-tap-min` on every new tap target, canonical `text-xs/relaxed` and `text-subtle`.

### Task 11 — whole-diff adversarial review (cross-model)

Codex, fresh-eyes posture, do-not-relitigate list drawn from spec §1.1 plus the nine spec rounds. Split by surface if the diff is large — whole-diff dispatches on this repo have died silently before.

### Task 12 — close-out

Full local suite, typecheck, eslint, `format:check`. Push, real CI green, `gh pr merge --merge`, fast-forward local main, verify `git rev-list --left-right --count main...origin/main` reports `0  0`.

---

## 2. Ordering and parallelism

Tasks 1 → 2 → 3 are strictly sequential (each depends on the previous file state). Tasks 4 and 5 are independent of each other and of 1-3 except that 5's test 4b needs Task 1's merged lists. Task 6 depends on 1 and 5 (it asserts the new pill string). Tasks 8 and 9 come after 1-6.

**Task 7 is NOT independent** (plan R2 F1). It updates and then CI-wires `attention-pill-focus.spec.ts`, three of whose assertions depend on the inner `<a>` that Task 3 deletes — wiring before that would switch on a job this branch immediately breaks. It also carries Task 8b's geometry block into CI. So Task 7 runs after Task 3 AND after Task 8, and is the last non-close-out task.

Tasks 10-12 are close-out, in order.

## 3. Rollback

Every task is one commit against `origin/main` with no DB or migration component, so any task reverts individually with `git revert`. No data migration, no feature flag, no staged rollout.
