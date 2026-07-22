// tests/components/admin/hoverHelpAfterBody.test.tsx
// @vitest-environment jsdom
/** Spec §3.1/§8.2: the afterBodyText attribute triple mirrors learnMore.
 *  Catches: describedby narrowed but tooltip role kept or aria-controls
 *  omitted (each quadrant pins all three attributes + DOM order). */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HoverHelp } from "@/components/admin/HoverHelp";

afterEach(cleanup);

function attrs(testId: string) {
  const trigger = screen.getByTestId(`${testId}-trigger`);
  const body = screen.getByTestId(`${testId}-body`);
  return {
    trigger,
    body,
    describedbyEl: document.getElementById(trigger.getAttribute("aria-describedby") ?? ""),
    controls: trigger.getAttribute("aria-controls"),
    role: body.getAttribute("role"),
  };
}

describe("HoverHelp afterBodyText quadrants", () => {
  it("neither prop: describedby=whole body, tooltip role, no aria-controls", () => {
    render(
      <HoverHelp label="Help: q" testId="q0">
        ctx
      </HoverHelp>,
    );
    const a = attrs("q0");
    expect(a.describedbyEl).toBe(a.body);
    expect(a.role).toBe("tooltip");
    expect(a.controls).toBeNull();
  });

  it("afterBodyText alone: describedby=descId only, aria-controls=body, role absent, p outside desc", () => {
    render(
      <HoverHelp label="Help: q" testId="q1" afterBodyText="Follow up.">
        ctx
      </HoverHelp>,
    );
    const a = attrs("q1");
    expect(a.describedbyEl).not.toBeNull();
    expect(a.describedbyEl).not.toBe(a.body);
    expect(a.describedbyEl!.textContent).toBe("ctx");
    expect(a.describedbyEl!.textContent).not.toContain("Follow up.");
    expect(document.getElementById(a.controls ?? "")).toBe(a.body);
    expect(a.role).toBeNull();
    const p = a.body.querySelector("p.mt-2");
    expect(p?.textContent).toBe("Follow up.");
    expect(a.describedbyEl!.contains(p!)).toBe(false);
  });

  it("learnMore alone: shipped triple unchanged (pinned)", () => {
    render(
      <HoverHelp label="Help: q" testId="q4" learnMore={{ href: "/help/x" }}>
        ctx
      </HoverHelp>,
    );
    const a = attrs("q4");
    expect(a.describedbyEl!.textContent).toBe("ctx");
    expect(a.describedbyEl).not.toBe(a.body);
    expect(document.getElementById(a.controls ?? "")).toBe(a.body);
    expect(a.role).toBeNull();
  });

  it("both: order is descId div, after-body p, learnMore link", () => {
    render(
      <HoverHelp
        label="Help: q"
        testId="q2"
        afterBodyText="Follow up."
        learnMore={{ href: "/help/x" }}
      >
        ctx
      </HoverHelp>,
    );
    const a = attrs("q2");
    expect(a.describedbyEl!.textContent).toBe("ctx");
    expect(a.role).toBeNull();
    expect(document.getElementById(a.controls ?? "")).toBe(a.body);
    const children = [...a.body.children];
    const descIdx = children.indexOf(a.describedbyEl as Element);
    const pIdx = children.findIndex((c) => c.matches("p.mt-2"));
    const linkIdx = children.findIndex((c) => c.matches("a"));
    expect(descIdx).toBeGreaterThanOrEqual(0);
    expect(pIdx).toBeGreaterThan(descIdx);
    expect(linkIdx).toBeGreaterThan(pIdx);
  });

  it.each(["", "   "])("empty/whitespace afterBodyText (%j) behaves as absent", (v) => {
    render(
      <HoverHelp label="Help: q" testId="q3" afterBodyText={v}>
        ctx
      </HoverHelp>,
    );
    const a = attrs("q3");
    expect(a.describedbyEl).toBe(a.body);
    expect(a.role).toBe("tooltip");
    expect(a.controls).toBeNull();
    expect(a.body.querySelector("p.mt-2")).toBeNull();
  });
});
