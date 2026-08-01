# Focus-ring a11y mechanical pass — design

**Date:** 2026-08-01 · **Branch:** `fix/focus-ring-a11y-pass` · **Mode:** autonomous ship (owner-ratified 2026-08-01)

Backlog rows this spec closes (graduate to `BACKLOG-archive.md` in the shipping PR):

- `BL-FOCUS-RING-CONTRAST` — light-mode focus ring under the WCAG 2.2 SC 2.4.13 3:1 floor
- `BL-PICKER-ROW-RING-OFFSET-BACKDROP` — subsumed into the bare-offset sweep (§4)
- `BL-IGNORED-SUMMARY-TAP-TARGET` — `Ignored (N)` summary under the 44px floor (§6)
- `BL-DEV-SWITCHER-BAR-MOBILE-WIDTH` — switcher counter/description collapse at 390px (§7)
- `BL-BARE-TRANSITION-NO-DURATION-CLASS` — bare `transition-*` outside the duration-token system (§5)

Rows deliberately NOT touched: `BL-DESTRUCT-ARM-STATE-ANNOUNCEMENTS`, `BL-SHAREHUB-REMOTE-ROTATE-ANNOUNCE` — the screen-reader announcement pass is a separate spec (owner scope decision, 2026-08-01: "Two specs, sequential").

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Light `--color-focus-ring` becomes **opaque `#E06000`** (Option B). Owner picked it 2026-08-01 from a three-option rendered mockup (A keep-translucent / B `#E06000` / C reuse `#A65000`). Do not re-open A or C. | This spec; AskUserQuestion record 2026-08-01 |
| Dark `--color-focus-ring` is **unchanged** (`rgba(255,160,71,0.65)`, measured 4.40:1 on `bg-surface`, full matrix §3). | `BACKLOG.md` `BL-FOCUS-RING-CONTRAST` measured row |
| The two-tier recipe (offset only on armed destructive confirm-go) stays **popover-scoped**. This pass does NOT add or remove any `ring-offset-2`; it only gives existing offsets a container-matched color. Which sites deserve offsets is a separate design decision, explicitly out of scope of the sharehub pass and of this one. | `docs/superpowers/specs/2026-07-23-sharehub-focus-pass.md` §1 ("Codebase-wide focus sweep is OUT of scope" — this pass is that sanctioned future decision, narrowed to color-matching only) |
| Bare `transition-*` sites are fixed at the token layer via `--default-transition-duration` (§5), not per-site class additions. The 150ms→120ms delta is accepted. | Impeccable critique 2026-07-27 P3 suggestion recorded in `BL-BARE-TRANSITION-NO-DURATION-CLASS`; side-effect evaluation §5 |
| Site counts in this spec are **mechanism claims, not numeric contracts**. Counts of class-shaped populations are grep-flavour dependent; the enforcement is the structural guard (§4.3), not a number. | `docs/superpowers/specs/2026-07-26-agenda-perday-viewer-fold.md` §5.2 precedent |
| `ResetPickerEpochButton` and every other site whose tests assert `ring-offset-2` literals: the sweep updates those class literals and their test assertions together; this is mechanical propagation, not a treatment change. | Sharehub pass §1 scoped it out of THAT diff only |

## 2. Token change

`app/globals.css` defines the ring through the runtime-var pattern: `--color-focus-ring: var(--color-focus-ring-runtime)` (`@theme` block), with the light value `rgba(255, 140, 26, 0.55)` set in the root runtime block and the dark value `rgba(255, 160, 71, 0.65)` set twice (the media-query block and the data-theme-guarded root block).

There are **three** `--color-focus-ring-runtime` declarations in `app/globals.css`: the light root value, the media-query dark value, and the explicit data-theme dark value (the standard runtime-var triple). Change exactly one: the **light** declaration becomes `#E06000` (opaque). Both dark declarations stay `rgba(255, 160, 71, 0.65)` and must stay identical to each other. The global `outline: 3px solid var(--color-focus-ring)` consumer inherits the fix.

### 2.1 Off-token focus outlines on the switcher surface

`components/admin/dev/SwitcherControls.tsx` carries the only `focus-visible:outline-accent` sites in the tree (three: the STEP_BTN literal, the jump select, the excluded toggle — repo-wide grep 2026-08-01 confirms no other file uses a focus-colored outline utility). Raw accent `#FF8C1A` measures 2.33:1 on light surface — the same defect class as the ring token. All three migrate to `focus-visible:outline-focus-ring`, which resolves the token this spec fixes (≥3.07:1 light, ≥3.69:1 dark on every §3 family). The §4.3 guard file gains a second tripwire: no `focus-visible:outline-accent` (or any `outline-accent` variant-prefixed focus spelling) anywhere under `app/`/`components/`.

