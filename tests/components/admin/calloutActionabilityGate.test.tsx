// tests/components/admin/calloutActionabilityGate.test.tsx
// @vitest-environment jsdom
/** warning-trim un-defer spec §4 (the popup wins): the published surface RETIRES
 *  the correction-loop callout outright — the sentence now lives in every card's
 *  and note's `?` popover. The old §3.4 actionability gate (callout when a listed
 *  info row invited a correction) is superseded: published mode NEVER renders the
 *  callout, regardless of which info codes are listed; the wizard keeps it
 *  unconditionally (staged contract). Fixtures copy real emitter shapes: no
 *  sourceCell on either info code. */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/show/polish-fixture-show",
  useSearchParams: () => new URLSearchParams(),
}));

import { buildPublishedSurfaceProps } from "@/tests/helpers/publishedSurfaceProps";
import { ShowReviewSurface } from "@/components/admin/review/ShowReviewSurface";
import type { ParseWarning } from "@/lib/parser/types";

afterEach(cleanup);

const TYPO: ParseWarning = {
  severity: "info",
  code: "TYPO_NORMALIZED",
  message: "Typo alias 'venu' normalized to canonical 'venue'",
  blockRef: { kind: "venue" },
  rawSnippet: "venu",
} as ParseWarning;
const DOUBLE: ParseWarning = {
  severity: "info",
  code: "DAY_RESTRICTION_DOUBLE_LOCATION",
  message: "Day restriction paren+ONLY found in both name and role cells; preferring role cell.",
  rawSnippet: "name: A (SAT ONLY) | role: Tech (SAT ONLY)",
} as ParseWarning;

const CALLOUT = "correction-loop-callout";

describe("published callout retired (spec §4 — the popup wins)", () => {
  it("only TYPO_NORMALIZED listed: no callout", () => {
    render(<ShowReviewSurface {...buildPublishedSurfaceProps({ infoRows: [TYPO] })} />);
    expect(screen.queryByTestId(CALLOUT)).toBeNull();
  });

  it("only DAY_RESTRICTION_DOUBLE_LOCATION listed: still no callout (actionability gate retired)", () => {
    render(<ShowReviewSurface {...buildPublishedSurfaceProps({ infoRows: [DOUBLE] })} />);
    expect(screen.queryByTestId(CALLOUT)).toBeNull();
  });

  it("both listed: still no callout on the published surface", () => {
    render(<ShowReviewSurface {...buildPublishedSurfaceProps({ infoRows: [TYPO, DOUBLE] })} />);
    expect(screen.queryByTestId(CALLOUT)).toBeNull();
  });

  it("wizard (gate off) with only TYPO: callout renders unconditionally (staged contract)", () => {
    render(
      <ShowReviewSurface {...buildPublishedSurfaceProps({ infoRows: [TYPO], gateOff: true })} />,
    );
    expect(screen.getByTestId(CALLOUT)).toBeTruthy();
  });
});
