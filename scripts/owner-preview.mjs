import { spawn } from "node:child_process";
import { randomBytes, scryptSync } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const { GBOOK_OWNER_PASSWORD: password, ...env } = process.env;
if (!password || password.length < 12 || password.length > 256) {
  console.error("Set GBOOK_OWNER_PASSWORD to a 12–256 character test password.");
  process.exit(1);
}
const root = fileURLToPath(new URL("../", import.meta.url));
const salt = randomBytes(16);
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || !["--lan", "--serve"].includes(args[0]) || !args[1])) {
  console.error("Usage: node scripts/owner-preview.mjs [--lan <private-ipv4> | --serve <device.ts.net>]");
  process.exit(1);
}
const lanIp = args[0] === "--lan" ? args[1] : "";
const serveHost = args[0] === "--serve" ? args[1] : "";
const server = spawn(process.execPath, [join(root, "scripts/web.mjs"), "start"], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...env,
    GBOOK_OWNER_MODE: "1",
    GBOOK_OWNER_PASSWORD_HASH: `${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`,
    GBOOK_DATA_DIR: join(root, ".test-data", serveHost ? "owner-serve" : lanIp ? "owner-lan" : "owner-preview"),
    GBOOK_OWNER_LAN_IP: lanIp,
    GBOOK_OWNER_SERVE_HOST: serveHost,
    GBOOK_PREVIEW_BUILD: "1",
    PORT: "3135",
  },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code) => { process.exitCode = code ?? 1; });
