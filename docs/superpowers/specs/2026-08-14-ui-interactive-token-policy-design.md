# UI interactive token policy — secondary-button boundary, subtle-on-interactive carve-outs, tap-target className resolution

**Date:** 2026-08-14 · **Branch:** `fix/ui-interactive-token-policy` · **Status:** APPROVED (codex adversarial review R5, 2026-08-14; rounds 1-4 BLOCKING repaired, corpus at docs/review-rounds/fix/ui-interactive-token-policy/)
**Ledger entries:** `BL-SECONDARY-BUTTON-BOUNDARY-INVISIBLE`, `BL-SUBTLE-ON-INTERACTIVE-CLASS`,
`BL-TAP-TARGET-STRUCTURAL-GUARD` (all marked IN PROGRESS on this branch).
**Implementation routing:** every product-code surface here is UI (AGENTS.md hard rule) — the
implementing session is **Opus + impeccable v3 dual-gate (invariant 8)**. This spec/plan arc does
not implement.

## 0. Summary

Three user-ratified decisions (2026-08-14, decision mockup artifact + batched ask), one PR:

1. **D1 — secondary button boundary.** `SECONDARY_ACTION_CLASS` swaps `border-border-strong` →
   `border-text-faint`. The outline steps from ~1.6:1 to ≥3:1 on every ground it sits on, in both
   themes, with **zero new tokens** — DESIGN.md §1.2a already sanctions the text ramp for
   standalone strokes.
2. **D2 — subtle-on-interactive carve-out policy.** DESIGN.md §1.1's "never used for action
   targets" rule for `--color-text-subtle` gains three named carve-out families —
   `<summary>` disclosure headers, dismissable filter chips, and state-pair dim members — which
   stay subtle *by documented decision*.
   Every other interactive element currently resting on `text-text-subtle` steps up to
   `text-text`. A structural AST guard with a reasons-required registry enforces both halves,
   fail-by-default for new sites.
3. **D3 — tap-target guard unblocked by static resolution.** The repo-wide 44px tap-target guard
   (filed by the 2026-08-07 step3-a11y-cluster spec §5, blocked on bucket (E)) ships with a
   recogniser that **statically resolves** named constants, ternary branches, template statics,
   and `cn()`/`clsx()`/`.join()` arguments, plus a registered floor-carrying-component set.
   Irreducible residue lands in a reasons-required UNCLASSIFIED census, fail-by-default.

## 1. Scope

In scope: `lib/ui/actionClass.ts`; the swap sites and carve-out sites in §4.3 (41/14 as
shipped, corrected from 40/15 on 2026-08-15 — see the tally note there); DESIGN.md
§1.1/§1.2/§1.2a amendments; one contrast meta-test; two structural guard surfaces (scan modules +
suites + registries) and their mutation-registry enrolment; screenshot-baseline regeneration for
affected committed baselines (§8).

Out of scope: §11.

## Amendments

> **AMENDMENT 1 (2026-08-15) — AC-6 and R9 say "both scan modules"; the harness can express
> only one of them, and refused the other by its own gate condition.**
>
> `tests/styles/subtleInteractiveScan.ts` was enrolled as the spec requires. The run generated
> **ZERO mutants**, which trips the harness's `no-mutants` condition
> (`tests/mutation/source/gate.ts`) — a surface that produces no mutant asserts nothing while
> occupying a registry row that reads as coverage. The cause is structural rather than an
> oversight: the module is a filter over `interactiveScanCore` plus two data declarations, and
> the declared operator set is control-flow shaped (no relational, equality or logical operator;
> no integer literal; no regex quantifier; no removable statement). Every decision it makes
> belongs to the core, which IS enrolled, and is scored through the very suite that decides this
> module's verdicts (`_metaSubtleOnInteractive` is one of the core's three `suitePaths`).
>
> The two ways to satisfy the text as written are both worse than the amendment. Restructuring
> the module to grow mutation sites is gaming the operator set, which `AGENTS.md`'s
> round-economy rule names explicitly. Keeping a zero-mutant row is a vacuous claim, which is the
> exact failure the `no-mutants` condition exists to surface.
>
> **What is amended:** AC-6 and R9 read "the scan modules the harness can express" rather than
> "both". What is NOT amended: the convergence criterion itself. `interactiveScanCore` and
> `tapTargetScan` are enrolled, and the guard review's round-1 brief stated their score and an
> empty unaccepted-survivor set, as R9 requires. The registry carries this reason at the row's
> former position so the absence is legible where a reader looks for it.
>
> Raised by the whole-diff review (product half, BLOCKING) on the ground that a technical
> rationale in a closeout is not a spec amendment. It was right: this is the amendment.

## 1.1 Resolved scope — do not relitigate

