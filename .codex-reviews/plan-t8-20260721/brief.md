# Plan re-review: t8

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

### Task 8: `ScenarioBlock` client component

Spec §4.0, §4.1, §4.4.

**Files:**

- Create: `components/admin/dev/ScenarioBlock.tsx (new)`
- Test: `tests/components/admin/dev/scenarioBlock.test.tsx (new)`

**Interfaces:**

- Produces: `ScenarioBlockProps` exactly as §4.0 defines. Restated here because the implementer sees only this task:

```ts
export type ReadoutRow = { label: string; value: string };
export type ScenarioGroup = {
  sectionId: string;
  placement: "sectionTop" | "crewRow" | "anchor";
  anchorOrCrewKey: string | null;
  nodes: ReactNode[];
};
export type ScenarioBlockProps = {
  scenarioId: string;
  label: string;
  items: AttentionItem[];
  groups: ScenarioGroup[];
  holdItems: AttentionItem[];
  readout: ReadoutRow[];
  warnings: ParseWarning[] | null;
  degraded: boolean;
  maxWidthPx: number | null;
};
```

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/admin/dev/scenarioBlock.test.tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScenarioBlock } from "@/components/admin/dev/ScenarioBlock";
import type { ScenarioBlockProps } from "@/components/admin/dev/ScenarioBlock";

function baseProps(over: Partial<ScenarioBlockProps> = {}): ScenarioBlockProps {
  return {
    scenarioId: "t2-single",
    label: "Exactly one item",
    items: [],
    groups: [],
    holdItems: [],
    readout: [{ label: "code", value: "SYNC_STALLED" }],
    warnings: null,
    degraded: false,
    maxWidthPx: null,
    ...over,
  };
}

