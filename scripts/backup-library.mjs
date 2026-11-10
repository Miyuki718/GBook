import Database from "better-sqlite3";
import { closeSync, openSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { dataDirectory } from "../packages/core/src/paths.ts";

const [output, ...rest] = process.argv.slice(2);
if (!output || rest.length || !/\.db$/i.test(output)) {
  console.error("Usage: node scripts/backup-library.mjs <new-backup.db>");
  process.exit(1);
}

const source = join(dataDirectory(), "library.db");
const destination = resolve(output);
const library = new Database(source, { readonly: true, fileMustExist: true });
let reserved = false;
try {
  closeSync(openSync(destination, "wx", 0o600));
  reserved = true;
  await library.backup(destination);
  const backup = new Database(destination, { readonly: true, fileMustExist: true });
  try {
    if (backup.pragma("quick_check", { simple: true }) !== "ok") {
      throw new Error("The library snapshot failed its integrity check.");
    }
  } finally {
    backup.close();
  }
  console.log("Library snapshot created and verified.");
} catch (error) {
  if (reserved) unlinkSync(destination);
  throw error;
} finally {
  library.close();
}
