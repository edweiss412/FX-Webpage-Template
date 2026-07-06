# Phase 2 — Modal resolution behavior (spec §4.4)

Fold the `StagedReviewCard` resolution UI into `Step3ReviewModal`. Both the standalone staged page AND the modal work during this phase (dual-path, safe) — the page isn't deleted until Phase 4.

---

### Task 2.1: Extract tier helpers into a shared module (spec §4.4 tiering rule)

`allowedActionsFor`/`describeItem`/`actionLabel`/`expectedRenameValue` are private to `StagedReviewCard`. The folded modal needs them. Extract verbatim into a shared, unit-tested module and add the `tierForItem` rule.

**Files:**
- Create: `lib/admin/step3ReviewItemTiers.ts`
- Modify: `components/admin/StagedReviewCard.tsx` (import from the new module instead of local defs)
- Test: `tests/admin/step3ReviewItemTiers.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function allowedActionsFor(item: TriggeredReviewItem): readonly ReviewerAction[];
  export function describeItem(item: TriggeredReviewItem): string;
  export function actionLabel(action: ReviewerAction, item: TriggeredReviewItem, isWizardMode: boolean): string;
  export function expectedRenameValue(item: TriggeredReviewItem): string | null;
  export type ItemTier = "tier1_context" | "tier2_diagnostic" | "tier3_radio";
  export function tierForItem(item: TriggeredReviewItem): ItemTier;
  ```
- Consumes: `TriggeredReviewItem` (`lib/parser/types.ts`); `ReviewerChoice` (`@/lib/sync/applyStaged`). **`ReviewerAction` is NOT in `lib/parser/types.ts` (plan-R1 fix)** — live code derives it locally as `type ReviewerAction = ReviewerChoice["action"]` (`StagedReviewCard.tsx:61,83`). The new module exports `ReviewerAction` from that same `ReviewerChoice` source; `StagedReviewCard` then imports it from the module instead of re-deriving.

- [ ] **Step 1: Write the failing test** — the tier RULE over the full union (spec §4.4). Assert against `allowedActionsFor().length`, NOT a hardcoded invariant list.
```ts
import { describe, expect, it } from "vitest";
import { tierForItem, allowedActionsFor } from "@/lib/admin/step3ReviewItemTiers";

describe("tierForItem (spec §4.4 rule, not enumeration)", () => {
  it("≥2 allowed actions → tier3 radio (MI-12/13/14)", () => {
    for (const inv of ["MI-12", "MI-13", "MI-14"] as const) {
      const item = { id: "i", invariant: inv, removed_name: "A", added_name: "B", email: "e" } as any;
      expect(allowedActionsFor(item).length).toBeGreaterThanOrEqual(2);
      expect(tierForItem(item)).toBe("tier3_radio");
    }
  });
  it("1 action + pure-context invariant → tier1", () => {
    const item = { id: "i", invariant: "ONBOARDING_SCAN_REVIEW" } as any;
    expect(tierForItem(item)).toBe("tier1_context");
  });
  it("1 action + other invariant → tier2 diagnostic (MI-6, orphans, DIAGRAMS_*)", () => {
    for (const inv of ["MI-6", "MI-13-orphan-remove", "DIAGRAMS_EMBEDDED_NONE_FOUND"] as const) {
      const item = { id: "i", invariant: inv } as any;
      expect(allowedActionsFor(item).length).toBe(1);
      expect(tierForItem(item)).toBe("tier2_diagnostic");
    }
  });
});
```

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement** — move the four helpers from `StagedReviewCard.tsx:115-200` verbatim into `lib/admin/step3ReviewItemTiers.ts`, plus `export type ReviewerAction = ReviewerChoice["action"];` (import `ReviewerChoice` from `@/lib/sync/applyStaged`) and the `ASSET_REVIEW_INVARIANTS`/`FIRST_SEEN_INVARIANTS` sets they depend on (`StagedReviewCard.tsx:71-81`); add:
```ts
const PURE_CONTEXT = new Set(["ONBOARDING_SCAN_REVIEW", "FIRST_SEEN_REVIEW"]);
export function tierForItem(item: TriggeredReviewItem): ItemTier {
  if (allowedActionsFor(item).length >= 2) return "tier3_radio";
  if (PURE_CONTEXT.has(item.invariant)) return "tier1_context";
  return "tier2_diagnostic";
}
```
  Update `StagedReviewCard.tsx` to import these (delete its local copies). Keep behavior identical.

