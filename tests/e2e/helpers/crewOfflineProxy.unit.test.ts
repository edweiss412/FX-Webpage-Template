/**
 * tests/e2e/helpers/crewOfflineProxy.unit.test.ts: the offline e2e proxy's
 * modes, proved with Node clients against a loopback upstream that records
 * every request it receives (spec §7, Task 24). No browser, no database.
 *
 * The upstream spy is what makes "not forwarded" observable: a refused, held
 * or stubbed request leaves `seen` untouched, and a forwarded one lands there
 * with the method, path, headers and body the proxy sent.
 */
import http from "node:http";
import https from "node:https";
import type { AddressInfo, Socket } from "node:net";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { startCrewOfflineProxy, type CrewOfflineProxy } from "./crewOfflineProxy";

type Seen = { method: string; path: string; headers: http.IncomingHttpHeaders; body: string };

type Reply = { status: number; headers: http.IncomingHttpHeaders; body: string };

type SendOptions = {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  body?: string;
  agent?: http.Agent;
  ca?: string | undefined;
};

let upstream: http.Server;
let seen: Seen[];
let proxy: CrewOfflineProxy | null = null;

beforeEach(async () => {
  seen = [];
  proxy = null;
  upstream = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      seen.push({
        method: req.method ?? "",
        path: req.url ?? "",
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      });
      res.writeHead(201, { "content-type": "text/plain", "x-upstream": "spy" });
      res.end(`upstream ${req.method} ${req.url}`);
    });
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  proxy = await startCrewOfflineProxy({ upstreamPort: (upstream.address() as AddressInfo).port });
});

