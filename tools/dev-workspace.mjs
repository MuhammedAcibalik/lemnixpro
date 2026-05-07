import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const engineDir = resolve(rootDir, "engines", "optimization-engine");
const isWindows = process.platform === "win32";
const dryRun = process.argv.includes("--dry-run");

const runtimeBuilds = [
  {
    label: "shared-types",
    command: "pnpm",
    args: ["--filter", "@lemnixpro/shared-types", "build"],
    cwd: rootDir
  },
  {
    label: "shared-utils",
    command: "pnpm",
    args: ["--filter", "@lemnixpro/shared-utils", "build"],
    cwd: rootDir
  },
  {
    label: "shared-contracts",
    command: "pnpm",
    args: ["--filter", "@lemnixpro/shared-contracts", "build"],
    cwd: rootDir
  }
];

const devProcesses = [
  {
    label: "web-services",
    command: "pnpm",
    args: [
      "-r",
      "--parallel",
      "--filter",
      "./apps/*",
      "--filter",
      "./services/*",
      "--if-present",
      "dev"
    ],
    cwd: rootDir
  },
  {
    label: "optimization-engine",
    command: "python",
    args: [
      "-m",
      "uvicorn",
      "app.main:app",
      "--reload",
      "--host",
      "127.0.0.1",
      "--port",
      "8000"
    ],
    cwd: engineDir
  }
];

function formatCommand(task) {
  return `${task.command} ${task.args.join(" ")}`;
}

function spawnTask(task) {
  const child = spawn(task.command, task.args, {
    cwd: task.cwd,
    env: process.env,
    shell: isWindows,
    stdio: ["inherit", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(prefixOutput(task.label, chunk));
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(prefixOutput(task.label, chunk));
  });

  return child;
}

function prefixOutput(label, chunk) {
  const text = chunk.toString();
  return text
    .split(/\r?\n/)
    .map((line, index, lines) => {
      if (line === "" && index === lines.length - 1) {
        return "";
      }
      return `[${label}] ${line}`;
    })
    .join("\n");
}

async function runOnce(task) {
  console.log(`[dev] ${formatCommand(task)}`);

  if (dryRun) {
    return;
  }

  const child = spawnTask(task);
  const exitCode = await new Promise((resolveExit) => {
    child.on("exit", (code, signal) => {
      if (signal) {
        resolveExit(1);
        return;
      }
      resolveExit(code ?? 0);
    });
  });

  if (exitCode !== 0) {
    throw new Error(`${task.label} exited with code ${exitCode}`);
  }
}

async function terminateChild(child) {
  if (child.exitCode !== null || child.killed) {
    return;
  }

  if (isWindows && child.pid) {
    await new Promise((resolveTerminate) => {
      spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        shell: true,
        stdio: "ignore"
      }).on("exit", resolveTerminate);
    });
    return;
  }

  child.kill("SIGTERM");
}

async function main() {
  console.log("[dev] preparing shared runtime packages");
  for (const task of runtimeBuilds) {
    await runOnce(task);
  }

  console.log("[dev] starting workspace services and optimization engine");
  devProcesses.forEach((task) => console.log(`[dev] ${formatCommand(task)}`));
  if (dryRun) {
    return;
  }

  const children = devProcesses.map(spawnTask);
  let shuttingDown = false;

  const shutdown = async (exitCode) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    await Promise.all(children.map(terminateChild));
    process.exit(exitCode);
  };

  process.on("SIGINT", () => {
    void shutdown(0);
  });
  process.on("SIGTERM", () => {
    void shutdown(0);
  });

  for (const child of children) {
    child.on("exit", (code) => {
      if (!shuttingDown && code !== 0) {
        void shutdown(code ?? 1);
      }
    });
  }
}

main().catch((error) => {
  console.error(`[dev] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
