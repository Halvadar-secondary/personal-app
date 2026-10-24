import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // oauthProviderClient: sign-in carries on into a pending AI-app authorization.
  plugins: [passkeyClient(), oauthProviderClient()],
});
