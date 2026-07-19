# Tasks 9–10 — Skeleton band parity, close-out

> Real-browser assertions for the feature surfaces live in the tasks that produce them (Rule 2): T-LAYOUT / T-COPY-FLUSH → Task 3; T-TAP pill probe + T-ALERT-CAP@375 → Task 5; T-CONTRAST (Copy) → Task 6; T-OVERLAY / T-OVERLAY-BOUNDS / T-RESYNC-WIDTH / T-RESYNC-FOCUS-ORDER / T-NO-ORANGE / T-CONTRAST (ghost) / T-TAP → Task 7; T-STATUS-INLINE → Task 8. **Task 10 adds no new assertions.**

---

## Task 9: `ShowReviewModalSkeleton` band parity (§6.1.1)

**Failure mode caught:** a slow `/admin?show=<slug>` load renders the before-state header language, then snaps to the after-state when content streams in — reintroducing exactly the layout this change removes, **at exactly the moment the user is watching the header**. The skeleton is the only thing on screen during that window.

`ReviewModalShell` has **THREE** consumers, not two. The third is `components/admin/showpage/ShowReviewModalSkeleton.tsx:23-85`, which renders through the SAME shell with the SAME identifiers as the loaded published modal (`dataAttrPrefix="review-modal"`, `testIdBase="published-show-review"`) and whose header (`:44-64`) is the OLD nested two-band shape.

**Files:** Modify `components/admin/showpage/ShowReviewModalSkeleton.tsx`; create `tests/e2e/_skeletonParityHarness.tsx` + `tests/e2e/skeletonBandParity.spec.ts`.

**Breaks nothing** — the skeleton has no external test consumers. **Red phase is genuine:** the skeleton renders no `-subheader` element today, so the band-count assertion cannot resolve.

### What is and is NOT achievable — stated explicitly

**Exact height parity is NOT achievable, and the plan does not ask for it.** The skeleton's rows are fixed-size placeholder bars (`Skeleton className="h-6 w-56"`); the loaded rows are type-set text whose box is a resolved line-height (`text-lg` h2, `text-sm` subline). A 24px bar and a `text-lg` line box are different by construction, and no fixture makes them equal. Demanding equality would produce exactly the failure the coordinator flagged: a CI flake, or a "fix" that distorts either the skeleton or the loaded header to chase pixels.

**The assertion is therefore scoped to the invariant that actually causes the visible snap** — where the header→subheader seam sits — plus the structural facts that are exactly assertable.

