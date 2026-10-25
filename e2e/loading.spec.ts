import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { addAchievements, createArea, uniqueName } from "./helpers/app";
import { loginWithPassword } from "./helpers/login";
import { openWithoutScripts } from "./helpers/no-script";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function expectNoAxeViolations(page: Page): Promise<void> {
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

// One area with one achievement, for the pages that need ids.
let area = "";
let achievement = "";
test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await loginWithPassword(
    page,
    process.env.E2E_OWNER_EMAIL!,
    process.env.E2E_OWNER_PASSWORD!,
  );
  const title = uniqueName("Loading");
  await createArea(page, uniqueName("Skeleton"));
  area = new URL(page.url()).pathname;
  await addAchievements(page, [title]);
  await page
    .getByRole("link", { name: title, exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByRole("button", { name: "Add task" })).toBeVisible();
  achievement = new URL(page.url()).pathname;
  await page.close();
});

const pages: [string, () => string, string[]][] = [
  ["overview", () => "/", ["skeleton-overview"]],
  ["active", () => "/active", ["skeleton-active"]],
  ["inbox", () => "/inbox", ["skeleton-inbox"]],
  ["area", () => area, ["skeleton-area"]],
  ["trophies", () => `${area}/trophies`, ["skeleton-trophies"]],
  ["achievement", () => achievement, ["skeleton-achievement"]],
  ["history", () => "/history", ["skeleton-history"]],
  [
    "settings",
    () => "/settings",
    ["skeleton-settings", "skeleton-passkeys", "skeleton-connected"],
  ],
  ["consent", () => "/oauth/consent", ["skeleton-consent"]],
];

for (const [name, path, ids] of pages) {
  test(`${name} shows its placeholder while loading`, async ({
    browser,
  }, testInfo) => {
    const page = await openWithoutScripts(browser, testInfo, path());
    for (const id of ids) await expect(page.getByTestId(id)).toBeVisible();
    await expect(page.getByText("Loading…")).toHaveCount(0);
  });
}

test("login shows its placeholder while loading", async ({
  browser,
}, testInfo) => {
  const page = await openWithoutScripts(browser, testInfo, "/login", {
    signedIn: false,
  });
  await expect(page.getByTestId("skeleton-login")).toBeVisible();
});

/**
 * axe needs scripts, so it checks a copy: the scriptless loading page's
 * markup, minus its scripts, in a scripted page on the same origin.
 */
async function axeLoadingState(
  noScript: Page,
  colorScheme: "light" | "dark",
): Promise<void> {
  const html = (await noScript.content()).replace(
    /<script\b[\s\S]*?<\/script>/g,
    "",
  );
  const context = await noScript
    .context()
    .browser()!
    .newContext({ colorScheme, baseURL: noScript.url() });
  const page = await context.newPage();
  await page.goto("/api/version");
  await page.setContent(html, { waitUntil: "load" });
  await expect(page.getByTestId("skeleton-overview")).toBeVisible();
  // The copy must carry the app's styles, or the contrast check means nothing.
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    colorScheme === "dark" ? "rgb(22, 19, 31)" : "rgb(247, 246, 251)",
  );
  await expectNoAxeViolations(page);
  await context.close();
}

for (const scheme of ["light", "dark"] as const) {
  test(`loading state passes axe (${scheme})`, async ({
    browser,
  }, testInfo) => {
    const page = await openWithoutScripts(browser, testInfo, "/", {
      colorScheme: scheme,
    });
    await axeLoadingState(page, scheme);
  });
}

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

// The box is in the static shell (empty until the URL query arrives with the
// request-time part, which never waits on the database).
test("search box shows before results load", async ({ browser }, testInfo) => {
  const page = await openWithoutScripts(browser, testInfo, "/search?q=guitar");
  await expect(page.getByRole("searchbox", { name: "Search" })).toBeVisible();
  await expect(page.getByTestId("skeleton-search")).toBeVisible();
});

test("results dim while a new search runs, typed text survives", async ({
  page,
}) => {
  await loginWithPassword(
    page,
    process.env.E2E_OWNER_EMAIL!,
    process.env.E2E_OWNER_PASSWORD!,
  );
  await page.goto("/search?q=a");
  const results = page.getByTestId("search-results");
  await expect(results).toHaveAttribute("aria-busy", "false");
  // Hold the next results request so the search stays in flight.
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(/\/search\?q=ab/, async (route) => {
    await held;
    await route.continue();
  });
  const box = page.getByRole("searchbox", { name: "Search" });
  await box.fill("ab");
  await expect(results).toHaveAttribute("aria-busy", "true");
  await expect(results).toHaveClass(/opacity-60/);
  await expect(box).toHaveValue("ab");
  release();
  await expect(results).toHaveAttribute("aria-busy", "false");
  await expect(box).toHaveValue("ab");
});
