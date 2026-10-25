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

/**
 * Types each title into the open create dialog with "Create more" on (so no
 * toasts pile up), then turns it back off and closes the dialog.
 */
export async function fillCreateDialog(
  page: Page,
  titles: string[],
): Promise<void> {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const more = dialog.getByRole("switch", { name: "Create more" });
  await expect(more).toHaveAttribute("aria-checked", "false");
  await more.click();
  const title = dialog.getByRole("textbox", { name: "Title" });
  for (const t of titles) {
    await title.fill(t);
    await title.press("Enter");
    await expect(dialog.getByRole("status")).toHaveText(`Created “${t}”`);
  }
  await more.click();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
}

/** Adds achievements through the visible "Add achievement" button. */
export async function addAchievements(
  page: Page,
  titles: string[],
): Promise<void> {
  await page
    .getByRole("button", { name: /^Add achievement/ })
    .filter({ visible: true })
    .first()
    .click();
  await fillCreateDialog(page, titles);
  for (const title of titles) {
    await expect(
      page
        .getByRole("link", { name: title, exact: true })
        .filter({ visible: true }),
    ).toBeVisible();
  }
}

/** Adds tasks on the open achievement page through "Add task". */
export async function addTasks(page: Page, titles: string[]): Promise<void> {
  await page.getByRole("button", { name: "Add task" }).click();
  await fillCreateDialog(page, titles);
  const list = page.getByRole("region", { name: "Tasks" });
  for (const title of titles) {
    await expect(list.getByText(title, { exact: true })).toBeVisible();
  }
}

/** Opens the create dialog the way each device does: C, or the Capture button. */
export async function openCapture(
  page: Page,
  testInfo: TestInfo,
): Promise<void> {
  await page.waitForLoadState("networkidle");
  if (isPhone(testInfo)) {
    await page
      .getByRole("button", { name: "Capture" })
      .filter({ visible: true })
      .first()
      .click();
  } else {
    await page.keyboard.press("c");
  }
  await expect(page.getByRole("dialog")).toBeVisible();
}

/** In the open dialog: switch to Achievement, type the title, Ctrl+Enter. */
export async function createAchievementInDialog(
  page: Page,
  title: string,
): Promise<void> {
  await page
    .getByRole("group", { name: "Kind" })
    .getByRole("button", { name: "Achievement" })
    .click();
  await page.getByRole("textbox", { name: "Title" }).fill(title);
  await page.keyboard.press("Control+Enter");
  await expect(page.getByRole("dialog")).toBeHidden();
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
