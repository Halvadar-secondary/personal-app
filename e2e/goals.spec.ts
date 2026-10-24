import { expect, test } from "@playwright/test";
import {
  addAchievements,
  createArea,
  expectNoSideScroll,
  isPhone,
  keyboardDrag,
  saved,
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

test("create an area and see it on the overview", async ({ page }) => {
  const name = uniqueName("Guitar");
  await createArea(page, name);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your areas" })).toBeVisible();
  await expect(
    page
      .getByRole("main")
      .getByRole("link", { name: new RegExp(name) })
      .filter({ visible: true }),
  ).toBeVisible();
});

test("capture to the Inbox, then file it into an area", async ({
  page,
}, testInfo) => {
  const area = uniqueName("Flute");
  const title = uniqueName("Learn a jig");
  await createArea(page, area);
  await page.goto("/inbox");
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  await page.waitForLoadState("networkidle");

  if (isPhone(testInfo)) {
    await page.getByRole("button", { name: "Capture" }).click();
  } else {
    await page.keyboard.press("c");
  }
  await expect(page.getByRole("dialog", { name: "Capture" })).toBeVisible();
  await expect(page.getByText("→ Inbox")).toBeVisible();
  const field = page.getByRole("textbox", { name: "Capture text" });
  await field.fill(`!${title}`);
  await field.press("Enter");
  await expect(page.getByText("Saved")).toBeVisible();
  await expect(field).toHaveValue("");
  await page.keyboard.press("Escape");

  await expect(page.getByRole("link", { name: title })).toBeVisible();
  await page.getByRole("button", { name: `File to… ${title}` }).click();
  await page.getByRole("menuitem", { name: area }).click();
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);

  await page.goto("/");
  await page
    .getByRole("main")
    .getByRole("link", { name: new RegExp(area) })
    .filter({ visible: true })
    .click();
  await expect(page.getByRole("heading", { name: area })).toBeVisible();
  await expect(
    page.getByRole("link", { name: title }).filter({ visible: true }),
  ).toBeVisible();
});

test("add achievements and move one Backlog → Active", async ({
  page,
}, testInfo) => {
  await createArea(page, uniqueName("Board"));
  await addAchievements(page, ["Alpha", "Bravo", "Charlie"]);
  await page.reload();
  await page.waitForLoadState("networkidle");

  if (isPhone(testInfo)) {
    await page.getByRole("button", { name: "Move to… Bravo" }).click();
    await saved(page, () =>
      page.getByRole("menuitem", { name: "Active" }).click(),
    );
    await expect(
      page.getByRole("heading", { name: "Active · 1" }),
    ).toBeVisible();
  } else {
    await page.getByRole("button", { name: "Move Bravo" }).focus();
    await saved(page, () => keyboardDrag(page, ["ArrowRight"]));
    await expect(
      page.locator('[data-column="active"]').getByText("Bravo"),
    ).toBeVisible();
  }

  // The move was saved, not just shown.
  await page.reload();
  if (isPhone(testInfo)) {
    await expect(
      page.getByRole("heading", { name: "Active · 1" }),
    ).toBeVisible();
  } else {
    await expect(
      page.locator('[data-column="active"]').getByText("Bravo"),
    ).toBeVisible();
  }
});

