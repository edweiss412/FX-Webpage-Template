# Recently auto-applied strip redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the admin dashboard "Recently auto-applied" strip into per-change bordered cards (status-token kind pills + name-only From→To diff + full/half Accept-Undo), backed by a PII-safe read-layer projection — no DB migration.

**Architecture:** The loader (`loadRecentAutoApplied.ts`) gains a discriminated `diff` per row, derived server-side from `before_image`/`after_image` (only `name` escapes). The component (`RecentAutoAppliedStrip.tsx`) renders each row as a card; the shared Accept/Undo buttons gain an optional `stretch` prop for the full/half grid layout. Undo-all confirm gate + action delegation are preserved verbatim.

**Tech Stack:** Next.js 16 RSC + React 19 client components, TypeScript, Tailwind v4 (`@theme` tokens), Supabase service-role read, Vitest + Testing Library (jsdom), Playwright (real-browser layout).

**Spec:** `docs/superpowers/specs/2026-07-14-recent-auto-applied-redesign.md` (Codex-APPROVED, 2 rounds).
**Mock:** `docs/superpowers/specs/2026-07-14-recent-auto-applied-redesign-mock/Dashboard-auto-applied-final.dc.html`.

## Global Constraints

- **TDD per task; commit per task** — failing test → minimal impl → green → commit. Conventional commits (`feat(admin):` / `test(admin):`). `--no-verify` (shared lint-staged hook lives in main).
- **No raw error codes in UI** (inv 5) — `infra_error` renders a fixed sentence; typed failures via `ErrorExplainer`.
- **PII-safe projection** — ONLY `name` is read from `before_image`/`after_image`; `email`/`phone`/`id`/`claimed_via_oauth_at`/`role*` never leave the loader, never enter the row object, never logged.
- **Supabase call-boundary** (inv 9) — the extended select keeps the `{ data, count, error }` destructure + typed `infra_error`; loader stays registered in `_metaInfraContract` + `_metaBoundedReads`. Do NOT introduce a `;` inside the `.from().select()...` chain (the bounded-reads meta splits statements on `;`).
- **No new tokens / no DESIGN.md edit** — kind pills reuse `status-positive/review/warn/idle` (+ `-text`); pill fill = token alpha (`bg-status-*/12`), never inline hex.
- **Preserve all data-testids** (verbatim): `recent-auto-applied-strip`, `auto-applied-error`, `auto-applied-overflow`, `auto-applied-group-${showId}`, `auto-applied-row-${id}`, `auto-applied-accept-all-${showId}`, `auto-applied-undo-all-${showId}`, `auto-applied-undo-all-confirm-${showId}`, `auto-applied-undo-all-cancel-${showId}`, `auto-applied-undo-all-confirm-go-${showId}`, `change-feed-accept`, `change-feed-undo`.
- **UI = Opus** + invariant-8 impeccable dual-gate before cross-model review.

## Meta-test inventory (declared)

- **Extends:** none (no new registry).
- **Re-runs (must stay green):** `tests/admin/_metaBoundedReads.test.ts` (loader registered L37), `tests/admin/_metaInfraContract.test.ts`. Re-run after ANY loader edit — these are comment/format fragile.
- **Advisory-lock topology:** N/A — no `pg_advisory*` surface touched (loader is a read; no mutation path changes). Declared explicitly per writing-plans rule.
- **Not extended:** `tests/observe/_metaReadOnlyQueryCore.test.ts` — the before/after-image select is in `lib/admin`, outside the observe core (`lib/observe/query/**`) it guards.

---

## Task 1: Loader — name-only `diff` projection

**Files:**
- Modify: `lib/admin/loadRecentAutoApplied.ts`
- Test: `tests/admin/loadRecentAutoApplied.test.ts` (extend)

**Interfaces:**
- Produces: `AutoAppliedDiff` (exported); `AutoAppliedRow` gains `diff: AutoAppliedDiff`.
```ts
export type AutoAppliedDiff =
  | { kind: "fromTo"; from: string; to: string }
  | { kind: "single"; caption: "Added" | "Removed"; value: string }
  | { kind: "none" };
```

- [ ] **Step 1: Write the failing tests.** In `tests/admin/loadRecentAutoApplied.test.ts`:

First, extend the fake client to CAPTURE the select projection (defeats the pass-through tautology). In `makeClient`, add to `captured`: `select: null as string | null,` and replace `builder.select = pass;` with:
```ts
      builder.select = (proj?: string) => {
        if (typeof proj === "string") captured.select = proj;
        return builder;
      };
```

Then add a new test block:
```ts
  test("diff projection: name-only From→To per kind; select pulls the images; no PII leaks", async () => {
    const S = "show-diff";
    // before/after images carry PII that MUST NOT surface (email/phone/id/oauth).
    const renamed = clRow({
      id: "d1", show_id: S, occurred_at: iso(50), change_kind: "crew_renamed",
      before_image: { id: "u1", name: "Jon Clark", email: "jon@x.io", phone: "555-1", claimed_via_oauth_at: "2026-01-01" },
      after_image: { name: "John Clark", email: "john@x.io" },
    });
    const added = clRow({
      id: "d2", show_id: S, occurred_at: iso(49), change_kind: "crew_added",
      before_image: null,
      after_image: { name: "Maria Chen", email: "maria@x.io" },
    });
    const removed = clRow({
      id: "d3", show_id: S, occurred_at: iso(48), change_kind: "crew_removed",
      before_image: { id: "u3", name: "Devin Park", email: "devin@x.io", phone: "555-3" },
      after_image: null,
    });
    const field = clRow({ id: "d4", show_id: S, occurred_at: iso(47), change_kind: "field_changed" });
    const email = clRow({ id: "d5", show_id: S, occurred_at: iso(46), change_kind: "crew_email_changed" });

    const { client, captured } = makeClient({ rows: [renamed, added, removed, field, email] });
    const { loadRecentAutoApplied } = await loader();
    const result = await loadRecentAutoApplied({ publishedShowIds: [S], supabase: client as unknown as InjectedClient });
    if (result.kind !== "ok") throw new Error("unreachable");
    const g = result.groups.find((x) => x.showId === S)!;
    const byId = Object.fromEntries(g.rows.map((r) => [r.id, r.diff]));

    expect(byId.d1).toEqual({ kind: "fromTo", from: "Jon Clark", to: "John Clark" });
    expect(byId.d2).toEqual({ kind: "single", caption: "Added", value: "Maria Chen" });
    expect(byId.d3).toEqual({ kind: "single", caption: "Removed", value: "Devin Park" });
    expect(byId.d4).toEqual({ kind: "none" });
    expect(byId.d5).toEqual({ kind: "none" });

    // Binds green to the REAL column list, not just fixture shape.
    expect(captured.select).toContain("before_image");
    expect(captured.select).toContain("after_image");

    // PII exclusion: no email/phone/id/oauth value appears anywhere in the returned rows.
    const serialized = JSON.stringify(g.rows);
    for (const pii of ["jon@x.io", "john@x.io", "maria@x.io", "devin@x.io", "555-1", "555-3", "u1", "u3", "2026-01-01"]) {
      expect(serialized).not.toContain(pii);
    }
  });

  test("diff guards: null / empty / non-string name → diff:none (never a partial diff)", async () => {
    const S = "show-guard";
    const r1 = clRow({ id: "g1", show_id: S, occurred_at: iso(50), change_kind: "crew_renamed", before_image: null, after_image: { name: "X" } });
    const r2 = clRow({ id: "g2", show_id: S, occurred_at: iso(49), change_kind: "crew_added", before_image: null, after_image: {} });
    const r3 = clRow({ id: "g3", show_id: S, occurred_at: iso(48), change_kind: "crew_removed", before_image: { name: "" }, after_image: null });
    const r4 = clRow({ id: "g4", show_id: S, occurred_at: iso(47), change_kind: "crew_added", before_image: null, after_image: { name: 123 } });
    const { client } = makeClient({ rows: [r1, r2, r3, r4] });
    const { loadRecentAutoApplied } = await loader();
    const result = await loadRecentAutoApplied({ publishedShowIds: [S], supabase: client as unknown as InjectedClient });
    if (result.kind !== "ok") throw new Error("unreachable");
    for (const row of result.groups.find((x) => x.showId === S)!.rows) {
      expect(row.diff).toEqual({ kind: "none" });
    }
  });
```

- [ ] **Step 2: Run the tests to verify they fail.**

