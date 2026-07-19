# Tasks 10–14 — Skeleton parity, real-browser suites, existing-spec repair, close-out

> **Real-browser is mandatory for Tasks 11 and 12.** jsdom computes NO layout, and **this project's Tailwind v4 does not default `.flex` to `align-items: stretch`** (AGENTS.md). Every dimensional invariant in spec §8 is unverifiable in jsdom. Use Playwright against the real modal, or the established standalone real-browser harness pattern (`tests/e2e/_statusStripToggleHarness.tsx:62-127` is the in-repo template — repaired in Task 2).

---

## Task 10: `ShowReviewModalSkeleton` three-band parity (§6.1.1)

**Failure mode caught:** a slow `/admin?show=<slug>` load renders the before-state header language, then snaps to the after-state when content streams in — reintroducing exactly the layout this change removes, **at exactly the moment the user is watching the header**. The skeleton is the only thing on screen during that window, so the regression is maximally visible.

`ReviewModalShell` has **THREE** consumers, not two. The third is `components/admin/showpage/ShowReviewModalSkeleton.tsx:23-85`, which renders through the SAME shell with the SAME identifiers as the loaded published modal (`dataAttrPrefix="review-modal"`, `testIdBase="published-show-review"`) and whose header (`:44-64`) is the OLD nested two-band shape.

**Files:** Modify `components/admin/showpage/ShowReviewModalSkeleton.tsx`; create/extend a skeleton test suite.

- [ ] **Step 1: failing test — T-SKELETON-BANDS.** Assert **both** required parts; the strip move alone is not sufficient:
  1. the skeleton renders a `published-show-review-subheader` band containing the strip placeholder;
  2. the skeleton's header contains a **subline placeholder row**.

  **Compare HEIGHTS to the loaded modal's header and subheader, within tolerance — do not merely assert the band exists.** A presence-only test passes with a one-line header and still snaps: the loaded header gains a client/date subline (Task 4) that the skeleton has no counterpart for today, so without the subline row the skeleton header is one line shorter and the header→subheader boundary jumps downward the instant content streams in — the same class of snap the strip move exists to prevent, just on the other axis.
- [ ] **Step 2: run — FAIL.**
- [ ] **Step 3: implement.** Move the strip-row placeholder (`:58-63`) out of the header into a `subHeader` band whose height and seam match the loaded modal's; add a subline placeholder row beneath the title bar. Keep the `sr-only` `<h2>` accessible-name placeholder (`:46-49`) and the 44px close-affordance placeholder unchanged.
- [ ] **Step 4: run** the skeleton suite + `pnpm vitest run tests/components/admin/showpage/`.
- [ ] **Step 5: commit** `fix(admin): adopt the three-band frame in the show-modal skeleton`

---

## Task 11: real-browser suite A — layout, flush, tap, status row, width

**Failure modes caught:** each assertion below names one; all are invisible to jsdom.

**Files:** create `tests/e2e/modal-header-reconciliation.layout.spec.ts` (or extend `published-review-modal.layout.spec.ts` — but see Task 13, whose rewrite may be cleaner to land separately).

