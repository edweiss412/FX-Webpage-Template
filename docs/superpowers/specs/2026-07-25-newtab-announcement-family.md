# New-tab announcement family sweep — design

**Date:** 2026-07-25 · **Backlog item:** `BL-ADMIN-QUIET-LINK-AFFORDANCE-A11Y` (PR2 of the BL-NULLCODE-STAMP-BATCH-2 residual sweep) · **Owner:** Opus / Claude Code (UI work per `ROUTING.md`)

**Revision R6.** Review rounds R1 to R5 raised 6, 11, 7, 6, and 5 findings; all 35 were confirmed against live code and are addressed here. R3 first ran the two mandated passes R1/R2 skipped — `pnpm spec:lint` (attached to every dispatch since) and the `docs/agents/spec-self-review.md` checklist — whose omission caused four of R2's findings.

**The structural guard (§6) has now absorbed findings in four consecutive rounds** (§6 predicate holes, an unimplementable `.mdx` rule, missing branch polarity, an undefined both-branch case, and no self-tests). Per `docs/agents/spec-self-review.md:22`, a vector surviving three rounds stops being patched in prose: the guard is therefore settled by a **prototype with the §6 requirement 7 synthetic self-tests**, built before the remaining implementation, and §6 is authoritative only where the prototype confirms it.

## 1. Problem

A link that opens a new tab tells sighted users so with a `↗` glyph or an external-link icon. That glyph is `aria-hidden="true"` at every site that has one, so a screen-reader user hears only "Open in Sheet" and gets no warning that activating the link leaves the page. On the venue floor — the primary context for this app — an unannounced context switch is disorienting, and back-navigation does not return you.

