# Accent-contrast token pass (BL-ACCENT-ON-BG-AA-CONTRAST + TEL re-tone)

**Date:** 2026-07-16
**Status:** Draft (autonomous-ship pipeline; spec+plan user gates waived per AGENTS.md checkpoint, user-approved 2026-07-16)
**Closes:** DEFERRED.md `STEP3MODAL-1`, `DEVTIER-2`, `VCR-1`, `TEL-1`, `TEL-2`; BACKLOG.md `BL-ACCENT-ON-BG-AA-CONTRAST`

---

## 1. Problem

DESIGN.md §1.1/§1.2 contrast figures carry a systematic luminance miscalculation (gamma 2.2-vs-2.4 class, already diagnosed in the BACKLOG entry). Measured WCAG 2.x ratios (relative-luminance formula, identical to `tests/styles/status-token-contrast.test.ts:23-35`):

| Pair (light mode) | DESIGN.md claims | Measured | Required floor | Verdict |
| --- | --- | --- | --- | --- |
| `--color-accent-text` `#ffffff` on `--color-accent` `#ff8c1a` (DESIGN.md L33) | 4.07:1 "AA-large+bold" | **2.33:1** | 3:1 even for large text | FAILS all tiers |
| `--color-accent-on-bg` `#c25e00` on `--color-bg` `#fafaf9` (DESIGN.md L34, L58) | 4.6:1 "AA body" | **4.11:1** | 4.5:1 | FAILS AA body |
| Toggle ON track `bg-accent` `#ff8c1a` vs `--color-bg` `#fafaf9` (WCAG 1.4.11 non-text) | — | **2.23:1** | 3:1 | FAILS |
| Eyebrow `text-text-faint` `#8b8c92` on `#fafaf9` at `text-[10px]` | — | **3.21:1** | 4.5:1 | FAILS |
| Eyebrow `text-text-faint` dark `#74736d` on `#0f1014` | — | **4.00:1** | 4.5:1 | FAILS |

Dark mode accent pairs are unaffected (`#0e0f12` on `#ff8c1a` = 8.23:1; `#ffa047` on `#0f1014` = 9.39:1).

Two adjacent telemetry findings ride the same pass by user decision (2026-07-16):

- **TEL-1 (accent dilution):** `components/admin/telemetry/EventFilters.tsx:90` spends `bg-accent text-accent-text` on the selected level segment; `components/admin/telemetry/EventRow.tsx:103` renders the requestId chip in `text-accent-on-bg`. Both dilute "accent = this matters now" (live pulse, sparkline current-hour bar, bell count).
- **TEL-2 (badge escalation):** `components/admin/telemetry/EventLevelBadge.tsx:6-7` renders warn and error with the identical `bg-warning-bg text-warning-text` fill, differing only by `font-semibold` — no color-blind-safe escalation.

## 2. Resolved decisions (user-ratified 2026-07-16, this session)

| # | Decision | Choice |
| --- | --- | --- |
| R1 | Scope | Token pass + TEL-1 + TEL-2 (the "everything" option) |
| R2 | Light-mode CTA recipe | **Dark text on orange**: flip light `--color-accent-text-runtime` `#ffffff` → `#0e0f12` (8.23:1). Brand `#ff8c1a` stays the CTA fill; matches the dark-mode treatment exactly ("the orange is the constant", DESIGN.md L31) |
| R3 | Eyebrow fix | **Re-point to `text-text-subtle`** (6.09–6.76:1); `text-text-faint` token value unchanged, reserved for genuinely decorative text |
| R4 | TEL-1 selected tone | **Inverted neutral**: `bg-text text-bg` (~14.9:1); requestId chip → `text-text-subtle` |
| R5 | Autonomy | Full autonomous pipeline through merged PR |

## 3. Token changes (`app/globals.css`)

Only the **light** block (`:root` defaults, `app/globals.css:266-299` region) changes. Both dark blocks (`@media (prefers-color-scheme: dark)` at `:313-331` and `[data-theme="dark"]` at `:355-372`) are untouched.

| Token | Line (pre-change) | Old | New | Resulting ratios (measured) |
| --- | --- | --- | --- | --- |
| `--color-accent-text-runtime` (light) | `app/globals.css:278` | `#ffffff` | `#0e0f12` | 8.23:1 on `#ff8c1a`; 6.53:1 on hover `#e67a0e` |
| `--color-accent-on-bg-runtime` (light) | `app/globals.css:279` | `#c25e00` | `#b35600` | 4.73:1 on bg `#fafaf9`; 4.94:1 on surface `#ffffff`; 4.35:1 (≥3:1 graphical) on accent-tint `#feeede` |