- [ ] **Step 1: write the suite (all RED until the DOM from Tasks 3–9 exists — by this point it does, so expect these to fail only where a real defect exists; write them, run them, and fix implementation defects they surface):**
  - **T-LAYOUT:** panel = header + subheader + body. Any assertion modeling the panel as `header + main` must become `header + strip + main`. No horizontal overflow at **375 / 390 / 768 / 1280**. Explicitly assert: header height, subheader height, their sum vs the panel's pre-body offset.
    *Catches:* the third band breaking the two-band layout assumption.
  - **T-COPY-FLUSH:** the Copy button's right edge == the **band's** content-box right edge (±1px).
    *Catches:* the strip shrink-wrapping as a flex item, so `ml-auto` flushes to the strip's own edge rather than the band's. **An overflow-only check cannot catch this** — a shrink-wrapped strip overflows nothing. This is the executable proof of `w-full` on the strip root (§8).
  - **T-TAP:** `getBoundingClientRect()` ≥44px for the sheet link, the Re-sync trigger, and **both** overlay dismiss controls (error + success). **The alert pill is measured DIFFERENTLY — a hit-behavior probe, NOT a rect measurement** (§11.1): the pill reaches 44px via a `::before` pseudo-element, which `getBoundingClientRect()` on the anchor **cannot see** (it returns the ~24px visible box). Asserting the rect would FAIL a correct implementation and the natural "fix" would be inflating the visible pill, destroying the design. Probe instead:
    ```js
    const box = pill.getBoundingClientRect();
    const cx  = box.left + box.width / 2;
    const top = box.top + box.height / 2 - 21;   // 21px above center
    const bot = box.top + box.height / 2 + 21;   // 21px below → 42px spanned, inside 44
    // both probes must resolve to the pill anchor or a node it contains
    ```
    Coordinates are viewport-relative. Apply the identical treatment to any other control reaching the floor via a pseudo-element rather than its own box.
  - **T-STATUS-INLINE:** with `editedRel` PRESENT, the "Synced" and "Edited" text nodes share a row — equal `getBoundingClientRect().top` within 2px — and a 3px separator renders between them.
    *Catches:* §4.5's headline delta silently not implemented; every jsdom status test passes against the stacked layout.
  - **T-RESYNC-WIDTH:** the trigger's `getBoundingClientRect().width` is IDENTICAL idle vs pending.
    *Catches:* the `"Re-sync"` → `"Syncing…"` label swap reflowing the strip and moving Copy under the user's cursor mid-action. **Invisible to the idle-only fixture in T-LAYOUT.**
  - **T-ALERT-CAP (375px clause):** at 375px with `alertCount: 1200`, the header's right group stays ≤50% of the header's width and the title element keeps a non-zero width with no horizontal overflow. **The assertion is deliberately NOT "same width as the 2-alert case"** — `99+ alerts` is legitimately wider than `2 alerts`, so an equal-width assertion would be false-red and the tempting fix would be dropping the visible unit §6.6 requires.
- [ ] **Step 2: run in a real browser; fix any implementation defect surfaced.** Do not weaken an assertion to green it — each one is here because a class of defect passes everything else.
- [ ] **Step 3: commit** `test(admin): real-browser layout, flush, tap and width pins for the modal header`

---

## Task 12: real-browser suite B — overlay, bounds, contrast, focus order, orange budget

**Files:** create `tests/e2e/modal-header-overlay-and-contrast.spec.ts` (or extend suite A).

