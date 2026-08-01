# Announcement a11y pass — arm-expiry + remote-rotation live regions

**Date:** 2026-08-01 · **Status:** APPROVED (Codex adversarial review R5, 2026-08-01) · **Charter:** BACKLOG.md `BL-DESTRUCT-ARM-STATE-ANNOUNCEMENTS` + `BL-SHAREHUB-REMOTE-ROTATE-ANNOUNCE` (the two rows the 2026-08-01 focus-ring pass left OPEN for this follow-up spec).

## 1. Scope

Two screen-reader gaps, one PR:

1. **Silent arm expiry** (BL-DESTRUCT-ARM-STATE-ANNOUNCEMENTS). Every two-tap destructive confirm auto-reverts after `ARM_REVERT_MS` (4s). At revert the armed live region empties or the confirm panel unmounts; emptying a live region announces nothing, so a screen-reader user believes they are still armed. This spec announces the close.
2. **Silent remote rotation** (BL-SHAREHUB-REMOTE-ROTATE-ANNOUNCE). Another admin's share-token rotation reaches this browser through `router.refresh()`; the visual flash cue is `animation: none` under reduced motion (app/globals.css, `[data-share-link-flash]` reduced-motion block) and no banner mounts (the rotate success banner renders off `result`, local state written only by this browser's own action). This spec adds a ShareHub-owned live region mirroring the visual cue.

Not a timing change: `ARM_REVERT_MS` stays 4s (ratified below). One in-scope disarm fix rides along: StagedReviewCard's `handleApply` leaves the arm timer live across the Apply mutation (§3.3, found R1) — without it, the new expiry announcement could fire mid-mutation.

## 1.1 Resolved scope — do not relitigate

- **Keep 4s + announce expiry.** Owner-ratified 2026-08-01 (AskUserQuestion, this pipeline): `ARM_REVERT_MS` stays `4_000` (lib/admin/destructiveConfirm.ts, `ARM_REVERT_MS`; T3 pin at tests/styles/_metaDestructiveConfirm.test.ts, "ratified 4s"). The 8s-raise and pause-while-focused alternatives were presented and declined. Do not propose window-length changes.
- **Mirror the visual cue.** Owner-ratified 2026-08-01 (same AskUserQuestion): the ShareHub announcement fires under the SAME predicate as the visual flash (popover open + link active + accepted non-null-to-non-null token change) and NOT when the popover is closed. Do not propose closed-popover announcements.
- **Local rotate stays silent in the hub region.** RotateShareTokenButton's own success banner (`role="status"`, data-testid `admin-rotate-share-token-ok`) already announces the local rotation; a second hub-region announcement would recreate the double-announce class BL-NEWTAB-DOUBLE-ANNOUNCE closed (PR #640). Suppression mechanism in §4.2.
- **Guard posture is lexical presence, not semantics.** tests/styles/_metaDestructiveConfirm.test.ts carries a six-round history lesson (its own comment block, "WHAT IT DELIBERATELY DOES NOT COVER"): identifying "which call is the arm timer" by regex produced a bypass per round and then false positives. The §5.2 meta-test therefore pins only lexical co-presence (importer of `ARM_REVERT_MS` must also reference the shared expiry constant or hold an exemption row); whether the announcement actually fires on the timer path is proven per surface by behavioral tests (§5.1), not by the meta-test. Do not demand a semantic scanner.
- **Row-idiom carve-out untouched.** DESIGN.md §15 (owner-ratified 2026-07-20): tier-2 controls rendered as titled rows inside a popover dismiss via explicit Cancel, not auto-revert (`ArchiveShowButton` row branch skips the timer: `if (asRow) return` before the `setTimeout`). No timer means nothing expires; those branches are exempt rows, not gaps.
- **Rotate keeps its timer.** RotateShareTokenButton's 4s auto-revert is live code this pass announces, not removes; the DESIGN.md sentence claiming rotate never had a timeout is corrected as a docs fix (§3.2). Whether the rotate row should ADOPT the archive row's no-timer idiom is a separate owner decision, deliberately not taken here — do not propose it as a finding in either direction.
- **No new §12.4 codes.** Expiry and remote-rotation copy are admin-facing inline sentences, the same posture as the `not-subject:M5-D8` precedent (components/admin/wizard/CrewRowActions.tsx, onConfirm outcome copy). No catalog rows, no `pnpm gen:spec-codes`.
- **Copy is fixed by this spec** (§3.1, §4.3). Wording nits are P3 review territory, not blocking findings.

