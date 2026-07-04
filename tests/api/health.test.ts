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

  test("exposes a logging health snapshot (finding #9 operator probe)", async () => {
    const body = await (await GET()).json();
    expect(body.logging).toEqual(
      expect.objectContaining({ ok: expect.any(Number), failed: expect.any(Number) }),
    );
    // lastError/lastFailedAt are present (null until a write fails) so operators can
    // distinguish "channel healthy" from "channel down" from the probe alone.
    expect(body.logging).toHaveProperty("lastError");
    expect(body.logging).toHaveProperty("lastFailedAt");
  });
});
