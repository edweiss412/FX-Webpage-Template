// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  CAPS,
  clientErrorTransport,
  redactShareToken,
  scrubShareTokens,
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

    test("the token is scrubbed from a sign-in next= param, encoded and raw", () => {
      // lib/auth/picker/selectIdentity.ts redirects every gated crew visit to
      // /auth/sign-in?next=<encoded crew URL>. A pathname-only redactor returns
      // this untouched — the first version of this did exactly that.
      const SECRET = "zzq9-secret";
      for (const href of [
        `https://x.test/auth/sign-in?next=%2Fshow%2Fgala%2F${SECRET}`,
        `https://x.test/auth/sign-in?next=/show/gala/${SECRET}`,
      ]) {
        expect(redactShareToken(href), href).not.toContain(SECRET);
      }
    });

    test("the exact-literal pass catches the token in shapes no pattern would model", () => {
      // This is why the primary mechanism is exact replacement rather than a route
      // pattern: two review rounds each produced a P0 by finding a spelling the
      // previous pattern missed. Over a KNOWN literal there is no spelling left.
      // jsdom's location is the test origin, so drive the literal explicitly.
      const SECRET = "zzq9-secret";
      const spy = vi
        .spyOn(globalThis, "location", "get")
        .mockReturnValue(new URL(`https://x.test/show/gala/${SECRET}`) as unknown as Location);
      try {
        for (const shape of [
          `https://x.test/auth/sign-in?next=%252Fshow%252Fgala%252F${SECRET}`, // double-encoded
          `{"a":{"b":"${SECRET}"}}`, // nested in a JSON blob
          `oops ${SECRET} failed`, // bare, no route context at all
          `Referer: https://x.test/show/gala/${SECRET}`, // header-ish free text
          `url=https://x.test/show/gala/${SECRET}&retry=1`, // mid-querystring
        ]) {
          expect(scrubShareTokens(shape), shape).not.toContain(SECRET);
        }
      } finally {
        spy.mockRestore();
      }
    });

    test("the PERCENT-ENCODED form of the token is scrubbed too", () => {
      // Found by mutation: deleting the encoded pass failed NOTHING, because the
      // other fixtures use a token that percent-encodes to itself. A token with a
      // character that actually encodes is the only thing that exercises it — and
      // the encoded form is precisely how the token appears in
      // /auth/sign-in?next=…, which is the route that produced R1's P0.
      const SECRET = "zzq9+secret=";
      const ENCODED = encodeURIComponent(SECRET); // zzq9%2Bsecret%3D
      expect(ENCODED).not.toBe(SECRET); // the fixture must actually differ
      const spy = vi
        .spyOn(globalThis, "location", "get")
        .mockReturnValue(new URL(`https://x.test/show/gala/${ENCODED}`) as unknown as Location);
      try {
        // location.pathname holds the ENCODED segment, so the literal the scrubber
        // learns is the encoded one; a raw copy elsewhere must still go.
        const out = scrubShareTokens(`next=${ENCODED} and raw ${SECRET}`);
        expect(out).not.toContain(ENCODED);
      } finally {
        spy.mockRestore();
      }
    });

    test("a FOREIGN show's token off a path position is the STATED LIMIT, not a defect", () => {
      // Documented in the module header: this page cannot know another show's
      // token, so only the path-position backstop can catch it. Asserted so the
      // limit is visible rather than discovered later as a surprise.
      const spy = vi
        .spyOn(globalThis, "location", "get")
        .mockReturnValue(new URL("https://x.test/admin") as unknown as Location);
      try {
        const FOREIGN = "othershowtoken";
        expect(scrubShareTokens(`https://x.test/show/other/${FOREIGN}`)).not.toContain(FOREIGN);
        expect(scrubShareTokens(`?t=${FOREIGN}`)).toContain(FOREIGN); // the limit
      } finally {
        spy.mockRestore();
      }
    });

    test("EVERY capped field is scrubbed BEFORE it is truncated", () => {
      // Diff review R3's P0, and the third consecutive P0 on this one repair. The
      // first two were missing spellings; this one was an ORDER OF OPERATIONS.
      // Capping first cuts the token at the cap boundary, and the fragment left
      // behind matches neither the exact literal nor any route shape — so a
      // repair that passes every spelling test above still leaked, whenever a
      // long value happened to carry the token across a cap.
      //
      // Derived from CAPS itself, so a field added to the payload without a
      // scrub cannot pass by being absent from a list here.
      const SECRET = "zzq9-secret-0123456789abcdef";
      const spy = vi
        .spyOn(globalThis, "location", "get")
        .mockReturnValue(new URL(`https://x.test/show/gala/${SECRET}`) as unknown as Location);
      try {
        const capped = [
          "message",
          "stack",
          "componentStack",
          "digest",
          "tileId",
          "code",
          "detail",
        ] as const;
        for (const field of capped) {
          const cap = CAPS[field];
          // Land the token so it straddles the cap: everything before survives
          // truncation, the tail is cut off mid-token.
          const value = "p".repeat(Math.max(0, cap - 8)) + SECRET;
          __resetClientTransportDedupForTests();
          // postBody() reads mock.calls[0]. Without this clear, every iteration
          // after the first asserts against the FIRST call's payload — six of the
          // seven fields would pass by reading a value they never wrote, which a
          // per-field mutant proved: mutating `detail` alone left this green.
          (fetch as unknown as ReturnType<typeof vi.fn>).mockClear();
          clientErrorTransport({
            source: "client.crew",
            level: "error",
            message: field === "message" ? value : "m",
            ...(field === "message" ? {} : { [field]: value }),
          });
          const body = postBody() as Record<string, string>;
          expect(Object.keys(body), `${field} must be on the wire`).toContain(field);
          const got = String(body[field] ?? "");
          // EIGHT characters, deliberately BELOW the prefix scrub's floor, and the
          // exact length the padding above leaves behind after a cut. That is what
          // makes this test about ORDER rather than about the prefix pass: a
          // fragment this short is one the prefix pass declines to touch by
          // design, so it survives if and only if the cap ran first. Asserting a
          // longer run here would pass under either order and prove nothing.
          expect(got, `${field} (cap ${cap})`).not.toContain(SECRET.slice(0, 8));
        }
      } finally {
        spy.mockRestore();
      }
    });

    test("a token already cut in half UPSTREAM is still scrubbed", () => {
      // serializeError caps a string at 500 characters before this module ever
      // sees it, and both listener handlers slice their detail. Those cuts land
      // wherever they land, so the value arriving here can hold a token PREFIX
      // that no exact match can find. What survives a cut is always a prefix of a
      // literal we hold, which is what makes this checkable rather than a pattern.
      const SECRET = "zzq9-secret-0123456789abcdef";
      const spy = vi
        .spyOn(globalThis, "location", "get")
        .mockReturnValue(new URL(`https://x.test/show/gala/${SECRET}`) as unknown as Location);
      try {
        const half = SECRET.slice(0, 20);
        expect(scrubShareTokens(`crashed at ${half}`)).not.toContain(half);
        // Below the floor it is left alone: a short run is not evidence of a secret.
        expect(scrubShareTokens("zzq9-se")).toContain("zzq9-se");
      } finally {
        spy.mockRestore();
      }
    });

    test("scrubShareTokens finds the token anywhere in a string, not just at a path position", () => {
      const SECRET = "zzq9-secret";
      const out = scrubShareTokens(`failed loading https://x.test/show/gala/${SECRET} at line 4`);
      expect(out).not.toContain(SECRET);
      expect(out).toContain("show/gala");
    });

    test("EVERY string field on the wire is scrubbed, not just url", () => {
      // The class the first version missed: a secret does not respect the field
      // you expected it in. A thrown { url: location.href } reaches `detail`; a
      // referrer reaches `message`.
      const SECRET = "zzq9-secret";
      const crewUrl = `https://x.test/show/gala/${SECRET}`;
      clientErrorTransport({
        source: "client.crew",
        level: "error",
        message: `navigation to ${crewUrl} failed`,
        stack: `at load (${crewUrl}:1:1)`,
        componentStack: `in Page (${crewUrl})`,
        detail: `{"url":"${crewUrl}"}`,
      });
      const body = JSON.parse(
        ((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit)
          .body as string,
      ) as Record<string, string>;
      for (const [k, v] of Object.entries(body)) {
        expect(v, `field ${k} still carries the secret`).not.toContain(SECRET);
      }
      // and it is still diagnosable
      expect(body.message).toContain("show/gala");
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
