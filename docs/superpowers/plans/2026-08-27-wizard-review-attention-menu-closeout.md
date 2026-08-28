# Closeout — Review-modal attention pills + warning index

Arc: `feat/wizard-review-attention-menu`.
Spec: `docs/superpowers/specs/2026-08-27-wizard-review-attention-menu-design.md`.
Plan: `docs/superpowers/plans/2026-08-27-wizard-review-attention-menu.md`.

## 1. What shipped

The reported defect, in the owner's words: two review-modal header pills counted
parse warnings in the wrong unit or not at all, and the wizard chip was inert.

- **Wizard (Step 3).** The header chip counted flagged SECTIONS, so two warnings
  in one section read "1 needs a look" while the list below it showed two. It now
  counts warn-severity WARNINGS, partitioned needs-look / judgment, and is a
  button that opens a warning index whose rows jump to the warning's own card.
- **Published.** `interactive` had no warnings term, so three active warn rows on
  the sheet still read "In sync". The pill now carries a `{k} sheet warnings`
  segment and the menu indexes those warnings with rows that jump to the card.
- **Shared.** One severity predicate (`isWarnSeverity`), one partition
  (`deriveWarningAttention`), one overlay implementation (`AttentionMenuFrame` +
  `AttentionMenuRow`) behind both menus.

## 2. Byte baselines, and what they are for

Four fixtures were captured from the PRE-change tree before any component edit
(Task 1) and are the arc's control: the Step 3 clean and dirty headers, the
published header cluster, and the open published menu. Every later task ran them.
They are why "the published menu is byte-identical without the new prop" is a
fact on disk rather than a claim in a commit message, and they are why the
`BL-ATTENTION-PANEL-LEFT-OVERFLOW-NARROW` repair was ruled out of this arc: fixing
published geometry here would have forced regenerating the control.

**Mutant evidence, application AND shape.** A red run proves a mutant was applied
and reached; it does not prove the failure is the defect class the guard claims.
Each of the four baseline mutants was therefore re-run capturing the failing
value, and each failing diff carries BOTH production's token and the mutated one,
with a 1-insertion/1-deletion diff so no reformat is doing the work:

| Mutant | Hash | Failing value carries |
|---|---|---|
| `Step3ReviewModal.tsx` "All clean" | 18745ccc → e83c3633 | `All clean` / `All cleaX` |
| `Step3ReviewModal.tsx` "Sheet changed" | 18745ccc → c354ad80 | `Sheet changed` / `Sheet changeX` |
| `PublishedReviewModal.tsx` issue noun | 385580f6 → 498b7ae9 | `issue` / `issuX` |
| `AttentionMenu.tsx` "Needs you" | 3d51f25f → abc2c5e8 | `Needs you` / `Needs yoX` |

## 3. Real-browser geometry

`tests/e2e/wizard-attention-menu.spec.ts`, 7 passing. Mutants (i) row floor,
(ii) pill hit band, (iv) wizard anchor and (v) the published crew anchor each red
ONLY their own case, so none of them passes by accident. The hit-band case
asserts the VISIBLE pill is under 44px before asserting the band is over it, so a
passing band can never be the box's own height.

**A real defect the new pin found**, ruled (B) by bl-orch: at 375x667 the panel
overflows its clipping ancestor on the LEFT, -18.85px on the wizard menu and
-36.00px on the PUBLISHED menu measured against unmodified code. Pre-existing and
worse on the shipped surface; nothing had looked before, because
`popover-clip-fit.spec.ts` asserts `menu.bottom` and never a horizontal edge.
Filed `BL-ATTENTION-PANEL-LEFT-OVERFLOW-NARROW`; the clip pin keeps 1280x800 and
the 375 case is a `test.fixme` naming the row.

## 4. Documented limits

- **375x667 clip fit** is not pinned, per the row above. Re-enable that
  `test.fixme` as the fix's own red.
- **`published-show-attention.spec.ts` resolve lifecycle** fails on unmodified
  code (`BL-PUBLISHED-ATTENTION-RESOLVE-LIFECYCLE-RED`), carried as `test.fixme`.
  The spec IS now wired into `published-modal-e2e.yml` so its other six cases
  gate; being unwired is how that case drifted red unnoticed.
