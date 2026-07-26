# Close-out — section-header rebuild + phantom spacers

Branch `feat/section-header-rebuild-phantom-spacers`. Spec
`docs/superpowers/specs/2026-07-25-section-header-rebuild-and-phantom-spacers.md`; plan
`docs/superpowers/plans/2026-07-25-section-header-rebuild-and-phantom-spacers.md`.

This is the invariant-8 record: the impeccable dual gate's findings and their dispositions, plus
the two spec assumptions measurement refuted during implementation.

---

## 12. UI quality gate (invariant 8)

### ⚠️ DEGRADED: single-context (sub-agent results never returned)

`/impeccable critique` requires Assessment A (design review) and Assessment B (detector +
evidence) to run as two isolated sub-agents; a single-context run is permitted only when no
sub-agent tool is exposed. That is not what happened here, and the distinction is recorded rather
than smoothed over.

Four sub-agents were dispatched across two attempts. **None returned a report.** They spawned
successfully, appeared in no task listing, wrote no output artifact, and did not answer direct
`SendMessage` requests over roughly 25 minutes of waiting. Both assessments were then run in this
context, which loses the isolation the command exists to enforce: the parent had already seen the
deterministic findings before forming the design judgment, so the design half is anchored by the
detector output in exactly the way the two-agent split is designed to prevent.

**Consequence for anyone reading this as an attestation:** the mechanical half is fully
reproducible and stands on its own (commands and numbers below). The design half should be treated
as the implementer's own review, not an independent one.

### The sub-agents DID report — after the merge (2026-07-26)

They were not dead, only slow: three of the four returned full design assessments hours later,
after PR #605 had merged. Recorded here because the paragraph above invited exactly this
correction, and because a degraded-gate note that never gets closed is how a known gap becomes a
forgotten one. **The isolation contract still failed** — the reports arrived too late to inform
either the implementation or the merge decision, so they did not function as a gate. What they
are is a post-hoc independent review, and they earn their keep: six live findings the
single-context run missed.

Scores, for the record: 30/40 and 29/40 on Nielsen (the single-context run gave 32/40 —
optimistic by 2-3 points, which is itself evidence for why the isolation matters). Both agents
independently rated *Recognition over recall* at **2**, the lowest score either gave, and both for
the same reason: the corner glyph names nothing to a sighted user.

**Two of their findings were already fixed before merge**, so those reads were stale — both agents
worked from pre-merge HEADs. The §7a empty-selector self-contradiction and the wrong spec citation in
DESIGN.md §7a were repaired in the round-1 repair commit; verified absent from merged `main`.

**Six findings verified live against `839eed829` and filed as
`BL-HEADER-LINK-AFFORDANCE-CLASS`:**

| # | Finding | Verified how |
| - | ------- | ------------ |
| 1 | The corner link is `text-text-subtle`, a token DESIGN.md declares "never used for action targets" (`DESIGN.md:27`) and "never an action target" (`DESIGN.md:58`). Pre-existing — `PublishedReviewModal.tsx:721` does the same — but the rebuild removed the words that made it read as a link, so the violation now carries the whole affordance. | Both DESIGN.md rows read; both call sites read. |
| 2 | No new-tab cue. `Step3SheetCard.tsx:152` says "(opens in a new tab)"; the rebuilt link's `aria-label` does not. The visible words used to carry it, so this is the link that needs it most. | Both aria-labels read. |
| 3 | The comment introducing the icon claims "the show card's own header already uses an icon-only sheet link". It does not: `Step3SheetCard.tsx` renders a TEXT title link with a trailing glyph. The icon-only precedent is `PublishedReviewModal.tsx:721`. The stated justification cites the wrong sibling. | Read the card's JSX. |
| 4 | Three sheet links, three spellings of one 44px hit area: `size-tap-min` (PublishedReviewModal), `size-5` + `before:-inset-3` (new), inline-after-text (Step3SheetCard) — plus three different `aria-label` phrasings. | All three read. |
| 5 | The hit overlay bleeds onto the name. `before:-inset-3` is 12px against a `gap-2.5` (10px), and the anchor is `relative` while the name group is not positioned, so the overlay paints over the gap plus ~2px of the name. The last sliver of a full-width name opens the sheet. **The tap-target test cannot see this** — it verifies that points inside the expanded box hit the link, which is the intended behaviour, and probes outside at `box.left - 3`. | Arithmetic against the authored classes. |
| 6 | `min-h-tap-min` is unconditional on the header line (`components/admin/wizard/step3ReviewSections.tsx:919`), so the Diagrams sub-block — which never renders a link, so the tap floor buys nothing — takes the same 44px as a peer, working against the deliberate `size-6` / `text-sm` subordination. | Read the class string. |

**Declined, and why.** Both agents raised the centred title (one as P1, one explicitly declining to
raise it as ratified). It is owner-ratified — chosen from a measured four-way comparison — and
relitigating it is out of bounds. One observation inside that finding is worth keeping, though, and
is recorded rather than argued: **all four compared options were centred variants, so no
left-aligned baseline was ever measured.** If the scan-axis cost is ever revisited, that is the
missing datum, not a new opinion.

