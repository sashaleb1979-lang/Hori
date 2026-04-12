/**
 * Guild Import — restores guild data from a JSON export.
 *
 * Usage:
 *   npx tsx scripts/guild-import.ts <file.json> [--target-guild <newGuildId>] [--channel-map old1:new1,old2:new2] [--dry-run]
 *
 * Requires DATABASE_URL in env (or .env file).
 */

import { PrismaClient } from "@prisma/client";

interface ExportData {
  version: number;
  guild: Record<string, unknown>;
  channelConfigs: Record<string, unknown>[];
  users: Record<string, unknown>[];
  userStats: Record<string, unknown>[];
  userProfiles: Record<string, unknown>[];
  relationshipProfiles: Record<string, unknown>[];
  messages: Record<string, unknown>[];
  channelSummaries: Record<string, unknown>[];
  serverMemories: Record<string, unknown>[];
  userMemoryNotes: Record<string, unknown>[];
  topicSessions: Record<string, unknown>[];
  affinitySignals: Record<string, unknown>[];
}

function parseChannelMap(raw: string): Map<string, string> {
  const map = new Map<string, string>();

  for (const pair of raw.split(",")) {
    const [oldId, newId] = pair.split(":");
    if (oldId && newId) map.set(oldId.trim(), newId.trim());
  }

  return map;
}