## 2. Current state (citations)

- `ARM_REVERT_MS = 4_000`, single declaration: lib/admin/destructiveConfirm.ts (T1 pins uniqueness; T3 pins the value — tests/styles/_metaDestructiveConfirm.test.ts).
- Eleven importer surfaces (census in §3.2's matrix).
- Existing arm live regions announce the ARM on the morph-idiom surfaces (e.g. components/admin/PendingPanelDiscardButtons.tsx, sr-only `role="status"` span rendering "Tap again to stop tracking this sheet permanently." when armed, "" when idle). Emptying to "" at revert is the silent close.
- Panel-idiom surfaces announce the ARM via the focus contract (DESIGN.md §15 Focus rules: open focuses the safe control; auto-revert restores focus to the re-mounted trigger only when focus was inside). The restore announces the trigger's NAME but never says WHY the panel vanished.
- ShareHub cue logic: components/admin/showpage/ShareHub.tsx — render-phase `prevToken`/`flash` pair (three-branch rule in the "Crew-URL change cue" block), clear predicate `(!open || !linkActive)`, `SHARE_LINK_FLASH_MS = 1600`.
- Token cache: app/admin/show/[slug]/ShareTokenContext.tsx — `applyRotated` (local instant path, epoch-gated) and the render-phase server-seed reconcile block (accept iff `initialEpoch >= p.epoch`). A remote/lifecycle rotation reaches the held state ONLY through the seed path; a local rotate reaches it through `applyRotated` first, so the later seed carries an equal token and changes nothing.
- reset_picker_epoch_atomic bumps `picker_epoch` only, never `share_token` (supabase/migrations/20260523000003_reset_picker_epoch_atomic.sql) — a picker reset does not produce a token change, so it cannot trigger the new announcement.
- Rotate success banners: app/admin/show/[slug]/RotateShareTokenButton.tsx (`admin-rotate-share-token-ok`, `-ok-inactive`, both `role="status" aria-live="polite"`).

## 3. Part 1 — arm-expiry announcements

### 3.1 Shared copy constant

lib/admin/destructiveConfirm.ts gains, beside `ARM_REVERT_MS`:

```ts
/** Announced (sr-only, role="status") when an armed two-tap confirm auto-reverts.
 *  Explicit disarms (second-tap confirm, Cancel, Escape, sibling action) stay
 *  silent; their own outcome announcements cover them. */
export const ARM_EXPIRED_ANNOUNCEMENT = "Confirm window closed. Nothing was changed.";
```

One string for all surfaces: the window closing means the same thing everywhere, and a shared constant is what the §5.2 meta-test can pin lexically.

### 3.2 Per-surface matrix

Eleven importers of `ARM_REVERT_MS` (T1's walk; none of the eleven files contains NUL bytes — plain rg/grep verification is valid here, unlike the focus-ring pass's Step3Review case). Idiom names follow DESIGN.md §15: **morph** = the trigger itself re-labels; **panel** = the trigger swaps for a confirm/cancel row.

| # | Surface | Idiom | Timer callback today | Arm announced today by | Expiry change | Behavioral test lands in |
|---|---------|-------|----------------------|------------------------|---------------|--------------------------|
| 1 | components/admin/BulkIgnoreControls.tsx | morph (per-group chip) | `setArmedCode(null)` (onGuardedClick) | sr-only region "Tap again to confirm." (per chip) | region gains expired state | tests/components/admin/bulkIgnoreControls.test.tsx |
| 2 | components/admin/wizard/CrewRowActions.tsx | panel (2-stop focus trap) | `closeFully(true)` (enterConfirm) | focus move into trap | NEW persistent sr-only region, expiry only | tests/components/admin/wizard/crewRowActions.test.tsx |
| 3 | components/admin/BlockedRowResolver.tsx | morph | `setArmed(false)` | sr-only region "Tap again to confirm." | region gains expired state | tests/components/admin/BlockedRowResolver.test.tsx |
| 4 | components/admin/PendingPanelDiscardButtons.tsx | morph | `setArmed(false)` (onGuardedIgnoreClick) | sr-only region "Tap again to stop tracking this sheet permanently." / "Working…" | region gains expired state | tests/components/admin/pendingIngestionActions.test.tsx |
| 5 | components/admin/ResolveAlertButton.tsx | panel | `closeConfirm()` (onResolveClick) | focus move to cancel (C3) | NEW persistent sr-only region, expiry only | tests/components/ResolveAlertButton.test.tsx |
| 6 | components/admin/ArchiveShowButton.tsx | morph (compact/full) + row panel | `setArmed(prev => prev ? false : prev)`; row branch has NO timer (`if (asRow) return` before the setTimeout) | NOTHING on the morph branches (label swap only; morph focus exemption means no focus move either) | NEW persistent sr-only region on the morph branches carrying BOTH the arm prompt ("Tap again to confirm.") and expiry. Row branch: exempt, no timer (§1.1 carve-out) | tests/components/admin/ArchiveShowButton.test.tsx |
| 7 | components/admin/StagedReviewCard.tsx | morph | `setIgnoreArmed(false)` (onGuardedIgnoreClick) | sr-only region "Tap again to confirm." | region gains expired state; PLUS in-scope fix: `handleApply` gains disarm + timer clear (§3.3, R1 F1) | tests/components/StagedReviewCard.test.tsx |
| 8 | app/admin/show/[slug]/PickerResetControl.tsx | panel | `closeConfirm()` (enterConfirm) | focus move (C3); persistent success region already exists (`outcome ok` text) | existing persistent region multiplexes: expiry state added | tests/admin/pickerResetControl.test.tsx |
| 9 | app/admin/show/[slug]/ResetPickerEpochButton.tsx | panel | `closeConfirm()` (onResetClick arm handler) | focus move (C3); persistent success region already exists (`okMessage`) | existing persistent region multiplexes: expiry state added | tests/components/ResetPickerEpochButton.test.tsx |
| 10 | app/admin/show/[slug]/RotateShareTokenButton.tsx | panel row (explicit Cancel AND a live 4s timer — see the DESIGN.md correction below) | `closeConfirm()` (onRotateClick) | focus move (C3); success banners are conditional, not persistent | NEW persistent sr-only region, expiry only | tests/components/RotateShareTokenButton.test.tsx |
| 11 | app/admin/settings/admins/RevokeRowButton.tsx | panel | `closeConfirm()` (onRevokeClick) | focus move (C3) | NEW persistent sr-only region, expiry only | tests/components/RevokeRowButton.test.tsx |

Arm-gap note on row 6: the backlog row charters the close, not the open — but ArchiveShowButton's morph branches are the one place in the family where the ARM is fully silent today (no region, no focus move). The new region needed for expiry carries the arm prompt too; announcing a window's close without ever announcing its open would be incoherent. This is the only arm-copy addition in the pass (matrix column 5 shows every other surface already announces the arm one way or the other).

Panel-idiom implementation constraint: the timer callback and Cancel share `closeConfirm()` on every panel surface. The expiry text is set IN THE TIMER CALLBACK, alongside (not inside) `closeConfirm()`, so the Cancel path cannot announce. The new/extended region must be mounted across idle, confirm, and resolving states (text swaps into a pre-existing region — the Safari/VoiceOver rule already documented on the existing regions).

**DESIGN.md correction (docs, same PR).** DESIGN.md §15's row-idiom carve-out sentence claims "the rotate row has always dismissed via `Cancel`, not a timeout" — inherited from the 2026-07-20 amendment (docs/superpowers/specs/admin/2026-07-16-destructive-confirm-pass.md, Amendment section). The claim is false: the same spec's F4 test section states "All five trigger-swap surfaces HAVE auto-revert timers (verified: RotateShareTokenButton.tsx …)", and the live code arms one (`onRotateClick` sets the `ARM_REVERT_MS` timeout). The carve-out DECISION (archive row drops the timer) is untouched; only the false factual aside about rotate is corrected while this pass adds its announcement paragraph to §15. No behavior change to rotate's timer — dropping it would be a separate owner decision, out of scope here.

### 3.3 State machine (both idioms)

The expiry announcement is set in EXACTLY ONE place per surface: the `ARM_REVERT_MS` timer callback. Every other disarm path stays silent:

- Second-tap confirm: the action's own running/success/error announcements cover it.
- Explicit Cancel / Escape (panel idiom): user-initiated; announcing "nothing was changed" for a deliberate cancel is noise.
- Sibling-action disarm (e.g. PendingPanelDiscardButtons: any discard starting disarms the pending permanent-ignore): the sibling's own announcements cover it.

Region lifecycle (R1 F2 repair, completed R2 F1 — one rule, both idioms): **the `expired` flag is SET in exactly one place, the timer callback; it is CLEARED by arming AND by any action dispatch on the surface.** Concretely:

- On ARM: morph rows replace the content with the arm prompt; panel rows (whose arm is focus-announced) and multiplex rows CLEAR the expiry text (multiplex rows already clear their outcome on re-arm today, e.g. PickerResetControl's `setOutcome(null)` in `enterConfirm`). Either way the region's content CHANGES on arm.
- On ANY action dispatch (confirm firing, a sibling mutation starting): `expired` clears alongside the existing disarm, **at dispatch ENTRY — before the request is issued — never in a settlement branch** (R3 F1 structural closure: a dispatch-entry clear is settlement-kind-independent by construction, so success, returned-error, and thrown-error settlements cannot differ; clearing in any settlement branch is a spec violation, not an implementation choice). Without this, a surface that multiplexes running text into the same region (PendingPanelDiscardButtons renders "Working…" while running) would transition expiry → "Working…" → back to the PERSISTED expiry text after the mutation settles — re-announcing "Nothing was changed" right after something WAS changed (R2 F1). Row 4 is the only surface that multiplexes running text this way, but the clear-on-dispatch rule applies uniformly so no future multiplexing reopens the class.
- On timer fire: the region gets `ARM_EXPIRED_ANNOUNCEMENT`.

Because every arm changes the content, the sequence expire → re-arm → expire is two distinct content transitions and the second expiry always announces (an unchanged live-region rewrite may be skipped by screen readers; this rule makes the unchanged rewrite unreachable on the destructive surfaces). No auto-clear timer — a lingering sr-only string re-announces nothing and adds no visual.

**In-scope code fix (R1 F1): StagedReviewCard `handleApply` does not disarm.** Unlike `handleDiscard` (which clears the arm timer) and unlike PendingPanelDiscardButtons (where ANY discard starting disarms the pending confirm — its own R2 rule), `handleApply` neither clears `ignoreArmTimerRef` nor resets `ignoreArmed`. An Apply taking longer than 4s would let the timer fire mid-mutation — under this spec, announcing "Nothing was changed" during a mutation that IS changing things. Fix in this pass: `handleApply` clears the timer and disarms on entry, mirroring `handleDiscard`; behavioral test in §5.1. Class-sweep result (all 11 surfaces): this is the ONLY sibling-mutation path that leaves the arm timer live — BulkIgnoreControls clears before `ignoreGroup`, PendingPanelDiscardButtons clears in `handleClick`, BlockedRowResolver disarms on an external `disabled` flip (its compound-transition effect), and the panel surfaces have no sibling mutations reachable while armed.

Guard conditions: with the F1 fix, the timer is cleared on every confirm/cancel/sibling path, so the expiry text can never overwrite an in-flight "Working…" or an outcome message. §5.1's stale-timer assertions prove this per surface by advancing past `ARM_REVERT_MS` AFTER each disarm path.

Per-group keying on BulkIgnoreControls (R1 F3): the component renders one persistent region per group while `armedCode` and the timer are component-global. The expiry state is therefore a code-keyed `expiredCode` (set to the arming group's code in the timer callback, cleared on any arm); each group's region renders the expiry copy only when `expiredCode` equals its own code. Exactly one region may ever carry the copy — §5.1 asserts the announcing region AND that every sibling group's region is simultaneously empty.

### 3.4 Focus interplay

DESIGN.md §15 focus rules are UNCHANGED: auto-revert still restores focus to the re-mounted trigger when focus was inside, guarded so a timer firing while the user works elsewhere never steals focus. The announcement is additive — it explains the close that the focus restore only implies. No surface changes its focus behavior in this pass.

## 4. Part 2 — ShareHub remote-rotation announcement

### 4.1 Detection: the seed-diff bump

app/admin/show/[slug]/ShareTokenContext.tsx gains a monotone counter, `remoteTokenChanges`, exposed on the context value. It increments ONLY inside the server-seed reconcile branch, when the accepted seed actually CHANGES the held token between two non-null values:

- accept branch taken (`initialEpoch >= p.epoch`), and
- `p.token !== null && initialToken !== null && initialToken !== p.token`.

Why this is exactly "remote": a local rotate goes through `applyRotated` first (instant path), so by the time its own `router.refresh()` seed lands, the held token already equals the seed and the condition is false. A rotation this browser did NOT apply locally (another admin's rotate; an unarchive minting a new token while the popover context survives) can only enter through the seed, and does change the held token. Null transitions (token appearing/disappearing) are excluded to mirror the flash cue's both-non-null rule — they never represent "the link you had is now dead" (the cue's meaning).

Known edge, accepted: this browser's OWN rotate on an INACTIVE crew link skips `applyRotated` (RotateShareTokenButton gates `onRotated` on `isCrewLinkActive`), so its seed WOULD bump the counter — but `linkActive` is false in that state, and §4.2's predicate suppresses the announcement. Same suppression as the visual cue's clear predicate.

### 4.2 ShareHub live region

ShareHub watches `remoteTokenChanges` with the same render-phase adjust-state pattern as `prevToken` and sets a local `remoteAnnounce: string | null` when ALL of:

- the counter advanced since last render,
- `open` is true,
- `linkActive` is true.

Cleared by the exact clear predicate the flash uses: `(!open || !linkActive)`. The region is a persistent sr-only `role="status"` element mounted at the popover root WHENEVER the popover is open, empty until the event — text swaps into a pre-existing region (the project's established Safari/VoiceOver-safe pattern, e.g. app/admin/show/[slug]/ResetPickerEpochButton.tsx liveRegion comment). A remote change while the popover is CLOSED announces nothing and leaves nothing behind (mirror-the-cue ratification, §1.1).

Local rotate: `applyRotated` path never bumps the counter — the hub region stays empty and the rotate button's own banner announces (§1.1).

### 4.3 Copy

```
Crew link changed. The earlier link no longer works.
```

Deliberately does not say WHO rotated (the client cannot know) and does not repeat the URL (the crew-link row beside it carries it; the flash cue highlights it visually).

## 5. Testing

### 5.1 Per-surface behavioral tests (part 1)

For each matrix row with a timer, extend the surface's existing auto-revert tests (every one of the 11 files already runs `vi.useFakeTimers` + a 4s advance around the revert) with:

- **Expiry announces:** arm, advance past `ARM_REVERT_MS` → the sr-only `role="status"` region's text equals the LITERAL string "Confirm window closed. Nothing was changed." written in the test, NOT the imported constant (R1 F6 anti-tautology: comparing rendered output to the same import would pass if the constant were edited to anything, including empty).
- **Every explicit disarm path is silent, including after the timer horizon** (R1 F4): for EACH path below — disarm, then advance past `ARM_REVERT_MS`, then assert the region never contained the expiry copy (the advance catches a stale timer that a same-tick assertion would miss). Paths per surface:
  - second-tap confirm (all timered rows);
  - Cancel: rows 5, 8, 9, 10, 11; Cancel + Escape + backdrop click on the ARMED confirm (`closeFully(false)`, R2 F2 — existing backdrop coverage exercises menu mode only) + parent-driven close: row 2;
  - sibling actions: row 4 (defer discard), row 7 (Apply — proves the F1 fix — and discard);
  - post-expiry action does not re-announce (R2 F1, completed R3 F1): the assertion pins the DISPATCH-ENTRY clear — expire → dispatch → assert the expiry copy is ALREADY gone at the running state (before any settlement), then let it settle and assert it never returns. This case is doubled on row 4: Defer settling OK and Defer settling on the returned-error path (dispatch-entry clearing makes thrown-error equivalent to returned-error by construction; the error variant proves the clear was not sitting in the success branch). Closure over dispatch entries (R4 F1): **every DISTINCT dispatch-entry function reachable while `expired` is true gets one representative post-expiry test.** That set, enumerated across all 11 surfaces: row 4 `handleClick` (the Defer variants above) and row 7 BOTH entries — `handleApply` AND `handleDiscard` (one representative discard; Retry-on-next-sync and Wait-for-next-edit share it). No other surface has a post-expiry-reachable dispatch: on every panel row the confirm/cancel controls unmount at expiry, and on rows 1, 3, and 6 the next click re-arms rather than dispatching (row 1's sibling chips likewise arm first). Each test asserts the expiry copy is gone at dispatch and absent after settle;
  - external `disabled` flip while armed: row 3;
  - arming a DIFFERENT group while one is armed: row 1 (re-arm switches groups; old group's region stays empty).
- **Re-arm audibility (R1 F2):** expire → re-arm → expire; assert the region content changed on the arm (arm prompt on morph rows, cleared on panel/multiplex rows) and carries the expiry copy again after the second advance.
- **Row 1 exclusivity (R1 F3):** with ≥2 groups rendered, expire one group → its region carries the copy and every sibling group's region is empty.
- **Row 6 row-branch negative:** the `asRow` archive variant never renders the expiry copy at any timer advance (no timer exists).

Assertions read the region's text content, scoped to the sr-only status element — not a container that also renders visible banners (anti-tautology rule). Existing per-surface test files (matrix column) are extended rather than duplicated.

### 5.2 Structural meta-test (part 1)

Extend tests/styles/_metaDestructiveConfirm.test.ts with T4: walk `components/` + `app/` + `lib/`; every file whose stripped source references `ARM_REVERT_MS` (the existing T1 walker + comment-stripping infrastructure) must also reference `ARM_EXPIRED_ANNOUNCEMENT`, or appear in an inline exemption list with a reason (the declaration module itself is trivially both). Lexical presence only — "no known spelling is absent" honesty posture (§1.1). Self-check cases pin the predicate (reference-in-comment does not count; type-only mention counts as reference — documented limit, same trust level as the T1 matcher).

And T5 (R1 F6): the constant's VALUE is pinned exactly — `expect(mod.ARM_EXPIRED_ANNOUNCEMENT).toBe("Confirm window closed. Nothing was changed.")` — the same shape as T3's 4s pin, so editing the copy (or emptying it) fails a test that does not import the constant as its own expectation. §5.1's literal-string assertions are the per-surface twin of this pin.

### 5.3 ShareHub tests (part 2)

Extend the tests/components/admin/showpage/shareHubFlashState.test.tsx harness (it already drives both paths: `reseed(nextToken, nextEpoch)` = server seed, and a probe child calling `applyRotated` = local):

- remote accepted change, popover open + link active → region text equals the LITERAL §4.3 string written in the test (same anti-tautology rule as §5.1);
- same change with popover closed → region absent/empty, and reopening does NOT announce retroactively;
- qualifying counter bump while `open && !linkActive` (R1 F5a — the inactive-own-rotate edge from §4.1) → no announce, and no retroactive announce when `linkActive` later becomes true;
- `linkActive` dropping false while the popover STAYS open (R1 F5b — reachable via the existing busy-held unpublish path in the harness) → announced text cleared; a clear keyed only to `!open` fails this;
- local `applyRotated` change (+ its equal-token follow-up seed) → region stays empty;
- stale seed (lower epoch, rejected) → no bump, region empty;
- SAME token at a HIGHER epoch (R1 F5c — the real `reset_picker_epoch_atomic` sequence: epoch advances, token unchanged) → no bump, region empty; a counter keyed to epoch advance instead of token change fails this;
- null-involved transitions (token→null, null→token) → no bump;
- clear predicate: announce, then close popover → cleared.

Context unit: `remoteTokenChanges` increments once per qualifying seed and never on `applyRotated` (extend the ShareTokenContext coverage in the same harness file).

### 5.4 Gates

UI files under `components/` + `app/` change → invariant-8 impeccable dual-gate (critique + audit) on the diff. No DB, no advisory-lock surfaces, no routes, no migrations (§2's migration citation is read-only evidence). No e2e needed: every assertion is live-region text or state, all jsdom-provable; the existing e2e flash spec (tests/e2e/share-link-flash.spec.ts) is untouched.

## 6. Documented limits

- **Identical consecutive ShareHub announcement may be swallowed.** Two remote rotations in quick succession set the same string twice; some screen readers skip an unchanged live-region rewrite. Worst case: the second of two back-to-back remote rotations goes unannounced while the first was announced seconds earlier — conservative, surfaced-once, files here rather than buying a re-announce nonce. (On the destructive surfaces this class is UNREACHABLE by construction: §3.3's arm-writes-the-region rule guarantees a content change between consecutive expiries.)
- **T4 is lexical.** A surface could import both constants and wire the announcement to the wrong path; the per-surface behavioral tests are the real proof, T4 only prevents silent omission on NEW surfaces. Same honesty posture as T1 (tests/styles/_metaDestructiveConfirm.test.ts header).
- **Panel-idiom arm remains focus-announced, not region-announced.** This pass adds the expiry announcement everywhere a timer exists but does not convert panel arms to live-region arms — the focus contract already announces the safe control on open (DESIGN.md §15).

## 7. Out of scope

- Any change to `ARM_REVERT_MS`, the row-idiom carve-out, or focus behavior (§1.1).
- Closed-popover rotation announcements (§1.1).
- Arm-copy rewrites on surfaces that already announce the arm.
- The visual flash cue and its e2e spec.
- DESIGN.md §15 gains one paragraph documenting the expiry-announcement contract and the ShareHub region (docs task in the plan), nothing else in DESIGN.md moves.
