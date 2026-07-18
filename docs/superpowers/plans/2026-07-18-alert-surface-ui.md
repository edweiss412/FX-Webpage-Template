# Alert-Surface UI Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Restructure the BellPanel alert row + its copy-render path so message/Learn-more/multi-change list are real siblings below a title-only mark-read target, timestamp is right-flush, identity names bold, multi-change renders a real `<ul>`, the chevron carries a one-time dismissible hint, and PerShow links match BellPanel tap-target vocabulary.

**Architecture:** Render-only UI. Bottom-up: pure lib helpers first (renderCatalogEmphasis identity-bold, deriveMessageParams roleChangeLines/tail-drop), then BellPanel restructure consuming them, then the chevron-hint client hook, then PerShow parity, then real-browser layout + transition audit. No DB / RPC / advisory-lock / mutation surface.

**Tech Stack:** Next.js 16, React, TypeScript, Vitest (jsdom unit), Playwright (real-browser layout), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-07-18-alert-surface-ui.md` (Codex-APPROVED, 7 rounds).

## Global Constraints

- TDD per task: failing test → run-red → minimal impl → run-green → commit. Never impl before its test.
- Commit per task, conventional-commits (`feat(admin):` / `test(admin):` / `feat(crew-page):` as scope fits). One task per commit, `--no-verify`.
- No raw error codes in UI (invariant 5) — copy flows through `lib/messages/lookup`/catalog; this pass moves DOM, not copy source.
- DESIGN.md §9: no `—` (U+2014), no `--` in rendered copy.
- Tailwind v4 does NOT default `.flex` to `align-items: stretch` — real-browser (Playwright) for every dimensional invariant; jsdom insufficient.
- UI work is Opus-only; invariant-8 impeccable critique+audit dual-gate on the UI diff before cross-model review, P0/P1 fixed-or-DEFERRED.
- No new mutation surface (invariant 10 N/A — the hint dismiss is a client `localStorage` write; `onMarkRead` unchanged).

## Meta-test inventory (declared)

- **EXTENDS** `tests/messages/_metaEmphasisRenderContract.test.ts` — identity-bold contract.
- **NEW** structural subset guard in `tests/adminAlerts/deriveMessageParams.test.ts` — `BELL_BOLD_IDENTITY_TOKENS ⊆ IDENTITY_PARAM_TOKENS`, `role-changes ∉`.
- Advisory-lock / admin-alert-catalog / PostgREST-DML / mutation-observability meta-tests: **N/A** (no such surface touched).

## Advisory-lock topology

**N/A** — plan touches no `pg_advisory*` path.

---

## Task 1: renderCatalogEmphasis identity-bold param-aware pass

**Files:**
- Modify: `components/messages/renderEmphasis.tsx`
- Modify: `lib/adminAlerts/deriveMessageParams.ts` (add `BELL_BOLD_IDENTITY_TOKENS` export)
- Test: `tests/components/renderEmphasis.test.tsx`, `tests/messages/_metaEmphasisRenderContract.test.ts`, `tests/adminAlerts/deriveMessageParams.test.ts`

**Interfaces:**
- Produces: `renderCatalogEmphasis(template: string, params?: MessageParams, identityKeys?: ReadonlySet<string>): ReactNode[]` — new 3rd arg; when present, placeholders whose (hyphen/underscore-normalized) key ∈ `identityKeys` render as `<strong className="font-semibold text-text-strong">{value}</strong>`, others plain.
- Produces: `export const BELL_BOLD_IDENTITY_TOKENS: ReadonlySet<string> = new Set(["show-name","sheet-name","crew-name"])` in `deriveMessageParams.ts`.

- [ ] **Step 1: Write failing tests**

In `tests/components/renderEmphasis.test.tsx` add:
```tsx
import { render } from "@testing-library/react";
import { renderCatalogEmphasis } from "@/components/messages/renderEmphasis";

const IK = new Set(["show-name"]);

it("bolds an identity-key param, leaves non-identity plain", () => {
  const { container } = render(
    <>{renderCatalogEmphasis("In <show-name>, <crew-count> changed", { "show-name": "'East Coast'", "crew-count": "3" }, IK)}</>,
  );
  const strong = container.querySelector("strong");
  expect(strong).not.toBeNull();
  expect(strong!.textContent).toBe("'East Coast'");
  // non-identity param is a plain text node, NOT inside <strong>
  expect(container.textContent).toContain("3 changed");
  expect(container.querySelectorAll("strong")).toHaveLength(1);
});

