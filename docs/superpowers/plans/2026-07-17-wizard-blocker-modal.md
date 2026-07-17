# Wizard Blocker Modal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Move the wizard step-3 finalize terminal blocker/error panels (`race_row`, `cas_per_row`, `error`) out of the inline footer-center slot and into a portaled modal dialog, eliminating the sticky-footer layout shift Doug flagged; `complete` stays inline.

**Architecture:** Single-lever refactor of `FinalizeStatusRegion` (`components/admin/FinalizeButton.tsx`) — the one component both consumers (combined `<FinalizeButton>` and the production `Step3FooterCenter`) route through. It delegates the three blocker/error states to a new co-located `FinalizeBlockerModal` (portaled to `document.body`, `role="dialog" aria-modal`, background-inert, `useDialogFocus`, capture-phase Escape), while rendering `complete` inline unchanged. `useFinalizeRun` gains one method: `dismiss()` (reset-to-idle).

**Tech Stack:** Next.js 16, React 19, Tailwind v4, Vitest + React Testing Library (jsdom) for component tests, Playwright for the real-browser layout assertion.

**Spec:** `docs/superpowers/specs/2026-07-17-wizard-blocker-modal-design.md` (APPROVED, 5 adversarial rounds). Every task cites its spec section.

## Global Constraints

- **AGENTS.md invariant 5 (no raw error codes in UI):** all copy routes through `lookupDougFacing`/`messageFor`; `HelpAffordance` unchanged. Rescoped invariant-5 negatives must stay non-vacuous (Task 7).
- **AGENTS.md invariant 8 (impeccable dual-gate):** UI surface — `/impeccable critique` + `/impeccable audit` on the diff; P0/P1 fixed or `DEFERRED.md` before cross-model review (Task 9).
- **AGENTS.md invariant 6 (commit per task):** conventional commits, one task per commit, `--no-verify` (shared hooks live in the main checkout).
- **DESIGN.md token rule:** entrance uses `var(--duration-normal)` + `var(--ease-out-quart)`, never a hardcoded ms literal. Reduced-motion: `motion-reduce:animate-none`.
- **Preserve testids:** `wizard-finalize-race-row`, `wizard-finalize-cas-per-row`, `wizard-finalize-error`, `wizard-finalize-reapply-<dfid>`, `wizard-finalize-publish-complete`. New: `wizard-finalize-blocker-modal`, `wizard-finalize-blocker-backdrop`, `wizard-finalize-blocker-dismiss`.
- **Meta-test inventory:** creates NONE. Extends `tests/components/admin/wizard/Step3TransitionAudit.test.tsx` (modal enter/exit rows) and updates `tests/components/admin/FinalizeButton.test.tsx` (focus assertions + invariant-5 rescope). No `pg_advisory*` / Supabase / admin-alert / migration surface → no advisory-lock topology, no DB parity.
- **Test command:** `pnpm vitest run <path>` (jsdom). Playwright: `pnpm test:e2e <spec>` (Task 8 confirms the exact runner during implementation).

---

## File Structure

- **Modify** `components/admin/FinalizeButton.tsx`:
  - `useFinalizeRun` — add `dismiss()` to state + return (Task 1).
  - `FinalizeStatusRegion` — delegate `race_row`/`cas_per_row`/`error` to `<FinalizeBlockerModal>`; keep `complete` inline; drop the `alertRef` focus effect (Task 2).
  - Add co-located `FinalizeBlockerModal` component (Tasks 2–5). Co-located (not a new file) because it consumes module-private helpers `lookupDougFacing`, `GENERIC_ERROR`, `RESCANNABLE_CAS_CODES` and the `FinalizeRun` type — matching how `ProgressPanel` and `FinalizeSoftConfirm` are already co-located.
- **Modify** `tests/components/admin/FinalizeButton.test.tsx`: focus-assertion updates (Task 5), invariant-5 `container.textContent` → panel rescope (Task 7), error-retry path (Task 7).
- **Create/Modify** `tests/components/admin/FinalizeBlockerModal.test.tsx`: new behavioral tests (Tasks 2–5) — dialog semantics, dismiss matrix, compound, race guard.
- **Modify** `tests/components/admin/wizard/Step3TransitionAudit.test.tsx`: modal transition-audit rows (Task 6).
- **Create** `tests/e2e/wizard-blocker-modal.layout.spec.ts`: real-browser layout (Task 8).

