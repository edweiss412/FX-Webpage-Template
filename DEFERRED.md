# DEFERRED.md

Open deferral queue — work intentionally deferred with a concrete un-defer trigger. Distinct from BACKLOG.md (might do, speculative).

**Resolved / stale / N/A entries live in [DEFERRED-archive.md](./DEFERRED-archive.md)** — full provenance kept there, NOT in this working queue. When an item below ships, move its full entry to the archive.

Last reconciled: 2026-07-24 — swept every merged PR body (#445–#570) for deferrals that never reached a ledger; strip-mobile entries graduated the same day. SETTINGS-DEVROW-GALLERY-RESIDUE-1 graduated 2026-07-24 (all four findings closed). Graduation provenance lives in [DEFERRED-archive.md](./DEFERRED-archive.md) (grep by id).

---

### VOICEOVER-ANNOUNCER-SPOTCHECK — owner action (2026-07-22)

The warning-announcer-copy bundle's manual assistive-technology half (spec §8
F10 mitigation): owner runs VoiceOver over ignore / bulk-ignore / pointer
reveal on the published Sheet-warnings panel (titled "Parse warnings" until
`feat/warning-trim-undefer`) and confirms one polite utterance
per action, silence on background refreshes, and the reveal focus move. The
automated halves (impeccable audit a11y dimension; role/mutation structural
tests) shipped pre-merge. Un-defer trigger: owner performs and records the
pass.

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