function remapChannel(channelId: string, channelMap: Map<string, string>): string {
  return channelMap.get(channelId) ?? channelId;
}

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find((a) => !a.startsWith("--"));

  if (!filePath) {
    console.error("Usage: npx tsx scripts/guild-import.ts <file.json> [--target-guild <id>] [--channel-map old:new,...] [--dry-run]");
    process.exit(1);
  }

  const dryRun = args.includes("--dry-run");
  const targetIdx = args.indexOf("--target-guild");
  const targetGuildId = targetIdx !== -1 ? args[targetIdx + 1] : null;
  const channelMapIdx = args.indexOf("--channel-map");
  const channelMap = channelMapIdx !== -1 ? parseChannelMap(args[channelMapIdx + 1]) : new Map<string, string>();

  const { readFileSync } = await import("node:fs");
  const raw = readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw) as ExportData;

  if (!data.version || !data.guild) {
    console.error("Invalid export file — missing version or guild");
    process.exit(1);
  }

  const sourceGuildId = data.guild.id as string;
  const guildId = targetGuildId ?? sourceGuildId;

  console.log(`Importing guild data`);
  console.log(`  Source guild: ${sourceGuildId}`);
  console.log(`  Target guild: ${guildId}`);
  console.log(`  Channel map: ${channelMap.size > 0 ? [...channelMap.entries()].map(([a, b]) => `${a}->${b}`).join(", ") : "none"}`);
  console.log(`  Dry run: ${dryRun}`);
  console.log();

  const counts = {
    users: data.users?.length ?? 0,
    channelConfigs: data.channelConfigs?.length ?? 0,
    messages: data.messages?.length ?? 0,
    userStats: data.userStats?.length ?? 0,
    userProfiles: data.userProfiles?.length ?? 0,
    relationships: data.relationshipProfiles?.length ?? 0,
    summaries: data.channelSummaries?.length ?? 0,
    serverMemories: data.serverMemories?.length ?? 0,
    userMemoryNotes: data.userMemoryNotes?.length ?? 0,
    topicSessions: data.topicSessions?.length ?? 0,
    affinitySignals: data.affinitySignals?.length ?? 0,
  };

  console.log("Will import:");
  for (const [key, count] of Object.entries(counts)) {
    console.log(`  ${key}: ${count}`);
  }

  if (dryRun) {
    console.log("\n[dry-run] No changes made.");
    return;
  }

  const prisma = new PrismaClient();

  try {
    // 1. Guild
    const guildPayload = { ...data.guild } as Record<string, unknown>;
    delete guildPayload.createdAt;
    delete guildPayload.updatedAt;
    guildPayload.id = guildId;

    await prisma.guild.upsert({
      where: { id: guildId },
      update: guildPayload,
      create: guildPayload as never,
    });
    console.log("✓ Guild");

    // 2. Users
    for (const user of (data.users ?? [])) {
      const u = { ...user } as Record<string, unknown>;
      delete u.createdAt;
      delete u.updatedAt;
      await prisma.user.upsert({
        where: { id: u.id as string },
        update: { username: u.username as string | null, globalName: u.globalName as string | null },
        create: { id: u.id as string, username: u.username as string | null, globalName: u.globalName as string | null, isBot: (u.isBot as boolean) ?? false },
      });
    }
    console.log(`✓ Users: ${counts.users}`);

    // 3. Channel configs
    for (const cc of (data.channelConfigs ?? [])) {
      const channelId = remapChannel(cc.channelId as string, channelMap);
      await prisma.channelConfig.upsert({
        where: { guildId_channelId: { guildId, channelId } },
        update: {
          channelName: cc.channelName as string | null,
          allowBotReplies: cc.allowBotReplies as boolean,
          allowInterjections: cc.allowInterjections as boolean,
          isMuted: cc.isMuted as boolean,
          topicInterestTags: cc.topicInterestTags as string[],
          responseLengthOverride: cc.responseLengthOverride as string | null,
        },
        create: {
          guildId,
          channelId,
          channelName: cc.channelName as string | null,
          allowBotReplies: (cc.allowBotReplies as boolean) ?? true,
          allowInterjections: (cc.allowInterjections as boolean) ?? false,
          isMuted: (cc.isMuted as boolean) ?? false,
          topicInterestTags: (cc.topicInterestTags as string[]) ?? [],
          responseLengthOverride: cc.responseLengthOverride as string | null,
        },
      });
    }
    console.log(`✓ Channel configs: ${counts.channelConfigs}`);

    // 4. Messages
    let msgImported = 0;
    let msgSkipped = 0;

    for (const msg of (data.messages ?? [])) {
      const channelId = remapChannel(msg.channelId as string, channelMap);
      const msgId = guildId !== sourceGuildId
        ? `migrated:${guildId}:${(msg.id as string).replace(/^(import:|migrated:\w+:)/, "")}`
        : msg.id as string;

      const exists = await prisma.message.findUnique({ where: { id: msgId }, select: { id: true } });
      if (exists) { msgSkipped++; continue; }

      try {
        await prisma.message.create({
          data: {
            id: msgId,
            guildId,
            channelId,
            userId: msg.userId as string,
            content: msg.content as string,
            createdAt: new Date(msg.createdAt as string),
            charCount: (msg.charCount as number) ?? 0,
            tokenEstimate: (msg.tokenEstimate as number) ?? 0,
            mentionCount: (msg.mentionCount as number) ?? 0,
          },
        });
        msgImported++;
      } catch {
        msgSkipped++;
      }
    }
    console.log(`✓ Messages: ${msgImported} imported, ${msgSkipped} skipped`);

    // 5. Relationship profiles
    for (const rp of (data.relationshipProfiles ?? [])) {
      await prisma.relationshipProfile.upsert({
        where: { guildId_userId: { guildId, userId: rp.userId as string } },
        update: {
          toneBias: rp.toneBias as string,
          roastLevel: rp.roastLevel as number,
          praiseBias: rp.praiseBias as number,
          interruptPriority: rp.interruptPriority as number,
          doNotMock: rp.doNotMock as boolean,
          doNotInitiate: rp.doNotInitiate as boolean,
          protectedTopics: rp.protectedTopics as string[],
          closeness: rp.closeness as number,
          trustLevel: rp.trustLevel as number,
          familiarity: rp.familiarity as number,
          interactionCount: rp.interactionCount as number,
          proactivityPreference: rp.proactivityPreference as number,
          topicBoundaries: rp.topicBoundaries as object | null,
        },
        create: {
          guildId,
          userId: rp.userId as string,
          toneBias: (rp.toneBias as string) ?? "neutral",
          roastLevel: (rp.roastLevel as number) ?? 0,
          praiseBias: (rp.praiseBias as number) ?? 0,
          interruptPriority: (rp.interruptPriority as number) ?? 0,
          doNotMock: (rp.doNotMock as boolean) ?? false,
          doNotInitiate: (rp.doNotInitiate as boolean) ?? false,
          protectedTopics: (rp.protectedTopics as string[]) ?? [],
          closeness: (rp.closeness as number) ?? 0.5,
          trustLevel: (rp.trustLevel as number) ?? 0.5,
          familiarity: (rp.familiarity as number) ?? 0.5,
          interactionCount: (rp.interactionCount as number) ?? 0,
          proactivityPreference: (rp.proactivityPreference as number) ?? 0.5,
          topicBoundaries: rp.topicBoundaries as object | null,
        },
      });
    }
    console.log(`✓ Relationships: ${counts.relationships}`);

    // 6. Server memories
    for (const sm of (data.serverMemories ?? [])) {
      await prisma.serverMemory.upsert({
        where: { guildId_key: { guildId, key: sm.key as string } },
        update: {
          value: sm.value as string,
          type: sm.type as string,
          source: sm.source as string | null,
        },
        create: {
          guildId,
          key: sm.key as string,
          value: sm.value as string,
          type: sm.type as string,
          source: sm.source as string | null,
          createdBy: sm.createdBy as string | null,
        },
      });
    }
    console.log(`✓ Server memories: ${counts.serverMemories}`);

    // 7. User memory notes
    for (const um of (data.userMemoryNotes ?? [])) {
      await prisma.userMemoryNote.upsert({
        where: { guildId_userId_key: { guildId, userId: um.userId as string, key: um.key as string } },
        update: { value: um.value as string, active: (um.active as boolean) ?? true },
        create: {
          guildId,
          userId: um.userId as string,
          key: um.key as string,
          value: um.value as string,
          source: um.source as string | null,
          createdBy: um.createdBy as string | null,
          active: (um.active as boolean) ?? true,
        },
      });
    }
    console.log(`✓ User memory notes: ${counts.userMemoryNotes}`);

    console.log("\n✅ Import complete!");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