---

## Task 1: `dismiss()` on `useFinalizeRun`

**Spec:** §4.3. **Files:** Modify `components/admin/FinalizeButton.tsx`; Test `tests/components/admin/FinalizeBlockerModal.test.tsx`.

**Interfaces — Produces:** `FinalizeRun.dismiss: () => void` (sets `state` to `{ kind: "idle" }`).

- [ ] **Step 1 — failing test** (a tiny harness that uses the hook and exposes `dismiss` + current kind):

```tsx
// tests/components/admin/FinalizeBlockerModal.test.tsx (new file)
import { render, act } from "@testing-library/react";
import { useFinalizeRun } from "@/components/admin/FinalizeButton";

function DismissProbe() {
  const run = useFinalizeRun({ wizardSessionId: "s1" });
  // expose via data attributes
  return (
    <div
      data-kind={run.state.kind}
      data-has-dismiss={typeof run.dismiss === "function" ? "yes" : "no"}
    >
      <button data-testid="force-error" onClick={() => run.dismiss()}>x</button>
    </div>
  );
}

test("useFinalizeRun exposes dismiss() that resets to idle", () => {
  const { getByTestId, container } = render(<DismissProbe />);
  expect(container.firstChild).toHaveAttribute("data-has-dismiss", "yes");
  // idle → dismiss stays idle (no throw); real error→idle path is covered behaviorally in Task 3.
  act(() => { getByTestId("force-error").click(); });
  expect(container.firstChild).toHaveAttribute("data-kind", "idle");
});
```

- [ ] **Step 2 — run, expect FAIL** (`dismiss` undefined): `pnpm vitest run tests/components/admin/FinalizeBlockerModal.test.tsx`
- [ ] **Step 3 — implement:** in `useFinalizeRun`, add nothing to state machine except the setter, and add to the returned object:

```ts
// inside useFinalizeRun return { ... }
dismiss: () => setState({ kind: "idle" }),
```

- [ ] **Step 4 — run, expect PASS.**
- [ ] **Step 5 — commit:** `git commit --no-verify -am "feat(admin): add dismiss() reset-to-idle to useFinalizeRun"`

---

## Task 2: `FinalizeBlockerModal` shell + delegation (error + blocking bodies, complete stays inline)

**Spec:** §4.1, §4.2, §6. **Files:** Modify `components/admin/FinalizeButton.tsx`; Test `tests/components/admin/FinalizeBlockerModal.test.tsx`, `tests/components/admin/FinalizeButton.test.tsx`.

**Interfaces — Consumes:** `FinalizeRun` (with `dismiss` from Task 1). **Produces:** `FinalizeBlockerModal({ run }: { run: FinalizeRun })`.

Design of the component (implemented incrementally across Tasks 2–5; Task 2 lands the shell + all three bodies + delegation, with dismiss wired only enough to render):

- Returns `null` unless `run.state.kind ∈ {race_row, cas_per_row, error}` OR `!useHasMounted()`.
- `createPortal(<overlay/>, document.body)`.
- Overlay: `<div role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="wizard-finalize-blocker-modal" className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">`.
- Backdrop: for `error` an interactive `<button aria-label="Close" tabIndex={-1} data-testid="wizard-finalize-blocker-backdrop" onClick={dismiss} className="absolute inset-0 bg-overlay-scrim …scrim-in animate…">`; for blocking a non-interactive `<div aria-hidden="true" data-testid="wizard-finalize-blocker-backdrop" className="absolute inset-0 bg-overlay-scrim …">` (Task 3 hardens this split; Task 2 may start with the interactive form and Task 3 differentiates — but land the state-conditional in Task 2 to keep the a11y contract atomic).
- Panel: `<div ref={panelRef} className="relative flex w-full max-w-md flex-col items-stretch gap-3 rounded-t-md bg-bg p-tile-pad text-text shadow-(--shadow-tile) sm:max-w-md sm:rounded-md motion-safe:animate-[sheet-rise_var(--duration-normal)_var(--ease-out-quart)] motion-reduce:animate-none">`.
- Bodies keep the EXACT existing markup + testids moved verbatim from `FinalizeStatusRegion` (`FinalizeButton.tsx:586-671`): the race_row `<ul>` with re-apply `<Link>`s, the cas_per_row `<ul>` with `RescanSheetButton`/`BlockedRowResolver`+`HelpAffordance`, the error `<p>{renderEmphasis(copy)}</p>` + `HelpAffordance`. Promote each state's primary line to `<h2 id={titleId}>` (race/cas) or give the error `<p>` the `titleId` (§6).
- Each body ends with the dismiss control: `error` → Close button (`wizard-finalize-blocker-dismiss`, "Close"); blocking → **Back** button (`wizard-finalize-blocker-dismiss`, "Back") calling `dismiss`.

