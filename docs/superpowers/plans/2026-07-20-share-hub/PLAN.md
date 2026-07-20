# Plan — Share Hub (status-band share popover)

**Spec:** `docs/superpowers/specs/2026-07-20-share-hub-design.md` (canonical; §1.1 = do-not-relitigate)
**Mock:** `docs/superpowers/specs/2026-07-20-share-hub-mock/ActionBarMenu-1d.dc.html`
**Branch:** `feat/share-hub` off `origin/main` @ 23ef21645 · **Implementer:** Opus / Claude Code (UI work — routing hard rule)

## Meta-test inventory

- **EXTENDS** `tests/messages/_metaAlertActionsContract.test.ts:151-155` — the `#share-access` source assertion re-points from `components/admin/showpage/OverviewSection.tsx` to `components/admin/showpage/StatusStrip.tsx`.
- **EXTENDS** `tests/components/admin/showpage/pageTransitions.test.tsx` registry — new `ShareHub.tsx` row; recomputed `StatusStrip.tsx` / `OverviewSection.tsx` counts (values obtained by RUNNING the scanner, never by reasoning).
- **NOT extended:** `tests/log/_metaMutationSurfaceObservability.test.ts` / `_auditableMutations.ts` — no mutation surface is added, removed, or renamed (`rotateShareToken` `lib/auth/picker/rotateShareToken.ts:26` and `resetPickerEpoch` `lib/auth/picker/resetPickerEpoch.ts:1` are already registered at `tests/log/_auditableMutations.ts:265-271` and are called unchanged).
- **NOT extended:** advisory-lock topology (`tests/auth/advisoryLockRpcDeadlock.test.ts`) — no `pg_advisory*` surface touched. Supabase call-boundary meta (`tests/auth/_metaInfraContract.test.ts`) — no new Supabase call sites. Sentinel-hiding meta — no optional-text sentinels.

## Advisory-lock holder topology

N/A — the diff contains no `pg_advisory*` call and adds no RPC.

## Tasks (TDD: failing test → minimal implementation → passing test → commit)

### T1 — ShareHub trigger group (published / unpublished / archived)
Test `tests/components/admin/showpage/shareHub.test.tsx`: renders accent "Share link" when `published`, outline "Share link · paused" when not; kebab `aria-label="More share actions"`; both triggers carry `aria-expanded=false` + `aria-controls` pointing at the popover id; nothing rendered at all when the hosting strip is archived (asserted at the StatusStrip level in T5). Failure mode caught: a lifecycle arm rendering the wrong label or a trigger missing its expanded state.
Implementation: new `components/admin/showpage/ShareHub.tsx` (client) — triggers + open state only.

### T2 — Popover open/close semantics
Tests: click either trigger opens one popover (exactly one `role="dialog"` node, `aria-label="Share crew link"`); second click closes; backdrop click closes without focus restore; Escape closes, restores focus to the trigger that opened it, and calls `stopPropagation` (assert via a document-level Escape spy that must NOT fire — mirrors the contract at `components/admin/review/ReviewModalShell.tsx:238-243` and the shipped idiom at `components/admin/wizard/CrewRowActions.tsx:115-121`). Failure mode caught: Escape taking the whole review modal down; focus dropping to `<body>` on close.

### T3 — Popover content, published arm
Tests: crew URL `<code>` renders `${resolveOrigin()}/show/${slug}/${token}` from `ShareTokenProvider`; `ShareLinkCopyButton variant="accent"` present; mailto anchors rendered from `buildCrewLinkMailtos` (`app/admin/show/[slug]/crewLinkMailto.ts`) including the multi-batch note when `batchCount > 1`; `crewEmails: []` → zero mailto anchors; `token: null` → the unavailable sentence instead of the URL block. Assertions read expected values from the fixture inputs (origin/slug/token), never hardcoded strings. Failure mode caught: silently dropping recipients or rendering a dead URL block.

### T4 — Popover content, Careful section + unpublished arm
Tests: `RotateShareTokenButton` present with `rowLabel="Rotate share link"` and `isCrewLinkActive` following `published`; `PickerResetControl` present with the passed `crew`; unpublished arm shows the paused note verbatim and NO url/copy/email while Careful rows remain. Failure mode caught: the paused arm hiding rotate/reset (spec §1.1 forbids). Note: two confirms armed at once is PERMITTED (spec §6) — assert it does not throw or cross-clear, rather than asserting exclusivity.

### T4b — Busy contract (`onBusyChange`) — the one child-component change
Tests, in `rotateShareTokenButton.test.tsx` + `pickerResetControl.test.tsx`: each control calls `onBusyChange(true)` when entering `resolving` and `onBusyChange(false)` when it settles (success AND error AND thrown-action paths); omitting the prop preserves today's behavior exactly (pins that `step3ReviewSections.tsx`, which passes nothing, is unaffected). Then in `shareHub.test.tsx`: with a child busy, ALL FOUR dismissal paths are inert — primary trigger, kebab, Escape, backdrop — and Escape still calls `stopPropagation` (assert the document-level spy does not fire, else the whole review modal closes). Failure mode caught: a trigger click unmounting a rotate mid-flight, invalidating the crew's link with no observable confirmation.
Implementation: add optional `onBusyChange?: (busy: boolean) => void` to both controls (additive, default undefined). ShareHub keeps a busy count and gates dismissal + defers the lifecycle close on it.

