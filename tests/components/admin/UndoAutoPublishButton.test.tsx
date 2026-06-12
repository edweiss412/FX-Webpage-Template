// @vitest-environment jsdom
/**
 * tests/components/admin/UndoAutoPublishButton.test.tsx (M12.13 Task 12)
 *
 * The shared in-app "Undo auto-publish" client island (spec §6.2/§6.3), consumed
 * by BOTH the per-show footer and the SHOW_FIRST_PUBLISHED alert row so copy /
 * behavior cannot drift. Contract:
 *  - <form action={dispatch}> + useActionState; the submit disables on `pending`
 *    ONLY — never a synchronous onClick self-disable (the React 19 form-action
 *    dispatch-cancel trap).
 *  - success outcome → no error/retry panel (the page revalidation flips the
 *    show into its Archived presentation; both undo affordances disappear).
 *  - consumed/expired → catalog copy via ErrorExplainer (NO raw code — invariant 5).
 *  - infra_error → a plain-language RETRY state (no raw code, no crash).
 *  - instant appear/disappear — no motion library / presence wrapper.
 */
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { UndoAutoPublishButton } from "@/components/admin/UndoAutoPublishButton";

afterEach(cleanup);

function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

it("submits inside a <form action={...}> and is not pre-disabled at rest", () => {
  const action = vi.fn();
  render(<UndoAutoPublishButton slug="rpas" undoAction={action} />);
  const btn = screen.getByRole("button", { name: /undo auto-publish/i });
  expect(btn.closest("form")).not.toBeNull();
  expect(btn).not.toBeDisabled();
});

it("success outcome → no error/retry panel rendered", async () => {
  const undoAction = vi.fn().mockResolvedValue({ outcome: "success" });
  render(<UndoAutoPublishButton slug="rpas" undoAction={undoAction} />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /undo auto-publish/i }));
  });
  expect(screen.queryByTestId("undo-auto-publish-result")).toBeNull();
  expect(screen.queryByTestId("undo-auto-publish-retry")).toBeNull();
});

it("consumed outcome → catalog copy via ErrorExplainer, no raw code (invariant 5)", async () => {
  const undoAction = vi.fn().mockResolvedValue({ outcome: "consumed" });
  render(<UndoAutoPublishButton slug="rpas" undoAction={undoAction} />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /undo auto-publish/i }));
  });
  expect(await screen.findByTestId("undo-auto-publish-result")).toBeInTheDocument();
  expect(screen.getByText(/already been used/i)).toBeInTheDocument();
  expect(screen.queryByText("UNPUBLISH_TOKEN_CONSUMED")).toBeNull();
});

it("expired outcome → catalog copy via ErrorExplainer, no raw code", async () => {
  const undoAction = vi.fn().mockResolvedValue({ outcome: "expired" });
  render(<UndoAutoPublishButton slug="rpas" undoAction={undoAction} />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /undo auto-publish/i }));
  });
  expect(await screen.findByTestId("undo-auto-publish-result")).toBeInTheDocument();
  expect(screen.getByText(/expired/i)).toBeInTheDocument();
  expect(screen.queryByText("UNPUBLISH_TOKEN_EXPIRED")).toBeNull();
});

it("infra_error outcome → plain-language retry state, no raw code", async () => {
  const undoAction = vi.fn().mockResolvedValue({ outcome: "infra_error" });
  render(<UndoAutoPublishButton slug="rpas" undoAction={undoAction} />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /undo auto-publish/i }));
  });
  expect(await screen.findByTestId("undo-auto-publish-retry")).toBeInTheDocument();
  expect(screen.queryByText("infra_error")).toBeNull();
});

it("is instant — no motion library / presence wrapper (transition-audit class)", () => {
  const s = src("components/admin/UndoAutoPublishButton.tsx");
  expect(s).not.toMatch(/framer-motion|motion\/react/);
  expect(s).not.toMatch(/AnimatePresence/);
});
