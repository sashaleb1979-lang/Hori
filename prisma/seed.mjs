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
    { key: "roast", enabled: true }
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
