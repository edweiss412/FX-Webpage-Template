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

For the two EXISTING tokens, only the **light** block (`:root` defaults, `app/globals.css:266-299` region) changes — their dark values (`@media (prefers-color-scheme: dark)` at `:313-331` and `[data-theme="dark"]` at `:355-372`) are already correct and stay as-is. The NEW `--color-accent-edge` token is different: its runtime value MUST be defined in **all three** blocks (`:root` light `#7a3d00`; the `@media` dark block AND the `[data-theme="dark"]` block both `#ffa047` — the two dark blocks must stay value-identical, pinned by test), plus the `@theme` alias below.

| Token | Line (pre-change) | Old | New | Resulting ratios (measured) |
| --- | --- | --- | --- | --- |
| `--color-accent-text-runtime` (light) | `app/globals.css:278` | `#ffffff` | `#0e0f12` | 8.23:1 on `#ff8c1a`; 6.53:1 on hover `#e67a0e` |
| `--color-accent-on-bg-runtime` (light) | `app/globals.css:279` | `#c25e00` | `#a65000` | 5.34:1 on bg `#fafaf9`; 5.57:1 on surface `#ffffff`; and — because REAL TEXT consumers sit on tinted fills (see below) — 4.92:1 on `bg-accent/10`-over-bg (`#fbefe3`), 4.74:1 on `bg-accent/15`-over-bg (`#fbead8`), 4.91:1 on accent-tint `#feeede`, 4.76:1 on stale-tint `#f4ece0`. Every pairing ≥4.5:1 text AA. (`#b35600` was evaluated and REJECTED: 4.73:1 on bg but 4.21–4.37:1 on the tinted text surfaces.) |
| `--color-accent-edge-runtime` (NEW, all three blocks) | added beside the accent group | — | light `#7a3d00`, dark `#ffa047` (both dark blocks) | light: 3.61:1 vs track `#ff8c1a`, 8.06:1 vs bg, 8.42:1 vs surface. Dark value is decorative (see §4.1) |

**Tinted-consumer audit (drives the `#a65000` choice):** `text-accent-on-bg` has ~40 consumers; most sit on `bg`/`surface`, but a grep-verified subset renders TEXT on tinted fills — `components/admin/wizard/step3ReviewSections.tsx:1590` (`bg-accent/10`), `components/crew/sections/TravelSection.tsx:596` (`bg-accent/15`, `text-[9px]` — 4.5:1 floor applies), and stale-tint chips (`--color-stale-tint` `#f4ece0`, e.g. `StagedReviewCard`/`ArchivedShowRow` surfaces — plan enumerates the full list). Repo-wide max accent alpha under text is `/15` (`bg-accent/6` at `step3ReviewSections.tsx:1577` is lighter). The plan re-runs this audit (`rg 'text-accent-on-bg'` × rendered background per site) and any consumer found on a background NOT in the §6.1 pinned set either gets its pairing pinned or is migrated to a passing pair — no unpinned text pairing ships.

The new token REQUIRES both halves of the Tailwind v4 wiring (`app/globals.css` pattern at `:56-66`): the `@theme` alias `--color-accent-edge: var(--color-accent-edge-runtime);` (which is what makes the `border-accent-edge` utility exist) AND the three runtime-value blocks. Runtime values alone generate NO utility — the class string would be dead. Proven two ways in §6.

Knock-on consumers that inherit automatically (no per-surface edits): every `text-accent-text` CTA/badge (30 files — `components/shared/AccentButton.tsx`, wizard steps, nav count badges, error pages, crew interstitial, etc.), every `text-accent-on-bg` link/emphasis surface (StagedReviewCard, IdentityChip, DashboardFooter, status pills), `--color-status-live-text` (aliases `--color-accent-on-bg`, `app/globals.css:89`), and the bell info icon (`accent-on-bg` on `accent-tint`, pinned at `tests/styles/status-token-contrast.test.ts:140-142`).

`--color-accent-text` becomes the same hex in both modes. It stays a **mode-scoped token** (no consolidation): the light/dark split is the token's structure, and a future brand tweak may re-diverge it.

## 4. Component changes

