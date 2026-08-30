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
| R6 | The note's copy is Doug-facing and owned by the impeccable gate. It carries **no error code**; master spec §12.4 is not implicated and needs no row, no `pnpm gen:spec-codes` run, and no `lib/messages/catalog.ts` edit. | This spec, §3.4 | **CLOSED** |
| R8 | The sweep is the **four capped, wrapping sites** (P1, P2, P3, W2). `components/admin/wizard/Step3ReviewModal.tsx:574` and `components/admin/wizard/Step3ReviewModal.tsx:676` are **out of class** on the same-shape test, not deferred: they are `whitespace-nowrap` in an uncapped cluster, so the wrapped-12px defect R1 names does not occur there, and widening them would trade title width for chip legibility — a product decision Eric has not been asked. No ledger row is owed. | bl-orch ruling 2026-08-30; reasoning in §2.5 | **CLOSED** |
| R7 | The type-size change uses the **mobile-first** spelling `text-sm sm:text-xs`, not `text-xs max-sm:text-sm`. Both compile to the same rendering. See §2.4 for why, and why the file's own `max-sm:` cluster is not the governing precedent. | This spec, §2.4 | **CLOSED — a spelling preference, not a behavior claim** |

---

## 2. Deliverable 1 — the attention pill at phone widths

### 2.1 What is there now, measured

The pill sits in the review-modal header's trailing action cluster. The cluster is capped at 160px below `sm` by `HEADER_ACTION_CAP` (`components/admin/review/headerActionCap.ts:21`, the value is `max-sm:max-w-40`), and it also holds a `ModalCloseButton` at `gap-2` (`components/admin/showpage/PublishedReviewModal.tsx:1096`, mounted at `components/admin/showpage/PublishedReviewModal.tsx:1343`), whose 44px comes from `size-tap-min` (`components/admin/review/ModalCloseButton.tsx:20`) against `--spacing-tap-min: 44px` (`app/globals.css:224`).

Measured at 375x667 in Chromium against the committed harness pages, the cluster is exactly the pill plus **48px** of trailing chrome (44px Close + 8px `gap-2`, less a 4px end margin). That gives two consistent pairs, and they are different fixture states rather than one situation:

| Fixture | Pill width | Cluster width |
|---|---|---|
| harness.html, one segment | 101.72 | 149.72 (under the cap) |
| every wrapping page | 112 | 160 (**at** the cap) |

An earlier draft quoted the 149.72px cluster and the 112px pill in one sentence, as though they coexisted. They do not: 149.72px is the one-segment cluster and 112px is the pill inside the capped one. **The 112px figure is the budget this section relies on**, because it is the width available once the cap binds, which is every load that wraps.

The pill is `text-xs font-semibold` with `max-sm:flex-wrap max-sm:justify-end` (`components/admin/showpage/PublishedReviewModal.tsx:1128`). The type tokens resolve to `--text-xs: 0.75rem` / line-height `1.4` and `--text-sm: 0.875rem` / line-height `1.45` (`app/globals.css:168-171`); `--breakpoint-sm: 640px` (`app/globals.css:318`).

### 2.2 The measurement

Taken at 375x667, desktop-chromium, reduced motion emulated, against the **committed harness pages** of `tests/e2e/published-review-modal.layout.spec.ts`. The real component renders; the probe toggles **only** the type class on the pill element and re-reads the rect. Nothing is reconstructed. Heights and widths in px.

| Harness page | Pill text as rendered | h @ `text-xs` | h @ `text-sm` | delta | w |
|---|---|---|---|---|---|
| harness.html | `2 issues` | 26.80 | 30.30 | +3.50 | 101.72 -> 109.78 |
| capped.html | `99+ issues (1200 issues)` | 44.80 | 48.30 | +3.50 | 112 |
| crewwarnings.html | `2 issues * 2 sheet warnings` | 84.39 | 94.89 | +10.50 | 112 |
| crewwarningscapped.html | `3 issues * 4 sheet warnings` | 84.39 | 94.89 | +10.50 | 112 |

**This reconciles the number in the ledger row.** `DEFERRED.md` records the pill at **84.4px**; the two-segment rows here measure **84.39px** at `text-xs`. Same measurement, same surface. An earlier draft of this spec carried 66.39px from a probe that rebuilt the pill's markup by hand, and that number was wrong. The reconstruction is gone and every figure above is a shipped render.

Width saturates at the **112px** cap on every page whose pill wraps, so the size increase buys no width there and is spent entirely on height. The one-segment harness.html row is the exception that proves the mechanism: it is under the cap, so it grows sideways (101.72 -> 109.78) and its height barely moves.

**What is NOT measured, and why it matters.** No committed **real-browser layout** fixture renders all three segments at once. A jsdom unit test does — `tests/components/admin/showpage/publishedReviewModal.test.tsx:529-541` composes issues, sheet warnings and monitoring and asserts the pill's text — but jsdom computes no layout, so it establishes the copy and not one pixel of the geometry this section is about. The tallest real render available is two segments at 94.89px. A three-segment pill (`issues * sheet warnings * monitoring`) is strictly taller than that and its height is **unknown at draft time**. The spec therefore states no three-segment figure, and **AC-1 builds that fixture and measures it** rather than this document guessing. Every downstream claim below is written against the measured two-segment maximum plus an explicit "the three-segment case is unmeasured" caveat, never against an invented worst case.

### 2.3 The change

**Six render sites exist. Four are in class and change; two are out of class and do not.** An earlier draft found four sites and missed two: the wizard's three chip states share one `data-testid` in a single three-branch ternary, and only the middle arm had been counted.

**In class — changed.** Every one is a pill inside a 160px cap that **wraps** below `sm`, which is the construction R1 ruled on.

| # | Site | State | Cap | Wraps |
|---|---|---|---|---|
| P1 | `components/admin/showpage/PublishedReviewModal.tsx:1128` | interactive composite button | cluster (`components/admin/showpage/PublishedReviewModal.tsx:1096`) | `max-sm:flex-wrap` |
| P2 | `components/admin/showpage/PublishedReviewModal.tsx:1301` | static "Alerts unavailable" | cluster | no `whitespace-nowrap` |
| P3 | `components/admin/showpage/PublishedReviewModal.tsx:1334` | static "In sync" | cluster | no `whitespace-nowrap` |
| W2 | `components/admin/wizard/Step3ReviewModal.tsx:599` | interactive composite pill | `HEADER_ACTION_CAP` on the pill itself | `max-sm:flex-wrap` |

The change at all four: `text-xs` -> `text-sm sm:text-xs`. Nothing else moves. No padding, no gap, no cap, no wrap class, no colour, no `before:` band arithmetic.

