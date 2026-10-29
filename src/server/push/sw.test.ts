import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

// public/sw.js run in a stand-in service worker scope.

type Handler = (event: Record<string, unknown>) => void;

function load(clients: Record<string, unknown>) {
  const handlers: Record<string, Handler> = {};
  const self = {
    location: new URL("https://app.test/"),
    registration: { showNotification: vi.fn() },
    clients,
    addEventListener: (type: string, h: Handler) => (handlers[type] = h),
  };
  runInNewContext(readFileSync("public/sw.js", "utf8"), { self, URL });
  return { handlers, self };
}

/** Fires an event and waits for what it passed to waitUntil. */
async function fire(h: Handler, extra: Record<string, unknown> = {}) {
  let done: Promise<unknown> = Promise.resolve();
  h({ ...extra, waitUntil: (p: Promise<unknown>) => (done = p) });
  await done;
}

describe("service worker", () => {
  it("takes control of open pages when it activates", async () => {
    const claim = vi.fn(async () => {});
    const { handlers } = load({ claim });
    await fire(handlers.activate!);
    expect(claim).toHaveBeenCalled();
  });

  it("shows a push as a notification", async () => {
    const { handlers, self } = load({});
    await fire(handlers.push!, {
      data: {
        json: () => ({ title: "Plan tomorrow", body: "b", url: "/plan" }),
      },
    });
    expect(self.registration.showNotification).toHaveBeenCalledWith(
      "Plan tomorrow",
      expect.objectContaining({ body: "b", data: { url: "/plan" } }),
    );
  });

  it("opens the planner when an open window can't be navigated", async () => {
    const openWindow = vi.fn(async () => null);
    const client = {
      url: "https://app.test/today",
      focus: vi.fn(async () => {}),
      navigate: vi.fn(async () => {
        throw new TypeError("not controlled");
      }),
    };
    const { handlers } = load({
      matchAll: async () => [client],
      openWindow,
    });
    await fire(handlers.notificationclick!, {
      notification: { close: vi.fn(), data: { url: "/plan" } },
    });
    expect(client.navigate).toHaveBeenCalledWith("https://app.test/plan");
    expect(openWindow).toHaveBeenCalledWith("https://app.test/plan");
  });
});
