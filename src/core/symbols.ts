export const CONSTANTS: ReadonlyMap<string, string> = new Map([
  ["pi", "\\pi"],
  ["e", "e"],
  ["i", "i"],
  ["inf", "\\infty"]
]);

export const GREEK: ReadonlyMap<string, string> = new Map(
  [
    "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa", "lambda",
    "mu", "nu", "xi", "rho", "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega",
    "Gamma", "Delta", "Theta", "Lambda", "Xi", "Sigma", "Phi", "Psi", "Omega"
  ].map((name) => [name, `\\${name}`])
);

export const UNICODE_IDENTIFIERS: ReadonlyMap<string, string> = new Map([
  ["π", "pi"],
  ["∞", "inf"],
  ["α", "alpha"],
  ["β", "beta"],
  ["γ", "gamma"],
  ["δ", "delta"],
  ["ε", "epsilon"],
  ["θ", "theta"],
  ["λ", "lambda"],
  ["μ", "mu"],
  ["σ", "sigma"],
  ["τ", "tau"],
  ["φ", "phi"],
  ["ω", "omega"]
]);

export const IDENTIFIER_ALIASES: ReadonlyMap<string, string> = new Map([
  ["oo", "inf"],
  ["infinity", "inf"]
]);
