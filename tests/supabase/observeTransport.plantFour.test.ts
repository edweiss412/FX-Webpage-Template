/**
 * tests/supabase/observeTransport.plantFour.test.ts
 *
 * The plant-four harness for the transport observer, built BEFORE the spec by the first
 * scheduled step of BL-SUPABASE-UPSTREAM-FAULT-OBSERVABILITY. Three prose designs in a row each
 * introduced the next round's defect, so the four transport states are executable here rather
 * than described anywhere.
 *
 * The four states, and the failure each one catches:
 *
 *   1. 5xx          the observation is RECORDED. Without it the fault is dark, which is the
 *                   whole row.
 *   2. SUCCESS      invisible, and the caller's Response comes back with IDENTICAL bytes. An
 *                   observer that rebuilds a Response on the success path changes every green
 *                   request in the app to prove something about the red ones.
 *   3. REJECTION    the SAME error object is rethrown, unwrapped. An observer written around
 *                   `response.status` reads `.status` off `undefined` and throws its own
 *                   TypeError, which changes the caller's failure CLASS — a symptom that looks
 *                   like a product bug and nothing like a logging change.
 *   4. BODY         never read and never cloned. Reading consumes the stream and hands the
 *                   consumer an empty response; the consumer then reports "no rows" rather than
 *                   an error, which is the silent-wrong direction.
 *
 * State 4 is asserted by CONSUMPTION rather than by spying on `.json()`: a spy pins the method
 * an implementation happens to call today, while an unconsumed `bodyUsed` plus a full read at
 * the far end pins the property the consumer actually depends on.
 */
import { describe, expect, test } from "vitest";

import {
  UPSTREAM_FAULT_CODE,
  type TransportObservation,
  makeObservingFetch,
} from "@/lib/supabase/observeTransport";

const BASE = "http://127.0.0.1:54321";
const RPC = `${BASE}/rest/v1/rpc/is_admin`;

/** Collects observations so the emit is assertable without a log sink. */
function collector(): {
  seen: TransportObservation[];
  onObserve: (o: TransportObservation) => void;
} {
  const seen: TransportObservation[] = [];
  return { seen, onObserve: (o) => seen.push(o) };
}

/** The single element, or a failure that names what went wrong instead of `undefined[0]`. */
function only<T>(xs: readonly T[], what: string): T {
  if (xs.length !== 1) throw new Error(`expected exactly one ${what}, got ${xs.length}`);
  return xs[0] as T;
}

describe("plant 1 — a 5xx is recorded", () => {
  test("502 emits one observation naming the function, the status and the fault code", async () => {
    // no-premise: the transport is an injected stub; this case reads no socket, clock or env var.
    const { seen, onObserve } = collector();
    const fetchFn = makeObservingFetch(async () => new Response("{}", { status: 502 }), {
      baseUrl: BASE,
      onObserve,
    });

    const res = await fetchFn(RPC, { method: "POST" });

    expect(res.status).toBe(502);
    expect(seen).toEqual([
      { code: UPSTREAM_FAULT_CODE, target: "is_admin", status: 502, kind: "status" },
    ]);
  });

  test("every 5xx records, not only the gateway's retryable trio", async () => {
    // The retry wrapper deliberately owns only 502/503/504. The OBSERVER is wider on purpose:
    // the row's class "is NOT bounded by the retry population". A 500 that only the observer
    // sees is exactly the occurrence this row exists to make attributable.
    for (const status of [500, 502, 503, 504, 599]) {
      const { seen, onObserve } = collector();
      const fetchFn = makeObservingFetch(async () => new Response("{}", { status }), {
        baseUrl: BASE,
        onObserve,
      });
      await fetchFn(RPC, { method: "POST" });
      expect(
        seen.map((o) => o.status),
        `status ${status} must record`,
      ).toEqual([status]);
    }
  });

  test("a 4xx is NOT an upstream fault and records nothing", async () => {
    for (const status of [200, 201, 204, 400, 401, 403, 404, 409, 422, 429]) {
      const { seen, onObserve } = collector();
      // 204 forbids a body, and the constructor throws rather than ignoring one.
      const fetchFn = makeObservingFetch(
        async () => new Response(status === 204 ? null : "{}", { status }),
        { baseUrl: BASE, onObserve },
      );
      await fetchFn(RPC, { method: "POST" });
      expect(seen, `status ${status} must not record`).toEqual([]);
    }
  });

  test("the record names the PATH when the target is not an RPC, and never the query string", async () => {
    // The emit reaches a log sink. PostgREST carries filters in the query string
    // (`?email=eq.<address>`), so a raw URL here would write a crew member's email to a durable
    // sink. Asserted on a table read, which is where the filters actually live.
    const { seen, onObserve } = collector();
    const fetchFn = makeObservingFetch(async () => new Response("{}", { status: 503 }), {
      baseUrl: BASE,
      onObserve,
    });

    await fetchFn(`${BASE}/rest/v1/crew_members?email=eq.someone%40example.com`, { method: "GET" });

    const observation = only(seen, "observation");
    expect(observation.target).toBe("/rest/v1/crew_members");
    expect(JSON.stringify(observation)).not.toContain("example.com");
    expect(JSON.stringify(observation)).not.toContain("email");
    // The PATH shapes beyond PostgREST are covered by their own describe block below; this
    // case pins only the query string, which is where PostgREST puts its filters.
  });
});

