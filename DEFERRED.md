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

### SHAREHUB-ARM-VIEWPORT-REVEAL-1 — [P2] armed Archive confirm settles below the viewport on short phones (auto-reveal stops at the popover scroller)

From the archive-row-menu-idiom spec's R8/R9 empirical probes (2026-07-24), measured on LIVE pre-restyle code at 390x560: arming Archive fires the ratified `scrollIntoView(confirm, { block: "end" })` and the popover scroller lands exactly right (`scrollTop` 93 = 483 − 390), but the scrollable modal panel stays at `scrollTop` 0, so the Confirm/Cancel pair sits at viewport y 676-720 in a 560px viewport. The user reaches it by scrolling the modal panel manually.

**Accepted, not fixed, in the archive-row restyle.** Pre-existing behavior on origin/main, untouched by the diff (which reduces armed height by 24px, strictly improving reachability); fixing auto-reveal is a deliberate scroll-orchestration decision (panel + popover coordination) that deserves its own spec, not a rider on a row restyle. Backlog work item: `BL-SHAREHUB-ARM-VIEWPORT-REVEAL` in BACKLOG.md. The restyle's 390x560 e2e asserts the handler's own popover-content-coordinate contract so a regression in what IS ratified still fails.

**Un-defer trigger:** prioritizing BL-SHAREHUB-ARM-VIEWPORT-REVEAL, or user/owner report of the armed confirm being invisible on a phone.

### SHAREHUB-ARCHIVE-GRAVITY-CUE-1 — [P2] the hub's most destructive action carries its calmest idle framing

From the impeccable critique of `feat/archive-row-menu-idiom` (2026-07-24). With the archive row restyled to the shared §4.1 menu-row idiom (the ratified goal), irreversible Archive is now pixel-identical at rest to reversible Rotate, and the section labels invert the consequence hierarchy: Rotate/Reset sit under "CAREFUL" while Archive sits under the neutral "SHOW". The armed state carries the destructive weight correctly (inverted-amber Confirm + consequence prose, two-tap, no timer), so no action is reachable without the gravity cue — the gap is idle-scan salience only.

**Accepted, not fixed, in the archive-row restyle.** Idiom unification was the ratified point of the change (19-round spec); adding a distinguishing destructive cue back to the idle row (amber glyph tint, a "CAREFUL"-weight eyebrow for the Show section, or folding Archive under CAREFUL) is an owner voice/IA decision that would amend the ShareHub section design, not this restyle.

**Un-defer trigger:** owner review of the hub's section labeling, or any real incident/report of an accidental arming (the two-tap confirm still guards the commit either way).
