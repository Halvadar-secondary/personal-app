import type { Page } from "@playwright/test";

export async function loginWithPassword(
  page: Page,
  email: string,
  password: string,
) {
  await page.goto("/login");
  await page.getByTestId("password-email").fill(email);
  await page.getByTestId("password-password").fill(password);
  await page.getByTestId("password-submit").click();
  await page.waitForURL((url) => url.pathname !== "/login");
}
