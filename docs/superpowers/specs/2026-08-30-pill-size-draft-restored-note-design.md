# Two phone P1s: attention-pill legibility, and a note that the report draft came back

**Status:** draft · **Branch:** `fix/pill-size-draft-restored-note` · **Base:** `53a1fc82fb3633ffcdfb6d36b004c01070f9c00a`

Both deliverables close a `DEFERRED.md` row that was deferred under class-sweep exception (a) — a product decision the filing arc could not settle. Eric settled both on the 2026-08-29 decision board. This spec is the design that follows from those two decisions; it is not a re-opening of them.

---

## 1. Purpose

Doug reads these two surfaces one-handed, on a phone, on a venue floor, in variable lighting. Two arcs shipped in August each left him worse off in a way neither arc could fix from inside its own scope:

- `fix/attention-autoopen-suppress-phone` stopped the attention menu auto-opening below `sm`. Correct, and it promoted the attention pill from a redundant summary to the **only** zero-scroll signal that actionable items exist — while the pill was still typeset for the redundant job at 12px.
- `fix/wizard-report-draft-escape` made a half-typed report draft survive a modal close. Also correct, and the only thing that says the draft survived is a two-word label swap roughly twelve sections below the fold.

Neither is a bug. Both are surfaces that got a new job without getting the design that job needs.

## 1.1 Resolved scope — do not relitigate

Every row here is settled. A reviewer should verify the citation rather than re-derive the decision.

| # | Decision | Ratified by | Status |
|---|---|---|---|
| R1 | The pill's type moves **one size up at phone widths** (`text-xs` 12px → `text-sm` 14px below `sm`). | Eric, decision board artifact `b73168e0` decision 5, Option B, 2026-08-29 | **CLOSED** |
| R2 | **Both segments stay visible.** The critique's alternative — demote the monitoring segment to `sr-only` below `sm` and let the urgent count own the width — was explicitly declined by Eric. | Same. The declined alternative is recorded at `DEFERRED.md` under `ATTENTION-PILL-PHONE-LEGIBILITY-1` ("The recommendation from the critique"). | **CLOSED — do not re-raise** |
| R3 | The report section keeps **no rail status**: `railCount: null` and `hideDot: true` stay exactly as they are (`components/admin/wizard/step3ReviewSections.tsx:5157-5158`, carrying the spec §D2 comment that names it the only section without a status dot). The critique's `railCount: 1` proposal is **declined**. | Eric, decision 6, Option B, 2026-08-29 | **CLOSED** |
| R4 | A **transient "Draft restored" note ships**, visible without scrolling. R3 is not a decision to ship nothing. Fenced in both directions deliberately: the rail gains nothing, and the operator still gets told. | Same. | **CLOSED** |
| R5 | The existing label swap at `components/admin/wizard/step3ReviewSections.tsx:4783` ("Write a report" / "Continue your report") **stays**. The note is additive, not a replacement. | `DEFERRED.md`, `WIZARD-REPORT-DRAFT-RESTORE-UNDISCOVERABLE-1` | **CLOSED** |
| R6 | The note's copy is Doug-facing and owned by the impeccable gate. It carries **no error code**; master spec §12.4 is not implicated and needs no row, no `pnpm gen:spec-codes` run, and no `lib/messages/catalog.ts` edit. | This spec, §5.4 | **CLOSED** |
| R7 | The type-size change uses the **mobile-first** spelling `text-sm sm:text-xs`, not `text-xs max-sm:text-sm`. Both compile to the same rendering. See §2.4 for why, and why the file's own `max-sm:` cluster is not the governing precedent. | This spec, §2.4 | **CLOSED — a spelling preference, not a behavior claim** |

---

## 2. Deliverable 1 — the attention pill at phone widths

### 2.1 What is there now, measured

The pill sits in the review-modal header's trailing action cluster. The cluster is capped at 160px below `sm` by `HEADER_ACTION_CAP` (`components/admin/review/headerActionCap.ts:21`, the value is `max-sm:max-w-40`), and it also holds a 44px `ModalCloseButton` at `gap-2` (`components/admin/showpage/PublishedReviewModal.tsx:1096`, `components/admin/showpage/PublishedReviewModal.tsx:1343`).

Measured at 375×667 in Chromium against the committed harness, the cluster resolves to **149.72px** and the pill's own content box to **112px**. That 112px is the real budget, and it is the number the rest of this section uses. `DEFERRED.md` says "roughly 108px"; 112px is the measured value and supersedes it.

