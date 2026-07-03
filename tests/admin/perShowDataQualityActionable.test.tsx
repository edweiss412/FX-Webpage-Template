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
    const { container } = render(<PerShowActionableWarnings items={ws} driveFileId={dfid} />);
    expect(screen.getByText("Role we didn't recognize")).toBeTruthy();
    expect(container.textContent).not.toContain("UNKNOWN_ROLE_TOKEN");
  });

  it("renders an Open-in-Sheet link to the resolved cell when sourceCell present", () => {
    const ws: ParseWarning[] = [
      {
        severity: "warn",
        code: "UNKNOWN_ROLE_TOKEN",
        message: "x",
        sourceCell: { title: "INFO", gid: 0, a1: "C3" },
      },
    ];
    render(<PerShowActionableWarnings items={ws} driveFileId={dfid} />);
    const link = screen.getByRole("link", { name: /open in sheet/i });
    expect(link.getAttribute("href")).toContain("range=C3");
  });

  it("renders no link when sourceCell is absent", () => {
    const ws: ParseWarning[] = [{ severity: "warn", code: "UNKNOWN_ROLE_TOKEN", message: "x" }];
    render(<PerShowActionableWarnings items={ws} driveFileId={dfid} />);
    expect(screen.queryByRole("link", { name: /open in sheet/i })).toBeNull();
  });

  it("renders nothing when there are no operator-actionable warnings", () => {
    const { container } = render(<PerShowActionableWarnings items={[]} driveFileId={dfid} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("PerShowActionableWarnings — row label (Part A)", () => {
  it("renders the row label from rawSnippet under the title", () => {
    const items: ParseWarning[] = [
      {
        code: "UNKNOWN_FIELD",
        severity: "warn",
        message: "x",
        rawSnippet: "GS Podium Type | (2) Acrylic",
      },
    ];
    render(<PerShowActionableWarnings items={items} driveFileId="d1" />);
    expect(screen.getByTestId("per-show-actionable-row-label").textContent).toBe("GS Podium Type");
  });

  // audit idx46/#217: the `<label> | <value>` rawSnippet contract holds ONLY for
  // UNKNOWN_FIELD (lib/parser/warnings.ts emitUnknownField). Other
  // OPERATOR_ACTIONABLE_ANCHORED codes — PULL_SHEET_AMBIGUOUS_FORMAT /
  // PULL_SHEET_PARSE_PARTIAL — carry a RAW pipe-delimited markdown ROW as
  // rawSnippet, so labelFromRawSnippet would render a garbled first-`|`-cell as a
  // fake field label. The muted row-label must be gated to UNKNOWN_FIELD.
  it("does NOT derive a row label from a PULL_SHEET pipe-delimited rawSnippet; the UNKNOWN_FIELD control still labels", () => {
    const items: ParseWarning[] = [
      {
        code: "PULL_SHEET_AMBIGUOUS_FORMAT",
        severity: "warn",
        message: "Pull sheet case has rows with unexpected column count",
        // A raw pipe-delimited markdown ROW, NOT a `<label> | <value>` pair.
        rawSnippet: "12 | Audio | Mics | Shure SM58 | TRUE",
      },
      {
        code: "UNKNOWN_FIELD",
        severity: "warn",
        message: "x",
        rawSnippet: "GS Podium Type | (2) Acrylic",
      },
    ];
    render(<PerShowActionableWarnings items={items} driveFileId="d1" />);
    const labels = screen.queryAllByTestId("per-show-actionable-row-label");
    // Only the UNKNOWN_FIELD row yields a muted label; the PULL_SHEET row yields none.
    expect(labels).toHaveLength(1);
    expect(labels[0]?.textContent).toBe("GS Podium Type");
    // The garbled first-cell fragment ("12") must NEVER appear as a row label.
    expect(labels.some((l) => l.textContent === "12")).toBe(false);
  });

  it("does NOT derive a row label from a PULL_SHEET_PARSE_PARTIAL pipe row", () => {
    const items: ParseWarning[] = [
      {
        code: "PULL_SHEET_PARSE_PARTIAL",
        severity: "warn",
        message: "row preserved with qty:null and rawSnippet",
        rawSnippet: "abc | Lighting | Fixtures | Source Four | FALSE",
      },
    ];
    render(<PerShowActionableWarnings items={items} driveFileId="d1" />);
    expect(screen.queryByTestId("per-show-actionable-row-label")).toBeNull();
  });
});
