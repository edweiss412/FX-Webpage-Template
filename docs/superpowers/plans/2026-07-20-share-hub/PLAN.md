# Plan — Share Hub (status-band share popover)

**Spec:** `docs/superpowers/specs/2026-07-20-share-hub-design.md` (APPROVED; §1.1 = do-not-relitigate, §9 R1–R4 = the composition rules)
**Mock:** `docs/superpowers/specs/2026-07-20-share-hub-mock/ActionBarMenu-1d.dc.html`
**Branch:** `feat/share-hub` off `origin/main` @ 23ef21645 · **Implementer:** Opus / Claude Code (UI work — routing hard rule)

## Commit discipline (invariant 1 + 6)

Every task below is ONE commit that is independently green: failing test → minimal implementation → **full suite passes** → commit. A task therefore owns every test that observes the behavior it changes — migrating those tests is part of the task, never a later cleanup. No task may leave an unresolved import, an untyped prop, or a red test for a subsequent task to fix.

**Red proof.** TDD wants the test to fail first. Some assertions here (geometry, ARIA state on code that does not exist yet) fail naturally. Others — pins recomputed from a scanner, assertions over already-correct markup — could pass on first run and prove nothing. For any such test the task MUST record a **red proof** in its commit message: the one-line perturbation applied to the implementation, and the resulting failure. A test with no natural red and no recorded red proof is not done.

## Meta-test inventory

- **EXTENDS** `tests/messages/_metaAlertActionsContract.test.ts:151-155` — the `#share-access` source assertion re-points from `OverviewSection.tsx` to `StatusStrip.tsx` (T4).
- **EXTENDS** `tests/components/admin/showpage/pageTransitions.test.tsx` registry — new `ShareHub.tsx` row (T3); recomputed `StatusStrip.tsx` (T4) and `OverviewSection.tsx` (T5) counts, each obtained by RUNNING the scanner and pasted into that task's commit message.
- **NOT extended:** mutation-surface observability / `_auditableMutations.ts` — no mutation surface added, removed, or renamed; `rotateShareToken` and `resetPickerEpoch` are called unchanged and are already registered at `tests/log/_auditableMutations.ts:265-271`.
- **NOT extended:** advisory-lock topology, Supabase call-boundary, sentinel-hiding — no `pg_advisory*` call, no new Supabase call site, no optional-text sentinel.

## Advisory-lock holder topology

N/A — the diff contains no `pg_advisory*` call and adds no RPC.

---

## T1 — Rotate thrown-action guard (pre-existing bug; prerequisite)

Independent of everything else; ships first so T2 has a reachable thrown-exit path.

