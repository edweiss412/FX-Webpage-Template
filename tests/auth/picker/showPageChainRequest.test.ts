import { beforeEach, describe, expect, test, vi } from "vitest";
import { cookies, headers } from "next/headers";

import { buildShowPageChainRequest } from "@/lib/auth/picker/showPageChainRequest";

vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));

const PICKER_COOKIE = "__Host-fxav_picker";

function pickerHeaderValue(req: Request): string | null {
  return req.headers.get("cookie");
}

beforeEach(() => {
  vi.mocked(cookies).mockReset();
  vi.mocked(headers).mockReset();
});

describe("buildShowPageChainRequest", () => {
  // The double-tap bug (M12 Phase 0.F smokes 5+6): the show page synthesized
  // the resolver's request cookie header from `headers().get("cookie")` — the
  // IMMUTABLE inbound request header. When `selectIdentity` (a Server Action on
  // the same route) sets `__Host-fxav_picker` and revalidates, Next re-renders
  // the page in the same response, but the inbound header still lacks the new
  // selection. So the first tap re-rendered the picker ("nothing happened") and
  // only the second tap — whose request finally replayed the stored cookie —
  // resolved. The fix sources cookies from Next's mutable `cookies()` store,
  // which DOES reflect same-request Server Action writes.
  test("sources cookies from the mutable cookies() store, not the inbound request header", async () => {
    // Inbound request header is STALE: it has an unrelated session cookie but
    // NOT the picker selection the Server Action just wrote.
    vi.mocked(headers).mockResolvedValue(
      new Headers({
        cookie: "sb-access-token=stale-session",
        "x-pathname": "/show/the-show/abc123",
      }) as never,
    );
    // The mutable cookie store DOES carry the freshly-set picker selection.
    vi.mocked(cookies).mockResolvedValue({
      getAll: () => [
        { name: "sb-access-token", value: "stale-session" },
        { name: PICKER_COOKIE, value: "FRESH_SELECTION" },
      ],
    } as never);

    const req = await buildShowPageChainRequest();
    const cookieHeader = pickerHeaderValue(req);

    expect(cookieHeader).toContain(`${PICKER_COOKIE}=FRESH_SELECTION`);
    // And it must NOT silently fall back to the stale inbound header (which
    // would omit the picker cookie and reproduce the double-tap).
    expect(cookieHeader).toContain("sb-access-token=stale-session");
  });

  test("preserves the x-pathname header as the synthetic request URL path", async () => {
    vi.mocked(headers).mockResolvedValue(
      new Headers({ cookie: "", "x-pathname": "/show/slug/token" }) as never,
    );
    vi.mocked(cookies).mockResolvedValue({ getAll: () => [] } as never);

    const req = await buildShowPageChainRequest();

    expect(new URL(req.url).pathname).toBe("/show/slug/token");
  });

  test("defaults the path to '/' when x-pathname is absent", async () => {
    vi.mocked(headers).mockResolvedValue(new Headers({}) as never);
    vi.mocked(cookies).mockResolvedValue({ getAll: () => [] } as never);

    const req = await buildShowPageChainRequest();

    expect(new URL(req.url).pathname).toBe("/");
  });
});
