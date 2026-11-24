import { children, type Expr } from "../ast.js";

function label(e: Expr): string {
  switch (e.type) {
    case "num":
      return `num ${e.value}`;
    case "sym":
      return `sym ${e.name}`;
    case "call":
      return `call ${e.name}`;
    case "rel":
      return `rel ${e.op}`;
    default:
      return e.type;
  }
}

export function toTree(e: Expr): string {
  const lines: string[] = [label(e)];
  const walk = (node: Expr, prefix: string): void => {
    const kids = children(node);
    kids.forEach((kid, i) => {
      const last = i === kids.length - 1;
      lines.push(`${prefix}${last ? "└─ " : "├─ "}${label(kid)}`);
      walk(kid, prefix + (last ? "   " : "│  "));
    });
  };
  walk(e, "");
  return lines.join("\n");
}
