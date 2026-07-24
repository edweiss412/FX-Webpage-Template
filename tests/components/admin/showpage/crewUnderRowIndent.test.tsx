// tests/components/admin/showpage/crewUnderRowIndent.test.tsx
// @vitest-environment jsdom
/** Spec 2026-07-23-crewwarn-underrow-polish §2: every under-row node is wrapped in
 *  a pl-6 indent div at PER-NODE granularity (cap + "N more" count operate per
 *  warning), and the cards render CONDENSED (no inline catalog guidance). Failure
 *  modes: one wrapper around all nodes (cap collapses to 1), indent applied to the
 *  stack (banners would indent too), full-copy under-row cards. */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The rendered card controls (DataQualityWarningControls) call useRouter.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/show/indent-fixture",
  useSearchParams: () => new URLSearchParams(),
}));

import { renderCrewUnderRowCards } from "@/components/admin/showpage/sectionWarningExtras";
import { buildSectionWarningModel } from "@/lib/admin/sectionWarningModel";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import type { ParseWarning } from "@/lib/parser/types";

afterEach(cleanup);

const warn = (index: number, snippet: string): ParseWarning => ({
  severity: "warn",
  code: "FIELD_UNREADABLE",
  message: `Crew phone could not be read (${snippet})`,
  rawSnippet: snippet,
  blockRef: { kind: "crew", index, name: "Alice Anders" },
});

function nodesFor(warnings: ParseWarning[]) {
  const bySection = buildSectionWarningModel({
    slug: "s",
    warnings,
    ignoredFingerprints: new Set(),
    renderedSectionIds: new Set<SectionId>(["crew"]),
  });
  return renderCrewUnderRowCards({
    model: bySection.crew,
    published: { slug: "s", showId: "x", driveFileId: null, useRawDecisions: [] },
    renderedKeys: new Set(["alice anders"]),
  });
}

describe("under-row node shape (spec §2)", () => {
  it("one pl-6 wrapper per warning; cards condensed", () => {
    const map = nodesFor([warn(0, "N/A"), warn(1, "nope"), warn(2, "??")]);
    const nodes = map.get("alice anders")!;
    expect(nodes).toHaveLength(3);
    render(<div data-testid="host">{nodes}</div>);
    const host = screen.getByTestId("host");
    // Outermost element of EACH node is the indent wrapper.
    const wrappers = Array.from(host.children);
    expect(wrappers).toHaveLength(3);
    for (const w of wrappers) {
      expect(w.tagName).toBe("DIV");
      expect(w.className).toBe("pl-6");
    }
    // Condensed: FIELD_UNREADABLE's catalog guidance does not render inline.
    expect(screen.queryAllByTestId("per-show-actionable-guidance")).toHaveLength(0);
  });
});