`DESIGN.md` §1.1 token-table row for `--color-focus-ring` updates in the same commit: new light value, contrast figures from §3, and a pointer to the meta-test. §1.2 contrast-summary table gains a focus-ring row.

Why opaque: the old 0.55-alpha value composites to ≈`#FFC075` on white — 1.60:1, measured in a real browser 2026-07-25 (`BL-FOCUS-RING-CONTRAST`). No translucent orange at brand hue reaches 3:1 on white; opacity is the defect.

## 3. Contrast matrix + meta-test

Computed (WCAG relative luminance; dark rows alpha-composite `rgba(255,160,71,0.65)` over the backdrop):

| Backdrop family | Light hex | `#E06000` vs light | Dark hex | composited ring vs dark |
| --- | --- | --- | --- | --- |
| `--color-surface` | `#FFFFFF` | 3.59:1 | `#16171C` | 4.39:1 |
| `--color-bg` | `#FAFAF9` | 3.44:1 | `#0F1014` | 4.54:1 |
| `--color-surface-sunken` | `#F4F3F1` | 3.24:1 | `#0B0C10` | 4.56:1 |
| `--color-surface-raised` | `#FFFFFF` | 3.59:1 | `#1C1D23` | 4.25:1 |
| `--color-warning-bg` | `#FFF3D6` | 3.26:1 | `#3A2E14` | 3.69:1 |
| `--color-stale-tint` | `#F4ECE0` | 3.07:1 | `#26221B` | 4.12:1 |
| `--color-accent-tint` | `#FEEEDE` | 3.17:1 | `#2A1E10` | 4.21:1 |
| `--color-danger-bg` | `#FBEAE8` | 3.09:1 | `#3A1E1C` | 4.05:1 |

**`--color-info-bg` is deliberately EXCLUDED:** light `#EEEAE3` measures 2.9976:1 against `#E06000` — under the unrounded floor (round-3 review probe). No control in the tree takes a focus offset on an info-bg backdrop today (the sweep task asserts this stays true); if one ever needs to, either the info-bg token or the ring token gets revisited first. The §4.3 allowlist and this matrix are THE SAME set by construction: the meta-test derives its backdrop families by importing the guard's exported allowlist constant, so the two cannot diverge.

Every cell ≥3:1 (SC 2.4.13 indicator floor). The dark surface cell computes 4.39:1; the 4.40:1 figure elsewhere in this spec is the 2026-07-25 browser measurement of the same pair — rounding difference expected, the meta-test asserts the computed value. Light `surface-raised` shares the surface hex today; the meta-test reads the live values so a future divergence re-computes, not silently passes.

**Meta-test** (planned new file tests/styles/focusRingContrast.test.ts, same construction as `tests/styles/status-token-contrast.test.ts`): parse all **three** `--color-focus-ring-runtime` declarations and the backdrop-family pairs (the §4.3 allowlist, imported) out of `app/globals.css`, then assert three oracles:

1. **Ratification pin:** the light declaration is exactly `#E06000` (opaque). This pins the owner-selected value — a different-but-accessible or translucent replacement fails until the spec record changes.
2. **Dark-pair identity:** the media-query dark value and the data-theme dark value are byte-identical, so neither activation path drifts alone.
3. **Matrix floor:** every ring × backdrop pair (alpha-composited where the ring carries alpha) ≥3.0.

The ratios themselves are computed from the live file, never hardcoded (anti-tautology); the floor and the pin are the expected side. A backdrop hex drift that drops any pair below 3.0 fails oracle 3; a ring drift fails oracle 1 or 2 regardless of ratio.

## 4. Bare ring-offset sweep

### 4.1 The defect

`focus-visible:ring-offset-2` with no `ring-offset-<color>` companion resolves Tailwind's `--tw-ring-offset-color` default `#fff` — a white halo between control and ring, measured 17.90:1 against dark `bg-surface` (destruct-thumb-order audit 2026-07-25). DESIGN.md's token-table rule already bans it ("never bare `ring-offset-2`"); ~84 line-sites across `app/` + `components/` predate the rule (grep 2026-08-01: 84 of 152 `ring-offset-2` lines lack a color companion; mechanism claim per §1.1). Exemplar: `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx` claimed-row control (`focus-visible:ring-offset-2` with no color, the `BL-PICKER-ROW-RING-OFFSET-BACKDROP` row).

