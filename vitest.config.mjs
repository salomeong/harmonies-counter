// Vitest config for the React component layer (app/**), which is the replacement safety net for
// the deleted src/ui/card.test.js's patch-hook assertion (see CLAUDE.md and
// app/_components/Card.test.jsx's header comment).
//
// This is a SECOND, deliberately separate test runner from `node --test` (see CLAUDE.md's
// Architecture section: "no build step, no framework, no bundler"). The scoring core, game
// declarations and control-spec builders under src/ are plain ES modules that `node --test` runs
// with zero toolchain, and that property is worth protecting — so `include` is scoped to
// app/**/*.test.jsx only. Do NOT widen it to pick up src/**/*.test.js; those keep running under
// `node --test` (`npm test`), and running them twice under two different runners/globals would be
// worse than not merging the runners at all.

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Mirrors jsconfig.json's "@/*" -> "./*" so app/_components can import "@/src/..." exactly
      // as they do under Next.js.
      "@": fileURLToPath(new URL(".", import.meta.url))
    }
  },
  test: {
    environment: "jsdom",
    include: ["app/**/*.test.jsx"],
    setupFiles: ["@testing-library/jest-dom/vitest"]
  }
});
