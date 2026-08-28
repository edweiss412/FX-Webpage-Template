// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// This file used to assert only on the returned Map; the mount-binding case below RENDERS
// the node, and the card's controls read the app router.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));
import { EXPECTED_CONTROLS_NOTE } from "@/tests/messages/warningCardCopyRegistry";
import { renderCrewUnderRowCards } from "@/components/admin/showpage/sectionWarningExtras";
import type { SectionWarningItem } from "@/lib/admin/sectionWarningModel";
import type { ParseWarning } from "@/lib/parser/types";

// Task 5b (plan §5.4). renderCrewUnderRowCards places cards ONLY for rendered crew keys;
// over-cap / unmatched keys are omitted (they stay in the section group as fallback) —
// the conservation split.

const item = (subject: string): SectionWarningItem => ({
  warning: {
    severity: "warn",
    code: "STAGE_WORD_AUTOCORRECTED",
    message: "m",
    autocorrect: { subject, corrections: [{ detected: "Strke", corrected: "Strike" }] },
  } as ParseWarning,
  reportSurfaceId: `rs-${subject}`,
});

const published = { slug: "s", showId: "show", driveFileId: "df", useRawDecisions: [] };

describe("renderCrewUnderRowCards — rendered-key split", () => {
  const model = {
    warningsByCrewKey: {
      "eric weiss": [item("Eric Weiss")],
      "carl fenton": [item("Carl Fenton")],
    },
  };

  it("renders cards only for keys in renderedKeys", () => {
    const map = renderCrewUnderRowCards({
      model,
      published,
      renderedKeys: new Set(["eric weiss"]), // Carl is over-cap / not rendered
    });
    expect([...map.keys()]).toEqual(["eric weiss"]);
    expect(map.get("eric weiss")).toHaveLength(1);
  });

  it("emits ONE node per warning (card-granular, so the row-host cap counts cards)", () => {
    // whole-diff HIGH: a member with 3 warnings must yield 3 nodes, not 1 wrapper node,
    // or the cap and 'N more' operate at wrapper granularity.
    const multi = {
      warningsByCrewKey: {
        "eric weiss": [item("Eric Weiss"), item("Eric Weiss"), item("Eric Weiss")],
      },
    };
    const map = renderCrewUnderRowCards({
      model: multi,
      published,
      renderedKeys: new Set(["eric weiss"]),
    });
    expect(map.get("eric weiss")).toHaveLength(3);
  });

  it("empty when no keys are rendered", () => {
    const map = renderCrewUnderRowCards({ model, published, renderedKeys: new Set() });
    expect(map.size).toBe(0);
  });

  it("empty when the model is undefined", () => {
    const map = renderCrewUnderRowCards({
      model: undefined,
      published,
      renderedKeys: new Set(["eric weiss"]),
    });
    expect(map.size).toBe(0);
  });
});

describe("the crew under-row mount passes showControlsNote (spec 2026-08-27 §4.3, T6(e))", () => {
  const NOTE = EXPECTED_CONTROLS_NOTE.UNKNOWN_FIELD!;
  const unknownField = (subject: string): SectionWarningItem => ({
    warning: {
      severity: "warn",
      code: "UNKNOWN_FIELD",
      message: "m",
      rawSnippet: "Backdrop | ",
      blockRef: { kind: "timestamp", name: "Backdrop" },
    } as ParseWarning,
    reportSurfaceId: `rs-${subject}`,
  });

  it("an active UNKNOWN_FIELD under a crew row ends its guidance with the controls note", () => {
    expect(typeof NOTE).toBe("string");
    const map = renderCrewUnderRowCards({
      model: { warningsByCrewKey: { "eric weiss": [unknownField("Eric Weiss")] } },
      published,
      renderedKeys: new Set(["eric weiss"]),
    });
    const nodes = map.get("eric weiss");
    expect(nodes).toHaveLength(1);
    render(<>{nodes}</>);
    // This mount is CONDENSED, so the catalog guidance (note included) is routed into the
    // `?` popover BODY, which hoverhelp-smart-position portals OUT of the card subtree -
    // read it document-wide, as tests/components/admin/perShowActionableFollowUp.test.tsx
    // does. Anti-tautology: strip the controls node first, so the Report button's own
    // label cannot satisfy an assertion about the guidance copy.
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[data-testid="dq-controls"]').forEach((n) => n.remove());
    expect(clone.textContent ?? "").toContain(NOTE);
  });
});
