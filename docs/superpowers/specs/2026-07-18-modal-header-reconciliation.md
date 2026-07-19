# Spec — Modal Header Reconciliation (published show ↔ wizard Step 3)

**Date:** 2026-07-18
**Slug:** `2026-07-18-modal-header-reconciliation`
**Design mock:** `docs/superpowers/specs/2026-07-18-modal-header-reconciliation-mock/` (`mock.html`, option `#1a` = the locked target; the two "Today" recreations are before-state reference)
**Surface:** admin published-show modal (`/admin?show=<slug>`)
**Routing:** UI work → Opus + impeccable v3 (AGENTS.md "Hard rule: UI work is always Opus / Claude Code")

---

## 1. Problem

The admin dashboard opens two review modals through the same shell
(`components/admin/review/ReviewModalShell.tsx`), but they speak different visual
languages in the one region a user compares them in — the header.

- **Wizard Step 3** (`components/admin/wizard/Step3ReviewModal.tsx:353-448`) reads
  well: an uppercase eyebrow, the title, a quiet client/date subline, and a single
  status chip parked beside the close button.
- **Published show** (`components/admin/showpage/PublishedReviewModal.tsx:244-309`)
  does not: the title row sits directly on top of a dense control row where a
  publish toggle, a two-line synced/edited stack, an alert badge, and a **filled
  orange Copy button** all compete. The orange Copy fights the orange publish
  toggle for the same "this is the primary action" signal, and the header carries
  no client/date context at all even though the modal has that data in hand.

The two modals are the same product surface one keystroke apart. They should read
as one family.

## 2. Goal / non-goals

**Goal.** Rebuild the published modal's header region in Step 3's frame: a header
band that carries identity (title, sheet link, client/date subline, alert pill)
and a separate, quieter control strip below the seam that carries live controls
(publish toggle, sync status, Re-sync, copy link). After the change the publish
toggle is the only orange **control** in the header region, with exactly one
ratified non-control exception — the Live-now indicator (§4.2).

**Non-goals.**

- Step 3's header does not change. Any diff to its rendered output is a regression.
- The modal body, rail, sections, footer, scrim, focus behavior, and drag-dismiss
  are untouched.
- No data-model, RPC, migration, or telemetry change. No mutation surface is
  added, removed, or re-gated: Re-sync's relocation (§4.3) moves a client trigger
  between two render sites and leaves `/api/admin/sync` and its auth untouched.
- The alert *destination* does not change (`#overview` stays the target).
- Re-sync's own behavior (shrink-hold protocol, coded results, retry semantics)
  does not change — only where its trigger and result surfaces render.

## 3. Live-code citation pass

Verified against the worktree at `origin/main` = `91149861a`, 2026-07-18. Every line number below was RE-verified after rebasing onto that commit — a rebase can shift them, so treat a stale base hash as a reason to re-run the citation pass, not a formality.

| Claim | Verified at |
| --- | --- |
| Shell renders one `<header>`, consumer supplies content | `ReviewModalShell.tsx:430-435` |
| Shell props (`header`, optional `footer`, no sub-header slot today) | `ReviewModalShell.tsx:54-71` |
| Published header slot (title row + `<StatusStrip>`) | `PublishedReviewModal.tsx:244-309` |
| Published modal's only `StatusStrip` render site | `PublishedReviewModal.tsx:292-307` |
| Step 3 header (eyebrow → title → subline; chip + close) | `Step3ReviewModal.tsx:353-448` |
| Step 3 subline data | `Step3ReviewModal.tsx:289-290`, `388-403` |
| `dateSummarySegments` helper | `components/admin/wizard/step3ReviewSections.tsx:261` |
| `clientLabel` on the SHARED section-data type | `components/admin/review/sectionData.ts:28` |
| `clientLabel` populated for the PUBLISHED adapter | `components/admin/review/publishedAdapter.ts:64` |
| `StatusStrip` props incl. `renderTitle`, `chrome` | `StatusStrip.tsx:54-102` |
| Alert badge is an `<a href="#overview">`, not a span | `StatusStrip.tsx:244-257` |
| Alert badge 44px hit area via `before:-inset-y-3` | `StatusStrip.tsx:248-252` |
| Sync/edited two-line stack | `StatusStrip.tsx:227-242` |
| Copy-link render gate (`published && !archived && token`) | `StatusStrip.tsx:144-146` |
| `ShareLinkCopyButton` variants (`compact` bool only) | `ShareLinkCopyButton.tsx:19-31, 62-66` |
| Copy button's accent arm is the DEFAULT (shared) | `ShareLinkCopyButton.tsx:65` |
| `/admin/show/[slug]` is a 307 redirect stub | `app/admin/show/[slug]/page.tsx:20-42` |
| Transition count pin for `StatusStrip.tsx` = 8 | `tests/components/admin/showpage/pageTransitions.test.tsx:124` |
| Header-rhythm layout assertion | `tests/e2e/published-review-modal.layout.spec.ts:221-232` |
| `#overview` anchor existence pinned | `tests/components/admin/showpage/overviewSection.test.tsx:71` |

### 3.1 Findings that CHANGE the brief

Three assumptions in the feature request did not survive the citation pass. Each
is resolved below; implementers must follow this section, not the request.

**F1 — The alert badge is a link, not a badge.** `StatusStrip.tsx:245` renders
`<a href="#overview">` with hover/focus-visible affordances and a
`before:-inset-y-3` hit-area extension to clear the 44px tap floor. The mock draws
it as an inert `<span>`. **Resolution:** the header pill stays an anchor to
`#overview`, keeps its focus ring, and keeps a ≥44px hit area. The mock's inert
markup is a fidelity artifact of a static design canvas, not a decision to remove
navigation. Losing the jump would strand the only affordance connecting the header
count to the alert list.

**F2 — The subline needs no new props.** The request implies threading client/date
data into the modal. It is already there: `PublishedReviewModal` receives `data:
PublishedSectionData`, and `sectionData.ts:28` declares `clientLabel: string |
null` with `publishedAdapter.ts:64` populating it from `show.client_label`;
`data.dates` feeds the same `dateSummarySegments` helper Step 3 uses. **Resolution:**
derive the subline from `data`, exactly as Step 3 does. Zero prop-signature change
to `PublishedReviewModal`, zero change to `app/admin/_showReviewModal.tsx`.

**F3 — `ShareLinkCopyButton` is shared across THREE call sites; its default arm
cannot be restyled.** Live inventory:

| Call site | Arm |
| --- | --- |
| `app/admin/show/[slug]/ShareLinkBody.tsx:53` | default (accent) |
| `app/admin/show/[slug]/ShareChip.tsx:44` | `compact` |
| `components/admin/showpage/StatusStrip.tsx:261` | default (accent) — the one this change restyles |

`ShareLinkBody` reaches this modal through the Overview `shareSlot`
(`PublishedReviewModal.tsx:212`), so restyling the default arm would silently
restyle the share panel mounted *inside this very modal*. **Resolution:** add a
third, explicit variant rather than mutating the default — see §6.4.

### 3.2 Citation evidence appendix

Every load-bearing `file:line` this spec cites, with its verbatim content at the
base commit. Regenerate this table whenever the base moves (§3) — a rebase shifts
line numbers, and a citation that silently drifts is how a spec starts directing
edits at the wrong contract.

**Why this lives in the spec rather than in a reviewer's packet.** Adversarial
review flagged unverifiable citations twice (rounds 4 and 9), each time because
the reviewer could not open the cited files. Answering that by pasting more
excerpts into the review prompt fixes one round and nothing else. The appendix
fixes it permanently and for everyone downstream: a reviewer, an implementer in a
fresh session, or a subagent with no repo access can all check a claim against
this table without tooling.

