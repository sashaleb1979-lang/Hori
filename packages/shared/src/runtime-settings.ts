import type { AppLogger } from "./logger";
import type { AppPrismaClient } from "./prisma";
import { asErrorMessage } from "./utils";

export const OLLAMA_BASE_URL_SETTING_KEY = "OLLAMA_BASE_URL";
export const OWNER_LOCKDOWN_SETTING_KEY = "OWNER_LOCKDOWN";

export interface OwnerLockdownState {
  enabled: boolean;
  updatedBy?: string | null;
  updatedAt?: Date | null;
}

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

export async function loadOwnerLockdownState(prisma: AppPrismaClient, logger?: AppLogger): Promise<OwnerLockdownState> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ value: string; updatedBy: string | null; updatedAt: Date | null }>>(
      'SELECT "value", "updatedBy", "updatedAt" FROM "RuntimeSetting" WHERE "key" = $1 LIMIT 1',
      OWNER_LOCKDOWN_SETTING_KEY
    );
    const row = rows[0];

    if (!row) {
      return { enabled: false };
    }

    return {
      enabled: parseOwnerLockdownValue(row.value),
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt
    };
  } catch (error) {
    logger?.warn({ error: asErrorMessage(error) }, "failed to load owner lockdown state");
    return { enabled: false };
  }
}

export async function persistOwnerLockdownState(prisma: AppPrismaClient, enabled: boolean, updatedBy?: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    'INSERT INTO "RuntimeSetting" ("key", "value", "updatedBy") VALUES ($1, $2, $3) ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = CURRENT_TIMESTAMP',
    OWNER_LOCKDOWN_SETTING_KEY,
    enabled ? "true" : "false",
    updatedBy ?? null
  );
}

export function shouldAutoSyncOllamaBaseUrl(raw: NodeJS.ProcessEnv = process.env) {
  return !raw.OLLAMA_BASE_URL && !raw.AI_URL;
}

export function startOllamaBaseUrlSync(options: {
  env: { OLLAMA_BASE_URL?: string };
  prisma: AppPrismaClient;
  logger: AppLogger;
  intervalMs?: number;
}) {
  const intervalMs = options.intervalMs ?? 15000;

  const timer = setInterval(async () => {
    const persistedUrl = await loadPersistedOllamaBaseUrl(options.prisma, options.logger);

    if (!persistedUrl || persistedUrl === options.env.OLLAMA_BASE_URL) {
      return;
    }

    options.env.OLLAMA_BASE_URL = persistedUrl;
    options.logger.info({ url: persistedUrl }, "updated ollama url from runtime settings");
  }, intervalMs);

  timer.unref?.();
  return timer;
}

function parseOwnerLockdownValue(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "on" || normalized === "enabled";
}
