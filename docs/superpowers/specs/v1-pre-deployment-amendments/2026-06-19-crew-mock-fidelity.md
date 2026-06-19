# Crew Page Mock-Fidelity Pass — Spec

**Status:** DRAFT (driving to Codex adversarial APPROVE; user reviews waived per mandate)
**Branch:** `feat/crew-mock-fidelity` (worktree, off merged main `82d2dda6`)
**Owner decision (2026-06-19):** scope = **full 6-section mock-fidelity pass**; **colored avatars = ADOPT** (deterministic per-name, amends DESIGN.md §1).

## Ground truth (cite on every UI decision)

The authoritative design is the **Claude Design "FXAV Crew Pages" project** (`claude_design` MCP / `DesignSync`, projectId `33ee8c30-4eaa-48b3-9e3e-8fa642f7f3cd`), read 2026-06-19:
- `crew/sections.jsx` — the six section layouts.
- `crew/components.jsx` — the primitives (`Tile`, `DayCard`, `Person`, `Avatar`, `KVRows`, `Timeline`, `RightNow`, `SectionHead`, `Empty`, `Chip`, `Pill`).
- `crew/styles.css` — the token surface + the `.cols/.split-wide/.thirds`, `.day/.date`, `.person/.av`, `.kvrow/.mini`, `.travelrow` rules.

This is a **fidelity** pass, not a redesign: where the impl already matches the mock, leave it. Per [[feedback-specs-must-reference-design-mock]], every delta below cites both the impl (`file:line`, from the 2026-06-19 impl map) and the mock rule.

## Scope

**UI-only.** Touches `components/crew/**`, `components/atoms/Avatar.tsx`, `app/globals.css` (`@theme` tokens only if a needed token is absent), `DESIGN.md` (the avatar-palette amendment), and the crew component tests. **NO** projection / parser / sync / migration / API change.

**Explicitly OUT of scope (separate from this code spec):**
- **The `&#10;` literal entity + raw ISO dates** seen on the `…-validation.vercel.app` screenshots are **stale-deploy / stale-data artifacts**, NOT current-code bugs: current code decodes `&#10;`→space at the parser boundary (`presence()`→`decodeEntities`, `lib/parser/blocks/_helpers.ts:60`) and formats dates via `formatIsoDate` (`lib/format/date.ts:24`). Resolution is a **re-sync of the validation show + redeploy**, tracked separately (not this branch). The spec's date-badge work is independent of (and supersedes) the raw-ISO artifact.
- **Run-of-show timeline / Crew Wi-Fi / site diagrams / venue notes** richness is **data-driven** (Phase 1/2 already render these when present; the wrapped-show screenshots simply lack the data). Empty states stay as-is.

## DESIGN.md amendment — colored avatars (resolves the §1 single-accent conflict)

The impl's `Avatar` is fixed gray (`bg-surface-sunken`, `components/atoms/Avatar.tsx:67-87`) citing DESIGN.md §1 "single orange accent." The mock's `Person`/`Avatar` colors each person (`p.color`, hand-assigned in the mock data). **Owner ruling: adopt colored avatars.** DESIGN.md §1 is amended to carve out an explicit exception: **identity avatars (crew/contacts) use a deterministic per-name color from a fixed 8-swatch palette; the single-orange accent rule still governs all OTHER chrome (buttons, pills, links, focus, hero).**

- **Palette (8 swatches, DESIGN.md-defined):** a curated, WCAG-AA-on-white-text set in the brand's warm-to-cool range — e.g. `#C25E00` (accent-on-bg orange), `#2F7D4F` (ok green), `#3E7BD6` (blue), `#7C5BD6` (violet), `#B5453F` (rose), `#1F8A8A` (teal), `#A8761B` (amber), `#6B6F76` (slate). Each must hit ≥4.5:1 contrast with `#FFFFFF` avatar text (state the measured ratios in the plan).
- **Assignment:** `avatarColor(name): string` = palette[ deterministic-hash(normalizeName(name)) % 8 ]. Stable per name across renders/sessions (NOT random — derive from the name so the same person is always the same color; vary only by name, never by index). Empty/blank name → the slate swatch + `"?"` initials (the existing fallback).
- The avatar text stays white; size unchanged (40px in rows per `.person .av`, 30px in the id chip per `.idchip .av`).

## Per-section divergences + fixes

Each section's outer 2-column wrapper, where the mock uses `.cols.split-wide` (`grid-template-columns:1.7fr 1fr` at container ≥980px, `crew/styles.css`), maps to the project's established **viewport** util `min-[720px]:grid-cols-[1.6fr_1fr]` (the repo deliberately avoids container queries + `md:`, `app/globals.css:191-196`). **Keep the 720px viewport mechanism; only fix the column RATIO where it's wrong.** The 1.6fr/1fr vs the mock's 1.7fr/1fr is within tolerance — standardize on **`1.6fr_1fr`** for every split-wide section.