describe("ScenarioBlock", () => {
  test("a form submit inside the block never fires its action", async () => {
    const action = vi.fn();
    render(
      <ScenarioBlock
        {...baseProps({
          groups: [
            {
              sectionId: "overview",
              placement: "sectionTop",
              anchorOrCrewKey: null,
              nodes: [
                <form key="f" action={action}>
                  <button type="submit">Resolve</button>
                </form>,
              ],
            },
          ],
        })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Resolve" }));
    expect(action).not.toHaveBeenCalled();
  });

  test("renders one labelled group per section with its nodes", () => {
    render(
      <ScenarioBlock
        {...baseProps({
          groups: [
            {
              sectionId: "overview",
              placement: "sectionTop",
              anchorOrCrewKey: null,
              nodes: [<p key="a">card-a</p>],
            },
            {
              sectionId: "rooms",
              placement: "anchor",
              anchorOrCrewKey: "diagrams",
              nodes: [<p key="b">card-b</p>],
            },
          ],
        })}
      />,
    );
    const overview = screen.getByTestId("group-overview-sectionTop");
    expect(within(overview).getByText("card-a")).toBeInTheDocument();
    const rooms = screen.getByTestId("group-rooms-anchor");
    expect(within(rooms).getByText("card-b")).toBeInTheDocument();
    expect(within(rooms).getByText(/diagrams/)).toBeInTheDocument();
  });

  test("holds render in their own group, never inside a section group", () => {
    render(
      <ScenarioBlock
        {...baseProps({
          holdItems: [
            {
              id: "hold:1",
              kind: "hold",
              tone: "critical",
              sectionId: "changes",
              crewKey: null,
              actionable: true,
              menuTitle: "Pick what happens",
              menuSubtitle: null,
            },
          ],
        })}
      />,
    );
    const holds = screen.getByTestId("hold-group");
    expect(within(holds).getByText("Pick what happens")).toBeInTheDocument();
  });

  test("warnings null renders no warning cards at all", () => {
    render(<ScenarioBlock {...baseProps({ warnings: null })} />);
    expect(screen.queryByTestId("warnings-warning")).not.toBeInTheDocument();
    expect(screen.queryByTestId("warnings-muted")).not.toBeInTheDocument();
  });

  test("warnings present renders BOTH the active and muted skins", () => {
    render(
      <ScenarioBlock
        {...baseProps({
          warnings: [
            {
              severity: "warn",
              code: "BLOCK_DISAPPEARED",
              message: "Synthetic warning for gallery review.",
            },
          ],
        })}
      />,
    );
    expect(screen.getByTestId("warnings-warning")).toBeInTheDocument();
    expect(screen.getByTestId("warnings-muted")).toBeInTheDocument();
  });

  test("the readout renders every row as label and value", () => {
    render(<ScenarioBlock {...baseProps({ readout: [{ label: "sectionId", value: "rooms" }] })} />);
    const dl = screen.getByTestId("readout");
    expect(within(dl).getByText("sectionId")).toBeInTheDocument();
    expect(within(dl).getByText("rooms")).toBeInTheDocument();
  });

  test("maxWidthPx null applies no width constraint; a number applies it", () => {
    const { rerender } = render(<ScenarioBlock {...baseProps({ maxWidthPx: null })} />);
    expect(screen.getByTestId("block-root").style.maxWidth).toBe("");
    rerender(<ScenarioBlock {...baseProps({ maxWidthPx: 390 })} />);
    expect(screen.getByTestId("block-root").style.maxWidth).toBe("390px");
  });
});
```

Each test names a §4.1 requirement that could otherwise be silently omitted. jsdom loads no CSS, so these assert structure and attributes only — real visibility and geometry belong to Task 16.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/components/admin/dev/scenarioBlock.test.tsx`
Expected: FAIL, cannot resolve the component.

- [ ] **Step 3: Implement**

```tsx
// components/admin/dev/ScenarioBlock.tsx
"use client";
import { useRef, useState, type ReactNode } from "react";
import { AttentionMenu } from "@/components/admin/showpage/AttentionMenu";
import { PerShowActionableWarnings } from "@/components/admin/PerShowActionableWarnings";
import type { AttentionItem } from "@/lib/admin/attentionItems";
import type { ParseWarning } from "@/lib/parser/types";

export type ReadoutRow = { label: string; value: string };
export type ScenarioGroup = {
  sectionId: string;
  placement: "sectionTop" | "crewRow" | "anchor";
  anchorOrCrewKey: string | null;
  nodes: ReactNode[];
};
export type ScenarioBlockProps = {
  scenarioId: string;
  label: string;
  items: AttentionItem[];
  groups: ScenarioGroup[];
  holdItems: AttentionItem[];
  readout: ReadoutRow[];
  warnings: ParseWarning[] | null;
  degraded: boolean;
  maxWidthPx: number | null;
};

export function ScenarioBlock(props: ScenarioBlockProps) {
  const pillRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(true);
  const [navigated, setNavigated] = useState<string | null>(null);

  return (
    <section
      data-testid="block-root"
      className="relative mb-16 pb-[26rem]"
      style={props.maxWidthPx === null ? undefined : { maxWidth: `${props.maxWidthPx}px` }}
      // Spec §4.4: every server action in this subtree posts through a form submit,
      // so one capture-phase preventDefault neutralizes all of them, including any
      // added later, without touching a production component.
      onSubmitCapture={(e) => e.preventDefault()}
    >
      <h2 id={props.scenarioId} className="font-bold text-lg mb-2">
        {props.label}
      </h2>

      <dl data-testid="readout" className="mb-3 text-sm">
        {props.readout.map((r) => (
          <div key={`${r.label}:${r.value}`}>
            <dt className="inline font-semibold">{r.label}</dt>
            <dd className="inline ml-2">{r.value}</dd>
          </div>
        ))}
      </dl>

      <div className="relative inline-block">
        <button ref={pillRef} type="button" onClick={() => setOpen((v) => !v)}>
          {props.degraded ? "Attention (degraded)" : `Attention (${props.items.length})`}
        </button>
        <AttentionMenu
          items={props.items}
          open={open}
          onClose={() => setOpen(false)}
          onNavigate={(item) => setNavigated(item.id)}
          pillRef={pillRef}
        />
      </div>
      {navigated === null ? null : <p data-testid="navigated">navigate: {navigated}</p>}

      {props.groups.map((g) => (
        <div
          key={`${g.sectionId}-${g.placement}-${g.anchorOrCrewKey ?? ""}`}
          data-testid={`group-${g.sectionId}-${g.placement}`}
        >
          <h3 className="font-semibold mt-4">
            {g.sectionId}
            {g.anchorOrCrewKey === null ? "" : ` / ${g.anchorOrCrewKey}`}
          </h3>
          {g.nodes}
        </div>
      ))}

      {props.holdItems.length === 0 ? null : (
        <div data-testid="hold-group">
          <h3 className="font-semibold mt-4">Holds (Changes feed, not bucketed)</h3>
          <ul>
            {props.holdItems.map((h) => (
              <li key={h.id}>{h.menuTitle}</li>
            ))}
          </ul>
        </div>
      )}

      {props.warnings === null ? null : (
        <>
          <div data-testid="warnings-warning">
            <PerShowActionableWarnings
              items={props.warnings}
              driveFileId="gallery-fixture"
              tone="warning"
            />
          </div>
          <div data-testid="warnings-muted">
            <PerShowActionableWarnings
              items={props.warnings}
              driveFileId="gallery-fixture"
              tone="muted"
            />
          </div>
        </>
      )}
    </section>
  );
}
```

The `pb-[26rem]` reserves space for the absolutely-positioned menu (§4.0); Task 16 measures whether it is sufficient at both widths.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/components/admin/dev/scenarioBlock.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add components/admin/dev/ScenarioBlock.tsx tests/components/admin/dev/scenarioBlock.test.tsx
git commit -m "feat(dev): ScenarioBlock with submit interception and live menu state"
```

---