### 4.2 The fix rule

For every bare site: add the `ring-offset-<backdrop>` matching the element's rendered backdrop (the surface its offset gap visually cuts into), chosen per-site during implementation:

- Control sits on a `bg-surface` card/panel → `focus-visible:ring-offset-surface`
- Directly on the page ground → `focus-visible:ring-offset-bg`
- On sunken/raised/warning fills → the matching token utility

No site loses or gains an offset (§1.1). Sites already carrying a color companion are untouched — including the six components that assemble the companion away from the offset line (verified 2026-08-01): `components/shared/ReportButton.tsx` and `components/shared/AccentButton.tsx` (RING_OFFSET_CLASS maps), `components/crew/CrewSubNav.tsx` (split adjacent literals), `components/admin/PerShowActionableWarnings.tsx` (linkOffsetClass), `components/admin/SheetIconLink.tsx` (BACKDROP_SKIN map), `components/admin/DataQualityWarningControls.tsx` (RING_OFFSET map). These are correct today and are the seed of the §4.3 indirection registry.

**The companion must carry the same variant chain as its offset.** `focus-visible:ring-offset-2` pairs with `focus-visible:ring-offset-<token>`; the tree's one `peer-focus-visible:ring-offset-2` site (`components/admin/wizard/Step3SheetCard.tsx` checkbox proxy) pairs with `peer-focus-visible:ring-offset-<token>` — a bare-prefix companion never activates there.

Where a component renders on more than one backdrop (shared primitives with an `overlay`-style prop), the offset color follows the same prop the background already follows; if the background is caller-supplied and unknowable, the component takes `ring-offset-surface` and the limitation is listed in §10.

### 4.3 Structural guard (fails-by-default on new sites)

Planned new test tests/styles/noBareRingOffset.test.ts: filesystem-walk every `.tsx`/`.ts` file under `app/` and `components/` (walked, not a named file list — class-sweep discipline). For each line matching `ring-offset-2` (comment lines excluded — trimmed lines starting `//`, `*`, or `{/*` are skipped), the line must satisfy ONE of:

1. **Valid literal companion, same variant chain:** a `ring-offset-<token>` on the same line whose variant prefix matches the offset's and whose `<token>` is a member of the guard's **backdrop allowlist** — an EXPORTED named constant in the test file enumerating exactly the §3 matrix families (`surface`, `surface-raised`, `surface-sunken`, `bg`, `warning-bg`, `stale-tint`, `accent-tint`, `danger-bg`; extending it means adding a §3 matrix row, which the contrast meta-test enforces by importing this constant). NOT the whole `@theme` `--color-*` namespace (`ring-offset-text` compiles but is not a backdrop — round-2 probe), and NOT `info-bg` (fails the light floor — round-3 probe, §3). **Arbitrary values `ring-offset-[…]` are rejected outright:** the tree has zero today (grep 2026-08-01), a color-shape predicate re-admits the banned tokens through the back door (`ring-offset-[var(--color-text)]`) and accepts invalid CSS (`ring-offset-[rgb(garbage)]`) — both round-3 escaping mutants. A future genuine need extends the allowlist or registers the file, with the §3 row to match.
2. **Registered indirection file:** the file is a member of the guard's indirection registry (seeded with the six §4.2 components), in which case every `ring-offset-2` line in that file is trusted — no same-line predicate applies. Four of the six seeds pair the companion on a different line or through a map lookup with no `${` on the offset line, so any same-line requirement for registered files false-rejects the seed corpus itself (round-2 finding). A NEW file assembling companions away from the offset line fails by default until registered with a one-line reason.

Second tripwire in the same file (§2.1): zero matches for focus-prefixed `outline-accent` under the same walk.

Known blind spot, documented not solved: a registered-file line could interpolate something that is not a companion; registry membership is trust-scoped per file, not proof. Line-scope + registry is the same honesty posture as `tests/cross-cutting/no-absolute-self-redirect-audit.ts` ("green = no known spelling present").

## 5. Bare `transition-*` default duration

`fix/duration-tokens-emit-no-css` (spec `2026-07-27-duration-tokens-emit-no-css.md`) made every *named* `duration-<name>` utility real and reduced-motion-safe, and filed the residual: elements with a bare `transition-*` utility and no named duration class keep Tailwind's 150ms `--default-transition-duration` and sit outside the `prefers-reduced-motion` collapse (which zeroes only the `--duration-*` chain). Exemplars verified 2026-08-01: `app/me/page.tsx` caret (`transition-transform`), `components/shared/CardReportTrigger.tsx` and `components/crew/primitives/SourceLink.tsx` (`transition-colors`).

