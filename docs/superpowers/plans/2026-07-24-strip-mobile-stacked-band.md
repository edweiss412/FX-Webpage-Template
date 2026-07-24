# Stacked Mobile Control Band Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement spec `docs/superpowers/specs/2026-07-24-strip-mobile-stacked-band.md` — a deterministic stacked control band below `sm` in the published review modal, with an exactly-matching skeleton, resolving `STRIP-MOBILE-WRAP-1` and `STRIP-SKELETON-MOBILE-BAND-1`.

**Architecture:** Flat full-width direct children of the existing `flex-wrap` strip form the mobile rows (no wrappers, no break elements). ONE PublishedToggle (new `settings` variant) and ONE ReSyncButton serve both breakpoints via `max-sm:`/`sm:`-gated internals. Skeleton mirrors the row structure; parity spec re-tightens to ≤4px at 390px.

**Tech Stack:** Next.js 16 / React 19, Tailwind v4 tokens, lucide-react, Vitest + Testing Library (jsdom), Playwright standalone static harnesses.

## Global Constraints

- Spec is canonical: `docs/superpowers/specs/2026-07-24-strip-mobile-stacked-band.md` (R5 APPROVE). §1.1 decisions are closed.
- Phones only: every change `max-sm:`-scoped or `sm`-hidden; `≥sm` layout/labels/behavior unchanged (spec §1.1).
- TDD per task; conventional commits; `--no-verify` allowed in worktree (autonomous gate).
- No em-dashes or straight-apostrophe issues in new user-visible copy: "Published", "Visible to crew", "Hidden from crew", "Sync", "Live", "Draft", "Archived" (spec §7).
- 44px tap floor via `min-h-tap-min`/`min-w-tap-min`/`size-tap-min` tokens; no new magic pixels (badge dot = `size-2`; lucide `size={15}` precedent ShareHub.tsx:414-416).
- Single-instance rule: never a second `published-toggle` / `admin-resync-button` testid (spec §1.1).
- Meta-test inventory: NONE created or extended (no new Supabase calls, sentinels, alert codes, locks, mutation surfaces). §9 strip lexical scanner + help scanners must stay green (verified in Task 8).
- Advisory-lock topology: N/A (no `pg_advisory*` surface touched).
- Worktree: `/Users/ericweiss/FX-worktrees/strip-mobile-reflow` (env linked, preflight green). All commands run from the worktree root.

**Verification commands used across tasks** (expected-green unless a step says FAIL):

```bash
pnpm vitest run tests/components/admin/showpage/statusStrip.test.tsx
pnpm vitest run tests/components/admin/PublishedToggle.test.tsx
pnpm exec tsc --noEmit
node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/skeletonBandParity.spec.ts
```

---

### Task 1: StatusStrip mobile rows + state badge

**Files:**
- Modify: `components/admin/showpage/StatusStrip.tsx`
- Test: `tests/components/admin/showpage/statusStrip.test.tsx`

