import type { Guild } from "discord.js";

import type { BotRuntime } from "../bootstrap";

const SESSION_SLEEP_SYNC_INTERVAL_MS = 60_000;

const desiredNicknameByGuild = new Map<string, string>();

let scheduled: ReturnType<typeof setTimeout> | null = null;

async function resolveDefaultBotName(runtime: BotRuntime, guildId: string) {
  const guildConfig = await runtime.prisma.guild.findUnique({
    where: { id: guildId },
    select: { botName: true }
  }).catch(() => null);

  return guildConfig?.botName?.trim()
    || runtime.client.user?.globalName
    || runtime.client.user?.username
    || "Хори";
}

export async function syncGuildNickname(runtime: BotRuntime, guild: Guild, desiredName: string) {
  if (!runtime.client.user || desiredNicknameByGuild.get(guild.id) === desiredName) {
    return;
  }

  try {
    const me = guild.members.me ?? await guild.members.fetchMe();
    const effectiveName = me.nickname ?? runtime.client.user.globalName ?? runtime.client.user.username;
    if (effectiveName === desiredName) {
      desiredNicknameByGuild.set(guild.id, desiredName);
      return;
    }

    await me.setNickname(desiredName);
    desiredNicknameByGuild.set(guild.id, desiredName);
  } catch (error) {
    runtime.logger.warn(
      { guildId: guild.id, desiredName, error },
      "failed to sync bot nickname for session sleep"
    );
  }
}

export async function syncGuildSleepNickname(runtime: BotRuntime, guild: Guild) {
  const sleepUntil = await runtime.sessionBuffer.getGuildSleepUntil(guild.id).catch(() => null);
  const desiredName = sleepUntil ? "спит" : await resolveDefaultBotName(runtime, guild.id);
  await syncGuildNickname(runtime, guild, desiredName);
}

async function tick(runtime: BotRuntime) {
  try {
    await Promise.allSettled(
      [...runtime.client.guilds.cache.values()].map((guild) => syncGuildSleepNickname(runtime, guild))
    );
  } finally {
    scheduleNext(runtime);
  }
}

function scheduleNext(runtime: BotRuntime) {
  scheduled = setTimeout(() => {
    void tick(runtime);
  }, SESSION_SLEEP_SYNC_INTERVAL_MS);

  if (scheduled && typeof scheduled === "object" && "unref" in scheduled) {
    scheduled.unref();
  }
}

export function startSessionSleepSync(runtime: BotRuntime) {
  if (scheduled) {
    return;
  }

  scheduleNext(runtime);
}

export function stopSessionSleepSync() {
  if (scheduled) {
    clearTimeout(scheduled);
    scheduled = null;
  }

  desiredNicknameByGuild.clear();
}