The pill is `text-xs font-semibold` with `max-sm:flex-wrap max-sm:justify-end` (`components/admin/showpage/PublishedReviewModal.tsx:1128`). The type tokens resolve to `--text-xs: 0.75rem` / line-height `1.4` and `--text-sm: 0.875rem` / line-height `1.45` (`app/globals.css:168-171`); `--breakpoint-sm: 640px` (`app/globals.css:318`).

### 2.2 The measurement

Taken at 375×667, desktop-chromium, against the committed `published-review-modal.layout.spec.ts` harness with reduced motion emulated. Heights in px.

| Pill load | at `text-xs` | at `text-sm` | delta |
|---|---|---|---|
| `2 issues` (harness default, one line) | 26.80 | 30.30 | +3.50 |
| `20 issues · 10 monitoring` | 66.39 | 76.89 | +10.50 |
| `20 issues · 3 sheet warnings · 10 monitoring` | 105.98 | 123.48 | +17.50 |
| `99+ issues · 99+ sheet warnings · 99+ monitoring` | 105.98 | 123.48 | +17.50 |

Width is **112px in every multi-segment row** — the cap binds first. So the size increase buys no width at all; it is spent entirely on height. That is the whole mechanical story of this change, and every risk below follows from it.

**The bound is closed, and that matters for review.** The last two rows are identical because each count is capped at 99+ (`components/admin/showpage/PublishedReviewModal.tsx:1172`, `components/admin/showpage/PublishedReviewModal.tsx:1197`, and the monitoring segment) and there are exactly three segments. So the pill's height at `text-sm` and 375px has a **maximum of 123.48px**, reached by any load with three populated segments. There is no unbounded input here, and no "what if the count is larger" case: a larger count renders the same glyphs.

**Probe provenance, stated honestly.** These numbers come from a throwaway probe that replaced the pill's `innerHTML` with reconstructed segment markup and toggled the type class in-browser, because the committed harness fixture carries `HARNESS_ALERT_COUNT = 2` (`tests/e2e/_publishedReviewModalHarness.tsx:234`) and never wraps. The probe was reverted and is not in the diff. The **deltas** are the reliable output; the absolute heights are a close reconstruction, not the shipped render — `DEFERRED.md` records 84.4px for the two-segment load where the probe reconstructs 66.39px. The plan therefore does not quote these absolutes as assertion thresholds. It builds a real wrapping fixture and measures the real component (§2.7, AC-1).

### 2.3 The change

Four render sites carry this pill's type. All four move, for one reason stated once in §2.5.

| # | Site | State | Change |
|---|---|---|---|
| S1 | `components/admin/showpage/PublishedReviewModal.tsx:1128` | interactive composite button (issues / sheet warnings / monitoring) | `text-xs` → `text-sm sm:text-xs` |
| S2 | `components/admin/showpage/PublishedReviewModal.tsx:1301` | static "Alerts unavailable" (degraded) | same |
| S3 | `components/admin/showpage/PublishedReviewModal.tsx:1334` | static "In sync" | same |
| S4 | `components/admin/wizard/Step3ReviewModal.tsx:599` | the wizard modal's own interactive pill | same |

Nothing else about any of the four changes. No padding, no gap, no cap, no wrap class, no colour, no `before:` band arithmetic.

### 2.4 Why `text-sm sm:text-xs` and not `text-xs max-sm:text-sm`

They render identically. The repo has a settled convention and the pill's own file has a local one, and they point opposite ways, so the choice is stated here once to keep it out of review.

Every responsive type pair in the codebase is **mobile-first** — the base class is the phone value and a `sm:`-prefixed class raises it for wider screens. Nine sites, zero counter-examples: `components/layout/Header.tsx:83`, `components/layout/Header.tsx:95`; `components/admin/PreviewBanner.tsx:73`; `components/admin/OnboardingWizard.tsx:276` (`text-xs ... sm:text-sm`, the same pair in the opposite direction); `components/admin/StagedPreviewBanner.tsx:108`; `components/admin/wizard/Step1Share.tsx:185`; `components/admin/wizard/Step3Review.tsx:1356`; `components/crew/RightNowHero.tsx:525`; `app/me/meShowSections.tsx:226`.

The pill's own class list uses `max-sm:` three times (`max-sm:max-w-40`, `max-sm:flex-wrap`, `max-sm:justify-end`). That cluster is not the governing precedent, because all three are **layout escapes** — a desktop-shaped element being told to survive a narrow viewport. This change is the opposite: the phone value is the designed value, and the desktop value is the concession. Writing it mobile-first says that in the class list. It also matches all nine repo-wide type precedents, against a local idiom that is about a different thing.

### 2.5 Class sweep: why all four sites, in this PR

`AGENTS.md` makes repairing every instance of one shape in one PR the **default**, and requires a filing to name exception (a), (b), or (c) to deviate. None applies here.

