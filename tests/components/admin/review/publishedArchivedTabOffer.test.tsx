// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import {
  PublishedArchivedTabOffer,
  PublishedArchivedTabIncludedNote,
} from "@/components/admin/review/PublishedArchivedTabOffer";

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

beforeEach(() => {
  refresh.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const base = { slug: "s1", driveFileId: "d1", wire: null, canMutate: true };

describe("PublishedArchivedTabOffer (P2)", () => {
  it("renders the tab name and Include/Skip when canMutate", () => {
    render(<PublishedArchivedTabOffer {...base} tabName="OLD PULL SHEET" />);
    expect(screen.getByText("OLD PULL SHEET")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Include this gear" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
  });

  it("hides actions when not mutable (read-only, archived/unpublished/null-drive)", () => {
    render(<PublishedArchivedTabOffer {...base} canMutate={false} tabName="OLD" />);
    expect(screen.queryByRole("button", { name: "Include this gear" })).not.toBeInTheDocument();
  });

  it("Include POSTs the RAW tab name + wire snapshot and refreshes on success", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(200, { ok: true, status: "override_set", sync: { ok: true, kind: "applied" } }),
    );
    render(
      <PublishedArchivedTabOffer
        {...base}
        wire={{ tabName: "a", fingerprint: "b" }}
        tabName="  OLD  "
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Include this gear" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    const init = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]![1] as { body: string };
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      driveFileId: "d1",
      tabName: "  OLD  ",
      expectedOverrideSnapshot: { tabName: "a", fingerprint: "b" },
    });
  });

  it("Skip collapses the card and calls onDismissFocus", () => {
    const onDismissFocus = vi.fn();
    render(<PublishedArchivedTabOffer {...base} tabName="OLD" onDismissFocus={onDismissFocus} />);
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.queryByTestId("published-archived-tab-offer")).not.toBeInTheDocument();
    expect(onDismissFocus).toHaveBeenCalledTimes(1);
  });

  it("stale_review 409 shows the stale line AND auto-refreshes", async () => {
    vi.stubGlobal("fetch", mockFetch(409, { ok: false, status: "stale_review" }));
    render(<PublishedArchivedTabOffer {...base} tabName="OLD" />);
    fireEvent.click(screen.getByRole("button", { name: "Include this gear" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "This changed elsewhere. Refreshing to the latest state.",
      ),
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("lifecycle_conflict 409 shows its own line and does NOT auto-refresh", async () => {
    vi.stubGlobal("fetch", mockFetch(409, { ok: false, status: "lifecycle_conflict" }));
    render(<PublishedArchivedTabOffer {...base} tabName="OLD" />);
    fireEvent.click(screen.getByRole("button", { name: "Include this gear" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "This show is no longer editable here. Refresh to see its current state.",
      ),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("no_pull_sheet_region 422 shows its own line, no refresh", async () => {
    vi.stubGlobal("fetch", mockFetch(422, { ok: false, status: "no_pull_sheet_region" }));
    render(<PublishedArchivedTabOffer {...base} tabName="OLD" />);
    fireEvent.click(screen.getByRole("button", { name: "Include this gear" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "That tab is no longer in the sheet. Re-check the sheet, then try again.",
      ),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("unrecognized status / non-JSON → generic line", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("html");
        },
      })) as never,
    );
    render(<PublishedArchivedTabOffer {...base} tabName="OLD" />);
    fireEvent.click(screen.getByRole("button", { name: "Include this gear" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Something went wrong on our side. Try again in a moment.",
      ),
    );
  });

  it("success with a failed sync shows the transient partial-success line before refresh", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(200, { ok: true, status: "override_set", sync: { ok: false, kind: "stage" } }),
    );
    render(<PublishedArchivedTabOffer {...base} tabName="OLD" />);
    fireEvent.click(screen.getByRole("button", { name: "Include this gear" }));
    await waitFor(() =>
      expect(
        screen.getByText(
          "Saved. This change is held for review, so gear appears after that review is applied.",
        ),
      ).toBeInTheDocument(),
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("PublishedArchivedTabIncludedNote (P3)", () => {
  it("names the tab and offers Undo when mutable", () => {
    render(
      <PublishedArchivedTabIncludedNote {...base} wire={{ tabName: "OLD X", fingerprint: "fp" }} />,
    );
    expect(screen.getByText("OLD X")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  it("uses a generic label when the stored tab name is null or empty", () => {
    const { rerender } = render(
      <PublishedArchivedTabIncludedNote {...base} wire={{ tabName: null, fingerprint: "fp" }} />,
    );
    expect(screen.getByText("an archived tab")).toBeInTheDocument();
    rerender(
      <PublishedArchivedTabIncludedNote {...base} wire={{ tabName: "", fingerprint: "fp" }} />,
    );
    expect(screen.getByText("an archived tab")).toBeInTheDocument();
  });

  it("renders read-only (no Undo) when not mutable", () => {
    render(
      <PublishedArchivedTabIncludedNote
        {...base}
        canMutate={false}
        wire={{ tabName: "OLD X", fingerprint: "fp" }}
      />,
    );
    expect(screen.getByText("OLD X")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("Undo POSTs the revoke body (tabName null) with the wire snapshot", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(200, { ok: true, status: "override_cleared", sync: { ok: true, kind: "applied" } }),
    );
    render(
      <PublishedArchivedTabIncludedNote {...base} wire={{ tabName: "OLD X", fingerprint: "fp" }} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    const init = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]![1] as { body: string };
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      driveFileId: "d1",
      tabName: null,
      expectedOverrideSnapshot: { tabName: "OLD X", fingerprint: "fp" },
    });
  });
});
