// @vitest-environment jsdom
/**
 * tests/components/layout/Header.search.test.tsx (crew show search, Task 15)
 *
 * `Header` gains an optional `search` slot (spec §6.1). Without it, Header
 * must render exactly the markup it rendered before the slot existed. The two
 * inline snapshots below were recorded against the UNCHANGED Header.tsx
 * (HEAD 61b5cc618), so the change cannot move them. This file imports only
 * Header, so nothing else can shift what it records.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { Header } from "@/components/layout/Header";
import type { ShowRow } from "@/lib/parser/types";

afterEach(() => {
  cleanup();
});

const SHOW: Pick<ShowRow, "title" | "client_label" | "dates" | "venue"> = {
  title: "Spring Gala 2026",
  client_label: "Acme Corp",
  dates: { travelIn: null, set: "2026-04-17", showDays: ["2026-04-18"], travelOut: null },
  venue: { name: "Hilton Chicago", address: "720 S Michigan Ave", googleLink: null, notes: null },
};

describe("Header without the search slot (markup unchanged)", () => {
  it("crew header with a status pill and an identity chip", () => {
    const { container } = render(
      <Header
        show={SHOW}
        statusPill={<span>Show day 1 of 3</span>}
        identityChip={<button type="button">Maria Chen</button>}
      />,
    );
    expect(container.firstChild).toMatchInlineSnapshot(`
      <header
        class="border-b border-border bg-bg"
        data-testid="page-header"
      >
        <div
          class="mx-auto flex w-full max-w-[1200px] items-baseline justify-between gap-6 px-4 py-3 sm:px-8 sm:py-4"
        >
          <div
            class="min-w-0 flex-1"
          >
            <p
              class="text-xs font-medium uppercase tracking-eyebrow text-text-subtle"
            >
              Acme Corp
            </p>
            <div
              class="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1"
            >
              <h1
                class="text-base font-semibold leading-tight tracking-tight text-text-strong sm:text-lg"
              >
                Spring Gala 2026
              </h1>
              <span
                class="shrink-0"
                data-testid="header-status-pill"
              >
                <span>
                  Show day 1 of 3
                </span>
              </span>
            </div>
            <p
              class="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-text-subtle"
            >
              <time
                class="font-medium text-text"
                datetime="2026-04-17"
              >
                April 17, 2026
              </time>
              <span
                aria-hidden="true"
                class="text-text-faint"
              >
                ·
              </span>
              <span>
                Hilton Chicago
              </span>
            </p>
          </div>
          <div
            class="shrink-0 self-start"
            data-testid="page-header-right-slot"
          >
            <button
              type="button"
            >
              Maria Chen
            </button>
          </div>
        </div>
      </header>
    `);
  });

  it("admin header with no pill and no identity chip", () => {
    const { container } = render(<Header show={SHOW} />);
    expect(container.firstChild).toMatchInlineSnapshot(`
      <header
        class="border-b border-border bg-bg"
        data-testid="page-header"
      >
        <div
          class="mx-auto flex w-full max-w-[1200px] items-baseline justify-between gap-6 px-4 py-3 sm:px-8 sm:py-4"
        >
          <div
            class="min-w-0 flex-1"
          >
            <p
              class="text-xs font-medium uppercase tracking-eyebrow text-text-subtle"
            >
              Acme Corp
            </p>
            <h1
              class="text-base font-semibold leading-tight tracking-tight text-text-strong sm:text-lg mt-1"
            >
              Spring Gala 2026
            </h1>
            <p
              class="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-text-subtle"
            >
              <time
                class="font-medium text-text"
                datetime="2026-04-17"
              >
                April 17, 2026
              </time>
              <span
                aria-hidden="true"
                class="text-text-faint"
              >
                ·
              </span>
              <span>
                Hilton Chicago
              </span>
            </p>
          </div>
          <div
            class="flex shrink-0 items-center gap-3 self-start"
            data-identity="none"
            data-testid="page-header-right-slot"
          >
            <p
              class="hidden text-xs font-semibold uppercase tracking-eyebrow-strong text-text-faint sm:block"
              data-testid="page-header-fxav-wordmark"
            >
              FXAV
            </p>
            <button
              aria-label="Dark mode"
              aria-pressed="false"
              class="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm border border-text-faint bg-surface text-text transition-colors duration-fast hover:border-text-subtle hover:bg-surface-raised hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              data-testid="theme-toggle"
              type="button"
            >
              <span
                aria-hidden="true"
              >
                <svg
                  aria-hidden="true"
                  class="lucide lucide-moon size-4"
                  fill="none"
                  height="24"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  viewBox="0 0 24 24"
                  width="24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"
                  />
                </svg>
              </span>
            </button>
          </div>
        </div>
      </header>
    `);
  });
});

describe("Header search slot", () => {
  it("renders the search row only when the prop is set, under the title block", () => {
    const { rerender } = render(<Header show={SHOW} />);
    expect(screen.queryByTestId("page-header-search")).toBeNull();
    rerender(<Header show={SHOW} search={null} />);
    expect(screen.queryByTestId("page-header-search")).toBeNull();
    rerender(<Header show={SHOW} search={<div data-testid="search-payload">field</div>} />);
    const row = screen.getByTestId("page-header-search");
    expect(row).toContainElement(screen.getByTestId("search-payload"));
    // A full-width row of its own under the title block, not inside the title row.
    expect(row.parentElement).toBe(screen.getByTestId("page-header"));
    expect(screen.getByRole("heading", { level: 1 }).compareDocumentPosition(row)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});
