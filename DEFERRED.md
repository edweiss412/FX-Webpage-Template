# DEFERRED.md

Open deferral queue — work intentionally deferred with a concrete un-defer trigger. Distinct from BACKLOG.md (might do, speculative).

**Resolved / stale / N/A entries live in [DEFERRED-archive.md](./DEFERRED-archive.md)** — full provenance kept there, NOT in this working queue. When an item below ships, move its full entry to the archive.

Last reconciled: 2026-07-24 — swept every merged PR body (#445–#570) for deferrals that never reached a ledger; strip-mobile entries graduated the same day. SETTINGS-DEVROW-GALLERY-RESIDUE-1 graduated 2026-07-24 (all four findings closed). Graduation provenance lives in [DEFERRED-archive.md](./DEFERRED-archive.md) (grep by id).

---

### NEWTAB-GUARD-UNDECIDABLE-2 — statically undecidable guard limits (2026-07-25; item (b) closed same day)

Ratified as accepted limits in spec §6.4 of
`docs/superpowers/specs/2026-07-25-newtab-announcement-family.md`, surfaced by whole-diff review
R4 on `fix/newtab-announcement-family`. Neither exists in the tree today; both are recorded so a
future reader does not mistake them for oversights.

**(a) Document-level `<base target="_blank">`.** It makes every relative anchor open a new tab
with no per-anchor syntax to inspect, so the per-anchor guard cannot see it. **Fix when
prioritized:** a one-line lexical assertion that no `<base target=` appears under `app/` or
`components/` (cheap, and it would make the family closed under the base-target case too).
Un-defer trigger: anyone proposing a `<base>` element, or the next pass on this guard.

**(b) An effectful predicate evaluated twice — CLOSED 2026-07-25 by the R6 model change.** The
original entry read: `{...(next() ? { target: "_blank" } : {})}` with `next()` also gating the hint
passes, because the guard compared predicate TEXT and could not prove two calls agree (R4
demonstrated it with a deterministic `next()` true only once). Its own prescribed fix was
"restrict approved gating predicates to pure member/identifier expressions (reject call
expressions)" — which is exactly what R6's fix did for an unrelated reason. A call expression is
no longer an approved gating shape, so this case is now REPORTED, not accepted. Pinned by
"an effectful gating predicate is reported, closing the R4 deferral" in
`tests/styles/_metaNewTabAnnouncement.test.ts`. No follow-up work remains.

**(c) A COMPOUND gating predicate is reported, not compared (new accepted limit, 2026-07-25).**
Only an identifier, a property-access chain, or `!` over either is an approved gate. Deciding
whether two DIFFERENT compound predicates denote the same runtime condition is not something a
static pass can do: six review rounds each produced a new pair that a textual normalizer wrongly
equated, and R6 alone enumerated eleven operator families. So the question is no longer asked.
**If you hit this as a false positive** — a legitimate anchor gated on something like
`isExternal && ready` — the fix is one line at the call site: hoist the condition into a named
boolean (`const opensNewTab = isExternal && ready;`) and gate both the spread and the hint on
that identifier. Do NOT widen the classifier; that is the loop this limit exists to end. Ratified
in spec §6.4. Un-defer trigger: a case where hoisting is genuinely impossible.

### NEWTAB-A11Y-RESIDUE-1 — two P3s from the new-tab announcement dual gate (2026-07-25)

Both surfaced by the invariant-8 gate on `fix/newtab-announcement-family`, both
deliberately left out of that diff.

**(a) Diagram link exposes its name twice.** `components/admin/wizard/step3ReviewSections.tsx`
gives the wrapping `<a>` an `aria-label` built from `alt` AND leaves the inner
`<img alt={alt}>`, so a screen reader navigating into the link can hear the same
string from both nodes. The clean fix is `alt=""` on the img (decorative, since
the anchor is labelled). NOT taken here because it would reverse a previously
accepted audit fix: `tests/components/admin/wizard/step3ReviewSections.test.tsx`
explicitly pins that a blank `alt` falls back for BOTH the img and the anchor
label ("a persisted empty alt must never yield a nameless link", impeccable audit
P2). The anchor's `aria-label` now solves the nameless-link risk permanently, so
the old belt-and-braces is redundant — but flipping it is a separate, reviewed
decision, not a mid-sweep edit. Un-defer trigger: any further a11y pass on the
Step-3 diagram tiles.

**(b) An internal link wears the external glyph.** `components/admin/BellPanel.tsx`
renders "View in telemetry ↗" for `/admin/dev/telemetry#health`, an internal
route. After this sweep, `↗` means "opens a new tab" everywhere else in the
codebase, so this is now the only one that lies. Out of family (no `target`, so
the new structural guard does not see it). Un-defer trigger: next BellPanel copy
or affordance change.

### VOICEOVER-ANNOUNCER-SPOTCHECK — owner action (2026-07-22)

