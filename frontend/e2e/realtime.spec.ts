import { test, expect } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

test("Real-time AI streams a real answer and degrades gracefully without web search", async ({ page }) => {
  await signIn(page, uniqueEmail("realtime"));
  await page.goto("/realtime");

  // No aria-label on this page's input/button (unlike Research Copilot's
  // chat-input.tsx) -- page.tsx builds them inline with only a placeholder
  // and visible text. Real ellipsis character in the placeholder, not "...".
  const input = page.getByPlaceholder("Ask anything…");
  await expect(input).toBeVisible({ timeout: 15_000 });

  // e2e's backend has TAVILY_API_KEY forced empty (start-backend.sh) --
  // web_search_service.py returns [] immediately with no HTTP call rather
  // than erroring, and realtime_service.py falls through to an ungrounded
  // LLM answer (confirmed in code, not assumed). A simple arithmetic
  // question has a deterministic answer regardless of web grounding, so
  // it's a reliable check that the ungrounded fallback path actually
  // produces a real, correct response rather than failing silently.
  await input.fill("What is 7 times 8? Answer with just the number.");

  const sendButton = page.getByRole("button", { name: "Send" });
  await expect(sendButton).toBeEnabled();
  await sendButton.click();

  // "Searching…" while streaming, back to "Send" once the SSE stream's
  // `done` event lands (realtime_service.py always yields it in a
  // finally block).
  await expect(sendButton).toHaveText("Send", { timeout: 30_000 });

  // exact: true -- a loose substring match can collide with the random
  // numeric suffix in the test's own unique email shown in the account
  // menu (e.g. "e2e-realtime-...-560934" contains "56"), a real flake
  // this test hit in practice, not a hypothetical one.
  await expect(page.getByText("56", { exact: true })).toBeVisible();

  // No Tavily key configured -> sources is always [] -> the citation-chip
  // block (rendered only when message.sources.length > 0) must not
  // appear. This is a real assertion of the documented graceful-
  // degradation behavior, not just "the test didn't check for it".
  await expect(page.locator('a[target="_blank"][rel="noopener noreferrer"]')).toHaveCount(0);
});