Two sites already announce, via an `aria-label` naming both destination and behavior: `components/admin/wizard/VenueMapTile.tsx:138` and `components/admin/wizard/Step3SheetCard.tsx:152`. That is the established convention. Twenty-one other new-tab anchors do not follow it.

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| The copy string is exactly `(opens in a new tab)`, lowercase, parenthesized | matches both shipped sites verbatim: `components/admin/wizard/VenueMapTile.tsx:138`, `components/admin/wizard/Step3SheetCard.tsx:152` |
| Mechanism is per-site (label-string vs `sr-only` span), not one uniform sweep | §2 — `aria-label` replaces the accessible name, so a span on a labelled element is dead markup |
| The two existing announcement sites keep the `aria-label` MECHANISM (not necessarily their current text: `VenueMapTile`'s label is rewritten for label-in-name per §2.2) | §2 — their labels name a destination the visible text does not |
| Announcement hints on the four alert-action anchors are gated on `action.external` | §4 Group C — `external: false` builders return same-app hrefs (`lib/adminAlerts/alertActions.ts:61`, `lib/adminAlerts/alertActions.ts:90`, `lib/adminAlerts/alertActions.ts:127`) |
| The tap-target half of the backlog item is already shipped and out of scope | `components/admin/PerShowActionableWarnings.tsx:281` carries `min-h-tap-min` |
| No real-browser Playwright task; jsdom is sufficient | §5.1 and §5.2 — no fixed-dimension parent gains a sized child (the two arrow wrappers are unstyled inline spans around existing glyphs) and no visual state changes |
| Scope covers `components/` AND `app/` | §1.2 — `app/admin/show/[slug]/CrewPageLink.tsx:25` is a same-family defect |
| Three WCAG 2.5.3 failures inside the family are fixed; a repo-wide 2.5.3 audit is not | §2.2, §9 |
| Only empty-`alt` is unreachable by construction; empty `title`, `displayTitle`, and `label` ARE reachable and each gets a boundary test | §5 and §7 — `alt` is defaulted upstream at `components/admin/wizard/step3ReviewSections.tsx:3663`; `label` reaches the anchor through the exported `Step3SectionChromeContext` (`components/admin/wizard/step3ReviewSections.tsx:551`) |

## 1.2 Census (verified 2026-07-25 against `b449656`)

**Count `_blank` as a value, not `target="_blank"` as an attribute literal.** The literal-attribute grep finds 18 anchors in 12 files under `components/`; the true family is **23 anchors in 17 files** across both trees:

```
grep -rn '_blank' components/ app/ | wc -l     # 23
grep -rl '_blank' components/ app/ | wc -l     # 17
```

Two reasons the narrow count undercounts:

1. **Conditional spreads** (4 anchors) apply the attribute through a spread, so no literal appears:
   ```tsx
   {...(action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
   ```
2. **`app/` is in the family** (1 anchor). `app/admin/show/[slug]/CrewPageLink.tsx:25` is shipped, and its `aria-label` at `app/admin/show/[slug]/CrewPageLink.tsx:27` carries no announcement. A guard scoped to `components/` could never catch an app-level regression.

**23 anchors total = 2 that already announce + 21 to fix.** Both numbers appear throughout this spec and they are not in conflict: 23 is the family size, 21 is the fix count. After implementation the split reads 15 `NewTabHint` render sites plus 8 `aria-label` sites (the 6 Group B labels plus the 2 pre-existing ones), which also sums to 23. An independent mechanical scan reconciled to the same figures. Other external-navigation vectors, checked and absent: no `window.open(...)`, no form `target` attributes, no `<Link target=...>` in either tree. `app/` holds 13 `.mdx` files; none currently contains `_blank`, but §6 covers them so a future one cannot slip in.

### 1.3 Composition changed under a rebase; the totals did not

Rebasing onto 82 upstream commits swapped one family member for another, and the guard caught it. `components/admin/showpage/AttentionMenu.tsx` no longer renders an action anchor at all (upstream turned that menu into a jump-only index, so the row's exit moved to the card), which removes it from Group C. In the same window `components/admin/review/AttentionBanner.tsx` gained a NEW external anchor: a "Google Sheets" destination chip for clearing-needs-you alerts. It arrived unannounced and the per-anchor guard failed on it immediately, which is precisely the fail-by-default behavior §6 exists to provide.

Net effect: still 23 anchors, 15 hint sites, 13 phrase literals; Group C is now the banner's footer action, the banner's destination chip, `BellPanel`, and `HealthAlertsPanel`. **Do not treat the unchanged totals as evidence nothing moved** — re-derive the composition from the guard rather than from this document if the branch is rebased again.

## 2. Decision: mechanism is per-site, because the two mechanisms do not compose

`aria-label` **replaces** an element's accessible name — verified empirically against the installed accessible-name implementations, not assumed from spec text. An appended `sr-only` span is therefore silently ignored on any element that already has an `aria-label`:

| Site already has `aria-label`? | Mechanism |
| --- | --- |
| Yes | Extend the label string with ` (opens in a new tab)`. Do NOT add a span; it would be dead markup. |
| No | Append a real space text node then the `NewTabHint` element, leaving visible text as the name base. |

**Why not convert everything to `aria-label`:** it duplicates visible copy into a second string that drifts, and it re-opens WCAG 2.5.3 at every site. **Why not convert the two existing sites to the span:** their labels name a destination the visible text does not, and downgrading them would lose information.

### 2.1 NewTabHint primitive

A new component at `components/shared/` (planned file, no citation available yet) exporting `NewTabHint`, whose entire body renders one visually-hidden span containing exactly `(opens in a new tab)`:

```tsx
export function NewTabHint(): JSX.Element {
  return <span className="sr-only">(opens in a new tab)</span>;
}
```

Its doc comment MUST NOT repeat the parenthesized copy string (a lexical census would count the comment) and MUST NOT contain an em dash (`DESIGN.md:350` bans them in copy, and `scripts/spec-lint.ts` scans code blocks). It is deliberately not a wrapper around `<a>`: the 21 sites have divergent class strings, testids, and conditional props, so a wrapper would force a 21-site refactor instead of a one-line addition.

### 2.2 Three pre-existing WCAG 2.5.3 failures get fixed, not preserved

WCAG 2.5.3 Label in Name (Level A) requires the accessible name to contain the visually presented text. Three family anchors fail today, and R1's append-only rule would have locked all three in:

| Site | Visible text | Current `aria-label` | Contains it? |
| --- | --- | --- | --- |
| `components/admin/wizard/step3ReviewSections.tsx:934` | `In sheet` at `components/admin/wizard/step3ReviewSections.tsx:937` | `Open the source sheet for ${label}` | No |
| `components/crew/primitives/SourceLink.tsx:71` | `In sheet` at `components/crew/primitives/SourceLink.tsx:75` | `View this section in the source sheet` | No |
| `components/admin/wizard/VenueMapTile.tsx:138` | `Directions` at `components/admin/wizard/VenueMapTile.tsx:125` | `Open the venue in Google Maps (opens in a new tab)` | No |

The third is one of the two sites §2 otherwise preserves: it announces correctly but still fails 2.5.3. Its `Directions` span at `components/admin/wizard/VenueMapTile.tsx:120` is **not** `aria-hidden`; the comment at `components/admin/wizard/VenueMapTile.tsx:141` calling the inner visual decorative does not remove the visible-label requirement. `SourceLink` is crew-facing, so it is the highest-impact of the three.

**Decision: fix all three while editing these exact lines.** Leaving a Level-A failure on a line this spec is already rewriting, in a change whose subject is the accessible naming of external links, is not defensible. New labels contain the visible words AND keep the destination information. **Comma separators, never em dashes** (`DESIGN.md:350`):

- `components/admin/wizard/step3ReviewSections.tsx:934` → `` `In sheet, open the source sheet for ${label} (opens in a new tab)` ``
- `components/crew/primitives/SourceLink.tsx:71` → `In sheet, view this section in the source sheet (opens in a new tab)`
- `components/admin/wizard/VenueMapTile.tsx:138` → `Directions, open the venue in Google Maps (opens in a new tab)`

Visible text is untouched at all three; only labels change.

## 3. Exact copy

`(opens in a new tab)` — matching both shipped sites verbatim. Any new phrasing would make the codebase inconsistent with itself and defeat the §6 census.

### 3.1 The separator must be a real sibling space text node (MANDATORY)

```tsx
{label}<span className="sr-only"> (opens in a new tab)</span>   // WRONG: "Open in Sheet(opens in a new tab)"
{label} <NewTabHint />                                          // correct
{label}{" "}<NewTabHint />                                      // correct, equivalent
```

**Why, stated accurately:** this is a property of the `dom-accessibility-api` implementations Testing Library uses, **not** normative AccName 1.2 — that standard's text-node step returns textual contents and does not say each node is individually trimmed, and real browsers may insert the separator themselves. The repo has **two** installed versions (`pnpm-lock.yaml` resolves `dom-accessibility-api` 0.5.16 for `@testing-library/dom` and 0.6.3 for `@testing-library/jest-dom`, which backs `toHaveAccessibleName`); both were probed and both drop a space written inside the span while retaining a sibling space. The prescription stands regardless: we cannot depend on non-uniform behavior across two harness versions and several browser accessibility engines.

**Not a same-line rule.** Prettier compiles a literal JSX space and `{" "}` to the same `" "` child, and preserves the separator as `{" "}` when it wraps. The load-bearing requirement is that a real sibling space text node exists.

**A space adjacent to a line break is not a separator at all.** JSX deletes a whitespace run once it contains a line terminator, so `Go \n<NewTabHint />` renders `Go(opens in a new tab)` — the space does **not** survive, and neither does any run built from `\r`, U+2028, or U+2029. Across a line break the separator must be the explicit `{" "}` form. The guard models this over all four terminators; modelling it with `\n` alone read three of them as same-line spaces and passed the very shape §3.1 exists to reject.

This shape shipped undetected here once, as `View details<span className="sr-only"> for …</span>` reading `"detailsfor …"`, because tests matched substrings and never the boundary. Hence §7's anchored assertions.

## 4. Site inventory and disposition

### Group A — no `aria-label`; append a space plus the NewTabHint element (11 anchors)

| Site | Visible label |
| --- | --- |
| `components/admin/PerShowActionableWarnings.tsx:279` | `Open in Sheet ↗` |
| `components/admin/NoteWarningCard.tsx:83` | `Open in Sheet ↗` |
| `components/admin/wizard/step3ReviewSections.tsx:2964` | `Open in Sheet ↗` |
| `components/admin/wizard/step3ReviewSections.tsx:3188` | `Open PDF ↗` |
| `components/admin/wizard/step3ReviewSections.tsx:3386` | `Open the source sheet ↗` |
| `components/admin/wizard/step3ReviewSections.tsx:3684` | `Open diagrams folder in Drive` plus icon |
| `components/admin/settings/DriveConnectionPanel.tsx:242` | `Open folder` plus icon |
| `components/admin/wizard/Step2Verify.tsx:500` | `Open the folder →` |
| `components/admin/wizard/Step2Verify.tsx:550` | `Open the folder →` (second instance) |
| `components/crew/sections/VenueSection.tsx:249` | `Open in Maps` (crew-facing) |
| `components/shared/ReportModal.tsx:581` | `View on GitHub` |

`components/crew/sections/VenueSection.tsx:250` carries `rel="noreferrer"` without `noopener`; normalize it to `rel="noopener noreferrer"` since the anchor is being edited anyway.

**Two Group A anchors also need their decorative arrow hidden.** `components/admin/wizard/Step2Verify.tsx:504` and `components/admin/wizard/Step2Verify.tsx:554` render `Open the folder →` where the `→` is a **plain text node, not `aria-hidden`** — unlike the five sibling sites that wrap their glyph (`components/admin/PerShowActionableWarnings.tsx:283`, `components/admin/NoteWarningCard.tsx:88`, and three in `components/admin/wizard/step3ReviewSections.tsx`). So a screen reader announces the arrow today, and without a change the expected name would be `Open the folder → (opens in a new tab)`, baking a decorative glyph into the very name this diff curates. Wrap both arrows in `aria-hidden="true"`: no visible change, one attribute, on lines already being edited, and it makes the family internally consistent. Expected names become `Open the folder (opens in a new tab)`.

Checked the boundary rather than assuming: `app/admin/show/[slug]/CrewPageLink.tsx:30` has the same arrow but carries an `aria-label`, so its content is ignored; the other bare-arrow sites (`components/admin/HoverHelp.tsx:609`, `components/admin/HelpAffordance.tsx:113`, both "Learn more →") are internal links and outside this family.

### Group B — has `aria-label`; extend the label string (6 anchors)

| Site | Becomes |
| --- | --- |
| `components/admin/showpage/PublishedReviewModal.tsx:708` | `` `Open the source sheet for ${displayTitle} in Google Sheets (opens in a new tab)` `` (and the empty-`displayTitle` fallback keeps the destination clause) |
| `components/admin/wizard/Step3ReviewModal.tsx:408` | `` `Open the source sheet for ${title} in Google Sheets (opens in a new tab)` `` |
| `components/admin/wizard/step3ReviewSections.tsx:934` | §2.2 rewrite (label-in-name plus announcement) |
| `components/admin/wizard/step3ReviewSections.tsx:3577` | `` `${alt} (opens in a new tab)` `` |
| `components/crew/primitives/SourceLink.tsx:71` | §2.2 rewrite (label-in-name plus announcement) |
| `app/admin/show/[slug]/CrewPageLink.tsx:27` | `Open crew page (opens in a new tab)`; also normalize `rel` at `app/admin/show/[slug]/CrewPageLink.tsx:26` |

Plus the §2.2 label-in-name-only fix at `components/admin/wizard/VenueMapTile.tsx:138`, which already announces.

`components/admin/wizard/step3ReviewSections.tsx:3577` is a deliberate nameless-link guard (WCAG 2.4.4 and 4.1.2) on a staged-diagram image link named by its `alt`. Appending the phrase preserves that guard, so it is not exempt.

### Group C — dynamic spread; announcement must be conditional (4 anchors)

Three of the four share one shape: no `aria-label`, `{action.label}`, and a `↗` already gated on the external flag. The fourth is the banner's destination chip, whose visible text is the STATIC string `Google Sheets` (`components/admin/review/AttentionBanner.tsx:170`), so its computed name is `Google Sheets (opens in a new tab)`. It is gated identically; only the label source differs.

**Corrected after the rebase (see §1.3):** `AttentionMenu` LEFT the family — upstream turned it
into a jump-only index with no action anchor — and `AttentionBanner` gained a second one, its
"Google Sheets" destination chip for clearing-needs-you alerts. The four gated anchors are
therefore two in `AttentionBanner` plus one each in `BellPanel` and `HealthAlertsPanel`. An
independent AST census confirms exactly that set.

| Site | Gating expression | Visible label |
| --- | --- | --- |
| `components/admin/review/AttentionBanner.tsx:165` (footer action) | `a.action.external` | `{a.action.label}` |
| `components/admin/review/AttentionBanner.tsx:172` (destination chip) | `a.action.external` | static `Google Sheets` |
| `components/admin/BellPanel.tsx:304` | `action.external` | `{action.label}` |
| `components/admin/telemetry/HealthAlertsPanel.tsx:149` | `action.external` | `{action.label}` |

Note the gating expressions are **not** textually identical: `AttentionBanner` reads `a.action.external` while the other three read `action.external`. §6 requirement **5** is therefore expressed as equality against the anchor's own effective `_blank` predicate, never identifier overlap. (Requirement 4 governs the announcement mechanisms themselves.)

**The hint MUST be gated on the same condition as the `↗` and the `target`.** `AlertActionLink` is `{ label: string; href: string; external: boolean }` (`lib/adminAlerts/alertActions.ts:39`), and every `external: false` builder returns a **same-app** href: fragments at `lib/adminAlerts/alertActions.ts:61` and `lib/adminAlerts/alertActions.ts:90`, and a plain route (`/admin/onboarding`) at `lib/adminAlerts/alertActions.ts:127`. Not all are fragments, but none opens a tab, so announcing one would be a false statement to exactly the users who cannot see that it did not happen.

```tsx
{action.label}
{action.external ? <span aria-hidden="true"> ↗</span> : null}
{action.external ? <> <NewTabHint /></> : null}
```

## 5. Guard conditions

| Input state | Behavior |
| --- | --- |
| `action.external === false` (Group C) | No hint, no `↗`, no `target` |
| `href` null or absent | Anchor is not rendered today (`href ? (…) : null`); unchanged, so no hint on a non-link |
| Empty `${title}` at `components/admin/wizard/Step3ReviewModal.tsx:408` | Destination clause must survive: `Open the source sheet (opens in a new tab)`, never `for  (` with a double space. Reachable from a render seam, so §7 tests it |
| Empty `${displayTitle}` at `components/admin/showpage/PublishedReviewModal.tsx:708` | **Reachable, and needs its own test.** `displayTitle` is `title \|\| slug` at `components/admin/showpage/PublishedReviewModal.tsx:241`, and the fixture helper accepts arbitrary prop overrides, so `{ title: "", slug: "" }` renders the anchor with an empty interpolation while `openSheetHref` stays populated. Same rule as `title`; §7 tests it separately rather than assuming `title`'s case covers it |
| Empty `alt` at `components/admin/wizard/step3ReviewSections.tsx:3577` | **Unreachable by construction.** `components/admin/wizard/step3ReviewSections.tsx:3663` defaults it (`alt={stub.alt?.trim() \|\| ...}`), so a blank alt never reaches the anchor. No anchor-level fallback is added; §7 asserts the upstream default instead of a fallback that could never fire |
| Empty `${label}` at `components/admin/wizard/step3ReviewSections.tsx:934` | **Reachable — the R3 "unreachable by construction" claim was wrong.** `Step3SectionChromeContext` is exported at `components/admin/wizard/step3ReviewSections.tsx:551` and consumed at `components/admin/wizard/step3ReviewSections.tsx:996`, and existing tests already provide arbitrary context values through it (`tests/components/admin/anchorMount.test.tsx:39`). `label` accepts any string, so `label: ""` renders the anchor with an empty interpolation, no cast or source change required. Same rule as `title`; §7 tests it |
| `action.label` empty (Group C) | Anchor is already effectively nameless today; the hint renders, and the test records the pre-existing gap rather than masking it |
| A site gains `aria-label` later | Mechanism flips per §2; §6 accepts either form, so it cannot regress to neither |

## 5.1 Dimensional Invariants

**None — this diff creates no parent-to-child dimension relationship.** Justification, since the project rule requires an explicit statement rather than silence.

The diff adds two kinds of element. First, the visually-hidden hint span. The `sr-only` utility is clip-based (absolute, 1px, `clip-path`), not `display: none`, so it contributes **zero** layout size and cannot change any parent's content box, flex distribution, or wrap behavior. No fixed-height or fixed-width parent gains a child.

Second — and this is why the R4 rationale needed widening — the arrow fix at `components/admin/wizard/Step2Verify.tsx:504` and `components/admin/wizard/Step2Verify.tsx:554` wraps two **currently bare text glyphs** in `<span aria-hidden="true">`. Those spans are visible, so unlike the hint they do create inline boxes. **Correction (impeccable gate, measured):** this is FALSE in a flex parent. Both Step2Verify anchors are gap-less `inline-flex`, so wrapping the glyph turns it into its own flex item and the preceding text run's trailing space is trimmed — a measured 4.05px loss at 16px in Chromium (134.08px to 130.03px), with the arrow visually touching the preceding letter. jsdom cannot see this. The fix is a non-breaking space INSIDE the aria-hidden span (`Open the folder<span aria-hidden="true">&nbsp;→</span>`), which restores the original width and, because the span is aria-hidden, leaves the accessible name untouched. The hint span itself IS dimensionally inert (absolutely positioned, so never a flex item — verified identical `getBoundingClientRect` to 3dp at 320px and 390px, including inside `gap-*` and `truncate` parents). Nothing here is a fixed-dimension parent gaining a sized child, which is the condition the project rule targets.

The Group B and §2.2 changes are string-only. Therefore no real-browser layout assertion is warranted, and §7 explains why jsdom suffices.

## 5.2 Transition Inventory

**None — no visual state changes.** The hint is static from first render, has no enter or exit, no hover, focus, or open state, and no animation. Group C's conditional render is driven by a per-alert data flag (`action.external`), not by an interactive state transition, so there is no pair to enumerate: an anchor's `external` value does not change while mounted. Nothing in this diff touches an `AnimatePresence`, a ternary render of competing visual states, or a `transition-*` utility.

## 6. Structural guard: a per-anchor SHAPE ALLOWLIST (amended R4)

**AMENDMENT (2026-07-25, ratified here per invariant 7).** This section previously specified a
leak-hunting guard: recognize every conditional/spread form, resolve identifiers, and prove an
anchor unannounced. Whole-diff reviews R1, R2 and R3 each found a NEW fail-open shape under
that model — nested spreads, computed keys, shadowed identifiers and parameters,
spread-supplied `aria-label`, spread-supplied `hidden`, partially-exhaustive ternaries, plus
(R4) case-insensitive `_BLANK`, template-valued targets, and hints passed as props. That is not
a run of bugs; a static pass cannot soundly resolve arbitrary TSX, so "prove it is broken"
leaks by construction. `docs/agents/spec-self-review.md:22` caps iteration on a surviving
vector at three rounds.

**The guard is therefore INVERTED and this spec now requires the inverted form.** Implemented in
`tests/styles/_newTabScan.ts`, driven by `tests/styles/_metaNewTabAnnouncement.test.ts`.

### 6.1 Candidate discovery

Filesystem-walk `components/**/*.tsx` and `app/**/*.tsx` (never a hard-coded list). An `<a>` or
`<Link>` is a CANDIDATE if it carries a `target` attribute or ANY spread attribute; without
either it cannot become external and is skipped. `.mdx` **is compiled and then scanned by the same pass** — it does NOT get a separate lexical rule.
`compileMdxToJsx()` runs `@mdx-js/mdx` with `jsx: true` and hands the result to `scanSource`, so MDX
and TSX share one enforcement path. Four earlier rounds of hand-written lexical rules each produced
a new defect (§6.4), which is why the model changed. The compiled module is walked in full, so an
anchor bound to an `export const`, returned from an exported function, or handed to a custom
component is classified too. The live test asserts each file compiles to real JSX before scanning
it, so an empty compile cannot make the guard pass for the wrong reason. **Props injected through
MDX's runtime components map are outside any per-file scan**, so a separate test pins that
`mdx-components.tsx` declares no anchor override and injects no `target`.

### 6.2 Approved shapes (everything else is a finding)

1. **Literal** — `target="_blank"` (ASCII case-insensitive per the HTML spec) with NO spread
   attribute on the element.
2. **Gated** — no `target` attribute, and exactly ONE spread of the form
   `{...(COND ? { target: "_blank", rel: "…" } : {})}` where both branches are inline object
   literals whose properties are decidable literals drawn only from `{ target, rel }`.

The `{ target, rel }` prop allowlist is derived from the tree, not guessed: all four gated
spreads carry exactly `{ target: "_blank", rel: "noopener noreferrer" }` and nothing else, and neither
`referrerPolicy` nor `download` appears on any anchor in the codebase. If a future anchor
legitimately needs another prop, widen `SPREADABLE` in the scanner along with a self-test —
do not weaken the allowlist to "any literal-valued prop", which is precisely the rule that let a
spread smuggle in `aria-labelledby` / `aria-hidden` / `className` (review R4 BLOCKING 2).

A value is decidable only if it is a string literal or a no-substitution template; a template
WITH substitutions is not. Anything outside these shapes is reported as
`unrecognized external-link shape (<why>)`.

### 6.3 Announcement verification for an approved shape

- An element carrying `aria-label` or `aria-labelledby` must announce IN THAT LABEL; a
  `NewTabHint` child is inert beneath a naming override. The label's non-phrase remainder,
  after stripping punctuation, must be non-empty, and a substitution only supplies a
  destination when the enclosing conditional's own test guards it non-empty.
- Otherwise a `NewTabHint` must be present in CHILD position (not passed as a prop), preceded by
  a real sibling space (JSX whitespace-stripping modelled), not hidden by `aria-hidden`, the
  native `hidden` attribute, or a hiding class, and not beneath any element whose attributes
  cannot be proven non-hiding (a spread, an undecidable `className`/`style`, or its own
  `aria-label`/`aria-labelledby`). A `role` counts as a naming override ONLY when it is not
  `presentation`, `none`, `group`, or `generic`: those four do not rename their subtree, and the
  installed accessible-name implementation computes `Go (opens in a new tab)` through each, so
  rejecting them was pure developer friction (review R5 LOW 6).
- **Gated** anchors require the hint under a condition whole-expression-equal to the effective
  `_blank` predicate, with branch polarity computed rather than compared textually.
- **Literal** anchors require an UNCONDITIONAL hint. Proving an arbitrary conditional chain
  exhaustive is undecidable (R3 defeated a both-branches heuristic with
  `e ? ready && <Hint/> : <Hint/>`), so the approved shape avoids the question.
- One inline `// no-newtab-announcement: <reason>` comment exempts exactly ONE candidate — the
  next one it precedes, compliant or not — and requires a non-empty reason. The ship-time
  exemption count is zero.
- A comment-stripped copy census pins the FILE SET carrying the phrase (not an occurrence
  count, which goes stale as fallbacks are added), stripped via the TypeScript scanner rather
  than regexes.
- Synthetic scanner self-tests are MANDATORY, one per accept/reject branch, because the live
  tree exercises only the two shipped shapes.

### 6.4 Accepted limits (ratified, not oversights)

- **A correct-but-unusual shape is reported**, e.g. an announcing `aria-label` arriving through
  a spread. The author moves to an approved shape or adds a reasoned exemption. A false positive
  costs one comment; a false negative ships a silent link.
- **No MDX component map injects `target`, verified.** MDX resolves intrinsic tags through a
  components map, so an anchor override there could make every help-page link external with nothing
  per-file to inspect. Checked 2026-07-25: `mdx-components.tsx` is 34 lines and defines no anchor override, no `target`, and no `Link` — so the compiled-per-file scan is complete for this tree.
  The compiled output routes intrinsic tags as `_components.a`, whose last segment is `a`, so the
  existing link-tag rule classifies them without special-casing. Re-check this file if a components
  map ever gains an anchor override.
- **Non-JSX anchor construction is out of scope, and verified absent.** The scanner walks JSX
  elements, so `React.createElement("a", { target: "_blank" })` and an anchor injected through
  `dangerouslySetInnerHTML` are invisible to it. Verified 2026-07-25 against the live tree: the only
  `createElement` call is `document.createElement("div")` for a portal container
  (`components/admin/FinalizeButton.tsx:636`), and the only `dangerouslySetInnerHTML` is the
  no-FOUC theme script in `app/layout.tsx:59`. Neither creates a link. A tag held in a variable
  (`const T = "a"`) and a namespaced tag (`<svg:a>`) ARE both classified, because the explicit
  `target` attribute rule does not depend on the tag name.
- **Document-level `<base target="_blank">` is out of scope.** It would make every relative
  anchor external without any per-anchor syntax to inspect. None exists in the tree; a lexical
  assertion that none is introduced is tracked in `DEFERRED.md`.
- **Expression IDENTITY is also a narrow subset.** Proving a guard non-empties its OWN
  substitution (`title.trim() ? ` + "`${title.trim()} …`" + `) needs the two expressions to be the SAME
  one. That comparison accepts only: an identifier, a property access (recording optional-chain),
  an element access with a literal or identifier key, a ZERO-ARGUMENT call over any of those, and
  `!` over any of them. An earlier version serialized arbitrary expressions and fell back to
  whitespace-stripped source text for anything unsupported, which erased token boundaries and
  collided genuinely different expressions: `new F()` with `newF()`, `await x` with `awaitx`,
  `typeof x` with `typeofx`, `x as string` with `xasstring`, a one-space template with an empty
  one, and any two literals differing only by an internal space (`get(/a b/)` with `get(/ab/)`).
  It also dropped optional-chain tokens and call type arguments, colliding `obj?.[key]` with
  `obj[key]`, `fn?.()` with `fn()`, and `fn<T>()` with `fn()`. R7 gave a witness for each where
  the substitution evaluated to `""` and the computed name was the bare phrase. A partial
  serializer over a full grammar cannot be made injective by adding cases, so the subset is
  explicit and everything outside it fails closed. All shipped labels are inside it.
- **The candidate-admission net for TSX tests raw text AND a comment-stripped copy, and the union
  decides.** A raw-text-only regex missed a comment between `target` and its `=`, and between a
  spread's brace and its dots. Stripping alone would be unsafe, so the union is used: it can only
  admit MORE, which is the fail-closed direction. `target` matching is case-INSENSITIVE, since HTML
  attribute names are and React emits `TARGET={x}` with a warning rather than dropping it. This net
  applies to TSX only; MDX no longer has a lexical net at all.
- **Attribute NAMES are matched ASCII-lowercased; VALUES keep their case.** HTML attribute names
  are case-insensitive and React forwards an unknown casing to the DOM with only a dev warning, so
  `TARGET="_blank"` opens a tab and `ARIA-HIDDEN="true"` really hides. The candidate net was
  case-insensitive while the classifier compared names verbatim, so all 63 non-lowercase spellings
  of `target` were admitted and then skipped with zero anchors and zero violations (review R8
  BLOCKING 1). One camelCase literal survived the first sweep and silently reopened the
  dynamic-`className` hole, which is why the property is now guaranteed BEHAVIOURALLY (see the
  closed-list sweep below) rather than by a literal scan. The literal tripwire still runs, but as a
  secondary accident-catcher only — earlier revisions of this section presented it as the guarantee,
  and R19 showed a source scan cannot be one.
- **A link candidate is a known link tag (including a member expression whose last segment is one,
  `UI.Link`), OR any element with an explicit `target` attribute, OR any element with `href` plus a
  spread.** Tag membership alone missed `<Tags.External href="x" target="_blank">`, which React
  renders as a real anchor named only "Go" (review R8 BLOCKING 2). Requiring `target` AND `href`
  then missed `<Foo target="_blank" {...spreadHref}>` and `<RouterLink href="x" {...spreadTarget}>`
  (review R9 BLOCKING 1).

  **This reverses an earlier decision, deliberately.** R8's resolution kept `<Tabs target="_blank" />`
  unclassified, on the reasoning that a non-URL `target` prop selects a tab rather than a window.
  R9 showed the price: an explicit `target` whose `href` arrives by spread was skipped entirely.
  The tie goes to failing CLOSED, so an explicit `target` is always classified; R9's census confirms
  no live component carries `target` without `href`, and a genuine non-URL `target` prop costs one
  exemption comment. A spread-only element with neither attribute is still not a candidate, which
  is what keeps every `<div {...props}>` out. Residue, accepted: an unknown tag where BOTH `href`
  and `target` arrive inside one unresolvable spread.
- **MDX is COMPILED and scanned, not lexed.** Four rounds went into hand-written lexical rules for
  MDX and each produced a new defect: a bare `target\s*=` matched prose and autolink query strings
  (R8); a character class excluding angle brackets ended the tag at any inner `>` (R9); then a
  quote-and-brace scanner miscounted braces inside regex literals, treated fenced code as live JSX,
  and ran past a quoted attribute ending in a backslash (R10, three separate findings). A lexer for
  a real grammar is the wrong model. `.mdx` sources now go through `@mdx-js/mdx` (already a repo
  devDependency) with `jsx: true`, and the compiled JSX is handed to the SAME `scanSource` used for
  TSX. Prose and fenced code become string literals; regex literals, escapes and attribute quoting
  become the compiler's problem. **MDX and TSX are one enforcement path now, not two**, which is
  what removes the class rather than the instance.
- **Runtime-transparent wrappers are stripped; non-transparent ones stay residue.** Stripped:
  parentheses, `as`, `satisfies`, non-null `!`, type assertions (including `as unknown as T` chains,
  which unwrap repeatedly), and comma expressions — a comma expression evaluates to its LAST operand,
  so `{...(0, {href, target})}` really forwards the object. Stripping only parentheses left every
  other form invisible (review R12 BLOCKING 1; the comma case was probed from R13's brief). NOT
  stripped, deliberately: an IIFE is a call and an `await` is a promise, so neither is statically
  resolvable and treating them as transparent would be false confidence rather than coverage. Both
  halves are pinned, so a later round neither reads the IIFE silence as a hole nor "fixes" it into
  unsoundness.
- **The duplicate-fold rule applies to INTRINSIC tags only, folds ASCII only, and runs after the
  not-external return.** Props on a custom component are ordinary JavaScript keys and
  case-sensitive, so `<UI.Link Mode mode>` is two distinct props; `toLowerCase()` also folds
  Unicode, which rejected distinct `Σ` and `σ`; and running before the early return dragged
  internal anchors in as external violations (review R12 MEDIUM 4). A guard that cries wolf gets
  deleted, so its false-positive surface is a defect and not a conservative virtue.
- **Comment stripping is parse-informed, because a token scan alone truncates files.**
  `ts.createScanner().scan()` cannot know a `/` begins a regex without the parser's rescan, so a
  VALID regex containing comment bytes (`/[/*]/`, `/a\/*b/`) was read as a block-comment start and
  everything after it was DISCARDED — every consumer silently saw a fragment (review R13 HIGH 3).
  The parse now supplies literal ranges (string, template parts, regex, JSX text) and a lexical pass
  blanks only comment starts outside them. Comments become spaces rather than being deleted, so byte
  offsets and line numbers stay valid for callers that report positions.
- **Casing coverage is BEHAVIOURAL and reads no source. AMENDED at R19 — this supersedes the
  semantic-position rule this section previously ratified.** Four source-reading models were tried
  and each failed: accessor-name scoping (evaded five ways, R12), a blanket literal walk (false
  positives on type positions and enum members, R13), regex over reading forms (`.includes` invisible,
  R18), and literal shape (a regex literal, an unquoted property key, and reusing an excluded
  spelling all invisible, R19). Every one of those had to enumerate something — positions, forms, or
  node kinds — and the enumeration is what kept losing.

  The guarantee is therefore measured at the output, not inferred from the source. The set of
  attributes that can affect a computed accessible name is closed and **externally** defined (HTML
  global attributes, `<a>` attributes, `role`, every ARIA state/property, and the JSX aliases
  `className` / `htmlFor`). For each, scanning the same fixture with the name spelled in a different
  case must produce the same verdict, in **both polarities** — a violating base and an announcing
  base — because an announcing-only base cannot observe a read that SUPPRESSES a violation. No
  reading form can evade this, because the source is never consulted; an attribute outside the closed
  list behaves identically in either spelling, because HTML attribute names are ASCII
  case-insensitive, so casing cannot be the defect there. (Not the stronger claim that it cannot
  affect the name at all -- see the narrowing two bullets below.)

  The hand-built per-attribute fixtures remain, because they prove the specific behaviour each
  attribute drives (a hidden hint, a naming override, a stripped separator) which a same-verdict
  sweep cannot. The sweep proves coverage; the fixtures prove meaning. A meta-assertion requires
  every fixture attribute to appear in the closed list, so the sweep cannot silently skip one.

- **The casing sweep varies attribute NAMES, not attribute VALUES, and that boundary is
  deliberate.** Attribute names are ASCII case-insensitive in HTML, so a case-sensitive name read
  is unambiguously a defect. Values are not uniform: a `className` token is genuinely
  case-sensitive (`HIDDEN` is a different CSS class from `hidden`), so folding it would be wrong.
  The one place a value comparison could be argued is `aria-hidden="FALSE"`, which the scanner
  treats as hidden because it only exempts the exact literal `false`
  (`tests/styles/_newTabScan.ts:435` and `tests/styles/_newTabScan.ts:439`). That direction FAILS CLOSED — an invalid ARIA token
  produces a report, not a silent pass — so the conservative reading costs a possible false
  positive and never a missed announcement. Value-casing is therefore out of scope for the sweep,
  stated here rather than left to look like an oversight.

- **The destination rule reports only when the anchor is PROVABLY label-less, and its residual
  risk is one undecidable case.** An external link whose accessible name is the announcement alone
  (`<span aria-hidden="true">Go</span> <NewTabHint />` computes to `"(opens in a new tab)"`) is
  reported. Three defects were found in this rule by probing it after writing it, and all three were
  the same mistake — a DECIDABLE case sitting in the undecidable bucket:

  | Wrongly treated as opaque | Reality |
  | --- | --- |
  | a component child (`<Label />`) and `<img alt="Go" />` | both contribute a name; the rule required literal TEXT |
  | a fragment (`<>Go</>`) | walked as an element and rejected by the `isJsxElement` guard |
  | `{" "}`, `{null}`, `{false}`, `{undefined}` | literals contribute nothing, yet counted as a destination |

  **The tag-based half was replaced rather than extended, per the trigger stated below.** After R22
  added `<template>`, probing found five more of the same shape — `<dialog>`, `<script>`, `<style>`,
  `<noscript>`, `<datalist>`. Enumerating them one finding at a time is the losing pattern this guard
  has already hit four times, so the rule now names the HTML Standard's own categories: content that
  is **never rendered** (script-supporting and metadata elements) and elements **not shown unless
  `open`** (`<details>`, `<dialog>`). Metadata elements are deliberately excluded from the first set:
  none is valid inside an `<a>`, and `title` and `style` are also real attribute names, so listing
  them as tag names made the guard's own classification ambiguous — which its anti-silencing
  assertion caught.

  After those, the undecidable bucket holds exactly one thing: **a genuinely dynamic expression that
  renders nothing at runtime** (`{maybeLabel}` where the value is `""`). That is assumed to carry a
  destination, deliberately — failing closed there would report every `{label}` anchor in the tree,
  which is most of them. So this rule fails OPEN on dynamic content by design and CLOSED on
  everything statically decidable. Further refinement of the decidable side is not expected; if a
  fourth defect appears there, the shape list is the thing to replace, not extend.

  **The closed list is closed for CASING, not for hiding — narrowed at R21.** The original wording
  claimed an attribute outside the list "cannot change an accessible name", and that is too strong.
  `data-*` is an open-ended family, and a CSS rule such as `[data-state="closed"] { display: none }`
  hides a subtree through an attribute no enumeration can predict (review R21 BLOCKING 3). What is
  actually true, and all the sweep needs, is narrower: **HTML attribute names are ASCII
  case-insensitive, so `DATA-STATE` and `data-state` produce identical DOM and match the same
  selector.** R21's own witness confirms it — both spellings gave the same result. Casing therefore
  cannot be the defect for any attribute outside the list, which is exactly the property the sweep
  asserts.

  **Separately, CSS-driven hiding is an accepted limit.** The scanner recognises `hidden`,
  `aria-hidden`, `inert`, a closed `<details>`, hiding `class`/`className` tokens, and inline
  `display:none` / `visibility:hidden`. It does NOT read the repo's stylesheets, so a rule keyed on a
  `data-*` attribute, or any selector-driven hide, is invisible to it. Making that visible would mean
  embedding a CSS engine and resolving cascade order, which is a different tool. No live anchor uses
  a `data-*` hide; the risk is a future one, and it is recorded here rather than left to look
  handled. `open` on `<details>` was a genuine omission and is now handled — note it is the only
  hiding condition here expressed by an attribute's ABSENCE, which is why a presence-scanning loop
  could not have found it.

  **Value CONTENT is a different question, and it IS in scope.** Pinning every fixture to one
  neutral value made the sweep vacuous for any read gated on the value: a case-sensitive `class`
  read firing only when the value contains `hidden` agreed across both spellings, because a neutral
  value never contains it, while real markup diverged and a hidden announcement was accepted
  (review R20 HIGH 1). The sweep therefore crosses each name with the values that reach the
  scanner's value-dependent branches — a neutral value, the `class`/`className` `hidden` token,
  `true`, the `aria-hidden="false"` exemption, a style object, a style string — plus the bare
  valueless form boolean attributes take. Not varying the value is not the same as values not
  mattering, and that distinction is what the first version of this sweep got wrong.

- **The lowercase-name literal tripwire is SECONDARY and is not a completeness proof.** It collects
  name-shaped literals from the AST and flags any non-lowercase spelling of a known attribute name.
  R19 established that source reading cannot be complete here — a regex literal and an unquoted
  property key are both invisible to it — so it exists to catch the ACCIDENT (a camelCase literal
  typed by hand during a sweep, which is how this class recurred once) and must never be cited as
  evidence of coverage. Its exclusion list cannot name any attribute in the closed list, and cannot
  retain an entry that has left the source; both are asserted.
- **The undecidable-computed-key rule guards against accident, not obfuscation.** An expression-built
  `components` key (a template substitution, a concatenation, an `Array.join`) is reported, narrowed
  to keys whose source contains the fragment `compo`. That test is evadable by `String.fromCharCode`
  or an imported constant, and that is accepted: the threat model is an author who does not realise a
  caller-supplied map wins, not one who is hiding it — anyone willing to obfuscate the key can
  equally edit the guard. Flagging every undecidable computed key was tried and reported a legitimate
  dynamic key in `app/admin/settings/roles/RoleMappingRow.tsx`, and a guard that cries wolf gets
  deleted. A genuinely dynamic override gets an explicit allowlist row with a reason.
- **A caller-supplied MDX components map is outside per-file scanning.** `useMDXComponents` spreads
  its argument, so the map's own source cannot prove the runtime map is override-free. Two
  assertions close it together: the map's returned object declares no `a`/`Link` key (parsed, not
  regexed — seven override shapes defeated the regexes, review R12 BLOCKING 2), and no source parses to a
  `components` JSX attribute or object key at all (a regex here missed a spread-wrapped prop, a
  `createElement` call, and `{...props}`, and falsely flagged unrelated `components` props — review
  R13 BLOCKING 2). A caller's `{...props}` remains undecidable residue. Separately neither assertion
  is sufficient; the runtime check on the returned map is the third layer.
- **Duplicate case-folded property names in an approved spread fail closed.** React writes
  `{ target: "_self", TARGET: "_blank" }` to ONE case-insensitive DOM attribute and the LATER value
  wins, so reading the first normalized match took the wrong value in both directions (review R10
  BLOCKING 3). Ambiguity is not resolvable statically, so the shape is reported.
- **A RESOLVABLE inline spread contributes its property names to candidacy.**
  `<Foo {...{href:"x", target:"_blank"}}>` and the conditional form were skipped even though both
  props are statically visible, and a forwarding component renders a real external anchor (review
  R10 BLOCKING 2). The residue is now only an UNRESOLVABLE spread on an unknown tag.
- **Object-literal property names inside an approved spread are lowercased too.** They were
  compared verbatim, so `{ TARGET: "_BLANK", REL: "NoOpener" }` was reported as an unrecognized
  shape: fail-closed, but it contradicts the casing contract and rejects a correctly announced link
  (review R9 MEDIUM 3). The lowercase-literal meta-test was also far too narrow -- it matched only
  variables literally named `n` or `nm` -- and now covers every name accessor and set-membership
  helper.
- **A COMPOUND gating predicate is reported, not compared.** Only an identifier, a
  property-access chain, or `!` applied to either is an approved gate. Deciding whether two
  different compound predicates denote the same runtime condition is not something a static pass
  can do: six review rounds each produced a new pair that a textual normalizer wrongly equated,
  and R6 alone enumerated eleven operator families (`!(e && ready)` vs `!e && ready`,
  `!(x === y)` vs `!x === y`, `!(n > 0)` vs `!n > 0`, nullish, comma, bitwise, `instanceof`,
  conditional, ...), each a state where the tab opens silently. So the question is no longer
  asked. Predicates are compared as AST structural keys, and a compound predicate on either side
  fails closed. All four shipped gated anchors gate on member expressions, so the present cost is
  zero; a future compound gate costs one exemption or a named boolean.
- **An effectful predicate evaluated twice** (`{...(next() ? … )}` with `next()` also gating the
  hint) cannot be proven consistent statically. Textual equality is the guarantee; identity of
  side effects is not. No such predicate exists in the tree, and the approved shapes discourage
  it.

## 7. Tests (TDD per task — failing test first)

Structural coverage proves a token is present, not that the name is right. R2 demonstrated two implementations that satisfy every structural check while producing a broken name, and R1's "one site per group" minimum would have let them survive on nine untested Group A anchors. Therefore:

**AMENDMENT (2026-07-25, ratified here per invariant 7):** the per-anchor behavioral table
below is REDUCED to the load-bearing subset. Cross-model review R2 judged the remaining
fourteen assertions ritual once the guard was corrected, and named three blocks as carrying
real risk: `BellPanel`, `HealthAlertsPanel`, and the exact empty-interpolation outputs. Those
three are implemented; per-anchor announcement PRESENCE is carried structurally by §6, which
fails closed on any shape it cannot verify. What remains required:

- Anchored accessible-name coverage for `AttentionBanner`, `BellPanel` and `HealthAlertsPanel`
  (positive AND `external: false` negative), since the AST rule cannot prove a runtime name.
- Anchored coverage where a fixture already exists: `SourceLink`, `CrewPageLink`,
  `PublishedReviewModal`, `Step3ReviewModal`, `step3ReviewSections`, `VenueMapTile`.
- The three empty-interpolation seams RENDERED, reading the computed accessible name, plus a
  parity guard binding the probe to the shipped `aria-label` expression.

The superseded requirement, kept for provenance:

- ~~**Table-driven anchored accessible-name assertion for ALL 22 anchors**~~ — the 21 being fixed PLUS `components/admin/wizard/VenueMapTile.tsx:138`, whose label §2.2 rewrites. One table, one case per anchor, `expect(link).toHaveAccessibleName(/^…\(opens in a new tab\)$/)` anchored at both ends so the §3.1 separator bug fails. A substring match would pass the buggy `"Open in Sheet(opens in a new tab)"`. `toHaveAccessibleName` is already used at `tests/components/ReSyncButton.test.tsx:418`.

  **VenueMapTile must be in this table, not only in the label-in-name check.** Its existing tests assert href, target, and visual presence but never the accessible name, so a "fix" of `Directions (opens in a new tab)` would satisfy the label-in-name assertion, the §6 remainder guard, and the copy census while silently dropping the Google Maps destination that §2.2 requires it to keep. Only the exact-name case catches that.
- **Group C negative test** (highest-value test in the diff): each of the four renderers with `action.external === false`, asserting the name contains no new-tab phrasing and no `target` is set.
- **Label-in-name assertions for the three §2.2 sites:** accessible name contains the visible string (`In sheet`, `In sheet`, `Directions`). These pin the WCAG fix and fail if someone later "simplifies" a label.
- **Visible-text isolation:** clone the anchor, strip `.sr-only` descendants, assert trimmed `textContent` still equals the intended visible label — catches a "fix" that changed visible copy.
- **Empty-interpolation tests for all THREE reachable seams** (§5): `title` at `components/admin/wizard/Step3ReviewModal.tsx:408`; `displayTitle` via `{ title: "", slug: "" }` at `components/admin/showpage/PublishedReviewModal.tsx:708`; and `label` via a `Step3SectionChromeContext` provider with `label: ""` at `components/admin/wizard/step3ReviewSections.tsx:934`. Each asserts the name keeps its destination clause, contains no double space, **and ends no clause on a dangling connective.** The first two assertions alone are insufficient: `Open the source sheet for (opens in a new tab)` and `In sheet, open the source sheet for (opens in a new tab)` both contain the destination and have no consecutive spaces, yet are exactly the malformed output §5 forbids. Assert the full expected string per seam (anchored equality, as with the 22-case table), not a pair of weaker properties. For `alt` — the one genuinely unreachable case — assert the UPSTREAM default at `components/admin/wizard/step3ReviewSections.tsx:3663` instead; an anchor-level fallback test there would be tautological.
- **NewTabHint unit test:** renders a `sr-only` span whose text is exactly the canonical string.
- **Existing assertions that must be updated** (found by sweeping the test tree for current Group B label literals; each is an exact-label expectation this diff changes): `tests/components/CrewPageLink.test.tsx:36`, `tests/components/crew/sourceLink.test.tsx:51`, `tests/components/admin/showpage/publishedReviewModal.test.tsx:348`, `tests/components/admin/wizard/Step3ReviewModal.test.tsx:271`, `tests/components/admin/wizard/Step3ReviewModal.test.tsx:1242`, `tests/components/admin/wizard/step3ReviewSections.test.tsx:913`, `tests/components/admin/wizard/step3ReviewSections.test.tsx:923`. The last file's test names also describe the anchor label as mirroring the image `alt`, which stops being exact once the suffix is added; rename accordingly.

- **One committed byte-for-byte baseline also breaks, and a `.ts`/`.tsx` grep does not find it.** `tests/components/admin/review/__fixtures__/step3-header-baseline.html` contains the old `Open the source sheet for Asset Mgmt Summit` label, and `tests/components/admin/review/reviewModalShell.test.tsx:362` asserts `normalizeIds(header.innerHTML)` equals that fixture exactly. The `Step3ReviewModal` label change WILL fail it. **Regenerate the fixture in the same task as the label edit** and confirm the anti-vacuity guard at `tests/components/admin/review/reviewModalShell.test.tsx:361` (`expected.length > 500`) still holds afterward. Sweep for affected expectations across `.html`, `.snap`, `.json`, and `.md` as well as `.ts`/`.tsx`; this fixture was the only non-source hit.

Real-browser Playwright assertions are not required: §5.1 establishes there is no layout dimension, and jsdom computes accessible names, which is the entire behavioral surface.

### 7.1 Why anchored equality is safe in jsdom here (verified, not assumed)

jsdom computes no CSS, so `display:none`-gated text is NOT excluded from its accessible-name computation — a divergence documented at `tests/components/ReSyncButton.test.tsx:345`, where a responsive label block forced that test to scope its assertion and defer real-browser name equality to a Playwright spec. (That citation is a comment plus a scoped workaround, not an executable assertion of the divergence; it is cited as the project's record of the behavior, not as proof.)

**This concern applies to only 15 of the 22 anchors.** An anchor with an `aria-label` takes its name from that label, not its content (§2), so CSS-gated descendants cannot affect it — that immunizes all 6 Group B anchors plus `components/admin/wizard/VenueMapTile.tsx:138` by construction. Only the content-named anchors are at risk: 11 Group A plus 4 Group C.

**Checked: none of those 15 contains CSS-gated text.** Responsive-hidden text does exist in the target files — `components/admin/wizard/Step2Verify.tsx:643`, `components/admin/wizard/Step3ReviewModal.tsx:521`, `components/admin/wizard/Step3ReviewModal.tsx:610` — plus decorative `sm:hidden` handles and carets at `components/shared/ReportModal.tsx:479`, `components/admin/BellPanel.tsx:1123` and `components/admin/BellPanel.tsx:1138`. All sit **outside** the `_blank` anchors (`Step3ReviewModal`'s anchor is at `components/admin/wizard/Step3ReviewModal.tsx:405`; `Step2Verify`'s are at `components/admin/wizard/Step2Verify.tsx:500` and `components/admin/wizard/Step2Verify.tsx:550`). Every in-anchor span is plain text or `aria-hidden="true"`, and `sr-only` is clip-based, so it is legitimately part of the name in both jsdom and real browsers.

**Constraint:** if a site later gains CSS-gated text inside its anchor, scope that assertion the way `tests/components/ReSyncButton.test.tsx:345` does rather than asserting whole-anchor equality, and say so in the test header.

## 8. Quality gates

- **Invariant 8 (impeccable dual-gate)** applies; the diff touches `components/` and `app/`. `/impeccable critique` AND `/impeccable audit` via subagents, P0/P1 fixed or deferred via `DEFERRED.md`, before the whole-diff Codex review.
- **Pre-push:** `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`.
- **`pnpm spec:lint`** on this document, clean, with output attached to every review dispatch (`docs/agents/spec-self-review.md:23`).
- Ship-time exemption list empty (§6 requirement 6).

## 9. Out of scope (deliberate)

- **Tap targets** — already shipped (`components/admin/PerShowActionableWarnings.tsx:281`).
- **`rel` normalization** beyond the two anchors already being edited (`components/crew/sections/VenueSection.tsx:250`, `app/admin/show/[slug]/CrewPageLink.tsx:26`).
- **A repo-wide WCAG 2.5.3 audit.** §2.2 fixes the three failures found inside this family. If more surface while implementing, file a backlog item rather than growing this diff.
- **Non-anchor external navigation** — none exists (§1.2, checked).
- **Changing any visible copy.** Labels and hidden text only.

## 10. Files touched

New: the `NewTabHint` component under `components/shared/`, the meta-test under `tests/styles/`, and behavioral test files per §7.

Edited: the 21 anchors in §4 plus the §2.2 label fix at `components/admin/wizard/VenueMapTile.tsx:138`, spanning **16 distinct files** — the 17 files containing `_blank`, minus `components/admin/wizard/Step3SheetCard.tsx`, which is the only family file needing no change. Plus the existing expectations in §7 — seven exact-label assertions across **five** test files (`Step3ReviewModal.test.tsx` and `step3ReviewSections.test.tsx` each carry two), plus the byte baseline `tests/components/admin/review/__fixtures__/step3-header-baseline.html` and its test `tests/components/admin/review/reviewModalShell.test.tsx` — and `BACKLOG.md` to close the item.