**Out of class — unchanged, and not a deferred defect.** `components/admin/wizard/Step3ReviewModal.tsx:574` ("Sheet changed") and `components/admin/wizard/Step3ReviewModal.tsx:676` ("All clean") are the ternary's other two arms. They are excluded on the **same-shape test**, and §2.5 gives the reasoning.

### 2.3a Decision 7 — counts only below `sm` (Eric, ratified 2026-08-30)

RATIFIED, and fenced in BOTH directions. Below `sm` the pill renders the COUNTS
without their nouns; the full wording returns at `sm` and up, and is present at
every width in the opened menu and in the accessible name.

**Why it was needed.** Decision 5B's `text-sm` collided with the 160px
`HEADER_ACTION_CAP` ratified in strip-dock §3.0. Measured at 375, cluster width
/ pill height / headroom vs the cap:

| single-segment load | `text-xs` (before 5B) | `text-sm` (5B alone) | `text-sm` + counts-only |
|---|---|---|---|
| 2, 5, 9 issues | 149.734 / 26.797 / 10.266 | 157.797 / 30.297 / 2.203 | — |
| 10, 20, 99 issues | 157.422 / 26.797 / 2.578 | 160 / **48.297** / **0** | 128.938 / 30.297 / **31.063** |

5B alone wrapped every two-digit count, on every platform. Counts-only is the
only measured option that MAKES headroom rather than spending it.

**Fence, direction 1 — the nouns do NOT come back below `sm`.** Not as a shorter
synonym, not as an abbreviation, not at a wider phone width. Restoring visible
wording below `sm` re-creates the wrap this decision exists to remove, and the
next contributor to try it will find `T-COUNTS-ONLY @375` red.

**Fence, direction 2 — the type size does NOT revert.** `text-sm sm:text-xs`
stands. Decision 5B is not reopened by this; counts-only is what makes 5B
shippable at 375, and reverting the size would make this decision pointless
rather than solving anything.

**Documented limit, named rather than hidden.** A three-segment pill at phone
width still exceeds one row: the three counts fit a single TEXT row, but a 12px
control orphans onto a second flex row once the cluster is at its cap, so the
pill measures 48.297px against a 20.297px text row. That is smaller than the
wrapped-text state it replaces and is pinned by `T-PILL-SIZE` at one extra row,
so it cannot grow silently. Separately, a two-segment pill with BOTH counts past
99 (`99+ · 99+`) still reaches the cap and wraps; that is a show with 100+ open
issues AND 100+ monitoring items at once, past the load 30 the cap's own
ratifying sweep treated as realistic.

**Accessibility is not traded away.** The nouns move to `max-sm:sr-only`, so they
remain in the accessible name at every width. The separating space is its own
text node OUTSIDE the hidden span: inside it, the accessible-name computation
trims each node and glues the name into `2monitoring`.

### 2.3b The leading mark is SHAPE, and the channel is fenced both ways

RATIFIED at bl-orch's desk 2026-08-30, on the record that mark glyphs are
design-system mechanics rather than the pill CONTENT Eric ruled in 2.3a.

Decision 7 removed the noun, and the noun was the only thing telling "3 issues"
apart from "3 sheet warnings" below `sm`. That distinction had to move somewhere,
and it took three review rounds to move it somewhere that works:

| round | mechanism | why it failed |
|---|---|---|
| R1 | warnings got a hollow ring | collided with monitoring, already a hollow ring |
| R2 | warnings got filled-and-ringed | the ring measures 1.179:1 light / 2.522:1 dark against its own fill, under the 3:1 non-text floor -- so the pair was separated by hue again |
| R3 | -- | the channel changed |

**Shipped.** Three marks, two channels, every pair differing in at least one:
issues a filled CIRCLE, warnings a filled SQUARE (`rounded-none`), monitoring a
hollow circle. Issues and warnings share a fill deliberately: a sheet warning is
work, and the shape carries the whole distinction.

**Fence, direction 1 — the distinction does NOT go back to colour, or to any
token.** Not a different border ink, not a tint, not an opacity step. Nine
candidate tokens were measured against the `status-review` fill and NONE clears
3:1 in both modes, because that fill is a mid-tone amber (#a87716 light, #e0b84e
dark): a dark ring clears in light mode, a light ring clears in dark, and no
single token clears in both. This is a property of the fill, not a gap in the
search, so proposing another token is proposing a tenth measurement of a settled
question. `tests/e2e/published-review-modal.layout.spec.ts` T-MARK-GEOMETRY
asserts that issues and warnings share a background, so a colour-based
"improvement" fails the suite rather than shipping.

**Fence, direction 2 — the shapes do NOT become subtle.** `rounded-none`, not a
2px radius: at an 8px box a small radius reads as the same blob as a circle, and
subtlety is exactly what cost R1 and R2. T-MARK-GEOMETRY requires the radii to
differ by at least a quarter of the measured mark box, derived from the box
rather than a pixel literal. Marks also stay at `size-2`; enlarging them to buy
legibility would move the cluster against the 160px cap, which is Eric's call and
not this fence's.

**And the guard reads computed geometry, never class strings.** Two guards were
retired to get here: one compared `className` (R2), one reduced classes to
(filled, ringed) booleans that could not see whether a ring was visible (R3).
jsdom applies no stylesheet and so cannot evaluate the discriminating property at
all, which is why the surviving guard is a real-browser one.

**Documented limit.** Both counts past 99 render "99+" in both segments; the
marks still differ, but the two pills read alike at a glance. Out of scope by the
same reasoning as the cap itself.

### 2.4 Why `text-sm sm:text-xs` and not `text-xs max-sm:text-sm`

They render identically. The repo has a settled convention and the pill's own file has a local one, and they point opposite ways, so the choice is stated here once to keep it out of review.

Every responsive type pair in the codebase is **mobile-first** — the base class is the phone value and a `sm:`-prefixed class raises it for wider screens. Nine sites, zero counter-examples: `components/layout/Header.tsx:83`, `components/layout/Header.tsx:95`; `components/admin/PreviewBanner.tsx:73`; `components/admin/OnboardingWizard.tsx:276` (`text-xs ... sm:text-sm`, the same pair in the opposite direction); `components/admin/StagedPreviewBanner.tsx:108`; `components/admin/wizard/Step1Share.tsx:185`; `components/admin/wizard/Step3Review.tsx:1356`; `components/crew/RightNowHero.tsx:525`; `app/me/meShowSections.tsx:226`.

The pill's own class list uses `max-sm:` three times (`max-sm:max-w-40`, `max-sm:flex-wrap`, `max-sm:justify-end`). That cluster is not the governing precedent, because all three are **layout escapes** — a desktop-shaped element being told to survive a narrow viewport. This change is the opposite: the phone value is the designed value, and the desktop value is the concession. Writing it mobile-first says that in the class list. It also matches all nine repo-wide type precedents, against a local idiom that is about a different thing.

