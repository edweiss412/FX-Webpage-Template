# New-tab announcement family sweep — design

**Date:** 2026-07-25 · **Backlog item:** `BL-ADMIN-QUIET-LINK-AFFORDANCE-A11Y` (PR2 of the BL-NULLCODE-STAMP-BATCH-2 residual sweep) · **Owner:** Opus / Claude Code (UI work per `ROUTING.md`)

**Revision R2** — incorporates spec-review R1 (6 findings, all confirmed against live code). Changes from R1: scope widened to `app/` (§1.1); two pre-existing WCAG 2.5.3 label-in-name failures now fixed rather than preserved (§2.2); the structural guard is per-anchor AST, not per-file lexical (§6); the §3.1 rationale is corrected to name the actual mechanism; behavioral coverage minimum raised (§7).

## 1. Problem

A link that opens a new tab tells sighted users so with a `↗` glyph or an external-link icon. That glyph is `aria-hidden="true"` at every site that has one, so a screen-reader user hears only "Open in Sheet" and gets no warning that activating the link leaves the page. On the venue floor — the primary context for this app — an unannounced context switch is disorienting, and back-navigation does not return you.

Two sites already solve this with an `aria-label` naming both destination and behavior:

- `components/admin/wizard/VenueMapTile.tsx:138` — `aria-label="Open the venue in Google Maps (opens in a new tab)"`
- `components/admin/wizard/Step3SheetCard.tsx:152` — `` aria-label={`Open the source sheet for ${title} in Google Sheets (opens in a new tab)`} ``

That is the established convention. Twenty-one other new-tab anchors do not follow it.

### 1.1 Census (verified 2026-07-25 against `b449656`)

**Count `_blank` as a value, not `target="_blank"` as an attribute literal.** The literal-attribute grep finds 18 anchors across 12 files in `components/`; the true family is **23 anchors across 17 files** once conditional spreads and `app/` are included:

```
grep -rn '_blank' components/ app/ | wc -l     # 23
grep -rl '_blank' components/ app/ | wc -l     # 17
```

Two reasons the narrow count undercounts:

1. **Conditional spreads** (4 sites) — the alert-action renderers apply the attribute through a spread, so no `target="_blank"` literal appears:
   ```tsx
   {...(action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
   ```
2. **`app/` is in the family** (1 site) — `app/admin/show/[slug]/CrewPageLink.tsx:25` is a shipped external anchor whose `aria-label="Open crew page"` (`:27`) carries no announcement. `components/`-only arithmetic (22/16) is correct but excludes a same-family defect for no stated reason, and a walker scoped to `components/` could never catch an app-level regression. **Decision: the sweep and its guard cover `components/` AND `app/`.**

**2 already correct + 21 to fix.** No other external-navigation vectors exist: repository-wide scans found no `window.open(...)`, no form `target` attributes, and no `<Link target=…>` sites in either tree. (Recorded so the absence is a checked fact, not an assumption.)

## 2. Decision: mechanism is per-site, because the two mechanisms do not compose

`aria-label` **replaces** an element's accessible name — confirmed empirically against the repo's installed `dom-accessibility-api@0.6.3`, not just assumed from the spec text. An appended `sr-only` span is therefore *silently ignored* on any element that already has an `aria-label`. So there is no single mechanism that fits all 21 sites:

| Site already has `aria-label`? | Mechanism |
| --- | --- |
| Yes | Extend the existing label string with ` (opens in a new tab)`. Do NOT add a span — it would be dead markup. |
| No | Append a real space text node then `<NewTabHint />`, leaving the visible text as the name base. |

**Why not convert everything to `aria-label`:** it duplicates visible copy into a second string that drifts, and it re-opens WCAG 2.5.3 at every site. The `sr-only` suffix composes with whatever the visible text already says, so a future copy edit cannot desynchronize it.

**Why not convert the two existing `aria-label` sites to the span:** their labels deliberately name a destination the visible text does not (`"…in Google Sheets"`, `"Open the venue in Google Maps"` vs. a bare icon/short label). Downgrading them would lose information. They stay as they are.

### 2.1 `NewTabHint` primitive

New file `components/shared/NewTabHint.tsx`:

```tsx
/** Visually-hidden new-tab suffix for external links (spec 2026-07-25).
 *  MUST be preceded by a real space text node — see §3.1. */
export function NewTabHint(): JSX.Element {
  return <span className="sr-only">(opens in a new tab)</span>;
}
```

