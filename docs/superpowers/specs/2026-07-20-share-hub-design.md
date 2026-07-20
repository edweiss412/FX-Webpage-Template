# Share Hub — status-band share popover for the published review modal

**Date:** 2026-07-20 · **Status:** Draft (autonomous-ship run, user design approval given in-session)
**Mock:** `docs/superpowers/specs/2026-07-20-share-hub-mock/ActionBarMenu-1d.dc.html` (verbatim snapshot of claude.ai/design project `85e61edb-1c9a-48b8-af2a-f868a2ea46d4`, user-approved)
**Surface:** admin published review modal (`/admin?show=<slug>`) status band + Overview section.

## 1. Summary

Move every share-link affordance — URL, Copy, Email-crew, Rotate, Reset-everyone — out of the Overview "Current share-link" card into a single popover ("share hub") anchored to the status band's right group. The band's right group becomes: primary trigger ("Share link" published / "Share link · paused" unpublished) + kebab trigger ("More share actions"); both toggle the same popover. The Overview share-access card and its inactive notice are retired. Archived shows render no right group at all (read-only story unchanged).

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Primary "Share link" button OPENS the hub (not direct copy) | User answer, this session ("Opens hub (mock behavior)") |
| No toast primitive; all feedback inline | User approved design revision after discovering `ShareLinkCopyButton` inline "Copied" (2s + sr-only, `app/admin/show/[slug]/ShareLinkCopyButton.tsx:44-62`) |
| Email row reuses shipped crew-recipient batched mailto (NOT bare mailto) | User approved; contract at `app/admin/show/[slug]/crewLinkMailto.ts:12-17` (flow5 spec `2026-07-07-flow5-rotate-disclosure-mailto.md`) |
| Mobile = clamped popover, no bottom sheet | User answer, this session |
| Reuse existing confirm state machines (two-tap idle→confirm→resolving, C3/C5 focus, auto-revert) instead of rebuilding mock's simplified confirm cards | Shipped destructive-confirm pass F4; `RotateShareTokenButton.tsx:32,73-107`, `PickerResetControl.tsx:30,47-113` |
| Rotate/reset stay available while UNPUBLISHED (mock paused note: "you can still rotate or reset below") | Mock; flow5 `isCrewLinkActive=false` arm at `RotateShareTokenButton.tsx:41-54,151` |
| Reset RPC affordances are NOT serialized for ARCHIVED shows | Serialization gate comment `app/admin/_showReviewModal.tsx:395-403` (BL-RPC-RESET-SELECTION-LIFECYCLE-GUARD) — gate widens from `published && !archived` to `!archived`, it does not disappear |
| `#share-access` anchor id string is unchanged; only its DOM host moves | `lib/adminAlerts/alertActions.ts:51` builds the href; changing the id would fan into the alert catalog |
| No new §12.4 codes; outcome copy stays admin-authored inline | `CrewRowActions.tsx:189-192` `not-subject:M5-D8` precedent; PickerResetControl.tsx:161-166 |
| No DB / migration / advisory-lock changes; zero new mutation surfaces | `rotateShareToken` + `resetPickerEpoch` already in `tests/log/_auditableMutations.ts:265-271` |
| Impeccable hook findings on the committed mock snapshot are N/A | Mock fidelity fixture, commit e821a6a01 |

## 2. Current state (citations)