**The process lesson, which is the durable part.** Four sub-agents were dispatched, none answered
within ~25 minutes, and the run treated "no reply" as "unavailable" and fell back. Three of them
were still working. A dispatch that has not answered is not a dispatch that failed, and the
distinction is worth a longer wait than 25 minutes on a gate whose entire purpose is independence:
the fallback cost 2-3 points of optimism in the scores and six findings.

### Assessment B — deterministic (reproducible)

Detector:

```
node <impeccable>/scripts/detect.mjs --json \
  components/admin/wizard/step3ReviewSections.tsx components/admin/BellPanel.tsx \
  components/admin/nav/AdminNav.tsx components/admin/nav/OnboardingTopBar.tsx \
  components/crew/sections/TravelSection.tsx
```

Exit 0. One finding, `broken-image` (warning) at `step3ReviewSections.tsx:3610` —
**false positive, and outside this diff.** `DiagramTile` renders a raw `<img>` with a real `src`
prop and an `onError` placeholder; the rule fires on the JSX tag shape without resolving the prop.
The raw `<img>` is a documented revert (`next/image` drops cookies), mirroring
`components/diagrams/Gallery.tsx`. No change.

Mechanical invariants, run against `git diff origin/main...HEAD -- 'app/**' 'components/**'`:

| Check | Result |
| ----- | ------ |
| Em-dash ban in user-visible copy | **PASS.** Every match in the diff is inside a JSDoc, CSS or JSX comment. |
| Typographic apostrophe in user-visible copy | **PASS.** The one bare-apostrophe match is inside a JSX comment. |
| 44px tap targets on added/changed interactive elements | **PASS**, and proven by hit test rather than by rect — see the tap-target case in `tests/e2e/section-header-layout.layout.spec.ts`. |
| No arbitrary px values or raw hex in `className` | **PASS.** The single `pr-[30px]` match is in a comment explaining why the token is used instead. |
| New/repurposed colour token has a contrast ratio pinned in DESIGN.md | **N/A.** The one token added is `--spacing-header-link-slot`, a spacing token with no contrast dimension. No colour token was added or repurposed — every chip and pill className is byte-identical to `origin/main`; only position changed. |

Contrast, computed from the resolved token hexes in `app/globals.css` (the light-mode root block, the dark
`@media` query and the `[data-theme]` attribute):

| Element | Pair | Light | Dark | Floor | Verdict |
| ------- | ---- | ----- | ---- | ----- | ------- |
| Count chip, `text-sm` | `text-subtle` on `surface` | 6.76 | 6.35 | 4.5 | PASS |
| Amber pill “Needs a look”, `text-xs` semibold | `warning-text` on `warning-bg` | 8.79 | 9.64 | 4.5 | PASS |
| Info pill “Parsed with judgment”, `text-xs` medium | `text-subtle` on `info-bg` | 5.64 | 5.89 | 4.5 | PASS |
| Corner link icon, default state | `text-subtle` on `surface` | 6.76 | 6.35 | 3.0 | PASS |

None reaches the project's 7:1 AAA figure, which PRODUCT.md states for **body** text; these are
chrome labels, and all four pairings predate this branch.

Corner link (`step3ReviewSections.tsx`, the `before:-inset-3` anchor): accessible name
`Open the source sheet for <label>` via `aria-label`; glyph `aria-hidden`; `target="_blank"` with
`rel="noopener noreferrer"`; `focus-visible` ring present. Hit area 44×44, verified by
`elementFromPoint` at four corners plus centre, with a fifth probe just outside proving the target
is bounded.

Removed-without-replacement sweep: the words **"In sheet"** are gone, replaced by an
external-link glyph. User-directed (see below), and the full sentence survives as the link's
accessible name, so screen-reader users lose nothing.

### Findings and dispositions

**[P2] The corner link's focus-ring offset painted the wrong surface — FIXED (`d9f80f953`).**
`focus-visible:ring-offset-2` fills a 2px gap with `--tw-ring-offset-color`. The class named
`ring-offset-surface`, but the header block sits on the shell's `bg-bg`
(`ReviewModalShell.tsx:623`) with nothing painting a background in between. Keyboard focus drew
`rgb(255,255,255)` over `rgb(250,250,249)` in light and the more visible `#16171c` over `#0f1014`
in dark. Carried forward verbatim from the "In sheet" link, so pre-existing — but the rebuild is
what makes this a bare icon whose focus state is the only cue a keyboard user gets. Now pinned by
comparison (offset colour vs the nearest actually-painted ancestor background), not by naming a
token.

**[P3] Header height varies 44px ↔ 72.8px down a list of sections.** Sections carrying a status
pill are 28.8px taller, so a column of breakdowns has a deliberately ragged rhythm. Accepted, not
deferred: the pill is the signal, the extra height is what makes it scannable while walking, and
smoothing it would mean either reserving empty space on every clean section (an empty element in a
gapped row — the exact class this batch removes) or animating a change spec §8 ratifies as instant.

