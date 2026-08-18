# Probe record — `border-border` on a neutral fill, measured 2026-08-18

Branch: `fix/control-outline-border-token`. Ledger row: `BL-CONTROL-OUTLINE-BORDER-TOKEN-ON-NEUTRAL-FILL` (`BACKLOG.md`).

This record is **branch-independent**: every figure and every row below holds whichever way the open design question is ruled. The spec cites it rather than restating it, so the two documents cannot drift.

---

## 1. The derived cover reproduces at 30 of 362

Run verbatim, as the ledger entry publishes it — both predicates tested against `allStrings(e)` as a whole, never against one shared string:

```ts
scanInteractiveElements(process.cwd()).filter(
  (e) =>
    allStrings(e).some((s) => /(^|\s)border-border(\s|$)/.test(s)) &&
    allStrings(e).some((s) => /(^|\s)bg-(bg|surface|surface-raised|surface-sunken)(\s|$)/.test(s)),
);
```

`UNIVERSE=362`, `COVER=30` — identical to the 2026-08-16 figures the entry records. The count is confirmed, not inherited.

**Five of the thirty resolve at a different line than the entry cites.** The entry anchors some rows on the `className=` line; `scanInteractiveElements` anchors every row on the element's opening tag. The scanner's anchor is the one the census resolver and the mutation registry use, so it is the anchor this arc uses throughout. Per the entry's own instruction ("if your re-run disagrees, the re-run wins"), the live values below supersede.

| Entry cites                                            | Live element line | Cause                          |
| ------------------------------------------------------ | ----------------- | ------------------------------ |
| `components/admin/ArchiveShowButton.tsx:344`            | `:333`            | `className=` line vs tag line  |
| `app/admin/show/[slug]/ResetPickerEpochButton.tsx:266`  | `:260`            | `className=` line vs tag line  |
| `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:233` | `:240`         | intervening edits since filing |
| `app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:103` | `:109`           | intervening edits since filing |
| `app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:121` | `:127`           | intervening edits since filing |

## 2. The census — 30 rows, as the scanner reports them

Crew-facing marked `C` (thirteen, by render chain; the four marked `C*` are reached through a chain no path regex sees).

| #   | File:line                                                    | Tag      | Crew |
| --- | ------------------------------------------------------------ | -------- | ---- |
| 1   | `app/admin/show/[slug]/PickerResetControl.tsx:255`             | `button` |      |
| 2   | `app/admin/show/[slug]/ResetPickerEpochButton.tsx:178`         | `button` |      |
| 3   | `app/admin/show/[slug]/ResetPickerEpochButton.tsx:260`         | `button` |      |
| 4   | `app/admin/show/[slug]/RotateShareTokenButton.tsx:379`         | `button` |      |
| 5   | `app/me/meShowSections.tsx:174`                                | `Link`   | C    |
| 6   | `app/me/meShowSections.tsx:213`                                | `Link`   | C    |
| 7   | `app/me/meShowSections.tsx:258`                                | `Link`   | C    |
| 8   | `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:240`      | `button` | C    |
| 9   | `app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:109`        | `button` | C    |
| 10  | `app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:127`        | `a`      | C    |
| 11  | `components/admin/ArchiveShowButton.tsx:333`                   | `button` |      |
| 12  | `components/admin/NeedsAttentionSummaryCard.tsx:36`            | `Link`   |      |
| 13  | `components/admin/RecentAutoAppliedStrip.tsx:447`              | `button` |      |
| 14  | `components/admin/ShowRowActions.tsx:821`                      | `button` |      |
| 15  | `components/admin/UnarchiveShowButton.tsx:67`                  | `button` |      |
| 16  | `components/admin/dev/SwitcherControls.tsx:83`                 | `button` |      |
| 17  | `components/admin/dev/SwitcherControls.tsx:92`                 | `button` |      |
| 18  | `components/admin/dev/SwitcherControls.tsx:142`                | `button` |      |
| 19  | `components/admin/nav/UserMenu.tsx:51`                         | `button` |      |
| 20  | `components/admin/review/ShowReviewSurface.tsx:814`            | `button` |      |
| 21  | `components/admin/review/ShowReviewSurface.tsx:993`            | `button` |      |
| 22  | `components/admin/showpage/PublishedReviewModal.tsx:964`       | `button` |      |
| 23  | `components/admin/wizard/CrewRowActions.tsx:339`               | `button` |      |
| 24  | `components/agenda/AgendaEmbed.tsx:83`                         | `button` | C\*  |
| 25  | `components/agenda/AgendaPdfViewer.tsx:198`                    | `button` | C\*  |
| 26  | `components/crew/SectionChipLink.tsx:48`                       | `Link`   | C    |
| 27  | `components/crew/primitives/PersonRow.tsx:196`                 | `a`      | C    |
| 28  | `components/crew/primitives/PersonRow.tsx:213`                 | `a`      | C    |
| 29  | `components/layout/ThemeToggle.tsx:91`                         | `button` | C\*  |
| 30  | `components/shared/ReportButton.tsx:142`                       | `button` | C\*  |

