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
   - `action: "undo"` → **[Undo]** button (bound to `entry.changeLogId`) → server action → delegates to the Phase 4 undo helper.
   - `action: "approve_reject"` → **[Approve] [Reject]** (bound to `entry.gate.holdId`) → server actions → delegate to the Phase 3 `approveMi11Hold` / `rejectMi11Hold` helpers (which own the Drive-`modifiedTime`-first F13 orchestration + the lock-taking RPCs). **PF17: the swap/collision outcome is NOT pre-rendered. The Approve button is always a single `[Approve]`; on submit, the action's typed result drives the rendering — a `{ok:false, code:'IDENTITY_WOULD_COLLIDE'}` shows the conflict copy via `lib/messages`, an approved (possibly group/swap) success flips the entry status. No pre-computed `[Approve group]` / conflict-no-button state.**
   - `action: "none"` → no button (non-crew notification-only rows, §6.2).
3. **Slimmed MI-11 gate card** — replace the whole-parse `StagedReviewCard` review path with a focused **email/rename/removal disposition Approve/Reject card** rendered from the `sync_holds` disposition. **Remove the legacy whole-parse `ParsePanel` + `StagedReviewCard` mount** from the per-show page (no invariant stages a whole parse anymore — §8). The MI-11 pending entries surface inside the feed (`status: "pending"`, `action: "approve_reject"`); a focused gate card is the entry body for those rows.

**Mode boundaries (the three entry render modes — name which elements belong to which):**
- `auto_applied` / `undone` / `rejected` rows → summary + time + status badge + (Undo | none).
- `pending` (MI-11) rows → summary + time + **"Pending review" badge** + **[Approve] [Reject]** bound to `entry.gate.holdId`. **PF17: the old→new text is the server-rendered `entry.summary` (no separate disposition-detail field); the swap/collision/`IDENTITY_WOULD_COLLIDE` outcome is NOT pre-rendered — it surfaces post-submit from the Approve action's typed result. There is no pre-computed `[Approve group]` button or conflict-no-button state on the entry.**
- Shared across ALL modes: the `<li>` row shell, the `<time>` element, the status badge slot, the summary `<p>` (which carries the old→new text for pending rows).

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

### T6.4 — Approve / Reject gate buttons (conflict surfaces post-submit from the action result)

- [ ] **Test** `tests/components/admin/Mi11GateActions.test.tsx`. Failure modes: *(a) the component reads a non-canonical `detail`/`groupState`/`conflictCode` prop that the Phase-5 `FeedEntry` doesn't produce (forces a 2nd query — PF14/PF17); (b) the IDENTITY_WOULD_COLLIDE conflict is pre-rendered as a static field instead of surfacing from the Approve action's typed result after submit; (c) the Approve form isn't bound to `gate.holdId`.*

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Mi11GateActions } from "@/components/admin/Mi11GateActions";

const noop = vi.fn();

it("renders Approve + Reject for a pending hold from gate (no detail/groupState props)", () => {
  render(
    <Mi11GateActions
      holdId="h1"
      disposition={{ disposition: "email_change", name: "Alice", email: "a@new" }}
      approveAction={noop}
      rejectAction={noop}
    />,
  );
  // PF17: the row's old→new text is the entry SUMMARY (server-rendered by
  // Phase 5 via lib/messages) and lives on the ChangeFeedEntry, NOT here —
  // this component only owns the Approve/Reject forms bound to gate.holdId.
  expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
  // the Approve form carries the holdId so the bound action targets the hold.
  expect(screen.getByDisplayValue("h1")).toBeInTheDocument();
});