- [ ] **Step 4: Run — verify pass** + run the existing StagedReviewCard tests (`pnpm vitest run tests/components/admin/StagedReviewCard`) to confirm no regression.

- [ ] **Step 5: Typecheck.**

- [ ] **Step 6: Commit**
```bash
git add lib/admin/step3ReviewItemTiers.ts components/admin/StagedReviewCard.tsx tests/admin/step3ReviewItemTiers.test.ts
git commit --no-verify -m "refactor(admin): extract review-item tier helpers to shared module (spec §4.4)"
```

---

### Task 2.2: Fold the resolution body + footer into `Step3ReviewModal` (spec §4.4)

Add a `resolution` prop. When present, the modal renders the tiered resolution body (tier-3 radios; tier-1 header subline; tier-2 section-anchored diagnostics) and swaps the publish footer for Approve & apply / Re-scan / Ignore. When absent, the modal renders exactly as today.

**Files:**
- Modify: `components/admin/wizard/Step3ReviewModal.tsx:149-161` (props) + body/footer
- Modify: `components/admin/RescanSheetButton.tsx:34` — add `disabled?: boolean` to `RescanSheetButtonProps`; `disabled={pending || props.disabled}` at `:157`. **plan-R2 HIGH: the prop is added HERE (its first consumer, the modal Re-scan), not Task 2.4** — the modal Re-scan must freeze on `isPublishRunActive` and Task 2.4's row Re-scan reuses the same prop.
- Test: `tests/components/admin/wizard/Step3ReviewModalResolution.test.tsx`

**Interfaces:**
- Produces: `Step3ReviewModal` props gain
  ```ts
  resolution?: {
    triggeredReviewItems: TriggeredReviewItem[];
    reviewItemsCorrupt: boolean;
    stagedId: string;
    isPublishRunActive: boolean;
    onApplyResolve: (choices: ReviewerChoice[]) => Promise<boolean>; // wizard apply route
    onRescan: () => void;      // rescan-sheet route (RescanSheetButton wraps this)
    onIgnore: () => Promise<boolean>; // discard route kind: permanent_ignore
  };
  ```
- Consumes: `tierForItem`/`allowedActionsFor`/`describeItem`/`actionLabel`/`expectedRenameValue` (Task 2.1); `RescanSheetButton`, `messageFor`/`ErrorExplainer` (invariant 5).

- [ ] **Step 1: Write the failing test** — real-component render (jsdom) of the modal WITH `resolution`:
  - a tier-3 item (`MI-13`) renders a forced-unset radio group; `Approve & apply` disabled until a choice is picked (single-action-no-radio: a `MI-6` item renders NO `role="radio"`).
  - `reviewItemsCorrupt: true` → `Approve & apply` absent/disabled; `Ignore this sheet` present.
  - footer renders Approve & apply / Re-scan this sheet / Ignore this sheet.
  - Anti-tautology: clone the tree and remove the section-nav before scanning body text for a diagnostic label.

```tsx
// sketch — full fixtures derived from the TriggeredReviewItem shapes
it("tier-3 forces a choice before Approve enables", async () => {
  render(<Step3ReviewModal {...baseProps} resolution={resWith([mi13Item])} />);
  expect(screen.getByRole("button", { name: /approve & apply/i })).toBeDisabled();
  fireEvent.click(screen.getByRole("radio", { name: /rename to/i }));
  expect(screen.getByRole("button", { name: /approve & apply/i })).toBeEnabled();
});
it("single-action item renders no radio", () => {
  render(<Step3ReviewModal {...baseProps} resolution={resWith([mi6Item])} />);
  expect(screen.queryByRole("radio")).toBeNull();
});
it("corrupt items suppress Approve, keep Ignore", () => {
  render(<Step3ReviewModal {...baseProps} resolution={resWith([], { reviewItemsCorrupt: true })} />);
  expect(screen.queryByRole("button", { name: /approve & apply/i })).toBeNull();
  expect(screen.getByRole("button", { name: /ignore this sheet/i })).toBeInTheDocument();
});
```

  **Behavioral mutation tests (HIGH plan-R2 — the load-bearing resolution path; render-only tests would pass a no-op/wrong-route impl):**
