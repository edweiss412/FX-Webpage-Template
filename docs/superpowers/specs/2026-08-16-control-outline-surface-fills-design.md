# Control outlines on surface fills — §1.2a predicate ruling + census swap

**Date:** 2026-08-16 · **Ledger entry:** `BL-CONTROL-OUTLINE-BORDER-STRONG-ON-SURFACE-FILLS` · **Branch:** `fix/control-outline-surface-fills`

**Status: SKELETON — awaiting the user's predicate ruling (§2). Both outcome branches drafted; the ruling deletes one.**

## 1.1 Resolved scope — do not relitigate

- The six sites repaired on `fix/ui-interactive-token-policy` (that diff created their inconsistency): `Step2Verify`'s re-scan + portaled footer advance (file-local `SECONDARY_BUTTON`), `DriveConnectionPanel`'s two actions, `RecentAutoAppliedStrip`'s confirmation-row control, the `AcceptChangeButton`/`UndoChangeButton` pair rendered by `ChangeFeedEntry.tsx:135`. Ratified in DESIGN.md §1.2a ("Six such controls DID move on 2026-08-14").
- The per-ground contrast figures measured 2026-08-15 (BACKLOG entry) — re-verified 2026-08-16 against runtime tokens in `app/globals.css`, matching exactly (§3 table).
- The subtle-on-interactive census and its negative pin (`tests/styles/_metaSubtleOnInteractive.test.ts`) — untouched by this arc.
- "This was a design upgrade, not a compliance repair" (DESIGN.md §1.2a, ratified 2026-08-14, spec §1.1 R5). The prior 1.59:1 boundary was NOT a WCAG failure; do not re-frame it as one.
- `disabled:opacity-60` drops outlines under 3:1 — documented limit (DESIGN.md §1.2a), not a finding.
- Tinted-plate outer-edge dips are `BL-CONTROL-OUTLINE-ON-TINTED-PLATES`'s scope, not this arc's (one overlap site handled at §4.3).

## 2. The decision (user-owned)

DESIGN.md §1.2a's control-outline rule currently reads: an outline around "a control whose fill is the near-ground (`bg-bg` on a `bg-surface` card, or on the `bg-surface-sunken` attention plate)" is a standalone stroke and takes the text ramp (`--color-text-faint`). The question: does "near-ground" stay page-ground-only, or does it become fill-equals-container — and are the three switch tracks in or out?

- **Option A — keep page-ground-only.** No swap. The 24 census sites keep `border-border-strong`; the entry closes as a documented position (label carries the affordance, per the R5 frame).
- **Option B — fill-equals-container, tracks OUT.** The 21 button/link sites swap to `border-text-faint`; the three switch tracks keep their separately-ratified boundary system (§1.2 accent-edge rows; OFF = `border-border-strong bg-surface-sunken`).
- **Option C — fill-equals-container, tracks IN.** All 24 swap, including the OFF-state track border.

**RULING: <!-- PENDING — filled after AskUserQuestion -->**

## 3. Census (derived cover, re-run 2026-08-16) and measured ratios

Derived cover (`tests/styles/interactiveScanCore.ts`):

```ts
scanInteractiveElements(process.cwd()).filter((e) =>
  allStrings(e).some((s) => /(^|\s)border-border-strong(\s|$)/.test(s)),
);
```

