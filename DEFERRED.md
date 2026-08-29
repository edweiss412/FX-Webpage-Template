# DEFERRED.md

Open deferral queue — work intentionally deferred with a concrete un-defer trigger. Distinct from BACKLOG.md (might do, speculative).

**Resolved / stale / N/A entries live in [DEFERRED-archive.md](./DEFERRED-archive.md)** — full provenance kept there, NOT in this working queue. When an item below ships, move its full entry to the archive.

Last reconciled: 2026-07-24 — swept every merged PR body (#445–#570) for deferrals that never reached a ledger; strip-mobile entries graduated the same day. SETTINGS-DEVROW-GALLERY-RESIDUE-1 graduated 2026-07-24 (all four findings closed). Graduation provenance lives in [DEFERRED-archive.md](./DEFERRED-archive.md) (grep by id).

---

### ATTENTION-PILL-PHONE-LEGIBILITY-1 — impeccable P1: the pill now carries discovery alone at phone widths, at 12px in ~108px (2026-08-29)

**Effort:** S · **Facing:** product · **Un-defer trigger:** the first report of a missed actionable item on a phone, or any arc that opens the review-modal header's action cluster.

`fix/attention-autoopen-suppress-phone` stops the attention menu auto-opening below `sm`, because the panel covered the published toggle at 375 and, on the wizard, the entire chip rail. That change is right and shipped. What it also does is promote the pill from a redundant summary to the ONLY zero-scroll signal that actionable items exist — and the pill was built for the redundant job.

**The measurement.** The pill is `text-xs` (12px semibold) inside the shared header action cluster, which is capped at `max-sm:max-w-40` (160px) by `HEADER_ACTION_CAP` (`components/admin/review/headerActionCap.ts:21`, applied at `components/admin/showpage/PublishedReviewModal.tsx:1096`). The cluster also holds a 44px Close at `gap-2`, leaving roughly 108px for the pill. With both segments populated, "20 issues · 10 monitoring" wraps to two 12px lines under `max-sm:flex-wrap` (`:1128`). Measured live at 375x667 during the arc: the pill renders **84.4px tall**, because it has wrapped.

**Why it matters for Doug specifically.** PRODUCT.md puts him on the venue floor, one-handed, glancing, in variable lighting. A two-line 12px count 8px from a Close button that discards the modal is the wrong shape for that context, and it is now the first and only thing telling him anything is wrong.

**The recommendation from the critique**, kept because it is concrete: below `sm`, demote the monitoring segment to `sr-only` and let the urgent count own the full width at `text-sm`. Monitoring items are by definition the ones that do not need him now.

**Why deferred rather than fixed in that arc.** Class-sweep exception (a): it is a product decision, not a bug fix. Hiding the monitoring count on phones changes what Doug is told at a glance, and "the monitoring segment is not worth 12px of a 108px budget" is a call about his workflow that the arc that removed an auto-open cannot settle. The arc's own change is strictly subtractive and leaves the pill exactly as it was; this asks to make it louder, which is new design on a surface that arc does not otherwise touch.

**What that arc DID close** rather than leave with this: the sibling P1, that its occlusion assertion filtered pill-band interceptions out as "pre-existing", which would have stayed green while an invisible 12px band ate taps on the publish control. The assertion now covers every interceptor.

---

### DIAGRAMTILE-FAILURE-STATE-COPY-1 — impeccable P1: the failed diagram tile cannot say WHY it is dark, on the surface that gates publishing (2026-08-27)

**Effort:** S-M · **Facing:** product · **Un-defer trigger:** any work that opens `DiagramTile`'s placeholder branch, or the first report of a diagram publishing absent.

`DiagramTile` renders one string, "Preview unavailable" (`components/admin/wizard/step3ReviewSections.tsx:3896`), for two states the component already distinguishes INTERNALLY: not in the snapshot (`useState(!hasPreviewSource)` seeds `failed` true, no image element ever mounts) and the image failed to load (`onError` sets it true after a real request). They are merged at render.

**Why it matters where it is.** This grid is how Doug confirms diagrams made it into a show BEFORE he publishes. "Preview unavailable" reads as a rendering hiccup, so a diagram that is genuinely absent from the snapshot looks like a diagram that is present and slow. He can publish believing it is there.

**Why it WAS deferred rather than fixed by `perf/admin-diagram-next-image`.** Class-sweep exception (a): splitting the states needed NEW Doug-facing copy for a state that had never had its own words, which is a product decision that arc could not settle. **That exception is now RESOLVED — see the ratified copy below.** Blast radius is real too: `failed` is a single boolean, so the split threads a three-state value through the component, and every suite asserting the current string by text moves with it. The defect predates the arc — line 3896 is untouched by its diff, verified against the hunks — so shipping today is no worse than yesterday's main.

**RATIFIED COPY (2026-08-28).** Meaning ratified by Eric via mockup at 10:30, Option A,
consequence-stating; punctuation conformed to the `DESIGN.md` §9 em-dash ban by bl-orch ruling the
same day, meaning unchanged. Eric holds veto on the punctuation and may restore a colon form. The product
decision that held this row is made, so exception (a) no longer applies and this is ready to
build. Both strings state the CONSEQUENCE rather than the mechanism, which is the whole point:
"Preview unavailable" described the component's problem, and these describe Doug's. Use verbatim:

- **Not in the snapshot** (`useState(!hasPreviewSource)` seeded true, no image element ever
  mounts) — warn tone:

  > Not captured. Won't appear on the crew page.

- **Load failure** (`onError` after a real request) — reassure tone:

  > Preview couldn't load. The diagram will still publish.

The tones are part of the ruling, not decoration: the first state is the one that can cost Doug a
show, and the second is the one that must NOT make him think it will. Whoever picks this up
threads the three-state value, applies these two strings, and folds in the P2 border restyle
below in the same change.

**The em-dash ban was caught and settled BEFORE this row was built, which is the whole point of
the pre-code mechanical gate.** The originally ratified strings used em dashes, which `DESIGN.md`
§9 bans in user-visible copy — enforced by `tests/styles/_metaEmDashCopy.test.ts` over `lib`,
`components` and `app`. `DEFERRED.md` sits outside that accept-set, so the conflict would not have
surfaced until the copy was typed into `DiagramTile` and the gate went red. Settled by bl-orch on
2026-08-28: the strings above are period form and conform mechanically. A guard carve-out was
considered and DECLINED — weakening a ratified guard to admit copy is the wrong direction. The
strings above are final; type them verbatim.

**Partially mitigated in the meantime.** That arc DID land the half that needed no product decision: the placeholder now names which diagram is dark, using the `alt` already in hand (`…-diagram-tile-N-name`). A reviewer can now see WHICH tile failed, just not WHY.

**Fold in when this is picked up — impeccable P2, same surface.** The placeholder's border is `border-border` at roughly 1.22–1.38:1 against `bg-surface-sunken`, while the live tile's is `border-text-faint` at 3.02:1. The state that most needs to be noticed has the faintest edge, and on a sunlit loading dock it reads as empty space rather than as a failure. Whoever splits the states restyles this placeholder once, so the two belong in one change.

**New since 2026-08-27, and the reason this is more urgent than its age suggests.** The presentation is now DYNAMIC. `perf/admin-diagram-next-image` made the tile reconcile its failure state when the source changes under a stable React key, so a tile can flip between the 3.02:1 live edge and the 1.22:1 failed edge while Doug is looking at it, without a remount. Before that arc a tile's appearance was fixed once per mount.

**Evidence:** `/impeccable critique` on `perf/admin-diagram-next-image`, Assessment A, priority issues 1 and 4 (heuristic 9, Diagnose and Recover, scored 1/4 — the lowest score on the surface). The two-state claim is not inferred from the copy: it is read off the component, where the seed and the `onError` write are separate code paths that produce one indistinguishable render.

### TELEMETRY-RETRY-OUTCOME-ANNOUNCEMENT-1 — impeccable P1: the retry announces intent, never outcome (2026-08-27)

**Effort:** S for the mechanism, M with the prop threading and its tests

Surfaced by the invariant-8 dual gate on branch `feat/telemetry-fallback-retry` (critique P1,
audit P2 — recorded at the higher call). Findings and dispositions are in the closeout beside
`docs/superpowers/plans/2026-08-27-telemetry-fallback-retry.md`.

**The finding.** `components/admin/telemetry/TelemetryRetryButton.tsx` announces `Retrying <what>`
into its live region on every activation. On success the component unmounts with the branch it
lives in; on a repeated failure it re-renders the same phrase, distinguished only by a parity
toggle. Either way a screen-reader user hears the intent and never the outcome. A sighted user
sees the content appear or the fallback persist; a listener gets nothing that separates the two.

**Why it is deferred rather than fixed, with the probes that settle it.** The control has no
completion signal to announce, and this was measured rather than assumed:

1. `router.refresh(): void` — `node_modules/next/dist/shared/lib/app-router-context.shared-runtime.d.ts:32`.
   No promise, so nothing to await.
2. `bfcacheId` is the one router value that tracks navigation identity, and its own doc comment
   at `:57` says it "stays the same for ... `router.refresh()`". It is explicitly not this signal.
3. A SYNC `useTransition` around `router.refresh()` never exposes a pending state in this harness:
   a throwaway probe rendering exactly that shape asserted `isPending` after the click and FAILED.
   An ASYNC transition does expose one, mid-flight and cleared on settle, and passed — but it needs
   something real to await, and (1) says there is nothing. A timer would make `aria-busy` report a
   duration unrelated to the refresh, which is a lie rather than a fix.

**The mechanism that would fix it, so the next arc does not re-derive any of the above.** The only
honest completion signal is one the SERVER render changes. All three call sites already hold a
per-render timestamp in scope (`app/admin/dev/telemetry/page.tsx` awaits `nowDate()`,
`EventTimeline` receives `now`, `HealthAlertsPanel` computes its own). Threading it as a prop lets
the control record the value it saw at the tap and compare: a changed value while still mounted
means the retry completed and did not fix the branch, which is a settled outcome worth announcing.

**Its known fragility, stated up front.** That couples the announcement's correctness to a display
clock. If `nowDate()` were ever memoized to a stable value the announcement would silently stop,
and no test would red. Any implementation therefore owes a guard on the signal itself, not only on
the announcement.

**Un-defer trigger:** a second surface needing an outcome announcement from a `router.refresh()`
that reports nothing, OR a Next release giving `refresh()` a completion signal, OR a report of a
screen-reader user unable to tell a failed retry from a successful one on this page.

---

### CONTROLOUTLINE-PAIRED-CHROME-WEIGHT-1 — impeccable P1: two non-interactive chips now read lighter than the control they sit beside (2026-08-16)

**Effort:** S per site, M as a rule

Surfaced by the invariant-8 dual gate on branch `fix/control-outline-surface-fills` (critique P1,
audit P2 — recorded at the higher call). Findings and dispositions are in §12 of
`docs/superpowers/plans/2026-08-16-control-outline-surface-fills.md` (F1 and F2).

**The finding.** The 2026-08-16 ruling moved 21 CONTROLS to `border-text-faint`. DESIGN.md §1.2a
keeps `--color-border-strong` for non-interactive chrome, so two elements that share a recipe with
a swapped control correctly stayed put — and each is now the quieter half of a pair a reader sees
at once:

- `components/diagrams/GalleryLightbox.tsx:773`, the `aria-hidden` demote chip, against the Reset
  chip at `:708` it matches (same `rounded-pill bg-surface-raised px-4`, same shadow; `bottom-2`
  and `top-2` of the same image). 1.59/1.50 versus 3.35/3.53.
- `components/admin/StagedPreviewBanner.tsx:65`, the `aria-current` chip, standing in a row of
  picker links at `:75` that moved. The entry marked current carries the weakest boundary in its
  own row.

**Why deferred rather than repaired in-branch — reason (b) plus (a).** Spec
`docs/superpowers/specs/2026-08-16-control-outline-surface-fills-design.md` §4.4 ratifies the
second site verbatim ("non-interactive chrome: outside the census, keeps its token") and §1.2a's
scope paragraph ratifies the first, so moving either would move an element under a ruling the user
took against a mockup of BUTTONS resting on cards. The general question is a design decision:
should chrome that visually PAIRS with a control follow that control's outline weight, or does
chrome follow chrome? Neither site is a contrast finding — both are non-interactive, so SC 1.4.11
does not reach them, and both carry their state programmatically.

Both are recorded as documented limits in DESIGN.md §1.2a so the predicate and the tree do not
disagree while this sits open.

**Un-defer trigger:** a decision on whether §1.2a gains a pairing clause or an explicit "chrome
follows chrome" statement. Either answer closes both sites; per-site judgment closes neither.
Queue row: `BL-CONTROL-OUTLINE-PAIRED-CHROME-WEIGHT`.

### HELPTOUR-CARD-GRID-MEASURE-1 — impeccable P1: the tour's card grids inherit the 70ch prose cap and render a 10.5-character measure (2026-08-11)

**Effort:** M · **Status:** IN PROGRESS · **Branch:** fix/help-tour-grid-and-settings-card

Surfaced by the invariant-8 dual gate on branch `fix/help-tour-hydration` (PR #778), by BOTH halves
independently (critique P1, audit P1). Findings and dispositions are in §12 of
`docs/superpowers/plans/2026-08-10-help-tour-hydration-fix.md`.

**The finding.** `.help-prose` caps its column at `max-width: 70ch` (`app/globals.css:1148`), and
the tour page puts two card grids inside it — `md:grid-cols-2` (`app/help/tour/page.mdx:7`) and
`md:grid-cols-3` (`app/help/tour/page.mdx:53`). The three-column grid therefore divides a reading
measure three ways.

**Probed live 2026-08-11**, admin-signed-in, real render, three-column grid, body `<p>` at 16px:

| viewport | card width | body width | measure | card height |
| -------- | ---------- | ---------- | ------- | ----------- |
| 768px    | 146.7px    | 104.7px    | 10.5ch  | 811.3px     |
| 900px    | 190.7px    | 148.7px    | 14.9ch  | 617.2px     |
| 1024px+  | 224.1px    | 182.1px    | 18.2ch  | 513.2px     |

It does not improve past 1024px because the 70ch cap binds, not the viewport. `DESIGN.md` §2.5 caps
measure at 65-75ch; 10.5ch is a seventh of the floor, and the 768px card is 811px tall for 45 words.
Mobile (390px, one column) is unaffected and reads well.

**Why deferred rather than repaired in-branch — reason (b), a ratified scope decision already fences
it.** The arc's spec §1.1 states that any finding proposing copy or layout changes is out of scope;
the diff converts text children only, changing no class and no layout. The finding is PRE-EXISTING
on `origin/main` and survives the branch unchanged.

**Un-defer trigger.** The next arc that touches `/help` layout or `.help-prose`, or any report that
the tour page is hard to read on a laptop. **Two candidate repairs, and choosing between them is the
work:** drop the second grid to `md:grid-cols-2` (cheap, keeps the grid inside the prose column), or
lift both grids out of the 70ch cap with a full-bleed wrapper. The second is the better answer and
the larger change — it touches `.help-prose`, which every `/help/*` page renders through, so it owes
a sweep of the other twelve help pages for grids in the same position.

### HELPTOUR-SETTINGS-CARD-MISSING-1 — impeccable P1: /help/tour claims to cover every admin screen and omits one (2026-08-11)

**Effort:** S, but DESIGN-GATED · **Status:** IN PROGRESS · **Branch:** fix/help-tour-grid-and-settings-card

Surfaced by the invariant-8 dual gate on branch `fix/help-tour-hydration` (PR #778), critique P1.
Findings and dispositions are in §12 of
`docs/superpowers/plans/2026-08-10-help-tour-hydration-fix.md`.

**The finding.** The page opens "Below is every admin screen, grouped by when you use it"
(`app/help/tour/page.mdx:3`) and then renders **seven** cards. `app/help/_nav.ts` declares **eight**
`admin-surface` entries (`_nav.ts:22-29`); `/help/admin/settings` ("Settings") has no card. The
claim is false by one, on the one page whose job is to be exhaustive.

**Why deferred rather than repaired in-branch — reasons (a) and (b).** (a) The fix is a product
decision: adding a Settings card means choosing its group — Settings is neither daily nor per-show,
so it lands under "Once per environment" beside the onboarding wizard, which would make that group a
two-card grid and change the page's rhythm. Softening the intro instead ("the screens you will use
most") keeps the layout and gives up the completeness promise. Both are defensible; the page's
author should pick. (b) The arc's spec §1.1 fences copy changes out, and AC-2 requires the page's
text be preserved up to whitespace normalization.

**Not caught by any existing guard.** `tests/e2e/help-pages.spec.ts` asserts every NAV route renders;
nothing asserts the tour page LINKS to every admin-surface route.

**Un-defer trigger.** The next content pass on `/help/tour`, or a new `/help/admin/*` page being
added (which would widen the gap silently). Whichever repair is chosen, it should land with a
derived guard — the tour's card hrefs must cover the `admin-surface` slugs — so the class closes
rather than the instance.

### DIAGRAM-FAILURE-RECOVERY-1 — a failed diagram is inert for the rest of the page session (2026-08-11)

**Effort:** S

Surfaced by the invariant-8 dual gate on branch `feat/diagram-viewing-polish`, by the critique half
(P1). Findings and dispositions are in §12 of
`docs/superpowers/plans/2026-08-10-diagram-viewing-polish.md`.

**The finding.** A runtime image failure is terminal per item: `failedKeys` is never cleared in
either `components/diagrams/Gallery.tsx` or `components/diagrams/GalleryLightbox.tsx`, so one
dropped request on ballroom wifi costs that diagram until a full page reload the crew member has no
reason to attempt. The branch's repair makes the failure legible — focus relocates, and the event is
announced by name — but the announcement offers no next step, and the replacement cell is a
non-interactive `<div>`. Heuristic 9 (recover from errors) scored 2/4 on that account.

**Why deferred rather than repaired in-branch — reason (a), it needs a product decision this PR
cannot settle.** The obvious repair is to make the placeholder a "Retry" control, and the obvious
copy is "<name> could not be loaded. Tap to retry." Both are product calls this arc's ratified scope
(spec §1.1: the repair is focus relocation plus announcement) does not cover, and the mechanism has
a real cost: the asset route sends `private, max-age=0, must-revalidate` with no ETag
(`app/api/asset/diagram/[show]/[rev]/[key]/route.ts`), so a retry on a 1-5 MB original is a full
re-download, and a crew member tapping a dead tile twice pays for it twice. Whether the affordance
should exist at all, whether it should retry the clamped tier rather than the original, and what it
says while in flight are one decision, not three independent ones.

**Un-defer trigger.** A product decision on failure recovery for diagrams — either taken directly,
or forced by the first support report of a diagram that "just disappeared" on venue wifi.

### NAV-BADGE-ARRIVAL-ANNOUNCE-1 — the nav badge counts arrive after first paint with no announcement (2026-08-10)

**Effort:** S

Surfaced by the invariant-8 dual gate on branch `feat/admin-nav-badge-suspense`, by BOTH halves
independently (critique P1, audit P2). Findings and dispositions are in §12 of
`docs/superpowers/plans/2026-08-09-admin-nav-badge-suspense.md`.

**The finding.** That branch moves the two badge reads out of the layout's blocking path, so the
counts now land after the nav has painted. Two accessible names change at that moment:
`NotifBell.tsx` flips "Notifications" → "Notifications: N unseen", and `AdminNav.tsx`'s attention
tab flips "Needs attention" → "Needs attention, N items". Nothing announces the change. A screen
reader user who reads either control during the pending window and never returns to it keeps the
count-less name for the rest of the visit.

**Why deferred rather than repaired in-branch — reason (a), it needs a product decision this PR
cannot settle.** The repair is not the code; it is whether this surface should speak at all. The
app has one announce channel (`AdminAnnounceProvider`) with a strict ownership contract — the
region's owner must sit above every data-dependent branch (DESIGN.md §15), which the layout does
satisfy — but wiring the _global nav_ into it means every `/admin` entry with a nonzero count
announces on load. PRODUCT.md's register for this user is calm competence on a venue floor, and a
count that speaks on every page load may be exactly the chatter that register rejects. Whether the
badge should announce, and if so whether only on the first resolution and only above zero, is
Doug's call, not the implementer's.

**Un-defer trigger:** the owner rules on announcing badge arrivals, OR any a11y pass that finds a
real screen-reader user affected by the stale name.

**Bounded worst case today:** the control's PURPOSE is always conveyed correctly ("Notifications",
"Needs attention"); only the supplementary count is missing, and it is restored on the next focus
because both names are computed reactively from hook state. No control is unlabeled, mislabeled, or
unreachable at any point.

### VOICEOVER-ANNOUNCER-SPOTCHECK — owner action (2026-07-22)

**Effort:** S

The warning-announcer-copy bundle's manual assistive-technology half (spec §8
F10 mitigation): owner runs VoiceOver over ignore / bulk-ignore / pointer
reveal on the Sheet warnings panel and confirms one polite utterance per
action, silence on background refreshes, and the reveal focus move. The
automated halves (impeccable audit a11y dimension; role/mutation structural
tests) shipped pre-merge. Un-defer trigger: owner performs and records the
pass.

screen-disposition 2026-08-04: ANNOTATE, stays open as an owner action. It is not a hypothetical filing at all — it is a manual pass only the owner can perform ("owner runs VoiceOver over ignore / bulk-ignore / pointer reveal"; un-defer trigger "owner performs and records the pass"), so the filing bar's probe-or-reachability test is satisfied by the surfaces themselves. **Stale parenthetical corrected:** the body dates the warnings panel as "titled 'Parse warnings' until `feat/warning-trim-undefer`" — that branch merged (PR #568, `6da2139e7`), `components/admin/showpage/WarningsBreakdown.tsx` no longer exists, and "Parse warnings" survives only in prose and comments (`components/admin/showpage/OverviewSection.tsx:18,65`; `components/admin/wizard/step3ReviewSections.tsx:570,615,698`). The pass should be run against the surfaces as they are now.

**Pass kit (2026-08-29, `docs/voiceover-spotcheck-kit`):** `docs/agents/voiceover-spotcheck-kit.md` carries the step script, every expected utterance quoted from the shipped code with a verified `file:line`, and a fill-in recording form whose completed copy IS the evidence this row's un-defer trigger asks for. It settles three things the body did not. First, the panel is titled **Sheet warnings** (`components/admin/wizard/step3ReviewSections.tsx:5004`); "Parse warnings" survives only in code comments and in the jump-button copy, so the body's stale parenthetical is now removed rather than annotated. (The 2026-08-04 note above stays as the dated record it is. Its citations have partly drifted since: `OverviewSection.tsx:18,65` still resolve, `step3ReviewSections.tsx:615` still lands on a Parse-warnings comment, and `:570` and `:698` no longer do. Read it as history, not as a map.) Second, there are now TWO surfaces to run, not one: PR #943 (`feat/wizard-warning-ignore-controls`) put Ignore and Un-ignore on the onboarding wizard's step-3 panel and gave every surface mount the real announce channel (`components/admin/review/ShowReviewSurface.tsx:873-880`), so a silent state change there is an a11y defect too. Third, the pass cannot be run on `/admin/dev/attention-gallery`: that page answers every mutating call with a synthetic 403 (`components/admin/dev/GalleryWriteGuard.tsx:118-119`) and its bulk-ignore script admits only partial, fail, and pending outcomes (`lib/dev/attentionScenarios/types.ts:180`). The fetch-success branch every announcement fires on is unreachable there, so the silence would mean nothing. Row stays OPEN; the pass itself is still the owner's to perform.

### SHARELINK-COPY-REF-ORDERING-PROOF — test-coverage gap (2026-07-25, share-link-chrome-backlog)

**Effort:** L
**l-wave-screen 2026-08-06:** PREREQ — un-defer trigger is a scheduler harness that can resolve a promise between commit and passive effects; no such harness exists today.

`ShareLinkCopyButton` writes `urlRef` in a `useLayoutEffect` so the captured-url
guard compares against a ref that is already current when a clipboard promise
resolves. The LAYOUT part is deliberate: with a passive `useEffect`, a promise
settling between commit and the passive flush compares against a stale url, the
guard waves it through, and "Copied" appears beside a token that is already dead
for the whole crew.

**What is proven:** the guard's existence, in jsdom
(`shareLinkCopyButtonRotate.test.tsx`) and in a real engine
(`share-link-flash.spec.ts` T-FLASH-COPY-RACE). Both red when the comparison is
removed.

**What is NOT proven:** that the effect must be a LAYOUT effect. Swapping it for
`useEffect` reds nothing. Two attempts failed: Playwright cannot schedule a
promise resolution inside the commit-to-passive-effect window, and a jsdom probe
releasing from a sibling `useLayoutEffect` does not beat React either — `act()`
flushes passive effects before yielding to the microtask, so the passive write
always lands first.

**Why deferred rather than exempted:** round-11 review rejected a bespoke
`UNPROVEN_SURVIVORS` whitelist in the matrix script as laundering — correctly, and
for a reason worth recording: it had no bidirectional check, so a later
regression back to survival would still have passed. Spec §9.0 requires every
registered adversary to be rejected, so the adversary is removed rather than
exempted, and the gap is recorded here where deferrals are actually reviewed.

**Un-defer trigger:** a harness that can resolve a promise between commit and
passive effects (a custom React scheduler shim, or `scheduler/unstable_mock`).
Register the mutation as an adversary at that point and confirm it reds.

### SHARELINK-CUE-FOCUS-OBSCURED-1 — the scroll cue may push the focused rotate control out of view (2026-08-07, arc A)

**Effort:** S

**Reachability:** INFERRED, NOT PROBED.

From the impeccable audit of `feat/a11y-privacy-cluster` (P2). The new rotation cue scrolls the crew-URL row into view inside the share hub's `overflow-y-auto` popover. The URL row sits ABOVE the rotate control, so the scroll moves the viewport up and can push the just-activated control — which still holds focus — below the visible band. WCAG 2.2 SC 2.4.11 Focus Not Obscured (Minimum, AA).

**Not fixed, because the obvious repair fights the feature.** The cue exists precisely to move the view off the rotate control and onto the link that changed; scrolling the focused control back into view would undo it. `block: "nearest"` already minimizes the movement, and does nothing at all when the row is already visible. Whether the residual case is a real 2.4.11 failure also turns on a question this arc did not settle: 2.4.11 is written about author-created content covering the focused element (sticky headers, overlays), and an author-initiated scroll within a scroll container is a greyer reading.

**The probe that settles it, and the first scheduled step if this is promoted:** at 390x560, drive the rotate flow in a real browser (the harness exists — `tests/e2e/admin-lifecycle-layout.spec.ts` already seeds a published show and drives arm+confirm), then read `document.activeElement`'s rect against the popover's client rect after the glide settles. If the focused element is fully outside, it is a confirmed failure and the fix is to scroll the active element back into view AFTER the cue rather than instead of it.

**Un-defer trigger:** that probe, or any a11y pass over the share hub.

### TRAVEL-SUPPRESSION-PARTIAL-EXPLANATION-1 — a partly-suppressed Travel section explains nothing (2026-08-07, arc A)

**Effort:** M

From the impeccable critique of `feat/a11y-privacy-cluster` (invariant-8 dual gate, P1). Arc A withholds dates from an `unknown_asterisk` viewer at three TravelSection sites. When suppression empties the section OUTRIGHT the copy now names the reason ("Travel dates are hidden until your days are confirmed." — fixed in-branch, it was the reachable-false-statement half of the same finding). What is NOT explained is the PARTIAL case: a hotel card that renders its name with no check-in/out, a ground leg with a time and no date, a flight list with no dates and no Today/Next chip. Those read as a data bug, and the crew member's likely response is to report missing data that is not missing.

**Accepted, not fixed — deferral exception (a), a product decision this PR cannot settle.** The question is not whether to explain but WHERE and HOW OFTEN, and it is not TravelSection's alone: three crew sections now treat one product state three different ways. `ScheduleSection` explains it in full (`schedule-unconfirmed`, "Your days haven't been confirmed yet. Check back after the schedule is finalized."), the Today Tonight card drops its date rows silently (shipped M-wave), and Travel now drops content silently. Fixing only Travel would make the inconsistency worse by adding a fourth treatment. A per-section banner also risks saying the same sentence three times on one scroll, which is its own noise problem on a page whose whole brief is answering one question in under five seconds.

**Un-defer trigger:** a crew-page pass that can settle the suppression-explanation pattern across Schedule / Today / Travel together, or the first report of a crew member chasing travel data that was withheld rather than missing.

### TRAVEL-FLIGHT-SUPPRESSED-LEGIBILITY-1 — undated flight segments lose their only delimiter (2026-08-07, arc A)

**Effort:** S

From the same critique (P2). In the unsuppressed render each flight segment leads with a date eyebrow, and the next/today segment additionally carries a sunken tint plus a chip — together the row header, the delimiter, and the emphasis. Under suppression all three are gone by design (the tint is `flightNextIdx`, which is the same viewer-schedule claim rendered as styling), so two segments become near-identical adjacent lines separated by `gap-1.5` with no header. Reachable for any `unknown_asterisk` viewer with two or more structured legs.

**Accepted, not fixed.** The repair is a new visual treatment for a state the arc's ratified spec described as "the date is gone, the rest intact" — a hairline divider or a uniform sunken row under `hideDates` is a design decision, not a defect repair, and inventing it inside the closing diff is exactly the unreviewed visual change the dual gate exists to catch. The information is all still present and correctly ordered; what degrades is scanning speed.

**Un-defer trigger:** the next deliberate visual pass on the Travel flight card, or a crew report of misreading which leg is which on a phone.

### SHARELINK-CUE-FORCED-COLORS-1 — impeccable audit P3 (2026-07-25, share-link-chrome-backlog)

**Effort:** L
**l-wave-screen 2026-08-06:** PREREQ — waits on a repo-wide forced-colors pass to set the pattern; solving it once here would pre-commit that pattern from a sample of one.

Under `forced-colors` the cue is invisible: UAs drop `box-shadow` and force
`background-color`, so both tracks vanish (`app/globals.css:884`). Systemic
rather than local — the repo has zero `forced-colors` handling anywhere — and
the local rotate path still carries its `role="status"` banner.

**Un-defer trigger:** a repo-wide forced-colors pass, which should set the pattern
once rather than have this one surface invent it.

### ATTENTION-INDEX-JUMP-FOCUS-1 — [P1] pressing an index row drops focus to `<body>`

**Effort:** L
**l-wave-screen 2026-08-06:** PREREQ — needs its own focus-orchestration spec; trigger is a keyboard/SR report or the next jump-handler change.

From the impeccable audit of `feat/attention-index` (2026-07-25). A row's `onClick` runs `onClose()` then `onNavigate(item)`; the row unmounts with the menu, the jump handler in `ShowReviewSurface` only scrolls and flashes, and the rescue effect in `PublishedReviewModal` returns early on a user-initiated close. So after pill → Enter → Tab → Enter, the viewport lands on the card but `activeElement` is `<body>`, outside `[role="dialog"]` — the next Tab restarts at the document top, escaping the modal trap, and screen-reader users get no arrival announcement because the flash is visual-only.

**Accepted, not fixed, in the index consolidation.** Verified pre-existing on `origin/main`: actionable rows there carry a byte-identical `onClick` with no focus restoration (`git show origin/main:components/admin/showpage/AttentionMenu.tsx`, the actionable row block), and holds plus the three actionable alert codes are the dominant row class. This diff widens the same behavior to former needs-look rows, which previously moved focus only as a side effect of their inner `<a href>`'s native navigation — an affordance the spec deletes deliberately, since an `<a>` cannot nest inside the `<button>` that makes the whole row pressable.

Fixing it properly means focusing the landed card (`[data-attention-anchor]` with `tabindex="-1"`) from the SHARED jump handler, which is outside this spec's three files and is pinned by a large focus contract (`pillFocusReconcile.test.tsx`, and 26 real-browser tests in `attention-pill-focus.spec.ts`). That is a focus-orchestration change of different character from a grouping/copy consolidation, and it should carry its own spec and its own re-validation of that contract rather than riding along here.

**Un-defer trigger:** any keyboard or screen-reader report of losing place after a jump, or the next change that touches the jump handler for another reason.

### ATTENTION-INDEX-ROW-DESTINATION-NAME-1 — [P2] index rows no longer name where they go

**Effort:** S

From the same audit. A needs-you row's accessible name is now `"needs review — <title><hint>"`. Deleting the inner action link removed the only words that named the destination ("Open in Sheet", "Go to Overview"), and the trailing `→` is `aria-hidden`. A sighted user infers "pressable, goes somewhere" from the chevron and hover; a screen-reader user gets a button whose name describes the problem but not the movement.

**Accepted, not fixed.** The spec makes rows deliberately jump-only and moves destination naming onto the card's chip (§2.2/§2.3), so adding a destination phrase back into the row name is an amendment to that ratified division, not a defect against it. It also reads awkwardly against the existing sr-only tone prefix (`"needs review — Go to Sheet unavailable"`).

**Un-defer trigger:** owner review of the row's accessible name, or the first screen-reader pass on the merged panel.

---

## /help/errors report surface — impeccable dual-gate deferrals (2026-08-09)

Filed from the invariant-8 dual gate on `feat/help-report-surface`. Dispositions and the refuted
findings are recorded in §12 of `docs/superpowers/plans/2026-08-09-help-report-surface.md`.

### HELPREPORT-MODAL-STATIC-IMPORT-CATALOG-1 — [P1] every route with a report button downloads the whole message catalog

**Effort:** M

From the impeccable audit. The import chain is static and unconditional, so the modal, its help
affordance, and the full §12.4 catalog land in the route bundle whether or not the modal is ever
opened:

```
components/shared/ReportButton.tsx:34   import { ReportModal, ... }
components/shared/ReportModal.tsx:37    import { HelpAffordance } from "@/components/admin/HelpAffordance"
components/admin/HelpAffordance.tsx:41  import { MESSAGE_CATALOG, ... } from "@/lib/messages/catalog"
$ wc -l lib/messages/catalog.ts
4052 lib/messages/catalog.ts
```

`ReportButton` already mounts the modal only when open, so nothing renders early — but a static
import is a download either way. This branch made `/help/errors` the newest instance: the page
server-renders every catalog entry as HTML and now also ships that prose a second time as JS, to a
venue-floor phone, to render one button. The crew footer and the admin surfaces have carried the same
weight since M8.

**Accepted, not fixed.** The repair is `next/dynamic` on the modal inside `ReportButton`, which wins
on every surface at once — and changes the mount contract for all four existing ones: the modal would
stop appearing synchronously on click, which is what the hardened M8 suites assert. The 2026-08-09
spec §1.1 item 9 fences existing-surface behavior as byte-identical for this PR, so the change
belongs in its own PR with those suites as the net.

**Un-defer trigger:** any page-weight budget on `/help/**` or the crew page, or the next milestone
that touches `ReportButton`'s mount path for another reason.

### HELPREPORT-CTA-REMOUNT-FOCUS-1 — [P1] a mid-open fragment change closes the dialog with no cue and drops focus to `<body>`

**Effort:** M

From the impeccable critique and audit. `app/help/errors/_components/HelpReportCta.tsx` keys
`ReportButton` by the live fragment, so a `hashchange` while the modal is open remounts the button
and unmounts the modal. That unmount is the ratified mechanism, not an accident (2026-08-09 spec
§2.1, repaired at plan R5): it is what stops a live attempt from being re-pointed at another code,
and `tests/help/helpReportCta.test.tsx` case 6 pins it. The unaddressed consequence is what happens
next — `lib/a11y/dialogFocus.ts` restores focus to the trigger, which that same remount just removed,
so focus falls to `document.body` and a screen reader gets no dialog-closed cue. The realistic path
is the phone back gesture between two fragment history entries. The typed draft survives under the
old `surfaceId`, but nothing says so.

**Accepted, not fixed.** Both candidate repairs are decisions this PR cannot settle. Freezing the
hash for the lifetime of an open attempt removes the unmount entirely and preserves
key/draft/`helpCode` co-variance — but it contradicts the remount the spec ratified and the test that
pins it, so it is a spec amendment. Restoring focus to the NEW trigger keeps the ratified mechanism
but needs a rule for when focus may move during ordinary reading: every jump-list click on this page
is a `hashchange`, and stealing focus to the page-foot CTA on each one is worse than the defect.

Same failure shape as [[ATTENTION-INDEX-JUMP-FOCUS-1]] above (focus to `<body>` after a
trigger-removing transition); if a focus-orchestration spec is written for that, this belongs in it.

**Un-defer trigger:** any keyboard or screen-reader report of losing place on `/help/errors`, or the
focus-orchestration spec that closes the sibling entry.

### HELPREPORT-MODAL-NO-ESCAPE-1 — [P2] the report dialog cannot be dismissed with Esc

**Effort:** S

From the impeccable audit. `grep -c 'Escape' components/shared/ReportModal.tsx` returns `0`; the only
key handling in the modal is Cmd/Ctrl+Enter to submit. `lib/a11y/dialogFocus.ts:13-14` states
explicitly that "Esc handling is the dialog's responsibility (typically already wired in the dialog
component)", and it never was. Not an SC failure — Close is Tab-reachable and inside the focus trap —
but it breaks the APG dialog pattern, and this branch extends the gap to a fifth surface.

