import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluate } from "../src/core/numeric.js";
import { parse } from "../src/core/parser.js";

interface ReferenceCase {
  source: "corpus" | "random";
  input: string;
  sympy: string;
  points: Record<string, number>[];
  values: (number | null)[];
}

const fixture = JSON.parse(readFileSync(new URL("./fixtures/reference-parse.json", import.meta.url), "utf8")) as {
  generator: string;
  cases: ReferenceCase[];
};

function close(got: number, want: number): boolean {
  return Math.abs(got - want) <= 1e-9 * Math.max(1, Math.abs(want));
}

describe(`parser agrees with ${fixture.generator}`, () => {
  it("has a meaningful number of cases", () => {
    expect(fixture.cases.filter((c) => c.source === "corpus").length).toBeGreaterThanOrEqual(140);
    expect(fixture.cases.filter((c) => c.source === "random").length).toBeGreaterThanOrEqual(400);
  });

  for (const source of ["corpus", "random"] as const) {
    it(`evaluates every ${source} case to the SymPy value`, () => {
      const failures: string[] = [];
      let compared = 0;
      for (const c of fixture.cases.filter((k) => k.source === source)) {
        const e = parse(c.input);
        c.points.forEach((p, i) => {
          const want = c.values[i];
          if (want === null || want === undefined) return;
          compared++;
          const got = evaluate(e, p);
          if (!close(got, want)) failures.push(`${c.input}  [sympy: ${c.sympy}]  at ${JSON.stringify(p)}: got ${got}, want ${want}`);
        });
      }
      expect(failures).toEqual([]);
      expect(compared).toBeGreaterThan(source === "corpus" ? 350 : 1100);
    });
  }
});