Returned **24** elements on 2026-08-16 (the entry said 23; the +1 is `components/diagrams/GalleryLightbox.tsx` reset chip, landed 2026-08-15/16 on `feat/diagram-demote-notice`, after the entry's count):

| # | Site | Fill | Ground class |
|---|------|------|--------------|
| 1 | `app/admin/settings/roles/RoleMappingRow.tsx:211` | `bg-surface` | button |
| 2 | `app/admin/settings/roles/RoleMappingRow.tsx:343` | `bg-surface` | button |
| 3 | `app/admin/show/[slug]/ResetPickerEpochButton.tsx:178` | `bg-surface` | button |
| 4 | `components/admin/ArchiveShowButton.tsx:365` | `bg-surface` | button |
| 5 | `components/admin/BellPanel.tsx:850` | `bg-surface` | button |
| 6 | `components/admin/BellPanel.tsx:1072` | `bg-surface` | button |
| 7 | `components/admin/Mi11GateActions.tsx:69` (reject branch) | `bg-surface` | button |
| 8 | `components/admin/RoleRecognizeControl.tsx:225` | `bg-surface` | button |
| 9 | `components/admin/StagedPreviewBanner.tsx:72` (picker Link) | transparent on `bg-warning-bg` | link — tinted-plate overlap, §4.3 |
| 10 | `components/admin/StagedReviewCard.tsx:649` | `bg-surface` | button |
| 11 | `components/admin/StagedReviewCard.tsx:660` | `bg-surface` | button |
| 12 | `components/admin/UnignoreButton.tsx:57` | `bg-surface` | button |
| 13 | `components/admin/settings/AutoPublishToggle.tsx:123` | track OFF `bg-surface-sunken` | switch track |
| 14 | `components/admin/settings/NotifyToggle.tsx:131` | track OFF `bg-surface-sunken` | switch track |
| 15 | `components/admin/PublishedToggle.tsx:292` | track OFF `bg-surface-sunken` | switch track |
| 16 | `components/admin/showpage/ShareHub.tsx:777` | `bg-surface` | button |
| 17 | `components/admin/telemetry/HealthAlertResolveButton.tsx:24` | `bg-surface` | button |
| 18 | `components/admin/telemetry/HealthAlertsPanel.tsx:256` | `bg-surface` | Link |
| 19 | `components/admin/wizard/Step3ReviewModal.tsx:604` | `bg-surface` | button |
| 20 | `components/admin/wizard/Step3ReviewModal.tsx:688` | `bg-surface` | button |
| 21 | `components/admin/wizard/step3ReviewSections.tsx:4121` | `bg-surface` | button |
| 22 | `components/admin/wizard/step3ReviewSections.tsx:4178` | `bg-surface` | button |
| 23 | `components/diagrams/GalleryLightbox.tsx:693` (reset chip) | `bg-surface-raised` | button — §4.2 |
| 24 | `components/shared/ReportModal.tsx:622` | `bg-surface` | button |

Measured 2026-08-16 (standard WCAG relative-luminance formula, runtime tokens from `app/globals.css` `:root` / `[data-theme="dark"]` blocks — same extraction as `tests/styles/secondary-action-contrast.test.ts`):

| Stroke vs ground | Light | Dark |
|---|---|---|
| `border-strong` vs `surface` | 1.59 | 1.60 |
| `border-strong` vs `surface-sunken` | 1.43 | 1.75 |
| `border-strong` vs `surface-raised` | 1.59 | 1.50 |
| `border-strong` vs `bg` | 1.52 | 1.70 |
| `text-faint` vs `surface` | 3.35 | 3.76 |
| `text-faint` vs `surface-sunken` | 3.02 | 4.11 |
| `text-faint` vs `surface-raised` | 3.35 | 3.53 |
| `text-faint` vs `bg` | 3.21 | 4.00 |
| `text-faint` vs `warning-bg` | 3.04 | 2.79 |
| `border-strong` vs `warning-bg` | 1.44 | 1.19 |
| fill-vs-container: `surface` vs `bg` | 1.04 | 1.06 |
| fill-vs-container: `surface-sunken` vs `surface` | 1.11 | 1.09 |
| fill-vs-container: `surface-raised` vs `surface` | 1.00 | 1.06 |
| fill-vs-container: `surface-raised` vs `bg` | 1.04 | 1.13 |
| fill-vs-container: `surface-sunken` vs `bg` | 1.06 | 1.03 |

The fill-vs-container rows are the predicate's empirical basis: every neutral fill/container pairing in the app measures **≤1.13:1**, so a control's fill carries no visual weight against what it stands on — the same "standalone stroke" argument §1.2a already makes for `bg-bg` fills. `surface-raised` vs `surface` is 1.00:1 in light because both resolve to `#ffffff`.

**Provenance (re-run 2026-08-16 07:5x CDT, this session, not inherited):** the census is the derived cover above executed against the live worktree (24 rows, reproduced verbatim in the table); the ratios are computed from `app/globals.css` runtime tokens using the same block-scoped extraction and WCAG relative-luminance helpers as `tests/styles/secondary-action-contrast.test.ts:10-39`. Every figure the BACKLOG entry published on 2026-08-15 reproduced exactly.

### 3.1 What the three switch tracks actually pin (precision the entry compresses)

All three tracks carry one recipe (`components/admin/PublishedToggle.tsx:292`, `components/admin/settings/AutoPublishToggle.tsx:136`, `components/admin/settings/NotifyToggle.tsx:144`):

```
on ? "border-accent-edge bg-accent" : "border-border-strong bg-surface-sunken"
```

DESIGN.md §1.2 pins the **ON** half — `accent-edge` vs `accent` 3.61:1 light (the load-bearing 1.4.11 pair) and `accent-edge` vs `bg` 8.06/9.39 (DESIGN.md:35, :122-123). The **OFF** half (`border-strong` vs the sunken track fill, 1.43 light / 1.75 dark) carries **no ratio row and no test pin** — so Option C does not overwrite a pinned number, contrary to the shorter framing. What Option C does change is the designed ON/OFF *relationship*: the OFF ring goes from 1.43/1.75 to 3.02/4.11 against the track fill, making the OFF state read heavier while the ON state's boundary is unchanged. The state distinction itself is carried by the track FILL (`accent` vs `surface-sunken`) plus the knob position, not by the border, so it survives either way.

## 4. Design (branch-conditional; the ruling selects)

### 4.A If Option A (page-ground only)

DESIGN.md §1.2a gains a ratified sentence closing the question: the predicate is page-ground-only by decision; the 24 sites keep `border-border-strong`; the R5 frame (label carries the affordance) is the standing posture. The BACKLOG entry archives as a documented position. No code change beyond DESIGN.md + BACKLOG. No impeccable gate needed (no UI surface change — DESIGN.md edit only; gate marker still required as `impeccable-gate:` with the dual-gate run on the DESIGN.md diff, per invariant 8's definition of UI surface including DESIGN.md changes).

### 4.B If Option B (fill-equals-container, tracks OUT) — <!-- recommended -->

1. **DESIGN.md §1.2a predicate rewrite:** "near-ground" becomes: a control whose fill measures under a stated threshold against its container (the four neutral grounds all measure ≤1.11:1). Switch tracks are named OUT explicitly: their boundary system is the §1.2 accent rows (ON: `accent-edge` light / track-vs-bg dark) plus the sunken track + knob shadow OFF — a separately-ratified pair this rule does not touch.
2. **Swap:** the 21 non-track sites move `border-border-strong` → `border-text-faint`, one token per site. No shared-constant extraction (sites are heterogeneous recipes; the swap is mechanical).
3. **Special cases:** §4.2 (GalleryLightbox), §4.3 (StagedPreviewBanner).
4. **Pins:** §5.

### 4.C If Option C (fill-equals-container, tracks IN)

As 4.B plus the three tracks' OFF branch swaps `border-border-strong` → `border-text-faint` (`text-faint` vs the sunken track fill: 3.02 light / 4.11 dark — clears). DESIGN.md §1.2 gains an OFF-track boundary row; the ON-state rows are untouched. Risk noted: the OFF-track appearance is part of a pinned toggle design (§1.2 accent-edge rows are its ON half); this branch retunes the OFF half deliberately, with the ratio row added so it is measured, not silent.

### 4.2 GalleryLightbox reset chip (`components/diagrams/GalleryLightbox.tsx:693`)

Post-filing addition (2026-08-15/16). Its comment cites critique MED-5: `border-border-strong` "gives the chip slight visual primacy over the chevrons when active". Under Option B/C the swap STRENGTHENS that primacy (1.59/1.50 → 3.35/3.53 on `surface-raised`), so the MED-5 intent survives the swap; the comment is updated in the same commit.

### 4.3 StagedPreviewBanner picker link (`components/admin/StagedPreviewBanner.tsx:75`)

Transparent fill on the `bg-warning-bg` banner — a TINTED plate. Under Option B/C it swaps with the rest (both themes improve: 1.44→3.04 light, 1.19→2.79 dark); the residual dark 2.79 is exactly the tinted-plate class already filed as `BL-CONTROL-OUTLINE-ON-TINTED-PLATES` and files there, not here. The sibling `<span aria-current>` at `:65` is non-interactive chrome (outside the census; keeps its token).

## 5. Verification / pins (branch-conditional)

- **Option A:** a stays-quiet pin: the census query's result set is ratified as the KEEP set (structural test asserting the predicate text + no-swap position), or no new pin — decided at plan time.
- **Option B/C:** extend `tests/styles/secondary-action-contrast.test.ts`-style ratio pins: `text-faint` vs all four neutral grounds already pinned there; add a census-shaped structural test asserting NO in-scope interactive element carries `border-border-strong` over a low-delta fill (the derived cover flips from "hit list" to "must be empty", minus named exemptions per the ruling: tracks under B; none under C). Exemption registry keyed on file+testid, with the ruling's citation.
- The 69-line text-level grep cover is NOT mechanically safe (cards/chips/tiles/popovers keep the token) — the census is `scanInteractiveElements`, never a bare grep.
- Invariant 8: impeccable dual-gate (`/impeccable critique` + `/impeccable audit`) on the affected diff at implementation; `impeccable-gate:` closeout marker in the plan.

## 6. Documented limits

- `disabled:opacity-60` under-3:1 (pre-existing, §1.2a).
- Tinted-plate outer edges (`BL-CONTROL-OUTLINE-ON-TINTED-PLATES`).
- `bg-transparent` controls take their rendered ground; static measurement cannot cover unenumerated grounds — the census pins the enumerated set only.
