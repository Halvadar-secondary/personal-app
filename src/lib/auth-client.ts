import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // Calls only ever run in the browser, against its own origin. On the server
  // (static shells render the account menu) a fixed base keeps the client
  // from reading the build's placeholder BETTER_AUTH_URL.
  baseURL: typeof window === "undefined" ? "http://localhost" : undefined,
  // oauthProviderClient: sign-in carries on into a pending AI-app authorization.
  plugins: [passkeyClient(), oauthProviderClient()],
});
