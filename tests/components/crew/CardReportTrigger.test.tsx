// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CardReportTrigger } from "@/components/shared/CardReportTrigger";

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

  // CARDREPORT-1: icon-only trigger gets a ≥44×44 tap target via a transparent
  // centered ::before overlay, grown in one direction only.
  it("default (up): the <button> is a positioned host with a bottom-anchored 44x44 overlay", () => {
    const { container } = render(
      <CardReportTrigger cardId="today-dress" region="dress" showId={SHOW_ID} />,
    );
    const c = container.querySelector('button[data-slot="card-report-trigger"]')!.getAttribute("class")!;
    // Failure mode: missing overlay (14px target), or wrong grow-edge (down-bleed
    // into interactive rows below a SectionCard).
    expect(c).toContain("relative");
    expect(c).toContain("before:absolute");
    expect(c).toContain("before:w-tap-min");
    expect(c).toContain("before:h-tap-min");
    expect(c).toContain("before:left-1/2");
    expect(c).toContain("before:-translate-x-1/2");
    expect(c).toContain("before:bottom-0");
    expect(c).not.toContain("before:top-0");
  });

  it("down: 44x44 overlay is top-anchored", () => {
    const { container } = render(
      <CardReportTrigger cardId="today-dress" region="dress" showId={SHOW_ID} hitDirection="down" />,
    );
    const c = container.querySelector('button[data-slot="card-report-trigger"]')!.getAttribute("class")!;
    expect(c).toContain("before:top-0");
    expect(c).not.toContain("before:bottom-0");
  });
});
