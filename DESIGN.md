# DESIGN.md — FXAV Crew Pages visual tokens

This file is the visual-design source of truth for the FXAV crew-pages project. It pairs with `PRODUCT.md` (strategic context) and is consumed by every UI task in M3/M4. Subsequent tile work cites token names from this file rather than inlining hex values or magic spacing numbers.

The runtime token surface lives in `app/globals.css` under `@theme`. Tailwind v4 reads `@theme` and exposes utilities for every named token (e.g., `--color-accent` → `bg-accent`, `text-accent`, `border-accent`). This file documents intent, contrast, and rationale; `globals.css` is the executable copy.

---

## 1. Color strategy — Restrained

One signature accent, neutral-led surfaces. FXAV orange occupies ≤10% of any rendered viewport — it appears on the active/live indicator on the Right Now card, the "today" pin on the schedule tile, primary CTAs, and the brand mark. Nowhere else. No competing accent hue (no blue, no purple, no teal). Neutrals are tinted toward warm — chroma `0.005`–`0.012` in OKLCH — never pure `#000` or `#fff`.

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
| `--color-text-subtle`               | `#5A5B62` (warm slate)             | `#9C9A93` (warm dusk)           | Labels, captions, "as of …" timestamps. Light 7.8:1 (AAA), dark 6.4:1 (AA-large + AA-body borderline). Never used for action targets.                                                                                                                                                                                               |
| `--color-text-faint`                | `#8B8C92`                          | `#74736D`                       | Decorative text, divider labels. Min AA-large only (3:1) — never used for crew-actionable copy.                                                                                                                                                                                                                                     |
| `--color-border`                    | `#E5E4E0`                          | `#2A2B30`                       | Tile borders, hairline dividers. Visible but quiet.                                                                                                                                                                                                                                                                                 |
| `--color-border-strong`             | `#CFCDC7`                          | `#3A3B40`                       | Focus outlines (paired with `--color-accent` ring), tab-active underline.                                                                                                                                                                                                                                                           |
| `--color-accent`                    | `#FF8C1A` (FXAV orange)            | `#FF8C1A`                       | The single brand accent. Same hex in both modes — the orange is the constant. Coverage cap ≤10% of any viewport.                                                                                                                                                                                                                    |
| `--color-accent-hover`              | `#E67A0E`                          | `#FFA047`                       | Pressed/hover state for orange CTAs. Light goes deeper, dark goes lighter (luminance contrast preserved).                                                                                                                                                                                                                           |
| `--color-accent-text`               | `#FFFFFF`                          | `#0E0F12`                       | Text drawn ON `--color-accent` surfaces. Light: white on orange = 4.07:1 (AA at ≥18pt or ≥14pt-bold; we restrict accent-bg text to bold ≥14pt, i.e. CTAs and badges). Dark: near-black on orange = 11.3:1 (AAA).                                                                                                                    |
| `--color-accent-on-bg`              | `#C25E00`                          | `#FFA047`                       | Orange used AS TEXT on `--color-bg`. Light hex shifts darker so contrast against `#FAFAF9` reaches 4.6:1 (AA body). The brand `#FF8C1A` itself only hits 3.0:1 on light bg — fine for a 24px+ "today" pin glyph but NOT for body links. Dark `#FFA047` on `#0F1014` = 9.8:1 (AAA).                                                  |
| `--color-stale-tint`                | `#F4ECE0` (warm sand)              | `#26221B` (warm umber)          | Background tint applied to a tile or card whose data is stale (per §5.4 of spec). Not red. Pairs with explicit "as of …" text.                                                                                                                                                                                                      |
| `--color-warning-bg`                | `#FFF3D6`                          | `#3A2E14`                       | "Couldn't parse" / "needs Doug" admin states. Warm yellow, not red. Pairs with text + icon.                                                                                                                                                                                                                                         |
| `--color-warning-text`              | `#5C3F00`                          | `#FFD68A`                       | Text on warning-bg. Light 9.5:1, dark 9.2:1 (both AAA).                                                                                                                                                                                                                                                                             |
| `--color-info-bg`                   | `#EEEAE3`                          | `#1F1E22`                       | Informational notices (e.g., "we're syncing now"). Neutral-tinted, not blue.                                                                                                                                                                                                                                                        |
| `--color-focus-ring`                | `rgba(255, 140, 26, 0.55)`         | `rgba(255, 160, 71, 0.65)`      | Focus outline color for keyboard-visible focus. Always orange-derived, 3px ring + 2px offset.                                                                                                                                                                                                                                       |
| `--shadow-tile`                     | `0 1px 2px rgba(20, 18, 12, 0.04)` | `0 1px 3px rgba(0, 0, 0, 0.45)` | Quiet drop-shadow applied to tile/card surfaces (Right Now card, tile-as-card). Light mode reads as a near-imperceptible warm lift; dark mode uses a deeper pure-black drop tuned for the warm-charcoal `--color-bg`. Components consume via `shadow-(--shadow-tile)` — NEVER inline a `shadow-[…]` literal (token discipline §10). |
| `--color-status-live` / `-text`     | `#FF8C1A` / `#C25E00`              | `#FF8C1A` / `#FFA047`           | Live (in active window). **Reuses `--color-accent` / `--color-accent-on-bg`** — not a new hue; contrast governed by the accent rows above. Dot is always paired with a "Live" text label.                                                                                                                                           |
| `--color-status-positive` / `-text` | `#3F8A83` / `#2C655F`              | `#5FB0A8` / `#74C3BB`           | OK / synced / healthy. **Calm desaturated teal-leaning-neutral — NOT green** (color-blind floor §1, no green semantic). Dot uses the base; tinted text uses `-text`. Narrowly scoped to status dots/pills (§1.3).                                                                                                                   |
| `--color-status-review` / `-text`   | `#A87716` / `#6E4E00`              | `#E0B84E` / `#F0C860`           | Needs review. Amber. Dot base + `-text` for the tinted "Need review" count.                                                                                                                                                                                                                                                         |
| `--color-status-warn` / `-text`     | `#B26A16` / `#7A3D00`              | `#E9A23A` / `#F0B454`           | Stale / problem (sync failure). Amber, stronger than review. Dot base + `-text`.                                                                                                                                                                                                                                                    |
| `--color-status-idle` / `-text`     | `#8B8C92` / `#5A5B62`              | `#74736D` / `#9C9A93`           | Publishing / none / not-yet-synced. **Reuses `--color-text-faint` / `--color-text-subtle`** (neutral/faint), not a new hue.                                                                                                                                                                                                         |