- [ ] **Step 1 — failing tests** (dialog semantics + delegation + complete-inline):

```tsx
// FinalizeBlockerModal.test.tsx — drive states via the combined <FinalizeButton> harness + mocked fetch
// (reuse the fetch-mock helpers already in FinalizeButton.test.tsx: import or replicate a minimal streamFinalize mock)
test("error state renders a role=dialog with aria-modal and the copy as accessible name", async () => {
  // arrange fetch to return an ok:false finalize error; click publish; then:
  const dialog = await screen.findByTestId("wizard-finalize-blocker-modal");
  expect(dialog).toHaveAttribute("role", "dialog");
  expect(dialog).toHaveAttribute("aria-modal", "true");
  const labelId = dialog.getAttribute("aria-labelledby")!;
  expect(document.getElementById(labelId)!.textContent).toBeTruthy();
  expect(screen.getByTestId("wizard-finalize-error")).toBeInTheDocument();
});

test("complete state stays INLINE (no dialog)", async () => {
  // drive to complete; then:
  expect(screen.getByTestId("wizard-finalize-publish-complete")).toBeInTheDocument();
  expect(screen.queryByTestId("wizard-finalize-blocker-modal")).toBeNull();
});
```

- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement** `FinalizeBlockerModal`, refactor `FinalizeStatusRegion` to `return (<>{state.kind === "complete" ? <inline note/> : null}<FinalizeBlockerModal run={run} /></>)` and delete the inline race_row/cas_per_row/error branches + the `alertRef`/`isAlert` effect. Import `createPortal` from `react-dom`, `useHasMounted` from `@/lib/a11y/useHasMounted`, `useDialogFocus` from `@/lib/a11y/dialogFocus` (wiring completed in Tasks 3/5; Task 2 wires `useDialogFocus(panelRef, dismissRef)` + body-scroll-lock so the shell is a real modal).
- [ ] **Step 4 — run new tests + the full `FinalizeButton.test.tsx`; expect the new tests PASS and note which legacy tests now fail (focus at :1298, invariant-5 negatives) — those are addressed in Tasks 5/7. If a legacy test fails ONLY on focus/container-scope, it is expected; do not fix inline here.** Run: `pnpm vitest run tests/components/admin/FinalizeBlockerModal.test.tsx tests/components/admin/FinalizeButton.test.tsx`
- [ ] **Step 5 — commit:** `git commit --no-verify -am "feat(admin): render finalize blocker/error states in a portaled modal, keep complete inline"`

---

## Task 3: Dismiss matrix — error dismissible, blocking action-only + non-interactive backdrop, capture-phase Escape

**Spec:** §5, §6, §7. **Files:** Modify `components/admin/FinalizeButton.tsx`; Test `FinalizeBlockerModal.test.tsx`.

- [ ] **Step 1 — failing tests:**

