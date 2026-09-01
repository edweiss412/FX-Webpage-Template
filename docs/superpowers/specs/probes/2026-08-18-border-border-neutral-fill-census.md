# Probe record — `border-border` as a control outline, measured 2026-08-18

Branch: `fix/control-outline-border-token`. Ledger row: `BL-CONTROL-OUTLINE-BORDER-TOKEN-ON-NEUTRAL-FILL` (`BACKLOG.md`).

**On `pnpm spec:lint` for this file:** it reports three `SECTION_MISSING_*` failures (`Resolved scope`, `Dimensional Invariants`, `Transition Inventory`). Those are a classifier artifact, not a defect — the linter treats anything under `docs/superpowers/specs/**` as a spec, and every probe record in `docs/superpowers/specs/probes/` fails the same three (the sibling `2026-08-11-speclint-arm-survivor-classification.md` fails `SECTION_MISSING_RESOLVED_SCOPE` among 18 hard). A probe record is not a spec and owes none of those sections. **Every CITATION failure has been repaired**; that class is real and this file reports zero of them.

Every figure and every row below was read off the live tree on 2026-08-18 and holds independently of how the arc's design question was ruled. The spec cites this record rather than restating it, so the two documents cannot drift.

**Ruling, for context only:** the user chose the text ramp on 2026-08-18 against a rendered mockup that showed the confirm-row Cancels, the split button of §6, and the crew surfaces of §2 at all three candidate weights in both themes.

---

## 1. The published cover reproduces at 30 of 362

Run verbatim, as the ledger entry publishes it — both predicates tested against `allStrings(e)` as a whole, never against one shared string:

```ts
scanInteractiveElements(process.cwd()).filter(
  (e) =>
    allStrings(e).some((s) => /(^|\s)border-border(\s|$)/.test(s)) &&
    allStrings(e).some((s) => /(^|\s)bg-(bg|surface|surface-raised|surface-sunken)(\s|$)/.test(s)),
);
```

`UNIVERSE=362`, `COVER=30` — identical to the 2026-08-16 figures. The count is confirmed, not inherited.

**Five of the thirty resolve at a different line than the entry cites.** The entry anchors some rows on the `className=` line; `scanInteractiveElements` anchors every row on the element's opening tag. The scanner's anchor is what the census resolver and the mutation registry use, so it is the anchor used throughout this arc. Per the entry's own instruction ("if your re-run disagrees, the re-run wins"), the live values supersede.

| Entry cites                                               | Live element line | Cause                          |
| --------------------------------------------------------- | ----------------- | ------------------------------ |
| `components/admin/ArchiveShowButton.tsx:344`               | `components/admin/ArchiveShowButton.tsx:333`            | `className=` line vs tag line  |
| `app/admin/show/[slug]/ResetPickerEpochButton.tsx:266 (deleted in fa5d3fffb)`     | `app/admin/show/[slug]/ResetPickerEpochButton.tsx:260 (deleted in fa5d3fffb)`            | `className=` line vs tag line  |
| `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:233` | `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:240`            | intervening edits since filing |
| `app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:103`   | `app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:109`            | intervening edits since filing |
| `app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:121`   | `app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:127`            | intervening edits since filing |

## 2. The census — 30 rows, as the scanner reports them

Crew-facing marked `C` (thirteen, by render chain; the four marked `C*` are reached through a chain no path regex sees). The `Shape` column is derived in §4.

