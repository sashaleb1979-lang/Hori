import type { Job } from "bullmq";
import type { WorkerRuntime } from "../index";

/**
 * Conversation Analysis Job
 *
 * Запускается через ~1 час после последнего сообщения юзера в гильдии.
 * Анализирует последний разговор с юзером:
 * 1. Формирует/обновляет биографические заметки (UserMemoryNote)
 * 2. Корректирует отношения (RelationshipProfile) на основе тона диалога
 * 3. Обновляет профиль пользователя, если нужна доработка
 *
 * Использует GPT-5-nano (самая дешёвая модель) для анализа.
 */

interface ConversationAnalysisPayload {
  guildId: string;
  userId: string;
  channelId: string;
  lastMessageAt: string;
}

const ANALYSIS_WINDOW_MESSAGES = 30;
const MAX_BIO_NOTES_PER_USER = 20;

function buildAnalysisPrompt(messages: Array<{ author: string; content: string; isBot: boolean }>, existingBio: string[], existingRelationship: string | null) {
  const chatLog = messages
    .map((m) => `[${m.isBot ? "Хори" : m.author}] ${m.content}`)
    .join("\n");

  const bioSection = existingBio.length
    ? `Текущие заметки о юзере:\n${existingBio.map((n, i) => `${i + 1}. ${n}`).join("\n")}`
    : "Заметок о юзере пока нет.";

  const relSection = existingRelationship
    ? `Текущее отношение: ${existingRelationship}`
    : "Отношение к юзеру: дефолтное (neutral).";

  return [
    {
      role: "system" as const,
      content: [
        "Ты аналитический модуль Хори. Твоя задача — проанализировать диалог и вернуть JSON.",
        "",
        "Правила:",
        "- Анализируй ТОЛЬКО факты из диалога, не выдумывай",
        "- Биографические заметки: краткие факты о юзере (интересы, привычки, факты из жизни, стиль общения)",
        "- Каждая заметка — одно предложение, максимум",
        "- Не дублируй уже существующие заметки",
        "- Отношение: оцени как диалог повлиял на tone_bias (neutral/friendly/sharp), closeness_delta (-0.1..+0.1), trust_delta (-0.1..+0.1)",
        "- Если диалог скучный/пустой — верни пустые массивы и нулевые дельты",
        "",
        bioSection,
        relSection
      ].join("\n")
    },
    {
      role: "user" as const,
      content: [
        "Диалог:",
        chatLog,
        "",
        'Ответь JSON: { "new_notes": ["заметка1", ...], "remove_notes": ["текст устаревшей заметки (как в списке выше)", ...], "relationship_update": { "tone_bias": "neutral"|"friendly"|"sharp"|null, "closeness_delta": number, "trust_delta": number, "familiarity_delta": number }, "summary": "одно предложение о сути диалога" }'
      ].join("\n")
    }
  ];
}

interface AnalysisResult {
  new_notes: string[];
  remove_notes: string[];
  relationship_update: {
    tone_bias: string | null;
    closeness_delta: number;
    trust_delta: number;
    familiarity_delta: number;
  };
  summary: string;
}