- [ ] **Step 1: write the suite:**
  - **T-OVERLAY:** with the publish popover already open, trigger a `shrink_held` Re-sync. Assert `document.activeElement` is "Keep current version" **AND** that `elementFromPoint` at that control's center resolves to the control itself (or a descendant) — i.e. it is genuinely the topmost element, not merely focusable. **A test asserting only `toHaveFocus()` passes while the control is fully covered.** Also assert both overlays anchor to the BAND: **GEOMETRY, not `offsetParent`** — each overlay's left/right edges match the band's within 1px and its top matches the band's bottom within 1px. `offsetParent` is deliberately NOT the assertion: it is sensitive to transforms, hidden states and browser detail, so it false-reds on correct placement and couples the test to layout internals instead of the user-visible result.
    *Catches:* `relative` dropped from the band, silently reparenting the overlay to the panel so it lands below the entire modal.
  - **T-OVERLAY-BOUNDS:** capped height + internal scroll asserted for **ALL THREE** branches — error, shrink-confirm, success — not shrink alone. **The ERROR branch is the likeliest to overflow**: it renders `ErrorExplainer` PLUS `HelpAffordance` (`ReSyncButton.tsx:158-159`). Also assert the band and body do not reflow when any of them opens.
    *Catches:* the overlay reserves no layout space by design, so an uncapped panel silently covers Overview controls while T-OVERLAY still passes.
  - **T-CONTRAST (BOTH themes):** ≥4.5:1 (WCAG 1.4.3) for the outline Copy LABEL and the ghost Re-sync LABEL. **Assert NO border ratio** — `border-border-strong` measures ~1.6:1 on band surface in **both** themes (light `#cfcdc7` on `#ffffff` = 1.59:1; dark `#3a3b40` on `#16171c` = 1.60:1), so a 3:1 border rule is unsatisfiable with the mandated token and would force either weakening the test or abandoning the token system (Watchpoint 8).
    **Sampling is specified (§7.2)** — both controls are `background: transparent`, so reading `backgroundColor` off the element yields `rgba(0,0,0,0)` and any ratio against it is meaningless (a correct implementation fails, or a broken one passes):
    - **Backdrop** = the computed `backgroundColor` of the nearest ancestor that actually paints — resolve by **walking up** until a non-transparent `backgroundColor` is found, not by assuming a fixed ancestor depth.
    - **Labels** = the button's computed `color` in its **idle, unfocused, unhovered** state.
    - Ratio via the standard WCAG relative-luminance formula. Toggle themes via the documented mechanism; never hardcode hex.
    *Catches:* §7.1's requirement is otherwise unexecutable — T-TOKENS, T-COPY-OUTLINE and every layout test inspect classes and geometry, so a Copy button whose border vanishes on light, or a ghost Re-sync that reads as disabled, passes all of them.
  - **T-RESYNC-FOCUS-ORDER — two states, asserted separately:**
    - **Overlay-CLOSED steady state:** sheet link → alert pill → close → toggle → Re-sync → copy. Close retains initial focus (`initialFocusRef={closeRef}`, `PublishedReviewModal.tsx:243`).
    - **Overlay-OPEN, all three branches:** shrink → Re-sync → "Keep current version" → "Apply reduced version" → copy; error → Re-sync → "Dismiss sync error" → copy; success → Re-sync → "Dismiss sync result" → copy.
    - **Overlay controls always sit BETWEEN Re-sync and Copy** — never after Copy, never portalled elsewhere.
    *Catches:* Re-sync landing after Copy; an unscoped order test that runs with an overlay open, fails, and gets "fixed" by hoisting the overlay after Copy — destroying focus proximity; and a success/error dismiss appended after Copy, which a click-by-query test would never notice.
  - **T-NO-ORANGE — enumerate, do not assert absence.** A `bg-accent` absence check is doubly wrong: it MISSES the live dot (`bg-status-live`, a different class resolving to the same hue via `globals.css:89`) and has no way to catch a future third orange. **Discovery is by COMPUTED COLOR, not class name** (§4.2):
    1. Resolve the reference once: `getComputedStyle(document.documentElement).getPropertyValue("--color-accent")`, normalized to `rgb()`.
    2. Walk every element within the header region (header band + subheader band).
    3. An element is accent-resolving if its computed `backgroundColor` **or** `borderColor` equals that reference. Compare resolved `rgb()` values, never class strings — that is what makes a future token alias, a raw hex, or an inline style fail equally.
    4. **Exclude transient state styles:** run with nothing focused and no pointer over the region, so `focus-visible` rings and `:hover` treatments are out of scope. `color` (text) is likewise out of scope — this rule is about orange FILLS and BORDERS.
    5. Assert the set matches EXACTLY, for **all three** §4.2 states:

    | State | Expected accent-resolving set |
    | --- | --- |
    | `!archived`, `isLive: true` | {publish toggle, live dot} |
    | `!archived`, `isLive: false` | {publish toggle} |
    | `archived: true` | **{} — empty** |

    **The archived row is the strongest of the three** — it is the only state that proves the assertion is measuring rather than matching a hardcoded expectation. A single happy-path fixture would pin only one row and let a new orange slip into any other state.
    **T-RESYNC-GHOST folds in here:** the strip Re-sync carries no `bg-accent` / `AccentButton`, proven by its absence from the enumerated set.
