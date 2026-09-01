# DESIGN.md — FXAV Crew Pages visual tokens

This file is the visual-design source of truth for the FXAV crew-pages project. It pairs with `PRODUCT.md` (strategic context) and is consumed by every UI task in M3/M4. Subsequent tile work cites token names from this file rather than inlining hex values or magic spacing numbers.

The runtime token surface lives in `app/globals.css` under `@theme`. Tailwind v4 reads `@theme` and exposes utilities for every named token (e.g., `--color-accent` → `bg-accent`, `text-accent`, `border-accent`). This file documents intent, contrast, and rationale; `globals.css` is the executable copy.

---

## 1. Color strategy — Restrained

One signature accent, neutral-led surfaces. FXAV orange occupies ≤10% of any rendered viewport — it appears on the active/live indicator on the Right Now card, the "today" pin on the schedule tile, primary CTAs, and the brand mark. Nowhere else. Selected-filter segments are NOT an accent surface — the selected-state recipe is inverted neutral (`bg-text text-bg`); accent stays reserved for live/matters-now signals and CTAs. No competing accent hue (no blue, no purple, no teal). Neutrals are tinted toward warm — chroma `0.005`–`0.012` in OKLCH — never pure `#000` or `#fff`.

Light and dark are both first-class. Dark is not a 90% inverse of light; each palette is designed against its own physical scene (sunlit loading dock vs. dim backstage). Both meet WCAG AA as a floor; body text hits AAA in light mode (the harder target — direct-sunlight readability is a hard requirement per `PRODUCT.md`).

Color-blind floor: red and green are NEVER used as primary semantic carriers. Stale sync, COI status, parse warnings — every state signal pairs color with text or icon.

### 1.1 Color tokens

