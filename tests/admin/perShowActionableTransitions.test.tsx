// @vitest-environment jsdom
// tests/admin/perShowActionableTransitions.test.tsx - spec §6 transition inventory pins
// (spec 2026-07-20-warning-card-copy-restore).
//
// Mocks @/lib/messages/lookup so variants B (guidance-only) and C (trigger-only)
// are reachable: post-sweep, every real registry code carries BOTH fields, so the
// two independent-condition variants exist only for synthetic entries. Separate
// file from perShowActionableRenderControls.test.tsx, which must keep the real
// catalog.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PerShowActionableWarnings } from "@/components/admin/PerShowActionableWarnings";
import type { ParseWarning } from "@/lib/parser/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/messages/lookup", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/messages/lookup")>();
  const SYNTH: Record<
    string,
    { title: string; helpfulContext: string | null; triggerContext: string | null }
  > = {
    SYN_B: { title: "B title", helpfulContext: "B guidance", triggerContext: null },
    SYN_C: { title: "C title", helpfulContext: null, triggerContext: "C trigger" },
    SYN_D: { title: "D title", helpfulContext: "D guidance", triggerContext: "D trigger" },
  };
  return {
    ...real,
    isMessageCode: (c: string) => c in SYNTH || real.isMessageCode(c),
    messageFor: (c: string) =>
      c in SYNTH
        ? { ...real.messageFor("UNKNOWN_FIELD" as never), ...SYNTH[c] }
        : real.messageFor(c as never),
  };
});

afterEach(() => cleanup());

const warn = (code: string): ParseWarning => ({
  severity: "warn",
  code,
  message: "human text",
});

const VARIANTS = {
  A: { code: "SYN_A", guidance: false, trigger: false }, // unknown code
  B: { code: "SYN_B", guidance: true, trigger: false },
  C: { code: "SYN_C", guidance: false, trigger: true },
  D: { code: "SYN_D", guidance: true, trigger: true },
} as const;

function expectVariant(v: keyof typeof VARIANTS) {
  const { guidance, trigger } = VARIANTS[v];
  expect(!!screen.queryByTestId("per-show-actionable-guidance"), `${v} guidance`).toBe(guidance);
  expect(!!screen.queryByTestId(/per-show-actionable-help-.*-trigger/), `${v} trigger`).toBe(
    trigger,
  );
}

describe("transition inventory (spec §6): every pair instant, both directions", () => {
  const PAIRS: ReadonlyArray<readonly [keyof typeof VARIANTS, keyof typeof VARIANTS]> = [
    ["A", "B"],
    ["A", "C"],
    ["A", "D"],
    ["B", "C"],
    ["B", "D"],
    ["C", "D"],
  ];

  it.each(PAIRS)("%s↔%s swaps synchronously with no residue", (x, y) => {
    const { rerender } = render(
      <PerShowActionableWarnings items={[warn(VARIANTS[x].code)]} driveFileId={null} />,
    );
    expectVariant(x);
    rerender(<PerShowActionableWarnings items={[warn(VARIANTS[y].code)]} driveFileId={null} />);
    expectVariant(y);
    rerender(<PerShowActionableWarnings items={[warn(VARIANTS[x].code)]} driveFileId={null} />);
    expectVariant(x);
  });

  it.each([
    ["D", "B"],
    ["C", "A"],
  ] as const)("compound %s→%s: open popover unmounts with its trigger (spec §6)", (from, to) => {
    const { rerender } = render(
      <PerShowActionableWarnings items={[warn(VARIANTS[from].code)]} driveFileId={null} />,
    );
    fireEvent.click(screen.getByTestId(/per-show-actionable-help-.*-trigger/));
    expect(screen.getByTestId(/per-show-actionable-help-.*-body/).className).not.toContain(
      "hidden",
    );
    rerender(<PerShowActionableWarnings items={[warn(VARIANTS[to].code)]} driveFileId={null} />);
    expect(screen.queryByTestId(/per-show-actionable-help-.*-body/)).toBeNull();
    expect(screen.queryByTestId(/per-show-actionable-help-.*-trigger/)).toBeNull();
  });

  it("adapter source declares no animation wrappers (instant contract)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("components/admin/PerShowActionableWarnings.tsx", "utf8");
    expect(src).not.toMatch(/AnimatePresence|framer-motion|motion\./);
  });
});
