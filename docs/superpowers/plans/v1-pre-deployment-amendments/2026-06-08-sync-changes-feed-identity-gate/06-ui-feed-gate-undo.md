# 06 — UI: feed + gate + undo

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (or `superpowers:executing-plans`) to execute task-by-task. Steps use checkbox (`- [ ]`) syntax. **TDD per task: failing test → minimal impl → passing test → commit (invariant 1 / 6).**

## Phase 6 — UI: feed + gate + undo

**Depends on:** Phases 1–5 (tables + lockdown, decision rule + hold-aware apply, MI-11 gate RPCs, undo/tombstone, feed data layer). This phase consumes the contracts from `00-overview.md` verbatim — **do not redefine** `FeedEntry`, `readShowChangeFeed`, the RPC signatures, or the `Disposition` union; import them.

**OWNER: Opus + impeccable.** UI-always-Opus routing rule (AGENTS.md "Hard rule"). Every file this phase touches is a UI surface (`app/admin/**` non-API, `components/**`), so it ships under invariant 8 (impeccable v3 dual-gate) and the dual-gate is a close-out task below.

**Spec sections:** §8 (UI surfaces), §6.2 (entry shape + action availability), §6.3 (undo flow), §5 (MI-11 gate flow, feed entry rendered from `sync_holds` disposition), §2 (gate set).

---

### What this phase builds

1. **`ChangesFeed`** — a Server Component on `app/admin/show/[slug]/page.tsx` that calls `readShowChangeFeed(show.id)` (Phase 5) and renders a reverse-chron list. Each entry: summary + relative time + status badge + per-entry action. Cap/truncation disclosure ("older changes not shown") when `truncated`.
2. **Per-entry action affordances** (client components, one per `action` discriminant):
   - `action: "undo"` → **[Undo]** button → server action → `undo_change` RPC.
   - `action: "approve_reject"` → **[Approve] [Reject]** → server actions → `mi11_approve_hold` / `mi11_reject_hold`. **Approve reads the current Drive `modifiedTime` in the server action FIRST (F13), passes it as `p_observed_modified_time`.** A closed collision **group** (Phase 3) renders a single **[Approve group]**; a rejected/`IDENTITY_WOULD_COLLIDE` group renders the conflict copy and **no Approve button** (§5 — never a button that always fails).
   - `action: "none"` → no button (non-crew notification-only rows, §6.2).
3. **Slimmed MI-11 gate card** — replace the whole-parse `StagedReviewCard` review path with a focused **email/rename/removal disposition Approve/Reject card** rendered from the `sync_holds` disposition. **Remove the legacy whole-parse `ParsePanel` + `StagedReviewCard` mount** from the per-show page (no invariant stages a whole parse anymore — §8). The MI-11 pending entries surface inside the feed (`status: "pending"`, `action: "approve_reject"`); a focused gate card is the entry body for those rows.

**Mode boundaries (the three entry render modes — name which elements belong to which):**
- `auto_applied` / `undone` / `rejected` rows → summary + time + status badge + (Undo | none). No disposition detail block.
- `pending` (MI-11) rows → summary + time + **"Pending review" badge** + **disposition detail line** ("Email change: old → new" / "Rename: old → new" / "Removal") + **[Approve] [Reject]** (or **[Approve group]** / conflict-no-button).
- Shared across ALL modes: the `<li>` row shell, the `<time>` element, the status badge slot, the summary `<p>`.

---

## Tasks

### T6.1 — Feed entry status badge (pure, presentational)

- [ ] **Test** `tests/components/admin/ChangeFeedBadge.test.tsx`. Failure mode it catches: *a status maps to the wrong color token / missing accessible text, so a "rejected" row reads as "applied".*

