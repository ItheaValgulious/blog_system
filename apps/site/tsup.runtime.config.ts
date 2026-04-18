import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  entry: ["src/generator.ts", "src/publisher.ts"],
  format: ["esm"],
  noExternal: ["@blog-system/content-core"],
  outDir: "runtime-dist",
  platform: "node",
  target: "node22"
});