The shape is "the review-modal header attention pill's type size at phone widths." S1–S3 are three states of one pill in one header — the same element, the same glance, the same Doug. Shipping S1 alone would make the pill's type size change as its state changes, which is a worse surface than either uniform choice. S4 is the same component pattern in the wizard modal, sharing `HEADER_ACTION_CAP` by import (`components/admin/wizard/Step3ReviewModal.tsx:51`) and reached by the same operator on the same phone — and deliverable 2 of this very spec is in that wizard.

This is inside R1, not an extension of it. Eric ratified "the pill's type moves one size up at phone widths." The class is "that pill"; a state machine's branches are not four separate products.

**S2 carries a live constraint the sweep must respect.** "Alerts unavailable" was measured at ~104px at 12px against the ~108px budget, and a round-4 critique removed `truncate` from both static pills because `text-overflow` does not inherit into an anonymous flex item, so the label clipped to "Alerts unavailab" with no ellipsis drawn (`components/admin/showpage/PublishedReviewModal.tsx:1306-1331`). The ratified resolution is that the copy **wraps** inside the `min-w-0` box, and wrapping is explicitly non-destructive. At 14px the label needs more width than at 12px, so it wraps sooner. That is the already-ratified behavior, not a regression, and AC-3 pins that it still wraps rather than clips.

### 2.6 Dimensional invariants

The capped cluster is a fixed-width parent with flex children, so every relationship is named with the class that guarantees it. Tailwind v4 does not default `.flex` to `align-items: stretch`; nothing here relies on it.

| # | Parent → child | Guaranteed by | Effect of this change |
|---|---|---|---|
| DI-1 | header cluster → its content, capped at 160px below `sm` | `HEADER_ACTION_CAP` = `max-sm:max-w-40` on `PublishedReviewModal.tsx:1096` | unchanged; the cap is on the cluster and is width-only |
| DI-2 | cluster → pill, cross-axis | `items-center` on `components/admin/showpage/PublishedReviewModal.tsx:1096` | unchanged. `items-center` transfers **no width cap** to the child; that is why DI-3 exists |
| DI-3 | pill may not exceed its share of the capped parent | `min-w-0` on the pill wrapper `components/admin/showpage/PublishedReviewModal.tsx:1112` and on the pill itself `components/admin/showpage/PublishedReviewModal.tsx:1128` | unchanged. A flex item defaults to `min-width: auto`, so without `min-w-0` the pill's min-content width forces it wider than the cap |
| DI-4 | pill → its segments, overflow direction | `max-sm:flex-wrap` on `components/admin/showpage/PublishedReviewModal.tsx:1128` | unchanged, and load-bearing: with width capped at 112px, `text-sm` overflow has **only** the vertical axis to go to |
| DI-5 | static pills shrink with the cluster | `min-w-0` **and the deliberate absence of `shrink-0`** on `components/admin/showpage/PublishedReviewModal.tsx:1301` and `components/admin/showpage/PublishedReviewModal.tsx:1334` | unchanged. `min-w-0` alone cannot work: it lowers the automatic minimum, but `flex-shrink: 0` means the item never contracts regardless (`components/admin/showpage/PublishedReviewModal.tsx:1306-1311`) |
| DI-6 | pill hit band ≥ 44px | `before:absolute before:inset-x-0 before:-inset-y-3` on `components/admin/showpage/PublishedReviewModal.tsx:1128` and `Step3ReviewModal.tsx:599` | **band grows with the pill.** See §2.7 |
| DI-7 | header + main + footer sum to the panel height at 375 | asserted by `T-LAYOUT` (`tests/e2e/published-review-modal.layout.spec.ts:298`) | **at risk** — a taller pill makes a taller header. See §2.7 |

### 2.7 The two real risks, and the assertions that pin them

Both follow from "the extra size is spent on height."

**RISK-1 — the hit band grows toward the publish toggle.** The tap band is `before:-inset-y-3`, 12px beyond the pill's box on each side. It is derived from the type size, and the source comment says so explicitly: "text-xs (~16px line box) + py-1 (8px) ≈ a 24px visible pill; -inset-y-3 (12px per side) ≈ 48px ≥ the 44px tap floor" (`components/admin/showpage/PublishedReviewModal.tsx:1099-1101`).

The floor is safe and gets safer: a one-line pill goes 26.80px → 30.30px, so the band goes ≈50.8px → ≈54.3px, both clear of 44px. The danger is the other end. A three-segment pill is 123.48px tall at `text-sm`, and with the band that is roughly 147px of interceptor hanging in the header — where `tests/e2e/attention-autoopen-suppress.spec.ts:151-152` asserts that with the menu suppressed **nothing** may intercept the published toggle, and fails naming any interceptor that appears. That assertion was tightened by the very arc that filed this row, after it had been filtering pill-band interceptions out as "pre-existing" (`tests/e2e/attention-autoopen-suppress.spec.ts:145`).

