import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const projectRoot = process.cwd();
const outputRoot = path.join(projectRoot, "dist-electron");
const rootPackagePath = path.join(projectRoot, "package.json");
const electronBinaryPath = require("electron");
const electronDistDir = path.dirname(electronBinaryPath);

function readOption(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length).trim() : undefined;
}

async function copyIntoStage(stageDir, relativePath) {
  const sourcePath = path.join(projectRoot, relativePath);
  const targetPath = path.join(stageDir, relativePath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.cp(sourcePath, targetPath, { recursive: true });
}

async function prepareStageDirectory() {
  const stageDir = await fs.mkdtemp(path.join(os.tmpdir(), "blog-system-electron-stage-"));
  const rootPackage = JSON.parse(await fs.readFile(rootPackagePath, "utf8"));
  const stagedPackage = {
    author: "blog-system",
    description: "Desktop admin shell for Blog System",
    main: "apps/desktop/dist/main.js",
    name: "blog-system-desktop",
    productName: "Blog System Desktop",
    version: rootPackage.version
  };

  await fs.writeFile(
    path.join(stageDir, "package.json"),
    `${JSON.stringify(stagedPackage, null, 2)}\n`,
    "utf8"
  );
  await copyIntoStage(stageDir, "apps/admin/dist");
  await copyIntoStage(stageDir, "apps/desktop/dist");
  await copyIntoStage(stageDir, "apps/server/dist");
  await copyIntoStage(stageDir, "apps/site/runtime-dist");
  await copyIntoStage(stageDir, "config.json");

  return stageDir;
}

async function writeDesktopRuntimeConfig(appPath, config) {
  const resourcesDir = path.join(appPath, "resources");
  await fs.writeFile(
    path.join(resourcesDir, "desktop.config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8"
  );
}

async function packageVariant(stageDir, variant) {
  const appPath = path.join(outputRoot, `${variant.appName}-win32-x64`);
  const executableName = `${variant.executableName}.exe`;

  console.log(`Preparing ${variant.appName} runtime...`);
  await fs.rm(appPath, { force: true, recursive: true });
  await fs.cp(electronDistDir, appPath, { recursive: true });
  await fs.rm(path.join(appPath, "resources", "default_app.asar"), { force: true });
  await fs.cp(stageDir, path.join(appPath, "resources", "app"), { recursive: true });
  await fs.rename(path.join(appPath, "electron.exe"), path.join(appPath, executableName));
  await writeDesktopRuntimeConfig(appPath, variant.runtimeConfig);
  return appPath;
}

const remoteServerBaseUrl =
  process.env.BLOG_SYSTEM_REMOTE_SERVER_URL?.trim() ?? readOption("remote-url");

if (!remoteServerBaseUrl) {
  throw new Error(
    "BLOG_SYSTEM_REMOTE_SERVER_URL is required. Example: npm run package:electron:win -- --remote-url=https://example.com/blog-system"
  );
}

await fs.rm(outputRoot, { force: true, recursive: true });
await fs.mkdir(outputRoot, { recursive: true });

const rootPackage = JSON.parse(await fs.readFile(rootPackagePath, "utf8"));
const stageDir = await prepareStageDirectory();

try {
  const variants = [
    {
      appName: "Blog System Local",
      executableName: "Blog System Local",
      runtimeConfig: {
        adminPort: 8788,
        mode: "local",
        serverPort: 8787
      },
      version: rootPackage.version
    },
    {
      appName: "Blog System Remote",
      executableName: "Blog System Remote",
      runtimeConfig: {
        adminPort: 8798,
        mode: "remote",
        serverBaseUrl: remoteServerBaseUrl
      },
      version: rootPackage.version
    }
  ];

  for (const variant of variants) {
    console.log(`Packaging ${variant.appName}...`);
    const appPath = await packageVariant(stageDir, variant);
    console.log(`Packaged ${variant.appName}: ${appPath}`);
  }
} finally {
  await fs.rm(stageDir, { force: true, recursive: true });
}
