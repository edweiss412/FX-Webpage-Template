// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import {
  PerShowActionableWarnings,
  withControlsNote,
} from "@/components/admin/PerShowActionableWarnings";
import type { ParseWarning } from "@/lib/parser/types";
import type { SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";
import { EXPECTED_CONTROLS_NOTE } from "@/tests/messages/warningCardCopyRegistry";

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

describe("controlsNote renders only beside the controls (spec 2026-08-27 §4.3)", () => {
  const w: ParseWarning = {
    severity: "warn",
    code: "UNKNOWN_FIELD",
    message: "m",
    rawSnippet: "Backdrop | ",
    blockRef: { kind: "timestamp", name: "Backdrop" },
  };
  const NOTE = EXPECTED_CONTROLS_NOTE.UNKNOWN_FIELD!;

  /** Anti-tautology: strip the controls node FIRST, so the Report button's own label
   *  cannot satisfy an assertion about the guidance line. Proved load-bearing by a
   *  pre-dispatch mutant that moved the note INTO the button label: the assertion goes
   *  red, as it must. */
  function guidanceText(container: HTMLElement): string {
    const clone = container.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[data-testid="dq-controls"]').forEach((n) => n.remove());
    return clone.querySelector('[data-testid="per-show-actionable-guidance"]')?.textContent ?? "";
  }

  test("active list (showControlsNote): the guidance line ends with the note", () => {
    expect(typeof NOTE).toBe("string");
    const { container } = render(
      <PerShowActionableWarnings
        items={[w]}
        driveFileId="df"
        showControlsNote
        renderItemControls={() => <span data-testid="dq-controls">Report Ignore</span>}
      />,
    );
    expect(guidanceText(container).endsWith(NOTE)).toBe(true);
  });

  test("the PROP is the gate, not the render-prop's return: undefined / false / '' change nothing", () => {
    // React renders undefined, false and "" as NOTHING, so "returned a non-null node" is
    // not evidence a control is on the card. The mount's promise is the prop.
    expect(typeof NOTE).toBe("string");
    for (const ret of [undefined, false, ""] as const) {
      const { container, unmount } = render(
        <PerShowActionableWarnings
          items={[w]}
          driveFileId="df"
          showControlsNote
          renderItemControls={() => ret}
        />,
      );
      expect(guidanceText(container).endsWith(NOTE)).toBe(true);
      unmount();
    }
  });

  test("ignored list (item controls, no showControlsNote): no note, so Ignore is never named beside Un-ignore", () => {
    expect(typeof NOTE).toBe("string");
    const { container } = render(
      <PerShowActionableWarnings
        items={[w]}
        driveFileId="df"
        renderItemControls={() => <span data-testid="dq-controls">Report Un-ignore</span>}
      />,
    );
    expect(/\b(Report|Ignore)\b/.test(guidanceText(container))).toBe(false);
  });

  test("without the prop (staged card, gallery, any mount that promises no controls), the note is absent", () => {
    expect(typeof NOTE).toBe("string");
    const { container } = render(<PerShowActionableWarnings items={[w]} driveFileId="df" />);
    const text = guidanceText(container);
    expect(text.length).toBeGreaterThan(0);
    expect(text.includes(NOTE)).toBe(false);
    expect(/\b(Report|Ignore)\b/.test(text)).toBe(false);
  });
});

describe("withControlsNote: spec §4.3's guard table, without a render", () => {
  // The export exists FOR this - it was exported and then only ever called internally,
  // which the impeccable audit caught: a docstring promising unit-testability with no
  // unit test. Each row is one line of the §4.3 table.
  test("catalog guidance + note composes; the note is last", () => {
    expect(withControlsNote({ kind: "catalog", markup: "Guidance." }, "Note.")).toEqual({
      kind: "catalog",
      markup: "Guidance. Note.",
    });
  });

  test("a null note leaves the guidance untouched, object and all", () => {
    const g = { kind: "catalog", markup: "Guidance." } as const;
    expect(withControlsNote(g, null)).toBe(g);
  });

  test("an INSTANCE line is returned unchanged: the note is a catalog-guidance affordance", () => {
    const g = { kind: "instance", text: "We read Stage in place of Stge." } as const;
    expect(withControlsNote(g, "Note.")).toBe(g);
  });

  test("null catalog guidance + a note renders the note alone", () => {
    expect(withControlsNote({ kind: "catalog", markup: null }, "Note.")).toEqual({
      kind: "catalog",
      markup: "Note.",
    });
  });

  test("null guidance and a blank note collapse to null, never an empty string", () => {
    // The fallback the audit flagged as unreachable from the component (which pre-trims):
    // reachable HERE, which is what makes stating it worthwhile.
    expect(withControlsNote({ kind: "catalog", markup: null }, "   ")).toEqual({
      kind: "catalog",
      markup: null,
    });
  });
});

// Spec docs/superpowers/specs/2026-08-29-ref-error-cell-anchors-design.md §3, §5 T6.
// The published card's half of the cell line: same guard, the surface's own band idiom.
describe("PerShowActionableWarnings — the Sheet cell line (spec §3)", () => {
  const refWarning = (sourceCell: SourceAnchor | null): ParseWarning =>
    ({
      severity: "warn",
      code: "REF_ERROR_LITERAL",
      message: "m",
      blockRef: { kind: "section" },
      rawSnippet: "\\#REF\\!",
      sourceCell,
    }) as ParseWarning;

  test("scope cell: the band names the coordinate, with the value in its own mono span", () => {
    render(
      <PerShowActionableWarnings
        items={[refWarning({ title: "VENUE", gid: 5, a1: "A1", scope: "cell" })]}
        driveFileId="df"
      />,
    );
    const band = screen.getByTestId("per-show-actionable-cell");
    // Clone and strip the deep link before reading the band: its href also carries the a1.
    expect(band.querySelector("a")).toBeNull();
    expect(band.textContent).toContain("Sheet cell");
    expect(screen.getByTestId("per-show-actionable-cell-value").textContent).toBe("VENUE!A1");
  });

  test("scope cell renders in condensed mode too (the coordinate IS the row's identity)", () => {
    render(
      <PerShowActionableWarnings
        items={[refWarning({ title: "VENUE", gid: 5, a1: "A1", scope: "cell" })]}
        driveFileId="df"
        condensed
      />,
    );
    expect(screen.getByTestId("per-show-actionable-cell-value").textContent).toBe("VENUE!A1");
  });

  // bl-orch ruling 2026-08-29 (impeccable audit P2): same paste-able-reference rule as the
  // wizard twin, so one coordinate is never spelled two ways across the two surfaces.
  test.each([
    ["a spaced tab is quoted", "PULL SHEET", "'PULL SHEET'!A1"],
    ["an apostrophe is doubled inside the quotes", "Doug's Tab", "'Doug''s Tab'!A1"],
    ["an ordinary tab stays bare", "VENUE", "VENUE!A1"],
  ])("%s", (_label, title, expected) => {
    render(
      <PerShowActionableWarnings
        items={[refWarning({ title, gid: 5, a1: "A1", scope: "cell" })]}
        driveFileId="df"
      />,
    );
    expect(screen.getByTestId("per-show-actionable-cell-value").textContent).toBe(expected);
  });

  test.each([
    ["scope tab", { title: "VENUE", gid: 5, scope: "tab" as const }],
    ["null", null],
    ["unscoped region range", { title: "INFO", gid: 0, a1: "A1:C3" }],
    ["scoped range", { title: "INFO", gid: 0, a1: "A1:C3", scope: "cell" as const }],
    ["blank a1", { title: "VENUE", gid: 5, a1: "  ", scope: "cell" as const }],
    ["blank title", { title: " ", gid: 5, a1: "A1", scope: "cell" as const }],
  ])("no cell band for %s", (_label, sc) => {
    render(<PerShowActionableWarnings items={[refWarning(sc)]} driveFileId="df" />);
    // Premise: the card itself is mounted, so the absence below is the BAND's, not the list's.
    expect(screen.queryAllByText(/#REF!/).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("per-show-actionable-cell")).toBeNull();
  });

  test("UNKNOWN_FIELD with a Sheet row label renders the label and never the cell band", () => {
    render(
      <PerShowActionableWarnings
        items={[
          {
            severity: "warn",
            code: "UNKNOWN_FIELD",
            message: "m",
            blockRef: { kind: "crew", name: "Backdrop" },
            rawSnippet: "Backdrop | v",
            sourceCell: { title: "INFO", gid: 0, a1: "C4", scope: "cell" },
          } as ParseWarning,
        ]}
        driveFileId="df"
      />,
    );
    expect(screen.getByTestId("per-show-actionable-row-label-value").textContent).toBe("Backdrop");
    // rowLabel wins: dropping the `rowLabel === null` conjunct fails here.
    expect(screen.queryByTestId("per-show-actionable-cell")).toBeNull();
  });
});