Knock-on consumers that inherit automatically (no per-surface edits): every `text-accent-text` CTA/badge (30 files — `components/shared/AccentButton.tsx`, wizard steps, nav count badges, error pages, crew interstitial, etc.), every `text-accent-on-bg` link/emphasis surface (StagedReviewCard, IdentityChip, DashboardFooter, status pills), `--color-status-live-text` (aliases `--color-accent-on-bg`, `app/globals.css:89`), and the bell info icon (`accent-on-bg` on `accent-tint`, pinned at `tests/styles/status-token-contrast.test.ts:140-142`).

`--color-accent-text` becomes the same hex in both modes. It stays a **mode-scoped token** (no consolidation): the light/dark split is the token's structure, and a future brand tweak may re-diverge it.

## 4. Component changes

### 4.1 Toggle ON boundary (DEVTIER-2; WCAG 1.4.11)

The shared toggle recipe `on ? "border-accent bg-accent" : "border-border-strong bg-surface-sunken"` changes to `on ? "border-accent-on-bg bg-accent" : "border-border-strong bg-surface-sunken"` — the ON border becomes the ≥3:1 boundary (new light `#b35600` = 4.73:1 vs bg, 4.94:1 vs surface; dark `#ffa047` vs `#0f1014` = 9.39:1). Sites (verified identical recipe):

- `components/admin/settings/NotifyToggle.tsx:134`
- `components/admin/settings/AutoPublishToggle.tsx:126`
- `components/admin/settings/DeveloperToggleButton.tsx:93`
- `components/admin/PublishedToggle.tsx:146`
- `components/admin/telemetry/AutoRefreshControl.tsx:106` — this one is borderless (`on ? "bg-accent" : "bg-surface-sunken"`); it gains `border` + the same conditional border pair so the recipe unifies.

Thumb (`bg-bg`, `h-5 w-5` inside `h-7 w-12`) is unchanged: the component boundary contrast is carried by the track border, and the toggle state is never color-only (thumb `translate-x` + `aria-checked` + visible label — the DEVTIER-2 mitigations remain).

### 4.2 Eyebrows (VCR-1)

