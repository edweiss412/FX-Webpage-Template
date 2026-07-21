# Plan re-review: t14

## Your role: REVIEWER ONLY

Surface findings only. Do not fix, patch, or propose changes you will make. Do NOT run shell commands or tools; the artifact is inlined. Do NOT invoke any nested review.

## Context

An implementation plan for a DEV-ONLY instrument in a Next.js 16 + Supabase admin app. It renders every alert/warning state of an admin "show modal" without waiting for live data. One catalog of storable scenario rows feeds two consumers: a build-gated gallery route (renders states, no DB) and a "materialize" dev-panel card (writes tagged rows into a local or validation Supabase).

The SPEC is already APPROVED after six rounds. Do NOT re-review the design. Review the PLAN: could an engineer with no context execute these steps and land correct, tested code?

Settled, do NOT relitigate: materialize is tier-3 only; warnings are never written on validation; environments gate on the URL the client actually uses; gallery action controls are neutralized by a capture-phase submit listener; bucketAttention returns pre-rendered ReactNode arrays; catalog coverage is deliberately not gated but validity is; no migration; no new advisory-lock holder.

## Binding plan rules

- TDD per task: failing test, run it, minimal implementation, passing test, commit.
- No placeholders. Every code-changing step shows the code.
- Every test states the concrete failure mode it catches. A test proving only "the function was called" is too weak.
- Anti-tautology: assert against the data source, not a container; derive expectations from fixtures; exercise null/zero/NaN/out-of-range.
- Snippets must typecheck under strict TS (noUncheckedIndexedAccess, exactOptionalPropertyTypes).
- Names and signatures used across tasks must match.

## This is a RE-REVIEW

The prior round returned 23 findings of one class: prose where code was required, and tests too weak to catch what the step claimed. These tasks were rewritten comprehensively. Judge the rewrite: what is still not executable, what test would pass while its named bug is present, and what the rewrite itself broke.

## Output

Per finding: `SEVERITY (P0/P1/P2/P3) - <claim> - <task/step> - <why it fails, concretely>`.
If sound, say so and APPROVE. Do not manufacture findings.

End with a final line exactly: `VERDICT: APPROVE` or `VERDICT: NEEDS-ATTENTION` or `VERDICT: BLOCKING`

## ARTIFACT

### Task 14: The materialize dev-panel card

Spec §5.3, §9, §7.4. Full mechanical UI checklist applies — this surface has operator-facing copy.

**Files:**

- Create: `components/admin/dev/MaterializeCard.tsx (new)`
- Modify: `app/admin/dev/page.tsx`
- Test: `tests/components/admin/dev/materializeCard.test.tsx (new)`

**Interfaces:**

```ts
export type MaterializeCardProps = {
  scenarios: Array<{ id: string; label: string }>; // tier-3 only, from materializableScenarios()
  applyAction: (fd: FormData) => Promise<void>; // applyAttentionScenarioFormAction
  clearAction: (fd: FormData) => Promise<void>; // clearAttentionScenarioFormAction
  lastResult: MaterializeResult | null; // rendered as operator copy, never raw
};
```

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/admin/dev/materializeCard.test.tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MaterializeCard } from "@/components/admin/dev/MaterializeCard";

function props(over = {}) {
  return {
    scenarios: [{ id: "t3-sheet-missing-mid-parse", label: "Sheet went missing mid-parse" }],
    applyAction: vi.fn(async () => {}),
    clearAction: vi.fn(async () => {}),
    lastResult: null,
    ...over,
  };
}