```tsx
import { render, screen } from "@testing-library/react";
import { ChangeFeedBadge } from "@/components/admin/ChangeFeedBadge";

describe("ChangeFeedBadge", () => {
  it.each([
    ["applied", "Applied"],
    ["pending", "Pending review"],
    ["rejected", "Rejected"],
    ["undone", "Undone"],
  ] as const)("renders %s with visible text label", (status, label) => {
    render(<ChangeFeedBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("never relies on color alone (each badge has a text node, not just a dot)", () => {
    const { container } = render(<ChangeFeedBadge status="rejected" />);
    // a11y: textContent must carry the meaning, not an aria-hidden dot
    expect(container.textContent?.trim()).toBe("Rejected");
  });
});
```

- [ ] **Impl** `components/admin/ChangeFeedBadge.tsx`. Map `ChangeStatus` → `{label, className}` using DESIGN.md tokens (`bg-info-bg`/`text-text-subtle` for pending, `bg-warning-bg`/`text-warning-text` for rejected, positive tokens for applied, neutral for undone). Status text is a real text node (not color-only — DESIGN §a11y, mirrors `StatusIndicator` discipline).
- [ ] Commit `feat(admin): change-feed status badge`.

### T6.2 — Relative-time rendering (reuse existing helper)

- [ ] **Test** `tests/components/admin/ChangeFeedTime.test.tsx`. Failure mode: *raw ISO leaks into the DOM, or the `<time dateTime>` machine attribute is dropped.*

```tsx
import { render } from "@testing-library/react";
import { ChangeFeedTime } from "@/components/admin/ChangeFeedTime";

it("renders a relative label and preserves the ISO in dateTime", () => {
  const now = new Date("2026-06-09T12:00:00Z");
  const { container } = render(
    <ChangeFeedTime occurredAt="2026-06-09T11:00:00Z" now={now} />,
  );
  const el = container.querySelector("time");
  expect(el).not.toBeNull();
  expect(el!.getAttribute("dateTime")).toBe("2026-06-09T11:00:00Z");
  // does NOT render the raw ISO as visible text
  expect(el!.textContent).not.toBe("2026-06-09T11:00:00Z");
});
```

- [ ] **Impl** `components/admin/ChangeFeedTime.tsx` — wrap `formatRelative` (`components/admin/ActiveShowsPanel.tsx:72`) inside a `<time dateTime={occurredAt} suppressHydrationWarning>`. Server-rendered with the page's `now` (no client TZ needed for relative output).
- [ ] Commit `feat(admin): change-feed relative time`.

### T6.3 — Undo button (server-action submit-safety)

- [ ] **Test** `tests/components/admin/UndoChangeButton.test.tsx`. Failure mode: *the button self-disables synchronously in its own `onClick`, cancelling the React 19 form-action dispatch (0 POSTs, strands on "Undoing…") — the documented `feedback_react_form_action_synchronous_disable_cancels_submit` trap.*

```tsx
import { render, screen } from "@testing-library/react";
import { UndoChangeButton } from "@/components/admin/UndoChangeButton";

it("submits inside a <form action={...}> and disables on isPending only", () => {
  const action = vi.fn();
  render(<UndoChangeButton changeLogId="cl-1" undoAction={action} />);
  const btn = screen.getByRole("button", { name: /undo this change/i });
  // the button lives inside a form whose action is the server action,
  // and has NO onClick that calls setState/disabled synchronously
  expect(btn.closest("form")).not.toBeNull();
  expect(btn).not.toBeDisabled(); // not pre-disabled at rest
});
```

> **Submit-safety note (MANDATORY — React 19 form-action):** every action affordance in this phase is a `<form action={serverAction}>` with a submit button whose `disabled`/`aria-busy` bind to `useFormStatus().pending` (read by a child `<SubmitButton>`), **never** a synchronous `onClick` self-disable. Disabling in the click handler cancels the dispatch (B1 "revoke hang" precedent). Pattern: `RotateShareTokenButton` / the M12.2 form-action fix.

- [ ] **Impl** `components/admin/UndoChangeButton.tsx`:

