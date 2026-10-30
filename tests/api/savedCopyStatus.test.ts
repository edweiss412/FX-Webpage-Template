/**
 * tests/api/savedCopyStatus.test.ts
 *
 * GET /api/saved-copy/status (spec §4.5). The route answers 200 {"state":"ended"}
 * only when the show row allows it (archived, exactly the archive's epoch bump,
 * no unpublish since the save) AND the page's own identity resolution names the
 * crew member whose viewer key the copy carries; 200 {"state":"gone"} otherwise;
 * 500 {"error":"SAVED_COPY_STATUS_LOOKUP_FAILED"} on an infra fault. Every
 * response is `Cache-Control: no-store`.
 *
 * `GET` is called directly with real `Request` objects built by the worker's own
 * URL builder (ruling D22). The identity boundaries are mocked as in the parity
 * suite (tests/auth/picker/savedCopyIdentityParity.test.ts) and the real
 * `resolveCrewIdentity` runs on top of them; the show row comes through the
 * mocked service-role client.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { GET } from "@/app/api/saved-copy/status/route";
import { resetLogSink, setLogSink, type LogRecord } from "@/lib/log";
import { statusOutcomeOf } from "@/lib/offline/protocol";
import {
  CREW_ID,
  EPOCH,
  OTHER_CREW_ID,
  PICKED_AT_MS,
  SAVED_AT,
  SHOW_ID,
  archive,
  baseWorld,
  installWorld,
  savedCopy,
  statusRequest,
  type World,
} from "../auth/picker/_savedCopyWorld";

const keyGate = vi.hoisted(() => ({ unavailable: false }));

vi.mock("@/lib/auth/isAdminSession", () => ({ isAdminSession: vi.fn() }));
vi.mock("@/lib/auth/validateGoogleSession", () => ({ validateGoogleSession: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));
// The real key, with a switch for the one case that needs it unavailable.
vi.mock("@/lib/offline/viewerKey", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/offline/viewerKey")>();
  return {
    viewerKey: (showId: string, crewMemberId: string) =>
      keyGate.unavailable ? null : actual.viewerKey(showId, crewMemberId),
  };
});

const LOOKUP_FAILED = { error: "SAVED_COPY_STATUS_LOOKUP_FAILED" };
const SAVED_AT_MS = Date.parse(SAVED_AT);

let records: LogRecord[];
let bodies: string[];

/** The archived show the copy outlived, identity passing: the `ended` baseline. */
function endedWorld(): World {
  return archive(baseWorld());
}

async function call(world: World, request: Request = statusRequest(world)) {
  installWorld(world);
  const response = await GET(request);
  const text = await response.text();
  bodies.push(text);
  return { response, status: response.status, body: JSON.parse(text) as unknown, text };
}

function lookupFailedSites(): unknown[] {
  return records
    .filter((r) => r.code === "SAVED_COPY_STATUS_LOOKUP_FAILED")
    .map((r) => {
      expect(r.level).toBe("error");
      expect(r.source).toBe("api.saved-copy.status");
      return r.context.site;
    });
}

beforeEach(() => {
  keyGate.unavailable = false;
  records = [];
  bodies = [];
  setLogSink((record) => {
    records.push(record);
  });
});

afterEach(() => {
  resetLogSink();
  // Neither the wire nor the log ever carries a crew member id.
  for (const crewId of [CREW_ID, OTHER_CREW_ID]) {
    for (const body of bodies) expect(body).not.toContain(crewId);
    expect(JSON.stringify(records)).not.toContain(crewId);
  }
});

describe("lifecycle, identity passing", () => {
  test("the archived show one epoch past the save, never unpublished, is ended", async () => {
    const { status, body } = await call(endedWorld());
    expect(status).toBe(200);
    expect(body).toEqual({ state: "ended" });
  });

  test("a show that is not archived is gone", async () => {
    const world = endedWorld();
    world.show!.archived = false;
    expect((await call(world)).body).toEqual({ state: "gone" });
  });

  test.each([
    ["0", EPOCH],
    ["2", EPOCH + 2],
  ])("an epoch gap of %s is gone", async (_gap, pickerEpoch) => {
    const world = endedWorld();
    world.show!.picker_epoch = pickerEpoch;
    expect((await call(world)).body).toEqual({ state: "gone" });
  });

  test("an epoch gap of 1 is ended", async () => {
    const world = endedWorld();
    expect(world.show!.picker_epoch).toBe(EPOCH + 1);
    expect((await call(world)).body).toEqual({ state: "ended" });
  });

  test("unpublished_at null is ended", async () => {
    const world = endedWorld();
    expect(world.show!.unpublished_at).toBeNull();
    expect((await call(world)).body).toEqual({ state: "ended" });
  });

  test("an unpublish earlier than the save is ended", async () => {
    const world = endedWorld();
    world.show!.unpublished_at = new Date(SAVED_AT_MS - 1).toISOString();
    expect((await call(world)).body).toEqual({ state: "ended" });
  });

  test("an unpublish at the instant of the save is gone", async () => {
    const world = endedWorld();
    world.show!.unpublished_at = SAVED_AT;
    expect((await call(world)).body).toEqual({ state: "gone" });
  });

  test("an unpublish later than the save is gone (R15)", async () => {
    const world = endedWorld();
    world.show!.unpublished_at = new Date(SAVED_AT_MS + 1).toISOString();
    expect((await call(world)).body).toEqual({ state: "gone" });
  });

  test("a missing show row is gone", async () => {
    const world = endedWorld();
    world.show = null;
    expect((await call(world)).body).toEqual({ state: "gone" });
  });
});

