import { expect, test } from "@playwright/test";
import {
  addAchievements,
  createArea,
  isPhone,
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

test("undo a change from History", async ({ page }) => {
  const name = uniqueName("Undoable");
  await createArea(page, name);
  await page.goto("/history");
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  // Other tests run alongside: find this test's row by its unique name.
  const row = page
    .getByRole("listitem")
    .filter({ hasText: `Created area “${name}”` });
  await expect(row).toContainText("You");
  await saved(page, () => row.getByRole("button", { name: "Undo" }).click());
  await expect(page.getByText("Undone").first()).toBeVisible();
  await expect(row.getByText("Undone")).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your areas" })).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("link", { name: new RegExp(name) }),
  ).toHaveCount(0);
});

test("search finds an achievement and opens it", async ({ page }) => {
  const title = uniqueName("Needle");
  await createArea(page, uniqueName("Haystack"));
  await addAchievements(page, [title]);
  await page.goto("/search");
  await page.getByRole("searchbox", { name: "Search" }).fill(title);
  const hit = page.getByRole("link", { name: new RegExp(title) });
  await expect(hit).toBeVisible();
  await hit.click();
  await expect(
    page.getByRole("button", { name: "Edit Achievement title" }),
  ).toHaveText(title);
});

test("Ctrl+K jumps to an area", async ({ page }, testInfo) => {
  test.skip(isPhone(testInfo), "keyboard shortcut is for desktop");
  const name = uniqueName("Jumpto");
  await createArea(page, name);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your areas" })).toBeVisible();
  // The heading renders before the page hydrates; a press that lands
  // earlier has no listener yet, so press until the palette is there.
  const input = page.getByPlaceholder("Jump to…");
  await expect(async () => {
    if (!(await input.isVisible())) await page.keyboard.press("Control+k");
    await expect(input).toBeVisible({ timeout: 1000 });
  }).toPass();
  await input.fill(name);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name })).toBeVisible();
});

test("export downloads my data", async ({ page }) => {
  const name = uniqueName("Exported");
  await createArea(page, name);
  const res = await page.request.get("/api/export");
  expect(res.status()).toBe(200);
  expect(res.headers()["content-disposition"]).toContain("attachment");
  const data = (await res.json()) as { areas: { name: string }[] };
  expect(data.areas.map((a) => a.name)).toContain(name);
});