describe("the record carries no request data, on ANY path shape", () => {
  test("a Storage object path is truncated before the bucket's contents", async () => {
    // Round-1 review probed this against ordinary service-role Storage traffic, not an
    // adversarial URL. The observer runs on the service-role client, which uploads diagram
    // snapshots, and the previous form returned the WHOLE pathname for every non-RPC request:
    // the show id, the revision and the private object key all reached a log sink. Dropping the
    // query string was never sufficient, because these are path segments.
    const { seen, onObserve } = collector();
    const fetchFn = makeObservingFetch(async () => new Response("{}", { status: 502 }), {
      baseUrl: BASE,
      onObserve,
    });

    await fetchFn(
      `${BASE}/storage/v1/object/diagram-snapshots/show_123/rev_7/private-diagram.png?token=secret`,
      { method: "POST" },
    );

    const observation = only(seen, "observation");
    expect(observation.target).toBe("/storage/v1/object/…");
    for (const leak of ["show_123", "rev_7", "private-diagram", "secret", "diagram-snapshots"]) {
      expect(JSON.stringify(observation), `must not carry ${leak}`).not.toContain(leak);
    }
  });

  test("a PostgREST table read keeps the table name, which is schema and not data", async () => {
    // The truncation is bounded rather than total: three segments is chosen so `/rest/v1/<table>`
    // survives intact. A record that cannot say WHICH table faulted is not worth writing.
    const { seen, onObserve } = collector();
    const fetchFn = makeObservingFetch(async () => new Response("{}", { status: 503 }), {
      baseUrl: BASE,
      onObserve,
    });

    await fetchFn(`${BASE}/rest/v1/crew_members?email=eq.someone%40example.com`, { method: "GET" });

    expect(only(seen, "observation").target).toBe("/rest/v1/crew_members");
  });

  test("a short path is not decorated with a truncation marker it did not earn", async () => {
    const { seen, onObserve } = collector();
    const fetchFn = makeObservingFetch(async () => new Response("{}", { status: 502 }), {
      baseUrl: BASE,
      onObserve,
    });

    await fetchFn(`${BASE}/auth/v1/token`, { method: "POST" });

    expect(only(seen, "observation").target).toBe("/auth/v1/token");
  });
});

describe("plant 2 — success is invisible, with identical bytes", () => {
  test("a 200 records nothing and the caller gets the SAME Response object", async () => {
    const { seen, onObserve } = collector();
    const original = new Response('[{"id":1}]', { status: 200, headers: { "x-mark": "keep" } });
    const fetchFn = makeObservingFetch(async () => original, { baseUrl: BASE, onObserve });

    const res = await fetchFn(RPC, { method: "POST" });

    expect(seen).toEqual([]);
    // Identity, not equality. A rebuilt Response can carry the same bytes and still drop a
    // header, a status text, or the streaming behaviour the consumer reads.
    expect(res).toBe(original);
    expect(res.headers.get("x-mark")).toBe("keep");
    expect(await res.text()).toBe('[{"id":1}]');
  });
});

