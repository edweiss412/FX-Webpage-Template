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

**2 already announce + 21 to fix.** Other external-navigation vectors, checked and absent: no `window.open(...)`, no form `target` attributes, no `<Link target=...>` in either tree. `app/` holds 13 `.mdx` files; none currently contains `_blank`, but §6 covers them so a future one cannot slip in.

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
| `components/admin/showpage/PublishedReviewModal.tsx:708` | `` `Open the source sheet for ${displayTitle} (opens in a new tab)` `` |
| `components/admin/wizard/Step3ReviewModal.tsx:408` | `` `Open the source sheet for ${title} (opens in a new tab)` `` |
| `components/admin/wizard/step3ReviewSections.tsx:934` | §2.2 rewrite (label-in-name plus announcement) |
| `components/admin/wizard/step3ReviewSections.tsx:3577` | `` `${alt} (opens in a new tab)` `` |
| `components/crew/primitives/SourceLink.tsx:71` | §2.2 rewrite (label-in-name plus announcement) |
| `app/admin/show/[slug]/CrewPageLink.tsx:27` | `Open crew page (opens in a new tab)`; also normalize `rel` at `app/admin/show/[slug]/CrewPageLink.tsx:26` |

Plus the §2.2 label-in-name-only fix at `components/admin/wizard/VenueMapTile.tsx:138`, which already announces.

`components/admin/wizard/step3ReviewSections.tsx:3577` is a deliberate nameless-link guard (WCAG 2.4.4 and 4.1.2) on a staged-diagram image link named by its `alt`. Appending the phrase preserves that guard, so it is not exempt.

### Group C — dynamic spread; announcement must be conditional (4 anchors)

All four share one shape: no `aria-label`, `{action.label}`, and a `↗` already gated on the external flag.

| Site | Gating expression |
| --- | --- |
| `components/admin/review/AttentionBanner.tsx:165` | `a.action.external` |
| `components/admin/BellPanel.tsx:304` | `action.external` |
| `components/admin/telemetry/HealthAlertsPanel.tsx:149` | `action.external` |
| `components/admin/showpage/AttentionMenu.tsx:212` | `action.external`, from `item.alert.action` at `components/admin/showpage/AttentionMenu.tsx:183` |

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

## 6. Structural guard: per-anchor AST, not per-file lexical

A new meta-test under `tests/styles/` (planned file, no citation available yet).

**R1's per-file design was inadequate and is replaced.** After the sweep, all 17 family files contain a qualifying token, so a NEW unannounced anchor added to any of them would pass, and that is the most probable regression. `components/admin/wizard/step3ReviewSections.tsx` alone holds **six** `_blank` anchors (lines 932, 2964, 3188, 3386, 3575, 3684), where one import would satisfy the whole file. A wrong-anchor import also passes, since lint rejects only a wholly unused import.

**Per-anchor analysis is well-precedented here,** so R1's "AST is out of scope" rested on a false premise: `tests/app/admin/showReviewModalLoader.test.tsx:708` parses TSX via `ts.createSourceFile` with `ts.ScriptKind.TSX` — the only existing TSX precedent, and the one this guard follows. `tests/admin/_metaInfoCodeActionability.test.ts:32` parses without a TSX script kind, and `tests/adminAlerts/producerScopeAst.test.ts:23` parses a synthetic `.ts` string with `ts.ScriptKind.TS`; both are AST-meta-test precedent but NOT evidence for TSX parsing, so they are cited only for the former. `tests/cross-cutting/no-console-exemptions.test.ts:38` and `tests/auth/developerGatingContract.test.ts:153` use ts-morph.

Requirements:

1. **Filesystem-walk** `components/**/*.tsx` and `app/**/*.tsx` for AST analysis — never a hard-coded list, so a new anchor fails by default.

   **`.mdx` gets a lexical assertion instead, because the TSX parser cannot see it.** Measured on all 13 files under `app/`: each produces 45 to 692 TypeScript parse diagnostics, and after appending a valid `<a target="_blank">probe</a>` in memory, the TSX AST **omitted the probe in 9 of the 13** (reproduced independently). Failing on diagnostics would reject all 13 existing files; ignoring them would silently miss real anchors. So an AST rule here would be a guarantee in name only. Instead: assert **no `.mdx` file under `app/` contains the substring `_blank` at all.** That is exact today (zero occurrences), needs no parser, and cannot fail open. Its failure message must tell the author to move the external link into a `.tsx` component where the per-anchor rules apply, rather than to add an exemption.
