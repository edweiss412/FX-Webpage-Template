// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  clientErrorTransport,
  redactShareToken,
  __resetClientTransportDedupForTests,
} from "@/lib/observe/clientErrorTransport";

describe("clientErrorTransport — optional code/detail", () => {
  beforeEach(() => {
    __resetClientTransportDedupForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 202 }))),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  function postBody(): Record<string, string> {
    const f = fetch as unknown as ReturnType<typeof vi.fn>;
    // `url` is added by the transport from location.href (jsdom origin); strip it so the
    // assertions below only see the caller-supplied fields.
    const { url: _url, ...rest } = JSON.parse((f.mock.calls[0]![1] as RequestInit).body as string);
    return rest;
  }

  test("code + detail appear in the payload only when present", () => {
    clientErrorTransport({
      source: "client.realtime",
      level: "warn",
      message: "boom",
      code: "SOME_CODE",
      detail: "some detail",
    });
    expect(postBody()).toEqual({
      source: "client.realtime",
      level: "warn",
      message: "boom",
      code: "SOME_CODE",
      detail: "some detail",
    });
  });

  test("code + detail absent → neither key on the wire", () => {
    clientErrorTransport({ source: "client.realtime", level: "warn", message: "boom" });
    const body = postBody();
    expect(body).toEqual({ source: "client.realtime", level: "warn", message: "boom" });
    expect(body.code).toBeUndefined();
    expect(body.detail).toBeUndefined();
  });

  // ── the dedup signature's `detail` term (spec §6.4) ────────────────────────
  //
  // Driven through clientErrorTransport DIRECTLY, with two inputs sharing source,
  // level and message and differing only in detail. Asserting through
  // reportClientError instead would let a lucky `message` difference pass a broken
  // signature.
  function post(
    detail: string | undefined,
    over: Partial<{ message: string; stack: string }> = {},
  ) {
    clientErrorTransport({
      source: "client.crew",
      level: "error",
      message: over.message ?? "same",
      ...(over.stack !== undefined ? { stack: over.stack } : {}),
      ...(detail !== undefined ? { detail } : {}),
    });
  }
  const posts = (): number => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length;

  test("two inputs differing ONLY in detail produce two POSTs", () => {
    post("alpha");
    post("beta");
    expect(posts()).toBe(2);
  });

  test("mutant (a): detail emptied on both → ONE post, so the term is not always-distinct", () => {
    post("");
    post("");
    expect(posts()).toBe(1);
  });

  test("mutant (b): one detail given an appended suffix → two", () => {
    post("alpha");
    post("alpha-plus");
    expect(posts()).toBe(2);
  });

  test("mutant (c): the 200-char cap pinned by a BOUNDARY PAIR, not one long pair", () => {
    // Identical for 200 chars then differing AT index 200 → the slice drops the
    // difference → one post. Differing at 199 → inside the slice → two. Only a cap
    // of exactly 200 satisfies both halves; a single over-long pair is satisfied by
    // any cap at or below the shared prefix and pins nothing.
    const shared = "x".repeat(200);
    post(shared + "A");
    post(shared + "B");
    expect(posts(), "differing at index 200 is past the slice").toBe(1);

    __resetClientTransportDedupForTests();
    (fetch as unknown as ReturnType<typeof vi.fn>).mockClear();
    const shared199 = "y".repeat(199);
    post(shared199 + "A");
    post(shared199 + "B");
    expect(posts(), "differing at index 199 is inside the slice").toBe(2);
  });

  test("mutant (d): each other term still discriminates on its own", () => {
    post("same", { message: "one" });
    post("same", { message: "two" });
    expect(posts(), "message still discriminates").toBe(2);

    __resetClientTransportDedupForTests();
    (fetch as unknown as ReturnType<typeof vi.fn>).mockClear();
    post("same", { stack: "s1" });
    post("same", { stack: "s2" });
    expect(posts(), "stack still discriminates").toBe(2);
  });

  test("the Error path's dedup BEHAVIOUR is unchanged — no detail, empty term", () => {
    // The key gains a trailing separator over an empty term; the bytes change and
    // the behaviour does not. One Error still dedups once, two distinct still post
    // twice. Byte-identity is impossible here and asserting it would be a lie.
    post(undefined, { message: "boom", stack: "at foo" });
    post(undefined, { message: "boom", stack: "at foo" });
    expect(posts(), "an identical Error still dedups once").toBe(1);

    __resetClientTransportDedupForTests();
    (fetch as unknown as ReturnType<typeof vi.fn>).mockClear();
    post(undefined, { message: "boom", stack: "at foo" });
    post(undefined, { message: "other", stack: "at bar" });
    expect(posts(), "two distinct Errors still post twice").toBe(2);
  });

  // ── the crew share token never reaches the wire ────────────────────────────
  //
  // /show/<slug>/<shareToken> is the only share-token-bearing route in the app,
  // and `location.href` went onto the wire unmodified, so any client crash on a
  // crew page persisted the token into app_events. AGENTS.md invariant 10:
  // secrets are never logged.
  describe("redactShareToken", () => {
    test("masks the token segment and keeps the slug that makes the row diagnosable", () => {
      const SECRET = "zzq9-secret";
      const out = redactShareToken(`https://x.test/show/acme-gala/${SECRET}`);
      expect(out).toBe("https://x.test/show/acme-gala/[share-token-redacted]");
      expect(out).not.toContain(SECRET);
    });

    test("masks a query string and fragment on that route too", () => {
      // A token could be re-appended by a link or a redirect; the whole tail goes.
      // SECRET is deliberately a string that does NOT appear inside the marker:
      // an earlier draft used "tok", which is a substring of "share-token-redacted",
      // so the not-contains assertion could never fail. The fixture has to be
      // distinguishable from the thing that replaces it.
      const SECRET = "zzq9-secret";
      const out = redactShareToken(`https://x.test/show/acme-gala/${SECRET}?t=${SECRET}#${SECRET}`);
      expect(out).not.toContain(SECRET);
      expect(out).toBe("https://x.test/show/acme-gala/[share-token-redacted]");
    });

    test("fails SAFE on an unexpected extra segment", () => {
      const SECRET = "zzq9-secret";
      const out = redactShareToken(`https://x.test/show/acme-gala/${SECRET}/extra`);
      expect(out).not.toContain(SECRET);
      expect(out).not.toContain("extra");
    });

    test.each([
      ["the show index", "https://x.test/show"],
      ["a slug with no token", "https://x.test/show/acme-gala"],
      ["an admin route", "https://x.test/admin/dev/telemetry?code=X"],
      ["the root", "https://x.test/"],
    ])("leaves %s untouched — it carries no secret", (_label, href) => {
      expect(redactShareToken(href)).toBe(new URL(href).href);
    });

    test("a malformed URL yields an empty string rather than throwing", () => {
      expect(redactShareToken("not a url")).toBe("");
    });

    test("the POST body carries the redacted url, not location.href", () => {
      // jsdom's location is the test origin, so this pins the wiring: the payload
      // is built from redactShareToken, not from href directly.
      clientErrorTransport({ source: "client.crew", level: "error", message: "boom" });
      const body = JSON.parse(
        ((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit)
          .body as string,
      );
      expect(body.url).toBe(redactShareToken(location.href));
    });
  });

  test("the dedup set is bounded — it cannot grow for the life of the page", () => {
    // 501 distinct signatures: the 501st crosses SEEN_MAX and clears, so the set
    // never holds more than the bound. Without the bound this grows forever on a
    // page a crew member leaves open for a whole show, and adding `detail` to the
    // key made it grow faster. Re-sending a crash already sent is the conservative
    // failure direction, and the route rate-caps floods regardless.
    for (let i = 0; i < 501; i++) {
      clientErrorTransport({ source: "client.crew", level: "error", message: `m${i}` });
    }
    const posts = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(posts, "every distinct signature still posts").toBe(501);
    // The first message is re-postable now, proving the set cleared rather than
    // holding all 501 — with an unbounded set this second call would dedup away.
    (fetch as unknown as ReturnType<typeof vi.fn>).mockClear();
    clientErrorTransport({ source: "client.crew", level: "error", message: "m0" });
    expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  test("over-cap code (>80) and detail (>500) truncated BEFORE the POST", () => {
    const overCode = "c".repeat(200); // 200 > CAPS.code (80)
    const overDetail = "d".repeat(1000); // 1000 > CAPS.detail (500)
    clientErrorTransport({
      source: "client.realtime",
      level: "warn",
      message: "boom",
      code: overCode,
      detail: overDetail,
    });
    const body = postBody() as { code: string; detail: string };
    expect(body.code.length).toBe(80);
    expect(body.detail.length).toBe(500);
  });
});