### 4.1 Toggle ON boundary (DEVTIER-2; WCAG 1.4.11)

The shared toggle recipe `on ? "border-accent bg-accent" : "border-border-strong bg-surface-sunken"` changes to `on ? "border-accent-edge bg-accent" : "border-border-strong bg-surface-sunken"`, where `--color-accent-edge` is a NEW token whose sole job is the ON-state control boundary.

**Why a dedicated token, and the dual-side requirement (WCAG 1.4.11):** a 1px border nested between the orange track and the page must clear ≥3:1 against BOTH adjacent colors, or it visually merges with one of them. `accent-on-bg` (`#a65000`) was evaluated and REJECTED for this role: 5.34:1 vs bg but only **2.39:1 vs the `#ff8c1a` track** — it would read as part of the track and the component boundary would remain the failing track-vs-bg pair. `--color-accent-edge` light `#7a3d00` measures **3.61:1 vs the track** and **8.06:1 vs bg / 8.42:1 vs surface** — the boundary passes on both sides. In dark mode the track itself IS the passing boundary (`#ff8c1a` vs `#0f1014` = 8.16:1; vs surface `#16171c` = 7.69:1), so the dark edge value `#ffa047` is decorative (a subtle lighter rim matching `accent-hover` dark) and carries no 1.4.11 load. Sites (verified identical recipe):

- `components/admin/settings/NotifyToggle.tsx:134`
- `components/admin/settings/AutoPublishToggle.tsx:126`
- `components/admin/settings/DeveloperToggleButton.tsx:93`
- `components/admin/PublishedToggle.tsx:146`
- `components/admin/telemetry/AutoRefreshControl.tsx:106` — this one is borderless (`on ? "bg-accent" : "bg-surface-sunken"`); it gains `border` + the same conditional border pair so the recipe unifies.

Thumb (`bg-bg`, `h-5 w-5` inside `h-7 w-12`) is unchanged: the component boundary contrast is carried by the track border, and the toggle state is never color-only (thumb `translate-x` + `aria-checked` + visible label — the DEVTIER-2 mitigations remain).

### 4.2 Eyebrows (VCR-1)

