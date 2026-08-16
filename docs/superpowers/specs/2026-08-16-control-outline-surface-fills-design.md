# Control outlines on surface fills — §1.2a predicate ruling + census swap

**Date:** 2026-08-16 · **Ledger entry:** `BL-CONTROL-OUTLINE-BORDER-STRONG-ON-SURFACE-FILLS` · **Branch:** `fix/control-outline-surface-fills`

**Status: RATIFIED. The user ruled Option B on 2026-08-16 (§2). The rejected branches are recorded in §2.1 so neither side is relitigated.**

## 1. Resolved scope — do not relitigate

- The six sites repaired on `fix/ui-interactive-token-policy` (that diff created their inconsistency): `Step2Verify`'s re-scan + portaled footer advance (file-local `SECONDARY_BUTTON`), `DriveConnectionPanel`'s two actions, `RecentAutoAppliedStrip`'s confirmation-row control, the `AcceptChangeButton`/`UndoChangeButton` pair rendered by `ChangeFeedEntry.tsx:135`. Ratified in DESIGN.md §1.2a ("Six such controls DID move on 2026-08-14").
- The per-ground contrast figures measured 2026-08-15 (BACKLOG entry) — re-verified 2026-08-16 against runtime tokens in `app/globals.css`, matching exactly (§3 table).
- The subtle-on-interactive census and its negative pin (`tests/styles/_metaSubtleOnInteractive.test.ts`) — untouched by this arc.
- "This was a design upgrade, not a compliance repair" (DESIGN.md §1.2a, ratified 2026-08-14, spec §1.1 R5). The prior 1.59:1 boundary was NOT a WCAG failure; do not re-frame it as one.
- `disabled:opacity-60` drops outlines under 3:1 — documented limit (DESIGN.md §1.2a), not a finding.
- Tinted-plate outer-edge dips are `BL-CONTROL-OUTLINE-ON-TINTED-PLATES`'s scope, not this arc's (one overlap site handled at §4.4).

### 1.1 Self-review sections that are N/A here, and why

Stated rather than omitted, so their absence is not read as an oversight. The change is **one colour token per site** — `border-border-strong` → `border-text-faint` — with no new component, no new prop, no new state, and no new element.

- **Guard conditions per prop / mode boundaries / cap-and-truncation:** N/A — no prop, input, mode or list is added or read. No component's signature changes.
- **Dimensional invariants:** enumerated in §8 as an explicit no-change table rather than skipped. Both tokens are colours consumed by the same `border` utility at the same width, so no swapped site's border-width, padding, or box size moves by a pixel. There is no fixed-dimension parent / flex child relationship in the diff and therefore no real-browser dimension assertion to write. (Had the swap changed border WIDTH, this section would be mandatory.)
- **Transition inventory:** enumerated in §9 as an explicit no-change table — the swapped controls already carry `transition-colors duration-fast`, and a colour token substitution changes the value that utility interpolates, not the set of states or the transitions between them. The three toggles, the only multi-state controls in the census, are exempt from the swap entirely (§2).
- **Flag lifecycle / build-vs-runtime gate:** N/A — no flag, no env gate, no build-time decision. The token resolves in CSS at paint.
- **Tier × domain matrix / CHECK-enum migration matrix:** N/A — no database surface. No migration, no RPC, no CHECK.
- **Line anchors are locators, not contract.** Two anchors appear per toggle and both are correct — the ELEMENT line the scanner reports, and the CLASSNAME line carrying the OFF branch:

  | §3 census cites (element line, as the scanner reports it) | §4.1 and §6 cite (className line, OFF branch) |
  | --- | --- |
  | `components/admin/PublishedToggle.tsx:292` | `components/admin/PublishedToggle.tsx:305` |
  | `components/admin/settings/AutoPublishToggle.tsx:123` | `components/admin/settings/AutoPublishToggle.tsx:136` |
  | `components/admin/settings/NotifyToggle.tsx:131` | `components/admin/settings/NotifyToggle.tsx:144` |

  A drifted line number on an otherwise-correct claim is not a finding. The durable anchors are the file paths and the `border-accent-edge bg-accent` / `border-border-strong bg-surface-sunken` branch pair.

## 2. The decision (user-owned) — RULED

