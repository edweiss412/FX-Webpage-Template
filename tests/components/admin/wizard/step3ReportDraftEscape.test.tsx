// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/step3ReportDraftEscape.test.tsx
 * (BL-WIZARD-REPORT-DRAFT-LOST-ON-ESCAPE — arc fix/wizard-report-draft-escape)
 *
 * PROBE + PIN. The wizard review modal renders through ReviewModalShell
 * (Step3ReviewModal.tsx:480) passing no `onEscapeCapture`, so the shell's key
 * handler falls through to `requestClose()` unconditionally
 * (ReviewModalShell.tsx:261-262). `ReportIssueSection` holds its draft in
 * mount-local `useState` — the pre-repair shape of `ReportIssueSection`'s draft
 * state, which now restores from storage at `step3ReviewSections.tsx:4737` — so the
 * modal unmount
 * that follows takes a half-typed report message with it.
 *
 * This file carried a PROBE block alongside the PIN while the row was being
 * diagnosed: it characterised the broken behaviour exactly (Escape closes, the
 * reopened textarea is empty) and it passed on `main`, which is how the defect
 * was shown to be real rather than asserted in prose. It FLIPPED the moment the
 * repair landed and was deleted then, as its own docblock said it would be. It
 * is described here so a later reader knows the pin below was written against a
 * demonstrated defect. The probe lives on in the arc history at `b230ccb9d`.
 *
 * What remains is the PIN, written FORK-NEUTRAL because three repairs were on
 * the table when it was authored (silent draft persistence; a layered Escape
 * dismissing the engaged disclosure before the dialog; a confirm prompt) and
 * Eric had not yet picked one. They disagree about what Escape DOES, so no
 * single strict assertion covers all three. What all three agree on is the
 * defect boundary: ONE Escape must not destroy typed text with no signal and no
 * way back. That is a disjunction over two observables, and it discriminated
 * when it was written because BOTH DISJUNCTS WERE FALSE. Fork (a) shipped, so
 * today it is the second disjunct that holds: the modal still closes on the
 * first Escape, and the draft is recoverable on reopen. Keeping the neutral
 * form is deliberate. It states the operator-facing contract rather than the
 * mechanism, so a later arc that revisits Escape semantics (the §3.5 layered
 * shape, say) inherits a test that still means what it says.
 *
 * Anti-tautology: the draft text is read back off the textarea the component
 * itself renders, via the dfid-scoped testid, and the typed value is a local
 * const compared by identity — a test that rendered an empty textarea and an
 * empty expectation could not pass. `onClose` is the consumer-owned unmount
 * (Step3ReviewModal.tsx:480 passes it straight to the shell), so calling it is
 * exactly "the modal closed"; the harness performs the real unmount rather
 * than trusting the spy, because a spy alone cannot show what the REMOUNT sees.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";

// RescanSheetButton (mounted in the modal footer) calls useRouter().refresh().
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import {
  DURATION_NORMAL_FALLBACK_MS,
  EXIT_FALLBACK_BUFFER_MS,
} from "@/components/admin/review/ReviewModalShell";
import { Step3ReviewModal } from "@/components/admin/wizard/Step3ReviewModal";
import {
  buildStagedSectionData,
  type StagedSectionData,
} from "@/components/admin/review/sectionData";
import { buildParseResult, stagedRow } from "./_step3ReviewFixture";
import type { ParseResult } from "@/lib/parser/types";

const DFID = "drive-abc-123";
const WSID = "00000000-1111-4222-8333-444444444444";

/** The one textarea in components/admin (step3ReviewSections.tsx:4888). */
const TEXTAREA = `wizard-step3-card-${DFID}-report-textarea`;
const TOGGLE = `wizard-step3-card-${DFID}-report-toggle`;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

function sectionData(prOverrides: Partial<ParseResult> = {}): StagedSectionData {
  const pr = buildParseResult(prOverrides);
  return buildStagedSectionData({
    pr,
    row: stagedRow(pr),
    dfid: DFID,
    wizardSessionId: WSID,
    crewMembers: pr.crewMembers,
    rooms: pr.rooms,
    hotels: pr.hotelReservations,
    pullSheet: pr.pullSheet ?? [],
    archivedPullSheetTabs: pr.archivedPullSheetTabs ?? [],
    pullSheetOverride: null,
    ros: pr.runOfShow ?? {},
    warnings: pr.warnings,
    agendaBaseline: [],
    useRawDecisions: [],
  });
}

function renderModal(onClose: () => void) {
  return render(
    <Step3ReviewModal
      data={sectionData()}
      checked={false}
      isDirtyRescan={false}
      onRequestSetChecked={vi.fn(async () => true)}
      onClose={onClose}
    />,
  );
}

/** Expand the report disclosure and type `text` into its textarea. */
async function typeDraft(q: ReturnType<typeof render>, text: string) {
  fireEvent.click(q.getByTestId(TOGGLE));
  const textarea = q.getByTestId(TEXTAREA) as HTMLTextAreaElement;
  await waitFor(() => expect(document.activeElement).toBe(textarea));
  fireEvent.change(textarea, { target: { value: text } });
  expect((q.getByTestId(TEXTAREA) as HTMLTextAreaElement).value).toBe(text);
}

/** A real Escape, dispatched at the focused element the way the browser does.
 *  The shell listens on `document` in the bubble phase, so this reaches it. */
function pressEscape() {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
}

describe("PIN — one Escape must not silently destroy a typed report draft", () => {
  test("after one Escape the draft is EITHER still on screen OR recoverable on reopen", async () => {
    const onClose = vi.fn();
    const q = renderModal(onClose);
    const typed = "the crew list is missing two people";
    await typeDraft(q, typed);

    pressEscape();
    // A modal that is merely MID-EXIT is not a modal that stayed open, and the
    // first draft of this test could not tell them apart: a 50ms sleep expired
    // inside the exit animation, `onClose` had not fired yet, and the still-
    // painted textarea satisfied the "stayed open" disjunct on the very tree
    // that was about to be destroyed. So wait out the shell's whole fallback
    // window (its own exported constants, never restated as literals) and only
    // then read the spy.
    await act(async () => {
      await new Promise((r) =>
        setTimeout(r, DURATION_NORMAL_FALLBACK_MS + EXIT_FALLBACK_BUFFER_MS + 50),
      );
    });
    const stayedOpen = onClose.mock.calls.length === 0;

    let recoveredOnReopen = false;
    if (!stayedOpen) {
      act(() => q.unmount());
      const q2 = renderModal(vi.fn());
      fireEvent.click(q2.getByTestId(TOGGLE));
      recoveredOnReopen = (q2.getByTestId(TEXTAREA) as HTMLTextAreaElement).value === typed;
    } else {
      // Still open: the text must genuinely still be there, not merely unclosed.
      expect((q.getByTestId(TEXTAREA) as HTMLTextAreaElement).value).toBe(typed);
    }

    expect(
      stayedOpen || recoveredOnReopen,
      "one Escape both closed the modal and lost the typed draft, with no prompt and no way back",
    ).toBe(true);
  });
});
