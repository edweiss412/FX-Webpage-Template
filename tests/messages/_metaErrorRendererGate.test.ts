/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { testidForErrorCode } from "@/app/help/_affordanceMatrix";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";
import { messageFor } from "@/lib/messages/lookup";
import { shouldEmitLearnMore } from "@/lib/messages/renderer-gate";

const ErrorRendererHelpAffordance = HelpAffordance as React.ComponentType<{
  code: MessageCode;
  route: string;
}>;

const contexts = [
  { label: "admin", route: "/admin", shouldEmit: true },
  { label: "help-admin", route: "/help/admin/dashboard", shouldEmit: true },
  { label: "crew", route: "/show/rpas-central-2026", shouldEmit: false },
  {
    label: "preview-as-crew",
    route: "/admin/show/rpas-central-2026/preview/eric-weiss",
    shouldEmit: false,
  },
] as const;

function documentedDougEntries() {
  return Object.values(MESSAGE_CATALOG).filter((entry) => {
    const rendered = messageFor(entry.code);
    return rendered.dougFacing !== null && rendered.helpHref !== null;
  });
}

function SyntheticLearnMore({ route, helpHref }: { route: string; helpHref: string | null }) {
  if (!shouldEmitLearnMore({ route, helpHref })) return null;
  return React.createElement(
    "a",
    { "data-testid": "forced-crew-only-learn-more", href: helpHref ?? undefined },
    "Learn more →",
  );
}

afterEach(() => {
  cleanup();
});

describe("error renderer Learn-more gate (Task G.6 / test #12)", () => {
  it("classifies admin, help-admin, crew, and preview-as-crew route contexts", () => {
    const helpHref = "/help/errors#FAKE";
    expect(
      contexts.map((ctx) => [ctx.label, shouldEmitLearnMore({ route: ctx.route, helpHref })]),
    ).toEqual([
      ["admin", true],
      ["help-admin", true],
      ["crew", false],
      ["preview-as-crew", false],
    ]);
  });

  it("renders Learn more only in admin/help-admin contexts for Doug-facing catalog entries with helpHref", () => {
    const failures: string[] = [];

    for (const entry of documentedDougEntries()) {
      const expectedTestid = testidForErrorCode(entry.code);
      const expectedHref = messageFor(entry.code).helpHref;
      for (const ctx of contexts) {
        cleanup();
        render(
          React.createElement(ErrorRendererHelpAffordance, {
            code: entry.code,
            route: ctx.route,
          }),
        );
        const affordance = screen.queryByTestId(expectedTestid);

        if (ctx.shouldEmit) {
          if (!(affordance instanceof HTMLAnchorElement)) {
            failures.push(`${entry.code} ${ctx.label}: missing ${expectedTestid}`);
            continue;
          }
          if (affordance.getAttribute("href") !== expectedHref) {
            failures.push(
              `${entry.code} ${ctx.label}: expected href ${expectedHref}, got ${affordance.getAttribute(
                "href",
              )}`,
            );
          }
        } else if (affordance !== null) {
          failures.push(`${entry.code} ${ctx.label}: unexpectedly emitted ${expectedTestid}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("forced crew-only fixture proves the gate is route-based, not catalog-shape based", () => {
    const helpHref = "/help/errors#FAKE";

    render(React.createElement(SyntheticLearnMore, { route: "/admin", helpHref }));
    expect(screen.getByTestId("forced-crew-only-learn-more").getAttribute("href")).toBe(helpHref);

    cleanup();

    render(
      React.createElement(SyntheticLearnMore, {
        route: "/show/rpas-central-2026",
        helpHref,
      }),
    );
    expect(screen.queryByTestId("forced-crew-only-learn-more")).toBeNull();
  });
});
