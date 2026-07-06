// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/Step3ActiveRunFreeze.test.tsx (Phase 2 Task 2.4 — spec §4.4 R8)
 *
 * While a publish/resume run is active, EVERY row mutator freezes: the publish
 * checkbox, Select-all, row Re-scan, inline blocking controls (Retry/Defer/
 * Ignore), Review→, and the folded modal's Approve/Re-scan/Ignore. Rendered
 * through <Step3Review isPublishRunActive> so the production thread is exercised.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ParseResult, TriggeredReviewItem } from "@/lib/parser/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/onboarding",
}));

import { Step3Review, type Step3Row } from "@/components/admin/wizard/Step3Review";
import { buildParseResult } from "./_step3ReviewFixture";

const WSID = "11111111-1111-1111-1111-111111111111";
const mi6 = {
  id: "mi6-1",
  invariant: "MI-6",
  section: "schedule",
} as unknown as TriggeredReviewItem;

const CLEAN = "drive-clean";
const HARD = "drive-hard";
const REAPPLY = "drive-reapply";

function cleanRow(): Step3Row {
  return {
    driveFileId: CLEAN,
    driveFileName: "Clean.gsheet",
    status: "staged",
    parseResult: buildParseResult({}) as unknown as ParseResult,
    displayState: "ready",
  };
}
function hardRow(): Step3Row {
  return {
    driveFileId: HARD,
    driveFileName: "Hard.gsheet",
    status: "hard_failed",
    pendingIngestionId: "ing-1",
    errorCode: "PARSE_HARD_FAIL",
    displayState: "needs_review_other",
  };
}
function reapplyRow(): Step3Row {
  const pr = buildParseResult({}) as unknown as ParseResult;
  return {
    driveFileId: REAPPLY,
    driveFileName: "Reapply.gsheet",
    status: "staged",
    parseResult: pr,
    lastFinalizeFailureCode: "RESCAN_REVIEW_REQUIRED",
    displayState: "needs_review_reapply",
    stagedId: "staged-reapply",
    triggeredReviewItems: [mi6],
    reviewItemsCorrupt: false,
  };
}

afterEach(() => cleanup());

function isDisabled(el: Element | null): boolean {
  return el !== null && (el as HTMLInputElement | HTMLButtonElement).disabled === true;
}

describe("Step-3 active-run freeze (spec §4.4 R8)", () => {
  test("publish checkbox + Select-all freeze", () => {
    render(<Step3Review wizardSessionId={WSID} rows={[cleanRow()]} isPublishRunActive />);
    expect(isDisabled(screen.getByTestId(`wizard-step3-checkbox-${CLEAN}`))).toBe(true);
    expect(isDisabled(screen.getByTestId("wizard-step3-select-all"))).toBe(true);
  });

  test("inline blocking controls (Retry/Defer/Ignore) freeze", () => {
    render(<Step3Review wizardSessionId={WSID} rows={[hardRow()]} isPublishRunActive />);
    expect(isDisabled(screen.getByTestId(`wizard-step3-retry-${HARD}`))).toBe(true);
    expect(isDisabled(screen.getByTestId(`wizard-step3-defer-${HARD}`))).toBe(true);
    expect(isDisabled(screen.getByTestId(`wizard-step3-ignore-${HARD}`))).toBe(true);
  });

  test("the re-apply modal's Approve / Re-scan / Ignore freeze", () => {
    render(<Step3Review wizardSessionId={WSID} rows={[reapplyRow()]} isPublishRunActive />);
    fireEvent.click(screen.getByTestId(`wizard-step3-card-${REAPPLY}-more`));
    expect(isDisabled(screen.getByRole("button", { name: /approve & apply/i }))).toBe(true);
    expect(isDisabled(screen.getByRole("button", { name: /re-scan this sheet/i }))).toBe(true);
    expect(isDisabled(screen.getByRole("button", { name: /ignore this sheet/i }))).toBe(true);
  });

  test("regression: with NO active run, the same controls are ENABLED", () => {
    render(<Step3Review wizardSessionId={WSID} rows={[cleanRow(), hardRow()]} />);
    expect(isDisabled(screen.getByTestId(`wizard-step3-checkbox-${CLEAN}`))).toBe(false);
    expect(isDisabled(screen.getByTestId(`wizard-step3-retry-${HARD}`))).toBe(false);
  });
});
