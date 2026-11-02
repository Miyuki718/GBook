import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const env = {
  ...process.env,
  GBOOK_ROOT: root,
  NODE_USE_ENV_PROXY: "1",
  NEXT_TELEMETRY_DISABLED: "1",
};
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
    "127.0.0.1",
    "--port",
    process.env.PORT || "3000",
  ],
  { cwd: join(root, "apps/web"), env, stdio: "inherit", windowsHide: true },
);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => next.kill(sig));
next.on("exit", (code) => process.exit(code ?? 0));