describe("plant 3 — a rejection is rethrown unwrapped", () => {
  test("the SAME error instance comes back, and it is not a TypeError from reading .status", async () => {
    const { seen, onObserve } = collector();
    const boom = new TypeError("fetch failed");
    const fetchFn = makeObservingFetch(
      async () => {
        throw boom;
      },
      { baseUrl: BASE, onObserve },
    );

    // Identity again: `toThrow("fetch failed")` would pass against an observer that caught this
    // and threw its OWN TypeError with a copied message, which is the exact defect state 3 names.
    await expect(fetchFn(RPC, { method: "POST" })).rejects.toBe(boom);
    expect(seen).toEqual([
      { code: UPSTREAM_FAULT_CODE, target: "is_admin", status: null, kind: "rejected" },
    ]);
  });

  test("a non-Error rejection is rethrown as itself", async () => {
    // `AbortSignal.abort(null)` is legal and a caller can reject with any value. An observer
    // that normalises to an Error changes what the caller catches.
    const { seen, onObserve } = collector();
    const fetchFn = makeObservingFetch(
      async () => {
        throw null;
      },
      { baseUrl: BASE, onObserve },
    );

    await expect(fetchFn(RPC, { method: "POST" })).rejects.toBe(null);
    expect(seen.map((o) => o.kind)).toEqual(["rejected"]);
  });
});

describe("plant 4 — the body is never read and never cloned", () => {
  test("a recorded 502 reaches the consumer with its stream intact", async () => {
    const { seen, onObserve } = collector();
    const body = '{"message":"An invalid response was received from the upstream server"}';
    const original = new Response(body, { status: 502 });
    const fetchFn = makeObservingFetch(async () => original, { baseUrl: BASE, onObserve });

    const res = await fetchFn(RPC, { method: "POST" });

    // IDENTITY FIRST, and round-3 review probed why the rest is not enough on its own: an
    // observer returning `response.clone()` satisfies `bodyUsed === false` AND a full read at the
    // far end, so this case would have passed the exact regression it claims to catch. A clone is
    // a different object carrying the same bytes, and the consumer's stream is not the one the
    // observer left alone. Only identity separates the two.
    expect(res).toBe(original);
    // Unconsumed on arrival, and fully readable at the far end. Kept because they pin what the
    // consumer actually depends on, now that identity pins WHICH object it depends on.
    expect(res.bodyUsed).toBe(false);
    expect(await res.text()).toBe(body);
    expect(seen).toHaveLength(1);
  });

  test("the observer does not drain a ONE-SHOT stream that cannot be re-read", async () => {
    // A `Response` built from a string can be read twice in some runtimes, which would let a
    // draining observer pass the case above. A ReadableStream body cannot: if the observer
    // reads or clones it, the consumer's read here returns empty or throws.
    const { onObserve } = collector();
    const chunk = new TextEncoder().encode('{"rows":[]}');
    const oneShot = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(chunk);
          controller.close();
        },
      }),
      { status: 502 },
    );
    const fetchFn = makeObservingFetch(async () => oneShot, { baseUrl: BASE, onObserve });

    const res = await fetchFn(RPC, { method: "POST" });
    expect(res).toBe(oneShot);
    expect(await res.text()).toBe('{"rows":[]}');
  });
});

describe("the observer is transparent to the request it observes", () => {
  test("input and init reach the inner fetch byte-for-byte", async () => {
    // An observer that rebuilds the request to inspect it can drop a header, and the one that
    // matters here is `Content-Profile` — the ONLY thing separating `dev.is_admin` from
    // `public.is_admin` (lib/supabase/retryingFetch.ts documents that at contentProfileOf).
    const calls: Array<{ input: unknown; init: RequestInit | undefined }> = [];
    const fetchFn = makeObservingFetch(
      async (input, init) => {
        calls.push({ input, init });
        return new Response("{}", { status: 200 });
      },
      { baseUrl: BASE, onObserve: () => {} },
    );

    const init: RequestInit = { method: "POST", headers: { "content-profile": "dev" } };
    await fetchFn(RPC, init);

    const call = only(calls, "inner fetch call");
    expect(call.input).toBe(RPC);
    expect(call.init).toBe(init);
  });
});