```tsx
"use client";
import { useFormStatus } from "react-dom";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      data-testid="change-feed-undo"
      className="min-h-tap-min min-w-tap-min rounded-sm border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Undoing…" : label}
    </button>
  );
}

export function UndoChangeButton({
  changeLogId,
  undoAction,
}: {
  changeLogId: string;
  undoAction: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <form action={undoAction}>
      <input type="hidden" name="changeLogId" value={changeLogId} />
      <SubmitButton label="Undo this change" />
    </form>
  );
}
```

- [ ] Commit `feat(admin): change-feed undo button (form-action submit-safe)`.

### T6.4 — Approve / Reject gate buttons + collision-group / conflict modes

- [ ] **Test** `tests/components/admin/Mi11GateActions.test.tsx`. Failure modes: *(a) Approve renders even when the entry is a rejected `IDENTITY_WOULD_COLLIDE` group (a button that always fails, §5); (b) a closed group renders two separate Approves instead of one **[Approve group]**; (c) disposition detail text is missing so the admin can't see old→new.*

```tsx
import { render, screen } from "@testing-library/react";
import { Mi11GateActions } from "@/components/admin/Mi11GateActions";

const noop = vi.fn();

it("renders Approve + Reject with the disposition detail for a single email_change", () => {
  render(
    <Mi11GateActions
      holdId="h1"
      disposition={{ disposition: "email_change", name: "Alice", email: "a@new" }}
      detail="Email change: a@old → a@new"
      groupState="single"
      approveAction={noop}
      rejectAction={noop}
    />,
  );
  expect(screen.getByText("Email change: a@old → a@new")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Approve$/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Reject$/i })).toBeInTheDocument();
});

it("renders a single Approve group button for a closed collision group", () => {
  render(
    <Mi11GateActions
      holdId="h1"
      disposition={{ disposition: "email_change", name: "Alice", email: "a@new" }}
      detail="Swap: 2 people exchange emails"
      groupState="closed_group"
      approveAction={noop}
      rejectAction={noop}
    />,
  );
  expect(screen.getByRole("button", { name: /approve group/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Approve$/i })).toBeNull();
});

it("renders the conflict copy and NO approve button for a blocked group", () => {
  render(
    <Mi11GateActions
      holdId="h1"
      disposition={{ disposition: "email_change", name: "Alice", email: "a@new" }}
      detail="Email change: a@old → a@new"
      groupState="conflict"
      conflictCode="IDENTITY_WOULD_COLLIDE"
      approveAction={noop}
      rejectAction={noop}
    />,
  );
  expect(screen.queryByRole("button", { name: /approve/i })).toBeNull();
  // conflict copy comes through lib/messages (no raw code in the DOM)
  expect(screen.queryByText("IDENTITY_WOULD_COLLIDE")).toBeNull();
});
```

- [ ] **Impl** `components/admin/Mi11GateActions.tsx` (`"use client"`). Props: `holdId`, `disposition: Disposition`, `detail: string`, `groupState: "single" | "closed_group" | "conflict"`, `conflictCode?: string`, `approveAction`, `rejectAction` (server actions). Two `<form>`s (Approve, Reject), each with a `useFormStatus` `SubmitButton`. When `groupState === "conflict"`: render `<ErrorExplainer code={conflictCode} surface="admin" />` (no raw code, invariant 5) and **omit** the Approve form; Reject still available. Approve label is `"Approve group"` when `closed_group`, else `"Approve"`. The disposition `detail` line is supplied by the page (rendered via `lib/messages`); this component does not stringify codes itself. 44px tap (`min-h-tap-min`), accessible names ("Approve email change for Alice" via `aria-label` when the bare label is ambiguous — WCAG 2.5.3, M12.6 precedent).
- [ ] Commit `feat(admin): MI-11 gate Approve/Reject + collision-group actions`.

### T6.5 — `ChangeFeedEntry` (row shell, mode dispatch)