```tsx
test("error: Escape, backdrop click, and Close all dismiss to idle", async () => {
  // drive to error
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByTestId("wizard-finalize-blocker-modal")).toBeNull());
  // re-drive to error; backdrop click
  fireEvent.click(screen.getByTestId("wizard-finalize-blocker-backdrop"));
  await waitFor(() => expect(screen.queryByTestId("wizard-finalize-blocker-modal")).toBeNull());
  // re-drive; Close button
  fireEvent.click(screen.getByTestId("wizard-finalize-blocker-dismiss"));
  await waitFor(() => expect(screen.queryByTestId("wizard-finalize-blocker-modal")).toBeNull());
});

test("cas_per_row: Escape + backdrop are INERT; only Back dismisses; backdrop exposes no button role", async () => {
  // drive to cas_per_row
  const backdrop = screen.getByTestId("wizard-finalize-blocker-backdrop");
  expect(backdrop.tagName).toBe("DIV");
  expect(backdrop).toHaveAttribute("aria-hidden", "true");
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.click(backdrop);
  expect(screen.getByTestId("wizard-finalize-blocker-modal")).toBeInTheDocument(); // still open
  fireEvent.click(screen.getByTestId("wizard-finalize-blocker-dismiss")); // Back
  await waitFor(() => expect(screen.queryByTestId("wizard-finalize-blocker-modal")).toBeNull());
});
```

- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement:**
  - `const dismissible = state.kind === "error";`
  - Backdrop: `dismissible ? <button …onClick={dismiss}/> : <div aria-hidden="true" …/>`.
  - Escape: `useEffect` adding a **capture-phase** `document` keydown listener: `if (e.key !== "Escape") return; e.preventDefault(); e.stopImmediatePropagation(); if (dismissibleRef.current) run.dismiss();` with `addEventListener("keydown", h, true)` / `removeEventListener(..., true)`. Use a `dismissibleRef` synced to `dismissible` so the stable listener reads the current value.
  - Dismiss control label: `dismissible ? "Close" : "Back"`.
- [ ] **Step 4 — run, expect PASS** (+ the Task 2 tests still green).
- [ ] **Step 5 — commit:** `git commit --no-verify -am "feat(admin): blocker modal dismiss matrix — error dismissible, blocking action-only + Back"`

---

## Task 4: `dismissedRef` guard on `BlockedRowResolver.onResolved`

**Spec:** §4.3, §10.13. **Files:** Modify `components/admin/FinalizeButton.tsx`; Test `FinalizeBlockerModal.test.tsx`.

- [ ] **Step 1 — failing test** (deferred resolver fetch, Back mid-flight, then resolve):

```tsx
test("Back during a pending resolver request suppresses the late runLoop (no finalize restart)", async () => {
  let resolveFetch: (v: unknown) => void;
  const deferred = new Promise((r) => { resolveFetch = r; });
  const fetchSpy = vi.fn((url: string) => {
    if (url.includes("resolve-blocker")) return deferred; // hang
    return Promise.resolve(new Response(JSON.stringify({ ok: false, code: "X" })));
  });
  vi.stubGlobal("fetch", fetchSpy);
  // drive to cas_per_row (non-rescannable code with a BlockedRowResolver action)
  fireEvent.click(screen.getByTestId(/resolve-blocker-action/)); // resolver click → fetch pending
  fireEvent.click(screen.getByTestId("wizard-finalize-blocker-dismiss")); // Back → idle
  await act(async () => { resolveFetch!(new Response(JSON.stringify({ ok: true }))); });
  // assert NO /finalize POST fired after dismissal
  expect(fetchSpy.mock.calls.some(([u]) => String(u).includes("/api/admin/onboarding/finalize"))).toBe(false);
  expect(screen.queryByTestId("wizard-finalize-blocker-modal")).toBeNull();
});
```

- [ ] **Step 2 — run, expect FAIL** (late `onResolved` restarts the loop).
- [ ] **Step 3 — implement:** in `FinalizeBlockerModal`, `const dismissedRef = useRef(false);` (per mount). The Back/dismiss handler sets `dismissedRef.current = true` BEFORE calling `run.dismiss()`. The cas_per_row `BlockedRowResolver` callsite becomes `onResolved={() => { if (!dismissedRef.current) void run.runLoop(); }}`.
- [ ] **Step 4 — run, expect PASS.**
- [ ] **Step 5 — commit:** `git commit --no-verify -am "fix(admin): guard blocker resolver onResolved against a late resolve after dismiss"`

---

## Task 5: Focus + Tab-trap + background-inert + compound stacking

**Spec:** §6, §7a. **Files:** Modify `components/admin/FinalizeButton.tsx`, `tests/components/admin/FinalizeButton.test.tsx`; Test `FinalizeBlockerModal.test.tsx`.