DESIGN.md §1.2a's control-outline rule currently reads: an outline around "a control whose fill is the near-ground (`bg-bg` on a `bg-surface` card, or on the `bg-surface-sunken` attention plate)" is a standalone stroke and takes the text ramp (`--color-text-faint`). The question put to the user: does "near-ground" stay page-ground-only, or does it become fill-equals-container — and are the three switch tracks in or out?

**RULING — Option B, ratified by the user 2026-08-16.** The predicate becomes fill-equals-container; the **21** button/link controls on card and panel fills swap to `border-text-faint`; the **three switch tracks are OUT** and keep their current boundary recipe unchanged in both states.

The ruling was taken against a side-by-side mockup rendering all three treatments in the app's real tokens, light and dark (artifact `870388a7-fe2b-4fd4-aa45-8136412fc7c3`).

### 2.1 Rejected branches — do not relitigate in either direction

Recorded per the AGENTS.md round-economy clause (d): a forced change later reversed is chargeable to the round that forced it, so both rejections are fenced here rather than left implicit.

- **Option A (keep page-ground-only) — REJECTED.** It was live and defensible: the R5 frame holds that the prior boundary was never a WCAG failure, so "no change" was a legitimate closable position. It lost on consistency — a card button at 1.43-1.75:1 next to a page button at 3.21-4.00:1 is one treatment rendered two ways inside one admin view, which is the split this arc exists to close. A reviewer arguing "no change was always available" is correct and already answered; that is not a finding.
- **Option C (tracks IN) — REJECTED.** Its accessibility case was sound and its cost was **smaller than the entry's framing implied** — per §3.1, the OFF ring carries no ratio row and no test pin, so nothing pinned would have been overwritten. It lost on design intent, not on measurement: the toggle's ON/OFF pair is a deliberately tuned relationship, and darkening only the OFF ring makes the OFF state read heavier while the ON state stands still. A reviewer proposing "C is strictly better because the OFF ring clears 3:1" is measuring the right number and missing the ruling; the tracks' 1.43/1.75 OFF ring is a **ratified documented limit** as of this spec (§6), not an unclosed gap. It does not get re-filed as a new `BL-` entry.

**Consequence bound for this arc.** Every in-scope control either carries an outline at ≥3:1 against its own fill and against every neutral ground it is rendered on, or is a named exemption with its ratio recorded in §6. There is no third state — no control is left at an unmeasured or unstated boundary.

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
| 9 | `components/admin/StagedPreviewBanner.tsx:72` (picker Link) | transparent on `bg-warning-bg` | link — tinted-plate overlap, §4.4 |
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
| 23 | `components/diagrams/GalleryLightbox.tsx:693` (reset chip) | `bg-surface-raised` | button — §4.3 |
| 24 | `components/shared/ReportModal.tsx:622` | `bg-surface` | button |

Measured 2026-08-16 (standard WCAG relative-luminance formula, runtime tokens read from the light and dark declaration blocks of `app/globals.css` — the same block-scoped extraction used by `tests/styles/secondary-action-contrast.test.ts`):

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

All three tracks carry one recipe (`components/admin/PublishedToggle.tsx:305`, `components/admin/settings/AutoPublishToggle.tsx:136`, `components/admin/settings/NotifyToggle.tsx:144`):

```
on ? "border-accent-edge bg-accent" : "border-border-strong bg-surface-sunken"
```

DESIGN.md §1.2 pins the **ON** half — `accent-edge` vs `accent` 3.61:1 light (the load-bearing 1.4.11 pair) and `accent-edge` vs `bg` 8.06/9.39 (DESIGN.md:35, :122-123). The **OFF** half (`border-strong` vs the sunken track fill, 1.43 light / 1.75 dark) carries **no ratio row and no test pin** — so Option C does not overwrite a pinned number, contrary to the shorter framing. What Option C does change is the designed ON/OFF *relationship*: the OFF ring goes from 1.43/1.75 to 3.02/4.11 against the track fill, making the OFF state read heavier while the ON state's boundary is unchanged. The state distinction itself is carried by the track FILL (`accent` vs `surface-sunken`) plus the knob position, not by the border, so it survives either way.

## 4. Design (Option B, ratified)

### 4.1 DESIGN.md §1.2a predicate rewrite

The sentence beginning "**The rule extends to CONTROL OUTLINES (2026-08-14).**" (DESIGN.md:181) currently scopes the rule to "a control whose fill is the near-ground (`bg-bg` on a `bg-surface` card, or on the `bg-surface-sunken` attention plate)". The predicate is rewritten to fill-equals-container, with the exemption named in the same breath rather than left to inference:

> The rule covers a control whose **fill carries no visual weight against what it stands on** — in practice, any control filled with one of the four neutral ground tokens (`--color-bg`, `--color-surface`, `--color-surface-sunken`, `--color-surface-raised`) or left unfilled. Every neutral fill/container pairing in the app measures **≤1.13:1** (§3 table), so in all of them the stroke IS the control's boundary and takes the text ramp.
>
> Two families are OUT, and are out by decision rather than by omission. A control with a **weight-bearing fill** — the accent-filled primary action — is not a standalone stroke and keeps its own treatment. The three **switch tracks** keep their existing recipe in both states (`border-accent-edge bg-accent` ON, `border-border-strong bg-surface-sunken` OFF): the toggle's ON/OFF boundary is a deliberately tuned relationship, and lifting only the OFF ring would make the OFF state read heavier while the ON state stood still. The OFF ring's 1.43:1 light / 1.75:1 dark against its track fill is a documented limit of that decision, recorded here so it cannot drift into looking like an oversight (ruled 2026-08-16).

The two changed numbers this brings into §1.2's neighbourhood — that the rule now reaches `surface`, `surface-sunken` and `surface-raised` fills, not just `bg` — need no new §1.2 rows: `text-faint` against all four neutral grounds is already pinned there (DESIGN.md:141-145) and asserted by `tests/styles/secondary-action-contrast.test.ts`. This is the reason the swap is one token per site with no token or table churn.

### 4.2 The swap — 21 sites, one token each

Every site below moves `border-border-strong` → `border-text-faint` in place. No shared-constant extraction: the sites carry heterogeneous inline recipes (differing padding, radius, hover and disabled modifiers), and hoisting them into a constant is a refactor with its own blast radius that this ruling did not authorise. `lib/ui/actionClass.ts`'s `SECONDARY_ACTION_CLASS` already wears `border-text-faint` and is untouched.

These are §3 census rows 1-12 and 16-24 — all 24 minus the three switch tracks, which are §3 rows 13, 14 and 15. The `#` column below is this table's own 1-21 numbering and does NOT line up with the census numbering; where the two are cited together, the census numbers govern.

| # | Site | Fill | Ratio after (light / dark) |
|---|------|------|---|
| 1 | `app/admin/settings/roles/RoleMappingRow.tsx:211` | `bg-surface` | 3.35 / 3.76 |
| 2 | `app/admin/settings/roles/RoleMappingRow.tsx:343` | `bg-surface` | 3.35 / 3.76 |
| 3 | `app/admin/show/[slug]/ResetPickerEpochButton.tsx:178` | `bg-surface` | 3.35 / 3.76 |
| 4 | `components/admin/ArchiveShowButton.tsx:365` | `bg-surface` | 3.35 / 3.76 |
| 5 | `components/admin/BellPanel.tsx:850` | `bg-surface` | 3.35 / 3.76 |
| 6 | `components/admin/BellPanel.tsx:1072` | `bg-surface` | 3.35 / 3.76 |
| 7 | `components/admin/Mi11GateActions.tsx:69` (reject branch) | `bg-surface` | 3.35 / 3.76 |
| 8 | `components/admin/RoleRecognizeControl.tsx:225` | `bg-surface` | 3.35 / 3.76 |
| 9 | `components/admin/StagedPreviewBanner.tsx:72` (picker Link) | transparent on `bg-warning-bg` | 3.04 / 2.79 — §4.4 |
| 10 | `components/admin/StagedReviewCard.tsx:649` | `bg-surface` | 3.35 / 3.76 |
| 11 | `components/admin/StagedReviewCard.tsx:660` | `bg-surface` | 3.35 / 3.76 |
| 12 | `components/admin/UnignoreButton.tsx:57` | `bg-surface` | 3.35 / 3.76 |
| 13 | `components/admin/showpage/ShareHub.tsx:777` | `bg-surface` | 3.35 / 3.76 |
| 14 | `components/admin/telemetry/HealthAlertResolveButton.tsx:24` | `bg-surface` | 3.35 / 3.76 |
| 15 | `components/admin/telemetry/HealthAlertsPanel.tsx:256` (Link) | `bg-surface` | 3.35 / 3.76 |
| 16 | `components/admin/wizard/Step3ReviewModal.tsx:604` | `bg-surface` | 3.35 / 3.76 |
| 17 | `components/admin/wizard/Step3ReviewModal.tsx:688` | `bg-surface` | 3.35 / 3.76 |
| 18 | `components/admin/wizard/step3ReviewSections.tsx:4121` | `bg-surface` | 3.35 / 3.76 |
| 19 | `components/admin/wizard/step3ReviewSections.tsx:4178` | `bg-surface` | 3.35 / 3.76 |
| 20 | `components/diagrams/GalleryLightbox.tsx:693` (reset chip) | `bg-surface-raised` | 3.35 / 3.53 — §4.3 |
| 21 | `components/shared/ReportModal.tsx:622` | `bg-surface` | 3.35 / 3.76 |