- **`isDataQualityWarning` and `operatorActionableWarnings`** still test
  `severity === "warn"` and so still drop a severity-less row from two
  operator-visible lists (`BL-SEVERITYLESS-WARNING-DROPPED-IN-PARSER-FILTERS`).
  Outside spec §2.1's ratified sweep domain.
- **`pageTransitions` conditional counts** no longer cover a conditional that
  moved into a `heading={...}` prop; `findConditionalLines` matches JSX-child
  position only. Recorded in that row's comment, with the byte baseline and
  `attentionMenuFrame.test.tsx` naming where the site stays pinned.

## 5. Invariant-8 gate

Both halves of the invariant-8 dual gate ran on the diff
(`git diff origin/main -- components app`), with the canonical v3 setup:
`context.mjs` context load (PRODUCT.md + DESIGN.md), then the PRODUCT register
reference (this is admin tooling — design serves the task).

### 5.1 `/impeccable audit` — technical

Scored against the five dimensions, each with the evidence rather than an
impression.

| Dimension | Score | Evidence |
|---|---|---|
| Accessibility | 4/4 | Every new interactive element is a real `<button>`. The pill carries `aria-expanded` + `aria-controls` pointing at a live element, and the span states carry neither (asserted). The panel and its nested scroller are separately named `role="group"` regions and the scroller has `tabindex="0"` — load-bearing, because a monitoring-only list has zero focusable descendants and a bare div maps to `generic`, which is naming-prohibited. Tone is never the sole carrier: every row pairs its dot with `sr-only` text ("needs review: " / "judgment call: "), per PRODUCT.md's color-blind rule. Focus is rescued to the pill or the dialog root on any data-driven close. |
| Performance | 4/4 | One `useMemo` for the derivation, keyed on `data`. The auto-open frame is cancelled on cleanup (proved: a mutant counting scheduled vs cancelled frames shows every frame cancelled on unmount, with no `console.error`). The reconciliation is a render-phase narrowing, so no cascading effect render. No layout property is animated. |
| Theming | 4/4 | Zero raw hex, zero arbitrary color values, zero Tailwind palette colors in the diff. Every color is a DESIGN.md token: `status-review`, `text-faint`, `surface-sunken`, `warning-bg`, `warning-text`, `border`, `text-subtle`. No NEW token was introduced, so DESIGN.md needs no entry and no new contrast pin. Contrast comes from §1.2's existing measurements: `warning-text` on `warning-bg` is 9.5:1 light / 9.2:1 dark (AAA). The `/80` alpha on the judgment segment applies ONLY on the amber branch (~5.35:1, AA at text-xs); the judgment-only pill inherits `text-text` on `bg-surface-sunken` with no alpha. |
| Responsive | 4/4 | No fixed widths added. The pill's hit band is a real-browser assertion, not a class check: the VISIBLE pill measures under 44px and the resolved band measures over it, so a passing band cannot be the box's own height. Every menu row clears 44px at both 1280x800 and 375x667. The one responsive defect found is the 375 clip overflow, filed and pre-existing (§3). |
| Anti-patterns | 4/4 | Bundled detector: exit 0, zero findings across all eight changed component files. None of the absolute bans is present: no side-stripe accent, no gradient text, no decorative glassmorphism, no hero-metric block, no card grid, no per-section eyebrow, no numbered markers. |