### 2.5 Why `components/admin/wizard/Step3ReviewModal.tsx:574` and `components/admin/wizard/Step3ReviewModal.tsx:676` are out of class, not deferred

`AGENTS.md` makes repairing every instance of one shape in one PR the **default**, and "same defect, different file" is never on its own a reason to defer. That default binds only where it is genuinely the same shape. Here it is not, and the distinction is mechanical rather than a matter of taste.

Every in-class site is **capped and wrapping**. `components/admin/wizard/Step3ReviewModal.tsx:574` and `components/admin/wizard/Step3ReviewModal.tsx:676` are **`whitespace-nowrap` in a cluster with no cap at all** — `components/admin/wizard/Step3ReviewModal.tsx:567` is a bare `flex shrink-0 items-center gap-2`, and the `HEADER_ACTION_CAP` in that header is on the interactive pill element alone (`components/admin/wizard/Step3ReviewModal.tsx:599`), not on the wrapper. So:

- **The defect R1 names does not fire there.** The P1 mechanism is 12px type wrapping inside a fixed budget, which is what makes the pill hard to read on a phone. A `whitespace-nowrap` chip does not wrap at 12px, so there is no wrapped small type to fix. Leaving these two at 12px leaves no instance of the ruled defect behind, which is why this is an exclusion and **not a deferral**. There is no ledger row to file, and nothing is owed later.
- **Changing them would open a new product question Eric has not seen.** With no cap and `shrink-0`, a wider chip takes its width from the `min-w-0 flex-1` title beside it. That is exactly the failure `HEADER_ACTION_CAP` exists to prevent: the constant's own header records an uncapped pill taking 236px of a 375px viewport while the title collapsed to 6.97px, with no overflow and no scrollbar, so nothing visibly broke and the title simply stopped existing (`components/admin/review/headerActionCap.ts:6-11`). Trading title width for chip legibility is a product decision. Decision 5B did not make it, and this arc will not make it silently.

Within family A, the state-dependent-inconsistency argument still holds and is why P2 and P3 move with P1: three states of one element in one header, one glance, one operator. Family B does not get the same treatment because its arms do not share a layout contract, only a testid.

**P2 carries a live constraint the sweep must respect.** "Alerts unavailable" was measured at ~104px at 12px against the 112px budget, and a round-4 critique removed `truncate` from both static pills because `text-overflow` does not inherit into an anonymous flex item, so the label clipped to "Alerts unavailab" with no ellipsis drawn (`components/admin/showpage/PublishedReviewModal.tsx:1306-1331`). The ratified resolution is that the copy **wraps** inside the `min-w-0` box, and wrapping is explicitly non-destructive. At 14px it wraps sooner. That is the ratified behavior, not a regression, and AC-3 pins that it still wraps rather than clips.

**A dead spec found on the way, and repaired.** `tests/e2e/step3-review-modal.layout.spec.ts` matched no project regex in `playwright.config.ts`, so it ran nowhere and proved nothing — leaving W2 with no real-browser layout coverage. This arc wires it into `desktop-chromium` (one alternation entry). Probed before adopting: the spec first failed locally on a missing `HASH_FOR_LOG_PEPPER` in the harness subprocess, and a control run showed the already-wired, CI-green `step3-review-modal.agenda.spec.ts` failing **identically**, so the red was a local environment gap and said nothing about the wiring. With the variable exported, both specs run green together: **50 passed**. The wiring stays.

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
| DI-7 | the panel's parts sum to its client height. **At 375 the modal is in sheet mode and the sum includes the grab strip**: `headerH + mainH + footerH + (isSheet ? grabH : 0)` (`tests/e2e/published-review-modal.layout.spec.ts:346`) | asserted by `T-LAYOUT` (`tests/e2e/published-review-modal.layout.spec.ts:298`) | **at risk** — a taller pill makes a taller header. See §2.7 |

### 2.7 The two real risks, and the assertions that pin them

Both follow from "the extra size is spent on height."

**RISK-1 — the hit band grows toward the publish toggle.** The tap band is `before:-inset-y-3`, 12px beyond the pill's box on each side, and the source comment derives it from the type size explicitly: "text-xs (~16px line box) + py-1 (8px) = a 24px visible pill; -inset-y-3 (12px per side) = 48px >= the 44px tap floor" (`components/admin/showpage/PublishedReviewModal.tsx:1099-1101`).

The floor is safe and gets safer: a one-line pill measures 26.80px -> 30.30px, so the band goes about 50.8px -> 54.3px, both clear of 44px. The danger is the other end. The tallest **measured** pill is 94.89px at `text-sm` (two segments), and a three-segment pill is taller by an unmeasured amount. With the band that is at least ~119px of interceptor hanging in the header, where `tests/e2e/attention-autoopen-suppress.spec.ts:151-152` asserts that with the menu suppressed **nothing** may intercept the published toggle, and fails naming any interceptor that appears. That assertion was tightened by the very arc that filed this row, after it had been filtering pill-band interceptions out as "pre-existing" (`tests/e2e/attention-autoopen-suppress.spec.ts:145`).

So this change can plausibly red a test that exists specifically to catch it, which is the correct outcome if it happens. **AC-2** runs that spec at the three-segment load and requires it green. If the band does reach the toggle, the repair is bounded and named in advance: reduce `-inset-y-3` to the smallest inset that still clears 44px at the new type size, since the visible pill is taller and needs less help. Growing the pill, moving the toggle, or relaxing the occlusion assertion are all out of scope.

**RISK-2 — the header gets taller and `T-LAYOUT` breaks.** `T-LAYOUT` asserts the panel's parts sum to its client height at +/-0.5px, and at 375 that sum **includes the grab strip** (`headerH + mainH + footerH + (isSheet ? grabH : 0)`, `tests/e2e/published-review-modal.layout.spec.ts:346`) — a phone-mode term this spec earlier omitted three times, which would have false-redded a correct layout by the grab height. The measured worst case adds 10.50px to the pill and therefore up to that much to the header. If the equation is written against measured parts it stays true; if any part is pinned to a literal, it breaks. **AC-4** runs the full layout spec at both viewports.

The comment at `components/admin/showpage/PublishedReviewModal.tsx:1086-1095` records that an uncapped pill drove the header to 587.97px against a 164.19px baseline and put the strip out of reach. That was a **width** failure; the cap fixed it and the cap is untouched. This change cannot reproduce it: width measured 112px on every wrapping page.

### 2.8 Guard conditions

