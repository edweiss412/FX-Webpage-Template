# UI interactive token policy — secondary-button boundary, subtle-on-interactive carve-outs, tap-target className resolution

**Date:** 2026-08-14 · **Branch:** `fix/ui-interactive-token-policy` · **Status:** DRAFT
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
   targets" rule for `--color-text-subtle` gains two named carve-out families — `<summary>`
   disclosure headers and dismissable filter chips — which stay subtle *by documented decision*.
   Every other interactive element currently resting on `text-text-subtle` steps up to
   `text-text`. A structural AST guard with a reasons-required registry enforces both halves,
   fail-by-default for new sites.
3. **D3 — tap-target guard unblocked by static resolution.** The repo-wide 44px tap-target guard
   (filed by the 2026-08-07 step3-a11y-cluster spec §5, blocked on bucket (E)) ships with a
   recogniser that **statically resolves** named constants, ternary branches, template statics,
   and `cn()`/`clsx()`/`.join()` arguments, plus a registered floor-carrying-component set.
   Irreducible residue lands in a reasons-required UNCLASSIFIED census, fail-by-default.

## 1. Scope

In scope: `lib/ui/actionClass.ts`; the 26 swap sites and 8 carve-out sites in §4.3; DESIGN.md
§1.1/§1.2/§1.2a amendments; one contrast meta-test; two structural guard surfaces (scan modules +
suites + registries) and their mutation-registry enrolment; screenshot-baseline regeneration for
affected committed baselines (§8).

Out of scope: §11.

### 1.1 Resolved scope — do not relitigate

| # | Decision | Ratification |
|---|---|---|
| R1 | D1 = Option A (darker outline via existing `--color-text-faint`). Options B (tinted fill) and C (document label-as-affordance, no change) were rendered in the mockup and declined. | User ask, 2026-08-14, this arc's decision pause (mockup artifact `Buttons & Quiet Labels` + AskUserQuestion) |
| R2 | D2 = Option 2 (carve-outs). Strict-swap-all and freeze-census were declined. The two carve-out families are exactly: `<summary>` disclosure headers, dismissable filter chips. | Same ask |
| R3 | D3 = resolve-constants. Require-literals and accept-census were declined. | Same ask |
| R4 | The secondary treatment stays ONE shared constant; per-site divergence is the failure it exists to prevent. | `lib/ui/actionClass.ts` header comment; `tests/components/admin/wizard/step3JudgmentChrome.test.tsx` follow-the-code scan (search `SECONDARY_ACTION_CLASS`) |
| R5 | The current 1.6:1 boundary is NOT a WCAG failure and NOT a regression; D1 is a deliberate design upgrade, not a compliance repair. Do not re-frame as an AA fix. | `BACKLOG.md` § BL-SECONDARY-BUTTON-BOUNDARY-INVISIBLE ("This is NOT a strict AA failure") |
| R6 | Census counts in the ledger rows are historical: entry said 32 sites / 19 files (2026-08-10); the live probe (§2.3, 2026-08-14) reports 34 / 29. The scan is the authority — the entry says so itself ("the scan is the authority, not this excerpt", `BACKLOG.md` § BL-SUBTLE-ON-INTERACTIVE-CLASS probe block). No reconciliation round is owed. | Entry text + §2.3 probe |
| R7 | The 2026-08-07 corpus baseline (340 in-scope / 139 uncleared / buckets A16 B5 C7 D4 E94 F13) is a dated record run at `origin/main` @ `61281c23e`. It is filing evidence, never re-corrected; the implementing branch re-derives current counts with the shipped scanner. | `docs/superpowers/specs/2026-08-07-step3-a11y-cluster.md` §2.6 |
| R8 | Bucket-A residue (8 inline text links/buttons) belongs to `BL-TAP-TARGET-INLINE-TEXT-CONTROLS`, not this arc: the guard records them as census rows referencing that entry; it does not repair them. | §2.6 disposition table (rows marked "Filed"); `BACKLOG-archive.md` graduation 2026-08-11 |
| R9 | Both new guard surfaces are enrolled in the source-mutation registry (`tests/mutation/source/registry.ts`) BEFORE their first adversarial review round, authored as importable modules with referring suites from the start. Review convergence for the guards = mutation score + empty unaccepted-survivor set. | AGENTS.md "Convergence criterion" bullet 3 |
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

