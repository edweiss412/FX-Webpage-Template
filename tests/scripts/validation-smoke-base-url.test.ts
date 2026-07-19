/**
 * tests/scripts/validation-smoke-base-url.test.ts (validation-smoke, Codex R1-F1)
 *
 * Pins assertValidationSmokeBaseUrl: the smoke script sends
 * `Authorization: Bearer <VALIDATION_TEST_AUTH_SECRET>` to the base URL it
 * is given, so an env-controlled VALIDATION_SMOKE_BASE_URL pointing anywhere
 * else exfiltrates the one credential that mints a validation admin session.
 * The validator must fail-closed to the validation project's own hosts
 * (production alias + this project's preview deployments), https only.
 */
import { describe, expect, test } from "vitest";
import { assertValidationSmokeBaseUrl } from "@/scripts/lib/validation-smoke-target";

describe("assertValidationSmokeBaseUrl (Codex R1-F1 bearer-exfiltration guard)", () => {
  test("production alias passes", () => {
    expect(() =>
      assertValidationSmokeBaseUrl("https://fxav-crew-pages-validation.vercel.app"),
    ).not.toThrow();
  });

  test("project preview deployment passes", () => {
    expect(() =>
      assertValidationSmokeBaseUrl(
        "https://fxav-crew-pages-validation-c3bnfgqc7-eric-weiss-projects.vercel.app",
      ),
    ).not.toThrow();
  });

  test("attacker host rejected", () => {
    expect(() => assertValidationSmokeBaseUrl("https://attacker.example.com")).toThrow(/base URL/i);
  });

  test("suffix-spoof rejected", () => {
    expect(() =>
      assertValidationSmokeBaseUrl("https://fxav-crew-pages-validation.vercel.app.evil.test"),
    ).toThrow(/base URL/i);
  });

  test("prefix-spoof preview shape on a foreign scope rejected", () => {
    expect(() =>
      assertValidationSmokeBaseUrl(
        "https://fxav-crew-pages-validation-c3bnfgqc7-attacker-projects.vercel.app",
      ),
    ).toThrow(/base URL/i);
  });

  test("http (non-TLS) rejected — the bearer must never travel cleartext", () => {
    expect(() =>
      assertValidationSmokeBaseUrl("http://fxav-crew-pages-validation.vercel.app"),
    ).toThrow(/https/i);
  });

  test("explicit port rejected", () => {
    expect(() =>
      assertValidationSmokeBaseUrl("https://fxav-crew-pages-validation.vercel.app:8443"),
    ).toThrow(/base URL/i);
  });

  test("localhost rejected — this script targets the deployed app only", () => {
    expect(() => assertValidationSmokeBaseUrl("http://127.0.0.1:3000")).toThrow();
  });

  test("garbage / non-URL rejected", () => {
    expect(() => assertValidationSmokeBaseUrl("not a url")).toThrow();
  });
});
