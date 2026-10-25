// Shared by the browser, Node and edge Sentry setups (spec §13).

type ScrubbableEvent = {
  request?: {
    url?: string;
    query_string?: unknown;
    cookies?: unknown;
    data?: unknown;
    headers?: Record<string, string>;
  };
  user?: unknown;
};

/**
 * Strips what could carry personal data before an event leaves the app:
 * goal titles in bodies and queries, search terms, cookies, bearer tokens.
 */
export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  delete event.user;
  const req = event.request;
  if (!req) return event;
  delete req.cookies;
  delete req.data;
  delete req.query_string;
  if (req.url) req.url = req.url.split("?")[0];
  if (req.headers) {
    const ua = req.headers["user-agent"];
    req.headers = ua ? { "user-agent": ua } : {};
  }
  return event;
}

export function sentryOptions(env: {
  dsn?: string;
  appEnv?: string;
  buildId?: string;
}) {
  return {
    dsn: env.dsn,
    // Only production has a DSN, so local, CI and previews send nothing.
    enabled: Boolean(env.dsn),
    environment: env.appEnv ?? "local",
    release: env.buildId ?? "dev",
    tracesSampleRate: 0 as const,
    sendDefaultPii: false as const,
    beforeSend: scrubEvent,
  };
}
