// @vitest-environment jsdom
// M12.13 Task 11 — confirm-page render states (spec §5) + the POST outcome
// rendering in place via the client form. The page is a minimal standalone
// public surface: NO admin chrome, NO help-affordance testids, Doug voice,
// catalog copy via lib/messages/lookup (invariant 5 — never raw codes).
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { messageFor } from "@/lib/messages/lookup";
import type { ConfirmUnpublishActionState } from "@/app/show/[slug]/unpublish/copy";

const getState = vi.hoisted(() => ({
  value: { state: "neutral" } as
    | { state: "neutral" }
    | { state: "infra" }
    | { state: "expired" }
    | { state: "confirm"; title: string },
  calls: [] as Array<{ slug: string; token: string | undefined; r: string | undefined }>,
}));

vi.mock("@/lib/sync/unpublishConfirmPage", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    evaluateUnpublishConfirmGet: async (args: {
      slug: string;
      token: string | undefined;
      r: string | undefined;
    }) => {
      getState.calls.push(args);
      return getState.value;
    },
  };
});

const actionMock = vi.hoisted(() => ({
  result: { status: "success", title: "Client Show" } as ConfirmUnpublishActionState,
  calls: [] as FormData[],
}));

vi.mock("@/app/show/[slug]/unpublish/actions", () => ({
  confirmUnpublishAction: async (_prev: unknown, formData: FormData) => {
    actionMock.calls.push(formData);
    return actionMock.result;
  },
}));

async function renderPage(params: { token?: string; r?: string } = { token: "tok-1", r: "r-1" }) {
  const { default: Page } = await import("@/app/show/[slug]/unpublish/page");
  const ui = await Page({
    params: Promise.resolve({ slug: "client-show" }),
    searchParams: Promise.resolve(params as Record<string, string | string[] | undefined>),
  });
  return render(ui);
}

beforeEach(() => {
  getState.value = { state: "neutral" };
  getState.calls = [];
  actionMock.result = { status: "success", title: "Client Show" };
  actionMock.calls = [];
});

afterEach(() => cleanup());

