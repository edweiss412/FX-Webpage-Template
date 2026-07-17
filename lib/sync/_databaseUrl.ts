/**
 * Single DATABASE_URL resolver for the sync tick-level postgres.js clients.
 *
 * Extracted verbatim from `runScheduledCronSync` (which now re-exports it) so the drift pre-pass
 * (`roleVocabDrift.ts`) resolves the SAME url with the SAME precedence as the cron pipeline it
 * feeds — a precedence divergence would point the scanner at a different DB than the per-file gate
 * mutates (spec 2026-07-16-role-vocab-mapping-convergence §3.2). Both files import this one function;
 * do NOT add a second resolver. Precedence: TEST_DATABASE_URL ?? DATABASE_URL ?? local fallback,
 * with the production guard preserved.
 */
export function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("runScheduledCronSync requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}
