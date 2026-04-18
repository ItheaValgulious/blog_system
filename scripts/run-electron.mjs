import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";
import path from "node:path";

const require = createRequire(import.meta.url);
const electronBinary = require("electron");
const projectRoot = process.cwd();
const appEntry = process.argv[2];

if (!appEntry) {
  throw new Error("Electron entry path is required.");
}

const resolvedEntry = path.resolve(projectRoot, appEntry);
const childEnv = {
  ...process.env
};
delete childEnv.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinary, [resolvedEntry], {
  cwd: projectRoot,
  env: childEnv,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