- `StatusStrip` (`components/admin/showpage/StatusStrip.tsx:95-`) renders: archived badge OR publish toggle → control divider → live badge → sync age → edited clause → Re-sync → **copy-link** (gate `copyUrl = published && !archived && token != null ? … : null` at `StatusStrip.tsx:131-133`; render `<div data-testid="strip-copy-link" className="ml-auto shrink-0">` wrapping `ShareLinkCopyButton variant="outline"` at `StatusStrip.tsx:287-290`). Transitions pin: 7 conditionals, all instant (`tests/components/admin/showpage/pageTransitions.test.tsx:135`).
- `OverviewSection` (`components/admin/showpage/OverviewSection.tsx:79-121`) hosts `<div id="share-access">` wrapping `shareSlot` (active) OR the `admin-share-link-inactive` notice. Pin: 4 conditionals (`pageTransitions.test.tsx:136`).
- `shareSlot` built in `app/admin/_showReviewModal.tsx:403-412`: `CurrentShareLinkPanel` (server shell, `app/admin/show/[slug]/CurrentShareLinkPanel.tsx:17`) → `ShareLinkBody` (`app/admin/show/[slug]/ShareLinkBody.tsx:23-`) → URL `<code data-testid="admin-current-share-link-url">` + `ShareLinkCopyButton` + batched mailto anchors (`admin-current-share-link-email-button`) + `RotateShareTokenButton` (compact row) + `resetSlot` = `PickerResetControl`.
- Token context: `ShareTokenProvider` seeds token+epoch (`_showReviewModal.tsx:415-419`); `useShareToken()` gives `{ token, applyRotated }` (`ShareLinkBody.tsx:39`).
- Popover idioms (#499): backdrop close (`CrewRowActions.tsx:17-19,227-231` — fixed inset-0 z-20, click closes, no focus restore on backdrop), Escape `preventDefault+stopPropagation` then close-with-trigger-focus (`CrewRowActions.tsx:115-121,158-163`), resolving = inert close paths (`CrewRowActions.tsx:148-157`).
- Shell Escape contract (verified live, `components/admin/review/ReviewModalShell.tsx:238-245`): the shell subscribes a **document-level** `keydown` listener that calls `preventDefault()` + `requestClose()` on ANY Escape — it does NOT inspect `defaultPrevented`. Therefore a nested popover MUST call `stopPropagation()` on the React synthetic event (which stops the native event before it reaches `document`); `preventDefault()` alone would not stop the modal from closing.
- Alert deep link: `lib/adminAlerts/alertActions.ts:51` → `/admin?show=<slug>#share-access`; anchor existence pinned by `tests/messages/_metaAlertActionsContract.test.ts:151-155` (asserts the id lives in `OverviewSection.tsx` — will move); scroll behavior `components/admin/review/ShowReviewSurface.tsx:561`, `tests/components/admin/review/showReviewSurfaceSyncHash.test.tsx:45`, e2e `tests/e2e/published-review-modal.deeplink.spec.ts:199-247`.

## 3. New component & placement

`components/admin/showpage/ShareHub.tsx` (client). Rendered by `StatusStrip` as the band's right group (`ml-auto`), REPLACING the current copy-link button. Not rendered when `archived` (right group absent, mock parity).

Props (all serialized by `_showReviewModal`, threaded through `PublishedReviewModal` → `StatusStrip`):

```
type ShareHubProps = {
  slug: string;
  showId: string;
  published: boolean;        // paused vs active presentation
  crewEmails: readonly string[];
  showTitle: string;
  pickerCrew: PickerResetCrewRow[]; // existing type, for PickerResetControl
};
```

Guard conditions: `crewEmails=[]` → email rows absent (existing `buildCrewLinkMailtos` returns `[]`); `showTitle=""` → mailto subject falls back per `crewLinkMailto.ts`; `token == null` (context) → published arm shows the existing unavailable notice copy (`ShareLinkBody.tsx:84-93` sentence, re-hosted); `pickerCrew=[]` → PickerResetControl renders its existing empty-roster behavior (unchanged component).

Trigger group (container carries `id="share-access"`, §7):
- Primary: `published` → accent button "Share link" (link icon); `!published` → outline button "Share link · paused". Both `aria-expanded`, `aria-controls=<popoverId>`, toggle popover.
- Kebab: icon button `aria-label="More share actions"`, same toggle + aria wiring, pressed-state background while open (mock).

## 4. Mode boundaries

| Element | published | unpublished | archived |
| --- | --- | --- | --- |
| Right group (ShareHub) | ✓ | ✓ | ✗ (absent) |
| Primary label | "Share link" (accent) | "Share link · paused" (outline) | — |
| Popover "Crew link" section | URL code + Copy + email rows (or unavailable notice if token null) | paused info note (mock copy), NO url/copy/email | — |
| Popover "Careful" section | Rotate row + Reset row | Rotate row + Reset row | — |
| Overview share-access div | removed | removed | removed |
| Strip copy-link button | removed (superseded by hub) | — | — |

Publish toggling while the popover is open: popover CLOSES on lifecycle change commit (matches mock `setLc`/`togglePublish` closing the menu; avoids mid-flight arm-state across a content swap) — **EXCEPT while a child control is `resolving`**, where the close is deferred until the action settles. Rationale (verified, `RotateShareTokenButton.tsx:139-153`): the rotate promise is not tied to mount, so unmounting mid-flight still completes the rotation server-side and still fires `onRotated`, but `setResult` lands on an unmounted component and the success banner is LOST — the operator would silently rotate a share link and see no confirmation that the old link is dead. Deferring the close is the only treatment that keeps the destructive action's outcome observable; the same rule already covers Escape and backdrop (§6). `finalizeOwned` does not gate the hub (parity with current shareSlot, which never gated on it).

## 5. Popover content — reuse map

Single popover panel, one instance in the DOM, `absolute top-full right-0 mt-1.5 w-[308px]`, positioned against **the trigger group's own `relative` wrapper** (see §10 — NOT the band and NOT the strip row), clamped on narrow viewports so it stays inside the modal.

- Header label "Crew link" (uppercase micro-label).
- Published arm: `<code>` URL from `useShareToken()` + `resolveOrigin()` (same derivation as `ShareLinkBody.tsx:40`) + `ShareLinkCopyButton url variant="accent"`; mailto anchors via `buildCrewLinkMailtos` incl. multi-batch note (`ShareLinkBody.tsx:56-82` behavior preserved).
- Unpublished arm: info note, copy verbatim from mock: "The crew link is paused while this show is unpublished. Publish to share it — you can still rotate or reset below."
- Divider + "Careful" micro-label.
- `RotateShareTokenButton` (compact row mode, `rowLabel="Rotate share link"`, `rowDescription="Old link stops working immediately"`, `isCrewLinkActive=published`, `onRotated=applyRotated`).
- `PickerResetControl` (`showId`, `crew=pickerCrew`) — everyone-only reset (#499 contract).

The existing confirm/resolving/banner UI of both controls is kept functionally; visual restyle to the popover's width happens under the impeccable gate, not by forking the state machines. `CurrentShareLinkPanel` and `ShareLinkBody` are deleted once the hub is the only consumer (`ShareLinkBody`'s pieces — copy button, mailto builder, unavailable sentence — survive as direct imports/copy).

## 6. Interaction & a11y contracts

- Open/close: click either trigger toggles. Backdrop (`fixed inset-0 z-20`, UserMenu idiom per `CrewRowActions.tsx:17-19`) closes without focus restore. Escape inside popover: `preventDefault` + **`stopPropagation`** (required — §2 shell contract), close, focus the last-used trigger.
- **Dismissal is inert while `busy > 0` — ALL FOUR paths, no exceptions:** primary trigger, kebab trigger, Escape, backdrop. The triggers are included explicitly because a "toggle" that ignores busy would unmount a child mid-flight: the mutation still completes, but its outcome banner is lost and the child's focus-restoration contract is skipped — for rotate, that means invalidating the crew's link with no confirmation it happened. Escape while busy still calls `stopPropagation` (otherwise it closes the whole review modal instead, which is strictly worse).
- NOT a `role="menu"` (mixed content: code block, note, composite rows). Popover is a labelled region (`role="dialog"` non-modal, `aria-label="Share crew link"`); no focus trap; Tab follows document order. Child controls keep their own focus contracts (C3 open-focus on Cancel, C5 restore — unchanged components).
- **Prerequisite — rotate's missing thrown-action guard (pre-existing bug, must be fixed here).** `RotateShareTokenButton.onConfirmClick` awaits `rotateShareToken` with NO try/catch (`RotateShareTokenButton.tsx:140-155`; the file contains zero `catch` blocks). A thrown action leaves `result` null, so the `ui === "resolving"` exit effect never fires and the control is stranded in `resolving` forever. `PickerResetControl.tsx:139-145` and `CrewRowActions.tsx:203-206` both carry this guard — the documented "R2 class-sweep of the CrewRowActions thrown-action fix" simply missed rotate. Today the damage is bounded (a stuck row; the modal still closes). Under the busy contract below it becomes a WEDGE: `busy` never clears, so all four dismissal paths stay inert and the operator cannot close the popover at all. Rotate therefore gains the same try/catch settling to its existing refused banner, in the same commit as the busy contract — this is a prerequisite, not an optional cleanup.
- **Busy contract (the child-component change).** Both `RotateShareTokenButton` and `PickerResetControl` gain ONE additive optional prop, `onBusyChange?: (busy: boolean) => void`, invoked when the control enters and leaves `resolving` — including the success, returned-error, AND thrown-action exits (the guard above is what makes the thrown exit reachable). Default-undefined, so every existing consumer is unaffected (`RotateShareTokenButton`'s only consumer is the deleted `ShareLinkBody`; `PickerResetControl` is also used by `components/admin/wizard/step3ReviewSections.tsx`, which passes nothing and behaves exactly as today). ShareHub keeps a busy count; `busy > 0` makes EVERY dismissal path inert — both triggers, Escape, and backdrop — and defers the lifecycle-driven close (§4). This is required, not optional: without it the hub cannot know a child is mid-flight, and §4/§6's guarantees would be unimplementable while claiming the children are untouched.
- **Two confirms may be armed simultaneously — deliberate.** The mock's single-slot `confirming` state is NOT adopted: enforcing it needs an imperative cancel API on both children (state and cancel paths are private today), which is a far larger change than the risk warrants. Both-armed is safe: each confirm requires its own explicit Confirm click, each auto-reverts on its own timer, and each opens with focus on its own Cancel. Explicit divergence from the mock; do not "fix" it by reaching into child internals.
- Token secrecy: URL only ever in props/clipboard/mailto href (existing watchpoints, `ShareLinkCopyButton.tsx:10-14`); telemetry stays `epoch_<n>` (invariant 10, unchanged actions).

## 7. `#share-access` anchor relocation

The id moves from OverviewSection's wrapper to **the StatusStrip root element** (`data-testid="show-status-strip"`, `StatusStrip.tsx:150-169`) — one unconditional host that exists in all three lifecycles, including archived (where the hub itself is absent). It is NOT placed on the trigger group: that group is conditional, and a disappearing anchor would silently dead-link the alert action. Deep link scrolls the band into view (it sits at the modal top; `ShowReviewSurface.tsx:561` scroll path unchanged). The popover does NOT auto-open on deep link (auto-open guards were a #500-class bug source; descoped explicitly).

Fan-out: `_metaAlertActionsContract.test.ts:151-155` re-points its source assertion to `components/admin/showpage/StatusStrip.tsx`; `showReviewSurfaceSyncHash.test.tsx:45` unchanged (id string same); e2e `published-review-modal.deeplink.spec.ts:199-247` re-targets the strip block (and its "block TALLER than the pane" note at :129 no longer applies to a short band — the assertion becomes plain in-viewport).

## 8. Removal & test migration

Removed: `CurrentShareLinkPanel.tsx`, `ShareLinkBody.tsx`, OverviewSection `shareSlot` prop + `#share-access` div + `admin-share-link-inactive` notice, `_showReviewModal` shareSlot build, StatusStrip copy-link render + its `copyUrl` derivation, `PublishedReviewModal` shareSlot threading. `ShareChip`/preview surfaces untouched (separate consumers of `ShareLinkCopyButton`).

Test fan-out (page-rebuild registry sweep applies):
- `tests/components/CurrentShareLinkPanel.test.tsx` → replaced by `tests/components/admin/showpage/shareHub.test.tsx` (all behavioral assertions migrate: url/copy/email/unavailable/rotate/reset wiring, paused arm, archived absence).
- `pageTransitions.test.tsx` pins for StatusStrip / OverviewSection / ShareHub recomputed by RUNNING the scanner (not by reasoning) — plan task.
- `statusStrip.test.tsx`, `publishedReviewModal.test.tsx`, layout spec T-COPY-FLUSH (right-flush assertion re-targets hub trigger group), `admin-lifecycle-transitions.spec.ts:271` paused-copy reference, deeplink e2e (§7), `_metaAlertActionsContract`.
- Meta-test inventory: EXTENDS `_metaAlertActionsContract` (anchor host), pageTransitions registry. No new registries; mutation-surface observability unaffected (no new/changed actions). Sentinel-hiding meta-test: N/A (no optional-text sentinels added).

## 9. Transition inventory

The hub's visual state is NOT a single enum — it is a **vector**, because the two child controls run independent machines and a banner can persist while the sibling is confirming or resolving. Modeling it as six exclusive states (an earlier draft) hid exactly the compounds that matter.

**State vector:** `hub ∈ {closed, open}` × `rotate ∈ {idle, confirm, resolving, banner}` × `reset ∈ {idle, confirm, resolving, banner}`. Derived: `busy = (rotate=resolving) ∨ (reset=resolving)`.

All transitions are INSTANT (project norm: pageTransitions §9); timers are the only scheduled changes. Per-axis inventory:

| Axis / pair | Treatment |
| --- | --- |
| hub closed↔open (either trigger) | instant mount/unmount; **inert while `busy`** (§6) |
| rotate idle↔confirm, reset idle↔confirm | instant (existing two-tap machines, own auto-revert timers) |
| confirm→resolving (either) | instant; sets `busy`, freezing all four dismissal paths |
| resolving→banner (either) | instant. SUCCESS: rotate's persists in place (`role="status"`), reset's auto-dismisses at `SUCCESS_DISMISS_MS`. ERROR: both persist indefinitely and are `role="alert"` — see the compound table for the full rule |
| banner→idle (either) | instant. TWO independent clear paths per control: (a) RE-ARM clears unconditionally, success or error — `setResult(null)` (`RotateShareTokenButton.tsx:125-128`) and `enterConfirm`'s `setOutcome(null)` (`PickerResetControl.tsx:110-112`); (b) TIMER clears reset's SUCCESS banner only (`PickerResetControl.tsx:102-106`). Rotate has no timer path at all — re-arm is its only clear. Whichever fires first wins |
| hub open→closed via publish toggle / archived swap, `busy = false` | instant unmount |
| hub open→closed via publish toggle / archived swap, `busy = true` | DEFERRED until settle (§4); never an unmount mid-flight |
| Copied label | existing 2s reset inside `ShareLinkCopyButton` |

**Compound states — each is reachable and each is specified:**

| Compound | Behavior |
| --- | --- |
| rotate=banner ∧ reset=confirm (B+OS) | both render; independent. Reset's confirm does not clear rotate's banner |
| rotate=banner ∧ reset=resolving (B+V) | banner stays visible; `busy` freezes dismissal |
| reset=banner ∧ rotate=confirm/resolving | both render independently. A reset SUCCESS banner does NOT stay pinned for rotate's flight — its `SUCCESS_DISMISS_MS` timer runs regardless of `busy` and clears it via `setOutcome(null)` (`PickerResetControl.tsx:102-106`), so the operator may see the reset confirmation disappear mid-rotate. A reset ERROR banner persists. `busy` gates dismissal paths only; it pauses no timer |
| both=confirm | permitted (§6 — single-slot deliberately not adopted); two confirm rows stack in the popover, each with its own Cancel focused on open |
| both=resolving | permitted; `busy` stays ≥1 until BOTH settle |
| rotate=confirm ∧ reset=resolving | permitted. `busy` is already set, so dismissal is inert — but the rotate confirm row stays interactive: its Confirm and Cancel are NOT disabled by a sibling's flight, and its auto-revert timer keeps running and may collapse the row while the sibling resolves |
| rotate=resolving ∧ reset=confirm | mirrors the above, with one ASYMMETRY: `busy` does not pause any timer. A reset SUCCESS banner's `SUCCESS_DISMISS_MS` timer keeps running and may dismiss that banner while rotate is still confirming or resolving; a reset ERROR banner persists throughout. Timers are per-control and indifferent to the sibling's state |
| both=banner, both SUCCESS | permitted. Two banners stack, neither cross-clearing. Reset's success auto-dismisses at `SUCCESS_DISMISS_MS` (`PickerResetControl.tsx:102-106`); rotate's success persists until its confirm is re-armed (`setResult(null)`, `RotateShareTokenButton.tsx:125-128`). Absent any re-arm the pair therefore resolves to rotate-only; re-arming reset before its timer fires clears that banner immediately instead, and re-arming rotate clears rotate's — so "rotate-only" is the timer-wins outcome, not an invariant. Announcement: reset via its persistent sr-only `role="status"` region (`PickerResetControl.tsx:156`, the visible banner being `aria-hidden`); rotate via its visible `role="status"` (`:203`, `:217`) |
| both=banner, either or both ERROR | permitted, and errors behave DIFFERENTLY from successes: error banners are NEVER auto-dismissed — reset's auto-dismiss effect returns early unless `outcome.kind === "ok"` (`PickerResetControl.tsx:103`, comment: "Errors are NOT auto-dismissed — they must persist until the admin reads and acts on them"). Error banners are `role="alert"` (assertive), not `role="status"` — `PickerResetControl.tsx:178`, `RotateShareTokenButton.tsx:231`. Two simultaneous `role="alert"` nodes announce in DOM order and interrupt; this is accepted, not designed around |
| any trigger/Escape/backdrop press while `busy` | no-op; Escape still `stopPropagation`s |
| sibling armed while the other's auto-revert timer is pending | timers are per-component and independent; each fires against its own `closeConfirm`, whose functional `setUi` guard no-ops if that row is already gone (`RotateShareTokenButton.tsx:88-97`) |
| rotate success while a Copy 2s window is open | `onRotated` swaps the context token and the URL re-renders; the stale "Copied" label self-clears on its own timer. The clipboard still holds the OLD url — which is why rotate's success copy states the old link no longer works (`RotateShareTokenButton.tsx:205-210`) |
| hub unmounted by an ancestor (modal close) while `busy` | out of the hub's control; the mutation completes server-side either way, and the outcome banner is lost. Reconciliation differs by control: ROTATE calls `router.refresh()` on success (`RotateShareTokenButton.tsx:152`), so server-derived state re-reads. RESET does NOT — `PickerResetControl` imports no router and its action path (`:131-145`) ends after `setOutcome`, so a reset that lands during an ancestor unmount leaves the admin's view unreconciled until the next navigation or refresh. Neither is a defect the hub can close; recorded so it is not mistaken for one |

## 10. Dimensional invariants

- Popover: fixed `w-[308px]`. Its positioned ancestor is a NEW `relative` wrapper around the trigger group inside `ShareHub` — deliberately not the strip row (which must stay unpositioned: `StatusStrip.tsx:166-168` states the band owns the positioned ancestor, and adding `relative` to the row would re-anchor the Re-sync overlay and break its `inset-x-0` full-band width). Because the wrapper's right edge is the band's content-box right edge (via `ml-auto`), `right-0` on the popover aligns it to that same edge.
- Triggers: `min-h-tap-min` (project token) ≥ mock's 38px; kebab square (`w`=`min-h`).
- Right-flush: trigger group `ml-auto` inside the `w-full` strip row (`StatusStrip.tsx:151-168` guarantee unchanged) — real-browser assertion (plan layout task) that group right edge ≈ band content edge within 0.5px, and popover right edge aligns to the same edge.
- Clamp: popover `max-w` must keep it inside the modal on 390px viewport (real-browser assertion).

## 11. Out of scope

Bottom-sheet mobile variant; popover auto-open on deep link; toast primitive; any change to `rotateShareToken` / `resetPickerEpoch` / RPCs / telemetry; per-member reset (lives in crew rows, #499); `ShareChip` and preview surfaces; DESIGN.md token changes beyond what impeccable critique demands on the new component.

## Appendix A — mandated pass transcripts

Citation-grep pass (2026-07-20, worktree `feat/share-hub` @ 23ef21645): every `file:line` in §§1.1-10 read from live source this session via `sed`/`grep` (StatusStrip.tsx props+render 40-200; ShareLinkCopyButton.tsx 1-62; ShareLinkBody.tsx 20-110; CurrentShareLinkPanel.tsx 1-80; OverviewSection.tsx 60-150; _showReviewModal.tsx 340-440; CrewRowActions.tsx 100-215+17-19+227-231; RotateShareTokenButton.tsx grep head; PickerResetControl.tsx grep head; crewLinkMailto.ts 1-50; alertActions grep repo-wide; _auditableMutations.ts 265-271; pageTransitions.test.tsx 120-140).

Numeric sweep: 308 (popover width — mock, §5/§10 consistent); 7/4 (current pins §2/§8, recompute-by-scanner at plan time — no hardcoded post-change count stated anywhere); 38 (mock trigger height, superseded by `min-h-tap-min` §10); 2s copied reset (§1.1/§9, source 2_000ms); `SUCCESS_DISMISS_MS` reset banner (§9, PCR-1 — named, not restated as a literal, and it governs SUCCESS only; errors never auto-dismiss); 1900/500 (mailto href cap / roster cap — contract cited §1.1, values owned by `crewLinkMailto.ts:12-17`, not restated as requirements); 0.5px layout tolerance (§10, project standard). No count is stated twice with different values.
