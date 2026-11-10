import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The Java parser test runs close to Vitest's 5s default on Windows.
    testTimeout: 10_000,
  },
});