it("surfaces an IDENTITY_WOULD_COLLIDE conflict POST-SUBMIT from the action result, via lib/messages (no raw code)", async () => {
  // PF17: collision/swap outcomes are NOT pre-rendered entry fields. The
  // Approve action returns its typed result; the component shows the conflict
  // message after submit. closed-group success / approved-group is the same
  // path — the result, not a pre-computed groupState, drives the rendering.
  const approveAction = vi.fn().mockResolvedValue({ ok: false, code: "IDENTITY_WOULD_COLLIDE" });
  render(
    <Mi11GateActions
      holdId="h1"
      disposition={{ disposition: "email_change", name: "Alice", email: "a@new" }}
      approveAction={approveAction}
      rejectAction={noop}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: /approve/i }));
  // ErrorExplainer renders the catalog copy for the code; the raw code never
  // appears in the DOM (invariant 5).
  expect(await screen.findByTestId("mi11-gate-result")).toBeInTheDocument();
  expect(screen.queryByText("IDENTITY_WOULD_COLLIDE")).toBeNull();
});
```

- [ ] **Impl** `components/admin/Mi11GateActions.tsx` (`"use client"`). **Props (PF17 — canonical fields only): `holdId: string`, `disposition: Disposition`, `approveAction`, `rejectAction` (server actions returning a typed `{ok:true,...} | {ok:false,code}` result). NO `detail`, `groupState`, or `conflictCode` props** — those are not on the canonical `FeedEntry` and would require a second query (PF14). Two `<form>`s (Approve, Reject), each with a `useFormStatus` `SubmitButton` (44px tap, `min-h-tap-min`). The Approve button label is always `"Approve"`; **the swap/collision/IDENTITY_WOULD_COLLIDE vs approved-group outcome is determined by the action's typed RESULT after submit** — capture it via `useActionState` (or a small wrapper that stores the returned result) and, on `{ok:false, code}`, render `<ErrorExplainer code={code} surface="admin" data-testid="mi11-gate-result" />` (no raw code, invariant 5); on `{ok:true}` the page revalidates and the entry flips status. Accessible names disambiguate the otherwise-identical buttons via `aria-label` using `disposition.name` (e.g. "Approve change for Alice" — WCAG 2.5.3, M12.6 precedent). This component never pre-renders a conflict or a group state — it reacts to the result.
- [ ] Commit `feat(admin): MI-11 gate Approve/Reject (conflict surfaces post-submit)`.

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

it("pending MI-11 row renders old→new from entry.summary and mounts Approve/Reject bound to gate.holdId, no Undo", () => {
  const approve = vi.fn();
  render(
    <ChangeFeedEntry
      entry={{
        ...base,
        status: "pending",
        action: "approve_reject",
        // PF17: the old→new text IS the summary (Phase 5 server-renders it via
        // lib/messages). There is no entry.detail/groupState/conflictCode.
        summary: "Email change for Alice: a@old → a@new",
        // PF14: the canonical FeedEntry carries gate {holdId, disposition} —
        // Phase 5 populates it; the page does NO second query.
        gate: { holdId: "h1", disposition: { disposition: "email_change", name: "Alice", email: "a@new" } },
      }}
      now={now} undoAction={noop} approveAction={approve} rejectAction={noop}
    />,
  );
  const row = screen.getByTestId("change-feed-entry-e1");
  expect(within(row).queryByTestId("change-feed-undo")).toBeNull();
  // anti-tautology: the old→new text lives in the entry's OWN summary node.
  expect(within(row).getByTestId("change-feed-summary")).toHaveTextContent(
    "Email change for Alice: a@old → a@new",
  );
  // the Approve form carries the holdId from entry.gate (hidden input), so the
  // bound action targets the right hold with no extra lookup.
  expect(within(row).getByDisplayValue("h1")).toBeInTheDocument();
});

it("undo row wires the Undo button to entry.changeLogId", () => {
  render(
    <ChangeFeedEntry
      entry={{ ...base, status: "applied", action: "undo", summary: "Removed Alice", changeLogId: "cl-9" }}
      now={now} undoAction={noop} approveAction={noop} rejectAction={noop}
    />,
  );
  const row = screen.getByTestId("change-feed-entry-e1");
  expect(within(row).getByTestId("change-feed-undo")).toBeInTheDocument();
  // PF14: the Undo form's hidden changeLogId input comes straight from
  // entry.changeLogId (Phase 5 populated), not a derived/looked-up value.
  expect(within(row).getByDisplayValue("cl-9")).toBeInTheDocument();
});
```