| #   | File:line                                                  | Tag      | Crew | Shape   |
| --- | ---------------------------------------------------------- | -------- | ---- | ------- |
| 1   | `app/admin/show/[slug]/PickerResetControl.tsx:255`          | `button` |      | outline |
| 2   | `app/admin/show/[slug]/ResetPickerEpochButton.tsx:178 (deleted in fa5d3fffb)`      | `button` |      | branch  |
| 3   | `app/admin/show/[slug]/ResetPickerEpochButton.tsx:260 (deleted in fa5d3fffb)`      | `button` |      | outline |
| 4   | `app/admin/show/[slug]/RotateShareTokenButton.tsx:379`      | `button` |      | outline |
| 5   | `app/me/meShowSections.tsx:174`                             | `Link`   | C    | tile    |
| 6   | `app/me/meShowSections.tsx:213`                             | `Link`   | C    | tile    |
| 7   | `app/me/meShowSections.tsx:258`                             | `Link`   | C    | tile    |
| 8   | `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:240`  | `button` | C    | branch  |
| 9   | `app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:109`    | `button` | C    | outline |
| 10  | `app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:127`    | `a`      | C    | outline |
| 11  | `components/admin/ArchiveShowButton.tsx:333`                | `button` |      | outline |
| 12  | `components/admin/NeedsAttentionSummaryCard.tsx:36`         | `Link`   |      | tile    |
| 13  | `components/admin/RecentAutoAppliedStrip.tsx:447`           | `button` |      | DIVIDER |
| 14  | `components/admin/ShowRowActions.tsx:821`                   | `button` |      | outline |
| 15  | `components/admin/UnarchiveShowButton.tsx:67`               | `button` |      | outline |
| 16  | `components/admin/dev/SwitcherControls.tsx:83`              | `button` |      | outline |
| 17  | `components/admin/dev/SwitcherControls.tsx:92`              | `button` |      | outline |
| 18  | `components/admin/dev/SwitcherControls.tsx:142`             | `button` |      | outline |
| 19  | `components/admin/nav/UserMenu.tsx:51`                      | `button` |      | outline |
| 20  | `components/admin/review/ShowReviewSurface.tsx:814`         | `button` |      | branch  |
| 21  | `components/admin/review/ShowReviewSurface.tsx:993`         | `button` |      | branch  |
| 22  | `components/admin/showpage/PublishedReviewModal.tsx:964`    | `button` |      | branch  |
| 23  | `components/admin/wizard/CrewRowActions.tsx:339`            | `button` |      | outline |
| 24  | `components/agenda/AgendaEmbed.tsx:83`                      | `button` | C\*  | outline |
| 25  | `components/agenda/AgendaPdfViewer.tsx:198`                 | `button` | C\*  | outline |
| 26  | `components/crew/SectionChipLink.tsx:48`                    | `Link`   | C    | outline |
| 27  | `components/crew/primitives/PersonRow.tsx:196`              | `a`      | C    | outline |
| 28  | `components/crew/primitives/PersonRow.tsx:213`              | `a`      | C    | outline |
| 29  | `components/layout/ThemeToggle.tsx:91`                      | `button` | C\*  | outline |
| 30  | `components/shared/ReportButton.tsx:142`                    | `button` | C\*  | branch  |

## 3. Contrast, re-measured from the runtime tokens

Extracted from `app/globals.css` with the block-anchored reader `tests/styles/secondary-action-contrast.test.ts:23` uses (light from the bare root block, dark from the `data-theme="dark"` block, `-runtime` suffix). Format is light / dark.

| Outline token          | Hex (light / dark)    | `bg`        | `surface`   | `surface-raised` | `surface-sunken` |
| ---------------------- | --------------------- | ----------- | ----------- | ---------------- | ---------------- |
| `border-border`        | `#e5e4e0` / `#2a2b30` | 1.22 / 1.35 | 1.27 / 1.27 | 1.27 / 1.19      | 1.15 / 1.38      |
| `border-border-strong` | `#cfcdc7` / `#3a3b40` | 1.52 / 1.70 | 1.59 / 1.60 | 1.59 / 1.50      | 1.43 / 1.75      |
| `border-text-faint`    | `#8b8c92` / `#74736d` | 3.21 / 4.00 | 3.35 / 3.76 | 3.35 / 3.53      | 3.02 / 4.11      |

Every `border-border` figure reproduces the entry's 2026-08-16 measurement to the digit. The token is under the 3:1 non-text floor on all four neutral grounds in both themes; `border-border-strong` is too. `border-text-faint` clears on all eight.

## 4. The published cover is not the class — it is one quadrant of it

**This is the load-bearing finding of the probe.** `DESIGN.md` §1.2a:182-188 states the predicate as:

> An outline drawn around a control whose **fill carries no visual weight against what it stands on** is a standalone stroke by the same argument […] In practice that is any control filled with one of the four neutral ground tokens (`--color-bg`, `--color-surface`, `--color-surface-sunken`, `--color-surface-raised`) **or left unfilled**.

