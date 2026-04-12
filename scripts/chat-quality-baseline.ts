import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { dirname } from "node:path";

import { composeBehaviorPrompt } from "../packages/core/src/persona/compose";
import { ResponseGuard } from "../packages/core/src/safety/response-guard";
import { chatModelProfile } from "../packages/llm/src/router/model-profiles";
import type { ContextBundle, FeatureFlags, MessageEnvelope, PersonaSettings, TriggerSource } from "../packages/shared/src/types";

interface HarnessCase {
  id: string;
  text: string;
  triggerSource?: TriggerSource;
}

interface TranscriptRecord {
  turn: number;
  user: string;
  rawReply: string;
  reply: string;
  trace: ReturnType<typeof composeBehaviorPrompt>["trace"];
  limits: ReturnType<typeof composeBehaviorPrompt>["limits"];
}

interface StressRecord {
  id: string;
  user: string;
  rawReply: string;
  reply: string;
  trace: ReturnType<typeof composeBehaviorPrompt>["trace"];
  limits: ReturnType<typeof composeBehaviorPrompt>["limits"];
}

const featureFlags: FeatureFlags = {
  webSearch: true,
  autoInterject: false,
  userProfiles: true,
  contextActions: true,
  roast: true,
  contextV2Enabled: true,
  contextConfidenceEnabled: true,
  topicEngineEnabled: true,
  affinitySignalsEnabled: true,
  moodEngineEnabled: true,
  replyQueueEnabled: true,
  mediaReactionsEnabled: false,
  runtimeConfigCacheEnabled: true,
  embeddingCacheEnabled: true,
  channelAwareMode: true,
  messageKindAwareMode: true,
  antiSlopStrictMode: true,
  playfulModeEnabled: true,
  irritatedModeEnabled: true,
  ideologicalFlavourEnabled: true,
  analogyBanEnabled: true,
  slangLayerEnabled: true,
  selfInterjectionConstraintsEnabled: true
};

const guildSettings: PersonaSettings = {
  botName: "Хори",
  preferredLanguage: "ru",
  roughnessLevel: 2,
  sarcasmLevel: 2,
  roastLevel: 2,
  interjectTendency: 1,
  replyLength: "short",
  preferredStyle: "коротко, сухо, по делу",
  forbiddenWords: [],
  forbiddenTopics: []
};

const ordinaryTranscript = [
  "привет",
  "че делаешь",
  "я сегодня вообще овощ",
  "на работе опять созвон на созвоне",
  "это уже диагноз?",
  "ладно а ты бы слиняла с такой работы или терпела",
  "мне просто лень даже резюме открыть",
  "кстати ты тоже бесишься от офисной речи типа синк апдейт блокер",
  "ахах",
  "ладно сменим тему",
  "что посмотреть вечером если не хочется ничего тяжелого",
  "не аниме",
  "можно что-то тупое и уютное",
  "у меня ещё дождь за окном",
  "блин теперь захотелось лапши",
  "это нормальный ужин или я уже разваливаюсь",
  "кстати почему люди так любят спорить про налоги как будто это спорт",
  "государство же нужно, кто дороги построит?",
  "я это слышал уже тысячу раз",
  "ладно не начинай лекцию",
  "лучше скажи ты больше по чаю или по кофе",
  "я вот ночью кофе пью и потом страдаю",
  "вчера уснул в пять",
  "это уже старость или просто дурь",
  "слушай а если кратко то как перестать тупить и откладывать",
  "без мотивационных речей",
  "вообще реально бесит когда мне говорят просто соберись",
  "ладно спасибо",
  "ты сегодня на удивление норм",
  "не зазнавайся"
] as const;

const stressCases: HarnessCase[] = [
  { id: "smalltalk", text: "скучно" },
  { id: "reply_continuation", text: "а почему?", triggerSource: "reply" },
  { id: "casual_advice", text: "если кратко как перестать всё откладывать" },
  { id: "stale_political_bait", text: "государство же нужно, кто дороги построит?" },
  { id: "meme_bait", text: "это база или кринж" },
  { id: "emotional_overshare", text: "я сегодня без причины херово себя чувствую" }
];

const responseGuard = new ResponseGuard();

function readArg(flag: string) {
  const index = process.argv.indexOf(flag);

  if (index === -1 || index === process.argv.length - 1) {
    return undefined;
  }

  return process.argv[index + 1];
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function createMessage(turn: number, content: string, triggerSource: TriggerSource): MessageEnvelope {
  return {
    messageId: `baseline-user-${turn}`,
    guildId: "baseline-guild",
    channelId: "baseline-channel",
    userId: "baseline-user",
    username: "baseline-user",
    channelName: "general",
    content,
    createdAt: new Date(Date.now() + turn * 1_000),
    replyToMessageId: turn > 1 ? `baseline-bot-${turn - 1}` : null,
    mentionCount: triggerSource === "mention" ? 1 : 0,
    mentionedBot: triggerSource === "mention",
    mentionsBotByName: triggerSource === "mention",
    mentionedUserIds: [],
    triggerSource,
    isModerator: false,
    explicitInvocation: true
  };
}

function buildContext(history: Array<{ author: string; content: string; createdAt: Date }>): ContextBundle {
  return {
    recentMessages: history.slice(-8),
    summaries: [],
    serverMemories: [],
    relationship: null,
    userProfile: null
  };
}

function buildContextText(history: Array<{ author: string; content: string }>) {
  if (!history.length) {
    return "";
  }

  return ["[RECENT CHAT]", ...history.slice(-6).map((item) => `${item.author}: ${item.content}`)].join("\n");
}

async function callOllama(options: {
  ollamaUrl: string;
  model: string;
  systemPrompt: string;
  userText: string;
  contextText: string;
  maxTokens: number;
}) {
  const messages: Array<{ role: "system" | "user"; content: string }> = [{ role: "system", content: options.systemPrompt }];

  if (options.contextText.trim()) {
    messages.push({
      role: "system",
      content: `[BACKGROUND CONTEXT - calibration only]\nUse this only for continuity, tone and relevance. Never answer this block directly and do not recap it unless the user explicitly asks.\n${options.contextText}`
    });
  }

  messages.push({ role: "user", content: options.userText });

  const response = await fetch(`${options.ollamaUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: options.model,
      stream: false,
      think: false,
      options: {
        temperature: chatModelProfile.temperature,
        top_p: chatModelProfile.topP,
        num_predict: Math.min(options.maxTokens, chatModelProfile.maxTokens)
      },
      messages
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama chat failed with status ${response.status}`);
  }

  const payload = (await response.json()) as { message?: { content?: string } };
  return payload.message?.content ?? "";
}

