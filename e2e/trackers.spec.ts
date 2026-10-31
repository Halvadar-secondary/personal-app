import { expect, test } from "@playwright/test";
import { expectNoSideScroll, uniqueName } from "./helpers/app";
import { loginWithPassword } from "./helpers/login";

test.beforeEach(async ({ page }) => {
  await loginWithPassword(
    page,
    process.env.E2E_OWNER_EMAIL!,
    process.env.E2E_OWNER_PASSWORD!,
  );
});

test("log a moment with details from its card, delete and undo", async ({
  page,
}) => {
  const name = uniqueName("Temper");
  const note = uniqueName("traffic");

  await page.goto("/trackers");
  await page.getByRole("button", { name: "New tracker" }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
  await page.getByRole("button", { name: "Add tracker" }).click();
  const card = page.getByRole("region", { name });
  await expect(card.getByText("This week so far: 0")).toBeVisible();

  await card.getByRole("button", { name: `Log ${name} with details` }).click();
  const dialog = page.getByRole("dialog", { name: `Log ${name}` });
  await dialog.getByRole("button", { name: "Intensity 3" }).click();
  await dialog.getByRole("textbox", { name: "Note" }).fill(note);
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

test("log a moment with one tap on Today, then add a note", async ({
  page,
}) => {
  const name = uniqueName("Snap");
  const note = uniqueName("tired");

  await page.goto("/trackers");
  await page.getByRole("button", { name: "New tracker" }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
  await page.getByRole("button", { name: "Add tracker" }).click();
  await expect(page.getByRole("region", { name })).toBeVisible();

  await page.goto("/today");
  const row = page.getByRole("region", { name: "Trackers" });
  await row.getByRole("button", { name: `Log ${name}` }).click();
  await expect(page.getByText(`Logged ${name}`)).toBeVisible();
  await page.getByRole("button", { name: "Add note" }).click();
  const dialog = page.getByRole("dialog", { name: `Note for ${name}` });
  await dialog.getByRole("textbox", { name: "Note" }).fill(note);
  await dialog.getByRole("button", { name: "Save note" }).click();
  await expect(dialog).toBeHidden();
  await expectNoSideScroll(page);

  await page.goto("/trackers");
  const card = page.getByRole("region", { name });
  await expect(card.getByText("This week so far: 1")).toBeVisible();
  await expect(card.getByText(note)).toBeVisible();
});
