import { test, expect } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

test("humanize sample text in Basic mode and get a real rewrite", async ({ page }) => {
  await signIn(page, uniqueEmail("humanizer"));
  await page.goto("/humanizer");

  // Basic mode (GPT-4.1-mini rewrite) is the default-selected mode and the
  // only one exercisable here — Ultra Human needs a local Ollama instance
  // this environment doesn't have (see humanizer_ultra_service.py: a
  // 503/504 there is expected without one, not a bug).
  const sampleButton = page.getByRole("button", { name: "Try a sample" });
  await expect(sampleButton).toBeVisible({ timeout: 15_000 });

  // The sample text is a known-good ~110 words -- comfortably over the
  // 30-word minimum enforced both client-side (page.tsx's MIN_WORDS) and
  // server-side (runtime_settings.humanize_min_words), so this sidesteps
  // maintaining a hardcoded paragraph that could drift under that floor.
  await sampleButton.click();

  const humanizeButton = page.getByRole("button", { name: "Humanize" });
  await expect(humanizeButton).toBeEnabled();
  const originalText = await page.getByPlaceholder("Paste text here…").inputValue();
  await humanizeButton.click();

  // "Copy" only renders once phase === "done" for Basic mode — a cleaner
  // completion signal than polling button text through its "Reading your
  // text…" / "Rewriting…" intermediate states.
  await expect(page.getByRole("button", { name: "Copy" })).toBeVisible({ timeout: 30_000 });

  // The word-count summary ("N → M words") is a second, independent
  // done-signal gated the same way — if this and Copy both appear, the
  // stream genuinely completed rather than stalling mid-write.
  await expect(page.getByText(/\d+\s*→\s*\d+\s*words/)).toBeVisible();

  // A real rewrite, not an empty response or a same-text passthrough.
  const outputText = await page.locator("div.whitespace-pre-wrap").last().innerText();
  expect(outputText.trim().length).toBeGreaterThan(0);
  expect(outputText.trim()).not.toBe(originalText.trim());

  // Diff Highlight is the other output view tab, reset to "Rewritten text"
  // on every submit — DiffOutput (diff-output.tsx) marks every actually-
  // changed word/phrase in a <mark> element, so a real rewrite (asserted
  // above) must produce at least one. This is a genuine assertion on the
  // second render path, not just a click-doesn't-crash smoke check.
  await page.getByRole("button", { name: "Diff Highlight" }).click();
  await expect(page.locator("mark").first()).toBeVisible();
});
