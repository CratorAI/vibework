/**
 * Model ids shown in the "Recommended" group at the top of the model picker,
 * in display order. Ids missing from the live OpenRouter list are skipped.
 *
 * From the November 2026 evaluation (five real tasks per model, in Auto):
 * open-weight models only, plain variants rather than priority-priced ones.
 * Every other model stays in the full list below.
 */
export const RECOMMENDED_MODEL_IDS: readonly string[] = [
  "deepseek/deepseek-v4.1-flash",
  "deepseek/deepseek-v4-pro-0813",
  "z-ai/glm-5.3",
  "moonshotai/kimi-k3.1-pro",
];

/**
 * One plain-language line per recommended model: what it is good for. The
 * price tier is added from the live list (see `priceTier`), so it stays true.
 */
export const RECOMMENDED_MODEL_NOTES: Readonly<Record<string, string>> = {
  "deepseek/deepseek-v4.1-flash": "Fast and cheap, the default",
  "deepseek/deepseek-v4-pro-0813": "For harder jobs",
  "z-ai/glm-5.3": "Multi-step file work; can’t read images",
  "moonshotai/kimi-k3.1-pro": "Polished results; slower and costlier",
};

/**
 * "Low cost" / "Mid cost" / "Higher cost" from the per-million prices,
 * weighting input three to one over output (agents read far more than they
 * write). Null when a price is unknown.
 */
export function priceTier(promptPrice: number | null, completionPrice: number | null): string | null {
  if (promptPrice == null || completionPrice == null) return null;
  if (promptPrice === 0 && completionPrice === 0) return "Free";
  const blended = (promptPrice * 3 + completionPrice) / 4;
  if (blended < 0.5) return "Low cost";
  if (blended < 3.5) return "Mid cost";
  return "Higher cost";
}
