import { expect, type Page, type TestInfo } from "@playwright/test";

/** The database is shared within a run and may hold seed data. */
export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function isPhone(testInfo: TestInfo): boolean {
  return testInfo.project.name === "phone";
}

export async function expectNoSideScroll(page: Page): Promise<void> {
  const [scroll, client] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    document.documentElement.clientWidth,
  ]);
  expect(scroll, "page scrolls sideways").toBeLessThanOrEqual(client);
}

/** Creates an area from the overview and waits on its page. */
export async function createArea(page: Page, name: string): Promise<void> {
  await page.goto("/");
  await page
    .getByRole("button", { name: "New area" })
    .filter({ visible: true })
    .click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create area" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

/** Adds achievements through the visible "Add achievement" field. */
export async function addAchievements(
  page: Page,
  titles: string[],
): Promise<void> {
  const field = page
    .getByLabel("Add achievement")
    .filter({ visible: true })
    .first();
  for (const title of titles) {
    await field.fill(title);
    await field.press("Enter");
    await expect(
      page
        .getByRole("link", { name: title, exact: true })
        .filter({ visible: true }),
    ).toBeVisible();
  }
}

/**
 * dnd-kit measures between key presses; pressing faster than a frame or two
 * drops the card before it has a target.
 */
export async function keyboardDrag(page: Page, keys: string[]): Promise<void> {
  for (const key of ["Space", ...keys, "Space"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
  }
}

/**
 * Runs `act` and waits for the Server Action it sends to answer. Use it
 * before a reload or navigation that must see the change: the optimistic UI
 * shows it at once, and `waitForLoadState("networkidle")` returns at once
 * after the page's first idle, so neither proves the save landed.
 */
export async function saved(
  page: Page,
  act: () => Promise<unknown>,
): Promise<void> {
  const answered = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      r.request().headers()["next-action"] !== undefined,
  );
  await act();
  await answered;
}
