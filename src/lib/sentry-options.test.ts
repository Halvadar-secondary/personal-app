import { describe, expect, it } from "vitest";
import { scrubEvent, sentryOptions } from "./sentry-options";

describe("sentryOptions", () => {
  it("disabled without a DSN", () => {
    const o = sentryOptions({});
    expect(o.enabled).toBe(false);
    expect(o.environment).toBe("local");
    expect(o.release).toBe("dev");
  });

  it("production options carry environment and release", () => {
    expect(
      sentryOptions({
        dsn: "https://k@o1.ingest.sentry.io/1",
        appEnv: "production",
        buildId: "abc123",
      }),
    ).toMatchObject({
      dsn: "https://k@o1.ingest.sentry.io/1",
      enabled: true,
      environment: "production",
      release: "abc123",
      tracesSampleRate: 0,
      sendDefaultPii: false,
      beforeSend: scrubEvent,
    });
  });
});

describe("scrubEvent", () => {
  it("scrubEvent removes cookies, body, query, auth headers and user", () => {
    const event = scrubEvent({
      message: "boom",
      request: {
        url: "https://x/search?q=guitar",
        query_string: "q=guitar",
        cookies: { session: "s" },
        data: { title: "Learn guitar" },
        headers: {
          authorization: "Bearer t",
          cookie: "c",
          "user-agent": "UA",
        },
      },
      user: { email: "me@x.com", ip_address: "1.2.3.4" },
    });
    expect(event.message).toBe("boom");
    expect(event.request?.url).toBe("https://x/search");
    expect(event.request?.headers).toEqual({ "user-agent": "UA" });
    expect(event.request?.data).toBeUndefined();
    expect(event.request?.cookies).toBeUndefined();
    expect(event.request?.query_string).toBeUndefined();
    expect(event.user).toBeUndefined();
  });

  it("leaves an event without a request alone", () => {
    expect(scrubEvent({ message: "boom", request: undefined })).toEqual({
      message: "boom",
    });
  });
});