**Test** (rotate's own test file): make `rotateShareToken` reject → assert the control settles to its existing refused banner and leaves `resolving`. Fails today: `onConfirmClick` has no try/catch (`RotateShareTokenButton.tsx:140-155`; zero `catch` blocks in the file), so `result` stays null, the `ui === "resolving"` exit effect never fires, and the control strands forever.
**Implementation:** add the guard, mirroring `PickerResetControl.tsx:139-145` and `CrewRowActions.tsx:203-206`.
**Failure mode caught:** under T2's busy contract a thrown rotate would wedge the hub permanently — `busy` never clears, so every dismissal path stays inert.

## T2 — `onBusyChange` on both controls

**Tests** (`rotateShareTokenButton.test.tsx`, `pickerResetControl.test.tsx`): each control calls `onBusyChange(true)` on entering `resolving` and `onBusyChange(false)` on settling — success AND returned-error AND thrown-action (reachable only because T1 landed). Omitting the prop preserves today's behavior exactly; assert `step3ReviewSections.tsx`'s prop-less usage still renders and behaves unchanged.
**Implementation:** optional `onBusyChange?: (busy: boolean) => void` on both, additive, default undefined.
**Failure mode caught:** a busy edge that never fires leaves the hub either permanently locked or unguarded during a mutation.

## T3 — `ShareHub` component, in isolation

Self-contained: the component is unit-tested with props supplied directly, so it is complete and type-safe before any integration.

**Tests** (`tests/components/admin/showpage/shareHub.test.tsx`), all failing until the component exists:
- Triggers: accent "Share link" when `published`, outline "Share link · paused" when not; kebab `aria-label="More share actions"`. **`aria-expanded` is `false` when closed and `true` when open, on BOTH triggers**, and `aria-controls` resolves to the popover's id.
- Open/close: either trigger opens exactly one `role="dialog"` labelled "Share crew link"; second press closes; backdrop click closes without focus restore; Escape closes, restores focus to the trigger that opened it, and calls `stopPropagation` (assert a document-level Escape spy does NOT fire — otherwise the whole review modal closes, `ReviewModalShell.tsx:238-245`).
- Busy gating: with a child busy, ALL FOUR dismissal paths are inert — primary trigger, kebab, Escape, backdrop — and Escape still `stopPropagation`s.
- Published arm: `<code>` URL derived from the injected token + `resolveOrigin()` + slug (expected value computed from the fixture, never hardcoded); `ShareLinkCopyButton variant="accent"`; mailto anchors from `buildCrewLinkMailtos` including the multi-batch note when `batchCount > 1`. Guards: `crewEmails: []` → zero mailto anchors; **`showTitle: ""` → the builder's documented subject fallback, asserted on the emitted href**; `token: null` → the unavailable sentence, no URL block.
- Unpublished arm: paused note verbatim; NO url/copy/email; Careful rows still present.
- Careful section: `RotateShareTokenButton` with `rowLabel="Rotate share link"`, **`rowDescription="Old link stops working immediately"`**, and `isCrewLinkActive` following `published`; `PickerResetControl` with the passed `crew`, **and with `pickerCrew: []` rendering its documented empty-roster copy**.
- §9 rules R1–R4 executable (this is where prose was replaced by tests): R1 arming either control's confirm clears ITS OWN banner, success and error, and banner+confirm is unreachable within one control but reachable across the two; R2 rotate's banner clears on re-arm ONLY — its auto-revert timer must NOT clear it — while reset's success banner clears on re-arm OR timer and its error banner on re-arm only; R3 error banners persist and are `role="alert"`, successes are `role="status"` with reset announcing through its sr-only region and its visible banner `aria-hidden`; R4 `busy` freezes no timer and disables no confirm row.
- Two confirms armed at once is PERMITTED (§6): assert it neither throws nor cross-clears — do NOT assert exclusivity.
- Lifecycle: **`published` flipping while the hub is open and idle closes it immediately**; flipping while `busy` DEFERS the close until settle (§4). Both directions asserted — the idle case is what stops the popover surviving a content swap.
- Transition audit: every conditional in `ShareHub.tsx` is instant (no `AnimatePresence`, no mount/unmount transition classes); add the `ShareHub.tsx` row to the pageTransitions registry (**red proof required** — count comes from running the scanner).

## T4 — StatusStrip integration, prop threading, anchor relocation

One commit, because the prop chain must land with its consumer or nothing type-checks. `StatusStripProps` today has none of `showId` / `crewEmails` / `showTitle` / `pickerCrew`; this task adds them and threads them from `_showReviewModal` → `PublishedReviewModal` → `StatusStrip` → `ShareHub`.

**Tests:** strip renders `ShareHub` right-flushed for non-archived shows, omits it when archived; `strip-copy-link` no longer exists anywhere; `id="share-access"` is on the strip root in ALL THREE lifecycles; `_metaAlertActionsContract` re-points to `StatusStrip.tsx`; `publishedReviewModal.test.tsx` and the modal-loader test cover the new props. Recompute the `StatusStrip.tsx` pin by running the scanner (**red proof required**).
**Also in this commit** (they observe the strip and would otherwise go red): the e2e harnesses `_publishedReviewModalHarness.tsx` / `_skeletonParityHarness.tsx`, T-COPY-FLUSH in `published-review-modal.layout.spec.ts` re-targeted to the hub trigger group, and `published-review-modal.deeplink.spec.ts:199-247` re-targeted to the strip block (its ":129 taller-than-pane" note no longer applies to a short band).
**Failure mode caught:** the alert deep-link anchor disappearing for archived shows; a half-threaded prop chain.

## T5 — Retire the Overview share cluster

One commit: deletion and every consumer's migration together, so no commit is ever red.

**Tests:** `OverviewSection` no longer accepts or renders `shareSlot`, `#share-access`, or `admin-share-link-inactive`; `_showReviewModal` serializes the reset affordances iff `!archived` (widened from `published && !archived`, spec §1.1) — assert the archived case serializes nothing, which is the RSC-payload guard. Recompute the `OverviewSection.tsx` pin (**red proof required**).
**Deletes:** `CurrentShareLinkPanel.tsx`, `ShareLinkBody.tsx`, `OverviewSection`'s `shareSlot` prop, `_showReviewModal`'s shareSlot build.
**Migrates, in this same commit** — the enumerated sweep, extended per review to include the deleted SYMBOL and the retired TESTID, not just the panel names:

```
rg -l 'shareSlot|CurrentShareLinkPanel|ShareLinkBody|admin-share-link-inactive|admin-current-share-link|strip-copy-link' tests/ app/ components/
```

Known consumers (2026-07-20): `tests/app/admin/showReviewModalLoader.test.tsx`, `tests/components/ShareLinkBody.test.tsx`, `tests/components/shareTokenInstantUpdate.test.tsx`, `tests/components/CurrentShareLinkPanel.test.tsx`, `tests/components/admin/per-show-lifecycle.test.tsx`, `tests/components/admin/shareLinkCopyButtonVariant.test.tsx`, `tests/components/admin/showpage/overviewSection.test.tsx`, `tests/components/admin/showpage/statusStrip.test.tsx`, `tests/components/admin/showpage/publishedReviewModal.test.tsx`, `tests/e2e/picker-flow.spec.ts`, `tests/e2e/_publishedReviewModalHarness.tsx`, `tests/e2e/admin-lifecycle-transitions.spec.ts` (incl. the `:271` paused-copy reference → the popover's paused note), `tests/e2e/_skeletonParityHarness.tsx`, `tests/e2e/published-review-modal.interactions.spec.ts`.
**Closure check:** re-run the grep above. Permitted survivors are ONLY hits inside `shareHub.test.tsx` referring to testids the hub deliberately reuses. Anything else is an unmigrated consumer.

## T6 — Real-browser layout (mandatory; jsdom cannot verify any of this)

Playwright in `published-review-modal.layout.spec.ts`, at each existing width band:
- Hub trigger group's right edge == the band's **content-box** right edge within 0.5px (measured against the band, never the panel — the band carries `px-tile-pad`).
- Popover **width is 308px**, its **top edge sits at the trigger group's bottom edge** (`top-full`, no vertical overlap of the triggers), and its right edge aligns to the same content-box edge.
- At 390px: the popover's left edge is ≥ the modal's content-box left edge (clamp holds) and `document.documentElement.scrollWidth` shows no horizontal overflow.
- **Primary trigger and kebab both satisfy the tap-min token**; the kebab is square.

## T7 — impeccable dual gate (invariant 8)

`/impeccable critique` AND `/impeccable audit` on the diff; P0/P1 fixed or explicitly deferred via `DEFERRED.md`; findings + dispositions recorded in the PR body.

## T8 — Pre-push gates

`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, plus every touched e2e project. Then whole-diff cross-model review, push, real CI green, `gh pr merge --merge`, and fast-forward local `main` to `0  0`.
