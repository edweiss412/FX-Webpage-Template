import { decodeProtectedHeader } from "jose";
import { beforeEach, describe, expect, test, vi } from "vitest";

type AppSettingsRow = { active_signing_key_id: string };

const serviceState = vi.hoisted(() => ({
  activeSigningKeyId: "k1",
  appSettingsSelects: 0,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from(table: string) {
      if (table !== "app_settings") {
        throw new Error(`unexpected table ${table}`);
      }
      return {
        select(columns: string) {
          serviceState.appSettingsSelects += 1;
          expect(columns).toBe("active_signing_key_id");
          return {
            eq(column: string, value: string) {
              expect(column).toBe("id");
              expect(value).toBe("default");
              return {
                single: async (): Promise<{
                  data: AppSettingsRow;
                  error: null;
                }> => ({
                  data: {
                    active_signing_key_id: serviceState.activeSigningKeyId,
                  },
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  }),
}));

const { signLinkJwt, verifyLinkJwt } = await import("@/lib/auth/jwt");

const showId = "11111111-1111-4111-8111-111111111111";

describe("signed-link JWT helpers", () => {
  beforeEach(() => {
    process.env.JWT_SIGNING_SECRET = "test-signing-secret-32-bytes-minimum";
    serviceState.activeSigningKeyId = "k1";
    serviceState.appSettingsSelects = 0;
  });

  test("signs a crew-member token and verifies payload plus header kid", async () => {
    const signed = await signLinkJwt({
      showId,
      name: "Eric Weiss",
      displayName: "Eric Weiss",
      tokenVersion: 1,
    });

    expect(signed.signingKeyId).toBe("k1");
    expect(decodeProtectedHeader(signed.token).kid).toBe("k1");

    serviceState.activeSigningKeyId = "k2";
    serviceState.appSettingsSelects = 0;
    const verified = await verifyLinkJwt(signed.token);

    expect(serviceState.appSettingsSelects).toBe(0);
    expect(verified.verifiedKid).toBe("k1");
    expect(verified.payload.sub).toBe(`crew_member:${showId}:Eric Weiss`);
    expect(verified.payload.showId).toBe(showId);
    expect(verified.payload.crewMemberKey).toEqual({
      showId,
      name: "Eric Weiss",
    });
    expect(verified.payload.displayName).toBe("Eric Weiss");
    expect(verified.payload.tokenVersion).toBe(1);
    expect(typeof verified.payload.iat).toBe("number");
    expect(typeof verified.payload.exp).toBe("number");
    expect(verified.payload.exp - verified.payload.iat).toBe(90 * 24 * 60 * 60);
  });

  test("rejects expired tokens", async () => {
    const signed = await signLinkJwt({
      showId,
      name: "Eric Weiss",
      tokenVersion: 1,
      expiresInSec: -1,
    });

    await expect(verifyLinkJwt(signed.token)).rejects.toThrow();
  });

  test("rejects a tampered signature", async () => {
    const signed = await signLinkJwt({
      showId,
      name: "Eric Weiss",
      tokenVersion: 1,
    });
    const segments = signed.token.split(".");
    expect(segments).toHaveLength(3);
    const signature = segments[2]!;
    const tamperedSignature = `${signature.startsWith("a") ? "b" : "a"}${signature.slice(1)}`;
    const tampered = `${segments[0]}.${segments[1]}.${tamperedSignature}`;

    await expect(verifyLinkJwt(tampered)).rejects.toThrow();
  });

  test("rejects tokens signed with a different secret", async () => {
    const signed = await signLinkJwt({
      showId,
      name: "Eric Weiss",
      tokenVersion: 1,
    });
    process.env.JWT_SIGNING_SECRET = "different-secret-32-bytes-minimum";

    await expect(verifyLinkJwt(signed.token)).rejects.toThrow();
  });
});