**Interfaces:**
- Produces: `data-testid="strip-state-badge"` (pill) inside a `data-testid="strip-state-badge-row"` wrapper; `data-testid="strip-divider-1"` / `"strip-divider-2"`; `stateBadge(archived, isLive, published)` stays module-private — later tasks rely only on the testids and the class contracts below.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests** — append a new describe block to `tests/components/admin/showpage/statusStrip.test.tsx` (reuse the file's existing `renderStrip(overrides)` helper):

```tsx
describe("stacked mobile band (spec 2026-07-24-strip-mobile-stacked-band §3)", () => {
  it("badge matrix: literal outcomes per lifecycle", () => {
    const cases: Array<{
      archived: boolean; isLive: boolean; published: boolean; label: string;
    }> = [
      { archived: true, isLive: false, published: true, label: "Archived" },
      { archived: true, isLive: true, published: false, label: "Archived" },
      { archived: false, isLive: true, published: true, label: "Live" },
      { archived: false, isLive: false, published: true, label: "Published" },
      { archived: false, isLive: false, published: false, label: "Draft" },
      // Contract-violation input (garbage-in, spec §10): precedence shows Live.
      { archived: false, isLive: true, published: false, label: "Live" },
    ];
    for (const c of cases) {
      renderStrip({ archived: c.archived, isLive: c.isLive, published: c.published });
      const badge = screen.getByTestId("strip-state-badge");
      expect(badge).toHaveTextContent(c.label);
      expect(badge.className).toContain("h-6");
      expect(badge.className).toContain("rounded-pill");
      cleanup();
    }
  });

  it("badge row wrapper is a full-width right-aligning line, mobile-only", () => {
    renderStrip();
    const row = screen.getByTestId("strip-state-badge-row");
    for (const cls of ["hidden", "max-sm:flex", "w-full", "justify-end"]) {
      expect(row.className).toContain(cls);
    }
    expect(row.parentElement).toBe(screen.getByTestId("show-status-strip"));
  });

  it("Live badge recipe uses the pinned accent-tint pair, dot included", () => {
    renderStrip({ isLive: true, published: true });
    const badge = screen.getByTestId("strip-state-badge");
    expect(badge.className).toContain("bg-accent-tint");
    expect(badge.className).toContain("text-accent-on-bg");
    const dot = badge.querySelector("span[aria-hidden]");
    expect(dot?.className).toContain("size-2");
    expect(dot?.className).toContain("bg-accent-on-bg");
  });

  it("desktop badges hide below sm; exactly one state signal per breakpoint", () => {
    renderStrip({ isLive: true, published: true });
    expect(screen.getByTestId("strip-live-badge").className).toContain("max-sm:hidden");
    cleanup();
    renderStrip({ archived: true });
    expect(screen.getByTestId("strip-archived-badge").className).toContain("max-sm:hidden");
    expect(screen.getByTestId("strip-state-badge")).toHaveTextContent("Archived");
  });

  it("dividers: D1 present iff not archived; D2 present iff R2 renders anything", () => {
    renderStrip(); // published, synced fixture
    expect(screen.getByTestId("strip-divider-1")).toBeInTheDocument();
    expect(screen.getByTestId("strip-divider-2")).toBeInTheDocument();
    for (const id of ["strip-divider-1", "strip-divider-2"]) {
      const d = screen.getByTestId(id);
      for (const cls of ["hidden", "max-sm:block", "h-px", "w-full", "bg-border"]) {
        expect(d.className).toContain(cls);
      }
    }
    cleanup();
    renderStrip({ archived: true });
    expect(screen.queryByTestId("strip-divider-1")).toBeNull();
    expect(screen.getByTestId("strip-divider-2")).toBeInTheDocument();
    cleanup();
    renderStrip({ archived: true, lastSyncedAt: null });
    expect(screen.queryByTestId("strip-divider-1")).toBeNull();
    expect(screen.queryByTestId("strip-divider-2")).toBeNull();
  });

  it("R2 clip-priority classes are max-sm scoped; sync-age keeps desktop shrink-0", () => {
    renderStrip();
    const group = screen.getByTestId("strip-sync-age");
    for (const cls of ["shrink-0", "max-sm:shrink", "max-sm:min-w-0", "max-sm:overflow-hidden"]) {
      expect(group.className).toContain(cls);
    }
    const synced = screen.getByTestId("strip-synced-line");
    expect(synced.className).toContain("max-sm:whitespace-nowrap");
    expect(synced.className).toContain("max-sm:shrink-0");
    const edited = screen.getByTestId("strip-edited-age");
    for (const cls of [
      "max-sm:whitespace-nowrap", "max-sm:min-w-0",
      "max-sm:overflow-hidden", "max-sm:text-ellipsis",
    ]) {
      expect(edited.className).toContain(cls);
    }
  });

  it("share-hub group spans the band below sm; root row classes unchanged", () => {
    renderStrip();
    const group = screen.getByTestId("share-hub-group");
    expect(group.className).toContain("ml-auto");
    expect(group.className).toContain("max-sm:w-full");
    const classes = screen.getByTestId("show-status-strip").className.split(/\s+/);
    for (const cls of ["flex", "w-full", "flex-wrap", "items-center", "sm:flex-nowrap"]) {
      expect(classes).toContain(cls);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/components/admin/showpage/statusStrip.test.tsx`
Expected: FAIL — `Unable to find an element by: [data-testid="strip-state-badge"]` (and sibling failures).

- [ ] **Step 3: Implement in `StatusStrip.tsx`**

(a) Module-private badge resolver above the component (literal precedence per spec §3 R0):

```tsx
type StateBadge = { label: string; pill: string; dot: string };

// Mobile state badge (spec §3 R0). Precedence archived > isLive > published.
// `isLive && !published` is upstream-unreachable (this file:43-45); precedence
// shows "Live" on that garbage-in, documented in the spec's §10.
function stateBadge(archived: boolean, isLive: boolean, published: boolean): StateBadge {
  if (archived)
    return { label: "Archived", pill: "border border-border bg-surface text-text-subtle", dot: "bg-text-faint" };
  if (isLive) return { label: "Live", pill: "bg-accent-tint text-accent-on-bg", dot: "bg-accent-on-bg" };
  if (published)
    return { label: "Published", pill: "bg-surface-sunken text-text-subtle", dot: "bg-status-positive" };
  return { label: "Draft", pill: "bg-surface-sunken text-text-subtle", dot: "bg-text-faint" };
}
```

(b) Inside the returned strip, FIRST child (before the archived/toggle ternary):

```tsx
{/* R0 (spec §3): mobile-only state badge on its own full-width line. */}
<div data-testid="strip-state-badge-row" className="hidden max-sm:flex w-full justify-end">
  {(() => {
    const b = stateBadge(archived, isLive, published);
    return (
      <span
        data-testid="strip-state-badge"
        className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-pill px-2.5 text-xs font-semibold ${b.pill}`}
      >
        <span aria-hidden="true" className={`size-2 shrink-0 rounded-pill ${b.dot}`} />
        {b.label}
      </span>
    );
  })()}
