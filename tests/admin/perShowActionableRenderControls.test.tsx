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

// ── warning-card-copy-restore (spec 2026-07-20-warning-card-copy-restore §3.3/§5) ──
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { warningCardCopyFields } from "@/components/admin/PerShowActionableWarnings";

const unknownFieldWarning: ParseWarning = {
  severity: "warn",
  code: "UNKNOWN_FIELD",
  message: "m",
  rawSnippet: "Storage | x",
};

describe("warningCardCopyFields guard matrix (spec §5)", () => {
  test.each([
    [null, null, null],
    [{ helpfulContext: null, triggerContext: null }, null, null],
    [{ helpfulContext: "", triggerContext: "" }, null, null],
    [{ helpfulContext: "   ", triggerContext: "   " }, null, null],
    [{}, null, null], // both fields absent
    [{ helpfulContext: "guide", triggerContext: "trig" }, "guide", "trig"],
    [{ helpfulContext: "guide", triggerContext: null }, "guide", null], // variant B: independent
    [{ helpfulContext: "guide" }, "guide", null], // variant B, trigger field absent
    [{ helpfulContext: null, triggerContext: "trig" }, null, "trig"], // variant C: independent
    [{ helpfulContext: "   ", triggerContext: "trig" }, null, "trig"], // whitespace-mixed
  ])("entry %j → guidance %j trigger %j", (entry, guidance, trigger) => {
    expect(warningCardCopyFields(entry as never)).toEqual({ guidance, trigger });
  });
});

describe("inline guidance line + trigger-context popover (spec §3.3)", () => {
  test("renders condensed helpfulContext as the guidance line", () => {
    render(<PerShowActionableWarnings items={[unknownFieldWarning]} driveFileId={null} />);
    const guidance = screen.getByTestId("per-show-actionable-guidance");
    expect(guidance.textContent).toBe(MESSAGE_CATALOG.UNKNOWN_FIELD.helpfulContext);
    expect(guidance.className).toContain("text-warning-text");
  });

  test("muted tone guidance carries text-text-subtle", () => {
    render(
      <PerShowActionableWarnings items={[unknownFieldWarning]} driveFileId={null} tone="muted" />,
    );
    expect(screen.getByTestId("per-show-actionable-guidance").className).toContain(
      "text-text-subtle",
    );
  });

  test("popover body renders triggerContext, scoped to the -body element, not helpfulContext", () => {
    render(<PerShowActionableWarnings items={[unknownFieldWarning]} driveFileId={null} />);
    const body = screen.getByTestId(/per-show-actionable-help-.*-body/);
    expect(body.textContent).toContain(MESSAGE_CATALOG.UNKNOWN_FIELD.triggerContext);
    expect(body.textContent).not.toContain(MESSAGE_CATALOG.UNKNOWN_FIELD.helpfulContext);
  });

  test("unknown code: no guidance node, no trigger, title falls back to human message", () => {
    render(
      <PerShowActionableWarnings
        items={[{ ...unknownFieldWarning, code: "NOT_A_CODE", message: "human text" }]}
        driveFileId={null}
      />,
    );
    expect(screen.queryByTestId("per-show-actionable-guidance")).toBeNull();
    expect(screen.queryByTestId(/per-show-actionable-help-.*-trigger/)).toBeNull();
    expect(screen.getByTestId("per-show-actionable-title").textContent).toBe("human text");
  });
});
