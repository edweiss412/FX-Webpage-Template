/**
 * tests/auth/picker/savedCopyIdentityParity.test.ts
 *
 * Spec §4.5: the saved-copy status route must decide identity exactly as the
 * crew page does. One table of identity scenarios runs twice per row: through
 * `resolveShowPageAccess` for the live show (allow iff `resolved` for the crew
 * member the copy was saved for), and through the status route's `GET` for the
 * same show archived with `picker_epoch` one higher (allow iff `ended`). Both
 * paths run the real `resolveCrewIdentity`; only its boundaries are mocked (the
 * admin session, the Google session, and the Supabase clients behind the show
 * row, the roster and `auth_email_canonical`), and the picker cookie is a real
 * signed envelope. A new identity input added to the page fails here until the
 * route consults it too.
 *
 * `resolveCrewIdentity` is wrapped, not replaced: the wrapper calls the real
 * function and records the outcome kind each path produced, so every row also
 * proves both paths reached the same identity verdict.
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { GET } from "@/app/api/saved-copy/status/route";
import {
  CREW_IDENTITY_OUTCOMES,
  type CrewIdentityResult,
} from "@/lib/auth/picker/resolveCrewIdentity";
import { resolveShowPageAccess } from "@/lib/auth/picker/resolveShowPageAccess";
import { premiseHolds } from "@/tests/_shared/premise";
import {
  CREW_EMAIL,
  CREW_ID,
  EPOCH,
  OTHER_CREW_ID,
  OTHER_SHOW_ID,
  PICKED_AT_MS,
  SHARE_TOKEN,
  SHOW_ID,
  SLUG,
  archive,
  baseWorld,
  crewRow,
  installWorld,
  pageRequest,
  statusRequest,
  type World,
} from "./_savedCopyWorld";

type IdentityKind = CrewIdentityResult["kind"];

const observed = vi.hoisted(() => ({ kinds: [] as string[] }));

vi.mock("@/lib/auth/isAdminSession", () => ({ isAdminSession: vi.fn() }));
vi.mock("@/lib/auth/validateGoogleSession", () => ({ validateGoogleSession: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));
vi.mock("@/lib/auth/picker/resolveCrewIdentity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/picker/resolveCrewIdentity")>();
  return {
    ...actual,
    resolveCrewIdentity: async (input: Parameters<typeof actual.resolveCrewIdentity>[0]) => {
      const result = await actual.resolveCrewIdentity(input);
      observed.kinds.push(result.kind);
      return result;
    },
  };
});

const BEFORE_PICK = new Date(PICKED_AT_MS - 60_000).toISOString();
const AFTER_PICK = new Date(PICKED_AT_MS + 60_000).toISOString();

function googleFor(crewMemberId: string): World["google"] {
  return {
    kind: "success",
    viewer: { kind: "crew", email: CREW_EMAIL, showId: SHOW_ID, crewMemberId },
  };
}

type Scenario = {
  name: string;
  /** What the real resolveCrewIdentity returns on both paths; null where it never runs. */
  identity: IdentityKind | null;
  /** allow: the page resolves the saved crew member and the route says ended. infra: both fail closed. */
  verdict: "allow" | "deny" | "infra";
  arrange: (world: World) => void;
};

