# Wizard Blocker Modal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Move the wizard step-3 finalize terminal blocker/error panels (`race_row`, `cas_per_row`, `error`) out of the inline footer-center slot into a portaled modal dialog, eliminating the sticky-footer layout shift Doug flagged; `complete` stays inline.

**Architecture:** Single-lever refactor of `FinalizeStatusRegion` (`components/admin/FinalizeButton.tsx`) — the one component both consumers (combined `<FinalizeButton>` and the production `Step3FooterCenter`) route through. It delegates the three blocker/error states to a new co-located `FinalizeBlockerModal` (portaled to `document.body`, `role="dialog" aria-modal`, background-inert, `useDialogFocus`, capture-phase Escape), while rendering `complete` inline unchanged. `useFinalizeRun` gains one method: `dismiss()`.

**Tech Stack:** Next.js 16, React 19, Tailwind v4, Vitest + React Testing Library (jsdom), Playwright (standalone live-esbuild harness) for the real-browser layout assertion.

**Spec:** `docs/superpowers/specs/2026-07-17-wizard-blocker-modal-design.md` (APPROVED, 5 adversarial rounds).

## Global Constraints

- **Invariant 5 (no raw error codes):** copy routes through `lookupDougFacing`/`messageFor`; `HelpAffordance` unchanged. Rescoped invariant-5 negatives stay non-vacuous.
- **Invariant 8 (impeccable dual-gate):** `/impeccable critique` + `/impeccable audit` on the diff; P0/P1 fixed or `DEFERRED.md` before cross-model review (Task 8).
- **Invariant 6 + green-per-commit:** conventional commits, one task per commit, `--no-verify`. **Every commit's tree is green** — a task that breaks legacy tests updates them to the new contract IN THE SAME COMMIT (Task 2 is the atomic refactor; that is why it is the largest).
- **DESIGN.md token rule:** entrance uses `var(--duration-normal)` + `var(--ease-out-quart)`, never a hardcoded ms literal. Reduced-motion: `motion-reduce:animate-none`.
- **No framer-motion in `FinalizeButton.tsx`:** the six-shell-files guard (`step3Page.transitions.test.tsx:49-68`) asserts `FinalizeButton.tsx` never imports `framer-motion`/`AnimatePresence`. The modal entrance is CSS keyframes only (`animate-[…]`) — do NOT reach for framer. Instant unmount (no exit animation) keeps this clean.
- **Testids preserved:** `wizard-finalize-race-row`, `wizard-finalize-cas-per-row`, `wizard-finalize-error`, `wizard-finalize-reapply-<dfid>`, `wizard-finalize-publish-complete`. New: `wizard-finalize-blocker-modal` (overlay root), `wizard-finalize-blocker-panel` (the sheet/panel), `wizard-finalize-blocker-backdrop`, `wizard-finalize-blocker-dismiss`.
- **Meta-test inventory:** creates NONE. Extends `Step3TransitionAudit.test.tsx`; updates `FinalizeButton.test.tsx` (focus + invariant-5 rescope + error-retry path). No `pg_advisory*`/Supabase/admin-alert/migration → no advisory-lock topology, no DB parity.
- **Commands:** `pnpm vitest run <path>`; Playwright `node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts <spec>`; close-out `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`.

## Shared test recipes (used verbatim in the tasks below — cited from live tests)