- `CELL_EYEBROW_CLASS` (`components/admin/wizard/step3ReviewSections.tsx:392`): `text-text-faint` → `text-text-subtle`.
- The constant does NOT cover everything: two HARD-CODED eyebrow literals bypass it — the Venue and Loading-dock row labels at `components/admin/wizard/step3ReviewSections.tsx:950` and `:990` (`text-[10px] font-semibold text-text-faint uppercase`). Both are replaced with `CELL_EYEBROW_CLASS` (they are the same visual role; inlining diverged, this re-unifies). Implementation runs the full class-sweep `rg 'text-\[10px\].*text-text-faint|text-text-faint.*text-\[10px\]' components/ app/` and brings every hit under the same treatment or enumerates it with a reason.
- **Structural pin:** a new scan in the tests asserts NO file under `components/admin/wizard/` pairs `text-text-faint` with `text-[10px]` on one class string (the failing 10px-faint pattern), so re-inlined eyebrows fail by default.
- `components/admin/wizard/VenueMapTile.tsx` "map" badge (`text-[10px] text-text-faint` on `bg-surface/85`): → `text-text-subtle`. (Badge is `aria-hidden` but sighted-legibility still applies at 10px.)
- `--color-text-faint` token value is **unchanged**. Other `text-text-faint` consumers are out of scope (decorative/large-text uses; the auditor's recommendation was exactly this split). `BL-ADMIN-EYEBROW-FAINT-CONTRAST` closes for the Stage-3 eyebrow surface; any remaining small-text faint use found during implementation gets enumerated in the plan's class-sweep, not silently skipped.

### 4.3 TEL-1 re-tone

- `components/admin/telemetry/EventFilters.tsx:90`: selected level segment `bg-accent text-accent-text` → `bg-text text-bg` (inverted neutral: 16.47:1 light, 15.23:1 dark). Unselected stays `text-text-subtle`.
- `components/admin/telemetry/EventRow.tsx:103`: requestId chip `text-accent-on-bg` → `text-text-subtle` (6.09:1 light / 6.94:1 dark on `bg-surface-sunken`).
- Accent-as-matters-now survivors (deliberately unchanged): live-refresh pulse + ON dot (`AutoRefreshControl.tsx:86,90`), sparkline current-hour bar (`EventVolumeSparkline.tsx:33`), nav/bell count badges (`AdminNav.tsx:196`, `NotifBell.tsx:79`), crew live/today surfaces.

### 4.4a Raw-accent TEXT states (sweep + migrate; closes the class structurally)

Raw `text-accent` (light 2.23:1 on bg) and `hover:text-accent-hover` (light `#e67a0e` ≈ 2.9:1) are under-AA wherever they color load-bearing text or glyphs. WCAG 1.4.3 is not waived for hover text (project precedent: the /help prose-link Codex round 2, BACKLOG `BL-ACCENT-ON-BG-AA-CONTRAST` filing). Grep-verified sites and dispositions:

- `components/crew/CrewSubNav.tsx:98` — ACTIVE mobile tab label+icon `text-accent` → `text-accent-on-bg`. (The desktop active icon already uses `text-accent-on-bg`, `:109`; this unifies.)
- Link hover shifts `hover:text-accent-hover` on `text-accent-on-bg` links — `components/auth/IdentityChip.tsx:62`, `components/admin/HelpAffordance.tsx:111`, `components/admin/StagedReviewCard.tsx:430`, `components/admin/DashboardFooter.tsx:35`, `components/admin/wizard/Step1Share.tsx:94,122`, `components/admin/wizard/Step2Verify.tsx:359`, `app/admin/show/[slug]/CrewPageLink.tsx:28` — the hover COLOR SHIFT is **deleted**: links stay `text-accent-on-bg` in every state; hover feedback is the already-present persistent underline + cursor (the exact /help resolution). Same for `components/shared/ReportModal.tsx:513`'s `hover:text-accent`.
- Decorative aria-hidden glyphs `text-accent` — `app/admin/show/[slug]/RotateShareTokenButton.tsx:170,184` (Check icons), `app/admin/show/[slug]/ResetPickerEpochButton.tsx:178`, `app/admin/show/[slug]/PickerResetControl.tsx:184` — migrated to `text-accent-on-bg` (uniform; even decorative glyphs then clear 3:1).
- Implementation re-runs the sweep with hyphen-guarded matchers (`\b` is WRONG here — it matches before the `-` in the SAFE `hover:text-accent-on-bg`; same regex class as the PR #354 bare-operand lesson): `rg '(^|[^A-Za-z0-9-])text-accent(?![A-Za-z0-9-])' -P components/ app/` and `rg 'hover:text-accent(-hover)?(?![A-Za-z0-9-])' -P components/ app/` — every hit migrated or exempted with reason.

**Structural pin:** new `tests/styles/_metaRawAccentText.test.ts` walks `components/**` and `app/**` (filesystem walk, fails-by-default on NEW files), TOKENIZES each class string on whitespace, and rejects a token iff it is EXACTLY `text-accent`, `hover:text-accent`, or `hover:text-accent-hover` (any variant-prefix chain ending in those, e.g. `md:hover:text-accent`) — exact-token match, not substring/word-boundary, so `text-accent-on-bg`, `hover:text-accent-on-bg`, and `text-accent-text` never match. The test includes fixture self-checks proving `hover:text-accent-on-bg` is ACCEPTED and `hover:text-accent-hover` is REJECTED (guards the matcher itself). Explicit file+line+reason allowlist (empty at ship; mechanism exists for future justified decorative uses).

`bg-accent` FILLS are governed by §4.1b below, not the text scan.

### 4.1b `bg-accent` fill audit — every consumer, disposition per WCAG 1.4.11

WCAG 1.4.11 grounding (W3C Understanding SC 1.4.11, "Non-text Contrast"): the 3:1 floor applies to **visual information required to identify the component or its state**. A control identified by its visible text label does NOT require a 3:1 boundary around the hit area ("This Success Criterion does not require that controls have a visual boundary indicating the hit area"). What DOES require 3:1: state indicators conveyed by color alone, and graphical objects needed to understand content. Complete grep-verified consumer table (excluding `-tint`/`-hover`/alpha variants):

The inventory below is GENERATED (2026-07-16, `rg -nP` exact-token variant-chain matcher over `components/**` + `app/**`, 60 hits) and lists EVERY occurrence individually — it is the seed content of the meta-row-11 registry. The scanner strips code comments before matching (5 of the 60 hits are JSDoc/comment mentions: `AccentButton.tsx:10,17,34`, `ReportButton.tsx:27`, `RightNowCard.tsx:617` — non-rendered, excluded; a fixture self-check proves comment text never registers).

| Disposition | Occurrences (file:line, every one) | Rationale |
| --- | --- | --- |
| **A. Labeled control — EXEMPT** (37) | `app/admin/error.tsx:47`; `app/admin/settings/admins/AddAdminForm.tsx:127,147`; `app/admin/settings/admins/error.tsx:81`; `app/admin/settings/admins/RevokeRowButton.tsx:169,211,284`; `app/admin/settings/error.tsx:47`; `app/admin/settings/roles/RoleMappingRow.tsx:295`; `app/admin/show/[slug]/PickerResetControl.tsx:232`; `app/admin/show/[slug]/ResetPickerEpochButton.tsx:211`; `app/admin/show/[slug]/RotateShareTokenButton.tsx:235`; `app/admin/show/[slug]/ShareLinkCopyButton.tsx:65`; `app/global-error.tsx:28`; `app/me/page.tsx:414`; `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:150`; `app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:94,117`; `app/show/[slug]/[shareToken]/error.tsx:22`; `app/show/[slug]/unpublish/ConfirmUnpublishForm.tsx:83`; `components/admin/Mi11GateActions.tsx:76`; `components/admin/RoleRecognizeControl.tsx:72`; `components/admin/settings/AddAdminDisclosure.tsx:30`; `components/admin/nav/AdminNav.tsx:196`; `components/admin/nav/NotifBell.tsx:79`; `components/admin/wizard/Step1Share.tsx:232`; `components/admin/wizard/Step2Verify.tsx:112`; `components/admin/wizard/Step3ReviewModal.tsx:1378,1464`; `components/shared/AccentButton.tsx:101`; `components/shared/ReportButton.tsx:100`; `components/shared/ReportModal.tsx:544,583,614,670,682`; `components/admin/ResolveAlertButton.tsx:160` (`disabled:hover:bg-accent`) | Every one is the shared CTA/labeled-control recipe (`rounded-sm bg-accent … text-accent-text` + visible text, or a count badge with a number). Identified by its label, which after the R2 flip clears 8.23:1 AA on the fill. Boundary not required per the Understanding doc quote above. |
| **B. Stateful fill — TREATED** (7) | Toggles `components/admin/PublishedToggle.tsx:146`, `components/admin/settings/AutoPublishToggle.tsx:126`, `components/admin/settings/DeveloperToggleButton.tsx:93`, `components/admin/settings/NotifyToggle.tsx:134`, `components/admin/telemetry/AutoRefreshControl.tsx:106` (§4.1, `border-accent-edge`); `components/admin/telemetry/EventFilters.tsx:90` selected segment (§4.3 re-tone to inverted neutral — the `bg-accent` occurrence DISAPPEARS); `components/admin/OnboardingWizard.tsx:151` ACTIVE step pill — `border-transparent bg-accent` → **`border-accent-edge bg-accent`** (active-vs-visited state was fill-color-only; gains the same 1px edge treatment as the toggles) | State indicator must clear 3:1; the edge token is the uniform treatment. |
| **B2. Stateful fill — REDUNDANT NON-COLOR CUE, exempt** | `Step3SheetCard.tsx:121` checkbox (Check glyph `opacity-0→100` at `:124` is the state cue; glyph is `text-accent-text`, 8.23:1 on the fill after the flip) | Checked state readable without color. Enumerated, not silently skipped. |
| **B4. Load-bearing graphical indicator — TREATED** | `BellPanel.tsx:292` unread pip (`bg-accent ring-2 ring-surface`; the row's OTHER unread cue is a tinted background, also color — title weight is deliberately constant per `:313-319`, so the pip is required visual information) → fill becomes **`bg-accent-on-bg`** (`#a65000`: 4.9:1 vs the white ring/surface). `RightNowHero.tsx:556` show-day progress segments (inside a `role="img"` "Show day N of M" indicator at `:535-557` — NOT decorative; raw accent is 1.46:1 vs `border-strong`, 2.23:1 vs bg) → ACTIVE segment fill becomes **`bg-accent-on-bg`** (5.34:1 vs bg; 4.38:1 vs the inactive `bg-border` `#e5e4e0` segments; dark `#ffa047` = 5.52:1 vs `#3a3b40`). Class assertions for both in §6.2. | Graphical objects required to understand state must clear 3:1 (WCAG 1.4.11); both now do with margin. |
| **C. Non-interactive / decorative — EXEMPT** (7) | `components/crew/RightNowHero.tsx:498` (aria-hidden live dot beside text), `components/right-now/RightNowCard.tsx:629` (live dot, paired "Live" label per DESIGN.md L41), `components/admin/telemetry/EventVolumeSparkline.tsx:33` current-hour bar, `components/crew/primitives/DayCard.tsx:100` tone dot, `components/admin/wizard/Step3ReviewModal.tsx:1064` side bar, `components/admin/telemetry/AutoRefreshControl.tsx:86,90` ping/dot (paired with the labeled toggle + visible label) | Decorative or redundant with adjacent text; not "required to identify" anything. |

Occurrence accounting: 37 labeled + 7 stateful-treated (5 toggles + wizard active pill, `border-accent-edge`; EventFilters re-toned so its occurrence disappears) + 1 redundant-glyph (`Step3SheetCard.tsx:121`) + 2 darkened-fill (B4 — both leave the scan post-change) + 7 decorative + 5 comment-stripped = 59 accounted from the 2026-07-16 generation. **The implementation regenerates the inventory as the registry seed and MUST reconcile every hit — including any generation-count delta against this table — to a disposition with zero unaccounted rows; the meta-test registry is canonical, this table is the human-readable seed.**

**Structural pin (meta row 11):** a filesystem-walked scan over `components/**`/`app/**` inventories EVERY `bg-accent` occurrence using the SAME tokenizer discipline as the §4.4a text ban: tokenize class strings on whitespace, strip the Tailwind variant chain (any `foo:`/`data-[…]:`/`aria-…:`/`!` prefixes), and match a token iff its final utility segment is EXACTLY `bg-accent` (so `bg-accent-tint`/`bg-accent-hover`/`bg-accent/10` never match, but `disabled:hover:bg-accent` — a real existing shape at `components/admin/ResolveAlertButton.tsx:160`, disposition `labeled` — and any future `aria-selected:bg-accent`/`data-[state=active]:bg-accent` DO). Fixture self-checks prove `disabled:hover:bg-accent` and `data-[state=active]:bg-accent` are caught and `bg-accent-tint` is not. The scan covers every syntactic shape — conditional class expression, `{cond && <span …>}` subtree, helper constant, static literal. Every occurrence must be accounted for in the test's **per-occurrence** disposition registry: `{ file, index (nth exact-token occurrence in file), contextSnippet, disposition: 'labeled' | 'edge-treated' | 'darkened-fill' | 'redundant-glyph' | 'decorative' }` — one row per occurrence, never one blanket row per file (a file-level disposition could bless a new under-contrast indicator added to an already-registered file). A NEW occurrence anywhere (unregistered index / snippet mismatch / unregistered file) fails by default; an `edge-treated` occurrence's context must contain `border-accent-edge`. This closes the bypass where a conditionally-RENDERED static-class accent fill (not a conditional class string) would evade a ternary-only scan.

### 4.4 TEL-2 badge escalation

`components/admin/telemetry/EventLevelBadge.tsx:7`: error row changes from `bg-warning-bg text-warning-text font-semibold` → `bg-status-degraded text-status-degraded-text font-semibold` (solid degraded fill; existing token pair, `app/globals.css:298-299` light `#ffffff` on `#b3261e` = 6.54:1, dark `:345-346` `#1a1a1a` on `#e5534b` = 4.70:1 — both AA). The tinted BellPanel-critical pairing (`bg-danger-bg text-status-degraded`) was evaluated and REJECTED for this badge: it measures 4.10:1 in dark mode, under the 4.5:1 text floor. (BellPanel `components/admin/BellPanel.tsx:134` itself is NOT a violation — there `text-status-degraded` colors an icon, a graphical object with a 3:1 floor; no change there.) Info and warn rows unchanged. The `data-testid` contract (`event-level-${level}`) and defensive fallback are unchanged. The dot (`bg-current`) inherits the new text color and stays visible on the solid fill.

## 5. DESIGN.md corrections

Every touched figure is corrected to the measured value (the numeric-sweep target set):

- **L31 (`--color-accent`)**: unchanged value; no figure.
- **L33 (`--color-accent-text`)**: light hex `#FFFFFF` → `#0E0F12`; rationale rewritten — "near-black on orange in BOTH modes; 8.23:1 in each (same hex pair; the old dark-row 11.3:1 figure was itself a miscalculation). The former white-on-orange light pairing measured 2.33:1 (the 4.07:1 figure was a luminance miscalculation) and failed every WCAG tier."
- **L34 (`--color-accent-on-bg`)**: light hex `#C25E00` → `#A65000`; figure 4.6:1 → 5.34:1 (AA body, and ≥4.5:1 on every audited tinted text fill per §3); the "brand #FF8C1A only hits 3.0:1" side-claim corrected to its measured 2.23:1, and the "fine for a 24px+ glyph" allowance is DELETED — 2.23:1 fails the 3:1 graphical floor too. Replacement wording: "raw `--color-accent` on light bg is decorative-only; it must be redundant with an adjacent text label or shape cue (the today-pin and DayCard dots qualify: both sit beside date/label text), and any load-bearing orange-as-text/glyph use must go through `--color-accent-on-bg`."
- **L41 (`--color-status-live`/`-text`)**: light `-text` hex updates to `#A65000` (alias follows accent-on-bg). The `--color-status-live-text: var(--color-accent-on-bg)` alias at `app/globals.css:89` is pinned by a source-scan assertion (meta row 9) so the documented value can never fork from the alias.
- **L47 (`--color-accent-tint`)**: icon figure 3.8:1 → 4.91:1 (new accent-on-bg on tint; now also passes the 4.5:1 TEXT floor, upgrading the tint from graphical-only).
- **§1.2 table L57**: accent on bg "3.0:1" → measured 2.23:1, note reworded (AA-large claim removed; accent raw on light bg is decorative-only).
- **§1.2 table L58**: light 4.6:1 → 5.34:1; dark 9.8:1 → 9.39:1 (also a stale figure; L34's dark "9.8:1" corrects to 9.39:1 in the same edit).
- **§1.2 table L59**: 4.07:1 → 8.23:1, note "AA-large+bold" → "AAA-adjacent / AA body both modes".
- **§1.2 table L70**: 3.8:1 → 4.91:1.
- New §1.1 row for `--color-accent-edge` (light `#7A3D00` / dark `#FFA047`): "ON-state control boundary (toggle track border). Light: 3.61:1 vs the orange track and 8.06:1 vs bg — passes WCAG 1.4.11 on both adjacent sides. Dark: decorative; the track itself clears 8.16:1 vs bg."
- New §1.2 rows: `accent-edge` vs `accent` (3.61:1 light), `accent-edge` vs `bg` (8.06:1 light); `accent` vs `bg` dark (8.16:1) noted as the dark-mode toggle boundary.
- §1.1 prose "primary CTAs" sentence gains: selected-filter segments are NOT an accent surface (inverted neutral is the selected-state recipe; accent is reserved for live/matters-now + CTAs).

All other figures in §1.1/§1.2 get a one-time verification sweep during implementation (same formula); any additional stale figure found is corrected in the same commit and enumerated in the PR body.

## 6. Tests

### 6.1 Meta-test inventory (writing-plans rule)

- **EXTENDS** `tests/styles/status-token-contrast.test.ts` — new pinned rows (both modes, reading live hex from `globals.css` like the existing rows):
  1. `accent-text` on `accent` ≥ 4.5:1 (text floor; CTAs are body-size bold)
  2. `accent-text` on `accent-hover` ≥ 4.5:1
  3. `accent-on-bg` on `bg` AND on `surface` ≥ 4.5:1 (the backlog-prescribed row)
  3b. `accent-on-bg` AS TEXT on every audited tinted fill ≥ 4.5:1, computed with an alpha-blend helper in the test: on `accent`@0.10-over-`bg`, `accent`@0.15-over-`bg`, on `accent-tint`, and on `stale-tint` — BOTH modes (dark side computes the same composites over the dark `bg`)
  4. Toggle boundary, light mode: `accent-edge` vs `accent` ≥ 3:1 AND `accent-edge` vs `bg` ≥ 3:1 AND `accent-edge` vs `surface` ≥ 3:1 (every adjacent pair the 1px border touches)
  5. Toggle boundary, dark mode: `accent` (track) vs `bg` ≥ 3:1 AND vs `surface` ≥ 3:1 (the track itself is the boundary; the dark edge value is decorative and un-pinned)
  6. Token WIRING (not just values): the `@theme` block contains `--color-accent-edge: var(--color-accent-edge-runtime)` — pinned by the same source-scan mechanism the file already uses (a runtime value without its `@theme` alias is a dead token).
  7. Dark-block parity: `--color-accent-edge-runtime` is defined in BOTH dark blocks (`@media (prefers-color-scheme: dark)` and `[data-theme="dark"]`) with identical values (the existing `block()` helper reads each scope independently — assert equality), so system-dark and toggled-dark users get the same edge.
  8. **DESIGN.md figure parity**: for EVERY numeric contrast figure this spec touches in BOTH §1.1 (the token-table rationale cells: accent-text, accent-on-bg, accent-tint, status-live-text, and the new accent-edge row) AND §1.2 (core-pair table rows L57-L59, L70, plus the new accent-edge rows), parse the documented "N:1" figure out of `DESIGN.md` and assert it equals the ratio computed from the live `globals.css` hexes within ±0.05 — documented figures can no longer drift from shipped tokens (the exact failure class this whole pass repairs). Any touched figure NOT covered by the parser must be explicitly listed in the test as a known-unpinned exception with reason.
  9. Raw-accent text ban: `tests/styles/_metaRawAccentText.test.ts` per §4.4a (filesystem-walked, empty allowlist at ship).
  10. Alias pin: `--color-status-live-text` still reads `var(--color-accent-on-bg)` (source scan of the alias block at `app/globals.css:89`), so status-live text inherits every accent-on-bg guarantee.
- **Real-browser computed-style proof** (Playwright, extends `tests/e2e/developer-toggle-layout.spec.ts` or a sibling spec): with the Developer toggle ON, `getComputedStyle(track).borderColor` resolves to `rgb(122, 61, 0)` (light) — proving the `border-accent-edge` utility actually generated CSS, not merely that the class string is present. (jsdom cannot prove this; Tailwind utilities don't exist there.)
- **Wizard eyebrow structural scan** (per §4.2): no `text-text-faint` + `text-[10px]` pairing anywhere under `components/admin/wizard/`.
  (Existing rows at `:140-145` — bell icon ≥3:1 on tint, pill text — re-run green with the new values.)
- **NOT extended:** `tests/styles/_metaDesignTokenPairs.test.ts` (scoped to `app/help/_components` by its own v1 scope note; no help files change), advisory-lock/infra/mutation registries (no DB, no mutation surface, no Supabase call — this diff is CSS tokens + class strings + docs).

### 6.2 Behavioral/unit updates

- Component tests pinning the old class strings are updated to the new recipes (TDD: change assertion first, watch fail, flip implementation). Known candidates from the pre-spec grep (`text-accent-text` / `bg-accent` / eyebrow / badge testids): `tests/components/atoms/AccentButton.test.tsx`, `tests/styles/accent-button-atom.test.ts`, `tests/components/admin/wizard/step3ReviewSections.test.tsx`, `tests/components/telemetry/*`, `tests/e2e/developer-toggle-layout.spec.ts`, `tests/e2e/telemetry-layout.spec.ts` + the rest of the 18-file grep list; the plan enumerates each with its exact assertion.
- New assertions: BellPanel unread pip carries `bg-accent-on-bg` (not `bg-accent`); RightNowHero active progress segment carries `bg-accent-on-bg` (not `bg-accent`); EventLevelBadge error carries `bg-status-degraded text-status-degraded-text` and carries NEITHER `bg-warning-bg` NOR the rejected `bg-danger-bg text-status-degraded` pairing; EventFilters selected segment carries `bg-text text-bg` and no `bg-accent`; each toggle ON state carries `border-accent-edge` (and not `border-accent`); `CELL_EYEBROW_CLASS` contains `text-text-subtle` and not `text-text-faint`.
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
- Any DB/RPC/telemetry-write change: none. **Flag lifecycle:** N/A — no flags/toggles added (existing toggle components change one class string). **Guard conditions:** N/A — no prop contracts change; `EventLevelBadge` fallback (`?? BADGE.info`) unchanged. **Dimensional invariants:** see §9.1 — the AutoRefreshControl track gains a real 1px border, which is a geometry-touching change on a fixed-size parent and gets the mandatory real-browser rect assertions. **Transition inventory:** N/A — no new states, no animation changes; all edits are static color classes on existing states (`transition-colors` on toggles already covers the color swap).

## 9.1 Dimensional Invariants (toggle tracks — fixed-dimension parents)

Box-sizing is `border-box` (Tailwind preflight), so adding/recoloring a 1px border never changes outer geometry; absolutely-positioned thumbs position against the PADDING box (inside the border). Invariants, asserted in a real browser (Playwright `getBoundingClientRect()`, 0.5px tolerance — jsdom is NOT sufficient):

| Parent | Guarantee | Child relationship |
| --- | --- | --- |
| AutoRefreshControl track `h-5 w-[34px]` + NEW `border` | outer rect stays 34×20 after the border lands | thumb (`size-4`, `translate-x-[2px]`/`[16px]`) rect fully inside track rect in BOTH states; ON−OFF thumb `x` delta = 14px; ON thumb right edge ≤ track inner right edge |
| Settings/admin toggles `h-7 w-12 border` (×4, border pre-existing — color-only change) | outer rect stays 48×28 | thumb (`h-5 w-5`, `translate-x-1`/`-6`) fully inside track in both states |

Assertions extend `tests/e2e/telemetry-layout.spec.ts` (AutoRefreshControl — the geometry-touching one) and `tests/e2e/developer-toggle-layout.spec.ts` (one representative of the color-only four).

## 10. Accessibility floor summary (post-change, light mode — the failing mode)

| Surface | Pair | Ratio | Floor |
| --- | --- | --- | --- |
| CTA text | `#0e0f12` on `#ff8c1a` | 8.23 | 4.5 |
| CTA hover | `#0e0f12` on `#e67a0e` | 6.53 | 4.5 |
| Links/emphasis | `#a65000` on `#fafaf9` | 5.34 | 4.5 |
| Links on surface | `#a65000` on `#ffffff` | 5.57 | 4.5 |
| Tinted chips (text) | `#a65000` on `bg-accent/15`-over-bg | 4.74 | 4.5 |
| Toggle ON border vs page | `#7a3d00` vs `#fafaf9` / `#ffffff` | 8.06 / 8.42 | 3.0 |
| Toggle ON border vs track | `#7a3d00` vs `#ff8c1a` | 3.61 | 3.0 |
| Bell info icon | `#a65000` on `#feeede` | 4.91 | 3.0 (clears 4.5 text too) |
| Eyebrows | `#5a5b62` on `#fafaf9`-family | ≥6.09 | 4.5 |
| Selected filter | `#fafaf9` on `#1a1b1f` | 16.47 | 4.5 |
| requestId chip | `#5a5b62` on `#f4f3f1` | 6.09 | 4.5 |
| Error badge | `#ffffff` on `#b3261e` (dark: `#1a1a1a` on `#e5534b` = 4.70) | 6.54 | 4.5 |
| Bell unread pip | `#a65000` vs `#ffffff` ring/surface | 4.94 | 3.0 |
| Show-day active segment | `#a65000` vs bg / vs inactive `#e5e4e0` | 5.34 / 4.38 | 3.0 |
