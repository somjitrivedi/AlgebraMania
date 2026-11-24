# AlgebraMania

A computer algebra system with step-by-step solutions, written in TypeScript with SQLite storage.

Status: Phase 0 (foundation) and Phase 1 (expression trees, parser, printers) are done.

## Requirements

- Node.js 22 or newer
- Python 3 with SymPy, only to regenerate the reference fixtures

## Setup

```sh
npm install
npm run check
```

`npm run check` runs the typecheck, lint and test gates.

On machines where npm skips install scripts, approve and rebuild the native packages:

```sh
npm approve-scripts better-sqlite3 esbuild
npm rebuild better-sqlite3 esbuild
```

## Usage

```sh
npm run am -- parse "2x^2 - 3x + 1"
npm run am -- parse "sin(x)^2 + cos(x)^2 = 1" --format latex
npm run am -- history --limit 10
npm run am -- show 1
npm run am -- stats
```

| Command | What it does |
|---|---|
| `parse <expr>` | Parses and prints the expression as text, LaTeX, hash, size and tree. `--format text\|latex\|tree\|json\|all`, `--no-save` |
| `history` | Lists recent queries, newest first. `--limit n`, `--errors`, `--ok` |
| `show <id>` | Shows one stored query in full |
| `stats` | Shows query counts, distinct expressions and the most frequent ones |

Every parse is recorded in SQLite at `data/algebramania.db`. Set `ALGEBRAMANIA_DB` or pass `--db <path>` to use another file.

## Input language

| Feature | Examples |
|---|---|
| Arithmetic | `+ - * / ^`, `**` for power |
| Implicit multiplication | `2x`, `3(x + 1)`, `(x + 1)(x - 1)`, `x y`, `2sin(x)` |
| Precedence | `-x^2` is `-(x^2)`, `2^3^2` is `2^(3^2)`, `1/2x` is `(1/2)x` |
| Decimals | `0.5`, `.25`, `1.50` |
| Factorial | `5!`, `(n + 1)!` |
| Relations | `=`, `!=`, `<`, `<=`, `>`, `>=` (one per expression) |
| Constants | `pi`, `e`, `i`, `inf` (also `oo`) |
| Unicode | `π θ ∞ − × · ÷ ≤ ≥ ≠` |
| Functions | `sin cos tan cot sec csc`, `asin acos atan acot asec acsc`, `sinh cosh tanh coth sech csch`, `asinh acosh atanh`, `exp ln log(x) log(b, x) sqrt root(x, n) abs sign floor ceil factorial min max` |

Multi-letter names such as `xy` or `theta` are single symbols. Function names need parentheses: `sin x` is an error. Parse errors give the exact position:

```
error: "sin" is a function; write sin(...)
  2 + sin x
      ^^^
```

## Design

- **Expression trees** (`src/core/ast.ts`) are immutable and frozen. There are seven node types: `num`, `sym`, `add`, `mul`, `pow`, `call` and `rel`. Constructors flatten nested sums and products and do nothing else. Simplification is Phase 3.
- **Numbers** are kept as exact normalized numerals (strings), ready for the Phase 2 BigInt rationals.
- **Subtraction and division** are stored as `a + (-1)b` and `a * b^(-1)`, which is the canonical CAS form.
- **Equality and hashing** are structural. `keyOf` gives a deterministic key and `hashOf` a 56-bit hash. Both are memoized.
- **The text printer** is guaranteed to round-trip: `parse(toText(e))` is structurally equal to `e` for every tree. A property test checks this on 20,000+ random trees.
- **The LaTeX printer** produces `\frac`, `\sqrt`, `\sin^{2}`, `\log_{b}`, `\left|x\right|`, Greek letters and subscripts.
- **Storage** (`src/db`) uses versioned SQLite migrations. Identical trees are stored once with a hit count, and failed queries keep their error span.

## Testing

```sh
npm test
npm run reference
```

`npm run reference` regenerates `test/fixtures/reference-parse.json` from SymPy. It holds 150 handwritten inputs and 450 seeded random inputs, each evaluated at three points. The tests check that this parser computes the same values as SymPy at every point, which tests the parser against an independent implementation.

## Roadmap

| # | Phase | Status |
|---|---|---|
| 0 | Foundation | done |
| 1 | Expression trees, parser, printers | done |
| 2 | Exact arithmetic (BigInt rationals, BigFloat) | |
| 3 | Canonical simplification and rewrite rules | |
| 4 | Differentiation with steps | |
| 5 | Polynomial algebra and factoring | |
| 6 | Equation solving | |
| 7 | Heuristic integration with steps | |
| 8 | Risch-lite integration | |
| 9 | Web app | |
| 10 | Hardening, limits and series | |
