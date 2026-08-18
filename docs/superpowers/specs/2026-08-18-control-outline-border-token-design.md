# Control outlines at `border-border` on a neutral or absent fill — the text-ramp sweep

**Branch:** `fix/control-outline-border-token` · **Ledger row:** `BL-CONTROL-OUTLINE-BORDER-TOKEN-ON-NEUTRAL-FILL` · **Ruled:** 2026-08-18

Sibling of `docs/superpowers/specs/2026-08-16-control-outline-surface-fills-design.md`, which moved the `border-border-strong` half of the same predicate. This spec moves the `border-border` half. Its structure deliberately mirrors that spec's, because a reviewer of one is a reviewer of the other.

**Measurement record:** `docs/superpowers/specs/probes/2026-08-18-border-border-neutral-fill-census.md`. Every count, ratio, class decomposition and per-site class string in this spec is read from that record, which was produced from the live tree on 2026-08-18. Figures are not restated here except where a sentence would be unreadable without one — a summary that drifts from the record it summarises is worse than a pointer.

---

## 1. Resolved scope — do not relitigate

- **The design question is RULED (§2).** It was put to the user on 2026-08-18 with a rendered mockup showing three candidate weights on the confirm-row Cancel, on the split button of §3.4, and on the crew surfaces — show tiles, section chips, `PersonRow` call/text buttons — in both themes. The user chose the text ramp. Neither the ruling nor the crew surfaces are open.
- **The change is one colour token per site, PLUS the hover repair §3.6 requires.** `border-border` → `border-text-faint` at 37 elements (32 source lines), and at 21 of those same elements a `hover:border-*` utility is deleted (12) or retargeted (6 to `border-text-subtle`, 3 to `border-accent-on-bg`). No new component, no new prop, no new state, no new element, no new colour token, no geometry change.
- **THE SWEPT SET IS 37, AND THE USER WAS SHOWN 30.** The delta is +8 unfilled controls (§3.2, a derivation from `DESIGN.md`'s ratified "or left unfilled" clause) −1 divider (§3.3), and it moves the crew-facing count from thirteen to fourteen. Stated at the top because a reader who takes 30 as the scope will mis-review everything below it. If the widening is narrowed on review, §3.2 is the only section that changes.
- **Three families are OUT by decision, each with its own evidence** (§3.3, §3.5, §6). Dividers, `hover:`-only occurrences of `border-border-strong`, and ShareHub's ratified mobile skin.
- **The swap CAUSES a hover-weight inversion at 21 sites, and §3.6 repairs it in-branch.** Found by spec review round 1. Rest moves to 3.35:1 while the hover override stays at 1.59:1 (`border-border-strong`, 18 sites) or 2.33:1 light (`border-accent`, 3 sites), so hovering would read lighter than resting at ALL 21. 12 sites drop the override, 6 raise to `border-text-subtle`, 3 raise to `border-accent-on-bg`. No residual inversion.
- **The 2026-08-16 arc's rulings are untouched.** The five switch tracks stay exempt; the accent-filled primary action stays exempt; the 21 swapped elements keep `border-text-faint`; §1.2a's scope paragraph on non-interactive chrome is unchanged, and `BL-CONTROL-OUTLINE-PAIRED-CHROME-WEIGHT` still owns that question.

### 1.1 Self-review sections that are N/A here, and why

Stated rather than omitted, so absence is not read as oversight.

| Section | Why N/A |
| --- | --- |
| DB completeness matrix, CHECK/enum migration matrix | No DDL, no RPC, no migration. The diff is `.tsx` class strings, `DESIGN.md`, THREE files under `tests/styles/` (`controlOutlineScan.ts`, `_metaControlOutlineFill.test.ts`, `secondary-action-contrast.test.ts`), and `BACKLOG.md`. |
| Advisory-lock topology (invariant 2) | No code path mutates `shows`, `crew_members`, `crew_member_auth`, `pending_syncs` or `pending_ingestions`. |
| §12.4 catalog lockstep | No error code is added, edited or removed, so `pnpm gen:spec-codes` and `lib/messages/catalog.ts` are untouched. |
| Supabase call-boundary discipline (invariant 9) | No Supabase client call is added or moved. |
| Mutation-surface observability (invariant 10) | No route handler and no `"use server"` action is added or modified. |
| Flag lifecycle table | No boolean config field or toggle is introduced. |
| Guard conditions per prop | No component signature changes. Every edited string is a static class literal or a branch of an existing ternary whose condition is untouched. |
| Transition Inventory | §9. |
| Dimensional Invariants | §8. |

---

## 2. The decision (user-owned) — RULED

**Ruling: the text ramp.** A control whose resting outline is `border-border`, and whose fill is one of the four neutral ground tokens *or absent*, takes `border-text-faint` — the same weight the 2026-08-16 arc moved 21 controls to.

The mockup the ruling was taken against rendered, at all three candidate weights and in both themes: the `ArchiveShowButton` confirm row; the split `ResetPickerEpochButton`; and the crew half — `/me` show tiles, `SectionChipLink` chips, and `PersonRow`'s call and text buttons. The user was shown the option of leaving them (a ratified quiet tier) and the option of splitting buttons from tile edges, and chose neither.

### 2.1 Rejected branches — do not relitigate in either direction

- **"Leave them; document that quiet is deliberate."** Offered, rendered, declined. `border-border` is NOT a ratified third weight for quiet controls, and §1.2a gains no sentence saying so.
- **"Split: buttons move, tile edges stay."** Offered, rendered, declined. The five tile- and card-shaped links (`app/me/meShowSections.tsx:174`, `app/me/meShowSections.tsx:213`, `app/me/meShowSections.tsx:258`; `components/admin/NeedsAttentionSummaryCard.tsx:36`; `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:240`) MOVE. They reach the census through `scanInteractiveElements`, so they are controls; the user saw the show tiles rendered at the firm weight and ruled anyway. A reviewer arguing any of them is a card edge rather than a control outline is relitigating a rendered ruling — unless the argument is that the element is not interactive at all, which is §3.3's treatment and requires a per-site probe.
- **A new intermediate token.** `border-border-strong` measures 1.43-1.75:1 and is under the floor everywhere too; a new token between it and the text ramp would need its own pin and its own ruling. Not proposed, not offered, not in scope.

---

## 3. What the population actually is

The ledger entry publishes a derived cover of 30. **That cover is one quadrant of the class, and this arc's first substantive finding is the decomposition.** Full transcript in the probe record §4; the operative results:

`DESIGN.md:182-188` states the predicate as *"any control filled with one of the four neutral ground tokens … **or left unfilled**."* The published cover implements the first disjunct only — it requires a `bg-` neutral token — and it tests for the token without testing which **side** the token paints. So it misses eight unfilled controls and admits one divider.

44 elements carry the token. Classified by what it paints:

| Class | What it is | Count | Disposition |
| --- | --- | --- | --- |
| **A** | full resting outline, neutral fill | 29 | **SWAP** |
| **B** | full resting outline, unfilled or `bg-transparent` | 8 | **SWAP** (§3.2) |
| **C** | divider — `border-t` / `border-b` / `border-l` | 5 | **EXCLUDE** (§3.3) |
| **D** | `max-sm:`-prefixed, ShareHub | 2 | **FILE** (§3.5) |

**Swap set: 37 elements.** Class A is the published cover's 30 minus the one divider it contains.

### 3.1 Class A — the cover, minus its divider

The 29 rows are the probe record §2 table minus row 13. Thirteen are crew-facing by render chain (fourteen once class B's `ReportModal` is added — §3.2), four of which no path regex sees (`components/agenda/AgendaEmbed.tsx:83`, `components/agenda/AgendaPdfViewer.tsx:198`, `components/layout/ThemeToggle.tsx:91`, `components/shared/ReportButton.tsx:142`). Five are the confirm-row Cancels of probe record §5 — the escape route from a destructive confirm whose trigger the 2026-08-16 arc strengthened to 3.35:1, which is the pair the ruling's mockup led with.

### 3.2 Class B — eight controls inside §1.2a's words that the cover cannot see

**The derivation, quoted rather than asserted.** `DESIGN.md:185-188` reads, verbatim and unemphasised:

> In practice that is any control
> filled with one of the four neutral ground tokens (`--color-bg`,
> `--color-surface`, `--color-surface-sunken`, `--color-surface-raised`) or left
> unfilled.

"Or left unfilled" is ratified text, in force since 2026-08-14 and re-ratified when the predicate was widened on 2026-08-16. **These eight are therefore a derivation from an existing rule, not a scope extension.** The 2026-08-16 arc moved unfilled controls that carried `border-border-strong`; the only property that kept these eight out of that sweep is the token they carry — which is precisely what the user ruled on. A reviewer who reads class B as new scope should read that clause first.

**The set is 30 in the mockup and 37 in the diff, and the delta is these eight minus the divider.** Every one is named here with the class string that puts it in the predicate, because the user was shown 30.

| # | Element | Rest fill | Class string (outline fragment) | Crew? |
| --- | --- | --- | --- | --- |
| 1 | `components/admin/HoverHelp.tsx:562` | `bg-transparent` | `rounded-full border border-border bg-transparent` | admin |
| 2 | `components/admin/NeedsAttentionInbox.tsx:101` | none | `rounded-md border border-border px-3` | admin |
| 3 | `components/admin/NeedsAttentionInbox.tsx:130` | none | same recipe | admin |
| 4 | `components/admin/NeedsAttentionInbox.tsx:198` | none | same recipe | admin |
| 5 | `components/admin/NeedsAttentionInbox.tsx:224` | none | same recipe | admin |
| 6 | `components/admin/dev/MaterializeCard.tsx:73` | none | `rounded-md border border-border px-4` | admin (dev) |
| 7 | `components/admin/telemetry/AutoRefreshControl.tsx:119` | none | `rounded-sm border border-border p-1.5` | admin (dev) |
| 8 | `components/shared/ReportModal.tsx:675` | none | `rounded-sm border border-border px-3 py-2` | **CREW** |

**Reachability was traced by render chain, not by directory** — the method the ledger entry's own thirteen were counted with:

- **Row 8 is crew-reachable, through TWO hops rather than one.** `components/layout/Footer.tsx:42` imports `ReportButton`, and `components/crew/primitives/CardHeaderActions.tsx:15` imports `CardReportTrigger`; each of those intermediates imports `ReportModal`. The chains are Footer → `components/shared/ReportButton.tsx:142` → `components/shared/ReportModal.tsx:675`, and CardHeaderActions → `components/shared/CardReportTrigger.tsx` → `components/shared/ReportModal.tsx:675`. `ReportButton` is itself class A row 30. Row 8 is the only crew surface class B adds, taking the swap set's crew-facing count from thirteen to **fourteen**.
- **Rows 1-7 are admin-only by chain.** `HoverHelp` and `NeedsAttentionInbox` are imported only under `app/admin/**` and `components/admin/**`; `MaterializeCard` only by `app/admin/dev/page.tsx`; `AutoRefreshControl` only by `app/admin/dev/telemetry/page.tsx` and `app/admin/dev/telemetry-dim/page.tsx`.

Two structural notes:

- Row 7, `components/admin/telemetry/AutoRefreshControl.tsx:119` — the SAME FILE contains `components/admin/telemetry/AutoRefreshControl.tsx:106`, one of the five switch-track render paths §1.2a rules OUT. They are different elements and must not be conflated. `components/admin/telemetry/AutoRefreshControl.tsx:106` is untouched by this arc; a reviewer checking the switch-track exemption should confirm the diff does not reach that line.
- Rows 2-5 share ONE source occurrence — the file-local `reviewLinkClass` at `components/admin/NeedsAttentionInbox.tsx:31`. One edit moves four census rows. This is the predecessor spec's shared-constant shape (`RoleMappingRow`'s `outlineBtn`), and it is why element count and edit count differ (§4.3).

### 3.3 Class C — five dividers, EXCLUDED, evidenced per site

`DESIGN.md` §1.2a preserves the border tokens for dividers by name. None of these five has a resting outline to raise: each paints one side as a rule between stacked content. Raising one to 3.35:1 would darken a hairline on a non-control surface — a visible change with no boundary made visible.

Each is quoted with its class string in probe record §4 (class C table): `components/admin/RecentAutoAppliedStrip.tsx:447` (`rounded-t-md border-b border-border`), `components/admin/BellPanel.tsx:1213` (`border-t`), `components/crew/primitives/KeyTimesStrip.tsx:191` (`border-t`, and a §1.1a Family S `<summary>`), `components/admin/showpage/AttentionMenu.tsx:189` (`border-b … last:border-b-0`), `components/admin/telemetry/EventFilters.tsx:85` (`border-l`, a segment separator inside a joined control).

**Fenced in BOTH directions, per the ruling's own discipline:**

- Nobody may argue these should have been swept because "the cover found one of them" — the cover tests the token, not the side, and the ruling's words are about an *outline*.
- Nobody may argue the exclusion should be widened into a rule about which elements are "really controls" — it is a statement about which SIDE the token paints, nothing more. Four of the five were never in the cover at all.

Only `RecentAutoAppliedStrip.tsx:447` sits inside the published 30; the other four are recorded here because the class sweep found them and a later reader would otherwise re-derive the question.

### 3.4 The regression pin is green on a control rendering at 1.27:1

`app/admin/show/[slug]/ResetPickerEpochButton.tsx:178` is a class A row AND a row of the 2026-08-16 census (`tests/styles/controlOutlineScan.ts:46`). Its `compact` branch carries `border-text-faint` (3.35:1); its non-`compact` branch carries `border-border` (1.27:1).

**Already recorded, and RESOLVED rather than overridden** — the 2026-08-16 spec names it at its §2.1 R3 and again as a §6 documented limit. That limit is not a collision this arc drives through: **it existed BECAUSE `border-border` was out of that arc's scope**, and it says so in its own words ("`border-border` is a different token with a different job … moving it is a design decision this ruling did not make"). The 2026-08-18 ruling makes that decision. The limit is therefore discharged by the ruling, and this diff is what discharging it looks like — a reviewer reading a documented-limit conflict here has the direction backwards.

What this arc adds beyond the swap is the guard consequence: `tests/styles/_metaControlOutlineFill.test.ts:112-123` asserts `carries(element, "border-text-faint")`, an existential over render paths, so the pin stays green while one branch renders under the floor — and would stay green if a future edit regressed the compact branch, so long as some branch kept the token.

That is a **limit of the pin, not a defect in it**; its docstring is explicit that it answers "did the 21 elements this PR changed stay changed" over a closed set. §5.2 closes it, using a helper that already exists in the same file.

### 3.5 Class D — ShareHub, FILED under class-sweep exception (b)

`components/admin/showpage/ShareHub.tsx:781` and `components/admin/showpage/ShareHub.tsx:817` carry `max-sm:border-border`, which the cover's whole-token regex does not match. A `max-sm:` prefix is a **resting** outline below 640px — unlike `hover:`, which is a state cue (`components/layout/ThemeToggle.tsx:125` rests at `border-border` and takes `border-border-strong` only on hover; correctly outside every cover, recorded at the 2026-08-16 spec §3.2). So the ruling's words reach ShareHub, and `components/admin/showpage/ShareHub.tsx:781` is the sharpest instance in the repository: both ternary arms **already carry `border-text-faint`** from the 2026-08-16 swap while `max-sm:border-border` wins the cascade, so one button paints 3.35:1 on a desktop viewport and **1.27:1 on a phone**.

**It is filed rather than repaired, and the reason is not "same defect, different file".** Two independent ratifications fence it:

1. **A design ratification.** The in-file comment at `components/admin/showpage/ShareHub.tsx:798-801` cites `spec 2026-07-24-strip-mobile-stacked-band §3 R3` — "border color drops to `border-border` below sm (the §3 R3 skin; width stays 1px)."
2. **An executable ratification, which is the load-bearing one.** `tests/styles/_metaControlOutlineFill.test.ts:156-164` is a shipped pin titled *"keeps `max-sm:border-border` on BOTH ShareHub ternary arms"*, whose docstring records that plan review R3 probed corrupting both tokens and found the rest of the suite stays green while the responsive treatment is silently gone.

Swapping ShareHub here means editing that pin to assert the opposite of what it was written to assert — the shape where a guard is rewritten to match the change it exists to catch. **Class-sweep exception (b) applies: a ratified scope decision already fences it.** The filing is §6's ledger row; its first scheduled step is the design question this arc cannot settle — whether §1.2a's control-outline rule supersedes the §3 R3 mobile skin — and the answer is one edit plus one pin update once ruled.

`tests/styles/_metaControlOutlineFill.test.ts:156-164` is therefore **untouched by this arc**, and that is an acceptance criterion (§5.4), not an omission.

### 3.6 The hover inversion this swap CAUSES, and its repair

**Found by spec review round 1, and it is the arc's one genuine design consequence.** It is not a pre-existing condition: the predecessor's 21 contained exactly ONE `hover:border-*` override (`components/admin/ArchiveShowButton.tsx:365`, `hover:border-status-warn` — a semantic escalation, not a weight cue), so the 2026-08-16 arc never met this class.

**Twenty-one of the 37 carry a `hover:border-*` override** — 18 at `border-border-strong`, 3 at `border-accent`. Today rest is `border-border` (1.27:1) and hover is 1.59:1 or 2.33:1 — a step UP in both cases. After the swap rest is `border-text-faint` (3.35:1) and neither hover token moves — **a step DOWN at all 21. Hovering would make the outline weaker than resting.** Shipping the swap without touching these ships **21** inversions — 18 at `border-border-strong` (1.59:1 both themes) and 3 at `border-accent` (2.33:1 light) — repaired here as 12 deletions and 9 retargets.

The repair is derived from one question — *does this control have a hover cue other than its border?* — not from a per-site judgement:

**(a) 12 sites carry another hover cue ON THE SAME RENDER PATH → DELETE the `hover:border-border-strong`.** The outline stays constant at 3.35:1 and the existing `hover:bg-*` / `hover:text-*` / `hover:underline` carries the affordance. `components/admin/HoverHelp.tsx:562`, `components/admin/NeedsAttentionInbox.tsx:101`/`components/admin/NeedsAttentionInbox.tsx:130`/`components/admin/NeedsAttentionInbox.tsx:198`/`components/admin/NeedsAttentionInbox.tsx:224`, `components/admin/UnarchiveShowButton.tsx:67`, `components/admin/nav/UserMenu.tsx:51`, `components/crew/SectionChipLink.tsx:48`, `components/crew/primitives/PersonRow.tsx:196`/`components/crew/primitives/PersonRow.tsx:213`, `components/layout/ThemeToggle.tsx:91`, `components/shared/ReportButton.tsx:142`.

**(b) 6 sites have NO other hover cue on the path that carries the border-hover → RAISE to `hover:border-text-subtle`.** **The split is a derivation, not a preference.** Deleting the override at these six would remove hover feedback outright — a regression — so raising is the only non-regressive option; and at the twelve of (a) another cue already carries the affordance, so deleting is the minimal change that removes the inversion. Neither branch is a judgement call once the question "does this control have a hover cue other than its border" is answered. `--color-text-subtle` measures 6.47/6.75 on `bg`, 6.76/6.35 on `surface`, 6.76/5.97 on `surface-raised`, 6.09/6.94 on `surface-sunken` — comfortably heavier than the 3.35:1 rest in both themes, so the pair reads as a step UP again. Five are crew surfaces — `app/me/meShowSections.tsx:174`, `app/me/meShowSections.tsx:213`, `app/me/meShowSections.tsx:258`, `components/agenda/AgendaEmbed.tsx:83`, `components/agenda/AgendaPdfViewer.tsx:198` — and the sixth is `components/admin/showpage/PublishedReviewModal.tsx:964`.

**`components/admin/showpage/PublishedReviewModal.tsx:964` is in (b) because the classification must be PER RENDER PATH, not over the union of an element's strings** (spec review R2 F1). The scanner resolves two paths: path 1 is `border border-border bg-surface-sunken … hover:border-border-strong`, path 2 is `bg-warning-bg … hover:bg-warning-bg/80`. The other hover cue belongs only to path 2, so deleting the border-hover would leave path 1 with no hover feedback at all — and the source comment at `components/admin/showpage/PublishedReviewModal.tsx:978` says in as many words that hover moves the border. On its `bg-surface-sunken` fill, `border-text-subtle` measures 6.09 light / 6.94 dark against a 3.02 / 4.11 rest, so the pair still reads as a step up.

**The class is swept, not the instance.** A per-path re-run over all 21 override sites — for each path carrying a `hover:border-*`, does that same path carry another `hover:` utility — returns **exactly one** element where the union answer and the per-path answer disagree, and it is this one. The check is a derivation over `element.paths`, so it stays correct if a site is added.

**(c) 3 sites carry `hover:border-accent` → RAISE to `hover:border-accent-on-bg`.** `components/admin/dev/SwitcherControls.tsx:83`, `components/admin/dev/SwitcherControls.tsx:92`, `components/admin/dev/SwitcherControls.tsx:142`.

An earlier draft left these alone and argued that the cue here is HUE rather than weight, so a sub-3:1 hover was acceptable. **That argument is withdrawn: it rested on an unprobed claim, and a documented limit resting on an unprobed claim is the finding, not the fence.** `--color-accent` as an outline measures **2.23/8.16** on `bg`, **2.33/7.69** on `surface`, **2.33/7.22** on `surface-raised`, **2.10/8.39** on `surface-sunken` — in light mode every one of those is BELOW the new 3.35:1 rest, so it is an inversion by weight in exactly the way (a) and (b) are, and SC 1.4.1 cuts against the hue argument rather than for it, because hover here is conveyed by colour alone.

The repair needs no new decision, because `DESIGN.md` already states the rule it follows. `DESIGN.md:119` records `--color-accent` on `--color-bg` at **2.23:1 light** and marks it `decorative-only in light — use --color-accent-on-bg for any load-bearing text/glyph` (quoted verbatim; the em-dash is `DESIGN.md`'s, not this spec's). A hover cue that must be perceivable is load-bearing by definition, so these three take the token `DESIGN.md` already designates for that case. `--color-accent-on-bg` as an outline measures **5.34/9.39** on `bg`, **5.57/8.84** on `surface`, **5.57/8.30** on `surface-raised`, **5.02/9.65** on `surface-sunken` — a clear step UP from the 3.35:1 rest in BOTH themes, with the accent hue preserved. This is the same shape of derivation as class B's: an existing ratified rule reaching a case nobody had applied it to.

**`aria-expanded:border-accent` is retargeted too, not only `hover:border-accent`** (spec review R3 F2). `components/admin/dev/SwitcherControls.tsx:145` carries BOTH `aria-expanded:border-accent` and `aria-expanded:bg-surface-sunken`, so an expanded-but-not-hovered control would keep an accent outline on a sunken fill at **2.10:1 light / 8.39:1 dark** against the new 3.35 / 3.76 rest — an inversion this arc would have caused, and a surviving sub-3:1 boundary the draft recorded nowhere. Both `hover:` and `aria-expanded:` occurrences of `border-accent` move to `border-accent-on-bg`, which measures **5.02 light / 9.65 dark** on `surface-sunken`. A sweep of all 37 for a border-colour override under any other state prefix — `focus:`, `focus-visible:`, `group-hover:`, `peer-*`, `data-*`, `open:`, `aria-*` — returns nothing further.

**Reachability probed, since it was previously asserted:** `components/admin/dev/SwitcherControls.tsx` is imported by exactly one file, `components/admin/dev/AttentionModalSwitcher.tsx`. It is a developer surface and is NOT crew-reachable by any render chain. That fact is now a footnote rather than load-bearing, since the sites are repaired.

**All 21 are repaired and the arc leaves no residual hover inversion.** 12 delete, 6 raise to `border-text-subtle`, 3 raise to `border-accent-on-bg`.

**Why this is repaired in-branch rather than filed.** It is not "same defect, different file" — it is a defect this diff CREATES, at 21 sites, and none of the three class-sweep exceptions applies: no design decision is unsettled (the ruling already says a control's resting outline takes the text ramp, and a hover that reads lighter than rest contradicts it), no ratified scope fences it, and the repair is 21 token edits in files this PR already opens.

---

## 4. Design

### 4.1 `DESIGN.md` §1.2a — the paragraph this arc rewrites

`DESIGN.md:227-233` currently reads:

> Separately: a control with a neutral fill but a `border-border` outline — the confirm-row Cancels at `components/admin/ArchiveShowButton.tsx:344` and `app/admin/show/[slug]/ResetPickerEpochButton.tsx:266`, both **1.27:1** — falls inside this predicate's words and outside the 2026-08-16 swap, which moved only `border-border-strong`. Widening to `border-border` is a separate design decision this ruling did not make, filed as `BL-CONTROL-OUTLINE-BORDER-TOKEN-ON-NEUTRAL-FILL`.

It is replaced by a paragraph that (a) records the 2026-08-18 ruling and that it was taken against a rendered mockup including the crew surfaces; (b) states that `border-border` on a control's resting outline is now the text ramp too, so the predicate is satisfied by the token as well as by the fill; (c) states the divider carve-out in both directions, since §1.2a already preserves the border tokens for dividers and this arc makes that preservation load-bearing; (d) points at the ShareHub filing rather than restating its numbers.

The line numbers `components/admin/ArchiveShowButton.tsx:344` and `app/admin/show/[slug]/ResetPickerEpochButton.tsx:266` in the current text are `className=` anchors and are stale against the scanner's element anchors (probe record §1). The replacement paragraph cites no line numbers for the swept population — the census is the contract (§4.3), and a prose line number is exactly what drifted.

### 4.2 `DESIGN.md` §1.2 — contrast rows

§1.2 already carries all four `--color-text-faint` OUTLINE rows (`DESIGN.md:141`, `DESIGN.md:142`, `DESIGN.md:143`, `DESIGN.md:145`) with the figures this arc's controls land on, pinned by `tests/styles/secondary-action-contrast.test.ts`. **No new or repurposed colour token is introduced**, so the "pin the ratio for any NEW token" rule is satisfied by rows that already exist and already assert.

What §1.2 does NOT carry is a row for `--color-border` as an outline — the token being moved AWAY from. One is added, recording 1.22/1.35, 1.27/1.27, 1.27/1.19, 1.15/1.38 as the measured before-state, in the same shape as the predecessor's worked-example table (`DESIGN.md:238-241`), so that a future retune of `--color-border` cannot quietly reintroduce the weight this arc removed without a failing assertion. §5.3 pins it.

### 4.3 The swap — 37 elements, one token each

Every site moves `border-border` → `border-text-faint` in place, matching the whole token.

**The shape of the diff, measured: 37 elements, 26 files, 32 source-edit lines.** All three numbers are stated because they differ, and each divergence is a trap.

**The contract is the CENSUS, not a line list and not a text sweep.** Two traps make this non-negotiable:

- **A text sweep over the affected files is catastrophically wrong.** `border-border` occurs **63 times** across those 26 files, and **exactly 32** of those occurrences belong to a swapped control. A file-scoped find-and-replace would therefore corrupt **31** non-control surfaces: card edges, panel outlines, popover shells, a dashed empty-state, a rotated tooltip caret (`components/admin/showpage/ShareHub.tsx:1148`, whose `border-border` pairs with `data-[popover-side=*]:border-t/-l/-r/-b`), dividers, and — at `components/layout/ThemeToggle.tsx:41` — a **comment** naming the token.
- **Element count and edit count differ in both directions**, exactly as in the predecessor, which is why 37 elements resolve to 32 lines. Four elements share one occurrence at `components/admin/NeedsAttentionInbox.tsx:31`; three share the `components/admin/dev/SwitcherControls.tsx` recipes; two share `components/crew/primitives/PersonRow.tsx:120`; two share `components/admin/review/ShowReviewSurface.tsx`'s pair of recipes. Conversely, an element carrying the token in both arms of a ternary needs two edits, and editing one arm ships a control whose outline changes with a prop.

The plan owes the enumerated edit list; the SPEC's contract, and the implementation's own acceptance check, is §5.2: **every census row carries `border-text-faint`, and no census row carries `border-border` on any render path.** That check catches the missed branch and the over-swept file alike, and it is derived rather than enumerated.

**Comment fidelity.** `components/layout/ThemeToggle.tsx:41` documents the component's tokens as "`border-border`, `bg-surface`". After the swap that names a token the control no longer wears. It is updated in the same commit — the predecessor hit the identical trap at its §4.3 and an implementer who leaves it has shipped a false citation.

**No shared-constant extraction.** The sites carry heterogeneous inline recipes (differing padding, radius, hover, disabled and focus-offset modifiers). Hoisting them into a constant is a refactor with its own blast radius that this ruling did not authorise. `lib/ui/actionClass.ts`'s `SECONDARY_ACTION_CLASS` already wears `border-text-faint` and is untouched.

---

## 5. Verification / pins

### 5.1 The ratio side needs one new row

`tests/styles/secondary-action-contrast.test.ts` already asserts `text-faint` clears 3:1 on all four neutral grounds in both themes. This arc adds the `--color-border` before-state row of §4.2 to the same suite, so `DESIGN.md`'s new table and the stylesheet move together.

### 5.2 The census pin is WIDENED, and strengthened by NEGATION rather than by universality

`tests/styles/controlOutlineScan.ts`'s `CENSUS` grows from 21 rows to **57**, not 58. **The swap set and the predecessor census OVERLAP at exactly one element** — `app/admin/show/[slug]/ResetPickerEpochButton.tsx:178` is a row of both, because it is the half-swapped control of §3.4 — so 21 + 37 − 1 = 57 distinct identities and only **36** of the 37 are census ADDITIONS. Spec review R4 F1: a 58-row length assertion and an every-identity-distinct assertion cannot both pass, and the draft asserted both, and `tests/styles/_metaControlOutlineFill.test.ts` gains one assertion per row: **`carries(element, "border-border") === false`** — no render path carries the old token. `carries` reads `allStrings`, which spans every render alternative, so the existential-negation IS the universal claim. It is the exact mirror of the assertion already there for `border-border-strong` (`tests/styles/_metaControlOutlineFill.test.ts:121`), so no new predicate and no new helper is written.

**Do not "strengthen" this to `everyPathCarries` — that is a regression, and the counterexample is shipped.** (One line, kept short deliberately, because the universal form is the intuitive edit and it silently re-breaks a ratified exemption.)

**`everyPathCarries` is deliberately NOT used for this, and the reason is a probe.** An earlier draft of this spec proposed moving the per-row `carries(element, "border-text-faint")` to `everyPathCarries`. Probed against the live census, that formulation fails **two** of the original 21, and only one of them is a defect:

| Row | `everyPathCarries` | Why |
| --- | --- | --- |
| `app/admin/show/[slug]/ResetPickerEpochButton.tsx:178` | false | the real defect of §3.4 — its non-compact branch is `border-border` |
| `components/admin/Mi11GateActions.tsx:69` | false | **correct and must stay passing** — its `isApprove` branch is `bg-accent … text-accent-text` with **no border at all**, the accent-filled primary action that §1.2a rules OUT by name |

A universal "every path carries the outline token" is therefore wrong for this population: a control may legitimately have a render path with no outline, and `components/admin/Mi11GateActions.tsx:69` is that case shipped and ratified. The negation form has neither problem — it catches `app/admin/show/[slug]/ResetPickerEpochButton.tsx:178` (whose second branch carries `border-border`) and passes `components/admin/Mi11GateActions.tsx:69` (whose second branch carries no border token at all).

- **Both directions per row:** `carries(element, "border-text-faint")` is true, and `carries(element, "border-border")` is false. The second is not redundant — it is the whole strengthening, and it is what makes §3.4's finding a repair rather than a note. `app/admin/show/[slug]/ResetPickerEpochButton.tsx:178` is green today and must go red until its non-compact branch moves.
- **Applied to the ORIGINAL 21 as well as the 36 additions.** Probed: exactly one of the 21 fails it today (`app/admin/show/[slug]/ResetPickerEpochButton.tsx:178`), and that failure is the intended repair. No other row regresses.
- **A negative control.** A constructed temp-dir fixture carrying `border border-border bg-surface` is found by the scan and FAILS the new assertion. A second fixture carries `border-text-faint` in one ternary arm and `border-border` in the other — it PASSES the pre-existing `carries(…, "border-text-faint")` check and FAILS the new one, which is the executable proof that the strengthening is not cosmetic and is precisely the `app/admin/show/[slug]/ResetPickerEpochButton.tsx:178` shape. A third fixture carries `border-text-faint` in one arm and NO border utility in the other — it must PASS, pinning that a legitimately outline-free branch (the `Mi11GateActions` shape) is not collateral. Each fixture case carries its own `premise(...)` — a fixture that fails to parse returns `[]` and makes the case vacuously true.
- **`everyPathCarries` stays in the file, unused by the census loop and still used at `tests/styles/_metaControlOutlineFill.test.ts:163`** for the ShareHub adjacent-token pin, which is untouched (§3.5, §5.4).
- **The divider exclusion is asserted, not merely documented.** The five class C elements are pinned as NOT members of the census, so a later arc cannot quietly add one.

### 5.3 What the suite must prove about itself

- `premise("scanner reaches the component tree", UNIVERSE.length, 200)` — the existing guard at `tests/styles/_metaControlOutlineFill.test.ts:41` stays; a scan returning `[]` makes every "carries" assertion vacuous.
- Census length is **57** and every identity (`file` + `line`) is distinct — 21 predecessor rows plus 36 additions, the 37th swap-set element being the overlapping `app/admin/show/[slug]/ResetPickerEpochButton.tsx:178` — `file` alone is not unique in **twelve** of them (five in the original 21: `RoleMappingRow`, `BellPanel`, `StagedReviewCard`, `Step3ReviewModal`, `step3ReviewSections`; seven in the new 37: `ResetPickerEpochButton` ×2, `meShowSections` ×3, `_SignInOrSkipGate` ×2, `SwitcherControls` ×3, `ShowReviewSurface` ×2, `PersonRow` ×2, `NeedsAttentionInbox` ×4).
- Every census row RESOLVES to a live element. A row that resolves to `null` is a stale line number, not a pass.
- The unresolved-element count is pinned, so the pool of elements the scanner cannot statically read cannot grow silently.

### 5.4 Untouched surfaces, asserted

- **The five switch-track paths** keep their recipe, including `components/admin/telemetry/AutoRefreshControl.tsx:106` — whose file this arc DOES edit at `components/admin/telemetry/AutoRefreshControl.tsx:119` (§3.2).
- **`tests/styles/_metaControlOutlineFill.test.ts:156-164`**, the ShareHub `max-sm:border-border` pin, is unchanged and still passes (§3.5).

### 5.5 Enrolment precedes review (AGENTS.md convergence rule 4)

`tests/styles/controlOutlineScan.ts` is enrolled in `tests/mutation/source/registry.ts:1909-1924` at `scoreFloor: 1` with `accepted: []` (probe record §7). This arc edits it, so **`pnpm mutation:guards` runs BEFORE the round-1 diff dispatch**, and the round-1 brief states the mutation score plus an empty unaccepted-survivor set. A census growing from 21 to 57 rows adds 36 integer-literal mutation sites; if any survives, the survivor is the finding and the registry row's `control` may need revisiting. `pnpm mutation:guards` is a heavy phase and runs under `pnpm heavy`.

### 5.6 Invariant 8

Every swapped file under `app/` (excluding `app/api/**`) or `components/` is a UI surface, and `DESIGN.md` changes too. The impeccable v3 dual gate (`/impeccable critique` AND `/impeccable audit`) runs on the diff before adversarial review and before closeout, with findings and dispositions in the plan's closeout. The plan carries the machine-checkable marker.

---

## 6. Documented limits

Each is a stated position with its number recorded, not an open gap.

- **The five dividers stay at `border-border`** — 1.15-1.38:1 against their neighbouring fills (§3.3). Under the 3:1 non-text floor and there by decision: none is a control boundary, and §1.2a preserves the border tokens for dividers by name. Not filed as a ledger row, because a divider at border-grade contrast is the token doing its documented job.
- **ShareHub's mobile skin, both elements, every surviving boundary with its own ratio** (§3.5). `components/admin/showpage/ShareHub.tsx:781` is `bg-surface`, so its `max-sm:border-border` measures **1.27:1 in both themes**, on a control that measures 3.35:1 above 640px. `components/admin/showpage/ShareHub.tsx:817` is a FOUR-path element and its figures are different: its two OPEN paths are `bg-surface-sunken`, measuring **1.15:1 light / 1.38:1 dark**, and its two CLOSED paths are `bg-transparent`, so both of the outline's edges are whatever ground the kebab is rendered on and no static figure applies — the same `bg-transparent` caveat this section records below. Recorded per element and per path because the consequence bound requires every surviving sub-3:1 boundary to carry its measured ratio, and a single figure copied from `components/admin/showpage/ShareHub.tsx:781` would not have described `components/admin/showpage/ShareHub.tsx:817` at all (spec review R2 F3). Filed as a ledger row under class-sweep exception (b), because two ratifications fence it and one of them is an executable pin. This is the one place this arc knowingly leaves a control the ruling's words reach.
- **Seven fill-cue sites dip within a recorded band: 3.35 → 3.02 light, 3.76 → 3.53 dark** (§9). Above the 3:1 floor throughout, the hover cue at each is the FILL change rather than the outline, and twenty of the predecessor's own twenty-one already carry the identical shape — so this is the ratified behaviour of `border-text-faint`, not something this arc introduces. Recorded rather than repaired, because repairing it means retuning a ratified treatment at 27 sites under a ruling that did not ask for it. Not filed as a ledger row for the same reason.
- **No residual hover inversion WHERE THE OUTLINE IS THE CUE.** All 21 `hover:border-*` overrides are repaired (§3.6). An earlier draft recorded the three `hover:border-accent` sites as a documented limit on a hue-versus-weight argument; that argument was withdrawn as unprobed and the sites are repaired instead. Recorded here so the withdrawal is visible rather than silent.
- **Eight of the 37 carry no `focus-visible:` utility** (§9) — pre-existing, untouched by this arc, and not caused by it. Recorded so a reader of §9's table does not read the absence as something this diff introduced.
- **`disabled:opacity-60` drops the outline under 3:1, and the composite is now MEASURED rather than asserted: 1.94-1.96 light, 2.09-2.19 dark** (spec review R4 F2). Compositing outline and fill at `opacity: 0.6` over the four neutral backdrops gives that band. **8 of this arc's 37 carry the modifier** — `app/admin/show/[slug]/PickerResetControl.tsx:255`, `app/admin/show/[slug]/ResetPickerEpochButton.tsx:260`, `app/admin/show/[slug]/RotateShareTokenButton.tsx:379`, `components/admin/ArchiveShowButton.tsx:333`, `components/admin/ShowRowActions.tsx:821`, `components/admin/UnarchiveShowButton.tsx:67`, `components/admin/dev/MaterializeCard.tsx:73`, `components/admin/wizard/CrewRowActions.tsx:339` — and 20 across the full 57-row union. Pre-existing and already noted in `DESIGN.md` §1.2a; WCAG exempts inactive controls, so this is an exemption rather than compliance, and §7's consequence bound is satisfied by the measured figure rather than by the exemption alone.
- **Tinted-plate outer edges** — `BL-CONTROL-OUTLINE-ON-TINTED-PLATES` owns this class, and **this arc adds nothing to it.** An earlier draft claimed `components/admin/showpage/PublishedReviewModal.tsx:964` joins that entry because its other branch is `bg-warning-bg`. **That was a cross-path union error and is withdrawn** (spec review R4 F3): the scanner resolves path 0 as `border-border` + `bg-surface-sunken` with no `warning-bg`, and path 1 as `bg-warning-bg` with no outline token at all. **No render path carries the swapped outline AND a tinted fill**, so the swap creates no tinted-plate boundary there and the entry is not edited. This is the same union-versus-per-path mistake R2 F1 found in the hover classification, in a second section; a sweep of all five branch-conditional elements found no third instance.
- **`bg-transparent` controls take whatever ground they are rendered on**, which no static measurement supplies. Class B contains one (`components/admin/HoverHelp.tsx:562`) and class A's `_PickerInterstitial` branch fills vary. The census and its pin cover the enumerated set; a transparent control moved onto an unmeasured ground is outside what the suite can see.
- **No forward guard.** This arc pins that its own 37 swaps stay swapped and that the original 21 stay swapped on every path. It does NOT pin that a future control cannot be added at `border-border`. `BL-CONTROL-OUTLINE-FORWARD-GUARD` owns that, with five closed escapes as its evidence, and nothing here reopens it — in particular, §5.2's divider non-membership assertion is a fixed five-row exclusion, not a classifier, and must not grow into one.
- **The scanner's element vocabulary is unchanged.** Text-entry fields remain invisible to it (`BL-CONTROL-OUTLINE-BEYOND-ELEMENT-COVER` family A), as do outlines painted on a nested child (family B). This arc widens the TOKEN and FILL halves of the predicate; it does not touch what `scanInteractiveElements` admits.

---

## 7. Threat fence and probe domain (for every review brief on this arc)

- **PROBE DOMAIN:** the live repository — `app/**` and `components/**` as walked by `scanInteractiveElements`, plus `app/globals.css` runtime tokens, `DESIGN.md`, `tests/styles/**`, `tests/mutation/source/registry.ts`, and `BACKLOG.md` (§6 requires a ledger change, so the ShareHub fence is only verifiable if the ledger is in domain). An admissible probe is drawn from that set or is one ordinary edit away from a file in it. A constructed fixture outside it files to §6, not to a finding.
- **THREAT FENCE:** the pin defends against ONE thing — this arc's 37 swaps and the prior arc's 21 being reverted or **half**-reverted on one render path. It does NOT defend against a contributor adding a NEW control at `border-border`; `BL-CONTROL-OUTLINE-FORWARD-GUARD` owns that and §6 records why. Adversarial obfuscation of a className — computed strings, dynamic token construction — is OUT of scope and files to documented limits; `scanInteractiveElements` already reports `unresolved` for what it could not statically read, which is the surfaced-signal half of the bound.
- **CONSEQUENCE BOUND:** every element in the **57**-row census carries `border-text-faint`, carries `border-border` on no render path, no swapped control's outline falls below the 3:1 floor in any ENABLED state (the `disabled:opacity-60` composite is measured and recorded in §6, and WCAG exempts inactive controls), no control whose hover cue IS its outline has that outline weaken on hover (§3.6), the seven fill-cue sites whose ratio dips within the recorded band are named in §9, and every sub-3:1 boundary surviving this arc is recorded in §6 with its measured ratio — correct or signaled, never silently wrong. This is a claim about this arc's change, not about the population.
- **CONVERGENCE CRITERION:** the mutation score on `tests/styles/controlOutlineScan.ts` plus an empty unaccepted-survivor set (§5.5). A "the guard does not pin what it claims" finding is admissible only with the surviving mutant that demonstrates it — an operator and a site, both from the declared set.

---

## 8. Dimensional Invariants

**None, and that is a measured claim rather than an omission.** The complete diff substitutes one colour custom property for another inside the SAME Tailwind `border` utility at every site.

| Relationship | Before | After | What guarantees it |
| --- | --- | --- | --- |
| Control border-width | `1px` (bare `border` utility) | `1px` (same utility) | The utility is untouched at every site; only the colour class beside it changes |
| Control box size (`getBoundingClientRect`) | unchanged | unchanged | Border-width, padding and font utilities untouched; a colour class contributes nothing to layout |
| Parent → child height/width in any card, row, modal or popover containing a swapped control | unchanged | unchanged | No swapped control is a fixed-dimension parent, and none gains or loses a box-model property |
| The five dividers' rule position and thickness | unchanged | unchanged | Class C is excluded from the swap entirely (§3.3) |
| Switch-track geometry | unchanged | unchanged | All five exempt; `components/admin/telemetry/AutoRefreshControl.tsx:106` is a different element from the `components/admin/telemetry/AutoRefreshControl.tsx:119` this arc edits (§3.2) |

Because no dimension relationship changes, the plan does **not** owe the real-browser `getBoundingClientRect` task the writing-plans rule mandates for fixed-dimension parents with flex/grid children — there is no such new relationship in the diff. The exemption is claimed explicitly so the plan's omission is a decision on the record. The Tailwind v4 "`.flex` does not default to `align-items: stretch`" trap is not reachable from a colour-token change.

---

## 9. Transition Inventory

The draft of this section asserted that every swapped site carries `transition-colors duration-fast` and that no state pair changes. **Spec review round 1 refuted both claims by probe, and the refutation surfaced a real defect (§3.6).** The measured picture:

| Utility | Sites (of 37) |
| --- | --- |
| `transition-colors` AND `duration-fast` | 23 |
| `transition-colors` without `duration-fast` | 3 — `app/me/meShowSections.tsx:174`, `app/me/meShowSections.tsx:213`, `app/me/meShowSections.tsx:258` |
| NEITHER — the outline change is INSTANT | 11 — `components/admin/NeedsAttentionInbox.tsx:101`/`components/admin/NeedsAttentionInbox.tsx:130`/`components/admin/NeedsAttentionInbox.tsx:198`/`components/admin/NeedsAttentionInbox.tsx:224`, `components/admin/dev/MaterializeCard.tsx:73`, `components/admin/dev/SwitcherControls.tsx:83`/`components/admin/dev/SwitcherControls.tsx:92`/`components/admin/dev/SwitcherControls.tsx:142`, `components/admin/telemetry/AutoRefreshControl.tsx:119`, `components/agenda/AgendaEmbed.tsx:83`, `components/agenda/AgendaPdfViewer.tsx:198` |

An instant outline change is correct and needs no repair — there is no state pair whose animation is missing, only sites that were always instant and stay instant. It is recorded because the draft claimed otherwise.

| State pair | Animation | Changed by this arc? |
| --- | --- | --- |
| rest → hover | `transition-colors` where present (26 of 37); instant at the other 11 | **YES at 21 sites — see §3.6.** The resting endpoint moves to 3.35:1 while the hover endpoint stays at 1.59:1, inverting the pair. §3.6 is the repair. |
| rest → focus-visible | instant ring, by design | No `focus-visible:` utility is edited. **8 sites have none at all** — `app/me/meShowSections.tsx:174`/`app/me/meShowSections.tsx:213`/`app/me/meShowSections.tsx:258`, `components/admin/review/ShowReviewSurface.tsx:814`/`components/admin/review/ShowReviewSurface.tsx:993`, `components/admin/telemetry/AutoRefreshControl.tsx:119`, `components/crew/primitives/PersonRow.tsx:196`/`components/crew/primitives/PersonRow.tsx:213`. Pre-existing, unchanged by this arc, and recorded in §6 rather than repaired. |
| rest → disabled | `disabled:opacity-60` where present | No. **29 of 37 do not carry it**, so §6's opacity caveat reaches only the other 8. |
| rest → active/open | existing per-site treatment | Token unchanged EXCEPT at `components/admin/dev/SwitcherControls.tsx:145`, whose `aria-expanded:border-accent` is retargeted with its `hover:` twin (§3.6c). **The outline's GROUND moves at 23 of 37 sites** — see the note below. The FIVE branch-conditional elements keep every branch; only the branch carrying `border-border` moves. |
| idle → armed (destructive confirm morph) | existing; the Cancel mounts already-armed | No. The morph is a mount, not a transition of the Cancel's own outline. |
| no-hover sites | N/A | 3 sites have no hover state at all — `components/admin/dev/MaterializeCard.tsx:73`, `components/admin/review/ShowReviewSurface.tsx:814`, `components/admin/review/ShowReviewSurface.tsx:993`. |

**The ground-shift class, bounded rather than enumerated** (spec review R2 F2). 23 of the 37 carry a state utility that swaps the control's OWN FILL — `hover:bg-surface-sunken`, `hover:bg-surface-raised`, `active:bg-surface-sunken`, `aria-expanded:bg-surface-sunken`. That moves the ground the outline is measured against, so the ratio changes in those states even though the token does not. R2 raised the sharpest instance: at `components/admin/dev/SwitcherControls.tsx:83`, `components/admin/dev/SwitcherControls.tsx:92` and `components/admin/dev/SwitcherControls.tsx:142` the hovered-plus-active and `aria-expanded` states put the outline on `surface-sunken`.

**The bound, stated correctly this time.** An earlier draft claimed no ground shift can produce an inversion. **Spec review R3 F1 falsified that**, and the falsification is carried here because the corrected claim is the one that is actually closable.

What is TRUE and pinned: **no ENABLED state puts a swapped control's outline below the 3:1 floor.** (`disabled:` is the one state that does, by an exemption WCAG grants explicitly; §6 carries its measured composite.) Every token this arc uses as an outline clears 3:1 on all four neutral ground tokens in both themes — `border-text-faint` 3.02-4.11, `border-text-subtle` 5.97-6.94, `border-accent-on-bg` 5.02-9.65 — which is what §1.2's four rows assert and what §3.6 requires of the two repurposed tokens. A shift among those four grounds moves the ratio inside a bounded band and never through the floor.

What is FALSE, and is recorded rather than claimed away: **at seven sites the hover ratio is slightly LOWER than the rest ratio**, because after §3.6(a) deletes the border override the only hover effect is a fill change onto a different ground. `surface` → `surface-sunken` at `components/admin/UnarchiveShowButton.tsx:67`, `components/crew/SectionChipLink.tsx:48`, `components/crew/primitives/PersonRow.tsx:196`, `components/crew/primitives/PersonRow.tsx:213`, `components/shared/ReportButton.tsx:142` — **3.35 → 3.02 light**. `surface` → `surface-raised` at `components/admin/nav/UserMenu.tsx:51`, `components/layout/ThemeToggle.tsx:91` — **3.76 → 3.53 dark**.

**This is not a defect this arc introduces, and the probe is decisive.** Of the 21 controls the 2026-08-16 arc already swapped to `border-text-faint`, **twenty** carry exactly this shape — a hover that changes fill, with no border override — so the 3.35 / 3.02 band is the shipped, ratified behaviour of the predecessor's population, reached by this arc's 37 only because they now wear the same token. Repairing it here would mean retuning a ratified treatment at 27 sites under a ruling that did not ask for it.

**And the outline is not the hover cue at these seven.** The cue is the fill change, a full surface-tone step perceptible independently of the outline; the outline's ratio moves as a side effect of standing on a different ground. That is the distinction AC-11 now draws: **where a `hover:border-*` override exists, the outline IS the cue and must not weaken — those are the 21 sites §3.6 repairs. Where the fill is the cue, the outline's ratio moves within the recorded band and never through the floor.**

**Compound case:** `components/layout/ThemeToggle.tsx:91` changes outline colour while the theme itself changes, so the control's resting outline and its ground both move in the same frame. Both endpoints are pinned by §1.2's four ground rows in both themes, and the interpolation is the existing `transition-colors`.

**Correction to §3.1's Shape column:** FIVE elements carry `border-border` on a CONDITIONAL branch, not four — `app/admin/show/[slug]/ResetPickerEpochButton.tsx:178`, `components/admin/review/ShowReviewSurface.tsx:814`, `components/admin/review/ShowReviewSurface.tsx:993`, `components/admin/showpage/PublishedReviewModal.tsx:964`, `components/shared/ReportButton.tsx:142`. `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:240` was mislabelled: its `border-border` sits in the BASE string and only its FILL is branch-conditional.

---

## 10. Acceptance criteria

- **AC-1** — All 37 swap-set elements carry `border-text-faint`, and `border-border` on no render path. **36 of them are census ADDITIONS**; the 37th, `app/admin/show/[slug]/ResetPickerEpochButton.tsx:178`, is already a census row and is covered by AC-2.
- **AC-2** — No row of the original 21 carries `border-border` on any render path. `app/admin/show/[slug]/ResetPickerEpochButton.tsx:178`'s non-compact branch has moved; `components/admin/Mi11GateActions.tsx:69` still passes, its outline-free accent branch untouched (§5.2).
- **AC-3** — The five class C dividers still carry `border-border` and are pinned as non-members of the census.
- **AC-4** — `tests/styles/_metaControlOutlineFill.test.ts:156-164` is unchanged and passes; ShareHub is unswapped and filed.
- **AC-5** — The five switch-track paths, including `components/admin/telemetry/AutoRefreshControl.tsx:106`, are unchanged.
- **AC-6** — `DESIGN.md` §1.2a's `border-border` paragraph is replaced per §4.1; §1.2 carries the new `--color-border` outline row; `tests/styles/secondary-action-contrast.test.ts` asserts it.
- **AC-7** — `components/layout/ThemeToggle.tsx:41`'s comment no longer names a token the control does not wear.
- **AC-8** — `pnpm mutation:guards` reports a score at or above the registry floor with an empty unaccepted-survivor set, run before the round-1 diff dispatch.
- **AC-11** — The 12 sites of §3.6(a) no longer carry `hover:border-border-strong`; the 6 of §3.6(b) carry `hover:border-text-subtle`; the 3 of §3.6(c) carry `hover:border-accent-on-bg` on BOTH their `hover:` and `aria-expanded:` occurrences. Classification is PER RENDER PATH, not over the union of an element's strings. **The claim is bounded and carries no "no exceptions" clause:** where a `hover:border-*` override exists the hover outline is not quieter than rest, and in every ENABLED state of every swapped control the outline stays above the 3:1 floor. The seven fill-cue sites whose ratio dips within the recorded 3.35 / 3.02 band (§9) are not exceptions to that claim — they are a different claim, stated separately. **No swapped control's outline falls below 3:1 in any ENABLED state, and no control whose hover cue IS its outline weakens on hover.** The disabled composite is measured in §6 and is exempt under WCAG rather than compliant. The seven fill-cue sites of §9 dip within the recorded band; they are not exceptions to that claim but a separate, separately-stated one.
- **AC-9** — Impeccable critique and audit both pass on the diff; findings and dispositions recorded in the plan's closeout.
- **AC-10** — The ledger row is archived; the ShareHub row is filed with `Facing:`, an incident or exception per the mint bar, and exception (b) named.
