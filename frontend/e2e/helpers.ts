import { Page, expect } from "@playwright/test";

/**
 * Signs in via the real email-OTP flow, dev-echo mode (no RESEND_API_KEY
 * configured in the e2e backend — see playwright.config.ts). The frontend
 * auto-fills the OTP boxes from the dev-echo `_dev_code` in the send-otp
 * response (see app/login/page.tsx's handleSendOtp), so this only needs to
 * submit the email and click Sign In, never type digits itself.
 *
 * Each test should sign in with its own unique email (see uniqueEmail())
 * so tests don't share a user/session and can run against the shared e2e
 * backend without interfering with each other.
 */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByPlaceholder("Email address").fill(email);
  await page.getByRole("button", { name: "Continue with Email" }).click();

  // Dev-mode banner confirms the code was auto-filled, not just requested.
  await expect(page.getByText("Dev mode — email not sent")).toBeVisible();

  const signInButton = page.getByRole("button", { name: "Sign In" });
  await expect(signInButton).toBeEnabled();
  await signInButton.click();

  await page.waitForURL("/");
}

/** A fresh, collision-free email per test run/test — this app has no
 * password auth, so "sign up" and "sign in" are the same flow (see
 * otp_service.py's send_otp docstring); a new email is just a new account. */
export function uniqueEmail(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
}
