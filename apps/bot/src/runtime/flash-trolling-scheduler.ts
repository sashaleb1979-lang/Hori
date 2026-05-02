/**
 * Volna 4: Flash Trolling Scheduler
 *
 * Периодически выбирает случайное недавнее длинное сообщение в разрешённом
 * канале и реагирует: текстом (retort/question) или мемом.
 *
 * При отправке мема — записывает в Message table pseudo-message от бота
 * с content "[мем: <description>]" чтобы Хори видела контекст в следующем ответе.
 */

import type { TextChannel } from "discord.js";

import { MemeIndexer, type MemeCatalog } from "@hori/core";

import type { BotRuntime } from "../bootstrap";

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

let scheduled: ReturnType<typeof setTimeout> | null = null;
let memeIndexer: MemeIndexer | null = null;

export async function loadMemeIndexer(): Promise<MemeIndexer> {
  if (memeIndexer) return memeIndexer;
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const catalogPath = path.resolve(process.cwd(), "assets/memes/catalog.json");
    const raw = await fs.readFile(catalogPath, "utf-8");
    const catalog = JSON.parse(raw) as MemeCatalog;
    memeIndexer = new MemeIndexer(catalog);
  } catch {
    memeIndexer = new MemeIndexer({ version: 1, packName: "empty", items: [] });
  }
  return memeIndexer;
}

/**
 * Выбирает случайное недавнее сообщение из разрешённых каналов.
 * Критерии: не от бота, length >= minMessageLength, не старше 2ч.
 */
async function pickRandomEligibleMessage(runtime: BotRuntime, allowedChannels: string[], minLength: number) {
  const since = new Date(Date.now() - TWO_HOURS_MS);
  const botId = runtime.client.user?.id;

  const msgs = await runtime.prisma.message.findMany({
    where: {
      channelId: allowedChannels.length ? { in: allowedChannels } : undefined,
      createdAt: { gte: since },
      charCount: { gte: minLength },
      ...(botId ? { NOT: { userId: botId } } : {})
    },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  if (!msgs.length) return null;
  return msgs[Math.floor(Math.random() * msgs.length)];
}

async function ensureStoredUser(runtime: BotRuntime, userId: string, username: string, isBot = false) {
  await runtime.prisma.user.upsert({
    where: { id: userId },
    update: { username, isBot },
    create: { id: userId, username, isBot }
  }).catch(() => undefined);
}

async function persistBotTurn(
  runtime: BotRuntime,
  target: { id: string; guildId: string; channelId: string },
  botId: string,
  content: string,
  flags: Record<string, unknown>
) {
  const trimmed = content.trim();
  if (!trimmed) return;

  await ensureStoredUser(runtime, botId, runtime.client.user?.username ?? "Хори", true);
  const now = new Date();
  await runtime.prisma.message.create({
    data: {
      id: `flash-${flags.kind ?? "text"}-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
      guildId: target.guildId,
      channelId: target.channelId,
      userId: botId,
      content: trimmed,
      createdAt: now,
      replyToMessageId: target.id,
      charCount: trimmed.length,
      tokenEstimate: Math.ceil(trimmed.length / 4),
      flags: flags as never
    }
  }).catch(() => undefined);
}

async function dispatchAction(
  runtime: BotRuntime,
  target: { id: string; guildId: string; channelId: string },
  action: { kind: string; text?: string },
  botId: string
) {
  const channel = await runtime.client.channels.fetch(target.channelId).catch(() => null);
  if (!channel || !("send" in channel)) return;
  const textChannel = channel as TextChannel;

  if (action.kind === "meme") {
    const indexer = await loadMemeIndexer();
    const item = indexer.pickRandom();
    if (!item) return;

    // Отправить мем
    try {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const filePath = path.resolve(process.cwd(), item.filePath);
      await fs.access(filePath);
      await textChannel.send({ files: [filePath] });
    } catch {
      // Файл не найден или ошибка — отправляем описание текстом
      const sent = await textChannel.send(item.description ?? "👀").then(() => true).catch(() => false);
      if (!sent) return;
    }

    // Записать контекст в Message table
    const description = item.description ?? item.filePath;
    const pseudoContent = `[мем: ${description}]`;
    await persistBotTurn(runtime, target, botId, pseudoContent, { kind: "meme", mediaId: item.mediaId, flashTrolling: true });
    return;
  }

  // retort or question
  if (action.text) {
    const sent = await textChannel.send(action.text).then(() => true).catch(() => false);
    if (!sent) return;
    await persistBotTurn(runtime, target, botId, action.text, { kind: action.kind, flashTrolling: true });
  }
}

function scheduleNext(runtime: BotRuntime) {
  const cfg = runtime.flashTrolling.getConfig();
  const intervalMs = (cfg.intervalMinutes ?? 60) * 60_000;
  // ± 50% jitter
  const jitter = (Math.random() - 0.5) * intervalMs;
  const delay = Math.max(60_000, intervalMs + jitter);

  scheduled = setTimeout(() => tick(runtime), delay);
  if (scheduled && typeof scheduled === "object" && "unref" in scheduled) {
    (scheduled as NodeJS.Timeout).unref();
  }
}

async function tick(runtime: BotRuntime) {
  const cfg = runtime.flashTrolling.getConfig();
  if (!cfg.enabled) {
    scheduleNext(runtime);
    return;
  }

  const botId = runtime.client.user?.id;
  if (!botId) {
    scheduleNext(runtime);
    return;
  }

  try {
    const msg = await pickRandomEligibleMessage(runtime, cfg.channelAllowlist, cfg.minMessageLength);
    if (!msg) {
      scheduleNext(runtime);
      return;
    }

    const action = runtime.flashTrolling.pickAction();
    await dispatchAction(runtime, { id: msg.id, guildId: msg.guildId, channelId: msg.channelId }, action, botId);
  } catch {
    // silent — scheduler должен быть robust
  }

  scheduleNext(runtime);
}

export function startFlashTrollingScheduler(runtime: BotRuntime): void {
  if (scheduled) return; // already running
  scheduleNext(runtime);
}

export function stopFlashTrollingScheduler(): void {
  if (scheduled) {
    clearTimeout(scheduled);
    scheduled = null;
  }
}