The published pill's render is a **three-branch chain with a precedence order**, and the order is the part a table has to get right. `interactive` is `needsYou.length > 0 || k > 0 || selfHeal.length > 0` (`components/admin/showpage/PublishedReviewModal.tsx:382`) and its branch is tested first (`components/admin/showpage/PublishedReviewModal.tsx:1102`); only if it is false does `alertsDegraded && selfHeal.length === 0` decide "Alerts unavailable" (`components/admin/showpage/PublishedReviewModal.tsx:1296`); otherwise "In sync" (`components/admin/showpage/PublishedReviewModal.tsx:1332`).

**So `alertsDegraded` is invisible whenever any count is non-zero** — the degraded branch is reachable only on an all-zero pill. Every presence combination, with `alertsDegraded` as its own axis:

| `needsYou` | `k` | `selfHeal` | `alertsDegraded` | Branch | Site |
|---|---|---|---|---|---|
| 0 | 0 | 0 | false | "In sync" | P3 |
| 0 | 0 | 0 | true | "Alerts unavailable" | P2 |
| >0 | 0 | 0 | either | interactive, issues only | P1 |
| 0 | >0 | 0 | either | interactive, **sheet warnings only** | P1 |
| 0 | 0 | >0 | either | interactive, monitoring only, hollow dot, no leading middot (`components/admin/showpage/PublishedReviewModal.tsx:1211-1215`) | P1 |
| >0 | >0 | 0 | either | interactive, two segments | P1 |
| >0 | 0 | >0 | either | interactive, two segments | P1 |
| 0 | >0 | >0 | either | interactive, two segments | P1 |
| >0 | >0 | >0 | either | interactive, **three segments** — the unmeasured worst case (§2.2) | P1 |
| >99 | >99 | >99 | either | each segment renders `99+` plus an `sr-only` exact count (`components/admin/showpage/PublishedReviewModal.tsx:1172-1180`, `components/admin/showpage/PublishedReviewModal.tsx:1197-1205`) | P1 |

`null` and `NaN` do not arise: all three are array lengths or a derived integer, never props from a partially-edited form.

**The wizard chip (W2) has its own inputs**, which the published table does not cover: the ternary is `isDirtyRescan ? "Sheet changed" : pillInteractive ? <pill> : "All clean"` (`components/admin/wizard/Step3ReviewModal.tsx:569`, `components/admin/wizard/Step3ReviewModal.tsx:580`, `components/admin/wizard/Step3ReviewModal.tsx:675`). Only the middle arm is in class. `isDirtyRescan` true takes the first arm regardless of any count, so W2 renders only when `isDirtyRescan` is false and `pillInteractive` is true.

### 2.9 Transition inventory

The published pill has four visual states — **U** urgent (any of `needsYou`, `k`, `selfHeal` non-empty, so a sheet-warning-only pill is U), **D** degraded ("Alerts unavailable", all counts zero), **S** in sync (all counts zero, not degraded) — plus **W** the wizard chip's arms. U/D/S are mutually exclusive by the precedence in §2.8, giving 3 pairs; the size axis and the compounds follow.

| Pair | Treatment |
|---|---|
| U <-> D | only reachable by every count going to zero while `alertsDegraded` is true. Element swaps `button` -> `span`: **instant, no animation needed**, unchanged |
| U <-> S | every count goes to zero, not degraded. `button` -> `span`: **instant**, unchanged |
| D <-> S | `span` -> `span`, `alertsDegraded` flips with all counts zero: **instant**, unchanged |
| within U: segment count changes | colour and border move under `transition-colors duration-fast` (`components/admin/showpage/PublishedReviewModal.tsx:1128`); the segment set changes with it: **instant** layout, as today |
| **any state x viewport crossing 640px** | type size changes at the breakpoint: **instant by construction** — a CSS media query, no transition property applies to `font-size` on any of the four sites, and none is added |
| **compound: viewport crosses 640px while `transition-colors` is mid-flight** | the colour transition continues uninterrupted; `font-size` is not a transitioned property, so the two axes cannot interact. No `AnimatePresence` and no framer-motion on any of the four sites |
| **compound: count changes (rerender) while crossing the breakpoint** | React rerenders the subtree; the media query re-evaluates against the new markup. Both are instant, so there is no ordering to get wrong |
| **compound: `isDirtyRescan` flips while the breakpoint is crossed (W2 only)** | the chip swaps arms, and the arm it swaps to may be out of class and stay at 12px. **Deliberate and visible**: §2.5 explains why, and the swap is already declared instant at `components/admin/wizard/Step3ReviewModal.tsx:568` |
| **reduced motion** | `app/globals.css:543-549` collapses `--duration-fast/normal/slow` to `0ms`, so `duration-fast` is already free. This change adds no animated property, so it adds no reduced-motion surface |

### 2.10 Pre-code mechanical UI checklist (D1)

- **44px tap targets** — DI-6 / RISK-1 / AC-2. The band grows; the floor is verified by `T-TAP`, not assumed.
- **Em dashes in user-visible copy** — none. No copy string changes in D1.
- **Apostrophe literals** — no copy string changes in D1.
- **Canonical type tokens** — `text-sm` and `text-xs` are `@theme` tokens (`app/globals.css:168-171`). No arbitrary values, no `text-[14px]`.
- **New or repurposed colour token** — none. Contrast is untouched: `border-warning-text` on `bg-warning-bg` stays 8.79:1 light / 9.64:1 dark (`components/admin/showpage/PublishedReviewModal.tsx:1146-1148`).

---

## 3. Deliverable 2 — telling the operator the draft came back

### 3.1 The problem, precisely

The draft is restored on the **first frame**, by a lazy `useState` initializer: `const [draft, setDraft] = useState(() => readStoredDraft(draftStorageKey));` (`components/admin/wizard/step3ReviewSections.tsx:4683`, key built at `components/admin/wizard/step3ReviewSections.tsx:4679` from `reportDraftStorageKey`). So there is no restore *event* to hook — by the time anything renders, a restored draft and a typed draft are the same state.

Everything that currently says the draft survived is below the fold: the label swap at `components/admin/wizard/step3ReviewSections.tsx:4783` (`draft.trim() === "" ? "Write a report" : "Continue your report"`) and the guarantee copy "Kept on this device until you close the tab." at `components/admin/wizard/step3ReviewSections.tsx:4802-4805`. The report section is last, the modal opens at scroll 0 (fresh mount, `jump` null at `Step3ReviewModal.tsx:433`, hash sync off, since it derives from `layout === "page"` (`components/admin/review/ShowReviewSurface.tsx:262`) and this is the modal layout), and the file is 5164 lines of sections in between.

### 3.2 The design

**One note, at the top of the content pane, mount-scoped, self-dismissing.**

