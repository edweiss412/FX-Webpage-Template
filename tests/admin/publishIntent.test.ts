import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { postPublishIntent } from "@/lib/admin/publishIntent";

describe("postPublishIntent", () => {
  const wizardSessionId = "ws-123";
  const driveFileId = "df-456";

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to /approve endpoint when next=true", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "approved" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await postPublishIntent(wizardSessionId, driveFileId, true);

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/onboarding/staged/${wizardSessionId}/${driveFileId}/approve`,
      { method: "POST" }
    );
  });

  it("POSTs to /unapprove endpoint when next=false", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "unapproved" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await postPublishIntent(wizardSessionId, driveFileId, false);

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/onboarding/staged/${wizardSessionId}/${driveFileId}/unapprove`,
      { method: "POST" }
    );
  });

  it("returns true on 200 with {status:...} body", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "approved" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await postPublishIntent(wizardSessionId, driveFileId, true);

    expect(result).toBe(true);
  });

  it("returns false on 200 with {ok:false} body (server refusal)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: false }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await postPublishIntent(wizardSessionId, driveFileId, true);

    expect(result).toBe(false);
  });

  it("returns false when res.ok is false", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await postPublishIntent(wizardSessionId, driveFileId, true);

    expect(result).toBe(false);
  });

  it("returns false when fetch throws", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("Network error"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await postPublishIntent(wizardSessionId, driveFileId, true);

    expect(result).toBe(false);
  });

  it("returns true on 200 with unparseable body", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new Error("Invalid JSON");
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await postPublishIntent(wizardSessionId, driveFileId, true);

    expect(result).toBe(true);
  });
});
