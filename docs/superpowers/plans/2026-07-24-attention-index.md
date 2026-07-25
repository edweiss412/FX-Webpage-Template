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

**Ownership rule for fan-out (plan R3 F1).** Each task repairs every assertion its own change invalidates, in the SAME commit. A fan-out table belongs to the task that CAUSES the breakage, never to whichever later task happens to touch the same file. Where two tasks touch one file, each must leave it green. Stated once here because the alternative — deferring a repair to "the task that owns that file" — produces tasks that cannot finish green, which the TDD invariant forbids.

Applied, that fixes ownership as: **Task 1** the heading copy and the conditional-site count; **Task 3** every consumer of the retired row shape, jsdom AND e2e; **Task 5** every pill-string pin; **Task 6** only the dev-scenario prose and ids; **Task 7** CI wiring only, no assertion edits.

### Task 1 — two groups, two headings

**Test first.** Extend `tests/components/admin/showpage/attentionMenuGroups.test.tsx`: with one actionable, one needs-look, one self-heal item, assert exactly two group headings reading "Needs you" and "Monitoring", and that "Needs your confirmation" and "Needs a look" are absent from the panel. Add the empty-group cases (spec test 5) and the `aria-label` two-branch fallthrough.

**Catches:** a merge that renames one heading but leaves the third group rendering.

**Plus spec test 2, merged-group ordering** (plan R4 F6 — it had no owning task). Mount **two** actionable and **two** needs-look items and assert all four rows appear under the single "Needs you" heading in `deriveAttentionItems` order, actionable-first. One of each (the case above) cannot catch a merge that interleaves or re-sorts. Derive the expected id sequence from the fixture array, not a literal.

**Implement.** `AttentionMenu.tsx`: replace the three filters with `needsYou` / `monitoring` (spec §2.1), the three heading blocks with two, and the three-branch `aria-label` with two. The two row RENDERERS stay as they are until Task 3 — this task partitions `needsYou` internally by `i.actionable` and renders both under one heading, so the diff is grouping only.

**Also add heading testids** — `data-testid="attention-needsyou-heading"` and `data-testid="attention-monitoring-heading"` on the two heading **container `<div>`s** (not the inner `<span>`s). Plan R4 F3 established why: the container is the element whose whole block disappears on the O1↔O2 collapse, and a text locator selects the span instead, so Task 9's oracle would check the wrong node. Task 2's `element.contains` placement pin also gets a stable anchor instead of a text query.

