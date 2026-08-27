// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  CAPS,
  clientErrorTransport,
  redactShareToken,
  scrubShareTokens,
  __resetClientTransportDedupForTests,
} from "@/lib/observe/clientErrorTransport";
import { SHAPED_TOKEN } from "./__fixtures__/shareToken";

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
      const SECRET = SHAPED_TOKEN;
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
      const SECRET = SHAPED_TOKEN;
      const out = redactShareToken(`https://x.test/show/acme-gala/${SECRET}?t=${SECRET}#${SECRET}`);
      expect(out).not.toContain(SECRET);
      expect(out).toBe("https://x.test/show/acme-gala/[share-token-redacted]");
    });

    test("fails SAFE on an unexpected extra segment", () => {
      const SECRET = SHAPED_TOKEN;
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
      const SECRET = SHAPED_TOKEN;
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
      const SECRET = SHAPED_TOKEN;
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

    test("a shape-valid token has no distinct percent-encoded form", () => {
      // There was an encoded-form scrub pass here, and a test for it built on a
      // token with a `+` and an `=`. The shape narrowing removed both: every
      // character of a 64-hex token is left untouched by encodeURIComponent, so the
      // encoded form IS the raw form. Asserted rather than deleted, because it is
      // the whole reason that pass could be removed rather than merely doubted.
      expect(encodeURIComponent(SHAPED_TOKEN)).toBe(SHAPED_TOKEN);
    });

    test("a FOREIGN show's token off a path position is the STATED LIMIT, not a defect", () => {
      // Documented in the module header: this page cannot know another show's
      // token, so only the path-position backstop can catch it. Asserted so the
      // limit is visible rather than discovered later as a surprise.
      const spy = vi
        .spyOn(globalThis, "location", "get")
        .mockReturnValue(new URL("https://x.test/admin") as unknown as Location);
      try {
        const FOREIGN = "f".repeat(64); // another show's token, same shape
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
      const SECRET = SHAPED_TOKEN;
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
      const SECRET = SHAPED_TOKEN;
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
      const SECRET = SHAPED_TOKEN;
      const out = scrubShareTokens(`failed loading https://x.test/show/gala/${SECRET} at line 4`);
      expect(out).not.toContain(SECRET);
      expect(out).toContain("show/gala");
    });

    test("EVERY string field on the wire is scrubbed, not just url", () => {
      // The class the first version missed: a secret does not respect the field
      // you expected it in. A thrown { url: location.href } reaches `detail`; a
      // referrer reaches `message`.
      const SECRET = SHAPED_TOKEN;
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

describe("clientErrorTransport — the numbers the mutation score found unpinned", () => {
  // Enrolling this module in the source-mutation registry scored it 41/64 with 23
  // survivors, on a surface that had already cleared three adversarial diff rounds.
  // Every case below kills a specific one. That gap is the argument for enrolling a
  // guard surface BEFORE reviewing it rather than after: no amount of reading finds
  // "nothing pins this constant".
  beforeEach(() => {
    __resetClientTransportDedupForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 202 }))),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const body = (): Record<string, string> =>
    JSON.parse(
      ((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit)
        .body as string,
    );

  test("every cap is pinned by VALUE, and each one truncates exactly at it", () => {
    // Six integer-literal mutants lived here: each cap could be raised by one and
    // nothing noticed. The wire contract is shared with the route
    // (app/api/observe/client-error/route.ts), so a cap that drifts silently on one
    // side is a payload the other side re-cuts.
    expect(CAPS).toEqual({
      message: 1000,
      stack: 8000,
      componentStack: 8000,
      digest: 200,
      url: 2000,
      tileId: 200,
      code: 80,
      detail: 500,
    });
    for (const field of [
      "message",
      "stack",
      "componentStack",
      "digest",
      "tileId",
      "code",
      "detail",
    ] as const) {
      const cap = CAPS[field];
      __resetClientTransportDedupForTests();
      (fetch as unknown as ReturnType<typeof vi.fn>).mockClear();
      const value = "q".repeat(cap + 50);
      clientErrorTransport({
        source: "client.crew",
        level: "error",
        message: field === "message" ? value : "m",
        ...(field === "message" ? {} : { [field]: value }),
      });
      // Exactly `cap`, not "at most": a cap raised by one lands here.
      expect(body()[field]!.length, `${field}`).toBe(cap);
    }
  });

  test("the first character of every field survives — the caps slice from 0", () => {
    // Five `slice(0, cap)` → `slice(1, cap)` mutants. A payload quietly missing its
    // first character is the kind of corruption nobody reads as corruption.
    __resetClientTransportDedupForTests();
    clientErrorTransport({
      source: "client.crew",
      level: "error",
      message: "Mmm",
      stack: "Sss",
      componentStack: "Ccc",
      digest: "Ddd",
      tileId: "Ttt",
      code: "Kkk",
      detail: "Eee",
    });
    expect(body()).toEqual({
      source: "client.crew",
      level: "error",
      message: "Mmm",
      stack: "Sss",
      componentStack: "Ccc",
      digest: "Ddd",
      tileId: "Ttt",
      code: "Kkk",
      detail: "Eee",
      url: expect.any(String),
    });
  });

  test("the dedup key reads the FIRST 200 characters of stack and detail, not a window into them", () => {
    // Three mutants on the signature line: both `slice(0, 200)` offsets and the
    // bound itself. A key built from `slice(1, 200)` still discriminates most
    // pairs, which is why only a pair differing at exactly the first character
    // catches it.
    const post = (stack: string, detail: string): void =>
      clientErrorTransport({ source: "client.crew", level: "error", message: "m", stack, detail });
    const calls = (): number => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length;

    post("Astack", "Adetail");
    post("Bstack", "Adetail"); // differs at stack[0]
    post("Astack", "Bdetail"); // differs at detail[0]
    expect(calls(), "three distinct keys").toBe(3);

    // The bound is 200 EXACTLY, and the difference has to land at index 200 to
    // show it: a pair differing further along stays merged under 201 as well, so
    // it proves nothing about the number. First 200 identical, differing at the
    // 201st character, is the only pair that separates the two spellings.
    for (const field of ["stack", "detail"] as const) {
      __resetClientTransportDedupForTests();
      (fetch as unknown as ReturnType<typeof vi.fn>).mockClear();
      const long = "s".repeat(200);
      const other = field === "stack" ? "d" : "k";
      const send = (v: string): void =>
        clientErrorTransport({
          source: "client.crew",
          level: "error",
          message: "m",
          stack: field === "stack" ? v : other,
          detail: field === "detail" ? v : other,
        });
      send(`${long}A`);
      send(`${long}B`);
      expect(calls(), `${field}: identical for exactly 200 characters`).toBe(1);
    }
  });

  test("no field on the wire carries the token — walked, not listed", () => {
    // This replaces a final re-scrub loop over `payload` that was dead code: every
    // assignment already scrubs, so its own guard survived an equality flip. The
    // guarantee it was there for is this assertion, which walks whatever the body
    // actually holds, so a field added later without a scrub fails here.
    const SECRET = SHAPED_TOKEN;
    const spy = vi
      .spyOn(globalThis, "location", "get")
      .mockReturnValue(new URL(`https://x.test/show/gala/${SECRET}`) as unknown as Location);
    try {
      clientErrorTransport({
        source: "client.crew",
        level: "error",
        message: `m ${SECRET}`,
        stack: `s ${SECRET}`,
        componentStack: `c ${SECRET}`,
        digest: SECRET,
        tileId: SECRET,
        code: SECRET.slice(0, 40),
        detail: `d ${SECRET}`,
      });
      const b = body();
      expect(Object.keys(b).length).toBeGreaterThan(5); // the walk must have something to walk
      for (const [k, v] of Object.entries(b)) {
        expect(v, `field ${k}`).not.toContain(SECRET.slice(0, 8));
      }
    } finally {
      spy.mockRestore();
    }
  });

  test("the prefix floor is 16 exactly: a 16-character run goes, a 15-character run stays", () => {
    // Both the constant and the loop's `>=` were mutable with nothing noticing.
    // The floor is a real trade — it is what stops an ordinary word from being
    // mistaken for a secret — so its exact value belongs in a test, not only in a
    // comment.
    const SECRET = SHAPED_TOKEN;
    const spy = vi
      .spyOn(globalThis, "location", "get")
      .mockReturnValue(new URL(`https://x.test/show/gala/${SECRET}`) as unknown as Location);
    try {
      expect(scrubShareTokens(`x ${SECRET.slice(0, 16)} y`)).not.toContain(SECRET.slice(0, 16));
      expect(scrubShareTokens(`x ${SECRET.slice(0, 15)} y`)).toContain(SECRET.slice(0, 15));
      // The loop starts at length-1, so a run one character short of the whole
      // token is scrubbed too.
      expect(scrubShareTokens(SECRET.slice(0, SECRET.length - 1))).not.toContain(
        SECRET.slice(0, 16),
      );
      // And it scrubs from index 0: the leading character goes with the rest.
      expect(scrubShareTokens(`<${SECRET.slice(0, 20)}>`)).toBe("<[share-token-redacted]>");
    } finally {
      spy.mockRestore();
    }
  });

  test("a deep NON-crew path contributes no token — a path segment is not a secret", () => {
    // `parts[1] === "show" && parts.length > 3` survived `&&` → `||`, which would
    // read the fourth segment of ANY deep path as the share token. On /a/b/c/d that
    // scrubs the literal "d" out of every field: a false positive that corrupts
    // ordinary payloads rather than leaking one.
    const spy = vi
      .spyOn(globalThis, "location", "get")
      .mockReturnValue(new URL("https://x.test/admin/shows/gala/settings") as unknown as Location);
    try {
      expect(scrubShareTokens("the settings page")).toBe("the settings page");
      expect(scrubShareTokens("settings")).toBe("settings");
      // And a hex string in the third position of a NON-show path is not a token
      // either: the route and the shape are both required, not either one.
      expect(scrubShareTokens(`id=${SHAPED_TOKEN}`)).toBe(`id=${SHAPED_TOKEN}`);
    } finally {
      spy.mockRestore();
    }
  });

  test("copies cut at DIFFERENT lengths all go, not just the longest", () => {
    // Diff review R4's P0. The prefix loop stopped at the first length it found, so
    // a value carrying a 48-character copy, a 32-character copy and a 20-character
    // copy lost the 48 and kept the other two. Different lengths in one value is
    // the ordinary case, not a contrived one: each field is cut at its own cap by
    // whatever produced it, and they reach this function together.
    const spy = vi
      .spyOn(globalThis, "location", "get")
      .mockReturnValue(new URL(`https://x.test/show/gala/${SHAPED_TOKEN}`) as unknown as Location);
    try {
      const lengths = [48, 32, 20, 16];
      const text = lengths.map((n) => `copy${n}=${SHAPED_TOKEN.slice(0, n)}`).join(" & ");
      const out = scrubShareTokens(text);
      for (const n of lengths) {
        expect(out, `${n}-character copy`).not.toContain(SHAPED_TOKEN.slice(0, n));
      }
      // Every field a caller can set, not just the one the bug was found in.
      __resetClientTransportDedupForTests();
      (fetch as unknown as ReturnType<typeof vi.fn>).mockClear();
      clientErrorTransport({
        source: "client.crew",
        level: "error",
        message: text,
        stack: text,
        componentStack: text,
        digest: text,
        tileId: text,
        code: SHAPED_TOKEN.slice(0, 48),
        detail: text,
      });
      const b = JSON.parse(
        ((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit)
          .body as string,
      ) as Record<string, string>;
      for (const [k, v] of Object.entries(b)) {
        expect(v, `field ${k}`).not.toContain(SHAPED_TOKEN.slice(0, 16));
      }
    } finally {
      spy.mockRestore();
    }
  });

  test("a STATIC segment beside the dynamic one is not a token", () => {
    // Diff review R4's P2, and the reason the recognizer matches on the token's
    // SHAPE rather than on its position. `/show/<slug>/unpublish` is a real route
    // (app/show/[slug]/unpublish/page.tsx), so the position-only form redacted the
    // literal word "unpublish" out of every message on that page and rewrote the
    // URL into a crew-token URL that does not exist — corruption of an ordinary
    // payload rather than a leak, which is the failure a widening recognizer
    // produces and the narrowing removes.
    const spy = vi
      .spyOn(globalThis, "location", "get")
      .mockReturnValue(new URL("https://x.test/show/gala/unpublish") as unknown as Location);
    try {
      expect(scrubShareTokens("unpublish confirmation failed")).toBe(
        "unpublish confirmation failed",
      );
      expect(redactShareToken("https://x.test/show/gala/unpublish")).toBe(
        "https://x.test/show/gala/unpublish",
      );
    } finally {
      spy.mockRestore();
    }
  });
});