One component, so the copy string exists once and §6's guard has a single import to match. **The JSDoc must not repeat the parenthesized copy string verbatim** — a lexical census would count the comment as an occurrence (§6.5 requires comment-stripping regardless, but the two defenses are cheap and independent).

It is deliberately not a wrapper around `<a>`: the 21 sites have divergent class strings, `data-testid`s, and conditional props, and a wrapper would force a 21-site refactor instead of a one-line addition.

### 2.2 Two pre-existing WCAG 2.5.3 failures get fixed, not preserved

WCAG 2.5.3 Label in Name (Level A) requires the accessible name to contain the visually presented text. Two Group B anchors fail it today, and the R1 spec would have preserved both by only appending a suffix:

| Site | Visible text | Current `aria-label` | Contains visible text? |
| --- | --- | --- | --- |
| `components/admin/wizard/step3ReviewSections.tsx:934` | `In sheet` (`:937`) | `Open the source sheet for ${label}` | **No** |
| `components/crew/primitives/SourceLink.tsx:71` | `In sheet` (`:75`) | `View this section in the source sheet` | **No** |

Neither label contains `In sheet` as a contiguous string. `SourceLink` is **crew-facing**, so this is the higher-impact of the two.

**Decision: fix both while editing these exact lines.** Leaving a known Level-A failure on a line this spec is already rewriting, in a change whose entire purpose is the accessible naming of external links, is indefensible. New labels keep the destination information AND contain the visible words:

- `step3ReviewSections.tsx:934` → `` `In sheet — open the source sheet for ${label} (opens in a new tab)` ``
- `SourceLink.tsx:71` → `In sheet — view this section in the source sheet (opens in a new tab)`

The visible text stays untouched; only the label changes. §7 requires a label-in-name assertion for both (accessible name contains the visible string), which is the test that pins the fix.

## 3. Exact copy

`(opens in a new tab)` — matching the two existing sites verbatim, including lowercase and parentheses. Any new phrasing would make the codebase inconsistent with itself and defeat the set-equality guard.

### 3.1 The separator must be a real sibling space text node (MANDATORY)

**The rule:** emit a space as its own text node between the visible label and the hint.

```tsx
{label}<span className="sr-only"> (opens in a new tab)</span>   // ✗ "Open in Sheet(opens in a new tab)"
{label} <NewTabHint />                                          // ✓
{label}{" "}<NewTabHint />                                      // ✓ equivalent
```

**Why (accurately stated):** this is a property of `dom-accessibility-api@0.6.3` — the implementation Testing Library uses and therefore what every jsdom assertion in this repo observes. Verified empirically on the installed version: a space *inside* the span is dropped (`"Open in Sheet(opens…)"`), a sibling space is retained. The normative AccName 1.2 text-node step does **not** state that each text node is individually trimmed, so this is a harness-behavior fact, not a citation of the standard — and real browsers may well insert the separator themselves. The prescription stands regardless: we cannot depend on non-uniform behavior across the harness and multiple browser accessibility engines, and the explicit space is correct everywhere.

**Not a same-line rule.** Prettier compiles a literal JSX space and `{" "}` to the same `" "` child, and when it wraps onto separate lines it preserves the separator explicitly as `{" "}`. So the load-bearing requirement is "a real sibling space text node exists," not physical placement. (The R1 spec said same-line; that was an over-narrow restatement.)

This shape already shipped undetected in this codebase once — a `View details<span className="sr-only"> for …</span>` pattern read as `"detailsfor …"` for its whole life because tests matched a substring and never the boundary. Hence §7's **anchored** assertions.

## 4. Site inventory and disposition

### Group A — no `aria-label`; append a space + `<NewTabHint />` (11 sites)

| Site | Visible label |
| --- | --- |
| `components/admin/PerShowActionableWarnings.tsx:279` | `Open in Sheet ↗` |
| `components/admin/NoteWarningCard.tsx:83` | `Open in Sheet ↗` |
| `components/admin/wizard/step3ReviewSections.tsx:2964` | `Open in Sheet ↗` |
| `components/admin/wizard/step3ReviewSections.tsx:3188` | `Open PDF ↗` |
| `components/admin/wizard/step3ReviewSections.tsx:3386` | `Open the source sheet ↗` |
| `components/admin/wizard/step3ReviewSections.tsx:3684` | `Open diagrams folder in Drive` + `ExternalLink` icon |
| `components/admin/settings/DriveConnectionPanel.tsx:242` | `Open folder` + `ExternalLink` icon |
| `components/admin/wizard/Step2Verify.tsx:500` | `Open the folder →` |
| `components/admin/wizard/Step2Verify.tsx:550` | `Open the folder →` (second instance) |
| `components/crew/sections/VenueSection.tsx:249` | `Open in Maps` — **crew-facing** |
| `components/shared/ReportModal.tsx:581` | `View on GitHub` |