### T5 — StatusStrip integration + anchor relocation
Tests (`statusStrip.test.tsx`): strip renders `ShareHub` in a right-flushed group for non-archived shows and omits it when archived; the standalone `strip-copy-link` button no longer exists; `id="share-access"` is present on the strip root in ALL THREE lifecycles. Plus `_metaAlertActionsContract` re-point. Failure mode caught: the alert deep-link anchor disappearing for archived shows.
Implementation: StatusStrip renders the hub inside a `relative` wrapper around the trigger group ONLY (never on the strip row — `StatusStrip.tsx:166-168` forbids it; the Re-sync overlay's `inset-x-0` depends on the band being the positioned ancestor).

### T6 — Retire Overview share cluster + modal composition
Tests: `OverviewSection` no longer accepts/renders `shareSlot`, `#share-access`, or `admin-share-link-inactive`; `_showReviewModal` passes hub props and serializes reset affordances iff `!archived` (widened from `published && !archived`, spec §1.1) — assert the archived case still serializes nothing. Delete `CurrentShareLinkPanel.tsx`, `ShareLinkBody.tsx`, and migrate `tests/components/CurrentShareLinkPanel.test.tsx` assertions into `shareHub.test.tsx`. Failure mode caught: leaking reset server-action references into an archived show's RSC payload.

### T6b — Enumerated consumer sweep (fails-by-default)
Every file that names a retired symbol/testid must be visited, not just the ones T6 touches. Enumerated 2026-07-20 by `grep -rln "shareSlot|CurrentShareLinkPanel|admin-share-link-inactive|admin-current-share-link" tests/`:
`tests/app/admin/showReviewModalLoader.test.tsx`, `tests/components/ShareLinkBody.test.tsx`, `tests/components/shareTokenInstantUpdate.test.tsx`, `tests/components/CurrentShareLinkPanel.test.tsx`, `tests/components/admin/per-show-lifecycle.test.tsx`, `tests/components/admin/shareLinkCopyButtonVariant.test.tsx`, `tests/components/admin/showpage/overviewSection.test.tsx`, `tests/components/admin/showpage/statusStrip.test.tsx`, `tests/components/admin/showpage/publishedReviewModal.test.tsx`, `tests/e2e/picker-flow.spec.ts`, `tests/e2e/_publishedReviewModalHarness.tsx`, `tests/e2e/admin-lifecycle-transitions.spec.ts`, `tests/e2e/_skeletonParityHarness.tsx`, `tests/e2e/published-review-modal.interactions.spec.ts`.
Closure check: re-run the same grep after the sweep; the only permitted hits are ones referring to the hub's own reused testids (`admin-current-share-link-url` / `-email-button` if retained). Any other survivor is an unmigrated consumer.

### T7 — Transitions pin recompute
Run the §9 scanner; update `pageTransitions.test.tsx` registry entries for `StatusStrip.tsx`, `OverviewSection.tsx`, and add `ShareHub.tsx`. Counts come from the scanner output pasted into the commit message, not from reasoning.

### T8 — Layout-dimensions task (real browser, mandatory)
Playwright (`tests/e2e/published-review-modal.layout.spec.ts`) at each existing width band: hub trigger group's right edge == band content-box right edge within 0.5px (re-targets T-COPY-FLUSH); popover right edge aligns to the same edge; at 390px the popover's left edge is ≥ the modal's content-box left edge (clamp holds, no horizontal body scroll); kebab is square and ≥ the tap-min token. jsdom is not sufficient — real layout only.

### T9 — Transition audit (mandatory)
Enumerate every conditional render in `ShareHub.tsx`; assert each is instant (no `AnimatePresence`, no transition classes on mount/unmount) per spec §9. Then cover the spec's compound table row by row — it is a state VECTOR, not an enum: rotate=banner ∧ reset=confirm (banner must not be cross-cleared); rotate=banner ∧ reset=resolving; both=confirm; both=resolving (busy count stays ≥1 until BOTH settle); publish toggle while busy (close DEFERRED, not dropped); backdrop click while an auto-revert timer is pending; rotate success while a Copy 2s window is open (URL updates, stale "Copied" self-clears).

### T10 — e2e deep-link + lifecycle re-targeting
`published-review-modal.deeplink.spec.ts:199-247` re-targets the strip block; `admin-lifecycle-transitions.spec.ts:271` paused-copy reference updated to the popover's paused note.

### T11 — impeccable dual gate (invariant 8)
`/impeccable critique` AND `/impeccable audit` on the diff; P0/P1 fixed or explicitly deferred via `DEFERRED.md`; findings + dispositions recorded in the PR body.

### T12 — Full pre-push gates
`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, plus the e2e projects touched. Then push, real CI green, merge.