it("omitting identityKeys keeps all params plain (back-compat)", () => {
  const { container } = render(
    <>{renderCatalogEmphasis("In <show-name>", { "show-name": "'East Coast'" })}</>,
  );
  expect(container.querySelector("strong")).toBeNull();
});

it("does not emit an empty <strong> for an empty identity value", () => {
  const { container } = render(
    <>{renderCatalogEmphasis("In <show-name>.", { "show-name": "" }, IK)}</>,
  );
  expect(container.querySelector("strong")).toBeNull();
});

it("composes template *em* with identity bold", () => {
  const { container } = render(
    <>{renderCatalogEmphasis("*<show-name>*", { "show-name": "'X'" }, IK)}</>,
  );
  // both <em> and <strong> present around the name
  expect(container.querySelector("em")).not.toBeNull();
  expect(container.querySelector("strong")).not.toBeNull();
});
```

In `tests/adminAlerts/deriveMessageParams.test.ts` add:
```ts
import { BELL_BOLD_IDENTITY_TOKENS, IDENTITY_PARAM_TOKENS } from "@/lib/adminAlerts/deriveMessageParams";

it("BELL_BOLD_IDENTITY_TOKENS is a name-only subset that excludes structured/prose tokens", () => {
  for (const t of BELL_BOLD_IDENTITY_TOKENS) expect(IDENTITY_PARAM_TOKENS.has(t)).toBe(true);
  expect([...BELL_BOLD_IDENTITY_TOKENS].sort()).toEqual(["crew-name", "sheet-name", "show-name"]);
  for (const t of ["role-changes", "email", "repo", "file-name", "crew-row-count", "failed-sheet-names"]) {
    expect(BELL_BOLD_IDENTITY_TOKENS.has(t)).toBe(false);
  }
});
```

In `tests/messages/_metaEmphasisRenderContract.test.ts` add a case asserting the 3-arg identity path renders `<strong>` for an identity key and that omitting the arg is unchanged from the 2-arg baseline.

- [ ] **Step 2: Run red**

Run: `pnpm exec vitest run tests/components/renderEmphasis.test.tsx tests/adminAlerts/deriveMessageParams.test.ts tests/messages/_metaEmphasisRenderContract.test.ts`
Expected: FAIL (3rd arg unused / `BELL_BOLD_IDENTITY_TOKENS` undefined).

- [ ] **Step 3: Implement**

In `deriveMessageParams.ts` after `IDENTITY_PARAM_TOKENS` (`:38-48`):
```ts
/** Name-like identity tiers that render BOLD at BellPanel render time (ALERT-COPY-IDENTITY-BOLD-1).
 * Deliberately narrower than IDENTITY_PARAM_TOKENS: excludes role-changes (structured list),
 * email/repo/file-name (technical), and counts — bolding those would fight the multi-change <ul>
 * or bold operational prose. Structural subset test pins this. */
export const BELL_BOLD_IDENTITY_TOKENS: ReadonlySet<string> = new Set(["show-name", "sheet-name", "crew-name"]);
```

In `renderEmphasis.tsx`, export the placeholder regex from `lookup.ts` if needed, or reuse `interpolate` for the non-identity path. Rewrite `renderCatalogEmphasis`:
```tsx
import { interpolate, PLACEHOLDER_RE, type MessageParams } from "@/lib/messages/lookup";

