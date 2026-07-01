// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CardReportTrigger } from "@/components/crew/primitives/CardReportTrigger";

const SHOW_ID = "11111111-1111-1111-1111-111111111111";
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ ok: true, status: "created" }), { status: 201 }),
  );
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CardReportTrigger", () => {
  it("renders a recessive report trigger with an accessible label", () => {
    render(<CardReportTrigger cardId="today-dress" region="dress" showId={SHOW_ID} />);
    const btn = screen.getByRole("button", { name: /report a problem with this card/i });
    expect(btn.getAttribute("data-slot")).toBe("card-report-trigger");
  });

  it("files a crew report stamped with fieldRef {cardId, region}", async () => {
    render(<CardReportTrigger cardId="today-dress" region="dress" showId={SHOW_ID} />);
    fireEvent.click(screen.getByTestId("card-report-trigger"));
    fireEvent.change(screen.getByTestId("report-modal-textarea"), {
      target: { value: "wrong link" },
    });
    fireEvent.click(screen.getByTestId("report-modal-submit"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toMatchObject({
      surface: "crew",
      show_id: SHOW_ID,
      fieldRef: { cardId: "today-dress", region: "dress" },
    });
  });

  it("honors an admin-preview cardReport: admin surface + crewPreview alongside fieldRef", async () => {
    const cardReport = {
      surface: "admin" as const,
      surfaceIdScope: "admin-preview-card",
      extraContext: { crewPreview: { crewMemberId: "c1", name: "Jo", role: "A1" } },
    };
    render(
      <CardReportTrigger
        cardId="venue-where"
        region="venue"
        showId={SHOW_ID}
        cardReport={cardReport}
      />,
    );
    fireEvent.click(screen.getByTestId("card-report-trigger"));
    fireEvent.change(screen.getByTestId("report-modal-textarea"), { target: { value: "x" } });
    fireEvent.click(screen.getByTestId("report-modal-submit"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body).toMatchObject({
      surface: "admin",
      fieldRef: { cardId: "venue-where", region: "venue" },
      crewPreview: { crewMemberId: "c1", name: "Jo", role: "A1" },
    });
  });

  it("scopes sessionStorage by surfaceIdScope + cardId + showId", () => {
    render(<CardReportTrigger cardId="today-dress" region="dress" showId={SHOW_ID} />);
    fireEvent.click(screen.getByTestId("card-report-trigger"));
    fireEvent.change(screen.getByTestId("report-modal-textarea"), { target: { value: "draft" } });
    expect(
      JSON.parse(sessionStorage.getItem(`fxav-report-attempt-crew-card-today-dress-${SHOW_ID}`)!)
        .draft,
    ).toBe("draft");
  });

  it("renders nothing when showId is empty (defense-in-depth)", () => {
    const { container } = render(
      <CardReportTrigger cardId="today-dress" region="dress" showId="" />,
    );
    expect(container.querySelector('[data-slot="card-report-trigger"]')).toBeNull();
  });
});
