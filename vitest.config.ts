import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    include: ["packages/**/test/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
  resolve: {
    alias: [
      {
        find: /^@prooflens\/(.*)$/,
        // URL.pathname leaves spaces percent-encoded, which breaks resolution
        // when the checkout lives in a directory such as "Cowork /...".
        replacement: fileURLToPath(new URL("./packages/$1/src/index.ts", import.meta.url)),
      },
    ],
  },
});
