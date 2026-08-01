import http from "node:http";
import { generateKeyPairSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GOOGLE_AUTH_TOKEN_TIMEOUT_MS, TokenBoundGaxios, getDriveAuth } from "@/lib/drive/client";
import { isDriveTimeoutShape } from "@/lib/drive/errorStatus";

function stallServer(): Promise<{ port: number; close: () => void; seen: string[] }> {
  const seen: string[] = [];
  const srv = http.createServer((req) => {
    seen.push(String(req.url));
    // stall: never respond
  });
  return new Promise((resolve) =>
    srv.listen(0, "127.0.0.1", () =>
      resolve({
        port: (srv.address() as { port: number }).port,
        close: () => srv.close(),
        seen,
      }),
    ),
  );
}

describe("TokenBoundGaxios", () => {
  it("aborts a stalled token-host request at the budget (real socket)", async () => {
    const { port, close, seen } = await stallServer();
    const t = new TokenBoundGaxios(250, `127.0.0.1:${port}`);
    const started = Date.now();
    let caught: unknown;
    try {
      await t.request({ url: `http://127.0.0.1:${port}/token`, method: "POST", retry: false });
    } catch (e) {
      caught = e;
    }
    const elapsed = Date.now() - started;
    // An immediate arbitrary throw must NOT pass. Prove all three:
    expect(seen).toContain("/token"); // the server was actually reached
    expect(elapsed).toBeGreaterThanOrEqual(250); // the wait ran to the budget...
    expect(elapsed).toBeLessThan(5_000); // ...and not past the test ceiling
    expect(isDriveTimeoutShape(caught)).toBe(true); // rejection carries the probed timeout shape
    close();
  }, 10_000);

  it("injects NO timeout for non-token hosts (slow-but-healthy response above token budget completes)", async () => {
    const srv = http.createServer((req, res) => {
      setTimeout(() => res.end("{}"), 600);
    });
    await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", () => resolve()));
    const { port } = srv.address() as { port: number };
    const t = new TokenBoundGaxios(250, "oauth2.googleapis.com"); // token host elsewhere
    const res = await t.request({ url: `http://127.0.0.1:${port}/api`, retry: false });
    expect(res.status).toBe(200);
    srv.close();
  }, 10_000);

  it("caller-set timeout wins on the token host (no override of explicit budgets)", async () => {
    const { port, close, seen } = await stallServer();
    const t = new TokenBoundGaxios(60_000, `127.0.0.1:${port}`);
    const started = Date.now();
    let caught: unknown;
    try {
      await t.request({
        url: `http://127.0.0.1:${port}/token`,
        method: "POST",
        timeout: 250,
        retry: false,
      });
    } catch (e) {
      caught = e;
    }
    const elapsed = Date.now() - started;
    // Same three-way proof as the first arm, keyed to the CALLER budget: an
    // implementation that clobbers caller timeouts (e.g. with 1ms) fails
    // elapsed >= 250; one that ignores them entirely (using 60s) fails the 5s
    // ceiling.
    expect(seen).toContain("/token");
    expect(elapsed).toBeGreaterThanOrEqual(250);
    expect(elapsed).toBeLessThan(5_000);
    expect(isDriveTimeoutShape(caught)).toBe(true);
    close();
  }, 10_000);
});

describe("getDriveAuth wiring", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("constructs the auth client with a TokenBoundGaxios at the production budget", () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }) as string;
    vi.stubEnv(
      "GOOGLE_SERVICE_ACCOUNT_JSON",
      JSON.stringify({
        type: "service_account",
        client_email: "t@t.iam.gserviceaccount.com",
        private_key: pem,
      }),
    );
    const auth = getDriveAuth();
    const transporter = (auth as unknown as { clientOptions?: { transporter?: unknown } })
      .clientOptions?.transporter;
    expect(transporter).toBeInstanceOf(TokenBoundGaxios);
    expect((transporter as TokenBoundGaxios).tokenTimeoutMs).toBe(GOOGLE_AUTH_TOKEN_TIMEOUT_MS);
  });
});
