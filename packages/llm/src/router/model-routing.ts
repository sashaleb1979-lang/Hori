import type { AppEnv } from "@hori/config";

export const MODEL_ROUTING_SETTING_KEY = "llm.model_routing";
export const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";
export const OPENAI_EMBEDDING_DIMENSIONS = 768;

export const MODEL_ROUTING_SLOTS = [
  "classifier",
  "chat",
  "summary",
  "rewrite",
  "search",
  "analytics",
  "profile",
  "memory"
] as const;

export type ModelRoutingSlot = (typeof MODEL_ROUTING_SLOTS)[number];

export const MODEL_ROUTING_MODEL_IDS = [
  "gpt-4o-mini",
  "gpt-5-nano",
  "gpt-5-mini",
  "gpt-5.4-mini"
] as const;

export type ModelRoutingModelId = (typeof MODEL_ROUTING_MODEL_IDS)[number];

export type ModelRoutingSlots = Record<ModelRoutingSlot, string>;

export interface ModelRoutingPreset {
  label: string;
  description: string;
  slots?: ModelRoutingSlots;
}

const balancedOpenAiSlots: ModelRoutingSlots = {
  classifier: "gpt-5-nano",
  chat: "gpt-5-mini",
  summary: "gpt-5-mini",
  rewrite: "gpt-5-mini",
  search: "gpt-5.4-mini",
  analytics: "gpt-5.4-mini",
  profile: "gpt-5-mini",
  memory: "gpt-5-mini"
};

export const MODEL_ROUTING_PRESETS = {
  legacy_env: {
    label: "Legacy env",
    description: "Use OPENAI_CHAT_MODEL / OPENAI_SMART_MODEL or Ollama fast/smart env."
  },
  balanced_openai: {
    label: "Balanced OpenAI",
    description: "Best price/quality split for Hori.",
    slots: balancedOpenAiSlots
  },
  economy_openai: {
    label: "Economy OpenAI",
    description: "Avoids gpt-5.4-mini; cheaper for routine traffic.",
    slots: {
      classifier: "gpt-5-nano",
      chat: "gpt-5-mini",
      summary: "gpt-5-mini",
      rewrite: "gpt-5-mini",
      search: "gpt-5-mini",
      analytics: "gpt-5-mini",
      profile: "gpt-5-nano",
      memory: "gpt-5-nano"
    }
  },
  quality_openai: {
    label: "Quality OpenAI",
    description: "Uses gpt-5.4-mini for most visible reasoning and synthesis.",
    slots: {
      classifier: "gpt-5-nano",
      chat: "gpt-5.4-mini",
      summary: "gpt-5.4-mini",
      rewrite: "gpt-5-mini",
      search: "gpt-5.4-mini",
      analytics: "gpt-5.4-mini",
      profile: "gpt-5-mini",
      memory: "gpt-5-mini"
    }
  }
} as const satisfies Record<string, ModelRoutingPreset>;

export type ModelRoutingPresetName = keyof typeof MODEL_ROUTING_PRESETS;

export interface StoredModelRouting {
  preset: ModelRoutingPresetName;
  overrides?: Partial<Record<ModelRoutingSlot, ModelRoutingModelId>>;
}

export interface ResolvedModelRouting {
  provider: "openai" | "ollama";
  preset: ModelRoutingPresetName;
  source: "default" | "runtime_setting";
  slots: ModelRoutingSlots;
  overrides: Partial<Record<ModelRoutingSlot, ModelRoutingModelId>>;
  legacyFallback: {
    chat: string;
    smart: string;
  };
  embeddingModel: string;
  embeddingDimensions?: number;
  parseError?: string;
}

type ProviderAwareEnv = AppEnv & {
  LLM_PROVIDER?: string;
  OPENAI_CHAT_MODEL?: string;
  OPENAI_SMART_MODEL?: string;
  OPENAI_EMBED_MODEL?: string;
};

export function isModelRoutingSlot(value: string): value is ModelRoutingSlot {
  return MODEL_ROUTING_SLOTS.includes(value as ModelRoutingSlot);
}

export function isModelRoutingPresetName(value: string): value is ModelRoutingPresetName {
  return value in MODEL_ROUTING_PRESETS;
}

export function isModelRoutingModelId(value: string): value is ModelRoutingModelId {
  return MODEL_ROUTING_MODEL_IDS.includes(value as ModelRoutingModelId);
}