## 3. Contrast, re-measured from the runtime tokens

Extracted from `app/globals.css` with the block-anchored reader `tests/styles/secondary-action-contrast.test.ts:23-40` uses (light from `:root`, dark from `[data-theme="dark"]`, `-runtime` suffix). Format is light / dark.

| Outline token         | Hex (light / dark)  | `bg`          | `surface`     | `surface-raised` | `surface-sunken` |
| --------------------- | ------------------- | ------------- | ------------- | ---------------- | ---------------- |
| `border-border`       | `#e5e4e0` / `#2a2b30` | 1.22 / 1.35 | 1.27 / 1.27 | 1.27 / 1.19      | 1.15 / 1.38      |
| `border-border-strong`| `#cfcdc7` / `#3a3b40` | 1.52 / 1.70 | 1.59 / 1.60 | 1.59 / 1.50      | 1.43 / 1.75      |
| `border-text-faint`   | `#8b8c92` / `#74736d` | 3.21 / 4.00 | 3.35 / 3.76 | 3.35 / 3.53      | 3.02 / 4.11      |

Every `border-border` figure reproduces the entry's 2026-08-16 measurement to the digit. The token is under the 3:1 non-text floor on all four neutral grounds in both themes; `border-border-strong` is too. `border-text-faint` — the weight the 21 moved to — clears on all eight.

## 4. The thirty are not one shape

The cover is derived and its count is correct, but its members do four different jobs. Any ruling has to say which of these it reaches, because "swap the cover" and "swap the controls" are not the same set.

**(a) Button-shaped controls with a full resting outline — 22 rows.** Rows 1-4, 8-11, 13-23 minus the exceptions below, plus 24, 25, 29, 30. The five confirm-row Cancels (rows 1, 3, 4, 11, 14) are this shape's sharpest instances and are read out in §5.

**(b) Tile- and card-shaped links whose outline IS the card edge — 5 rows.** Rows 5, 6, 7 (`px-tile-pad` / `p-tile-pad`, `rounded-md`, `shadow-tile`), row 12 (`p-tile-pad`, `rounded-md`), row 8 (`rounded-md`, full-width row). `DESIGN.md` §1.2a preserves the border tokens for tile and card edges by name, so these are the rows where "the predicate's words describe them" is least obviously the same claim.

**(c) One row whose `border-border` is a DIVIDER, not an outline — row 13.** `components/admin/RecentAutoAppliedStrip.tsx:447` carries `rounded-t-md border-b border-border` — a bottom edge only, separating stacked rows. It has no resting outline to raise. **Swapping this row is wrong under every ruling**, and it is in the cover because the cover tests tokens, not sides. Any mechanical sweep must exclude it explicitly and say why.

**(d) Four rows where `border-border` is only ONE conditional branch.** Row 20 and row 21 (`border-transparent bg-surface-sunken` when selected, `border-border bg-surface` when not); row 22 (the other branch is `bg-warning-bg`, a tinted plate — which puts it inside `BL-CONTROL-OUTLINE-ON-TINTED-PLATES` the moment its outline moves); row 30 (the other branches are `bg-accent` filled and an underlined text link). A per-element swap changes only the branch that carries the token, and the spec has to say so or a reviewer will read it as changing all branches.

