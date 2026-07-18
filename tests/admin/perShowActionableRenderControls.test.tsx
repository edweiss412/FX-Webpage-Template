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