```ts
// next/navigation mock — REQUIRED in any file that renders useFinalizeRun (it calls useRouter, FinalizeButton.tsx:168)
const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: vi.fn() }),
  usePathname: () => "/",
}));

// fetch mock (mirrors tests/components/admin/FinalizeButton.test.tsx:33-42)
const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); refreshMock.mockReset(); });
function mockJsonResponse(body: unknown, init: { status?: number } = {}) {
  return { ok: (init.status ?? 200) < 400, status: init.status ?? 200, json: async () => body } as unknown as Response;
}
const WSID = "11111111-1111-1111-1111-111111111111";

// DRIVE-TO-STATE recipes (each: queue fetch, render <FinalizeButton wizardSessionId={WSID}/>, click "wizard-finalize-button"):
// → error       (FinalizeButton.test.tsx:463-478):
fetchMock.mockResolvedValueOnce(mockJsonResponse({ ok: false, code: "ONBOARDING_NOT_RESOLVED" }, { status: 409 }));
// → race_row    (FinalizeButton.test.tsx:424-441): a SINGLE /finalize returning all_batches_complete + a failed per_row
fetchMock.mockResolvedValueOnce(mockJsonResponse({
  status: "all_batches_complete", wizard_session_id: WSID, remaining_count: 0, unresolved_manifest_count: 1,
  per_row: [{ drive_file_id: "drive-failed-1", wizard_session_id: WSID,
    code: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE",
    re_apply_url: `/admin/onboarding/staged/${WSID}/drive-failed-1` }],
}));
// → cas_per_row w/ ACTIONABLE resolver (FinalizeButton.test.tsx:706-745): /finalize clean THEN /finalize-cas 409 SHOW_ARCHIVED_IMMUTABLE
fetchMock
  .mockResolvedValueOnce(mockJsonResponse({ status: "all_batches_complete", wizard_session_id: WSID, remaining_count: 0, unresolved_manifest_count: 0, per_row: [] }))
  .mockResolvedValueOnce(mockJsonResponse({ ok: false, code: "SHOW_ARCHIVED_IMMUTABLE",
    per_row: [{ drive_file_id: "drive-archived-1", code: "SHOW_ARCHIVED_IMMUTABLE" }] }, { status: 409 }));
// resolver control testid: `blocked-row-resolver-drive-archived-1`; it is TWO-TAP (arm, then confirm) → POST /api/admin/onboarding/resolve-blocker (BlockedRowResolver.tsx:186-198,210).
// review modal testid (compound tests): `wizard-step3-card-<dfid>-review-modal` (Step3ReviewModal.tsx:559).

// EXECUTABLE drive helpers (define once in FinalizeBlockerModal.test.tsx; every test calls one — no "drive to X" prose):
async function driveToError() {
  fetchMock.mockResolvedValueOnce(mockJsonResponse({ ok: false, code: "ONBOARDING_NOT_RESOLVED" }, { status: 409 }));
  const q = render(<FinalizeButton wizardSessionId={WSID} />);
  await act(async () => { fireEvent.click(q.getByTestId("wizard-finalize-button")); });
  await q.findByTestId("wizard-finalize-blocker-modal");
  return q;
}
async function driveToRaceRow() {
  fetchMock.mockResolvedValueOnce(mockJsonResponse({ status: "all_batches_complete", wizard_session_id: WSID, remaining_count: 0, unresolved_manifest_count: 1,
    per_row: [{ drive_file_id: "drive-failed-1", wizard_session_id: WSID, code: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE", re_apply_url: `/admin/onboarding/staged/${WSID}/drive-failed-1` }] }));
  const q = render(<FinalizeButton wizardSessionId={WSID} />);
  await act(async () => { fireEvent.click(q.getByTestId("wizard-finalize-button")); });
  await q.findByTestId("wizard-finalize-blocker-modal");
  return q;
}
async function driveToCasPerRow(code = "SHOW_ARCHIVED_IMMUTABLE", dfid = "drive-archived-1") {
  fetchMock
    .mockResolvedValueOnce(mockJsonResponse({ status: "all_batches_complete", wizard_session_id: WSID, remaining_count: 0, unresolved_manifest_count: 0, per_row: [] }))
    .mockResolvedValueOnce(mockJsonResponse({ ok: false, code, per_row: [{ drive_file_id: dfid, code }] }, { status: 409 }));
  const q = render(<FinalizeButton wizardSessionId={WSID} />);
  await act(async () => { fireEvent.click(q.getByTestId("wizard-finalize-button")); });
  await q.findByTestId("wizard-finalize-blocker-modal");
  return q;
}
async function driveToComplete() {
  fetchMock
    .mockResolvedValueOnce(mockJsonResponse({ status: "all_batches_complete", wizard_session_id: WSID, remaining_count: 0, unresolved_manifest_count: 0, per_row: [] }))
    .mockResolvedValueOnce(mockJsonResponse({ status: "finalize_complete", wizard_session_id: WSID, watched_folder_id: "folder-xyz" }));
  const q = render(<FinalizeButton wizardSessionId={WSID} />);
  await act(async () => { fireEvent.click(q.getByTestId("wizard-finalize-button")); });
  await q.findByTestId("wizard-finalize-publish-complete");
  return q;
}
// Rescannable cas_per_row (RescanSheetButton path): driveToCasPerRow("STAGED_PARSE_OUTDATED_AT_PHASE_D", "drive-outdated-1").

// Compound fixture — replicate the tiny stagedRow fixture (step3Page.transitions.test.tsx:36-40) locally:
function pr(title = "Txn Show") { return { show: { title }, warnings: [] } as unknown as ParseResult; }
function stagedRow(dfid: string, status: "staged" | "applied" = "staged") {
  return { driveFileId: dfid, driveFileName: `${dfid}.gsheet`, status, parseResult: pr(dfid) } as Step3Row;
}
// driveCompound — open Step3ReviewModal mid-run (deferred first /finalize), THEN resolve to the terminal:
async function driveCompound(kind: "cas_per_row" | "error") {
  let resolveFinalize!: (r: Response) => void;
  fetchMock.mockReturnValueOnce(new Promise<Response>((r) => { resolveFinalize = r; })); // 1st /finalize hangs
  const q = render(<Step3ReviewWithFinalize wizardSessionId={WSID} rows={[stagedRow("a", "applied")]} finishable initialPublishCount={1} initialUncheckedCleanCount={0} />);
  await act(async () => { fireEvent.click(q.getByTestId("wizard-finalize-button")); });
  await waitFor(() => expect(q.getByTestId("wizard-step3-tracking")).toBeTruthy());
  fireEvent.click(q.getByTestId("wizard-step3-card-a-more"));                 // open Step3ReviewModal mid-run
  const reviewModal = q.getByTestId("wizard-step3-card-a-review-modal");
  if (kind === "cas_per_row") {
    fetchMock.mockResolvedValueOnce(mockJsonResponse({ ok: false, code: "SHOW_ARCHIVED_IMMUTABLE", per_row: [{ drive_file_id: "drive-archived-1", code: "SHOW_ARCHIVED_IMMUTABLE" }] }, { status: 409 }));
    await act(async () => { resolveFinalize(mockJsonResponse({ status: "all_batches_complete", wizard_session_id: WSID, remaining_count: 0, unresolved_manifest_count: 0, per_row: [] })); });
  } else {
    await act(async () => { resolveFinalize(mockJsonResponse({ ok: false, code: "ONBOARDING_NOT_RESOLVED" }, { status: 409 })); });
  }
  await q.findByTestId("wizard-finalize-blocker-modal");
  return { q, reviewModal };
}
```

