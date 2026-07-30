// Shared canary source helpers. Deliberately NOT a *.test.ts file: importing
// a helper out of a suite file re-runs that entire suite inside the importer,
// which is how the canary set briefly ran twice.

/**
 * Source with comments removed.
 *
 * Canaries assert on source TEXT, so the comment explaining why something was
 * removed contains the very string the canary forbids — a fix and its own
 * documentation cannot both live in the file. Twelve canaries had each grown a
 * private `.replace(/\/\/.*$/gm, "")` to cope, which is a rule every future
 * author has to remember; the one who forgets ships a canary that fails the
 * moment somebody documents the fix.
 *
 * String-aware on purpose. A naive strip from `//` also eats the rest of any
 * line holding a URL, so `"https://capandcrease.com"` becomes `"https:` and a
 * perfectly good assertion starts failing for a reason nobody will guess.
 *
 * Newlines inside comments are kept so line numbers stay put and removing a
 * block comment cannot glue two tokens into a substring that was never there.
 */
export function stripComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];

    if (c === '"' || c === "'" || c === "`") {
      out += c;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") { out += src[i] + (src[i + 1] ?? ""); i += 2; continue; }
        out += src[i];
        if (src[i] === c) { i++; break; }
        i++;
      }
      continue;
    }

    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }

    if (c === "/" && next === "*") {
      // A separator, not nothing: `foo/* c */bar` collapsing to `foobar` would
      // invent a substring the source never contained.
      out += " ";
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") out += "\n";
        i++;
      }
      i += 2;
      continue;
    }

    out += c;
    i++;
  }
  return out;
}