The warning-announcer-copy bundle's manual assistive-technology half (spec §8
F10 mitigation): owner runs VoiceOver over ignore / bulk-ignore / pointer
reveal on the published Sheet-warnings panel (titled "Parse warnings" until
`feat/warning-trim-undefer`) and confirms one polite utterance
per action, silence on background refreshes, and the reveal focus move. The
automated halves (impeccable audit a11y dimension; role/mutation structural
tests) shipped pre-merge. Un-defer trigger: owner performs and records the
pass.

### SHARELINK-COPY-REF-ORDERING-PROOF — test-coverage gap (2026-07-25, share-link-chrome-backlog)

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

### SHARELINK-CUE-VISIBILITY-1 — impeccable critique P1 (2026-07-25, share-link-chrome-backlog)

The crew-URL cue can fire above the fold. The URL block sits at the top of the
share hub's scrolling popover and the rotate control is below it, so on a phone
the operator has scrolled past the block by the time they tap Confirm
(`admin-lifecycle-layout.spec.ts:393` already measures that popover overflowing
at 390x560). The critique's proposed fix is the `scrollIntoView` idiom already
in `components/admin/showpage/ShareHub.tsx:892-907`, fired on the null-to-non-null
`flash` edge.

DEFERRED, with the severity re-read down from P1. The `role="status"` banner
renders inside the rotate control's own subtree — exactly where the operator
just tapped and is therefore looking — and its copy already points upward ("The
updated link is shown above."). So the OUTCOME is communicated on the local
path whether or not the cue is seen; what is missed is the enhancement, not the
message. Auto-scrolling a popover during a destructive confirm is also a new
motion surface needing its own transition inventory and reduced-motion arm,
which is more than a polish pass should take on unreviewed.

Un-defer trigger: an operator reporting they missed a rotation, or the next
admin mobile pass, which can own the scroll behaviour and its reduced-motion
handling together.

### SHARELINK-CUE-FORCED-COLORS-1 — impeccable audit P3 (2026-07-25, share-link-chrome-backlog)

Under `forced-colors` the cue is invisible: UAs drop `box-shadow` and force
`background-color`, so both tracks vanish (`app/globals.css:884`). Systemic
rather than local — the repo has zero `forced-colors` handling anywhere — and
the local rotate path still carries its `role="status"` banner.

Un-defer trigger: a repo-wide forced-colors pass, which should set the pattern
once rather than have this one surface invent it.

### SHARELINK-CONSTANTS-INVENTORY-1 — impeccable critique P2 (2026-07-25, share-link-chrome-backlog)

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

From the impeccable audit of `feat/attention-index` (2026-07-25). A row's `onClick` runs `onClose()` then `onNavigate(item)`; the row unmounts with the menu, the jump handler in `ShowReviewSurface` only scrolls and flashes, and the rescue effect in `PublishedReviewModal` returns early on a user-initiated close. So after pill → Enter → Tab → Enter, the viewport lands on the card but `activeElement` is `<body>`, outside `[role="dialog"]` — the next Tab restarts at the document top, escaping the modal trap, and screen-reader users get no arrival announcement because the flash is visual-only.

**Accepted, not fixed, in the index consolidation.** Verified pre-existing on `origin/main`: actionable rows there carry a byte-identical `onClick` with no focus restoration (`git show origin/main:components/admin/showpage/AttentionMenu.tsx`, the actionable row block), and holds plus the three actionable alert codes are the dominant row class. This diff widens the same behavior to former needs-look rows, which previously moved focus only as a side effect of their inner `<a href>`'s native navigation — an affordance the spec deletes deliberately, since an `<a>` cannot nest inside the `<button>` that makes the whole row pressable.

Fixing it properly means focusing the landed card (`[data-attention-anchor]` with `tabindex="-1"`) from the SHARED jump handler, which is outside this spec's three files and is pinned by a large focus contract (`pillFocusReconcile.test.tsx`, and 26 real-browser tests in `attention-pill-focus.spec.ts`). That is a focus-orchestration change of different character from a grouping/copy consolidation, and it should carry its own spec and its own re-validation of that contract rather than riding along here.

**Un-defer trigger:** any keyboard or screen-reader report of losing place after a jump, or the next change that touches the jump handler for another reason.

### ATTENTION-INDEX-ROW-DESTINATION-NAME-1 — [P2] index rows no longer name where they go

From the same audit. A needs-you row's accessible name is now `"needs review — <title><hint>"`. Deleting the inner action link removed the only words that named the destination ("Open in Sheet", "Go to Overview"), and the trailing `→` is `aria-hidden`. A sighted user infers "pressable, goes somewhere" from the chevron and hover; a screen-reader user gets a button whose name describes the problem but not the movement.

**Accepted, not fixed.** The spec makes rows deliberately jump-only and moves destination naming onto the card's chip (§2.2/§2.3), so adding a destination phrase back into the row name is an amendment to that ratified division, not a defect against it. It also reads awkwardly against the existing sr-only tone prefix (`"needs review — Go to Sheet unavailable"`).

**Un-defer trigger:** owner review of the row's accessible name, or the first screen-reader pass on the merged panel.
