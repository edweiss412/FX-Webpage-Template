// scripts/lib/validation-smoke-target.ts (validation-smoke, Codex R1-F1)
//
// The smoke script sends `Authorization: Bearer <VALIDATION_TEST_AUTH_SECRET>`
// to whatever base URL it is pointed at — that bearer is the one credential
// that mints a validation admin session, so an env-controlled
// VALIDATION_SMOKE_BASE_URL aimed anywhere else exfiltrates it. Fail-closed
// allowlist: https only, no explicit port, and the host must be the
// validation project's production alias or one of ITS OWN preview
// deployments (project-name prefix + this account's scope suffix — a
// foreign-scope host with the same project prefix is rejected).

const PRODUCTION_HOST = "fxav-crew-pages-validation.vercel.app";
const PREVIEW_HOST_RE = /^fxav-crew-pages-validation-[a-z0-9]+-eric-weiss-projects\.vercel\.app$/;

export function assertValidationSmokeBaseUrl(raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`[validation-smoke] base URL is not a valid URL: ${JSON.stringify(raw)}`);
  }
  if (url.protocol !== "https:") {
    throw new Error(
      `[validation-smoke] base URL must be https (the bearer must never travel cleartext): ${raw}`,
    );
  }
  if (url.port !== "") {
    throw new Error(`[validation-smoke] base URL must not carry an explicit port: ${raw}`);
  }
  const host = url.hostname;
  if (host !== PRODUCTION_HOST && !PREVIEW_HOST_RE.test(host)) {
    throw new Error(
      `[validation-smoke] base URL host ${JSON.stringify(host)} is not the validation project — refusing to send the test-auth bearer there.`,
    );
  }
}
