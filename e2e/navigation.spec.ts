import { expect, type Page, test } from "@playwright/test";
import { loginWithPassword } from "./helpers/login";

// A cold start: the server takes seconds to answer. A tap on a link must
// still show at once that it's on its way.

test.beforeEach(async ({ page }) => {
  await loginWithPassword(
    page,
    process.env.E2E_OWNER_EMAIL!,
    process.env.E2E_OWNER_PASSWORD!,
  );
});

/** Holds back everything for /trackers except prefetches. */
async function slowTrackers(page: Page) {
  await page.route("**/trackers**", async (route) => {
    if (!route.request().headers()["next-router-prefetch"])
      await new Promise((r) => setTimeout(r, 4_000));
    await route.continue();
  });
}

const trackersLink = (page: Page) =>
  page
    .getByRole("link", { name: "Trackers", exact: true })
    .filter({ visible: true })
    .first();

const heading = (page: Page) =>
  page.getByRole("heading", { name: "Trackers", exact: true });

test("once the app is ready, a tap shows the next page's skeleton at once", async ({
  page,
}) => {
  await slowTrackers(page);
  await page.goto("/today");
  await page.waitForLoadState("networkidle");
  await trackersLink(page).click();
  // The prefetched shell: the URL and the skeleton, before the server answers.
  await expect(page).toHaveURL(/\/trackers$/, { timeout: 1_000 });
  await expect(page.getByTestId("skeleton-trackers")).toBeVisible({
    timeout: 1_000,
  });
  await expect(heading(page)).toBeVisible({ timeout: 15_000 });
});

test("before the app is ready, a tap shows the loading bar at once", async ({
  page,
}) => {
  // The app's scripts held back until the tap has been checked (a fixed delay
  // can run out first while the page itself is slow): the tap is a plain page
  // load, which a Home Screen app shows no browser loading bar for. Only the
  // scripts: the page's stylesheets must load for it to finish parsing.
  let ready!: () => void;
  const tapped = new Promise<void>((r) => (ready = r));
  const script = (url: URL) =>
    url.pathname.startsWith("/_next/static/chunks/") &&
    url.pathname.endsWith(".js");
  await page.route(script, async (route) => {
    await tapped;
    await route.continue();
  });
  await slowTrackers(page);
  await page.goto("/today", { waitUntil: "domcontentloaded" });
  const bar = page.locator("[data-slot=nav-progress]");
  await expect(bar).toHaveCSS("opacity", "0");
  await trackersLink(page).click({ noWaitAfter: true });
  await expect(bar).toHaveCSS("opacity", "1", { timeout: 1_000 });
  ready();
  await expect(heading(page)).toBeVisible({ timeout: 20_000 });
});