| File | Line | Verbatim content |
| --- | --- | --- |
| `components/admin/review/ReviewModalShell.tsx` | 430 | `<header` |
| `components/admin/review/ReviewModalShell.tsx` | 432 | `className="flex shrink-0 items-start gap-3 border-b border-border bg-surface px-tile-pad py-3…` |
| `components/admin/review/ReviewModalShell.tsx` | 449 | `{footer != null ? (` |
| `components/admin/review/ReviewModalShell.tsx` | 54 | `export type ReviewModalShellProps = {` |
| `components/admin/review/ReviewModalShell.tsx` | 71 | `};` |
| `components/admin/showpage/PublishedReviewModal.tsx` | 74 | `alertCount: number;` |
| `components/admin/showpage/PublishedReviewModal.tsx` | 114 | `alertCount,` |
| `components/admin/showpage/PublishedReviewModal.tsx` | 183 | `...(alertCount > 0` |
| `components/admin/showpage/PublishedReviewModal.tsx` | 194 | `{alertCount}{" "}` |
| `components/admin/showpage/PublishedReviewModal.tsx` | 212 | `shareSlot={shareSlot}` |
| `components/admin/showpage/PublishedReviewModal.tsx` | 243 | `initialFocusRef={closeRef}` |
| `components/admin/showpage/PublishedReviewModal.tsx` | 251 | `<div className="flex min-w-0 flex-1 flex-col gap-3">` |
| `components/admin/showpage/PublishedReviewModal.tsx` | 263 | `{openSheetHref !== null ? (` |
| `components/admin/showpage/PublishedReviewModal.tsx` | 270 | `className="inline-flex size-tap-min shrink-0 items-center justify-center rounded-sm text-text…` |
| `components/admin/showpage/PublishedReviewModal.tsx` | 292 | `<StatusStrip` |
| `components/admin/showpage/PublishedReviewModal.tsx` | 304 | `alertCount={alertCount}` |
| `components/admin/showpage/StatusStrip.tsx` | 144 | `// Copy-link renders only for an active crew link: published, not archived, token present.` |
| `components/admin/showpage/StatusStrip.tsx` | 154 | `const hasSignal = isLive \|\| (syncLabel != null && sync != null) \|\| alertCount > 0;` |
| `components/admin/showpage/StatusStrip.tsx` | 161 | `const containerClass =` |
| `components/admin/showpage/StatusStrip.tsx` | 167 | `<div data-testid="show-status-strip" className={containerClass}>` |
| `components/admin/showpage/StatusStrip.tsx` | 179 | `{title ?? slug}` |
| `components/admin/showpage/StatusStrip.tsx` | 194 | `{archived ? (` |
| `components/admin/showpage/StatusStrip.tsx` | 202 | `<div data-testid="strip-publish-toggle" className="shrink-0">` |
| `components/admin/showpage/StatusStrip.tsx` | 221 | `{!archived && isLive ? (` |
| `components/admin/showpage/StatusStrip.tsx` | 227 | `{syncLabel != null && sync != null ? (` |
| `components/admin/showpage/StatusStrip.tsx` | 237 | `{editedRel != null ? (` |
| `components/admin/showpage/StatusStrip.tsx` | 244 | `{alertCount > 0 ? (` |
| `components/admin/showpage/StatusStrip.tsx` | 248 | `// The visible pill stays slim (text-xs); before:-inset-y-3 extends the HIT AREA to the` |
| `components/admin/showpage/StatusStrip.tsx` | 259 | `{copyUrl != null ? (` |
| `components/admin/showpage/StatusStrip.tsx` | 261 | `<ShareLinkCopyButton url={copyUrl} />` |
| `components/admin/wizard/Step3ReviewModal.tsx` | 289 | `const client = data.clientLabel;` |
| `components/admin/wizard/Step3ReviewModal.tsx` | 290 | `const segs = dateSummarySegments(data.dates ?? undefined);` |
| `components/admin/wizard/step3ReviewSections.tsx` | 261 | `export function dateSummarySegments(dates: ParseResult["show"]["dates"] \| undefined): string…` |
| `components/admin/review/sectionData.ts` | 28 | `clientLabel: string \| null;` |
| `components/admin/review/publishedAdapter.ts` | 64 | `clientLabel: str(show.client_label) \|\| null,` |
| `components/admin/ReSyncButton.tsx` | 83 | `useEffect(() => {` |
| `components/admin/ReSyncButton.tsx` | 136 | `return (` |
| `components/admin/ReSyncButton.tsx` | 138 | `<AccentButton` |
| `components/admin/ReSyncButton.tsx` | 150 | `{pending ? "Syncing…" : "Re-sync from Drive"}` |
| `components/admin/ReSyncButton.tsx` | 152 | `{errorCode ? (` |
| `components/admin/ReSyncButton.tsx` | 162 | `{heldShrink && !errorCode ? (` |
| `components/admin/ReSyncButton.tsx` | 204 | `{successMessage && !errorCode ? (` |
| `components/admin/PublishedToggle.tsx` | 59 | `"absolute inset-x-0 top-full z-40 mt-1 break-words rounded-sm p-2 text-sm shadow-tile";` |
| `components/admin/CorrectionLoopCallout.tsx` | 43 | `{children ? <div className="shrink-0">{children}</div> : null}` |
| `components/admin/StatusIndicator.tsx` | 27 | `live: "bg-status-live",` |
| `components/admin/showpage/OverviewSection.tsx` | 126 | `<div data-testid="overview-sheet-sync" className="flex flex-col gap-3">` |
| `components/admin/showpage/OverviewSection.tsx` | 127 | `{archived ? (` |
| `components/admin/showpage/OverviewSection.tsx` | 133 | `<ReSyncButton slug={slug} />` |
| `components/admin/showpage/OverviewSection.tsx` | 138 | `{openSheetHref ? (` |
| `app/admin/show/[slug]/ShareLinkCopyButton.tsx` | 49 | `resetRef.current = setTimeout(() => setCopied(false), 2_000);` |
| `app/admin/show/[slug]/ShareLinkCopyButton.tsx` | 61 | `aria-label={copied ? "URL copied to clipboard" : "Copy URL"}` |
| `app/admin/show/[slug]/ShareLinkCopyButton.tsx` | 65 | `: "inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-accent p…` |
| `app/admin/show/[slug]/ShareLinkCopyButton.tsx` | 97 | `) : copied ? (` |
| `app/admin/show/[slug]/ShareLinkCopyButton.tsx` | 106 | `className="sr-only"` |
| `app/admin/show/[slug]/ShareChip.tsx` | 44 | `<ShareLinkCopyButton url={url} compact />` |
| `app/admin/show/[slug]/ShareLinkBody.tsx` | 53 | `<ShareLinkCopyButton url={url} />` |
| `app/admin/_showReviewModal.tsx` | 253 | `const { archived, published, dates, venue, driveFileId } = publishedData;` |
| `app/admin/_showReviewModal.tsx` | 336 | `const isLive = published && isShowLiveOnDate(dates as never, todayIso);` |
| `app/admin/_showReviewModal.tsx` | 382 | `isLive={isLive}` |
| `app/globals.css` | 89 | `--color-status-live: var(--color-accent);` |
| `app/globals.css` | 146 | `--tracking-eyebrow: 0.12em;` |
| `app/globals.css` | 162 | `--spacing-tap-min: 44px;` |
| `app/globals.css` | 211 | `--radius-pill: 999px;` |
| `app/globals.css` | 285 | `--color-warning-bg-runtime: #fff3d6;` |
| `app/globals.css` | 334 | `--color-warning-bg-runtime: #3a2e14;` |
| `app/globals.css` | 349 | `--color-status-review-runtime: #e0b84e;` |
| `tests/components/admin/showpage/pageTransitions.test.tsx` | 124 | `"components/admin/showpage/StatusStrip.tsx": 8, // renderTitle(+divider) / archived / control…` |
| `tests/components/admin/showpage/statusStrip.test.tsx` | 400 | `expect(classes, `page chrome must keep \`${token}\``).toContain(token);` |
| `tests/components/admin/showpage/statusStrip.test.tsx` | 408 | `expect(classes, `modal-header chrome must drop \`${token}\``).not.toContain(token);` |
| `tests/components/admin/showpage/overviewSection.test.tsx` | 71 | `// Strip alert badge (StatusStrip) links to #overview — the anchor must exist here.` |
| `tests/e2e/published-review-modal.layout.spec.ts` | 221 | `// page chrome inside the header until #480), the ONLY separation between` |

