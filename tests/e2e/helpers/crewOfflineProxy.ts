/**
 * tests/e2e/helpers/crewOfflineProxy.ts: the loopback proxy the crew offline
 * e2e puts between the browser and the production server (spec §7).
 *
 * The spike found `context.setOffline(true)` unusable for service-worker tests
 * in both engines, while a server that drops the socket or never answers was
 * reliable (docs/superpowers/specs/probes/2026-10-26-crew-offline-sw-spike.md,
 * "How offline was simulated"). This proxy is that server, switchable per case:
 *
 *   - `pass` forwards to 127.0.0.1:<upstreamPort>, keeping the browser's Host
 *     header (the test-auth endpoint allowlists 127.0.0.1 with any port).
 *   - `refuse` destroys the client socket, so the browser sees a network error,
 *     never a 502 page it could mistake for a server answer.
 *   - `hang` accepts the request and holds it. Leaving `hang` dispatches every
 *     still-open held request under the new mode, so `hang` then `pass` lets a
 *     request the worker is still waiting on complete.
 *
 * Two listeners share one handler: plain http (Chromium treats loopback http as
 * a secure context) and https (WebKit only stores the `__Host-` picker cookie
 * over https). The https side adds `x-forwarded-proto: https`, as the spike's
 * TLS proxy did. Its certificate is generated per start by `openssl` into a
 * `mkdtemp` directory that is removed as soon as the PEMs are read, so no key
 * is committed or left on disk. It carries an IP subjectAltName for 127.0.0.1,
 * which is what lets a verifying client accept it given `caPem` as its CA.
 *
 * `overrideHeaders` sets headers on forwarded answers under a path prefix. The
 * agenda case marks `/_next/static/` `no-store` with it, so the browser's HTTP
 * cache never holds a chunk and offline only the worker's Cache Storage can
 * answer for one (Codex R1 D4).
 *
 * Mode, predicate, stubs and overrides are state on the proxy, not per case. A fixture
 * that shares one proxy across cases calls `reset()` before each case, so a
 * case's stub (a stubbed /sw.js, for one) or refusal predicate never reaches
 * the next case. A predicate that throws refuses its request: a fault in the
 * test's own matcher must read as a refusal, never as a request that slipped
 * through to the server.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

export type ProxyMode = "pass" | "refuse" | "hang";

export type ProxiedRequest = {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
};

/** One request as the proxy received it, before the mode decided anything. */
export type ReceivedRequest = { method: string; path: string };

export type CrewOfflineProxy = {
  /** http://127.0.0.1:<port>; Chromium treats loopback http as a secure context. */
  httpOrigin: string;
  /** https://127.0.0.1:<port> with a throwaway self-signed certificate (WebKit). */
  httpsOrigin: string;
  /** PEM of the throwaway certificate, so a test client can trust it instead of disabling checks. */
  caPem: string;
  setMode(mode: ProxyMode): void;
  /** In "pass" mode, refuse only the requests this predicate matches; null clears it. */
  refuseMatching(match: ((req: ProxiedRequest) => boolean) | null): void;
  /** Answer GET requests under this path prefix locally instead of forwarding, with extra response headers. */
  stub(
    pathPrefix: string,
    body: Buffer,
    contentType: string,
    headers?: Record<string, string>,
  ): void;
  /**
   * On forwarded answers whose path starts with this prefix, set these response
   * headers, replacing the upstream's own of the same name. Stubbed, refused and
   * held requests are untouched.
   */
  overrideHeaders(pathPrefix: string, headers: Record<string, string>): void;
  /**
   * Every request received since the start or the last `reset()`, in arrival
   * order, whether it was forwarded, stubbed, refused or held. The worker's own
   * fetches arrive here too, which is what lets a case see a request no page
   * listener can (WebKit reports none of a worker's requests to Playwright).
   */
  received(): readonly ReceivedRequest[];
  /** Back to `pass` (releasing held requests, closing idle sockets), no predicate, stubs, overrides or log. */
  reset(): void;
  close(): Promise<void>;
};

const execFileAsync = promisify(execFile);

/**
 * Connection-scoped headers (RFC 9110 §7.6.1). They describe one hop, so the
 * proxy drops them in both directions and lets each side manage its own
 * connection: the browser's keep-alive pool stays the proxy's, which is what
 * makes "close idle sockets on a mode change" mean something.
 */
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
]);

type Stub = { body: Buffer; contentType: string; headers: Record<string, string> };

type Pending = { req: http.IncomingMessage; res: http.ServerResponse; viaHttps: boolean };

async function throwawayCertificate(): Promise<{ key: string; cert: string }> {
  const dir = await mkdtemp(join(tmpdir(), "fxav-crew-offline-proxy-"));
  try {
    const keyPath = join(dir, "key.pem");
    const certPath = join(dir, "cert.pem");
    await execFileAsync("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-subj",
      "/CN=127.0.0.1",
      "-addext",
      "subjectAltName=IP:127.0.0.1",
      "-keyout",
      keyPath,
      "-out",
      certPath,
    ]);
    return { key: await readFile(keyPath, "utf8"), cert: await readFile(certPath, "utf8") };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve((server.address() as AddressInfo).port);
    });
  });
}