The published cover implements the first half of that disjunction and drops the second: it *requires* a `bg-` neutral token, so an unfilled control is invisible to it. It also tests for the TOKEN without testing which SIDE the token paints, so a `border-t` / `border-b` / `border-l` divider — which has no resting outline to raise — is admitted.

Widening to every element carrying the token, then classifying by side and by fill:

```
carries border-border (whole token, unprefixed) = 42
  neutral-filled  (the published cover)         = 30
  unfilled / bg-transparent                     =  8   <-- 2nd half of §1.2a's predicate
  other                                         =  4
carries a PREFIXED occurrence only              =  2   <-- outside the cover's regex
```

Reclassified by what the token actually paints — 44 elements in total, mutually exclusive:

| Class                                            | Count | In §1.2a's words?                          |
| ------------------------------------------------ | ----- | ------------------------------------------ |
| **A** — full resting outline, neutral fill        | 29    | yes (first half)                           |
| **B** — full resting outline, unfilled/transparent| 8     | yes (second half, `or left unfilled`)      |
| **C** — divider: `border-t`, `border-b`, `border-l` | 5   | **no** — no resting outline exists         |
| **D** — prefixed-only (`max-sm:`)                 | 2     | yes at the viewport where the prefix applies |

29 + 8 + 5 + 2 = 44. Class A is the published cover's 30 minus the one divider it contains.

### Class B — eight controls the cover cannot see

Each carries `border border-border` on all four sides with no fill token at rest. Under §1.2a's "or left unfilled" these are inside the ratified predicate; they were untouched on 2026-08-16 only because they carry `border-border` rather than `border-border-strong`.

| File:line                                        | Rest fill        | Note                                            |
| ------------------------------------------------ | ---------------- | ----------------------------------------------- |
| `components/admin/HoverHelp.tsx:562`              | `bg-transparent` | explicit transparent; `hover:border-border-strong` |
| `components/admin/NeedsAttentionInbox.tsx:101`    | none             | four sibling links share one recipe             |
| `components/admin/NeedsAttentionInbox.tsx:130`    | none             | "                                               |
| `components/admin/NeedsAttentionInbox.tsx:198`    | none             | "                                               |
| `components/admin/NeedsAttentionInbox.tsx:224`    | none             | "                                               |
| `components/admin/dev/MaterializeCard.tsx:73`     | none             | dev surface                                     |
| `components/admin/telemetry/AutoRefreshControl.tsx:119` | none       | `hover:bg-surface-sunken` only                  |
| `components/shared/ReportModal.tsx:675`           | none            | `hover:bg-surface-sunken` only                  |

`AutoRefreshControl.tsx:119` is worth naming twice: the same file's `AutoRefreshControl.tsx:106` is one of the five switch-track render paths §1.2a rules OUT, and `AutoRefreshControl.tsx:119` is a different element on the same surface. They must not be conflated.

### A fourth exclusion the token count surfaces: element KIND

`components/admin/dev/SwitcherControls.tsx` carries four `hover:border-accent` occurrences but contributes only three elements to any set here. The fourth, `components/admin/dev/SwitcherControls.tsx:122`, belongs to the `<select>` opening at `components/admin/dev/SwitcherControls.tsx:119` — `border border-border bg-surface … hover:border-accent`. `tests/styles/interactiveScanCore.ts:789` admits only `button`, `a` and `summary` as intrinsic tags (plus `<input>` at `type="checkbox"`/`"radio"`), so a `<select>` is outside the scanner's vocabulary exactly as the text-entry fields of `BL-CONTROL-OUTLINE-BEYOND-ELEMENT-COVER` family A are. Recorded so a lexical count of that file reconciles against the element count.

### Class C — five dividers, quoted so the exclusion is evidenced per site

None of these has a resting outline; each paints one side as a rule between stacked content. `DESIGN.md` §1.2a preserves the border tokens for dividers by name, so the ruling's words do not reach any of them, and raising one to 3.35:1 would darken a hairline on a non-control surface rather than make a boundary visible.

