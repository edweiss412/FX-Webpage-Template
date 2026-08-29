// @vitest-environment jsdom
/**
 * Whole-diff R2 P1: the ignore BACKEND and the report IDENTITY are two decisions, and
 * `target` was answering both.
 *
 * A LINKED row can hold a dismissal that was staged before the row gained its show, so
 * the Ignored disclosure reroutes `target` to the staged backend — correct, and the
 * repair an earlier round asked for. But `ReportButton`'s `showId` was derived from
 * that same `target`, so rerouting the ignore silently detached the report: it persists
 * with `show_id: null` against a row that HAS a show, labeled as a staged sheet with no
 * show record, and Doug is told nothing.
 *
 * The failure this pins is a report filed against the wrong thing while reporting
 * success — not a crash, which is why only a props-level assertion catches it.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ParseWarning } from "@/lib/parser/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

// Capture the identity ReportButton is actually handed, rather than asserting on
// rendered text that cannot show a null show_id.
const reportProps: Array<{ showId: string | null; surfaceId: string }> = [];
vi.mock("@/components/shared/ReportButton", () => ({
  ReportButton: (props: { showId: string | null; surfaceId: string }) => {
    reportProps.push({ showId: props.showId, surfaceId: props.surfaceId });
    return <button type="button">Report</button>;
  },
}));

vi.mock("@/app/admin/onboarding/_actions/stagedWarningIgnore", () => ({
  setStagedWarningIgnore: vi.fn(async () => ({ ok: true, state: "unignored" })),
}));

import { DataQualityWarningControls } from "@/components/admin/DataQualityWarningControls";

const SHOW_ID = "00000000-0000-0000-0000-000000000001";
const warning: ParseWarning = {
  severity: "warn",
  code: "UNKNOWN_FIELD",
  message: "m",
  rawSnippet: "Storage | x",
};

afterEach(() => {
  cleanup();
  reportProps.length = 0;
});

describe("report identity survives staged ignore routing", () => {
  test("a linked row reporting from the Ignored disclosure keeps its show id", () => {
    // The exact shape the reroute produces: the ignore goes to the staged backend
    // because that is where THIS dismissal lives, while the row itself has a show.
    render(
      <DataQualityWarningControls
        target={{ kind: "staged", wizardSessionId: "w-1", driveFileId: "df-1" }}
        reportShowId={SHOW_ID}
        warning={warning}
        driveFileId="df-1"
        mode="ignored"
        reportSurfaceId="sid-1"
      />,
    );
    expect(reportProps).toHaveLength(1);
    // Derived from the fixture, not restated: a null here is the detached report.
    expect(reportProps[0]!.showId).toBe(SHOW_ID);
  });

  test("a genuinely show-less staged row still reports with no show id", () => {
    // The other half of the partition, so the repair cannot be "always pass a show id".
    // A first-seen wizard row has no show record, and its report must say so.
    render(
      <DataQualityWarningControls
        target={{ kind: "staged", wizardSessionId: "w-1", driveFileId: "df-1" }}
        warning={warning}
        driveFileId="df-1"
        mode="ignored"
        reportSurfaceId="sid-2"
      />,
    );
    expect(reportProps).toHaveLength(1);
    expect(reportProps[0]!.showId).toBeNull();
  });

  test("a show-target row is unaffected", () => {
    render(
      <DataQualityWarningControls
        target={{ kind: "show", slug: "rpas", showId: SHOW_ID }}
        warning={warning}
        driveFileId="df-1"
        mode="active"
        reportSurfaceId="sid-3"
      />,
    );
    expect(reportProps[0]!.showId).toBe(SHOW_ID);
  });
});