So this change can plausibly red a test that exists specifically to catch it, which is the correct outcome if it happens. **AC-2** runs that spec at the worst-case load and requires it green. If the band does reach the toggle, the repair is bounded and named in advance: reduce `-inset-y-3` to the smallest inset that still clears 44px at the new type size, since the visible pill is taller and needs less help. Growing the pill, moving the toggle, or relaxing the occlusion assertion are all out of scope.

**RISK-2 — the header gets taller and `T-LAYOUT` breaks.** `T-LAYOUT` asserts header + main + footer sum to the panel at ±0.5px at 375×812. A pill up to 17.50px taller makes the header up to 17.50px taller. If the equation is written against measured parts it stays true; if any part is pinned to a literal, it breaks. **AC-4** runs the full layout spec at both viewports.

The source comment at `components/admin/showpage/PublishedReviewModal.tsx:1086-1095` records that an uncapped pill drove the header to 587.97px against a 164.19px baseline and put the strip out of reach. That failure was a **width** failure — the cap fixed it and the cap is untouched. This change cannot reproduce it: width is pinned at 112px in every measured row.

### 2.8 Guard conditions

The pill's inputs are three counts. Every combination is already handled by the existing render and none of it changes; stated here because a spec must say what renders.

| `needsYou` | `k` (sheet warnings) | `selfHeal` | Renders |
|---|---|---|---|
| 0 | 0 | 0 | not this pill — the static "In sync" branch (S3), `components/admin/showpage/PublishedReviewModal.tsx:1332` |
| 0 | 0 | >0 | monitoring-only pill, hollow positive dot, **no leading middot** (`components/admin/showpage/PublishedReviewModal.tsx:1211-1215`) |
| >0 | 0 | 0 | urgent branch, single segment, one line |
| >0 | >0 | >0 | all three segments; the worst case in §2.2 |
| — | — | — | alerts degraded and `selfHeal` empty → "Alerts unavailable" (S2), `components/admin/showpage/PublishedReviewModal.tsx:1296-1304` |
| >99 | >99 | >99 | each segment renders `99+` plus an `sr-only` exact count (`components/admin/showpage/PublishedReviewModal.tsx:1172-1180`, `components/admin/showpage/PublishedReviewModal.tsx:1197-1205`) |

`null` and `NaN` do not arise: all three are array lengths or a derived integer, never props from a partially-edited form.

### 2.9 Transition inventory

The pill has four visual states — **U** urgent (≥1 issue), **M** monitoring-only, **D** degraded ("Alerts unavailable"), **S** in sync — plus the size axis this change adds. All 6 state pairs, plus the size axis and the compound cases.

| Pair | Treatment |
|---|---|
| U ↔ M | colour and border change under `transition-colors duration-fast` (`components/admin/showpage/PublishedReviewModal.tsx:1128`). Segment count changes with it: **instant**, no layout animation, as today |
| U ↔ D | element swaps `button` → `span`: **instant — no animation needed**, unchanged |
| U ↔ S | element swaps `button` → `span`: **instant**, unchanged |
| M ↔ D | `span` → `span`, different copy: **instant**, unchanged |
| M ↔ S | `span` → `span`: **instant**, unchanged |
| D ↔ S | `span` → `span`: **instant**, unchanged |
| **any state × viewport crossing 640px** | type size changes at the breakpoint: **instant by construction** — a CSS media query, no transition property applies to `font-size` on any of the four sites, and none is added |
| **compound: viewport crosses 640px while `transition-colors` is mid-flight** | the colour transition continues uninterrupted; `font-size` is not a transitioned property, so the two axes cannot interact. No `AnimatePresence` and no framer-motion on any of the four sites |
| **compound: count changes (rerender) while crossing the breakpoint** | React rerenders the subtree; the media query re-evaluates on the new markup. Both are instant, so there is no ordering to get wrong |
| **reduced motion** | `app/globals.css:543-549` collapses `--duration-fast/normal/slow` to `0ms`, so `duration-fast` on `components/admin/showpage/PublishedReviewModal.tsx:1128` is already free. This change adds no animated property, so it adds no reduced-motion surface |

### 2.10 Pre-code mechanical UI checklist (D1)