Run: `cd /Users/ericweiss/fxav-worktrees/recent-auto-applied-redesign && pnpm vitest run tests/admin/loadRecentAutoApplied.test.ts`
Expected: FAIL — `diff` is `undefined` (property missing on row) and `captured.select` is `null`.

- [ ] **Step 3: Implement the loader change.** In `lib/admin/loadRecentAutoApplied.ts`:

(a) Add the exported type + helpers above `loadRecentAutoApplied` (after the existing type exports):
```ts
export type AutoAppliedDiff =
  | { kind: "fromTo"; from: string; to: string }
  | { kind: "single"; caption: "Added" | "Removed"; value: string }
  | { kind: "none" };

// Reads ONLY `name` from a change-log image; everything else (email/phone/id/
// oauth/role) is deliberately never touched (PII posture, spec §3.1). Returns a
// display-safe non-empty name or null.
function readName(image: Record<string, unknown> | null | undefined): string | null {
  if (!image || typeof image !== "object") return null;
  const n = (image as { name?: unknown }).name;
  return typeof n === "string" && n.trim() !== "" ? n : null;
}

function deriveDiff(
  changeKind: string,
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): AutoAppliedDiff {
  if (changeKind === "crew_renamed") {
    const from = readName(before);
    const to = readName(after);
    return from && to ? { kind: "fromTo", from, to } : { kind: "none" };
  }
  if (changeKind === "crew_added") {
    const value = readName(after);
    return value ? { kind: "single", caption: "Added", value } : { kind: "none" };
  }
  if (changeKind === "crew_removed") {
    const value = readName(before);
    return value ? { kind: "single", caption: "Removed", value } : { kind: "none" };
  }
  return { kind: "none" };
}
```

(b) Add `diff` to the `AutoAppliedRow` type (after `undoable: boolean;`):
```ts
  diff: AutoAppliedDiff;
```

(c) Add the two image fields to `RawRow` (after `individually_undoable: boolean | null;`):
```ts
  before_image: Record<string, unknown> | null;
  after_image: Record<string, unknown> | null;
```

(d) Extend the select string (single line — do NOT add a `;`), adding `before_image, after_image` before `shows(...)`:
```ts
      .select(
        "id, show_id, change_kind, summary, occurred_at, individually_undoable, before_image, after_image, shows(slug, title)",
        { count: "exact" },
      )
```

(e) In the group-building loop, add `diff` to the `row` object (after `undoable,`):
```ts
    const row: AutoAppliedRow = {
      id: r.id,
      changeKind: r.change_kind,
      summary: r.summary,
      occurredAt: r.occurred_at,
      undoable,
      diff: deriveDiff(r.change_kind, r.before_image, r.after_image),
    };
```

- [ ] **Step 4: Run the tests to verify they pass.**

Run: `pnpm vitest run tests/admin/loadRecentAutoApplied.test.ts`
Expected: PASS (all existing + 2 new tests).

- [ ] **Step 5: Re-run the meta-tests (must stay green).**

Run: `pnpm vitest run tests/admin/_metaBoundedReads.test.ts tests/admin/_metaInfraContract.test.ts`
Expected: PASS. If `_metaBoundedReads` fails, confirm the select is still ONE statement (no stray `;`) and still carries `count:"exact"`.

- [ ] **Step 6: Commit.**
```bash
git add lib/admin/loadRecentAutoApplied.ts tests/admin/loadRecentAutoApplied.test.ts
git commit --no-verify -m "feat(admin): name-only From→To diff projection in loadRecentAutoApplied"
```

---

## Task 2: Optional `stretch` prop on Accept/Undo change buttons

**Files:**
- Modify: `components/admin/AcceptChangeButton.tsx`, `components/admin/UndoChangeButton.tsx`
- Test: `tests/components/admin/AcceptChangeButton.test.tsx`, `tests/components/admin/UndoChangeButton.test.tsx` (extend)

**Interfaces:**
- Produces: `AcceptChangeButton` + `UndoChangeButton` accept an optional `stretch?: boolean` (default `false`). When `true`, the `<form>` and inner `<button>` carry `w-full`.