```tsx
it("Approve & apply sends the exact wizard-apply payload with the tier-3 choice", async () => {
  const onApplyResolve = vi.fn().mockResolvedValue(true);
  render(<Step3ReviewModal {...baseProps} resolution={resWith([mi13Item], { stagedId: "st1", onApplyResolve })} />);
  fireEvent.click(screen.getByRole("radio", { name: /rename to/i }));
  fireEvent.click(screen.getByRole("button", { name: /approve & apply/i }));
  // onApplyResolve receives ReviewerChoice[]; the modal's caller wires it to
  // { stagedId: "st1", reviewerChoicesVersion: 1, reviewerChoices } (Task 2.3).
  await waitFor(() => expect(onApplyResolve).toHaveBeenCalledWith([
    expect.objectContaining({ id: mi13Item.id, action: "rename" }),
  ]));
});
it("single-action item is auto-bound into the Approve payload (no radio, still a choice)", async () => {
  const onApplyResolve = vi.fn().mockResolvedValue(true);
  render(<Step3ReviewModal {...baseProps} resolution={resWith([mi6Item], { onApplyResolve })} />);
  fireEvent.click(screen.getByRole("button", { name: /approve & apply/i }));
  await waitFor(() => expect(onApplyResolve).toHaveBeenCalledWith([
    expect.objectContaining({ id: mi6Item.id, action: "apply" }),
  ]));
});
it("Ignore this sheet calls onIgnore (wizard discard kind: permanent_ignore)", async () => {
  const onIgnore = vi.fn().mockResolvedValue(true);
  render(<Step3ReviewModal {...baseProps} resolution={resWith([mi6Item], { onIgnore })} />);
  fireEvent.click(screen.getByRole("button", { name: /ignore this sheet/i }));
  await waitFor(() => expect(onIgnore).toHaveBeenCalledTimes(1));
});
```
  (The `onApplyResolve`/`onIgnore` → route wiring itself is proven in Task 2.3, which mocks `fetch` and asserts the URL + body `{ stagedId, reviewerChoicesVersion: 1, reviewerChoices }` for apply and `{ sourceScope:"wizard", variant:"permanent_ignore" }` for discard.)

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement** the `resolution` branch in `Step3ReviewModal`:
  - Body: map `triggeredReviewItems` by `tierForItem` — tier-1 → header subline (via `describeItem`); tier-2 → `describeItem` line anchored to the item's section in the existing section panels; tier-3 → forced-unset radio group (options from `allowedActionsFor`, labels from `actionLabel`, `isWizardMode=true`). Reuse the choice-state machine pattern from `StagedReviewCard:316+` (single-action items auto-bind their sole action; multi-action start unset).
  - Footer: `Approve & apply` (primary, disabled while any tier-3 item unset OR `reviewItemsCorrupt` OR `isPublishRunActive`) calling `onApplyResolve(choices)`; `RescanSheetButton` (Re-scan) disabled additionally by `isPublishRunActive`; `Ignore this sheet` calling `onIgnore()` disabled by `isPublishRunActive`. On apply/ignore error keep the modal open with an `ErrorExplainer` note (invariant 5).
  - Copy: "Approve & apply", "Re-scan this sheet", "Ignore this sheet" + subline "Removed from this setup." (no em dashes).

- [ ] **Step 4: Run — verify pass.** - [ ] **Step 5: Typecheck.**

- [ ] **Step 6: Commit**
```bash
git add components/admin/wizard/Step3ReviewModal.tsx components/admin/RescanSheetButton.tsx tests/components/admin/wizard/Step3ReviewModalResolution.test.tsx
git commit --no-verify -m "feat(admin): fold re-apply resolution into Step3ReviewModal + RescanSheetButton disabled prop (spec §4.4)"
```

---

### Task 2.3: `Review →` on re-apply rows + null-parse inline fallback (spec §4.2.1, §4.4 guard)

Wire the row: a `needs_review_reapply` row shows `Review →` (opens the modal with `resolution`); a `needs_review_no_details` row shows the inline `Re-scan`/`Ignore` recovery (no modal, no Approve, no deleted-page link); `needs_review_other` rows keep their existing inline controls untouched.

**Files:**
- Modify: `components/admin/wizard/Step3Review.tsx` (row → `Review →` / inline recovery)
- Modify: `components/admin/wizard/Step3SheetCard.tsx:292-315` (null-parse recovery: drop the `/admin/onboarding/staged/` link, add inline `Ignore this sheet`)
- Test: `tests/components/admin/wizard/Step3ReviewModalResolution.test.tsx` (row-level cases)