`VenueSection.tsx:249` additionally carries `rel="noreferrer"` without `noopener`. Modern browsers imply it, but every other site in this family uses `rel="noopener noreferrer"`; normalize it here since the line is being touched anyway.

### Group B — has `aria-label`; extend the label string (6 sites)

| Site | Current label | Becomes |
| --- | --- | --- |
| `components/admin/showpage/PublishedReviewModal.tsx:708` | `` `Open the source sheet for ${displayTitle}` `` | `` `… for ${displayTitle} (opens in a new tab)` `` |
| `components/admin/wizard/Step3ReviewModal.tsx:408` | `` `Open the source sheet for ${title}` `` | `` `… for ${title} (opens in a new tab)` `` |
| `components/admin/wizard/step3ReviewSections.tsx:934` | `` `Open the source sheet for ${label}` `` | **§2.2 rewrite** — `` `In sheet — open the source sheet for ${label} (opens in a new tab)` `` |
| `components/admin/wizard/step3ReviewSections.tsx:3577` | `aria-label={alt}` | `` `${alt} (opens in a new tab)` `` |
| `components/crew/primitives/SourceLink.tsx:71` | `View this section in the source sheet` | **§2.2 rewrite** — `In sheet — view this section in the source sheet (opens in a new tab)` |
| `app/admin/show/[slug]/CrewPageLink.tsx:27` | `Open crew page` | `Open crew page (opens in a new tab)` — also normalize `rel="noreferrer"` → `rel="noopener noreferrer"` (`:26`) |

`step3ReviewSections.tsx:3577` is a deliberate nameless-link guard (WCAG 2.4.4/4.1.2) on a staged-diagram image link whose name is the image `alt`. Appending the phrase preserves that guard — the name stays non-empty and still describes the image — so it is **not** exempt.

### Group C — dynamic spread; announcement must be conditional (4 sites)

All four share one shape — no `aria-label`, `{action.label}`, and a `↗` already gated on `action.external`:

| Site | Anchor `data-testid` |
| --- | --- |
| `components/admin/review/AttentionBanner.tsx:162-170` | `attention-banner-action-${a.alertId}` |
| `components/admin/BellPanel.tsx:300-309` | `bell-action-${entry.alertId}-${i}` |
| `components/admin/telemetry/HealthAlertsPanel.tsx:145-154` | `health-alert-action-${row.id}` |
| `components/admin/showpage/AttentionMenu.tsx:208-218` | reads `item.alert.action` at `:183` |

**The hint MUST be gated on the same `action.external` flag as the `↗` and the `target`.** Verified against the registry: `AlertActionLink = { label: string; href: string; external: boolean }` (`lib/adminAlerts/alertActions.ts:39`), and every `external: false` builder returns a same-app fragment href — `/admin?show=${slug}#share-access` (`:61-62`), `/admin?show=${slug}#${hash}` (`:90`), `:128`. Announcing a new tab on a same-page jump is a false statement to exactly the users who cannot see that it didn't happen. Pattern:

```tsx
{action.label}
{action.external ? <span aria-hidden="true"> ↗</span> : null}
{action.external ? <> <NewTabHint /></> : null}
```

## 5. Guard conditions

| Input state | Behavior |
| --- | --- |
| `action.external === false` (Group C) | No hint, no `↗`, no `target` — internal link, nothing to announce |
| `href` null/absent | Anchor is not rendered at all today (`href ? (…) : null`); unchanged — no hint on a non-link |
| `alt` empty at `step3ReviewSections.tsx:3577` | Label must not become `" (opens in a new tab)"`. Fall back to a fixed descriptive name (`"Staged diagram (opens in a new tab)"`) so the link is never effectively nameless |
| Group B interpolation yields empty (`${title}`/`${label}` empty) | The destination clause must survive: `"Open the source sheet (opens in a new tab)"`, never `"Open the source sheet for  (opens in a new tab)"` with a double space |
| `action.label` empty (Group C) | Accessible name must not degrade to a bare `"(opens in a new tab)"`; if the label is empty the anchor is already effectively nameless today, so the hint is rendered but the test records the pre-existing gap rather than masking it |
| A site gains `aria-label` later | Mechanism flips from span to label-string per §2; §6's guard accepts either, so it cannot silently regress to "neither" |

