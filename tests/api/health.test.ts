// tests/api/health.test.ts
import { describe, expect, test, afterEach } from "vitest";
import { GET } from "@/app/api/health/route";
const orig = { ...process.env };
afterEach(() => {
  process.env = { ...orig };
});
describe("/api/health", () => {
  test("returns the build SHA when set", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "abc123";
    process.env.VERCEL_GIT_COMMIT_REF = "main";
    const body = await (await GET()).json();
    expect(body).toMatchObject({ ok: true, sha: "abc123", ref: "main" });
  });
  test("sha null when unset, still 200", async () => {
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).sha).toBeNull();
  });
});