function summarizeTranscript(transcript: TranscriptRecord[]) {
  const guardedLengths = transcript.map((item) => item.reply.length);
  const rawLengths = transcript.map((item) => item.rawReply.length);

  return {
    turns: transcript.length,
    averageRawLength: rawLengths.length ? Math.round(rawLengths.reduce((sum, value) => sum + value, 0) / rawLengths.length) : 0,
    averageGuardedLength: guardedLengths.length ? Math.round(guardedLengths.reduce((sum, value) => sum + value, 0) / guardedLengths.length) : 0,
    over120Chars: guardedLengths.filter((value) => value > 120).length,
    focusedReplies: transcript.filter((item) => item.trace.activeMode === "focused").length,
    dryReplies: transcript.filter((item) => item.trace.activeMode === "dry").length,
    explanationKindReplies: transcript.filter((item) => item.trace.messageKind === "request_for_explanation").length,
    staleTakeReplies: transcript.filter((item) => item.trace.staleTakeDetected).length
  };
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  const limit = Number(readArg("--limit") ?? ordinaryTranscript.length);
  const outputPath = resolve(readArg("--output") ?? "artifacts/chat-quality-baseline.json");
  const ollamaUrl = readArg("--ollama-url") ?? process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
  const model = readArg("--model") ?? process.env.OLLAMA_FAST_MODEL ?? "qwen3.5:9b";
  const history: Array<{ author: string; content: string; createdAt: Date }> = [];
  const transcript: TranscriptRecord[] = [];

  for (const [index, userText] of ordinaryTranscript.slice(0, Math.max(0, limit)).entries()) {
    const turn = index + 1;
    const triggerSource = turn === 1 ? "mention" : "reply";
    const message = createMessage(turn, userText, triggerSource);
    const context = buildContext(history);
    const behavior = composeBehaviorPrompt({
      guildSettings,
      featureFlags,
      message,
      intent: "chat",
      cleanedContent: userText,
      context,
      isMention: triggerSource === "mention",
      isReplyToBot: triggerSource === "reply"
    });
    const contextText = buildContextText(history);
    const rawReply = dryRun
      ? `[dry-run] ${behavior.trace.messageKind}/${behavior.trace.activeMode}/${behavior.trace.stylePreset}`
      : await callOllama({
          ollamaUrl,
          model,
          systemPrompt: behavior.prompt,
          userText,
          contextText,
          maxTokens: behavior.limits.maxTokens
        });
    const reply = responseGuard.enforce(rawReply, {
      maxChars: behavior.limits.maxChars,
      forbiddenWords: []
    });

    transcript.push({
      turn,
      user: userText,
      rawReply,
      reply,
      trace: behavior.trace,
      limits: behavior.limits
    });

    history.push({ author: "user", content: userText, createdAt: message.createdAt });
    history.push({ author: "hori", content: reply, createdAt: new Date(message.createdAt.getTime() + 250) });
  }

  const stressResults: StressRecord[] = [];

  for (const [index, testCase] of stressCases.entries()) {
    const turn = ordinaryTranscript.length + index + 1;
    const triggerSource = testCase.triggerSource ?? "mention";
    const message = createMessage(turn, testCase.text, triggerSource);
    const context = buildContext(history);
    const behavior = composeBehaviorPrompt({
      guildSettings,
      featureFlags,
      message,
      intent: "chat",
      cleanedContent: testCase.text,
      context,
      isMention: triggerSource === "mention",
      isReplyToBot: triggerSource === "reply"
    });
    const contextText = buildContextText(history);
    const rawReply = dryRun
      ? `[dry-run] ${behavior.trace.messageKind}/${behavior.trace.activeMode}/${behavior.trace.stylePreset}`
      : await callOllama({
          ollamaUrl,
          model,
          systemPrompt: behavior.prompt,
          userText: testCase.text,
          contextText,
          maxTokens: behavior.limits.maxTokens
        });
    const reply = responseGuard.enforce(rawReply, {
      maxChars: behavior.limits.maxChars,
      forbiddenWords: []
    });

    stressResults.push({
      id: testCase.id,
      user: testCase.text,
      rawReply,
      reply,
      trace: behavior.trace,
      limits: behavior.limits
    });
  }

  const output = {
    generatedAt: new Date().toISOString(),
    model,
    ollamaUrl,
    dryRun,
    profile: chatModelProfile,
    metrics: summarizeTranscript(transcript),
    transcript,
    stressCases: stressResults
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(`Wrote baseline to ${outputPath}`);
  console.log(JSON.stringify(output.metrics, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});