describe("identity", () => {
  test("an admin session is gone", async () => {
    const world = endedWorld();
    world.admin = { ok: true, email: "doug@example.com" };
    expect((await call(world)).body).toEqual({ state: "gone" });
  });

  test("identity resolving to a different crew member is gone", async () => {
    const world = endedWorld();
    world.selections = { [SHOW_ID]: { id: OTHER_CREW_ID, e: EPOCH, t: PICKED_AT_MS } };
    expect((await call(world)).body).toEqual({ state: "gone" });
  });

  test("a viewer key of a different length is gone, not a throw", async () => {
    const world = endedWorld();
    for (const viewer of ["x", `${savedCopy().viewer}A`]) {
      const result = await call(world, statusRequest(world, { ...savedCopy(), viewer }));
      expect(result.status).toBe(200);
      expect(result.body).toEqual({ state: "gone" });
    }
  });

  test("a viewer key of the same length that differs is gone", async () => {
    const world = endedWorld();
    const real = savedCopy().viewer;
    const viewer = `${real.slice(0, -1)}${real.endsWith("A") ? "B" : "A"}`;
    expect(viewer).toHaveLength(real.length);
    expect((await call(world, statusRequest(world, { ...savedCopy(), viewer }))).body).toEqual({
      state: "gone",
    });
  });
});

describe("infra faults answer 500 without a verdict", () => {
  test.each<[string, (world: World) => void, string]>([
    [
      "the service-role constructor throws",
      (w) => {
        w.serviceRoleThrows = true;
      },
      "service_role_client",
    ],
    [
      "the show-row read returns an error",
      (w) => {
        w.showReadError = { message: "upstream 502" };
      },
      "show_read",
    ],
    [
      "the show-row read throws",
      (w) => {
        w.showReadThrows = true;
      },
      "show_read_threw",
    ],
    [
      "isAdminSession reports its infra reason",
      (w) => {
        w.admin = { ok: false, reason: "infra_error" };
      },
      "admin_session",
    ],
    [
      "resolveCrewIdentity returns infra_error",
      (w) => {
        w.google = { kind: "terminal_failure", status: 500, code: "ADMIN_SESSION_LOOKUP_FAILED" };
      },
      "crew_identity",
    ],
    [
      "the viewer key is unavailable",
      () => {
        keyGate.unavailable = true;
      },
      "viewer_key",
    ],
  ])("%s", async (_label, fault, site) => {
    const world = endedWorld();
    const request = statusRequest(world);
    fault(world);
    const { status, body } = await call(world, request);
    expect(status).toBe(500);
    expect(body).toEqual(LOOKUP_FAILED);
    expect(lookupFailedSites()).toEqual([site]);
  });
});

describe("malformed or missing parameters answer gone without touching the database", () => {
  test.each<[string, (url: URL) => void]>([
    ["no show", (u) => u.searchParams.delete("show")],
    ["a non-UUID show", (u) => u.searchParams.set("show", "not-a-uuid")],
    ["no epoch", (u) => u.searchParams.delete("epoch")],
    ["a negative epoch", (u) => u.searchParams.set("epoch", "-1")],
    ["a non-integer epoch", (u) => u.searchParams.set("epoch", "6.5")],
    ["an empty epoch", (u) => u.searchParams.set("epoch", "")],
    ["no viewer", (u) => u.searchParams.delete("viewer")],
    ["an empty viewer", (u) => u.searchParams.set("viewer", "")],
    ["no saved", (u) => u.searchParams.delete("saved")],
    ["an unparseable saved", (u) => u.searchParams.set("saved", "yesterday-ish")],
  ])("%s", async (_label, edit) => {
    const world = endedWorld();
    const { status, body } = await call(world, statusRequest(world, savedCopy(), edit));
    expect(status).toBe(200);
    expect(body).toEqual({ state: "gone" });
    expect(world.serviceRoleConstructions).toBe(0);
    expect(world.fromCalls).toEqual([]);
  });

  test("premise: the unedited request reaches the database", async () => {
    const world = endedWorld();
    await call(world);
    expect(world.fromCalls).toContain("shows");
  });
});

describe("Cache-Control: no-store on every response class", () => {
  test.each<[string, (world: World) => Request, number, "ended" | "gone" | "no-verdict"]>([
    ["ended", (w) => statusRequest(w), 200, "ended"],
    [
      "gone",
      (w) => {
        w.show!.archived = false;
        return statusRequest(w);
      },
      200,
      "gone",
    ],
    [
      "500",
      (w) => {
        w.showReadThrows = true;
        return statusRequest(w);
      },
      500,
      "no-verdict",
    ],
    [
      "malformed-parameter gone",
      (w) => statusRequest(w, savedCopy(), (u) => u.searchParams.delete("show")),
      200,
      "gone",
    ],
  ])("%s", async (_label, build, expectedStatus, outcome) => {
    const world = endedWorld();
    const request = build(world);
    const { response, status, text } = await call(world, request);
    expect(status).toBe(expectedStatus);
    expect(response.headers.get("cache-control")).toBe("no-store");
    // The worker's own reading of this answer (lib/offline/protocol.ts).
    expect(statusOutcomeOf(status, text)).toBe(outcome);
  });
});
