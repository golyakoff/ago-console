import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    // `.tsx` added in `5-16`: `testing.md`'s "Component / behaviour" level needs tests that mount
    // React, and a test that mounts React is JSX. The original glob predated that level existing.
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