export function renderCatalogEmphasis(
  template: string,
  params?: MessageParams,
  identityKeys?: ReadonlySet<string>,
): ReactNode[] {
  const nodes = renderEmphasis(template);
  if (!params) return nodes;
  if (!identityKeys || identityKeys.size === 0) {
    // unchanged 2-arg path
    return nodes.map((node, i) => {
      if (typeof node === "string") return interpolate(node, params) ?? node;
      if (isValidElement<{ children?: ReactNode }>(node) && typeof node.props.children === "string") {
        return cloneElement(node, { key: node.key ?? `p-${i}` }, interpolate(node.props.children, params) ?? node.props.children);
      }
      return node;
    });
  }
  // identity-aware: split string nodes on placeholders, bold identity keys
  const norm = (k: string) => [k, k.replace(/-/g, "_"), k.replace(/_/g, "-")];
  const boldSplit = (s: string, keyPrefix: string): ReactNode[] => {
    const out: ReactNode[] = [];
    let cursor = 0; let m: RegExpExecArray | null; PLACEHOLDER_RE.lastIndex = 0;
    while ((m = PLACEHOLDER_RE.exec(s)) !== null) {
      const key = m[1] as string;
      const value = params[key] ?? params[key.replace(/-/g, "_")] ?? params[key.replace(/_/g, "-")];
      if (m.index > cursor) out.push(s.slice(cursor, m.index));
      if (value === undefined || value === null) {
        out.push(m[0]); // not-found: leave literal placeholder (matches interpolate)
      } else if (norm(key).some((k) => identityKeys.has(k)) && String(value) !== "") {
        out.push(<strong key={`${keyPrefix}-${m.index}`} className="font-semibold text-text-strong">{String(value)}</strong>);
      } else {
        out.push(String(value));
      }
      cursor = m.index + m[0].length;
    }
    if (cursor < s.length) out.push(s.slice(cursor));
    return out;
  };
  const result: ReactNode[] = [];
  nodes.forEach((node, i) => {
    if (typeof node === "string") { result.push(...boldSplit(node, `id-${i}`)); return; }
    if (isValidElement<{ children?: ReactNode }>(node) && typeof node.props.children === "string") {
      result.push(cloneElement(node, { key: node.key ?? `p-${i}` }, boldSplit(node.props.children, `ide-${i}`)));
      return;
    }
    result.push(node);
  });
  return result;
}
```
Export `PLACEHOLDER_RE` from `lib/messages/lookup.ts` if not already exported (verify; add `export` to the const).

- [ ] **Step 4: Run green**

Run: `pnpm exec vitest run tests/components/renderEmphasis.test.tsx tests/adminAlerts/deriveMessageParams.test.ts tests/messages/_metaEmphasisRenderContract.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/messages/renderEmphasis.tsx lib/adminAlerts/deriveMessageParams.ts lib/messages/lookup.ts tests/components/renderEmphasis.test.tsx tests/adminAlerts/deriveMessageParams.test.ts tests/messages/_metaEmphasisRenderContract.test.ts
git commit --no-verify -m "feat(admin): identity-aware bold pass in renderCatalogEmphasis + BELL_BOLD_IDENTITY_TOKENS (WI-3)"
```

---

## Task 2: deriveMessageParams — roleChangeLines + tail/em-dash drop

**Files:**
- Modify: `lib/adminAlerts/deriveMessageParams.ts`
- Test: `tests/adminAlerts/deriveMessageParams.test.ts`

**Interfaces:**
- Consumes: `RoleChange`, `parseChanges` (both promoted to `export`), `bulletLine`, `CHANGE_LINE_CAP` from Task-0 baseline.
- Produces: `export function roleChangeLines(changes: RoleChange[]): { header: string; items: string[]; overflow: string | null }`. `export function parseChanges(...)`, `export type RoleChange`.
- `roleChangesParam` overflow tail dropped; `ROLE_CHANGES_FALLBACK` em-dash swept.

- [ ] **Step 1: Write failing tests**

```ts
import { roleChangeLines, parseChanges, deriveAlertMessageParams } from "@/lib/adminAlerts/deriveMessageParams";

const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ crew_name: `C${i}`, prior_flags: ["A"], new_flags: ["A", "B"] }));

it("roleChangeLines returns structured object for >=2 changes, no bullet marker, no em dash", () => {
  const r = roleChangeLines(mk(4));
  expect(r.header).toBe("4 role changes:");
  expect(r.items).toHaveLength(3);
  for (const it of r.items) { expect(it.startsWith("• ")).toBe(false); expect(it).not.toContain("—"); }
  expect(r.overflow).toBe("+1 more");
  expect(r.overflow).not.toContain("see show page");
});

it("roleChangeLines 2..3 changes → all items, no overflow", () => {
  const r = roleChangeLines(mk(3));
  expect(r.items).toHaveLength(3);
  expect(r.overflow).toBeNull();
});

it("roleChangeLines inert for 0/1 (prose is roleChangesParam's job)", () => {
  expect(roleChangeLines(mk(0))).toEqual({ header: "", items: [], overflow: null });
  expect(roleChangeLines(mk(1))).toEqual({ header: "", items: [], overflow: null });
});

it("multi-change role-changes param drops the tail + em dash (via deriveAlertMessageParams)", () => {
  const p = deriveAlertMessageParams("ROLE_FLAGS_NOTICE", { changes: mk(5) }, null);
  expect(p["role-changes"]).toContain("+2 more");
  expect(p["role-changes"]).not.toContain("see show page");
  expect(p["role-changes"]).not.toContain("—");
});

it("ROLE_CHANGES_FALLBACK (0 changes) is em-dash free", () => {
  const p = deriveAlertMessageParams("ROLE_FLAGS_NOTICE", { changes: [] }, null);
  expect(p["role-changes"]).not.toContain("—");
});

