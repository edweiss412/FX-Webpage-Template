# DEFERRED.md

Open deferral queue — work intentionally deferred with a concrete un-defer trigger. Distinct from BACKLOG.md (might do, speculative).

**Resolved / stale / N/A entries live in [DEFERRED-archive.md](./DEFERRED-archive.md)** — full provenance kept there, NOT in this working queue. When an item below ships, move its full entry to the archive.

Last reconciled: 2026-07-24 — swept every merged PR body (#445–#570) for deferrals that never reached a ledger; strip-mobile entries graduated the same day. Graduation provenance lives in [DEFERRED-archive.md](./DEFERRED-archive.md) (grep by id).

---

### SETTINGS-DEVROW-GALLERY-RESIDUE-1 — [P2/P3 ×4] impeccable residue on the settings Developer-tools row

From the impeccable dual-gate of `settings-attention-gallery-link` (PR #544). Zero P0/P1; four P2/P3 findings were deferred with spec-freeze rationales and recorded ONLY in `docs/superpowers/plans/2026-07-21-settings-attention-gallery-link/closeout.md:47-52` — never in this queue. Filed here 2026-07-24 by a PR-body-vs-ledger reconciliation sweep; all four re-verified live against `components/admin/settings/DevToolsRow.tsx` at that date.

1. **[P2] "Open" label ambiguous beside a named sibling.** `DevToolsRow.tsx:53` renders `Open` next to `Attention gallery` (`:61`) in the same control cluster, so an SR link list reads a bare "Open". Deferred: renaming existing copy conflicts with spec §1.1 "row copy unchanged"; WCAG 2.4.4 is satisfied by the in-context row heading.
2. **[P2] Link label vs destination heading mismatch.** The link reads "Attention gallery"; the destination `<h1>` reads "Attention modal gallery" (`app/admin/dev/attention-gallery/page.tsx:54`). Deferred: the label is ratified in spec §1.1/§3 (user-approved) and the h1 gives immediate confirmation on arrival.
3. **[P3] `devLinkClass` diverges from its sibling secondary button.** `DevToolsRow.tsx:16-17` omits `transition-colors duration-fast` (and a ring offset) that `DriveConnectionPanel.tsx:244` carries. Deferred: the literal was carried verbatim per spec §3 ("className identical to the Open link"); aligning both is cross-component polish. **Fix shape corrected 2026-07-24:** close this on the `transition-colors duration-fast` half only. The offset half is superseded by the two-tier focus recipe shipped in PR #558 — DESIGN.md §1.1 now bans bare `focus-visible:ring-offset-2` (an offset MUST carry a container-matched `ring-offset-<backdrop>`, and popover surfaces reserve offsets for armed destructive confirm-go). Adding a bare offset here would introduce the dark-mode white-gap defect, not parity; the two `DriveConnectionPanel` siblings (`:244`, `:277`) carry bare offsets and are the pre-existing drift to reconcile in the same pass.
4. **[P3] Row description does not mention the gallery action.** "Fixture tester and parse diagnostics. Hidden from normal use." (`DevToolsRow.tsx:48`) predates the second link. Deferred: spec §1.1 freezes the row description copy.

**Un-defer trigger:** any spec amendment reopening the settings dev-row copy (closes 1, 2, 4), or the next cross-component focus/transition parity pass on admin settings buttons (closes 3 plus the `DriveConnectionPanel` bare-offset drift). Items 1, 2 and 4 need owner copy ratification; item 3 does not.

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