2. **Parse as TSX and detect external links by VALUE, across every normal AST shape.** Recognize `target="_blank"`, `target={"_blank"}`, `target={cond ? "_blank" : undefined}` (either branch), and spread attributes whose object literal carries a `target: "_blank"` property — including an object referenced by an in-file identifier, resolved within the file. **Fail closed:** if a `target` value or spread object cannot be statically resolved, the anchor FAILS with a message telling the author to inline it or add an exemption. Silent fall-through is what made the original census wrong.
3. **Restrict to link elements** (`<a>`, `<Link>`) so a non-link component carrying an unrelated `target` prop is not a false positive.
4. **Per anchor**, require one of:
   - an `aria-label` containing `opens in a new tab` **whose remainder is non-empty after removing that phrase AND stripping punctuation and whitespace**. Removing only the phrase is insufficient: `aria-label="(opens in a new tab)"` leaves `()`, which is non-empty while carrying no destination. Both that and the bare phrase must FAIL.
   - a `NewTabHint` descendant that is **not hidden from the accessible name**, checked against `aria-hidden="true"`, the **native `hidden` attribute** (`<span hidden>`, already a repo idiom at `components/right-now/RightNowCard.tsx:637` and `components/crew/RightNowHero.tsx:508`, and rendered by React as `hidden=""`), AND CSS hiding — a `hidden` class, `display:none`, or `visibility:hidden` — on the hint or any ancestor within the anchor. `<span aria-hidden="true"><NewTabHint /></span>` and `<span className="hidden"><NewTabHint /></span>` both contribute nothing to the name (verified against installed `dom-accessibility-api` 0.6.3: the name came back as the destination alone). No current anchor has such a descendant; this closes a future hole rather than a present bug.
   - an inline `// no-newtab-announcement: <reason>` exemption.
5. **Any anchor whose `target` is CONDITIONAL** — spread or direct — additionally requires its **announcement** (whichever mechanism requirement 4 accepted) to be conditional under the **effective `_blank` predicate**, defined as:
   - the condition itself when `"_blank"` is in the TRUE branch only (all four live anchors);
   - its **negation** when `"_blank"` is in the FALSE branch only, e.g. `target={external ? undefined : "_blank"}` requires the announcement gated on `!external`;
   - **constant `true` when BOTH branches are `"_blank"`** (e.g. `target={external ? "_blank" : "_blank"}`, which requirement 2 accepts). The target is then unconditionally external, so a STATIC announcement is the correct implementation and the guard must accept it — supplying `external` or `!external` here would reject correct code or enforce only one branch.

   The guard therefore computes polarity from which branches carry `_blank`, rather than comparing condition text.

   **A static phrase-bearing `aria-label` FAILS on a conditional-target anchor.** Requirement 4 accepts a label as an announcement mechanism, but a label is unconditional, so on a conditional-target anchor it would announce a new tab even when `target` is undefined — the same lie the hint gating prevents. Such an anchor must either render the hint under the effective predicate, or build the label from a conditional expression whose phrase-bearing branch matches that predicate. (This resolves R4's requirement-4-vs-5 conflict: the rule is about the announcement, not specifically about `NewTabHint`, and §2's no-dead-hint rule still forbids a hint under a label.)

   Scoping this to spreads only, as R3's draft did, left a false-announcement hole:

   ```tsx
   <a target={external ? "_blank" : undefined}>Destination <NewTabHint /></a>
   ```

   That shape satisfies requirements 2 and 4 while announcing a new tab on every render, including the same-tab case. An unconditionally rendered hint on any conditional-target anchor MUST fail.
6. **Exemption list empty** at ship time, so any future exemption is a deliberate reviewed addition.
7. **Synthetic scanner self-tests are MANDATORY** — without them the guard is unfalsifiable. The live tree exercises only literal targets and four true-polarity conditional spreads, so a scanner that supports today's shapes and nothing else passes every other test in §7 while silently failing open on everything requirements 1 to 5 promise. The 22 accessible-name cases verify current *rendering*, not the guard's *branches*. Precedent for exactly this shape: `tests/admin/_metaInfoCodeActionability.test.ts:121` ("scanner self-test: synthetic fixtures prove discovery and each fail-closed branch") drives its visitor through a `scanSource` seam over synthetic sources; expose the same seam here.

   Required synthetic cases, each asserting accept or reject: an `.mdx` source containing `_blank`; `target={"_blank"}`; a direct conditional target in true-only, false-only, and both-branch polarity; an identifier-backed spread object (resolvable) and an unresolvable one (must FAIL closed); a `<Link>` element; a non-link component carrying `target` (must NOT be flagged); a phrase-only label and a punctuation-only label (`"(opens in a new tab)"`); a hint hidden by `aria-hidden`, by the native `hidden` attribute, and by CSS; a static phrase-bearing label on a conditional-target anchor; and a conditional label whose phrase sits in the wrong branch.

8. **Copy-string census, comment-stripped.** Assert set equality over the FILES that contain `(opens in a new tab)`, not a magic occurrence count. The count is not 9: every §5 empty-interpolation fallback is a second literal in the same label, so the real figure is 13 and it moves whenever a fallback is added. A count is the brittle form of this assertion — pin the file set (the NewTabHint module, the six Group B label sites, and the two pre-existing labels at `components/admin/wizard/VenueMapTile.tsx:138` and `components/admin/wizard/Step3SheetCard.tsx:152`) and strip comments before matching.

## 7. Tests (TDD per task — failing test first)

Structural coverage proves a token is present, not that the name is right. R2 demonstrated two implementations that satisfy every structural check while producing a broken name, and R1's "one site per group" minimum would have let them survive on nine untested Group A anchors. Therefore:

- **Table-driven anchored accessible-name assertion for ALL 22 anchors** — the 21 being fixed PLUS `components/admin/wizard/VenueMapTile.tsx:138`, whose label §2.2 rewrites. One table, one case per anchor, `expect(link).toHaveAccessibleName(/^…\(opens in a new tab\)$/)` anchored at both ends so the §3.1 separator bug fails. A substring match would pass the buggy `"Open in Sheet(opens in a new tab)"`. `toHaveAccessibleName` is already used at `tests/components/ReSyncButton.test.tsx:418`.

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
