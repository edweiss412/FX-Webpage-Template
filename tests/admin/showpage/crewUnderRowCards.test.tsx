// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
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