| # | Decision | Ratification |
|---|---|---|
| R1 | D1 = Option A (darker outline via existing `--color-text-faint`). Options B (tinted fill) and C (document label-as-affordance, no change) were rendered in the mockup and declined. | User ask, 2026-08-14, this arc's decision pause (mockup artifact `Buttons & Quiet Labels` + AskUserQuestion) |
| R2 | D2 = Option 2 (carve-outs). Strict-swap-all and freeze-census were declined. Carve-out families: `<summary>` disclosure headers, dismissable filter chips — extended 2026-08-14 (same day, follow-up ask after the round-1 census widening surfaced a shape the mockup had not shown) by a THIRD user-ratified family, the state-pair dim member (§4.1 Family D). | Both asks, 2026-08-14 |
| R3 | D3 = resolve-constants. Require-literals and accept-census were declined. | Same ask |
| R4 | The secondary treatment stays ONE shared constant; per-site divergence is the failure it exists to prevent. | `lib/ui/actionClass.ts` header comment; `tests/components/admin/wizard/step3JudgmentChrome.test.tsx` follow-the-code scan (search `SECONDARY_ACTION_CLASS`) |
| R5 | The current 1.6:1 boundary is NOT a WCAG failure and NOT a regression; D1 is a deliberate design upgrade, not a compliance repair. Do not re-frame as an AA fix. | `BACKLOG.md` § BL-SECONDARY-BUTTON-BOUNDARY-INVISIBLE ("This is NOT a strict AA failure") |
| R6 | Census counts in the ledger rows are historical: the entry recorded 32 sites / 19 files (2026-08-10, restricted tag set); this arc's round-0 probe with the same restricted scope found 34 / 29; the round-1-corrected v2 probe (widened to the D3 in-scope set + identifier resolution) reported 53 / 43; the round-3-corrected v3 probe (§2.3, adding same-file helper-function resolution and allowlist-component call sites) reports 55 / 44 and is the census this spec disposes. The scan is the authority — the entry says so itself ("the scan is the authority, not this excerpt", `BACKLOG.md` § BL-SUBTLE-ON-INTERACTIVE-CLASS probe block). No reconciliation round is owed on the historical numbers. | Entry text + §2.3 probe |
| R7 | The 2026-08-07 corpus baseline (340 in-scope / 139 uncleared / buckets A16 B5 C7 D4 E94 F13) is a dated record run at `origin/main` @ `61281c23e`. It is filing evidence, never re-corrected; the implementing branch re-derives current counts with the shipped scanner. | `docs/superpowers/specs/2026-08-07-step3-a11y-cluster.md` §2.6 |
| R8 | Bucket-A residue (8 inline text links/buttons) belongs to `BL-TAP-TARGET-INLINE-TEXT-CONTROLS`, not this arc: the guard records them as census rows referencing that entry; it does not repair them. | §2.6 disposition table (rows marked "Filed"); `BACKLOG-archive.md` graduation 2026-08-11 |
| R9 | *(amended 2026-08-15, AMENDMENT 1)* The new guard surfaces the harness can express are enrolled in the source-mutation registry (`tests/mutation/source/registry.ts`) BEFORE their first adversarial review round, authored as importable modules with referring suites from the start. Review convergence for the guards = mutation score + empty unaccepted-survivor set. | AGENTS.md "Convergence criterion" bullet 3 |
| R10 | Spec and plan user-review gates are waived; this arc runs hybrid-autonomous after the decision pause. | Arc brief (orchestrated batch), user authorization |
| R11 | Inline prose links keep their WCAG 2.5.5 exemption; hover-only-affordance concerns on contact cells stay with `BL-CONTACT-CELL-TAP-SPACING-AND-GROUPING`. | `PRODUCT.md:59`; `BACKLOG.md` § BL-CONTACT-CELL-TAP-SPACING-AND-GROUPING |

## 2. Probed current state

All values probed live on this branch (worktree @ `origin/main` = merge `04f601134`), 2026-08-14.
Contrast = WCAG relative luminance, same formula as `tests/styles/status-token-contrast.test.ts`
(`relLuminance`).

### 2.1 Tokens (from `app/globals.css`, light and dark blocks)

| Token | Light | Dark |
|---|---|---|
| `--color-bg-runtime` | `#fafaf9` | `#0f1014` |
| `--color-surface-runtime` | `#ffffff` | `#16171c` |
| `--color-surface-sunken-runtime` | `#f4f3f1` | `#0b0c10` |
| `--color-text-runtime` | `#1a1b1f` | `#e8e6e0` |
| `--color-text-subtle-runtime` | `#5a5b62` | `#9c9a93` |
| `--color-text-faint-runtime` | `#8b8c92` | `#74736d` |
| `--color-border-strong-runtime` | `#cfcdc7` | `#3a3b40` |

Theme mapping `--color-text-faint: var(--color-text-faint-runtime)` exists (`app/globals.css`,
`@theme` block), so the Tailwind class `border-text-faint` is already valid with no config change.

### 2.2 D1 contrast probe

`SECONDARY_ACTION_CLASS` (`lib/ui/actionClass.ts`, the exported constant) renders
`border border-border-strong bg-bg` on `bg-surface` cards. Call sites (8):
`components/admin/RescanSheetButton.tsx:204`; `components/admin/wizard/Step3Review.tsx:356`,
`Step3Review.tsx:365`, `Step3Review.tsx:374`, `Step3Review.tsx:405`, `Step3Review.tsx:470`;
`components/admin/wizard/Step3SheetCard.tsx:478`, `Step3SheetCard.tsx:594`.

