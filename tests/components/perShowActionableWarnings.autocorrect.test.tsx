// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { PerShowActionableWarnings } from "@/components/admin/PerShowActionableWarnings";
import type { ParseWarning } from "@/lib/parser/types";

// Task 8 (plan §4). The card renders the composed instance line for an autocorrect
// warning, falls back to catalog helpfulContext without `autocorrect`, and renders the
// instance line as PLAIN TEXT (no emphasis) so sheet-derived params cannot inject markup.

afterEach(cleanup);

const guidance = () => screen.getByTestId("per-show-actionable-guidance");

describe("PerShowActionableWarnings — autocorrect instance copy", () => {
  test("STAGE_WORD renders the composed instance line, not the generic catalog copy", () => {
    const items: ParseWarning[] = [
      {
        severity: "warn",
        code: "STAGE_WORD_AUTOCORRECTED",
        message: "internal",
        autocorrect: {
          subject: "Eric Weiss",
          corrections: [{ detected: "Strke", corrected: "Strike" }],
        },
      },
    ];
    render(<PerShowActionableWarnings items={items} driveFileId="df" />);
    expect(guidance().textContent).toBe("We read 'Strke' as 'Strike' in Eric Weiss's role.");
  });

  test("a warning without autocorrect falls back to catalog helpfulContext", () => {
    const items: ParseWarning[] = [
      { severity: "warn", code: "STAGE_WORD_AUTOCORRECTED", message: "internal" },
    ];
    render(<PerShowActionableWarnings items={items} driveFileId="df" />);
    // Catalog helpfulContext for STAGE_WORD begins "A stage word in this crew member's role…"
    expect(guidance().textContent).toMatch(/^A stage word in this crew member's role/);
  });

  test("injection safety: a subject containing * renders literally, no emphasis element", () => {
    const items: ParseWarning[] = [
      {
        severity: "warn",
        code: "STAGE_WORD_AUTOCORRECTED",
        message: "internal",
        autocorrect: {
          subject: "Foo *draft*",
          corrections: [{ detected: "Strke", corrected: "Strike" }],
        },
      },
    ];
    render(<PerShowActionableWarnings items={items} driveFileId="df" />);
    const node = guidance();
    // The literal asterisks survive…
    expect(node.textContent).toBe("We read 'Strke' as 'Strike' in Foo *draft*'s role.");
    // …and NO <em>/<strong> was introduced by the param (differential guard: fails if the
    // instance line is routed through renderEmphasis).
    expect(within(node).queryByRole("emphasis")).toBeNull();
    expect(node.querySelector("em, strong")).toBeNull();
  });
});