## 6. Structural guard: per-anchor AST, not per-file lexical

New `tests/styles/_metaNewTabAnnouncement.test.ts`.

**R1's per-file design was inadequate and is replaced.** After the sweep, all 17 family files contain a qualifying token, so a NEW unannounced anchor added to any of them would pass — and that is the single most probable regression. `step3ReviewSections.tsx` alone holds seven `_blank` anchors, where one import would satisfy the whole file. A wrong-anchor import also passes (lint rejects only a wholly unused import).

**Per-anchor analysis is well-precedented in this repo**, so R1's "AST is out of scope" tradeoff was based on a false premise: `tests/app/admin/showReviewModalLoader.test.tsx:708` parses TSX via `ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)`; `tests/admin/_metaInfoCodeActionability.test.ts:32` and `tests/adminAlerts/producerScopeAst.test.ts` do the same; `tests/cross-cutting/no-console-exemptions.test.ts:38` and `tests/auth/developerGatingContract.test.ts:153` use ts-morph `Project`.

Requirements:

1. **Filesystem-walk** `components/**/*.tsx` AND `app/**/*.tsx` — never a hard-coded file list, so a NEW anchor fails by default.
2. **Parse each file as TSX** and locate every JSX element that is an external link: `target="_blank"` as a literal attribute, OR an object-spread attribute whose object literal contains a `target: "_blank"` property (the Group C form). Matching the *value* is what makes the conditional-spread sites visible; the attribute-literal pattern is exactly what made this backlog item's own census wrong.
3. **Per anchor**, require one of:
   - an `aria-label` attribute whose string (template literal included) contains `opens in a new tab`, OR
   - a `NewTabHint` element among its descendants, OR
   - an inline `// no-newtab-announcement: <reason>` comment on or immediately above the anchor.
4. **Conditional-spread anchors** additionally require that the hint be rendered under the same condition as the spread — assert the `NewTabHint` descendant sits inside a conditional whose test references the same identifier used to gate the spread. A hint rendered unconditionally on a Group C anchor MUST fail this guard, because §4's whole point is that it would lie on internal links.
5. Assert the exemption list is **empty** at ship time, so any future exemption is a deliberate reviewed addition.
6. **Copy-string census, comment-stripped.** Strip comments before matching, then assert set equality over the occurrences of `(opens in a new tab)`: exactly **9** — 1 in `NewTabHint.tsx`'s rendered span, 6 Group B labels, and the 2 pre-existing labels at `VenueMapTile.tsx:138` / `Step3SheetCard.tsx:152` that §2 preserves. Set equality over the located sites, not a forbid-regex, per the project's set-equality lesson. (R1 said "one plus five" and omitted the two existing sites it elsewhere promised to keep.)

## 7. Tests (TDD per task — failing test first)

Structural coverage proves a token is present, not that the accessible name is right. Required:

- **Anchored accessible-name assertions.** `expect(link).toHaveAccessibleName(/^Open in Sheet \(opens in a new tab\)$/)` — anchored at both ends, so the §3.1 separator bug fails. A substring match would pass the buggy `"Open in Sheet(opens in a new tab)"`, which is how this shape shipped undetected before. `toHaveAccessibleName` is already in use (`tests/components/ReSyncButton.test.tsx:418`).
- **Coverage minimum, raised from R1's "one per group":** every **Group C** site (4 — this is where a wrong implementation is most likely and most harmful), every site whose label this spec **rewrites** (the 2 in §2.2, plus the `alt` site), and at least **two** Group A sites and **two** other Group B sites spanning distinct files. The per-anchor guard in §6 carries exhaustive presence; these carry correctness.
- **Group C negative test (highest-value test in the diff):** render each of the four renderers with `action.external === false` and assert the accessible name contains no new-tab phrasing and no `target` is set.
- **Label-in-name assertions for §2.2:** accessible name contains the visible string (`In sheet`) for both rewritten sites — the test that pins the WCAG fix and would fail if someone "simplifies" the label back.
- **Visible-text isolation:** clone the anchor, strip `.sr-only` descendants, assert the trimmed `textContent` still equals the intended visible label — catches an implementation that "fixes" the name by changing visible copy.
- **Empty-interpolation tests:** `title`/`label`/`alt` empty → label still names the destination, never a bare `" (opens in a new tab)"` or a double space (§5).
- **`NewTabHint` unit test:** renders `sr-only`; text is exactly the canonical string.