### 1.2 Contrast summary (calculated, not estimated)

| Pair                                              | Light  | Dark   | Floor                                                    |
| ------------------------------------------------- | ------ | ------ | -------------------------------------------------------- |
| `--color-text` on `--color-bg`                    | 16.5:1 | 14.8:1 | AAA body (>7:1)                                          |
| `--color-text-strong` on `--color-bg`             | 18.4:1 | 16.9:1 | AAA body                                                 |
| `--color-text-subtle` on `--color-bg`             | 7.8:1  | 6.4:1  | AAA-light / AA-body                                      |
| `--color-accent` on `--color-bg` (text-on-bg use) | 3.0:1  | 6.7:1  | AA-large only — use `--color-accent-on-bg` for body text |
| `--color-accent-on-bg` on `--color-bg`            | 4.6:1  | 9.8:1  | AA body / AAA body                                       |
| `--color-accent-text` on `--color-accent`         | 4.07:1 | 11.3:1 | AA-large+bold / AAA                                      |
| `--color-status-positive` dot on bg/surface       | 3.9:1  | 7.5:1  | ≥3:1 graphical (dot)                                     |
| `--color-status-positive-text` on bg/surface      | 6.4:1  | 9.3:1  | AA body (≥4.5:1)                                         |
| `--color-status-review` dot on bg/surface         | 3.8:1  | 10.1:1 | ≥3:1 graphical (dot)                                     |
| `--color-status-review-text` on bg/surface        | 7.3:1  | 11.9:1 | AA body (≥4.5:1)                                         |
| `--color-status-warn` dot on bg/surface           | 4.1:1  | 8.8:1  | ≥3:1 graphical (dot)                                     |
| `--color-status-warn-text` on bg/surface          | 8.1:1  | 10.3:1 | AA body (≥4.5:1)                                         |
| `--color-status-idle` dot on bg/surface           | 3.2:1  | 4.0:1  | ≥3:1 graphical (dot)                                     |

**Direct-sunlight rule:** body text (`--color-text` on `--color-bg`, light mode) must hit ≥7:1 — 16.5:1 clears the bar with margin. Verified.

### 1.3 Status-signal hues (M12.2 Phase A amendment — the one scoped exception to "orange stays alone")

