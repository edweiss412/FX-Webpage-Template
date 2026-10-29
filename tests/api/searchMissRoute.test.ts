// tests/api/searchMissRoute.test.ts
//
// POST /api/show/[slug]/search-miss (crew show search spec §7.2, §7.3, §11.4). The route answers
// 204 to every well-formed request, so every case below asserts on what it DID, through three
// observers: the service-role client constructor and the two access helpers (was the database
// reached, and in which order), and a log sink on the real logger (what was recorded, and whether
// it persists).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { NextRequest } from "next/server";
import { resetLogSink, setLogSink, type LogRecord } from "@/lib/log";

const SHOW_ID = "11111111-1111-4111-8111-111111111111";
const CREW_MEMBER_ID = "22222222-2222-4222-8222-222222222222";
const PICKER_COOKIE_VALUE = "signed-envelope-value";

const h = vi.hoisted(() => ({
  admin: { ok: false, reason: "not_admin" } as
    | { ok: true; email: string }
    | { ok: false; reason: "not_admin" | "infra_error" },
  picker: { kind: "no_selection" } as unknown,
  pickerCalls: [] as Array<{ showId: string; cookie: string | undefined }>,
  adminCalls: 0,
  constructorCalls: 0,
  throwOnConstruct: false,
  showRow: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
  showError: null as unknown,
  slugLookups: [] as string[],
}));

vi.mock("@/lib/auth/isAdminSession", () => ({
  isAdminSession: async () => {
    h.adminCalls += 1;
    return h.admin;
  },
}));