**One considered deviation.** The two new `transition-colors duration-fast`
declarations carry no `motion-reduce:` variant, while the chevron's
`transition-transform` does. That is not an oversight: it is byte-for-byte the
published pill's existing pattern, which this pill was copied from deliberately
so the two surfaces share one component vocabulary. A color crossfade is not
vestibular motion, and diverging here would have made the wizard pill
inconsistent with the shipped one — which the product register names as a defect
in its own right ("if the save button looks different in two places, one is
wrong").

Repo-mechanical gates, all green: `_metaEmDashCopy` (18), `_metaTapTargetFloor`
and `_metaSubtleOnInteractive` (15), plus the full `tests/styles` suite. Every em
dash added by this diff is in a comment; none is in rendered copy.

### 5.2 `/impeccable critique` — design

⚠️ DEGRADED: single-context (sub-agent reports were not delivered)

Declared rather than hidden, because a silent degraded critique is a failed
critique. Assessment A and Assessment B were dispatched as two isolated
sub-agents as the command requires; both ran to completion and went idle, and
neither one's report ever reached this session — two explicit re-requests
included. Rather than block the pipeline on a delivery fault or, worse, report a
clean two-agent run that did not happen, both assessments were then completed
single-context. Assessment B's work is fully reproducible from the evidence in
§5.1 (deterministic detector plus the repo's own mechanical gates); Assessment A
is the design judgment below.

**AI slop verdict: not slop.** None of the absolute bans appears. The pill is not
a hero-metric block, the menu is not a card grid, there is no eyebrow scaffolding
and no gradient text. The surface reuses the published modal's vocabulary
deliberately, which is the product register's own bar: earned familiarity, the
tool disappearing into the task.

**Heuristics.** Eight of ten score 4/4. The two below 4:

- **Match between system and the real world — 3/4.** "Judgment calls" is
  project-ratified vocabulary (`2026-07-07-ambiguity-warnings-v1-design` §7.3a,
  `Step3SheetCard.tsx` `judgmentChip`) and is not relitigable here, but it is the
  one string on this surface a new operator would have to learn rather than
  read. It earns its place because the alternative — folding ambiguity warnings
  into "need a look" — is exactly the false-urgency the quiet tone exists to
  avoid.
- **Aesthetic and minimalist design — 3/4.** The composite state shows two counts
  and a separator in a pill that also carries a dot and a chevron. That is four
  visual elements for a control whose job is "how much is wrong". It stays at 3
  rather than lower because each element is doing work: the dot is the
  color-blind second channel, the chevron is the only affordance saying the pill
  opens.

**The one P1, found and FIXED in this branch.** The composite pill carried
`whitespace-nowrap` with neither a wrap rule nor a width cap, while the published
pill it was copied from carries `max-sm:flex-wrap max-sm:justify-end` inside a
`max-sm:max-w-40` cluster. Measured in real Chromium at 375x667, before the fix:

```
pill "2 need a look · 1 judgment call"   236.03px of a 375px viewport
show title "Asset Mgmt Summit"             6.97px
document scrollWidth == clientWidth       (no overflow, no scrollbar)
```

The title is `min-w-0 flex-1`, so it absorbs the entire loss silently: nothing
overflows, nothing scrolls, and the one thing PRODUCT.md says Doug needs on a
venue floor — which show he is looking at — is seven pixels wide. This is both
the shared ban ("text that overflows its container … the viewport is part of the
design", here in its quieter form) and the product-register ban on the same
control looking different in two places.

Fixed by completing the port of the published pattern: `max-sm:max-w-40
max-sm:flex-wrap max-sm:justify-end` on the button, in place of
`whitespace-nowrap`. After: pill 160px, title 83px. The wrap-unit spans the
implementation already had now have something to do; previously they could not
fire, because nothing constrained the pill's width.

Pinned so it cannot regress, by a case that fails on the old geometry and passes
on the new: the pill may not exceed half the header, the title must keep at least
15% of it, and neither may be bought with a horizontal scrollbar. Proved by
reverting the classes: `Expected: <= 187.5 / Received: 236.03125`. The case also
asserts the fixture is in the COMPOSITE state first, since a single-segment pill
would satisfy the bounds without exercising them.

Only the button className changed, so both byte baselines and every registry pin
are unmoved (91 files, 2198 tests green after).

**Strengths.** The severity predicate and the partition are shared rather than
duplicated, so the pill cannot disagree with the rail or the badge by
construction. The menu is one overlay implementation behind two surfaces, so the
wizard index inherits the published dismissal contract, clip fit and row shape
instead of re-implementing them. And the quiet judgment tone is a real product
judgment: a sheet that parsed with ambiguity is not a sheet with problems, and
the design says so without a second color.

**Persona check.** Doug, one-handed, on a venue floor. Every row and the pill
clear the 44px floor in a real browser. Nothing is hover-only. The jump opens a
collapsed disclosure before scrolling, so a row can never point at something he
cannot see. The P1 above was the one place this failed, and it is fixed.

**Disposition:** P0 = 0. P1 = 1, FIXED in this branch, not deferred. No
`DEFERRED.md` entry is required. The two 3/4 heuristics are ratified-scope
decisions, recorded here rather than raised as findings.

impeccable-gate: critique=RAN-DEGRADED audit=RAN p0=0 p1=1 dispositions=recorded
