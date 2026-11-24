import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { run, type Io } from "../src/commands.js";

let dir = "";
let db = "";

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "algebramania-cli-"));
  db = join(dir, "am.db");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function exec(...argv: string[]): { code: number; out: string; err: string } {
  const out: string[] = [];
  const err: string[] = [];
  const io: Io = { out: (l) => out.push(l), err: (l) => err.push(l) };
  const code = run(argv, io, { ALGEBRAMANIA_DB: db });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

describe("am parse", () => {
  it("prints every view by default and saves the query", () => {
    const r = exec("parse", "2x^2 - 3x + 1");
    expect(r.code).toBe(0);
    expect(r.out).toContain("text   2x^2 - 3x + 1");
    expect(r.out).toContain("latex  2 x^{2} - 3 x + 1");
    expect(r.out).toMatch(/hash {3}[0-9a-f]{14}/);
    expect(r.out).toContain("nodes  10  depth 4");
    expect(r.out).toContain("saved  query #1");
    expect(r.out).toContain("  add");
  });

  it("joins unquoted words and keeps leading minus signs as input", () => {
    expect(exec("parse", "-x", "+", "1", "--format", "text").out).toBe("-x + 1");
    expect(exec("parse", "--format=latex", "--", "--x").out).toBe("x");
  });

  it.each([
    ["text", "x/y"],
    ["latex", "\\frac{x}{y}"],
    ["json", '{"type":"mul","factors":[{"type":"sym","name":"x"},{"type":"pow","base":{"type":"sym","name":"y"},"exp":{"type":"num","value":"-1"}}]}'],
    ["tree", "mul\n├─ sym x\n└─ pow\n   ├─ sym y\n   └─ num -1"]
  ])("supports --format %s", (format, want) => {
    expect(exec("parse", "x/y", "--format", format).out).toBe(want);
  });

  it("reports parse errors with a caret and exit code 1, and records them", () => {
    const r = exec("parse", "2 + sin x");
    expect(r.code).toBe(1);
    expect(r.err).toBe(['error: "sin" is a function; write sin(...)', "  2 + sin x", "      ^^^"].join("\n"));
    expect(exec("history", "--errors").out).toContain('!! "sin" is a function');
  });

  it("can skip saving", () => {
    exec("parse", "x", "--no-save");
    expect(exec("history").out).toBe("no queries recorded yet");
  });

  it("rejects bad usage with exit code 2", () => {
    expect(exec("parse").code).toBe(2);
    expect(exec("parse", "x", "--format", "pdf").err).toContain('unknown format "pdf"');
    expect(exec("frobnicate").err).toContain('unknown command "frobnicate"');
    expect(exec("history", "--limit", "0").code).toBe(2);
    expect(exec("parse", "x", "--db").err).toContain("--db needs a value");
  });
});

describe("am history, show, stats", () => {
  it("lists, shows and summarizes stored queries", () => {
    exec("parse", "x^2");
    exec("parse", "x ^ 2");
    exec("parse", "(");
    const history = exec("history", "--limit", "2");
    expect(history.out.split("\n")).toHaveLength(2);
    expect(history.out).toContain("#3     err  (  !! ");
    expect(history.out).toContain("#2     ok   x ^ 2  => x^2");

    const shown = exec("show", "1");
    expect(shown.code).toBe(0);
    expect(shown.out).toContain("input    x^2");
    expect(shown.out).toContain("latex    x^{2}");
    expect(shown.out).toContain("seen 2x");

    const failed = exec("show", "3");
    expect(failed.out).toContain("error: unexpected end of input; expected an operand");

    expect(exec("show", "99")).toMatchObject({ code: 1, err: "error: no query #99" });
    expect(exec("show", "abc").code).toBe(2);

    const stats = exec("stats");
    expect(stats.out).toContain("queries      3 (2 ok, 1 failed)");
    expect(stats.out).toContain("expressions  1 distinct");
    expect(stats.out).toContain("     2x  x^2");
  });

  it("prints help", () => {
    expect(exec("help").out).toContain("usage:");
    expect(exec().code).toBe(0);
  });
});
