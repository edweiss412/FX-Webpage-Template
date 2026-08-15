# Glyph probe — BL-GLYPHS-OUTSIDE-INTER-SUBSET (2026-08-10)

Committed output of the probe that Task U5 of the M-wave-2 plan runs before widening the Inter
subset. Spec contract: `docs/superpowers/specs/2026-08-09-m-wave-2-design.md` §2.6.

## What was scanned

`.ts` / `.tsx` / `.mdx` under `app/` and `components/`, plus `content:` declarations in
`app/globals.css`, against the full upstream `InterVariable.ttf` (Inter v4.1, the release
`scripts/subset-inter.sh` pins) and against the subset shipped before this change.

**The scan reads the AST, not the bytes.** A raw character scan of the same tree reports 33 missing
codepoints; the AST scan reports 16. The difference is entirely COMMENT prose — `→` alone appears in
205 files as a comment arrow and in 20 as rendered text. Subsetting from the raw count would have
bought range coverage for characters no user can ever see, on a file that is preloaded and sits on
the first-visit critical path. So the universe is JSX text, string and template literals, MDX prose
outside fenced code, and CSS `content:` — the four ways a character reaches the DOM.

## The result that contradicts the spec

`U+22EE ⋮` was the spec's headline known-add, cited as "five help MDX pages". The five sites are
real. **Inter does not have the glyph**, so widening the range for it would change nothing: it is
partition (b), and it still falls back. `U+2303` and `U+2304`, the other two known-adds, are
carried and are added.

### Partition (a) — Inter carries it, so the subset should (9)

| codepoint | glyph | name | sites |
| --- | --- | --- | --- |
| `U+2190` | ← | LEFTWARDS ARROW | `app/admin/show/staged/[stagedId]/page.tsx` |
| `U+2192` | → | RIGHTWARDS ARROW | `app/api/admin/onboarding/finalize/route.ts`, `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/approve/route.ts`, `app/help/_affordanceMatrix.ts` +17 more |
| `U+2197` | ↗ | NORTH EAST ARROW | `components/admin/BellPanel.tsx`, `components/admin/NoteWarningCard.tsx`, `components/admin/PerShowActionableWarnings.tsx` +3 more |
| `U+2298` | ⊘ | CIRCLED DIVISION SLASH | `components/diagrams/GalleryLightbox.tsx` |
| `U+2303` | ⌃ | UP ARROWHEAD | `app/globals.css (content:)` |
| `U+2304` | ⌄ | DOWN ARROWHEAD | `app/globals.css (content:)`, `components/admin/RoleRecognizeControl.tsx` |
| `U+2318` | ⌘ | PLACE OF INTEREST SIGN | `app/help/errors/page.tsx` |
| `U+26A0` | ⚠ | WARNING SIGN | `app/help/_components/Callout.tsx`, `app/help/admin/dashboard/page.mdx`, `components/admin/ShowsTable.tsx` |
| `U+2713` | ✓ | CHECK MARK | `app/admin/show/[slug]/PickerResetControl.tsx`, `app/admin/show/[slug]/ResetPickerEpochButton.tsx`, `app/help/_components/Callout.tsx` +3 more |

### Partition (b) — Inter lacks it; residue, still falls back (7)

| codepoint | glyph | name | sites |
| --- | --- | --- | --- |
| `U+2139` | ℹ | INFORMATION SOURCE | `app/help/_components/Callout.tsx` |
| `U+22EE` | ⋮ | VERTICAL ELLIPSIS | `app/help/admin/dashboard/page.mdx`, `app/help/admin/per-show-panel/page.mdx`, `app/help/admin/preview-as-crew/page.mdx` +2 more |
| `U+260E` | ☎ | BLACK TELEPHONE | `components/crew/primitives/PersonRow.tsx` |
| `U+2709` | ✉ | ENVELOPE | `components/crew/primitives/PersonRow.tsx` |
| `U+FFFD` | � | REPLACEMENT CHARACTER | `app/admin/show/[slug]/crewLinkMailto.ts` |
| `U+1F512` | 🔒 | LOCK | `app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx` |
| `U+1F517` | 🔗 | LINK SYMBOL | `app/help/_components/RefAnchor.tsx` |

Upstream InterVariable.ttf cmap: 2852 codepoints. Pre-change shipped subset: 1004.

## Residue note

Partition (b) is not a defect list and nothing here is actionable against Inter. Seven characters
render in a fallback family: an info glyph and a warning-adjacent set in the help Callout, the
row-actions ellipsis in the help MDX, a telephone and an envelope in the crew PersonRow, a lock on
the claimed-row button, a link symbol on help anchors, and `U+FFFD`.

`U+FFFD` deserves its own line: the `LATIN` range has requested it since the first subset and the
upstream face has never supplied it, so `PINNED_RANGE_COVERAGE` has carried `["U+FFFD", 0]` all
along. The request was always a no-op, which is exactly why coverage there is pinned as a COUNT
rather than as membership.

Choosing to replace any of these seven with an SVG or a lucide icon is a design decision about those
specific surfaces, not a font decision, and it is out of scope here.
