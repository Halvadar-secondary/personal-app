import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";
import { securityHeaders } from "./src/security-headers";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  env: {
    APP_BUILD_ID: process.env.APP_BUILD_ID ?? "dev",
    // The browser's Sentry environment tag.
    NEXT_PUBLIC_APP_ENV: process.env.APP_ENV ?? "local",
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders() }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Source maps upload only when deploy.yml provides SENTRY_AUTH_TOKEN; other builds skip it.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Same-origin, so the CSP keeps connect-src 'self' (and ad blockers don't drop reports).
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,
  telemetry: false,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
});
