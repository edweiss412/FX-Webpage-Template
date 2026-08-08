# DEFERRED.md

Open deferral queue — work intentionally deferred with a concrete un-defer trigger. Distinct from BACKLOG.md (might do, speculative).

**Resolved / stale / N/A entries live in [DEFERRED-archive.md](./DEFERRED-archive.md)** — full provenance kept there, NOT in this working queue. When an item below ships, move its full entry to the archive.

Last reconciled: 2026-07-24 — swept every merged PR body (#445–#570) for deferrals that never reached a ledger; strip-mobile entries graduated the same day. SETTINGS-DEVROW-GALLERY-RESIDUE-1 graduated 2026-07-24 (all four findings closed). Graduation provenance lives in [DEFERRED-archive.md](./DEFERRED-archive.md) (grep by id).

---

### STEP3-GALLERY-TAP-TARGETS-1 — sub-44px chrome + a skipped heading level on `/admin?step=3` (2026-08-02)

**Effort:** M
**Status:** IN PROGRESS · **Branch:** fix/step3-a11y-cluster

Surfaced by the invariant-8 dual gate on branch `test/step3-live-render-cluster`, run against the
six-variant seeded Step-3 gallery — the first time all six card states rendered together. Findings
and dispositions are recorded in §12 of
`docs/superpowers/plans/admin/2026-08-02-step3-live-render-cluster.md`.

**Every item is PRE-EXISTING and outside that branch's diff.** The branch changes exactly two
UI-surface files and neither changes a pixel: `components/admin/OnboardingWizard.tsx` (mechanical
`assembleStep3Row` extraction, no markup added) and `components/admin/wizard/Step3Review.tsx` (one
string literal respelled from a raw NUL byte to its escape, runtime-identical). They are deferred
rather than fixed here because fixing them would put unreviewed visual change into a
test-and-docs branch.

**Partially resolved 2026-08-08 by `fix/step3-a11y-cluster`** — spec
`docs/superpowers/specs/2026-08-07-step3-a11y-cluster.md`, plan
`docs/superpowers/plans/2026-08-07-step3-a11y-cluster.md`. Items **(a)**, **(b)** and **(c)** ship
there and are struck below. **(d) stays deferred with its own un-defer trigger, so this entry is
NOT archived** — the archive is where an item goes when it ships, and (d) has not.

Two of this entry's own citations were wrong and are CORRECTED in the spec rather than preserved
(spec §1.1 R1): (a)'s `<summary>` is in `components/admin/HelpAffordance.tsx:95`, not
`step3ReviewSections.tsx`, and its parent is not `min-h-12`. The 20.3px measurement itself
reproduced exactly and was never in dispute. (b)'s proposed `before:-inset-2` recipe is REFUTED by
probe (spec §1.1 R2, §7 probe P4): the box measures 44x44 but only its top and left edges take the
pointer — the right edge returns the `<nav>` and the bottom returns the outer wrapper. What shipped
instead is `-m-2 … size-tap-min` plus an inner visual span, measured at 44x44 with all four edge
midpoints hitting and pill centres identical to before.

**~~(a) [P1] The "What does this mean?" `<summary>` is 20.3px tall.~~ ✅ SHIPPED 2026-08-08.** Not
one site but SEVEN — the corpus pass found every `<summary>` in the repo under the floor, and all
seven are repaired (spec §2.1): `HelpAffordance.tsx:95`, `OnboardingWizard.tsx` (operator error),
`ErrorExplainer.tsx:114`, `AdministratorsSection.tsx:131` (40.8px, a near-miss sized by `p-3`),
`app/me/meShowSections.tsx`, `RunOfShowList.tsx:82`, and `HelpTooltip.tsx:57` (which takes the
Class B recipe instead, since it is also a 28px pill). Original text below for provenance.

**(a) [P1] The "What does this mean?" `<summary>` is 20.3px tall.** On the hard-failed card's
help disclosure (`components/admin/wizard/step3ReviewSections.tsx`, the HelpAffordance block).
Measured live at 390px: own box 274.0x20.3, no `<label>` wrapper, no positioned `::before`/`::after`
hit expansion. Its PARENT is `min-h-12` (48px), so roughly 28px of the band looks tappable and is
not. Fails the project's stated 44px floor (`PRODUCT.md` accessibility floor) and also WCAG 2.5.8
Target Size (Minimum, AA), which requires 24px — the vertical axis is under that too. **Fix when
prioritized:** give the `<summary>` the height its parent already reserves (`min-h-tap-min`, or
`flex h-full items-center`) so the whole 48px band toggles it. **Un-defer trigger:** the next
milestone that touches `step3ReviewSections.tsx` chrome, or any a11y sweep of the wizard.

**~~(b) [P2] Four 28x28 chrome targets.~~ ✅ SHIPPED 2026-08-08.** Seven targets, not four: the
three step pills, the HelpSheet trigger, its close button (36x36 — found ONLY by the corpus pass),
HelpTooltip, and the `AdminNav` brand link. Each keeps its OWN painted box and radius; only the hit
box grows. The proposed `before:-inset-*` idiom is refuted above. Original text below for
provenance.

**(b) [P2] Four 28x28 chrome targets.** The three step-indicator pills ("Go back to step 1",
"Go back to step 2", "Step 3, current step") and the page-header help trigger ("Help: Review and
publish your sheets") are all `size-7` (28x28) with no hit expansion — verified by
`document.elementFromPoint` at each element's centre returning a box no larger than the element.
These CLEAR WCAG 2.5.8 (AA, 24px) but fail the project's own 44px floor and WCAG 2.5.5 (AAA).
**Fix when prioritized:** the `before:absolute before:-inset-*` hit-expansion idiom, which keeps
the 28px visual pill while giving it a 44px target. **Un-defer trigger:** same as (a), or the
first report of a mis-tap on the step rail from a phone.

**~~(c) [P2] Heading levels skip h1 → h3; the page renders no `<h2>` at all.~~ ✅ SHIPPED
2026-08-08.** Both page-level `h3`s in `Step3Review.tsx` are promoted to `h2` (spec §2.3); the
SHARED `step3ReviewSections.tsx:897` heading is deliberately untouched, because it renders inside
the review modal and the show-review surface, each below its own dialog heading. Class strings are
byte-identical, so the tag changed and the type scale did not. Original text below for provenance.

**(c) [P2] Heading levels skip h1 → h3; the page renders no `<h2>` at all.** Probed live: the
heading sequence is `1,3,3` at every viewport (320/390/768/1280) and `document.querySelectorAll("h2")`
returns empty. WCAG 1.3.1 (Info and Relationships) — a screen-reader user tabbing the outline hears
a level that was never opened. **Fix when prioritized:** demote the section headings to `h2` (they
are the page's top-level sections) or introduce the missing `h2`. **Un-defer trigger:** any
screen-reader pass on the wizard, or the next change to the Step-3 section headers.

**(d) [P2] Three affordance vocabularies in one row slot; nested card chrome.** Recorded in §12
of the plan with the reasoning; both are design-consistency findings rather than standards
violations, and both are pre-existing. **Un-defer trigger:** the next deliberate visual pass on
the Step-3 row, where they should be resolved together rather than piecemeal.

**Verified NOT findings (recorded so a future gate does not re-raise them):** the three
`INPUT.peer.sr-only` checkboxes measure 1x1 but sit inside `<label>` wrappers of 44.0x44.0 and
87.4x44.0 — the effective tap target meets the floor and the pattern is correct. The eight
`broken-image` hits from `detect.mjs` (7 in `VenueMapTile.tsx`, 1 at `step3ReviewSections.tsx:3641`)
are false positives: raw `<img>` with a required runtime `src` prop and an `onError` placeholder,
a documented deliberate revert from `next/image` (which drops cookies), mirroring
`components/diagrams/Gallery.tsx:130-144`.

### VOICEOVER-ANNOUNCER-SPOTCHECK — owner action (2026-07-22)

**Effort:** S

The warning-announcer-copy bundle's manual assistive-technology half (spec §8
F10 mitigation): owner runs VoiceOver over ignore / bulk-ignore / pointer
reveal on the published Sheet-warnings panel (titled "Parse warnings" until
`feat/warning-trim-undefer`) and confirms one polite utterance
per action, silence on background refreshes, and the reveal focus move. The
automated halves (impeccable audit a11y dimension; role/mutation structural
tests) shipped pre-merge. Un-defer trigger: owner performs and records the
pass.

screen-disposition 2026-08-04: ANNOTATE, stays open as an owner action. It is not a hypothetical filing at all — it is a manual pass only the owner can perform ("owner runs VoiceOver over ignore / bulk-ignore / pointer reveal"; un-defer trigger "owner performs and records the pass"), so the filing bar's probe-or-reachability test is satisfied by the surfaces themselves. **Stale parenthetical corrected:** the body dates the warnings panel as "titled 'Parse warnings' until `feat/warning-trim-undefer`" — that branch merged (PR #568, `6da2139e7`), `components/admin/showpage/WarningsBreakdown.tsx` no longer exists, and "Parse warnings" survives only in prose and comments (`components/admin/showpage/OverviewSection.tsx:18,65`; `components/admin/wizard/step3ReviewSections.tsx:570,615,698`). The pass should be run against the surfaces as they are now.

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

### SHARELINK-CONSTANTS-INVENTORY-1 — impeccable critique P2 (2026-07-25, share-link-chrome-backlog)

**Effort:** M

`DESIGN.md` section 5.5 claims to be the single source of truth for interaction
constants but omits at least two: `ARM_REVERT_MS` (4000, the destructive-confirm
auto-revert) and the bare `2_000` clipboard-reset literal at
`app/admin/show/[slug]/ShareLinkCopyButton.tsx:81`. This milestone corrected the
section's two FALSE claims (single-file ownership; "never produce a painted px")
and added its own constant, but did not audit the rest of the codebase for
unlisted ones.

Un-defer trigger: the next DESIGN.md pass, or any milestone adding a third
timing constant — at which point the inventory should be swept and pinned by a
test rather than maintained by hand.

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

### SHEETLINK-SUBTLE-ACTION-CLASS-1 — [P1] `text-text-subtle` survives on four sibling icon-only action targets

**Effort:** M

From the impeccable critique of `feat/sheet-icon-link-affordance-class` (2026-07-26). The diff fixed the DESIGN.md "never an action target" violation on the three icon-only SHEET links, but the same bug shape lives on at `ModalCloseButton.tsx:20`, `RescanSheetButton.tsx:207`, `BellPanel.tsx:1294` (the `bell-panel-close` icon-only dismiss), and `HelpSheet.tsx:145` — and the close button sits in the SAME modal header, so post-merge the secondary sheet link renders DARKER at rest than the primary dismiss beside it (a deliberate-looking inversion that is actually drift).

**Accepted, not fixed.** The backlog entry this branch closes scoped the icon-only sheet-link class; recolouring four more controls — one of which (ModalCloseButton) feeds the byte-for-byte header baselines and every modal suite — is its own class sweep with its own RED edges, not a rider on this diff. The header-inversion observation is the measured cost of waiting.

**Un-defer trigger:** the next DESIGN.md conformance pass, or any edit to ModalCloseButton.

---

## Undo announcement channel — impeccable critique deferrals (2026-08-03)

From the impeccable v3 dual gate on `feat/sync-feed-undo-announce`. The critique's detector ran clean (0 findings) and contrast, tokens, tap targets, em-dash and ARIA all passed. Three findings are accepted and deferred rather than fixed, each with its reason and un-defer trigger.

### UNDO-UNCATALOGUED-CODE-CARD-1 — impeccable critique P2: an uncatalogued error code renders an empty card and announces nothing (2026-08-03)

**Effort:** M

`ErrorExplainer` returns `null` when a code has no catalog row (`components/messages/ErrorExplainer.tsx:82`), so the wrapper paints its bordered warning chrome with no text inside and the live region fires empty.

**Accepted, not fixed.** Behavior is unchanged from before this branch — the conditional wrapper rendered the same empty card. What the branch changes is the promise: an always-mounted live region reads as a commitment to speak. Fixing it properly means resolving the code before deciding to render, which touches the message layer rather than these three components, and every code reachable from these call sites has a catalog row today (`lib/messages/catalog.ts:902`, `:939`, `:952`, `:3275`).

**Un-defer trigger:** any new code reachable from a feed action, or the next `lib/messages` pass.

### UNDO-DIALOG-LABEL-CONSTANT-1 — impeccable critique P3: the dialog region's `aria-label` is a constant while its `data-testid` is derived (2026-08-03)

**Effort:** S

`ReviewModalShell` has three render sites, and Step-3 cards hold per-card open state, so two shells can be attached at once and would share the accessible name `"Status updates in this dialog"` (the label was `"Undo updates in this dialog"` when this was filed; arc A generalized it with the channel's content, which does not change the duplication this entry is about).

**Accepted, not fixed, and deliberately so.** Deriving the label from `testIdBase` was implemented and reverted: it produces names like "Status updates in the wizard step3 card `<driveFileId>` review dialog", putting internal identifiers into text a screen reader speaks. A leaked drive-file id in an accessible name is a worse outcome for the user than a duplicated label in the rare two-dialog case. The `data-testid` remains derived, so tooling and Playwright stay unambiguous.

**Un-defer trigger:** a human-readable per-dialog name becomes available on the shell (a title prop or similar), or two review dialogs become simultaneously reachable outside Step-3.