**Fan-out — the heading copy and the conditional-site count, both in this commit.** Sweep: `grep -rn 'Needs your confirmation\|Needs a look' tests/ lib/ components/ app/`. That returns matches in the per-section-chip surface too (`lib/admin/routedWarnings.ts`, `components/admin/wizard/step3ReviewSections.tsx`, `components/admin/review/ShowReviewSurface.tsx`, and the five test files in spec §7.1's leave-alone list) — those are a different component and stay untouched. The dropdown-heading consumers are exactly two test files:

- `tests/components/admin/showpage/attentionMenuGroups.test.tsx:143-152` (aria-label now "Needs you") and `tests/components/admin/showpage/attentionMenuGroups.test.tsx:154-161` (heading now "Needs you").
- `tests/dev/fullSplitCompositeRender.test.tsx` — **repaired HERE, not in Task 3** (plan R4 F1): `tests/dev/fullSplitCompositeRender.test.tsx:69` and `tests/dev/fullSplitCompositeRender.test.tsx:75` require the two retired headings; `tests/dev/fullSplitCompositeRender.test.tsx:100` and `tests/dev/fullSplitCompositeRender.test.tsx:101` re-query them for the document-order assertion, which collapses to one `follows(needsYouHeading, monHeading)` check. The negative membership pair at `tests/dev/fullSplitCompositeRender.test.tsx:124-125` keeps passing but becomes **vacuous** — it would assert the absence of strings that no longer exist anywhere. Re-point both at `"Needs you"` so the membership proof still proves something.
- `tests/components/admin/showpage/pageTransitions.test.tsx:147` pins `"components/admin/showpage/AttentionMenu.tsx": 7` — a **scanner-derived count of conditional render sites**, not a copy assertion. (Spec §7.1 previously described this file as pinning the header case at `tests/components/admin/showpage/pageTransitions.test.tsx:144`; that is the comment above the row, not the assertion.) Removing a group removes conditional sites, so the integer moves. **Measure it — re-run the scanner, do not predict** (`tests/components/admin/showpage/pageTransitions.test.tsx:132` and `tests/components/admin/showpage/pageTransitions.test.tsx:143` both say "Verified by RUNNING the scanner, not by reasoning"). Annotate the delta in the row comment following the file's own convention (`8 → 7 → 6`, each with the task that moved it). Task 3 moves it again and updates it again.

### Task 2 — heading placement pin

**Test first.** Spec test 5b: with both groups populated, assert the `attention-needsyou-heading` container is NOT a descendant of the `max-h-96 overflow-y-auto` container and `attention-monitoring-heading` IS, using `element.contains`, not class names. Anchor on the testids Task 1 added, not on heading text — a text query resolves to the inner `<span>`, and the placement contract is about the container.

**Catches:** a refactor that normalises both headings into the scroller, changing the pinned-label behaviour invisibly.

**Implement.** Nothing — Task 1 must already satisfy it. If it fails, Task 1's structure moved and must be corrected.

### Task 3 — one row shape

**Test first.** Spec tests 3, 3b, 11:

- needs-look row is a `<button>`, pressing it calls `onClose` then `onNavigate(item)`, and it contains **no** `<a>` descendant (scope the query to the row's own testid);
- fail-visible boundary row renders title **and** subtitle, updating `tests/components/admin/showpage/attentionMenu.test.tsx:117-124` in the same commit with a comment saying the change is intended (spec §2.2);
- hint-over-subtitle precedence with both non-empty.

**Catches:** in order — a row left as a `<div>` with a link; a silent regression of the boundary row to a bare title; reversed precedence hiding the fix hint.

**Plus spec tests 10 and 12** (plan R4 F6 — neither had an owning task):

- **Test 10, merged-group regression guard.** Both event codes are already excluded at HEAD (spec §2.5), so this cannot fail first and is a characterisation test, not a TDD step — its comment must say so. Assert that `deriveAttentionItems` still yields zero items for `SHOW_FIRST_PUBLISHED` and `PICKER_EPOCH_RESET` **after** the merged-group derivation, i.e. that neither appears in `needsYou`. The pre-existing suites (`tests/admin/attentionExclusionSet.test.ts:107-120`, `tests/admin/pickerEpochCut.test.ts:20-39`) pin the upstream exclusion; nothing currently pins that this refactor does not resurrect them downstream. No `EVENT_SHAPED_CODES` export is introduced (spec §1.1).
- **Test 12, warnings-channel jump — a COMPOSITION test.** For `PARSE_ERROR_LAST_GOOD`, assert `effectiveSectionId` resolves to `warnings` AND that the row's `onNavigate` payload carries that section. `tests/admin/anchorRouting.test.ts` already covers the resolver alone and Task 3's row tests cover a generic payload alone; neither catches a break between them, which is exactly what wiring a previously-inert row to `onNavigate` risks.

**Implement.** Delete the needs-look row block (`AttentionMenu.tsx:185-222`); render every `needsYou` item through the actionable row shape with `hint ?? menuSubtitle` as the second line and the filled `TONE_DOT[item.tone]` dot.

**Fan-out — TWO sweeps, because the change both retires an id and expands another.** Deleting the block retires the `attention-needslook-row-*` testid and the in-row `<a>`, AND moves those rows onto the surviving `attention-menu-row-*` prefix. Sweeping only the retired id misses every assertion about the surviving one's membership (plan R4 F4).

- **Sweep A, retired:** `grep -rn 'attention-needslook-row' tests/` and `grep -n '${MENU} a' tests/e2e/attention-pill-focus.spec.ts`.
- **Sweep B, expanded:** `grep -rn 'attention-menu-row' tests/`. Seven files match. Most are id-specific queries for rows that were already menu rows and stay valid; the ones that break are the **count and absence** assertions listed below.

Per the ownership rule above, every hit from both sweeps is repaired here — deferring any leaves this task red at its own commit.

**Sweep B breakages (exhaustive):**

| Site | Today | After |
| --- | --- | --- |
| `tests/components/admin/showpage/attentionMenu.test.tsx:84-88` | expects the prefix query to return exactly `[hold:h1, alert:a1]` | `CLEARING` (`alert:c1`) joins the shape, so the expected array is three entries. The test's name, "renders only actionable rows, in order, with titles + subtitles", is retired vocabulary and is renamed with it. |
| `tests/components/admin/showpage/attentionMenu.test.tsx:94` | `queryByTestId("attention-menu-row-alert:c1")` is null | Inverts — that is the row's new id. |
| `tests/dev/fullSplitCompositeRender.test.tsx:70` | one prefixed row | Three (one actionable + two former needs-look). |
| `tests/components/admin/showpage/pillFocusReconcile.test.tsx:259` | prefix absent in the `(1,1,0) → (0,1,0)` state | The surviving needs-look item now carries the prefix. The adjacent retired-id assertion at `tests/components/admin/showpage/pillFocusReconcile.test.tsx:260` is a separate edit in the table below. |

Every other `attention-menu-row-*` assertion was checked and holds: they run on actionable-only or monitoring-only fixtures, or query one id that keeps its meaning. Notably `tests/e2e/published-show-attention.spec.ts:118`'s `toHaveCount(2)` is **verified invariant, not assumed** — that spec seeds exactly `AMBIGUOUS_EMAIL_BINDING` (`tests/e2e/published-show-attention.spec.ts:48`) and `SYNC_DELAYED_SEVERE` (`tests/e2e/published-show-attention.spec.ts:52`), neither of which is in `NEEDS_LOOK_CODE_LIST` or `SELF_HEALING_CODE_LIST` (`lib/adminAlerts/audience.ts:75-94`), so both are actionable and the count stays 2.

**Sweep A breakages:**

Also re-run the pageTransitions scanner and update `tests/components/admin/showpage/pageTransitions.test.tsx:147` again (Task 1 moved it once; collapsing the two row renderers moves it again).

| File | Sites | Disposition |
| --- | --- | --- |
| `tests/components/admin/showpage/attentionMenuGroups.test.tsx` | testid refs at `tests/components/admin/showpage/attentionMenuGroups.test.tsx:115`, `tests/components/admin/showpage/attentionMenuGroups.test.tsx:125`, `tests/components/admin/showpage/attentionMenuGroups.test.tsx:135`, `tests/components/admin/showpage/attentionMenuGroups.test.tsx:364`; plus the whole `describe("needs-a-look group")` block opening at `tests/components/admin/showpage/attentionMenuGroups.test.tsx:74` and closing at `tests/components/admin/showpage/attentionMenuGroups.test.tsx:140` (6 tests) | Four of those tests assert the link contract this spec deletes (`tests/components/admin/showpage/attentionMenuGroups.test.tsx:75` target/rel, `tests/components/admin/showpage/attentionMenuGroups.test.tsx:85` internal-anchor, `tests/components/admin/showpage/attentionMenuGroups.test.tsx:98` click-closes, `tests/components/admin/showpage/attentionMenuGroups.test.tsx:121` single-anchor). Rewrite the block against the merged row: hint still renders, row is a `<button>`, row contains no `<a>`. Do NOT delete the coverage — the `rel`/`target` assertions move to Task 4's card chip, which is where that contract now lives. The scroll-boundary assertion re-anchors on `attention-menu-row-*`. |
| `tests/components/admin/showpage/pillFocusReconcile.test.tsx` | testid refs at `tests/components/admin/showpage/pillFocusReconcile.test.tsx:202`, `tests/components/admin/showpage/pillFocusReconcile.test.tsx:260`, `tests/components/admin/showpage/pillFocusReconcile.test.tsx:277`, `tests/components/admin/showpage/pillFocusReconcile.test.tsx:332`; plus two link-focus probes selecting `menu.querySelector("a")` at `tests/components/admin/showpage/pillFocusReconcile.test.tsx:186` and `tests/components/admin/showpage/pillFocusReconcile.test.tsx:270` | The testid refs re-anchor on `attention-menu-row-*`. **The two `querySelector("a")` probes lose their subject** — after this task the menu has no `<a>` at all, so `expect(target).not.toBeNull()` fails. Re-point both at the needs-look row button; that keeps the probe non-vacuous (the focused node still leaves the DOM) and is now the shape the §4 compound row actually exercises. |
| `tests/components/admin/showpage/attentionMenu.test.tsx` | `tests/components/admin/showpage/attentionMenu.test.tsx:123`, `tests/components/admin/showpage/attentionMenu.test.tsx:140` | The first is the fail-visible boundary pin already scoped above. The second asserts the needs-look row is absent in a monitoring-only render — re-anchor on `attention-menu-row-*`. |
| `tests/dev/fullSplitCompositeRender.test.tsx` | `tests/dev/fullSplitCompositeRender.test.tsx:77`, `tests/dev/fullSplitCompositeRender.test.tsx:87`, `tests/dev/fullSplitCompositeRender.test.tsx:93`, and the in-row link assertions that follow each testid | Re-anchor the testids on `attention-menu-row-*`. The in-row `getByRole("link")` assertions have no subject after this task — their contract moves to Task 4's card chip. The group HEADINGS in this file are Task 1's (plan R4 F1); the row count at `tests/dev/fullSplitCompositeRender.test.tsx:70` is in the Sweep B table above. Three tasks touch this file — 1 (headings), 3 (rows), 5 (pill string) — and each must leave it green. |
| `tests/e2e/attention-pill-focus.spec.ts` | `tests/e2e/attention-pill-focus.spec.ts:177-198` (the `§11.9 nav` sheet-link test), `tests/e2e/attention-pill-focus.spec.ts:258-264` (rescue probe (b), `stampFocused(page, "${MENU} a")`), `tests/e2e/attention-pill-focus.spec.ts:283-306` (generality cell `focus: "link"`, resolved at `tests/e2e/attention-pill-focus.spec.ts:305`) | Rewrite all three against `${MENU} [data-testid^="attention-menu-row-"]`. For the first, the href/target/rel half moves to Task 4's card chip and what survives is the navigation contract: press the row, assert the menu closed. The two focus probes stay non-vacuous — the focused node still leaves the DOM on `setItems(0,0,1)`. **Repaired HERE, not in Task 7** (plan R3 F1): Tasks 8b and 9 both add tests to this file and cannot run their red/green cycle against a suite that is red for unrelated reasons. `boot()`'s `${MENU} button, ${MENU} a` selector at `tests/e2e/attention-pill-focus.spec.ts:124` needs no change — the `button` arm still matches. |

Verify with `npx playwright test --config tests/e2e/standalone.config.ts tests/e2e/attention-pill-focus.spec.ts` before committing; the file is not CI-wired until Task 7, so a local green is the only signal at this point.

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

**The prop is required, so every mount must supply it (plan R4 F2).** `grep -rn '<AttentionBanner' tests/ components/ app/` returns exactly four mounts. The plan previously named one; the other three fail typecheck the moment the prop lands:

| Mount | Value to pass |
| --- | --- |
| `components/admin/showpage/PublishedReviewModal.tsx:522` (`bannerFor`) | `effectiveSectionId(item)` — the production path, above. |
| `tests/components/admin/review/attentionBanner.test.tsx:65` (`renderBanner(it, over)` helper) | `effectiveSectionId={it.sectionId}` **as a default that `over` can override** — the helper spreads `over` last, and test 9b needs to override it to `"overview"` to prove the fallback case. This is the one site where a hardcoded value would break the task's own tests. |
| `tests/components/admin/compactAlertCompoundTransitions.test.tsx:59` | The fixture's own `sectionId`. Lift `alertItem()` to a const first — the file currently calls the builder inline, so passing `alertItem().sectionId` would build a second, unrelated object. |
| `tests/e2e/_compactAlertCardLiveEntry.tsx:135` | `bannerItem.sectionId` — already a module-level const. |

**Do not** wire `resolveEffectiveSection` into the three test files. They mount a card directly and have no `placement` predicates to feed it; the declared route IS the effective section wherever the anchor is mounted, which is the case all three harnesses set up. `tests/e2e/_attentionAnchorEntry.tsx:27` mentions `<AttentionBanner>` in a comment only — it is a documented stand-in, not a mount, and needs no change.

### Task 5 — the badge

**Test first.** Spec test 6: `1 issue` at count 1, `11 issues` at 11, `99+ issues` plus an `sr-only` exact count at 120, and the full visible string `11 issues · 1 monitoring` with real `" · "` text nodes. Derive counts from the fixture. Plus spec test 4b — degraded read with a live hold: pill interactive, reads `1 issue`, menu lists the hold, degraded Overview notice still present.

**Catches:** test 4b catches an implementation that short-circuits to an empty list on `alertsDegraded`, hiding a live approve/reject control.

**Implement.** `PublishedReviewModal.tsx`: collapse the three pill segments to two, retaining the 99+ cap and its sr-only exact count, the real-text separator, and the `monitoringOnly` palette.

**Fan-out — every existing pill-string pin, all in this commit.** Same class as Task 3's (plan R3 F1 applied to the pill). Enumerated by `grep -rn 'to confirm\|to review' tests/`, then reading each hit to drop unrelated surfaces (most matches are the dashboard's "Changes to review" badge, a different string on a different component):

| File | Sites | Note |
| --- | --- | --- |
| `tests/components/admin/showpage/publishedPill.test.tsx` | the parameterised table at `tests/components/admin/showpage/publishedPill.test.tsx:69` through `tests/components/admin/showpage/publishedPill.test.tsx:75` (7 rows of exact pill strings), plus `tests/components/admin/showpage/publishedPill.test.tsx:119`, `tests/components/admin/showpage/publishedPill.test.tsx:126`, `tests/components/admin/showpage/publishedPill.test.tsx:127`, `tests/components/admin/showpage/publishedPill.test.tsx:132`, `tests/components/admin/showpage/publishedPill.test.tsx:149` | The largest pin. **Re-derive the table from the merged counts; do not string-substitute** — rows that differed only in the confirm/review split now collapse onto the same expected string, so a mechanical replace produces duplicate cases that no longer discriminate. `tests/components/admin/showpage/publishedPill.test.tsx:119`'s test name ("clearing items WITHOUT clearingKind default fail-visible into the review count") carries retired vocabulary and is renamed, not just re-stringed. `tests/components/admin/showpage/publishedPill.test.tsx:126-127` is the review-segment 99+ cap and its sr-only exact count. (An earlier draft of this table cited line 111 of the same file; that is the unchanged `"2 monitoring"` assertion and is NOT affected — plan R4 F5.) |
| `tests/components/admin/showpage/publishedReviewModal.test.tsx` | `tests/components/admin/showpage/publishedReviewModal.test.tsx:451`, `tests/components/admin/showpage/publishedReviewModal.test.tsx:461`, `tests/components/admin/showpage/publishedReviewModal.test.tsx:488`, `tests/components/admin/showpage/publishedReviewModal.test.tsx:494`, `tests/components/admin/showpage/publishedReviewModal.test.tsx:512` | `tests/components/admin/showpage/publishedReviewModal.test.tsx:461`'s whole premise — "needs-look-only renders the INTERACTIVE '1 to review' pill" — is retired; it becomes a `1 issue` case, keeping the interactivity half of the assertion. |
| `tests/app/admin/showReviewModalLoader.test.tsx` | `tests/app/admin/showReviewModalLoader.test.tsx:620` | Regex over `${n} to confirm`. |
| `tests/e2e/published-show-attention.spec.ts` | `tests/e2e/published-show-attention.spec.ts:112`, `tests/e2e/published-show-attention.spec.ts:124`, `tests/e2e/published-show-attention.spec.ts:232`, `tests/e2e/published-show-attention.spec.ts:259`, and the header comment at `tests/e2e/published-show-attention.spec.ts:11` | **`desktop-chromium`, CI-wired** — the only file in this table whose staleness fails a real PR check rather than a local run. |
| `tests/e2e/published-review-modal.layout.spec.ts` | `tests/e2e/published-review-modal.layout.spec.ts:654` | `"99+ to confirm"`; Task 8a touches the same fixture. |
| `tests/dev/fullSplitCompositeRender.test.tsx` | `tests/dev/fullSplitCompositeRender.test.tsx:53`, `tests/dev/fullSplitCompositeRender.test.tsx:56` | The exact composite string. Repaired here, NOT in Task 6. |
| `tests/e2e/_publishedReviewModalHarness.tsx` | `tests/e2e/_publishedReviewModalHarness.tsx:54` | Doc comment only; update for accuracy. |

### Task 6 — dev gallery

**Test first.** `tests/dev/fullSplitComposite.test.ts:22` asserts the Tier-3 label **exactly**: `expect(s.label).toBe("Everything at once: confirm, review, and monitoring")`. Update it to the renamed label — that is this task's failing-test-first step, and it is the only test that can fail for a Tier-2/Tier-3 label change (plan R4 F7).

The §7.1b sweep that produced this task searched `lib/dev/` only, which is why this consumer was missed; the corrected sweep is `grep -rn 'confirm, review' lib/dev/ tests/`. A sweep of the other retired Tier-2/Tier-3 label strings finds no further test consumer.

`tests/dev/attentionScenariosTier1.test.ts:13-17` is a **regression check, not this task's oracle** — it asserts Tier-1 route-code totality and cannot fail for a label rename. Run it to confirm no id changed; do not treat it as proof the rename worked.

**Implement.** `lib/dev/attentionScenarios/tier2.ts` and `tier3.ts` only (spec §7.1b): rename the class-mix labels and the `T2_MONITORING_ONLY` description to the two-group vocabulary. Rename labels, not ids, unless the id itself names a retired class — an id change breaks the totality assertion above.

### Task 7 — wire the focus spec into CI (wiring only)

**Depends on Tasks 3, 8b, and 9** — every assertion edit to `tests/e2e/attention-pill-focus.spec.ts` happens in those tasks (Task 3 repairs the three stale `<a>` sites, 8b adds the geometry block, 9 adds the transition block). **This task edits no test file.** It is last so the job it switches on carries the complete suite.

`tests/e2e/attention-pill-focus.spec.ts` is absent from every `playwright.config.ts` project, but it is NOT dead: `tests/e2e/standalone.config.ts:36` allow-lists it and it collects 20 tests there (§0). The real debt is that no workflow runs it — `tests/ci/_metaE2eWorkflowCoverage.test.ts:49` records it as `UNSEEN`.

Run the finished suite:

```
npx playwright test --config tests/e2e/standalone.config.ts tests/e2e/attention-pill-focus.spec.ts
```

- **Green:** wire it into a workflow (`.github/workflows/attention-anchor-e2e.yml` is the closest template — a standalone-config job with a path filter) and update `tests/ci/_metaE2eWorkflowCoverage.test.ts:49` from `UNSEEN` in the same commit. The path filter must include `components/admin/showpage/AttentionMenu.tsx`, `components/admin/showpage/PublishedReviewModal.tsx`, and `tests/e2e/_pillFocusLiveEntry.tsx`, or the job never fires on the changes it exists to guard.
- **Red:** do not wire it. File `BL-ATTENTION-PILL-FOCUS-UNWIRED` in `BACKLOG.md` with the failure output, and record in the handoff that Tasks 8b's and 9's coverage exists but is unwired — stated, not implied.

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

**Test first.** Walk every conditional render in `AttentionMenu.tsx` and assert against the spec §4 inventory: the panel entrance (`scale-95 opacity-0` → `scale-100 opacity-100`), the O1↔O2 collapse as **instant**, and the compound cases — last needs-you item clearing mid-entrance, interactivity lost while open, a focused row unmounting while the panel stays open.

**The instant-collapse oracle needs stating precisely (plan R3 F2), because the naive one has no subject.** "Assert no transition property on the group wrappers" does not work after the merge: the needs-you group has **no wrapper element** — its rows render directly inside the scroller — and the rows themselves deliberately keep `transition-colors` as the pressable-row hover affordance (spec §4, "Row-level transition, new to the former needs-look rows"). An assertion of "no transitions here" would fail a correct implementation.

The correct oracle is **set equality on `transition-property`**, not a forbid-regex. Set equality is what makes it robust: a `not.toContain("opacity")` check passes against `transition-all`, which animates opacity.

- Elements that appear and disappear on the O1↔O2 collapse — `[data-testid="attention-monitoring-group"]`, `[data-testid="attention-needsyou-heading"]`, `[data-testid="attention-monitoring-heading"]`: computed `transition-property` is exactly `none`. **The heading testids go on the container `<div>`s** (Task 1), because those are the elements whose whole block unmounts; a text locator would select the inner `<span>` and miss a `transition-all` added to the container (plan R4 F3).
- Needs-you rows: computed `transition-property` equals Tailwind's `transition-colors` output.

**Do not hardcode the `transition-colors` property list.** In the installed Tailwind (4.2.4) it is TEN properties — `color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, --tw-gradient-from, --tw-gradient-via, --tw-gradient-to` — and it has changed across minors. A literal pinned to a vendor version breaks on the next upgrade while proving nothing about this component. Derive it from the framework instead, in the same page:

```js
const expected = await page.evaluate(() => {
  const probe = document.createElement("div");
  probe.className = "transition-colors";
  document.body.appendChild(probe);
  const v = getComputedStyle(probe).transitionProperty;
  probe.remove();
  return v;
});
```

Then assert each row's computed `transitionProperty` equals `expected`. Version-proof, and still catches `transition-all` — whose computed list cannot equal the probe's.

Run on the live harness (`tests/e2e/attention-pill-focus.spec.ts`), the only one that can open the menu (§0.3). The panel entrance itself IS animated and is asserted separately — do not fold it into the same assertion.

**Catches:** the focused-row case is the one this change makes riskier — every needs-you row is now focusable where needs-look rows previously exposed only their inner link. The set-equality oracle catches a row that gains `transition-all` during styling cleanup, which would make removal animate and reintroduce the detach race the rescue effect exists to handle.

### Task 10 — impeccable dual-gate

`/impeccable critique` and `/impeccable audit` on the diff. P0/P1 fixed or deferred with a `DEFERRED.md` entry. Findings and dispositions recorded in the handoff. Pre-code mechanical checklist already applied: no em dashes in user-visible copy, `min-h-tap-min` on every new tap target, canonical `text-xs/relaxed` and `text-subtle`.

### Task 11 — whole-diff adversarial review (cross-model)

Codex, fresh-eyes posture, do-not-relitigate list drawn from spec §1.1 plus the nine spec rounds. Split by surface if the diff is large — whole-diff dispatches on this repo have died silently before.

### Task 12 — close-out

Full local suite, typecheck, eslint, `format:check`. Push, real CI green, `gh pr merge --merge`, fast-forward local main, verify `git rev-list --left-right --count main...origin/main` reports `0  0`.

---

## 2. Ordering and parallelism

Strict order: **1 → 2 → 3 → 4 → 5 → 6 → 8 → 9 → 7**, then 10 → 11 → 12.

- 1 → 2 → 3 are sequential; each depends on the previous file state.
- 4 is independent of 5 but must follow 3 (it edits card-side assertions whose row-side twins move in 3).
- 5's test 4b needs Task 1's merged lists.
- 6 follows 5: it renames dev-scenario labels whose assertions Task 5 has already re-derived.
- 8 and 9 follow 1-6 and both add tests to `attention-pill-focus.spec.ts`, which Task 3 has already made green.
- **7 is last** (plan R2 F1, plan R3 F1). It is wiring only — no assertion edits — and runs after every task that adds to the suite it switches on, so CI turns on with complete coverage rather than a partial one.

Tasks 10-12 are close-out, in order. Each task's own fan-out (Task 1's heading pins, Task 3's row-shape consumers, Task 5's pill-string pins) commits with that task per the ownership rule in §1 — there is no "cleanup task" at the end, deliberately.

## 3. Rollback

Every task is one commit against `origin/main` with no DB or migration component, so any task reverts individually with `git revert`. No data migration, no feature flag, no staged rollout.