Procedure: TypeScript-compiler AST walk (`ts.createSourceFile`, `ScriptKind.TSX`) over every
`.tsx` under `app/**` + `components/**`; JSX opening/self-closing elements with tag `button` /
`a` / `summary`; `className` attribute's statically reachable strings (string literal, template
statics + resolvable spans, both conditional branches, binary operands, call arguments —
`cn()`/`clsx()` included); hit = bare token `text-text-subtle` present. Output 2026-08-14:
**34 sites across 29 files** — full listing with dispositions in §4.3. (Probe script:
drafting-time scratch; the shipped guard's scan module in §4.4 is the durable form and must
reproduce this census on enrolment.)

### 2.4 D3 baseline

§2.6 of the step3-a11y-cluster spec (R7 above): in-scope = `<button>`, `<a>`, `<Link>`,
`<summary>`, `<input type="checkbox|radio">`, any tag with `role="button"` or `onClick`; floor
classes are enumerated there (`min-h-tap-min` / `size-tap-min` / `min-w-tap-min`, numeric
`h-`/`w-`/`min-*` ≥ 11 on the 4px scale, arbitrary ≥44px, negative-margin+padding recipe,
`before:absolute` inset, `sr-only` parent-label). Bucket (E) — 94 non-literal classNames — is
the sole blocker; buckets B/C/F are principled exemption families; bucket (D) is
padding-arithmetic; bucket (A) is dispositioned (§1.1 R8).

Named class-string constants confirmed live: `SECONDARY_ACTION_CLASS`
(`lib/ui/actionClass.ts`), `DISCARD_RESTING_CLASS` / `IGNORE_ARMED_CLASS`
(`components/admin/PendingPanelDiscardButtons.tsx:49` and line 52), AccentButton's `BASE_CLASS`
(`components/shared/AccentButton.tsx:105`, carries `min-h-tap-min`; 6 `<AccentButton` call
sites).

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
Never the resting color of an action target, **except the two carve-out families in §1.1a**."
New §1.1a defines:

- **Family S — `<summary>` disclosure headers.** A disclosure summary is half caption, half
  control: its text names the *content* it folds, and the fold affordance is carried by the
  marker/chevron and interaction, not by label weight. Resting `text-text-subtle` is sanctioned.
- **Family C — dismissable filter chips.** A chip's text names an *applied filter* (caption); the
  dismiss glyph is the control. Resting `text-text-subtle` is sanctioned.

Everything else interactive rests at `text-text` or stronger. Hover/focus treatments are
unchanged by the policy (existing `hover:text-text` / `hover:text-text-strong` stay; where a
site's hover target equals its new resting color, the swap site's hover steps to
`text-text-strong` so hover still visibly strengthens — per-site column in §4.3).

### 4.2 Why carve-outs and not strict

Ratified (R2). The ledger entry itself flagged chips and `<summary>` as "arguably caption-like
… DESIGN.md should say so explicitly … rather than being read as absolute and then quietly
excepted" (`BACKLOG.md` § BL-SUBTLE-ON-INTERACTIVE-CLASS, closing paragraph).

### 4.3 Census disposition (34 sites, probe §2.3)

EXEMPT-S = Family S row in the registry; EXEMPT-C = Family C row; SWAP = rest color →
`text-text`. "Hover" column: `same` = existing hover kept; `→strong` = hover retargeted to
`text-text-strong` because the old hover target equals the new rest color.