Line numbers are a convenience for the implementer, not the contract — they were read on 2026-08-16 and any of them may drift under a sibling merge. The **contract is the derived cover** (§3), and the implementation's own acceptance check is that re-running it returns exactly the three switch tracks (§5).

### 4.3 GalleryLightbox reset chip (`components/diagrams/GalleryLightbox.tsx:693`)

Post-filing addition (landed 2026-08-15/16 on `feat/diagram-demote-notice`, which is why the entry's count says 23 and the live cover says 24). Its in-file comment cites impeccable critique MED-5: `border-border-strong` "gives the chip slight visual primacy over the chevrons when active". The swap STRENGTHENS that primacy (1.59/1.50 → 3.35/3.53 on `surface-raised`), so the MED-5 intent survives rather than being overturned — but the comment names a token that will no longer be there, so it is updated in the same commit. An implementer who leaves the comment pointing at `border-border-strong` has shipped a false citation, and this is the one site where that is possible.

### 4.4 StagedPreviewBanner picker link (`components/admin/StagedPreviewBanner.tsx:72`)

Transparent fill on the `bg-warning-bg` banner — a TINTED plate, and the one census row whose post-swap number does not clear 3:1 in both themes. It swaps with the rest and both themes improve (1.44 → 3.04 light, 1.19 → 2.79 dark); the residual dark **2.79** is exactly the tinted-plate class already filed as `BL-CONTROL-OUTLINE-ON-TINTED-PLATES`, whose entry already records `warning-bg` at 2.79 dark. It files there, not here, and this arc adds no new entry for it — the site simply joins the eleven controls that entry already counts, and the entry's site list gains this row. The sibling `<span aria-current>` at `components/admin/StagedPreviewBanner.tsx:65` is non-interactive chrome: outside the census, keeps its token.

## 5. Verification / pins

### 5.1 The ratio side needs nothing new

`text-faint` against all four neutral grounds is already pinned in `tests/styles/secondary-action-contrast.test.ts` (`--color-surface`, `--color-surface-sunken`, `--color-bg`, `--color-surface-raised`, asserted `≥3.0`) and already carried as §1.2 rows. Every one of the 21 swapped sites lands on one of those four. **No new ratio assertion, no new token, no new DESIGN.md table row** — which is the check that the ruling really is one token per site.

### 5.2 The structural pin, and why it is a derivation rather than a list

The derived cover flips polarity: today it is a hit list of 24, and after the swap it must return **exactly the switch tracks**. The naive form — assert the result equals a hardcoded array of three file paths — is the enumerated shape AGENTS.md's class-sweep rule rejects: it re-opens the moment somebody adds a site, and it encodes no reason.

The probe that settles the shape (run 2026-08-16, this session): `ScanElement` carries **no testid**, so the entry's suggested "file+testid" key is not available. What it does carry is `paths` — one class-string array per conditional branch of the element's `className`. All three tracks come back with a branch containing `border-accent-edge bg-accent`, and no swapped site has any such branch. So the exemption is **derivable from the element itself**:

> An element in the cover is exempt if and only if one of its `paths` branches carries `border-accent-edge` — i.e. it is a two-state control whose ON boundary is the accent edge. Anything else in the cover is a failure.

That predicate states the ruling's reason (the toggle's ON/OFF pair is a designed relationship) rather than restating its outcome, and a fourth toggle added later is covered without an edit.

The registry does not disappear, it changes job: the suite also asserts the exempt set's **file paths equal a named three-row registry**, so a fourth accent-edge control is not silently absorbed — it reds once, and someone adds a row deliberately with the ruling cited. Derivation decides admissibility; the registry decides whether the population changed. Both, not either.

