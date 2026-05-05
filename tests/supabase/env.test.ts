import { describe, expect, test, vi } from "vitest";

const captures = vi.hoisted(() => ({
  server: null as null | { url: string; key: string },
  browser: null as null | { url: string; key: string },
  service: null as null | { url: string; key: string },
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [],
    set: () => undefined,
  }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn((url: string, key: string) => {
    captures.server = { url, key };
    return {};
  }),
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
});
