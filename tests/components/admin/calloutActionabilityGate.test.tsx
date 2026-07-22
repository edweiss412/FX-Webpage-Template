// tests/components/admin/calloutActionabilityGate.test.tsx
// @vitest-environment jsdom
/** Spec §3.4/§8.5. Catches: callout for a TYPO-only sheet (owner's ask), and
 *  the pre-change bug where the sourceCell conjunct suppressed it for ALL
 *  published info rows (neither info code is anchored, dataGaps.ts:370-391).
 *  Fixtures copy real emitter shapes: no sourceCell on either info code. */
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

describe("published callout actionability gate (spec §3.4)", () => {
  it("only TYPO_NORMALIZED listed: no callout", () => {
    render(<ShowReviewSurface {...buildPublishedSurfaceProps({ infoRows: [TYPO] })} />);
    expect(screen.queryByTestId(CALLOUT)).toBeNull();
  });

  it("only DAY_RESTRICTION_DOUBLE_LOCATION listed: callout renders", () => {
    render(<ShowReviewSurface {...buildPublishedSurfaceProps({ infoRows: [DOUBLE] })} />);
    expect(screen.getByTestId(CALLOUT)).toBeTruthy();
  });

  it("both listed: callout renders", () => {
    render(<ShowReviewSurface {...buildPublishedSurfaceProps({ infoRows: [TYPO, DOUBLE] })} />);
    expect(screen.getByTestId(CALLOUT)).toBeTruthy();
  });

  it("wizard (gate off) with only TYPO: callout renders unconditionally (staged contract)", () => {
    render(
      <ShowReviewSurface {...buildPublishedSurfaceProps({ infoRows: [TYPO], gateOff: true })} />,
    );
    expect(screen.getByTestId(CALLOUT)).toBeTruthy();
  });
});
