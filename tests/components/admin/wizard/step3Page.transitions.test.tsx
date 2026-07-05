// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/step3Page.transitions.test.tsx
 *
 * Transition audit for the Variant B Step-3 page shell (spec §8). This redesign
 * introduces NO framer-motion / AnimatePresence — every new conditional is a
 * deliberately-instant mount/unmount or class swap. This suite:
 *   (a) pins the deliberately-instant conditionals (summary/bar guards, card
 *       variant swap, panelPlacement, count flip, bar Back), and
 *   (b) proves — at the SOURCE level — that none of the six changed/created shell
 *       components import an animation library (a self-satisfying innerHTML check
 *       is impossible: AnimatePresence emits no DOM marker).
 *
 * Compound: the card's read-only Review modal stays reachable while a publish is
 * ACTUALLY RUNNING (independent surfaces, no shared animation gate).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { ParseResult } from "@/lib/parser/types";
import { FINALIZE_STREAM_CONTENT_TYPE } from "@/lib/onboarding/finalizeProgress";
import { Step3SheetCard } from "@/components/admin/wizard/Step3SheetCard";
import { FinalizeButton } from "@/components/admin/FinalizeButton";
import { Step3ReviewWithFinalize } from "@/components/admin/wizard/Step3ReviewWithFinalize";
import type { Step3Row } from "@/components/admin/wizard/Step3Review";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/",
}));

const WSID = "33333333-3333-4333-8333-333333333333";
const DFID = "drive-txn-1";

function pr(title = "Txn Show"): ParseResult {
  return { show: { title }, warnings: [] } as unknown as ParseResult;
}
function stagedRow(dfid: string, status: "staged" | "applied" = "staged"): Step3Row {
  return { driveFileId: dfid, driveFileName: `${dfid}.gsheet`, status, parseResult: pr(dfid) };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── Source-level no-animation guard ────────────────────────────────────────
// The repo DOES use framer elsewhere (PageTransition, RightNow, Gallery), so this
// guard is scoped to the SIX shell files this redesign touched. A regression that
// adds an animation library to any of them fails this.
test("no changed/created Step-3 shell component imports framer-motion/AnimatePresence (deliberately instant)", () => {
  const files = [
    "components/admin/wizard/Step3SheetCard.tsx",
    "components/admin/wizard/Step3Review.tsx",
    "components/admin/wizard/Step3ReviewWithFinalize.tsx",
    "components/admin/wizard/WizardFooter.tsx",
    "components/admin/FinalizeButton.tsx",
    "components/admin/OnboardingWizard.tsx",
  ];
  for (const f of files) {
    const src = readFileSync(join(process.cwd(), f), "utf8");
    expect(src, `${f} must not use framer-motion/AnimatePresence`).not.toMatch(
      /framer-motion|AnimatePresence/,
    );
  }
});

describe("Step-3 page — deliberately-instant conditionals (§8)", () => {
  test("T8-a: checkbox flip updates the bar count instantly, tabular-nums (no layout shift)", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ status: "approved" }), { status: 200 })),
    );
    const { getByTestId } = render(
      <Step3ReviewWithFinalize
        wizardSessionId={WSID}
        rows={[stagedRow("a", "staged")]}
        finishable
        initialPublishCount={0}
        initialUncheckedCleanCount={1}
      />,
    );
    const count = getByTestId("wizard-step3-publish-count");
    expect(count.className).toContain("tabular-nums"); // no digit-width jitter
    expect(count.textContent).toContain("0 of 1 selected to publish");
    // Toggling the box optimistically flips the count with no async wait (instant).
    fireEvent.click(getByTestId("wizard-step3-checkbox-a"));
    expect(count.textContent).toContain("1 of 1 selected to publish");
  });

  test("T8-c: summary + footer are guarded on rows.length (instant mount/unmount)", () => {
    const full = render(
      <Step3ReviewWithFinalize
        wizardSessionId={WSID}
        rows={[stagedRow("a", "staged")]}
        finishable
        initialPublishCount={0}
        initialUncheckedCleanCount={1}
      />,
    );
    expect(full.getByTestId("wizard-step3-summary")).toBeTruthy();
    expect(full.getByTestId("wizard-footer")).toBeTruthy();
    cleanup();
    const empty = render(
      <Step3ReviewWithFinalize
        wizardSessionId={WSID}
        rows={[]}
        finishable
        initialPublishCount={0}
        initialUncheckedCleanCount={0}
      />,
    );
    expect(empty.queryByTestId("wizard-step3-summary")).toBeNull();
    expect(empty.queryByTestId("wizard-footer")).toBeNull();
    expect(empty.getByTestId("wizard-step3-empty")).toBeTruthy();
  });

  test("T8-d: card variants (selectable / demoted / no-details) swap instantly, no anim wrapper", () => {
    const cases: Array<[Step3Row, (q: ReturnType<typeof render>) => Element | null]> = [
      [stagedRow(DFID), (q) => q.getByTestId(`wizard-step3-card-${DFID}-more`)],
      [
        { ...stagedRow(DFID), lastFinalizeFailureCode: "RESCAN_REVIEW_REQUIRED" },
        (q) => q.getByTestId(`wizard-step3-rescan-review-${DFID}`),
      ],
      [
        { driveFileId: DFID, driveFileName: "x.sheet", status: "staged", parseResult: null },
        (q) => q.getByTestId(`wizard-step3-card-${DFID}`),
      ],
    ];
    for (const [row, marker] of cases) {
      const q = render(<Step3SheetCard row={row} wizardSessionId={WSID} />);
      expect(marker(q)).toBeTruthy(); // correct variant DOM (instant swap)
      cleanup();
    }
  });

  test("T8-e: the bar renders its own Back (→ ?step=2), instantly present with the bar", () => {
    const { getByTestId } = render(
      <Step3ReviewWithFinalize
        wizardSessionId={WSID}
        rows={[stagedRow("a", "staged")]}
        finishable
        initialPublishCount={0}
        initialUncheckedCleanCount={1}
      />,
    );
    expect(getByTestId("wizard-step3-back").getAttribute("href")).toBe("/admin?step=2");
  });

  test("T8-f: FinalizeButton panelPlacement='above' reorders via flex-col-reverse only (no enter/exit animation)", () => {
    const { getByTestId } = render(
      <FinalizeButton
        wizardSessionId={WSID}
        publishCount={0}
        uncheckedCleanCount={0}
        panelPlacement="above"
      />,
    );
    expect(getByTestId("wizard-finalize").className).toContain("flex-col-reverse");
  });
});