</div>
```

(c) Desktop badges hide below sm — archived badge (line ~192) and live badge wrapper (line ~217) each gain `max-sm:hidden` appended to their existing className.

(d) Dividers. D1 directly AFTER the archived/toggle ternary block, D2 directly BEFORE the share-hub group:

```tsx
{!archived ? (
  <div aria-hidden="true" data-testid="strip-divider-1" className="hidden max-sm:block h-px w-full bg-border" />
) : null}
```

```tsx
{lastSyncedAt != null || !archived ? (
  <div aria-hidden="true" data-testid="strip-divider-2" className="hidden max-sm:block h-px w-full bg-border" />
) : null}
```

(D2 condition = "R2 renders anything": sync-age renders iff `lastSyncedAt != null`; the Sync trigger renders iff `!archived`.)

(e) R1 wrapper: the existing `strip-publish-toggle` div className `"shrink-0"` becomes `"shrink-0 max-sm:w-full"`.

(f) R2 classes: sync-age span (line ~223) className becomes
`"flex shrink-0 items-center gap-2 max-sm:shrink max-sm:min-w-0 max-sm:overflow-hidden"`;
status line span (line ~246) appends `max-sm:min-w-0 max-sm:overflow-hidden`;
`strip-synced-line` span gains `className="max-sm:whitespace-nowrap max-sm:shrink-0"`;
`strip-edited-age` span gains `className="max-sm:whitespace-nowrap max-sm:min-w-0 max-sm:overflow-hidden max-sm:text-ellipsis"`.

(g) R3: `share-hub-group` className appends `max-sm:w-full`.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/components/admin/showpage/statusStrip.test.tsx`
Expected: PASS (new block AND all pre-existing tests — direct-parent, DOM-order, root classes — untouched and green).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add components/admin/showpage/StatusStrip.tsx tests/components/admin/showpage/statusStrip.test.tsx
git commit --no-verify -m "feat(admin): mobile state badge + stacked-row classes in StatusStrip"
```

---

### Task 2: PublishedToggle `settings` variant (single responsive instance)

**Files:**
- Modify: `components/admin/PublishedToggle.tsx`
- Modify: `components/admin/showpage/StatusStrip.tsx` (variant swap, one line)
- Test: `tests/components/admin/PublishedToggle.test.tsx`

**Interfaces:**
- Produces: `variant?: "card" | "inline" | "settings"`; settings renders `data-testid="published-toggle-sublabel"` (no id); container testid stays `published-toggle-inline` (settings is the inline arm made responsive — existing consumers keep working); `aria-describedby` rule unchanged (`showFinalize ? popoverId : undefined`).
- Consumes: Task 1's strip (wrapper `max-sm:w-full`).

- [ ] **Step 1: Write the failing tests** — append to `tests/components/admin/PublishedToggle.test.tsx` (reuse its `renderInline`-style helper; add a `renderSettings(overrides)` that passes `variant="settings"`):

```tsx
describe("settings variant (spec 2026-07-24-strip-mobile-stacked-band §3 R1)", () => {
  // renderInline (line 139) hardcodes variant="inline" and slug="s1"; settings
  // gets its own sibling helper with the SAME defaults so describedby ids match.
  function renderSettings(
    over: Partial<{
      published: boolean;
      finalizeOwned: boolean;
      setPublished: (n: boolean) => Promise<{ ok: true } | { ok: false; code: string }>;
    }> = {},
  ) {
    return render(
      <PublishedToggle
        slug="s1"
        variant="settings"
        published={over.published ?? true}
        finalizeOwned={over.finalizeOwned ?? false}
        setPublished={over.setPublished ?? (async () => ({ ok: true }) as const)}
      />,
    );
  }

  it("renders ONE switch, mobile label block + sublabel, desktop label hidden below sm", () => {
    renderSettings({ published: true });
    expect(screen.getAllByTestId("published-toggle")).toHaveLength(1);
    const sub = screen.getByTestId("published-toggle-sublabel");
    expect(sub).toHaveTextContent("Visible to crew");
    expect(sub.className).toContain("truncate");
    expect(sub.hasAttribute("id")).toBe(false);
  });

  it("sublabel branches: hidden / both finalize sublines", () => {
    renderSettings({ published: false });
    expect(screen.getByTestId("published-toggle-sublabel")).toHaveTextContent("Hidden from crew");
    cleanup();
    renderSettings({ published: true, finalizeOwned: true });
    expect(screen.getByTestId("published-toggle-sublabel")).toHaveTextContent(
      "Changes are being finalized — the switch unlocks when they commit.",
    );
    cleanup();
    renderSettings({ published: false, finalizeOwned: true });
    expect(screen.getByTestId("published-toggle-sublabel")).toHaveTextContent(
      "A publish is finishing — the switch unlocks when it's done.",
    );
  });

  it("aria-describedby rule is UNCHANGED: present iff finalize, exactly the popover id", () => {
    renderSettings({ published: true });
    expect(screen.getByTestId("published-toggle").hasAttribute("aria-describedby")).toBe(false);
    cleanup();
    renderSettings({ published: true, finalizeOwned: true });
    expect(screen.getByTestId("published-toggle").getAttribute("aria-describedby")).toBe(
      "published-toggle-popover-s1",
    );
  });

  it("finalize chip is desktop-only in settings; refusal banner keeps POPOVER_POSITION classes", async () => {
    renderSettings({ published: true, finalizeOwned: true });
    const chip = screen.getByTestId("published-toggle-popover");
    expect(chip.className).toContain("max-sm:hidden");
    cleanup();
    renderSettings({
      published: true,
      setPublished: async () => ({ ok: false, code: "PUBLISH_BLOCKED_PENDING_REVIEW" }),
    });
    fireEvent.click(screen.getByTestId("published-toggle"));
    const banner = await screen.findByTestId("published-toggle-popover");
    for (const cls of ["absolute", "inset-x-0", "top-full", "z-40"]) {
      expect(banner.className).toContain(cls);
    }
  });
});
```

(Verified: `renderInline` at PublishedToggle.test.tsx:139 hardcodes `variant="inline"` and `slug="s1"` — hence the dedicated `renderSettings` helper above and the `-s1` id literal.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run tests/components/admin/PublishedToggle.test.tsx`
Expected: FAIL — settings variant not accepted / sublabel testid missing.

- [ ] **Step 3: Implement**

(a) Widen the prop type and doc comment:

```tsx
  /** Presentation. "card" (default) = full bordered box w/ h3 + subline + in-flow error.
   *  "inline" = compact switch + "Published" label; refusal/finalize copy → anchored popover.
   *  "settings" = the inline arm made responsive for the strip (spec
   *  2026-07-24-strip-mobile-stacked-band §3 R1): below sm a full-width row
   *  with a heading + state sublabel; at ≥sm renders exactly like "inline". */
  variant?: "card" | "inline" | "settings";
```

(b) Replace `if (variant === "inline") {` with `if (variant === "inline" || variant === "settings") {` and inside:

```tsx
    const isSettings = variant === "settings";
    const settingsSublabel = finalizeOwned
      ? subline
      : published
        ? "Visible to crew"
        : "Hidden from crew";
    return (
      <div
        data-testid="published-toggle-inline"
        className={
          isSettings
            ? "inline-flex items-center gap-2 max-sm:flex max-sm:w-full max-sm:min-h-tap-min max-sm:items-center max-sm:justify-between max-sm:gap-3"
            : "inline-flex items-center gap-2"
        }
      >
        <span
          className={`text-sm font-medium text-text-strong ${isSettings ? "max-sm:hidden" : ""}`}
        >
          Published
        </span>
        {isSettings ? (
          <span className="hidden max-sm:flex max-sm:min-w-0 max-sm:flex-col">
            <span className="text-sm font-semibold text-text-strong">Published</span>
            <span
              data-testid="published-toggle-sublabel"
              className="truncate text-xs text-text-subtle"
            >
              {settingsSublabel}
            </span>
          </span>
        ) : null}
        {/* form + SwitchButton + error/finalize branches: UNCHANGED below,
            except the finalize chip's className gains `max-sm:hidden` when
            isSettings (template literal on FINALIZE_CHIP). */}
```

