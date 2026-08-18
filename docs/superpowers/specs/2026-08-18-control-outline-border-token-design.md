# Control outlines at `border-border` on a neutral or absent fill — the text-ramp sweep

**Branch:** `fix/control-outline-border-token` · **Ledger row:** `BL-CONTROL-OUTLINE-BORDER-TOKEN-ON-NEUTRAL-FILL` · **Ruled:** 2026-08-18

Sibling of `docs/superpowers/specs/2026-08-16-control-outline-surface-fills-design.md`, which moved the `border-border-strong` half of the same predicate. This spec moves the `border-border` half. Its structure deliberately mirrors that spec's, because a reviewer of one is a reviewer of the other.

**Measurement record:** `docs/superpowers/specs/probes/2026-08-18-border-border-neutral-fill-census.md`. Every count, ratio, class decomposition and per-site class string in this spec is read from that record, which was produced from the live tree on 2026-08-18. Figures are not restated here except where a sentence would be unreadable without one — a summary that drifts from the record it summarises is worse than a pointer.

---

## 1. Resolved scope — do not relitigate

- **The design question is RULED (§2).** It was put to the user on 2026-08-18 with a rendered mockup showing three candidate weights on the confirm-row Cancel, on the split button of §3.4, and on the crew surfaces — show tiles, section chips, `PersonRow` call/text buttons — in both themes. The user chose the text ramp. Neither the ruling nor the crew surfaces are open.
- **The change is one colour token per site.** `border-border` → `border-text-faint`. No new component, no new prop, no new state, no new element, no new token, no geometry change.
- **THE SWEPT SET IS 37, AND THE USER WAS SHOWN 30.** The delta is +8 unfilled controls (§3.2, a derivation from `DESIGN.md`'s ratified "or left unfilled" clause) −1 divider (§3.3), and it moves the crew-facing count from thirteen to fourteen. Stated at the top because a reader who takes 30 as the scope will mis-review everything below it. If the widening is narrowed on review, §3.2 is the only section that changes.
- **Three families are OUT by decision, each with its own evidence** (§3.3, §3.5, §6). Dividers, `hover:`-only occurrences, and ShareHub's ratified mobile skin.
- **The 2026-08-16 arc's rulings are untouched.** The five switch tracks stay exempt; the accent-filled primary action stays exempt; the 21 swapped elements keep `border-text-faint`; §1.2a's scope paragraph on non-interactive chrome is unchanged, and `BL-CONTROL-OUTLINE-PAIRED-CHROME-WEIGHT` still owns that question.

### 1.1 Self-review sections that are N/A here, and why

Stated rather than omitted, so absence is not read as oversight.

| Section | Why N/A |
| --- | --- |
| DB completeness matrix, CHECK/enum migration matrix | No DDL, no RPC, no migration. The diff is `.tsx` class strings, `DESIGN.md`, one test file, one ledger file. |
| Advisory-lock topology (invariant 2) | No code path mutates `shows`, `crew_members`, `crew_member_auth`, `pending_syncs` or `pending_ingestions`. |
| §12.4 catalog lockstep | No error code is added, edited or removed, so `pnpm gen:spec-codes` and `lib/messages/catalog.ts` are untouched. |
| Supabase call-boundary discipline (invariant 9) | No Supabase client call is added or moved. |
| Mutation-surface observability (invariant 10) | No route handler and no `"use server"` action is added or modified. |
| Flag lifecycle table | No boolean config field or toggle is introduced. |
| Guard conditions per prop | No component signature changes. Every edited string is a static class literal or a branch of an existing ternary whose condition is untouched. |
| Transition Inventory | §8. |
| Dimensional Invariants | §7. |

---

## 2. The decision (user-owned) — RULED

**Ruling: the text ramp.** A control whose resting outline is `border-border`, and whose fill is one of the four neutral ground tokens *or absent*, takes `border-text-faint` — the same weight the 2026-08-16 arc moved 21 controls to.

The mockup the ruling was taken against rendered, at all three candidate weights and in both themes: the `ArchiveShowButton` confirm row; the split `ResetPickerEpochButton`; and the crew half — `/me` show tiles, `SectionChipLink` chips, and `PersonRow`'s call and text buttons. The user was shown the option of leaving them (a ratified quiet tier) and the option of splitting buttons from tile edges, and chose neither.

### 2.1 Rejected branches — do not relitigate in either direction

- **"Leave them; document that quiet is deliberate."** Offered, rendered, declined. `border-border` is NOT a ratified third weight for quiet controls, and §1.2a gains no sentence saying so.
- **"Split: buttons move, tile edges stay."** Offered, rendered, declined. The five tile- and card-shaped links (`app/me/meShowSections.tsx:174`, `:213`, `:258`; `components/admin/NeedsAttentionSummaryCard.tsx:36`; `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:240`) MOVE. They reach the census through `scanInteractiveElements`, so they are controls; the user saw the show tiles rendered at the firm weight and ruled anyway. A reviewer arguing any of them is a card edge rather than a control outline is relitigating a rendered ruling — unless the argument is that the element is not interactive at all, which is §3.3's treatment and requires a per-site probe.
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

- **Row 8 is crew-reachable.** `components/shared/ReportModal.tsx` is imported by `components/layout/Footer.tsx` and by `components/crew/primitives/CardHeaderActions.tsx`, and by `components/shared/ReportButton.tsx` — which is itself class A row 30, crew-reachable through the same Footer. It is the only crew surface class B adds, taking the swap set's crew-facing count from thirteen to **fourteen**.
- **Rows 1-7 are admin-only by chain.** `HoverHelp` and `NeedsAttentionInbox` are imported only under `app/admin/**` and `components/admin/**`; `MaterializeCard` only by `app/admin/dev/page.tsx`; `AutoRefreshControl` only by `app/admin/dev/telemetry/page.tsx` and `app/admin/dev/telemetry-dim/page.tsx`.

Two structural notes:

- `components/admin/telemetry/AutoRefreshControl.tsx:119` — the SAME FILE contains `:106`, one of the five switch-track render paths §1.2a rules OUT. They are different elements and must not be conflated. `:106` is untouched by this arc; a reviewer checking the switch-track exemption should confirm the diff does not reach that line.
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

`components/admin/showpage/ShareHub.tsx:781` and `:817` carry `max-sm:border-border`, which the cover's whole-token regex does not match. A `max-sm:` prefix is a **resting** outline below 640px — unlike `hover:`, which is a state cue (`components/layout/ThemeToggle.tsx:125` rests at `border-border` and takes `border-border-strong` only on hover; correctly outside every cover, recorded at the 2026-08-16 spec §3.2). So the ruling's words reach ShareHub, and `:781` is the sharpest instance in the repository: both ternary arms **already carry `border-text-faint`** from the 2026-08-16 swap while `max-sm:border-border` wins the cascade, so one button paints 3.35:1 on a desktop viewport and **1.27:1 on a phone**.

**It is filed rather than repaired, and the reason is not "same defect, different file".** Two independent ratifications fence it:

1. **A design ratification.** The in-file comment at `components/admin/showpage/ShareHub.tsx:798-801` cites `spec 2026-07-24-strip-mobile-stacked-band §3 R3` — "border color drops to `border-border` below sm (the §3 R3 skin; width stays 1px)."
2. **An executable ratification, which is the load-bearing one.** `tests/styles/_metaControlOutlineFill.test.ts:156-164` is a shipped pin titled *"keeps `max-sm:border-border` on BOTH ShareHub ternary arms"*, whose docstring records that plan review R3 probed corrupting both tokens and found the rest of the suite stays green while the responsive treatment is silently gone.

Swapping ShareHub here means editing that pin to assert the opposite of what it was written to assert — the shape where a guard is rewritten to match the change it exists to catch. **Class-sweep exception (b) applies: a ratified scope decision already fences it.** The filing is §6's ledger row; its first scheduled step is the design question this arc cannot settle — whether §1.2a's control-outline rule supersedes the §3 R3 mobile skin — and the answer is one edit plus one pin update once ruled.

`tests/styles/_metaControlOutlineFill.test.ts:156-164` is therefore **untouched by this arc**, and that is an acceptance criterion (§5.4), not an omission.

---

## 4. Design

### 4.1 `DESIGN.md` §1.2a — the paragraph this arc rewrites

`DESIGN.md:227-233` currently reads:

> Separately: a control with a neutral fill but a `border-border` outline — the confirm-row Cancels at `components/admin/ArchiveShowButton.tsx:344` and `app/admin/show/[slug]/ResetPickerEpochButton.tsx:266`, both **1.27:1** — falls inside this predicate's words and outside the 2026-08-16 swap, which moved only `border-border-strong`. Widening to `border-border` is a separate design decision this ruling did not make, filed as `BL-CONTROL-OUTLINE-BORDER-TOKEN-ON-NEUTRAL-FILL`.

It is replaced by a paragraph that (a) records the 2026-08-18 ruling and that it was taken against a rendered mockup including the crew surfaces; (b) states that `border-border` on a control's resting outline is now the text ramp too, so the predicate is satisfied by the token as well as by the fill; (c) states the divider carve-out in both directions, since §1.2a already preserves the border tokens for dividers and this arc makes that preservation load-bearing; (d) points at the ShareHub filing rather than restating its numbers.

The line numbers `:344` and `:266` in the current text are `className=` anchors and are stale against the scanner's element anchors (probe record §1). The replacement paragraph cites no line numbers for the swept population — the census is the contract (§4.3), and a prose line number is exactly what drifted.

### 4.2 `DESIGN.md` §1.2 — contrast rows

§1.2 already carries all four `--color-text-faint` OUTLINE rows (`DESIGN.md:141`, `:142`, `:143`, `:145`) with the figures this arc's controls land on, pinned by `tests/styles/secondary-action-contrast.test.ts`. **No new or repurposed colour token is introduced**, so the "pin the ratio for any NEW token" rule is satisfied by rows that already exist and already assert.

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

`tests/styles/controlOutlineScan.ts`'s `CENSUS` grows from 21 rows to 58 (21 + 37), and `tests/styles/_metaControlOutlineFill.test.ts` gains one assertion per row: **`carries(element, "border-border") === false`** — no render path carries the old token. `carries` reads `allStrings`, which spans every render alternative, so the existential-negation IS the universal claim. It is the exact mirror of the assertion already there for `border-border-strong` (`:121-123`), so no new predicate and no new helper is written.

**`everyPathCarries` is deliberately NOT used for this, and the reason is a probe.** An earlier draft of this spec proposed moving the per-row `carries(element, "border-text-faint")` to `everyPathCarries`. Probed against the live census, that formulation fails **two** of the original 21, and only one of them is a defect:

| Row | `everyPathCarries` | Why |
| --- | --- | --- |
| `app/admin/show/[slug]/ResetPickerEpochButton.tsx:178` | false | the real defect of §3.4 — its non-compact branch is `border-border` |
| `components/admin/Mi11GateActions.tsx:69` | false | **correct and must stay passing** — its `isApprove` branch is `bg-accent … text-accent-text` with **no border at all**, the accent-filled primary action that §1.2a rules OUT by name |

A universal "every path carries the outline token" is therefore wrong for this population: a control may legitimately have a render path with no outline, and `Mi11GateActions.tsx:69` is that case shipped and ratified. The negation form has neither problem — it catches `:178` (whose second branch carries `border-border`) and passes `Mi11GateActions` (whose second branch carries no border token at all).

- **Both directions per row:** `carries(element, "border-text-faint")` is true, and `carries(element, "border-border")` is false. The second is not redundant — it is the whole strengthening, and it is what makes §3.4's finding a repair rather than a note. `ResetPickerEpochButton.tsx:178` is green today and must go red until its non-compact branch moves.
- **Applied to the ORIGINAL 21 as well as the new 37.** Probed: exactly one of the 21 fails it today (`:178`), and that failure is the intended repair. No other row regresses.
- **A negative control.** A constructed temp-dir fixture carrying `border border-border bg-surface` is found by the scan and FAILS the new assertion. A second fixture carries `border-text-faint` in one ternary arm and `border-border` in the other — it PASSES the pre-existing `carries(…, "border-text-faint")` check and FAILS the new one, which is the executable proof that the strengthening is not cosmetic and is precisely the `:178` shape. A third fixture carries `border-text-faint` in one arm and NO border utility in the other — it must PASS, pinning that a legitimately outline-free branch (the `Mi11GateActions` shape) is not collateral. Each fixture case carries its own `premise(...)` — a fixture that fails to parse returns `[]` and makes the case vacuously true.
- **`everyPathCarries` stays in the file, unused by the census loop and still used at `:163`** for the ShareHub adjacent-token pin, which is untouched (§3.5, §5.4).
- **The divider exclusion is asserted, not merely documented.** The five class C elements are pinned as NOT members of the census, so a later arc cannot quietly add one.

### 5.3 What the suite must prove about itself

- `premise("scanner reaches the component tree", UNIVERSE.length, 200)` — the existing guard at `tests/styles/_metaControlOutlineFill.test.ts:41` stays; a scan returning `[]` makes every "carries" assertion vacuous.
- Census length is 58 and every identity (`file` + `line`) is distinct — `file` alone is not unique in **twelve** of them (five in the original 21: `RoleMappingRow`, `BellPanel`, `StagedReviewCard`, `Step3ReviewModal`, `step3ReviewSections`; seven in the new 37: `ResetPickerEpochButton` ×2, `meShowSections` ×3, `_SignInOrSkipGate` ×2, `SwitcherControls` ×3, `ShowReviewSurface` ×2, `PersonRow` ×2, `NeedsAttentionInbox` ×4).
- Every census row RESOLVES to a live element. A row that resolves to `null` is a stale line number, not a pass.
- The unresolved-element count is pinned, so the pool of elements the scanner cannot statically read cannot grow silently.

### 5.4 Untouched surfaces, asserted

- **The five switch-track paths** keep their recipe, including `components/admin/telemetry/AutoRefreshControl.tsx:106` — whose file this arc DOES edit at `:119` (§3.2).
- **`tests/styles/_metaControlOutlineFill.test.ts:156-164`**, the ShareHub `max-sm:border-border` pin, is unchanged and still passes (§3.5).

### 5.5 Enrolment precedes review (AGENTS.md convergence rule 4)

`tests/styles/controlOutlineScan.ts` is enrolled in `tests/mutation/source/registry.ts:1909-1924` at `scoreFloor: 1` with `accepted: []` (probe record §7). This arc edits it, so **`pnpm mutation:guards` runs BEFORE the round-1 diff dispatch**, and the round-1 brief states the mutation score plus an empty unaccepted-survivor set. A census growing from 21 to 58 rows adds 37 integer-literal mutation sites; if any survives, the survivor is the finding and the registry row's `control` may need revisiting. `pnpm mutation:guards` is a heavy phase and runs under `pnpm heavy`.

### 5.6 Invariant 8

Every swapped file under `app/` (excluding `app/api/**`) or `components/` is a UI surface, and `DESIGN.md` changes too. The impeccable v3 dual gate (`/impeccable critique` AND `/impeccable audit`) runs on the diff before adversarial review and before closeout, with findings and dispositions in the plan's closeout. The plan carries the machine-checkable marker.

---

## 6. Documented limits

Each is a stated position with its number recorded, not an open gap.

- **The five dividers stay at `border-border`** — 1.15-1.38:1 against their neighbouring fills (§3.3). Under the 3:1 non-text floor and there by decision: none is a control boundary, and §1.2a preserves the border tokens for dividers by name. Not filed as a ledger row, because a divider at border-grade contrast is the token doing its documented job.
- **ShareHub's mobile skin: 1.27:1 below 640px, on a control that measures 3.35:1 above it** (§3.5). Filed as a ledger row under class-sweep exception (b), because two ratifications fence it and one of them is an executable pin. This is the one place this arc knowingly leaves a control the ruling's words reach.
- **`disabled:opacity-60` drops any outline back under 3:1** — pre-existing, already recorded in `DESIGN.md` §1.2a; WCAG exempts inactive controls.
- **Tinted-plate outer edges** — `BL-CONTROL-OUTLINE-ON-TINTED-PLATES` owns this class. `components/admin/showpage/PublishedReviewModal.tsx:964` carries `bg-warning-bg` on its OTHER branch, so swapping its `border-border` branch puts one more element on that entry's surface; the entry is updated with the site and the measured figure, and no new row is opened.
- **`bg-transparent` controls take whatever ground they are rendered on**, which no static measurement supplies. Class B contains one (`components/admin/HoverHelp.tsx:562`) and class A's `_PickerInterstitial` branch fills vary. The census and its pin cover the enumerated set; a transparent control moved onto an unmeasured ground is outside what the suite can see.
- **No forward guard.** This arc pins that its own 37 swaps stay swapped and that the original 21 stay swapped on every path. It does NOT pin that a future control cannot be added at `border-border`. `BL-CONTROL-OUTLINE-FORWARD-GUARD` owns that, with five closed escapes as its evidence, and nothing here reopens it — in particular, §5.2's divider non-membership assertion is a fixed five-row exclusion, not a classifier, and must not grow into one.
- **The scanner's element vocabulary is unchanged.** Text-entry fields remain invisible to it (`BL-CONTROL-OUTLINE-BEYOND-ELEMENT-COVER` family A), as do outlines painted on a nested child (family B). This arc widens the TOKEN and FILL halves of the predicate; it does not touch what `scanInteractiveElements` admits.

---

## 7. Threat fence and probe domain (for every review brief on this arc)

- **PROBE DOMAIN:** the live repository — `app/**` and `components/**` as walked by `scanInteractiveElements`, plus `app/globals.css` runtime tokens, `DESIGN.md`, `tests/styles/**`, `tests/mutation/source/registry.ts`, and `BACKLOG.md` (§6 requires a ledger change, so the ShareHub fence is only verifiable if the ledger is in domain). An admissible probe is drawn from that set or is one ordinary edit away from a file in it. A constructed fixture outside it files to §6, not to a finding.
- **THREAT FENCE:** the pin defends against ONE thing — this arc's 37 swaps and the prior arc's 21 being reverted or **half**-reverted on one render path. It does NOT defend against a contributor adding a NEW control at `border-border`; `BL-CONTROL-OUTLINE-FORWARD-GUARD` owns that and §6 records why. Adversarial obfuscation of a className — computed strings, dynamic token construction — is OUT of scope and files to documented limits; `scanInteractiveElements` already reports `unresolved` for what it could not statically read, which is the surfaced-signal half of the bound.
- **CONSEQUENCE BOUND:** every element in the 58-row census carries `border-text-faint`, carries `border-border` on no render path, and every sub-3:1 boundary surviving this arc is recorded in §6 with its measured ratio — correct or signaled, never silently wrong. This is a claim about this arc's change, not about the population.
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
| Switch-track geometry | unchanged | unchanged | All five exempt; `AutoRefreshControl.tsx:106` is a different element from the `:119` this arc edits (§3.2) |

Because no dimension relationship changes, the plan does **not** owe the real-browser `getBoundingClientRect` task the writing-plans rule mandates for fixed-dimension parents with flex/grid children — there is no such new relationship in the diff. The exemption is claimed explicitly so the plan's omission is a decision on the record. The Tailwind v4 "`.flex` does not default to `align-items: stretch`" trap is not reachable from a colour-token change.

---

## 9. Transition Inventory

**No state pair changes, and the enumeration is the evidence.** Every swapped site's transition is governed by a `transition-colors duration-fast` utility that is present before and after and is not edited. The swap changes the resting colour that transition interpolates TO, not whether or how it interpolates.

| State pair | Animation | Changed by this arc? |
| --- | --- | --- |
| rest → hover | existing `transition-colors duration-fast` | No. Hover targets (`hover:bg-surface-sunken`, `hover:border-border-strong`) are untouched. |
| rest → focus-visible | instant ring, by design | No. No `focus-visible:` utility is edited. |
| rest → disabled | existing `disabled:opacity-60` | No. §6 records that opacity drops the outline back under the floor. |
| rest → active/open | existing per-site treatment | No. The four branch-conditional elements (§3.1) keep both branches; only the branch carrying `border-border` moves. |
| idle → armed (destructive confirm morph) | existing; the Cancel mounts already-armed | No. The morph is a mount, not a transition of the Cancel's own outline. |

**One compound case, named because it is the only one:** `components/layout/ThemeToggle.tsx:91` changes outline colour while the theme itself changes, so the control's resting outline and its ground both move in the same frame. Both endpoints are pinned by §1.2's four ground rows in both themes, and the interpolation is the existing `transition-colors`; nothing new is introduced.

---

## 10. Acceptance criteria

- **AC-1** — All 37 census additions carry `border-text-faint`, and `border-border` on no render path.
- **AC-2** — No row of the original 21 carries `border-border` on any render path. `ResetPickerEpochButton.tsx:178`'s non-compact branch has moved; `Mi11GateActions.tsx:69` still passes, its outline-free accent branch untouched (§5.2).
- **AC-3** — The five class C dividers still carry `border-border` and are pinned as non-members of the census.
- **AC-4** — `tests/styles/_metaControlOutlineFill.test.ts:156-164` is unchanged and passes; ShareHub is unswapped and filed.
- **AC-5** — The five switch-track paths, including `AutoRefreshControl.tsx:106`, are unchanged.
- **AC-6** — `DESIGN.md` §1.2a's `border-border` paragraph is replaced per §4.1; §1.2 carries the new `--color-border` outline row; `tests/styles/secondary-action-contrast.test.ts` asserts it.
- **AC-7** — `components/layout/ThemeToggle.tsx:41`'s comment no longer names a token the control does not wear.
- **AC-8** — `pnpm mutation:guards` reports a score at or above the registry floor with an empty unaccepted-survivor set, run before the round-1 diff dispatch.
- **AC-9** — Impeccable critique and audit both pass on the diff; findings and dispositions recorded in the plan's closeout.
- **AC-10** — The ledger row is archived; the ShareHub row is filed with `Facing:`, an incident or exception per the mint bar, and exception (b) named.
