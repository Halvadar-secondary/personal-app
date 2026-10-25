import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry-options";

export function register() {
  Sentry.init(
    sentryOptions({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      appEnv: process.env.APP_ENV,
      buildId: process.env.APP_BUILD_ID,
    }),
  );
}

// Errors pages, routes and Server Actions rethrow reach Sentry here.
export const onRequestError = Sentry.captureRequestError;
