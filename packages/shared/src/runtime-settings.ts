import type { AppLogger } from "./logger";
import type { AppPrismaClient } from "./prisma";
import { asErrorMessage } from "./utils";

export const OLLAMA_BASE_URL_SETTING_KEY = "OLLAMA_BASE_URL";

export async function loadPersistedOllamaBaseUrl(prisma: AppPrismaClient, logger?: AppLogger): Promise<string | undefined> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ value: string }>>(
      'SELECT "value" FROM "RuntimeSetting" WHERE "key" = $1 LIMIT 1',
      OLLAMA_BASE_URL_SETTING_KEY
    );
    const value = rows[0]?.value?.trim();

    if (value) {
      logger?.info({ url: value }, "loaded persisted ollama url");
      return value;
    }
  } catch (error) {
    logger?.warn({ error: asErrorMessage(error) }, "failed to load persisted ollama url");
  }

  return undefined;
}

export async function persistOllamaBaseUrl(prisma: AppPrismaClient, url: string, updatedBy?: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    'INSERT INTO "RuntimeSetting" ("key", "value", "updatedBy") VALUES ($1, $2, $3) ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = CURRENT_TIMESTAMP',
    OLLAMA_BASE_URL_SETTING_KEY,
    url,
    updatedBy ?? null
  );
}