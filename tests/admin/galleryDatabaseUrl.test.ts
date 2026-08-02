/**
 * tests/admin/galleryDatabaseUrl.test.ts
 *
 * Guard tests for the Step-3 state gallery's single-target contract
 * (`tests/e2e/helpers/devCaptureStaged.ts`). Pure — no DB, no network.
 *
 * Filed from whole-diff adversarial review of `test/step3-live-render-cluster`:
 * the original guard read only `new URL(dsn).hostname`, which is NOT the target
 * `psql` connects to. A reviewer's live probe drove
 * `postgresql://…@127.0.0.1:54322/postgres?host=192.0.2.1&port=1` past the guard
 * and watched psql dial 192.0.2.1. Each case below is one escaping input from
 * that probe, plus the split-target case it also surfaced.
 */
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { galleryDatabaseUrl } from "../e2e/helpers/devCaptureStaged";

const KEY = "DATABASE_URL";
let prior: string | undefined;

beforeEach(() => {
  prior = process.env[KEY];
});
afterEach(() => {
  if (prior === undefined) delete process.env[KEY];
  else process.env[KEY] = prior;
});

describe("galleryDatabaseUrl", () => {
  test("unset DATABASE_URL resolves the local Supabase default", () => {
    delete process.env[KEY];
    expect(galleryDatabaseUrl()).toBe("postgresql://postgres:postgres@127.0.0.1:54322/postgres");
  });

  test("an explicit loopback Supabase DSN is accepted verbatim", () => {
    process.env[KEY] = "postgresql://postgres:postgres@localhost:54322/postgres";
    expect(galleryDatabaseUrl()).toBe("postgresql://postgres:postgres@localhost:54322/postgres");
  });

  test("a non-loopback host is refused", () => {
    process.env[KEY] = "postgresql://u:p@aws-1-us-east-2.pooler.supabase.com:5432/postgres";
    expect(() => galleryDatabaseUrl()).toThrow(/non-loopback database host/);
  });

  // The reviewer's escaping inputs. Each URI's AUTHORITY is loopback:54322 and
  // would sail past a hostname-only check, while libpq connects elsewhere.
  test.each([
    ["host", "postgresql://postgres:postgres@127.0.0.1:54322/postgres?host=192.0.2.1&port=1"],
    ["hostaddr", "postgresql://postgres:postgres@127.0.0.1:54322/postgres?hostaddr=192.0.2.2"],
    ["service", "postgresql://postgres:postgres@127.0.0.1:54322/postgres?service=some-remote"],
    ["port", "postgresql://postgres:postgres@127.0.0.1:54322/postgres?port=6543"],
    ["dbname", "postgresql://postgres:postgres@127.0.0.1:54322/postgres?dbname=elsewhere"],
  ])("a libpq %s override is refused even though the authority is loopback", (param, dsn) => {
    process.env[KEY] = dsn;
    // Sanity: the authority really is loopback, so this case would pass a
    // hostname-only guard. Without this line the test could pass for the wrong
    // reason (e.g. a DSN that is rejected as non-loopback anyway).
    expect(new URL(dsn).hostname).toBe("127.0.0.1");
    expect(() => galleryDatabaseUrl()).toThrow(
      new RegExp(`target-override parameter\\(s\\) \\(${param}`),
    );
  });

  test("a loopback host on a NON-Supabase port is refused (split-target hazard)", () => {
    process.env[KEY] = "postgresql://postgres:postgres@127.0.0.1:65432/postgres";
    expect(new URL(process.env[KEY]).hostname).toBe("127.0.0.1");
    expect(() => galleryDatabaseUrl()).toThrow(/refuses a loopback database on port 65432/);
  });

  test("a DSN that is not a URL at all is refused", () => {
    process.env[KEY] = "host=127.0.0.1 port=54322 dbname=postgres";
    expect(() => galleryDatabaseUrl()).toThrow(/not a parseable URL/);
  });
});