Entering `cas_per_row`/`error`/`race_row` ALREADY consumes finalize calls (`/finalize` and, for cas, `/finalize-cas`) — assertions about "no restart" must SNAPSHOT the `/finalize` call count and assert it is UNCHANGED after the late event, never assert zero.

---

## Task 1: `dismiss()` on `useFinalizeRun`

**Spec:** §4.3. **Files:** Modify `components/admin/FinalizeButton.tsx`; Create `tests/components/admin/FinalizeBlockerModal.test.tsx`.

**Produces:** `FinalizeRun.dismiss: () => void` → `setState({ kind: "idle" })`.

- [ ] **Step 1 — failing test** (NON-tautological — drive to a real terminal FIRST, then dismiss; include the next/navigation + fetch mocks from Shared recipes):

```tsx
function DismissProbe() {
  const run = useFinalizeRun({ wizardSessionId: WSID });
  return <div data-kind={run.state.kind}>
    <button data-testid="pub" onClick={run.onPrimaryClick}>publish</button>
    <button data-testid="dismiss" onClick={() => run.dismiss()}>dismiss</button>
  </div>;
}
test("dismiss() resets a TERMINAL state (error) back to idle", async () => {
  fetchMock.mockResolvedValueOnce(mockJsonResponse({ ok: false, code: "ONBOARDING_NOT_RESOLVED" }, { status: 409 }));
  const { getByTestId, container } = render(<DismissProbe />);
  await act(async () => { fireEvent.click(getByTestId("pub")); });
  await waitFor(() => expect(container.firstChild).toHaveAttribute("data-kind", "error")); // reached a real terminal
  act(() => { fireEvent.click(getByTestId("dismiss")); });
  expect(container.firstChild).toHaveAttribute("data-kind", "idle"); // a no-op dismiss would leave it 'error' → non-tautological
});
```

- [ ] **Step 2 — run, expect FAIL** (`dismiss` undefined → left on `error`): `pnpm vitest run tests/components/admin/FinalizeBlockerModal.test.tsx`
- [ ] **Step 3 — implement:** add to the `useFinalizeRun` return object: `dismiss: () => setState({ kind: "idle" }),`
- [ ] **Step 4 — run, expect PASS.**
- [ ] **Step 5 — commit** (new test file → `git add` explicitly, `-am` alone skips untracked files): `git add components/admin/FinalizeButton.tsx tests/components/admin/FinalizeBlockerModal.test.tsx && git commit --no-verify -m "feat(admin): add dismiss() reset-to-idle to useFinalizeRun"`

---

## Task 2: `FinalizeBlockerModal` + delegation (ATOMIC refactor — green at commit)

**Spec:** §4.1, §4.2, §6, §9. **Files:** Modify `components/admin/FinalizeButton.tsx`, `tests/components/admin/FinalizeButton.test.tsx`; add tests to `FinalizeBlockerModal.test.tsx`.

This task moves the three panels; the moment it does, the legacy focus + `container.textContent` assertions break — so it fixes them in the same commit (green-per-commit).