- [ ] **Step 1 — failing tests:**

```tsx
test("on open focus lands on the dismiss control; Tab cycles within the modal", async () => {
  // offsetParent stub so useDialogFocus's visibility filter works in jsdom (pattern: Step3ReviewModal.test.tsx:403-429)
  Object.defineProperty(HTMLElement.prototype, "offsetParent", { configurable: true, get() { return this.parentNode; } });
  // drive to race_row (multi-control: re-apply links + Back)
  await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("wizard-finalize-blocker-dismiss")));
  // Tab from last → first, Shift+Tab from first → last (assert focus wraps)
});

test("compound: review modal open + blocker fires → single exposed root, Escape keeps review open, focus restores into review on close", async () => {
  // render Step3ReviewWithFinalize with a card; open Step3ReviewModal; drive finalize to cas_per_row
  const review = screen.getByRole("dialog", { name: /review/i }); // the review modal
  // blocker mounted:
  expect(screen.getByTestId("wizard-finalize-blocker-modal")).toBeInTheDocument();
  expect(review).toHaveAttribute("aria-hidden", "true"); // background inert while blocker open
  fireEvent.keyDown(document, { key: "Escape" });
  expect(review).toBeInTheDocument(); // NOT closed (blocking Escape inert + stopImmediatePropagation)
  fireEvent.click(screen.getByTestId("wizard-finalize-blocker-dismiss")); // Back
  await waitFor(() => expect(screen.queryByTestId("wizard-finalize-blocker-modal")).toBeNull());
  expect(review).not.toHaveAttribute("aria-hidden");
  expect(review.contains(document.activeElement)).toBe(true); // focus continuity
});

test("error focus assertion (updated): activeElement is the dismiss control, not the error region", async () => {
  // supersedes FinalizeButton.test.tsx:1298
});
```

- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement:**
  - `const panelRef = useRef<HTMLDivElement>(null); const dismissRef = useRef<HTMLButtonElement>(null);` `useDialogFocus(panelRef, dismissRef);` (put the ref on the Close/Back button).
  - Background-inert effect, declared **AFTER** `useDialogFocus` (so its cleanup un-inerts before `useDialogFocus` restores focus): on mount, for each `document.body` child that is NOT the portal container, record prior `inert`/`aria-hidden` then set `inert=""` + `aria-hidden="true"`; on cleanup restore. Gate the whole effect on the modal being mounted (only runs while a blocker state is active).
  - Update `FinalizeButton.test.tsx:1298` and any race_row/cas_per_row focus assertion to target `wizard-finalize-blocker-dismiss`.
- [ ] **Step 4 — run:** `pnpm vitest run tests/components/admin/FinalizeBlockerModal.test.tsx tests/components/admin/FinalizeButton.test.tsx` — expect the new + updated tests PASS.
- [ ] **Step 5 — commit:** `git commit --no-verify -am "feat(admin): blocker modal focus trap + background-inert single-root + compound stacking"`

---

## Task 6: Transition audit (scrim + panel entrance, keyframe grep guard)

**Spec:** §7, §10.8. **Files:** Modify `tests/components/admin/wizard/Step3TransitionAudit.test.tsx`.

- [ ] **Step 1 — failing test:** assert the panel carries `sheet-rise` + `motion-reduce:animate-none`; the scrim carries `step3-details-scrim-in` + `motion-reduce:animate-none`; both keyframe names EXIST in `app/globals.css` (read the file, assert `@keyframes sheet-rise` and `@keyframes step3-details-scrim-in` present); no exit-animation class on the panel.
- [ ] **Step 2 — run, expect FAIL** (if any class/keyframe missing).
- [ ] **Step 3 — implement:** ensure the classes are present in `FinalizeBlockerModal` (from Task 2); add the audit assertions.
- [ ] **Step 4 — run, expect PASS.**
- [ ] **Step 5 — commit:** `git commit --no-verify -am "test(admin): transition-audit rows for the finalize blocker modal entrance"`

---

## Task 7: Invariant-5 negative rescope + error-retry path

**Spec:** §9, §10.10, §10.12. **Files:** Modify `tests/components/admin/FinalizeButton.test.tsx`.

