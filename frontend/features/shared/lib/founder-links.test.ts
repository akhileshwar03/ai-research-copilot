import { describe, expect, it } from "vitest";

import { validateFounderLink } from "./founder-links";

// The same cases as backend/app/tests/test_founder.py: the form and the server must agree.
describe("validateFounderLink (mirrors the server rules)", () => {
  it.each([
    ["founder_linkedin_url", "https://www.linkedin.com/in/ada-lovelace"],
    ["founder_linkedin_url", "https://uk.linkedin.com/in/ada"],
    ["founder_github_url", "https://github.com/ada"],
    ["founder_x_url", "https://x.com/ada"],
    ["founder_x_url", "https://twitter.com/ada"],
    ["founder_website_url", "https://ada.dev"],
    ["founder_website_url", "https://www.example.com/about"],
    ["founder_github_url", ""],
  ] as const)("accepts %s = %s", (key, url) => {
    expect(validateFounderLink(key, url)).toBeNull();
  });

  it.each([
    ["founder_github_url", "http://github.com/ada"],
    ["founder_github_url", "javascript:alert(1)"],
    ["founder_website_url", "data:text/html,<script>alert(1)</script>"],
    ["founder_website_url", "//evil.example/x"],
    ["founder_github_url", "https://evil.example/ada"],
    ["founder_github_url", "https://github.com.evil.example/ada"],
    ["founder_github_url", "https://notgithub.com/ada"],
    ["founder_github_url", "https://github.com"],
    ["founder_linkedin_url", "https://linkedin.com/"],
    ["founder_github_url", "https://user:pass@github.com/ada"],
    ["founder_website_url", "https://127.0.0.1/"],
    ["founder_website_url", "https://localhost/"],
    ["founder_website_url", "https://intranet/"],
    ["founder_website_url", "https://a b.com"],
  ] as const)("refuses %s = %s", (key, url) => {
    expect(validateFounderLink(key, url)).not.toBeNull();
  });
});
