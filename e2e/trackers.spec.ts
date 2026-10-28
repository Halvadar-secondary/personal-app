import { expect, test } from "@playwright/test";
import { expectNoSideScroll, openCapture, uniqueName } from "./helpers/app";
import { loginWithPassword } from "./helpers/login";

test.beforeEach(async ({ page }) => {
  await loginWithPassword(
    page,
    process.env.E2E_OWNER_EMAIL!,
    process.env.E2E_OWNER_PASSWORD!,
  );
});

test("log a moment from Capture, see it on the tracker, delete and undo", async ({
  page,
}, testInfo) => {
  const name = uniqueName("Temper");
  const note = uniqueName("traffic");

  await page.goto("/trackers");
  await page.getByRole("button", { name: "New tracker" }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
  await page.getByRole("button", { name: "Add tracker" }).click();
  const card = page.getByRole("region", { name });
  await expect(card.getByText("This week so far: 0")).toBeVisible();

  await openCapture(page, testInfo);
  await page
    .getByRole("group", { name: "Kind" })
    .getByRole("button", { name: "Moment" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Log a moment" });
  await dialog.getByRole("radio", { name }).click();
  await dialog.getByRole("button", { name: "Intensity 3" }).click();
  await dialog.getByRole("textbox", { name: "Notes" }).fill(note);
  await dialog.getByRole("button", { name: "Log moment" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(`Logged ${name}`)).toBeVisible();

  await page.reload();
  await expect(card.getByText("This week so far: 1")).toBeVisible();
  await expect(card.getByText(note)).toBeVisible();
  await expectNoSideScroll(page);

  await card.getByRole("button", { name: "Delete moment" }).first().click();
  await page.getByRole("button", { name: "Undo" }).click();
  await page.reload();
  await expect(card.getByText(note)).toBeVisible();

  // The review shows the tracker's patterns (server-rendered).
  await page.goto("/review");
  await expect(page.getByRole("region", { name: "Patterns" })).toBeVisible();
});