§1 commits to a single brand accent and "no competing accent hue (no blue, no purple, no teal)". The admin redesign (M12.2 Phase A) introduces **one narrowly-scoped exception**: a named **status-signal hue set** for sync/health/review state on the admin dashboard and per-show page. This is a _status_ hue family, **not a second brand accent**, and the exception is bounded by these rules:

- **Where it is allowed:** status **dots** (a few px) and small **status pills** on sync/health/review state only — the `StatusIndicator` component and the dashboard stat strip / shows table / needs-attention inbox. Nowhere else.
- **Never** a CTA, brand surface, large fill, or body-text color outside a status label. The FXAV orange accent remains the only brand accent and keeps its ≤10%-of-viewport coverage cap; the status hues do not count against — and must not visually compete with — the brand accent.
- **Always dot + text paired**, never color-only — honors the §1 color-blind floor (no information carried by hue alone). The `-text` variants exist for the cases where the hue is used _as_ small text (e.g. the tinted "Need review" count).
- **No green as a positive signal.** The "ok / synced / healthy" state uses a **calm desaturated teal-leaning-neutral** (`--color-status-positive`), explicitly NOT green — consistent with §1's red/green color-blind floor. (The originating design prototype used a green `ok` dot; that green is the violation this amendment replaces.)
- **Live** reuses `--color-accent` (orange) for the in-active-window dot; **idle** reuses `--color-text-faint`/`--color-text-subtle`. Only **positive / review / warn** introduce net-new hues, and all three are amber-or-teal status families confined to dots/pills.

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

**Inter** — single contemporary sans for all UI. One family, no display/body pairing. Loaded via `next/font/google` in `app/layout.tsx` (a future task wires this up; this file only defines tokens).

Why Inter: PRODUCT.md explicitly lists Inter as one of three acceptable starting points and says "pick one and commit." Inter is the most reliable tabular-figure-strong sans on the web — `font-feature-settings: 'tnum'` is fully implemented in every modern browser, all of weights 400/500/600/700 ship with even spacing, and it has explicit display-vs-text optical sizing built in. Geist (next pick) lacks the same `tnum` reliability across iOS Safari versions; General Sans is licensed.

Tradeoff acknowledged: Inter is the most-used webfont on the modern internet. The "AI slop" risk per shared design laws is real. We compensate by using Inter at distinctive **weights and sizes** (large, confident headline numbers; consistent 500/600 hierarchy rather than the default 400/700 split that creates SaaS-look) and by leaning on the page's structural rhythm — generous spacing, asymmetric hero, FXAV orange accent — to carry character. The font is the canvas, not the personality.

Fallback stack: `Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Helvetica Neue", sans-serif`.

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

Every time, date, count, confirmation number, and quantity uses `font-feature-settings: 'tnum' 1, 'cv11' 1`. Two equivalent application surfaces:

- **Tailwind utility:** `font-tabular` (mapped via `@theme` → `--font-feature-settings-tabular`).
- **Class:** `.tabular-nums` (Tailwind v4 ships this by default; we keep both in scope).

Apply at the smallest semantic boundary — the `<time>` element, the `.call-time` span — not the entire tile, so non-numeric copy keeps default proportional metrics. `cv11` is Inter's single-storey 'a' alternate at small sizes; subtle, but improves call-time legibility on mobile.

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
| `--spacing-tile-pad`         | 20px  | Internal padding on a tile. Comfortable, not cramped (per `PRODUCT.md`).                                                                                                                                                                       |
| `--spacing-tile-gap`         | 16px  | Grid gap between tiles. Visual rhythm, not crowded.                                                                                                                                                                                            |
| `--spacing-section-gap`      | 32px  | Gap between major page sections (Right Now card → tile grid → footer).                                                                                                                                                                         |
| `--spacing-tile-min-h`       | 96px  | Tile minimum height (per spec §8.4 — `min-h-24` in Tailwind units).                                                                                                                                                                            |
| `--spacing-tile-overflow`    | 240px | Tile body max before "see more" disclosure (per spec §8.4 — `max-h-60`).                                                                                                                                                                       |
| `--spacing-right-now-min-h`  | 176px | Right Now card minimum height. Holds the container fixed during the §8.2 AnimatePresence crossfade so body content swaps without the card resizing. Sized to the tallest state body (`unknown`, two-line detail) at the 390px mobile viewport. |
| `--spacing-page-pad-mobile`  | 16px  | Page-level horizontal padding on mobile (<640px).                                                                                                                                                                                              |
| `--spacing-page-pad-desktop` | 32px  | Page-level horizontal padding on desktop (≥1024px).                                                                                                                                                                                            |

