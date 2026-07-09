// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("@/lib/auth/picker/showPageChainRequest", () => ({ buildShowPageChainRequest: vi.fn(async () => new Request("http://internal/")) }));
vi.mock("@/lib/auth/picker/resolveShowPageAccess", () => ({ resolveShowPageAccess: vi.fn() }));
vi.mock("@/lib/data/getShowForViewer", async (orig) => ({ ...(await orig()), getShowForViewer: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServiceRoleClient: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }), redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }) }));

import ShowPage from "@/app/show/[slug]/[shareToken]/page";
import { resolveShowPageAccess } from "@/lib/auth/picker/resolveShowPageAccess";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { getShowForViewer, CrewMemberNotInShowError } from "@/lib/data/getShowForViewer";
import { messageFor } from "@/lib/messages/lookup";

function mockRosterClient(rows: unknown[]) {
  const q: any = { select: () => q, eq: () => q, order: () => Promise.resolve({ data: rows, error: null }) };
  (createSupabaseServiceRoleClient as any).mockReturnValue({ from: () => q });
}
function mockRosterError() {
  const q: any = { select: () => q, eq: () => q, order: () => Promise.resolve({ data: null, error: { message: "roster boom" } }) };
  (createSupabaseServiceRoleClient as any).mockReturnValue({ from: () => q });
}
const removedAccess = { kind: "removed_from_roster", showId: "sid", expectedEpoch: 3, expectedCrewMemberId: "cm1" };

function availabilityClient(showRow: { published: boolean; archived: boolean } | null, rosterRows: unknown[] = []) {
  (createSupabaseServiceRoleClient as any).mockReturnValue({
    from: (table: string) => {
      if (table === "shows") return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: showRow, error: null }) }) }) };
      const q: any = { select: () => q, eq: () => q, order: () => Promise.resolve({ data: rosterRows, error: null }) };
      return q;
    },
  });
}
const resolvedAccess = { kind: "resolved", showId: "sid", crewMemberId: "cm1" };

// A COMPLETE minimal ShowForViewer projection (mirrors tests/data/viewerContext.test.ts makeData). CrewShell
// dereferences `data.tileErrors` (Object.keys, _CrewShell.tsx:155) and — only when tileErrors is non-empty —
// `data.show.title` BEFORE resolveViewerContext (:213). With tileErrors:{} the shell reaches resolveViewerContext,
// which is where the malformed-projection throw belongs. `crewMembers` is overridden per test.
function fullShowForViewer(crewMembers: unknown) {
  return {
    show: { title: "S", client_label: null, dates: null, venue: null },
    crewMembers,
    hotelReservations: [], rooms: [], transportation: null, contacts: [],
    pullSheet: null, viewerName: null, viewerFlightInfo: null, viewerVersionToken: "",
    diagrams: null, openingReelHasVideo: false, lastSyncedAt: null, lastSyncStatus: null,
    tileErrors: {}, runOfShow: null, driveFileId: null, sourceAnchors: {},
  } as any;
}

