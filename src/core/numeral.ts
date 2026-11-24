import { AstError } from "./errors.js";

const NUMERAL = /^(-?)(\d*)(?:\.(\d*))?$/;

export function normalizeNumeral(raw: string): string {
  const match = NUMERAL.exec(raw);
  if (match === null) throw new AstError(`invalid numeral "${raw}"`);
  const sign = match[1] ?? "";
  const whole = match[2] ?? "";
  const fraction = match[3];
  if (whole === "" && (fraction === undefined || fraction === "")) throw new AstError(`invalid numeral "${raw}"`);
  if (fraction === "") throw new AstError(`invalid numeral "${raw}"`);
  const intPart = whole.replace(/^0+/, "") || "0";
  if (fraction === undefined) return intPart === "0" ? "0" : sign + intPart;
  const fracPart = fraction.replace(/0+$/, "") || "0";
  const isZero = intPart === "0" && fracPart === "0";
  return (isZero ? "" : sign) + intPart + "." + fracPart;
}

export function isIntegerNumeral(value: string): boolean {
  return !value.includes(".");
}

export function isNegativeNumeral(value: string): boolean {
  return value.startsWith("-");
}

export function negateNumeral(value: string): string {
  if (value.startsWith("-")) return value.slice(1);
  if (value === "0" || value === "0.0") return value;
  return "-" + value;
}