- [ ] **Step 1 — failing/red state:** the portal moved the panels out of `container`; the `container.textContent` raw-code negatives at `:478, 575-576` (and analogous `607-620, 649-662, 1109-1118, 1126-1140, 1153-1167, 1211-1218`) are now vacuous. Rewrite each to `getByTestId("wizard-finalize-<state>").textContent`. Add a non-vacuity guard: assert the panel textContent is non-empty in the same test. Update the error-retry test at `:1221-1243` to dismiss-then-retry.
- [ ] **Step 2 — run:** `pnpm vitest run tests/components/admin/FinalizeButton.test.tsx` — before rewrite, temporarily inject a raw code into the panel to confirm the OLD `container` negative passes vacuously (proving the gap), then rewrite and confirm the NEW panel negative FAILS on that injection (proving teeth). Remove the injection.
- [ ] **Step 3 — implement the rescope.**
- [ ] **Step 4 — run, expect all PASS.**
- [ ] **Step 5 — commit:** `git commit --no-verify -am "test(admin): rescope finalize invariant-5 negatives to the portaled panel, update error-retry path"`

---

## Task 8: Real-browser layout assertion (Playwright)

**Spec:** §8, §10.7. **Files:** Create `tests/e2e/wizard-blocker-modal.layout.spec.ts` (mirror the existing `tests/e2e/step3-review-page.layout.spec.ts` harness/runner).

- [ ] **Step 1 — failing test:** render `FinalizeStatusRegion`/`Step3ReviewWithFinalize` in a real `WizardFooter`, drive to `cas_per_row`. Assert: (a) `wizard-footer-inner` `getBoundingClientRect().height` is unchanged (±0.5px) idle→blocker (no layout shift); (b) the panel rect is within `[0, innerHeight+0.5]`; (c) `document.elementFromPoint(panelCenterX, panelCenterY)` is inside `wizard-finalize-blocker-modal`, including with a `Step3ReviewModal` open (top-of-stack). Bounds from `window.innerHeight`.
- [ ] **Step 2 — run, expect FAIL** (until the harness renders the modal).
- [ ] **Step 3 — implement the harness/mount** (reuse the standalone real-browser layout harness pattern already in the repo; confirm the exact runner from `step3-review-page.layout.spec.ts`).
- [ ] **Step 4 — run, expect PASS.**
- [ ] **Step 5 — commit:** `git commit --no-verify -am "test(admin): real-browser layout — blocker modal viewport-pinned, no footer shift"`

---

## Task 9: Impeccable dual-gate + close-out

**Spec:** invariant 8. **Files:** possibly `DEFERRED.md`.

- [ ] **Step 1:** run `/impeccable critique` on the diff (context.mjs already loaded this session; register = product). Record findings.
- [ ] **Step 2:** run `/impeccable audit` on the diff. Record findings.
- [ ] **Step 3:** fix every P0/P1, or defer with a `DEFERRED.md` entry citing the reason. Re-run until clean.
- [ ] **Step 4:** run the full suite `pnpm test` (scoped gates miss regressions — full run before push) + `pnpm typecheck` + `pnpm lint` + `pnpm format:check`.
- [ ] **Step 5 — commit** any fixes: `git commit --no-verify -am "fix(admin): impeccable P0/P1 fixes for the blocker modal"`

---

## Self-Review (run before adversarial review)

1. **Spec coverage:** §4.1/§4.2 → Task 2; §4.3 → Tasks 1/4; §5/§6 → Tasks 2/3/5; §7 → Task 6; §7a → Task 5; §8 → Task 8; §9 → Tasks 5/7; §10.1–.13 → mapped (dismiss T1, dialog T2, dismiss-matrix T3, resolve/rescan T2+T4, dialog-semantics T2, focus/trap T5, layout T8, transition T6, complete-inline T2, testid T2/T7, compound T5, invariant-5 T7, race T4); §11 → meta declared; §12/§13 → constraints. No gap.
2. **Placeholder scan:** every code step carries real code or a precise instruction. No TBD.
3. **Type consistency:** `dismiss` (T1) used identically in T3/T4/T5; `FinalizeBlockerModal({ run })` stable; testids stable.
</content>