// A 200 NDJSON response that emits one "listed" event and NEVER sends a terminal
// "result" / closes → FinalizeButton enters `running` and stays there.
function hangingFinalizeResponse(): Response {
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(JSON.stringify({ type: "listed", total: 1 }) + "\n"));
      // no result, no close → the reader awaits forever, state = running
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": FINALIZE_STREAM_CONTENT_TYPE },
  });
}

describe("Step-3 page — compound (§8)", () => {
  test("T8-b: card modal is reachable while a publish is ACTUALLY RUNNING (independent surfaces)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => hangingFinalizeResponse()),
    );
    // one applied row → clicking Publish runs the loop directly (no soft-confirm).
    const q = render(
      <Step3ReviewWithFinalize
        wizardSessionId={WSID}
        rows={[stagedRow("a", "applied")]}
        finishable
        initialPublishCount={1}
        initialUncheckedCleanCount={0}
      />,
    );
    fireEvent.click(q.getByTestId("wizard-finalize-button"));
    // FinalizeButton is now in `running` (its progress panel is mounted).
    await waitFor(() => expect(q.getByTestId("wizard-finalize-progress")).toBeTruthy());
    // The card's Review/View button is STILL enabled mid-publish and opens the modal.
    const more = q.getByTestId("wizard-step3-card-a-more") as HTMLButtonElement;
    expect(more.disabled).toBe(false);
    fireEvent.click(more);
    await waitFor(() => expect(q.getByRole("dialog")).toBeTruthy());
  });
});
