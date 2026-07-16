// @vitest-environment jsdom
/**
 * tests/components/admin/toggleEdgeClasses.test.tsx
 *
 * Accent-contrast token pass (spec 2026-07-16 §4.1/§4.1b class B): every
 * stateful accent fill's ON/active state must carry the `border-accent-edge`
 * boundary (WCAG 1.4.11 — the raw orange track is 2.23:1 vs light bg, so the
 * 1px edge IS the component boundary) and must no longer carry the invisible
 * `border-accent` rim (2.39:1 max vs its own track — reads as part of the fill).
 *
 * Failure mode caught: a toggle recipe reverts to `border-accent bg-accent`
 * (or a new stateful fill ships borderless) — the rendered ON state loses its
 * only passing boundary and 1.4.11 regresses silently.
 *
 * Assertions are TOKENIZED (never substring): `border-accent` at end-of-string
 * would evade a substring guard.
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin",
}));

import { NotifyToggle } from "@/components/admin/settings/NotifyToggle";
import { AutoPublishToggle } from "@/components/admin/settings/AutoPublishToggle";
import { DeveloperToggleButton } from "@/components/admin/settings/DeveloperToggleButton";
import { PublishedToggle } from "@/components/admin/PublishedToggle";
import { AutoRefreshControl } from "@/components/admin/telemetry/AutoRefreshControl";
import { StepIndicator } from "@/components/admin/OnboardingWizard";

afterEach(() => cleanup());

const okAction = () => vi.fn(async () => ({ ok: true }) as const);

/** The element (self or descendant) whose class token set contains `bg-accent`. */
function accentFill(root: HTMLElement): HTMLElement {
  const all = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  const hit = all.find((el) => tokenSet(el).has("bg-accent"));
  if (!hit) throw new Error("no bg-accent fill rendered in the ON/active state");
  return hit;
}
function tokenSet(el: HTMLElement): Set<string> {
  return new Set((el.getAttribute("class") ?? "").split(/\s+/));
}
function expectEdgeTreated(fill: HTMLElement) {
  const tokens = tokenSet(fill);
  expect(tokens.has("border-accent-edge"), "ON fill must carry border-accent-edge").toBe(true);
  expect(tokens.has("border-accent"), "invisible border-accent rim must be gone").toBe(false);
  expect(tokens.has("border-transparent"), "no transparent border on the accent state").toBe(false);
}

describe("stateful accent fills carry the accent-edge boundary (WCAG 1.4.11)", () => {
  it("NotifyToggle ON", () => {
    const { getByTestId } = render(
      <NotifyToggle
        testId="alert-on-sync-problems"
        title="t"
        ariaLabel="t"
        description="d"
        initial={{ kind: "value", on: true }}
        action={okAction()}
      />,
    );
    expectEdgeTreated(accentFill(getByTestId("alert-on-sync-problems-toggle")));
  });

  it("AutoPublishToggle ON", () => {
    const { getByTestId } = render(
      <AutoPublishToggle initial={{ kind: "value", on: true }} setAutoPublish={okAction()} />,
    );
    expectEdgeTreated(accentFill(getByTestId("auto-publish-toggle")));
  });

  it("DeveloperToggleButton ON", () => {
    const { getByTestId } = render(
      <DeveloperToggleButton email="bob@example.com" checked={true} />,
    );
    expectEdgeTreated(accentFill(getByTestId("developer-toggle")));
  });

  it("PublishedToggle ON", () => {
    const { getByTestId } = render(
      <PublishedToggle slug="s1" published={true} finalizeOwned={false} setPublished={okAction()} />,
    );
    expectEdgeTreated(accentFill(getByTestId("published-toggle")));
  });

  it("AutoRefreshControl ON (default first paint)", () => {
    const { container } = render(<AutoRefreshControl />);
    // The control renders TWO decorative bg-accent elements (ping ring + live
    // dot — §4.1b class C, exempt) before the switch; target the TRACK by its
    // fixed width token so the boundary assertion lands on the stateful fill.
    const track = [...container.querySelectorAll<HTMLElement>("*")].find(
      (el) => tokenSet(el).has("bg-accent") && tokenSet(el).has("w-[34px]"),
    );
    if (!track) throw new Error("autorefresh track (bg-accent + w-[34px]) not rendered");
    expectEdgeTreated(track);
  });

  it("OnboardingWizard active step pill", () => {
    const { getByTestId } = render(<StepIndicator step={1} maxReachedStep={1} />);
    expectEdgeTreated(accentFill(getByTestId("wizard-step-indicator")));
  });
});
