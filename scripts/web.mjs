import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isAbsolute, join, relative, resolve } from "node:path";
import { networkInterfaces } from "node:os";
import { isIPv4 } from "node:net";
const root = fileURLToPath(new URL("../", import.meta.url));
const env = {
  ...process.env,
  GBOOK_ROOT: root,
  NODE_USE_ENV_PROXY: "1",
  NEXT_TELEMETRY_DISABLED: "1",
};
let hostname = "127.0.0.1";
delete env.GBOOK_AUTH_DATA_DIR;
const lanIp = env.GBOOK_OWNER_LAN_IP;
const serveHost = env.GBOOK_OWNER_SERVE_HOST;
if (serveHost && (env.GBOOK_OWNER_MODE !== "1" || lanIp ||
  !/^[a-z0-9-]+\.[a-z0-9-]+\.ts\.net$/.test(serveHost))) {
  console.error("Serve preview requires owner mode, a Tailscale DNS name, and a loopback listener.");
  process.exit(1);
}
if (lanIp) {
  const [a, b] = lanIp.split(".").map(Number);
  const privateIp = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  const assigned = Object.values(networkInterfaces()).flat().some((adapter) => adapter?.address === lanIp && !adapter.internal);
  if (env.GBOOK_OWNER_MODE !== "1" || !isIPv4(lanIp) || !privateIp || !assigned ||
    !/^\d{4,5}$/.test(env.PORT ?? "") || Number(env.PORT) > 65535) {
    console.error("LAN preview requires owner mode, a private IPv4 assigned to this computer, and an explicit port.");
    process.exit(1);
  }
  hostname = lanIp;
}
if (env.GBOOK_OWNER_MODE === "1") {
  const testRoot = join(root, ".test-data");
  const directory = env.GBOOK_DATA_DIR && resolve(root, env.GBOOK_DATA_DIR);
  const child = directory && relative(testRoot, directory);
  const serveLibrary = env.LOCALAPPDATA && join(env.LOCALAPPDATA, "GBook-Serve");
  const privateLibrary = serveHost && serveLibrary && directory === serveLibrary;
  if ((!privateLibrary && (!child || child.startsWith("..") || isAbsolute(child))) ||
    !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(env.GBOOK_OWNER_PASSWORD_HASH ?? "")) {
    console.error("Owner preview requires a password hash and a dedicated directory under .test-data.");
    process.exit(1);
  }
  env.GBOOK_DATA_DIR = directory;
  env.GBOOK_OWNER_FORMAL = privateLibrary ? "1" : "";
  if (privateLibrary && env.GBOOK_OWNER_CHATGPT === "1") {
    env.GBOOK_AUTH_DATA_DIR = join(env.LOCALAPPDATA, "GBook");
  }
}
const init = spawnSync(
  process.execPath,
  [join(root, "scripts/migrate.mjs"), "--recover"],
  { cwd: root, env, stdio: "inherit", windowsHide: true },
);
if (init.status !== 0) process.exit(1);
const next = spawn(
  process.execPath,
  [
    "--use-env-proxy",
    join(root, "node_modules/next/dist/bin/next"),
    process.argv[2] || "dev",
    "--hostname",
    hostname,
    "--port",
    process.env.PORT || "3000",
  ],
  { cwd: join(root, "apps/web"), env, stdio: "inherit", windowsHide: true },
);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => next.kill(sig));
next.on("exit", (code) => process.exit(code ?? 0));