| Property | Decision |
|---|---|
| **Where** | First child of the modal's content-pane top slot — immediately before the conditional resolution `<section>` at `components/admin/wizard/Step3ReviewModal.tsx:954-1036`, which is what currently occupies `{children}` inside the scroller at `components/admin/review/ShowReviewSurface.tsx:1059`. That scroller (`components/admin/review/ShowReviewSurface.tsx:1051-1055`) is the element the modal opens scrolled to 0. No banner slot exists there today; this creates it. |
| **Why there and not in the report section** | R4 requires "visible without scrolling." The report section is the thing the operator cannot reach. Putting the note beside the draft would reproduce the defect. |
| **Cardinality: singular** | One modal instance hosts exactly one drive file. `components/admin/wizard/Step3SheetCard.tsx:630-631` mounts `<Step3ReviewModal>` behind a per-card `useState(false)` (`components/admin/wizard/Step3SheetCard.tsx:273`), passing `data={buildStagedSectionData({ pr, row, dfid, wizardSessionId })}` (`components/admin/wizard/Step3SheetCard.tsx:637-641`). One card → one `dfid` → one draft key → one possible note. No count, no list, no cap. |
| **How it knows** | The modal computes the key itself. `const { dfid, wizardSessionId } = data;` is already in scope at `components/admin/wizard/Step3ReviewModal.tsx:156` (the prop is `data: StagedSectionData`, `components/admin/wizard/Step3ReviewModal.tsx:144`; that type is declared at `components/admin/review/sectionData.ts:64` — the fields at `components/admin/review/sectionData.ts:120-121` are `buildStagedSectionData`'s INPUT type, not the prop's), and `reportDraftStorageKey` / `readStoredDraft` are exported from `lib/admin/reportDraftStore.ts:38` / `lib/admin/reportDraftStore.ts:61`. **No new props, no state lifted out of `step3ReviewSections.tsx`, no change to how the draft itself is restored.** |
| **When it appears** | Once, at modal mount, via a lazy initializer mirroring the one that restores the draft: true when `readStoredDraft(reportDraftStorageKey(wizardSessionId, dfid)).trim() !== ""`. |
| **Non-empty predicate** | `.trim() !== ""` — semantically identical to the label swap's `draft.trim() === ""` at `components/admin/wizard/step3ReviewSections.tsx:4783` and to the submit guard's `draft.trim().length === 0` at `components/admin/wizard/step3ReviewSections.tsx:4858`. Three spellings of one condition, not one spelling, which is exactly why AC-9 pins that they agree on every input instead of trusting that they look alike. A whitespace-only draft shows no note, exactly as it shows "Write a report". Two predicates that must agree are one defect waiting; §3.5 AC-9 pins that they do. |
| **When it goes** | A single `setTimeout` clears it after **5000ms**, matching the in-file transient precedent at `step3ReviewSections.tsx:1683-1687` (the CrewBreakdown outcome banner: 5s, success only, cleaned up on unmount). Not a new number. |
| **Reappearance** | Never within one modal session — the state is mount-scoped and only ever goes `true → false`. Reopening the modal is a fresh mount and evaluates again. |
| **Announcement** | Through the shell's existing announcer, not a new region. See §3.3. |

### 3.3 Accessibility: announce through the existing provider

The note announces through the shell's existing `AdminAnnounceProvider`, and the visible element is **`aria-hidden`**. `ReviewModalShell.tsx:647-655` already wraps the entire panel interior in that provider (`testId={`${testIdBase}-undo-status`}`, `label="Status updates in this dialog"`), consumed as `const { announce } = useContext(UndoAnnounceContext)` — existing precedents at `components/admin/RecentAutoAppliedStrip.tsx:353`, `components/admin/RecentAutoAppliedStrip.tsx:716`, and `components/admin/ReSyncButton.tsx:317`. This resembles the CrewBreakdown split — an `sr-only role="status"` announcer at `components/admin/wizard/step3ReviewSections.tsx:1706-1713` beside an `aria-hidden` visible banner at `components/admin/wizard/step3ReviewSections.tsx:1714-1725` — with one difference that matters in a section arguing about mount-gating: **that announcer is itself gated**, on `actions?.enabled && members.length > 0` (`components/admin/wizard/step3ReviewSections.tsx:1700`), so it persists across outcome changes rather than unconditionally. It is a precedent for the split, not for an ungated region. (The tail of that block at `components/admin/wizard/step3ReviewSections.tsx:1726-1733` is a `role="alert"` banner and is not `aria-hidden`.) This design adds no second region at all.

**This is a choice between two lawful designs, not the only legal shape.** An earlier draft of this spec claimed the meta-test permitted nothing else, and that was wrong on three counts, all corrected here from the test's own source:

- `tests/components/_metaLiveRegionMounting.test.ts:19-26` names **two** lawful shapes: mount the region unconditionally and toggle its text, or announce through `UndoAnnounceContext`. Either would be legal here.
- The registry number counts **non-exempt conditionally-mounted regions**, not total live regions. A region enters the scanner's hits only when `gated(el)` is true (`tests/components/_metaLiveRegionMounting.test.ts:462`), and `actual` is that filtered length (`tests/components/_metaLiveRegionMounting.test.ts:592-594`), asserted equal to the declared value (`tests/components/_metaLiveRegionMounting.test.ts:595-598`). So `Step3ReviewModal.tsx` holds **two** live regions against a registry value of **1**, and `step3ReviewSections.tsx` holds **four** against **0**.
- Consequently an unconditionally-mounted, text-toggling region added to `Step3ReviewModal.tsx` would produce **no hit and require no registry edit**, and a region placed beside the draft would **not** necessarily fail. Both of those claims were false.

What the test does forbid is the shape a naive implementation would reach for: a `role="status"` element whose **mount** is gated by a ternary arm, an `&&` right-hand side, an `if`, or a guard return (`tests/components/_metaLiveRegionMounting.test.ts:427-450`, `tests/components/_metaLiveRegionMounting.test.ts:461`) — "a live region inserted together with its text is never announced" (`tests/components/_metaLiveRegionMounting.test.ts:632-636`). A conditionally-rendered "Draft restored" live region is exactly that, and would fail (`tests/components/_metaLiveRegionMounting.test.ts:625-627`).

So the reason to use the provider is not legality. It is that the note is **conditionally mounted by design** (§3.2), which rules out the unconditional-region shape without adding an always-mounted empty element whose only job is to hold text 99% of the time. The registry staying at 1 is a consequence of the choice, not its justification — and AC-12 asserts it as a regression guard, not as proof the design was forced.

### 3.4 Copy

Rendered element, not a description. Exact default text:

> **Report draft restored, in Report an issue at the end of this list.**

Constraints the copy must hold, whatever the impeccable gate settles on:

- Names the destination. The whole defect is that the operator does not know where the draft is; a bare "Draft restored" repeats the label swap's failure at the top of the page instead of the bottom.
- **States a completed event, never a present-tense claim about the draft.** The operator can reach the report section inside the 5s window and clear or submit the draft, at which point a note reading "it is waiting" is describing something that is no longer true, on screen, with no mechanism to correct it. "Restored" is a fact about what happened at open and cannot be falsified by anything the operator does next; "at the end of this list" describes where the section is, which is equally stable. This is why the copy is fixed by tense rather than by wiring the note to the draft's live state, which would need the draft lifted out of `step3ReviewSections.tsx` for no other reason.
- "Report an issue" is quoted **exactly** as the section label renders it (`components/admin/wizard/step3ReviewSections.tsx:5154`).
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
| operator **clears the textarea** inside 5000ms | every keystroke calls `writeStoredDraft(draftStorageKey, e.target.value)` (`components/admin/wizard/step3ReviewSections.tsx:4839-4841`), and an empty value REMOVES the key rather than storing `""` (`lib/admin/reportDraftStore.ts:71-72`). The label reverts to "Write a report". The note **stays** until its timer expires, and stays TRUE, because its copy describes the restore that happened at open rather than the draft's current state (§3.4). **AC-18** |
| operator **submits successfully** inside 5000ms | `clearStoredDraftIfUnchanged` removes the key **only if the stored value still equals the submitted text** (`lib/admin/reportDraftStore.ts:107-115`), so an edit made while the send was in flight is deliberately preserved. Note behavior identical to the row above. **AC-18** |
| operator's **submit fails** inside 5000ms | storage is untouched — `clearStoredDraftIfUnchanged` is on the success path only (`components/admin/wizard/step3ReviewSections.tsx:4742-4747`). The draft is still there, the label still reads "Continue your report", and the note is still accurate. **AC-18** |

`dfid` and `wizardSessionId` are non-null on `StagedSectionData` (`components/admin/review/sectionData.ts:64`), so no null branch arises; the implementation still guards rather than asserting, and an absent value yields no note.

### 3.6 Transition inventory

The note has three states — **A** absent (no draft), **V** visible, **G** gone (timed out). All 3 pairs, plus compounds.

**The exit is instant. There is no fade and no collapse.** An earlier draft asked for one boolean that only moves `true -> false` and, two sections later, for "fade + collapse over `duration-fast`, then unmount" — which needs a distinguishable exit interval and therefore a fourth state. That contradiction is resolved in favour of instant removal, for reasons that are not merely convenience: there is no `AnimatePresence` or framer-motion anywhere in the modal, shell, or surface, so an exit interval would be new machinery; reduced-motion collapses `--duration-fast` to `0ms` (`app/globals.css:543-549`) so a fraction of users get an instant removal regardless and it must be correct anyway; and an animated exit **extends** the window during which content below the note is in motion, which is the one thing §3.7 is trying to keep short. AC-15 asserts no exit transition is declared, so "instant" is pinned rather than assumed.

| Pair | Treatment |
|---|---|
| A -> V | does not occur after mount. The note's state is decided in the mount initializer, so a modal that opens without a draft never shows it. **Unreachable by construction**, and AC-10 pins it |
| V -> G | **instant unmount** at 5000ms. No transition, no exit animation |
| A -> G | the same state as far as the DOM is concerned — nothing rendered. **Instant, no animation needed** |
| **compound: dismissal lands while the modal entrance animation is still running** | cannot collide. The entrance is CSS on the scrim and panel only (`app/globals.css:991-1010`); the pane body does not animate. And 5000ms is far past any entrance duration |
| **compound: dismissal lands while the operator has scrolled away** | the note is then off-screen above the viewport, and its removal is exactly the case browser **scroll anchoring** exists to absorb. The requirement is that what the operator is LOOKING AT does not move, which is a different assertion from AC-11's `scrollTop === 0` case. **AC-16** pins it: with the pane scrolled past the note, a reference element's viewport-relative `top` is unchanged across the dismissal. If anchoring does not hold, AC-16 fails and names it |
| **compound: dismissal lands while a section is expanding or collapsing** | they are **not** independent: both changes happen inside the same `flex-col gap-6 overflow-y-auto` scroller (`components/admin/review/ShowReviewSurface.tsx:1051`), so they share layout and scroll-anchoring state. An earlier draft claimed no layout dependency and that was wrong. **AC-17** exercises the compound: toggle a section while the note is live, then let the note dismiss, and assert the pane's scroll and the reference element behave as AC-11 and AC-16 require |
| **compound: draft is cleared or submitted while the note is visible** | the note is unaffected and remains accurate: its copy is about a completed restore, not about the draft's present state (§3.4). There is deliberately no note-to-draft coupling. **AC-18** |
| **compound: operator opens the report section inside the 5s window** | the note still dismisses on its own timer. It is not a pointer to current focus; it says the draft exists. No coupling, deliberately — coupling it to section state would need the section's expanded flag lifted to the modal for no gain |
| **compound: modal closes inside the 5s window** | the effect cleanup clears the timer; no state update after unmount |

### 3.7 Dimensional invariants (D2)

| # | Parent -> child | Guaranteed by |
|---|---|---|
| DI-8 | scroller -> note, full content width | The scroller is a flex container: `flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-tile-pad motion-safe:scroll-smooth` (`components/admin/review/ShowReviewSurface.tsx:1051-1055`), with no `items-*` override, so an auto-sized child **does** stretch across the cross axis under the flexbox default. The note nonetheless carries an explicit `w-full`, because this project's dimensional-invariant rule requires each relationship to name the class that guarantees it rather than resting on a default that a later `items-start` on the parent would silently remove. Two earlier drafts got this wrong in opposite directions: the first claimed there was no flex in the chain, the second claimed the default did not stretch |
| DI-9 | the note must never be a **zero-height in-flow child** | it renders with content and padding when present, and is **absent from the DOM** when not — never mounted-but-empty. **No existing spec can check this for us**: the phantom-gap scan at `tests/e2e/admin-layout-dimensions.spec.ts:599` runs against the `published-show-review` modal reached through `/admin?show=<slug>` (`tests/e2e/admin-layout-dimensions.spec.ts:513`), and this note exists only in `Step3ReviewModal`. The invariant is held by construction (unmount, never render empty) and observed only by the new ACs that mount the note deliberately |
| DI-10 | what the dismissal actually moves | The scroller has `gap-6` (24px). Removing the note therefore raises every following section by **the note's height plus 24px**, not by its height alone. At the moment of dismissal the operator is at `scrollTop: 0` in the default flow, since the note lives at the top and 5s have passed; the shift is a single upward reflow of content directly under it |
| DI-11 | removing the note must not disturb other specs' settled geometry | the note mounts only when `sessionStorage` holds a non-empty draft for this exact key, and every e2e context starts with empty `sessionStorage`. **The protection is that isolation, not a neighbouring assertion.** An earlier draft named `tests/e2e/admin-layout-dimensions.spec.ts:1209-1215` as the guard that would catch a disturbance; that spec drives the published-show modal (`tests/e2e/admin-layout-dimensions.spec.ts:513`) and cannot render this note at all, so it would have stayed green whatever the note did. AC-12 keeps the real protection honest by pinning that no fixture seeds the key |

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
- **L-3 — D1 leaves the pill's information density unchanged.** At 375px a two-segment pill measures 94.89px of wrapped text at the new size, and a three-segment one is taller by an amount AC-1 measures. It is legible, which is what R1 bought; it is not compact. The compaction options all reduce what Doug is told, and R2 closed that direction. *Re-file trigger:* a decision to revisit R2.
- **L-4 — the `DEFERRED.md` row points at lines 5211-5212 of `components/admin/wizard/step3ReviewSections.tsx` for the rail contract, and that file is 5164 lines long; the live anchor is `components/admin/wizard/step3ReviewSections.tsx:5157-5158`.** A drifted line anchor on a correct claim, not a defect. Both rows graduate to the archive with this PR, so the stale anchor leaves the open queue with them.

