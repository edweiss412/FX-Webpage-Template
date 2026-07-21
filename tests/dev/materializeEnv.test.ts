/**
 * tests/dev/materializeEnv.test.ts
 * (spec 2026-07-20-attention-scenario-gallery §5.5)
 *
 * The materialize target gate. This is the only thing standing between a dev
 * instrument that writes synthetic alerts and a production database, so it is
 * FAIL-CLOSED by construction: `local` must be loopback, `validation` must be
 * the one known validation project AND explicitly confirmed, and anything else
 * is refused with a named reason.
 *
 * The regression these tests exist for: an earlier design trusted
 * VALIDATION_SUPABASE_PROJECT_REF as the identity of the target. A caller who
 * set that variable correctly while pointing VALIDATION_SUPABASE_URL at some
 * other project would have been allowed through. Identity is derived from the
 * URL that will actually be connected to; the declared ref only has to AGREE.
 */
import { describe, expect, test } from "vitest";
import { resolveTarget, type EnvInput } from "@/lib/dev/materialize/env";
import { VALIDATION_PROJECT_REF } from "@/lib/admin/validationDeployment";

const VALIDATION_URL = `https://${VALIDATION_PROJECT_REF}.supabase.co`;

function input(over: Partial<EnvInput> = {}): EnvInput {
  return {
    target: "local",
    confirmed: false,
    localUrl: "http://127.0.0.1:54321",
    localKey: "local-secret",
    validationUrl: VALIDATION_URL,
    validationKey: "validation-secret",
    validationRef: VALIDATION_PROJECT_REF,
    ...over,
  };
}

describe("resolveTarget — local", () => {
  test("every loopback form is accepted", () => {
    for (const url of [
      "http://127.0.0.1:54321",
      "http://localhost:54321",
      "http://[::1]:54321",
      "https://localhost",
    ]) {
      const r = resolveTarget(input({ localUrl: url }));
      expect(r.kind, url).toBe("ok");
      if (r.kind === "ok") {
        expect(r.url).toBe(url);
        expect(r.key).toBe("local-secret");
        expect(r.target).toBe("local");
      }
    }
  });

  test("a non-loopback URL is refused even though the target says local", () => {
    for (const url of [
      "https://abcdefghijklmnop.supabase.co",
      "http://192.168.1.10:54321",
      "http://127.0.0.1.evil.test",
      "http://localhost.evil.test",
    ]) {
      const r = resolveTarget(input({ localUrl: url }));
      expect(r, url).toEqual({ kind: "refused", reason: "local_not_loopback" });
    }
  });

  test("a non-HTTP scheme is refused even with a loopback hostname", () => {
    // These parse with hostname "localhost" but make Supabase throw
    // synchronously at client construction, escaping the typed result.
    for (const url of ["ftp://localhost", "file://localhost/tmp/x", "ws://localhost:54321"]) {
      expect(resolveTarget(input({ localUrl: url })), url).toEqual({
        kind: "refused",
        reason: "local_not_loopback",
      });
    }
  });

  test("an unparseable URL is refused, not treated as loopback", () => {
    expect(resolveTarget(input({ localUrl: "not a url" }))).toEqual({
      kind: "refused",
      reason: "local_not_loopback",
    });
  });

  test("a missing URL or key is refused with its own reason", () => {
    expect(resolveTarget(input({ localUrl: undefined }))).toEqual({
      kind: "refused",
      reason: "local_url_missing",
    });
    expect(resolveTarget(input({ localUrl: "" }))).toEqual({
      kind: "refused",
      reason: "local_url_missing",
    });
    expect(resolveTarget(input({ localKey: undefined }))).toEqual({
      kind: "refused",
      reason: "local_key_missing",
    });
  });

  test("local never requires confirmation", () => {
    expect(resolveTarget(input({ confirmed: false })).kind).toBe("ok");
  });
});

describe("resolveTarget — validation", () => {
  const v = (over: Partial<EnvInput> = {}) =>
    resolveTarget(input({ target: "validation", confirmed: true, ...over }));

  test("the confirmed, complete, matching triple is accepted", () => {
    const r = v();
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.url).toBe(VALIDATION_URL);
      expect(r.key).toBe("validation-secret");
      expect(r.target).toBe("validation");
    }
  });

  test("confirmation must be EXACTLY true, not merely truthy", () => {
    // The core actions are independently exported server actions, so a caller
    // can pass a value TypeScript would have rejected.
    for (const bogus of ["false", "true", 1, {}, [] as unknown]) {
      expect(v({ confirmed: bogus as unknown as boolean }), String(bogus)).toEqual({
        kind: "refused",
        reason: "validation_unconfirmed",
      });
    }
  });

  test("an unconfirmed request is refused before anything else is checked", () => {
    // Refusal ordering matters: an unconfirmed request with a BROKEN triple must
    // still report unconfirmed, so the operator fixes the consent step rather
    // than chasing an env-var error they never triggered.
    expect(v({ confirmed: false, validationUrl: undefined })).toEqual({
      kind: "refused",
      reason: "validation_unconfirmed",
    });
  });

  test("an incomplete triple is refused", () => {
    for (const over of [
      { validationUrl: undefined },
      { validationKey: undefined },
      { validationRef: undefined },
      { validationKey: "" },
    ]) {
      expect(v(over), JSON.stringify(over)).toEqual({
        kind: "refused",
        reason: "validation_triple_incomplete",
      });
    }
  });

  test("a URL pointing at ANOTHER project is refused even when the declared ref is correct", () => {
    // The P0 this suite exists for. The declared ref is right; the URL is not.
    // Trusting the declaration would connect to a project nobody authorized.
    expect(v({ validationUrl: "https://someotherproject.supabase.co" })).toEqual({
      kind: "refused",
      reason: "validation_ref_mismatch",
    });
  });

  test("an unparseable validation URL is a mismatch, never a pass", () => {
    // projectRefFromUrl returns null here; null must not compare equal to the
    // constant through any coercion path.
    for (const url of ["not a url", "https://supabase.co", "http://localhost:54321"]) {
      expect(v({ validationUrl: url }), url).toEqual({
        kind: "refused",
        reason: "validation_ref_mismatch",
      });
    }
  });

  test("a declared ref that disagrees with the URL-derived ref is refused distinctly", () => {
    // The URL IS the validation project, but the declared ref says otherwise —
    // the env is internally inconsistent, which is its own diagnosis.
    expect(v({ validationRef: "someotherprojectref" })).toEqual({
      kind: "refused",
      reason: "validation_ref_disagrees",
    });
  });

  test("validation never falls back to the local URL or key", () => {
    const r = v();
    if (r.kind === "ok") {
      expect(r.url).not.toBe("http://127.0.0.1:54321");
      expect(r.key).not.toBe("local-secret");
    }
  });
});

describe("resolveTarget — unknown target", () => {
  test("anything outside the two known targets is refused", () => {
    expect(resolveTarget(input({ target: "prod" as never }))).toEqual({
      kind: "refused",
      reason: "unknown_target",
    });
  });
});
