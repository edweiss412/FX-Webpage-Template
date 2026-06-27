// @vitest-environment jsdom
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PerShowActionableWarnings } from "@/components/admin/PerShowActionableWarnings";
import type { ParseWarning } from "@/lib/parser/types";

afterEach(() => cleanup());

const dfid = "drivefile123";

describe("PerShowActionableWarnings", () => {
  it("renders the catalog TITLE for UNKNOWN_ROLE_TOKEN, never the raw code", () => {
    const ws: ParseWarning[] = [
      {
        severity: "warn",
        code: "UNKNOWN_ROLE_TOKEN",
        message: "Unknown role token: 'WIDGET'",
        sourceCell: { title: "INFO", gid: 0, a1: "C3" },
      },
    ];
    const { container } = render(<PerShowActionableWarnings warnings={ws} driveFileId={dfid} />);
    expect(screen.getByText("Role we didn't recognize")).toBeTruthy();
    expect(container.textContent).not.toContain("UNKNOWN_ROLE_TOKEN");
  });

  it("renders an Open-in-Sheet link to the resolved cell when sourceCell present", () => {
    const ws: ParseWarning[] = [
      { severity: "warn", code: "UNKNOWN_ROLE_TOKEN", message: "x", sourceCell: { title: "INFO", gid: 0, a1: "C3" } },
    ];
    render(<PerShowActionableWarnings warnings={ws} driveFileId={dfid} />);
    const link = screen.getByRole("link", { name: /open in sheet/i });
    expect(link.getAttribute("href")).toContain("range=C3");
  });

  it("renders no link when sourceCell is absent", () => {
    const ws: ParseWarning[] = [{ severity: "warn", code: "UNKNOWN_ROLE_TOKEN", message: "x" }];
    render(<PerShowActionableWarnings warnings={ws} driveFileId={dfid} />);
    expect(screen.queryByRole("link", { name: /open in sheet/i })).toBeNull();
  });

  it("renders nothing when there are no operator-actionable warnings", () => {
    const { container } = render(<PerShowActionableWarnings warnings={[]} driveFileId={dfid} />);
    expect(container.firstChild).toBeNull();
  });
});