| Pair | Light | Dark | 3:1 floor |
|---|---|---|---|
| `border-strong` vs `surface` (today's outline) | 1.59:1 | 1.60:1 | FAILS |
| `bg` fill vs `surface` (today's fill) | 1.04:1 | 1.06:1 | FAILS |
| **`text-faint` vs `surface` (proposed outline)** | **3.35:1** | **3.76:1** | clears |
| `text-faint` vs `surface-sunken` (attention plate ground) | 3.02:1 | 4.11:1 | clears |
| `text-faint` vs `bg` (hover fill is `surface-sunken`; `bg` listed for completeness) | 3.21:1 | 4.00:1 | clears |

Label (`text-text-strong` on `bg-bg`): 18.35:1 light / 17.15:1 dark — unaffected.

### 2.3 D2 census probe

Procedure (round-2 revision — round 1 correctly found the round-0 probe's scope narrower than
the policy's): TypeScript-compiler AST walk (`ts.createSourceFile`, `ScriptKind.TSX`) over every
`.tsx` under `app/**` + `components/**`; in-scope elements are **the same set D3 uses** (§2.4:
`button` / `a` / `Link` / `summary` / `input type="checkbox|radio"` / any tag with
`role="button"` or `onClick`, plus — round-3 F2 — any JSX element whose tag is in the rule-7
floor-component allowlist, so a registered component's call site is in scope even without
`onClick`) — one exported predicate shared by both scans so the two can never drift (§4.4),
deriving its component-tag arm from the rule-7 allowlist import. For each in-scope element, the
`className` attribute's statically reachable strings: string literal, template statics +
resolvable spans, both conditional branches, binary operands, call arguments
(`cn()`/`clsx()`/`.join()` included), **identifier resolution** — any `const` initializer in
the same file (any scope, innermost-wins on collision in the shipped scanner), plus one-hop
imported `const` initializers (`@/` and relative specifiers), recursion depth-capped — and,
round-3 F1, **same-file helper-function resolution**: a call to a same-file function
declaration or arrow/function-expression `const` resolves to the union of its `return`
expressions (or its expression body), each resolved by these same rules; a call to anything
else marks the element's className partially unresolved. Hit = bare token `text-text-subtle`
present in the resolved strings. Output 2026-08-14 (v3): **55 sites across 44 files**; 354
in-scope elements; 8 hit-site classNames
carry an additional part the resolver cannot read (marked `[partial]` — the hit itself is
proven; §10 records the non-provable direction). Full listing with dispositions in §4.3. (Probe
script: drafting-time scratch; the shipped guard's scan module in §4.4 is the durable form and
must reproduce this census on enrolment.)

### 2.4 D3 baseline

§2.6 of the step3-a11y-cluster spec (R7 above): in-scope = `<button>`, `<a>`, `<Link>`,
`<summary>`, `<input type="checkbox|radio">`, any tag with `role="button"` or `onClick`; floor
classes are enumerated there (`min-h-tap-min` / `size-tap-min` / `min-w-tap-min`, numeric
`h-`/`w-`/`min-*` ≥ 11 on the 4px scale, arbitrary ≥44px, negative-margin+padding recipe,
`before:absolute` inset, `sr-only` parent-label). Bucket (E) — 94 non-literal classNames — is
the sole blocker; buckets B/C/F are principled exemption families; bucket (D) is
padding-arithmetic; bucket (A) is dispositioned (§1.1 R8).

**Operative in-scope predicate (this spec's addition to the baseline):** the baseline set
above, PLUS any JSX element whose tag is in the rule-7 floor-component allowlist (round-3 F2) —
the predicate's component-tag arm derives from the allowlist import, so registering a component
in rule 7 puts its call sites in scope by construction. Every §2.4 reference elsewhere in this
spec means this operative predicate.

Named class-string constants confirmed live: `SECONDARY_ACTION_CLASS`
(`lib/ui/actionClass.ts`), `DISCARD_RESTING_CLASS` / `IGNORE_ARMED_CLASS`
(`components/admin/PendingPanelDiscardButtons.tsx:49` and line 52), AccentButton's `BASE_CLASS`
(`components/shared/AccentButton.tsx:105`, carries `min-h-tap-min`; 5 `<AccentButton` JSX
call sites at the round-3 anchored probe — the count is re-derived by the shipped scanner, not
pinned here).

## 3. D1 — secondary button boundary

### 3.1 The change

In `lib/ui/actionClass.ts`, `SECONDARY_ACTION_CLASS`: replace the class token
`border-border-strong` with `border-text-faint`. Nothing else in the constant moves: `border`
width, `bg-bg` fill, `text-text-strong` label, `hover:bg-surface-sunken`,
`disabled:opacity-60`, focus ring — all unchanged. All 8 call sites (§2.2) inherit with zero
call-site edits.

Rationale anchor: DESIGN.md §1.2a's rule — border tokens are tuned as tile edges beside a fill;
a stroke that must stand on its own uses the text ramp ("The `-faint`/`-subtle` text pair is the
sanctioned hairline ramp"). A button outline on a flat `bg-bg` fill is that case.

### 3.2 DESIGN.md amendments (same commit as the token swap)

1. §1.2a gains one sentence extending the rule from hairlines/dividers to **control outlines**:
   an outline over a near-ground fill is a standalone stroke; the secondary action button is the
   worked example, with the §2.2 ratios pinned in a table row.
2. The §1.2 contrast summary gains the `text-faint`-as-outline rows (light 3.35/3.02, dark
   3.76/4.11, vs `surface`/`surface-sunken`).
3. The prose records R5: this is a design upgrade; the prior 1.6:1 boundary was a legitimate
   1.4.11 posture that was never written down.

### 3.3 Contrast meta-test (ships in this arc, at spec's direction — before/with the swap)

New `tests/styles/secondary-action-contrast.test.ts (new)`, patterned on
`tests/styles/status-token-contrast.test.ts` (reads LIVE hex out of `app/globals.css`, computes
contrast, no snapshots):

- Asserts `--color-text-faint-runtime` ≥ 3:1 against `--color-surface-runtime`,
  `--color-surface-sunken-runtime`, and `--color-bg-runtime`, in BOTH light and dark blocks.
- **Premise pin** (a guard states its premise executably): asserts the source string
  `SECONDARY_ACTION_CLASS` in `lib/ui/actionClass.ts` contains `border-text-faint` and does NOT
  contain `border-border-strong` — otherwise the ratio assertions hold vacuously while the
  button renders another token.

### 3.4 Interactions checked

- `tests/components/admin/wizard/step3JudgmentChrome.test.tsx` transition-count pins scan
  `actionClass.ts` appended to consuming files: the swap adds/removes no `transition-*` token —
  counts unchanged.
- The one-treatment pin (R4) is satisfied: the constant remains the single treatment.
- Screenshot baselines that include secondary buttons WILL change bytes: §8.

## 4. D2 — subtle-on-interactive carve-out policy

### 4.1 Policy (DESIGN.md §1.1 amendment)

The `--color-text-subtle` row's usage note becomes: "Labels, captions, 'as of …' timestamps.
Never the resting color of an action target, **except the three carve-out families in §1.1a**."
New §1.1a defines:

- **Family S — `<summary>` disclosure headers.** A disclosure summary is half caption, half
  control: its text names the *content* it folds, and the fold affordance is carried by the
  marker/chevron and interaction, not by label weight. Resting `text-text-subtle` is sanctioned.
- **Family C — dismissable filter chips.** A chip's text names an *applied filter* (caption); the
  dismiss glyph is the control. Resting `text-text-subtle` is sanctioned.
- **Family D — state-pair dim members** (added by the 2026-08-14 follow-up ratification, R2).
  The dim member of a state pair (inactive↔active, claimed↔unclaimed) may rest subtle **only
  while the pair stays distinguishable by at least one cue besides the text-color delta** — the
  cue may sit on EITHER member (fill, border, weight, glyph, or `aria-current` semantics) and
  is named per registry row and pinned executably (§4.4). The six current members, cues stated
  truthfully (round-2 F3; members 5-6 added round-3):
  - Inactive desktop admin nav links (`components/admin/nav/AdminNav.tsx:168`): active carries
    `bg-surface-raised` + `text-text-strong` + `aria-current="page"` (`AdminNav.tsx:171`).
  - Inactive admin bottom tabs (`AdminNav.tsx:232`): active carries `aria-current="page"`
    (`AdminNav.tsx:236`); the VISUAL delta is `text-accent-on-bg` vs subtle — a hue+lightness
    color delta with no layout cue. Recorded as-is; the implementing invariant-8 gate reviews
    whether the visual delta suffices, and any strengthening it orders is an implementation
    finding, not a policy change.
  - Inactive crew sub-nav tabs (`components/crew/CrewSubNav.tsx:114`): active desktop branch
    carries `border-accent` + `text-text-strong` (`CrewSubNav.tsx:92`); active mobile branch
    carries `text-accent-on-bg` only (`CrewSubNav.tsx:100`) plus `aria-current="page"`
    (`CrewSubNav.tsx:118`) — both branches recorded on the one registry row.
  - Unselected dashboard bucket segments (`components/admin/DashboardBucketSegmentedControl.tsx:56`,
    `DashboardBucketSegmentedControl.tsx:76`; round-3 F1 members, admitted by the ratified
    definition rather than by a new ask): selected segment carries `bg-surface` +
    `text-text-strong` + `shadow-tile` (`DashboardBucketSegmentedControl.tsx:42`) plus
    `aria-current="page"`.
  - Claimed picker rows: the dim member ITSELF carries the distinguishing cues —
    `bg-surface-sunken` fill plus the lock glyph
    (`app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx`, `picker-row-lock` span). See the
    census row note on where this class string is declared vs rendered (§4.3, round-2 F1).
  This keeps no state color-alone in the semantic tree (every pair carries `aria-current` or a
  structural glyph) while preserving the resting hierarchy the Option-2 ratification chose.

Everything else interactive rests at `text-text` or stronger. Hover/focus treatments are
unchanged by the policy (existing `hover:text-text` / `hover:text-text-strong` stay; where a
site's hover target equals its new resting color, the swap site's hover steps to
`text-text-strong` so hover still visibly strengthens — per-site column in §4.3).

### 4.2 Why carve-outs and not strict

Ratified (R2). The ledger entry itself flagged chips and `<summary>` as "arguably caption-like
… DESIGN.md should say so explicitly … rather than being read as absolute and then quietly
excepted" (`BACKLOG.md` § BL-SUBTLE-ON-INTERACTIVE-CLASS, closing paragraph).

### 4.3 Census disposition (55 sites, probe §2.3 v3)

EXEMPT-S / EXEMPT-C / EXEMPT-D = registry row in the named family (§4.1); SWAP = rest color →
`text-text`. "Hover" column: `same` = existing hover kept; `→strong` = hover retargeted to
`text-text-strong` because the old hover target equals the new rest color.

| Site | Tag | Disposition | Hover |
|---|---|---|---|
| `app/admin/settings/admins/AddAdminForm.tsx:131` | button | SWAP | →strong |
| `app/admin/settings/admins/RevokeRowButton.tsx:391` | button | SWAP | →strong |
| `app/admin/settings/roles/RoleMappingRow.tsx:232` | button | SWAP | same (`hover:text-text-strong` via `ghostBtn`) |
| `app/admin/settings/roles/RoleMappingRow.tsx:315` | button | SWAP | same |
| `app/admin/settings/roles/RoleMappingRow.tsx:353` | button | SWAP | same |
| `app/admin/show/staged/[stagedId]/page.tsx:257` | Link | SWAP | same (`hover:text-text-strong`) |
| `app/auth/sign-in/page.tsx:267` | Link | SWAP | →strong |
| `app/me/meShowSections.tsx:122` | summary | EXEMPT-S | — |
| `app/me/page.tsx:134` | button | SWAP | →strong |
| `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:233` | button | EXEMPT-D (declaration site: `rowClasses` ternary; the subtle branch is DEAD here — claimed rows return earlier — and is RENDERED by `_ClaimedRowButton.tsx:101` via the `rowClassName` prop; row covers the pair) | — |
| `components/admin/AppHealthPopover.tsx:89` | button | SWAP | →strong |
| `components/admin/BellPanel.tsx:686` | a | SWAP (`HELP_LINK` const) | →strong |
| `components/admin/BellPanel.tsx:1210` | a | SWAP | same |
| `components/admin/DashboardBucketSegmentedControl.tsx:56` | Link | EXEMPT-D (selected = surface fill + shadow + strong) | — |
| `components/admin/DashboardBucketSegmentedControl.tsx:76` | Link | EXEMPT-D (same pair; disabled span sibling at line 71 is non-interactive and out of scope) | — |
| `components/admin/IdentityHoldDisclosure.tsx:33` | button | SWAP | per-site check |
| `components/admin/OnboardingWizard.tsx:140` | button | SWAP | same |
| `components/admin/ReSyncButton.tsx:175` | button | SWAP | →strong |
| `components/admin/RoleRecognizeControl.tsx:394` | button | SWAP (`ghostBtn` const) | same |
| `components/admin/ShowRowActions.tsx:999` | Link | SWAP | per-site check |
| `components/admin/StagedReviewCard.tsx:675` | button | SWAP | per-site check (conditional className) |
| `components/admin/dev/SwitcherControls.tsx:142` | button | SWAP | same (border affordance) |
| `components/admin/nav/AdminNav.tsx:168` | Link | EXEMPT-D (active = raised bg + strong) | — |
| `components/admin/nav/AdminNav.tsx:232` | Link | EXEMPT-D (active = `text-accent-on-bg`) | — |
| `components/admin/nav/AppHealthIndicator.tsx:90` | Link | SWAP (`TAP_TARGET` const) | →strong |
| `components/admin/nav/AppHealthIndicator.tsx:104` | button | SWAP (`TAP_TARGET` const) | →strong |
| `components/admin/nav/NotifBell.tsx:76` | button | SWAP | per-site check |
| `components/admin/nav/OnboardingTopBar.tsx:84` | button | SWAP | →strong |
| `components/admin/nav/UserMenu.tsx:51` | button | SWAP | per-site check |
| `components/admin/settings/AdministratorsSection.tsx:150` | summary | EXEMPT-S | — |
| `components/admin/showpage/PublishedReviewModal.tsx:964` | button | SWAP | per-site check |
| `components/admin/showpage/ShareHub.tsx:777` | button | SWAP | per-site check |
| `components/admin/showpage/sectionWarningExtras.tsx:272` | summary | EXEMPT-S | — |
| `components/admin/telemetry/ActiveFilterChips.tsx:90` | button | EXEMPT-C | — |
| `components/admin/telemetry/ActiveFilterChips.tsx:101` | button | ~~EXEMPT-C~~ **SWAP** | →strong (corrected 2026-08-15, see the tally note below) |
| `components/admin/telemetry/AutoRefreshControl.tsx:119` | button | SWAP | →strong |
| `components/admin/telemetry/EventFilters.tsx:85` | button | SWAP (unselected branch) | n/a (selected branch inverts) |
| `components/admin/telemetry/EventRow.tsx:100` | Link | SWAP | same (pill `bg-surface-sunken` affordance) |
| `components/admin/wizard/Step2Verify.tsx:626` | Link | SWAP | same (`hover:text-text-strong`) |
| `components/admin/wizard/Step3ReviewModal.tsx:475` | button | SWAP | →strong |
| `components/admin/wizard/Step3ReviewWithFinalize.tsx:143` | Link | SWAP | same (`hover:text-text-strong`) |
| `components/admin/wizard/step3ReviewSections.tsx:1410` | a | SWAP | per-site check |
| `components/admin/wizard/step3ReviewSections.tsx:1422` | a | SWAP | per-site check |
| `components/admin/wizard/step3ReviewSections.tsx:1599` | summary | EXEMPT-S | — |
| `components/admin/wizard/step3ReviewSections.tsx:2594` | button | SWAP | per-site check |
| `components/agenda/AgendaPdfViewer.tsx:165` | button | SWAP | same (`hover:bg-surface-raised`) |
| `components/crew/AgendaScheduleBlock.tsx:107` | summary | EXEMPT-S | — |
| `components/crew/CrewSubNav.tsx:114` | button | EXEMPT-D (active = `border-accent` + strong) | — |
| `components/crew/primitives/KeyTimesStrip.tsx:191` | summary | EXEMPT-S | — |
| `components/crew/primitives/PersonRow.tsx:196` | a | SWAP (`ACTION_CLASS` const) | per-site check |
| `components/crew/primitives/PersonRow.tsx:213` | a | SWAP (`ACTION_CLASS` const) | per-site check |
| `components/crew/primitives/RunOfShowList.tsx:82` | summary | EXEMPT-S (synthetic-row dim also noted in the row's reason) | — |
| `components/layout/ThemeToggle.tsx:81` | button | SWAP | per-site check |
| `components/shared/ReportButton.tsx:141` | button | SWAP | →strong |
| `components/shared/ReportModal.tsx:579` | button | SWAP | →strong |

Tallies (single source is this table; the guard registry re-states it executably): 55 total =
**14 EXEMPT (7 Family S + 1 Family C + 6 Family D) + 41 SWAP** — corrected 2026-08-15 from
15/40 by the implementing branch's whole-diff review (R1 F2). `ActiveFilterChips.tsx:101` was
listed EXEMPT-C and is the "Clear filters" action: a plain underlined button with no filter
caption and no dismiss glyph, so it never met Family C's definition above. The FAMILY SET is
untouched and is not reopened; a membership claim that was factually wrong is corrected, and
the site takes the swap the ratified policy prescribes for a control in no family. "Per-site check" hover cells are
settled task-by-task in the plan against each site's existing hover token — the policy
constraint is only that hover must still strengthen (or the site has a non-color hover
affordance, e.g. `hover:bg-*`). Sites whose subtle token arrives via a shared const
(`ghostBtn`, `TAP_TARGET`, `HELP_LINK`, `ACTION_CLASS`) are swapped AT THE CONST, so each
edit covers every consumer of that const; the scan re-run confirms no consumer was
double-counted.

Line numbers above are drafting-time locators (2026-08-14); the durable anchors are file +
element + the `data-testid` values visible at each site.

### 4.4 The guard

New importable scan module `tests/styles/subtleInteractiveScan.ts (new)` + suite
`tests/styles/_metaSubtleOnInteractive.test.ts (new)` + registry
`tests/styles/subtleInteractiveExemptions.ts (new)` (shape of `tests/styles/zIndexExemptions.ts`:
`{file, line, token, reason}` rows plus a
`family: "summary-disclosure" | "dismissable-chip" | "state-dim"` field, and for `"state-dim"`
rows a required `siblingCue: { file, token }` naming the cue and where it lives — reasons never
blank; the file+line key trade-off is the shipped precedent, accepted there for the same
reason).

- Scan = §2.3 procedure, walked from the filesystem (a NEW `.tsx` file is covered by default).
  The in-scope element predicate, the className resolver (rules 1–6 of §5.2), and the corpus
  walk live in ONE shared core module `tests/styles/interactiveScanCore.ts (new)` imported by
  both this scan and D3's — the two guards cannot drift apart on scope or resolution (round-1
  F1's class, closed by derivation rather than by keeping two copies reconciled).
- Pass condition per hit: the site has a registry row (family + reason) — else FAIL naming
  `file:line`, tag, and the token.
- **Family-shape check:** a `family: "summary-disclosure"` row whose site's tag is not
  `summary` fails; Family C rows are checked to sit in the chips component
  (`components/admin/telemetry/ActiveFilterChips.tsx`) until a second chip surface ships;
  Family D (`"state-dim"`) rows must carry a `siblingCue: { file, token }`, and the suite
  VALIDATES it against source: it reads `siblingCue.file` and asserts `siblingCue.token` is
  present in that file (the rule-7-companion pattern), so a refactor that removes the cue fails
  the row instead of leaving a stale claim (§4.1 Family D lists the six current cues).
- **Premise pin:** the suite asserts the scan finds ≥ 1 hit in the committed tree (Family S
  sites exist by design), so an AST regression that finds nothing cannot pass silently; and it
  asserts registry rows resolve to live files/lines that actually carry the token (a stale row
  fails — the stale-marker failure mode, applied to exemptions).
- Steady state after the swap: registry = exactly the EXEMPT rows of §4.3 (14 as shipped).
  The count lives in §4.3 and in `_metaSubtleOnInteractive`, never in prose here as well —
  two copies of a number is how the 15 outlived its own correction (whole-diff R2 F1).
- Mutation-registry enrolment (R9): row in `tests/mutation/source/registry.ts` targeting
  `tests/styles/subtleInteractiveScan.ts (new)` with the referring suite; operator set and minimum
  score fixed at plan time from the registry's existing operator vocabulary; unaccepted-survivor
  set must be empty before the guard's review dispatch.

## 5. D3 — tap-target guard with static resolution

### 5.1 Deliverable — and what the static guard claims

Importable scan module `tests/styles/tapTargetScan.ts (new)` + suite
`tests/styles/_metaTapTargetFloor.test.ts (new)` + census registry
`tests/styles/tapTargetCensus.ts (new)`. In-scope elements and floor tokens: exactly §2.4's sets
(inherited from the a11y spec §2.6 so the two scanners cannot drift apart on scope; the
in-scope predicate and floor-token list are exported from one shared module and used by both
this scan and D2's, §4.4). The predicate's component-tag arm derives from the rule-7 allowlist
(round-3 F2): every allowlisted component's call site is in scope by construction, so a
`type="submit"` `AccentButton` with no `onClick` is still checked for rule-8 defeaters.

**The static guard's claim is the HEIGHT floor** (round-1 F2): a class string can prove
`min-height`/`height` ≥ 44px statically, but width is usually content-driven (`px-*` plus a
label) and no width token exists at most legitimately-sized controls — a static width demand
would push essentially the whole corpus into the census and the guard would pin nothing. Height
is also the dimension every measured defect in the filing corpus was (16.8–19.4px rows, the
36px HelpSheet trigger). Width stays with the real-browser rect oracles
(`tests/e2e/tap-target-floor.layout.spec.ts`, the lifecycle-layout e2e assertions), which
measure both dimensions on production routes — §10 records the split. Height-proving tokens:
`min-h-tap-min`, `size-tap-min` (proves both dimensions), numeric `h-*`/`min-h-*` ≥ 11 on the
4px scale, arbitrary `min-h-[...]`/`h-[...]` ≥ 44px, the negative-margin+padding recipe,
`before:absolute` inset expansion, `sr-only` (real target is the parent label). A bare
`min-w-*`/`w-*` token proves nothing here.

### 5.2 Accept-set — what the recogniser resolves (structure-keyed, not spelling-keyed)

An element CLEARS when (a) a height-floor token is **unconditionally** reachable from its
`className` (or its floor is carried by a registered component), (b) the className is **fully
resolved** — no part of the expression was unreadable, and (c) **no defeater token** (rule 8)
is reachable anywhere in the resolved strings. Resolution rules:

1. **String literal / no-substitution template** — read directly.
2. **Template with expressions** — static heads/tails read directly; each expression resolved
   by these same rules; an expression the rules cannot resolve makes the element
   **UNCLASSIFIED** (round-1 F3: an unread span can carry a defeater, so a partially-read
   string never clears).
3. **Conditional (`?:`)** — the floor must be reachable in BOTH branches (a floor present in
   one branch only does not clear).
4. **Logical (`&&`, `||`, `??`)** — a floor inside a right-hand operand of `&&` is conditional
   and does not clear; `||`/`??` fallback pairs must BOTH carry it.
5. **`cn(...)`/`clsx(...)`/`[...].join(" ")`** — union of unconditional arguments (conditional
   arguments per rules 3–4); an argument outside rules 1–6 (spread, computed member, call)
   makes the element UNCLASSIFIED per rule 2's posture.
6. **Identifier and same-file helper call** — resolve a `const` declared anywhere in the same
   file (innermost scope wins on name collision); resolve an imported named binding one module
   hop to an exported `const` initializer (re-export chains followed up to a fixed depth of 3);
   resolve a CALL to a same-file function declaration or arrow/function-expression `const`
   (round-3 F1: the `segClass(...)` shape) to the union of its `return` expressions or
   expression body. Each resolved node is then processed by rules 1–5 and this rule,
   depth-capped. Anything else — an imported function call, a computed member, a parameter —
   → UNCLASSIFIED.
7. **Floor-carrying components** — a component allowlist (`AccentButton` first member) whose
   base class guarantees the HEIGHT floor; each allowlist row carries a companion source
   assertion (the suite reads `components/shared/AccentButton.tsx` and asserts `BASE_CLASS`
   contains `min-h-tap-min`) so the row cannot outlive the component's contract. A registered
   component's call site is still subject to rule 8 on its own `className` prop (round-1 F3:
   `<AccentButton className="min-h-0!">` must not clear).
8. **Defeater tokens (negative rule; round-1 F3, grammar widened round-2 F2).** After
   resolution, the element is UNCLASSIFIED — reported by name, never passed — if ANY reachable
   resolved string (including conditional branches and `&&` operands, i.e. reachability here is
   existential where rule 3's is universal) contains a token whose effective CSS can push
   height back under the floor. The defeater grammar, enumerated:
   - any `h-*`/`min-h-*`/`max-h-*`/`size-*` utility computing < 44px (numeric < 11, `0`,
     `auto`, `none`, `fit`, `min`, `max`, `px`, arbitrary value < 44px) — `max-h-*` caps an
     otherwise-cleared `h-*`/`size-*` floor;
   - any arbitrary-property form targeting height: `[height:...]`, `[min-height:...]`,
     `[max-height:...]` with a sub-floor value;
   - when the floor was proven by the negative-margin+padding recipe: any padding-affecting
     token (`p-*`, `py-*`, `pt-*`, `pb-*`, and arbitrary padding properties) that shrinks the recipe's
     vertical padding below the recipe arithmetic;
   - when the floor was proven by the `before:absolute` inset recipe: any inset-affecting
     token on the same pseudo-element (`before:inset-*`, `before:-inset-*`, `[inset:...]`)
     that narrows the expansion;
   - every form above in `!`-important form, and in any variant-prefixed form (`sm:`, `md:`,
     `max-*:`, `hover:`, any `*:`-prefixed occurrence of the grammar).
   Conservative by design: a defeater that turns out harmless (earlier in cascade order,
   inapplicable variant) still demotes to the census with the arithmetic recorded in its
   reason — a false UNCLASSIFIED is a registry row, a false CLEAR is a silent hole.

Everything outside the accept-set is **rejected by name**: reported UNCLASSIFIED, and the suite
fails unless that element has a census row.

### 5.3 Census registry

`tests/styles/tapTargetCensus.ts (new)` rows: `{file, line, tag, category, reason, backlogRef?}`.
Categories are the principled §2.6 families plus the residue:

- `inline-prose-link` (bucket B; `PRODUCT.md:59` exemption)
- `parent-label-target` (bucket C)
- `full-bleed` (bucket F)
- `padding-arithmetic` (bucket D rows that clear by computed padding; reason shows the arithmetic)
- `under-floor-filed` (bucket A residue; `backlogRef: "BL-TAP-TARGET-INLINE-TEXT-CONTROLS"` — R8)
- `unresolvable-dynamic` (true (E) residue after resolution)

Expected steady state, from §2.4's dated baseline: the 94-member bucket (E) shrinks to the
`unresolvable-dynamic` residue (constants, ternaries, templates and component-floor resolve the
rest); the implementing branch derives the actual number by running the shipped scanner and
records it in the plan's census-seeding task (R7 — no number is promised here).

- **Premise pins:** the suite asserts the scanner reports ≥ 300 in-scope elements on the
  committed tree (the corpus cannot silently shrink to a trivially-green set); asserts at least
  one known CLEARS site (`SECONDARY_ACTION_CLASS` consumers resolve through rule 6 — the
  constant carries `min-h-tap-min`); asserts census rows resolve to live sites (stale row fails).
- Fail-by-default: a NEW interactive element that neither clears nor has a row fails the suite
  naming the element.
- Mutation-registry enrolment (R9): same mechanics as §4.4.

### 5.4 Consequence bound and threat model (review convergence contract)

**Consequence bound:** every in-scope interactive element is (a) cleared by the recogniser,
(b) matched to a census/exemption row with a reason, or (c) FAILS the suite by name — never
silently passed. A construct the resolver cannot read lands in (c) until a human writes the row;
a conservative UNCLASSIFIED plus a named failure is a DOCUMENTED LIMIT, not a finding.

**Threat-model fence:** the guard defends against accidental authoring mistakes by an ordinary
contributor. Adversarial obfuscation (classes assembled at runtime, spread props, string
concatenation designed to evade rule 6) is out of scope and files to §10.

**Convergence criterion for guard review rounds:** the mutation score of the enrolled surfaces
plus an empty unaccepted-survivor set (R9). A "the guard does not pin what it claims" finding is
admissible only with a surviving mutant from the declared operator set.

## 6. Guard-conditions / mode notes (spec-self-review checklist items)

- **No component props change.** D1/D2 are class-string edits; no prop surface, no null/empty
  states introduced. `EventFilters.tsx:85` and `StagedReviewCard.tsx:675` carry conditional
  classNames: the swap edits only the branch(es) carrying `text-text-subtle`; the other branch
  is untouched (mode boundary: selected-state inversion at EventFilters stays).
- **Cap/truncation:** census registries are bounded by the scan (55 D2 sites and the derived (E)
  residue); no unbounded list renders anywhere.

### Transition Inventory

No new visual states and no new transitions anywhere in scope: rest-color swaps and a
border-color swap only. Every existing state pair at every touched site keeps its shipped
treatment — hover/focus/disabled changes in §3.1/§4.3 retarget color values, never animation.
No `AnimatePresence` and no `transition-*` token is added or removed; the transition-count pins
(§3.4) prove it executably. All pairs: instant — no animation needed.

### Dimensional Invariants

None — no dimension, padding, or layout class changes at any census or call site above.
(Tap-floor recipes at the swap sites are preserved verbatim.) No fixed-dimension parent gains
or loses flex/grid children in this diff.

## 7. Testing summary

| Surface | Test | Type |
|---|---|---|
| D1 ratios + premise | `tests/styles/secondary-action-contrast.test.ts (new)` | unit, reads live CSS + source |
| D2 policy | `tests/styles/_metaSubtleOnInteractive.test.ts (new)` + registry | structural AST guard |
| D3 floor | `tests/styles/_metaTapTargetFloor.test.ts (new)` + census | structural AST guard |
| Guard integrity | mutation rows for both scan modules (`pnpm mutation:guards`) | mutation harness |
| Visual regression | impeccable v3 critique + audit on the diff (invariant 8) | gate |
| Byte baselines | §8 regeneration | CI parity |

Existing suites expected green throughout except the §8 baselines. TDD order per task is the
plan's concern; every task follows invariant 1.

## 8. CI / baseline fan-out

Rest-color swaps on nav chrome (`NotifBell`, `UserMenu`, `ThemeToggle`, `OnboardingTopBar`) and
the secondary-button border change alter rendered pixels on screens captured by the committed
help screenshots (`public/help/screenshots/**`) and any byte-pinned gallery baselines. Per the
byte-comparison discipline (AGENTS.md): regenerate affected baselines FROM the pinned Playwright
Docker image with `--platform linux/amd64`, never from the dev host; run the pixel-diff
comparison BEFORE rebaselining to confirm only intended surfaces moved; restore committed WebPs
after any local verification capture (`git restore public/help/screenshots/`). The plan
enumerates the affected manifest entries; heavy phases run under `pnpm heavy`.

## 9. Acceptance criteria

- **AC-1** `SECONDARY_ACTION_CLASS` contains `border-text-faint`, not `border-border-strong`;
  all 8 call sites render the new outline with zero call-site edits.
- **AC-2** `tests/styles/secondary-action-contrast.test.ts (new)` passes and fails on either premise
  (token reverted) or ratio (token value drifts below 3:1) mutation.
- **AC-3** DESIGN.md carries the §3.2 amendments; `pnpm spec:lint` and the DESIGN-figure parity
  suite (`tests/styles/design-figure-parity.test.ts`) stay green.
- **AC-4** Every SWAP site of §4.3 rests at `text-text`; every EXEMPT site is a registry row with
  family + reason (Family D rows with `siblingCue`); `_metaSubtleOnInteractive` walks the filesystem and fails by name on an
  unregistered hit.
- **AC-5** `_metaTapTargetFloor` ships unblocked: recogniser implements §5.2 rules 1–8 (rule 8's full defeater grammar included); census
  registry seeds per §5.3; suite fails by name on an unregistered UNCLASSIFIED element.
- **AC-6** *(amended 2026-08-15 — see AMENDMENT 1 below)* The scan modules that the harness can
  express are enrolled in `tests/mutation/source/registry.ts`; `pnpm mutation:guards` reports
  zero unaccepted survivors before the guard review dispatch.
- **AC-7** Invariant-8 impeccable dual-gate run on the implementing diff; P0/P1 fixed or
  DEFERRED.md-entried; closeout carries the `impeccable-gate:` marker line.
- **AC-8** Ledger: the three entries graduate to `BACKLOG-archive.md` with the IN PROGRESS
  markers removed in the PR's last commit (invariant 12).
- **AC-9** Affected screenshot baselines regenerated per §8; parity gates green in real CI.

## 10. Documented limits

- **Disabled-state contrast.** `disabled:opacity-60` drops the new outline below 3:1. WCAG
  exempts inactive controls; not a finding.
- **The static tap guard proves height, not width** (§5.1). Width floors remain the real-browser
  rect suites' claim; a width-only defect (a tall, 20px-wide icon button with no `min-w-*`)
  passes the static guard and is caught only where an e2e assertion covers its route. `size-*`
  tokens and rule-7 components with a width guarantee prove both; everything else is
  height-only by declaration.
- **Adversarial class assembly** (runtime concatenation, spread props, computed members) defeats
  rule 6 by design; such an element lands UNCLASSIFIED and fails until a census row names it —
  conservative + surfaced, per §5.4 and rules 2/5.
- **Rule 8 is token-syntactic, not a cascade engine.** It flags any reachable sub-floor
  height-affecting token regardless of source order, specificity, or variant applicability —
  over-demotion is the accepted direction. Its guarantee is scoped to the grammar §5.2 rule 8
  enumerates (widened round-2 to `max-h-*`, arbitrary height properties, and the two
  recipe-scoped defeater families); a height defeater expressed OUTSIDE that grammar — a
  bespoke CSS class in `globals.css`, an inline `style` prop, a plugin utility — is outside the
  scanner's corpus by declaration, and the mutation-registry enrolment (R9) is the mechanism a
  claimed new in-grammar gap must come through (live escaping mutant, not hypothesis).
- **D2 partial classNames and prop-flow.** A hit is registered/failed when provable; a
  className whose only `text-text-subtle` arrives through an expression the resolver cannot
  read is invisible to the D2 scan. One live instance exists (round-2 F1):
  `_ClaimedRowButton.tsx:101` renders the subtle claimed-row string via its `rowClassName`
  prop — the scan sees the DECLARATION (the `rowClasses` ternary in `_PickerInterstitial.tsx`,
  censused at §4.3) but not the prop flow, so the child element itself is not a hit. Registry
  coverage is at the declaration site by design; className-as-prop flows are a documented
  limit of the D2 scan, acceptable because D2's worst case is cosmetic (the ledger row's own
  framing). The D3 scan is NOT exposed the same way: the child's own `className` template
  contains an unresolvable identifier, so rule 2 demotes it to the census rather than clearing
  it. The 8 `[partial]` sites in §2.3 have proven hits plus an unread remainder.
- **Import-resolution depth** is bounded (3 hops); a deeper re-export chain lands UNCLASSIFIED,
  same posture.
- **Non-JSX renderers** (e.g. `document.createElement` in scripts, non-`.tsx` files) are outside
  both scanners' corpus; the corpus is app/components `.tsx` by declaration.
- **Registry line-keys rot on unrelated edits** — accepted trade-off inherited from
  `zIndexExemptions.ts` (its header documents the one-site-per-row rationale); the stale-row
  premise pin turns rot into a named failure, not a silent hole.
- **Hover-only affordance** on some swap sites (subtle → text still has no non-color rest
  affordance) is `BL-CONTACT-CELL-TAP-SPACING-AND-GROUPING` / PRODUCT.md venue-floor territory,
  not this arc (R11).

## 11. Out of scope

Other live arcs' ledger entries (guard-completeness and sync-observability arcs per the batch
brief); `BL-TAP-TITLE-LINK-META-LINE-BLEED`, `BL-TRANSPORT-CELL-STRETCH-AFTER-TAP-FLOOR`,
`BL-CONTACT-CELL-TAP-SPACING-AND-GROUPING`, `BL-GLOBALS-STALE-ACCENT-CONTRAST-COMMENT` (its
`app/globals.css:1206` comment sits near, but not in, any file this arc edits);
`BL-TAP-TARGET-INLINE-TEXT-CONTROLS` residue (R8); any redesign of the secondary treatment
beyond the border token; any `text-text-subtle` use on non-interactive elements (the remaining several hundred
caption/timestamp sites in the raw grep stay untouched).
