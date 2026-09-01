# DEFERRED.md

Open deferral queue — work intentionally deferred with a concrete un-defer trigger. Distinct from BACKLOG.md (might do, speculative).

**Resolved / stale / N/A entries live in [DEFERRED-archive.md](./DEFERRED-archive.md)** — full provenance kept there, NOT in this working queue. When an item below ships, move its full entry to the archive.

Last reconciled: 2026-07-24 — swept every merged PR body (#445–#570) for deferrals that never reached a ledger; strip-mobile entries graduated the same day. SETTINGS-DEVROW-GALLERY-RESIDUE-1 graduated 2026-07-24 (all four findings closed). Graduation provenance lives in [DEFERRED-archive.md](./DEFERRED-archive.md) (grep by id).

---

### FINALIZE-COMPACT-COUNT-NOUN-1 — impeccable P1: the compact count says "1 of 2" without saying of what (2026-08-30)

**Effort:** S · **Facing:** product · **Un-defer trigger:** any arc that opens the step-3 sticky footer's layout, or a real-browser measurement of the footer at 375px confirming the noun fits on one line.

The panel renders `1 of 2 shows`; the compact readout in the sticky footer renders `1 of 2`. The impeccable critique called the divergence a P1, and the reasoning is good: the compact readout is the surface Doug actually uses, and a count with no noun sitting under a heading that had just stopped saying "publishing" is the of-what ambiguity this arc set out to remove.

**It was fixed, then reverted, and the revert is the correct state.** The plan already settled the bare form DELIBERATELY: the compact readout lives in a sticky bar whose height is load-bearing, and the spec's dimensional proof of "footer height, before vs after: identical" rests on the only changed text sitting inside a `truncate`d node. This count is not truncated. Adding `show`/`shows` therefore changes the width of an untruncated node inside the one element whose height the spec proves invariant, and no measurement was taken because this worktree cannot start a dev server.

**Why deferred rather than carried.** Class-sweep exception (a): it needs a product decision backed by a real-browser measurement, not a copy edit. Whoever takes it should measure the footer at 375px with the longest realistic count before committing, and update the spec's §3.2 unchanged-list and its dimensional table in the same change — the invariant-7 violation that this revert closes is exactly what happens when the code moves and the spec does not.

---

### FINALIZE-CAS-PROGRESS-AFFORDANCE-1 — impeccable P1: the highest-stakes phase has the weakest feedback (2026-08-30)

**Effort:** M · **Facing:** product · **Un-defer trigger:** the first report of an operator reloading mid-finalize, or any arc that opens the finalize progress panel's structure rather than its copy.

`fix/step3-publish-progress-scope` corrects what the batch phase CLAIMS: it creates every show Held, so "Publishing your shows…" was false and now reads "Setting up your shows…". That change is copy-only and shipped. What the critique found is structural and predates it: at the batch-to-CAS boundary the determinate `<progress>` and the `N of M` count both DISAPPEAR, leaving two text lines, one of which is empty until the first phase event arrives. The empty STRING is deliberate — `casPhaseLabel(null)` returns `""` with a comment explaining it avoids a redundant second line under the heading — but the empty `<p>` is still rendered, so a `gap-2` column pays for a line that shows nothing. The choice is sound; the artifact is that nothing suppresses the element when the label it holds is empty.

**Why it matters for Doug specifically.** The CAS phase is the one that actually puts shows live. PRODUCT.md has him on a venue floor, one-handed, glancing. The phase with the highest stakes currently gives him the least evidence anything is happening, and the two phases read as a REPLACEMENT rather than a sequence: there is no completion beat for the batch he just watched finish. A project manager who sees a bar vanish reads it as failure and reloads, and reloading mid-run lands him in the `in_progress` checkpoint path — a real bad outcome produced by a display gap rather than by any fault in the run.

**The recommendation from the critique**, kept because it is concrete: keep the settled batch line ("12 of 12 shows set up"), render an indeterminate `<progress>` for the CAS phase so the surface still reads as working, and drop the `<p>` entirely when the phase label is empty rather than rendering a blank one.

**Why deferred rather than fixed in this arc.** Class-sweep exception (a): it is a product and design decision, not a bug fix. Whether the batch line persists into CAS, and whether an indeterminate bar reassures or misleads when no percentage is knowable, are calls about what Doug should be told at the moment of the live flip. This arc's mandate was to stop the surface making a false claim; it is strictly subtractive on copy and touches no phase structure. Adding a new progress element and a persisted completion line is new design on a surface this change does not otherwise open.

**What this arc DID close** rather than leave here: the compact readout's heading, subline and accessible names, which is the false-claim repair this deferral sits beside. (An earlier draft of this line claimed both renderers now name what they count. That repair was reverted — see `FINALIZE-COMPACT-COUNT-NOUN-1` above — and the claim went stale with it; whole-diff R4 finding 5. The ledger may not assert a completion the code contradicts.)

---

### FINALIZE-PROGRESSBAR-UNTHEMED-1 — impeccable P1: the finalize progress bar ships raw browser chrome in both themes (2026-08-30)

**Effort:** S · **Facing:** product · **Un-defer trigger:** any arc that opens `app/globals.css`'s progress-element block, or the first screenshot review of the finalize surface in dark mode.

`app/globals.css` styles the step-2 scan bar across six selectors (`:688-758`) and styles the finalize bar with none: `wizard-finalize-progressbar` appears nowhere in the stylesheet. Both renderers therefore paint the native UA bar, which is platform-accent blue on macOS, in light AND dark mode. DESIGN.md permits exactly one accent, FXAV orange, and says dark is first-class rather than derived; an OS-blue bar is neither. `ProgressPanel`'s own docstring claims it uses "same tokens, same native bar" as step 2, which is false today.

**Why deferred rather than fixed in this arc.** Class-sweep exception (c): it is a visual restyle of a surface this PR does not otherwise open. The change is small in bytes — widen the six step-2 selectors to match both testids — but its output is a VISUAL change, and this arc has no way to verify it: the worktree is under a heavy-phase restriction that forbids starting a dev server or running a build, so no screenshot or contrast measurement could be taken. Shipping an unverified repaint of the element the operator watches during the highest-stakes action, inside a copy-only change, trades a known-wrong appearance for an unmeasured one. It is also strictly pre-existing: this arc changed the bar's accessible name and never its styling.

---

### FINALIZE-PROGRESS-AT-PERCEIVABILITY-1 — impeccable P1: the CAS phase is a focused group whose every child is hidden from assistive tech (2026-08-30)

**Effort:** M · **Facing:** product · **Un-defer trigger:** the VoiceOver spot-check owed under VOICEOVER-ANNOUNCER-SPOTCHECK, or any arc that changes `liveMessage`.

Every visible string in both progress renderers carries `aria-hidden="true"` (FinalizeButton.tsx:976, 993, 1004, 1016, 1022; Step3ReviewWithFinalize.tsx:259, 264, 281, 289, 292). In the BATCH phase that is sound: the native `<progress>` carries the machine-readable state and `FinalizeAnnouncer` carries the words, so hiding the visual copy is what stops a screen reader saying everything twice. In the CAS phase there is no `<progress>` at all, so a focused group named "Show setup progress" contains nothing perceivable, and the three sub-phases `casPhaseLabel` renders — "Applying your edits…", "Making shows live…", "Connecting your folder…" — are never announced, because `liveMessage` keys on phase alone and says only "Finishing setup".

**Not silent, which is why this is deferred rather than urgent:** the live region does announce the phase change, so a screen-reader operator is told the run moved on. What they lose is the sub-phase detail a sighted operator can read.

**Why deferred rather than fixed in this arc.** Class-sweep exception (a): the fix is a product decision about announcement cadence, not a defect repair. Folding `casPhaseLabel` into `liveMessage` is two lines, but it changes a screen-reader operator's experience from one utterance per phase to up to four, and the announcer was deliberately built to avoid chattiness — the same file already declines to double-announce completion. Whether the extra detail is worth the extra speech is a call about how Doug works, and this arc's mandate was to stop the batch phase making a false claim.

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

## Diagram failure retry — impeccable dual-gate deferrals (2026-08-29)

From the invariant-8 dual gate on `feat/diagram-failure-retry`. The gate's three critique P0s and its
audit P0 were all FIXED in-branch; dispositions and the refuted findings are recorded in
`docs/superpowers/plans/2026-08-29-diagram-failure-retry/closeout.md`. One finding is deferred, under
class-sweep exception (a): it needs a product decision this PR cannot settle.

### DIAGRETRY-NO-RETRY-DEADLINE-1 — impeccable P2: a hung request leaves `Retrying…` up forever (2026-08-29)

**Effort:** S · **Facing:** product · **Un-defer trigger:** the first report of a crew member stuck on
`Retrying…`, or any work that gives the asset route a client-visible status channel (which would also
close documented limit 1 in the design spec).

No retry carries a DEADLINE, so a request that never resolves leaves the in-flight state permanent:
`Retrying…` on screen, `aria-busy="true"` announced, and the control inert because its `onClick` is a
bare `preventDefault`. Venue wifi is precisely where a request hangs rather than fails.

**The original wording of this paragraph was wrong twice, and diff review R2 caught both.** It said
there is no `setTimeout` anywhere in either component; the lightbox has several, including the demote
chip's own visibility timer. The true claim is narrower and is the one that matters: none of them is a
retry deadline. It also said closing the lightbox cannot reset a hung retry and a page reload is the
only exit. That is true of the GALLERY, whose state outlives the dialog, and false of the LIGHTBOX,
whose retry state is local and dies when the dialog unmounts. So the worst case is real but belongs to
one surface, not both: a crew member with a hung retry in the lightbox can close it, and one hung in
the gallery cannot get out without reloading.

Recorded rather than quietly narrowed, because the decision below rests on this evidence and a reader
checking it should find the corrected version and the reason it changed.

**Why it is a product decision and not a fix.** Every repair needs a number and a sentence nobody has
chosen: how long before a retry is declared hung (10s? 30s? long enough for 50MB on bad wifi?), what the
control says when it gives up, and whether a timeout should offer a second retry or fall back to the
failed state. Guessing a deadline is worse than the current behaviour: too short and a slow-but-working
50MB fetch is killed on the venue floor, which is the exact failure the originals-only path was ratified
to allow. §3.1 ratified "no dead ends" with the 50MB ceiling stated, and a wrong deadline reintroduces
one.

**What holds the line meanwhile.** The state is per item, so a hung retry strands one diagram rather than
the page; every other tile stays live and openable. The announcement on entry says what is happening, so
nothing is silent.