afterEach(async () => {
  await proxy?.close();
  upstream.closeAllConnections();
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

function live(): CrewOfflineProxy {
  if (proxy === null) throw new Error("premise: the proxy started");
  return proxy;
}

/** Starts one request; `reply` settles with the response or the client error. */
function send(origin: string, options: SendOptions = {}) {
  const url = new URL(options.path ?? "/", origin);
  const client = url.protocol === "https:" ? https : http;
  let request!: http.ClientRequest;
  const reply = new Promise<Reply>((resolve, reject) => {
    request = client.request(
      url,
      {
        method: options.method ?? "GET",
        headers: options.headers,
        agent: options.agent,
        ca: options.ca,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("error", reject);
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    request.on("error", reject);
    request.end(options.body);
  });
  // A reply nobody awaits (a held request torn down at the end of a case) must
  // not surface as an unhandled rejection.
  reply.catch(() => undefined);
  return { request, reply };
}

/** Rejects with a named message when `promise` has not settled within `ms`. */
async function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not settle within ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

async function settlesWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  return within(
    promise.then(
      () => true,
      () => true,
    ),
    ms,
    "probe",
  ).catch(() => false);
}

/** The error a client sees when the server drops the socket instead of answering. */
async function networkError(reply: Promise<Reply>, what: string): Promise<NodeJS.ErrnoException> {
  const outcome = await within(
    reply.then(
      (r) => ({ answered: r }),
      (error: NodeJS.ErrnoException) => ({ error }),
    ),
    3_000,
    what,
  );
  if ("answered" in outcome) {
    throw new Error(`${what}: expected a network error, got HTTP ${outcome.answered.status}`);
  }
  return outcome.error;
}

function isDroppedSocket(error: NodeJS.ErrnoException): boolean {
  return error.code === "ECONNRESET" || /socket hang up/.test(error.message);
}

describe("crewOfflineProxy", () => {
  test("pass forwards status, headers and body, keeping the Host header", async () => {
    const p = live();
    const get = await within(send(p.httpOrigin, { path: "/a/b?x=1" }).reply, 3_000, "GET");
    expect(get.status).toBe(201);
    expect(get.headers["x-upstream"]).toBe("spy");
    expect(get.body).toBe("upstream GET /a/b?x=1");

    const post = await within(
      send(p.httpOrigin, { method: "POST", path: "/form", body: "payload" }).reply,
      3_000,
      "POST",
    );
    expect(post.status).toBe(201);

    expect(seen.map((s) => [s.method, s.path, s.body])).toEqual([
      ["GET", "/a/b?x=1", ""],
      ["POST", "/form", "payload"],
    ]);
    // The test-auth endpoint allowlists 127.0.0.1 with any port, so the Host the
    // browser sent (the proxy's own) must reach the server unchanged.
    expect(seen[0]!.headers.host).toBe(new URL(p.httpOrigin).host);
    expect(seen[0]!.headers["x-forwarded-proto"]).toBeUndefined();
  });

  test("the https listener answers a client that trusts caPem, and marks the request https", async () => {
    const p = live();
    expect(new URL(p.httpsOrigin).hostname).toBe("127.0.0.1");
    expect(new URL(p.httpsOrigin).port).not.toBe(new URL(p.httpOrigin).port);
    expect(p.caPem).toContain("-----BEGIN CERTIFICATE-----");

    // Premise: verification is on. Without the CA the same request fails the
    // certificate check, so the success below is the CA's doing.
    const untrusted = await networkError(
      send(p.httpsOrigin, { path: "/secure" }).reply,
      "https GET without ca",
    );
    expect(untrusted.code).toMatch(/SELF_SIGNED|UNABLE_TO_VERIFY|CERT/);
    expect(seen).toHaveLength(0);

    const trusted = await within(
      send(p.httpsOrigin, { path: "/secure", ca: p.caPem }).reply,
      3_000,
      "https GET with ca",
    );
    expect(trusted.status).toBe(201);
    expect(trusted.body).toBe("upstream GET /secure");
    expect(seen).toHaveLength(1);
    expect(seen[0]!.headers.host).toBe(new URL(p.httpsOrigin).host);
    expect(seen[0]!.headers["x-forwarded-proto"]).toBe("https");
  });

  test("refuse drops the socket on both listeners: a network error, never a response", async () => {
    const p = live();
    p.setMode("refuse");
    for (const [origin, ca] of [
      [p.httpOrigin, undefined],
      [p.httpsOrigin, p.caPem],
    ] as const) {
      const error = await networkError(
        send(origin, { path: "/page", ca }).reply,
        `refuse ${origin}`,
      );
      expect(isDroppedSocket(error), `${error.code} ${error.message}`).toBe(true);
    }
    expect(seen).toHaveLength(0);
  });

  test("hang accepts and holds: no answer within 500 ms, nothing forwarded", async () => {
    const p = live();
    p.setMode("hang");
    const { request, reply } = send(p.httpOrigin, { path: "/held" });
    expect(await settlesWithin(reply, 500)).toBe(false);
    expect(seen).toHaveLength(0);
    request.destroy();
  });

  test("a change from hang to pass forwards the held requests upstream", async () => {
    const p = live();
    p.setMode("hang");
    const get = send(p.httpOrigin, { path: "/held-get" });
    const post = send(p.httpOrigin, { method: "POST", path: "/held-post", body: "held-body" });
    // Premise: both requests are held, not merely late.
    expect(await settlesWithin(Promise.race([get.reply, post.reply]), 500)).toBe(false);
    expect(seen).toHaveLength(0);

    p.setMode("pass");
    const [got, posted] = await within(
      Promise.all([get.reply, post.reply]),
      3_000,
      "the released requests",
    );
    expect(got.status).toBe(201);
    expect(got.body).toBe("upstream GET /held-get");
    expect(posted.body).toBe("upstream POST /held-post");
    expect(seen.find((s) => s.path === "/held-post")?.body).toBe("held-body");
  });

  test("every mode change closes idle keep-alive sockets", async () => {
    const p = live();
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    try {
      const first = send(p.httpOrigin, { path: "/one", agent });
      const socket = await new Promise<Socket>((resolve) => first.request.on("socket", resolve));
      await within(first.reply, 3_000, "first GET");
      const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
      // Premise: the socket is idle in the pool, not already gone.
      expect(socket.destroyed).toBe(false);

      p.setMode("pass");
      await within(closed, 1_000, "the idle keep-alive socket closing");

      const second = await within(send(p.httpOrigin, { path: "/two", agent }).reply, 3_000, "GET");
      expect(second.status).toBe(201);
    } finally {
      agent.destroy();
    }
  });

  test("refuseMatching refuses exactly the matching requests, other requests on the pool pass, null clears it", async () => {
    const p = live();
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    const observed: string[] = [];
    try {
      p.refuseMatching((req) => {
        observed.push(`${req.method} ${req.path}`);
        return req.method === "POST" && req.headers["next-action"] !== undefined;
      });
      const action = { method: "POST", path: "/page", headers: { "next-action": "abc123" } };

      expect(
        (await within(send(p.httpOrigin, { path: "/page", agent }).reply, 3_000, "GET")).status,
      ).toBe(201);
      const error = await networkError(
        send(p.httpOrigin, { ...action, body: "[]", agent }).reply,
        "Server Action POST",
      );
      expect(isDroppedSocket(error), `${error.code} ${error.message}`).toBe(true);
      // A POST without the header is not a Server Action and passes.
      const plain = await within(
        send(p.httpOrigin, { method: "POST", path: "/page", body: "plain", agent }).reply,
        3_000,
        "plain POST",
      );
      expect(plain.status).toBe(201);
      expect(
        (await within(send(p.httpOrigin, { path: "/page", agent }).reply, 3_000, "GET")).status,
      ).toBe(201);
      expect(observed).toEqual(["GET /page", "POST /page", "POST /page", "GET /page"]);
      expect(seen.some((s) => s.headers["next-action"] !== undefined)).toBe(false);

      p.refuseMatching(null);
      const cleared = await within(
        send(p.httpOrigin, { ...action, body: "[]", agent }).reply,
        3_000,
        "Server Action POST after clearing",
      );
      expect(cleared.status).toBe(201);
      expect(seen.filter((s) => s.headers["next-action"] === "abc123")).toHaveLength(1);
    } finally {
      agent.destroy();
    }
  });

  test("a stub answers matching GETs locally without contacting upstream", async () => {
    const p = live();
    const pdf = Buffer.from("%PDF-1.4 stub body");
    p.stub("/api/asset/agenda/", pdf, "application/pdf");

    const stubbed = await within(
      send(p.httpOrigin, { path: "/api/asset/agenda/abc?v=1" }).reply,
      3_000,
      "stubbed GET",
    );
    expect(stubbed.status).toBe(200);
    expect(stubbed.headers["content-type"]).toBe("application/pdf");
    expect(stubbed.body).toBe(pdf.toString("utf8"));
    expect(seen).toHaveLength(0);

    // Only GETs under the prefix are stubbed.
    await within(send(p.httpOrigin, { path: "/api/asset/diagram/x" }).reply, 3_000, "other path");
    await within(
      send(p.httpOrigin, { method: "POST", path: "/api/asset/agenda/abc" }).reply,
      3_000,
      "POST under the prefix",
    );
    expect(seen.map((s) => `${s.method} ${s.path}`)).toEqual([
      "GET /api/asset/diagram/x",
      "POST /api/asset/agenda/abc",
    ]);
  });

  test("a stub sends exactly the extra headers it was given, and no cache-control without them", async () => {
    const p = live();
    p.stub("/with/", Buffer.from("a"), "application/pdf", { "cache-control": "no-store" });
    p.stub("/without/", Buffer.from("b"), "text/plain");

    const withHeaders = await within(send(p.httpOrigin, { path: "/with/x" }).reply, 3_000, "GET");
    expect(withHeaders.headers["cache-control"]).toBe("no-store");
    expect(withHeaders.headers["content-type"]).toBe("application/pdf");

    const without = await within(send(p.httpOrigin, { path: "/without/x" }).reply, 3_000, "GET");
    expect(without.headers["content-type"]).toBe("text/plain");
    expect(without.headers["cache-control"]).toBeUndefined();
    expect(seen).toHaveLength(0);
  });

  test("refuse wins over a stub, so only the worker's own cache can answer offline", async () => {
    const p = live();
    p.stub("/api/asset/agenda/", Buffer.from("pdf"), "application/pdf");
    p.setMode("refuse");
    const error = await networkError(
      send(p.httpOrigin, { path: "/api/asset/agenda/abc" }).reply,
      "stubbed GET under refuse",
    );
    expect(isDroppedSocket(error), `${error.code} ${error.message}`).toBe(true);
  });

  test("close() drops held requests and leaves no listener behind", async () => {
    const p = live();
    p.setMode("hang");
    const held = send(p.httpOrigin, { path: "/held" });
    expect(await settlesWithin(held.reply, 300)).toBe(false);

    await within(p.close(), 3_000, "close()");
    proxy = null;
    const dropped = await networkError(held.reply, "the held request at close");
    expect(isDroppedSocket(dropped), `${dropped.code} ${dropped.message}`).toBe(true);

    for (const origin of [p.httpOrigin, p.httpsOrigin]) {
      const refused = await networkError(
        send(origin.replace("https:", "http:"), { path: "/" }).reply,
        `connect to ${origin} after close`,
      );
      expect(refused.code).toBe("ECONNREFUSED");
    }
  });
});