| File:line                                       | The token as it appears                      |
| ----------------------------------------------- | -------------------------------------------- |
| `components/admin/RecentAutoAppliedStrip.tsx:447` | `rounded-t-md border-b border-border`       |
| `components/admin/BellPanel.tsx:1213`             | `rounded-lg border-t border-border pt-3`    |
| `components/crew/primitives/KeyTimesStrip.tsx:191` | `border-t border-border pt-2` (a §1.1a Family S `<summary>`) |
| `components/admin/showpage/AttentionMenu.tsx:189` | `border-b border-border px-4 py-3 … last:border-b-0` |
| `components/admin/telemetry/EventFilters.tsx:85`  | `border-l border-border` (segment separator in a joined control) |

Only the first is inside the published cover; the other four are in class C but were never in the 30, because they carry no neutral fill token.

### Class D — two prefixed occurrences the cover's regex excludes by design

The cover matches the whole token unprefixed. That is **correct** for a state prefix and **wrong** for a viewport prefix, and the two cases must be distinguished:

- **`hover:` is correctly excluded.** `components/layout/ThemeToggle.tsx:125` rests at `border-border` and carries `border-border-strong` only under `hover:` — a state cue, not a resting outline. The 2026-08-16 spec records this at its §3.2.
- **`max-sm:` is a RESTING outline below 640px**, and is not excluded by the same argument.

| File:line                                  | Occurrence                       | Rest fill                                    |
| ------------------------------------------ | -------------------------------- | -------------------------------------------- |
| `components/admin/showpage/ShareHub.tsx:781` | `max-sm:border max-sm:border-border` in BOTH ternary arms | `bg-surface` |
| `components/admin/showpage/ShareHub.tsx:817` | `max-sm:border max-sm:border-border`                      | `open ? bg-surface-sunken : bg-transparent` |

`ShareHub.tsx:781` is the sharpest instance in the repository: both of its arms **already carry `border-text-faint`** from the 2026-08-16 swap, and `max-sm:border-border` wins the cascade below 640px. The same button therefore paints **3.35:1 on a desktop viewport and 1.27:1 on a phone**.

**Ratification collision, stated rather than resolved silently.** The mobile skin is ratified: the in-file comment at `components/admin/showpage/ShareHub.tsx:798` cites `spec 2026-07-24-strip-mobile-stacked-band §3 R3` — "border color drops to `border-border` below sm (the §3 R3 skin; width stays 1px)". Any repair here overrides a prior ratified decision. The override is narrow — colour only; `flex-1`, `justify-center`, `rounded-sm`, `whitespace-nowrap`, `min-w-0`, `overflow-hidden` and the 1px width are all untouched — but it is an override and the spec must say so rather than let a reviewer discover it.

## 5. The five confirm-row Cancels, read out of the live tree

Each is the escape route from a destructive confirm whose trigger the 2026-08-16 arc strengthened to 3.35:1. All five carry `border border-border bg-surface`; all five stand beside a filled `bg-warning-text` confirm.

| Cancel                                                | Paired destructive confirm                                    |
| ----------------------------------------------------- | ------------------------------------------------------------- |
| `components/admin/ArchiveShowButton.tsx:333`           | `components/admin/ArchiveShowButton.tsx:436` `bg-warning-text`, "Confirm archive"                    |
| `app/admin/show/[slug]/ResetPickerEpochButton.tsx:260 (deleted in fa5d3fffb)` | `bg-warning-text`, "Confirm reset"                             |
| `app/admin/show/[slug]/RotateShareTokenButton.tsx:379` | `bg-warning-text`, "Confirm rotate"                            |
| `app/admin/show/[slug]/PickerResetControl.tsx:255`     | `bg-warning-text`, "Confirm reset"                             |
| `components/admin/ShowRowActions.tsx:821`              | `bg-warning-text`, tier-2 archive confirm                      |

## 6. The regression pin is green on a control that renders at 1.27:1 — and that was known

`app/admin/show/[slug]/ResetPickerEpochButton.tsx:178 (deleted in fa5d3fffb)` is census row 2 of the cover **and** a row of the 2026-08-16 census (`tests/styles/controlOutlineScan.ts:46`). It is one `<button>` with a two-branch `className` (`app/admin/show/[slug]/ResetPickerEpochButton.tsx:185 (deleted in fa5d3fffb)`):