### 1. Crew (`CrewSection.tsx:80-227`, `PersonRow.tsx:97-196`, `Avatar.tsx`)
- **Avatar color** — gray → `avatarColor(name)` (above). [impl `Avatar.tsx:67-87` gray ↔ mock `.person .av` colored]
- **Column ratio** — `min-[720px]:flex-row` (50/50) → `min-[720px]:grid-cols-[1.6fr_1fr]` (`CrewSection.tsx:131`) to match `.cols.split-wide`. [Show crew is the wide-left, Key contacts the narrow-right.]
- Contact buttons (phone + email icon buttons, `.cbtn` 44px), You/Lead/Primary tags — VERIFY the impl `PersonRow` already renders both icon buttons + tags (the impl map says it does, `PersonRow:97-196`); if so, no change. The screenshot's single "Call" text button is likely stale-deploy — confirm in the real-browser task.

### 2. Schedule (`ScheduleSection.tsx:226-344`, `DayCard.tsx:28-57`)
- **Date badge** — the biggest miss. `DayCard`'s `day` eyebrow (a `formatIsoDate(...,"weekday-short")` string like `"Wed, Apr 15"`, `ScheduleSection.tsx:219`) → the mock's **`.day .date`** badge: a 50px-wide column stacking `.dow` (weekday, 11px/700/uppercase, `text-text-faint`, `text-accent-on-bg` when today) over `.dnum` (day-of-month, 23px/800, `text-text-strong`). A new `formatIsoDate` mode or a small `{ dow, dnum }` splitter from the ISO date (UTC, matching the existing helper's TZ handling).
- **Phase-tone dot** — the phase line gets a leading dot `.pd` colored by tone: travel=`border-strong` gray, set=`#caa53a` amber, show=`accent`. [mock `.day .phase .pd`]
- **"Today" pill** — the today row shows a trailing `.phasepill.show` "Today" pill (`accent-wash` bg, `accent-on-bg` text). The impl already has a `schedule-day-today` testid hook (`ScheduleSection.tsx:311`) — render the visible pill there.
- **Row layout** — `.day` is a horizontal flex (date badge | `.vline` 1px divider | `.dinfo` phase+meta | Today pill), not the impl's vertical card. Restructure `DayCard` to the horizontal form.
- **Right column** — keep `KeyTimesStrip` (the anchor times) but present it inside a `SectionCard` titled "Daily call times" with `KeyValueRows` (k/v/sub), matching the mock's `Tile "Daily call times"`. The mock's separate "Heads up" `Empty` card is a fixture flourish — only render an analog if there's real data (NO invented content).

### 3. Travel (`TravelSection.tsx:60-397`)
- **`travelrow` structure** — the getting-there legs → the mock's `.travelrow`: a 34px sunken mini-icon (`plane` for flights, `car` for ground) + a `.tcol` stacking `.tlabel` (eyebrow), `.tprimary` (15px/700 strong), `.tmeta` (13px subtle), `.tconf` (11.5px faint, tabular-nums). Map driver/vehicle/leg rows onto this. [mock `TravelSection` + `.travelrow`]
- **Hotel structured** — confirm the hotel card renders name (17px/700 strong) + address (13px subtle) + `KeyValueRows` (Check-in/Check-out/Room/Confirmation) per the mock; the impl already uses `KeyValueRows` for the hotel (`TravelSection` map), so the screenshot's run-on blob is likely stale-deploy — confirm in the real-browser task, fix only if the current code is actually a run-on.
- **Column ratio** — `min-[720px]:grid-cols-2` → `grid-cols-[1.6fr_1fr]` (`TravelSection.tsx:369`), getting-there wide-left, hotel narrow-right (matches `.cols.split-wide`). The full-width flight block above the grid (the DEF-FLIGHT-1 "Your flight" card) stays.

### 4. Venue (`VenueSection.tsx:73-267`)
- **Mini-icon KVRows** — the venue fact rows (Loading dock / Parking / Crew Wi-Fi) → `KeyValueRows` with the mock's `.kvrow .k .mini` 28px sunken icon squares (`dock`/`car`/`wifi` glyphs) + `sub` labels. [impl plain `<p>` `VenueSection.tsx:181` ↔ mock `KVRows` w/ icons]
- **Address 2-line** — Address value renders street on line 1, city/region muted on line 2 (`<br/>` + `.muted`), per the mock `kv` Address dd.
- Column ratio already `[1.6fr_1fr]` (`VenueSection.tsx:243`) ✓ — no change. Site-diagrams right column already present (data-driven) ✓.

### 5. Today (`TodaySection.tsx:136-369`)
- The impl **deliberately stacks** Tonight/Where/Need-something full-width at all widths (`TodaySection.tsx:241` comment, the Phase-1 owner decision: the 3 cards stacking avoids the 390px clip). The mock's Today is `split-wide` (run-of-show LEFT | the 3 cards stacked RIGHT). **Reconcile:** when a run-of-show timeline IS present (data-driven), adopt the mock's `split-wide` (timeline wide-left, the 3 cards stacked narrow-right); when it is ABSENT (the common wrapped/empty case), keep the full-width stack (no empty left column). State this as an explicit mode boundary. [This is the one section with a genuine layout fork — the spec MUST enumerate both modes.]

### 6. Gear (`GearSection.tsx:118-365`)
- Scope grid already `min-[720px]:grid-cols-3` (`GearSection.tsx:217`) matching `.cols.thirds` ✓. Pack list ✓. **No change** unless the real-browser task surfaces a craft gap (verify the scope tiles' bullet style matches the mock's accent-dot bullets).

## Dimensional invariants (Tailwind v4 — every parent→child dimension explicit; see [[feedback-tailwind-v4-flex-items-stretch]])

- **split-wide grid (Crew/Travel/Schedule/Venue):** `min-[720px]:grid-cols-[1.6fr_1fr] min-[720px]:items-stretch`; both columns `min-w-0`; each column's `SectionCard` is `h-full`. Assert at ≥720px: left col width ≈ 1.6× right col (±2px), both cards equal height.
- **Date badge:** `.date` fixed `w-[50px]` (`width:50px` in mock); `.dnum` line-height 1; the badge column does NOT shrink (`shrink-0`). Assert the badge width == 50px and the `.vline` divider fills the row height (`self-stretch`).
- **Avatar:** 40px square (`size-10`), `rounded-pill`, colored bg, white text centered; `shrink-0`.
- **Mini-icon (KVRows):** 28px square (`size-7`) sunken rounded; glyph 15px. **Travelrow mini:** 34px square. Assert each renders at the stated size inside its row.

## Transition inventory

No new animated states. The `.stagger` entrance + the existing section crossfade (`CrewSectionTransition`) are unchanged. The date-badge / colored-avatar / travelrow changes are static structure (no new mode toggles). Today's run-of-show-present vs absent is a **data-driven render fork, not an interactive transition** — instant, no animation (state it explicitly).

## Guard conditions (every prop's null/empty/zero/NaN)

- `avatarColor("")` / blank → slate swatch + `"?"`. `avatarColor` is total (any string → a swatch).
- Date badge with an unparseable/missing ISO → fall back to the existing `formatIsoDate` text (never throw; never render `NaN`).
- A day with no `meta` → omit the meta line (the badge + phase still render).
- Travelrow with a missing `tmeta`/`tconf`/`tprimary` → omit that line only (the row + icon + label still render).
- Venue KVRow with a hidden value (`shouldHideGenericOptional`) → the row is omitted (existing behavior preserved — the sentinel-hiding contract still applies at the read site).

## Meta-test inventory

- **`tests/components/tiles/_metaSentinelHidingContract.test.ts`** — EXTENDED coverage already walks `components/crew/`; the restructured `DayCard`/`PersonRow`/KVRows must keep routing optional values through `shouldHideGenericOptional` at the read site (no regression).
- **Layout-dimensions (real-browser) task** — MANDATORY (fixed-dimension parents): a Playwright/`chrome-devtools` assertion at ≥720px and at 390px that `getBoundingClientRect()` on each split-wide section's two columns matches the 1.6/1 ratio (±2px) at ≥720px and stacks (single column) at 390px; and that the date badge is 50px and the avatar is 40px. jsdom is NOT sufficient.
- No new §12.4 codes; no DB/RPC/advisory-lock surface (N/A).

## UI quality gate (invariant 8)

Every changed surface ships only after **`/impeccable critique` AND `/impeccable audit`** pass on the diff (HIGH/CRITICAL fixed or DEFERRED), run with the v3 preflight gates (PRODUCT.md / DESIGN.md incl. the new avatar amendment / register / preflight), BEFORE the Codex adversarial review and milestone close. The impeccable REAL-BROWSER render is the gate that catches @theme-token fallbacks + the stale-deploy-vs-code confirmation (per [[feedback-impeccable-external-attestation-required]]).

## Self-review notes (disagreement-loop preempts for the reviewer)

- The `&#10;`/raw-ISO are **stale-deploy artifacts, NOT code bugs** (cite `_helpers.ts:60` + `format/date.ts:24`) — do not relitigate as code defects; the fix is a re-sync, tracked separately.
- The **720px viewport breakpoint** (not the mock's 980px container query) is an **intentional, ratified repo pattern** (`app/globals.css:191-196`) — do not relitigate container-vs-viewport.
- **Colored avatars** are an **owner-ratified DESIGN.md amendment** (2026-06-19), not a §1 violation — the amendment carves identity avatars out of the single-accent rule.
- Today's **stack-vs-split-wide** is a ratified **data-driven mode fork** (run-of-show present → split-wide; absent → stack), not an inconsistency.
