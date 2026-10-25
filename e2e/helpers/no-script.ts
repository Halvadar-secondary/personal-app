import type { Browser, Page, TestInfo } from "@playwright/test";
import { loginWithPassword } from "./login";

/**
 * Opens `path` signed in, with scripts off. React swaps streamed content in
 * with scripts, so without them the page stays in its loading state: the
 * static shell and every Suspense fallback. `signedIn: false` skips login.
 */
export async function openWithoutScripts(
  browser: Browser,
  testInfo: TestInfo,
  path: string,
  { signedIn = true }: { signedIn?: boolean } = {},
): Promise<Page> {
  const {
    viewport,
    userAgent,
    isMobile,
    hasTouch,
    deviceScaleFactor,
    baseURL,
    colorScheme,
    extraHTTPHeaders,
  } = testInfo.project.use;
  const device = {
    viewport,
    userAgent,
    isMobile,
    hasTouch,
    deviceScaleFactor,
    baseURL,
    colorScheme,
    extraHTTPHeaders,
  };
  let storageState;
  if (signedIn) {
    const scripted = await browser.newContext(device);
    const page = await scripted.newPage();
    await loginWithPassword(
      page,
      process.env.E2E_OWNER_EMAIL!,
      process.env.E2E_OWNER_PASSWORD!,
    );
    storageState = await scripted.storageState();
    await scripted.close();
  }
  const context = await browser.newContext({
    ...device,
    storageState,
    javaScriptEnabled: false,
  });
  const page = await context.newPage();
  await page.goto(path);
  return page;
}
