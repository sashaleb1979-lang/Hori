/**
 * Guild Export — dumps all guild-related data to JSON.
 *
 * Usage:
 *   npx tsx scripts/guild-export.ts <guildId> [--out <path>]
 *
 * Requires DATABASE_URL in env (or .env file).
 */

import { PrismaClient } from "@prisma/client";

async function main() {
  const args = process.argv.slice(2);
  const guildId = args.find((a) => !a.startsWith("--"));

  if (!guildId) {
    console.error("Usage: npx tsx scripts/guild-export.ts <guildId> [--out <path>]");
    process.exit(1);
  }

  const outIdx = args.indexOf("--out");
  const outPath = outIdx !== -1 ? args[outIdx + 1] : `guild-export-${guildId}.json`;

  const prisma = new PrismaClient();

  try {
    const guild = await prisma.guild.findUnique({ where: { id: guildId } });

    if (!guild) {
      console.error(`Guild ${guildId} not found`);
      process.exit(1);
    }

    console.log(`Exporting guild ${guildId}...`);

    const [
      channelConfigs,
      messages,
      userStats,
      userProfiles,
      relationshipProfiles,
      channelSummaries,
      serverMemories,
      userMemoryNotes,
      topicSessions,
      affinitySignals,
    ] = await Promise.all([
      prisma.channelConfig.findMany({ where: { guildId } }),
      prisma.message.findMany({ where: { guildId }, orderBy: { createdAt: "asc" } }),
      prisma.userStats.findMany({ where: { guildId } }),
      prisma.userProfile.findMany({ where: { guildId } }),
      prisma.relationshipProfile.findMany({ where: { guildId } }),
      prisma.channelSummary.findMany({ where: { guildId } }),
      prisma.serverMemory.findMany({ where: { guildId } }),
      prisma.userMemoryNote.findMany({ where: { guildId } }),
      prisma.topicSession.findMany({ where: { guildId } }),
      prisma.affinitySignal.findMany({ where: { guildId } }),
    ]);

    const userIds = new Set<string>();
    for (const m of messages) userIds.add(m.userId);
    for (const s of userStats) userIds.add(s.userId);
    for (const p of userProfiles) userIds.add(p.userId);
    for (const r of relationshipProfiles) userIds.add(r.userId);

    const users = await prisma.user.findMany({
      where: { id: { in: [...userIds] } },
    });

    const exportData = {
      exportedAt: new Date().toISOString(),
      version: 1,
      guild,
      channelConfigs,
      users,
      userStats,
      userProfiles,
      relationshipProfiles,
      messages,
      channelSummaries,
      serverMemories,
      userMemoryNotes,
      topicSessions,
      affinitySignals,
    };

    const { writeFileSync } = await import("node:fs");
    writeFileSync(outPath, JSON.stringify(exportData, null, 2), "utf-8");

    console.log(`Exported to ${outPath}`);
    console.log(`  Guild settings: 1`);
    console.log(`  Channel configs: ${channelConfigs.length}`);
    console.log(`  Users: ${users.length}`);
    console.log(`  Messages: ${messages.length}`);
    console.log(`  User stats: ${userStats.length}`);
    console.log(`  User profiles: ${userProfiles.length}`);
    console.log(`  Relationships: ${relationshipProfiles.length}`);
    console.log(`  Summaries: ${channelSummaries.length}`);
    console.log(`  Server memories: ${serverMemories.length}`);
    console.log(`  User memory notes: ${userMemoryNotes.length}`);
    console.log(`  Topic sessions: ${topicSessions.length}`);
    console.log(`  Affinity signals: ${affinitySignals.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
