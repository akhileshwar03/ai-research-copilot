import { test, expect } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

test("sign in via email OTP reaches an authenticated workspace", async ({ page }) => {
  const email = uniqueEmail("auth");
  await signIn(page, email);

  // Landing page in an authenticated state links to the workspace —
  // confirms the session actually took, not just that /login redirected.
  // .first(): the nav, hero, and footer each have their own "Open
  // workspace" link — any one of them proves the point.
  await expect(page.getByRole("link", { name: "Open workspace" }).first()).toBeVisible();

  await page.goto("/chat");
  await expect(page.getByLabel("Chat prompt")).toBeVisible({ timeout: 15_000 });
});

test("signing in twice with the same email reaches the same account", async ({ page, context }) => {
  const email = uniqueEmail("repeat-login");
  await signIn(page, email);
  await page.goto("/chat");
  await expect(page.getByLabel("Chat prompt")).toBeVisible();

  // The access token lives in localStorage; the refresh token lives in an
  // httpOnly cookie (see app/core/cookies.py) -- clearing only one leaves
  // the other still able to re-authenticate the session, and /login would
  // just redirect straight back to "/". context.clearCookies() operates at
  // the browser level and can remove httpOnly cookies, unlike
  // page.evaluate(() => localStorage.clear()) — need both.
  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());
  await page.goto("/login");

  await signIn(page, email);
  await page.goto("/chat");
  await expect(page.getByLabel("Chat prompt")).toBeVisible();
});