| Token                               | Light mode (hex)                   | Dark mode (hex)                 | Role                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | ---------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--color-bg`                        | `#FAFAF9` (warm near-white)        | `#0F1014` (warm deep neutral)   | Page background. Never `#FFF` / `#000`. Light is paper-like; dark is mid-warm-charcoal — black with FXAV orange clashes.                                                                                                                                                                                                            |
| `--color-surface`                   | `#FFFFFF`                          | `#16171C`                       | Tile, card, Right Now card surface. One step lighter than `--color-bg` in dark; one step whiter in light.                                                                                                                                                                                                                           |
| `--color-surface-raised`            | `#FFFFFF` + `0 1px 2px rgba(...)`  | `#1C1D23`                       | Used sparingly — modal, dropdown, footer pinned-to-bottom variant.                                                                                                                                                                                                                                                                  |
| `--color-surface-sunken`            | `#F4F3F1`                          | `#0B0C10`                       | Empty-state plate, "Doug hasn't filled this in yet" backdrop. One step deeper than `--color-bg`.                                                                                                                                                                                                                                    |
| `--color-text`                      | `#1A1B1F` (warm near-black)        | `#E8E6E0` (warm off-white)      | Body text, all primary copy. Contrast on `--color-bg`: light 16.5:1 (AAA), dark 14.8:1 (AAA).                                                                                                                                                                                                                                       |
| `--color-text-strong`               | `#0E0F12`                          | `#F5F3EE`                       | Headlines, large numbers (call times, dates). Maximum contrast.                                                                                                                                                                                                                                                                     |
| `--color-text-subtle`               | `#5A5B62` (warm slate)             | `#9C9A93` (warm dusk)           | Labels, captions, "as of …" timestamps. Light 6.5:1, dark 6.8:1 on `--color-bg` (both AA body ≥4.5:1; see §1.2). Never the resting color of an action target, **except the three carve-out families in §1.1a**.                                                                                                                                                                                               |
| `--color-text-faint`                | `#8B8C92`                          | `#74736D`                       | Decorative text, divider labels. Min AA-large only (3:1) — never used for crew-actionable copy.                                                                                                                                                                                                                                     |
| `--color-border`                    | `#E5E4E0`                          | `#2A2B30`                       | Tile borders, hairline dividers. Visible but quiet.                                                                                                                                                                                                                                                                                 |
| `--color-border-strong`             | `#CFCDC7`                          | `#3A3B40`                       | Focus outlines (paired with `--color-accent` ring), tab-active underline. Also the status-emphasis outline on non-interactive chrome: the flagged "Needs a look" pill and the section-header judgment chip (2026-08-01, judgment-chip spec §2.2) — always beside a text cue, never the sole carrier of state.                                                                                                                                                                                                                                                           |
| `--color-accent`                    | `#FF8C1A` (FXAV orange)            | `#FF8C1A`                       | The single brand accent. Same hex in both modes — the orange is the constant. Coverage cap ≤10% of any viewport. Raw `--color-accent` on light bg is decorative-only (2.23:1); it must be redundant with an adjacent text label or shape cue, and any load-bearing orange-as-text/glyph use must go through `--color-accent-on-bg`. |
| `--color-accent-hover`              | `#E67A0E`                          | `#FFA047`                       | Pressed/hover state for orange CTAs. Light goes deeper, dark goes lighter (luminance contrast preserved).                                                                                                                                                                                                                           |
| `--color-accent-text`               | `#0E0F12`                          | `#0E0F12`                       | Text drawn ON `--color-accent` surfaces. Near-black on orange in BOTH modes; 8.23:1 in each (same hex pair; the old dark-row 11.3:1 figure was itself a miscalculation). The former white-on-orange light pairing measured 2.33:1 (the 4.07:1 figure was a luminance miscalculation) and failed every WCAG tier.                     |
| `--color-accent-on-bg`              | `#A65000`                          | `#FFA047`                       | Orange used AS TEXT on `--color-bg`. Light hex shifts darker so contrast against `#FAFAF9` reaches 5.34:1 (AA body; ≥4.5:1 on every audited tinted text fill — accent/10, accent/15, accent-tint, stale-tint). The brand `#FF8C1A` itself only hits 2.23:1 on light bg — decorative-only, never load-bearing. Dark `#FFA047` on `#0F1014` = 9.39:1 (AAA). |
| `--color-accent-edge`               | `#7A3D00`                          | `#FFA047`                       | ON-state control boundary (toggle track border, active step pill, active show-day progress segment). Light: accent-edge is 3.61:1 vs the orange track and 8.06:1 vs bg — WCAG 1.4.11 passes on both adjacent sides. Dark: decorative; the track itself clears 8.16:1 vs bg.                                                                                            |
| `--color-stale-tint`                | `#F4ECE0` (warm sand)              | `#26221B` (warm umber)          | Background tint applied to a tile or card whose data is stale (per §5.4 of spec). Not red. Pairs with explicit "as of …" text.                                                                                                                                                                                                      |
| `--color-warning-bg`                | `#FFF3D6`                          | `#3A2E14`                       | "Couldn't parse" / "needs Doug" admin states. Warm yellow, not red. Pairs with text + icon.                                                                                                                                                                                                                                         |
| `--color-warning-text`              | `#5C3F00`                          | `#FFD68A`                       | Text on warning-bg. Light 9.5:1, dark 9.2:1 (both AAA).                                                                                                                                                                                                                                                                             |
| `--color-info-bg`                   | `#F1EDE7`                          | `#1F1E22`                       | Informational notices (e.g., "we're syncing now"). Neutral-tinted, not blue. Light nudged `#EEEAE3`→`#F1EDE7` 2026-08-01 (focus-ring pass spec §3.1) so the focus ring clears 3:1 on info fills (3.08:1); every info-bg text pairing improved with the change.                                                                       |
| `--color-focus-ring`                | `#E06000` (opaque)                 | `rgba(255, 160, 71, 0.65)`      | Focus outline color for keyboard-visible focus. Always orange-derived. Light went opaque `#E06000` 2026-08-01 (focus-ring pass, owner-ratified Option B): the old translucent brand orange measured 1.60:1 on white, under the WCAG 2.2 SC 2.4.13 3:1 floor; `#E06000` clears 3.07-3.59:1 on every backdrop family, dark composites 3.69-4.56:1 (pinned by tests/styles/focusRingContrast.test.ts). 2px ring (`focus-visible:ring-2`, no `ring-3` anywhere). Where a 2px offset is used it MUST carry a container-matched color (`ring-offset-<backdrop>`, never bare `ring-offset-2` — the un-themed white gap is a dark-mode defect; enforced by tests/styles/noBareRingOffset.test.ts). Popover surfaces follow the two-tier recipe: offset only on armed destructive confirm-go buttons (spec `2026-07-23-sharehub-focus-pass` §2, §15). |
| `--shadow-tile`                     | `0 1px 2px rgba(20, 18, 12, 0.04)` | `0 1px 3px rgba(0, 0, 0, 0.45)` | Quiet drop-shadow applied to tile/card surfaces (Right Now card, tile-as-card). Light mode reads as a near-imperceptible warm lift; dark mode uses a deeper pure-black drop tuned for the warm-charcoal `--color-bg`. Components consume via the canonical `shadow-tile` utility — NEVER the `shadow-(--shadow-tile)` arrow form, and NEVER an inline `shadow-[…]` literal (token discipline §10). |
| `--shadow-popover`                  | `0 8px 24px -4px rgba(20, 18, 12, 0.18)` | `0 10px 28px -6px rgba(0, 0, 0, 0.6)` | Popover-elevation shadow for floating, anchored surfaces that overlay page content (the publish/discard soft-confirms, the show-page attention menu). A deeper lift than the quiet `--shadow-tile` so the card reads as detached from the surface it pops out of. Same consumption rule as `--shadow-tile`: the canonical `shadow-popover` utility, never the arrow form, never an inline literal. |
| `--color-status-live` / `-text`     | `#FF8C1A` / `#A65000`              | `#FF8C1A` / `#FFA047`           | Live (in active window). **Reuses `--color-accent` / `--color-accent-on-bg`** — not a new hue; contrast governed by the accent rows above. Dot is always paired with a "Live" text label.                                                                                                                                           |
| `--color-status-positive` / `-text` | `#3F8A83` / `#2C655F`              | `#4FC9BE` / `#7FE0D5`           | OK / synced / healthy. **Calm desaturated teal-leaning-neutral — NOT green** (color-blind floor §1, no green semantic). Dark value brightened 2026-07-17 (`#5FB0A8`→`#4FC9BE`) so "synced/healthy" reads confident (not dim) in dim-backstage dark mode; still teal (`b ≥ 0.85·g` guard, §1.3 test). Light unchanged. Dot uses the base; tinted text uses `-text`. Narrowly scoped to status dots/pills (§1.3).                                                                                                                   |
| `--color-status-review` / `-text`   | `#A87716` / `#6E4E00`              | `#E0B84E` / `#F0C860`           | Needs review. Amber. Dot base + `-text` for the tinted "Need review" count.                                                                                                                                                                                                                                                         |
| `--color-status-warn` / `-text`     | `#B26A16` / `#7A3D00`              | `#E9A23A` / `#F0B454`           | Stale / problem (sync failure). Amber, stronger than review. Dot base + `-text`.                                                                                                                                                                                                                                                    |
| `--color-status-idle` / `-text`     | `#8B8C92` / `#5A5B62`              | `#74736D` / `#9C9A93`           | Publishing / none / not-yet-synced. **Reuses `--color-text-faint` / `--color-text-subtle`** (neutral/faint), not a new hue.                                                                                                                                                                                                         |
| `--color-status-degraded` / `-text` | `#B3261E` / `#FFFFFF`              | `#E5534B` / `#1A1A1A`           | App-health **degraded** signal (alert-audience-split). Red — the **third scoped §1.3 exception** to "orange stays alone", introduced for the app-health indicator's worst-active state. Unlike positive/review/warn, the `-text` is drawn ON the filled degraded pill (`bg-status-degraded text-status-degraded-text`), so its floor is text-on-fill (§1.2), not text-on-surface. Always dot/pill + label, never color-only.                                                    |
| `--color-accent-tint`               | `#FEEEDE`                          | `#2A1E10`                       | Warm low-chroma wash behind the bell panel's **active-count pill**. The pill NUMBER stays `--color-text-strong` for hierarchy, not necessity. A quiet tint, never a CTA fill; the ≤10% accent-coverage cap is unaffected (a small pill). Also backs the review-modal mobile state badge's **Live pill** (`bg-accent-tint text-accent-on-bg` + `bg-accent-on-bg` dot — spec 2026-07-24-strip-mobile-stacked-band §3 R0; both legs are the pinned §1.2 accent-on-bg-on-tint pair). _(Was also the info severity icon-circle bg pre-2026-07-17; the Quiet-rail restyle (§16) replaced the circle with an on-surface stroke glyph, so the tint now backs the count pill only.)_                                              |
| `--color-danger-bg`                 | `#FBEAE8`                          | `#3A1E1C`                       | Soft red wash — retained token. _(Was the bell panel's **critical** severity icon-circle bg pre-2026-07-17; the Quiet-rail restyle (§16) replaced the filled circle with a 3px rail + on-surface `--color-status-degraded` stroke glyph, so no bell surface fills this today. Kept as a defined danger wash for future use; still paired with row title text wherever a red wash is used, holding the §1 color-blind floor.)_                                                                                                                                                          |

### 1.1a Subtle-on-interactive carve-outs (2026-08-14, user-ratified)

`--color-text-subtle` is never the resting color of an action target — with
three named exceptions. They are exceptions **by decision**, not by omission:
each was argued, ratified by the owner on 2026-08-14, and is enforced
executably by `tests/styles/_metaSubtleOnInteractive.test.ts`, whose registry
(`tests/styles/subtleInteractiveExemptions.ts`) requires a family and a reason
per site and fails by name on any unregistered site. Everything else
interactive rests at `--color-text` or stronger.

**Family S — `<summary>` disclosure headers.** A disclosure summary is half
caption, half control: its text names the CONTENT it folds, and the fold
affordance is carried by the marker/chevron and the interaction, not by label
weight. Resting subtle is sanctioned. (7 sites.)

**What carries Family S when a site suppresses the native marker (2026-08-25).**
The family's whole argument is that something OTHER than label weight carries
the fold, so a site that hides the UA triangle owes a replacement: a rendered
chevron, or an underline where the summary reads as a link. A trailing ellipsis
is not one — it is a truncation mark, and it was the only cue on the run-of-show
title (`BL-RUNOFSHOW-SUMMARY-NO-MARKER`). That site keeps Family S and its dim
tone and now renders a chevron. Sweeping the shape found three more summaries
outside Family S in the same position, two of them crew surfaces, and all four
were repaired together. `tests/styles/summaryFoldCue.test.ts` walks every
marker-suppressing `<summary>` under `app/` and `components/` and requires a cue
or a registered affordance. Reasoning:
`docs/superpowers/specs/2026-08-25-ui-polish-class-sweep-design.md` D10.

**Family C — dismissable filter chips.** A chip's text names an APPLIED FILTER,
which is a caption; the dismiss glyph is the control. Resting subtle is
sanctioned. (1 site. The second was the "Clear filters" action standing beside
the chips — a plain underlined button with no caption and no dismiss glyph — so
it never met this definition; it rests at `text-text` like any other action.
Corrected 2026-08-15.)

**Family D — state-pair dim members.** The dim member of a state pair
(inactive↔active, claimed↔unclaimed) may rest subtle **only while the pair
stays distinguishable by at least one cue besides the text-color delta**. The
cue may sit on EITHER member — fill, border, weight, glyph, or `aria-current`
semantics — and every registry row names its cue and the file it lives in; the
suite reads that file and fails the row if the cue is gone, so the claim cannot
go stale. (6 sites.)

| Dim member | The cue that carries the state |
| --- | --- |
| Inactive desktop admin nav link | active carries `bg-surface-raised` + `text-text-strong` + `aria-current="page"` |
| Inactive admin bottom tab | active carries `aria-current="page"`; the visual delta is `text-accent-on-bg` vs subtle — a hue-plus-lightness delta with no layout cue, recorded as-is |
| Inactive crew sub-nav tab | active desktop branch carries `border-accent` + `text-text-strong`; active mobile branch carries `text-accent-on-bg` plus `aria-current="page"` |
| Unselected dashboard bucket segment (x2) | selected carries `bg-surface` + `shadow-tile` + `text-text-strong` + `aria-current="page"` |
| Claimed picker row | the dim member ITSELF carries the cues: a `bg-surface-sunken` fill plus the lock glyph |

No pair is color-ALONE in the semantic tree: every one carries `aria-current`
or a structural glyph, holding the §1 color-blind floor while preserving the
resting hierarchy the carve-out decision chose.

**Family D is a predicate, not a list, and it EXCLUDES more pairs than it
admits.** A state pair whose active member INVERTS the fill — the telemetry
level filter's selected segment is `bg-text text-bg`
(`components/admin/telemetry/EventFilters.tsx`) — is not a Family D pair: the
inversion already separates the two members at full strength, so the inactive
member has no reason to rest dim, and it rests at `text-text` like any other
control. Family D is for pairs whose dim member would otherwise be
distinguished by the text-color delta ALONE.

**The faint rung, ruled 2026-08-25.** `--color-text-faint` sits one step
QUIETER than `--color-text-subtle`, and §1.1 already says it is never used for
crew-actionable copy. Four controls were resting there anyway
(`BL-TEXT-FAINT-AS-RESTING-INTERACTIVE-COLOUR`). The condition, which is
narrower than the subtle rule rather than a second copy of it: **an action
target may rest at `--color-text-faint` only when it renders no text of its own
and its glyph is the affordance, or when a non-colour affordance at 3:1 or
better carries it.**

The line falls there because the faint rung has two problems and only one of
them is the hierarchy problem this section is about. On `--color-surface` it
measures 3.35:1 — over the 3:1 floor a glyph or a boundary is held to, and under
the 4.5:1 floor for TEXT. So a control that renders a label cannot rest here
whatever one concludes about hierarchy, and a glyph-only control is not making
the claim that fails.

Two of the four met it and stayed: the card report trigger (a `FlagGlyph` and
nothing else, named by an `aria-label`) and the hover-help badge (a 3.35:1
circular border plus `cursor-help`, its `?` `aria-hidden` and acting as a glyph
inside that boundary). Two did not: the crew source link, which renders "In
sheet", and the bell panel's ghost resolve control, whose whole content is a
text label. **Both were overridden knowingly** — the source link's quietness was
a deliberate crew-surface choice, and it is still secondary by size and icon
rather than by putting its label under the floor. Registry and reasons:
`tests/styles/faintRestingControls.test.ts`. This is a CONDITION named here, not
a second policed token: the ratified `--color-text-subtle` census and its 14
exemption rows are untouched. Reasoning:
`docs/superpowers/specs/2026-08-25-ui-polish-class-sweep-design.md` D4.

**Hover is unchanged by this policy.** Where a swapped site's existing hover
target became its new resting color, that site's hover steps to
`--color-text-strong` so hover still visibly strengthens; sites whose hover
affordance is a fill or a border keep it as-is.

### 1.2 Contrast summary (calculated, not estimated)

| Pair                                              | Light  | Dark   | Floor                                                    |
| ------------------------------------------------- | ------ | ------ | -------------------------------------------------------- |
| `--color-focus-ring` vs every backdrop family     | 3.07:1 min | 3.69:1 min | SC 2.4.13 indicator (≥3:1) — worst cells: light `stale-tint` 3.07, dark `warning-bg` 3.69; full nine-family matrix pinned by tests/styles/focusRingContrast.test.ts (dark side alpha-composited) |
| `--color-text` on `--color-bg`                    | 16.5:1 | 14.8:1 | AAA body (>7:1)                                          |
| `--color-text-strong` on `--color-bg`             | 18.4:1 | 16.9:1 | AAA body                                                 |
| `--color-text-subtle` on `--color-bg`             | 6.5:1  | 6.8:1  | AA body (≥4.5:1)                                         |
| `--color-text-subtle` on `--color-surface`        | 6.8:1  | 6.4:1  | AA body (≥4.5:1) — subtle eyebrow/meta on the card fill (KeyTimesStrip labels, DayCard meta); never an action target OUTSIDE the §1.1a carve-outs — the KeyTimesStrip `<summary>` itself is one (Family S). In light the surface `#FFFFFF` is whiter than bg (contrast rises); in dark the surface `#16171C` is one step lighter than bg (contrast dips just below the bg figure). (D6) |
| `--color-text-strong` on `--color-surface-sunken` | 17.3:1 | 17.6:1 | AAA body — SheetIconLink pressed/hovered glyph on its `bg-surface-sunken` wash (modal-title sites); pinned by tests/styles/status-token-contrast.test.ts |
| `--color-text-strong` on `--color-surface`         | 18.4:1 | 15.9:1 | AAA body — SheetIconLink pressed/hovered glyph on its `bg-surface` wash (section-header/bg site; the sunken wash measures ~1.03:1 against dark bg, so the bg site steps UP to surface); same pin |
| `--color-accent` on `--color-bg` (text-on-bg use) | 2.23:1 | 8.16:1 | decorative-only in light — use `--color-accent-on-bg` for any load-bearing text/glyph |
| `--color-accent-on-bg` on `--color-bg`            | 5.34:1 | 9.39:1 | AA body / AAA body                                       |
| `--color-accent-on-bg` on `--color-surface-sunken` | 5.02:1 | 9.65:1 | AA body — the Restart action inside the gallery's in-flight retry overlay, and the `Tap to retry` control on the same sunken cell; pinned by tests/styles/status-token-contrast.test.ts |
| `--color-accent-on-bg` on `--color-surface-raised` | 5.57:1 | 8.30:1 | AA body — the Restart action inside the lightbox's in-flight chip; same pin. Light is the binding mode for both rows, and both clear the body floor with room, which is why the action may carry accent rather than settling for a weight step |
| `--color-accent-text` on `--color-accent`         | 8.23:1 | 8.23:1 | AA body both modes (same pair)                           |
| `--color-accent-edge` vs `--color-accent`         | 3.61:1 | 1.15:1 | ≥3:1 non-text (light = the load-bearing 1.4.11 boundary; dark edge is decorative — the track itself is the boundary, next row) |
| `--color-accent-edge` vs `--color-bg`             | 8.06:1 | 9.39:1 | ≥3:1 non-text (dark's toggle boundary is `--color-accent` vs bg, first accent row above) |
| `--color-status-positive` dot on bg/surface       | 3.9:1  | 9.4:1  | ≥3:1 graphical (dot)                                     |
| `--color-status-positive-text` on bg/surface      | 6.4:1  | 12.3:1 | AA body (≥4.5:1)                                         |
| `--color-status-review` dot on bg/surface         | 3.8:1  | 10.1:1 | ≥3:1 graphical (dot)                                     |
| `--color-status-review-text` on bg/surface        | 7.3:1  | 11.9:1 | AA body (≥4.5:1)                                         |
| `--color-status-warn` dot on bg/surface           | 4.1:1  | 8.8:1  | ≥3:1 graphical (dot)                                     |
| `--color-status-warn-text` on bg/surface          | 8.1:1  | 10.3:1 | AA body (≥4.5:1)                                         |
| `--color-status-idle` dot on bg/surface           | 3.2:1  | 4.0:1  | ≥3:1 graphical (dot)                                     |
| `--color-status-degraded` dot on bg/surface       | 6.3:1  | 4.8:1  | ≥3:1 graphical (dot)                                     |
| `--color-status-degraded-text` on degraded fill   | 6.5:1  | 4.7:1  | AA body (≥4.5:1) — text-on-fill, not on surface         |
| `--color-text` on `--color-warning-bg`            | 15.6:1 | 10.6:1 | AAA body — attention-banner body copy on the warning wash (published-show attention surface, 2026-07-19) |
| `--color-text-strong` on `--color-warning-bg`     | 17.4:1 | 12.0:1 | AAA body — attention-banner title line                   |
| `--color-text-subtle` on `--color-warning-bg`     | 6.1:1  | 4.7:1  | AA body (≥4.5:1) — banner detail/identity/raised-at lines; dark clears with a thin margin, so any warning-bg or text-subtle retune re-checks this row (pinned in `tests/styles/status-token-contrast.test.ts`) |
| `--color-status-positive-text` on `--color-warning-bg` | 6.1:1 | 8.6:1 | AA body (≥4.5:1) — the banner's transient "✓ Confirmed" swap |
| `--color-status-degraded` icon on `--color-danger-bg` | 5.6:1  | 4.2:1  | ≥3:1 graphical (icon) — retained reference pair (was bell critical circle pre-§16 restyle) |
| `--color-accent-on-bg` icon on `--color-accent-tint`  | 4.91:1 | 8.03:1 | ≥3:1 graphical (icon) — retained reference pair (was bell info circle pre-§16 restyle; clears 4.5:1 text too) |
| `--color-text-strong` on `--color-accent-tint`        | 16.5:1 | 14.9:1 | AA body (≥4.5:1) — active-count pill number             |
| `--color-text-subtle` on `--color-surface-sunken`     | 6.09:1 | 6.94:1 | AA body (≥4.5:1) — stacked-band Published/Draft pill (spec 2026-07-24 §3 R0); pinned by tests/styles/status-token-contrast.test.ts |
| `--color-text-faint` as OUTLINE vs `--color-surface`  | 3.35:1 | 3.76:1 | ≥3:1 non-text (SC 1.4.11) — the secondary action button's boundary on a card fill (§1.2a control-outline rule); pinned by tests/styles/secondary-action-contrast.test.ts |
| `--color-text-faint` as OUTLINE vs `--color-surface-sunken` | 3.02:1 | 4.11:1 | ≥3:1 non-text — same button on the attention plate; light clears with a thin margin, so any `text-faint` or `surface-sunken` retune re-checks this row |
| `--color-text-faint` as OUTLINE vs `--color-bg`       | 3.21:1 | 4.00:1 | ≥3:1 non-text — same button on the page ground |
| `--color-text-subtle` on `--color-surface-raised`  | 6.76:1 | 5.97:1 | AA body (≥4.5:1) — raised-surface captions: the HoverHelp popover, the admin-nav and onboarding count pills, and the tile error fallback. The pairing was first surfaced by the theme persist-failure note (removed 2026-08-26); the row outlived it because those four did not. Pinned in `tests/styles/status-token-contrast.test.ts` |
| `--color-text-faint` as OUTLINE vs `--color-surface-raised` | 3.35:1 | 3.53:1 | ≥3:1 non-text — popover and modal surfaces, pinned so a raised-surface control is not an unmeasured fourth ground |
| `--color-control-outline-tinted` as OUTLINE vs the three TINTED plates | 3.42-3.62:1 | 3.65-4.55:1 | ≥3:1 non-text — the control outline on a `warning-bg` / `info-bg` / `danger-bg` card, and ONLY there. `--color-text-faint` measures 2.87-3.04 light / 2.79-3.48 dark on the same plates, under the floor in one theme per plate; this token exists so the plates clear without retuning the shared one, which would push the four neutral grounds the other way (2026-08-25, `BL-CONTROL-OUTLINE-ON-TINTED-PLATES`) |
| `--color-control-outline-tinted` vs `--color-surface` (inner edge) | 3.99:1 | 4.91:1 | ≥3:1 non-text — the inner edge of a plate control carrying its own `bg-surface` fill; the outer edge is the plate row above |
| `--color-control-outline-tinted` vs `--color-bg` (inner edge) | 3.82:1 | 5.22:1 | ≥3:1 non-text — the same inner edge where the plate control's own fill is the page ground instead, which is the validation reset-confirm field (`components/admin/MaintenanceResetButtons.tsx`); pinned as a relation in `tests/styles/secondary-action-contrast.test.ts` (2026-08-26, control-outline-cover widening) |
| `--color-border` as OUTLINE vs the four neutral grounds | 1.22-1.27:1 | 1.19-1.38:1 | **BELOW the 3:1 non-text floor, and recorded rather than required** — this is the before-state the 2026-08-18 ruling moved 37 controls away from. Pinned so a future retune of `--color-border` cannot quietly reintroduce the weight that was removed; `tests/styles/secondary-action-contrast.test.ts` asserts it stays under the floor |
| `--color-text-subtle` as OUTLINE vs the four neutral grounds | 6.09-6.76:1 | 5.97-6.94:1 | ≥3:1 non-text — the hover outline for a control whose border is its ONLY hover cue (§1.2a). A body-text token in a new role, so it takes a pin like any new one |
| `--color-accent-on-bg` as OUTLINE vs the four neutral grounds | 5.02-5.57:1 | 8.30-9.65:1 | ≥3:1 non-text — the hover outline where the cue is an accent HUE. `--color-accent` itself measures 2.10-2.33:1 here and is decorative-only in light, which is why the load-bearing accent token carries this role |

**The hover-over-rest RELATION, which is what the suite actually guards.** The three rows above are the record; the guard is that `--color-text-subtle` and `--color-accent-on-bg` each measure HEAVIER than `--color-text-faint` on every one of the four grounds in both themes — sixteen comparisons, computed from the tokens rather than pinned as constants. Sixteen constants would go stale the moment any of the three is retuned and force a reader to re-derive whether each pair still reads correctly; a relation fails loudly at exactly the moment a retune inverts a pair, and stays silent when it is harmless. All sixteen hold today, so the assertion ships as a regression pin rather than as a repair.

**Method note (D6):** ratios use the standard WCAG 2.x relative-luminance formula. The two `--color-text-subtle` rows above were recomputed against that formula (the previous light-on-bg `7.8:1` was a mistranscription — the same-method recompute of the neighbouring `--color-text`/`--color-text-strong` rows reproduces their published figures to within 0.1). The dark-mode figures elsewhere in this table carry a small historical calc offset (~0.3–0.4 more conservative than a fresh standard-formula recompute); a full-table recompute is tracked separately and is not load-bearing (every row already clears its stated floor with margin).

**Direct-sunlight rule:** body text (`--color-text` on `--color-bg`, light mode) must hit ≥7:1 — 16.5:1 clears the bar with margin. Verified.

### 1.2a Standalone hairlines are NOT border-token surfaces (2026-08-10, wizard-connector measurement)

A hairline that sits ALONE on the page — no filled surface beside it — needs
text-grade contrast, not border-grade. `--color-border` and
`--color-border-strong` are tuned for a divider that runs along a tile edge,
where the tile's own fill carries the visual weight; painted as a 1px rule on
`--color-bg` they measure **1.22:1** and **1.52:1** light, **1.35:1** and
**1.70:1** dark. All four are under the 3:1 non-text floor, and the two differ
from EACH OTHER by **1.25:1** light / **1.26:1** dark — so a state distinction
carried by that pair is not perceivable at all.

Measured in a real browser at every step, at 390px and 900px, in both themes,
on the onboarding wizard's step connector (`components/admin/OnboardingWizard.tsx`,
`data-testid="wizard-step-connector"`). The connector now uses the text ramp:

| Connector state | Token | Light vs `--color-bg` | Dark vs `--color-bg` |
| --- | --- | --- | --- |
| Step ahead of the cursor | `--color-text-faint` | 3.16:1 | 4.22:1 |
| Step behind the cursor (done) | `--color-text-subtle` | 6.5:1 | 6.8:1 |

Both clear the 3:1 non-text floor, and the done run reads visibly heavier. The
state is still never colour-ALONE — the completed pill carries a Check glyph
(§1 colour-blind floor) — so the connector's colour is reinforcement, not the
signal.

**Rule:** before painting a token as a standalone rule, divider-on-page, or
1px indicator, check it against §1.2 rather than assuming a border token is
the border-shaped choice. The `-faint`/`-subtle` text pair is the sanctioned
hairline ramp.

**The rule extends to CONTROL OUTLINES (2026-08-14; predicate widened
2026-08-16).** An outline drawn around a control whose **fill carries no visual
weight against what it stands on** is a standalone stroke by the same argument:
the fill it encloses carries no visual weight of its own, so the stroke IS the
control's boundary and takes the text ramp. In practice that is any control
filled with one of the four neutral ground tokens (`--color-bg`,
`--color-surface`, `--color-surface-sunken`, `--color-surface-raised`) or left
unfilled. Pair any two of those four tokens and the widest result is **1.17:1**
— `surface-raised` on `surface-sunken`, 1.163:1 dark; the five pairings the app
actually renders are all **≤1.13:1** (measured 2026-08-16; that table is in
`docs/superpowers/specs/2026-08-16-control-outline-surface-fills-design.md` §3).
Both numbers are stated because the second is the evidence and the first is the
bound: in every one of them the fill is invisible against its container, so the
stroke is the only boundary there is.

**Two families are OUT, and they are out by decision rather than by omission.**
A control with a **weight-bearing fill** — the accent-filled primary action — is
not a standalone stroke and keeps its own treatment. The **switch tracks** (five
render paths) keep their existing recipe in both states (`border-accent-edge
bg-accent` ON, `border-border-strong bg-surface-sunken` OFF): the toggle's
ON/OFF boundary is a deliberately tuned relationship, and lifting only the OFF
ring would make the OFF state read heavier while the ON state stood still. The
OFF ring's **1.43:1** light / **1.75:1** dark against its own track fill is a
documented limit of that decision, recorded here so it cannot drift into looking
like an oversight (ruled 2026-08-16). The ON boundary — `accent-edge` vs
`accent`, 3.61:1 light — is the load-bearing SC 1.4.11 pair and is untouched.
The five paths are `components/admin/PublishedToggle.tsx:305`,
`components/admin/settings/AutoPublishToggle.tsx:136`,
`components/admin/settings/NotifyToggle.tsx:144`,
`components/admin/telemetry/AutoRefreshControl.tsx:106` and
`components/admin/settings/DeveloperToggleButton.tsx:97`; the last two paint the
track on a nested `<span>`, which is why an element-level census reported three.
On 2026-08-26 the widened cover reached both, by two DIFFERENT mechanisms:
`AutoRefreshControl`'s span is a lexical child of its button, and
`DeveloperToggleButton`'s is inside a component the button renders. Both now
carry a `switch-track` residue row citing this ruling, and the ruling itself is
untouched. Becoming visible to a census is a registration duty, not a reopening:
the tracks are out for the ON/OFF RELATIONSHIP, never for the ratio.

**What did not move with the 21, and read lighter beside it until 2026-08-25** (2026-08-16
invariant-8 gate). Two elements shared a recipe with a swapped control and stayed put, so each
became the quieter half of a visible pair: the lightbox's `aria-hidden` demote chip
(`data-testid="lightbox-demote-chip"` in `components/diagrams/GalleryLightbox.tsx`, same
`rounded-pill bg-surface-raised` as the `lightbox-reset-chip` it can share a frame with) and the
staged-preview banner's `aria-current` chip (`components/admin/StagedPreviewBanner.tsx`, standing in
a row of picker links that moved). The lightbox pair is the one with a clean measurement: 1.59/1.50
for the chip against 3.35/3.53 for its Reset twin, `text-faint` on `surface-raised` per the §1.2 row
above. The staged pair has no such pair of figures and is not comparable to it, because the picker
link stands on the banner's `warning-bg` plate rather than a neutral ground: the 2026-08-16 swap took
that link to 3.04 light / 2.79 dark, and the dark figure is the one recorded against
`BL-SECONDARY-BUTTON-BOUNDARY-INVISIBLE`, not a clearing number. An earlier version of this paragraph
quoted the lightbox's 3.35/3.53 as if it were the links', which substituted a clearing figure for a
sub-3:1 one; caught by the invariant-8 gate on this branch. Both ARE non-interactive chrome, so the
scope paragraph below makes them correct in isolation, while the
2026-08-14 rationale for moving six controls was that a control they render WITH had already moved,
which points the other way. That contradiction was filed as
`BL-CONTROL-OUTLINE-PAIRED-CHROME-WEIGHT`, and it is closed: the clause below settled it on
2026-08-25, both chips moved in `e6408222c`, and the row is archived at `BACKLOG-archive.md:1288`.
Kept as the record of why the clause exists rather than deleted, the same way the tinted-plate
paragraph below keeps its own superseded did-not-move claim.