- [ ] **Step 1: Write the failing tests.** Append to `tests/components/admin/AcceptChangeButton.test.tsx`:
```ts
it("stretch=false (default) → inner button is not w-full; stretch → form + button are w-full", () => {
  const action = vi.fn().mockResolvedValue({ ok: true, count: 0 });
  const { rerender } = render(
    <AcceptChangeButton acceptAction={action} hiddenFields={{ showId: "s", changeLogId: "c" }} />,
  );
  const btn = screen.getByTestId("change-feed-accept");
  expect(btn.className).not.toMatch(/\bw-full\b/);
  rerender(
    <AcceptChangeButton acceptAction={action} hiddenFields={{ showId: "s", changeLogId: "c" }} stretch />,
  );
  const stretched = screen.getByTestId("change-feed-accept");
  expect(stretched.className).toMatch(/\bw-full\b/);
  expect(stretched.closest("form")!.className).toMatch(/\bw-full\b/);
});
```
Add the mirror test to `tests/components/admin/UndoChangeButton.test.tsx` (props `{ changeLogId: "c", undoAction: action }`, testid `change-feed-undo`, `action = vi.fn().mockResolvedValue({ ok: true })`). Ensure both files import `vi`, `render`, `screen` (match existing imports in each file).

- [ ] **Step 2: Run to verify fail.**

Run: `pnpm vitest run tests/components/admin/AcceptChangeButton.test.tsx tests/components/admin/UndoChangeButton.test.tsx`
Expected: FAIL — `stretch` unknown; button lacks `w-full`.

- [ ] **Step 3: Implement.**

In `components/admin/AcceptChangeButton.tsx`: (a) thread `stretch` into `SubmitButton` and add it to the props type; (b) add `stretch = false` to the `AcceptChangeButton` destructure + its props type (`stretch?: boolean;`); (c) apply `w-full` conditionally. Concretely, change `SubmitButton` to accept `className?: string` and merge it into the button `className` (append `" w-full"` when stretched), set `<form action={dispatch} className={stretch ? "w-full" : undefined}>`, and pass `className={stretch ? "w-full" : ""}` down. Minimal edit:
```tsx
export function AcceptChangeButton({
  acceptAction,
  hiddenFields,
  label = "Accept",
  stretch = false,
}: {
  acceptAction: AcceptServerAction;
  hiddenFields: Record<string, string>;
  label?: string;
  stretch?: boolean;
}) {
  const [result, dispatch, pending] = useActionState(acceptAction, null);
  const failing = result && result.ok === false ? result : null;
  return (
    <div className="flex flex-col gap-2">
      <form action={dispatch} className={stretch ? "w-full" : undefined}>
        {Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <SubmitButton disabled={pending} aria-busy={pending} stretch={stretch}>
          {label}
        </SubmitButton>
      </form>
      {failing ? (
        <div
          data-testid="change-feed-accept-result"
          className="rounded-sm border border-border-strong bg-warning-bg p-3 text-warning-text"
        >
          <ErrorExplainer code={failing.code} surface="admin" />
        </div>
      ) : null}
    </div>
  );
}
```
And in `SubmitButton`, add `stretch` to props and append `${stretch ? " w-full" : ""}` to the existing button `className` string (do not remove any existing class). Apply the identical pattern to `UndoChangeButton.tsx` (`stretch` on `SubmitButton` + `<form>` + button).

- [ ] **Step 4: Run to verify pass (incl. the full existing button suites — byte-compat default path).**

Run: `pnpm vitest run tests/components/admin/AcceptChangeButton.test.tsx tests/components/admin/UndoChangeButton.test.tsx`
Expected: PASS (new + all existing).

- [ ] **Step 5: Commit.**
```bash
git add components/admin/AcceptChangeButton.tsx components/admin/UndoChangeButton.tsx tests/components/admin/AcceptChangeButton.test.tsx tests/components/admin/UndoChangeButton.test.tsx
git commit --no-verify -m "feat(admin): optional stretch prop on Accept/Undo change buttons"
```

---

## Task 3: Redesign the strip into change cards

**Files:**
- Modify: `components/admin/RecentAutoAppliedStrip.tsx`
- Test: `tests/components/admin/RecentAutoAppliedStrip.test.tsx` (revise)

**Interfaces:**
- Consumes: `AutoAppliedRow.diff` (Task 1), `stretch` prop (Task 2).

- [ ] **Step 1: Revise the test fixtures + assertions.** In `tests/components/admin/RecentAutoAppliedStrip.test.tsx`:

(a) Add a `diff` to every fixture row in `okData()`: `r1` (crew_added) → `{ kind: "single", caption: "Added", value: "Priya Nair" }`; `r2` (crew_renamed) → `{ kind: "fromTo", from: "Bob", to: "Robert Chen" }`; `r3` (field_changed) → `{ kind: "none" }`; `r4` (crew_email_changed) → `{ kind: "none" }`.

(b) Replace the "summaries rendered verbatim" assertions for the CREW rows with diff-block assertions; keep verbatim only for the `none` rows:
```ts
it("renders crew changes as From→To / single-value diffs and none-rows as summary", () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} />);
  // fromTo (r2): To value emphasized, From value struck through — scoped to the row.
  const renamed = screen.getByTestId("auto-applied-row-r2");
  const to = within(renamed).getByText("Robert Chen");
  expect(to.className).not.toMatch(/line-through/);
  const from = within(renamed).getByText("Bob");
  expect(from.className).toMatch(/line-through/);
  // single Added (r1): value present, not struck.
  const added = screen.getByTestId("auto-applied-row-r1");
  expect(within(added).getByText("Priya Nair").className).not.toMatch(/line-through/);
  // none rows (r3 field, r4 email): verbatim summary preserved.
  expect(within(screen.getByTestId("auto-applied-row-r3")).getByText("A field changed on this sync")).toBeInTheDocument();
  expect(within(screen.getByTestId("auto-applied-row-r4")).getByText("A field changed on this sync · Dana Lee")).toBeInTheDocument();
});

it("shows a per-group count badge = rendered rows", () => {
  render(<RecentAutoAppliedStrip data={okData()} actions={noopActions()} />);
  expect(within(screen.getByTestId(`auto-applied-group-${FIN_ID}`)).getByTestId(`auto-applied-count-${FIN_ID}`)).toHaveTextContent("3");
  expect(within(screen.getByTestId(`auto-applied-group-${RIA_ID}`)).getByTestId(`auto-applied-count-${RIA_ID}`)).toHaveTextContent("1");
});

it("maps EVERY kind to its status-token pill (label + token classes, incl. removed/email/fallback)", () => {
  // Local fixture: one group, one row per kind (incl. crew_removed + an unknown
  // fallback kind) so no path can be broken/unmapped while tests pass.
  const P = "show-pills";
  const mk = (id: string, changeKind: string, diff: AutoAppliedRow["diff"]) => ({
    id, changeKind, summary: `summary-${id}`, occurredAt: `2026-07-07T0${id.length}:00:00Z`, undoable: false, diff,
  });
  const data: Extract<RecentAutoApplied, { kind: "ok" }> = {
    kind: "ok", renderedCount: 6, overflowCount: 0, rosterShiftByShow: {},
    groups: [{
      showId: P, slug: "p", showName: "Pills",
      rows: [
        mk("p1", "crew_added", { kind: "single", caption: "Added", value: "A" }),
        mk("p2", "crew_renamed", { kind: "fromTo", from: "B", to: "C" }),
        mk("p3", "crew_removed", { kind: "single", caption: "Removed", value: "D" }),
        mk("p4", "field_changed", { kind: "none" }),
        mk("p5", "crew_email_changed", { kind: "none" }),
        mk("p6", "totally_unknown_kind", { kind: "none" }),
      ],
      acceptableIds: ["p1","p2","p3","p4","p5","p6"], undoableIds: [],
    }],
  };
  render(<RecentAutoAppliedStrip data={data} actions={noopActions()} />);
  const pill = (rowId: string, label: string) =>
    within(screen.getByTestId(`auto-applied-row-${rowId}`)).getByText(label);
  // Each pill carries the mapped token text class (and the colored kinds carry the /12 fill).
  // Colored kinds: text + /12 fill + /40 border ALL pinned (a dropped border still fails).
  expect(pill("p1", "Added").className).toMatch(/text-status-positive-text/);
  expect(pill("p1", "Added").className).toMatch(/bg-status-positive\/12/);
  expect(pill("p1", "Added").className).toMatch(/border-status-positive\/40/);
  expect(pill("p2", "Renamed").className).toMatch(/text-status-review-text/);
  expect(pill("p2", "Renamed").className).toMatch(/bg-status-review\/12/);
  expect(pill("p2", "Renamed").className).toMatch(/border-status-review\/40/);
  expect(pill("p3", "Removed").className).toMatch(/text-status-warn-text/);
  expect(pill("p3", "Removed").className).toMatch(/bg-status-warn\/12/);
  expect(pill("p3", "Removed").className).toMatch(/border-status-warn\/40/);
  // Neutral kinds (field / email / unknown fallback): text + neutral bg + neutral border pinned.
  for (const [id, label] of [["p4", "Field"], ["p5", "Email"], ["p6", "Change"]] as const) {
    const cls = pill(id, label).className;
    expect(cls).toMatch(/text-status-idle-text/);
    expect(cls).toMatch(/bg-surface-sunken/);
    expect(cls).toMatch(/border-border/);
    expect(cls).not.toMatch(/bg-status-\w+\/12/); // never a colored fill on a neutral kind
  }
});
```
This test also imports `AutoAppliedRow` and `RecentAutoApplied` from `@/lib/admin/loadRecentAutoApplied` (extend the existing type import at the top of the file). Keep ALL other existing tests unchanged (order, accept-on-every-row, undo-only-on-undoable, hidden inputs, accept-all/undo-all presence, confirm gate + per-id dispatch, focus-to-keep, overflow, null-on-empty, infra_error-no-leak). Delete only the now-obsolete crew-verbatim assertions in the original "summary verbatim" test (keep its section/order assertions, or fold them into the new test).

