// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/step3CardJudgmentWiring.test.tsx (Task 9 — spec §7.3a)
 *
 * WIRING-PROOF ONLY. Proves Step3SheetCard's card-face `needsLook` derivation is
 * wired to the extracted non-ambiguity partition (nonAmbiguityGapTotal), NOT the
 * raw gap total. Asserts EXCLUSIVELY about the EXISTING two-state chrome the card
 * already ships:
 *   - needs-look chrome = `border-border-strong` article border + a "Review" trigger
 *   - plain chrome      = `border-border` article border + a "View" trigger
 *
 * An ambiguity-only row must FALL OFF the old needs-look chrome (→ plain/View);
 * a non-ambiguity gap row must KEEP it (→ border-strong/Review). This test makes
 * NO assertion about any NEW judgment variant/copy — that chrome is Task 11's
 * red→green and must stay unimplemented here.
 *
 * Concrete failure mode pinned: the card selecting needs-look chrome for a row
 * whose only warnings are ambiguity (judgment) codes.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Step3SheetCard } from "@/components/admin/wizard/Step3SheetCard";
import { type Step3Row } from "@/components/admin/wizard/Step3Review";
import type { ParseResult, ParseWarning } from "@/lib/parser/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/onboarding",
}));

const WSID = "11111111-1111-1111-1111-111111111111";
const AMBIGUITY_GAP = "ROOM_HEADER_SPLIT_AMBIGUOUS"; // ambiguity code AND gap class
const NON_AMBIGUITY_GAP = "FIELD_UNREADABLE"; // gap class, not ambiguity

const w = (code: string): ParseWarning => ({ severity: "warn", code, message: code });

function cardRow(dfid: string, warnings: ParseWarning[]): Step3Row {
  return {
    driveFileId: dfid,
    driveFileName: `${dfid}.gsheet`,
    status: "staged",
    parseResult: { show: { title: "Wiring Show" }, warnings } as unknown as ParseResult,
  };
}

afterEach(() => cleanup());

describe("Step3SheetCard needsLook wiring (spec §7.3a)", () => {
  test("ambiguity-only row → plain chrome (NOT needs-look): border-border, View trigger", () => {
    const dfid = "drive-ambiguity-only";
    const { getByTestId } = render(
      <Step3SheetCard row={cardRow(dfid, [w(AMBIGUITY_GAP)])} wizardSessionId={WSID} />,
    );
    const article = getByTestId(`wizard-step3-card-${dfid}`);
    // The OLD needs-look border must NOT be selected for an ambiguity-only row.
    expect(article.classList.contains("border-border-strong")).toBe(false);
    expect(article.classList.contains("border-border")).toBe(true);
    // …and the trigger falls back to the ghost "View" (not the "Review" affordance).
    expect(getByTestId(`wizard-step3-card-${dfid}-more`).textContent).toBe("View");
  });

  test("non-ambiguity gap row → needs-look chrome IS selected: border-border-strong, Review trigger", () => {
    const dfid = "drive-nonambiguity-gap";
    const { getByTestId } = render(
      <Step3SheetCard row={cardRow(dfid, [w(NON_AMBIGUITY_GAP)])} wizardSessionId={WSID} />,
    );
    const article = getByTestId(`wizard-step3-card-${dfid}`);
    expect(article.classList.contains("border-border-strong")).toBe(true);
    expect(getByTestId(`wizard-step3-card-${dfid}-more`).textContent).toBe("Review");
  });
});