const SCENARIOS: readonly Scenario[] = [
  {
    name: "admin session: none",
    identity: "resolved",
    verdict: "allow",
    arrange: () => {},
  },
  {
    name: "admin session: present (an admin is never this crew member)",
    identity: null,
    verdict: "deny",
    arrange: (w) => {
      w.admin = { ok: true, email: "doug@example.com" };
    },
  },
  {
    name: "admin session: lookup fails",
    identity: null,
    verdict: "infra",
    arrange: (w) => {
      w.admin = { ok: false, reason: "infra_error" };
    },
  },
  {
    name: "picker entry: present for this show",
    identity: "resolved",
    verdict: "allow",
    arrange: () => {},
  },
  {
    name: "picker entry: no picker cookie at all",
    identity: "no_auth",
    verdict: "deny",
    arrange: (w) => {
      w.selections = null;
    },
  },
  {
    name: "picker entry: only for another show",
    identity: "no_auth",
    verdict: "deny",
    arrange: (w) => {
      w.selections = { [OTHER_SHOW_ID]: { id: CREW_ID, e: EPOCH, t: PICKED_AT_MS } };
    },
  },
  {
    name: "picker entry: for the saved crew member",
    identity: "resolved",
    verdict: "allow",
    arrange: () => {},
  },
  {
    name: "picker entry: for a different crew member on the roster",
    identity: "resolved",
    verdict: "deny",
    arrange: (w) => {
      w.selections = { [SHOW_ID]: { id: OTHER_CREW_ID, e: EPOCH, t: PICKED_AT_MS } };
    },
  },
  {
    name: "picker entry epoch: the saved epoch",
    identity: "resolved",
    verdict: "allow",
    arrange: () => {},
  },
  {
    name: "picker entry epoch: stale",
    identity: "epoch_stale",
    verdict: "deny",
    arrange: (w) => {
      w.selections = { [SHOW_ID]: { id: CREW_ID, e: EPOCH - 1, t: PICKED_AT_MS } };
    },
  },
  {
    name: "roster: still a member",
    identity: "resolved",
    verdict: "allow",
    arrange: () => {},
  },
  {
    name: "roster: removed",
    identity: "removed_from_roster",
    verdict: "deny",
    arrange: (w) => {
      w.crew = w.crew.filter((member) => member.id !== CREW_ID);
    },
  },
  {
    name: "selections_reset_at: before the pick",
    identity: "resolved",
    verdict: "allow",
    arrange: (w) => {
      crewRow(w, CREW_ID).selections_reset_at = BEFORE_PICK;
    },
  },
  {
    name: "selections_reset_at: after the pick",
    identity: "selection_reset",
    verdict: "deny",
    arrange: (w) => {
      crewRow(w, CREW_ID).selections_reset_at = AFTER_PICK;
    },
  },
  {
    name: "claimed_via_oauth_at: before the pick",
    identity: "resolved",
    verdict: "allow",
    arrange: (w) => {
      crewRow(w, CREW_ID).claimed_via_oauth_at = BEFORE_PICK;
    },
  },
  {
    name: "claimed_via_oauth_at: after the pick",
    identity: "identity_invalidated",
    verdict: "deny",
    arrange: (w) => {
      crewRow(w, CREW_ID).claimed_via_oauth_at = AFTER_PICK;
    },
  },
  {
    name: "signed-in email: equal to the crew row",
    identity: "resolved",
    verdict: "allow",
    arrange: (w) => {
      w.sessionEmail = CREW_EMAIL;
    },
  },
  {
    name: "signed-in email: different from the crew row",
    identity: "identity_invalidated",
    verdict: "deny",
    arrange: (w) => {
      w.sessionEmail = "mallory@example.com";
    },
  },
  {
    name: "Google session: matches the entry",
    identity: "resolved",
    verdict: "allow",
    arrange: (w) => {
      w.google = googleFor(CREW_ID);
      w.sessionEmail = CREW_EMAIL;
      crewRow(w, CREW_ID).claimed_via_oauth_at = BEFORE_PICK;
    },
  },
  {
    name: "Google session: no crew match",
    identity: "no_auth",
    verdict: "deny",
    arrange: (w) => {
      w.google = { kind: "continue", code: "GOOGLE_NO_CREW_MATCH" };
    },
  },
  {
    name: "Google session: the entry names someone else (bootstrap)",
    identity: "needs_picker_bootstrap",
    verdict: "deny",
    arrange: (w) => {
      w.google = googleFor(CREW_ID);
      w.selections = { [SHOW_ID]: { id: OTHER_CREW_ID, e: EPOCH, t: PICKED_AT_MS } };
      crewRow(w, CREW_ID).claimed_via_oauth_at = BEFORE_PICK;
    },
  },
  {
    name: "Google session: for an unclaimed member",
    identity: "needs_picker_bootstrap",
    verdict: "deny",
    arrange: (w) => {
      w.google = googleFor(CREW_ID);
    },
  },
  {
    name: "Google session: a reset after the pick",
    identity: "needs_picker_bootstrap",
    verdict: "deny",
    arrange: (w) => {
      w.google = googleFor(CREW_ID);
      crewRow(w, CREW_ID).claimed_via_oauth_at = BEFORE_PICK;
      crewRow(w, CREW_ID).selections_reset_at = AFTER_PICK;
    },
  },
  {
    name: "Google session: terminal failure",
    identity: "infra_error",
    verdict: "infra",
    arrange: (w) => {
      w.google = { kind: "terminal_failure", status: 500, code: "ADMIN_SESSION_LOOKUP_FAILED" };
    },
  },
];