### 5.3 What the suite must prove about itself

- **Premise, executably** (`tests/_shared/premise.ts`, per `BL-GUARD-PREMISE-REACHABILITY`): `scanInteractiveElements` must return a non-trivial universe, and the cover must be non-empty. Without it a scanner that silently returned `[]` — a bad root path, a changed extension filter, a parse regression — makes the whole suite pass vacuously and pass forever. This is the exact failure the premise helper exists for.
- **Negative control:** a constructed fixture element carrying `border border-border-strong bg-surface` on a `<button>` must be FLAGGED by the same predicate function the suite runs. Without it, "the cover returns only tracks" is equally satisfied by a detector that flags nothing.
- **Both halves of the exemption, separately:** a fixture with an `border-accent-edge` branch is exempt, and a fixture without one is not. One case each, so the predicate cannot pass by always answering the same way.
- **No bare grep.** A text-level `border border-border-strong` cover is NOT mechanically safe. Measured 2026-08-16 (`grep -rn "border border-border-strong" app components --include="*.tsx"`): **73** lines, against **24** controls in the derived cover — so roughly two thirds of the text hits are cards, chips, tiles and popover surfaces that MUST keep the token. That gap, not the absolute figure, is the point; the literal moves under every sibling merge (the BACKLOG entry recorded 74 at filing and 69 on 2026-08-15, and it is 73 today), which is itself the argument against a text scan. The census is `scanInteractiveElements`, never a grep, and the suite must not reintroduce one.

### 5.4 Enrolment precedes review (AGENTS.md convergence rule 4)

This is a guard surface whose defect class is exactly "reports OK while the output moved", and the registry can express it — so it is authored to be enrollable rather than retrofitted. The cover and the exemption predicate live in an **importable module** — a new `controlOutlineScan` module beside the existing `tests/styles/interactiveScanCore.ts`, exporting named functions with no top-level `process.exit` — and a new sibling suite imports it. (Both paths are NEW files this arc creates; the plan names them exactly. They are deliberately not written as citations here, because a citation to a file that does not yet exist is exactly the invented-API shape the citation pass exists to catch.) A terminal CLI script is not enrollable and must not be the shape here — two prior arcs paid for deciding this late (the classname-equivalence scripts, unenrollable as shipped, drew fifty false-pass findings across fourteen diff rounds).

The plan therefore adds a `tests/mutation/source/registry.ts` row (`sourcePath`, `suitePaths`, operator subset, `scoreFloor`, and a `control` edit the suite must notice) and runs `pnpm mutation:guards` **before the first review dispatch**, with the score and the unaccepted-survivor set stated in the round-1 brief. The convergence criterion for review of this guard is that score plus an empty unaccepted-survivor set — both machine-computed — not a reviewer's opinion about what the guard "should" pin.

### 5.5 Invariant 8

The diff touches `components/**`, `app/**` (non-API) and `DESIGN.md`, so it is a UI surface three times over. The plan carries `/impeccable critique` and `/impeccable audit` as explicit implementation tasks with P0/P1 dispositions recorded, plus the machine-checkable `impeccable-gate:` closeout marker line enforced by `tests/docs/_metaInvariant8Closeout.test.ts`.

## 6. Documented limits

Each of these is a stated position with its number recorded, not an open gap. Per the AGENTS.md ledger filing bar, a hypothetical whose worst case is a conservative appearance plus a recorded ratio belongs here — it does not get a new `BL-` row.

- **The three switch tracks' OFF ring: 1.43:1 light / 1.75:1 dark against its own track fill** (`border-border-strong` on `bg-surface-sunken`, at `components/admin/PublishedToggle.tsx:305`, `components/admin/settings/AutoPublishToggle.tsx:136`, `components/admin/settings/NotifyToggle.tsx:144`). NEW as of this spec, and the direct consequence of the Option B ruling (§2.1). It is under the 3:1 non-text floor and stays there by decision: the ON/OFF pair is a tuned relationship, the state is carried by track fill and knob position rather than by the ring, and the ON boundary (`accent-edge` vs `accent`, 3.61:1 light) is the load-bearing 1.4.11 pair and is untouched. Not re-filed as a backlog entry.
- **`disabled:opacity-60` drops any outline back under 3:1** — pre-existing and already recorded in DESIGN.md §1.2a; WCAG exempts inactive controls.
- **Tinted-plate outer edges** — `BL-CONTROL-OUTLINE-ON-TINTED-PLATES` owns this class. §4.4's `StagedPreviewBanner` link joins that entry's site list at 2.79 dark; this arc opens nothing new for it.
- **`bg-transparent` controls take whatever ground they are rendered on**, which no static measurement can supply. The census and its structural pin cover the enumerated set only; a transparent control moved onto an unmeasured ground is outside what §5.2 can see. Stated so the guard's reach is not overread.

