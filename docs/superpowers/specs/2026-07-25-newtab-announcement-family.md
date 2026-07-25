# New-tab announcement family sweep — design

**Date:** 2026-07-25 · **Backlog item:** `BL-ADMIN-QUIET-LINK-AFFORDANCE-A11Y` (PR2 of the BL-NULLCODE-STAMP-BATCH-2 residual sweep) · **Owner:** Opus / Claude Code (UI work per `ROUTING.md`)

## 1. Problem

A link that opens a new tab tells sighted users so with a `↗` glyph. That glyph is `aria-hidden="true"` at every site that has one, so a screen-reader user hears only "Open in Sheet" and gets no warning that activating the link leaves the page. On the venue floor — the primary context for this app — an unannounced context switch is disorienting, and back-navigation does not return you.

Two sites already solve this with an `aria-label` naming both destination and behavior:

- `components/admin/wizard/VenueMapTile.tsx:138` — `aria-label="Open the venue in Google Maps (opens in a new tab)"`
- `components/admin/wizard/Step3SheetCard.tsx:152` — `` aria-label={`Open the source sheet for ${title} in Google Sheets (opens in a new tab)`} ``

That is the established convention. Twenty other new-tab anchors do not follow it.

### 1.1 Census (verified 2026-07-25 against `b449656`)

**Count `_blank`, not `target="_blank"`.** The literal-attribute grep finds 18 anchors across 12 files; the true total is **22 across 16 files**:

```
grep -rn '_blank' components/ | wc -l     # 22
grep -rl '_blank' components/ | wc -l     # 16
```

The four the literal pattern misses spread the attribute conditionally, and they are the alert-action links this backlog item is actually about:

```tsx
{...(action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
```

**2 already correct + 20 to fix.** Any structural guard written against `target="_blank"` inherits the same blind spot — see §6.

## 2. Decision: mechanism is per-site, because the two mechanisms do not compose

`aria-label` **replaces** an element's accessible name. An appended `sr-only` span is therefore *silently ignored* on any element that already has an `aria-label`. So there is no single mechanism that fits all 20 sites, and the rule is:

| Site already has `aria-label`? | Mechanism |
| --- | --- |
| Yes | Extend the existing label string with ` (opens in a new tab)`. Do NOT add a span — it would be dead markup. |
| No | Append `{" "}<NewTabHint />` after the visible label, leaving the visible text as the name base. |

**Why not convert everything to `aria-label`:** it duplicates visible copy into a second string that drifts, and it re-opens WCAG 2.5.3 (label-in-name) at every site — the label must still contain the visible words. The `sr-only` suffix composes with whatever the visible text already says, so a future copy edit cannot desynchronize it.

**Why not convert the two existing `aria-label` sites to the span:** their labels deliberately name a destination the visible text does not (`"…in Google Sheets"`, `"Open the venue in Google Maps"` vs. a bare icon/short label). Downgrading them to visible-text-plus-suffix would lose information. They stay as they are.

### 2.1 `NewTabHint` primitive

New file `components/shared/NewTabHint.tsx`:

```tsx
/** Visually-hidden "(opens in a new tab)" suffix for external links (spec 2026-07-25).
 *  MUST be preceded by a real space text node — see §3.1. */
export function NewTabHint(): JSX.Element {
  return <span className="sr-only">(opens in a new tab)</span>;
}
```

One component, so the copy string exists once and the meta-test in §6 has a single import to match. It is deliberately not a wrapper around `<a>`: the 20 sites have divergent class strings, `data-testid`s, and conditional props, and a wrapper would force a 20-site refactor instead of a one-line addition.

## 3. Exact copy

`(opens in a new tab)` — matching the two existing sites verbatim, including lowercase and parentheses. Any new phrasing would make the codebase inconsistent with itself and defeat the set-equality guard.

### 3.1 The separator trap (MANDATORY)

The accessible-name algorithm **trims leading and trailing whitespace of each text node**, so a space written *inside* the span is dropped:

```tsx
{label}<span className="sr-only"> (opens in a new tab)</span>   // ✗ "Open in Sheet(opens in a new tab)"
```

The separator must be its own text node, on the **same JSX line** (JSX also strips whitespace-only text between an expression and an element on separate lines):

```tsx
{label} <NewTabHint />        // ✓  or, explicitly:
{label}{" "}<NewTabHint />    // ✓
```

This is a known latent-bug shape in this codebase (it shipped undetected in a `View details<span className="sr-only"> for …</span>` pattern because tests matched a substring, never the boundary). §7 requires an **anchored** accessible-name assertion so the boundary is actually exercised.

## 4. Site inventory and disposition

### Group A — no `aria-label`; append `{" "}<NewTabHint />` (11 sites)