Concretely: the finalize chip's `className={FINALIZE_CHIP}` becomes
`className={isSettings ? `${FINALIZE_CHIP} max-sm:hidden` : FINALIZE_CHIP}`.
Nothing else in the branch changes — `describedBy`, error banner, form, and
SwitchButton are byte-identical.

(c) StatusStrip: `variant="inline"` → `variant="settings"` at the single strip mount.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run tests/components/admin/PublishedToggle.test.tsx tests/components/admin/showpage/statusStrip.test.tsx`
Expected: PASS, including every pre-existing inline-variant test (settings must not regress inline).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add components/admin/PublishedToggle.tsx components/admin/showpage/StatusStrip.tsx tests/components/admin/PublishedToggle.test.tsx
git commit --no-verify -m "feat(admin): PublishedToggle settings variant - responsive single-instance strip row"
```

---

### Task 3: ReSyncButton mobile skin

**Files:**
- Modify: `components/admin/ReSyncButton.tsx`
- Test: `tests/components/ReSyncButton.test.tsx` (the existing unit file — verified location)

**Interfaces:**
- Produces: same single `data-testid="admin-resync-button"`; mobile block `data-testid="admin-resync-mobile-label"`; desktop grid wrapped in `data-testid="admin-resync-desktop-label"`.
- Consumes: Task 1's R2 layout.

- [ ] **Step 1: Write the failing tests**

```tsx
describe("mobile Sync skin (spec 2026-07-24-strip-mobile-stacked-band §3 R2)", () => {
  it("one trigger, two breakpoint-gated label blocks, real 44px box classes", () => {
    render(<ReSyncButton slug="s1" />);
    const btn = screen.getByTestId("admin-resync-button");
    expect(screen.getAllByTestId("admin-resync-button")).toHaveLength(1);
    expect(btn.className).toContain("min-h-tap-min");
    expect(btn.className).toContain("min-w-tap-min");
    expect(btn.className).toContain("max-sm:px-0");
    expect(btn.className).toContain("max-sm:ml-auto");
    const desktop = screen.getByTestId("admin-resync-desktop-label");
    expect(desktop.className).toContain("max-sm:hidden");
    const mobile = screen.getByTestId("admin-resync-mobile-label");
    for (const cls of ["hidden", "max-sm:inline-flex", "h-8", "px-3", "rounded-sm", "border", "border-border"]) {
      expect(mobile.className).toContain(cls);
    }
    expect(mobile).toHaveTextContent("Sync");
  });

  it("pending: icon spins with motion-reduce escape; aria-busy on", async () => {
    let resolvePost!: (v: unknown) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((r) => { resolvePost = r; })));
    render(<ReSyncButton slug="s1" />);
    fireEvent.click(screen.getByTestId("admin-resync-button"));
    const icon = screen.getByTestId("admin-resync-mobile-label").querySelector("svg");
    expect(icon?.getAttribute("class") ?? "").toContain("animate-spin");
    expect(icon?.getAttribute("class") ?? "").toContain("motion-reduce:animate-none");
    expect(screen.getByTestId("admin-resync-button").getAttribute("aria-busy")).toBe("true");
    resolvePost({ ok: true, json: async () => ({ ok: true, result: { outcome: "skipped" } }) });
  });
});
```

