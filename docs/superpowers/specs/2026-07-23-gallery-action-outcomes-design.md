# Gallery Action Outcomes (modal-state-coverage class 6) — Design Spec

Date: 2026-07-23
Status: DRAFT (pre adversarial review)
Predecessor: `docs/superpowers/specs/2026-07-22-modal-state-coverage-design.md` (classes 1–5, PR #557). This spec un-defers the class-6 entry in `DEFERRED.md` (the modal-state-coverage 2026-07-22 class-6 deferral section).

## 1. Goal

Make every action-outcome state (pending / error / refusal / partial / success UI mounted by a modal control after its action resolves) demonstrable in the dev attention-gallery (`/admin/dev/attention-gallery`), click-driven: the viewer clicks the real production control and the scripted outcome renders through the control's real state machine and parse branches.

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| Scope = DEFERRED class-6 list (re-sync overlays, publish-toggle refusal, Mi11 gate errors, accept/undo errors, resolve-button errors, bulk-ignore partial/fail, crew-row reset banners) PLUS share-token rotate banners, everyone-reset (picker-epoch) banners, archive-button outcomes | User AskUserQuestion 2026-07-23: "All action outcomes" |
| Click-driven only. No auto-fire mode, no synthetic mount path. States not reachable without a click is accepted | User AskUserQuestion 2026-07-23: "Click-driven" |
| Approach A: three-channel scripted layer (scripted prop closures; scripted fetch responses inside `GalleryWriteGuard`; null-default dev override context read by the 3 lib-import controls) | User AskUserQuestion 2026-07-23: "Approach A" |
| Ship autonomously through merged PR; spec/plan user gates waived | Same exchange: "Yes, ship autonomously" |
| `pending` outcome = never-resolving promise (or never-resolving scripted fetch). No timers, no delayed-resolve mode | Ratified with Approach A (brainstorm summary) |
| New scenario fields are tier-2-only, gallery-render-only, following the `degraded`/`fixture` precedent (`lib/dev/attentionScenarios/types.ts:161-181`) | Class-1–5 spec §1.1, same class extended |
| Faking Next server-action RSC flight payloads at the fetch layer (Approach B) and gallery-fork components (Approach C) are rejected | Brainstorm 2026-07-23; Approach A ratified over both |
| On merge, the class-6 entry in `DEFERRED.md` is updated: the 6 listed surfaces are un-deferred by this feature (entry moved to a resolved note) | Feature request text |
| Copy-link (`ShareLinkCopyButton`) is OUT of scope: pure client `navigator.clipboard.writeText` (`app/admin/show/[slug]/ShareLinkCopyButton.tsx:55`), success path already works in the gallery, error arm requires a blocked clipboard — not a server-action outcome | This spec (channel inventory §2); same fidelity rationale as the class-9 exclusions |
| Unarchive is NOT scriptable. `unarchiveAction` is typed `(showId) => Promise<void>` (`components/admin/dev/AttentionModalSwitcher.tsx:58-66` NOOP comment) — no result union, so no error/refusal UI exists; its only scriptable state would be `pending`, and it mounts only on archived fixtures where no roster scenario scripts pending. Excluded (YAGNI); it keeps its NOOP default | This spec §3.0 |

## 2. Surface inventory (verified 2026-07-23 against `origin/main` @ 9a489efe0)

Three delivery channels. Every claim cited.

### Channel 1 — the 8 prop closures

`ActionKeys` (`lib/dev/galleryModalTypes.ts:19-27`): `setPublished, archiveAction, unarchiveAction, undoAction, acceptAction, acceptAllAction, approveAction, rejectAction`. The gallery currently passes `NOOP_ACTIONS` — all instant success (`components/admin/dev/AttentionModalSwitcher.tsx:66-75`), mounted `<PublishedReviewModal {...current.data} {...NOOP_ACTIONS} />`.

| Surface | Outcome UI | Result contract |
| --- | --- | --- |
| Publish-toggle refusal popover / generic error | `PublishedToggle.tsx:94-95` (`errorCode`/`genericError`), popover render arms 141-149 and 176-183; refusals gated by `KNOWN_REFUSAL_CODES` = `PUBLISH_BLOCKED_PENDING_REVIEW`, `SHOW_ARCHIVED_IMMUTABLE`, `FINALIZE_OWNED_SHOW` (34-38); non-member code → generic (116) | `LifecycleResult = { ok: true } \| { ok: false; code: string }` (32) |
| Archive outcomes | `ArchiveShowButton.tsx:143-160` `onResult`: `show_not_found` → `notFound`, `KNOWN_REFUSAL_CODES` = `FINALIZE_OWNED_SHOW`, `SHOW_ARCHIVED_IMMUTABLE` (50) → `errorCode`, else `genericError` | same `LifecycleResult` (41) |
| Mi11 gate errors | `Mi11GateActions.tsx:98-99` twin `useActionState`; error rendered via `mi11-gate-result` block | `Mi11GateActionResult = { ok: true } \| { ok: false; code: string }` (31) |
| Accept / Accept-all errors | `AcceptChangeButton.tsx:73` `useActionState`; error at 86 | `AcceptButtonResult = { ok: true; count: number } \| { ok: false; code: string }` (26) |
| Undo error | `UndoChangeButton.tsx:79`; error at 88 | `UndoButtonResult = { ok: true } \| { ok: false; code: string }` (24) |

Pending drivers: `useFormStatus().pending` (PublishedToggle switch, `PublishedToggle.tsx:220`; ArchiveShowButton confirm, `ArchiveShowButton.tsx:374`), `useActionState` pending flag (Mi11 98-99, Accept 73, Undo 79) with busy labels ("Approving…", "Undoing…").

### Channel 2 — fetch-based controls

`GalleryWriteGuard` (`components/admin/dev/GalleryWriteGuard.tsx:53-80`) patches `window.fetch`: non-GET → 403 `{ ok: false, code: "GALLERY_DISPLAY_ONLY" }` + `data-gallery-blocked-write` attribute on `document.documentElement`.

| Surface | Outcome UI | Fetch + result contract |
| --- | --- | --- |
| Re-sync error / shrink-hold confirm / success | `ReSyncButton.tsx:199-206` (`pending`/`errorCode`/`successMessage`/`heldShrink`); panels at 321 (error), 355 (shrink confirm); success via `summarizeResult` (170-183: "Synced. Changes applied." etc.) | `POST /api/admin/sync/[slug]` (243); parse at 255-273: `{ ok, error?, result? }`; `result.outcome === "shrink_held"` with `detail` + `heldModifiedTime` → confirm; `ok:false` → `errorCode` (route emits `SYNC_INFRA_ERROR` 500, `PENDING_SYNC_NOT_FOUND` 404, `FINALIZE_OWNED_SHOW` 409, `SHOW_BUSY_RETRY` 409 — `app/api/admin/sync/[slug]/route.ts:76-106`) |
| Resolve-button error | `PerShowAlertResolveButton.tsx:41-44` `State` union (`running`/`error`) | `POST /api/admin/show/[slug]/alerts/[id]/resolve` (64); route returns `{ ok: false, code }` on error (`app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts:76-77`), `{ status: "resolved", ... }` on success (`app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts:137`) |
| Bulk-ignore partial / fail | `BulkIgnoreControls.tsx:27-30` `State`; partial copy `` `Ignored ${ok} of ${results.length}. Refresh to see the rest.` `` (123), total-fail `failCopy` | `Promise.all` of per-fingerprint `POST .../data-quality/ignore` (91); branches on per-response `r.ok`; route: `{ status: "ignored" }` / `{ ok: false, code }` (`app/api/admin/show/[slug]/data-quality/ignore/route.ts:53` and `app/api/admin/show/[slug]/data-quality/ignore/route.ts:143`) |

### Channel 3 — direct server-action imports (no prop, no fetch to script)

| Surface | Component (mount) | Action + result contract |
| --- | --- | --- |
| Crew-row reset banners | `CrewRowActions.tsx` (mounted by `step3ReviewSections.tsx:136` crew rows); outcome lifted via `onOutcome` (50); success/not-found/error copy at 194-207 | `resetCrewMemberSelection` (`lib/auth/picker/resetCrewMemberSelection.ts:52`) → `{ ok: true; reset_at } \| { ok: false; code: "PICKER_CREW_MEMBER_NOT_FOUND" \| "PICKER_INVALID_INPUT" \| "PICKER_RESOLVER_LOOKUP_FAILED" }` (42-48) |
| Share-token rotate banners | `RotateShareTokenButton.tsx:78-80` (`ui`/`result`/`useTransition`); mounted in ShareHub (`ShareHub.tsx:79`) | `rotateShareToken` (`lib/auth/picker/rotateShareToken.ts:26`) → `{ ok: true; new_share_token; new_epoch } \| { ok: false; code: "PICKER_RESOLVER_LOOKUP_FAILED" }` (11-13) |
| Everyone-reset banners | `PickerResetControl.tsx:55-57`; mounted in ShareHub (`ShareHub.tsx:77`) | `resetPickerEpoch` (`lib/auth/picker/resetPickerEpoch.ts:17`) → `{ ok: true; new_epoch } \| { ok: false; code: "PICKER_RESOLVER_LOOKUP_FAILED" }` (13-15) |

All three wrap the call in `useTransition` (`CrewRowActions.tsx:53`, `RotateShareTokenButton.tsx:80`, `PickerResetControl.tsx:57`).

Note: these are the ONLY three modal-tree controls calling server actions by direct import. The Next server-action POST a direct call dispatches carries an opaque RSC flight payload; `GalleryWriteGuard`'s 403 makes the call reject, which these components map to their generic-error arm — that path stays as the unscripted default.

## 3. Design

### 3.0 Schema — `actionOutcomes` (tier-2-only scenario field)

`AttentionScenario` gains one optional field following the `fixture` pattern (`lib/dev/attentionScenarios/types.ts:172-181`; tier-2-only enforcement mirrors `validate.ts:409-455`):

```ts
/** Tier 2 only - scripts the outcome each modal control's action resolves to.
 *  Click-driven: nothing fires on mount; the viewer clicks the real control.
 *  Absent control key = current default (channel 1: NOOP success; channels
 *  2-3: GalleryWriteGuard 403 -> the control's own generic-error arm). */
actionOutcomes?: ScenarioActionOutcomes;

export type PropActionOutcome =
  | { kind: "success" }
  | { kind: "error"; code: string } // component decides refusal vs generic per its own allowlist
  | { kind: "pending" };            // never-resolving promise

export type ScenarioActionOutcomes = {
  // Channel 1 (scripted closures)
  setPublished?: PropActionOutcome;
  archive?: PropActionOutcome | { kind: "not_found" }; // not_found -> { ok:false, code:"show_not_found" }
  // (no `unarchive` key - excluded per §1.1)
  undo?: PropActionOutcome;
  accept?: PropActionOutcome;       // success -> { ok:true, count: 1 }
  acceptAll?: PropActionOutcome;    // success -> { ok:true, count: <pending-row count> }
  approve?: PropActionOutcome;
  reject?: PropActionOutcome;
  // Channel 2 (scripted fetch responses)
  resync?:
    | { kind: "success"; outcome?: "applied" | "stage" | "skipped" | "asset_recovery" } // default "applied"
    | { kind: "shrink_held"; detail: string }
    | { kind: "error"; code: "SYNC_INFRA_ERROR" | "PENDING_SYNC_NOT_FOUND" | "FINALIZE_OWNED_SHOW" | "SHOW_BUSY_RETRY" }
    | { kind: "pending" };
  resolve?: { kind: "success" } | { kind: "error"; code: string } | { kind: "pending" };
  bulkIgnore?:
    | { kind: "partial"; okCount: number } // 0 < okCount < group size -> "Ignored X of N"
    | { kind: "fail" }                     // okCount 0 -> failCopy
    | { kind: "pending" };
  // Channel 3 (dev override context)
  crewReset?: { kind: "success" } | { kind: "not_found" } | { kind: "error" } | { kind: "pending" };
  rotate?: { kind: "success" } | { kind: "error" } | { kind: "pending" };
  everyoneReset?: { kind: "success" } | { kind: "error" } | { kind: "pending" };
};
```

Guard conditions: every sub-field optional; an empty `actionOutcomes` object is a validation error (no-op script, same rule class as the no-op `fixture` guard, `types.ts:41-44`). `bulkIgnore.okCount` outside `(0, groupSize)` is a validation error. `shrink_held.detail` must be non-blank. All error `code` strings must be non-blank; `resync.error.code` is the closed union above (the route's only emitted codes); `resolve.error.code` and channel-1 `error.code` are open strings (the components render unknown codes through their own generic arms — that branch is itself in scope).

### 3.1 Channel 1 — scripted closures

`AttentionModalSwitcher` builds the 8 closures per scenario: for each `ActionKey`, if the current scenario's `actionOutcomes` scripts it, the closure resolves to the scripted result (or never resolves for `pending`); otherwise the existing `NOOP_ACTIONS` member is used. Success shapes stay contract-exact (`satisfies Pick<PublishedReviewModalProps, ActionKeys>` is kept). `acceptAll` success `count` = the scenario's pending change-log row count (derived, not hardcoded — anti-tautology).

The modal remount key already used per scenario guarantees no cross-scenario state bleed (each scenario mounts fresh component state).

Data flow: `actionOutcomes` is plain serializable data, so `GallerySwitcherScenario` (`lib/dev/galleryModalTypes.ts:33`) gains a passthrough `actionOutcomes` field the server page forwards — the same pattern as the per-scenario `shareToken` field (`lib/dev/galleryModalTypes.ts:43`). All closures (channels 1 and 3) and fetch scripts (channel 2) are built client-side in the switcher from that field; no function crosses the RSC boundary.

### 3.2 Channel 2 — scripted fetch responses in `GalleryWriteGuard`

`GalleryWriteGuard` gains an optional `scripts` prop (default absent = today's behavior, byte-for-byte):

```ts
type FetchScript = {
  method: "POST";
  pathPattern: RegExp;        // e.g. /^\/api\/admin\/sync\//
  respond: (callIndex: number) =>
    | { status: number; body: unknown }
    | "hang";                 // pending: return a never-resolving Promise<Response>
};
```

Matching non-GET requests return the scripted JSON `Response` and set a `data-gallery-scripted-write` attribute (value `${method} ${path}`); non-matching non-GET keeps the 403 + `data-gallery-blocked-write` path unchanged. `callIndex` (per-mount counter keyed by script) implements `bulkIgnore.partial`: first `okCount` calls → `{ status: "ignored" }` 200, rest → `{ ok: false, code: "GALLERY_SCRIPTED_FAIL" }` 500 (route's error envelope shape, `app/api/admin/show/[slug]/data-quality/ignore/route.ts:53`; the code value is deliberately gallery-synthetic and never rendered — the client branches only on `r.ok`, `BulkIgnoreControls.tsx:100`). The switcher derives `scripts` from the current scenario's `actionOutcomes` (resync / resolve / bulkIgnore keys) and remounts the guard with the scenario key so counters reset.

Mount relocation: the guard currently mounts prop-less from the server page (`app/admin/dev/attention-gallery/page.tsx:51`). It moves into `AttentionModalSwitcher` (client), which always renders it — `scripts` absent for unscripted scenarios — keyed by scenario id. Exactly one guard instance exists at a time (single fetch patch; the page-level mount is removed in the same change), and with `scripts` absent its behavior is byte-identical to today's.

No real network write can result: scripted responses are synthesized client-side; unscripted writes still 403. The e2e containment sweep contract is updated to accept `data-gallery-scripted-write` as a first-class marker alongside `data-gallery-blocked-write` (§5).

### 3.3 Channel 3 — dev action override context

A new client module, `actionOverrideContext` (created by this feature under `components/admin/dev/`):

```ts
export type DevActionOverrides = {
  resetCrewMemberSelection?: typeof resetCrewMemberSelection; // type-level only (typeof import)
  rotateShareToken?: typeof rotateShareToken;
  resetPickerEpoch?: typeof resetPickerEpoch;
};
export const DevActionOverrideContext = createContext<DevActionOverrides | null>(null);
export function useDevActionOverride<K extends keyof DevActionOverrides>(key: K): DevActionOverrides[K] | undefined;
```

The three components change one call site each: `const override = useDevActionOverride("resetCrewMemberSelection"); const r = await (override ?? resetCrewMemberSelection)({...})` (same pattern for rotate at `RotateShareTokenButton.tsx:155` and epoch reset at `PickerResetControl.tsx:159`). Production never mounts the provider; context default `null` → `undefined` override → the real imported action, unchanged behavior and unchanged bundle semantics (the context module is tiny and dependency-free; the `typeof` imports are type-only). The gallery switcher mounts the provider with scripted implementations derived from `actionOutcomes` (`crewReset` / `rotate` / `everyoneReset`).

Scripted success values: `crewReset` → `{ ok: true, reset_at: <GALLERY_NOW ISO> }`; `rotate` → `{ ok: true, new_share_token: <synthetic token>, new_epoch: 2 }`; `everyoneReset` → `{ ok: true, new_epoch: 2 }`. Error kinds map to the single real code `PICKER_RESOLVER_LOOKUP_FAILED` (rotate/everyoneReset) and `PICKER_CREW_MEMBER_NOT_FOUND` / `PICKER_RESOLVER_LOOKUP_FAILED` (crewReset not_found / error).

### 3.4 Reachability validation

Scripting a control that cannot mount in the scenario is a hard validation error (`validateScenario`), same fail-loud philosophy as the no-op fixture guard:

| Key | Requires in the same scenario |
| --- | --- |
| `approve` / `reject` | ≥1 pending mi11 hold row (existing hold inputs) |
| `undo` | ≥1 applied individually-undoable crew-domain `changeLog` row |
| `accept` / `acceptAll` | ≥1 pending `changeLog` row |
| `bulkIgnore` | ≥1 warning group exposing the bulk-ignore chip (warnings volume ≥ the bulk threshold) |
| `resolve` | ≥1 attention item rendering `PerShowAlertResolveButton` |
| `crewReset` | ≥1 crew row with row-actions affordance (crew non-empty, picker rows present) |
| `rotate` / `everyoneReset` | share-link surface active (`fixture.share.linkActive`) |
| `setPublished` / `archive` / `resync` | archived/published/finalize lifecycle state in which the control renders enabled (e.g. `archive` requires not-archived; `setPublished` requires not-finalize-owned) |

Exact mount predicates are verified against component render conditions at plan time (pre-draft code-verification pass); the table's principle — no unreachable script — is the ratified contract.

### 3.5 Scenario roster (new nav group)

`ScenarioGroupId` (`lib/dev/galleryModalTypes.ts:96-104`) gains `"actions"`, appended to `GROUP_ORDER` after `"warnings"`. New tier-2 scenarios (ids indicative; volumes/fixtures finalized in plan):

| id | Scripts | Demonstrates |
| --- | --- | --- |
| `t2-act-resync-error` | `resync: error SYNC_INFRA_ERROR` | re-sync error panel |
| `t2-act-resync-shrink` | `resync: shrink_held` | shrink-hold confirm panel |
| `t2-act-resync-success` | `resync: success applied` | success message + refresh path (`router.refresh()` soft-refreshes the gallery server page; scenario data is static, client state preserved — expected, harmless) |
| `t2-act-publish-refusal` | `setPublished: error PUBLISH_BLOCKED_PENDING_REVIEW` | refusal popover |
| `t2-act-publish-generic` | `setPublished: error <non-allowlisted>` | generic-error arm |
| `t2-act-archive-refusal` | `archive: error FINALIZE_OWNED_SHOW`, on finalize-owned fixture | archive refusal + disabled-publish interplay |
| `t2-act-archive-notfound` | `archive: not_found` | retired-show refresh prompt |
| `t2-act-feed-errors` | `undo/accept/acceptAll/approve/reject: error` on a mixed feed | Mi11 + accept + undo error blocks |
| `t2-act-resolve-error` | `resolve: error` | resolve-button error notice |
| `t2-act-bulkignore-partial` | `bulkIgnore: partial` | "Ignored X of N" alert |
| `t2-act-bulkignore-fail` | `bulkIgnore: fail` | total-fail alert |
| `t2-act-crewreset-outcomes` | `crewReset: not_found` | crew-row not-found banner (success banner via `t2-act-share-success` below) |
| `t2-act-share-errors` | `rotate: error`, `everyoneReset: error` | ShareHub error banners |
| `t2-act-share-success` | `rotate: success`, `everyoneReset: success`, `crewReset: success` | success banners incl. new-token reveal |
| `t2-act-pending` | `pending` on `resync`, `setPublished`, `approve`, `undo`, `crewReset`, `rotate` | in-flight labels/spinners, one scenario, per-control hang |

15 scenarios. Each carries `landing: "actions"` (or real attention/warning inputs where the script requires them, per §3.4).

### 3.6 What does NOT change

- No new server actions, API routes, or DB surface. Invariant 10: no new mutation surfaces (the scripted layer is client-only). Invariant 2 (advisory locks): untouched. Invariant 9: no new Supabase call sites.
- Production behavior of the three channel-3 components is bit-identical when the provider is absent (asserted by test, §5).
- `NOOP_ACTIONS` defaults for unscripted controls; guard 403 for unscripted writes.
- No new visual states are designed: every state this feature exposes already shipped with its component; the gallery only makes them reachable. Hence no new Transition Inventory or Dimensional Invariants (the components' own specs carry those).

### 3.7 Dimensional Invariants

None new. This feature adds no fixed-dimension parent and no new layout: every rendered state already shipped with its owning component, whose spec carries any dimensional contract. The gallery only makes those states reachable.

### 3.8 Transition Inventory

None new. All state transitions this feature exposes (idle to pending to error/refusal/success per control) are the owning components' already-shipped transitions; no new visual state or animation is introduced. The scenario switcher's remount-per-scenario behavior (instant, no animation) is unchanged from PR #557.

## 4. Error handling

- Unknown scenario field / non-tier-2 use / no-op script / unreachable script / out-of-range `okCount` → `validateScenario` errors (fail-loud at gallery build, existing mechanism).
- `pending` scripts hang forever by design; the switcher's scenario remount (key change) unmounts the hung component tree — no leak beyond an unresolved promise, same lifetime as the tab.
- Scripted fetch bodies are exactly the route envelopes cited in §2; a drift in a route envelope shows up as the gallery demonstrating a wrong state, guarded by the §5 e2e assertions on rendered copy.

## 5. Testing

- **Unit (jsdom):** validator rules (§3.0 guards, §3.4 reachability, tier-2-only); scripted-closure builder returns contract-exact shapes; `FetchScript` matching + `callIndex` sequencing (partial bulk-ignore); override context hook returns `undefined` with no provider.
- **Production-default regression:** for each of the 3 channel-3 components, a test asserting the real imported action is called when no provider is mounted (mock the lib module, render without provider, fire the control) — pins "provider absent = unchanged behavior".
- **Real-browser e2e** (`tests/e2e/attention-modal-gallery.spec.ts` extension): for representative scenarios (at minimum: resync-error, resync-shrink, publish-refusal, bulkignore-partial, crewreset-outcomes, share-success, pending), select the scenario, click the control, assert the outcome UI copy (scoped, anti-tautology: assert inside the outcome region, not the whole modal) and assert `data-gallery-scripted-write` (channel 2) with NO real network write. Pending: click, assert busy label present and stable after a settle beat.
- **Containment sweep update:** the modal-state containment contract accepts `data-gallery-scripted-write` as proof-of-interception equal to `data-gallery-blocked-write`; sweep asserts every non-GET during gallery interaction carries one of the two markers.
- **Meta-test inventory:** no new registry-class meta-test required — no new Supabase call boundary, no new admin mutation surface, no new §12.4 code (all scripted codes already exist in the catalog or are the components' own structural codes). Declared per the writing-plans meta-test-inventory rule: "none applies" with this reason, EXCEPT the existing gallery fixture-knobs/validator test files, which this feature extends.

## 6. Rollout

Single PR. Gallery is dev-gated (build-time route aside via `scripts/with-admin-dev-flag.mjs` + `requireDeveloper()`); no prod exposure. On merge: update `DEFERRED.md` class-6 entry to resolved (pointer to this spec), matching the un-defer trigger recorded there. Impeccable dual-gate (invariant 8) runs on the affected diff — gallery UI + the three touched production components.
