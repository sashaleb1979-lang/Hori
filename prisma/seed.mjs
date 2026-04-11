import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL && process.env.DB_URL) {
  process.env.DATABASE_URL = process.env.DB_URL;
}

const prisma = new PrismaClient();

async function main() {
  const globalFlags = [
    { key: "web_search", enabled: true },
    { key: "auto_interject", enabled: false },
    { key: "user_profiles", enabled: true },
    { key: "context_actions", enabled: true },
    { key: "roast", enabled: true },
    { key: "channel_aware_mode", enabled: true },
    { key: "message_kind_aware_mode", enabled: true },
    { key: "anti_slop_strict_mode", enabled: true },
    { key: "playful_mode_enabled", enabled: true },
    { key: "irritated_mode_enabled", enabled: true },
    { key: "ideological_flavour_enabled", enabled: true },
    { key: "analogy_ban_enabled", enabled: true },
    { key: "slang_layer_enabled", enabled: true },
    { key: "self_interjection_constraints_enabled", enabled: true }
  ];

  for (const flag of globalFlags) {
    await prisma.featureFlag.upsert({
      where: {
        scope_scopeId_key: {
          scope: "global",
          scopeId: "global",
          key: flag.key
        }
      },
      update: {
        enabled: flag.enabled
      },
      create: {
        scope: "global",
        scopeId: "global",
        key: flag.key,
        enabled: flag.enabled
      }
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