- [ ] **Test** `tests/components/admin/ChangeFeedEntry.test.tsx`. Failure modes: *(a) a `none`-action row renders an Undo button (undo offered for a change with no captured prior state — F6); (b) a `pending` row renders Undo instead of Approve/Reject; (c) the summary label assertion is satisfied by a sibling control rather than the entry's own summary node (anti-tautology).*

```tsx
import { render, screen, within } from "@testing-library/react";
import { ChangeFeedEntry } from "@/components/admin/ChangeFeedEntry";

const base = { id: "e1", occurredAt: "2026-06-09T11:00:00Z", entityRef: "Alice" };
const now = new Date("2026-06-09T12:00:00Z");
const noop = vi.fn();

it("auto_applied crew row offers Undo, no Approve/Reject", () => {
  render(
    <ChangeFeedEntry
      entry={{ ...base, status: "applied", action: "undo", summary: "Removed Alice" }}
      now={now} undoAction={noop} approveAction={noop} rejectAction={noop}
    />,
  );
  // anti-tautology: scope to the entry's OWN summary node, not the whole row
  const row = screen.getByTestId("change-feed-entry-e1");
  const summary = within(row).getByTestId("change-feed-summary");
  expect(summary).toHaveTextContent("Removed Alice");
  expect(within(row).getByTestId("change-feed-undo")).toBeInTheDocument();
  expect(within(row).queryByTestId("mi11-approve")).toBeNull();
});

it("notification-only (none) row offers NO action button", () => {
  render(
    <ChangeFeedEntry
      entry={{ ...base, status: "applied", action: "none", summary: "Section shrank" }}
      now={now} undoAction={noop} approveAction={noop} rejectAction={noop}
    />,
  );
  const row = screen.getByTestId("change-feed-entry-e1");
  expect(within(row).queryByRole("button")).toBeNull();
});

it("pending MI-11 row offers Approve/Reject, no Undo", () => {
  render(
    <ChangeFeedEntry
      entry={{ ...base, status: "pending", action: "approve_reject", summary: "Email change for Alice" }}
      now={now} undoAction={noop} approveAction={noop} rejectAction={noop}
      gate={{ disposition: { disposition: "email_change", name: "Alice", email: "a@new" }, detail: "Email change: a@old → a@new", groupState: "single" }}
    />,
  );
  const row = screen.getByTestId("change-feed-entry-e1");
  expect(within(row).queryByTestId("change-feed-undo")).toBeNull();
  expect(within(row).getByText("Email change: a@old → a@new")).toBeInTheDocument();
});
```

- [ ] **Impl** `components/admin/ChangeFeedEntry.tsx` (`"use client"` — hosts the action forms). Renders an `<li data-testid={`change-feed-entry-${entry.id}`}>` with: summary `<p data-testid="change-feed-summary">`, `<ChangeFeedTime>`, `<ChangeFeedBadge>`, and a mode switch on `entry.action`: `undo` → `<UndoChangeButton>`; `approve_reject` → `<Mi11GateActions {...gate}>`; `none` → no button. Guard: if `action === "approve_reject"` but `gate` is undefined, render the row notification-only (defensive — never a dangling Approve with no disposition).
- [ ] Commit `feat(admin): change-feed entry row + action mode dispatch`.

### T6.6 — `ChangesFeed` list + cap/truncation disclosure

- [ ] **Test** `tests/components/admin/ChangesFeed.test.tsx`. Failure modes: *(a) list not reverse-chron; (b) truncated feed silently cuts with no "older changes not shown" note; (c) empty feed renders nothing/raw error instead of a calm empty state.*

