# Plan — Share Hub (status-band share popover)

**Spec:** `docs/superpowers/specs/2026-07-20-share-hub-design.md` (APPROVED; §1.1 = do-not-relitigate, §9 R1–R4 = the composition rules)
**Mock:** `docs/superpowers/specs/2026-07-20-share-hub-mock/ActionBarMenu-1d.dc.html`
**Branch:** `feat/share-hub` off `origin/main` @ 23ef21645 · **Implementer:** Opus / Claude Code (UI work — routing hard rule)

## Commit discipline (invariant 1 + 6)

Every task below is ONE commit that is independently green: failing test → minimal implementation → **full suite passes** → commit. A task therefore owns every test that observes the behavior it changes — migrating those tests is part of the task, never a later cleanup. No task may leave an unresolved import, an untyped prop, or a red test for a subsequent task to fix.

**Red proof.** TDD wants the test to fail first. Some assertions here (geometry, ARIA state on code that does not exist yet) fail naturally. Others — pins recomputed from a scanner, assertions over already-correct markup — could pass on first run and prove nothing. For any such test the task MUST record a **red proof** in its commit message: the one-line perturbation applied to the implementation, and the resulting failure. A test with no natural red and no recorded red proof is not done.

## Meta-test inventory

- **EXTENDS** `tests/messages/_metaAlertActionsContract.test.ts:151-155` — the `#share-access` source assertion re-points from `OverviewSection.tsx` to `StatusStrip.tsx` (T4).
- **EXTENDS** `tests/components/admin/showpage/pageTransitions.test.tsx` registry — new `ShareHub.tsx` row (T3); recomputed `StatusStrip.tsx` and `OverviewSection.tsx` counts (both T4), each obtained by RUNNING the scanner and pasted into that task's commit message.
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

## T3 — `ShareHub` component: behavior only, NO geometry

Self-contained: unit-tested with props supplied directly, so it is complete and type-safe before any integration.

**Scope boundary — this task authors no geometry.** The split between T3 and T4 is by what can be VERIFIED, not by which file is touched: T3 owns everything jsdom can prove (structure, ARIA, content, state rules), T4 owns everything only a browser can prove (width, placement, alignment, clamp, tap targets) together with the assertions that prove it. Concretely, T3 ships the popover's markup and semantics but NOT `w-[308px]`, `absolute`/`top-full`/`right-0`, the clamp `max-w`, or the tap-min sizing — those land in T4 beside their Playwright checks. Rationale: T3 has no real layout observer, so any geometry committed here would be unverified until a later task, which is precisely the defect this seam kept producing. A popover that renders in normal flow is fine for every T3 assertion.

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

## T4 — Replace the Overview share cluster with the status-band hub (single atomic commit)

**Why this is one task and not two.** Three consecutive review rounds found the same class of defect at a T4/T5 boundary: a duplicated `#share-access` id, then observers of `strip-copy-link` breaking a commit before their tests moved, then old and new rotate/reset controls both rendering in a published modal. The cause is not the placement of the seam — it is that there IS a seam. This change is a *replacement*: any split leaves a window where both surfaces exist or an observer is orphaned. Per the same-vector rule, the fix is structural — the replacement is atomic, so the window cannot exist. This is a large commit by design; commit granularity yields to the never-red invariant.

**Scope — everything below lands together:**

1. **Prop threading.** `StatusStripProps` today has none of `showId` / `crewEmails` / `showTitle` / `pickerCrew`; add them and thread `_showReviewModal` → `PublishedReviewModal` → `StatusStrip` → `ShareHub`.
2. **Mount the hub** in the strip's right group; **remove** `strip-copy-link` and its `copyUrl` derivation.
3. **Move the anchor:** `id="share-access"` onto the strip root, off `OverviewSection` — asserted as exactly ONE such node in the rendered modal, present in all three lifecycles.
4. **Retire the Overview cluster:** delete `CurrentShareLinkPanel.tsx`, `ShareLinkBody.tsx`, `OverviewSection`'s `shareSlot` prop and wrapper div, the `admin-share-link-inactive` notice, and `_showReviewModal`'s shareSlot build. After this commit no rotate/reset control exists outside the hub.
5. **Widen the serialization gate** to `!archived` (from `published && !archived`, spec §1.1); assert the archived case still serializes nothing — that is the RSC-payload guard.
6. **Migrate every consumer** (list and closure grep below).
7. **Recompute both pins** — `StatusStrip.tsx` and `OverviewSection.tsx` — by running the scanner (**red proof required**).

