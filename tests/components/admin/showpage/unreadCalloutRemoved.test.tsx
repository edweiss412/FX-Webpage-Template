// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/unreadCalloutRemoved.test.tsx
 * (unread-callout-dedup spec §3, Fix A — dedup / no-drop)
 *
 * Regression: the published review modal must render each unparsed
 * `raw_unrecognized` sheet row EXACTLY ONCE — as its routed UNKNOWN_FIELD card —
 * never a second time in a bottom "Content we couldn't read" callout. Every
 * assertion drives the REAL `PublishedReviewModal` at its production call-site,
 * so a re-introduced `bottomSlot` callout fails here.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";
import {
  installModalDomStubs,
  renderPublishedModal,
  unknownFieldWarn,
  type RawRow,
} from "./__fixtures__/publishedModalHarness";

// Two DISTINCT unparsed rows. `emitUnknownField` (lib/parser/warnings.ts:323)
// co-emits, per row, a `UNKNOWN_FIELD` warn AND a `raw_unrecognized` entry — so a
// real show carries both in lockstep. Each row's `block` IS its routed section id
// (crew->crew, rooms->rooms via lib/admin/step3SectionStatus.ts:22 KIND_TO_SECTION).
const RAW_ROWS: readonly RawRow[] = [
  { block: "crew", key: "Gaffer", value: "Jane Doe" },
  { block: "rooms", key: "Suite 5", value: "King bed" },
];

beforeEach(installModalDomStubs);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("PublishedReviewModal - unread-callout dedup (section 3 Fix A)", () => {
  it("test 1: renders NO 'Content we couldn't read' bottom callout", () => {
    renderPublishedModal(RAW_ROWS);
    expect(screen.queryByText(/Content we couldn't read/i)).toBeNull();
  });

  it("test 2: every raw row still surfaces exactly once, as its routed UNKNOWN_FIELD card", () => {
    renderPublishedModal(RAW_ROWS);
    // The routed card renders the row label via a dedicated testid (one per
    // UNKNOWN_FIELD card). Card-identity, not text-node counting: the multiset of
    // rendered row labels must equal the fixture's keys, with no duplication.
    const labels = screen
      .getAllByTestId("per-show-actionable-row-label-value")
      .map((el) => el.textContent?.trim())
      .sort();
    expect(labels).toEqual([...RAW_ROWS.map((r) => r.key)].sort());
  });

  it("test 3: an ignored raw row is NOT dropped, it moves to the section's Ignored disclosure", () => {
    // Ignore exactly the first row's warning (content fingerprint == the one
    // `partitionByIgnored` uses). No callout, and the ignored row survives inside
    // its section's `section-ignored-list-<id>`; the second row stays active.
    // No-drop across the ignore boundary.
    const ignoredFp = warningFingerprint(unknownFieldWarn(RAW_ROWS[0]!));
    expect(ignoredFp).not.toBeNull();
    renderPublishedModal(RAW_ROWS, { ignoredFingerprints: new Set([ignoredFp!]) });

    expect(screen.queryByText(/Content we couldn't read/i)).toBeNull();

    const labelIn = (root: HTMLElement) =>
      within(root)
        .queryAllByTestId("per-show-actionable-row-label-value")
        .map((el) => el.textContent?.trim());

    // The ignored row is in ITS section's Ignored disclosure.
    const ignoredList = screen.getByTestId(`section-ignored-list-${RAW_ROWS[0]!.block}`);
    expect(labelIn(ignoredList)).toEqual([RAW_ROWS[0]!.key]);
    // The second (active) row stays in its own section's active list.
    const activeList = screen.getByTestId(`section-warning-active-${RAW_ROWS[1]!.block}`);
    expect(labelIn(activeList)).toEqual([RAW_ROWS[1]!.key]);

    // Mount-agnostic no-drop / no-dup: every rendered label, matched to the
    // element that carries it, exactly once each — and the ignored key's single
    // occurrence lives INSIDE the Ignored disclosure (moved, not duplicated into
    // any active list). Does not assume an empty active wrapper is mounted.
    const labelEls = screen.getAllByTestId("per-show-actionable-row-label-value");
    const elsFor = (key: string) => labelEls.filter((el) => el.textContent?.trim() === key);
    expect(elsFor(RAW_ROWS[0]!.key)).toHaveLength(1);
    expect(elsFor(RAW_ROWS[1]!.key)).toHaveLength(1);
    expect(ignoredList.contains(elsFor(RAW_ROWS[0]!.key)[0]!)).toBe(true);
  });

  it("test 4: more than the 50-row callout cap all surface as cards (warnings is a superset)", () => {
    // The retired callout capped its list at RAW_UNRECOGNIZED_CAP (50). The
    // warnings surface is uncapped, so 51 distinct rows render 51 routed cards —
    // a strict superset of what the callout could ever show. Derived, not hardcoded.
    // Identity, not cardinality: the multiset of rendered labels must EQUAL the
    // fixture keys (a missing row + a duplicated row would pass a bare length check).
    const many: RawRow[] = Array.from({ length: 51 }, (_, i) => ({
      block: "crew",
      key: `Row ${i}`,
      value: `Value ${i}`,
    }));
    renderPublishedModal(many);
    expect(screen.queryByText(/Content we couldn't read/i)).toBeNull();
    const labels = screen
      .getAllByTestId("per-show-actionable-row-label-value")
      .map((el) => el.textContent?.trim())
      .sort();
    expect(labels).toEqual(many.map((r) => r.key).sort());
  });
});
