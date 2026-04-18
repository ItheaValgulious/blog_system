import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  entry: ["src/index.ts"],
  format: ["cjs"],
  noExternal: ["@blog-system/content-core", "ajv", "cors", "express", "express-session"],
  outDir: "dist",
  platform: "node",
  shims: true,
  target: "node22"
});
