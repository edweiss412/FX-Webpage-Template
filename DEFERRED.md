# DEFERRED.md

Open deferral queue — work intentionally deferred with a concrete un-defer trigger. Distinct from BACKLOG.md (might do, speculative).

**Resolved / stale / N/A entries live in [DEFERRED-archive.md](./DEFERRED-archive.md)** — full provenance kept there, NOT in this working queue. When an item below ships, move its full entry to the archive.

Last reconciled: 2026-07-24 — swept every merged PR body (#445–#570) for deferrals that never reached a ledger; strip-mobile entries graduated the same day. SETTINGS-DEVROW-GALLERY-RESIDUE-1 graduated 2026-07-24 (all four findings closed). Graduation provenance lives in [DEFERRED-archive.md](./DEFERRED-archive.md) (grep by id).

---

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

**Status:** IN PROGRESS · **Branch:** feat/forced-colors-pass
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