**Fix (token-layer, one declaration):** add to the `@theme` block, beside the existing `--transition-duration-*` aliases:

```css
--default-transition-duration: var(--duration-fast);
```

Every bare `transition-*` site then inherits 120ms normally and 0ms under reduced motion, with zero per-site edits, and every future bare site is covered by construction.

Side-effect evaluation (why this is safe):

- Delta is 150ms→120ms on bare sites only — beneath perception threshold for color/transform hovers; named-duration sites are unaffected (their utility wins specificity).
- Sites that WANT a different duration already say so with a `duration-<name>` class; none relied on "exactly 150ms" (nothing in the tree names 150ms).
- Reduced-motion behavior changes from "animates anyway" to "instant" — that is the a11y fix, not a regression.

Handwritten CSS transitions, `@keyframes`, and JS-driven animations use explicit durations or the `var(--duration-*)` chain directly — unaffected by the alias, confirmed by review-round-1 probe.

**Meta-test (compiler-output proof, not source-structural):** following the mechanism the existing duration-token test already uses, compile Tailwind (the repo's own version) against a fixture carrying a bare `transition-colors` and assert the emitted CSS's `transition-duration` resolves through `--default-transition-duration` to the `--duration-fast` chain. A source-only "the alias line exists in @theme" assertion is insufficient — it stays green if a future Tailwind stops consuming that namespace; the compile proves consumption.

## 6. `Ignored (N)` tap target

`components/admin/showpage/sectionWarningExtras.tsx` — the `Ignored (N)` `<summary>` (`cursor-pointer list-none text-xs font-semibold …`) has no `min-h-tap-min` and sits under the 44px floor. Fix: add `min-h-tap-min` plus `inline-flex items-center` (the recipe the wizard's equivalent summaries already carry, e.g. `components/admin/wizard/step3ReviewSections.tsx` `min-h-tap-min` link rows). Test: a **mandatory real-browser measurement** — `getBoundingClientRect().height >= 44` on the rendered summary (Playwright, in whichever admin e2e or component-browser harness the plan places it) — because a class-string assertion stays green if the spacing token drifts or a competing rule wins. The class assertion may exist as a fast unit companion but is not the acceptance.

## 7. Dev switcher bar mobile width

`components/admin/dev/SwitcherControls.tsx` — at 390px the counter and scenario-description block (the `aria-live` `min-w-0 flex-1` group and its `truncate` label) measure clientWidth 0; flex siblings squeeze them out (`BL-DEV-SWITCHER-BAR-MOBILE-WIDTH`, surfaced 2026-07-22; filed against `AttentionModalSwitcher.tsx`, whose bar markup now lives in `SwitcherControls.tsx` — same surface).

Fix: mechanism is implementer-chosen — a min-width floor on the counter/label group, allowing the bar to wrap to a second row, or both. The prior draft's "single line with flex-nowrap" and "or wrap" were contradictory; the single-line requirement is DROPPED. The bar has **six** control clusters when exclusions exist (Prev, Next, the live counter/label group, the jump select, the tier control, the excluded toggle); the acceptance is the §7.1 assertions, not the mechanism or row count.

### 7.1 Dimensional Invariants

The switcher bar is the only surface in this pass with a parent→child dimension contract:

| Parent | Child | Invariant | Guaranteeing class/style |
| --- | --- | --- | --- |
| Switcher bar (`components/admin/dev/SwitcherControls.tsx`) | Every one of the six control clusters | fully inside the 390px viewport: `rect.left >= 0`, `rect.right <= 390`, `rect.width > 0`; no horizontal overflow on the bar (`scrollWidth <= clientWidth`) | the min-width floor / wrap chosen at plan time — exact class recorded in the plan task |
| Switcher bar | Counter element ("52 / 116") | not truncated: `scrollWidth <= clientWidth` and `rect.width > 0` | same |
| Switcher bar | Scenario-description label | `rect.width >= 48` (readable floor, not merely nonzero) | same |
| Switcher bar | Every control | `rect.height >= 44` at 390px | existing `min-h-tap-min` on each control (already present, §7 fix must not remove it) |

**Assertion:** gallery e2e gains a 390×844 viewport check asserting the full table above, with exclusions present so all six clusters render. Real browser (Playwright), not jsdom. A width merely `>0` is NOT the acceptance — the containment, no-overflow, and readability rows are what rule out a one-pixel label or clusters pushed off-viewport.

### 7.2 Transition Inventory

No component in this pass gains or loses a visual state; no new animations are introduced.

| State pair | Treatment |
| --- | --- |
| (none — token value change, class-color additions, min-width/min-height additions only) | instant — no animation needed |

The §5 alias changes only the default duration of transitions that already exist (150ms→120ms) and their reduced-motion collapse (→0ms); it adds no state pair.

## 8. Test strategy

| Surface | Test | Failure it catches |
| --- | --- | --- |
| Ring token | planned tests/styles/focusRingContrast.test.ts (§3): #E06000 pin + dark-pair identity + computed matrix floor | Light value re-tuned, made translucent, or swapped even to an accessible alternative; either dark declaration drifting alone; any backdrop hex dropping a pair below 3:1 |
| Off-token outlines | §4.3 guard second tripwire | Any focus-prefixed `outline-accent` reappearing under `app/`/`components/` |
| Offset sweep | planned tests/styles/noBareRingOffset.test.ts (§4.3): backdrop-allowlist companion + variant-chain match + arbitrary values rejected + file-scoped indirection registry, filesystem-walked | New bare `ring-offset-2`; non-backdrop token (`ring-offset-text`) or non-emitting spelling (`ring-offset-garbage`); ANY arbitrary value (`ring-offset-[garbage]`, `ring-offset-[var(--color-text)]`); companion under the wrong variant prefix; new unregistered indirection file |
| Sweep correctness (sample) | Real-browser probe: `getComputedStyle` ring-offset-color on the picker claimed row + one confirm-go button, in dark mode, **equals the sampled site's documented backdrop color** (exact rgb match pinned per site in the plan) | The sweep "landed" as classes but a literal never compiled, or the WRONG non-white token was applied (≠-white would pass it; equality does not) |
| Transition alias | Compiler-output proof (§5): compiled fixture's `transition-duration` resolves the alias chain | Alias dropped; a Tailwind upgrade silently stops consuming `--default-transition-duration` |
| Tap target | Mandatory browser measurement `height >= 44` (§6); class assertion as unit companion only | Summary under the 44px floor even via token drift or a winning competing rule |
| Switcher bar | 390×844 Playwright assertions per the §7.1 table (containment, no-overflow, counter untruncated, label ≥48px, controls ≥44px) | Clusters squeezed to zero/one-pixel width, pushed off-viewport, or overflowing horizontally |

TDD per task (invariant 1). No DB, no RPC, no advisory-lock surfaces, no §12.4 codes, no new flags (lifecycle table: N/A — no boolean toggle is introduced). Impeccable dual-gate (invariant 8) runs on the affected diff before close-out. No new mutation surfaces (invariant 10: N/A).

## 9. Out of scope

- Screen-reader announcement items (`BL-DESTRUCT-ARM-STATE-ANNOUNCEMENTS`, `BL-SHAREHUB-REMOTE-ROTATE-ANNOUNCE`) — next spec.
- Extending or removing any offset (two-tier stays popover-scoped, §1.1).
- Re-tuning dark-mode ring (passes today, §3).
- Any copy, DB, or parser surface.

## 10. Documented limits

- **Ring vs accent-fill adjacency:** on `bg-accent` (`#FF8C1A`) controls, the ring's inner edge measures 1.54:1 (light) against the fill. The indicator's contrast is carried by its outer boundary against the backdrop (≥3.07:1 everywhere, §3), which is the adjacency SC 2.4.13's minimum-area reading requires; the inner edge is not made compliant by any single-color ring at brand hue. Accepted; revisit only with a two-color ring design.
- **Guard scope:** §4.3's tripwire is line-scoped with a per-file indirection registry; a registered file's interpolation is trusted, not proven (posture per the self-redirect guard precedent).
- **Caller-unknown backdrops:** shared primitives whose backdrop is caller-supplied and not threaded through a prop take `ring-offset-surface` as the default (§4.2); on a non-surface caller backdrop the offset gap is slightly mismatched — visible-but-conservative, far from the 17.90:1 white-halo defect. Sites taking this default are enumerated in the plan's sweep task.
- **Grep-flavour counts:** 84/152 are 2026-08-01 line-greps, recorded for orientation, not contract.

## 11. Ledger graduation (same PR)

The five backlog rows in §0 graduate to `BACKLOG-archive.md` per the graduation meta-test (`tests/docs/_metaDeferralLedgerGraduation.test.ts`). The two announcement rows stay OPEN.
