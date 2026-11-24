import json
import math
import random
import sys
from pathlib import Path

import sympy
from sympy.parsing.sympy_parser import (
    convert_xor,
    factorial_notation,
    implicit_multiplication,
    parse_expr,
    standard_transformations,
)

ROOT = Path(__file__).resolve().parents[2]
CORPUS = ROOT / "tools" / "reference" / "corpus.json"
OUT = ROOT / "test" / "fixtures" / "reference-parse.json"

SEED = 20261124
RANDOM_CASES = 450
POINTS_PER_CASE = 3
SYMBOLS = ["x", "y", "z"]
FUNCTIONS = ["sin", "cos", "tan", "exp", "ln", "sqrt", "atan", "sinh", "cosh", "tanh", "abs"]

TRANSFORMS = standard_transformations + (implicit_multiplication, convert_xor, factorial_notation)

X, Y, Z = sympy.symbols("x y z")
LOCALS = {
    "x": X,
    "y": Y,
    "z": Z,
    "e": sympy.E,
    "pi": sympy.pi,
    "ln": sympy.log,
    "abs": sympy.Abs,
}


def sympy_parse(text):
    return parse_expr(text, local_dict=dict(LOCALS), transformations=TRANSFORMS)


def number(rng):
    roll = rng.random()
    if roll < 0.7:
        return str(rng.randint(1, 9))
    if roll < 0.9:
        return f"{rng.randint(0, 3)}.{rng.choice(['5', '25', '1', '75'])}"
    return str(rng.randint(10, 99))


def leaf(rng):
    roll = rng.random()
    if roll < 0.55:
        return rng.choice(SYMBOLS)
    if roll < 0.9:
        return number(rng)
    return rng.choice(["pi", "e"])


def wrap(text):
    return f"({text})"


def expression(rng, budget):
    if budget <= 0 or rng.random() < 0.18:
        return leaf(rng)
    kind = rng.choices(
        ["add", "sub", "mul", "div", "pow", "neg", "func", "coef", "juxt", "paren"],
        weights=[14, 12, 12, 9, 9, 6, 10, 9, 5, 4],
    )[0]
    half = budget - 1
    if kind == "add":
        return f"{expression(rng, half)} + {expression(rng, half)}"
    if kind == "sub":
        return f"{expression(rng, half)} - {expression(rng, half)}"
    if kind == "mul":
        return f"{expression(rng, half)}*{expression(rng, half)}"
    if kind == "div":
        return f"{expression(rng, half)}/{expression(rng, half)}"
    if kind == "pow":
        base = rng.choice([rng.choice(SYMBOLS), number(rng), wrap(expression(rng, half))])
        exponent = rng.choice(["2", "3", "-1", "-2", "0.5", "(1/2)", "(-1/3)", rng.choice(SYMBOLS), wrap(expression(rng, min(half, 1)))])
        sep = rng.choice(["^", "**"])
        return f"{base}{sep}{exponent}"
    if kind == "neg":
        return f"-{expression(rng, half)}"
    if kind == "func":
        return f"{rng.choice(FUNCTIONS)}({expression(rng, half)})"
    if kind == "coef":
        target = rng.choice([rng.choice(SYMBOLS), wrap(expression(rng, half)), f"{rng.choice(FUNCTIONS)}({expression(rng, half)})"])
        return f"{rng.randint(2, 9)}{target}"
    if kind == "juxt":
        return f"{wrap(expression(rng, half))}{rng.choice([wrap(expression(rng, half)), rng.choice(SYMBOLS)])}"
    return wrap(expression(rng, half))


def point(rng):
    return {name: round(rng.uniform(0.3, 1.7), 6) for name in SYMBOLS}


def real_number(value):
    if value.has(sympy.zoo, sympy.nan, sympy.oo, -sympy.oo):
        return False
    re_part, im_part = value.as_real_imag()
    try:
        return abs(float(im_part)) <= 1e-20 * max(1.0, abs(float(re_part)))
    except (TypeError, ValueError, OverflowError):
        return False


def every_subterm_real(expr):
    for node in sympy.preorder_traversal(expr):
        if node.is_Atom or not node.is_number:
            continue
        if not real_number(sympy.N(node, 30)):
            return False
    return True


def evaluate(expr, values):
    subs = {X: sympy.Float(values["x"], 30), Y: sympy.Float(values["y"], 30), Z: sympy.Float(values["z"], 30)}
    try:
        substituted = expr.subs(subs)
        if not every_subterm_real(substituted):
            return None
        result = sympy.N(substituted, 30)
    except (ZeroDivisionError, OverflowError, ValueError, TypeError, MemoryError, RecursionError):
        return None
    if result.has(sympy.zoo, sympy.nan, sympy.oo, -sympy.oo):
        return None
    if not result.is_number:
        return None
    re_part, im_part = result.as_real_imag()
    try:
        re_value = float(re_part)
        im_value = float(im_part)
    except (TypeError, ValueError, OverflowError):
        return None
    if abs(im_value) > 1e-20 * max(1.0, abs(re_value)):
        return None
    if not math.isfinite(re_value) or abs(re_value) > 1e12:
        return None
    return re_value


def build_case(rng, source, text, sympy_text):
    try:
        expr = sympy_parse(sympy_text)
    except Exception as error:
        print(f"skip {text!r}: sympy could not parse it ({error})", file=sys.stderr)
        return None
    points = [point(rng) for _ in range(POINTS_PER_CASE)]
    values = [evaluate(expr, p) for p in points]
    if all(v is None for v in values):
        return None
    return {"source": source, "input": text, "sympy": str(expr), "points": points, "values": values}


def main():
    rng = random.Random(SEED)
    cases = []
    for entry in json.loads(CORPUS.read_text(encoding="utf-8")):
        if isinstance(entry, str):
            text, sympy_text = entry, entry
        else:
            text, sympy_text = entry["input"], entry["sympy"]
        case = build_case(rng, "corpus", text, sympy_text)
        if case is not None:
            cases.append(case)
    seen = set()
    attempts = 0
    random_cases = 0
    while random_cases < RANDOM_CASES and attempts < RANDOM_CASES * 20:
        attempts += 1
        text = expression(rng, rng.randint(2, 6))
        if text in seen or len(text) > 160:
            continue
        seen.add(text)
        case = build_case(rng, "random", text, text)
        if case is not None:
            cases.append(case)
            random_cases += 1
    payload = {
        "generator": f"sympy {sympy.__version__}",
        "seed": SEED,
        "cases": cases,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, indent=1, ensure_ascii=False)
        handle.write("\n")
    corpus_count = sum(1 for c in cases if c["source"] == "corpus")
    print(f"wrote {len(cases)} cases ({corpus_count} corpus, {random_cases} random) to {OUT}")


if __name__ == "__main__":
    main()