export function slotForIntent(intent: string): ModelRoutingSlot {
  switch (intent) {
    case "analytics":
      return "analytics";
    case "rewrite":
      return "rewrite";
    case "summary":
      return "summary";
    case "search":
      return "search";
    case "profile":
      return "profile";
    case "memory_write":
    case "memory_forget":
      return "memory";
    default:
      return "chat";
  }
}

export function defaultModelRoutingPresetForEnv(env: AppEnv): ModelRoutingPresetName {
  return getProvider(env) === "openai" ? "balanced_openai" : "legacy_env";
}

export function resolveModelRouting(env: AppEnv, rawStoredValue?: string | null): ResolvedModelRouting {
  const provider = getProvider(env);
  const legacyFallback = buildLegacyFallback(env);
  const defaultPreset = defaultModelRoutingPresetForEnv(env);
  const parsed = parseStoredModelRouting(rawStoredValue);
  const preset = provider === "openai" ? parsed.value?.preset ?? defaultPreset : "legacy_env";
  const baseSlots = buildPresetSlots(env, preset);
  const overrides = provider === "openai" ? parsed.value?.overrides ?? {} : {};
  const slots = { ...baseSlots, ...overrides };

  return {
    provider,
    preset,
    source: parsed.value ? "runtime_setting" : "default",
    slots,
    overrides,
    legacyFallback,
    embeddingModel: provider === "openai"
      ? OPENAI_EMBEDDING_MODEL
      : env.OLLAMA_EMBED_MODEL,
    embeddingDimensions: provider === "openai" ? OPENAI_EMBEDDING_DIMENSIONS : undefined,
    parseError: parsed.error
  };
}

export function serializeModelRouting(preset: ModelRoutingPresetName, overrides: Partial<Record<ModelRoutingSlot, ModelRoutingModelId>> = {}) {
  return JSON.stringify({ preset, overrides: sanitizeOverrides(overrides) } satisfies StoredModelRouting);
}

export function parseStoredModelRouting(rawStoredValue?: string | null): {
  value: StoredModelRouting | null;
  error?: string;
} {
  if (!rawStoredValue?.trim()) {
    return { value: null };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawStoredValue);
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : "invalid json" };
  }

  if (!parsed || typeof parsed !== "object") {
    return { value: null, error: "routing value is not an object" };
  }

  const record = parsed as Record<string, unknown>;
  const rawPreset = typeof record.preset === "string" ? record.preset : "";
  if (!isModelRoutingPresetName(rawPreset)) {
    return { value: null, error: `unsupported preset: ${rawPreset || "missing"}` };
  }

  return {
    value: {
      preset: rawPreset,
      overrides: sanitizeOverrides(record.overrides)
    }
  };
}

export function sanitizeOverrides(value: unknown): Partial<Record<ModelRoutingSlot, ModelRoutingModelId>> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const overrides: Partial<Record<ModelRoutingSlot, ModelRoutingModelId>> = {};

  for (const [slot, model] of Object.entries(value as Record<string, unknown>)) {
    if (isModelRoutingSlot(slot) && typeof model === "string" && isModelRoutingModelId(model)) {
      overrides[slot] = model;
    }
  }

  return overrides;
}

function buildPresetSlots(env: AppEnv, preset: ModelRoutingPresetName): ModelRoutingSlots {
  if (preset === "legacy_env") {
    const legacy = buildLegacyFallback(env);
    return {
      classifier: legacy.chat,
      chat: legacy.chat,
      summary: legacy.smart,
      rewrite: legacy.smart,
      search: legacy.smart,
      analytics: legacy.smart,
      profile: legacy.smart,
      memory: legacy.smart
    };
  }

  return { ...(MODEL_ROUTING_PRESETS[preset].slots ?? balancedOpenAiSlots) };
}

function buildLegacyFallback(env: AppEnv) {
  const providerEnv = env as ProviderAwareEnv;

  if (getProvider(env) === "openai") {
    return {
      chat: providerEnv.OPENAI_CHAT_MODEL ?? "gpt-4o-mini",
      smart: providerEnv.OPENAI_SMART_MODEL ?? "gpt-4o-mini"
    };
  }

  return {
    chat: env.OLLAMA_FAST_MODEL,
    smart: env.OLLAMA_SMART_MODEL
  };
}

function getProvider(env: AppEnv): "openai" | "ollama" {
  return (env as ProviderAwareEnv).LLM_PROVIDER === "openai" ? "openai" : "ollama";
}
