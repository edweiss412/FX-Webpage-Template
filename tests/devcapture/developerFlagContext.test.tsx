// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

afterEach(cleanup);
import {
  DeveloperFlagProvider,
  useViewerIsDeveloper,
} from "@/components/admin/dev/DeveloperFlagContext";

function Probe() {
  return <span data-testid="flag">{String(useViewerIsDeveloper())}</span>;
}

describe("DeveloperFlagContext", () => {
  it("defaults false without a provider", () => {
    render(<Probe />);
    expect(screen.getByTestId("flag").textContent).toBe("false");
  });
  it("provides true", () => {
    render(
      <DeveloperFlagProvider viewerIsDeveloper={true}>
        <Probe />
      </DeveloperFlagProvider>,
    );
    expect(screen.getByTestId("flag").textContent).toBe("true");
  });
});
