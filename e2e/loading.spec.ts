import { expect, test } from "@playwright/test";
import { openWithoutScripts } from "./helpers/no-script";

// Loading states: with scripts off, pages stay as their static shell plus
// Suspense fallbacks, which is what a slow load shows.

test("navigation shows while the page loads", async ({ browser }, testInfo) => {
  const page = await openWithoutScripts(browser, testInfo, "/");
  if (testInfo.project.name === "phone") {
    const tabs = page.getByRole("navigation", { name: "Tabs" });
    for (const name of ["Areas", "Active", "Search", "Settings"])
      await expect(tabs.getByRole("link", { name })).toBeVisible();
  } else {
    const main = page.getByRole("navigation", { name: "Main" });
    for (const name of ["Your areas", "Active", "Search", "Inbox"])
      await expect(main.getByRole("link", { name })).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
    await expect(page.getByRole("link", { name: "History" })).toBeVisible();
  }
});