- [ ] **Step 2: Run to verify fail.**

Run: `pnpm vitest run tests/components/admin/RecentAutoAppliedStrip.test.tsx`
Expected: FAIL — no diff blocks, no `auto-applied-count-*` badge, no pill labels.

- [ ] **Step 3: Implement the card rewrite.** In `components/admin/RecentAutoAppliedStrip.tsx`:

(a) Add a `KIND_PILL` map + `KindPill` component. **Every token class is a FULL LITERAL string (no interpolation of the token name)** — this is mandatory: Tailwind v4 JIT only emits utilities whose complete class string appears verbatim in source. A `bg-${token}/12` template would silently produce a class the compiler never generates (and `pnpm build` would NOT fail), so the pill would render with no background. After `kindLabel`:
```tsx
// Full literal token classes per change kind (spec §4). Tailwind v4 JIT scans
// source for complete class strings — these MUST stay literals, never `${token}`
// interpolation, or the utility is never emitted and the pill renders bg-less.
const KIND_PILL: Record<string, { label: string; cls: string; dot: string }> = {
  crew_added: {
    label: "Added",
    cls: "border-status-positive/40 bg-status-positive/12 text-status-positive-text",
    dot: "bg-status-positive",
  },
  crew_renamed: {
    label: "Renamed",
    cls: "border-status-review/40 bg-status-review/12 text-status-review-text",
    dot: "bg-status-review",
  },
  crew_removed: {
    label: "Removed",
    cls: "border-status-warn/40 bg-status-warn/12 text-status-warn-text",
    dot: "bg-status-warn",
  },
  field_changed: {
    label: "Field",
    cls: "border-border bg-surface-sunken text-status-idle-text",
    dot: "bg-status-idle",
  },
  crew_email_changed: {
    label: "Email",
    cls: "border-border bg-surface-sunken text-status-idle-text",
    dot: "bg-status-idle",
  },
};
const FALLBACK_PILL = {
  label: "Change",
  cls: "border-border bg-surface-sunken text-status-idle-text",
  dot: "bg-status-idle",
};

function KindPill({ changeKind }: { changeKind: string }) {
  const pill = KIND_PILL[changeKind] ?? FALLBACK_PILL;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${pill.cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${pill.dot}`} />
      {pill.label}
    </span>
  );
}
```
Note: `bg-status-positive/12` = a 12% alpha wash on the `--color-status-positive` token (Tailwind v4 `color-mix`), border `/40` likewise. The dot uses the full-strength token. All five entries + fallback are literal — nothing is interpolated from the token name.

(b) Add a `DiffBlock`:
```tsx
function DiffBlock({ row }: { row: AutoAppliedRow }) {
  const d = row.diff;
  if (d.kind === "none") {
    return <p className="wrap-break-word text-sm text-text-strong">{row.summary}</p>;
  }
  const cap = "text-[10.5px] font-semibold uppercase tracking-wide text-text-faint";
  if (d.kind === "fromTo") {
    return (
      <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-2.5 gap-y-0.5">
        <span className={cap}>From</span>
        <span className="text-sm text-text-subtle line-through">{d.from}</span>
        <span className={cap}>To</span>
        <span className="text-sm font-semibold text-text-strong">{d.to}</span>
      </div>
    );
  }
  // single
  const removed = d.caption === "Removed";
  return (
    <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-2.5 gap-y-0.5">
      <span className={cap}>{d.caption}</span>
      <span className={removed ? "text-sm text-text-subtle line-through" : "text-sm font-semibold text-text-strong"}>
        {d.value}
      </span>
    </div>
  );
}
```

(c) Rewrite `StripRow` as a card:
```tsx
function StripRow({
  row,
  group,
  actions,
}: {
  row: AutoAppliedRow;
  group: AutoAppliedGroup;
  actions: RecentAutoAppliedStripActions;
}) {
  const isCrew = row.diff.kind !== "none";
  return (
    <li
      data-testid={`auto-applied-row-${row.id}`}
      className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3"
    >
      <div className="flex items-center gap-2">
        <KindPill changeKind={row.changeKind} />
        {isCrew ? <span className="text-sm font-semibold text-text-strong">Crew member</span> : null}
      </div>
      <DiffBlock row={row} />
      <div className={`grid gap-1.5 ${row.undoable ? "grid-cols-2" : "grid-cols-1"}`}>
        <AcceptChangeButton
          acceptAction={actions.acceptChangeAction}
          hiddenFields={{ showId: group.showId, changeLogId: row.id }}
          stretch
        />
        {row.undoable ? (
          <UndoChangeButton
            changeLogId={row.id}
            undoAction={actions.undoFromDashboardAction}
            stretch
          />
        ) : null}
      </div>
    </li>
  );
}
```

(d) In `GroupSection`, change the outer `<ul>` wrapping rows from `flex flex-col` to `flex flex-col gap-2.5 p-tile-pad` (card body padding + gap, matching the mock's inner column), and add the count badge to the header. In the header's left cluster, wrap `showName` + badge:
```tsx
      <div className="flex min-w-0 flex-col gap-2 border-b border-border bg-surface-sunken p-tile-pad sm:flex-row sm:items-center sm:justify-between">
        <span className="flex min-w-0 items-center gap-2">
          <span className="wrap-break-word text-sm font-semibold text-text-strong">{group.showName}</span>
          <span
            data-testid={`auto-applied-count-${group.showId}`}
            className="shrink-0 rounded-full border border-border bg-surface px-[7px] text-xs font-semibold text-text-subtle"
          >
            {group.rows.length}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {/* Accept-all + Undo-all UNCHANGED from the existing implementation */}