export function createConversationAnalysisJob(runtime: WorkerRuntime) {
  return async (job: Job<ConversationAnalysisPayload>) => {
    const { guildId, userId, channelId } = job.data;

    // 1. Fetch recent messages between bot and user
    const messages = await runtime.prisma.message.findMany({
      where: {
        guildId,
        channelId,
        OR: [
          { userId },
          { user: { isBot: true } }
        ]
      },
      orderBy: { createdAt: "desc" },
      take: ANALYSIS_WINDOW_MESSAGES,
      include: { user: true }
    });

    if (messages.length < 3) {
      runtime.logger.debug({ guildId, userId }, "conversation-analysis: too few messages, skipping");
      return;
    }

    const chatMessages = messages.reverse().map((m) => ({
      author: m.user.globalName || m.user.username || m.userId,
      content: m.content,
      isBot: m.user.isBot
    }));

    // 2. Fetch existing bio notes
    const existingNotes = await runtime.prisma.userMemoryNote.findMany({
      where: { guildId, userId, active: true },
      orderBy: { createdAt: "desc" },
      take: MAX_BIO_NOTES_PER_USER
    });

    // 3. Fetch existing relationship
    const relationship = await runtime.prisma.relationshipProfile.findUnique({
      where: { guildId_userId: { guildId, userId } }
    });

    const existingBio = existingNotes.map((n) => n.value);
    const existingRel = relationship
      ? `tone=${relationship.toneBias}, closeness=${relationship.closeness}, trust=${relationship.trustLevel}, familiarity=${relationship.familiarity}`
      : null;

    // 4. Call LLM (gpt-5-nano — cheapest)
    const runtimeSettings = await runtime.runtimeConfig.getRuntimeSettings();
    const model = runtime.modelRouter.pickModelForSlot("analytics", runtimeSettings.modelRouting);

    const prompt = buildAnalysisPrompt(chatMessages, existingBio, existingRel);

    let result: AnalysisResult;
    try {
      const response = await runtime.llmClient.chat({
        model,
        messages: prompt,
        format: "json",
        maxTokens: 400
      });

      const raw = response.message.content.trim();
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      result = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw);
    } catch (error) {
      runtime.logger.warn({ error, guildId, userId }, "conversation-analysis: LLM parse failed");
      return;
    }

    // 5. Write new bio notes
    if (result.new_notes?.length) {
      for (const note of result.new_notes.slice(0, 5)) {
        const key = `bio:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`;
        await runtime.prisma.userMemoryNote.create({
          data: {
            guildId,
            userId,
            key,
            value: note.slice(0, 500),
            source: "conversation_analysis",
            active: true
          }
        });
      }
    }

    // 6. Remove outdated notes (LLM returns note text, match by value)
    if (result.remove_notes?.length) {
      for (const noteText of result.remove_notes.slice(0, 3)) {
        await runtime.prisma.userMemoryNote.updateMany({
          where: { guildId, userId, value: { contains: noteText.slice(0, 100) }, active: true },
          data: { active: false }
        });
      }
    }

    // 7. Update relationship deltas
    const update = result.relationship_update;
    if (update && relationship) {
      const newCloseness = clamp((relationship.closeness ?? 0.5) + (update.closeness_delta || 0), 0, 1);
      const newTrust = clamp((relationship.trustLevel ?? 0.5) + (update.trust_delta || 0), 0, 1);
      const newFamiliarity = clamp((relationship.familiarity ?? 0.5) + (update.familiarity_delta || 0), 0, 1);

      await runtime.prisma.relationshipProfile.update({
        where: { guildId_userId: { guildId, userId } },
        data: {
          ...(update.tone_bias ? { toneBias: update.tone_bias } : {}),
          closeness: newCloseness,
          trustLevel: newTrust,
          familiarity: newFamiliarity,
          interactionCount: { increment: 1 }
        }
      });
    } else if (update && !relationship) {
      // Create relationship if it doesn't exist
      await runtime.prisma.relationshipProfile.create({
        data: {
          guildId,
          userId,
          toneBias: update.tone_bias || "neutral",
          roastLevel: 0,
          praiseBias: 0,
          interruptPriority: 0,
          doNotMock: false,
          doNotInitiate: false,
          protectedTopics: [],
          closeness: clamp(0.5 + (update.closeness_delta || 0), 0, 1),
          trustLevel: clamp(0.5 + (update.trust_delta || 0), 0, 1),
          familiarity: clamp(0.5 + (update.familiarity_delta || 0), 0, 1),
          interactionCount: 1
        }
      });
    }

    // 8. Invalidate Redis cache for this user
    try {
      await Promise.allSettled([
        runtime.redis.del(`ctx:profile:${guildId}:${userId}`),
        runtime.redis.del(`ctx:rel:${guildId}:${userId}`)
      ]);
    } catch { /* redis may be unavailable in local mode */ }

    runtime.logger.info(
      {
        guildId,
        userId,
        newNotes: result.new_notes?.length ?? 0,
        removedNotes: result.remove_notes?.length ?? 0,
        toneBias: update?.tone_bias,
        summary: result.summary
      },
      "conversation-analysis: completed"
    );
  };
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
