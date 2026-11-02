import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url))
  .replaceAll("\\", "/")
  .replace(/\/$/, "");
console.log(
  `[mcp_servers.gbook]\ncommand = ${JSON.stringify(process.execPath.replaceAll("\\", "/"))}\nargs = [${JSON.stringify(root + "/apps/mcp-server/src/index.ts")}]\ncwd = ${JSON.stringify(root)}\n[mcp_servers.gbook.env]\nGBOOK_ROOT = ${JSON.stringify(root)}\nGBOOK_MCP_WRITE = "0"`,
);
