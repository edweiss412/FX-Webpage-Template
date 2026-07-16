# Destructive-Action Confirmation Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the project-wide destructive-confirm contract (spec `docs/superpowers/specs/2026-07-16-destructive-confirm-pass.md`, Codex-APPROVED R14): inverted-amber confirm-go recipe, 4 new two-tap guards, focus-safe open/close rules, FLOW4-4 aggregate error, structural meta-test.

**Architecture:** Pure client-component styling/state changes + one new structural meta-test. No DB, no migrations, no advisory locks, no server-action changes. Every task extends the meta-test registry in the same commit that adds a recipe literal.

**Tech Stack:** React 19 client components, Tailwind v4, vitest + @testing-library/react (jsdom), `tests/styles/_classScanUtils.ts` scanner helpers.

## Global Constraints

- **Spec is canonical**: `docs/superpowers/specs/2026-07-16-destructive-confirm-pass.md` — §3 contract C1–C6, §4 guards, §5 restyles, §6 fixes, §7 exceptions, §8 meta-test, §13 do-not-relitigate.
- **Recipe literal (C1, exact)**: contains `bg-warning-text` + `text-warning-bg` + `font-semibold` + `hover:opacity-90`; NEVER `bg-accent`/`bg-surface`/`bg-bg`/other `hover:bg-*`. One complete literal per confirm-go button (§8 literal-shape rule).
- **Canonical full literal for panel confirm-gos (R6/R8, and template for others)**:
  `inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-warning-text px-4 py-2 text-sm font-semibold text-warning-bg transition-colors duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg disabled:cursor-not-allowed disabled:opacity-60`
  (ring-offset token varies by container: `ring-offset-warning-bg` inside amber panels, `ring-offset-surface`/`ring-offset-bg`/`ring-offset-surface-raised` elsewhere — non-normative, match the surrounding container.)
- **Commit per task**, conventional commits, `--no-verify` allowed but run `pnpm format:check` before push.
- **UI invariant 8**: impeccable dual-gate runs after implementation (separate pipeline stage, not a plan task).
- **Never prettier the master spec.**
- **Meta-test inventory (declared per project rule):** CREATES `tests/styles/_metaDestructiveConfirm.test.ts`; EXTENDS `tests/styles/_metaBgAccentInventory.test.ts` (row deletions where accent literals are removed). No other registries apply (no DB writes, no admin alerts, no email, no advisory locks).
- **Advisory-lock topology:** N/A — no task touches `pg_advisory*` or any mutating server path.

## Execution order

1 (meta-test scaffold) → 2 (strip R1+F2+F3) → 3 (trigger-swap family R2–R5+F4) → 4 (ResolveAlert R6+F4) → 5 (ReSync R8+close) → 6 (Archive R7) → 7 (Cleanup F1) → 8 (guards G1–G3) → 9 (G4) → 10 (DESIGN.md + DEFERRED/BACKLOG) → 11 (close-out gates).

---

### Task 1: Meta-test scaffold + existing-surface registry

**Files:**
- Create: `tests/styles/_metaDestructiveConfirm.test.ts`
- Reference (read-only): `tests/styles/_classScanUtils.ts`, `tests/styles/_metaBgAccentInventory.test.ts`

**Interfaces:**
- Produces: `REGISTRY` rows `{ file: string; index: number; note: string; kind: "morph" | "panel" | "exempt-non-confirm" }` via the `R(file, index, kind, note)` helper — `index` = per-file occurrence order (0-based), exactly like the bg-accent registry. Later tasks append `R(...)` rows here in the same commit as each new recipe literal; when in doubt about an index, run the meta-test and copy the occurrence number from its failure output.

- [ ] **Step 1: Write the meta-test** (initial registry = the 3 already-conformant panels + 1 exempt):

The scanner mirrors `_metaBgAccentInventory.test.ts`'s EXACT iteration idiom (verified against the live helpers: `walk(dir: string): string[]` recursing one root at a time over `.ts/.tsx`; `stripComments(src)`; `tokensOf(line)` — line-based token scan; class literals in this repo are single-line, so line ≈ literal, consistent with the sibling scanners). Rows are per-file occurrence-indexed like the bg-accent registry.

