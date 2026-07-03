import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/observe/scrubSentryEvent";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0,
  beforeSend: (event) => scrubSentryEvent(event),
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