```tsx
import { render, screen } from "@testing-library/react";
import { ChangesFeed } from "@/components/admin/ChangesFeed";

const now = new Date("2026-06-09T12:00:00Z");
const noop = vi.fn();
const mk = (id: string, t: string) => ({
  id, occurredAt: t, status: "applied" as const,
  action: "none" as const, summary: `change ${id}`, entityRef: null,
});

it("renders entries newest-first and shows the truncation note when capped", () => {
  render(
    <ChangesFeed
      entries={[mk("b", "2026-06-09T11:00:00Z"), mk("a", "2026-06-09T09:00:00Z")]}
      truncated
      now={now} undoAction={noop} approveAction={noop} rejectAction={noop}
    />,
  );
  const rows = screen.getAllByTestId(/change-feed-entry-/);
  expect(rows[0]).toHaveAttribute("data-testid", "change-feed-entry-b"); // newest first
  expect(screen.getByTestId("change-feed-truncation")).toHaveTextContent(/older changes not shown/i);
});

it("shows a calm empty state when there are no entries", () => {
  render(
    <ChangesFeed entries={[]} truncated={false} now={now}
      undoAction={noop} approveAction={noop} rejectAction={noop} />,
  );
  expect(screen.getByTestId("change-feed-empty")).toBeInTheDocument();
  expect(screen.queryByTestId(/change-feed-entry-/)).toBeNull();
});
```

