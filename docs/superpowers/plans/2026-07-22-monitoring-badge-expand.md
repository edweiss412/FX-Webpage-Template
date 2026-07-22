# Monitoring Badge Expand — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the monitoring-only attention pill an interactive button opening the attention menu, and enumerate monitoring items as per-row title+note entries, per the approved spec `docs/superpowers/specs/2026-07-22-monitoring-badge-expand.md` (Status: Approved, Codex R13).

**Architecture:** Two component edits (`PublishedReviewModal.tsx` pill gate/palette; `AttentionMenu.tsx` monitoring rows) plus test fan-out across five jsdom suites, one e2e spec, the dev gallery registry, and the pageTransitions enumeration. The spec's §5 is the authoritative test contract; every task below names its spec item.

**Tech Stack:** Next.js 16 / React, Tailwind v4, Vitest + RTL (jsdom), Playwright standalone e2e harness (`_step3ReviewModalBundle.mjs` bundling, `window.__setItems` driving).

## Global Constraints

- TDD per task: failing test → minimal implementation → green → commit (`AGENTS.md` invariant 1). Commit per task, conventional commits (invariant 6).
- No raw error codes in UI (invariant 5); notes come ONLY from `autoResolveNote()` (`lib/adminAlerts/audience.ts:135-140`).
- No em dashes in user-visible copy; sr-only prefix is exactly `"monitoring, "`.
- Invariant 8 (impeccable dual-gate) applies — `components/` surface (Task 8).
- Invariants 2/3/4/9/10: N/A — no DB, no Supabase calls, no mutation surfaces, no advisory locks (declared; meta-test inventory below).
- Anti-tautology: expected note/title text derived by calling `autoResolveNote(code)` / fixture `menuTitle`, never hardcoded.

**Meta-test inventory:** EXTENDS `tests/components/admin/showpage/pageTransitions.test.tsx` (animation-site enumeration + new treatment tripwires + source-scan companion) and `tests/dev/attentionScenariosTier2.test.ts` (exact-set registry). No advisory-lock surface. No new registries created.

**Verified API shapes (pre-draft pass):** `renderPublishedModal(rawRows, {attentionItems, alertsDegraded})` / `publishedModalElement(...)` (`tests/components/admin/showpage/__fixtures__/publishedModalHarness.tsx:141-150`); e2e `window.__setItems(a, n, s, degraded)` (`tests/e2e/_pillFocusLiveEntry.tsx:82-90`); tier2 `scenario(id, label, {alerts, holds})` + `pickByDerivedClass(kind, exclude)` (`lib/dev/attentionScenarios/tier2.ts:315-330`, `:109-125`); `ATTENTION_FALLBACK_TITLE` (`lib/admin/attentionItems.ts:92`); item builders `mk(...)`/`items(a,n,s)` in the existing test files.

---

### Task 1: AttentionMenu — enumerate monitoring rows

**Files:**
- Modify: `components/admin/showpage/AttentionMenu.tsx` (replace `:218-238` summary block; accName `:110`; group separator/rounding)
- Test: `tests/components/admin/showpage/attentionMenuGroups.test.tsx`, `tests/components/admin/showpage/attentionMenu.test.tsx`

**Interfaces:**
- Consumes: `autoResolveNote(code)` from `@/lib/adminAlerts/audience`; `AttentionItem.menuTitle`, `.clearingKind`, `.alert.code`.
- Produces: monitoring row testid `attention-monitoring-row-${item.id}`; group container testid `attention-monitoring-group` (new — needed by Tasks 4/5/7 for scoped assertions).