## 7. Threat fence and probe domain (for every review brief on this arc)

- **PROBE DOMAIN:** the live repository — `app/**`, `components/**` as walked by `scanInteractiveElements`, plus `app/globals.css` runtime tokens and `DESIGN.md`. An admissible probe is drawn from that set or is one ordinary edit away from a file in it. A constructed fixture outside it files to §6, not to a finding.
- **THREAT FENCE:** the guard defends against an ordinary contributor adding or editing a control and reaching for `border-border-strong` out of habit, and against a future arc silently re-splitting the treatment. Adversarial obfuscation of a className — computed strings assembled to defeat the scanner, dynamic token construction — is OUT of scope and files to documented limits. `scanInteractiveElements` already reports `unresolved` for what it could not statically read, which is the surfaced-signal half of the consequence bound.
- **CONSEQUENCE BOUND:** §2's bound — every in-scope control is at ≥3:1 or is a named exemption with its ratio recorded in §6; never silently between the two.

## 8. Dimensional Invariants

**None, and that is a measured claim rather than an omission.** The complete diff is a substitution of one colour custom property for another inside the SAME Tailwind `border` utility, at every one of the 21 sites. Enumerated as the self-review rule asks, the dimension relationships that could have moved and do not:

| Relationship | Before | After | What guarantees it |
| --- | --- | --- | --- |
| Control border-width | `1px` (bare `border` utility) | `1px` (same utility) | The utility is untouched at every site; only the colour class beside it changes |
| Control box size (`getBoundingClientRect`) | unchanged | unchanged | Border-width, padding and font utilities are all untouched; a colour class contributes nothing to layout |
| Parent → child height/width in any card, row or modal containing a swapped control | unchanged | unchanged | No swapped control is a fixed-dimension parent, and none gains or loses a box-model property |
| Switch-track geometry (`h-7 w-12`, 28px visual + `before:-inset-y-2` to the 44px tap floor) | unchanged | unchanged | The three tracks are exempt from the swap entirely (§2) |

Because no dimension relationship changes, this spec's plan does **not** owe the real-browser `getBoundingClientRect` task the writing-plans rule mandates for fixed-dimension parents with flex/grid children — there is no such new relationship in the diff. That exemption is claimed here explicitly so the plan's omission of the task is a decision on the record, not a gap. The Tailwind v4 "`.flex` does not default to `align-items: stretch`" trap is not reachable from a colour-token change.

## 9. Transition Inventory

**No state is added, removed, or re-timed.** Every swapped control already carries `transition-colors duration-fast`, and the swap changes which colour that existing transition interpolates toward — not the set of states nor any pair between them.

| State pair (per swapped control) | Treatment | Changed by this arc? |
| --- | --- | --- |
| rest → hover | existing `transition-colors duration-fast`; hover changes the FILL (`hover:bg-surface-sunken`), not the outline | No — the outline colour is constant across this pair, before and after |
| rest → focus-visible | instant ring (`focus-visible:ring-2 ring-focus-ring`); the ring is a separate layer from the border | No |
| rest → disabled | `disabled:opacity-60`, which uniformly dims the whole control including the outline | No — and the resulting sub-3:1 outline is the documented limit in §6 |
| hover → focus-visible, hover → disabled, focus-visible → disabled | composition of the three rows above; no ordering or timing dependency between the fill transition and the instant ring | No |

Compound case, stated because the rule asks for it: a control re-rendering into `disabled` **while** its `transition-colors` hover interpolation is mid-flight composes exactly as it does today — the opacity change applies to the element, the colour interpolation continues underneath it. That behaviour is unchanged by this arc, because it is a property of the utilities already on the element.

The three switch tracks are the only controls in the census with a genuine two-state colour transition (`border-accent-edge bg-accent` ↔ `border-border-strong bg-surface-sunken`), and they are exempt from the swap (§2), so that transition is untouched in both directions.
