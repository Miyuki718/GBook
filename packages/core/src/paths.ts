import { join, resolve } from "node:path";
import { homedir } from "node:os";
export function dataDirectory() {
  return resolve(
    /* turbopackIgnore: true */ process.env.GBOOK_DATA_DIR ||
      join(
        process.env.LOCALAPPDATA || join(homedir(), ".local", "share"),
        "GBook",
      ),
  );
}
