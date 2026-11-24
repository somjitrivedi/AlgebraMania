import { describe, expect, it } from "vitest";
import { findHashComments, findTsComments, lintSource } from "../tools/lint.js";

describe("lint", () => {
  it("finds line and block comments in TypeScript", () => {
    expect(findTsComments("const a = 1; // note\nconst b = 2;\n/* block */\n")).toEqual([1, 3]);
  });

  it("ignores comment markers inside strings, templates and regexes", () => {
    const source = [
      'const url = "http://example.com";',
      "const t = `a // b ${'/*'} c`;",
      "const r = /\\/\\/[/*]/g;",
      "const d = 4 / 2 / 1;",
      "const s = `${`//`}`;",
      "if (x) return /a\\/b/.test(y);",
      ""
    ].join("\n");
    expect(findTsComments(source)).toEqual([]);
  });

  it("finds hash comments in Python but not inside strings", () => {
    expect(findHashComments('x = "#not"\ny = 1  # yes\nz = """\n# inside\n"""\n')).toEqual([2]);
  });

  it("reports whitespace and line-ending problems", () => {
    const problems = lintSource("a.ts", "const a = 1;  \r\n\tconst b = 2;");
    expect(problems.map((p) => p.message).sort()).toEqual([
      "CR line ending (use LF only)",
      "missing final newline",
      "tab character",
      "trailing whitespace"
    ]);
  });

  it("allows a shebang line", () => {
    expect(lintSource("cli.ts", "#!/usr/bin/env node\nrun();\n")).toEqual([]);
  });
});
