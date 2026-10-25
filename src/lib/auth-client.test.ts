import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

// Builds prerender the sidebar's static shell, which imports the client, with
// a placeholder BETTER_AUTH_URL; the client only ever calls from the browser.
it("loads on the server even when BETTER_AUTH_URL is a placeholder", async () => {
  vi.stubEnv("BETTER_AUTH_URL", "build-time-placeholder");
  await expect(import("./auth-client")).resolves.toHaveProperty("authClient");
});
