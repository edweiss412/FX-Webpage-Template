# DEVTIER-1 Developer-toggle help copy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: implement task-by-task, TDD. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a developer-only sentence to the Administrators-heading `HoverHelp` naming what the Developer toggle grants (Telemetry, Maintenance, Diagnostics, Developer tools, promoting other admins), closing `DEFERRED.md` DEVTIER-1; plus a doc-only stale-mark of BELL-4.

**Architecture:** One string edit inside the existing `viewerIsDeveloper` ternary arm of the `HoverHelp` body in `components/admin/settings/AdministratorsSection.tsx`. No new component/element/testid/prop; no DB/route/API. Spec: `docs/superpowers/specs/2026-07-17-devtier-toggle-help.md`.

**Tech Stack:** Next.js 16 RSC, React 19, Tailwind v4, TypeScript strict, Vitest + Testing Library (jsdom).

## Global Constraints

- **Invariant 5:** N/A (static UI chrome copy; no error code literal).
- **Invariant 8 (impeccable dual-gate):** IN SCOPE — `AdministratorsSection.tsx` is under `components/`. Run `/impeccable critique` + `/impeccable audit` on the diff; P0/P1 fixed or DEFERRED-logged, before whole-diff review.
- **No em dash** in rendered copy (impeccable absolute ban). Curly apostrophe `’` (U+2019) matches the existing string.
- **TDD per task**, conventional commits, one commit per task.
- The rendered implementation string MUST equal the test's `GRANT_COPY` constant verbatim (single source of truth).

---

### Task 1: BELL-4 stale-resolved mark (doc-only)

**Files:**
- Modify: `DEFERRED.md` (BELL-4 entry, "Bell notification center — impeccable dual-gate deferrals (2026-07-05)")

No test (documentation-only; no code path). The claims were verified live in the spec's grounding pass.

- [ ] **Step 1: Append a Resolved-stale note to the BELL-4 entry.** After the existing BELL-4 `- **Why deferred:**` bullet, add:

```markdown
- **Resolved (stale, 2026-07-17, branch `fix/devtier-toggle-help`):** both nits were already closed upstream. The panel scroll max-heights are tokenized — `--spacing-panel-max: 480px` / `--spacing-panel-max-mobile: 70vh` (`app/globals.css`), consumed as `max-h-panel-max-mobile sm:max-h-panel-max` (`BellPanel.tsx:909`); `--spacing-panel-max` now has 3 consumers (dashboard inbox column, report modal, bell scroll), so the "single consumer" premise is void. The DevFooter number inputs (`BellPanel.tsx:458,469`) already carry `min-h-tap-min` + `w-20` (a standard Tailwind scale utility, not an arbitrary bracket). No code change.
```

- [ ] **Step 2: Commit.**

```bash
git add DEFERRED.md
git commit -m "docs(admin): mark BELL-4 resolved-stale (panel max-h already tokenized; DevFooter inputs already tap-sized)"
```

---

### Task 2: DEVTIER-1 developer-toggle help copy (TDD)

**Files:**
- Modify: `components/admin/settings/AdministratorsSection.tsx:94` (developer arm of the `HoverHelp` ternary)
- Test: `tests/components/admin/settings/AdministratorsSection-developer.test.tsx`

**Interfaces:**
- Consumes: `AdministratorsSection` (existing export), `viewerIsDeveloper` prop, `HoverHelp` body testid `admins-help-body` (`HoverHelp.tsx:182` → `${testId}-body`, `testId="admins-help"` at `AdministratorsSection.tsx:88`).
- Produces: nothing new; the developer-arm copy string.

- [ ] **Step 1: Write the failing tests.** Add to `AdministratorsSection-developer.test.tsx` (reuse its existing `render(<AdministratorsSection … />)` shape + fixtures; a minimal `result` with ≥1 active row so the heading renders). Put the constants at module top:

