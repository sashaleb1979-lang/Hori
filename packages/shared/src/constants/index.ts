export const QUEUE_NAMES = {
  summary: "summary.generate",
  profile: "profile.refresh",
  embedding: "embedding.generate",
  cleanup: "cleanup.execute",
  searchCache: "search-cache.cleanup"
} as const;

export const CONTEXT_ACTIONS = {
  explain: "Хори: объясни",
  summarize: "Хори: кратко",
  tone: "Хори: оценить тон"
} as const;

export const SLASH_COMMANDS = [
  "bot-help",
  "bot-style",
  "bot-memory",
  "bot-relationship",
  "bot-feature",
  "bot-debug",
  "bot-profile",
  "bot-channel",
  "bot-summary",
  "bot-stats"
] as const;

export const HALF_HOUR_MS = 30 * 60 * 1000;