vi.mock("@/lib/auth/picker/resolvePickerSelection", () => ({
  resolvePickerSelection: async (input: { showId: string; cookie: string | undefined }) => {
    h.pickerCalls.push(input);
    return h.picker;
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => {
    h.constructorCalls += 1;
    if (h.throwOnConstruct) throw new Error("simulated service-role construction fault");
    return {
      from: (table: string) => {
        if (table !== "shows") throw new Error(`unexpected table ${table}`);
        return {
          select: () => ({
            eq: (_column: string, slug: string) => ({
              maybeSingle: async () => {
                h.slugLookups.push(slug);
                return { data: h.showRow, error: h.showError };
              },
            }),
          }),
        };
      },
    };
  },
}));

const { POST, __resetSearchMissStateForTests } =
  await import("@/app/api/show/[slug]/search-miss/route");

type Sunk = { record: LogRecord; persist: boolean };
let misses: Sunk[] = [];
let others: Sunk[] = [];

const T0 = new Date("2026-10-27T12:00:00.000Z").getTime();
const WINDOW_MS = 60_000;
const BODY_LIMIT_BYTES = 2048;

function req(
  body: unknown,
  opts: { slug?: string; headers?: Record<string, string> } = {},
): NextRequest {
  return new Request(`http://localhost/api/show/${opts.slug ?? "test-show"}/search-miss`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
      cookie: `__Host-fxav_picker=${PICKER_COOKIE_VALUE}`,
      ...opts.headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

function ctx(slug = "test-show") {
  return { params: Promise.resolve({ slug }) };
}

async function post(body: unknown, opts: { slug?: string; headers?: Record<string, string> } = {}) {
  return POST(req(body, opts), ctx(opts.slug));
}

function codes(level: LogRecord["level"], code: string): Sunk[] {
  return others.filter((s) => s.record.level === level && s.record.code === code);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
  __resetSearchMissStateForTests();
  h.admin = { ok: false, reason: "not_admin" };
  h.picker = { kind: "resolved", crewMemberId: CREW_MEMBER_ID };
  h.pickerCalls = [];
  h.adminCalls = 0;
  h.constructorCalls = 0;
  h.throwOnConstruct = false;
  h.showRow = { id: SHOW_ID };
  h.showError = null;
  h.slugLookups = [];
  misses = [];
  others = [];
  // The spy records a miss only once it has OBSERVED the code on the record; everything else
  // goes to `others`, so a success assertion cannot be satisfied by an unrelated emit.
  setLogSink((record, persist) => {
    if (record.code === "CREW_SEARCH_NO_RESULTS") misses.push({ record, persist });
    else others.push({ record, persist });
  });
});

afterEach(() => {
  resetLogSink();
  vi.useRealTimers();
  delete process.env.NEXT_PUBLIC_SITE_ORIGIN;
});

describe("POST /api/show/[slug]/search-miss: success", () => {
  test("a crew viewer's miss is recorded with the code, the show and the query, and nothing about the viewer", async () => {
    const res = await post(
      { query: "  wifi pasword  " },
      {
        headers: {
          "user-agent": "Mozilla/5.0 (iPhone) sentinel-user-agent",
          "x-forwarded-for": "203.0.113.77",
        },
      },
    );

    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
    expect(h.slugLookups).toEqual(["test-show"]);
    expect(h.pickerCalls).toEqual([{ showId: SHOW_ID, cookie: PICKER_COOKIE_VALUE }]);
    expect(misses).toHaveLength(1);
    const { record, persist } = misses[0]!;
    expect(persist).toBe(true);
    expect(record.level).toBe("info");
    expect(record.source).toBe("crew-search-miss");
    expect(record.showId).toBe(SHOW_ID);
    expect(record.actorHash).toBeNull();
    expect(record.context).toEqual({ query: "wifi pasword" });
    const serialized = JSON.stringify(record);
    for (const forbidden of [
      CREW_MEMBER_ID,
      PICKER_COOKIE_VALUE,
      "sentinel-user-agent",
      "203.0.113.77",
    ]) {
      expect(serialized, `record must not carry ${forbidden}`).not.toContain(forbidden);
    }
    expect(others).toEqual([]);
  });

  test("query length: exactly 2 characters is recorded; over 100 is cut to 100", async () => {
    await post({ query: " ab " });
    const long = `${"x".repeat(99)}yz${"q".repeat(40)}`;
    await post({ query: long });

    expect(misses.map((m) => m.record.context.query)).toEqual(["ab", long.slice(0, 100)]);
    expect((misses[1]!.record.context.query as string).length).toBe(100);
  });

  test("the 100-character cut counts code points, so an astral character on the boundary is kept whole", async () => {
    // U+1F3A4 (microphone) is one code point and two UTF-16 units. Placed at code point 100 it
    // straddles UTF-16 index 100, where a unit-based cut would leave a lone high surrogate that
    // Postgres jsonb refuses.
    const mic = "\u{1F3A4}";
    const query = `${"x".repeat(99)}${mic}tail`;
    expect(mic.length).toBe(2);
    expect(Array.from(query)).toHaveLength(104);

    await post({ query });

    expect(misses).toHaveLength(1);
    const recorded = misses[0]!.record.context.query as string;
    expect(recorded).toBe(`${"x".repeat(99)}${mic}`);
    expect(Array.from(recorded)).toHaveLength(100);
    expect(recorded.isWellFormed()).toBe(true);
  });
});

describe("POST /api/show/[slug]/search-miss: malformed requests", () => {
  test("bad origin: a cross-site stamp, or no stamp and a foreign Origin, is refused before any work", async () => {
    process.env.NEXT_PUBLIC_SITE_ORIGIN = "https://crew.fxav.test";
    const crossSite = await post(
      { query: "wifi" },
      { headers: { "sec-fetch-site": "cross-site" } },
    );
    const foreignNoStamp = await POST(
      new Request("http://localhost/api/show/test-show/search-miss", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://evil.example" },
        body: JSON.stringify({ query: "wifi" }),
      }) as unknown as NextRequest,
      ctx(),
    );

    expect(crossSite.status).toBe(403);
    expect(foreignNoStamp.status).toBe(403);
    expect(h.constructorCalls).toBe(0);
    expect(misses).toEqual([]);

    // Control: no stamp but the site's own Origin is same-origin, and is recorded.
    const matching = await POST(
      new Request("http://localhost/api/show/test-show/search-miss", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://crew.fxav.test",
          cookie: `__Host-fxav_picker=${PICKER_COOKIE_VALUE}`,
        },
        body: JSON.stringify({ query: "wifi" }),
      }) as unknown as NextRequest,
      ctx(),
    );
    expect(matching.status).toBe(204);
    expect(misses).toHaveLength(1);
  });

  test("bad content type is 400 before any database work", async () => {
    for (const contentType of ["text/plain", "application/x-www-form-urlencoded"]) {
      const res = await post({ query: "wifi" }, { headers: { "content-type": contentType } });
      expect(res.status, contentType).toBe(400);
    }
    expect(h.constructorCalls).toBe(0);
    expect(misses).toEqual([]);
  });

  test("a body over 2 KB is 400; a body of exactly 2 KB is read", async () => {
    const shell = JSON.stringify({ query: "wifi", pad: "" });
    const exact = JSON.stringify({
      query: "wifi",
      pad: "p".repeat(BODY_LIMIT_BYTES - shell.length),
    });
    const over = JSON.stringify({
      query: "wifi",
      pad: "p".repeat(BODY_LIMIT_BYTES - shell.length + 1),
    });
    expect(new TextEncoder().encode(exact).byteLength).toBe(BODY_LIMIT_BYTES);
    expect(new TextEncoder().encode(over).byteLength).toBe(BODY_LIMIT_BYTES + 1);

    const overRes = await post(over);
    expect(overRes.status).toBe(400);
    expect(h.constructorCalls).toBe(0);
    expect(misses).toEqual([]);

    const exactRes = await post(exact);
    expect(exactRes.status).toBe(204);
    expect(misses).toHaveLength(1);
  });

  test("malformed JSON, a non-object body, and a missing, non-string or short query are 400 with no work", async () => {
    for (const body of [
      "{not json",
      "",
      "null",
      "[]",
      '"wifi"',
      {},
      { query: 42 },
      { query: null },
      { query: "w" },
      { query: "   " },
      { query: " w " },
    ]) {
      const res = await post(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect(h.constructorCalls).toBe(0);
    expect(h.adminCalls).toBe(0);
    expect(misses).toEqual([]);
  });
});

describe("POST /api/show/[slug]/search-miss: access", () => {
  test("an unknown slug is 204 with nothing logged and no session lookup", async () => {
    h.showRow = null;
    const res = await post({ query: "wifi" }, { slug: "no-such-show" });

    expect(res.status).toBe(204);
    expect(h.slugLookups).toEqual(["no-such-show"]);
    expect(h.adminCalls).toBe(0);
    expect(h.pickerCalls).toEqual([]);
    expect(misses).toEqual([]);
    expect(others).toEqual([]);
  });

  test("an admin session is 204 and NOT logged, and the picker is never consulted", async () => {
    h.admin = { ok: true, email: "doug@example.com" };
    const res = await post({ query: "wifi" });

    expect(res.status).toBe(204);
    expect(h.adminCalls).toBe(1);
    expect(h.pickerCalls).toEqual([]);
    expect(misses).toEqual([]);
    expect(others).toEqual([]);
  });

  test("every picker outcome other than a resolved selection is 204 with nothing logged", async () => {
    const outcomes: unknown[] = [
      { kind: "no_selection" },
      { kind: "epoch_stale", expectedEpoch: 2, expectedCrewMemberId: CREW_MEMBER_ID },
      { kind: "removed_from_roster", expectedEpoch: 2, expectedCrewMemberId: CREW_MEMBER_ID },
      { kind: "selection_reset", expectedEpoch: 2, expectedCrewMemberId: CREW_MEMBER_ID },
      {
        kind: "identity_invalidated",
        reason: "session_mismatch",
        expectedEpoch: 2,
        expectedCrewMemberId: CREW_MEMBER_ID,
      },
      { kind: "show_unavailable" },
    ];
    for (const outcome of outcomes) {
      h.picker = outcome;
      const res = await post({ query: "wifi" });
      expect(res.status, JSON.stringify(outcome)).toBe(204);
    }
    expect(h.pickerCalls).toHaveLength(outcomes.length);
    expect(misses).toEqual([]);
    expect(others).toEqual([]);
  });

  test("no picker cookie at all reaches the resolver with no cookie and is not logged", async () => {
    h.picker = { kind: "no_selection" };
    const res = await post({ query: "wifi" }, { headers: { cookie: "unrelated=1" } });

    expect(res.status).toBe(204);
    expect(h.pickerCalls).toEqual([{ showId: SHOW_ID, cookie: undefined }]);
    expect(misses).toEqual([]);
  });
});

describe("POST /api/show/[slug]/search-miss: infra faults", () => {
  test("a returned slug-lookup error is 204 and warns CREW_SEARCH_MISS_INFRA_ERROR once per window", async () => {
    h.showError = { message: "synthetic upstream 502" };

    const first = await post({ query: "wifi" });
    const second = await post({ query: "dock" });

    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
    expect(h.adminCalls).toBe(0);
    expect(misses).toEqual([]);
    expect(codes("warn", "CREW_SEARCH_MISS_INFRA_ERROR")).toHaveLength(1);
    expect(codes("warn", "CREW_SEARCH_MISS_INFRA_ERROR")[0]!.persist).toBe(true);

    vi.setSystemTime(T0 + WINDOW_MS);
    await post({ query: "hotel" });
    expect(codes("warn", "CREW_SEARCH_MISS_INFRA_ERROR")).toHaveLength(2);
  });

  test("a thrown client construction is an infra fault, not an unknown slug", async () => {
    h.throwOnConstruct = true;
    const res = await post({ query: "wifi" });

    expect(res.status).toBe(204);
    expect(h.adminCalls).toBe(0);
    expect(codes("warn", "CREW_SEARCH_MISS_INFRA_ERROR")).toHaveLength(1);
    expect(misses).toEqual([]);
  });

  test("an admin-session infra fault warns and never falls through to the picker", async () => {
    h.admin = { ok: false, reason: "infra_error" };
    const res = await post({ query: "wifi" });

    expect(res.status).toBe(204);
    expect(h.pickerCalls).toEqual([]);
    expect(codes("warn", "CREW_SEARCH_MISS_INFRA_ERROR")).toHaveLength(1);
    expect(misses).toEqual([]);
  });

  test("the infra warning is once per window ACROSS stages, not once per stage", async () => {
    // Three different stages fail in one window: the admin session, then the picker, then the
    // slug lookup. The once-per-window flag is shared, so only the first of them warns.
    h.admin = { ok: false, reason: "infra_error" };
    await post({ query: "wifi" });
    h.admin = { ok: false, reason: "not_admin" };
    h.picker = { kind: "infra_error", code: "PICKER_RESOLVER_LOOKUP_FAILED" };
    await post({ query: "dock" });
    h.showError = { message: "synthetic upstream 502" };
    await post({ query: "hotel" });

    // Premise: each request really reached its stage (the slug lookup ran three times, the admin
    // check twice, the picker once), so the single warning is the flag, not a request that never
    // got as far as its fault.
    expect(h.slugLookups).toHaveLength(3);
    expect(h.adminCalls).toBe(2);
    expect(h.pickerCalls).toHaveLength(1);
    const warns = codes("warn", "CREW_SEARCH_MISS_INFRA_ERROR");
    expect(warns.map((w) => w.record.context.stage)).toEqual(["admin_session"]);
    expect(misses).toEqual([]);

    // A new window warns again, whichever stage fails first in it.
    vi.setSystemTime(T0 + WINDOW_MS);
    await post({ query: "parking" });
    expect(
      codes("warn", "CREW_SEARCH_MISS_INFRA_ERROR").map((w) => w.record.context.stage),
    ).toEqual(["admin_session", "show_lookup"]);
  });

  test("a picker infra fault warns and records no miss", async () => {
    h.picker = { kind: "infra_error", code: "PICKER_RESOLVER_LOOKUP_FAILED" };
    const res = await post({ query: "wifi" });

    expect(res.status).toBe(204);
    expect(codes("warn", "CREW_SEARCH_MISS_INFRA_ERROR")).toHaveLength(1);
    expect(misses).toEqual([]);
  });
});

describe("POST /api/show/[slug]/search-miss: rate limit", () => {
  test("the 121st request in a window across all shows is 204 with no database or session call, and warns once", async () => {
    for (let i = 0; i < 120; i += 1) {
      const res = await post({ query: "wifi" }, { slug: `show-${i % 8}` });
      expect(res.status).toBe(204);
    }
    expect(misses).toHaveLength(120);
    expect(h.constructorCalls).toBe(120);
    const adminBefore = h.adminCalls;

    const capped = await post({ query: "wifi" }, { slug: "show-fresh" });
    const cappedAgain = await post({ query: "dock" }, { slug: "show-other" });

    expect(capped.status).toBe(204);
    expect(cappedAgain.status).toBe(204);
    expect(h.constructorCalls).toBe(120);
    expect(h.adminCalls).toBe(adminBefore);
    expect(misses).toHaveLength(120);
    const warns = codes("warn", "CREW_SEARCH_MISS_RATE_CAPPED");
    expect(warns).toHaveLength(1);
    expect(warns[0]!.persist).toBe(true);
    expect(warns[0]!.record.context.bucket).toBe("global");

    // A new window admits again, and its first capped request warns again.
    vi.setSystemTime(T0 + WINDOW_MS);
    await post({ query: "wifi" }, { slug: "show-fresh" });
    expect(h.constructorCalls).toBe(121);
    expect(misses).toHaveLength(121);
  });

  test("the 31st request for one slug in a window is capped; another slug is still admitted", async () => {
    for (let i = 0; i < 30; i += 1) await post({ query: "wifi" }, { slug: "busy-show" });
    expect(h.constructorCalls).toBe(30);

    const capped = await post({ query: "wifi" }, { slug: "busy-show" });
    expect(capped.status).toBe(204);
    expect(h.constructorCalls).toBe(30);
    expect(codes("warn", "CREW_SEARCH_MISS_RATE_CAPPED")).toHaveLength(1);

    await post({ query: "wifi" }, { slug: "quiet-show" });
    expect(h.constructorCalls).toBe(31);
    expect(misses).toHaveLength(31);

    vi.setSystemTime(T0 + WINDOW_MS - 1);
    await post({ query: "wifi" }, { slug: "busy-show" });
    expect(h.constructorCalls).toBe(31);
    expect(codes("warn", "CREW_SEARCH_MISS_RATE_CAPPED")).toHaveLength(1);

    vi.setSystemTime(T0 + WINDOW_MS);
    await post({ query: "wifi" }, { slug: "busy-show" });
    expect(h.constructorCalls).toBe(32);
  });

  test("a request refused by the per-slug bucket does not spend the global one", async () => {
    for (let i = 0; i < 30; i += 1) await post({ query: "wifi" }, { slug: "busy-show" });
    for (let i = 0; i < 100; i += 1) await post({ query: "wifi" }, { slug: "busy-show" });
    expect(h.constructorCalls).toBe(30);

    // 30 admitted so far, so the global bucket has exactly 90 left for other shows.
    for (let i = 0; i < 90; i += 1) await post({ query: "wifi" }, { slug: `other-${i % 4}` });
    expect(h.constructorCalls).toBe(120);
    await post({ query: "wifi" }, { slug: "other-0" });
    expect(h.constructorCalls).toBe(120);
  });

  test("origin is checked before the limiter: a bad-origin request is 403 when the bucket is full, and spends no bucket when it is not", async () => {
    const crossSite = { headers: { "sec-fetch-site": "cross-site" } };
    // One admission left in the per-slug bucket.
    for (let i = 0; i < 29; i += 1) await post({ query: "wifi" }, { slug: "busy-show" });
    expect(h.constructorCalls).toBe(29);

    // Bad-origin requests are refused and spend nothing: the last admission is still there.
    for (let i = 0; i < 5; i += 1) {
      const refused = await post({ query: "wifi" }, { slug: "busy-show", ...crossSite });
      expect(refused.status).toBe(403);
    }
    expect(h.constructorCalls).toBe(29);
    await post({ query: "wifi" }, { slug: "busy-show" });
    expect(h.constructorCalls).toBe(30);
    expect(misses).toHaveLength(30);

    // Now the bucket is full. A bad-origin request is still 403, not the capped 204, and it does
    // not spend the window's one capped warning.
    const refusedWhenFull = await post({ query: "wifi" }, { slug: "busy-show", ...crossSite });
    expect(refusedWhenFull.status).toBe(403);
    expect(codes("warn", "CREW_SEARCH_MISS_RATE_CAPPED")).toEqual([]);

    // Control: a well-formed request over the bucket is the capped 204 and warns once.
    const capped = await post({ query: "wifi" }, { slug: "busy-show" });
    expect(capped.status).toBe(204);
    expect(codes("warn", "CREW_SEARCH_MISS_RATE_CAPPED")).toHaveLength(1);
    expect(h.constructorCalls).toBe(30);
  });

  test("the limiter runs before parsing: a capped request with a malformed body is 204, not 400", async () => {
    for (let i = 0; i < 30; i += 1) await post({ query: "wifi" }, { slug: "busy-show" });

    const malformed = await post("{not json", { slug: "busy-show" });
    const wrongType = await post(
      { query: "wifi" },
      { slug: "busy-show", headers: { "content-type": "text/plain" } },
    );

    expect(malformed.status).toBe(204);
    expect(wrongType.status).toBe(204);
    expect(h.constructorCalls).toBe(30);
  });

  test("a capped warning names the bucket it hit and repeats only in a new window", async () => {
    for (let i = 0; i < 31; i += 1) await post({ query: "wifi" }, { slug: "busy-show" });
    vi.setSystemTime(T0 + WINDOW_MS);
    for (let i = 0; i < 31; i += 1) await post({ query: "wifi" }, { slug: "busy-show" });

    const warns = codes("warn", "CREW_SEARCH_MISS_RATE_CAPPED");
    expect(warns.map((w) => w.record.context.bucket)).toEqual(["slug", "slug"]);
  });
});