> **Tailwind v4 naming note:** the `--spacing-*` prefix is non-arbitrary — Tailwind v4's arbitrary-value `min-h-(--name)` / `p-(--name)` arrows resolve ONLY tokens declared in the `--spacing-*` namespace (declared in `app/globals.css` `@theme`). Renaming any of these to `--space-*` would silently break the Tailwind-utility consumption sites (e.g., `min-h-(--spacing-right-now-min-h)` in `components/right-now/RightNowCard.tsx`).

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

### 5.4 Layout-property ban

Don't animate `width`, `height`, `padding`, `margin`, `top`, `left`, etc. — they trigger layout. Use `transform`, `opacity`, and `filter`. The Right Now card crossfade is `opacity` + a 4px `translateY`; the "see more" disclosure is `max-height` (the documented exception, since explicit `max-height` doesn't trigger reflow on siblings).

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

> **Amendment (2026-06-21, owner-directed).** The crew **split-wide two-column grids** (Schedule, Crew, Venue, Travel, and Today Mode A) are the one place this project deliberately does NOT use equal-height: they use `min-[720px]:items-start` so the shorter column (e.g. the ~3-row "Daily call times", the ~2-contact "Key contacts") takes its natural height instead of stretching to the taller column and leaving dead space. See `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-21-split-wide-natural-height.md`. The gotcha above still governs every grid where equal-height IS wanted — the Gear peer-card grid, the CrewSubNav tab bar, and the admin Dashboard split all keep `items-stretch` + `h-full`.

---

## 8. Iconography

Size tokens: `--icon-sm` (16px), `--icon-md` (20px), `--icon-base` (24px), `--icon-lg` (32px).

**Library: `lucide-react`** (ratified at M4 Task 4.12 follow-up — scope-tile differentiation, critique Finding 8). Open source, tree-shakeable, neutral aesthetic, plays well with Inter at all weights.

**Versioning note:** the canonical `lucide-react` package shipped 0.x for several years and bumped to 1.x in early 2026 (post-1.0 stable). The currently-pinned `^1.14.0` IS the canonical maintainer line — homepage `lucide.dev`, repo `github.com/lucide-icons/lucide`, maintainer Eric Fennis. A reviewer with a stale "lucide-react is on 0.x" mental model may flag the version as suspicious; this note is the paper trail confirming the 1.x line is current. If the maintainer's release cadence shifts again, update the cited version range here in the same commit that bumps the dep.

---

## 9. Anti-pattern reminders (this project's house rules)

These are the absolute bans from shared design laws + this project's specific anti-references. Every UI task gets a free check against these before commit:

- **No side-stripe borders** > 1px on cards or tiles.
- **No gradient text.** Solid color, weight/size for emphasis.
- **No glassmorphism by default.** Backdrop-blur only when purposeful.
- **No identical card grids** with icon + heading + text repeated. Tiles vary in content shape — schedule has a date list, hotel has a stack of fields, RightNow has dynamic copy.
- **No modals as a first thought.** Inline / progressive disclosure first.
- **No em dashes.** Use commas, colons, semicolons, periods, parentheses. Also not `--`.
- **No printed-paper / spreadsheet skeuomorph.** No cream backgrounds, no ruled lines, no serif body. The point is to replace the spreadsheet, not echo it.
- **No "enterprise SaaS dashboard" cliché.** No dense sidebar nav, no chart-grid density.
- **No consumer-playful.** No bouncy mascots, no rounded-everything, no gradient-on-gradient.
- **No competing accent hue.** Orange stays alone.
- **No red/green as primary semantic.** Pair color with text or icon.

---

## 10. Token surface contract

`app/globals.css` is the single source of executable tokens. Components consume tokens via Tailwind utilities (e.g., `bg-bg`, `text-text`, `text-text-subtle`, `border-border`, `bg-accent`, `text-accent-on-bg`, `rounded-md`, `duration-normal`). **Components MUST NOT hardcode hex values, ms values, or px spacing magic numbers** — every visual decision is named in this file or in `globals.css`. If a tile needs a color or spacing not present, the answer is to extend `DESIGN.md` + `globals.css` first, then consume — not to inline the literal.

This contract is enforced by review (and, optionally, by an ESLint rule in a future task) — not by automated test today.