**Tests:** hub right-flushed for non-archived shows, absent when archived; `strip-copy-link` gone everywhere; exactly one `#share-access`; `_metaAlertActionsContract` re-pointed to `StatusStrip.tsx`; `OverviewSection` no longer accepts or renders `shareSlot`; `publishedReviewModal.test.tsx` and the modal-loader test cover the new props; archived serializes no reset affordances.

**Real-browser geometry** — Playwright in `published-review-modal.layout.spec.ts`, at each existing width band:
- Hub trigger group's right edge == the band's **content-box** right edge within 0.5px (measured against the band, never the panel — the band carries `px-tile-pad`). This replaces T-COPY-FLUSH's target.
- Popover **width is 308px**, its **top edge sits at the trigger group's bottom edge** (`top-full`, no vertical overlap of the triggers), and its right edge aligns to the same content-box edge.
- At 390px: the popover's left edge is ≥ the modal's content-box left edge (clamp holds) and `document.documentElement.scrollWidth` shows no horizontal overflow.
- **Primary trigger and kebab both satisfy the tap-min token**; the kebab is square.

**The geometry styling itself is authored HERE, not in T3** — `w-[308px]`, the positioned wrapper plus `absolute top-full right-0`, the clamp `max-w`, and tap-min sizing all land in this commit alongside the assertions above. jsdom computes no layout, so T3 has no way to verify any of it; authoring it there would leave it unproven for a commit. Styling and its proof ship together.

**Consumer migration — same commit.** The enumerated sweep covers the deleted SYMBOLS and the retired TESTIDS, not just the panel names:

```
rg -l 'shareSlot|CurrentShareLinkPanel|ShareLinkBody|admin-share-link-inactive|admin-current-share-link|strip-copy-link' tests/ app/ components/
```

Known consumers (2026-07-20): `tests/app/admin/showReviewModalLoader.test.tsx`, `tests/components/ShareLinkBody.test.tsx`, `tests/components/shareTokenInstantUpdate.test.tsx`, `tests/components/CurrentShareLinkPanel.test.tsx`, `tests/components/admin/per-show-lifecycle.test.tsx`, `tests/components/admin/shareLinkCopyButtonVariant.test.tsx`, `tests/components/admin/showpage/overviewSection.test.tsx`, `tests/components/admin/showpage/statusStrip.test.tsx`, `tests/components/admin/showpage/publishedReviewModal.test.tsx`, `tests/e2e/picker-flow.spec.ts`, `tests/e2e/_publishedReviewModalHarness.tsx`, `tests/e2e/admin-lifecycle-transitions.spec.ts` (incl. the `:271` paused-copy reference → the popover's paused note), `tests/e2e/_skeletonParityHarness.tsx`, `tests/e2e/published-review-modal.interactions.spec.ts`.
Also migrated here because they observe the strip: the e2e harnesses `_publishedReviewModalHarness.tsx` / `_skeletonParityHarness.tsx`, and `published-review-modal.deeplink.spec.ts:199-247` re-targeted to the strip block (its ":129 taller-than-pane" note no longer applies to a short band).

**Closure check:** re-run the grep above. Permitted survivors are ONLY hits inside `shareHub.test.tsx` referring to testids the hub deliberately reuses. Anything else is an unmigrated consumer.

**Failure modes caught:** old and new rotate/reset controls both rendering; a duplicated or vanished `#share-access`; an orphaned observer of a retired testid; a half-threaded prop chain; reset affordances serialized for an archived show; a popover overlapping its own triggers or overflowing the modal on mobile.

## T5 — impeccable dual gate (invariant 8)

`/impeccable critique` AND `/impeccable audit` on the diff; P0/P1 fixed or explicitly deferred via `DEFERRED.md`; findings + dispositions recorded in the PR body.

## T6 — Pre-push gates

`pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, plus every touched e2e project. Then whole-diff cross-model review, push, real CI green, `gh pr merge --merge`, and fast-forward local `main` to `0  0`.
