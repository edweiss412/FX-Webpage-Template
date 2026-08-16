// @vitest-environment jsdom
/**
 * Task 4 — `StagedPreviewBanner` (spec §2.5 copy + §2.3 viewing-as picker).
 *
 * Every count is derived from the roster length and the exported cap constants,
 * so an off-by-one disclosure condition (`>= 14` instead of `> 12`) fails here
 * rather than shipping.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import {
  StagedPreviewBanner,
  STAGED_PICKER_INLINE_CAP,
  STAGED_PICKER_INLINE_HEAD,
} from "@/components/admin/StagedPreviewBanner";
import type { StagedPreviewRosterEntry } from "@/lib/data/stagedShowForViewer";
import { stripCommentsForFile } from "@/tests/_shared/stripComments";

afterEach(cleanup);

const STAGED_ID = "3f1c9b7e-0000-4000-8000-0000000000aa";

function roster(n: number): StagedPreviewRosterEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `staged-crew-${i}`,
    name: `Crew Member ${i}`,
    role: `Role ${i}`,
  }));
}

function renderBanner(entries: StagedPreviewRosterEntry[], selectedIndex = 0): HTMLElement {
  return render(
    <StagedPreviewBanner
      stagedId={STAGED_ID}
      roster={entries}
      selectedId={entries[selectedIndex]!.id}
    />,
  ).container;
}

test("renders the §2.5 title, identity and exit copy exactly", () => {
  const entries = roster(3);
  const container = renderBanner(entries, 1);
  const banner = container.querySelector('[data-testid="staged-preview-banner"]')!;

  expect(banner.getAttribute("role")).toBe("status");
  expect(banner.getAttribute("aria-live")).toBe("polite");

  expect(container.querySelector('[data-testid="staged-preview-banner-title"]')!.textContent).toBe(
    "Previewing from the sheet (not published yet)",
  );
  expect(
    container.querySelector('[data-testid="staged-preview-banner-identity"]')!.textContent,
  ).toBe(`Viewing as ${entries[1]!.name} (${entries[1]!.role})`);

  const exit = container.querySelector('[data-testid="staged-preview-banner-exit"]')!;
  expect(exit.textContent).toBe("Back to setup");
  expect(exit.getAttribute("href")).toBe("/admin");
  expect(exit.getAttribute("class")).toContain("min-h-tap-min");

  // DESIGN.md §9: absolute em-dash ban on user-visible copy.
  expect(banner.textContent).not.toContain("—");
});

test("omits the role parenthetical when the staged role is empty", () => {
  const entries = roster(2);
  entries[0] = { ...entries[0]!, role: "" };
  const container = renderBanner(entries, 0);

  expect(
    container.querySelector('[data-testid="staged-preview-banner-identity"]')!.textContent,
  ).toBe(`Viewing as ${entries[0]!.name}`);
});

test("picker links carry ?as= and never ?s=, and the current entry is not a link", () => {
  const entries = roster(3);
  const container = renderBanner(entries, 1);

  const links = Array.from(
    container.querySelectorAll<HTMLAnchorElement>('[data-testid="staged-preview-picker-link"]'),
  );
  expect(links).toHaveLength(entries.length - 1);
  for (const link of links) {
    const href = link.getAttribute("href")!;
    const matched = entries.find((e) => href.endsWith(`as=${e.id}`));
    expect(matched, `href ${href} names a roster entry`).toBeDefined();
    expect(href).toBe(`/admin/wizard/preview/${STAGED_ID}?as=${matched!.id}`);
    // §2.3: a server-composed `s` would routinely point at the WRONG section.
    // Parsed, not substring-matched: `as=` contains `s=`.
    const url = new URL(href, "https://example.test");
    expect(url.searchParams.has("s")).toBe(false);
    expect(url.searchParams.get("as")).toBe(matched!.id);
    expect(link.getAttribute("class")).toContain("min-h-tap-min");
  }

  const current = container.querySelector('[data-testid="staged-preview-picker-current"]')!;
  expect(current.tagName).toBe("SPAN");
  expect(current.getAttribute("aria-current")).toBe("true");
  expect(current.textContent).toContain(entries[1]!.name);
});

test.each([STAGED_PICKER_INLINE_CAP, STAGED_PICKER_INLINE_CAP + 1, STAGED_PICKER_INLINE_CAP + 2])(
  "cap boundary at a roster of %i entries",
  (size) => {
    const entries = roster(size);
    const container = renderBanner(entries, 0);

    const overflows = size > STAGED_PICKER_INLINE_CAP;
    const expectedInline = overflows ? STAGED_PICKER_INLINE_HEAD : size;
    const expectedDisclosed = size - expectedInline;

    const inline = container.querySelectorAll('[data-testid="staged-preview-picker-inline"] > *');
    expect(inline).toHaveLength(expectedInline);

    const disclosure = container.querySelector('[data-testid="staged-preview-picker-more"]');
    if (!overflows) {
      expect(disclosure).toBeNull();
    } else {
      expect(disclosure).not.toBeNull();
      expect(disclosure!.tagName).toBe("DETAILS");
      expect(
        disclosure!.querySelectorAll("[data-testid='staged-preview-picker-link']"),
      ).toHaveLength(expectedDisclosed);
    }

    // No roster entry is ever dropped: the cap truncates CHROME, not CONTENT.
    const rendered = new Set(
      Array.from(
        container.querySelectorAll(
          '[data-testid="staged-preview-picker-link"], [data-testid="staged-preview-picker-current"]',
        ),
      ).map((el) => el.textContent!.trim()),
    );
    for (const entry of entries) {
      expect(Array.from(rendered).some((t) => t.includes(entry.name))).toBe(true);
    }
  },
);

test("renders nothing at all for an empty roster", () => {
  const { container } = render(
    <StagedPreviewBanner stagedId={STAGED_ID} roster={[]} selectedId="staged-crew-0" />,
  );
  expect(container.querySelector('[data-testid="staged-preview-banner"]')).toBeNull();
});

// ---------------------------------------------------------------------------
// Task 7 — transition audit (spec Transition Inventory)
// ---------------------------------------------------------------------------

/**
 * The added chrome has exactly ONE state and changes only by full navigation, so
 * the inventory records zero state pairs and zero compound transitions. These
 * assertions are what keep that true: the failure mode they catch is someone
 * later giving static chrome client state or an animation, which would silently
 * introduce transitions the spec says do not exist.
 *
 * Proven non-vacuous by mutation: adding `className="transition-all"` to the
 * banner fails the first arm (recorded in the Task 7 commit message).
 */
const BANNER_PATH = join(
  __dirname,
  "..",
  "..",
  "..",
  "components",
  "admin",
  "StagedPreviewBanner.tsx",
);
// Comments are stripped before the scan: a doc comment that NAMES a banned token
// in order to explain why it is banned is a mention, not a use.
const BANNER_SRC = stripCommentsForFile(readFileSync(BANNER_PATH, "utf8"), BANNER_PATH);

const CLIENT_STATE_TOKENS = ["AnimatePresence", "motion.", "useState", "useEffect", "transition-"];

describe("staged preview banner is static chrome", () => {
  test("carries no animation token and no client state", () => {
    for (const token of CLIENT_STATE_TOKENS) {
      expect(BANNER_SRC, `banner must not contain ${token}`).not.toContain(token);
    }
  });

  test("is a Server Component (no use client directive)", () => {
    expect(BANNER_SRC).not.toContain('"use client"');
    // Premise: the file really was read, so "no match" is not "no file".
    expect(BANNER_SRC).toContain("export function StagedPreviewBanner");
  });
});
