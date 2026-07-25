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

- **Boot mechanism.** `playwright.config.ts` `desktop-chromium` project, dev webServer on `E2E_PORT` (default `3000`, `playwright.config.ts:8`), `baseURL` `http://localhost:${E2E_PORT}` (`playwright.config.ts:44`). `fullyParallel: false` and a single worker — the suites mutate shared `dev.*` state (`playwright.config.ts:34-36`).
- **Readiness gate.** Follow the existing `published-review-modal.*` specs' gate; never `networkidle` alone. The modal's rows are client-rendered, so the first assertion waits on the pill testid `published-show-review-alert-pill` being attached, then on the menu panel testid after the open click.
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

### Task 7 — wire the unwired focus spec into CI

`tests/e2e/attention-pill-focus.spec.ts` is absent from every `playwright.config.ts` project, but it is NOT dead: `tests/e2e/standalone.config.ts:36` allow-lists it and it collects 20 tests there (§0). The real debt is that no workflow runs it — `tests/ci/_metaE2eWorkflowCoverage.test.ts:49` records it as `UNSEEN`.

Run it under its own harness:

```
npx playwright test --config tests/e2e/standalone.config.ts tests/e2e/attention-pill-focus.spec.ts
```

- **Green:** wire the standalone spec into the workflow that runs the other standalone specs and update the coverage registry entry from `UNSEEN` in the same commit. Note in the handoff that this switches on pre-existing coverage rather than adding new coverage.
- **Red:** do not wire it. File `BL-ATTENTION-PILL-FOCUS-UNWIRED` in `BACKLOG.md` with the failure output, and record in the handoff that the change was validated against the spec's other suites instead.

**Do NOT add it to `playwright.config.ts`'s `desktop-chromium` project.** That boots the ordinary app server rather than the standalone harness this spec was written against.

This task does not block the others.

### Task 8 — layout and invariants (real browser)

**Test first.** Extend `tests/e2e/published-review-modal.layout.spec.ts` with `getBoundingClientRect` assertions for every spec §5 invariant (spec §6 test 14), 0.5px tolerance:

- every needs-you row height ≥ 44px (they are now buttons, where former needs-look rows were unfloored `<div>`s);
- the pill's resolved tap band ≥ 44px;
- the scroll region clips at `max-h-96` with 12 needs-you rows;
- a long title does not widen the panel past `w-[min(400px,calc(100vw-32px))]`.

jsdom cannot compute layout, so these must be Playwright.

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

Tasks 1 → 2 → 3 are strictly sequential (each depends on the previous file state). Tasks 4 and 5 are independent of each other and of 1-3 except that 5's test 4b needs Task 1's merged lists. Task 6 depends on 1 and 5 (it asserts the new pill string). Task 7 is independent. Tasks 8 and 9 come after 1-6. Tasks 10-12 are close-out, in order.

## 3. Rollback

Every task is one commit against `origin/main` with no DB or migration component, so any task reverts individually with `git revert`. No data migration, no feature flag, no staged rollout.