> **Note:** the component receives `entries` already ordered + capped by `readShowChangeFeed` (Phase 5). The test passes pre-ordered data and asserts the component **preserves** order — it does not re-sort. (Anti-tautology: order correctness is Phase 5's contract; this test only pins that the list renders in array order and the truncation note is wired to the `truncated` prop, derived from the data layer, not hardcoded.)

- [ ] **Impl** `components/admin/ChangesFeed.tsx`. A `<section aria-labelledby>` with an `<h2>Changes</h2>`, a `<ul>` mapping `entries` → `<ChangeFeedEntry>` (forwarding the three server actions + `now` + per-entry `gate`), a truncation `<p data-testid="change-feed-truncation">` rendered only when `truncated`, and a `data-testid="change-feed-empty"` calm state when `entries.length === 0`. **Feed cap = 50** (00-overview resolution #8); `readShowChangeFeed` (Phase 5) applies the cap and sets `truncated`. The truncation copy names the cap: *"Showing the 50 most recent changes. Older changes not shown."* (hard-coded English — absence-of-overflow, not a catalog failure code). Empty-state copy is likewise hard-coded English (absence-of-failure, mirrors `ParsePanel` empty-state rationale).
- [ ] Commit `feat(admin): changes feed list + truncation disclosure`.

### T6.7 — Server actions + page wiring (mount feed, remove legacy whole-parse review)

- [ ] **Test** `tests/admin/showPageFeed.test.tsx` (RSC/integration with the data layer + RPCs mocked). Failure modes: *(a) the feed isn't mounted on the page; (b) the Approve server action does NOT read Drive `modifiedTime` before calling `mi11_approve_hold` (F13 stale-target guard bypassed); (c) the legacy `ParsePanel`/`StagedReviewCard` whole-parse review path is still mounted.*

```tsx
// Mocks: readShowChangeFeed → fixture entries; drive modifiedTime reader; RPC clients.
it("Approve server action reads Drive modifiedTime first, then calls mi11_approve_hold with it", async () => {
  const driveRead = vi.fn().mockResolvedValue({ data: "2026-06-09T11:30:00Z", error: null });
  const rpc = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
  // ... invoke the approve server action (FormData with holdId)
  // assert ordering: driveRead called before rpc, and its value is passed through
  expect(driveRead).toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledWith("mi11_approve_hold", expect.objectContaining({
    p_observed_modified_time: "2026-06-09T11:30:00Z",
  }));
  expect(driveRead.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[0]);
});

it("Approve aborts with a typed non-mutating result when the Drive read fails (F15)", async () => {
  const driveRead = vi.fn().mockResolvedValue({ data: null, error: { message: "429" } });
  const rpc = vi.fn();
  // ... invoke approve server action
  expect(rpc).not.toHaveBeenCalled(); // never applies on a stale fallback
  // result carries a lib/messages code, not a raw infra error
});
```

- [ ] **Impl** `app/admin/show/[slug]/_actions.ts` — add `undoChangeAction`, `mi11ApproveAction`, `mi11RejectAction` (`"use server"`). Each: `await requireAdmin()`; read `FormData`; canonicalize the admin email for `created_by`/audit (invariant 3 via `lib/email/canonicalize`). **Call the Phase 3/4 admin mutation RPCs (`mi11_approve_hold` / `mi11_reject_hold` / `undo_change`) via the COOKIE-BOUND AUTHENTICATED Supabase server client (`createSupabaseServerClient()` — the admin's own session), NOT the service-role client** (00-overview resolution #11: these RPCs are `SECURITY DEFINER`, gate internally on `is_admin()`, and are `GRANT EXECUTE … TO authenticated`; routing them through the admin session is what makes the `is_admin()` claim check meaningful). The service-role client is used **only** for the feed READ (`readShowChangeFeed`, Phase 5). Destructure `{ data, error }` from every RPC call (invariant 9). **Approve orchestration (F13/F15):** read the current Drive `modifiedTime` for `show.drive_file_id` FIRST; on returned-error OR thrown → return a typed `lib/messages` result and **do not** call the RPC, leave hold pending; else pass the observed time as `p_observed_modified_time`. `revalidatePath('/admin/show/[slug]', 'page')` on success. Map every RPC `{ok:false, code}` to a `lib/messages` code (no raw codes — invariant 5).
- [ ] **Impl** `app/admin/show/[slug]/page.tsx` — `await readShowChangeFeed(show.id)`; render `<ChangesFeed>` (passing the three actions bound to `show`, `now`, and per-entry `gate` data the page derives from open holds). **Remove EXACTLY the per-show LIVE whole-parse review mount and nothing else:** delete (a) the `<section data-testid="admin-show-parse-warnings-section">` block that renders `<ParsePanel rows={rows} showId={show.id} readOnly={archived} />` (page.tsx:625–639); (b) the `pending_syncs` query (`supabase.from("pending_syncs")…` at :190–212) and the `rows: StagedRow[]` derivation that feeds it (:214–228); (c) the now-unused imports (`ParsePanel`, `StagedRow` type, `parseTriggeredReviewItems`, `deriveParseSummary`, `safeStringField`). **Do NOT touch** the `StagedReviewCard` / `ParsePanel` components themselves — they remain in use by the wizard `wizard_failed_reapply` route (`app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx`) and the live `first_seen` route (`app/admin/show/staged/[stagedId]/page.tsx`), confirmed by importer grep. First-seen approval is **unchanged** in this phase: it stays governed by `auto_publish_clean_first_seen` and its dedicated `/admin/show/staged/[stagedId]` route; Phase 6 deletes no first-seen surface. Keep the wrapping `requireAdmin` + try/catch boundary discipline.
- [ ] Commit `feat(admin): mount changes feed, wire gate/undo actions, drop whole-parse review`.

### T6.8 — Layout dimensions (MANDATORY real-browser Playwright)

> jsdom does NOT compute layout — this MUST run against a real browser render (AGENTS.md "Layout-dimensions task"). Tailwind v4 does **not** default `.flex` to `align-items: stretch`, so every parent→child dimension relationship is asserted explicitly.

- [ ] **Test** `tests/e2e/admin-changes-feed-layout.spec.ts` (Playwright). Failure mode: *a feed entry's action column collapses to 0-height inside the row flex parent (the Tailwind-v4 no-default-stretch trap), or a tap target renders under 44px on mobile.*

**Dimensional Invariants asserted (from §8 + DESIGN.md):**
1. Each `change-feed-entry-*` `<li>` fills the full width of the `<ul>` (entry width === list content width, ±0.5px).
2. The action button(s) inside each entry are ≥ 44×44 CSS px (`min-h-tap-min`/`min-w-tap-min`) at the 390px mobile band AND the desktop band.
3. The status badge + summary + action sit on one stretched row (the entry's flex children share the row height; badge height === row content height when `items-center` is not used, else each child's box is within the row) — assert via `getBoundingClientRect()` on the entry and each documented child.
4. Band sweep: assert at **390px**, **720px** (the per-show two-col breakpoint), and **1280px** — a single desktop width misses the intermediate track collapse (`feedback_layout_gate_band_sweep`).

```ts
import { test, expect } from "@playwright/test";

const BANDS = [390, 720, 1280];
test.describe("changes feed layout", () => {
  for (const w of BANDS) {
    test(`entries fill the list and tap targets are >=44px @${w}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await page.goto("/admin/show/<seeded-feed-slug>"); // seeded via test-auth fixture
      const list = page.getByRole("list", { name: /changes/i });
      const listBox = await list.boundingBox();
      const entries = page.locator('[data-testid^="change-feed-entry-"]');
      const n = await entries.count();
      expect(n).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) {
        const eb = await entries.nth(i).boundingBox();
        expect(Math.abs(eb!.width - listBox!.width)).toBeLessThanOrEqual(0.5);
      }
      const buttons = page.locator(
        '[data-testid="change-feed-undo"], [data-testid="mi11-approve"], [data-testid="mi11-reject"]',
      );
      const bn = await buttons.count();
      for (let i = 0; i < bn; i++) {
        const bb = await buttons.nth(i).boundingBox();
        expect(bb!.height).toBeGreaterThanOrEqual(44 - 0.5);
        expect(bb!.width).toBeGreaterThanOrEqual(44 - 0.5);
      }
    });
  }
});
```

- [ ] Seed a fixture show whose feed has at least one `undo` row and one `approve_reject` row (via the test-auth fixture path used by existing admin e2e). Run under the **pinned Playwright Docker image** if asserting against CI baselines.
- [ ] Commit `test(admin): real-browser changes-feed layout dimensions`.

### T6.9 — Reduced-motion + a11y audit (component-level)

- [ ] **Test** `tests/components/admin/ChangesFeed.a11y.test.tsx`. Failure modes: *(a) any entry-appearance animation has no `prefers-reduced-motion: reduce` rest state; (b) an action button lacks an accessible name; (c) a status conveyed by color only.*
- [ ] Assert: every action button has a non-empty accessible name (`getByRole("button", { name })`); the feed `<section>` has an `aria-labelledby` heading; if any framer-motion entry animation is added, it follows the M12.11 gotchas (`initial={false}` first paint; never branch tree SHAPE on reduced-motion; read `matchMedia().matches` on mount). **Default: no entry animation** — a static list is acceptable and avoids the SSR-opacity-0 trap; only add motion if impeccable critique requests it.
- [ ] Commit `test(admin): changes-feed a11y + reduced-motion contracts`.

---

## Close-out tasks (MANDATORY)

### T6.10 — impeccable v3 dual-gate (invariant 8 — EXTERNAL attestation)

- [ ] Run `/impeccable critique` AND `/impeccable audit` on the Phase 6 diff with the canonical v3 preflight gates (PRODUCT.md → DESIGN.md → register → preflight signal). **Both must be EXTERNAL** (fresh subagent or user-invoked — the same Opus session that wrote the UI cannot self-attest; `feedback_impeccable_external_attestation_required`).
- [ ] HIGH/CRITICAL findings fixed or deferred via a `DEFERRED.md` entry. Findings + dispositions recorded in the milestone handoff §12.
- [ ] Spec-check any critique copy/label rewrite before shipping (`feedback_impeccable_critique_not_authoritative_vs_spec`) — critique knows UX, not the product's gate contract.

### T6.11 — Screenshots-drift baseline regen (captured admin route)

- [ ] The changes feed lands on **`/admin/show/[slug]`**, which the help-screenshots manifest captures (`scripts/help-screenshots.manifest.ts` includes `/admin/show/<slug>/...`). A redesign of this route **drifts the captured baselines** (`feedback_help_screenshot_manifest_captures_admin_routes`). Regenerate via the **sanctioned amd64 Docker procedure** (pinned `mcr.microsoft.com/playwright` image, `--platform linux/amd64` on the arm64 dev host — never capture from macOS/arm64; byte-comparison CI gate discipline). Budget the ~60s capture timeout.
- [ ] After local verification that overwrites WebPs, **`git restore public/help/screenshots/`** then regen from the pinned image so the committed baseline is x64-Linux bytes, not host bytes.
- [ ] Confirm the regen.yml hold-aside list covers any new migration this milestone added (M12.3 stale-regen precedent).
- [ ] Commit `test(infra): regen admin per-show screenshot baselines (changes feed)`.

### T6.12 — Phase 6 adversarial review (cross-model — Codex reviews the UI)

- [ ] After phase self-review, invoke `adversarial-review` (Codex reviews the Opus UI phase, per the cross-harness pairing in `00-overview.md`). **Reviewer is REVIEWER ONLY** — inline that framing in the brief (`feedback_adversarial_review_runbook`). Iterate until convergence/APPROVE; escalate only genuine ambiguity. Do not proceed to whole-plan handoff without this step.
- [ ] **EXPLICITLY DO NOT RELITIGATE** (preempt the disagreement loop): (a) non-crew rows are notification-only with `action='none'` — ratified §6.2/§7 finding F6, NOT a missing feature; (b) the whole-parse `StagedReviewCard` review path removal is ratified §8 (no invariant stages a whole parse anymore); (c) Approve reading Drive `modifiedTime` in the server action before the RPC is the F13 design, not a layering smell; (d) the feed receiving pre-ordered/pre-capped entries from Phase 5 is the data-layer contract, not a UI omission.

---

## Resolved decisions (settled in-plan — do not relitigate)

- **First-seen review surface stays.** `ParsePanel` + `StagedReviewCard` are NOT deleted — confirmed by importer grep they back the wizard `wizard_failed_reapply` route (`app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx`) and the live `first_seen` route (`app/admin/show/staged/[stagedId]/page.tsx`). Phase 6 removes ONLY the per-show LIVE whole-parse review **mount** in `app/admin/show/[slug]/page.tsx` (the `admin-show-parse-warnings-section` + its `pending_syncs` query + `rows` derivation — exact lines in T6.7). First-seen approval is unchanged: governed by `auto_publish_clean_first_seen` + its dedicated `/admin/show/staged/[stagedId]` route. No first-seen surface is deleted.
- **Pending-disposition copy keys (added in Phase 1, referenced here).** The page derives each MI-11 entry's `gate.detail` via `lib/messages` from the open `sync_holds` `proposed_value.disposition`:
  - `email_change` → `mi11_pending_email_change`
  - `rename` → `mi11_pending_rename`
  - `removal` → `mi11_pending_removal`
  - rename folded into an open email hold (§4.2c) → `mi11_pending_rename_folded`
  These are catalog keys (no raw codes in the DOM, invariant 5); the page passes the rendered string as `gate.detail` to `Mi11GateActions`.
- **Feed cap = 50** (00-overview resolution #8). Wired into the T6.6 truncation copy.

## Notes / shared-component impact

- **Removal scope is surgical** (see T6.7): only the per-show live whole-parse mount + its `pending_syncs` read are removed. The shared `ParsePanel` / `StagedReviewCard` components and every other importer (wizard, first-seen, dev page, `PerShowAlertSection`, `ReportButton`) are untouched.
- All new copy renders through `lib/messages` (`ErrorExplainer`/`messageFor`) for any code-derived string; hard-coded English only for absence-of-failure / absence-of-overflow states (empty feed, truncation note). No raw error codes in the DOM (invariant 5).
- Tokens: `min-h-tap-min`, `min-w-tap-min`, `tile-pad`, `section-gap`, `rounded-sm/-md/-pill`, border/surface/text tokens — all from DESIGN.md; no inline arbitrary `tracking-[…]` (banned by `tests/styles/eyebrow-tracking.test.ts`).