| `tests/e2e/_statusStripToggleHarness.tsx` | 62 | `function stripProps(overrides: Partial<StatusStripProps> = {}): StatusStripProps {` |
| `tests/e2e/_statusStripToggleHarness.tsx` | 111 | `return shell(wrap(React.createElement(StatusStrip, stripProps({ title }))));` |
| `tests/e2e/_statusStripToggleHarness.tsx` | 115 | `return shell(wrap(React.createElement(StatusStrip, stripProps({ title, finalizeOwned: true })…` |
| `tests/e2e/_statusStripToggleHarness.tsx` | 122 | `return shell(wrap(React.createElement(StatusStrip, stripProps({ title, isLive: true }))));` |
| `tests/e2e/_statusStripToggleHarness.tsx` | 127 | `*  classes + title <h1> as StatusStrip so the only height difference is the` |
| `tests/components/admin/showpage/statusStrip.test.tsx` | 197 | `renderStrip({ renderTitle: false, isLive: true, published: true }, { token: "TOK" });` |
| `tests/components/admin/showpage/publishedReviewModal.test.tsx` | 270 | `it("NO h1 inside the modal panel — the h2 is the only title node (StatusStrip title suppresse…` |
| `tests/components/admin/showpage/publishedReviewModal.test.tsx` | 323 | `it("StatusStrip renders inside the panel with the publish toggle present", () => {` |
| `tests/e2e/published-review-modal.layout.spec.ts` | 73 | `/** The StatusStrip's control row, scoped INSIDE the published modal. */` |
| `tests/e2e/published-review-modal.layout.spec.ts` | 169 | `isSheet ? "grab + header + main" : "header + main"` |
| `tests/e2e/published-review-modal.layout.spec.ts` | 198 | ``${isSheet ? `grab ${grabH} + ` : ""}header ${headerH} + main ${mainH}` +` |
| `tests/e2e/step3-review-modal.layout.spec.ts` | 222 | `test(`§5.1.1/§5.1.4: panel = header + main + footer${` |
| `tests/e2e/statusStripToggleLayout.spec.ts` | 5 | `* StatusStrip at a 390px phone. jsdom computes NO layout, so the strip-height +` |
| `components/admin/showpage/ShowReviewModalSkeleton.tsx` | 23 | `import { ReviewModalShell } from "@/components/admin/review/ReviewModalShell";` |
| `components/admin/showpage/ShowReviewModalSkeleton.tsx` | 44 | `header={` |
| `components/admin/showpage/ShowReviewModalSkeleton.tsx` | 64 | `</div>` |
| `components/admin/ReSyncButton.tsx` | 93 | `setSuccessMessage(null);` |
| `components/admin/ReSyncButton.tsx` | 121 | `setSuccessMessage(summarizeResult(json.result));` |
| `components/admin/ReSyncButton.tsx` | 122 | `router.refresh();` |

Verification: all 90 rows resolved at the base commit; zero missing files, zero
out-of-range lines. The test-file rows were added in round 10 — adversarial review
correctly applied the rule stated above: a claim citing a line absent from this
table IS a finding, because it means the appendix is incomplete.

## 4. Design deltas (locked)

Numbered as in the mock's option `#1a`.

1. **Subline added.** Header gains Step 3's quiet client/date line beneath the
   title row: `{clientLabel}` · 3px bullet · `{date segments joined " · "}`,
   `text-sm text-text-subtle`.
2. **Alert moves up.** The alert control leaves the control strip and takes the
   header's right-hand slot beside the close button — the same slot Step 3 uses for
   its review chip — restyled as a rounded pill (`rounded-pill`, `bg-warning-bg`,
   an 8px review-toned dot, `text-xs font-semibold`, label `N alert` / `N alerts`).
   Per F1 it remains an `<a href="#overview">`.
3. **Control strip becomes its own band.** The strip moves out of the header
   element into its own bordered row below the header seam — a sibling band, not a
   nested row.
4. **Copy goes neutral.** The filled orange Copy becomes an outline button
   (`border-border-strong`, transparent background, `text-text`) with a copy glyph
   and the label "Copy crew link". The publish toggle is then the only orange
   **control** in the region — see §4.2 for the one deliberate non-control
   exception.
5. **Status goes inline.** The stacked two-line synced/edited block collapses to
   one line: positive-toned dot · `Synced {rel}` · 3px bullet · `Edited {rel}`.
6. **Strip order.** `[Published label + toggle]` | 1px divider | `[status line]` |
   `[Re-sync]` | `margin-left:auto` | `[Copy crew link]`.
7. **Re-sync joins the strip** (mock revision 2, 2026-07-18). A ghost button —
   no border, no background, `text-text-subtle`, 13px, refresh glyph, label
   "Re-sync" — sits after the status line, left of the auto-margin. It is
   **moved**, not duplicated: the Overview rail's Re-sync affordance is removed
   in the same change so exactly one Re-sync control exists in the modal. See
   §4.3 (amendment) and §6.7 (mechanism).

### 4.1 Ratified decisions — do NOT relitigate

- **Sheet-link hit area stays 44px** (`size-tap-min`, `PublishedReviewModal.tsx:270`).
  The mock draws the slot at 24px; the glyph is `size-4` in both, so the rendered
  result is identical and only the hit rect differs. Ratified by the user 2026-07-18.
- **No `chrome`-prop gating is needed.** `StatusStrip` has exactly one production
  render site (`PublishedReviewModal.tsx:292`); `/admin/show/[slug]/page.tsx` is a
  307 redirect stub. Restyle directly. (Prop *removal* is separately gated — §6.5.)
- **The mock's inert `<span>` alert is not a decision to drop the `#overview` link** (F1).
- **The two "Today" panels in `mock.html` are reference, not targets.** They
  document the before-state deliberately.

### 4.2 RATIFIED — the orange budget, precisely

Delta 4's plain reading ("the toggle is the only orange") is violated by a
control the mock never draws: the **Live-now badge**. `StatusIndicator`'s live
dot is `bg-status-live` (`StatusIndicator.tsx:27`) and `--color-status-live` is
defined as `var(--color-accent)` (`app/globals.css:89`) — i.e. the SAME hue as
the publish toggle. It renders in the strip whenever `isLive`
(`StatusStrip.tsx:221-225`).

**Ratified (user decision, 2026-07-18): the Live-now dot keeps its accent hue as
a deliberate exception.** It is a distinct semantic — "this show is happening
right now" — and the highest-urgency signal the strip carries. The rule is
therefore stated precisely:

> The publish toggle is the only orange **control**. Exactly one non-control
> element may be orange: the Live-now indicator.

**Consequence for T-NO-ORANGE (§11).** A test asserting "no `bg-accent` in the
header region" is doubly wrong: it would MISS the live dot (which is
`bg-status-live`, a different class resolving to the same color) and it would
have no way to catch a future third orange. The test must instead enumerate the
accent-resolving elements in the region and assert the set matches EXACTLY — so a
third one fails, and removing the exception later is a deliberate edit rather
than silent drift.

**The expected set is state-dependent.** A single happy-path fixture would pin
only one row of this table and let a new orange slip into any other state, so all
three rows are asserted:

| State | Expected accent-resolving set | Why |
| --- | --- | --- |
| `!archived`, `isLive: true` | {publish toggle, live dot} | Both render (`StatusStrip.tsx:202-211`, `:221-225`) |
| `!archived`, `isLive: false` | {publish toggle} | Live badge is gated on `isLive`; asserting the live dot here would fail correctly |
| `archived: true` | {} — **empty** | Archived renders the archived badge instead of the toggle (`:194-201`) and suppresses the live badge (`:221`). No orange at all |

The archived row is the strongest of the three: it is the only state that proves
the assertion is measuring rather than matching a hardcoded expectation.

### 4.3 RATIFIED AMENDMENT — resync moves to the strip

The consolidated-admin-show-page spec §4 (quoted verbatim in
`StatusStrip.tsx:7-9`) reads:

> DISPLAY + 2 actions max — the publish toggle and the copy-link; everything else
> (share panel, **resync**, archive/unarchive, alert detail) lives in the Overview
> rail section (spec §4 last line …).

**This spec amends that rule**: the strip's budget becomes **3 actions** — publish
toggle, Re-sync, copy-link. Share panel, archive/unarchive, and alert detail stay
in Overview; the "2 actions max" ceiling and resync's Overview placement are the
only parts superseded.

**Authority:** user decision, 2026-07-18, in response to an explicit question
raised under AGENTS.md invariant 7 (spec is canonical; open a question rather than
silently fixing). The user chose "Move it — amend the old spec" over keeping both
controls or deferring. **Reviewers: this is ratified — do not relitigate the
placement.** What IS in scope for review is whether the move is executed
correctly (§6.7) and whether the removed Overview affordance leaves a hole (§7).

**Consequence — exactly one Re-sync.** Duplicating the control (strip *and*
Overview) was explicitly rejected. Any implementation that leaves a working
Re-sync button in `OverviewSection` has not completed the amendment.

## 5. Structure — before → after

```
BEFORE                                  AFTER
┌─ <header> ───────────────────┐        ┌─ <header> ───────────────────┐
│ ┌ title row ───────────────┐ │        │ title + sheetlink   [alert] │
│ │ title + sheetlink  [×]   │ │        │ client · dates         [×]  │
│ └──────────────────────────┘ │        └─────────────────────────────┘
│ ┌ StatusStrip (nested) ────┐ │        ┌─ control strip (NEW band) ──┐
│ │ toggle · live · sync/ed  │ │        │ Published[◉] │ ● Synced ·   │
│ │ · alert · [Copy]         │ │        │ Edited · Re-sync            │
│ └──────────────────────────┘ │        │             [Copy crew link]│
└──────────────────────────────┘        └─────────────────────────────┘
                                        (body unchanged, EXCEPT Overview
                                         loses its Re-sync button — §4.3)
```

The panel gains a **third band**. Any assertion modeling the panel as
`header + main` must become `header + strip + main` (§9).

## 6. Component contracts

### 6.1 `ReviewModalShell` — new optional `subHeader` slot

Add one optional prop:

```ts
/** Optional band rendered BETWEEN the header and the body, with its own bottom
 *  seam. Omitted → no element at all (Step 3 renders no extra element).
 *
 *  TYPE IS DELIBERATELY NARROWER THAN `ReactNode`. `ReactElement | false | null
 *  | undefined` admits exactly the shapes a band can meaningfully be — an
 *  element, or a `cond && <X/>` that collapsed — and makes `0` / `""` a COMPILE
 *  ERROR rather than a silently-omitted band. Prose alone did not close this:
 *  adversarial review raised the falsey-ReactNode hazard three times (rounds 5,
 *  7, 9) against a documented-but-untyped contract. The type closes it. */
subHeader?: ReactElement | false | null;
```

Rendered directly after `</header>`, mirroring the existing `footer` idiom
(`ReviewModalShell.tsx:449-456`) — wrapper only when the consumer provides one:

**Gate on truthiness, not `!= null`.** `false`, `""`, and `0` are all valid
`ReactNode` values that are NOT `null`, so a `!= null` gate renders an empty
bordered band for the extremely natural `subHeader={cond && <StatusStrip …/>}`.
An empty seam is precisely the regression this slot must not introduce. (The
existing `footer` gate at `ReviewModalShell.tsx:449` uses `!= null`; that is
pre-existing and out of scope, but do not copy it here.)

```tsx
{subHeader ? (
  <div
    data-testid={`${testIdBase}-subheader`}
    className="relative w-full shrink-0 border-b border-border bg-surface px-tile-pad py-2"
  >
    {subHeader}
  </div>
) : null}
```

**The band is NOT a flex container** — deliberately. If the band were
`flex … items-center` and `StatusStrip` stayed a plain `<div>`, the strip would
be a row-direction flex ITEM and shrink-wrap to its contents, so `ml-auto` on
`strip-copy-link` would push Copy only to the strip's own right edge — which
sits wherever the content happens to end, not at the band edge. The band
therefore supplies chrome only (surface, seam, padding, positioning) and the
strip's own root supplies the row:

```
StatusStrip root: "flex w-full flex-wrap items-center gap-x-4 gap-y-2 sm:flex-nowrap"
```

`w-full` is the invariant that makes right-flush reachable (§8). Asserted by
comparing the Copy button's right edge to the band's content-box right edge
(§11, T-COPY-FLUSH) — an overflow-only check cannot catch this, because a
shrink-wrapped strip overflows nothing.

`relative` is **load-bearing, not decorative**: the band is the positioned
ancestor for the publish toggle's popover AND the relocated Re-sync overlay
(§6.7). The modal panel is itself `relative`, so omitting it does not fail
loudly — `absolute inset-x-0 top-full` silently resolves against the whole panel
and the overlay lands below the entire modal instead of below the strip. Pinned
by T-OVERLAY (§11).

**Why the band owns the chrome (not the strip):** every other band in this shell
(`header`, `footer`) owns its own surface, seam, and `px-tile-pad`. Putting the
chrome on the strip instead would make `StatusStrip` the one component that styles
its own container differently depending on where it is mounted — which is exactly
the `chrome` prop this change deletes (§6.5).

**Step 3 invariance:** `Step3ReviewModal` does not pass `subHeader`, so the
conditional yields `null` and Step 3 **renders no additional element; its header
subtree is unchanged**. Deliberately NOT phrased as "byte-identical output" —
the shell's source does change (new optional prop, new conditional branch), so a
test serializing whole React output can pick up noise from that change and get
weakened in response. The invariant is scoped to what actually matters: no
`-subheader` element, and an unchanged header subtree. Pinned by
T-STEP3-INVARIANT (§11), which defines the exact comparison boundary.

### 6.1.1 `ReviewModalShell` has THREE consumers, not two

The third is the streaming loading state:
`components/admin/showpage/ShowReviewModalSkeleton.tsx:23-85`. It renders through
the SAME shell with the SAME identifiers as the loaded published modal —
`dataAttrPrefix="review-modal"`, `testIdBase="published-show-review"` — and its
header is the OLD nested two-band shape (`flex min-w-0 flex-1 flex-col gap-2`
wrapping a title row and a strip skeleton).

**It must adopt the three-band frame in this change.** Otherwise a slow
`/admin?show=<slug>` load renders the before-state header language, then snaps to
the after-state when content streams in — reintroducing exactly the layout this
change removes, at exactly the moment the user is watching the header. The
skeleton is the *only* thing on screen during that window, so the regression is
maximally visible.

Required, BOTH parts — the strip move alone is not sufficient:

1. **Move the strip placeholder** out of the skeleton's header into a `subHeader`
   band whose height and seam match the loaded modal's.
2. **Add a subline placeholder row** to the skeleton's header. The loaded header
   gains a client/date subline (§6.3) that the skeleton has no counterpart for
   today (`ShowReviewModalSkeleton.tsx:44-64` renders a title bar + close only).
   Without it the skeleton header is one line shorter than the loaded one, so the
   header→subheader boundary jumps downward the instant content streams in —
   the same class of snap the strip move exists to prevent, just on the other
   axis.

Both are pinned by T-SKELETON-BANDS (§11), which compares the skeleton's header
AND subheader heights to the loaded modal's rather than merely asserting the band
exists. A test that only checks for the presence of a `-subheader` element would
pass with a one-line header and still snap.

### 6.2 `PublishedReviewModal` — header slot

The header slot loses its outer flex-column wrapper (there is no second row left
inside the header) and adopts Step 3's two-child shape:

```tsx
header={
  <>
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-1">
        <h2 id={h2Id} data-testid={`${TESTID_BASE}-title`} className="min-w-0">
          <span className="min-w-0 wrap-break-word text-lg font-bold tracking-tight text-text-strong">
            {displayTitle}
          </span>
        </h2>
        {openSheetHref !== null ? (/* unchanged 44px anchor — PublishedReviewModal.tsx:263-274 */) : null}
      </div>
      {/* NEW subline — §6.3 */}
    </div>
    <div className="flex shrink-0 items-center gap-2">
      {alertCount > 0 ? (/* NEW alert pill — §6.6 */) : null}
      {/* unchanged close button — PublishedReviewModal.tsx:276-285 */}
    </div>
  </>
}
subHeader={<StatusStrip … />}
```

**No eyebrow.** Step 3's eyebrow ("Review before publishing") states the wizard's
task. The published modal has no equivalent task framing, and the mock's option
`#1a` renders no eyebrow. The mock's prose blurb mentions "eyebrow → title" while
its own markup omits it; **the markup is authoritative** — the blurb describes the
Step 3 frame generically. Do not invent eyebrow copy.

### 6.3 Subline

```tsx
const client = data.clientLabel;
const segs = dateSummarySegments(data.dates ?? undefined);
```

Rendered under the title row, `mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2
gap-y-0.5 text-sm text-text-subtle`, `data-testid={`${TESTID_BASE}-subline`}`:

- `client !== null` → `<span className="min-w-0 wrap-break-word">{client}</span>`
  followed by a 3px `rounded-pill bg-border-strong` bullet, `aria-hidden`.
- `client === null` → both the client span and its bullet are omitted (no orphan
  leading separator).
- Dates entry ALWAYS renders: `segs.length > 0 ? segs.join(" · ") : "Dates not detected"`.

This mirrors `Step3ReviewModal.tsx:388-403` exactly, including the
"Dates not detected" fallback string.

**Import placement.** `dateSummarySegments` currently lives in
`components/admin/wizard/step3ReviewSections.tsx:261`. Importing wizard code from
`components/admin/showpage/` crosses domains. **Resolution:** move the helper to
`components/admin/review/` (the existing shared-between-both-modals directory,
alongside `sectionData.ts` and `publishedAdapter.ts`) and re-export or update both
call sites. Pure move, no behavior change; `Step3SheetCard.tsx:53` and
`Step3ReviewModal.tsx:46` update their import paths.

### 6.4 Copy button — third variant

`ShareLinkCopyButton`'s boolean `compact` becomes insufficient (three styles, two
states). Replace with an explicit, exhaustive `variant` union:

```ts
variant?: "accent" | "compact" | "outline";  // default "accent" — today's behavior
```

- `"accent"` — today's default arm (`ShareLinkCopyButton.tsx:65`), unchanged. Used
  by `CurrentShareLinkPanel`.
- `"compact"` — today's icon-only arm (`:64`), unchanged.
- `"outline"` — NEW: `border border-border-strong bg-transparent text-text`,
  `rounded-sm px-3 py-1.5 text-sm font-semibold`, copy glyph + visible label
  "Copy crew link", `min-h-tap-min`, hover `border-border-strong`/`bg-surface-sunken`,
  the same `focus-visible:ring-2 ring-focus-ring` as its siblings.

The existing `compact` boolean is migrated at **all three** call sites (F3) in the
same commit; it is not kept as a deprecated alias (two spellings for one axis is
the defect being fixed). Migration map — every row must land or `pnpm typecheck`
fails:

| Call site | Today | After |
| --- | --- | --- |
| `ShareLinkBody.tsx:53` | `<ShareLinkCopyButton url={url} />` | `variant="accent"` (or omit — same default) |
| `ShareChip.tsx:44` | `<ShareLinkCopyButton url={url} compact />` | `variant="compact"` |
| `StatusStrip.tsx:261` | `<ShareLinkCopyButton url={copyUrl} />` | `variant="outline"` |

`ShareChip` is the easy one to miss — it is the only `compact` consumer and it
lives outside every surface this change is otherwise touching.

**Accessible name.** The accent/compact arms use `aria-label={copied ? "URL copied
to clipboard" : "Copy URL"}` (`:61`). The outline arm has a *visible* label, so it
must NOT carry a redundant `aria-label` that contradicts it — the visible text is
the accessible name, and the copied state is also announced through the existing
sr-only live region (`:106`). Guard: do not let the outline arm's visible label
and an `aria-label` disagree.

**Copied state — visible, not just announced.** The accent arm visibly swaps
"Copy" → "Copied" (`ShareLinkCopyButton.tsx:97-100`). The outline arm follows the
same contract: label swaps **"Copy crew link" → "Copied"** and the glyph swaps to
the check icon, on the existing 2s timer (`:49`). Announcing success only through
the live region would leave sighted users with no feedback at all — the button
would appear inert on click. T-COPY-OUTLINE asserts BOTH states; an idle-only
assertion is the failure mode here (§11).

Because the two labels differ in width and the button sits at the row's
`ml-auto` end, reserve the wider label's width so the swap does not shift the
button's left edge — same discipline as the Re-sync trigger (§6.7).

**Duplicate testid.** `data-testid="admin-current-share-link-copy-button"` (`:60`)
would then appear twice inside the open modal (strip + Overview share panel). That
duplication exists today and is out of scope to fix, but every new test MUST scope
its query to the strip (`[data-testid="strip-copy-link"] button`), never to the
bare testid, or it silently asserts against the share panel's button.

### 6.5 `StatusStrip` — prop removals (gated)

Per the ratified single-render-site finding, these props are candidates for
deletion. Each must be re-verified at implementation time; the rule is **delete
only what is unreachable from a production render path**, keep anything a test
pins as real intended behavior.

| Prop | Disposition | Rationale |
| --- | --- | --- |
| `renderTitle` | **Delete.** Strip never renders a title. | Only call site passes `false` (`PublishedReviewModal.tsx:305`). The `<h1>` branch (`StatusStrip.tsx:171-192`) is dead in production — the modal's `<h2>` is the dialog's only title node. Removing it also removes `strip-title` and `strip-title-divider`. |
| `chrome` | **Delete.** Band owns chrome now (§6.1). | Both arms (`StatusStrip.tsx:161-164`) collapse to the single flex-layout literal; the page arm's `sticky/z-30/border/px/py/shadow` is dead once the band supplies it. |
| `title` | **Delete.** | Its ONLY consumer is `title ?? slug` inside the deleted `<h1>` branch (`StatusStrip.tsx:179`). `slug` stays (it feeds `copyUrl` and the toggle); `title` becomes dead API the moment `renderTitle` goes. |
| `alertCount` | **Delete — from `StatusStripProps` ONLY.** | Both strip consumers leave: the alert badge (`:244`, relocated §6.6) and the `hasSignal` disjunct (`:154`), which §7 removes. **This does NOT starve the new header pill:** `alertCount` is `PublishedReviewModal`'s OWN prop (`PublishedReviewModal.tsx:74`, destructured `:114`) and is already consumed there independently of the strip — the Overview rail badge uses it at `:183-195`. Only the pass-through at `:304` disappears. Do not remove it from `PublishedReviewModalProps`. |
| `isLive` | **KEEP.** | Reachable: computed in `app/admin/_showReviewModal.tsx:336` and passed at `:382`. Renders `strip-live-badge`. See §7 for its placement. |
| `archived` | **KEEP.** | Reachable: `_showReviewModal.tsx:253` → `:377`-adjacent. Drives the read-only mode (§7). |
| `finalizeOwned` | **KEEP.** | Passed through to `PublishedToggle`; real behavior. |

Deleting `renderTitle`/`chrome` requires updating the e2e harnesses that construct
strip props (`tests/e2e/_statusStripToggleHarness.tsx:62-127`) — those harnesses
exercise the *page* chrome that no longer exists. See §9 (T-HARNESS).

**Named unit tests that assert the deleted props directly** (these fail loudly,
by design — they must be retired or rewritten, never merely deleted to get green):

- `tests/components/admin/showpage/statusStrip.test.tsx:400` — asserts the `page`
  chrome KEEPS a set of class tokens (`sticky`, `z-30`, seam, padding, shadow).
  The `page` arm ceases to exist; this assertion has no subject after the change.
- `:408` — asserts the `modal-header` chrome DROPS those same tokens. Its intent
  (the strip must not carry container chrome inside the band) survives the prop
  deletion and should be REWRITTEN against the single remaining layout literal,
  not dropped. It is the only guard against someone re-adding page chrome to the
  strip and double-seaming the band.
- `:197` and peers — construct props with `renderTitle: false`; the prop
  disappears, so these need their call shape updated.

The distinction matters: `:400` loses its subject (retire), `:408` keeps its
intent (rewrite). Retiring both would silently remove the double-seam guard.

### 6.6 Alert pill (header)

```tsx
<a
  href="#overview"
  data-testid={`${TESTID_BASE}-alert-pill`}
  className="relative inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-warning-bg px-2.5 py-1 text-xs font-semibold tabular-nums text-warning-text transition-colors duration-fast before:absolute before:-inset-y-3 before:inset-x-0 before:content-[''] hover:bg-warning-bg/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
>
  <span aria-hidden="true" className="size-2 shrink-0 rounded-pill bg-status-review" />
  {alertCount} {alertCount === 1 ? "alert" : "alerts"}
</a>
```

- The `before:-inset-y-3` idiom is retained from `StatusStrip.tsx:248-252` — the
  value is copied deliberately, not chosen fresh. Arithmetic: `text-xs` gives a
  ~16px line box, `py-1` adds 8px, so the visible pill is ~24px; `-inset-y-3`
  (12px each side) yields ~48px ≥ 44. **`-inset-y-2` would yield ~40px and MISS
  the floor** — the shipped implementation's `-3` is load-bearing. Still assert
  the measured rect (§11, T-TAP) rather than trusting this arithmetic: the pill's
  real height depends on the resolved line-height, and a future padding tweak
  changes the answer.
- The dot replaces today's `TriangleAlert` glyph per the mock. The count text
  carries the meaning; the dot is decorative and `aria-hidden`.
- The `bg-status-review` token must be confirmed to exist in `app/globals.css`
  during implementation; if the live token name differs, use the live name — do
  not port the mock's `#e0b84e` hex.
- `alertCount === 0` → the whole anchor is omitted (matches `StatusStrip.tsx:244`).
- **Count is capped at `99+`.** `alertCount` is unbounded, and the pill lives in
  the header's `shrink-0` right group beside Close — an uncapped four-digit count
  widens that group and squeezes the title/subline at 375px, breaking the Step 3
  frame this change exists to adopt. Display `alertCount > 99 ? "99+" : alertCount`,
  with the exact count preserved for assistive tech:

  ```tsx
  {/* The space before the sr-only span is its OWN visible text node — {" "} —
      NOT a leading space inside the span. A leading space inside sr-only is
      trimmed during accessible-name computation, yielding
      "99+ alerts(1200 open alerts)". Same bug class as the Overview rail badge
      (PublishedReviewModal.tsx:194-195). */}
  {alertCount > 99 ? "99+" : alertCount} {alertCount === 1 ? "alert" : "alerts"}
  {alertCount > 99 ? (
    <>
      {" "}
      <span className="sr-only">({alertCount} open alerts)</span>
    </>
  ) : null}
  ```

  **The unit stays VISIBLE.** A bare `99+` in the header is not self-explanatory;
  the word carries the meaning and the count qualifies it. Exact expected results:

  | `alertCount` | Visible text | Accessible name |
  | --- | --- | --- |
  | 1 | `1 alert` | `1 alert` |
  | 2 | `2 alerts` | `2 alerts` |
  | 1200 | `99+ alerts` | `99+ alerts (1200 open alerts)` |

  The sr-only suffix renders ONLY past the cap — below it the visible text is
  already exact, and a redundant "(2 open alerts)" would just make the name
  noisier. The suffix carries the UNIT, not a bare number: the point of preserving
  the exact count for assistive tech is preserving its meaning, and "1200 total"
  alone drops what 1200 counts.

  The separator space is its OWN visible text node — a leading space inside the
  `sr-only` span is trimmed during accessible-name computation, yielding
  "99+open alerts". This repo has hit that exact bug before; the same idiom is
  already used for the Overview rail badge (`PublishedReviewModal.tsx:194-195`).
  Pinned by T-ALERT-CAP (§11).

### 6.7 Re-sync relocation — mechanism

This is the highest-risk part of the change. `ReSyncButton` is not a bare button:
it owns `pending` / `errorCode` / `successMessage` state and a **shrink-hold
confirm panel** with WCAG 2.4.3 focus management (`ReSyncButton.tsx:60-90` —
`keepCurrentRef` focuses the SAFE "Keep current version" control; `triggerRef`
restores focus on cancel). Today those surfaces render in-flow beneath the button
inside Overview's `flex flex-col gap-3` wrapper (`OverviewSection.tsx:126`). A
horizontal control strip has nowhere to put them.

