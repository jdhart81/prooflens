import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * The workspace packages are consumed straight from TypeScript source, so the
 * app runs without a prior `tsc -b`. This mirrors the alias block in
 * ../../vitest.config.ts — keep the two in step.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@prooflens\/(.*)$/,
        replacement: new URL("../../packages/$1/src/index.ts", import.meta.url).pathname,
      },
    ],
  },
  server: { port: 5173 },
  build: { outDir: "dist", sourcemap: true },
});
