import { expect, test } from "@playwright/test";
import { loginWithPassword } from "./helpers/login";

test("anonymous visitor is sent to login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login(\?|$)/);
});

test("owner signs in and sees the app", async ({ page }) => {
  await loginWithPassword(
    page,
    process.env.E2E_OWNER_EMAIL!,
    process.env.E2E_OWNER_PASSWORD!,
  );
  await expect(page.getByRole("heading", { name: "Your areas" })).toBeVisible();
});

test("a signed-in non-owner gets 404", async ({ page }) => {
  await loginWithPassword(
    page,
    process.env.E2E_INTRUDER_EMAIL!,
    process.env.E2E_INTRUDER_PASSWORD!,
  );
  const res = await page.goto("/");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("Your areas")).toHaveCount(0);
});

test("public password sign-up is refused", async ({ request }) => {
  const res = await request.post("/api/auth/sign-up/email", {
    data: {
      email: process.env.E2E_OWNER_EMAIL,
      password: "another-pw-123",
      name: "x",
    },
  });
  expect(res.ok()).toBe(false);
});

test("health is public and not cached", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(res.headers()["cache-control"]).toContain("no-store");
});

test("export refuses a visitor who isn't signed in", async ({ request }) => {
  const res = await request.get("/api/export");
  expect(res.status()).toBe(401);
});

// The signed session copy lasts 5 minutes; when it's missing or expired the
// proxy reads the database and must hand the browser a fresh one.
test("the proxy hands back a fresh session cookie", async ({
  page,
  playwright,
  baseURL,
}) => {
  await loginWithPassword(
    page,
    process.env.E2E_OWNER_EMAIL!,
    process.env.E2E_OWNER_PASSWORD!,
  );
  const token = (await page.context().cookies()).find((c) =>
    c.name.endsWith("session_token"),
  )!;
  // A bare client: only the token, none of the browser’s other cookies.
  const bare = await playwright.request.newContext({ baseURL });
  const res = await bare.get("/inbox", {
    headers: { cookie: `${token.name}=${token.value}` },
    maxRedirects: 0,
  });
  expect(res.status()).toBe(200);
  const names = res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value.split("=")[0] ?? "");
  expect(names.some((n) => n.endsWith("session_data"))).toBe(true);
  await bare.dispose();
});
