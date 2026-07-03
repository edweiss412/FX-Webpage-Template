// @vitest-environment jsdom
/**
 * tests/components/admin/PublishedToggle.test.tsx (published-toggle plan Task 8)
 *
 * The persistent Published switch in Share & access (spec §3.3). Mode boundaries
 * (archived pages never MOUNT the component — pinned at the page level in
 * per-show-lifecycle.test.tsx):
 *   Live                  → ON,  enabled  ("Crew link is active.")
 *   Held                  → OFF, enabled  ("Crew link is off — nobody can open this show.")
 *   Publishing… (¬pub)    → OFF, disabled (publish-finishing explainer)
 *   Live + finalize-owned → ON,  disabled (changes-finalizing explainer) — R2/R3: a
 *                           pending-changes finalize can own a LIVE show.
 *
 * Failure modes caught: enabled toggle on a finalize-owned show (mid-finalize unpublish
 * race); refusal copy wiped by router.refresh (R10); catalog copy satisfied by a sibling
 * (anti-tautology: assertions scope INSIDE the toggle row's own subtree).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PublishedToggle } from "@/components/admin/PublishedToggle";
import { messageFor } from "@/lib/messages/lookup";

const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
  usePathname: () => "/admin/show/s1",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  routerRefresh.mockClear();
});

const okAction = () => vi.fn(async (_next: boolean) => ({ ok: true }) as const);

function renderToggle(
  overrides: Partial<{
    published: boolean;
    finalizeOwned: boolean;
    setPublished: (next: boolean) => Promise<{ ok: true } | { ok: false; code: string }>;
  }> = {},
) {
  return render(
    <PublishedToggle
      slug="s1"
      published={overrides.published ?? true}
      finalizeOwned={overrides.finalizeOwned ?? false}
      setPublished={overrides.setPublished ?? okAction()}
    />,
  );
}

function row(): HTMLElement {
  return screen.getByTestId("published-toggle-row");
}
function switchEl(): HTMLElement {
  return screen.getByTestId("published-toggle");
}

describe("PublishedToggle — mode boundaries", () => {
  it("Live → ON, enabled, active sub-line", () => {
    renderToggle({ published: true });
    expect(switchEl().getAttribute("aria-checked")).toBe("true");
    expect(switchEl().hasAttribute("disabled")).toBe(false);
    expect(row().textContent).toContain("Crew link is active.");
  });

  it("Held → OFF, enabled, off sub-line", () => {
    renderToggle({ published: false });
    expect(switchEl().getAttribute("aria-checked")).toBe("false");
    expect(switchEl().hasAttribute("disabled")).toBe(false);
    expect(row().textContent).toContain("Crew link is off — nobody can open this show.");
  });

  it("Publishing… (finalize-owned, not published) → OFF, DISABLED, publish-finishing explainer", () => {
    renderToggle({ published: false, finalizeOwned: true });
    expect(switchEl().getAttribute("aria-checked")).toBe("false");
    expect(switchEl().hasAttribute("disabled")).toBe(true);
    expect(row().textContent).toContain("A publish is finishing");
  });

  it("Live + finalize-owned → ON, DISABLED, changes-finalizing explainer (R2/R3)", () => {
    renderToggle({ published: true, finalizeOwned: true });
    expect(switchEl().getAttribute("aria-checked")).toBe("true");
    expect(switchEl().hasAttribute("disabled")).toBe(true);
    expect(row().textContent).toContain("Changes are being finalized");
  });

  it("the switch never self-disables synchronously in onClick (React 19 dispatch safety)", () => {
    renderToggle({ published: true });
    const onclick = switchEl().getAttribute("onclick") ?? "";
    expect(onclick).not.toMatch(/disabled\s*=\s*true/i);
  });
});

describe("PublishedToggle — action outcomes", () => {
  it("success → dispatches the OPPOSITE of the current state and refreshes", async () => {
    const setPublished = okAction();
    renderToggle({ published: true, setPublished });
    await act(async () => {
      fireEvent.click(switchEl());
    });
    expect(setPublished).toHaveBeenCalledWith(false); // was ON → next=false
    expect(routerRefresh).toHaveBeenCalledTimes(1);
  });

  it("PUBLISH_BLOCKED_PENDING_REVIEW → catalog copy renders INSIDE the toggle row; NO refresh (R10)", async () => {
    const setPublished = vi.fn(async () => ({
      ok: false as const,
      code: "PUBLISH_BLOCKED_PENDING_REVIEW",
    }));
    renderToggle({ published: false, setPublished });
    await act(async () => {
      fireEvent.click(switchEl());
    });
    // Anti-tautology: assert within the row's own subtree only (no sibling can satisfy this).
    const error = row().querySelector('[data-testid="published-toggle-error"]');
    expect(error).not.toBeNull();
    const expected = messageFor("PUBLISH_BLOCKED_PENDING_REVIEW").dougFacing;
    expect(expected).toBeTruthy();
    expect(error?.textContent).toContain(expected);
    expect(error?.textContent).not.toContain("PUBLISH_BLOCKED_PENDING_REVIEW"); // invariant 5
    expect(routerRefresh).not.toHaveBeenCalled(); // R10: refresh would wipe this copy
  });

  it("infra_error / unmapped code → plain retry copy, no refresh", async () => {
    const setPublished = vi.fn(async () => ({ ok: false as const, code: "infra_error" }));
    renderToggle({ published: true, setPublished });
    await act(async () => {
      fireEvent.click(switchEl());
    });
    expect(row().querySelector('[data-testid="published-toggle-retry"]')).not.toBeNull();
    expect(routerRefresh).not.toHaveBeenCalled();
  });
});