**Component — TWO parts (a hooks-safe split; a single self-gating component that also calls `useDialogFocus` would violate the Rules of Hooks — the inner dialog's hooks must run unconditionally only while mounted):**

`FinalizeBlockerModal({ run })` — OUTER gate, calls ONLY `useHasMounted()` (unconditional), then gates:
```tsx
export? function FinalizeBlockerModal({ run }: { run: FinalizeRun }) {   // NOT exported — module-private, exercised via FinalizeStatusRegion
  const mounted = useHasMounted();
  const active = run.state.kind === "race_row" || run.state.kind === "cas_per_row" || run.state.kind === "error";
  if (!mounted || !active) return null;
  return <FinalizeBlockerDialog run={run} state={run.state} />; // pass the narrowed terminal state
}
```

`FinalizeBlockerDialog({ run, state })` — INNER, mounted ONLY while active, so ALL dialog hooks run unconditionally on mount / clean up on unmount: `useRef`s (`panelRef`, `dismissRef`, `portalRef`, `dismissedRef`, `dismissibleRef`), `useDialogFocus(panelRef, dismissRef)`, the scroll-lock effect, the capture-Escape effect (Task 3), the background-inert effect (Task 5, declared AFTER `useDialogFocus`). Body:
- `const portalEl = useRef<HTMLDivElement | null>(null); if (portalEl.current === null) portalEl.current = document.createElement("div");` then `useEffect(() => { document.body.appendChild(portalEl.current!); return () => { portalEl.current!.remove(); }; }, []);` and `createPortal(<overlay/>, portalEl.current)`. (A dedicated portal node the inert effect can exclude by identity.)
- Overlay: `<div role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="wizard-finalize-blocker-modal" className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">`.
- Backdrop (state-conditional — §6): `error` → `<button aria-label="Close" tabIndex={-1} data-testid="wizard-finalize-blocker-backdrop" onClick={() => run.dismiss()} className="absolute inset-0 bg-overlay-scrim motion-safe:animate-[step3-details-scrim-in_var(--duration-normal)_ease-out] motion-reduce:animate-none"/>`; blocking → `<div aria-hidden="true" data-testid="wizard-finalize-blocker-backdrop" className="absolute inset-0 bg-overlay-scrim motion-safe:animate-[step3-details-scrim-in_var(--duration-normal)_ease-out] motion-reduce:animate-none"/>`.
- Panel: `<div ref={panelRef} data-testid="wizard-finalize-blocker-panel" className="relative flex max-h-[85vh] w-full max-w-md flex-col items-stretch gap-3 overflow-y-auto rounded-t-md bg-bg p-tile-pad text-text shadow-(--shadow-tile) sm:rounded-md motion-safe:animate-[sheet-rise_var(--duration-normal)_var(--ease-out-quart)] motion-reduce:animate-none">`. **`max-h-[85vh]` cap + `overflow-y-auto`** (spec §8 dimensional invariant — a multi-row blocker list scrolls WITHIN the capped panel, never overflows the viewport). **Distinct `wizard-finalize-blocker-panel` testid on the PANEL** (overlay root carries `wizard-finalize-blocker-modal`) so Task 7 measures the sheet, not the full-screen scrim overlay.
- Bodies: move the EXACT markup + testids from `FinalizeStatusRegion` (`FinalizeButton.tsx:586-671`) — race_row `<ul>` of re-apply `<Link>`s + `HelpAffordance`; cas_per_row `<ul>` with `RESCANNABLE_CAS_CODES.has(code) ? <RescanSheetButton driveFileId wizardSessionId/> : <BlockedRowResolver … onResolved={…}/>` + `HelpAffordance`; error `<p>{renderEmphasis(state.copy)}</p>` + `HelpAffordance`. Promote the primary line of each to `<h2 id={titleId} …>` (race/cas headings) or set `id={titleId}` on the error `<p>`.
- Dismiss control: `state.kind === "error"` → `<button data-testid="wizard-finalize-blocker-dismiss" ref={dismissRef} onClick={() => run.dismiss()}>Close</button>`; blocking → same testid, label `Back`, same handler. (Backdrop-inert-for-blocking, capture-Escape, dismissedRef guard, focus/inert are Tasks 3–5 — Task 2 wires `useDialogFocus(panelRef, dismissRef)` + body-scroll-lock so the shell is a real modal, and a plain `run.dismiss()` on the control.)
- `FinalizeStatusRegion` becomes: `return (<>{state.kind === "complete" ? <inline-complete-note/> : null}<FinalizeBlockerModal run={run} /></>);` — delete the inline race/cas/error branches and the `alertRef`/`isAlert` effect.

- [ ] **Step 1 — failing tests** (new, in `FinalizeBlockerModal.test.tsx`) + legacy updates (in `FinalizeButton.test.tsx`):

```tsx
// NEW — dialog semantics + accessible name for EVERY moved state (§6: exactly one labelling element each)
test.each([
  ["error", driveToError, "wizard-finalize-error"],
  ["race_row", driveToRaceRow, "wizard-finalize-race-row"],
  ["cas_per_row", () => driveToCasPerRow(), "wizard-finalize-cas-per-row"],
] as const)("%s renders role=dialog + aria-modal with a non-empty accessible name", async (_kind, drive, panelTestid) => {
  const q = await drive();
  const dialog = q.getByTestId("wizard-finalize-blocker-modal");
  expect(dialog).toHaveAttribute("role", "dialog");
  expect(dialog).toHaveAttribute("aria-modal", "true");
  const labelEl = document.getElementById(dialog.getAttribute("aria-labelledby")!);
  expect(labelEl).not.toBeNull();
  expect(labelEl!.textContent!.trim().length).toBeGreaterThan(0); // exactly one labelling element, non-empty
  expect(q.getByTestId(panelTestid)).toBeInTheDocument();
});
// §10.5 — body scroll lock while open, restored on close
test("body overflow is hidden while the modal is open and restored on close", async () => {
  expect(document.body.style.overflow).not.toBe("hidden");
  const q = await driveToError();
  expect(document.body.style.overflow).toBe("hidden");
  fireEvent.click(q.getByTestId("wizard-finalize-blocker-dismiss")); // Close → idle → unmount
  await waitFor(() => expect(q.queryByTestId("wizard-finalize-blocker-modal")).toBeNull());
  expect(document.body.style.overflow).not.toBe("hidden");
});
// §10.9 — complete stays inline
test("complete stays inline (no dialog)", async () => {
  const q = await driveToComplete();
  expect(q.getByTestId("wizard-finalize-publish-complete")).toBeInTheDocument();
  expect(q.queryByTestId("wizard-finalize-blocker-modal")).toBeNull();
});
```
Legacy updates in `FinalizeButton.test.tsx`:
- `:1298` focus assertion → `expect(document.activeElement).toBe(getByTestId("wizard-finalize-blocker-dismiss"))`.
- invariant-5 `container.textContent` negatives at `:478, 575-576, 607-620, 649-662, 1109-1118, 1126-1140, 1153-1167, 1211-1218` → `getByTestId("wizard-finalize-<state>").textContent` (panel scope). Add in each: `expect(panel.textContent!.length).toBeGreaterThan(0)` (non-vacuity).
- error-retry `:1221-1243` → route through Close/Escape → idle → re-click publish (not a click against the hidden trigger under an open modal).

- [ ] **Step 2 — run both files, expect the new tests FAIL and the updated legacy assertions FAIL (pre-impl):** `pnpm vitest run tests/components/admin/FinalizeBlockerModal.test.tsx tests/components/admin/FinalizeButton.test.tsx`
- [ ] **Step 3 — implement** the component + `FinalizeStatusRegion` refactor above.
- [ ] **Step 4 — run both files, expect ALL PASS (green tree).**
- [ ] **Step 5 — commit:** `git commit --no-verify -am "feat(admin): render finalize blocker/error states in a portaled modal; complete stays inline"`

---

## Task 3: Dismiss matrix — error dismissible vs blocking action-only + capture-phase Escape

**Spec:** §5, §6. **Files:** Modify `components/admin/FinalizeButton.tsx`; Test `FinalizeBlockerModal.test.tsx`.

- [ ] **Step 1 — failing tests** (BOTH blocking states + error):

```tsx
test.each([["escape"], ["backdrop"], ["close"]])("error dismisses via %s → idle", async (via) => {
  const q = await driveToError();
  if (via === "escape") fireEvent.keyDown(document, { key: "Escape" });
  else if (via === "backdrop") fireEvent.click(q.getByTestId("wizard-finalize-blocker-backdrop"));
  else fireEvent.click(q.getByTestId("wizard-finalize-blocker-dismiss"));
  await waitFor(() => expect(q.queryByTestId("wizard-finalize-blocker-modal")).toBeNull());
});
test.each([["race_row"], ["cas_per_row"]])("%s: Escape + backdrop are inert; backdrop is a non-interactive div; only Back dismisses", async (kind) => {
  const q = kind === "race_row" ? await driveToRaceRow() : await driveToCasPerRow();
  const backdrop = q.getByTestId("wizard-finalize-blocker-backdrop");
  expect(backdrop.tagName).toBe("DIV");
  expect(backdrop).toHaveAttribute("aria-hidden", "true");
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.click(backdrop);
  expect(q.getByTestId("wizard-finalize-blocker-modal")).toBeInTheDocument(); // still open
  fireEvent.click(q.getByTestId("wizard-finalize-blocker-dismiss")); // Back
  await waitFor(() => expect(q.queryByTestId("wizard-finalize-blocker-modal")).toBeNull());
});
```

- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement:** `const dismissible = state.kind === "error";` backdrop = `dismissible ? <button…onClick={dismiss}/> : <div aria-hidden="true" …/>`. Escape via a **capture-phase** `document` listener: `useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key !== "Escape") return; e.preventDefault(); e.stopImmediatePropagation(); if (dismissibleRef.current) run.dismiss(); }; document.addEventListener("keydown", h, true); return () => document.removeEventListener("keydown", h, true); }, [run]);` with `dismissibleRef` synced to `dismissible`.
- [ ] **Step 4 — run, expect PASS** (+ Task 2 green).
- [ ] **Step 5 — commit:** `git commit --no-verify -am "feat(admin): blocker dismiss matrix — error dismissible, race_row/cas_per_row action-only + Back"`

---

## Task 4: `dismissedRef` guard + §10.4 resolve/rescan paths

**Spec:** §4.3, §10.4, §10.13. **Files:** Modify `components/admin/FinalizeButton.tsx`; Test `FinalizeBlockerModal.test.tsx`.

- [ ] **Step 1 — failing tests:**

```tsx
const finalizeCount = () => fetchMock.mock.calls.filter(c => c[0] === "/api/admin/onboarding/finalize").length;
test("BlockedRowResolver resolve continues the loop (re-POSTs /finalize)", async () => {
  const q = await driveToCasPerRow(); // SHOW_ARCHIVED_IMMUTABLE, drive-archived-1
  // queue the post-resolve success chain (FinalizeButton.test.tsx:730-745): resolve ok, then finalize clean, then finalize_complete
  fetchMock
    .mockResolvedValueOnce(mockJsonResponse({ ok: true, status: "resolved" }))
    .mockResolvedValueOnce(mockJsonResponse({ status: "all_batches_complete", wizard_session_id: WSID, remaining_count: 0, unresolved_manifest_count: 0, per_row: [] }))
    .mockResolvedValueOnce(mockJsonResponse({ status: "finalize_complete", wizard_session_id: WSID, watched_folder_id: "f" }));
  const btn = q.getByTestId("blocked-row-resolver-drive-archived-1");
  await act(async () => { fireEvent.click(btn); }); // arm
  await act(async () => { fireEvent.click(btn); }); // confirm → /resolve-blocker
  await waitFor(() => expect(finalizeCount()).toBeGreaterThanOrEqual(2)); // onResolved → runLoop re-POSTs /finalize
});
test("RescanSheetButton success leaves the blocker modal mounted (router.refresh only, no runLoop)", async () => {
  const q = await driveToCasPerRow("STAGED_PARSE_OUTDATED_AT_PHASE_D", "drive-outdated-1"); // RESCANNABLE → RescanSheetButton renders
  fetchMock.mockResolvedValueOnce(mockJsonResponse({ ok: true }));
  fireEvent.click(q.getByTestId("rescan-sheet-button-drive-outdated-1"));
  await waitFor(() => expect(refreshMock).toHaveBeenCalled());
  expect(q.getByTestId("wizard-finalize-blocker-modal")).toBeInTheDocument(); // STILL open (state unchanged)
});
test("Back during a PENDING resolver request suppresses the late runLoop", async () => {
  const q = await driveToCasPerRow();
  let resolveFetch!: (v: Response) => void;
  fetchMock.mockReturnValueOnce(new Promise<Response>((r) => { resolveFetch = r; })); // next /resolve-blocker hangs
  const btn = q.getByTestId("blocked-row-resolver-drive-archived-1");
  await act(async () => { fireEvent.click(btn); }); await act(async () => { fireEvent.click(btn); }); // resolver pending
  const before = finalizeCount();
  fireEvent.click(q.getByTestId("wizard-finalize-blocker-dismiss")); // Back → idle → unmount
  await act(async () => { resolveFetch(mockJsonResponse({ ok: true, status: "resolved" })); }); // late success
  expect(finalizeCount()).toBe(before); // NO restart
  expect(q.queryByTestId("wizard-finalize-blocker-modal")).toBeNull();
});
```

- [ ] **Step 2 — run, expect the race test FAIL** (late onResolved restarts), the resolve/rescan tests may already pass from Task 2 wiring — confirm.
- [ ] **Step 3 — implement:** `const dismissedRef = useRef(false);` the Back/dismiss handler sets `dismissedRef.current = true` before `run.dismiss()`; the cas_per_row `BlockedRowResolver` callsite = `onResolved={() => { if (!dismissedRef.current) void run.runLoop(); }}`.
- [ ] **Step 4 — run, expect PASS.**
- [ ] **Step 5 — commit:** `git commit --no-verify -am "fix(admin): guard blocker resolver onResolved against a late resolve after dismiss; pin resolve/rescan paths"`

---

## Task 5: Focus trap + background-inert + compound stacking (cas_per_row AND error)

**Spec:** §6, §7a. **Files:** Modify `components/admin/FinalizeButton.tsx`; Test `FinalizeBlockerModal.test.tsx`.

- [ ] **Step 1 — failing tests:**

```tsx
beforeAll(() => { Object.defineProperty(HTMLElement.prototype, "offsetParent", { configurable: true, get() { return this.parentNode; } }); }); // jsdom visibility (Step3ReviewModal.test.tsx:403-429)
test("focus lands on the dismiss control; Tab cycles within the modal", async () => {
  const q = await driveToRaceRow(); // multi-control: a re-apply link + Back
  await waitFor(() => expect(document.activeElement).toBe(q.getByTestId("wizard-finalize-blocker-dismiss")));
  const link = q.getByTestId("wizard-finalize-reapply-drive-failed-1");
  const back = q.getByTestId("wizard-finalize-blocker-dismiss");
  const panel = q.getByTestId("wizard-finalize-blocker-panel");
  back.focus(); fireEvent.keyDown(panel, { key: "Tab" });            // from last (Back) → wraps to first (link)
  await waitFor(() => expect(document.activeElement).toBe(link));
  link.focus(); fireEvent.keyDown(panel, { key: "Tab", shiftKey: true }); // Shift+Tab from first → wraps to last (Back)
  await waitFor(() => expect(document.activeElement).toBe(back));
});
// Compound harness (template: step3Page.transitions.test.tsx:33-41 fixtures + :183-208 T8-b flow).
// The order matters: the review modal must be OPEN before the finalize terminal fires. Use a DEFERRED
// first fetch so the run stays `running` until we resolve it (a hanging response like T8-b's never
// terminates; a plain mockResolvedValueOnce terminates before we can open the review modal):
//   let resolveFinalize!: (r: Response) => void;
//   const finalizeP = new Promise<Response>((r) => { resolveFinalize = r; });
//   fetchMock.mockReturnValueOnce(finalizeP);                                     // 1st /finalize hangs (controllable)
//   const q = render(<Step3ReviewWithFinalize wizardSessionId={WSID} rows={[stagedRow("a","applied")]} finishable initialPublishCount={1} initialUncheckedCleanCount={0}/>);
//   fireEvent.click(q.getByTestId("wizard-finalize-button"));                     // state → running (fetch pending)
//   await waitFor(() => expect(q.getByTestId("wizard-step3-tracking")).toBeTruthy());
//   fireEvent.click(q.getByTestId("wizard-step3-card-a-more"));                   // open Step3ReviewModal (enabled mid-run)
//   const reviewModal = q.getByTestId("wizard-step3-card-a-review-modal");
//   // For cas_per_row: queue the /finalize-cas 409 (SHOW_ARCHIVED_IMMUTABLE) as the NEXT mock, then
//   //   await act(async () => resolveFinalize(mockJsonResponse({status:"all_batches_complete",wizard_session_id:WSID,remaining_count:0,unresolved_manifest_count:0,per_row:[]})));
//   // For error: await act(async () => resolveFinalize(mockJsonResponse({ok:false,code:"ONBOARDING_NOT_RESOLVED"},{status:409})));
//   await waitFor(() => expect(q.getByTestId("wizard-finalize-blocker-modal")).toBeInTheDocument());
// stagedRow/WSID from the fixture; `wizard-step3-card-a-more` is the card's Review/View button.

test("compound BLOCKING (cas_per_row): single root; Escape INERT (review stays); Back closes blocker; focus restores; nested scroll-lock held", async () => {
  const { q, reviewModal } = await driveCompound("cas_per_row");
  expect(q.getByTestId("wizard-finalize-blocker-modal")).toBeInTheDocument();
  const inertedAncestor = [...document.body.children].find(el => el.contains(reviewModal))!; // inert on the body-child ancestor, not the dialog node
  expect(inertedAncestor).toHaveAttribute("inert");
  expect(inertedAncestor).toHaveAttribute("aria-hidden", "true");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(reviewModal).toBeInTheDocument();
  expect(q.getByTestId("wizard-finalize-blocker-modal")).toBeInTheDocument(); // Escape inert for blocking
  fireEvent.click(q.getByTestId("wizard-finalize-blocker-dismiss")); // Back
  await waitFor(() => expect(q.queryByTestId("wizard-finalize-blocker-modal")).toBeNull());
  expect(inertedAncestor).not.toHaveAttribute("inert");
  expect(reviewModal.contains(document.activeElement)).toBe(true);           // focus continuity (inert lifted before restore)
  expect(document.body.style.overflow).toBe("hidden");                        // §10.11: review modal still holds the lock
});

test("compound ERROR: single root; Escape DISMISSES the blocker but NOT the review; focus restores; nested scroll-lock held", async () => {
  const { q, reviewModal } = await driveCompound("error");
  const inertedAncestor = [...document.body.children].find(el => el.contains(reviewModal))!;
  expect(inertedAncestor).toHaveAttribute("inert");
  fireEvent.keyDown(document, { key: "Escape" }); // error → Escape dismisses the blocker only
  await waitFor(() => expect(q.queryByTestId("wizard-finalize-blocker-modal")).toBeNull());
  expect(reviewModal).toBeInTheDocument();                                    // review NOT closed (capture + stopImmediatePropagation)
  expect(inertedAncestor).not.toHaveAttribute("inert");
  expect(reviewModal.contains(document.activeElement)).toBe(true);
  expect(document.body.style.overflow).toBe("hidden");                        // §10.11: review modal still holds the lock
});
```

- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement:** `const panelRef = useRef<HTMLDivElement>(null); const dismissRef = useRef<HTMLButtonElement>(null);` (from Task 2) `useDialogFocus(panelRef, dismissRef);` then, **declared AFTER `useDialogFocus`**, a background-inert effect: on mount, for each `document.body` child that is NOT the portal container, record prior `inert`/`aria-hidden`, set `el.setAttribute("inert",""); el.setAttribute("aria-hidden","true")`; cleanup restores prior values. (Reverse-order cleanup → inert lifts before `useDialogFocus` restores focus.) The portal container is a ref to the created div passed to `createPortal`.
- [ ] **Step 4 — run, expect PASS** (+ update any race_row/cas focus assertions in `FinalizeButton.test.tsx` if present).
- [ ] **Step 5 — commit:** `git commit --no-verify -am "feat(admin): blocker focus trap + background-inert single-root + compound stacking (cas_per_row + error)"`

---

## Task 6: Transition audit

**Spec:** §7, §10.8. **Files:** Modify `tests/components/admin/wizard/Step3TransitionAudit.test.tsx`.

- [ ] **Step 1 — failing test:** drive `Step3ReviewWithFinalize` to `cas_per_row`; assert the panel carries `sheet-rise` + `motion-reduce:animate-none`; the scrim carries `step3-details-scrim-in` + `motion-reduce:animate-none`; read `app/globals.css` and assert `@keyframes sheet-rise` AND `@keyframes step3-details-scrim-in` are present (grep guard); assert the panel has NO exit-animation class.
- [ ] **Step 2 — run, expect FAIL** (if a class/keyframe is missing/misnamed).
- [ ] **Step 3 — implement:** confirm the classes present in `FinalizeBlockerModal`; add the audit assertions.
- [ ] **Step 4 — run, expect PASS.**
- [ ] **Step 5 — commit:** `git commit --no-verify -am "test(admin): transition-audit rows for the finalize blocker modal entrance"`

---

## Task 7: Real-browser layout (Playwright, live esbuild harness)

**Spec:** §8, §10.7. **Files:** Create `tests/e2e/wizard-blocker-modal.layout.spec.ts` (the spec) AND `tests/e2e/_wizardBlockerModalLiveEntry.tsx` (the esbuild ENTRY the spec bundles — mirrors `tests/e2e/_blockedRowResolverLiveEntry.tsx`, referenced by `blocked-row-resolver-transitions.spec.ts:29,83`); Modify `tests/e2e/standalone.config.ts` (add `wizard-blocker-modal\.layout` to the `testMatch` regex allowlist).

**Template:** `tests/e2e/blocked-row-resolver-transitions.spec.ts` (LIVE esbuild-bundled admin tree) — NOT the static `renderToStaticMarkup` harness (it cannot drive state). Mount through the EXPORTED `FinalizeStatusRegion` (single-lever contract — `FinalizeBlockerModal` stays module-private and is exercised through `FinalizeStatusRegion`, per the exports at `FinalizeButton.tsx:498,572`). Harness page:
- a REAL `<WizardFooter primary={<span/>} center={<FinalizeStatusRegion run={stubRun}/>} />` (WizardFooter is light — `createPortal` + flex, no heavy deps), so the modal mounts through the actual footer-center slot and the footer's `z-40` body portal — the production composition the spec §8 requires.
- `stubRun`: a PARTIAL literal cast `as unknown as FinalizeRun` (the exported `FinalizeRun` is the full hook return — `isRunning`, `buttonDisabled`, `confirmOpen`, labels, counts, setters, `FinalizeButton.tsx:481-495`; the blocker path reads only `state`, `dismiss`, `runLoop`, `wizardSessionId`, so a narrowed stub + cast is correct and documented). `dismiss`/`runLoop` = `() => {}`, constant `wizardSessionId`; a page button flips `state` `{ kind: "idle" } → { kind: "cas_per_row", rows: [{ drive_file_id: "d1", code: "SHOW_ARCHIVED_IMMUTABLE" }, … cap+ rows to exercise the max-height cap … ] }`.
- a top-of-stack STAND-IN for `Step3ReviewModal`: a plain `<div data-testid="review-standin" className="fixed inset-0 z-50">` mounted in the app-root subtree (NOT portaled). This replicates `Step3ReviewModal`'s exact stacking shell (`fixed inset-0 z-50`, `Step3ReviewModal.tsx:563`) — bundling the full `Step3ReviewModal` (ShowReviewSurface + a full staged fixture) is disproportionate; the z-context/paint-order behavior under test is identical to the one-line shell.
- Compile token CSS via the Tailwind CLI as the template does; emulate `prefers-reduced-motion: reduce` (stable geometry on load, matching `step3-review-modal.layout.spec.ts`).

- [ ] **Step 1 — failing test:** at 390px, with a MANY-row `cas_per_row` stub (enough rows to exceed 85vh unclamped): (a) measure `wizard-footer-inner` height with `stubRun` idle, flip to `cas_per_row`, assert height unchanged ±0.5px (the no-layout-shift regression proof — primary acceptance test); (b) measure the PANEL `wizard-finalize-blocker-panel` (NOT the full-screen overlay) — assert its rect is within `[0, innerHeight + 0.5]` AND `panelRect.height <= 0.85 * window.innerHeight + 0.5` (the §8 `max-h-[85vh]` cap — this is why the many-row stub matters); (c) with the `review-standin` present, `document.elementFromPoint(panelRect.x + panelRect.width/2, panelRect.y + panelRect.height/2)` resolves to a node INSIDE `wizard-finalize-blocker-modal` (portal-to-body z-50 beats an app-root z-50 stand-in — top-of-stack). Bounds from `window.innerHeight`.
- [ ] **Step 2 — run, expect FAIL** (harness/spec not built / not in allowlist): `node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/wizard-blocker-modal.layout.spec.ts`
- [ ] **Step 3 — implement** the harness + spec; add the allowlist regex entry.
- [ ] **Step 4 — run, expect PASS.**
- [ ] **Step 5 — commit** (new files → `git add` explicitly by name): `git add tests/e2e/wizard-blocker-modal.layout.spec.ts tests/e2e/_wizardBlockerModalLiveEntry.tsx tests/e2e/standalone.config.ts && git commit --no-verify -m "test(admin): real-browser layout — blocker modal viewport-pinned, no footer shift"`

---

## Task 8: Impeccable dual-gate + close-out

**Spec:** invariant 8. **Files:** possibly `DEFERRED.md`.

- [ ] **Step 1:** `/impeccable critique` on the diff (context.mjs already loaded; register = product). Record findings.
- [ ] **Step 2:** `/impeccable audit` on the diff. Record findings.
- [ ] **Step 3:** fix every P0/P1 or defer via `DEFERRED.md` with a cited reason. Re-run until clean.
- [ ] **Step 4:** full suite + gates: `pnpm test && pnpm typecheck && pnpm lint && pnpm format:check` (scoped gates miss regressions — full run before push). Also run the Playwright spec (Task 7) once more.
- [ ] **Step 5 — commit** any fixes: `git commit --no-verify -am "fix(admin): impeccable P0/P1 fixes for the blocker modal"`

---

## Self-Review (against the spec, with fresh eyes)

1. **Spec coverage:** §4.1/§4.2 → T2; §4.3 → T1/T4; §5 → T3; §6 → T2/T3/T5; §7 → T6; §7a → T5; §8 → T7; §9 → T2 (focus + invariant-5 rescope + error-retry, all in the atomic commit); §10.1 T1, §10.2 T3, §10.3 T3, §10.4 T4, §10.5 T2, §10.6 T5, §10.7 T7, §10.8 T6, §10.9 T2, §10.10 T2, §10.11 T5, §10.12 T2, §10.13 T4; §11 meta declared; §12/§13 constraints. No gap.
2. **Green-per-commit:** T2 is the only task that moves the panels; it updates every legacy assertion it breaks in the same commit. All other tasks are additive/refinements — each green at commit.
3. **No placeholders:** every "drive to <state>" resolves to a cited recipe in Shared test recipes; no invented testids (`blocked-row-resolver-drive-archived-1`, `wizard-step3-card-<dfid>-review-modal` verified).
4. **Type consistency:** `dismiss` (T1) used identically in T3/T4/T5; `FinalizeBlockerModal({ run })` stable; `dismissedRef`/`dismissibleRef` distinct and each defined where used.
</content>
