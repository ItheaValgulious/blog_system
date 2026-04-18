import { spawn } from "node:child_process";
import process from "node:process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const projectRoot = process.cwd();

const services = [
  {
    name: "server",
    args: ["--prefix", "apps/server", "run", "dev"]
  },
  {
    name: "admin",
    args: ["--prefix", "apps/admin", "run", "dev", "--", "--host", "127.0.0.1"]
  }
];

const colorMap = {
  admin: "\u001b[32m",
  electron: "\u001b[35m",
  reset: "\u001b[0m",
  server: "\u001b[36m"
};

function spawnLoggedProcess(name, command, options = {}) {
  const child = spawn(command, {
    cwd: projectRoot,
    env: process.env,
    shell: true,
    stdio: ["inherit", "pipe", "pipe"],
    ...options
  });

  const prefix = `${colorMap[name]}[${name}]${colorMap.reset}`;
  const pipeOutput = (stream, target) => {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        target.write(`${prefix} ${line}\n`);
      }
    });
    stream.on("end", () => {
      if (buffer) {
        target.write(`${prefix} ${buffer}\n`);
      }
    });
  };

  pipeOutput(child.stdout, process.stdout);
  pipeOutput(child.stderr, process.stderr);
  return child;
}

function runCommandLogged(name, command, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnLoggedProcess(name, command, options);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`[${name}] exited with code ${code ?? "null"} signal ${signal ?? "none"}`));
    });
  });
}

async function waitForUrl(url, timeoutMs = 30000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

const children = [];

let shuttingDown = false;
function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => {
    for (const child of children) {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }
    process.exit(exitCode);
  }, 800).unref();
}

for (const service of services) {
  const child = spawnLoggedProcess(service.name, [npmCommand, ...service.args].join(" "));
  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    if (code && code !== 0) {
      console.error(`[${service.name}] exited with code ${code}`);
      shutdown(code);
      return;
    }

    if (signal) {
      console.error(`[${service.name}] exited with signal ${signal}`);
      shutdown(1);
    }
  });
  children.push(child);
}

await runCommandLogged("electron", [npmCommand, "run", "build", "-w", "apps/desktop"].join(" "));
await waitForUrl("http://127.0.0.1:5173");
await waitForUrl("http://127.0.0.1:8787/api/health");

const electronEnv = {
  ...process.env
};
delete electronEnv.ELECTRON_RUN_AS_NODE;

const electronChild = spawnLoggedProcess(
  "electron",
  [npmCommand, "run", "start", "-w", "apps/desktop"].join(" "),
  {
    env: {
      ...electronEnv,
      BLOG_SYSTEM_ELECTRON_START_URL: "http://127.0.0.1:5173"
    }
  }
);
electronChild.on("exit", (code) => shutdown(code ?? 0));
children.push(electronChild);

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