/**
 * The one outcome the table cannot reach (ruling D7). The page reaches it when
 * the show is archived or unpublished between its own gate and the picker's read;
 * the route's saved mode skips that check by design, because it applies the
 * lifecycle conditions itself. Pinned by its own page-only case below.
 */
const EXEMPT: Readonly<Partial<Record<IdentityKind, string>>> = {
  show_unavailable: "page-path lifecycle race; saved mode skips the lifecycle check by design",
};

function liveWorld(scenario: Scenario): World {
  const world = baseWorld();
  scenario.arrange(world);
  return world;
}

function archivedWorld(scenario: Scenario): World {
  const world = baseWorld();
  scenario.arrange(world);
  return archive(world);
}

async function runPage(world: World) {
  installWorld(world);
  observed.kinds = [];
  const result = await resolveShowPageAccess({
    slug: SLUG,
    shareToken: SHARE_TOKEN,
    req: pageRequest(world),
  });
  return { result, identity: [...observed.kinds] };
}

async function runRoute(world: World) {
  installWorld(world);
  observed.kinds = [];
  const response = await GET(statusRequest(world));
  const body: unknown = await response.json();
  return { response, body, identity: [...observed.kinds] };
}

beforeEach(() => {
  observed.kinds = [];
});

describe("saved-copy identity parity (spec §4.5)", () => {
  test("the table covers every identity outcome but the one asserted exemption", () => {
    expect(Object.keys(EXEMPT)).toEqual(["show_unavailable"]);
    for (const kind of Object.keys(EXEMPT)) {
      expect(CREW_IDENTITY_OUTCOMES as readonly string[]).toContain(kind);
    }

    const declared = new Set(SCENARIOS.flatMap((s) => (s.identity === null ? [] : [s.identity])));
    const required = CREW_IDENTITY_OUTCOMES.filter((kind) => !(kind in EXEMPT));
    expect(required.filter((kind) => !declared.has(kind))).toEqual([]);
    expect([...declared].filter((kind) => kind in EXEMPT)).toEqual([]);
  });

  test("the table holds at least one allow and one deny", () => {
    premiseHolds(
      "the parity table has an allow row",
      SCENARIOS.some((s) => s.verdict === "allow"),
    );
    premiseHolds(
      "the parity table has a deny row",
      SCENARIOS.some((s) => s.verdict !== "allow"),
    );
  });

  test.each(SCENARIOS)("$name", async (scenario) => {
    const expectedIdentity = scenario.identity === null ? [] : [scenario.identity];

    const page = await runPage(liveWorld(scenario));
    const route = await runRoute(archivedWorld(scenario));

    const pageAllows = page.result.kind === "resolved" && page.result.crewMemberId === CREW_ID;
    const routeAllows = route.response.status === 200 && isState(route.body, "ended");

    expect({ page: pageAllows, route: routeAllows }).toEqual({
      page: scenario.verdict === "allow",
      route: scenario.verdict === "allow",
    });
    expect({ page: page.identity, route: route.identity }).toEqual({
      page: expectedIdentity,
      route: expectedIdentity,
    });

    if (scenario.verdict === "infra") {
      expect(page.result.kind).toBe("infra_error");
      expect(route.response.status).toBe(500);
    } else if (scenario.verdict === "deny") {
      expect(route.response.status).toBe(200);
      expect(route.body).toEqual({ state: "gone" });
    }
  });

  test("show_unavailable is a page-path lifecycle race the saved mode never produces", async () => {
    const live = baseWorld();
    // The page's own gate reads the show live; it is archived before the picker reads it again.
    live.afterFirstShowRead = (show) => {
      show.archived = true;
    };
    const page = await runPage(live);
    expect(page.result).toEqual({ kind: "show_unavailable" });
    expect(page.identity).toEqual(["show_unavailable"]);

    // The route reads an archived show by construction; its identity check never asks.
    const route = await runRoute(archive(baseWorld()));
    expect(route.identity).toEqual(["resolved"]);
    expect(route.body).toEqual({ state: "ended" });
  });
});

function isState(body: unknown, state: "ended" | "gone"): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    "state" in body &&
    (body as { state: unknown }).state === state
  );
}