it("parseChanges is exported and parses context.changes", () => {
  expect(parseChanges({ changes: mk(2) })).toHaveLength(2);
  expect(parseChanges(null)).toEqual([]);
});
```

- [ ] **Step 2: Run red**

Run: `pnpm exec vitest run tests/adminAlerts/deriveMessageParams.test.ts`
Expected: FAIL (`roleChangeLines`/`parseChanges` not exported; tail still present).

- [ ] **Step 3: Implement**

In `deriveMessageParams.ts`:
- `export function parseChanges(` (add `export` at `:209`).
- `export type RoleChange` (ensure exported).
- Sweep `ROLE_CHANGES_FALLBACK` (`:27`): `"a crew member's role flags changed; see the show page."`
- `roleChangesParam` overflow (`:244`): `` [`+${changes.length - CHANGE_LINE_CAP} more`] `` (drop `— see show page.`).
- Add:
```ts
function bulletBody(c: RoleChange): string {
  return bulletLine(c).replace(/^• /, "");
}
export function roleChangeLines(changes: RoleChange[]): { header: string; items: string[]; overflow: string | null } {
  if (changes.length < 2) return { header: "", items: [], overflow: null };
  const items = changes.slice(0, CHANGE_LINE_CAP).map(bulletBody);
  const overflow = changes.length > CHANGE_LINE_CAP ? `+${changes.length - CHANGE_LINE_CAP} more` : null;
  return { header: `${changes.length} role changes:`, items, overflow };
}
```

- [ ] **Step 4: Run green**

Run: `pnpm exec vitest run tests/adminAlerts/deriveMessageParams.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/adminAlerts/deriveMessageParams.ts tests/adminAlerts/deriveMessageParams.test.ts
git commit --no-verify -m "feat(admin): roleChangeLines structured helper + drop overflow tail/em-dash (WI-4 lib)"
```

---

## Task 3: BellPanel ActiveRow restructure — message out of button + right-flush + orphan-safe block

**Files:**
- Modify: `components/admin/BellPanel.tsx` (ActiveRow `:330-468`)
- Test: `tests/components/bellPanelRedesign.test.tsx` (or `bellPanel.test.tsx`)

**Interfaces:**
- Consumes: existing `rowCopy`, `renderCatalogEmphasis`, `OccurrenceChip`, `SHOW_PAGE_LINK`, `HELP_LINK`, `raisedAtSuffix`, `onMarkRead`, `entry`.
- Produces: restructured DOM — title-only mark-read `<button>`; header flex row `[data-testid=bell-header-${id}]` with right-group `[data-testid=bell-meta-${id}]` (chip + timestamp `[data-testid=bell-time-${id}]`) + chevron as siblings; message block `[data-testid=bell-msg-${id}]` rendered when `((message && messageResolved) || helpHref)`.

- [ ] **Step 1: Write failing tests**

```tsx
// message + inline Learn-more are SIBLINGS of, not descendants of, the toggle button
it("message is not inside the mark-read button; button name is title only", () => {
  renderActiveRow(entryWithMessage);        // helper renders one ActiveRow
  const btn = screen.getByTestId(`bell-entry-toggle-${id}`);
  expect(btn.querySelector(`[data-testid=bell-msg-${id}]`)).toBeNull();
  expect(btn.querySelector("ul")).toBeNull();
  expect(btn.textContent).toBe(title);       // title only
});

it("Learn-more survives a suppressed message (orphan guard)", () => {
  renderActiveRow(entryHelpHrefNoMessage);   // helpHref set, message null/unresolved
  const block = screen.getByTestId(`bell-msg-${id}`);
  expect(block.querySelector(`[data-testid=bell-help-${id}]`)).not.toBeNull();
  expect(screen.queryByTestId(`bell-action-cell-${id}`)?.querySelector(`[data-testid=bell-help-${id}]`)).toBeFalsy();
});

it("block omitted only when both message and helpHref absent", () => {
  renderActiveRow(entryNoMessageNoHelp);
  expect(screen.queryByTestId(`bell-msg-${id}`)).toBeNull();
});

it("timestamp + chip live in the row-level right-group, not the button", () => {
  renderActiveRow(entryWithMessage);
  const btn = screen.getByTestId(`bell-entry-toggle-${id}`);
  expect(btn.querySelector(`[data-testid=bell-time-${id}]`)).toBeNull();
  expect(screen.getByTestId(`bell-meta-${id}`).querySelector(`[data-testid=bell-time-${id}]`)).not.toBeNull();
});
```

- [ ] **Step 2: Run red** — `pnpm exec vitest run tests/components/bellPanelRedesign.test.tsx` → FAIL.

- [ ] **Step 3: Implement** the WI-1 target DOM (spec §4 WI-1):
  - Header row `<div data-testid={`bell-header-${id}`} className="flex items-start gap-2">`.
  - Title-only `<button data-testid={`bell-entry-toggle-${id}`} onClick={onMarkRead} className="flex min-h-tap-min min-w-0 flex-1 items-center text-left focus-visible:… ring-offset-surface">` → `<span className="min-w-0 wrap-break-word font-semibold text-text-strong">{title}</span>`.
  - Right-group `<span data-testid={`bell-meta-${id}`} className="flex shrink-0 items-center gap-2.5 pt-0.5">{!suppressChip && <OccurrenceChip …/>}<span data-testid={`bell-time-${id}`} className="text-xs tabular-nums text-text-faint">{raisedAtSuffix(entry.activityAt, now)}</span></span>`. **Preserve the existing `suppressChip` gate** (`BellPanel.tsx:356`, `INLINE_IDENTITY_CODES` — chip hidden for inline-identity codes); the restructure moves the chip into the right-group but must keep the same render condition.
  - Chevron `<a data-testid={`bell-caret-${id}`} …SHOW_PAGE_LINK…>` rendered when `entry.slug !== null`, last flex child.
  - Message block `{((message && messageResolved) || helpHref) && (<div data-testid={`bell-msg-${id}`} className="mt-1 whitespace-pre-line wrap-break-word text-sm text-text-subtle">{message && messageResolved && <span>{renderCatalogEmphasis(message, params)}</span>}{helpHref && <> <a data-testid={`bell-help-${id}`} href={helpHref} className={HELP_LINK} aria-label={`Learn more about ${rowCopy(entry.code).title}`}>Learn more</a></>}</div>)}`. (Task 4 adds identity bold, Task 5 the `<ul>`; keep here minimal.)
  - Remove Learn-more from ActionCell (`:296-305`); add `data-testid={`bell-action-cell-${id}`}` to the ActionCell outer `<div>` for the orphan test.

- [ ] **Step 4: Run green** — `pnpm exec vitest run tests/components/bellPanelRedesign.test.tsx` + the full existing BellPanel suite (`pnpm exec vitest run tests/components/bellPanel.test.tsx tests/components/bellPanelActions.test.tsx tests/components/bellPanelDeferrals.test.tsx`) → PASS (fix any snapshot/testid drift in those from the restructure).

- [ ] **Step 5: Commit**
```bash
git add components/admin/BellPanel.tsx tests/components/bellPanelRedesign.test.tsx
git commit --no-verify -m "feat(admin): BellPanel row restructure — title-only mark-read, right-flush meta, orphan-safe message block, Learn-more inline (WI-1/WI-2)"
```

---

## Task 4: BellPanel identity-bold wiring

**Files:** Modify `components/admin/BellPanel.tsx`; Test `tests/components/bellPanelRedesign.test.tsx`.

- [ ] **Step 1: Failing test**
```tsx
it("bolds the identity name in the message, not the surrounding prose", () => {
  renderActiveRow(entrySheetName);   // dougFacing "In <sheet-name>, …", params {sheet-name:"'East Coast'"}
  const block = screen.getByTestId(`bell-msg-${id}`);
  const strong = block.querySelector("strong");
  expect(strong?.textContent).toBe("'East Coast'");
});
it("single-change ROLE_FLAGS_NOTICE sentence is not fully bold", () => {
  renderActiveRow(entryRoleFlagsSingle);
  const block = screen.getByTestId(`bell-msg-${id}`);
  // the role-change sentence text is not inside <strong>
  expect(block.querySelector("strong")?.textContent ?? "").not.toContain("role changed");
});
```
- [ ] **Step 2: Run red** → FAIL (message uses 2-arg renderCatalogEmphasis).
- [ ] **Step 3: Implement** — pass `BELL_BOLD_IDENTITY_TOKENS` as the 3rd arg to the message-block `renderCatalogEmphasis(message, params, BELL_BOLD_IDENTITY_TOKENS)`. Import it from `@/lib/adminAlerts/deriveMessageParams`.
- [ ] **Step 4: Run green** → PASS.
- [ ] **Step 5: Commit** — `feat(admin): wire BellPanel message to identity-bold token set (WI-3)`.

---

## Task 5: BellPanel multi-change `<ul>` split render

**Files:** Modify `components/admin/BellPanel.tsx`; Test `tests/components/bellPanelRedesign.test.tsx`.

**Interfaces:** Consumes `parseChanges`, `roleChangeLines`, `BELL_BOLD_IDENTITY_TOKENS`.

- [ ] **Step 1: Failing tests**
```tsx
it("multi-change ROLE_FLAGS_NOTICE renders a real <ul> of body-weight items + overflow, not in the button", () => {
  renderActiveRow(entryRoleFlags4);    // context.changes length 4
  const block = screen.getByTestId(`bell-msg-${id}`);
  const ul = block.querySelector("ul");
  expect(ul).not.toBeNull();
  expect(ul!.querySelectorAll("li")).toHaveLength(3);
  for (const li of ul!.querySelectorAll("li")) expect(li.className).not.toMatch(/font-(semibold|bold)/);
  expect(block.textContent).toContain("+1 more");
  expect(block.textContent).not.toContain("see show page");
  // <ul> is NOT inside the toggle button
  expect(screen.getByTestId(`bell-entry-toggle-${id}`).querySelector("ul")).toBeNull();
  // sheet-name in the prefix is still bold
  expect(block.querySelector("strong")).not.toBeNull();
});
it("2..3 changes render <ul> without overflow", () => {
  renderActiveRow(entryRoleFlags2);
  const ul = screen.getByTestId(`bell-msg-${id}`).querySelector("ul");
  expect(ul!.querySelectorAll("li")).toHaveLength(2);
  expect(screen.getByTestId(`bell-msg-${id}`).textContent).not.toContain("more");
});
it("template missing <role-changes> or <2 changes falls back to ordinary render (no <ul>, no crash)", () => {
  renderActiveRow(entryRoleFlagsSingle);
  expect(screen.getByTestId(`bell-msg-${id}`).querySelector("ul")).toBeNull();
});
```
- [ ] **Step 2: Run red** → FAIL (no `<ul>`).
- [ ] **Step 3: Implement** the WI-4 BellPanel branch (spec §4 WI-4): when `entry.code === "ROLE_FLAGS_NOTICE"`, `const changes = parseChanges(entry.context)`, and `message.includes("<role-changes>")` and `changes.length >= 2`:
  - split `message` on `"<role-changes>"` → `[prefix, suffix]`;
  - render `renderCatalogEmphasis(prefix, params, BELL_BOLD_IDENTITY_TOKENS)`, then `{lines.header}` text + `<ul className="mt-1 list-disc pl-5 text-sm text-text-subtle">{lines.items.map((it,i) => <li key={i} className="wrap-break-word">{it}</li>)}</ul>` + `{lines.overflow && <p className="mt-1 text-xs text-text-faint">{lines.overflow}</p>}`, then `renderCatalogEmphasis(suffix, params, BELL_BOLD_IDENTITY_TOKENS)`.
  - else: ordinary `renderCatalogEmphasis(message, params, BELL_BOLD_IDENTITY_TOKENS)` (defensive fallback).
  Extract this into a local `renderMessageBody(entry, message, params)` helper in the file to keep ActiveRow readable.
- [ ] **Step 4: Run green** → PASS (+ full BellPanel suite).
- [ ] **Step 5: Commit** — `feat(admin): BellPanel multi-change <ul> split render for ROLE_FLAGS_NOTICE (WI-4)`.

---

## Task 6: Chevron one-time dismissible in-flow banner + throwing-safe hook

**Files:**
- Create: `components/admin/useDismissibleOnce.ts` (client hook)
- Modify: `components/admin/BellPanel.tsx` (render banner at top of active list)
- Test: `tests/components/bellChevronHint.test.tsx`

**Interfaces:**
- Produces: `export function useDismissibleOnce(key: string): { dismissed: boolean; mounted: boolean; dismiss: () => void }` — mount-gated; reads/writes `localStorage` wrapped in try/catch (accessor + getItem + setItem); read-throw → `dismissed:false` but caller still gates on `mounted`; write-throw swallowed, still flips local `dismissed`.

- [ ] **Step 1: Failing tests**
```tsx
// with a fresh localStorage, banner appears after mount when a chevron row exists
it("shows one in-flow hint banner after mount", async () => {
  renderPanel(feedWithChevronRows);
  expect(await screen.findByTestId("bell-chevron-hint")).toBeInTheDocument();
  expect(screen.getAllByTestId("bell-chevron-hint")).toHaveLength(1);
});
it("absent when all rows lack a slug", () => {
  renderPanel(feedNoSlugs);
  expect(screen.queryByTestId("bell-chevron-hint")).toBeNull();
});
it("dismiss unmounts + persists; dismiss button not inside any chevron <a>", async () => {
  renderPanel(feedWithChevronRows);
  const dismiss = await screen.findByTestId("bell-chevron-hint-dismiss");
  for (const caret of screen.queryAllByTestId(/^bell-caret-/)) expect(caret.contains(dismiss)).toBe(false);
  fireEvent.click(dismiss);
  expect(screen.queryByTestId("bell-chevron-hint")).toBeNull();
  expect(window.localStorage.getItem("fxav:bell-chevron-hint:v1")).toBeTruthy();
});
it("already-dismissed → no banner", () => {
  window.localStorage.setItem("fxav:bell-chevron-hint:v1", "1");
  renderPanel(feedWithChevronRows);
  expect(screen.queryByTestId("bell-chevron-hint")).toBeNull();
});
it("throwing localStorage: panel renders, banner absent, dismiss-throw does not crash", () => {
  const orig = Object.getOwnPropertyDescriptor(window, "localStorage");
  Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
  try {
    expect(() => renderPanel(feedWithChevronRows)).not.toThrow();
    expect(screen.queryByTestId("bell-chevron-hint")).toBeNull();
  } finally { if (orig) Object.defineProperty(window, "localStorage", orig); }
});
```
- [ ] **Step 2: Run red** → FAIL.
- [ ] **Step 3: Implement** `useDismissibleOnce` (mount-gated via a `useEffect`-set `mounted` flag; `safeGet`/`safeSet` wrap every access in try/catch) and the banner in BellPanel: compute `hasChevronRow = rows.some(r => r.slug !== null)`; render `{mounted && !dismissed && hasChevronRow && <div role="note" data-testid="bell-chevron-hint" className="mx-4 mt-2 flex items-center gap-2 rounded-md border border-border bg-surface-sunken px-3 py-2 text-xs text-text-subtle"><span>The <span aria-hidden="true">⌄</span> chevron now opens the show page</span><span className="flex-1" /><button type="button" data-testid="bell-chevron-hint-dismiss" aria-label="Dismiss hint" onClick={dismiss} className={GHOST_DISMISS}>Dismiss</button></div>}` as the FIRST child of the active-rows list content (before the `.map` of rows).
- [ ] **Step 4: Run green** → PASS.
- [ ] **Step 5: Commit** — `feat(admin): one-time dismissible chevron-hint banner + throwing-safe useDismissibleOnce (WI-5)`.

---

## Task 7: PerShowAlertSection tap-target parity + multi-change copy

**Files:** Modify `components/admin/PerShowAlertSection.tsx`; Test `tests/components/admin/perShowAlertActionLink.test.tsx`, `tests/components/admin/perShowAlertHelpLink.test.tsx`, `tests/components/PerShowAlertSection.test.tsx`.

- [ ] **Step 1: Failing tests**
```tsx
it("action + Learn-more links carry inline-flex + tap-target + ring-offset-surface", () => {
  renderPerShow(alertWithAction);
  for (const tid of [`per-show-alert-action-${id}`, `per-show-alert-help-link-${id}`]) {
    const el = screen.getByTestId(tid);
    for (const cls of ["inline-flex", "items-center", "min-h-tap-min", "ring-offset-surface"]) expect(el.className).toContain(cls);
  }
});
it("multi-change ROLE_FLAGS_NOTICE overflow drops the tail + em dash", () => {
  renderPerShow(roleFlags5PerShow);
  const txt = screen.getByTestId(`per-show-alert-${id}`).textContent ?? "";
  expect(txt).toContain("+2 more");
  expect(txt).not.toContain("see show page");
  expect(txt).not.toContain("—");
});
```
- [ ] **Step 2: Run red** → FAIL.
- [ ] **Step 3: Implement** — add `inline-flex items-center min-h-tap-min` and `ring-offset-surface` to both link classNames (`:348-358`, `:364-377`). (Multi-change copy already correct from Task 2's global helper change — this test is regression coverage; if it passes at red, the assertion still guards it.)
- [ ] **Step 4: Run green** → PASS.
- [ ] **Step 5: Commit** — `feat(admin): PerShow link tap-target parity + multi-change copy regression (WI-6)`.

---

## Task 8: Real-browser layout spec (DI-1..DI-4 + hint geometry)

**Files:** Modify `tests/e2e/bell-panel-layout.spec.ts`.

- [ ] **Step 1: Write failing Playwright assertions** for DI-1..DI-4 (chevron-present + chevron-absent fixtures) and the hint banner geometry at mobile (≤420px) + desktop widths (spec §5 + §7):
  - DI-1: `meta.right <= caret.left` (or, caret absent, `meta.right <= panelContentRight`) within 0.5px.
  - DI-2: `caret.right === panelContentRight` within 0.5px.
  - DI-3: `toggle.height >= 44`, toggle does not overflow row.
  - DI-4: `time.right >= toggle.right`.
  - Hint: with banner present, `panel.scrollWidth <= panel.clientWidth + 0.5`; `hint` + `dismiss` rects within panel rect; `dismiss.height >= 44` and click unmounts; `hint.bottom <= firstRow.top`.
- [ ] **Step 2: Run red** — `pnpm exec playwright test tests/e2e/bell-panel-layout.spec.ts` → FAIL (assertions not yet satisfied or fixtures missing) — NOTE: this task runs AFTER Tasks 3-6 land the DOM, so at Step 2 it may already partially pass; write the assertions to fail if the DOM regresses.
- [ ] **Step 3: Implement** — add/extend the fixtures + assertions; if any DI fails against the real DOM, fix the BellPanel classes (this is where Tailwind-v4 non-stretch surprises surface).
- [ ] **Step 4: Run green** → PASS.
- [ ] **Step 5: Commit** — `test(admin): real-browser BellPanel layout — DI-1..4 + chevron-hint geometry (WI-1/WI-5)`.

---

## Task 9: Transition audit

**Files:** Create/modify `tests/components/bellPanelTransitionAudit.test.tsx`.

- [ ] **Step 1: Failing test** — enumerate every conditional render added (message block, `<ul>` branch, hint banner): assert the hint banner has NO `AnimatePresence`/`exit` (instant is deliberate), the message-block/`<ul>` toggles are instant conditional renders, and dismissing the banner removes it (jsdom) without error. Compound: mount banner then dismiss while a row is unread → row read-state unaffected.
- [ ] **Step 2: Run red** → FAIL.
- [ ] **Step 3: Implement** — (assertions describe existing behavior; if the impl accidentally added animation, remove it).
- [ ] **Step 4: Run green** → PASS.
- [ ] **Step 5: Commit** — `test(admin): BellPanel transition audit — instant hint/message/ul transitions (WI-5)`.

---

## Task 10: Full-suite gate + impeccable dual-gate + DEFERRED retirement

- [ ] **Step 1:** Run the full gate set:
```
pnpm exec vitest run
pnpm typecheck
pnpm lint
pnpm format:check
pnpm exec playwright test tests/e2e/bell-panel-layout.spec.ts
```
All green (pre-existing pg-cron env failures excepted — verify identical on clean stash).
- [ ] **Step 2:** **impeccable dual-gate** on the UI diff (invariant 8): `/impeccable critique` AND `/impeccable audit` with the v3 setup gates (context.mjs PRODUCT.md+DESIGN.md load → register reference). Fix P0/P1 or defer via a `DEFERRED.md` entry. Record findings + dispositions for the close-out.
- [ ] **Step 3:** Retire the four now-closed DEFERRED entries (`ALERT-COPY-IDENTITY-BOLD-1`, `ALERT-CHEVRON-HINT-1`, `ALERT-MULTI-CHANGE-TONE-1`, `PERSHOW-LINK-TAPTARGET-1`) to `DEFERRED-archive.md` with resolution notes; update the "Last reconciled" line. Commit `docs: retire 4 alert-surface DEFERRED entries (shipped via alert-surface-ui)`.

---

## Self-Review checklist (run before adversarial)

- Spec coverage: WI-1→T3, WI-2→T3, WI-3→T1+T4, WI-4→T2+T5, WI-5→T6, WI-6→T7; layout→T8; transitions→T9; gates→T10. ✅
- Placeholder scan: no TBD/TODO. ✅
- Type consistency: `renderCatalogEmphasis` 3-arg signature identical across T1/T4/T5; `roleChangeLines` shape identical T2/T5; `BELL_BOLD_IDENTITY_TOKENS` one definition. ✅
- Anti-tautology: identity-bold asserts the STRONG node scoped to the name; `<ul>` asserts not-in-button + body-weight; multi-change derives expected from fixture `mk(n)` dimensions, not hardcoded sentences. ✅
- Layout-dimensions task (T8) present with real-browser getBoundingClientRect. ✅
- Transition-audit task (T9) present. ✅