| Site | Tag | Disposition | Hover |
|---|---|---|---|
| `app/admin/settings/admins/AddAdminForm.tsx:131` | button | SWAP | →strong |
| `app/admin/settings/admins/RevokeRowButton.tsx:391` | button | SWAP | →strong |
| `app/admin/settings/roles/RoleMappingRow.tsx:315` | button | SWAP | same (`hover:text-text-strong`) |
| `app/admin/settings/roles/RoleMappingRow.tsx:353` | button | SWAP | same |
| `app/me/meShowSections.tsx:122` | summary | EXEMPT-S | — |
| `app/me/page.tsx:134` | button | SWAP | →strong |
| `components/admin/AppHealthPopover.tsx:89` | button | SWAP | →strong |
| `components/admin/BellPanel.tsx:1210` | a | SWAP | same |
| `components/admin/IdentityHoldDisclosure.tsx:33` | button | SWAP | per-site check |
| `components/admin/OnboardingWizard.tsx:140` | button | SWAP | same |
| `components/admin/ReSyncButton.tsx:175` | button | SWAP | →strong |
| `components/admin/StagedReviewCard.tsx:675` | button | SWAP | per-site check (conditional className) |
| `components/admin/dev/SwitcherControls.tsx:142` | button | SWAP | same (border affordance) |
| `components/admin/nav/NotifBell.tsx:76` | button | SWAP | per-site check |
| `components/admin/nav/OnboardingTopBar.tsx:84` | button | SWAP | →strong |
| `components/admin/nav/UserMenu.tsx:51` | button | SWAP | per-site check |
| `components/admin/settings/AdministratorsSection.tsx:150` | summary | EXEMPT-S | — |
| `components/admin/showpage/PublishedReviewModal.tsx:964` | button | SWAP | per-site check |
| `components/admin/showpage/ShareHub.tsx:777` | button | SWAP | per-site check |
| `components/admin/showpage/sectionWarningExtras.tsx:272` | summary | EXEMPT-S | — |
| `components/admin/telemetry/ActiveFilterChips.tsx:90` | button | EXEMPT-C | — |
| `components/admin/telemetry/ActiveFilterChips.tsx:101` | button | EXEMPT-C | — |
| `components/admin/telemetry/AutoRefreshControl.tsx:119` | button | SWAP | →strong |
| `components/admin/telemetry/EventFilters.tsx:85` | button | SWAP (unselected branch) | n/a (selected branch inverts) |
| `components/admin/wizard/Step3ReviewModal.tsx:475` | button | SWAP | →strong |
| `components/admin/wizard/step3ReviewSections.tsx:1410` | a | SWAP | per-site check |
| `components/admin/wizard/step3ReviewSections.tsx:1422` | a | SWAP | per-site check |
| `components/admin/wizard/step3ReviewSections.tsx:1599` | summary | EXEMPT-S | — |
| `components/admin/wizard/step3ReviewSections.tsx:2594` | button | SWAP | per-site check |
| `components/agenda/AgendaPdfViewer.tsx:165` | button | SWAP | same (`hover:bg-surface-raised`) |
| `components/crew/AgendaScheduleBlock.tsx:107` | summary | EXEMPT-S | — |
| `components/crew/primitives/KeyTimesStrip.tsx:191` | summary | EXEMPT-S | — |
| `components/layout/ThemeToggle.tsx:81` | button | SWAP | per-site check |
| `components/shared/ReportModal.tsx:579` | button | SWAP | →strong |

Tallies (single source is this table; the guard registry re-states it executably): 34 total = 8
EXEMPT (6 Family S + 2 Family C) + 26 SWAP. "Per-site check" hover cells are settled task-by-task
in the plan against each site's existing hover token — the policy constraint is only that hover
must still strengthen (or the site has a non-color hover affordance, e.g. `hover:bg-*`).

Line numbers above are drafting-time locators (2026-08-14); the durable anchors are file +
element + the `data-testid` values visible at each site.

### 4.4 The guard

New importable scan module `tests/styles/subtleInteractiveScan.ts (new)` + suite
`tests/styles/_metaSubtleOnInteractive.test.ts (new)` + registry
`tests/styles/subtleInteractiveExemptions.ts (new)` (shape of `tests/styles/zIndexExemptions.ts`:
`{file, line, token, reason}` rows plus a `family: "summary-disclosure" | "dismissable-chip"`
field — reasons never blank; the file+line key trade-off is the shipped precedent, accepted
there for the same reason).

- Scan = §2.3 procedure, walked from the filesystem (a NEW `.tsx` file is covered by default).
- Pass condition per hit: the site has a registry row (family + reason) — else FAIL naming
  `file:line`, tag, and the token.
- **Family-shape check:** a `family: "summary-disclosure"` row whose site's tag is not
  `summary` fails; Family C rows are checked to sit in the chips component
  (`components/admin/telemetry/ActiveFilterChips.tsx`) until a second chip surface ships.
- **Premise pin:** the suite asserts the scan finds ≥ 1 hit in the committed tree (Family S
  sites exist by design), so an AST regression that finds nothing cannot pass silently; and it
  asserts registry rows resolve to live files/lines that actually carry the token (a stale row
  fails — the stale-marker failure mode, applied to exemptions).
