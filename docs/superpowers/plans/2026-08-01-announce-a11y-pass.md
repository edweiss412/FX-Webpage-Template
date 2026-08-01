# Announce a11y pass — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this pipeline runs inline, autonomous-ship). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Announce the auto-revert close of every two-tap destructive confirm (11 `ARM_REVERT_MS` surfaces) and remote share-token rotations in ShareHub, per docs/superpowers/specs/2026-08-01-announce-a11y-pass-design.md (spec is canonical; §-references below are into it).

**Architecture:** One shared expiry copy constant; per-surface `expired` state set ONLY in the timer callback, cleared on arm/action-start; sr-only `role="status"` regions (extend where present, add persistent ones where absent). ShareHub side: a `remoteTokenChanges` counter in ShareTokenContext bumped by seed-driven token changes, watched by ShareHub with the existing render-phase pattern.

**Tech Stack:** React 19 client components, vitest + RTL + fake timers, structural meta-tests in tests/styles/_metaDestructiveConfirm.test.ts.

## Global constraints

- Spec §1.1 fences: 4s window unchanged; mirror-the-cue predicate; local rotate suppressed; lexical guard posture; rotate keeps its timer; copy strings exactly as spec §3.1/§4.3; no new §12.4 codes.
- Region rule (§3.3): only arm/action-start clears `expired`, only the timer callback sets it. Panel timer callbacks set it BESIDE `closeConfirm()`, never inside (Cancel shares `closeConfirm`).
- Behavioral tests assert the LITERAL copy string, never the imported constant (§5.1/F6).
- Every commit conventional-commits, one task per commit, `--no-verify` per pipeline charter.
- No NUL-byte files among the touched set — rg is trustworthy here.

## Meta-test inventory (mandatory declaration)

- EXTENDS tests/styles/_metaDestructiveConfirm.test.ts: T4 (ARM_REVERT_MS ⇒ ARM_EXPIRED_ANNOUNCEMENT lexical co-presence) + T5 (copy value pin).
- EXTENDS tests/components/admin/showpage/shareHubFlashState.test.tsx harness (remote/local/clear cases).
- Auth/DB/advisory/alert registries: none applies — client-component + docs diff only; no Supabase calls, no locks, no routes, no migrations.
- Layout-dimensions / transition-audit tasks: N/A — sr-only regions only, no visual state or fixed-dimension parents.
- e2e harness-readiness: N/A — no Playwright attached; all assertions are jsdom live-region text.
- New files: NONE (constant lives in existing lib module; all tests extend existing files) → no testMatch/workflow wiring changes.

## Mutation-family closure for T4 (review convergence set)

1. New surface imports `ARM_REVERT_MS`, no `ARM_EXPIRED_ANNOUNCEMENT` reference → violation.
2. Reference only inside a comment → stripped, still a violation (self-check fixture).
3. Local re-declaration of `ARM_EXPIRED_ANNOUNCEMENT` instead of import → caught by extending T1's uniqueness walk to the new constant (T4a below).
4. Exemption row without a reason string → registry-shape assertion.

A reviewer-proposed NEW family is admissible only with a live escaping mutant demonstrated against the shipped guard.

---

### Task 1: shared constant + value pin (T5, T4a)

**Files:** Modify lib/admin/destructiveConfirm.ts, tests/styles/_metaDestructiveConfirm.test.ts.

- [ ] Add to tests/styles/_metaDestructiveConfirm.test.ts (inside the existing "META arm-revert timing contract" describe):

```ts
it("T5: the expiry copy is the ratified string", async () => {
  const mod = await import("@/lib/admin/destructiveConfirm");
  expect(mod.ARM_EXPIRED_ANNOUNCEMENT, "spec 2026-08-01-announce-a11y-pass §3.1").toBe(
    "Confirm window closed. Nothing was changed.",
  );
});
```

Also T4a: generalize the T1 declaration walk to assert `ARM_EXPIRED_ANNOUNCEMENT` is declared exactly once, in the same module (clone the `DECL` regex with the new identifier; keep both self-checks).

- [ ] Run: `pnpm vitest run tests/styles/_metaDestructiveConfirm.test.ts` — T5 FAILS (export missing).
- [ ] Implement in lib/admin/destructiveConfirm.ts (below ARM_REVERT_MS, comment per spec §3.1 code block — semicolon, no em-dash).
- [ ] Re-run: PASS. Commit `feat(admin): shared ARM_EXPIRED_ANNOUNCEMENT constant + T5/T4a pins`.

