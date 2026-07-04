import { describe, expect, test } from "vitest";
import nextConfig from "@/next.config";

describe("old observability bookmark redirect", () => {
  test('redirects() includes { source: "/admin/observability", destination: "/admin/dev/telemetry", permanent: true }', async () => {
    expect(typeof nextConfig.redirects).toBe("function");
    const redirects = await nextConfig.redirects!();
    expect(redirects).toContainEqual(
      expect.objectContaining({
        source: "/admin/observability",
        destination: "/admin/dev/telemetry",
        permanent: true,
      }),
    );
  });
});
