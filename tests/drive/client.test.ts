import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const driveMock = vi.fn();
const googleAuthMock = vi.fn();

vi.mock("googleapis", () => ({
  google: {
    auth: {
      GoogleAuth: googleAuthMock,
    },
    drive: driveMock,
  },
}));

const SERVICE_ACCOUNT = {
  type: "service_account",
  project_id: "fxav-test",
  private_key_id: "key-id",
  private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
  client_email: "drive-sync@fxav-test.iam.gserviceaccount.com",
  client_id: "1234567890",
};

describe("getDriveClient", () => {
  const oldEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...oldEnv };
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = JSON.stringify(SERVICE_ACCOUNT);
    googleAuthMock.mockImplementation(function GoogleAuth(options) {
      return { kind: "auth", options };
    });
    driveMock.mockReturnValue({ kind: "drive-client" });
  });

  afterEach(() => {
    process.env = oldEnv;
  });

  test("returns a Drive v3 client authenticated with GOOGLE_SERVICE_ACCOUNT_JSON", async () => {
    const { getDriveClient, GOOGLE_DRIVE_SCOPES } = await import("@/lib/drive/client");

    const client = getDriveClient();

    expect(client).toEqual({ kind: "drive-client" });
    expect(googleAuthMock).toHaveBeenCalledWith({
      credentials: SERVICE_ACCOUNT,
      scopes: GOOGLE_DRIVE_SCOPES,
    });
    expect(driveMock).toHaveBeenCalledWith({
      version: "v3",
      auth: { kind: "auth", options: { credentials: SERVICE_ACCOUNT, scopes: GOOGLE_DRIVE_SCOPES } },
    });
  });

  test("throws a config error when GOOGLE_SERVICE_ACCOUNT_JSON is missing", async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const { getDriveClient } = await import("@/lib/drive/client");

    expect(() => getDriveClient()).toThrow(/GOOGLE_SERVICE_ACCOUNT_JSON/);
    expect(googleAuthMock).not.toHaveBeenCalled();
    expect(driveMock).not.toHaveBeenCalled();
  });

  test("throws a config error when GOOGLE_SERVICE_ACCOUNT_JSON is invalid JSON", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = "{not-json";
    const { getDriveClient } = await import("@/lib/drive/client");

    expect(() => getDriveClient()).toThrow(/GOOGLE_SERVICE_ACCOUNT_JSON/);
    expect(googleAuthMock).not.toHaveBeenCalled();
    expect(driveMock).not.toHaveBeenCalled();
  });

  test("getDriveAccessToken returns the service-account access token", async () => {
    googleAuthMock.mockImplementation(function GoogleAuth(options) {
      return { kind: "auth", options, getAccessToken: async () => "ya29.live-token" };
    });
    const { getDriveAccessToken, GOOGLE_DRIVE_SCOPES } = await import("@/lib/drive/client");

    await expect(getDriveAccessToken()).resolves.toBe("ya29.live-token");
    expect(googleAuthMock).toHaveBeenCalledWith({
      credentials: SERVICE_ACCOUNT,
      scopes: GOOGLE_DRIVE_SCOPES,
    });
    expect(driveMock).not.toHaveBeenCalled();
  });

  test("getDriveAccessToken throws a config error when Google Auth returns no token", async () => {
    googleAuthMock.mockImplementation(function GoogleAuth(options) {
      return { kind: "auth", options, getAccessToken: async () => null };
    });
    const { getDriveAccessToken } = await import("@/lib/drive/client");

    await expect(getDriveAccessToken()).rejects.toThrow(/access token/);
    expect(driveMock).not.toHaveBeenCalled();
  });
});