## 5. The five confirm-row Cancels, read out of the live tree

Each is the escape route from a destructive confirm whose trigger the 2026-08-16 arc strengthened to 3.35:1. All five carry `border border-border bg-surface`; all five stand beside a filled `bg-warning-text` confirm.

| Cancel                                                   | Paired destructive confirm            |
| -------------------------------------------------------- | ------------------------------------- |
| `components/admin/ArchiveShowButton.tsx:333`              | `:436` `bg-warning-text`, "Confirm archive" |
| `app/admin/show/[slug]/ResetPickerEpochButton.tsx:260`    | `bg-warning-text`, "Confirm reset"    |
| `app/admin/show/[slug]/RotateShareTokenButton.tsx:379`    | `bg-warning-text`, "Confirm rotate"   |
| `app/admin/show/[slug]/PickerResetControl.tsx:255`        | `bg-warning-text`, "Confirm reset"    |
| `components/admin/ShowRowActions.tsx:821`                 | `bg-warning-text`, tier-2 archive confirm |

## 6. The 2026-08-16 swap left one control at two weights — and its pin is green

**This is the finding neither the ledger entry nor the arc brief names, and it holds under either ruling.**

`app/admin/show/[slug]/ResetPickerEpochButton.tsx:178` is **census row 2 of the cover of 30 AND a row of the 2026-08-16 census** (`tests/styles/controlOutlineScan.ts:46`). It is one `<button>` with a two-branch `className` (`:185-189`):

- `compact` branch: `border border-text-faint bg-surface` — **3.35:1**, moved by the 2026-08-16 swap.
- non-`compact` branch: `border border-border bg-surface` — **1.27:1**, untouched.

Same element, same fill, same job; the outline weight depends on a layout prop.

**The regression pin does not see it.** `tests/styles/_metaControlOutlineFill.test.ts:112-123` asserts, per census row, `carries(element, "border-text-faint") === true` and `carries(element, "border-border-strong") === false`. Both are true here: the compact branch supplies the first, and no branch ever carried `border-border-strong`. The pin is green on an element that renders at 1.27:1 in one of its two states.

This is a **limit of the pin, not a defect in it** — its docstring is explicit that it answers "did the 21 elements this PR changed stay changed" about a closed set, and it does. The mechanism that would catch it already exists in the same suite: `everyPathCarries` (used at `tests/styles/_metaControlOutlineFill.test.ts:163` for the `max-sm:border-border` case) distinguishes "some branch carries the token" from "every branch does". Whether the arc adopts it is a spec decision.

## 7. Enrollability, checked before round 1

`tests/styles/controlOutlineScan.ts` is **enrolled** in `tests/mutation/source/registry.ts:1909-1924` at `scoreFloor: 1` with `accepted: []`, alongside `interactiveScanCore` (`:1783`) and `tapTargetScan` (`:1887`). `subtleInteractiveScan` is recorded NOT ENROLLED at `:1874-1886` with a structural reason (zero mutants — a filter over the core with no site the declared operator set can reach).

Consequence for whichever branch ships: **any change to `controlOutlineScan.ts` re-triggers score-before-closeout.** A ruling that extends the census must run `pnpm mutation:guards` and state the score plus an empty unaccepted-survivor set in the round-1 review brief. A ruling that leaves the file untouched does not.

---

## Reproduction

```
pnpm exec tsx <<'EOF'
import { scanInteractiveElements, allStrings } from './tests/styles/interactiveScanCore';
const u = scanInteractiveElements(process.cwd());
const c = u.filter(e =>
  allStrings(e).some(s => /(^|\s)border-border(\s|$)/.test(s)) &&
  allStrings(e).some(s => /(^|\s)bg-(bg|surface|surface-raised|surface-sunken)(\s|$)/.test(s)));
console.log(u.length, c.length);
EOF
```
