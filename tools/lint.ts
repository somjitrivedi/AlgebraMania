import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SKIP_DIRS = new Set(["node_modules", "dist", "data", ".git", ".venv", "__pycache__"]);
const TEXT_EXTENSIONS = new Set([".ts", ".py", ".json", ".md", ".yml", ".yaml", ".gitignore", ".gitattributes", ".editorconfig"]);

export interface Problem {
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

const REGEX_PRECEDERS = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^"]);
const REGEX_KEYWORDS = new Set(["return", "typeof", "case", "in", "of", "new", "delete", "void", "throw", "yield", "await", "else", "do"]);

function lineAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

export function findTsComments(source: string): number[] {
  const hits: number[] = [];
  const templateDepth: number[] = [];
  let braceDepth = 0;
  let lastSignificant = "";
  let lastWord = "";
  let i = 0;
  const n = source.length;
  const skipString = (quote: string): void => {
    i++;
    while (i < n && source[i] !== quote) {
      if (source[i] === "\\") i++;
      else if (source[i] === "\n") break;
      i++;
    }
    i++;
  };
  const skipTemplate = (): boolean => {
    while (i < n) {
      const ch = source[i]!;
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === "`") {
        i++;
        return false;
      }
      if (ch === "$" && source[i + 1] === "{") {
        i += 2;
        return true;
      }
      i++;
    }
    return false;
  };
  while (i < n) {
    const ch = source[i]!;
    const next = source[i + 1];
    if (ch === "/" && (next === "/" || next === "*")) {
      hits.push(lineAt(source, i));
      if (next === "/") {
        while (i < n && source[i] !== "\n") i++;
      } else {
        const end = source.indexOf("*/", i + 2);
        i = end === -1 ? n : end + 2;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      skipString(ch);
      lastSignificant = "a";
      lastWord = "";
      continue;
    }
    if (ch === "`") {
      i++;
      if (skipTemplate()) templateDepth.push(braceDepth);
      lastSignificant = "a";
      lastWord = "";
      continue;
    }
    if (ch === "{") {
      braceDepth++;
    } else if (ch === "}") {
      if (templateDepth.length > 0 && templateDepth[templateDepth.length - 1] === braceDepth) {
        templateDepth.pop();
        i++;
        if (skipTemplate()) templateDepth.push(braceDepth);
        lastSignificant = "a";
        continue;
      }
      braceDepth--;
    }
    if (ch === "/") {
      const regexAllowed = lastSignificant === "" || REGEX_PRECEDERS.has(lastSignificant) || REGEX_KEYWORDS.has(lastWord);
      if (regexAllowed) {
        i++;
        let inClass = false;
        while (i < n && source[i] !== "\n") {
          const c = source[i]!;
          if (c === "\\") i++;
          else if (c === "[") inClass = true;
          else if (c === "]") inClass = false;
          else if (c === "/" && !inClass) break;
          i++;
        }
        i++;
        while (i < n && /[a-z]/.test(source[i]!)) i++;
        lastSignificant = "a";
        lastWord = "";
        continue;
      }
    }
    if (/[A-Za-z0-9_$]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(source[j]!)) j++;
      lastWord = source.slice(i, j);
      lastSignificant = "a";
      i = j;
      continue;
    }
    if (!/\s/.test(ch)) {
      lastSignificant = ch;
      lastWord = "";
    }
    i++;
  }
  return hits;
}

export function findHashComments(source: string): number[] {
  const hits: number[] = [];
  let i = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i]!;
    if (ch === "#") {
      hits.push(lineAt(source, i));
      while (i < n && source[i] !== "\n") i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const triple = source.slice(i, i + 3) === ch.repeat(3);
      const close = triple ? ch.repeat(3) : ch;
      i += close.length;
      while (i < n && source.slice(i, i + close.length) !== close) {
        if (source[i] === "\\") i++;
        else if (!triple && source[i] === "\n") break;
        i++;
      }
      i += close.length;
      continue;
    }
    i++;
  }
  return hits;
}

export function lintSource(file: string, source: string): Problem[] {
  const problems: Problem[] = [];
  const add = (line: number, message: string): void => {
    problems.push({ file, line, message });
  };
  if (source.includes("\r")) add(lineAt(source, source.indexOf("\r")), "CR line ending (use LF only)");
  if (source.length > 0 && !source.endsWith("\n")) add(lineAt(source, source.length), "missing final newline");
  source.split("\n").forEach((text, index) => {
    if (/[ \t]+\r?$/.test(text)) add(index + 1, "trailing whitespace");
    if (text.includes("\t")) add(index + 1, "tab character");
  });
  const ext = extname(file) || file.slice(file.lastIndexOf("/"));
  if (ext === ".ts") {
    const lines = findTsComments(source.startsWith("#!") ? source.replace(/^#![^\n]*/, "") : source);
    for (const line of lines) add(line, "comment (the project has no code comments)");
  }
  if (ext === ".py" || ext === ".yml" || ext === ".yaml") {
    for (const line of findHashComments(source)) add(line, "comment (the project has no code comments)");
  }
  return problems;
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out);
      continue;
    }
    if (name === "package-lock.json") continue;
    const ext = extname(name) || name;
    if (TEXT_EXTENSIONS.has(ext)) out.push(full);
  }
}

function main(): void {
  const files: string[] = [];
  walk(ROOT, files);
  const problems = files.flatMap((f) => lintSource(relative(ROOT, f).replace(/\\/g, "/"), readFileSync(f, "utf8")));
  for (const p of problems) process.stderr.write(`${p.file}:${p.line}  ${p.message}\n`);
  process.stdout.write(`lint: ${files.length} files, ${problems.length} problem${problems.length === 1 ? "" : "s"}\n`);
  process.exitCode = problems.length === 0 ? 0 : 1;
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop()!)) main();