describe("MaterializeCard", () => {
  test("the confirmation control appears only for the validation target", async () => {
    render(<MaterializeCard {...props()} />);
    expect(screen.queryByLabelText(/confirm/i)).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(/environment/i), "validation");
    expect(screen.getByLabelText(/confirm/i)).toBeInTheDocument();
  });

  test("switching target back to local resets confirmation to unconfirmed", async () => {
    render(<MaterializeCard {...props()} />);
    const env = screen.getByLabelText(/environment/i);
    await userEvent.selectOptions(env, "validation");
    await userEvent.click(screen.getByLabelText(/confirm/i));
    expect(screen.getByLabelText(/confirm/i)).toBeChecked();
    await userEvent.selectOptions(env, "local");
    await userEvent.selectOptions(env, "validation");
    expect(screen.getByLabelText(/confirm/i)).not.toBeChecked();
  });

  test("the Clear control states that it removes ALL synthetic rows for the show", () => {
    render(<MaterializeCard {...props()} />);
    expect(screen.getByTestId("clear-scope-note").textContent ?? "").toMatch(
      /all synthetic rows for this show/i,
    );
  });

  test("a displayed result clears when any control changes", async () => {
    render(
      <MaterializeCard
        {...props({
          lastResult: { kind: "ok", alerts: 2, holds: 0, warnings: "untouched", skipped: [] },
        })}
      />,
    );
    expect(screen.getByTestId("result")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(/environment/i), "validation");
    expect(screen.queryByTestId("result")).not.toBeInTheDocument();
  });

  test("every control meets the tap-target minimum", () => {
    render(<MaterializeCard {...props()} />);
    for (const el of screen.getAllByRole("button")) {
      expect(el.className).toContain("min-h-tap-min");
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement the card.** A `<form action={applyAction}>` and a `<form action={clearAction}>`, sharing a scenario `<select>`, a slug `<input>`, and an environment `<select>`. Local state: `env`, `confirmed`, `resultDismissed`. `confirmed` resets to `false` in the environment `onChange`. Any control change sets `resultDismissed`, which hides `lastResult`. Both submit buttons carry `min-h-tap-min` and disable while `useFormStatus().pending`. Result copy resolves through `lib/messages/lookup.ts`; raw `MaterializeResult` codes appear only in a developer detail line, per the §1.1 exception. No em-dashes.
- [ ] **Step 4: Mount it** in `app/admin/dev/page.tsx`, passing `materializableScenarios()` mapped to `{ id, label }` and the two form actions.
- [ ] **Step 5: Run to verify it passes.**
- [ ] **Step 6: Commit**

```bash
git add components/admin/dev/MaterializeCard.tsx app/admin/dev/page.tsx tests/components/admin/dev/materializeCard.test.tsx
git commit -m "feat(dev): materialize card on the dev panel"
```

---

### Task 15: Database behavioral tests

Spec §12. These are the acceptance gate for Tasks 11 and 12, so **any fix they surface is part of this task's commit** — the staged paths below include the implementation files deliberately.

**Files:**

- Create: `tests/dev/materializeRoundTrip.realdb.test.ts (new)`
- Modify (as the tests require): `app/admin/dev/actions.ts`, `lib/dev/materialize/plan.ts (new)`, `lib/dev/materialize/env.ts (new)`

Requires a local Supabase (`pnpm preflight` green). Every assertion reads the database directly, never the action's own report.

- [ ] **Step 1: Write the failing tests**, in this order:
  1. **`LIKE` wildcard safety** — seed `sync_holds` rows with `created_by` of `xxdevScenario:real` and `a_bdevScenario:real`; run Apply then Clear; assert both survive byte-identical. Catches the unescaped `_` single-character wildcard, which every correctly-tagged fixture would miss.
  2. **Clear preserves authentic rows** — seed untagged alerts and holds; Clear; assert byte-identical.
  3. **Apply A then Apply B** leaves exactly B's synthetic alerts and holds, minus skips.
  4. **Alert collision skip** — seed a real unresolved alert of code C; apply a scenario containing C and D; assert D inserted, C reported skipped, real C row byte-identical.
  5. **Hold collision skip** on `(show_id, domain, entity_key)` — same shape.
  6. **Warnings tri-state** — absent leaves `parse_warnings` byte-identical; `[]` writes `[]`; validation target never writes.
  7. **Guards commit no writes** — full before/after content snapshots of all three tables.
- [ ] **Step 2: Run to verify they fail or error.**

Run: `pnpm vitest run tests/dev/materializeRoundTrip.realdb.test.ts`

- [ ] **Step 3: Fix what they surface** in the files listed above. Expect the `LIKE` escape and the collision-skip paths to need work; they are the two the unit tests cannot fully cover.
- [ ] **Step 4: Run to verify they pass.**
- [ ] **Step 5: Commit — staging the implementation fixes with the tests**

```bash
git add tests/dev/materializeRoundTrip.realdb.test.ts app/admin/dev/actions.ts lib/dev/materialize/
git commit -m "test(dev): materialize round-trip, collision, and wildcard-safety proofs"
```

---

### Task 16: Real-browser layout and transition audit

Spec §8, §9. jsdom computes no layout and loads no CSS, so neither assertion here can be made in Vitest.

**Files:**

- Create: `tests/e2e/attention-gallery-layout.spec.ts (new)`
- Modify: `playwright.config.ts`

**Harness readiness — verified at plan time:**

- **Server:** the existing **`dev-build` project on port 3001**, which is already built with `ADMIN_DEV_PANEL_ENABLED=true` and already hosts the sibling dev harnesses (`source-link-dimensional`, `telemetry-layout`). Do **not** add a standalone config: `tests/e2e/standalone.config.ts` is for specs that boot their own server and need no Next route, which does not describe a route-based spec. Do **not** use port 3000 — a sibling worktree's dev server there would serve the wrong code.
- **Discovery:** `playwright.config.ts`'s `testMatch` is an **explicit allow-list**. Add `attention-gallery-layout` to the `dev-build` project's regex, or the spec runs nowhere and silently proves nothing.
- **Readiness gate:** the menu renders **open by default** (`useState(true)`, Task 8), so the gate is: wait for `[data-testid="block-root"]` to be attached, then wait for the pill's `aria-expanded="true"`. No click is required to reach that state. Never `networkidle` alone.
- **Detach safety:** re-query each locator immediately before every `evaluate`; auto-wait hangs on an unmounted node.

- [ ] **Step 1: Add the spec to `testMatch` and write the failing spec.**

```ts
// tests/e2e/attention-gallery-layout.spec.ts
import { expect, test } from "@playwright/test";

const URL_NARROW = "/admin/dev/attention-gallery?tier=2&w=320";
const URL_WIDE = "/admin/dev/attention-gallery?tier=2&w=1280";

async function ready(page: import("@playwright/test").Page, url: string) {
  await page.goto(url);
  await page.locator('[data-testid="block-root"]').first().waitFor({ state: "attached" });
  await expect(page.locator('[aria-expanded="true"]').first()).toBeAttached();
}

for (const [name, url] of [
  ["narrow", URL_NARROW],
  ["wide", URL_WIDE],
] as const) {
  test(`adjacent open menus do not overlap (${name})`, async ({ page }) => {
    await ready(page, url);
    const menus = page.locator('[data-testid="attention-menu"]');
    const count = await menus.count();
    expect(count).toBeGreaterThan(1);
    for (let i = 0; i + 1 < count; i++) {
      const a = await menus.nth(i).boundingBox();
      const b = await menus.nth(i + 1).boundingBox();
      expect(a && b).toBeTruthy();
      if (a && b) expect(a.y + a.height).toBeLessThanOrEqual(b.y + 0.5);
    }
  });
}

test("a MENU_CAP-item menu actually crosses its scroll threshold", async ({ page }) => {
  await ready(page, "/admin/dev/attention-gallery?scenario=t2-many");
  const list = page.locator('[data-testid="attention-menu"] .overflow-y-auto').first();
  const { scrollHeight, clientHeight } = await list.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(scrollHeight).toBeGreaterThan(clientHeight);
});
```

The scroll assertion is why `MENU_CAP` is 12 rather than an assumed-sufficient number: it proves the cap reaches the state it claims to demonstrate.

- [ ] **Step 2: Run to verify it fails**

Run: `node_modules/.bin/playwright test tests/e2e/attention-gallery-layout.spec.ts --project=dev-build`
Expected: FAIL on overlap, because the reserved space in Task 8 is unverified.

- [ ] **Step 3: Adjust the reserved space** in `ScenarioBlock` until both widths pass. The menu is `absolute` with a `max-h-96` list, so the reservation must cover the list plus header and footer plus the `8px` offset.

- [ ] **Step 4: Run to verify it passes.**

- [ ] **Step 5: Write the failing transition audit.** This is a TDD cycle of its own, not an afterthought. The inventory it enforces is the spec's §9 table, restated here so the implementer needs no second document:

| From                     | To                                    | Required treatment                                                                                                          |
| ------------------------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| menu closed              | menu open                             | `AttentionMenu`'s own `transition-[opacity,transform] duration-fast`, inherited unchanged                                   |
| menu open                | menu closed                           | same transition, reversed; `motion-reduce:transition-none` honored                                                          |
| navigation readout unset | set                                   | instant                                                                                                                     |
| readout set              | set to a different item               | instant                                                                                                                     |
| help popover closed      | open, menu open                       | instant for the composition                                                                                                 |
| help popover open        | closed, menu open                     | instant                                                                                                                     |
| menu open                | closed while the help popover is open | the menu's exit transition only; the popover is a **descendant** and unmounts with it, deliberately not animated separately |
| warning collapsed        | expanded, menu open                   | instant; warnings are **siblings** of the menu                                                                              |
| warning expanded         | collapsed, menu open                  | instant                                                                                                                     |
| warning collapsed        | expanded, menu closed                 | instant                                                                                                                     |
| warning expanded         | collapsed, menu closed                | instant                                                                                                                     |
| menu closed              | opened while a warning is expanded    | the menu's entry transition; the card is unaffected                                                                         |
| menu open                | closed while a warning is expanded    | the menu's exit transition; the card stays expanded                                                                         |
| warning toggled          | while the menu is mid-transition      | instant, not queued                                                                                                         |
| help popover toggled     | while the menu is mid-transition      | instant; a descendant toggling inside an animating ancestor, safe because the menu animates only `opacity`/`transform`      |
| materialize: idle        | submitting                            | instant, controls disable                                                                                                   |
| materialize: submitting  | result                                | instant                                                                                                                     |
| materialize: result      | idle                                  | instant, on any control change                                                                                              |
| materialize: local       | validation                            | instant, reveals confirmation                                                                                               |
| materialize: validation  | local                                 | instant, hides and **resets** confirmation                                                                                  |
| materialize: unconfirmed | confirmed                             | instant                                                                                                                     |
| materialize: confirmed   | unconfirmed                           | instant                                                                                                                     |

The audit asserts: every `AnimatePresence`, ternary render, and conditional block in `ScenarioBlock.tsx (new)` and `MaterializeCard.tsx (new)` appears in this table; each either carries the named transition classes or is deliberately instant; and the two compound cases are exercised for real — toggle the help popover while the menu is mid-transition, and change the environment while a result is displayed.

- [ ] **Step 6: Run, fix, and verify the audit passes.**

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/attention-gallery-layout.spec.ts playwright.config.ts components/admin/dev/ScenarioBlock.tsx
git commit -m "test(dev): real-browser menu overlap, scroll threshold, and transition audit"
```

---

### Task 17: Close-out

**Files:**

- Create: `docs/superpowers/plans/2026-07-21-attention-scenario-gallery-handoff.md (new)` — the close-out record. It is a real file with a real path, and it is committed; without it the mandated evidence has nowhere to live.

- [ ] **Step 1: Full local gates**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`
All must pass. A scoped run is not sufficient — `tests/styles` and `tests/help` carry registry checks a components-only run skips.

- [ ] **Step 2: impeccable dual-gate**, scoped per §7.4: full mechanical checklist on `MaterializeCard`; findings on gallery chrome triaged against the `source-link-dim` minimal-chrome precedent; findings about the production components the gallery renders unmodified are out of scope for this diff. Record every finding and its disposition in §12 of the handoff file.

- [ ] **Step 3: Manual artifact verification at BOTH flag states.** Two distinct commands, because the variable must actually differ between them:

```bash
# disabled posture: the route must be ABSENT from the artifact
ADMIN_DEV_PANEL_ENABLED= RUN_BUILD_ARTIFACT_GATE_TEST=1 \
  pnpm vitest run tests/admin/build-artifact-gate.test.ts

# enabled posture: the route must be PRESENT
ADMIN_DEV_PANEL_ENABLED=true RUN_BUILD_ARTIFACT_GATE_TEST=1 \
  pnpm vitest run tests/admin/build-artifact-gate.test.ts
```

Paste both outputs into the handoff. This check does not run in CI (§6a), so the handoff is the only record that it was performed.

- [ ] **Step 4: Whole-diff Codex review to APPROVE.** Split by surface, each brief **under 330 lines** — measured this run: a 325-line brief returned a verdict on the first attempt, while 381- and 409-line briefs failed silently with empty transcripts. Suggested split: catalog and validator; gallery route and `ScenarioBlock`; materialize actions, env gate, and planner; tests and meta-tests.

- [ ] **Step 5: Commit the handoff, then ship**

```bash
git add docs/superpowers/plans/2026-07-21-attention-scenario-gallery-handoff.md
git commit -m "docs(admin): close-out record for the attention scenario gallery"
git push -u origin feat/attention-scenario-gallery
gh pr create --fill
gh pr checks --watch   # pass the PR number, not a SHA
gh pr merge --merge
git -C /Users/ericweiss/FX-Webpage-Template pull --ff-only
git -C /Users/ericweiss/FX-Webpage-Template rev-list --left-right --count main...origin/main  # must be 0	0
```