---

## 5. Acceptance criteria

Test shapes, not test code. Every AC names the failure it catches.

| AC | Assertion | Catches |
|---|---|---|
| AC-1 | Real-browser `getBoundingClientRect` at **375x812** — the layout spec's own sheet constant (`tests/e2e/published-review-modal.layout.spec.ts:100`), and §2.2 measures the geometry identical at 667 and 812 — on the pill at a **three-segment** load, via a new harness page (no committed real-browser fixture renders all three; the tallest existing browser render is two segments at 94.89px). The oracle is **differential plus non-clipping**, never a pixel literal: (a) `getComputedStyle(pill).fontSize` is `14px` at 375 and `12px` at 640, proving the responsive pair applied; (b) the same fixture is taller at 375 than at 640, by a delta the test measures; (c) width equals the measured cap, proving the wrap is cap-driven; (d) **nothing is clipped** — `scrollWidth <= clientWidth + 0.5` and `scrollHeight <= clientHeight + 0.5` on the pill, and every segment's own rect lies inside the pill's rect; (e) **the pill occupies more than one flex line**, established by comparing its content-box height against the single-line height of a one-segment variant of the same fixture measured in the same run, with the pill's padding and border subtracted from both | The one case §2.2 could not measure. Clauses (d) and (e) exist because (a)-(c) alone are satisfiable by a pill clamped to one line with its overflow hidden: that renders at 14px, is taller at 375 than at 640, sits at the cap, and would then also carry AC-4's equation through on the same broken fixture |
| AC-2 | `tests/e2e/attention-autoopen-suppress.spec.ts` green at a **three-segment** load, with two premises asserted before the occlusion check runs: the pill's text contains an issues count, a sheet-warnings count **and** a monitoring count; and the toggle-interception assertion is non-vacuous (it must still observe an interceptor when the menu IS open). **Reaching that load requires a task step, named here because the AC is otherwise unimplementable:** that spec drives the pill through `tests/e2e/_pillFocusLiveEntry.tsx`, whose `buildItems(a, n, s)` emits only attention items (`tests/e2e/_pillFocusLiveEntry.tsx:68-88`) and whose overrides set only `attentionItems`, `alertsDegraded` and optionally `setPublished` (`tests/e2e/_pillFocusLiveEntry.tsx:118-128`), so `k` — the sheet-warnings count — is **always 0** there and that segment can never render. The entry gains an **opt-in** crew-warnings setter following the `__setRefusal` precedent immediately beside it: passed only when set, so the default tree stays byte-identical for the other suites that share it. The census, taken from disk rather than from the entry's own comment: **two further real-browser suites bundle and drive it** — `tests/e2e/attention-pill-focus.spec.ts:58` and `tests/e2e/popover-clip-fit.spec.ts:49` — and separately `tests/components/admin/sheetIconLinkContainment.test.ts:1088` **scans its source text** and pins an expected count, so it is affected by edits to the file's contents rather than to the rendered tree. The entry's own fence comment (`tests/e2e/_pillFocusLiveEntry.tsx:121-127`) names `attention-pill-focus` and `sheetIconLinkContainment` and predates `popover-clip-fit`; the disk census is authoritative | RISK-1. The segment premise is the load-bearing half: without it a dropped segment shrinks the pill to one line and the occlusion assertion passes on a load that never exercised the risk. The entry limitation is spelled out because an earlier draft of this AC asserted a three-segment load against a harness that cannot produce one — the second guard-that-cannot-render in this arc, and the reason the whole AC block was swept against the live tree before dispatch |
| AC-2b | If extending that entry disturbs any of the three consumers above — the two driving suites or the source-scanning count — AC-2 falls back to the tallest load it can produce unaided — `__setItems(a, 3, 3, false)` giving `6 issues * 3 monitoring` (`tests/e2e/attention-autoopen-suppress.spec.ts:121`) — and the untested three-segment interceptor height is recorded as a documented limit with a re-file trigger of "the next arc touching the attention pill's hit band" | A pre-made fallback, so the decision is not taken under implementation pressure. Two segments still exercises RISK-1 at 94.89px; it just does not reach the worst case |
| AC-3 | At 375px, P2's "Alerts unavailable" **wraps and is fully visible**, proven geometrically rather than by name: `scrollWidth <= clientWidth + 0.5` and `scrollHeight <= clientHeight + 0.5` on the pill, and a `Range` over the label's text node has a bounding rect contained within the pill's padding box | The round-4 defect returning at the larger size. An accessible-name check cannot catch it: the spec's own cited history is that the DOM text stayed complete while CSS clipped it to "Alerts unavailab", so a broken `overflow-hidden whitespace-nowrap` would keep the full name and pass |
| AC-4 | `tests/e2e/published-review-modal.layout.spec.ts` green at both viewports, including `T-TAP`; **and `T-LAYOUT`'s equation — the existing one, grab-strip term included at 375 — additionally evaluated against AC-1's three-segment fixture**, not only the default page | RISK-2, which the earlier AC-4 did not actually reach: `T-LAYOUT` opens the default harness page, whose pill is the one-segment `2 issues` case at +3.50px. The risk is the +10.50px-and-taller case, so an implementation could pass AC-4 while failing exactly the thing AC-4 claimed to cover |
| AC-5 | `T-TAP`'s non-vacuity guard still holds: the visible pill is genuinely shorter than the band it claims to cover | A 30.30px pill passing the probe trivially instead of proving the band exists |
| AC-6 | A structural assertion, derived by scanning both component files rather than from a hand-listed set, that **exactly the four in-class sites** carry `text-sm sm:text-xs` and that `Step3ReviewModal.tsx:574` and `components/admin/wizard/Step3ReviewModal.tsx:676` still carry bare `text-xs`. The scan must fail if a fifth capped-and-wrapping pill appears untouched | Class-sweep regression in either direction: a new site left at 12px, or the two out-of-class chips silently swept later without the product decision §2.5 fences |
| AC-7 | The tap-band arithmetic comment at `components/admin/showpage/PublishedReviewModal.tsx:1099-1101` is updated to the `text-sm` numbers | A comment documenting the old size is worse than none — it is a false ground for the next reader |
| AC-8 | The note renders at the top of the content pane when `sessionStorage` holds a non-empty draft for the modal's key, and is reachable without scrolling at 375px: its rect sits inside the scroller's initial client rect | The whole point of R4 |
| AC-9 | The note's predicate and the label swap agree on every input: absent key, `""`, whitespace-only, one character, capped length | Two predicates drifting apart — a note that fires while the label still reads "Write a report" |
| AC-10 | The note never appears on a modal opened with no stored draft, **including after typing into the report field during that same session** | A note that fires on the operator's own typing (the A -> V transition §3.6 calls unreachable) |
| AC-11 | Across the dismissal, measured in the browser: the pane's `scrollTop` stays 0, AND the first section's `top` rises by **exactly the note's measured height plus the scroller's 24px `gap-6`**, derived from the measured rects rather than hardcoded | The real consequence. An earlier draft asserted only "`scrollTop` unchanged", which proves nothing: an in-flow node vanishing above the fold leaves `scrollTop` untouched **while** everything below moves, so that assertion passed in exactly the case it was meant to catch |
| AC-12 | `tests/components/_metaLiveRegionMounting.test.ts` green with its declared count for `Step3ReviewModal.tsx` unchanged at 1, and **no e2e fixture anywhere seeds a `fxav-report-draft-wizard-*` key** | A forbidden gated live region; and DI-11's isolation premise. The seeding half is the load-bearing one now that no neighbouring spec can observe the note: if a fixture ever seeds that key, the note starts mounting in runs whose geometry nobody re-baselined, and this is the only assertion that would say so |
| AC-13 | The announcement fires **exactly once per mount**, **only when the stored draft is non-empty**, and the announced string **equals the visible note's text** | An implementation that announces on every mount, or announces copy that differs from what is on screen. The earlier AC-13 constrained none of this, so a no-draft mount could announce arbitrary text and still pass while AC-8 and AC-10 (which inspect only the visible note) stayed green |
| AC-14 | `tests/e2e/step3-review-modal.layout.spec.ts` runs in **real CI**: added to both the `paths` watch list (`.github/workflows/step3-live-bundle.yml:21`) and the `playwright test` invocation (`.github/workflows/step3-live-bundle.yml:88`), in addition to the `desktop-chromium` project entry in `playwright.config.ts`. **Premise, verified rather than assumed:** that spec's harness sets `isDirtyRescan: false` (`tests/e2e/_step3ReviewModalHarness.tsx:292`) and `pillInteractive = !isDirtyRescan && n + m > 0` (`components/admin/wizard/Step3ReviewModal.tsx:347`) resolves true on its fixture, so the arm it renders is **W2**, the in-class interactive pill — confirmed by rendering the harness and reading the emitted markup. **Limit, stated rather than glossed:** that fixture populates one segment only, so this AC exercises W2's geometry at the new size but **not** W2 wrapping; W2's wrapping case rides on the same reasoning as P1's, which AC-1 measures directly | The project-regex wire alone gives **local discovery only**; without the workflow edit the spec still never runs in CI. And the premise clause exists because this arc already shipped one guard named as protection for something it could not render — a spec that renders "All clean" instead would have given W2 no coverage while the AC claimed it did |
| AC-16 | With the pane **scrolled past the note**, the note is asserted **present before and absent after** the dismissal, and a reference element's **viewport-relative** `top` is unchanged across it | The scrolled compound. The present/absent bracket is what makes it non-vacuous: without it, an implementation whose timer is cancelled by scrolling passes trivially, because a note that never leaves cannot move anything |
| AC-17 | Two cases, both starting from `scrollTop: 0` and both repeated from the AC-16 scrolled start: **expand** a collapsed section while the note is live, and **collapse** an expanded one. Each asserts the section's own expanded state actually changed, brackets the note present-before/absent-after, and then applies AC-11's shift equation (scroll-top start) or AC-16's fixed-reference rule (scrolled start) | The expand/collapse compound §3.6 enumerates. Naming both directions and both starting scroll states is the point: an earlier AC-17 said "as AC-11 and AC-16 require" without requiring both, so one favourable run satisfied the wording while the other enumerated inputs stayed untested |
| AC-18 | Clear the draft (and separately, submit it) while the note is visible: the note's text is unchanged and still accurate, and it dismisses on its own timer | §3.4's tense decision being undone by a later edit back to present-tense copy, which would put a false statement on screen for up to 5s with nothing to correct it |
| AC-15 | No exit transition or animation is declared on the note: its removal is a plain unmount | §3.6's instant-exit decision being quietly reintroduced as a fade, which would re-open the contradiction the earlier draft carried and lengthen the window DI-10 measures |

