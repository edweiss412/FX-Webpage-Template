# Phase 3 — Interstitial + checkpoint fold (spec §4.5)

Render the unified Step-3 for `in_progress` + `all_batches_complete`; fold Resume/Finish into the footer; delete the three interstitials + `ResumeFinalizeButton`. After this phase, `/admin` renders Step-3 (with the modal) for every non-terminal checkpoint — so `/admin` is a valid redirect target for Phase 4.

---

### Task 3.1: `useFinalizeRun` mode endpoint contract (spec §4.5, HIGH R7)

The combined `useFinalizeRun` drives `/finalize` then auto-posts `/finalize-cas`. Add a `mode` selecting the endpoint sequence so Resume stops before CAS and Finish calls only CAS.

**Files:**
- Modify: `components/admin/FinalizeButton.tsx:124` (`FinalizeRunProps`), `:139` (`useFinalizeRun`), `:344-362` (loop + CAS)
- Test: `tests/components/admin/FinalizeRunModes.test.tsx`

**Interfaces:**
- Produces: `FinalizeRunProps` gains `mode?: "publish" | "resume" | "finish"` (default `"publish"`); the hook's run sequence branches on it.

- [ ] **Step 1: Write the failing test** — mock `fetch`; assert endpoint call counts:
```tsx
it("resume drives /finalize to completion but NEVER calls /finalize-cas", async () => {
  const calls = mockFinalizeFetch({ batches: ["batch_complete", "all_batches_complete"] });
  renderHook(() => useFinalizeRun({ wizardSessionId: "s1", disabled: false, publishCount: 2, uncheckedCleanCount: 0, mode: "resume" }));
  // trigger the run...
  await waitFor(() => expect(calls.byPath("/api/admin/onboarding/finalize-cas")).toBe(0));
  expect(calls.byPath("/api/admin/onboarding/finalize")).toBeGreaterThan(0);
});
it("finish (mode:'finish') calls ONLY /finalize-cas", async () => {
  const calls = mockFinalizeFetch({ cas: "complete" });
  renderHook(() => useFinalizeRun({ wizardSessionId: "s1", disabled: false, publishCount: 2, uncheckedCleanCount: 0, mode: "finish" }));
  await waitFor(() => expect(calls.byPath("/api/admin/onboarding/finalize-cas")).toBe(1));
  expect(calls.byPath("/api/admin/onboarding/finalize")).toBe(0);
});
it("publish (mode:'publish') calls /finalize loop THEN /finalize-cas", async () => {
  const calls = mockFinalizeFetch({ batches: ["all_batches_complete"], cas: "complete" });
  renderHook(() => useFinalizeRun({ wizardSessionId: "s1", disabled: false, publishCount: 2, uncheckedCleanCount: 0, mode: "publish" }));
  await waitFor(() => expect(calls.byPath("/api/admin/onboarding/finalize-cas")).toBe(1));
  expect(calls.byPath("/api/admin/onboarding/finalize")).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement** — thread `mode`:
  - `publish`: unchanged (`/finalize` loop → `/finalize-cas`).
  - `resume`: run the `/finalize` loop; at `all_batches_complete` STOP (skip the `:356-362` CAS block) and `router.refresh()`.
  - `finish`: skip the `/finalize` loop; go straight to the `/finalize-cas` block.

- [ ] **Step 4: Run — verify pass.** - [ ] **Step 5: Typecheck.**

- [ ] **Step 6: Commit**
```bash
git add components/admin/FinalizeButton.tsx tests/components/admin/FinalizeRunModes.test.tsx
git commit --no-verify -m "feat(admin): useFinalizeRun mode endpoint contract (publish/resume/finish, spec §4.5)"
```

---

### Task 3.2: Footer selects Publish/Resume/Finish by checkpoint + re-home Cleanup + stale note (spec §4.5)

**Files:**
- Modify: `components/admin/wizard/Step3ReviewWithFinalize.tsx:52+` (`checkpointStatus` input, footer selection)
- Test: `tests/components/admin/wizard/Step3ReviewWithFinalizeFooter.test.tsx`

**Interfaces:**
- Consumes: `useFinalizeRun` `mode` (Task 3.1), `CleanupAbandonedFinalizeButton({sessionId})`.
- Produces: `Step3ReviewWithFinalizeProps` gains `checkpointStatus?: "in_progress" | "all_batches_complete" | null` and `isStale?: boolean`.

- [ ] **Step 1: Write the failing test**:
  - `checkpointStatus="in_progress"` → footer renders a **Resume** trigger (`useFinalizeRun` mode `resume`) + `CleanupAbandonedFinalizeButton`.
  - `checkpointStatus="all_batches_complete"` → **Finish** trigger (mode `finish`); `isStale` → a stale note is present + `CleanupAbandonedFinalizeButton`.
  - `checkpointStatus=null` → **Publish** trigger (unchanged), NO cleanup control.

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement** — pick the footer primary by `checkpointStatus`: `null`→`FinalizeTrigger` (mode publish), `in_progress`→Resume trigger (mode resume), `all_batches_complete`→Finish trigger (mode finish). Render `CleanupAbandonedFinalizeButton` when `in_progress` OR (`all_batches_complete` AND `isStale`). Render the stale note (replacing `StaleReadyToPublish`'s standalone framing) when `isStale`. Keep the disabled gate on `finishable`.

- [ ] **Step 4: Run — verify pass.** - [ ] **Step 5: Typecheck.**

- [ ] **Step 6: Commit**
```bash
git add components/admin/wizard/Step3ReviewWithFinalize.tsx tests/components/admin/wizard/Step3ReviewWithFinalizeFooter.test.tsx
git commit --no-verify -m "feat(admin): footer Publish/Resume/Finish by checkpoint + cleanup re-home (spec §4.5)"
```

---

### Task 3.3: Rewire `app/admin/page.tsx` + delete interstitials (spec §4.5, §4.6)

Render the unified Step-3 for `in_progress` + `all_batches_complete`; compute `isStale` at the page; delete `FinalizeInProgress`/`ReadyToPublish`/`StaleReadyToPublish`/`ResumeFinalizeButton`.

**Files:**
- Modify: `app/admin/page.tsx:156-193`
- Delete: `components/admin/FinalizeInProgress.tsx`, `ReadyToPublish.tsx`, `StaleReadyToPublish.tsx`, `ResumeFinalizeButton.tsx`
- Test: `tests/admin/step3InfraFooter.test.tsx` (checkpoint render + infra-footer preservation)

- [ ] **Step 1: Write the failing test** (integration, spec §11 + R8):
  - `in_progress` checkpoint renders the unified Step-3 with a Resume footer (not `FinalizeInProgress`).
  - `all_batches_complete` (+stale) renders the unified Step-3 with a Finish footer + stale note (not `ReadyToPublish`/`StaleReadyToPublish`).
  - a rows `{kind:"infra_error"}` at `in_progress`/`all_batches_complete` STILL renders the checkpoint footer (Resume/Finish + Cleanup, from `checkpointStatus`) alongside the degraded row note; at `checkpoint null`, degrades to the note alone.

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement** — replace the `in_progress` and `all_batches_complete` branches (`:157-182`) with the unified render: pass `checkpointStatus` + `isStale` (`isCheckpointStale(checkpoint.last_processed_at, await nowDate())`) into `OnboardingWizard`/`Step3Container`. Route the `Step3Container` infra-error path (`OnboardingWizard.tsx:417`) so it still renders the checkpoint footer at non-null checkpoints. Delete the four component files + their imports. (Do NOT delete `readUnresolvedSheets` yet — its fold lands in Phase 5; but it's no longer called from `page.tsx` after this.)

- [ ] **Step 4: Run — verify pass** + `pnpm tsc --noEmit` (surfaces any surviving import of the deleted components — fix them here or they block Phase 5).

- [ ] **Step 5: Commit**
```bash
git add app/admin/page.tsx components/admin/wizard/Step3ReviewWithFinalize.tsx tests/admin/step3InfraFooter.test.tsx
git rm components/admin/FinalizeInProgress.tsx components/admin/ReadyToPublish.tsx components/admin/StaleReadyToPublish.tsx components/admin/ResumeFinalizeButton.tsx
git commit --no-verify -m "feat(admin): unified Step-3 for in_progress/all_batches_complete; delete interstitials (spec §4.5/§4.6)"
```

---

### Task 3.4: Hide the editable checkbox + Select-all at non-null checkpoints (spec §4.2 rule 7, HIGH plan-R1)

Spec rule 7: the editable publish checkbox exists ONLY at `checkpoint null`. Post-finalize (`in_progress`/`all_batches_complete`) rows are badge-only — no per-row `PublishCheckbox`, no Select-all — because finalize consumed intent into `publish_intent`. Task 2.4 disables mutators during an *active run*; this task hides the checkbox for the *whole post-finalize surface* (a checkpoint state, orthogonal to run-active).

**Files:**
- Modify: `components/admin/wizard/Step3Review.tsx` (accept `checkpointStatus`; suppress Select-all `:531-550` when non-null) + `Step3SheetCard.tsx` (suppress `PublishCheckbox` `:501-505` when non-null, render the derived badge instead)
- Modify: `components/admin/wizard/Step3ReviewWithFinalize.tsx` (thread `checkpointStatus` into `Step3Review`, alongside the footer selection)
- Test: `tests/components/admin/wizard/Step3CheckpointAffordance.test.tsx`

**Interfaces:**
- Produces: `Step3ReviewProps` + `Step3Row` renderers accept `checkpointStatus: "in_progress" | "all_batches_complete" | null`.

- [ ] **Step 1: Write the failing test**:
  - `checkpointStatus=null` + a clean Ready row → renders `data-testid="wizard-step3-select-all"` AND the per-row `PublishCheckbox` (unchanged pre-finalize).
  - `checkpointStatus="in_progress"` (and `"all_batches_complete"`) → NO `wizard-step3-select-all`, NO per-row publish checkbox; a first-seen checked row renders the **Ready to publish** badge; an unchecked row renders **Held**. (Assert against the derived `displayState`; clone-strip nothing else renders a checkbox.)

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement** — thread `checkpointStatus` from `Step3ReviewWithFinalize` → `Step3Review` → `Step3SheetCard`; gate the Select-all control and `PublishCheckbox` render on `checkpointStatus === null`. (This is distinct from Task 2.4's `isPublishRunActive` *disable*: here the control is not rendered at all post-finalize.)

- [ ] **Step 4: Run — verify pass.** - [ ] **Step 5: Typecheck.**

- [ ] **Step 6: Commit**
```bash
git add components/admin/wizard/Step3Review.tsx components/admin/wizard/Step3SheetCard.tsx components/admin/wizard/Step3ReviewWithFinalize.tsx tests/components/admin/wizard/Step3CheckpointAffordance.test.tsx
git commit --no-verify -m "feat(admin): hide editable publish checkbox + select-all at non-null checkpoints (spec §4.2 rule 7)"
```
