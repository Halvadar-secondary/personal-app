import { expect, test } from "@playwright/test";
import {
  addAchievements,
  addTasks,
  createArea,
  expectNoSideScroll,
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

test("a goal links achievements from two areas, and the review plans its tasks", async ({
  page,
}) => {
  const lyrics = uniqueName("Lyrics");
  const arps = uniqueName("Arpeggios");
  const chorus = uniqueName("Chorus");
  const goal = uniqueName("Write a song");

  await createArea(page, uniqueName("Music"));
  await addAchievements(page, [lyrics]);
  await page
    .getByRole("link", { name: lyrics, exact: true })
    .filter({ visible: true })
    .click();
  await addTasks(page, [chorus]);
  await createArea(page, uniqueName("Guitar"));
  await addAchievements(page, [arps]);

  await page.goto("/goals");
  await page.getByRole("button", { name: "New goal" }).click();
  await page.getByLabel("Goal", { exact: true }).fill(goal);
  await page.getByLabel("Deadline").fill("2027-03-15");
  await page.getByRole("button", { name: "Add goal" }).click();
  await page.getByRole("link", { name: new RegExp(goal) }).click();
  await expect(
    page.getByRole("button", { name: new RegExp(`^${goal}, Edit Goal title`) }),
  ).toBeVisible();

  for (const a of [lyrics, arps]) {
    await page.getByRole("button", { name: "Link achievement" }).click();
    await page.getByPlaceholder("Find an achievement…").fill(a);
    await page.getByRole("option", { name: new RegExp(a) }).click();
    await expect(
      page.getByRole("region", { name: "Feeding this goal" }).getByText(a),
    ).toBeVisible();
  }
  // Next keeps the page before a refresh hidden: only the visible copy counts.
  await expect(
    page.getByText("0/2 achievements · 0/1 tasks").filter({ visible: true }),
  ).toBeVisible();

  await page.goto("/review");
  const card = page.getByRole("region", { name: goal });
  await expect(card.getByText(chorus)).toBeVisible();
  await card
    .getByRole("button", { name: `Add ${chorus} to this week` })
    .click();
  await expect(card.getByText("This week")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "This week's list" }).getByText(chorus),
  ).toBeVisible();
  await expectNoSideScroll(page);
});
