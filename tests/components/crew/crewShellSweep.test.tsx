// @vitest-environment jsdom
/**
 * tests/components/crew/crewShellSweep.test.tsx
 *
 * Pins the two properties of the tile sweep that no per-component test can see,
 * both of which were adversarial-review findings against earlier drafts:
 *
 *  1. IDENTITY. Every section must receive the SAME ledger object the sweep
 *     reads. The required `ledger` prop only removes the silent-omission case;
 *     a caller can still type-safely hand a section a throwaway ledger, and
 *     every mock-shaped assertion would pass while that section's failures
 *     stayed invisible to the sweep. `Object.is` is the assertion that catches
 *     it — two fresh ledgers are deeply equal but not the same object.
 *
 *  2. DURABILITY. The registered callback must RETURN its promise.
 *     `after(() => { void sweep() })` returns before the write settles, so the
 *     runtime's keep-alive has nothing to wait on and a serverless freeze can
 *     still drop the row, which is the exact failure the after() wiring exists
 *     to prevent. Asserting merely that `after` was called does not catch this.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";

const { afterMock, sweepMock, seen } = vi.hoisted(() => ({
  afterMock: vi.fn(),
  sweepMock: vi.fn<(...args: unknown[]) => unknown>(),
  seen: [] as unknown[],
}));
vi.mock("next/server", () => ({ after: afterMock }));
vi.mock("@/lib/crew/sweepTileRenderAlerts", () => ({ sweepTileRenderAlerts: sweepMock }));

// The shell ALSO registers the real projection-alert resolver. Left live it
// would issue a Supabase call from the DB-free parallel project, and its pending
// promise would let a VOIDED sweep still look settled, defeating the durability
// assertion below. Neutralize both halves.
vi.mock("@/lib/adminAlerts/resolveAdminAlert", () => ({
  resolveAdminAlert: vi.fn(async () => undefined),
}));
vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({
  upsertAdminAlert: vi.fn(async () => null),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/show/acme-2026/tok",
  useSearchParams: () => new URLSearchParams(),
}));

// Every section records the ledger identity it was handed. Written out rather
// than looped: vi.mock is hoisted, so a loop variable in the specifier or
// factory is evaluated before its binding exists.
type LedgerProps = { ledger: unknown };
const spy = (name: string) => {
  const S = ({ ledger }: LedgerProps) => {
    seen.push(ledger);
    return <section data-testid={`section-${name}`} />;
  };
  S.displayName = `Spy(${name})`;
  return S;
};
vi.mock("@/components/crew/sections/TodaySection", () => ({ TodaySection: spy("today") }));
vi.mock("@/components/crew/sections/ScheduleSection", () => ({
  ScheduleSection: spy("schedule"),
}));
vi.mock("@/components/crew/sections/VenueSection", () => ({ VenueSection: spy("venue") }));
vi.mock("@/components/crew/sections/TravelSection", () => ({ TravelSection: spy("travel") }));
vi.mock("@/components/crew/sections/CrewSection", () => ({ CrewSection: spy("crew") }));
vi.mock("@/components/crew/sections/GearSection", () => ({ GearSection: spy("gear") }));
vi.mock("@/components/crew/sections/BudgetSection", () => ({ BudgetSection: spy("budget") }));

// Render EVERY built body. The real controller renders only the active section,
// so without this override the spies for the other six never run and the
// identity assertion could only ever see one of them.
vi.mock("@/components/crew/CrewSections", () => ({
  CrewSections: ({ sectionNodes }: { sectionNodes: Record<string, React.ReactNode> }) => (
    <>{Object.values(sectionNodes ?? {})}</>
  ),
}));

function makeData(viewerId: string | null) {
  return {
    show: { title: "Acme Show" },
    crewMembers: [],
    tileErrors: {},
    viewerId,
  } as unknown as import("@/lib/data/getShowForViewer").ShowForViewer;
}

async function renderCrewShellForTest(opts: { viewerId?: string | null } = {}) {
  const { CrewShell } = await import("@/app/show/[slug]/[shareToken]/_CrewShell");
  const element = await CrewShell({
    data: makeData(opts.viewerId === undefined ? "crew-dana" : opts.viewerId),
    viewer: { kind: "admin" },
    showId: "show-sweep",
  } as never);
  render(element);
}

/**
 * Invoke every registered after() callback and return the value of the one that
 * actually drove the sweep.
 *
 * No early return and no awaiting mid-loop: the shell registers the
 * projection-alert resolver first and the sweep second, and an await between
 * them made the delta detection unreliable. Call them all, remember the one that
 * incremented the sweep counter, then settle the rest.
 */
async function drainSweepCallback(): Promise<{ sweep: unknown }> {
  let sweepReturn: unknown;
  const others: unknown[] = [];
  for (const [cb] of afterMock.mock.calls) {
    const before = sweepMock.mock.calls.length;
    const returned = (cb as () => unknown)();
    if (sweepMock.mock.calls.length > before) sweepReturn = returned;
    else others.push(returned);
  }
  await Promise.all(others.map(async (o) => o));
  // BOXED deliberately. Returning `sweepReturn` bare from an async function
  // would auto-unwrap it, so the caller would receive the sweep's RESOLVED
  // VALUE (undefined) instead of the promise, and the durability assertion
  // below could never distinguish a returned promise from a voided call.
  return { sweep: sweepReturn };
}

beforeEach(() => {
  seen.length = 0;
  afterMock.mockClear();
  sweepMock.mockClear();
  sweepMock.mockImplementation(async () => undefined);
});

describe("the crew shell owns one ledger and sweeps THAT one", () => {
  test("every section receives the object the sweep reads", async () => {
    await renderCrewShellForTest();
    await drainSweepCallback();

    const swept = sweepMock.mock.calls[0]?.[0];
    expect(swept, "the sweep must have run").toBeDefined();
    expect(seen.length, "every entitled section must have received a ledger").toBeGreaterThan(0);
    for (const received of seen) {
      expect(
        Object.is(received, swept),
        "a section was handed a ledger the sweep does not read",
      ).toBe(true);
    }
  });

  // The shell is the ONLY place viewerKey is derived; every other test supplies
  // it by hand, so a shell that hardcoded "admin" would pass all of them and
  // silently collapse two crew viewers into one observer bucket.
  test("viewerKey is derived from the viewer, not hardcoded", async () => {
    await renderCrewShellForTest({ viewerId: "crew-dana" });
    await drainSweepCallback();
    expect((sweepMock.mock.calls[0]?.[1] as { viewerKey: string }).viewerKey).toBe("crew-dana");

    afterMock.mockClear();
    sweepMock.mockClear();
    await renderCrewShellForTest({ viewerId: null }); // plain admin
    await drainSweepCallback();
    expect((sweepMock.mock.calls[0]?.[1] as { viewerKey: string }).viewerKey).toBe("admin");
  });

  test("the registered callback RETURNS the sweep promise", async () => {
    let settled = false;
    sweepMock.mockImplementation(
      () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            settled = true;
            resolve();
          }, 0),
        ),
    );

    await renderCrewShellForTest();
    const { sweep: returned } = await drainSweepCallback();

    // Thenable, not `instanceof Promise`: the contract is that the runtime can
    // AWAIT what the callback returns. A voided call returns undefined and fails
    // here, which is the mutant this test exists to kill.
    expect(
      typeof (returned as { then?: unknown } | undefined)?.then,
      "the sweep callback must RETURN its promise, not void it",
    ).toBe("function");
    await returned;
    expect(settled).toBe(true);
  });
});
