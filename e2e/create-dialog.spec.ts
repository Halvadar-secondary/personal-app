import { expect, test } from "@playwright/test";
import {
  addAchievements,
  createArea,
  isPhone,
  openCapture,
  uniqueName,
} from "./helpers/app";
import { loginWithPassword } from "./helpers/login";

test.beforeEach(async ({ page }) => {
  await loginWithPassword(
    page,
    process.env.E2E_OWNER_EMAIL!,
    process.env.E2E_OWNER_PASSWORD!,
  );
});

/** A fresh area with one achievement; ends on the achievement's page. */
async function onFreshAchievement(page: import("@playwright/test").Page) {
  const area = uniqueName("Dialog");
  await createArea(page, area);
  await addAchievements(page, ["Sweep"]);
  await page
    .getByRole("link", { name: "Sweep", exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByRole("button", { name: "Add task" })).toBeVisible();
  return area;
}

test("C, a title and Ctrl+Enter files a task in the Inbox", async ({
  page,
}, testInfo) => {
  const title = uniqueName("Buy strings");
  await page.goto("/");
  await openCapture(page, testInfo);
  await expect(
    page.getByRole("button", { name: "Destination: Inbox" }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Title" }).fill(title);
  await page.keyboard.press("Control+Enter");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByText("Task created")).toBeVisible();
  await page.goto("/inbox");
  await expect(page.getByText(title)).toBeVisible();
});

test("a task made in the dialog keeps its notes, effort, repeat and category", async ({
  page,
}) => {
  await onFreshAchievement(page);
  const category = uniqueName("Tech");
  await page.getByRole("button", { name: "Add task" }).click();
  const dialog = page.getByRole("dialog", { name: "New task" });
  await expect(
    dialog.getByRole("button", { name: /^Destination: .* › Sweep$/ }),
  ).toBeVisible();
  await dialog
    .getByRole("textbox", { name: "Title" })
    .fill("Three-string sweeps");
  await dialog.getByRole("textbox", { name: "Notes" }).fill("At 70 bpm");
  await dialog.getByRole("button", { name: "Effort: Easy" }).click();
  await page.getByRole("menuitemradio", { name: "Hard" }).click();
  await dialog.getByRole("button", { name: /^Repeat/ }).click();
  await page.getByRole("radio", { name: "Daily" }).check();
  await page.getByRole("button", { name: "Save" }).click();
  await dialog.getByRole("button", { name: "Category" }).click();
  await page.getByLabel("Find or create").fill(category);
  await page.getByRole("button", { name: `Create “${category}”` }).click();
  await page.keyboard.press("Escape");
  await expect(
    dialog.getByRole("button", { name: `Remove ${category}` }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(dialog).toBeHidden();

  const tasks = page.getByRole("region", { name: "Tasks" });
  await page.reload();
  await expect(tasks.getByText("Three-string sweeps")).toBeVisible();
  await expect(
    tasks.getByRole("button", { name: "Effort: Hard" }),
  ).toBeVisible();
  await expect(tasks.getByText(category)).toBeVisible();
  await expect(
    tasks.getByRole("button", { name: /^Repeat: (?!Doesn't repeat)/ }),
  ).toBeVisible();
});

test("Create more adds a run of achievements to a column", async ({
  page,
}, testInfo) => {
  test.skip(isPhone(testInfo), "the board's columns are desktop");
  await createArea(page, uniqueName("Run"));
  await page.getByRole("button", { name: "Add achievement to Active" }).click();
  const dialog = page.getByRole("dialog", { name: "New achievement" });
  await expect(dialog.getByRole("button", { name: /^Status/ })).toHaveText(
    /Active/,
  );
  await dialog.getByRole("switch", { name: "Create more" }).click();
  const title = dialog.getByRole("textbox", { name: "Title" });
  for (const t of ["Alpha", "Bravo", "Charlie"]) {
    await title.fill(t);
    await page.keyboard.press("Control+Enter");
    await expect(dialog.getByRole("status")).toHaveText(`Created “${t}”`);
  }
  await expect(dialog).toBeVisible();
  await expect(title).toBeFocused();
  await page.keyboard.press("Escape");
  const active = page.locator("[data-column=active]");
  for (const t of ["Alpha", "Bravo", "Charlie"]) {
    await expect(active.getByRole("link", { name: t })).toBeVisible();
  }
});

test("undo removes a task with its categories", async ({ page }) => {
  await onFreshAchievement(page);
  const category = uniqueName("Undo");
  await page.getByRole("button", { name: "Add task" }).click();
  const dialog = page.getByRole("dialog", { name: "New task" });
  await dialog.getByRole("textbox", { name: "Title" }).fill("Take it back");
  await dialog.getByRole("button", { name: "Category" }).click();
  await page.getByLabel("Find or create").fill(category);
  await page.getByRole("button", { name: `Create “${category}”` }).click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+Enter");
  await expect(dialog).toBeHidden();
  const tasks = page.getByRole("region", { name: "Tasks" });
  await expect(tasks.getByText("Take it back")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(tasks.getByText("Take it back")).toHaveCount(0);
  await page.reload();
  await expect(tasks.getByText("Take it back")).toHaveCount(0);
});

test("on a phone the dialog fills the screen and Create stays in view", async ({
  page,
}, testInfo) => {
  test.skip(!isPhone(testInfo), "phone layout only");
  await page.goto("/");
  await openCapture(page, testInfo);
  const dialog = page.getByRole("dialog");
  const viewport = page.viewportSize()!;
  const box = (await dialog.boundingBox())!;
  expect(Math.round(box.width)).toBe(viewport.width);
  expect(Math.round(box.height)).toBe(viewport.height);
  await page.getByRole("textbox", { name: "Title" }).fill("On the go");
  await expect(
    page.getByRole("button", { name: "Create task" }),
  ).toBeInViewport();
});
