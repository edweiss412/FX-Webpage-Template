import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdminIdentity: vi.fn().mockResolvedValue({ email: "admin@example.com" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/data/signedLinks", () => ({
  revokeAllLinks: vi.fn(),
  issueNewLink: vi.fn(),
  SignedLinksInfraError: class extends Error {
    readonly code = "SIGNED_LINKS_INFRA";
    constructor(m: string) {
      super(m);
      this.name = "SignedLinksInfraError";
    }
  },
}));

import {
  revokeAllLinksAction,
  issueNewLinkAction,
} from "@/app/admin/show/[slug]/actions";
import {
  revokeAllLinks,
  issueNewLink,
  SignedLinksInfraError,
} from "@/lib/data/signedLinks";
import { revalidatePath } from "next/cache";

beforeEach(() => {
  vi.clearAllMocks();
});

function fd(showId: string | null, crewName: string | null): FormData {
  const f = new FormData();
  if (showId !== null) f.set("showId", showId);
  if (crewName !== null) f.set("crewName", crewName);
  return f;
}

const okRow = {
  current_token_version: 2,
  max_issued_version: 2,
  revoked_below_version: 2,
};

describe("revokeAllLinksAction", () => {
  test("ok outcome → revalidates per-show path + returns ok kind with REVOKED_OK code", async () => {
    vi.mocked(revokeAllLinks).mockResolvedValue({ kind: "ok", row: okRow });
    const result = await revokeAllLinksAction(null, fd("show-uuid", "Alice"));
    expect(result).toEqual({ kind: "ok", code: "ADMIN_LINK_REVOKED_OK" });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/show/[slug]", "page");
  });

  test("no_live_link outcome → returns refused with NO_LIVE_LINK code; does NOT revalidate", async () => {
    vi.mocked(revokeAllLinks).mockResolvedValue({ kind: "no_live_link" });
    const result = await revokeAllLinksAction(null, fd("show-uuid", "Alice"));
    expect(result).toEqual({
      kind: "refused",
      code: "ADMIN_LINK_NO_LIVE_LINK",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  test("show_not_found outcome → returns refused with SHOW_NOT_FOUND code", async () => {
    vi.mocked(revokeAllLinks).mockResolvedValue({ kind: "show_not_found" });
    const result = await revokeAllLinksAction(null, fd("missing", "Alice"));
    expect(result).toEqual({
      kind: "refused",
      code: "ADMIN_LINK_SHOW_NOT_FOUND",
    });
  });

  test("crew_member_not_found outcome → returns refused with CREW_NOT_FOUND code", async () => {
    vi.mocked(revokeAllLinks).mockResolvedValue({
      kind: "crew_member_not_found",
    });
    const result = await revokeAllLinksAction(null, fd("show-uuid", "Ghost"));
    expect(result).toEqual({
      kind: "refused",
      code: "ADMIN_LINK_CREW_NOT_FOUND",
    });
  });

  test("SignedLinksInfraError propagates (does NOT swallow into benign result) — AGENTS.md §1.9", async () => {
    vi.mocked(revokeAllLinks).mockRejectedValue(
      new SignedLinksInfraError("DB unavailable"),
    );
    await expect(
      revokeAllLinksAction(null, fd("show-uuid", "Alice")),
    ).rejects.toBeInstanceOf(SignedLinksInfraError);
  });

  test("missing form fields → returns refused with CREW_NOT_FOUND code (data-layer never called)", async () => {
    const result = await revokeAllLinksAction(null, new FormData());
    expect(result.kind).toBe("refused");
    expect(revokeAllLinks).not.toHaveBeenCalled();
  });

  test("empty-string form fields → refused (no data-layer call)", async () => {
    const result = await revokeAllLinksAction(null, fd("", ""));
    expect(result.kind).toBe("refused");
    expect(revokeAllLinks).not.toHaveBeenCalled();
  });
});

describe("issueNewLinkAction", () => {
  test("ok outcome → revalidates + returns ok kind with ISSUED_OK code", async () => {
    vi.mocked(issueNewLink).mockResolvedValue({
      kind: "ok",
      row: { current_token_version: 2, max_issued_version: 2, revoked_below_version: 0 },
    });
    const result = await issueNewLinkAction(null, fd("show-uuid", "Alice"));
    expect(result).toEqual({ kind: "ok", code: "ADMIN_LINK_ISSUED_OK" });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/show/[slug]", "page");
  });

  test("show_not_found + crew_member_not_found mappings", async () => {
    vi.mocked(issueNewLink).mockResolvedValue({ kind: "show_not_found" });
    expect(await issueNewLinkAction(null, fd("missing", "Alice"))).toEqual({
      kind: "refused",
      code: "ADMIN_LINK_SHOW_NOT_FOUND",
    });

    vi.mocked(issueNewLink).mockResolvedValue({
      kind: "crew_member_not_found",
    });
    expect(await issueNewLinkAction(null, fd("show-uuid", "Ghost"))).toEqual({
      kind: "refused",
      code: "ADMIN_LINK_CREW_NOT_FOUND",
    });
  });

  test("SignedLinksInfraError propagates", async () => {
    vi.mocked(issueNewLink).mockRejectedValue(
      new SignedLinksInfraError("DB unavailable"),
    );
    await expect(
      issueNewLinkAction(null, fd("show-uuid", "Alice")),
    ).rejects.toBeInstanceOf(SignedLinksInfraError);
  });

  test("missing form fields → refused without data-layer call", async () => {
    const result = await issueNewLinkAction(null, new FormData());
    expect(result.kind).toBe("refused");
    expect(issueNewLink).not.toHaveBeenCalled();
  });
});
