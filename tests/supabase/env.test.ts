import { describe, expect, test, vi } from "vitest";

const captures = vi.hoisted(() => ({
  server: null as null | { url: string; key: string },
  serverCookieOptions: null as null | {
    cookies: {
      setAll: (
        cookiesToSet: Array<{
          name: string;
          value: string;
          options: Record<string, unknown>;
        }>,
      ) => void;
    };
  },
  cookieSets: [] as Array<{
    name: string;
    value: string;
    options: Record<string, unknown>;
  }>,
  browser: null as null | { url: string; key: string },
  service: null as null | { url: string; key: string },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [],
    set: (name: string, value: string, options: Record<string, unknown>) => {
      captures.cookieSets.push({ name, value, options });
    },
  }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(
    (
      url: string,
      key: string,
      options: {
        cookies: {
          setAll: (
            cookiesToSet: Array<{
              name: string;
              value: string;
              options: Record<string, unknown>;
            }>,
          ) => void;
        };
      },
    ) => {
      captures.server = { url, key };
      captures.serverCookieOptions = options;
      return {};
    },
  ),
  createBrowserClient: vi.fn((url: string, key: string) => {
    captures.browser = { url, key };
    return {};
  }),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn((url: string, key: string) => {
    captures.service = { url, key };
    return {};
  }),
}));

const { createSupabaseServerClient, createSupabaseServiceRoleClient } =
  await import("@/lib/supabase/server");
const { getSupabaseBrowserClient } = await import("@/lib/supabase/browser");

describe("Supabase env aliases", () => {
  test("server helper writes PKCE verifier cookies with HttpOnly attributes", async () => {
    const oldEnv = { ...process.env };
    try {
      captures.cookieSets = [];
      process.env.SUPABASE_URL = "https://project.supabase.co";
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_doc";

      await createSupabaseServerClient();
      captures.serverCookieOptions!.cookies.setAll([
        {
          name: "sb-test-auth-token-code-verifier",
          value: "verifier",
          options: { path: "/" },
        },
      ]);

      expect(captures.cookieSets).toEqual([
        {
          name: "sb-test-auth-token-code-verifier",
          value: "verifier",
          options: {
            path: "/",
            httpOnly: true,
            secure: true,
            sameSite: "lax",
          },
        },
      ]);
    } finally {
      process.env = oldEnv;
    }
  });

  test("server, browser, and service-role helpers accept the documented Supabase key names", async () => {
    const oldEnv = { ...process.env };
    try {
      delete process.env.SUPABASE_ANON_KEY;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      process.env.SUPABASE_URL = "https://project.supabase.co";
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_doc";
      process.env.SUPABASE_SECRET_KEY = "sb_secret_doc";

      await createSupabaseServerClient();
      createSupabaseServiceRoleClient();
      getSupabaseBrowserClient();

      expect(captures.server).toMatchObject({
        url: "https://project.supabase.co",
        key: "sb_publishable_doc",
      });
      expect(captures.browser).toMatchObject({
        url: "https://project.supabase.co",
        key: "sb_publishable_doc",
      });
      expect(captures.service).toMatchObject({
        url: "https://project.supabase.co",
        key: "sb_secret_doc",
      });
    } finally {
      process.env = oldEnv;
    }
  });

  test("service-role helper refuses local fallback in production", () => {
    const oldEnv = { ...process.env };
    try {
      vi.stubEnv("NODE_ENV", "production");
      process.env.SUPABASE_URL = "https://project.supabase.co";
      delete process.env.SUPABASE_SECRET_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      expect(() => createSupabaseServiceRoleClient()).toThrow(/SUPABASE_SECRET_KEY/);
    } finally {
      process.env = oldEnv;
      vi.unstubAllEnvs();
    }
  });
});