test("add tasks, complete one, set effort and a category", async ({ page }) => {
  const area = uniqueName("Tasks");
  const category = uniqueName("Theory");
  await createArea(page, area);
  await addAchievements(page, ["Sweep picking"]);
  await page
    .getByRole("link", { name: "Sweep picking" })
    .filter({ visible: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit Achievement title" }),
  ).toBeVisible();

  const add = page.getByLabel("Add task");
  for (const t of ["One", "Two", "Three"]) {
    await add.fill(t);
    await add.press("Enter");
  }
  await expect(
    page.getByRole("button", { name: "Edit Task title" }),
  ).toHaveCount(3);
  await expect(add).toBeFocused();
  await page.waitForLoadState("networkidle");

  await page.getByRole("checkbox", { name: "Complete One" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Complete One" }),
  ).toBeChecked();

  await page.getByRole("button", { name: "Effort: Easy" }).nth(1).click();
  await page.getByRole("menuitemradio", { name: "Hard" }).click();
  await expect(
    page.getByRole("button", { name: "Effort: Hard" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Categories" }).first().click();
  await page.getByLabel("Find or create").fill(category);
  await page.getByRole("button", { name: `Create “${category}”` }).click();
  await page.keyboard.press("Escape");
  const tasks = page.getByRole("region", { name: "Tasks" });
  await expect(tasks.getByText(category)).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "Complete One" }),
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Effort: Hard" }),
  ).toBeVisible();
  await expect(tasks.getByText(category)).toBeVisible();

  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link")
    .click();
  await expect(page.getByRole("heading", { name: area })).toBeVisible();
  await expect(
    page.getByText("1/3 tasks").filter({ visible: true }),
  ).toBeVisible();
});

test("delete a task and undo it from the toast", async ({ page }) => {
  await createArea(page, uniqueName("Undo"));
  await addAchievements(page, ["Practice"]);
  await page
    .getByRole("link", { name: "Practice", exact: true })
    .filter({ visible: true })
    .click();
  const add = page.getByLabel("Add task");
  await add.fill("Keep me");
  await add.press("Enter");
  await expect(
    page.getByRole("button", { name: "Edit Task title" }),
  ).toHaveCount(1);
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Task menu Keep me" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(
    page.getByRole("button", { name: "Edit Task title" }),
  ).toHaveCount(0);
  await expect(page.getByText("Deleted")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(
    page.getByRole("button", { name: "Edit Task title" }),
  ).toHaveCount(1);

  await page.reload();
  await expect(
    page.getByRole("button", { name: "Edit Task title" }),
  ).toHaveCount(1);
});

test("a deleted achievement's page is not found", async ({ page }) => {
  const area = uniqueName("Gone");
  await createArea(page, area);
  await addAchievements(page, ["Doomed"]);
  await page
    .getByRole("link", { name: "Doomed" })
    .filter({ visible: true })
    .click();
  await page.waitForURL(/\/achievements\//);
  const url = page.url();
  await page.waitForLoadState("networkidle");

  // Deleting the page you're on goes to its area without a not-found flash.
  await page.evaluate(() => {
    const w = window as unknown as { sawNotFound: boolean };
    w.sawNotFound = false;
    new MutationObserver(() => {
      if (document.body.innerText.includes("could not be found")) {
        w.sawNotFound = true;
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  await page.getByRole("button", { name: "Achievement menu" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("heading", { name: area })).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { sawNotFound: boolean }).sawNotFound,
    ),
  ).toBe(false);

  // The page shell has streamed by the time the read fails, so Next keeps
  // the 200 and renders the not-found UI with noindex. What matters: no 500,
  // and a way back inside the app.
  for (const path of [url, "/areas/not-an-id"]) {
    const res = await page.goto(path);
    expect(res?.status()).toBeLessThan(500);
    await expect(page.getByText("That page doesn't exist")).toBeVisible();
    await page.getByRole("link", { name: "Back to your areas" }).click();
    await expect(
      page.getByRole("heading", { name: "Your areas" }),
    ).toBeVisible();
  }
});

test("no page scrolls sideways on a phone", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "phone layout only");
  await createArea(
    page,
    uniqueName("A rather long area name for narrow screens"),
  );
  await addAchievements(page, [
    "An achievement with a long title that has to wrap on a phone screen",
  ]);
  await expectNoSideScroll(page);
  await page
    .getByRole("link", { name: /An achievement with a long title/ })
    .filter({ visible: true })
    .click();
  await expect(page.getByLabel("Add task")).toBeVisible();
  await expectNoSideScroll(page);
  for (const path of [
    "/",
    "/inbox",
    "/active",
    "/settings",
    "/search",
    "/history",
  ]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expectNoSideScroll(page);
  }
});
