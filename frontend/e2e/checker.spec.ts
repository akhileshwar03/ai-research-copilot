import { test, expect } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

// The AI Checker is served by a separate model server. The e2e backend only
// reaches one if CHECKER_URL, CHECKER_TOKEN, CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET are exported in the
// shell that runs Playwright (point CHECKER_URL at a running copy of the checker model service). Without
// them the checker correctly answers "temporarily unavailable", so these tests skip instead of failing.
test.skip(!process.env.CHECKER_URL, "Set CHECKER_URL (and the other CHECKER_* values) to run the AI Checker e2e tests.");

// A typical AI-written paragraph, 60+ words so it clears the minimum.
const AI_LIKE_TEXT = `
Climate change is one of the most pressing challenges facing our planet today. Rising global temperatures
are causing glaciers to melt, sea levels to rise, and weather patterns to become increasingly unpredictable.
To address this issue, governments, businesses, and individuals must work together to reduce greenhouse gas
emissions. Transitioning to renewable energy sources, such as solar and wind power, is a crucial step. By
taking collective action, we can build a more sustainable future for generations to come.
`.trim();

test("the checker waits for enough words, then returns a verdict with a sentence view", async ({ page }) => {
  await signIn(page, uniqueEmail("checker"));
  await page.goto("/checker");

  const textbox = page.getByLabel("Text to check");
  const check = page.getByRole("button", { name: "Check text" });
  await expect(textbox).toBeVisible({ timeout: 15_000 });

  // Too short: the button stays disabled and the page says how many words are missing.
  await textbox.fill("Only a few words here.");
  await expect(check).toBeDisabled();
  await expect(page.getByText(/Add \d+ more to run the check/)).toBeVisible();

  // Long enough: the check runs and one of the three verdicts appears. The exact verdict comes from a live
  // model, so this asserts the structure, not which of the three it picks.
  await textbox.fill(AI_LIKE_TEXT);
  await expect(check).toBeEnabled();
  await check.click();

  const verdict = page.getByText(/^(Likely human|Unsure|Likely mixed|Likely AI)$/).first();
  await expect(verdict).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Sentence view" })).toBeVisible();

  // The page states its limits, and never shows a bare percentage as the answer.
  await expect(page.getByRole("heading", { name: /what this checker can and can.t do/i })).toBeVisible();
});

test("a non-PDF file is refused before it is uploaded", async ({ page }) => {
  await signIn(page, uniqueEmail("checker-pdf"));
  await page.goto("/checker");

  await page.getByRole("tab", { name: "Upload PDF" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("not a pdf"),
  });
  await expect(page.getByRole("alert")).toContainText("Only PDF files are supported");
});