(Follow the target test file's existing mock pattern for `fetch`/router — reuse its established stubs rather than `vi.stubGlobal` if the file already mocks differently.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run` on the target test file.
Expected: FAIL — `admin-resync-mobile-label` absent.

- [ ] **Step 3: Implement** in `ReSyncButton.tsx`:

(a) `import { RefreshCw } from "lucide-react";`

(b) Trigger className: append `max-sm:px-0 max-sm:ml-auto` to the existing string (keep `px-2` — it applies ≥sm; `max-sm:px-0` overrides below).

(c) Replace the label `<span className="grid place-items-center">…</span>` block with:

```tsx
        {/* ≥sm: the existing width-reservation grid, untouched (T-RESYNC-WIDTH). */}
        <span data-testid="admin-resync-desktop-label" className="max-sm:hidden">
          <span className="grid place-items-center">
            <span aria-hidden="true" className="invisible col-start-1 row-start-1 whitespace-nowrap">
              {pending ? IDLE_LABEL : PENDING_LABEL}
            </span>
            <span className="col-start-1 row-start-1 whitespace-nowrap">
              {pending ? PENDING_LABEL : IDLE_LABEL}
            </span>
          </span>
        </span>
        {/* <sm: bordered 32px skin inside the 44px button (spec §3 R2). Visible
            text IS the accessible name at this breakpoint: "Sync". */}
        <span
          data-testid="admin-resync-mobile-label"
          className="hidden max-sm:inline-flex items-center gap-1.5 h-8 px-3 rounded-sm border border-border"
        >
          <RefreshCw
            aria-hidden="true"
            size={15}
            className={pending ? "animate-spin motion-reduce:animate-none" : undefined}
          />
          Sync
        </span>
```

- [ ] **Step 4: Run tests**

Run: target test file + `pnpm vitest run tests/components/admin/showpage/statusStrip.test.tsx`
Expected: PASS (incl. existing width-reservation tests).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add components/admin/ReSyncButton.tsx tests/
git commit --no-verify -m "feat(admin): ReSyncButton mobile icon+Sync skin, single instance"
```

---

### Task 4: ShareHub mobile geometry

**Files:**
- Modify: `components/admin/showpage/ShareHub.tsx`
- Test: `tests/components/admin/showpage/shareHub.test.tsx`

**Interfaces:**
- Produces: root + trigger `max-sm:` classes only; testids unchanged.
- Consumes: Task 1's `share-hub-group max-sm:w-full`.

- [ ] **Step 1: Write the failing tests** — append:

```tsx
describe("mobile split actions row (spec 2026-07-24-strip-mobile-stacked-band §3 R3)", () => {
  it("root spans, primary flex-1 with no-wrap contract, kebab bordered square", () => {
    renderHub(); // the file's existing default-props helper
    const primary = screen.getByTestId("share-hub-primary");
    for (const cls of [
      "max-sm:flex-1", "max-sm:justify-center", "max-sm:whitespace-nowrap",
      "max-sm:min-w-0", "max-sm:overflow-hidden",
    ]) {
      expect(primary.className).toContain(cls);
    }
    const kebab = screen.getByTestId("share-hub-kebab");
    expect(kebab.className).toContain("max-sm:border");
    expect(kebab.className).toContain("max-sm:border-border");
    const root = primary.parentElement!;
    expect(root.className).toContain("max-sm:w-full");
  });

  it("labels unchanged in all lifecycles", () => {
    renderHub({ archived: false, published: true });
    expect(screen.getByTestId("share-hub-primary")).toHaveTextContent("Share link");
    cleanup();
    renderHub({ archived: false, published: false });
    expect(screen.getByTestId("share-hub-primary")).toHaveTextContent("Share link · paused");
    cleanup();
    renderHub({ archived: true });
    expect(screen.getByTestId("share-hub-primary")).toHaveTextContent("Show actions");
  });
});
```

- [ ] **Step 2: Run to verify failure** — target file; FAIL on `max-sm:flex-1`.

- [ ] **Step 3: Implement** in `ShareHub.tsx`:

- Root div (line ~368): className template appends `max-sm:w-full`.
- Primary trigger: append to BOTH ternary arms:
  `max-sm:flex-1 max-sm:justify-center max-sm:whitespace-nowrap max-sm:min-w-0 max-sm:overflow-hidden`.
- Kebab: append `max-sm:border max-sm:border-border` to its template literal.

- [ ] **Step 4: Run tests** — target file PASS; also run
`pnpm vitest run tests/components/admin/showpage/` (whole dir) — all green.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add components/admin/showpage/ShareHub.tsx tests/components/admin/showpage/shareHub.test.tsx
git commit --no-verify -m "feat(admin): ShareHub full-width mobile split row"
```

---

### Task 5: Skeleton stacked band

**Files:**
- Modify: `components/admin/showpage/ShowReviewModalSkeleton.tsx`
- Test: covered structurally by Task 6's parity run (the skeleton has no jsdom suite; the parity spec IS its test). Add no jsdom test.

**Interfaces:**
- Produces: existing single-row placeholder gains `max-sm:hidden`; a new mobile block mirrors §6.

- [ ] **Step 1: Implement** — in the `subHeader` slot, the existing placeholder row div gains `max-sm:hidden` appended to its className, and directly after it add:

```tsx
        {/* <sm stacked mirror (spec §6): same row/divider/gap structure as the
            loaded band; HEIGHTS are the contract, widths cosmetic. */}
        <div
          aria-hidden="true"
          className="hidden max-sm:flex w-full flex-wrap items-center gap-x-4 gap-y-2"
        >
          <div className="flex w-full justify-end">
            <Skeleton className="h-6 w-16 rounded-pill" />
          </div>
          <div className="flex min-h-tap-min w-full items-center justify-between">
            <div className="flex min-w-0 flex-col gap-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-7 w-12 rounded-pill" />
          </div>
          <div className="h-px w-full bg-border" />
          <div className="flex min-h-tap-min w-full items-center justify-between">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="h-8 w-16 rounded-sm" />
          </div>
          <div className="h-px w-full bg-border" />
          <div className="flex w-full items-center gap-2">
            <Skeleton className="h-11 flex-1 rounded-sm" />
            <Skeleton className="h-11 w-11 rounded-sm" />
          </div>
        </div>
```

- [ ] **Step 2: Typecheck + visual sanity**

```bash
pnpm exec tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/admin/showpage/ShowReviewModalSkeleton.tsx
git commit --no-verify -m "feat(admin): skeleton mirrors stacked mobile band rows"
```

---

### Task 6: Parity spec re-tighten (the RED→GREEN proof of the whole feature)

**Files:**
- Modify: `tests/e2e/skeletonBandParity.spec.ts`

**Interfaces:**
- Consumes: Tasks 1-5 shipped markup.

- [ ] **Step 1: Re-tighten FIRST, run to see the honest state** — replace the `if (mode === "popup") { … } else { … }` block (lines ~314-342) with the unconditional exact clause:

```ts
    test(`E: the subheader band heights match within ${BAND_TOL}px`, async ({ page }) => {
      const { skeleton, loaded } = await bandHeights(page);
      expect(skeleton, "skeleton band is non-vacuous").toBeGreaterThan(0);
      expect(
        Math.abs(skeleton - loaded),
        `skeleton band ${skeleton} vs loaded band ${loaded}`,
      ).toBeLessThanOrEqual(BAND_TOL);
    });
```

Also rewrite the file-header comment block describing clause E (lines ~29-38) and the long sheet-mode rationale comment (lines ~282-304) to cite
`docs/superpowers/specs/2026-07-24-strip-mobile-stacked-band.md` §6 (the wrap
finding is resolved; both viewports assert exact parity). Delete the
`TAP_ROW_PLUS_PADDING` constant with the weak clause.

- [ ] **Step 2: Run**

```bash
node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/skeletonBandParity.spec.ts
```

Expected: PASS at BOTH viewports (sheet E now exact). If sheet-mode E fails,
the delta between measured skeleton and loaded band identifies which row's
placeholder height is off — fix the Task 5 bar heights (`h-4`/`h-3`/`h-8`
etc.), never the tolerance (spec forbids widening).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/skeletonBandParity.spec.ts
git commit --no-verify -m "test(e2e): band parity exact at both viewports - weak sheet clause removed"
```

---

### Task 7: Browser layout spec @390 (layout-dimensions task — MANDATORY real-browser)

**Files:**
- Create: `tests/e2e/stackedBandLayout.spec.ts`
- Test config: runs via `tests/e2e/standalone.config.ts` (no webServer). Server boot = none (static harness over `node:http`); readiness gate = `document.fonts.ready` + one rAF (the parity spec's `open()` pattern); no sampler outlives its element (all `evaluate` calls on attached locators resolved immediately) — e2e harness-readiness checklist satisfied.

**Dimensional invariants under test (spec §4, verbatim):** rows own flex lines; R0 badge `h-6`; R1/R2/R3 heights in [44,48]; R2 sync-age clips, never wraps; R3 primary fills width single-line; band no horizontal overflow; badge right-flush ≤1px.

- [ ] **Step 1: Write the spec file** (reuses the parity harness output — same beforeAll build as `skeletonBandParity.spec.ts`, copied with the loaded-state page only):

```ts
/**
 * tests/e2e/stackedBandLayout.spec.ts
 * (spec docs/superpowers/specs/2026-07-24-strip-mobile-stacked-band.md §9.2/§9.4)
 *
 * Real-browser geometry for the stacked mobile band at 390x844. Reuses the
 * skeleton-parity harness page (both states) and measures the LOADED strip.
 * Worst-case strings are injected from the REAL producers (syncStatusBucket /
 * a long relative form), never hardcoded (anti-tautology).
 */
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";
import { syncStatusBucket } from "../../lib/admin/syncStatus";

const REPO_ROOT = resolve(__dirname, "..", "..");
const WORST_HEALTH = syncStatusBucket("shrink_held").label; // longest catalog label
const WORST_EDITED = "Edited 59 min ago";

let server: Server; let baseUrl: string;

test.beforeAll(async () => {
  const workDir = mkdtempSync(join(tmpdir(), "stacked-band-"));
  const jsonPath = join(workDir, "page.json");
  execFileSync(
    join(REPO_ROOT, "node_modules", ".bin", "tsx"),
    [join(REPO_ROOT, "tests", "e2e", "_skeletonParityHarness.tsx"), jsonPath],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000,
      env: { ...process.env, HASH_FOR_LOG_PEPPER: "test-harness-pepper-000000000000000000" } },
  );
  const parsed = JSON.parse(readFileSync(jsonPath, "utf8")) as { page: string };
  writeFileSync(join(workDir, "parity.html"),
    `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css"></head><body class="bg-bg">${parsed.page}</body></html>`);
  const entryCss = join(workDir, "entry.css");
  writeFileSync(entryCss,
    `@source "${join(workDir, "parity.html")}";\n` + readFileSync(join(REPO_ROOT, "app", "globals.css"), "utf8"));
  execFileSync("pnpm", ["dlx", "@tailwindcss/cli@4.2.4", "-i", entryCss, "-o", join(workDir, "out.css")],
    { cwd: REPO_ROOT, stdio: "pipe", timeout: 120_000 });
  server = createServer((req, res) => {
    const url = (req.url ?? "/").split("?")[0] ?? "/";
    const file = url === "/" || url === "" ? "parity.html" : url.replace(/^\//, "");
    try {
      res.setHeader("content-type", file.endsWith(".css") ? "text/css" : "text/html");
      res.end(readFileSync(join(workDir, file)));
    } catch { res.statusCode = 404; res.end("nf"); }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}/`;
});

test.afterAll(async () => { if (server) await new Promise<void>((r) => server.close(() => r())); });

const S = (name: string) => `[data-parity="loaded"] [data-testid="${name}"]`;

async function open390(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl);
  await expect(page.locator(S("show-status-strip"))).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  });
}

type Row = { name: string; top: number; bottom: number; height: number };

async function rowBands(page: Page): Promise<Row[]> {
  const names = [
    "strip-state-badge-row", "strip-publish-toggle", "strip-sync-age",
    "admin-resync-button", "share-hub-group",
  ];
  const rows: Row[] = [];
  for (const name of names) {
    const r = await page.locator(S(name)).evaluate((el) => el.getBoundingClientRect().toJSON() as DOMRect);
    rows.push({ name, top: r.top, bottom: r.bottom, height: r.height });
  }
  return rows;
}

async function setStatusText(page: Page, health: string, edited: string): Promise<void> {
  await page.evaluate(
    ([h, e, sSynced, sEdited]) => {
      const q = (sel: string) => document.querySelector(sel) as HTMLElement;
      q(sSynced).textContent = h!;
      const ed = document.querySelector(sEdited!) as HTMLElement | null;
      if (ed) ed.textContent = e!;
    },
    [health, edited, S("strip-synced-line"), S("strip-edited-age")],
  );
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
}

function membership(rows: Row[]): string[] {
  // Group by disjoint vertical bands: rows sharing any vertical overlap share a line.
  const sorted = [...rows].sort((a, b) => a.top - b.top);
  const lines: string[][] = [];
  for (const r of sorted) {
    const line = lines.find((l) =>
      l.some((n) => { const o = sorted.find((x) => x.name === n)!; return r.top < o.bottom && o.top < r.bottom; }));
    if (line) line.push(r.name); else lines.push([r.name]);
  }
  return lines.map((l) => l.sort().join("+"));
}

test("rows are disjoint bands in spec order, heights capped, no h-overflow, worst-case invariant", async ({ page }) => {
  await open390(page);
  await setStatusText(page, WORST_HEALTH, WORST_EDITED);
  const worst = await rowBands(page);
  const worstLines = membership(worst);
  expect(worstLines).toEqual([
    "strip-state-badge-row",
    "strip-publish-toggle",
    "admin-resync-button+strip-sync-age",
    "share-hub-group",
  ]);
  // Heights: R1/R2/R3 in [44,48]; badge row 24 +-1.
  const byName = Object.fromEntries(worst.map((r) => [r.name, r]));
  expect(byName["strip-state-badge-row"]!.height).toBeGreaterThanOrEqual(23);
  expect(byName["strip-state-badge-row"]!.height).toBeLessThanOrEqual(25);
  for (const n of ["strip-publish-toggle", "admin-resync-button", "share-hub-group"]) {
    expect(byName[n]!.height, n).toBeGreaterThanOrEqual(44);
    expect(byName[n]!.height, n).toBeLessThanOrEqual(48);
  }
  // No horizontal overflow anywhere in the band.
  const overflow = await page.locator(S("show-status-strip")).evaluate((el) => ({
    scrollW: el.scrollWidth, clientW: el.clientWidth,
  }));
  expect(overflow.scrollW).toBe(overflow.clientW);
  // Health label never clipped (spec §3 R2 priority): its own box fits fully.
  const health = await page.locator(S("strip-synced-line")).evaluate((el) => ({
    scrollW: el.scrollWidth, clientW: el.clientWidth,
  }));
  expect(health.scrollW).toBeLessThanOrEqual(health.clientW + 1);

  // Determinism: typical strings produce IDENTICAL membership and heights.
  await setStatusText(page, "Synced 1h ago", "Edited 1h ago");
  const typical = await rowBands(page);
  expect(membership(typical)).toEqual(worstLines);
  for (const r of typical) {
    expect(Math.abs(r.height - byName[r.name]!.height), r.name).toBeLessThanOrEqual(0.5);
  }
});

test("badge right-flush; single state signal per breakpoint; Sync accessible name", async ({ page }) => {
  await open390(page);
  const badge = await page.locator(S("strip-state-badge")).evaluate((el) => el.getBoundingClientRect().right);
  const band = await page.locator(`[data-parity="loaded"] [data-testid="published-show-review-subheader"]`)
    .evaluate((el) => {
      const cs = getComputedStyle(el);
      return el.getBoundingClientRect().right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
    });
  expect(Math.abs(badge - band)).toBeLessThanOrEqual(1);
  // Desktop live badge has no box at 390.
  await expect(page.locator(S("strip-live-badge"))).not.toBeVisible();
  // Accessible name at 390 is "Sync".
  await expect(
    page.locator(`[data-parity="loaded"]`).getByRole("button", { name: "Sync" }),
  ).toBeVisible();

  // At 1280: R0 has no box; desktop badge visible; name is "Re-sync".
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  await expect(page.locator(S("strip-state-badge"))).not.toBeVisible();
  await expect(page.locator(S("strip-live-badge"))).toBeVisible();
  await expect(
    page.locator(`[data-parity="loaded"]`).getByRole("button", { name: "Re-sync" }),
  ).toBeVisible();
});
```

- [ ] **Step 2: Run — RED first is expected only if Tasks 1-5 are incomplete; on a finished branch it must PASS:**

```bash
node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/stackedBandLayout.spec.ts
```

Expected: PASS. Failure diagnosis: membership mismatch → a row class is
missing (§3); height out of band → a cap class is missing (§4); overflow →
R2/R3 shrink contracts (§3).

- [ ] **Step 3: Wire testMatch/CI** — confirm `tests/e2e/standalone.config.ts` picks the file up by its glob (it matches `tests/e2e/*.spec.ts`; verify with `--list`), and add the file to whatever workflow path-filter runs `skeletonBandParity.spec.ts` (grep `.github/workflows` for `skeletonBandParity` and mirror its entry).

```bash
node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts --list | grep stackedBand
grep -rn "skeletonBandParity" .github/workflows/
```

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/stackedBandLayout.spec.ts .github/workflows/
git commit --no-verify -m "test(e2e): stacked-band 390px geometry - rows, caps, clip priority, names"
```

---

### Task 8: statusStripToggleLayout migration + scanners green

**Files:**
- Modify: `tests/e2e/statusStripToggleLayout.spec.ts`
- Modify (if needed): `tests/e2e/_statusStripToggleHarness.tsx`

- [ ] **Step 1: Migrate assertions** per spec §9.5:
  - Invariants (a) finalize-chip containment and (c) compact-chip geometry: change their viewport from `MOBILE` (390) to `{ width: 800, height: 800 }` (≥sm, where the chip still renders). Update their test titles to say `@>=sm`.
  - Add a 390px finalize assertion: render the finalize state, assert the chip is not visible and the sublabel is (`data-testid="published-toggle-sublabel"`), and the publish row's height ≤48:

```ts
test("finalize @390: sublabel in-flow, no chip, row stays one line", async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.goto(`${baseUrl}finalizeShort.html`); // the file's per-state page pattern (line 161)
  await expect(page.getByTestId("published-toggle-popover")).not.toBeVisible();
  await expect(page.getByTestId("published-toggle-sublabel")).toBeVisible();
  const row = await page
    .getByTestId("published-toggle-inline")
    .evaluate((el) => el.getBoundingClientRect().height);
  expect(row).toBeLessThanOrEqual(48);
});
```

  - Invariant (d) unchanged (hand-built ErrorExplainer probe stays).
  - Harness: if `finalizeShort` renders `variant="inline"`, switch the harness's strip renders to `variant="settings"` so they match production (the strip mount now passes settings — Task 2).

- [ ] **Step 2: jsdom POPOVER class-identity assertion** (spec §9.5.ii) — append to `tests/components/admin/PublishedToggle.test.tsx`:

```tsx
  it("settings refusal banner class string is identical to the inline banner's (probe identity)", async () => {
    const failing = async () => ({ ok: false as const, code: "PUBLISH_BLOCKED_PENDING_REVIEW" });
    renderInline({ published: true, setPublished: failing });
    fireEvent.click(screen.getByTestId("published-toggle"));
    const inlineCls = (await screen.findByTestId("published-toggle-popover")).className;
    cleanup();
    renderInline({ variant: "settings", published: true, setPublished: failing });
    fireEvent.click(screen.getByTestId("published-toggle"));
    const settingsCls = (await screen.findByTestId("published-toggle-popover")).className;
    expect(settingsCls).toBe(inlineCls);
  });
```

- [ ] **Step 3: Run the migrated spec + scanners**

```bash
node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/statusStripToggleLayout.spec.ts
pnpm vitest run tests/components/admin/showpage/statusStrip.test.tsx tests/components/admin/PublishedToggle.test.tsx
pnpm vitest run tests/help/
```

Expected: PASS. The §9 lexical scanner (inside statusStrip.test.tsx) must
still count the strip's conditional mounts correctly; the help scanners must
not flag the new "Sync" label (it is not a help-doc-declared label).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/statusStripToggleLayout.spec.ts tests/e2e/_statusStripToggleHarness.tsx tests/components/admin/PublishedToggle.test.tsx
git commit --no-verify -m "test: migrate chip assertions to >=sm; settings banner identity; 390 finalize sublabel"
```

---

### Task 9: Transition audit (spec §8 inventory — MANDATORY)

**Files:**
- Test: additions inside existing jsdom files (no new file).

The spec's §8 table declares every pair instant EXCEPT: switch knob
`transition-transform duration-fast` (existing, untouched) and the pending
spin `animate-spin motion-reduce:animate-none` (Task 3 tested). Audit steps:

- [ ] **Step 1: Grep the diff for animation surface** — confirm NO
`AnimatePresence`, no new `transition-*` classes, no new `animate-*` beyond
`animate-spin` in the diff:

```bash
git diff origin/main...HEAD -- 'components/**' | grep -nE "AnimatePresence|animate-|transition-" || echo CLEAN
```

Expected output: only the Task 3 `animate-spin motion-reduce:animate-none`
line. Anything else = re-check against §8 (instant is the contract).

- [ ] **Step 2: Compound-state jsdom check** — append to statusStrip.test.tsx:

```tsx
  it("compound: badge text swap does not remount R2/R3 (instant, no animation hooks)", () => {
    const { rerender } = renderStrip({ published: true, isLive: true });
    const syncBefore = screen.getByTestId("strip-sync-age");
    rerenderStrip(rerender, { published: false, isLive: false });
    expect(screen.getByTestId("strip-state-badge")).toHaveTextContent("Draft");
    expect(screen.getByTestId("strip-sync-age")).toBe(syncBefore);
  });
```

(If the file has no rerender helper, add `rerenderStrip(rerender, overrides)`
mirroring `renderStrip`'s prop assembly.)

- [ ] **Step 3: Run + commit**

```bash
pnpm vitest run tests/components/admin/showpage/statusStrip.test.tsx
git add tests/components/admin/showpage/statusStrip.test.tsx
git commit --no-verify -m "test(admin): transition-audit pins - instant band, stable R2 identity"
```

---

### Task 10: DESIGN.md delta + DEFERRED graduation

**Files:**
- Modify: `DESIGN.md`, `DEFERRED.md`, `DEFERRED-archive.md`

- [ ] **Step 1: DESIGN.md** (spec §7):
  - §1.1 accent-tint row (line ~48): append to the parenthetical usage note: "and the review-modal mobile state badge's Live pill (spec 2026-07-24-strip-mobile-stacked-band §3 R0)".
  - §1.3 status-pill scope (line ~89): add the mobile state badge to the allowed-pill sentence, noting Live uses `accent-on-bg` for text AND dot (pinned §1.2 pair).
- [ ] **Step 2: DEFERRED graduation** — move both entries (`STRIP-MOBILE-WRAP-1`, `STRIP-SKELETON-MOBILE-BAND-1`, DEFERRED.md:11-25) verbatim into `DEFERRED-archive.md` under a "Resolved 2026-07-24" heading with one added line each: "Resolved by spec 2026-07-24-strip-mobile-stacked-band (stacked mobile band; parity re-tightened)." Update DEFERRED.md's "Last reconciled" line to 2026-07-24.
- [ ] **Step 3: Commit**

```bash
git add DESIGN.md DEFERRED.md DEFERRED-archive.md
git commit --no-verify -m "docs: DESIGN accent-tint/badge scope; graduate strip-mobile deferrals"
```

---

### Task 11: Impeccable dual-gate (invariant 8 — UI diff)

- [ ] **Step 1:** Run `/impeccable critique` on the diff (canonical v3 setup: context.mjs load → register read), then `/impeccable audit`.
- [ ] **Step 2:** Fix P0/P1 findings or defer via DEFERRED.md entries; record findings + dispositions for the PR body (§12-of-handoff convention).
- [ ] **Step 3:** Commit any fixes: `fix(admin): impeccable <finding>` per finding.

---

### Task 12: Full local gates

- [ ] **Step 1: Full suite + static gates** (pre-push memories: full suite, typecheck, eslint, format):

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm format:check
node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/skeletonBandParity.spec.ts tests/e2e/stackedBandLayout.spec.ts tests/e2e/statusStripToggleLayout.spec.ts
```

Expected: all green. Fix anything red before proceeding (never skip; scoped
runs miss registry suites — run the FULL `pnpm test`).

- [ ] **Step 2: Commit any residue** (formatting etc.).

---

### Task 13: Adversarial review (cross-model) — whole-diff

- [ ] **Step 1:** Dispatch split tight-scope Codex reviews via codex-guard (components diff; tests diff) with fresh-eyes posture, REVIEWER ONLY rule, §1.1 do-not-relitigate list, verdict marker. Iterate repair rounds to APPROVE (class-sweep every finding before patching).
- [ ] **Step 2:** Record refuted diff-only claims in the PR body triage section.

---

### Task 14: Ship

- [ ] **Step 1:** Push branch; open PR (body: spec/plan links, impeccable dispositions, review triage; end with the Claude Code footer).
- [ ] **Step 2:** Real CI green (watch `gh pr checks --watch` with PR number).
- [ ] **Step 3:** `gh pr merge --merge`; fast-forward main checkout (`git pull --ff-only` in `/Users/ericweiss/FX-Webpage-Template`); verify `git rev-list --left-right --count main...origin/main` = `0  0`.
- [ ] **Step 4:** Stage 4.4: `CronDelete` job `036572cc`; set ship-state `stage: "done"`; archive mock artifact note; final report.

---

## Self-review (run before Task 13 dispatch)

1. Spec coverage: §3 R0-R3 → T1-T4; §6 → T5; §9.1 → T6; §9.2/§9.4 → T7; §9.3 → T1/T9; §9.5 → T8; §9.6 → T11; §7 → T10; §12 → T10/T14.
2. Placeholder scan: none (all code inline).
3. Type consistency: `stateBadge` private to T1; testids consistent across T1/T7 (`strip-state-badge`, `strip-state-badge-row`, `strip-divider-1/2`, `admin-resync-mobile-label`, `published-toggle-sublabel`).
