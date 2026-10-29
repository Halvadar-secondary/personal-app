import { expect, type Page, test } from "@playwright/test";
import { expectNoSideScroll, uniqueName } from "./helpers/app";
import { loginWithPassword } from "./helpers/login";

test.beforeEach(async ({ page }) => {
  await loginWithPassword(
    page,
    process.env.E2E_OWNER_EMAIL!,
    process.env.E2E_OWNER_PASSWORD!,
  );
});

/** Adds a task to a day's section from its "Add to …" button. */
async function addTo(
  page: Page,
  section: "Work" | "Spare time",
  title: string,
) {
  await page
    .getByRole("region", { name: section })
    .getByRole("button", { name: `Add to ${section}` })
    .click();
  const dialog = page.getByRole("dialog", { name: "New task" });
  await expect(
    dialog.getByRole("button", { name: "Destination: No achievement" }),
  ).toBeVisible();
  await dialog.getByRole("textbox", { name: "Title" }).fill(title);
  await page.keyboard.press("Control+Enter");
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("region", { name: section }).getByText(title),
  ).toBeVisible();
}

test("plan tomorrow: a new task lands in its section, Done planning goes to Today", async ({
  page,
}) => {
  const title = uniqueName("Buy groceries");
  await page.goto("/plan");
  await expect(
    page.getByRole("heading", { name: "Plan tomorrow" }),
  ).toBeVisible();
  await addTo(page, "Spare time", title);
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Spare time" }).getByText(title),
  ).toBeVisible();
  await expectNoSideScroll(page);
  await page.getByRole("button", { name: "Done planning" }).click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
});

test("today: a repeating loose task shows up and can be ticked", async ({
  page,
}) => {
  const title = uniqueName("Gym");
  await page.goto("/today");
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("c");
  const dialog = page.getByRole("dialog", { name: "New task" });
  await dialog.getByRole("textbox", { name: "Title" }).fill(title);
  await dialog.getByRole("button", { name: /^Repeat/ }).click();
  await page.getByRole("radio", { name: "Daily" }).check();
  await page.getByRole("button", { name: "Save" }).click();
  await dialog.getByRole("button", { name: "Create task" }).click();
  await expect(dialog).toBeHidden();
  const spare = page.getByRole("region", { name: "Spare time" });
  await expect(spare.getByText(title)).toBeVisible();
  await spare.getByRole("checkbox", { name: `Complete ${title}` }).click();
  await page.reload();
  await expect(
    spare.getByRole("checkbox", { name: `Complete ${title}` }),
  ).toBeChecked();
});

test("a task moved to the week's list waits on Week, then gets a day", async ({
  page,
}) => {
  const title = uniqueName("Call grandma");
  await page.goto("/today");
  await addTo(page, "Work", title);
  await page.getByRole("button", { name: `Task menu ${title}` }).click();
  await page
    .getByRole("menuitem", { name: "Move to this week's list" })
    .click();
  await expect(
    page.getByRole("region", { name: "Work" }).getByText(title),
  ).toBeHidden();

  await page.goto("/week");
  const list = page.getByRole("region", { name: "This week's list" });
  await expect(list.getByText(title)).toBeVisible();
  await list.getByRole("button", { name: `Give ${title} a day` }).click();
  const day = page.getByRole("menuitem").last();
  const label = (await day.textContent())!.trim();
  await day.click();
  await expect(list.getByText(title)).toBeHidden();
  // From the server, not just the optimistic list.
  await page.reload();
  await expect(
    page.getByRole("region", { name: label }).getByText(title),
  ).toBeVisible();
  await expectNoSideScroll(page);
});
