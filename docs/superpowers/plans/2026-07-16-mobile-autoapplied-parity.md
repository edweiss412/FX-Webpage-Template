# Mobile auto-applied parity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give mobile admins a path to count and disposition auto-applied changes by mounting `RecentAutoAppliedStrip` on `/admin/needs-attention` and adding an "N auto-applied" chip to the mobile summary card.

**Architecture:** No new read module — the page composes the two already-registered loaders (`loadNeedsAttention` + `loadRecentAutoApplied`) and passes `publishedShowIds: []` (the arg feeds only the roster-badge RPC, which this page doesn't render). The strip gains a `headingLevel` prop so the same component renders `h4/h5` on the dashboard and `h2/h3` on the page (no h1→h4 skip). The 3 auto-applied actions add a `revalidatePath("/admin/needs-attention")`. Ride-along FLOW4-7 swaps the strip's `aria-label` for `aria-labelledby`.

**Tech Stack:** Next.js 16 RSC, React 19, Tailwind v4, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-07-16-mobile-autoapplied-parity.md` (Codex-APPROVED, 5 rounds).

## Global Constraints

- **TDD per task** — failing test → minimal impl → passing test → commit. (AGENTS.md invariant 1)
- **No raw error codes in UI** — strip degraded copy is a fixed sentence; never a code. (invariant 5)
- **Supabase call-boundary** — no new helper; existing loaders already destructure `{data,error}` + typed infra. (invariant 9)
- **Mutation telemetry** — no new mutation surface; the 3 actions already carry `logAdminOutcome` + `AUDITABLE_MUTATIONS` membership. Adding a second `revalidatePath` does not change surface discovery. (invariant 10)
- **Advisory locks** — untouched; actions delegate to self-locking helpers (single-holder). (invariant 2)
- **Conventional commits** — `feat(admin):` / `test(admin):` / `docs:` scoped. (invariant 6)
- **Impeccable dual-gate** — UI surface touched; critique + audit before whole-diff review. (invariant 8)
- **Heading-tag type-safety** — derive JSX tags by ternary yielding a string-literal union (`headingLevel === 2 ? "h2" : "h4"`), NEVER `` `h${n}` `` interpolation or `n+1` arithmetic (breaks strict TS + `exactOptionalPropertyTypes`).
- **`useId()` unconditional** — called before any early return (rules-of-hooks).
- **Pre-push gates** — `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, full `pnpm test` all green before push (`--no-verify` bypasses hooks).

## File Structure

| File | Responsibility | Change |
| --- | --- | --- |
| `components/admin/RecentAutoAppliedStrip.tsx` | strip component | Add `headingLevel?: 2\|4`; dynamic section + group heading tags; `aria-label`→`aria-labelledby` via unconditional `useId()` |
| `app/admin/needs-attention/page.tsx` | mobile full-list page | Mount strip below the inbox section; parallel-load `loadRecentAutoApplied({publishedShowIds:[]})` |
| `app/admin/_actions/autoApplied.ts` | 3 dashboard actions | Add `revalidatePath("/admin/needs-attention","page")` to each success branch |
| `components/admin/NeedsAttentionSummaryCard.tsx` | mobile summary card | Add optional `autoAppliedCount?: number` + "N auto-applied" chip + zero-state guard |
| `components/admin/Dashboard.tsx` | dashboard composition | Compute `autoAppliedCount` (renderedCount+overflowCount) and thread to the card |
| `DEFERRED.md` / memory | bookkeeping | FLOW4-1 + FLOW4-7 resolved |

Execution order: **1 → 2 → 3 → 4 → 5 → 6 → 7**. Task 1 (strip `headingLevel` + FLOW4-7) is the shared dependency; the page (Task 2) consumes it.

---

### Task 1: Strip `headingLevel` prop + FLOW4-7 aria-labelledby

**Files:**
- Modify: `components/admin/RecentAutoAppliedStrip.tsx` (imports `:26`; `GroupSection` `:183-193`,`:278`; `RecentAutoAppliedStrip` `:409-469`)
- Test: `tests/components/admin/RecentAutoAppliedStrip.test.tsx`

**Interfaces:**
- Produces: `RecentAutoAppliedStrip` accepts `headingLevel?: 2 | 4` (default `4`). `GroupSection` accepts `groupHeadingTag: "h3" | "h5"`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/components/admin/RecentAutoAppliedStrip.test.tsx` (reuse the file's existing fixture builders; if none, construct a minimal `RecentAutoApplied` inline). The fixture MUST include one group with rows so the populated branch renders. Do NOT add any new React import — the test references only Testing-Library APIs.

```tsx
// Minimal ok fixture with one group (adapt to the file's existing helper if present):
const okData = {
  kind: "ok" as const,
  groups: [
    {
      showId: "s1",
      slug: "s1",
      showName: "Spring Gala",
      rows: [
        { id: "r1", changeKind: "crew_added", summary: "Added", occurredAt: "2026-06-09T18:00:00.000Z", undoable: true, diff: { kind: "none" as const } },
      ],
      acceptableIds: ["r1"],
      undoableIds: ["r1"],
    },
  ],
  renderedCount: 1,
  overflowCount: 0,
  rosterShiftByShow: {},
};
const noopActions = {
  acceptChangeAction: (async () => ({ ok: true, count: 1 })) as never,
  acceptAllAction: (async () => ({ ok: true, count: 1 })) as never,
  undoFromDashboardAction: (async () => ({ ok: true })) as never,
};

describe("RecentAutoAppliedStrip headingLevel", () => {
  afterEach(() => cleanup());

  it("default: section heading is h4, group heading is h5 (dashboard regression pin)", () => {
    render(<RecentAutoAppliedStrip data={okData} actions={noopActions} />);
    expect(screen.getByRole("heading", { level: 4, name: "Recently auto-applied" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 5, name: "Spring Gala" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("headingLevel=2: section heading is h2, group heading is h3 (no h1->h4 skip on the page)", () => {
    render(<RecentAutoAppliedStrip data={okData} actions={noopActions} headingLevel={2} />);
    expect(screen.getByRole("heading", { level: 2, name: "Recently auto-applied" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Spring Gala" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 4 })).toBeNull();
  });

  it("headingLevel=2 infra_error branch renders an h2 (not a hardcoded h4)", () => {
    render(<RecentAutoAppliedStrip data={{ kind: "infra_error", message: "x" }} actions={noopActions} headingLevel={2} />);
    expect(screen.getByRole("heading", { level: 2, name: "Recently auto-applied" })).toBeInTheDocument();
  });

  it("FLOW4-7: populated section is a named region via aria-labelledby, with NO aria-label", () => {
    render(<RecentAutoAppliedStrip data={okData} actions={noopActions} />);
    const region = screen.getByRole("region", { name: "Recently auto-applied" });
    expect(region).not.toHaveAttribute("aria-label");
    expect(region).toHaveAttribute("aria-labelledby");
  });

  it("FLOW4-7: infra_error section is also a named region via aria-labelledby, no aria-label", () => {
    render(<RecentAutoAppliedStrip data={{ kind: "infra_error", message: "x" }} actions={noopActions} />);
    const region = screen.getByRole("region", { name: "Recently auto-applied" });
    expect(region).not.toHaveAttribute("aria-label");
    expect(region).toHaveAttribute("aria-labelledby");
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `cd /Users/ericweiss/FX-wt-mobile-autoapplied && pnpm vitest run tests/components/admin/RecentAutoAppliedStrip.test.tsx -t "headingLevel"`
Expected: FAIL — headings are h4/h5 regardless of prop; `getByRole("region", {name:"Recently auto-applied"})` fails (current accessible name is "Recently auto-applied changes").

- [ ] **Step 3: Implement**

In `RecentAutoAppliedStrip.tsx`:

3a. Add `useId` to the React import (`:26`): `import { useEffect, useId, useRef, useState, useTransition } from "react";`

3b. In `RecentAutoAppliedStrip` (`:409`), add the prop and compute tags + id UNCONDITIONALLY before the early returns:

```tsx
export function RecentAutoAppliedStrip({
  data,
  actions,
  defaultExpanded = false,
  headingLevel = 4,
}: {
  data: RecentAutoApplied;
  actions: RecentAutoAppliedStripActions;
  defaultExpanded?: boolean;
  headingLevel?: 2 | 4;
}) {
  // Hooks + derivations BEFORE any early return (rules-of-hooks; the ternary
  // yields a string-literal union assignable to a JSX intrinsic tag under strict TS).
  const headingId = useId();
  const SectionHeading = headingLevel === 2 ? "h2" : "h4";
  const groupHeadingTag = headingLevel === 2 ? "h3" : "h5";

  if (data.kind === "infra_error") {
    return (
      <section
        data-testid="recent-auto-applied-strip"
        className="flex flex-col gap-2"
        aria-labelledby={headingId}
      >
        <SectionHeading id={headingId} className="text-sm font-semibold text-text-strong">
          Recently auto-applied
        </SectionHeading>
        <p
          role="status"
          data-testid="auto-applied-error"
          className="rounded-md border border-border bg-surface p-tile-pad text-sm text-text-subtle"
        >
          We couldn&apos;t load recently auto-applied changes right now. Refresh to try again.
        </p>
      </section>
    );
  }

  if (data.groups.length === 0) return null;

  return (
    <section
      data-testid="recent-auto-applied-strip"
      className="flex flex-col gap-2"
      aria-labelledby={headingId}
    >
      <SectionHeading id={headingId} className="text-sm font-semibold text-text-strong">
        Recently auto-applied
      </SectionHeading>
      <ul className="flex flex-col gap-2">
        {data.groups.map((group) => (
          <GroupSection
            key={group.showId}
            group={group}
            actions={actions}
            defaultExpanded={defaultExpanded}
            groupHeadingTag={groupHeadingTag}
          />
        ))}
      </ul>
      {data.overflowCount > 0 ? (
        <p
          data-testid="auto-applied-overflow"
          className="rounded-md border border-dashed border-border p-tile-pad text-sm text-text-subtle"
        >
          +{data.overflowCount} older changes not shown
        </p>
      ) : null}
    </section>
  );
}
```

3c. In `GroupSection` (`:183-193`), add the prop and use it for the wrapper heading (`:278` `<h5>`):

```tsx
function GroupSection({
  group,
  actions,
  defaultExpanded,
  groupHeadingTag,
}: {
  group: AutoAppliedGroup;
  actions: RecentAutoAppliedStripActions;
  defaultExpanded: boolean;
  groupHeadingTag: "h3" | "h5";
}) {
```

Then rename the local for JSX (a Capitalized variable is required so JSX treats it as a tag, not a literal element). At `:278` replace `<h5 className="min-w-0">` … `</h5>` with:

```tsx
      <GroupHeading className="min-w-0">
        {/* …existing <button> unchanged… */}
      </GroupHeading>
```

and add near the top of `GroupSection` body (after the existing hooks, before the return): `const GroupHeading = groupHeadingTag;`

- [ ] **Step 4: Run to verify PASS**

Run: `pnpm vitest run tests/components/admin/RecentAutoAppliedStrip.test.tsx`
Expected: PASS (new + all pre-existing strip tests — the default path is byte-equivalent in heading levels).

- [ ] **Step 5: Typecheck the strip**

Run: `pnpm typecheck 2>&1 | grep -i "RecentAutoAppliedStrip" || echo "no strip type errors"`
Expected: `no strip type errors` (proves the literal-union tag derivation is valid TS).

- [ ] **Step 6: Commit**

```bash
git add components/admin/RecentAutoAppliedStrip.tsx tests/components/admin/RecentAutoAppliedStrip.test.tsx
git commit -m "feat(admin): headingLevel prop + FLOW4-7 aria-labelledby on RecentAutoAppliedStrip" --no-verify
```

---

### Task 2: Mount strip on /admin/needs-attention

**Files:**
- Modify: `app/admin/needs-attention/page.tsx:28-72`
- Test: `tests/app/admin/needsAttentionPage.test.tsx`

**Interfaces:**
- Consumes: `RecentAutoAppliedStrip` (Task 1, `headingLevel={2}`); `loadRecentAutoApplied({publishedShowIds:[]})`; the 3 actions from `app/admin/_actions/autoApplied.ts`.

- [ ] **Step 1: Write the failing tests**

Extend `tests/app/admin/needsAttentionPage.test.tsx`. Add a hoisted mock for `loadRecentAutoApplied` and the actions (the page imports them). Mirror the existing `state`/`vi.mock` pattern (`:15-26`):

```tsx
// add alongside the existing state (:15):
const raState = vi.hoisted(() => ({ result: null as unknown, calls: [] as Array<Record<string, unknown>> }));

vi.mock("@/lib/admin/loadRecentAutoApplied", () => ({
  loadRecentAutoApplied: async (deps: Record<string, unknown>) => {
    raState.calls.push(deps);
    return raState.result;
  },
}));
vi.mock("@/app/admin/_actions/autoApplied", () => ({
  acceptChangeAction: vi.fn(),
  acceptAllAction: vi.fn(),
  undoFromDashboardAction: vi.fn(),
}));

// reset in beforeEach:  raState.result = null; raState.calls = [];
```

Fixture with one group (reuse the Task-1 `okData` shape). Then:

```tsx
it("renders the auto-applied strip below the inbox with an h2 heading", async () => {
  state.result = successResult; // existing healthy inbox
  raState.result = okData;      // one group
  render(await NeedsAttentionPage());
  expect(screen.getByRole("heading", { level: 2, name: "Recently auto-applied" })).toBeInTheDocument();
  // the strip's section is present
  expect(screen.getByTestId("recent-auto-applied-strip")).toBeInTheDocument();
});

it("passes publishedShowIds:[] to loadRecentAutoApplied", async () => {
  state.result = successResult;
  raState.result = okData;
  render(await NeedsAttentionPage());
  expect(raState.calls[0]).toEqual({ publishedShowIds: [] });
});

it("strip is a SIBLING AFTER the needs-attention section (DOM order, not nested)", async () => {
  state.result = successResult;
  raState.result = okData;
  render(await NeedsAttentionPage());
  // The inbox <section aria-label="Needs attention"> has implicit role=region.
  const inbox = screen.getByRole("region", { name: "Needs attention" });
  const strip = screen.getByTestId("recent-auto-applied-strip");
  // Same parent → siblings (strip NOT nested inside the inbox section).
  expect(strip.parentElement).toBe(inbox.parentElement);
  // strip follows the inbox in document order (below, not above).
  expect(inbox.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("strip infra_error renders degraded copy while inbox is healthy", async () => {
  state.result = successResult;
  raState.result = { kind: "infra_error", message: "boom" };
  render(await NeedsAttentionPage());
  expect(screen.getByTestId("auto-applied-error")).toBeInTheDocument();
  // inbox still rendered (independent branches)
  expect(screen.getByText("Spring Gala.xlsx")).toBeInTheDocument();
});

it("inbox degraded + strip populated: both render independently", async () => {
  state.result = { kind: "infra_error", message: "boom" }; // triggers "kind" in result branch
  raState.result = okData;
  render(await NeedsAttentionPage());
  expect(screen.getByTestId("needs-attention-page-degraded")).toBeInTheDocument();
  expect(screen.getByTestId("recent-auto-applied-strip")).toBeInTheDocument();
});

it("empty groups: no strip section (inbox only)", async () => {
  state.result = successResult;
  raState.result = { kind: "ok", groups: [], renderedCount: 0, overflowCount: 0, rosterShiftByShow: {} };
  render(await NeedsAttentionPage());
  expect(screen.queryByTestId("recent-auto-applied-strip")).toBeNull();
});
```

- [ ] **Step 2: Run to verify FAIL**

Run: `pnpm vitest run tests/app/admin/needsAttentionPage.test.tsx -t "auto-applied"`
Expected: FAIL — page renders no strip; `loadRecentAutoApplied` mock never called.

- [ ] **Step 3: Implement**

Edit `app/admin/needs-attention/page.tsx`. Add imports:

```tsx
import { RecentAutoAppliedStrip } from "@/components/admin/RecentAutoAppliedStrip";
import { loadRecentAutoApplied } from "@/lib/admin/loadRecentAutoApplied";
import type { RecentAutoApplied } from "@/lib/admin/loadRecentAutoApplied";
import {
  acceptChangeAction,
  acceptAllAction,
  undoFromDashboardAction,
} from "@/app/admin/_actions/autoApplied";
```

Replace the single `loadNeedsAttention` await (`:30`) with a parallel load:

```tsx
  const [result, recentAutoApplied]: [Awaited<ReturnType<typeof loadNeedsAttention>>, RecentAutoApplied] =
    await Promise.all([
      loadNeedsAttention({ cap: PAGE_RENDER_CAP }), // no injected client (spec §4.3)
      // publishedShowIds:[] is CORRECT: it only feeds roster_shift_counts →
      // rosterShiftByShow, consumed by the dashboard's shows-table badges — this
      // page has no shows table. The strip's group list is a GLOBAL show_change_log
      // read, so groups are dashboard-parity. [] → the RPC (`where show_id =
      // any(p_show_ids)`) matches nothing, never errors.
      loadRecentAutoApplied({ publishedShowIds: [] }),
    ]);
```

Add the strip as a SIBLING after the existing `<section aria-label="Needs attention">` (closing `</section>` at `:69`), still inside the root `<div>` (`:33`):

```tsx
      </section>
      <RecentAutoAppliedStrip
        data={recentAutoApplied}
        actions={{ acceptChangeAction, acceptAllAction, undoFromDashboardAction }}
        headingLevel={2}
      />
    </div>
```

- [ ] **Step 4: Run to verify PASS**

Run: `pnpm vitest run tests/app/admin/needsAttentionPage.test.tsx`
Expected: PASS (new + all pre-existing page tests).

- [ ] **Step 5: Commit**

```bash
git add app/admin/needs-attention/page.tsx tests/app/admin/needsAttentionPage.test.tsx
git commit -m "feat(admin): mount auto-applied strip on /admin/needs-attention (mobile parity)" --no-verify
```

---

### Task 3: Actions revalidate the needs-attention page

**Files:**
- Modify: `app/admin/_actions/autoApplied.ts:54,85,113`
- Test: `tests/admin/autoAppliedActions.test.ts`

- [ ] **Step 1: Write the failing tests**

Extend `tests/admin/autoAppliedActions.test.ts`. For EACH of the 3 success-branch tests (the file's existing `revalidatePath("/admin","page")` assertions), add the page assertion. Example (acceptChange success, ~`:65-75`):

```ts
expect(revalidatePath).toHaveBeenCalledWith("/admin", "page");
expect(revalidatePath).toHaveBeenCalledWith("/admin/needs-attention", "page");
```

Add the same second assertion to the acceptAll-success and undo-success tests. Leave the failure-branch tests (`revalidatePath).not.toHaveBeenCalled()`) unchanged.

- [ ] **Step 2: Run to verify FAIL**

Run: `pnpm vitest run tests/admin/autoAppliedActions.test.ts`
Expected: FAIL — `/admin/needs-attention` never revalidated.

- [ ] **Step 3: Implement**

In `app/admin/_actions/autoApplied.ts`, add `revalidatePath("/admin/needs-attention", "page");` immediately after each existing `revalidatePath("/admin", "page");` — three sites: `acceptChangeAction` (`:54`), `acceptAllAction` (`:85`), `undoFromDashboardAction` (`:113`). Placement inside the `if (result.ok)` block, before the `logAdminOutcome` try (keeps the emit POST-revalidate, unchanged ordering).

- [ ] **Step 4: Run to verify PASS**

Run: `pnpm vitest run tests/admin/autoAppliedActions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/_actions/autoApplied.ts tests/admin/autoAppliedActions.test.ts
git commit -m "feat(admin): revalidate /admin/needs-attention on auto-applied dispositions" --no-verify
```

---

### Task 4: Summary-card auto-applied chip

**Files:**
- Modify: `components/admin/NeedsAttentionSummaryCard.tsx:5-58`
- Test: `tests/components/admin/NeedsAttentionSummaryCard.test.tsx`

**Interfaces:**
- Produces: `NeedsAttentionSummaryCard` accepts optional `autoAppliedCount?: number`; renders `data-testid="summary-chip-auto-applied"` ("N auto-applied") when `> 0`.

- [ ] **Step 1: Write the failing tests**

Extend `tests/components/admin/NeedsAttentionSummaryCard.test.tsx`. Update `renderCard`'s prop type to include `autoAppliedCount?: number` (the `{...props}` spread already forwards it). Add:

```tsx
it("autoAppliedCount 3 → 'summary-chip-auto-applied' reads '3 auto-applied'", () => {
  const card = renderCard({ totalCount: 5, ingestionTotal: 0, syncTotal: 0, autoAppliedCount: 3 });
  expect(within(card).getByTestId("summary-chip-auto-applied")).toHaveTextContent("3 auto-applied");
});

it("autoAppliedCount 0 / undefined / negative / NaN → chip ABSENT", () => {
  for (const v of [0, undefined, -2, Number.NaN]) {
    const card = renderCard({ totalCount: 5, ingestionTotal: 0, syncTotal: 0, autoAppliedCount: v });
    expect(within(card).queryByTestId("summary-chip-auto-applied")).toBeNull();
    cleanup();
  }
});

it("totalCount 0 but autoAppliedCount 4 → NOT 'All caught up'; title without '· 0'; only the auto-applied chip", () => {
  const card = renderCard({ totalCount: 0, ingestionTotal: 0, syncTotal: 0, autoAppliedCount: 4 });
  expect(within(card).queryByText("All caught up")).toBeNull();
  expect(card.textContent).toContain("Needs attention");
  expect(card.textContent).not.toContain("· 0");
  expect(within(card).getByTestId("summary-chip-auto-applied")).toHaveTextContent("4 auto-applied");
  expect(within(card).queryByTestId("summary-chip-ingestions")).toBeNull();
});

it("totalCount 6 + autoAppliedCount 2 → title count + auto-applied chip together", () => {
  const card = renderCard({ totalCount: 6, ingestionTotal: 6, syncTotal: 0, autoAppliedCount: 2 });
  expect(card.textContent).toContain("Needs attention · 6");
  expect(within(card).getByTestId("summary-chip-auto-applied")).toHaveTextContent("2 auto-applied");
});
```

Note: the pre-existing `needsAttentionSummaryCardSyncProblem.test.tsx` render sites pass NO `autoAppliedCount` — the optional prop keeps them compiling and chip-absent. No edit needed there; add one explicit assertion in THIS file that the omitted-prop path renders no chip (covered by the `undefined` case above).

- [ ] **Step 2: Run to verify FAIL**

Run: `pnpm vitest run tests/components/admin/NeedsAttentionSummaryCard.test.tsx -t "auto-applied"`
Expected: FAIL — no `summary-chip-auto-applied`; zero-state still "All caught up" when totalCount 0.

- [ ] **Step 3: Implement**

Edit `components/admin/NeedsAttentionSummaryCard.tsx`. Add the optional prop, the guard, the zero-state change, the title guard, and the chip:

```tsx
export function NeedsAttentionSummaryCard({
  totalCount,
  ingestionTotal,
  syncTotal,
  syncProblemTotal,
  autoAppliedCount,
  className,
}: {
  totalCount: number;
  ingestionTotal: number;
  syncTotal: number;
  syncProblemTotal: number;
  autoAppliedCount?: number;
  className?: string;
}) {
  const autoApplied =
    typeof autoAppliedCount === "number" && Number.isFinite(autoAppliedCount) && autoAppliedCount > 0
      ? autoAppliedCount
      : 0;
  const zero = totalCount === 0 && autoApplied === 0;
```

In the non-zero branch, guard the count segment so `totalCount === 0` doesn't render "· 0":

```tsx
            <span className="text-base font-semibold text-text-strong">
              Needs attention{totalCount > 0 ? <> · <span className="tabular-nums">{totalCount}</span></> : null}
            </span>
```

Add the chip after the `summary-chip-sync-problems` block (`:47-51`), inside the chips row `<span>`:

```tsx
              {autoApplied > 0 && (
                <span data-testid="summary-chip-auto-applied" className="tabular-nums">
                  {autoApplied} auto-applied
                </span>
              )}
```

- [ ] **Step 4: Run to verify PASS**

Run: `pnpm vitest run tests/components/admin/NeedsAttentionSummaryCard.test.tsx tests/components/needsAttentionSummaryCardSyncProblem.test.tsx`
Expected: PASS (new + both pre-existing card suites — proves the optional prop didn't break the sibling test's render sites).

- [ ] **Step 5: Commit**

```bash
git add components/admin/NeedsAttentionSummaryCard.tsx tests/components/admin/NeedsAttentionSummaryCard.test.tsx
git commit -m "feat(admin): auto-applied count chip on NeedsAttentionSummaryCard" --no-verify
```

---

### Task 5: Thread autoAppliedCount from Dashboard

**Files:**
- Modify: `components/admin/Dashboard.tsx:475-532` (result assembly), `:716-722` (card render)
- Test: `tests/components/admin/Dashboard.test.tsx`

**Interfaces:**
- Consumes: `NeedsAttentionSummaryCard` `autoAppliedCount` prop (Task 4); `recentAutoApplied` (already loaded, `:475`).

- [ ] **Step 1: Write the failing tests**

Extend `tests/components/admin/Dashboard.test.tsx`. Add a hoisted `raState` + mock for `loadRecentAutoApplied` (mirror the existing `naState` pattern `:18-28`):

```ts
const raState = vi.hoisted(() => ({ override: null as unknown }));
vi.mock("@/lib/admin/loadRecentAutoApplied", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin/loadRecentAutoApplied")>();
  return {
    ...actual,
    loadRecentAutoApplied: async (deps: Parameters<typeof actual.loadRecentAutoApplied>[0]) =>
      raState.override ?? actual.loadRecentAutoApplied(deps),
  };
});
// reset in beforeEach: raState.override = null;
```

Tests (the mobile card is `min-[720px]:hidden` but still in the DOM under jsdom):

```ts
it("summary card shows auto-applied chip = renderedCount + overflowCount (not the capped rendered rows)", async () => {
  raState.override = { kind: "ok", groups: [{ showId: "s1", slug: "s1", showName: "S1", rows: [{ id: "r1", changeKind: "crew_added", summary: "x", occurredAt: "2026-06-09T18:00:00.000Z", undoable: true, diff: { kind: "none" } }], acceptableIds: ["r1"], undoableIds: ["r1"] }], renderedCount: 3, overflowCount: 2, rosterShiftByShow: {} };
  await renderDashboard();
  const card = document.querySelector('[data-testid="needs-attention-summary-card"]') as HTMLElement;
  expect(within(card).getByTestId("summary-chip-auto-applied")).toHaveTextContent("5 auto-applied");
});

it("summary card: infra_error auto-applied read → no auto-applied chip", async () => {
  raState.override = { kind: "infra_error", message: "boom" };
  await renderDashboard();
  const card = document.querySelector('[data-testid="needs-attention-summary-card"]') as HTMLElement;
  expect(within(card).queryByTestId("summary-chip-auto-applied")).toBeNull();
});
```

(Add `within` to the testing-library import if absent.)

- [ ] **Step 2: Run to verify FAIL**

Run: `pnpm vitest run tests/components/admin/Dashboard.test.tsx -t "auto-applied chip"`
Expected: FAIL — card renders no auto-applied chip (prop not threaded).

- [ ] **Step 3: Implement**

In `components/admin/Dashboard.tsx`, compute the count where `recentAutoApplied` is resolved (near `:475-477`):

```tsx
  const autoAppliedCount =
    recentAutoApplied.kind === "ok"
      ? recentAutoApplied.renderedCount + recentAutoApplied.overflowCount
      : 0;
```

Thread it into the assembled `result` object (add to the returned shape near `:532`, and to the `Dashboard` result type near `:102` — add `autoAppliedCount: number;`). Then pass to the card (`:716-722`):

```tsx
          <NeedsAttentionSummaryCard
            totalCount={result.needsAttention.totalCount}
            ingestionTotal={result.needsAttention.ingestionTotal}
            syncTotal={result.needsAttention.syncTotal}
            syncProblemTotal={result.needsAttention.syncProblemTotal}
            autoAppliedCount={result.autoAppliedCount}
            className="min-[720px]:hidden"
          />
```

- [ ] **Step 4: Run to verify PASS**

Run: `pnpm vitest run tests/components/admin/Dashboard.test.tsx`
Expected: PASS (new + all pre-existing Dashboard tests).

- [ ] **Step 5: Commit**

```bash
git add components/admin/Dashboard.tsx tests/components/admin/Dashboard.test.tsx
git commit -m "feat(admin): thread auto-applied backlog count to the mobile summary card" --no-verify
```

---

### Task 6: Full-suite + static gates + e2e testid check

**Files:** none (verification task)

- [ ] **Step 1: Grep e2e for removed testids**

Run: `cd /Users/ericweiss/FX-wt-mobile-autoapplied && grep -rn "aria-label.*Recently auto-applied changes\|Recently auto-applied changes" tests/e2e/ || echo "clean"`
Expected: `clean` (no e2e pins the old accessible name; the `pnpm test` runner excludes e2e, so this manual grep is the guard).

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors. (Catches the heading-tag union + the new `autoAppliedCount` on the Dashboard result type — vitest strips types, so this is the only gate that proves them.)

- [ ] **Step 3: Lint + format**

Run: `pnpm lint && pnpm format:check`
Expected: both pass. (Canonical-Tailwind lint errors are ERRORs; `--no-verify` skipped the prettier hook, so format:check is required.)

- [ ] **Step 4: Full suite**

Run: `pnpm test 2>&1 | tail -5`
Expected: all pass (0 failed). Full suite — scoped gates miss source-scanning meta-tests that walk edited files (help-affordance, DOM-anchor, transition-audit registries). If any meta-test that scans `app/admin/needs-attention/page.tsx` or the strip trips, address per its message (additive edits should not, but the full suite is the arbiter).

- [ ] **Step 5: Commit (only if any gate required a fix)**

```bash
git add -A && git commit -m "test(admin): gate fixes for mobile auto-applied parity" --no-verify
```

---

### Task 7: Close-out bookkeeping

**Files:**
- Modify: `DEFERRED.md` (FLOW4-1 `:467`, FLOW4-7 `:503`)

- [ ] **Step 1: Mark DEFERRED entries resolved**

In `DEFERRED.md`, edit the FLOW4-1 heading (`:467`) to:
`### FLOW4-1 — [✅ RESOLVED 2026-07-16] No mobile parity for auto-applied disposition — strip now mounts on /admin/needs-attention (the mobile full-list route the summary card links to) + summary card shows an "N auto-applied" backlog chip`

and FLOW4-7 (`:503`) to:
`### FLOW4-7 — [✅ RESOLVED 2026-07-16] Section carries both aria-label and a matching heading — replaced with aria-labelledby (single source of truth), applied in every strip render context`

- [ ] **Step 2: Verify no BACKLOG edit needed**

Run: `grep -rn "BL-FLOW4" BACKLOG.md docs/superpowers/plans/BACKLOG.md || echo "no backlog row (expected)"`
Expected: `no backlog row (expected)` — the DEFERRED ref was a forward-looking id never filed (spec §9 verified NO `BL-FLOW4-*` row exists in either file). If a row IS found, mark it shipped in the same commit instead of skipping.

- [ ] **Step 3: format:check the docs**

Run: `pnpm format:check DEFERRED.md || pnpm prettier --write DEFERRED.md`
Expected: clean (or written then clean).

- [ ] **Step 4: Commit**

```bash
git add DEFERRED.md
git commit -m "docs: mark FLOW4-1 + FLOW4-7 resolved (mobile auto-applied parity)" --no-verify
```

---

## Post-implementation (pipeline, not tasks)

1. **Impeccable dual-gate** (invariant 8) — `/impeccable critique` + `/impeccable audit` on the diff (setup: `context.mjs` → register read). UI surfaces: `app/admin/needs-attention/page.tsx`, `components/admin/RecentAutoAppliedStrip.tsx`, `components/admin/NeedsAttentionSummaryCard.tsx`. P0/P1 fixed or deferred via `DEFERRED.md`. Snapshot persists.
2. **Whole-diff Codex adversarial review** — fetch+rebase `origin/main` first; fresh-eyes; to APPROVE.
3. **Push** `-u origin feat/mobile-autoapplied-parity`; **real CI green** (17 checks, `gh pr checks <PR#> --watch`, `mergeStateStatus` CLEAN); **`gh pr merge --merge`**; **ff local main** (verify `rev-list --left-right --count main...origin/main` == `0  0`).
4. **Memory** write + MEMORY.md index line.

## Meta-test inventory (declared)

No meta-test CREATED or EXTENDED. No new `lib/` read module (page composes two already-registered loaders). No new mutation surface (`tests/log/_metaMutationSurfaceObservability.test.ts` — page is read-only RSC; adding a `revalidatePath` to an already-registered action doesn't change discovery). No style/recipe class. No advisory-lock surface. `_metaInfraContract` / `_metaBoundedReads` unchanged (both are manually-enumerated registries; no new helper to enroll). Full `pnpm test` is the source-scanning-registry arbiter (Task 6 Step 4).

## Layout-dimensions / Transition-audit tasks

- **Layout-dimensions:** N/A — no fixed-dimension parent with flex/grid children is introduced (strip + card join existing single-column flex flows; spec §3 Dimensional Invariants: none new).
- **Transition-audit:** N/A — no new animated visual state (spec §3 Transition Inventory: chip absent↔present instant, matching sibling chips; strip states pre-existing/unchanged).
