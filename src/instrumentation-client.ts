import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry-options";

Sentry.init(
  sentryOptions({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    appEnv: process.env.NEXT_PUBLIC_APP_ENV,
    buildId: process.env.APP_BUILD_ID,
  }),
);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