**[P3] A count change shifts the centred name horizontally.** `(4)` → `(128)` widens the centred
group, moving the name a few px on a `router.refresh()`. `tabular-nums` prevents jitter *within* a
count but cannot prevent this. Accepted — instant per §8, and the alternative (reserving max
count width) costs static asymmetry on every section to avoid a rare one-time shift.

### Ratified by the owner — NOT findings

Two properties of this design would otherwise read as issues and must not be relitigated:

1. **The icon replaces the words “In sheet.”** Requested directly (“first easy win would be
   changing ‘In sheet’ to an icon like this... and appending to the title”). The discoverability
   cost is real and was accepted; mitigations are the conventional external-link glyph, the full
   sentence as the accessible name, and a hit area larger than the old text link's.
2. **The name + count are centred while section bodies are left-aligned.** Chosen from a measured
   comparison of four candidate layouts (option D1: name + count centred, link in the corner). The
   typographic tension is deliberate.

### Assessment A — design review (this context; see the degraded banner)

Product register: the bar is earned familiarity, not novelty. The rebuilt header uses a
conventional shape (leading status glyph, centred title, trailing action icon, status pill below)
and no invented affordance.

| # | Heuristic | Score | Key issue |
| - | --------- | ----- | --------- |
| 1 | Visibility of system status | 4 | Status is carried twice, by icon tint and by pill text. |
| 2 | Match system / real world | 3 | “Parsed with judgment” is system vocabulary, not the admin's. Pre-existing copy. |
| 3 | User control and freedom | 3 | The sheet link opens a new tab without saying so; the glyph is the only cue. |
| 4 | Consistency and standards | 3 | The header is now centred while every other heading on the surface is leading-aligned. Deliberate (ratified), but it is an inconsistency. |
| 5 | Error prevention | 4 | `hasRenderableCount` suppresses NaN / ±Infinity before render. |
| 6 | Recognition over recall | 3 | The icon-only link must be recognized rather than read. |
| 7 | Flexibility and efficiency | 3 | No keyboard shortcut to the sheet; Tab reaches it. |
| 8 | Aesthetic and minimalist design | 4 | The rebuild removed a spacer, a text label and a wrapping title. |
| 9 | Error recovery | 3 | Unchanged by this diff. |
| 10 | Help and documentation | 2 | Unchanged by this diff; no affordance explains what the pills mean. |
| **Total** | | **32/40** | |

Product-slop verdict: clean. No gradient text, no glass, no side-stripe, no eyebrow, no card
nesting; the one token added is a spacing token with a stated derivation.

Strengths: (a) the defect fixed is one a reviewer would not have found by reading — a one-word
title wrapping to three lines at 375px, which only measurement surfaced; (b) deleting the pushers
rather than sizing them removes the element instead of managing it; (c) the hairline got a floor
rather than a breakpoint hide, because measurement showed it never actually collapses in the
supported range.

Persona red flags. *Admin one-handed on a venue floor:* the 44px target is real and the glyph sits
in the corner where a thumb reaches; the icon-only affordance is the standing risk, mitigated by
convention. *First-time admin:* nothing on the surface explains what "Needs a look" or "Parsed
with judgment" mean — pre-existing, and heuristic 10's score reflects it.

---

## 13. Two spec assumptions measurement refuted

Both were invisible to prose review and are recorded so a later reader does not re-derive them.

1. **“Narrowing the row eventually drives a nav spacer to zero” — false.** Neither nav spacer ever
   reaches 0 across 320–1280 (minimums 59.91px and 134px, both at 360px), because their children
   collapse responsively faster than the row narrows. Spec §9.3 was amended to require structural
   absence for both nav rows instead of a crowded fixture driven to zero.
2. **“The hairline collapses in the supported range” — false.** It measures 22.94px at the
   narrowest real row (240px) and reaches 0 only at rows ≤215px, which no device produces. So the
   repair is a `min-w-4` floor, not a breakpoint hide. `min-w-6` (24px) was rejected on
   measurement: it exceeds the available width and wraps the label.

A third, found by the new width-chain assertion on its first run: the static matrix had been
rendering its 15 cells into a **561px** container at 1280px while the real route produces
**744px**. 561 was a spec-time estimate that nothing had ever compared against the product.
Corrected in `tests/e2e/_sectionHeaderWidths.ts` (now the single source both specs import) and in
spec §11.

## 14. Descoped

The static guard against childless growable flex items (spec §6) was descoped after three
adversarial rounds could not converge a rule that agreed with its own prototype — 27 registry rows
from the written rule versus 17 from the walker, all disagreements genuine ambiguity in “childless”
and “growable”. Filed as `BL-CHILDLESS-GROWABLE-STATIC-GUARD` with the constraints a revival must
clear. The four repaired pusher sites are covered by two executable oracles instead.
