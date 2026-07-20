// @vitest-environment jsdom
/**
 * tests/components/admin/compactAlertHelp.test.tsx
 * (spec 2026-07-20-show-alert-compact §3.2)
 *
 * The help-adapter contract shared by both compact-card surfaces: what goes
 * into the popover, when a trigger appears at all, and the trigger's own
 * shape. Popover STATE is asserted via `aria-expanded` and the body's
 * `hidden` class — never `toBeVisible()`, which is vacuous here because this
 * repo loads no CSS into jsdom, so Tailwind's `hidden` has no effect on
 * computed visibility (spec §9.1).
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  buildHelpPopoverBody,
  CompactAlertHelp,
  HELP_ONLY_LEARN_MORE_LEAD_IN,
} from "@/components/admin/compactAlertHelp";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(""),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Flatten an emphasis-rendered node tree to its visible text. */
function renderToText(node: unknown): string {
  const { container } = render(<>{node as never}</>);
  const text = container.textContent ?? "";
  cleanup();
  return text;
}

const ADMIN_ROUTE = "/admin";
// shouldEmitLearnMore gates on the route: a crew-facing route must not emit
// admin help links (lib/messages/renderer-gate.ts:17-21).
const NON_ADMIN_ROUTE = "/show/some-show/tok3n";

describe("buildHelpPopoverBody — presence matrix (§3.2)", () => {
  test("no context and no href → null (no trigger is rendered at all)", () => {
    expect(
      buildHelpPopoverBody({ helpfulContext: null, helpHref: null, route: ADMIN_ROUTE }),
    ).toBeNull();
  });

  test("context only → body, no learnMore key", () => {
    const built = buildHelpPopoverBody({
      helpfulContext: "Check the sheet's time column.",
      helpHref: null,
      route: ADMIN_ROUTE,
    });
    expect(built).not.toBeNull();
    // Catalog copy is emphasis-rendered, so the body is a node tree, not a string.
    expect(renderToText(built!.body)).toBe("Check the sheet's time column.");
    // exactOptionalPropertyTypes: the key is OMITTED, never set to undefined.
    expect("learnMore" in built!).toBe(false);
  });

  test("href only on an admin route → lead-in body plus the link", () => {
    const built = buildHelpPopoverBody({
      helpfulContext: null,
      helpHref: "/help/errors#X",
      route: ADMIN_ROUTE,
    });
    expect(built).not.toBeNull();
    // Verbatim, not a substring sniff: the lead-in is user-visible copy.
    expect(built!.body).toBe(HELP_ONLY_LEARN_MORE_LEAD_IN);
    expect(built!.learnMore).toEqual({ href: "/help/errors#X" });
  });

  test("both → context body plus the link", () => {
    const built = buildHelpPopoverBody({
      helpfulContext: "Some context.",
      helpHref: "/help/errors#X",
      route: ADMIN_ROUTE,
    });
    expect(renderToText(built!.body)).toBe("Some context.");
    expect(built!.learnMore).toEqual({ href: "/help/errors#X" });
  });

  // The SAME non-empty href, gated off by route. Failure mode: an adapter that
  // reads helpHref directly (as the live AttentionBanner does today) emits
  // admin help links on crew-facing routes.
  test("href gated OFF by route → no learnMore; null overall when that was the only content", () => {
    const gatedWithContext = buildHelpPopoverBody({
      helpfulContext: "Some context.",
      helpHref: "/help/errors#X",
      route: NON_ADMIN_ROUTE,
    });
    expect(gatedWithContext).not.toBeNull();
    expect("learnMore" in gatedWithContext!).toBe(false);

    expect(
      buildHelpPopoverBody({
        helpfulContext: null,
        helpHref: "/help/errors#X",
        route: NON_ADMIN_ROUTE,
      }),
    ).toBeNull();
  });

  test.each([
    ["   ", null],
    ["\n\t", null],
  ])("whitespace-only context (%j) counts as absent", (context) => {
    expect(
      buildHelpPopoverBody({ helpfulContext: context, helpHref: null, route: ADMIN_ROUTE }),
    ).toBeNull();
  });

  test("whitespace-only href counts as absent", () => {
    expect(
      buildHelpPopoverBody({ helpfulContext: null, helpHref: "   ", route: ADMIN_ROUTE }),
    ).toBeNull();
  });

  test("context is trimmed for display", () => {
    const built = buildHelpPopoverBody({
      helpfulContext: "  padded.  ",
      helpHref: null,
      route: ADMIN_ROUTE,
    });
    expect(renderToText(built!.body)).toBe("padded.");
  });
});