describe("GET render states", () => {
  it("confirm state: title + 'Take this show offline?' + consequence + ONE confirm button + keep-it-live line", async () => {
    getState.value = { state: "confirm", title: "Client Show" };
    const { container } = await renderPage();

    expect(screen.getByRole("heading", { name: "Take this show offline?" })).toBeInTheDocument();
    expect(screen.getByText("Client Show")).toBeInTheDocument();
    // Consequence line (spec §5: crew links switch off until republished from the admin).
    expect(
      screen.getByText(/crew links switch off until you republish it from the admin/i),
    ).toBeInTheDocument();
    // Exactly ONE button on the whole page.
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Take it offline" })).toBeInTheDocument();
    // Keep-it-live secondary line: doing nothing leaves the show live.
    expect(screen.getByText(/want to keep it live\?/i)).toBeInTheDocument();
    expect(screen.getByText(/doing nothing leaves the show live/i)).toBeInTheDocument();

    // No admin chrome and no help affordances on the public confirm page.
    expect(container.querySelector("nav")).toBeNull();
    expect(container.querySelector('[data-testid^="help-affordance--"]')).toBeNull();
    // The searchParams flow through to the evaluator.
    expect(getState.calls).toEqual([{ slug: "client-show", token: "tok-1", r: "r-1" }]);
  });

  it("neutral state: no-oracle copy, NO confirm button, no show title leak", async () => {
    getState.value = { state: "neutral" };
    await renderPage();
    expect(
      screen.getByRole("heading", { name: /we couldn.t open this link/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/nothing has changed/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText("Client Show")).toBeNull();
  });

  it("expired state: UNPUBLISH_TOKEN_EXPIRED catalog copy WITHOUT the raw code", async () => {
    getState.value = { state: "expired" };
    const { container } = await renderPage();
    const entry = messageFor("UNPUBLISH_TOKEN_EXPIRED");
    expect(screen.getByText(entry.dougFacing as string)).toBeInTheDocument();
    expect(container.textContent).not.toContain("UNPUBLISH_TOKEN_EXPIRED");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("infra state: the exact retry copy, and NEVER the neutral/expired states (R5)", async () => {
    getState.value = { state: "infra" };
    const { container } = await renderPage();
    expect(
      screen.getByText(
        "We couldn't check this link just now. Nothing has changed — try again in a minute.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/we couldn.t open this link/i)).toBeNull();
    const expiredCopy = messageFor("UNPUBLISH_TOKEN_EXPIRED").dougFacing as string;
    expect(container.textContent).not.toContain(expiredCopy);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("array-valued searchParams are treated as absent (guard condition) → neutral", async () => {
    getState.value = { state: "confirm", title: "Client Show" };
    const { default: Page } = await import("@/app/show/[slug]/unpublish/page");
    const ui = await Page({
      params: Promise.resolve({ slug: "client-show" }),
      searchParams: Promise.resolve({ token: ["a", "b"], r: "r-1" } as Record<
        string,
        string | string[] | undefined
      >),
    });
    render(ui);
    // The evaluator receives undefined for the array param and owns the
    // neutral decision (step 1).
    expect(getState.calls).toEqual([{ slug: "client-show", token: undefined, r: "r-1" }]);
  });
});

describe("POST outcome rendering in place (client form + mocked server action)", () => {
  async function renderConfirmAndSubmit() {
    getState.value = { state: "confirm", title: "Client Show" };
    const utils = await renderPage();
    const button = screen.getByRole("button", { name: "Take it offline" });
    button.click();
    return utils;
  }

  it("success: '<title> is now offline' with bold title + plain admin per-show href; confirm form gone", async () => {
    actionMock.result = { status: "success", title: "Client Show" };
    await renderConfirmAndSubmit();
    await waitFor(() => {
      expect(screen.getByText(/is now offline/i)).toBeInTheDocument();
    });
    const strong = screen.getByText("Client Show");
    expect(strong.tagName).toBe("STRONG");
    expect(
      screen.getByText(
        /crew links are switched off; you can publish it again any time from the admin/i,
      ),
    ).toBeInTheDocument();
    const adminLink = screen.getByRole("link", { name: /open it in the admin/i });
    expect(adminLink).toHaveAttribute("href", "/admin/show/client-show");
    expect(screen.queryByRole("button")).toBeNull();
    // The form payload carried token + r through (R9: POST re-validation input).
    expect(actionMock.calls).toHaveLength(1);
    expect(actionMock.calls[0]!.get("token")).toBe("tok-1");
    expect(actionMock.calls[0]!.get("r")).toBe("r-1");
    expect(actionMock.calls[0]!.get("slug")).toBe("client-show");
  });

  it("expired: catalog copy renders in place without the raw code", async () => {
    const entry = messageFor("UNPUBLISH_TOKEN_EXPIRED");
    actionMock.result = { status: "expired", title: entry.title, body: entry.dougFacing as string };
    const { container } = await renderConfirmAndSubmit();
    await waitFor(() => {
      expect(screen.getByText(entry.dougFacing as string)).toBeInTheDocument();
    });
    expect(container.textContent).not.toContain("UNPUBLISH_TOKEN_EXPIRED");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("neutral (incl. consumed/double-submit): the no-oracle copy renders in place — CONSUMED copy NEVER appears", async () => {
    actionMock.result = { status: "neutral" };
    const { container } = await renderConfirmAndSubmit();
    await waitFor(() => {
      expect(screen.getByText(/we couldn.t open this link/i)).toBeInTheDocument();
    });
    const consumedCopy = messageFor("UNPUBLISH_TOKEN_CONSUMED").dougFacing as string;
    expect(container.textContent).not.toContain(consumedCopy);
    expect(container.textContent).not.toContain("UNPUBLISH_TOKEN_CONSUMED");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("infra: the retry copy renders in place and the form STAYS available for the retry", async () => {
    actionMock.result = { status: "infra" };
    await renderConfirmAndSubmit();
    await waitFor(() => {
      expect(
        screen.getByText(
          "We couldn't check this link just now. Nothing has changed — try again in a minute.",
        ),
      ).toBeInTheDocument();
    });
    // Retryable: the confirm button must still be present (transient fault).
    expect(screen.getByRole("button", { name: "Take it offline" })).toBeInTheDocument();
  });
});