| # | Assertion | Tolerance | Rationale |
| --- | --- | --- | --- |
| A | Skeleton renders **exactly 3 bands**: header, `published-show-review-subheader`, body — same count as the loaded modal | **exact** | Structural; no measurement involved |
| B | The skeleton's subheader carries the **same seam + surface + padding classes** as the loaded modal's (both come from the shell, so this is really a "did it go through the slot" check) | **exact** | Both are emitted by `ReviewModalShell`; any difference means the skeleton hand-rolled a band instead of using the slot |
| C | Skeleton header contains **the same number of text rows** as the loaded header (title row + subline row = 2) | **exact (count, not pixels)** | This is the real content of §6.1.1's second requirement. Without the subline row the skeleton header is one row shorter — the actual cause of the downward jump |
| D | **Header bottom edge** (= the header→subheader seam y-offset, measured from the panel's content-box top) differs between skeleton and loaded by **≤ 8px** | **±8px** | 8px = one `--spacing` step in this system and is smaller than one text row (~20-28px), so it cannot mask a missing row (which C already catches exactly) while absorbing legitimate bar-vs-line-box variance. A tighter bound would flake on font-metric rounding; a looser one would stop meaning anything |
| E | Subheader band height differs by **≤ 4px** | **±4px** | Both are a single control row whose height is driven by the band's own `py-2` + a ~24px child, so the variance here is genuinely small — a tighter bound than D is justified and worth having |

If the implementer finds D cannot hold at ≤8px on a correct implementation, **that is a finding to report, not a tolerance to widen** — record it and adjust the skeleton's bar heights, which is the actual lever.

### Measurement environment — specified

- **Both states rendered in ONE environment.** Follow the in-repo standalone harness pattern documented at `tests/e2e/statusStripToggleLayout.spec.ts:1-33` and implemented in `tests/e2e/_statusStripToggleHarness.tsx`: `tsx` runs the harness out-of-process to emit static HTML for **both** the skeleton state and the loaded state → compile token CSS from `app/globals.css` via the Tailwind CLI with `@source` globbing both HTML strings → serve over `node:http` → measure with `getBoundingClientRect()`. One page, one stylesheet, one browser: the two states differ only in their markup, which is the point.
- **Fixture (pinned, single-source).** One fixture object drives both renders. Chosen so the loaded header is deterministic and single-row per line: a **short single-line title** (must not wrap at 390px), a **non-null short `clientLabel`**, and a **`dates` value producing one line of segments**. Derive all expected values from this fixture — never hardcode a pixel. A wrapping title would make the loaded header two rows and C would fail for a reason unrelated to the contract.
- **Viewports: 390 (sheet mode) and 1280 (popup mode)** — the two modes `published-review-modal.layout.spec.ts` already distinguishes, since sheet mode adds the grab strip and changes the panel's band stack. Assert A–E at both.
- **Settle before measuring:** `await page.evaluate(() => document.fonts.ready)` **and** a `requestAnimationFrame` tick before reading any rect. Font swap after first paint is the single likeliest source of a flaky height delta. The harness inlines its CSS and uses no remote fonts or images, so no network settling is required — state that in the spec header so a future reader does not add speculative waits.

- [ ] **Step 1: write the harness + failing spec** with assertions A–E at both viewports.
- [ ] **Step 2: run — FAIL** (A fails: no `-subheader` element in the skeleton; C fails: no subline row).
- [ ] **Step 3: implement.** Move the strip-row placeholder (`:58-63`) out of the header into a `subHeader` band; add a subline placeholder row beneath the title bar. Keep the `sr-only` `<h2>` accessible-name placeholder (`:46-49`) and the 44px close-affordance placeholder unchanged.
- [ ] **Step 4: FULL SUITE GREEN** including the new spec at both viewports.
- [ ] **Step 5: commit** `fix(admin): adopt the three-band frame in the show-modal skeleton`

---

## Task 10: close-out — **adds no new assertions**

Cross-cutting verification only. Every behavioral assertion in this change already landed, red-first, in the task that produced it.

- [ ] **Step 1: T-TOKENS (source scan).** No raw hex in any new style across the changed files; every new color / radius / spacing is a token class (`bg-warning-bg`, `text-warning-text`, `border-border-strong`, `text-text-subtle`, `bg-status-review`, `rounded-pill`, `size-tap-min`).
  *Catches:* the mock's dark-only hex ported verbatim, breaking light theme (§7.1). The mock's `:root` block is the live **dark-theme** runtime tokens byte-for-byte — porting them is the specific trap.
- [ ] **Step 2: T-TRANSITIONS (source audit).** Every §9 state pair instant or as declared. Enumerate every `AnimatePresence`, ternary render and conditional block in the changed files; assert each is deliberately instant. **Compound:** toggle mid-flight (`pending`) while Copy is `copied` — independent color transitions on separate elements, no shared animating parent. **Compound (overlay):** publish popover open while the Re-sync overlay is open — neither animates the other; the requirement is focus reachability, already asserted as T-OVERLAY in Task 7.
  The §9 row governing the Re-sync overlay covers **MOTION only** — do not read it as "the result surfaces are untouched"; they gained dismiss controls, focus restoration, `role="group"`, and a moved live-region role.
- [ ] **Step 3: T-COUNTS final re-verification.** Re-run the lexical scanner over all three files and confirm the committed literals: `StatusStrip.tsx` = **7**, `PublishedReviewModal.tsx` = **4**, `OverviewSection.tsx` = **4 (unchanged)**. **Verify by running the scan, never by reasoning.** A count that "should" have moved but did not means an edit landed differently than assumed. Editing a literal to green a red test defeats the pin's purpose.
- [ ] **Step 4: impeccable dual-gate (invariant 8).** `/impeccable critique` AND `/impeccable audit` on the affected diff, with the canonical v3 setup gates: `context.mjs` context load (PRODUCT.md + DESIGN.md) → register reference read. Every file in this diff is a UI surface. P0/P1 findings fixed or explicitly deferred via a `DEFERRED.md` entry. Findings + dispositions go in §12 of the handoff doc. **Runs BEFORE adversarial review.**
- [ ] **Step 5: full pre-push gates** — scoped runs miss regressions:
  ```
  pnpm test && pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
  ```
  plus every Playwright suite touched by Tasks 2, 3, 5, 6, 7, 8, 9 (all excluded from `pnpm test`).
- [ ] **Step 6: adversarial review (cross-model).** Invoke the `adversarial-review` skill against Codex on the whole diff. The brief MUST:
  - state the **fresh-eyes posture** ("treat the entire diff as if you have not seen it before");
  - inline **"Your role: REVIEWER ONLY"** — do not fix issues, propose patches as commits, or imply changes you will make;
  - carry an **`EXPLICITLY DO NOT RELITIGATE`** block reproducing Watchpoints 1–10 from `00-overview.md` **with their `file:line` ratification citations inlined** — Codex cannot read `~/.claude/` memory files, so every load-bearing principle must be inline or in the repo;
  - forbid nested cross-model reviews from within the Codex session.
- [ ] **Step 7: commit** `docs(admin): record the modal-header-reconciliation close-out gates`

**Fix-round regression budget.** Every adversarial-round patch: (a) re-grep the finding's bug **class** across the touched surface — not just the named instance; (b) re-run the relevant meta-tests (`pageTransitions`, `accent-button-atom`, `_metaDestructiveConfirm`, `_uiLabelExceptions`); (c) note both in the round closure. If three rounds in a row land findings on the same vector, ship structural defenses (meta-test / registry row / CI-time grep guard) **in that round's repair commit** rather than waiting for another round to confirm the analysis was incomplete.

---

## Appendix — existing-test disposition index (former Task 13, redistributed)

Task 13 was dissolved per Rule 1: every rewrite now lands in the task that causes the break. **The dispositions themselves are unchanged** — reproduced here as a single cross-reference so a reviewer can audit coverage without walking four files. Nothing in this appendix is a separate work item.

| File / anchor | Disposition | Owned by | Reason |
| --- | --- | --- | --- |
| `statusStrip.test.tsx:400` (page chrome KEEPS tokens) | **RETIRE** | Task 2 | The `page` arm ceases to exist — no subject |
| `statusStrip.test.tsx:408` (modal-header chrome DROPS tokens) | **REWRITE** | Task 2 | Only guard against re-adding page chrome and double-seaming the band |
| `statusStrip.test.tsx:197` + peers (`renderTitle: false`) | **REWRITE (call shape)** | Task 2 | Prop disappears; behavior under test does not |
| `_statusStripToggleHarness.tsx:62-127` | **REWRITE** | Task 2 | `stripProps()` builds deleted keys; `:127` comment describes gone chrome |
| `statusStripToggleLayout.spec.ts` invariant (b) card-variant baseline | **REWRITE** | Task 2 | Baseline state built from deleted chrome variants; re-derive from a surviving sibling render, never a hardcoded pixel |
| `statusStripToggleLayout.spec.ts` (a), (c), (d) | **KEEP where the state survives** | Task 2 | They measure `PublishedToggle` containment + error banner, not strip chrome |
| `published-review-modal.layout.spec.ts:169-198` (`header + main === panel`) | **REWRITE** | Task 3 | Panel is now three bands; the sum-equation intent survives, incl. its non-vacuity and no-footer clauses |
| `published-review-modal.layout.spec.ts:221-232` (header rhythm) | **REWRITE, not retune** | Task 3 | Premise **dissolves** — title row and strip are now separate bands. Replace with a band-composition assertion. Do not delete (§14.1) |
| `publishedReviewModal.test.tsx:323` (strip inside the panel) | **REWRITE** | Task 3 | Intent survives; location assertion sharpens to the band |
| `publishedReviewModal.test.tsx:270` (no `<h1>`) | **KEEP — must pass unmodified at every commit** | all | T-NO-H1; reinforced by the deleted strip `<h1>` branch |
| `overviewSection.test.tsx:71` (`#overview` anchor exists) | **KEEP — must pass unmodified** | Task 5 | The pill still targets it (Watchpoint 4) |
| `overviewSection.test.tsx` Re-sync presence assertions | **RETIRE** | Task 7 | Subject leaves Overview |
| `overviewSection.test.tsx` archived-notice + `CorrectionLoopCallout` assertions | **KEEP** | Task 7 | Both survive the move (T-RESYNC-ARCHIVED, T-RESYNC-GUIDANCE) |
| `ReSyncButton.test.tsx` in-flow result-surface assertions | **REWRITE** | Task 7 | Surfaces move to the overlay; the coded-copy and focus intents survive |
| `accent-button-atom.test.ts:52` (**D1**) | **REWRITE (registry row deleted)** | Task 7 | Deliberate de-migration; sub-scan 2 itself is NOT weakened |
| `_uiLabelExceptions.ts:180-184` (**D2**) | **REWRITE** | Task 7 | Label literal changes; MDX + row land together |
| `_metaDestructiveConfirm.test.ts:79` (**D3**) | **KEEP — re-verify** | Task 7 | The confirm is still a confirm; adjust only if the scan's structural assumption breaks |
| `admin-parse-panel.spec.ts:269-274` (**D4**) | **REWRITE** | Task 7 | Rescope the locator from `overview-sheet-sync` to the strip band; round-trip intent preserved |
| `step3-review-modal.layout.spec.ts:222` | **KEEP — must pass unmodified at every commit** | all | Step-3 invariance signal |

**Blast-radius sweep to re-run at close-out** (confirms the index is complete):
```
rg 'ReSyncButton|admin-resync|show-status-strip|strip-title|renderTitle|chrome=|overview-sheet-sync' tests/
```
Any hit not covered above needs an explicit disposition added before the diff ships.
