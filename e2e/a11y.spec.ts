import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import {
  addAchievements,
  addTasks,
  createAchievementInDialog,
  createArea,
  isPhone,
  keyboardDrag,
  saved,
  uniqueName,
} from "./helpers/app";
import { loginWithPassword } from "./helpers/login";

// Spec §8: every page passes an automated axe check (WCAG 2.1 A + AA).
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/** Fails with each violation's rule id and the elements it hit. */
async function expectNoAxeViolations(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  const { violations } = await new AxeBuilder({ page })
    .withTags(TAGS)
    .analyze();
  expect(
    violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target.join(" ")),
    })),
  ).toEqual([]);
}

const login = (page: Page) =>
  loginWithPassword(
    page,
    process.env.E2E_OWNER_EMAIL!,
    process.env.E2E_OWNER_PASSWORD!,
  );

/** A fresh area with one achievement; returns both pages' URLs. */
async function freshGoal(page: Page) {
  const title = uniqueName("Scan me");
  await createArea(page, uniqueName("A11y"));
  const area = page.url();
  await addAchievements(page, [title]);
  await page
    .getByRole("link", { name: title, exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByRole("button", { name: "Add task" })).toBeVisible();
  return { area, achievement: page.url() };
}

test("login page has no axe violations", async ({ page }) => {
  await page.goto("/login");
  await expectNoAxeViolations(page);
});

test.describe("signed in", () => {
  test.beforeEach(({ page }) => login(page));

  for (const path of [
    "/",
    "/today",
    "/plan",
    "/week",
    "/goals",
    "/review",
    "/inbox",
    "/active",
    "/search?q=a",
    "/history",
    "/settings",
  ]) {
    test(`${path} has no axe violations`, async ({ page }) => {
      await page.goto(path);
      await expectNoAxeViolations(page);
    });
  }

  test("area and achievement pages have no axe violations", async ({
    page,
  }) => {
    const { area, achievement } = await freshGoal(page);
    await addTasks(page, ["First step"]);
    await expectNoAxeViolations(page);
    await page.goto(area);
    await expectNoAxeViolations(page);
    expect(achievement).toContain("/achievements/");
  });

  test("create dialog has no axe violations", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page
      .getByRole("button", { name: "Capture" })
      .filter({ visible: true })
      .first()
      .click();
    await expect(page.getByRole("dialog", { name: "New task" })).toBeVisible();
    await expectNoAxeViolations(page);
    await page
      .getByRole("group", { name: "Kind" })
      .getByRole("button", { name: "Achievement" })
      .click();
    await expect(
      page.getByRole("dialog", { name: "New achievement" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("command palette has no axe violations", async ({ page }, testInfo) => {
    test.skip(isPhone(testInfo), "keyboard shortcut is for desktop");
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Your areas" }),
    ).toBeVisible();
    const input = page.getByPlaceholder("Jump to…");
    await expect(async () => {
      if (!(await input.isVisible())) await page.keyboard.press("Control+k");
      await expect(input).toBeVisible({ timeout: 1000 });
    }).toPass();
    await expectNoAxeViolations(page);
  });

  test("tasks reorder by keyboard", async ({ page }) => {
    await freshGoal(page);
    await addTasks(page, ["One", "Two"]);
    await expect(
      page.getByRole("button", { name: "Edit Task title" }),
    ).toHaveCount(2);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Reorder Two" }).focus();
    await saved(page, () => keyboardDrag(page, ["ArrowUp"]));

    const order = () =>
      page
        .getByRole("region", { name: "Tasks" })
        .getByRole("checkbox")
        .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
    await expect.poll(order).toEqual(["Complete Two", "Complete One"]);
    await page.reload();
    await expect.poll(order).toEqual(["Complete Two", "Complete One"]);
  });

  test("inbox files by keyboard", async ({ page }) => {
    const area = uniqueName("Keyed");
    await createArea(page, area);
    const title = uniqueName("Keyboard goal");
    await page.goto("/inbox");
    await page.waitForLoadState("networkidle");
    await page
      .getByRole("button", { name: "Capture" })
      .filter({ visible: true })
      .first()
      .click();
    await createAchievementInDialog(page, title);
    await expect(page.getByText(title)).toBeVisible();

    // Drag has a keyboard twin on every device: the File to… menu.
    await page.getByRole("button", { name: `File to… ${title}` }).focus();
    await page.keyboard.press("Enter");
    const target = page.getByRole("menuitem", { name: new RegExp(area) });
    await expect(target).toBeVisible();
    await target.focus();
    await saved(page, () => page.keyboard.press("Enter"));
    await expect(page.getByText(title)).toHaveCount(0);
  });
});

// Dark mode follows the system setting; it must pass the same checks.
test.describe("dark", () => {
  test.use({ colorScheme: "dark" });

  test("dark mode applies", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      "rgb(22, 19, 31)",
    );
  });

  test("login page has no axe violations in dark mode", async ({ page }) => {
    await page.goto("/login");
    await expectNoAxeViolations(page);
  });

  test.describe("signed in", () => {
    test.beforeEach(({ page }) => login(page));

    for (const path of [
      "/",
      "/today",
      "/plan",
      "/week",
      "/goals",
      "/review",
      "/inbox",
      "/active",
      "/search?q=a",
      "/history",
      "/settings",
    ]) {
      test(`${path} has no axe violations in dark mode`, async ({ page }) => {
        await page.goto(path);
        await expectNoAxeViolations(page);
      });
    }

    test("area, achievement and capture have no axe violations in dark mode", async ({
      page,
    }) => {
      const { area } = await freshGoal(page);
      await addTasks(page, ["First step"]);
      await expectNoAxeViolations(page);
      await page.goto(area);
      await expectNoAxeViolations(page);
      await page
        .getByRole("button", { name: "Capture" })
        .filter({ visible: true })
        .first()
        .click();
      await expect(
        page.getByRole("dialog", { name: "New achievement" }),
      ).toBeVisible();
      await expectNoAxeViolations(page);
    });
  });
});
