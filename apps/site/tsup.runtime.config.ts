import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  entry: [
    "src/generator.ts",
    "src/publisher.ts",
    "src/publish-config.ts",
    "src/publish-targets/index.ts",
    "src/publish-targets/github.ts",
    "src/publish-targets/cloudflare.ts",
    "src/publish-targets/types.ts"
  ],
  format: ["esm"],
  noExternal: ["@blog-system/content-core"],
  outDir: "runtime-dist",
  platform: "node",
  target: "node22"
});
