export const QUEUE_NAMES = {
  summary: "summary.generate",
  sessionCompaction: "session.compact",
  profile: "profile.refresh",
  embedding: "embedding.generate",
  topic: "topic.update",
  session: "session.evaluate",
  memoryFormation: "memory.formation",
  cleanup: "cleanup.execute",
  searchCache: "search-cache.cleanup",
  conversationAnalysis: "conversation.analyze"
} as const;

export const CONTEXT_ACTIONS = {
  explain: "Хори: объясни",
  summarize: "Хори: кратко",
  tone: "Хори: оценить тон",
  rememberMoment: "Хори: запомнить момент"
} as const;

export const SLASH_COMMANDS = [
  "bot-help",
  "bot-style",
  "bot-memory",
  "bot-album",
  "bot-relationship",
  "bot-feature",
  "bot-debug",
  "bot-profile",
  "bot-channel",
  "bot-summary",
  "bot-stats",
  "bot-topic",
  "bot-mood",
  "bot-queue",
  "bot-reflection",
  "bot-media",
  "bot-ai-url",
  "bot-lockdown",
  "bot-import",
  "hori"
] as const;

export const HALF_HOUR_MS = 30 * 60 * 1000;