```ts
// tests/styles/_metaDestructiveConfirm.test.ts
/**
 * Destructive-confirm recipe registry (spec 2026-07-16-destructive-confirm-pass §8).
 * A hit = one line (≈ one static class literal in this codebase) whose token
 * set contains BOTH `bg-warning-text` AND `text-warning-bg`. One registry row
 * per hit, occurrence-indexed per file (same identity model as
 * _metaBgAccentInventory). Non-exempt hits must satisfy C1: include
 * font-semibold + hover:opacity-90; exclude bg-accent/bg-surface/bg-bg and any
 * other hover:bg-*. Fails by default for recipe-token growth without a row.
 * Exempt rows may violate C1 (they cover legitimate non-confirm inverted-amber
 * uses) and require a reason in `note`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { walk, stripComments, tokensOf } from "./_classScanUtils";

type Kind = "morph" | "panel" | "exempt-non-confirm";
type Row = { file: string; index: number; note: string; kind: Kind };
const R = (file: string, index: number, kind: Kind, note: string): Row => ({ file, index, kind, note });

const REGISTRY: Row[] = [
  R("components/admin/MaintenanceResetButtons.tsx", 0, "panel", "validation-reset-confirm"),
  R("components/admin/CleanupAbandonedFinalizeButton.tsx", 0, "panel", "cleanup-abandoned-finalize-confirm-yes"),
  R("components/admin/ReapStaleSessionsButton.tsx", 0, "panel", "reap-stale-sessions-confirm-yes"),
  R("components/admin/PreviewBanner.tsx", 0, "exempt-non-confirm", "preview-banner CTA: inverted amber as banner emphasis, NOT a destructive confirm; predates spec; intentionally violates C1 (hover:bg-warning-text/90)"),
];

function baseUtil(tok: string): string {
  const parts = tok.split(":");
  return parts[parts.length - 1]!.replace(/^!/, "");
}
const hasToken = (tokens: string[], util: string) => tokens.some((t) => baseUtil(t) === util && !t.includes(":"));
// recipe pair must be UNVARIANTED (a plain state fill, not a hover/checked variant)
const isHit = (tokens: string[]) => hasToken(tokens, "bg-warning-text") && hasToken(tokens, "text-warning-bg");

describe("META destructive-confirm recipe registry (spec §8)", () => {
  const hits: Array<{ file: string; index: number; tokens: string[]; lineNo: number }> = [];
  for (const root of ["components", "app"]) {
    for (const file of walk(root)) {
      let n = 0;
      stripComments(readFileSync(file, "utf8"))
        .split("\n")
        .forEach((line, i) => {
          const tokens = tokensOf(line);
          if (isHit(tokens)) hits.push({ file, index: n++, tokens, lineNo: i + 1 });
        });
    }
  }

  it("every recipe occurrence is registered; every registry row exists", () => {
    const problems: string[] = [];
    for (const h of hits) {
      if (!REGISTRY.find((r) => r.file === h.file && r.index === h.index)) {
        // Spec §8 failure classes: whole file unknown vs same-file occurrence growth.
        const fileKnown = REGISTRY.some((r) => r.file === h.file);
        problems.push(
          `${fileKnown ? "UNREGISTERED OCCURRENCE" : "UNREGISTERED DESTRUCTIVE CONFIRM"} ${h.file}:${h.lineNo} (occurrence ${h.index})`,
        );
      }
    }
    for (const r of REGISTRY) {
      if (!hits.find((h) => h.file === r.file && h.index === r.index)) {
        problems.push(`STALE ROW ${r.file} occurrence ${r.index}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("every non-exempt hit satisfies C1", () => {
    const problems: string[] = [];
    for (const h of hits) {
      const row = REGISTRY.find((r) => r.file === h.file && r.index === h.index);
      if (!row || row.kind === "exempt-non-confirm") continue;
      const t = h.tokens;
      if (!t.includes("font-semibold")) problems.push(`${h.file}:${h.lineNo} missing font-semibold`);
      if (!t.includes("hover:opacity-90")) problems.push(`${h.file}:${h.lineNo} missing hover:opacity-90`);
      for (const bad of ["bg-accent", "bg-surface", "bg-bg"]) {
        if (t.some((x) => baseUtil(x) === bad)) problems.push(`${h.file}:${h.lineNo} forbidden ${bad}`);
      }
      // any token whose variant chain includes `hover` and whose base utility is bg-* (catches
      // hover:bg-x, disabled:hover:bg-x, hover:bg-warning-text/90, etc.)
      for (const x of t) {
        const chain = x.split(":");
        if (chain.length > 1 && chain.slice(0, -1).includes("hover") && chain[chain.length - 1]!.replace(/^!/, "").startsWith("bg-")) {
          problems.push(`${h.file}:${h.lineNo} forbidden hover-variant bg token: ${x}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("exempt rows carry a reason", () => {
    for (const row of REGISTRY.filter((r) => r.kind === "exempt-non-confirm")) {
      expect(row.note.length).toBeGreaterThan(20);
    }
  });
});
```

Note on `hasToken`'s `!t.includes(":")` restriction: `PreviewBanner.tsx:117`'s `hover:bg-warning-text/90` must NOT satisfy the `bg-warning-text` half by itself (it's a variant + opacity form). If in Step 2 the exempt PreviewBanner line does NOT register as a hit under this matcher, that's CORRECT behavior for the pair rule — then drop the PreviewBanner exempt row (no hit, no row) and record in the test header that the banner never matched the scanner's unvarianted-pair signature. Follow the scanner's actual output, not the plan's guess (spec §8: fail-first output is authoritative).

- [ ] **Step 2: Run** `pnpm vitest run tests/styles/_metaDestructiveConfirm.test.ts`
Expected: PASS (3 conformant panels: MaintenanceReset `:298`, Cleanup `:183`, ReapStale `:137` already carry `bg-warning-text text-warning-bg font-semibold`; verify hover — Cleanup/ReapStale/MaintenanceReset use `hover:opacity-90` already; PreviewBanner exempt).
If the 3 existing panels FAIL the C1 hover assertion (e.g. one lacks `hover:opacity-90`), fix the literal in the component (that IS the recipe normalization) rather than loosening the test.
- [ ] **Step 3: Negative dual proof (working-tree only, never committed):** temporarily add `className="bg-warning-text text-warning-bg"` to any unregistered component → run → expect `UNREGISTERED DESTRUCTIVE CONFIRM`; revert. Then temporarily delete the PreviewBanner row → expect `UNREGISTERED DESTRUCTIVE CONFIRM`/count mismatch; revert.
- [ ] **Step 4: Commit** `test(styles): destructive-confirm recipe registry meta-test (spec §8)`

---

### Task 2: Strip — R1 restyle + F2 aggregate outcome + F3 focus close

**Files:**
- Modify: `components/admin/RecentAutoAppliedStrip.tsx` (confirm-go className; `confirmUndoAll`; group container/toggle refs; outcome state + alert block)
- Test: `tests/components/admin/RecentAutoAppliedStrip.test.tsx`
- Modify: `tests/styles/_metaDestructiveConfirm.test.ts` (add row `{ file: "components/admin/RecentAutoAppliedStrip.tsx", note: "auto-applied-undo-all-confirm-go-*", kind: "panel" }`)

**Interfaces:**
- Consumes: Task 1 REGISTRY.
- Produces: `bulkUndoOutcome: { failed: number; total: number } | null` group-level state; testid `auto-applied-bulk-undo-alert-<showId>`.

- [ ] **Step 1: Write failing tests** (append to the existing describe in `RecentAutoAppliedStrip.test.tsx`; reuse its existing render/actions mocks):

```tsx
it("undo-all confirm-go carries the destructive recipe; cancel stays neutral", async () => {
  // render with a 2-undoable group, open confirm (existing helpers)
  const go = screen.getByTestId(`auto-applied-undo-all-confirm-go-${SHOW_ID}`);
  for (const t of ["bg-warning-text", "text-warning-bg", "font-semibold", "hover:opacity-90"]) {
    expect(go.className.split(/\s+/)).toContain(t);
  }
  for (const t of ["bg-surface", "bg-accent"]) {
    expect(go.className.split(/\s+/)).not.toContain(t);
  }
  const cancel = screen.getByTestId(`auto-applied-undo-all-cancel-${SHOW_ID}`);
  expect(cancel.className.split(/\s+/)).not.toContain("bg-warning-text");
});

it("partial bulk-undo failure renders the aggregate alert with counts from the mocked failures", async () => {
  // mock: first id fails, second succeeds
  undoFromDashboardAction
    .mockResolvedValueOnce({ ok: false, code: "UNDO_SUPERSEDED" })
    .mockResolvedValueOnce({ ok: true });
  // open confirm, click confirm-go, await settle
  const alert = await screen.findByTestId(`auto-applied-bulk-undo-alert-${SHOW_ID}`);
  expect(alert).toHaveAttribute("role", "alert");
  expect(alert.textContent).toContain("Couldn't undo 1 of 2 changes.");
  expect(alert.textContent).toContain("The ones that failed stay in this list.");
});

it("zero failures → no alert; reopening confirm clears a visible alert", async () => { /* two renders per spec §6 F2 lifecycle */ });
it("alert persists across collapse → re-expand", async () => { /* toggle disclosure twice, alert still present */ });
it("bulk undo completion moves focus to the group toggle when focus was inside the panel", async () => {
  // click confirm-go (focus lands on it), await settle
  await waitFor(() => expect(screen.getByTestId(`auto-applied-toggle-${SHOW_ID}`)).toHaveFocus());
});
it("keep-changes cancel moves focus to the group toggle", async () => { /* same assertion after cancel click */ });
it("completion with focus planted outside the group does NOT move focus", async () => {
  // focus an external button before resolving the mocked actions
});
it("collapse during pending: completes without throwing, no focus steal, alert on re-expand", async () => { /* spec §10 F3(d) */ });
```

(Write each stub fully — the four abbreviated bodies above must be real tests in the actual edit; derive expected counts from the mocked failure set, never hardcode fixture length.)

- [ ] **Step 2: Run to verify fail**: `pnpm vitest run tests/components/admin/RecentAutoAppliedStrip.test.tsx` — new tests FAIL (recipe class absent, alert testid absent, focus goes nowhere).
- [ ] **Step 3: Implement** in `RecentAutoAppliedStrip.tsx`:
  - Confirm-go className → replace `border border-border-strong bg-surface … hover:bg-surface-sunken` literal with the recipe (keep `ring-offset-warning-bg`, disabled tokens; drop `border border-border-strong`):
    `inline-flex min-h-tap-min items-center justify-center rounded-sm bg-warning-text px-4 text-sm font-semibold text-warning-bg transition-colors duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg disabled:cursor-not-allowed disabled:opacity-60`
  - New state `const [bulkUndoOutcome, setBulkUndoOutcome] = useState<{ failed: number; total: number } | null>(null);`
  - New refs: `groupContainerRef` on the group card root `<div>`, `toggleRef` on the disclosure toggle `<button>`.
  - `confirmUndoAll` (spec §6 F3 exact 5-step sequence):
    ```tsx
    function confirmUndoAll() {
      startTransition(async () => {
        const results: Array<{ ok: boolean } | null> = [];
        for (const id of group.undoableIds) {
          const fd = new FormData();
          fd.set("changeLogId", id);
          try {
            results.push(await actions.undoFromDashboardAction(null, fd));
          } catch {
            // A thrown action counts as a failed undo — completion must still
            // write the outcome and restore focus (spec §6 F2 "completion writes").
            results.push({ ok: false });
          }
        }
        const total = results.length;
        const failed = results.filter((r) => r && !r.ok).length;
        const shouldRestore = groupContainerRef.current?.contains(document.activeElement) ?? false;
        if (shouldRestore) toggleRef.current?.focus();
        setConfirming(false);
        setBulkUndoOutcome(failed > 0 ? { failed, total } : null);
      });
    }
    ```
  - Cancel handler: `onClick={() => { const shouldRestore = groupContainerRef.current?.contains(document.activeElement) ?? false; if (shouldRestore) toggleRef.current?.focus(); setConfirming(false); }}`
  - Opening confirm: `onClick={() => { setBulkUndoOutcome(null); setConfirming(true); }}`
  - Alert block (JSX position: AFTER the `confirming ? … : null` conditional, BEFORE the row list — spec §6 F2):
    ```tsx
    {bulkUndoOutcome && bulkUndoOutcome.failed > 0 ? (
      <p
        role="alert"
        data-testid={`auto-applied-bulk-undo-alert-${group.showId}`}
        className="border-b border-border bg-warning-bg p-tile-pad text-sm text-warning-text"
      >
        Couldn&apos;t undo {bulkUndoOutcome.failed} of {bulkUndoOutcome.total} changes. The ones
        that failed stay in this list.
      </p>
    ) : null}
    ```
- [ ] **Step 4: Run tests** — all PASS (`waitFor` for focus per project memory). Also run `pnpm vitest run tests/styles/_metaDestructiveConfirm.test.ts` with the new registry row — PASS.
- [ ] **Step 5: Commit** `feat(admin): strip undo-all destructive recipe + bulk-undo aggregate alert + close-path focus (FLOW4-4/5/6)`

---

### Task 3: Trigger-swap family — R2–R5 restyles + F4 open/close focus

**Files:**
- Modify: `app/admin/show/[slug]/RotateShareTokenButton.tsx`, `app/admin/show/[slug]/ResetPickerEpochButton.tsx`, `app/admin/show/[slug]/PickerResetControl.tsx`, `app/admin/settings/admins/RevokeRowButton.tsx`
- Test: their existing test files (locate via `rg -l "<ComponentName>" tests/`)
- Modify: `tests/styles/_metaDestructiveConfirm.test.ts` (+4 panel rows) and `tests/styles/_metaBgAccentInventory.test.ts` (rows shrink because each file loses one `bg-accent` literal — do NOT hand-compute indices; RUN the bg-accent test after each file's restyle and reconcile from its failure output, the only source of truth per spec §8)

All four get the same three changes (repeat per file — no sharing):

1. **Restyle confirm-go** (the `bg-accent … text-accent-text … hover:bg-accent-hover` literal at Rotate `:235`, ResetEpoch `:211`, PickerReset `:232`, Revoke `:284`) → recipe literal, preserving each file's existing ring-offset token (`ring-offset-surface` where present) and `min-w-tap-min`/`py-2`/`font-semibold` shape:
   `inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-warning-text px-4 py-2 font-semibold text-warning-bg transition-colors duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60`
   (append `focus-visible:ring-offset-2 focus-visible:ring-offset-surface` where the original had it; Revoke keeps `font-semibold`, note its idle trigger `:211` and disabled placeholder `:169` are NOT touched.)
2. **Open focus (C3):** `const cancelRef = useRef<HTMLButtonElement>(null);` + effect keyed on the confirm state:
   ```tsx
   useEffect(() => {
     if (ui === "confirm") cancelRef.current?.focus();
   }, [ui]);
   ```
   `ref={cancelRef}` on the cancel button. (State names differ per file — Rotate/ResetEpoch/Revoke use `ui === "confirm"`; PickerReset check its own state name and key the effect on it.)
3. **Close focus (C5, two-phase):** `const triggerRef = useRef<HTMLButtonElement>(null);` on the idle trigger + `const confirmRowRef = useRef<HTMLDivElement>(null);` on the confirm row container + a restore flag:
   ```tsx
   const restoreFocusRef = useRef(false);
   function closeConfirm() { // used by BOTH cancel onClick and the auto-revert timer callback
     restoreFocusRef.current = confirmRowRef.current?.contains(document.activeElement) ?? false;
     setUi("idle"); // or the surface's own idle transition
   }
   useEffect(() => {
     if (ui === "idle" && restoreFocusRef.current) {
       restoreFocusRef.current = false;
       triggerRef.current?.focus();
     }
   }, [ui]);
   ```
   Wire the existing auto-revert `setTimeout(() => setUi(...idle...))` to go through `closeConfirm`. Submit paths (pending/success/failure) are untouched (spec §6 F4 matrix).

- [ ] **Step 1:** Write failing tests per surface (4 files; same 4 cases each): recipe classes on confirm-go by testid (`admin-rotate-share-token-confirm-button`, `admin-reset-picker-epoch-confirm-button`, `picker-reset-confirm-button`, `admin-allowlist-revoke-confirm-button`); cancel lacks recipe; open → cancel focused (`waitFor`); cancel activation → trigger focused; auto-revert (fake timers) with focus inside → trigger focused; auto-revert with focus planted on an external button → that button keeps focus.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement per file as above.
- [ ] **Step 4:** Run per-surface tests + BOTH meta-tests (destructive-confirm + bg-accent — reconcile bg-accent rows from its own failure output). All PASS.
- [ ] **Step 5: Commit** `feat(admin): trigger-swap confirm family — destructive recipe + focus-safe open/close (R2-R5, F4)`

---

### Task 4: ResolveAlert — R6 AccentButton→plain recipe button + F4

**Files:**
- Modify: `components/admin/ResolveAlertButton.tsx`
- Test: existing ResolveAlertButton test file
- Modify: registries (+1 panel row; DELETE bg-accent row `L("components/admin/ResolveAlertButton.tsx", 0, "disabled:hover:bg-accent")` — reconcile by running that test)

- [ ] **Step 1:** Failing tests: confirm-go (`admin-alert-confirm-resolve-button`) carries recipe, is a plain `<button type="submit">` (not AccentButton); cancel (`admin-alert-cancel-button`) lacks recipe; open → cancel focused; cancel activation → idle trigger (`Dismiss` AccentButton) focused; auto-revert cases (3s — `ResolveAlertButton` timer) both directions.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Replace the confirm `AccentButton` (`:150-160`) with:
```tsx
<button
  type="submit"
  data-testid="admin-alert-confirm-resolve-button"
  onClick={onConfirmClick}
  disabled={pending}
  aria-busy={pending}
  className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm bg-warning-text px-4 py-2 text-sm font-semibold text-warning-bg transition-colors duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-warning-bg disabled:cursor-not-allowed disabled:opacity-60"
>
  {pending ? "Dismissing…" : "Confirm dismiss"}
</button>
```
(The `disabled:hover:bg-accent` override and its comment die with the AccentButton. The M9-D-C4-1 stable-fill-under-pending intent is preserved: the recipe fill is state-independent.) Add C3/C5 refs exactly as Task 3's pattern (idle trigger = the `Dismiss` AccentButton at `:118` — AccentButton forwards ref, `components/shared/AccentButton.tsx:76`/`:135`).
- [ ] **Step 4:** Run tests + both meta-tests — PASS.
- [ ] **Step 5: Commit** `feat(admin): resolve-alert confirm — destructive recipe + focus-safe (R6, F4)`

---

### Task 5: ReSync — R8 restyle + single-phase close focus

**Files:**
- Modify: `components/admin/ReSyncButton.tsx`
- Test: `tests/components/ReSyncButton.test.tsx`
- Modify: destructive-confirm registry (+1 panel row). (No bg-accent literal in this file — AccentButton is component-internal; verify by running the bg-accent meta-test.)

- [ ] **Step 1:** Failing tests: `admin-resync-accept` carries recipe and is a plain button; clicking `admin-resync-keep-current` moves focus to `admin-resync-button` (the trigger) — assert with `waitFor`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Replace the accept `AccentButton` (`:176-187`) with a plain button using the canonical R6 literal (same testid/aria-busy/onClick with `expectedModifiedTime`). Add `triggerRef` passed to the trigger `AccentButton` (`:132`, ref-as-prop) and change keep-current's onClick to:
```tsx
onClick={() => {
  triggerRef.current?.focus();
  setHeldShrink(null);
}}
```
- [ ] **Step 4:** Run tests + meta-tests — PASS (existing `keepCurrentRef` open-focus test at `:179` still green).
- [ ] **Step 5: Commit** `feat(admin): resync shrink-accept — destructive recipe + close-path focus (R8)`

---

### Task 6: Archive — R7 morph restyle (both variants)

**Files:**
- Modify: `components/admin/ArchiveShowButton.tsx` (`:196-200` ternary)
- Test: existing ArchiveShowButton test file
- Modify: destructive-confirm registry (+2 morph rows — compact/full ternary branches are separate literals)

- [ ] **Step 1:** Failing tests: `archive-show-confirm-button` in both `compact` and full renders carries recipe tokens and lacks `bg-warning-bg`/`border-status-warn`/`hover:bg-warning-bg`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Replace both ternary branches, preserving each branch's sizing (`max-w-88`/`min-h-confirm-box min-w-[18rem]`, `text-left text-sm`):
  compact: `inline-flex min-h-tap-min min-w-tap-min max-w-88 items-center justify-center rounded-sm bg-warning-text px-3 py-1.5 text-left text-sm font-semibold text-warning-bg transition-colors duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60`
  full: `inline-flex min-h-confirm-box min-w-[18rem] max-w-full items-center justify-center rounded-sm bg-warning-text px-4 py-2 text-left text-sm font-semibold text-warning-bg transition-colors duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60`
  (Morph = C3/C5 exempt; existing 4s auto-revert at `:42` untouched.)
- [ ] **Step 4:** Run tests + meta-test — PASS.
- [ ] **Step 5: Commit** `feat(admin): archive confirm morph — destructive recipe (R7)`

---

### Task 7: Cleanup — F1 focus the safe control

**Files:**
- Modify: `components/admin/CleanupAbandonedFinalizeButton.tsx` (`:134`)
- Test: existing CleanupAbandonedFinalizeButton test file

- [ ] **Step 1:** Failing test: on popover open, `cleanup-abandoned-finalize-confirm-cancel` has focus (waitFor), NOT `…-confirm-yes`. Update/replace any existing test asserting the old confirm-focus behavior.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Change the mount effect to `cancelRef.current?.focus();`. Delete `confirmRef` if now unused (check the focus-trap keydown — if it cycles between the two refs, keep both, only swap the mount focus).
- [ ] **Step 4:** Run — PASS (registry unchanged: literal already registered in Task 1).
- [ ] **Step 5: Commit** `fix(admin): cleanup discard popover focuses the safe control on open (F1, WCAG 2.4.3)`

---

### Task 8: Guards G1–G3 — one-tap → two-tap morph

**Files:**
- Modify: `components/admin/PendingPanelDiscardButtons.tsx` (G1), `components/admin/StagedReviewCard.tsx` (G2), `components/admin/RescanSheetButton.tsx` (G3)
- Test: their existing test files
- Modify: destructive-confirm registry (+3 morph rows)

Shared morph mechanics per control (repeat in each file; 4s timer per spec §4):

```tsx
const [armed, setArmed] = useState(false);
const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
function clearArmTimer() {
  if (armTimerRef.current !== null) { clearTimeout(armTimerRef.current); armTimerRef.current = null; }
}
useEffect(() => clearArmTimer, []);
function onGuardedClick() {
  if (!armed) {
    setArmed(true);
    clearArmTimer();
    armTimerRef.current = setTimeout(() => {
      armTimerRef.current = null; // callback clears its own ref — no stale identity survives
      setArmed(false);
    }, 4_000);
    return;
  }
  clearArmTimer();
  setArmed(false);
  runExistingHandler(); // the surface's current one-tap handler, unchanged
}
```

Stale-timer note (plan R2 review): G1–G3 are SINGLE-control guards — there is no re-arm path (a second tap while armed FIRES; the fire path clears the timer). The timer callback nulling its own ref plus `clearArmTimer` on fire/unmount covers every identity. G4's multi-group re-arm class lives in Task 9. Each G1–G3 test suite includes: after the second tap fires, advance the fake timers 4s further → no state change, no act warning (proves the fire path killed the pending disarm).

Per-surface armed rendering (label + className swap on the SAME button; the armed branch is the registry's morph literal):

- **G1** (`admin-pending-ignore-*`, "Permanently ignore"): armed label `Confirm — stop tracking this sheet permanently`; armed className
  `inline-flex min-h-tap-min items-center justify-center rounded-sm bg-warning-text px-3 text-sm font-semibold text-warning-bg transition-colors duration-fast hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2`
  Idle branch/classes unchanged; sibling "Defer until modified" untouched (§7).
- **G2** (`staged-review-discard-ignore`, "Stop showing this sheet"): idle stays the recessive underline link (`:629`); armed label `Confirm — stop showing this sheet`, armed className
  `min-h-tap-min rounded-sm bg-warning-text px-4 py-2 text-sm font-semibold text-warning-bg transition-colors duration-fast hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised disabled:cursor-not-allowed disabled:opacity-60`
  Keep `aria-describedby` in both states.
- **G3** (`rescan-sheet-button-*`): armed label `Confirm re-scan — replaces this staged review`; armed className mirrors its idle shape with recipe fill:
  `inline-flex min-h-tap-min items-center justify-center self-start rounded-sm bg-warning-text px-4 text-sm font-semibold text-warning-bg transition-colors duration-fast hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring`
  (`self-start` preserved per spec §4; both `placement` variants get it automatically — same button.)

- [ ] **Step 1:** Failing tests per surface: first click does NOT invoke the handler/fetch (assert mock not called) and swaps label+classes; second click invokes exactly once; 4s fake-timer revert restores idle label/classes; unmount clears timer (no act warnings).
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run + meta-test — PASS.
- [ ] **Step 5: Commit** `feat(admin): two-tap guards on permanent-ignore, stop-showing-sheet, re-scan (G1-G3)`

---

### Task 9: G4 — BulkIgnoreControls armedCode model

**Files:**
- Modify: `components/admin/BulkIgnoreControls.tsx`
- Test: its existing test file
- Modify: destructive-confirm registry (+1 morph row)

- [ ] **Step 1:** Failing tests (spec §10 G4): first tap on X arms X (label `Confirm — ignore all N`, recipe classes; `· label` span present WITHOUT `text-text-subtle`, WITH `font-normal`); tapping armed X fires `ignoreGroup` once; tapping Y while X armed → Y armed, X idle, timer restarted (advance 4s from Y-arm → Y disarms; advancing only X's remainder does NOT disarm Y); `running` disables all and clears armed; error state clears armed; unmount while armed clears the timer (fake timers, no act warnings after unmount).
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement: `const [armedCode, setArmedCode] = useState<string | null>(null);` + single shared timer ref with a `clearArmTimer()` helper + `useEffect(() => clearArmTimer, [])` unmount cleanup (same contract as Task 8's guards); arm/re-arm resets the timer; second tap on armed group clears timer + `setArmedCode(null)` + existing `ignoreGroup(group)` (which sets `running` — also clear armed inside `ignoreGroup`'s entry for safety); error path clears armed. Armed className:
  `inline-flex min-h-tap-min max-w-full items-center justify-start self-start whitespace-normal rounded-sm bg-warning-text px-3 py-1 text-left text-sm font-semibold text-warning-bg transition-colors duration-fast hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg`
  Armed content: `Confirm — ignore all {group.items.length}` + `{group.label ? <span className="ml-1 font-normal">· {group.label}</span> : null}`.
- [ ] **Step 4:** Run + meta-test — PASS. **Step 5: Commit** `feat(admin): two-tap armed-state guard on bulk Ignore all N (G4)`

---

### Task 10: DESIGN.md destructive-actions section + DEFERRED/BACKLOG close-outs

**Files:**
- Modify: `DESIGN.md` (new subsection under the button/action guidance; spec §9)
- Modify: `DEFERRED.md`, `BACKLOG.md`

- [ ] **Step 1:** DESIGN.md subsection "Destructive actions" — prose for C1–C6: the recipe tokens (with the exact literal template), safe-control neutrality, focus-on-open (safe control), auto-revert for trigger-repurposing confirms, focus-on-close (cancel/auto-revert paths, two-phase guard), the guard-tier ladder (typed-confirm for environment wipes → two-tap/panel for irreversible ops → unguarded for reversible ops with a recovery path), enforcement pointer to `tests/styles/_metaDestructiveConfirm.test.ts`, and the discovery caveat (recipe-token growth only). NO §1.1/§1.2 contrast-figure edits (figure-parity untouched — verify by running `pnpm vitest run tests/styles/design-figure-parity.test.ts`).
- [ ] **Step 2:** DEFERRED.md: FLOW4-4, FLOW4-5, FLOW4-6 → `✅ RESOLVED (this PR)` with one-line what-shipped; OVR-1..OVR-7 → `✅ STALE — surface removed (PR #382; feature teardown)`; add a section for this pass's own dual-gate deferrals placeholder ONLY if the impeccable gate later produces any (do not pre-create).
- [ ] **Step 3:** BACKLOG.md: `BL-FLOW4-BULK-UNDO-ERROR-SURFACE` and `BL-FLOW4-CONFIRM-DANGER-STYLE` → ✅ SHIPPED (this PR). Grep for other BL refs in the touched DEFERRED entries and update consistently.
- [ ] **Step 4:** Run `pnpm vitest run tests/styles/` — all style meta-tests green.
- [ ] **Step 5: Commit** `docs: DESIGN destructive-actions contract; DEFERRED/BACKLOG close-outs (FLOW4-4/5/6, OVR stale, BL-FLOW4-*)`

---

### Task 11: Close-out gates

- [ ] `pnpm test` (full suite) — green. If failures appear in files untouched by this diff, check merge-base per memory (`feedback_verify_pre_existing_failures_at_merge_base`) and rebase `origin/main` if stale.
- [ ] `pnpm typecheck` (or `tsc --noEmit` per package.json) — green.
- [ ] `pnpm lint` — green (canonical Tailwind classes rule).
- [ ] `pnpm format:check` — green (run `pnpm format` if not).
- [ ] `pnpm build` — green (client/server boundary check; new refs/effects are client-component-only, but the build gate is cheap insurance).
- [ ] Re-run the two structural meta-tests LAST (format-fragility memory: `feedback_structural_metatest_comment_fragility`).
- [ ] Commit any stragglers; do NOT push (push happens after impeccable dual-gate + whole-diff review per pipeline).

## Self-review notes (writing-plans checklist)

- Spec coverage: C1–C6 (Tasks 1–9), G1–G4 (8–9), R1–R8 (2–6), F1–F4 (7, 2, 3–5), §8 meta-test (1, extended throughout), §9 DESIGN (10), §12 close-outs (10). §7 exceptions = no tasks (correct).
- The five trigger-swap surfaces share one task deliberately: identical pattern, one reviewer gate; per-file code is repeated in the task body, not referenced.
- Type consistency: `bulkUndoOutcome` name used in Task 2 only; `armedCode` in Task 9 only; registry Row shape defined once in Task 1 and only APPENDED later.