```tsx
const GRANT_COPY =
  "The Developer toggle grants full developer access: Telemetry, Maintenance, Diagnostics, and Developer tools, plus making other admins developers.";
const GRANT_CLAUSES = ["Telemetry", "Maintenance", "Diagnostics", "Developer tools", "making other admins developers"];

describe("AdministratorsSection — DEVTIER-1 developer-toggle help copy", () => {
  it("developer viewer → heading help names the full toggle grant (every clause)", () => {
    render(
      <AdministratorsSection
        result={ok([row({ email: "alice@example.com" })])}
        actorCanonicalEmail="me@example.com"
        now={NOW}
        viewerIsDeveloper={true}
      />,
    );
    const body = screen.getByTestId("admins-help-body");
    expect(body.textContent ?? "").toContain(GRANT_COPY);
    for (const clause of GRANT_CLAUSES) {
      expect(body.textContent ?? "").toContain(clause);
    }
  });

  it("non-developer viewer → grant copy (and every clause) ABSENT; non-developer copy present", () => {
    render(
      <AdministratorsSection
        result={ok([row({ email: "alice@example.com" })])}
        actorCanonicalEmail="me@example.com"
        now={NOW}
        viewerIsDeveloper={false}
      />,
    );
    const body = screen.getByTestId("admins-help-body");
    const text = body.textContent ?? "";
    expect(text).not.toContain(GRANT_COPY);
    for (const clause of GRANT_CLAUSES) {
      expect(text).not.toContain(clause);
    }
    expect(text).toContain("Roster changes are managed by a developer");
  });
});
```

Uses the file's existing `ok(rows)` result builder, `row({ email })` fixture helper, and `NOW` constant (`AdministratorsSection-developer.test.tsx:57,59,71`) — do NOT invent new fixture shapes. Scope both assertions to `admins-help-body` so a "Telemetry"/"Maintenance" string rendered elsewhere in the tree cannot false-pass.

- [ ] **Step 2: Run tests to verify they fail.**

Run: `pnpm test -- tests/components/admin/settings/AdministratorsSection-developer.test.tsx -t "DEVTIER-1"`
Expected: FAIL — the developer-arm copy does not yet contain `GRANT_COPY`/the clauses.

- [ ] **Step 3: Implement — extend the developer arm.** In `AdministratorsSection.tsx:94`, change the developer-arm string from:

```tsx
? "People who can sign in and manage shows here. Add or revoke access. You can’t revoke your own."
```

to:

```tsx
? "People who can sign in and manage shows here. Add or revoke access. You can’t revoke your own. The Developer toggle grants full developer access: Telemetry, Maintenance, Diagnostics, and Developer tools, plus making other admins developers."
```

Leave the non-developer arm (`:95`) unchanged. Curly apostrophe `’`; no em dash.

- [ ] **Step 4: Run tests to verify they pass.**

Run: `pnpm test -- tests/components/admin/settings/AdministratorsSection-developer.test.tsx`
Expected: PASS (new DEVTIER-1 tests + all pre-existing developer tests still green).

- [ ] **Step 5: Commit.**

```bash
git add components/admin/settings/AdministratorsSection.tsx tests/components/admin/settings/AdministratorsSection-developer.test.tsx
git commit -m "fix(admin): name the Developer-toggle grant in the Administrators help (DEVTIER-1)"
```

---

### Task 3: Invariant-8 impeccable dual-gate + suite green

**Files:** none (evaluation gate + regression run).

- [ ] **Step 1: impeccable setup gates** — `node .claude/skills/impeccable/scripts/context.mjs` (PRODUCT.md + DESIGN.md load), then the register reference read (product register — this is admin UI).
- [ ] **Step 2: `/impeccable critique`** on the diff (`AdministratorsSection.tsx`). Expect near-clean (copy-only, no visual/layout/token/transition change). Fix any P0/P1; log P2/P3 in DEFERRED.md.
- [ ] **Step 3: `/impeccable audit`** on the diff. Same disposition rule.
- [ ] **Step 4: Record findings + dispositions** for the milestone/handoff (here: this plan's close-out note / PR body).
- [ ] **Step 5: Full regression** — `pnpm test` (scoped gates miss cross-file regressions). Also `pnpm typecheck`, `pnpm lint`, `pnpm format:check` before push (vitest strips types; `--no-verify` bypasses prettier). Grep `grep -rln AdministratorsSection tests/` to catch any source-scanning meta-test that renders this file.
- [ ] **Step 6: Whole-diff cross-model (Codex) review to APPROVE**, then push → real CI green → `gh pr merge --merge` → ff local main.

## Self-Review

- **Spec coverage:** Task 2 implements the copy + developer-only tests; Task 1 the BELL-4 mark; Task 3 the invariant-8 gate. All spec sections covered.
- **Placeholders:** none — actual copy, actual test code, actual commands.
- **Type consistency:** `GRANT_COPY` in the test equals the implementation string in Task 2 Step 3 verbatim (single source). `admins-help-body` testid matches `HoverHelp.tsx:182`. `viewerIsDeveloper` prop matches `AdministratorsSection.tsx:47`.
- **Meta-test inventory:** none created/extended (declared in spec). No new email-normalization or raw-code surface.