describe("CompactAlertHelp — trigger shape and popover state (§3.2)", () => {
  const props = {
    helpfulContext: "Check the sheet's time column.",
    helpHref: "/help/errors#X",
    route: ADMIN_ROUTE,
    testId: "demo-help",
  };

  test("renders nothing when there is no popover content", () => {
    const { container } = render(
      <CompactAlertHelp helpfulContext={null} helpHref={null} route={ADMIN_ROUTE} testId="x" />,
    );
    expect(container.innerHTML).toBe("");
  });

  test("trigger is a button with the compact box + overlay tap floor and the standard focus ring", () => {
    // warning-card-copy-restore §3.4: the 44px floor is carried by the
    // before:inset-[-11px] overlay around the 22px box, not a min-h box.
    render(<CompactAlertHelp {...props} />);
    const trigger = screen.getByTestId("demo-help-trigger");
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger.className).toContain("size-[22px]");
    expect(trigger.className).toContain("before:inset-[-11px]");
    expect(trigger.className).toContain("focus-visible:ring-2");
  });

  // The accessible name carries a "Help: " prefix and a per-card subject. Both are
  // load-bearing (impeccable audit): HoverHelp strips exactly that prefix to name
  // the Learn-more link, so without it the link announces "Learn more about what
  // does this mean?"; and a constant name makes every card's trigger identical in
  // a screen reader's button list.
  test("trigger accessible name carries the Help prefix and the card's subject", () => {
    render(<CompactAlertHelp {...props} subject="Doug Larson was added with LEAD" />);
    expect(
      screen.getByRole("button", { name: "Help: Doug Larson was added with LEAD" }),
    ).toBeInTheDocument();
  });

  test("no subject → a generic but still prefixed name", () => {
    render(<CompactAlertHelp {...props} subject={null} />);
    expect(screen.getByRole("button", { name: "Help: what this alert means" })).toBeInTheDocument();
  });

  // The consequence the prefix exists for.
  test("Learn more link is named from the subject, not from the raw label", () => {
    render(<CompactAlertHelp {...props} subject="Doug Larson was added with LEAD" />);
    const link = screen.getByTestId("demo-help-body").querySelector("a")!;
    expect(link.getAttribute("aria-label")).toBe(
      "Learn more about doug Larson was added with LEAD",
    );
  });

  // §9.1: assert STATE, not visibility. The body is mounted while closed, so a
  // presence query would pass even if opening were broken.
  test("clicking flips aria-expanded and unhides the body", async () => {
    render(<CompactAlertHelp {...props} />);
    const trigger = screen.getByTestId("demo-help-trigger");
    const body = screen.getByTestId("demo-help-body");

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(body.className).toContain("hidden");

    fireEvent.click(trigger);

    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "true"));
    expect(screen.getByTestId("demo-help-body").className).not.toContain("hidden");
  });

  test("popover body carries the context text and the Learn more link", () => {
    render(<CompactAlertHelp {...props} />);
    const body = screen.getByTestId("demo-help-body");
    expect(body.textContent).toContain("Check the sheet's time column.");
    const link = body.querySelector("a");
    expect(link).not.toBeNull();
    expect(link).toHaveAttribute("href", "/help/errors#X");
  });
});
