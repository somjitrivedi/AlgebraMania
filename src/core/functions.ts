export interface FunctionSpec {
  readonly name: string;
  readonly minArgs: number;
  readonly maxArgs: number;
  readonly latex: string | null;
  readonly operatorStyle: boolean;
}

function spec(name: string, latex: string | null, minArgs = 1, maxArgs = minArgs, operatorStyle = latex !== null): FunctionSpec {
  return Object.freeze({ name, minArgs, maxArgs, latex, operatorStyle });
}

const SPECS: readonly FunctionSpec[] = [
  spec("sin", "\\sin"),
  spec("cos", "\\cos"),
  spec("tan", "\\tan"),
  spec("cot", "\\cot"),
  spec("sec", "\\sec"),
  spec("csc", "\\csc"),
  spec("asin", "\\arcsin"),
  spec("acos", "\\arccos"),
  spec("atan", "\\arctan"),
  spec("acot", "\\operatorname{arccot}"),
  spec("asec", "\\operatorname{arcsec}"),
  spec("acsc", "\\operatorname{arccsc}"),
  spec("sinh", "\\sinh"),
  spec("cosh", "\\cosh"),
  spec("tanh", "\\tanh"),
  spec("coth", "\\coth"),
  spec("sech", "\\operatorname{sech}"),
  spec("csch", "\\operatorname{csch}"),
  spec("asinh", "\\operatorname{arsinh}"),
  spec("acosh", "\\operatorname{arcosh}"),
  spec("atanh", "\\operatorname{artanh}"),
  spec("exp", null),
  spec("ln", "\\ln"),
  spec("log", "\\log", 1, 2),
  spec("sqrt", null),
  spec("root", null, 2),
  spec("abs", null),
  spec("sign", "\\operatorname{sgn}"),
  spec("floor", null),
  spec("ceil", null),
  spec("factorial", null),
  spec("min", "\\min", 2, Number.POSITIVE_INFINITY),
  spec("max", "\\max", 2, Number.POSITIVE_INFINITY)
];

const BY_NAME = new Map(SPECS.map((s) => [s.name, s]));

const ALIASES = new Map<string, string>([
  ["arcsin", "asin"],
  ["arccos", "acos"],
  ["arctan", "atan"],
  ["arccot", "acot"],
  ["arcsec", "asec"],
  ["arccsc", "acsc"],
  ["arsinh", "asinh"],
  ["arcsinh", "asinh"],
  ["arcosh", "acosh"],
  ["arccosh", "acosh"],
  ["artanh", "atanh"],
  ["arctanh", "atanh"],
  ["sgn", "sign"],
  ["ceiling", "ceil"]
]);

export function resolveFunctionName(name: string): string | null {
  if (BY_NAME.has(name)) return name;
  return ALIASES.get(name) ?? null;
}

export function functionSpec(name: string): FunctionSpec | undefined {
  return BY_NAME.get(name);
}

export function allFunctions(): readonly FunctionSpec[] {
  return SPECS;
}

export function arityText(s: FunctionSpec): string {
  if (s.maxArgs === Number.POSITIVE_INFINITY) return `at least ${s.minArgs} arguments`;
  if (s.minArgs === s.maxArgs) return `${s.minArgs} argument${s.minArgs === 1 ? "" : "s"}`;
  return `${s.minArgs} to ${s.maxArgs} arguments`;
}
