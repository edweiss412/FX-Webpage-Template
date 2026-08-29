import { afterEach, describe, expect, it } from "vitest";

import { LOOPBACK_DSN, localDatabaseUrl } from "../../scripts/local-database-url";

/**
 * The webServer pin resolves through this, so an ambient value it wrongly trusts reaches the
 * app server exactly the way `.env.local`'s validation pooler used to.
 *
 * The first version of the pin read a bare `process.env.DATABASE_URL`, which moved the hole one
 * variable to the left rather than closing it: exporting a remote DATABASE_URL propagated
 * straight through every pinned server. The escape hatch that mattered was a developer running
 * Postgres on a non-default LOCAL port, and that is what this keeps.
 */
const REMOTE = "postgresql://u:p@remote.sentinel.invalid:5432/postgres";

const saved = process.env.DATABASE_URL;
afterEach(() => {
  if (saved === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = saved;
});

function withDatabaseUrl(value: string | undefined): string {
  if (value === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = value;
  return localDatabaseUrl();
}

describe("localDatabaseUrl", () => {
  it("falls back to the loopback DSN when nothing is set", () => {
    expect(withDatabaseUrl(undefined)).toBe(LOOPBACK_DSN);
  });

  it("REFUSES a remote ambient value rather than forwarding it", () => {
    // The defect this exists for. A bare `?? LOOPBACK_DSN` returns REMOTE here.
    expect(withDatabaseUrl(REMOTE)).toBe(LOOPBACK_DSN);
  });

  it.each([
    ["a custom local port", "postgresql://postgres:postgres@127.0.0.1:55555/postgres"],
    ["localhost", "postgresql://postgres:postgres@localhost:54322/postgres"],
    ["uppercase LOCALHOST", "postgresql://postgres:postgres@LOCALHOST:54322/postgres"],
    ["bracketed IPv6 loopback", "postgresql://postgres:postgres@[::1]:54322/postgres"],
  ])("honours %s", (_label, dsn) => {
    expect(withDatabaseUrl(dsn)).toBe(dsn);
  });

  it("treats an unparseable value as absent rather than trusting it", () => {
    expect(withDatabaseUrl("not-a-url")).toBe(LOOPBACK_DSN);
  });

  it("is not fooled by a loopback-looking userinfo or path", () => {
    // `postgresql://127.0.0.1@evil.invalid/...` has hostname evil.invalid, not 127.0.0.1.
    expect(withDatabaseUrl("postgresql://127.0.0.1:x@remote.sentinel.invalid:5432/127.0.0.1")).toBe(
      LOOPBACK_DSN,
    );
  });
});