- [ ] **Impl** `components/admin/ChangeFeedEntry.tsx` (`"use client"` — hosts the action forms). Renders an `<li data-testid={`change-feed-entry-${entry.id}`}>` with: summary `<p data-testid="change-feed-summary">{entry.summary}</p>` (the old→new text for a pending row IS the server-rendered summary — PF17), `<ChangeFeedTime>`, `<ChangeFeedBadge>`, and a mode switch on `entry.action`: `undo` → `<UndoChangeButton changeLogId={entry.changeLogId!} undoAction={undoAction} />`; `approve_reject` → `<Mi11GateActions holdId={entry.gate!.holdId} disposition={entry.gate!.disposition} approveAction={approveAction} rejectAction={rejectAction} />`; `none` → no button. **PF17/PF14: ChangeFeedEntry consumes ONLY the canonical `FeedEntry` fields — `summary`, `gate = {holdId, disposition}` (approve_reject), `changeLogId` (undo). It reads NO `detail`, `groupState`, or `conflictCode` (those are not on `FeedEntry`); the swap/collision outcome surfaces post-submit from the Approve action's typed result inside `Mi11GateActions`, not as a pre-computed entry field — so the page performs NO second query.** Guard: if `action === "approve_reject"` but `entry.gate` is undefined (or `undo` but `changeLogId` undefined), render the row notification-only (defensive — never a dangling Approve with no hold / Undo with no target).
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

- [ ] **Test** `tests/admin/showPageFeed.test.tsx` (RSC/integration with the Phase 3/4 helpers mocked). Failure modes: *(a) the feed isn't mounted on the page; (b) the Approve server action calls `supabase.rpc()` inline instead of DELEGATING to the guarded helper (PF15 lock-guard bypass); (c) the legacy `ParsePanel`/`StagedReviewCard` whole-parse review path is still mounted.*

```tsx
// Mocks: readShowChangeFeed → fixture entries; the Phase 3/4 action helpers.
import * as gate from "@/lib/sync/holds/mi11GateActions";

it("mi11ApproveAction DELEGATES to approveMi11Hold (no inline supabase.rpc)", async () => {
  const spy = vi.spyOn(gate, "approveMi11Hold").mockResolvedValue({ ok: true });
  const fd = new FormData();
  fd.set("holdId", "h1");
  await mi11ApproveAction(fd); // requireAdmin mocked to pass
  // PF15: the server action forwards to the guarded helper, which owns the
  // Drive-modifiedTime read (F13) + the lock-taking RPC. The action itself
  // performs NO supabase.rpc() call and NO withShowAdvisoryLock wrap.
  expect(spy).toHaveBeenCalledWith(expect.objectContaining({ holdId: "h1" }));
});

it("a delegated failure result maps to a lib/messages code, never a raw code in the DOM", async () => {
  vi.spyOn(gate, "approveMi11Hold").mockResolvedValue({ ok: false, code: "IDENTITY_WOULD_COLLIDE" });
  const fd = new FormData();
  fd.set("holdId", "h1");
  const res = await mi11ApproveAction(fd);
  expect(res).toMatchObject({ ok: false, code: "IDENTITY_WOULD_COLLIDE" }); // surfaced via ErrorExplainer, not raw text
});
```

> The F13 (Drive-modifiedTime-first) and F15 (Drive-read-failure non-mutating) contracts are tested at the **helper** layer in Phase 3, not duplicated here — the server action only proves it delegates. Keeping the Drive orchestration in the guarded helper is what PF15 requires.