- `compact` branch: `border border-text-faint bg-surface` — **3.35:1**, moved by the 2026-08-16 swap.
- non-`compact` branch: `border border-border bg-surface` — **1.27:1**, untouched.

**Not novel, and the correction matters.** An earlier revision of this record claimed this was unnamed. It is not: the 2026-08-16 spec records it twice — at its §2.1 R3 bullet and as a §6 documented limit, together with `ShareHub.tsx:777` (live: `ShareHub.tsx:781`), both at "1.27:1 in both themes". What this record adds is the *guard* consequence below, and the class decomposition of §4.

**The consequence the prior arc did not draw.** `tests/styles/_metaControlOutlineFill.test.ts:112` asserts, per census row, `carries(element, "border-text-faint") === true` and `carries(element, "border-border-strong") === false`. Both hold here — the compact branch supplies the first, and no branch ever carried `border-border-strong`. **The pin is green on an element that renders at 1.27:1 in one of its two states**, and it would stay green if a future edit moved the compact branch back, so long as some branch kept the token.

This is a **limit of the pin, not a defect in it**: its docstring is explicit that it answers "did the 21 elements this PR changed stay changed" over a closed set.

**On the repair — this record no longer prescribes one, and the correction matters** (spec review R4 F4). An earlier revision said the fix was to adopt `everyPathCarries`, the helper already used at `tests/styles/_metaControlOutlineFill.test.ts:163`. **The governing spec rejects that**, and a probe settles it: `everyPathCarries(el, "border-text-faint")` fails TWO of the 21, and only one is the defect —

```
NOT_EVERY_FAINT:
  app/admin/show/[slug]/ResetPickerEpochButton.tsx:178   <- the intended defect
  components/admin/Mi11GateActions.tsx:69                <- a ratified exemption
```

`components/admin/Mi11GateActions.tsx:69` has an `isApprove` branch that is `bg-accent … text-accent-text` with no border at all — the accent-filled primary action `DESIGN.md` §1.2a rules OUT by name. A universal is therefore the wrong shape for this population. The spec's §5.2 carries the chosen mechanism (a negation: no render path carries `border-border`); **this record measures, it does not prescribe**, and it is cited here only so the two documents cannot disagree.

## 7. Enrollability, checked before round 1

`tests/styles/controlOutlineScan.ts` is **enrolled** in `tests/mutation/source/registry.ts:1909` at `scoreFloor: 1` with `accepted: []`, alongside `interactiveScanCore` (`tests/mutation/source/registry.ts:1783`) and `tapTargetScan` (`tests/mutation/source/registry.ts:1887`). `subtleInteractiveScan` is recorded NOT ENROLLED at `tests/mutation/source/registry.ts:1874` with a structural reason (zero mutants — a filter over the core with no site the declared operator set reaches).

Consequence: **any change to `controlOutlineScan.ts` re-triggers score-before-closeout.** Extending the census or strengthening the pin means running `pnpm mutation:guards` and stating the score plus an empty unaccepted-survivor set in the round-1 diff brief.

---

## Reproduction

Classification probe (§4), run from the worktree root:

```ts
import { scanInteractiveElements, allStrings } from "./tests/styles/interactiveScanCore";
const u = scanInteractiveElements(process.cwd());
const bare = /(^|\s)border-border(\s|$)/;
const neutral = /(^|\s)bg-(bg|surface|surface-raised|surface-sunken)(\s|$)/;
const prefixed = /(^|\s)([a-zA-Z0-9_\-[\]():./>&\\*]+:)+border-border(\s|$)/;
const carries = u.filter((e) => allStrings(e).some((s) => bare.test(s)));
console.log(
  carries.length,
  carries.filter((e) => allStrings(e).some((s) => neutral.test(s))).length,
  u.filter((e) => allStrings(e).some((s) => prefixed.test(s))).length,
);
// -> 42 30 2
```

Side classification (outline vs divider) is read from the class strings, which are printed in §4's tables verbatim; there is no `border-t`/`border-b`/`border-l` predicate in the scanner to derive it from, and inventing one is out of scope for this record.
