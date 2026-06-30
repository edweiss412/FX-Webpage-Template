import * as Sentry from "@sentry/nextjs";
import { parseSampleRate } from "@/lib/observe/parseSampleRate";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: parseSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE),
});
