# Group active Data-quality warnings by code (DQIGNORE-6) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group the active Data-quality warning cards by code and render each bulk "Ignore all N" control as an inline chip on a per-code eyebrow header row, so the bulk action is spatially bound to the cards it ignores.

**Architecture:** The page (server) groups the already-ordered active warnings by code (`groupActiveByCode`), computes each group's plain-language label, resolves its bulk-eligibility, and pre-renders each group's cards as a `<PerShowActionableWarnings>` node. It passes an ordered `ActiveWarningGroup[]` into the widened client component `BulkIgnoreControls`, which owns the shared arm/run/error state and renders, per group: an eyebrow row (label + hairline rule + optional "Ignore all N" chip) → the pre-rendered cards → an optional per-group partial-failure notice. Card nodes pass through as slot props (the supported RSC pattern; no client closure crosses the boundary).

**Tech Stack:** Next.js 16 (App Router / RSC), React, TypeScript, Tailwind v4, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-07-17-dq-group-active-by-code.md`.

## Global Constraints

- **Invariant 1 (TDD):** every task is failing test → minimal implementation → green → commit. Never implementation before its test.
- **Invariant 5 (no raw §12.4 codes in UI):** eyebrow label is the plain-language type (catalog title via `messageFor`, else `DATA_GAP_CLASS_LABELS[code]`, else `null`) — NEVER the raw code.
- **Invariant 6 (commit per task):** conventional-commits (`<type>(<scope>): <summary>`); scope `admin` or `crew-page`; one task per commit; `--no-verify` (shared hooks live in the main checkout).
- **Invariant 8 (impeccable dual-gate):** UI surface touched → `/impeccable critique` + `/impeccable audit` on the diff; P0/P1 fixed or deferred via `DEFERRED.md` BEFORE the whole-diff cross-model review (Task 7).
- **Invariant 10 (mutation telemetry):** no new mutation surface — the client `fetch`es the EXISTING `/api/admin/show/{slug}/data-quality/ignore` route (already `AUDITABLE_MUTATIONS`, DQIGNORE-4). No registry change.
- **Destructive-confirm recipe (spec `2026-07-16-destructive-confirm-pass` §4 G4):** the armed chip keeps the `ARMED_BTN` class literal verbatim (`bg-warning-text` / `text-warning-bg` / `font-semibold` / `hover:opacity-90` / `border` / `border-transparent`); one shared `armedCode` + one shared 4s timer; exactly one chip armed panel-wide.
- **Meta-test inventory:** none created/extended (spec §6). Advisory-lock topology: N/A (no `pg_advisory*`). No fixed-dimension parent → no real-browser layout-dimensions task (spec §5.3).
- **Filename `components/admin/BulkIgnoreControls.tsx` is preserved** (widened role) — keeps the `_metaDestructiveConfirm` registry row (`tests/styles/_metaDestructiveConfirm.test.ts:60`, index 0) and the §4 G4 file citation stable. Do not rename.

---

## File Structure

- **Create** `lib/dataQuality/groupActiveByCode.ts` — pure, client-safe helper grouping active warnings by code, first-appearance order.
- **Create** `tests/dataQuality/groupActiveByCode.test.ts` — its unit test.
- **Rewrite** `components/admin/BulkIgnoreControls.tsx` — widened from a stacked-button list to the grouped active list with inline chips; new `ActiveWarningGroup` prop shape; owns shared arm/run/error state.
- **Rewrite** `tests/components/admin/bulkIgnoreControls.test.tsx` — grouped render + inline-chip + per-group-error assertions + all preserved G4 behaviors.
- **Create** `tests/components/admin/bulkIgnoreControlsTransitionAudit.test.tsx` — the mandated transition-audit (spec §5.4).
- **Modify** `app/admin/show/[slug]/page.tsx` — build `activeGroups`, render the widened `<BulkIgnoreControls>`, remove the standalone stacked control + flat active `<PerShowActionableWarnings>`.
- **Modify** `tests/app/admin/perShowPage.test.tsx` — active-area assertions adapt to per-group `<ul>`s.
- **Modify** `DEFERRED.md` — mark DQIGNORE-6 RESOLVED.

**Unaffected (verified):** `tests/admin/perShowActionable{KeyStability,RenderControls}.test.tsx` and `tests/admin/perShowDataQualityActionable.test.tsx` all render `PerShowActionableWarnings` DIRECTLY (component-level), and that component is unchanged — so they do not need edits. `tests/dataQuality/bulkIgnoreGroups.test.ts` is unchanged (grouping semantics untouched). `tests/parser/parseWarningDeepLinkRender.test.tsx` renders `PerShowActionableWarnings` directly — unaffected.

---

## Task 1: `groupActiveByCode` helper

**Files:**
- Create: `lib/dataQuality/groupActiveByCode.ts`
- Test: `tests/dataQuality/groupActiveByCode.test.ts`

**Interfaces:**
- Produces: `export function groupActiveByCode(warnings: readonly ParseWarning[]): { code: string; items: ParseWarning[] }[]` — one entry per distinct code, in first-code-appearance order; each `items` array preserves the input order of that code's warnings; interleaved same-code warnings collapse into one entry. Empty input → `[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { groupActiveByCode } from "@/lib/dataQuality/groupActiveByCode";
import type { ParseWarning } from "@/lib/parser/types";

// Minimal ParseWarning factory — only fields groupActiveByCode reads (code) matter;
// the rest satisfy the type. rawSnippet distinguishes items within a code.
const w = (code: string, rawSnippet: string): ParseWarning =>
  ({ code, message: code, severity: "warn", rawSnippet }) as unknown as ParseWarning;

describe("groupActiveByCode", () => {
  it("returns [] for empty input", () => {
    expect(groupActiveByCode([])).toEqual([]);
  });

  it("groups by code in first-appearance order across digest + actionable codes", () => {
    // Mixed set: a digest code (UNKNOWN_SECTION_HEADER), a non-ignorable digest code
    // (BLOCK_DISAPPEARED), an operator-actionable code (UNKNOWN_FIELD), and a second
    // digest code beyond the two historical examples (SECTION_HEADER_NO_FIELDS) —
    // proves the helper is code-set-agnostic (spec §2; Codex spec R1 finding 2).
    const input = [
      w("UNKNOWN_SECTION_HEADER", "Rigging"),
      w("UNKNOWN_FIELD", "Storage | dock"),
      w("UNKNOWN_SECTION_HEADER", "Catering"), // interleaved same-code → collapses UP into its group
      w("BLOCK_DISAPPEARED", "Hotels"),
      w("SECTION_HEADER_NO_FIELDS", "Notes"),
      w("UNKNOWN_FIELD", "Floor Plan | link"),
    ];
    const groups = groupActiveByCode(input);
    expect(groups.map((g) => g.code)).toEqual([
      "UNKNOWN_SECTION_HEADER",
      "UNKNOWN_FIELD",
      "BLOCK_DISAPPEARED",
      "SECTION_HEADER_NO_FIELDS",
    ]);
    // interleaved same-code warnings collapse into one group, intra-group order preserved
    expect(groups[0]!.items.map((i) => i.rawSnippet)).toEqual(["Rigging", "Catering"]);
    expect(groups[1]!.items.map((i) => i.rawSnippet)).toEqual(["Storage | dock", "Floor Plan | link"]);
    // singleton codes get their own single-item group
    expect(groups[2]!.items).toHaveLength(1);
    expect(groups[3]!.items).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ericweiss/FX-dq-group-active && pnpm vitest run tests/dataQuality/groupActiveByCode.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/dataQuality/groupActiveByCode"`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { ParseWarning } from "@/lib/parser/types";

export type ActiveCodeGroup = { code: string; items: ParseWarning[] };

/**
 * Group the ALREADY-ORDERED active warnings by code, preserving first-code-appearance
 * order (Map insertion order over the ordered input). Interleaved same-code warnings
 * collapse into one group; intra-group order is the input order of that code's items.
 * Code-set-agnostic — it groups over WHATEVER codes are present (spec §2), never
 * special-casing the digest vs operator-actionable split. Client-safe (no node:crypto).
 */
export function groupActiveByCode(warnings: readonly ParseWarning[]): ActiveCodeGroup[] {
  const byCode = new Map<string, ParseWarning[]>();
  for (const w of warnings) {
    const items = byCode.get(w.code);
    if (items) items.push(w);
    else byCode.set(w.code, [w]);
  }
  return [...byCode.entries()].map(([code, items]) => ({ code, items }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/ericweiss/FX-dq-group-active && pnpm vitest run tests/dataQuality/groupActiveByCode.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/ericweiss/FX-dq-group-active && git add lib/dataQuality/groupActiveByCode.ts tests/dataQuality/groupActiveByCode.test.ts && git commit --no-verify -m "feat(admin): groupActiveByCode helper (first-appearance code grouping)"
```

---

## Task 2: Widen `BulkIgnoreControls` to the grouped active list

**Files:**
- Modify (rewrite): `components/admin/BulkIgnoreControls.tsx`
- Modify (rewrite): `tests/components/admin/bulkIgnoreControls.test.tsx`

**Interfaces:**
- Consumes: `ActiveCodeGroup` (Task 1, indirectly — the page maps it), `BulkIgnoreGroupWithLabel` (existing export, kept).
- Produces:
  - `export type ActiveWarningGroup = { code: string; label: string | null; bulk: BulkIgnoreGroupWithLabel | null; cards: ReactNode }`
  - `export type BulkIgnoreGroupWithLabel = BulkIgnoreGroup & { label: string | null }` (unchanged, kept).
  - `export function BulkIgnoreControls({ slug, groups }: { slug: string; groups: ActiveWarningGroup[] }): JSX.Element | null`

**Design notes (read before writing):**
- The eyebrow now carries the type label, so the chip drops the old `· {label}` suffix span — the chip reads exactly `Ignore all N` (idle) / `Confirm: ignore all N` (armed) / `Ignoring…` (running). This removes the armed-span logic entirely.
- `State` gains a `code` on the error branch so the notice renders in the acting group: `{ kind: "idle" } | { kind: "running"; code: string } | { kind: "error"; code: string; copy: string }`.
- The sr-only `role="status"` span stays as the chip's immediate `nextElementSibling` (tests read `btn.nextElementSibling`).
- `ARMED_BTN` and `BTN` class literals are **unchanged** (preserves the `_metaDestructiveConfirm` registry row). `ARM_REVERT_MS = 4_000` unchanged. `ignoreGroup`, `onGuardedClick`, `clearArmTimer`, the `useEffect(() => clearArmTimer, [])` cleanup, and the fan-out/refresh/partial-failure logic are moved VERBATIM, operating on the passed `BulkIgnoreGroupWithLabel` (`group.bulk`).

- [ ] **Step 1: Write the failing test** (full rewrite of `tests/components/admin/bulkIgnoreControls.test.tsx`)

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { BulkIgnoreControls, type ActiveWarningGroup } from "@/components/admin/BulkIgnoreControls";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  refresh.mockReset();
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => cleanup());

function okResponse(): Response {
  return { ok: true, json: async () => ({ status: "ignored" }) } as unknown as Response;
}

// A bulk-eligible group (2 distinct contents) + a card slot marker.
const bulkGroup = (): ActiveWarningGroup => ({
  code: "UNKNOWN_FIELD",
  label: "Unrecognized row in sheet",
  bulk: {
    code: "UNKNOWN_FIELD",
    label: "Unrecognized row in sheet",
    items: [
      { code: "UNKNOWN_FIELD", rawSnippet: "Storage | dock" },
      { code: "UNKNOWN_FIELD", rawSnippet: "Floor Plan | link" },
    ],
  },
  cards: <ul data-testid="cards-UNKNOWN_FIELD" />,
});

// A singleton / non-ignorable group: no bulk → no chip.
const singletonGroup = (): ActiveWarningGroup => ({
  code: "BLOCK_DISAPPEARED",
  label: "removed section",
  bulk: null,
  cards: <ul data-testid="cards-BLOCK_DISAPPEARED" />,
});

describe("BulkIgnoreControls (grouped active list)", () => {
  test("renders nothing when there are no groups", () => {
    const { container } = render(<BulkIgnoreControls slug="rpas" groups={[]} />);
    expect(container.firstChild).toBeNull();
  });

  test("every group renders an eyebrow with its label + its cards; only bulk-eligible groups get a chip", () => {
    render(<BulkIgnoreControls slug="rpas" groups={[bulkGroup(), singletonGroup()]} />);
    // eyebrow labels (plain-language, never the raw code)
    expect(screen.getByText("Unrecognized row in sheet")).toBeInTheDocument();
    expect(screen.getByText("removed section")).toBeInTheDocument();
    expect(screen.queryByText("UNKNOWN_FIELD")).toBeNull(); // invariant 5: raw code never printed
    expect(screen.queryByText("BLOCK_DISAPPEARED")).toBeNull();
    // cards slotted through
    expect(screen.getByTestId("cards-UNKNOWN_FIELD")).toBeInTheDocument();
    expect(screen.getByTestId("cards-BLOCK_DISAPPEARED")).toBeInTheDocument();
    // chip only on the bulk-eligible group
    expect(screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD")).toBeInTheDocument();
    expect(screen.queryByTestId("dq-bulk-ignore-BLOCK_DISAPPEARED")).toBeNull();
  });

  test("chip count derives from the group's distinct-content items", () => {
    const g = bulkGroup();
    render(<BulkIgnoreControls slug="rpas" groups={[g]} />);
    const chip = screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD");
    expect(chip.textContent).toBe(`Ignore all ${g.bulk!.items.length}`); // no "· label" suffix now
  });

  test("Ignore all N fires one POST per distinct item, then refreshes; chip re-enables", async () => {
    fetchMock.mockResolvedValue(okResponse());
    render(<BulkIgnoreControls slug="rpas" groups={[bulkGroup()]} />);
    const chip = screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD") as HTMLButtonElement;
    fireEvent.click(chip); // arm
    fireEvent.click(chip); // confirm → fires
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));
    expect(bodies).toEqual([
      { code: "UNKNOWN_FIELD", rawSnippet: "Storage | dock" },
      { code: "UNKNOWN_FIELD", rawSnippet: "Floor Plan | link" },
    ]);
    for (const c of fetchMock.mock.calls) {
      expect(c[0]).toBe("/api/admin/show/rpas/data-quality/ignore");
      expect((c[1] as RequestInit).method).toBe("POST");
    }
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(chip.disabled).toBe(false));
  });

  test("partial fan-out failure reports 'Ignored X of N' INSIDE the acting group and does NOT refresh", async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) } as unknown as Response);
    render(<BulkIgnoreControls slug="rpas" groups={[bulkGroup(), singletonGroup()]} />);
    fireEvent.click(screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD"));
    fireEvent.click(screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Ignored 1 of 2/);
    expect(refresh).not.toHaveBeenCalled();
    // the notice lives in the acting group's wrapper, below its cards — not at panel top
    const group = screen.getByTestId("dq-active-group-UNKNOWN_FIELD");
    expect(within(group).getByRole("alert")).toBe(alert);
    expect(within(group).getByTestId("cards-UNKNOWN_FIELD").compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test("total fan-out failure shows the generic retry copy", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) } as unknown as Response);
    render(<BulkIgnoreControls slug="rpas" groups={[bulkGroup()]} />);
    fireEvent.click(screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD"));
    fireEvent.click(screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Couldn't ignore those warnings/);
    expect(refresh).not.toHaveBeenCalled();
  });

  describe("G4 two-tap armed-state guard (single-armed panel-wide)", () => {
    const groupX = bulkGroup(); // UNKNOWN_FIELD, 2 items
    const groupY: ActiveWarningGroup = {
      code: "FIELD_UNREADABLE",
      label: "Unreadable field",
      bulk: {
        code: "FIELD_UNREADABLE",
        label: "Unreadable field",
        items: [
          { code: "FIELD_UNREADABLE", rawSnippet: "Crew phone | ???" },
          { code: "FIELD_UNREADABLE", rawSnippet: "Hotel | ???" },
          { code: "FIELD_UNREADABLE", rawSnippet: "Venue | ???" },
        ],
      },
      cards: <ul data-testid="cards-FIELD_UNREADABLE" />,
    };
    const twoGroups = [groupX, groupY];

    function expectDestructiveRecipe(el: HTMLElement) {
      const tokens = el.className.split(/\s+/);
      for (const t of ["bg-warning-text", "text-warning-bg", "font-semibold", "hover:opacity-90", "border", "border-transparent"]) {
        expect(tokens).toContain(t);
      }
      for (const t of ["bg-accent", "bg-surface", "bg-bg"]) expect(tokens).not.toContain(t);
    }

    afterEach(() => vi.useRealTimers());

    test("first tap arms: no fetch, Confirm label + recipe classes", () => {
      vi.useFakeTimers();
      render(<BulkIgnoreControls slug="rpas" groups={twoGroups} />);
      const btn = screen.getByTestId(`dq-bulk-ignore-${groupX.code}`);
      fireEvent.click(btn);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(btn.textContent).toBe(`Confirm: ignore all ${groupX.bulk!.items.length}`);
      expectDestructiveRecipe(btn);
    });

    test("second tap on the armed group fires once and clears the pending disarm timer", () => {
      vi.useFakeTimers();
      fetchMock.mockResolvedValue(okResponse());
      render(<BulkIgnoreControls slug="rpas" groups={twoGroups} />);
      const btn = screen.getByTestId(`dq-bulk-ignore-${groupX.code}`);
      fireEvent.click(btn);
      fireEvent.click(btn);
      expect(fetchMock).toHaveBeenCalledTimes(groupX.bulk!.items.length);
      expect(vi.getTimerCount()).toBe(0);
    });

    test("tapping Y while X is armed re-arms Y with a restarted timer; X reverts (single-armed)", () => {
      vi.useFakeTimers();
      render(<BulkIgnoreControls slug="rpas" groups={twoGroups} />);
      const btnX = screen.getByTestId(`dq-bulk-ignore-${groupX.code}`);
      const btnY = screen.getByTestId(`dq-bulk-ignore-${groupY.code}`);
      fireEvent.click(btnX);
      act(() => vi.advanceTimersByTime(2_000));
      fireEvent.click(btnY);
      expect(btnX.textContent).toBe(`Ignore all ${groupX.bulk!.items.length}`);
      expect(btnY.textContent).toBe(`Confirm: ignore all ${groupY.bulk!.items.length}`);
      act(() => vi.advanceTimersByTime(2_500)); // past X's original window, only 2.5s from Y's arm
      expect(btnY.textContent).toContain("Confirm");
      act(() => vi.advanceTimersByTime(1_500)); // 4s from Y's arm → disarms Y
      expect(btnY.textContent).toBe(`Ignore all ${groupY.bulk!.items.length}`);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    test("4s auto-revert restores the idle branch without firing", () => {
      vi.useFakeTimers();
      render(<BulkIgnoreControls slug="rpas" groups={twoGroups} />);
      const btn = screen.getByTestId(`dq-bulk-ignore-${groupX.code}`);
      const idleClass = btn.className;
      fireEvent.click(btn);
      expect(btn.textContent).toContain("Confirm");
      act(() => vi.advanceTimersByTime(4_000));
      expect(btn.textContent).toBe(`Ignore all ${groupX.bulk!.items.length}`);
      expect(btn.className).toBe(idleClass);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    test("per-group sr-only status region announces arming and clears on auto-revert", () => {
      vi.useFakeTimers();
      render(<BulkIgnoreControls slug="rpas" groups={twoGroups} />);
      const btnX = screen.getByTestId(`dq-bulk-ignore-${groupX.code}`);
      const btnY = screen.getByTestId(`dq-bulk-ignore-${groupY.code}`);
      const regionX = btnX.nextElementSibling as HTMLElement;
      const regionY = btnY.nextElementSibling as HTMLElement;
      for (const region of [regionX, regionY]) {
        expect(region.getAttribute("role")).toBe("status");
        expect(region.className.split(/\s+/)).toContain("sr-only");
        expect(region.textContent).toBe("");
      }
      fireEvent.click(btnX);
      expect(regionX.textContent).toBe("Tap again to confirm.");
      expect(regionY.textContent).toBe("");
      act(() => vi.advanceTimersByTime(4_000));
      expect(btnX.nextElementSibling).toBe(regionX); // never unmounted
      expect(regionX.textContent).toBe("");
    });

    test("running disables ALL chips and clears armed", async () => {
      const resolvers: Array<(r: Response) => void> = [];
      fetchMock.mockImplementation(() => new Promise<Response>((resolve) => resolvers.push(resolve)));
      render(<BulkIgnoreControls slug="rpas" groups={twoGroups} />);
      const btnX = screen.getByTestId(`dq-bulk-ignore-${groupX.code}`) as HTMLButtonElement;
      const btnY = screen.getByTestId(`dq-bulk-ignore-${groupY.code}`) as HTMLButtonElement;
      fireEvent.click(btnX);
      fireEvent.click(btnX);
      await waitFor(() => expect(btnX.textContent).toContain("Ignoring…"));
      expect(btnX.disabled).toBe(true);
      expect(btnY.disabled).toBe(true);
      expect(btnX.textContent).not.toContain("Confirm");
      expect(btnY.textContent).not.toContain("Confirm");
      await act(async () => { for (const r of resolvers) r(okResponse()); });
      await waitFor(() => expect(btnX.disabled).toBe(false));
    });

    test("error outcome leaves no group armed; a fresh tap re-arms cleanly", async () => {
      fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) } as unknown as Response);
      render(<BulkIgnoreControls slug="rpas" groups={twoGroups} />);
      const btn = screen.getByTestId(`dq-bulk-ignore-${groupX.code}`);
      fireEvent.click(btn);
      fireEvent.click(btn);
      await screen.findByRole("alert");
      expect(btn.textContent).not.toContain("Confirm");
      fireEvent.click(btn);
      expect(btn.textContent).toBe(`Confirm: ignore all ${groupX.bulk!.items.length}`);
      expect(fetchMock).toHaveBeenCalledTimes(groupX.bulk!.items.length);
    });

    test("unmount while armed clears the timer", () => {
      vi.useFakeTimers();
      const { unmount } = render(<BulkIgnoreControls slug="rpas" groups={twoGroups} />);
      fireEvent.click(screen.getByTestId(`dq-bulk-ignore-${groupX.code}`));
      expect(vi.getTimerCount()).toBe(1);
      unmount();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ericweiss/FX-dq-group-active && pnpm vitest run tests/components/admin/bulkIgnoreControls.test.tsx`
Expected: FAIL — the old component's `groups` prop shape (`BulkIgnoreGroupWithLabel[]`) does not match `ActiveWarningGroup[]`; `dq-active-group-*` testids and slotted `cards` are absent.

- [ ] **Step 3: Write minimal implementation** (full rewrite of `components/admin/BulkIgnoreControls.tsx`)

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { BulkIgnoreGroup } from "@/lib/dataQuality/bulkIgnoreGroups";

export type BulkIgnoreGroupWithLabel = BulkIgnoreGroup & {
  /** Plain-language type label (catalog title / data-gap label), or null. Never the raw code. */
  label: string | null;
};

/**
 * One per-code group of the ACTIVE data-quality list. The page pre-renders `cards`
 * (a `<PerShowActionableWarnings>` server node) and passes it through as a slot prop —
 * the supported RSC pattern (server nodes as props of a client component). `bulk` is
 * present iff the code is bulk-eligible (>=2 distinct-content active ignorable warnings).
 */
export type ActiveWarningGroup = {
  code: string;
  label: string | null;
  bulk: BulkIgnoreGroupWithLabel | null;
  cards: ReactNode;
};

type Props = { slug: string; groups: ActiveWarningGroup[] };
type State =
  | { kind: "idle" }
  | { kind: "running"; code: string }
  | { kind: "error"; code: string; copy: string };

// Neutral chip skin (idle). Renders on the panel `bg`, so the focus ring-offset is `bg`.
const BTN =
  "inline-flex min-h-tap-min max-w-full items-center justify-start self-start whitespace-normal rounded-sm border border-border-strong bg-bg px-3 py-1 text-left text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

// G4 armed branch (spec 2026-07-16-destructive-confirm-pass §4): destructive recipe fill (C1),
// same shape/wrap as idle; border-transparent compensates the idle border (no layout shift).
const ARMED_BTN =
  "inline-flex min-h-tap-min max-w-full items-center justify-start self-start whitespace-normal rounded-sm border border-transparent bg-warning-text px-3 py-1 text-left text-sm font-semibold text-warning-bg transition-opacity duration-fast hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

const ARM_REVERT_MS = 4_000;

/**
 * DQIGNORE-6 — the ACTIVE data-quality list, grouped by code. Each group renders an
 * eyebrow (plain-language type label + hairline rule) and, when bulk-eligible, an inline
 * "Ignore all N" chip on that eyebrow row; the group's cards render below, and a
 * partial-failure notice (if any) renders below the acting group's cards. The chip's
 * two-tap arm→confirm guard, single-armed-panel-wide invariant (one shared armedCode +
 * timer), and per-fingerprint fan-out are unchanged from DQIGNORE-2/§4 G4. Renders null
 * when there are no active groups.
 */
export function BulkIgnoreControls({ slug, groups }: Props) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [armedCode, setArmedCode] = useState<string | null>(null);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function clearArmTimer() {
    if (armTimerRef.current !== null) {
      clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
  }
  useEffect(() => clearArmTimer, []);

  function onGuardedClick(group: BulkIgnoreGroupWithLabel) {
    if (armedCode !== group.code) {
      setArmedCode(group.code);
      clearArmTimer();
      armTimerRef.current = setTimeout(() => {
        armTimerRef.current = null;
        setArmedCode(null);
      }, ARM_REVERT_MS);
      return;
    }
    clearArmTimer();
    setArmedCode(null);
    void ignoreGroup(group);
  }

  async function ignoreGroup(group: BulkIgnoreGroupWithLabel) {
    clearArmTimer();
    setArmedCode(null);
    setState({ kind: "running", code: group.code });
    const failCopy = "Couldn't ignore those warnings. Refresh and try again.";
    try {
      const results = await Promise.all(
        group.items.map((it) =>
          fetch(`/api/admin/show/${encodeURIComponent(slug)}/data-quality/ignore`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ code: it.code, rawSnippet: it.rawSnippet }),
          })
            .then((r) => r.ok)
            .catch(() => false),
        ),
      );
      const ok = results.filter(Boolean).length;
      if (ok === results.length) {
        setState({ kind: "idle" });
        router.refresh();
        return;
      }
      setArmedCode(null);
      setState({
        kind: "error",
        code: group.code,
        copy: ok > 0 ? `Ignored ${ok} of ${results.length}. Refresh to see the rest.` : failCopy,
      });
    } catch {
      setArmedCode(null);
      setState({ kind: "error", code: group.code, copy: failCopy });
    }
  }

  if (groups.length === 0) return null;

  return (
    <div className="flex flex-col gap-4" data-testid="dq-active-groups">
      {groups.map((group) => {
        const running = state.kind === "running" && state.code === group.code;
        const armed = armedCode === group.code;
        const errored = state.kind === "error" && state.code === group.code;
        const bulk = group.bulk;
        return (
          <div
            key={group.code}
            className="flex flex-col gap-2"
            data-testid={`dq-active-group-${group.code}`}
          >
            <div className="flex items-center gap-2">
              {group.label ? (
                <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-eyebrow text-text-subtle">
                  {group.label}
                </span>
              ) : null}
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
              {bulk ? (
                <>
                  <button
                    type="button"
                    data-testid={`dq-bulk-ignore-${group.code}`}
                    onClick={() => onGuardedClick(bulk)}
                    disabled={state.kind === "running"}
                    aria-busy={running}
                    className={armed ? ARMED_BTN : BTN}
                  >
                    {running
                      ? "Ignoring…"
                      : armed
                        ? `Confirm: ignore all ${bulk.items.length}`
                        : `Ignore all ${bulk.items.length}`}
                  </button>
                  {/* Persistent sr-only live region (always mounted — conditional mounting
                      drops the announcement). Kept as the chip's nextElementSibling. */}
                  <span role="status" className="sr-only">
                    {armed ? "Tap again to confirm." : ""}
                  </span>
                </>
              ) : null}
            </div>
            {group.cards}
            {errored ? (
              <p
                role="alert"
                data-testid="dq-bulk-ignore-error"
                className="rounded-sm border border-border-strong bg-warning-bg p-2 text-xs text-warning-text"
              >
                {state.copy}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/ericweiss/FX-dq-group-active && pnpm vitest run tests/components/admin/bulkIgnoreControls.test.tsx`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/ericweiss/FX-dq-group-active && git add components/admin/BulkIgnoreControls.tsx tests/components/admin/bulkIgnoreControls.test.tsx && git commit --no-verify -m "feat(admin): grouped active DQ list with inline bulk-ignore chip (DQIGNORE-6)"
```

---

## Task 3: Wire the page — build `activeGroups`, render the widened control

**Files:**
- Modify: `app/admin/show/[slug]/page.tsx` (import at `:75`; derivations `:459-469`; render `:927-963`)
- Modify: `tests/app/admin/perShowPage.test.tsx` (active-area assertions `:828`, `:856`, `:882`)

**Interfaces:**
- Consumes: `groupActiveByCode` (Task 1), `BulkIgnoreControls` + `ActiveWarningGroup` (Task 2).

- [ ] **Step 1: Write/adjust the failing test** — add a grouped-render assertion to `tests/app/admin/perShowPage.test.tsx` and fix the now-multiplied active-list queries.

Add this test inside the existing `describe("per-show Data quality: Report + Ignore (Task 13)", …)` block (fixture helpers already exist there — mirror the neighboring tests' `renderPage`/fixture setup; seed TWO distinct active codes, one bulk-eligible with ≥2 distinct contents):

```tsx
test("active warnings render grouped by code with an eyebrow per code (DQIGNORE-6)", async () => {
  // Seed: 2 distinct-content UNKNOWN_FIELD (bulk-eligible) + 1 UNKNOWN_SECTION_HEADER (singleton).
  // (Use the block's existing fixture builder; see sibling tests for the exact seam.)
  await renderActiveWarnings([
    { code: "UNKNOWN_FIELD", rawSnippet: "Storage | dock" },
    { code: "UNKNOWN_FIELD", rawSnippet: "Floor Plan | link" },
    { code: "UNKNOWN_SECTION_HEADER", rawSnippet: "Rigging" },
  ]);
  // one chip on the bulk-eligible group; none on the singleton
  expect(screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD")).toBeInTheDocument();
  expect(screen.queryByTestId("dq-bulk-ignore-UNKNOWN_SECTION_HEADER")).toBeNull();
  // each code is its own group wrapper
  expect(screen.getByTestId("dq-active-group-UNKNOWN_FIELD")).toBeInTheDocument();
  expect(screen.getByTestId("dq-active-group-UNKNOWN_SECTION_HEADER")).toBeInTheDocument();
  // active cards now render one <ul> per group (no single flat active list)
  expect(screen.getAllByTestId("per-show-actionable-warnings").length).toBeGreaterThanOrEqual(2);
});
```

> **Implementer note:** the exact fixture seam (`renderActiveWarnings` above is illustrative) must match the sibling tests in that block — read `:815-860` and reuse their setup verbatim rather than inventing a helper. Then fix the pre-existing singular queries that now match multiple nodes: `:828` and `:856` `getByTestId("per-show-actionable-warnings")` → scope to a group (`within(screen.getByTestId("dq-active-group-<code>"))`) or `getAllByTestId(...)[0]`; `:882` (legacy UNKNOWN_FIELD 2-item case) likewise scopes to `dq-active-group-UNKNOWN_FIELD`. The IGNORED-subsection assertions (within `per-show-ignored-warnings`) are unchanged — that list stays flat.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/ericweiss/FX-dq-group-active && pnpm vitest run tests/app/admin/perShowPage.test.tsx`
Expected: FAIL — `dq-active-group-*` testids absent (page still renders the old flat list + stacked control); and the singular `getByTestId("per-show-actionable-warnings")` calls throw "multiple elements" once grouping lands.

- [ ] **Step 3: Implement the page change**

In `app/admin/show/[slug]/page.tsx`:

(a) Add the import next to the existing bulk import (`:75`):

```tsx
import { groupActiveByCode } from "@/lib/dataQuality/groupActiveByCode";
```

and extend the `BulkIgnoreControls` import to bring in the new type (`:70-73`):

```tsx
import {
  BulkIgnoreControls,
  type ActiveWarningGroup,
} from "@/components/admin/BulkIgnoreControls";
```

(`BulkIgnoreGroupWithLabel` is still exported and still used by the `bulkIgnoreGroups` derivation — keep that named import too.)

(b) After the `bulkIgnoreGroups` derivation (`:467-469`), build the active groups. Reuse the existing `bulkGroupLabel` closure (`:459-466`) and the SAME `renderItemControls` slot the flat active list used:

```tsx
const bulkByCode = new Map(bulkIgnoreGroups.map((g) => [g.code, g] as const));
const renderActiveItemControls = (w: ParseWarning) => (
  <>
    <DataQualityWarningControls
      slug={show.slug}
      showId={show.id}
      warning={w}
      driveFileId={show.drive_file_id}
      mode="active"
      reportSurfaceId={buildReportSurfaceId(show.slug, w)}
    />
    <UseRawControlBoundary surface="show" showId={show.id} warning={w} decision={decisionFor(w)} />
    <RoleRecognizeControlBoundary surface="show" showId={show.id} warning={w} />
  </>
);
const activeGroups: ActiveWarningGroup[] = groupActiveByCode(activeActionable).map((g) => ({
  code: g.code,
  label: bulkGroupLabel(g.code),
  bulk: bulkByCode.get(g.code) ?? null,
  cards: (
    <PerShowActionableWarnings
      items={g.items}
      driveFileId={show.drive_file_id}
      renderItemControls={renderActiveItemControls}
    />
  ),
}));
```

(c) Replace the render block `:927-963` (the `{/* DQIGNORE-2 … */}` comment through the closing `/>` of the flat active `<PerShowActionableWarnings>`) with a single call — the widened control now renders BOTH the eyebrow/chip headers AND the grouped cards:

```tsx
{/* DQIGNORE-6 — active warnings grouped by code; each bulk "Ignore all N" chip is
    its group's eyebrow header, bound to the cards it ignores. Renders null when there
    are no active warnings. */}
<BulkIgnoreControls slug={show.slug} groups={activeGroups} />
```

Leave the `CorrectionLoopCallout` block (`:922-926`) above and the `Ignored (N)` `<details>` block (`:964-1011`) below unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/ericweiss/FX-dq-group-active && pnpm vitest run tests/app/admin/perShowPage.test.tsx tests/admin/perShowActionableRenderControls.test.tsx tests/admin/perShowActionableKeyStability.test.tsx tests/admin/perShowDataQualityActionable.test.tsx`
Expected: PASS (perShowPage adapted; the three component-level suites unchanged and still green).

- [ ] **Step 5: Typecheck the page (RSC boundary sanity)**

Run: `cd /Users/ericweiss/FX-dq-group-active && pnpm typecheck`
Expected: PASS — `ActiveWarningGroup.cards: ReactNode` accepts the server node; no client-boundary type error.

- [ ] **Step 6: Commit**

```bash
cd /Users/ericweiss/FX-dq-group-active && git add app/admin/show/\[slug\]/page.tsx tests/app/admin/perShowPage.test.tsx && git commit --no-verify -m "feat(admin): render grouped active DQ warnings on the per-show page (DQIGNORE-6)"
```

---

## Task 4: Transition-audit (spec §5.4 — mandated for the chip morph)

**Files:**
- Create: `tests/components/admin/bulkIgnoreControlsTransitionAudit.test.tsx`

**Transition inventory (from spec §5.4 — no NEW transitions; relocated chip only):**

| From \ To | idle | armed | running | error |
|---|---|---|---|---|
| **idle** | — | instant class morph BTN→ARMED_BTN (tap) | (via armed) | (via running) |
| **armed** | instant, 4s auto-revert OR re-arm-elsewhere | re-arm self = no-op | instant (confirm tap) | — |
| **running** | instant on full success (+`router.refresh`) | — | — | instant on partial/total failure |
| **error** | instant on fresh arm | instant (fresh tap arms) | (via armed) | — |

Static (no state, no transition): eyebrow label, hairline rule, slotted cards. Compound: arming Y while X armed → X reverts + Y arms in one commit (single shared timer). All morphs are instant class swaps (no `AnimatePresence`, no `transition` on layout) except the recipe's own `transition-opacity`/`transition-colors` on the button, which are inherited unchanged from §4 G4.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BulkIgnoreControls, type ActiveWarningGroup } from "@/components/admin/BulkIgnoreControls";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
beforeEach(() => { global.fetch = vi.fn() as unknown as typeof fetch; });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const g = (): ActiveWarningGroup => ({
  code: "UNKNOWN_FIELD",
  label: "Unrecognized row in sheet",
  bulk: { code: "UNKNOWN_FIELD", label: "Unrecognized row in sheet", items: [
    { code: "UNKNOWN_FIELD", rawSnippet: "a | 1" }, { code: "UNKNOWN_FIELD", rawSnippet: "b | 2" },
  ] },
  cards: <ul data-testid="cards" />,
});

describe("BulkIgnoreControls transition audit (spec §5.4)", () => {
  test("idle→armed is an instant class morph (no AnimatePresence / conditional remount of the chip)", () => {
    render(<BulkIgnoreControls slug="rpas" groups={[g()]} />);
    const chip = screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD");
    const before = chip; // same element identity across the morph (no remount)
    fireEvent.click(chip);
    expect(screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD")).toBe(before);
    // recipe uses transition-opacity (inherited from §4 G4), not a layout transition
    expect(before.className).toContain("transition-opacity");
  });

  test("armed→idle auto-revert is instant and restores the exact idle class (no leftover recipe token)", () => {
    vi.useFakeTimers();
    render(<BulkIgnoreControls slug="rpas" groups={[g()]} />);
    const chip = screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD");
    const idle = chip.className;
    fireEvent.click(chip);
    expect(chip.className).not.toBe(idle);
    act(() => vi.advanceTimersByTime(4_000));
    expect(chip.className).toBe(idle);
    expect(chip.className).not.toContain("bg-warning-text");
  });

  test("eyebrow label + hairline rule are static (present and unchanged across the chip morph)", () => {
    render(<BulkIgnoreControls slug="rpas" groups={[g()]} />);
    const label = screen.getByText("Unrecognized row in sheet");
    const beforeClass = label.className;
    fireEvent.click(screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD"));
    expect(screen.getByText("Unrecognized row in sheet").className).toBe(beforeClass);
  });
});
```

- [ ] **Step 2: Run test to verify it fails then passes**

Run: `cd /Users/ericweiss/FX-dq-group-active && pnpm vitest run tests/components/admin/bulkIgnoreControlsTransitionAudit.test.tsx`
Expected: after Task 2's component is in place, this PASSES; if written before Task 2 it FAILS on the missing testid. (Task 4 runs after Task 2, so expect PASS; the test still earns its keep by pinning the no-remount + instant-revert contract.)

- [ ] **Step 3: Commit**

```bash
cd /Users/ericweiss/FX-dq-group-active && git add tests/components/admin/bulkIgnoreControlsTransitionAudit.test.tsx && git commit --no-verify -m "test(admin): transition audit for relocated bulk-ignore chip (spec §5.4)"
```

---

## Task 5: Regression sweep + meta-test + DEFERRED close-out

**Files:**
- Modify: `DEFERRED.md` (DQIGNORE-6 → RESOLVED)

- [ ] **Step 1: Run the destructive-confirm meta-test (registry stability)**

Run: `cd /Users/ericweiss/FX-dq-group-active && pnpm vitest run tests/styles/_metaDestructiveConfirm.test.ts`
Expected: PASS — `BulkIgnoreControls.tsx` index-0 morph row still matches the unchanged `ARMED_BTN` literal. If it FAILS, the `ARMED_BTN` class drifted — restore it verbatim (do not edit the registry).

- [ ] **Step 2: Full test suite + typecheck + lint + format (pre-push gates)**

Run: `cd /Users/ericweiss/FX-dq-group-active && pnpm test && pnpm typecheck && pnpm lint && pnpm format:check`
Expected: all PASS. (Full suite catches any grep-the-source registry that references the changed page/component — e.g. forensic-code / help-affordance / transition-audit scanners. Fix any that legitimately reference the moved render.)

- [ ] **Step 3: Mark DQIGNORE-6 resolved in `DEFERRED.md`**

Replace the `### DQIGNORE-6 — [P1 critique → deferred] …` heading + body (`DEFERRED.md:217-221`) with a RESOLVED note:

```markdown
### DQIGNORE-6 — ✅ RESOLVED (feat/dq-group-active-by-code, 2026-07-17)

Active data-quality warnings now render grouped by code (`lib/dataQuality/groupActiveByCode.ts`); each bulk "Ignore all N" control is an inline chip on its group's eyebrow header row, bound to the cards it ignores (`components/admin/BulkIgnoreControls.tsx`, widened; rendered at `app/admin/show/[slug]/page.tsx`). Every active code carries a plain-language eyebrow label (never the raw code); singleton + non-ignorable codes (e.g. `BLOCK_DISAPPEARED` → "removed section") get the eyebrow with no chip. The two-tap destructive recipe, single-armed-panel-wide invariant (§4 G4), and per-fingerprint fan-out are preserved. The "Ignored (N)" subsection stays flat. Spec/plan: `docs/superpowers/{specs,plans}/2026-07-17-dq-group-active-by-code*`.
```

- [ ] **Step 4: Commit**

```bash
cd /Users/ericweiss/FX-dq-group-active && git add DEFERRED.md && git commit --no-verify -m "docs: mark DQIGNORE-6 resolved (grouped active DQ list)"
```

---

## Task 6: Invariant-8 impeccable dual-gate (UI surface)

**Files:** none by default (evaluation gate); any P0/P1 fix lands in its own follow-up commit; deferrals go to `DEFERRED.md`.

- [ ] **Step 1: Run `/impeccable critique`** on the diff (canonical v3 setup gates: `context.mjs` PRODUCT.md + DESIGN.md load → register reference read). Surface = `app/admin/show/[slug]/page.tsx`, `components/admin/BulkIgnoreControls.tsx`. Focus: the new eyebrow row (label + rule + inline chip), spacing/hierarchy on a ~390px phone, the chip's right-alignment, and that the grouped structure reads as intended.
- [ ] **Step 2: Run `/impeccable audit`** on the same diff (accessibility / performance / theming / responsive / anti-patterns).
- [ ] **Step 3:** Fix every P0/P1 inline (own commit), or record an explicit `DEFERRED.md` entry per finding with a cited rationale. Record findings + dispositions in the plan's close-out notes / a handoff §12 stub.
- [ ] **Step 4: Commit** any fixes:

```bash
cd /Users/ericweiss/FX-dq-group-active && git add -A && git commit --no-verify -m "fix(admin): impeccable P0/P1 fixes for grouped DQ list"
```

(If critique + audit pass clean with no P0/P1, note that in the close-out and skip the commit.)

---

## Task 7: Whole-diff cross-model review + CI + merge (Stage 4 — orchestrator-driven)

This task is executed by the ship-feature pipeline, not a sub-implementer:

- [ ] Whole-diff Codex adversarial review (fresh-eyes, REVIEWER ONLY) → iterate to APPROVE.
- [ ] Push; open PR; verify **real GitHub Actions CI green** (not just local); reconcile if DIRTY/behind base.
- [ ] `gh pr merge --merge`; fast-forward local `main`; verify `git rev-list --left-right --count main...origin/main` == `0  0`.

---

## Self-Review (author, against the spec)

- **Spec coverage:** §2 layout → Tasks 2+3; §3 behavior-preserved → Task 2 (all G4 tests); §4 guards → Task 2 (empty/null-label/singleton/non-ignorable/partial) + Task 3 (page-level); §5.1 data boundary → Task 3; §5.2 client component → Task 2; §5.3 no layout-dims task → honored (none); §5.4 transition inventory → Task 4; §6 tests + meta-inventory → Tasks 1-5; §7 invariants → Global Constraints + Tasks 5/6; §8 do-not-relitigate → carried into commit messages + DEFERRED note. No gaps.
- **Placeholder scan:** the only non-literal is Task 3's `renderActiveWarnings` fixture seam, explicitly flagged as "match the sibling tests' setup" (the block's fixture builder is pre-existing; inventing one would be wrong). All code steps carry real code.
- **Type consistency:** `ActiveWarningGroup` / `BulkIgnoreGroupWithLabel` / `groupActiveByCode` signatures match across Tasks 1-3; `State.error` gains `code` consistently used by the notice render.