- [ ] **Step 2: run; fix implementation defects surfaced.**
- [ ] **Step 3: commit** `test(admin): real-browser overlay, contrast, focus-order and orange-budget pins`

---

## Task 13: existing e2e / spec repair — rewrite vs retire (§11 "Existing specs requiring update", §14.1)

**Failure mode caught:** coverage deleted without replacement. §14.1 is explicit — the header-rhythm assertion's premise *dissolves*; replacing it with a band-composition assertion is required, and deleting it would be a silent regression.

**Disposition table — every affected file, explicitly RETIRED (subject gone) or REWRITTEN (intent survives):**

| File / anchor | Disposition | Reason |
| --- | --- | --- |
| `published-review-modal.layout.spec.ts:169-198` (panel composition, `"header + main"`) | **REWRITE** | The panel is now three bands. Intent — the panel's bands sum to its height — survives |
| `published-review-modal.layout.spec.ts:221-232` (header rhythm) | **REWRITE, not retune** | Its premise dissolves: it polices the gap between the title row and the strip *inside* the header, and they are now separate bands. Replace with a band-composition assertion. **Do not delete; do not merely adjust a number** (§14.1) |
| `statusStripToggleLayout.spec.ts` | **REWRITE** | Measures the strip at a 390px phone; the strip's container and chrome changed. Height/geometry expectations update; the anti-jsdom rationale (`:5`) stands |
| `_statusStripToggleHarness.tsx:62-127` | **REWRITE** (already done in Task 2) | Verify it still builds and the page-chrome comment at `:127` is gone |
| `publishedReviewModal.test.tsx:270` (no `<h1>` in the panel) | **KEEP — must still pass** | Reinforced by the deleted strip `<h1>` branch. This is T-NO-H1 |
| `publishedReviewModal.test.tsx:323` (strip inside the panel) | **REWRITE** (done in Task 3) | Intent survives; the location assertion sharpens to the band |
| `statusStrip.test.tsx:400` (page chrome KEEPS tokens) | **RETIRE** (done in Task 2) | The `page` arm ceases to exist — no subject |
| `statusStrip.test.tsx:408` (modal-header chrome DROPS tokens) | **REWRITE** (done in Task 2) | Only guard against re-adding page chrome and double-seaming the band |
| `overviewSection.test.tsx:71` (`#overview` anchor exists) | **KEEP — must still pass** | The pill still targets it (Watchpoint 4) |
| `overviewSection.test.tsx` Re-sync assertions | **RETIRE or REWRITE per assertion** | Assertions about the button's presence in Overview lose their subject (RETIRE); assertions about the archived paused-notice and `CorrectionLoopCallout` survive (KEEP) |
| `step3-review-modal.layout.spec.ts:222` | **KEEP — must still pass unmodified** | Step 3 is unchanged; this passing untouched is the invariance signal |
| **`admin-parse-panel.spec.ts:269-274`** (**drift D4**) | **REWRITE** | Clicks `admin-resync-button` **scoped inside `overview-sheet-sync`**; the button leaves that container entirely so the locator resolves to nothing. Rescope to the strip band. The intent — round-trip a failing sync and assert catalog copy renders through `ErrorExplainer` — survives and must be preserved, including its deliberate non-assertion of a specific status code |

- [ ] **Step 1: grep for the full blast radius** before editing: `rg 'ReSyncButton|admin-resync|show-status-strip|strip-title|renderTitle|chrome=' tests/`. Reconcile every hit against the table; any hit not covered above gets an explicit disposition added to it.
- [ ] **Step 2: apply the dispositions.** Every RETIRE carries a one-line comment naming this task and the spec section that removed its subject.
- [ ] **Step 3: run the full e2e suites** touched above.
- [ ] **Step 4: commit** `test(admin): retarget the modal layout and strip e2e specs at the three-band frame`

