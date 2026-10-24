import { expect, test } from "@playwright/test";
import { addAchievements, createArea, saved, uniqueName } from "./helpers/app";
import { loginWithPassword } from "./helpers/login";

test.beforeEach(async ({ page }) => {
  await loginWithPassword(
    page,
    process.env.E2E_OWNER_EMAIL!,
    process.env.E2E_OWNER_PASSWORD!,
  );
});

test("completing a task grows the area's level and streak", async ({
  page,
}) => {
  const area = uniqueName("Level");
  await createArea(page, area);
  await addAchievements(page, ["Sweep"]);
  await page
    .getByRole("link", { name: "Sweep" })
    .filter({ visible: true })
    .click();
  const add = page.getByLabel("Add task");
  await add.fill("Big one");
  await add.press("Enter");
  await expect(
    page.getByRole("button", { name: "Edit Task title" }),
  ).toHaveCount(1);

  await page.getByRole("button", { name: "Effort: Easy" }).click();
  await saved(page, () =>
    page.getByRole("menuitemradio", { name: "Brutal" }).click(),
  );
  await expect(
    page.getByRole("button", { name: "Effort: Brutal" }),
  ).toBeVisible();
  await saved(page, () =>
    page.getByRole("checkbox", { name: "Complete Big one" }).click(),
  );
  await expect(
    page.getByRole("checkbox", { name: "Complete Big one" }),
  ).toBeChecked();

  // 200 XP: level 2 starts at 100, level 3 at 300.
  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link")
    .click();
  await expect(page.getByRole("heading", { name: area })).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByLabel("Level 2", { exact: true })
      .filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("progressbar", { name: "XP toward level 3" })
      .filter({ visible: true }),
  ).toBeVisible();

  await page.goto("/");
  const card = page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(area) })
    .filter({ visible: true });
  await expect(card).toContainText("LV 2");
  await expect(card.getByLabel("1-day streak", { exact: true })).toBeVisible();
});

test("a daily task is checked off for today and shows on Active", async ({
  page,
}) => {
  const title = uniqueName("Scales");
  await createArea(page, uniqueName("Habits"));
  await addAchievements(page, ["Daily scales"]);
  await page
    .getByRole("link", { name: "Daily scales" })
    .filter({ visible: true })
    .click();
  await page.getByRole("combobox", { name: "Status" }).click();
  await saved(page, () => page.getByRole("option", { name: "Active" }).click());

  const add = page.getByLabel("Add task");
  await add.fill(title);
  await add.press("Enter");
  await expect(
    page.getByRole("button", { name: "Edit Task title" }),
  ).toHaveCount(1);

  await page.getByRole("button", { name: "Repeat: Doesn't repeat" }).click();
  await page.getByRole("radio", { name: "Daily" }).check();
  await page.getByRole("radio", { name: "Forever" }).check();
  await saved(page, () => page.getByRole("button", { name: "Save" }).click());
  await expect(
    page.getByRole("button", { name: "Repeat: Daily" }),
  ).toBeVisible();

  const tick = page.getByRole("checkbox", {
    name: `Complete ${title} for today`,
  });
  await saved(page, () => tick.click());
  await expect(tick).toBeChecked();
  await page.reload();
  await expect(tick).toBeChecked();

  await page.goto("/active");
  const today = page.getByRole("region", { name: "Today" });
  const onActive = today.getByRole("checkbox", {
    name: `Complete ${title} for today`,
  });
  await expect(onActive).toBeChecked();
  await saved(page, () => onActive.click());
  await expect(onActive).not.toBeChecked();
  await page.reload();
  await expect(onActive).not.toBeChecked();
});
