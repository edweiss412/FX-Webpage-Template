// @vitest-environment jsdom
/**
 * tests/components/admin/PublishShowButton.test.tsx (M12.2 Phase B2 Task 7.3)
 *
 * One-tap Publish control (spec §2.4). Contract:
 *   - a single [Publish] type=submit button; one tap dispatches the bound
 *     action exactly once (Publish is non-destructive — no two-tap).
 *   - disables on useFormStatus().pending ONLY (React 19 dispatch safety).
 *   - on success → router.refresh() (the page re-renders into the live
 *     presentation; share/rotate controls return, gated published && !archived).
 *   - a PUBLISH_BLOCKED_PENDING_REVIEW result → renders the §12.4 catalog copy
 *     via messageFor() (NOT a raw code) + a Re-sync affordance (the clearing
 *     path). Anti-tautology: assert the rendered copy matches the catalog
 *     dougFacing for that code, sourced from the catalog, not a hardcoded string.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => "/admin/show/rpas",
}));

import { PublishShowButton } from "@/components/admin/PublishShowButton";
import { messageFor } from "@/lib/messages/lookup";

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("PublishShowButton — one-tap, blocked-review surface (Task 7.3)", () => {
  it("one tap dispatches the action exactly once and refreshes on success", async () => {
    const action = vi.fn(async () => ({ ok: true }) as const);
    const { getByTestId } = render(<PublishShowButton publishAction={action} slug="rpas" />);

    expect((getByTestId("publish-show-button") as HTMLButtonElement).type).toBe("submit");

    await act(async () => {
      fireEvent.click(getByTestId("publish-show-button"));
    });

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("PUBLISH_BLOCKED_PENDING_REVIEW → renders the catalog copy via messageFor + a Re-sync affordance", async () => {
    const action = vi.fn(
      async () => ({ ok: false, code: "PUBLISH_BLOCKED_PENDING_REVIEW" }) as const,
    );
    const { getByTestId } = render(<PublishShowButton publishAction={action} slug="rpas" />);

    await act(async () => {
      fireEvent.click(getByTestId("publish-show-button"));
    });

    const blocked = await waitFor(() => getByTestId("publish-show-blocked"));
    const expected = messageFor("PUBLISH_BLOCKED_PENDING_REVIEW").dougFacing ?? "";
    expect(expected.length).toBeGreaterThan(0);
    expect(blocked.textContent).toContain(expected);
    // The clearing path: a Re-sync affordance is offered (ReSyncButton).
    expect(getByTestId("admin-resync-button")).not.toBeNull();
    // refresh is NOT called on a blocked result (the show stays Held).
    expect(refresh).not.toHaveBeenCalled();
  });
});
