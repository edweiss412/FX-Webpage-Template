// @vitest-environment jsdom
/**
 * Task 5 — the staged crew preview route (spec §2.1 flow, §2.7 failure surfaces).
 *
 * Direct page-function invocation. `lib/admin/lookupStagedRow` is MODULE-mocked
 * (a same-module export cannot be mocked out from under the page's lexical
 * reference, which is why the helper ships in its own module), and `CrewShell`
 * is module-mocked to a props-capturing marker: this suite proves WIRING and
 * GUARDS, while the shell's own behaviour is Task 3's subject.
 */
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { makeStagedParseFixture } from "@/tests/fixtures/stagedParseResult";

vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdmin: async () => {} }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const lookupStagedRow = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin/lookupStagedRow", () => ({ lookupStagedRow }));

const nowDate = vi.hoisted(() => vi.fn(async () => new Date("2026-06-23T15:00:00Z")));
vi.mock("@/lib/time/now", () => ({
  nowDate,
  now: async () => (await nowDate()).toISOString(),
}));

const shellProps = vi.hoisted(() => ({ value: null }) as { value: Record<string, unknown> | null });
vi.mock("@/app/show/[slug]/[shareToken]/_CrewShell", () => ({
  CrewShell: (props: Record<string, unknown>) => {
    shellProps.value = props;
    return <div data-testid="crew-shell" />;
  },
}));

const STAGED_ID = "3f1c9b7e-0000-4000-8000-0000000000aa";

function foundRow(parseResult: unknown): {
  kind: "found";
  row: {
    stagedId: string;
    driveFileId: string | null;
    parseResult: unknown;
    sourceAnchors: Record<string, { title: string; gid: number }>;
    stagedModifiedTime: string | null;
  };
} {
  return {
    kind: "found",
    row: {
      stagedId: STAGED_ID,
      driveFileId: "drive-file-1",
      parseResult,
      sourceAnchors: {},
      stagedModifiedTime: "2026-06-20T10:00:00.000Z",
    },
  };
}

async function renderPage(opts?: {
  stagedId?: string;
  as?: string;
  s?: string;
}): Promise<HTMLElement> {
  const mod = await import("@/app/admin/wizard/preview/[stagedId]/page");
  const element = (await mod.default({
    params: Promise.resolve({ stagedId: opts?.stagedId ?? STAGED_ID }),
    searchParams: Promise.resolve({
      ...(opts?.as === undefined ? {} : { as: opts.as }),
      ...(opts?.s === undefined ? {} : { s: opts.s }),
    }),
  })) as ReactNode;
  return render(element).container;
}