**Accepted, not fixed.** Pre-existing since M8 on all four existing surfaces; adding a dismissal path
is a behavior change to every one of them, which spec §1.1 item 9 fences for this PR. It is a
one-place fix that should ship with the modal's own suite as its net.

**Un-defer trigger:** the next PR that touches `ReportModal`'s keyboard handling, or any
keyboard-a11y sweep.

## Undo announcement channel — impeccable critique deferrals (2026-08-03)

From the impeccable v3 dual gate on `feat/sync-feed-undo-announce`. The critique's detector ran clean (0 findings) and contrast, tokens, tap targets, em-dash and ARIA all passed. Three findings are accepted and deferred rather than fixed, each with its reason and un-defer trigger.

### UNDO-DIALOG-LABEL-CONSTANT-1 — impeccable critique P3: the dialog region's `aria-label` is a constant while its `data-testid` is derived (2026-08-03)

**Effort:** S

`ReviewModalShell` has three render sites, and Step-3 cards hold per-card open state, so two shells can be attached at once and would share the accessible name `"Status updates in this dialog"` (the label was `"Undo updates in this dialog"` when this was filed; arc A generalized it with the channel's content, which does not change the duplication this entry is about).

**Accepted, not fixed, and deliberately so.** Deriving the label from `testIdBase` was implemented and reverted: it produces names like "Status updates in the wizard step3 card `<driveFileId>` review dialog", putting internal identifiers into text a screen reader speaks. A leaked drive-file id in an accessible name is a worse outcome for the user than a duplicated label in the rare two-dialog case. The `data-testid` remains derived, so tooling and Playwright stay unambiguous.

**Un-defer trigger:** a human-readable per-dialog name becomes available on the shell (a title prop or similar), or two review dialogs become simultaneously reachable outside Step-3.

---

## Dashboard row actions — impeccable dual-gate deferrals (2026-08-10)

From the impeccable v3 dual gate on `feat/admin-dashboard-row-actions`. The critique's deterministic detector ran clean (exit 0, `[]`). The P0 (keyboard-unreachable confirm controls) and the audit's P0 (a `translate` ancestor collapsing the outside-click backdrop) were FIXED in-branch, as were four P1s and two P2s. Three findings are accepted and deferred, each with its reason and un-defer trigger.

### ROWACTIONS-MENU-ENTRY-MOTION-1 — impeccable critique P3: the menu opens and closes instantly where the precedent animates (2026-08-10)

**Effort:** S

`components/admin/wizard/CrewRowActions.tsx:284` gives its menu `route-enter`; the dashboard row menu has no entry motion.

**Accepted, not fixed.** Instant is the RATIFIED treatment, not an omission: the spec's §3.5 transition inventory sets `closed → open` and `open → closed` to the popover-primitive default, and `tests/components/admin/rowActions/showRowActions.shell.test.tsx` pins the absence of any `transition-`/`animate-` class on the panel. Adding motion now would reopen a ratified inventory row and invert a shipped assertion in a close-out commit, which is the wrong place to relitigate a design decision.

**Un-defer trigger:** a design pass that settles entry motion for the admin popover family as a whole (the precedent, `AppHealthPopover`, and this menu together), or an amendment to §3.5.

### ROWACTIONS-MENU-MINWIDTH-BOUNDS-1 — impeccable audit P3: `min-w-52` can override the placement core's computed `maxWidth` (2026-08-10)

**Effort:** S

`components/admin/ShowRowActions.tsx` sets `min-w-52` (208px) on the panel. When the placement bounds are narrower than that — reachable only under pinch-zoom, where `lib/popover/position.ts` insets the visual viewport — the panel overflows the bounds it was measured against, and `wrappedHeightAt` then reports a height for a width the panel is not actually using.

**Accepted, not fixed.** Not reachable at any supported layout width: the narrowest target viewport is 390px, and the bounds only fall under 208px inside a pinch-zoom gesture. The repair (`min-w-[min(13rem,100%)]`) is one class, but it changes the measured width of every menu and therefore the geometry e2e's containment numbers; landing it with a real-browser pinch-zoom assertion is the honest version, and there is no such harness today. `min-w-52` is also the shipped precedent's width, so the deferral keeps the two menus identical.

**Un-defer trigger:** a pinch-zoom or visual-viewport e2e harness lands, or the popover family's min-width is revisited.

### HELP-STRAIGHT-APOSTROPHES-1 — impeccable audit P3: `/help` MDX prose uses straight apostrophes (2026-08-10)

**Effort:** M

`app/help/admin/dashboard/page.mdx` carries 25 straight apostrophes in prose (lines 3, 12, 14, 17, 21, 26, 27, 29, 52-58, 62, 68 among them) against 2 typographic ones — both of the latter in the prose this branch added, which is the side that matches the project's mechanical copy rule.

**Accepted, not fixed.** Pre-existing and file-wide: this branch introduced none of them, and normalizing them here would put a large unrelated prose diff inside a UI close-out commit. It is also almost certainly not one file — the rule applies across `/help`, so the fix is a sweep with its own guard, not a rider. The branch's own prose is correct and is pinned by `tests/help/dashboard-row-actions.test.ts`.

**Un-defer trigger:** a `/help` copy-conformance sweep, or a mechanical guard extending the straight-apostrophe ban to MDX prose.

## Diagram tile chrome — impeccable dual-gate deferrals (2026-08-28)

Both from the invariant-8 critique on `fix/diagram-tile-chrome-consistency`. Neither is a regression from that
diff: the change relocates the tile's box chrome and touches neither the image's fit nor the tile's labelling.
Both are deferred under class-sweep exception (a) — each needs a product decision this PR cannot settle — and
both are recorded here rather than in `BACKLOG.md` because each has a concrete trigger.

### DIAGRAMTILE-LIVE-TILE-UNLABELLED-1 — impeccable P1: only the FAILED tile says which diagram it is (2026-08-28)

**Effort:** S · **Facing:** product · **Un-defer trigger:** any work that adds a visible label, caption or tooltip
to `DiagramTile`, or the first report of Doug opening tiles one by one to identify a diagram.

The failed branch renders the diagram's name as visible text, truncated with a `title`
(`components/admin/wizard/step3ReviewSections.tsx:3892`). The live branch renders no visible name at all. It is
not an accessibility defect — the anchor's `aria-label` carries `${strippedAlt} (opens in a new tab)`
(`components/admin/wizard/step3ReviewSections.tsx:3918`), so a screen-reader user can identify every tile. It is
a SIGHTED-scanning defect, and it inverts the obvious expectation: the tile that worked is anonymous, the tile
that broke is named.

**Why it matters where it is.** This grid is where Doug confirms diagrams made it into a show before publishing.
Twelve unlabelled thumbnails at roughly 80px, several of which are pale line drawings, is a grid he can only
resolve by opening tabs. The failed branch's own code comment makes exactly this argument for naming — "a grid
of failures read as N identical grey boxes and the reviewer could not tell which sheet tab was missing" — and
the live branch never answers it.

**Why deferred rather than fixed here.** Class-sweep exception (a). The cheap version is `title={strippedAlt}` on
the anchor, but a `title` duplicating an existing `aria-label` is a redundancy this project has deliberately
removed before: the image's `alt` was emptied precisely so a screen reader would not hear the name twice
(`components/admin/wizard/step3ReviewSections.tsx:3904-3912`). Whether the answer is a hover `title`, a visible
caption under each tile, or a name revealed on focus is a product decision about a grid whose density is already
tuned, and it is not one a chrome-relocation PR should take.

### DIAGRAMTILE-OBJECT-COVER-CROPS-1 — impeccable P1: `object-cover` crops stage plots to their middle third (2026-08-28)

**Effort:** S · **Facing:** product · **Un-defer trigger:** any work that changes `DiagramTile`'s image fit or the
tile's aspect box, or the first report of a diagram thumbnail looking blank.

The tile is `aspect-4/3` and the image is `object-cover`, so a wide stage plot or a tall floor plan is cropped to
its centre. Architectural diagrams are mostly white space in the middle; the visible third is frequently the
emptiest part of the drawing, which is the worst possible crop for recognition. Products that show attachment
thumbnails — Notion, Figma, Linear — letterbox rather than crop for this reason.

**What this arc changed about it.** Nothing directly, but it is the reason the fix is now clean.
`object-contain` needs a plate behind the letterbox, and until this diff the plate (`bg-surface-sunken`) was on
the image itself, so `object-contain` would have letterboxed against the plate's own edge. The plate now sits on
the anchor, so `object-contain` would letterbox against a ground that already exists and already meets its
contrast pin. The chrome move did not fix this; it removed the obstacle.

**Why deferred rather than fixed here.** Class-sweep exception (a). Cropping versus letterboxing changes how
every diagram in the product reads, on both the admin grid and — by the consistency argument this very spec
makes — the crew gallery, which uses `object-cover` too (`components/diagrams/Gallery.tsx:412`). Taking it
unilaterally inside a PR whose stated scope is which ELEMENT carries the border would be exactly the
"spending a ratified design claim on a preference" that `BL-DIAGRAM-TILE-CHROME-CONSISTENCY` was filed to avoid.
