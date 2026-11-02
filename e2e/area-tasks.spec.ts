import { expect, test } from "@playwright/test";
import { createArea, expectNoSideScroll, uniqueName } from "./helpers/app";
import { loginWithPassword } from "./helpers/login";

test.beforeEach(async ({ page }) => {
  await loginWithPassword(
    page,
    process.env.E2E_OWNER_EMAIL!,
    process.env.E2E_OWNER_PASSWORD!,
  );
});

test("a task straight in an area: add it there, give it notes with a link, tick it off", async ({
  page,
}) => {
  const area = uniqueName("Music");
  const song = uniqueName("Learn Wonderwall");
  await createArea(page, area);

  const tasks = page.getByRole("region", { name: "Tasks" });
  await tasks.getByRole("button", { name: "Add task" }).click();
  const dialog = page.getByRole("dialog", { name: "New task" });
  // On an area page a task goes straight into the area.
  await expect(
    dialog.getByRole("button", { name: `Destination: ${area}` }),
  ).toBeVisible();
  await dialog.getByRole("textbox", { name: "Title" }).fill(song);
  await page.keyboard.press("Control+Enter");
  await expect(dialog).toBeHidden();
  await expect(tasks.getByText(song)).toBeVisible();

  await tasks.getByRole("button", { name: `Task menu ${song}` }).click();
  await page.getByRole("menuitem", { name: "Add notes" }).click();
  await tasks
    .getByRole("textbox", { name: "Notes" })
    .fill("Capo 2. Tab: https://tabs.example.com/wonderwall");
  await tasks.getByRole("button", { name: "Save notes" }).click();
  const link = tasks.getByRole("link", {
    name: "https://tabs.example.com/wonderwall",
  });
  await expect(link).toBeVisible();

  // Saved, not just shown.
  await page.waitForLoadState("networkidle");
  await page.reload();
  await expect(link).toHaveAttribute("target", "_blank");
  await tasks.getByRole("checkbox", { name: `Complete ${song}` }).click();
  await expect(
    tasks.getByRole("checkbox", { name: `Complete ${song}` }),
  ).toBeChecked();
  await expectNoSideScroll(page);

  // Filed, so not in the Inbox.
  await page.goto("/inbox");
  await expect(page.getByText(song)).toHaveCount(0);
});