describe("flow8 guided re-pick (Point A/B) + stale-arm refactor guards", () => {
  test("removed_from_roster arm still mounts StaleCleanupAutoSubmit after the renderPickerRepick refactor", async () => {
    (resolveShowPageAccess as any).mockResolvedValue(removedAccess);
    mockRosterClient([{ id: "cm1", name: "Doug", role: "A1", role_flags: [], claimed_via_oauth_at: null }]);
    const { container } = render(await ShowPage({ params: Promise.resolve({ slug: "s", shareToken: "t" }), searchParams: Promise.resolve({}) }));
    expect(container.querySelector('[data-testid="stale-cleanup-auto-submit"]')).not.toBeNull();
  });

  test("renderPickerRepick refactor-guard: removed_from_roster with a roster-read error still yields TerminalFailure, not a thrown render", async () => {
    (resolveShowPageAccess as any).mockResolvedValue(removedAccess);
    mockRosterError();
    const { container } = render(await ShowPage({ params: Promise.resolve({ slug: "s", shareToken: "t" }), searchParams: Promise.resolve({}) }));
    expect(container.querySelector('[data-testid="terminal-failure"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="picker-interstitial-root"]')).toBeNull();
  });

  test("Point A: CrewMemberNotInShowError + available show → PickerInterstitial re-pick w/ REMOVED_FROM_ROSTER banner, not TerminalFailure", async () => {
    (resolveShowPageAccess as any).mockResolvedValue(resolvedAccess);
    (getShowForViewer as any).mockRejectedValue(new CrewMemberNotInShowError());
    availabilityClient({ published: true, archived: false }, [{ id: "cmX", name: "Someone", role: "A1", role_flags: [], claimed_via_oauth_at: null }]);
    const { container } = render(await ShowPage({ params: Promise.resolve({ slug: "s", shareToken: "t" }), searchParams: Promise.resolve({}) }));
    expect(container.querySelector('[data-testid="picker-interstitial-root"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="terminal-failure"]')).toBeNull();
    // Pin the guided banner — spec requires PICKER_REMOVED_FROM_ROSTER_BANNER (not null / wrong banner).
    expect(container.querySelector('[data-testid="picker-banner"]')?.textContent).toContain(
      messageFor("PICKER_REMOVED_FROM_ROSTER_BANNER").crewFacing!,
    );
  });

  test("Point A: CrewMemberNotInShowError + deleted show (cascade) → notFound(), not picker", async () => {
    (resolveShowPageAccess as any).mockResolvedValue(resolvedAccess);
    (getShowForViewer as any).mockRejectedValue(new CrewMemberNotInShowError());
    availabilityClient(null);
    await expect(ShowPage({ params: Promise.resolve({ slug: "s", shareToken: "t" }), searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  test("Point B: well-formed projection missing the resolved id + available → re-pick w/ REMOVED_FROM_ROSTER banner", async () => {
    (resolveShowPageAccess as any).mockResolvedValue(resolvedAccess);
    (getShowForViewer as any).mockResolvedValue({ crewMembers: [{ id: "other", name: "X" }] });
    availabilityClient({ published: true, archived: false }, [{ id: "other", name: "X", role: "A1", role_flags: [], claimed_via_oauth_at: null }]);
    const { container } = render(await ShowPage({ params: Promise.resolve({ slug: "s", shareToken: "t" }), searchParams: Promise.resolve({}) }));
    expect(container.querySelector('[data-testid="picker-interstitial-root"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="picker-banner"]')?.textContent).toContain(
      messageFor("PICKER_REMOVED_FROM_ROSTER_BANNER").crewFacing!,
    );
  });

  test("Point B: projection missing id + deleted/missing show (cascade) → notFound(), not picker", async () => {
    (resolveShowPageAccess as any).mockResolvedValue(resolvedAccess);
    (getShowForViewer as any).mockResolvedValue({ crewMembers: [{ id: "other", name: "X" }] });
    availabilityClient(null); // show gone → "missing"
    await expect(ShowPage({ params: Promise.resolve({ slug: "s", shareToken: "t" }), searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  test("Point B: projection missing id + ARCHIVED show → notFound() (archived 404s, matches page.tsx:90-94)", async () => {
    (resolveShowPageAccess as any).mockResolvedValue(resolvedAccess);
    (getShowForViewer as any).mockResolvedValue({ crewMembers: [{ id: "other", name: "X" }] });
    availabilityClient({ published: true, archived: true }); // archived → "archived"
    await expect(ShowPage({ params: Promise.resolve({ slug: "s", shareToken: "t" }), searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  test("Point A: CrewMemberNotInShowError + UNPUBLISHED show → paused page (ShowUnavailable, HTTP 200), NOT notFound()", async () => {
    // Concrete failure mode this catches: collapsing `published !== true` into notFound(). The published-toggle
    // contract (page.tsx:96-100) renders <ShowUnavailable/> for a paused link so republish restores it; a 404
    // would break that. loadShowAvailability's discriminated "unpublished" arm must route here.
    //
    // REACHABILITY: the unpublished→renderRacedCrewMiss path is reachable ONLY via Point A (crew row gone →
    // :301 CrewMemberNotInShowError fires BEFORE getShowForViewer's own :320/:321 published check). A crew row
    // that is PRESENT on an unpublished show makes getShowForViewer throw a PLAIN Error at :321 (non-admin
    // published-gate) → the resolved-case catch routes that to TerminalFailure, never reaching Point B's
    // resolved-projection branch. So there is deliberately NO "Point B + unpublished" test — that state cannot
    // occur through real getShowForViewer; only Point A + unpublished (crew removed AND show paused) can.
    (resolveShowPageAccess as any).mockResolvedValue(resolvedAccess);
    (getShowForViewer as any).mockRejectedValue(new CrewMemberNotInShowError());
    availabilityClient({ published: false, archived: false }); // unpublished → "unpublished"
    const { container } = render(await ShowPage({ params: Promise.resolve({ slug: "s", shareToken: "t" }), searchParams: Promise.resolve({}) }));
    expect(container.querySelector('[data-testid="crew-show-paused-root"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="picker-interstitial-root"]')).toBeNull();
  });

  test("Point B fail-closed: TRUTHY NON-ARRAY crewMembers → NO page-level throw; CrewShell surfaces malformed-projection TerminalFailure (NOT the picker, NOT re-pick, NOT a raw Next error)", async () => {
    // Concrete failure mode this catches: computing `crew` via `data.crewMembers?.find(...)` outside an
    // Array.isArray block. Optional chaining does NOT protect a truthy non-array — `.find` would throw
    // "find is not a function" in page.tsx BEFORE _CrewShell can catch MalformedProjectionError, degrading
    // to a raw Next error boundary. CrewShell + resolveViewerContext render for real here (NOT mocked), so
    // the non-array reaches resolveViewerContext, which throws MalformedProjectionError → _CrewShell catch →
    // cataloged terminal-failure. A regressed page.tsx makes `render(await ShowPage(...))` REJECT instead.
    (resolveShowPageAccess as any).mockResolvedValue(resolvedAccess);
    (getShowForViewer as any).mockResolvedValue(fullShowForViewer({ length: 1 })); // complete fixture; crewMembers truthy, NOT an array
    // ShowPage must NOT throw at the page level (the Array.isArray guard prevents `.find` on a non-array);
    // it returns a CrewShell element. CrewShell is an async Server Component, so we invoke it directly
    // (mirrors tests/show/resolvedArmCrewMembersGuard.test.tsx) — resolveViewerContext throws
    // MalformedProjectionError inside it → _CrewShell catch → cataloged terminal-failure.
    const element = (await ShowPage({ params: Promise.resolve({ slug: "s", shareToken: "t" }), searchParams: Promise.resolve({}) })) as {
      props: Parameters<(typeof import("@/app/show/[slug]/[shareToken]/_CrewShell"))["CrewShell"]>[0];
    };
    const { CrewShell } = await import("@/app/show/[slug]/[shareToken]/_CrewShell");
    const node = await CrewShell(element.props);
    const { container } = render(<>{node}</>);
    expect(container.querySelector('[data-testid="terminal-failure"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="picker-interstitial-root"]')).toBeNull();
  });

  test("availability read infra error (Point A) → TerminalFailure, notFound NOT swallowed elsewhere", async () => {
    (resolveShowPageAccess as any).mockResolvedValue(resolvedAccess);
    (getShowForViewer as any).mockRejectedValue(new CrewMemberNotInShowError());
    // Roster read SUCCEEDS (roster is read first now); the shows read returns a Supabase { error } →
    // loadShowAvailability throws → caught INSIDE renderRacedCrewMiss's availability try/catch → TerminalFailure.
    (createSupabaseServiceRoleClient as any).mockReturnValue({
      from: (table: string) => {
        if (table === "shows") return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: "boom" } }) }) }) };
        const q: any = { select: () => q, eq: () => q, order: () => Promise.resolve({ data: [{ id: "cmX", name: "Someone", role: "A1", role_flags: [], claimed_via_oauth_at: null }], error: null }) };
        return q;
      },
    });
    const { container } = render(await ShowPage({ params: Promise.resolve({ slug: "s", shareToken: "t" }), searchParams: Promise.resolve({}) }));
    expect(container.querySelector('[data-testid="terminal-failure"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="picker-interstitial-root"]')).toBeNull();
  });

  test("Point A/B TOCTOU: roster (crew_members) is read BEFORE availability (shows); cascade-emptied roster + deleted show → notFound(), NOT an empty picker", async () => {
    // Concrete failure mode this catches: checking availability FIRST, then reading a now-empty roster and
    // rendering an EMPTY picker for a show that was deleted mid-request (crew_members ON DELETE CASCADE).
    // The fix reads the roster first and makes availability the FINAL gate, so an empty-roster+deleted-show
    // interleaving lands on notFound(). The ordering assertion pins WHY it is safe (not just the outcome).
    (resolveShowPageAccess as any).mockResolvedValue(resolvedAccess);
    (getShowForViewer as any).mockRejectedValue(new CrewMemberNotInShowError());
    const reads: string[] = [];
    (createSupabaseServiceRoleClient as any).mockReturnValue({
      from: (table: string) => {
        reads.push(table);
        if (table === "shows") return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }; // deleted
        const q: any = { select: () => q, eq: () => q, order: () => Promise.resolve({ data: [], error: null }) }; // cascade-emptied
        return q;
      },
    });
    await expect(ShowPage({ params: Promise.resolve({ slug: "s", shareToken: "t" }), searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
    // Availability must be the FINAL read: crew_members (roster) precedes shows (availability).
    expect(reads.indexOf("crew_members")).toBeGreaterThanOrEqual(0);
    expect(reads.indexOf("crew_members")).toBeLessThan(reads.indexOf("shows"));
  });

  test("Point B TOCTOU: RESOLVED projection missing the id (not a rejection) + cascade-emptied roster + deleted show → notFound(), roster read BEFORE availability", async () => {
    // Point B reaches renderRacedCrewMiss via a RETURNED projection whose crewMembers omits the resolved id
    // (distinct from Point A's rejected promise). Pins the SAME roster-first/availability-last ordering on the
    // Point B path so a divergent Point B implementation that skips the shared helper can't render an empty
    // picker for a deleted show and still pass.
    (resolveShowPageAccess as any).mockResolvedValue(resolvedAccess);
    (getShowForViewer as any).mockResolvedValue({ crewMembers: [{ id: "other", name: "X" }] }); // well-formed array, id absent
    const reads: string[] = [];
    (createSupabaseServiceRoleClient as any).mockReturnValue({
      from: (table: string) => {
        reads.push(table);
        if (table === "shows") return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }; // deleted
        const q: any = { select: () => q, eq: () => q, order: () => Promise.resolve({ data: [], error: null }) }; // cascade-emptied
        return q;
      },
    });
    await expect(ShowPage({ params: Promise.resolve({ slug: "s", shareToken: "t" }), searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(reads.indexOf("crew_members")).toBeGreaterThanOrEqual(0);
    expect(reads.indexOf("crew_members")).toBeLessThan(reads.indexOf("shows"));
  });

  test("renderPickerRepick roster-load failure (available show, crew_members read errors) → TerminalFailure, NOT a thrown render", async () => {
    (resolveShowPageAccess as any).mockResolvedValue(resolvedAccess);
    (getShowForViewer as any).mockRejectedValue(new CrewMemberNotInShowError()); // Point A → renderRacedCrewMiss → renderPickerRepick
    // shows read: available; crew_members read: Supabase error → loadRoster throws → renderPickerRepick's OWN catch → TerminalFailure.
    (createSupabaseServiceRoleClient as any).mockReturnValue({
      from: (table: string) => {
        if (table === "shows") return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { published: true, archived: false }, error: null }) }) }) };
        const q: any = { select: () => q, eq: () => q, order: () => Promise.resolve({ data: null, error: { message: "roster boom" } }) };
        return q;
      },
    });
    const { container } = render(await ShowPage({ params: Promise.resolve({ slug: "s", shareToken: "t" }), searchParams: Promise.resolve({}) }));
    expect(container.querySelector('[data-testid="terminal-failure"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="picker-interstitial-root"]')).toBeNull();
  });

  test("negative: generic getShowForViewer error → TerminalFailure, not re-pick", async () => {
    (resolveShowPageAccess as any).mockResolvedValue(resolvedAccess);
    (getShowForViewer as any).mockRejectedValue(new Error("PICKER_CREW_MEMBER_WRONG_SHOW")); // plain Error = :317/:321 shape
    const { container } = render(await ShowPage({ params: Promise.resolve({ slug: "s", shareToken: "t" }), searchParams: Promise.resolve({}) }));
    expect(container.querySelector('[data-testid="terminal-failure"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="picker-interstitial-root"]')).toBeNull();
  });
});
