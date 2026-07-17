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

// ── CASP-2: inline variant (compact StatusStrip toggle) ──────────────────────
function renderInline(
  overrides: Partial<{
    published: boolean;
    finalizeOwned: boolean;
    setPublished: (n: boolean) => Promise<{ ok: true } | { ok: false; code: string }>;
  }> = {},
) {
  return render(
    <PublishedToggle
      slug="s1"
      variant="inline"
      published={overrides.published ?? true}
      finalizeOwned={overrides.finalizeOwned ?? false}
      setPublished={overrides.setPublished ?? okAction()}
    />,
  );
}
const inlineRoot = () => screen.getByTestId("published-toggle-inline");
const popover = () => screen.queryByTestId("published-toggle-popover");

describe("PublishedToggle — inline variant", () => {
  it("card is the default AND explicit variant='card' renders the card row (both)", () => {
    renderToggle({ published: true }); // no variant → default card
    expect(screen.getByTestId("published-toggle-row")).toBeTruthy();
    expect(screen.queryByTestId("published-toggle-inline")).toBeNull();
    cleanup();
    render(
      <PublishedToggle
        slug="s1"
        variant="card"
        published={true}
        finalizeOwned={false}
        setPublished={okAction()}
      />,
    );
    expect(screen.getByTestId("published-toggle-row")).toBeTruthy();
    expect(screen.queryByTestId("published-toggle-inline")).toBeNull();
  });

  it("S1 idle: renders label + switch, no card chrome, no popover", () => {
    renderInline({ published: true, finalizeOwned: false });
    expect(inlineRoot()).toBeTruthy();
    expect(screen.getByTestId("published-toggle").getAttribute("aria-checked")).toBe("true");
    expect(inlineRoot().textContent).toContain("Published");
    expect(screen.queryByTestId("published-toggle-row")).toBeNull();
    expect(screen.queryByTestId("published-toggle-subline")).toBeNull();
    expect(popover()).toBeNull();
  });

  it("S2 refusal: error popover (role=alert) w/ catalog copy, NOT raw code, NO in-flow block, NO refresh", async () => {
    const setPublished = vi.fn(async () => ({
      ok: false as const,
      code: "PUBLISH_BLOCKED_PENDING_REVIEW",
    }));
    renderInline({ published: false, setPublished });
    await act(async () => {
      fireEvent.click(screen.getByTestId("published-toggle"));
    });
    const pop = popover()!;
    expect(pop).not.toBeNull();
    expect(pop.getAttribute("role")).toBe("alert");
    const expected = messageFor("PUBLISH_BLOCKED_PENDING_REVIEW").dougFacing!;
    expect(pop.textContent).toContain(expected);
    expect(pop.textContent).not.toContain("PUBLISH_BLOCKED_PENDING_REVIEW"); // invariant 5
    expect(screen.queryByTestId("published-toggle-error")).toBeNull(); // no in-flow block
    expect(routerRefresh).not.toHaveBeenCalled(); // R10
  });

  it("S3 generic error: retry popover with card's curly-apostrophe copy", async () => {
    const setPublished = vi.fn(async () => ({ ok: false as const, code: "infra_error" }));
    renderInline({ published: true, setPublished });
    await act(async () => {
      fireEvent.click(screen.getByTestId("published-toggle"));
    });
    const pop = popover()!;
    expect(pop.getAttribute("role")).toBe("alert");
    expect(pop.textContent).toContain("That didn’t go through. Refresh and try again.");
  });

  it("S4 finalize: disabled switch + calm popover (NOT role=alert), aria-describedby wired", () => {
    renderInline({ published: true, finalizeOwned: true });
    const sw = screen.getByTestId("published-toggle");
    expect(sw.hasAttribute("disabled")).toBe(true);
    const pop = popover()!;
    expect(pop).not.toBeNull();
    expect(pop.getAttribute("role")).not.toBe("alert");
    expect(pop.textContent).toContain("Changes are being finalized");
    expect(sw.getAttribute("aria-describedby")).toBe(pop.getAttribute("id"));
    expect(pop.getAttribute("id")).toBe("published-toggle-popover-s1");
  });

  it("S5: a refusal preserved across a finalize flip keeps the ERROR popover (error wins), switch disabled", async () => {
    const setPublished = vi.fn(async () => ({
      ok: false as const,
      code: "PUBLISH_BLOCKED_PENDING_REVIEW",
    }));
    const { rerender } = renderInline({ published: false, finalizeOwned: false, setPublished });
    await act(async () => {
      fireEvent.click(screen.getByTestId("published-toggle"));
    });
    // sibling soft-refresh flips finalizeOwned true; rerender the SAME instance so the local
    // errorCode useState is preserved (models router.refresh's soft, state-preserving behavior).
    rerender(
      <PublishedToggle
        slug="s1"
        variant="inline"
        published={false}
        finalizeOwned={true}
        setPublished={setPublished}
      />,
    );
    const pop = popover()!;
    expect(pop.getAttribute("role")).toBe("alert"); // error wins, not the finalize hint
    expect(pop.textContent).toContain(messageFor("PUBLISH_BLOCKED_PENDING_REVIEW").dougFacing!);
    expect(screen.getByTestId("published-toggle").hasAttribute("disabled")).toBe(true);
  });

  it("inline B1 dispatch-safety: clicking the enabled switch actually dispatches the form action", async () => {
    const setPublished = vi.fn(async () => ({ ok: true as const }));
    renderInline({ published: true, finalizeOwned: false, setPublished });
    const sw = screen.getByTestId("published-toggle");
    expect(sw.getAttribute("type")).toBe("submit");
    expect(sw.closest("form")).not.toBeNull();
    expect(sw.hasAttribute("disabled")).toBe(false); // enabled at rest
    await act(async () => {
      fireEvent.click(sw);
    });
    expect(setPublished).toHaveBeenCalledTimes(1);
    expect(setPublished).toHaveBeenCalledWith(false); // flipped from published:true
  });

  it("error and finalize popovers share the EXACT positioning class set; only skin/role differ", async () => {
    const POSITION = [
      "absolute",
      "right-0",
      "top-full",
      "z-40",
      "mt-1",
      "w-max",
      "max-w-60",
      "break-words",
      "rounded-sm",
      "p-2",
      "text-sm",
      "shadow-tile",
    ]; // === POPOVER_POSITION tokens
    const ERROR_SKIN = new Set([
      "border",
      "border-border-strong",
      "bg-warning-bg",
      "text-warning-text",
    ]);
    const FINALIZE_SKIN = new Set(["border", "border-border", "bg-surface", "text-text-subtle"]);
    // Forbid a stray geometry class that would let the error popover overflow while only the
    // finalize popover is measured in the real browser (spec §8.10 proxy argument).
    const FORBIDDEN = /^(left-0|left-\d|translate-x-|max-w-(?!60\b))/;

    const { unmount } = renderInline({ published: true, finalizeOwned: true });
    const finalizeTokens = popover()!.className.split(/\s+/).filter(Boolean);
    unmount();
    const setPublished = vi.fn(async () => ({
      ok: false as const,
      code: "PUBLISH_BLOCKED_PENDING_REVIEW",
    }));
    renderInline({ published: false, setPublished });
    await act(async () => {
      fireEvent.click(screen.getByTestId("published-toggle"));
    });
    const errorTokens = popover()!.className.split(/\s+/).filter(Boolean);

    for (const t of POSITION) {
      expect(finalizeTokens, `finalize missing ${t}`).toContain(t);
      expect(errorTokens, `error missing ${t}`).toContain(t);
    }
    const finalizeExtra = finalizeTokens.filter((t) => !POSITION.includes(t));
    const errorExtra = errorTokens.filter((t) => !POSITION.includes(t));
    expect(new Set(finalizeExtra)).toEqual(FINALIZE_SKIN);
    expect(new Set(errorExtra)).toEqual(ERROR_SKIN);
    for (const t of [...finalizeTokens, ...errorTokens]) {
      expect(t, `forbidden geometry class ${t}`).not.toMatch(FORBIDDEN);
    }
  });
});
