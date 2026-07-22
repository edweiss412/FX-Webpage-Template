/**
 * tests/e2e/helpers/loadTestEnv.ts
 *
 * Side-effect import: load `.env.local` into the Playwright RUNNER process
 * before any server module is evaluated. Import this FIRST (above server-side
 * imports) in any e2e spec that imports application server code at module load
 * — several server modules throw at import if a required secret is absent (e.g.
 * `lib/email/hashForLog.ts` needs `HASH_FOR_LOG_PEPPER`, reached transitively
 * through `buildScenarioModalData → step3ReviewSections → requireAdmin`).
 *
 * The webServer (`next start`) already loads `.env.local`; the test runner is a
 * separate process that does not, so its imports would otherwise crash at
 * collection. `.env.local`'s Supabase URL is loopback and it overrides none of
 * the e2e-behavior vars (TEST_AUTH_*, PLAYWRIGHT_BASE_URL, ADMIN_DEV_PANEL_*),
 * so loading it here changes nothing for specs that do not opt in.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