- [ ] **Step 1: Write the failing test**:
  - a `needs_review_reapply` row renders `Review →`; clicking opens the modal with `resolution`.
  - a `needs_review_no_details` row renders `Re-scan this sheet` + `Ignore this sheet`, NO `Review →`, and NO anchor with href starting `/admin/onboarding/staged/`.
  - a `needs_review_other` (`hard_failed`) row renders its existing inline controls and NO `Review →`.
  - **route-wiring (HIGH plan-R2)** — with `fetch` mocked: opening the modal + Approve POSTs the wizard apply route with body `{ stagedId, reviewerChoicesVersion: 1, reviewerChoices }`; `Ignore this sheet` POSTs the wizard `discard` route with `{ sourceScope: "wizard", variant: "permanent_ignore", stagedId, wizardSessionId }`; assert the exact URL + body, not just that fetch was called.

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement** — in the row renderer, switch on `row.displayState`: `needs_review_reapply` → `Review →` button opening the modal (wire `onApplyResolve`→wizard apply route, `onRescan`→RescanSheetButton, `onIgnore`→discard route `permanent_ignore`); `needs_review_no_details` → inline recovery (reuse `Step3SheetCard`'s no-details block, minus the link, plus `Ignore this sheet`); `needs_review_other` → unchanged inline controls. In `Step3SheetCard:311-312` replace `RescanReviewBanner`'s reapply-page link with the inline `Re-scan`/`Ignore` pair.

- [ ] **Step 4: Run — verify pass.** - [ ] **Step 5: Typecheck.**

- [ ] **Step 6: Commit**
```bash
git add components/admin/wizard/Step3Review.tsx components/admin/wizard/Step3SheetCard.tsx tests/components/admin/wizard/Step3ReviewModalResolution.test.tsx
git commit --no-verify -m "feat(admin): Review→ on re-apply rows + null-parse inline fallback (spec §4.2.1/§4.4)"
```

---

### Task 2.4: `isPublishRunActive` thread + full active-run freeze (spec §4.4 R8)

While a publish/resume run is active, freeze EVERY row mutator: publish checkbox, row Re-scan, inline blocking controls, `Review →`, and the modal's Approve/Re-scan/Ignore.

**Files:**
- Modify: `components/admin/wizard/Step3ReviewWithFinalize.tsx` (pass `isPublishRunActive={run.isRunning}` into `Step3Review`)
- Modify: `components/admin/wizard/Step3Review.tsx` (thread to each row) + `Step3SheetCard.tsx` (gate `PublishCheckbox`, row `RescanSheetButton`, inline controls)
- Test: `tests/components/admin/wizard/Step3ActiveRunFreeze.test.tsx`

(`RescanSheetButtonProps.disabled` was added in Task 2.2 — the row Re-scan here just passes `disabled={isPublishRunActive}`.)

**Interfaces:**
- Produces: `Step3ReviewProps` + `Step3Row` renderers accept `isPublishRunActive: boolean`; `PublishCheckbox` gains `disabled?: boolean`. (`RescanSheetButtonProps.disabled` already exists from Task 2.2.)

- [ ] **Step 1: Write the failing test** — with `isPublishRunActive` true, assert EACH is disabled: publish checkbox, row `Re-scan this sheet`, an inline `HardFailedActions`/`ManifestIgnoreAction` control, row `Review →`, and (open modal) Approve / Re-scan / Ignore.

- [ ] **Step 2: Run — verify fail.**

- [ ] **Step 3: Implement** — add `disabled?: boolean` to `PublishCheckbox` (`Step3SheetCard.tsx:79/:501`); gate the row `RescanSheetButton` (via its `disabled` prop from Task 2.2), the `PublishCheckbox`, the Select-all control (`:547`), and the inline controls on `isPublishRunActive`; pass `isPublishRunActive` into the modal `resolution` (already consumed in Task 2.2). Thread the prop from `Step3ReviewWithFinalize` (`run.isRunning`, `:113`) → `Step3Review` → each `Step3SheetCard`.

- [ ] **Step 4: Run — verify pass.** - [ ] **Step 5: Typecheck.**

- [ ] **Step 6: Commit**
```bash
git add components/admin/wizard/Step3ReviewWithFinalize.tsx components/admin/wizard/Step3Review.tsx components/admin/wizard/Step3SheetCard.tsx tests/components/admin/wizard/Step3ActiveRunFreeze.test.tsx
git commit --no-verify -m "feat(admin): freeze all step-3 row mutators during an active publish run (spec §4.4 R8)"
```