**The pairing clause, ruled 2026-08-25.** Chrome rendered in-frame with a
control of the same recipe takes that control's outline weight. "Same recipe"
means the shape and stroke treatment a reader compares at a glance: the border
utility, the radius and the padding scale. It does NOT require the same fill, and
the two shipped pairs differ there on purpose — the lightbox chip and its Reset
twin share `bg-surface-raised`, while the staged chip is `bg-surface` beside a
`bg-transparent` link. Fill is what each element stands on; the stroke is what
the pairing is about. A rule rather
than two judgments: a per-site call closes neither site and says nothing about
the third one. Both chips moved — the lightbox demote chip to
`--color-text-faint` (its twin the Reset chip's token) and the staged-preview
`aria-current` chip to `--color-control-outline-tinted` (its twin the picker
link's, because that row stands on the banner's `warning-bg` plate). Note what
the clause does: it points at the TWIN, not at a named colour, so a pair cannot
drift apart later by the control moving again.

**Where this clause stops, and the carve-out it must not swallow.** The scope
paragraph below, and the `--color-border-strong` row in §1.2, both reserve that
token for the status-emphasis outline on non-interactive chrome: the flagged
"Needs a look" pill and the section-header judgment chip. Those are NOT paired
chrome. Nothing renders in-frame with them sharing their recipe, so this clause
never reaches them and they keep `border-strong`. The test is the twin: no twin,
no pairing, and the carve-out governs. Stated in both directions because a
designer meeting one of the two paragraphs without the other would apply the
wrong rule, which the invariant-8 gate on this branch raised.

This is HIERARCHY, not accessibility. Neither element is interactive, so SC
1.4.11 does not reach either one and there was never a contrast failure here to
argue. What was wrong is that the chip a reader is meant to read as the current
state read lighter than the control beside it, inverting the hierarchy the swap
was making. Both pairs are pinned in
`tests/styles/pairedChromeOutline.test.ts`, which reads the CONTROL side out of
the live tree so the guard fails on the pair rather than on a colour. Reasoning:
`docs/superpowers/specs/2026-08-25-ui-polish-class-sweep-design.md` D3.

**`border-border` on a control's resting outline takes the text ramp too
(ruled 2026-08-18).** The 2026-08-16 swap moved only `border-border-strong`, and
this paragraph previously recorded the remaining question as open. It is now
closed: a control whose resting outline is `border-border`, standing on one of
the four neutral ground tokens **or unfilled**, carries `border-text-faint` like
its `border-border-strong` siblings. `border-border` measured **1.22-1.38:1**
against those grounds — below `border-border-strong`, and under the 3:1 non-text
floor by a wider margin than a single figure suggests.

The ruling was taken against a RENDERED MOCKUP showing three candidate weights
in both themes, and — unlike the 2026-08-16 mockup, which was admin-only — it
showed the CREW half: the `/me` show tiles, the section chips, and the call and
text buttons on a person's row. Those crew surfaces are therefore ratified
rather than inferred, which is the difference that let the sweep reach them.

**Hover must stay heavier than rest, and this ruling is what makes that a
rule.** Raising a resting outline to 3.35:1 while leaving a `hover:` override at
1.59:1 inverts the pair — the control would read FAINTER on hover than at rest.
So a hover override either goes away, where another hover cue already carries
the affordance on the same render path, or rises above the resting weight:
`--color-text-subtle` (5.97-6.94:1) where the border is the only cue, and
`--color-accent-on-bg` (5.02-9.65:1) where the cue is an accent hue —
`--color-accent` itself is decorative-only in light (§1.2) and cannot carry it.

**What the 2026-08-18 sweep actually reached, stated because the rule above is
wider than the sweep.** On 2026-08-18 it moved only the controls the
element-level census could SEE: `scanInteractiveElements` admitted `button`, `a`
and `summary`, plus `<input>` at `type="checkbox"` or `"radio"`, so text-entry
fields and `<select>`s sat outside that vocabulary in BOTH directions and
several still rested at `border-border`.

**That gap closed on 2026-08-26, and the reach now matches the rule.** The user
ruled that a text field's border IS a control outline under this section, and
that an open-state outline painted on a CHILD is a resting boundary rather than
a state cue. `scanInteractiveElements` gained two declared axes for those two
families, the outline guards opted in, and the red they produced named the
population: thirty-five elements, of which twenty-three moved to the token their
ground requires and twelve are registered in the residue census with a reason.
The `<textarea>` at `components/shared/ReportModal.tsx:715` this paragraph used
to name as unreachable is one of the twenty-three.

**Chrome painted inside a control keeps its own treatment**, which is the Family
B sorting rule and follows from the scope paragraph below rather than from
anything new. A painted child that IS the control's visual box takes the rule
the element would have taken; a painted child that is a status chip, a count
pill, a decorative label or an alert banner keeps the status-emphasis treatment
this section already preserves for non-interactive chrome by name. Whether a
given child is one or the other is a RULING, not a property a scanner can
project, so the residue census checks the FORM of the claim and its author owns
its truth.

**The rule states the predicate; the sweep states its reach. Do not read the
first as a claim about the second** — an earlier revision of this paragraph did,
and the invariant-8 review was right to call it a promise the diff had not kept.
`BL-CONTROL-OUTLINE-BEYOND-ELEMENT-COVER` is closed; the limits the widened
cover still has are recorded in
`docs/superpowers/specs/2026-08-26-control-outline-cover-widening-design.md`
§17 rather than as an open row.

**Dividers are OUT, in both directions.** A `border-t`, `border-b` or `border-l`
rule between stacked content has no resting outline to raise, and §1.2a's
preservation of the border tokens for dividers is what this carve-out rests on.
Nobody should sweep one because a token census found it, and nobody should widen
the carve-out into a claim about which elements are "really" controls — it is a
statement about which SIDE the token paints, nothing more.

**One population was knowingly left behind, and on 2026-08-25 it came in.**
`components/admin/showpage/ShareHub.tsx` carried a `max-sm:border-border` skin
on its two ternary arms and its kebab, painting **1.27:1** below 640px on a
control measuring 3.35:1 above it. A prior ratified decision (spec
`2026-07-24-strip-mobile-stacked-band` §3 R3) and a shipped executable pin both
fenced it, so it was filed as
`BL-CONTROL-OUTLINE-SHAREHUB-MOBILE-SKIN-WEIGHT` rather than swept. That row is
now closed: this rule supersedes R3's border clause, all three elements carry
`max-sm:border-text-faint`, and the executable pin was INVERTED rather than
deleted — same case, asserting the new token, with the ratification and its date
in the docstring (`tests/styles/_metaControlOutlineFill.test.ts`, the `adjacent
tokens survive the swap` block). R3's split row LAYOUT is untouched and the
border width is still 1px; what moved was one line of colour skin riding inside
a layout decision. The reasoning is
`docs/superpowers/specs/2026-08-25-ui-polish-class-sweep-design.md` D1.

Worked example — the one secondary action treatment (`lib/ui/actionClass.ts`,
`SECONDARY_ACTION_CLASS`, 8 call sites):

| Boundary | Token | Light vs `--color-surface` | Dark vs `--color-surface` |
| --- | --- | --- | --- |
| Before (2026-08-14) | `--color-border-strong` | 1.59:1 | 1.60:1 |
| After | `--color-text-faint` | 3.35:1 | 3.76:1 |

The four neutral ground pairings are pinned as §1.2 rows above (`surface`,
`surface-sunken`, `bg`, `surface-raised`) and asserted live by
`tests/styles/secondary-action-contrast.test.ts`, which also pins that the
constant still wears the token the ratios are about.

**What the outline is measured against, and where it does not clear 3:1.** An
outlined control has two neighbours: the fill INSIDE it and whatever it stands
on OUTSIDE. The inner figure depends on the control's own fill, and the
population below carries three of them: `bg-bg` gives 3.21:1 light / 4.00:1
dark, `bg-surface` gives 3.35:1 / 3.76:1, and a `bg-transparent` control has no
inner fill at all — its inner neighbour IS the plate, which is why the
`StagedPreviewBanner` picker link is the one row under 3:1 on BOTH edges. On the four neutral grounds above, both sides clear. On a
TINTED plate they do not, and the measured numbers are recorded here rather than
implied away — `warning-bg` 3.04 light / **2.79** dark, `info-bg` **2.87** light
/ 3.48 dark, `danger-bg` **2.88** light / 3.19 dark. Fourteen shipped controls stand on such a plate, across thirteen sites; the enumerated list is
in `BL-CONTROL-OUTLINE-ON-TINTED-PLATES` and is not duplicated here, because a summary that
drifts from the list it summarises is worse than a pointer.

**Ruled 2026-08-25: a tinted plate gets its own outline token.** The figures
above were a recorded position for ten days, on the frame R5 supplies: the
outline is an upgrade over a label that already carried the affordance, so a
boundary strong against its own fill and slightly under 3:1 against a tinted
plate is a weaker version of the upgrade, not a regression against the prior
state (1.59:1 on `surface`, 1.52/1.70 on `bg`, 1.44/1.19 on `warning-bg`;
recomputed 2026-08-16 after whole-diff R7 caught "against everything" as a false
universal). `BL-CONTROL-OUTLINE-ON-TINTED-PLATES` filed the design question and
it is now answered.

`--color-control-outline-tinted` is the outline for a control standing on
`warning-bg`, `info-bg` or `danger-bg`, and nowhere else. **The shared token did
not move**, deliberately: the four neutral grounds already clear at
`--color-text-faint`, and retuning it to rescue the plates pushes them the other
way. The shape is a per-plate `border-*` inside the same recipe rather than a
new global default, which is what the ledger row's own first-scheduled-step
prescribed. Where a treatment is shared across grounds the outline COLOUR was
lifted OUT of the shared constant and supplied per call site or per plate branch
(`lib/ui/actionClass.ts`, `components/admin/DataQualityWarningControls.tsx`,
`app/admin/settings/roles/RoleMappingRow.tsx`): `cn` does not merge Tailwind
conflicts, a ratified decision, so two `border-*` classes on one element have no
defined winner and the colour has to appear exactly once.

Hover still strengthens. The new token is deliberately LIGHTER than
`--color-text-subtle` on every plate in both themes, so the
hover-heavier-than-rest rule below survives the raised resting weight. That
relation, the 3:1 clearance, and "heavier than the shared token" are asserted as
RELATIONS in `tests/styles/secondary-action-contrast.test.ts` rather than pinned
as constants, so a retune fails at the moment it inverts a pair and stays quiet
when it is harmless. Which controls wear the token is covered by
`tests/styles/tintedPlateOutline.test.ts`, whose derived arm reads the plate off
each element's own `focus-visible:ring-offset-*`.

One control on a tinted plate did NOT move on 2026-08-25, and its absence was a
decision: the `<input type="text">` reset confirm field in
`components/admin/MaintenanceResetButtons.tsx`. Whether a text field's border is
a control outline at all was the open question in
`BL-CONTROL-OUTLINE-BEYOND-ELEMENT-COVER` family A, and answering it in passing
is what the ledger exists to prevent. Reasoning:
`docs/superpowers/specs/2026-08-25-ui-polish-class-sweep-design.md` D2.

**It moved on 2026-08-26, because the fence was spent rather than because a
sweep reached further.** The user ruled that a text field's border IS a control
outline under §1.2a, so the question the fence protected no longer exists and
the field is simply a control on a `warning-bg` plate. Its own `bg-bg` fill
makes the INNER edge a pair nothing had pinned, which is the
`--color-control-outline-tinted` vs `--color-bg` row in §1.2 above. The
executable pin was INVERTED rather than deleted, the same shape the ShareHub
skin took: same case, asserting the new token, with the ratification in its
docstring. Deleting it would have lost the fact that the field was ever fenced.

**This was a design upgrade, not a compliance repair.** The prior boundary —
1.59:1 on `surface`, the figure this section quotes throughout — was not a WCAG
failure: the button's LABEL carried the affordance at 18.35:1,
and SC 1.4.11 asks for a perceivable control boundary, which a legible label
inside a padded, focusable target supplies. What was missing was a written-down
posture, and the upgrade is that the outline now carries its own weight rather
than depending on the label to do it. Do not re-frame the prior state as an AA
failure (ratified 2026-08-14, spec §1.1 R5).

`disabled:opacity-60` drops the new outline back under 3:1 — WCAG exempts
inactive controls, and the disabled state is a documented limit, not a finding.

**Scope, so this rule and §1.1's `--color-border-strong` row do not read as a
contradiction.** This rule governs the OUTLINE OF A CONTROL whose fill is the
near-ground. `--color-border-strong` keeps every other job it had: tile and card
edges, hover borders, focus-adjacent chrome, and the status-emphasis outline on
non-interactive chrome (the flagged pill, the judgment chip) — which the 2026-08-25
pairing clause above does NOT reach, because neither has a twin rendered in-frame
with it sharing its recipe. A card is not a
control, and its edge is read against the fill beside it rather than as a
standalone stroke. Controls whose fill is a SURFACE rather than the page ground
WERE the open question. **That question is closed: ruled 2026-08-16**, and the
predicate above is the ruling — fill-equals-container, not page-ground-only.
Twenty-one button and link controls standing on card and panel fills moved to
`--color-text-faint` on that date; the switch tracks were ruled OUT and their
OFF ring is the documented limit above.
`BL-CONTROL-OUTLINE-BORDER-STRONG-ON-SURFACE-FILLS` is archived. The outlines
the element-level census could not see — text-entry fields, and outlines painted
on a nested child — were filed separately with their probe transcripts as
`BL-CONTROL-OUTLINE-BEYOND-ELEMENT-COVER`, and that row is now closed too: the
cover was widened on 2026-08-26 until it saw both families, and the red it
produced named the population it then swept. What the widened cover still
cannot reach is recorded as documented limits in
`docs/superpowers/specs/2026-08-26-control-outline-cover-widening-design.md`
§17, with a re-file trigger each, rather than as an open row.

Six such controls DID move on 2026-08-14, for one reason applied at three
distances: leaving a control at the old outline while a control it renders WITH
had moved would have shipped a split treatment inside one view. Two are direct
pairs — `Step2Verify`'s re-scan beside its folder input, and
`DriveConnectionPanel`'s two actions. Two are connected through a row they share
rather than by adjacency — `RecentAutoAppliedStrip`, whose near-ground control
sits in its confirmation row, and the `AcceptChangeButton`/`UndoChangeButton`
pair that `ChangeFeedEntry.tsx:135` renders. One is inheritance:
`Step2Verify`'s portaled footer advance takes the same file-local
`SECONDARY_BUTTON` constant as the re-scan button. That was a consistency repair
within a view, not a ruling on the general predicate — which on 2026-08-14 was
still the ledger entry's to make. **The user made it two days later**, and the
fill-equals-container predicate above is that ruling; this paragraph is retained
as the record of what moved before it, and why.

The pair's render path was cited as `RecentAutoAppliedStrip` until the whole-diff
review read it (R2 F2): that strip passes `quiet` to `UndoChangeButton`, whose
quiet branch is borderless, and its bulk row uses a local Undo-all button. The
STYLING shipped was right; the sentence naming where it renders was not.

### 1.3 Status-signal hues (M12.2 Phase A amendment — the one scoped exception to "orange stays alone")

§1 commits to a single brand accent and "no competing accent hue (no blue, no purple, no teal)". The admin redesign (M12.2 Phase A) introduces **one narrowly-scoped exception**: a named **status-signal hue set** for sync/health/review state on the admin dashboard and per-show page. This is a _status_ hue family, **not a second brand accent**, and the exception is bounded by these rules:

- **Where it is allowed:** status **dots** (a few px) and small **status pills** on sync/health/review state only — the `StatusIndicator` component, the dashboard stat strip / shows table / needs-attention inbox, and the review-modal mobile **state badge** (Live / Published / Draft / Archived, `<sm` only — spec 2026-07-24-strip-mobile-stacked-band §3 R0; its Live arm reuses the accent family in the text-safe `accent-on-bg` form for both text and dot). Nowhere else.
- **Never** a CTA, brand surface, large fill, or body-text color outside a status label. The FXAV orange accent remains the only brand accent and keeps its ≤10%-of-viewport coverage cap; the status hues do not count against — and must not visually compete with — the brand accent.
- **Always dot + text paired**, never color-only — honors the §1 color-blind floor (no information carried by hue alone). The `-text` variants exist for the cases where the hue is used _as_ small text (e.g. the tinted "Need review" count).
- **No green as a positive signal.** The "ok / synced / healthy" state uses a **calm desaturated teal-leaning-neutral** (`--color-status-positive`), explicitly NOT green — consistent with §1's red/green color-blind floor. (The originating design prototype used a green `ok` dot; that green is the violation this amendment replaces.)
- **Live** reuses `--color-accent` (orange) for the in-active-window dot; **idle** reuses `--color-text-faint`/`--color-text-subtle`. Only **positive / review / warn** introduce net-new hues, and all three are amber-or-teal status families confined to dots/pills.
- **Red is allowed for one state only: `--color-status-degraded`** (alert-audience-split). The app-health indicator escalates green (positive) → amber (notice, reuses `warn`) → red (degraded), and the worst-active state genuinely needs a distinct alarm hue that reads _above_ amber. This is the **third scoped exception** (after the §1.3 status family and the §1.4 identity palette); it stays inside the same bounds — dots/small pills only, never a CTA/large fill/brand surface, and **always paired with a state label** so the §1 red/green color-blind floor holds (the escalation is never carried by hue alone). The degraded `-text` is white/near-black on the filled red pill; its floor is text-on-fill, computed in §1.2. The telemetry console's **error level badge** (`EventLevelBadge`, `bg-status-degraded text-status-degraded-text` + label, 2026-07-16 accent-contrast pass) is in-scope for this exception: an error-level event IS an app-health worst-state signal, the badge is a small labeled pill, and the solid fill is what escalates error above the amber warn badge without relying on font weight.
- **Data-quality badge — two-glyph split (FLOW4-2/3, 2026-07-17).** The admin shows-table `DataQualityBadge` carries up to two amber chips, each a distinct glyph + visible count: `Users` = "roster changed since last review", `TriangleAlert` = "parse gaps". Both use `--color-status-warn-text`; the two signals are distinguished by **glyph shape + count, never by hue** — upholding the §1 color-blind floor (no information carried by color alone; the two amber signals would be indistinguishable to a low-vision glance if hue were the only carrier). The visible count also dissolves the prior hover/`title`-only dependency for touch/keyboard users; the full class-level breakdown stays in the badge's `aria-label`/`title`. The roster chip renders before the gap chip, matching the accessible-name concatenation order.
- **Section-nav status dots — fill/shape channel (S3C-1, 2026-07-17).** The `ShowReviewSurface` per-section nav dots (rail + chip, review/per-show surfaces) carry redundant non-color channels so review state is never signalled by hue alone (WCAG 1.4.1): **needs-review = filled amber disc** (`bg-status-review`, higher salience), **no-issues = hollow teal ring** (`border-[1.5px] border-status-positive`, transparent center, recedes). Both occupy an identical 8px box (border-box) so a section flipping clean↔flagged never reflows the row. The dots are `aria-hidden`; the paired text equivalent is an `sr-only` " — needs review" / " — no issues" suffix on the nav control's accessible name. Token values unchanged.
- **Auto-applied kind dots — destructive minus-bar shape channel (KINDDOT-1, 2026-07-17).** In `RecentAutoAppliedStrip`'s collapsed-group `KindDotCluster`, change-kind hues can collide for color-limited vision (`crew_removed` = `bg-status-warn` amber vs `crew_renamed` = `bg-status-review` amber are near-identical). The **destructive `crew_removed`** marker therefore renders as a **shape-distinct centered minus-bar** (`h-0.5 w-2 rounded-full bg-status-warn` inside a `flex size-2 items-center justify-center` wrapper — a "−" = removed), while every non-destructive kind stays a **filled `size-2 rounded-full` disc**. This deliberately uses a *third* shape beyond S3C-1's filled-disc/hollow-ring pair because the minus glyph carries the "removed" semantic that a ring would not; the box stays 8px so it aligns with sibling discs (no reflow). Markers are `aria-hidden`; the cluster's `aria-label` names every kind (incl. "Removed"). Token values unchanged.
- **Attention-pill leading and segment marks — the radius/clip/fill channel (PILLMARK-1, 2026-08-30).** Below `sm` the review-modal attention pill renders COUNTS ONLY (Eric's Decision 7), which removes the noun that told "3 issues" apart from "3 sheet warnings". The mark therefore carries the whole distinction on a phone, and it carries it in SHAPE because no ink can: `--color-status-review` is a mid-tone amber (#a87716 light / #e0b84e dark) and nine candidate tokens were measured against it with none clearing the ≥3:1 non-text floor in BOTH modes (`border-text-faint`, the shipped attempt, measures 1.179:1 light / 2.522:1 dark against that fill). The vocabulary is three glyphs in one 8px box, so nothing reflows: **issues = filled CIRCLE** (`rounded-pill bg-status-review`), **sheet warnings = filled TRIANGLE** (`bg-status-review` + a `clip-path` polygon; a triangle rather than a square because KINDDOT-1 already settled that a third shape must CARRY a semantic, and a warning triangle does while a square is a difference without a meaning), **monitoring = hollow teal ring** (`border-[1.5px] border-status-positive bg-transparent`). Issues and warnings deliberately SHARE a fill so hue is provably not the carrier; `tests/e2e/published-review-modal.layout.spec.ts` T-MARK-GEOMETRY asserts that from computed `border-radius`, `clip-path` and `background-color` in a real browser, never from class strings. Exactly ONE mark renders per visible segment: the LEADING mark is the first segment's, and each later segment carries its own (`attention-pill-warnings-segment`, `attention-pill-monitoring-segment`) suppressed when it is itself the leader, so a pill never shows two of the same glyph. Below `sm` the middot separators go `max-sm:sr-only` — zero visual width so the segment marks pay for themselves, while the glyph stays in the announced string.
- **The hollow ring is scoped by SURFACE, not global (PILLMARK-1 corollary).** A hollow ring means "monitoring, clearing on its own" on the published pill (teal, `status-positive`) and "judgment call, you must decide" on the wizard step-3 pill (neutral, `text-faint` on `surface-sunken`, measured 3.02:1 / 4.11:1 in §1.2). Same silhouette, near-opposite call to action, distinguished by tone and by which surface you are on. Recorded rather than unified because the two pills are never co-present; if they ever are, this pair is the first thing to reconcile.
- **Synced-dot heartbeat pulse (SYNC-PULSE-1, 2026-07-17).** The POSITIVE (ok/synced) status dot on the two sync surfaces — the dashboard Sync column (`StatusIndicator` in `ShowsTable`) and the per-show `StatusStrip` sync dot — carries an opt-in subtle "heartbeat" halo (`@keyframes sync-heartbeat`, scale 2 / 2.8s / peak opacity 0.4, `bg-status-positive`) signalling "healthy + actively being checked". It is deliberately slower and smaller than the **live** dot's `animate-ping` (live stays the stronger, faster signal so the two never read as equivalent), and is suppressed under `prefers-reduced-motion` via `motion-reduce:hidden`. Opt-in through the `pulse` prop on `StatusDot`/`StatusIndicator`; a no-op on every non-positive status, so generic positive pills/badges (Published, auto-applied) never inherit it. The pulse is a **motion channel only** — it introduces no new token and reuses the existing `--color-status-positive` fill (whose dark value is separately brightened this same day per §1.1), so no hue carries information alone (§1 color-blind floor holds).

The token rows are in §1.1 and the computed AA contrast figures (both modes, WCAG relative-luminance formula) are in §1.2: every status **dot** clears the ≥3:1 graphical-object floor and every status **`-text`** variant clears the ≥4.5:1 AA body floor, on both `--color-bg` and `--color-surface`, in light and dark. `tests/styles/status-token-contrast.test.ts` pins these floors against the live `app/globals.css` values.

### 1.4 Identity-avatar palette (2026-06-19 amendment — the second scoped exception to "orange stays alone")

§1 commits to a single brand accent and "no competing accent hue". The crew mock-fidelity work introduces **one more narrowly-scoped exception**: identity avatars (crew members and contacts) carry a **deterministic per-person color** drawn from a fixed 8-swatch palette. This is an _identity_ signal — a stable visual handle for a person — **not a second brand accent**, and it is bounded by these rules:

- **Where it is allowed:** the circular **identity-avatar chip** only (crew roster, contacts, the per-show crew page). The chip is a colored disc with the person's white initials. Nowhere else. The single FXAV orange accent still governs **all other chrome** — buttons, pills, links, focus rings, the hero, the live indicator, the "today" pin, the brand mark — and keeps its ≤10%-of-viewport coverage cap.
- **Derived from the NAME, never a render index.** The swatch is a stable hash of the normalized (trimmed, lowercased, whitespace-collapsed) name, so the same person gets the same color across renders, sessions, and surfaces. A blank/whitespace name falls back to the **slate** swatch.
- **White initials on every swatch; AA-guarded.** Every swatch is pre-measured ≥4.5:1 against `#FFFFFF` white avatar text (WCAG relative-luminance). The measured ratios (all comfortably above the 4.5:1 AA floor):

  | Swatch    | Hex       | Contrast vs `#FFFFFF` |
  | --------- | --------- | --------------------- |
  | orange    | `#9A4A00` | 6.26:1                |
  | green     | `#1B6B43` | 6.50:1                |
  | blue      | `#2657B0` | 6.83:1                |
  | violet    | `#6A40C0` | 6.76:1                |
  | rose      | `#A1322C` | 6.98:1                |
  | teal      | `#136B6B` | 6.28:1                |
  | amber     | `#86591A` | 6.07:1                |
  | slate     | `#515763` | 7.26:1 (also the blank-name fallback) |

- **Single source of truth.** `lib/crew/avatarColor.ts` owns the palette (`AVATAR_PALETTE`) and the name→swatch function (`avatarColor`). `tests/crew/avatarColor.test.ts` is the AA guard — it recomputes the contrast of every swatch against white and fails CI if any swatch drops below 4.5:1, and pins determinism, case/space-insensitivity, and the blank→slate fallback.

---

## 2. Typography

### 2.1 Family commitment

**Inter** — single contemporary sans for all UI. One family, no display/body pairing. Declared in `app/fonts.css` as a hand-written `@font-face` over `public/fonts/InterVariable-latin.woff2` — a latin + latin-ext subset of the upstream Inter release, built by `scripts/subset-inter.sh` — and imported by BOTH Next roots: `app/layout.tsx` and `app/global-error.tsx`, which renders its own `<html>` and replaces the root layout on a fatal error. The same stylesheet is read by `compileEntryCss`, so the 32 standalone e2e harnesses measure the face the product renders instead of the ambient host font (`BL-HARNESS-FONT-FIDELITY`). (Until 2026-08-03 this line read "a future task wires this up"; the task was `BL-HEADER-FONT-FALLBACK-WRAP`, and until it landed only the crew route tree rendered Inter while admin, auth, help and the crash screen fell through to the host system font. It then read `next/font/google` until `BL-INTER-NUMERAL-DISAMBIGUATION` the same day — the build Google Fonts serves has Inter's character variants and stylistic sets stripped, so §2.4's feature contract was declaring tags no served font could honor — and `next/font/local` until 2026-08-04, when self-hosting the declaration made the harnesses read it too. The TYPEFACE commitment is unchanged throughout; only the delivery mechanism moved. The file is subset rather than shipped whole because the verbatim 344 KB release, being preloaded, measured FCP +136-164ms and a fallback-to-Inter swap landing 3.7s in on slow 4G.)

Why Inter: PRODUCT.md explicitly lists Inter as one of three acceptable starting points and says "pick one and commit." Inter is the most reliable tabular-figure-strong sans on the web — `font-feature-settings: 'tnum'` is fully implemented in every modern browser, all of weights 400/500/600/700 ship with even spacing, and it has explicit display-vs-text optical sizing built in — an `opsz` axis spanning 14–32, which `font-optical-sizing: auto` picks up by default. That axis is **absent from the Google Fonts build** and present only because we vendor the upstream release; `tests/styles/fontFeatureAvailability.test.ts` asserts it still ships, so this sentence cannot quietly become false again. Geist (next pick) lacks the same `tnum` reliability across iOS Safari versions; General Sans is licensed.

Tradeoff acknowledged: Inter is the most-used webfont on the modern internet. The "AI slop" risk per shared design laws is real. We compensate by using Inter at distinctive **weights and sizes** (large, confident headline numbers; consistent 500/600 hierarchy rather than the default 400/700 split that creates SaaS-look) and by leaning on the page's structural rhythm — generous spacing, asymmetric hero, FXAV orange accent — to carry character. The font is the canvas, not the personality.

Fallback stack: the generated family, its generated companion, then `ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Helvetica Neue", sans-serif`. The first two are **read from `--font-inter`** by everything that consumes the stack: `app/globals.css` names the token, never a family, and `tests/e2e/font-binding.spec.ts` reads BOTH names out of that token rather than spelling either. The pair is `Inter, Inter Fallback`, declared in `app/fonts.css`.

That sentence used to end "nothing may depend on either spelling", which was true while a loader GENERATED the names — the local loader lowercased them from its module variable, so the pair was `inter, inter Fallback`. Self-hosting makes the names authored rather than generated, and two guards now depend on them deliberately: `tests/styles/fontLoading.test.ts` pins the `var()` fallback literal to the declared family, and `compileEntryCss`'s post-step anchors its rewrite on the exact `src` and `font-display` strings and THROWS if either stops matching. Depending on an authored constant that a guard pins is a different thing from depending on a generated one that can silently change.

The companion is not a hand-picked face: it reproduces verbatim what `next/font` generated from this binary before the mechanism swap, from `local(Arial)` with `size-adjust` and `ascent-override` tuned to Inter's metrics (measured from a clean build: `ascent-override: 89.79%`, `descent-override: 22.36%`, `line-gap-override: 0%`, `size-adjust: 107.89%`), so the `display: "swap"` window swaps with far less reflow. **Far less, not none** — metric overrides narrow the mismatch but cannot equalise per-string advances, and a residual shift remains. It is therefore second, ahead of the system stack. `app/globals.css` reaches both through `var(--font-inter, "Inter", "Inter Fallback")` rather than naming them literally, so the token stays the single source. The literals in that `var()` fallback are a safety net: `compileEntryCss` appends `app/fonts.css` whole to every harness stylesheet, so the harnesses resolve the same token the app does, and the literals are reached only by a surface that somehow lacks it. `tests/styles/fontLoading.test.ts` pins the first literal to the family `app/fonts.css` declares, so if it is ever the thing that resolves it names a face that exists (`BL-HARNESS-FONT-FIDELITY`). Omitting this entry is not cosmetic: measured on a real string, first paint rendered 187.28px and then snapped to 168.91px, about 10%, on every React-root route.

### 2.2 Size scale

Modular ratio ≈ 1.25 (major third) between adjacent steps. All sizes are in `rem` (root = 16px). Line-height pairs are tuned per-step, not auto-derived.

| Token            | Size  | Line-height | Tracking   | Use                                                                                                     |
| ---------------- | ----- | ----------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| `--text-xs`      | 0.75  | 1.4         | `0`        | Captions, "as of …" timestamps, footer fine print.                                                      |
| `--text-sm`      | 0.875 | 1.45        | `0`        | Tile body text, secondary labels.                                                                       |
| `--text-base`    | 1.0   | 1.55        | `-0.005em` | Default body — primary tile content, paragraph text.                                                    |
| `--text-lg`      | 1.125 | 1.5         | `-0.005em` | Tile titles, sub-headlines.                                                                             |
| `--text-xl`      | 1.25  | 1.4         | `-0.01em`  | Section headers ("My schedule", "Hotel & travel").                                                      |
| `--text-2xl`     | 1.5   | 1.3         | `-0.012em` | Page title (Doug's show name on `/show/[slug]`).                                                        |
| `--text-3xl`     | 1.875 | 1.2         | `-0.015em` | The Right Now card primary line ("Today: Show day 2 of 3").                                             |
| `--text-4xl`     | 2.5   | 1.1         | `-0.02em`  | Mobile hero number — call time, room name when set as the focal element.                                |
| `--text-display` | 3.5   | 1.05        | `-0.025em` | Reserved. Currently unused; available if a tile wants a hero metric (e.g., `8:00 AM`) at desktop sizes. |

### 2.3 Weight scale

| Token             | Value | Use                                                                     |
| ----------------- | ----- | ----------------------------------------------------------------------- |
| `--font-regular`  | 400   | Long-form body text, descriptions.                                      |
| `--font-medium`   | 500   | Default UI body — primary tile content, button labels at sm.            |
| `--font-semibold` | 600   | Tile titles, buttons at base+, all numbers (call times, dates, counts). |
| `--font-bold`     | 700   | Page titles, the Right Now headline, strongest emphasis.                |

Hierarchy is built from weight + size contrast (≥1.25 size ratio between steps). No flat scales.

### 2.4 Tabular figures (mandatory)

Every time, date, count, confirmation number, and quantity uses `font-feature-settings: 'ss04' 1, 'tnum' 1`, applied via the `.tabular-nums` class (Tailwind v4 ships it) or the `<time>` element, both of which `app/globals.css` targets in one rule.

**Codes get one thing more.** A value someone reads off the screen and types or says back — a hotel confirmation number, a flight record locator, a service-account address — uses `.code-value`, which adds `'zero' 1` on top. There the cost of confusing `0` with `O` is a failed check-in, not a moment's hesitation.

`.code-value` is deliberately NARROWER than `.tabular-nums`, and the distinction is load-bearing. `.tabular-nums` means "digits that should not shift width", which in this codebase includes whole prose sentences: the Right Now hero's lead is a 30px bold `<h2>` carrying it, and the footer's copyright year carries it too. `'zero' 1` shipped on the shared rule for exactly one review round and rendered *"Today: Show day 1**0** of 12"* in the product's single most expressive moment — a terminal readout where the brand calls for calm competence, against the explicit "not techie" anti-reference in `PRODUCT.md`. Slash what gets transcribed; leave what gets glanced at alone.

`'ss04' 1` is **repeated** from the `html` rule, deliberately. `font-feature-settings` inherits as a whole value rather than as a merged list, so any rule that sets it REPLACES what it inherited — without the repeat, a `.tabular-nums` span containing letters (`A1 · Audio Lead`, a stage label, a plate number) would silently lose the disambiguation every span around it keeps. `tests/styles/fontFeatureAvailability.test.ts` pins this structurally, so a fourth rule added later cannot reintroduce the hole quietly.

Apply at the smallest semantic boundary — the `<time>` element, the `.call-time` span — not the entire tile, so non-numeric copy keeps default proportional metrics.

`'zero' 1` slashes the zero, separating `0` from `O`. It lives on `.code-value` alone, not on `html` and not on the shared tabular rule, so the slash reaches only a value that gets transcribed and never running prose. `'ss04' 1` is Inter's own "disambiguation without zero": capital `I` gains serifs and lowercase `l` gains a tail, which is why it lives at `html` (see §2.1) and is merely repeated here. Crew read these on a phone in direct sun, and Doug reads confirmation numbers mid-show on a venue floor, where `I`, `l` and `1` collapse into one stem.

**One documented exception.** `code`, `kbd`, `samp` and `pre` do NOT get `ss04`: Tailwind's preflight resets `font-feature-settings` on those elements, and it also gives them a monospace family — where `I`, `l` and `1` are already distinct by design, so the disambiguation has nothing to add. `.code-value` is a class and still wins on any element that opts in, which is why the wizard's service-account `<code>` renders correctly. `tests/styles/fontFeatureAvailability.test.ts` pins this exception against the COMPILED stylesheet, so a new reset in `app/globals.css` or in anything Tailwind emits fails the build. "Any source" would overstate it: the guard compiles the one first-party stylesheet this product has, and a separate assertion fails the build if a second one ever appears, rather than letting it open a blind spot.

This paragraph named `cv11` until 2026-08-03, claiming a single-storey 'a' improved call-time legibility. That was never true in the product: `cv11` is absent from the Google Fonts build, so the declaration rendered nothing from 2026-05-03 until it was deleted. The lesson is the guard, not the tag — a feature declared against a font that cannot honor it is completely silent, so `tests/styles/fontFeatureAvailability.test.ts` now fails the build instead.

### 2.5 Long-form constraints

- Body line length: cap at **65–75ch**. Tile copy will rarely hit this; the cap matters for the Right Now card body and admin paragraphs.
- No serif body. PRODUCT.md explicitly rejects this — it pulls toward the paper-skeuomorph aesthetic the project is replacing.

### 2.6 Eyebrow letter-spacing tokens (M9 M4-D5 consolidation)

Uppercase eyebrow labels (`text-xs uppercase` + meta-label voice) use one of two named letter-spacing tokens — never an arbitrary inline square-bracket value:

| Token                       | em      | Use                                                                                                                                                                                                                                              |
| --------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--tracking-eyebrow`        | 0.12em  | Standard eyebrow voice — KeyValue dt, Section heading eyebrow, tile field labels (Schedule day labels, Contacts kind, etc.), admin StagedReviewCard source kicker.                                                                               |
| `--tracking-eyebrow-strong` | 0.18em  | Emphasis eyebrow — Right Now card "RIGHT NOW" tag, Footer FXAV wordmark, Header crew tag.                                                                                                                                                        |
| `--tracking-page-title`     | -0.02em | Admin page-title (`AdminPageHeader` h1) — matches the admin design bundle's `.page-title` letter-spacing (M12.8). Distinct from Tailwind's `tracking-tight` (-0.025em); named here because the meta-test bans the inline arbitrary bracket form. |
| `--tracking-daynum`         | -0.03em | Schedule `DayCard` day-number badge (`.dnum`, a large extrabold display number, not an eyebrow). Preserves the exact value the badge has always used; named here (not an inline `tracking-[-0.03em]`) because the meta-test bans the arbitrary bracket form. |

The consolidation absorbed four prior inline values (0.12 / 0.14 / 0.18 / 0.22em) into two semantic tokens. `tests/styles/eyebrow-tracking.test.ts` enforces the contract — adding a new arbitrary square-bracket tracking value to any source file under `components/` or `app/` (ts/tsx/js/jsx/css) fails the build. If a future surface genuinely needs a different tracking value, declare it as a named token in `app/globals.css` `@theme` and add a row to the table above before using it. Non-arbitrary Tailwind defaults (`tracking-wide`, `tracking-tight`, etc.) are not in scope for this meta-test — they're used elsewhere for non-eyebrow surfaces (display headings use `tracking-tight`); the meta-test specifically targets the bracket-form arbitrary leak class that R1 reviewer caught.

---

## 3. Spacing scale

Tailwind v4's default 4px-step scale (1 = 4px, 2 = 8px, 3 = 12px, 4 = 16px, 6 = 24px, 8 = 32px, 12 = 48px, 16 = 64px, 24 = 96px, 60 = 240px) is the baseline. We extend with project-named tokens:

| Token                        | Value | Use                                                                                                                                                                                                                                            |
| ---------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--spacing-tap-min`          | 44px  | Minimum tap-target dimension. Every interactive element (button, link, toggle, accordion handle) ≥44×44px.                                                                                                                                     |
| `--spacing-header-link-slot` | 30px  | The review-panel section header's right-corner sheet-link slot: the link's own 20px box plus the row's 10px `gap-2.5`. A section with no link carries it as padding on the centred name group, so the name lands on the same axis as one that has a link (+4px either way, versus +19px without it). (Narrow-only as of 2026-07-26: at `sm`+ the name is left-aligned and no compensation applies.) |
| `--spacing-tile-pad`         | 20px  | Internal padding on a tile. Comfortable, not cramped (per `PRODUCT.md`).                                                                                                                                                                       |
| `--spacing-tile-gap`         | 16px  | Grid gap between tiles. Visual rhythm, not crowded.                                                                                                                                                                                            |
| `--spacing-section-gap`      | 32px  | Gap between major page sections (Right Now card → tile grid → footer).                                                                                                                                                                         |
| `--spacing-tile-min-h`       | 96px  | Tile minimum height (per spec §8.4 — `min-h-24` in Tailwind units).                                                                                                                                                                            |
| `--spacing-tile-overflow`    | 240px | Tile body max before "see more" disclosure (per spec §8.4 — `max-h-60`).                                                                                                                                                                       |
| `--spacing-right-now-min-h`  | 176px | Right Now card minimum height. Holds the container fixed during the §8.2 AnimatePresence crossfade so body content swaps without the card resizing. Sized to the tallest state body (`unknown`, two-line detail) at the 390px mobile viewport. |
| `--spacing-page-pad-mobile`  | 16px  | Page-level horizontal padding on mobile (<640px).                                                                                                                                                                                              |
| `--spacing-page-pad-desktop` | 32px  | Page-level horizontal padding on desktop (≥1024px).                                                                                                                                                                                            |
| `--spacing-panel-max`        | 480px | Shared max extent for wide secondary "panel"-class surfaces: the dashboard Needs-Attention inbox column (`min-[1400px]:w-panel-max`), the report modal (`max-w-panel-max`), and the notification panel's desktop scroll container (`sm:max-h-panel-max`). One value → one token (the `--spacing-*` namespace generates `w-*`/`max-w-*`/`max-h-*` alike). |
| `--spacing-panel-max-mobile` | 70vh  | Notification panel (`BellPanel`) scroll-container max-height on mobile — a bottom-sheet capped to 70vh so the drag handle + header stay on-screen. Bell-specific; consumed via `max-h-panel-max-mobile`. |

> **Tailwind v4 naming note:** the `--spacing-*` prefix is non-arbitrary — Tailwind v4's arbitrary-value `min-h-(--name)` / `p-(--name)` arrows resolve ONLY tokens declared in the `--spacing-*` namespace (declared in `app/globals.css` `@theme`). Renaming any of these to `--space-*` would silently break the Tailwind-utility consumption sites (e.g., `min-h-(--spacing-right-now-min-h)` in `components/crew/RightNowHero.tsx`).

### 3.1 Spacing rhythm

Per shared design laws: **vary spacing for rhythm; same padding everywhere is monotony.** Tile internal padding (`20px`) > grid gap (`16px`) > border-radius (`12px`) creates a deliberate cascade. Section spacing (`32px`) is intentionally larger than tile spacing — the page reads as **chapters, not a uniform grid**. The Right Now card's padding (`24px`) is one step above tiles to mark it as the primary moment.

---

## 4. Radii

Soft, but not consumer-app-rounded. PRODUCT.md rejects "rounded-everything" cliché.

| Token           | Value | Use                                                                                                                       |
| --------------- | ----- | ------------------------------------------------------------------------------------------------------------------------- |
| `--radius-sm`   | 6px   | Buttons, badges, inline pills, small chips.                                                                               |
| `--radius-md`   | 12px  | Tiles, the Right Now card, admin form fields.                                                                             |
| `--radius-lg`   | 16px  | Modal/dialog surfaces. Used sparingly — modals are an absolute-ban anti-pattern unless inline alternatives are exhausted. |
| `--radius-pill` | 999px | Status pills ("Live", "Today"), avatar dots.                                                                              |

---

## 5. Motion

### 5.1 Timing scale

| Token                | Value | Use                                                                                             |
| -------------------- | ----- | ----------------------------------------------------------------------------------------------- |
| `--duration-instant` | 0ms   | Sentinel for "intentionally not animated." (Stale-tint morph, focus rings.)                     |
| `--duration-fast`    | 120ms | Hover, press, ring-show. Micro-interactions.                                                    |
| `--duration-normal`  | 220ms | Card crossfades, accordion expand, "see more" disclosure.                                       |
| `--duration-slow`    | 360ms | Right Now card state transitions (`pre_travel` → `travel_in_day` body crossfade per spec §8.2). |

### 5.2 Easing

| Token              | Curve                            | Use                                               |
| ------------------ | -------------------------------- | ------------------------------------------------- |
| `--ease-out-quart` | `cubic-bezier(0.25, 1, 0.5, 1)`  | Default — entry, expand, fade-in.                 |
| `--ease-out-expo`  | `cubic-bezier(0.16, 1, 0.3, 1)`  | Larger movements (Right Now card crossfade).      |
| `--ease-in-out`    | `cubic-bezier(0.65, 0, 0.35, 1)` | Two-way state changes that need symmetric in/out. |

**Bans:** no bounce, no elastic, no spring overshoot. Per shared design laws and PRODUCT.md's "deliberate, never showy."

### 5.3 `prefers-reduced-motion` discipline

Every motion token must be wrapped in a media-query reduction. The pattern is:

```css
@media (prefers-reduced-motion: reduce) {
  --duration-fast: 0ms;
  --duration-normal: 0ms;
  --duration-slow: 0ms;
}
```

This is implemented in `app/globals.css` `:root` block. Components do NOT need to opt in — they get reduction for free as long as they consume the duration tokens (not hardcoded ms values). Spec §8.2 motion contracts (crossfade body, morph-to-last-good for sync errors) all consume `--duration-normal` / `--duration-slow`.

Tailwind `duration-<name>` utility classes (`duration-fast`, `duration-normal`, …) are equally covered: the `@theme` block chains `--transition-duration-<name>: var(--duration-<name>)` aliases (Tailwind v4 resolves the utility from the `--transition-duration-*` namespace), so a class site and a direct `var(--duration-*)` site get identical values and identical reduced-motion collapse. Guarded by `tests/design/durationTokenEmission.test.ts` (compile emission + chain) and the crew sub-nav computed-value e2e assertion. Elements with a bare `transition-*` utility and NO named duration class resolve Tailwind's default through the `@theme` alias `--default-transition-duration: var(--duration-fast)` (2026-08-01, focus-ring pass spec §5) — 120ms normally, 0ms under reduced motion — so bare sites are inside the collapse too; a named `duration-<name>` class still wins where a different speed is intended (disclosure chevrons carry `duration-normal`).

### 5.4 Layout-property ban

Don't animate `width`, `height`, `padding`, `margin`, `top`, `left`, etc. — they trigger layout. Use `transform`, `opacity`, and `filter`. The Right Now card crossfade is `opacity` + a 4px `translateY`; the "see more" disclosure is `max-height` (the documented exception, since explicit `max-height` doesn't trigger reflow on siblings).

### 5.5 Interaction constants

**The timing population below is DERIVED, not hand-listed.** `scripts/scan-interaction-timings.ts`
reads `app/**` + `components/**` (minus `app/api/**`, which is server budgets rather than
interaction timing) and reports every numeric-literal `setTimeout`/`setInterval` delay, every
numeric binding whose name ends in ms / delay / duration / timeout / seconds, and every numeric
motion `duration:`. `tests/docs/_metaInteractionTimingInventory.test.ts` compares that output to
this table in BOTH directions, so a timing added without a row here fails, and a row here that no
longer exists in the source fails too. Regenerate with `pnpm exec tsx scripts/scan-interaction-timings.cli.ts`.

A hand-written list was the previous shape and it could not work: a sweep and a test generated from
that sweep share the same omissions, so the two agree about a world neither checked.

Every timer delay in the universe is literal, resolved to one of these constants, or named in the
scanner's `UNCLASSIFIED_DISPOSITIONS` with a reason. None passes silently. The four current
dispositions are a hook option, a sum of two rows below, a server-dictated `Retry-After`, and the
realtime reconnect backoff.

| constant | value | owning file |
| --- | --- | --- |
| `WATCHDOG_MS` | 12000 | `app/admin/settings/admins/RevokeRowButton.tsx` |
| `SUCCESS_DISMISS_MS` | 5000 | `app/admin/show/[slug]/PickerResetControl.tsx` |
| `CLEAR_AFTER_MS` | 2000 | `app/help/_components/RefAnchor.tsx` |
| `CLOSE_DELAY_MS` | 120 | `components/admin/HoverHelp.tsx` |
| `ANNOUNCE_LOG_TTL_MS` | 30000 | `components/admin/announceLog.tsx` |
| `ERROR_AUTO_CLEAR_MS` | 6000 | `components/admin/dev/DevCaptureControl.tsx` |
| `DURATION_NORMAL_FALLBACK_MS` | 220 | `components/admin/review/ReviewModalShell.tsx` |
| `DURATION_FAST_FALLBACK_MS` | 120 | `components/admin/review/ReviewModalShell.tsx` |
| `EXIT_FALLBACK_BUFFER_MS` | 80 | `components/admin/review/ReviewModalShell.tsx` |
| `timer(0)` | 0 | `components/admin/review/ReviewModalShell.tsx` |
| `NAV_SCROLL_SETTLE_TIMEOUT_MS` | 700 | `components/admin/review/ShowReviewSurface.tsx` |
| `SECTION_FRESHNESS_FLASH_MS` | 1600 | `components/admin/review/sectionFreshness.ts` |
| `BUSY_GATE_MAX_MS` | 15000 | `components/admin/showpage/ShareHub.tsx` |
| `SHARE_LINK_FLASH_MS` | 1600 | `components/admin/showpage/ShareHub.tsx` |
| `AUTO_REFRESH_MS` | 20000 | `components/admin/telemetry/AutoRefreshControl.tsx` |
| `timer(1000)` | 1000 | `components/admin/telemetry/AutoRefreshControl.tsx` |
| `WIZARD_COPY_FEEDBACK_RESET_MS` | 2200 | `components/admin/wizard/Step1Share.tsx` |
| `WARNING_HIGHLIGHT_MS` | 1600 | `components/admin/wizard/Step3ReviewModal.tsx` |
| `timer(5000)` | 5000 | `components/admin/wizard/step3ReviewSections.tsx` |
| `AGENDA_RETRY_FALLBACK_MS` | 5000 | `components/admin/wizard/step3ReviewSections.tsx` |
| `timer(60000)` | 60000 | `components/crew/RightNowHero.tsx` |
| `duration(0)` | 0 | `components/crew/RightNowHero.tsx` |
| `DEMOTE_CHIP_VISIBLE_MS` | 6000 | `components/diagrams/GalleryLightbox.tsx` |
| `RETRY_CHECK_IN_MS` | 30000 | `components/diagrams/GalleryLightbox.tsx` |
| `timer(150)` | 150 | `components/diagrams/GalleryLightbox.tsx` |
| `duration(0.22)` | 0.22 | `components/layout/PageTransition.tsx` |
| `DEBOUNCE_MS` | 100 | `components/realtime/ShowRealtimeBridge.tsx` |
| `submitTimeoutMs` | 30000 | `components/shared/ReportModal.tsx` |
| `PENDING_TIMEOUT_MS` | 8000 | `components/shared/pendingTimeout.ts` |
| `ARM_REVERT_MS` | 4000 | `lib/admin/destructiveConfirm.ts` |
| `COPY_FEEDBACK_RESET_MS` | 2000 | `lib/ui/copyFeedback.ts` |
 | `ANNOUNCE_DELAY_MS` | 400 | `components/admin/wizard/DraftRestoredNote.tsx` |
 | `DRAFT_RESTORED_NOTE_MS` | 5000 | `components/admin/wizard/DraftRestoredNote.tsx` |

Rows written `timer(N)` / `duration(N)` are inline literals rather than named constants; the file
column is where they live.

The rest of this section is the RATIONALE for the values that need one, plus the px thresholds that
are not timings at all. They fall into two kinds, and the distinction matters for section 10's
hardcoding ban:

**Behavioral thresholds** — gesture and scroll values that never produce a painted px, so the ban genuinely does not apply, and which for the same reason carry no row in the derived table above (they are distances and tolerances, not timings; only `NAV_SCROLL_SETTLE_TIMEOUT_MS` is both). The Phase-1 extraction moved these out of `Step3ReviewModal.tsx`, which this section went on claiming until the derived inventory contradicted it; each owning file is now named per entry:

- `SCROLL_SPY_OFFSET_PX = 90` (`components/admin/review/ShowReviewSurface.tsx`) — the review modal's scroll-spy anchor line: a section becomes "active" once its top passes this many px below the content pane's top.
- `DRAG_DISMISS_THRESHOLD_PX = 110` (`components/admin/review/ReviewModalShell.tsx`) — sheet-mode drag distance past which release dismisses the modal.
- `DRAG_SLOP_PX = 6` (`components/admin/review/ReviewModalShell.tsx`) — max pointer travel still treated as a tap (click) rather than a drag.
- `NAV_SCROLL_SETTLE_TIMEOUT_MS = 700` (`components/admin/review/ShowReviewSurface.tsx`) — review-modal nav click / warning jump: fallback release of the scroll-spy suppression when a programmatic glide never settles.
- `NAV_SCROLL_SETTLE_EPSILON_PX = 2` (`components/admin/review/ShowReviewSurface.tsx`) — settle tolerance (px) that releases the nav-click scroll-spy suppression.

**Animation durations** — these DO paint. They are exempt from the `--duration-*` token scale only because they exceed its longest step (`--duration-slow`, 360ms), which is why each carries an explicit `prefers-reduced-motion` override rather than inheriting the global collapse (§5.3). Both are paired with a keyframe in `app/globals.css` and pinned against it by a drift test:

- `WARNING_HIGHLIGHT_MS = 1600` (`components/admin/wizard/Step3ReviewModal.tsx`) — one-shot warning-row highlight after a callout jump-link; keyframe `step3-warning-flash`. Reduced motion: a steady tint, correct for a persistent jump-target the user must still locate.
- `SHARE_LINK_FLASH_MS = 1600` (`components/admin/showpage/ShareHub.tsx`) — one-shot highlight on the crew-URL block when the share-token changes; keyframes `share-link-flash-bg` and `share-link-flash-ring`. Reduced motion: NO cue at all, deliberately unlike the row above — a one-shot "this just changed" signal has no correct steady state, and a permanent tint would assert something no longer true.
- `SECTION_FRESHNESS_FLASH_MS = 1600` (`components/admin/review/sectionFreshness.ts`) — one-shot cue on the panel card of each published-review-modal section whose content changed across a realtime refresh, or on the sub-header band when the change count clears the cap; keyframes `section-freshness-flash-1` / `-2`. The pair exists because changing an attribute value does not restart a CSS animation and a key-based remount would destroy the card's scroll position and focus, so alternating the value changes `animation-name` instead. Reduced motion: NO cue, same reasoning as the row above; the sr-only announcement carries the information there and is motion-independent.

**The share-link cue** draws a 2px `accent-edge` ring around the crew-URL block plus a brief `accent-tint` wash that holds to 45% then settles back to `surface-sunken`. Measured contrast at the cue's peak and at rest, both themes: `text-strong` on `accent-tint` 16.88:1 light / 14.66:1 dark (AA 4.5:1); ring against `accent-tint` 7.41:1 / 8.03:1, against `surface` 8.42:1 / 8.84:1, against `surface-sunken` 7.59:1 / 9.65:1 (non-text 3:1). Pinned in `tests/styles/status-token-contrast.test.ts` — and note the ring is NOT decorative in dark, where it is the change signal itself, so it carries its own floor rather than deferring to the accent track's.

**The section freshness cue** is a 2px `accent-edge` OUTLINE, held to 45% then faded, and nothing else. An outline rather than a border or a box-shadow because the card already owns a border that switches tone when the section is flagged, plus its own tile shadow, so the outline is the only layout-neutral marker that composes with both; it draws outside the border box, which the content pane's `p-tile-pad` leaves room for.

**It shipped with an `accent-tint` wash as well, and design review removed it.** Two reasons, both worth keeping written down. PRODUCT.md reserves the orange for "this matters now" and spends it sparingly, and a background reconcile is informational: a full-card wash on a 390px phone can be the entire viewport shouting about a sync. And the wash was occluded unevenly, because cards hold opaque children (`surface-sunken` tiles, nested cards, warning callouts), so a sparse section washed fully while a dense one showed colour only in the gaps and the same event read at very different loudness. The outline renders identically on every card, so it is the whole cue.

Measured contrast, both themes: outline against `surface` 8.42:1 / 8.84:1, which is the ground for BOTH the card and the sub-header band it marks over the cap (`ReviewModalShell.tsx:682`); and against `surface-sunken` 7.59:1 / 9.65:1, pinned as the defensive second ground so a future band retune cannot drop the cue below floor unnoticed. Non-text floor 3:1. Pinned in `tests/styles/status-token-contrast.test.ts`.

---

## 6. Breakpoints

Match spec §8.4 grid contract exactly.

| Token     | Value  | Use                                                                        |
| --------- | ------ | -------------------------------------------------------------------------- |
| `--bp-sm` | 640px  | Tile grid: 2 cols → 3 cols transition. Mobile target viewport is 390px.    |
| `--bp-lg` | 1024px | Tile grid: 3 cols → 4 cols transition. Desktop posture begins.             |
| `--bp-xl` | 1200px | Container max-width on the widest desktop. Page caps here, doesn't sprawl. |

Tailwind v4 maps these to `sm:`, `lg:`, `xl:` utility prefixes via `@theme` `--breakpoint-*` tokens.

---

## 7. Tailwind v4 layout gotcha — `align-items: stretch` is NOT default

**Critical for every tile-grid task:** Tailwind v4's `.flex` does NOT set `align-items: stretch` by default. Spec §8.4 requires "tiles within a row stretch to equal height" — this MUST be expressed explicitly:

- The grid container needs `items-stretch` (Tailwind utility) OR `align-items: stretch` (raw CSS).
- Each tile needs `h-full` (Tailwind) OR `height: 100%` (raw CSS) to actually consume the stretched cell.

Without both, tiles collapse to their intrinsic content height and the spec §8.4 dimensional invariant fails.

This gotcha is the single most common failure mode on this project's UI work — see `memory/feedback_tailwind_v4_flex_items_stretch.md`. Every tile component's spec must call out the parent → child stretch relationship explicitly, and the M4 layout-dimensions Playwright task (the in-browser `getBoundingClientRect()` assertion) verifies it. jsdom is NOT sufficient — it doesn't compute real layout.

> **Amendment (2026-06-21, owner-directed).** The crew **split-wide two-column grids** (Schedule, Crew, Venue, Travel, and Today Mode A) are the one place this project deliberately does NOT use equal-height: they use `min-[720px]:items-start` so the shorter column (e.g. the ~3-row "Crew Schedule", the ~2-contact "Key contacts") takes its natural height instead of stretching to the taller column and leaving dead space. See `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-21-split-wide-natural-height.md`. The gotcha above still governs every grid where equal-height IS wanted — the Gear peer-card grid, the CrewSubNav tab bar, and the admin Dashboard split all keep `items-stretch` + `h-full`.

---

## 7a. Empty state-gated slots inside gapped parents — `empty:hidden`

**A childless flex/grid item still charges its parent's `gap`.** A wrapper that always renders while its entire content is state-gated paints nothing when the gate is false, but it is still an item, so the parent's `gap` is spent on it and the surface shows a seam no element accounts for. Reported 2026-07-24 as an "unnaturally large gap" between the Overview alert card and the Venue heading in the published show modal: `overview-sheet-sync` renders childless on every non-archived show, adding a full `--spacing-section-gap` (32px) on top of the content pane's own `gap-6`, so that one pair sat 56px apart where every other section pair sits 24px apart.

**Rule.** Any wrapper that (a) always renders, (b) can have every child gated away, and (c) sits inside a parent with a non-zero `gap` carries `empty:hidden`. It keeps the documented slot — so the next addition has a container to land in — while costing nothing when there is nothing to show. Prefer this over collapsing the wrapper into a bare conditional.

Two caveats:

- `:empty` matches only when the element has NO child nodes, **text included**. JSX drops whitespace-only children, so a `{cond ? … : null}` or `{items.map(…)}` body is safe — but inserting a literal space or `{" "}` silently re-enables the gap.
- The pattern is for elements that can only be hidden when they are genuinely empty. `display:none` on a POPULATED element is an accessibility change; this is not, because there is never content or an accessible name to remove.

Verified in a real browser, never in jsdom (no layout computed there, and a class-presence assertion only restates the fix): `T-OVERVIEW-TIGHT` measures the slack below a section's last child with real extent, and `T-NOPHANTOM` walks the whole rendered modal for zero-extent in-flow items inside any gapped container — both in `tests/e2e/published-review-modal.layout.spec.ts`. Current sites: `components/admin/showpage/OverviewSection.tsx` (sheet/sync slot), `ScheduleDayRow`'s 2-track time grid in `components/admin/wizard/step3ReviewSections.tsx`, and the TravelRow eyebrow in `components/crew/sections/TravelSection.tsx` (a ground leg whose stage was promoted to the primary line renders `label=""`). `tests/docs/designSevenAEmptyHiddenSites.test.ts` fails if this list goes stale.

**The zero-WIDTH sibling — same seam, different cause, and `empty:hidden` is the WRONG tool for it.** A decorative `flex-1` rule between a label and a control IS childless — `components/admin/BulkIgnoreControls.tsx` and the event-detail group rule in `components/admin/wizard/step3ReviewSections.tsx` are both childless spans, so `:empty` does match them. That is exactly why the idiom must not be used here: it would hide an intentionally PAINTED element at every width. The distinction §7a turns on is painted-empty-element (a decorative rule — keep it visible, give it a floor) versus empty CONTENT SLOT (nothing to show — `empty:hidden` is right). What actually goes wrong is that the rule is squeezed: When the row's other items fill the line, `flex-1` resolves `flex-basis: 0` with nothing left to grow into, the rule settles at 0 px, and the row still spends its `gap` on both sides of it. Note what the defect is NOT: `:empty` matches these spans perfectly well, so the §7a idiom is available — it is simply the wrong tool, because applying it would hide a rule that is meant to be seen. The idiom keys on emptiness; the question here is whether the element PAINTS. Rule: a decorative rule in a row that can get crowded carries (a) a breakpoint that removes it from flow where it would collapse — `hidden min-[480px]:block`, the boundary MEASURED rather than assumed — and (b) a `min-w-*` floor at the widths where it is drawn, so the zero-width state is unreachable in containers the measurement never covered. Site: `components/admin/BulkIgnoreControls.tsx` (data-quality group eyebrow), where the rule measured 0 px at every width from 320 to 430 and first drew 31.4 px at 480.

**A childless growable used as a right-PUSHER is a third case, and neither rule above fits it.** `<span className="flex-1" />` placed between a leading block and a trailing cluster is a flex ITEM, so a crowded row spends its `gap` on BOTH sides of something invisible. Do not hide it at a breakpoint (it is not decorative, and hiding it un-pushes the trailing content) and do not `empty:hidden` it (that would un-push it too). **Delete it and put `ml-auto` on the trailing content.** `ml-auto` holds the same right edge, costs no gap, and resolves to 0 when the row is full. Not `justify-between`: a lone child under it sits at the START edge (`components/admin/CompactAlertCard.tsx`). Repaid 2026-07-25 at three sites — `BellPanel`'s action row (both trailing branches), `AdminNav`, and `OnboardingTopBar`.

**MEASURE BEFORE YOU HIDE.** The breakpoint rule above applies only where the rule actually collapses. The event-detail group rule in `components/admin/wizard/step3ReviewSections.tsx` looked identical to the BulkIgnoreControls one but never collapses in the supported range: its five group titles are a closed set whose longest is "Wardrobe & key moments", and at the narrowest real row (240px — a 320px viewport's 280px pane minus `--spacing-tile-pad` each side) it still draws 22.94px, reaching 0 only below 215px. A rule that draws correctly everywhere gets a `min-w-*` FLOOR, not a breakpoint hide — hiding it would be the regression. Size the floor BELOW the measured worst case (`min-w-4`, 16px) so it never binds: `min-w-6` would exceed the 22.94px available and wrap the label.

**The centred section-header pattern (review panel, 2026-07-25).** When a header row must carry a name plus two or three affordances, do NOT let them compete on one narrow line — the NAME is what yields, and it yields silently. (A measured wide row is different: at `sm`+ the same affordances DO share one 552px-floor row with 172.5px of slack.) The review panel's section header measured 2 lines at 375px and 5 lines / 124px of row height at 320px on a flagged section before this was fixed (the full per-viewport table is in the spec's §1). This column shape is the **below-`sm`** treatment; at `sm`+ the same tree flattens to one left-aligned row (spec `docs/superpowers/specs/2026-07-26-section-header-wide-inline.md`). The shape that holds:

- **A column, not a row (below `sm`).** Line one is `[status icon | centred name+count | corner link]`; line two carries the status pill when there is one. The pill line emits NO wrapper when there is no pill — an always-rendered empty wrapper would charge the column's `gap` and recreate the §7a seam.
- **At `sm`+ the wrappers flatten, and the floor moves.** Both wrapper divs take `sm:contents`; `display: contents` removes their boxes, so any `min-h-*` they carried silently stops applying — the 44px floor MUST ride the outer element (`sm:min-h-tap-min`). The glyph orders last (`sm:order-1`) with `sm:ml-0.5`; the shared `SheetIconLink` overlay's 10px heading-side reach (`before:-left-2.5`) against that 12px clearance leaves a 2px dead zone before the inline pill instead of bleeding into it.
- **`justify-center` on the middle group replaces a pusher (below `sm`; `sm:justify-start` at `sm`+, where the growable group itself pushes the trailing cluster right).** No `flex-1` spacer at any width.
- **A linkless section pads by the link's footprint (below `sm`)** (`pr-header-link-slot`, §10) so its name lands on the same axis as a section that has one: measured +4px either way, versus +19px without. At `sm`+ the name is left-aligned and the compensation is off (`sm:pr-0`).
- **`w-full` + `items-stretch` are load-bearing below `sm`** (`sm:items-center` on the row at `sm`+; `w-full` load-bearing at every width), because there the column and its parent section are both `flex-col` and Tailwind v4 does not default `.flex` to `align-items: stretch`. Without them the lines shrink-wrap and every centring measurement is against the wrong box.
- **Icon-only affordances beat text ones in a crowded header.** Replacing a text "In sheet" link with the external-link glyph returned ~60px. Keep the 44px hit area with the shared `components/admin/SheetIconLink.tsx` overlay on a 20px glyph rather than a 44px visual box — `before:-inset-y-3 before:-left-2.5 before:-right-3.5`, asymmetric so the name side never bleeds (the symmetric `before:-inset-3` recipe this supersedes was exactly the 2px name-side bleed) — measured 8-29px better on centring — and keep the `aria-label`, so the visible words cost assistive tech nothing. New icon-only sheet links adopt the component, not the raw recipe (its containment guard censuses adopters).

Verified in a real browser across the 15 reachable (geometry-class x status) cells at 320/375/430/640/1280 (`tests/e2e/section-header-layout.layout.spec.ts`), asserting each cell's rendered identity BEFORE its geometry so copies of one fixture cannot pass as distinct cells. Specs: `docs/superpowers/specs/2026-07-25-section-header-rebuild-and-phantom-spacers.md` (stacked, below `sm`) and `docs/superpowers/specs/2026-07-26-section-header-wide-inline.md` (inline row, `sm`+).

---

## 8. Iconography

Size tokens: `--icon-sm` (16px), `--icon-md` (20px), `--icon-base` (24px), `--icon-lg` (32px).

**Library: `lucide-react`** (ratified at M4 Task 4.12 follow-up — scope-tile differentiation, critique Finding 8). Open source, tree-shakeable, neutral aesthetic, plays well with Inter at all weights.

**Versioning note:** the canonical `lucide-react` package shipped 0.x for several years and bumped to 1.x in early 2026 (post-1.0 stable). The currently-pinned `^1.14.0` IS the canonical maintainer line — homepage `lucide.dev`, repo `github.com/lucide-icons/lucide`, maintainer Eric Fennis. A reviewer with a stale "lucide-react is on 0.x" mental model may flag the version as suspicious; this note is the paper trail confirming the 1.x line is current. If the maintainer's release cadence shifts again, update the cited version range here in the same commit that bumps the dep.

---

## 9. Anti-pattern reminders (this project's house rules)

These are the absolute bans from shared design laws + this project's specific anti-references. Every UI task gets a free check against these before commit:

- **No side-stripe borders** > 1px on cards or tiles. **Scoped exception — bell notification severity rail (§16).** The bell panel's per-notification rows carry a 3px severity-colored left rail (`components/admin/BellPanel.tsx`, "Quiet rail" restyle 2026-07-17). This is the ONE sanctioned side-stripe: it is a small list-row severity cue, never a card/tile accent, and it is redundant reinforcement — the severity's meaning is independently carried by the row's stroke **glyph shape** (amber `TriangleAlert` = notice, red `CircleAlert` = critical, orange `Info` = info) and title copy, so the §1 color-blind floor holds without the rail. Scoped to the bell panel notification rows only; nowhere else may reintroduce a >1px side-stripe. (Same posture as the §1.3 red / §1.4 identity-palette scoped carve-outs.)
- **No gradient text.** Solid color, weight/size for emphasis.
- **No glassmorphism by default.** Backdrop-blur only when purposeful.
- **No identical card grids** with icon + heading + text repeated. Tiles vary in content shape — schedule has a date list, hotel has a stack of fields, RightNow has dynamic copy.
- **No modals as a first thought.** Inline / progressive disclosure first.
- **No em dashes.** Use commas, colons, semicolons, periods, parentheses. Also not `--`. **Enforced** by `tests/styles/_metaEmDashCopy.test.ts`, which parses TypeScript and keys on node kinds (string literals, template fragments, JSX text and attributes) plus help MDX prose, so comments and fenced code are out of scope by construction; anything internal is exempted by name with a reason, and a lone `—` is treated as an empty-value sentinel rather than prose.
- **No printed-paper / spreadsheet skeuomorph.** No cream backgrounds, no ruled lines, no serif body. The point is to replace the spreadsheet, not echo it.
- **No "enterprise SaaS dashboard" cliché.** No dense sidebar nav, no chart-grid density.
- **No consumer-playful.** No bouncy mascots, no rounded-everything, no gradient-on-gradient.
- **No competing accent hue.** Orange stays alone.
- **No red/green as primary semantic.** Pair color with text or icon.

---

## 10. Token surface contract

`app/globals.css` is the single source of executable tokens. Components consume tokens via Tailwind utilities (e.g., `bg-bg`, `text-text`, `text-text-subtle`, `border-border`, `bg-accent`, `text-accent-on-bg`, `rounded-md`, `duration-normal`). **Components MUST NOT hardcode hex values, ms values, or px spacing magic numbers** — every visual decision is named in this file or in `globals.css`. If a tile needs a color or spacing not present, the answer is to extend `DESIGN.md` + `globals.css` first, then consume — not to inline the literal.

This contract is enforced by review (and, optionally, by an ESLint rule in a future task) — not by automated test today.

---

## 11. Crew Today — unified show-day timeline card (`today-run-of-show`)

On a show day the Today view's **"Run of show"** card (`data-testid="today-run-of-show"`, title stays "Run of show") renders **one chronological timeline** that interleaves the crew's operational run-of-show entries (sheet-sourced, authoritative, per-viewer gated) with the PDF event agenda's sessions for that same day (best-effort, ungated event context). The two sources are **visually distinguished** so a crew member instantly reads *their job* vs *event context*, and a mis-parsed agenda line can never masquerade as a crew instruction. Implemented by `components/crew/primitives/ShowDayTimelineList.tsx`.

### 11.1 Card content states (data-driven, instant — no animation)

| State | When | Renders |
|---|---|---|
| **crew-only** | crew entries today, no high-confidence agenda for today | the existing `RunOfShowList` (unchanged) |
| **agenda-only** | zero crew entries today, but high-confidence agenda for today | the timeline, agenda rows only |
| **merged** | both present | the timeline, interleaved chronologically |
| **not-rendered** | not a show day, or viewer ineligible | the card is absent (Mode B / no card) |

All four states are pure server-rendered output (RSC). There is **no client-side animation** — state changes come from a fresh render (§5 motion does not apply to this card).

### 11.2 Row treatment — crew vs agenda must be visually distinct

| Row | `data-testid` | Tone | Marker |
|---|---|---|---|
| **crew, real** (agenda-kind) | `agenda-entry` | `text-text-strong` title | — (unchanged) |
| **crew, synthetic** (strike/load-out) | `agenda-entry` (`data-entry-kind`) | `text-text-subtle` title | a **leading hairline rule** (`border-l border-border`) on the title cell |
| **agenda, event** (PDF session) | `timeline-agenda-session` | `text-text-subtle` title | a small uppercase **"Agenda" eyebrow badge** (`bg-surface-sunken`, `tracking-eyebrow`, `text-xs` — the same idiom as the run-of-show AV badge) before the title — NOT a hairline |

The agenda row's badge and the synthetic crew row's hairline are **deliberately different markers** so the two muted styles never collide: the muted *crew milestone* (strike/load-out) reads as "a production beat you own," while the muted *agenda event* reads as "context from the event program." The agenda row shows the full `session.time` string verbatim (e.g. `"9:00 AM – 9:40 AM"`); its `room` renders when present; its `tracks` and `drift` are **never** rendered (the full agenda, with tracks, is one "Full agenda" chip-tap away).

### 11.3 Cap + overflow

Synthetic crew rows (strike/load-out) are **never** capped and stay in chronological position. The **non-synthetic content** (real crew rows + all agenda rows) is capped at `RUN_OF_SHOW_DISPLAY_CAP` (20); beyond that a single muted stub `…and N more items` (`data-testid="timeline-agenda-overflow"`) renders at the end. The noun is **"items"** (not "agenda items") because the capped content includes crew rows — a dropped crew row must not read as merely "agenda". This mirrors `RunOfShowList`'s exemption rule but keeps everything in time order (it does **not** partition synthetic rows to the end).

## 12. Crew Gear — Tech specs card (`gear-tech-specs`)

The Gear view renders a **"Tech specs"** card (`data-testid="gear-tech-specs"`, title "Tech specs", `SlidersHorizontal` icon) that surfaces the show-level `event_details` technical specs the crew need on-site but that were previously parsed-and-hidden — stage size, podium, audience polling, LED, scenic, gooseneck, digital signage, test pattern, fonts, equipment storage, staff office, recording, virtual speaker/audience, notes. The rows render in a 2-column `KeyValueRows` (`columns={2}`) that collapses to a single column below 720px. It is a **full-width card in the Gear section's vertical stack** (`flex flex-col gap-4`), a peer of the Keynote / Opening-reel cards — **not** a member of the 3-up scope grid (so the §7 equal-height grid rule does not apply; there is no same-row sibling to match).

- **Source of truth:** the closed-vocab whitelist `lib/crew/eventDetailsSpecs.ts` (`EVENT_DETAILS_LABELS` + ordered `CREW_TECH_SPEC_KEYS`), shared with the Step-3 review modal so the two surfaces can't drift. Keys already rendered elsewhere (dress→Today, internet/power→Venue, keynote/opening-reel→Gear) and `diagrams` (a folder link) are excluded from the crew card.
- **Rows:** rendered via `KeyValueRows` (label + value), which routes every row through `shouldHideGenericOptional` — a `TBD`/`N/A`/empty value omits that row. Values are `String(...)`-coerced (JSONB-safe).
- **Content states (data-driven, instant — no animation):** **present** — ≥1 real (non-sentinel) spec → card shown; **absent** — none → card not in the tree (folded into the Gear-section `allHidden` gate, so an all-sentinel show shows no empty card). Pure RSC; §5 motion does not apply.
- **Source link:** a `SourceLink` in the card header → the `details` sheet region (same region as Keynote / Opening-reel).

## 13. Crew Gear — Room details card (`gear-room-details`)

The Gear view renders a **"Room details"** card (`data-testid="gear-room-details"`, title "Room details", `LayoutGrid` icon) surfacing the per-room physical + schedule detail the parser captures but no card rendered: **dimensions, floor, setup, and per-room set / show / strike times**. It is a **full-width card in the Gear section's vertical stack** (`flex flex-col gap-4`), a peer of the Tech-specs / Keynote / Opening-reel cards (not in the 3-up discipline grid).

- **Room-first layout (distinct from the discipline-first scope cards).** The body is one block per room (`data-testid="gear-room-detail-<id>"`): the room name as an `<h3>` block heading (`roomLabel`, `text-sm font-semibold text-text-strong` — a real heading under the card's `<h2>`, so the room↔detail relationship is exposed to assistive tech and reads as a distinct block, not another field label) above a single-column `KeyValueRows` (`columns={1}`, label:value per line) of that room's detail fields in physical→schedule order. Rooms are ordered via `compareRooms` (gs-first), matching the show-level KeyTimesStrip's room selection.
- **Source of truth:** `lib/crew/roomDetailFields.ts` (`ROOM_DETAIL_FIELDS`), shared with the Step-3 review modal so the two surfaces can't drift. Excludes `power`/`digital_signage` (AV-adjacent; show-level `event_details` already surfaces them) and `notes` (TodaySection renders it).
- **Sentinel-hiding:** every value routed through `KeyValueRows` (`shouldHideGenericOptional`) and `String(...)`-coerced; a room block with all-empty detail is dropped, and the whole card hides when no room has any detail (folded into the Gear-section `allHidden` gate). Per-room times share the same predicate (it strips `TBD`/`N/A`/`TBA`).
- **Cap:** at most 12 room blocks; beyond that a single `…and N more rooms` stub. Bounded by the room count (real shows carry ≤ ~9).
- **Content states (data-driven, instant — no animation):** **present** (≥1 room has ≥1 non-sentinel detail) → card shown; **absent** → card not in the tree. Pure RSC; §5 motion does not apply.
- **Source link:** a `SourceLink` in the card header → the `rooms` sheet region.
- **Review-modal counterpart:** the Step-3 `RoomsBreakdown` shows the same fields per room AS-PARSED (sentinels visible — review surface), parallel to the gear-scope sub-list.

## 14. Crew roster — partial-attendance chip (`data-partial`)

A crew member written `(10/7 ONLY)` / `(10/7 and 10/9 ONLY)` / `***` in the sheet has that suffix parsed into a `date_restriction`; the roster surfaces it to teammates as a small chip so the crew can see who's only on-site some days (a coordination aid — NOT viewer-gated; every member's chip renders).

- **Crew roster** (`CrewSection` → `PersonRow`): a new chip in the `PersonRow` chip family, rendered beside You / Lead / Primary using the shared `CHIP_CLASS` with the neutral `bg-surface-sunken text-text-subtle` tone and a `data-partial` hook. Label from `partialAttendanceLabel(member.dateRestriction, { humanize: true })`: explicit days (ISO, projection-normalized) → `humanizeDayList` → e.g. **"Oct 7 & 9 only"**; `***`/unknown → **"Partial (dates TBD)"**; unrestricted → no chip.
- **Step-3 review modal** (`CrewBreakdown`): the same label rendered as a plain inline `· …` segment (matching the row's name·role·phone idiom), but **as-parsed** — `partialAttendanceLabel(m.date_restriction, { humanize: false })` shows the raw `M/D` tokens verbatim (e.g. "10/7, 10/9 only"), consistent with the modal's as-parsed review contract.
- **Source of truth:** `partialAttendanceLabel` (`lib/crew/partialAttendance.ts`) + `humanizeDayList` (`lib/dates/humanize.ts`). Pure data-driven render (RSC); no animation.

---

## 15. Destructive actions — confirm recipe + guard-tier ladder

Contract established by spec `docs/superpowers/specs/2026-07-16-destructive-confirm-pass.md` (§3 C1–C6). Enforced structurally by `tests/styles/_metaDestructiveConfirm.test.ts` (per-occurrence registry over `components/**` + `app/**`; fails by default for new inverted-amber recipe literals without a registry row). The scanner pins recipe-token growth only: a destructive control that never adopts the recipe is caught in review, not by the meta-test.

**Confirm-go recipe (the ONLY destructive-button treatment).** The button that actually performs a destructive mutation after a confirm step renders inverted amber: `bg-warning-text text-warning-bg font-semibold hover:opacity-90`. Never `bg-accent` (accent = affirmative/primary everywhere else), never `bg-surface`/`bg-bg` (twin-confusion with the safe control), never any other `hover:bg-*`. One complete class literal per confirm-go button; register every new literal in the meta-test with a WCAG disposition note. Contrast is carried by the existing warning tokens (light `#5c3f00`/`#fff3d6`, dark `#ffd68a`/`#3a2e14`, both ≥ 7:1 — see §1.2). Focus-ring offset matches the surrounding container and is not part of the recipe. Inside the share-hub popover the offset additionally carries tier meaning: confirm-go buttons are the only controls there with a focus offset; every ordinary control (rows, triggers, cancels, unarchive) is ring-only (two-tier recipe, spec `2026-07-23-sharehub-focus-pass` §2 — the template for future popover surfaces). Sizing/type-scale tokens are per-surface.

**Safe control.** The cancel/keep control keeps a neutral treatment (`bg-bg`, bordered `bg-surface`, or text-only recessive) and never carries a recipe token.

**Focus rules.**
- Open: a confirm panel with a separate safe control focuses the SAFE control on mount (the `keepCurrentRef` pattern). Morphing single buttons are exempt (focus never moves).
- Close: cancel and auto-revert restore focus to the re-mounted trigger, two-phase and guarded (capture `container.contains(document.activeElement)` before the state flip; focus after remount only when it was inside) so a timer firing while the user works elsewhere never steals focus. Submit outcomes (pending/success/failure) never move focus; result banners with `role="status"`/`role="alert"` carry the announcement.

**Guard-tier ladder** (which destructive ops get which guard):
1. **Typed-confirm modal** — environment wipes only (validation-data reset: type `RESET`).
2. **Two-tap confirm (morph or panel) + 3–4s auto-revert** — irreversible or work-destroying ops: permanent ignore, stop-showing-sheet, bulk ignore/undo, archive, token rotate, picker resets, admin revoke, alert dismiss, shrink acceptance. _(Re-scan was withdrawn from this tier — it is content-aware and preserves ratified decisions on a clean refresh; see `docs/superpowers/specs/2026-07-16-withdraw-rescan-guard.md`.)_

   **Row-idiom carve-out (owner-ratified 2026-07-20).** A tier-2 control rendered as a titled ROW inside a popover — where the consequence is prose the operator is meant to READ rather than a button label — dismisses via an explicit `Cancel` instead of the auto-revert. A timer shorter than the reading punishes only the operator who reads. `ArchiveShowButton`'s row variant adopts this shape (no timer), sitting adjacent to the rotate row in the ShareHub popover. (Correction, 2026-08-01 announce-a11y-pass: the amendment's aside that the rotate row "has always dismissed via Cancel, not a timeout" was factually wrong — `RotateShareTokenButton` arms a live `ARM_REVERT_MS` timer alongside its Cancel, as the same spec's F4 section verifies. The carve-out DECISION is unchanged; whether rotate should drop its timer is an open owner call, not taken by that pass.) The rest of the tier is unchanged: two-tap, the recipe on the confirm-go, the focus rules above (which now APPLY to the archive row — a separate safe control means the morphing-button exemption no longer covers it), and a registry row. Morph variants outside a popover keep the 3–4s timer. See `docs/superpowers/specs/admin/2026-07-16-destructive-confirm-pass.md`, amendment of the same date.
3. **Unguarded one-tap** — reversible ops with a real recovery path (single undo, ignore with un-ignore, defer-discards that re-stage on the next edit). Do not add friction here.

New destructive surfaces pick a tier by recoverability, adopt the recipe on the confirm-go, and add their registry row in the same commit.

**Announcements (spec `docs/superpowers/specs/2026-08-01-announce-a11y-pass-design.md`).** Every tier-2 surface with an auto-revert timer announces the CLOSE of the armed window: a persistent sr-only `role="status"` region renders the shared `ARM_EXPIRED_ANNOUNCEMENT` copy ("Confirm window closed. Nothing was changed.", `lib/admin/destructiveConfirm.ts`, value pinned by T5). The `expired` flag is SET only in the arm timer's callback and CLEARED at arm and at every dispatch entry, so explicit disarms (confirm, Cancel, Escape, backdrop, sibling actions) stay silent and consecutive expiries always re-announce (arm rewrites the region between them). The region node must be branch-stable — single-return components render it as a key-stable sibling; never `display: contents`. T4 (tests/styles/_metaDestructiveConfirm.test.ts) pins lexical co-presence: an `ARM_REVERT_MS` importer without `ARM_EXPIRED_ANNOUNCEMENT` fails by default. Separately, ShareHub owns a popover-root sr-only region announcing a REMOTE crew-link rotation ("Crew link changed. The earlier link no longer works.") under exactly the visual flash cue's predicate (open + link active, seed-driven non-null token change); local rotations stay silent there — the rotate row's own banner carries them.

**Two sanctioned region shapes, and how to choose (spec `docs/superpowers/specs/2026-08-03-undo-success-announcement-design.md`).** `role="status"` swaps text inside one persistent region; `role="log"` appends a keyed child per message. Choose `log` whenever the SAME message text can legitimately recur, because an identical text change may not re-announce while an identical addition always does. The undo channel is the worked example: announcement text is built from a crew member's name alone, so two shows dropping a same-named member produce byte-identical sentences. Both shapes share one implementation, `components/admin/announceLog.tsx` (`useAnnounceLog` + `AnnounceLogRegion`, cap 50 dropping oldest, whitespace no-op, per-mount monotonic ids); do not hand-roll a third copy.

**Branch-stability applies to the OWNER, not just the node.** The rule above says the region must be branch-stable. The harder half is that its owning component must sit above every data-dependent branch that the announced action can flip: a region whose owner re-renders into a different shape is destroyed and replaced by an already-populated one, which is the not-announced pitfall wearing a different hat. In practice that means the owner is a layout or a shell, never a row, card, group, or list that the mutation can empty. Four adversarial rounds on the undo channel were spent rediscovering this.

**A region inside a modal needs its own channel.** Content outside an `aria-modal="true"` dialog is excluded from the accessibility tree, and this app additionally sets `inert` + `aria-hidden` on `[data-inert-root]` while a review modal is open (`components/admin/review/ReviewModalShell.tsx:180`). A surface rendered inside a modal therefore cannot rely on a page-level region: `ReviewModalShell` mounts its own channel, and nested React context resolves consumers to the nearest one automatically. Corollary for any new page-level provider: it must wrap the layout's returned root so its region is a SIBLING of `[data-inert-root]`, never a descendant.

---

## 16. Bell notification row — "Quiet rail" severity design

Restyle 2026-07-17 (`components/admin/BellPanel.tsx`; source design comp "Alert Restyle.dc.html"). Replaces the earlier filled-severity-circle row with a quieter, list-native anatomy. Behavior (tone derivation, unread read-flip, mark-all, resolve/telemetry/watch actions, expand disclosure) is unchanged — this is a visual contract only. Every color is a token (§10); no hex is inlined.

**Row anatomy (per active notification):**

1. **Severity rail** — a 3px, `rounded-full` left rail, inset from the row's top/bottom padding, `position: absolute; left: 0`. Color by tone: notice = `bg-status-warn`, critical = `bg-status-degraded`, info = `bg-accent-on-bg`. This is the §9 side-stripe scoped exception; it is redundant with the glyph + title (never the sole severity carrier).
2. **Stroke glyph** — an on-surface (no fill circle) 18px `lucide-react` stroke icon, same tone color as the rail. Glyph SHAPE is the color-blind-safe severity carrier: **notice = `TriangleAlert` (amber), critical = `CircleAlert` (red), info = `Info` (orange)**. Contrast floors (≥3:1 graphical): status-warn 4.1:1 light / 8.8:1 dark; status-degraded 6.3:1 / 4.8:1; accent-on-bg 5.34:1 / 9.39:1 (all from §1.2).
3. **Unread pip** — the existing 8×8 `bg-accent-on-bg` dot, `ring-surface`, pinned to the glyph's top-right; opacity-flips on read (no layout shift, fixed slot). Contract unchanged from the prior design.
4. **Header right group** — the occurrence **repeat-chip** (`occurrences > 1` only: a small `RotateCcw` glyph + tabular count, `text-text-faint`, with a hover/focus tooltip and accessible name "Detected N times"), then the `text-text-faint` relative timestamp, then the disclosure caret (only when the code carries helpful context).
5. **Identity token chip** — the resolved at-a-glance identity (when non-global) renders as ONE bordered token chip (`border-border-strong bg-surface-sunken text-text`, `rounded-md`), not plain inline text. The "+N more" overflow the resolver bakes into the identity value stays inside the chip (parsing it back out would be fragile).
6. **Action row** — a leading **text-link CTA** (`text-accent-on-bg`, semibold, hover underline: the entry's action link, or the health "View in telemetry" deep link), a flex spacer, then a trailing **ghost resolve** button (`text-text-faint`, hover `text-text` + `bg-surface-sunken`). Both keep the 44px tap floor (`min-h-tap-min`) for the venue-floor phone context (PRODUCT.md), even though the visual weight is light. Health rows keep the telemetry-link-only contract (no resolve control — the global resolve route 403s health by design); auto-resolving rows show their note; the watch alert keeps its Retry form.

   **The resolve button's LABEL is intent-driven and shared across surfaces**, not bell-specific: it reads from `lib/adminAlerts/resolveActionLabel.ts`, which maps each alert code to `confirm` ("Confirm" / "Confirming…") or `resolve` ("Mark resolved" / "Resolving…"). One alert therefore reads the same verb in the bell, the show modal, and developer telemetry; the bell previously said "Dismiss" while the other two said "Mark resolved" for the same action, which the product register calls out as a defect ("if the save button looks different in two places, one is wrong"). "Confirm" is reserved for approvals of a deliberate change that already applied, where nothing is broken. The action row is `flex-wrap`, so the longer resolve label wraps to its own line at narrow widths rather than crowding the CTA.
7. **Row separation** — full-bleed rows separated by a 1px `bg-border` divider inset `mx-4`; unread rows keep a subtle `bg-stale-tint` wash (the pip is the primary unread cue). No per-row rounding.

The **section eyebrow** ("Active · N") is an uppercase `text-text-faint` label; its `textContent` still carries "Active" + the count for a11y/tests.
