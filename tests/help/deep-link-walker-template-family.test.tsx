// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { HelpAffordance } from "@/components/admin/HelpAffordance";
import { AFFORDANCE_MATRIX, testidForErrorCode } from "@/app/help/_affordanceMatrix";
import { MESSAGE_CATALOG, type MessageCatalogEntry } from "@/lib/messages/catalog";
import { messageFor } from "@/lib/messages/lookup";

afterEach(() => {
  cleanup();
});

const TemplateFamilyHelpAffordance = HelpAffordance as React.ComponentType<{
  code: string;
  route: string;
}>;

function isDocumentedEntry(entry: MessageCatalogEntry): boolean {
  return (
    (entry.severity ?? "warning") !== "info" &&
    entry.dougFacing !== null &&
    entry.title !== null &&
    entry.longExplanation !== null &&
    entry.helpHref !== null
  );
}

const documentedEntries = Object.values(MESSAGE_CATALOG).filter(isDocumentedEntry);

describe("deep-link walker template-family coverage (Task G.5)", () => {
  it("has exactly one error-message template-family row", () => {
    const templateRows = AFFORDANCE_MATRIX.filter((row) => row.kind === "template-family");
    expect(templateRows).toHaveLength(1);
    expect(templateRows[0]?.testidPattern).toBe(
      "help-affordance--error-message--<code>--learn-more",
    );
    expect(documentedEntries.length).toBeGreaterThan(0);
  });

  it("renders the error-message family Learn more link for every documented catalog entry", () => {
    const failures: string[] = [];

    for (const entry of documentedEntries) {
      const expectedHref = messageFor(entry.code).helpHref;
      const { container, unmount } = render(
        <TemplateFamilyHelpAffordance code={entry.code} route="/admin/show/rpas-central-2026" />,
      );
      const link = container.querySelector<HTMLAnchorElement>(
        `[data-testid="${testidForErrorCode(entry.code)}"]`,
      );

      if (!link) {
        failures.push(`${entry.code}: missing ${testidForErrorCode(entry.code)}`);
      } else if (link.getAttribute("href") !== expectedHref) {
        failures.push(
          `${entry.code}: href ${link.getAttribute("href") ?? "<null>"} !== ${expectedHref}`,
        );
      }
      unmount();
    }

    expect(failures).toEqual([]);
  });
});
