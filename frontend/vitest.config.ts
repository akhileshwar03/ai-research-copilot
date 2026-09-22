import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// 2026-09-22: a deliberately small starting point, not full coverage — this
// project had zero automated frontend tests before. Pure-logic modules that
// are easy to silently break (URL building, config parsing/fallbacks) come
// first; component/integration tests are a separate, larger follow-up.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