export async function startCrewOfflineProxy(opts: {
  upstreamPort: number;
}): Promise<CrewOfflineProxy> {
  const { key, cert } = await throwawayCertificate();
  const upstreamAgent = new http.Agent({ keepAlive: true });

  let mode: ProxyMode = "pass";
  let refusePredicate: ((req: ProxiedRequest) => boolean) | null = null;
  const stubs = new Map<string, Stub>();
  const overrides = new Map<string, Record<string, string>>();
  const held = new Set<Pending>();
  const log: ReceivedRequest[] = [];

  const refuse = (pending: Pending): void => {
    pending.req.socket.destroy();
  };

  const forward = ({ req, res, viaHttps }: Pending): void => {
    const headers: http.OutgoingHttpHeaders = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP.has(name)) headers[name] = value;
    }
    if (viaHttps) headers["x-forwarded-proto"] = "https";
    const upstream = http.request(
      {
        host: "127.0.0.1",
        port: opts.upstreamPort,
        method: req.method,
        path: req.url,
        headers,
        agent: upstreamAgent,
      },
      (answer) => {
        const path = req.url ?? "/";
        const set: Record<string, string> = {};
        for (const [prefix, headers] of overrides) {
          if (!path.startsWith(prefix)) continue;
          for (const [name, value] of Object.entries(headers)) set[name.toLowerCase()] = value;
        }
        const raw: string[] = [];
        for (let i = 0; i < answer.rawHeaders.length; i += 2) {
          const name = answer.rawHeaders[i]!;
          const lower = name.toLowerCase();
          if (!HOP_BY_HOP.has(lower) && !(lower in set)) raw.push(name, answer.rawHeaders[i + 1]!);
        }
        for (const [name, value] of Object.entries(set)) raw.push(name, value);
        const status = answer.statusCode ?? 502;
        res.writeHead(status, answer.statusMessage || http.STATUS_CODES[status] || "", raw);
        answer.pipe(res);
      },
    );
    // An upstream failure is a network failure to the browser too, never a 502.
    upstream.on("error", () => req.socket.destroy());
    res.on("close", () => {
      if (!res.writableFinished) upstream.destroy();
    });
    req.pipe(upstream);
  };

  const answerFromStub = (res: http.ServerResponse, stub: Stub): void => {
    res.writeHead(200, {
      ...stub.headers,
      "content-type": stub.contentType,
      "content-length": stub.body.length,
    });
    res.end(stub.body);
  };

  const stubFor = (method: string, path: string): Stub | null => {
    if (method !== "GET") return null;
    let found: { prefix: string; stub: Stub } | null = null;
    for (const [prefix, stub] of stubs) {
      if (path.startsWith(prefix) && (found === null || prefix.length > found.prefix.length)) {
        found = { prefix, stub };
      }
    }
    return found?.stub ?? null;
  };

  const matchesRefusal = (request: ProxiedRequest): boolean => {
    if (refusePredicate === null) return false;
    try {
      return refusePredicate(request) === true;
    } catch {
      return true;
    }
  };

  const dispatch = (pending: Pending): void => {
    const { req, res } = pending;
    if (mode === "refuse") return refuse(pending);
    if (mode === "hang") {
      held.add(pending);
      res.on("close", () => held.delete(pending));
      return;
    }
    const method = req.method ?? "GET";
    const path = req.url ?? "/";
    if (matchesRefusal({ method, path, headers: req.headers })) return refuse(pending);
    const stub = stubFor(method, path);
    if (stub !== null) {
      // The body is never read on this path; drain it so the connection stays reusable.
      req.resume();
      return answerFromStub(res, stub);
    }
    forward(pending);
  };

  const handler =
    (viaHttps: boolean) =>
    (req: http.IncomingMessage, res: http.ServerResponse): void => {
      req.on("error", () => undefined);
      res.on("error", () => undefined);
      log.push({ method: req.method ?? "GET", path: req.url ?? "/" });
      dispatch({ req, res, viaHttps });
    };

  const httpServer = http.createServer(handler(false));
  const httpsServer = https.createServer({ key, cert }, handler(true));
  const servers = [httpServer, httpsServer];
  let ports: number[];
  try {
    ports = await Promise.all(servers.map(listen));
  } catch (error) {
    for (const server of servers) server.close();
    upstreamAgent.destroy();
    throw error;
  }
  const [httpPort, httpsPort] = ports;

  let closing: Promise<void> | null = null;

  const setMode = (next: ProxyMode): void => {
    mode = next;
    // A kept-alive socket would otherwise carry the browser's next request
    // over a connection opened under the old mode.
    for (const server of servers) server.closeIdleConnections();
    if (next === "hang") return;
    const release = [...held];
    held.clear();
    for (const pending of release) {
      if (!pending.res.destroyed) dispatch(pending);
    }
  };

  return {
    httpOrigin: `http://127.0.0.1:${httpPort}`,
    httpsOrigin: `https://127.0.0.1:${httpsPort}`,
    caPem: cert,
    setMode,
    refuseMatching(match) {
      refusePredicate = match;
    },
    stub(pathPrefix, body, contentType, headers = {}) {
      stubs.set(pathPrefix, { body, contentType, headers });
    },
    overrideHeaders(pathPrefix, headers) {
      overrides.set(pathPrefix, headers);
    },
    received() {
      return [...log];
    },
    reset() {
      refusePredicate = null;
      stubs.clear();
      overrides.clear();
      setMode("pass");
      log.length = 0;
    },
    close() {
      closing ??= (async () => {
        for (const pending of held) pending.req.socket.destroy();
        held.clear();
        await Promise.all(
          servers.map(
            (server) =>
              new Promise<void>((resolve) => {
                server.close(() => resolve());
                server.closeAllConnections();
              }),
          ),
        );
        upstreamAgent.destroy();
      })();
      return closing;
    },
  };
}
