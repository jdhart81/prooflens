import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/test/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
  resolve: {
    alias: [
      { find: /^@prooflens\/(.*)$/, replacement: new URL("./packages/$1/src/index.ts", import.meta.url).pathname },
    ],
  },
});
