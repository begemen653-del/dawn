import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["pipeline/tests/**/*.test.ts", "config/tests/**/*.test.ts", "web/src/**/*.test.ts"],
    environment: "node",
  },
});
