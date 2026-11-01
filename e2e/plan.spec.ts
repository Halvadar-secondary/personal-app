import { expect, type Page, test } from "@playwright/test";
import {
  chooseKind,
  expectNoSideScroll,
  isPhone,
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

/** Adds a task to a day's section: Add task, then Work or Spare time. */
async function addTo(
  page: Page,
  section: "Work" | "Spare time",
  title: string,
) {
  await page.getByRole("button", { name: "Add task" }).click();
  const dialog = page.getByRole("dialog", { name: "New task" });
  await dialog
    .getByRole("radiogroup", { name: "Section" })
    .getByRole("radio", { name: section })
    .click();
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
  await chooseKind(page, "Task");
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
  // The move is saved before leaving, not just shown.
  await page.waitForLoadState("networkidle");

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

test("on a phone the day switcher is centred and Done planning ends the page", async ({
  page,
}, testInfo) => {
  test.skip(!isPhone(testInfo), "phone layout only");
  await page.goto("/plan");
  const prev = (await page
    .getByRole("link", { name: "Previous day" })
    .boundingBox())!;
  const next = (await page
    .getByRole("link", { name: "Next day" })
    .boundingBox())!;
  const width = page.viewportSize()!.width;
  // Centred: as much room left of Previous as right of Next.
  expect(
    Math.abs(prev.x - (width - (next.x + next.width))),
  ).toBeLessThanOrEqual(2);
  // One Done planning, full width, after the day's list and the pick list.
  const done = page.getByRole("button", { name: "Done planning" });
  await expect(done).toHaveCount(1);
  const box = (await done.boundingBox())!;
  const add = (await page
    .getByRole("button", { name: "Add task" })
    .boundingBox())!;
  expect(box.y).toBeGreaterThan(add.y + add.height);
  expect(box.width).toBeGreaterThan(width - 40);
});

test("on a phone the week switcher is centred", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "phone layout only");
  await page.goto("/week");
  const prev = (await page
    .getByRole("link", { name: "Previous week" })
    .boundingBox())!;
  const next = (await page
    .getByRole("link", { name: "Next week" })
    .boundingBox())!;
  const width = page.viewportSize()!.width;
  expect(
    Math.abs(prev.x - (width - (next.x + next.width))),
  ).toBeLessThanOrEqual(2);
  await expectNoSideScroll(page);
});