- **44px tap targets** — DI-6 / RISK-1 / AC-2. The band grows; the floor is verified by `T-TAP`, not assumed.
- **Em dashes in user-visible copy** — none. No copy string changes in D1.
- **Apostrophe literals** — no copy string changes in D1.
- **Canonical type tokens** — `text-sm` and `text-xs` are `@theme` tokens (`app/globals.css:168-171`). No arbitrary values, no `text-[14px]`.
- **New or repurposed colour token** — none. Contrast is untouched: `border-warning-text` on `bg-warning-bg` stays 8.79:1 light / 9.64:1 dark (`components/admin/showpage/PublishedReviewModal.tsx:1146-1148`).

---

## 3. Deliverable 2 — telling the operator the draft came back

### 3.1 The problem, precisely

The draft is restored on the **first frame**, by a lazy `useState` initializer: `const [draft, setDraft] = useState(() => readStoredDraft(draftStorageKey));` (`components/admin/wizard/step3ReviewSections.tsx:4683`, key built at `components/admin/wizard/step3ReviewSections.tsx:4678` from `reportDraftStorageKey`). So there is no restore *event* to hook — by the time anything renders, a restored draft and a typed draft are the same state.

Everything that currently says the draft survived is below the fold: the label swap at `components/admin/wizard/step3ReviewSections.tsx:4783` (`draft.trim() === "" ? "Write a report" : "Continue your report"`) and the guarantee copy "Kept on this device until you close the tab." at `components/admin/wizard/step3ReviewSections.tsx:4802-4805`. The report section is last, the modal opens at scroll 0 (fresh mount, `jump` null at `Step3ReviewModal.tsx:433`, `hashSync` off at `components/admin/wizard/Step3ReviewModal.tsx:732`), and the file is 5164 lines of sections in between.

### 3.2 The design

**One note, at the top of the content pane, mount-scoped, self-dismissing.**

| Property | Decision |
|---|---|
| **Where** | First child of the modal's content-pane top slot — immediately before the conditional resolution `<section>` at `components/admin/wizard/Step3ReviewModal.tsx:954-1036`, which is what currently occupies `{children}` inside the scroller at `components/admin/review/ShowReviewSurface.tsx:1059`. That scroller (`components/admin/review/ShowReviewSurface.tsx:1051-1055`) is the element the modal opens scrolled to 0. No banner slot exists there today; this creates it. |
| **Why there and not in the report section** | R4 requires "visible without scrolling." The report section is the thing the operator cannot reach. Putting the note beside the draft would reproduce the defect. |
| **Cardinality: singular** | One modal instance hosts exactly one drive file. `components/admin/wizard/Step3SheetCard.tsx:630-631` renders `<Step3ReviewModal data={buildStagedSectionData({…dfid, wizardSessionId})}>` gated by a per-card `useState(false)` at `components/admin/wizard/Step3SheetCard.tsx:273`. One card → one `dfid` → one draft key → one possible note. No count, no list, no cap. |
| **How it knows** | The modal computes the key itself. `const { dfid, wizardSessionId } = data;` is already in scope at `components/admin/wizard/Step3ReviewModal.tsx:156` (both non-null on the type, `sectionData.ts:120-121`), and `reportDraftStorageKey` / `readStoredDraft` are exported from `lib/admin/reportDraftStore.ts:38` / `lib/admin/reportDraftStore.ts:61`. **No new props, no state lifted out of `step3ReviewSections.tsx`, no change to how the draft itself is restored.** |
| **When it appears** | Once, at modal mount, via a lazy initializer mirroring the one that restores the draft: true when `readStoredDraft(reportDraftStorageKey(wizardSessionId, dfid)).trim() !== ""`. |
| **Non-empty predicate** | `.trim() !== ""` — byte-identical to the predicate the label swap uses at `step3ReviewSections.tsx:4783` and the submit guard at `components/admin/wizard/step3ReviewSections.tsx:4858`. A whitespace-only draft shows no note, exactly as it shows "Write a report". Two predicates that must agree are one defect waiting; §3.5 AC-9 pins that they do. |
| **When it goes** | A single `setTimeout` clears it after **5000ms**, matching the in-file transient precedent at `step3ReviewSections.tsx:1683-1687` (the CrewBreakdown outcome banner: 5s, success only, cleaned up on unmount). Not a new number. |
| **Reappearance** | Never within one modal session — the state is mount-scoped and only ever goes `true → false`. Reopening the modal is a fresh mount and evaluates again. |
| **Announcement** | Through the shell's existing announcer, not a new region. See §3.3. |

### 3.3 Accessibility: reuse the announcer, add no live region

