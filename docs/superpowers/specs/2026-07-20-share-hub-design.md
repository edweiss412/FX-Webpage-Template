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

- `StatusStrip` (`components/admin/showpage/StatusStrip.tsx:95-`) renders: archived badge OR publish toggle → control divider → live badge → sync age → edited clause → Re-sync → **copy-link** (`ShareLinkCopyButton` variant `"outline"`, gated `published && !archived && token != null`, `StatusStrip.tsx:113-115`). Transitions pin: 7 conditionals, all instant (`tests/components/admin/showpage/pageTransitions.test.tsx:135`).
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

- Open/close: click either trigger toggles. Backdrop (`fixed inset-0 z-20`, UserMenu idiom per `CrewRowActions.tsx:17-19`) closes without focus restore. Escape inside popover: `preventDefault` + **`stopPropagation`** (required — §2 shell contract), close, focus the last-used trigger. While either child control is `resolving`: Escape/backdrop close is inert (mirror `CrewRowActions.tsx:148-157`).
- NOT a `role="menu"` (mixed content: code block, note, composite rows). Popover is a labelled region (`role="dialog"` non-modal, `aria-label="Share crew link"`); no focus trap; Tab follows document order. Child controls keep their own focus contracts (C3 open-focus on Cancel, C5 restore — unchanged components).
- Only one confirm armed at a time: arming rotate cancels an armed reset and vice versa (both components already auto-revert; ShareHub additionally closes the other's confirm via their existing cancel paths — mock `confirming` single-slot parity).
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

ShareHub states: closed (C), open-idle (O), open-rotate-confirm (OR), open-reset-confirm (OS), open-resolving (V), open-banner (B). All transitions INSTANT (project norm: pageTransitions §9 "every conditional instant"); timers are the only scheduled changes.

| Pair | Treatment |
| --- | --- |
| C↔O | instant mount/unmount |
| O↔OR, O↔OS | instant swap (existing two-tap machines) |
| OR↔OS | instant — arming one cancels the other (single confirm slot) |
| OR/OS→V | instant; close paths inert during V |
| V→B | instant; banner `role="status"`; PickerResetControl banner auto-dismisses (existing PCR-1 5s) |
| B→O / B→C | instant; existing components' settle paths (rotate settles in place; reset closes per its shipped behavior — components unchanged) |
| any open NON-resolving state → C via publish toggle / archived swap | instant unmount (popover closes on lifecycle change) |
| V → C via publish toggle / archived swap | DEFERRED — the close waits for the action to settle, then applies (§4); never an unmount mid-flight |
| Copied feedback | existing 2s reset inside ShareLinkCopyButton |

Compound: publish toggle while V — close is DEFERRED (§4), because unmount-during-resolve loses the outcome banner even though the timers are cleanup-guarded (`RotateShareTokenButton.tsx:85-96`). Confirm armed while auto-revert timer pending + backdrop click — timers cleared on close (existing `clearAutoRevert` idiom, and `closeConfirm`'s functional `setUi` guard no-ops for a timer that fires after the row is gone, `RotateShareTokenButton.tsx:88-97`). Rotate success while a Copy 2s window is open — `onRotated` swaps the context token, the URL re-renders, and the stale "Copied" label self-clears on its own timer; the clipboard holds the OLD url, which is why the rotate success copy explicitly says the old link no longer works (`RotateShareTokenButton.tsx:205-210`).

## 10. Dimensional invariants

- Popover: fixed `w-[308px]`. Its positioned ancestor is a NEW `relative` wrapper around the trigger group inside `ShareHub` — deliberately not the strip row (which must stay unpositioned: `StatusStrip.tsx:166-168` states the band owns the positioned ancestor, and adding `relative` to the row would re-anchor the Re-sync overlay and break its `inset-x-0` full-band width). Because the wrapper's right edge is the band's content-box right edge (via `ml-auto`), `right-0` on the popover aligns it to that same edge.
- Triggers: `min-h-tap-min` (project token) ≥ mock's 38px; kebab square (`w`=`min-h`).
- Right-flush: trigger group `ml-auto` inside the `w-full` strip row (`StatusStrip.tsx:151-168` guarantee unchanged) — real-browser assertion (plan layout task) that group right edge ≈ band content edge within 0.5px, and popover right edge aligns to the same edge.
- Clamp: popover `max-w` must keep it inside the modal on 390px viewport (real-browser assertion).

## 11. Out of scope

Bottom-sheet mobile variant; popover auto-open on deep link; toast primitive; any change to `rotateShareToken` / `resetPickerEpoch` / RPCs / telemetry; per-member reset (lives in crew rows, #499); `ShareChip` and preview surfaces; DESIGN.md token changes beyond what impeccable critique demands on the new component.

## Appendix A — mandated pass transcripts

Citation-grep pass (2026-07-20, worktree `feat/share-hub` @ 23ef21645): every `file:line` in §§1.1-10 read from live source this session via `sed`/`grep` (StatusStrip.tsx props+render 40-200; ShareLinkCopyButton.tsx 1-62; ShareLinkBody.tsx 20-110; CurrentShareLinkPanel.tsx 1-80; OverviewSection.tsx 60-150; _showReviewModal.tsx 340-440; CrewRowActions.tsx 100-215+17-19+227-231; RotateShareTokenButton.tsx grep head; PickerResetControl.tsx grep head; crewLinkMailto.ts 1-50; alertActions grep repo-wide; _auditableMutations.ts 265-271; pageTransitions.test.tsx 120-140).

Numeric sweep: 308 (popover width — mock, §5/§10 consistent); 7/4 (current pins §2/§8, recompute-by-scanner at plan time — no hardcoded post-change count stated anywhere); 38 (mock trigger height, superseded by `min-h-tap-min` §10); 2s copied reset (§1.1/§9, source 2_000ms); 5s reset banner (§9, PCR-1); 1900/500 (mailto href cap / roster cap — contract cited §1.1, values owned by `crewLinkMailto.ts:12-17`, not restated as requirements); 0.5px layout tolerance (§10, project standard). No count is stated twice with different values.