- `CELL_EYEBROW_CLASS` (`components/admin/wizard/step3ReviewSections.tsx:392`): `text-text-faint` → `text-text-subtle`. One constant; covers every Stage-3 card eyebrow (venue, hotel, route, check-in/out, contacts).
- `components/admin/wizard/VenueMapTile.tsx` "map" badge (`text-[10px] text-text-faint` on `bg-surface/85`): → `text-text-subtle`. (Badge is `aria-hidden` but sighted-legibility still applies at 10px.)
- `--color-text-faint` token value is **unchanged**. Other `text-text-faint` consumers are out of scope (decorative/large-text uses; the auditor's recommendation was exactly this split). `BL-ADMIN-EYEBROW-FAINT-CONTRAST` closes for the Stage-3 eyebrow surface; any remaining small-text faint use found during implementation gets enumerated in the plan's class-sweep, not silently skipped.

### 4.3 TEL-1 re-tone

- `components/admin/telemetry/EventFilters.tsx:90`: selected level segment `bg-accent text-accent-text` → `bg-text text-bg` (inverted neutral: 16.47:1 light, 15.23:1 dark). Unselected stays `text-text-subtle`.
- `components/admin/telemetry/EventRow.tsx:103`: requestId chip `text-accent-on-bg` → `text-text-subtle` (6.09:1 light / 6.94:1 dark on `bg-surface-sunken`).
- Accent-as-matters-now survivors (deliberately unchanged): live-refresh pulse + ON dot (`AutoRefreshControl.tsx:86,90`), sparkline current-hour bar (`EventVolumeSparkline.tsx:33`), nav/bell count badges (`AdminNav.tsx:196`, `NotifBell.tsx:79`), crew live/today surfaces.

### 4.4 TEL-2 badge escalation

`components/admin/telemetry/EventLevelBadge.tsx:7`: error row changes from `bg-warning-bg text-warning-text font-semibold` → `bg-status-degraded text-status-degraded-text font-semibold` (solid degraded fill; existing token pair, `app/globals.css:298-299` light `#ffffff` on `#b3261e` = 6.54:1, dark `:345-346` `#1a1a1a` on `#e5534b` = 4.70:1 — both AA). The tinted BellPanel-critical pairing (`bg-danger-bg text-status-degraded`) was evaluated and REJECTED for this badge: it measures 4.10:1 in dark mode, under the 4.5:1 text floor. (BellPanel `components/admin/BellPanel.tsx:134` itself is NOT a violation — there `text-status-degraded` colors an icon, a graphical object with a 3:1 floor; no change there.) Info and warn rows unchanged. The `data-testid` contract (`event-level-${level}`) and defensive fallback are unchanged. The dot (`bg-current`) inherits the new text color and stays visible on the solid fill.

## 5. DESIGN.md corrections

Every touched figure is corrected to the measured value (the numeric-sweep target set):

- **L31 (`--color-accent`)**: unchanged value; no figure.
- **L33 (`--color-accent-text`)**: light hex `#FFFFFF` → `#0E0F12`; rationale rewritten — "near-black on orange in BOTH modes; light 8.23:1, dark 11.3:1 (AAA). The former white-on-orange light pairing measured 2.33:1 (the 4.07:1 figure was a luminance miscalculation) and failed every WCAG tier."
- **L34 (`--color-accent-on-bg`)**: light hex `#C25E00` → `#B35600`; figure 4.6:1 → 4.73:1 (AA body); the "brand #FF8C1A only hits 3.0:1" side-claim corrected to its measured 2.23:1, and the "fine for a 24px+ glyph" allowance is DELETED — 2.23:1 fails the 3:1 graphical floor too. Replacement wording: "raw `--color-accent` on light bg is decorative-only; it must be redundant with an adjacent text label or shape cue (the today-pin and DayCard dots qualify: both sit beside date/label text), and any load-bearing orange-as-text/glyph use must go through `--color-accent-on-bg`."
- **L41 (`--color-status-live`/`-text`)**: light `-text` hex updates to `#B35600` (alias follows accent-on-bg).
- **L47 (`--color-accent-tint`)**: icon figure 3.8:1 → 4.35:1 (new accent-on-bg on tint).
- **§1.2 table L57**: accent on bg "3.0:1" → measured 2.23:1, note reworded (AA-large claim removed; accent raw on light bg is decorative-only).
- **§1.2 table L58**: 4.6:1 → 4.73:1.
- **§1.2 table L59**: 4.07:1 → 8.23:1, note "AA-large+bold" → "AAA-adjacent / AA body both modes".
- **§1.2 table L70**: 3.8:1 → 4.35:1.
- New row (or amended L57-59 note): toggle ON-track border `accent-on-bg` vs `bg`/`surface` ≥3:1 non-text (4.73 / 4.94 light; 9.39 dark).
- §1.1 prose "primary CTAs" sentence gains: selected-filter segments are NOT an accent surface (inverted neutral is the selected-state recipe; accent is reserved for live/matters-now + CTAs).

All other figures in §1.1/§1.2 get a one-time verification sweep during implementation (same formula); any additional stale figure found is corrected in the same commit and enumerated in the PR body.

## 6. Tests

### 6.1 Meta-test inventory (writing-plans rule)

- **EXTENDS** `tests/styles/status-token-contrast.test.ts` — new pinned rows (both modes, reading live hex from `globals.css` like the existing rows):
  1. `accent-text` on `accent` ≥ 4.5:1 (text floor; CTAs are body-size bold)
  2. `accent-text` on `accent-hover` ≥ 4.5:1
  3. `accent-on-bg` on `bg` AND on `surface` ≥ 4.5:1 (the backlog-prescribed row)
  4. `accent-on-bg` vs `bg` AND vs `surface` ≥ 3:1 (non-text, pins the toggle border)
  (Existing rows at `:140-145` — bell icon ≥3:1 on tint, pill text — re-run green with the new values.)
- **NOT extended:** `tests/styles/_metaDesignTokenPairs.test.ts` (scoped to `app/help/_components` by its own v1 scope note; no help files change), advisory-lock/infra/mutation registries (no DB, no mutation surface, no Supabase call — this diff is CSS tokens + class strings + docs).

### 6.2 Behavioral/unit updates

- Component tests pinning the old class strings are updated to the new recipes (TDD: change assertion first, watch fail, flip implementation). Known candidates from the pre-spec grep (`text-accent-text` / `bg-accent` / eyebrow / badge testids): `tests/components/atoms/AccentButton.test.tsx`, `tests/styles/accent-button-atom.test.ts`, `tests/components/admin/wizard/step3ReviewSections.test.tsx`, `tests/components/telemetry/*`, `tests/e2e/developer-toggle-layout.spec.ts`, `tests/e2e/telemetry-layout.spec.ts` + the rest of the 18-file grep list; the plan enumerates each with its exact assertion.
- New assertions: EventLevelBadge error carries `bg-status-degraded text-status-degraded-text` and carries NEITHER `bg-warning-bg` NOR the rejected `bg-danger-bg text-status-degraded` pairing; EventFilters selected segment carries `bg-text text-bg` and no `bg-accent`; each toggle ON state carries `border-accent-on-bg`; `CELL_EYEBROW_CLASS` contains `text-text-subtle` and not `text-text-faint`.
- Anti-tautology: contrast assertions read hex out of `globals.css` and compute (never hardcode a ratio literal that can drift); class assertions target the specific element by testid/role, not container `innerHTML`.

### 6.3 What proves the failure mode

The token rows fail TODAY against the old values (2.33 < 4.5, 4.11 < 4.5, 2.23 < 3) — genuine red-first tests; they pin regressions of the exact audited deficiency.

## 7. Screenshot baselines

`/admin` + help screenshot baselines shift wherever accent-text/accent-on-bg/toggles/eyebrows/telemetry render. Regen per the byte-comparison discipline: pixel-diff first (confirm only expected surfaces moved), then regenerate from the pinned Playwright Docker image with `--platform linux/amd64` (`screenshots-regen.yml` workflow or its documented local-docker equivalent), never host-arch capture. `git restore public/help/screenshots/` after any local `pnpm screenshot:help` verification.

## 8. Close-out doc edits (same PR)

- DEFERRED.md: mark STEP3MODAL-1, DEVTIER-2, VCR-1, TEL-1, TEL-2 ✅ RESOLVED with this pass's date/branch.
- BACKLOG.md: mark `BL-ACCENT-ON-BG-AA-CONTRAST` ✅ SHIPPED; note `BL-ADMIN-EYEBROW-FAINT-CONTRAST` disposition (eyebrow surface resolved by re-point; token untouched).
- DESIGN.md edits per §5.

## 9. Out of scope

- Raising `--color-text-faint` itself (R3 rejected it; decorative uses keep the third tier).
- VCR-2 (dark-map double fetch), VCR-3 (link-only venue) — separate triggers.
- Project-wide `_metaDesignTokenPairs` expansion beyond `app/help` (its own backlog item).
- Any DB/RPC/telemetry-write change: none. **Flag lifecycle:** N/A — no flags/toggles added (existing toggle components change one class string). **Guard conditions:** N/A — no prop contracts change; `EventLevelBadge` fallback (`?? BADGE.info`) unchanged. **Dimensional invariants:** N/A — zero layout/geometry changes (border was already present on 4 of 5 toggles; the 5th gains `border` at 1px inside its existing `h-5 w-[34px]` box — plan verifies no visual shift via the existing e2e layout specs). **Transition inventory:** N/A — no new states, no animation changes; all edits are static color classes on existing states (`transition-colors` on toggles already covers the color swap).

## 10. Accessibility floor summary (post-change, light mode — the failing mode)

| Surface | Pair | Ratio | Floor |
| --- | --- | --- | --- |
| CTA text | `#0e0f12` on `#ff8c1a` | 8.23 | 4.5 |
| CTA hover | `#0e0f12` on `#e67a0e` | 6.53 | 4.5 |
| Links/emphasis | `#b35600` on `#fafaf9` | 4.73 | 4.5 |
| Links on surface | `#b35600` on `#ffffff` | 4.94 | 4.5 |
| Toggle ON border | `#b35600` vs `#fafaf9` / `#ffffff` | 4.73 / 4.94 | 3.0 |
| Bell info icon | `#b35600` on `#feeede` | 4.35 | 3.0 |
| Eyebrows | `#5a5b62` on `#fafaf9`-family | ≥6.09 | 4.5 |
| Selected filter | `#fafaf9` on `#1a1b1f` | 16.47 | 4.5 |
| requestId chip | `#5a5b62` on `#f4f3f1` | 6.09 | 4.5 |
| Error badge | `#ffffff` on `#b3261e` (dark: `#1a1a1a` on `#e5534b` = 4.70) | 6.54 | 4.5 |