`ReviewModalShell.tsx:647-655` already wraps the entire panel interior in `AdminAnnounceProvider` (`testId={`${testIdBase}-undo-status`}`, `label="Status updates in this dialog"`), consumed as `const { announce } = useContext(UndoAnnounceContext)` — three existing precedents at `components/admin/RecentAutoAppliedStrip.tsx:353`, `components/admin/RecentAutoAppliedStrip.tsx:716`, and `components/admin/ReSyncButton.tsx:317`.

The note announces through that provider once on mount, and the visible element is **`aria-hidden`**. This mirrors the CrewBreakdown precedent's split (persistent `sr-only role="status"` announcer plus an `aria-hidden` visible banner, `step3ReviewSections.tsx:1705-1733`) while adding no second region.

**This is not a style preference — it is the only shape the meta-test permits.** `tests/components/_metaLiveRegionMounting.test.ts` walks `components/` and `app/` with the TypeScript compiler API (`ROOTS` at `tests/components/_metaLiveRegionMounting.test.ts:34`, `ts.createSourceFile` at `tests/components/_metaLiveRegionMounting.test.ts:300`, JSX walk at `tests/components/_metaLiveRegionMounting.test.ts:453`) and forbids any `role="status"` / `aria-live="polite"` element whose **mount** is gated by a ternary arm, an `&&` right-hand side, an `if`, or a guard return (`tests/components/_metaLiveRegionMounting.test.ts:427-450`, `tests/components/_metaLiveRegionMounting.test.ts:461`): "a live region inserted together with its text is never announced" (`tests/components/_metaLiveRegionMounting.test.ts:632-636`). A conditionally-rendered "Draft restored" live region is precisely the forbidden shape.

The guard's own failure message names this design as the remedy, near enough verbatim: mount the region unconditionally and toggle the text, or announce through `UndoAnnounceContext` (`tests/components/_metaLiveRegionMounting.test.ts:633-635`).

It also keeps the registry untouched. That test pins `Step3ReviewModal.tsx` at exactly **1** live region (`tests/components/_metaLiveRegionMounting.test.ts:256`), asserted as an equality and not a ceiling (`tests/components/_metaLiveRegionMounting.test.ts:596-598`, `tests/components/_metaLiveRegionMounting.test.ts:624-628`), so adding a region would require a registry edit; reusing the provider requires none. And `step3ReviewSections.tsx` is registered at **0** (`tests/components/_metaLiveRegionMounting.test.ts:250`), so siting the region beside the draft instead would fail the same guard. The walker is filesystem-driven (`readdirSync` at `tests/components/_metaLiveRegionMounting.test.ts:259-267`), so this is enforced whether or not anyone remembers it.

### 3.4 Copy

Rendered element, not a description. Exact default text:

> **Report draft restored. It is waiting in Report an issue, at the end of this list.**

Constraints the copy must hold, whatever the impeccable gate settles on:

- Names the destination. The whole defect is that the operator does not know where the draft is; a bare "Draft restored" repeats the label swap's failure at the top of the page instead of the bottom.
- "Report an issue" is quoted **exactly** as the section label renders it (`step3ReviewSections.tsx:5155`).
- **No em dash** (mechanical UI checklist).
- No apostrophe. "It is" rather than a contraction — sidesteps the apostrophe-literal check entirely rather than relying on getting the character right.
- Sentence case. No error code: this is not a failure and §12.4 is not implicated (R6).

Wording is the impeccable gate's to refine (R6); placement, trigger, timing, and the constraints above are not.

### 3.5 Guard conditions

| Input state | Renders |
|---|---|
| no stored draft (key absent) | `readStoredDraft` returns `""` (`lib/admin/reportDraftStore.ts:64`) → **no note** |
| stored draft is `""` | the writer removes the key rather than storing `""` (`lib/admin/reportDraftStore.ts:71-72` comment), and `readStoredDraft` returns `""` regardless → **no note** |
| whitespace-only draft | `.trim() !== ""` is false → **no note**, consistent with the label reading "Write a report" |
| non-empty draft | **note renders**, dismisses after 5000ms |
| draft at the 2000-char cap | `capDraft` returns capped text, still non-empty → **note renders**. `REPORT_MESSAGE_MAX_CHARS = 2000` (`lib/admin/reportDraftStore.ts:33`) |
| `sessionStorage` unavailable or blocked | `readStoredDraft` catches — the property accessor itself throws `SecurityError` when site data is blocked, which is why the read is inside the `try` (`lib/admin/reportDraftStore.ts:60-69`) — and returns `""` → **no note**. No crash, and the note degrades to the pre-restore behavior exactly as the draft does |
| operator closes the modal inside 5000ms | the effect's cleanup clears the timer; no state update after unmount |