- Steady state after the swap: registry = exactly the 8 EXEMPT rows.
- Mutation-registry enrolment (R9): row in `tests/mutation/source/registry.ts` targeting
  `tests/styles/subtleInteractiveScan.ts (new)` with the referring suite; operator set and minimum
  score fixed at plan time from the registry's existing operator vocabulary; unaccepted-survivor
  set must be empty before the guard's review dispatch.

## 5. D3 — tap-target guard with static resolution

### 5.1 Deliverable

Importable scan module `tests/styles/tapTargetScan.ts (new)` + suite
`tests/styles/_metaTapTargetFloor.test.ts (new)` + census registry
`tests/styles/tapTargetCensus.ts (new)`. In-scope elements and floor tokens: exactly §2.4's sets
(inherited from the a11y spec §2.6 so the two scanners cannot drift apart on scope; the floor
token list is exported and cited by both).

### 5.2 Accept-set — what the recogniser resolves (structure-keyed, not spelling-keyed)

An element CLEARS when a floor token is **unconditionally** reachable from its `className`
(or its floor is carried by a registered component). Resolution rules:

1. **String literal / no-substitution template** — read directly.
2. **Template with expressions** — static heads/tails read directly; each expression resolved
   by these same rules; an unresolvable expression contributes nothing (it cannot clear, and
   does not poison what the static parts already prove).
3. **Conditional (`?:`)** — the floor must be reachable in BOTH branches (a floor present in
   one branch only does not clear).
4. **Logical (`&&`, `||`, `??`)** — a floor inside a right-hand operand of `&&` is conditional
   and does not clear; `||`/`??` fallback pairs must BOTH carry it.
5. **`cn(...)`/`clsx(...)`/`[...].join(" ")`** — union of unconditional arguments (conditional
   arguments per rules 3–4).
6. **Identifier** — resolve a same-file `const` to its initializer; resolve an imported named
   binding one module hop to an exported `const` initializer (re-export chains followed up to a
   fixed depth of 3); the initializer is then resolved by rules 1–5. An initializer that is not
   string-composed (function call other than rule 5, computed member, parameter) → UNCLASSIFIED.
7. **Floor-carrying components** — a component allowlist (`AccentButton` first member) whose
   base class guarantees the floor; each allowlist row carries a companion source assertion (the
   suite reads `components/shared/AccentButton.tsx` and asserts `BASE_CLASS` contains
   `min-h-tap-min`) so the row cannot outlive the component's contract.

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
- **Cap/truncation:** census registries are bounded by the scan (34 and the derived (E)
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
- **AC-4** All 26 SWAP sites rest at `text-text`; the 8 EXEMPT sites are registry rows with
  family + reason; `_metaSubtleOnInteractive` walks the filesystem and fails by name on an
  unregistered hit.
- **AC-5** `_metaTapTargetFloor` ships unblocked: recogniser implements §5.2 rules 1–7; census
  registry seeds per §5.3; suite fails by name on an unregistered UNCLASSIFIED element.
- **AC-6** Both scan modules enrolled in `tests/mutation/source/registry.ts`;
  `pnpm mutation:guards` reports zero unaccepted survivors before the guard review dispatch.
- **AC-7** Invariant-8 impeccable dual-gate run on the implementing diff; P0/P1 fixed or
  DEFERRED.md-entried; closeout carries the `impeccable-gate:` marker line.
- **AC-8** Ledger: the three entries graduate to `BACKLOG-archive.md` with the IN PROGRESS
  markers removed in the PR's last commit (invariant 12).
- **AC-9** Affected screenshot baselines regenerated per §8; parity gates green in real CI.

## 10. Documented limits

- **Disabled-state contrast.** `disabled:opacity-60` drops the new outline below 3:1. WCAG
  exempts inactive controls; not a finding.
- **Adversarial class assembly** (runtime concatenation, spread props, computed members) defeats
  rule 6 by design; such an element lands UNCLASSIFIED and fails until a census row names it —
  conservative + surfaced, per §5.4.
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
beyond the border token; any `text-text-subtle` use on non-interactive elements (534 of the 568
raw grep hits are captions and stay).
