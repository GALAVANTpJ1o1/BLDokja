import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.slow.test.ts"],
    testTimeout: 600_000,
  },
});