`dfid` and `wizardSessionId` are non-null on the type (`sectionData.ts:120-121`), so no null branch arises; the implementation still guards rather than asserting, and an absent value yields no note.

### 3.6 Transition inventory

The note has three states — **A** absent (no draft), **V** visible, **G** gone (timed out). All 3 pairs, plus compounds.

| Pair | Treatment |
|---|---|
| A → V | does not occur after mount. The note's state is decided in the mount initializer, so a modal that opens without a draft never shows it. **Unreachable by construction**, and AC-10 pins that |
| V → G | fade + collapse over `duration-fast`, then unmount. Free under reduced motion: `app/globals.css:543-549` collapses `--duration-fast/normal/slow` to `0ms`, so a reduced-motion user gets an instant removal with no extra code |
| A → G | the same state as far as the DOM is concerned — nothing rendered. **Instant, no animation needed** |
| **compound: note dismisses while the modal entrance animation is still running** | cannot collide. The entrance is CSS on the scrim and panel only (`app/globals.css:991-1010`); the body does not animate, and there is no `AnimatePresence` or framer-motion anywhere in the modal, shell, or surface |
| **compound: note dismisses while the operator is scrolling** | the scroller carries `motion-safe:scroll-smooth` (`ShowReviewSurface.tsx:1054`). Removing a node above the scroll position shifts content under the operator's thumb. **Mitigated by placement, not by animation**: the note sits at scroll 0 and dismisses 5s after open, so a scrolled operator has already left it behind. AC-11 asserts the pane's scroll position is unchanged across the dismissal |
| **compound: note dismisses while a section is expanding/collapsing** | independent subtrees, no shared animation driver, no layout dependency between them. **No interaction** |
| **compound: operator opens the report section inside the 5s window** | the note still dismisses on its own timer. It is not a pointer to current focus; it says the draft exists. No coupling, deliberately — coupling it to section state would need the section's expanded flag lifted to the modal for no gain |

### 3.7 Dimensional invariants (D2)

The note is an ordinary in-flow block at the top of a scroller, so the list is short — but the phantom-gap scanner makes it non-optional.

| # | Parent → child | Guaranteed by | Note |
|---|---|---|---|
| DI-8 | scroller → note, full content width | note is a block-level child of the scroller's content column (`ShowReviewSurface.tsx:1051-1059`); no `flex` in the chain, so no `items-stretch` question arises | |
| DI-9 | the note must never be a **zero-height in-flow child** | it renders with content and padding when present, and is **absent from the DOM** when not — never mounted-but-empty | `tests/e2e/admin-layout-dimensions.spec.ts:599` scans for zero-height in-flow pane children. `tests/e2e/helpers/phantomGap.ts:260` skips `position:absolute`, which is why the `sr-only`-when-idle pattern is safe (precedent `Step3ReviewModal.tsx:763-769`) — this note takes the simpler route and unmounts instead |
| DI-10 | removing the note must not move settled geometry in other specs | the note only mounts when `sessionStorage` holds a non-empty draft for this exact key | `tests/e2e/admin-layout-dimensions.spec.ts:1209-1215` polls a crew card's `top` until it settles, and a node vanishing above it mid-poll would move it. Every e2e context starts with empty `sessionStorage`, so the note never mounts in those runs unless a fixture deliberately seeds the key. AC-12 pins that no existing spec seeds it |

### 3.8 Pre-code mechanical UI checklist (D2)

- **44px tap targets** — the note has no interactive element. Nothing to tap, so no floor applies. Deliberate: a dismiss button would add a 44px target 8px from the modal's own controls at 375px, which is the shape D1 is fixing.
- **Em dash in user-visible copy** — none; §3.4 forbids it.
- **Apostrophe literal** — avoided by construction; §3.4.
- **Canonical type/token classes** — the note uses `text-xs/relaxed text-text-subtle` for secondary copy, the token pair the sibling guarantee note already uses at `step3ReviewSections.tsx:4803`.
- **New or repurposed colour token** — none. The note reuses existing surface and text tokens, so no new contrast ratio needs pinning in `DESIGN.md`.

---

## 4. Documented limits

Filed here rather than as ledger rows, per the process mint freeze. Each names what would re-open it.