### Task 2: morph surfaces with existing regions — PendingPanelDiscardButtons + BlockedRowResolver

**Files:** Modify components/admin/PendingPanelDiscardButtons.tsx, components/admin/BlockedRowResolver.tsx; tests tests/components/admin/pendingIngestionActions.test.tsx, tests/components/admin/BlockedRowResolver.test.tsx.

Pattern (both): `const [expired, setExpired] = useState(false);` — timer callback adds `setExpired(true)`; the arm branch and every action dispatch add `setExpired(false)`. Region ternary gains the expired arm LAST (armed/running win):

```tsx
<span role="status" className="sr-only">
  {armed
    ? "Tap again to stop tracking this sheet permanently."
    : state.kind === "running"
      ? "Working…"
      : expired
        ? ARM_EXPIRED_ANNOUNCEMENT
        : ""}
</span>
```

(BlockedRowResolver's region keeps its own "Tap again to confirm." arm copy; its `disabled`-flip disarm effect also clears `expired`.)

- [ ] Tests first (extend the existing fake-timer auto-revert tests in each file):
  - expiry: arm → `advanceTimersByTime(4_000)` → region text `"Confirm window closed. Nothing was changed."` (literal).
  - confirm-tap silent: arm → second tap → advance 4s → expiry copy never appeared.
  - sibling silent (Pending): arm ignore → click defer → advance 4s → no expiry copy.
  - post-expiry action does not re-announce (spec §5.1 R2 F1, Pending): expire → dispatch Defer → let it settle → region holds idle/outcome content, expiry copy did NOT return (catches a persisted `expired` flag surviving the "Working…" multiplex).
  - disabled-flip silent (Blocked): arm → flip `disabled` → advance 4s → no expiry copy.
  - re-arm audibility: expire → arm again (region shows arm prompt) → expire again (copy present again).
- [ ] RED → implement → GREEN → commit `feat(admin): announce arm expiry on pending-discard + blocked-row surfaces`.

### Task 3: BulkIgnoreControls — per-group expiry keying

**Files:** Modify components/admin/BulkIgnoreControls.tsx; test tests/components/admin/bulkIgnoreControls.test.tsx.

`const [expiredCode, setExpiredCode] = useState<string | null>(null);` Timer callback (captures `group.code` as the existing arm does): `setArmedCode(null); setExpiredCode(group.code);` Arm branch and `ignoreGroup` dispatch: `setExpiredCode(null)`. Per-group region:

```tsx
<span role="status" className="sr-only">
  {armed ? "Tap again to confirm." : expiredCode === group.code ? ARM_EXPIRED_ANNOUNCEMENT : ""}
</span>
```

- [ ] Tests: expiry announces on the armed group's region; EXCLUSIVITY — with ≥2 groups, expire group A → A's region carries the copy AND B's region is empty (query all `role="status"` sr-only spans, assert exactly one non-empty); group-switch silent — arm A, arm B before 4s, advance → A empty (B armed prompt); confirm-tap silent; re-arm audibility.
- [ ] RED → implement → GREEN → commit `feat(admin): per-group arm-expiry announcement on bulk ignore chips`.

### Task 4: StagedReviewCard — region + the Apply disarm fix (spec §3.3 R1 F1)

**Files:** Modify components/admin/StagedReviewCard.tsx; test tests/components/StagedReviewCard.test.tsx.

Two changes: (a) region ternary gains expired arm (same pattern as Task 2, arm copy "Tap again to confirm."); (b) `handleApply` gains, at entry after the `pending` guard: `clearIgnoreArmTimer(); setIgnoreArmed(false); setExpired(false);` — mirroring `handleDiscard`.

- [ ] Tests: expiry announces; confirm-tap silent; **Apply disarm** — arm ignore → click Apply (mock fetch pending) → advance 4s → NO expiry copy (this is the F1 regression test; it FAILS against current code); discard sibling silent; re-arm audibility.
- [ ] RED → implement → GREEN → commit `fix(admin): staged-card Apply disarms the ignore confirm; announce arm expiry`.

### Task 5: ArchiveShowButton morph — new region (arm + expiry), row-branch negative

**Files:** Modify components/admin/ArchiveShowButton.tsx; test tests/components/admin/ArchiveShowButton.test.tsx.

New persistent sr-only region rendered on the NON-row variants only (`asRow` returns its own tree): `{armed ? "Tap again to confirm." : expired ? ARM_EXPIRED_ANNOUNCEMENT : ""}`. Timer callback (`setArmed(prev => ...)` guarded form) also sets `setExpired(true)`; `onArmClick` clears it; confirm click clears it.

- [ ] Tests: morph arm announces "Tap again to confirm." (new — this surface was fully silent); expiry announces; confirm-tap silent; re-arm audibility; **row-branch negative** — `asRow` variant: arm → advance far past 4s → the expiry copy never appears anywhere (no timer exists; existing row tests already pin Cancel-dismiss).
- [ ] RED → implement → GREEN → commit `feat(admin): archive morph arm + expiry announcements (row branch exempt)`.

### Task 6: panel surfaces, new expiry-only regions — CrewRowActions, ResolveAlertButton, RotateShareTokenButton, RevokeRowButton

**Files:** Modify components/admin/wizard/CrewRowActions.tsx, components/admin/ResolveAlertButton.tsx, app/admin/show/[slug]/RotateShareTokenButton.tsx, app/admin/settings/admins/RevokeRowButton.tsx; tests: each surface's existing test file (spec §3.2 matrix column).

Pattern per surface: `const [expired, setExpired] = useState(false);` — arm handler (`enterConfirm` / `onResolveClick` / `onRotateClick` / `onRevokeClick`) sets false; timer callback sets true BESIDE the existing `closeFully(true)` / `closeConfirm()` call (never inside — Cancel shares it). Persistent region rendered on every branch (Rotate: inside the `banners` fragment, which both `ui` branches render; others: root wrapper):

```tsx
<span role="status" aria-live="polite" className="sr-only">
  {expired ? ARM_EXPIRED_ANNOUNCEMENT : ""}
</span>
```

- [ ] Tests per surface (extend existing fake-timer suites): expiry announces (literal string); Cancel then advance past 4s → silent (stale-timer proof); CrewRowActions additionally: Escape → silent, backdrop click on the ARMED confirm (`closeFully(false)` at the backdrop handler — spec §5.1 R2 F2; existing backdrop tests exercise menu mode only) → silent, parent-driven close → silent; confirm-tap then advance → silent; re-arm after expiry clears the region (content change on arm — assert region empty while confirm row is open).
- [ ] RED → implement → GREEN → commit `feat(admin): arm-expiry announcements on the four panel confirm surfaces`.

### Task 7: multiplex regions — PickerResetControl, ResetPickerEpochButton

**Files:** Modify app/admin/show/[slug]/PickerResetControl.tsx, app/admin/show/[slug]/ResetPickerEpochButton.tsx; tests tests/admin/pickerResetControl.test.tsx, tests/components/ResetPickerEpochButton.test.tsx.

Existing persistent regions multiplex the new state: `{expired ? ARM_EXPIRED_ANNOUNCEMENT : (okMessage ?? "")}` (RPE) / `{expired ? ARM_EXPIRED_ANNOUNCEMENT : outcome?.kind === "ok" ? outcome.message : ""}` (PRC). `enterConfirm`/`onResetClick` clear `expired` (they already clear outcome/result — same spot); timer callback sets it beside `closeConfirm()`.

- [ ] Tests: expiry announces; Cancel + advance → silent; confirm + advance → silent and success copy intact (expiry never overwrites an outcome: expire-state cannot coexist with okMessage because arm cleared both — assert success path renders ONLY the ok copy); re-arm clears expiry text.
- [ ] RED → implement → GREEN → commit `feat(admin): arm-expiry announcements on picker-reset surfaces`.

### Task 8: T4 lexical co-presence guard

**Files:** Modify tests/styles/_metaDestructiveConfirm.test.ts.

- [ ] Add T4: reuse the T1 walk (`components`, `app`, `lib`) + `stripCommentsForFile`; collect files referencing `ARM_REVERT_MS` (word-boundary regex on stripped lines); each must also reference `ARM_EXPIRED_ANNOUNCEMENT` or hold an exemption row (`{ file, reason }`, reason ≥ 20 chars). Ship with an EMPTY exemption list. Self-checks: bare-import fixture fails; comment-only reference fails; wired fixture passes.
- [ ] Run full file: all green (11 surfaces wired by Tasks 2–7). Red-proof: predicate self-check fixtures (the closure set per the mutation-family table above; do NOT add semantic timer scanning — spec §1.1).
- [ ] Commit `test(admin): T4 expiry-wiring co-presence guard`.

### Task 9: ShareTokenContext `remoteTokenChanges`

**Files:** Modify app/admin/show/[slug]/ShareTokenContext.tsx; test tests/components/admin/showpage/shareHubFlashState.test.tsx (context cases live beside the harness that already drives both paths).

In the render-phase seed-gate block (BEFORE the `setState` call, using this render's `state`):

```ts
const [remoteTokenChanges, setRemoteTokenChanges] = useState(0);
// inside: if (seed.token !== initialToken || seed.epoch !== initialEpoch) { ...
if (
  initialEpoch >= state.epoch &&
  state.token !== null &&
  initialToken !== null &&
  initialToken !== state.token
) {
  setRemoteTokenChanges((n) => n + 1);
}
```

Ctx type + value memo gain the field: `{ token, applyRotated, remoteTokenChanges }`, deps `[state.token, applyRotated, remoteTokenChanges]`. (Consumers re-render on a bump — that IS the delivery mechanism; StatusStrip/AttentionModalSwitcher/_showReviewModal read only `token` and are unaffected.)

- [ ] Tests (probe component renders the counter): remote accepted change bumps once; `applyRotated` (+ equal-token follow-up seed) never bumps; stale lower-epoch seed no bump; same-token higher-epoch seed (reset_picker_epoch_atomic shape) no bump; token→null and null→token no bump.
- [ ] RED → implement → GREEN → commit `feat(admin): remote token-change counter in ShareTokenContext`.

### Task 10: ShareHub remote-rotation live region

**Files:** Modify components/admin/showpage/ShareHub.tsx; test tests/components/admin/showpage/shareHubFlashState.test.tsx.

Render-phase watcher AFTER `linkActive`/flash block (same pattern, spec §4.2):

```tsx
const [prevRemote, setPrevRemote] = useState(remoteTokenChanges);
const [remoteAnnounce, setRemoteAnnounce] = useState(false);
if (prevRemote !== remoteTokenChanges) {
  setPrevRemote(remoteTokenChanges);
  if (open && linkActive) setRemoteAnnounce(true);
}
if ((!open || !linkActive) && remoteAnnounce) setRemoteAnnounce(false);
```

Persistent sr-only region at the popover root (mounted whenever the popover renders):

```tsx
<span role="status" aria-live="polite" className="sr-only" data-testid="share-hub-remote-rotate-announce">
  {remoteAnnounce ? "Crew link changed. The earlier link no longer works." : ""}
</span>
```

- [ ] Tests (spec §5.3 list, all nine cases — remote+open+active announces literal string; closed → empty + no retroactive on reopen; open&&!linkActive bump → silent + no retroactive when active later; linkActive false while open clears (busy-held unpublish path); local silent; stale silent; same-token-higher-epoch silent; null transitions silent; close clears).
- [ ] RED → implement → GREEN → commit `feat(admin): ShareHub announces remote crew-link rotation`.

### Task 11: docs + ledger

**Files:** Modify DESIGN.md (§15), BACKLOG.md, BACKLOG-archive.md.

- [ ] DESIGN.md §15: add the announcement contract paragraph (arm-writes-region rule, expiry copy constant, ShareHub region); correct the false "the rotate row has always dismissed via Cancel, not a timeout" aside (spec §3.2 correction — decision untouched, factual claim fixed, cite RotateShareTokenButton's live timer).
- [ ] Graduate `BL-DESTRUCT-ARM-STATE-ANNOUNCEMENTS` + `BL-SHAREHUB-REMOTE-ROTATE-ANNOUNCE` to BACKLOG-archive.md with provenance (branch, spec path); update the BACKLOG.md reconciliation header. Run `pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts`.
- [ ] Commit `docs(plan): DESIGN §15 announcement contract + ledger graduation`.

### Task 12: gates

- [ ] Full-suite `pnpm vitest run` in the worktree; fix any fallout.
- [ ] Impeccable dual-gate (`/impeccable critique` + `/impeccable audit`) on the diff (UI files touched); P0/P1 fixed or DEFERRED.md'd.
- [ ] Whole-diff Codex review (split briefs if needed), CI green, merge per pipeline.

## Self-review notes

- Type consistency: `expired`/`setExpired` per surface; `expiredCode` only on BulkIgnoreControls; `remoteTokenChanges` name identical in context, hub, tests.
- Every snippet uses only APIs verified against live code (state names, handler names, fragment placements — spec §3.2 matrix anchors).
- Failure modes stated per test (stale-timer advance, exclusivity, retroactive-announce, epoch-keyed-counter mutant).
