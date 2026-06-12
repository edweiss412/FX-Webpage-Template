// M12.13 Task 11 — route-precedence pin (spec §5 "Route"): the confirm page
// lives at the STATIC segment app/show/[slug]/unpublish/ beside the DYNAMIC
// crew segment app/show/[slug]/[shareToken]/. Next.js resolves static
// segments over dynamic ones deterministically, so /show/<slug>/unpublish
// always hits the confirm page and NEVER the crew [shareToken] page. This
// fs-level pin fails if either segment is renamed/moved (which would silently
// re-route emailed undo links to the crew page, or vice versa); the e2e
// variant is the confirm-page render tests themselves.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

describe("unpublish confirm-page route precedence", () => {
  test("static unpublish/page.tsx exists beside the dynamic [shareToken] segment", () => {
    expect(existsSync(join(process.cwd(), "app/show/[slug]/unpublish/page.tsx"))).toBe(true);
    expect(existsSync(join(process.cwd(), "app/show/[slug]/[shareToken]/page.tsx"))).toBe(true);
  });

  test("a generated share token can never BE the literal 'unpublish' (no collision even in theory)", () => {
    // Share tokens are encode(extensions.gen_random_bytes(32), 'hex') — see
    // supabase + lib/sync/unpublishShow.ts rotation SQL — i.e. exactly 64
    // lowercase hex chars. The static segment name cannot match that shape.
    expect("unpublish").not.toMatch(/^[0-9a-f]{64}$/);
  });
});
