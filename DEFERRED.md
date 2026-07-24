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