| Site | Visible label |
| --- | --- |
| `admin/PerShowActionableWarnings.tsx:279` | `Open in Sheet ↗` |
| `admin/NoteWarningCard.tsx:83` | `Open in Sheet ↗` |
| `admin/wizard/step3ReviewSections.tsx:2964` | `Open in Sheet ↗` |
| `admin/wizard/step3ReviewSections.tsx:3188` | `Open PDF ↗` |
| `admin/wizard/step3ReviewSections.tsx:3386` | `Open the source sheet ↗` |
| `admin/wizard/step3ReviewSections.tsx:3684` | `Open diagrams folder in Drive` + `ExternalLink` icon |
| `admin/settings/DriveConnectionPanel.tsx:242` | `Open folder` + `ExternalLink` icon |
| `admin/wizard/Step2Verify.tsx:500` | `Open the folder →` |
| `admin/wizard/Step2Verify.tsx:550` | `Open the folder →` (second instance) |
| `crew/sections/VenueSection.tsx:249` | `Open in Maps` — **crew-facing** |
| `shared/ReportModal.tsx:581` | `View on GitHub` |

`VenueSection.tsx:249` additionally carries `rel="noreferrer"` without `noopener`. Modern browsers imply it, but every other site in this family uses `rel="noopener noreferrer"`; normalize it here since the line is being touched anyway.

### Group B — has `aria-label`; extend the label string (5 sites)

| Site | Current label | Becomes |
| --- | --- | --- |
| `admin/showpage/PublishedReviewModal.tsx:708` | `` `Open the source sheet for ${displayTitle}` `` | `` `… for ${displayTitle} (opens in a new tab)` `` |
| `admin/wizard/Step3ReviewModal.tsx:408` | `` `Open the source sheet for ${title}` `` | `` `… for ${title} (opens in a new tab)` `` |
| `admin/wizard/step3ReviewSections.tsx:934` | `` `Open the source sheet for ${label}` `` | `` `… for ${label} (opens in a new tab)` `` |
| `admin/wizard/step3ReviewSections.tsx:3577` | `aria-label={alt}` | `` aria-label={`${alt} (opens in a new tab)`} `` |
| `crew/primitives/SourceLink.tsx:71` | `View this section in the source sheet` | `View this section in the source sheet (opens in a new tab)` — **crew-facing** |

`step3ReviewSections.tsx:3577` is a deliberate nameless-link guard (WCAG 2.4.4/4.1.2) on a staged-diagram image link whose name is the image `alt`. Appending the phrase preserves that guard — the name stays non-empty and still describes the image — so it is **not** exempt. Guard condition: if `alt` is ever empty, the label must not degrade to a bare `" (opens in a new tab)"`; §5 covers this.

### Group C — dynamic spread; announcement must be conditional (4 sites)

All four share one shape — no `aria-label`, `{action.label}`, and a `↗` already gated on `action.external`:

| Site | Anchor |
| --- | --- |
| `admin/review/AttentionBanner.tsx:162-171` | `attention-banner-action-${a.alertId}` |
| `admin/BellPanel.tsx:300-309` | `bell-action-${entry.alertId}-${i}` |
| `admin/telemetry/HealthAlertsPanel.tsx:145-154` | `health-alert-action-${row.id}` |
| `admin/showpage/AttentionMenu.tsx:208-218` | reads `item.alert.action` at `:183` |

**The hint MUST be gated on the same `action.external` flag as the `↗` and the `target`.** These anchors are internal fragment links (e.g. `#share-access`) when `external` is false, and announcing a new tab on a same-page jump is a false statement to exactly the users who cannot see that it didn't happen. Pattern:

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
| Group B label interpolation yields empty (`${title}` empty) | Same rule: the destination clause must survive, so the label reads `"Open the source sheet (opens in a new tab)"` rather than `"Open the source sheet for  (opens in a new tab)"` |
| A site gains `aria-label` later | Mechanism flips from span to label-string per §2; the §6 meta-test accepts either, so it cannot silently regress to "neither" |

## 6. Structural meta-test (the class-closing artifact)

New `tests/styles/_metaNewTabAnnouncement.test.ts`:

1. **Filesystem-walk** `components/**/*.tsx` — do NOT lexically scan a hard-coded file list, so a NEW external anchor fails by default.
2. Match `_blank` as a **value**, not `target="_blank"` as an attribute literal, so the four conditional-spread sites are in scope. This is the specific defect that made the backlog item's own census wrong; the guard must not inherit it.
3. For each matching file, require one of:
   - an `aria-label` whose string contains `opens in a new tab`, OR
   - an import of `NewTabHint`, OR
   - an inline `// no-newtab-announcement: <reason>` exemption comment.
4. Assert the exemption list is **empty** at ship time (§8), so any future exemption is a deliberate, reviewed addition.
5. Assert the copy string `(opens in a new tab)` appears in exactly one component definition (`NewTabHint.tsx`) plus the Group B `aria-label`s — a set-equality assertion over the matches, not a forbid-regex, per the project's set-equality-over-forbid-regex lesson.

**Known limitation to state in the test header:** file-level granularity. A file containing two anchors where only one is fixed still passes. Per-anchor static analysis would need a JSX AST walk; §9 records this as deliberately out of scope, and §7's behavioral tests cover the specific anchors.

## 7. Tests (TDD per task — failing test first)

Static/structural coverage is not sufficient: it proves a token is present, not that the accessible name is correct. Required per group:

- **Anchored accessible-name assertion** for at least one site per group, in jsdom via Testing Library:
  `expect(link).toHaveAccessibleName(/^Open in Sheet \(opens in a new tab\)$/)` — anchored at both ends so the §3.1 separator bug fails the test. A substring match would pass the buggy `"Open in Sheet(opens in a new tab)"`, which is exactly how this shape shipped undetected before.
- **Visible-text isolation:** clone the anchor, strip `.sr-only` descendants, assert the trimmed `textContent` still equals the intended visible label — catches an implementation that "fixes" the name by changing visible copy.
- **Group C negative test (highest-value test in the diff):** render each of the four renderers with `action.external === false` and assert the accessible name contains NO new-tab phrasing, and that no `target` is set. This is the test that would catch the most likely wrong implementation (announcing unconditionally).
- **Group B empty-interpolation test:** `title`/`alt` empty → label still names the destination and is never `" (opens in a new tab)"`.
- **`NewTabHint` unit test:** renders `sr-only`, text is exactly the canonical string.

Real-browser (Playwright) assertions are **not** required: this diff changes no layout, no dimensions, and no visual state — it adds visually-hidden text and extends label strings. jsdom does not compute layout, but it does compute accessible names, which is the entire behavioral surface here. (Recorded so a reviewer does not ask for a real-browser layout task on a diff with no layout dimension.)

### 7.1 Why anchored equality is safe in jsdom here (verified, not assumed)

jsdom computes **no CSS**, so `display:none`-gated text is NOT excluded from its accessible-name computation — a known divergence in this codebase, documented at `tests/components/ReSyncButton.test.tsx:345-356`, where a responsive label block forced that test to scope its assertion and defer real-browser accName equality to a Playwright spec. That divergence would make an anchored `toHaveAccessibleName` assertion unachievable at any site whose anchor contains CSS-gated text.

**Checked: none of the 20 anchors contains CSS-gated text.** The only responsive-hidden text in the 13 target files is `Step2Verify.tsx:643` (`<span className="hidden sm:inline"> in {result.folderName}</span>`), which sits outside the `:500`/`:550` anchors; the remaining `hidden`/`sm:hidden` matches in these files are decorative drag handles and carets (`ReportModal.tsx:479`, `BellPanel.tsx:1123,1138`), also outside the anchors. Every in-anchor `<span>` is either plain text or `aria-hidden="true"` (the `↗` glyphs and icons), and `sr-only` is clip-based rather than `display:none`, so it is legitimately part of the name in both jsdom and real browsers.

**Implementation constraint:** if a task ever needs to add an anchored assertion at a site that later gains CSS-gated text inside the anchor, scope the assertion the way `ReSyncButton.test.tsx` does rather than asserting whole-anchor equality — and say so in the test header.

## 8. Quality gates

- **Invariant 8 (impeccable dual-gate)** applies — the diff touches `components/`. `/impeccable critique` AND `/impeccable audit`, P0/P1 fixed or explicitly deferred via `DEFERRED.md`, both run before the whole-diff Codex review, both via subagents.
- **Pre-push:** `pnpm test` (full suite), `pnpm typecheck`, `pnpm lint`, `pnpm format:check`.
- Ship-time exemption list is empty (§6.4).

## 9. Out of scope (deliberate)

- **Per-anchor AST granularity** in the meta-test (§6 limitation). File-level + behavioral tests are the chosen tradeoff.
- **The two already-correct sites.** Not touched.
- **Tap targets.** The other half of `BL-ADMIN-QUIET-LINK-AFFORDANCE-A11Y` already landed (`min-h-tap-min` at `PerShowActionableWarnings.tsx:281`); this spec closes only the announcement half, and the backlog item's status line says so.
- **`rel` normalization beyond `VenueSection.tsx:249`.** Only the one site already being edited.
- **Non-anchor external navigation** (`window.open`, form targets) — none found in `components/`; noted so the absence is recorded rather than assumed.

## 10. Files touched

New: `components/shared/NewTabHint.tsx`, `tests/styles/_metaNewTabAnnouncement.test.ts`, plus behavioral test files per §7.
Edited: the 20 sites in §4, spanning **14 distinct files** — which reconciles with §1.1: 16 files contain `_blank`, minus the 2 already-correct files (`VenueMapTile.tsx`, `Step3SheetCard.tsx`) that this spec does not touch. Plus `BACKLOG.md` to close the item.

Distinct edited files: `admin/PerShowActionableWarnings.tsx`, `admin/NoteWarningCard.tsx`, `admin/settings/DriveConnectionPanel.tsx`, `admin/wizard/step3ReviewSections.tsx`, `admin/wizard/Step2Verify.tsx`, `admin/wizard/Step3ReviewModal.tsx`, `admin/showpage/PublishedReviewModal.tsx`, `admin/showpage/AttentionMenu.tsx`, `admin/review/AttentionBanner.tsx`, `admin/BellPanel.tsx`, `admin/telemetry/HealthAlertsPanel.tsx`, `crew/sections/VenueSection.tsx`, `crew/primitives/SourceLink.tsx`, `shared/ReportModal.tsx`.
