// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PerShowActionableWarnings } from "@/components/admin/PerShowActionableWarnings";
import type { ParseWarning } from "@/lib/parser/types";

// admin-show-modal Task 11: ShowsTable/StagedReviewCard are client islands that
// read the current search params (param-preserving modal hrefs) — stub the
// app-router hooks jsdom has no router for.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => cleanup());

const items: ParseWarning[] = [
  { severity: "warn", code: "UNKNOWN_FIELD", message: "m", rawSnippet: "Storage | x" },
];

describe("PerShowActionableWarnings renderItemControls", () => {
  test("AC-8: WITHOUT the prop → no controls (StagedReviewCard usage unchanged)", () => {
    render(<PerShowActionableWarnings items={items} driveFileId="df" />);
    expect(screen.queryByTestId("dq-controls")).toBeNull();
  });
  test("WITH the prop → controls rendered, receives (w, i)", () => {
    render(
      <PerShowActionableWarnings
        items={items}
        driveFileId="df"
        renderItemControls={(w, i) => <span data-testid="dq-controls">{`${w.code}#${i}`}</span>}
      />,
    );
    expect(screen.getByTestId("dq-controls").textContent).toBe("UNKNOWN_FIELD#0");
  });
});

describe("PerShowActionableWarnings — compact card placement (spec §4.2, A1)", () => {
  const unknownField: ParseWarning[] = [
    { severity: "warn", code: "UNKNOWN_FIELD", message: "m", rawSnippet: "Storage | x" },
  ];

  // Failure mode this catches: putting renderItemControls output in footerRight.
  // The live callback returns a full cluster (Report/Ignore, the use-raw radio
  // interface, the role editor), which a single-row footer cannot host. Asserting
  // only "controls exist" would pass in either placement — the ancestor is the
  // whole point (amendment A1).
  test("controls render in the controls band, NOT the footer right cluster", () => {
    render(
      <PerShowActionableWarnings
        items={unknownField}
        driveFileId="df"
        renderItemControls={() => <span data-testid="dq-controls">controls</span>}
      />,
    );
    const controls = screen.getByTestId("dq-controls");
    expect(controls.closest('[data-testid="compact-alert-controls-band"]')).not.toBeNull();
    expect(controls.closest('[data-testid="compact-alert-footer-right"]')).toBeNull();
  });

  test("controls renderer returning null → no controls band", () => {
    render(
      <PerShowActionableWarnings
        items={unknownField}
        driveFileId="df"
        renderItemControls={() => null}
      />,
    );
    expect(screen.queryByTestId("compact-alert-controls-band")).toBeNull();
  });

  // Failure mode: omitting stripe on the warning path. The shell defaults to
  // "review", so every warning card would gain a stripe the live surface never
  // had. The muted path proves nothing here — muted forces "none" internally.
  test("warning-tone cards carry NO stripe", () => {
    render(<PerShowActionableWarnings items={unknownField} driveFileId="df" />);
    const card = screen.getAllByTestId("compact-alert-card")[0]!;
    expect(card.className).not.toContain("border-l-status-review");
    expect(card.className).not.toContain("border-l-status-degraded");
  });

  // Two-input guard: a resolvable cell with no file id still yields no link, so
  // the adapter must branch on the BUILT href, never on sourceCell alone.
  test("sourceCell present with a null driveFileId → no Open in Sheet link", () => {
    const withCell: ParseWarning[] = [
      {
        severity: "warn",
        code: "UNKNOWN_FIELD",
        message: "m",
        rawSnippet: "Storage | x",
        sourceCell: { sheetName: "S", a1: "B4" } as never,
      },
    ];
    render(<PerShowActionableWarnings items={withCell} driveFileId={null} />);
    expect(screen.queryByText(/Open in Sheet/)).toBeNull();
    // With neither link nor controls there is nothing to put in a footer.
    expect(screen.queryByTestId("compact-alert-footer")).toBeNull();
  });
});