**Pre-made fallback for AC-14, so it is not decided under pressure.** Adding a 44-test spec that has never run in CI is exactly the local-passes-CI-fails class. If real CI reds or flakes on it, the workflow entry is reverted and the spec keeps only its `playwright.config.ts` project wire, with the CI gap recorded as a documented limit and a re-file trigger of "the next arc touching Step3ReviewModal layout". The project wire itself stays either way: it was probed green (50 passed with its sibling) and it makes the spec runnable by hand, which is strictly better than the nothing it had.

## 6. Out of scope

- Any change to `railCount` or `hideDot` for the report section (R3).
- Any change to the label swap or the guarantee copy (R5).
- Any change to `HEADER_ACTION_CAP`, the pill's padding, gap, colours, or the 99+ cap.
- Any type-size change to `components/admin/wizard/Step3ReviewModal.tsx:574` or `components/admin/wizard/Step3ReviewModal.tsx:676` (§2.5 — out of class, and a capped wizard cluster is a product decision Eric has not been asked).
- Any change to how the draft is stored or restored — `lib/admin/reportDraftStore.ts` is read-only to this arc.
- Any DB, RPC, migration, or schema work. This arc touches no DB layer, so the tier × domain and CHECK/enum matrices are **N/A — no DDL, no CHECK, no enum, no RPC**.
- No new boolean config field or toggle, so the flag-lifecycle table is **N/A**.
- No env-gated behavior, so the build-vs-runtime gate statement is **N/A**.