---

## Task 14: close-out — source-scan pins, impeccable dual-gate, full suite, adversarial review

- [ ] **Step 1: T-TOKENS.** Source-scan the changed files: **no raw hex** in any new style; every new color / radius / spacing is a token class (`bg-warning-bg`, `text-warning-text`, `border-border-strong`, `text-text-subtle`, `bg-status-review`, `rounded-pill`, `size-tap-min`).
  *Catches:* the mock's dark-only hex ported verbatim, breaking light theme (§7.1). The mock's `:root` block is the live **dark-theme** runtime tokens byte-for-byte — porting them is the specific trap.
- [ ] **Step 2: T-TRANSITIONS.** Audit every §9 state pair as instant or as declared. Enumerate every `AnimatePresence`, ternary render and conditional block in the changed files and assert each is deliberately instant. **Compound:** toggle mid-flight (`pending`) while the copy button is in its `copied` state — independent color transitions on separate elements, no shared animating parent. **Compound (overlay):** publish-toggle popover open while the Re-sync overlay is open — neither animates the other; the requirement is focus reachability, asserted as T-OVERLAY.
  Note the §9 row governing the Re-sync overlay covers **MOTION only** — do not read it as "the result surfaces are untouched"; they gain dismiss controls, focus restoration, `role="group"`, and a moved live-region role (Task 7).
- [ ] **Step 3: T-COUNTS final verification.** Re-run the lexical scanner over all three files and confirm the committed literals: `StatusStrip.tsx` = **7**, `PublishedReviewModal.tsx` = **4**, `OverviewSection.tsx` = **4 (unchanged)**. **Verify by running the scan, never by reasoning.** A count that "should" have moved but did not (or vice versa) means an edit landed differently than assumed — investigate before touching a literal. Editing a literal to green a red test defeats the pin's entire purpose.
- [ ] **Step 4: impeccable dual-gate (invariant 8).** Run `/impeccable critique` AND `/impeccable audit` on the affected diff, with the canonical v3 setup gates: `context.mjs` context load (PRODUCT.md + DESIGN.md) → register reference read. Every file in this diff is a UI surface. P0 and P1 findings are fixed or explicitly deferred via a `DEFERRED.md` entry. Findings + dispositions go in §12 of the handoff doc. **This runs BEFORE adversarial review.**
- [ ] **Step 5: full pre-push gates** — scoped runs miss regressions:
  ```
  pnpm test && pnpm typecheck && pnpm lint && pnpm format:check && pnpm build
  ```
  plus the Playwright e2e suites (excluded from `pnpm test`).
- [ ] **Step 6: adversarial review (cross-model).** Invoke the `adversarial-review` skill against Codex on the whole diff. The brief MUST:
  - state the **fresh-eyes posture** ("treat the entire diff as if you have not seen it before");
  - inline **"Your role: REVIEWER ONLY"** — do not fix issues, propose patches as commits, or imply changes you will make;
  - carry an **`EXPLICITLY DO NOT RELITIGATE`** block reproducing Watchpoints 1–10 from `00-overview.md` **with their `file:line` ratification citations inlined** — Codex cannot read `~/.claude/` memory files, so every load-bearing principle must be inline or in the repo;
  - forbid nested cross-model reviews from within the Codex session.
- [ ] **Step 7: commit** `docs(admin): record the modal-header-reconciliation close-out gates`

**Fix-round regression budget.** Every adversarial-round patch: (a) re-grep the finding's bug **class** across the touched surface — not just the named instance; (b) re-run the relevant meta-tests (`pageTransitions`, `accent-button-atom`, `_metaDestructiveConfirm`, `_uiLabelExceptions`); (c) note both in the round closure. If three rounds in a row land findings on the same vector, ship structural defenses (meta-test / registry row / CI-time grep guard) **in that round's repair commit** rather than waiting for another round to confirm the analysis was incomplete.