beforeEach(() => {
  shellProps.value = null;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** No §12.4-style raw code string may reach any rendered failure surface. */
function expectNoRawCode(container: HTMLElement): void {
  expect(container.textContent ?? "").not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
}

// The §2.7 copy, verbatim. Asserted as the surface's own TEXT (not a title or
// aria attribute), so an emptied or suffixed string fails here.
const LOAD_FAILURE_COPY = "We could not load this preview.";
const EMPTY_ROSTER_COPY =
  "This sheet has no crew members yet, so there is no crew page to preview.";

function expectFailureSurface(container: HTMLElement, testId: string, copy: string): void {
  const surface = container.querySelector(`[data-testid="${testId}"]`);
  expect(surface, `${testId} should render`).not.toBeNull();
  // EQUALITY, not containment: a suffixed copy string must fail here.
  expect(surface!.querySelector("p")!.textContent).toBe(copy);
  expect(surface!.querySelector('a[href="/admin"]')!.textContent).toBe("Back to setup");
  expect(surface!.textContent).not.toContain("—");
  expectNoRawCode(container);
}

describe("staged preview route guards (AC-4)", () => {
  test("a non-UUID stagedId short-circuits to notFound before any query", async () => {
    await expect(renderPage({ stagedId: "not-a-uuid" })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(lookupStagedRow).not.toHaveBeenCalled();
  });

  test("a missing staged row is a 404 and an infra fault is its own surface", async () => {
    lookupStagedRow.mockResolvedValueOnce({ kind: "not_found" });
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");

    lookupStagedRow.mockResolvedValueOnce({ kind: "infra_error" });
    const container = await renderPage();
    expectFailureSurface(container, "staged-preview-infra-error", LOAD_FAILURE_COPY);
    expect(container.querySelector('[data-testid="crew-shell"]')).toBeNull();
    // The three failure kinds stay DISCRIMINABLE from one another.
    expect(container.querySelector('[data-testid="staged-preview-decode-error"]')).toBeNull();
    expect(container.querySelector('[data-testid="staged-preview-empty-roster"]')).toBeNull();
  });

  test("a container-shape decode failure lands on the decode-error surface", async () => {
    const parse = makeStagedParseFixture() as unknown as Record<string, unknown>;
    parse.crewMembers = "garbage";
    lookupStagedRow.mockResolvedValueOnce(foundRow(parse));

    const container = await renderPage();
    expectFailureSurface(container, "staged-preview-decode-error", LOAD_FAILURE_COPY);
    expect(container.querySelector('[data-testid="crew-shell"]')).toBeNull();
    expect(container.querySelector('[data-testid="staged-preview-infra-error"]')).toBeNull();
    expect(container.querySelector('[data-testid="staged-preview-empty-roster"]')).toBeNull();
  });

  test("nested malformation renders the preview, never an error surface", async () => {
    // AC-4 arms (a) role_flags: null, (b) a null crew element, (c) room name: null.
    const parse = makeStagedParseFixture();
    (parse.crewMembers[0] as unknown as Record<string, unknown>).role_flags = null;
    (parse.crewMembers as unknown[])[1] = null;
    (parse.rooms[0] as unknown as Record<string, unknown>).name = null;
    lookupStagedRow.mockResolvedValueOnce(foundRow(parse));

    const container = await renderPage();
    expect(container.querySelector('[data-testid="crew-shell"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="staged-preview-decode-error"]')).toBeNull();
    expect(container.querySelector('[data-testid="staged-preview-infra-error"]')).toBeNull();
  });

  test("an empty roster lands on its own surface", async () => {
    const parse = makeStagedParseFixture();
    parse.crewMembers = [];
    lookupStagedRow.mockResolvedValueOnce(foundRow(parse));

    const container = await renderPage();
    expectFailureSurface(container, "staged-preview-empty-roster", EMPTY_ROSTER_COPY);
    expect(container.querySelector('[data-testid="crew-shell"]')).toBeNull();
    expect(container.querySelector('[data-testid="staged-preview-infra-error"]')).toBeNull();
    expect(container.querySelector('[data-testid="staged-preview-decode-error"]')).toBeNull();
  });
});

describe("staged preview route happy path (AC-4 / AC-5 wiring)", () => {
  test("threads ?as= and ?s= into the banner identity and the shell props", async () => {
    const parse = makeStagedParseFixture();
    lookupStagedRow.mockResolvedValueOnce(foundRow(parse));

    const container = await renderPage({ as: "staged-crew-1", s: "gear" });

    expect(
      container.querySelector('[data-testid="staged-preview-banner-identity"]')!.textContent,
    ).toContain(parse.crewMembers[1]!.name);

    expect(shellProps.value).not.toBeNull();
    expect(shellProps.value!.viewer).toEqual({
      kind: "admin_preview",
      crewMemberId: "staged-crew-1",
    });
    expect(shellProps.value!.showId).toBe("staged-preview");
    expect(shellProps.value!.staticPreview).toBe(true);
    expect(shellProps.value!.rawSection).toBe("gear");
  });

  test("an unknown ?as= falls back to roster entry 0, never an error", async () => {
    const parse = makeStagedParseFixture();
    lookupStagedRow.mockResolvedValueOnce(foundRow(parse));

    const container = await renderPage({ as: "staged-crew-999" });
    expect(
      container.querySelector('[data-testid="staged-preview-banner-identity"]')!.textContent,
    ).toContain(parse.crewMembers[0]!.name);
    expect(shellProps.value!.viewer).toEqual({
      kind: "admin_preview",
      crewMemberId: "staged-crew-0",
    });
  });

  test("the route module declares force-dynamic and its metadata title", async () => {
    const mod = await import("@/app/admin/wizard/preview/[stagedId]/page");
    expect(mod.dynamic).toBe("force-dynamic");
    expect((mod.metadata as { title?: string }).title).toBe("Crew preview · Admin · FXAV");
  });
});

describe("staged preview segment error boundary", () => {
  test("renders the plain-language copy, its testid and a Back to setup link", async () => {
    const mod = await import("@/app/admin/wizard/preview/[stagedId]/error");
    const container = render(<mod.default error={new Error("boom")} reset={() => {}} />).container;

    expectFailureSurface(container, "staged-preview-render-error", LOAD_FAILURE_COPY);
    const back = container.querySelector('a[href="/admin"]')!;
    expect(back.getAttribute("class")).toContain("min-h-tap-min");
    expectNoRawCode(container);
    // The boundary never leaks the thrown error's own text.
    expect(container.textContent).not.toContain("boom");
  });
});
