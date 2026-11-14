/**
 * Provider (company) identity for an OpenRouter model id such as "deepseek/deepseek-v4.1-flash".
 * Logos live in public/model-icons. Single-colour logos are flagged so they can be
 * inverted in dark mode.
 */

interface ProviderInfo {
  label: string;
  /** File name in public/model-icons, without extension */
  icon?: string;
  /** Logo is a single dark colour and needs inverting on dark backgrounds */
  mono?: boolean;
}

const PROVIDERS: Record<string, ProviderInfo> = {
  anthropic: { label: "Anthropic", icon: "claude-color" },
  openai: { label: "OpenAI", icon: "openai", mono: true },
  google: { label: "Google", icon: "gemini-color" },
  "x-ai": { label: "xAI", icon: "grok", mono: true },
  deepseek: { label: "DeepSeek", icon: "deepseek-color" },
  qwen: { label: "Qwen", icon: "qwen-color" },
  alibaba: { label: "Alibaba", icon: "alibaba-color" },
  "z-ai": { label: "Z.ai", icon: "zhipu-color" },
  meta: { label: "Meta", icon: "meta-color" },
  "meta-llama": { label: "Meta", icon: "meta-color" },
  minimax: { label: "MiniMax", icon: "minimax-color" },
  moonshotai: { label: "Moonshot AI", icon: "moonshot-color", mono: true },
  mistralai: { label: "Mistral", icon: "mistral-color" },
  nvidia: { label: "NVIDIA", icon: "nvidia-color" },
  cohere: { label: "Cohere", icon: "cohere-color" },
  amazon: { label: "Amazon", icon: "aws-color" },
  openrouter: { label: "OpenRouter", icon: "openrouter", mono: true },
  tencent: { label: "Tencent", icon: "tencent-color" },
  baidu: { label: "Baidu", icon: "baidu-color" },
  "bytedance-seed": { label: "ByteDance", icon: "bytedance-color" },
  bytedance: { label: "ByteDance", icon: "bytedance-color" },
  stepfun: { label: "StepFun", icon: "stepfun-color" },
  upstage: { label: "Upstage", icon: "upstage-color" },
  "ibm-granite": { label: "IBM", icon: "ibm", mono: true },
  fireworks: { label: "Fireworks", icon: "fireworks-color" },
  microsoft: { label: "Microsoft", icon: "microsoft-color" },
  perplexity: { label: "Perplexity", icon: "perplexity-color" },
  xiaomi: { label: "Xiaomi", icon: "xiaomimimo", mono: true },
  liquid: { label: "Liquid", icon: "liquid", mono: true },
  inception: { label: "Inception", icon: "inception", mono: true },
  nousresearch: { label: "Nous Research", icon: "nousresearch", mono: true },
  ai21: { label: "AI21", icon: "ai21", mono: true },
};

/** "deepseek/deepseek-v4.1-flash" -> "deepseek" */
export function providerSlug(modelId: string): string {
  if (modelId.split("|")[0] === "agent:codex") return "openai";
  if (modelId.split("|")[0] === "agent:claude-code") return "anthropic";
  return modelId.replace(/^~/, "").split("/")[0] ?? "";
}

export interface ResolvedProvider {
  slug: string;
  label: string;
  iconSrc: string | null;
  mono: boolean;
}

/**
 * @param modelName OpenRouter's display name, e.g. "DeepSeek: DeepSeek V4.1 Flash";
 *                  its prefix is used as the company label for providers we have no entry for.
 */
export function resolveProvider(modelId: string, modelName?: string): ResolvedProvider {
  const slug = providerSlug(modelId);
  const known = PROVIDERS[slug];
  const fromName = modelName?.match(/^([^:]{1,40}):\s+/)?.[1];
  return {
    slug,
    label: known?.label ?? fromName ?? slug,
    iconSrc: known?.icon ? `/model-icons/${known.icon}.svg` : null,
    mono: known?.mono ?? false,
  };
}
