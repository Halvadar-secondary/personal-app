import { expect, test } from "@playwright/test";
import { isPhone, uniqueName } from "./helpers/app";
import { loginWithPassword } from "./helpers/login";

test("owner adds, renames and removes a passkey in Settings", async ({
  page,
}, testInfo) => {
  test.skip(isPhone(testInfo), "the virtual authenticator is Chromium desktop");
  // A software authenticator that says yes, like Windows Hello would.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  });

  await loginWithPassword(
    page,
    process.env.E2E_OWNER_EMAIL!,
    process.env.E2E_OWNER_PASSWORD!,
  );
  await page.goto("/settings");
  const rows = page.getByTestId("passkey-row");
  await page
    .getByText(/No passkeys yet|Added /)
    .first()
    .waitFor();
  const before = await rows.count();

  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(rows).toHaveCount(before + 1);

  const name = uniqueName("E2E key");
  const added = rows.last();
  await added.getByRole("button", { name: "Rename" }).click();
  await added.getByRole("textbox", { name: "Passkey name" }).fill(name);
  await added.getByRole("textbox", { name: "Passkey name" }).press("Enter");
  const mine = rows.filter({ hasText: name });
  await expect(mine).toHaveCount(1);

  await mine.getByRole("button", { name: "Remove" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(mine).toHaveCount(0);
  await expect(rows).toHaveCount(before);
});
