import { getLibrary } from "@gbook/core";
import { books } from "../packages/core/src/demo.ts";
const lib = getLibrary();
lib.migrate();
// Only seed a never-used database; deleting all books must not resurrect samples.
if (lib.native.prepare("SELECT count(*) AS n FROM books").get().n === 0) {
  for (const book of books) lib.addBook(book);
}
if (process.argv.includes("--recover")) lib.recover();
console.log("GBook database ready");
lib.close();