- [ ] **Step 1: Write failing tests** (spec §5 items 3, 4 + fallback/visual/inertness/sr-prefix pins). In `attentionMenuGroups.test.tsx`: REPLACE the `:164-174` summary test and `:185-204` scroll anchor; ADD new pins. Test bodies (representative; all use the file's existing `mk` item builder):

```tsx
import { autoResolveNote } from "@/lib/adminAlerts/audience";
import { ATTENTION_FALLBACK_TITLE } from "@/lib/admin/attentionItems";

it("enumerates one read-only row per self-heal item: title + note, derivation order (spec §3.2)", () => {
  renderMenu({ items: [
    mk({ id: "alert:s1", actionable: false, clearingKind: "self_heal", code: "WATCH_CHANNEL_ORPHANED", menuTitle: "Live updates need attention" }),
    mk({ id: "alert:s2", actionable: false, clearingKind: "self_heal", code: "SYNC_STALLED", menuTitle: "Syncing has stalled" }),
  ]});
  const group = screen.getByTestId("attention-monitoring-group");
  expect(within(group).getByText("Monitoring")).toBeInTheDocument();
  const rows = within(group).getAllByTestId(/attention-monitoring-row-/);
  expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual([
    "attention-monitoring-row-alert:s1", "attention-monitoring-row-alert:s2",
  ]);
  expect(within(rows[0]!).getByText("Live updates need attention")).toBeInTheDocument();
  expect(within(rows[0]!).getByText(autoResolveNote("WATCH_CHANNEL_ORPHANED"))).toBeInTheDocument();
  expect(within(rows[1]!).getByText(autoResolveNote("SYNC_STALLED"))).toBeInTheDocument();
  // summary copy retired from the menu
  expect(within(group).queryByText(/clearing on their own, no action needed/)).toBeNull();
});

it("rows are inert: structural + behavioral (spec §5.3 inertness pins)", () => {
  const onNavigate = vi.fn(); const onClose = vi.fn();
  renderMenu({ items: [selfHealItem("s1")], onNavigate, onClose });
  const row = screen.getByTestId("attention-monitoring-row-alert:s1");
  expect(row.tagName).toBe("DIV");
  expect(row.hasAttribute("tabindex")).toBe(false);
  expect(row.hasAttribute("role")).toBe(false);
  expect([row, ...row.querySelectorAll("*")].filter((el) => (el as HTMLElement).tabIndex >= 0)).toHaveLength(0);
  expect(row.querySelectorAll("button, a")).toHaveLength(0);
  fireEvent.click(row);
  fireEvent.keyDown(row, { key: "Enter" });
  fireEvent.keyDown(row, { key: " " });
  expect(onNavigate).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByTestId("published-show-review-attention-menu")).toBeInTheDocument();
});

it("row visuals: hollow dot, truncate title, separate note line (spec §5.3 visual pins)", () => {
  renderMenu({ items: [selfHealItem("s1")] });
  const row = screen.getByTestId("attention-monitoring-row-alert:s1");
  const dots = [...row.querySelectorAll('[class*="border-status-positive"]')];
  expect(dots).toHaveLength(1);
  expect(dots[0]!.className).toContain("bg-transparent");
  expect(row.querySelector('[class*="bg-status-review"], [class*="bg-status-degraded"]')).toBeNull();
  const title = within(row).getByText(selfHealItem("s1").menuTitle);
  expect(title.className).toContain("truncate");
  const note = within(row).getByText(autoResolveNote("WATCH_CHANNEL_ORPHANED"));
  expect(title.contains(note)).toBe(false);
});

it("sr-only prefix: first sr-only node in each row is exactly 'monitoring, ' (spec §5.3)", () => {
  renderMenu({ items: [selfHealItem("s1")] });
  const row = screen.getByTestId("attention-monitoring-row-alert:s1");
  const srs = [...row.querySelectorAll(".sr-only")];
  expect(srs[0]!.textContent).toBe("monitoring, ");
});

it("fallbacks: no-note code renders generic line; uncataloged code renders fallback title; raw code never in textContent (spec §3.5)", () => {
  renderMenu({ items: [
    mk({ id: "alert:f1", actionable: false, clearingKind: "self_heal", code: "DRIVE_FETCH_FAILED", menuTitle: "Drive fetch failed" }),
    mk({ id: "alert:f2", actionable: false, clearingKind: "self_heal", code: "TOTALLY_UNKNOWN_CODE", menuTitle: ATTENTION_FALLBACK_TITLE }),
  ]});
  const r1 = screen.getByTestId("attention-monitoring-row-alert:f1");
  expect(within(r1).getByText(autoResolveNote("DRIVE_FETCH_FAILED"))).toBeInTheDocument();
  expect(r1.textContent).not.toContain("DRIVE_FETCH_FAILED");
  const r2 = screen.getByTestId("attention-monitoring-row-alert:f2");
  expect(within(r2).getByText(ATTENTION_FALLBACK_TITLE)).toBeInTheDocument();
  expect(r2.textContent).not.toContain("TOTALLY_UNKNOWN_CODE");
});

it("defensive non-alert self-heal item renders menuTitle + generic note (spec §5.3 (c))", () => {
  // Synthetic — the derivation layer cannot produce this (attentionItems.ts:262-266)
  renderMenu({ items: [mkHold({ id: "hold:x", actionable: false, clearingKind: "self_heal", menuTitle: "Synthetic hold" })] });
  const row = screen.getByTestId("attention-monitoring-row-hold:x");
  expect(within(row).getByText("Synthetic hold")).toBeInTheDocument();
  expect(within(row).getByText(autoResolveNote("__none__"))).toBeInTheDocument(); // generic line
});

it("accessible name falls back to 'Monitoring' when only self-heal items exist (spec §3.2)", () => {
  renderMenu({ items: [selfHealItem("s1")] });
  expect(screen.getByTestId("published-show-review-attention-menu")).toHaveAttribute("aria-label", "Monitoring");
});

it("leading Monitoring group: no border-t, rounded-t-md header; with preceding group: border-t, no rounding (spec §5 item 4)", () => {
  renderMenu({ items: [selfHealItem("s1")] });
  const groupAlone = screen.getByTestId("attention-monitoring-group");
  expect(groupAlone.className ?? "").not.toContain("border-t");
  expect(groupAlone.querySelector('[class*="rounded-t-md"]')).not.toBeNull();
  cleanup();
  renderMenu({ items: [HOLD, selfHealItem("s1")] });
  const groupAfter = screen.getByTestId("attention-monitoring-group");
  expect(groupAfter.className).toContain("border-t");
  expect(groupAfter.querySelector('[class*="rounded-t-md"]')).toBeNull();
});
```

Also flip: the scroll-boundary test (`:185-204`) re-anchors on `attention-monitoring-row-*`; `attentionMenu.test.tsx:116-130` second half flips from summary text to a monitoring-row assertion. Helper `selfHealItem(id)` wraps `mk` with `code: "WATCH_CHANNEL_ORPHANED"`; `mkHold` builds a `kind: "hold"` item (mirror the file's existing hold fixture).

- [ ] **Step 2: Run to verify failures**: `pnpm vitest run tests/components/admin/showpage/attentionMenuGroups.test.tsx tests/components/admin/showpage/attentionMenu.test.tsx` — new tests FAIL (no `attention-monitoring-group` testid), flipped tests FAIL (summary still rendered).

- [ ] **Step 3: Implement.** In `AttentionMenu.tsx`: import `autoResolveNote`; replace the summary block (`:218-238`) with:

```tsx
{selfHealCount > 0 ? (
  /* Monitoring group (monitoring-badge-expand spec §3.2): one read-only row
     per item — title + auto-resolve note. No interactive descendants. */
  <div
    data-testid="attention-monitoring-group"
    className={hasActionable || needsLook.length > 0 ? "border-t border-border" : undefined}
  >
    <div
      className={`bg-surface-sunken px-4 pt-2.5 pb-1.5 ${hasActionable || needsLook.length > 0 ? "" : "rounded-t-md"}`}
    >
      <span className="text-xs font-semibold uppercase tracking-eyebrow text-text-subtle">
        Monitoring
      </span>
    </div>
    {selfHeal.map((item) => (
      <div
        key={item.id}
        data-testid={`attention-monitoring-row-${item.id}`}
        className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0"
      >
        <span
          aria-hidden="true"
          className="mt-1.5 size-2 shrink-0 rounded-pill border-[1.5px] border-status-positive bg-transparent"
        />
        <span className="sr-only">monitoring, </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-text-strong">
            {item.menuTitle}
          </span>
          <span className="block text-xs/relaxed text-text-subtle">
            {autoResolveNote(item.kind === "alert" ? item.alert.code : "__none__")}
          </span>
        </span>
      </div>
    ))}
  </div>
) : null}
```

with `const selfHeal = items.filter((i) => !i.actionable && i.clearingKind === "self_heal");` replacing the `selfHealCount` count-only derivation (keep `selfHealCount = selfHeal.length` if referenced), and accName: `aria-label={hasActionable ? "Needs your confirmation" : needsLook.length > 0 ? "Needs a look" : "Monitoring"}`.

- [ ] **Step 4: Green**: same vitest command — PASS. Check `$?` not just the Tests line (uncaught-error exit-1 trap).
- [ ] **Step 5: Commit** `feat(admin): enumerate monitoring items as read-only rows in attention menu`

### Task 2: Pill — widen gate, quiet palette, separator

**Files:**
- Modify: `components/admin/showpage/PublishedReviewModal.tsx` (`:319` gate; `:726-821` button; delete `:831-856` span; middot `:776-801`)
- Test: `tests/components/admin/showpage/publishedPill.test.tsx`, `tests/components/admin/showpage/clearingPillLabel.test.tsx`, `tests/components/admin/showpage/publishedReviewModal.test.tsx`

**Interfaces:**
- Consumes: existing `actionable`/`needsLook`/`selfHeal` derivations.
- Produces: `monitoringOnly` boolean (`actionable.length === 0 && needsLook.length === 0 && selfHeal.length > 0`) reused by Task 3.

- [ ] **Step 1: Failing tests** (spec §5 items 1, 2, 9a/9b/9c):
  - Flip `publishedPill.test.tsx:75` row: `[0, 0, 1, "1 monitoring", true]`.
  - Quiet palette (both directions structural):

```tsx
it("(0,0,2) monitoring-only pill is a quiet button: opens menu, no warning classes, positive subtle pins", () => {
  renderPill(0, 0, 2);
  const pill = screen.getByTestId("published-show-review-alert-pill");
  expect(pill.tagName).toBe("BUTTON");
  expect(pill).toHaveAttribute("aria-expanded", "false");
  expect(pill.className).toContain("bg-surface-sunken");
  expect(pill.className).toContain("text-text-subtle");
  expect(pill.className).toContain("hover:bg-surface-sunken/80");
  expect([pill, ...pill.querySelectorAll("*")].filter((el) => /warning/.test((el as HTMLElement).className))).toHaveLength(0);
  expect(visibleText(pill)).toBe("2 monitoring"); // no leading middot
  fireEvent.click(pill);
  expect(pill).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByTestId("published-show-review-attention-menu")).toBeInTheDocument();
});
```

  - `clearingPillLabel.test.tsx`: element now BUTTON; add `expect(pill).toHaveAccessibleName(\`${n} monitoring clearing on their own, no action needed\`)` with `n` from the fixture count; keep visible-terse + `title` pins; update comments.
  - Doctrine pins (spec §5 item 9): (a) in `publishedReviewModal.test.tsx` — `(1,0,1)` open menu, click the resolve control on the last actionable item, menu closes despite monitoring remaining; (b) `alertId` = the monitoring item's own id with `(0,0,1)` → menu does NOT auto-open; (c) quiet pill class list contains `before:-inset-y-3`.
  - Amber positive pins on composite rows stay green (`:69-74` are the positive middot pins).

- [ ] **Step 2: Verify failures**: `pnpm vitest run tests/components/admin/showpage/publishedPill.test.tsx tests/components/admin/showpage/clearingPillLabel.test.tsx tests/components/admin/showpage/publishedReviewModal.test.tsx` — `(0,0,1)` row and new tests FAIL (span today).

- [ ] **Step 3: Implement.** In `PublishedReviewModal.tsx`:

```tsx
const monitoringOnly = actionable.length === 0 && needsLook.length === 0 && selfHeal.length > 0;
const interactive = actionable.length > 0 || needsLook.length > 0 || selfHeal.length > 0;
```

Button className becomes a ternary (same structural classes; palette tokens swap):

```tsx
className={`relative inline-flex shrink-0 items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors duration-fast before:absolute before:inset-x-0 before:-inset-y-3 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
  monitoringOnly
    ? "bg-surface-sunken text-text-subtle hover:bg-surface-sunken/80"
    : "bg-warning-bg text-warning-text hover:bg-warning-bg/80"
}`}
```

Leading dot: `monitoringOnly` renders the hollow positive dot in place of the solid review dot. Monitoring segment: middot renders only when `actionable.length > 0 || needsLook.length > 0`; segment span + chevron tone classes become `monitoringOnly ? "text-text-subtle" : ...existing warning classes`. Add `title` attribute + trailing sr-only exact-count/`title` parity when `monitoringOnly` (copy the span branch's contract verbatim), then DELETE the `:831-856` span branch (degraded branch `:822-830` untouched).

- [ ] **Step 4: Green** (same command, `$?`).
- [ ] **Step 5: Commit** `feat(admin): monitoring-only attention pill becomes interactive quiet button`

### Task 3: Reconciliation — stays-open matrices, rescue effect

**Files:**
- Modify: `components/admin/showpage/PublishedReviewModal.tsx` (`:353-366` rescue effect)
- Test: `tests/components/admin/showpage/pillFocusReconcile.test.tsx`

**Interfaces:** Consumes `monitoringOnly` from Task 2; the harness `publishedModalElement`/`rerender` LIVE-transition idiom already in the file.

- [ ] **Step 1: Failing tests** (spec §3.3, §5 item 5): (a) close matrix → 4 ENTRY (`[1,0]`,`[0,1]`,`[1,1]` selfHeal=1 boot + `[0,0]` selfHeal=1) × 2 EXIT (C degraded, D in-sync) = 8 cells, count pin `expect(cells.length).toBe(8)`; (b) SIX-origin stays-open forward matrix (`[1,0]`,`[0,1]`,`[1,1]` × selfHeal∈{0,1} → `(0,0,1)`) asserting menu open, monitoring rows visible (INSERTION for selfHeal=0), `aria-expanded="true"`, settled focus ≠ body, quiet root palette + zero warning classes; the `[0,1]` origins pre-focus the needs-look `<a>`, `[1,1]` origins the actionable row; (c) REVERSE matrix (`(0,0,1)` open → `[1,0]`,`[0,1]`,`[1,1]` × selfHeal∈{0,1}, 6 cells) asserting stays-open, group insert/remove, amber positive pins (`bg-warning-bg` + `text-warning-text` + `hover:bg-warning-bg/80`, sunken absent); (d) rescue trio (b2): `(1,1,0)`→`(0,1,0)` focused actionable row; `(1,1,0)`→`(1,0,0)` focused needs-look link; `(2,0,0)`→`(1,0,0)` focused removed row, sibling remains — settled focus ≠ body, menu open; (e) monitoring-only entry click-opens; (f) jsdom node-identity: capture `getByTestId` pill reference before `rerender`, `expect(after).toBe(before)` across forward + reverse flips. Use the file's existing `items(a,n,s)` + `renderPublishedModal`/`publishedModalElement` rerender pattern (`:70-105`).

- [ ] **Step 2: Verify failures** — stays-open cells FAIL today (menu force-closes; `(0,0,*)` non-interactive), 8-count pin FAILS (9 today).

- [ ] **Step 3: Implement** rescue-effect extension (dep-less effect body, after the existing close-path rescue):

```tsx
if (menuEffectivelyOpen && document.activeElement === document.body) {
  // A focused row/link unmounted while the menu stayed open (spec §3.3):
  // refocus the pill trigger — probe-ratified settled-state contract.
  pillRef.current?.focus();
}
```

(The gate widening from Task 2 already yields stays-open; this closes the focus hole. The close-path rescue and rebound guard are untouched.)

- [ ] **Step 4: Green**: `pnpm vitest run tests/components/admin/showpage/pillFocusReconcile.test.tsx`.
- [ ] **Step 5: Commit** `feat(admin): menu stays open across monitoring transitions; removed-row focus rescue`

### Task 4: pageTransitions — sites, tripwires, source scan

**Files:**
- Test/Modify: `tests/components/admin/showpage/pageTransitions.test.tsx` (`:129-141` enumeration)

- [ ] **Step 1: Failing tests** (spec §5 item 7): update the site enumeration (summary row → monitoring rows/group); add jsdom tripwires in both palettes: root class list contains `transition-colors` + `duration-fast`; segment span/dots/middots/rows/group — no class containing `transition` or `animate`, empty inline `style.transition`/`transitionProperty`/`transitionDuration`/`animation`; chevron classes containing `transition` are exactly `["transition-transform"]`; no `opacity-0`/`scale-` entrance classes on group/rows at first render. Source-scan companion (file's existing pattern): the monitoring block of `AttentionMenu.tsx` (slice between the `attention-monitoring-group` testid literal and the component end) contains no `AnimatePresence`, `motion.`, `requestAnimationFrame`.
- [ ] **Step 2: Verify failures** (site list stale after Task 1).
- [ ] **Step 3: Implement** — usually test-only; if a tripwire catches a leaked class from Tasks 1-2, fix the component.
- [ ] **Step 4: Green**: `pnpm vitest run tests/components/admin/showpage/pageTransitions.test.tsx`.
- [ ] **Step 5: Commit** `test(admin): transition-treatment tripwires + monitoring-row animation sites`

### Task 5: fullSplitComposite flips

**Files:**
- Test: `tests/dev/fullSplitCompositeRender.test.tsx` (`:58-121`), `tests/dev/fullSplitComposite.test.ts`

- [ ] **Step 1: Failing tests**: RENDERED pin flips from "Monitoring summary `2 clearing on their own…`" to: exactly 2 `attention-monitoring-row-*` rows inside `attention-monitoring-group`, titles = the scenario's SELF-code catalog titles (derive via the scenario object, not literals), notes via `autoResolveNote(code)`. Reconcile any summary-copy pin in the derive-layer test (counts-only pins stay).
- [ ] **Step 2: Verify failures.** — `pnpm vitest run tests/dev/fullSplitCompositeRender.test.tsx tests/dev/fullSplitComposite.test.ts`
- [ ] **Step 3: Implement** — test-only (component done in Task 1).
- [ ] **Step 4: Green.**
- [ ] **Step 5: Commit** `test(dev): composite gallery pins enumerate monitoring rows`

### Task 6: tier2 gallery scenario + registry

**Files:**
- Modify: `lib/dev/attentionScenarios/tier2.ts` (`T2_MONITORING_ONLY` const + `T2_REQUIRED_IDS:38-58` + scenario entry, class-mix template `:321-330`)
- Test: `tests/dev/attentionScenariosTier2.test.ts`

- [ ] **Step 1: Failing test**: behavioral pin — the `t2-monitoring-only` scenario derives `actionable=0, needsLook=0, selfHeal>0` via `deriveScenarioAttention`; exact-set assertion (`:114`) fails until the ID registers.
- [ ] **Step 2: Verify failures.**
- [ ] **Step 3: Implement**:

```ts
export const T2_MONITORING_ONLY = "t2-monitoring-only";
// in T2_REQUIRED_IDS: T2_MONITORING_ONLY,
// scenario list:
scenario(T2_MONITORING_ONLY, "Monitoring only: expandable quiet pill", {
  alerts: (() => {
    const a = pickByDerivedClass("self_heal");
    const b = pickByDerivedClass("self_heal", new Set([a]));
    return [alert(a), alert(b)];
  })(),
  holds: [],
}),
```

- [ ] **Step 4: Green**: `pnpm vitest run tests/dev/attentionScenariosTier2.test.ts`.
- [ ] **Step 5: Commit** `feat(admin): tier-2 monitoring-only gallery scenario`

### Task 7: e2e — matrices, probes, computed-style treatments

**Files:**
- Modify: `tests/e2e/attention-pill-focus.spec.ts` (`:131-141` matrix + new cells)

- [ ] **Step 1: Write cells** (spec §5 item 6; boot/`__setItems` shapes verified): 8-cell close matrix (ENTRY + `[0,0]` w/ selfHeal boot; count pin 8); probes (a) `(1,0,1)` focus row button → `__setItems(0,0,1,false)`: menu mounted, `aria-expanded="true"`, settled `document.activeElement` = pill; (b) `(0,1,1)` focus needs-look link → same asserts; (c) insertion `(1,0,0)`→`(0,0,1)`: stays open, monitoring rows appear, quiet root (computed `background-color` equals the sunken token's resolved rgb — compare against a probe element styled `bg-surface-sunken`); (d) reverse `(0,0,1)`→`(1,0,0)`: stays open, group swap, amber root (same computed-probe technique vs `bg-warning-bg`); node-identity in (c)+(d): `page.evaluate` stamps `el.__pin = true` pre-flip, asserts post-flip testid element still has it + `isConnected`. Computed-style treatment probe: for segment span/dots/middots/group/rows — `transition-property === "none" || transition-duration === "0s"`, `animation-name === "none"`; chevron transition-property list ⊆ `transform`; root property list covers `background-color`+`color` with duration > 0s, in BOTH palettes.
- [ ] **Step 2: Run**: `node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/attention-pill-focus.spec.ts` (env sourced; no sibling servers on the port; kill only ps-verified PIDs). Expected: PASS (implementation landed in Tasks 1-3). If any cell fails, fix the component, not the assert.
- [ ] **Step 3: Commit** `test(e2e): monitoring stays-open probes, computed-style treatment pins, node identity`

### Task 8: Gates + docs

- [ ] **Step 1**: `/impeccable critique` + `/impeccable audit` on the diff (invariant 8; P0/P1 fixed or DEFERRED.md).
- [ ] **Step 2**: Full local gates: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build` (memory: vitest strips types; scoped suites miss registry suites — full run).
- [ ] **Step 3**: Amendment notes: add a one-line "superseded by 2026-07-22-monitoring-badge-expand §…" marker to the two amended specs' affected sections (split spec §3.2/§3.4; curated-composite monitoring rows). NEVER prettier the master spec.
- [ ] **Step 4**: Commit `docs(plan): amendment markers + gate dispositions`

## Self-Review

- Spec coverage: §3.1→T2, §3.2→T1, §3.3→T3+T7, §3.4→T4+T7, §3.5→T1, §5 items 1-2→T2, 3-4→T1, 5→T3, 6→T7, 7→T4, 8→T6, 9→T2, 10→T8. Amends ledger→T8. ✓
- No placeholders; types/names cross-checked (`monitoringOnly`, testids consistent across T1/T4/T5/T7). ✓
- Transition-audit + anti-tautology + layout-dimensions: no fixed-dimension parent introduced (spec §7: none); transition treatment carried by T4+T7. ✓