Real-browser (Playwright) assertions are **not** required: this diff changes no layout, no dimensions, and no visual state — it adds visually-hidden text and extends label strings. jsdom computes no layout but does compute accessible names, which is the entire behavioral surface. (Recorded so a reviewer does not ask for a real-browser layout task on a diff with no layout dimension.)

### 7.1 Why anchored equality is safe in jsdom here (verified, not assumed)

jsdom computes no CSS, so `display:none`-gated text is NOT excluded from its accessible-name computation — a known divergence documented at `tests/components/ReSyncButton.test.tsx:345-356`, where a responsive label block forced that test to scope its assertion and defer real-browser accName equality to a Playwright spec. That divergence would make anchored equality unachievable at any site whose anchor contains CSS-gated text.

**Checked: none of the 21 anchors contains CSS-gated text.** Responsive-hidden text does exist in the target files — `Step2Verify.tsx:643`, `Step3ReviewModal.tsx:521-524` and `:610-614` — plus decorative `sm:hidden` drag handles and carets at `ReportModal.tsx:479` and `BellPanel.tsx:1123,1138`. **All of them sit outside the `_blank` anchors** (`Step3ReviewModal`'s anchor is `:403-412`; `Step2Verify`'s are `:500` and `:550`). Every in-anchor `<span>` is either plain text or `aria-hidden="true"` (the `↗` glyphs and icons), and `sr-only` is clip-based rather than `display:none`, so it is legitimately part of the name in both jsdom and real browsers.

**Implementation constraint:** if a site later gains CSS-gated text inside its anchor, scope the assertion the way `ReSyncButton.test.tsx` does rather than asserting whole-anchor equality, and say so in the test header.

## 8. Quality gates

- **Invariant 8 (impeccable dual-gate)** applies — the diff touches `components/` and `app/`. `/impeccable critique` AND `/impeccable audit`, P0/P1 fixed or explicitly deferred via `DEFERRED.md`, both run via subagents before the whole-diff Codex review.
- **Pre-push:** `pnpm test` (full suite), `pnpm typecheck`, `pnpm lint`, `pnpm format:check`.
- Ship-time exemption list is empty (§6.5).

## 9. Out of scope (deliberate)

- **The two already-correct sites.** Not touched (§2).
- **Tap targets.** The other half of `BL-ADMIN-QUIET-LINK-AFFORDANCE-A11Y` already landed (`min-h-tap-min` at `PerShowActionableWarnings.tsx:281`); this spec closes only the announcement half.
- **`rel` normalization beyond the two sites already being edited** (`VenueSection.tsx:249`, `CrewPageLink.tsx:26`).
- **Auditing label-in-name across the whole app.** §2.2 fixes the two failures found *inside this family*; a repo-wide 2.5.3 audit is a separate item. If more than those two turn up while implementing, file a backlog item rather than growing this diff.
- **Non-anchor external navigation** — none exists (§1.1, checked).

## 10. Files touched

New: `components/shared/NewTabHint.tsx`, `tests/styles/_metaNewTabAnnouncement.test.ts`, plus behavioral test files per §7.

Edited: the 21 sites in §4, spanning **15 distinct files** — reconciling with §1.1: 17 files contain `_blank`, minus the 2 already-correct files (`VenueMapTile.tsx`, `Step3SheetCard.tsx`) this spec does not touch. Plus `BACKLOG.md` to close the item.

Distinct edited files: `components/admin/PerShowActionableWarnings.tsx`, `components/admin/NoteWarningCard.tsx`, `components/admin/settings/DriveConnectionPanel.tsx`, `components/admin/wizard/step3ReviewSections.tsx`, `components/admin/wizard/Step2Verify.tsx`, `components/admin/wizard/Step3ReviewModal.tsx`, `components/admin/showpage/PublishedReviewModal.tsx`, `components/admin/showpage/AttentionMenu.tsx`, `components/admin/review/AttentionBanner.tsx`, `components/admin/BellPanel.tsx`, `components/admin/telemetry/HealthAlertsPanel.tsx`, `components/crew/sections/VenueSection.tsx`, `components/crew/primitives/SourceLink.tsx`, `components/shared/ReportModal.tsx`, `app/admin/show/[slug]/CrewPageLink.tsx`.