- **L-1 — the note is time-boxed, so an operator who looks away for 5s misses it.** The label swap at `step3ReviewSections.tsx:4783` and the guarantee copy at `components/admin/wizard/step3ReviewSections.tsx:4802` remain as the durable cues; the note is the zero-scroll one. Eric chose "transient" (R4). *Re-file trigger:* a report of an operator retyping a draft **after** this ships.
- **L-2 — the note does not say how long the draft lasts.** "Kept on this device until you close the tab." already says that, next to the field (`components/admin/wizard/step3ReviewSections.tsx:4804`). Repeating it at the top would trade the note's one job for two. *Re-file trigger:* an impeccable finding that the top note reads as a durability promise.
- **L-3 — D1 leaves the pill's information density unchanged.** At 375px a three-segment pill is a 123.48px block of wrapped text. It is legible, which is what R1 bought; it is not compact. The compaction options all reduce what Doug is told, and R2 closed that direction. *Re-file trigger:* a decision to revisit R2.
- **L-4 — the `DEFERRED.md` row points at lines 5211-5212 of `components/admin/wizard/step3ReviewSections.tsx` for the rail contract, and that file is 5164 lines long; the live anchor is `components/admin/wizard/step3ReviewSections.tsx:5157-5158`.** A drifted line anchor on a correct claim, not a defect. Both rows graduate to the archive with this PR, so the stale anchor leaves the open queue with them.

---

## 5. Acceptance criteria

Test shapes, not test code. Every AC names the failure it catches.

| AC | Assertion | Catches |
|---|---|---|
| AC-1 | Real-browser (Playwright) `getBoundingClientRect` at **375×667** on the pill at a three-segment load, via a new wrapping fixture — the committed harness is `HARNESS_ALERT_COUNT = 2` and never wraps. Asserts the measured height at `text-sm` and that the pill's width stays at the cap. Derived from fixture counts, never hardcoded | jsdom cannot compute this. Pins the height the change actually produces rather than the reconstruction in §2.2 |
| AC-2 | `tests/e2e/attention-autoopen-suppress.spec.ts` green at the worst-case load, with the toggle-interception assertion (`tests/e2e/attention-autoopen-suppress.spec.ts:151-152`) non-vacuous | RISK-1. The taller hit band reaching the published toggle |
| AC-3 | At 375px, S2's "Alerts unavailable" **wraps** and is not clipped: full text present in the accessible name, and no `text-overflow` clip | The round-4 defect (`components/admin/showpage/PublishedReviewModal.tsx:1315-1324`) returning at the larger size |
| AC-4 | `published-review-modal.layout.spec.ts` green at both viewports, including `T-LAYOUT` and `T-TAP` | RISK-2, and the 44px floor at the new size |
| AC-5 | `T-TAP`'s non-vacuity guard still holds: the visible pill is genuinely shorter than the band it claims to cover | A 30.30px pill passing the probe trivially instead of proving the before-pseudo-element band exists |
| AC-6 | All four sites (S1–S4) carry the responsive pair; a structural assertion derived by scanning the files, not a hand-listed set | Class-sweep regression: a fifth pill added later at `text-xs` |
| AC-7 | The tap-band arithmetic comment at `components/admin/showpage/PublishedReviewModal.tsx:1099-1101` is updated to the `text-sm` numbers | A comment that documents the old size is worse than none — it is a false ground for the next reader |
| AC-8 | The note renders at the top of the content pane when `sessionStorage` holds a non-empty draft for the modal's key, and is reachable without scrolling at 375px (its rect sits inside the scroller's initial viewport) | The whole point of R4 |
| AC-9 | The note's predicate and the label swap agree on every input: absent, `""`, whitespace-only, one char, capped-length | Two predicates drifting apart — a note that fires while the label says "Write a report" |
| AC-10 | The note never appears on a modal opened with no stored draft, including after typing into the report field during that session (A → V is unreachable post-mount) | A note that fires on the operator's own typing |
| AC-11 | The pane's `scrollTop` is unchanged across the note's dismissal | Content shifting under a thumb |
| AC-12 | `tests/components/_metaLiveRegionMounting.test.ts` green with its registry count for `Step3ReviewModal.tsx` **unchanged at 1**, and no existing e2e fixture seeds the draft key | Adding a forbidden gated live region; and DI-10's flake |
| AC-13 | Announcement fires exactly once per mount through `UndoAnnounceContext`, not on the dismissal | A double announcement, or an announcement on removal |

## 6. Out of scope

- Any change to `railCount` or `hideDot` for the report section (R3).
- Any change to the label swap or the guarantee copy (R5).
- Any change to `HEADER_ACTION_CAP`, the pill's padding, gap, colours, or the 99+ cap.
- Any change to how the draft is stored or restored — `lib/admin/reportDraftStore.ts` is read-only to this arc.
- Any DB, RPC, migration, or schema work. This arc touches no DB layer, so the tier × domain and CHECK/enum matrices are **N/A — no DDL, no CHECK, no enum, no RPC**.
- No new boolean config field or toggle, so the flag-lifecycle table is **N/A**.
- No env-gated behavior, so the build-vs-runtime gate statement is **N/A**.
