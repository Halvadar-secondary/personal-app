import { describe, expect, it } from "vitest";
import { clientOrigin } from "./client-origin";

describe("clientOrigin", () => {
  it("vouches for a CIMD client by its client id's host", () => {
    expect(
      clientOrigin({
        clientId: "https://claude.ai/oauth/mcp-client-metadata.json",
        redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
      }),
    ).toEqual({ verified: true, host: "claude.ai" });
  });

  it("names a self-registered client's redirect hosts, unverified", () => {
    expect(
      clientOrigin({
        clientId: "aBc123",
        redirectUris: [
          "https://evil.example/cb",
          "https://evil.example/other",
          "http://127.0.0.1:6274/oauth/callback",
        ],
      }),
    ).toEqual({ verified: false, host: "evil.example, 127.0.0.1:6274" });
  });

  it("copes with unparseable redirects", () => {
    expect(
      clientOrigin({ clientId: "x", redirectUris: ["not a url"] }),
    ).toEqual({ verified: false, host: "an unknown address" });
  });
});
