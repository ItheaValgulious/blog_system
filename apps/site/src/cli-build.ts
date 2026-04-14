import { buildSite } from "./generator.js";

const distDir = await buildSite();
console.log(`Static site generated at ${distDir}`);