```
Keep the `Accept all` wrapper (`<span data-testid={auto-applied-accept-all-${group.showId}}>`), the compact `AcceptChangeButton` (NO `stretch` — group header stays compact), the `Undo all` button, the confirm panel, the focus-to-Keep-changes effect, and `confirmUndoAll` EXACTLY as they are. Only the header-left cluster + the rows `<ul>` classes change.

- [ ] **Step 4: Run to verify pass.**

Run: `pnpm vitest run tests/components/admin/RecentAutoAppliedStrip.test.tsx`
Expected: PASS (revised + all preserved tests).

- [ ] **Step 5: Typecheck + lint (dynamic-class + canonical Tailwind risk).**

Run: `pnpm typecheck && pnpm lint --quiet 2>&1 | tail -20`
Expected: no errors. Fix any `better-tailwindcss/enforce-canonical-classes` finding (e.g. use `line-through`, `wrap-break-word` canonical forms).

- [ ] **Step 6: Commit.**
```bash
git add components/admin/RecentAutoAppliedStrip.tsx tests/components/admin/RecentAutoAppliedStrip.test.tsx
git commit --no-verify -m "feat(admin): redesign Recently auto-applied strip into change cards"
```

---

## Task 4: Real-browser layout assertion (dimensional invariant §6)

**Files:**
- Create: `tests/e2e/recent-auto-applied-strip.spec.ts`
- Reuse: `tests/e2e/helpers/layout.ts` patterns; render the component via the standalone real-browser harness precedent (`reference_standalone_realbrowser_layout_harness`) — an esbuild-bundled mount of `RecentAutoAppliedStrip` with a fixture containing one undoable (2-button) and one field (1-button) row, plus an `AppRouterContext` stub and no-op server-action props.

**Interface:** proves the `stretch` grid distributes width: two-button card → each button ≈ half the row (±2px of `(rowWidth - 6)/2`, gap = `gap-1.5` = 6px); one-button card → button ≈ full row width (±2px).

- [ ] **Step 1: Write the failing/real-browser test.** Bundle the client component (pinned esbuild dlx per the harness precedent), serve a static page mounting it with:
```ts
// fixture: one crew_added (undoable → 2 buttons) row + one field_changed (1 button) row,
// each in its own single-row group; noop server actions; AppRouterContext stub.
```
Assert via `page.locator('[data-testid="auto-applied-row-<undoable>"] [data-testid="change-feed-accept"]').boundingBox()` vs the Undo box (≈ equal, each ≈ half the card content width) and the field row's Accept box ≈ full card content width. Use the existing `layout.ts` helpers for box math + tolerance.

- [ ] **Step 2: Run to verify it meaningfully exercises layout.**

Run: `pnpm playwright test tests/e2e/recent-auto-applied-strip.spec.ts` (or the repo's e2e runner; confirm the command from `package.json` scripts — likely `pnpm test:e2e`). Expected: FAILS if the buttons are intrinsic-width (proving the assertion has teeth), PASSES with the `stretch` classes from Tasks 2–3.

- [ ] **Step 3: If the standalone harness proves disproportionate** (bundling/serve flakiness in CI), DO NOT ship a flaky gate. Instead: (a) keep the jsdom class-mechanism assertions from Task 3 (grid `grid-cols-2`/`grid-cols-1` + `w-full` on stretched buttons — these catch the real regression: a missing `w-full`), and (b) add a `DEFERRED.md` entry: "Real-browser width-distribution assertion for the auto-applied card button grid — deferred; width fill is guaranteed by `w-full` + CSS-grid default `justify-items:stretch`, and the jsdom tests pin the mechanism (grid template + `w-full`). Backlog: BL-AUTOAPPLIED-CARD-LAYOUT-E2E." Record the disposition in the handoff. (This mirrors the project's deferral discipline; the dimensional invariant is still mechanically pinned.)

- [ ] **Step 4: Commit.**
```bash
git add tests/e2e/recent-auto-applied-strip.spec.ts   # or: git add DEFERRED.md (if step 3 fallback)
git commit --no-verify -m "test(admin): real-browser layout assertion for auto-applied card button grid"
```

---

## Task 5: Impeccable dual-gate + close-out (invariant 8)

Not a TDD task — the UI-quality gate that MUST pass before the whole-diff cross-model review.

- [ ] **Step 1: Full suite green.**

Run: `pnpm test` (full — scoped gates miss cross-file regressions). Also `pnpm typecheck`, `pnpm lint`, `pnpm format:check`. Expected: all green.

- [ ] **Step 2: Build (Server→Client boundary + dynamic-class emission).**

Run: `pnpm build`. Expected: success. Confirms no RSC-boundary break and the pill background classes actually emit (dynamic classnames are the risk — verify the pill has a colored background in a browser or a built-CSS grep).

- [ ] **Step 3: `/impeccable critique` AND `/impeccable audit`** on the diff (the two changed component files + the strip). HIGH/CRITICAL findings fixed inline, or deferred via a `DEFERRED.md` entry with rationale. Record findings + dispositions for the handoff §12.

- [ ] **Step 4: Commit any fixes** from the impeccable pass (`fix(admin): …` per finding), then proceed to Stage 4 whole-diff Codex review.

---

## Self-review (author checklist — completed)

- **Spec coverage:** §3 diff → Task 1; §4 tokens + §5 cards → Task 3; button stretch (§5.4/§6) → Task 2; §6 dimensional invariant → Task 4; §9 tests → Tasks 1–4; inv 8 → Task 5. No spec section unmapped.
- **Placeholder scan:** every code step carries literal code; no TBD/TODO.
- **Type consistency:** `AutoAppliedDiff` shape identical in Task 1 (loader), Task 3 (component consume). `stretch?: boolean` identical in Task 2 + consumed in Task 3. `deriveDiff`/`readName` names stable.
- **Anti-tautology:** Task 1 select-projection + PII-exclusion assertions; Task 3 within-row scoping + derive-from-fixture; Task 4 real-browser (jsdom insufficient) with an explicit teeth check.