- [ ] **Impl** `app/admin/show/[slug]/_actions.ts` — add `undoChangeAction`, `mi11ApproveAction`, `mi11RejectAction` (`"use server"`). **PF15: these server actions are THIN — `await requireAdmin()`, read `FormData`, then DELEGATE to the already-advisory-lock-guarded Phase 3/4 action helpers; they NEVER call `supabase.rpc()` inline and NEVER wrap the call in `withShowAdvisoryLock` (the lock-taking SECURITY DEFINER RPC self-locks — wrapping it would nest two holders on the same hashkey and deadlock, violating invariant 2 / `tests/auth/advisoryLockRpcDeadlock.test.ts`).** Delegation targets:
  - `mi11ApproveAction` → `approveMi11Hold(...)` (`lib/sync/holds/mi11GateActions.ts`)
  - `mi11RejectAction` → `rejectMi11Hold(...)` (`lib/sync/holds/mi11GateActions.ts`)
  - `undoChangeAction` → the Phase 4 undo action helper (`lib/sync/holds/undoChange.ts` per Phase 4)

  Those helpers own the cookie-bound authenticated client (`createSupabaseServerClient()` — admin session, NOT service-role; 00-overview #11: the RPCs are `SECURITY DEFINER`, gate on `is_admin()`, `GRANT EXECUTE … TO authenticated`) and the `{ data, error }` destructuring (invariant 9). **Approve orchestration (F13/F15) lives in the Phase 3 helper:** it reads the current Drive `modifiedTime` for `show.drive_file_id` FIRST; on returned-error OR thrown → a typed `lib/messages` result, no RPC call, hold stays pending; else passes the observed time as `p_observed_modified_time`. The server action `revalidatePath('/admin/show/[slug]', 'page')` on the helper's success result and maps every `{ok:false, code}` to a `lib/messages` code (no raw codes — invariant 5). The service-role client is used **only** for the feed READ (`readShowChangeFeed`, Phase 5).
- [ ] **Impl** `app/admin/show/[slug]/page.tsx` — `await readShowChangeFeed(show.id)`; render `<ChangesFeed>` (passing the three thin server actions + `now`). **PF14: each entry already carries its own action payload from Phase 5 — `entry.gate = {holdId, disposition}` for `approve_reject`, `entry.changeLogId` for `undo` — so the page does NO second query for hold/disposition data; it just forwards `entries` to `<ChangesFeed>`.** **Remove EXACTLY the per-show LIVE whole-parse review mount and nothing else:** delete (a) the `<section data-testid="admin-show-parse-warnings-section">` block that renders `<ParsePanel rows={rows} showId={show.id} readOnly={archived} />` (page.tsx:625–639); (b) the `pending_syncs` query (`supabase.from("pending_syncs")…` at :190–212) and the `rows: StagedRow[]` derivation that feeds it (:214–228); (c) the now-unused imports (`ParsePanel`, `StagedRow` type, `parseTriggeredReviewItems`, `deriveParseSummary`, `safeStringField`). **Do NOT touch** the `StagedReviewCard` / `ParsePanel` components themselves — they remain in use by the wizard `wizard_failed_reapply` route (`app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx`) and the live `first_seen` route (`app/admin/show/staged/[stagedId]/page.tsx`), confirmed by importer grep. First-seen approval is **unchanged** in this phase: it stays governed by `auto_publish_clean_first_seen` and its dedicated `/admin/show/staged/[stagedId]` route; Phase 6 deletes no first-seen surface. Keep the wrapping `requireAdmin` + try/catch boundary discipline.
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

### T6.9b — Advisory-lock topology guard for the action file (PF15 — EXTEND meta-test)

> The structural guard at `tests/auth/advisoryLockRpcDeadlock.test.ts` pins which surfaces may call the lock-taking RPCs and asserts none do so inside a JS-held show lock (invariant 2 single-holder). Adding `app/admin/show/[slug]/_actions.ts` to its `sourceFiles` makes the delegation contract enforced at CI time, not just by reviewer eyeballs.

- [ ] **Test** — EXTEND `tests/auth/advisoryLockRpcDeadlock.test.ts`: add `app/admin/show/[slug]/_actions.ts` to the `sourceFiles` set. Assert that on that surface, none of `mi11_approve_hold` / `mi11_reject_hold` / `undo_change` (nor any `supabase.rpc(...)` to them) occurs **inside** a `withShowAdvisoryLock` (or `pg_advisory_xact_lock` JS wrapper) call. Failure mode it catches: *a future edit re-inlines the RPC or wraps the delegated helper in a JS-side show lock, nesting two holders on the same hashkey → burst deadlock (M5 R20 class).* Because T6.7 makes `_actions.ts` delegate (no inline `supabase.rpc`), the strongest form asserts the file contains **zero** direct lock-taking-RPC call sites — the only path is the guarded Phase 3/4 helper. (Negative-regression: stash the delegation, re-inline a `supabase.rpc("mi11_approve_hold", …)` wrapped in `withShowAdvisoryLock`, confirm the test fails.)
- [ ] Commit `test(auth): pin admin show _actions.ts as non-nested lock surface (PF15)`.

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
