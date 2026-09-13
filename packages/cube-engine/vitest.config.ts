import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: ["test/**/*.slow.test.ts"],
    testTimeout: 60_000,
  },
});