**Resolution — anchored overlay, following in-repo precedent.** `PublishedToggle`
already solves exactly this problem in exactly this strip: it anchors its popover
off the strip with `inset-x-0` / `top-full` (`PublishedToggle.tsx:50` documents
the positioned-ancestor requirement). Re-sync adopts the same idiom:

- `ReSyncButton` gains a `surface?: "flow" | "overlay"` prop, default `"flow"`
  (today's behavior, unchanged for every existing consumer).

  **`surface` gates layout AND the dismiss affordance — both, and only in
  overlay mode.** `"flow"` keeps today's non-dismissable in-flow panels exactly
  as they are: no dismiss control, no role restructure, no `absolute`. The
  dismiss controls specified below exist because a FLOATING panel can obstruct
  the rail; an in-flow panel inside Overview's column cannot, so adding them
  there would be unrequested scope on a surface this change is not touching.
  Any implementation that renders a dismiss button in flow mode has over-applied
  §6.7.
- **`"overlay"` must return a FRAGMENT, not a wrapper `<div>`.** Today the
  component's root is `<div className="flex flex-col gap-3">`
  (`ReSyncButton.tsx:136-137`) — correct for Overview's column, wrong here. If it
  survives, the strip gains a stray column wrapper as its flex item: the trigger
  is no longer a direct row item (so `items-center` and the row gap apply to the
  wrapper, not the button), and the absolute panels anchor to an unintended
  subtree. Required shape in overlay mode:

  ```
  <>  {/* no box — the trigger IS the strip row item */}
    <button …trigger… />
    {error   ? <div className="absolute inset-x-0 top-full z-50 …" /> : null}
    {shrink  ? <div className="absolute inset-x-0 top-full z-50 …" /> : null}
    {success ? <div className="absolute inset-x-0 top-full z-50 …" /> : null}
  </>
  ```

  **Overlay-over-body policy.** The body starts immediately below the band, so
  these panels float over rail content by design — they reserve no layout space
  (that is the point: an in-flow panel would reflow the band and shove the body
  down mid-action). To keep that from becoming an obscured-content bug:
  - `max-h-[min(50vh,20rem)]` with `overflow-y-auto` — long shrink detail or
    error copy scrolls inside the panel instead of blanketing the rail.
  - `shadow-tile` + the band's `bg-surface`, so the panel reads as a layer above
    the body rather than merging with it.
  - **Dismissal, per branch.** The shrink confirm dismisses via its own "Keep
    current version" (`ReSyncButton.tsx:78-82`) and **deliberately gets NO
    neutral dismiss and NO outside-click-to-close.** It is not a notification;
    it is a pending decision about the show's data — hold last-good, or apply the
    reduced version. A neutral X would create a third, ambiguous outcome ("I
    closed it — did it apply?"), and outside-click dismissal on a
    destructive-adjacent confirm is an accidental-data-loss vector. "Keep current
    version" IS the safe exit, which is exactly why focus lands there on open
    (`:83-85`). This matches the component's existing persistent-panel contract
    (`:78-82` documents that no auto-revert exists).

    Obstruction is handled by the height cap + internal scroll above, not by
    making the decision dismissable. If the admin needs to read rail content
    underneath before choosing, "Keep current version" is the non-destructive
    way out and re-running Re-sync restores the same choice. **Neither the error NOR the
    success branch self-clears** — verified: `successMessage` is set at
    `ReSyncButton.tsx:121` and cleared only at `:93`, the start of the *next*
    POST; there is no timer, and `router.refresh()` (`:122`) refreshes server data
    without touching local state. An earlier draft of this spec asserted "success
    self-clears"; that was wrong, and the correction matters because it was the
    justification for giving success no close path.

    Both non-confirm branches therefore **gain an explicit dismiss control** — a
    labelled close button that clears `errorCode` / `successMessage` and returns
    focus to the Re-sync trigger. Tolerable in-flow inside Overview's column;
    not tolerable floating over the rail.

    This is a deliberate reversal of the earlier "no new dismissal affordance"
    line: relocating a surface changed what that surface owes the user. Forcing
    an admin to re-run a mutation purely to clear an obstruction would be a worse
    bug than the layout one this move fixes. Esc is NOT the mechanism — the shell
    binds Esc to closing the whole modal, so overloading it here would either
    dismiss the dialog or require fighting the shell's handler.

    **Role semantics after adding the dismiss control — this is a RESTRUCTURE of
    existing markup.** Today `role="alert"` sits on the error branch's CONTAINER
    (`ReSyncButton.tsx:154`), which today holds only non-focusable content. Drop
    a dismiss button into that same container and the live region now contains a
    focusable control — the case this section exists to prevent. So the role must
    MOVE to the message node as part of adding the button; it is not a new
    attribute on a fresh element. Those live-region
    roles stay on the MESSAGE node only — never on a container that also holds
    the focusable dismiss button, which would announce the control as part of the
    alert. Required panel shape:

    ```tsx
    <div
      role="group"                    {/* explicit — a bare div with aria-labelledby
                                          is not reliably exposed as a named region */}
      aria-labelledby={msgId}
      className="absolute inset-x-0 top-full z-50 …"
    >
      <p id={msgId} role="alert">{catalogCopy}</p>
      <button aria-label="Dismiss sync error">…</button>
    </div>
    ```

    `role="group"` is required, not optional: `aria-labelledby` on a plain `<div>`
    gives the container an accessible name but no role to attach it to, so
    assistive tech is not obliged to announce it as a named region. With the role
    present, a keyboard user tabbing in reaches a named panel rather than an
    anonymous floating box, and the dismiss
    button's name says WHAT it dismisses ("Dismiss sync error" / "Dismiss sync
    result") rather than a bare "Dismiss" that is ambiguous once two overlay
    types exist.

    **The dismiss control is a real interactive control** and inherits every
    contract that implies: `min-h-tap-min`/`min-w-tap-min` (44px floor), a
    visible `focus-visible` ring matching its siblings, and the branch-specific
    accessible name required above — "Dismiss sync error" / "Dismiss sync result",
    never a bare "Dismiss". It joins the overlay-open focus order after the
    panel's own content. Pinned by T-TAP and T-RESYNC-FOCUS-ORDER (§11).

  A fragment generates no box, so the absolutely-positioned panels resolve their
  containing block to the nearest positioned ancestor — the band, which is
  `relative` (§6.1) while the strip root is not. That is exactly the intent, and
  it is why the strip root must NOT be given `relative`: doing so would silently
  re-anchor the overlays to the strip and break `inset-x-0` full-band width.

- `"overlay"` renders the trigger inline and **all THREE** result surfaces as
  `absolute inset-x-0 top-full z-50` beneath the strip band. The three are
  separate branches in `ReSyncButton.tsx` and each must be relocated — missing
  one leaves it rendering in-flow, reflowing the band:
  - `:152` error (`errorCode`) — coded copy via `lib/messages/lookup.ts`, never raw
  - `:162` shrink-hold confirm (`heldShrink && !errorCode`) — focus-managed
  - `:204` success (`successMessage && !errorCode`)
- The subheader band therefore needs `relative` (§6.1) — it becomes the
  positioned ancestor for BOTH the publish toggle's popover and the Re-sync
  overlay. `ReviewModalShell.tsx:449-456`'s footer already carries a `relative`
  for the same reason (RescanSheetButton's overlay at 390px), so this is the
  established pattern, not a new one.
- **Two overlays must not collide — deterministic stacking required.** The
  publish toggle's popover and the Re-sync overlay share the band as anchor and
  are independently triggerable. "They may overlap, focus must be reachable" is
  NOT sufficient: the publish popover is `z-40` (`PublishedToggle.tsx:59`), so an
  unspecified `z-*` on the Re-sync overlay can leave the shrink-hold confirm
  rendered UNDERNEATH it while focus sits on "Keep current version" — focus
  technically reachable, visually obscured, which defeats the WCAG 2.4.3 intent
  the focus management exists for.

  **Rule:** the Re-sync overlay renders ABOVE the publish popover (`z-50` vs the
  popover's `z-40`). Rationale: it is the only one of the two that can host a
  focus-managed, destructive-adjacent confirm; the publish popover is an
  informational refusal message. A focused control must never be occluded.

  **Assertion (T-OVERLAY):** with the publish popover already open, trigger a
  `shrink_held` Re-sync; assert `document.activeElement` is "Keep current
  version" AND that `elementFromPoint` at that control's center resolves to the
  control itself (or a descendant) — i.e. it is genuinely the topmost element,
  not merely focusable. Coordinates are viewport-relative. A test asserting only
  `toHaveFocus()` passes while the control is fully covered.

**Trigger styling — this is an accent→ghost DEMOTION, not a reskin.** Today the
trigger is an `<AccentButton>` (`ReSyncButton.tsx:138-150`) — i.e. currently
**orange**. Moving it into the strip unchanged would put a second orange beside
the publish toggle and directly contradict delta 4 ("the toggle is the only
orange"). The mock's ghost treatment is therefore load-bearing, not cosmetic.

Ghost per the mock: `inline-flex items-center gap-1.5 rounded-sm px-2 text-[13px]
font-semibold text-text-subtle`, hover `text-text`/`bg-surface-sunken`, standard
focus ring. Note `AccentButton` already supplies `minWidthTap` (`:147`); the ghost
replacement must carry its own `min-h-tap-min` — the mock's ~30px box is **below
the 44px floor**. Use `min-h-tap-min`, or the `before:-inset-y-*` hit-area idiom
if the visible height must stay at 30px. Assert it (§11, T-TAP); do not assume.

**Label change + width stability.** Today's labels are `"Re-sync from Drive"` /
`"Syncing…"` (`ReSyncButton.tsx:150`). In the strip the idle label shortens to
the mock's `"Re-sync"`; the pending label stays `"Syncing…"`. Those two strings
differ in width, and the trigger sits in a horizontal row between the status line
and an `ml-auto` Copy — so a naive swap **reflows the strip mid-action**, moving
Copy under the user's cursor.

Requirement: the trigger reserves the width of its widest label (e.g. a
`min-w-[…]` sized to `"Syncing…"` at the strip's font, or a fixed-width label
slot) so the idle→pending swap cannot change its box. This is a dimensional
invariant (§8) and gets its own real-browser assertion comparing the trigger's
`getBoundingClientRect().width` idle vs pending (§11, T-RESYNC-WIDTH) — the
idle-only fixture in T-LAYOUT cannot catch it.

**Alignment.** `AccentButton` is invoked with `selfStart` (`:145`), correct for
Overview's `flex-col`. In the horizontal strip the trigger must align to the row's
center like its neighbours; `selfStart` must not be carried over verbatim.

**What stays in Overview — exact post-move shape.** `CorrectionLoopCallout` (the
"Fixed it in the sheet? Edit the cell, save, then re-sync." guidance,
`CorrectionLoopCallout.tsx:26-27`) is **guidance, not an affordance** — its
`children` slot is already optional (`:43`, `children ? … : null`). It stays,
rendered without a child button.

Today's three-arm ternary (`OverviewSection.tsx:127-137`) becomes:

```tsx
<div data-testid="overview-sheet-sync" className="flex flex-col gap-3">
  {archived ? (
    <span data-testid="admin-show-resync-archived" …>
      Re-sync is paused while this show is archived.
    </span>
  ) : hasActionableWarnings ? (
    <CorrectionLoopCallout mode="resync" />   {/* no child button */}
  ) : null}                                    {/* ← third arm empties */}
  {openSheetHref ? (/* unchanged "Open sheet" link — OverviewSection.tsx:138 */) : null}
</div>
```

Three things this pins, each a way the move can go wrong:

1. **The third arm becomes `null`**, not an empty element. A non-archived show
   with no actionable warnings simply has no first child.
2. **The `overview-sheet-sync` wrapper STAYS.** It is not emptied — it still
   hosts the "Open sheet" link (`:138`). Deleting the wrapper because its first
   child can now be `null` would silently drop `openSheetHref`.
3. **No Re-sync button remains in any arm.** Keeping one to avoid an empty branch
   violates the §4.3 "exactly one Re-sync" amendment.

The lexical conditional count is unaffected: the `{archived ? (` head at `:127`
survives, which is why `OverviewSection` stays at 4 (§9).

**Archived.** Overview's archived arm today replaces the button with a paused
notice (`OverviewSection.tsx:127-130`: "Re-sync is paused while this show is
archived."). Since Re-sync mutates via `/api/admin/sync`, the strip must NOT
render a Re-sync trigger when `archived` — see §7. The paused-notice copy stays
in Overview so the explanation is not lost.

## 7. Guard conditions

Every input, and what renders. The mock covers only the happy path; these are the
states it does not draw and are the highest-risk part of this change.

| Input | Value | Behavior |
| --- | --- | --- |
| `title` | `null` or `""` | `displayTitle = title \|\| slug` (unchanged, `PublishedReviewModal.tsx:151`). Never an empty accessible name. |
| `data.clientLabel` | `null` | Client span AND its trailing bullet omitted. Dates entry still renders. |
| `data.dates` | `null`/empty | Subline renders literal "Dates not detected". Subline never disappears entirely. |
| `openSheetHref` | `null` | Sheet-link anchor omitted (no dead anchor) — unchanged. |
| `alertCount` | `0` | Header alert pill omitted; header right slot holds close only. |
| `alertCount` | `1` vs `>1` | "1 alert" vs "N alerts". |
| `archived` | `true` | Strip shows `strip-archived-badge`, NO toggle, NO copy-link, NO live badge (`StatusStrip.tsx:194-211`, `221`, `144-146`). **The strip band still renders** — it is not empty (the archived badge + status line occupy it). |
| `published` | `false` | Copy-link omitted (crew link paused). Toggle still renders, OFF. |
| `token` | `null` | Copy-link omitted. |
| `lastSyncedAt` | `null` | Entire status element omitted (`StatusStrip.tsx:227`) — the "never" sentinel must not render. |
| `lastSyncStatus` | non-`ok` bucket | Status text is the health label (e.g. a parse-error label), NOT "Synced {rel}" (`StatusStrip.tsx:128-133`). The dot takes the bucket color, not always positive. **The mock's green "Synced just now" is one bucket of several.** |
| `editedRel` | `null` (error buckets, or never synced) | Single-line status renders WITHOUT the trailing bullet + "Edited …" — no orphan separator. This is the §4.5 collapse's main new failure mode. |
| `isLive` | `true` | `strip-live-badge` renders in the strip (see below). |
| `finalizeOwned` | `true` | Toggle disabled in both publish states (passthrough, unchanged). |
| `archived` (Re-sync) | `true` | **No Re-sync trigger in the strip.** Re-sync mutates via `/api/admin/sync`, which an archived show must not reach (`OverviewSection.tsx:124-130`). Overview keeps the "Re-sync is paused while this show is archived." notice so the reason is still stated. |
| `hasActionableWarnings` | `true` | `CorrectionLoopCallout` still renders in Overview as guidance, now with NO child button (§6.7). Its copy must not become a dead reference — it says "then re-sync", and the control it points at now lives in the strip, which is visible from Overview (the strip is a fixed band, not scrolled away). |
| Re-sync | `pending` | Label swaps `"Re-sync"` → `"Syncing…"`, `disabled` + `aria-busy` (`ReSyncButton.tsx:141-143`). Trigger width is RESERVED so the strip does not reflow (§6.7, §8, T-RESYNC-WIDTH). |
| Re-sync | `errorCode` set | Coded result renders in the overlay (§6.7), never a raw code — routed through `lib/messages/lookup.ts` as today (invariant 5, unchanged). |
| Re-sync | `heldShrink` set | Shrink-hold confirm renders in the overlay with focus moved to "Keep current version" (`ReSyncButton.tsx:83-85`). Focus management MUST survive the relocation — this is the destructive-adjacent path. |

**`isLive` placement.** The mock does not draw the live badge. It is real and
reachable (`_showReviewModal.tsx:336`). It stays in the control strip, in its
existing position between the toggle-divider and the status line
(`StatusStrip.tsx:221-225`), and keeps its accent hue per the §4.2 ratified
exception. Rationale: it is a live *state* signal, matching the strip's remit,
and the header's right slot is now the alert pill's. Moving it or restyling it
would be an undesigned change to a shipped signal.

**Control-divider condition changes.** `showControlDivider` today is
`!archived && (isLive || sync || alertCount > 0)` (`StatusStrip.tsx:154-155`).
With the alert leaving the strip, `alertCount` is no longer a strip signal — the
disjunct MUST drop, or a show with only alerts renders a divider followed by
nothing. New: `hasSignal = isLive || (syncLabel != null && sync != null)`.
**This is a real bug the change would otherwise introduce.**

## 7.1 Theme — the mock is dark-only, the app is not

Verified 2026-07-18: every value in the mock's `:root` block is the live
**dark-theme** runtime token, byte-for-byte —
`--warning-bg:#3a2e14` = `--color-warning-bg-runtime` (`app/globals.css:334`),
`--review:#e0b84e` = `--color-status-review-runtime` (`:349`),
`--border-strong:#3a3b40` = `--color-border-strong-runtime` (`:326`),
`--sunken:#0b0c10` = `--color-surface-sunken-runtime` (`:320`).
Also confirmed live: `--spacing-tap-min: 44px` (`:162`), `--radius-pill: 999px`
(`:211`), `--tracking-eyebrow: 0.12em` (`:146`), `--color-status-review` (`:93`).

The app also ships a **light theme** (`globals.css:270-299`), where the same
tokens resolve very differently — e.g. `--color-warning-bg-runtime: #fff3d6` and
`--color-border-strong-runtime: #cfcdc7`. The mock says nothing about it.

**Requirement.** Every new style in this change is expressed as a **token class**
(`bg-warning-bg`, `text-warning-text`, `border-border-strong`,
`text-text-subtle`, `bg-status-review`, `rounded-pill`, `size-tap-min`), never as
a ported hex. Light mode then follows automatically. Two elements need explicit
light-theme contrast confirmation because they are new low-contrast treatments
introduced by this change:

- the **outline Copy** button — `border-border-strong` is `#cfcdc7` on light, a
  much weaker edge than the dark `#3a3b40`; confirm the control still reads as a
  button and not as disabled text.
- the **ghost Re-sync** trigger — `text-text-subtle` with no border and no
  background is the lowest-affordance control in the strip; confirm it clears
  contrast minimums on light.

The alert pill inherits an existing, already-shipped token pair
(`bg-warning-bg`/`text-warning-text`) and needs no new contrast work — only
confirmation that the 8px `bg-status-review` dot is not the sole carrier of
meaning (it is not; the count text carries it — §10).

**This requirement is executable, not advisory.** T-CONTRAST (§11) measures
computed colors in a real browser under both themes and asserts ≥3:1 for the
Copy border (WCAG 1.4.11, non-text UI boundary) and ≥4.5:1 for the ghost Re-sync
label (1.4.3, text). Token usage alone proves neither: a token can resolve to a
perfectly valid color that still disappears against this particular background.

## 8. Dimensional invariants

Tailwind v4 in this project does **not** default `.flex` to `align-items:
stretch` (AGENTS.md). Every parent→child dimension relationship below is stated
explicitly and verified in a real browser (jsdom computes no layout).

| Parent | Child | Invariant | Guaranteed by |
| --- | --- | --- | --- |
| panel (`flex flex-col`) | header / subheader / body | Bands stack; header + subheader never shrink | `shrink-0` on each band |
| panel | subheader band | Band width == panel content width | explicit `w-full` on the band — NOT inherited stretch (Tailwind v4 here does not default `.flex` to `align-items: stretch`, so the panel column does not stretch it for free) |
| `<header>` (`items-start`) | text block | Text block takes remaining width | `min-w-0 flex-1` |
| `<header>` | right action group | Never compressed by a long title | `shrink-0` |
| header right group | alert pill + close | Vertically centered relative to each other | `items-center` on the group |
| alert pill | hit rect | ≥44px tall | `before:-inset-y-*` pseudo-element |
| subheader band | `StatusStrip` root | Strip spans the FULL band content width | `w-full` on the strip root; band is NOT a flex container (§6.1) |
| strip root | strip children | Single row ≥sm, wraps <sm | `flex-wrap … sm:flex-nowrap` on the strip root |
| strip root | copy button | Right edge == band content-box right edge | `ml-auto` on `strip-copy-link`, **conditional on the `w-full` row above** |
| status line | dot + text | Baseline-consistent single line | `inline-flex items-center` |
| strip root | Re-sync trigger | Width IDENTICAL idle vs pending — no reflow mid-action | reserved min-width sized to the widest label (§6.7) |
| strip root | Re-sync trigger | Vertically centered with its row neighbours | `items-center` on the STRIP ROOT (the band is not a flex container — §6.1); `selfStart` NOT carried over |
| subheader band | Re-sync overlay | Anchors to the BAND, not the panel | `relative` on the band (§6.1) + `absolute inset-x-0 top-full` |

**Explicitly asserted in the real browser:** header height, subheader height,
their sum vs. the panel's pre-body offset, the alert pill's hit rect ≥44px, the
sheet-link anchor ≥44px, and no horizontal overflow of the panel at 375/390/768/1280.

## 9. Transition inventory

`StatusStrip.tsx` has a pinned conditional-mount count of **8**
(`pageTransitions.test.tsx:124`), enumerated as: `renderTitle(+divider) / archived
/ control-divider / live / sync / edited / alert / copy-link`.

After this change the strip's conditionals are: `archived` / `control-divider` /
`live` / `sync` / `edited` / `re-sync` / `copy-link` = **7**. (`renderTitle`
deleted §6.5; `alert` relocated §6.6; `re-sync` added §4.3 — it is conditional on
`!archived`.) `PublishedReviewModal.tsx`'s count moves from **1** (sheet-link) to
**3** (sheet-link, subline client entry, alert pill).

`OverviewSection.tsx` **stays at 4** — do NOT change its literal. The counter is a
purely lexical source scan (`pageTransitions.test.tsx:102-112`) matching the
ternary HEAD line, and chained arms are explicitly NOT counted separately
(`:116-117`). Overview's `sheet-sync` head is `{archived ? (` at
`OverviewSection.tsx:127`; the Re-sync move deletes the BUTTON from that
ternary's arms, not the head, so the head still matches and the count is
unchanged. Today's four hits are `:110` (`isCrewLinkActive`), `:127` (`archived`),
`:138` (`openSheetHref`), `:158` (`archived`).

**Enumeration is lexical, not semantic.** Verify every post-change count by
running the scan over the actual source, never by reasoning about which
components mount. A count that "should" move but doesn't (or vice versa) means
the edit landed differently than assumed — investigate before touching the
literal. Editing a count literal to make a red test green, without confirming the
enumeration, defeats the pin's entire purpose.

**These count literals MUST be updated in the same commit as the source change** —
the pin fails-by-default, which is the intent.

| State pair | Treatment |
| --- | --- |
| alert pill absent ↔ present | **Instant.** Follows data, not a state transition. |
| alert count N ↔ M | **Instant.** Text swap. |
| client entry absent ↔ present | **Instant.** Follows data. |
| dates present ↔ "Dates not detected" | **Instant.** Follows data. |
| copy button idle ↔ copied | Existing `transition-colors duration-fast` + sr-only announce, unchanged. |
| toggle idle ↔ pending ↔ settled | Existing `PublishedToggle` treatment, unchanged (§9-E precedent). |
| status line: edited present ↔ absent | **Instant.** |
| sync bucket ok ↔ error | **Instant** (color+label swap; existing `StatusDot` behavior). |
| live badge absent ↔ present | **Instant.** |
| archived ↔ not archived | **Instant.** Whole-mode swap; no cross-fade. |
| Re-sync idle ↔ pending | Existing `ReSyncButton` treatment, unchanged by the move. |
| sheet link absent ↔ present (`openSheetHref`) | **Instant.** Follows data (`PublishedReviewModal.tsx:263`). |
| status line absent ↔ present (`lastSyncedAt === null`) | **Instant.** A never-synced show that syncs for the first time mounts the line with no animation (`StatusStrip.tsx:227`). |
| copy link absent ↔ present (`published`/`token`/`archived`) | **Instant.** Publishing mounts Copy — must not animate or shift the row (`StatusStrip.tsx:259`). |
| control divider absent ↔ present | **Instant.** Derived from `hasSignal` (`StatusStrip.tsx:154-155`), whose inputs change with the states above. |
| Re-sync trigger absent ↔ present (`archived`) | **Instant.** Archive/unarchive is a whole-mode swap (§7). |
| Re-sync overlay absent ↔ present (result / error / shrink-confirm) | Existing treatment, unchanged — the surface relocates, its transition does not. |
| subheader band absent ↔ present | N/A — the published modal always renders it; Step 3 never does. Not a runtime transition. |

**Compound:** toggle mid-flight (`pending`) while the copy button is in its
`copied` state — both are independent color transitions on separate elements; no
shared parent animates. Asserted in the transition-audit task.

**Compound (overlay):** publish-toggle popover open while the Re-sync overlay is
open. Both anchor to the same band (§6.7). Neither animates the other; the
requirement is focus reachability, not motion. Asserted as T-OVERLAY (§11).

## 10. Accessibility

- Exactly one `<h2>` and no `<h1>` inside the dialog — preserved, and *reinforced*
  by deleting the strip's dead `<h1>` branch (§6.5). Pinned today by
  `publishedReviewModal.test.tsx:270`.
- Alert pill: an anchor with a discernible name ("N alerts"), visible focus ring,
  ≥44px hit area.
- Copy outline button: visible label IS the accessible name; no contradicting
  `aria-label` (§6.4).
- Decorative dots (`aria-hidden`): alert dot, subline bullet, status bullet,
  strip dividers.
- Focus order through the header region: title's sheet link → alert pill → close
  → publish toggle → **Re-sync** → copy link. Close retains initial focus
  (`initialFocusRef={closeRef}`, `PublishedReviewModal.tsx:243`). Re-sync sits
  between the toggle and copy, matching its DOM order in the strip (§4.6) — DOM
  order IS tab order here; no `tabindex` juggling.
- When the Re-sync overlay is open, its contents follow the trigger in tab order
  — Re-sync → "Keep current version" → "Apply reduced version" → Copy. This is
  intended, not incidental: the confirm's controls must stay adjacent to the
  trigger that produced them. The steady-state order above therefore describes
  the overlay-CLOSED case only, and T-RESYNC-FOCUS-ORDER asserts both states
  separately (§11). Never satisfy the simple order by hoisting the overlay after
  Copy.
- The shrink-hold confirm moves focus to "Keep current version" on open
  (`ReSyncButton.tsx:83-85`) and restores to the trigger on cancel (`:78-82`) —
  both behaviors survive the relocation unchanged.
- Color is never the sole signal: the sync dot always pairs with its text label;
  the alert dot pairs with the count.

## 11. Test plan

Anti-tautology: each test names the failure mode it catches. Derive expected
values from fixtures; never hardcode a value the fixture cannot produce.

| ID | Test | Failure mode caught |
| --- | --- | --- |
| T-STEP3-INVARIANT | Two scoped assertions, NOT a whole-panel snapshot: (a) the Step 3 modal contains zero `[data-testid$="-subheader"]` elements; (b) the Step 3 `<header>` subtree's `innerHTML` matches a baseline **captured from the PRE-change implementation and committed as a fixture file** (see §11.2) | The new shell slot leaks a wrapper or seam into Step 3. Scoping matters: a whole-panel snapshot fails on the shell's intentional new `null`-rendering branch, and the usual response is to loosen or delete the test — losing the real guard. Baseline provenance matters just as much: a test that captures baseline and candidate from the SAME post-change render proves nothing and passes a real Step 3 regression |
| T-SUBHEADER-SLOT | Shell renders the band only when `subHeader` is provided | Empty bordered band (a stray seam) on consumers that omit it |
| T-SUBLINE-CLIENT-NULL | `clientLabel: null` → no client span AND no orphan bullet | Leading separator with nothing before it |
| T-SUBLINE-DATES-EMPTY | empty `dates` → literal "Dates not detected" | Subline vanishes, header loses its second line |
| T-ALERT-PILL-LINK | Pill is an anchor with `href="#overview"` and name "2 alerts" | Regression to the mock's inert span — jump affordance lost (F1) |
| T-ALERT-PILL-ZERO | `alertCount: 0` → no pill | Empty pill / "0 alerts" |
| T-ALERT-CAP | Assert the full §6.6 table: 1 → `1 alert`; 2 → `2 alerts`; 1200 → visible `99+ alerts`, accessible name `99+ alerts (1200 open alerts)`; at 375px the header right group stays ≤50% of the header's width and the title element keeps a non-zero width with no horizontal overflow | Unbounded count widens the `shrink-0` right group and crowds the title at 375px, while every happy-path fixture passes. NB: the assertion is deliberately NOT "same width as the 2-alert case" — `99+ alerts` is legitimately wider than `2 alerts`, so an equal-width assertion would be false-red and the tempting fix would be dropping the visible unit §6.6 requires |
| T-ALERT-NOT-IN-STRIP | Strip contains no alert element | Alert rendered twice (moved but not removed) |
| T-DIVIDER-ALERT-ONLY | `alertCount>0`, not live, no sync → strip renders NO control divider | §7's real bug: divider followed by nothing |
| T-STATUS-INLINE | `editedRel` PRESENT → Synced and Edited sit on ONE line: assert both text nodes share a row (equal `getBoundingClientRect().top` within 2px, real browser) and a 3px separator renders between them | The headline delta of §4.5 silently not implemented — an implementer restyles colors/order but leaves the `flex-col` stack (`StatusStrip.tsx:235`). Every other status test (null-edited, error-bucket) passes against the stacked layout |
| T-STATUS-INLINE-NO-EDITED | `editedRel` null → one line, no trailing bullet | Orphan separator after the collapse |
| T-STATUS-ERROR-BUCKET | non-`ok` status → health label + bucket-colored dot, NOT "Synced …" | Hardcoding the mock's happy-path "Synced just now" |
| T-COPY-OUTLINE | BOTH states: idle shows "Copy crew link", post-click shows "Copied" + check glyph, no conflicting `aria-label`, button left edge unmoved across the swap; scoped to `strip-copy-link` | Restyling the shared accent arm (F3); asserting the share-panel button by mistake |
| T-COPY-ACCENT-UNCHANGED | `CurrentShareLinkPanel`'s button keeps the accent arm | F3 regression |
| T-NO-ORANGE | Accent-resolving elements in the header region match the EXACT expected set **for each of the three states in §4.2's table** — enumerated, not a `bg-accent` absence check | Delta 4 silently reverting; a `bg-accent`-only assertion that misses `bg-status-live` (same hue, different class); and a single-fixture test that pins only the live happy path |
| T-ARCHIVED-BAND | `archived` → band renders with archived badge, no toggle/copy/live | Empty or missing band in read-only mode |
| T-NO-H1 | No `<h1>` in the dialog (existing, must still pass) | Dead `<h1>` branch resurrected |
| T-COUNTS | `pageTransitions` counts: `StatusStrip` **7**, `PublishedReviewModal` **3**, `OverviewSection` **4 (unchanged)** — each verified by running the scan, not by reasoning (§9) | Undocumented new conditional mount; or a literal edited to green a red test |
| T-RESYNC-MOVED | Strip renders a Re-sync trigger; `OverviewSection` renders NO Re-sync button | §4.3 half-done — duplicated control, the outcome explicitly rejected |
| T-RESYNC-GUIDANCE | `hasActionableWarnings` → `CorrectionLoopCallout` still renders its copy in Overview, with no child button | Guidance deleted along with the button |
| T-RESYNC-ARCHIVED | `archived` → NO Re-sync trigger in the strip; Overview keeps the paused notice | Archived show reaching `/api/admin/sync` |
| T-RESYNC-SHRINK | Shrink-hold confirm renders in the overlay; focus lands on "Keep current version"; and it has NO neutral dismiss and does not close on outside click (§6.7) | WCAG 2.4.3 focus management lost in the relocation — destructive-adjacent |
| T-RESYNC-ERROR | A failing Re-sync renders its result in the OVERLAY (not in-flow under the strip), shows catalog copy, never a raw code, AND is dismissable without re-running the mutation — the dismiss control clears the overlay and returns focus to the trigger — assert the rendered text CONTAINS the `lib/messages/lookup.ts` copy and does NOT contain the raw code string. **Containment, not equality** — the branch legitimately renders `<ErrorExplainer>` PLUS `<HelpAffordance>` (`ReSyncButton.tsx:158-159`), so an equality assertion is false-red and the likely "fix" is deleting the help affordance | Invariant 5 violation: the relocation drops the lookup and leaks `SYNC_INFRA_ERROR`-style codes; or the error renders in-flow and reflows the band. T-RESYNC-SHRINK/T-OVERLAY both pass while this is broken — they only exercise the shrink path |
| T-OVERLAY-BOUNDS (real browser) | With long shrink detail, the overlay's height is capped and it scrolls internally rather than blanketing the rail; the band and body do not reflow when it opens | Overlay reserves no layout space by design, so an uncapped panel silently covers Overview controls while T-OVERLAY still passes |
| T-RESYNC-SUCCESS | A successful Re-sync renders its success message in the overlay and does not reflow the strip | Third result surface silently left in-flow; `ReSyncButton.tsx:204` is a separate branch from both error and shrink |
| T-OVERLAY (real browser) | Toggle popover + Re-sync overlay both anchor to the BAND (offsetParent is the band, not the panel); neither traps focus behind the other | Two overlays sharing one positioned ancestor; `relative` dropped from the band, silently reparenting the overlay to the panel |
| T-RESYNC-WIDTH (real browser) | Trigger `getBoundingClientRect().width` identical idle vs pending | Label swap reflows the strip and moves Copy mid-action — invisible to idle-only fixtures |
| T-RESYNC-GHOST | Strip Re-sync carries NO `bg-accent`/`AccentButton`; folded into T-NO-ORANGE | The accent→ghost demotion silently skipped, putting a 2nd orange beside the toggle |
| T-RESYNC-FOCUS-ORDER | **Overlay-CLOSED steady state:** sheet link → alert pill → close → toggle → Re-sync → copy. **Overlay-OPEN (shrink confirm):** … → Re-sync → Keep current version → Apply reduced version → copy — the confirm's controls sit DOM-adjacent to their trigger, which is the intent | Re-sync lands after Copy or is skipped; and an unscoped order test that runs with an overlay open, fails, and gets "fixed" by hoisting the overlay after Copy — destroying the confirm's focus proximity to its trigger |
| T-COPY-FLUSH (real browser) | Copy button's right edge == band content-box right edge (±1px) | Strip shrink-wraps as a flex item, so `ml-auto` flushes to the strip's edge, not the band's — invisible to overflow-based checks |
| T-SKELETON-BANDS | Skeleton renders a `-subheader` band; its header/subheader heights match the loaded modal's within tolerance | Loading state shows the OLD two-band header, then snaps — the before-state flashing at peak visibility |
| T-TAP (real browser) | Sheet link and Re-sync trigger: `getBoundingClientRect()` ≥44px (real boxes). Alert pill: **hit-behavior probe, NOT a rect measurement** — see below | Controls styled from the mock's sub-44px boxes; and a rect-based pill assertion that fails a correct implementation (§11.1) |
| T-TOKENS | No raw hex in the changed source; every new color/radius/spacing is a token class | Mock's dark-only hex ported verbatim, breaking light theme (§7.1) |
| T-CONTRAST (real browser, BOTH themes) | Measure computed colors and assert ratios: outline Copy's border vs band background ≥3:1 (WCAG 1.4.11 non-text UI boundary); ghost Re-sync's label vs band background ≥4.5:1 (1.4.3 text). Run under light AND dark | §7.1's requirement is otherwise unexecutable: T-TOKENS, T-COPY-OUTLINE and every layout test inspect classes and geometry, so a Copy button whose border vanishes on light — or a ghost Re-sync that reads as disabled — passes all of them |
| T-SUBHEADER-FALSEY | `subHeader={false}` renders NO band element; and a type-level check that `subHeader={0}` does not compile | `!= null` gate emits an empty bordered seam for `cond && <X/>`; and a `ReactNode`-typed prop silently swallowing `0` (§6.1 narrows the type so this is a compile error — `pnpm typecheck` is the enforcing gate, since vitest strips types) |
| T-RESYNC-NO-WRAPPER | In overlay mode the trigger is a DIRECT flex child of the strip root — no intervening wrapper element | The `flex flex-col gap-3` root survives the move, silently breaking row alignment and the gap while overlay/focus tests still pass |
| T-LAYOUT (real browser) | Panel = header + subheader + body; no horizontal overflow @375/390/768/1280 | Third band breaks the 2-band layout assumption |
| T-TRANSITIONS | Every §9 pair instant / as declared; compound toggle-pending × copy-copied | Undeclared animation on a data-driven swap |
| T-HARNESS | e2e strip harnesses build without `renderTitle`/`chrome` | Harness rot after prop deletion |

**Existing specs requiring update** (they encode the 2-band panel or the old strip
contract): `published-review-modal.layout.spec.ts` (`:169-198` panel composition,
`:221-232` header rhythm — the rhythm assertion's premise *dissolves*, since the
strip is no longer inside the header; it must be replaced by a band-composition
assertion, not merely retuned), `statusStripToggleLayout.spec.ts`,
`_statusStripToggleHarness.tsx`, `publishedReviewModal.test.tsx`,
`statusStrip.test.tsx`, `pageTransitions.test.tsx`, `overviewSection.test.tsx`
(`#overview` target must still exist AND the Re-sync assertions move/retire),
`step3-review-modal.layout.spec.ts`, plus any spec asserting `ReSyncButton`'s
in-flow result surfaces (grep `ReSyncButton` + `admin-show-resync` across
`tests/`).

**Scope note.** §4.3's Re-sync move means this change also touches
`components/admin/ReSyncButton.tsx` and `components/admin/showpage/OverviewSection.tsx`
— neither is "header" code. The plan must treat the move as its own task cluster
with its own tests, not as a rider on the header tasks.

### 11.1 How T-TAP must measure the alert pill (methodology, not detail)

The pill reaches 44px via a `::before` pseudo-element (`before:-inset-y-3`), and
**`getBoundingClientRect()` on the anchor cannot see it** — it returns the visible
anchor box (~24px). Asserting the rect would therefore FAIL a correct
implementation, and the natural "fix" would be to inflate the visible pill,
destroying the design.

Measure the behavior instead: probe `document.elementFromPoint` at the vertical
extremes of the intended target band and assert the anchor (or a descendant)
is what's hit.

```
const box = pill.getBoundingClientRect();
const cx  = box.left + box.width / 2;
const top = box.top + box.height / 2 - 21;   // 21px above center
const bot = box.top + box.height / 2 + 21;   // 21px below  → 42px spanned, inside 44
// both probes must resolve to the pill anchor or a node it contains
```

Coordinates are viewport-relative. This is the same class of check T-OVERLAY uses
and the only one that distinguishes "extends the hit area" from "looks big
enough". Apply the identical treatment to any other control that reaches the
floor via a pseudo-element rather than its own box.

### 11.2 T-STEP3-INVARIANT baseline provenance (anti-tautology)

The invariant is "Step 3's header did not change." A test can only prove that
against a baseline that predates the change. The tempting-but-worthless shape:

```ts
const a = render(<Step3ReviewModal …/>);   // post-change code
const baseline = a.querySelector("header").innerHTML;
// …later…
expect(header.innerHTML).toBe(baseline);   // compares post-change to itself
```

That passes no matter how badly Step 3 regressed.

Required instead — capture the baseline BEFORE touching `ReviewModalShell`, as
the first step of the shell task:

1. On the pre-change tree, render Step 3 from a fixed fixture and write
   `header.innerHTML` to a committed fixture file (e.g.
   `tests/components/admin/review/__fixtures__/step3-header-baseline.html`).
2. Commit it in the SAME task that adds the `subHeader` slot, so the PR diff
   shows the baseline arriving unmodified alongside the shell change.
3. The test renders Step 3 from that same fixture and compares against the
   committed file's contents.

The reviewer signal is then structural: if a later commit changes Step 3's
header, the fixture must change too, and that shows up in the diff as an explicit
edit rather than a silently-updated snapshot. Do NOT use a self-updating snapshot
format (`toMatchSnapshot` with auto-write), which would absorb the regression on
the next `-u` run.

## 12. Meta-test inventory

Declared per AGENTS.md writing-plans rules.

- **Creates:** none.
- **Extends:** `tests/components/admin/showpage/pageTransitions.test.tsx` (count
  literals — §9).
- **Not applicable, with reason:**
  - Supabase call-boundary (`_metaInfraContract`) — no Supabase call added.
  - Mutation-surface observability — no mutating route or action added or moved.
  - `admin_alerts` catalog — no new alert code.
  - Advisory-lock topology — no `pg_advisory*` in the diff.
  - Email canonicalization — no email handling.
  - §12.4 error-code catalog — no new code; no raw code reaches the UI.
  - `validation-schema-parity` — no migration.

## 13. Numeric sweep

| Value | Where it is authoritative | Cross-references |
| --- | --- | --- |
| 44px | tap floor (`size-tap-min` / `min-h-tap-min`) | §4.1, §6.6, §8, §11 T-TAP |
| 8 → 7 | `StatusStrip.tsx` conditional-mount pin | §9, §11 T-COUNTS |
| 1 → 3 | `PublishedReviewModal.tsx` conditional-mount pin | §9, §11 T-COUNTS |
| 4 → 4 (unchanged) | `OverviewSection.tsx` conditional-mount pin | §9, §11 T-COUNTS |
| 2 → 3 | strip action budget (amended ceiling) | §4.3 |
| 3px | subline + status bullet separators | §6.3, §7, §8 |
| 8px (`size-2`) | alert pill dot | §6.6 |
| 375/390/768/1280 | responsive assertion widths | §8, §11 T-LAYOUT |
| 3 | bands in the panel after this change | §5, §8, §11 T-LAYOUT |

## 14. Risks

1. **Header-rhythm assertion premise dissolves.** `published-review-modal.layout.spec.ts:221-232`
   exists to police the gap between the title row and the strip *inside* the
   header. After this change they are separate bands. Replacing it with a
   band-composition assertion (not deleting it, not merely retuning a number) is
   required; deleting coverage without replacement would be a silent regression.
2. **Shared-component blast radius.** `ShareLinkCopyButton` (F3) and
   `ReviewModalShell` (Step 3) are both shared. Both get explicit invariance tests.
3. **Prop deletion vs. harness coupling.** e2e harnesses construct full strip prop
   objects; deleting props breaks them at type-check, not at runtime. `pnpm typecheck`
   is a required gate (vitest strips types and will not catch this).
4. **Mock-fidelity overreach.** The mock is a static canvas: it has no archived
   mode, no error sync bucket, no live badge, no null-client state, no Re-sync
   pending/error/shrink-hold state, and inert anchors. §7 is the authority for
   those; the mock is the authority for the happy path's visual language only.
5. **Re-sync relocation is the riskiest item and expands the blast radius well
   beyond "header polish"** (§4.3, §6.7). It touches a stateful component with
   destructive-adjacent confirm flow and WCAG-motivated focus management, and it
   edits `OverviewSection`. If the pipeline needs to shed scope, this is the
   separable piece — the header reconciliation (deltas 1-6) stands alone without
   it. Flag rather than silently drop: the amendment is ratified.
6. **Overlay stacking inside a modal.** The Re-sync overlay anchors to a band
   inside an already-portalled dialog with a focus trap. Z-order and focus-trap
   interaction need real-browser verification (T-OVERLAY); jsdom will happily
   pass a broken stack.
