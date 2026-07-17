// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ArchivedTabOffer } from "@/components/admin/wizard/archivedTabOffer";
import type { ArchivedPullSheetTab } from "@/lib/drive/exportSheetToMarkdown";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const tab: ArchivedPullSheetTab = {
  tabName: "OLD gear",
  headerPreviews: ["CASE A"],
  fingerprint: "fp1",
  included: false,
  contentChangedSinceAccept: false,
};

describe("ArchivedTabOffer showDismiss", () => {
  it("omits 'Keep skipped' when showDismiss=false", () => {
    render(<ArchivedTabOffer dfid="d1" wizardSessionId="s1" tab={tab} showDismiss={false} />);
    // getByRole throws if absent → presence assertion.
    expect(screen.getByRole("button", { name: "Use this show’s gear" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Keep skipped" })).toBeNull();
  });

  it("renders 'Keep skipped' by default (Pack-list contract)", () => {
    render(<ArchivedTabOffer dfid="d1" wizardSessionId="s1" tab={tab} onDismissFocus={() => {}} />);
    expect(screen.getByRole("button", { name: "Keep skipped" })).toBeTruthy();
  });

  it("uses a custom testId when provided", () => {
    render(
      <ArchivedTabOffer
        dfid="d1"
        wizardSessionId="s1"
        tab={tab}
        showDismiss={false}
        testId="box-offer-1"
      />,
    );
    expect(screen.getByTestId("box-offer-1")).toBeTruthy();
  });
});
